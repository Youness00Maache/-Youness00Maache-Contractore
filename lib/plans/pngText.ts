/**
 * Plan measurement (roadmap N9): a text (the measurement JSON) carried inside a valid 1×1 PNG, because the private
 * `document-assets` bucket only accepts PDF and image types. Pure (Uint8Array in / out; works in Node and browsers).
 *
 *   encodeTextPng(text)    → PNG bytes with one iTXt chunk (keyword KEYWORD, UTF-8, uncompressed)
 *   decodeTextPng(bytes)   → the text, or null (not a PNG, no chunk, bad CRC)
 *   readStoredText(bytes)  → the text of a measurement file: the PNG's chunk, or plain JSON text (a .measure.json)
 */
export const KEYWORD = 'contractordocs-plan-measure';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

const ascii = (s: string) => Uint8Array.from(s, ch => ch.charCodeAt(0) & 0xff);
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function chunk(type: string, data: Uint8Array): Uint8Array {
    const t = ascii(type);
    const body = new Uint8Array(t.length + data.length);
    body.set(t, 0);
    body.set(data, t.length);
    const out = new Uint8Array(12 + data.length);
    out.set(u32(data.length), 0);
    out.set(body, 4);
    out.set(u32(crc32(body)), 8 + data.length);
    return out;
}

const concat = (parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
};

/** One transparent RGBA pixel: zlib header, one stored deflate block of 5 zero bytes, Adler-32 (0x00050001). */
const IDAT = Uint8Array.from([0x78, 0x01, 0x01, 0x05, 0x00, 0xfa, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x01]);
const IHDR = Uint8Array.from([...u32(1), ...u32(1), 8, 6, 0, 0, 0]);

export function encodeTextPng(text: string): Uint8Array {
    const utf8 = new TextEncoder().encode(String(text ?? ''));
    // iTXt: keyword \0 compression-flag(0) method(0) language-tag \0 translated-keyword \0 text
    const head = concat([ascii(KEYWORD), Uint8Array.from([0, 0, 0, 0, 0])]);
    return concat([Uint8Array.from(SIGNATURE), chunk('IHDR', IHDR), chunk('iTXt', concat([head, utf8])), chunk('IDAT', IDAT), chunk('IEND', new Uint8Array(0))]);
}

export function decodeTextPng(bytes: Uint8Array | null | undefined): string | null {
    if (!bytes || bytes.length < 8 + 12) return null;
    for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) return null;
    let at = 8;
    while (at + 12 <= bytes.length) {
        const len = ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
        if (at + 12 + len > bytes.length) return null;
        const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
        const body = bytes.subarray(at + 4, at + 8 + len);
        const crc = ((bytes[at + 8 + len] << 24) | (bytes[at + 9 + len] << 16) | (bytes[at + 10 + len] << 8) | bytes[at + 11 + len]) >>> 0;
        if (type === 'iTXt') {
            if (crc32(body) !== crc) return null;
            const data = bytes.subarray(at + 8, at + 8 + len);
            const kwEnd = data.indexOf(0);
            if (kwEnd > 0 && String.fromCharCode(...data.subarray(0, kwEnd)) === KEYWORD) {
                if (data[kwEnd + 1] !== 0) return null; // compressed text: not written by this app
                let p = kwEnd + 3;
                const langEnd = data.indexOf(0, p);
                if (langEnd < 0) return null;
                p = langEnd + 1;
                const transEnd = data.indexOf(0, p);
                if (transEnd < 0) return null;
                try {
                    return new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(transEnd + 1));
                } catch {
                    return null;
                }
            }
        }
        if (type === 'IEND') break;
        at += 12 + len;
    }
    return null;
}

/** A measurement file's text: from the PNG, or the bytes themselves when they are JSON text. */
export function readStoredText(bytes: Uint8Array | null | undefined): string | null {
    if (!bytes || !bytes.length) return null;
    if (bytes[0] === SIGNATURE[0]) return decodeTextPng(bytes);
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
        return text.trim().startsWith('{') ? text : null;
    } catch {
        return null;
    }
}
