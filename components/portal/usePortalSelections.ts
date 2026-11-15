/**
 * Client portal (roadmap D5 phase B): loads the selections sent to this client and the mood boards the contractor shared,
 * for components/PortalView.tsx. Two calls to lib/portal/selectionsApi.ts, made once the Project view is on.
 *
 *   const ps = usePortalSelections(portalKey, enabled);
 *     ps.phase       'idle' | 'loading' | 'ready' | 'hidden' | 'error'
 *                    hidden = the database doesn't have the functions yet (or the link is not valid): the portal shows
 *                    exactly what it showed before (no section, no badge)
 *     ps.selections  every selection sent to the client (waiting first), ps.waiting = how many wait for a choice (the badge)
 *     ps.boards      the shared boards (every job; the section filters to the job on screen)
 *     ps.reload()    read both again (after "already chosen"), ps.replace(s) = put a chosen selection in the list
 * A failing boards call never hides the selections, and the other way round.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadPortalBoards, loadPortalSelections, type PortalBoard, type PortalSelection } from '../../lib/portal/selectionsApi.ts';
import { splitPortalSelections, waitingSelections } from '../../lib/portal/selectionView.ts';

export type PortalSelectionsPhase = 'idle' | 'loading' | 'ready' | 'hidden' | 'error';

export interface PortalSelectionsApi {
    phase: PortalSelectionsPhase;
    message: string;
    selections: PortalSelection[];
    boards: PortalBoard[];
    waiting: number;
    reload: () => void;
    replace: (s: PortalSelection) => void;
}

export function usePortalSelections(portalKey: string, enabled: boolean): PortalSelectionsApi {
    const [phase, setPhase] = useState<PortalSelectionsPhase>('idle');
    const [message, setMessage] = useState('');
    const [selections, setSelections] = useState<PortalSelection[]>([]);
    const [boards, setBoards] = useState<PortalBoard[]>([]);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setPhase(p => (p === 'ready' ? p : 'loading'));
        (async () => {
            const [s, b] = await Promise.all([loadPortalSelections(portalKey), loadPortalBoards(portalKey)]);
            if (cancelled) return;
            if (b.status === 'ready') setBoards(b.data);
            else if (b.status !== 'error') setBoards([]);
            if (s.status === 'ready') {
                const { waiting, decided } = splitPortalSelections(s.data);
                setSelections([...waiting, ...decided]);
            } else if (s.status !== 'error') {
                setSelections([]);
            }
            const anyReady = s.status === 'ready' || b.status === 'ready';
            if (anyReady) { setMessage(''); setPhase('ready'); return; }
            if (s.status === 'error' || b.status === 'error') {
                setMessage(s.status === 'error' ? s.message : b.status === 'error' ? b.message : '');
                setPhase(prev => (prev === 'ready' ? prev : 'error'));
                return;
            }
            // missing / invalid: the portal stays as it was
            setPhase('hidden');
        })().catch(() => { if (!cancelled) setPhase(prev => (prev === 'ready' ? prev : 'error')); });
        return () => { cancelled = true; };
    }, [portalKey, enabled, attempt]);

    const reload = useCallback(() => setAttempt(n => n + 1), []);
    const replace = useCallback((s: PortalSelection) => {
        setSelections(prev => prev.map(x => (x.id === s.id ? s : x)));
    }, []);

    return { phase, message, selections, boards, waiting: waitingSelections(selections), reload, replace };
}
