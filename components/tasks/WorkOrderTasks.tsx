/**
 * Work order › Tasks: "Create tasks from this work order" (one task per line of the description, "Get materials" first
 * when materials are listed, assigned to the person named in "Assigned to") with a review step, and a small
 * "Tasks: 2 of 5 done" that opens the job's Tasks tab. Not printed: the PDF is unchanged.
 * Rendered by WorkOrderForm when job tasks are in the database (App passes `tasksUi`).
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Job, WorkOrderData } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import { nextSortOrder, proposalsToDrafts, todayYmd } from '../../lib/tasks/taskLogic.ts';
import { createTasks, listJobTasks, listWorkOrderTasks } from '../../lib/tasks/tasksApi.ts';
import { WORK_ORDER_TYPE, workOrderTaskProgress, workOrderToProposedTasks } from '../../lib/tasks/workOrderTasks.ts';
import type { JobTask, ProposedTask } from '../../lib/tasks/taskTypes.ts';
import { toast } from '../Toast.tsx';
import { ProposalsModal } from './TaskReview.tsx';
import { TASKS_PREMIUM_REASON, TaskRail, newId, useCrewPeople } from './taskUi.tsx';

export interface WorkOrderTasksUi {
    userId: string;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
    /** opens the job page on its Tasks tab */
    onOpenJobTasks: (jobId: string) => void;
}

const WorkOrderTasks: React.FC<{
    job: Pick<Job, 'id' | 'name'>;
    /** the saved document's id (undefined while the work order is new) */
    docId: string | null | undefined;
    data: WorkOrderData;
    /** the document is waiting in the offline outbox (it is not on the account yet) */
    waiting: boolean;
    ui: WorkOrderTasksUi;
}> = ({ job, docId, data, waiting, ui }) => {
    const paid = isPaidTier(ui.plan);
    const { people } = useCrewPeople(true);
    const [mine, setMine] = useState<JobTask[] | null>(null);
    const [proposals, setProposals] = useState<ProposedTask[] | null>(null);
    const [existing, setExisting] = useState<JobTask[]>([]);
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const today = todayYmd();

    const refresh = useCallback(async () => {
        if (!docId || !ui.isOnline) return;
        try { setMine(await listWorkOrderTasks(docId)); } catch { /* keep what is shown */ }
    }, [docId, ui.isOnline]);
    useEffect(() => { void refresh(); }, [refresh]);

    const progress = docId && mine ? workOrderTaskProgress(mine, docId, today) : null;

    const start = async () => {
        setError('');
        setNote('');
        if (!paid) { ui.onUpgrade(TASKS_PREMIUM_REASON); return; }
        if (!docId) { setError('Save the work order first, then create its tasks.'); return; }
        if (waiting) { setError('This work order has not reached your account yet. Try again when it has synced.'); return; }
        if (!ui.isOnline) { setError(NEEDS_CONNECTION); return; }
        setBusy(true);
        try {
            const current = (await listJobTasks(job.id)) || [];
            setExisting(current);
            const list = workOrderToProposedTasks(
                { id: docId, type: WORK_ORDER_TYPE, data },
                { crew: people.filter(p => p.active).map(p => ({ id: p.id, name: p.name })), existingTitles: current.map(t => t.title) },
            );
            if (!list.length) { setNote('Nothing new to add: the description has no lines yet, or its tasks are already on the job.'); return; }
            setProposals(list);
        } catch (e) {
            setError(describeError(e, 'The tasks could not be prepared.'));
        } finally {
            setBusy(false);
        }
    };

    const confirm = async (kept: ProposedTask[]) => {
        if (!kept.length || !docId) return;
        setSaving(true);
        setError('');
        try {
            const drafts = proposalsToDrafts(kept, newId, { sortStart: nextSortOrder(existing) });
            const saved = await createTasks(ui.userId, job.id, drafts);
            setMine(cur => [...(cur || []), ...saved]);
            setProposals(null);
            toast.success(`Added ${saved.length} task${saved.length === 1 ? '' : 's'} to ${job.name || 'the job'}.`);
        } catch (e) {
            setError(describeError(e, 'The tasks could not be added.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3">
            {progress ? (
                <div>
                    <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span><span className="font-semibold">Tasks: {progress.done} of {progress.total} done</span>{progress.overdue > 0 && <span className="text-destructive"> · {progress.overdue} overdue</span>}</span>
                        <button type="button" className="text-xs font-semibold text-primary" onClick={() => ui.onOpenJobTasks(job.id)}>Open in the job’s Tasks ›</button>
                    </p>
                    <TaskRail tasks={(mine || []).filter(t => t.workOrderDocId === docId)} today={today} className="mt-2" />
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">Turn the lines of the description into tasks your crew sees on their link. Nothing is added until you review it.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-outline" onClick={() => { void start(); }} disabled={busy}>{busy ? 'Reading…' : progress ? 'Add more tasks from it' : 'Create tasks from this work order'}</button>
                {!progress && docId && <button type="button" className="text-xs font-semibold text-primary" onClick={() => ui.onOpenJobTasks(job.id)}>Open the job’s Tasks ›</button>}
            </div>
            {!docId && <p className="text-xs text-muted-foreground">Save the work order first; its tasks stay linked to it.</p>}
            {note && <p className="text-sm text-muted-foreground" role="status">{note}</p>}
            {error && !proposals && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            {proposals && (
                <ProposalsModal
                    title="Tasks from this work order"
                    intro="One task per line of the description. Fix a name or a date, untick what you do not need."
                    proposals={proposals}
                    busy={saving}
                    error={error}
                    onCancel={() => { setProposals(null); setError(''); }}
                    onConfirm={confirm}
                />
            )}
        </div>
    );
};

export default WorkOrderTasks;
