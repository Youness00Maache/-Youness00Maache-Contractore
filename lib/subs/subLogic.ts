/**
 * Sub commitments + subcontractor members: pure logic (no Supabase, no React). Shapes: lib/subs/subTypes.ts.
 * Mirrors supabase/migrations/20261116000800_subs_quotes.sql (status machine, limits, payment rules).
 *
 * Status machine
 *   OWNER_TRANSITIONS                         from -> allowed owner targets (never 'accepted': only the sub's link)
 *   canTransition(from, to)                   boolean
 *   ownerActions(c)                           OwnerAction[]  [{ id, label, to }] buttons for a commitment, in order
 *   canEditTerms(c) / canDelete(c) / canRecordPayment(c) / termsResetAcceptance(c, patch)
 *   statusLabel(status)                       'Draft' | 'Sent' | 'Accepted' | 'In progress' | 'Completed' | 'Cancelled'
 * Money
 *   parseAmount(v) / parseRetainage(v)        number | null (null when invalid)
 *   commitmentMoney(c)                        CommitmentMoney (paid, remaining, % paid, retainage held / releasable...)
 *   validatePayment(c, { amount, at?, note? }) string | null   (readable error)
 *   appendPayment(c, input, id?)              SubPayment[]   (the list to save: old entries untouched + the new one)
 * Schedule
 *   scheduleInfo(c, today?)                   ScheduleInfo { state, overdue, daysLate, startsInDays, daysLeft }
 * Lists
 *   sortCommitments(list) / summarizeCommitments(list, today?) -> CommitmentSummary
 * Rows (Supabase <-> app)
 *   COMMITMENT_COLUMNS / mapCommitmentRow(row) / commitmentInsertRow(draft, userId, jobId, issue?) / commitmentPatchRow(patch)
 *   validateCommitmentDraft(draft)            string | null
 *   SUB_MEMBER_COLUMNS / mapSubMemberRow(row) / subMemberPatchRow(patch) / isSubcontractor(m) / subDisplayName(m)
 *   todayISO(date?)                           'YYYY-MM-DD' (local date)
 * Crew link (sub view)
 *   mapSubLinkView(data) / mapSubLinkCommitment(v) / SUB_LINK_MISSING / canSubAccept(c) / subLinkProgress(c) /
 *   validateAcceptName(name)
 */
import { roundMoney } from '../../utils/money.ts';
import {
    COMMITMENT_STATUSES, SUB_LIMITS, type CommitmentDraft, type CommitmentPatch, type CommitmentStatus, type CrewKind, type SubCommitment,
    type SubLinkCommitment, type SubLinkView, type SubMember, type SubMemberPatch, type SubPayment,
} from './subTypes.ts';

// ------------------------------------------------------------------------------------------------ helpers
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (str(v).trim() ? str(v) : null);
const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const cleanLine = (v: unknown, max: number): string | null => {
    const s = str(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max).trim();
    return s || null;
};
const cleanMultiline = (v: unknown, max: number): string | null => {
    const s = str(v).replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, max).trim();
    return s || null;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null => {
    const s = str(v).slice(0, 10);
    return DATE_RE.test(s) ? s : null;
};

export const todayISO = (d: Date = new Date()): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole days from a to b (YYYY-MM-DD), b - a. */
export const daysBetween = (a: string, b: string): number =>
    Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

const isStatus = (v: unknown): v is CommitmentStatus => (COMMITMENT_STATUSES as readonly string[]).includes(str(v));

