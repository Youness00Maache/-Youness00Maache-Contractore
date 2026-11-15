/**
 * Carries out the drafts the rules ask for (the network side of lib/automations/evaluate.ts). It only ever INSERTS one
 * new document with status Draft (an invoice for an approved estimate, a warranty for a completed job): it never edits,
 * sends, signs or deletes anything. It re-checks the database right before inserting, so two devices (or two tabs) that
 * both think a draft is due still make one: an invoice that already points at the estimate, or a job that already has a
 * warranty, is left alone.
 *
 * Every failure is returned, never thrown: the caller falls back to "tell me" for that item.
 */
import { supabase } from '../supabase.ts';
import { isMissingColumnError, isPlanLimitError, planLimitMessage } from '../account.ts';
import { fetchDocumentNumbers, upsertDocumentRecord } from '../documentSave.ts';
import { fetchInvoicesFromEstimate } from '../../components/forms/jobDocuments.ts';
import { docLabel } from '../notifications/model.ts';
import { toLocalYMD } from '../../utils/localDates.ts';
import { buildInvoiceDraft, buildWarrantyDraft, type BuiltDraft, type DraftProfile } from './drafts.ts';
import type { AutoAction } from './evaluate.ts';
import type { DoneEntry } from './state.ts';

export interface AutoJob {
    id: string;
    name?: string | null;
    clientName?: string | null;
    clientAddress?: string | null;
    clientId?: string | null;
}

export type ActionResult =
    /** a draft was made: `entry` goes in the done log */
    | { ok: true; entry: DoneEntry }
    /** nothing to do: the draft already exists (made by hand or by another device) */
    | { ok: true; entry: null }
    | { ok: false; reason: 'offline' | 'limit' | 'gone' | 'error'; message: string };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const fail = (reason: 'offline' | 'limit' | 'gone' | 'error', message: string): ActionResult => ({ ok: false, reason, message });

const insertDraft = async (uid: string, jobId: string, clientId: string | null | undefined, built: BuiltDraft): Promise<{ id: string } | ActionResult> => {
    const record: Record<string, unknown> = { id: crypto.randomUUID(), user_id: uid, job_id: jobId, type: built.formType, data: built.data };
    if (clientId) record.client_id = clientId;
    const { error } = await upsertDocumentRecord(record);
    if (error) {
        if (isPlanLimitError(error)) return fail('limit', planLimitMessage(error));
        return fail('error', String(error.message || 'The draft could not be saved.'));
    }
    return { id: String(record.id) };
};

/** Invoice draft for an approved estimate. */
async function makeInvoice(action: Extract<AutoAction, { type: 'create_invoice' }>, uid: string, profile: DraftProfile | null, now: Date): Promise<ActionResult> {
    // already invoiced (by hand, or by another device a moment ago)?
    const existing = await fetchInvoicesFromEstimate(action.jobId, action.estimateId);
    if (existing.length) return { ok: true, entry: null };

    const { data: row, error: readError } = await supabase.from('documents').select('id, job_id, client_id, type, data').eq('id', action.estimateId).eq('user_id', uid).maybeSingle();
    if (readError) return fail('error', String(readError.message || 'The estimate could not be read.'));
    if (!row || row.type !== 'Estimate') return fail('gone', 'The estimate is not there any more.');
    const est = (row.data && typeof row.data === 'object' ? row.data : {}) as Record<string, unknown>;
    // re-check at the moment of acting: still signed, not declined since
    if (!est.clientSignedAt || (est.clientDeclinedAt && String(est.clientDeclinedAt) >= String(est.clientSignedAt))) return fail('gone', 'The estimate is no longer approved.');

    const { data: job } = await supabase.from('jobs').select('id, name, client_name, client_address, client_id').eq('id', action.jobId).maybeSingle();
    const facts: AutoJob = { id: action.jobId, name: job?.name, clientName: job?.client_name, clientAddress: job?.client_address, clientId: job?.client_id };
    const taken = (await fetchDocumentNumbers('Invoice', 'invoiceNumber').catch(() => [])).map(n => n.number);
    const built = buildInvoiceDraft({ estimateId: action.estimateId, estimateData: est, job: facts, profile, today: toLocalYMD(now), taken, now });
    const saved = await insertDraft(uid, action.jobId, (row.client_id as string | null) || facts.clientId, built);
    if (!('id' in saved)) return saved;
    const from = docLabel({ type: 'Estimate', number: String(est.estimateNumber || ''), title: String(est.title || '') });
    return { ok: true, entry: { r: 'inv', at: Math.floor(now.getTime() / 1000), id: saved.id, jid: action.jobId, l: built.label, f: from } };
}

/** Warranty draft for a completed job. */
async function makeWarranty(action: Extract<AutoAction, { type: 'create_warranty' }>, uid: string, job: AutoJob | undefined, profile: DraftProfile | null, now: Date): Promise<ActionResult> {
    if (!job) return fail('gone', 'The job is not there any more.');
    const found = await supabase.from('documents').select('id').eq('job_id', action.jobId).eq('type', 'Warranty').limit(1);
    if (found.error && !isMissingColumnError(found.error)) return fail('error', String(found.error.message || 'The job could not be checked.'));
    if ((found.data || []).length) return { ok: true, entry: null };

    const taken = (await fetchDocumentNumbers('Warranty', 'warrantyNumber').catch(() => [])).map(n => n.number);
    const built = buildWarrantyDraft({ job, profile, today: toLocalYMD(now), taken, now });
    // the user's default design, like a warranty started by hand (loaded only now: the design list is large)
    try {
        const [{ applyDesignDefault, designPlan }, { currentDesignDefault }] = await Promise.all([import('../designAccess.ts'), import('../designDefaults.ts')]);
        built.data = applyDesignDefault(built.data, currentDesignDefault(), designPlan());
    } catch { /* the form falls back to its standard design */ }
    const saved = await insertDraft(uid, action.jobId, job.clientId, built);
    if (!('id' in saved)) return saved;
    return { ok: true, entry: { r: 'war', at: Math.floor(now.getTime() / 1000), id: saved.id, jid: action.jobId, l: built.label, f: String(job.name || '') } };
}

export async function runAutoAction(action: AutoAction, args: { uid: string; profile: DraftProfile | null; jobs: ReadonlyMap<string, AutoJob>; now?: Date }): Promise<ActionResult> {
    if (offline()) return fail('offline', "You're offline.");
    const now = args.now || new Date();
    try {
        if (action.type === 'create_invoice') return await makeInvoice(action, args.uid, args.profile, now);
        return await makeWarranty(action, args.uid, args.jobs.get(action.jobId), args.profile, now);
    } catch (e) {
        return fail('error', String((e as { message?: unknown } | null)?.message || 'The draft could not be made.'));
    }
}
