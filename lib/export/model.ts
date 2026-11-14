/**
 * "Export everything": what goes in each CSV (pure: rows in, CSV cells out; tested by scripts/export-check.ts).
 * Money uses the app's own math (utils/money.ts, lib/finance.ts), so a total in documents.csv is the total printed on
 * the PDF, shown in Job financials and sent to the client.
 *
 * Secrets are never exported: no client-portal keys, approval tokens or Gmail data.
 */
import { computeDocumentTotals, lineItemAmount, roundMoney, toNumber } from '../../utils/money.ts';
import { expenseTotal, isBilledInvoiceStatus, materialCost } from '../finance.ts';
import { instantToLocalYMD, normalizeYMD } from '../../utils/localDates.ts';
import { money, plainText, qty, type CsvValue } from './csv.ts';

// ------------------------------------------------------------------------------------------- rows from the database
export interface ExportJobRow {
    id: string; name?: string | null; client_id?: string | null; client_name?: string | null; client_address?: string | null;
    start_date?: string | null; end_date?: string | null; status?: string | null; worker_name?: string | null; created_at?: string | null;
}
export interface ExportClientRow {
    id: string; name?: string | null; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null; created_at?: string | null;
}
export interface ExportDocRow {
    id: string; job_id?: string | null; client_id?: string | null; type: string; created_at?: string | null; updated_at?: string | null;
    data: Record<string, any> | null;
}
export interface ExportInventoryRow {
    id: string; name?: string | null; sku?: string | null; category?: string | null; unit?: string | null; quantity?: number | string | null;
    cost_price?: number | string | null; low_stock_threshold?: number | string | null; supplier?: string | null; location?: string | null;
    is_assembly?: boolean | null; assembly_items?: unknown; created_at?: string | null;
}
export interface ExportHistoryRow {
    id: string; item_id?: string | null; item_name?: string | null; action?: string | null; quantity_change?: number | string | null;
    quantity_after?: number | string | null; notes?: string | null; job_id?: string | null; document_id?: string | null; source?: string | null; created_at?: string | null;
}
export interface ExportPriceItemRow {
    id: string; name?: string | null; description?: string | null; rate?: number | string | null; unit_cost?: number | string | null; unit?: string | null;
    category?: string | null; category_id?: string | null; type?: string | null; taxable?: boolean | null; sku?: string | null; markup?: number | string | null;
    is_assembly?: boolean | null; is_favorite?: boolean | null; last_used_at?: string | null; use_count?: number | null; created_at?: string | null;
}
export interface ExportCategoryRow { id: string; name?: string | null; parent_id?: string | null }
export interface ExportReminderRow {
    id: string; kind?: string | null; document_id?: string | null; job_id?: string | null; step_key?: string | null; scheduled_for?: string | null;
    status?: string | null; reason?: string | null; to_email?: string | null; subject?: string | null; sent_at?: string | null; last_error?: string | null; created_at?: string | null;
}
export interface ExportQuoteRequestRow {
    id: string; name?: string | null; phone?: string | null; email?: string | null; address?: string | null; details?: string | null;
    photo_paths?: string[] | null; source?: string | null; status?: string | null; job_id?: string | null; converted_at?: string | null; created_at?: string | null;
}

// ------------------------------------------------------------------------------------------------------- the CSVs
export type CsvKey =
    | 'jobs' | 'clients' | 'documents' | 'line_items' | 'payments' | 'time_sheets' | 'expense_logs'
    | 'inventory' | 'inventory_history' | 'price_book' | 'reminders_log' | 'quote_requests';

