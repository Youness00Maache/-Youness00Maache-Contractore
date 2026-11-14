/**
 * Pipeline board (NEXT_STEPS 0c, competitor gap #8): every job, and every quote request that is not a job yet, in the
 * stage its documents say it is in. Nothing is stored: the board is computed from jobs, quote_requests and the
 * documents' own statuses, so a card moves by itself when an estimate is sent or signed, an invoice is sent or paid.
 *
 *   Requests      quote requests not converted yet, and jobs with nothing sent (no estimate, or only a draft)
 *   Estimate sent an estimate with status Sent and no answer yet
 *   Approved      an accepted / client-signed estimate (or approved change order), no work logged yet
 *   In progress   approved + work logged (work order in progress, daily report, time sheet, material or expense log)
 *                 or the job is Completed; also a paid deposit while part of the contract is still to bill
 *   Invoiced      at least one sent invoice that is not paid (Sent / Overdue, or a balance still due)
 *   Paid          every sent invoice is paid (shown for 30 days, older ones on request)
 *
 * Not on the board: Inactive jobs, jobs whose estimates were all declined, and Completed jobs with nothing to track.
 * Pure (no network, no React), so scripts/pipeline-check.ts tests the stage mapping and the stale rules.
 */
import { computeDocumentTotals, roundMoney, toNumber, type MoneyLineItem } from '../utils/money.ts';
import { daysBetween, instantToLocalYMD, normalizeYMD, parseLocalDate } from '../utils/localDates.ts';

// ---------------------------------------------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------------------------------------------
export type PipelineStage = 'request' | 'estimate' | 'approved' | 'in_progress' | 'invoiced' | 'paid';

export interface StageMeta {
    id: PipelineStage;
    label: string;
    /** what the money in the column header means (null = no total) */
    totalLabel: string | null;
    /** text of an empty column */
    empty: string;
}

export const PIPELINE_STAGES: readonly StageMeta[] = [
    { id: 'request', label: 'Requests', totalLabel: null, empty: 'Quote requests and new jobs with nothing sent yet land here.' },
    { id: 'estimate', label: 'Estimate sent', totalLabel: 'quoted', empty: 'Estimates marked Sent wait here for the client’s answer.' },
    { id: 'approved', label: 'Approved', totalLabel: 'won', empty: 'Signed or accepted estimates show up here.' },
    { id: 'in_progress', label: 'In progress', totalLabel: 'contract', empty: 'Approved jobs move here once work is logged.' },
    { id: 'invoiced', label: 'Invoiced', totalLabel: 'due', empty: 'Sent invoices wait here until they are paid.' },
    { id: 'paid', label: 'Paid', totalLabel: 'collected', empty: 'Paid jobs from the last 30 days.' },
];

export const stageIndex = (stage: PipelineStage): number => PIPELINE_STAGES.findIndex(s => s.id === stage);

/** Days before a card gets a "stale" badge. */
export const STALE_DAYS = {
    /** quote request with no job created yet */
    request: 2,
    /** job with nothing sent (no estimate, or only a draft) */
    newJob: 7,
    /** estimate sent, no answer (same as the second estimate follow-up reminder) */
    estimate: 7,
    /** approved, no work logged and nothing invoiced */
    approved: 14,
    /** sent invoice without a due date, still unpaid */
    invoiceNoDueDate: 30,
} as const;

/** Paid jobs stay on the board this many days (older ones behind "Show older"). */
export const PAID_RECENT_DAYS = 30;

