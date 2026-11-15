/**
 * The new automation rules (N12): PURE `evaluate` functions, one per rule. Each takes the data the app already has,
 * the rule's resolved settings (lib/automations/rules.ts) and the clock, and returns
 *   - `items`   notifications for the bell (stable ids: the same event is the same notification, so what the user
 *               read or removed is never shown again, on any device; lib/notifications/model.ts), and
 *   - `actions` drafts the rule wants made (only in "do it for me" mode on a paid plan, only for events AFTER the user
 *               chose it, and never twice: the done log + a database check in lib/automations/actions.ts).
 *
 * Nothing here changes a document. An action is carried out by lib/automations/actions.ts, which only ever inserts a
 * DRAFT; the next evaluation then shows "your draft is ready" from the done log.
 */
import { clip, docLabel, docPath, type AppNotification } from '../notifications/model.ts';
import { toLocalYMD } from '../../utils/localDates.ts';
import { followUpState, stageLabel, ymdDiff } from '../leads/leadLogic.ts';
import { isOverdue, overdueDays, type TaskLike } from '../tasks/taskLogic.ts';
import type { Lead } from '../leads/leadTypes.ts';
import type { ResolvedRule } from './rules.ts';
import { autoKey, freshCompletedAt, type DoneEntry, type DoneLog, type SeenJobs } from './state.ts';

export const DAY_MS = 86_400_000;
/** An event older than this is never announced or acted on (an old estimate approved last spring is not news). */
export const EVENT_DAYS = 14;
/** At most this many notifications per rule and refresh (the rest are summarized or left for the lists). */
export const MAX_PER_RULE = 6;
/** A job created longer ago than this is never a "just completed" event (guards the capped base list). */
export const JOB_MAX_AGE_DAYS = 540;

export interface EvalContext {
    now: number;
}

/** A draft the engine should make (lib/automations/actions.ts). `key` identifies the source (done log, failures). */
export type AutoAction =
    | { type: 'create_invoice'; key: string; estimateId: string; jobId: string }
    | { type: 'create_warranty'; key: string; jobId: string; completedAtSec: number };

export interface RuleOutput {
    items: AppNotification[];
    actions: AutoAction[];
}

const EMPTY: RuleOutput = { items: [], actions: [] };

const ms = (v: unknown): number => {
    const t = Date.parse(typeof v === 'string' ? v : '');
    return Number.isFinite(t) ? t : 0;
};
const todayOf = (now: number): string => toLocalYMD(new Date(now));
/** Local midnight (epoch ms) of a YYYY-MM-DD day plus `addDays`. */
const dayStart = (ymd: string, addDays = 0): number => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d + addDays).getTime();
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const withinEvent = (at: number, now: number): boolean => at > 0 && at <= now + 60_000 && now - at <= EVENT_DAYS * DAY_MS;

// =====================================================================================================================
// 1. Estimate approved -> the invoice
// =====================================================================================================================
export interface EstimateRef {
    id: string;
    jobId?: string | null;
    number?: string | null;
    title?: string | null;
    clientName?: string | null;
    /** the client's signature / approval time (ISO) */
    signedAt?: string | null;
    declinedAt?: string | null;
    /** when it was sent (ISO or YYYY-MM-DD): the "no answer" rule counts from here */
    sentAt?: string | null;
}

const estimateLabel = (e: Pick<EstimateRef, 'number' | 'title'>) => docLabel({ type: 'Estimate', number: e.number, title: e.title });

export interface EstimateApprovedInput {
    /** estimates the client signed recently (any age is fine: the rule keeps only the last EVENT_DAYS) */
    estimates: readonly EstimateRef[];
    /** ids of estimates an invoice was already made from ("Convert to invoice" or this rule) */
    invoiced: ReadonlySet<string>;
    done: DoneLog;
    /** source keys whose automatic draft failed in this session: they fall back to "tell me" */
    failed: ReadonlySet<string>;
}

