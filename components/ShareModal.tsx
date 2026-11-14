import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client, EmailTemplate, Job, UserProfile } from '../types.ts';
import { computeDocumentTotals, formatMoney, toNumber } from '../utils/money.ts';
import { approvalUrl, copyToClipboard, ensureApprovalToken, ensurePortalKey, portalUrl } from '../utils/clientLinks.ts';
import { shareLinkKind } from '../utils/clientPortalRules.ts';
import { fillEmailPlaceholders, payNowLine, senderIdentity, withPayLine } from '../utils/emailTemplates.ts';
import { payLinkFor } from '../lib/payments.ts';
import { choiceOf, optionRange } from '../lib/estimateOptions.ts';
import { shortShareMessage } from '../lib/messaging.ts';
import { MessageAppButtons } from './MessageAppButtons.tsx';
import { useOfflineDoc } from './offline/OfflineContext.tsx';
import { CopyIcon, MailIcon, XCircleIcon, DownloadIcon, ShareIcon, GlobeIcon, UsersIcon, CheckIcon, AlertTriangleIcon } from './Icons.tsx';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** document data (InvoiceData, EstimateData, ...) */
    data: any;
    /** FormType string, e.g. "Invoice", "Change Order" */
    docType: string;
    profile: UserProfile;
    /** id of the SAVED document; required to email it from the Communication page */
    documentId?: string;
    /** share token of the saved document (client approval link) */
    publicToken?: string | null;
    clients?: Client[];
    job?: Job;
    /** true when the form has unsaved edits (the saved version is what gets emailed) */
    hasUnsavedChanges?: boolean;
    onDownload?: () => Promise<unknown> | void;
    /** PDF as a data URI, used for the phone share sheet */
    getPdfDataUri?: () => Promise<string>;
    /** "To" when the document is not for a saved client (e.g. a purchase order goes to the vendor's email) */
    defaultRecipient?: string;
    /** name used for "Hi [Client Name]" when it is not the client (e.g. the vendor) */
    recipientName?: string;
    /**
     * Purchase order "Send to supplier" (Premium): the message carries the supplier's "Confirm order" link (the
     * document's approval link) once the database serves purchase orders on it (lib/suppliersApi.ts). Off = unchanged.
     */
    supplierConfirm?: boolean;
    /** a short, non-blocking note shown above the send buttons (e.g. the estimate review's "3 things to check") */
    topNotice?: React.ReactNode;
}

const NUMBER_KEYS = ['invoiceNumber', 'estimateNumber', 'workOrderNumber', 'changeOrderNumber', 'poNumber', 'receiptNumber', 'reportNumber', 'warrantyNumber'];

export const documentNumberOf = (data: any): string => {
    for (const k of NUMBER_KEYS) if (data?.[k]) return String(data[k]);
    return '';
};

/** Total shown to the client, computed exactly like the PDF / portal / email (utils/money.ts). */
export const documentTotalOf = (data: any): number | null => {
    if (!data) return null;
    if (Array.isArray(data.lineItems) && data.lineItems.length && data.amount === undefined) return computeDocumentTotals(data).total;
    if (data.amount !== undefined && data.amount !== null && data.amount !== '') return toNumber(data.amount);
    if (Array.isArray(data.lineItems) && data.lineItems.length) return computeDocumentTotals(data).total;
    return null;
};

/**
 * The total as words for messages and lists: "$1,250.00"; an estimate with good/better/best options and no choice yet
 * reads "3 options from $6,749.00". '' when there is no total.
 */
export const documentTotalTextOf = (data: any): string => {
    const range = data?.estimateOptions ? optionRange(data) : null;
    if (range && !choiceOf(data)) return `${range.count} options from ${formatMoney(range.min)}`;
    const total = documentTotalOf(data);
    return total !== null ? formatMoney(total) : '';
};

