/**
 * Job timeline: the aggregator. Runs every source adapter on the data the panel loaded, merges and de-duplicates the
 * events, sorts them (newest or oldest first), cuts them into local calendar days (the user's time zone), filters by
 * group / search / date range and pages them ("Show earlier"). Pure and cheap: the panel calls it only when the tab is
 * open, and one source that fails never hides the others.
 */
import type { JobPhoto } from '../../components/photos/photoLogic.ts';
import type { PunchItem } from '../punchList.ts';
import type { JobTask } from '../tasks/taskTypes.ts';
import type { JobQuestion } from '../questions/questionTypes.ts';
import type { JobSelection } from '../selections/selectionTypes.ts';
import type { JobQuote, SubCommitment } from '../subs/subTypes.ts';
import type { FeedbackResponse } from '../feedback/feedbackTypes.ts';
import type { RecordRow } from '../reminders.ts';
import type { Punch } from '../crew/crewLogic.ts';
import { addDays, dayOf, moneyText, safely, toYmd } from './timelineHelpers.ts';
import { crewEvents } from './sources/crew.ts';
import { dailyReportEvents } from './sources/dailyReports.ts';
import { documentEvents } from './sources/documents.ts';
import { emailEvents, type EmailLogRow } from './sources/email.ts';
import { expenseEvents } from './sources/expenses.ts';
import { feedbackEvents } from './sources/feedback.ts';
import { noteEvents } from './sources/notes.ts';
import { orderEvents } from './sources/orders.ts';
import { photoEvents } from './sources/photos.ts';
import { punchEvents } from './sources/punch.ts';
import { questionEvents } from './sources/questions.ts';
import { quoteEvents } from './sources/quotes.ts';
import { reminderEvents } from './sources/reminders.ts';
import { selectionEvents } from './sources/selections.ts';
import { subEvents } from './sources/subs.ts';
import { taskEvents } from './sources/tasks.ts';
import { warrantyEvents } from './sources/warranty.ts';
import {
    GROUP_LABELS, TIMELINE_GROUPS,
    type TimelineContext, type TimelineDay, type TimelineDoc, type TimelineEvent, type TimelineFilters, type TimelineGroup, type TimelineOrder,
} from './timelineTypes.ts';

/** Everything the panel could load. A source that is not available (tool not set up, no connection) is just absent. */
export interface TimelineData {
    docs: TimelineDoc[];
    /** document id -> ISO time it was marked Sent (reminder_document_state) */
    sentAt: Record<string, string>;
    photos: JobPhoto[];
    punchItems: PunchItem[];
    tasks: JobTask[];
    questions: JobQuestion[];
    selections: JobSelection[];
    commitments: SubCommitment[];
    quotes: JobQuote[];
    feedback: FeedbackResponse[];
    reminders: RecordRow[];
    punches: Punch[];
    /** reserved for roadmap D11 (email_log) */
    email: EmailLogRow[];
}

/** How many entries one page shows before "Show earlier". */
export const PAGE_SIZE = 50;

// ------------------------------------------------------------------------------------------------ build
export const buildEvents = (data: Partial<TimelineData>, ctx: TimelineContext): TimelineEvent[] => {
    const docs = data.docs || [];
    const all: TimelineEvent[] = [
        ...documentEvents({ docs, sentAt: data.sentAt }, ctx),
        ...dailyReportEvents({ docs }, ctx),
        ...noteEvents({ docs }, ctx),
        ...expenseEvents({ docs }, ctx),
        ...orderEvents({ docs }, ctx),
        ...warrantyEvents({ docs }, ctx),
        ...safely(() => (data.photos ? photoEvents({ photos: data.photos }, ctx) : [])),
        ...safely(() => (data.punchItems ? punchEvents({ items: data.punchItems }, ctx) : [])),
        ...safely(() => (data.tasks ? taskEvents({ tasks: data.tasks }, ctx) : [])),
        ...safely(() => (data.questions ? questionEvents({ questions: data.questions }, ctx) : [])),
        ...safely(() => (data.selections ? selectionEvents({ selections: data.selections }, ctx) : [])),
        ...safely(() => (data.commitments ? subEvents({ commitments: data.commitments }, ctx) : [])),
        ...safely(() => (data.quotes ? quoteEvents({ quotes: data.quotes }, ctx) : [])),
        ...safely(() => (data.feedback ? feedbackEvents({ responses: data.feedback }, ctx) : [])),
        ...safely(() => (data.reminders ? reminderEvents({ records: data.reminders, docs }, ctx) : [])),
        ...safely(() => (data.punches ? crewEvents({ punches: data.punches }, ctx) : [])),
        ...safely(() => emailEvents({ rows: data.email }, ctx)),
    ];
    const today = dayOf(new Date(ctx.now).toISOString(), ctx.tz) || '';
    // nothing from the future (a payment dated tomorrow, a clock that ran ahead): the timeline is what HAPPENED.
    // A day-only entry of today ("noon") that is later than the clock is placed at this moment instead.
    const nowIso = new Date(ctx.now).toISOString();
    return dedupeEvents(all)
        .filter(e => !today || (dayOf(e.at, ctx.tz) || '') <= today)
        .map(e => (e.dayOnly && e.at > nowIso ? { ...e, at: nowIso } : e));
};