/** Done-log entries of a kind as "your draft is ready" notifications. */
const madeNotifications = (done: DoneLog, kind: DoneEntry['r']): AppNotification[] =>
    Object.entries(done.done).filter(([, e]) => e.r === kind).map(([key, e]) => ({
        id: `auto:made:${kind}:${key}`,
        kind: kind === 'inv' ? 'auto_invoice_made' : 'auto_warranty_made',
        text: `${e.l || (kind === 'inv' ? 'Invoice draft' : 'Warranty draft')} is ready as a draft`,
        detail: `${e.f ? `Made from ${e.f}. ` : ''}Review it before you send it.`,
        at: e.at * 1000,
        target: { kind: 'path', path: e.jid ? `/jobs/${e.jid}/forms/${kind === 'inv' ? 'Invoice' : 'Warranty'}/${e.id}` : '/dashboard' },
    }));

export const evalEstimateApproved = (input: EstimateApprovedInput, rule: ResolvedRule, ctx: EvalContext): RuleOutput => {
    if (!rule.on) return EMPTY;
    const items: AppNotification[] = madeNotifications(input.done, 'inv');
    const actions: AutoAction[] = [];
    const sorted = [...input.estimates].sort((a, b) => ms(b.signedAt) - ms(a.signedAt));
    let shown = 0;
    for (const e of sorted) {
        const at = ms(e.signedAt);
        if (!e.id || !withinEvent(at, ctx.now)) continue;
        if (ms(e.declinedAt) >= at) continue; // declined after (or when) it was signed: not an approval
        const key = autoKey('inv', e.id);
        if (input.done.done[key] || input.invoiced.has(e.id)) continue; // already invoiced, or already drafted
        if (rule.mode === 'draft' && e.jobId && at >= rule.since && !input.failed.has(key)) {
            actions.push({ type: 'create_invoice', key, estimateId: e.id, jobId: e.jobId });
            continue;
        }
        if (shown >= MAX_PER_RULE) continue;
        shown++;
        const who = clip(e.clientName, 40);
        items.push({
            id: `auto:inv:${e.id}`, kind: 'auto_invoice_ready',
            text: `${estimateLabel(e)} was approved${who ? ` by ${who}` : ''}`,
            detail: 'Ready to invoice. Open it and tap Convert to invoice.',
            // the bell already tells "signed" (doc_signed): this is the next step, listed without a second unread count
            at, target: { kind: 'path', path: docPath({ id: e.id, jobId: e.jobId, type: 'Estimate' }) }, sourceRead: true,
        });
    }
    return { items, actions };
};

// =====================================================================================================================
// 2. Job completed -> the warranty
// =====================================================================================================================
export interface JobRef {
    id: string;
    name: string;
    clientName?: string | null;
    status: string;
    createdAt?: string | null;
}

export interface JobCompletedInput {
    jobs: readonly JobRef[];
    seen: SeenJobs;
    /** jobs that already have a Warranty document (any): nothing is offered or made for them */
    hasWarranty: ReadonlySet<string>;
    done: DoneLog;
    failed: ReadonlySet<string>;
}

