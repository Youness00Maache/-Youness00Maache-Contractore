/**
 * Checks for "Export everything" and the bookkeeper CSV (lib/export/*): CSV escaping, money/totals, folder layout,
 * the full ZIP on a fake account (unzipped and read back), big-account batching and part splitting, cancel, and the
 * bookkeeper rows. No network, no browser.
 *   npx tsx scripts/export-check.ts
 */
import { unzipSync, strFromU8 } from 'fflate';
import { CSV_BOM, csvCell, csvLine, money, plainText, qty, toCsv } from '../lib/export/csv.ts';
import {
    CSV_ORDER, CSV_TABLES, categoryPaths, clientCsvRow, documentCsvRow, documentMoney, documentNumberOf, exportTypeLabel, expenseRow, historyCsvRow,
    inventoryCsvRow, invoicePaymentEntries, invoicePaymentRow, jobCsvRow, lineItemRows, paymentsWithoutReceipt, priceBookCsvRow, quoteRequestCsvRow,
    receiptPaymentRow, reminderCsvRow, timeSheetRow,
    type ExportDocRow, type ExportJobRow,
} from '../lib/export/model.ts';
import { FolderLayout, NameRegistry, documentFileBase, exportArchiveName, safeSegment } from '../lib/export/paths.ts';
import { ExportCancelledError, dataUriToBytes, runExport, type ExportProgress } from '../lib/export/runExport.ts';
import { MissingTableError, type ExportSource, type ExportTable, type ExportTables } from '../lib/export/source.ts';
import { PartedZipWriter, type ZipPart } from '../lib/export/zipWriter.ts';
import {
    BOOKKEEPER_HEADER, bookkeeperCsv, bookkeeperFileName, buildBookkeeperRows, customRange, isLikelyEmail, monthRange, previousMonth, rangeLabel,
    summarizeBookkeeper, utf8ToBase64, type BookkeeperDoc,
} from '../lib/export/bookkeeper.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

