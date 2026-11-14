/**
 * Last copy of the lists the screens show (inventory, price book, clients, calendar, pipeline, reminders, job photos
 * …), per user, in the read cache (utils/db.ts `lists`; wiped at logout like the rest of that cache). Every screen
 * opens offline (also after a reload) with the last known data; the screens put the outbox items on top.
 *
 * Online nothing changes: the screen loads from the account as before and the copy is refreshed in the background.
 */
import { dbApi } from '../../utils/db.ts';
import { isNetworkError } from './outboxModel.ts';

let cacheUser: string | null = null;

/** Where copies live: the read cache (tests pass an in-memory one). */
export interface DeviceCacheBackend {
    get(store: string, key: string): Promise<any>;
    put(store: string, row: any): Promise<void>;
    getAll(store: string): Promise<any[]>;
    delete(store: string, key: string): Promise<void>;
}
let backend: DeviceCacheBackend = dbApi;
export const setDeviceCacheBackend = (next: DeviceCacheBackend | null): void => { backend = next || dbApi; };

/** Set by the app when the signed-in user changes (null: nothing is read or written). */
export const setDeviceCacheUser = (userId: string | null): void => { cacheUser = userId; };
export const deviceCacheUser = (): string | null => cacheUser;

export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/** A request that failed because there is no connection (the browser is offline, or it never reached the account). */
export const isOfflineFailure = (error: unknown): boolean => isOffline() || isNetworkError(error);

/** The one message for an action that can't work without a connection. */
export { NEEDS_CONNECTION } from './connection.ts';

/** A list that was never loaded on this device. */
export const NO_DEVICE_COPY = "You're offline and this list isn't saved on this device yet. It shows once you're back online.";

/** Rows kept per list (the screens page through more online). */
export const LIST_COPY_MAX_ROWS = 3000;

export interface ListCopy<T> {
    rows: T[];
    savedAt: string;
}

const key = (userId: string, name: string) => `${userId}:${name}`;

/** Keeps the last copy of a list (best effort: the cache is optional). */
export async function saveListCopy<T>(name: string, rows: readonly T[], userId: string | null = cacheUser): Promise<void> {
    if (!userId || !Array.isArray(rows)) return;
    try {
        await backend.put('lists', { id: key(userId, name), userId, name, rows: rows.slice(0, LIST_COPY_MAX_ROWS), savedAt: new Date().toISOString() });
    } catch { /* optional */ }
}

export async function readListCopy<T>(name: string, userId: string | null = cacheUser): Promise<ListCopy<T> | null> {
    if (!userId) return null;
    try {
        const row = await backend.get('lists', key(userId, name));
        if (!row || row.userId !== userId || !Array.isArray(row.rows)) return null;
        return { rows: row.rows as T[], savedAt: String(row.savedAt || '') };
    } catch {
        return null;
    }
}

export interface DeviceCopyResult<T> {
    rows: T[];
    error: unknown;
    /** the rows are the device copy (offline) */
    fromDevice: boolean;
    savedAt?: string;
}

/**
 * Online: `load()` as before, and the copy is refreshed. Offline (or the request never reached the account): the device
 * copy, with no error; without a copy, NO_DEVICE_COPY. Other errors are returned as they are.
 */
export async function loadWithDeviceCopy<T>(name: string, load: () => Promise<{ rows: T[]; error: unknown }>): Promise<DeviceCopyResult<T>> {
    const fromCopy = async (): Promise<DeviceCopyResult<T>> => {
        const copy = await readListCopy<T>(name);
        return copy
            ? { rows: copy.rows, error: null, fromDevice: true, savedAt: copy.savedAt }
            : { rows: [], error: new Error(NO_DEVICE_COPY), fromDevice: true };
    };
    if (isOffline()) return fromCopy();
    let res: { rows: T[]; error: unknown };
    try {
        res = await load();
    } catch (error) {
        res = { rows: [], error };
    }
    if (!res.error) {
        void saveListCopy(name, res.rows);
        return { rows: res.rows, error: null, fromDevice: false };
    }
    if (isOfflineFailure(res.error)) return fromCopy();
    return { rows: res.rows, error: res.error, fromDevice: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// Job photo previews (so the Photos tab shows pictures offline, not just empty tiles)
// ---------------------------------------------------------------------------------------------------------------------

export const PHOTO_THUMB_MAX = 400;
let thumbWrites = 0;

export async function savePhotoThumb(path: string, blob: Blob, userId: string | null = cacheUser): Promise<void> {
    if (!userId || !path || !blob || blob.size > 512 * 1024) return;
    try {
        await backend.put('photo_thumbs', { id: key(userId, path), userId, path, blob, savedAt: new Date().toISOString() });
        thumbWrites += 1;
        if (thumbWrites % 40 === 0) {
            // keep the newest PHOTO_THUMB_MAX of this user
            const all = (await backend.getAll('photo_thumbs')).filter(r => r?.userId === userId);
            if (all.length > PHOTO_THUMB_MAX) {
                all.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
                for (const old of all.slice(PHOTO_THUMB_MAX)) await backend.delete('photo_thumbs', old.id);
            }
        }
    } catch { /* optional */ }
}

/** Saved previews of these storage paths (path → blob). */
export async function readPhotoThumbs(paths: readonly string[], userId: string | null = cacheUser): Promise<Record<string, Blob>> {
    const out: Record<string, Blob> = {};
    if (!userId) return out;
    for (const path of paths) {
        try {
            const row = await backend.get('photo_thumbs', key(userId, path));
            if (row?.blob && row.userId === userId) out[path] = row.blob as Blob;
        } catch { /* skip */ }
    }
    return out;
}

export async function hasPhotoThumb(path: string, userId: string | null = cacheUser): Promise<boolean> {
    if (!userId) return false;
    try { return Boolean(await backend.get('photo_thumbs', key(userId, path))); } catch { return false; }
}
