/**
 * Import files for QuickBooks Online and Xero (roadmap N10). Pure: documents, jobs and clients in, CSV text out.
 * scripts/integrations-check.ts tests it (sums against the app's own money math, escaping, date formats, filters).
 * The existing bookkeeper CSV (lib/export/bookkeeper.ts) is NOT replaced: this adds files in the layouts the two apps
 * import.
 *
 * FOUR FILES PER APP
 *   invoices   one row per invoice LINE (the invoice fields repeat on each row, as both apps expect)
 *   contacts   customers / contacts
 *   expenses   the Expense Log, as bills (one row per expense, the full amount paid, tax included)
 *   payments   money received, in the bank-statement layout each app can import (the app matches it to the invoices
 *              when the owner reconciles: neither app imports "payment on invoice 1001" from a file)
 *
 * THE COLUMN NAMES ARE DATA. Every layout below is a plain table: [column header, field, kind]. The headers were
 * written from the apps' documented import templates and may have moved since: when an app renames a column, change the
 * header string here and nothing else. The screen tells the owner to check them against the app's current template.
 *
 * MONEY MATCHES THE DOCUMENTS (utils/money.ts + lib/finance.ts, the same math as the PDF, the portal and Insights):
 *   - unselected optional add-ons are left out, progress billing exports what THIS invoice bills
 *   - the flat discount becomes its own line "Discount" (negative, taxed like the rest, as the document taxes it)
 *   - shipping becomes its own line "Shipping" (not taxed, as on the document)
 *   - per invoice: sum of line amounts + tax = the document total, to the cent. QuickBooks gets the tax split per line
 *     (the document's tax shared out by cents so it adds up); Xero works the tax out itself from the tax type named.
 *
 * FORMAT: UTF-8 with BOM, CRLF, quotes doubled, text that starts with = + - @ gets a leading apostrophe (lib/export/csv.ts),
 * amounts with 2 decimals and no currency sign, dates in the layout's date format (default YYYY-MM-DD).
 */
import { countedLineItems, lineItemAmount, roundMoney, toNumber } from '../../utils/money.ts';
import { documentTotals, isBilledInvoiceStatus, isPaidStatus, expenseTotal, type FinanceDoc } from '../finance.ts';
import { normalizeYMD } from '../../utils/localDates.ts';
import { documentDateOf, exportTypeLabel, invoicePaymentEntries, paymentsWithoutReceipt, type ExportClientRow, type ExportDocRow } from '../export/model.ts';
import { money, plainText, qty, toCsv } from '../export/csv.ts';
import type { DateRange } from '../export/bookkeeper.ts';

export type AccountingApp = 'quickbooks' | 'xero';
export type ExportKind = 'invoices' | 'contacts' | 'expenses' | 'payments';
export type DateFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';

export const ACCOUNTING_APPS: ReadonlyArray<{ id: AccountingApp; label: string }> = [
    { id: 'quickbooks', label: 'QuickBooks Online' },
    { id: 'xero', label: 'Xero' },
];

export const EXPORT_KINDS: ReadonlyArray<{ id: ExportKind; label: string; about: string }> = [
    { id: 'invoices', label: 'Invoices', about: 'Sent, overdue and paid invoices, one row per line. Drafts and cancelled ones are left out.' },
    { id: 'contacts', label: 'Customers', about: 'Your clients with email, phone and address.' },
    { id: 'expenses', label: 'Expenses', about: 'Your Expense Log as bills: vendor, date, description and the full amount paid.' },
    { id: 'payments', label: 'Payments received', about: 'Receipts and payments marked as paid, in the bank-statement layout your app imports.' },
];

export const DATE_FORMATS: ReadonlyArray<{ id: DateFormat; label: string }> = [
    { id: 'YYYY-MM-DD', label: 'Year first (2026-03-04)' },
    { id: 'MM/DD/YYYY', label: 'Month first (03/04/2026)' },
    { id: 'DD/MM/YYYY', label: 'Day first (04/03/2026)' },
];

