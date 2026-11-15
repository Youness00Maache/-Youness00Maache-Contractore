/**
 * Job page › Tasks (Premium): what has to happen on this job, in what order, and by when.
 *  - List "By date": Overdue / Today / Coming up / Later / No date / Done; "In order": your own order (up / down or drag)
 *  - Timeline: the same tasks as bars (components/tasks/TasksTimeline.tsx)
 *  - one-line quick add ("Order windows @Mike"), tap the ring to finish a task, tap a row to open it
 *  - a task waits for other tasks ("Waiting on 2" shows as Blocked); moving a date asks "Move the tasks that follow too?"
 *  - from a template / from a note (AI) / save these tasks as a template
 * Every change needs a connection (it says so); the list is read again when the connection is back.
 * Data: lib/tasks (pure logic in taskLogic.ts / taskView.ts, Supabase calls in tasksApi.ts).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '../../types.ts';
import { isPaidTier, normalizeTier } from '../../lib/plans.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import {
    WHEN_GROUPS, WHEN_GROUP_LABELS, displayStatus, groupTasksByWhen, isYmd, nextSortOrder, reorderPatches, sortTasks, taskProgress, todayYmd,
    unfinishedDependencies, type DatePatch, type WhenGroup,
} from '../../lib/tasks/taskLogic.ts';
import { criticalSummary, dueLabel, followUpPlan, shortDay, tabCount, type FollowUpPlan } from '../../lib/tasks/taskView.ts';
import { applyDatePatches, createTask, deleteTask, reorderTasks, setTaskStatus, updateTask } from '../../lib/tasks/tasksApi.ts';
import type { JobTask, TaskPatch } from '../../lib/tasks/taskTypes.ts';
import type { TaskProgress } from '../../lib/tasks/taskLogic.ts';
import { matchCrewName, EXTRACT_TASKS_UPGRADE_MESSAGE } from '../../supabase/functions/ai-assistant/shared/taskExtraction.ts';
import { ActionMenu, ConfirmDialog, Modal, Segmented } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { CameraIcon, PlusIcon, SparklesIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import TaskEditor from './TaskEditor.tsx';
import TasksTimeline from './TasksTimeline.tsx';
import TasksFromNote from './TasksFromNote.tsx';
import { AddFromTemplateModal, SaveTemplateModal } from './TaskTemplates.tsx';
import {
    ArrowDownIcon, ArrowUpIcon, Diamond, GripIcon, StatusRing, TASKS_NEED_CONNECTION, TASKS_PREMIUM_REASON, TaskRail, cx, useCrewPeople, useJobTasks,
} from './taskUi.tsx';

export interface JobTasksPanelProps {
    job: Job & { clientId?: string | null };
    userId: string;
    /** the owner's name (shown on their comments) */
    ownerName?: string;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
    /** progress changed (the tab's "3/8") */
    onProgress?: (jobId: string, progress: TaskProgress) => void;
}

type ViewKey = 'date' | 'order' | 'timeline';
const EMPTY: JobTask[] = [];

const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

const toneClass = (tone: ReturnType<typeof dueLabel>['tone']) =>
    tone === 'late' ? 'font-semibold text-destructive' : tone === 'today' ? 'font-semibold text-foreground' : tone === 'soon' ? 'text-foreground' : 'text-muted-foreground';

const localDayOf = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : todayYmd(d);
};