const defaultTemplate = (docType: string, hasLink: boolean): EmailTemplate => {
    const type = docType.toLowerCase();
    if (type === 'purchase order') {
        return {
            subject: 'Purchase Order [Document Number] from [My Company]',
            body: hasLink
                // "Send to supplier" with the online confirmation link (lib/suppliersApi.ts supplierConfirmLink)
                ? `Hello [Client Name],\n\nPlease find attached purchase order [Document Number] ([Total Amount]).\n\nConfirm the order online (no login needed): [Link]\nIf you can't fill part of it, use the same page to tell us why, or reply to this email.\n\nThank you,\n[My Name]\n[My Company]`
                : `Hello [Client Name],\n\nPlease find attached purchase order [Document Number] ([Total Amount]). Please confirm availability and the delivery date.\n\nThank you,\n[My Name]\n[My Company]`,
        };
    }
    if (type === 'invoice') {
        return {
            subject: 'Invoice [Document Number] from [My Company]',
            // [Pay Now] = "Pay now with PayPal ($1,250.00): https://…" (a button in the sent email), dropped when there's no pay link
            body: `Hi [Client Name],\n\nHere is invoice [Document Number] for [Total Amount].${hasLink ? '\n\nView it online: [Link]' : ''}\n\n[Pay Now]\n\nPlease let me know if you have any questions.\n\nThank you,\n[My Name]\n[My Company]`,
        };
    }
    if (type === 'estimate' || type === 'change order') {
        return {
            subject: `${docType} [Document Number] for [Job Name]`,
            body: `Hi [Client Name],\n\nHere is the ${type} for [Job Name] ([Total Amount]).${hasLink ? '\n\nYou can review and approve it here: [Link]' : ''}\n\nBest regards,\n[My Name]\n[My Company]`,
        };
    }
    return {
        subject: `${docType} [Document Number] from [My Company]`,
        body: `Hi [Client Name],\n\nHere is the ${type} for [Job Name].${hasLink ? '\n\nView it online: [Link]' : ''}\n\nBest regards,\n[My Name]\n[My Company]`,
    };
};

const dataUriToFile = (uri: string, name: string): File | null => {
    const m = uri.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/);
    if (!m) return null;
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: m[1] || 'application/pdf' });
};

/** One or more comma/semicolon-separated addresses, each `name@domain`. */
const isEmailList = (value: string) => {
    const parts = value.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    return parts.length > 0 && parts.every(p => /^[^\s@?&,;]+@[^\s@?&,;]+\.[^\s@?&,;]+$/.test(p));
};

