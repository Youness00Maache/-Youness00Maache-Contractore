/**
 * Service plans: Supabase calls. Reads return null while migration 20261115000400 is not applied (the screen says so).
 * Saving a plan: the database creates its job (guard_service_plan) and the due visits (generate_due_service_visits);
 * monthly / quarterly / 6-monthly / yearly billing adds ONE recurring source invoice on that job, which the existing
 * recurring-invoice engine repeats (lib/recurring.ts, generate_due_recurring_invoices).
 */
import { supabase } from '../../lib/supabase.ts';
import { isMissingBackendError } from '../requests/requestLogic.ts';
import { isMissingColumnError } from '../../lib/account.ts';
import { mapDocumentRow, primeDocumentCache } from '../../lib/documents.ts';
import { buildPlanDocument } from '../../src/ai/planDocuments.ts';
import type { FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import {
    PLAN_COLUMNS, VISIT_COLUMNS, mapPlanRow, mapVisitRow, planRowOf, recurringInvoiceFields,
    type PlanStatus, type ServicePlan, type ServiceVisit, type VisitStatus,
} from '../../lib/servicePlans.ts';

const needOnline = () => { if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(NEEDS_CONNECTION); };

/** null = service plans aren't in the database yet. */
export const listPlans = async (): Promise<ServicePlan[] | null> => {
    const { data, error } = await supabase.from('service_plans').select(PLAN_COLUMNS).order('next_visit', { ascending: true }).limit(500);
    if (error) {
        if (isMissingBackendError(error)) return null;
        throw error;
    }
    return (data || []).map(mapPlanRow);
};

/** Visits from `from` (YYYY-MM-DD) on, earliest first. */
export const listVisits = async (from: string): Promise<ServiceVisit[]> => {
    const { data, error } = await supabase.from('service_visits').select(VISIT_COLUMNS).gte('scheduled_for', from).order('scheduled_for', { ascending: true }).limit(500);
    if (error) {
        if (isMissingBackendError(error)) return [];
        throw error;
    }
    return (data || []).map(mapVisitRow);
};

/** Creates the visits that are due now (all plans). Number created; null when the feature isn't in the database. */
export const generateDueVisits = async (): Promise<number | null> => {
    const { data, error } = await supabase.rpc('generate_due_service_visits');
    if (error) return isMissingBackendError(error) ? null : 0;
    return Number(data) || 0;
};

/** The recurring source invoice of a plan, on the plan's job. */
const createRecurringInvoice = async (plan: ServicePlan, userId: string, profile: UserProfile | null, existingNumbers: string[], today: string): Promise<FormDataType | null> => {
    if (!plan.jobId) return null;
    const fields = recurringInvoiceFields(plan, crypto.randomUUID());
    if (!fields) return null;
    const { data: jobRow, error: jobError } = await supabase.from('jobs').select('id, name, client_id, client_name, client_address, start_date, end_date, status, worker_name').eq('id', plan.jobId).maybeSingle();
    if (jobError || !jobRow) return null;
    const job = {
        id: jobRow.id, userId, name: jobRow.name, clientName: jobRow.client_name || plan.clientName, clientAddress: jobRow.client_address || plan.clientAddress,
        startDate: jobRow.start_date, endDate: jobRow.end_date, status: jobRow.status, workerName: jobRow.worker_name, clientId: jobRow.client_id,
    } as unknown as Job & { clientId?: string | null };
    const built = buildPlanDocument('INVOICE', fields, { job, profile, today, existingNumbers });
    const data: Record<string, unknown> = { ...built.data, ...fields, isAiGenerated: false, servicePlanId: plan.id };
    const row: Record<string, unknown> = { id: crypto.randomUUID(), user_id: userId, job_id: plan.jobId, type: built.formType, data };
    if (jobRow.client_id) row.client_id = jobRow.client_id;
    let { error } = await supabase.from('documents').insert(row);
    if (error && 'client_id' in row && isMissingColumnError(error)) {
        delete row.client_id;
        ({ error } = await supabase.from('documents').insert(row));
    }
    if (error) throw error;
    const form = mapDocumentRow({ ...row, created_at: new Date().toISOString() }, true);
    primeDocumentCache(form);
    await supabase.from('service_plans').update({ invoice_source_id: row.id }).eq('id', plan.id);
    return form;
};

export interface SavePlanResult {
    plan: ServicePlan;
    /** visits created right away (the first one is within the "create ahead" window) */
    visitsCreated: number;
    /** the recurring invoice created for the plan */
    invoice: FormDataType | null;
}

export const savePlan = async (input: {
    plan: ServicePlan;
    userId: string;
    kind: 'create' | 'edit';
    profile: UserProfile | null;
    existingInvoiceNumbers: string[];
    today: string;
}): Promise<SavePlanResult> => {
    needOnline();
    const row = planRowOf(input.plan, input.userId);
    const res = input.kind === 'create'
        ? await supabase.from('service_plans').insert(row).select(PLAN_COLUMNS).single()
        : await supabase.from('service_plans').update((() => { const { id: _i, user_id: _u, ...rest } = row; return rest; })()).eq('id', input.plan.id).select(PLAN_COLUMNS).single();
    if (res.error) throw res.error;
    let plan = mapPlanRow(res.data);
    let invoice: FormDataType | null = null;
    // billing by period: one recurring invoice per plan (added when the plan gets one, kept when it changes)
    if (!plan.invoiceSourceId && recurringInvoiceFields(plan, 'x')) {
        try {
            invoice = await createRecurringInvoice(plan, input.userId, input.profile, input.existingInvoiceNumbers, input.today);
            if (invoice) plan = { ...plan, invoiceSourceId: invoice.id };
        } catch { /* the plan is saved; the invoice can be made by hand */ }
    }
    const visitsCreated = plan.status === 'active' ? (await generateDueVisits()) || 0 : 0;
    if (visitsCreated) {
        const again = await supabase.from('service_plans').select(PLAN_COLUMNS).eq('id', plan.id).maybeSingle();
        if (!again.error && again.data) plan = mapPlanRow(again.data);
    }
    return { plan, visitsCreated, invoice };
};

export const setPlanStatus = async (id: string, status: PlanStatus): Promise<void> => {
    needOnline();
    const { error } = await supabase.from('service_plans').update({ status }).eq('id', id);
    if (error) throw error;
};

export const deletePlan = async (id: string): Promise<void> => {
    needOnline();
    const { error } = await supabase.from('service_plans').delete().eq('id', id);
    if (error) throw error;
};

export const setVisitStatus = async (visitId: string, status: VisitStatus): Promise<void> => {
    needOnline();
    const { error } = await supabase.rpc('complete_service_visit', { p_visit_id: visitId, p_status: status });
    if (error) throw error;
};
