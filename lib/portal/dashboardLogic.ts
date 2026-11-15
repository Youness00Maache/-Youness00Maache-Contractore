/**
 * Client portal project dashboard (roadmap D9): pure logic (no React, no Supabase; Node-testable by
 * scripts/portal-dashboard-check.ts). Shapes: lib/portal/dashboardTypes.ts.
 *
 * Exports (what the UI uses):
 *   parseDashboard(raw)                 get_portal_project_dashboard JSON -> PortalDashboard (never throws, drops bad
 *                                       rows, applies DASHBOARD_LIMITS)
 *   buildDashboardView(d, now?)         PortalDashboard -> DashboardView (labels, balance, document rows, next steps)
 *   ownerPreviewDashboard(input)        the contractor's "what my client sees" preview from local data, same filters
 *                                       as the database function (then buildDashboardView on it)
 *   helpers                             progressLabel, milestoneState, milestoneWhenText, nextMilestoneText,
 *                                       balanceSummary, documentRows, nextSteps, punchLabel, jobDatesText,
 *                                       jobStatusLabel, fmtYmd, isInvoiceOverdue, docNumberOf
 *
 * Money is computed with the portal's own rules (utils/clientPortalRules.ts documentTotals / isUnpaidInvoice,
 * estimates with good/better/best options through lib/estimateOptions.ts withEffectiveLines), so the dashboard and
 * the portal document list always show the same figures. Dates are calendar days 'YYYY-MM-DD' (taskLogic).
 */
import {
    documentTotals, isClientFacingType, isSignableType, isUnpaidInvoice, parseDocState, stateOfDoc, ymdOf,
} from '../../utils/clientPortalRules.ts';
import { formatMoney, roundMoney } from '../../utils/money.ts';
import { withEffectiveLines } from '../estimateOptions.ts';
import { daysBetween, todayYmd } from '../tasks/taskLogic.ts';
import { TASK_STATUSES, type TaskStatus } from '../tasks/taskTypes.ts';
import {
    DASHBOARD_LIMITS,
    type BalanceSummary, type DashboardContractor, type DashboardDocument, type DashboardDocumentRow, type DashboardJob,
    type DashboardJobSummary, type DashboardMilestone, type DashboardPhoto, type DashboardProgress, type DashboardPunch,
    type DashboardView, type MilestoneState, type MilestoneView, type NextStep, type PortalDashboard,
} from './dashboardTypes.ts';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const low = (v: unknown): string => str(v).toLowerCase();
const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ymdOrNull = (v: unknown): string | null => ymdOf(v) || null;
const int = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// =============================================================================================== parsing
const parseJobSummary = (v: unknown): DashboardJobSummary | null => {
    const r = rec(v);
    if (!str(r.id)) return null;
    return { id: str(r.id), name: str(r.name) || 'Job', status: low(r.status), startDate: ymdOrNull(r.start_date), endDate: ymdOrNull(r.end_date) };
};

const parseContractor = (v: unknown): DashboardContractor => {
    const r = rec(v);
    return {
        name: str(r.name), companyName: str(r.company_name), logoUrl: str(r.logo_url), phone: str(r.phone),
        email: str(r.email), website: str(r.website), address: str(r.address),
    };
};

const parseMilestone = (v: unknown): DashboardMilestone | null => {
    const r = rec(v);
    if (!str(r.id) || !str(r.title)) return null;
    const status = (TASK_STATUSES as readonly string[]).includes(str(r.status)) ? (str(r.status) as TaskStatus) : 'todo';
    return { id: str(r.id), title: str(r.title), dueDate: ymdOrNull(r.due_date), status, completedAt: str(r.completed_at) || null };
};

const parseDocument = (v: unknown): DashboardDocument | null => {
    const r = rec(v);
    if (!str(r.id) || !isClientFacingType(r.type)) return null;
    const data = rec(r.data);
    if (str(data.status) === 'Draft') return null;
    return { id: str(r.id), type: str(r.type), createdAt: str(r.created_at), state: parseDocState(r.state), data };
};

const parsePhoto = (v: unknown): DashboardPhoto | null => {
    const r = rec(v);
    if (!str(r.id) || !str(r.path)) return null;
    return { id: str(r.id), tag: str(r.tag), caption: str(r.caption), takenAt: str(r.taken_at), path: str(r.path) };
};

