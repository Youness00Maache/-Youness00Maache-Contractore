/**
 * Business overview (N3): the money documents turned into small dated "facts", ONE pass, so every section (KPI strip,
 * profit ranking, revenue by customer) adds up the same facts and a filter never changes the math.
 *
 * The rules are exactly the ones of Insights (utils/analyticsMath.ts computeAnalytics) and Job financials
 * (lib/finance.ts summarizeJobMoney); scripts/overview-check.ts proves it on random data:
 *   - an invoice counts when it is billed (not Draft / Cancelled / Void), on its issue day; its total is the PDF total;
 *   - collected = Paid invoices in full, else the larger of "amount paid" and its receipts (lib/finance.ts);
 *   - a receipt that is not for a billed invoice is income by itself (on its own day);
 *   - costs = material logs + expense logs + time-sheet labor (hours x labor rate, overtime 1.5x), on their own day.
 *
 * A document's customer is its JOB's client when it has a job, else the client name written on the document, so all
 * documents of one job always belong to one customer.
 */
import { roundMoney, toNumber } from '../../utils/money.ts';
import { documentDay, type AnalyticsDoc } from '../../utils/analyticsMath.ts';
import { normalizeYMD } from '../../utils/localDates.ts';
import {
    DEFAULT_LABOR_RATE, documentTotals, expenseTotal, findReceiptInvoice, invoiceCollected, isBilledInvoiceStatus, isPaidStatus, isType, laborOf, linkReceipts,
    materialCost, receiptAmount,
} from '../finance.ts';
import { dayOf } from '../pipeline.ts';
import type { OverviewDoc, OverviewJob } from './types.ts';

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** Case- and spacing-insensitive key of a customer name ('' = no name). */
export const customerKey = (name: unknown): string => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export type CostCategory = 'materials' | 'expenses' | 'labor';

export interface FactBase {
    /** document id */
    id: string;
    jobId: string | null;
    /** the customer's name as written (first spelling seen) */
    customer: string;
    customerKey: string;
    /** the business day (YYYY-MM-DD, local) the document belongs to */
    day: string;
}

/** A billed invoice. */
export interface InvoiceFact extends FactBase {
    number: string;
    total: number;
    /** what was collected on it (lib/finance.ts invoiceCollected) */
    collected: number;
    /** balance still due (0 for a Paid invoice) */
    due: number;
    /** paid in full: status Paid, or nothing left to pay */
    paid: boolean;
    /** unpaid with a balance, and past its due date (or status Overdue), as of `todayYMD` */
    overdue: boolean;
    /** the day the last payment came in (paidAt, else the last payment, else the last receipt); null = unknown */
    paidDay: string | null;
}

/** A receipt that is not for a billed invoice: income and collected on its own. */
export interface ReceiptFact extends FactBase {
    amount: number;
}

export interface CostFact extends FactBase {
    category: CostCategory;
    amount: number;
    hours: number;
}

export interface OverviewFacts {
    invoices: InvoiceFact[];
    receipts: ReceiptFact[];
    costs: CostFact[];
    /** job id -> its customer's name (jobCustomerMap) */
    jobCustomers: Map<string, string>;
}

export interface FactsOptions {
    /** prices time-sheet hours (lib/finance.ts resolveLaborRate) */
    laborRate: number;
    /** local "today" (decides which unpaid invoices are overdue) */
    todayYMD: string;
    jobs: readonly OverviewJob[];
}

/** The day an invoice was paid in full: paidAt, else the last recorded payment, else the last receipt (same idea as lib/export/model.ts paidDateOf). */
const paidDayOf = (doc: OverviewDoc, receiptDays: string[]): string | null => {
    const at = dayOf(doc.paidAt);
    if (at) return at;
    const payments = typeof doc.payments === 'string' ? (() => { try { return JSON.parse(doc.payments as string); } catch { return null; } })() : doc.payments;
    const dates = (Array.isArray(payments) ? payments : []).map((p: any) => normalizeYMD(p?.date)).filter((d): d is string => !!d).sort();
    if (dates.length) return dates[dates.length - 1];
    const sorted = [...receiptDays].sort();
    return sorted.length ? sorted[sorted.length - 1] : null;
};

/**
 * The customer of every job: the job's client name; a job without one takes the (alphabetically first) client name
 * written on its documents, so every document of a job always has the same customer.
 */
