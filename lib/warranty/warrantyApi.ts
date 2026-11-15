/**
 * Warranty tracking, database side. NO new write path: warranty data lives in documents.data and is written by the
 * normal document save (lib/documentSave.ts upsertDocumentRecord, already in lib/offline/writePathAudit.ts).
 *
 *   Inside the Warranty form: keep the tracking in the form state with withWarrantyTracking(data, tracking) and let
 *   the form's own Save write it (offline outbox included). Nothing here is needed.
 *   Outside the form (a claims panel on the job, the warranties list): updateWarrantyTracking() reads the current
 *   document, applies the change and saves it through the same upsert. Needs a connection.
 */
import { supabase } from '../supabase.ts';
import { fetchDocumentForSync, upsertDocumentRecord } from '../documentSave.ts';
import { isFailure, readWarrantyTracking, warrantyOverview, withWarrantyTracking, type WarrantyOverview } from './warrantyLogic.ts';
import type { TrackingResult, WarrantyTracking } from './types.ts';

export interface WarrantyListItem {
    id: string;
    jobId: string | null;
    clientId: string | null;
    createdAt: string | null;
    number: string;
    clientName: string;
    overview: WarrantyOverview;
}

type Row = { id: string; job_id?: string | null; client_id?: string | null; created_at?: string | null; data?: Record<string, unknown> | null };

const toItem = (r: Row, today: string): WarrantyListItem => {
    const data = r.data && typeof r.data === 'object' ? r.data : {};
    return {
        id: r.id,
        jobId: r.job_id ?? null,
        clientId: r.client_id ?? null,
        createdAt: r.created_at ?? null,
        number: String(data.warrantyNumber ?? ''),
        clientName: String(data.clientName ?? ''),
        overview: warrantyOverview(data, today, { createdAt: r.created_at ?? null }),
    };
};

/**
 * The account's warranties (or one job's), with status and claims, soonest end first (no end date last).
 * `today` = the user's local day (YYYY-MM-DD). Throws the database error when it can't be read.
 */
export async function loadWarranties(today: string, opts: { jobId?: string; limit?: number } = {}): Promise<WarrantyListItem[]> {
    let q = supabase.from('documents').select('id, job_id, client_id, created_at, data').eq('type', 'Warranty');
    if (opts.jobId) q = q.eq('job_id', opts.jobId);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(Math.min(Math.max(opts.limit ?? 500, 1), 2000));
    if (error) throw error;
    return ((data as Row[] | null) ?? [])
        .map((r) => toItem(r, today))
        .sort((a, b) => {
            const ea = a.overview.expiresOn ?? '9999-12-31';
            const eb = b.overview.expiresOn ?? '9999-12-31';
            return ea < eb ? -1 : ea > eb ? 1 : 0;
        });
}

export type UpdateWarrantyResult =
    | { ok: true; tracking: WarrantyTracking; data: Record<string, unknown> }
    | { ok: false; reason: 'offline' | 'not_found' | 'not_warranty' | 'invalid' | 'error'; message: string; field?: string };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Reads the warranty, applies `change` to its tracking (return a TrackingResult from addClaim / moveClaim / setTerm…,
 * or the new tracking) and saves the whole data through the normal document upsert. Other fields are untouched.
 */
export async function updateWarrantyTracking(
    documentId: string,
    change: (tracking: WarrantyTracking, data: Record<string, unknown>) => TrackingResult | WarrantyTracking,
): Promise<UpdateWarrantyResult> {
    if (offline()) return { ok: false, reason: 'offline', message: "You're offline. Open the warranty to change it offline, or try again when you're back online." };
    try {
        const { data: row, error } = await supabase.from('documents').select('id, user_id, job_id, type').eq('id', documentId).maybeSingle();
        if (error) return { ok: false, reason: 'error', message: String(error.message || 'The warranty could not be read.') };
        if (!row) return { ok: false, reason: 'not_found', message: 'This warranty is not there any more.' };
        if (row.type !== 'Warranty') return { ok: false, reason: 'not_warranty', message: 'This document is not a warranty.' };
        const current = await fetchDocumentForSync(documentId);
        if (!current) return { ok: false, reason: 'not_found', message: 'This warranty is not there any more.' };
        const result = change(readWarrantyTracking(current.data), current.data);
        let tracking: WarrantyTracking;
        if ('ok' in result) {
            if (isFailure(result)) return { ok: false, reason: 'invalid', message: result.message, field: result.field };
            tracking = (result as { tracking: WarrantyTracking }).tracking;
        } else {
            tracking = result;
        }
        const next = withWarrantyTracking(current.data, tracking);
        const { error: saveError } = await upsertDocumentRecord({ id: row.id, user_id: row.user_id, job_id: row.job_id, type: row.type, data: next });
        if (saveError) return { ok: false, reason: 'error', message: String(saveError.message || 'The warranty could not be saved.') };
        return { ok: true, tracking: readWarrantyTracking(next), data: next };
    } catch (e) {
        return { ok: false, reason: 'error', message: (e as Error)?.message || 'The warranty could not be saved.' };
    }
}
