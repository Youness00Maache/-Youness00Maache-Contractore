/**
 * Streaming ZIP writer for "Export everything", on fflate's streaming `Zip` (the only ZIP library in the app).
 *
 * Memory stays flat on big accounts:
 *   - files are streamed into the archive as they are made (a PDF is added and dropped, CSV text is compressed in
 *     64 KB pieces), the archive never exists as one big array;
 *   - the compressed output is moved into Blob pieces every `flushBytes` (8 MB). Browsers keep Blob data outside the
 *     JavaScript heap and page large Blobs to disk;
 *   - the archive is split into parts of at most `maxPartBytes` (1 GB). A streamed ZIP without ZIP64 is limited to
 *     4 GB, and one smaller file is easier to download on a phone. A new part only starts between two files, and only
 *     when no text file is still open.
 *
 * Text files are compressed (deflate); PDFs are stored as they are (already compressed, so deflating them again
 * would only cost time).
 */
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';

export interface ZipPart {
    /** 1-based */
    index: number;
    name: string;
    blob: Blob;
    size: number;
    files: number;
}

export interface ZipWriterOptions {
    /** start a new part when the next file would make this one bigger (default 1 GB) */
    maxPartBytes?: number;
    /** move output into a Blob every N bytes (default 8 MB) */
    flushBytes?: number;
    /** modification date stored in the archive (default now) */
    mtime?: Date;
    /** part file name: `part` is undefined when the export fits in one file */
    partName: (part?: number) => string;
    /** called when a part is complete (the export can offer it right away) */
    onPart?: (part: ZipPart) => void;
    /** a small text file written first in parts 2, 3 … (e.g. a README saying where the rest is) */
    partPreamble?: (part: number) => { path: string; text: string } | null;
}

const TEXT_CHUNK = 64 * 1024;
/** ZIP bookkeeping per file: local header (30) + data descriptor (16) before the data; central entry (46) at the end. */
const LOCAL_OVERHEAD = 30 + 16;
const CENTRAL_ENTRY = 46;
const END_RECORD = 22;
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** A text file being written into the archive piece by piece. */
export interface TextFileWriter {
    write(text: string): void;
    close(): void;
    readonly bytes: number;
}

export class PartedZipWriter {
    private readonly opts: Required<Omit<ZipWriterOptions, 'onPart' | 'partPreamble'>> & Pick<ZipWriterOptions, 'onPart' | 'partPreamble'>;
    private zip!: Zip;
    private pending: Uint8Array[] = [];
    private pendingBytes = 0;
    private blobs: Blob[] = [];
    private partBytes = 0;
    /** size of the central directory the current part will end with (written only when the part is finished) */
    private partDirectoryBytes = 0;
    private partFiles = 0;
    private openText = 0;
    private partDone: Promise<Blob> | null = null;
    private resolvePart: ((b: Blob) => void) | null = null;
    private rejectPart: ((e: Error) => void) | null = null;
    private failure: Error | null = null;
    private finished = false;
    readonly parts: ZipPart[] = [];
    /** total bytes of all parts written so far */
    totalBytes = 0;

    constructor(options: ZipWriterOptions) {
        this.opts = {
            maxPartBytes: options.maxPartBytes ?? 1024 * 1024 * 1024,
            flushBytes: options.flushBytes ?? 8 * 1024 * 1024,
            mtime: options.mtime ?? new Date(),
            partName: options.partName,
            onPart: options.onPart,
            partPreamble: options.partPreamble,
        };
        this.startPart();
    }

    private startPart() {
        this.pending = [];
        this.pendingBytes = 0;
        this.blobs = [];
        this.partBytes = 0;
        this.partDirectoryBytes = END_RECORD;
        this.partFiles = 0;
        this.partDone = new Promise<Blob>((resolve, reject) => { this.resolvePart = resolve; this.rejectPart = reject; });
        // the promise is awaited in finishPart(); avoid an unhandled rejection if the export is cancelled first
        this.partDone.catch(() => { /* reported by finishPart / check */ });
        this.zip = new Zip((err, chunk, final) => {
            if (err) {
                this.failure = err instanceof Error ? err : new Error(String(err));
                this.rejectPart?.(this.failure);
                return;
            }
            if (chunk && chunk.length) {
                this.pending.push(chunk);
                this.pendingBytes += chunk.length;
                this.partBytes += chunk.length;
                this.totalBytes += chunk.length;
                if (this.pendingBytes >= this.opts.flushBytes) this.spill();
            }
            if (final) {
                this.spill();
                this.resolvePart?.(new Blob(this.blobs as BlobPart[], { type: 'application/zip' }));
                this.blobs = [];
            }
        });
    }

