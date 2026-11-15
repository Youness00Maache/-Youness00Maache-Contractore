/**
 * A job's questions and submittals for the Questions tab (components/questions/*): loads them, keeps the list up to
 * date while the contractor works, and reads again when the connection is back. No Supabase writes here (those are in
 * lib/questions/questionsApi.ts).
 *
 *   const q = useJobQuestions(jobId, online);
 *   q.questions   undefined = loading, null = the feature is not in the database, else sortQuestions order
 *   q.error / q.ready / q.reload() / q.upsert(...saved) / q.remove(id)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../../lib/account.ts';
import { listJobQuestions, questionsFeature } from '../../lib/questions/questionsApi.ts';
import { sortQuestions } from '../../lib/questions/questionLogic.ts';
import type { JobQuestion } from '../../lib/questions/questionTypes.ts';

export interface JobQuestionsState {
    questions: JobQuestion[] | null | undefined;
    error: string;
    ready: boolean;
    reload: () => Promise<void>;
    upsert: (...saved: JobQuestion[]) => void;
    remove: (id: string) => void;
}

export function useJobQuestions(jobId: string, online: boolean): JobQuestionsState {
    const [questions, setQuestions] = useState<JobQuestion[] | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const reload = useCallback(async () => {
        try {
            const list = await listJobQuestions(jobId);
            if (!alive.current) return;
            if (list === null) { questionsFeature.markMissing(); setQuestions(null); return; }
            setQuestions(list);
            setError('');
            setReady(true);
        } catch (e) {
            if (!alive.current) return;
            setError(describeError(e, 'Your questions could not be loaded.'));
            setQuestions(prev => (prev === undefined ? [] : prev));
        }
    }, [jobId]);

    useEffect(() => { setQuestions(undefined); setReady(false); void reload(); }, [reload]);
    // the connection is back: read them again
    const wasOnline = useRef(online);
    useEffect(() => { if (online && !wasOnline.current) void reload(); wasOnline.current = online; }, [online, reload]);

    const upsert = useCallback((...saved: JobQuestion[]) => {
        setQuestions(prev => {
            const cur = Array.isArray(prev) ? prev : [];
            const ids = new Set(saved.map(s => s.id));
            return sortQuestions([...cur.filter(q => !ids.has(q.id)), ...saved]);
        });
    }, []);
    const remove = useCallback((id: string) => {
        setQuestions(prev => (Array.isArray(prev) ? prev.filter(q => q.id !== id) : prev));
    }, []);

    return { questions, error, ready, reload, upsert, remove };
}
