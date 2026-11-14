/**
 * Recurring service plans (competitor gap #15): pure rules, no React / Supabase (scripts/field-features-check.ts).
 * The visit generation itself runs in the database (public._generate_service_visits, migration
 * 20261115000400_service_plans.sql); the functions here use the SAME date math (lib/recurring.ts addMonthsAnchored =
 * SQL _add_months_anchored) so the app shows the dates the server will use.
 */
import { addMonthsAnchored } from './recurring.ts';
import { roundMoney, toNumber, formatMoney } from '../utils/money.ts';

export type IntervalUnit = 'week' | 'month';
export type PlanBilling = 'per_visit' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'none';
export type PlanStatus = 'active' | 'paused' | 'ended';
export type VisitStatus = 'scheduled' | 'done' | 'skipped';

export interface ServicePlan {
    id: string;
    clientId: string | null;
    clientName: string;
    clientAddress: string;
    jobId: string | null;
    name: string;
    service: string;
    price: number;
    billing: PlanBilling;
    intervalUnit: IntervalUnit;
    intervalCount: number;
    anchorDay: number | null;
    /** YYYY-MM-DD: the next visit the engine will create */
    nextVisit: string;
    endsOn: string;
    assignedTo: string;
    leadDays: number;
    remindClient: boolean;
    showInPortal: boolean;
    status: PlanStatus;
    invoiceSourceId: string | null;
    visitsCreated: number;
    notes: string;
    createdAt: string;
}

export interface ServiceVisit {
    id: string;
    planId: string;
    jobId: string | null;
    scheduledFor: string;
    status: VisitStatus;
    assignedTo: string;
    workOrderId: string | null;
    invoiceId: string | null;
    doneAt: string | null;
}

export const PLAN_COLUMNS = 'id, client_id, client_name, client_address, job_id, name, service, price, billing, interval_unit, interval_count, anchor_day, next_visit, ends_on, assigned_to, lead_days, remind_client, show_in_portal, status, invoice_source_id, visits_created, notes, created_at';
export const VISIT_COLUMNS = 'id, plan_id, job_id, scheduled_for, status, assigned_to, work_order_id, invoice_id, done_at';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const ymd = (v: unknown): string => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(v)); return m ? m[1] : ''; };
const BILLINGS: PlanBilling[] = ['per_visit', 'monthly', 'quarterly', 'semiannual', 'annual', 'none'];

export const mapPlanRow = (r: any): ServicePlan => ({
    id: str(r?.id),
    clientId: r?.client_id ? String(r.client_id) : null,
    clientName: str(r?.client_name),
    clientAddress: str(r?.client_address),
    jobId: r?.job_id ? String(r.job_id) : null,
    name: str(r?.name) || 'Service plan',
    service: str(r?.service),
    price: roundMoney(Math.max(0, toNumber(r?.price))),
    billing: BILLINGS.includes(r?.billing) ? r.billing : 'per_visit',
    intervalUnit: r?.interval_unit === 'week' ? 'week' : 'month',
    intervalCount: Math.max(1, Math.round(Number(r?.interval_count)) || 1),
    anchorDay: Number.isFinite(Number(r?.anchor_day)) && r?.anchor_day ? Number(r.anchor_day) : null,
    nextVisit: ymd(r?.next_visit),
    endsOn: ymd(r?.ends_on),
    assignedTo: str(r?.assigned_to),
    leadDays: Number.isFinite(Number(r?.lead_days)) && r?.lead_days !== null && r?.lead_days !== undefined ? Number(r.lead_days) : 14,
    remindClient: r?.remind_client !== false,
    showInPortal: r?.show_in_portal !== false,
    status: r?.status === 'paused' || r?.status === 'ended' ? r.status : 'active',
    invoiceSourceId: r?.invoice_source_id ? String(r.invoice_source_id) : null,
    visitsCreated: Number(r?.visits_created) || 0,
    notes: str(r?.notes),
    createdAt: str(r?.created_at),
});

