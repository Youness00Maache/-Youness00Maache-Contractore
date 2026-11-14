/**
 * Are suppliers + product library in the database yet? (migration 20261116000200_suppliers_library.sql). Until they
 * are, every new supplier screen / field stays HIDDEN and the app keeps the old settings supplier list (same approach
 * as lib/crew/crewFeature.ts). Checked once per sign-in with a one-row read; a 'ready' answer is remembered for the
 * browser tab so nothing flickers.
 *
 *   useSuppliersFeature(uid, online)  -> 'unknown' | 'ready' | 'missing'   (show the new UI only when 'ready')
 *   markSuppliersMissing()            a call found the tables missing: hide the feature
 */
import { useEffect, useSyncExternalStore } from 'react';
import { probeSuppliersBackend } from './suppliersDb.ts';
import type { SuppliersFeatureState } from './types.ts';

const CACHE_KEY = 'cd.suppliers.feature';
let state: SuppliersFeatureState = (() => {
    try { return sessionStorage.getItem(CACHE_KEY) === 'ready' ? 'ready' : 'unknown'; } catch { return 'unknown'; }
})();
let checkedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const set = (next: SuppliersFeatureState) => {
    if (next === state) return;
    state = next;
    try {
        if (next === 'ready') sessionStorage.setItem(CACHE_KEY, 'ready');
        else sessionStorage.removeItem(CACHE_KEY);
    } catch { /* ignore */ }
    listeners.forEach(l => l());
};

export const suppliersFeatureState = (): SuppliersFeatureState => state;

export const markSuppliersMissing = (): void => set('missing');

export const checkSuppliersFeature = (uid: string | null): Promise<void> => {
    if (!uid) return Promise.resolve();
    if (checkedFor === uid && state !== 'unknown') return Promise.resolve();
    if (inflight) return inflight;
    inflight = probeSuppliersBackend().then((res) => {
        if (res === 'ready') { set('ready'); checkedFor = uid; }
        else if (res === 'missing') { set('missing'); checkedFor = uid; }
        // 'error' (offline...): keep what we know and try again on the next call
    }).finally(() => { inflight = null; });
    return inflight;
};

/** The feature state, checked for the signed-in user (re-checked when the connection comes back). */
export function useSuppliersFeature(uid: string | null | undefined, online = true): SuppliersFeatureState {
    const value = useSyncExternalStore(
        (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        () => state,
        () => 'unknown' as SuppliersFeatureState,
    );
    useEffect(() => {
        if (uid && online) void checkSuppliersFeature(uid);
    }, [uid, online]);
    return value;
}