/** "2026-03-04" in the chosen format ('' for anything that is not a date). */
export const formatDate = (ymd: unknown, format: DateFormat): string => {
    const v = normalizeYMD(ymd);
    if (!v) return '';
    const [y, m, d] = v.split('-');
    if (format === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
    if (format === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
    return v;
};

// =========================================================================================================== layouts
export type ColKind = 'text' | 'money' | 'qty' | 'date';
/** [column header, field of the row below, kind]. Field 'blank' is an empty column the app expects. */
export type ColumnDef = readonly [header: string, field: string, kind?: ColKind];

export interface LayoutVariable {
    key: string;
    label: string;
    value: string;
    help: string;
}

export interface Layout {
    app: AccountingApp;
    kind: ExportKind;
    /** where it is imported in the app (a sentence for the screen) */
    importAt: string;
    /** date format used unless the owner picks another: documented per layout */
    dateFormat: DateFormat;
    columns: readonly ColumnDef[];
    /** values the owner may need to change so the file matches their books (account code, tax names ...) */
    variables: readonly LayoutVariable[];
    /** one sentence about how this layout treats the numbers */
    note: string;
}

const XERO_BILL_VARIABLES: readonly LayoutVariable[] = [
    { key: 'accountCode', label: 'Expense account code', value: '429', help: 'The account code in your Xero chart of accounts that expenses are filed under.' },
    { key: 'untaxedType', label: 'Tax type', value: 'Tax Exempt', help: 'The amounts already include any tax you paid, so use a no-tax rate. Spell it as in Xero > Accounting > Tax rates.' },
];

export const LAYOUTS: Record<`${AccountingApp}.${ExportKind}`, Layout> = {
    'xero.invoices': {
        app: 'xero', kind: 'invoices', dateFormat: 'YYYY-MM-DD',
        importAt: 'Xero: Business > Invoices > Import (Sales invoices).',
        columns: [
            ['*ContactName', 'contactName'], ['EmailAddress', 'email'], ['*InvoiceNumber', 'invoiceNo'], ['Reference', 'reference'],
            ['*InvoiceDate', 'invoiceDate', 'date'], ['*DueDate', 'dueDate', 'date'], ['InventoryItemCode', 'blank'],
            ['*Description', 'description'], ['*Quantity', 'quantity', 'qty'], ['*UnitAmount', 'unitAmount', 'money'],
            ['*AccountCode', 'accountCode'], ['*TaxType', 'taxType'],
            ['TrackingName1', 'blank'], ['TrackingOption1', 'blank'], ['TrackingName2', 'blank'], ['TrackingOption2', 'blank'],
        ],
        variables: [
            { key: 'accountCode', label: 'Sales account code', value: '200', help: 'The account code income is filed under in your Xero chart of accounts (200 is Xero’s usual "Sales").' },
            { key: 'taxedType', label: 'Tax type on taxed invoices', value: 'Tax on Sales', help: 'Spell it exactly as in Xero > Accounting > Tax rates. Xero works out the tax from this rate, so it should match the rate on your invoices.' },
            { key: 'untaxedType', label: 'Tax type with no tax', value: 'Tax Exempt', help: 'Used for invoices without tax and for the Shipping line.' },
        ],
        note: 'Amounts are before tax. Discounts and shipping are their own lines so each invoice adds up to the total on your PDF.',
    },
    'xero.contacts': {
        app: 'xero', kind: 'contacts', dateFormat: 'YYYY-MM-DD',
        importAt: 'Xero: Contacts > Import.',
        columns: [
            ['*ContactName', 'name'], ['EmailAddress', 'email'], ['PhoneNumber', 'phone'], ['POAddressLine1', 'street'], ['POCity', 'city'],
            ['PORegion', 'state'], ['POPostalCode', 'zip'], ['POCountry', 'country'],
        ],
        variables: [],
        note: 'One row per client. Two clients with the same name are listed once.',
    },
    'xero.expenses': {
        app: 'xero', kind: 'expenses', dateFormat: 'YYYY-MM-DD',
        importAt: 'Xero: Business > Bills to pay > Import.',
        columns: [
            ['*ContactName', 'contactName'], ['EmailAddress', 'blank'], ['*InvoiceNumber', 'invoiceNo'], ['Reference', 'reference'],
            ['*InvoiceDate', 'invoiceDate', 'date'], ['*DueDate', 'dueDate', 'date'], ['InventoryItemCode', 'blank'],
            ['*Description', 'description'], ['*Quantity', 'quantity', 'qty'], ['*UnitAmount', 'unitAmount', 'money'],
            ['*AccountCode', 'accountCode'], ['*TaxType', 'taxType'],
            ['TrackingName1', 'blank'], ['TrackingOption1', 'blank'], ['TrackingName2', 'blank'], ['TrackingOption2', 'blank'],
        ],
        variables: XERO_BILL_VARIABLES,
        note: 'One bill per expense for the full amount you paid. They are already paid: match them to your bank feed or mark them paid.',
    },
    'xero.payments': {
        app: 'xero', kind: 'payments', dateFormat: 'YYYY-MM-DD',
        importAt: 'Xero: Accounting > Bank accounts > Import a statement.',
        columns: [['*Date', 'date', 'date'], ['*Amount', 'amount', 'money'], ['Payee', 'payee'], ['Description', 'description'], ['Reference', 'reference'], ['Check Number', 'blank']],
        variables: [],
        note: 'Bank-statement layout: money in is positive. Reconcile each line against its invoice in Xero.',
    },
    'quickbooks.invoices': {
        app: 'quickbooks', kind: 'invoices', dateFormat: 'YYYY-MM-DD',
        importAt: 'QuickBooks Online: Settings > Import data > Invoices.',
        columns: [
            ['InvoiceNo', 'invoiceNo'], ['Customer', 'contactName'], ['InvoiceDate', 'invoiceDate', 'date'], ['DueDate', 'dueDate', 'date'],
            ['Terms', 'terms'], ['Location', 'blank'], ['Memo', 'memo'], ['Item(Product/Service)', 'itemName'], ['ItemDescription', 'description'],
            ['ItemQuantity', 'quantity', 'qty'], ['ItemRate', 'unitAmount', 'money'], ['ItemAmount', 'lineAmount', 'money'],
            ['ItemTaxCode', 'taxCode'], ['ItemTaxAmount', 'taxAmount', 'money'], ['Service Date', 'blank'],
        ],
        variables: [
            { key: 'itemName', label: 'Product or service name', value: 'Services', help: 'Every line is filed under this item; the real text is in ItemDescription. It should exist in QuickBooks.' },
            { key: 'taxedCode', label: 'Tax code on taxed lines', value: 'TAX', help: 'As named in QuickBooks. Used for lines the invoice taxes.' },
            { key: 'untaxedCode', label: 'Tax code with no tax', value: 'NON', help: 'Used for invoices without tax and for the Shipping line.' },
        ],
        note: 'Amounts are before tax and the tax of each invoice is split across its lines so every invoice adds up to the total on your PDF.',
    },
    'quickbooks.contacts': {
        app: 'quickbooks', kind: 'contacts', dateFormat: 'YYYY-MM-DD',
        importAt: 'QuickBooks Online: Settings > Import data > Customers.',
        columns: [
            ['Display Name', 'name'], ['Email', 'email'], ['Phone', 'phone'], ['Billing Address Line 1', 'street'], ['Billing City', 'city'],
            ['Billing State', 'state'], ['Billing ZIP', 'zip'], ['Billing Country', 'country'], ['Notes', 'notes'],
        ],
        variables: [],
        note: 'One row per client. The name is the Display Name, the same name the invoices file uses in its Customer column.',
    },
    'quickbooks.expenses': {
        app: 'quickbooks', kind: 'expenses', dateFormat: 'YYYY-MM-DD',
        importAt: 'QuickBooks Online: Settings > Import data > Bills.',
        columns: [
            ['BillNo', 'invoiceNo'], ['Vendor', 'contactName'], ['BillDate', 'invoiceDate', 'date'], ['DueDate', 'dueDate', 'date'], ['Terms', 'blank'],
            ['Location', 'blank'], ['Memo', 'memo'], ['Account', 'accountName'], ['LineDescription', 'description'], ['LineAmount', 'lineAmount', 'money'],
            ['LineTaxCode', 'blank'], ['LineTaxAmount', 'blank'],
        ],
        variables: [
            { key: 'accountName', label: 'Expense account', value: 'Job Expenses', help: 'The account name in your QuickBooks chart of accounts that expenses are filed under.' },
        ],
        note: 'One bill per expense for the full amount you paid, tax included. They are already paid: match them to your bank feed or mark them paid.',
    },
    'quickbooks.payments': {
        app: 'quickbooks', kind: 'payments', dateFormat: 'YYYY-MM-DD',
        importAt: 'QuickBooks Online: Transactions > Bank transactions > Upload (3 columns: Date, Description, Amount).',
        columns: [['Date', 'date', 'date'], ['Description', 'bankDescription'], ['Amount', 'amount', 'money']],
        variables: [],
        note: 'Bank-statement layout: money in is positive. Match each line to its invoice in QuickBooks.',
    },
};

export const layoutFor = (app: AccountingApp, kind: ExportKind): Layout => LAYOUTS[`${app}.${kind}`];

/** The layout's variables as { key: value } (defaults overlaid with what the owner saved). */
export const resolveVariables = (layout: Layout, saved?: Record<string, unknown> | null): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const v of layout.variables) {
        const s = saved && typeof saved[v.key] === 'string' ? String(saved[v.key]).trim() : '';
        out[v.key] = s || v.value;
    }
    return out;
};

