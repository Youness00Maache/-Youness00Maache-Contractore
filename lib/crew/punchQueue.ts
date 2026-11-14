/**
 * The worker's offline queue (crew clock-in link). Every tap is stored on the phone FIRST, then sent; with no
 * connection it stays queued and is sent, in order, as soon as the phone is back online (or the page is opened again).
 *
 *  - One queue per link token (a shared phone never mixes two workers). Photos are kept next to it (IndexedDB).
 *  - Each punch carries a device key (clientId): the server saves it once even if it is sent twice
 *    (crew_punch is idempotent on member + client_id), so a send that timed out is simply sent again.
 *  - A punch the server refuses for a reason a retry can't fix (job removed, too old) is kept as "Not saved" with
 *    the reason until the worker dismisses it; nothing is dropped silently.
 *
 * The rules and the in-memory store are pure (scripts/crew-clock-check.ts); createBrowserCrewStore() is the
 * IndexedDB / localStorage store used by the page.
 */
import { CLIENT_ID_RE, isPunchKind, type LocationStatus, type Punch, type PunchKind } from './crewLogic.ts';

export type QueuedLocation = Exclude<LocationStatus, 'owner'>;
export type PhotoType = 'jpg' | 'png' | 'webp';

export interface QueuedPunch {
    clientId: string;
    jobId: string;
    kind: PunchKind;
    /** ISO time of the tap */
    at: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    location: QueuedLocation;
    note: string;
    photoType: PhotoType | null;
    /** pending = waiting to send; rejected = the account refused it (error says why) */
    status: 'pending' | 'rejected';
    attempts: number;
    error: string | null;
    /** the account has the punch; only its photo still has to go up */
    savedId: string | null;
    uploadPath: string | null;
    queuedAt: string;
}

export interface CrewDeviceStore {
    readonly kind: 'indexeddb' | 'local' | 'memory';
    readQueue(key: string): Promise<QueuedPunch[]>;
    writeQueue(key: string, items: QueuedPunch[]): Promise<void>;
    putPhoto(id: string, blob: Blob): Promise<void>;
    getPhoto(id: string): Promise<Blob | null>;
    deletePhoto(id: string): Promise<void>;
}

export type SendErrorKind = 'network' | 'rejected' | 'invalid_link' | 'paused' | 'rate_limit' | 'unavailable' | 'unknown';

export class CrewSendError extends Error {
    readonly kind: SendErrorKind;
    constructor(kind: SendErrorKind, message: string) {
        super(message);
        this.name = 'CrewSendError';
        this.kind = kind;
    }
}

export interface SendResult {
    id: string;
    uploadPath: string | null;
    duplicate: boolean;
}

export interface PunchSender {
    send(p: QueuedPunch): Promise<SendResult>;
    upload(path: string, blob: Blob): Promise<void>;
}

export interface SyncReport {
    sent: number;
    rejected: number;
    remaining: number;
    /** why sending stopped early (null = the queue was worked through) */
    stoppedBy: SendErrorKind | null;
    /** photos that could not be uploaded (the punch itself is saved) */
    photoFailed: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------------------------------
export const queueKey = (token: string): string => `crew.queue:${token}`;

const clean = (q: Partial<QueuedPunch> | null | undefined): QueuedPunch | null => {
    if (!q || typeof q !== 'object') return null;
    if (!CLIENT_ID_RE.test(String(q.clientId || '')) || !isPunchKind(q.kind) || (!q.jobId && q.kind === 'in')) return null;
    if (!Number.isFinite(new Date(String(q.at || '')).getTime())) return null;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
        clientId: String(q.clientId),
        jobId: String(q.jobId || ''),
        kind: q.kind,
        at: String(q.at),
        lat: n(q.lat),
        lng: n(q.lng),
        accuracy: n(q.accuracy),
        location: (['ok', 'denied', 'unavailable', 'timeout', 'skipped'] as const).includes(q.location as QueuedLocation) ? q.location as QueuedLocation : 'unavailable',
        note: typeof q.note === 'string' ? q.note : '',
        photoType: q.photoType === 'jpg' || q.photoType === 'png' || q.photoType === 'webp' ? q.photoType : null,
        status: q.status === 'rejected' ? 'rejected' : 'pending',
        attempts: Math.max(0, Number(q.attempts) || 0),
        error: typeof q.error === 'string' ? q.error : null,
        savedId: typeof q.savedId === 'string' && q.savedId ? q.savedId : null,
        uploadPath: typeof q.uploadPath === 'string' && q.uploadPath ? q.uploadPath : null,
        queuedAt: typeof q.queuedAt === 'string' ? q.queuedAt : String(q.at),
    };
};

