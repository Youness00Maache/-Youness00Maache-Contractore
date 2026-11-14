/**
 * Monthly bookkeeper CSV (pure; tested by scripts/export-check.ts). One file per month (or date range) with a row per
 *   - invoice issued in the period (drafts and cancelled / void invoices are left out, like Insights does),
 *   - payment received in the period (receipts, plus "Mark as paid" payments that have no receipt document),
 *   - expense logged in the period,
 *   - material line logged in the period (one row per item, so each line has its own supplier).
 *
 * Columns: Date, Type, Number, Client / Vendor, Description, Net, Tax, Total, Status, Paid date, Category, Job.
 * Amounts are positive plain numbers ("1234.50"); the Type column says whether money came in (Invoice, Payment) or
 * went out (Expense, Materials). Dates are YYYY-MM-DD. This is the layout bookkeepers import into a spreadsheet,
 * QuickBooks or Xero.
 */
import { roundMoney, toNumber } from '../../utils/money.ts';
import { isBilledInvoiceStatus } from '../finance.ts';
import { normalizeYMD, instantToLocalYMD } from '../../utils/localDates.ts';
import { documentDateOf, documentMoney, exportTypeLabel, paidDateOf } from './model.ts';
import { money, plainText, qty, toCsv, type CsvValue } from './csv.ts';

export const BOOKKEEPER_HEADER = ['Date', 'Type', 'Number', 'Client / Vendor', 'Description', 'Net', 'Tax', 'Total', 'Status', 'Paid date', 'Category', 'Job'] as const;

/** Document types the bookkeeper CSV reads. */
export const BOOKKEEPER_DOC_TYPES = ['Invoice', 'Receipt', 'Expense Log', 'Material Log'];

/** JSON-path select: only the fields the CSV needs (no logos, signatures or styling are downloaded). */
export const BOOKKEEPER_SELECT = [
    'id', 'type', 'job_id', 'created_at',
    'status:data->>status', 'issueDate:data->>issueDate', 'date:data->>date', 'title:data->>title',
    'invoiceNumber:data->>invoiceNumber', 'receiptNumber:data->>receiptNumber', 'invoiceId:data->>invoiceId', 'clientName:data->>clientName',
    'lineItems:data->lineItems', 'taxRate:data->taxRate', 'discount:data->discount', 'shipping:data->shipping',
    'isProgressBilling:data->isProgressBilling', 'amountPaid:data->amountPaid', 'payments:data->payments', 'paidAt:data->>paidAt',
    'amount:data->amount', 'tax:data->tax', 'vendor:data->>vendor', 'category:data->>category', 'item:data->>item',
    'description:data->>description', 'paymentMethod:data->>paymentMethod', 'paymentStatus:data->>paymentStatus',
    'items:data->items', 'materials:data->materials',
].join(',');

/** A document row from BOOKKEEPER_SELECT (the data fields are flattened onto the row). */
export interface BookkeeperDoc {
    id: string;
    type: string;
    job_id?: string | null;
    created_at?: string | null;
    [field: string]: any;
}

export type BookkeeperRowType = 'Invoice' | 'Payment' | 'Expense' | 'Materials';

export interface BookkeeperRow {
    date: string;
    type: BookkeeperRowType;
    number: string;
    party: string;
    description: string;
    net: number;
    tax: number;
    total: number;
    status: string;
    paidDate: string;
    category: string;
    job: string;
}

export interface DateRange { start: string; end: string }

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const TYPE_ORDER: Record<BookkeeperRowType, number> = { Invoice: 0, Payment: 1, Expense: 2, Materials: 3 };
const inRange = (ymd: string, r: DateRange) => !!ymd && ymd >= r.start && ymd <= r.end;

/** "Kitchen tiles" / "Kitchen tiles +2 more" from line items. */
const linesSummary = (items: unknown): string => {
    const list = (Array.isArray(items) ? items : []).map((li: any) => plainText(li?.description ?? li?.name, 120)).filter(Boolean);
    if (!list.length) return '';
    return list.length === 1 ? list[0] : `${list[0]} +${list.length - 1} more`;
};

const invoiceStatus = (d: BookkeeperDoc, total: number, paidSoFar: number): string => {
    if (/^paid$/i.test(str(d.status))) return 'Paid';
    if (paidSoFar > 0 && paidSoFar < total) return 'Partly paid';
    return str(d.status) || 'Sent';
};