// ========================================================================================================= inputs
export interface AccountingJob { id: string; name?: string | null; client_id?: string | null; client_name?: string | null }
export type AccountingClient = ExportClientRow;
export type AccountingDoc = ExportDocRow;

export type InvoiceStatusFilter = 'billed' | 'unpaid' | 'paid';
export type PaymentSourceFilter = 'all' | 'receipts' | 'invoices';
export type ContactFilter = 'all' | 'invoiced';
export const EXPENSE_CATEGORIES = ['Fuel', 'Food', 'Material', 'Other'] as const;

export interface AccountingFilters {
    range: DateRange;
    invoiceStatus?: InvoiceStatusFilter;
    contacts?: ContactFilter;
    /** an Expense Log category, or 'all' */
    category?: string;
    paymentSource?: PaymentSourceFilter;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const flag = (v: unknown) => v === true || str(v).toLowerCase() === 'true';
const normKey = (v: unknown): string => str(v).replace(/\s+/g, ' ').toLowerCase();
const inRange = (ymd: string, r: DateRange) => !!ymd && ymd >= r.start && ymd <= r.end;

export interface AccountingContext {
    jobs: Map<string, AccountingJob>;
    clientsById: Map<string, AccountingClient>;
    clientsByName: Map<string, AccountingClient>;
}

export const makeContext = (jobs: readonly AccountingJob[], clients: readonly AccountingClient[]): AccountingContext => {
    const clientsByName = new Map<string, AccountingClient>();
    for (const c of clients) { const k = normKey(c.name); if (k && !clientsByName.has(k)) clientsByName.set(k, c); }
    return { jobs: new Map(jobs.map((j) => [j.id, j])), clientsById: new Map(clients.map((c) => [c.id, c])), clientsByName };
};

/** The client a document belongs to: its own link, else its job's, else the client with the same name. */
const clientOf = (doc: AccountingDoc, ctx: AccountingContext): AccountingClient | undefined => {
    const direct = doc.client_id ? ctx.clientsById.get(doc.client_id) : undefined;
    if (direct) return direct;
    const job = doc.job_id ? ctx.jobs.get(doc.job_id) : undefined;
    const viaJob = job?.client_id ? ctx.clientsById.get(job.client_id) : undefined;
    if (viaJob) return viaJob;
    const name = normKey(doc.data?.clientName) || normKey(job?.client_name);
    return name ? ctx.clientsByName.get(name) : undefined;
};

const partyName = (doc: AccountingDoc, ctx: AccountingContext): string =>
    str(doc.data?.clientName) || str(clientOf(doc, ctx)?.name) || str(doc.job_id ? ctx.jobs.get(doc.job_id)?.client_name : '');

/** One output row before it is laid out: field -> value (dates as YYYY-MM-DD, money as numbers). */
export type AccountingRecord = Record<string, string | number>;

// ======================================================================================================== invoices
export interface InvoiceLine {
    description: string;
    quantity: number;
    unitAmount: number;
    /** what this line adds to the invoice: quantity x unit amount, to the cent */
    amount: number;
    taxable: boolean;
    /** this line's share of the document's tax (cents add up to the document's tax) */
    tax: number;
}

/**
 * Shares `totalCents` across `weights` in proportion, in whole cents, so the shares ALWAYS add up to the total (the
 * largest remainders get the leftover cents). Weights may be negative (the discount line).
 */
export const allocateCents = (totalCents: number, weights: readonly number[]): number[] => {
    const sum = weights.reduce((s, w) => s + w, 0);
    if (!weights.length) return [];
    if (!sum) return weights.map(() => 0);
    const raw = weights.map((w) => (totalCents * w) / sum);
    const floors = raw.map(Math.floor);
    let left = totalCents - floors.reduce((s, n) => s + n, 0);
    const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; left > 0 && k < order.length * 2; k++, left--) floors[order[k % order.length].i] += 1;
    return floors;
};

