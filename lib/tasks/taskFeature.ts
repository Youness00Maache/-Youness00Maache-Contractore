/**
 * Are job tasks in the database yet? (migration 20261116000100_job_tasks.sql). Until they are, the job page's Tasks
 * tab, the Schedule timeline of tasks and the crew link's task list stay HIDDEN. Checked once per sign-in with a
 * one-row read; a 'ready' answer is remembered for the browser tab so the UI doesn't flicker. Same pattern as
 * lib/crew/crewFeature.ts.
 *
 *   const state = useTasksFeature(userId, online);   // 'unknown' | 'ready' | 'missing' → show only when 'ready'
 *   markTasksMissing()                                // a task call found the tables missing: hide the feature
 */
import { useEffect, useSyncExternalStore } from 'react';
import { probeTasksBackend } from './tasksApi.ts';

export type TasksFeatureState = 'unknown' | 'ready' | 'missing';

const CACHE_KEY = 'cd.tasks.feature';
let state: TasksFeatureState = (() => {
    try { return sessionStorage.getItem(CACHE_KEY) === 'ready' ? 'ready' : 'unknown'; } catch { return 'unknown'; }
})();
let checkedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const set = (next: TasksFeatureState) => {
    if (next === state) return;
    state = next;
    try {
        if (next === 'ready') sessionStorage.setItem(CACHE_KEY, 'ready');
        else sessionStorage.removeItem(CACHE_KEY);
    } catch { /* ignore */ }
    listeners.forEach(l => l());
};

export const tasksFeatureState = (): TasksFeatureState => state;

/** A task call found the tables missing: hide the feature. */
export const markTasksMissing = (): void => set('missing');

export const checkTasksFeature = (uid: string | null): Promise<void> => {
    if (!uid) return Promise.resolve();
    if (checkedFor === uid && state !== 'unknown') return Promise.resolve();
    if (inflight) return inflight;
    inflight = probeTasksBackend().then((res) => {
        if (res === 'ready') { set('ready'); checkedFor = uid; }
        else if (res === 'missing') { set('missing'); checkedFor = uid; }
        // 'error' (offline…): keep what we know and try again on the next call
    }).finally(() => { inflight = null; });
    return inflight;
};

/** The feature state, checked for the signed-in user (re-checked when the connection comes back). */
export function useTasksFeature(uid: string | null | undefined, online = true): TasksFeatureState {
    const value = useSyncExternalStore(
        (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        () => state,
        () => 'unknown' as TasksFeatureState,
    );
    useEffect(() => {
        if (uid && online) void checkTasksFeature(uid);
    }, [uid, online]);
    return value;
}
