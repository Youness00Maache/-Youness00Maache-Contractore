import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Client, FormData as FormDataType, Job, UserProfile } from '../types.ts';
import {
    CheckCircleIcon, ChevronDownIcon, CopyIcon, EyeIcon, GoogleIcon, PaletteIcon, PaperclipIcon, PlusIcon, RefreshCwIcon, SearchIcon,
    SendIcon, ShieldCheckIcon, StarIcon, TrashIcon, UsersIcon, XCircleIcon,
} from './Icons.tsx';
import RichTextEditor, { type RichTextEditorHandle } from './forms/RichTextEditor.tsx';
import { Avatar, ConfirmDialog, EmptyState, Modal, Notice, PageHeader, Spinner, StatusBadge, cx } from './commsKit.tsx';
import HelpButton from './help/HelpButton.tsx';
import EmailTemplateSelector from './EmailTemplateSelector.tsx';
import { applyTemplateVariables, fillEmailPlaceholders, plainTextToEmailHtml, safeColor, senderIdentity, type EmailTemplateDefinition } from '../utils/emailTemplates.ts';
import { sanitizeRichText } from '../utils/escapeHtml.ts';
import { computeDocumentTotals, formatMoney } from '../utils/money.ts';
import { isPaidTier, normalizeTier } from '../lib/plans.ts';
import {
    approvalUrl, copyToClipboard, documentLabel, ensureApprovalToken, ensurePortalKey, fetchClientById, fetchClientDocuments,
    fetchClientJobs, fetchDocumentSummaries, isExpired, portalUrl, searchClients, type ClientDocSummary,
} from '../utils/clientLinks.ts';
import {
    buildDocumentAttachments, disconnectGmailAccount, EMAIL_ATTACHMENT_LIMIT_BYTES, estimateBase64Bytes, getPreferredSender,
    GmailError, isPlanLimitGmailError, listGmailAccounts, sendEmail, setDefaultGmailAccount, setPreferredSender, startGmailConnect,
    type GmailAccount, type GmailUsage,
} from '../services/gmailService.ts';
import { emailLogLinksForDocs } from '../lib/emailLog/format.ts';

/** What other screens (Clients, AI router, ShareModal) may pass via `navigate('/communication', { state: { prefillData } })`. */
export interface CommunicationPrefill {
    clientId?: string;
    clientName?: string;
    clientEmail?: string;
    recipient?: string;
    documentIds?: string[];
    documentType?: string;
    subject?: string;
    body?: string;
    rawInstruction?: string;
    auto_send?: boolean;
}

