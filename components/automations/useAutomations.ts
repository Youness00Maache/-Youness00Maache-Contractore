/**
 * The automation engine (N12): runs inside the notification engine (components/notifications/NotificationCenter.tsx),
 * renders nothing and returns the bell items of the rules the user has on. It
 *   - keeps the rules' saved state (lib/automations/store.ts, in the account),
 *   - reads the little data the rules need (lib/automations/sources.ts) every few minutes while the tab is visible, on
 *     sign-in, when the tab comes back and when the connection returns, and only for rules that are on and whose tool
 *     (tasks, leads, client questions) is 'ready' in the database: otherwise a rule is silent,
 *   - follows the jobs list to notice a job that has just been completed (lib/automations/state.ts trackJobs),
 *   - evaluates the rules (lib/automations/evaluate.ts, pure) and, in "do it for me" mode on a paid plan, makes the
 *     DRAFT they ask for (lib/automations/actions.ts), one at a time, then records it so it is never made twice and the
 *     bell can say "your draft is ready".
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { UserProfile } from '../../types.ts';
import type { AppNotification } from '../../lib/notifications/model.ts';
import { automationStore } from '../../lib/automations/store.ts';
import { resolveAll, ruleAvailable, ruleDef, type ResolvedRule, type RuleId } from '../../lib/automations/rules.ts';
import {
    evalClientReply, evalEstimateApproved, evalEstimateWaiting, evalJobCompleted, evalLeadFollowUp, evalTaskOverdue,
    EVENT_DAYS, type AutoAction, type EstimateRef, type ReplyRef, type TaskRef,
} from '../../lib/automations/evaluate.ts';
import { freshCompletedAt, recordDone, trackJobs } from '../../lib/automations/state.ts';
import {
    fetchClientReplies, fetchOverdueTasks, fetchSentEstimates, fetchSignedEstimates, fetchWarrantyJobs, type SignedEstimates,
} from '../../lib/automations/sources.ts';
import { runAutoAction, type AutoJob } from '../../lib/automations/actions.ts';
import { useTasksFeature } from '../../lib/tasks/taskFeature.ts';
import { useLeadsFeature } from '../../lib/leads/leadsFeature.ts';
import { useLeadsStore } from '../../lib/leads/leadsStore.ts';
import { useQuestionsFeature } from '../../lib/questions/questionsApi.ts';

export interface AutomationJob extends Omit<AutoJob, 'name'> {
    name: string;
    status: string;
    createdAt?: string | null;
}

export interface UseAutomationsArgs {
    userId: string;
    online: boolean;
    now: number;
    profile?: (Partial<UserProfile> & { plan?: string | null }) | null;
    jobs: ReadonlyArray<AutomationJob>;
    /** the jobs list is the whole list from the account (not a device copy or a partial load) */
    jobsReady: boolean;
    jobNames: ReadonlyMap<string, string>;
}

interface Remote {
    signed: SignedEstimates | null;
    sent: EstimateRef[] | null;
    replies: ReplyRef[] | null;
    tasks: TaskRef[] | null;
    /** jobs that already have a warranty, for exactly these candidate jobs */
    warranty: { key: string; ids: Set<string> } | null;
}

