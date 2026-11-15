/**
 * Job timeline: the "Conversation note" box at the top. Type or dictate what was said ("Client called, wants the tile in
 * grey"); it becomes a Note document on the job and shows on the timeline at once. With the Tasks tool, one tick also
 * makes a follow-up task. Offline the note waits on this device (the task needs a connection).
 */
import React, { useState } from 'react';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { CONVERSATION_NOTE_MAX, noteTextProblem } from '../../lib/timeline/noteInput.ts';
import AIVoiceInput from '../AIVoiceInput.tsx';

export interface QuickNoteProps {
    isOnline: boolean;
    /** the Tasks tool is set up on this account: offer the follow-up task */
    tasksReady: boolean;
    /** true once saved (the box is cleared); false keeps the text for another try */
    onSubmit: (text: string, makeTask: boolean) => Promise<boolean>;
    /** Free plan: ticking "follow-up task" opens the upgrade window instead */
    onTaskNeedsPremium?: () => boolean;
}

const QuickNote: React.FC<QuickNoteProps> = ({ isOnline, tasksReady, onSubmit, onTaskNeedsPremium }) => {
    const [text, setText] = useState('');
    const [interim, setInterim] = useState('');
    const [voiceProblem, setVoiceProblem] = useState<string | null>(null);
    const [makeTask, setMakeTask] = useState(false);
    const [saving, setSaving] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const submit = async () => {
        const issue = noteTextProblem(text);
        if (issue) { setProblem(issue); return; }
        setProblem(null);
        setSaving(true);
        const ok = await onSubmit(text, makeTask && isOnline);
        setSaving(false);
        if (ok) { setText(''); setInterim(''); setMakeTask(false); }
    };

    const left = CONVERSATION_NOTE_MAX - text.length;
    return (
        <form
            className="mb-5 rounded-xl border border-border bg-card p-3"
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            aria-label="Add a conversation note"
        >
            <label htmlFor="timeline-note" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Log a conversation</label>
            <div className="flex items-start gap-2">
                <textarea
                    id="timeline-note"
                    value={text}
                    onChange={(e) => { setText(e.target.value.slice(0, CONVERSATION_NOTE_MAX)); if (problem) setProblem(null); }}
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit(); } }}
                    rows={2}
                    className="input min-h-[64px] flex-1 resize-y text-base sm:text-sm"
                    placeholder="e.g. Client called, wants the tile in grey"
                    disabled={saving}
                />
                <AIVoiceInput
                    variant="compact"
                    disabled={saving}
                    onTranscript={(s) => setText(cur => `${cur}${cur && !/\s$/.test(cur) ? ' ' : ''}${s}`.slice(0, CONVERSATION_NOTE_MAX))}
                    onInterim={setInterim}
                    onProblem={setVoiceProblem}
                />
            </div>
            {interim && <p className="mt-1 text-xs italic text-muted-foreground" aria-live="polite">{interim}</p>}
            {voiceProblem && <p className="mt-1 text-xs font-medium text-destructive" role="status">{voiceProblem}</p>}
            {problem && <p className="mt-1 text-sm font-medium text-destructive" role="alert">{problem}</p>}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                {tasksReady ? (
                    <label className={`inline-flex min-h-[40px] items-center gap-2 text-sm ${isOnline ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground'}`}>
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={makeTask && isOnline}
                            disabled={!isOnline || saving}
                            onChange={(e) => {
                                if (e.target.checked && onTaskNeedsPremium && !onTaskNeedsPremium()) return;
                                setMakeTask(e.target.checked);
                            }}
                        />
                        Also make a follow-up task
                    </label>
                ) : <span />}
                <div className="flex items-center gap-3">
                    {left < 200 && <span className="text-xs tabular-nums text-muted-foreground">{left.toLocaleString('en-US')} left</span>}
                    <button type="submit" className="btn btn-primary h-10" disabled={saving || !text.trim()}>
                        {saving && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                        {saving ? 'Saving…' : 'Add note'}
                    </button>
                </div>
            </div>
            {!isOnline && (
                <p className="mt-1 text-xs text-muted-foreground" role="status">
                    The note is kept on this device and synced when you&apos;re back online.{tasksReady ? ` Follow-up task: ${NEEDS_CONNECTION}` : ''}
                </p>
            )}
        </form>
    );
};

export default QuickNote;
