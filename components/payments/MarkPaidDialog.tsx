/**
 * One-tap "Mark as paid" (invoice form header, job page document menu, dashboard "payments reported"):
 * records the payment on the invoice, creates the Receipt (job financials then show it as Collected), clears the
 * client's "I've paid" report, then offers the Google review request (Premium) with email / copy / text / WhatsApp.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Client, FormData as FormDataType, InvoiceData, Job, UserProfile } from '../../types.ts';
import { computeDocumentTotals, formatMoney, roundMoney, toNumber } from '../../utils/money.ts';
import { esc } from '../../utils/escapeHtml.ts';
import { plainTextToEmailHtml, senderIdentity } from '../../utils/emailTemplates.ts';
import { copyToClipboard } from '../../utils/clientLinks.ts';
import { fetchFullDocument, isLightweightDocument } from '../../lib/documents.ts';
import { isPaidTier, normalizeTier } from '../../lib/plans.ts';
import { paymentReportOf, suggestedPaymentAmount, suggestedPaymentMethod, type MarkPaidInput } from '../../lib/payments.ts';
import { PaymentSaveError, markReviewRequested, recordInvoicePayment, type RecordPaymentResult } from '../../lib/paymentsApi.ts';
import { reviewRequestMessage } from '../../lib/messaging.ts';
import { GmailError, sendEmail } from '../../services/gmailService.ts';
import { Modal, Notice, Spinner, cx, getErrorMessage } from '../commsKit.tsx';
import { DateField, MoneyField, TextField, Toggle } from '../forms/Fields.tsx';
import { PAYMENT_METHODS } from '../forms/documentFields.ts';
import { formatDisplayDate, todayISO } from '../forms/formUtils.ts';
import { MessageAppButtons } from '../MessageAppButtons.tsx';
import { CheckCircleIcon, CopyIcon, MailIcon, ReceiptIcon, StarIcon } from '../Icons.tsx';

export interface MarkPaidDialogProps {
    /** the invoice (a list summary is loaded in full first) */
    invoice: FormDataType | null;
    onClose: () => void;
    /** documents changed in the database: the updated invoice (+ the new receipt) */
    onRecorded: (docs: FormDataType[]) => void;
    profile: UserProfile & { plan?: string };
    job?: Partial<Job> | null;
    clients?: Client[];
    clientId?: string | null;
    onUpgrade?: (reason?: string) => void;
    onEmailSent?: () => void;
    onOpenReceipt?: (receipt: FormDataType) => void;
    onOpenSettings?: () => void;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();

