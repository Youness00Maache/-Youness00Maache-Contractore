/**
 * Business overview (N3): the active jobs at a glance. Budget used comes from the job costing panel's own math
 * (lib/costing.ts summarizeJobCosting: spent + ordered of the budget = the accepted estimates and approved change
 * orders), task progress from lib/tasks/taskLogic.ts (only when the Tasks tool is ready), and the next date from the
 * job's open tasks (else the job's end date).
 *
 * A "right now" list: it does not depend on the period chosen on the screen; the customer / project filters apply.
 * Warnings: "Over budget" (spent + ordered above the budget), "Costs ahead of the work" (the costing panel's
 * "ahead" status; the % complete comes from progress invoices here) and "Task overdue" (the next open task is late).
 */
import { summarizeJobCosting, type CostingDoc, type PriceBookLite } from '../costing.ts';
import { daysBetween as ymdDaysBetween, isOverdue, taskProgress, taskSpan } from '../tasks/taskLogic.ts';
import { normalizeYMD } from '../../utils/localDates.ts';
import { jobMatchesFilters } from './overview.ts';
import { NO_FILTERS, type OverviewFilters, type OverviewJob, type OverviewTask } from './types.ts';

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

export type JobWarning = 'over_budget' | 'costs_ahead' | 'task_overdue';

export const JOB_WARNING_LABELS: Record<JobWarning, string> = {
    over_budget: 'Over budget',
    costs_ahead: 'Costs ahead of the work',
    task_overdue: 'Task overdue',
};

export interface NextDue {
    /** YYYY-MM-DD */
    ymd: string;
    /** the task's title, or "Job end date" */
    label: string;
    kind: 'milestone' | 'task' | 'job_end';
    /** the day is before today */
    overdue: boolean;
    /** days from today (negative = days late) */
    days: number;
}

export interface ActiveJobRow {
    jobId: string;
    name: string;
    customer: string;
    /** 'active' | 'paused' */
    status: string;
    /** the budget (accepted estimates + approved change orders); 0 = none yet */
    budget: number;
    /** spent + ordered (lib/costing.ts: actual + committed) */
    spent: number;
    /** spent + ordered as a % of the budget; null without a budget */
    usedPct: number | null;
    /** tasks done / total, null when the Tasks tool is not ready or the job has no tasks */
    tasks: { done: number; total: number; percent: number; overdue: number } | null;
    next: NextDue | null;
    warnings: JobWarning[];
}

const nextDueOf = (job: OverviewJob, jobTasks: readonly OverviewTask[], today: string): NextDue | null => {
    let best: { t: OverviewTask; end: string } | null = null;
    for (const t of jobTasks) {
        if (t.status === 'done') continue;
        const span = taskSpan(t);
        if (!span) continue;
        if (!best || span.end < best.end || (span.end === best.end && t.isMilestone && !best.t.isMilestone)) best = { t, end: span.end };
    }
    if (best) {
        return {
            ymd: best.end,
            label: best.t.title || 'Task',
            kind: best.t.isMilestone ? 'milestone' : 'task',
            overdue: best.end < today,
            days: ymdDaysBetween(today, best.end),
        };
    }
    const end = normalizeYMD(job.endDate);
    return end ? { ymd: end, label: 'Job end date', kind: 'job_end', overdue: end < today, days: ymdDaysBetween(today, end) } : null;
};

export const activeJobRows = (
    jobs: readonly OverviewJob[],
    docs: readonly CostingDoc[],
    tasks: readonly OverviewTask[] | null,
    jobCustomers: ReadonlyMap<string, string>,
    options: { todayYMD: string; laborRate: number; filters?: OverviewFilters; priceBook?: readonly PriceBookLite[] | null },
): ActiveJobRow[] => {
    const filters = options.filters ?? NO_FILTERS;
    const docsByJob = new Map<string, CostingDoc[]>();
    for (const d of docs) {
        if (!d.jobId) continue;
        const list = docsByJob.get(d.jobId);
        if (list) list.push(d); else docsByJob.set(d.jobId, [d]);
    }
    const tasksByJob = new Map<string, OverviewTask[]>();
    for (const t of tasks || []) {
        const list = tasksByJob.get(t.jobId);
        if (list) list.push(t); else tasksByJob.set(t.jobId, [t]);
    }

    const rows: ActiveJobRow[] = [];
    for (const job of jobs) {
        const status = norm(job.status);
        if ((status !== 'active' && status !== 'paused') || !jobMatchesFilters(job, jobCustomers, filters)) continue;
        const costing = summarizeJobCosting(docsByJob.get(job.id) || [], { laborRate: options.laborRate, priceBook: options.priceBook });
        const jobTasks = tasks ? tasksByJob.get(job.id) || [] : [];
        const p = tasks && jobTasks.length ? taskProgress(jobTasks, options.todayYMD) : null;
        const next = nextDueOf(job, jobTasks, options.todayYMD);
        const warnings: JobWarning[] = [];
        if (costing.status.kind === 'over') warnings.push('over_budget');
        else if (costing.status.kind === 'ahead') warnings.push('costs_ahead');
        if (jobTasks.some(t => isOverdue(t, options.todayYMD))) warnings.push('task_overdue');
        rows.push({
            jobId: job.id,
            name: String(job.name ?? '').trim() || 'Untitled job',
            customer: jobCustomers.get(job.id) || '',
            status,
            budget: costing.budget,
            spent: Math.round((costing.actual + costing.committed) * 100) / 100,
            usedPct: costing.usedPct,
            tasks: p ? { done: p.done, total: p.total, percent: p.percent, overdue: p.overdue } : null,
            next,
            warnings,
        });
    }
    // jobs that need a look first (over budget before the rest), then the soonest date, then A to Z
    const weight = (r: ActiveJobRow) => (r.warnings.includes('over_budget') ? 0 : r.warnings.length ? 1 : 2);
    rows.sort((a, b) => weight(a) - weight(b)
        || (a.next?.ymd ?? '9999-99-99').localeCompare(b.next?.ymd ?? '9999-99-99')
        || a.name.localeCompare(b.name) || a.jobId.localeCompare(b.jobId));
    return rows;
};
