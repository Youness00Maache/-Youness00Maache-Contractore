/**
 * Job tasks + schedule: pure logic (no React, no Supabase; Node-testable by scripts/job-tasks-check.ts).
 * Shapes: lib/tasks/taskTypes.ts. Dates are local calendar days 'YYYY-MM-DD'.
 *
 * Exports (what the UI uses):
 *   dates        todayYmd, isYmd, addDays, daysBetween, taskSpan
 *   lists        sortTasks, taskWhen, groupTasksByWhen, isOverdue, overdueDays, taskProgress
 *   order        nextSortOrder, reorderPatches
 *   dependencies validateDependencies, wouldCreateCycle, findCycle, topologicalOrder, unfinishedDependencies,
 *                isWaitingOnOthers, displayStatus, directDependents, allDependents
 *   dates move   shiftDependents (same number of days), pushDependents (only as far as needed)
 *   timeline     timelineWindow, layoutTimeline (rows, bars, milestones, links, today line), criticalPath
 *   proposals    proposalsToDrafts (AI / work order suggestions -> TaskDraft[] with real dependency ids)
 *   templates    parseTaskTemplates, serializeTaskTemplates, instantiateTemplate, templateFromTasks,
 *                STARTER_TASK_TEMPLATES
 */
import {
    TASK_LIMITS, TASK_STATUSES, TEMPLATE_LIMITS,
    type JobTask, type ProposedTask, type TaskDraft, type TaskStatus, type TaskTemplate, type TaskTemplateItem,
    type TaskTemplatesSetting,
} from './taskTypes.ts';

/** The fields the logic needs; a JobTask always fits. */
export type TaskLike = Pick<JobTask, 'id' | 'status' | 'startDate' | 'dueDate' | 'dependsOn' | 'isMilestone' | 'sortOrder'>
    & { jobId?: string; title?: string; createdAt?: string };