export const mapVisitRow = (r: any): ServiceVisit => ({
    id: str(r?.id),
    planId: str(r?.plan_id),
    jobId: r?.job_id ? String(r.job_id) : null,
    scheduledFor: ymd(r?.scheduled_for),
    status: r?.status === 'done' || r?.status === 'skipped' ? r.status : 'scheduled',
    assignedTo: str(r?.assigned_to),
    workOrderId: r?.work_order_id ? String(r.work_order_id) : null,
    invoiceId: r?.invoice_id ? String(r.invoice_id) : null,
    doneAt: r?.done_at ? String(r.done_at) : null,
});

/** Columns the browser writes. */
export const planRowOf = (p: ServicePlan, userId: string): Record<string, unknown> => ({
    id: p.id,
    user_id: userId,
    client_id: p.clientId,
    client_name: p.clientName.trim().slice(0, 200) || null,
    client_address: p.clientAddress.trim().slice(0, 500) || null,
    ...(p.jobId ? { job_id: p.jobId } : {}),
    name: p.name.trim().slice(0, 120) || 'Service plan',
    service: p.service.trim().slice(0, 2000) || null,
    price: roundMoney(Math.max(0, p.price)),
    billing: p.billing,
    interval_unit: p.intervalUnit,
    interval_count: clampCount(p.intervalUnit, p.intervalCount),
    next_visit: p.nextVisit,
    ends_on: p.endsOn || null,
    assigned_to: p.assignedTo.trim().slice(0, 120) || null,
    lead_days: Math.min(60, Math.max(0, Math.round(p.leadDays))),
    remind_client: p.remindClient,
    show_in_portal: p.showInPortal,
    status: p.status,
    notes: p.notes.trim().slice(0, 2000) || null,
});

const clampCount = (unit: IntervalUnit, n: number) => Math.min(unit === 'week' ? 52 : 24, Math.max(1, Math.round(n) || 1));

// ---------------------------------------------------------------------------------------------
// Frequencies
// ---------------------------------------------------------------------------------------------
export const FREQUENCY_PRESETS: ReadonlyArray<{ id: string; label: string; unit: IntervalUnit; count: number }> = [
    { id: 'w1', label: 'Every week', unit: 'week', count: 1 },
    { id: 'w2', label: 'Every 2 weeks', unit: 'week', count: 2 },
    { id: 'm1', label: 'Monthly', unit: 'month', count: 1 },
    { id: 'm2', label: 'Every 2 months', unit: 'month', count: 2 },
    { id: 'm3', label: 'Quarterly', unit: 'month', count: 3 },
    { id: 'm6', label: 'Twice a year', unit: 'month', count: 6 },
    { id: 'm12', label: 'Yearly', unit: 'month', count: 12 },
];

export const frequencyLabel = (unit: IntervalUnit, count: number): string =>
    FREQUENCY_PRESETS.find(f => f.unit === unit && f.count === count)?.label
    || `Every ${count} ${unit === 'week' ? 'weeks' : 'months'}`;

/** Visits a year (52 / weeks, 12 / months). */
export const visitsPerYear = (unit: IntervalUnit, count: number): number => (unit === 'week' ? 52 / Math.max(1, count) : 12 / Math.max(1, count));

/** The visit after `date`: weeks add 7 days each; months keep the anchor day, clamped (Jan 31 → Feb 28 → Mar 31). */
export const nextVisitDate = (date: string, unit: IntervalUnit, count: number, anchorDay?: number | null): string => {
    const d = ymd(date);
    if (!d) return date;
    if (unit === 'week') {
        const [y, m, day] = d.split('-').map(Number);
        const t = new Date(Date.UTC(y, m - 1, day + 7 * Math.max(1, count)));
        return t.toISOString().slice(0, 10);
    }
    return addMonthsAnchored(d, Math.max(1, count), anchorDay ?? Number(d.slice(8, 10)));
};

