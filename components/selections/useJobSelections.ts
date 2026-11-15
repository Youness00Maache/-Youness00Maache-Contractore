/**
 * A job's client selections for the Selections tab (components/selections/*): loads them, keeps the list up to date while
 * the contractor works, and reads again when the connection is back. No Supabase writes here (those are in
 * lib/selections/selectionsApi.ts).
 *
 *   const s = useJobSelections(jobId, online);
 *   s.selections   undefined = loading, null = the feature is not in the database, else sortSelections order
 *   s.error / s.ready / s.reload() / s.upsert(...saved) / s.remove(id)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../../lib/account.ts';
import { listJobSelections, selectionsFeature } from '../../lib/selections/selectionsApi.ts';
import { sortSelections } from '../../lib/selections/selectionLogic.ts';
import type { JobSelection } from '../../lib/selections/selectionTypes.ts';

export interface JobSelectionsState {
    selections: JobSelection[] | null | undefined;
    error: string;
    ready: boolean;
    reload: () => Promise<void>;
    upsert: (...saved: JobSelection[]) => void;
    remove: (id: string) => void;
}

export function useJobSelections(jobId: string, online: boolean): JobSelectionsState {
    const [selections, setSelections] = useState<JobSelection[] | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const reload = useCallback(async () => {
        try {
            const list = await listJobSelections(jobId);
            if (!alive.current) return;
            if (list === null) { selectionsFeature.markMissing(); setSelections(null); return; }
            setSelections(list);
            setError('');
            setReady(true);
        } catch (e) {
            if (!alive.current) return;
            setError(describeError(e, 'Your selections could not be loaded.'));
            setSelections(prev => (prev === undefined ? [] : prev));
        }
    }, [jobId]);

    useEffect(() => { setSelections(undefined); setReady(false); void reload(); }, [reload]);
    // the connection is back: read them again
    const wasOnline = useRef(online);
    useEffect(() => { if (online && !wasOnline.current) void reload(); wasOnline.current = online; }, [online, reload]);

    const upsert = useCallback((...saved: JobSelection[]) => {
        setSelections(prev => {
            const cur = Array.isArray(prev) ? prev : [];
            const ids = new Set(saved.map(s => s.id));
            return sortSelections([...cur.filter(s => !ids.has(s.id)), ...saved]);
        });
    }, []);
    const remove = useCallback((id: string) => {
        setSelections(prev => (Array.isArray(prev) ? prev.filter(s => s.id !== id) : prev));
    }, []);

    return { selections, error, ready, reload, upsert, remove };
}
