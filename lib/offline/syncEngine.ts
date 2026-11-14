/**
 * Pushes the offline outbox to the account, in order, through the app's own document save (`deps.upsert` is
 * lib/documentSave.ts upsertDocumentRecord in the app: the same upsert, plan-limit triggers and stock rules as an
 * online save). Everything that touches the network is injected, so scripts/offline-drafts-check.ts runs it in memory.
 *
 * Per item:
 *   1. photos added offline are uploaded (once: the URLs are remembered on the item) and swapped into the data;
 *   2. edits read the account copy: last write wins, but a version changed meanwhile goes to the history (7 days) with
 *      a "Changed on another device" notice, and signatures / payment reports already on the account are kept;
 *   3. new documents get their number confirmed (the next free one if another device used it meanwhile);
 *   4. the save; on success the item leaves the outbox (unless it was saved again meanwhile: then it stays pending
 *      with the new data). A refusal keeps it with the reason (plan limit → blocked until the user acts); a lost
 *      connection stops the run and keeps everything pending.
 */
import {
    classifySyncError, contentHash, detectConflict, entityOf, remapItem, makeHistoryEntry, mergeForUpload, offlinePhotosIn, orderForSync, outboxTitle,
    PHOTO_REGISTRY_TTL_MS, replaceDataUrls, resolveOfflineNumber, shouldSync, statusForError,
    type OutboxEntity, type OutboxErrorKind, type OutboxHistoryEntry, type OutboxItem, type OutboxKind, type ServerCopy,
} from './outboxModel.ts';
import type { OutboxStore } from './outboxStore.ts';

export interface SyncedDoc {
    /** what was saved ('document' for documents) */
    entity: OutboxEntity;
    docId: string;
    jobId: string;
    type: string;
    data: Record<string, unknown>;
    clientId: string | null;
    publicToken: string | null;
    /** a new row on the account (counts toward the Free plan's documents) */
    created: boolean;
    /** the item stays in the outbox: it was saved again while this version was being sent */
    resaved: boolean;
}

export interface SyncDeps {
    store: OutboxStore;
    userId: string;
    /** the app's document upsert; `error` is the database error (PLAN_LIMIT, stock, ...) */
    upsert: (record: Record<string, unknown>) => Promise<{ row: { public_token?: string | null } | null; error: unknown }>;
    /** the account copy of a document (null = not found); throws when it can't be read */
    fetchServer: (docId: string) => Promise<ServerCopy | null>;
    /** every number of this document type on the account, with the document id; throws when it can't be read */
    fetchNumbers: (type: string, field: string) => Promise<Array<{ id: string; number: string }>>;
    /** uploads one photo added offline and returns its public URL */
    uploadPhoto: (dataUrl: string) => Promise<string>;
    /**
     * Saves a job / client row (insert for 'create', update of the row's own id for 'edit'). `id` is the account's id
     * of the row when it differs from the one given offline (later items are remapped to it).
     */
    saveEntity?: (entity: Exclude<OutboxEntity, 'document'>, kind: OutboxKind, row: Record<string, unknown>) => Promise<{ id?: string | null; error: unknown }>;
    isOnline?: () => boolean;
    now?: () => Date;
    /** also retry items that need the user (plan limit, stock...): the manual "Sync now" */
    includeBlocked?: boolean;
    /** only these documents (e.g. the one just saved in an open form) */
    onlyDocIds?: readonly string[];
    onStart?: (item: OutboxItem) => void;
    onSynced?: (doc: SyncedDoc, item: OutboxItem) => void;
}

export interface SyncReport {
    synced: SyncedDoc[];
    refused: Array<{ docId: string; kind: OutboxErrorKind; message: string }>;
    /** the connection dropped: the rest stays pending for the next run */
    networkStopped: boolean;
    notices: OutboxHistoryEntry[];
    /** items of this user still in the outbox after the run */
    remaining: number;
    /** documents saved again while they were being sent (run again to send the newer version) */
    resaved: number;
    /** documents left waiting because their job hasn't reached the account yet */
    waiting: number;
}

const upper = (s: string) => s.trim().toUpperCase();

