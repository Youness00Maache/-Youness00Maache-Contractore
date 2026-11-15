/**
 * Client portal project dashboard (roadmap D9): loads it for components/PortalView.tsx.
 *
 *   const dash = usePortalDashboard(portalKey);
 *     dash.phase    'loading' | 'hidden' | 'ready' | 'error'
 *                   hidden = the database doesn't have the function yet, the key/job is not valid or the client has no
 *                   jobs: the portal shows exactly what it showed before (nothing new, no banner)
 *                   error  = network trouble: the portal shows a quiet "Try again" line and stays usable
 *     dash.settled  false only while the first answer is still on its way (capped, so a slow call never blocks the page)
 *     dash.jobs / jobId / selectJob(id)   the client's jobs (the job switcher) and the one on screen
 *     dash.view     DashboardView of that job (null while it loads), dash.jobPhase 'loading' | 'ready' | 'error'
 *     dash.retry() first call again, dash.retryJob() the job again, dash.refresh() quiet reload (after a signature / payment note)
 *
 * Two calls to lib/portal/dashboardApi.ts: the job list first, then the default job (the one in progress, else the
 * newest). Answers that arrive late for a job the client has already left are dropped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadPortalDashboard } from '../../lib/portal/dashboardApi.ts';
import { buildDashboardView, pickDefaultJob } from '../../lib/portal/dashboardLogic.ts';
import type { DashboardJobSummary, DashboardView, PortalDashboard } from '../../lib/portal/dashboardTypes.ts';

/** Longest the portal waits for the first answer before it shows the page without it (it joins in when it arrives). */
export const FIRST_ANSWER_WAIT_MS = 1800;

type ListState = { phase: 'loading' | 'hidden' | 'ready' | 'error'; jobs: DashboardJobSummary[]; message: string };
type DetailState = { phase: 'loading' | 'ready' | 'error'; dashboard: PortalDashboard | null; message: string };

export interface PortalDashboardApi {
    phase: ListState['phase'];
    settled: boolean;
    message: string;
    jobs: DashboardJobSummary[];
    jobId: string | null;
    view: DashboardView | null;
    jobPhase: DetailState['phase'];
    jobMessage: string;
    selectJob: (id: string) => void;
    /** try the first call again */
    retry: () => void;
    /** try the job on screen again (after an error) */
    retryJob: () => void;
    /** quiet reload of the job on screen (after a signature or a payment note) */
    refresh: () => void;
}

export function usePortalDashboard(portalKey: string): PortalDashboardApi {
    const [list, setList] = useState<ListState>({ phase: 'loading', jobs: [], message: '' });
    const [jobId, setJobId] = useState<string | null>(null);
    const [detail, setDetail] = useState<DetailState>({ phase: 'loading', dashboard: null, message: '' });
    const [timedOut, setTimedOut] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const seq = useRef(0);

    // 1. the client's jobs
    useEffect(() => {
        let cancelled = false;
        setList({ phase: 'loading', jobs: [], message: '' });
        setJobId(null);
        (async () => {
            const res = await loadPortalDashboard(portalKey);
            if (cancelled) return;
            if (res.status === 'ready') {
                const jobs = res.dashboard.jobs;
                if (!jobs.length) { setList({ phase: 'hidden', jobs: [], message: '' }); return; }
                setList({ phase: 'ready', jobs, message: '' });
                setJobId(pickDefaultJob(jobs)?.id || jobs[0].id);
            } else if (res.status === 'error') setList({ phase: 'error', jobs: [], message: res.message });
            else setList({ phase: 'hidden', jobs: [], message: '' });
        })().catch(() => { if (!cancelled) setList({ phase: 'error', jobs: [], message: 'Could not load the project.' }); });
        return () => { cancelled = true; };
    }, [portalKey, attempt]);

    // 2. the job on screen (silent = keep what is shown while it reloads)
    const loadDetail = useCallback(async (id: string, silent: boolean) => {
        const mine = ++seq.current;
        if (!silent) setDetail({ phase: 'loading', dashboard: null, message: '' });
        const res = await loadPortalDashboard(portalKey, id);
        if (mine !== seq.current) return;
        if (res.status === 'ready') setDetail({ phase: 'ready', dashboard: res.dashboard, message: '' });
        else if (!silent) setDetail({ phase: 'error', dashboard: null, message: res.status === 'error' ? res.message : 'This project is not available right now.' });
    }, [portalKey]);

    useEffect(() => {
        if (!jobId) return;
        void loadDetail(jobId, false).catch(() => undefined);
    }, [jobId, loadDetail]);

    // 3. never hold the page back for long
    useEffect(() => {
        setTimedOut(false);
        const t = window.setTimeout(() => setTimedOut(true), FIRST_ANSWER_WAIT_MS);
        return () => window.clearTimeout(t);
    }, [portalKey, attempt]);

    const view = useMemo(() => (detail.dashboard ? buildDashboardView(detail.dashboard) : null), [detail.dashboard]);
    const selectJob = useCallback((id: string) => setJobId(id), []);
    const retry = useCallback(() => setAttempt(n => n + 1), []);
    const retryJob = useCallback(() => { if (jobId) void loadDetail(jobId, false).catch(() => undefined); }, [jobId, loadDetail]);
    const refresh = useCallback(() => { if (jobId) void loadDetail(jobId, true).catch(() => undefined); }, [jobId, loadDetail]);

    return {
        phase: list.phase,
        settled: list.phase !== 'loading' || timedOut,
        message: list.message,
        jobs: list.jobs,
        jobId,
        view,
        jobPhase: jobId ? detail.phase : 'loading',
        jobMessage: detail.message,
        selectJob,
        retry,
        retryJob,
        refresh,
    };
}
