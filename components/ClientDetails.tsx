/**
 * Client details page + shared client UI (form modal, request-approval modal, action menu)
 * used by ClientsView. Self-sufficient: loads its own linked jobs/documents (client_id with
 * name fallback for legacy rows, COMM-011) through utils/clientLinks.ts.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.ts';
import { offlineEntityQueueFor } from '../lib/offline/offlineEntities.ts';
import { computeDocumentTotals, formatMoney, toNumber } from '../utils/money.ts';
import { portalShareMessage } from '../lib/messaging.ts';
import { MessageAppButtons } from './MessageAppButtons.tsx';
import {
    approvalUrl,
    copyToClipboard,
    documentLabel,
    ensureApprovalToken,
    ensurePortalKey,
    fetchClientDocuments,
    fetchClientJobs,
    isExpired,
    portalUrl,
    regenerateApprovalToken,
    regeneratePortalKey,
    type ClientDocSummary,
    type ClientJobSummary,
} from '../utils/clientLinks.ts';
import { TEMP_TAG, computeDocState, isLegacyDocument, isTemporaryNotes, isUnpaidInvoice, stripTempTag, withTempTag } from '../utils/clientPortalRules.ts';
import { Client, FormType, type FormData as FormDataType, type Job, type UserProfile } from '../types.ts';
import {
    Avatar,
    ConfirmDialog,
    EmptyState,
    Modal,
    Notice,
    PageHeader,
    SkeletonRows,
    Spinner,
    StatusBadge,
    cx,
    getErrorMessage,
    isPlanLimitError,
} from './commsKit.tsx';
import {
    BriefcaseIcon,
    CalendarIcon,
    ChangeOrderIcon,
    CheckCircleIcon,
    CheckIcon,
    CopyIcon,
    EditIcon,
    EstimateIcon,
    FileTextIcon,
    GlobeIcon,
    InvoiceIcon,
    MailIcon,
    MapPinIcon,
    MoreVerticalIcon,
    PenIcon,
    PlusIcon,
    RefreshCwIcon,
    SendIcon,
    SmartphoneIcon,
    TrashIcon,
    DailyReportIcon,
    WorkOrderIcon,
    WarrantyIcon,
    ReceiptIcon,
    TruckIcon,
    NoteIcon,
} from './Icons.tsx';

/* =====================================================================
   Shared types & helpers (also imported by ClientsView)
   ===================================================================== */

/** What CommunicationView reads from `prefillData`. */
export interface CommunicationPrefill {
    clientId?: string;
    clientName?: string;
    clientEmail?: string;
    documentIds?: string[];
    subject?: string;
    body?: string;
}

export const CLIENT_COLUMNS = 'id, user_id, name, email, phone, address, notes, portal_key, created_at';
/** Temporary clients: `[TEMPORARY]` in the notes, exactly like the original app (utils/clientPortalRules.ts). */
export { TEMP_TAG, stripTempTag };
export const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export interface ClientDraft {
    name: string;
    email: string;
    phone: string;
    address: string;
    notes: string;
}

export const EMPTY_DRAFT: ClientDraft = { name: '', email: '', phone: '', address: '', notes: '' };

export const isTemporaryClient = (c: Pick<Client, 'notes'> | null | undefined) => isTemporaryNotes(c?.notes);

/** Makes a client temporary or regular (only the `[TEMPORARY]` marker in the notes changes). */
export async function setClientTemporary(client: Pick<Client, 'id' | 'notes'>, temporary: boolean): Promise<Client> {
    const { data, error } = await supabase
        .from('clients')
        .update({ notes: withTempTag(client.notes, temporary) })
        .eq('id', client.id)
        .select(CLIENT_COLUMNS)
        .single();
    if (error) throw new Error(error.message || 'Could not update the client.');
    return data as Client;
}
export const firstName = (name?: string | null) => String(name || '').trim().split(/\s+/)[0] || 'there';

export const draftFromClient = (c: Partial<Client> | null | undefined): ClientDraft => ({
    name: c?.name || '',
    email: c?.email || '',
    phone: c?.phone || '',
    address: c?.address || '',
    notes: c?.notes || '',
});

const cleanDraft = (d: ClientDraft): ClientDraft => ({
    name: d.name.trim().replace(/\s+/g, ' '),
    email: d.email.trim(),
    phone: d.phone.trim(),
    address: d.address.trim(),
    notes: d.notes.trim(),
});

/**
 * Phone numbers: digits, spaces, + (at the start), -, ( ), . and an optional extension ("ext 12", "ext. 12",
 * "x12", "#12"), with 6 to 15 digits before the extension. Returns the error message, or null when valid/empty.
 */
