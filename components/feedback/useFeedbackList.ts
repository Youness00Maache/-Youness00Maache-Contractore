/**
 * Owner side of client feedback: the list of responses (all, or one job's) kept in React state, with the small changes the
 * screens make (a row changed, a new request, a row deleted) applied locally so nothing flickers.
 *   rows: undefined = loading, null = the table is not in the database (hide the feature), [] = none yet
 * Also `useOnline()`: the browser's online / offline state (Settings has no isOnline prop).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { listFeedback } from '../../lib/feedback/feedbackApi.ts';
import type { FeedbackResponse } from '../../lib/feedback/feedbackTypes.ts';
import { describeError } from '../../lib/account.ts';

export const useOnline = (): boolean => {
    const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    return online;
};

export interface FeedbackListState {
    rows: FeedbackResponse[] | null | undefined;
    error: string;
    reload: () => Promise<void>;
    replace: (row: FeedbackResponse) => void;
    add: (row: FeedbackResponse) => void;
    remove: (id: string) => void;
}

export const useFeedbackList = (opts: { jobId?: string | null; enabled: boolean; isOnline: boolean }): FeedbackListState => {
    const { jobId = null, enabled, isOnline } = opts;
    const [rows, setRows] = useState<FeedbackResponse[] | null | undefined>(undefined);
    const [error, setError] = useState('');
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const reload = useCallback(async () => {
        try {
            const list = await listFeedback({ jobId });
            if (!alive.current) return;
            setRows(list);
            setError('');
        } catch (e) {
            if (!alive.current) return;
            setError(describeError(e, 'The feedback could not be loaded.'));
            setRows(prev => (prev === undefined ? [] : prev));
        }
    }, [jobId]);

    useEffect(() => {
        setRows(undefined);
        if (enabled && isOnline) void reload();
    }, [enabled, isOnline, reload]);

    const replace = useCallback((row: FeedbackResponse) => setRows(prev => (prev ? prev.map(r => (r.id === row.id ? row : r)) : prev)), []);
    const add = useCallback((row: FeedbackResponse) => setRows(prev => [row, ...(prev || []).filter(r => r.id !== row.id)]), []);
    const remove = useCallback((id: string) => setRows(prev => (prev ? prev.filter(r => r.id !== id) : prev)), []);
    return { rows, error, reload, replace, add, remove };
};