/** The same id twice keeps the first (a saved copy and its offline copy); the same sentence at the same instant is one fact. */
export const dedupeEvents = (events: readonly TimelineEvent[]): TimelineEvent[] => {
    const ids = new Set<string>();
    const facts = new Set<string>();
    const out: TimelineEvent[] = [];
    for (const e of events) {
        if (!e || !e.id || !Number.isFinite(Date.parse(e.at))) continue;
        const fact = `${e.at}|${e.kind}|${e.title}`;
        if (ids.has(e.id) || facts.has(fact)) continue;
        ids.add(e.id);
        facts.add(fact);
        out.push(e);
    }
    return out;
};

/** Newest first (default) or oldest first; ties keep a fixed order so the list never jumps. */
export const sortEvents = (events: readonly TimelineEvent[], order: TimelineOrder = 'newest'): TimelineEvent[] =>
    [...events].sort((a, b) => {
        const d = Date.parse(a.at) - Date.parse(b.at);
        const byTime = order === 'newest' ? -d : d;
        return byTime || a.id.localeCompare(b.id);
    });

/** Consecutive events of the same local day (the list must already be sorted). */
export const groupByDay = (events: readonly TimelineEvent[], tz: string): TimelineDay[] => {
    const days: TimelineDay[] = [];
    for (const e of events) {
        const day = dayOf(e.at, tz) || '';
        const last = days[days.length - 1];
        if (last && last.day === day) last.events.push(e);
        else days.push({ day, events: [e] });
    }
    return days;
};

// ------------------------------------------------------------------------------------------------ filters
/** Monday of the week that holds `ymd`. */
export const weekStart = (ymd: string): string => {
    const day = toYmd(ymd);
    if (!day) return ymd;
    const [y, m, d] = day.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    return addDays(day, -((dow + 6) % 7));
};

/** First local day an events may have for a date range chip (null = no limit). */
export const rangeStart = (range: TimelineFilters['range'], today: string): string | null => {
    if (range === 'week') return weekStart(today);
    if (range === 'month') return `${today.slice(0, 7)}-01`;
    return null;
};

/** Everything the search box looks in, lower case. */
export const searchText = (e: TimelineEvent, currency?: string): string => [
    e.title, e.detail, e.body, GROUP_LABELS[e.group], e.kind.replace(/_/g, ' '), e.actor === 'you' ? '' : e.actor,
    ...(e.rows || []).map(r => `${r.label} ${r.value}`), e.photos?.map(p => p.caption).join(' '),
    e.amount !== undefined ? `${e.amount} ${moneyText(e.amount, e.currency || currency)}` : '',
].filter(Boolean).join(' ').toLowerCase();

const matchesQuery = (e: TimelineEvent, tokens: readonly string[], currency?: string): boolean => {
    if (!tokens.length) return true;
    const hay = searchText(e, currency);
    return tokens.every(t => hay.includes(t));
};

const queryTokens = (query: string | undefined): string[] => String(query || '').toLowerCase().split(/\s+/).map(t => t.replace(/^\$/, '')).filter(Boolean);

/** Date range + search (no group): what the group chips count. */
export const filterByRangeAndQuery = (events: readonly TimelineEvent[], filters: TimelineFilters, ctx: TimelineContext): TimelineEvent[] => {
    const today = dayOf(new Date(ctx.now).toISOString(), ctx.tz) || '';
    const from = rangeStart(filters.range, today);
    const tokens = queryTokens(filters.query);
    return events.filter(e => (!from || (dayOf(e.at, ctx.tz) || '') >= from) && matchesQuery(e, tokens, ctx.currency));
};

export const applyFilters = (events: readonly TimelineEvent[], filters: TimelineFilters, ctx: TimelineContext): TimelineEvent[] => {
    const base = filterByRangeAndQuery(events, filters, ctx);
    const groups = filters.groups && filters.groups.length ? new Set<TimelineGroup>(filters.groups) : null;
    return groups ? base.filter(e => groups.has(e.group)) : base;
};

/** How many events each group chip shows (with the date range and search applied, not the groups). */
export const groupCounts = (events: readonly TimelineEvent[], filters: TimelineFilters, ctx: TimelineContext): Record<TimelineGroup, number> => {
    const counts = Object.fromEntries(TIMELINE_GROUPS.map(g => [g, 0])) as Record<TimelineGroup, number>;
    for (const e of filterByRangeAndQuery(events, filters, ctx)) counts[e.group] += 1;
    return counts;
};

// ------------------------------------------------------------------------------------------------ view
export interface TimelineView {
    days: TimelineDay[];
    /** events after the filters (all pages) */
    total: number;
    /** events on screen */
    shown: number;
    hasMore: boolean;
    /** how many more "Show earlier" reveals (never more than the page size at a time) */
    remaining: number;
    counts: Record<TimelineGroup, number>;
}

/** The first `limit` events of an already filtered, sorted list. */
export const pageEvents = <T,>(events: readonly T[], limit: number = PAGE_SIZE): { items: T[]; hasMore: boolean; remaining: number } => {
    const cap = Math.max(0, Math.floor(limit));
    return { items: events.slice(0, cap), hasMore: events.length > cap, remaining: Math.max(0, events.length - cap) };
};

/** Filters, sorts, pages and cuts into days: what the panel renders. */
export const buildView = (
    events: readonly TimelineEvent[],
    opts: { filters: TimelineFilters; order: TimelineOrder; limit: number },
    ctx: TimelineContext,
): TimelineView => {
    const filtered = sortEvents(applyFilters(events, opts.filters, ctx), opts.order);
    const page = pageEvents(filtered, opts.limit);
    return {
        days: groupByDay(page.items, ctx.tz), total: filtered.length, shown: page.items.length, hasMore: page.hasMore, remaining: page.remaining,
        counts: groupCounts(events, opts.filters, ctx),
    };
};