export const CSV_TABLES: Record<CsvKey, { file: string; about: string; header: string[] }> = {
    jobs: {
        file: 'jobs.csv', about: 'every job, its client, dates, number of documents, amount invoiced and its PDF folder',
        header: ['Job ID', 'Name', 'Client', 'Client ID', 'Address', 'Status', 'Start date', 'End date', 'Worker', 'Created', 'Documents', 'Invoiced', 'PDF folder'],
    },
    clients: {
        file: 'clients.csv', about: 'your clients and their contact details',
        header: ['Client ID', 'Name', 'Email', 'Phone', 'Address', 'Notes', 'Created'],
    },
    documents: {
        file: 'documents.csv', about: 'every document with its number, status, client, dates and totals',
        header: ['Document ID', 'Job ID', 'Job', 'Type', 'Number', 'Title', 'Status', 'Client', 'Date', 'Due / valid until', 'Subtotal', 'Discount', 'Tax', 'Shipping',
            'Total', 'Amount paid', 'Balance due', 'Paid date', 'Signed by', 'Signed at', 'Created', 'Last changed', 'PDF file'],
    },
    line_items: {
        file: 'line_items.csv', about: 'the lines of invoices, estimates, change orders, purchase orders, expense and material logs',
        header: ['Document ID', 'Document type', 'Document number', 'Job', 'Line', 'Description', 'Quantity', 'Unit price', 'Amount', 'Unit cost', 'Supplier', 'Percent complete'],
    },
    payments: {
        file: 'payments.csv', about: 'payments received: receipts, and payments recorded with "Mark as paid"',
        header: ['Date', 'Amount', 'Method', 'Receipt number', 'Invoice number', 'Client', 'Job', 'Status', 'Note', 'Recorded as', 'Receipt document ID', 'Invoice document ID'],
    },
    time_sheets: {
        file: 'time_sheets.csv', about: 'hours per worker and job',
        header: ['Document ID', 'Date', 'Worker', 'Job', 'Client', 'Hours', 'Overtime hours', 'Total hours', 'Status', 'Notes'],
    },
    expense_logs: {
        file: 'expense_logs.csv', about: 'job expenses with vendor, category and tax',
        header: ['Document ID', 'Date', 'Vendor', 'Description', 'Category', 'Net', 'Tax', 'Total', 'Job', 'Notes'],
    },
    inventory: {
        file: 'inventory.csv', about: 'stock on hand, unit cost and value',
        header: ['Item ID', 'Name', 'SKU', 'Category', 'Unit', 'Quantity', 'Unit cost', 'Stock value', 'Low-stock alert at', 'Supplier', 'Location', 'Kit', 'Kit parts', 'Created'],
    },
    inventory_history: {
        file: 'inventory_history.csv', about: 'every stock movement (added, used on a job, adjusted)',
        header: ['Date', 'Item ID', 'Item', 'Action', 'Quantity change', 'Quantity after', 'Job', 'Document ID', 'Source', 'Notes'],
    },
    price_book: {
        file: 'price_book.csv', about: 'your saved services, materials and kits with prices and costs',
        header: ['Item ID', 'Name', 'Description', 'Type', 'Category', 'SKU', 'Unit', 'Price', 'Unit cost', 'Markup %', 'Taxable', 'Kit', 'Favorite', 'Times used', 'Last used', 'Created'],
    },
    reminders_log: {
        file: 'reminders_log.csv', about: 'automatic reminders that were sent, skipped or failed',
        header: ['Created', 'Kind', 'Step', 'Scheduled for', 'Status', 'Reason', 'Sent to', 'Subject', 'Sent at', 'Document ID', 'Job', 'Error'],
    },
    quote_requests: {
        file: 'quote_requests.csv', about: 'requests from your request-a-quote page',
        header: ['Received', 'Name', 'Phone', 'Email', 'Address', 'Details', 'Status', 'Source', 'Photos', 'Job', 'Converted'],
    },
};

/** Order of the CSVs in the README. */
export const CSV_ORDER: CsvKey[] = [
    'jobs', 'clients', 'documents', 'line_items', 'payments', 'time_sheets', 'expense_logs',
    'inventory', 'inventory_history', 'price_book', 'reminders_log', 'quote_requests',
];

// ------------------------------------------------------------------------------------------------------ documents
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const squash = (v: unknown): string => str(v).toLowerCase().replace(/[\s_-]+/g, '');

