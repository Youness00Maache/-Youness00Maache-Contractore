/**
 * Leads + appointments: Supabase calls of the signed-in contractor (shapes: ./leadTypes.ts; rows: ./leadRows.ts).
 *
 *  - Until migration 20261116000500_leads_appointments.sql is applied: listLeads falls back to today's quote requests
 *    (every Lead has hasLeadColumns = false, stage from the old status), listAppointments returns null, and the
 *    lead-only writes throw LeadsUnavailableError. Use lib/leads/leadsFeature.ts useLeadsFeature() to keep the new
 *    UI hidden until 'ready'.
 *  - Every write needs a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline it throws an Error
 *    whose message is NEEDS_CONNECTION; other failures throw an Error with a readable message.
 *
 * API (all async)
 *   probeLeadsBackend()                           'ready' | 'missing' | 'error'
 *   listLeads({ includeArchived?, limit? })       Lead[] | null   (null = no quote_requests table at all)
 *   getLead(id)                                   Lead | null
 *   createManualLead(userId, values)              Lead            (LeadFormValues, validated here too)
 *   updateLead(id, patch)                         Lead            (LeadPatch)
 *   updateLeadFromForm(lead, values)              Lead
 *   moveLeadStage(lead, stage, { lostReason? })   Lead            (also keeps the old status in step: statusForStage)
 *   markLeadLost(lead, reason)                    Lead
 *   reopenLead(lead, stage?)                      Lead            (from lost / archived; default 'contacted')
 *   setLeadFollowUp(id, ymd | null)               Lead
 *   logLeadContact(lead, at?)                     Lead            (last_contact_at; new -> contacted)
 *   convertLead(lead, jobName?, startDate?)       ConvertResult   (the existing convert_quote_request path)
 *   deleteLead(lead)                              void            (attachments first, then the existing delete)
 *   addLeadAttachment(userId, lead, file)         Lead            (document-assets: <userId>/leads/<leadId>/<file>)
 *   removeLeadAttachment(lead, path)              Lead
 *   leadAttachmentUrls(paths, seconds?)           { [path]: signedUrl }
 *   listAppointments({ from?, to?, leadId?, jobId?, clientId?, includeCancelled?, limit? })   Appointment[] | null
 *   createAppointment(userId, draft)              Appointment     (then: stageAfterAppointment(lead.stage) -> moveLeadStage)
 *   updateAppointment(id, patch)                  Appointment
 *   setAppointmentStatus(id, status)              Appointment     (done / no_show / scheduled)
 *   cancelAppointment(id)                         Appointment
 *   deleteAppointment(id)                         void
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isNetworkError } from '../crew/crewLogic.ts';
import {
    convertQuoteRequest, deleteQuoteRequest, setQuoteRequestStatus, type ConvertResult,
} from '../../components/requests/requestsApi.ts';
import { hasLeadErrors, leadFormToPatch, leadToConvertDraft, localYmd, stageAfterContact, statusForStage, validateLeadForm } from './leadLogic.ts';
import { validateAppointmentDraft } from './appointmentLogic.ts';
import {
    APPOINTMENT_COLUMNS, LEAD_COLUMNS, LEGACY_LEAD_COLUMNS, appointmentInsertRow, appointmentPatchRow, leadInsertRow, leadPatchRow,
    mapAppointmentRow, mapLeadRow,
} from './leadRows.ts';
import {
    LEAD_LIMITS,
    type Appointment, type AppointmentDraft, type AppointmentPatch, type AppointmentStatus, type Lead, type LeadAttachment,
    type LeadFormValues, type LeadPatch, type LeadStage,
} from './leadTypes.ts';

export type { ConvertResult };

/** Private bucket with owner-folder policies (20261112000300); lead files go to <userId>/leads/<leadId>/. */
export const LEAD_FILES_BUCKET = 'document-assets';

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

/** Thrown by lead-only writes while the database has no lead columns / appointments table. */
export class LeadsUnavailableError extends Error {
    constructor() {
        super('Leads are not switched on yet. Please try again later.');
        this.name = 'LeadsUnavailableError';
    }
}

