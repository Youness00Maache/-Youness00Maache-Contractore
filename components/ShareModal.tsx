import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client, EmailTemplate, Job, UserProfile } from '../types.ts';
import { computeDocumentTotals, formatMoney, toNumber } from '../utils/money.ts';
import { approvalUrl, copyToClipboard, ensureApprovalToken, ensurePortalKey, portalUrl } from '../utils/clientLinks.ts';
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

const defaultTemplate = (docType: string, hasLink: boolean): EmailTemplate => {
    const type = docType.toLowerCase();
    if (type === 'invoice') {
        return {
            subject: 'Invoice [Document Number] from [My Company]',
            body: `Hi [Client Name],\n\nHere is invoice [Document Number] for [Total Amount].${hasLink ? '\n\nView it online: [Link]' : ''}\n\nPlease let me know if you have any questions.\n\nThank you,\n[My Name]\n[My Company]`,
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

const ShareModal: React.FC<ShareModalProps> = ({
    isOpen, onClose, data, docType, profile, documentId, publicToken, clients = [], job, hasUnsavedChanges, onDownload, getPdfDataUri,
}) => {
    const navigate = useNavigate();
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const [busy, setBusy] = useState<'' | 'download' | 'share'>('');

    const client = useMemo(() => {
        const id = data?.clientId;
        const name = String(data?.clientName || '').trim().toLowerCase();
        return clients.find(c => c.id === id) || clients.find(c => name && c.name.trim().toLowerCase() === name) || null;
    }, [clients, data?.clientId, data?.clientName]);

    const canApprove = /^(estimate|change order)$/i.test(docType);
    const [portalLink, setPortalLink] = useState('');
    const [approvalLink, setApprovalLink] = useState(publicToken ? approvalUrl(publicToken) : '');
    const [bodyEdited, setBodyEdited] = useState(false);
    const shareLink = portalLink || approvalLink;
    const total = documentTotalOf(data);
    const number = documentNumberOf(data);
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    // links: the client's portal (created for legacy clients without a key) is what the message points to
    useEffect(() => {
        if (!isOpen) return;
        setBodyEdited(false);
        setApprovalLink(publicToken ? approvalUrl(publicToken) : '');
        if (!client) { setPortalLink(''); return; }
        let active = true;
        if (client.portal_key) setPortalLink(portalUrl(client.portal_key));
        else ensurePortalKey(client).then(key => { if (active) setPortalLink(portalUrl(key)); }).catch(() => undefined);
        return () => { active = false; };
    }, [isOpen, client, publicToken]);

    useEffect(() => {
        if (!isOpen) return;
        const key = `${docType.toLowerCase().replace(/\s+/g, '_')}_default`;
        const tpl = profile.emailTemplates?.[key] || defaultTemplate(docType, Boolean(shareLink));
        const fill = (text: string) => {
            const values: Record<string, string> = {
                '[Client Name]': data?.clientName || client?.name || 'there',
                '[Job Name]': data?.projectName || job?.name || 'your project',
                '[My Company]': data?.companyName || profile.companyName || '',
                '[My Name]': profile.name || '',
                '[Document Number]': number || docType,
                '[Total Amount]': total !== null ? formatMoney(total) : '',
                '[Link]': shareLink,
            };
            let out = text;
            for (const [k, v] of Object.entries(values)) out = out.split(k).join(v);
            return out.replace(/ \(\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
        };
        setSubject(fill(tpl.subject));
        if (!bodyEdited) setBody(fill(tpl.body));
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

    const copyApprovalLink = async () => {
        if (!documentId) return;
        try {
            const url = approvalUrl(await ensureApprovalToken(documentId));
            setApprovalLink(url);
            await copy(url, 'Approval link copied.');
        } catch (e) {
            flash('error', e instanceof Error ? e.message : 'Could not create the approval link.');
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
                    clientName: data?.clientName || client?.name,
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
                            {[number, data?.clientName, total !== null ? formatMoney(total) : ''].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="btn btn-ghost h-10 w-10 shrink-0 p-0" aria-label="Close"><XCircleIcon className="h-5 w-5" /></button>
                </div>

                <div className="space-y-5 overflow-y-auto px-5 py-4">
                    {hasUnsavedChanges && (
                        <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                            <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> You have unsaved changes. Email and links use the last saved version; save first to share the latest.
                        </p>
                    )}
                    <button
                        type="button"
                        className="btn btn-primary btn-lg w-full"
                        onClick={handleEmail}
                        disabled={!documentId}
                    >
                        <MailIcon className="h-5 w-5" /> Send with Gmail
                    </button>
                    {!documentId && <p className="-mt-3 text-center text-xs text-muted-foreground">Save the document first to email it with its PDF attached.</p>}
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" className={action} onClick={handleDownload} disabled={!onDownload || busy === 'download'}>
                            <span className="flex items-center gap-2 font-semibold text-foreground"><DownloadIcon className="h-4 w-4 text-primary" /> {busy === 'download' ? 'Creating…' : 'Download PDF'}</span>
                            <span className="text-xs text-muted-foreground">Attach it anywhere</span>
                        </button>
                        {canApprove && (documentId || approvalLink) && (
                            <button type="button" className={action} onClick={() => (documentId ? copyApprovalLink() : copy(approvalLink, 'Approval link copied.'))}>
                                <span className="flex items-center gap-2 font-semibold text-foreground"><GlobeIcon className="h-4 w-4 text-primary" /> Copy approval link</span>
                                <span className="text-xs text-muted-foreground">Client reviews &amp; signs online</span>
                            </button>
                        )}
                        {portalLink && (
                            <button type="button" className={action} onClick={() => copy(portalLink, 'Client portal link copied.')}>
                                <span className="flex items-center gap-2 font-semibold text-foreground"><UsersIcon className="h-4 w-4 text-primary" /> Copy portal link</span>
                                <span className="text-xs text-muted-foreground">All of {client?.name}’s documents</span>
                            </button>
                        )}
                        {canNativeShare && (
                            <button type="button" className={action} onClick={handleNativeShare} disabled={busy === 'share'}>
                                <span className="flex items-center gap-2 font-semibold text-foreground"><ShareIcon className="h-4 w-4 text-primary" /> {busy === 'share' ? 'Preparing…' : 'Share…'}</span>
                                <span className="text-xs text-muted-foreground">Messages, WhatsApp, more</span>
                            </button>
                        )}
                    </div>

                    {notice && (
                        <p role="status" className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${notice.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {notice.tone === 'ok' ? <CheckIcon className="h-3.5 w-3.5" /> : <AlertTriangleIcon className="h-3.5 w-3.5" />} {notice.text}
                        </p>
                    )}

                    <div className="space-y-3">
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
                    <a
                        className="btn btn-secondary"
                        href={`mailto:${/^[^\s@?&]+@[^\s@?&]+$/.test(client?.email || '') ? client!.email : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                    >
                        <MailIcon className="h-4 w-4" /> Open email app
                    </a>
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