/** The next `n` visit dates from the plan's next visit (stops at the end date). */
export const upcomingVisitDates = (p: Pick<ServicePlan, 'nextVisit' | 'intervalUnit' | 'intervalCount' | 'anchorDay' | 'endsOn'>, n: number): string[] => {
    const out: string[] = [];
    let next = p.nextVisit;
    const anchor = p.intervalUnit === 'month' ? (p.anchorDay ?? Number(next.slice(8, 10))) : null;
    while (next && out.length < n) {
        if (p.endsOn && next > p.endsOn) break;
        out.push(next);
        next = nextVisitDate(next, p.intervalUnit, p.intervalCount, anchor);
    }
    return out;
};

const addDays = (date: string, days: number): string => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/**
 * What the engine creates now (same rules as SQL _generate_service_visits): visits whose day minus lead_days has come,
 * up to 24 per run, skipping visits more than 30 days in the past, never past the end date. Returns the dates created
 * and the plan's next visit afterwards.
 */
export const dueVisits = (p: Pick<ServicePlan, 'nextVisit' | 'intervalUnit' | 'intervalCount' | 'anchorDay' | 'endsOn' | 'leadDays' | 'status'>, today: string, existing: ReadonlySet<string> = new Set()): { create: string[]; skipped: string[]; nextVisit: string } => {
    const create: string[] = [];
    const skipped: string[] = [];
    if (p.status !== 'active' || !ymd(p.nextVisit)) return { create, skipped, nextVisit: p.nextVisit };
    const anchor = p.intervalUnit === 'month' ? (p.anchorDay ?? Number(p.nextVisit.slice(8, 10))) : null;
    let next = p.nextVisit;
    let iter = 0;
    while (addDays(next, -p.leadDays) <= today && iter < 24) {
        if (p.endsOn && next > p.endsOn) break;
        iter++;
        if (next >= addDays(today, -30)) { if (!existing.has(next)) create.push(next); } else skipped.push(next);
        next = nextVisitDate(next, p.intervalUnit, p.intervalCount, anchor);
    }
    return { create, skipped, nextVisit: next };
};

// ---------------------------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------------------------
export const BILLING_OPTIONS: ReadonlyArray<{ value: PlanBilling; label: string; per: string }> = [
    { value: 'per_visit', label: 'Invoice each visit', per: 'per visit' },
    { value: 'monthly', label: 'Monthly invoice', per: 'per month' },
    { value: 'quarterly', label: 'Quarterly invoice', per: 'per quarter' },
    { value: 'semiannual', label: 'Invoice every 6 months', per: 'every 6 months' },
    { value: 'annual', label: 'Yearly invoice', per: 'per year' },
    { value: 'none', label: 'Not invoiced here', per: '' },
];

