/**
 * Checks for the offline outbox (lib/offline): create / edit field documents and draft estimates / invoices without
 * a connection, then sync. Pure logic + the sync engine against an in-memory store and an in-memory "account"
 * (nothing here talks to Supabase).
 *   npx tsx scripts/offline-drafts-check.ts
 *
 * Covers: which documents work offline, outbox ordering and coalescing, provisional numbers → final numbers,
 * retry / refusal handling (plan limit, stock, deleted job, lost connection), last-write-wins with the "changed on
 * another device" notice and the 7-day history, per-user isolation, the logout guard, offline photo uploads, and jobs /
 * clients created or edited offline (sync order, id remapping, plan-limit refusals, documents waiting for their job).
 */
import { FormType } from '../types.ts';
import {
    OFFLINE_CREATE_TYPES, SERVER_OWNED_KEYS, applyOutboxOverlay, canCreateOffline, classifySyncError, contentHash, detectConflict,
    docSyncState, findImageDataUrls, hashString, isExpired, itemsOfUser, logoutGuard, makeHistoryEntry, mergeForUpload, nextSeq,
    numberRuleFor, offlinePhotosIn, offlineSavePolicy, orderForSync, outboxItemId, outboxTitle, pendingCreatesByJob, photoHash,
    queueSave, replaceDataUrls, resolveOfflineNumber, stableStringify, unseenNotices, HISTORY_TTL_MS, OFFLINE_SAVE_BLOCKED,
    applyEntityOverlay, entityOf, pendingEntityCreates, remapItem,
    type OutboxItem, type QueueInput,
} from '../lib/offline/outboxModel.ts';
import { createMemoryOutboxStore, type OutboxStore } from '../lib/offline/outboxStore.ts';
import { discardOutboxItem, dismissNotice, pruneHistory, queueOfflineSave, restoreHistoryEntry } from '../lib/offline/outboxActions.ts';
import { runOutboxSync, type SyncDeps } from '../lib/offline/syncEngine.ts';
import { dataUrlToBlob, extensionForType } from '../lib/offline/offlinePhotos.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else {
        failures++;
        console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
    }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

const A = 'user-a';
const B = 'user-b';
const JOB = 'job-1';
const JOB2 = 'job-2';
const NOW = new Date(2026, 10, 14, 9, 30, 0); // Nov 14 2026 (local)
const YM = '2026-11';

// ------------------------------------------------------------------------------------------- in-memory account
interface Row { id: string; user_id: string; job_id: string; type: string; data: Record<string, unknown>; client_id?: string | null; public_token: string; updated_at: string }
type Mode = 'ok' | 'network';

class FakeAccount {
    rows = new Map<string, Row>();
    jobs = new Set<string>([JOB, JOB2]);
    /** Free plan: new documents per job (null = unlimited) */
    docLimit: number | null = null;
    created = new Map<string, number>();
    mode: Mode = 'ok';
    /** fail the upsert of these document ids with a network error once */
    dropOnce = new Set<string>();
    upserts: string[] = [];
    uploads: string[] = [];
    clock = 0;
    tick() { this.clock += 1; return new Date(Date.UTC(2026, 10, 14, 10, 0, this.clock)).toISOString(); }

    upsert = async (record: Record<string, unknown>) => {
        if (this.mode === 'network') return { row: null, error: { message: 'TypeError: Failed to fetch' } };
        const id = String(record.id);
        if (this.dropOnce.has(id)) { this.dropOnce.delete(id); return { row: null, error: { message: 'Failed to fetch' } }; }
        const jobId = String(record.job_id);
        if (!this.jobs.has(jobId)) return { row: null, error: { code: '23503', message: 'insert or update on table "documents" violates foreign key constraint "documents_job_id_fkey"' } };
        const data = record.data as Record<string, unknown>;
        if (data.__forceStock) return { row: null, error: { code: 'P0001', message: 'Insufficient stock for item "2x4 stud"' } };
        const existing = this.rows.get(id);
        if (!existing) {
            const used = this.created.get(jobId) || 0;
            if (this.docLimit !== null && used >= this.docLimit) {
                return { row: null, error: { code: 'P0001', message: `PLAN_LIMIT: The Free plan includes ${this.docLimit} new documents per job each month. Upgrade to Premium for unlimited documents.` } };
            }
            this.created.set(jobId, used + 1);
        }
        const row: Row = {
            id, user_id: String(record.user_id), job_id: jobId, type: String(record.type), data,
            client_id: (record.client_id as string | undefined) ?? existing?.client_id ?? null,
            public_token: existing?.public_token || `tok-${id}`, updated_at: this.tick(),
        };
        this.rows.set(id, row);
        this.upserts.push(id);
        return { row: { public_token: row.public_token }, error: null };
    };

    fetchServer = async (id: string) => {
        if (this.mode === 'network') throw new Error('Failed to fetch');
        const r = this.rows.get(id);
        return r ? { data: r.data, updatedAt: r.updated_at } : null;
    };

    fetchNumbers = async (type: string, field: string) => {
        if (this.mode === 'network') throw new Error('Failed to fetch');
        return Array.from(this.rows.values()).filter(r => r.type === type && r.data[field]).map(r => ({ id: r.id, number: String(r.data[field]) }));
    };

    uploadPhoto = async (dataUrl: string) => {
        if (this.mode === 'network') throw new Error('Failed to fetch');
        this.uploads.push(dataUrl);
        return `https://storage.example/logos/${A}/doc-${this.uploads.length}.jpg`;
    };

    /** another device saves the document */
    otherDeviceSaves(id: string, data: Record<string, unknown>) {
        const r = this.rows.get(id)!;
        this.rows.set(id, { ...r, data, updated_at: this.tick() });
    }
}

const deps = (store: OutboxStore, acct: FakeAccount, userId = A, extra: Partial<SyncDeps> = {}): SyncDeps => ({
    store, userId, upsert: acct.upsert, fetchServer: acct.fetchServer, fetchNumbers: acct.fetchNumbers, uploadPhoto: acct.uploadPhoto,
    now: () => NOW, ...extra,
});

const input = (over: Partial<QueueInput> & { docId: string }): QueueInput => ({
    userId: A, jobId: JOB, type: FormType.DailyJobReport, kind: 'create', data: { title: over.docId }, ...over,
});