// =============================================================================================== dates
const DAY_MS = 86_400_000;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isYmd = (v: unknown): v is string => {
    if (typeof v !== 'string') return false;
    const m = YMD_RE.exec(v);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

/** Day number since 1970-01-01 (null for a bad date). */
const dayNum = (ymd: string | null | undefined): number | null => {
    if (!ymd || !isYmd(ymd)) return null;
    const m = YMD_RE.exec(ymd)!;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
};
const fromDayNum = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

const pad2 = (n: number) => String(n).padStart(2, '0');
/** The device's local date. */
export const todayYmd = (now: Date = new Date()): string => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

export const addDays = (ymd: string, days: number): string => {
    const n = dayNum(ymd);
    if (n === null) throw new Error(`Not a date: ${ymd}`);
    return fromDayNum(n + Math.round(days));
};

/** b - a in days. */
export const daysBetween = (a: string, b: string): number => {
    const x = dayNum(a);
    const y = dayNum(b);
    if (x === null || y === null) throw new Error('Not a date');
    return y - x;
};

/**
 * First and last day of a task (a missing start = the due day and the other way round); null when it has no date.
 * A milestone is one point: its due day (else its start day).
 */
export const taskSpan = (t: Pick<TaskLike, 'startDate' | 'dueDate' | 'isMilestone'>): { start: string; end: string } | null => {
    const s = isYmd(t.startDate) ? t.startDate : null;
    const e = isYmd(t.dueDate) ? t.dueDate : null;
    if (!s && !e) return null;
    if (t.isMilestone) { const d = (e || s)!; return { start: d, end: d }; }
    const start = s || e!;
    const end = e || s!;
    return dayNum(end)! < dayNum(start)! ? { start: end, end: start } : { start, end };
};

// =============================================================================================== lists
/** By sort order, then creation time, then title (stable for equal values). */
export function sortTasks<T extends TaskLike>(tasks: readonly T[]): T[] {
    return [...tasks].sort((a, b) => (a.sortOrder - b.sortOrder)
        || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
        || String(a.title || '').localeCompare(String(b.title || '')));
}

export type WhenGroup = 'overdue' | 'today' | 'upcoming' | 'later' | 'no_date' | 'done';
export const WHEN_GROUPS: readonly WhenGroup[] = ['overdue', 'today', 'upcoming', 'later', 'no_date', 'done'];
export const WHEN_GROUP_LABELS: Record<WhenGroup, string> = {
    overdue: 'Overdue', today: 'Today', upcoming: 'Coming up', later: 'Later', no_date: 'No date', done: 'Done',
};

/** Not done and its last day is before today. */
export const isOverdue = (t: TaskLike, today: string): boolean => {
    if (t.status === 'done') return false;
    const span = taskSpan(t);
    return !!span && span.end < today;
};

/** Days late (0 when not overdue). */
export const overdueDays = (t: TaskLike, today: string): number => {
    const span = taskSpan(t);
    return isOverdue(t, today) && span ? daysBetween(span.end, today) : 0;
};

/**
 * Where a task goes on the "what's next" lists:
 *   done; overdue (last day passed); today (today is within its days); upcoming (starts within `upcomingDays`);
 *   later; no_date.
 */
export function taskWhen(t: TaskLike, today: string, upcomingDays = 7): WhenGroup {
    if (t.status === 'done') return 'done';
    const span = taskSpan(t);
    if (!span) return 'no_date';
    if (span.end < today) return 'overdue';
    if (span.start <= today) return 'today';
    return daysBetween(today, span.start) <= upcomingDays ? 'upcoming' : 'later';
}

/** Tasks per group; inside a group: by first day, then sort order (done: newest finished first by due day). */
export function groupTasksByWhen<T extends TaskLike>(tasks: readonly T[], today: string, upcomingDays = 7): Record<WhenGroup, T[]> {
    const out: Record<WhenGroup, T[]> = { overdue: [], today: [], upcoming: [], later: [], no_date: [], done: [] };
    for (const t of sortTasks(tasks)) out[taskWhen(t, today, upcomingDays)].push(t);
    const byDay = (a: T, b: T) => {
        const x = taskSpan(a);
        const y = taskSpan(b);
        return (x?.end || '').localeCompare(y?.end || '') || (x?.start || '').localeCompare(y?.start || '');
    };
    for (const g of ['overdue', 'today', 'upcoming', 'later'] as const) out[g].sort(byDay);
    out.done.sort((a, b) => byDay(b, a));
    return out;
}

export interface TaskProgress { total: number; done: number; open: number; overdue: number; milestones: number; milestonesDone: number; percent: number }

/** Share of tasks done (0-100, whole number; 0 when there are none). */
export function taskProgress(tasks: readonly TaskLike[], today?: string): TaskProgress {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const ms = tasks.filter(t => t.isMilestone);
    return {
        total,
        done,
        open: total - done,
        overdue: today ? tasks.filter(t => isOverdue(t, today)).length : 0,
        milestones: ms.length,
        milestonesDone: ms.filter(t => t.status === 'done').length,
        percent: total ? Math.round((done / total) * 100) : 0,
    };
}

// =============================================================================================== order
const SORT_STEP = 10;

/** The sort order of a task added at the end. */
export const nextSortOrder = (tasks: readonly Pick<TaskLike, 'sortOrder'>[]): number =>
    Math.min(TASK_LIMITS.sortOrder, tasks.reduce((m, t) => Math.max(m, t.sortOrder), 0) + SORT_STEP);

/** New sort orders for a list in its new order (10, 20, 30 ...): only the tasks whose value changes. */
export function reorderPatches(orderedIds: readonly string[], tasks: readonly Pick<TaskLike, 'id' | 'sortOrder'>[]): Array<{ id: string; sortOrder: number }> {
    const current = new Map(tasks.map(t => [t.id, t.sortOrder]));
    const out: Array<{ id: string; sortOrder: number }> = [];
    orderedIds.forEach((id, i) => {
        const sortOrder = (i + 1) * SORT_STEP;
        if (current.has(id) && current.get(id) !== sortOrder) out.push({ id, sortOrder });
    });
    return out;
}

// ======================================================================================== dependencies
export type DependencyError = 'self' | 'unknown' | 'other_job' | 'cycle' | 'too_many';

export type DependencyCheck =
    | { ok: true; dependsOn: string[] }
    | { ok: false; error: DependencyError; message: string; cycle?: string[] };

const depsOf = (t: TaskLike | undefined): string[] => (t && Array.isArray(t.dependsOn) ? t.dependsOn : []);

/**
 * Would `taskId` waiting on `dependsOn` close a loop? Returns the loop (taskId first, then the chain back to it)
 * or null. `taskId` may be a new id that is not in `tasks` yet.
 */
export function wouldCreateCycle(tasks: readonly TaskLike[], taskId: string, dependsOn: readonly string[]): string[] | null {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const seen = new Set<string>();
    const walk = (id: string, path: string[]): string[] | null => {
        if (id === taskId) return path;
        if (seen.has(id)) return null;
        seen.add(id);
        for (const d of depsOf(byId.get(id))) {
            const hit = walk(d, [...path, d]);
            if (hit) return hit;
        }
        return null;
    };
    for (const d of dependsOn) {
        const hit = walk(d, [taskId, d]);
        if (hit) return hit;
    }
    return null;
}

/** Checks a task's new dependency list (same rules as the database guard). Returns the cleaned list. */
export function validateDependencies(tasks: readonly TaskLike[], taskId: string, dependsOn: readonly string[], jobId?: string): DependencyCheck {
    const list = [...new Set(dependsOn.filter(id => typeof id === 'string' && id))];
    if (list.includes(taskId)) return { ok: false, error: 'self', message: 'A task cannot wait for itself.' };
    if (list.length > TASK_LIMITS.dependsOn) return { ok: false, error: 'too_many', message: `A task can wait for up to ${TASK_LIMITS.dependsOn} other tasks.` };
    const byId = new Map(tasks.map(t => [t.id, t]));
    for (const id of list) {
        const t = byId.get(id);
        if (!t) return { ok: false, error: 'unknown', message: 'One of the tasks it waits for no longer exists.' };
        if (jobId && t.jobId && t.jobId !== jobId) return { ok: false, error: 'other_job', message: 'A task can only wait for tasks of the same job.' };
    }
    const cycle = wouldCreateCycle(tasks, taskId, list);
    if (cycle) return { ok: false, error: 'cycle', message: 'That would make a loop: these tasks would wait for each other forever.', cycle };
    return { ok: true, dependsOn: list };
}

/** A loop anywhere in the list (ids), or null. */
export function findCycle(tasks: readonly TaskLike[]): string[] | null {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const state = new Map<string, 1 | 2>(); // 1 = on the stack, 2 = finished
    const stack: string[] = [];
    const visit = (id: string): string[] | null => {
        const s = state.get(id);
        if (s === 2) return null;
        if (s === 1) return stack.slice(stack.indexOf(id)).concat(id);
        if (!byId.has(id)) return null;
        state.set(id, 1);
        stack.push(id);
        for (const d of depsOf(byId.get(id))) {
            const hit = visit(d);
            if (hit) return hit;
        }
        stack.pop();
        state.set(id, 2);
        return null;
    };
    for (const t of sortTasks(tasks)) {
        const hit = visit(t.id);
        if (hit) return hit;
    }
    return null;
}

/** Ids with every task after the tasks it waits for (ties keep the list order). Tasks inside a loop come last. */
export function topologicalOrder(tasks: readonly TaskLike[]): string[] {
    const sorted = sortTasks(tasks);
    const ids = new Set(sorted.map(t => t.id));
    const indegree = new Map<string, number>();
    const after = new Map<string, string[]>();
    for (const t of sorted) {
        const deps = [...new Set(depsOf(t))].filter(d => ids.has(d) && d !== t.id);
        indegree.set(t.id, deps.length);
        for (const d of deps) after.set(d, [...(after.get(d) || []), t.id]);
    }
    const position = new Map(sorted.map((t, i) => [t.id, i]));
    const ready = sorted.filter(t => indegree.get(t.id) === 0).map(t => t.id);
    const out: string[] = [];
    while (ready.length) {
        ready.sort((a, b) => position.get(a)! - position.get(b)!);
        const id = ready.shift()!;
        out.push(id);
        for (const n of after.get(id) || []) {
            indegree.set(n, indegree.get(n)! - 1);
            if (indegree.get(n) === 0) ready.push(n);
        }
    }
    const placed = new Set(out);
    for (const t of sorted) if (!placed.has(t.id)) out.push(t.id);
    return out;
}

/** The tasks this one waits for that are not done. */
export function unfinishedDependencies<T extends TaskLike>(task: TaskLike, tasks: readonly T[] | ReadonlyMap<string, T>): T[] {
    const byId = tasks instanceof Map ? tasks as ReadonlyMap<string, T> : new Map((tasks as readonly T[]).map(t => [t.id, t]));
    return depsOf(task).map(id => byId.get(id)).filter((t): t is T => !!t && t.status !== 'done');
}

export const isWaitingOnOthers = (task: TaskLike, tasks: readonly TaskLike[] | ReadonlyMap<string, TaskLike>): boolean =>
    task.status !== 'done' && unfinishedDependencies(task, tasks).length > 0;

/** The status to show: 'blocked' also when it waits for an unfinished task. */
export const displayStatus = (task: TaskLike, tasks: readonly TaskLike[] | ReadonlyMap<string, TaskLike>): TaskStatus =>
    task.status === 'done' ? 'done' : isWaitingOnOthers(task, tasks) ? 'blocked' : task.status;

/** Tasks that wait directly for `id`. */
export const directDependents = <T extends TaskLike>(tasks: readonly T[], id: string): T[] => tasks.filter(t => depsOf(t).includes(id));

/** Every task that waits for `id`, directly or through others (each once, in dependency order). */
export function allDependents<T extends TaskLike>(tasks: readonly T[], id: string): T[] {
    const found = new Set<string>();
    const queue = [id];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const t of directDependents(tasks, cur)) {
            if (t.id !== id && !found.has(t.id)) { found.add(t.id); queue.push(t.id); }
        }
    }
    const order = topologicalOrder(tasks);
    const byId = new Map(tasks.map(t => [t.id, t]));
    return order.filter(x => found.has(x)).map(x => byId.get(x)!);
}

