/**
 * Job tasks UI helpers (batch D2 phase B): pure, no React / Supabase, tested by scripts/job-tasks-check.ts.
 * The words and numbers the screens show, kept out of the components so they can be checked without a browser.
 *
 *   dates        shortDay, dueLabel, waitingLabel, tabCount
 *   moving       dateMove, followUpPlan ("Move the tasks that follow too?": same days / only as far as needed)
 *   critical     criticalSummary, afterLabel
 *   timeline     timelineTicks (day header: weekends, Mondays, month starts)
 *   schedule     scheduleTasks, scheduleTasksOnDay, dueCountsByDay, scheduleAgenda (the account's open tasks on the Schedule)
 *   review       keepProposals, keepDrafts (what the contractor ticked before anything is saved)
 *   worker page  crewTaskLists, crewDueLabel
 */
import {
    addDays, allDependents, criticalPath, daysBetween, isOverdue, isYmd, pushDependents, shiftDependents, taskSpan,
    type DatePatch, type TaskLike, type TimelineWindow,
} from './taskLogic.ts';
import type { CrewTask, JobTask, ProposedTask, TaskDraft } from './taskTypes.ts';

// ===================================================================================================== dates
const WEEKDAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] } as const;
const MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
} as const;
export type TaskLang = 'en' | 'es';