    /** Moves the buffered output into a Blob (outside the JS heap). */
    private spill() {
        if (!this.pending.length) return;
        this.blobs.push(new Blob(this.pending as BlobPart[]));
        this.pending = [];
        this.pendingBytes = 0;
    }

    private check() {
        if (this.failure) throw this.failure;
        if (this.finished) throw new Error('The archive is already finished.');
    }

    private stamp<T extends ZipDeflate | ZipPassThrough>(entry: T): T {
        entry.mtime = this.opts.mtime;
        return entry;
    }

    /** Bytes in the current part so far. */
    get currentPartBytes(): number { return this.partBytes; }

    /** Opens a compressed text file. Write to it in any amount; close() it before the archive is finished. */
    openTextFile(path: string): TextFileWriter {
        this.check();
        const entry = this.stamp(new ZipDeflate(path, { level: 6 }));
        this.zip.add(entry);
        this.partFiles++;
        this.partDirectoryBytes += CENTRAL_ENTRY + utf8Length(path);
        this.openText++;
        let buffer = '';
        let bytes = 0;
        let closed = false;
        const flush = (final: boolean) => {
            const data = buffer ? strToU8(buffer) : new Uint8Array(0);
            bytes += data.length;
            buffer = '';
            entry.push(data, final);
        };
        return {
            write: (text: string) => {
                if (closed) throw new Error(`${path} is already closed.`);
                buffer += text;
                if (buffer.length >= TEXT_CHUNK) flush(false);
            },
            close: () => {
                if (closed) return;
                closed = true;
                flush(true);
                this.openText--;
            },
            get bytes() { return bytes + buffer.length; },
        };
    }

    /** Adds a whole text file. */
    addText(path: string, text: string): void {
        const f = this.openTextFile(path);
        f.write(text);
        f.close();
    }

    /**
     * Adds a file stored without compression (PDFs). Starts a new part first when this file would push the current
     * part over the limit (never for the first file of a part, never while a text file is open).
     */
    async addBinary(path: string, data: Uint8Array): Promise<void> {
        this.check();
        const name = utf8Length(path);
        // what the part would weigh with this file, its central entry and the directory of the files already in it
        const after = this.partBytes + LOCAL_OVERHEAD + name + data.length + this.partDirectoryBytes + CENTRAL_ENTRY + name;
        if (this.partFiles > 0 && this.openText === 0 && after > this.opts.maxPartBytes) {
            await this.finishPart(false);
            this.startPart();
            const preamble = this.opts.partPreamble?.(this.parts.length + 1);
            if (preamble) this.addText(preamble.path, preamble.text);
        }
        const entry = this.stamp(new ZipPassThrough(path));
        this.zip.add(entry);
        this.partFiles++;
        this.partDirectoryBytes += CENTRAL_ENTRY + name;
        entry.push(data, true);
        this.check();
    }

    private async finishPart(last: boolean): Promise<ZipPart> {
        this.zip.end();
        const blob = await this.partDone!;
        const index = this.parts.length + 1;
        const part: ZipPart = {
            index,
            // one file → no "part" in the name; the first part of several is named when the second one starts
            name: this.opts.partName(last && index === 1 ? undefined : index),
            blob,
            size: blob.size,
            files: this.partFiles,
        };
        this.parts.push(part);
        this.opts.onPart?.(part);
        return part;
    }

    /** Ends the archive. Every text file must be closed. Returns all parts. */
    async finish(): Promise<ZipPart[]> {
        this.check();
        if (this.openText > 0) throw new Error('A text file in the archive is still open.');
        await this.finishPart(true);
        this.finished = true;
        return this.parts;
    }

    /** Stops writing (cancel). The parts finished so far stay in `parts`. */
    abort(): void {
        this.finished = true;
        try { this.zip.terminate(); } catch { /* already ended */ }
        this.pending = [];
        this.blobs = [];
    }
}