const pctText = (n: unknown) => `${Math.round(Math.min(100, Math.max(0, toNumber(n))) * 100) / 100}%`;

/**
 * The lines of an invoice as the accounting apps want them, and its totals from the app's own math. The lines add up to
 * `totals.total - totals.tax`; with the tax column they add up to `totals.total`.
 */
export const invoiceLines = (data: Record<string, any>, id = ''): { lines: InvoiceLine[]; totals: ReturnType<typeof documentTotals> } => {
    const totals = documentTotals({ id, type: 'Invoice', ...data } as FinanceDoc);
    const progress = flag(data.isProgressBilling);
    const taxed = totals.taxRate > 0 && totals.tax > 0;
    const lines: InvoiceLine[] = [];
    for (const item of countedLineItems(Array.isArray(data.lineItems) ? data.lineItems : [])) {
        const amount = lineItemAmount(item, progress);
        if (amount === 0) continue;
        const base = plainText(item?.description ?? item?.name, 500) || 'Item';
        let quantity = 1;
        let unitAmount = amount;
        let description = base;
        if (progress) {
            description = `${base} (${pctText(item?.percentComplete)} complete)`;
        } else {
            const q = toNumber(item?.quantity);
            const r = toNumber(item?.rate);
            // quantity x rate only when the app can multiply it back to this amount exactly (no sub-cent rates)
            if (q !== 0 && Math.round(q * 1000) / 1000 === q && roundMoney(r) === r && roundMoney(q * r) === amount) { quantity = q; unitAmount = r; }
        }
        lines.push({ description, quantity, unitAmount, amount, taxable: taxed, tax: 0 });
    }
    if (totals.discount > 0) lines.push({ description: 'Discount', quantity: 1, unitAmount: -totals.discount, amount: -totals.discount, taxable: taxed, tax: 0 });
    if (totals.shipping > 0) lines.push({ description: 'Shipping', quantity: 1, unitAmount: totals.shipping, amount: totals.shipping, taxable: false, tax: 0 });
    if (!lines.length) lines.push({ description: str(data.title) || `Invoice ${str(data.invoiceNumber)}`.trim(), quantity: 1, unitAmount: 0, amount: 0, taxable: false, tax: 0 });
    if (taxed) {
        const idx = lines.map((l, i) => (l.taxable ? i : -1)).filter((i) => i >= 0);
        const shares = allocateCents(Math.round(totals.tax * 100), idx.map((i) => Math.round(lines[i].amount * 100)));
        idx.forEach((i, k) => { lines[i].tax = shares[k] / 100; });
    }
    return { lines, totals };
};

