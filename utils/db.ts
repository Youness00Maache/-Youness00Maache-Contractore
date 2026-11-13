/**
 * Read-only offline cache (IndexedDB). Owned by CORE.
 * - One shared connection (no connection per call), closed when another tab upgrades the schema.
 * - Every call is best-effort: a cache failure must never block the UI, so callers should `.catch(() => {})`.
 * - Nothing here queues writes for later sync: offline mode is read-only (CORE-016).
 */
export const DB_NAME = 'contractor_db';
export const DB_VERSION = 3;

export const STORES = ['jobs', 'documents', 'clients', 'profile', 'offline_queue', 'inventory', 'saved_items'] as const;
export type StoreName = typeof STORES[number];

let dbPromise: Promise<IDBDatabase> | null = null;

const hasIndexedDB = () => typeof indexedDB !== 'undefined';

export const initDB = (): Promise<IDBDatabase> => {
  if (!hasIndexedDB()) return Promise.reject(new Error('IndexedDB is not available'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Error opening the offline cache'));
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('Offline cache is blocked by another open tab'));
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
};

const withStore = async <T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | void): Promise<T> => {
  const db = await initDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = run(store);
    tx.oncomplete = () => resolve((request ? (request as IDBRequest).result : undefined) as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Offline cache transaction aborted'));
  });
};

export const dbApi = {
  async getAll(storeName: string): Promise<any[]> {
    const result = await withStore<any[]>(storeName, 'readonly', store => store.getAll());
    return Array.isArray(result) ? result : [];
  },

  async get(storeName: string, key: string): Promise<any | undefined> {
    return withStore<any>(storeName, 'readonly', store => store.get(key));
  },

  async put(storeName: string, data: any): Promise<void> {
    await withStore<void>(storeName, 'readwrite', store => store.put(data));
  },

  /** Writes many rows in ONE transaction. */
  async putMany(storeName: string, rows: any[]): Promise<void> {
    if (!rows.length) return;
    await withStore<void>(storeName, 'readwrite', store => { rows.forEach(r => store.put(r)); });
  },

  /** Replaces the whole store content in ONE transaction. */
  async replaceAll(storeName: string, rows: any[]): Promise<void> {
    await withStore<void>(storeName, 'readwrite', store => {
      store.clear();
      rows.forEach(r => store.put(r));
    });
  },

  async delete(storeName: string, key: string): Promise<void> {
    await withStore<void>(storeName, 'readwrite', store => store.delete(key));
  },

  async clear(storeName: string): Promise<void> {
    await withStore<void>(storeName, 'readwrite', store => store.clear());
  },

  /** Wipes every store (used on logout so the next person on this device sees nothing). */
  async clearAll(): Promise<void> {
    if (!hasIndexedDB()) return;
    const db = await initDB();
    await new Promise<void>((resolve, reject) => {
      const names = STORES.filter(n => db.objectStoreNames.contains(n));
      if (!names.length) { resolve(); return; }
      const tx = db.transaction(names, 'readwrite');
      names.forEach(n => tx.objectStore(n).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
};