const parseProgress = (v: unknown): DashboardProgress | null => {
    const r = rec(v);
    const total = int(r.total);
    if (!total) return null;
    const done = Math.min(int(r.done), total);
    return { done, total, percent: Math.round((done / total) * 100) };
};

const parsePunch = (v: unknown): DashboardPunch | null => {
    if (!v || typeof v !== 'object') return null;
    const r = rec(v);
    return { total: int(r.total), open: int(r.open), done: int(r.done), verified: int(r.verified) };
};

const keep = <T,>(items: unknown, parse: (v: unknown) => T | null, cap: number): T[] => {
    const out: T[] = [];
    for (const v of arr(items)) {
        const p = parse(v);
        if (p) out.push(p);
        if (out.length >= cap) break;
    }
    return out;
};

/** get_portal_project_dashboard() JSON (object or JSON string) -> PortalDashboard. Never throws. */
export function parseDashboard(raw: unknown): PortalDashboard {
    let r: Record<string, any> = {};
    if (typeof raw === 'string') {
        try { r = rec(JSON.parse(raw)); } catch { r = {}; }
    } else r = rec(raw);
    const jobRaw = rec(r.job);
    const jobBase = parseJobSummary(jobRaw);
    return {
        jobs: keep(r.jobs, parseJobSummary, DASHBOARD_LIMITS.jobs),
        job: jobBase ? { ...jobBase, address: str(jobRaw.address) } : null,
        contractor: parseContractor(r.contractor),
        progress: parseProgress(r.progress),
        milestones: keep(r.milestones, parseMilestone, DASHBOARD_LIMITS.milestones),
        nextMilestone: parseMilestone(r.next_milestone),
        documents: keep(r.documents, parseDocument, DASHBOARD_LIMITS.documents),
        photos: keep(r.photos, parsePhoto, DASHBOARD_LIMITS.photos),
        punch: parsePunch(r.punch),
        selections: arr(r.selections),
    };
}

// =============================================================================================== dates
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' -> "Nov 3, 2026" ("Nov 3" when `sameYearAs` is in that year); '' when not a date. */
export const fmtYmd = (value: unknown, sameYearAs?: string): string => {
    const ymd = ymdOf(value);
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-');
    const base = `${MONTHS[Number(m) - 1]} ${Number(d)}`;
    return sameYearAs && sameYearAs.slice(0, 4) === y ? base : `${base}, ${y}`;
};

const JOB_STATUS_LABELS: Record<string, string> = { active: 'In progress', completed: 'Completed', inactive: 'Not started', paused: 'On hold' };