/** RFC 4180 reader (quotes, doubled quotes, CRLF inside quotes, BOM). */
const parseCsv = (text: string): string[][] => {
    const s = text.startsWith(CSV_BOM) ? text.slice(1) : text;
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quoted) {
            if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
            else if (c === '"') quoted = false;
            else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(cell); cell = ''; }
        else if (c === '\r' && s[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
        else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
};

const blobBytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const unzipPart = async (p: ZipPart) => unzipSync(await blobBytes(p.blob));
const csvOf = (files: Record<string, Uint8Array>, name: string) => parseCsv(strFromU8(files[`csv/${name}`]));

async function main() {
// =============================================================================================== CSV escaping
eq('plain cell', csvCell('plain'), 'plain');
eq('comma quoted', csvCell('a,b'), '"a,b"');
eq('quotes doubled', csvCell('say "hi"'), '"say ""hi"""');
eq('newline quoted', csvCell('line1\nline2'), '"line1\nline2"');
eq('CR quoted', csvCell('a\r\nb'), '"a\r\nb"');
eq('leading space kept', csvCell(' lead'), '" lead"');
eq('formula neutralised', csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)");
eq('HYPERLINK injection', csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
eq('plus phone neutralised', csvCell('+1 555 0100'), "'+1 555 0100");
eq('at sign neutralised', csvCell('@cmd'), "'@cmd");
eq('tab start neutralised', csvCell('\tx'), "'\tx");
eq('negative number text kept', csvCell('-12.50'), '-12.50');
eq('signed number text kept', csvCell('+3'), '+3');
eq('lone dash kept', csvCell('-'), '-');
eq('formula with comma: prefixed then quoted', csvCell('=1,2'), `"'=1,2"`);
eq('null', csvCell(null), '');
eq('undefined', csvCell(undefined), '');
eq('NaN', csvCell(NaN), '');
eq('Infinity', csvCell(Infinity), '');
eq('zero', csvCell(0), '0');
eq('negative number', csvCell(-5.5), '-5.5');
eq('boolean', [csvCell(true), csvCell(false)], ['yes', 'no']);
eq('date', csvCell(new Date(Date.UTC(2026, 2, 4, 15, 20))), '2026-03-04T15:20:00.000Z');
eq('unicode untouched', csvCell('Café — “Smith & Sons” ✓'), 'Café — “Smith & Sons” ✓');
eq('NUL removed', csvCell('a\u0000b'), 'ab');
eq('line', csvLine(['a', 1, null, 'b,c']), 'a,1,,"b,c"\r\n');
const sample = toCsv(['Name', 'Note'], [['Jane "JJ" Smith', 'two\nlines'], ['=evil()', ' x ']]);
ok('BOM first', sample.startsWith(CSV_BOM));
ok('CRLF endings', sample.endsWith('\r\n') && !/[^\r]\n(?![^"]*"[,\r])/.test(sample.split('"two\nlines"').join('')));
eq('round trip', parseCsv(sample), [['Name', 'Note'], ['Jane "JJ" Smith', 'two\nlines'], ["'=evil()", ' x ']]);
eq('toCsv without BOM', toCsv(['A'], [], { bom: false }), 'A\r\n');
eq('money 2 decimals', [money(1234.5), money('1,250.505'), money(-3), money(null), money(null, true), money('')], ['1234.50', '1250.51', '-3.00', '0.00', '', '0.00']);
// the app's rounding (utils/money.ts): 50% of $99.99 − $20 is 29.994999… in floating point and stands for 29.995
eq('money half-up like the app', money(29.994999999999997), '30.00');
eq('qty', [qty(2.5), qty(10), qty(0.125), qty('3'), qty(null, true), qty(1 / 3)], ['2.5', '10', '0.125', '3', '', '0.333']);
eq('plainText html', plainText('<p>Hello &amp; welcome</p><ul><li>One</li><li>Two</li></ul><p>Bye&nbsp;now &#39;ok&#39;</p>'), "Hello & welcome\n• One\n• Two\nBye now 'ok'");
eq('plainText plain', plainText('  just text  '), 'just text');
eq('plainText cap', plainText('x'.repeat(20), 10).length, 10);
eq('plainText script dropped', plainText('<p>a</p><script>alert(1)</script>b'), 'a\nb');

// =============================================================================================== totals
const inv = {
    invoiceNumber: 'INV-1001', status: 'Sent', issueDate: '2026-03-04', dueDate: '2026-04-03', clientName: 'Jane Smith',
    lineItems: [{ description: 'Cabinets', quantity: 2, rate: 100, unitCost: 60 }, { description: 'Install', quantity: 1, rate: 50.5 }],
    taxRate: 8.25, discount: 10, shipping: 5, amountPaid: 100,
};
eq('invoice totals', documentMoney('Invoice', inv), { subtotal: 250.5, discount: 10, tax: 19.84, shipping: 5, total: 265.34, amountPaid: 100, balanceDue: 165.34 });
eq('paid invoice: balance 0, paid = total', documentMoney('Invoice', { ...inv, status: 'Paid', amountPaid: 0 }), { subtotal: 250.5, discount: 10, tax: 19.84, shipping: 5, total: 265.34, amountPaid: 265.34, balanceDue: 0 });
eq('string numbers', documentMoney('Invoice', { lineItems: [{ quantity: '2', rate: '1,000.00' }], taxRate: '10' }).total, 2200);
eq('progress billing', documentMoney('Invoice', { isProgressBilling: 'true', lineItems: [{ quantity: 1, rate: 1000, percentComplete: 50, previouslyBilled: 200 }] }).total, 300);
eq('estimate has no paid columns', Object.keys(documentMoney('Estimate', { lineItems: [{ quantity: 1, rate: 10 }] })), ['subtotal', 'discount', 'tax', 'shipping', 'total']);
eq('expense with amount (tax included)', documentMoney('Expense Log', { amount: 108.25, tax: 8.25 }), { subtotal: 100, tax: 8.25, total: 108.25 });
eq('expense from line items', documentMoney('Expense Log', { lineItems: [{ quantity: 2, rate: 10 }], tax: 1.6 }), { subtotal: 20, tax: 1.6, total: 21.6 });
eq('material log', documentMoney('Material Log', { items: [{ quantity: 3, unitCost: 2.5 }, { quantity: 1, unitCost: 10 }] }), { subtotal: 17.5, total: 17.5 });
eq('old material log (materials)', documentMoney('Material Log', { materials: [{ quantity: 2, unitCost: 4 }] }).total, 8);
eq('receipt', documentMoney('Receipt', { amount: '1,250.00' }), { total: 1250 });
eq('note has no money', documentMoney('Note', { content: 'x' }), {});
eq('work order cost', documentMoney('Work Order', { cost: 450 }), { total: 450 });
eq('profit report', documentMoney('Profit Report', { totalRevenue: 1000, taxAmount: 80, totalWithTax: 1080 }), { subtotal: 1000, tax: 80, total: 1080 });
eq('type labels', ['INVOICE', 'daily_report', 'WorkOrder', 'change order', 'Expense', 'po', 'Mystery'].map(exportTypeLabel),
    ['Invoice', 'Daily Job Report', 'Work Order', 'Change Order', 'Expense Log', 'Purchase Order', 'Mystery']);
eq('receipt number is its own, not the invoice it pays', documentNumberOf('Receipt', { receiptNumber: 'R-7', invoiceNumber: 'INV-1' }), 'R-7');
eq('note has no number', documentNumberOf('Note', { invoiceNumber: 'x' }), '');

// every row builder matches its header
const job = { name: 'Kitchen remodel', clientName: 'Jane Smith', folder: 'jobs/Kitchen remodel' };
const docRow = (type: string, data: Record<string, any>, id = 'd1'): ExportDocRow => ({ id, job_id: 'j1', type, created_at: '2026-03-04T10:00:00Z', data });
const width = (k: keyof typeof CSV_TABLES) => CSV_TABLES[k].header.length;
eq('documents row width', documentCsvRow(docRow('Invoice', inv), { job, pdfPath: 'x.pdf' }).length, width('documents'));
eq('line item row width', lineItemRows(docRow('Invoice', inv), { job }).map((r) => r.length), [width('line_items'), width('line_items')]);
eq('material line width', lineItemRows(docRow('Material Log', { items: [{ name: 'Nails', quantity: 1, unitCost: 2, supplier: 'HD' }] }))[0].length, width('line_items'));
eq('receipt payment width', receiptPaymentRow(docRow('Receipt', { amount: 5 })).length, width('payments'));
eq('invoice payment width', invoicePaymentRow({ invoiceId: 'a', invoiceNumber: '', client: '', job: '', date: '', amount: 1, method: '', receiptId: '', receiptNumber: '' }).length, width('payments'));
eq('time sheet width', timeSheetRow(docRow('Time Sheet', { hoursWorked: 8, overtimeHours: 2 })).length, width('time_sheets'));
eq('expense width', expenseRow(docRow('Expense Log', { amount: 5 })).length, width('expense_logs'));
eq('job width', jobCsvRow({ id: 'j1', name: 'x' }, 'jobs/x').length, width('jobs'));
eq('client width', clientCsvRow({ id: 'c1', name: 'x' }).length, width('clients'));
eq('inventory width', inventoryCsvRow({ id: 'i1', name: 'x' }).length, width('inventory'));
eq('history width', historyCsvRow({ id: 'h1' }).length, width('inventory_history'));
eq('price book width', priceBookCsvRow({ id: 'p1' }).length, width('price_book'));
eq('reminder width', reminderCsvRow({ id: 'r1' }).length, width('reminders_log'));
eq('quote request width', quoteRequestCsvRow({ id: 'q1' }).length, width('quote_requests'));

const invRow = documentCsvRow(docRow('Invoice', inv), { job, pdfPath: 'jobs/Kitchen remodel/2026-03-04 Invoice INV-1001.pdf' });
const H = CSV_TABLES.documents.header;
const cell = (row: unknown[], name: string) => row[H.indexOf(name)];
eq('documents row: number/date/due', [cell(invRow, 'Number'), cell(invRow, 'Date'), cell(invRow, 'Due / valid until')], ['INV-1001', '2026-03-04', '2026-04-03']);
eq('documents row: totals', [cell(invRow, 'Subtotal'), cell(invRow, 'Tax'), cell(invRow, 'Total'), cell(invRow, 'Amount paid'), cell(invRow, 'Balance due')], ['250.50', '19.84', '265.34', '100.00', '165.34']);
eq('documents row: job + pdf', [cell(invRow, 'Job'), cell(invRow, 'PDF file')], ['Kitchen remodel', 'jobs/Kitchen remodel/2026-03-04 Invoice INV-1001.pdf']);
eq('documents row: date falls back to created day', cell(documentCsvRow(docRow('Note', { title: 'x' })), 'Date'), '2026-03-04');
eq('line item amounts', lineItemRows(docRow('Invoice', inv)).map((r) => [r[5], r[6], r[7], r[8], r[9]]), [['Cabinets', '2', '100.00', '200.00', '60.00'], ['Install', '1', '50.50', '50.50', '']]);
eq('time sheet hours', timeSheetRow(docRow('Time Sheet', { hoursWorked: '7.5', overtimeHours: 1, workerName: 'Sam' })).slice(2, 8), ['Sam', '', '', '7.5', '1', '8.5']);
eq('expense row', expenseRow(docRow('Expense Log', { amount: 54.13, tax: 4.13, vendor: 'Home Depot', category: 'Material', item: 'Screws' }), { job }).slice(2, 9),
    ['Home Depot', 'Screws', 'Material', '50.00', '4.13', '54.13', 'Kitchen remodel']);
const payDoc = docRow('Invoice', { ...inv, payments: [{ id: 'p1', amount: 100, date: '2026-03-10', method: 'Check', receiptId: 'r1' }, { id: 'p2', amount: 50, date: '2026-03-12', receiptId: 'gone' }, { id: 'p3', amount: 20, date: '2026-03-13' }] });
eq('invoice payments without an exported receipt', paymentsWithoutReceipt(invoicePaymentEntries(payDoc), new Set(['r1'])).map((p) => p.amount), [50, 20]);
eq('category paths', [...categoryPaths([{ id: 'a', name: 'Roofing' }, { id: 'b', name: 'Shingles', parent_id: 'a' }]).values()], ['Roofing', 'Roofing › Shingles']);
eq('client row never has the portal key', clientCsvRow({ id: 'c', name: 'n', portal_key: 'SECRET' } as any).includes('SECRET'), false);

// =============================================================================================== folder layout
eq('separators', safeSegment('Kitchen: "Smith" / phase 2?'), 'Kitchen - Smith - phase 2');
eq('backslash and pipe', safeSegment('a\\b|c'), 'a - b - c');
eq('control chars', safeSegment('a\tb\nc'), 'a b c');
eq('trailing dots/spaces', safeSegment('Job...  '), 'Job');
eq('reserved names', [safeSegment('CON'), safeSegment('lpt1'), safeSegment('aux.txt'), safeSegment('Console')], ['_CON', '_lpt1', '_aux.txt', 'Console']);
eq('empty → fallback', [safeSegment(''), safeSegment('...'), safeSegment(null, 'Untitled job'), safeSegment('???', 'X')], ['Untitled', 'Untitled', 'Untitled job', 'X']);
eq('max 80 chars', Array.from(safeSegment('a'.repeat(200))).length, 80);
eq('emoji kept whole', safeSegment('🏠'.repeat(100)), '🏠'.repeat(80));
eq('accents NFC', safeSegment('Rénovation'), 'Rénovation');
const reg = new NameRegistry();
eq('registry case-insensitive', [reg.claim('Kitchen'), reg.claim('kitchen'), reg.claim('KITCHEN'), reg.claim('Bath')], ['Kitchen', 'kitchen (2)', 'KITCHEN (3)', 'Bath']);
const files = new NameRegistry();
eq('registry keeps extension', [files.claim('Invoice', '.pdf'), files.claim('invoice', '.pdf')], ['Invoice.pdf', 'invoice (2).pdf']);
eq('file base', documentFileBase({ id: '1', type: 'Invoice', number: 'INV-1001', date: '2026-03-04' }), '2026-03-04 Invoice INV-1001');
eq('file base, number already says the type', documentFileBase({ id: '1', type: 'Invoice', number: 'Invoice 12', date: '2026-03-04' }), '2026-03-04 Invoice 12');
eq('file base with title', documentFileBase({ id: '1', type: 'Daily Job Report', date: '2026-03-05', title: 'Framing / day 2' }), '2026-03-05 Daily Job Report - Framing - day 2');
eq('file base without date', documentFileBase({ id: '1', type: 'Note', date: 'soon' }), 'Note');
const layout = new FolderLayout();
eq('job folders unique', [layout.addJob({ id: 'a', name: 'Kitchen remodel' }), layout.addJob({ id: 'b', name: 'Kitchen Remodel' }), layout.addJob({ id: 'c', name: '' }), layout.addJob({ id: 'a', name: 'renamed' })],
    ['jobs/Kitchen remodel', 'jobs/Kitchen Remodel (2)', 'jobs/Untitled job', 'jobs/Kitchen remodel']);
eq('pdf paths unique per folder', [
    layout.pdfPathFor({ id: '1', jobId: 'a', type: 'Invoice', number: 'INV-1', date: '2026-03-04' }),
    layout.pdfPathFor({ id: '2', jobId: 'a', type: 'Invoice', number: 'INV-1', date: '2026-03-04' }),
    layout.pdfPathFor({ id: '3', jobId: 'b', type: 'Invoice', number: 'INV-1', date: '2026-03-04' }),
    layout.pdfPathFor({ id: '4', jobId: 'missing', type: 'Note', date: '2026-03-04' }),
    layout.pdfPathFor({ id: '5', jobId: null, type: 'Note', date: '2026-03-04' }),
], [
    'jobs/Kitchen remodel/2026-03-04 Invoice INV-1.pdf', 'jobs/Kitchen remodel/2026-03-04 Invoice INV-1 (2).pdf', 'jobs/Kitchen Remodel (2)/2026-03-04 Invoice INV-1.pdf',
    'jobs/Documents without a job/2026-03-04 Note.pdf', 'jobs/Documents without a job/2026-03-04 Note (2).pdf',
]);
eq('archive names', [exportArchiveName(new Date(2026, 10, 13)), exportArchiveName(new Date(2026, 10, 13), 2), exportArchiveName(new Date(2026, 0, 5), undefined, 'csv')],
    ['ContractorDocs-export-2026-11-13.zip', 'ContractorDocs-export-2026-11-13-part2.zip', 'ContractorDocs-spreadsheets-2026-01-05.zip']);
eq('data URI → bytes', strFromU8(dataUriToBytes('data:application/pdf;filename=generated.pdf;base64,JVBERi0xLjQ=')), '%PDF-1.4');

// =============================================================================================== fake account
interface FakeAccount { tables: Partial<{ [K in ExportTable]: ExportTables[K][] }>; docs: ExportDocRow[]; missing?: ExportTable[] }
interface SourceStats { docPages: number[]; byIdCalls: number[]; maxInflight: number }
const fakeSource = (acc: FakeAccount, stats: SourceStats): ExportSource => {
    let inflight = 0;
    return {
        async countDocuments() { return acc.docs.length; },
        async *pages(table, pageSize) {
            if (acc.missing?.includes(table)) throw new MissingTableError(table);
            const rows = (acc.tables[table] || []) as any[];
            for (let i = 0; i < rows.length; i += pageSize) yield rows.slice(i, i + pageSize);
        },
        async *documentPages(pageSize) {
            for (let i = 0; i < acc.docs.length; i += pageSize) {
                const page = acc.docs.slice(i, i + pageSize);
                stats.docPages.push(page.length);
                // a copy, like a fresh network response
                yield JSON.parse(JSON.stringify(page));
            }
        },
        async documentsByIds(ids) {
            inflight++;
            stats.maxInflight = Math.max(stats.maxInflight, inflight);
            stats.byIdCalls.push(ids.length);
            await new Promise((r) => setTimeout(r, 0));
            inflight--;
            const want = new Set(ids);
            return JSON.parse(JSON.stringify(acc.docs.filter((d) => want.has(d.id))));
        },
    };
};
const fakePdf = (size = 0) => async (doc: ExportDocRow) => {
    if (doc.data?.__failPdf) throw new Error('render failed');
    const head = new TextEncoder().encode(`%PDF-1.4 ${doc.id}\n`);
    if (!size) return head;
    const out = new Uint8Array(size);
    out.set(head);
    for (let i = head.length; i < size; i++) out[i] = (i * 7919) & 255; // incompressible-ish, like a real PDF
    return out;
};
const newStats = (): SourceStats => ({ docPages: [], byIdCalls: [], maxInflight: 0 });

const jobs: ExportJobRow[] = [
    { id: 'j1', name: 'Kitchen remodel', client_name: 'Jane Smith', status: 'active', created_at: '2026-01-01T00:00:00Z' },
    { id: 'j2', name: 'Kitchen remodel', client_name: 'Bob Lee', status: 'completed', created_at: '2026-01-02T00:00:00Z' },
    { id: 'j3', name: 'Rénovation café: phase 1/2', client_name: 'Zoë', status: 'active', created_at: '2026-01-03T00:00:00Z' },
];
const small: FakeAccount = {
    tables: {
        jobs,
        clients: [{ id: 'c1', name: '=cmd|calc', email: 'jane@example.com', phone: '+1 555 0100', notes: '<p>Gate code 1234</p>', created_at: '2026-01-01T00:00:00Z' }],
        inventory: [{ id: 'i1', name: '2x4 stud', quantity: 40, cost_price: 3.5, unit: 'pcs', created_at: '2026-01-01T00:00:00Z' }],
        inventory_history: [{ id: 'h1', item_id: 'i1', item_name: '2x4 stud', action: 'job_allocation', quantity_change: -10, quantity_after: 30, job_id: 'j1', created_at: '2026-02-01T00:00:00Z' }],
        saved_items: [{ id: 'p1', name: 'Drywall patch', rate: 120, unit_cost: 30, category_id: 'cat2', created_at: '2026-01-01T00:00:00Z' }],
        price_book_categories: [{ id: 'cat1', name: 'Interior' }, { id: 'cat2', name: 'Drywall', parent_id: 'cat1' }],
        quote_requests: [{ id: 'q1', name: 'New lead', email: 'lead@example.com', details: 'Leaky roof', photo_paths: ['a', 'b'], status: 'new', created_at: '2026-03-01T00:00:00Z' }],
    },
    missing: ['reminders'],
    docs: [
        docRow('Invoice', { ...inv, payments: [{ id: 'p1', amount: 100, date: '2026-03-10', method: 'Check', receiptId: 'r1' }] }, 'inv1'),
        docRow('Invoice', { ...inv }, 'inv2'), // same number in the same job → "(2)"
        { ...docRow('Receipt', { receiptNumber: 'R-1', amount: 100, date: '2026-03-10', invoiceNumber: 'INV-1001', paymentMethod: 'Check' }, 'r1') },
        { ...docRow('Time Sheet', { workerName: 'Sam', date: '2026-03-05', hoursWorked: 8 }, 'ts1'), job_id: 'j2' },
        { ...docRow('Expense Log', { vendor: 'Home Depot', date: '2026-03-06', amount: 54.13, tax: 4.13, category: 'Material' }, 'ex1'), job_id: 'j3' },
        { ...docRow('Material Log', { date: '2026-03-07', items: [{ name: 'Nails', quantity: 2, unitCost: 4.5, supplier: 'HD' }] }, 'ml1'), job_id: 'j3' },
        { ...docRow('Note', { title: 'Site notes', content: '<p>Hi</p>', __failPdf: true }, 'n1'), job_id: null },
        { ...docRow('Daily Job Report', { reportNumber: 'DR-1', date: '2026-03-08' }, 'dr1'), job_id: 'gone-job' },
    ],
};

{
    const stats = newStats();
    const progress: ExportProgress[] = [];
    const parts: ZipPart[] = [];
    const now = new Date(2026, 10, 13, 9, 30);
    const res = await runExport({ source: fakeSource(small, stats), mode: 'full', renderPdf: fakePdf(), now, account: { name: 'Jane', company: 'Acme', email: 'jane@acme.test' }, onProgress: (p) => progress.push(p), onPart: (p) => parts.push(p) });
    eq('one part, no "part" in the name', res.parts.map((p) => p.name), ['ContractorDocs-export-2026-11-13.zip']);
    eq('onPart called once', parts.length, 1);
    const z = await unzipPart(res.parts[0]);
    const names = Object.keys(z).sort();
    ok('README present', names.includes('README.txt'));
    ok('all 12 CSVs present', CSV_ORDER.every((k) => names.includes(`csv/${CSV_TABLES[k].file}`)));
    ok('JSON backup present', names.includes('data/documents.jsonl'));
    // the note's PDF fails (listed in errors.txt instead); the daily report's job was deleted
    eq('PDF folder layout', names.filter((n) => n.endsWith('.pdf')), [
        'jobs/Documents without a job/2026-03-08 Daily Job Report DR-1.pdf',
        'jobs/Kitchen remodel (2)/2026-03-05 Time Sheet.pdf',
        'jobs/Kitchen remodel/2026-03-04 Invoice INV-1001 (2).pdf',
        'jobs/Kitchen remodel/2026-03-04 Invoice INV-1001.pdf',
        'jobs/Kitchen remodel/2026-03-10 Receipt R-1.pdf',
        'jobs/Rénovation café - phase 1 - 2/2026-03-06 Expense Log.pdf',
        'jobs/Rénovation café - phase 1 - 2/2026-03-07 Material Log.pdf',
    ]);
    ok('failed PDF listed in errors.txt', strFromU8(z['errors.txt'] || new Uint8Array()).includes('jobs/Documents without a job/2026-03-04 Note - Site notes.pdf  (Note): render failed'));
    eq('pdf counts', res.pdfs, { planned: 8, done: 7, failed: 1 });
    eq('PDF bytes are the rendered ones', strFromU8(z['jobs/Kitchen remodel/2026-03-04 Invoice INV-1001.pdf']), '%PDF-1.4 inv1\n');
    const docsCsv = csvOf(z, 'documents.csv');
    eq('documents.csv header', docsCsv[0], CSV_TABLES.documents.header);
    eq('documents.csv rows', docsCsv.length - 1, small.docs.length);
    const pdfCol = docsCsv[0].indexOf('PDF file');
    ok('every PDF path in documents.csv exists (or failed)', docsCsv.slice(1).every((r) => z[r[pdfCol]] || r[pdfCol].includes('Site notes')));
    const jobsCsv = csvOf(z, 'jobs.csv');
    eq('jobs.csv folders + counts', jobsCsv.slice(1).map((r) => [r[1], r[10], r[11], r[12]]), [
        ['Kitchen remodel', '3', '530.68', 'jobs/Kitchen remodel'],
        ['Kitchen remodel', '1', '0.00', 'jobs/Kitchen remodel (2)'],
        ['Rénovation café: phase 1/2', '2', '0.00', 'jobs/Rénovation café - phase 1 - 2'],
    ]);
    eq('clients.csv escapes formulas, keeps phone readable', csvOf(z, 'clients.csv')[1].slice(1, 6), ["'=cmd|calc", 'jane@example.com', "'+1 555 0100", '', 'Gate code 1234']);
    eq('payments: receipt only (its invoice payment is the same money)', csvOf(z, 'payments.csv').slice(1).map((r) => [r[0], r[1], r[9]]), [['2026-03-10', '100.00', 'Receipt']]);
    eq('line_items rows', csvOf(z, 'line_items.csv').length - 1, 2 + 2 + 1);
    eq('time_sheets rows', csvOf(z, 'time_sheets.csv').slice(1).map((r) => [r[2], r[3], r[7]]), [['Sam', 'Kitchen remodel', '8']]);
    eq('expense_logs rows', csvOf(z, 'expense_logs.csv').slice(1).map((r) => [r[2], r[5], r[6], r[7]]), [['Home Depot', '50.00', '4.13', '54.13']]);
    eq('inventory value', csvOf(z, 'inventory.csv')[1].slice(5, 8), ['40', '3.50', '140.00']);
    eq('stock history job name', csvOf(z, 'inventory_history.csv')[1].slice(3, 7), ['job_allocation', '-10', '30', 'Kitchen remodel']);
    eq('price book category path', csvOf(z, 'price_book.csv')[1][4], 'Interior › Drywall');
    eq('missing table → header only', csvOf(z, 'reminders_log.csv'), [CSV_TABLES.reminders_log.header]);
    ok('missing table noted in README', strFromU8(z['README.txt']).includes('Reminders log: not available'));
    eq('quote requests photos', csvOf(z, 'quote_requests.csv')[1][8], '2');
    const jsonl = strFromU8(z['data/documents.jsonl']).trim().split('\n').map((l) => JSON.parse(l));
    eq('jsonl has every document with its data', jsonl.map((d) => d.id), small.docs.map((d) => d.id));
    eq('jsonl keeps rich data', jsonl[0].data.lineItems.length, 2);
    ok('jsonl has no approval token', !strFromU8(z['data/documents.jsonl']).includes('public_token'));
    const readme = strFromU8(z['README.txt']);
    ok('README lists counts', readme.includes('documents.csv') && /documents\.csv\s+8 rows/.test(readme));
    ok('README says available on every plan', readme.includes('every plan, Free included'));
    ok('README account line', readme.includes('Jane (Acme) <jane@acme.test>'));
    ok('progress never goes back', progress.every((p, i) => i === 0 || p.percent >= progress[i - 1].percent));
    ok('progress reaches the end', progress[progress.length - 1].percent >= 98);
    eq('warnings', res.warnings.length, 1);
}

// spreadsheets only
{
    const stats = newStats();
    const res = await runExport({ source: fakeSource(small, stats), mode: 'csv', now: new Date(2026, 10, 13) });
    const z = await unzipPart(res.parts[0]);
    eq('csv-only name', res.parts[0].name, 'ContractorDocs-spreadsheets-2026-11-13.zip');
    eq('csv-only: no PDFs, no errors.txt', Object.keys(z).filter((n) => n.endsWith('.pdf') || n === 'errors.txt'), []);
    eq('csv-only: no documents loaded again by id', stats.byIdCalls.length, 0);
    const d = csvOf(z, 'documents.csv');
    ok('csv-only: PDF column empty', d.slice(1).every((r) => r[d[0].indexOf('PDF file')] === ''));
    ok('csv-only: README says no PDFs', strFromU8(z['README.txt']).includes('spreadsheets only'));
    eq('csv-only: jobs.csv folder empty', csvOf(z, 'jobs.csv')[1][12], '');
}

// =============================================================================================== big account
{
    const N = 5000;
    const bigJobs: ExportJobRow[] = Array.from({ length: 300 }, (_, i) => ({ id: `job${i}`, name: i % 10 === 0 ? 'Bathroom' : `Job ${i}`, created_at: `2025-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` }));
    const types = ['Invoice', 'Estimate', 'Receipt', 'Time Sheet', 'Expense Log', 'Material Log', 'Daily Job Report', 'Note'];
    const bigDocs: ExportDocRow[] = Array.from({ length: N }, (_, i) => {
        const type = types[i % types.length];
        return {
            id: `doc${i}`, job_id: `job${i % 300}`, type, created_at: `2025-06-01T00:00:00Z`,
            data: {
                invoiceNumber: type === 'Invoice' ? `INV-${i}` : undefined, estimateNumber: type === 'Estimate' ? `EST-${i}` : undefined,
                receiptNumber: type === 'Receipt' ? `R-${i}` : undefined, status: 'Sent', issueDate: '2025-06-01', date: '2025-06-01', amount: 10,
                lineItems: [{ description: `Line for ${i}`, quantity: 1, rate: 100 }, { description: 'Second, with "quotes"', quantity: 2, rate: 12.5 }],
                items: type === 'Material Log' ? [{ name: 'Nails', quantity: 1, unitCost: 1 }] : undefined,
                signatureUrl: 'data:image/png;base64,' + 'A'.repeat(200),
            },
        };
    });
    const big: FakeAccount = { tables: { jobs: bigJobs }, docs: bigDocs };
    const stats = newStats();
    const parts: ZipPart[] = [];
    let maxPercent = 0;
    let backwards = false;
    const t0 = Date.now();
    const res = await runExport({
        source: fakeSource(big, stats), mode: 'full', renderPdf: fakePdf(24 * 1024), now: new Date(2026, 10, 13),
        maxPartBytes: 8 * 1024 * 1024, flushBytes: 512 * 1024, docPageSize: 100, pdfBatchSize: 20,
        onPart: (p) => parts.push(p),
        onProgress: (p) => { if (p.percent < maxPercent) backwards = true; maxPercent = Math.max(maxPercent, p.percent); },
        yieldToUi: () => Promise.resolve(),
    });
    const ms = Date.now() - t0;
    eq('big: document pages never exceed the page size', Math.max(...stats.docPages), 100);
    eq('big: every document read once in the data pass', stats.docPages.reduce((s, n) => s + n, 0), N);
    eq('big: PDF batches of at most 20', Math.max(...stats.byIdCalls), 20);
    eq('big: PDF batches cover every document once', stats.byIdCalls.reduce((s, n) => s + n, 0), N);
    eq('big: one batch at a time', stats.maxInflight, 1);
    ok('big: split into several parts', res.parts.length >= 10);
    eq('big: part names', [res.parts[0].name, res.parts[1].name, res.parts[res.parts.length - 1].name],
        ['ContractorDocs-export-2026-11-13-part1.zip', 'ContractorDocs-export-2026-11-13-part2.zip', `ContractorDocs-export-2026-11-13-part${res.parts.length}.zip`]);
    eq('big: onPart called for every part, in order', parts.map((p) => p.index), res.parts.map((_, i) => i + 1));
    ok('big: parts after the first stay under the limit', res.parts.slice(1).every((p) => p.size <= 8 * 1024 * 1024));
    ok('big: parts are filled (not split early)', res.parts.slice(1, -1).every((p) => p.size > 8 * 1024 * 1024 - 30 * 1024));
    let pdfCount = 0;
    const seen = new Set<string>();
    let dup = false;
    let partReadmes = 0;
    for (const p of res.parts) {
        const z = await unzipPart(p);
        for (const name of Object.keys(z)) {
            if (name.endsWith('.pdf')) { pdfCount++; if (seen.has(name)) dup = true; seen.add(name); }
        }
        if (p.index > 1 && strFromU8(z['README.txt'] || new Uint8Array()).includes(`part ${p.index}`)) partReadmes++;
        if (p.index > 1) ok(`big: part ${p.index} has no CSV`, !Object.keys(z).some((n) => n.startsWith('csv/')));
    }
    eq('big: every PDF in exactly one part', [pdfCount, dup], [N, false]);
    eq('big: README in every later part', partReadmes, res.parts.length - 1);
    const z1 = await unzipPart(res.parts[0]);
    eq('big: documents.csv rows', csvOf(z1, 'documents.csv').length - 1, N);
    const folders = new Set(csvOf(z1, 'jobs.csv').slice(1).map((r) => r[12]));
    eq('big: 300 distinct job folders (30 "Bathroom" jobs numbered)', folders.size, 300);
    ok('big: "Bathroom (30)" exists', folders.has('jobs/Bathroom (30)'));
    const pdfCol = csvOf(z1, 'documents.csv')[0].indexOf('PDF file');
    ok('big: documents.csv PDF paths are exactly the PDFs in the parts', csvOf(z1, 'documents.csv').slice(1).every((r) => seen.has(r[pdfCol])));
    eq('big: line items', csvOf(z1, 'line_items.csv').length - 1, N * 2 + N / 8);
    ok('big: progress monotonic and complete', !backwards && maxPercent >= 98);
    ok(`big: fast enough (${ms} ms)`, ms < 60_000);
}

// cancel
{
    const stats = newStats();
    let events = 0;
    let threw: unknown = null;
    try {
        await runExport({ source: fakeSource(small, stats), mode: 'full', renderPdf: fakePdf(), isCancelled: () => ++events > 6 });
    } catch (e) { threw = e; }
    ok('cancel throws ExportCancelledError', threw instanceof ExportCancelledError);
}

// zip writer on its own: text files stream, unicode names, empty file
{
    const w = new PartedZipWriter({ partName: (p) => `t${p ?? ''}.zip`, flushBytes: 1024 });
    const a = w.openTextFile('a.csv');
    const b = w.openTextFile('dossier/é.txt');
    for (let i = 0; i < 5000; i++) { a.write(`row ${i},x\r\n`); b.write('é'); }
    a.close(); b.close();
    w.addText('empty.txt', '');
    await w.addBinary('bin.pdf', new Uint8Array([1, 2, 3]));
    const [part] = await w.finish();
    const z = await unzipPart(part);
    eq('writer: names', Object.keys(z).sort(), ['a.csv', 'bin.pdf', 'dossier/é.txt', 'empty.txt']);
    eq('writer: text content', [strFromU8(z['a.csv']).split('\r\n').length, strFromU8(z['dossier/é.txt']).length, z['empty.txt'].length, Array.from(z['bin.pdf'])], [5001, 5000, 0, [1, 2, 3]]);
    eq('writer: single part keeps the plain name', part.name, 't.zip');
    let threw = false;
    try { w.addText('late.txt', 'x'); } catch { threw = true; }
    ok('writer: refuses files after finish', threw);
}

// =============================================================================================== bookkeeper
{
    const range = monthRange('2026-10')!;
    eq('month range', range, { start: '2026-10-01', end: '2026-10-31' });
    eq('february', [monthRange('2026-02')!.end, monthRange('2028-02')!.end], ['2026-02-28', '2028-02-29']);
    eq('bad month', [monthRange('2026-13'), monthRange('oct')], [null, null]);
    eq('previous month', [previousMonth(new Date(2026, 10, 13)), previousMonth(new Date(2026, 0, 15))], ['2026-10', '2025-12']);
    eq('custom range', [customRange('2026-10-03', '2026-11-02'), customRange('2026-11-02', '2026-10-03'), customRange('x', '2026-10-03')], [{ start: '2026-10-03', end: '2026-11-02' }, null, null]);
    eq('range labels', [rangeLabel(range), rangeLabel({ start: '2026-10-03', end: '2026-11-02' })], ['October 2026', '2026-10-03 to 2026-11-02']);
    eq('file names', [bookkeeperFileName(range), bookkeeperFileName({ start: '2026-10-03', end: '2026-11-02' })], ['ContractorDocs-bookkeeping-2026-10.csv', 'ContractorDocs-bookkeeping-2026-10-03_to_2026-11-02.csv']);

    const bdocs: BookkeeperDoc[] = [
        { id: 'i1', type: 'Invoice', job_id: 'j1', created_at: '2026-10-02T12:00:00Z', status: 'Sent', issueDate: '2026-10-02', invoiceNumber: 'INV-10', clientName: 'Jane Smith', lineItems: [{ description: 'Deck', quantity: 1, rate: 1000 }, { description: 'Stain', quantity: 2, rate: 50 }], taxRate: 10, amountPaid: 200 },
        { id: 'i2', type: 'Invoice', job_id: 'j1', status: 'Draft', issueDate: '2026-10-05', invoiceNumber: 'INV-11', lineItems: [{ quantity: 1, rate: 999 }] },
        { id: 'i3', type: 'Invoice', job_id: 'j1', status: 'Cancelled', issueDate: '2026-10-06', invoiceNumber: 'INV-12', lineItems: [{ quantity: 1, rate: 999 }] },
        // issued in September, paid in October with "Mark as paid" (no receipt document) + one payment whose receipt exists
        { id: 'i4', type: 'Invoice', job_id: 'j2', status: 'Paid', issueDate: '2026-09-20', invoiceNumber: 'INV-9', paidAt: '2026-10-08', lineItems: [{ quantity: 1, rate: 500 }],
            payments: [{ amount: 300, date: '2026-10-08', method: 'Zelle' }, { amount: 200, date: '2026-10-09', receiptId: 'r1' }] },
        { id: 'r1', type: 'Receipt', job_id: 'j2', date: '2026-10-09', receiptNumber: 'R-3', clientName: 'Bob Lee', amount: 200, paymentMethod: 'Check', invoiceNumber: 'INV-9' },
        { id: 'r2', type: 'Receipt', job_id: 'j2', date: '2026-11-01', receiptNumber: 'R-4', amount: 99 },
        { id: 'e1', type: 'Expense Log', job_id: 'j1', date: '2026-10-03', vendor: '=Home Depot', item: 'Lumber, treated', category: 'Material', amount: 108.25, tax: 8.25 },
        { id: 'm1', type: 'Material Log', job_id: 'j1', date: '2026-10-04', items: [{ name: 'Screws', quantity: 3, unitCost: 2.5, supplier: 'Lowe’s' }, { name: 'Glue', quantity: 1, unitCost: 7, supplier: 'HD' }] },
        { id: 'n1', type: 'Note', job_id: 'j1', date: '2026-10-04' },
    ];
    const jobsMap = new Map([['j1', { name: 'Deck build', clientName: 'Jane Smith' }], ['j2', { name: 'Fence', clientName: 'Bob Lee' }]]);
    const rows = buildBookkeeperRows(bdocs, range, jobsMap);
    eq('bookkeeper rows', rows.map((r) => [r.date, r.type, r.number, r.party, r.net, r.tax, r.total, r.status, r.paidDate, r.category, r.job]), [
        ['2026-10-02', 'Invoice', 'INV-10', 'Jane Smith', 1100, 110, 1210, 'Partly paid', '', 'Sales', 'Deck build'],
        ['2026-10-03', 'Expense', '', '=Home Depot', 100, 8.25, 108.25, 'Paid', '2026-10-03', 'Material', 'Deck build'],
        ['2026-10-04', 'Materials', '', 'Lowe’s', 7.5, 0, 7.5, 'Recorded', '', 'Materials', 'Deck build'],
        ['2026-10-04', 'Materials', '', 'HD', 7, 0, 7, 'Recorded', '', 'Materials', 'Deck build'],
        ['2026-10-08', 'Payment', '', 'Bob Lee', 300, 0, 300, 'Received', '2026-10-08', 'Payment received', 'Fence'],
        ['2026-10-09', 'Payment', 'R-3', 'Bob Lee', 200, 0, 200, 'Received', '2026-10-09', 'Payment received', 'Fence'],
    ]);
    ok('net + tax = total on every row', rows.every((r) => Math.abs(r.net + r.tax - r.total) < 0.005));
    eq('invoice description from lines', rows[0].description, 'Deck +1 more');
    eq('payment description', rows[4].description, 'Zelle · for invoice INV-9');
    eq('material description', rows[2].description, 'Screws × 3 @ 2.50');
    eq('summary', summarizeBookkeeper(rows), { invoices: { count: 1, total: 1210 }, payments: { count: 2, total: 500 }, expenses: { count: 1, total: 108.25 }, materials: { count: 2, total: 14.5 } });
    const csv = bookkeeperCsv(rows);
    const parsed = parseCsv(csv);
    ok('bookkeeper CSV has BOM', csv.startsWith(CSV_BOM));
    eq('bookkeeper header', parsed[0], [...BOOKKEEPER_HEADER]);
    eq('bookkeeper rows in CSV', parsed.length - 1, rows.length);
    eq('bookkeeper money format + escaping', parsed[2], ['2026-10-03', 'Expense', '', "'=Home Depot", 'Lumber, treated', '100.00', '8.25', '108.25', 'Paid', '2026-10-03', 'Material', 'Deck build']);
    eq('empty month', bookkeeperCsv(buildBookkeeperRows(bdocs, monthRange('2025-01')!)), `${CSV_BOM}${BOOKKEEPER_HEADER.join(',')}\r\n`);
    eq('paid invoice row in its own month', buildBookkeeperRows(bdocs, monthRange('2026-09')!).map((r) => [r.type, r.status, r.paidDate, r.total]), [['Invoice', 'Paid', '2026-10-08', 500]]);
    eq('base64 of UTF-8', Buffer.from(utf8ToBase64('Café ✓ €'), 'base64').toString('utf8'), 'Café ✓ €');
    eq('base64 of a big file', Buffer.from(utf8ToBase64('x'.repeat(100_000) + 'é'), 'base64').toString('utf8').length, 100_001);
    eq('email check', ['books@firm.com', 'a@b', 'x y@z.com', '', 'ok.name+tag@sub.firm.co'].map(isLikelyEmail), [true, false, false, false, true]);
}

console.log(`export-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