/**
 * Rows for a period. `jobs` gives each job's name and client (for invoices without a client name). Documents of other
 * types are ignored, so the full document list can be passed in.
 */
export const buildBookkeeperRows = (docs: BookkeeperDoc[], range: DateRange, jobs: Map<string, { name: string; clientName?: string }> = new Map()): BookkeeperRow[] => {
    const rows: BookkeeperRow[] = [];
    const receiptIds = new Set<string>();
    for (const d of docs) if (exportTypeLabel(d.type) === 'Receipt') receiptIds.add(d.id);

    for (const d of docs) {
        const type = exportTypeLabel(d.type);
        const job = d.job_id ? jobs.get(d.job_id) : undefined;
        const jobName = job?.name || '';
        const date = documentDateOf(type, d, d.created_at);

        if (type === 'Invoice') {
            if (!isBilledInvoiceStatus(d.status)) continue;
            const m = documentMoney(type, d);
            const total = m.total || 0;
            const tax = m.tax || 0;
            // payments recorded with "Mark as paid" that have no receipt document (a receipt is listed on its own)
            for (const p of Array.isArray(d.payments) ? d.payments : []) {
                if (!p || typeof p !== 'object' || (p.receiptId && receiptIds.has(String(p.receiptId)))) continue;
                const pDate = normalizeYMD(p.date) || instantToLocalYMD(p.recordedAt) || '';
                if (!inRange(pDate, range)) continue;
                const amount = roundMoney(toNumber(p.amount));
                rows.push({
                    date: pDate, type: 'Payment', number: str(p.receiptNumber), party: str(d.clientName) || job?.clientName || '',
                    description: [str(p.method), `for invoice ${str(d.invoiceNumber) || '(no number)'}`].filter(Boolean).join(' · '),
                    net: amount, tax: 0, total: amount, status: 'Received', paidDate: pDate, category: 'Payment received', job: jobName,
                });
            }
            if (!inRange(date, range)) continue;
            rows.push({
                date, type: 'Invoice', number: str(d.invoiceNumber), party: str(d.clientName) || job?.clientName || '',
                description: str(d.title) || linesSummary(d.lineItems) || 'Invoice',
                net: roundMoney(total - tax), tax, total, status: invoiceStatus(d, total, m.amountPaid || 0), paidDate: paidDateOf(d),
                category: 'Sales', job: jobName,
            });
        } else if (type === 'Receipt') {
            if (!inRange(date, range)) continue;
            const amount = roundMoney(Math.max(0, toNumber(d.amount)));
            const forInvoice = str(d.invoiceNumber) ? `for invoice ${str(d.invoiceNumber)}` : '';
            rows.push({
                date, type: 'Payment', number: str(d.receiptNumber), party: str(d.clientName) || job?.clientName || '',
                description: [str(d.paymentMethod), plainText(d.description, 300) || forInvoice].filter(Boolean).join(' · ') || 'Payment received',
                net: amount, tax: 0, total: amount, status: str(d.paymentStatus) || 'Received', paidDate: date, category: 'Payment received', job: jobName,
            });
        } else if (type === 'Expense Log') {
            if (!inRange(date, range)) continue;
            const m = documentMoney(type, d);
            rows.push({
                date, type: 'Expense', number: '', party: str(d.vendor),
                description: str(d.item) || linesSummary(d.lineItems) || str(d.title) || 'Expense',
                net: m.subtotal || 0, tax: m.tax || 0, total: m.total || 0, status: 'Paid', paidDate: date, category: str(d.category) || 'Other', job: jobName,
            });
        } else if (type === 'Material Log') {
            if (!inRange(date, range)) continue;
            const items = Array.isArray(d.items) && d.items.length ? d.items : Array.isArray(d.materials) ? d.materials : [];
            for (const it of items) {
                if (!it || typeof it !== 'object') continue;
                const amount = roundMoney(toNumber(it.quantity) * toNumber(it.unitCost));
                const name = plainText(it.name ?? it.description, 200) || 'Material';
                rows.push({
                    date, type: 'Materials', number: '', party: str(it.supplier),
                    description: `${name} × ${qty(it.quantity)} @ ${money(it.unitCost)}`,
                    net: amount, tax: 0, total: amount, status: 'Recorded', paidDate: '', category: 'Materials', job: jobName,
                });
            }
        }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.number.localeCompare(b.number, undefined, { numeric: true }));
};

