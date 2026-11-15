/**
 * Client portal project dashboard (roadmap D9): the Supabase call.
 *
 *   loadPortalDashboard(portalKey, jobId?)  -> DashboardResult
 *     { status: 'ready', dashboard }   parsed payload (lib/portal/dashboardLogic.ts parseDashboard); render it with
 *                                      buildDashboardView(dashboard)
 *     { status: 'missing' }            the database doesn't have get_portal_project_dashboard yet (migration
 *                                      20261116000300 not applied): render NOTHING, the portal stays exactly as today.
 *                                      Remembered until the page reloads (no repeated calls).
 *     { status: 'invalid' }            bad portal key, or a job that is not this client's (same answer by design)
 *     { status: 'error', message }     network / unknown: show a quiet retry, keep the rest of the portal
 *   portalDashboardFeature()           'unknown' | 'ready' | 'missing' (what the last call found)
 *
 * Read-only (a stable SQL function): not a write path, listed in lib/offline/writePathScan.ts READ_ONLY_RPCS.
 * Without jobId the call returns only the client's jobs (job picker) + contractor; with jobId the full dashboard.
 */
import { supabase } from '../supabase.ts';
import { isMissingBackendError } from '../../components/requests/requestLogic.ts';
import { parseDashboard } from './dashboardLogic.ts';
import type { PortalDashboard } from './dashboardTypes.ts';

export const PORTAL_DASHBOARD_RPC = 'get_portal_project_dashboard';

export type DashboardResult =
    | { status: 'ready'; dashboard: PortalDashboard }
    | { status: 'missing' }
    | { status: 'invalid' }
    | { status: 'error'; message: string };

export type DashboardFeatureState = 'unknown' | 'ready' | 'missing';

// In memory only: a reload re-checks, so applying the migration shows the dashboard without clearing anything.
let feature: DashboardFeatureState = 'unknown';
const setFeature = (next: DashboardFeatureState) => { feature = next; };

/** What the last call found ('missing' = hide the dashboard entirely). */
export const portalDashboardFeature = (): DashboardFeatureState => feature;

const PORTAL_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isInvalidLink = (e: { code?: string; message?: string } | null | undefined): boolean =>
    !!e && (e.code === '28000' || /invalid portal link/i.test(String(e.message || '')));

/** The client's project dashboard for one job (or only the job list when jobId is omitted). Never throws. */
export async function loadPortalDashboard(portalKey: string, jobId?: string | null): Promise<DashboardResult> {
    if (feature === 'missing') return { status: 'missing' };
    if (!PORTAL_KEY_RE.test(portalKey || '')) return { status: 'invalid' };
    if (jobId && !UUID_RE.test(jobId)) return { status: 'invalid' };
    try {
        const { data, error } = await supabase.rpc('get_portal_project_dashboard', { p_key: portalKey, p_job_id: jobId || null });
        if (error) {
            if (isMissingBackendError(error)) { setFeature('missing'); return { status: 'missing' }; }
            if (isInvalidLink(error)) return { status: 'invalid' };
            return { status: 'error', message: error.message || 'Could not load the project.' };
        }
        setFeature('ready');
        return { status: 'ready', dashboard: parseDashboard(data) };
    } catch (e) {
        if (isMissingBackendError(e as any)) { setFeature('missing'); return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Could not load the project.' };
    }
}