/** jobs.status -> plain words for the client. */
export const jobStatusLabel = (status: unknown): string => {
    const s = low(status);
    return JOB_STATUS_LABELS[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
};

/** "Nov 3 - Dec 20, 2026", "Starts Nov 3, 2026", "Ends Dec 20, 2026" or "". */
export const jobDatesText = (job: Pick<DashboardJobSummary, 'startDate' | 'endDate'> | null, today: string): string => {
    if (!job) return '';
    const s = ymdOf(job.startDate);
    const e = ymdOf(job.endDate);
    if (s && e) return s.slice(0, 4) === e.slice(0, 4) ? `${fmtYmd(s, e)} - ${fmtYmd(e)}` : `${fmtYmd(s)} - ${fmtYmd(e)}`;
    if (s) return `${s > today ? 'Starts' : 'Started'} ${fmtYmd(s)}`;
    if (e) return `${e < today ? 'Ended' : 'Ends'} ${fmtYmd(e)}`;
    return '';
};

// =============================================================================================== progress / milestones
/** "7 of 12 steps done" (the percentage is shown next to the bar); "" when the job has no tasks. */
export const progressLabel = (p: DashboardProgress | null): string =>
    p && p.total > 0 ? `${p.done} of ${plural(p.total, 'step')} done` : '';

/** done / overdue (due day passed) / due_soon (within 7 days, today included) / upcoming / no_date. */
export const milestoneState = (m: Pick<DashboardMilestone, 'status' | 'dueDate'>, today: string, soonDays = 7): MilestoneState => {
    if (m.status === 'done') return 'done';
    const due = ymdOf(m.dueDate);
    if (!due) return 'no_date';
    if (due < today) return 'overdue';
    return daysBetween(today, due) <= soonDays ? 'due_soon' : 'upcoming';
};

/** "Done Nov 12", "3 days late", "Due today", "Due tomorrow", "Due in 4 days", "Due Dec 3", "No date yet". */
export const milestoneWhenText = (m: DashboardMilestone, today: string): string => {
    const state = milestoneState(m, today);
    const due = ymdOf(m.dueDate);
    if (state === 'done') {
        const doneDay = ymdOf(m.completedAt);
        return doneDay ? `Done ${fmtYmd(doneDay, today)}` : 'Done';
    }
    if (state === 'no_date') return 'No date yet';
    const days = daysBetween(today, due);
    if (state === 'overdue') return `Planned for ${fmtYmd(due, today)}`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (state === 'due_soon') return `Due in ${days} days`;
    return `Due ${fmtYmd(due, today)}`;
};

const toMilestoneView = (m: DashboardMilestone, today: string): MilestoneView =>
    ({ ...m, state: milestoneState(m, today), whenText: milestoneWhenText(m, today) });

/** The next milestone: the server's pick, else the first open one by due day (no date last). */
export const pickNextMilestone = (milestones: readonly DashboardMilestone[], serverPick: DashboardMilestone | null): DashboardMilestone | null => {
    if (serverPick && serverPick.status !== 'done') return serverPick;
    const open = milestones.filter(m => m.status !== 'done');
    open.sort((a, b) => (ymdOf(a.dueDate) || '9999').localeCompare(ymdOf(b.dueDate) || '9999'));
    return open[0] || null;
};

/** "Next: Drywall done, due in 4 days" / "Next: Final walkthrough (no date yet)" / "". */
export const nextMilestoneText = (m: DashboardMilestone | null, today: string): string => {
    if (!m) return '';
    const when = milestoneWhenText(m, today);
    return when === 'No date yet' ? `Next: ${m.title} (no date yet)` : `Next: ${m.title}, ${when.charAt(0).toLowerCase()}${when.slice(1)}`;
};

// =============================================================================================== money / documents
/** The document number the portal shows (same keys as utils/clientLinks.ts documentLabel). */
export const docNumberOf = (d: Record<string, any>): string =>
    str(d.number || d.invoiceNumber || d.estimateNumber || d.changeOrderNumber || d.workOrderNumber
        || d.reportNumber || d.poNumber || d.receiptNumber || d.warrantyNumber);

const docLabel = (type: string, d: Record<string, any>): string => {
    const num = docNumberOf(d);
    return num ? `${type} #${num}` : str(d.title) || type;
};

const VOID_STATUSES = ['cancelled', 'canceled', 'void'];

/** Unpaid invoice with money left to pay whose due date (data.dueDate) is before today. */
export const isInvoiceOverdue = (doc: Pick<DashboardDocument, 'type' | 'data'>, today: string): boolean => {
    if (doc.type !== 'Invoice' || !isUnpaidInvoice(doc.data)) return false;
    const due = ymdOf(doc.data.dueDate);
    return !!due && due < today && documentTotals(doc.data).balanceDue > 0;
};

/** The job's invoices: totals (Cancelled / Void left out), paid, outstanding, overdue. null when there are none. */
export const balanceSummary = (docs: readonly DashboardDocument[], today: string): BalanceSummary | null => {
    const invoices = docs.filter(d => d.type === 'Invoice' && !VOID_STATUSES.includes(low(d.data.status)) && low(d.data.status) !== 'draft');
    if (!invoices.length) return null;
    const currency = str(invoices[0].data.currency) || 'USD';
    let total = 0;
    let paid = 0;
    let outstanding = 0;
    let unpaidCount = 0;
    let overdueCount = 0;
    for (const inv of invoices) {
        const t = documentTotals(inv.data);
        total += t.total;
        paid += Math.min(t.amountPaid, t.total);
        // same rule as groupPortalDocuments (the portal's "Outstanding")
        if (isUnpaidInvoice(inv.data) && t.balanceDue > 0) {
            outstanding += t.balanceDue;
            unpaidCount++;
            if (isInvoiceOverdue(inv, today)) overdueCount++;
        } else if (low(inv.data.status) === 'paid') {
            // a Paid invoice counts as fully paid even when amountPaid was never filled in
            paid += t.total - Math.min(t.amountPaid, t.total);
        }
    }
    total = roundMoney(total);
    paid = roundMoney(paid);
    outstanding = roundMoney(outstanding);
    return {
        currency, total, paid, outstanding, invoiceCount: invoices.length, unpaidCount, overdueCount,
        totalText: formatMoney(total, currency), paidText: formatMoney(paid, currency), outstandingText: formatMoney(outstanding, currency),
    };
};

/** Document rows for the dashboard (newest first), with the same totals and signing state as the portal list. */
export const documentRows = (docs: readonly DashboardDocument[], today: string, now?: Date): DashboardDocumentRow[] =>
    [...docs]
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
        .map((doc) => {
            const d = doc.data;
            const totals = documentTotals(doc.type === 'Estimate' ? withEffectiveLines(d) : d);
            const state = stateOfDoc({ type: doc.type, data: d, createdAt: doc.createdAt, state: doc.state }, now);
            const currency = str(d.currency) || 'USD';
            return {
                id: doc.id,
                type: doc.type,
                label: docLabel(doc.type, d),
                number: docNumberOf(d),
                status: str(d.status),
                state,
                date: ymdOf(d.issueDate || d.date || doc.createdAt),
                total: totals.total,
                totalText: totals.hasMoney ? formatMoney(totals.total, currency) : '',
                balanceDue: doc.type === 'Invoice' && isUnpaidInvoice(d) ? totals.balanceDue : 0,
                overdue: isInvoiceOverdue(doc, today),
                awaitingSignature: isSignableType(doc.type) && state === 'open',
            };
        });

// =============================================================================================== punch / next steps
/** "2 open, 1 to check, 5 verified" ("" when there is no shared punch list or it is empty). */
export const punchLabel = (p: DashboardPunch | null): string => {
    if (!p || !p.total) return '';
    const parts = [
        p.open ? `${p.open} open` : '',
        p.done ? `${p.done} to check` : '',
        p.verified ? `${p.verified} verified` : '',
    ].filter(Boolean);
    return parts.join(', ');
};

/**
 * "What happens next", most urgent first (at most `max`):
 *   1 documents to approve   2 overdue invoices   3 milestones past their date   4 other unpaid invoices
 *   5 punch items to check   6 the next milestone   7 the job's start date (when still ahead)
 */
export function nextSteps(
    input: { job: DashboardJob | null; rows: readonly DashboardDocumentRow[]; milestones: readonly MilestoneView[]; next: MilestoneView | null; punch: DashboardPunch | null; currencyOf?: (row: DashboardDocumentRow) => string },
    today: string,
    max = 5,
): NextStep[] {
    const out: NextStep[] = [];
    const money = (row: DashboardDocumentRow) => formatMoney(row.balanceDue, input.currencyOf?.(row) || 'USD');
    for (const r of input.rows) if (r.awaitingSignature) out.push({ kind: 'sign', text: `Review and approve ${r.label}`, refId: r.id });
    for (const r of input.rows) if (r.overdue) out.push({ kind: 'pay_overdue', text: `Pay ${r.label} (${money(r)}, past due)`, refId: r.id });
    for (const m of input.milestones) if (m.state === 'overdue') out.push({ kind: 'milestone_overdue', text: `${m.title} (${m.whenText.charAt(0).toLowerCase()}${m.whenText.slice(1)})`, refId: m.id });
    for (const r of input.rows) {
        if (r.type === 'Invoice' && r.balanceDue > 0 && !r.overdue) out.push({ kind: 'pay', text: `Pay ${r.label} (${money(r)})`, refId: r.id });
    }
    if (input.punch?.done) out.push({ kind: 'punch_check', text: `Check ${plural(input.punch.done, 'finished punch item')}`, refId: null });
    if (input.next && input.next.state !== 'overdue') out.push({ kind: 'milestone', text: nextMilestoneText(input.next, today), refId: input.next.id });
    const start = ymdOf(input.job?.startDate);
    if (start && start > today) out.push({ kind: 'job_start', text: `Work starts ${fmtYmd(start, today)}`, refId: null });
    return out.slice(0, max);
}

// =============================================================================================== view model
/** PortalDashboard -> everything the portal dashboard renders. `now` defaults to the current time. */
export function buildDashboardView(d: PortalDashboard, now: Date = new Date()): DashboardView {
    const today = todayYmd(now);
    const milestones = d.milestones.map(m => toMilestoneView(m, today));
    const nextRaw = pickNextMilestone(d.milestones, d.nextMilestone);
    const next = nextRaw ? toMilestoneView(nextRaw, today) : null;
    const rows = documentRows(d.documents, today, now);
    const currencyById = new Map(d.documents.map(doc => [doc.id, str(doc.data.currency) || 'USD']));
    return {
        job: d.job,
        jobs: d.jobs,
        contractor: d.contractor,
        statusLabel: jobStatusLabel(d.job?.status),
        datesText: jobDatesText(d.job, today),
        progress: d.progress,
        progressLabel: progressLabel(d.progress),
        milestones,
        nextMilestone: next,
        nextMilestoneText: nextMilestoneText(next, today),
        nextSteps: nextSteps({ job: d.job, rows, milestones, next, punch: d.punch, currencyOf: r => currencyById.get(r.id) || 'USD' }, today),
        balance: balanceSummary(d.documents, today),
        documents: rows,
        photos: d.photos,
        punch: d.punch,
        punchLabel: punchLabel(d.punch),
        selections: d.selections,
    };
}

// =============================================================================================== portal screen helpers
/** The job shown first: the first one in progress, else the first not completed, else the first (the list is newest first). */
export const pickDefaultJob = <T extends Pick<DashboardJobSummary, 'status'>>(jobs: readonly T[]): T | null =>
    jobs.find(j => low(j.status) === 'active') || jobs.find(j => low(j.status) !== 'completed') || jobs[0] || null;

export type TimelineRole = 'done' | 'next' | 'upcoming';
export interface TimelineItem { milestone: MilestoneView; role: TimelineRole }

/** Each milestone with its place on the timeline: finished, the one highlighted as next, or coming up. */
export const timelineItems = (milestones: readonly MilestoneView[], next: MilestoneView | null): TimelineItem[] =>
    milestones.map(m => ({ milestone: m, role: m.status === 'done' ? 'done' : next && m.id === next.id ? 'next' : 'upcoming' }));

/**
 * Long timelines: keep the last `keepDone` finished steps and fold the earlier finished ones behind a button
 * (only when that hides at least `minHidden`, so the button never replaces a single row).
 */
export const collapseTimeline = (items: readonly TimelineItem[], expanded: boolean, keepDone = 2, minHidden = 2): { items: TimelineItem[]; hiddenCount: number } => {
    const doneIdx = items.map((it, i) => (it.role === 'done' ? i : -1)).filter(i => i >= 0);
    const hide = doneIdx.length - keepDone;
    if (expanded || hide < minHidden) return { items: [...items], hiddenCount: 0 };
    const hidden = new Set(doneIdx.slice(0, hide));
    return { items: items.filter((_, i) => !hidden.has(i)), hiddenCount: hidden.size };
};

export type StepAction = 'sign' | 'open' | 'punch';

/** What a "What happens next" row can open (null = nothing to tap). */
export const nextStepAction = (step: Pick<NextStep, 'kind' | 'refId'>): StepAction | null => {
    if (step.kind === 'sign') return step.refId ? 'sign' : null;
    if (step.kind === 'pay' || step.kind === 'pay_overdue') return step.refId ? 'open' : null;
    if (step.kind === 'punch_check') return 'punch';
    return null;
};

export const stepActionLabel = (a: StepAction): string => (a === 'sign' ? 'Review' : a === 'open' ? 'Open' : 'See list');

/** Share of the project's invoiced total that is paid, 0-100 (whole numbers). */
export const paidPercent = (b: Pick<BalanceSummary, 'total' | 'paid'> | null): number =>
    b && b.total > 0 ? Math.max(0, Math.min(100, Math.round((b.paid / b.total) * 100))) : 0;

export type DashboardSection = 'header' | 'progress' | 'milestones' | 'next' | 'balance' | 'documents' | 'photos' | 'punch' | 'selections';

/** Which sections the portal shows for this view, in display order. Empty ones are left out (friendly, never an empty box). */
export const visibleSections = (view: DashboardView): DashboardSection[] => {
    const out: DashboardSection[] = [];
    if (view.job) out.push('header');
    if (view.progress && view.progress.total > 0) out.push('progress');
    if (view.milestones.length) out.push('milestones');
    if (view.nextSteps.length) out.push('next');
    if (view.balance) out.push('balance');
    if (view.documents.length) out.push('documents');
    if (view.photos.length) out.push('photos');
    if (view.punchLabel) out.push('punch');
    if (view.selections.length) out.push('selections');
    return out;
};

// =============================================================================================== owner preview
/** Local data for the contractor's preview (shapes loose on purpose: app types fit). */
export interface OwnerPreviewInput {
    job: { id: string; name: string; clientAddress?: string | null; status?: string | null; startDate?: string | null; endDate?: string | null };
    contractor?: Partial<DashboardContractor>;
    tasks?: ReadonlyArray<{ id: string; title: string; status: string; dueDate?: string | null; isMilestone?: boolean; completedAt?: string | null; sortOrder?: number }>;
    /** the job's documents (any type: internal ones and Drafts are filtered out here, like the database) */
    documents?: ReadonlyArray<{ id: string; type: string; createdAt?: string; data: Record<string, any> }>;
    photos?: ReadonlyArray<{ id: string; tag?: string | null; caption?: string | null; takenAt?: string | null; portalPath?: string | null; sharedInPortal?: boolean }>;
    punch?: { shared: boolean; items: ReadonlyArray<{ status: string }> } | null;
}

/**
 * The contractor's "what my client sees" preview, built from data already on the device with the same filters as
 * get_portal_project_dashboard (milestones only, shared photos only, newest 12, punch counts only when shared,
 * client-facing non-Draft documents). Feed the result to buildDashboardView().
 */
export function ownerPreviewDashboard(input: OwnerPreviewInput): PortalDashboard {
    const j = input.job;
    const tasks = input.tasks || [];
    const done = tasks.filter(t => t.status === 'done').length;
    const milestoneRaw = tasks
        .filter(t => t.isMilestone)
        .map(t => ({ ...t, due: ymdOf(t.dueDate) || '9999-99-99' }))
        .sort((a, b) => a.due.localeCompare(b.due) || (a.sortOrder || 0) - (b.sortOrder || 0))
        .slice(0, DASHBOARD_LIMITS.milestones)
        .map(t => ({ id: t.id, title: t.title, due_date: t.dueDate ?? null, status: t.status, completed_at: t.completedAt ?? null }));
    const photos = (input.photos || [])
        .filter(p => p.sharedInPortal && str(p.portalPath))
        .sort((a, b) => str(b.takenAt).localeCompare(str(a.takenAt)))
        .slice(0, DASHBOARD_LIMITS.photos)
        .map(p => ({ id: p.id, tag: p.tag ?? null, caption: p.caption ?? null, taken_at: p.takenAt ?? null, path: p.portalPath }));
    const items = input.punch?.shared ? input.punch.items : null;
    const c = input.contractor || {};
    return parseDashboard({
        jobs: [{ id: j.id, name: j.name, status: j.status, start_date: j.startDate, end_date: j.endDate }],
        job: { id: j.id, name: j.name, address: j.clientAddress, status: j.status, start_date: j.startDate, end_date: j.endDate },
        contractor: { name: c.name, company_name: c.companyName, logo_url: c.logoUrl, phone: c.phone, email: c.email, website: c.website, address: c.address },
        progress: tasks.length ? { done, total: tasks.length } : null,
        milestones: milestoneRaw,
        next_milestone: milestoneRaw.find(m => m.status !== 'done') || null,
        documents: (input.documents || [])
            .slice()
            .sort((a, b) => (Date.parse(str(b.createdAt)) || 0) - (Date.parse(str(a.createdAt)) || 0))
            .map(d => ({ id: d.id, type: d.type, created_at: d.createdAt || '', state: null, data: d.data })),
        photos,
        punch: items ? {
            total: items.length,
            open: items.filter(i => i.status === 'open').length,
            done: items.filter(i => i.status === 'done').length,
            verified: items.filter(i => i.status === 'verified').length,
        } : null,
        selections: [],
    });
}