// ---------------------------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------------------------
export interface PipelineDoc {
    id: string;
    /** document type as stored ("Estimate", "Invoice", "Change Order", "Receipt", "Work Order", ...) */
    type: string;
    jobId: string | null;
    createdAt: string | null;
    publicToken?: string | null;
    status?: string | null;
    /** estimate / invoice / change order / receipt / work order number */
    number?: string | null;
    title?: string | null;
    clientName?: string | null;
    issueDate?: string | null;
    /** work documents and receipts use `date` */
    date?: string | null;
    dueDate?: string | null;
    expiryDate?: string | null;
    paidAt?: string | null;
    lineItems?: MoneyLineItem[] | null;
    taxRate?: number | string | null;
    discount?: number | string | null;
    shipping?: number | string | null;
    isProgressBilling?: boolean | string | null;
    amountPaid?: number | string | null;
    /** receipts / expense logs */
    amount?: number | string | null;
    clientSignedAt?: string | null;
    clientSignatureUrl?: string | null;
    clientDeclinedAt?: string | null;
    paymentReportedAt?: string | null;
    /** a revision of a signed estimate / change order */
    revisionOf?: string | null;
}

export interface PipelineJobInput {
    id: string;
    name: string;
    clientName?: string | null;
    clientId?: string | null;
    status?: string | null;
    createdAt?: string | null;
    startDate?: string | null;
}

export interface PipelineRequestInput {
    id: string;
    name: string;
    details?: string | null;
    /** 'new' | 'seen' | 'converted' | 'archived' */
    status: string;
    jobId?: string | null;
    createdAt: string;
    photoCount?: number;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const norm = (v: unknown): string => str(v).toLowerCase();
const flag = (v: unknown): boolean => v === true || norm(v) === 'true';
const jsonish = <T,>(v: unknown): T | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string') {
        try { return JSON.parse(v) as T; } catch { return null; }
    }
    return v as T;
};

/**
 * A `documents` row (JSON-path select from components/pipeline/pipelineApi.ts, or a full row with `data`) → PipelineDoc.
 * Never throws on odd data.
 */
export const mapPipelineRow = (row: any): PipelineDoc => {
    const d = row?.data && typeof row.data === 'object' ? row.data : row || {};
    const pick = (k: string) => (d?.[k] !== undefined && d?.[k] !== null ? d[k] : row?.[k] ?? null);
    const text = (k: string) => str(pick(k)) || null;
    const items = jsonish<MoneyLineItem[]>(pick('lineItems'));
    return {
        id: str(row?.id),
        type: str(row?.type),
        jobId: row?.job_id ?? row?.jobId ?? null,
        createdAt: row?.created_at ?? row?.createdAt ?? null,
        publicToken: row?.public_token ?? null,
        status: text('status'),
        number: text('estimateNumber') || text('invoiceNumber') || text('changeOrderNumber') || text('receiptNumber') || text('workOrderNumber'),
        title: text('title'),
        clientName: text('clientName'),
        issueDate: text('issueDate'),
        date: text('date'),
        dueDate: text('dueDate'),
        expiryDate: text('expiryDate'),
        paidAt: text('paidAt'),
        lineItems: Array.isArray(items) ? items : null,
        taxRate: pick('taxRate'),
        discount: pick('discount'),
        shipping: pick('shipping'),
        isProgressBilling: pick('isProgressBilling'),
        amountPaid: pick('amountPaid'),
        amount: pick('amount'),
        clientSignedAt: text('clientSignedAt'),
        clientSignatureUrl: text('clientSignatureUrl'),
        clientDeclinedAt: text('clientDeclinedAt'),
        paymentReportedAt: text('paymentReportedAt'),
        revisionOf: text('revisionOf'),
    };
};

// ---------------------------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------------------------
/** Local calendar day of a business date ("2026-11-03") or an instant ("2026-11-03T18:20:00Z"), else null. */
export const dayOf = (v: unknown): string | null => {
    const s = str(v);
    if (!s) return null;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return normalizeYMD(s);
    return instantToLocalYMD(s) ?? normalizeYMD(s);
};

/** Whole days from `from` to `today` (never negative), null when unknown. */
export const daysSince = (from: string | null | undefined, today: string): number | null => {
    const a = parseLocalDate(from ?? null);
    const b = parseLocalDate(today);
    if (!a || !b) return null;
    return Math.max(0, daysBetween(a, b));
};