interface CommunicationViewProps {
    /** Legacy props (kept for compatibility; the component loads what it needs itself). */
    supabase?: SupabaseClient;
    session?: Session | null;
    clients?: Client[];
    forms?: FormDataType[];
    jobs?: Job[];
    profile: UserProfile | null;
    onBack: () => void;
    /** Ignored: connecting is handled here (signed OAuth state). */
    onConnectGmail?: () => void;
    onDisconnectGmail?: () => void;
    onEmailSent?: () => void;
    onUpgrade?: () => void;
    prefillData?: CommunicationPrefill | null;
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const splitEmails = (value: string) => value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const APPROVABLE = new Set(['Estimate', 'Change Order']);

/** Plain text from editor HTML (for the text/plain part, copy, and emptiness checks). */
const htmlToPlain = (html: string): string => {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(
        html.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n').replace(/<li[^>]*>/gi, '• '),
        'text/html',
    );
    return (doc.body.textContent || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
};

const DEFAULT_COPY: Record<string, { subject: string; body: string }> = {
    invoice: {
        subject: 'Invoice [Document Number] from [My Company]',
        body: 'Hi [Client Name],\n\nPlease find attached invoice [Document Number] for [Total Amount].\n\nLet me know if you have any questions.\n\nBest regards,\n[My Name]\n[My Company]',
    },
    estimate: {
        subject: 'Estimate [Document Number] for [Job Name]',
        body: 'Hi [Client Name],\n\nAttached is our estimate for [Job Name] ([Total Amount]). We look forward to working with you.\n\nBest regards,\n[My Name]\n[My Company]',
    },
};

const Toggle: React.FC<{ checked: boolean; onChange: () => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
    <input type="checkbox" className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={checked} onChange={onChange} aria-label={label} disabled={disabled} />
);

const CommunicationView: React.FC<CommunicationViewProps> = ({ clients: propClients = [], jobs = [], profile, onBack, onEmailSent, onUpgrade, prefillData }) => {
    const navigate = useNavigate();
    const location = useLocation();

    /* ------------------------------------------------------------ Gmail accounts */
    const [accounts, setAccounts] = useState<GmailAccount[] | null>(null);
    const [usage, setUsage] = useState<GmailUsage | null>(null);
    const [accountsError, setAccountsError] = useState<string | null>(null);
    const [senderId, setSenderId] = useState<string | null>(() => getPreferredSender());
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [accountBusy, setAccountBusy] = useState<string | null>(null);
    const [toDisconnect, setToDisconnect] = useState<GmailAccount | null>(null);
    const [disconnectError, setDisconnectError] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);

    const loadAccounts = useCallback(async () => {
        setAccountsError(null);
        try {
            const res = await listGmailAccounts();
            setAccounts(res.accounts);
            setUsage(res.usage);
        } catch (e) {
            setAccounts((prev) => prev ?? []);
            setAccountsError((e as Error).message);
        }
    }, []);
    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    const sender = useMemo(() => {
        if (!accounts?.length) return null;
        return accounts.find((a) => a.id === senderId) ?? accounts.find((a) => a.is_default) ?? accounts[0];
    }, [accounts, senderId]);

    const chooseSender = (account: GmailAccount) => {
        setSenderId(account.id);
        setPreferredSender(account.id);
        setAccountMenuOpen(false);
    };

    const connectGmail = async (loginHint?: string) => {
        setConnecting(true);
        try {
            await startGmailConnect({ returnTo: '/communication', loginHint });
        } catch (e) {
            setConnecting(false);
            setAccountsError((e as Error).message);
        }
    };

    const makeDefault = async (account: GmailAccount) => {
        setAccountBusy(account.id);
        try {
            await setDefaultGmailAccount(account.id);
            await loadAccounts();
        } catch (e) {
            setAccountsError((e as Error).message);
        } finally {
            setAccountBusy(null);
        }
    };

    const confirmDisconnect = async () => {
        if (!toDisconnect) return;
        setAccountBusy(toDisconnect.id);
        setDisconnectError(null);
        try {
            await disconnectGmailAccount(toDisconnect.id);
            if (senderId === toDisconnect.id) { setSenderId(null); setPreferredSender(null); }
            setToDisconnect(null);
            await loadAccounts();
        } catch (e) {
            setDisconnectError((e as Error).message);
        } finally {
            setAccountBusy(null);
        }
    };

    const paid = usage ? usage.paid : isPaidTier(normalizeTier(profile?.subscriptionTier));
    const remaining = usage && usage.limit !== null ? Math.max(0, usage.limit - usage.emails_this_month) : null;

    /* ------------------------------------------------------------ recipient */
    const [client, setClient] = useState<Client | null>(null);
    const [clientQuery, setClientQuery] = useState('');
    const [clientResults, setClientResults] = useState<Client[]>([]);
    const [clientSearching, setClientSearching] = useState(false);
    const [clientPickerOpen, setClientPickerOpen] = useState(false);
    const [to, setTo] = useState('');
    const [cc, setCc] = useState('');
    const [showCc, setShowCc] = useState(false);

    useEffect(() => {
        if (!clientPickerOpen) return;
        const q = clientQuery.trim();
        const local = propClients
            .filter((c) => !q || `${c.name} ${c.email || ''} ${c.phone || ''}`.toLowerCase().includes(q.toLowerCase()))
            .slice(0, 20);
        setClientResults(local);
        let alive = true;
        const t = window.setTimeout(async () => {
            setClientSearching(true);
            try {
                const remote = await searchClients(q, 20);
                if (alive) {
                    const merged = [...remote, ...local.filter((l) => !remote.some((r) => r.id === l.id))];
                    setClientResults(merged.slice(0, 25));
                }
            } catch { /* keep local results */ } finally {
                if (alive) setClientSearching(false);
            }
        }, q ? 300 : 0);
        return () => { alive = false; window.clearTimeout(t); };
    }, [clientQuery, clientPickerOpen, propClients]);

    /* ------------------------------------------------------------ attachments */
    const [clientDocs, setClientDocs] = useState<ClientDocSummary[]>([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState<string | null>(null);
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
    const [extraDocs, setExtraDocs] = useState<ClientDocSummary[]>([]); // prefilled docs not in the client's list
    const [clientJobs, setClientJobs] = useState<{ id: string; name: string }[]>([]);

    const loadClientDocs = useCallback(async (c: Client) => {
        setDocsLoading(true);
        setDocsError(null);
        try {
            const cj = await fetchClientJobs(c);
            setClientJobs(cj.map((j) => ({ id: j.id, name: j.name })));
            const docs = await fetchClientDocuments(c, { jobIds: cj.map((j) => j.id), limit: 200 });
            setClientDocs(docs);
        } catch (e) {
            setClientDocs([]);
            setDocsError((e as Error).message);
        } finally {
            setDocsLoading(false);
        }
    }, []);

    const allDocs = useMemo(() => {
        const map = new Map<string, ClientDocSummary>();
        [...extraDocs, ...clientDocs].forEach((d) => map.set(d.id, d));
        return Array.from(map.values());
    }, [clientDocs, extraDocs]);
    const selectedDocs = useMemo(() => selectedDocIds.map((id) => allDocs.find((d) => d.id === id)).filter(Boolean) as ClientDocSummary[], [selectedDocIds, allDocs]);

    /* ------------------------------------------------------------ message */
    const [subject, setSubject] = useState('');
    const editorRef = useRef<RichTextEditorHandle>(null);
    const [bodyHtml, setBodyHtml] = useState('');
    // COMM-014: once the user (or a prefill) wrote the text, nothing may overwrite it automatically.
    const subjectDirty = useRef(false);
    const bodyDirty = useRef(false);
    const [template, setTemplate] = useState<EmailTemplateDefinition | null>(null);
    const [primaryColor, setPrimaryColor] = useState('#2563eb');
    const [secondaryColor, setSecondaryColor] = useState('#1e40af');
    const [showTemplates, setShowTemplates] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [copied, setCopied] = useState(false);
    const [inserting, setInserting] = useState<string | null>(null);

    /** Replaces the whole message (suggested text, prefill, reset). The editor shows it unless the user is typing in it. */
    const setEditorHtml = (html: string) => setBodyHtml(sanitizeRichText(html));

    const onEditorChange = (html: string) => {
        bodyDirty.current = true;
        setBodyHtml(html);
    };

    /** Inserts text at the caret (or at the end) of the message, as one undoable step; line breaks are kept. */
    const insertText = (text: string) => {
        if (!text) return;
        const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');
        editorRef.current?.insertHtml(html);
        bodyDirty.current = true;
    };

    /* ------------------------------------------------------------ suggested text */
    const jobNameFor = (docs: ClientDocSummary[]) => {
        const names = new Set(docs.map((d) => jobs.find((j) => j.id === d.jobId)?.name || clientJobs.find((j) => j.id === d.jobId)?.name || d.data.title || 'your project'));
        return names.size === 1 ? Array.from(names)[0] : 'your projects';
    };
    const totalFor = (docs: ClientDocSummary[]) => {
        const priced = docs.filter((d) => Array.isArray(d.data.lineItems) && d.data.lineItems.length || d.data.amount);
        if (!priced.length) return '';
        const sum = priced.reduce((acc, d) => acc + (Array.isArray(d.data.lineItems) && d.data.lineItems.length
            ? computeDocumentTotals(d.data as any).total
            : Number(d.data.amount) || 0), 0);
        return formatMoney(sum);
    };
    const fillVariables = (text: string, docs: ClientDocSummary[], c: Client | null) => {
        const values: Record<string, string> = {
            '[Client Name]': c?.name?.split(' ')[0] || 'there',
            '[Job Name]': jobNameFor(docs),
            // company → name → email (QA 0b.6)
            '[My Company]': senderIdentity(profile).company,
            '[My Name]': senderIdentity(profile).name,
            '[Document Number]': docs.map((d) => d.data.number).filter(Boolean).join(', ') || docs.map((d) => d.type).join(', '),
            '[Total Amount]': totalFor(docs) || 'the amount shown',
        };
        return fillEmailPlaceholders(text, values);
    };

    const suggestedCopy = (docs: ClientDocSummary[], c: Client | null) => {
        const type = docs[0]?.type || '';
        const key = `${type.toLowerCase().replace(/\s+/g, '_')}_default`;
        const custom = profile?.emailTemplates?.[key];
        const base = custom?.subject || custom?.body
            ? { subject: custom.subject || '', body: custom.body || '' }
            : DEFAULT_COPY[type.toLowerCase()] || {
                subject: `${docs.length > 1 ? 'Documents' : type || 'Message'} from [My Company]`,
                body: `Hi [Client Name],\n\nPlease find the attached ${docs.length > 1 ? 'documents' : (type || 'document').toLowerCase()}.\n\nBest regards,\n[My Name]\n[My Company]`,
            };
        return { subject: fillVariables(base.subject, docs, c), body: fillVariables(base.body, docs, c) };
    };

    /** Fills only the parts the user has not written yet. */
    const autoFill = (docs: ClientDocSummary[], c: Client | null) => {
        if (!docs.length) return;
        const s = suggestedCopy(docs, c);
        if (!subjectDirty.current) setSubject(s.subject);
        if (!bodyDirty.current) setEditorHtml(plainTextToEmailHtml(s.body));
    };

    const useSuggested = () => {
        const s = suggestedCopy(selectedDocs, client);
        setSubject(s.subject);
        setEditorHtml(plainTextToEmailHtml(s.body));
        subjectDirty.current = true;
        bodyDirty.current = true;
    };

    const toggleDoc = (id: string) => {
        const next = selectedDocIds.includes(id) ? selectedDocIds.filter((d) => d !== id) : [...selectedDocIds, id];
        setSelectedDocIds(next);
        autoFill(next.map((x) => allDocs.find((d) => d.id === x)).filter(Boolean) as ClientDocSummary[], client);
    };

    /* ------------------------------------------------------------ client selection */
    const selectClient = (c: Client | null, opts: { keepDocs?: boolean } = {}) => {
        const previousEmail = client?.email || '';
        setClient(c);
        setClientPickerOpen(false);
        setClientQuery('');
        if (!opts.keepDocs) setSelectedDocIds([]);
        setClientDocs([]);
        setClientJobs([]);
        if (c) {
            if (c.email && (!to.trim() || to.trim() === previousEmail)) setTo(c.email);
            loadClientDocs(c);
        } else if (to.trim() === previousEmail) {
            setTo('');
        }
    };

    /* ------------------------------------------------------------ prefill (once per payload, COMM-013) */
    const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
    const processedPrefill = useRef<string | null>(null);
    useEffect(() => {
        if (!prefillData) return;
        const key = JSON.stringify(prefillData);
        if (processedPrefill.current === key) return;
        processedPrefill.current = key;
        // Clear router state so a refresh or Back does not replay it.
        if (location.state) navigate(location.pathname, { replace: true, state: null });

        (async () => {
            const p = prefillData;
            let target: Client | null = null;
            try {
                if (p.clientId) target = propClients.find((c) => c.id === p.clientId) ?? await fetchClientById(p.clientId);
                if (!target && p.clientEmail) target = propClients.find((c) => c.email?.toLowerCase() === p.clientEmail!.toLowerCase()) ?? null;
                if (!target && p.clientName) {
                    const n = p.clientName.toLowerCase();
                    target = propClients.find((c) => c.name.toLowerCase() === n)
                        ?? (await searchClients(p.clientName, 5)).find((c) => c.name.toLowerCase().includes(n))
                        ?? null;
                }
                if (!target && p.rawInstruction) {
                    const text = p.rawInstruction.toLowerCase();
                    target = propClients.find((c) => c.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2).some((w) => text.includes(w))) ?? null;
                }
            } catch { /* fall back to manual selection */ }

            if (target) {
                setClient(target);
                loadClientDocs(target);
            }
            const recipient = p.recipient || p.clientEmail || target?.email || '';
            if (recipient) setTo(recipient);

            let docIds = Array.isArray(p.documentIds) ? p.documentIds.filter(Boolean) : [];
            let prefDocs: ClientDocSummary[] = [];
            if (docIds.length) {
                try {
                    prefDocs = await fetchDocumentSummaries(docIds);
                    setExtraDocs(prefDocs);
                    docIds = prefDocs.map((d) => d.id);
                } catch { docIds = []; }
            } else if (target && (/invoice/i.test(p.documentType || '') || /\binvoices?\b/i.test(p.rawInstruction || ''))) {
                try {
                    const cj = await fetchClientJobs(target);
                    const docs = await fetchClientDocuments(target, { jobIds: cj.map((j) => j.id), types: ['Invoice'], limit: 20 });
                    const open = docs.filter((d) => !['Paid', 'Cancelled', 'Draft'].includes(d.data.status || ''));
                    prefDocs = (open.length ? open : docs).slice(0, 5);
                    docIds = prefDocs.map((d) => d.id);
                    setExtraDocs(docs);
                } catch { /* manual */ }
            }
            setSelectedDocIds(docIds);

            if (p.subject) { setSubject(p.subject); subjectDirty.current = true; }
            if (p.body) { setEditorHtml(plainTextToEmailHtml(p.body)); bodyDirty.current = true; }
            if (!p.subject || !p.body) {
                if (prefDocs.length) autoFill(prefDocs, target);
                else if (!p.body && target) setEditorHtml(plainTextToEmailHtml(`Hi ${target.name.split(' ')[0]},\n\n\n\nBest regards,\n${profile?.name || ''}`));
            }
            if (p.auto_send) setPrefillNotice('The assistant prepared this email. Check it, then press Send.');
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillData]);

    /* ------------------------------------------------------------ insert info */
    const insertInfo = async (kind: string) => {
        setInserting(kind);
        setSendError(null);
        try {
            if (kind === 'client') insertText(client?.name || '');
            else if (kind === 'company') insertText(profile?.companyName || profile?.name || '');
            else if (kind === 'name') insertText(profile?.name || '');
            else if (kind === 'number') insertText(selectedDocs.map((d) => d.data.number).filter(Boolean).join(', '));
            else if (kind === 'total') insertText(totalFor(selectedDocs));
            else if (kind === 'job') insertText(jobNameFor(selectedDocs));
            else if (kind === 'portal' && client) {
                const key = await ensurePortalKey(client);
                if (!client.portal_key) setClient({ ...client, portal_key: key });
                insertText(portalUrl(key));
            } else if (kind === 'approval') {
                const docs = selectedDocs.filter((d) => APPROVABLE.has(d.type) && !d.data.clientSignedAt && !isExpired(d.data.expiryDate));
                const lines: string[] = [];
                for (const d of docs) {
                    const token = await ensureApprovalToken(d.id);
                    lines.push(`${documentLabel(d.type, d.data)}: ${approvalUrl(token)}`);
                }
                insertText(lines.join('\n'));
            }
        } catch (e) {
            setSendError((e as Error).message);
        } finally {
            setInserting(null);
        }
    };

    /* ------------------------------------------------------------ compose html */
    const composeHtml = (): string => {
        const inner = sanitizeRichText(bodyHtml);
        if (template) {
            return applyTemplateVariables(template.html, {
                body: inner,
                logo_url: profile?.logoUrl || '',
                company_name: senderIdentity(profile).company,
                company_address: profile?.address || '',
                company_phone: profile?.phone || '',
                company_website: profile?.website || '',
                user_name: senderIdentity(profile).name,
                user_job_title: profile?.jobTitle || '',
                user_phone: profile?.phone || '',
                user_website: profile?.website || '',
                primary_color: safeColor(primaryColor, '#2563eb'),
                secondary_color: safeColor(secondaryColor, '#1e40af'),
            });
        }
        return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${inner}</div>`;
    };

    /* ------------------------------------------------------------ send */
    type Phase = 'idle' | 'preparing' | 'sending' | 'sent';
    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState('');
    const [sendError, setSendError] = useState<string | null>(null);
    const [errorKind, setErrorKind] = useState<'reconnect' | 'connect' | 'limit' | null>(null);
    const [sentInfo, setSentInfo] = useState<{ to: string[]; from: string; attachments: number } | null>(null);
    const sendLock = useRef(false);

    const toList = splitEmails(to);
    const ccList = splitEmails(cc);
    const invalidTo = toList.filter((e) => !EMAIL_RE.test(e));
    const invalidCc = ccList.filter((e) => !EMAIL_RE.test(e));
    const plainBody = htmlToPlain(bodyHtml);
    const limitReached = !paid && remaining !== null && remaining <= 0;

    const problems: string[] = [];
    if (!toList.length) problems.push('Add a recipient.');
    if (invalidTo.length) problems.push(`Check this address: ${invalidTo[0]}`);
    if (invalidCc.length) problems.push(`Check this Cc address: ${invalidCc[0]}`);
    if (!subject.trim()) problems.push('Add a subject.');
    if (!plainBody && !selectedDocIds.length) problems.push('Write a message or attach a document.');

    const handleSend = async () => {
        if (sendLock.current) return;
        setSendError(null);
        setErrorKind(null);
        if (!accounts?.length || !sender) { setErrorKind('connect'); setSendError('Connect a Gmail account to send.'); return; }
        if (sender.needs_reconnect) { setErrorKind('reconnect'); setSendError(`Reconnect ${sender.gmail_address} to keep sending.`); return; }
        if (limitReached) { setErrorKind('limit'); setSendError(`You've used all ${usage?.limit} free emails this month.`); return; }
        if (problems.length) { setSendError(problems[0]); return; }

        sendLock.current = true;
        try {
            let attachments: { filename: string; mimeType: string; dataBase64: string }[] = [];
            if (selectedDocIds.length) {
                setPhase('preparing');
                setProgress(`Creating PDF 1 of ${selectedDocIds.length}…`);
                const built = await buildDocumentAttachments(selectedDocIds, {
                    profile: profile as UserProfile,
                    jobs,
                    onProgress: (done, total) => setProgress(done < total ? `Creating PDF ${done + 1} of ${total}…` : 'PDFs ready'),
                });
                attachments = built.map(({ filename, mimeType, dataBase64 }) => ({ filename, mimeType, dataBase64 }));
                const size = attachments.reduce((n, a) => n + estimateBase64Bytes(a.dataBase64), 0);
                if (size > EMAIL_ATTACHMENT_LIMIT_BYTES) {
                    throw new GmailError(`The attachments are ${(size / 1048576).toFixed(1)} MB; Gmail allows about 18 MB. Remove a document and try again.`, 'ATTACHMENTS_TOO_LARGE');
                }
            }
            setPhase('sending');
            setProgress(`Sending from ${sender.gmail_address}…`);
            const res = await sendEmail({
                accountId: sender.id,
                to: toList,
                cc: ccList.length ? ccList : undefined,
                subject: subject.trim(),
                text: plainBody,
                html: composeHtml(),
                fromName: senderIdentity(profile).displayName || undefined,
                attachments,
                log: emailLogLinksForDocs(selectedDocs, client?.id ?? null),
            });
            setSentInfo({ to: toList, from: res.from || sender.gmail_address, attachments: attachments.length });
            setPhase('sent');
            onEmailSent?.();
            loadAccounts();
        } catch (e) {
            setPhase('idle');
            const code = e instanceof GmailError ? e.code : '';
            if (isPlanLimitGmailError(e)) {
                setErrorKind('limit');
                setSendError((e as Error).message.replace(/^PLAN_LIMIT:\s*/, ''));
            } else if (code === 'RECONNECT_REQUIRED' || code === 'SCOPE_MISSING') {
                setErrorKind('reconnect');
                setSendError((e as Error).message);
                loadAccounts();
            } else if (code === 'NO_ACCOUNT' || code === 'ACCOUNT_NOT_FOUND') {
                setErrorKind('connect');
                setSendError((e as Error).message);
                loadAccounts();
            } else {
                setSendError((e as Error).message || 'The email could not be sent.');
            }
        } finally {
            sendLock.current = false;
            setProgress('');
        }
    };

    const resetCompose = () => {
        setPhase('idle');
        setSentInfo(null);
        setSubject('');
        setEditorHtml('');
        subjectDirty.current = false;
        bodyDirty.current = false;
        setSelectedDocIds([]);
        setExtraDocs([]);
        setCc('');
        setShowCc(false);
        setSendError(null);
        setErrorKind(null);
        setPrefillNotice(null);
        setTo(client?.email || '');
    };

    const handleCopy = async () => {
        const ok = await copyToClipboard(`Subject: ${subject}\n\n${plainBody}`);
        if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
        else setSendError('Copy is blocked by your browser. Select the text and copy it manually.');
    };

    const busy = phase === 'preparing' || phase === 'sending';

    /* ------------------------------------------------------------ render */
    const connectButton = (
        <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => connectGmail()} disabled={connecting}>
            {connecting ? <Spinner label="Opening Google…" /> : <><GoogleIcon className="h-4 w-4" /> Connect Gmail</>}
        </button>
    );
    // One "Connect Gmail" only: the intro card has it when it is shown, the header otherwise (e.g. after a load error).
    const showConnectCard = accounts !== null && accounts.length === 0 && !accountsError;
    const accountPill = accounts === null ? (
        <div className="skeleton h-10 w-44 rounded-full" />
    ) : accounts.length === 0 ? (
        showConnectCard ? null : connectButton
    ) : (
        <div className="relative">
            <button
                type="button"
                className="btn btn-outline min-h-[44px] max-w-[260px] rounded-full"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
            >
                <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', sender?.needs_reconnect ? 'bg-warning' : 'bg-success')} aria-hidden="true" />
                <GoogleIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{sender?.gmail_address}</span>
                <ChevronDownIcon className={cx('h-4 w-4 shrink-0 transition-transform', accountMenuOpen && 'rotate-180')} />
            </button>
            {accountMenuOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} aria-hidden="true" />
                    <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift animate-zoom-in" role="menu">
                        <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send from</p>
                        <ul className="max-h-72 overflow-y-auto py-1">
                            {accounts.map((a) => (
                                <li key={a.id} className={cx('px-2 py-1', a.id === sender?.id && 'bg-primary/5')}>
                                    <div className="flex items-center gap-2">
                                        <button type="button" role="menuitemradio" aria-checked={a.id === sender?.id} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left hover:bg-muted" onClick={() => chooseSender(a)}>
                                            <span className={cx('h-2 w-2 shrink-0 rounded-full', a.needs_reconnect ? 'bg-warning' : 'bg-success')} />
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium">{a.gmail_address}</span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {a.needs_reconnect ? 'Needs reconnect' : a.is_default ? 'Default sender' : 'Connected'}
                                                </span>
                                            </span>
                                        </button>
                                        {a.needs_reconnect ? (
                                            <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => connectGmail(a.gmail_address)}>Reconnect</button>
                                        ) : !a.is_default && (
                                            <button type="button" className="btn btn-sm btn-ghost min-h-[40px]" onClick={() => makeDefault(a)} disabled={accountBusy === a.id} title="Make default">
                                                {accountBusy === a.id ? <Spinner /> : <StarIcon className="h-4 w-4" />}
                                                <span className="sr-only">Make default</span>
                                            </button>
                                        )}
                                        <button type="button" className="btn btn-sm btn-ghost min-h-[40px] text-destructive" onClick={() => { setToDisconnect(a); setAccountMenuOpen(false); }} title="Disconnect">
                                            <TrashIcon className="h-4 w-4" /><span className="sr-only">Disconnect {a.gmail_address}</span>
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="border-t border-border p-2">
                            <button type="button" className="btn btn-ghost min-h-[44px] w-full justify-start" onClick={() => connectGmail()} disabled={connecting}>
                                <PlusIcon className="h-4 w-4" /> Add another Gmail account
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div className="page pb-28">
            <PageHeader
                onBack={onBack}
                title="Communication"
                subtitle="Email documents and messages to clients from your own Gmail."
                badge={!paid && usage && usage.limit !== null ? (
                    <span className={cx('badge', remaining === 0 ? 'badge-danger' : 'badge-primary')}>{usage.emails_this_month}/{usage.limit} emails this month</span>
                ) : undefined}
                actions={<><HelpButton topic="messages" />{accountPill}</>}
            />

            <div className="space-y-3">
                {accountsError && <Notice tone="danger" onClose={() => setAccountsError(null)} action={<button type="button" className="btn btn-sm btn-outline min-h-[40px]" onClick={loadAccounts}><RefreshCwIcon className="h-4 w-4" /> Retry</button>}>{accountsError}</Notice>}
                {sender?.needs_reconnect && (
                    <Notice tone="warning" title={`Reconnect ${sender.gmail_address}`} action={<button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => connectGmail(sender.gmail_address)} disabled={connecting}><GoogleIcon className="h-4 w-4" /> Reconnect</button>}>
                        Google access for this account expired or was removed, so emails can't be sent from it until you reconnect.
                    </Notice>
                )}
                {limitReached && (
                    <Notice tone="warning" title="Monthly email limit reached" action={onUpgrade && <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={onUpgrade}>Upgrade</button>}>
                        The free plan includes {usage?.limit} emails per month. Premium sends without limits.
                    </Notice>
                )}
                {prefillNotice && <Notice tone="info" onClose={() => setPrefillNotice(null)}>{prefillNotice}</Notice>}
            </div>

            {showConnectCard && (
                <div className="card mt-4 flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">Send from your own Gmail address</p>
                        <p className="mt-1 text-sm text-muted-foreground">Clients see your name and email, and replies land in your inbox.</p>
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ShieldCheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
                            Send-only permission: ContractorDocs can't read your inbox. Disconnect any time.
                        </p>
                    </div>
                    <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">{connectButton}</div>
                </div>
            )}

            {phase === 'sent' && sentInfo ? (
                <div className="card mx-auto mt-6 max-w-xl p-6 text-center sm:p-10 animate-fade-in-up">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success"><CheckCircleIcon className="h-8 w-8" /></div>
                    <h2 className="text-xl font-bold text-foreground">Email sent</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Sent to <span className="font-medium text-foreground">{sentInfo.to.join(', ')}</span> from {sentInfo.from}
                        {sentInfo.attachments ? ` with ${sentInfo.attachments} PDF${sentInfo.attachments === 1 ? '' : 's'}` : ''}. You'll find it in your Gmail "Sent" folder.
                    </p>
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                        <button type="button" className="btn btn-outline min-h-[44px]" onClick={onBack}>Done</button>
                        <button type="button" className="btn btn-primary min-h-[44px]" onClick={resetCompose}><SendIcon className="h-4 w-4" /> Send another email</button>
                    </div>
                </div>
            ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
                    {/* Recipient + attachments */}
                    <section className="card card-pad space-y-5 lg:col-span-2" aria-labelledby="recipient-heading">
                        <h2 id="recipient-heading" className="text-base font-semibold text-foreground">Recipient</h2>

                        <div>
                            <span className="label">Client</span>
                            {client ? (
                                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                                    <Avatar name={client.name} className="h-10 w-10" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">{client.email || 'No email saved'}</p>
                                    </div>
                                    <button type="button" className="btn btn-ghost btn-sm min-h-[40px]" onClick={() => setClientPickerOpen(true)} disabled={busy}>Change</button>
                                    <button type="button" className="btn btn-ghost h-10 w-10 p-0" onClick={() => selectClient(null)} aria-label="Remove client" disabled={busy}><XCircleIcon className="h-4 w-4" /></button>
                                </div>
                            ) : (
                                <button type="button" className="btn btn-outline min-h-[44px] w-full justify-start text-muted-foreground" onClick={() => setClientPickerOpen(true)} disabled={busy}>
                                    <UsersIcon className="h-4 w-4" /> Choose a client (optional)
                                </button>
                            )}
                        </div>

                        <div>
                            <label className="label" htmlFor="comm-to">To</label>
                            <input
                                id="comm-to"
                                type="email"
                                inputMode="email"
                                multiple
                                autoComplete="email"
                                className={cx('input', invalidTo.length > 0 && 'border-destructive')}
                                placeholder="client@example.com"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                disabled={busy}
                            />
                            {invalidTo.length > 0 ? (
                                <p className="mt-1 text-xs text-destructive">Check: {invalidTo.join(', ')}</p>
                            ) : (
                                <p className="mt-1 text-xs text-muted-foreground">Separate several addresses with commas.</p>
                            )}
                            {!showCc ? (
                                <button type="button" className="mt-1 text-xs font-medium text-primary hover:underline" onClick={() => setShowCc(true)}>Add Cc</button>
                            ) : (
                                <div className="mt-3">
                                    <label className="label" htmlFor="comm-cc">Cc</label>
                                    <input id="comm-cc" type="email" inputMode="email" multiple className={cx('input', invalidCc.length > 0 && 'border-destructive')} value={cc} onChange={(e) => setCc(e.target.value)} disabled={busy} />
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="label mb-0">Attach documents</span>
                                {selectedDocIds.length > 0 && <span className="badge badge-primary"><PaperclipIcon className="h-3 w-3" /> {selectedDocIds.length}</span>}
                            </div>
                            {!client && extraDocs.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Choose a client to attach their invoices, estimates and reports as PDFs.</p>
                            ) : docsLoading && allDocs.length === 0 ? (
                                <div className="space-y-2" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}</div>
                            ) : docsError ? (
                                <Notice tone="danger" action={client && <button type="button" className="btn btn-sm btn-outline min-h-[40px]" onClick={() => loadClientDocs(client)}>Retry</button>}>{docsError}</Notice>
                            ) : allDocs.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No documents for this client yet.</p>
                            ) : (
                                <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                                    {allDocs.map((d) => {
                                        const checked = selectedDocIds.includes(d.id);
                                        const total = Array.isArray(d.data.lineItems) && d.data.lineItems.length ? computeDocumentTotals(d.data as any).total : null;
                                        return (
                                            <li key={d.id}>
                                                <label className={cx('flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition', checked ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50')}>
                                                    <Toggle checked={checked} onChange={() => toggleDoc(d.id)} label={`Attach ${documentLabel(d.type, d.data)}`} disabled={busy} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium text-foreground">{documentLabel(d.type, d.data)}</span>
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {d.type} · {new Date(d.createdAt).toLocaleDateString()}{total !== null ? ` · ${formatMoney(total)}` : ''}
                                                        </span>
                                                    </span>
                                                    {d.data.status && <StatusBadge status={d.data.status} />}
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </section>

                    {/* Message */}
                    <section className="card card-pad space-y-5 lg:col-span-3" aria-labelledby="message-heading">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 id="message-heading" className="text-base font-semibold text-foreground">Message</h2>
                            <div className="flex flex-wrap gap-2">
                                {selectedDocs.length > 0 && (
                                    <button type="button" className="btn btn-ghost btn-sm min-h-[40px]" onClick={useSuggested} disabled={busy}>Use suggested text</button>
                                )}
                                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => setShowTemplates(true)} disabled={busy}>
                                    <PaletteIcon className="h-4 w-4" /> {template ? 'Change design' : 'Email design'}
                                </button>
                            </div>
                        </div>

                        {template && (
                            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                                <CheckCircleIcon className="h-4 w-4 text-success" />
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{template.name}</span>
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    Accent
                                    <input type="color" value={safeColor(primaryColor)} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded-lg border border-border bg-transparent" aria-label="Accent color" />
                                    <input type="color" value={safeColor(secondaryColor, '#1e40af')} onChange={(e) => setSecondaryColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded-lg border border-border bg-transparent" aria-label="Second color" />
                                </label>
                                <button type="button" className="btn btn-ghost btn-sm min-h-[40px]" onClick={() => setShowPreview(true)}><EyeIcon className="h-4 w-4" /> Preview</button>
                                <button type="button" className="btn btn-ghost btn-sm min-h-[40px]" onClick={() => setTemplate(null)}>Remove</button>
                            </div>
                        )}

                        <div>
                            <label className="label" htmlFor="comm-subject">Subject</label>
                            <input
                                id="comm-subject"
                                className="input"
                                maxLength={300}
                                placeholder="e.g. Invoice 1042 from Acme Builders"
                                value={subject}
                                onChange={(e) => { subjectDirty.current = true; setSubject(e.target.value); }}
                                disabled={busy}
                            />
                        </div>

                        <div>
                            <span className="label" id="comm-body-label">Message</span>
                            <RichTextEditor
                                ref={editorRef}
                                mode="email"
                                value={bodyHtml}
                                onChange={onEditorChange}
                                disabled={busy}
                                minHeight={220}
                                ariaLabel="Message"
                                placeholder="Write your message… Type / for headings, lists and tables."
                            />
                        </div>

                        <div>
                            <span className="label">Insert</span>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { kind: 'client', label: 'Client name', show: !!client },
                                    { kind: 'job', label: 'Job name', show: selectedDocs.length > 0 },
                                    { kind: 'number', label: 'Document number', show: selectedDocs.some((d) => d.data.number) },
                                    { kind: 'total', label: 'Total', show: !!totalFor(selectedDocs) },
                                    { kind: 'company', label: 'My company', show: !!(profile?.companyName || profile?.name) },
                                    { kind: 'name', label: 'My name', show: !!profile?.name },
                                    { kind: 'portal', label: 'Client portal link', show: !!client },
                                    { kind: 'approval', label: 'Approval link', show: selectedDocs.some((d) => APPROVABLE.has(d.type) && !d.data.clientSignedAt && !isExpired(d.data.expiryDate)) },
                                ].filter((c) => c.show).map((c) => (
                                    <button key={c.kind} type="button" className="btn btn-secondary btn-sm min-h-[40px] rounded-full" onMouseDown={(e) => e.preventDefault()} onClick={() => insertInfo(c.kind)} disabled={busy || inserting !== null}>
                                        {inserting === c.kind ? <Spinner /> : <PlusIcon className="h-3.5 w-3.5" />} {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {sendError && (
                            <Notice
                                tone={errorKind === 'limit' ? 'warning' : 'danger'}
                                onClose={() => { setSendError(null); setErrorKind(null); }}
                                action={
                                    errorKind === 'reconnect' && sender ? <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => connectGmail(sender.gmail_address)}><GoogleIcon className="h-4 w-4" /> Reconnect</button>
                                        : errorKind === 'connect' ? <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => connectGmail()}><GoogleIcon className="h-4 w-4" /> Connect Gmail</button>
                                            : errorKind === 'limit' && onUpgrade ? <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={onUpgrade}>Upgrade</button>
                                                : undefined
                                }
                            >
                                {sendError}
                            </Notice>
                        )}

                        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <button type="button" className="btn btn-ghost min-h-[44px]" onClick={handleCopy} disabled={busy || (!subject && !plainBody)}>
                                <CopyIcon className="h-4 w-4" /> {copied ? 'Copied' : 'Copy text'}
                            </button>
                            <div className="flex flex-col gap-1 sm:items-end">
                                <button
                                    type="button"
                                    className="btn btn-primary btn-lg min-h-[48px] w-full sm:w-auto"
                                    onClick={handleSend}
                                    disabled={busy || accounts === null}
                                    aria-describedby="send-hint"
                                >
                                    {busy ? <Spinner label={progress || 'Sending…'} /> : <><SendIcon className="h-4 w-4" /> Send{selectedDocIds.length ? ` with ${selectedDocIds.length} PDF${selectedDocIds.length === 1 ? '' : 's'}` : ''}</>}
                                </button>
                                <p id="send-hint" className="text-xs text-muted-foreground">
                                    {sender ? `From ${sender.gmail_address}` : accounts?.length === 0 ? 'Connect Gmail to send' : ''}
                                    {!busy && problems.length > 0 && (toList.length || subject) ? ` · ${problems[0]}` : ''}
                                </p>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {/* Client picker */}
            <Modal open={clientPickerOpen} onClose={() => setClientPickerOpen(false)} title="Choose a client" size="md">
                <div className="relative mb-3">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input className="input pl-9" placeholder="Search name, email or phone" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} data-autofocus aria-label="Search clients" />
                </div>
                {clientSearching && clientResults.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground"><Spinner label="Searching…" /></div>
                ) : clientResults.length === 0 ? (
                    <EmptyState icon={<UsersIcon className="h-6 w-6" />} title="No clients found" description={clientQuery ? 'Try another name or email, or type the address in the To field.' : 'Add clients on the Clients page.'} className="py-8" />
                ) : (
                    <ul className="-mx-2 max-h-[55vh] overflow-y-auto">
                        {clientResults.map((c) => (
                            <li key={c.id}>
                                <button type="button" className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-muted" onClick={() => selectClient(c)}>
                                    <Avatar name={c.name} className="h-9 w-9" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                                        <span className={cx('block truncate text-xs', c.email ? 'text-muted-foreground' : 'text-warning')}>{c.email || 'No email saved'}</span>
                                    </span>
                                    {client?.id === c.id && <CheckCircleIcon className="h-4 w-4 text-primary" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {clientSearching && clientResults.length > 0 && <p className="mt-2 text-center text-xs text-muted-foreground">Updating results…</p>}
            </Modal>

            {showTemplates && (
                <EmailTemplateSelector
                    onSelect={(t) => { setTemplate(t); setShowTemplates(false); }}
                    onClose={() => setShowTemplates(false)}
                    selectedTemplateId={template?.id}
                    logoUrl={/^https:\/\//i.test(profile?.logoUrl || '') ? profile?.logoUrl : undefined}
                    companyName={profile?.companyName}
                    userName={profile?.name}
                    primaryColor={safeColor(primaryColor)}
                    secondaryColor={safeColor(secondaryColor, '#1e40af')}
                />
            )}

            <Modal open={showPreview} onClose={() => setShowPreview(false)} title="Email preview" description={subject ? `Subject: ${subject}` : undefined} size="xl">
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                    <iframe title="Email preview" sandbox="" srcDoc={showPreview ? composeHtml() : ''} className="h-[65vh] w-full border-0" />
                </div>
            </Modal>

            <ConfirmDialog
                open={!!toDisconnect}
                title="Disconnect Gmail account?"
                message={<>ContractorDocs will stop sending from <strong className="text-foreground">{toDisconnect?.gmail_address}</strong> and Google access will be revoked. You can connect it again any time.</>}
                confirmLabel="Disconnect"
                destructive
                busy={!!toDisconnect && accountBusy === toDisconnect.id}
                error={disconnectError}
                onConfirm={confirmDisconnect}
                onCancel={() => { setToDisconnect(null); setDisconnectError(null); }}
            />
        </div>
    );
};

export default CommunicationView;