// ------------------------------------------------------------------------------------------------ status machine
export const OWNER_TRANSITIONS: Readonly<Record<CommitmentStatus, readonly CommitmentStatus[]>> = {
    draft: ['issued', 'cancelled'],
    issued: ['draft', 'in_progress', 'completed', 'cancelled'],
    accepted: ['in_progress', 'completed', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: ['in_progress'],
    cancelled: ['draft'],
};

export const canTransition = (from: CommitmentStatus, to: CommitmentStatus): boolean => OWNER_TRANSITIONS[from]?.includes(to) ?? false;

const STATUS_LABEL: Record<CommitmentStatus, string> = {
    draft: 'Draft', issued: 'Sent', accepted: 'Accepted', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
};
export const statusLabel = (s: CommitmentStatus): string => STATUS_LABEL[s] ?? s;

export type OwnerActionId = 'issue' | 'withdraw' | 'start' | 'complete' | 'reopen' | 'cancel' | 'redraft';
export interface OwnerAction { id: OwnerActionId; label: string; to: CommitmentStatus }

const ACTIONS: Record<CommitmentStatus, OwnerAction[]> = {
    draft: [{ id: 'issue', label: 'Send to sub', to: 'issued' }, { id: 'cancel', label: 'Cancel', to: 'cancelled' }],
    issued: [
        { id: 'start', label: 'Mark started', to: 'in_progress' }, { id: 'complete', label: 'Mark complete', to: 'completed' },
        { id: 'withdraw', label: 'Back to draft', to: 'draft' }, { id: 'cancel', label: 'Cancel', to: 'cancelled' },
    ],
    accepted: [
        { id: 'start', label: 'Mark started', to: 'in_progress' }, { id: 'complete', label: 'Mark complete', to: 'completed' },
        { id: 'cancel', label: 'Cancel', to: 'cancelled' },
    ],
    in_progress: [{ id: 'complete', label: 'Mark complete', to: 'completed' }, { id: 'cancel', label: 'Cancel', to: 'cancelled' }],
    completed: [{ id: 'reopen', label: 'Reopen', to: 'in_progress' }],
    cancelled: [{ id: 'redraft', label: 'Back to draft', to: 'draft' }],
};

/** The owner's status buttons for a commitment (first = main action). Every `to` passes canTransition. */
export const ownerActions = (c: Pick<SubCommitment, 'status'>): OwnerAction[] => ACTIONS[c.status] ?? [];

export const canEditTerms = (c: Pick<SubCommitment, 'status'>): boolean => c.status !== 'cancelled';
export const canDelete = (c: Pick<SubCommitment, 'status' | 'payments'>): boolean =>
    (c.status === 'draft' || c.status === 'cancelled') && c.payments.length === 0;
export const canRecordPayment = (c: Pick<SubCommitment, 'status'>): boolean =>
    c.status === 'issued' || c.status === 'accepted' || c.status === 'in_progress' || c.status === 'completed';

/** True when saving this patch sends an accepted commitment back to 'issued' (the sub must accept the new terms). */
export const termsResetAcceptance = (c: SubCommitment, patch: CommitmentPatch): boolean => {
    if (c.status !== 'accepted') return false;
    const changed = <T>(k: keyof CommitmentPatch, old: T) => patch[k] !== undefined && (patch[k] ?? null) !== (old ?? null);
    return changed('title', c.title) || changed('description', c.description) || changed('startDate', c.startDate) || changed('dueDate', c.dueDate)
        || (patch.amount !== undefined && roundMoney(num(patch.amount)) !== c.amount)
        || (patch.retainagePct !== undefined && roundMoney(num(patch.retainagePct)) !== c.retainagePct);
};

// ------------------------------------------------------------------------------------------------ money
export const parseAmount = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s$€£,]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > SUB_LIMITS.maxAmount) return null;
    return roundMoney(n);
};

export const parseRetainage = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return 0;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s%]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > SUB_LIMITS.maxRetainagePct) return null;
    return roundMoney(n);
};

export interface CommitmentMoney {
    amount: number;
    paid: number;
    /** amount - paid (never below 0) */
    remaining: number;
    /** 0..100, one decimal */
    pctPaid: number;
    /** amount x retainage % : held back until the work is complete */
    retainageTotal: number;
    /** what may be paid before completion (amount - retainageTotal) */
    payableBeforeRelease: number;
    /** retainage not paid yet: min(retainageTotal, remaining) */
    retainageHeld: number;
    /** retainage that can be paid now (completed commitments only) */
    retainageReleasable: number;
    /** what can be paid right now without eating into the retainage (completed: the whole remaining) */
    payableNow: number;
    /** paid more than payableBeforeRelease while not complete (a warning, not an error) */
    intoRetainage: boolean;
}

