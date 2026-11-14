/**
 * Small hooks for the supplier screens (roadmap D4): the browser's connection state, the signed-in user and whether the
 * suppliers + product library tables exist yet (lib/suppliers/suppliersFeature.ts). Until they do ('missing' or still
 * 'unknown'), every new supplier screen / field stays hidden and the app behaves exactly as before.
 */
import { useEffect, useState } from 'react';
import { getCurrentUserId } from '../viewKit.tsx';
import { useSuppliersFeature } from '../../lib/suppliers/suppliersFeature.ts';
import type { SuppliersFeatureState } from '../../lib/suppliers/types.ts';

/** true while the browser has a connection (follows the online / offline events). */
export function useOnline(): boolean {
    const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    return online;
}

/** The signed-in user's id (null until known / signed out). */
export function useUid(): string | null {
    const [uid, setUid] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        getCurrentUserId().then((id) => { if (alive) setUid(id); }).catch(() => undefined);
        return () => { alive = false; };
    }, []);
    return uid;
}

/** 'ready' = show the new supplier screens; 'missing' / 'unknown' = the old ones only. */
export function useSuppliersReady(): SuppliersFeatureState {
    return useSuppliersFeature(useUid(), useOnline());
}