/** A stored queue, cleaned (unknown / broken rows dropped, one row per device key). */
export const parseQueue = (raw: unknown): QueuedPunch[] => {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const out: QueuedPunch[] = [];
    for (const r of list) {
        const q = clean(r as Partial<QueuedPunch>);
        if (!q || seen.has(q.clientId)) continue;
        seen.add(q.clientId);
        out.push(q);
    }
    return out;
};

/** Adds a punch at the end (a second add of the same device key changes nothing). */
export const enqueuePunch = (items: readonly QueuedPunch[], p: QueuedPunch): QueuedPunch[] =>
    items.some(i => i.clientId === p.clientId) ? [...items] : [...items, p];

export const pendingCount = (items: readonly QueuedPunch[]): number => items.filter(i => i.status === 'pending').length;

/** Queued punches as punches (rejected ones are not part of the worker's state). */
export const queuedAsPunches = (items: readonly QueuedPunch[], memberId: string): Punch[] =>
    items.filter(i => i.status === 'pending').map(i => ({
        id: `local:${i.clientId}`, clientId: i.clientId, memberId, jobId: i.jobId, kind: i.kind, at: i.at,
        locationStatus: i.location, lat: i.lat, lng: i.lng, accuracyM: i.accuracy, note: i.note || null, hasPhoto: Boolean(i.photoType),
        source: 'crew', pending: true,
    }));

/**
 * The worker's punches: the account's, plus the ones still on the phone that the account doesn't have yet
 * (matched by device key). A punch whose clock-out has no job takes the job of the shift it closes.
 */
export const mergePunches = (server: readonly Punch[], items: readonly QueuedPunch[], memberId: string): Punch[] => {
    const known = new Set(server.map(p => p.clientId).filter(Boolean));
    return [...server, ...queuedAsPunches(items, memberId).filter(p => !known.has(p.clientId))];
};

// ---------------------------------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------------------------------
const running = new Map<string, Promise<SyncReport>>();

/**
 * Sends the queue in order. Stops at the first connection problem (the rest waits for the next try), at a dead or
 * paused link (nothing can go until the owner fixes it) and at a rate limit; a refused punch is marked "Not saved"
 * and the next one is tried. Only one run per queue at a time (a second call gets the running one).
 */
export function syncPunchQueue(store: CrewDeviceStore, key: string, sender: PunchSender): Promise<SyncReport> {
    const current = running.get(key);
    if (current) return current;
    const run = (async (): Promise<SyncReport> => {
        let items = parseQueue(await store.readQueue(key));
        const report: SyncReport = { sent: 0, rejected: 0, remaining: 0, stoppedBy: null, photoFailed: 0 };
        const save = async () => { await store.writeQueue(key, items); };
        for (const item of [...items]) {
            if (item.status !== 'pending') continue;
            let stop: SendErrorKind | null = null;
            try {
                if (!item.savedId) {
                    const res = await sender.send(item);
                    item.savedId = res.id;
                    item.uploadPath = res.uploadPath;
                    items = items.map(i => (i.clientId === item.clientId ? { ...item } : i));
                    await save();
                }
                if (item.photoType && item.uploadPath) {
                    const blob = await store.getPhoto(item.clientId);
                    if (blob) {
                        try {
                            await sender.upload(item.uploadPath, blob);
                        } catch (e) {
                            const kind = e instanceof CrewSendError ? e.kind : 'unknown';
                            if (kind === 'network') throw e;
                            // refused (already there, window closed): the punch is saved; the photo is let go
                            if (!/exists|duplicate/i.test(String((e as Error)?.message || ''))) report.photoFailed++;
                        }
                    }
                }
                items = items.filter(i => i.clientId !== item.clientId);
                await save();
                await store.deletePhoto(item.clientId).catch(() => undefined);
                report.sent++;
            } catch (e) {
                const err = e instanceof CrewSendError ? e : new CrewSendError('unknown', String((e as Error)?.message || e || 'Could not send.'));
                if (err.kind === 'rejected') {
                    items = items.map(i => (i.clientId === item.clientId ? { ...i, status: 'rejected', error: err.message, attempts: i.attempts + 1 } : i));
                    report.rejected++;
                    await save();
                    continue;
                }
                items = items.map(i => (i.clientId === item.clientId ? { ...i, attempts: i.attempts + 1, error: err.message } : i));
                await save();
                stop = err.kind;
            }
            if (stop) { report.stoppedBy = stop; break; }
        }
        report.remaining = pendingCount(items);
        return report;
    })().finally(() => { running.delete(key); });
    running.set(key, run);
    return run;
}

