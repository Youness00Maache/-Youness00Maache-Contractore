/**
 * "Export everything": builds the ZIP (see paths.ts for the layout). No DOM and no network of its own: the data comes
 * from an ExportSource and the PDFs from `renderPdf`, so scripts/export-check.ts runs the real thing on fake data.
 *
 *   1. jobs (kept: names + PDF folders), clients → csv/clients.csv
 *   2. documents, `docPageSize` at a time → documents / line_items / payments / time_sheets / expense_logs CSVs and
 *      data/documents.jsonl, written while reading (only the id + PDF path of each document is kept)
 *   3. jobs.csv (with document counts), inventory, stock history, price book, reminders log, quote requests
 *   4. README.txt
 *   5. PDFs (full export only): `pdfBatchSize` documents are loaded again by id, rendered one at a time, added to the ZIP
 *      and dropped. A PDF that fails is listed in errors.txt and the export goes on.
 */
import {
    CSV_ORDER, CSV_TABLES, addToJobStats, categoryPaths, clientCsvRow, describeDocument, documentCsvRow, documentJsonLine, expenseRow,
    historyCsvRow, inventoryCsvRow, invoicePaymentEntries, invoicePaymentRow, jobCsvRow, lineItemRows, paymentsWithoutReceipt, priceBookCsvRow,
    quoteRequestCsvRow, receiptPaymentRow, reminderCsvRow, timeSheetRow,
    type CsvKey, type ExportDocRow, type ExportJobRow, type InvoicePaymentEntry, type JobInfo, type JobStats,
} from './model.ts';
import { CSV_BOM, csvLine, type CsvValue } from './csv.ts';
import { DOCUMENTS_JSONL_PATH, ERRORS_PATH, EXPORT_DIRS, FolderLayout, README_PATH, exportArchiveName } from './paths.ts';
import { MissingTableError, type ExportSource, type ExportTable, type ExportTables } from './source.ts';
import { PartedZipWriter, type TextFileWriter, type ZipPart } from './zipWriter.ts';

export type ExportMode = 'full' | 'csv';

export interface ExportProgress {
    phase: 'preparing' | 'data' | 'pdfs' | 'finishing';
    /** "Reading documents", "Creating PDFs" … */
    label: string;
    done: number;
    total: number;
    /** whole export, 0–100 */
    percent: number;
}

export interface RunExportOptions {
    source: ExportSource;
    mode: ExportMode;
    /** One document → PDF bytes (required for the full export). */
    renderPdf?: (doc: ExportDocRow, job: ExportJobRow | null) => Promise<Uint8Array>;
    now?: Date;
    account?: { name?: string; company?: string; email?: string };
    maxPartBytes?: number;
    flushBytes?: number;
    /** documents read per request in step 2 (default 100) */
    docPageSize?: number;
    /** documents loaded per request for the PDFs (default 20) */
    pdfBatchSize?: number;
    /** rows per request for the other tables (default 500) */
    tablePageSize?: number;
    /** a PDF taking longer than this is skipped (default 2 minutes) */
    pdfTimeoutMs?: number;
    onProgress?: (p: ExportProgress) => void;
    onPart?: (part: ZipPart) => void;
    isCancelled?: () => boolean;
    /** lets the page breathe between PDFs */
    yieldToUi?: () => Promise<void>;
}

export interface RunExportResult {
    parts: ZipPart[];
    counts: Record<CsvKey, number>;
    documents: number;
    pdfs: { planned: number; done: number; failed: number };
    /** e.g. "Reminders log: not available on this account yet" */
    warnings: string[];
    /** one line per PDF that couldn't be created */
    failures: string[];
    bytes: number;
}

export class ExportCancelledError extends Error {
    constructor() { super('Export cancelled'); this.name = 'ExportCancelledError'; }
}

/** "data:application/pdf;…;base64,JVBERi0…" → bytes (what services/pdfGenerator.ts returns in getBlob mode). */
export const dataUriToBytes = (uri: string): Uint8Array => {
    const comma = uri.indexOf(',');
    const meta = comma >= 0 ? uri.slice(0, comma) : '';
    const body = comma >= 0 ? uri.slice(comma + 1) : uri;
    if (comma >= 0 && !/;base64$/i.test(meta)) return new TextEncoder().encode(decodeURIComponent(body));
    const bin = atob(body.replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> => new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)} s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

const TABLE_LABELS: Partial<Record<CsvKey, string>> = {
    inventory: 'Inventory', inventory_history: 'Stock history', price_book: 'Price book', reminders_log: 'Reminders log', quote_requests: 'Quote requests',
};

