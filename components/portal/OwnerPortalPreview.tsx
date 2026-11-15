/**
 * Contractor side of the client portal project dashboard (roadmap D9): "What my client sees".
 * A read-only preview built from the contractor's own data with the same filters the database applies for the client
 * (lib/portal/dashboardLogic.ts ownerPreviewDashboard): milestones only (never other tasks), shared photos only,
 * the punch list only when it is shared, client-facing documents without Drafts. Nothing is written anywhere.
 *
 * Opened from the "Client portal" card on the client page (components/ClientDetails.tsx).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.ts';
import { Modal, Notice, cx } from '../commsKit.tsx';
import { listJobPhotos } from '../photos/photosApi.ts';
import { loadPunchList } from '../punch/punchApi.ts';
import { listJobTasks } from '../../lib/tasks/tasksApi.ts';
import { buildDashboardView, ownerPreviewDashboard, pickDefaultJob, type OwnerPreviewInput } from '../../lib/portal/dashboardLogic.ts';
import type { DashboardView } from '../../lib/portal/dashboardTypes.ts';
import type { UserProfile } from '../../types.ts';
import PortalProjectDashboard, { JobSwitcher, ProjectSkeleton } from './PortalProjectDashboard.tsx';

export interface PreviewJob { id: string; name: string; status: string; startDate: string | null; endDate: string | null }

/** Reads one job's data for the preview; anything that can't be read (feature not in the database, offline) counts as empty. */
async function loadPreviewInput(job: PreviewJob, userId: string | null, profile: UserProfile | null | undefined): Promise<OwnerPreviewInput> {
    const quiet = async <T,>(run: () => Promise<T | null | undefined>): Promise<T | null> => {
        try { return (await run()) ?? null; } catch { return null; }
    };
    const [tasks, photos, punch, docs, jobRow] = await Promise.all([
        quiet(() => listJobTasks(job.id)),
        quiet(() => listJobPhotos(job.id)),
        quiet(() => (userId ? loadPunchList(userId, job.id) : Promise.resolve(null))),
        quiet(async () => {
            const { data, error } = await supabase.from('documents').select('id, type, created_at, data').eq('job_id', job.id).order('created_at', { ascending: false }).limit(200);
            if (error) throw error;
            return data as Array<{ id: string; type: string; created_at: string; data: Record<string, any> }>;
        }),
        quiet(async () => {
            const { data } = await supabase.from('jobs').select('client_address').eq('id', job.id).maybeSingle();
            return data as { client_address?: string | null } | null;
        }),
    ]);
    return {
        job: { id: job.id, name: job.name, status: job.status, startDate: job.startDate, endDate: job.endDate, clientAddress: jobRow?.client_address ?? null },
        contractor: {
            name: profile?.name, companyName: profile?.companyName, logoUrl: profile?.logoUrl, phone: profile?.phone,
            email: profile?.email, website: profile?.website, address: profile?.address,
        },
        tasks: tasks || [],
        documents: (docs || []).map(d => ({ id: d.id, type: d.type, createdAt: d.created_at, data: d.data || {} })),
        photos: photos || [],
        punch: punch ? { shared: punch.shared, items: punch.items } : null,
    };
}

const OwnerPortalPreview: React.FC<{
    open: boolean;
    onClose: () => void;
    clientName: string;
    jobs: PreviewJob[];
    userId: string | null;
    profile?: UserProfile | null;
}> = ({ open, onClose, clientName, jobs, userId, profile }) => {
    const [jobId, setJobId] = useState<string | null>(null);
    const [view, setView] = useState<DashboardView | null>(null);
    const [failed, setFailed] = useState(false);

    // each time it opens: the job in progress (else the newest), like the client's default
    useEffect(() => {
        if (open) setJobId(pickDefaultJob(jobs)?.id || null);
    }, [open, jobs]);

    const load = useCallback(async (id: string) => {
        const job = jobs.find(j => j.id === id);
        if (!job) return;
        setView(null);
        setFailed(false);
        try {
            const input = await loadPreviewInput(job, userId, profile);
            setView(buildDashboardView(ownerPreviewDashboard(input)));
        } catch {
            setFailed(true);
        }
    }, [jobs, userId, profile]);

    useEffect(() => {
        if (open && jobId) void load(jobId);
    }, [open, jobId, load]);

    const first = clientName.trim().split(/\s+/)[0] || 'Your client';
    return (
        <Modal
            open={open}
            onClose={onClose}
            size="xl"
            title={`What ${first} sees`}
            description="Their portal's project page, as it looks to them. Read-only: nothing here can be changed or sent."
        >
            <div className="space-y-5 pb-2">
                {jobs.length > 1 && <JobSwitcher jobs={jobs} activeId={jobId} onSelect={setJobId} />}
                {failed ? (
                    <Notice tone="danger" action={<button type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={() => jobId && load(jobId)}>Try again</button>}>
                        The preview could not be loaded.
                    </Notice>
                ) : view ? (
                    <PortalProjectDashboard view={view} readOnly />
                ) : (
                    <ProjectSkeleton />
                )}
                <p className={cx('text-xs text-muted-foreground')}>
                    Only milestones are shown, never your other tasks. Photos and the punch list appear when you switch on “Show in client portal”. Drafts and internal documents stay hidden.
                </p>
            </div>
        </Modal>
    );
};

export default OwnerPortalPreview;