export const commitmentMoney = (c: Pick<SubCommitment, 'amount' | 'retainagePct' | 'paidTotal' | 'payments' | 'status'>): CommitmentMoney => {
    const amount = roundMoney(Math.max(0, num(c.amount)));
    const paid = roundMoney(c.payments.length ? c.payments.reduce((s, p) => s + num(p.amount), 0) : num(c.paidTotal));
    const remaining = roundMoney(Math.max(0, amount - paid));
    const retainageTotal = roundMoney((amount * Math.min(SUB_LIMITS.maxRetainagePct, Math.max(0, num(c.retainagePct)))) / 100);
    const payableBeforeRelease = roundMoney(amount - retainageTotal);
    const retainageHeld = roundMoney(Math.min(retainageTotal, remaining));
    const done = c.status === 'completed';
    return {
        amount,
        paid,
        remaining,
        pctPaid: amount > 0 ? Math.round((paid / amount) * 1000) / 10 : 0,
        retainageTotal,
        payableBeforeRelease,
        retainageHeld,
        retainageReleasable: done ? retainageHeld : 0,
        payableNow: done ? remaining : roundMoney(Math.max(0, payableBeforeRelease - paid)),
        intoRetainage: !done && paid > payableBeforeRelease,
    };
};

export interface PaymentInput { amount: number | string; at?: string | null; note?: string | null }

/** A readable error for a payment (or null when it can be saved). Negative amounts are corrections. */
export const validatePayment = (c: SubCommitment, input: PaymentInput): string | null => {
    if (!canRecordPayment(c)) return 'Send the commitment before recording payments.';
    if (c.payments.length >= SUB_LIMITS.payments) return `A commitment holds up to ${SUB_LIMITS.payments} payments.`;
    const raw = typeof input.amount === 'number' ? input.amount : Number(String(input.amount ?? '').replace(/[\s$€£,]/g, ''));
    if (!Number.isFinite(raw) || Math.abs(raw) > SUB_LIMITS.maxAmount) return 'Enter the payment amount.';
    const amount = roundMoney(raw);
    if (amount === 0) return "A payment can't be zero.";
    if (input.at && !DATE_RE.test(input.at)) return 'Check the payment date.';
    const total = roundMoney(commitmentMoney(c).paid + amount);
    if (total < 0) return "Payments can't add up to less than zero.";
    if (total > c.amount) return "Payments can't add up to more than the agreed amount.";
    return null;
};

const newPaymentId = (): string => {
    const g = globalThis.crypto;
    if (g?.randomUUID) return g.randomUUID();
    const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
};

/** The payments list to save: the existing entries exactly as they are + the new one (throws on an invalid payment). */
export const appendPayment = (c: SubCommitment, input: PaymentInput, id: string = newPaymentId()): SubPayment[] => {
    const err = validatePayment(c, input);
    if (err) throw new Error(err);
    const amount = roundMoney(typeof input.amount === 'number' ? input.amount : Number(String(input.amount).replace(/[\s$€£,]/g, '')));
    return [...c.payments, { id, at: input.at || todayISO(), amount, note: cleanLine(input.note, SUB_LIMITS.paymentNote) }];
};

// ------------------------------------------------------------------------------------------------ schedule
export type ScheduleState = 'not_scheduled' | 'upcoming' | 'active' | 'overdue' | 'done' | 'cancelled';
export interface ScheduleInfo {
    state: ScheduleState;
    overdue: boolean;
    /** days past the due date (0 when not overdue) */
    daysLate: number;
    /** days until the start date (null without one or once started) */
    startsInDays: number | null;
    /** days until the due date (null without one) */
    daysLeft: number | null;
}

const OPEN: readonly CommitmentStatus[] = ['issued', 'accepted', 'in_progress'];

export const scheduleInfo = (c: Pick<SubCommitment, 'status' | 'startDate' | 'dueDate'>, today: string = todayISO()): ScheduleInfo => {
    if (c.status === 'completed') return { state: 'done', overdue: false, daysLate: 0, startsInDays: null, daysLeft: null };
    if (c.status === 'cancelled') return { state: 'cancelled', overdue: false, daysLate: 0, startsInDays: null, daysLeft: null };
    const daysLeft = c.dueDate ? daysBetween(today, c.dueDate) : null;
    const startsIn = c.startDate ? daysBetween(today, c.startDate) : null;
    const open = OPEN.includes(c.status);
    if (open && daysLeft !== null && daysLeft < 0) return { state: 'overdue', overdue: true, daysLate: -daysLeft, startsInDays: null, daysLeft };
    if (!c.startDate && !c.dueDate) return { state: 'not_scheduled', overdue: false, daysLate: 0, startsInDays: null, daysLeft };
    if (startsIn !== null && startsIn > 0 && c.status !== 'in_progress') return { state: 'upcoming', overdue: false, daysLate: 0, startsInDays: startsIn, daysLeft };
    return { state: 'active', overdue: false, daysLate: 0, startsInDays: null, daysLeft };
};