// ========================================================================================== dates move
export interface DatePatch { id: string; startDate: string | null; dueDate: string | null }

const shiftYmd = (d: string | null, delta: number): string | null => (isYmd(d) ? addDays(d, delta) : d);

/**
 * "Move the tasks after it too": every unfinished task that waits for `movedId` (directly or not) moves by the same
 * number of days. Returns only the tasks that change.
 */
export function shiftDependents(tasks: readonly TaskLike[], movedId: string, deltaDays: number): DatePatch[] {
    if (!deltaDays) return [];
    return allDependents(tasks, movedId)
        .filter(t => t.status !== 'done' && (isYmd(t.startDate) || isYmd(t.dueDate)))
        .map(t => ({ id: t.id, startDate: shiftYmd(t.startDate, deltaDays), dueDate: shiftYmd(t.dueDate, deltaDays) }));
}

/**
 * "Only as far as needed": with the tasks' current dates (apply the moved task's change first), every unfinished
 * task that starts before the tasks it waits for end is pushed later (start and due by the same days) so it starts
 * the day after (a milestone: the same day). Never pulls a task earlier. Returns only the tasks that change.
 */
export function pushDependents(tasks: readonly TaskLike[]): DatePatch[] {
    const byId = new Map(tasks.map(t => [t.id, { ...t }]));
    const changed = new Set<string>();
    for (const id of topologicalOrder(tasks)) {
        const t = byId.get(id)!;
        if (t.status === 'done') continue;
        const span = taskSpan(t);
        if (!span) continue;
        let earliest: number | null = null;
        for (const d of depsOf(t)) {
            const dep = byId.get(d);
            const ds = dep ? taskSpan(dep) : null;
            if (!dep || !ds) continue;
            const ready = dayNum(ds.end)! + (dep.isMilestone ? 0 : 1);
            earliest = earliest === null ? ready : Math.max(earliest, ready);
        }
        if (earliest === null) continue;
        const delta = earliest - dayNum(span.start)!;
        if (delta <= 0) continue;
        t.startDate = shiftYmd(t.startDate, delta);
        t.dueDate = shiftYmd(t.dueDate, delta);
        changed.add(id);
    }
    return [...changed].map(id => { const t = byId.get(id)!; return { id, startDate: t.startDate, dueDate: t.dueDate }; });
}

