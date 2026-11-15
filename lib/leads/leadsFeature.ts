/**
 * Are leads + appointments in the database yet? (migration 20261116000500_leads_appointments.sql). Until they are,
 * the new Leads area (stages, manual add, follow-ups, appointments, calendar items) stays HIDDEN and the app keeps
 * today's Requests inbox. Checked once per sign-in with two one-row reads; a 'ready' answer is remembered for the
 * browser tab so the UI doesn't flicker. Same pattern as lib/tasks/taskFeature.ts and lib/crew/crewFeature.ts.
 *
 *   const state = useLeadsFeature(userId, online);   // 'unknown' | 'ready' | 'missing' -> show only when 'ready'
 *   markLeadsMissing()                                // a lead call found the columns / table missing: hide it
 */
import { useEffect, useSyncExternalStore } from 'react';
import { probeLeadsBackend } from './leadsApi.ts';

export type LeadsFeatureState = 'unknown' | 'ready' | 'missing';

const CACHE_KEY = 'cd.leads.feature';
let state: LeadsFeatureState = (() => {
    try { return sessionStorage.getItem(CACHE_KEY) === 'ready' ? 'ready' : 'unknown'; } catch { return 'unknown'; }
})();
let checkedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const set = (next: LeadsFeatureState) => {
    if (next === state) return;
    state = next;
    try {
        if (next === 'ready') sessionStorage.setItem(CACHE_KEY, 'ready');
        else sessionStorage.removeItem(CACHE_KEY);
    } catch { /* ignore */ }
    listeners.forEach(l => l());
};

export const leadsFeatureState = (): LeadsFeatureState => state;

/** A lead call found the database objects missing: hide the feature. */
export const markLeadsMissing = (): void => set('missing');

export const checkLeadsFeature = (uid: string | null): Promise<void> => {
    if (!uid) return Promise.resolve();
    if (checkedFor === uid && state !== 'unknown') return Promise.resolve();
    if (inflight) return inflight;
    inflight = probeLeadsBackend().then((res) => {
        if (res === 'ready') { set('ready'); checkedFor = uid; }
        else if (res === 'missing') { set('missing'); checkedFor = uid; }
        // 'error' (offline...): keep what we know and try again on the next call
    }).finally(() => { inflight = null; });
    return inflight;
};

/** The feature state, checked for the signed-in user (re-checked when the connection comes back). */
export function useLeadsFeature(uid: string | null | undefined, online = true): LeadsFeatureState {
    const value = useSyncExternalStore(
        (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        () => state,
        () => 'unknown' as LeadsFeatureState,
    );
    useEffect(() => {
        if (uid && online) void checkLeadsFeature(uid);
    }, [uid, online]);
    return value;
}
