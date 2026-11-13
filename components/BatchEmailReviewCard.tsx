import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon, EditIcon, MailIcon, PaperclipIcon, TrashIcon, XCircleIcon, GoogleIcon } from './Icons.tsx';
import { Modal, Notice, Spinner, cx } from './commsKit.tsx';
import type { Client, Job, UserProfile } from '../types.ts';
import {
    sendEmailBatch,
    subscribeBatchProgress,
    wasBatchItemSent,
    type BatchItemStatus,
    type BatchSendResult,
    type EmailBatchItem,
} from '../services/batchEmailSender.ts';
import { getPreferredSender, GmailError, listGmailAccounts, startGmailConnect, type GmailAccount, type GmailUsage } from '../services/gmailService.ts';
import { plainTextToEmailHtml } from '../utils/emailTemplates.ts';

export type { EmailBatchItem };

interface BatchEmailReviewCardProps {
    batch: EmailBatchItem[];
    documentNames?: Record<string, string>;
    /** Legacy mode: the parent is sending (onConfirm). */
    isSending?: boolean;
    /** Legacy mode: called with the selected, not-yet-sent emails. Ignored when `sendContext` is given. */
    onConfirm: (finalBatch: EmailBatchItem[]) => void;
    onCancel?: () => void;
    /** When given, the card sends by itself (per-item status stays visible) and reports with `onSent`. */
    sendContext?: { profile: UserProfile; jobs?: Job[]; clients?: Client[] };
    onSent?: (result: BatchSendResult) => void;
    onUpgrade?: () => void;
}

