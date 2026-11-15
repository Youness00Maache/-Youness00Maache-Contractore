/**
 * Business overview (roadmap N3, competitor gap #35): shapes shared by the pure logic in lib/overview/*.
 * No React, no Supabase here, so scripts/overview-check.ts tests everything under Node.
 *
 * The overview adds NO new numbers of its own: money comes from lib/finance.ts (income, collected, outstanding, costs,
 * profit: the one definition Job financials and Insights use), budgets from lib/costing.ts, estimate states from
 * lib/pipeline.ts, task progress from lib/tasks/taskLogic.ts and lead numbers from lib/leads/leadLogic.ts.
 */
import type { CostingDoc } from '../costing.ts';
import type { JobTask } from '../tasks/taskTypes.ts';

/** A document row as lib/overview loads it: the job costing columns + what the pipeline and the paid dates need. */
export interface OverviewDoc extends CostingDoc {
    clientName?: string | null;
    dueDate?: string | null;
    expiryDate?: string | null;
    /** invoice paid in full: the day (YYYY-MM-DD) */
    paidAt?: string | null;
    /** invoice payments: [{ amount, date }] */
    payments?: unknown;
    clientSignatureUrl?: string | null;
    clientDeclinedAt?: string | null;
    paymentReportedAt?: string | null;
    /** a revision of a signed / sent estimate */
    revisionOf?: string | null;
}

/** The fields of a job the overview reads (the app's Job fits). */
export interface OverviewJob {
    id: string;
    name: string;
    clientName?: string | null;
    clientId?: string | null;
    /** 'active' | 'paused' | 'completed' | 'inactive' */
    status?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    createdAt?: string | null;
}

/** The fields of a task the overview reads (a JobTask fits). */
export type OverviewTask = Pick<JobTask, 'id' | 'jobId' | 'title' | 'status' | 'startDate' | 'dueDate' | 'dependsOn' | 'isMilestone' | 'sortOrder'>;

/** Customer and project filters; null = everything. */
export interface OverviewFilters {
    /** customerKey() of the customer, null = all customers */
    customerKey: string | null;
    /** job id, null = all projects */
    jobId: string | null;
}

export const NO_FILTERS: OverviewFilters = { customerKey: null, jobId: null };

export const isFiltering = (f: OverviewFilters): boolean => f.customerKey !== null || f.jobId !== null;

/** An inclusive local day range. */
export interface DayRange {
    startYMD: string;
    endYMD: string;
}