export const bookkeeperCsvRow = (r: BookkeeperRow): CsvValue[] => [
    r.date, r.type, r.number, r.party, r.description, money(r.net), money(r.tax), money(r.total), r.status, r.paidDate, r.category, r.job,
];

/** The CSV file (UTF-8 with BOM, CRLF). */
export const bookkeeperCsv = (rows: BookkeeperRow[]): string => toCsv([...BOOKKEEPER_HEADER], rows.map(bookkeeperCsvRow));

export interface BookkeeperSummary {
    invoices: { count: number; total: number };
    payments: { count: number; total: number };
    expenses: { count: number; total: number };
    materials: { count: number; total: number };
}

export const summarizeBookkeeper = (rows: BookkeeperRow[]): BookkeeperSummary => {
    const s: BookkeeperSummary = { invoices: { count: 0, total: 0 }, payments: { count: 0, total: 0 }, expenses: { count: 0, total: 0 }, materials: { count: 0, total: 0 } };
    const key: Record<BookkeeperRowType, keyof BookkeeperSummary> = { Invoice: 'invoices', Payment: 'payments', Expense: 'expenses', Materials: 'materials' };
    for (const r of rows) {
        const b = s[key[r.type]];
        b.count++;
        b.total = roundMoney(b.total + r.total);
    }
    return s;
};

// ------------------------------------------------------------------------------------------------------- periods
const YM = /^(\d{4})-(\d{2})$/;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/** "2026-10" → { start: "2026-10-01", end: "2026-10-31" } */
export const monthRange = (ym: string): DateRange | null => {
    const m = YM.exec(String(ym || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${String(lastDay(y, mo)).padStart(2, '0')}` };
};

/** The month before `today` ("2026-10" on 13 Nov 2026): the month a bookkeeper usually asks for. */
export const previousMonth = (today: Date = new Date()): string => {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** A valid range (start ≤ end, both YYYY-MM-DD) or null. */
export const customRange = (start: string, end: string): DateRange | null => {
    const s = normalizeYMD(start);
    const e = normalizeYMD(end);
    if (!s || !e || s > e) return null;
    return { start: s, end: e };
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026" for a whole month, else "2026-10-03 to 2026-11-02". */
export const rangeLabel = (r: DateRange): string => {
    const whole = monthRange(r.start.slice(0, 7));
    if (whole && whole.start === r.start && whole.end === r.end) return `${MONTHS[Number(r.start.slice(5, 7)) - 1]} ${r.start.slice(0, 4)}`;
    return `${r.start} to ${r.end}`;
};

/** "ContractorDocs-bookkeeping-2026-10.csv" / "ContractorDocs-bookkeeping-2026-10-03_to_2026-11-02.csv" */
export const bookkeeperFileName = (r: DateRange): string => {
    const whole = monthRange(r.start.slice(0, 7));
    const span = whole && whole.start === r.start && whole.end === r.end ? r.start.slice(0, 7) : `${r.start}_to_${r.end}`;
    return `ContractorDocs-bookkeeping-${span}.csv`;
};

// ------------------------------------------------------------------------------------------------------- email
export const isLikelyEmail = (s: unknown): boolean => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(s || '').trim());

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const bookkeeperEmail = (o: { range: DateRange; summary: BookkeeperSummary; company?: string; senderName?: string }) => {
    const label = rangeLabel(o.range);
    const who = o.company || o.senderName || 'ContractorDocs';
    const s = o.summary;
    const lines = [
        'Hi,',
        '',
        `Here is the bookkeeping export for ${label} from ${who}.`,
        '',
        `Invoices issued: ${s.invoices.count}, total ${usd(s.invoices.total)}`,
        `Payments received: ${s.payments.count}, total ${usd(s.payments.total)}`,
        `Expenses: ${s.expenses.count}, total ${usd(s.expenses.total)}`,
        `Materials: ${s.materials.count} line${s.materials.count === 1 ? '' : 's'}, total ${usd(s.materials.total)}`,
        '',
        'The attached CSV has one row per invoice, payment, expense and material line, with these columns:',
        `${BOOKKEEPER_HEADER.join(', ')}.`,
        'Amounts are plain numbers without currency signs and dates are YYYY-MM-DD. Draft and cancelled invoices are not included.',
        '',
        'Thanks,',
        o.senderName || who,
    ];
    return { subject: `Bookkeeping export: ${label} (${who})`, text: lines.join('\n') };
};

/** UTF-8 text → base64 (Gmail attachments). */
export const utf8ToBase64 = (text: string): string => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
};
