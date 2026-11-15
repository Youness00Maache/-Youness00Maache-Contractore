/**
 * Job page › Questions: write a question or a submittal (new, or an existing draft / one already sent).
 *  - start from one of the four ready-made ones, or blank
 *  - Question = the client types an answer; Submittal = the client approves or rejects (with a note)
 *  - a due date, and up to 10 attachments: this job's files and links, or a pasted link
 *  - "Save draft" keeps it to yourself; "Send to client" puts it on their project link
 * Changing a sent item is allowed (the client sees the new text; the history says it was edited).
 */
import React, { useMemo, useState } from 'react';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { validateLink } from '../../lib/jobFiles/jobFileLogic.ts';
import { stampOf } from '../../lib/jobFiles/jobFileView.ts';
import type { JobFile } from '../../lib/jobFiles/jobFileTypes.ts';
import { QUESTION_TEMPLATES, draftFromTemplate, validateDraft } from '../../lib/questions/questionLogic.ts';
import { createQuestion, sendQuestion, updateQuestion } from '../../lib/questions/questionsApi.ts';
import { QUESTION_LIMITS, type JobQuestion, type QuestionAttachment, type QuestionKind } from '../../lib/questions/questionTypes.ts';
import {
    QUESTIONS_PREMIUM_REASON, attachableFiles, attachmentFromFile, attachmentFromLink, attachmentReach, clientLinkNote, reachNote,
} from '../../lib/questions/questionView.ts';
import { addDays, todayYmd } from '../../lib/tasks/taskLogic.ts';
import { cx } from '../commsKit.tsx';
import { Field, Modal, Segmented, XIcon } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { PaperclipIcon } from '../Icons.tsx';
import { TypeStamp } from '../jobFiles/ui.tsx';

const KIND_HINT: Record<QuestionKind, string> = {
    question: 'Your client types an answer.',
    submittal: 'Your client approves or rejects it. A note is needed to reject.',
};

