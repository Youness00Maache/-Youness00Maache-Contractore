/**
 * Job page › Questions (Premium): ask the client something and get the answer on the record.
 *  - a Question is answered in words, a Submittal is approved or rejected (with a note)
 *  - waiting for the client (overdue ones first), drafts, answered, closed
 *  - the client answers from their project link; "Copy link" gives it to you
 *  - tap a row for the whole story: what you asked, what they said and when, and every step in between
 * Every change needs a connection (it says so); the list is read again when the connection is back.
 * Data: lib/questions (logic + view words in questionLogic.ts / questionView.ts, Supabase calls in questionsApi.ts).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Job, Client } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { askAgain, closeQuestion, deleteQuestion, sendQuestion, setQuestionStatus } from '../../lib/questions/questionsApi.ts';
import { ownerActions, statusLabel, summarizeQuestions, type OwnerAction } from '../../lib/questions/questionLogic.ts';
import type { JobQuestion, QuestionSummary } from '../../lib/questions/questionTypes.ts';
import {
    CLIENT_ANSWERS_LINE, QUESTIONS_NEED_CONNECTION, QUESTIONS_PREMIUM_REASON, answerLine, clientLinkNote, countsParts, dueInfo, groupQuestions,
    questionMeta, statusTone,
} from '../../lib/questions/questionView.ts';
import { todayYmd } from '../../lib/tasks/taskLogic.ts';
import { copyToClipboard, ensurePortalKey, portalUrl } from '../../utils/clientLinks.ts';
import { cx } from '../commsKit.tsx';
import { ActionMenu, ConfirmDialog } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { PlusIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { StatusChip } from '../jobFiles/ui.tsx';
import { useJobFiles } from '../jobFiles/useJobFiles.ts';
import { useJobQuestions } from './useJobQuestions.ts';
import QuestionDetailModal from './QuestionDetailModal.tsx';
import QuestionEditorModal from './QuestionEditorModal.tsx';

export interface JobQuestionsPanelProps {
    job: Job;
    /** the job's client (the link they answer from); null = no client on the job */
    client: Client | null;
    userId: string;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
    /** counts changed (the "2 waiting" next to the tab and in the job header) */
    onSummary?: (jobId: string, summary: QuestionSummary) => void;
}

const EMPTY: JobQuestion[] = [];
const FILES_EMPTY: never[] = [];

const BAR: Record<ReturnType<typeof statusTone>, string> = {
    primary: 'bg-primary', warning: 'bg-warning', success: 'bg-success', danger: 'bg-destructive', muted: 'bg-muted-foreground/30',
};

