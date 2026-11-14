/**
 * Notification bell engine (renders nothing; mounted once in App.tsx while signed in).
 *
 * Freshness: the app's own data (documents, inventory, usage, offline outbox) recomputes the list as soon as App
 * changes it. The cheap reads in lib/notifications/sources.ts run on sign-in, then while the tab is visible: client
 * activity, quote requests and the Community every 3 minutes, due dates / purchase orders / reminders / Gmail every
 * 10 minutes, and again when the tab comes back, the connection returns or the bell opens (if a bit old). No
 * realtime subscription: the app has none today and these tables don't need one.
 *
 * Read / removed state and the per-type choices follow the account (lib/notifications/store.ts). Browser pop-ups
 * (off by default) show only items that arrive while the app is open, never the backlog found at sign-in.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormData as FormDataType } from '../../types.ts';
import type { OutboxItem } from '../../lib/offline/outboxModel.ts';
import { notificationStore } from '../../lib/notifications/store.ts';
import {
    fetchActivityDocs, fetchDueDocs, fetchExpiringPapers, fetchForum, fetchGmailAccounts, fetchOrders, fetchPunchFeedback, fetchReminders, fetchRequests,
    fetchUpcomingVisits, markForumRead,
    type ForumData,
} from '../../lib/notifications/sources.ts';
import {
    buildNotifications, deriveDocNotifications, deriveForumNotifications, deriveGmailNotifications, deriveLimitNotifications,
    deriveOutboxNotifications, derivePaperNotifications, derivePunchNotifications, deriveReminderNotifications, deriveRequestNotifications,
    deriveServiceVisitNotifications, deriveStockNotifications, deriveThreadReplies,
    dismiss as dismissIds, docInputOf, forget, markAllRead as markAllIds, markRead, pickPopups, pruneSeen,
    type DocInput, type GmailAccountInput, type PaperInput, type PunchFeedbackInput, type ReminderInput, type RequestInput, type ServiceVisitInput,
    type ShownNotification, type StockInput, type UsageInput,
} from '../../lib/notifications/model.ts';
import { popupSupport, showPopup } from '../../lib/notifications/popups.ts';
import { requestOpenInventoryItem, requestOpenQuoteRequest } from '../../lib/notifications/intents.ts';
import { openAppPath } from '../help/helpNav.ts';
import { centerStore } from './centerStore.ts';

export interface NotificationCenterProps {
    userId: string;
    online: boolean;
    /** the app's documents (recent + unseen client decisions, offline versions on top) */
    forms: readonly FormDataType[];
    jobs: ReadonlyArray<{ id: string; name: string }>;
    inventory: readonly StockInput[];
    /** the server's usage numbers (null = unknown: no plan-limit notifications) */
    usage: UsageInput | null;
    /** Free plan: documents created this month per job */
    docUsage: Readonly<Record<string, number>> | null;
    outboxItems: readonly OutboxItem[];
    navigate: (path: string) => void;
    openOutbox: () => void;
    /** unread Community notifications changed (the Community badge) */
    onForumUnread?: (count: number) => void;
}

interface Remote {
    activity: DocInput[] | null;
    due: DocInput[] | null;
    orders: DocInput[] | null;
    requests: RequestInput[] | null;
    forum: ForumData | null;
    reminders: ReminderInput[] | null;
    gmail: GmailAccountInput[] | null;
    /** field features (null = not in the database yet) */
    punch: PunchFeedbackInput[] | null;
    papers: PaperInput[] | null;
    visits: ServiceVisitInput[] | null;
}

