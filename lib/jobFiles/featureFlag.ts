/**
 * "Is this table in the database yet?" for features whose migration may not be applied (same pattern as
 * lib/tasks/taskFeature.ts / lib/crew/crewFeature.ts). Checked once per sign-in with a one-row read; a 'ready' answer
 * is remembered for the browser tab so the UI doesn't flicker. Show the feature ONLY when the state is 'ready'.
 *
 *   const flag = createBackendFeature('cd.jobFiles.feature', probe);
 *   flag.useFeature(userId, online)   // 'unknown' | 'ready' | 'missing'
 *   flag.markMissing()                // a call found the table missing: hide the feature
 *   flag.state()                      // current value
 */
import { useEffect, useSyncExternalStore } from 'react';

export type BackendFeatureState = 'unknown' | 'ready' | 'missing';

export interface BackendFeature {
    state: () => BackendFeatureState;
    markMissing: () => void;
    check: (uid: string | null) => Promise<void>;
    useFeature: (uid: string | null | undefined, online?: boolean) => BackendFeatureState;
}

export const createBackendFeature = (
    cacheKey: string,
    probe: () => Promise<'ready' | 'missing' | 'error'>,
): BackendFeature => {
    let state: BackendFeatureState = (() => {
        try { return sessionStorage.getItem(cacheKey) === 'ready' ? 'ready' : 'unknown'; } catch { return 'unknown'; }
    })();
    let checkedFor: string | null = null;
    let inflight: Promise<void> | null = null;
    const listeners = new Set<() => void>();

    const set = (next: BackendFeatureState) => {
        if (next === state) return;
        state = next;
        try {
            if (next === 'ready') sessionStorage.setItem(cacheKey, 'ready');
            else sessionStorage.removeItem(cacheKey);
        } catch { /* ignore */ }
        listeners.forEach(l => l());
    };

    const check = (uid: string | null): Promise<void> => {
        if (!uid) return Promise.resolve();
        if (checkedFor === uid && state !== 'unknown') return Promise.resolve();
        if (inflight) return inflight;
        inflight = probe().then((res) => {
            if (res === 'ready') { set('ready'); checkedFor = uid; }
            else if (res === 'missing') { set('missing'); checkedFor = uid; }
            // 'error' (offline...): keep what we know and try again on the next call
        }).finally(() => { inflight = null; });
        return inflight;
    };

    function useFeature(uid: string | null | undefined, online = true): BackendFeatureState {
        const value = useSyncExternalStore(
            (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
            () => state,
            () => 'unknown' as BackendFeatureState,
        );
        useEffect(() => {
            if (uid && online) void check(uid);
        }, [uid, online]);
        return value;
    }

    return { state: () => state, markMissing: () => set('missing'), check, useFeature };
};
