/**
 * Where the offline outbox lives: its OWN IndexedDB database (`contractordocs_outbox`), separate from the read-only
 * cache in utils/db.ts. The cache is wiped freely (logout, account switch); the outbox holds work that exists nowhere
 * else, so it is only cleared on purpose (logout after the warning, account deletion).
 *
 * Every row carries `userId` and every read filters by it: a shared device never mixes accounts.
 * `createMemoryOutboxStore()` is the same API in memory (tests, and browsers without IndexedDB).
 */
import type { OfflinePhoto, OutboxHistoryEntry, OutboxItem } from './outboxModel.ts';

/**
 * Files that belong to an outbox item (a job photo taken offline: the compressed photo and its preview). Kept next to
 * the item (same id) until it syncs or is discarded.
 */
export interface OutboxBlobs {
    /** the outbox item id (`${userId}:${docId}`) */
    id: string;
    userId: string;
    files: Record<string, Blob>;
    /** total size of the files, in bytes */
    bytes: number;
    createdAt: string;
}

export interface OutboxStore {
    /** 'indexeddb' persists across reloads; 'memory' only lives as long as the page */
    readonly kind: 'indexeddb' | 'memory';
    getItems(userId: string): Promise<OutboxItem[]>;
    getItem(id: string): Promise<OutboxItem | null>;
    putItem(item: OutboxItem): Promise<void>;
    /** Atomic read-modify-write: `fn` returns the new item, the same one (no change) or null (delete). */
    updateItem(id: string, fn: (current: OutboxItem | null) => OutboxItem | null): Promise<OutboxItem | null>;
    deleteItem(id: string): Promise<void>;
    getHistory(userId: string): Promise<OutboxHistoryEntry[]>;
    putHistory(entry: OutboxHistoryEntry): Promise<void>;
    deleteHistory(id: string): Promise<void>;
    getPhotos(userId: string): Promise<OfflinePhoto[]>;
    putPhoto(photo: OfflinePhoto): Promise<void>;
    deletePhotos(ids: string[]): Promise<void>;
    /** Files of an outbox item (job photos taken offline). */
    putBlobs(entry: OutboxBlobs): Promise<void>;
    getBlobs(id: string): Promise<OutboxBlobs | null>;
    deleteBlobs(ids: string[]): Promise<void>;
    /** This user's stored files without their content (ids and sizes: device room, clean-up). */
    listBlobs(userId: string): Promise<Array<{ id: string; bytes: number; createdAt: string }>>;
    /** Removes everything of this user (items, history, photo registry, files). */
    clearUser(userId: string): Promise<void>;
}

const clone = <T,>(v: T): T => {
    if (v === null || v === undefined) return v;
    try {
        if (typeof structuredClone === 'function') return structuredClone(v);
    } catch { /* fall through */ }
    return JSON.parse(JSON.stringify(v)) as T;
};

// ---------------------------------------------------------------------------------------------------------------------
// In memory
// ---------------------------------------------------------------------------------------------------------------------

export function createMemoryOutboxStore(): OutboxStore & { failNextWrite?: boolean } {
    const items = new Map<string, OutboxItem>();
    const history = new Map<string, OutboxHistoryEntry>();
    const photos = new Map<string, OfflinePhoto>();
    // Blobs are kept as they are (not cloned: they are immutable)
    const blobs = new Map<string, OutboxBlobs>();
    const store: OutboxStore & { failNextWrite?: boolean } = {
        kind: 'memory',
        failNextWrite: false,
        async getItems(userId) { return Array.from(items.values()).filter(i => i.userId === userId).map(clone); },
        async getItem(id) { return clone(items.get(id) ?? null); },
        async putItem(item) {
            if (store.failNextWrite) { store.failNextWrite = false; throw new Error('QuotaExceededError'); }
            items.set(item.id, clone(item));
        },
        async updateItem(id, fn) {
            if (store.failNextWrite) { store.failNextWrite = false; throw new Error('QuotaExceededError'); }
            const current = clone(items.get(id) ?? null);
            const next = fn(current);
            if (next === null) items.delete(id);
            else if (next !== current) items.set(id, clone(next));
            return clone(next);
        },
        async deleteItem(id) { items.delete(id); },
        async getHistory(userId) { return Array.from(history.values()).filter(h => h.userId === userId).map(clone); },
        async putHistory(entry) { history.set(entry.id, clone(entry)); },
        async deleteHistory(id) { history.delete(id); },
        async getPhotos(userId) { return Array.from(photos.values()).filter(p => p.userId === userId).map(clone); },
        async putPhoto(photo) { photos.set(photo.id, clone(photo)); },
        async deletePhotos(ids) { ids.forEach(id => photos.delete(id)); },
        async putBlobs(entry) {
            if (store.failNextWrite) { store.failNextWrite = false; throw new Error('QuotaExceededError'); }
            blobs.set(entry.id, { ...entry, files: { ...entry.files } });
        },
        async getBlobs(id) { const b = blobs.get(id); return b ? { ...b, files: { ...b.files } } : null; },
        async deleteBlobs(ids) { ids.forEach(id => blobs.delete(id)); },
        async listBlobs(userId) {
            return Array.from(blobs.values()).filter(b => b.userId === userId).map(b => ({ id: b.id, bytes: b.bytes, createdAt: b.createdAt }));
        },
        async clearUser(userId) {
            for (const [k, v] of items) if (v.userId === userId) items.delete(k);
            for (const [k, v] of history) if (v.userId === userId) history.delete(k);
            for (const [k, v] of photos) if (v.userId === userId) photos.delete(k);
            for (const [k, v] of blobs) if (v.userId === userId) blobs.delete(k);
        },
    };
    return store;
}

