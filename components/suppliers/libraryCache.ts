/**
 * The suppliers and every catalogue item, loaded once and kept for a minute, so opening several price-book items or the
 * reorder window in a row does not read the whole catalogue each time (roadmap D4). Kept per signed-in user; every
 * screen that changes a supplier or a catalogue item calls invalidateSupplierLibrary().
 */
import { listSupplierItems, listSuppliers } from '../../lib/suppliers/suppliersDb.ts';
import type { SupplierItemRecord, SupplierRecord } from '../../lib/suppliers/types.ts';

export interface SupplierLibrary {
    /** every supplier, archived ones included */
    suppliers: SupplierRecord[];
    /** every catalogue item of every supplier */
    items: SupplierItemRecord[];
}

const TTL_MS = 60_000;
let cache: { uid: string; at: number; value: SupplierLibrary } | null = null;
let inflight: { uid: string; promise: Promise<SupplierLibrary> } | null = null;

export const invalidateSupplierLibrary = (): void => { cache = null; };

export function loadSupplierLibrary(uid: string): Promise<SupplierLibrary> {
    if (cache && cache.uid === uid && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.value);
    if (inflight && inflight.uid === uid) return inflight.promise;
    const promise = Promise.all([listSuppliers({ includeArchived: true }), listSupplierItems()])
        .then(([suppliers, items]) => {
            const value = { suppliers, items };
            cache = { uid, at: Date.now(), value };
            return value;
        })
        .finally(() => { if (inflight && inflight.promise === promise) inflight = null; });
    inflight = { uid, promise };
    return promise;
}