/** Removes a "Not saved" punch the worker has read (and its photo). */
export async function dismissRejected(store: CrewDeviceStore, key: string, clientId: string): Promise<QueuedPunch[]> {
    const items = parseQueue(await store.readQueue(key)).filter(i => !(i.clientId === clientId && i.status === 'rejected'));
    await store.writeQueue(key, items);
    await store.deletePhoto(clientId).catch(() => undefined);
    return items;
}

// ---------------------------------------------------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------------------------------------------------
export function createMemoryCrewStore(): CrewDeviceStore & { failNextWrite?: boolean } {
    const queues = new Map<string, string>();
    const photos = new Map<string, Blob>();
    const store: CrewDeviceStore & { failNextWrite?: boolean } = {
        kind: 'memory',
        failNextWrite: false,
        async readQueue(key) { return parseQueue(JSON.parse(queues.get(key) || '[]')); },
        async writeQueue(key, items) {
            if (store.failNextWrite) { store.failNextWrite = false; throw new Error('QuotaExceededError'); }
            queues.set(key, JSON.stringify(items));
        },
        async putPhoto(id, blob) { photos.set(id, blob); },
        async getPhoto(id) { return photos.get(id) ?? null; },
        async deletePhoto(id) { photos.delete(id); },
    };
    return store;
}

const DB_NAME = 'contractordocs_crew';
const DB_STORE = 'kv';

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
});

const idb = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> => {
    const db = await openDb();
    try {
        return await new Promise<T | undefined>((resolve, reject) => {
            const tx = db.transaction(DB_STORE, mode);
            const req = fn(tx.objectStore(DB_STORE));
            tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
};

/** IndexedDB (queue + photos); localStorage for the queue when IndexedDB is missing or blocked (photos then wait in memory). */
export function createBrowserCrewStore(): CrewDeviceStore {
    const hasIdb = typeof indexedDB !== 'undefined';
    const memoryPhotos = new Map<string, Blob>();
    const local = {
        read(key: string): QueuedPunch[] {
            try { return parseQueue(JSON.parse(localStorage.getItem(`cd.${key}`) || '[]')); } catch { return []; }
        },
        write(key: string, items: QueuedPunch[]) {
            try { localStorage.setItem(`cd.${key}`, JSON.stringify(items)); } catch { /* storage full / blocked */ }
        },
    };
    return {
        kind: hasIdb ? 'indexeddb' : 'local',
        async readQueue(key) {
            if (hasIdb) {
                try {
                    const v = await idb<unknown>('readonly', s => s.get(`queue:${key}`));
                    const items = parseQueue(v);
                    // a copy written while IndexedDB was unavailable is merged in once
                    const fallback = local.read(key);
                    return fallback.length ? parseQueue([...items, ...fallback]) : items;
                } catch { /* fall back */ }
            }
            return local.read(key);
        },
        async writeQueue(key, items) {
            if (hasIdb) {
                try {
                    await idb('readwrite', s => s.put(items, `queue:${key}`));
                    try { localStorage.removeItem(`cd.${key}`); } catch { /* ignore */ }
                    return;
                } catch { /* fall back */ }
            }
            local.write(key, items);
        },
        async putPhoto(id, blob) {
            if (hasIdb) {
                try { await idb('readwrite', s => s.put(blob, `photo:${id}`)); return; } catch { /* fall back */ }
            }
            memoryPhotos.set(id, blob);
        },
        async getPhoto(id) {
            if (memoryPhotos.has(id)) return memoryPhotos.get(id) ?? null;
            if (!hasIdb) return null;
            try { return ((await idb<Blob>('readonly', s => s.get(`photo:${id}`))) ?? null) as Blob | null; } catch { return null; }
        },
        async deletePhoto(id) {
            memoryPhotos.delete(id);
            if (!hasIdb) return;
            try { await idb('readwrite', s => s.delete(`photo:${id}`)); } catch { /* ignore */ }
        },
    };
}