const pad = (s: string, n: number) => (s.length >= n ? `${s} ` : s + ' '.repeat(n - s.length));
const localStamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** README.txt at the top of the ZIP. */
export const buildReadme = (o: {
    now: Date; mode: ExportMode; account?: RunExportOptions['account']; counts: Record<CsvKey, number>; documents: number; pdfsPlanned: number; warnings: string[];
}): string => {
    const who = [o.account?.name, o.account?.company && o.account.company !== o.account?.name ? `(${o.account.company})` : '', o.account?.email ? `<${o.account.email}>` : '']
        .filter(Boolean).join(' ');
    const L: string[] = [
        'ContractorDocs export',
        '=====================',
        who ? `Account:  ${who}` : '',
        `Created:  ${localStamp(o.now)} (your local time)`,
        `Contents: ${o.mode === 'full' ? 'PDFs of every document + spreadsheets' : 'spreadsheets only (no PDFs)'}`,
        '',
        'What is inside',
        '--------------',
        `${EXPORT_DIRS.csv}/  one spreadsheet per list. Opens in Excel, Google Sheets, Numbers and LibreOffice.`,
        ...CSV_ORDER.map((k) => `  ${pad(CSV_TABLES[k].file, 22)}${pad(`${o.counts[k]} row${o.counts[k] === 1 ? '' : 's'}`, 12)}${CSV_TABLES[k].about}`),
        `${DOCUMENTS_JSONL_PATH}  all ${o.documents} documents exactly as saved, one JSON object per line (complete backup, every field).`,
        o.mode === 'full'
            ? `${EXPORT_DIRS.jobs}/  a PDF of every document (${o.pdfsPlanned}), one folder per job. jobs.csv shows each job's folder, documents.csv each document's PDF.`
            : `${EXPORT_DIRS.jobs}/  not included: choose "PDFs + spreadsheets" in Settings → Your data for the PDFs.`,
        o.mode === 'full' ? `${ERRORS_PATH}  only there if some PDFs could not be created; it lists them so you can download them from the app.` : '',
        o.mode === 'full' ? 'Very large exports are split into several ZIP files (…-part1.zip, …-part2.zip). The spreadsheets are in part 1; the PDFs continue in the next parts.' : '',
        '',
        'About the spreadsheets',
        '----------------------',
        '- UTF-8, comma separated; the first row has the column names.',
        '- Money is a plain number with 2 decimals and no currency sign (1234.50).',
        '- Business dates are YYYY-MM-DD. "Created", "Last changed" and other time stamps are in UTC.',
        '- Text starting with = + - or @ gets a leading apostrophe so a spreadsheet never runs it as a formula.',
        '- Client-portal keys and approval links are not included: they are access keys, not data.',
        ...(o.warnings.length ? ['', 'Notes', '-----', ...o.warnings.map((w) => `- ${w}`)] : []),
        '',
        'Your data is yours. This export is available on every plan, Free included, and stays available after you cancel.',
        '',
    ];
    return L.filter((l, i) => l !== '' || L[i - 1] !== '').join('\r\n');
};