/** Standard payment terms from the days between the invoice date and the due date; '' when it is not a standard one. */
export const standardTerms = (invoiceDate: string, dueDate: string): string => {
    const a = normalizeYMD(invoiceDate);
    const b = normalizeYMD(dueDate);
    if (!a || !b) return '';
    const days = Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
    if (days === 0) return 'Due on receipt';
    return [15, 30, 60].includes(days) ? `Net ${days}` : '';
};

const invoiceMatchesStatus = (status: unknown, filter: InvoiceStatusFilter): boolean => {
    if (!isBilledInvoiceStatus(status)) return false;
    if (filter === 'paid') return isPaidStatus(status);
    if (filter === 'unpaid') return !isPaidStatus(status);
    return true;
};

export interface InvoiceExportSummary {
    invoices: number;
    /** sum of the document totals (tax included) */
    total: number;
    tax: number;
    /** sum of the line amounts (= total - tax) */
    net: number;
    withoutNumber: number;
    withoutClient: number;
}

const emptySummary = (): InvoiceExportSummary => ({ invoices: 0, total: 0, tax: 0, net: 0, withoutNumber: 0, withoutClient: 0 });

export const buildInvoiceRecords = (
    docs: readonly AccountingDoc[], ctx: AccountingContext, filters: AccountingFilters, vars: Record<string, string>,
): { records: AccountingRecord[]; summary: InvoiceExportSummary } => {
    const records: AccountingRecord[] = [];
    const summary = emptySummary();
    const status = filters.invoiceStatus || 'billed';
    const list = docs.filter((d) => exportTypeLabel(d.type) === 'Invoice' && invoiceMatchesStatus(d.data?.status, status))
        .map((d) => ({ d, date: documentDateOf('Invoice', d.data, d.created_at) }))
        .filter((x) => inRange(x.date, filters.range))
        .sort((a, b) => a.date.localeCompare(b.date) || str(a.d.data?.invoiceNumber).localeCompare(str(b.d.data?.invoiceNumber), undefined, { numeric: true }) || a.d.id.localeCompare(b.d.id));
    for (const { d, date } of list) {
        const data = d.data || {};
        const { lines, totals } = invoiceLines(data, d.id);
        const client = clientOf(d, ctx);
        const job = d.job_id ? ctx.jobs.get(d.job_id) : undefined;
        const number = str(data.invoiceNumber) || `INV-${d.id.replace(/-/g, '').slice(0, 6)}`;
        const name = partyName(d, ctx) || 'Unknown customer';
        const due = normalizeYMD(data.dueDate) || date;
        if (!str(data.invoiceNumber)) summary.withoutNumber++;
        if (!partyName(d, ctx)) summary.withoutClient++;
        summary.invoices++;
        summary.total = roundMoney(summary.total + totals.total);
        summary.tax = roundMoney(summary.tax + totals.tax);
        for (const l of lines) {
            summary.net = roundMoney(summary.net + l.amount);
            records.push({
                contactName: name, email: str(client?.email), invoiceNo: number, reference: str(job?.name) || str(data.title), invoiceDate: date, dueDate: due,
                terms: standardTerms(date, due), memo: [str(data.title), str(job?.name) && str(job?.name) !== str(data.title) ? str(job?.name) : ''].filter(Boolean).join(' - '),
                itemName: vars.itemName || '', description: l.description, quantity: l.quantity, unitAmount: l.unitAmount, lineAmount: l.amount,
                taxCode: l.taxable ? vars.taxedCode || '' : vars.untaxedCode || '', taxAmount: l.tax, accountCode: vars.accountCode || '',
                taxType: l.taxable ? vars.taxedType || '' : vars.untaxedType || '',
            });
        }
    }
    return { records, summary };
};

