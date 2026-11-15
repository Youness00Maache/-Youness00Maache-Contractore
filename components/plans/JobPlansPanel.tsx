/**
 * Job page › Plans (Premium, roadmap N9): upload a plan (PDF, first pages, or a photo / image of one), set its scale and
 * measure lengths, areas and counts on it; totals per label go to an estimate as one line (components/plans/PlanViewer).
 *
 * No database table: each plan is a file in the private `document-assets` bucket with a small measurement file next to
 * it (lib/plans/planFiles.ts, lib/plans/plansApi.ts). The list is one folder listing.
 */
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormType, type FormData as FormDataType, type Job, type SavedItem } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import { formatBytes } from '../../lib/jobFiles/jobFileLogic.ts';
import { PLAN_ACCEPT, PLAN_LIMITS, validatePlanFile, type PlanEntry } from '../../lib/plans/planFiles.ts';
import { deletePlan, listPlans, uploadPlan } from '../../lib/plans/plansApi.ts';
import { recentWhen } from '../../lib/measure.ts';
import { getDocumentTitle } from '../../lib/documents.ts';
import { makeSeedPrefill } from '../forms/useDocumentForm.ts';
import { ActionMenu, ConfirmDialog } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { PlusIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { TypeStamp } from '../jobFiles/ui.tsx';
import type { DraftEstimateRef } from './PlanViewer.tsx';

const PlanViewer = lazy(() => import('./PlanViewer.tsx'));

export const PLANS_PREMIUM_REASON = 'Measuring plans (takeoff) is part of Premium.';

interface JobPlansPanelProps {
    job: Job;
    userId: string;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
    /** documents of this job (draft estimates are offered in "Add to estimate") */
    documents: FormDataType[];
    savedItems: SavedItem[];
}

const JobPlansPanel: React.FC<JobPlansPanelProps> = ({ job, userId, plan, isOnline, onUpgrade, documents, savedItems }) => {
    const paid = isPaidTier(plan);
    const navigate = useNavigate();
    const [plans, setPlans] = useState<PlanEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState<string | null>(null);
    const [open, setOpen] = useState<PlanEntry | null>(null);
    const [confirm, setConfirm] = useState<PlanEntry | null>(null);
    const [deleting, setDeleting] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            setPlans(await listPlans(userId, job.id));
        } catch (e) {
            setError(describeError(e, 'The plans could not be loaded.'));
        }
    }, [userId, job.id]);
    useEffect(() => { if (isOnline) void load(); }, [load, isOnline]);

    const draftEstimates: DraftEstimateRef[] = documents
        .filter(d => String(d.type) === FormType.Estimate && /^draft$/i.test(String((d.data as { status?: unknown } | null)?.status || 'Draft')))
        .slice(0, 8)
        .map(d => ({ id: d.id, title: getDocumentTitle(d) }));

    const pick = async (list: FileList | null, input: HTMLInputElement | null) => {
        const files = Array.from(list || []);
        if (input) input.value = '';
        if (!files.length) return;
        if (!paid) { onUpgrade(PLANS_PREMIUM_REASON); return; }
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        const added: PlanEntry[] = [];
        for (const f of files) {
            const problem = validatePlanFile({ name: f.name, size: f.size, type: f.type });
            if (problem) { toast.error(`${f.name}: ${problem}`); continue; }
            setUploading(files.length > 1 ? `Uploading ${added.length + 1} of ${files.length}…` : 'Uploading…');
            try {
                added.push(await uploadPlan(userId, job.id, f));
            } catch (e) {
                toast.error(describeError(e, `${f.name} could not be uploaded.`));
            }
        }
        setUploading(null);
        if (added.length) {
            setPlans(p => [...added, ...(p || [])]);
            if (added.length === 1) setOpen(added[0]);
            else toast.success(`Added ${added.length} plans.`);
        }
    };

    const remove = async () => {
        if (!confirm) return;
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        setDeleting(true);
        try {
            await deletePlan(confirm);
            setPlans(p => (p || []).filter(x => x.path !== confirm.path));
            setConfirm(null);
        } catch (e) {
            toast.error(describeError(e, 'The plan could not be deleted.'));
        } finally {
            setDeleting(false);
        }
    };

    const startUpload = () => {
        if (!paid) { onUpgrade(PLANS_PREMIUM_REASON); return; }
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        fileRef.current?.click();
    };

    if (!paid && plans !== null && plans.length === 0) {
        return (
            <section className="rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="plans-premium">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
                <h3 id="plans-premium" className="mt-1 text-lg font-bold">Measure right on the plans</h3>
                <p className="mt-1 text-sm text-muted-foreground">Upload a PDF or a photo of the plans, set the scale from one known length, then trace walls, rooms and fixtures. Totals per label (drywall, flooring, outlets…) with waste go straight onto an estimate.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={() => onUpgrade(PLANS_PREMIUM_REASON)}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            </section>
        );
    }

    return (
        <section aria-labelledby="plans-heading" className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="plans-heading" className="text-base font-bold leading-tight">Plans</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {plans === null ? 'Loading…' : plans.length ? `${plans.length} plan${plans.length === 1 ? '' : 's'} · measure lengths, areas and counts` : 'Upload a plan to measure it: PDF (first 10 pages) or an image.'}
                        </p>
                    </div>
                    <HelpButton topic="plans" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-primary h-10 shrink-0 px-3.5" onClick={startUpload} disabled={!!uploading}><PlusIcon className="h-4 w-4" /> Add plan</button>
                    <span className="text-xs text-muted-foreground">PDF, JPG, PNG or WebP · up to {formatBytes(PLAN_LIMITS.maxBytes)}</span>
                </div>
                <input ref={fileRef} type="file" accept={PLAN_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={e => { void pick(e.target.files, e.currentTarget); }} />
                {uploading && <p className="mt-3 text-sm font-medium text-muted-foreground" role="status">{uploading}</p>}
            </div>

            {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm" role="status">Plans need a connection: they open again when you're back online.</p>}
            {!paid && plans && plans.length > 0 && (
                <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">Measuring plans is part of Premium. You can still open these; <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(PLANS_PREMIUM_REASON)}>upgrade</button> to add and measure.</p>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error} <button type="button" className="underline" onClick={() => { void load(); }}>Try again</button></p>}

            {plans && plans.length > 0 && (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                    {plans.map(p => (
                        <li key={p.path} className="flex items-center gap-3 px-3 py-2.5">
                            <TypeStamp text={p.kind === 'pdf' ? 'PDF' : 'IMG'} />
                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (isOnline ? setOpen(p) : toast.error(NEEDS_CONNECTION))}>
                                <span className="block truncate text-sm font-semibold">{p.title}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {p.measuredAt ? `Measured · ${recentWhen(p.measuredAt)}` : 'Not measured yet'}
                                    {p.size ? ` · ${formatBytes(p.size)}` : ''}
                                </span>
                            </button>
                            <button type="button" className="btn btn-outline btn-sm h-9 shrink-0" onClick={() => (isOnline ? setOpen(p) : toast.error(NEEDS_CONNECTION))}>{paid ? 'Measure' : 'Open'}</button>
                            <ActionMenu label={`More for ${p.title}`} items={[
                                { label: 'Delete plan', destructive: true, onSelect: () => (paid ? setConfirm(p) : onUpgrade(PLANS_PREMIUM_REASON)) },
                            ]} />
                        </li>
                    ))}
                </ul>
            )}

            {open && (
                <Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center bg-background text-sm text-muted-foreground">Opening the plan…</div>}>
                    <PlanViewer
                        plan={open}
                        canEdit={paid}
                        isOnline={isOnline}
                        savedItems={savedItems}
                        draftEstimates={draftEstimates}
                        jobId={job.id}
                        onClose={() => setOpen(null)}
                        onSaved={(next) => { setPlans(list => (list || []).map(x => (x.path === next.path ? next : x))); setOpen(o => (o && o.path === next.path ? next : o)); }}
                        onNewEstimate={(seed) => {
                            setOpen(null);
                            navigate(`/jobs/${job.id}/forms/${encodeURIComponent(FormType.Estimate)}`, { state: { prefillData: makeSeedPrefill(seed), fromJob: true } });
                        }}
                        onOpenEstimate={(id) => {
                            setOpen(null);
                            navigate(`/jobs/${job.id}/forms/${encodeURIComponent(FormType.Estimate)}/${id}`, { state: { fromJob: true } });
                        }}
                        onUpgrade={() => onUpgrade(PLANS_PREMIUM_REASON)}
                    />
                </Suspense>
            )}

            <ConfirmDialog
                open={!!confirm}
                title="Delete this plan?"
                message={confirm ? `“${confirm.title}” and its measurements are deleted for good.` : ''}
                confirmLabel="Delete"
                destructive
                busy={deleting}
                onConfirm={() => { void remove(); }}
                onCancel={() => setConfirm(null)}
            />
        </section>
    );
};

export default JobPlansPanel;