const JobTasksPanel: React.FC<JobTasksPanelProps> = ({ job, userId, ownerName, plan, isOnline, onUpgrade, onProgress }) => {
    const paid = isPaidTier(plan);
    const aiPlan = normalizeTier(plan) === 'ai';
    const today = todayYmd();
    const { tasks: loaded, setTasks, error: loadError, ready, reload, upsert, remove } = useJobTasks(job.id, isOnline);
    const { people } = useCrewPeople(true);
    const tasks = Array.isArray(loaded) ? loaded : EMPTY;

    const [view, setView] = useState<ViewKey>('date');
    const [draft, setDraft] = useState('');
    const [draftDue, setDraftDue] = useState('');
    const [showDate, setShowDate] = useState(false);
    const [adding, setAdding] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<JobTask | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [showDone, setShowDone] = useState(false);
    const [modal, setModal] = useState<'template' | 'save-template' | 'note' | null>(null);
    const [move, setMove] = useState<{ task: JobTask; plan: FollowUpPlan; titles: string[] } | null>(null);
    const [moving, setMoving] = useState(false);
    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const byId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
    const groups = useMemo(() => groupTasksByWhen(tasks, today), [tasks, today]);
    const progress = useMemo(() => taskProgress(tasks, today), [tasks, today]);
    const critical = useMemo(() => criticalSummary(tasks), [tasks]);
    const criticalSet = useMemo(() => new Set(critical.ids), [critical]);
    const ordered = useMemo(() => sortTasks(tasks), [tasks]);
    const personName = (id: string | null) => (id ? people.find(p => p.id === id)?.name || '' : '');
    const editing = editingId ? byId.get(editingId) || null : null;

    useEffect(() => { if (Array.isArray(loaded)) onProgress?.(job.id, progress); }, [loaded, progress, job.id, onProgress]);

    // ------------------------------------------------------------------------------ guards
    const needPremium = (): boolean => {
        if (paid) return true;
        onUpgrade(TASKS_PREMIUM_REASON);
        return false;
    };
    const needOnline = (): boolean => {
        if (isOnline) return true;
        toast.error(NEEDS_CONNECTION);
        return false;
    };
    const fail = (e: unknown, fallback: string) => toast.error(describeError(e, fallback));

    // ------------------------------------------------------------------------------ changes
    const addFromDraft = async () => {
        let title = draft.replace(/\s+/g, ' ').trim();
        if (!title || adding) return;
        if (!needPremium() || !needOnline()) return;
        let crewMemberId: string | null = null;
        // "Order windows @Mike": a trailing @name that matches a crew member assigns the task
        const at = title.lastIndexOf('@');
        if (at >= 0 && (at === 0 || /\s/.test(title[at - 1]))) {
            const member = matchCrewName(title.slice(at + 1).trim(), people.filter(p => p.active).map(p => ({ id: p.id, name: p.name })));
            const rest = title.slice(0, at).trim();
            if (member && rest) { crewMemberId = member.id; title = rest; }
        }
        setAdding(true);
        try {
            const saved = await createTask(userId, job.id, { title, crewMemberId, dueDate: isYmd(draftDue) ? draftDue : null, sortOrder: nextSortOrder(tasks), source: 'manual' });
            upsert(saved);
            setDraft('');
            setDraftDue('');
            inputRef.current?.focus();
        } catch (e) {
            fail(e, 'The task could not be added.');
        } finally {
            setAdding(false);
        }
    };

    const toggleDone = async (task: JobTask) => {
        if (busyId || !needOnline()) return;
        setBusyId(task.id);
        try {
            upsert(await setTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done'));
        } catch (e) {
            fail(e, 'The task could not be updated.');
        } finally {
            setBusyId(null);
        }
    };

    /** Saves from the editor; asks about the tasks that follow when a date moved. Returns false to keep the editor open. */
    const saveTask = async (task: JobTask, patch: TaskPatch): Promise<boolean> => {
        const before = tasks;
        try {
            const saved = await updateTask(task.id, patch);
            upsert(saved);
            if ('startDate' in patch || 'dueDate' in patch) {
                const plan2 = followUpPlan(before, task.id, { startDate: saved.startDate, dueDate: saved.dueDate });
                if (plan2.shift.length) {
                    setMove({ task: saved, plan: plan2, titles: plan2.shift.map(p => before.find(t => t.id === p.id)?.title || '').filter(Boolean) });
                }
            }
            return true;
        } catch (e) {
            fail(e, 'The task could not be saved.');
            return false;
        }
    };

    const applyMove = async (patches: readonly DatePatch[]) => {
        if (!patches.length) { setMove(null); return; }
        setMoving(true);
        try {
            await applyDatePatches(patches);
            const by = new Map(patches.map(p => [p.id, p]));
            setTasks(prev => (Array.isArray(prev) ? prev.map(t => (by.has(t.id) ? { ...t, startDate: by.get(t.id)!.startDate, dueDate: by.get(t.id)!.dueDate } : t)) : prev));
            toast.success(`Moved ${patches.length} task${patches.length === 1 ? '' : 's'}.`);
            setMove(null);
        } catch (e) {
            fail(e, 'The new dates could not be saved.');
            void reload();
        } finally {
            setMoving(false);
        }
    };

    const removeTask = async (task: JobTask): Promise<boolean> => {
        try {
            await deleteTask(task);
            remove(task.id);
            toast.success('Task deleted.');
            return true;
        } catch (e) {
            fail(e, 'The task could not be deleted.');
            return false;
        }
    };

    const applyOrder = async (next: string[]) => {
        if (!needPremium() || !needOnline()) return;
        const patches = reorderPatches(next, tasks);
        if (!patches.length) return;
        const to = new Map(patches.map(p => [p.id, p.sortOrder]));
        setTasks(prev => (Array.isArray(prev) ? sortTasks(prev.map(t => (to.has(t.id) ? { ...t, sortOrder: to.get(t.id)! } : t))) : prev));
        try {
            await reorderTasks(patches);
        } catch (e) {
            fail(e, 'The new order could not be saved.');
            void reload();
        }
    };

    const moveBy = (id: string, dir: -1 | 1) => {
        const ids = ordered.map(t => t.id);
        const i = ids.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        void applyOrder(ids);
    };

    const dropOn = (targetId: string) => {
        const from = dragId;
        setDragId(null);
        setOverId(null);
        if (!from || from === targetId) return;
        const ids = ordered.map(t => t.id);
        const fi = ids.indexOf(from);
        const ti = ids.indexOf(targetId);
        if (fi < 0 || ti < 0) return;
        ids.splice(fi, 1);
        ids.splice(fi < ti ? ti : ti, 0, from);
        void applyOrder(ids);
    };

    const openNote = () => {
        if (!needPremium()) return;
        if (!aiPlan) { onUpgrade(EXTRACT_TASKS_UPGRADE_MESSAGE); return; }
        setModal('note');
    };
    const openTemplate = () => { if (needPremium()) setModal('template'); };

    // ------------------------------------------------------------------------------ rows
    // a plain function (not a component): a component defined in here would remount every row on each render
    const renderRow = (task: JobTask, manual = false, index = 0) => {
        const shown = displayStatus(task, byId);
        const waiting = unfinishedDependencies(task, byId).length;
        const due = dueLabel(task, today);
        const doneOn = task.status === 'done' ? localDayOf(task.completedAt) : null;
        const who = personName(task.crewMemberId);
        const late = due.tone === 'late';
        const ids = ordered.map(t => t.id);
        return (
            <li
                key={task.id}
                className={cx(
                    'relative flex items-start gap-1.5 px-1.5 py-1.5',
                    criticalSet.has(task.id) && task.status !== 'done' && 'before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-foreground/25',
                    busyId === task.id && 'opacity-60',
                    manual && dragId === task.id && 'opacity-40',
                    manual && overId === task.id && dragId !== task.id && 'bg-primary/5 shadow-[inset_0_2px_0_0_hsl(var(--primary))]',
                )}
                draggable={manual && paid && isOnline}
                onDragStart={manual ? (e) => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', task.id); } catch { /* ignore */ } } : undefined}
                onDragOver={manual ? (e) => { if (dragId) { e.preventDefault(); if (overId !== task.id) setOverId(task.id); } } : undefined}
                onDrop={manual ? (e) => { e.preventDefault(); dropOn(task.id); } : undefined}
                onDragEnd={manual ? () => { setDragId(null); setOverId(null); } : undefined}
            >
                <button
                    type="button"
                    onClick={() => { void toggleDone(task); }}
                    disabled={busyId === task.id}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    aria-label={task.status === 'done' ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
                >
                    <StatusRing status={shown} milestone={task.isMilestone} late={late} />
                </button>
                <button type="button" onClick={() => setEditingId(task.id)} className="min-w-0 flex-1 py-1 text-left">
                    <span className={cx('block text-sm font-semibold leading-5', task.status === 'done' ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground')}>
                        {task.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                        {task.status === 'done'
                            ? <span className="text-muted-foreground">{doneOn ? `Done ${shortDay(doneOn, 'en', Number(today.slice(0, 4)))}` : 'Done'}</span>
                            : <span className={toneClass(due.tone)}>{due.text}</span>}
                        {task.isMilestone && !due.text.startsWith('Milestone') && <span className="inline-flex items-center gap-1 text-muted-foreground"><Diamond className="h-2 w-2" />Milestone</span>}
                        {who && <span className="text-muted-foreground">@{firstName(who)}</span>}
                        {waiting > 0 && task.status !== 'done' && <span className="font-semibold text-warning">Waiting on {waiting}</span>}
                        {task.status === 'doing' && <span className="font-semibold text-primary">In progress</span>}
                        {task.status === 'blocked' && waiting === 0 && <span className="font-semibold text-warning">Blocked</span>}
                        {task.completedPhotoPath && <span className="inline-flex items-center gap-1 text-muted-foreground"><CameraIcon className="h-3 w-3" />Photo</span>}
                    </span>
                </button>
                {manual && (
                    <span className="flex shrink-0 items-center">
                        <button type="button" className="flex h-11 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" onClick={() => moveBy(task.id, -1)} disabled={index === 0} aria-label={`Move “${task.title}” up`}><ArrowUpIcon className="h-4 w-4" /></button>
                        <button type="button" className="flex h-11 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" onClick={() => moveBy(task.id, 1)} disabled={index >= ids.length - 1} aria-label={`Move “${task.title}” down`}><ArrowDownIcon className="h-4 w-4" /></button>
                        <span className="hidden h-11 w-6 cursor-grab items-center justify-center text-muted-foreground/60 sm:flex" aria-hidden title="Drag to reorder"><GripIcon className="h-4 w-4" /></span>
                    </span>
                )}
                <span className="shrink-0">
                    <ActionMenu
                        label={`More for ${task.title}`}
                        items={[
                            { label: 'Open', onSelect: () => setEditingId(task.id) },
                            { label: task.status === 'done' ? 'Mark not done' : 'Mark done', onSelect: () => { void toggleDone(task); } },
                            task.status === 'todo' ? { label: 'Start it (in progress)', onSelect: () => { void (async () => { if (!needOnline()) return; try { upsert(await setTaskStatus(task.id, 'doing')); } catch (e) { fail(e, 'The task could not be updated.'); } })(); } } : null,
                            { label: 'Delete', onSelect: () => setConfirmDelete(task), destructive: true },
                        ]}
                    />
                </span>
            </li>
        );
    };

    // ------------------------------------------------------------------------------ render
    if (loaded === undefined) return <div className="skeleton h-40 w-full rounded-2xl" aria-busy="true" />;
    if (loaded === null) {
        return (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Job tasks are being switched on for your account. Check back soon.
            </div>
        );
    }

    // never loaded (offline, or an error): say so instead of showing an empty list that looks like "no tasks"
    if (!ready && loadError) {
        return (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm" role="alert">
                <p className="font-semibold">{isOnline ? loadError : TASKS_NEED_CONNECTION}</p>
                <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => { void reload(); }} disabled={!isOnline}>Try again</button>
            </div>
        );
    }

    if (!paid && tasks.length === 0) {
        return (
            <section className="rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="tasks-premium">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
                <h3 id="tasks-premium" className="mt-1 text-lg font-bold">Plan the job step by step, and see it on a timeline</h3>
                <p className="mt-1 text-sm text-muted-foreground">Tasks with dates, who does them and what waits for what. Your crew sees theirs on their link and ticks them off with a photo. Start from a ready-made list for a bathroom or a deck.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={() => onUpgrade(TASKS_PREMIUM_REASON)}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            </section>
        );
    }

    const openGroups = WHEN_GROUPS.filter(g => g !== 'done' && groups[g].length > 0);
    const doneExpanded = showDone || (openGroups.length === 0 && groups.done.length > 0);
    const summaryBits = [
        `${progress.done} of ${progress.total} done`,
        progress.overdue ? `${progress.overdue} overdue` : '',
        progress.milestones ? `${progress.milestonesDone}/${progress.milestones} milestones` : '',
    ].filter(Boolean);

    return (
        <section aria-labelledby="tasks-heading" className="space-y-4">
            {/* progress + actions */}
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="tasks-heading" className="text-base font-bold leading-tight">Tasks</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {progress.total === 0 ? 'Nothing planned yet.' : (
                                <>
                                    <span className="font-semibold tabular-nums text-foreground">{summaryBits[0]}</span>
                                    {progress.overdue > 0 && <span className="text-destructive"> · {progress.overdue} overdue</span>}
                                    {progress.milestones > 0 && <> · {progress.milestonesDone}/{progress.milestones} milestones</>}
                                </>
                            )}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <HelpButton topic="job-tasks" />
                        <ActionMenu
                            label="Task actions"
                            items={[
                                { label: 'Add from a template', onSelect: openTemplate },
                                { label: 'Turn a note into tasks (AI)', onSelect: openNote, icon: <SparklesIcon className="h-4 w-4" /> },
                                tasks.length ? { label: 'Save these tasks as a template', onSelect: () => { if (needPremium()) setModal('save-template'); } } : null,
                            ]}
                        />
                    </div>
                </div>
                {progress.total > 0 && <TaskRail tasks={tasks} today={today} className="mt-3" />}
                {critical.count >= 2 && critical.endDate && (
                    <p className="mt-2.5 text-xs text-muted-foreground">
                        Longest chain: <span className="font-semibold text-foreground">{critical.count} tasks in a row</span>{critical.days ? `, ${critical.days} day${critical.days === 1 ? '' : 's'}` : ''}, done {shortDay(critical.endDate, 'en', Number(today.slice(0, 4)))}. Rows with a grey stripe are on it; if one runs late, the finish moves.
                    </p>
                )}
            </div>

            {!isOnline && <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm" role="status">{TASKS_NEED_CONNECTION}</p>}
            {!paid && <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">Tasks are part of Premium. You can still tick these off; <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(TASKS_PREMIUM_REASON)}>upgrade</button> to add and change them.</p>}
            {loadError && <p className="text-sm text-destructive" role="alert">{loadError} <button type="button" className="underline" onClick={() => { void reload(); }}>Try again</button></p>}

            {/* quick add */}
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void addFromDraft(); }}>
                <div className="flex items-stretch gap-2">
                    <input
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="input h-11 min-w-0 flex-1"
                        placeholder="Add a task, e.g. Order windows @Mike"
                        aria-label="New task"
                        enterKeyHint="done"
                        maxLength={200}
                        disabled={adding}
                    />
                    <button type="button" className={cx('btn btn-outline h-11 shrink-0 px-3', (showDate || draftDue) && 'border-primary text-primary')} onClick={() => setShowDate(v => !v)} aria-expanded={showDate} aria-label="Set a due date">
                        {draftDue ? shortDay(draftDue) : 'Date'}
                    </button>
                    <button type="submit" className="btn btn-primary h-11 shrink-0 px-3.5" disabled={!draft.trim() || adding} aria-label="Add task"><PlusIcon className="h-4 w-4" /><span className="hidden sm:inline">{adding ? 'Adding…' : 'Add'}</span></button>
                </div>
                {showDate && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <label className="inline-flex items-center gap-2"><span className="text-muted-foreground">Due</span><input type="date" className="input h-10 w-auto" value={draftDue} onChange={(e) => setDraftDue(e.target.value)} aria-label="Due date of the new task" /></label>
                        <button type="button" className="h-10 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground" onClick={() => setDraftDue(today)}>Today</button>
                        <button type="button" className="h-10 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground" onClick={() => { const [y, m, d] = today.split('-').map(Number); setDraftDue(todayYmd(new Date(y, m - 1, d + 1))); }}>Tomorrow</button>
                        {draftDue && <button type="button" className="h-10 px-2 text-xs font-semibold text-muted-foreground" onClick={() => setDraftDue('')}>Clear</button>}
                    </div>
                )}
            </form>
            <div className="-mt-1 flex flex-wrap gap-2">
                <button type="button" onClick={openNote} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground hover:border-primary/50"><SparklesIcon className="h-3.5 w-3.5 text-primary" /> Note to tasks</button>
                <button type="button" onClick={openTemplate} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground hover:border-primary/50">From a template</button>
            </div>

            {/* view switch */}
            {tasks.length > 0 && (
                <Segmented<ViewKey>
                    ariaLabel="How to show the tasks"
                    size="sm"
                    value={view}
                    onChange={setView}
                    options={[{ value: 'date', label: 'By date' }, { value: 'order', label: 'In order' }, { value: 'timeline', label: 'Timeline' }]}
                />
            )}

            {tasks.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Type the first step above, one line per task. End a line with @Name to give it to a crew member. Or start from a template, or dictate a note and let the assistant list the tasks.
                </p>
            ) : view === 'timeline' ? (
                <TasksTimeline tasks={tasks} today={today} onOpen={(t) => setEditingId(t.id)} />
            ) : view === 'order' ? (
                <div>
                    <p className="mb-1.5 px-1 text-xs text-muted-foreground">Your own order. Use the arrows{' '}<span className="hidden sm:inline">or drag a row </span>to move a task.</p>
                    <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                        {ordered.map((t, i) => renderRow(t, true, i))}
                    </ul>
                </div>
            ) : (
                <div className="space-y-4">
                    {openGroups.map(g => (
                        <div key={g}>
                            <h3 className="mb-1 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <span className={g === 'overdue' ? 'text-destructive' : g === 'today' ? 'text-foreground' : ''}>{WHEN_GROUP_LABELS[g as WhenGroup]}</span>
                                <span className="tabular-nums normal-case tracking-normal">{groups[g].length}</span>
                            </h3>
                            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                                {groups[g].map(t => renderRow(t))}
                            </ul>
                        </div>
                    ))}
                    {groups.done.length > 0 && (
                        <div>
                            <button type="button" className="mb-1 flex w-full items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => setShowDone(v => !v)} aria-expanded={doneExpanded}>
                                <span>Done <span className="normal-case tracking-normal">· {doneExpanded ? 'hide' : 'show'}</span></span>
                                <span className="tabular-nums normal-case tracking-normal">{groups.done.length}</span>
                            </button>
                            {doneExpanded && (
                                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                                    {groups.done.map(t => renderRow(t))}
                                </ul>
                            )}
                        </div>
                    )}
                    {openGroups.length === 0 && groups.done.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nothing here.</p>}
                </div>
            )}

            {editing && (
                <TaskEditor
                    key={editing.id}
                    task={editing}
                    tasks={tasks}
                    people={people}
                    userId={userId}
                    ownerName={ownerName}
                    isOnline={isOnline}
                    canEdit={paid}
                    onClose={() => setEditingId(null)}
                    onSave={saveTask}
                    onDelete={removeTask}
                    onUpgrade={() => onUpgrade(TASKS_PREMIUM_REASON)}
                />
            )}

            <ConfirmDialog
                open={!!confirmDelete}
                title="Delete this task?"
                message={confirmDelete ? <>“{confirmDelete.title}” is removed with its comments and photo. Tasks that waited for it stop waiting.</> : undefined}
                confirmLabel="Delete"
                destructive
                busy={deleting}
                onConfirm={() => { if (!confirmDelete) return; setDeleting(true); void removeTask(confirmDelete).finally(() => { setDeleting(false); setConfirmDelete(null); }); }}
                onCancel={() => setConfirmDelete(null)}
            />

            {move && (
                <Modal
                    open
                    onClose={() => setMove(null)}
                    busy={moving}
                    size="sm"
                    title="Move the tasks that follow too?"
                    footer={(
                        <>
                            <button type="button" className="btn btn-ghost" onClick={() => setMove(null)} disabled={moving}>No, leave them</button>
                            {move.plan.push.length > 0 && (
                                <button type="button" className="btn btn-outline" onClick={() => { void applyMove(move.plan.push); }} disabled={moving}>Only as far as needed ({move.plan.push.length})</button>
                            )}
                            <button type="button" className="btn btn-primary" onClick={() => { void applyMove(move.plan.shift); }} disabled={moving}>
                                {moving ? 'Moving…' : `Move ${move.plan.shift.length === 1 ? 'it' : `the ${move.plan.shift.length} tasks`} ${Math.abs(move.plan.delta)} day${Math.abs(move.plan.delta) === 1 ? '' : 's'} ${move.plan.delta > 0 ? 'later' : 'earlier'}`}
                            </button>
                        </>
                    )}
                >
                    <div className="space-y-2 text-sm">
                        <p>“{move.task.title}” moved {Math.abs(move.plan.delta)} day{Math.abs(move.plan.delta) === 1 ? '' : 's'} {move.plan.delta > 0 ? 'later' : 'earlier'}. These wait for it:</p>
                        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                            {move.titles.slice(0, 6).map((t, i) => <li key={i}>{t}</li>)}
                            {move.titles.length > 6 && <li>and {move.titles.length - 6} more</li>}
                        </ul>
                        <p className="text-xs text-muted-foreground">The first button shifts each of them by the same number of days. “Only as far as needed” moves just the ones that would now start before this task ends.</p>
                    </div>
                </Modal>
            )}

            {modal === 'template' && (
                <AddFromTemplateModal job={job} userId={userId} existing={tasks} isOnline={isOnline} onClose={() => setModal(null)} onCreated={(saved) => { upsert(...saved); setView('date'); }} />
            )}
            {modal === 'save-template' && <SaveTemplateModal jobName={job.name} tasks={tasks} onClose={() => setModal(null)} />}
            {modal === 'note' && (
                <TasksFromNote job={job} userId={userId} existing={tasks} people={people} isOnline={isOnline} onClose={() => setModal(null)} onCreated={(saved) => { upsert(...saved); setView('date'); }} />
            )}
        </section>
    );
};

export const tasksTabLabel = (p: TaskProgress | undefined): string | undefined => (p ? tabCount(p) || undefined : undefined);

export default JobTasksPanel;