const parts = (ymd: string): { y: number; m: number; d: number; dow: number } => {
    const [y, m, d] = ymd.split('-').map(Number);
    return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** "Tue Nov 17" (the year only when it is not `thisYear`). A bad date comes back as it was. */
export function shortDay(ymd: string | null | undefined, lang: TaskLang = 'en', thisYear?: number): string {
    if (!isYmd(ymd)) return String(ymd || '');
    const p = parts(ymd);
    const base = lang === 'es' ? `${WEEKDAYS.es[p.dow]} ${p.d} ${MONTHS.es[p.m - 1]}` : `${WEEKDAYS.en[p.dow]} ${MONTHS.en[p.m - 1]} ${p.d}`;
    return thisYear !== undefined && p.y !== thisYear ? `${base} ${p.y}` : base;
}

export type DueTone = 'late' | 'today' | 'soon' | 'normal' | 'none';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The date line of a task row: "3 days late", "Due today", "Due Fri Nov 20", "Mon Nov 16 to Wed Nov 18", "No date". */
export function dueLabel(task: Pick<TaskLike, 'status' | 'startDate' | 'dueDate' | 'isMilestone'>, today: string): { text: string; tone: DueTone } {
    const span = taskSpan(task);
    if (task.status === 'done') return { text: span ? `Was due ${shortDay(span.end)}` : 'Done', tone: 'none' };
    if (!span) return { text: 'No date', tone: 'none' };
    const year = parts(today).y;
    if (span.end < today) {
        const n = daysBetween(span.end, today);
        return { text: `${plural(n, 'day', 'days')} late`, tone: 'late' };
    }
    if (task.isMilestone) return { text: span.end === today ? 'Milestone today' : `Milestone ${shortDay(span.end, 'en', year)}`, tone: span.end === today ? 'today' : 'normal' };
    if (span.end === today) return { text: 'Due today', tone: 'today' };
    if (span.start <= today) return { text: `Due ${shortDay(span.end, 'en', year)}`, tone: 'today' };
    const soon = daysBetween(today, span.start) <= 2 ? 'soon' : 'normal';
    return span.start === span.end
        ? { text: `${soon === 'soon' ? 'Starts' : 'Due'} ${shortDay(span.start, 'en', year)}`, tone: soon }
        : { text: `${shortDay(span.start, 'en', year)} to ${shortDay(span.end, 'en', year)}`, tone: soon };
}

/** "Waiting on 2" / "Waiting on 1" ('' when nothing). */
export const waitingLabel = (n: number): string => (n > 0 ? `Waiting on ${n}` : '');

/** The small count next to the Tasks tab: done / total ('' when there are no tasks). */
export const tabCount = (p: { done: number; total: number }): string => (p.total > 0 ? `${p.done}/${p.total}` : '');

// ===================================================================================================== moving
type DateFields = { startDate: string | null; dueDate: string | null };

/**
 * How many days a task moved when its dates changed (positive = later). Measured on the last day (the due date), or on
 * the start when it has no due date. 0 when nothing moved or the change is not a move (a date added / removed).
 */
export function dateMove(before: DateFields, after: DateFields): number {
    if (isYmd(before.dueDate) && isYmd(after.dueDate)) return daysBetween(before.dueDate, after.dueDate);
    if (!isYmd(before.dueDate) && !isYmd(after.dueDate) && isYmd(before.startDate) && isYmd(after.startDate)) return daysBetween(before.startDate, after.startDate);
    return 0;
}

export interface FollowUpPlan {
    /** days the task moved (later = positive) */
    delta: number;
    /** "Move them too": every unfinished task that waits for it moves by the same days */
    shift: DatePatch[];
    /** "Only as far as needed": only the tasks that would now start before this one ends */
    push: DatePatch[];
}

/**
 * The question "Move the tasks that follow too?" after a task's dates changed. `tasks` are the tasks as they were before
 * the change; `after` the new dates of `taskId`. Empty plans (shift = []) mean there is nothing to ask.
 */
export function followUpPlan(tasks: readonly TaskLike[], taskId: string, after: DateFields): FollowUpPlan {
    const before = tasks.find(t => t.id === taskId);
    if (!before) return { delta: 0, shift: [], push: [] };
    const delta = dateMove(before, after);
    if (!delta) return { delta: 0, shift: [], push: [] };
    const moved = tasks.map(t => (t.id === taskId ? { ...t, startDate: after.startDate, dueDate: after.dueDate } : t));
    const shift = shiftDependents(moved, taskId, delta);
    const follow = new Set(allDependents(moved, taskId).map(t => t.id));
    const push = pushDependents(moved).filter(p => follow.has(p.id));
    return { delta, shift, push };
}

// ===================================================================================================== critical path
export interface CriticalSummary { ids: string[]; count: number; days: number; endDate: string | null }

/** The longest chain of waiting tasks: how many tasks, how many days from its first start to its last end. */
export function criticalSummary(tasks: readonly TaskLike[]): CriticalSummary {
    const ids = criticalPath(tasks);
    if (!ids.length) return { ids: [], count: 0, days: 0, endDate: null };
    const byId = new Map(tasks.map(t => [t.id, t]));
    let first: string | null = null;
    let last: string | null = null;
    for (const id of ids) {
        const span = taskSpan(byId.get(id)!);
        if (!span) continue;
        if (!first || span.start < first) first = span.start;
        if (!last || span.end > last) last = span.end;
    }
    return { ids, count: ids.length, days: first && last ? daysBetween(first, last) + 1 : 0, endDate: last };
}

/** "after Demo", "after Demo and Rough plumbing", "after Demo + 2 more" ('' when it waits for nothing known). */
export function afterLabel(task: Pick<TaskLike, 'dependsOn'>, byId: ReadonlyMap<string, { title?: string }>, max = 28): string {
    const names = (task.dependsOn || []).map(id => byId.get(id)?.title).filter((n): n is string => !!n)
        .map(n => (n.length > max ? `${n.slice(0, max - 1).trim()}…` : n));
    if (!names.length) return '';
    if (names.length === 1) return `after ${names[0]}`;
    if (names.length === 2) return `after ${names[0]} and ${names[1]}`;
    return `after ${names[0]} + ${names.length - 1} more`;
}

// ===================================================================================================== timeline header
export interface TimelineTick {
    offset: number;
    day: string;
    /** day of the month (1-31) */
    dom: number;
    weekend: boolean;
    monday: boolean;
    /** "Nov" on the 1st and on the first column, else '' */
    month: string;
}

/** One tick per day of the window (for the header and the weekend shading). */
export function timelineTicks(window: TimelineWindow, lang: TaskLang = 'en'): TimelineTick[] {
    const out: TimelineTick[] = [];
    for (let i = 0; i < window.days; i++) {
        const day = addDays(window.start, i);
        const p = parts(day);
        out.push({
            offset: i,
            day,
            dom: p.d,
            weekend: p.dow === 0 || p.dow === 6,
            monday: p.dow === 1,
            month: p.d === 1 || i === 0 ? MONTHS[lang][p.m - 1] : '',
        });
    }
    return out;
}

// ===================================================================================================== schedule
export interface ScheduleTask {
    id: string;
    jobId: string;
    title: string;
    start: string;
    end: string;
    isMilestone: boolean;
    overdue: boolean;
}

/** The open tasks that have a date, as the Schedule draws them (soonest first). */
export function scheduleTasks(tasks: readonly Pick<JobTask, 'id' | 'jobId' | 'title' | 'status' | 'startDate' | 'dueDate' | 'isMilestone' | 'dependsOn' | 'sortOrder'>[], today: string): ScheduleTask[] {
    const out: ScheduleTask[] = [];
    for (const t of tasks) {
        if (t.status === 'done') continue;
        const span = taskSpan(t);
        if (!span) continue;
        out.push({ id: t.id, jobId: t.jobId, title: t.title, start: span.start, end: span.end, isMilestone: t.isMilestone, overdue: isOverdue(t, today) });
    }
    return out.sort((a, b) => a.end.localeCompare(b.end) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

/** Tasks that run on a day (first day <= day <= last day); today also lists the ones that are late. */
export function scheduleTasksOnDay(list: readonly ScheduleTask[], ymd: string, today: string): ScheduleTask[] {
    return list.filter(t => (t.start <= ymd && ymd <= t.end) || (ymd === today && t.overdue));
}

/** Per day: how many tasks end (are due) there, and whether one of them is late. */
export function dueCountsByDay(list: readonly ScheduleTask[]): Map<string, { count: number; overdue: boolean }> {
    const out = new Map<string, { count: number; overdue: boolean }>();
    for (const t of list) {
        const cur = out.get(t.end) || { count: 0, overdue: false };
        cur.count += 1;
        cur.overdue = cur.overdue || t.overdue;
        out.set(t.end, cur);
    }
    return out;
}

export interface ScheduleAgenda { overdue: ScheduleTask[]; days: Array<{ day: string; tasks: ScheduleTask[] }> }

/** The list view: late tasks first, then the tasks due between two days (inclusive), grouped by due day. */
export function scheduleAgenda(list: readonly ScheduleTask[], from: string, to: string): ScheduleAgenda {
    const overdue = list.filter(t => t.overdue);
    const byDay = new Map<string, ScheduleTask[]>();
    for (const t of list) {
        if (t.overdue || t.end < from || t.end > to) continue;
        byDay.set(t.end, [...(byDay.get(t.end) || []), t]);
    }
    return { overdue, days: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, tasks]) => ({ day, tasks })) };
}

