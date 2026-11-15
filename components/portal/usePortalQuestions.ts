/**
 * Client portal (roadmap D3 phase B): loads the questions / submittals sent to this client and the files the contractor
 * shared, for components/PortalView.tsx. Two calls to lib/portal/questionsApi.ts, made once the Project view is on.
 *
 *   const pq = usePortalQuestions(portalKey, enabled);
 *     pq.phase      'idle' | 'loading' | 'ready' | 'hidden' | 'error'
 *                   hidden = the database doesn't have the functions yet or the link is not valid: the portal shows
 *                   exactly what it showed before (no section, no badge)
 *     pq.questions  every item sent to the client (waiting first), pq.waiting = how many are waiting (the tab badge)
 *     pq.files      shared files and links (every job; the section filters to the job on screen)
 *     pq.reload()   read both again (after "already answered"), pq.replace(q) = put an answered item in the list
 * A failing files call never hides the questions, and the other way round.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadPortalJobFiles, loadPortalQuestions, type PortalJobFile, type PortalQuestion } from '../../lib/portal/questionsApi.ts';
import { splitPortalQuestions, waitingCount } from '../../lib/portal/questionView.ts';

export type PortalQuestionsPhase = 'idle' | 'loading' | 'ready' | 'hidden' | 'error';

export interface PortalQuestionsApi {
    phase: PortalQuestionsPhase;
    message: string;
    questions: PortalQuestion[];
    files: PortalJobFile[];
    waiting: number;
    reload: () => void;
    replace: (q: PortalQuestion) => void;
}

export function usePortalQuestions(portalKey: string, enabled: boolean): PortalQuestionsApi {
    const [phase, setPhase] = useState<PortalQuestionsPhase>('idle');
    const [message, setMessage] = useState('');
    const [questions, setQuestions] = useState<PortalQuestion[]>([]);
    const [files, setFiles] = useState<PortalJobFile[]>([]);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setPhase(p => (p === 'ready' ? p : 'loading'));
        (async () => {
            const [q, f] = await Promise.all([loadPortalQuestions(portalKey), loadPortalJobFiles(portalKey)]);
            if (cancelled) return;
            if (f.status === 'ready') setFiles(f.data);
            if (q.status === 'ready') {
                const { waiting, answered } = splitPortalQuestions(q.data);
                setQuestions([...waiting, ...answered]);
                setMessage('');
                setPhase('ready');
            } else if (q.status === 'error') {
                setMessage(q.message);
                setPhase(prev => (prev === 'ready' ? prev : 'error'));
            } else {
                // missing / invalid: the portal stays as it was (the files section can still show on its own)
                setPhase(f.status === 'ready' && f.data.length > 0 ? 'ready' : 'hidden');
                setQuestions([]);
            }
        })().catch(() => { if (!cancelled) setPhase(prev => (prev === 'ready' ? prev : 'error')); });
        return () => { cancelled = true; };
    }, [portalKey, enabled, attempt]);

    const reload = useCallback(() => setAttempt(n => n + 1), []);
    const replace = useCallback((q: PortalQuestion) => {
        setQuestions(prev => prev.map(x => (x.id === q.id ? q : x)));
    }, []);

    return { phase, message, questions, files, waiting: waitingCount(questions), reload, replace };
}