export const jobCustomerMap = (jobs: readonly OverviewJob[], docs: readonly Pick<OverviewDoc, 'jobId' | 'clientName'>[] = []): Map<string, string> => {
    const out = new Map<string, string>();
    for (const j of jobs) {
        const name = String(j.clientName ?? '').trim();
        if (name) out.set(j.id, name);
    }
    const known = new Set(jobs.map(j => j.id));
    const fromDocs = new Map<string, string>();
    for (const d of docs) {
        const name = String(d.clientName ?? '').trim();
        if (!d.jobId || !name || out.has(d.jobId) || !known.has(d.jobId)) continue;
        const cur = fromDocs.get(d.jobId);
        if (cur === undefined || customerKey(name) < customerKey(cur)) fromDocs.set(d.jobId, name);
    }
    for (const [id, name] of fromDocs) out.set(id, name);
    return out;
};

/** The customer of a document: its job's customer, else the client name on the document. */
export const customerOf = (doc: Pick<OverviewDoc, 'jobId' | 'clientName'>, jobCustomers: ReadonlyMap<string, string>): string =>
    (doc.jobId ? jobCustomers.get(doc.jobId) : undefined) || String(doc.clientName ?? '').trim();

export const buildFacts = (docs: readonly OverviewDoc[], options: FactsOptions): OverviewFacts => {
    // same fallback as Insights (utils/analyticsMath.ts): no usable rate = the default labor rate
    const rate = options.laborRate > 0 ? options.laborRate : DEFAULT_LABOR_RATE;
    const jobCustomers = jobCustomerMap(options.jobs, docs);
    const links = linkReceipts(docs as OverviewDoc[]);
    const billed = docs.filter(d => isType(d, 'invoice') && isBilledInvoiceStatus(d.status));
    // when each billed invoice's receipts came in (for the paid day)
    const receiptDays = new Map<string, string[]>();
    for (const r of docs) {
        if (!isType(r, 'receipt')) continue;
        const inv = findReceiptInvoice(r, billed);
        const day = documentDay({ ...r, createdAt: String(r.createdAt ?? '') } as AnalyticsDoc);
        if (inv && day) receiptDays.set(inv.id, [...(receiptDays.get(inv.id) || []), day]);
    }

    const out: OverviewFacts = { invoices: [], receipts: [], costs: [], jobCustomers };
    for (const doc of docs) {
        const day = documentDay({ ...doc, createdAt: String(doc.createdAt ?? '') } as AnalyticsDoc);
        if (!day) continue;
        const customer = customerOf(doc, jobCustomers);
        const base: FactBase = { id: doc.id, jobId: doc.jobId ?? null, customer, customerKey: customerKey(customer), day };

        if (isType(doc, 'invoice')) {
            if (!isBilledInvoiceStatus(doc.status)) continue;
            const status = norm(doc.status);
            const totals = documentTotals(doc);
            const isPaid = isPaidStatus(status);
            const collected = invoiceCollected(doc, totals, links.byInvoice.get(doc.id) || 0);
            const due = roundMoney(Math.max(0, totals.total - collected));
            const dueDate = normalizeYMD(doc.dueDate);
            const open = !isPaid && due > 0;
            const paid = isPaid || (totals.total > 0 && due <= 0);
            out.invoices.push({
                ...base,
                number: String(doc.invoiceNumber ?? '').trim(),
                total: totals.total,
                collected,
                due: isPaid ? 0 : due,
                paid,
                overdue: open && (status === 'overdue' || (!!dueDate && dueDate < options.todayYMD)),
                paidDay: paid ? paidDayOf(doc, receiptDays.get(doc.id) || []) : null,
            });
        } else if (isType(doc, 'receipt')) {
            // receipts for a billed invoice are already inside that invoice's "collected"
            if (!links.unlinked.has(doc.id)) continue;
            out.receipts.push({ ...base, amount: receiptAmount(doc) });
        } else if (isType(doc, 'expense log')) {
            out.costs.push({ ...base, category: 'expenses', amount: expenseTotal(doc), hours: 0 });
        } else if (isType(doc, 'material log')) {
            out.costs.push({ ...base, category: 'materials', amount: materialCost(doc), hours: 0 });
        } else if (isType(doc, 'time sheet')) {
            const l = laborOf(doc, rate);
            out.costs.push({ ...base, category: 'labor', amount: l.cost, hours: toNumber(l.hours) + toNumber(l.overtime) });
        }
    }
    return out;
};
