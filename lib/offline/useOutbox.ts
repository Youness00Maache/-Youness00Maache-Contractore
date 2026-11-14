/**
 * React side of the offline outbox (one instance, in App.tsx): this user's waiting documents, the history and
 * notices, and the sync runs.
 *
 * Sync triggers: app start (once the account is loaded), the browser's `online` event, "Sync now", and a save of a
 * document that is still in the outbox. A run that lost the connection retries by itself (30 s, 1 min, 2 min … 5 min)
 * while the browser says it is online. One run at a time per tab, and one per account across tabs (Web Locks).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { docSyncState, itemsOfUser, orderForSync, outboxItemId, unseenNotices, type OutboxHistoryEntry, type OutboxItem, type QueueInput } from './outboxModel.ts';
import { getOutboxStore } from './outboxStore.ts';
import { discardOutboxItem, dismissNotice, pruneHistory, queueOfflineSave, restoreHistoryEntry } from './outboxActions.ts';
import { runOutboxSync, type SyncDeps, type SyncReport } from './syncEngine.ts';
import { setOfflinePhotoUser } from './offlinePhotos.ts';
import { setDeviceCacheUser } from './deviceCache.ts';

export type SyncTrigger = 'start' | 'online' | 'manual' | 'save' | 'retry';

export interface SyncOptions {
    trigger: SyncTrigger;
    /** also retry items that need the user (plan limit...) */
    includeBlocked?: boolean;
    onlyDocIds?: string[];
}

export type OutboxDeps = Omit<SyncDeps, 'store' | 'userId' | 'includeBlocked' | 'onlyDocIds' | 'onStart'>;

export interface OutboxApi {
    ready: boolean;
    /** 'memory': this browser can't keep documents across a reload */
    storeKind: 'indexeddb' | 'memory';
    items: OutboxItem[];
    history: OutboxHistoryEntry[];
    notices: OutboxHistoryEntry[];
    syncing: boolean;
    syncingDocId: string | null;
    itemFor: (docId: string | null | undefined) => OutboxItem | null;
    stateOf: (docId: string | null | undefined) => ReturnType<typeof docSyncState>;
    /** `files`: kept with the item until it syncs (a job photo taken offline) */
    queue: (input: QueueInput, files?: Record<string, Blob> | null) => Promise<OutboxItem>;
    /** the files kept with an item of this user (null = none) */
    filesOf: (docId: string) => Promise<Record<string, Blob> | null>;
    /** files waiting on this device for this user: how many items have files, and their size */
    fileUsage: () => Promise<{ count: number; bytes: number }>;
    discard: (docId: string) => Promise<void>;
    restore: (entryId: string) => Promise<void>;
    dismiss: (entryId?: string) => Promise<void>;
    removeHistory: (entryId: string) => Promise<void>;
    sync: (options: SyncOptions) => Promise<SyncReport | null>;
    /** waiting documents of this user, read from the device (not the possibly stale state) */
    countUnsynced: () => Promise<number>;
    /** logout after the warning / account deleted (pass the user id: the session may already be gone) */
    clearAll: (userId?: string | null) => Promise<void>;
}

const CHANNEL = 'cd-outbox';
const RETRY_MS = [30_000, 60_000, 120_000, 300_000];

