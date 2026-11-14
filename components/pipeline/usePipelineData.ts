/**
 * Board data with stale-while-revalidate: cached data shows at once, then the server is read again. Reloads when
 * the app's document list changes (a save, a payment, a signature), when the tab gets focus, and every 2 minutes
 * while it is visible, so cards move by themselves.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPipelineData, peekPipelineData, type PipelineData } from './pipelineApi.ts';
import { friendlyError } from '../viewKit.tsx';

const REFRESH_MS = 2 * 60 * 1000;

export const usePipelineData = (refreshKey?: unknown) => {
    const [data, setData] = useState<PipelineData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const alive = useRef(true);

    const reload = useCallback(async (force = true) => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { setLoading(false); return; }
        setLoading(true);
        try {
            const next = await loadPipelineData(force);
            if (!alive.current) return;
            setData(next);
            setError(null);
        } catch (e) {
            if (alive.current) setError(friendlyError(e, 'Could not load your pipeline.'));
        } finally {
            if (alive.current) setLoading(false);
        }
    }, []);

    // first show: cached copy right away, then a fresh read
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        peekPipelineData().then(cached => {
            if (cancelled) return;
            if (cached) setData(prev => prev ?? cached);
            void reload(true);
        }).catch(() => { if (!cancelled) void reload(true); });
        const onVisible = () => { if (document.visibilityState === 'visible') void reload(false); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void reload(true); }, REFRESH_MS);
        return () => {
            cancelled = true;
            alive.current = false;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [reload]);

    // the app's documents changed (saved, paid, signed …): read again, once things settle
    const firstKey = useRef(true);
    useEffect(() => {
        if (firstKey.current) { firstKey.current = false; return; }
        const t = window.setTimeout(() => { void reload(true); }, 600);
        return () => window.clearTimeout(t);
    }, [refreshKey, reload]);

    return { data, setData, loading, error, reload };
};
