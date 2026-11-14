/**
 * Read-only inventory helpers for forms. Forms NEVER change stock: stock moves only in the database
 * (triggers / adjust_inventory RPC). These helpers only display availability and warn before saving.
 */
import type { InventoryItem, LineItem, SavedItem } from '../../types.ts';
import { toNumber } from '../../utils/money.ts';
import { supabase } from '../../lib/supabase.ts';
import { offlineEntityQueueFor } from '../../lib/offline/offlineEntities.ts';
import { newId } from './formUtils.ts';

/** Statuses at which the database deducts stock for Invoice / Estimate / Change Order line items. */
export const isCommittedStatus = (status?: string | null) => ['approved', 'accepted', 'paid'].includes(String(status || '').toLowerCase());

export const inventoryIdOf = (item: Pick<LineItem, 'inventoryItemId' | 'item_id'>) => item.inventoryItemId || item.item_id || '';

/**
 * Stock available to this document: current stock, plus what this document already consumed if its saved version
 * was committed (that quantity comes back if the line changes).
 */
export const makeStockLookup = (
    inventory: InventoryItem[],
    saved: { status?: string; lineItems?: LineItem[] } | null | undefined,
) => (item: LineItem): number | null => {
    const id = inventoryIdOf(item);
    if (!id) return null;
    const inv = inventory.find(i => i.id === id);
    const base = inv ? toNumber(inv.quantity) : item.currentStock !== undefined && item.currentStock !== null ? toNumber(item.currentStock) : null;
    if (base === null) return null;
    const alreadyConsumed = saved && isCommittedStatus(saved.status)
        ? (saved.lineItems || []).filter(li => inventoryIdOf(li) === id).reduce((s, li) => s + toNumber(li.quantity), 0)
        : 0;
    return base + alreadyConsumed;
};

/** Blocks saving a committed document that would need more stock than available (the database would reject it). */
export const findStockProblem = (items: LineItem[], status: string | undefined, lookup: (i: LineItem) => number | null): string | null => {
    if (!isCommittedStatus(status)) return null;
    const needed = new Map<string, { qty: number; name: string; sample: LineItem }>();
    for (const li of items) {
        const id = inventoryIdOf(li);
        if (!id || li.track_inventory === false) continue;
        const entry = needed.get(id) || { qty: 0, name: li.description || 'an item', sample: li };
        entry.qty += toNumber(li.quantity);
        needed.set(id, entry);
    }
    for (const { qty, name, sample } of needed.values()) {
        const available = lookup(sample);
        if (available !== null && qty > available) {
            return `Not enough stock for “${name}”: ${qty} needed, ${Math.max(0, available)} available. Lower the quantity or keep the status as ${status === 'Paid' ? 'Sent' : 'Draft'} until you restock.`;
        }
    }
    return null;
};

/** Saves a line as a price book item (saved_items). Returns the created row. */
export const addLineToPriceBook = async (line: { description: string; rate: number; unitCost?: number }): Promise<SavedItem> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error('Your session expired. Please sign in again.');
    const name = line.description.trim();
    if (!name) throw new Error('Add a description first.');
    const row = {
        id: newId(),
        user_id: userId,
        name: name.slice(0, 200),
        description: name.length > 200 ? name : '',
        rate: toNumber(line.rate),
        unit_cost: toNumber(line.unitCost),
    };
    // offline: kept on this device and added to the price book when the connection is back (lib/offline)
    const outbox = offlineEntityQueueFor();
    if (outbox) {
        await outbox.queue('price_item', 'create', row.id, row);
        return { ...row } as SavedItem;
    }
    const { error } = await supabase.from('saved_items').insert(row);
    if (error) throw new Error(error.message || 'Could not save to the price book.');
    return { ...row } as SavedItem;
};