// ===================================================================================================== review
/** The proposals that stay ticked; positions in `dependsOnIndex` are moved to the new list (a dropped task is no longer waited for). */
export function keepProposals(proposals: readonly ProposedTask[], keep: readonly boolean[]): ProposedTask[] {
    const newIndex = new Map<number, number>();
    proposals.forEach((_, i) => { if (keep[i]) newIndex.set(i, newIndex.size); });
    return proposals.flatMap((p, i) => (keep[i]
        ? [{ ...p, dependsOnIndex: p.dependsOnIndex.map(n => newIndex.get(n)).filter((n): n is number => n !== undefined) }]
        : []));
}

/** Drafts with only the ticked ones; dependencies on a dropped draft are removed. */
export function keepDrafts(drafts: readonly TaskDraft[], keepIds: ReadonlySet<string>): TaskDraft[] {
    return drafts.filter(d => d.id && keepIds.has(d.id)).map(d => ({ ...d, dependsOn: (d.dependsOn || []).filter(id => keepIds.has(id)) }));
}

// ===================================================================================================== worker page
const DAY_MS = 86_400_000;

/**
 * The worker's lists: open tasks (soonest due first, no date last) and the ones finished within `days` days (newest first).
 * `now` is a time in ms (the phone's clock).
 */
export function crewTaskLists(tasks: readonly CrewTask[], now: number, days = 14): { open: CrewTask[]; done: CrewTask[] } {
    const open = tasks.filter(t => t.status !== 'done').sort((a, b) =>
        (a.dueDate || a.startDate || '9999-12-31').localeCompare(b.dueDate || b.startDate || '9999-12-31') || a.title.localeCompare(b.title));
    const since = now - days * DAY_MS;
    const done = tasks.filter(t => {
        if (t.status !== 'done') return false;
        const at = t.completedAt ? Date.parse(t.completedAt) : NaN;
        return Number.isFinite(at) ? at >= since : false;
    }).sort((a, b) => Date.parse(b.completedAt || '') - Date.parse(a.completedAt || ''));
    return { open, done };
}

/** "Due Fri Nov 20" / "Hoy" ... for the worker page, in English or Spanish. */
export function crewDueLabel(task: Pick<CrewTask, 'status' | 'startDate' | 'dueDate' | 'isMilestone'>, today: string, lang: TaskLang): { text: string; late: boolean } {
    const span = taskSpan(task);
    if (!span) return { text: lang === 'es' ? 'Sin fecha' : 'No date', late: false };
    const year = parts(today).y;
    const day = shortDay(span.end, lang, year);
    if (task.status !== 'done' && span.end < today) {
        const n = daysBetween(span.end, today);
        return { text: lang === 'es' ? `${n} ${n === 1 ? 'día' : 'días'} de retraso` : `${plural(n, 'day', 'days')} late`, late: true };
    }
    if (span.end === today) return { text: lang === 'es' ? 'Para hoy' : 'Due today', late: false };
    return { text: lang === 'es' ? `Para ${day}` : `Due ${day}`, late: false };
}
