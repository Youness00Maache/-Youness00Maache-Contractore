/**
 * Is crew clock-in in the database yet? (migration 20261115000100_crew_clock_in.sql). Until it is, the Crew menu
 * item, the job page's Crew tab and the missed clock-out notifications stay hidden. Checked once per sign-in with a
 * one-row read; a 'ready' answer is remembered for the browser tab so the menu doesn't flicker.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { probeCrewBackend } from './crewApi.ts';

export type CrewFeatureState = 'unknown' | 'ready' | 'missing';

const CACHE_KEY = 'cd.crew.feature';
let state: CrewFeatureState = (() => {
    try { return sessionStorage.getItem(CACHE_KEY) === 'ready' ? 'ready' : 'unknown'; } catch { return 'unknown'; }
})();
let checkedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const set = (next: CrewFeatureState) => {
    if (next === state) return;
    state = next;
    try {
        if (next === 'ready') sessionStorage.setItem(CACHE_KEY, 'ready');
        else sessionStorage.removeItem(CACHE_KEY);
    } catch { /* ignore */ }
    listeners.forEach(l => l());
};

export const crewFeatureState = (): CrewFeatureState => state;

/** A crew call found the tables missing: hide the feature. */
export const markCrewMissing = (): void => set('missing');

export const checkCrewFeature = (uid: string | null): Promise<void> => {
    if (!uid) return Promise.resolve();
    if (checkedFor === uid && state !== 'unknown') return Promise.resolve();
    if (inflight) return inflight;
    inflight = probeCrewBackend().then((res) => {
        if (res === 'ready') { set('ready'); checkedFor = uid; }
        else if (res === 'missing') { set('missing'); checkedFor = uid; }
        // 'error' (offline…): keep what we know and try again on the next call
    }).finally(() => { inflight = null; });
    return inflight;
};

/** The feature state, checked for the signed-in user (re-checked when the connection comes back). */
export function useCrewFeature(uid: string | null | undefined, online = true): CrewFeatureState {
    const value = useSyncExternalStore(
        (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        () => state,
        () => 'unknown' as CrewFeatureState,
    );
    useEffect(() => {
        if (uid && online) void checkCrewFeature(uid);
    }, [uid, online]);
    return value;
}
