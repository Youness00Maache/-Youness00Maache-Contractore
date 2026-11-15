/**
 * Task templates on a job:
 *   AddFromTemplateModal   pick a ready-made or saved list, choose the start date, review the tasks, add them
 *   SaveTemplateModal      "Save these tasks as a template" (dates become days after the first one)
 * Ready-made lists: STARTER_TASK_TEMPLATES. Saved lists live in the account (public.user_settings 'tasks.templates').
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { Job } from '../../types.ts';
import type { JobTask, TaskTemplate } from '../../lib/tasks/taskTypes.ts';
import { TEMPLATE_LIMITS } from '../../lib/tasks/taskTypes.ts';
import { STARTER_TASK_TEMPLATES, instantiateTemplate, isYmd, nextSortOrder, templateFromTasks, todayYmd } from '../../lib/tasks/taskLogic.ts';
import { keepDrafts } from '../../lib/tasks/taskView.ts';
import { createTasks, loadTaskTemplates, saveTaskTemplates } from '../../lib/tasks/tasksApi.ts';
import { describeError } from '../../lib/account.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { Field, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { TrashIcon } from '../Icons.tsx';
import { ReviewList, type ReviewRow } from './TaskReview.tsx';
import { cx, newId } from './taskUi.tsx';

/** How many days a template runs: the last day any task ends. */
const templateDays = (t: Pick<TaskTemplate, 'items'>): number => t.items.reduce((m, it) => Math.max(m, it.offsetDays + Math.max(1, it.durationDays)), 0);

