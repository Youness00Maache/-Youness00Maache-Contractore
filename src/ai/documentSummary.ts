/**
 * Compact per-document facts for the AI context, so the assistant can answer "is the invoice paid?",
 * "what's on the estimate?" or "how much is still owed?" (QA report 0b #9).
 *
 * Pure (no Supabase import): the hook loads the rows, the QA script runs this in Node. The edge
 * function clamps the result again (routerContract `sanitizeRequest`), so sizes here are a first cap.
 * Money math is utils/money.ts, the same numbers the forms, PDFs and job financials show.
 */
import { FormType } from '../../types.ts';
import type { FormData } from '../../types.ts';
import { computeDocumentTotals, lineItemAmount, roundMoney, toNumber } from '../../utils/money.ts';
import { toPlainText } from '../../supabase/functions/ai-assistant/shared/documentSchema.ts';
import {
    REQUEST_LIMITS, type ContextDocumentLine, type ContextDocumentSummary,
} from '../../supabase/functions/ai-assistant/shared/routerContract.ts';
import { resolveFormType } from '../config/docTypeMap.ts';

/** Same marker as lib/documents.ts LIGHTWEIGHT_DOCUMENT_FLAG (list rows without the full `data`). */
const LIGHTWEIGHT_FLAG = '__lightweight';

/**
 * Columns for one light query of a job's documents: only what the summary needs, never the logo,
 * signature images or styling (`->` keeps numbers/arrays as JSON, `->>` gives text).
 */
export const DOCUMENT_SUMMARY_COLUMNS = [
    'id', 'type',
    ...['invoiceNumber', 'estimateNumber', 'reportNumber', 'workOrderNumber', 'warrantyNumber', 'changeOrderNumber', 'poNumber', 'receiptNumber', 'title']
        .map(k => `${k}:data->>${k}`),
    ...['status', 'paymentStatus', 'issueDate', 'dueDate', 'expiryDate', 'date', 'deliveryDate', 'completedDate',
        'clientSignedBy', 'clientSignedAt', 'clientSignatureUrl', 'vendorName', 'vendor', 'workerName', 'paymentMethod',
        'description', 'content', 'item', 'category', 'duration', 'coverage', 'reason'].map(k => `${k}:data->>${k}`),
    ...['lineItems', 'items', 'taxRate', 'discount', 'shipping', 'amountPaid', 'isProgressBilling', 'amount', 'tax',
        'cost', 'hours', 'hoursWorked', 'overtimeHours', 'totalWithTax', 'totalRevenue', 'grossProfit', 'margin', 'currentContractSum']
        .map(k => `${k}:data->${k}`),
].join(', ');

const NUMBER_KEYS = ['invoiceNumber', 'estimateNumber', 'workOrderNumber', 'changeOrderNumber', 'poNumber', 'receiptNumber', 'reportNumber', 'warrantyNumber'];

const text = (v: unknown, max: number): string => toPlainText(typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);
const ymd = (v: unknown): string | undefined => {
    const m = typeof v === 'string' ? v.match(/^\d{4}-\d{2}-\d{2}/) : null;
    return m ? m[0] : undefined;
};
const amountOrUndefined = (v: unknown): number | undefined => {
    if (v == null || v === '') return undefined;
    const n = roundMoney(toNumber(v));
    return Number.isFinite(n) ? n : undefined;
};