// ======================================================================================================== contacts
export interface SplitAddress { street: string; city: string; state: string; zip: string; country: string }

/**
 * "12 Oak St, Springfield, IL 62701" -> street / city / state / zip. Only the common US shape is split; anything else
 * stays whole in `street` (better one long address line than a wrong city).
 */
export const splitAddress = (raw: unknown): SplitAddress => {
    const text = plainText(raw, 300).replace(/\n+/g, ', ').replace(/\s*,\s*/g, ', ').replace(/,\s*$/, '');
    const m = /^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})\.?,?\s+(\d{5}(?:-\d{4})?)(?:,\s*(USA|US|United States))?$/i.exec(text);
    if (m) return { street: m[1], city: m[2], state: m[3].toUpperCase(), zip: m[4], country: m[5] ? 'USA' : '' };
    return { street: text, city: '', state: '', zip: '', country: '' };
};

export const buildContactRecords = (
    clients: readonly AccountingClient[], docs: readonly AccountingDoc[], ctx: AccountingContext, filters: AccountingFilters,
): { records: AccountingRecord[]; duplicates: number } => {
    let allowed: Set<string> | null = null;
    if (filters.contacts === 'invoiced') {
        allowed = new Set();
        for (const d of docs) {
            if (exportTypeLabel(d.type) !== 'Invoice' || !isBilledInvoiceStatus(d.data?.status)) continue;
            if (!inRange(documentDateOf('Invoice', d.data, d.created_at), filters.range)) continue;
            const c = clientOf(d, ctx);
            if (c) allowed.add(normKey(c.name));
            const n = normKey(partyName(d, ctx));
            if (n) allowed.add(n);
        }
    }
    const seen = new Set<string>();
    const records: AccountingRecord[] = [];
    let duplicates = 0;
    for (const c of [...clients].sort((a, b) => str(a.name).localeCompare(str(b.name), undefined, { sensitivity: 'base' }))) {
        const key = normKey(c.name);
        if (!key || (allowed && !allowed.has(key))) continue;
        if (seen.has(key)) { duplicates++; continue; }
        seen.add(key);
        const a = splitAddress(c.address);
        records.push({ name: str(c.name), email: str(c.email), phone: str(c.phone), ...a, notes: plainText(c.notes, 500) });
    }
    return { records, duplicates };
};