const PHONE_RE = /^\+?[\d\s().-]+?(?:\s*(?:ext\.?|extension|x|#)\s*\d{1,6})?$/i;
export function phoneError(phone: string): string | null {
    const value = String(phone || '').trim();
    if (!value) return null;
    const main = value.replace(/\s*(?:ext\.?|extension|x|#)\s*\d{1,6}$/i, '');
    const digits = main.replace(/\D/g, '').length;
    if (!PHONE_RE.test(value) || digits < 6 || digits > 15) {
        return digits > 0 && digits < 6 && PHONE_RE.test(value)
            ? 'This phone number is too short, e.g. (555) 123-4567.'
            : 'Use only digits, spaces, + - ( ) . and "ext", e.g. (555) 123-4567.';
    }
    return null;
}

export function validateClientDraft(d: ClientDraft): Partial<Record<keyof ClientDraft, string>> {
    const errors: Partial<Record<keyof ClientDraft, string>> = {};
    if (!d.name.trim()) errors.name = 'Name is required.';
    else if (d.name.trim().length > 200) errors.name = 'Name is too long (200 characters max).';
    if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) errors.email = 'Enter a valid email address.';
    const phone = phoneError(d.phone);
    if (phone) errors.phone = phone;
    return errors;
}

/** Inserts a client and returns the saved row. Keeps the DB message (so `PLAN_LIMIT:` is detectable). */
export async function insertClient(draft: ClientDraft, userId: string): Promise<Client> {
    const row = { id: crypto.randomUUID(), user_id: userId, ...cleanDraft(draft) };
    // offline: kept on this device and added to the account when the connection is back (lib/offline)
    const outbox = offlineEntityQueueFor();
    if (outbox) {
        await outbox.queue('client', 'create', row.id, row);
        return { ...row, created_at: new Date().toISOString() } as Client;
    }
    const { data, error } = await supabase.from('clients').insert(row).select(CLIENT_COLUMNS).single();
    if (error) throw new Error(error.message || 'Could not save the client.');
    return data as Client;
}

/** Updates only the editable columns. */
export async function updateClient(id: string, draft: ClientDraft): Promise<Client> {
    const outbox = offlineEntityQueueFor(id);
    if (outbox) {
        const patch = cleanDraft(draft);
        await outbox.queue('client', 'edit', id, { ...patch });
        return { id, user_id: '', ...patch } as Client;
    }
    const { data, error } = await supabase
        .from('clients')
        .update(cleanDraft(draft))
        .eq('id', id)
        .select(CLIENT_COLUMNS)
        .single();
    if (error) throw new Error(error.message || 'Could not update the client.');
    return data as Client;
}

export async function deleteClients(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { error } = await supabase.from('clients').delete().in('id', ids);
    if (error) throw new Error(error.message || 'Could not delete.');
}

/** Resolves the currently signed-in user id (prop first, then the stored session). */
export function useUserId(session?: { user?: { id?: string } } | null): string | null {
    const [uid, setUid] = useState<string | null>(session?.user?.id || null);
    useEffect(() => {
        if (session?.user?.id) { setUid(session.user.id); return; }
        let alive = true;
        supabase.auth.getSession().then(({ data }) => {
            if (alive) setUid(data.session?.user?.id || null);
        }).catch(() => { /* stays null; actions show a sign-in message */ });
        return () => { alive = false; };
    }, [session?.user?.id]);
    return uid;
}

/** Returns a function that opens the Communication page with a prefill. */
export function useCommunicationNavigator(onNavigateToCommunication?: (prefill: CommunicationPrefill) => void) {
    const navigate = useNavigate();
    return useCallback((prefill: CommunicationPrefill) => {
        if (onNavigateToCommunication) onNavigateToCommunication(prefill);
        else navigate('/communication', { state: { prefillData: prefill } });
    }, [navigate, onNavigateToCommunication]);
}

/** Parses 'YYYY-MM-DD' as a local date (no UTC shift); other ISO strings normally. */
export const parseDate = (value?: string | null): Date | null => {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (value?: string | null, withTime = false): string => {
    const d = parseDate(value);
    if (!d) return '';
    return withTime
        ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const MONEY_TYPES = new Set<string>([FormType.Invoice, FormType.Estimate, FormType.ChangeOrder]);

export const docTotal = (doc: ClientDocSummary): number => {
    if (Array.isArray(doc.data.lineItems) && doc.data.lineItems.length) {
        return computeDocumentTotals(doc.data as any).total;
    }
    return toNumber(doc.data.amount);
};

export const DocTypeIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
    const map: Record<string, any> = {
        [FormType.Invoice]: InvoiceIcon,
        [FormType.Estimate]: EstimateIcon,
        [FormType.ChangeOrder]: ChangeOrderIcon,
        [FormType.DailyJobReport]: DailyReportIcon,
        [FormType.WorkOrder]: WorkOrderIcon,
        [FormType.Warranty]: WarrantyIcon,
        [FormType.Receipt]: ReceiptIcon,
        [FormType.PurchaseOrder]: TruckIcon,
        [FormType.Note]: NoteIcon,
    };
    const Icon = map[type] || FileTextIcon;
    return <Icon className={className} />;
};

/**
 * Signed / declined / expired / open, with the client portal's rules (lightweight data): Approved counts as signed,
 * and estimates made before the upgrade stay signable after their "valid until" date, like in the original app.
 */
export const approvalState = (doc: ClientDocSummary): 'signed' | 'declined' | 'expired' | 'open' => {
    const state = computeDocState(doc.type, doc.data, doc.createdAt);
    return state === 'readonly' ? 'open' : state;
};

/* =====================================================================
   ActionMenu: small accessible kebab menu (touch friendly)
   ===================================================================== */

export interface ActionMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    destructive?: boolean;
    disabled?: boolean;
}

export const ActionMenu: React.FC<{
    items: ActionMenuItem[];
    label?: string;
    trigger?: React.ReactNode;
    triggerClassName?: string;
    align?: 'left' | 'right';
}> = ({ items, label = 'More actions', trigger, triggerClassName, align = 'right' }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('touchstart', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('touchstart', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className={triggerClassName || 'btn btn-ghost h-10 w-10 shrink-0 rounded-full p-0 text-muted-foreground'}
            >
                {trigger || <MoreVerticalIcon className="h-5 w-5" />}
            </button>
            {open && (
                <div
                    role="menu"
                    className={cx(
                        'absolute top-full z-40 mt-1 w-56 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lift animate-fade-in',
                        align === 'right' ? 'right-0' : 'left-0',
                    )}
                >
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            onClick={() => { setOpen(false); item.onClick(); }}
                            className={cx(
                                'flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors disabled:opacity-50',
                                item.destructive ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-muted',
                            )}
                        >
                            {item.icon && <span className="flex h-4 w-4 items-center justify-center">{item.icon}</span>}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/* =====================================================================
   ClientFormModal: add & edit (COMM-021, COMM-022)
   ===================================================================== */

export const ClientFormModal: React.FC<{
    open: boolean;
    mode: 'add' | 'edit';
    initial?: Partial<ClientDraft>;
    clientId?: string;
    userId: string | null;
    onClose: () => void;
    onSaved: (client: Client, mode: 'add' | 'edit') => void;
    onUpgrade?: () => void;
    /** Error to show when the modal opens (e.g. an AI auto-insert that hit the plan limit). */
    initialError?: string | null;
}> = ({ open, mode, initial, clientId, userId, onClose, onSaved, onUpgrade, initialError }) => {
    const [draft, setDraft] = useState<ClientDraft>(EMPTY_DRAFT);
    const [temporary, setTemporary] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof ClientDraft, string>>>({});
    const [busy, setBusy] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [planLimit, setPlanLimit] = useState(false);

    useEffect(() => {
        if (!open) return;
        const base = { ...EMPTY_DRAFT, ...(initial || {}) } as ClientDraft;
        setTemporary(String(base.notes || '').includes(TEMP_TAG));
        setDraft({ ...base, notes: stripTempTag(base.notes) });
        setErrors({});
        setBusy(false);
        setPlanLimit(!!initialError && isPlanLimitError(initialError));
        setSubmitError(initialError ? getErrorMessage(initialError) : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const set = (key: keyof ClientDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = e.target.value;
        setDraft((d) => ({ ...d, [key]: value }));
        if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
    };

    const submit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (busy) return;
        const finalDraft: ClientDraft = {
            ...draft,
            notes: temporary ? `${TEMP_TAG} ${stripTempTag(draft.notes)}`.trim() : stripTempTag(draft.notes),
        };
        const v = validateClientDraft(finalDraft);
        setErrors(v);
        if (Object.keys(v).length) return;
        if (mode === 'add' && !userId) { setSubmitError('You are signed out. Please sign in again.'); return; }
        setBusy(true);
        setSubmitError(null);
        setPlanLimit(false);
        try {
            const saved = mode === 'edit' && clientId
                ? await updateClient(clientId, finalDraft)
                : await insertClient(finalDraft, userId as string);
            onSaved(saved, mode);
        } catch (err) {
            if (isPlanLimitError(err)) setPlanLimit(true);
            setSubmitError(getErrorMessage(err, 'Could not save the client. Please try again.'));
        } finally {
            setBusy(false);
        }
    };

    const field = (key: keyof ClientDraft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <div>
            <label className="label" htmlFor={`client-${key}`}>{label}</label>
            <input
                id={`client-${key}`}
                className={cx('input min-h-[44px]', errors[key] && 'border-destructive focus:border-destructive focus:ring-destructive/15')}
                value={draft[key]}
                onChange={set(key)}
                aria-invalid={!!errors[key]}
                aria-describedby={errors[key] ? `client-${key}-err` : undefined}
                {...props}
            />
            {errors[key] && <p id={`client-${key}-err`} className="mt-1 text-xs font-medium text-destructive">{errors[key]}</p>}
        </div>
    );

    return (
        <Modal
            open={open}
            onClose={onClose}
            locked={busy}
            title={mode === 'edit' ? 'Edit client' : 'Add client'}
            description={mode === 'edit' ? 'Changes apply to new documents. Existing documents keep their printed details.' : 'Save a client to reuse their details on estimates, invoices and emails.'}
            footer={
                <>
                    <button type="button" className="btn btn-outline min-h-[44px]" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="submit" form="client-form" className="btn btn-primary min-h-[44px]" disabled={busy}>
                        {busy ? <Spinner label="Saving…" /> : mode === 'edit' ? 'Save changes' : 'Add client'}
                    </button>
                </>
            }
        >
            <form id="client-form" onSubmit={submit} className="space-y-4" noValidate>
                {submitError && (
                    <Notice
                        tone={planLimit ? 'warning' : 'danger'}
                        title={planLimit ? 'Free plan limit reached' : 'Could not save'}
                        action={planLimit && onUpgrade ? (
                            <button type="button" className="btn btn-primary btn-sm min-h-[36px]" onClick={onUpgrade}>Upgrade</button>
                        ) : undefined}
                    >
                        {submitError}
                    </Notice>
                )}
                {field('name', 'Name *', { placeholder: 'Full name or company', autoComplete: 'off', 'data-autofocus': true } as any)}
                <div className="grid gap-4 sm:grid-cols-2">
                    {field('email', 'Email', { type: 'email', inputMode: 'email', placeholder: 'client@example.com', autoComplete: 'off' })}
                    {field('phone', 'Phone', {
                        type: 'tel',
                        inputMode: 'tel',
                        placeholder: '(555) 123-4567',
                        autoComplete: 'off',
                        onBlur: () => { const msg = phoneError(draft.phone); if (msg) setErrors((er) => ({ ...er, phone: msg })); },
                    })}
                </div>
                {field('address', 'Address', { placeholder: 'Street, city, state, ZIP', autoComplete: 'off' })}
                <div>
                    <label className="label" htmlFor="client-notes">Notes</label>
                    <textarea
                        id="client-notes"
                        className="input min-h-[88px] resize-y"
                        value={draft.notes}
                        onChange={set('notes')}
                        placeholder="Gate code, preferred contact time, anything useful…"
                        rows={3}
                    />
                </div>
                <label className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                    <input
                        type="checkbox"
                        className="h-5 w-5 accent-[hsl(var(--primary))]"
                        checked={temporary}
                        onChange={(e) => setTemporary(e.target.checked)}
                    />
                    <span>
                        <span className="font-medium text-foreground">Mark as temporary client</span>
                        <span className="block text-xs text-muted-foreground">Walk-ins and one-off jobs. Kept under “Temporary” on the Clients page; you can convert them to regular later.</span>
                    </span>
                </label>
            </form>
        </Modal>
    );
};

/**
 * "Ask again" on a declined estimate / change order: saves it with the status Sent (the rest of the document, the
 * decline included, unchanged). The database then reopens it: decline cleared, and the same link and the portal
 * accept a new answer (20261113000600). Returns false when the database kept it declined.
 */
export async function reopenDeclinedDocument(documentId: string): Promise<boolean> {
    const { data: row, error } = await supabase.from('documents').select('data').eq('id', documentId).single();
    if (error) throw new Error(`Could not load the document: ${error.message}`);
    const data = ((row as { data?: Record<string, unknown> } | null)?.data || {}) as Record<string, unknown>;
    if (data.__lightweight) throw new Error('Could not load the document. Please try again.');
    const { data: saved, error: saveError } = await supabase
        .from('documents')
        .update({ data: { ...data, status: 'Sent' } })
        .eq('id', documentId)
        .select('status:data->>status, clientDeclinedAt:data->>clientDeclinedAt')
        .single();
    if (saveError) throw new Error(saveError.message || 'Could not reopen the document.');
    const s = saved as { status?: string | null; clientDeclinedAt?: string | null } | null;
    return String(s?.status || '') === 'Sent' && !s?.clientDeclinedAt;
}

/* =====================================================================
   RequestApprovalModal = "Get approval" (old ClientsView "Get Approval Link"): every estimate and change order of
   the client, newest first, any status, with Copy link on each (COMM-012 link UI, COMM-021)
   ===================================================================== */

export const RequestApprovalModal: React.FC<{
    open: boolean;
    client: Client | null;
    onClose: () => void;
    onEmail: (prefill: CommunicationPrefill) => void;
    onNavigateToNewDoc?: (type: FormType, clientId: string) => void;
}> = ({ open, client, onClose, onEmail, onNavigateToNewDoc }) => {
    const [docs, setDocs] = useState<ClientDocSummary[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [manualLink, setManualLink] = useState<{ id: string; url: string } | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [confirmRegen, setConfirmRegen] = useState<ClientDocSummary | null>(null);
    const [regenBusy, setRegenBusy] = useState(false);
    const [regenError, setRegenError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!client) return;
        setDocs(null);
        setLoadError(null);
        try {
            const jobs = await fetchClientJobs(client);
            const list = await fetchClientDocuments(client, {
                jobIds: jobs.map((j) => j.id),
                types: [FormType.Estimate, FormType.ChangeOrder],
            });
            setDocs(list);
        } catch (err) {
            setLoadError(getErrorMessage(err, 'Could not load documents.'));
            setDocs([]);
        }
    }, [client]);

    useEffect(() => {
        if (open && client) {
            setActionError(null);
            setInfo(null);
            setManualLink(null);
            setCopiedId(null);
            load();
        }
    }, [open, client, load]);

    const linkFor = async (doc: ClientDocSummary): Promise<string> => {
        // Always ask the server: a token whose link expired, or that the client used before the document was reopened, is reissued.
        const token = await ensureApprovalToken(doc.id);
        if (token !== doc.publicToken) {
            setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, publicToken: token } : d)) ?? prev);
        }
        return approvalUrl(token);
    };

    const copyLink = async (doc: ClientDocSummary) => {
        setBusyId(doc.id);
        setActionError(null);
        setInfo(null);
        try {
            const url = await linkFor(doc);
            const ok = await copyToClipboard(url);
            if (ok) {
                setCopiedId(doc.id);
                setManualLink(null);
                window.setTimeout(() => setCopiedId((cur) => (cur === doc.id ? null : cur)), 2500);
            } else {
                setManualLink({ id: doc.id, url });
            }
        } catch (err) {
            setActionError(getErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const emailLink = async (doc: ClientDocSummary) => {
        if (!client) return;
        setBusyId(doc.id);
        setActionError(null);
        try {
            const url = await linkFor(doc);
            const label = documentLabel(doc.type, doc.data);
            const toSign = approvalState(doc) === 'open';
            onEmail({
                clientId: client.id,
                clientName: client.name,
                clientEmail: client.email || undefined,
                documentIds: [doc.id],
                subject: toSign ? `Please review and approve ${label}` : label,
                body: toSign
                    ? `Hi ${firstName(client.name)},\n\nPlease review and approve ${label} here:\n${url}\n\nThank you!`
                    : `Hi ${firstName(client.name)},\n\nHere is ${label}:\n${url}\n\nThank you!`,
            });
        } catch (err) {
            setActionError(getErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const askAgain = async (doc: ClientDocSummary) => {
        setBusyId(doc.id);
        setActionError(null);
        setInfo(null);
        try {
            const reopened = await reopenDeclinedDocument(doc.id);
            if (!reopened) {
                setActionError(`${documentLabel(doc.type, doc.data)} is still marked declined. Open it, set its status to Sent and save, or make a new version.`);
                return;
            }
            setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, data: { ...d.data, status: 'Sent', clientDeclinedAt: undefined } } : d)) ?? prev);
            setInfo(`${documentLabel(doc.type, doc.data)} is open again. Copy or email the link: the client can sign it or decline it again.`);
        } catch (err) {
            setActionError(getErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const doRegenerate = async () => {
        if (!confirmRegen) return;
        setRegenBusy(true);
        setRegenError(null);
        try {
            const token = await regenerateApprovalToken(confirmRegen.id);
            setDocs((prev) => prev?.map((d) => (d.id === confirmRegen.id ? { ...d, publicToken: token } : d)) ?? prev);
            setInfo(`New link created for ${documentLabel(confirmRegen.type, confirmRegen.data)}. The old link no longer works.`);
            setManualLink(null);
            setConfirmRegen(null);
        } catch (err) {
            setRegenError(getErrorMessage(err));
        } finally {
            setRegenBusy(false);
        }
    };

    const newDocButtons = onNavigateToNewDoc && client ? (
        <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn btn-primary min-h-[40px]" onClick={() => { onClose(); onNavigateToNewDoc(FormType.Estimate, client.id); }}>
                <PlusIcon className="h-4 w-4" /> New estimate
            </button>
            <button type="button" className="btn btn-outline min-h-[40px]" onClick={() => { onClose(); onNavigateToNewDoc(FormType.ChangeOrder, client.id); }}>
                <PlusIcon className="h-4 w-4" /> New change order
            </button>
        </div>
    ) : undefined;

    return (
        <>
            <Modal
                open={open && !!client}
                onClose={onClose}
                size="lg"
                title="Get approval link"
                description={client ? <>Pick an estimate or change order and send {client.name} its secure link to review and sign it. No login needed.</> : undefined}
                footer={<button type="button" className="btn btn-outline min-h-[40px]" onClick={onClose}>Close</button>}
            >
                <div className="space-y-3">
                    {actionError && <Notice tone="danger" onClose={() => setActionError(null)}>{actionError}</Notice>}
                    {info && <Notice tone="success" onClose={() => setInfo(null)}>{info}</Notice>}
                    {loadError && (
                        <Notice tone="danger" title="Could not load documents" action={<button type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={load}>Retry</button>}>
                            {loadError}
                        </Notice>
                    )}
                    {docs === null ? (
                        <SkeletonRows rows={3} />
                    ) : docs.length === 0 && !loadError ? (
                        <EmptyState
                            icon={<EstimateIcon className="h-6 w-6" />}
                            title="No estimates or change orders yet"
                            description="Create one for this client, then come back here to send it for approval."
                            action={newDocButtons}
                        />
                    ) : (
                        <ul className="space-y-3">
                            {docs.map((doc) => {
                                const state = approvalState(doc);
                                const label = documentLabel(doc.type, doc.data);
                                const total = docTotal(doc);
                                return (
                                    <li key={doc.id} className="rounded-xl border border-border bg-card p-3 sm:p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                                <DocTypeIcon type={doc.type} className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="truncate font-semibold text-foreground">{label}</p>
                                                    <StatusBadge status={state === 'expired' ? 'Expired' : state === 'declined' ? 'Declined' : state === 'signed' ? 'Signed' : (doc.data.status || 'Draft')} />
                                                </div>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {doc.data.title && doc.data.title !== label ? `${doc.data.title} · ` : ''}
                                                    {fmtDate(doc.createdAt)}
                                                    {total > 0 ? ` · ${formatMoney(total)}` : ''}
                                                </p>
                                                {state === 'signed' && (
                                                    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-success">
                                                        <CheckCircleIcon className="h-3.5 w-3.5" />
                                                        Signed by {doc.data.clientSignerName || client?.name || 'the client'}{doc.data.clientSignedAt ? ` on ${fmtDate(doc.data.clientSignedAt, true)}` : ''}
                                                    </p>
                                                )}
                                                {state === 'declined' && (
                                                    <p className="mt-1 text-xs font-medium text-destructive">
                                                        Declined{doc.data.clientDeclinedAt ? ` on ${fmtDate(doc.data.clientDeclinedAt, true)}` : ''}. Change it if needed, then “Ask again” (or set its status back to Sent) so the client can answer again.
                                                    </p>
                                                )}
                                                {state === 'expired' && (
                                                    <p className="mt-1 text-xs font-medium text-warning">
                                                        Valid until {fmtDate(doc.data.expiryDate)}: the client can view it but not sign it. Move the “valid until” date on the estimate to let them sign.
                                                    </p>
                                                )}
                                                {state === 'open' && isExpired(doc.data.expiryDate) && isLegacyDocument(doc.createdAt) && (
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        Valid-until date passed ({fmtDate(doc.data.expiryDate)}); made before the upgrade, so the client can still sign it, as before.
                                                    </p>
                                                )}
                                                {state === 'open' && String(doc.data.status || '') === 'Draft' && (
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        Draft: the link works, but the client portal shows it only once its status is Sent.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {/* Copy link on every row, like the original "Get Approval Link" (signed / declined / expired
                                            ones open read-only for the client) */}
                                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <button
                                                type="button"
                                                className={cx('btn min-h-[40px]', copiedId === doc.id ? 'btn-secondary text-success' : 'btn-outline')}
                                                onClick={() => copyLink(doc)}
                                                disabled={busyId === doc.id}
                                            >
                                                {copiedId === doc.id ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                                {copiedId === doc.id ? 'Link copied' : state === 'open' ? 'Copy link' : 'Copy view link'}
                                            </button>
                                            {state === 'declined' ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-primary min-h-[40px]"
                                                    onClick={() => askAgain(doc)}
                                                    disabled={busyId === doc.id}
                                                >
                                                    {busyId === doc.id ? <Spinner /> : <RefreshCwIcon className="h-4 w-4" />} Ask again
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={cx('btn min-h-[40px]', state === 'open' ? 'btn-primary' : 'btn-outline')}
                                                    onClick={() => emailLink(doc)}
                                                    disabled={busyId === doc.id}
                                                >
                                                    <SendIcon className="h-4 w-4" /> Email link
                                                </button>
                                            )}
                                            {state === 'open' && (
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost min-h-[40px]"
                                                    onClick={() => { setRegenError(null); setConfirmRegen(doc); }}
                                                    disabled={busyId === doc.id}
                                                >
                                                    <RefreshCwIcon className="h-4 w-4" /> New link
                                                </button>
                                            )}
                                        </div>
                                        {manualLink?.id === doc.id && (
                                            <div className="mt-3">
                                                <label className="label" htmlFor={`manual-link-${doc.id}`}>Copy this link</label>
                                                <input
                                                    id={`manual-link-${doc.id}`}
                                                    readOnly
                                                    className="input font-mono text-xs"
                                                    value={manualLink.url}
                                                    onFocus={(e) => e.currentTarget.select()}
                                                />
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {docs && docs.length > 0 && newDocButtons && (
                        <div className="border-t border-border pt-3">{newDocButtons}</div>
                    )}
                </div>
            </Modal>
            <ConfirmDialog
                open={!!confirmRegen}
                title="Create a new approval link?"
                message={<p>The link you shared before for <strong className="text-foreground">{confirmRegen ? documentLabel(confirmRegen.type, confirmRegen.data) : ''}</strong> will stop working. Use this if a link was sent to the wrong person.</p>}
                confirmLabel="Create new link"
                busy={regenBusy}
                error={regenError}
                onConfirm={doRegenerate}
                onCancel={() => setConfirmRegen(null)}
            />
        </>
    );
};

/* =====================================================================
   ClientDetails page
   ===================================================================== */

interface ClientDetailsProps {
    client: Client;
    onBack: () => void;
    userProfile?: UserProfile | null;
    userId?: string | null;
    onClientUpdated?: (client: Client) => void;
    onClientDeleted?: (clientId: string) => void;
    onNavigateToJob?: (jobId: string) => void;
    onNavigateToDoc?: (formId: string, jobId: string, type: FormType) => void;
    onNavigateToNewDoc?: (type: FormType, clientId: string) => void;
    onNavigateToCommunication?: (prefill: CommunicationPrefill) => void;
    onUpgradeClick?: () => void;
    /** @deprecated ignored: the page loads linked jobs/documents itself (client_id with name fallback). */
    jobs?: Job[];
    /** @deprecated ignored. */
    docs?: FormDataType[];
}

type Tab = 'overview' | 'jobs' | 'documents';

const ClientDetails: React.FC<ClientDetailsProps> = ({
    client: clientProp,
    onBack,
    userProfile,
    userId: userIdProp,
    onClientUpdated,
    onClientDeleted,
    onNavigateToJob,
    onNavigateToDoc,
    onNavigateToNewDoc,
    onNavigateToCommunication,
    onUpgradeClick,
}) => {
    const [client, setClient] = useState<Client>(clientProp);
    useEffect(() => { setClient(clientProp); }, [clientProp]);

    const sessionUserId = useUserId(null);
    const userId = userIdProp || sessionUserId;
    const goToCommunication = useCommunicationNavigator(onNavigateToCommunication);

    const [tab, setTab] = useState<Tab>('overview');
    const [jobs, setJobs] = useState<ClientJobSummary[] | null>(null);
    const [docs, setDocs] = useState<ClientDocSummary[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [showEdit, setShowEdit] = useState(false);
    const [showApproval, setShowApproval] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [portalBusy, setPortalBusy] = useState(false);
    const [portalCopied, setPortalCopied] = useState(false);
    const [portalError, setPortalError] = useState<string | null>(null);
    const [portalInfo, setPortalInfo] = useState<string | null>(null);
    const [confirmPortalRegen, setConfirmPortalRegen] = useState(false);
    const [portalRegenError, setPortalRegenError] = useState<string | null>(null);

    const [editingNotes, setEditingNotes] = useState(false);
    const [notesDraft, setNotesDraft] = useState('');
    const [notesBusy, setNotesBusy] = useState(false);
    const [notesError, setNotesError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoadError(null);
        setJobs(null);
        setDocs(null);
        try {
            const j = await fetchClientJobs(client);
            setJobs(j);
            const d = await fetchClientDocuments(client, { jobIds: j.map((x) => x.id) });
            setDocs(d);
        } catch (err) {
            setLoadError(getErrorMessage(err, 'Could not load this client’s jobs and documents.'));
            setJobs((prev) => prev ?? []);
            setDocs((prev) => prev ?? []);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.id, client.name]);

    useEffect(() => { load(); }, [load]);

    const applyClientUpdate = (updated: Client) => {
        setClient(updated);
        onClientUpdated?.(updated);
    };

    /* ---------- stats ---------- */
    const stats = useMemo(() => {
        const invoices = (docs || []).filter((d) => d.type === FormType.Invoice);
        const billable = invoices.filter((d) => !['Draft', 'Cancelled'].includes(String(d.data.status || 'Draft')));
        const invoiced = billable.reduce((s, d) => s + docTotal(d), 0);
        // same rule as the client portal's "Outstanding balance": every invoice not Paid / Cancelled (drafts excluded)
        const outstanding = invoices
            .filter((d) => isUnpaidInvoice(d.data))
            .reduce((s, d) => s + docTotal(d), 0);
        const openJobs = (jobs || []).filter((j) => j.status === 'active' || j.status === 'paused').length;
        return { invoiced, outstanding, openJobs, documents: (docs || []).length };
    }, [docs, jobs]);

    const timeline = useMemo(() => {
        const items: Array<{ kind: 'job'; date: string; job: ClientJobSummary } | { kind: 'doc'; date: string; doc: ClientDocSummary }> = [];
        (jobs || []).forEach((job) => items.push({ kind: 'job', date: job.createdAt || job.startDate || '', job }));
        (docs || []).forEach((doc) => items.push({
            kind: 'doc',
            date: doc.data.clientSignedAt || doc.data.clientDeclinedAt || doc.createdAt,
            doc,
        }));
        return items
            .filter((i) => parseDate(i.date))
            .sort((a, b) => (parseDate(b.date)!.getTime() - parseDate(a.date)!.getTime()))
            .slice(0, 6);
    }, [jobs, docs]);

    /* ---------- portal link ---------- */
    const copyPortal = async () => {
        setPortalBusy(true);
        setPortalError(null);
        setPortalInfo(null);
        try {
            const hadKey = !!client.portal_key;
            const key = await ensurePortalKey(client);
            if (!hadKey) applyClientUpdate({ ...client, portal_key: key });
            const ok = await copyToClipboard(portalUrl(key));
            if (ok) {
                setPortalCopied(true);
                window.setTimeout(() => setPortalCopied(false), 2500);
            } else {
                setPortalInfo('Copying is blocked by your browser. Select the link above and copy it manually.');
            }
        } catch (err) {
            setPortalError(getErrorMessage(err));
        } finally {
            setPortalBusy(false);
        }
    };

    const createPortal = async () => {
        setPortalBusy(true);
        setPortalError(null);
        try {
            const key = await ensurePortalKey(client);
            applyClientUpdate({ ...client, portal_key: key });
        } catch (err) {
            setPortalError(getErrorMessage(err));
        } finally {
            setPortalBusy(false);
        }
    };

    const regeneratePortal = async () => {
        setPortalBusy(true);
        setPortalRegenError(null);
        try {
            const key = await regeneratePortalKey(client.id);
            applyClientUpdate({ ...client, portal_key: key });
            setConfirmPortalRegen(false);
            setPortalInfo('New portal link created. The old link no longer works.');
        } catch (err) {
            setPortalRegenError(getErrorMessage(err));
        } finally {
            setPortalBusy(false);
        }
    };

    const company = userProfile?.companyName?.trim() || '';

    const emailPortal = async () => {
        setPortalError(null);
        try {
            const hadKey = !!client.portal_key;
            const key = await ensurePortalKey(client);
            if (!hadKey) applyClientUpdate({ ...client, portal_key: key });
            goToCommunication({
                clientId: client.id,
                clientName: client.name,
                clientEmail: client.email || undefined,
                subject: `Your documents from ${company || 'your contractor'}`,
                body: `Hi ${firstName(client.name)},\n\nYou can view, download and sign your documents${company ? ` from ${company}` : ''} anytime here:\n${portalUrl(key)}\n\nThank you!`,
            });
        } catch (err) {
            setPortalError(getErrorMessage(err));
        }
    };

    const emailClient = () => goToCommunication({ clientId: client.id, clientName: client.name, clientEmail: client.email || undefined });

    /* ---------- temporary → regular (old "Convert to Regular") ---------- */
    const [convertBusy, setConvertBusy] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);
    const convertToRegular = async () => {
        setConvertBusy(true);
        setConvertError(null);
        try {
            applyClientUpdate(await setClientTemporary(client, false));
        } catch (err) {
            setConvertError(getErrorMessage(err, 'Could not convert this client.'));
        } finally {
            setConvertBusy(false);
        }
    };

    /* ---------- notes ---------- */
    const startNotes = () => {
        setNotesDraft(stripTempTag(client.notes));
        setNotesError(null);
        setEditingNotes(true);
    };
    const saveNotes = async () => {
        setNotesBusy(true);
        setNotesError(null);
        try {
            const text = notesDraft.trim();
            const notes = isTemporaryClient(client) ? `${TEMP_TAG} ${text}`.trim() : text;
            // offline (or a client still waiting to sync): the notes wait on this device and sync later
            const outbox = offlineEntityQueueFor(client.id);
            if (outbox) {
                await outbox.queue('client', 'edit', client.id, { notes });
                applyClientUpdate({ ...client, notes });
                setEditingNotes(false);
                return;
            }
            const { data, error } = await supabase.from('clients').update({ notes }).eq('id', client.id).select(CLIENT_COLUMNS).single();
            if (error) throw new Error(error.message);
            applyClientUpdate(data as Client);
            setEditingNotes(false);
        } catch (err) {
            setNotesError(getErrorMessage(err, 'Could not save notes.'));
        } finally {
            setNotesBusy(false);
        }
    };

    /* ---------- delete ---------- */
    const doDelete = async () => {
        setDeleteBusy(true);
        setDeleteError(null);
        try {
            await deleteClients([client.id]);
            setConfirmDelete(false);
            onClientDeleted?.(client.id);
            if (!onClientDeleted) onBack();
        } catch (err) {
            setDeleteError(getErrorMessage(err));
        } finally {
            setDeleteBusy(false);
        }
    };

    const openDoc = (doc: ClientDocSummary) => onNavigateToDoc?.(doc.id, doc.jobId, doc.type as FormType);
    const openJob = (job: ClientJobSummary) => onNavigateToJob?.(job.id);

    const temporary = isTemporaryClient(client);
    const notesText = stripTempTag(client.notes);

    /* ---------- render helpers ---------- */
    const docRow = (doc: ClientDocSummary) => {
        const label = documentLabel(doc.type, doc.data);
        const showMoney = MONEY_TYPES.has(doc.type);
        const total = showMoney ? docTotal(doc) : 0;
        const state = doc.type === FormType.Estimate || doc.type === FormType.ChangeOrder ? approvalState(doc) : null;
        const Wrapper: any = onNavigateToDoc ? 'button' : 'div';
        return (
            <li key={doc.id}>
                <Wrapper
                    {...(onNavigateToDoc ? { type: 'button', onClick: () => openDoc(doc) } : {})}
                    className={cx('flex w-full min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors', onNavigateToDoc && 'hover:border-primary/40 hover:bg-muted/40')}
                >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <DocTypeIcon type={doc.type} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {doc.data.title && doc.data.title !== label ? `${doc.data.title} · ` : ''}{fmtDate(doc.createdAt)}
                            {state === 'signed' && doc.data.clientSignedAt ? ` · Signed ${fmtDate(doc.data.clientSignedAt)}` : ''}
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                        {showMoney && total > 0 && <span className="text-sm font-semibold tabular-nums text-foreground">{formatMoney(total)}</span>}
                        <StatusBadge status={state === 'signed' ? 'Signed' : state === 'declined' ? 'Declined' : state === 'expired' ? 'Expired' : (doc.data.status || null) || (showMoney ? 'Draft' : doc.type)} />
                    </div>
                </Wrapper>
            </li>
        );
    };

    const jobRow = (job: ClientJobSummary) => {
        const Wrapper: any = onNavigateToJob ? 'button' : 'div';
        return (
            <li key={job.id}>
                <Wrapper
                    {...(onNavigateToJob ? { type: 'button', onClick: () => openJob(job) } : {})}
                    className={cx('flex w-full min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors', onNavigateToJob && 'hover:border-primary/40 hover:bg-muted/40')}
                >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <BriefcaseIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{job.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {job.startDate ? `Starts ${fmtDate(job.startDate)}` : fmtDate(job.createdAt)}
                            {job.endDate ? ` · Ends ${fmtDate(job.endDate)}` : ''}
                        </p>
                    </div>
                    <StatusBadge status={job.status === 'active' ? 'In progress' : job.status.charAt(0).toUpperCase() + job.status.slice(1)} />
                </Wrapper>
            </li>
        );
    };

    const loading = jobs === null || docs === null;

    const newDocActions = onNavigateToNewDoc ? (
        <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => onNavigateToNewDoc(FormType.Estimate, client.id)}>
                <PlusIcon className="h-4 w-4" /> New estimate
            </button>
            <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => onNavigateToNewDoc(FormType.Invoice, client.id)}>
                <PlusIcon className="h-4 w-4" /> New invoice
            </button>
        </div>
    ) : null;

    const tabs: Array<{ id: Tab; label: string; count?: number }> = [
        { id: 'overview', label: 'Overview' },
        { id: 'jobs', label: 'Jobs', count: jobs?.length },
        { id: 'documents', label: 'Documents', count: docs?.length },
    ];

    return (
        <div className="page animate-fade-in">
            <PageHeader
                onBack={onBack}
                title={client.name}
                badge={temporary ? <span className="badge badge-warning">Temporary</span> : undefined}
                subtitle={client.created_at ? `Client since ${fmtDate(client.created_at)}` : 'Client profile'}
                actions={
                    <>
                        {temporary && (
                            <button type="button" className="btn btn-outline min-h-[40px] border-warning/50 text-warning" onClick={convertToRegular} disabled={convertBusy}>
                                {convertBusy ? <Spinner /> : <CheckIcon className="h-4 w-4" />} Convert to regular
                            </button>
                        )}
                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={() => setShowEdit(true)}>
                            <EditIcon className="h-4 w-4" /> Edit
                        </button>
                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={() => setShowApproval(true)}>
                            <PenIcon className="h-4 w-4" /> Get approval
                        </button>
                        <button type="button" className="btn btn-primary min-h-[40px]" onClick={emailClient}>
                            <MailIcon className="h-4 w-4" /> Email client
                        </button>
                        <ActionMenu
                            label="More client actions"
                            items={[
                                { label: portalCopied ? 'Portal link copied' : 'Copy portal link', icon: <GlobeIcon className="h-4 w-4" />, onClick: copyPortal },
                                { label: 'Email portal link', icon: <SendIcon className="h-4 w-4" />, onClick: emailPortal },
                                { label: 'Delete client', icon: <TrashIcon className="h-4 w-4" />, onClick: () => { setDeleteError(null); setConfirmDelete(true); }, destructive: true },
                            ]}
                        />
                    </>
                }
            />

            {convertError && <Notice tone="danger" className="mb-4" onClose={() => setConvertError(null)}>{convertError}</Notice>}
            {loadError && (
                <Notice tone="danger" title="Some information could not be loaded" className="mb-4" action={<button type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={load}>Retry</button>}>
                    {loadError}
                </Notice>
            )}

            <div className="grid gap-6 lg:grid-cols-12">
                {/* Sidebar: contact, portal, notes */}
                <aside className="space-y-4 lg:col-span-4">
                    <section className="card card-pad">
                        <div className="flex items-center gap-3">
                            <Avatar name={client.name} className="h-12 w-12 text-base" />
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">{client.name}</p>
                                <p className="text-xs text-muted-foreground">Contact details</p>
                            </div>
                        </div>
                        <dl className="mt-4 space-y-1">
                            <ContactLine icon={<MailIcon className="h-4 w-4" />} label="Email" value={client.email} href={client.email ? `mailto:${client.email}` : undefined} />
                            <ContactLine icon={<SmartphoneIcon className="h-4 w-4" />} label="Phone" value={client.phone} href={client.phone ? `tel:${client.phone.replace(/[^\d+]/g, '')}` : undefined} />
                            <ContactLine
                                icon={<MapPinIcon className="h-4 w-4" />}
                                label="Address"
                                value={client.address}
                                href={client.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}` : undefined}
                                external
                            />
                        </dl>
                        <button type="button" className="btn btn-ghost btn-sm mt-2 min-h-[40px] w-full" onClick={() => setShowEdit(true)}>
                            <EditIcon className="h-4 w-4" /> Edit details
                        </button>
                    </section>

                    <section className="card card-pad">
                        <div className="flex items-center gap-2">
                            <GlobeIcon className="h-5 w-5 text-primary" />
                            <h2 className="font-semibold text-foreground">Client portal</h2>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">One private link where {firstName(client.name)} can view, download and sign documents.</p>
                        {portalError && <Notice tone="danger" className="mt-3" onClose={() => setPortalError(null)}>{portalError}</Notice>}
                        {portalInfo && <Notice tone="success" className="mt-3" onClose={() => setPortalInfo(null)}>{portalInfo}</Notice>}
                        {client.portal_key ? (
                            <>
                                <input
                                    readOnly
                                    aria-label="Portal link"
                                    className="input mt-3 truncate font-mono text-xs"
                                    value={portalUrl(client.portal_key)}
                                    onFocus={(e) => e.currentTarget.select()}
                                />
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button type="button" className={cx('btn min-h-[40px]', portalCopied ? 'btn-secondary text-success' : 'btn-outline')} onClick={copyPortal} disabled={portalBusy}>
                                        {portalCopied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                        {portalCopied ? 'Copied' : 'Copy'}
                                    </button>
                                    <a className="btn btn-outline min-h-[40px]" href={portalUrl(client.portal_key)} target="_blank" rel="noopener noreferrer">
                                        <GlobeIcon className="h-4 w-4" /> Open
                                    </a>
                                    <button type="button" className="btn btn-outline min-h-[40px]" onClick={emailPortal}>
                                        <SendIcon className="h-4 w-4" /> Email
                                    </button>
                                    <button type="button" className="btn btn-ghost min-h-[40px]" onClick={() => { setPortalRegenError(null); setConfirmPortalRegen(true); }} disabled={portalBusy}>
                                        <RefreshCwIcon className="h-4 w-4" /> New link
                                    </button>
                                </div>
                                {/* send it from your own phone: Messages / WhatsApp open with the link typed in */}
                                <MessageAppButtons
                                    className="mt-2 [&>a]:flex-1"
                                    phone={client.phone}
                                    message={portalShareMessage({ clientName: client.name, company, link: portalUrl(client.portal_key) })}
                                />
                            </>
                        ) : (
                            <button type="button" className="btn btn-primary mt-3 min-h-[40px] w-full" onClick={createPortal} disabled={portalBusy}>
                                {portalBusy ? <Spinner label="Creating…" /> : <><GlobeIcon className="h-4 w-4" /> Create portal link</>}
                            </button>
                        )}
                    </section>

                    <section className="card card-pad">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="font-semibold text-foreground">Notes</h2>
                            {!editingNotes && (
                                <button type="button" className="btn btn-ghost btn-sm min-h-[36px]" onClick={startNotes}>
                                    <EditIcon className="h-4 w-4" /> {notesText ? 'Edit' : 'Add'}
                                </button>
                            )}
                        </div>
                        {editingNotes ? (
                            <div className="mt-3 space-y-2">
                                <textarea
                                    className="input min-h-[120px] resize-y"
                                    value={notesDraft}
                                    onChange={(e) => setNotesDraft(e.target.value)}
                                    aria-label="Client notes"
                                    autoFocus
                                    placeholder="Private notes about this client. Never shown to the client."
                                />
                                {notesError && <Notice tone="danger">{notesError}</Notice>}
                                <div className="flex justify-end gap-2">
                                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => setEditingNotes(false)} disabled={notesBusy}>Cancel</button>
                                    <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={saveNotes} disabled={notesBusy}>
                                        {notesBusy ? <Spinner label="Saving…" /> : 'Save notes'}
                                    </button>
                                </div>
                            </div>
                        ) : notesText ? (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{notesText}</p>
                        ) : (
                            <p className="mt-2 text-sm text-muted-foreground">No notes yet. Notes are private and never shown to the client.</p>
                        )}
                    </section>
                </aside>

                {/* Main content */}
                <div className="min-w-0 space-y-4 lg:col-span-8">
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <StatTile label="Open jobs" value={loading ? null : String(stats.openJobs)} icon={<BriefcaseIcon className="h-5 w-5" />} />
                        <StatTile label="Documents" value={loading ? null : String(stats.documents)} icon={<FileTextIcon className="h-5 w-5" />} />
                        <StatTile label="Invoiced" value={loading ? null : formatMoney(stats.invoiced)} icon={<InvoiceIcon className="h-5 w-5" />} />
                        <StatTile label="Outstanding" value={loading ? null : formatMoney(stats.outstanding)} icon={<CalendarIcon className="h-5 w-5" />} tone={stats.outstanding > 0 ? 'warning' : undefined} />
                    </div>

                    <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist" aria-label="Client sections">
                        {tabs.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === t.id}
                                onClick={() => setTab(t.id)}
                                className={cx(
                                    'min-h-[40px] flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors',
                                    tab === t.id ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <SkeletonRows rows={4} />
                    ) : tab === 'overview' ? (
                        <section className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="font-semibold text-foreground">Recent activity</h2>
                                {newDocActions}
                            </div>
                            {timeline.length === 0 ? (
                                <EmptyState
                                    icon={<CalendarIcon className="h-6 w-6" />}
                                    title="No activity yet"
                                    description="Jobs and documents for this client will show up here."
                                    action={newDocActions || undefined}
                                />
                            ) : (
                                <ul className="space-y-2">
                                    {timeline.map((item) => item.kind === 'job' ? jobRow(item.job) : docRow(item.doc))}
                                </ul>
                            )}
                        </section>
                    ) : tab === 'jobs' ? (
                        <section>
                            {(jobs || []).length === 0 ? (
                                <EmptyState icon={<BriefcaseIcon className="h-6 w-6" />} title="No jobs for this client" description="Jobs linked to this client appear here." />
                            ) : (
                                <ul className="space-y-2">{(jobs || []).map(jobRow)}</ul>
                            )}
                        </section>
                    ) : (
                        <section className="space-y-3">
                            {newDocActions && <div className="flex justify-end">{newDocActions}</div>}
                            {(docs || []).length === 0 ? (
                                <EmptyState icon={<FileTextIcon className="h-6 w-6" />} title="No documents yet" description="Estimates, invoices and reports for this client appear here." />
                            ) : (
                                <ul className="space-y-2">{(docs || []).map(docRow)}</ul>
                            )}
                        </section>
                    )}
                </div>
            </div>

            <ClientFormModal
                open={showEdit}
                mode="edit"
                clientId={client.id}
                initial={draftFromClient(client)}
                userId={userId}
                onClose={() => setShowEdit(false)}
                onSaved={(saved) => {
                    setShowEdit(false);
                    applyClientUpdate(saved);
                    if (saved.name !== client.name) load();
                }}
                onUpgrade={onUpgradeClick}
            />
            <RequestApprovalModal
                open={showApproval}
                client={client}
                onClose={() => setShowApproval(false)}
                onEmail={(prefill) => { setShowApproval(false); goToCommunication(prefill); }}
                onNavigateToNewDoc={onNavigateToNewDoc}
            />
            <ConfirmDialog
                open={confirmPortalRegen}
                title="Create a new portal link?"
                message={<p>The current portal link stops working right away. Anyone you sent it to will need the new link.</p>}
                confirmLabel="Create new link"
                busy={portalBusy}
                error={portalRegenError}
                onConfirm={regeneratePortal}
                onCancel={() => setConfirmPortalRegen(false)}
            />
            <ConfirmDialog
                open={confirmDelete}
                title={`Delete ${client.name}?`}
                message={<p>The client's portal link stops working. Jobs and documents are kept.</p>}
                confirmLabel="Delete client"
                destructive
                busy={deleteBusy}
                error={deleteError}
                onConfirm={doDelete}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    );
};

const ContactLine: React.FC<{ icon: React.ReactNode; label: string; value?: string | null; href?: string; external?: boolean }> = ({ icon, label, value, href, external }) => (
    <div className="flex min-h-[40px] items-start gap-3 rounded-lg px-1 py-1.5">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0 flex-1">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="break-words text-sm text-foreground">
                {value ? (
                    href ? (
                        <a className="font-medium text-primary hover:underline" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{value}</a>
                    ) : value
                ) : <span className="text-muted-foreground">Not provided</span>}
            </dd>
        </div>
    </div>
);

const StatTile: React.FC<{ label: string; value: string | null; icon: React.ReactNode; tone?: 'warning' }> = ({ label, value, icon, tone }) => (
    <div className="card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="text-xs font-medium">{label}</span>
            <span className={cx(tone === 'warning' ? 'text-warning' : 'text-primary')}>{icon}</span>
        </div>
        {value === null ? (
            <div className="skeleton mt-2 h-6 w-16" />
        ) : (
            <p className="mt-1 truncate text-lg font-bold tabular-nums text-foreground sm:text-xl">{value}</p>
        )}
    </div>
);

export default ClientDetails;
