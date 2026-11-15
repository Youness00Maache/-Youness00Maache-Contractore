/**
 * A job's files and links for the Files tab (components/jobFiles/*): loads them, keeps the list up to date while the
 * contractor adds / changes / removes, and reads again when the connection is back. No Supabase writes here (those are
 * in lib/jobFiles/jobFilesApi.ts).
 *
 *   const f = useJobFiles(jobId, online);
 *   f.files     undefined = loading, null = the feature is not in the database, else every version (newest first)
 *   f.error     a readable sentence ('' when fine); f.ready = the first read worked
 *   f.upsert(...saved) / f.remove(...ids) / f.reload()
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../../lib/account.ts';
import { jobFilesFeature, listJobFiles } from '../../lib/jobFiles/jobFilesApi.ts';
import type { JobFile } from '../../lib/jobFiles/jobFileTypes.ts';

export interface JobFilesState {
    files: JobFile[] | null | undefined;
    error: string;
    ready: boolean;
    reload: () => Promise<void>;
    upsert: (...saved: JobFile[]) => void;
    remove: (...ids: string[]) => void;
}

const newestFirst = (list: JobFile[]): JobFile[] =>
    [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

export function useJobFiles(jobId: string, online: boolean): JobFilesState {
    const [files, setFiles] = useState<JobFile[] | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const reload = useCallback(async () => {
        try {
            const list = await listJobFiles(jobId);
            if (!alive.current) return;
            if (list === null) { jobFilesFeature.markMissing(); setFiles(null); return; }
            setFiles(list);
            setError('');
            setReady(true);
        } catch (e) {
            if (!alive.current) return;
            setError(describeError(e, 'Your files could not be loaded.'));
            setFiles(prev => (prev === undefined ? [] : prev));
        }
    }, [jobId]);

    useEffect(() => { setFiles(undefined); setReady(false); void reload(); }, [reload]);
    // the connection is back: read them again
    const wasOnline = useRef(online);
    useEffect(() => { if (online && !wasOnline.current) void reload(); wasOnline.current = online; }, [online, reload]);

    const upsert = useCallback((...saved: JobFile[]) => {
        setFiles(prev => {
            const cur = Array.isArray(prev) ? prev : [];
            const ids = new Set(saved.map(s => s.id));
            return newestFirst([...cur.filter(f => !ids.has(f.id)), ...saved]);
        });
    }, []);
    const remove = useCallback((...ids: string[]) => {
        const gone = new Set(ids);
        setFiles(prev => (Array.isArray(prev) ? prev.filter(f => !gone.has(f.id)) : prev));
    }, []);

    return { files, error, ready, reload, upsert, remove };
}