/** Table, function or column missing (the migration is not applied). */
export const isLeadsBackendMissing = (e: DbError | unknown): boolean => {
    if (!e) return false;
    const err = e as { code?: string; message?: string; name?: string };
    if (err.name === 'LeadsUnavailableError' || err.name === 'FeatureUnavailableError') return true;
    if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205', 'PGRST200', 'PGRST106'].includes(String(err.code || ''))) return true;
    return /does not exist|could not find the .* (column|function|table)|could not find the (function|table)|schema cache/i.test(String(err.message || ''));
};

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

const writeError = (error: DbError | unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isLeadsBackendMissing(error)) return new LeadsUnavailableError();
    return new Error(errorText(error, fallback));
};

// ------------------------------------------------------------------------------------------------- probe
export async function probeLeadsBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const [leads, appts] = await Promise.all([
            supabase.from('quote_requests').select('id, stage').limit(1),
            supabase.from('appointments').select('id').limit(1),
        ]);
        if (!leads.error && !appts.error) return 'ready';
        if (isLeadsBackendMissing(leads.error) || isLeadsBackendMissing(appts.error)) return 'missing';
        return 'error';
    } catch {
        return 'error';
    }
}

// ------------------------------------------------------------------------------------------------- leads: reads
/** Newest first. Falls back to the old columns before the migration; null = no quote_requests table. */
export async function listLeads(opts: { includeArchived?: boolean; limit?: number } = {}): Promise<Lead[] | null> {
    const limit = Math.min(Math.max(1, opts.limit ?? 500), 2000);
    const run = (columns: string) => {
        let q = supabase.from('quote_requests').select(columns).order('created_at', { ascending: false }).limit(limit);
        if (!opts.includeArchived) q = q.neq('status', 'archived');
        return q;
    };
    let res = await run(LEAD_COLUMNS);
    if (res.error && isLeadsBackendMissing(res.error)) res = await run(LEGACY_LEAD_COLUMNS);
    if (res.error) {
        if (isLeadsBackendMissing(res.error)) return null;
        throw writeError(res.error, 'Your leads could not be loaded.');
    }
    return ((res.data as unknown as Record<string, unknown>[] | null) || []).map(mapLeadRow);
}

export async function getLead(id: string): Promise<Lead | null> {
    let res = await supabase.from('quote_requests').select(LEAD_COLUMNS).eq('id', id).maybeSingle();
    if (res.error && isLeadsBackendMissing(res.error)) res = await supabase.from('quote_requests').select(LEGACY_LEAD_COLUMNS).eq('id', id).maybeSingle();
    if (res.error) {
        if (isLeadsBackendMissing(res.error)) return null;
        throw writeError(res.error, 'The lead could not be loaded.');
    }
    return res.data ? mapLeadRow(res.data as unknown as Record<string, unknown>) : null;
}

