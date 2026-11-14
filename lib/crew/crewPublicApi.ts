/**
 * The worker side of crew clock-in (no login): the two public RPCs of the signed link and the photo upload.
 * Errors come back as CrewSendError kinds the page and the offline queue understand (lib/crew/punchQueue.ts).
 */
import { supabase } from '../supabase.ts';
import { classifyCrewError, mapPortal, type WorkerPortal } from './crewLogic.ts';
import { CrewSendError, type PunchSender, type QueuedPunch, type SendResult } from './punchQueue.ts';

export const CREW_PHOTOS_BUCKET = 'crew-photos';

const asObject = (data: unknown): Record<string, any> => {
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, any>;
    if (typeof data === 'string') {
        try { const v = JSON.parse(data); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
    }
    return {};
};

const toSendError = (error: unknown): CrewSendError => {
    if (error instanceof CrewSendError) return error;
    const c = classifyCrewError(error as any);
    const kind = c.kind === 'premium' ? 'paused' : c.kind;
    return new CrewSendError(kind, c.message);
};

/** What the link shows. Throws CrewSendError ('invalid_link', 'network', 'rate_limit', 'unavailable', …). */
export async function fetchWorkerPortal(token: string): Promise<WorkerPortal> {
    let res;
    try {
        res = await supabase.rpc('crew_portal_get', { p_token: token });
    } catch (e) {
        throw toSendError(e);
    }
    if (res.error) throw toSendError(res.error);
    const r = asObject(res.data);
    if (r.error === 'invalid_link') throw new CrewSendError('invalid_link', 'This clock-in link is not valid anymore. Ask your boss for a new one.');
    return mapPortal(r);
}

/** Sends one queued punch (idempotent on its device key). */
export async function sendPunch(token: string, p: QueuedPunch): Promise<SendResult> {
    let res;
    try {
        res = await supabase.rpc('crew_punch', {
            p_token: token,
            p_job_id: p.jobId || null,
            p_kind: p.kind,
            p_at: p.at,
            p_lat: p.lat,
            p_lng: p.lng,
            p_accuracy: p.accuracy,
            p_note: p.note.trim() || null,
            p_client_id: p.clientId,
            p_location: p.location,
            p_photo_type: p.photoType,
        });
    } catch (e) {
        throw toSendError(e);
    }
    if (res.error) throw toSendError(res.error);
    const r = asObject(res.data);
    if (r.error === 'invalid_link') throw new CrewSendError('invalid_link', 'This clock-in link is not valid anymore. Ask your boss for a new one.');
    if (r.error === 'paused') throw new CrewSendError('paused', 'Clock-in is paused for this company right now. Your punches are kept on this phone.');
    const punch = asObject(r.punch);
    if (!punch.id) throw new CrewSendError('unknown', 'The punch could not be confirmed. It will be sent again.');
    return { id: String(punch.id), uploadPath: r.upload_path ? String(r.upload_path) : null, duplicate: r.duplicate === true };
}

export async function uploadPunchPhoto(path: string, blob: Blob): Promise<void> {
    let res;
    try {
        res = await supabase.storage.from(CREW_PHOTOS_BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || 'image/jpeg' });
    } catch (e) {
        throw toSendError(e);
    }
    if (res.error) {
        const msg = String(res.error.message || '');
        if (/exists|duplicate/i.test(msg)) throw new CrewSendError('rejected', 'already exists');
        throw toSendError(res.error);
    }
}

export const workerSender = (token: string): PunchSender => ({
    send: p => sendPunch(token, p),
    upload: (path, blob) => uploadPunchPhoto(path, blob),
});