const TYPE_ALIASES: Record<string, string> = {
    invoice: 'Invoice', estimate: 'Estimate', quote: 'Estimate', workorder: 'Work Order', dailyjobreport: 'Daily Job Report',
    dailyreport: 'Daily Job Report', timesheet: 'Time Sheet', materiallog: 'Material Log', expenselog: 'Expense Log', expense: 'Expense Log',
    warranty: 'Warranty', note: 'Note', receipt: 'Receipt', changeorder: 'Change Order', purchaseorder: 'Purchase Order', po: 'Purchase Order',
    profitreport: 'Profit Report',
};

/** "INVOICE", "daily_report", "WorkOrder" → the app's type label ("Invoice", "Daily Job Report", "Work Order"). */
export const exportTypeLabel = (raw: unknown): string => TYPE_ALIASES[squash(raw)] || str(raw) || 'Document';

const NUMBER_FIELD: Record<string, string> = {
    'Invoice': 'invoiceNumber', 'Estimate': 'estimateNumber', 'Change Order': 'changeOrderNumber', 'Work Order': 'workOrderNumber',
    'Purchase Order': 'poNumber', 'Receipt': 'receiptNumber', 'Daily Job Report': 'reportNumber', 'Profit Report': 'reportNumber',
    'Warranty': 'warrantyNumber',
};

/** The document's own reference number (a receipt's `invoiceNumber` is the invoice it pays, not its number). */
export const documentNumberOf = (type: string, d: Record<string, any> | null | undefined): string => {
    const field = NUMBER_FIELD[type];
    if (field) return str(d?.[field]);
    return '';
};

/** Business date of a document ("YYYY-MM-DD"): issue date for invoices/estimates, the form date otherwise, else the day it was created. */
export const documentDateOf = (type: string, d: Record<string, any> | null | undefined, createdAt?: string | null): string => {
    const primary = type === 'Invoice' || type === 'Estimate' ? d?.issueDate ?? d?.date
        : type === 'Warranty' ? d?.completedDate ?? d?.date
            : d?.date ?? d?.issueDate;
    return normalizeYMD(primary) || instantToLocalYMD(createdAt) || '';
};

const dueDateOf = (type: string, d: Record<string, any>): string =>
    normalizeYMD(type === 'Invoice' ? d.dueDate : type === 'Estimate' ? d.expiryDate : type === 'Purchase Order' ? d.deliveryDate : null) || '';

export interface DocMoney {
    subtotal?: number; discount?: number; tax?: number; shipping?: number; total?: number; amountPaid?: number; balanceDue?: number;
}

const LINE_ITEM_TYPES = new Set(['Invoice', 'Estimate', 'Change Order', 'Purchase Order']);

/** Totals of one document, by type (empty for documents without money, such as notes and daily reports). */
export const documentMoney = (type: string, d: Record<string, any> | null | undefined): DocMoney => {
    const data = d || {};
    if (LINE_ITEM_TYPES.has(type)) {
        const t = computeDocumentTotals({ ...data, isProgressBilling: data.isProgressBilling === true || str(data.isProgressBilling).toLowerCase() === 'true' });
        const paid = type === 'Invoice' && /^paid$/i.test(str(data.status));
        return {
            subtotal: t.subtotal, discount: t.discount, tax: t.tax, shipping: t.shipping, total: t.total,
            ...(type === 'Invoice' ? { amountPaid: paid ? Math.max(t.amountPaid, t.total) : t.amountPaid, balanceDue: paid ? 0 : t.balanceDue } : {}),
        };
    }
    if (type === 'Receipt') return { total: roundMoney(Math.max(0, toNumber(data.amount))) };
    if (type === 'Expense Log') {
        const total = expenseTotal(data);
        const tax = roundMoney(Math.max(0, toNumber(data.tax)));
        return { subtotal: roundMoney(total - tax), tax, total };
    }
    if (type === 'Material Log') return { subtotal: materialCost(data), total: materialCost(data) };
    if (type === 'Work Order') return toNumber(data.cost) ? { total: roundMoney(toNumber(data.cost)) } : {};
    if (type === 'Profit Report') return { subtotal: roundMoney(toNumber(data.totalRevenue)), tax: roundMoney(toNumber(data.taxAmount)), total: roundMoney(toNumber(data.totalWithTax)) };
    return {};
};

