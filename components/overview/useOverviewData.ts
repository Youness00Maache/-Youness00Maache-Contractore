/**
 * Business overview data with "show the last copy at once, then read the server" (stale-while-revalidate):
 *   - the copy kept on this device shows immediately (also offline, also after a reload),
 *   - a fresh read replaces it when there is a connection, when Refresh is pressed (`refreshKey`), and when the
 *     Tasks tool becomes ready (its numbers join).
 * `fromDevice` is true while what shows is a saved copy (offline, or not refreshed yet).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadOverviewData, peekOverviewData, OverviewOfflineError, type OverviewData } from './overviewApi.ts';

export const useOverviewData = (opts: { withTasks: boolean; refreshKey?: unknown; isOnline: boolean }) => {
    const { withTasks, refreshKey, isOnline } = opts;
    const [data, setData] = useState<OverviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fromDevice, setFromDevice] = useState(false);
    const alive = useRef(true);
    const seq = useRef(0);

    const reload = useCallback(async () => {
        const mine = ++seq.current;
        setLoading(true);
        try {
            const next = await loadOverviewData(withTasks);
            if (!alive.current || mine !== seq.current) return;
            setData(next);
            setFromDevice(false);
            setError(null);
        } catch (e) {
            if (!alive.current || mine !== seq.current) return;
            if (e instanceof OverviewOfflineError) setFromDevice(true);
            else setError(e instanceof Error ? e.message : 'Could not load your overview.');
        } finally {
            if (alive.current && mine === seq.current) setLoading(false);
        }
    }, [withTasks]);

    const reloadRef = useRef(reload);
    reloadRef.current = reload;

    // first show: the saved copy right away, then a fresh read
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        peekOverviewData().then(cached => {
            if (cancelled) return;
            if (cached) { setData(prev => prev ?? cached); setFromDevice(true); setLoading(false); }
            void reloadRef.current();
        }).catch(() => { if (!cancelled) void reloadRef.current(); });
        return () => { cancelled = true; alive.current = false; };
    }, []);

    // Refresh pressed on the screen, the connection came back, or the Tasks tool became ready
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        void reload();
    }, [refreshKey, isOnline, reload]);

    return { data, loading, error, fromDevice, reload };
};