/** The recurring-invoice frequency (lib/recurring.ts RECURRENCE_MONTHS) for a billing choice, or null. */
export const recurrenceFrequency = (b: PlanBilling): 'Monthly' | 'Quarterly' | 'Bi-Annually' | 'Annually' | null =>
    ({ monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Bi-Annually', annual: 'Annually' } as const)[b as 'monthly'] ?? null;

const BILLING_MONTHS: Partial<Record<PlanBilling, number>> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

/** "$129 per visit", "$480 per year", "Not invoiced here". */
export const priceLabel = (p: Pick<ServicePlan, 'price' | 'billing'>): string => {
    const opt = BILLING_OPTIONS.find(o => o.value === p.billing);
    if (p.billing === 'none' || !opt) return 'Not invoiced here';
    return `${formatMoney(p.price)} ${opt.per}`;
};

/** About how much the plan brings in a year. */
export const annualValue = (p: Pick<ServicePlan, 'price' | 'billing' | 'intervalUnit' | 'intervalCount'>): number => {
    if (p.billing === 'none') return 0;
    if (p.billing === 'per_visit') return roundMoney(p.price * visitsPerYear(p.intervalUnit, p.intervalCount));
    return roundMoney(p.price * (12 / (BILLING_MONTHS[p.billing] || 12)));
};

/** The per-visit Draft invoice the database creates with a visit (the same numbers, for the app's preview and tests). */
export const visitInvoicePreview = (p: Pick<ServicePlan, 'name' | 'price' | 'billing'>, visitDate: string): { issueDate: string; dueDate: string; description: string; total: number } | null => {
    if (p.billing !== 'per_visit' || !(p.price > 0) || !ymd(visitDate)) return null;
    const [y, m, d] = visitDate.split('-').map(Number);
    const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return { issueDate: visitDate, dueDate: addDays(visitDate, 14), description: `${p.name} · visit ${label}`, total: roundMoney(p.price) };
};

/**
 * Data of the recurring source invoice for monthly / quarterly / 6-monthly / yearly billing: the first invoice is dated
 * the first visit, the existing recurring engine (generate_due_recurring_invoices) makes the next ones. Merged into the
 * app's invoice defaults by the caller. Null for per-visit / no billing.
 */
export const recurringInvoiceFields = (p: Pick<ServicePlan, 'name' | 'service' | 'price' | 'billing' | 'nextVisit'>, lineId: string): Record<string, unknown> | null => {
    const frequency = recurrenceFrequency(p.billing);
    const months = BILLING_MONTHS[p.billing];
    if (!frequency || !months || !ymd(p.nextVisit)) return null;
    const anchor = Number(p.nextVisit.slice(8, 10));
    return {
        title: p.name,
        issueDate: p.nextVisit,
        dueDate: addDays(p.nextVisit, 14),
        status: 'Draft',
        lineItems: [{ id: lineId, description: `${p.name} (${BILLING_OPTIONS.find(o => o.value === p.billing)?.per})`, quantity: 1, rate: roundMoney(p.price) }],
        notes: p.service,
        recurrence: { enabled: true, frequency, nextRunDate: addMonthsAnchored(p.nextVisit, months, anchor), anchorDay: anchor },
    };
};

// ---------------------------------------------------------------------------------------------
// Validation and portal
// ---------------------------------------------------------------------------------------------
export const planProblems = (p: ServicePlan, today: string): string[] => {
    const out: string[] = [];
    if (!p.name.trim()) out.push('Name the plan (e.g. HVAC maintenance).');
    if (!p.clientId && !p.clientName.trim()) out.push('Pick the client.');
    if (!ymd(p.nextVisit)) out.push('Choose the first visit date.');
    else if (p.nextVisit < addDays(today, -30)) out.push('The first visit is more than 30 days ago: pick the next one to come.');
    if (p.endsOn && ymd(p.nextVisit) && p.endsOn < p.nextVisit) out.push('The end date is before the first visit.');
    if (p.billing !== 'none' && !(p.price > 0)) out.push('Add the price, or choose “Not invoiced here”.');
    return out;
};

export interface PortalPlan {
    id: string;
    name: string;
    service: string;
    priceLabel: string;
    frequency: string;
    status: PlanStatus;
    nextVisit: string;
    lastVisit: string;
}

/** get_portal_service_plans() → plans (bad rows dropped, never throws). */
export const parsePortalPlans = (data: unknown): PortalPlan[] => {
    if (!Array.isArray(data)) return [];
    return data
        .filter((r: any) => r && typeof r === 'object' && str(r.id) && str(r.name))
        .map((r: any) => {
            const billing: PlanBilling = BILLINGS.includes(r.billing) ? r.billing : 'per_visit';
            const unit: IntervalUnit = r.interval_unit === 'week' ? 'week' : 'month';
            return {
                id: str(r.id), name: str(r.name), service: str(r.service),
                priceLabel: priceLabel({ price: roundMoney(toNumber(r.price)), billing }),
                frequency: frequencyLabel(unit, Math.max(1, Math.round(Number(r.interval_count)) || 1)),
                status: r.status === 'paused' || r.status === 'ended' ? r.status : 'active',
                nextVisit: ymd(r.next_visit), lastVisit: ymd(r.last_visit),
            };
        });
};
