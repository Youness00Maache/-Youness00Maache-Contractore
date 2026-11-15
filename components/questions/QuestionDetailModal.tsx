/**
 * Job page › Questions: one question or submittal in a window. What was asked, the attachments, what the client
 * answered or decided (their name, the date and their words), the full history, and the actions that fit its state
 * (send, edit, close, ask again, reopen, delete; lib/questions/questionLogic.ts ownerActions).
 */
import React, { useState } from 'react';
import type { JobFile } from '../../lib/jobFiles/jobFileTypes.ts';
import { ownerActions, kindLabel, statusLabel, type OwnerAction } from '../../lib/questions/questionLogic.ts';
import type { JobQuestion } from '../../lib/questions/questionTypes.ts';
import {
    answerLine, attachmentReach, dueInfo, historyNotes, historyRows, reachNote, statusTone,
} from '../../lib/questions/questionView.ts';
import { shortDate } from '../../lib/jobFiles/jobFileView.ts';
import { cx } from '../commsKit.tsx';
import { Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { ExternalLinkIcon, PaperclipIcon } from '../Icons.tsx';
import { StatusChip } from '../jobFiles/ui.tsx';
import { openJobFile } from '../jobFiles/openJobFile.ts';

const ACTION_LABEL = (a: OwnerAction, q: JobQuestion): string => {
    switch (a) {
        case 'send': return 'Send to client';
        case 'edit': return q.status === 'draft' ? 'Edit' : 'Change it';
        case 'close': return 'Close it';
        case 'ask_again': return 'Ask again';
        case 'reopen': return q.sentAt ? 'Reopen' : 'Send to client';
        case 'delete': return 'Delete';
        default: return a;
    }
};

const QuestionDetailModal: React.FC<{
    question: JobQuestion;
    files: readonly JobFile[];
    busy: boolean;
    isOnline: boolean;
    onClose: () => void;
    onAction: (action: OwnerAction, q: JobQuestion) => void;
}> = ({ question: q, files, busy, isOnline, onClose, onAction }) => {
    const [opening, setOpening] = useState<string | null>(null);
    const due = dueInfo(q);
    const decided = q.status === 'answered' || q.status === 'approved' || q.status === 'rejected';
    const rows = historyNotes(historyRows(q), q);
    const actions = ownerActions(q);
    const primary: OwnerAction[] = ['send', 'ask_again', 'reopen'];

    const openAttachment = async (id: string) => {
        const f = files.find(x => x.id === id);
        if (!f) return;
        if (!isOnline) { toast.error("You're offline. This needs a connection; try again when you're back online."); return; }
        setOpening(id);
        try {
            if (!(await openJobFile(f))) toast.error('The file could not be opened. Try again.');
        } finally {
            setOpening(null);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title={q.title}
            description={(
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusChip tone={statusTone(q.status)}>{statusLabel(q.status, q.kind)}</StatusChip>
                    <span className="font-medium text-foreground">{kindLabel(q.kind)}</span>
                    {q.status === 'sent' && due.text && <span className={cx(due.tone === 'late' && 'font-semibold text-destructive')}>{due.text}</span>}
                    {q.sentAt && <span>Sent {shortDate(q.sentAt)}</span>}
                </span>
            )}
            footer={(
                <>
                    {actions.map(a => (
                        <button
                            key={a}
                            type="button"
                            className={cx('btn', a === 'delete' ? 'btn-ghost text-destructive' : primary.includes(a) ? 'btn-primary' : 'btn-outline')}
                            onClick={() => onAction(a, q)}
                            disabled={busy}
                        >
                            {ACTION_LABEL(a, q)}
                        </button>
                    ))}
                </>
            )}
        >
            <div className="space-y-5">
                {q.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{q.body}</p>}

                {q.attachments.length > 0 && (
                    <section aria-label="Attachments">
                        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Attached</h3>
                        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                            {q.attachments.map((a, i) => {
                                const reach = attachmentReach(a, files);
                                return (
                                    <li key={`${a.fileId || a.url}-${i}`} className="flex items-center gap-2 py-1 pl-3 pr-1">
                                        <PaperclipIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{a.title}</span>
                                            <span className={cx('block text-xs', reach === 'opens' ? 'text-muted-foreground' : 'text-warning')}>{reachNote(reach)}</span>
                                        </span>
                                        {a.url ? (
                                            <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost h-10 px-2.5 text-sm" aria-label={`Open ${a.title}`}><ExternalLinkIcon className="h-4 w-4" /> Open</a>
                                        ) : reach !== 'gone' ? (
                                            <button type="button" className="btn btn-ghost h-10 px-2.5 text-sm" onClick={() => { void openAttachment(a.fileId!); }} disabled={opening === a.fileId} aria-label={`Open ${a.title}`}><ExternalLinkIcon className="h-4 w-4" /> Open</button>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                {/* what came back */}
                {decided ? (
                    <section aria-label="The client's reply" className={cx('rounded-xl border px-4 py-3', q.status === 'approved' ? 'border-success/40 bg-success/5' : q.status === 'rejected' ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5')}>
                        <p className="text-sm font-bold">{answerLine(q)}{q.answeredAt ? <span className="font-normal text-muted-foreground"> · {shortDate(q.answeredAt)}</span> : null}</p>
                        {q.answer ? <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{q.answer}</p> : <p className="mt-1 text-sm text-muted-foreground">No note.</p>}
                    </section>
                ) : q.status === 'sent' ? (
                    <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
                        Waiting for your client{due.tone === 'late' ? <span className="font-semibold text-destructive"> · {due.text}</span> : null}. They answer from their project link.
                    </p>
                ) : null}

                {rows.length > 0 && (
                    <section aria-label="History">
                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">History</h3>
                        <ol className="relative space-y-3 pl-5">
                            <span aria-hidden className="absolute bottom-1 left-[5px] top-1.5 w-px bg-border" />
                            {rows.map(r => (
                                <li key={r.key} className="relative">
                                    <span aria-hidden className={cx('absolute -left-5 top-1.5 h-[11px] w-[11px] rounded-full border-2 bg-background', r.client ? 'border-primary' : 'border-muted-foreground/50')} />
                                    <p className="text-sm font-medium leading-5">{r.label}</p>
                                    <p className="text-xs text-muted-foreground">{r.when}</p>
                                    {r.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">“{r.note}”</p>}
                                </li>
                            ))}
                        </ol>
                    </section>
                )}
            </div>
        </Modal>
    );
};

export default QuestionDetailModal;
