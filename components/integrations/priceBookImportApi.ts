/**
 * Price list import into the price book: reading the price book and saving the ticked changes (roadmap N10). The pure
 * part (matching, review ticks, the plan of writes) is lib/integrations/priceBookImport.ts.
 *
 * SAVING USES THE PRICE BOOK'S OWN PATH (components/PriceBookView.tsx saveItem / setup assistant starter kits):
 *   - offline, or an item still waiting to sync: the change is kept in the outbox (`price_item` edit / create) and
 *     syncs when the connection is back, exactly like an edit made in the price book
 *   - online: saved_items update / insert with withSchemaFallback (a database that lacks an optional column still works)
 * Both calls are listed in lib/offline/writePathAudit.ts. Reading uses the device copy offline, like the price book.
 */
import { supabase } from '../../lib/supabase.ts';
import { loadWithDeviceCopy } from '../../lib/offline/deviceCache.ts';
import { dbApi } from '../../utils/db.ts';
import { offlineEntityQueueFor, pendingEntityItems, withPendingRows } from '../../lib/offline/offlineEntities.ts';
import { mapPriceBookRow } from '../../lib/suppliers/libraryLogic.ts';
import type { ApplyOutcome, BookItem, PriceBookWrites } from '../../lib/integrations/priceBookImport.ts';
import { fetchAllPages, friendlyError, getCurrentUserId, withSchemaFallback } from '../viewKit.tsx';

export interface PriceBookForImport {
    items: BookItem[];
    /** the list is this device's copy (offline) */
    fromDevice: boolean;
}

/** Every price-book item, with the ones saved offline on top. Throws one readable sentence. */
export async function loadPriceBookForImport(): Promise<PriceBookForImport> {
    const uid = await getCurrentUserId();
    const res = await loadWithDeviceCopy<Record<string, unknown>>('saved_items', () => fetchAllPages<Record<string, unknown>>((from, to) => {
        let q = supabase.from('saved_items').select('*').order('name', { ascending: true }).range(from, to);
        if (uid) q = q.eq('user_id', uid);
        return q;
    }));
    let rows: Record<string, unknown>[] | null = res.error ? null : res.rows;
    if (!rows && res.fromDevice) {
        const kept = uid ? (await dbApi.getAll('saved_items').catch(() => [] as any[])).filter((r: any) => r?.user_id === uid) : [];
        rows = kept.length ? kept : null;
    }
    if (!rows) throw new Error(friendlyError(res.error, 'Could not load your price book.'));
    const merged = withPendingRows(rows as Array<Record<string, unknown> & { id: string }>, pendingEntityItems('price_item'), null, 'price_item', (row, prev) => ({ ...(prev || {}), ...row } as Record<string, unknown> & { id: string }));
    return { items: merged.map((r) => mapPriceBookRow(r)), fromDevice: res.fromDevice };
}

/** Runs `fn` over the list a few at a time (a long list is not one request after another). */
async function inBatches<T>(list: readonly T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
    for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(fn));
}

/** Saves the ticked changes. One item that fails does not stop the others; each failure is named in the result. */
export async function applyPriceBookWrites(writes: PriceBookWrites): Promise<ApplyOutcome> {
    const uid = await getCurrentUserId();
    if (!uid) throw new Error('Your session has expired. Please sign in again.');
    let updated = 0;
    let created = 0;
    let queued = 0;
    const failed: Array<{ name: string; error: string }> = [];

    await inBatches(writes.updates, 6, async (u) => {
        try {
            // offline (or the item itself still waits to sync): kept on this device, saved when the connection is back
            const outbox = offlineEntityQueueFor(u.id);
            if (outbox) { await outbox.queue('price_item', 'edit', u.id, { ...u.patch }); updated++; queued++; return; }
            const { error } = await withSchemaFallback(u.patch, (p) => supabase.from('saved_items').update(p).eq('id', u.id).select('*').single());
            if (error) throw error;
            updated++;
        } catch (e) {
            failed.push({ name: u.name, error: friendlyError(e, 'Could not be saved.') });
        }
    });

    await inBatches(writes.inserts, 6, async (r) => {
        const row = { id: crypto.randomUUID(), user_id: uid, ...r };
        try {
            const outbox = offlineEntityQueueFor(undefined);
            if (outbox) { await outbox.queue('price_item', 'create', row.id, row); created++; queued++; return; }
            const { error } = await withSchemaFallback(row, (p) => supabase.from('saved_items').insert(p).select('*').single());
            if (error) throw error;
            created++;
        } catch (e) {
            failed.push({ name: String(r.name || 'New item'), error: friendlyError(e, 'Could not be added.') });
        }
    });

    return { updated, created, queued, failed };
}