/** Date an invoice was paid in full: `paidAt`, else the last recorded payment when the status is Paid. */
export const paidDateOf = (d: Record<string, any> | null | undefined): string => {
    const at = normalizeYMD(d?.paidAt);
    if (at) return at;
    if (!/^paid$/i.test(str(d?.status))) return '';
    const dates = (Array.isArray(d?.payments) ? d!.payments : []).map((p: any) => normalizeYMD(p?.date)).filter(Boolean) as string[];
    return dates.sort().pop() || '';
};

/** What a job's row in documents.csv / jobs.csv needs to know about the job. */
export interface JobInfo { name: string; clientName: string; folder: string }

export interface DocContext {
    job?: JobInfo | null;
    /** path of the PDF in the ZIP ('' in a spreadsheets-only export) */
    pdfPath?: string;
}

/** A document's identity for the layout and the summaries. */
export const describeDocument = (row: ExportDocRow) => {
    const type = exportTypeLabel(row.type);
    const d = row.data || {};
    return {
        type,
        number: documentNumberOf(type, d),
        date: documentDateOf(type, d, row.created_at),
        title: str(d.title),
    };
};

export const documentCsvRow = (row: ExportDocRow, ctx: DocContext = {}): CsvValue[] => {
    const d = row.data || {};
    const { type, number, date, title } = describeDocument(row);
    const m = documentMoney(type, d);
    const opt = (v: number | undefined) => (v === undefined ? '' : money(v));
    return [
        row.id, row.job_id || '', ctx.job?.name || '', type, number, title, str(d.status), str(d.clientName) || ctx.job?.clientName || '',
        date, dueDateOf(type, d),
        opt(m.subtotal), opt(m.discount), opt(m.tax), opt(m.shipping), opt(m.total), opt(m.amountPaid), opt(m.balanceDue),
        type === 'Invoice' ? paidDateOf(d) : '',
        str(d.clientSignedBy), str(d.clientSignedAt), str(row.created_at), str(row.updated_at), ctx.pdfPath || '',
    ];
};

/** The lines of a document (line items, material log items, profit report items). */
export const lineItemRows = (row: ExportDocRow, ctx: DocContext = {}): CsvValue[][] => {
    const d = row.data || {};
    const { type, number } = describeDocument(row);
    const head = [row.id, type, number, ctx.job?.name || ''];
    const out: CsvValue[][] = [];
    const progress = d.isProgressBilling === true || str(d.isProgressBilling).toLowerCase() === 'true';
    if (Array.isArray(d.lineItems)) {
        d.lineItems.forEach((li: any, i: number) => {
            if (!li || typeof li !== 'object') return;
            out.push([...head, i + 1, plainText(li.description, 1000), qty(li.quantity ?? (type === 'Expense Log' ? 1 : 0)), money(li.rate),
                money(type === 'Expense Log' ? toNumber(li.quantity ?? 1) * toNumber(li.rate) : lineItemAmount(li, progress)),
                money(li.unitCost, true), '', progress ? qty(li.percentComplete, true) : '']);
        });
    }
    if (type === 'Material Log') {
        const items = Array.isArray(d.items) && d.items.length ? d.items : Array.isArray(d.materials) ? d.materials : [];
        items.forEach((it: any, i: number) => {
            if (!it || typeof it !== 'object') return;
            out.push([...head, i + 1, plainText(it.name ?? it.description, 1000), qty(it.quantity), money(it.unitCost),
                money(toNumber(it.quantity) * toNumber(it.unitCost)), money(it.unitCost), str(it.supplier), '']);
        });
    }
    if (type === 'Profit Report' && Array.isArray(d.items)) {
        d.items.forEach((it: any, i: number) => {
            if (!it || typeof it !== 'object') return;
            out.push([...head, i + 1, plainText(it.description, 1000), '1', money(it.charge), money(it.charge), money(it.cost), '', '']);
        });
    }
    return out;
};