// ------------------------------------------------------------------------------------------------ lists
const STATUS_ORDER: Record<CommitmentStatus, number> = { issued: 0, accepted: 1, in_progress: 2, draft: 3, completed: 4, cancelled: 5 };

/** Open first (sent, accepted, in progress), then drafts, completed, cancelled; by due date, then newest. */
export const sortCommitments = (list: readonly SubCommitment[]): SubCommitment[] =>
    [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
        || str(b.createdAt).localeCompare(str(a.createdAt)));

export interface CommitmentSummary {
    count: number;
    byStatus: Record<CommitmentStatus, number>;
    /** sent and not accepted yet */
    awaitingAcceptance: number;
    overdue: number;
    /** issued + accepted + in progress + completed amounts (+ what was paid on cancelled ones) */
    committed: number;
    paid: number;
    /** committed - paid */
    outstanding: number;
    retainageHeld: number;
    retainageReleasable: number;
    /** drafts: not committed yet */
    draftTotal: number;
}

export const summarizeCommitments = (list: readonly SubCommitment[], today: string = todayISO()): CommitmentSummary => {
    const byStatus = Object.fromEntries(COMMITMENT_STATUSES.map(s => [s, 0])) as Record<CommitmentStatus, number>;
    let committed = 0, paid = 0, held = 0, releasable = 0, draftTotal = 0, overdue = 0;
    for (const c of list) {
        byStatus[c.status] += 1;
        const m = commitmentMoney(c);
        if (c.status === 'draft') { draftTotal += m.amount; continue; }
        if (c.status === 'cancelled') { committed += m.paid; paid += m.paid; continue; }
        committed += m.amount;
        paid += m.paid;
        held += m.retainageHeld;
        releasable += m.retainageReleasable;
        if (scheduleInfo(c, today).overdue) overdue += 1;
    }
    return {
        count: list.length,
        byStatus,
        awaitingAcceptance: byStatus.issued,
        overdue,
        committed: roundMoney(committed),
        paid: roundMoney(paid),
        outstanding: roundMoney(Math.max(0, committed - paid)),
        retainageHeld: roundMoney(held),
        retainageReleasable: roundMoney(releasable),
        draftTotal: roundMoney(draftTotal),
    };
};

// ------------------------------------------------------------------------------------------------ rows
export const COMMITMENT_COLUMNS = 'id, job_id, crew_member_id, sub_name, title, description, amount, retainage_pct, start_date, due_date, status, payments, paid_total, issued_at, accepted_at, accepted_by, completed_at, cancelled_at, quote_id, notes, created_at, updated_at';

const mapPayments = (v: unknown): SubPayment[] => (Array.isArray(v) ? v : []).filter(p => p && typeof p === 'object').map((p: any) => ({
    id: str(p.id), at: dateOrNull(p.at) || '', amount: roundMoney(num(p.amount)), note: strOrNull(p.note),
}));

export const mapCommitmentRow = (r: Record<string, unknown>): SubCommitment => ({
    id: str(r.id),
    jobId: str(r.job_id),
    crewMemberId: strOrNull(r.crew_member_id),
    subName: str(r.sub_name),
    title: str(r.title),
    description: strOrNull(r.description),
    amount: roundMoney(num(r.amount)),
    retainagePct: roundMoney(num(r.retainage_pct)),
    startDate: dateOrNull(r.start_date),
    dueDate: dateOrNull(r.due_date),
    status: isStatus(r.status) ? r.status : 'draft',
    payments: mapPayments(r.payments),
    paidTotal: roundMoney(num(r.paid_total)),
    issuedAt: strOrNull(r.issued_at),
    acceptedAt: strOrNull(r.accepted_at),
    acceptedBy: strOrNull(r.accepted_by),
    completedAt: strOrNull(r.completed_at),
    cancelledAt: strOrNull(r.cancelled_at),
    quoteId: strOrNull(r.quote_id),
    notes: strOrNull(r.notes),
    createdAt: strOrNull(r.created_at),
    updatedAt: strOrNull(r.updated_at),
});