const EMPTY_REMOTE: Remote = { activity: null, due: null, orders: null, requests: null, forum: null, reminders: null, gmail: null, punch: null, papers: null, visits: null };
const FAST_MS = 3 * 60_000;
const SLOW_MS = 10 * 60_000;
const BACK_MIN_MS = 60_000;
const OPEN_MIN_MS = 30_000;
const FIRST_DELAY_MS = 1800;
const TICK_MS = 60_000;
/** pop-ups never show what was found in the first moments after sign-in (data still arriving) */
const POP_GRACE_MS = 30_000;

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
const onlineNow = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** The app's documents and the server reads, one entry per document: the app's copy has the latest status. */
const mergeDocs = (remote: Array<DocInput[] | null>, appDocs: readonly FormDataType[]): DocInput[] => {
    const byId = new Map<string, DocInput>();
    for (const list of remote) {
        for (const d of list || []) {
            const prev = byId.get(d.id);
            byId.set(d.id, prev ? { ...prev, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined)) } as DocInput : d);
        }
    }
    for (const f of appDocs) {
        if (!f || !f.id) continue;
        const local = docInputOf(f);
        const prev = byId.get(local.id);
        if (!prev) { byId.set(local.id, local); continue; }
        const filled = Object.fromEntries(Object.entries(local).filter(([, v]) => v !== null && v !== undefined)) as Partial<DocInput>;
        byId.set(local.id, { ...prev, ...filled, status: local.status ?? prev.status });
    }
    return [...byId.values()];
};