const QuestionEditorModal: React.FC<{
    /** the item being changed; omitted = a new one */
    question?: JobQuestion;
    userId: string;
    jobId: string;
    isOnline: boolean;
    /** this job's files (every version) to attach from */
    files: readonly JobFile[];
    hasClient: boolean;
    onClose: () => void;
    onSaved: (saved: JobQuestion, sent: boolean) => void;
    onUpgrade: (reason?: string) => void;
}> = ({ question, userId, jobId, isOnline, files, hasClient, onClose, onSaved, onUpgrade }) => {
    const editing = !!question;
    const wasSent = !!question && question.status !== 'draft' && question.status !== 'closed';
    const [kind, setKind] = useState<QuestionKind>(question?.kind ?? 'question');
    const [title, setTitle] = useState(question?.title ?? '');
    const [body, setBody] = useState(question?.body ?? '');
    const [due, setDue] = useState(question?.dueDate ?? '');
    const [atts, setAtts] = useState<QuestionAttachment[]>(() => question?.attachments ?? []);
    const [pickOpen, setPickOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [linkTitle, setLinkTitle] = useState('');
    const [linkError, setLinkError] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<'draft' | 'send' | null>(null);

    const pickable = useMemo(() => attachableFiles(files), [files]);
    const today = todayYmd();
    const full = atts.length >= QUESTION_LIMITS.attachments;
    const hasFile = (id: string) => atts.some(a => a.fileId === id);

    const applyTemplate = (id: string) => {
        const d = draftFromTemplate(id);
        setKind(d.kind);
        setTitle(d.title);
        setBody(d.body ?? '');
        setError('');
    };

    const toggleFile = (f: JobFile) => {
        if (hasFile(f.id)) setAtts(list => list.filter(a => a.fileId !== f.id));
        else if (!full) setAtts(list => [...list, attachmentFromFile(f)]);
    };

    const addLink = () => {
        const c = validateLink(linkUrl);
        if (!c.ok) { setLinkError(c.error); return; }
        if (full) { setLinkError(`Add up to ${QUESTION_LIMITS.attachments} attachments.`); return; }
        setAtts(list => [...list, attachmentFromLink(c.url, linkTitle)]);
        setLinkUrl('');
        setLinkTitle('');
        setLinkError('');
    };

    const save = async (send: boolean) => {
        if (busy) return;
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        const draft = { kind, title, body, dueDate: due || null, attachments: atts };
        const problem = validateDraft(draft);
        if (problem) { setError(problem); return; }
        setError('');
        setBusy(send ? 'send' : 'draft');
        try {
            let saved: JobQuestion;
            if (!question) {
                saved = await createQuestion(userId, jobId, draft, { send });
            } else {
                saved = await updateQuestion(question.id, draft);
                if (send) saved = await sendQuestion(question.id);
            }
            onSaved(saved, send);
            onClose();
        } catch (e) {
            if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e) || QUESTIONS_PREMIUM_REASON);
            else setError(describeError(e, 'It could not be saved.'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy !== null}
            size="lg"
            title={editing ? (wasSent ? 'Change what the client sees' : 'Edit the draft') : 'New question for your client'}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy !== null}>Cancel</button>
                    {wasSent ? (
                        <button type="button" className="btn btn-primary" onClick={() => { void save(false); }} disabled={busy !== null}>{busy === 'draft' ? 'Saving…' : 'Save changes'}</button>
                    ) : (
                        <>
                            <button type="button" className="btn btn-outline" onClick={() => { void save(false); }} disabled={busy !== null}>{busy === 'draft' ? 'Saving…' : 'Save draft'}</button>
                            <button type="button" className="btn btn-primary" onClick={() => { void save(true); }} disabled={busy !== null}>{busy === 'send' ? 'Sending…' : 'Send to client'}</button>
                        </>
                    )}
                </>
            )}
        >
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(false); }}>
                {!editing && (
                    <div>
                        <p className="label">Start from</p>
                        <div className="-mx-1 flex flex-wrap gap-2 px-1">
                            {QUESTION_TEMPLATES.map(t => (
                                <button key={t.id} type="button" onClick={() => applyTemplate(t.id)} disabled={busy !== null}
                                    className="min-h-[36px] rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/50">
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <Segmented<QuestionKind>
                        ariaLabel="Question or submittal"
                        value={kind}
                        onChange={k => { if (!editing || question?.status === 'draft') setKind(k); }}
                        options={[{ value: 'question', label: 'Question' }, { value: 'submittal', label: 'Submittal' }]}
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">{KIND_HINT[kind]}{editing && question?.status !== 'draft' ? ' (The type cannot change once it is sent.)' : ''}</p>
                </div>

                <Field label="Title" htmlFor="q-title">
                    <input id="q-title" className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={QUESTION_LIMITS.title} placeholder={kind === 'submittal' ? 'e.g. Please approve the change order' : 'e.g. Which tile would you like?'} disabled={busy !== null} />
                </Field>
                <Field label="Message" htmlFor="q-body" hint="What you need from the client, in plain words.">
                    <textarea id="q-body" className="input min-h-[104px]" rows={4} value={body} onChange={e => setBody(e.target.value)} maxLength={QUESTION_LIMITS.body} disabled={busy !== null} />
                </Field>

                <Field label="Answer by (optional)" htmlFor="q-due">
                    <div className="flex flex-wrap items-center gap-2">
                        <input id="q-due" type="date" className="input h-11 w-auto" value={due} onChange={e => setDue(e.target.value)} min={editing ? undefined : today} disabled={busy !== null} />
                        <button type="button" className="h-10 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground" onClick={() => setDue(addDays(today, 3))}>In 3 days</button>
                        <button type="button" className="h-10 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground" onClick={() => setDue(addDays(today, 7))}>In a week</button>
                        {due && <button type="button" className="h-10 px-2 text-xs font-semibold text-muted-foreground" onClick={() => setDue('')}>Clear</button>}
                    </div>
                </Field>

                {/* attachments */}
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <p className="label !mb-0">Attachments <span className="font-normal text-muted-foreground">({atts.length}/{QUESTION_LIMITS.attachments})</span></p>
                        {pickable.length > 0 && (
                            <button type="button" className="text-sm font-semibold text-primary" onClick={() => setPickOpen(v => !v)} aria-expanded={pickOpen}>
                                {pickOpen ? 'Done' : 'Attach from this job'}
                            </button>
                        )}
                    </div>
                    {atts.length > 0 && (
                        <ul className="mt-2 divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                            {atts.map((a, i) => {
                                const reach = attachmentReach(a, files);
                                return (
                                    <li key={`${a.fileId || a.url}-${i}`} className="flex items-center gap-2 py-1 pl-3 pr-1">
                                        <PaperclipIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{a.title}</span>
                                            <span className={cx('block text-xs', reach === 'opens' ? 'text-muted-foreground' : 'text-warning')}>{reachNote(reach)}{a.url ? ' (link)' : ''}</span>
                                        </span>
                                        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setAtts(list => list.filter((_, j) => j !== i))} aria-label={`Remove ${a.title}`}><XIcon className="h-4 w-4" /></button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {pickOpen && (
                        <ul className="mt-2 max-h-56 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border bg-card" aria-label="This job's files">
                            {pickable.map(f => {
                                const on = hasFile(f.id);
                                const reach = attachmentReach(attachmentFromFile(f), [f]);
                                return (
                                    <li key={f.id}>
                                        <label className={cx('flex min-h-[52px] cursor-pointer items-center gap-3 px-3 py-2', !on && full && 'opacity-50')}>
                                            <input type="checkbox" className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={on} onChange={() => toggleFile(f)} disabled={!on && full} />
                                            <TypeStamp text={stampOf(f)} className="h-8 w-10" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium">{f.title}</span>
                                                <span className="block text-xs text-muted-foreground">{reachNote(reach)}{reach === 'title_only' ? ' (show it in the client portal on the file to let them open it)' : ''}</span>
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <input className="input h-11" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Paste a link (https://…)" value={linkUrl} onChange={e => { setLinkUrl(e.target.value); setLinkError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} aria-label="Link to attach" disabled={busy !== null || full} />
                        <input className="input h-11" placeholder="Name (optional)" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} aria-label="Name of the link" maxLength={QUESTION_LIMITS.attachmentTitle} disabled={busy !== null || full} />
                        <button type="button" className="btn btn-outline h-11" onClick={addLink} disabled={!linkUrl.trim() || busy !== null || full}>Add link</button>
                    </div>
                    {linkError && <p className="mt-1 text-xs font-medium text-destructive">{linkError}</p>}
                </div>

                <p className={cx('rounded-lg px-3 py-2 text-xs', hasClient ? 'bg-muted/60 text-muted-foreground' : 'bg-warning/10 text-foreground')}>{clientLinkNote(hasClient)}</p>
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </form>
        </Modal>
    );
};

export default QuestionEditorModal;