const MarkPaidDialog: React.FC<MarkPaidDialogProps> = ({
    invoice, onClose, onRecorded, profile, job, clients = [], clientId, onUpgrade, onEmailSent, onOpenReceipt, onOpenSettings,
}) => {
    const [full, setFull] = useState<FormDataType | null>(invoice && !isLightweightDocument(invoice) ? invoice : null);
    const [loadError, setLoadError] = useState('');
    const [input, setInput] = useState<MarkPaidInput>({ amount: 0, date: todayISO(), method: '', note: '' });
    const [createReceipt, setCreateReceipt] = useState(true);
    const [step, setStep] = useState<'form' | 'saving' | 'done'>('form');
    const [error, setError] = useState('');
    const [result, setResult] = useState<RecordPaymentResult | null>(null);
    const receiptRef = useRef<FormDataType | null>(null);

    // load the full invoice and prefill amount / method from it (and from the client's "I've paid" note)
    useEffect(() => {
        let active = true;
        setStep('form'); setError(''); setResult(null); receiptRef.current = null;
        if (!invoice) { setFull(null); return; }
        const apply = (doc: FormDataType) => {
            const d = doc.data as InvoiceData;
            setFull(doc);
            setInput({ amount: suggestedPaymentAmount(d), date: todayISO(), method: suggestedPaymentMethod(d), note: '' });
        };
        if (!isLightweightDocument(invoice)) apply(invoice);
        else {
            setFull(null);
            fetchFullDocument(invoice.id).then(doc => { if (active) apply(doc); }).catch(e => { if (active) setLoadError(getErrorMessage(e)); });
        }
        return () => { active = false; };
    }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const d = (full?.data || {}) as InvoiceData;
    const totals = computeDocumentTotals(d);
    const due = totals.balanceDue;
    const amount = roundMoney(toNumber(input.amount));
    const after = roundMoney(Math.max(0, due - amount));
    const report = paymentReportOf(d);
    const number = str(d.invoiceNumber) || 'this invoice';
    const client = useMemo(() => {
        const name = str(d.clientName).toLowerCase();
        return clients.find(c => c.id === clientId) || clients.find(c => name && str(c.name).toLowerCase() === name) || null;
    }, [clients, clientId, d.clientName]);

    const save = async () => {
        if (!full) return;
        setError('');
        setStep('saving');
        try {
            const res = await recordInvoicePayment({
                invoice: full,
                userId: profile.id,
                profile,
                job,
                clientId: clientId ?? client?.id ?? null,
                input: { ...input, amount },
                createReceipt,
                existingReceipt: receiptRef.current,
            });
            receiptRef.current = res.receipt;
            setResult(res);
            setFull(res.invoice);
            setStep('done');
            onRecorded([res.invoice, ...(res.receipt ? [res.receipt] : [])]);
        } catch (e) {
            if (e instanceof PaymentSaveError && e.receipt) {
                receiptRef.current = e.receipt;
                onRecorded([e.receipt]);
            }
            setError(getErrorMessage(e, 'The payment could not be recorded. Please try again.'));
            setStep('form');
        }
    };

    const title = step === 'done' ? (result?.paidInFull ? 'Marked as paid' : 'Payment recorded') : `Mark ${number} as paid`;

    const footer = step === 'done' ? (
        <button type="button" className="btn btn-primary min-h-[44px]" onClick={onClose}>Done</button>
    ) : (
        <>
            <button type="button" className="btn btn-outline min-h-[44px]" onClick={onClose} disabled={step === 'saving'}>Cancel</button>
            <button type="button" className="btn btn-primary min-h-[44px]" onClick={save} disabled={!full || step === 'saving' || !(amount > 0)}>
                {step === 'saving' ? <Spinner label="Saving…" /> : amount >= due && due > 0 ? `Mark paid · ${formatMoney(amount)}` : `Record ${formatMoney(amount)}`}
            </button>
        </>
    );

    return (
        <Modal open={Boolean(invoice)} onClose={onClose} locked={step === 'saving'} size="md" title={title} description={str(d.clientName) ? `${number} · ${str(d.clientName)}` : undefined} footer={footer}>
            {!full ? (
                loadError ? <Notice tone="danger">{loadError}</Notice> : <div className="flex justify-center py-8"><Spinner label="Loading invoice…" /></div>
            ) : step === 'done' && result ? (
                <DoneStep
                    result={result}
                    input={{ ...input, amount }}
                    profile={profile}
                    client={client}
                    onRecorded={onRecorded}
                    onUpgrade={onUpgrade}
                    onEmailSent={onEmailSent}
                    onOpenReceipt={onOpenReceipt ? (r) => { onClose(); onOpenReceipt(r); } : undefined}
                    onOpenSettings={onOpenSettings ? () => { onClose(); onOpenSettings(); } : undefined}
                />
            ) : (
                <div className="space-y-4">
                    {report && (
                        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
                            <p className="font-semibold text-foreground">{str(d.clientName) || 'The client'} reported a payment{formatDisplayDate(report.at.slice(0, 10)) ? ` on ${formatDisplayDate(report.at.slice(0, 10))}` : ''}</p>
                            {(report.note || report.amount) && (
                                <p className="mt-0.5 text-muted-foreground">{[report.note && `“${report.note}”`, report.amount ? formatMoney(report.amount) : ''].filter(Boolean).join(' · ')}</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">Check that the money arrived before you mark it paid.</p>
                        </div>
                    )}
                    <div className="flex items-baseline justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3">
                        <span className="text-sm text-muted-foreground">{totals.amountPaid > 0 ? 'Balance due' : 'Amount due'}</span>
                        <span className="text-lg font-bold tabular-nums">{formatMoney(due)}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <MoneyField
                            label="Amount received"
                            value={input.amount}
                            onValueChange={v => setInput(p => ({ ...p, amount: v }))}
                            hint={amount > 0 && amount < due ? `Part payment: ${formatMoney(after)} will still be due.` : amount > due && due > 0 ? 'More than the balance: the invoice is marked paid in full.' : undefined}
                        />
                        <DateField label="Date received" value={input.date} max={todayISO()} onChange={v => setInput(p => ({ ...p, date: v }))} />
                        <TextField
                            label="Payment method"
                            value={input.method}
                            onChange={v => setInput(p => ({ ...p, method: v }))}
                            list="mark-paid-methods"
                            placeholder="e.g. PayPal, Check #1234"
                            autoComplete="off"
                        />
                        <TextField
                            label="Private note (optional)"
                            value={input.note || ''}
                            onChange={v => setInput(p => ({ ...p, note: v }))}
                            placeholder="Kept on the receipt only"
                            maxLength={200}
                        />
                    </div>
                    <datalist id="mark-paid-methods">{PAYMENT_METHODS.map(m => <option key={m} value={m} />)}</datalist>
                    <Toggle
                        checked={createReceipt}
                        onChange={setCreateReceipt}
                        label="Create a receipt"
                        description="Added to this job and linked to the invoice, so job financials count it as collected. Counts as one document on the Free plan."
                    />
                    {error && <Notice tone="danger" onClose={() => setError('')}>{error}</Notice>}
                </div>
            )}
        </Modal>
    );
};

/** After saving: what happened, the receipt, and the review request. */
const DoneStep: React.FC<{
    result: RecordPaymentResult;
    input: MarkPaidInput;
    profile: UserProfile & { plan?: string };
    client: Client | null;
    onRecorded: (docs: FormDataType[]) => void;
    onUpgrade?: (reason?: string) => void;
    onEmailSent?: () => void;
    onOpenReceipt?: (receipt: FormDataType) => void;
    onOpenSettings?: () => void;
}> = ({ result, input, profile, client, onRecorded, onUpgrade, onEmailSent, onOpenReceipt, onOpenSettings }) => {
    const d = result.invoice.data as InvoiceData;
    const receipt = result.receipt;
    const receiptNumber = receipt ? str((receipt.data as any)?.receiptNumber) : '';
    return (
        <div className="space-y-5">
            <p className="flex items-start gap-2 text-sm text-foreground" role="status">
                <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span>
                    {formatMoney(input.amount)} received{input.method ? ` by ${input.method}` : ''} on {formatDisplayDate(input.date)}.{' '}
                    {result.paidInFull ? `${str(d.invoiceNumber) || 'The invoice'} is paid in full.` : `${formatMoney(result.balanceAfter)} is still due.`}
                </span>
            </p>

            {receipt ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-sm">
                    <span className="flex items-center gap-2"><ReceiptIcon className="h-4 w-4 text-muted-foreground" /> Receipt {receiptNumber} created</span>
                    {onOpenReceipt && <button type="button" className="btn btn-ghost btn-sm min-h-[36px]" onClick={() => onOpenReceipt(receipt)}>Open receipt</button>}
                </div>
            ) : result.receiptProblem ? (
                <Notice
                    tone="warning"
                    title="The payment is saved, but no receipt was created"
                    action={result.receiptProblem.kind === 'limit' && onUpgrade ? (
                        <button type="button" className="btn btn-primary btn-sm min-h-[36px]" onClick={() => onUpgrade(result.receiptProblem?.message)}>Upgrade</button>
                    ) : undefined}
                >
                    {result.receiptProblem.message} You can add a receipt later from the job page.
                </Notice>
            ) : null}

            {result.paidInFull && (
                <ReviewRequestPanel invoice={result.invoice} profile={profile} client={client} onRecorded={onRecorded} onUpgrade={onUpgrade} onEmailSent={onEmailSent} onOpenSettings={onOpenSettings} />
            )}
        </div>
    );
};

/** Google review request after payment (Premium): same neutral request for every client, as Google requires. */
const ReviewRequestPanel: React.FC<{
    invoice: FormDataType;
    profile: UserProfile & { plan?: string };
    client: Client | null;
    onRecorded: (docs: FormDataType[]) => void;
    onUpgrade?: (reason?: string) => void;
    onEmailSent?: () => void;
    onOpenSettings?: () => void;
}> = ({ invoice, profile, client, onRecorded, onUpgrade, onEmailSent, onOpenSettings }) => {
    const d = invoice.data as InvoiceData;
    const paid = isPaidTier(normalizeTier(profile.plan || (profile.subscriptionTier === 'Premium' ? 'premium' : 'free')));
    const link = str(profile.googleReviewLink);
    const sender = senderIdentity(profile, d.companyName);
    const clientName = str(d.clientName) || str(client?.name);
    const msg = useMemo(() => reviewRequestMessage({ clientName, company: sender.company, senderName: sender.name, reviewLink: link }), [clientName, sender.company, sender.name, link]);
    const [to, setTo] = useState(str(client?.email));
    const [body, setBody] = useState(msg.body);
    const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [requestedAt, setRequestedAt] = useState(str(d.reviewRequestedAt));
    const autoRef = useRef(false);
    useEffect(() => { setBody(msg.body); }, [msg.body]);

    const remember = async () => {
        if (requestedAt) return;
        const now = new Date();
        setRequestedAt(now.toISOString());
        const updated = await markReviewRequested(invoice, now);
        if (updated) onRecorded([updated]);
    };

    const send = async (auto = false) => {
        const recipient = to.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) { setStatus({ tone: 'error', text: 'Add the client’s email address.' }); return; }
        setBusy(true);
        setStatus(null);
        try {
            const html = plainTextToEmailHtml(body).split(esc(link)).join(`<a href="${esc(link)}">${esc(link)}</a>`);
            await sendEmail({
                to: recipient, subject: msg.subject, text: body, html, fromName: sender.displayName,
                log: { kind: 'review_request', jobId: invoice.jobId || null, clientId: client?.id ?? null, documentId: invoice.id || null },
            });
            setStatus({ tone: 'ok', text: `${auto ? 'Sent automatically' : 'Sent'} to ${recipient} from your Gmail.` });
            onEmailSent?.();
            await remember();
        } catch (e) {
            const code = e instanceof GmailError ? e.code : '';
            const text = code === 'NO_ACCOUNT' ? 'Connect your Gmail first (Communication page), or copy the text below.'
                : code === 'RECONNECT_REQUIRED' || code === 'SCOPE_MISSING' ? 'Your Gmail connection needs to be renewed (Communication page). You can copy the text below meanwhile.'
                    : getErrorMessage(e, 'The email could not be sent.');
            setStatus({ tone: 'error', text });
        } finally {
            setBusy(false);
        }
    };

    // optional auto-send (Settings → Payments & reviews): once, right after the payment, when everything is known
    useEffect(() => {
        if (autoRef.current || !paid || !link || !profile.reviewAutoSend || requestedAt || !str(client?.email)) return;
        autoRef.current = true;
        void send(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!paid) {
        return (
            <div className="rounded-xl border border-border px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">Ask {clientName || 'your client'} for a Google review <span className="badge badge-primary">Premium</span></p>
                <p className="mt-1 text-sm text-muted-foreground">Right after each payment, send a short thank-you with your review link from your own Gmail, or copy it into a text.</p>
                {onUpgrade && <button type="button" className="btn btn-outline btn-sm mt-3 min-h-[36px]" onClick={() => onUpgrade('Review requests after payment are part of Premium.')}><StarIcon className="h-4 w-4" /> Upgrade</button>}
            </div>
        );
    }
    if (!link) {
        return (
            <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Ask {clientName || 'your client'} for a Google review</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your Google review link in Settings → Payments &amp; reviews, and the request is ready after every payment.</p>
                {onOpenSettings && <button type="button" className="btn btn-outline btn-sm mt-3 min-h-[36px]" onClick={onOpenSettings}>Open settings</button>}
            </div>
        );
    }
    return (
        <section className="space-y-3 rounded-xl border border-border px-4 py-4" aria-label="Review request">
            <div>
                <p className="text-sm font-semibold text-foreground">Ask {clientName || 'your client'} for a Google review</p>
                <p className="text-xs text-muted-foreground">
                    {requestedAt ? `Requested ${formatDisplayDate(requestedAt.slice(0, 10))}.` : 'Every client gets the same request (Google doesn’t allow asking only happy clients).'}
                </p>
            </div>
            <TextField label="To" type="email" inputMode="email" value={to} onChange={setTo} placeholder="client@example.com" autoComplete="off" />
            <div>
                <label className="label" htmlFor="review-body">Message</label>
                <textarea id="review-body" className="input min-h-[150px] resize-y text-sm leading-relaxed" value={body} onChange={e => setBody(e.target.value)} />
            </div>
            {status && (
                <p role="status" className={cx('rounded-lg px-3 py-2 text-xs font-medium', status.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{status.text}</p>
            )}
            <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => void send(false)} disabled={busy}>
                    {busy ? <Spinner label="Sending…" /> : <><MailIcon className="h-4 w-4" /> Send with Gmail</>}
                </button>
                <button
                    type="button"
                    className="btn btn-outline btn-sm min-h-[40px]"
                    onClick={async () => {
                        const ok = await copyToClipboard(body);
                        setStatus(ok ? { tone: 'ok', text: 'Copied. Paste it into a text, WhatsApp or your email.' } : { tone: 'error', text: 'Copying isn’t allowed here. Select the text and copy it.' });
                        if (ok) void remember();
                    }}
                >
                    <CopyIcon className="h-4 w-4" /> Copy text
                </button>
                <MessageAppButtons phone={client?.phone} message={msg.text} onOpen={() => void remember()} />
            </div>
        </section>
    );
};

export default MarkPaidDialog;