// ============================================================================================ timeline
export interface TimelineWindow { start: string; end: string; days: number }

/**
 * The days a timeline shows: from the earliest to the latest task day (and today), with `padDays` on each side,
 * at least `minDays` and at most `maxDays` long (a longer schedule is cut at the end).
 */
export function timelineWindow(tasks: readonly TaskLike[], today: string, opts: { padDays?: number; minDays?: number; maxDays?: number } = {}): TimelineWindow {
    const pad = Math.max(0, opts.padDays ?? 2);
    const minDays = Math.max(1, opts.minDays ?? 14);
    const maxDays = Math.max(minDays, opts.maxDays ?? 366);
    let lo = dayNum(today)!;
    let hi = lo;
    for (const t of tasks) {
        const s = taskSpan(t);
        if (!s) continue;
        lo = Math.min(lo, dayNum(s.start)!);
        hi = Math.max(hi, dayNum(s.end)!);
    }
    lo -= pad;
    hi += pad;
    if (hi - lo + 1 < minDays) hi = lo + minDays - 1;
    if (hi - lo + 1 > maxDays) hi = lo + maxDays - 1;
    return { start: fromDayNum(lo), end: fromDayNum(hi), days: hi - lo + 1 };
}

export interface TimelineBar {
    id: string;
    /** row index (0 = top), one task per row, in the list order */
    row: number;
    /** days from the window's first day to the bar's first visible day */
    offset: number;
    /** visible days (a milestone: 0, drawn as a marker at `offset`) */
    length: number;
    isMilestone: boolean;
    /** the task starts before / ends after the window */
    clippedStart: boolean;
    clippedEnd: boolean;
    overdue: boolean;
    done: boolean;
    /** on the longest chain of waiting tasks */
    critical: boolean;
    /** waits for an unfinished task */
    waiting: boolean;
}

