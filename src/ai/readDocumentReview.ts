/**
 * Review-screen logic of "Read with AI" (roadmap N6), pure and browser-free (tested by scripts/read-document-check.ts):
 *   draftFromReading   the AI's answer -> an editable draft (nothing invented: missing values stay empty)
 *   totalsCheck        the live "adds up / doesn't add up" line (lines -> subtotal, subtotal + tax -> total)
 *   fieldConfidence    which fields to highlight (low / medium confidence)
 *   toExpensePatch     the reviewed draft -> the EXISTING expense shape (ExpenseLogData); what the expense has no field
 *                      for (document number, due date, payment, currency, job reference, subtotal, summary) goes into
 *                      the notes as readable text
 *   suggestJob         a job the document mentions (by job or client name), shown as a hint only, never assigned
 */
import type { ExpenseLogData, LineItem } from '../../types.ts';
import { normalizeLineItems } from '../../components/forms/formUtils.ts';
import {
    amountsMatch, type ConfidenceGroup, type ConfidenceLevel, type DocumentKind, type ReadDocumentResult, type ReadWarning,
} from '../../supabase/functions/ai-assistant/shared/documentReading.ts';

export interface ReviewLine {
    key: string;
    description: string;
    quantity: number | null;
    unit: string;
    unitPrice: number | null;
    amount: number | null;
}

export interface ReviewDraft {
    kind: DocumentKind;
    isCreditNote: boolean;
    vendor: string;
    documentNumber: string;
    documentDate: string;
    dueDate: string;
    currency: string;
    category: string;
    lines: ReviewLine[];
    subtotal: number | null;
    tax: number | null;
    total: number | null;
    paymentMethod: string;
    cardLast4: string;
    jobReference: string;
    summary: string;
    pageCount: number | null;
    warnings: ReadWarning[];
    confidence: Record<ConfidenceGroup, ConfidenceLevel>;
}