/** A payment recorded on an invoice ("Mark as paid"); kept until the end so receipts already exported aren't repeated. */
export interface InvoicePaymentEntry {
    invoiceId: string; invoiceNumber: string; client: string; job: string;
    date: string; amount: number; method: string; receiptId: string; receiptNumber: string;
}

export const invoicePaymentEntries = (row: ExportDocRow, ctx: DocContext = {}): InvoicePaymentEntry[] => {
    const d = row.data || {};
    if (exportTypeLabel(row.type) !== 'Invoice' || !Array.isArray(d.payments)) return [];
    return d.payments.filter((p: any) => p && typeof p === 'object').map((p: any) => ({
        invoiceId: row.id, invoiceNumber: str(d.invoiceNumber), client: str(d.clientName) || ctx.job?.clientName || '', job: ctx.job?.name || '',
        date: normalizeYMD(p.date) || instantToLocalYMD(p.recordedAt) || '', amount: roundMoney(toNumber(p.amount)), method: str(p.method),
        receiptId: str(p.receiptId), receiptNumber: str(p.receiptNumber),
    }));
};

export const receiptPaymentRow = (row: ExportDocRow, ctx: DocContext = {}): CsvValue[] => {
    const d = row.data || {};
    return [
        documentDateOf('Receipt', d, row.created_at), money(Math.max(0, toNumber(d.amount))), str(d.paymentMethod), str(d.receiptNumber), str(d.invoiceNumber),
        str(d.clientName) || ctx.job?.clientName || '', ctx.job?.name || '', str(d.paymentStatus) || 'Received', plainText(d.description, 1000),
        'Receipt', row.id, str(d.invoiceId),
    ];
};

export const invoicePaymentRow = (p: InvoicePaymentEntry): CsvValue[] => [
    p.date, money(p.amount), p.method, p.receiptNumber, p.invoiceNumber, p.client, p.job, 'Recorded', '', 'Payment on invoice', p.receiptId, p.invoiceId,
];

/** Invoice payments whose receipt document isn't in the export (the receipt was deleted, or none was made). */
export const paymentsWithoutReceipt = (entries: InvoicePaymentEntry[], exportedReceiptIds: Set<string>): InvoicePaymentEntry[] =>
    entries.filter(p => !p.receiptId || !exportedReceiptIds.has(p.receiptId));

export const timeSheetRow = (row: ExportDocRow, ctx: DocContext = {}): CsvValue[] => {
    const d = row.data || {};
    const hours = Math.max(0, toNumber(d.hoursWorked));
    const overtime = Math.max(0, toNumber(d.overtimeHours));
    return [
        row.id, documentDateOf('Time Sheet', d, row.created_at), str(d.workerName), ctx.job?.name || '', str(d.clientName) || ctx.job?.clientName || '',
        qty(hours), qty(overtime), qty(hours + overtime), str(d.status), plainText(d.notes, 2000),
    ];
};

export const expenseRow = (row: ExportDocRow, ctx: DocContext = {}): CsvValue[] => {
    const d = row.data || {};
    const m = documentMoney('Expense Log', d);
    const lines = (Array.isArray(d.lineItems) ? d.lineItems : []).map((li: any) => plainText(li?.description, 200)).filter(Boolean);
    const description = str(d.item) || lines.join('; ') || str(d.title);
    return [
        row.id, documentDateOf('Expense Log', d, row.created_at), str(d.vendor), description, str(d.category), money(m.subtotal), money(m.tax), money(m.total),
        ctx.job?.name || '', plainText(d.notes, 2000),
    ];
};

// --------------------------------------------------------------------------------------------- the other tables
export interface JobStats { documents: number; invoiced: number }

/** Adds one document to its job's counters (documents, billed invoices). */
export const addToJobStats = (stats: Map<string, JobStats>, row: ExportDocRow): void => {
    const key = row.job_id || '';
    const s = stats.get(key) || { documents: 0, invoiced: 0 };
    s.documents += 1;
    const type = exportTypeLabel(row.type);
    if (type === 'Invoice' && isBilledInvoiceStatus(row.data?.status)) s.invoiced = roundMoney(s.invoiced + (documentMoney(type, row.data).total || 0));
    stats.set(key, s);
};