const ShareModal: React.FC<ShareModalProps> = ({
    isOpen, onClose, data, docType, profile, documentId, publicToken, clients = [], job, hasUnsavedChanges, onDownload, getPdfDataUri,
    defaultRecipient, recipientName, supplierConfirm = false, topNotice,
}) => {
    const navigate = useNavigate();
    // offline, or a document still waiting in the offline outbox: email, links and messages wait (PDF still works)
    const sendBlocked = useOfflineDoc()?.sendBlockedReason ?? null;
    const [recipient, setRecipient] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const [busy, setBusy] = useState<'' | 'download' | 'share'>('');

    const client = useMemo(() => {
        const id = data?.clientId;
        const name = String(data?.clientName || '').trim().toLowerCase();
        return clients.find(c => c.id === id) || clients.find(c => name && c.name.trim().toLowerCase() === name) || null;
    }, [clients, data?.clientId, data?.clientName]);

    // "To" box (as in the original app), prefilled with the client's saved email; typing keeps the user's address
    const [recipientEdited, setRecipientEdited] = useState(false);
    useEffect(() => {
        if (!isOpen) { setRecipientEdited(false); return; }
        if (!recipientEdited) setRecipient(defaultRecipient?.trim() || client?.email?.trim() || '');
    }, [isOpen, client?.email, defaultRecipient]); // eslint-disable-line react-hooks/exhaustive-deps
    const recipientTrimmed = recipient.trim();
    const recipientValid = !recipientTrimmed || isEmailList(recipientTrimmed);
    const mailtoTo = recipientTrimmed && recipientValid ? recipientTrimmed.split(/[;,]/).map(s => s.trim()).filter(Boolean).join(',') : '';

    const canApprove = /^(estimate|change order)$/i.test(docType);
    // The message links to this document's own page (it opens for drafts too, which the portal doesn't show, and
    // for receipts); internal paperwork (purchase orders, time sheets, logs, notes) gets no client link at all.
    const clientFacing = shareLinkKind(docType) === 'document';
    const [portalLink, setPortalLink] = useState('');
    const [approvalLink, setApprovalLink] = useState(publicToken && clientFacing ? approvalUrl(publicToken) : '');
    const [bodyEdited, setBodyEdited] = useState(false);
    // supplier mode (purchase orders only): the "Confirm order" link, '' until the database supports it
    const supplierLinkMode = supplierConfirm && /^purchase order$/i.test(docType);
    const [supplierLink, setSupplierLink] = useState('');
    const shareLink = clientFacing ? approvalLink : supplierLinkMode ? supplierLink : '';
    const totalText = documentTotalTextOf(data);
    const number = documentNumberOf(data);
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    // invoice "Pay now": the contractor's own pay link with the amount still due (deposit / progress / balance)
    const pay = /^invoice$/i.test(docType) ? payLinkFor(data) : null;
    const payLine = pay ? payNowLine({ buttonLabel: pay.buttonLabel, amountText: formatMoney(pay.amount), href: pay.href }) : '';
    const sender = senderIdentity(profile, data?.companyName);
    const textMessage = shortShareMessage({
        docType,
        number: number || String(data?.title || '').trim(),
        total: totalText,
        clientName: recipientName || data?.clientName || client?.name,
        company: sender.company,
        link: shareLink,
        payLine,
    });

    // links: the document's own link goes in the message (a working one: reissued when the old link expired, or was
    // used before the document was reopened); the client's portal (key created for legacy clients) is a second option
    useEffect(() => {
        if (!isOpen) return;
        setBodyEdited(false);
        setApprovalLink(clientFacing && publicToken ? approvalUrl(publicToken) : '');
        let active = true;
        if (sendBlocked) {
            // nothing to link to yet (the account doesn't have this version / no connection)
            setApprovalLink('');
            setPortalLink('');
            return () => { active = false; };
        }
        if (clientFacing && documentId) {
            ensureApprovalToken(documentId).then(token => { if (active) setApprovalLink(approvalUrl(token)); }).catch(() => undefined);
        }
        if (!client || !clientFacing) setPortalLink('');
        else if (client.portal_key) setPortalLink(portalUrl(client.portal_key));
        else ensurePortalKey(client).then(key => { if (active) setPortalLink(portalUrl(key)); }).catch(() => undefined);
        return () => { active = false; };
    }, [isOpen, client, publicToken, documentId, clientFacing, sendBlocked]);

    useEffect(() => {
        if (!isOpen || !supplierLinkMode || !documentId || sendBlocked) { setSupplierLink(''); return; }
        let active = true;
        import('../lib/suppliersApi.ts')
            .then(({ supplierConfirmLink }) => supplierConfirmLink(documentId))
            .then((url) => { if (active) setSupplierLink(url || ''); })
            .catch(() => undefined);
        return () => { active = false; };
    }, [isOpen, supplierLinkMode, documentId, sendBlocked]);

    useEffect(() => {
        if (!isOpen) return;
        const key = `${docType.toLowerCase().replace(/\s+/g, '_')}_default`;
        const tpl = profile.emailTemplates?.[key] || defaultTemplate(docType, Boolean(shareLink));
        // company → name → email, so the text never reads "… from" or ends with a bare "Thank you," (QA 0b.6)
        const sender = senderIdentity(profile, data?.companyName);
        const fill = (text: string) => fillEmailPlaceholders(text, {
            '[Client Name]': recipientName || data?.clientName || client?.name || 'there',
            '[Job Name]': data?.projectName || job?.name || 'your project',
            '[My Company]': sender.company,
            '[My Name]': sender.name,
            // documents without a number (notes, time sheets) use their title, never the type twice ("Note Note")
            '[Document Number]': number || String(data?.title || '').trim(),
            '[Total Amount]': totalText,
            '[Link]': shareLink,
            '[Pay Now]': payLine,
            '[Pay Link]': pay?.href || '',
        });
        setSubject(fill(tpl.subject));
        // a saved custom template without [Pay Now] still gets the pay line (before the sign-off)
        const hasPayPlaceholder = /\[Pay (Now|Link)\]/.test(tpl.body);
        if (!bodyEdited) setBody(hasPayPlaceholder ? fill(tpl.body) : withPayLine(fill(tpl.body), payLine));
    }, [isOpen, shareLink]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isOpen) return;
        setNotice(null);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const flash = (tone: 'ok' | 'error', text: string) => setNotice({ tone, text });

    const copy = async (text: string, okText: string) => {
        if (await copyToClipboard(text)) flash('ok', okText);
        else flash('error', 'Copying isn’t allowed here. Select the text and copy it manually.');
    };

    const linkCopiedText = canApprove ? 'Approval link copied.' : 'Link copied.';
    const copyApprovalLink = async () => {
        if (!documentId) return;
        try {
            const url = approvalUrl(await ensureApprovalToken(documentId));
            setApprovalLink(url);
            await copy(url, linkCopiedText);
        } catch (e) {
            flash('error', e instanceof Error ? e.message : 'Could not create the link.');
        }
    };

    const handleDownload = async () => {
        if (!onDownload) return;
        setBusy('download');
        try { await onDownload(); } catch { flash('error', 'Could not create the PDF.'); } finally { setBusy(''); }
    };

    const handleEmail = () => {
        if (!documentId) return;
        onClose();
        navigate('/communication', {
            state: {
                prefillData: {
                    documentIds: [documentId],
                    documentType: docType,
                    clientId: client?.id,
                    clientEmail: client?.email,
                    ...(mailtoTo ? { recipient: mailtoTo } : {}),
                    // a vendor (purchase order) is not one of your clients: only the address is passed
                    ...(recipientName ? {} : { clientName: data?.clientName || client?.name }),
                    subject,
                    body,
                },
            },
        });
    };

    const handleNativeShare = async () => {
        setBusy('share');
        try {
            let shared = false;
            if (getPdfDataUri && typeof navigator.canShare === 'function') {
                const uri = await getPdfDataUri();
                const file = uri ? dataUriToFile(uri, `${(number || docType).replace(/[^\w.-]+/g, '_')}.pdf`) : null;
                if (file && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: subject, text: body });
                    shared = true;
                }
            }
            if (!shared) await navigator.share({ title: subject, text: body, ...(shareLink ? { url: shareLink } : {}) });
        } catch (e: any) {
            if (e?.name !== 'AbortError') flash('error', 'Sharing failed on this device. Use Download or Copy instead.');
        } finally {
            setBusy('');
        }
    };

    const action = 'flex min-h-[64px] flex-col items-start gap-1 rounded-xl border border-border bg-card p-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50';

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel flex max-h-[92vh] flex-col sm:max-w-xl" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <h3 id="share-title" className="text-lg font-semibold">Share {docType.toLowerCase()}</h3>
                        <p className="truncate text-sm text-muted-foreground">
                            {[number || data?.title, recipientName || data?.clientName, totalText].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="btn btn-ghost h-10 w-10 shrink-0 p-0" aria-label="Close"><XCircleIcon className="h-5 w-5" /></button>
                </div>

                <div className="space-y-5 overflow-y-auto px-5 py-4">
                    {topNotice}
                    {hasUnsavedChanges && (
                        <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                            <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> You have unsaved changes. Email and links use the last saved version; save first to share the latest.
                        </p>
                    )}
                    <button
                        type="button"
                        className="btn btn-primary btn-lg w-full"
                        onClick={handleEmail}
                        disabled={!documentId || Boolean(sendBlocked)}
                        title={sendBlocked || undefined}
                    >
                        <MailIcon className="h-5 w-5" /> Send with Gmail
                    </button>
                    {sendBlocked
                        ? <p className="-mt-3 text-center text-xs font-medium text-warning">{sendBlocked} You can still download the PDF.</p>
                        : !documentId && <p className="-mt-3 text-center text-xs text-muted-foreground">Save the document first to email it with its PDF attached.</p>}
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" className={action} onClick={handleDownload} disabled={!onDownload || busy === 'download'}>
                            <span className="flex items-center gap-2 font-semibold text-foreground"><DownloadIcon className="h-4 w-4 text-primary" /> {busy === 'download' ? 'Creating…' : 'Download PDF'}</span>
                            <span className="text-xs text-muted-foreground">Attach it anywhere</span>
                        </button>
                        {clientFacing && (documentId || approvalLink) && (
                            <button type="button" className={action} onClick={() => (documentId ? copyApprovalLink() : copy(approvalLink, linkCopiedText))} disabled={Boolean(sendBlocked)} title={sendBlocked || undefined}>
                                <span className="flex items-center gap-2 font-semibold text-foreground"><GlobeIcon className="h-4 w-4 text-primary" /> {canApprove ? 'Copy approval link' : 'Copy link'}</span>
                                <span className="text-xs text-muted-foreground">{canApprove ? <>Client reviews &amp; signs online</> : 'Client views it online, no login'}</span>
                            </button>
                        )}
                        {supplierLinkMode && supplierLink && (
                            <button type="button" className={action} onClick={() => copy(supplierLink, 'Confirm link copied.')}>
                                <span className="flex items-center gap-2 font-semibold text-foreground"><GlobeIcon className="h-4 w-4 text-primary" /> Copy confirm link</span>
                                <span className="text-xs text-muted-foreground">Supplier confirms the order online</span>
                            </button>
                        )}
                        {portalLink && (
                            <button type="button" className={action} onClick={() => copy(portalLink, 'Client portal link copied.')}>
                                <span className="flex items-center gap-2 font-semibold text-foreground"><UsersIcon className="h-4 w-4 text-primary" /> Copy portal link</span>
                                <span className="text-xs text-muted-foreground">All of {client?.name}’s documents</span>
                            </button>
                        )}
                        {canNativeShare && (
                            <button type="button" className={action} onClick={handleNativeShare} disabled={busy === 'share' || Boolean(sendBlocked)} title={sendBlocked || undefined}>
                                <span className="flex items-center gap-2 font-semibold text-foreground"><ShareIcon className="h-4 w-4 text-primary" /> {busy === 'share' ? 'Preparing…' : 'Share…'}</span>
                                <span className="text-xs text-muted-foreground">Messages, WhatsApp, more</span>
                            </button>
                        )}
                        {/* from the contractor's own phone: the message and link are typed in, nothing is sent by us */}
                        <MessageAppButtons variant="tiles" tileClassName={action} phone={recipientName ? '' : client?.phone} message={textMessage} disabledReason={sendBlocked} />
                    </div>
                    {pay && (
                        <p className="-mt-2 text-xs text-muted-foreground">
                            The message includes a “{pay.buttonLabel}” link for {formatMoney(pay.amount)} ({pay.amountLabel.toLowerCase()}).
                        </p>
                    )}

                    {notice && (
                        <p role="status" className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${notice.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {notice.tone === 'ok' ? <CheckIcon className="h-3.5 w-3.5" /> : <AlertTriangleIcon className="h-3.5 w-3.5" />} {notice.text}
                        </p>
                    )}

                    <div className="space-y-3">
                        <div>
                            <label className="label" htmlFor="share-to">To</label>
                            <input
                                id="share-to"
                                type="text"
                                inputMode="email"
                                autoComplete="email"
                                autoCapitalize="off"
                                spellCheck={false}
                                className={`input ${recipientValid ? '' : 'border-destructive'}`}
                                value={recipient}
                                onChange={e => { setRecipient(e.target.value); setRecipientEdited(true); }}
                                placeholder="client@example.com"
                            />
                            {!recipientValid ? (
                                <p className="mt-1.5 text-xs font-medium text-destructive">Check the email address (separate several with a comma).</p>
                            ) : !recipientTrimmed && (
                                <p className="mt-1.5 text-xs text-muted-foreground">{client && !recipientName ? `${client.name} has no saved email.` : 'Type the email address to send to.'}</p>
                            )}
                        </div>
                        <div>
                            <label className="label" htmlFor="share-subject">Subject</label>
                            <input id="share-subject" className="input" value={subject} onChange={e => setSubject(e.target.value)} />
                        </div>
                        <div>
                            <label className="label" htmlFor="share-body">Message</label>
                            <textarea id="share-body" className="input min-h-[160px] resize-y leading-relaxed" value={body} onChange={e => { setBody(e.target.value); setBodyEdited(true); }} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
                    <button type="button" className="btn btn-outline" onClick={() => copy(`${subject}\n\n${body}`, 'Message copied.')}>
                        <CopyIcon className="h-4 w-4" /> Copy message
                    </button>
                    {sendBlocked ? (
                        <button type="button" className="btn btn-secondary" disabled title={sendBlocked}>
                            <MailIcon className="h-4 w-4" /> Open email app
                        </button>
                    ) : (
                        <a
                            className="btn btn-secondary"
                            href={`mailto:${mailtoTo.split(',').map(encodeURIComponent).join(',').replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                        >
                            <MailIcon className="h-4 w-4" /> Open email app
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