export async function runOutboxSync(deps: SyncDeps): Promise<SyncReport> {
    const { store, userId } = deps;
    const now = deps.now || (() => new Date());
    const report: SyncReport = { synced: [], refused: [], networkStopped: false, notices: [], remaining: 0, resaved: 0, waiting: 0 };

    const all = orderForSync(await store.getItems(userId));
    const photos = await store.getPhotos(userId);
    const registry = new Set(photos.map(p => p.hash));
    /** photos now on the account (their document was saved) */
    const doneHashes = new Set<string>();
    /** numbers per type: account rows (id → number) + numbers given in this run */
    const numberRows = new Map<string, Array<{ id: string; number: string }>>();

    /** jobs / clients created offline that aren't on the account yet (what points at them must wait / drop the link) */
    const unsynced = new Set(all.filter(i => i.userId === userId && i.kind === 'create' && entityOf(i) !== 'document').map(i => i.docId));
    /** offline id → account id, when the account gave a row another id */
    const remap = new Map<string, string>();

    for (const queued of all) {
        if (queued.userId !== userId) continue;
        if (deps.onlyDocIds && !deps.onlyDocIds.includes(queued.docId)) continue;
        if (!shouldSync(queued, Boolean(deps.includeBlocked))) continue;
        if (deps.isOnline && !deps.isOnline()) { report.networkStopped = true; break; }
        // ids changed by the account earlier in this run: put them in (and keep them on the device)
        let item = remapItem(queued, remap);
        if (item !== queued) {
            const fixed = item;
            await store.updateItem(item.id, cur => (cur ? remapItem(cur, remap) : cur));
            item = fixed;
        }
        const entity = entityOf(item);
        // a document inside a job that isn't on the account yet waits for it (the job's own item says why)
        if (entity === 'document' && unsynced.has(item.jobId)) { report.waiting++; continue; }
        deps.onStart?.(item);
        try {
            if (entity !== 'document') {
                if (!deps.saveEntity) throw new Error('Jobs and clients saved offline cannot be synced here.');
                let row: Record<string, unknown> = { ...item.data, id: item.docId };
                // its client didn't reach the account (e.g. the Free plan's client limit): the job keeps the typed name
                if (typeof row.client_id === 'string' && unsynced.has(row.client_id)) { const { client_id: _drop, ...rest } = row; row = rest; }
                const { id: savedId, error } = await deps.saveEntity(entity, item.kind, row);
                if (error) throw error;
                unsynced.delete(item.docId);
                const finalId = savedId && savedId !== item.docId ? savedId : item.docId;
                if (finalId !== item.docId) remap.set(item.docId, finalId);
                const pushedAt = item.updatedAt;
                let resaved = false;
                await store.updateItem(item.id, cur => {
                    if (!cur) return null;
                    if (cur.updatedAt === pushedAt) return null;
                    resaved = true;
                    // saved again meanwhile: the newer version is now an edit of the row on the account
                    return { ...cur, kind: 'edit', status: 'pending', error: null };
                });
                if (resaved) report.resaved++;
                const doc: SyncedDoc = {
                    entity, docId: finalId, jobId: entity === 'job' ? finalId : item.jobId, type: item.type, data: { ...row, id: finalId },
                    clientId: (row.client_id as string | undefined) ?? null, publicToken: null, created: item.kind === 'create', resaved,
                };
                report.synced.push(doc);
                deps.onSynced?.(doc, item);
                continue;
            }
            let data = item.data;
            // its client didn't reach the account: the document is saved without the link
            const clientId = item.clientId && unsynced.has(item.clientId) ? null : item.clientId;

            // 1. photos added offline → storage
            const found = offlinePhotosIn(data, registry);
            if (found.length) {
                const urls: Record<string, string> = { ...(item.photos || {}) };
                for (const p of found) {
                    if (urls[p.hash]) continue;
                    urls[p.hash] = await deps.uploadPhoto(p.dataUrl);
                    const url = urls[p.hash];
                    await store.updateItem(item.id, cur => (cur ? { ...cur, photos: { ...(cur.photos || {}), [p.hash]: url } } : cur));
                }
                data = replaceDataUrls(data, new Map(found.map(p => [p.dataUrl, urls[p.hash]])));
            }

            // 2. edits: account copy, conflict, server-owned fields kept
            let conflict: 'none' | 'changed' | 'deleted' = 'none';
            let server: ServerCopy | null = null;
            if (item.kind === 'edit') {
                server = await deps.fetchServer(item.docId);
                conflict = detectConflict(item.base, server);
                if (server) data = mergeForUpload(data, server.data);
            }
            const newRow = item.kind === 'create' || conflict === 'deleted';

            // 3. numbers of new documents
            let renumbered: { field: string; from: string; to: string } | null = null;
            if (newRow && item.number) {
                const field = item.number.field;
                let rows = numberRows.get(item.type);
                if (!rows) {
                    rows = (await deps.fetchNumbers(item.type, field)).filter(r => r && r.number);
                    numberRows.set(item.type, rows);
                }
                const taken = new Set(rows.filter(r => r.id !== item.docId).map(r => upper(r.number)));
                const r = resolveOfflineNumber(item.number, data[field], taken, now());
                if (r.value !== null) {
                    if (r.value !== String(data[field] ?? '')) data = { ...data, [field]: r.value };
                    if (r.changedFrom && r.changedFrom !== r.value) renumbered = { field, from: r.changedFrom, to: r.value };
                    rows.push({ id: item.docId, number: r.value });
                }
            }

            // 4. the app's save
            const record: Record<string, unknown> = { id: item.docId, user_id: item.userId, job_id: item.jobId, type: item.type, data };
            if (clientId) record.client_id = clientId;
            const { row, error } = await deps.upsert(record);
            if (error) throw error;
            found.forEach(p => doneHashes.add(p.hash));

            const at = now();
            const notices: OutboxHistoryEntry[] = [];
            if (conflict === 'changed' && server) {
                notices.push(makeHistoryEntry({
                    userId, docId: item.docId, jobId: item.jobId, type: item.type, reason: 'conflict', data: server.data,
                    title: outboxTitle(item.type, data),
                    message: 'Changed on another device — your offline version was saved. The other version is kept here for 7 days.',
                }, at));
            } else if (conflict === 'deleted') {
                notices.push(makeHistoryEntry({
                    userId, docId: item.docId, jobId: item.jobId, type: item.type, reason: 'deleted_elsewhere', data: null, title: outboxTitle(item.type, data),
                    message: 'It had been deleted on another device. Your offline version was saved again.',
                }, at));
            }
            if (renumbered) {
                notices.push(makeHistoryEntry({
                    userId, docId: item.docId, jobId: item.jobId, type: item.type, reason: 'renumbered', data: null,
                    title: `${item.type} ${renumbered.to}`,
                    message: `Number ${renumbered.from} was already used, so it was saved as ${renumbered.to}.`,
                }, at));
            }
            for (const n of notices) await store.putHistory(n);
            report.notices.push(...notices);

            // leaves the outbox, unless it was saved again while this version was on its way
            const pushedAt = item.updatedAt;
            let resaved = false;
            await store.updateItem(item.id, cur => {
                if (!cur) return null;
                if (cur.updatedAt === pushedAt) return null;
                resaved = true;
                const nextData = renumbered && String(cur.data?.[renumbered.field] ?? '') === renumbered.from
                    ? { ...cur.data, [renumbered.field]: renumbered.to }
                    : cur.data;
                return {
                    ...cur,
                    data: nextData,
                    kind: 'edit',
                    // the account now has the version just sent: the newer save is compared with THAT one
                    base: { hash: contentHash(data), updatedAt: null },
                    number: null,
                    status: 'pending',
                    error: null,
                };
            });
            if (resaved) report.resaved++;

            const doc: SyncedDoc = {
                entity: 'document', docId: item.docId, jobId: item.jobId, type: item.type, data, clientId: (record.client_id as string | undefined) ?? null,
                publicToken: row?.public_token ?? null, created: newRow, resaved,
            };
            report.synced.push(doc);
            deps.onSynced?.(doc, item);
        } catch (err) {
            const c = classifySyncError(err);
            if (c.kind === 'network') { report.networkStopped = true; break; }
            const kind = c.kind;
            const at = now().toISOString();
            await store.updateItem(item.id, cur => {
                if (!cur || cur.updatedAt !== item.updatedAt) return cur; // saved again meanwhile: try that version next
                return { ...cur, status: statusForError(kind), error: { kind, message: c.message, at }, attempts: (cur.attempts || 0) + 1 };
            });
            report.refused.push({ docId: item.docId, kind, message: c.message });
        }
    }

    // photo registry: drop what was uploaded (and isn't used by a waiting document) and anything very old
    const left = await store.getItems(userId);
    report.remaining = left.length;
    const stillUsed = new Set(left.flatMap(i => offlinePhotosIn(i.data, registry).map(p => p.hash)));
    const cutoff = now().getTime() - PHOTO_REGISTRY_TTL_MS;
    const drop = photos
        .filter(p => !stillUsed.has(p.hash) && (doneHashes.has(p.hash) || Date.parse(p.createdAt) < cutoff))
        .map(p => p.id);
    if (drop.length) await store.deletePhotos(drop);
    return report;
}
