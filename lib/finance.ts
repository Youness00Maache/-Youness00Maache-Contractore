/**
 * Job money: ONE definition of "collected", "contract value" and "profit", used by Job financials
 * (components/JobFinancialsModal.tsx) and Insights (utils/analyticsMath.ts → components/AnalyticsView.tsx).
 * Pure (no network), so scripts/views-logic-check.ts can test it.
 *
 *   Income    = billed invoices (anything but Draft / Cancelled / Void)
 *               + receipts that are not for one of those invoices (money received without a sent invoice)
 *   Costs     = material logs + expense logs + labor (time-sheet hours × labor rate, overtime at 1.5×)
 *   Profit    = income − costs
 *   Collected = paid invoices (full total) + receipts + deposits recorded on open invoices.
 *               A receipt for an invoice that is already Paid is not counted twice; on an open invoice the
 *               larger of "amount paid" and its receipts counts.
 *   Contract value = accepted (or client-signed) estimates + approved (or client-signed) change orders.
 */
import { computeDocumentTotals, roundMoney, toNumber, type DocumentTotals, type MoneyLineItem } from '../utils/money.ts';

export const PROFIT_FORMULA = 'Profit = income − costs';
export const PROFIT_DEFINITION =
    'Income is your sent, paid and overdue invoices plus receipts that are not for one of them. ' +
    'Costs are material logs + expense logs + labor (time-sheet hours × labor rate, overtime at 1.5×). ' +
    'Job financials and Insights use this same definition.';
export const COLLECTED_DEFINITION =
    'Collected = paid invoices + receipts + deposits recorded on open invoices. A receipt for an invoice that is already marked Paid is not counted twice.';

export const DEFAULT_LABOR_RATE = 45;
export const LABOR_RATE_STORAGE_KEY = 'cd_job_labor_rate';
export const OVERTIME_MULTIPLIER = 1.5;

/** Labor rate: the profile's default, else the last rate typed in Job financials on this device, else $45/h. */
export const resolveLaborRate = (profileRate?: number | null): number => {
    if (profileRate && profileRate > 0) return profileRate;
    try {
        const stored = Number(localStorage.getItem(LABOR_RATE_STORAGE_KEY));
        if (stored > 0) return stored;
    } catch { /* storage unavailable */ }
    return DEFAULT_LABOR_RATE;
};

export const rememberLaborRate = (rate: number): void => {
    try { localStorage.setItem(LABOR_RATE_STORAGE_KEY, String(rate)); } catch { /* ignore */ }
};