// ------------------------------------------------------------------------------------------------ leads: writes
export async function createManualLead(userId: string, values: LeadFormValues): Promise<Lead> {
    ensureOnline();
    const errors = validateLeadForm(values);
    if (hasLeadErrors(errors)) throw new Error(Object.values(errors).find(Boolean) || 'Please check the form.');
    const row = leadInsertRow(userId, leadFormToPatch(values));
    const { data, error } = await supabase.from('quote_requests').insert(row).select(LEAD_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The lead could not be saved.');
    return mapLeadRow(data as unknown as Record<string, unknown>);
}

/** One UPDATE of granted columns (lead columns + the old status). */
async function writeLead(id: string, row: Record<string, unknown>): Promise<Lead> {
    ensureOnline();
    if (!Object.keys(row).length) {
        const lead = await getLead(id);
        if (!lead) throw new Error('This lead no longer exists.');
        return lead;
    }
    const { data, error } = await supabase.from('quote_requests').update(row).eq('id', id).select(LEAD_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The lead could not be saved.');
    return mapLeadRow(data as unknown as Record<string, unknown>);
}

export const updateLead = (id: string, patch: LeadPatch): Promise<Lead> => writeLead(id, leadPatchRow(patch));

/** Edit form -> update (origin never changes; Won only through convert / moveLeadStage). */
export async function updateLeadFromForm(lead: Lead, values: LeadFormValues): Promise<Lead> {
    const errors = validateLeadForm(values);
    if (hasLeadErrors(errors)) throw new Error(Object.values(errors).find(Boolean) || 'Please check the form.');
    const { origin: _origin, stage, ...rest } = leadFormToPatch(values);
    const updated = await updateLead(lead.id, rest);
    return stage && stage !== lead.stage ? moveLeadStage(updated, stage) : updated;
}

/**
 * Moves a lead to a stage and keeps the old status in step (statusForStage). Before the migration only 'new' and
 * 'lost' work (written as the old status 'seen'/'new' / 'archived').
 */
export async function moveLeadStage(lead: Lead, stage: LeadStage, opts: { lostReason?: string | null } = {}): Promise<Lead> {
    ensureOnline();
    if (lead.jobId || lead.status === 'converted') throw new Error('This lead is already a job.');
    const nextStatus = statusForStage(stage, lead.status);
    if (!lead.hasLeadColumns) {
        if (stage !== 'new' && stage !== 'lost') throw new LeadsUnavailableError();
        if (nextStatus) await setQuoteRequestStatus(lead.id, nextStatus);
        return { ...lead, status: nextStatus ?? lead.status, stage, archived: (nextStatus ?? lead.status) === 'archived' };
    }
    const patch: LeadPatch = { stage };
    if (stage === 'lost' && opts.lostReason !== undefined) patch.lostReason = opts.lostReason;
    return writeLead(lead.id, nextStatus ? { ...leadPatchRow(patch), status: nextStatus } : leadPatchRow(patch));
}

export const markLeadLost = (lead: Lead, reason: string): Promise<Lead> =>
    moveLeadStage(lead, 'lost', { lostReason: reason.trim().slice(0, LEAD_LIMITS.lostReason) || null });

export const reopenLead = (lead: Lead, stage: LeadStage = 'contacted'): Promise<Lead> =>
    moveLeadStage(lead, stage === 'lost' || stage === 'won' ? 'contacted' : stage);

export const setLeadFollowUp = (id: string, ymd: string | null): Promise<Lead> => updateLead(id, { followUpOn: ymd });

/** "I called / wrote them": last contact now (or `at`); a new lead moves to Contacted. */
export async function logLeadContact(lead: Lead, at: Date = new Date()): Promise<Lead> {
    if (!lead.hasLeadColumns) throw new LeadsUnavailableError();
    const updated = await updateLead(lead.id, { lastContactAt: at.toISOString() });
    const next = stageAfterContact(updated.stage);
    return next ? moveLeadStage(updated, next) : updated;
}

/** The existing one-tap convert (client matched or created + job). Defaults: job name from the lead, start today. */
export async function convertLead(lead: Lead, jobName?: string, startDate?: string): Promise<ConvertResult> {
    ensureOnline();
    const draft = leadToConvertDraft(lead, localYmd(new Date()));
    return convertQuoteRequest(lead.id, jobName ?? draft.jobName, startDate ?? draft.startDate);
}

/** Removes the lead's attachment files (best effort), then the lead (its request photos are cleaned up as before). */
export async function deleteLead(lead: Lead): Promise<void> {
    ensureOnline();
    const paths = lead.attachments.map(a => a.path);
    if (paths.length) await supabase.storage.from(LEAD_FILES_BUCKET).remove(paths);
    await deleteQuoteRequest(lead.id);
}

const safeFileName = (name: string): string => {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
    const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
    return `${base}-${Math.random().toString(36).slice(2, 8)}${ext ? `.${ext}` : ''}`;
};

/** Uploads a file (image or PDF, up to 15 MB, the bucket's rules) and adds it to the lead. */
export async function addLeadAttachment(userId: string, lead: Lead, file: File): Promise<Lead> {
    ensureOnline();
    if (!lead.hasLeadColumns) throw new LeadsUnavailableError();
    if (lead.attachments.length >= LEAD_LIMITS.attachments) throw new Error(`A lead can keep up to ${LEAD_LIMITS.attachments} files.`);
    if (file.size > LEAD_LIMITS.attachmentBytes) throw new Error('Files can be up to 15 MB.');
    const path = `${userId}/leads/${lead.id}/${safeFileName(file.name || 'file')}`;
    const { error } = await supabase.storage.from(LEAD_FILES_BUCKET).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream', cacheControl: '3600' });
    if (error) throw writeError(error, 'The file could not be uploaded (images and PDFs only).');
    const item: LeadAttachment = { path, name: (file.name || 'file').slice(0, 120), type: file.type || '', size: file.size, addedAt: new Date().toISOString() };
    try {
        return await updateLead(lead.id, { attachments: [...lead.attachments, item] });
    } catch (e) {
        await supabase.storage.from(LEAD_FILES_BUCKET).remove([path]);
        throw e;
    }
}

export async function removeLeadAttachment(lead: Lead, path: string): Promise<Lead> {
    ensureOnline();
    const updated = await updateLead(lead.id, { attachments: lead.attachments.filter(a => a.path !== path) });
    await supabase.storage.from(LEAD_FILES_BUCKET).remove([path]);
    return updated;
}

/** Signed URLs (default 1 hour); missing files are left out. */
export async function leadAttachmentUrls(paths: string[], seconds = 3600): Promise<Record<string, string>> {
    if (!paths.length) return {};
    const { data, error } = await supabase.storage.from(LEAD_FILES_BUCKET).createSignedUrls(paths, seconds);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const item of data as Array<{ path: string | null; signedUrl: string | null; error: string | null }>) {
        if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl;
    }
    return out;
}

// ------------------------------------------------------------------------------------------------ appointments
/** Soonest first. `from` / `to` are ISO times (or YYYY-MM-DD) on starts_at. null = table missing. */
export async function listAppointments(opts: {
    from?: string; to?: string; leadId?: string; jobId?: string; clientId?: string; includeCancelled?: boolean; limit?: number;
} = {}): Promise<Appointment[] | null> {
    let q = supabase.from('appointments').select(APPOINTMENT_COLUMNS);
    if (opts.from) q = q.gte('starts_at', opts.from);
    if (opts.to) q = q.lte('starts_at', opts.to);
    if (opts.leadId) q = q.eq('lead_id', opts.leadId);
    if (opts.jobId) q = q.eq('job_id', opts.jobId);
    if (opts.clientId) q = q.eq('client_id', opts.clientId);
    if (!opts.includeCancelled) q = q.neq('status', 'cancelled');
    const { data, error } = await q.order('starts_at', { ascending: true }).limit(Math.min(Math.max(1, opts.limit ?? 500), 2000));
    if (error) {
        if (isLeadsBackendMissing(error)) return null;
        throw writeError(error, 'Your appointments could not be loaded.');
    }
    return ((data as unknown as Record<string, unknown>[] | null) || []).map(mapAppointmentRow);
}

export async function createAppointment(userId: string, draft: AppointmentDraft): Promise<Appointment> {
    ensureOnline();
    const errors = validateAppointmentDraft(draft);
    const first = Object.values(errors).find(Boolean);
    if (first) throw new Error(first);
    const row = appointmentInsertRow(userId, draft);
    const { data, error } = await supabase.from('appointments').insert(row).select(APPOINTMENT_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The appointment could not be saved.');
    return mapAppointmentRow(data as unknown as Record<string, unknown>);
}

export async function updateAppointment(id: string, patch: AppointmentPatch): Promise<Appointment> {
    ensureOnline();
    const row = appointmentPatchRow(patch);
    const { data, error } = await supabase.from('appointments').update(row).eq('id', id).select(APPOINTMENT_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The appointment could not be saved.');
    return mapAppointmentRow(data as unknown as Record<string, unknown>);
}

export const setAppointmentStatus = (id: string, status: AppointmentStatus): Promise<Appointment> => updateAppointment(id, { status });

export const cancelAppointment = (id: string): Promise<Appointment> => updateAppointment(id, { status: 'cancelled' });

export async function deleteAppointment(id: string): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('appointments').delete().eq('id', id);
    if (error) throw writeError(error, 'The appointment could not be deleted.');
}