export interface TimelineLayout {
    window: TimelineWindow;
    bars: TimelineBar[];
    /** tasks without any date (list them under the chart) */
    unscheduled: string[];
    /** dated tasks entirely outside the window */
    outside: string[];
    /** arrows from the task waited for to the task waiting (both on the chart) */
    links: Array<{ from: string; to: string }>;
    /** the today line, or null when today is outside the window */
    todayOffset: number | null;
    criticalPath: string[];
}

/** Rows and bars of a Gantt-style timeline over `window`. */
export function layoutTimeline(tasks: readonly TaskLike[], window: TimelineWindow, today: string): TimelineLayout {
    const w0 = dayNum(window.start)!;
    const w1 = dayNum(window.end)!;
    const byId = new Map(tasks.map(t => [t.id, t]));
    const critical = criticalPath(tasks);
    const criticalSet = new Set(critical);
    const bars: TimelineBar[] = [];
    const unscheduled: string[] = [];
    const outside: string[] = [];
    for (const t of sortTasks(tasks)) {
        const span = taskSpan(t);
        if (!span) { unscheduled.push(t.id); continue; }
        const s = dayNum(span.start)!;
        const e = dayNum(span.end)!;
        if (e < w0 || s > w1) { outside.push(t.id); continue; }
        const vs = Math.max(s, w0);
        const ve = Math.min(e, w1);
        bars.push({
            id: t.id,
            row: bars.length,
            offset: vs - w0,
            length: t.isMilestone ? 0 : ve - vs + 1,
            isMilestone: !!t.isMilestone,
            clippedStart: s < w0,
            clippedEnd: e > w1,
            overdue: isOverdue(t, today),
            done: t.status === 'done',
            critical: criticalSet.has(t.id),
            waiting: isWaitingOnOthers(t, byId),
        });
    }
    const onChart = new Set(bars.map(b => b.id));
    const links: Array<{ from: string; to: string }> = [];
    for (const b of bars) for (const d of depsOf(byId.get(b.id))) if (onChart.has(d)) links.push({ from: d, to: b.id });
    const td = dayNum(today);
    return {
        window,
        bars,
        unscheduled,
        outside,
        links,
        todayOffset: td !== null && td >= w0 && td <= w1 ? td - w0 : null,
        criticalPath: critical,
    };
}

