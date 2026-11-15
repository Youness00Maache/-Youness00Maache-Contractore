/**
 * Client portal › Project › "Questions for you": what the contractor asked the client (a question to answer in words, or
 * a submittal to approve or reject) at the TOP of the Project tab. Each waiting item shows the job, the date it is due,
 * the message and its attachments, then:
 *   question   a box for the answer + "Send answer"
 *   submittal  Approve / Reject (a note is needed to reject) + the client's typed name + "Send decision"
 * After sending, the item shows what was said and the history. Finished items fold under "Answered".
 * Renders NOTHING while there is nothing to show; a link that can't be used says so kindly.
 * Rules and words: lib/portal/questionView.ts. Data: lib/portal/questionsApi.ts (answers are public writes).
 */
import React, { useMemo, useState } from 'react';
import { answerPortalQuestion, type PortalAnswerResult, type PortalAttachment, type PortalQuestion } from '../../lib/portal/questionsApi.ts';
import {
    PORTAL_ANSWER_MAX, PORTAL_NAME_MAX, portalDueInfo, portalHistoryRows, portalStatusLabel, splitPortalQuestions, validatePortalAnswer,
} from '../../lib/portal/questionView.ts';
import { linkHost, shortDate } from '../../lib/jobFiles/jobFileView.ts';
import { cx } from '../commsKit.tsx';
import { CheckCircleIcon, ChevronDownIcon, ExternalLinkIcon, PaperclipIcon, XCircleIcon } from '../Icons.tsx';
import { ImageLightbox } from './PortalFiles.tsx';

export interface PortalQuestionsProps {
    portalKey: string;
    questions: PortalQuestion[];
    company: string;
    /** the list changed (an item was answered) */
    onAnswered: (q: PortalQuestion) => void;
    /** the item was already answered (the contractor has to ask again): read the list again */
    onStale: () => void;
    className?: string;
}

