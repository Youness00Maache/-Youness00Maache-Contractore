/**
 * Outbox operations on a store (no React): queue a save, discard, restore from the history, dismiss a notice, prune.
 * Used by lib/offline/useOutbox.ts and tested in scripts/offline-drafts-check.ts.
 */
import {
    isExpired, makeHistoryEntry, nextSeq, outboxItemId, queueSave,
    type OutboxHistoryEntry, type OutboxItem, type QueueInput,
} from './outboxModel.ts';
import type { OutboxStore } from './outboxStore.ts';

/** Saves a document to the outbox (one item per document: a later save replaces the data, keeps the place). */
export async function queueOfflineSave(store: OutboxStore, input: QueueInput, now: Date = new Date()): Promise<OutboxItem> {
    const items = await store.getItems(input.userId);
    const seq = nextSeq(items, now.getTime());
    const saved = await store.updateItem(outboxItemId(input.userId, input.docId), cur => queueSave(cur, input, now.toISOString(), seq));
    if (!saved) throw new Error('The document could not be kept on this device.');
    return saved;
}

/** Removes an item from the outbox; its data stays in the history for 7 days ("Restore"). */
export async function discardOutboxItem(store: OutboxStore, userId: string, docId: string, now: Date = new Date()): Promise<OutboxHistoryEntry | null> {
    const item = await store.getItem(outboxItemId(userId, docId));
    if (!item || item.userId !== userId) return null;
    const entry = makeHistoryEntry({
        userId, docId, jobId: item.jobId, type: item.type, reason: 'discarded', data: item.data, item,
        message: item.kind === 'create' ? 'Discarded before it synced.' : 'Offline changes discarded before they synced.',
    }, now);
    await store.putHistory(entry);
    await store.deleteItem(item.id);
    return entry;
}

/**
 * Puts a history version back in the outbox (it syncs like any offline save):
 * - a discarded item is queued again as it was (same kind, number rule and place);
 * - a version replaced by a conflict is saved over the account copy (last write wins again).
 */
export async function restoreHistoryEntry(store: OutboxStore, entry: OutboxHistoryEntry, now: Date = new Date()): Promise<OutboxItem | null> {
    let restored: OutboxItem | null = null;
    if (entry.reason === 'discarded' && entry.item) {
        const original = entry.item;
        restored = await store.updateItem(original.id, cur => (cur
            ? queueSave(cur, { userId: cur.userId, docId: cur.docId, jobId: original.jobId, type: original.type, kind: cur.kind, data: original.data, clientId: original.clientId }, now.toISOString(), cur.seq)
            : { ...original, status: 'pending', error: null, attempts: 0, updatedAt: now.toISOString() }));
    } else if (entry.data) {
        const items = await store.getItems(entry.userId);
        restored = await store.updateItem(outboxItemId(entry.userId, entry.docId), cur => queueSave(cur, {
            userId: entry.userId, docId: entry.docId, jobId: entry.jobId, type: entry.type, kind: 'edit', data: entry.data!, base: null,
        }, now.toISOString(), nextSeq(items, now.getTime())));
    } else {
        return null;
    }
    await store.deleteHistory(entry.id);
    return restored;
}

export async function dismissNotice(store: OutboxStore, entry: OutboxHistoryEntry): Promise<void> {
    if (!entry.seen) await store.putHistory({ ...entry, seen: true });
}

/** Deletes history entries older than 7 days; returns what is left. */
export async function pruneHistory(store: OutboxStore, userId: string, now: Date = new Date()): Promise<OutboxHistoryEntry[]> {
    const all = await store.getHistory(userId);
    const keep: OutboxHistoryEntry[] = [];
    for (const e of all) {
        if (isExpired(e, now)) await store.deleteHistory(e.id);
        else keep.push(e);
    }
    return keep.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