// ---------------------------------------------------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------------------------------------------------

export const OUTBOX_DB_NAME = 'contractordocs_outbox';
/** 2: + `blobs` (job photos taken offline) */
const OUTBOX_DB_VERSION = 2;
const ITEMS = 'items';
const HISTORY = 'history';
const PHOTOS = 'photos';
const BLOBS = 'blobs';
const ALL_STORES = [ITEMS, HISTORY, PHOTOS, BLOBS];

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
        request.onerror = () => { dbPromise = null; reject(request.error || new Error('Could not open the offline outbox')); };
        request.onblocked = () => { dbPromise = null; reject(new Error('The offline outbox is blocked by another open tab')); };
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const name of ALL_STORES) {
                if (!db.objectStoreNames.contains(name)) {
                    const os = db.createObjectStore(name, { keyPath: 'id' });
                    os.createIndex('userId', 'userId', { unique: false });
                }
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => { db.close(); dbPromise = null; };
            db.onclose = () => { dbPromise = null; };
            resolve(db);
        };
    });
    return dbPromise;
};

const run = async <T,>(stores: string | string[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => (() => T) | void): Promise<T> => {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        const result = body(tx);
        tx.oncomplete = () => resolve((result ? result() : undefined) as T);
        tx.onerror = () => reject(tx.error || new Error('Offline outbox write failed'));
        tx.onabort = () => reject(tx.error || new Error('Offline outbox write was cancelled (storage full?)'));
    });
};

const byUser = <T,>(store: string, userId: string) => run<T[]>(store, 'readonly', tx => {
    const req = tx.objectStore(store).index('userId').getAll(userId);
    return () => (Array.isArray(req.result) ? req.result : []) as T[];
});

export function createIndexedDbOutboxStore(): OutboxStore {
    return {
        kind: 'indexeddb',
        getItems: userId => byUser<OutboxItem>(ITEMS, userId),
        getItem: id => run<OutboxItem | null>(ITEMS, 'readonly', tx => {
            const req = tx.objectStore(ITEMS).get(id);
            return () => (req.result as OutboxItem | undefined) ?? null;
        }),
        putItem: item => run<void>(ITEMS, 'readwrite', tx => { tx.objectStore(ITEMS).put(item); }),
        updateItem: (id, fn) => run<OutboxItem | null>(ITEMS, 'readwrite', tx => {
            const os = tx.objectStore(ITEMS);
            let out: OutboxItem | null = null;
            const req = os.get(id);
            req.onsuccess = () => {
                const current = (req.result as OutboxItem | undefined) ?? null;
                let next: OutboxItem | null;
                try { next = fn(current); } catch (e) { tx.abort(); throw e; }
                out = next;
                if (next === null) { if (current) os.delete(id); }
                else if (next !== current) os.put(next);
            };
            return () => out;
        }),
        deleteItem: id => run<void>(ITEMS, 'readwrite', tx => { tx.objectStore(ITEMS).delete(id); }),
        getHistory: userId => byUser<OutboxHistoryEntry>(HISTORY, userId),
        putHistory: entry => run<void>(HISTORY, 'readwrite', tx => { tx.objectStore(HISTORY).put(entry); }),
        deleteHistory: id => run<void>(HISTORY, 'readwrite', tx => { tx.objectStore(HISTORY).delete(id); }),
        getPhotos: userId => byUser<OfflinePhoto>(PHOTOS, userId),
        putPhoto: photo => run<void>(PHOTOS, 'readwrite', tx => { tx.objectStore(PHOTOS).put(photo); }),
        deletePhotos: ids => run<void>(PHOTOS, 'readwrite', tx => { const os = tx.objectStore(PHOTOS); ids.forEach(id => os.delete(id)); }),
        putBlobs: entry => run<void>(BLOBS, 'readwrite', tx => { tx.objectStore(BLOBS).put(entry); }),
        getBlobs: id => run<OutboxBlobs | null>(BLOBS, 'readonly', tx => {
            const req = tx.objectStore(BLOBS).get(id);
            return () => (req.result as OutboxBlobs | undefined) ?? null;
        }),
        deleteBlobs: ids => run<void>(BLOBS, 'readwrite', tx => { const os = tx.objectStore(BLOBS); ids.forEach(id => os.delete(id)); }),
        listBlobs: async userId => (await byUser<OutboxBlobs>(BLOBS, userId)).map(b => ({ id: b.id, bytes: Number(b.bytes) || 0, createdAt: b.createdAt })),
        clearUser: userId => run<void>(ALL_STORES, 'readwrite', tx => {
            for (const name of ALL_STORES) {
                const req = tx.objectStore(name).index('userId').openCursor(IDBKeyRange.only(userId));
                req.onsuccess = () => {
                    const cursor = req.result;
                    if (cursor) { cursor.delete(); cursor.continue(); }
                };
            }
        }),
    };
}

let shared: OutboxStore | null = null;

/** The device outbox (IndexedDB; in memory when the browser has none, e.g. some private windows). */
export const getOutboxStore = (): OutboxStore => {
    if (!shared) shared = typeof indexedDB !== 'undefined' ? createIndexedDbOutboxStore() : createMemoryOutboxStore();
    return shared;
};