const NotificationCenter: React.FC<NotificationCenterProps> = (props) => {
    const { userId, online, forms, jobs, inventory, usage, docUsage, outboxItems } = props;
    const handlers = useRef(props);
    handlers.current = props;

    const stored = useSyncExternalStore(notificationStore.subscribe, notificationStore.getSnapshot, notificationStore.getSnapshot);
    const [remote, setRemote] = useState<Remote>(EMPTY_REMOTE);
    const [primed, setPrimed] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const uidRef = useRef(userId);
    uidRef.current = userId;
    const lastFast = useRef(0);
    const lastSlow = useRef(0);
    const mountedAt = useRef(Date.now());
    const known = useRef<Set<string>>(new Set());
    const forumUnreadRef = useRef<number | null>(null);

    // ---------------------------------------------------------------- user + saved state
    useEffect(() => {
        notificationStore.init(userId);
        setRemote(EMPTY_REMOTE);
        setPrimed(false);
        lastFast.current = 0;
        lastSlow.current = 0;
        mountedAt.current = Date.now();
        known.current = new Set();
        forumUnreadRef.current = null;
        return () => { notificationStore.flush(); };
    }, [userId]);

    useEffect(() => () => { centerStore.reset(); }, []);

    // ---------------------------------------------------------------- reads
    const refresh = useCallback(async (which: { fast?: boolean; slow?: boolean }) => {
        const uid = uidRef.current;
        if (!uid || !onlineNow()) return;
        const jobsList: Array<Promise<Partial<Remote>>> = [];
        if (which.fast) {
            lastFast.current = Date.now();
            jobsList.push(
                fetchActivityDocs(uid).then(activity => (activity ? { activity } : {})).catch(() => ({})),
                fetchRequests().then(requests => (requests ? { requests } : {})).catch(() => ({})),
                fetchForum(uid).then(forum => (forum ? { forum } : {})).catch(() => ({})),
            );
        }
        if (which.slow) {
            lastSlow.current = Date.now();
            jobsList.push(
                fetchDueDocs(uid).then(due => (due ? { due } : {})).catch(() => ({})),
                fetchOrders(uid).then(orders => (orders ? { orders } : {})).catch(() => ({})),
                fetchReminders(uid).then(reminders => (reminders ? { reminders } : {})).catch(() => ({})),
                fetchGmailAccounts(uid).then(gmail => (gmail ? { gmail } : {})).catch(() => ({})),
                fetchPunchFeedback(uid).then(punch => (punch ? { punch } : {})).catch(() => ({})),
                fetchExpiringPapers(uid).then(papers => (papers ? { papers } : {})).catch(() => ({})),
                fetchUpcomingVisits(uid).then(visits => (visits ? { visits } : {})).catch(() => ({})),
            );
        }
        const parts = await Promise.all(jobsList);
        if (uidRef.current !== uid) return;
        const patch = Object.assign({}, ...parts) as Partial<Remote>;
        if (patch.forum && patch.forum.unread !== forumUnreadRef.current) {
            forumUnreadRef.current = patch.forum.unread;
            handlers.current.onForumUnread?.(patch.forum.unread);
        }
        setRemote(prev => ({ ...prev, ...patch }));
        setNow(Date.now());
    }, []);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const t = window.setTimeout(() => {
            void refresh({ fast: true, slow: true }).finally(() => { if (!cancelled) setPrimed(true); });
        }, FIRST_DELAY_MS);
        return () => { cancelled = true; window.clearTimeout(t); };
    }, [userId, refresh]);

    // Light polling while the tab is visible; catch up when it comes back or the connection returns.
    useEffect(() => {
        if (!userId) return;
        const tick = () => {
            if (!visible()) return;
            setNow(Date.now());
            if (!onlineNow()) return;
            const t = Date.now();
            const fast = t - lastFast.current >= FAST_MS;
            const slow = t - lastSlow.current >= SLOW_MS;
            if (fast || slow) void refresh({ fast, slow });
            if (slow) void notificationStore.syncFromAccount();
        };
        const onVisibility = () => {
            if (!visible()) { notificationStore.flush(); return; }
            setNow(Date.now());
            const t = Date.now();
            if (t - lastFast.current >= BACK_MIN_MS) {
                void refresh({ fast: true, slow: t - lastSlow.current >= SLOW_MS });
                void notificationStore.syncFromAccount();
            }
        };
        const timer = window.setInterval(tick, TICK_MS);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', notificationStore.flush);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', notificationStore.flush);
        };
    }, [userId, refresh]);

    const wasOnline = useRef(online);
    useEffect(() => {
        if (online && !wasOnline.current && userId) {
            void refresh({ fast: true, slow: true });
            void notificationStore.syncFromAccount();
        }
        wasOnline.current = online;
    }, [online, userId, refresh]);

    // App data refreshed (a document saved, a signature merged in…): the list follows at once (time too).
    useEffect(() => { setNow(Date.now()); }, [forms, inventory, outboxItems, usage, docUsage]);

    // ---------------------------------------------------------------- derive
    const jobNames = useMemo(() => new Map(jobs.map(j => [j.id, j.name])), [jobs]);
    const ctx = useMemo(() => ({ uid: userId, now }), [userId, now]);

    const docs = useMemo(() => mergeDocs([remote.activity, remote.due, remote.orders], forms), [remote.activity, remote.due, remote.orders, forms]);
    // stock has no time of its own (first seen is used), so it only changes with the inventory
    const stock = useMemo(() => deriveStockNotifications(inventory, { uid: userId, now: 0 }), [inventory, userId]);

    const derived = useMemo(() => {
        const items = [
            ...deriveDocNotifications(docs, ctx, jobNames),
            ...stock.items,
            ...deriveRequestNotifications(remote.requests || []),
            ...(remote.forum ? deriveForumNotifications(remote.forum.rows, remote.forum.lookups, ctx) : []),
            ...(remote.forum ? deriveThreadReplies(remote.forum, remote.forum.lookups, ctx) : []),
            ...deriveReminderNotifications(remote.reminders || [], ctx),
            ...deriveGmailNotifications(remote.gmail || [], ctx),
            ...deriveOutboxNotifications(outboxItems.map(i => ({ docId: i.docId, userId: i.userId, jobId: i.jobId, type: i.type, status: i.status, error: i.error, data: i.data })), ctx),
            ...deriveLimitNotifications(usage, docUsage, ctx, jobNames),
            ...derivePunchNotifications(remote.punch || [], jobNames),
            ...derivePaperNotifications(remote.papers || [], ctx),
            ...deriveServiceVisitNotifications(remote.visits || [], ctx),
        ];
        return buildNotifications({ now: ctx.now, items, state: stored.state, prefs: stored.prefs, seen: notificationStore.getSeen() });
    }, [docs, stock, remote.requests, remote.forum, remote.reminders, remote.gmail, remote.punch, remote.papers, remote.visits, outboxItems, usage, docUsage, ctx, jobNames, stored.state, stored.prefs]);

    // Low stock that is back to normal: forget it, so the next time it runs low is new again.
    useEffect(() => {
        if (!stock.resolvedIds.length) return;
        notificationStore.update(s => forget(s, stock.resolvedIds));
        const seen = notificationStore.getSeen();
        const pruned = pruneSeen(seen, Date.now(), stock.resolvedIds);
        if (Object.keys(pruned).length !== Object.keys(seen).length) notificationStore.setSeen(pruned);
    }, [stock]);

    useEffect(() => {
        if (derived.seenChanged) notificationStore.setSeen(derived.seen);
    }, [derived]);

    // ---------------------------------------------------------------- actions
    const forumRead = useCallback((ids: string[] | null) => {
        const uid = uidRef.current;
        if (!uid) return;
        const rows = remote.forum?.rows || [];
        const unreadIds = new Set(rows.filter(r => !r.is_read && (!ids || ids.includes(r.id))).map(r => r.id));
        if (ids && !unreadIds.size) return;
        void markForumRead(uid, ids ? [...unreadIds] : null).then((done) => {
            if (!done || uidRef.current !== uid) return;
            setRemote(prev => (prev.forum ? {
                ...prev,
                forum: {
                    ...prev.forum,
                    rows: prev.forum.rows.map(r => (!ids || unreadIds.has(r.id) ? { ...r, is_read: true } : r)),
                    unread: ids ? Math.max(0, prev.forum.unread - unreadIds.size) : 0,
                },
            } : prev));
            const nextUnread = ids ? Math.max(0, (forumUnreadRef.current ?? unreadIds.size) - unreadIds.size) : 0;
            forumUnreadRef.current = nextUnread;
            handlers.current.onForumUnread?.(nextUnread);
        });
    }, [remote.forum]);

    const go = useCallback((n: ShownNotification) => {
        const h = handlers.current;
        switch (n.target.kind) {
            case 'path': openAppPath(h.navigate, n.target.path); break;
            case 'request': h.navigate('/dashboard'); requestOpenQuoteRequest(n.target.requestId); break;
            case 'inventory': h.navigate(`/inventory?item=${encodeURIComponent(n.target.itemId)}`); requestOpenInventoryItem(n.target.itemId); break;
            case 'outbox': h.openOutbox(); break;
        }
    }, []);

    const actions = useMemo(() => ({
        open: (n: ShownNotification) => {
            if (!n.read) notificationStore.update(s => markRead(s, [n.id], Date.now()));
            if (n.forumIds?.length) forumRead(n.forumIds);
            go(n);
        },
        dismiss: (n: ShownNotification) => {
            notificationStore.update(s => dismissIds(s, [n.id], Date.now()));
            if (n.forumIds?.length) forumRead(n.forumIds);
        },
        markAllRead: () => {
            notificationStore.update(s => markAllIds(s, derived.list.map(n => n.id), Date.now()));
            if ((remote.forum?.rows || []).some(r => !r.is_read) || (forumUnreadRef.current ?? 0) > 0) forumRead(null);
        },
        panelOpened: () => {
            const t = Date.now();
            setNow(t);
            if (t - lastFast.current >= OPEN_MIN_MS) void refresh({ fast: true, slow: t - lastSlow.current >= SLOW_MS });
        },
        openSettings: () => openAppPath(handlers.current.navigate, '/settings#notifications'),
    }), [derived.list, forumRead, go, refresh, remote.forum]);

    // ---------------------------------------------------------------- publish
    useEffect(() => {
        centerStore.set({
            list: derived.list,
            unread: derived.unread,
            quiet: stored.prefs.quiet,
            loaded: primed,
            builtAt: now,
            actions,
        });
    }, [derived, stored.prefs.quiet, primed, now, actions]);

    // ---------------------------------------------------------------- browser pop-ups
    useEffect(() => {
        const ids = derived.list.map(n => n.id);
        const inGrace = !primed || Date.now() - mountedAt.current < POP_GRACE_MS;
        if (inGrace) { ids.forEach(id => known.current.add(id)); return; }
        const backgrounded = typeof document !== 'undefined' && (document.visibilityState !== 'visible' || !document.hasFocus());
        const pops = backgrounded
            ? pickPopups(derived.list, known.current, { enabled: stored.device.popups, permission: popupSupport(), quiet: stored.prefs.quiet, now: Date.now() })
            : [];
        ids.forEach(id => known.current.add(id));
        for (const n of pops) showPopup(n.text, n.detail || 'ContractorDocs', `cd-${n.key}`, () => actions.open(n));
    }, [derived, primed, stored.device.popups, stored.prefs.quiet, actions]);

    return null;
};

export default NotificationCenter;