export function useOutbox(
    userId: string | null,
    options: {
        /** builds the network side of a run (null: not possible now) */
        buildDeps: () => OutboxDeps | null;
        /** called after every finished run */
        onReport?: (report: SyncReport, options: SyncOptions) => void;
        /** automatic runs allowed (the account is loaded) */
        autoSync: boolean;
    },
): OutboxApi {
    const store = useMemo(() => getOutboxStore(), []);
    const [items, setItems] = useState<OutboxItem[]>([]);
    const [history, setHistory] = useState<OutboxHistoryEntry[]>([]);
    const [ready, setReady] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncingDocId, setSyncingDocId] = useState<string | null>(null);

    const userRef = useRef(userId);
    userRef.current = userId;
    const optsRef = useRef(options);
    optsRef.current = options;
    const runningRef = useRef<Promise<SyncReport | null> | null>(null);
    const retryRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; attempt: number }>({ timer: null, attempt: 0 });
    const channelRef = useRef<BroadcastChannel | null>(null);

    const reload = useCallback(async () => {
        const uid = userRef.current;
        if (!uid) return;
        try {
            const [nextItems, nextHistory] = await Promise.all([store.getItems(uid), pruneHistory(store, uid)]);
            if (userRef.current !== uid) return;
            setItems(orderForSync(itemsOfUser(nextItems, uid)));
            setHistory(nextHistory);
        } catch { /* storage unavailable: nothing to show */ }
    }, [store]);

    const announce = useCallback(() => {
        try { channelRef.current?.postMessage({ type: 'changed', userId: userRef.current }); } catch { /* ignore */ }
    }, []);

    // load per user; other tabs tell us when they change the outbox
    useEffect(() => {
        setItems([]);
        setHistory([]);
        setReady(false);
        setOfflinePhotoUser(userId);
        setDeviceCacheUser(userId);
        if (!userId) return;
        let alive = true;
        void reload().finally(() => { if (alive) setReady(true); });
        let channel: BroadcastChannel | null = null;
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                channel = new BroadcastChannel(CHANNEL);
                channel.onmessage = (e: MessageEvent) => { if (e.data?.userId === userId) void reload(); };
            }
        } catch { channel = null; }
        channelRef.current = channel;
        return () => {
            alive = false;
            try { channel?.close(); } catch { /* ignore */ }
            channelRef.current = null;
            if (retryRef.current.timer) clearTimeout(retryRef.current.timer);
            retryRef.current = { timer: null, attempt: 0 };
        };
    }, [userId, reload]);

    const scheduleRetry = useCallback((fn: () => void) => {
        const r = retryRef.current;
        if (r.timer) return;
        const delay = RETRY_MS[Math.min(r.attempt, RETRY_MS.length - 1)];
        r.attempt += 1;
        r.timer = setTimeout(() => { r.timer = null; fn(); }, delay);
    }, []);

    const sync = useCallback(async (opts: SyncOptions): Promise<SyncReport | null> => {
        // one run at a time in this tab: wait for the current one, then run (it sees what the other one left)
        while (runningRef.current) await runningRef.current.catch(() => null);
        const uid = userRef.current;
        if (!uid) return null;
        const deps = optsRef.current.buildDeps();
        if (!deps) return null;

        const body = async (): Promise<SyncReport | null> => {
            setSyncing(true);
            try {
                const report = await runOutboxSync({
                    ...deps,
                    store,
                    userId: uid,
                    includeBlocked: opts.includeBlocked,
                    onlyDocIds: opts.onlyDocIds,
                    onStart: item => setSyncingDocId(item.docId),
                    onSynced: (doc, item) => { deps.onSynced?.(doc, item); void reload(); },
                });
                return report;
            } finally {
                setSyncingDocId(null);
                setSyncing(false);
            }
        };

        const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
        const run = (async (): Promise<SyncReport | null> => {
            try {
                if (locks?.request) {
                    return await locks.request(`cd-outbox-sync:${uid}`, { ifAvailable: true }, async (lock: unknown) => (lock ? body() : null));
                }
                return await body();
            } catch {
                return null;
            }
        })();
        runningRef.current = run;
        let report: SyncReport | null = null;
        try {
            report = await run;
        } finally {
            runningRef.current = null;
        }
        await reload();
        announce();
        if (report) {
            optsRef.current.onReport?.(report, opts);
            const online = typeof navigator === 'undefined' || navigator.onLine !== false;
            if (report.networkStopped && online) scheduleRetry(() => { void sync({ trigger: 'retry' }); });
            else if (!report.networkStopped) retryRef.current.attempt = 0;
            // documents saved again while they were being sent: send the newer version now
            if (report.resaved > 0 && userRef.current === uid) void sync({ trigger: opts.trigger, onlyDocIds: opts.onlyDocIds });
        }
        return report;
    }, [store, reload, announce, scheduleRetry]);

    // automatic runs: once the account is loaded, and every time the browser comes back online
    const startedForRef = useRef<string | null>(null);
    useEffect(() => {
        if (!userId || !ready || !options.autoSync) return;
        if (startedForRef.current === userId) return;
        startedForRef.current = userId;
        if (items.length && (typeof navigator === 'undefined' || navigator.onLine !== false)) void sync({ trigger: 'start' });
    }, [userId, ready, options.autoSync, items.length, sync]);

    useEffect(() => {
        if (!userId) return;
        const onOnline = () => {
            retryRef.current.attempt = 0;
            if (optsRef.current.autoSync) void sync({ trigger: 'online' });
        };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [userId, sync]);

    const itemFor = useCallback((docId: string | null | undefined) => (docId ? items.find(i => i.docId === docId) ?? null : null), [items]);
    const stateOf = useCallback((docId: string | null | undefined) => docSyncState(itemFor(docId), syncingDocId), [itemFor, syncingDocId]);

    const queue = useCallback(async (input: QueueInput, files?: Record<string, Blob> | null) => {
        const saved = await queueOfflineSave(store, input, new Date(), files);
        await reload();
        announce();
        return saved;
    }, [store, reload, announce]);

    const filesOf = useCallback(async (docId: string) => {
        const uid = userRef.current;
        if (!uid) return null;
        try {
            const entry = await store.getBlobs(outboxItemId(uid, docId));
            return entry && entry.userId === uid ? entry.files : null;
        } catch {
            return null;
        }
    }, [store]);

    const fileUsage = useCallback(async () => {
        const uid = userRef.current;
        if (!uid) return { count: 0, bytes: 0 };
        try {
            const list = await store.listBlobs(uid);
            return { count: list.length, bytes: list.reduce((sum, b) => sum + (Number(b.bytes) || 0), 0) };
        } catch {
            return { count: 0, bytes: 0 };
        }
    }, [store]);

    const discard = useCallback(async (docId: string) => {
        const uid = userRef.current;
        if (!uid) return;
        await discardOutboxItem(store, uid, docId);
        await reload();
        announce();
    }, [store, reload, announce]);

    const restore = useCallback(async (entryId: string) => {
        const entry = history.find(h => h.id === entryId);
        if (!entry) return;
        await restoreHistoryEntry(store, entry);
        await reload();
        announce();
    }, [store, history, reload, announce]);

    const dismiss = useCallback(async (entryId?: string) => {
        const targets = entryId ? history.filter(h => h.id === entryId) : unseenNotices(history);
        for (const e of targets) await dismissNotice(store, e);
        await reload();
        announce();
    }, [store, history, reload, announce]);

    const removeHistory = useCallback(async (entryId: string) => {
        await store.deleteHistory(entryId);
        await reload();
        announce();
    }, [store, reload, announce]);

    const countUnsynced = useCallback(async () => {
        const uid = userRef.current;
        if (!uid) return 0;
        try { return (await store.getItems(uid)).length; } catch { return items.length; }
    }, [store, items.length]);

    const clearAll = useCallback(async (forUser?: string | null) => {
        const uid = forUser || userRef.current;
        if (!uid) return;
        try { await store.clearUser(uid); } catch { /* ignore */ }
        setItems([]);
        setHistory([]);
        announce();
    }, [store, announce]);

    const notices = useMemo(() => unseenNotices(history), [history]);

    return {
        ready, storeKind: store.kind, items, history, notices, syncing, syncingDocId,
        itemFor, stateOf, queue, filesOf, fileUsage, discard, restore, dismiss, removeHistory, sync, countUnsynced, clearAll,
    };
}