/** A readable error for a commitment draft (or null). Who does the work: a crew member or a typed name. */
export const validateCommitmentDraft = (d: CommitmentDraft | CommitmentPatch, partial = false): string | null => {
    if (!partial || d.title !== undefined) {
        if (!cleanLine(d.title, SUB_LIMITS.title)) return 'Name the scope of work (e.g. "Electrical rough-in").';
    }
    if (!partial && !d.crewMemberId && !cleanLine(d.subName, SUB_LIMITS.subName)) return 'Pick the subcontractor or type who does the work.';
    if (!partial || d.amount !== undefined) {
        if (parseAmount(d.amount) === null) return `Enter the agreed amount (0 to ${SUB_LIMITS.maxAmount.toLocaleString('en-US')}).`;
    }
    if (d.retainagePct !== undefined && parseRetainage(d.retainagePct) === null) return `Retainage is between 0 and ${SUB_LIMITS.maxRetainagePct}%.`;
    for (const k of ['startDate', 'dueDate'] as const) {
        const v = d[k];
        if (v && !DATE_RE.test(v)) return 'Check the dates.';
    }
    if (d.startDate && d.dueDate && d.startDate > d.dueDate) return 'The start date is after the due date.';
    return null;
};

/** Insert row for sub_commitments (throws a readable Error when invalid). issue = save as 'issued' right away. */
export const commitmentInsertRow = (d: CommitmentDraft, userId: string, jobId: string, issue = false): Record<string, unknown> => {
    const err = validateCommitmentDraft(d);
    if (err) throw new Error(err);
    return {
        user_id: userId,
        job_id: jobId,
        crew_member_id: d.crewMemberId || null,
        sub_name: cleanLine(d.subName, SUB_LIMITS.subName) || '',
        title: cleanLine(d.title, SUB_LIMITS.title),
        description: cleanMultiline(d.description, SUB_LIMITS.longText),
        amount: parseAmount(d.amount),
        retainage_pct: parseRetainage(d.retainagePct) ?? 0,
        start_date: d.startDate || null,
        due_date: d.dueDate || null,
        status: issue ? 'issued' : 'draft',
        payments: [],
        quote_id: d.quoteId || null,
        notes: cleanMultiline(d.notes, SUB_LIMITS.longText),
    };
};

/** Update row for the editable fields present in the patch (throws a readable Error when invalid). */
export const commitmentPatchRow = (p: CommitmentPatch): Record<string, unknown> => {
    const err = validateCommitmentDraft(p, true);
    if (err) throw new Error(err);
    const row: Record<string, unknown> = {};
    if (p.crewMemberId !== undefined) row.crew_member_id = p.crewMemberId || null;
    if (p.subName !== undefined) row.sub_name = cleanLine(p.subName, SUB_LIMITS.subName) || '';
    if (p.title !== undefined) row.title = cleanLine(p.title, SUB_LIMITS.title);
    if (p.description !== undefined) row.description = cleanMultiline(p.description, SUB_LIMITS.longText);
    if (p.amount !== undefined) row.amount = parseAmount(p.amount);
    if (p.retainagePct !== undefined) row.retainage_pct = parseRetainage(p.retainagePct) ?? 0;
    if (p.startDate !== undefined) row.start_date = p.startDate || null;
    if (p.dueDate !== undefined) row.due_date = p.dueDate || null;
    if (p.notes !== undefined) row.notes = cleanMultiline(p.notes, SUB_LIMITS.longText);
    return row;
};

// ------------------------------------------------------------------------------------------------ members
export const SUB_MEMBER_COLUMNS = 'id, name, phone, email, kind, company, trade, active, link_nonce, last_seen_at';

export const mapSubMemberRow = (r: Record<string, unknown>): SubMember => ({
    id: str(r.id),
    name: str(r.name),
    phone: str(r.phone),
    email: str(r.email),
    kind: r.kind === 'subcontractor' ? 'subcontractor' : 'employee',
    company: str(r.company),
    trade: str(r.trade),
    active: r.active !== false,
    linkOn: Boolean(r.link_nonce),
    lastSeenAt: strOrNull(r.last_seen_at),
});