export const jobCsvRow = (job: ExportJobRow, folder: string, stats?: JobStats): CsvValue[] => [
    job.id, str(job.name), str(job.client_name), str(job.client_id), str(job.client_address), str(job.status), normalizeYMD(job.start_date) || '',
    normalizeYMD(job.end_date) || '', str(job.worker_name), str(job.created_at), stats?.documents ?? 0, money(stats?.invoiced ?? 0), folder,
];

export const clientCsvRow = (c: ExportClientRow): CsvValue[] => [
    c.id, str(c.name), str(c.email), str(c.phone), str(c.address), plainText(c.notes, 5000), str(c.created_at),
];

export const inventoryCsvRow = (it: ExportInventoryRow): CsvValue[] => {
    const quantity = toNumber(it.quantity);
    const cost = toNumber(it.cost_price);
    return [
        it.id, str(it.name), str(it.sku), str(it.category), str(it.unit), qty(quantity), money(cost), money(Math.max(0, quantity) * cost),
        qty(it.low_stock_threshold, true), str(it.supplier), str(it.location), Boolean(it.is_assembly),
        Array.isArray(it.assembly_items) ? it.assembly_items.length : 0, str(it.created_at),
    ];
};

export const historyCsvRow = (h: ExportHistoryRow, jobName = ''): CsvValue[] => [
    str(h.created_at), str(h.item_id), str(h.item_name), str(h.action), qty(h.quantity_change), qty(h.quantity_after, true), jobName,
    str(h.document_id), str(h.source), plainText(h.notes, 1000),
];

export const priceBookCsvRow = (it: ExportPriceItemRow, categoryName = ''): CsvValue[] => [
    it.id, str(it.name), plainText(it.description, 2000), str(it.type), categoryName || str(it.category), str(it.sku), str(it.unit), money(it.rate),
    money(it.unit_cost), qty(it.markup, true), it.taxable === null || it.taxable === undefined ? '' : Boolean(it.taxable), Boolean(it.is_assembly),
    Boolean(it.is_favorite), toNumber(it.use_count), str(it.last_used_at), str(it.created_at),
];

/** "Roofing › Shingles" for nested price book categories. */
export const categoryPaths = (rows: ExportCategoryRow[]): Map<string, string> => {
    const byId = new Map(rows.map(r => [r.id, r]));
    const out = new Map<string, string>();
    for (const r of rows) {
        const names: string[] = [];
        let cur: ExportCategoryRow | undefined = r;
        for (let guard = 0; cur && guard < 10; guard++) {
            names.unshift(str(cur.name));
            cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
        }
        out.set(r.id, names.filter(Boolean).join(' › '));
    }
    return out;
};

export const reminderCsvRow = (r: ExportReminderRow, jobName = ''): CsvValue[] => [
    str(r.created_at), str(r.kind), str(r.step_key), normalizeYMD(r.scheduled_for) || '', str(r.status), str(r.reason), str(r.to_email), str(r.subject),
    str(r.sent_at), str(r.document_id), jobName, str(r.last_error),
];

export const quoteRequestCsvRow = (q: ExportQuoteRequestRow, jobName = ''): CsvValue[] => [
    str(q.created_at), str(q.name), str(q.phone), str(q.email), str(q.address), plainText(q.details, 3000), str(q.status), str(q.source),
    Array.isArray(q.photo_paths) ? q.photo_paths.length : 0, jobName, str(q.converted_at),
];

/** One line of data/documents.jsonl: the document as saved (minus the approval token, which is a key, not data). */
export const documentJsonLine = (row: ExportDocRow): string =>
    `${JSON.stringify({ id: row.id, job_id: row.job_id ?? null, client_id: row.client_id ?? null, type: row.type, created_at: row.created_at ?? null, updated_at: row.updated_at ?? null, data: row.data ?? {} })}\n`;
