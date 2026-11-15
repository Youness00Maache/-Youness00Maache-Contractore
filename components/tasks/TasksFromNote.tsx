/**
 * "Turn a note into tasks" (Premium + AI): type or dictate a note, the assistant lists the tasks in it (who, when, what
 * waits for what), the contractor reviews and unticks, and only then are they saved. Same AI limits / upgrade handling
 * as the other AI buttons (PLAN_REQUIRED / PLAN_LIMIT / CREDITS_EMPTY open the upgrade window).
 */
import React, { useEffect, useRef, useState } from 'react';
import type { Job } from '../../types.ts';
import type { JobTask, ProposedTask } from '../../lib/tasks/taskTypes.ts';
import { nextSortOrder, proposalsToDrafts, todayYmd } from '../../lib/tasks/taskLogic.ts';
import { createTasks } from '../../lib/tasks/tasksApi.ts';
import { ExtractTasksError, runExtractTasks } from '../../src/ai/extractTasks.ts';
import { dispatchUpgradeEvent, isAiLimitCode } from '../../src/ai/events.ts';
import { EXTRACT_TASKS_LIMITS } from '../../supabase/functions/ai-assistant/shared/taskExtraction.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import { Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { SparklesIcon } from '../Icons.tsx';
import AIVoiceInput from '../AIVoiceInput.tsx';
import { ProposalsModal } from './TaskReview.tsx';
import { newId, type CrewPerson } from './taskUi.tsx';

const TasksFromNote: React.FC<{
    job: Pick<Job, 'id' | 'name'>;
    userId: string;
    existing: readonly JobTask[];
    people: readonly CrewPerson[];
    isOnline: boolean;
    onClose: () => void;
    onCreated: (tasks: JobTask[]) => void;
}> = ({ job, userId, existing, people, isOnline, onClose, onCreated }) => {
    const [text, setText] = useState('');
    const [interim, setInterim] = useState('');
    const [dictated, setDictated] = useState(false);
    const [voiceProblem, setVoiceProblem] = useState<string | null>(null);
    const [step, setStep] = useState<'compose' | 'working' | 'review'>('compose');
    const [error, setError] = useState('');
    const [proposals, setProposals] = useState<ProposedTask[]>([]);
    const [reply, setReply] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => () => abortRef.current?.abort(), []);

    const limit = EXTRACT_TASKS_LIMITS.textChars;

    const find = async () => {
        if (!isOnline) { setError(NEEDS_CONNECTION); return; }
        const note = text.trim();
        if (!note) { setError('Type or say what needs doing first.'); return; }
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setError('');
        setStep('working');
        try {
            const crew = people.filter(p => p.active).map(p => ({ id: p.id, name: p.name }));
            const res = await runExtractTasks({
                text: note,
                sourceKind: dictated ? 'voice_note' : 'text',
                today: todayYmd(),
                job: { id: job.id, name: job.name },
                crew,
                existingTitles: existing.map(t => t.title),
            }, ctrl.signal);
            if (ctrl.signal.aborted) return;
            if (!res.tasks.length) {
                setError(res.replyText || 'No tasks found in that note. Say who does what and when.');
                setStep('compose');
                return;
            }
            setProposals(res.tasks);
            setReply(res.replyText);
            setStep('review');
        } catch (e) {
            if (ctrl.signal.aborted) return;
            const code = e instanceof ExtractTasksError ? e.code : String((e as { code?: string })?.code || '');
            const message = e instanceof Error ? e.message : 'The assistant could not answer. Please try again.';
            // not on the plan / monthly allowance (or credits) used up: the usual upgrade window
            if (code === 'PLAN_REQUIRED' || isAiLimitCode(code)) { dispatchUpgradeEvent(message); onClose(); return; }
            setError(message);
            setStep('compose');
        } finally {
            if (abortRef.current === ctrl) abortRef.current = null;
        }
    };

    const cancelWork = () => { abortRef.current?.abort(); abortRef.current = null; setStep('compose'); };

    const save = async (kept: ProposedTask[]) => {
        if (!kept.length) return;
        if (!isOnline) { setSaveError(NEEDS_CONNECTION); return; }
        setSaving(true);
        setSaveError('');
        try {
            const drafts = proposalsToDrafts(kept, newId, { sortStart: nextSortOrder(existing) });
            const saved = await createTasks(userId, job.id, drafts);
            onCreated(saved);
            toast.success(`Added ${saved.length} task${saved.length === 1 ? '' : 's'} from your note.`);
            onClose();
        } catch (e) {
            setSaveError(describeError(e, 'The tasks could not be added.'));
        } finally {
            setSaving(false);
        }
    };

    if (step === 'review') {
        return (
            <ProposalsModal
                title="Tasks found in your note"
                intro={reply || 'Check them, fix a name or a date, untick what is wrong. Nothing is added until you press the button.'}
                proposals={proposals}
                busy={saving}
                error={saveError}
                onCancel={() => { setStep('compose'); setSaveError(''); }}
                onConfirm={save}
            />
        );
    }

    const working = step === 'working';
    return (
        <Modal
            open
            onClose={() => { abortRef.current?.abort(); onClose(); }}
            busy={false}
            size="md"
            title={<span className="inline-flex items-center gap-2"><SparklesIcon className="h-5 w-5 text-primary" /> Turn a note into tasks</span>}
            description="Type or dictate what needs doing. The assistant makes a task list you can check before it is saved."
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={working ? cancelWork : onClose}>{working ? 'Stop' : 'Cancel'}</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void find(); }} disabled={working || !text.trim() || !isOnline}>
                        {working ? 'Reading your note…' : 'Find the tasks'}
                    </button>
                </>
            )}
        >
            <div className="space-y-3">
                {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">{NEEDS_CONNECTION}</p>}
                <div className="flex items-start gap-2">
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value.slice(0, limit))}
                        rows={6}
                        className="input min-h-[140px] flex-1 text-base sm:text-sm"
                        placeholder="e.g. Pour the footings Monday. Mike orders the windows by Friday. Inspector comes the 20th. Paint after drywall is done."
                        aria-label="Note to turn into tasks"
                        disabled={working}
                    />
                    <AIVoiceInput
                        variant="compact"
                        disabled={working}
                        onTranscript={(s) => { setDictated(true); setText(cur => `${cur}${cur && !/\s$/.test(cur) ? ' ' : ''}${s}`.slice(0, limit)); }}
                        onInterim={setInterim}
                        onProblem={setVoiceProblem}
                    />
                </div>
                {interim && <p className="text-xs italic text-muted-foreground" aria-live="polite">{interim}</p>}
                {voiceProblem && <p className="text-xs font-medium text-destructive" role="status">{voiceProblem}</p>}
                {text.length > limit * 0.8 && <p className="text-xs text-muted-foreground">{text.length.toLocaleString()} of {limit.toLocaleString()} characters</p>}
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </div>
        </Modal>
    );
};

export default TasksFromNote;