export const evalJobCompleted = (input: JobCompletedInput, rule: ResolvedRule, ctx: EvalContext): RuleOutput => {
    if (!rule.on) return EMPTY;
    const items: AppNotification[] = madeNotifications(input.done, 'war');
    const actions: AutoAction[] = [];
    const oldest = ctx.now - JOB_MAX_AGE_DAYS * DAY_MS;
    const found = input.jobs
        .filter(j => j && j.id && String(j.status).toLowerCase() === 'completed')
        .map(j => ({ job: j, sec: freshCompletedAt(input.seen, j.id) }))
        .filter((x): x is { job: JobRef; sec: number } => x.sec !== null)
        .sort((a, b) => b.sec - a.sec);
    let shown = 0;
    for (const { job, sec } of found) {
        const at = sec * 1000;
        if (!withinEvent(at, ctx.now)) continue;
        if (job.createdAt && ms(job.createdAt) > 0 && ms(job.createdAt) < oldest) continue;
        const key = autoKey('war', job.id);
        if (input.done.done[key] || input.hasWarranty.has(job.id)) continue;
        if (rule.mode === 'draft' && at >= rule.since && !input.failed.has(key)) {
            actions.push({ type: 'create_warranty', key, jobId: job.id, completedAtSec: sec });
            continue;
        }
        if (shown >= MAX_PER_RULE) continue;
        shown++;
        items.push({
            id: `auto:war:${job.id}:${sec}`, kind: 'auto_warranty_ready',
            text: `${clip(job.name, 48) || 'Your job'} is completed`,
            detail: 'Give the client a warranty. Tap to start one.',
            at, target: { kind: 'path', path: `/jobs/${job.id}/forms/Warranty` },
        });
    }
    return { items, actions };
};

// =====================================================================================================================
// 3. Task overdue
// =====================================================================================================================
export type TaskRef = TaskLike & { jobId: string; title: string };

/** At most this many overdue tasks are named each day; the rest are one "and N more" line. */
export const MAX_TASKS_NAMED = 5;

export const evalTaskOverdue = (tasks: readonly TaskRef[], jobNames: ReadonlyMap<string, string>, rule: ResolvedRule, ctx: EvalContext): RuleOutput => {
    if (!rule.on) return EMPTY;
    const today = todayOf(ctx.now);
    const late = tasks.filter(t => t && t.id && isOverdue(t, today)).sort((a, b) => overdueDays(b, today) - overdueDays(a, today) || a.id.localeCompare(b.id));
    const at = dayStart(today);
    const items: AppNotification[] = late.slice(0, MAX_TASKS_NAMED).map(t => {
        const n = overdueDays(t, today);
        return {
            id: `auto:task:${t.id}:${today}`, kind: 'auto_task_overdue' as const,
            text: `“${clip(t.title, 48)}” is ${plural(n, 'day')} late`,
            detail: clip(jobNames.get(t.jobId) || '', 48) || undefined,
            at, target: { kind: 'path' as const, path: `/jobs/${t.jobId}#tasks` },
        };
    });
    if (late.length > MAX_TASKS_NAMED) {
        items.push({
            id: `auto:task:more:${today}`, kind: 'auto_task_overdue',
            text: `and ${plural(late.length - MAX_TASKS_NAMED, 'more overdue task')}`,
            detail: 'Open the Schedule to see them all.', at, target: { kind: 'path', path: '/calendar' },
        });
    }
    return { items, actions: [] };
};

// =====================================================================================================================
// 4. Lead follow-up
// =====================================================================================================================
export type LeadRef = Pick<Lead, 'id' | 'name' | 'followUpOn' | 'stage' | 'archived'> & Partial<Pick<Lead, 'phone'>>;

/** A missed follow-up is announced for this many days after its day; after that the Leads screen is the place. */
export const LEAD_LATE_DAYS = 14;

export const evalLeadFollowUp = (leads: readonly LeadRef[], rule: ResolvedRule, ctx: EvalContext): RuleOutput => {
    if (!rule.on) return EMPTY;
    const today = todayOf(ctx.now);
    const items: AppNotification[] = [];
    const sorted = [...leads].sort((a, b) => String(a.followUpOn).localeCompare(String(b.followUpOn)) || a.id.localeCompare(b.id));
    for (const l of sorted) {
        if (!l || !l.id || items.length >= MAX_PER_RULE) continue;
        const state = followUpState(l, today);
        if (state !== 'today' && state !== 'overdue') continue;
        const day = String(l.followUpOn);
        const late = ymdDiff(day, today);
        if (state === 'overdue' && late > LEAD_LATE_DAYS) continue;
        const name = clip(l.name, 40) || 'a lead';
        items.push({
            id: `auto:lead:${l.id}:${day}:${state === 'today' ? 'today' : 'late'}`, kind: 'auto_lead_followup',
            text: state === 'today' ? `Follow up with ${name} today` : `Follow-up with ${name} is ${plural(late, 'day')} late`,
            detail: [stageLabel(l.stage), clip(l.phone, 24)].filter(Boolean).join(' · ') || undefined,
            at: state === 'today' ? dayStart(day) : dayStart(day, 1),
            target: { kind: 'path', path: `/leads?lead=${encodeURIComponent(l.id)}` },
        });
    }
    return { items, actions: [] };
};