const EMPTY_REMOTE: Remote = { signed: null, sent: null, replies: null, tasks: null, warranty: null };
const FIRST_DELAY_MS = 2800;
const REFRESH_MS = 10 * 60_000;
const BACK_MIN_MS = 60_000;
const NO_ITEMS: AppNotification[] = [];

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export function useAutomationNotifications(args: UseAutomationsArgs): AppNotification[] {
    const { userId, online, now, profile, jobs, jobsReady, jobNames } = args;
    const snap = useSyncExternalStore(automationStore.subscribe, automationStore.getSnapshot, automationStore.getSnapshot);
    const [remote, setRemote] = useState<Remote>(EMPTY_REMOTE);
    const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

    useEffect(() => {
        automationStore.init(userId || null);
        setRemote(EMPTY_REMOTE);
        setFailed(new Set());
        return () => { automationStore.flush(); };
    }, [userId]);

    useEffect(() => {
        const flush = () => automationStore.flush();
        const onVisibility = () => { if (!visible()) flush(); };
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', onVisibility);
        return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVisibility); };
    }, []);

    // ---------------------------------------------------------------- which rules are live
    const tier = profile?.plan ?? null;
    const tasksState = useTasksFeature(userId, online);
    const leadsState = useLeadsFeature(userId, online);
    const questionsState = useQuestionsFeature(userId, online);
    const resolved = useMemo(() => resolveAll(snap.prefs, tier), [snap.prefs, tier]);
    const rules = useMemo(() => {
        const tools = { tasks: tasksState, leads: leadsState, questions: questionsState };
        const live = (id: RuleId): ResolvedRule => ({ ...resolved[id], on: resolved[id].on && ruleAvailable(ruleDef(id), tools) });
        return {
            invoice: live('estimate_approved_invoice'), waiting: live('estimate_waiting'), task: live('task_overdue'),
            warranty: live('job_completed_warranty'), lead: live('lead_followup'), reply: live('client_reply'),
        };
    }, [resolved, tasksState, leadsState, questionsState]);

    const leadStore = useLeadsStore(userId, rules.lead.on, online);

    // ---------------------------------------------------------------- jobs just completed
    useEffect(() => {
        if (!userId || !jobsReady || !snap.synced || snap.uid !== userId) return;
        automationStore.updateSeen(seen => trackJobs(seen, jobs, Date.now()));
    }, [userId, jobs, jobsReady, snap.synced, snap.uid]);

    /** completed jobs seen turning completed in the last EVENT_DAYS: the candidates for the warranty rule */
    const candidateIds = useMemo(() => {
        if (!rules.warranty.on) return [] as string[];
        const cutoff = Math.floor(now / 1000) - EVENT_DAYS * 86_400;
        return jobs.filter(j => String(j.status).toLowerCase() === 'completed' && (freshCompletedAt(snap.seen, j.id) ?? 0) >= cutoff).map(j => j.id).sort();
    }, [rules.warranty.on, jobs, snap.seen, now]);
    const candidateKey = candidateIds.join(',');

    // ---------------------------------------------------------------- reads
    const live = useRef({ rules, candidateIds, userId });
    live.current = { rules, candidateIds, userId };
    const lastRun = useRef(0);

    const refresh = useCallback(async () => {
        const { rules: r, candidateIds: ids, userId: uid } = live.current;
        if (!uid || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
        lastRun.current = Date.now();
        const key = ids.join(',');
        const [signed, sent, replies, tasks, warranty] = await Promise.all([
            r.invoice.on ? fetchSignedEstimates(uid) : Promise.resolve(undefined),
            r.waiting.on ? fetchSentEstimates(uid) : Promise.resolve(undefined),
            r.reply.on ? fetchClientReplies() : Promise.resolve(undefined),
            r.task.on ? fetchOverdueTasks() : Promise.resolve(undefined),
            r.warranty.on && ids.length ? fetchWarrantyJobs(uid, ids) : Promise.resolve(undefined),
        ]);
        if (live.current.userId !== uid) return;
        setRemote(prev => ({
            signed: signed === undefined ? (r.invoice.on ? prev.signed : null) : signed,
            sent: sent === undefined ? (r.waiting.on ? prev.sent : null) : sent,
            replies: replies === undefined ? (r.reply.on ? prev.replies : null) : replies,
            tasks: tasks === undefined ? (r.task.on ? prev.tasks : null) : tasks,
            warranty: warranty === undefined ? (ids.length ? prev.warranty : null) : warranty ? { key, ids: warranty } : null,
        }));
    }, []);

    const activeKey = `${rules.invoice.on}${rules.waiting.on}${rules.reply.on}${rules.task.on}${rules.warranty.on}${candidateKey}`;
    useEffect(() => {
        if (!userId) return;
        const first = window.setTimeout(() => { void refresh(); }, FIRST_DELAY_MS);
        const tick = window.setInterval(() => { if (visible()) void refresh(); }, REFRESH_MS);
        const onVisible = () => { if (visible() && Date.now() - lastRun.current >= BACK_MIN_MS) void refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { window.clearTimeout(first); window.clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
    }, [userId, activeKey, refresh]);

    const wasOnline = useRef(online);
    useEffect(() => {
        if (online && !wasOnline.current && userId) { void refresh(); void automationStore.syncFromAccount(); }
        wasOnline.current = online;
    }, [online, userId, refresh]);

    // ---------------------------------------------------------------- evaluate
    const ctx = useMemo(() => ({ now }), [now]);
    const result = useMemo(() => {
        const items: AppNotification[] = [];
        const actions: AutoAction[] = [];
        const add = (o: { items: AppNotification[]; actions: AutoAction[] }) => { items.push(...o.items); actions.push(...o.actions); };

        add(evalEstimateApproved({ estimates: remote.signed?.estimates ?? [], invoiced: remote.signed?.invoiced ?? new Set(), done: snap.done, failed }, rules.invoice, ctx));
        add(evalEstimateWaiting(remote.sent ?? [], rules.waiting, ctx));
        add(evalTaskOverdue(remote.tasks ?? [], jobNames, rules.task, ctx));
        add(evalLeadFollowUp(rules.lead.on ? leadStore.leads ?? [] : [], rules.lead, ctx));
        add(evalClientReply(remote.replies ?? [], jobNames, rules.reply, ctx));
        // a warranty can only be offered once we know which of the candidate jobs already have one
        const warrantyKnown = remote.warranty !== null && remote.warranty.key === candidateKey;
        add(evalJobCompleted({
            jobs: warrantyKnown || !candidateIds.length ? jobs : [], seen: snap.seen,
            hasWarranty: warrantyKnown ? remote.warranty!.ids : new Set<string>(), done: snap.done, failed,
        }, rules.warranty, ctx));
        return { items, actions };
    }, [remote, snap.done, snap.seen, failed, rules, ctx, jobNames, jobs, leadStore.leads, candidateKey, candidateIds.length]);

    // ---------------------------------------------------------------- "do it for me": one draft at a time
    const busy = useRef(false);
    const tried = useRef(new Set<string>());
    const jobMap = useMemo(() => new Map(jobs.map(j => [j.id, j as AutoJob])), [jobs]);
    useEffect(() => {
        if (busy.current || !online || !userId || snap.uid !== userId) return;
        const next = result.actions.find(a => !tried.current.has(a.key));
        if (!next) return;
        busy.current = true;
        tried.current.add(next.key);
        void (async () => {
            const res = await runAutoAction(next, { uid: userId, profile: profile ?? null, jobs: jobMap });
            if (res.ok === false) {
                if (res.reason === 'offline') tried.current.delete(next.key); // try again when the connection is back
                else setFailed(prev => new Set(prev).add(next.key)); // falls back to "tell me" for this one
            } else if (res.entry) {
                const entry = res.entry;
                automationStore.updateDone(d => recordDone(d, next.key, entry, Date.now()));
            } else {
                void refresh(); // it already existed: re-read so the rule sees the invoice / warranty
            }
            busy.current = false;
            setFailed(prev => new Set(prev)); // run the effect again for the next action
        })();
    }, [result.actions, online, userId, snap.uid, profile, jobMap, refresh]);

    return result.items.length ? result.items : NO_ITEMS;
}
