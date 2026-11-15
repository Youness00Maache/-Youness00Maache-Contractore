/**
 * A job's mood boards for the Boards tab (components/boards/*): loads them and keeps the list up to date while the
 * contractor works; reads again when the connection is back. No Supabase writes here (lib/boards/boardsApi.ts).
 *
 *   const b = useJobBoards(jobId, online);
 *   b.boards   undefined = loading, null = the feature is not in the database, else newest first
 *   b.error / b.ready / b.reload() / b.upsert(saved) / b.remove(id)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../../lib/account.ts';
import { boardsFeature, listJobBoards } from '../../lib/boards/boardsApi.ts';
import type { JobBoard } from '../../lib/boards/boardTypes.ts';

const byNewest = (a: JobBoard, b: JobBoard): number => String(b.createdAt).localeCompare(String(a.createdAt));

export interface JobBoardsState {
    boards: JobBoard[] | null | undefined;
    error: string;
    ready: boolean;
    reload: () => Promise<void>;
    upsert: (saved: JobBoard) => void;
    remove: (id: string) => void;
}

export function useJobBoards(jobId: string, online: boolean): JobBoardsState {
    const [boards, setBoards] = useState<JobBoard[] | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const reload = useCallback(async () => {
        try {
            const list = await listJobBoards(jobId);
            if (!alive.current) return;
            if (list === null) { boardsFeature.markMissing(); setBoards(null); return; }
            setBoards(list);
            setError('');
            setReady(true);
        } catch (e) {
            if (!alive.current) return;
            setError(describeError(e, 'Your boards could not be loaded.'));
            setBoards(prev => (prev === undefined ? [] : prev));
        }
    }, [jobId]);

    useEffect(() => { setBoards(undefined); setReady(false); void reload(); }, [reload]);
    const wasOnline = useRef(online);
    useEffect(() => { if (online && !wasOnline.current) void reload(); wasOnline.current = online; }, [online, reload]);

    const upsert = useCallback((saved: JobBoard) => {
        setBoards(prev => [...(Array.isArray(prev) ? prev.filter(b => b.id !== saved.id) : []), saved].sort(byNewest));
    }, []);
    const remove = useCallback((id: string) => {
        setBoards(prev => (Array.isArray(prev) ? prev.filter(b => b.id !== id) : prev));
    }, []);

    return { boards, error, ready, reload, upsert, remove };
}