/** Days from today until `day` (negative = in the past), null when unknown. */
const daysUntil = (day: string | null, today: string): number | null => {
    const a = parseLocalDate(today);
    const b = parseLocalDate(day);
    return a && b ? daysBetween(a, b) : null;
};

const earliest = (days: Array<string | null | undefined>): string | null =>
    days.filter((d): d is string => !!d).sort()[0] ?? null;
const latest = (days: Array<string | null | undefined>): string | null =>
    days.filter((d): d is string => !!d).sort().reverse()[0] ?? null;

// ---------------------------------------------------------------------------------------------------------------
// Document states
// ---------------------------------------------------------------------------------------------------------------
export type DocKind = 'estimate' | 'invoice' | 'change_order' | 'receipt' | 'work' | 'other';

const WORK_TYPES = ['work order', 'daily job report', 'time sheet', 'material log', 'expense log'];

export const docKind = (doc: Pick<PipelineDoc, 'type'>): DocKind => {
    const t = norm(doc.type).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    if (t === 'estimate') return 'estimate';
    if (t === 'invoice') return 'invoice';
    if (t === 'change order') return 'change_order';
    if (t === 'receipt') return 'receipt';
    if (WORK_TYPES.includes(t)) return 'work';
    return 'other';
};

/** A work document that shows work happened (a work order only once it is In Progress, On Hold or Completed). */
export const isWorkEvidence = (doc: PipelineDoc): boolean => {
    if (docKind(doc) !== 'work') return false;
    if (norm(doc.type).replace(/\s+/g, ' ') !== 'work order') return true;
    return ['in progress', 'on hold', 'completed'].includes(norm(doc.status));
};

export type ApprovalState = 'draft' | 'sent' | 'accepted' | 'declined';

/**
 * Estimate / change order state. Same rule as Job financials (lib/finance.ts isAcceptedDoc): Accepted / Approved /
 * Signed or a client signature counts as accepted, never a Draft; Rejected / Declined or the client's decline is declined.
 */
export const approvalState = (doc: PipelineDoc): ApprovalState => {
    const s = norm(doc.status);
    if (s === 'rejected' || s === 'declined') return 'declined';
    if (s === 'draft') return 'draft';
    if (s === 'accepted' || s === 'approved' || s === 'signed' || doc.clientSignedAt || doc.clientSignatureUrl) return 'accepted';
    if (doc.clientDeclinedAt) return 'declined';
    if (s === 'sent') return 'sent';
    return 'draft';
};

/** Totals exactly like the PDF / portal (utils/money.ts). */
export const docTotal = (doc: PipelineDoc): number => {
    if (docKind(doc) === 'receipt') return roundMoney(Math.max(0, toNumber(doc.amount)));
    return computeDocumentTotals({
        lineItems: Array.isArray(doc.lineItems) ? doc.lineItems : [],
        taxRate: doc.taxRate,
        discount: doc.discount,
        shipping: doc.shipping,
        isProgressBilling: flag(doc.isProgressBilling),
        amountPaid: doc.amountPaid,
    }).total;
};

export interface InvoiceState {
    /** counts as sent (anything but Draft / Cancelled / Void; no status = Draft) */
    billed: boolean;
    paid: boolean;
    open: boolean;
    overdue: boolean;
    /** days past the due date (0 when not overdue) */
    overdueDays: number;
    total: number;
    balance: number;
}

export const invoiceState = (doc: PipelineDoc, today: string): InvoiceState => {
    const s = norm(doc.status);
    const t = computeDocumentTotals({
        lineItems: Array.isArray(doc.lineItems) ? doc.lineItems : [],
        taxRate: doc.taxRate,
        discount: doc.discount,
        shipping: doc.shipping,
        isProgressBilling: flag(doc.isProgressBilling),
        amountPaid: doc.amountPaid,
    });
    const billed = !['', 'draft', 'cancelled', 'canceled', 'void'].includes(s);
    const paid = billed && (s === 'paid' || (t.total > 0 && t.balanceDue <= 0.004));
    const open = billed && !paid;
    const due = dayOf(doc.dueDate);
    const pastDue = due ? daysUntil(due, today) : null;
    const overdueDays = open && pastDue !== null && pastDue < 0 ? -pastDue : 0;
    const overdue = open && (overdueDays > 0 || s === 'overdue');
    return { billed, paid, open, overdue, overdueDays, total: t.total, balance: s === 'paid' ? 0 : t.balanceDue };
};