export const KIND_LABELS: Record<DocumentKind, string> = {
    receipt: 'Receipt',
    supplier_invoice: 'Supplier invoice',
    quote: 'Quote',
    delivery_note: 'Delivery note',
    other: 'Document',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
let lineSeq = 0;
export const newLineKey = () => `l${Date.now().toString(36)}${(lineSeq++).toString(36)}`;

/** The AI's answer -> the editable draft. The category is the AI's pick from the list, else "Other" (when listed). */
export function draftFromReading(r: ReadDocumentResult, categories: readonly string[]): ReviewDraft {
    const fallback = categories.includes('Other') ? 'Other' : categories[0] || '';
    return {
        kind: r.kind,
        isCreditNote: r.isCreditNote,
        vendor: r.vendor || '',
        documentNumber: r.documentNumber || '',
        documentDate: r.documentDate || '',
        dueDate: r.dueDate || '',
        currency: r.currency || '',
        category: r.suggestedCategory && categories.includes(r.suggestedCategory) ? r.suggestedCategory : fallback,
        lines: r.lineItems.map(l => ({ key: newLineKey(), description: l.description, quantity: l.quantity, unit: l.unit || '', unitPrice: l.unitPrice, amount: l.amount })),
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        paymentMethod: r.paymentMethod || '',
        cardLast4: r.cardLast4 || '',
        jobReference: r.jobReference || '',
        summary: r.summary,
        pageCount: r.pageCount,
        warnings: r.warnings,
        confidence: r.confidence,
    };
}

/** A line's amount: as printed, else quantity × unit price, else null. */
export const lineAmount = (l: Pick<ReviewLine, 'quantity' | 'unitPrice' | 'amount'>): number | null =>
    l.amount !== null && Number.isFinite(l.amount) ? l.amount
        : l.quantity !== null && l.unitPrice !== null && Number.isFinite(l.quantity) && Number.isFinite(l.unitPrice) ? round2(l.quantity * l.unitPrice) : null;

export interface TotalsCheck {
    /** ok = every available check adds up; off = at least one doesn't; incomplete = nothing to compare yet */
    status: 'ok' | 'off' | 'incomplete';
    linesSum: number;
    /** lines without an amount (not counted) */
    unpricedLines: number;
    /** what subtotal (or the lines) + tax comes to */
    expectedTotal: number | null;
    /** total − expected (signed), when off */
    difference: number | null;
    message: string;
}

const money = (n: number) => n.toFixed(2);

/** The live "adds up" line of the review screen. */
export function totalsCheck(d: Pick<ReviewDraft, 'lines' | 'subtotal' | 'tax' | 'total'>): TotalsCheck {
    const amounts = d.lines.map(lineAmount);
    const unpricedLines = amounts.filter(a => a === null).length;
    const linesSum = round2(amounts.reduce<number>((s, a) => s + (a ?? 0), 0));
    const hasLines = amounts.some(a => a !== null);
    const tax = d.tax ?? 0;
    const base = d.subtotal ?? (hasLines ? linesSum : null);
    const expectedTotal = base !== null ? round2(base + tax) : null;
    const problems: string[] = [];
    if (d.subtotal !== null && hasLines && !unpricedLines && !amountsMatch(linesSum, d.subtotal)) {
        problems.push(`the lines come to ${money(linesSum)}, the subtotal says ${money(d.subtotal)}`);
    }
    if (d.total !== null && expectedTotal !== null && !amountsMatch(expectedTotal, d.total)) {
        problems.push(`${d.subtotal !== null ? 'subtotal' : 'lines'} + tax = ${money(expectedTotal)}, the total says ${money(d.total)}`);
    }
    if (problems.length) {
        return {
            status: 'off', linesSum, unpricedLines, expectedTotal,
            difference: d.total !== null && expectedTotal !== null ? round2(d.total - expectedTotal) : null,
            message: `Doesn't add up: ${problems.join('; ')}.`,
        };
    }
    if (d.total === null || expectedTotal === null) {
        return { status: 'incomplete', linesSum, unpricedLines, expectedTotal, difference: null, message: d.total === null ? 'Add the total paid.' : 'Add the lines or the subtotal to check the total.' };
    }
    return {
        status: 'ok', linesSum, unpricedLines, expectedTotal, difference: 0,
        message: `Adds up: ${d.subtotal !== null ? 'subtotal' : 'lines'} ${money(base as number)}${d.tax !== null ? ` + tax ${money(tax)}` : ''} = ${money(d.total)}.`,
    };
}

export type ReviewField = 'vendor' | 'documentNumber' | 'documentDate' | 'dueDate' | 'subtotal' | 'tax' | 'total' | 'lines';
const GROUP_FIELDS: Record<ConfidenceGroup, ReviewField[]> = {
    vendor: ['vendor', 'documentNumber'],
    dates: ['documentDate', 'dueDate'],
    amounts: ['subtotal', 'tax', 'total'],
    lineItems: ['lines'],
};

/** Fields to highlight: the confidence of each field's group, only when it is not high. */
export function fieldConfidence(confidence: Record<ConfidenceGroup, ConfidenceLevel>): Partial<Record<ReviewField, 'low' | 'medium'>> {
    const out: Partial<Record<ReviewField, 'low' | 'medium'>> = {};
    for (const group of Object.keys(GROUP_FIELDS) as ConfidenceGroup[]) {
        const level = confidence[group];
        if (level === 'low' || level === 'medium') for (const f of GROUP_FIELDS[group]) out[f] = level;
    }
    return out;
}

/** What still blocks Save (the expense needs a real date). */
export function reviewProblem(d: Pick<ReviewDraft, 'documentDate' | 'vendor' | 'total' | 'lines'>): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.documentDate) || Number.isNaN(Date.parse(`${d.documentDate}T00:00:00Z`))) return 'Add the date of the receipt or invoice.';
    if (!d.vendor.trim() && d.total === null && !d.lines.some(l => lineAmount(l) !== null)) return 'Nothing to save yet: add the vendor or an amount.';
    return null;
}

/** One draft line -> an expense line (the printed line total wins when quantity × price doesn't match it). */
function toExpenseLine(l: ReviewLine): Record<string, unknown> | null {
    const description = l.description.trim();
    const amt = lineAmount(l);
    if (!description && amt === null) return null;
    const unit = l.unit.trim();
    if (l.quantity !== null && l.quantity > 0 && l.unitPrice !== null && amt !== null && Math.abs(round2(l.quantity * l.unitPrice) - amt) <= 0.01) {
        return { description, quantity: l.quantity, rate: l.unitPrice, ...(unit ? { unit } : {}) };
    }
    if (amt !== null) {
        const qty = l.quantity !== null && l.quantity !== 1 ? `${l.quantity}${unit ? ` ${unit}` : ''} × ` : '';
        return { description: `${qty}${description}`.trim(), quantity: 1, rate: amt };
    }
    return { description, quantity: l.quantity !== null && l.quantity > 0 ? l.quantity : 1, rate: 0, ...(unit ? { unit } : {}) };
}