// ======================================================================================================== expenses
export const buildExpenseRecords = (
    docs: readonly AccountingDoc[], ctx: AccountingContext, filters: AccountingFilters, vars: Record<string, string>,
): { records: AccountingRecord[]; total: number; withoutVendor: number } => {
    const category = filters.category && filters.category !== 'all' ? filters.category.toLowerCase() : '';
    const records: AccountingRecord[] = [];
    let total = 0;
    let withoutVendor = 0;
    const list = docs.filter((d) => exportTypeLabel(d.type) === 'Expense Log')
        .map((d) => ({ d, date: documentDateOf('Expense Log', d.data, d.created_at) }))
        .filter((x) => inRange(x.date, filters.range) && (!category || (str(x.d.data?.category) || 'Other').toLowerCase() === category))
        .sort((a, b) => a.date.localeCompare(b.date) || a.d.id.localeCompare(b.d.id));
    for (const { d, date } of list) {
        const data = d.data || {};
        const amount = expenseTotal(data as FinanceDoc);
        const job = d.job_id ? ctx.jobs.get(d.job_id) : undefined;
        const lines = (Array.isArray(data.lineItems) ? data.lineItems : []).map((li: any) => plainText(li?.description, 200)).filter(Boolean);
        const vendor = str(data.vendor);
        if (!vendor) withoutVendor++;
        total = roundMoney(total + amount);
        records.push({
            contactName: vendor || 'Unknown vendor', invoiceNo: `EXP-${date.replace(/-/g, '')}-${d.id.replace(/-/g, '').slice(0, 6)}`, reference: str(job?.name),
            invoiceDate: date, dueDate: date, description: plainText(data.item, 300) || lines.join('; ') || str(data.title) || 'Expense',
            memo: [str(data.category) || 'Other', str(job?.name)].filter(Boolean).join(' - '), quantity: 1, unitAmount: amount, lineAmount: amount,
            accountCode: vars.accountCode || '', accountName: vars.accountName || '', taxType: vars.untaxedType || '',
        });
    }
    return { records, total, withoutVendor };
};

// ======================================================================================================== payments
export const buildPaymentRecords = (
    docs: readonly AccountingDoc[], ctx: AccountingContext, filters: AccountingFilters,
): { records: AccountingRecord[]; total: number; receipts: number; marked: number } => {
    const source = filters.paymentSource || 'all';
    const receiptIds = new Set<string>();
    for (const d of docs) if (exportTypeLabel(d.type) === 'Receipt') receiptIds.add(d.id);
    const out: Array<{ date: string; rec: AccountingRecord; kind: 'receipt' | 'invoice' }> = [];
    const describe = (method: string, invoiceNo: string, note: string) =>
        [`Payment${invoiceNo ? ` for invoice ${invoiceNo}` : ''}`, method ? `(${method})` : '', note].filter(Boolean).join(' ');

    for (const d of docs) {
        const type = exportTypeLabel(d.type);
        const data = d.data || {};
        if (type === 'Receipt' && source !== 'invoices') {
            const date = documentDateOf('Receipt', data, d.created_at);
            if (!inRange(date, filters.range)) continue;
            const amount = roundMoney(Math.max(0, toNumber(data.amount)));
            const party = partyName(d, ctx);
            const invoiceNo = str(data.invoiceNumber);
            out.push({ date, kind: 'receipt', rec: {
                date, amount, payee: party, reference: str(data.receiptNumber) || invoiceNo,
                description: describe(str(data.paymentMethod), invoiceNo, plainText(data.description, 120)),
                bankDescription: `${party ? `${party} - ` : ''}${describe(str(data.paymentMethod), invoiceNo, '')}`,
            } });
        } else if (type === 'Invoice' && source !== 'receipts' && isBilledInvoiceStatus(data.status)) {
            const job = d.job_id ? ctx.jobs.get(d.job_id) : undefined;
            const entries = paymentsWithoutReceipt(invoicePaymentEntries(d, { job: job ? { name: str(job.name), clientName: str(job.client_name), folder: '' } : null }), receiptIds);
            for (const p of entries) {
                if (!inRange(p.date, filters.range)) continue;
                const party = p.client || partyName(d, ctx);
                out.push({ date: p.date, kind: 'invoice', rec: {
                    date: p.date, amount: roundMoney(p.amount), payee: party, reference: p.receiptNumber || p.invoiceNumber,
                    description: describe(p.method, p.invoiceNumber, ''),
                    bankDescription: `${party ? `${party} - ` : ''}${describe(p.method, p.invoiceNumber, '')}`,
                } });
            }
        }
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || String(a.rec.reference).localeCompare(String(b.rec.reference), undefined, { numeric: true }));
    return {
        records: out.map((o) => o.rec),
        total: roundMoney(out.reduce((s, o) => s + toNumber(o.rec.amount), 0)),
        receipts: out.filter((o) => o.kind === 'receipt').length,
        marked: out.filter((o) => o.kind === 'invoice').length,
    };
};