/** The fields of a document the money math needs (JSON-path selects give strings for `->>` paths). */
export interface FinanceDoc {
    id: string;
    type: string;
    jobId?: string | null;
    status?: string | null;
    lineItems?: MoneyLineItem[] | null;
    taxRate?: number | string | null;
    discount?: number | string | null;
    shipping?: number | string | null;
    isProgressBilling?: boolean | string | null;
    amountPaid?: number | string | null;
    /** Expense Log total paid (already includes tax) / Receipt amount */
    amount?: number | string | null;
    tax?: number | string | null;
    /** Material Log items (`materials` on very old logs) */
    items?: Array<{ quantity?: unknown; unitCost?: unknown } | null> | null;
    materials?: Array<{ quantity?: unknown; unitCost?: unknown } | null> | null;
    hoursWorked?: number | string | null;
    overtimeHours?: number | string | null;
    invoiceNumber?: string | null;
    /** Receipt → invoice link, when a receipt stores it explicitly */
    invoiceId?: string | null;
    receiptNumber?: string | null;
    description?: string | null;
    title?: string | null;
    clientSignedAt?: string | null;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const flag = (v: unknown) => v === true || norm(v) === 'true';

export const isType = (doc: Pick<FinanceDoc, 'type'>, type: 'invoice' | 'receipt' | 'estimate' | 'change order' | 'material log' | 'expense log' | 'time sheet') => norm(doc.type) === type;

/** Invoices that count as billed: everything except Draft, Cancelled and Void (no status = Draft). */
export const isBilledInvoiceStatus = (status: unknown): boolean => !['', 'draft', 'cancelled', 'canceled', 'void'].includes(norm(status));
export const isPaidStatus = (status: unknown): boolean => norm(status) === 'paid';

/** Estimates / change orders the client agreed to: Accepted / Approved / Signed, or a client signature date (never a Draft). */
export const isAcceptedDoc = (doc: Pick<FinanceDoc, 'status' | 'clientSignedAt'>): boolean => {
    const s = norm(doc.status);
    if (s === 'rejected' || s === 'declined' || s === 'draft') return false;
    return s === 'accepted' || s === 'approved' || s === 'signed' || Boolean(doc.clientSignedAt);
};

export const documentTotals = (doc: FinanceDoc): DocumentTotals => computeDocumentTotals({
    lineItems: Array.isArray(doc.lineItems) ? doc.lineItems : [],
    discount: doc.discount,
    shipping: doc.shipping,
    taxRate: doc.taxRate,
    isProgressBilling: flag(doc.isProgressBilling),
    amountPaid: doc.amountPaid,
});

/** Expense Log total: the stored amount (which already includes tax), else line items + tax. */
export const expenseTotal = (doc: Pick<FinanceDoc, 'amount' | 'lineItems' | 'tax'>): number => {
    const amount = toNumber(doc.amount);
    if (amount > 0) return roundMoney(amount);
    const items = Array.isArray(doc.lineItems) ? doc.lineItems : [];
    const sub = items.reduce((s, it) => s + toNumber(it?.quantity ?? 1) * toNumber(it?.rate), 0);
    return roundMoney(sub + toNumber(doc.tax));
};

/** Material Log cost: quantity × unit cost of every item. */
export const materialCost = (doc: Pick<FinanceDoc, 'items' | 'materials'>): number => {
    const items = Array.isArray(doc.items) && doc.items.length ? doc.items : Array.isArray(doc.materials) ? doc.materials : [];
    return roundMoney(items.reduce((s, it) => s + toNumber(it?.quantity) * toNumber(it?.unitCost), 0));
};

export const laborOf = (doc: Pick<FinanceDoc, 'hoursWorked' | 'overtimeHours'>, rate: number): { hours: number; overtime: number; cost: number } => {
    const hours = Math.max(0, toNumber(doc.hoursWorked));
    const overtime = Math.max(0, toNumber(doc.overtimeHours));
    return { hours, overtime, cost: roundMoney(hours * rate + overtime * rate * OVERTIME_MULTIPLIER) };
};

export const receiptAmount = (doc: Pick<FinanceDoc, 'amount'>): number => roundMoney(Math.max(0, toNumber(doc.amount)));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which invoice a receipt is for: an explicit `invoiceId` / `invoiceNumber`, else an invoice number written in
 * its description or title (the Receipt form suggests "… (invoice INV-2026-11-004)"). Invoices of the receipt's
 * own job win; the longest matching number wins (INV-10 before INV-1). Returns null when it is for no invoice.
 */
export const findReceiptInvoice = <T extends FinanceDoc>(receipt: FinanceDoc, invoices: T[]): T | null => {
    const pool = receipt.jobId ? invoices.filter(i => !i.jobId || i.jobId === receipt.jobId) : invoices;
    if (receipt.invoiceId) {
        const byId = pool.find(i => i.id === receipt.invoiceId) || invoices.find(i => i.id === receipt.invoiceId);
        if (byId) return byId;
    }
    const explicit = norm(receipt.invoiceNumber);
    if (explicit) {
        const byNumber = pool.find(i => norm(i.invoiceNumber) === explicit);
        if (byNumber) return byNumber;
    }
    const text = `${receipt.description ?? ''} ${receipt.title ?? ''}`;
    if (!text.trim()) return null;
    let best: T | null = null;
    for (const inv of pool) {
        const num = String(inv.invoiceNumber ?? '').trim();
        if (num.length < 2 || (best && String(best.invoiceNumber).length >= num.length)) continue;
        if (new RegExp(`(^|[^A-Za-z0-9])${escapeRe(num)}($|[^A-Za-z0-9])`, 'i').test(text)) best = inv;
    }
    return best;
};

export interface LinkedReceipts {
    /** receipt totals per billed invoice id */
    byInvoice: Map<string, number>;
    /** receipts that are not for a billed invoice (counted as income on their own) */
    unlinked: Set<string>;
}

/** Links every receipt to the billed invoice it pays (receipts for draft/cancelled invoices count on their own). */
export const linkReceipts = (docs: FinanceDoc[]): LinkedReceipts => {
    const billed = docs.filter(d => isType(d, 'invoice') && isBilledInvoiceStatus(d.status));
    const byInvoice = new Map<string, number>();
    const unlinked = new Set<string>();
    for (const r of docs) {
        if (!isType(r, 'receipt')) continue;
        const inv = findReceiptInvoice(r, billed);
        if (inv) byInvoice.set(inv.id, roundMoney((byInvoice.get(inv.id) || 0) + receiptAmount(r)));
        else unlinked.add(r.id);
    }
    return { byInvoice, unlinked };
};

/** What was collected on one billed invoice: the full total when Paid, else max(amount paid, its receipts). */
export const invoiceCollected = (invoice: FinanceDoc, totals: DocumentTotals, receiptsForInvoice: number): number => {
    if (isPaidStatus(invoice.status)) return totals.total;
    return roundMoney(Math.max(Math.min(totals.amountPaid, totals.total), receiptsForInvoice));
};

export interface MoneySummary {
    /** billed invoices */
    invoiced: number;
    invoiceCount: number;
    /** receipts that are not for a billed invoice (part of income) */
    otherReceipts: number;
    receiptCount: number;
    /** invoiced + otherReceipts */
    income: number;
    collected: number;
    outstanding: number;
    /** accepted estimates + approved change orders */
    contractValue: number;
    estimateValue: number;
    estimateCount: number;
    changeOrderValue: number;
    changeOrderCount: number;
    materials: number;
    expenses: number;
    labor: number;
    hours: number;
    overtime: number;
    costs: number;
    profit: number;
    /** profit / income × 100, null without income */
    margin: number | null;
}

/** Every number of the Job financials screen, for the documents of one job. */
export const summarizeJobMoney = (docs: FinanceDoc[], options: { laborRate: number }): MoneySummary => {
    const rate = Math.max(0, toNumber(options.laborRate));
    const links = linkReceipts(docs);
    let invoiced = 0, invoiceCount = 0, otherReceipts = 0, receiptCount = 0, collected = 0, outstanding = 0;
    let estimateValue = 0, estimateCount = 0, changeOrderValue = 0, changeOrderCount = 0;
    let materials = 0, expenses = 0, labor = 0, hours = 0, overtime = 0;
    for (const d of docs) {
        if (isType(d, 'invoice')) {
            if (!isBilledInvoiceStatus(d.status)) continue;
            const totals = documentTotals(d);
            const got = invoiceCollected(d, totals, links.byInvoice.get(d.id) || 0);
            invoiced += totals.total;
            invoiceCount++;
            collected += got;
            if (!isPaidStatus(d.status)) outstanding += Math.max(0, totals.total - got);
        } else if (isType(d, 'receipt')) {
            receiptCount++;
            if (links.unlinked.has(d.id)) {
                const amount = receiptAmount(d);
                otherReceipts += amount;
                collected += amount;
            }
        } else if (isType(d, 'estimate')) {
            if (!isAcceptedDoc(d)) continue;
            estimateValue += documentTotals(d).total;
            estimateCount++;
        } else if (isType(d, 'change order')) {
            if (!isAcceptedDoc(d)) continue;
            changeOrderValue += documentTotals(d).total;
            changeOrderCount++;
        } else if (isType(d, 'material log')) {
            materials += materialCost(d);
        } else if (isType(d, 'expense log')) {
            expenses += expenseTotal(d);
        } else if (isType(d, 'time sheet')) {
            const l = laborOf(d, rate);
            hours += l.hours;
            overtime += l.overtime;
            labor += l.cost;
        }
    }
    const income = roundMoney(invoiced + otherReceipts);
    const costs = roundMoney(materials + expenses + labor);
    const profit = roundMoney(income - costs);
    return {
        invoiced: roundMoney(invoiced), invoiceCount, otherReceipts: roundMoney(otherReceipts), receiptCount, income,
        collected: roundMoney(collected), outstanding: roundMoney(outstanding),
        contractValue: roundMoney(estimateValue + changeOrderValue),
        estimateValue: roundMoney(estimateValue), estimateCount, changeOrderValue: roundMoney(changeOrderValue), changeOrderCount,
        materials: roundMoney(materials), expenses: roundMoney(expenses), labor: roundMoney(labor),
        hours: Math.round(hours * 100) / 100, overtime: Math.round(overtime * 100) / 100,
        costs, profit, margin: income > 0 ? (profit / income) * 100 : null,
    };
};