interface Row extends EmailBatchItem {
    id: string;
    selected: boolean;
    status: BatchItemStatus;
    error?: string;
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2)}`);

/** Plain-text preview of an HTML body (no HTML is ever injected into the page). */
const htmlToPlain = (html: string): string => {
    if (!html) return '';
    try {
        const doc = new DOMParser().parseFromString(
            html.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n'),
            'text/html',
        );
        return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    } catch {
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
};

const signature = (batch: EmailBatchItem[]) =>
    JSON.stringify((batch || []).map((b) => [b.client_id, b.recipient_email, b.subject, b.body_html, b.attachment_document_ids || []]));

const toRows = (batch: EmailBatchItem[]): Row[] =>
    (batch || []).map((b, i) => {
        const id = b.id || newId();
        const item = { ...b, id };
        const sent = wasBatchItemSent(item, i);
        return {
            ...item,
            selected: !sent && EMAIL_RE.test((b.recipient_email || '').trim()),
            status: sent ? 'sent' : 'pending',
        };
    });

const STATUS_LABEL: Record<BatchItemStatus, string> = {
    pending: 'Ready',
    preparing: 'Attaching PDFs…',
    sending: 'Sending…',
    sent: 'Sent',
    failed: 'Failed',
    skipped: 'Not sent',
};

const StatusChip: React.FC<{ status: BatchItemStatus }> = ({ status }) => (
    <span
        className={cx(
            'badge shrink-0',
            status === 'sent' && 'badge-success',
            status === 'failed' && 'badge-danger',
            status === 'skipped' && 'badge-warning',
            (status === 'preparing' || status === 'sending') && 'badge-primary',
            status === 'pending' && 'badge-muted',
        )}
    >
        {(status === 'preparing' || status === 'sending') && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
        {status === 'sent' && <CheckCircleIcon className="h-3 w-3" />}
        {STATUS_LABEL[status]}
    </span>
);

export const BatchEmailReviewCard: React.FC<BatchEmailReviewCardProps> = ({
    batch, documentNames = {}, isSending = false, onConfirm, onCancel, sendContext, onSent, onUpgrade,
}) => {
    const [rows, setRows] = useState<Row[]>(() => toRows(batch));
    const sigRef = useRef(signature(batch));
    const [localSending, setLocalSending] = useState(false);
    const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string; action?: 'connect' | 'upgrade' } | null>(null);
    const [editing, setEditing] = useState<{ id: string; recipient: string; subject: string; body: string; bodyTouched: boolean; attachments: string[] } | null>(null);
    const [accounts, setAccounts] = useState<GmailAccount[] | null>(null);
    const [usage, setUsage] = useState<GmailUsage | null>(null);
    const [accountsError, setAccountsError] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);

    // The parent may rebuild the batch array on every render: only reset when its content really changes.
    useEffect(() => {
        const sig = signature(batch);
        if (sig !== sigRef.current) {
            sigRef.current = sig;
            setRows(toRows(batch));
            setNotice(null);
        }
    }, [batch]);

    useEffect(() => {
        let alive = true;
        listGmailAccounts()
            .then(({ accounts: a, usage: u }) => { if (alive) { setAccounts(a); setUsage(u); } })
            .catch((e) => { if (alive) setAccountsError((e as Error).message); });
        return () => { alive = false; };
    }, []);

    // Per-item progress, also when the parent does the sending (legacy onConfirm path).
    useEffect(() => subscribeBatchProgress((p) => {
        setRows((prev) => prev.map((r) => (r.id === p.key ? { ...r, status: p.status, error: p.error, selected: p.status === 'sent' ? false : r.selected } : r)));
    }), []);

    const sending = localSending || isSending || rows.some((r) => r.status === 'preparing' || r.status === 'sending');
    const sender = useMemo(() => {
        if (!accounts?.length) return null;
        const pref = getPreferredSender();
        return accounts.find((a) => a.id === pref) ?? accounts.find((a) => a.is_default) ?? accounts[0];
    }, [accounts]);
    const remaining = usage && usage.limit !== null ? Math.max(0, usage.limit - usage.emails_this_month) : null;
    const selectable = rows.filter((r) => r.status !== 'sent' && EMAIL_RE.test((r.recipient_email || '').trim()));
    const selected = rows.filter((r) => r.selected && r.status !== 'sent');
    const allSelected = selectable.length > 0 && selectable.every((r) => r.selected);
    const sentCount = rows.filter((r) => r.status === 'sent').length;

    const toggle = (id: string) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
    const toggleAll = () => setRows((prev) => prev.map((r) => (r.status === 'sent' || !EMAIL_RE.test((r.recipient_email || '').trim()) ? r : { ...r, selected: !allSelected })));
    const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

    const startEdit = (r: Row) => setEditing({
        id: r.id,
        recipient: r.recipient_email || '',
        subject: r.subject || '',
        body: htmlToPlain(r.body_html),
        bodyTouched: false,
        attachments: [...(r.attachment_document_ids || [])],
    });

    const saveEdit = () => {
        if (!editing) return;
        setRows((prev) => prev.map((r) => {
            if (r.id !== editing.id) return r;
            const recipient = editing.recipient.trim();
            return {
                ...r,
                recipient_email: recipient,
                subject: editing.subject.replace(/[\r\n]+/g, ' ').trim(),
                body_html: editing.bodyTouched ? plainTextToEmailHtml(editing.body) : r.body_html,
                attachment_document_ids: editing.attachments,
                selected: EMAIL_RE.test(recipient) && r.status !== 'sent',
                status: r.status === 'failed' || r.status === 'skipped' ? 'pending' : r.status,
                error: undefined,
            };
        }));
        setEditing(null);
    };

    const connect = async () => {
        setConnecting(true);
        try {
            await startGmailConnect({ returnTo: `${window.location.pathname}${window.location.search}` });
        } catch (e) {
            setConnecting(false);
            setNotice({ tone: 'danger', text: (e as Error).message });
        }
    };

    const handleSend = async () => {
        if (sending || selected.length === 0) return;
        setNotice(null);
        const items: EmailBatchItem[] = selected.map(({ selected: _s, status: _st, error: _e, ...item }) => item);
        if (!sendContext) {
            // Legacy: the parent sends; statuses arrive through subscribeBatchProgress.
            setRows((prev) => prev.map((r) => (r.selected && r.status !== 'sent' ? { ...r, status: 'pending', error: undefined } : r)));
            onConfirm(items);
            return;
        }
        setLocalSending(true);
        try {
            const result = await sendEmailBatch(items, { ...sendContext, accountId: sender?.id });
            if (result.stoppedReason === 'PLAN_LIMIT') {
                setNotice({ tone: 'warning', text: `Sent ${result.sent}. The free plan's monthly email limit was reached, so the rest were not sent.`, action: onUpgrade ? 'upgrade' : undefined });
            } else if (result.failed > 0) {
                setNotice({ tone: 'danger', text: `Sent ${result.sent}, ${result.failed} failed. Fix the failed ones and send again; sent emails won't be sent twice.` });
            } else {
                setNotice({ tone: 'success', text: `${result.sent} email${result.sent === 1 ? '' : 's'} sent${result.sender ? ` from ${result.sender}` : ''}.` });
            }
            listGmailAccounts().then(({ usage: u }) => setUsage(u)).catch(() => undefined);
            onSent?.(result);
        } catch (e) {
            const code = e instanceof GmailError ? e.code : '';
            const text = (e as Error).message.replace(/^GMAIL_NOT_CONNECTED:\s*/, '');
            setNotice({ tone: 'danger', text, action: code === 'NO_ACCOUNT' || code === 'RECONNECT_REQUIRED' ? 'connect' : code === 'PLAN_LIMIT' && onUpgrade ? 'upgrade' : undefined });
        } finally {
            setLocalSending(false);
        }
    };

    if (rows.length === 0) {
        return (
            <div className="card w-full max-w-md p-6 text-center">
                <MailIcon className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 font-semibold text-foreground">No emails to review</p>
                <p className="mt-1 text-sm text-muted-foreground">Mention a client with @ and ask to send their invoices. The client needs saved invoices and an email address.</p>
                {onCancel && <button type="button" className="btn btn-outline mt-4 min-h-[40px]" onClick={onCancel}>Close</button>}
            </div>
        );
    }

    return (
        <div className="card w-full max-w-full overflow-hidden animate-fade-in-up">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2 text-primary"><MailIcon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">Review emails before sending</h3>
                        <p className="truncate text-xs text-muted-foreground">
                            {accounts === null && !accountsError ? 'Checking your Gmail…'
                                : sender ? `From ${sender.gmail_address}${remaining !== null ? ` · ${remaining} free email${remaining === 1 ? '' : 's'} left this month` : ''}`
                                    : 'No Gmail account connected'}
                        </p>
                    </div>
                </div>
                <span className="badge badge-muted shrink-0">{sentCount}/{rows.length} sent</span>
            </div>

            <div className="space-y-3 p-4">
                {accounts !== null && accounts.length === 0 && (
                    <Notice tone="warning" title="Connect Gmail to send" action={
                        <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={connect} disabled={connecting}>
                            {connecting ? <Spinner label="Opening Google…" /> : <><GoogleIcon className="h-4 w-4" /> Connect Gmail</>}
                        </button>
                    }>Emails are sent from your own Gmail address.</Notice>
                )}
                {sender?.needs_reconnect && (
                    <Notice tone="warning" title={`Reconnect ${sender.gmail_address}`} action={
                        <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={connect} disabled={connecting}>Reconnect</button>
                    }>Google access expired or was removed.</Notice>
                )}
                {accountsError && <Notice tone="danger">{accountsError}</Notice>}
                {notice && (
                    <Notice tone={notice.tone} onClose={() => setNotice(null)} action={
                        notice.action === 'connect' ? <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={connect}>Connect Gmail</button>
                            : notice.action === 'upgrade' ? <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={onUpgrade}>Upgrade</button>
                                : undefined
                    }>{notice.text}</Notice>
                )}

                <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm text-muted-foreground">
                    <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={allSelected} onChange={toggleAll} disabled={sending || selectable.length === 0} />
                    Select all ({selected.length} of {rows.length} selected)
                </label>

                <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                    {rows.map((r) => {
                        const validRecipient = EMAIL_RE.test((r.recipient_email || '').trim());
                        const locked = sending || r.status === 'sent';
                        return (
                            <li key={r.id} className={cx('rounded-xl border p-3 transition', r.selected && r.status !== 'sent' ? 'border-primary/40 bg-primary/5' : 'border-border bg-card')}>
                                <div className="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                                        checked={r.selected && r.status !== 'sent'}
                                        onChange={() => toggle(r.id)}
                                        disabled={locked || !validRecipient}
                                        aria-label={`Send to ${r.client_name || r.recipient_email}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="truncate text-sm font-semibold text-foreground">{r.client_name || r.recipient_email || 'Recipient'}</p>
                                            <StatusChip status={r.status} />
                                        </div>
                                        <p className={cx('truncate text-xs', validRecipient ? 'text-muted-foreground' : 'text-destructive')}>
                                            {r.recipient_email || 'No email address. Edit to add one.'}
                                        </p>
                                        <p className="mt-1.5 truncate text-sm text-foreground"><span className="text-muted-foreground">Subject:</span> {r.subject || '(no subject)'}</p>
                                        <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{htmlToPlain(r.body_html)}</p>
                                        {!!r.attachment_document_ids?.length && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {r.attachment_document_ids.map((docId) => (
                                                    <span key={docId} className="badge badge-primary max-w-full">
                                                        <PaperclipIcon className="h-3 w-3 shrink-0" />
                                                        <span className="truncate">{documentNames[docId] || `Document ${docId.slice(0, 6)}`}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {r.error && <p className="mt-2 text-xs text-destructive">{r.error}</p>}
                                    </div>
                                    {!locked && (
                                        <div className="flex shrink-0 flex-col gap-1">
                                            <button type="button" className="btn btn-ghost h-10 w-10 p-0" onClick={() => startEdit(r)} aria-label="Edit email"><EditIcon className="h-4 w-4" /></button>
                                            <button type="button" className="btn btn-ghost h-10 w-10 p-0 text-destructive" onClick={() => remove(r.id)} aria-label="Remove email"><TrashIcon className="h-4 w-4" /></button>
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">PDFs are generated from the saved documents. Each email is sent once.</p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    {onCancel && (
                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={onCancel} disabled={sending}>
                            {sentCount > 0 ? 'Close' : 'Discard'}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-primary min-h-[40px]"
                        onClick={handleSend}
                        disabled={sending || selected.length === 0 || (accounts !== null && accounts.length === 0) || !!sender?.needs_reconnect}
                    >
                        {sending ? <Spinner label="Sending…" /> : `Send ${selected.length} selected`}
                    </button>
                </div>
            </div>

            <Modal
                open={!!editing}
                onClose={() => setEditing(null)}
                title="Edit email"
                footer={
                    <>
                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={() => setEditing(null)}>Cancel</button>
                        <button type="button" className="btn btn-primary min-h-[40px]" onClick={saveEdit} disabled={!editing || !EMAIL_RE.test(editing.recipient.trim()) || !editing.subject.trim()}>Save</button>
                    </>
                }
            >
                {editing && (
                    <div className="space-y-4">
                        <div>
                            <label className="label" htmlFor="batch-to">To</label>
                            <input id="batch-to" type="email" inputMode="email" className="input" value={editing.recipient} onChange={(e) => setEditing({ ...editing, recipient: e.target.value })} />
                            {editing.recipient && !EMAIL_RE.test(editing.recipient.trim()) && <p className="mt-1 text-xs text-destructive">Enter a valid email address.</p>}
                        </div>
                        <div>
                            <label className="label" htmlFor="batch-subject">Subject</label>
                            <input id="batch-subject" className="input" value={editing.subject} maxLength={300} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
                        </div>
                        <div>
                            <label className="label" htmlFor="batch-body">Message</label>
                            <textarea id="batch-body" className="input min-h-[160px] resize-y" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value, bodyTouched: true })} />
                        </div>
                        {editing.attachments.length > 0 && (
                            <div>
                                <p className="label">Attachments</p>
                                <ul className="space-y-2">
                                    {editing.attachments.map((docId) => (
                                        <li key={docId} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                                            <span className="flex min-w-0 items-center gap-2 text-sm"><PaperclipIcon className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{documentNames[docId] || `Document ${docId.slice(0, 6)}`}</span></span>
                                            <button type="button" className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-destructive" aria-label="Remove attachment" onClick={() => setEditing({ ...editing, attachments: editing.attachments.filter((a) => a !== docId) })}>
                                                <XCircleIcon className="h-4 w-4" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default BatchEmailReviewCard;