// ====================================================================================================== attachments
const Attachments: React.FC<{ items: PortalAttachment[] }> = ({ items }) => {
    const [big, setBig] = useState<PortalAttachment | null>(null);
    if (items.length === 0) return null;
    const isImage = (a: PortalAttachment) => a.kind === 'file' && !!a.href;
    const images = items.filter(isImage);
    const rest = items.filter(a => !isImage(a));
    return (
        <div className="mt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><PaperclipIcon className="h-3.5 w-3.5" /> Attached</p>
            {images.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-2">
                    {images.map((a, i) => (
                        <li key={`${a.path}-${i}`}>
                            <button type="button" onClick={() => setBig(a)} className="block h-20 w-20 overflow-hidden rounded-xl bg-muted ring-1 ring-border" aria-label={`View ${a.title}`}>
                                <img src={a.href!} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {rest.length > 0 && (
                <ul className="space-y-1.5">
                    {rest.map((a, i) => (
                        <li key={`${a.url}-${i}`}>
                            {a.href ? (
                                <a href={a.href} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm transition hover:border-primary/50">
                                    <span className="min-w-0"><span className="block truncate font-semibold">{a.title}</span><span className="block truncate text-xs text-muted-foreground">{linkHost(a.href)}</span></span>
                                    <span className="flex shrink-0 items-center gap-1 font-semibold text-primary">Open <ExternalLinkIcon className="h-4 w-4" /></span>
                                </a>
                            ) : (
                                <p className="rounded-xl border border-dashed border-border px-3 py-2 text-sm"><span className="font-medium">{a.title}</span> <span className="text-xs text-muted-foreground">· ask your contractor for a copy</span></p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {big && big.href && <ImageLightbox src={big.href} title={big.title} onClose={() => setBig(null)} />}
        </div>
    );
};

// ====================================================================================================== history
const History: React.FC<{ q: PortalQuestion; company: string }> = ({ q, company }) => {
    const rows = portalHistoryRows(q, company);
    if (rows.length === 0) return null;
    return (
        <ol className="mt-3 space-y-1.5 border-t border-border/70 pt-3 text-xs text-muted-foreground" aria-label="History">
            {rows.map(r => (
                <li key={r.key}>
                    <span className="font-semibold text-foreground">{r.label}</span> · {r.when}
                    {r.note ? <span className="block whitespace-pre-wrap">“{r.note}”</span> : null}
                </li>
            ))}
        </ol>
    );
};

// ====================================================================================================== the reply (after sending)
const Reply: React.FC<{ q: PortalQuestion }> = ({ q }) => (
    <div className={cx('rounded-xl border px-3.5 py-3', q.status === 'approved' ? 'border-success/40 bg-success/5' : q.status === 'rejected' ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5')}>
        <p className="flex items-center gap-1.5 text-sm font-bold">
            {q.status === 'approved' ? <CheckCircleIcon className="h-4 w-4 text-success" /> : q.status === 'rejected' ? <XCircleIcon className="h-4 w-4 text-destructive" /> : <CheckCircleIcon className="h-4 w-4 text-primary" />}
            {portalStatusLabel(q)}
            {q.answeredBy ? <span className="font-normal text-muted-foreground"> as {q.answeredBy}</span> : null}
            {q.answeredAt ? <span className="font-normal text-muted-foreground"> · {shortDate(q.answeredAt)}</span> : null}
        </p>
        {q.answer && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{q.answer}</p>}
    </div>
);

// ====================================================================================================== one waiting item
type Say = { tone: 'danger' | 'info'; text: string } | null;

const WaitingCard: React.FC<{
    q: PortalQuestion;
    portalKey: string;
    company: string;
    thanks: boolean;
    onAnswered: (q: PortalQuestion) => void;
    onStale: (id: string) => void;
}> = ({ q, portalKey, company, thanks, onAnswered, onStale }) => {
    const [text, setText] = useState('');
    const [name, setName] = useState('');
    const [choice, setChoice] = useState<'approved' | 'rejected' | null>(null);
    const [busy, setBusy] = useState(false);
    const [say, setSay] = useState<Say>(null);
    const due = portalDueInfo(q);
    const waiting = q.status === 'sent';
    const submittal = q.kind === 'submittal';
    const ids = `pq-${q.id}`;

    const send = async () => {
        if (busy) return;
        const input = submittal ? { decision: choice, answer: text, name } : { answer: text };
        const problem = validatePortalAnswer(q, input);
        if (problem) { setSay({ tone: 'danger', text: problem }); return; }
        setSay(null);
        setBusy(true);
        let res: PortalAnswerResult;
        try {
            res = await answerPortalQuestion(portalKey, q.id, input);
        } catch {
            res = { status: 'error', message: 'Your answer could not be sent. Please check your connection and try again.' };
        }
        setBusy(false);
        if (res.status === 'ready') onAnswered(res.data);
        else if (res.status === 'already') { setSay({ tone: 'info', text: 'This was already answered, so we updated it. Your answer was not sent.' }); onStale(q.id); }
        else if (res.status === 'invalid') setSay({ tone: 'danger', text: `This link no longer works. Please ask ${company} for a new one.` });
        else if (res.status === 'missing') setSay({ tone: 'danger', text: 'Answering is not available right now. Please try again later.' });
        else setSay({ tone: 'danger', text: res.message });
    };

    return (
        <article className={cx('card overflow-hidden border-l-4 p-4 sm:p-5', waiting ? (due.tone === 'late' ? 'border-l-destructive' : 'border-l-warning') : 'border-l-success')} aria-labelledby={`${ids}-title`}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">{q.jobName || 'Your project'}</span>
                <span className="text-muted-foreground">{submittal ? 'Please approve or reject' : 'A question for you'}</span>
                {waiting && due.text && <span className={cx('font-semibold', due.tone === 'late' ? 'text-destructive' : 'text-foreground')}>{due.text}</span>}
            </p>
            <h3 id={`${ids}-title`} className="mt-1 text-lg font-bold leading-snug">{q.title}</h3>
            {q.body && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{q.body}</p>}
            <Attachments items={q.attachments} />

            {waiting ? (
                <form className="mt-4 space-y-3 border-t border-border/70 pt-4" onSubmit={e => { e.preventDefault(); void send(); }}>
                    {submittal && (
                        <div role="radiogroup" aria-label="Your decision" className="grid grid-cols-2 gap-2">
                            <button type="button" role="radio" aria-checked={choice === 'approved'} onClick={() => setChoice('approved')} disabled={busy}
                                className={cx('min-h-[48px] rounded-xl border-2 px-3 text-sm font-bold transition', choice === 'approved' ? 'border-success bg-success text-white' : 'border-border bg-background hover:border-success/60')}>
                                Approve
                            </button>
                            <button type="button" role="radio" aria-checked={choice === 'rejected'} onClick={() => setChoice('rejected')} disabled={busy}
                                className={cx('min-h-[48px] rounded-xl border-2 px-3 text-sm font-bold transition', choice === 'rejected' ? 'border-destructive bg-destructive text-white' : 'border-border bg-background hover:border-destructive/60')}>
                                Reject
                            </button>
                        </div>
                    )}
                    <div>
                        <label htmlFor={`${ids}-text`} className="label">{submittal ? (choice === 'rejected' ? 'What needs to change?' : 'Note (needed only to reject)') : 'Your answer'}</label>
                        <textarea id={`${ids}-text`} className="input min-h-[96px]" rows={3} value={text} onChange={e => setText(e.target.value)} maxLength={PORTAL_ANSWER_MAX} disabled={busy} placeholder={submittal ? '' : 'Type your answer here'} />
                    </div>
                    {submittal && (
                        <div>
                            <label htmlFor={`${ids}-name`} className="label">Your name</label>
                            <input id={`${ids}-name`} className="input" value={name} onChange={e => setName(e.target.value)} maxLength={PORTAL_NAME_MAX} autoComplete="off" disabled={busy} placeholder="Type your full name" />
                            <p className="mt-1 text-xs text-muted-foreground">Typing your name confirms the decision.</p>
                        </div>
                    )}
                    {say && <p className={cx('text-sm font-medium', say.tone === 'danger' ? 'text-destructive' : 'text-muted-foreground')} role={say.tone === 'danger' ? 'alert' : 'status'}>{say.text}</p>}
                    <button type="submit" className="btn btn-primary min-h-[48px] w-full sm:w-auto" disabled={busy}>
                        {busy ? 'Sending…' : submittal ? 'Send decision' : 'Send answer'}
                    </button>
                </form>
            ) : (
                <div className="mt-4 space-y-2">
                    {thanks && <p className="text-sm font-semibold text-success" role="status">Thank you. {company} has your {submittal ? 'decision' : 'answer'}.</p>}
                    {say && <p className="text-sm text-muted-foreground" role="status">{say.text}</p>}
                    <Reply q={q} />
                    <History q={q} company={company} />
                </div>
            )}
        </article>
    );
};

// ====================================================================================================== one answered item (folded)
const AnsweredRow: React.FC<{ q: PortalQuestion; company: string }> = ({ q, company }) => {
    const [open, setOpen] = useState(false);
    return (
        <li className="border-b border-border/70 last:border-0">
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left">
                <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{q.title}</span>
                    <span className={cx('block truncate text-xs', q.status === 'approved' ? 'text-success' : q.status === 'rejected' ? 'text-destructive' : 'text-muted-foreground')}>
                        {portalStatusLabel(q)}{q.answeredAt ? ` · ${shortDate(q.answeredAt)}` : ''}{q.jobName ? ` · ${q.jobName}` : ''}
                    </span>
                </span>
                <ChevronDownIcon className={cx('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
            </button>
            {open && (
                <div className="space-y-1 px-3.5 pb-3.5">
                    {q.body && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{q.body}</p>}
                    <Attachments items={q.attachments} />
                    <div className="mt-3"><Reply q={q} /></div>
                    <History q={q} company={company} />
                </div>
            )}
        </li>
    );
};

// ====================================================================================================== the section
const PortalQuestions: React.FC<PortalQuestionsProps> = ({ portalKey, questions, company, onAnswered, onStale, className }) => {
    // items answered in this visit ('thanks'), or found already answered ('stale'), stay up top until the page is opened again
    const [kept, setKept] = useState<Record<string, 'thanks' | 'stale'>>({});
    const [showAnswered, setShowAnswered] = useState(false);
    const { waiting, answered } = useMemo(() => splitPortalQuestions(questions), [questions]);
    const top = useMemo(() => questions.filter(q => q.status === 'sent' || kept[q.id]).sort((a, b) => Number(b.status === 'sent') - Number(a.status === 'sent')), [questions, kept]);
    const older = answered.filter(q => !kept[q.id]);
    const recent = Object.keys(kept);
    if (top.length === 0 && older.length === 0) return null;
    return (
        <section aria-labelledby="portal-questions-heading" className={cx('max-w-3xl space-y-3', className)} data-testid="portal-questions">
            <div className="flex items-baseline justify-between gap-3">
                <h2 id="portal-questions-heading" className="text-lg font-bold">
                    {waiting.length > 0 ? 'Questions for you' : 'Your questions'}
                    {waiting.length > 0 && <span className="ml-2 badge badge-warning align-middle">{waiting.length} waiting</span>}
                </h2>
            </div>
            {waiting.length === 0 && recent.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing is waiting for you right now.</p>
            )}
            {top.map(q => (
                <WaitingCard
                    key={q.id}
                    q={q}
                    portalKey={portalKey}
                    company={company}
                    thanks={kept[q.id] === 'thanks'}
                    onAnswered={(next) => { setKept(k => ({ ...k, [next.id]: 'thanks' })); onAnswered(next); }}
                    onStale={(id) => { setKept(k => ({ ...k, [id]: 'stale' })); onStale(); }}
                />
            ))}
            {older.length > 0 && (
                <div>
                    <button type="button" onClick={() => setShowAnswered(v => !v)} aria-expanded={showAnswered} className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 text-left text-sm font-semibold">
                        <span>Answered <span className="font-normal text-muted-foreground">({older.length})</span></span>
                        <ChevronDownIcon className={cx('h-4 w-4 text-muted-foreground transition', showAnswered && 'rotate-180')} />
                    </button>
                    {showAnswered && <ul className="mt-2 overflow-hidden rounded-2xl border border-border bg-card">{older.map(q => <AnsweredRow key={q.id} q={q} company={company} />)}</ul>}
                </div>
            )}
        </section>
    );
};

export default PortalQuestions;