/**
 * Critical path (lite): the chain of waiting tasks with the most days in total (a task's days = its span, 1 when it
 * has no date, 0 for a milestone). Returns the ids from the first task to the last; [] when the longest chain is a
 * single task (nothing waits for anything). Loops are ignored (the database refuses them).
 */
export function criticalPath(tasks: readonly TaskLike[]): string[] {
    if (!tasks.length) return [];
    const byId = new Map(tasks.map(t => [t.id, t]));
    const days = (t: TaskLike) => {
        if (t.isMilestone) return 0;
        const s = taskSpan(t);
        return s ? daysBetween(s.start, s.end) + 1 : 1;
    };
    const best = new Map<string, number>();
    const prev = new Map<string, string | null>();
    const order = topologicalOrder(tasks);
    const placed = new Set<string>();
    for (const id of order) {
        const t = byId.get(id)!;
        let base = 0;
        let from: string | null = null;
        for (const d of depsOf(t)) {
            if (!placed.has(d)) continue; // unknown, or part of a loop
            const v = best.get(d)!;
            if (v > base || (v === base && from === null)) { base = v; from = d; }
        }
        best.set(id, base + days(t));
        prev.set(id, from);
        placed.add(id);
    }
    // the end of the heaviest chain of at least two tasks (one task alone is not a chain)
    let end: string | null = null;
    let top = -1;
    for (const id of order) {
        const v = best.get(id)!;
        // ties go to the later task, so a closing milestone (0 days) stays on the chain
        if (prev.get(id) && (v > top || (v === top && end !== null && prev.get(id) === end))) { top = v; end = id; }
    }
    const chain: string[] = [];
    for (let cur = end; cur; cur = prev.get(cur) ?? null) chain.unshift(cur);
    return chain;
}

// =========================================================================================== proposals
/** Suggested tasks -> drafts ready to save (dependency positions become the new ids; only earlier positions). */
export function proposalsToDrafts(proposals: readonly ProposedTask[], newId: () => string, opts: { sortStart?: number } = {}): TaskDraft[] {
    const ids = proposals.map(() => newId());
    const sortStart = opts.sortStart ?? SORT_STEP;
    return proposals.map((p, i) => ({
        id: ids[i],
        title: p.title,
        notes: p.notes,
        status: 'todo' as const,
        crewMemberId: p.crewMemberId,
        startDate: p.startDate,
        dueDate: p.dueDate,
        isMilestone: p.isMilestone,
        dependsOn: [...new Set(p.dependsOnIndex.filter(n => Number.isInteger(n) && n >= 0 && n < i))].map(n => ids[n]),
        sortOrder: Math.min(TASK_LIMITS.sortOrder, sortStart + i * SORT_STEP),
        source: p.source,
        workOrderDocId: p.workOrderDocId,
    }));
}

// =========================================================================================== templates
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};
const cleanText = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');

const parseTemplateItem = (raw: unknown, index: number): TaskTemplateItem | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const title = cleanText(r.title, TEMPLATE_LIMITS.itemTitle).replace(/\s+/g, ' ');
    if (!title) return null;
    const isMilestone = r.isMilestone === true;
    const item: TaskTemplateItem = {
        title,
        offsetDays: clampInt(r.offsetDays, 0, TEMPLATE_LIMITS.maxDays, 0),
        durationDays: isMilestone ? 0 : clampInt(r.durationDays, 1, TEMPLATE_LIMITS.maxDays, 1),
    };
    const notes = cleanText(r.notes, TEMPLATE_LIMITS.itemNotes);
    if (notes) item.notes = notes;
    if (isMilestone) item.isMilestone = true;
    const deps = Array.isArray(r.dependsOn)
        ? [...new Set(r.dependsOn.map(n => clampInt(n, -1, 10_000, -1)).filter(n => n >= 0 && n < index))].sort((a, b) => a - b)
        : [];
    if (deps.length) item.dependsOn = deps.slice(0, TASK_LIMITS.dependsOn);
    return item;
};

