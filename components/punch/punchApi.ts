/**
 * Punch lists: Supabase calls, the device copy (shown offline) and the offline outbox.
 *  - Reads return null while migration 20261115000200 is not applied (the feature stays hidden).
 *  - Saves go through the offline outbox (entity 'punch_item', lib/offline) when the device is offline, when the item
 *    is still waiting there, or when the connection drops during the save: adding, checking off, editing and status
 *    changes work offline and sync later. Deleting and photos need a connection.
 */
import { supabase } from '../../lib/supabase.ts';
import { browserStore } from '../../lib/userData.ts';
import { offlineEntityQueue, offlineEntityQueueFor } from '../../lib/offline/offlineEntities.ts';
import { isNetworkError } from '../../lib/offline/outboxModel.ts';
import { isMissingBackendError } from '../requests/requestLogic.ts';
import { PUNCH_COLUMNS, mapPunchRow, progressByJob, punchRowOf, type PunchItem, type PunchProgress } from '../../lib/punchList.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';

export { PUNCH_SYNCED_EVENT } from '../../lib/punchList.ts';

const cacheKey = (userId: string, jobId: string) => `cd.punch:${userId}:${jobId}`;

const readCache = (userId: string, jobId: string): { items: PunchItem[]; shared: boolean } | null => {
    try {
        const raw = browserStore.getItem(cacheKey(userId, jobId));
        if (!raw) return null;
        const v = JSON.parse(raw);
        return { items: Array.isArray(v?.items) ? v.items.map(mapPunchRow) : [], shared: v?.shared === true };
    } catch {
        return null;
    }
};

const writeCache = (userId: string, jobId: string, items: PunchItem[], shared: boolean) => {
    try {
        const rows = items.map(i => ({ ...punchRowOf(i, userId), created_at: i.createdAt, updated_at: i.updatedAt, client_note: i.clientNote || null, client_note_at: i.clientNoteAt }));
        browserStore.setItem(cacheKey(userId, jobId), JSON.stringify({ items: rows, shared }));
    } catch { /* storage full / blocked */ }
};

export interface PunchListData {
    items: PunchItem[];
    shared: boolean;
    /** read from this device (no connection) */
    fromDevice: boolean;
}

/** The job's punch list. null = the feature isn't in the database yet. */
export const loadPunchList = async (userId: string, jobId: string): Promise<PunchListData | null> => {
    const cached = readCache(userId, jobId);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { items: cached?.items || [], shared: cached?.shared || false, fromDevice: true };
    const [itemsRes, listRes] = await Promise.all([
        supabase.from('punch_items').select(PUNCH_COLUMNS).eq('job_id', jobId).order('position', { ascending: true }).order('created_at', { ascending: true }).limit(500),
        supabase.from('punch_lists').select('shared_in_portal').eq('job_id', jobId).maybeSingle(),
    ]);
    if (itemsRes.error) {
        if (isMissingBackendError(itemsRes.error)) return null;
        if (isNetworkError(itemsRes.error)) return { items: cached?.items || [], shared: cached?.shared || false, fromDevice: true };
        throw itemsRes.error;
    }
    const items = (itemsRes.data || []).map(mapPunchRow);
    const shared = !listRes.error && Boolean((listRes.data as { shared_in_portal?: boolean } | null)?.shared_in_portal);
    writeCache(userId, jobId, items, shared);
    return { items, shared, fromDevice: false };
};

/** Keeps the device copy in step with what the screen shows (offline edits included). */
export const rememberPunchList = (userId: string, jobId: string, items: PunchItem[], shared: boolean) => writeCache(userId, jobId, items, shared);

/**
 * Saves an item: 'create' inserts it, 'edit' writes `patch` (or the whole row). Returns 'outbox' when it was kept on
 * this device to sync later, 'account' when it is saved.
 */
export const savePunchItem = async (userId: string, item: PunchItem, kind: 'create' | 'edit', patch?: Record<string, unknown>): Promise<'account' | 'outbox'> => {
    const full = punchRowOf(item, userId);
    const row = kind === 'create' ? full : { ...(patch || full), id: item.id, job_id: item.jobId, title: full.title };
    const queue = offlineEntityQueueFor(item.id);
    if (queue) {
        await queue.queue('punch_item', kind, item.id, row);
        return 'outbox';
    }
    const res = kind === 'create'
        ? await supabase.from('punch_items').insert(row)
        : await supabase.from('punch_items').update((() => { const { id: _id, job_id: _job, ...rest } = row; return rest; })()).eq('id', item.id);
    if (res.error) {
        // the connection dropped half way: keep it on the device
        const fallback = isNetworkError(res.error) ? offlineEntityQueue() : null;
        if (fallback) {
            await fallback.queue('punch_item', kind, item.id, row);
            return 'outbox';
        }
        throw res.error;
    }
    return 'account';
};

export const deletePunchItems = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(NEEDS_CONNECTION);
    const { error } = await supabase.from('punch_items').delete().in('id', ids);
    if (error) throw error;
};

export const setPunchShared = async (userId: string, jobId: string, shared: boolean): Promise<void> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(NEEDS_CONNECTION);
    const { error } = await supabase.from('punch_lists').upsert({ job_id: jobId, user_id: userId, shared_in_portal: shared }, { onConflict: 'job_id' });
    if (error) throw error;
};

/**
 * Progress of every job (job page tab, pipeline cards). available: true = the feature is in the database, false = not
 * yet (migration not applied: the punch list stays hidden), null = couldn't tell (offline / error).
 */
export const fetchPunchProgress = async (today: string): Promise<{ available: boolean | null; map: Map<string, PunchProgress> }> => {
    const { data, error } = await supabase.from('punch_items').select('job_id, status, due_on, client_note').limit(5000);
    if (error) return { available: isMissingBackendError(error) ? false : null, map: new Map() };
    return { available: true, map: progressByJob((data || []) as Array<{ job_id: string; status: string; due_on: string | null; client_note: string | null }>, today) };
};

const AVAILABLE_KEY = 'cd.punch.available';
/** Last known answer of fetchPunchProgress (so the tab shows offline too). */
export const punchKnownAvailable = (): boolean => { try { return browserStore.getItem(AVAILABLE_KEY) === '1'; } catch { return false; } };
export const rememberPunchAvailable = (available: boolean) => { try { browserStore.setItem(AVAILABLE_KEY, available ? '1' : '0'); } catch { /* ignore */ } };

/** Items the client answered in the portal recently (notification bell). */
export const fetchPunchFeedback = async (sinceIso: string): Promise<Array<{ id: string; jobId: string; title: string; status: string; verifiedBy: string | null; verifiedAt: string | null; clientNote: string; clientNoteAt: string | null }> | null> => {
    const { data, error } = await supabase
        .from('punch_items')
        .select('id, job_id, title, status, verified_by, verified_at, client_note, client_note_at')
        .or(`and(verified_by.eq.client,verified_at.gte.${sinceIso}),client_note_at.gte.${sinceIso}`)
        .order('updated_at', { ascending: false })
        .limit(100);
    if (error) return null;
    return ((data || []) as any[]).map(r => ({
        id: String(r.id), jobId: String(r.job_id || ''), title: String(r.title || ''), status: String(r.status || ''),
        verifiedBy: r.verified_by ?? null, verifiedAt: r.verified_at ?? null, clientNote: String(r.client_note || ''), clientNoteAt: r.client_note_at ?? null,
    }));
};