export const subMemberPatchRow = (p: SubMemberPatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (p.kind !== undefined) {
        if (p.kind !== 'employee' && p.kind !== 'subcontractor') throw new Error('Unknown kind of crew member.');
        row.kind = p.kind as CrewKind;
    }
    if (p.company !== undefined) row.company = cleanLine(p.company, SUB_LIMITS.company);
    if (p.trade !== undefined) row.trade = cleanLine(p.trade, SUB_LIMITS.trade);
    return row;
};

export const isSubcontractor = (m: Pick<SubMember, 'kind'>): boolean => m.kind === 'subcontractor';

/** "Company (Name)" / "Name": how a sub is shown in lists (same fallback the database uses for sub_name). */
export const subDisplayName = (m: Pick<SubMember, 'name' | 'company'>): string => {
    const company = m.company.trim();
    const name = m.name.trim();
    if (company && name && company.toLowerCase() !== name.toLowerCase()) return `${company} (${name})`;
    return company || name;
};

/** The default sub_name for a crew member (company, else name), as the database derives it. */
export const subNameOf = (m: Pick<SubMember, 'name' | 'company'>): string => (m.company.trim() || m.name.trim()).slice(0, SUB_LIMITS.subName);

// ------------------------------------------------------------------------------------------------ crew link (sub view)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** One commitment of crew_sub_get / crew_sub_accept (null when the answer has no id). */
export const mapSubLinkCommitment = (v: unknown): SubLinkCommitment | null => {
    const r = obj(v);
    if (!str(r.id)) return null;
    return {
        id: str(r.id),
        jobId: str(r.job_id),
        jobName: str(r.job_name),
        jobAddress: str(r.job_address),
        jobStatus: str(r.job_status),
        title: str(r.title),
        description: strOrNull(r.description),
        amount: roundMoney(num(r.amount)),
        retainagePct: roundMoney(num(r.retainage_pct)),
        startDate: dateOrNull(r.start_date),
        dueDate: dateOrNull(r.due_date),
        status: isStatus(r.status) ? r.status : 'issued',
        paidTotal: roundMoney(num(r.paid_total)),
        issuedAt: strOrNull(r.issued_at),
        acceptedAt: strOrNull(r.accepted_at),
        acceptedBy: strOrNull(r.accepted_by),
        completedAt: strOrNull(r.completed_at),
        tasksDone: Math.max(0, Math.round(num(r.tasks_done))),
        tasksTotal: Math.max(0, Math.round(num(r.tasks_total))),
    };
};

/** crew_sub_get answer (without its { error } case, which the caller handles first). */
export const mapSubLinkView = (data: unknown): SubLinkView => {
    const r = obj(data);
    const m = obj(r.member);
    return {
        available: true,
        serverNow: strOrNull(r.server_now),
        member: str(m.name) ? { name: str(m.name), company: str(m.company), trade: str(m.trade), isSubcontractor: m.is_subcontractor === true } : null,
        commitments: (Array.isArray(r.commitments) ? r.commitments : []).map(mapSubLinkCommitment).filter((c): c is SubLinkCommitment => !!c),
    };
};

/** The empty view used when the sub functions are not in the database (the crew link stays as it was). */
export const SUB_LINK_MISSING: SubLinkView = Object.freeze({ available: false, serverNow: null, member: null, commitments: [] }) as SubLinkView;

/** Can the sub accept this commitment on their link? */
export const canSubAccept = (c: Pick<SubLinkCommitment, 'status'>): boolean => c.status === 'issued';

/** Task progress of the job, 0..100 (null without tasks). */
export const subLinkProgress = (c: Pick<SubLinkCommitment, 'tasksDone' | 'tasksTotal'>): number | null =>
    c.tasksTotal > 0 ? Math.round((Math.min(c.tasksDone, c.tasksTotal) / c.tasksTotal) * 100) : null;

/** A readable error for the name typed to accept (or null). */
export const validateAcceptName = (name: string): string | null => {
    const n = str(name).trim();
    if (!n) return 'Type your name to accept.';
    if (n.length > SUB_LIMITS.acceptName) return 'This name is too long.';
    return null;
};