export async function runExport(opts: RunExportOptions): Promise<RunExportResult> {
    const now = opts.now ?? new Date();
    const mode = opts.mode;
    if (mode === 'full' && !opts.renderPdf) throw new Error('renderPdf is required for a full export');
    const docPageSize = Math.max(1, opts.docPageSize ?? 100);
    const pdfBatchSize = Math.max(1, opts.pdfBatchSize ?? 20);
    const tablePageSize = Math.max(1, opts.tablePageSize ?? 500);
    const pdfTimeoutMs = opts.pdfTimeoutMs ?? 120_000;
    const src = opts.source;
    const cancelled = () => { if (opts.isCancelled?.()) throw new ExportCancelledError(); };

    const counts = Object.fromEntries(CSV_ORDER.map((k) => [k, 0])) as Record<CsvKey, number>;
    const warnings: string[] = [];
    const failures: string[] = [];
    // overall percent: the data phase is a small slice of a full export (PDFs take the time)
    const dataShare = mode === 'full' ? 12 : 95;
    let docTotal = 0;
    const report = (phase: ExportProgress['phase'], label: string, done: number, total: number) => {
        const frac = total > 0 ? Math.min(1, done / total) : 0;
        const percent = phase === 'preparing' ? 0
            : phase === 'data' ? frac * dataShare
                : phase === 'pdfs' ? dataShare + frac * (98 - dataShare)
                    : 98;
        opts.onProgress?.({ phase, label, done, total, percent: Math.round(percent * 10) / 10 });
    };

    report('preparing', 'Getting ready', 0, 0);
    docTotal = (await src.countDocuments()) ?? 0;
    cancelled();

    const zip = new PartedZipWriter({
        maxPartBytes: opts.maxPartBytes,
        flushBytes: opts.flushBytes,
        mtime: now,
        partName: (part) => exportArchiveName(now, part, mode),
        onPart: (part) => opts.onPart?.(part),
        partPreamble: (part) => ({
            path: README_PATH,
            text: `ContractorDocs export of ${localStamp(now)}, part ${part}.\r\nThis part holds more PDFs (${EXPORT_DIRS.jobs}/, one folder per job). The spreadsheets and the main README are in part 1.\r\n`,
        }),
    });

    const openCsv = (key: CsvKey): TextFileWriter & { row: (v: CsvValue[]) => void } => {
        const f = zip.openTextFile(`${EXPORT_DIRS.csv}/${CSV_TABLES[key].file}`);
        f.write(CSV_BOM + csvLine(CSV_TABLES[key].header));
        return Object.assign(f, { row: (v: CsvValue[]) => { f.write(csvLine(v)); counts[key]++; } });
    };

    /** A whole table into one CSV; a table the database doesn't have yet gives a header-only CSV and a note. */
    const tableToCsv = async <T extends ExportTable>(table: T, key: CsvKey, toRow: (r: ExportTables[T]) => CsvValue[]) => {
        const csv = openCsv(key);
        try {
            for await (const page of src.pages(table, tablePageSize)) {
                cancelled();
                for (const r of page) csv.row(toRow(r));
            }
        } catch (e) {
            if (!(e instanceof MissingTableError)) throw e;
            warnings.push(`${TABLE_LABELS[key] || CSV_TABLES[key].file}: not available on this account yet, so ${CSV_TABLES[key].file} only has its column names.`);
        } finally {
            csv.close();
        }
    };

    try {
        // ---- 1. jobs (kept for names and folders) + clients
        report('data', 'Reading jobs and clients', 0, docTotal);
        const layout = new FolderLayout();
        const jobs: ExportJobRow[] = [];
        const jobInfo = new Map<string, JobInfo>();
        for await (const page of src.pages('jobs', tablePageSize)) {
            cancelled();
            for (const j of page) {
                jobs.push(j);
                jobInfo.set(j.id, { name: String(j.name || '').trim(), clientName: String(j.client_name || '').trim(), folder: layout.addJob(j) });
            }
        }
        const jobById = new Map(jobs.map((j) => [j.id, j]));
        await tableToCsv('clients', 'clients', clientCsvRow);

        // ---- 2. documents (one pass, every document CSV written while reading). A ZIP holds one file after another, so
        // the files opened after the first wait (compressed) in memory until it is closed: the big JSON backup goes
        // first and streams straight through; the CSVs behind it are small once compressed.
        const jsonl = zip.openTextFile(DOCUMENTS_JSONL_PATH);
        const docsCsv = openCsv('documents');
        const linesCsv = openCsv('line_items');
        const payCsv = openCsv('payments');
        const timeCsv = openCsv('time_sheets');
        const expCsv = openCsv('expense_logs');
        const stats = new Map<string, JobStats>();
        const receiptIds = new Set<string>();
        const invoicePayments: InvoicePaymentEntry[] = [];
        /** what the PDF step needs: id, job, path (never the document data) */
        const manifest: Array<{ id: string; jobId: string | null; path: string; label: string }> = [];
        let documents = 0;
        for await (const page of src.documentPages(docPageSize)) {
            cancelled();
            for (const doc of page) {
                const job = doc.job_id ? jobInfo.get(doc.job_id) || null : null;
                const info = describeDocument(doc);
                const pdfPath = mode === 'full' ? layout.pdfPathFor({ id: doc.id, jobId: job ? doc.job_id : null, ...info }) : '';
                if (mode === 'full') manifest.push({ id: doc.id, jobId: job ? doc.job_id ?? null : null, path: pdfPath, label: `${info.type}${info.number ? ` ${info.number}` : ''}` });
                const ctx = { job, pdfPath };
                docsCsv.row(documentCsvRow(doc, ctx));
                for (const line of lineItemRows(doc, ctx)) linesCsv.row(line);
                if (info.type === 'Receipt') { payCsv.row(receiptPaymentRow(doc, ctx)); receiptIds.add(doc.id); }
                if (info.type === 'Invoice') invoicePayments.push(...invoicePaymentEntries(doc, ctx));
                if (info.type === 'Time Sheet') timeCsv.row(timeSheetRow(doc, ctx));
                if (info.type === 'Expense Log') expCsv.row(expenseRow(doc, ctx));
                jsonl.write(documentJsonLine(doc));
                addToJobStats(stats, doc);
                documents++;
            }
            report('data', 'Reading documents', documents, Math.max(docTotal, documents));
        }
        for (const p of paymentsWithoutReceipt(invoicePayments, receiptIds)) payCsv.row(invoicePaymentRow(p));
        for (const f of [jsonl, docsCsv, linesCsv, payCsv, timeCsv, expCsv]) f.close();

        // ---- 3. the other lists
        report('data', 'Reading inventory and price book', documents, Math.max(docTotal, documents));
        const jobsCsv = openCsv('jobs');
        for (const j of jobs) jobsCsv.row(jobCsvRow(j, mode === 'full' ? jobInfo.get(j.id)!.folder : '', stats.get(j.id)));
        jobsCsv.close();
        const jobName = (id?: string | null) => (id ? jobInfo.get(id)?.name || '' : '');
        await tableToCsv('inventory', 'inventory', inventoryCsvRow);
        await tableToCsv('inventory_history', 'inventory_history', (h) => historyCsvRow(h, jobName(h.job_id)));
        const categories: ExportTables['price_book_categories'][] = [];
        try {
            for await (const page of src.pages('price_book_categories', tablePageSize)) categories.push(...page);
        } catch (e) {
            if (!(e instanceof MissingTableError)) throw e;
        }
        const categoryName = categoryPaths(categories);
        await tableToCsv('saved_items', 'price_book', (it) => priceBookCsvRow(it, it.category_id ? categoryName.get(it.category_id) || '' : ''));
        await tableToCsv('reminders', 'reminders_log', (r) => reminderCsvRow(r, jobName(r.job_id)));
        await tableToCsv('quote_requests', 'quote_requests', (q) => quoteRequestCsvRow(q, jobName(q.job_id)));
        cancelled();

        // ---- 4. README
        zip.addText(README_PATH, buildReadme({ now, mode, account: opts.account, counts, documents, pdfsPlanned: manifest.length, warnings }));
        report('data', 'Spreadsheets done', 1, 1);

        // ---- 5. PDFs
        let pdfDone = 0;
        let pdfFailed = 0;
        if (mode === 'full') {
            for (let i = 0; i < manifest.length; i += pdfBatchSize) {
                cancelled();
                const batch = manifest.slice(i, i + pdfBatchSize);
                const loaded = new Map((await src.documentsByIds(batch.map((m) => m.id))).map((d) => [d.id, d]));
                for (const item of batch) {
                    cancelled();
                    report('pdfs', `Creating PDFs: ${item.label}`, pdfDone + pdfFailed, manifest.length);
                    const doc = loaded.get(item.id);
                    try {
                        if (!doc) throw new Error('the document was deleted during the export');
                        const bytes = await withTimeout(opts.renderPdf!(doc, item.jobId ? jobById.get(item.jobId) || null : null), pdfTimeoutMs, 'Creating the PDF');
                        if (!bytes || !bytes.length) throw new Error('the PDF came out empty');
                        await zip.addBinary(item.path, bytes);
                        pdfDone++;
                    } catch (e) {
                        if (e instanceof ExportCancelledError) throw e;
                        pdfFailed++;
                        failures.push(`${item.path}  (${item.label}): ${(e as Error)?.message || 'unknown error'}`);
                    }
                    loaded.delete(item.id);
                    if (opts.yieldToUi) await opts.yieldToUi();
                }
            }
            report('pdfs', 'PDFs done', manifest.length, manifest.length);
            if (failures.length) {
                zip.addText(ERRORS_PATH, [
                    `${failures.length} PDF${failures.length === 1 ? '' : 's'} could not be created. Their data is in the spreadsheets and data/documents.jsonl;`,
                    'open each one in ContractorDocs to download its PDF.',
                    '',
                    ...failures,
                    '',
                ].join('\r\n'));
            }
        }

        // ---- 6. done
        cancelled();
        report('finishing', 'Finishing the ZIP', 0, 1);
        const parts = await zip.finish();
        return {
            parts, counts, documents, warnings, failures,
            pdfs: { planned: manifest.length, done: pdfDone, failed: pdfFailed },
            bytes: parts.reduce((s, p) => s + p.size, 0),
        };
    } catch (e) {
        zip.abort();
        throw e;
    }
}