function lines(
    raw: unknown,
    map: (item: Record<string, unknown>) => ContextDocumentLine | null,
    maxLines: number,
): { items?: ContextDocumentLine[]; more_items?: number } {
    const list = (Array.isArray(raw) ? raw : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
    const mapped = list.map(map).filter((l): l is ContextDocumentLine => Boolean(l && l.desc));
    if (!mapped.length) return {};
    const items = mapped.slice(0, maxLines);
    return mapped.length > items.length ? { items, more_items: mapped.length - items.length } : { items };
}

/**
 * Summary of one document from its `data` (full, or the lightweight list row: then only number,
 * status and signature, never totals computed from missing line items).
 */
export function summarizeDocumentData(
    type: string,
    data: Record<string, unknown> | null | undefined,
    options: { lightweight?: boolean; maxLines?: number } = {},
): ContextDocumentSummary | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const d = data;
    const formType = resolveFormType(type) || type;
    const maxLines = options.maxLines ?? REQUEST_LIMITS.documentLines;
    const lightweight = options.lightweight ?? Boolean(d[LIGHTWEIGHT_FLAG]);
    const s: ContextDocumentSummary = {};
    const number = NUMBER_KEYS.map(k => text(d[k], 40)).find(Boolean);
    if (number) s.number = number;
    const status = text(d.status, 30) || text(d.paymentStatus, 30);
    if (status) s.status = status;
    const signedBy = text(d.clientSignedBy, 80);
    const signedAt = ymd(d.clientSignedAt);
    if (signedBy || signedAt || d.clientSignatureUrl) {
        s.signed_by = signedBy || 'client';
        if (signedAt) s.signed_at = signedAt;
    }
    const date = ymd(d.issueDate) || ymd(d.date) || ymd(d.completedDate);
    if (date) s.date = date;
    if (lightweight) return Object.keys(s).length ? s : undefined;

    const priced = (item: Record<string, unknown>, isProgress = false): ContextDocumentLine | null => {
        const desc = text(item.description ?? item.name, 80);
        if (!desc) return null;
        const line: ContextDocumentLine = { desc };
        const qty = amountOrUndefined(item.quantity); const price = amountOrUndefined(item.rate);
        if (qty !== undefined) line.qty = qty;
        if (price !== undefined) line.price = price;
        line.amount = lineItemAmount(item as never, isProgress);
        return line;
    };
    const note = (v: unknown) => { const t = text(v, 240); if (t) s.note = t; };

    switch (formType) {
        case FormType.Invoice:
        case FormType.Estimate:
        case FormType.ChangeOrder:
        case FormType.PurchaseOrder: {
            const totals = computeDocumentTotals(d as never);
            s.total = totals.total;
            Object.assign(s, lines(d.lineItems, item => priced(item, Boolean(d.isProgressBilling)), maxLines));
            if (formType === FormType.Invoice) {
                // Same rule as the job financials: an invoice marked Paid counts as paid in full.
                const paidInFull = /^paid$/i.test(String(d.status || '').trim());
                s.paid = paidInFull ? totals.total : totals.amountPaid;
                s.balance_due = paidInFull ? 0 : totals.balanceDue;
                const due = ymd(d.dueDate);
                if (due) s.due_date = due;
            } else if (formType === FormType.Estimate) {
                const exp = ymd(d.expiryDate);
                if (exp) s.due_date = exp;
            } else if (formType === FormType.PurchaseOrder) {
                const delivery = ymd(d.deliveryDate);
                if (delivery) s.due_date = delivery;
                const vendor = text(d.vendorName, 80);
                if (vendor) s.party = vendor;
            } else {
                note([text(d.description, 200), text(d.reason, 60) ? `Reason: ${text(d.reason, 60)}` : ''].filter(Boolean).join(' · '));
            }
            break;
        }
        case FormType.Receipt: {
            const amount = amountOrUndefined(d.amount);
            if (amount !== undefined) { s.total = amount; s.paid = amount; }
            const method = text(d.paymentMethod, 40);
            if (method) s.party = method;
            note(d.description);
            break;
        }
        case FormType.ExpenseLog: {
            const fromLines = lines(d.lineItems, item => priced(item), maxLines);
            const lineTotal = roundMoney((Array.isArray(d.lineItems) ? d.lineItems : []).reduce((sum: number, i) => sum + lineItemAmount(i as never), 0));
            const amount = amountOrUndefined(d.amount);
            s.total = amount !== undefined && amount > 0 ? amount : lineTotal;
            Object.assign(s, fromLines);
            const vendor = text(d.vendor, 80);
            if (vendor) s.party = vendor;
            note([text(d.item, 120), text(d.category, 30)].filter(Boolean).join(' · '));
            break;
        }
        case FormType.MaterialLog: {
            const list = Array.isArray(d.items) ? d.items as Array<Record<string, unknown>> : [];
            Object.assign(s, lines(list, item => {
                const desc = text(item.name ?? item.description, 80);
                if (!desc) return null;
                const qty = amountOrUndefined(item.quantity); const price = amountOrUndefined(item.unitCost);
                return { desc, ...(qty !== undefined ? { qty } : {}), ...(price !== undefined ? { price } : {}), amount: roundMoney(toNumber(item.quantity) * toNumber(item.unitCost)) };
            }, maxLines));
            s.total = roundMoney(list.reduce((sum, i) => sum + toNumber(i?.quantity) * toNumber(i?.unitCost), 0));
            break;
        }
        case FormType.WorkOrder: {
            const hours = amountOrUndefined(d.hours);
            if (hours) s.hours = hours;
            const cost = amountOrUndefined(d.cost);
            if (cost) s.total = cost;
            note(d.description);
            break;
        }
        case FormType.TimeSheet: {
            const hours = amountOrUndefined(d.hoursWorked);
            if (hours !== undefined) s.hours = hours;
            const worker = text(d.workerName, 80);
            if (worker) s.party = worker;
            const overtime = amountOrUndefined(d.overtimeHours);
            note(overtime ? `Overtime ${overtime} h` : '');
            break;
        }
        case FormType.Warranty:
            note([text(d.duration, 60), text(d.coverage, 160)].filter(Boolean).join(' · '));
            break;
        case FormType.ProfitReport: {
            const total = amountOrUndefined(d.totalWithTax) || amountOrUndefined(d.totalRevenue);
            if (total) s.total = total;
            const profit = amountOrUndefined(d.grossProfit);
            const margin = amountOrUndefined(d.margin);
            note([profit !== undefined ? `Profit ${profit}` : '', margin !== undefined ? `margin ${margin}%` : ''].filter(Boolean).join(', '));
            break;
        }
        default:
            // Daily Job Report, Note and anything else: a short excerpt of the body.
            note(d.content ?? d.description);
    }
    return Object.keys(s).length ? s : undefined;
}

/**
 * Summary of an app document. `fresh` = the row just loaded with DOCUMENT_SUMMARY_COLUMNS for the
 * same id (it has the totals and lines a lightweight list row lacks, and is newer than the list).
 * Without it the app's own copy is used (full document, or number + status for a list row).
 */
export function summarizeDocument(form: FormData, fresh?: Record<string, unknown> | null): ContextDocumentSummary | undefined {
    if (fresh) return summarizeDocumentData(form.type, fresh, { lightweight: false });
    return summarizeDocumentData(form.type, (form.data || {}) as unknown as Record<string, unknown>);
}
