/**
 * Leads + appointments: database rows <-> view-models (pure; tested by scripts/leads-check.ts).
 *
 *   LEAD_COLUMNS / LEGACY_LEAD_COLUMNS      select lists (with / without the 20261116000500 columns)
 *   mapLeadRow(row)                         quote_requests row -> Lead (old rows: hasLeadColumns = false)
 *   leadInsertRow(userId, patch & {origin}) insert row of a manual lead (only columns the owner may insert)
 *   leadPatchRow(patch)                     update row (only the columns granted to the owner)
 *   parseAttachments(json)                  LeadAttachment[] (bad entries dropped)
 *   APPOINTMENT_COLUMNS, mapAppointmentRow, appointmentInsertRow, appointmentPatchRow
 */
import { isLeadOrigin, isLeadStage, isYmd, stageFromRow } from './leadLogic.ts';
import {
    APPOINTMENT_KINDS, APPOINTMENT_STATUSES, LEAD_LIMITS,
    type Appointment, type AppointmentDraft, type AppointmentPatch, type Lead, type LeadAttachment, type LeadOrigin, type LeadPatch,
    type QuoteRequestStatus,
} from './leadTypes.ts';

export const LEGACY_LEAD_COLUMNS = 'id, name, phone, email, address, details, photo_paths, source, status, client_id, job_id, converted_at, created_at, updated_at';
export const LEAD_COLUMNS = `${LEGACY_LEAD_COLUMNS}, stage, lead_source, budget_min, budget_max, follow_up_on, lost_reason, notes, attachments, last_contact_at, stage_changed_at`;

const STATUSES: QuoteRequestStatus[] = ['new', 'seen', 'converted', 'archived'];
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const isoOrNull = (v: unknown): string | null => (v ? String(v) : null);

export const parseAttachments = (v: unknown): LeadAttachment[] => {
    let list: unknown = v;
    if (typeof v === 'string') { try { list = JSON.parse(v); } catch { list = []; } }
    if (!Array.isArray(list)) return [];
    const out: LeadAttachment[] = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        const path = str(r.path);
        if (!path) continue;
        out.push({
            path,
            name: str(r.name) || path.split('/').pop() || 'file',
            type: str(r.type),
            size: Math.max(0, Number(r.size) || 0),
            addedAt: str(r.added_at ?? r.addedAt),
        });
    }
    return out.slice(0, LEAD_LIMITS.attachments);
};

const attachmentsToJson = (list: readonly LeadAttachment[]) =>
    list.slice(0, LEAD_LIMITS.attachments).map(a => ({ path: a.path, name: a.name, type: a.type, size: a.size, added_at: a.addedAt }));

export const mapLeadRow = (r: Record<string, unknown> | null | undefined): Lead => {
    const row = r || {};
    const hasLeadColumns = 'stage' in row || 'lead_source' in row;
    const origin: LeadOrigin = isLeadOrigin(row.lead_source) ? row.lead_source : (row.source === 'manual' ? 'other' : 'request_page');
    const status: QuoteRequestStatus = STATUSES.includes(row.status as QuoteRequestStatus) ? (row.status as QuoteRequestStatus) : 'new';
    const follow = str(row.follow_up_on).slice(0, 10);
    return {
        id: str(row.id),
        name: str(row.name).trim() || 'Unnamed',
        phone: str(row.phone),
        email: str(row.email),
        address: str(row.address),
        details: str(row.details),
        photoPaths: Array.isArray(row.photo_paths) ? (row.photo_paths as unknown[]).filter((p): p is string => typeof p === 'string' && !!p) : [],
        source: str(row.source),
        origin,
        isManual: origin !== 'request_page',
        status,
        stage: stageFromRow(row),
        archived: status === 'archived',
        clientId: (row.client_id as string | null) ?? null,
        jobId: (row.job_id as string | null) ?? null,
        convertedAt: isoOrNull(row.converted_at),
        createdAt: str(row.created_at),
        updatedAt: isoOrNull(row.updated_at),
        budgetMin: num(row.budget_min),
        budgetMax: num(row.budget_max),
        followUpOn: isYmd(follow) ? follow : null,
        lostReason: str(row.lost_reason),
        notes: str(row.notes),
        attachments: parseAttachments(row.attachments),
        lastContactAt: isoOrNull(row.last_contact_at),
        stageChangedAt: isoOrNull(row.stage_changed_at),
        hasLeadColumns,
    };
};