const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const run = async () => {
    // ---------------------------------------------------------------- which documents work offline
    {
        for (const t of [FormType.DailyJobReport, FormType.TimeSheet, FormType.MaterialLog, FormType.ExpenseLog, FormType.Note, FormType.Receipt]) {
            eq(`policy: ${t} create`, offlineSavePolicy(t, 'create').ok, true);
            eq(`policy: ${t} edit`, offlineSavePolicy(t, 'edit').ok, true);
        }
        eq('policy: estimate draft', offlineSavePolicy(FormType.Estimate, 'create').ok, true);
        eq('policy: invoice draft', offlineSavePolicy(FormType.Invoice, 'create').ok, true);
        const est = offlineSavePolicy(FormType.Estimate, 'edit');
        eq('policy: saved estimate edit waits', est.ok, false);
        ok('policy: estimate edit says why', /saved estimate can only be changed online/.test(est.reason));
        ok('policy: invoice edit says invoice', /saved invoice/.test(offlineSavePolicy(FormType.Invoice, 'edit').reason));
        for (const t of [FormType.WorkOrder, FormType.Warranty, FormType.ChangeOrder, FormType.PurchaseOrder]) {
            eq(`policy: ${t} keeps today's message`, offlineSavePolicy(t, 'create').reason, OFFLINE_SAVE_BLOCKED);
            eq(`policy: ${t} not in picker`, canCreateOffline(t), false);
        }
        eq('picker: 8 offline types', OFFLINE_CREATE_TYPES.length, 8);
        eq('picker: note offline', canCreateOffline(FormType.Note), true);
    }

    // ---------------------------------------------------------------- hashing
    {
        eq('stable: key order ignored', stableStringify({ b: 1, a: { d: 2, c: 3 } }), stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
        eq('stable: undefined dropped', stableStringify({ a: 1, b: undefined }), '{"a":1}');
        ok('hash: differs on content', hashString('abc') !== hashString('abd'));
        eq('content hash: key order', contentHash({ x: 1, y: [1, 2] }), contentHash({ y: [1, 2], x: 1 }));
        eq('content hash: server flags ignored', contentHash({ x: 1, viewedByProvider: true, clientSignedAt: 'now' }), contentHash({ x: 1 }));
        ok('content hash: real edit differs', contentHash({ x: 1 }) !== contentHash({ x: 2 }));
        ok('server-owned list has signature + payment report', SERVER_OWNED_KEYS.includes('clientSignatureUrl') && SERVER_OWNED_KEYS.includes('paymentReportedAt'));
    }

    // ---------------------------------------------------------------- queue: ordering + coalescing
    {
        const first = queueSave(null, input({ docId: 'd1', data: { title: 'v1' } }), NOW.toISOString(), 100);
        eq('queue: id per user+doc', first.id, outboxItemId(A, 'd1'));
        eq('queue: pending', [first.status, first.kind, first.seq, first.attempts], ['pending', 'create', 100, 0]);
        const refused = { ...first, status: 'blocked' as const, error: { kind: 'plan_limit' as const, message: 'x', at: '' }, attempts: 2 };
        const second = queueSave(refused, input({ docId: 'd1', kind: 'edit', data: { title: 'v2' } }), at(5).toISOString(), 999);
        eq('coalesce: keeps place + kind', [second.seq, second.kind, second.createdAt], [100, 'create', first.createdAt]);
        eq('coalesce: new data, pending again', [second.data.title, second.status, second.error, second.attempts], ['v2', 'pending', null, 0]);
        ok('coalesce: updatedAt moves', second.updatedAt > first.updatedAt);

        const edit = queueSave(null, input({ docId: 'd2', kind: 'edit', data: { title: 'e1' }, base: { hash: 'H0' }, number: { field: 'x', prefix: 'X', auto: true } }), NOW.toISOString(), 5);
        eq('edit: base kept, no number rule', [edit.base?.hash, edit.number], ['H0', null]);
        const edit2 = queueSave(edit, input({ docId: 'd2', kind: 'edit', data: { title: 'e2' }, base: { hash: 'H1' } }), at(1).toISOString(), 6);
        eq('edit: base is where the edit STARTED', edit2.base?.hash, 'H0');

        eq('seq: never below existing', nextSeq([{ ...first, seq: 5_000 }] as OutboxItem[], 10), 5_001);
        eq('seq: clock when larger', nextSeq([{ ...first, seq: 5 }] as OutboxItem[], 10), 10);
        const ordered = orderForSync([{ ...first, id: 'c', seq: 3 }, { ...first, id: 'a', seq: 1 }, { ...first, id: 'b', seq: 2 }]);
        eq('order: first saved first', ordered.map(i => i.id), ['a', 'b', 'c']);

        const store = createMemoryOutboxStore();
        await queueOfflineSave(store, input({ docId: 'o1' }), at(0));
        await queueOfflineSave(store, input({ docId: 'o2' }), at(1));
        await queueOfflineSave(store, input({ docId: 'o1', data: { title: 'o1 again' } }), at(2));
        const items = orderForSync(await store.getItems(A));
        eq('store: one item per document', items.map(i => i.docId), ['o1', 'o2']);
        eq('store: re-save keeps order, new data', items[0].data.title, 'o1 again');
        store.failNextWrite = true;
        let threw = false;
        try { await queueOfflineSave(store, input({ docId: 'o3' })); } catch { threw = true; }
        ok('store: a full device is reported (never silently lost)', threw);
    }

    // ---------------------------------------------------------------- per-user isolation, overlay, logout guard
    {
        const store = createMemoryOutboxStore();
        await queueOfflineSave(store, input({ docId: 'a1' }), at(0));
        await queueOfflineSave(store, input({ docId: 'b1', userId: B }), at(1));
        eq('user: A sees only A', (await store.getItems(A)).map(i => i.docId), ['a1']);
        eq('user: B sees only B', (await store.getItems(B)).map(i => i.docId), ['b1']);
        const all = [...await store.getItems(A), ...await store.getItems(B)];
        eq('user: itemsOfUser', itemsOfUser(all, B).map(i => i.docId), ['b1']);
        eq('user: no user → nothing', itemsOfUser(all, null).length, 0);

        // B's sync never touches A's items
        const acct = new FakeAccount();
        await runOutboxSync(deps(store, acct, B));
        eq('user: B synced only b1', acct.upserts, ['b1']);
        eq('user: A still waiting', (await store.getItems(A)).length, 1);

        eq('logout guard: warns with count', logoutGuard(await store.getItems(A), A), { warn: true, count: 1 });
        eq('logout guard: nothing waiting', logoutGuard([], A), { warn: false, count: 0 });
        eq('logout guard: other user ignored', logoutGuard(await store.getItems(A), B), { warn: false, count: 0 });
        await store.putHistory(makeHistoryEntry({ userId: A, docId: 'a1', jobId: JOB, type: FormType.Note, reason: 'discarded', data: {}, message: 'x' }, NOW));
        await store.putPhoto({ id: `${A}:h`, userId: A, hash: 'h', createdAt: NOW.toISOString() });
        await store.clearUser(A);
        eq('logout: A cleared (items, history, photos)', [(await store.getItems(A)).length, (await store.getHistory(A)).length, (await store.getPhotos(A)).length], [0, 0, 0]);

        // overlay
        const forms = [
            { id: 's1', jobId: JOB, type: FormType.Note, createdAt: '2026-11-10T10:00:00Z', data: { title: 'server' }, public_token: 'tok-s1' },
            { id: 's2', jobId: JOB, type: FormType.Note, createdAt: '2026-11-12T10:00:00Z', data: { title: 'other' } },
        ];
        eq('overlay: no items → same array', applyOutboxOverlay(forms, [], A) === forms, true);
        const created = queueSave(null, input({ docId: 'n1', data: { title: 'offline new' } }), '2026-11-14T08:00:00Z', 1);
        const edited = queueSave(null, input({ docId: 's1', kind: 'edit', data: { title: 'offline edit' } }), '2026-11-14T08:05:00Z', 2);
        const otherUser = queueSave(null, input({ docId: 'x9', userId: B }), '2026-11-14T08:06:00Z', 3);
        const view = applyOutboxOverlay(forms, [created, edited, otherUser], A);
        eq('overlay: new doc listed first, edit on top, other user hidden', view.map(f => [f.id, (f.data as any).title]), [['n1', 'offline new'], ['s2', 'other'], ['s1', 'offline edit']]);
        eq('overlay: edit keeps date + token', [view[2].createdAt, view[2].public_token], ['2026-11-10T10:00:00Z', 'tok-s1']);
        eq('pending creates per job', Array.from(pendingCreatesByJob([created, edited, otherUser], A)), [[JOB, 1]]);
    }

    // ---------------------------------------------------------------- numbers: provisional → final
    {
        const rule = numberRuleFor(FormType.Invoice, `INV-${YM}-004`, `INV-${YM}-004`);
        eq('number rule: invoice auto', rule, { field: 'invoiceNumber', prefix: 'INV', auto: true });
        eq('number rule: typed number', numberRuleFor(FormType.Invoice, 'ACME-1', `INV-${YM}-004`)?.auto, false);
        eq('number rule: empty is auto', numberRuleFor(FormType.Estimate, '', null)?.auto, true);
        eq('number rule: note has none', numberRuleFor(FormType.Note, 'x', null), null);

        const taken = new Set([`INV-${YM}-001`, `INV-${YM}-002`, `INV-${YM}-003`].map(s => s.toUpperCase()));
        eq('number: free one kept', resolveOfflineNumber(rule, `INV-${YM}-004`, new Set(taken), NOW), { value: `INV-${YM}-004`, changedFrom: null });
        const t2 = new Set(taken); t2.add(`INV-${YM}-004`);
        eq('number: used elsewhere → next free', resolveOfflineNumber(rule, `INV-${YM}-004`, t2, NOW), { value: `INV-${YM}-005`, changedFrom: `INV-${YM}-004` });
        eq('number: empty → next', resolveOfflineNumber(rule, '', new Set(taken), NOW), { value: `INV-${YM}-004`, changedFrom: null });
        const custom = { field: 'invoiceNumber', prefix: 'INV', auto: false };
        const t3 = new Set(['ACME-1']);
        eq('number: typed custom number kept (like online)', resolveOfflineNumber(custom, 'ACME-1', t3, NOW).value, 'ACME-1');
        const t4 = new Set([`INV-${YM}-007`]);
        eq('number: typed series number that collides → next', resolveOfflineNumber(custom, `INV-${YM}-007`, t4, NOW).value, `INV-${YM}-008`);

        // engine: two invoices drafted offline both got the local guess -004; another device used -004 meanwhile
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        for (let i = 1; i <= 3; i++) acct.rows.set(`srv${i}`, { id: `srv${i}`, user_id: A, job_id: JOB, type: FormType.Invoice, data: { invoiceNumber: `INV-${YM}-00${i}` }, public_token: 't', updated_at: acct.tick() });
        acct.rows.set('other-device', { id: 'other-device', user_id: A, job_id: JOB, type: FormType.Invoice, data: { invoiceNumber: `INV-${YM}-004` }, public_token: 't', updated_at: acct.tick() });
        await queueOfflineSave(store, input({ docId: 'inv-a', type: FormType.Invoice, data: { invoiceNumber: `INV-${YM}-004`, status: 'Draft' }, number: rule }), at(0));
        await queueOfflineSave(store, input({ docId: 'inv-b', type: FormType.Invoice, data: { invoiceNumber: `INV-${YM}-005`, status: 'Draft' }, number: rule }), at(1));
        await queueOfflineSave(store, input({ docId: 'inv-c', type: FormType.Invoice, data: { invoiceNumber: 'ACME-1' }, number: custom }), at(2));
        const report = await runOutboxSync(deps(store, acct));
        eq('sync numbers: unique, in order', ['inv-a', 'inv-b', 'inv-c'].map(id => acct.rows.get(id)!.data.invoiceNumber), [`INV-${YM}-005`, `INV-${YM}-006`, 'ACME-1']);
        eq('sync numbers: two renumbered notices', report.notices.filter(n => n.reason === 'renumbered').map(n => n.message), [
            `Number INV-${YM}-004 was already used, so it was saved as INV-${YM}-005.`,
            `Number INV-${YM}-005 was already used, so it was saved as INV-${YM}-006.`,
        ]);
        eq('sync numbers: outbox empty', report.remaining, 0);
        const all = Array.from(acct.rows.values()).filter(r => r.type === FormType.Invoice).map(r => String(r.data.invoiceNumber));
        eq('sync numbers: no duplicate on the account', new Set(all).size, all.length);

        // a create whose answer was lost: its own number on the account is not a collision
        const store2 = createMemoryOutboxStore();
        const acct2 = new FakeAccount();
        await queueOfflineSave(store2, input({ docId: 'est-1', type: FormType.Estimate, data: { estimateNumber: `EST-${YM}-001` }, number: numberRuleFor(FormType.Estimate, `EST-${YM}-001`, `EST-${YM}-001`) }), at(0));
        acct2.rows.set('est-1', { id: 'est-1', user_id: A, job_id: JOB, type: FormType.Estimate, data: { estimateNumber: `EST-${YM}-001` }, public_token: 't', updated_at: acct2.tick() });
        acct2.created.set(JOB, 1);
        await runOutboxSync(deps(store2, acct2));
        eq('retry after lost answer: same number kept', acct2.rows.get('est-1')!.data.estimateNumber, `EST-${YM}-001`);
        eq('retry after lost answer: not counted twice', acct2.created.get(JOB), 1);
    }

    // ---------------------------------------------------------------- refusals, retries, lost connection
    {
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        acct.docLimit = 1;
        acct.jobs.delete('gone-job');
        await queueOfflineSave(store, input({ docId: 'r1' }), at(0));
        await queueOfflineSave(store, input({ docId: 'r2' }), at(1)); // over the Free plan limit
        await queueOfflineSave(store, input({ docId: 'r3', type: FormType.MaterialLog, jobId: JOB2, data: { __forceStock: true } }), at(2));
        await queueOfflineSave(store, input({ docId: 'r4', jobId: 'gone-job' }), at(3));
        const rep = await runOutboxSync(deps(store, acct));
        eq('refusal: first synced', rep.synced.map(s => s.docId), ['r1']);
        eq('refusal: kinds', rep.refused.map(r => [r.docId, r.kind]), [['r2', 'plan_limit'], ['r3', 'stock'], ['r4', 'job_missing']]);
        const left = orderForSync(await store.getItems(A));
        eq('refusal: kept with status', left.map(i => [i.docId, i.status]), [['r2', 'blocked'], ['r3', 'blocked'], ['r4', 'blocked']]);
        ok('refusal: plan limit reason shown', /Free plan includes 1 new documents per job/.test(left[0].error?.message || ''));
        ok('refusal: stock reason says how to fix', /reduce the quantity/.test(left[1].error?.message || ''));
        eq('refusal: chip says Not synced', docSyncState(left[0], null)?.label, 'Not synced');

        const auto = await runOutboxSync(deps(store, acct));
        eq('auto sync skips items that need the user', [auto.synced.length, auto.refused.length, acct.upserts.length], [0, 0, 1]);

        acct.docLimit = null; // upgraded
        const manual = await runOutboxSync(deps(store, acct, A, { includeBlocked: true }));
        eq('Sync now retries blocked: plan limit fixed', manual.synced.map(s => s.docId), ['r2']);
        eq('still refused: stock + deleted job', manual.refused.map(r => r.kind), ['stock', 'job_missing']);

        // the user fixes the material log (new save = pending again) and discards the orphan
        const fixed = await queueOfflineSave(store, input({ docId: 'r3', type: FormType.MaterialLog, jobId: JOB2, data: { items: [] } }), at(10));
        eq('fix: a new save makes it pending again', [fixed.status, fixed.error], ['pending', null]);
        const discarded = await discardOutboxItem(store, A, 'r4', at(11));
        eq('discard: kept in history 7 days', [discarded?.reason, discarded?.seen, Date.parse(discarded!.expiresAt) - at(11).getTime()], ['discarded', true, HISTORY_TTL_MS]);
        const fin = await runOutboxSync(deps(store, acct));
        eq('fix: synced', [fin.synced.map(s => s.docId), fin.remaining], [['r3'], 0]);

        // lost connection: stop, keep everything pending, nothing marked as refused
        const s2 = createMemoryOutboxStore();
        const a2 = new FakeAccount();
        await queueOfflineSave(s2, input({ docId: 'n1' }), at(0));
        await queueOfflineSave(s2, input({ docId: 'n2' }), at(1));
        a2.dropOnce.add('n1');
        const r1 = await runOutboxSync(deps(s2, a2));
        eq('network: run stops', [r1.networkStopped, r1.synced.length, r1.refused.length, r1.remaining], [true, 0, 0, 2]);
        eq('network: items stay pending', (await s2.getItems(A)).map(i => [i.status, i.attempts]), [['pending', 0], ['pending', 0]]);
        const r2 = await runOutboxSync(deps(s2, a2));
        eq('network: next run sends both, in order', [r2.synced.map(s => s.docId), a2.upserts], [['n1', 'n2'], ['n1', 'n2']]);
        let online = false;
        const s3 = createMemoryOutboxStore();
        await queueOfflineSave(s3, input({ docId: 'q1' }), at(0));
        const r3 = await runOutboxSync(deps(s3, new FakeAccount(), A, { isOnline: () => online }));
        eq('offline: nothing attempted', [r3.networkStopped, r3.remaining], [true, 1]);
        online = true;
        eq('online again: sent', (await runOutboxSync(deps(s3, new FakeAccount(), A, { isOnline: () => online }))).synced.length, 1);

        // classification
        eq('classify: fetch', classifySyncError(new TypeError('Failed to fetch')).kind, 'network');
        eq('classify: app offline guard', classifySyncError(new Error("You're offline. Reconnect to upload images.")).kind, 'network');
        eq('classify: plan', classifySyncError({ message: 'PLAN_LIMIT: The Free plan includes 5 new documents per job each month.' }), { kind: 'plan_limit', message: 'The Free plan includes 5 new documents per job each month.' });
        eq('classify: other', classifySyncError({ message: 'permission denied for table documents' }).kind, 'error');
        const s4 = createMemoryOutboxStore();
        await queueOfflineSave(s4, input({ docId: 'e1' }), at(0));
        await runOutboxSync(deps(s4, new FakeAccount(), A, { upsert: async () => ({ row: null, error: { message: 'permission denied' } }) }));
        const e1 = (await s4.getItems(A))[0];
        eq('other error: failed (auto-retried), attempts counted', [e1.status, e1.attempts], ['failed', 1]);
        await runOutboxSync(deps(s4, new FakeAccount()));
        eq('failed item is retried by the next automatic run', (await s4.getItems(A)).length, 0);
    }

    // ---------------------------------------------------------------- saved again while it was being sent
    {
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        await queueOfflineSave(store, input({ docId: 'race', data: { title: 'v1' } }), at(0));
        const slowUpsert: SyncDeps['upsert'] = async (record) => {
            await queueOfflineSave(store, input({ docId: 'race', data: { title: 'v2' } }), at(1)); // the user saves meanwhile
            return acct.upsert(record);
        };
        const rep = await runOutboxSync(deps(store, acct, A, { upsert: slowUpsert }));
        eq('race: v1 reached the account', acct.rows.get('race')!.data.title, 'v1');
        eq('race: reported as saved again', [rep.resaved, rep.synced[0].resaved], [1, true]);
        const kept = (await store.getItems(A))[0];
        eq('race: v2 still waiting as an edit of v1', [kept.data.title, kept.status, kept.kind, kept.base?.hash], ['v2', 'pending', 'edit', contentHash({ title: 'v1' })]);
        const rep2 = await runOutboxSync(deps(store, acct));
        eq('race: v2 sent, no false conflict', [acct.rows.get('race')!.data.title, rep2.notices.length], ['v2', 0]);
    }

    // ---------------------------------------------------------------- last write wins + conflict notice + history
    {
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        const base = { title: 'Day 3', content: '<p>framing</p>', viewedByProvider: false };
        acct.rows.set('doc', { id: 'doc', user_id: A, job_id: JOB, type: FormType.DailyJobReport, data: base, public_token: 'tok-doc', updated_at: acct.tick() });
        // offline edit started from `base`
        await queueOfflineSave(store, input({ docId: 'doc', kind: 'edit', data: { ...base, content: '<p>framing + sheathing</p>' }, base: { hash: contentHash(base), updatedAt: null } }), at(0));

        // nothing changed elsewhere (only a server flag): no notice
        acct.otherDeviceSaves('doc', { ...base, viewedByProvider: true });
        eq('conflict check: server flag only → none', detectConflict({ hash: contentHash(base) }, { data: { ...base, viewedByProvider: true }, updatedAt: 'later' }), 'none');
        eq('conflict check: updated_at not newer → none', detectConflict({ hash: 'x', updatedAt: '2026-11-14T10:00:05Z' }, { data: { other: 1 }, updatedAt: '2026-11-14T10:00:05Z' }), 'none');
        eq('conflict check: newer updated_at confirmed by content', detectConflict({ hash: contentHash(base), updatedAt: '2026-11-14T10:00:00Z' }, { data: { ...base, title: 'x' }, updatedAt: '2026-11-14T10:00:09Z' }), 'changed');
        eq('conflict check: gone', detectConflict({ hash: 'x' }, null), 'deleted');
        eq('conflict check: unknown base → none', detectConflict(null, { data: {}, updatedAt: null }), 'none');

        // another device changed what the user wrote, and the client signed
        acct.otherDeviceSaves('doc', { ...base, title: 'Day 3 (office copy)', viewedByProvider: true, clientSignatureUrl: 'sig.png', clientSignedAt: '2026-11-14T09:00:00Z' });
        const rep = await runOutboxSync(deps(store, acct));
        const saved = acct.rows.get('doc')!.data;
        eq('LWW: offline version saved', [saved.title, saved.content], ['Day 3', '<p>framing + sheathing</p>']);
        eq('LWW: signature + flags from the account kept', [saved.clientSignatureUrl, saved.clientSignedAt, saved.viewedByProvider], ['sig.png', '2026-11-14T09:00:00Z', true]);
        eq('LWW: one conflict notice', rep.notices.map(n => n.reason), ['conflict']);
        const notice = rep.notices[0];
        ok('notice text', /Changed on another device — your offline version was saved/.test(notice.message));
        eq('history: replaced version kept', (notice.data as any).title, 'Day 3 (office copy)');
        eq('history: expires in 7 days', Date.parse(notice.expiresAt) - NOW.getTime(), HISTORY_TTL_MS);
        eq('history: unseen notice', unseenNotices(await store.getHistory(A)).length, 1);
        eq('history: title of the document', notice.title, 'Day 3');
        await dismissNotice(store, (await store.getHistory(A))[0]);
        eq('history: dismissed, still restorable', [unseenNotices(await store.getHistory(A)).length, (await store.getHistory(A)).length], [0, 1]);

        // restore the replaced version: it wins again on the next sync
        const entry = (await store.getHistory(A))[0];
        const restored = await restoreHistoryEntry(store, entry, at(30));
        eq('restore: queued as an edit', [restored?.kind, restored?.data.title, (await store.getHistory(A)).length], ['edit', 'Day 3 (office copy)', 0]);
        await runOutboxSync(deps(store, acct));
        eq('restore: account has the other version again (signature kept)', [acct.rows.get('doc')!.data.title, acct.rows.get('doc')!.data.clientSignatureUrl], ['Day 3 (office copy)', 'sig.png']);

        // expiry
        const old = makeHistoryEntry({ userId: A, docId: 'z', jobId: JOB, type: FormType.Note, reason: 'conflict', data: { a: 1 }, message: 'm' }, new Date(NOW.getTime() - HISTORY_TTL_MS - 1000));
        await store.putHistory(old);
        ok('expiry: older than 7 days', isExpired(old, NOW));
        eq('expiry: pruned', (await pruneHistory(store, A, NOW)).some(e => e.id === old.id), false);

        // deleted on another device: saved again, with a notice
        const s2 = createMemoryOutboxStore();
        const a2 = new FakeAccount();
        await queueOfflineSave(s2, input({ docId: 'gone', kind: 'edit', type: FormType.Receipt, data: { receiptNumber: `REC-${YM}-002` }, base: { hash: 'h' } }), at(0));
        // (the edit rule never carries a number; deleted elsewhere keeps the typed number)
        const r2 = await runOutboxSync(deps(s2, a2));
        eq('deleted elsewhere: saved again + notice', [Boolean(a2.rows.get('gone')), r2.notices.map(n => n.reason), r2.synced[0].created], [true, ['deleted_elsewhere'], true]);

        // mergeForUpload never adds an empty server value / leaves the local object alone when nothing to keep
        const local = { a: 1 };
        eq('merge: nothing to keep → same object', mergeForUpload(local, { clientSignatureUrl: '' }) === local, true);
        eq('merge: no server copy', mergeForUpload(local, null) === local, true);
    }

    // ---------------------------------------------------------------- discard + restore of a new document
    {
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        const rule = numberRuleFor(FormType.Estimate, `EST-${YM}-001`, `EST-${YM}-001`);
        await queueOfflineSave(store, input({ docId: 'est', type: FormType.Estimate, data: { estimateNumber: `EST-${YM}-001`, title: 'Deck' }, number: rule }), at(0));
        const entry = await discardOutboxItem(store, A, 'est', at(1));
        eq('discard: gone from the outbox', (await store.getItems(A)).length, 0);
        eq('discard: other user cannot discard', await discardOutboxItem(store, B, 'est'), null);
        await restoreHistoryEntry(store, entry!, at(2));
        const back = (await store.getItems(A))[0];
        eq('restore discarded: same kind + number rule', [back.kind, back.number?.prefix, back.data.title], ['create', 'EST', 'Deck']);
        await runOutboxSync(deps(store, acct));
        eq('restore discarded: synced', acct.rows.get('est')!.data.estimateNumber, `EST-${YM}-001`);
        eq('titles', [outboxTitle(FormType.Estimate, { estimateNumber: 'EST-1' }), outboxTitle(FormType.Note, { title: 'Gate code' }), outboxTitle(FormType.TimeSheet, { workerName: 'Sam' })], ['Estimate EST-1', 'Gate code', 'Time Sheet · Sam']);
    }

    // ---------------------------------------------------------------- photos added offline
    {
        const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/';
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNkYGD4z8DAwMDAwMDAAAAMBAEAG2Y5zQAAAABJRU5ErkJggg==';
        const data = {
            content: `<p>Rough-in done</p><img src="${jpeg}" alt="Photo"><p>and</p><img src="${png}"><img src="${jpeg}">`,
            logoUrl: png,
            signatureUrl: signature, // drawn signature: not a registered offline photo
        };
        eq('photos: found once each', findImageDataUrls(data).length, 3);
        const registry = new Set([photoHash(jpeg), photoHash(png)]);
        eq('photos: only registered ones', offlinePhotosIn(data, registry).map(p => p.dataUrl), [jpeg, png]);
        const replaced = replaceDataUrls(data, new Map([[jpeg, 'https://x/1.jpg'], [png, 'https://x/2.png']]));
        eq('photos: replaced in HTML (every copy) and plain fields', [replaced.content, replaced.logoUrl, replaced.signatureUrl], [
            '<p>Rough-in done</p><img src="https://x/1.jpg" alt="Photo"><p>and</p><img src="https://x/2.png"><img src="https://x/1.jpg">', 'https://x/2.png', signature,
        ]);
        eq('photos: no map → same object', replaceDataUrls(data, new Map()) === data, true);
        const blob = dataUrlToBlob(png);
        eq('photos: data URL → blob', [blob.type, blob.size > 50, extensionForType(blob.type), extensionForType('image/jpeg')], ['image/png', true, 'png', 'jpg']);

        // engine: upload once, even when the save is retried after a refusal
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        await store.putPhoto({ id: `${A}:${photoHash(jpeg)}`, userId: A, hash: photoHash(jpeg), createdAt: NOW.toISOString() });
        await store.putPhoto({ id: `${A}:${photoHash(png)}`, userId: A, hash: photoHash(png), createdAt: NOW.toISOString() });
        await store.putPhoto({ id: `${B}:${photoHash(jpeg)}`, userId: B, hash: photoHash(jpeg), createdAt: NOW.toISOString() });
        await queueOfflineSave(store, input({ docId: 'dr', data }), at(0));
        let refuse = true;
        const flaky: SyncDeps['upsert'] = async (record) => (refuse ? { row: null, error: { message: 'temporary database error' } } : acct.upsert(record));
        await runOutboxSync(deps(store, acct, A, { upsert: flaky }));
        eq('photos: uploaded before the refused save', acct.uploads.length, 2);
        eq('photos: URLs remembered on the item', Object.keys((await store.getItems(A))[0].photos).length, 2);
        refuse = false;
        await runOutboxSync(deps(store, acct, A, { upsert: flaky }));
        eq('photos: not uploaded twice', acct.uploads.length, 2);
        const savedData = acct.rows.get('dr')!.data;
        ok('photos: account copy has storage URLs, no data URL', !String(savedData.content).includes('data:image') && String(savedData.logoUrl).startsWith('https://storage.example/'));
        eq('photos: signature untouched', savedData.signatureUrl, signature);
        eq('photos: registry cleaned for this user only', [(await store.getPhotos(A)).length, (await store.getPhotos(B)).length], [0, 1]);

        // a lost connection during the upload keeps the item pending
        const s2 = createMemoryOutboxStore();
        const a2 = new FakeAccount();
        await s2.putPhoto({ id: `${A}:${photoHash(png)}`, userId: A, hash: photoHash(png), createdAt: NOW.toISOString() });
        await queueOfflineSave(s2, input({ docId: 'p2', data: { logoUrl: png } }), at(0));
        a2.mode = 'network';
        const r = await runOutboxSync(deps(s2, a2));
        eq('photos: upload offline → stays pending', [r.networkStopped, (await s2.getItems(A))[0].status], [true, 'pending']);
    }

    // ---------------------------------------------------------------- jobs and clients created / edited offline
    {
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        const saved: string[] = [];
        const saveEntity: SyncDeps['saveEntity'] = async (entity, kind, row) => {
            const id = String(row.id);
            if (entity === 'job' && kind === 'create') acct.jobs.add(id);
            saved.push(`${entity}:${kind}:${id}:${row.client_id ?? '-'}:${row.status ?? ''}`);
            return { error: null };
        };
        const job = (over: Partial<QueueInput> & { docId: string }): QueueInput => ({
            entity: 'job', userId: A, jobId: over.docId, type: 'Job', kind: 'create', data: { id: over.docId, user_id: A, name: over.docId, status: 'active' }, ...over,
        });
        // offline: a new client, a document (queued first on purpose), the job it belongs to, then the job's status changes
        await queueOfflineSave(store, { entity: 'client', userId: A, docId: 'c-new', jobId: '', type: 'Client', kind: 'create', data: { id: 'c-new', user_id: A, name: 'Jack' } }, at(1));
        await queueOfflineSave(store, input({ docId: 'd-new', jobId: 'j-new', clientId: 'c-new' }), at(2));
        await queueOfflineSave(store, job({ docId: 'j-new', data: { id: 'j-new', user_id: A, name: 'Kitchen', status: 'active', client_id: 'c-new' }, clientId: 'c-new' }), at(3));
        await queueOfflineSave(store, job({ docId: 'j-new', kind: 'edit', data: { status: 'completed' } }), at(4));
        const items = await store.getItems(A);
        const j = items.find(i => i.docId === 'j-new');
        eq('jobs: one item per job, status merged into the create', [items.filter(i => i.docId === 'j-new').length, j?.kind, j?.entity, j?.data.status, j?.data.name], [1, 'create', 'job', 'completed', 'Kitchen']);
        eq('jobs: sync order client → job → document', orderForSync(items).map(i => i.docId), ['c-new', 'j-new', 'd-new']);
        eq('jobs: entity of old items is document', entityOf(items.find(i => i.docId === 'd-new')), 'document');
        const list = [{ id: JOB, name: 'Old' }];
        const shown = applyEntityOverlay(list, items, A, 'job', (row, prev) => ({ ...(prev || {}), id: String(row.id), name: String(row.name ?? prev?.name) }));
        eq('jobs: list shows the offline job first', shown.map(x => x.id), ['j-new', JOB]);
        ok('jobs: no job items → same array', applyEntityOverlay(list, [], A, 'job', r => r as never) === list);
        eq('jobs: other user sees nothing', applyEntityOverlay(list, items, B, 'job', r => r as never).length, 1);
        eq('jobs: document list ignores job / client items', applyOutboxOverlay([], items, A).map(f => f.id), ['d-new']);
        eq('jobs: pending creates', [pendingEntityCreates(items, A, 'job'), pendingEntityCreates(items, A, 'client'), pendingCreatesByJob(items, A).get('j-new'), pendingCreatesByJob(items, A).has('')], [1, 1, 1, false]);
        eq('jobs: chip', docSyncState(j, null)?.label, 'Waiting to sync');
        eq('jobs: title', outboxTitle('Job', j?.data), 'Job · Kitchen');
        const rep = await runOutboxSync(deps(store, acct, A, { saveEntity }));
        eq('jobs: client then job (with its client and latest status)', saved, ['client:create:c-new:-:', 'job:create:j-new:c-new:completed']);
        eq('jobs: document created offline landed in the job created offline', [acct.rows.get('d-new')?.job_id, acct.rows.get('d-new')?.client_id], ['j-new', 'c-new']);
        eq('jobs: report', rep.synced.map(s => `${s.entity}:${s.docId}:${s.created}`), ['client:c-new:true', 'job:j-new:true', 'document:d-new:true']);
        eq('jobs: outbox empty', (await store.getItems(A)).length, 0);

        // a status change of a saved job is an edit (patch only)
        await queueOfflineSave(store, job({ docId: JOB, kind: 'edit', data: { status: 'on_hold' } }), at(5));
        saved.length = 0;
        await runOutboxSync(deps(store, acct, A, { saveEntity }));
        eq('jobs: status edit of a saved job', saved, [`job:edit:${JOB}:-:on_hold`]);

        // a client edited offline while it was still waiting: one create with the newest fields
        await queueOfflineSave(store, { entity: 'client', userId: A, docId: 'c-2', jobId: '', type: 'Client', kind: 'create', data: { id: 'c-2', user_id: A, name: 'Paul', phone: '' } }, at(6));
        await queueOfflineSave(store, { entity: 'client', userId: A, docId: 'c-2', jobId: '', type: 'Client', kind: 'edit', data: { name: 'Paul B', phone: '555 0101' } }, at(7));
        const c2 = (await store.getItems(A))[0];
        eq('clients: edit merged into the waiting create', [c2.kind, c2.data.name, c2.data.phone, c2.data.user_id], ['create', 'Paul B', '555 0101', A]);
    }
    {
        // the account gives the job another id: what was made inside it follows (id remapping)
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        await queueOfflineSave(store, { entity: 'client', userId: A, docId: 'tmp-c', jobId: '', type: 'Client', kind: 'create', data: { id: 'tmp-c', user_id: A, name: 'Ann' } }, at(1));
        await queueOfflineSave(store, { entity: 'job', userId: A, docId: 'tmp-j', jobId: 'tmp-j', type: 'Job', kind: 'create', data: { id: 'tmp-j', user_id: A, name: 'Deck', client_id: 'tmp-c' }, clientId: 'tmp-c' }, at(2));
        await queueOfflineSave(store, input({ docId: 'd-tmp', jobId: 'tmp-j', clientId: 'tmp-c' }), at(3));
        const jobRows = new Map<string, Record<string, unknown>>();
        const saveEntity: SyncDeps['saveEntity'] = async (entity, _kind, row) => {
            const real = `real-${String(row.id)}`;
            if (entity === 'job') { acct.jobs.add(real); jobRows.set(real, row); }
            return { id: real, error: null };
        };
        const rep = await runOutboxSync(deps(store, acct, A, { saveEntity }));
        eq('remap: job saved with the account id of its client', jobRows.get('real-tmp-j')?.client_id, 'real-tmp-c');
        eq('remap: document saved in the account job, with the account client', [acct.rows.get('d-tmp')?.job_id, acct.rows.get('d-tmp')?.client_id], ['real-tmp-j', 'real-tmp-c']);
        eq('remap: report ids', rep.synced.map(s => s.docId), ['real-tmp-c', 'real-tmp-j', 'd-tmp']);
        const it = queueSave(null, { entity: 'job', userId: A, docId: 'j2', jobId: 'j2', type: 'Job', kind: 'create', data: { client_id: 'tmp-c' }, clientId: 'tmp-c' }, NOW.toISOString(), 1);
        const m = remapItem(it, new Map([['tmp-c', 'real-c']]));
        eq('remap: job → client link', [m.clientId, m.data.client_id], ['real-c', 'real-c']);
        ok('remap: nothing to change → same item', remapItem(it, new Map([['x', 'y']])) === it);
    }
    {
        // Free plan limits: refused with the reason; documents of a refused job wait; a refused client leaves the job its typed name
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        let limits = true;
        const jobRows = new Map<string, Record<string, unknown>>();
        const saveEntity: SyncDeps['saveEntity'] = async (entity, _kind, row) => {
            const id = String(row.id);
            if (limits && entity === 'client') return { error: { code: 'P0001', message: 'PLAN_LIMIT: The Free plan includes 3 new clients per month. Upgrade to Premium for unlimited clients.' } };
            if (limits && id === 'j-over') return { error: { code: 'P0001', message: 'PLAN_LIMIT: The Free plan includes 5 new jobs per month. Upgrade to Premium for unlimited jobs.' } };
            if (entity === 'job') { acct.jobs.add(id); jobRows.set(id, row); }
            return { error: null };
        };
        await queueOfflineSave(store, { entity: 'client', userId: A, docId: 'c-lim', jobId: '', type: 'Client', kind: 'create', data: { id: 'c-lim', user_id: A, name: 'Zed' } }, at(1));
        await queueOfflineSave(store, { entity: 'job', userId: A, docId: 'j-ok', jobId: 'j-ok', type: 'Job', kind: 'create', data: { id: 'j-ok', user_id: A, name: 'Roof', client_name: 'Zed', client_id: 'c-lim' }, clientId: 'c-lim' }, at(2));
        await queueOfflineSave(store, { entity: 'job', userId: A, docId: 'j-over', jobId: 'j-over', type: 'Job', kind: 'create', data: { id: 'j-over', user_id: A, name: 'Fence' } }, at(3));
        await queueOfflineSave(store, input({ docId: 'd-over', jobId: 'j-over' }), at(4));
        await queueOfflineSave(store, input({ docId: 'd-ok', jobId: 'j-ok', clientId: 'c-lim' }), at(5));
        const rep = await runOutboxSync(deps(store, acct, A, { saveEntity }));
        const left = await store.getItems(A);
        const byId = (id: string) => left.find(i => i.docId === id);
        eq('limits: client refused with the reason', [rep.refused.find(r => r.docId === 'c-lim')?.kind, byId('c-lim')?.status], ['plan_limit', 'blocked']);
        ok('limits: client reason kept', /3 new clients/.test(byId('c-lim')?.error?.message || ''));
        eq('limits: job saved without the refused client, typed name kept', [jobRows.has('j-ok'), 'client_id' in (jobRows.get('j-ok') || {}), jobRows.get('j-ok')?.client_name], [true, false, 'Zed']);
        eq('limits: its document saved without the client link', [acct.rows.get('d-ok')?.job_id, acct.rows.get('d-ok')?.client_id], ['j-ok', null]);
        eq('limits: refused job blocked with the reason', [byId('j-over')?.status, docSyncState(byId('j-over'), null)?.label], ['blocked', 'Not synced']);
        ok('limits: job reason shown on its chip', /5 new jobs/.test(docSyncState(byId('j-over'), null)?.reason || ''));
        eq('limits: document of the refused job waits (not sent, still pending)', [byId('d-over')?.status, acct.rows.has('d-over'), rep.waiting], ['pending', false, 1]);
        const auto = await runOutboxSync(deps(store, acct, A, { saveEntity }));
        eq('limits: automatic sync leaves them alone', [auto.synced.length, auto.waiting], [0, 1]);
        limits = false; // upgraded
        await runOutboxSync(deps(store, acct, A, { saveEntity, includeBlocked: true }));
        eq('limits: after upgrade, Sync now sends the job then its document', [acct.rows.get('d-over')?.job_id, (await store.getItems(A)).length], ['j-over', 0]);
    }
    {
        // connection lost while saving a job: stays pending, the run stops
        const store = createMemoryOutboxStore();
        await queueOfflineSave(store, { entity: 'job', userId: A, docId: 'j-net', jobId: 'j-net', type: 'Job', kind: 'create', data: { id: 'j-net', user_id: A, name: 'Porch' } }, at(1));
        await queueOfflineSave(store, input({ docId: 'd-net', jobId: 'j-net' }), at(2));
        const rep = await runOutboxSync(deps(store, new FakeAccount(), A, { saveEntity: async () => ({ error: { message: 'TypeError: Failed to fetch' } }) }));
        eq('jobs: lost connection → pending, run stopped', [rep.networkStopped, (await store.getItems(A)).map(i => i.status)], [true, ['pending', 'pending']]);
        const rep2 = await runOutboxSync(deps(store, new FakeAccount(), A));
        eq('jobs: no saveEntity → refused with a reason, document waits', [rep2.refused.length, rep2.waiting], [1, 1]);
    }

    {
        // inventory items, stock changes and price-book items saved offline: item first, its stock changes next, documents last
        const store = createMemoryOutboxStore();
        const acct = new FakeAccount();
        const calls: string[] = [];
        const saveEntity: SyncDeps['saveEntity'] = async (entity, kind, row) => {
            if (entity === 'stock_move' && Number(row.p_delta) < -100) return { error: { code: 'P0001', message: 'Insufficient stock for item "2x4 stud"' } };
            calls.push(entity === 'stock_move' ? `stock:${row.p_item_id}:${row.p_delta}` : `${entity}:${kind}:${row.id}`);
            return { error: null };
        };
        await queueOfflineSave(store, input({ docId: 'd-mat', type: FormType.MaterialLog }), at(1));
        await queueOfflineSave(store, { entity: 'stock_move', userId: A, docId: 'm1', jobId: '', type: 'Stock change', kind: 'create', data: { p_item_id: 'inv-1', p_delta: 5, p_reason: 'Manual restock', p_job_id: null } }, at(2));
        await queueOfflineSave(store, { entity: 'inventory', userId: A, docId: 'inv-1', jobId: '', type: 'Inventory item', kind: 'create', data: { id: 'inv-1', user_id: A, name: '2x4 stud', quantity: 10 } }, at(3));
        await queueOfflineSave(store, { entity: 'price_item', userId: A, docId: 'pb-1', jobId: '', type: 'Price book item', kind: 'create', data: { id: 'pb-1', user_id: A, name: 'Door install', rate: 450 } }, at(4));
        await queueOfflineSave(store, { entity: 'stock_move', userId: A, docId: 'm2', jobId: '', type: 'Stock change', kind: 'create', data: { p_item_id: 'inv-1', p_delta: -500, p_reason: 'Manual adjustment', p_job_id: null } }, at(5));
        const rep = await runOutboxSync(deps(store, acct, A, { saveEntity }));
        eq('stock: item, price-book item, then its stock change, documents last', [...calls, ...acct.upserts], ['inventory:create:inv-1', 'price_item:create:pb-1', 'stock:inv-1:5', 'd-mat']);
        const left = await store.getItems(A);
        eq('stock: not enough stock → blocked with the reason', [left.map(i => i.docId), left[0]?.status, rep.refused[0]?.kind], [['m2'], 'blocked', 'stock']);
        eq('stock: display types', [outboxTitle('Inventory item', { name: '2x4 stud' }), outboxTitle('Price book item', { name: 'Door install' })], ['Inventory item · 2x4 stud', 'Price book item · Door install']);
    }

    // ---------------------------------------------------------------- chips
    {
        const item = queueSave(null, input({ docId: 'c1', type: FormType.Invoice, number: { field: 'invoiceNumber', prefix: 'INV', auto: true } }), NOW.toISOString(), 1);
        eq('chip: waiting', docSyncState(item, null)?.label, 'Waiting to sync');
        ok('chip: number confirmed on sync', /number is confirmed/.test(docSyncState(item, null)?.reason || ''));
        eq('chip: syncing', docSyncState(item, 'c1')?.tone, 'syncing');
        eq('chip: nothing waiting', docSyncState(null, null), null);
    }

    console.log(`offline-drafts-check: ${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
};

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
