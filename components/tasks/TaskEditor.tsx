/**
 * One task, opened: title, notes, status, who does it, start and due dates, milestone, "waits for" other tasks,
 * the worker's done photo, comments, delete. Saving and deleting are done by the Tasks panel (onSave / onDelete) so
 * it can ask "Move the tasks that follow too?" after a date change.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { JobTask, TaskComment, TaskPatch, TaskStatus } from '../../lib/tasks/taskTypes.ts';
import { TASK_LIMITS, TASK_STATUSES, TASK_STATUS_LABELS } from '../../lib/tasks/taskTypes.ts';
import { displayStatus, isYmd, validateDependencies, wouldCreateCycle } from '../../lib/tasks/taskLogic.ts';
import { shortDay, waitingLabel } from '../../lib/tasks/taskView.ts';
import { addTaskComment, deleteTaskComment, listTaskComments } from '../../lib/tasks/tasksApi.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import { ConfirmDialog, Field, Modal, Segmented } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { StarIcon, TrashIcon } from '../Icons.tsx';
import { Diamond, StatusRing, cx, useTaskPhoto, type CrewPerson } from './taskUi.tsx';

export interface TaskEditorProps {
    task: JobTask;
    /** every task of the job */
    tasks: readonly JobTask[];
    people: readonly CrewPerson[];
    userId: string;
    ownerName?: string;
    isOnline: boolean;
    /** Premium: can change tasks (otherwise the fields are read only) */
    canEdit: boolean;
    onClose: () => void;
    onSave: (task: JobTask, patch: TaskPatch) => Promise<boolean>;
    onDelete: (task: JobTask) => Promise<boolean>;
    onUpgrade: () => void;
}

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
    <label className={cx('flex cursor-pointer items-center justify-between gap-3 text-sm', disabled && 'opacity-60')}>
        <span className="font-medium">{label}</span>
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} aria-label={label} />
        <span className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring', checked ? 'bg-primary' : 'bg-muted-foreground/30')} aria-hidden>
            <span className={cx('absolute h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
        </span>
    </label>
);

const timeLabel = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

const TaskEditor: React.FC<TaskEditorProps> = ({ task, tasks, people, userId, ownerName, isOnline, canEdit, onClose, onSave, onDelete, onUpgrade }) => {
    const [title, setTitle] = useState(task.title);
    const [notes, setNotes] = useState(task.notes || '');
    const [status, setStatus] = useState<TaskStatus>(task.status);
    const [crewId, setCrewId] = useState(task.crewMemberId || '');
    const [start, setStart] = useState(task.startDate || '');
    const [due, setDue] = useState(task.dueDate || '');
    const [milestone, setMilestone] = useState(task.isMilestone);
    const [deps, setDeps] = useState<string[]>(task.dependsOn);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [comments, setComments] = useState<TaskComment[] | null>(null);
    const [commentError, setCommentError] = useState('');
    const [draft, setDraft] = useState('');
    const [posting, setPosting] = useState(false);
    const photo = useTaskPhoto(task.completedPhotoPath);
    const [photoOpen, setPhotoOpen] = useState(false);

    const others = useMemo(() => tasks.filter(t => t.id !== task.id), [tasks, task.id]);
    const byId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
    // the task as it is being edited: how it would read in the list
    const draftTask: JobTask = { ...task, status, dependsOn: deps, isMilestone: milestone };
    const waiting = deps.filter(id => byId.get(id) && byId.get(id)!.status !== 'done').length;
    const shown = displayStatus(draftTask, byId);
    const assignee = people.find(p => p.id === crewId);
    // an archived crew member who still has the task stays in the list
    const options = people.filter(p => p.active || p.id === task.crewMemberId);

    useEffect(() => {
        let alive = true;
        if (!isOnline) { setComments([]); return; }
        void listTaskComments(task.id).then(list => { if (alive) setComments(list || []); }).catch(e => { if (alive) { setComments([]); setCommentError(describeError(e, 'The comments could not be loaded.')); } });
        return () => { alive = false; };
    }, [task.id, isOnline]);

    const toggleDep = (id: string) => setDeps(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]));

    const save = async () => {
        if (!canEdit) { onUpgrade(); return; }
        const name = title.replace(/\s+/g, ' ').trim();
        if (!name) { setError('Give the task a short name.'); return; }
        if (isYmd(start) && isYmd(due) && !milestone && start > due) { setError('The start date is after the due date. Swap them or clear one.'); return; }
        const check = validateDependencies(tasks, task.id, deps, task.jobId);
        if (check.ok === false) { setError(check.message); return; }
        const patch: TaskPatch = {};
        const startOut = milestone ? (isYmd(due) ? due : isYmd(start) ? start : null) : (isYmd(start) ? start : null);
        const dueOut = isYmd(due) ? due : milestone && isYmd(start) ? start : null;
        if (name !== task.title) patch.title = name;
        if (notes.trim() !== (task.notes || '').trim()) patch.notes = notes.trim() || null;
        if (status !== task.status) patch.status = status;
        if ((crewId || null) !== task.crewMemberId) patch.crewMemberId = crewId || null;
        if (startOut !== task.startDate) patch.startDate = startOut;
        if (dueOut !== task.dueDate) patch.dueDate = dueOut;
        if (milestone !== task.isMilestone) patch.isMilestone = milestone;
        if ([...check.dependsOn].sort().join(',') !== [...task.dependsOn].sort().join(',')) patch.dependsOn = check.dependsOn;
        if (!Object.keys(patch).length) { onClose(); return; }
        setError('');
        setSaving(true);
        try {
            if (await onSave(task, patch)) onClose();
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setSaving(true);
        try {
            if (await onDelete(task)) onClose();
        } finally {
            setSaving(false);
            setConfirmDelete(false);
        }
    };

    const post = async () => {
        const body = draft.trim();
        if (!body) return;
        setPosting(true);
        setCommentError('');
        try {
            const c = await addTaskComment(userId, task.id, body, ownerName || null);
            setComments(cur => [...(cur || []), c]);
            setDraft('');
        } catch (e) {
            setCommentError(describeError(e, 'The comment could not be saved.'));
        } finally {
            setPosting(false);
        }
    };

    const dropComment = async (c: TaskComment) => {
        try {
            await deleteTaskComment(c.id);
            setComments(cur => (cur || []).filter(x => x.id !== c.id));
        } catch (e) {
            toast.error(describeError(e, 'The comment could not be deleted.'));
        }
    };

    const ro = !canEdit || saving;

    return (
        <>
            <Modal
                open
                onClose={onClose}
                busy={saving}
                size="lg"
                title={(
                    <span className="flex items-center gap-2.5">
                        <StatusRing status={shown} milestone={milestone} />
                        <span>{milestone ? 'Milestone' : 'Task'}</span>
                    </span>
                )}
                footer={(
                    <>
                        <button type="button" className="btn btn-ghost text-destructive sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={saving || !isOnline}>
                            <TrashIcon className="h-4 w-4" /> Delete
                        </button>
                        <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
                        {canEdit
                            ? <button type="button" className="btn btn-primary" onClick={() => { void save(); }} disabled={saving || !isOnline || !title.trim()}>{saving ? 'Saving…' : 'Save'}</button>
                            : <button type="button" className="btn btn-primary" onClick={onUpgrade}><StarIcon className="h-4 w-4" /> Upgrade to edit</button>}
                    </>
                )}
            >
                <div className="space-y-4">
                    {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">{NEEDS_CONNECTION}</p>}
                    {!canEdit && <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm">Changing tasks is part of Premium. You can read this one and comment.</p>}

                    <Field label="What needs doing" htmlFor="task-title">
                        <input id="task-title" className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={TASK_LIMITS.title} disabled={ro} autoFocus={canEdit} />
                    </Field>

                    <div>
                        <span className="label">Status</span>
                        <Segmented<TaskStatus>
                            ariaLabel="Task status"
                            size="sm"
                            value={status}
                            onChange={v => { if (!ro) setStatus(v); }}
                            options={TASK_STATUSES.map(s => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
                        />
                        {waiting > 0 && status !== 'done' && (
                            <p className="mt-1.5 text-xs font-medium text-warning">{waitingLabel(waiting)}: it shows as Blocked until {waiting === 1 ? 'that task is' : 'those tasks are'} done.</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {milestone ? (
                            <Field label="Date" htmlFor="task-due" className="col-span-2 sm:col-span-1">
                                <input id="task-due" type="date" className="input" value={due || start} onChange={e => { setDue(e.target.value); setStart(''); }} disabled={ro} />
                            </Field>
                        ) : (
                            <>
                                <Field label="Starts" htmlFor="task-start">
                                    <input id="task-start" type="date" className="input" value={start} onChange={e => setStart(e.target.value)} disabled={ro} />
                                </Field>
                                <Field label="Due" htmlFor="task-due">
                                    <input id="task-due" type="date" className="input" value={due} onChange={e => setDue(e.target.value)} disabled={ro} />
                                </Field>
                            </>
                        )}
                        <Field label="Who" htmlFor="task-who" className={milestone ? 'col-span-2 sm:col-span-1' : 'col-span-2'}>
                            <select id="task-who" className="input" value={crewId} onChange={e => setCrewId(e.target.value)} disabled={ro}>
                                <option value="">Nobody yet</option>
                                {options.map(p => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (archived)'}</option>)}
                            </select>
                            {people.length === 0
                                ? <p className="mt-1 text-xs text-muted-foreground">Add your workers in Tools › Crew to give them tasks. They see them on their link.</p>
                                : assignee && <p className="mt-1 text-xs text-muted-foreground">{assignee.name.split(' ')[0]} sees this on their crew link.</p>}
                        </Field>
                    </div>

                    <Switch checked={milestone} onChange={setMilestone} label="Milestone (a date to hit, like an inspection)" disabled={ro} />

                    <Field label="Notes" htmlFor="task-notes">
                        <textarea id="task-notes" className="input min-h-[72px]" value={notes} onChange={e => setNotes(e.target.value)} maxLength={TASK_LIMITS.notes} disabled={ro} placeholder="Anything the crew should know" />
                    </Field>

                    {/* waits for */}
                    <fieldset>
                        <legend className="label flex items-baseline justify-between">
                            <span>Waits for</span>
                            <span className={cx('text-xs font-medium', waiting ? 'text-warning' : 'text-muted-foreground')}>{deps.length ? `${deps.length} picked${waiting ? `, ${waitingLabel(waiting).toLowerCase()}` : ''}` : 'nothing'}</span>
                        </legend>
                        {others.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Add other tasks first, then pick the ones this one has to wait for.</p>
                        ) : (
                            <ul className="max-h-48 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border bg-card">
                                {others.map(o => {
                                    const picked = deps.includes(o.id);
                                    const loops = !picked && !!wouldCreateCycle(tasks, task.id, [...deps, o.id]);
                                    return (
                                        <li key={o.id}>
                                            <label className={cx('flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 text-sm', (ro || loops) && 'cursor-not-allowed opacity-60')}>
                                                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={picked} disabled={ro || loops} onChange={() => toggleDep(o.id)} />
                                                <span className={cx('min-w-0 flex-1 truncate', o.status === 'done' && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                                                    {o.isMilestone && <Diamond className="mr-1.5 text-muted-foreground" />}{o.title}
                                                </span>
                                                {loops
                                                    ? <span className="shrink-0 text-xs text-muted-foreground">would loop</span>
                                                    : o.dueDate && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{shortDay(o.dueDate)}</span>}
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </fieldset>

                    {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}

                    {/* the worker's photo */}
                    {task.completedPhotoPath && (
                        <div>
                            <span className="label">Photo when done</span>
                            {photo
                                ? <button type="button" onClick={() => setPhotoOpen(true)} className="block overflow-hidden rounded-xl border border-border"><img src={photo} alt="Done photo from the crew" className="max-h-48 w-auto object-cover" /></button>
                                : <p className="text-sm text-muted-foreground">Loading the photo…</p>}
                        </div>
                    )}

                    {/* comments */}
                    <div>
                        <span className="label">Comments</span>
                        {comments === null ? <div className="skeleton h-10 w-full" aria-busy="true" /> : comments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No comments yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {comments.map(c => (
                                    <li key={c.id} className={cx('rounded-xl px-3 py-2 text-sm', c.authorKind === 'crew' ? 'bg-primary/5' : 'bg-muted/60')}>
                                        <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                                            <span className="truncate"><span className="font-semibold text-foreground">{c.authorKind === 'crew' ? (c.authorName || 'Crew') : (c.authorName || 'You')}</span>{c.authorKind === 'crew' ? ' · crew link' : ''}</span>
                                            <span className="shrink-0 tabular-nums">{timeLabel(c.createdAt)}</span>
                                        </p>
                                        <p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                                        <button type="button" className="mt-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline" onClick={() => { void dropComment(c); }}>Delete</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <form className="mt-2 flex items-start gap-2" onSubmit={e => { e.preventDefault(); void post(); }}>
                            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} className="input min-h-[44px] flex-1" placeholder={isOnline ? 'Write a comment' : 'Comments need a connection'} maxLength={TASK_LIMITS.comment} disabled={!isOnline || posting} aria-label="New comment" />
                            <button type="submit" className="btn btn-outline h-11" disabled={!draft.trim() || !isOnline || posting}>{posting ? 'Sending…' : 'Send'}</button>
                        </form>
                        {commentError && <p className="mt-1 text-xs font-medium text-destructive" role="alert">{commentError}</p>}
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                open={confirmDelete}
                title="Delete this task?"
                message="Its comments and the worker's photo go with it. Tasks that were waiting for it stop waiting."
                confirmLabel="Delete"
                destructive
                busy={saving}
                onConfirm={() => { void remove(); }}
                onCancel={() => setConfirmDelete(false)}
            />
            {photoOpen && photo && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Done photo" onClick={() => setPhotoOpen(false)}>
                    <img src={photo} alt="Done photo from the crew" className="max-h-full max-w-full rounded-xl object-contain" />
                </div>
            )}
        </>
    );
};

export default TaskEditor;