/** The saved templates from the stored value (anything unusable is dropped; never throws). */
export function parseTaskTemplates(raw: unknown): TaskTemplate[] {
    const list = raw && typeof raw === 'object' && Array.isArray((raw as { templates?: unknown }).templates)
        ? (raw as { templates: unknown[] }).templates
        : Array.isArray(raw) ? raw : [];
    const out: TaskTemplate[] = [];
    const seen = new Set<string>();
    for (const t of list.slice(0, TEMPLATE_LIMITS.templates)) {
        if (!t || typeof t !== 'object') continue;
        const r = t as Record<string, unknown>;
        const id = cleanText(r.id, 64);
        const name = cleanText(r.name, TEMPLATE_LIMITS.name).replace(/\s+/g, ' ');
        if (!id || !name || seen.has(id)) continue;
        // items keep their positions for the dependency indexes: a dropped item shifts the later ones, so the
        // indexes are remapped to the kept items
        const rawItems = Array.isArray(r.items) ? r.items.slice(0, TEMPLATE_LIMITS.itemsPerTemplate) : [];
        const keptAt = new Map<number, number>();
        const items: TaskTemplateItem[] = [];
        rawItems.forEach((ri, i) => {
            const item = parseTemplateItem(ri, i);
            if (!item) return;
            if (item.dependsOn) {
                const mapped = item.dependsOn.map(n => keptAt.get(n)).filter((n): n is number => n !== undefined);
                if (mapped.length) item.dependsOn = mapped; else delete item.dependsOn;
            }
            keptAt.set(i, items.length);
            items.push(item);
        });
        if (!items.length) continue;
        seen.add(id);
        out.push({ id, name, items, updatedAt: cleanText(r.updatedAt, 40) || new Date(0).toISOString() });
    }
    return out;
}

/** The value to store, or a readable error (too many / too big). */
export function serializeTaskTemplates(templates: readonly TaskTemplate[]): { value: TaskTemplatesSetting; error: string | null } {
    const clean = parseTaskTemplates({ templates });
    const value: TaskTemplatesSetting = { version: 1, templates: clean };
    if (templates.length > TEMPLATE_LIMITS.templates) {
        return { value, error: `You can keep up to ${TEMPLATE_LIMITS.templates} task templates. Remove one first.` };
    }
    if (JSON.stringify(value).length > TEMPLATE_LIMITS.jsonChars) {
        return { value, error: 'Your task templates are too long to save. Shorten some notes or remove a template.' };
    }
    return { value, error: null };
}

/**
 * A template as tasks starting on `startDate`: each item starts `offsetDays` later and lasts `durationDays`
 * (a milestone is one day: start = due). Dependency positions become the new ids. source = 'template'.
 */
export function instantiateTemplate(template: Pick<TaskTemplate, 'items'>, startDate: string, newId: () => string, opts: { sortStart?: number } = {}): TaskDraft[] {
    if (!isYmd(startDate)) throw new Error('Pick a start date.');
    const ids = template.items.map(() => newId());
    const sortStart = opts.sortStart ?? SORT_STEP;
    return template.items.map((it, i) => {
        const start = addDays(startDate, Math.max(0, it.offsetDays));
        const due = it.isMilestone ? start : addDays(start, Math.max(1, it.durationDays) - 1);
        return {
            id: ids[i],
            title: it.title,
            notes: it.notes || null,
            status: 'todo' as const,
            startDate: start,
            dueDate: due,
            isMilestone: !!it.isMilestone,
            dependsOn: (it.dependsOn || []).filter(n => n >= 0 && n < i).map(n => ids[n]),
            sortOrder: Math.min(TASK_LIMITS.sortOrder, sortStart + i * SORT_STEP),
            source: 'template' as const,
        };
    });
}

