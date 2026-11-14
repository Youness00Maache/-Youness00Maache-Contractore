/**
 * Offline saves of jobs and clients from code that has no access to the outbox hook (e.g. insertClient / updateClient
 * in components/ClientDetails.tsx, used by the Clients screen, inventory and the job form). App.tsx registers the
 * outbox here once the user is signed in; without it everything behaves exactly as online.
 */
import { entityOf, itemsOfUser, type OutboxEntity, type OutboxItem, type OutboxKind } from './outboxModel.ts';

export type OfflineEntity = Exclude<OutboxEntity, 'document'>;

export interface OfflineEntityQueue {
    /** keeps a job / client row in the outbox (it syncs when the connection is back) */
    queue: (entity: OfflineEntity, kind: OutboxKind, id: string, row: Record<string, unknown>) => Promise<void>;
    /** the row is waiting in the outbox (created offline: later saves of it must wait there too) */
    isWaiting: (id: string) => boolean;
    /** this user's items waiting in the outbox (screens show them on top of their list) */
    items?: () => OutboxItem[];
    /** removes an item from the outbox (kept 7 days in its history) */
    discard?: (id: string) => Promise<void>;
}

let current: OfflineEntityQueue | null = null;

export const setOfflineEntityQueue = (queue: OfflineEntityQueue | null): void => { current = queue; };

/** The outbox to use for this save, or null when it should go to the account as usual (online, nothing waiting). */
export const offlineEntityQueueFor = (id?: string | null): OfflineEntityQueue | null => {
    if (!current) return null;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return offline || (id ? current.isWaiting(id) : false) ? current : null;
};

/**
 * Deleting something that only exists on this device (created offline, not synced yet): it leaves the outbox (with
 * the changes waiting for it) and no connection is needed. False when it is on the account (delete it there).
 */
export const discardPendingCreate = async (id: string): Promise<boolean> => {
    const all = current?.items?.() || [];
    const created = all.some(i => i.docId === id && i.kind === 'create' && entityOf(i) !== 'document');
    if (!created || !current?.discard) return false;
    await current.discard(id);
    // stock changes of an item that never reached the account go with it
    for (const move of all.filter(i => entityOf(i) === 'stock_move' && i.data?.p_item_id === id)) await current.discard(move.docId);
    return true;
};

/** Items of one kind waiting in the outbox (empty without a signed-in outbox). */
export const pendingEntityItems = (entity: OfflineEntity): OutboxItem[] => {
    const all = current?.items?.() || [];
    return all.filter(i => entityOf(i) === entity);
};

/**
 * A screen's own list (inventory, price book …) with the outbox items of `entity` on top: rows created offline are
 * added, rows edited offline are patched. `toRow` builds the screen's row from the outbox row. Same array when nothing
 * waits.
 */
export const withPendingRows = <T extends { id: string }>(
    rows: T[], items: readonly OutboxItem[], userId: string | null | undefined, entity: OfflineEntity,
    toRow: (row: Record<string, unknown>, prev: T | undefined) => T,
): T[] => {
    const mine = (userId ? itemsOfUser(items, userId) : [...items]).filter(i => entityOf(i) === entity);
    if (!mine.length) return rows;
    const byId = new Map(rows.map(r => [r.id, r]));
    const added: T[] = [];
    for (const item of mine) {
        const prev = byId.get(item.docId);
        if (!prev && item.kind !== 'create') continue;
        const next = toRow({ ...item.data, id: item.docId }, prev);
        if (prev) byId.set(item.docId, next); else if (!added.some(a => a.id === next.id)) added.push(next);
    }
    return [...rows.map(r => byId.get(r.id) || r), ...added];
};

/** Stock changes made offline per inventory item (they are added to the quantities shown). */
export const pendingStockDeltas = (items: readonly OutboxItem[]): Map<string, number> => {
    const out = new Map<string, number>();
    for (const i of items) {
        if (entityOf(i) !== 'stock_move') continue;
        const id = String(i.data?.p_item_id || '');
        const delta = Number(i.data?.p_delta) || 0;
        if (id && delta) out.set(id, (out.get(id) || 0) + delta);
    }
    return out;
};