const JobQuestionsPanel: React.FC<JobQuestionsPanelProps> = ({ job, client, userId, plan, isOnline, onUpgrade, onSummary }) => {
    const paid = isPaidTier(plan);
    const today = todayYmd();
    const { questions: loaded, error: loadError, ready, reload, upsert, remove } = useJobQuestions(job.id, isOnline);
    const { files: loadedFiles } = useJobFiles(job.id, isOnline);
    const files = Array.isArray(loadedFiles) ? loadedFiles : FILES_EMPTY;
    const questions = Array.isArray(loaded) ? loaded : EMPTY;

    const [editor, setEditor] = useState<{ question?: JobQuestion } | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<JobQuestion | null>(null);
    const [showClosed, setShowClosed] = useState(false);
    const [copied, setCopied] = useState(false);
    const portalKey = useRef<string | null>(client?.portal_key || null);

    const summary = useMemo(() => summarizeQuestions(questions, today), [questions, today]);
    const groups = useMemo(() => groupQuestions(questions), [questions]);
    const detail = openId ? questions.find(q => q.id === openId) || null : null;
    const hasClient = !!client;

    useEffect(() => { if (Array.isArray(loaded)) onSummary?.(job.id, summary); }, [loaded, summary, job.id, onSummary]);

    // ------------------------------------------------------------------------------ guards
    const needPremium = (): boolean => {
        if (paid) return true;
        onUpgrade(QUESTIONS_PREMIUM_REASON);
        return false;
    };
    const needOnline = (): boolean => {
        if (isOnline) return true;
        toast.error(NEEDS_CONNECTION);
        return false;
    };
    const fail = (e: unknown, fallback: string) => {
        if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e));
        else toast.error(describeError(e, fallback));
    };

    // ------------------------------------------------------------------------------ the client's link
    const copyLink = async () => {
        if (!client || !needOnline()) return;
        try {
            const key = portalKey.current || await ensurePortalKey(client);
            portalKey.current = key;
            if (await copyToClipboard(portalUrl(key))) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2500);
            } else {
                toast.error('Copying is blocked by your browser. Open the client page to copy the link.');
            }
        } catch (e) {
            toast.error(describeError(e, 'The link could not be made.'));
        }
    };

    // ------------------------------------------------------------------------------ changes
    const act = async (action: OwnerAction, q: JobQuestion) => {
        if (action === 'edit') { if (needPremium()) { setOpenId(null); setEditor({ question: q }); } return; }
        if (action === 'delete') { if (needPremium()) setConfirmDelete(q); return; }
        if (!needPremium() || !needOnline() || busyId) return;
        setBusyId(q.id);
        try {
            if (action === 'send') {
                upsert(await sendQuestion(q.id));
                toast.success(hasClient ? 'Sent. Your client sees it on their project link.' : 'Sent. Add a client to this job so they can see it.');
            } else if (action === 'ask_again') {
                upsert(await askAgain(q.id));
                toast.success('Asked again. The earlier answer stays in the history.');
            } else if (action === 'reopen') {
                upsert(await setQuestionStatus(q.id, 'sent'));
                toast.success('Sent to your client again.');
            } else if (action === 'close') {
                upsert(await closeQuestion(q.id));
                toast.success('Closed.');
            }
        } catch (e) {
            fail(e, 'The change could not be saved.');
        } finally {
            setBusyId(null);
        }
    };

    const confirmRemove = async () => {
        const q = confirmDelete;
        if (!q || !needOnline()) return;
        setBusyId(q.id);
        try {
            await deleteQuestion(q.id);
            remove(q.id);
            setOpenId(null);
            setConfirmDelete(null);
            toast.success('Deleted.');
        } catch (e) {
            fail(e, 'It could not be deleted.');
        } finally {
            setBusyId(null);
        }
    };

    const startNew = () => { if (needPremium() && needOnline()) setEditor({}); };

    // ------------------------------------------------------------------------------ rows
    // a plain function (not a component): a component defined in here would remount every row on each render
    const renderRow = (q: JobQuestion) => {
        const tone = statusTone(q.status);
        const due = dueInfo(q, today);
        const decided = q.status === 'answered' || q.status === 'approved' || q.status === 'rejected';
        const late = q.status === 'sent' && due.tone === 'late';
        const actions = ownerActions(q);
        return (
            <li key={q.id} className={cx('relative flex items-center gap-1 pl-4 pr-1', busyId === q.id && 'opacity-60')}>
                <span aria-hidden className={cx('absolute inset-y-2 left-0 w-[3px] rounded-r', BAR[late ? 'danger' : tone])} />
                <button type="button" onClick={() => setOpenId(q.id)} className="min-w-0 flex-1 py-2.5 pr-1 text-left">
                    <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-semibold leading-5">{q.title}</span>
                        <StatusChip tone={late ? 'danger' : tone} className="mt-0.5 shrink-0">{late ? due.text : statusLabel(q.status, q.kind)}</StatusChip>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {questionMeta(q, today).filter(m => !(late && m === due.text)).map((m, i) => <span key={i}>{m}</span>)}
                    </span>
                    {decided && (
                        <span className="mt-1 block truncate text-xs text-foreground">
                            <span className={cx('font-semibold', q.status === 'approved' && 'text-success', q.status === 'rejected' && 'text-destructive')}>{answerLine(q)}</span>
                            {q.answer ? <span className="text-muted-foreground"> · “{q.answer}”</span> : null}
                        </span>
                    )}
                </button>
                <span className="shrink-0">
                    <ActionMenu
                        label={`More for ${q.title}`}
                        items={[
                            { label: 'Open', onSelect: () => setOpenId(q.id) },
                            ...actions.map(a => ({
                                label: a === 'send' ? 'Send to client' : a === 'edit' ? (q.status === 'draft' ? 'Edit' : 'Change it') : a === 'close' ? 'Close it'
                                    : a === 'ask_again' ? 'Ask again' : a === 'reopen' ? (q.sentAt ? 'Reopen' : 'Send to client') : 'Delete',
                                onSelect: () => { void act(a, q); },
                                destructive: a === 'delete',
                            })),
                        ]}
                    />
                </span>
            </li>
        );
    };

    const section = (title: string, list: JobQuestion[], tone?: 'warning') => (list.length === 0 ? null : (
        <div key={title}>
            <h3 className="mb-1 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={tone === 'warning' ? 'text-foreground' : ''}>{title}</span>
                <span className="tabular-nums normal-case tracking-normal">{list.length}</span>
            </h3>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">{list.map(renderRow)}</ul>
        </div>
    ));

    // ------------------------------------------------------------------------------ render
    if (loaded === undefined) return <div className="skeleton h-40 w-full rounded-2xl" aria-busy="true" />;
    if (loaded === null) {
        return (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Client questions are being switched on for your account. Check back soon.
            </div>
        );
    }
    if (!ready && loadError) {
        return (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm" role="alert">
                <p className="font-semibold">{isOnline ? loadError : QUESTIONS_NEED_CONNECTION}</p>
                <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => { void reload(); }} disabled={!isOnline}>Try again</button>
            </div>
        );
    }
    if (!paid && questions.length === 0) {
        return (
            <section className="rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="questions-premium">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
                <h3 id="questions-premium" className="mt-1 text-lg font-bold">Get answers and approvals in writing</h3>
                <p className="mt-1 text-sm text-muted-foreground">Ask which tile or paint colour, or send a change order or a product sheet for approval. Your client answers from their project link, and you keep who said what and when.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={() => onUpgrade(QUESTIONS_PREMIUM_REASON)}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            </section>
        );
    }

    const parts = countsParts(summary);

    return (
        <section aria-labelledby="questions-heading" className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="questions-heading" className="text-base font-bold leading-tight">Questions and submittals</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {parts.length === 0 ? 'Nothing asked yet.' : parts.map((p, i) => (
                                <React.Fragment key={p.text}>
                                    {i > 0 && ' · '}
                                    <span className={p.tone === 'strong' ? 'font-semibold text-foreground' : p.tone === 'late' ? 'text-destructive' : ''}>{p.text}</span>
                                </React.Fragment>
                            ))}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <HelpButton topic="job-questions" />
                        <button type="button" className="btn btn-primary h-10 px-3.5" onClick={startNew}><PlusIcon className="h-4 w-4" /> New</button>
                    </div>
                </div>
                <div className={cx('mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/70 pt-3 text-sm', !hasClient && 'text-foreground')}>
                    <p className={cx('min-w-0', hasClient ? 'text-muted-foreground' : 'font-medium')}>{hasClient ? CLIENT_ANSWERS_LINE : clientLinkNote(false)}</p>
                    {hasClient && (
                        <button type="button" className={cx('btn btn-outline btn-sm min-h-[40px] shrink-0', copied && 'text-success')} onClick={() => { void copyLink(); }}>
                            {copied ? 'Link copied' : 'Copy client link'}
                        </button>
                    )}
                </div>
            </div>

            {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm" role="status">{QUESTIONS_NEED_CONNECTION}</p>}
            {!paid && <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">Questions and submittals are part of Premium. You can still read these; <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(QUESTIONS_PREMIUM_REASON)}>upgrade</button> to ask and change them.</p>}
            {loadError && <p className="text-sm text-destructive" role="alert">{loadError} <button type="button" className="underline" onClick={() => { void reload(); }}>Try again</button></p>}

            {questions.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Ask your client which tile or paint colour they want, or send a change order or a product sheet for approval. Start from a ready-made one with <span className="font-semibold text-foreground">New</span>.
                </p>
            ) : (
                <div className="space-y-4">
                    {section('Waiting for client', groups.waiting, 'warning')}
                    {section('Drafts', groups.drafts)}
                    {section('Answered', groups.decided)}
                    {groups.closed.length > 0 && (
                        <div>
                            <button type="button" className="mb-1 flex w-full items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed}>
                                <span>Closed <span className="normal-case tracking-normal">· {showClosed ? 'hide' : 'show'}</span></span>
                                <span className="tabular-nums normal-case tracking-normal">{groups.closed.length}</span>
                            </button>
                            {showClosed && <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">{groups.closed.map(renderRow)}</ul>}
                        </div>
                    )}
                </div>
            )}

            {editor && (
                <QuestionEditorModal
                    question={editor.question}
                    userId={userId}
                    jobId={job.id}
                    isOnline={isOnline}
                    files={files}
                    hasClient={hasClient}
                    onClose={() => setEditor(null)}
                    onSaved={(saved, sent) => {
                        upsert(saved);
                        toast.success(sent ? (hasClient ? 'Sent. Your client sees it on their project link.' : 'Sent. Add a client to this job so they can see it.') : 'Saved.');
                    }}
                    onUpgrade={onUpgrade}
                />
            )}

            {detail && !editor && (
                <QuestionDetailModal
                    key={detail.id}
                    question={detail}
                    files={files}
                    busy={busyId === detail.id}
                    isOnline={isOnline}
                    onClose={() => setOpenId(null)}
                    onAction={(a, q) => { void act(a, q); }}
                />
            )}

            <ConfirmDialog
                open={!!confirmDelete}
                title="Delete this question?"
                message={confirmDelete ? <>“{confirmDelete.title}” is removed with its history{confirmDelete.status === 'sent' ? ', and your client stops seeing it' : ''}. {confirmDelete.status === 'closed' || confirmDelete.status === 'draft' ? '' : 'To keep the record, close it instead.'}</> : undefined}
                confirmLabel="Delete"
                destructive
                busy={!!confirmDelete && busyId === confirmDelete.id}
                onConfirm={() => { void confirmRemove(); }}
                onCancel={() => setConfirmDelete(null)}
            />
        </section>
    );
};

export default JobQuestionsPanel;