/** "Save these tasks as a template": offsets from the earliest day; undated tasks start on day 0 and last 1 day. */
export function templateFromTasks(name: string, tasks: readonly (TaskLike & { title: string; notes?: string | null })[], newId: () => string, now = new Date()): TaskTemplate {
    const sorted = topologicalOrder(tasks).map(id => tasks.find(t => t.id === id)!).slice(0, TEMPLATE_LIMITS.itemsPerTemplate);
    const spans = sorted.map(t => taskSpan(t));
    const firstDay = spans.reduce<string | null>((m, s) => (s && (!m || s.start < m) ? s.start : m), null);
    const pos = new Map(sorted.map((t, i) => [t.id, i]));
    const items: TaskTemplateItem[] = sorted.map((t, i) => {
        const s = spans[i];
        const item: TaskTemplateItem = {
            title: cleanText(t.title, TEMPLATE_LIMITS.itemTitle) || 'Task',
            offsetDays: s && firstDay ? Math.min(TEMPLATE_LIMITS.maxDays, daysBetween(firstDay, s.start)) : 0,
            durationDays: t.isMilestone ? 0 : s ? Math.min(TEMPLATE_LIMITS.maxDays, daysBetween(s.start, s.end) + 1) : 1,
        };
        const notes = cleanText(t.notes, TEMPLATE_LIMITS.itemNotes);
        if (notes) item.notes = notes;
        if (t.isMilestone) item.isMilestone = true;
        const deps = depsOf(t).map(d => pos.get(d)).filter((n): n is number => n !== undefined && n < i).sort((a, b) => a - b);
        if (deps.length) item.dependsOn = deps;
        return item;
    });
    return { id: newId(), name: cleanText(name, TEMPLATE_LIMITS.name) || 'My tasks', items, updatedAt: now.toISOString() };
}

/** Ready-made templates shown before the contractor saves their own (not stored until edited). */
export const STARTER_TASK_TEMPLATES: readonly TaskTemplate[] = [
    {
        id: 'starter-bathroom',
        name: 'Bathroom remodel',
        updatedAt: '2026-11-16T00:00:00.000Z',
        items: [
            { title: 'Demo and haul away', offsetDays: 0, durationDays: 2 },
            { title: 'Rough plumbing', offsetDays: 2, durationDays: 2, dependsOn: [0] },
            { title: 'Rough electrical', offsetDays: 2, durationDays: 1, dependsOn: [0] },
            { title: 'Rough-in inspection', offsetDays: 4, durationDays: 0, isMilestone: true, dependsOn: [1, 2] },
            { title: 'Cement board and waterproofing', offsetDays: 5, durationDays: 2, dependsOn: [3] },
            { title: 'Tile floor and shower', offsetDays: 7, durationDays: 3, dependsOn: [4] },
            { title: 'Vanity, toilet and fixtures', offsetDays: 10, durationDays: 2, dependsOn: [5] },
            { title: 'Paint and trim', offsetDays: 12, durationDays: 1, dependsOn: [6] },
            { title: 'Final walkthrough with client', offsetDays: 13, durationDays: 0, isMilestone: true, dependsOn: [7] },
        ],
    },
    {
        id: 'starter-deck',
        name: 'Deck build',
        updatedAt: '2026-11-16T00:00:00.000Z',
        items: [
            { title: 'Permit approved', offsetDays: 0, durationDays: 0, isMilestone: true },
            { title: 'Layout and footings', offsetDays: 0, durationDays: 2, dependsOn: [0] },
            { title: 'Footing inspection', offsetDays: 2, durationDays: 0, isMilestone: true, dependsOn: [1] },
            { title: 'Framing (posts, beams, joists)', offsetDays: 3, durationDays: 3, dependsOn: [2] },
            { title: 'Decking boards', offsetDays: 6, durationDays: 2, dependsOn: [3] },
            { title: 'Stairs and railings', offsetDays: 8, durationDays: 2, dependsOn: [4] },
            { title: 'Final inspection', offsetDays: 10, durationDays: 0, isMilestone: true, dependsOn: [5] },
        ],
    },
];

/** True for a status string the table accepts. */
export const isTaskStatus = (v: unknown): v is TaskStatus => typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v);