export interface ExpensePatchResult {
    /** lineItems only when the document has lines (the form keeps its own blank line otherwise) */
    patch: Pick<ExpenseLogData, 'vendor' | 'date' | 'category' | 'title' | 'tax' | 'amount' | 'notes'> & { lineItems?: LineItem[] };
    /** true = the form computes the total from items + tax (they match the printed total); false = keep the printed total */
    autoTotal: boolean;
}

/** The readable extra facts for the notes (only those the expense has no field for). */
export function readingNotes(d: ReviewDraft, opts: { photoUrl?: string } = {}): string {
    const label = KIND_LABELS[d.kind];
    const lines = [`Read with AI from a ${label.toLowerCase()}${d.pageCount && d.pageCount > 1 ? ` (${d.pageCount} pages)` : ''}.`];
    if (d.documentNumber.trim()) lines.push(`${label} no.: ${d.documentNumber.trim()}`);
    if (d.dueDate.trim()) lines.push(`Due: ${d.dueDate.trim()}`);
    const pay = [d.paymentMethod.trim(), d.cardLast4 ? `ending ${d.cardLast4.replace(/\D/g, '').slice(-4)}` : ''].filter(Boolean).join(' ');
    if (pay) lines.push(`Paid by: ${pay}`);
    if (d.currency.trim()) lines.push(`Currency: ${d.currency.trim()}`);
    if (d.subtotal !== null) lines.push(`Subtotal on the ${label.toLowerCase()}: ${money(d.subtotal)}`);
    if (d.jobReference.trim()) lines.push(`Job reference: ${d.jobReference.trim()}`);
    if (d.summary.trim()) lines.push(`Summary: ${d.summary.trim()}`);
    if (opts.photoUrl) lines.push(`Photo: ${opts.photoUrl}`);
    return lines.join('\n');
}

/** The reviewed draft -> the existing expense shape (saved by the Expense Log's normal save). */
export function toExpensePatch(d: ReviewDraft, opts: { existingNotes?: string; photoUrl?: string; existingTitle?: string } = {}): ExpensePatchResult {
    const items = normalizeLineItems(d.lines.map(toExpenseLine).filter(Boolean)) as LineItem[];
    const amounts = d.lines.map(lineAmount);
    const linesSum = round2(amounts.reduce<number>((s, a) => s + (a ?? 0), 0));
    const tax = d.tax ?? 0;
    const hasItems = items.length > 0 && linesSum !== 0;
    const autoTotal = d.total === null ? true : hasItems && amountsMatch(round2(linesSum + tax), d.total);
    const amount = d.total ?? round2(linesSum + tax);
    const vendor = d.vendor.trim();
    const notes = [opts.existingNotes?.trim() || '', readingNotes(d, { photoUrl: opts.photoUrl })].filter(Boolean).join('\n\n');
    return {
        patch: {
            vendor,
            date: d.documentDate,
            category: d.category as ExpenseLogData['category'],
            title: opts.existingTitle?.trim() || [vendor, KIND_LABELS[d.kind].toLowerCase()].filter(Boolean).join(' ') || KIND_LABELS[d.kind],
            ...(items.length ? { lineItems: items } : {}),
            tax,
            amount,
            notes,
        },
        autoTotal,
    };
}

export interface JobRef { id: string; name: string; clientName?: string | null }

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const GENERIC_JOB_WORDS = new Set(['job', 'new job', 'project', 'kitchen', 'bathroom', 'remodel', 'repair', 'test']);

/**
 * A job the document mentions (job reference, summary, lines, vendor text): a job name or its client's full name found
 * as whole words. Only an unambiguous match that is not the current job; a hint only (the user decides).
 */
export function suggestJob(d: Pick<ReviewDraft, 'jobReference' | 'summary' | 'lines' | 'vendor'>, jobs: readonly JobRef[], currentJobId?: string | null): { job: JobRef; reason: string } | null {
    const hay = ` ${fold([d.jobReference, d.summary, d.vendor, ...d.lines.map(l => l.description)].join(' '))} `;
    if (hay.trim().length < 3) return null;
    const hits: Array<{ job: JobRef; reason: string }> = [];
    for (const job of jobs) {
        const name = fold(job.name || '');
        const client = fold(job.clientName || '');
        if (name.length >= 4 && !GENERIC_JOB_WORDS.has(name) && hay.includes(` ${name} `)) hits.push({ job, reason: `mentions “${job.name}”` });
        else if (client.length >= 4 && client.includes(' ') && hay.includes(` ${client} `)) hits.push({ job, reason: `mentions ${job.clientName}` });
    }
    if (hits.length !== 1) return null;
    return hits[0].job.id === currentJobId ? null : hits[0];
}
