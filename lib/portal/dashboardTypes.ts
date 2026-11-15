/**
 * Client portal project dashboard (roadmap D9): the shapes.
 *
 *   Raw*            what public.get_portal_project_dashboard(p_key, p_job_id) returns (snake_case JSON, version 1;
 *                   supabase/migrations/20261116000300_portal_project_dashboard.sql)
 *   PortalDashboard the parsed payload (camelCase, bad rows dropped): lib/portal/dashboardLogic.ts parseDashboard()
 *   DashboardView   the view model the portal UI renders: dashboardLogic.ts buildDashboardView()
 *
 * Everything here is client-safe by construction: the database only returns milestones (never other task fields),
 * counts for tasks / punch items, shared photos and the same document JSON the portal list already shows.
 */
import type { DocState } from '../../utils/clientPortalRules.ts';
import type { TaskStatus } from '../tasks/taskTypes.ts';

/** Array caps the database applies (the parser applies them too, so a bigger payload can't blow up the page). */
export const DASHBOARD_LIMITS = {
    jobs: 50,
    milestones: 100,
    documents: 200,
    photos: 12,
} as const;

// ------------------------------------------------------------------------------------------------ raw payload
export interface RawDashboardJobSummary { id: string; name: string; status: string; start_date: string | null; end_date: string | null }
export interface RawDashboardJob extends RawDashboardJobSummary { address: string | null }
export interface RawDashboardMilestone { id: string; title: string; due_date: string | null; status: string; completed_at: string | null }
export interface RawDashboardDocument { id: string; type: string; created_at: string; state: string | null; data: Record<string, unknown> }
export interface RawDashboardPhoto { id: string; tag: string | null; caption: string | null; taken_at: string | null; path: string }

/** Exact JSON of get_portal_project_dashboard (version 1). */
export interface RawPortalDashboard {
    version: 1;
    jobs: RawDashboardJobSummary[];
    job: RawDashboardJob | null;
    contractor: Record<string, string | null> | null;
    progress: { done: number; total: number; percent: number } | null;
    milestones: RawDashboardMilestone[];
    next_milestone: RawDashboardMilestone | null;
    documents: RawDashboardDocument[];
    photos: RawDashboardPhoto[];
    punch: { total: number; open: number; done: number; verified: number } | null;
    /** placeholder: roadmap D5 (selections) fills it */
    selections: unknown[];
}

/** Top-level keys of the payload (scripts/portal-dashboard-check.ts compares them with the migration). */
export const DASHBOARD_KEYS = [
    'version', 'jobs', 'job', 'contractor', 'progress', 'milestones', 'next_milestone', 'documents', 'photos', 'punch', 'selections',
] as const;
/** The only job_tasks columns the payload may carry. */
export const MILESTONE_KEYS = ['id', 'title', 'due_date', 'status', 'completed_at'] as const;

// ------------------------------------------------------------------------------------------------ parsed
export interface DashboardJobSummary { id: string; name: string; status: string; startDate: string | null; endDate: string | null }
export interface DashboardJob extends DashboardJobSummary { address: string }

export interface DashboardContractor {
    name: string;
    companyName: string;
    logoUrl: string;
    phone: string;
    email: string;
    website: string;
    address: string;
}

export interface DashboardMilestone {
    id: string;
    title: string;
    /** 'YYYY-MM-DD' or null */
    dueDate: string | null;
    status: TaskStatus;
    completedAt: string | null;
}

export interface DashboardDocument {
    id: string;
    type: string;
    createdAt: string;
    /** the database's signing verdict (same as get_portal_data) */
    state: DocState | null;
    /** client-safe document JSON (same as the portal list) */
    data: Record<string, any>;
}

export interface DashboardPhoto {
    id: string;
    tag: string;
    caption: string;
    takenAt: string;
    /** path in the public portal-photos bucket: components/photos/photosApi.ts portalPhotoUrl(path) */
    path: string;
}

export interface DashboardProgress { done: number; total: number; percent: number }
export interface DashboardPunch { total: number; open: number; done: number; verified: number }

export interface PortalDashboard {
    jobs: DashboardJobSummary[];
    job: DashboardJob | null;
    contractor: DashboardContractor;
    /** null = the job has no tasks */
    progress: DashboardProgress | null;
    milestones: DashboardMilestone[];
    nextMilestone: DashboardMilestone | null;
    documents: DashboardDocument[];
    photos: DashboardPhoto[];
    /** null = no punch list shared in the portal for this job */
    punch: DashboardPunch | null;
    selections: unknown[];
}

// ------------------------------------------------------------------------------------------------ view model
export type MilestoneState = 'done' | 'overdue' | 'due_soon' | 'upcoming' | 'no_date';

export interface MilestoneView extends DashboardMilestone {
    state: MilestoneState;
    /** "Done Nov 12", "3 days late", "Due today", "Due in 4 days", "Due Dec 3", "No date yet" */
    whenText: string;
}

export interface BalanceSummary {
    currency: string;
    /** sum of the job's invoice totals (Cancelled / Void left out) */
    total: number;
    /** paid on those invoices */
    paid: number;
    /** what the client still owes (same figure as the portal's "Outstanding" for this job's invoices) */
    outstanding: number;
    invoiceCount: number;
    unpaidCount: number;
    /** unpaid invoices whose due date has passed */
    overdueCount: number;
    /** formatted: "$1,250.00" */
    totalText: string;
    paidText: string;
    outstandingText: string;
}

export interface DashboardDocumentRow {
    id: string;
    type: string;
    /** "Invoice #1024" or the title or the type */
    label: string;
    number: string;
    status: string;
    state: DocState;
    /** 'YYYY-MM-DD' (issue date, else created) */
    date: string;
    total: number;
    totalText: string;
    /** only for invoices */
    balanceDue: number;
    overdue: boolean;
    /** the client can sign / approve it now */
    awaitingSignature: boolean;
}

export type NextStepKind = 'sign' | 'pay_overdue' | 'pay' | 'milestone_overdue' | 'milestone' | 'punch_check' | 'job_start';

export interface NextStep {
    kind: NextStepKind;
    /** plain sentence for the client, e.g. "Approve Estimate #12" */
    text: string;
    /** document or milestone id when there is one */
    refId: string | null;
}

export interface DashboardView {
    job: DashboardJob | null;
    jobs: DashboardJobSummary[];
    contractor: DashboardContractor;
    /** "Active", "Completed", ... */
    statusLabel: string;
    /** "Nov 3 - Dec 20, 2026", "Starts Nov 3, 2026", "" */
    datesText: string;
    progress: DashboardProgress | null;
    /** "7 of 12 tasks done (58%)" or "" when the job has no tasks */
    progressLabel: string;
    milestones: MilestoneView[];
    nextMilestone: MilestoneView | null;
    /** "Next: Drywall done, due in 4 days" or "" */
    nextMilestoneText: string;
    /** ordered, most urgent first, at most 5 */
    nextSteps: NextStep[];
    balance: BalanceSummary | null;
    documents: DashboardDocumentRow[];
    photos: DashboardPhoto[];
    punch: DashboardPunch | null;
    /** "2 open, 1 to check, 5 verified" or "" */
    punchLabel: string;
    selections: unknown[];
}