export const AddFromTemplateModal: React.FC<{
    job: Pick<Job, 'id' | 'name' | 'startDate'>;
    userId: string;
    existing: readonly JobTask[];
    isOnline: boolean;
    onClose: () => void;
    onCreated: (tasks: JobTask[]) => void;
}> = ({ job, userId, existing, isOnline, onClose, onCreated }) => {
    const [saved, setSaved] = useState<TaskTemplate[] | null>(null);
    const [pickedId, setPickedId] = useState(STARTER_TASK_TEMPLATES[0].id);
    const [start, setStart] = useState(() => (isYmd((job.startDate || '').slice(0, 10)) && (job.startDate || '').slice(0, 10) >= todayYmd() ? (job.startDate || '').slice(0, 10) : todayYmd()));
    const [step, setStep] = useState<'pick' | 'review'>('pick');
    const [keep, setKeep] = useState<boolean[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [removing, setRemoving] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        void loadTaskTemplates().then(list => { if (alive) setSaved(list); });
        return () => { alive = false; };
    }, []);

    const all = useMemo<TaskTemplate[]>(() => [...(saved || []), ...STARTER_TASK_TEMPLATES], [saved]);
    const picked = all.find(t => t.id === pickedId) || all[0];
    const isStarter = (id: string) => STARTER_TASK_TEMPLATES.some(t => t.id === id);

    const drafts = useMemo(() => {
        if (step !== 'review' || !picked || !isYmd(start)) return [];
        return instantiateTemplate(picked, start, newId, { sortStart: nextSortOrder(existing) });
    // the ids are made once when the review opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, picked?.id, start]);

    const rows: ReviewRow[] = useMemo(() => {
        const titleOf = new Map(drafts.map(d => [d.id!, d.title]));
        return drafts.map(d => ({
            title: d.title,
            start: d.startDate || null,
            due: d.dueDate || null,
            isMilestone: !!d.isMilestone,
            who: '',
            after: (d.dependsOn || []).map(id => titleOf.get(id)).filter((n): n is string => !!n),
            note: d.notes || null,
        }));
    }, [drafts]);

    const next = () => {
        if (!isYmd(start)) { setError('Pick the day the first task starts.'); return; }
        setError('');
        setKeep([]);
        setStep('review');
    };
    useEffect(() => { if (step === 'review') setKeep(drafts.map(() => true)); }, [step, drafts]);

    const count = keep.filter(Boolean).length;

    const add = async () => {
        if (!isOnline) { setError(NEEDS_CONNECTION); return; }
        const ids = new Set(drafts.filter((_, i) => keep[i]).map(d => d.id!));
        if (!ids.size) return;
        setBusy(true);
        setError('');
        try {
            const savedTasks = await createTasks(userId, job.id, keepDrafts(drafts, ids));
            onCreated(savedTasks);
            toast.success(`Added ${savedTasks.length} task${savedTasks.length === 1 ? '' : 's'} from “${picked.name}”.`);
            onClose();
        } catch (e) {
            setError(describeError(e, 'The tasks could not be added.'));
        } finally {
            setBusy(false);
        }
    };

    const removeSaved = async (t: TaskTemplate) => {
        if (!saved) return;
        setRemoving(t.id);
        try {
            const rest = saved.filter(x => x.id !== t.id);
            await saveTaskTemplates(rest);
            setSaved(rest);
            if (pickedId === t.id) setPickedId(STARTER_TASK_TEMPLATES[0].id);
        } catch (e) {
            setError(describeError(e, 'The template could not be removed.'));
        } finally {
            setRemoving(null);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title={step === 'pick' ? 'Add tasks from a template' : `Review: ${picked?.name}`}
            description={step === 'pick' ? 'A ready-made list of steps with dates and what waits for what. You review it before anything is added.' : 'Untick what this job does not need. Nothing is added until you press the button.'}
            footer={step === 'pick' ? (
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={next} disabled={!picked || !isYmd(start)}>Review the tasks</button>
                </>
            ) : (
                <>
                    <button type="button" className="btn btn-outline" onClick={() => { setStep('pick'); setError(''); }} disabled={busy}>Back</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void add(); }} disabled={busy || count === 0 || !isOnline}>
                        {busy ? 'Adding…' : `Add ${count} task${count === 1 ? '' : 's'}`}
                    </button>
                </>
            )}
        >
            {step === 'pick' ? (
                <div className="space-y-4">
                    <fieldset>
                        <legend className="label">Template</legend>
                        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card" role="radiogroup" aria-label="Templates">
                            {all.map(t => (
                                <li key={t.id} className={cx('flex items-center gap-1 pr-1', pickedId === t.id && 'bg-primary/5')}>
                                    <label className="flex min-h-[52px] min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2">
                                        <input type="radio" name="task-template" className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={pickedId === t.id} onChange={() => setPickedId(t.id)} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold">{t.name}</span>
                                            <span className="block text-xs text-muted-foreground">
                                                {t.items.length} task{t.items.length === 1 ? '' : 's'} · about {templateDays(t)} day{templateDays(t) === 1 ? '' : 's'}{isStarter(t.id) ? ' · ready-made' : ' · yours'}
                                            </span>
                                        </span>
                                    </label>
                                    {!isStarter(t.id) && (
                                        <button type="button" className="btn btn-ghost h-10 w-10 shrink-0 rounded-full p-0 text-muted-foreground" onClick={() => { void removeSaved(t); }} disabled={removing === t.id || !isOnline} aria-label={`Remove template ${t.name}`} title="Remove this template">
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                        {saved !== null && saved.length === 0 && <p className="mt-1.5 text-xs text-muted-foreground">Your own templates show here: open ⋯ › “Save these tasks as a template” on a job that has the steps you repeat.</p>}
                    </fieldset>
                    {picked && (
                        <ol className="space-y-0.5 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                            {picked.items.slice(0, 6).map((it, i) => <li key={i} className="truncate"><span className="tabular-nums">{i + 1}.</span> {it.title}</li>)}
                            {picked.items.length > 6 && <li>… and {picked.items.length - 6} more</li>}
                        </ol>
                    )}
                    <Field label="First task starts" htmlFor="tpl-start" hint="The other tasks are dated from this day.">
                        <input id="tpl-start" type="date" className="input sm:w-56" value={start} onChange={e => setStart(e.target.value)} />
                    </Field>
                    {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-muted-foreground">{count} of {rows.length} ticked</span>
                        <span className="flex gap-3">
                            <button type="button" className="font-semibold text-primary" onClick={() => setKeep(rows.map(() => true))} disabled={busy}>All</button>
                            <button type="button" className="font-semibold text-primary" onClick={() => setKeep(rows.map(() => false))} disabled={busy}>None</button>
                        </span>
                    </div>
                    <ReviewList rows={rows} keep={keep} disabled={busy} onKeep={(i, v) => setKeep(cur => cur.map((k, j) => (j === i ? v : k)))} />
                    {!isOnline && <p className="text-sm font-medium text-warning" role="status">{NEEDS_CONNECTION}</p>}
                    {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
                </div>
            )}
        </Modal>
    );
};

export const SaveTemplateModal: React.FC<{
    jobName: string;
    tasks: readonly JobTask[];
    onClose: () => void;
}> = ({ jobName, tasks, onClose }) => {
    const [name, setName] = useState(() => `${(jobName || 'My job').trim().slice(0, 60)} tasks`);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const cut = tasks.length > TEMPLATE_LIMITS.itemsPerTemplate;

    const save = async () => {
        const clean = name.replace(/\s+/g, ' ').trim();
        if (!clean) { setError('Give the template a name.'); return; }
        setBusy(true);
        setError('');
        try {
            const current = await loadTaskTemplates();
            const mine = templateFromTasks(clean, tasks, newId);
            const mode = await saveTaskTemplates([...current, mine]);
            toast.success(mode === 'account' ? `Template “${mine.name}” saved. Use it from any job.` : `Template “${mine.name}” saved on this device. It reaches your account when you are connected.`);
            onClose();
        } catch (e) {
            setError(describeError(e, 'The template could not be saved.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="sm"
            title="Save these tasks as a template"
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void save(); }} disabled={busy || !name.trim() || tasks.length === 0}>{busy ? 'Saving…' : 'Save template'}</button>
                </>
            )}
        >
            <div className="space-y-3">
                <Field label="Template name" htmlFor="tpl-name">
                    <input id="tpl-name" className="input" value={name} onChange={e => setName(e.target.value)} maxLength={TEMPLATE_LIMITS.name} autoFocus />
                </Field>
                <p className="text-sm text-muted-foreground">
                    {tasks.length} task{tasks.length === 1 ? '' : 's'} with their notes, lengths and what waits for what. Dates become “days after the first task”, so you can start it on any day. People, status and photos are not saved.
                </p>
                {cut && <p className="text-sm font-medium text-warning">A template holds {TEMPLATE_LIMITS.itemsPerTemplate} tasks. The first {TEMPLATE_LIMITS.itemsPerTemplate} are saved.</p>}
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </div>
        </Modal>
    );
};