// =====================================================================================================================
// 5. Client answered a question / decided a submittal
// =====================================================================================================================
export interface ReplyRef {
    id: string;
    jobId: string;
    kind: 'question' | 'submittal';
    title: string;
    status: string;
    answeredAt: string | null;
    answeredBy?: string | null;
}

const REPLY_STATUSES = ['answered', 'approved', 'rejected'];

export const evalClientReply = (replies: readonly ReplyRef[], jobNames: ReadonlyMap<string, string>, rule: ResolvedRule, ctx: EvalContext): RuleOutput => {
    if (!rule.on) return EMPTY;
    const items: AppNotification[] = [];
    const sorted = [...replies].sort((a, b) => ms(b.answeredAt) - ms(a.answeredAt) || a.id.localeCompare(b.id));
    for (const r of sorted) {
        if (!r || !r.id || items.length >= MAX_PER_RULE || !REPLY_STATUSES.includes(r.status)) continue;
        const at = ms(r.answeredAt);
        if (!withinEvent(at, ctx.now)) continue;
        const who = clip(r.answeredBy, 30) || 'Your client';
        const what = r.kind === 'submittal' ? 'submittal' : 'question';
        const verb = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'answered';
        items.push({
            id: `auto:reply:${r.id}:${r.status}:${r.answeredAt}`, kind: 'auto_client_reply',
            text: `${who} ${verb} the ${what} “${clip(r.title, 44)}”`,
            detail: clip(jobNames.get(r.jobId) || '', 48) || undefined,
            at, target: { kind: 'path', path: `/jobs/${r.jobId}#questions` },
        });
    }
    return { items, actions: [] };
};

// =====================================================================================================================
// 6. Estimate waiting for an answer
// =====================================================================================================================
export const evalEstimateWaiting = (estimates: readonly EstimateRef[], rule: ResolvedRule, ctx: EvalContext): RuleOutput => {
    if (!rule.on || !(rule.days > 0)) return EMPTY;
    const items: AppNotification[] = [];
    const sorted = [...estimates].sort((a, b) => ms(a.sentAt) - ms(b.sentAt) || a.id.localeCompare(b.id));
    for (const e of sorted) {
        if (!e || !e.id || items.length >= MAX_PER_RULE) continue;
        if (ms(e.signedAt) > 0 || ms(e.declinedAt) > 0) continue; // answered
        const sent = ms(e.sentAt);
        if (!sent) continue;
        const dueAt = sent + rule.days * DAY_MS;
        if (dueAt > ctx.now) continue;
        const waited = Math.floor((ctx.now - sent) / DAY_MS);
        const who = clip(e.clientName, 40);
        items.push({
            id: `auto:wait:${e.id}:${rule.days}`, kind: 'auto_estimate_waiting',
            text: `No answer yet: ${estimateLabel(e)} was sent ${plural(waited, 'day')} ago`,
            detail: who ? `${who}. A quick call often gets it moving.` : 'A quick call often gets it moving.',
            at: dueAt, target: { kind: 'path', path: docPath({ id: e.id, jobId: e.jobId, type: 'Estimate' }) },
        });
    }
    return { items, actions: [] };
};
