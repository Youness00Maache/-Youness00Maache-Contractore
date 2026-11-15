/**
 * Is the sent-email log in the database yet? (migration 20261116001200_email_log.sql). Until it is, the client screen's
 * "Emails sent" list and the timeline's email entries stay HIDDEN (the timeline stays exactly as before). Checked once
 * per sign-in with a one-row read; a 'ready' answer is remembered for the browser tab. Same pattern as
 * lib/tasks/taskFeature.ts.
 *
 *   const state = useEmailLogFeature(userId, online);   // 'unknown' | 'ready' | 'missing' -> show only when 'ready'
 *   markEmailLogMissing()                                // a call found the table missing: hide the feature
 */
import { useEffect, useSyncExternalStore } from 'react';

export type EmailLogFeatureState = 'unknown' | 'ready' | 'missing';

const CACHE_KEY = 'cd.emailLog.feature';
let state: EmailLogFeatureState = (() => {
    try { return sessionStorage.getItem(CACHE_KEY) === 'ready' ? 'ready' : 'unknown'; } catch { return 'unknown'; }
})();
let checkedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const set = (next: EmailLogFeatureState) => {
    if (next === state) return;
    state = next;
    try {
        if (next === 'ready') sessionStorage.setItem(CACHE_KEY, 'ready');
        else sessionStorage.removeItem(CACHE_KEY);
    } catch { /* ignore */ }
    listeners.forEach(l => l());
};

export const emailLogFeatureState = (): EmailLogFeatureState => state;

/** A call found the table missing: hide the feature. */
export const markEmailLogMissing = (): void => set('missing');

export const checkEmailLogFeature = (uid: string | null): Promise<void> => {
    if (!uid) return Promise.resolve();
    if (checkedFor === uid && state !== 'unknown') return Promise.resolve();
    if (inflight) return inflight;
    // imported lazily: emailLogApi imports this module (markEmailLogMissing)
    inflight = import('./emailLogApi.ts').then(m => m.probeEmailLogBackend()).then((res) => {
        if (res === 'ready') { set('ready'); checkedFor = uid; }
        else if (res === 'missing') { set('missing'); checkedFor = uid; }
        // 'error' (offline...): keep what we know and try again on the next call
    }).catch(() => undefined).finally(() => { inflight = null; });
    return inflight;
};

/** The feature state, checked for the signed-in user (re-checked when the connection comes back). */
export function useEmailLogFeature(uid: string | null | undefined, online = true): EmailLogFeatureState {
    const value = useSyncExternalStore(
        (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        () => state,
        () => 'unknown' as EmailLogFeatureState,
    );
    useEffect(() => {
        if (uid && online) void checkEmailLogFeature(uid);
    }, [uid, online]);
    return value;
}