/** The day a document was issued / sent (issue date, else its date, else when it was created). */
const issuedDay = (doc: PipelineDoc): string | null => dayOf(doc.issueDate) ?? dayOf(doc.date) ?? dayOf(doc.createdAt);

const byIssuedDesc = (a: PipelineDoc, b: PipelineDoc) => String(issuedDay(b) || '').localeCompare(String(issuedDay(a) || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
const sum = (list: number[]) => roundMoney(list.reduce((s, n) => s + n, 0));

// ---------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------
export type PipelineAction =
    | 'convert'        // quote request → client + job (Request window)
    | 'open_request'
    | 'open_job'
    | 'open_doc'       // the card's document (estimate / invoice)
    | 'follow_up'      // Share window for the card's document
    | 'reminders'      // automatic reminders for the card's document
    | 'mark_paid'      // Mark as paid window
    | 'finish_job'     // job status → Completed
    | 'set_inactive';  // job status → Inactive (off the board)

export type AlertReason =
    | 'no_reply' | 'nothing_sent' | 'no_answer' | 'expired' | 'not_started' | 'not_invoiced' | 'overdue' | 'unpaid' | 'payment_reported';

export interface PipelineAlert {
    reason: AlertReason;
    /** warning = stale, danger = overdue, success = the client says they paid */
    tone: 'warning' | 'danger' | 'success';
    label: string;
    days: number | null;
}

export interface PipelineCard {
    /** 'job:<id>' or 'request:<id>' */
    key: string;
    kind: 'job' | 'request';
    stage: PipelineStage;
    title: string;
    client: string;
    /** money shown on the card and added to the column total (null = none) */
    value: number | null;
    /** small word after the value: 'draft', 'due', ... ('' = none) */
    valueNote: string;
    /** day the card entered its stage (YYYY-MM-DD) */
    since: string | null;
    /** days in this stage */
    age: number | null;
    alert: PipelineAlert | null;
    /** one short line: document number, due date, "Invoice draft ready" ... */
    detail: string;
    jobId: string | null;
    requestId: string | null;
    clientId: string | null;
    jobStatus: string | null;
    /** the document the card's actions work on */
    doc: PipelineDoc | null;
    /** first = the main one-tap action */
    actions: PipelineAction[];
    /** a Paid card older than PAID_RECENT_DAYS (hidden unless asked for) */
    older: boolean;
}

export interface PipelineColumn {
    stage: PipelineStage;
    meta: StageMeta;
    cards: PipelineCard[];
    /** sum of the card values (null for the Requests column) */
    total: number | null;
    /** cards with an alert */
    attention: number;
}

export interface PipelineBoard {
    columns: PipelineColumn[];
    /** every card on the board (after the "older paid" filter) */
    cards: PipelineCard[];
    hidden: {
        /** jobs set to Inactive */
        inactive: number;
        /** jobs whose estimates were all declined */
        lost: number;
        /** Completed jobs with nothing sent or billed */
        closed: number;
        /** Paid cards older than PAID_RECENT_DAYS that are not shown */
        olderPaid: number;
    };
    /** value of everything not paid yet: sent estimates + approved / in progress contracts + invoices due */
    openValue: number;
    /** cards with an alert */
    attention: number;
}

/** First non-empty line of a request, cut at a word. */
const snippet = (text: unknown, max = 60): string => {
    const line = str(text).split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
    if (line.length <= max) return line;
    const cut = line.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, '')}…`;
};

const alert = (reason: AlertReason, days: number | null): PipelineAlert => {
    const d = days ?? 0;
    switch (reason) {
        case 'no_reply': return { reason, tone: 'warning', label: `No reply · ${d}d`, days };
        case 'nothing_sent': return { reason, tone: 'warning', label: `Nothing sent · ${d}d`, days };
        case 'no_answer': return { reason, tone: 'warning', label: `No answer · ${d}d`, days };
        case 'expired': return { reason, tone: 'warning', label: d > 0 ? `Expired ${d}d ago` : 'Expires today', days };
        case 'not_started': return { reason, tone: 'warning', label: `Not started · ${d}d`, days };
        case 'not_invoiced': return { reason, tone: 'warning', label: 'Finished · not invoiced', days };
        case 'overdue': return { reason, tone: 'danger', label: d > 0 ? `${d}d overdue` : 'Overdue', days };
        case 'unpaid': return { reason, tone: 'warning', label: `Unpaid · ${d}d`, days };
        case 'payment_reported': return { reason, tone: 'success', label: 'Client says paid', days };
    }
};

/** Card for a quote request that has no job yet (null for converted / archived requests). */
export const requestCard = (req: PipelineRequestInput, today: string): PipelineCard | null => {
    const status = norm(req.status);
    if (status === 'archived' || status === 'converted' || req.jobId) return null;
    const since = dayOf(req.createdAt);
    const age = daysSince(since, today);
    const photos = Math.max(0, Math.floor(toNumber(req.photoCount)));
    return {
        key: `request:${req.id}`,
        kind: 'request',
        stage: 'request',
        title: snippet(req.details) || 'Quote request',
        client: str(req.name) || 'Unnamed',
        value: null,
        valueNote: '',
        since,
        age,
        alert: age !== null && age > STALE_DAYS.request ? alert('no_reply', age) : null,
        detail: [status === 'new' ? 'New quote request' : 'Quote request', photos ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : ''].filter(Boolean).join(' · '),
        jobId: null,
        requestId: req.id,
        clientId: null,
        jobStatus: null,
        doc: null,
        actions: ['convert', 'open_request'],
        older: false,
    };
};

export type JobPlacement =
    | { card: PipelineCard }
    | { hidden: 'inactive' | 'lost' | 'closed' };

/** Where one job sits on the board, from its documents. */
export const placeJob = (job: PipelineJobInput, jobDocs: PipelineDoc[], today: string, fromRequest = false): JobPlacement => {
    const jobStatus = norm(job.status) || 'active';
    if (jobStatus === 'inactive') return { hidden: 'inactive' };
    const completed = jobStatus === 'completed';

    const estimatesAll = jobDocs.filter(d => docKind(d) === 'estimate');
    const changeOrdersAll = jobDocs.filter(d => docKind(d) === 'change_order');
    // a revision that left draft replaces the document it revises (its total is the one that counts)
    const superseded = new Set(
        [...estimatesAll, ...changeOrdersAll].filter(d => d.revisionOf && approvalState(d) !== 'draft').map(d => String(d.revisionOf)),
    );
    const estimates = estimatesAll.filter(d => !superseded.has(d.id));
    const accepted = estimates.filter(d => approvalState(d) === 'accepted').sort(byIssuedDesc);
    const sent = estimates.filter(d => approvalState(d) === 'sent').sort(byIssuedDesc);
    const drafts = estimates.filter(d => approvalState(d) === 'draft').sort(byIssuedDesc);
    const declined = estimates.filter(d => approvalState(d) === 'declined');
    const acceptedCOs = changeOrdersAll.filter(d => !superseded.has(d.id) && approvalState(d) === 'accepted');
    const contract = sum([...accepted, ...acceptedCOs].map(docTotal));

    const invoices = jobDocs.filter(d => docKind(d) === 'invoice').map(d => ({ doc: d, st: invoiceState(d, today) }));
    const billed = invoices.filter(i => i.st.billed);
    const open = billed.filter(i => i.st.open);
    const paidInv = billed.filter(i => i.st.paid);
    const draftInv = invoices.filter(i => !i.st.billed && !['cancelled', 'canceled', 'void'].includes(norm(i.doc.status))).map(i => i.doc).sort(byIssuedDesc);
    const receipts = jobDocs.filter(d => docKind(d) === 'receipt');
    const work = jobDocs.filter(isWorkEvidence);

    const client = str(job.clientName) || str([...accepted, ...sent, ...billed.map(i => i.doc)][0]?.clientName);
    const base = {
        key: `job:${job.id}`,
        kind: 'job' as const,
        title: str(job.name) || 'Untitled job',
        client,
        jobId: job.id,
        requestId: null,
        clientId: job.clientId ?? null,
        jobStatus,
        older: false,
    };
    const num = (d: PipelineDoc | null | undefined) => str(d?.number) || str(d?.title) || (d ? str(d.type) : '');
    const more = (n: number) => (n > 1 ? ` +${n - 1} more` : '');

    // ---- Invoiced: money is out and not all back yet
    if (open.length) {
        const overdue = open.filter(i => i.st.overdue).sort((a, b) => b.st.overdueDays - a.st.overdueDays);
        const byIssued = [...open].sort((a, b) => byIssuedDesc(b.doc, a.doc)); // oldest first
        const target = overdue[0] ?? byIssued[0];
        const reported = open.find(i => i.doc.paymentReportedAt);
        const since = issuedDay(byIssued[0].doc);
        const age = daysSince(since, today);
        const due = dayOf(target.doc.dueDate);
        const dueIn = due ? daysUntil(due, today) : null;
        let a: PipelineAlert | null = null;
        if (reported) a = alert('payment_reported', null);
        else if (overdue.length) a = alert('overdue', overdue[0].st.overdueDays);
        else if (!due && age !== null && age > STALE_DAYS.invoiceNoDueDate) a = alert('unpaid', age);
        const dueText = !target.st.overdue && dueIn !== null && dueIn >= 0 ? (dueIn === 0 ? ' · due today' : ` · due in ${dueIn}d`) : '';
        const doc = reported?.doc ?? target.doc;
        return {
            card: {
                ...base,
                stage: 'invoiced',
                value: sum(open.map(i => i.st.balance)),
                valueNote: 'due',
                since,
                age,
                alert: a,
                detail: `${num(doc)}${more(open.length)}${doc === target.doc ? dueText : ''}`,
                doc,
                actions: reported
                    ? ['mark_paid', 'open_doc', 'follow_up', 'reminders', 'open_job']
                    : ['follow_up', 'mark_paid', 'reminders', 'open_doc', 'open_job'],
            },
        };
    }

    // ---- Paid (or a paid deposit while part of the contract is still to bill)
    if (paidInv.length || receipts.length) {
        const moneyIn = paidInv.length ? sum(paidInv.map(i => i.st.total)) : sum(receipts.map(docTotal));
        const paidDay = latest([
            ...paidInv.map(i => dayOf(i.doc.paidAt) ?? issuedDay(i.doc)),
            ...receipts.map(r => dayOf(r.date) ?? dayOf(r.createdAt)),
        ]);
        if (contract > moneyIn + 0.5) {
            const since = earliest(work.map(w => dayOf(w.date) ?? dayOf(w.createdAt))) ?? paidDay;
            const doc = draftInv[0] ?? accepted[0] ?? null;
            return {
                card: {
                    ...base,
                    stage: 'in_progress',
                    value: contract,
                    valueNote: '',
                    since,
                    age: daysSince(since, today),
                    alert: completed ? alert('not_invoiced', null) : null,
                    detail: draftInv.length ? 'Invoice draft ready' : 'Deposit paid, balance not invoiced',
                    doc,
                    actions: completed ? ['open_doc', 'open_job'] : ['open_job', 'open_doc', 'finish_job'],
                },
            };
        }
        const age = daysSince(paidDay, today);
        const lastPaid = [...paidInv].sort((a, b) => String(dayOf(b.doc.paidAt) ?? issuedDay(b.doc) ?? '').localeCompare(String(dayOf(a.doc.paidAt) ?? issuedDay(a.doc) ?? '')))[0]?.doc ?? null;
        return {
            card: {
                ...base,
                stage: 'paid',
                value: moneyIn,
                valueNote: '',
                since: paidDay,
                age,
                alert: null,
                detail: lastPaid ? `${num(lastPaid)}${more(paidInv.length)}` : 'Paid by receipt',
                doc: lastPaid,
                actions: ['open_job', 'open_doc'],
                older: age !== null && age > PAID_RECENT_DAYS,
            },
        };
    }

    // ---- Approved / In progress
    if (accepted.length || acceptedCOs.length) {
        const approvedDoc = accepted[0] ?? [...acceptedCOs].sort(byIssuedDesc)[0];
        const approvedDay = dayOf(approvedDoc.clientSignedAt) ?? issuedDay(approvedDoc);
        if (work.length || completed) {
            const since = earliest(work.map(w => dayOf(w.date) ?? dayOf(w.createdAt))) ?? approvedDay;
            const doc = draftInv[0] ?? approvedDoc;
            return {
                card: {
                    ...base,
                    stage: 'in_progress',
                    value: contract,
                    valueNote: '',
                    since,
                    age: daysSince(since, today),
                    alert: completed ? alert('not_invoiced', null) : null,
                    detail: draftInv.length ? 'Invoice draft ready' : num(approvedDoc),
                    doc,
                    actions: completed ? ['open_doc', 'open_job'] : ['open_job', 'open_doc', 'finish_job'],
                },
            };
        }
        const age = daysSince(approvedDay, today);
        return {
            card: {
                ...base,
                stage: 'approved',
                value: contract,
                valueNote: '',
                since: approvedDay,
                age,
                alert: age !== null && age > STALE_DAYS.approved ? alert('not_started', age) : null,
                detail: draftInv.length ? 'Invoice draft ready' : num(approvedDoc),
                doc: draftInv[0] ?? approvedDoc,
                actions: ['open_doc', 'open_job', 'finish_job'],
            },
        };
    }

    // ---- Estimate sent
    if (sent.length) {
        const doc = sent[0];
        const since = issuedDay(doc);
        const age = daysSince(since, today);
        const expiry = dayOf(doc.expiryDate);
        const expiresIn = expiry ? daysUntil(expiry, today) : null;
        let a: PipelineAlert | null = null;
        if (expiresIn !== null && expiresIn < 0) a = alert('expired', -expiresIn);
        else if (age !== null && age > STALE_DAYS.estimate) a = alert('no_answer', age);
        return {
            card: {
                ...base,
                stage: 'estimate',
                value: docTotal(doc),
                valueNote: '',
                since,
                age,
                alert: a,
                detail: `${num(doc)}${more(sent.length)}`,
                doc,
                actions: ['follow_up', 'reminders', 'open_doc', 'open_job', 'set_inactive'],
            },
        };
    }

    // ---- Work without an estimate (time & materials): in progress until invoiced
    if (work.length) {
        const since = earliest(work.map(w => dayOf(w.date) ?? dayOf(w.createdAt)));
        return {
            card: {
                ...base,
                stage: 'in_progress',
                value: null,
                valueNote: '',
                since,
                age: daysSince(since, today),
                alert: completed ? alert('not_invoiced', null) : null,
                detail: draftInv.length ? 'Invoice draft ready' : 'Work logged, no estimate',
                doc: draftInv[0] ?? null,
                actions: completed ? ['open_job', 'open_doc'] : ['open_job', 'open_doc', 'finish_job'],
            },
        };
    }

    if (declined.length && !drafts.length) return { hidden: 'lost' };
    if (completed) return { hidden: 'closed' };

    // ---- Requests: a job with nothing sent yet
    const since = dayOf(job.createdAt) ?? dayOf(job.startDate);
    const age = daysSince(since, today);
    const draft = drafts[0] ?? null;
    return {
        card: {
            ...base,
            stage: 'request',
            value: draft ? docTotal(draft) : null,
            valueNote: draft ? 'draft' : '',
            since,
            age,
            alert: age !== null && age > STALE_DAYS.newJob ? alert('nothing_sent', age) : null,
            detail: [draft ? `Draft ${num(draft)}`.trim() : 'Nothing sent yet', fromRequest ? 'from a quote request' : ''].filter(Boolean).join(' · '),
            doc: draft,
            actions: draft ? ['open_doc', 'open_job', 'set_inactive'] : ['open_job', 'set_inactive'],
        },
    };
};

const ALERT_RANK: Record<PipelineAlert['tone'], number> = { danger: 0, success: 1, warning: 2 };

/** Order inside a column: alerts first (overdue, client says paid, stale), then the longest waiting; Paid: newest first. */
export const compareCards = (a: PipelineCard, b: PipelineCard): number => {
    const ra = a.alert ? ALERT_RANK[a.alert.tone] : 9;
    const rb = b.alert ? ALERT_RANK[b.alert.tone] : 9;
    if (ra !== rb) return ra - rb;
    const sa = a.since || '';
    const sb = b.since || '';
    if (a.stage === 'paid') return sb.localeCompare(sa) || a.title.localeCompare(b.title);
    return (sa || '9999').localeCompare(sb || '9999') || a.title.localeCompare(b.title);
};

/** The whole board. `showOlderPaid` keeps Paid cards older than PAID_RECENT_DAYS. */
export const buildPipeline = (
    input: { jobs: PipelineJobInput[]; docs: PipelineDoc[]; requests?: PipelineRequestInput[] | null; today: string },
    options: { showOlderPaid?: boolean } = {},
): PipelineBoard => {
    const { today } = input;
    const docsByJob = new Map<string, PipelineDoc[]>();
    for (const d of input.docs) {
        if (!d.jobId) continue;
        const list = docsByJob.get(d.jobId);
        if (list) list.push(d); else docsByJob.set(d.jobId, [d]);
    }
    const requests = input.requests || [];
    const fromRequest = new Set(requests.filter(r => r.jobId).map(r => String(r.jobId)));

    const hidden = { inactive: 0, lost: 0, closed: 0, olderPaid: 0 };
    const cards: PipelineCard[] = [];
    for (const job of input.jobs) {
        const placed = placeJob(job, docsByJob.get(job.id) || [], today, fromRequest.has(job.id));
        if ('hidden' in placed) { hidden[placed.hidden]++; continue; }
        if (placed.card.older && !options.showOlderPaid) { hidden.olderPaid++; continue; }
        cards.push(placed.card);
    }
    const jobIds = new Set(input.jobs.map(j => j.id));
    for (const req of requests) {
        // a converted request whose job still exists is that job's card; one whose job was deleted is gone
        if (req.jobId && jobIds.has(String(req.jobId))) continue;
        const card = requestCard(req, today);
        if (card) cards.push(card);
    }

    const columns: PipelineColumn[] = PIPELINE_STAGES.map(meta => {
        const list = cards.filter(c => c.stage === meta.id).sort(compareCards);
        return {
            stage: meta.id,
            meta,
            cards: list,
            total: meta.totalLabel ? sum(list.map(c => c.value ?? 0)) : null,
            attention: list.filter(c => c.alert).length,
        };
    });
    const openValue = sum(columns.filter(c => c.stage !== 'request' && c.stage !== 'paid').map(c => c.total ?? 0));
    return { columns, cards, hidden, openValue, attention: cards.filter(c => c.alert).length };
};

/** Cards matching a search (job, client, document number, request text). */
export const filterCards = (cards: PipelineCard[], query: string, attentionOnly = false): PipelineCard[] => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return cards.filter(c => {
        if (attentionOnly && !c.alert) return false;
        if (!words.length) return true;
        const text = [c.title, c.client, c.detail, c.doc?.number].map(norm).join(' ');
        return words.every(w => text.includes(w));
    });
};