// ======================================================================================================== the file
/** The cells of one record in a layout's column order (formatted, not yet CSV-escaped). */
export const renderRecord = (layout: Layout, rec: AccountingRecord, dateFormat: DateFormat): string[] =>
    layout.columns.map(([, field, kind]) => {
        const v = rec[field];
        if (field === 'blank' || v === undefined || v === null || v === '') return '';
        if (kind === 'money') return money(v);
        if (kind === 'qty') return qty(v);
        if (kind === 'date') return formatDate(v, dateFormat);
        return String(v);
    });

export const layoutHeader = (layout: Layout): string[] => layout.columns.map((c) => c[0]);

/** "ContractorDocs-xero-invoices-2026-10.csv" (a whole month) or "...-2026-10-03_to_2026-11-02.csv". */
export const accountingFileName = (app: AccountingApp, kind: ExportKind, range: DateRange, whole = false): string => {
    const span = whole ? range.start.slice(0, 7) : `${range.start}_to_${range.end}`;
    return `ContractorDocs-${app}-${kind}-${span}.csv`;
};

export interface AccountingExportInput {
    app: AccountingApp;
    kind: ExportKind;
    documents: readonly AccountingDoc[];
    jobs: readonly AccountingJob[];
    clients: readonly AccountingClient[];
    filters: AccountingFilters;
    /** owner's edits of the layout's variables (account code, tax names ...) */
    variables?: Record<string, unknown> | null;
    dateFormat?: DateFormat;
}

export interface AccountingExport {
    layout: Layout;
    header: string[];
    rows: string[][];
    csv: string;
    fileName: string;
    /** invoices / customers / expenses / payments in the file */
    records: number;
    /** data rows (invoices have one per line) */
    rowCount: number;
    /** money in the file: invoices = document totals, expenses / payments = sum of the amounts, customers = 0 */
    total: number;
    /** invoices only */
    invoiceSummary?: InvoiceExportSummary;
    /** things the owner should know before importing (plain sentences) */
    notes: string[];
    dateFormat: DateFormat;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const buildAccountingExport = (input: AccountingExportInput): AccountingExport => {
    const layout = layoutFor(input.app, input.kind);
    const vars = resolveVariables(layout, input.variables);
    const dateFormat = input.dateFormat || layout.dateFormat;
    const ctx = makeContext(input.jobs, input.clients);
    const notes: string[] = [];
    let records: AccountingRecord[] = [];
    let count = 0;
    let total = 0;
    let invoiceSummary: InvoiceExportSummary | undefined;

    if (input.kind === 'invoices') {
        const r = buildInvoiceRecords(input.documents, ctx, input.filters, vars);
        records = r.records; invoiceSummary = r.summary; count = r.summary.invoices; total = r.summary.total;
        if (r.summary.withoutNumber) notes.push(`${plural(r.summary.withoutNumber, 'invoice')} had no number: a temporary one starting with INV- was made.`);
        if (r.summary.withoutClient) notes.push(`${plural(r.summary.withoutClient, 'invoice')} had no client name: they are filed under "Unknown customer".`);
    } else if (input.kind === 'contacts') {
        const r = buildContactRecords(input.clients, input.documents, ctx, input.filters);
        records = r.records; count = r.records.length;
        if (r.duplicates) notes.push(`${plural(r.duplicates, 'client')} with the same name as another ${r.duplicates === 1 ? 'was' : 'were'} listed once.`);
    } else if (input.kind === 'expenses') {
        const r = buildExpenseRecords(input.documents, ctx, input.filters, vars);
        records = r.records; count = r.records.length; total = r.total;
        if (r.withoutVendor) notes.push(`${plural(r.withoutVendor, 'expense')} had no vendor: they are filed under "Unknown vendor".`);
    } else {
        const r = buildPaymentRecords(input.documents, ctx, input.filters);
        records = r.records; count = r.records.length; total = r.total;
    }

    const header = layoutHeader(layout);
    const rows = records.map((rec) => renderRecord(layout, rec, dateFormat));
    return {
        layout, header, rows, csv: toCsv(header, rows), fileName: accountingFileName(input.app, input.kind, input.filters.range, isWholeMonth(input.filters.range)),
        records: count, rowCount: rows.length, total, invoiceSummary, notes, dateFormat,
    };
};

const isWholeMonth = (r: DateRange): boolean => {
    if (r.start.slice(0, 7) !== r.end.slice(0, 7) || r.start.slice(8) !== '01') return false;
    const last = new Date(Number(r.end.slice(0, 4)), Number(r.end.slice(5, 7)), 0).getDate();
    return Number(r.end.slice(8)) === last;
};

