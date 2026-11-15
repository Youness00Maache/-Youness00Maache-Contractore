/**
 * Job page header: "Ask for feedback" (roadmap D8). A button in the job's tools row that opens one window:
 *   1. Make the link (Premium; the database enforces it too: a Free account is shown the upgrade prompt)
 *   2. Send it: copy the link, share it, or send a ready message by Gmail / text / WhatsApp (the same way the review
 *      request after payment goes out: lib/messaging patterns, services/gmailService.ts; nothing is sent by us)
 *   3. The answers for this job, with the same actions as Settings › Client feedback (components/feedback/FeedbackRow.tsx)
 * The button shows "Feedback: waiting" while a link is out and "Feedback: 4.5 of 5" once answered.
 * Hidden until the database has the feature (App.tsx passes this only when useFeedbackFeature is 'ready').
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client, Job, UserProfile } from '../../types.ts';
import { createFeedbackRequest, feedbackLink, isPlanLimitError } from '../../lib/feedback/feedbackApi.ts';
import { openRequestForJob } from '../../lib/feedback/feedbackLogic.ts';
import { FEEDBACK_PREMIUM_REASON, feedbackRequestMessage, jobFeedbackLabel } from '../../lib/feedback/feedbackUi.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { GmailError, sendEmail } from '../../services/gmailService.ts';
import { plainTextToEmailHtml, senderIdentity } from '../../utils/emailTemplates.ts';
import { copyToClipboard } from '../../utils/clientLinks.ts';
import { esc } from '../../utils/escapeHtml.ts';
import { toast } from '../Toast.tsx';
import { Modal, Spinner, cx, getErrorMessage } from '../commsKit.tsx';
import { TextField } from '../forms/Fields.tsx';
import { MessageAppButtons } from '../MessageAppButtons.tsx';
import { CopyIcon, MailIcon, ShareIcon, StarIcon } from '../Icons.tsx';
import FeedbackRow from './FeedbackRow.tsx';
import { useFeedbackList, type FeedbackListState } from './useFeedbackList.ts';

export interface JobFeedbackButtonProps {
    job: Job;
    client?: Client | null;
    userId: string;
    profile?: (UserProfile & { plan?: string }) | null;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
    onEmailSent?: () => void;
}

const AskWindow: React.FC<JobFeedbackButtonProps & { list: FeedbackListState; onClose: () => void }> = ({
    job, client, userId, profile, plan, isOnline, onUpgrade, onEmailSent, list, onClose,
}) => {
    const navigate = useNavigate();
    const paid = isPaidTier(plan);
    const rows = list.rows || [];
    const current = openRequestForJob(rows, job.id);
    const answered = rows.filter(r => r.status === 'submitted');
    const clientName = client?.name || job.clientName || '';
    const sender = senderIdentity(profile, profile?.companyName);
    const link = current ? feedbackLink(current.token) : '';
    const msg = useMemo(
        () => feedbackRequestMessage({ clientName, company: sender.company, senderName: sender.name, jobName: job.name, link }),
        [clientName, sender.company, sender.name, job.name, link],
    );
    const [to, setTo] = useState(client?.email || '');
    const [body, setBody] = useState(msg.body);
    useEffect(() => { setBody(msg.body); }, [msg.body]);
    const [creating, setCreating] = useState(false);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const hasReviewLink = !!String(profile?.googleReviewLink || '').trim();
    const canShare = typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function';

    const make = async (another: boolean) => {
        if (!paid) { onClose(); onUpgrade(FEEDBACK_PREMIUM_REASON); return; }
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        setCreating(true);
        try {
            const row = await createFeedbackRequest(userId, { jobId: job.id, clientId: client?.id ?? null }, { reuseOpen: !another });
            list.add(row);
        } catch (e) {
            if (isPlanLimitError(e)) { onClose(); onUpgrade(planLimitMessage(e)); }
            else toast.error(describeError(e, 'The link could not be made. Please try again.'));
        } finally {
            setCreating(false);
        }
    };

    const copy = async (text: string, okText: string) => {
        const ok = await copyToClipboard(text);
        if (ok) setStatus({ tone: 'ok', text: okText });
        else setStatus({ tone: 'error', text: 'Copying is not allowed here. Select the text and copy it.' });
    };

    const share = async () => {
        try { await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ title: 'How did we do?', text: msg.text, url: link }); } catch { /* cancelled */ }
    };

    const sendMail = async () => {
        const recipient = to.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) { setStatus({ tone: 'error', text: 'Add the client’s email address.' }); return; }
        if (!isOnline) { setStatus({ tone: 'error', text: NEEDS_CONNECTION }); return; }
        setSending(true);
        setStatus(null);
        try {
            const html = plainTextToEmailHtml(body).split(esc(link)).join(`<a href="${esc(link)}">${esc(link)}</a>`);
            await sendEmail({
                to: recipient, subject: msg.subject, text: body, html, fromName: sender.displayName,
                log: { kind: 'review_request', jobId: job.id || null, clientId: client?.id ?? null },
            });
            setStatus({ tone: 'ok', text: `Sent to ${recipient} from your Gmail.` });
            onEmailSent?.();
        } catch (e) {
            const code = e instanceof GmailError ? e.code : '';
            setStatus({
                tone: 'error',
                text: code === 'NO_ACCOUNT' ? 'Connect your Gmail first (Communication page), or copy the text.'
                    : code === 'RECONNECT_REQUIRED' || code === 'SCOPE_MISSING' ? 'Your Gmail connection needs to be renewed (Communication page). You can copy the text meanwhile.'
                        : getErrorMessage(e, 'The email could not be sent.'),
            });
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            size="lg"
            title={`Feedback on ${job.name || 'this job'}`}
        >
            <div className="space-y-6">
                {!current ? (
                    <section aria-label="Make a feedback link">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Send {clientName ? clientName.split(/\s+/)[0] : 'your client'} a short link. They tap 1 to 5 stars and can add a comment, no login. You see the answer here and decide what goes on your public page.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => void make(answered.length > 0)} disabled={creating}>
                                {creating ? <Spinner label="Making the link…" /> : paid ? (answered.length ? 'Make a new link' : 'Make the link') : <><StarIcon className="h-4 w-4" /> Upgrade to Premium</>}
                            </button>
                            {!paid && <span className="text-xs text-muted-foreground">Asking for feedback is part of Premium.</span>}
                        </div>
                    </section>
                ) : (
                    <section className="space-y-4" aria-label="Send the link">
                        <div>
                            <label className="label" htmlFor="fb-link">Link for your client</label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input id="fb-link" readOnly value={link} className="input min-w-0 flex-1 font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} />
                                <div className="flex gap-2">
                                    <button type="button" className="btn btn-outline min-h-[44px] flex-1 sm:flex-none" onClick={() => void copy(link, 'Link copied.')}><CopyIcon className="h-4 w-4" /> Copy link</button>
                                    {canShare && <button type="button" className="btn btn-outline min-h-[44px] flex-1 sm:flex-none" onClick={() => void share()}><ShareIcon className="h-4 w-4" /> Share</button>}
                                </div>
                            </div>
                            <p className="mt-1.5 text-xs text-muted-foreground">Waiting for an answer since {new Date(current.requestedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. The link works once.</p>
                        </div>

                        <div className="space-y-3 border-t border-border pt-4">
                            <p className="text-sm font-semibold text-foreground">Or send a ready message</p>
                            <TextField label="To" type="email" inputMode="email" value={to} onChange={setTo} placeholder="client@example.com" autoComplete="off" />
                            <div>
                                <label className="label" htmlFor="fb-body">Message</label>
                                <textarea id="fb-body" className="input min-h-[150px] resize-y text-sm leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
                            </div>
                            {status && <p role="status" className={cx('rounded-lg px-3 py-2 text-xs font-medium', status.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{status.text}</p>}
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => void sendMail()} disabled={sending}>
                                    {sending ? <Spinner label="Sending…" /> : <><MailIcon className="h-4 w-4" /> Send with Gmail</>}
                                </button>
                                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => void copy(body, 'Copied. Paste it into a text, WhatsApp or your email.')}><CopyIcon className="h-4 w-4" /> Copy text</button>
                                <MessageAppButtons phone={client?.phone} message={msg.text} />
                            </div>
                        </div>

                        {!hasReviewLink && (
                            <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
                                Every client who sends feedback is offered the same Google link, whatever the stars (Google does not allow asking only happy customers), once you add your Google review link.{' '}
                                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { onClose(); navigate('/settings#payments'); }}>Add it in Settings</button>
                            </p>
                        )}
                    </section>
                )}

                {answered.length > 0 && (
                    <section aria-label="Answers for this job" className="border-t border-border pt-2">
                        <h3 className="pt-3 text-sm font-bold text-foreground">Answers for this job</h3>
                        <ul className="divide-y divide-border">
                            {answered.map(r => <FeedbackRow key={r.id} r={r} showJob={false} isOnline={isOnline} onChanged={list.replace} onDeleted={list.remove} />)}
                        </ul>
                    </section>
                )}

                {list.error && <p role="alert" className="text-sm font-medium text-destructive">{list.error}</p>}
            </div>
        </Modal>
    );
};

const JobFeedbackButton: React.FC<JobFeedbackButtonProps> = (props) => {
    const { job, isOnline } = props;
    const list = useFeedbackList({ jobId: job.id, enabled: true, isOnline });
    const [open, setOpen] = useState(false);
    // the table went missing: no button (App.tsx also hides it until the feature is 'ready')
    if (list.rows === null) return null;
    const label = jobFeedbackLabel(list.rows || [], job.id);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className="btn btn-outline h-10" title="Ask your client how the job went" aria-haspopup="dialog">
                <StarIcon className="h-4 w-4" />
                <span className="sm:hidden">{label.short}</span><span className="hidden sm:inline">{label.long}</span>
            </button>
            {open && <AskWindow {...props} list={list} onClose={() => setOpen(false)} />}
        </>
    );
};

export default JobFeedbackButton;