/** Only the columns the migration grants for UPDATE (status goes through its own call). */
export const leadPatchRow = (p: LeadPatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (p.name !== undefined) row.name = p.name.trim().slice(0, LEAD_LIMITS.name);
    if (p.phone !== undefined) row.phone = p.phone?.trim() || null;
    if (p.email !== undefined) row.email = p.email?.trim().toLowerCase() || null;
    if (p.address !== undefined) row.address = p.address?.trim() || null;
    if (p.details !== undefined) row.details = p.details?.trim() || null;
    if (p.stage !== undefined && isLeadStage(p.stage)) row.stage = p.stage;
    if (p.budgetMin !== undefined) row.budget_min = p.budgetMin;
    if (p.budgetMax !== undefined) row.budget_max = p.budgetMax;
    if (p.followUpOn !== undefined) row.follow_up_on = p.followUpOn && isYmd(p.followUpOn) ? p.followUpOn : null;
    if (p.lostReason !== undefined) row.lost_reason = p.lostReason?.trim().slice(0, LEAD_LIMITS.lostReason) || null;
    if (p.notes !== undefined) row.notes = p.notes?.trim() || null;
    if (p.attachments !== undefined) row.attachments = attachmentsToJson(p.attachments);
    if (p.lastContactAt !== undefined) row.last_contact_at = p.lastContactAt;
    return row;
};

/**
 * Insert row of a lead added by hand: user_id + the granted columns only (the database refuses 'request_page' and
 * sets source = 'manual', status = 'seen' itself).
 */
export const leadInsertRow = (userId: string, p: LeadPatch & { origin: LeadOrigin }): Record<string, unknown> => {
    const origin: LeadOrigin = isLeadOrigin(p.origin) && p.origin !== 'request_page' ? p.origin : 'other';
    const row = leadPatchRow({ ...p, attachments: undefined });
    if (row.stage === 'won') row.stage = 'new';
    return { ...row, user_id: userId, lead_source: origin, name: str(p.name).trim().slice(0, LEAD_LIMITS.name) };
};

// ------------------------------------------------------------------------------------------------ appointments
export const APPOINTMENT_COLUMNS = 'id, lead_id, job_id, client_id, kind, title, notes, location, starts_at, ends_at, status, created_at, updated_at';

export const mapAppointmentRow = (r: Record<string, unknown> | null | undefined): Appointment => {
    const row = r || {};
    return {
        id: str(row.id),
        leadId: (row.lead_id as string | null) ?? null,
        jobId: (row.job_id as string | null) ?? null,
        clientId: (row.client_id as string | null) ?? null,
        kind: (APPOINTMENT_KINDS as readonly string[]).includes(str(row.kind)) ? (row.kind as Appointment['kind']) : 'other',
        title: str(row.title) || 'Appointment',
        notes: str(row.notes),
        location: str(row.location),
        startsAt: str(row.starts_at),
        endsAt: isoOrNull(row.ends_at),
        status: (APPOINTMENT_STATUSES as readonly string[]).includes(str(row.status)) ? (row.status as Appointment['status']) : 'scheduled',
        createdAt: str(row.created_at),
        updatedAt: isoOrNull(row.updated_at),
    };
};

const toIso = (v: string | null | undefined): string | null => {
    if (!v) return null;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export const appointmentPatchRow = (p: AppointmentPatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (p.leadId !== undefined) row.lead_id = p.leadId || null;
    if (p.jobId !== undefined) row.job_id = p.jobId || null;
    if (p.clientId !== undefined) row.client_id = p.clientId || null;
    if (p.kind !== undefined) row.kind = (APPOINTMENT_KINDS as readonly string[]).includes(p.kind) ? p.kind : 'other';
    if (p.title !== undefined) row.title = p.title.trim();
    if (p.notes !== undefined) row.notes = p.notes?.trim() || null;
    if (p.location !== undefined) row.location = p.location?.trim() || null;
    if (p.startsAt !== undefined) row.starts_at = toIso(p.startsAt);
    if (p.endsAt !== undefined) row.ends_at = toIso(p.endsAt);
    if (p.status !== undefined && (APPOINTMENT_STATUSES as readonly string[]).includes(p.status)) row.status = p.status;
    return row;
};

export const appointmentInsertRow = (userId: string, d: AppointmentDraft): Record<string, unknown> => ({
    ...appointmentPatchRow({ kind: 'site_visit', ...d }),
    user_id: userId,
    status: 'scheduled',
});
