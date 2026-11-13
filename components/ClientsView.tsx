/**
 * Clients directory: server-side search & pagination, add/edit/delete (single + bulk),
 * CSV import/export, portal links, approval requests and client activity.
 * Self-sufficient: talks to Supabase directly with error handling (COMM-020/021/022) and
 * notifies App through `onClientsChanged` so its cached list can refresh.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { isPaidTier, normalizeTier } from '../lib/plans.ts';
import { Client, FormType, type FormData as FormDataType, type Job, type UserProfile } from '../types.ts';
import {
    copyToClipboard,
    documentLabel,
    ensurePortalKey,
    fetchClientDocuments,
    fetchClientJobs,
    isMissingFunctionError,
    pgrstQuote,
    portalUrl,
    type ClientDocSummary,
} from '../utils/clientLinks.ts';
import ClientDetails, {
    ActionMenu,
    CLIENT_COLUMNS,
    ClientFormModal,
    DocTypeIcon,
    EMAIL_RE,
    EMPTY_DRAFT,
    RequestApprovalModal,
    TEMP_TAG,
    deleteClients,
    draftFromClient,
    fmtDate,
    insertClient,
    isTemporaryClient,
    parseDate,
    setClientTemporary,
    stripTempTag,
    useCommunicationNavigator,
    useUserId,
    type ClientDraft,
    type CommunicationPrefill,
} from './ClientDetails.tsx';
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
import HelpButton from './help/HelpButton.tsx';
import {
    CheckIcon,
    ClockIcon,
    CopyIcon,
    DownloadIcon,
    EditIcon,
    FileTextIcon,
    GlobeIcon,
    MailIcon,
    MapPinIcon,
    PenIcon,
    PlusIcon,
    SearchIcon,
    SmartphoneIcon,
    TrashIcon,
    UploadImageIcon,
    UsersIcon,
    XCircleIcon,
} from './Icons.tsx';

export type { CommunicationPrefill } from './ClientDetails.tsx';

interface ClientsViewProps {
    onBack: () => void;
    /** @deprecated the shared client from lib/supabase.ts is used. */
    supabase?: any;
    session?: any;
    clients?: Client[];
    forms?: FormDataType[];
    /** @deprecated details load their own jobs. */
    jobs?: Job[];
    /** @deprecated ignored: the view saves itself (errors and plan limits are handled inline). */
    onAddClient?: (client: any) => Promise<any>;
    /** @deprecated ignored. */
    onDeleteClient?: (id: string) => Promise<void>;
    isOnline?: boolean;
    onNavigateToNewDoc?: (type: FormType, clientId: string) => void;
    onNavigateToJob?: (jobId: string) => void;
    onNavigateToDoc?: (formId: string, jobId: string, type: FormType) => void;
    userProfile?: UserProfile | null;
    onUpgradeClick?: () => void;
    freeLimit?: number;
    /** @deprecated ignored. */
    onUpdateClient?: (client: any) => Promise<void>;
    /** @deprecated ignored (the legacy App version overwrote documents, COMM-001). */
    onMarkDocumentsAsViewed?: (clientId: string) => Promise<void>;
    /** @deprecated ignored. */
    onLoadClientDocuments?: (clientName: string) => Promise<void>;
    /** @deprecated ignored: the list paginates itself. */
    onLoadMoreClients?: () => Promise<void>;
    /** @deprecated ignored. */
    hasMoreClients?: boolean;
    openCreateModal?: boolean;
    prefillData?: any;
    /** Called after any create / update / delete / import so App can refresh its cached clients. */
    onClientsChanged?: () => void;
    /** Called with the document ids that were marked as seen (so App can clear its badge). */
    onDocumentsViewed?: (documentIds: string[]) => void;
    /** Opens the Communication page; defaults to navigate('/communication', { state: { prefillData } }). */
    onNavigateToCommunication?: (prefill: CommunicationPrefill) => void;
}

const PAGE_SIZE = 50;
type Filter = 'all' | 'regular' | 'temporary';

const byName = (a: Client, b: Client) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** `%term%` with LIKE wildcards escaped, quoted for a PostgREST `or=(...)` filter. */
const ilikePattern = (term: string) => pgrstQuote(`%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);

const localMatch = (c: Client, term: string, filter: Filter) => {
    if (filter === 'temporary' && !isTemporaryClient(c)) return false;
    if (filter === 'regular' && isTemporaryClient(c)) return false;
    if (!term) return true;
    const t = term.toLowerCase();
    return [c.name, c.email, c.phone].some((v) => String(v || '').toLowerCase().includes(t));
};

/* ------------------------------------------------------------------ CSV helpers */

/** RFC 4180 parser (quotes, escaped quotes, CRLF/LF, BOM). Detects `,`, `;` or tab delimiters. */
export function parseCsv(input: string): string[][] {
    let text = input;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>;
    let q = false;
    for (const ch of firstLine) {
        if (ch === '"') q = !q;
        else if (!q && ch in counts) counts[ch] += 1;
    }
    const delim = counts[';'] > counts[','] && counts[';'] >= counts['\t'] ? ';' : counts['\t'] > counts[','] ? '\t' : ',';

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
            } else field += c;
            continue;
        }
        if (c === '"') { inQuotes = true; continue; }
        if (c === delim) { row.push(field); field = ''; continue; }
        if (c === '\r' || c === '\n') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = '';
            continue;
        }
        field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const csvCell = (value: unknown): string => {
    let s = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula-injection guard
    if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
};

const toCsv = (rows: unknown[][]) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

const downloadText = (filename: string, content: string, type = 'text/csv;charset=utf-8') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const todayYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const normHeader = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
const HEADER_ALIASES: Record<keyof ClientDraft, string[]> = {
    name: ['name', 'full name', 'fullname', 'client', 'client name', 'customer', 'customer name', 'company', 'company name', 'contact', 'contact name'],
    email: ['email', 'e mail', 'email address', 'e mail address', 'mail'],
    phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'cell', 'cell phone', 'tel', 'telephone'],
    address: ['address', 'street', 'street address', 'full address', 'location'],
    notes: ['notes', 'note', 'comments', 'comment', 'description'],
};

interface ImportRow {
    line: number;
    draft: ClientDraft;
    errors: string[];
    warnings: string[];
    include: boolean;
}

const MAX_IMPORT_ROWS = 5000;

/* ------------------------------------------------------------------ mark documents viewed (COMM-001) */

async function markDocumentsViewed(ids: string[]): Promise<boolean> {
    if (!ids.length) return true;
    const attempts: Array<Record<string, string[]>> = [{ p_document_ids: ids }, { p_doc_ids: ids }, { p_ids: ids }];
    for (const args of attempts) {
        const { error } = await supabase.rpc('mark_documents_viewed', args);
        if (!error) return true;
        if (!isMissingFunctionError(error)) return false;
    }
    return false;
}

/** Signed/declined documents of a client that the contractor hasn't seen (from App's lightweight forms). */
const unseenActivityFor = (client: Client, forms: FormDataType[], seen: Set<string>) =>
    forms.filter((f) => {
        if (seen.has(f.id)) return false;
        const row = f as any;
        const d = (f.data || {}) as any;
        const linkedId = row.client_id ?? row.clientId ?? d.clientId ?? null;
        const belongs = linkedId ? linkedId === client.id : d.clientName === client.name;
        if (!belongs) return false;
        const viewed = d.viewedByProvider === true || String(d.viewedByProvider).toLowerCase() === 'true';
        const acted = !!d.clientSignedAt || !!d.clientDeclinedAt || d.status === 'Accepted' || d.status === 'Rejected';
        return acted && !viewed;
    });

const activityDate = (doc: ClientDocSummary) => doc.data.clientSignedAt || doc.data.clientDeclinedAt || doc.createdAt;

/* ================================================================== component */

const ClientsView: React.FC<ClientsViewProps> = ({
    onBack,
    session,
    clients: propClients,
    forms = [],
    isOnline,
    onNavigateToNewDoc,
    onNavigateToJob,
    onNavigateToDoc,
    userProfile,
    onUpgradeClick,
    freeLimit = 15,
    openCreateModal,
    prefillData,
    onClientsChanged,
    onDocumentsViewed,
    onNavigateToCommunication,
}) => {
    const userId = useUserId(session);
    const goToCommunication = useCommunicationNavigator(onNavigateToCommunication);
    const isFree = !isPaidTier(normalizeTier(userProfile?.subscriptionTier));

    /* ---------- list state ---------- */
    const [items, setItems] = useState<Client[]>(() => [...(propClients || [])].sort(byName));
    const [hasMore, setHasMore] = useState(false);
    const [listLoading, setListLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [serverLoaded, setServerLoaded] = useState(false);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    /** Clients created this calendar month: the Free plan limit counts these (as the old app did). */
    const [monthCount, setMonthCount] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Regular clients by default: temporary ones (walk-ins) have their own "Temporary (N)" list, as in the original app
    const [filter, setFilter] = useState<Filter>('regular');
    const [tempCount, setTempCount] = useState<number | null>(null);
    const [showTemporary, setShowTemporary] = useState(false);
    const requestRef = useRef(0);

    /* ---------- UI state ---------- */
    const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'warning' | 'info'; text: string; upgrade?: boolean } | null>(null);
    const [detailsClient, setDetailsClient] = useState<Client | null>(null);
    const [form, setForm] = useState<{ mode: 'add' | 'edit'; initial: Partial<ClientDraft>; clientId?: string; error?: string | null } | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [approvalClient, setApprovalClient] = useState<Client | null>(null);
    const [activityClient, setActivityClient] = useState<Client | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [portalBusyId, setPortalBusyId] = useState<string | null>(null);
    const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => window.clearTimeout(t);
    }, [search]);

    // Before the first server response, keep showing App's cached clients.
    useEffect(() => {
        if (!serverLoaded && propClients) setItems([...propClients].sort(byName));
    }, [propClients, serverLoaded]);

    const buildQuery = useCallback((from: number, term: string, f: Filter) => {
        let q = supabase.from('clients').select(CLIENT_COLUMNS).order('name', { ascending: true }).order('id', { ascending: true });
        if (userId) q = q.eq('user_id', userId);
        if (term) {
            const pat = ilikePattern(term);
            q = q.or(`name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat}`);
        }
        if (f === 'temporary') q = q.ilike('notes', `%${TEMP_TAG}%`);
        if (f === 'regular') q = q.or(`notes.is.null,notes.not.ilike.${pgrstQuote(`%${TEMP_TAG}%`)}`);
        return q.range(from, from + PAGE_SIZE - 1);
    }, [userId]);

    const loadFirstPage = useCallback(async () => {
        if (!userId) return;
        const req = ++requestRef.current;
        setListLoading(true);
        setListError(null);
        const { data, error } = await buildQuery(0, debouncedSearch, filter);
        if (req !== requestRef.current) return;
        if (error) {
            setListError(getErrorMessage(error, 'Could not load clients.'));
        } else {
            setItems((data || []) as Client[]);
            setHasMore((data || []).length === PAGE_SIZE);
            setServerLoaded(true);
        }
        setListLoading(false);
    }, [userId, buildQuery, debouncedSearch, filter]);

    const loadCount = useCallback(async () => {
        if (!userId) return;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const [all, month, temp] = await Promise.all([
            supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', userId),
            supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', monthStart),
            supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', userId).ilike('notes', `%${TEMP_TAG}%`),
        ]);
        if (!all.error && typeof all.count === 'number') setTotalCount(all.count);
        if (!month.error && typeof month.count === 'number') setMonthCount(month.count);
        if (!temp.error && typeof temp.count === 'number') setTempCount(temp.count);
    }, [userId]);

    useEffect(() => { loadFirstPage(); }, [loadFirstPage]);
    useEffect(() => { loadCount(); }, [loadCount]);

    const loadMore = async () => {
        if (loadingMore) return;
        const req = requestRef.current;
        setLoadingMore(true);
        const { data, error } = await buildQuery(items.length, debouncedSearch, filter);
        if (req === requestRef.current) {
            if (error) setNotice({ tone: 'danger', text: getErrorMessage(error, 'Could not load more clients.') });
            else {
                setItems((prev) => {
                    const ids = new Set(prev.map((c) => c.id));
                    return [...prev, ...((data || []) as Client[]).filter((c) => !ids.has(c.id))];
                });
                setHasMore((data || []).length === PAGE_SIZE);
            }
        }
        setLoadingMore(false);
    };

    const visible = useMemo(
        () => (serverLoaded ? items : items.filter((c) => localMatch(c, debouncedSearch, filter))),
        [items, serverLoaded, debouncedSearch, filter],
    );

    const [tempReload, setTempReload] = useState(0);
    const changed = () => { loadCount(); onClientsChanged?.(); setTempReload((n) => n + 1); };

    const upsertLocal = (client: Client) => {
        // a client that no longer fits the list (e.g. made temporary while showing regular clients) leaves it
        const fits = localMatch(client, '', filter);
        setItems((prev) => {
            const rest = prev.filter((c) => c.id !== client.id);
            const exists = rest.length !== prev.length;
            if (!fits) return rest;
            const next = exists ? prev.map((c) => (c.id === client.id ? client : c)) : [...prev, client];
            return next.sort(byName);
        });
        setDetailsClient((cur) => (cur && cur.id === client.id ? client : cur));
    };

    /* ---------- AI prefill / open-create (processed once per payload) ---------- */
    const processedPrefillRef = useRef<string | null>(null);
    const openedCreateRef = useRef(false);

    useEffect(() => {
        if (prefillData) {
            if (!userId) return;
            const key = JSON.stringify(prefillData);
            if (processedPrefillRef.current === key) return;
            processedPrefillRef.current = key;
            // Clear router state so a page refresh does not replay the AI action (keeps react-router's keys).
            try {
                const st = window.history.state;
                if (st && typeof st === 'object') window.history.replaceState({ ...st, usr: null }, document.title);
            } catch { /* ignore */ }

            const toDraft = (d: any): ClientDraft => {
                const notes = String(d?.notes || '');
                const temp = !!(d?.isTemporary || d?.is_temporary);
                return {
                    name: String(d?.name || d?.clientName || '').trim(),
                    email: String(d?.email || '').trim(),
                    phone: String(d?.phone || '').trim(),
                    address: String(d?.address || '').trim(),
                    notes: temp && !notes.includes(TEMP_TAG) ? `${TEMP_TAG} ${notes}`.trim() : notes,
                };
            };

            const run = async () => {
                if (Array.isArray(prefillData)) {
                    let added = 0;
                    const failures: string[] = [];
                    for (const entry of prefillData) {
                        const draft = toDraft(entry);
                        if (!draft.name) continue;
                        if (draft.email && !EMAIL_RE.test(draft.email)) draft.email = '';
                        try {
                            upsertLocal(await insertClient(draft, userId));
                            added++;
                        } catch (err) {
                            if (isPlanLimitError(err)) {
                                setNotice({ tone: 'warning', text: `Added ${added} client${added === 1 ? '' : 's'}. ${getErrorMessage(err)}`, upgrade: true });
                                if (added) changed();
                                return;
                            }
                            failures.push(`${draft.name}: ${getErrorMessage(err)}`);
                        }
                    }
                    if (added) changed();
                    setNotice(failures.length
                        ? { tone: 'warning', text: `Added ${added} client${added === 1 ? '' : 's'}. Not added: ${failures.join('; ')}` }
                        : { tone: 'success', text: `Added ${added} client${added === 1 ? '' : 's'}.` });
                    return;
                }
                const draft = toDraft(prefillData);
                if (!draft.name) { setForm({ mode: 'add', initial: draft }); return; }
                if (prefillData.auto_submit) {
                    try {
                        if (draft.email && !EMAIL_RE.test(draft.email)) throw new Error('The email address looks invalid. Please check it.');
                        const saved = await insertClient(draft, userId);
                        upsertLocal(saved);
                        changed();
                        setNotice({ tone: 'success', text: `${saved.name} was added to your clients.` });
                    } catch (err) {
                        setForm({ mode: 'add', initial: draft, error: err instanceof Error ? err.message : String(err) });
                    }
                } else {
                    setForm({ mode: 'add', initial: draft });
                }
            };
            run();
        } else if (openCreateModal && !openedCreateRef.current) {
            openedCreateRef.current = true;
            setForm({ mode: 'add', initial: EMPTY_DRAFT });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillData, openCreateModal, userId]);

    /* ---------- selection & delete ---------- */
    const toggleSelected = (id: string) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));
    const toggleSelectAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((c) => c.id)));
    const exitSelection = () => { setSelectionMode(false); setSelected(new Set()); };

    const doDelete = async () => {
        if (!deleteIds?.length) return;
        setDeleteBusy(true);
        setDeleteError(null);
        try {
            await deleteClients(deleteIds);
            const gone = new Set(deleteIds);
            setItems((prev) => prev.filter((c) => !gone.has(c.id)));
            setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
            setNotice({ tone: 'success', text: deleteIds.length === 1 ? 'Client deleted.' : `${deleteIds.length} clients deleted.` });
            setDeleteIds(null);
            if (selectionMode) exitSelection();
            changed();
        } catch (err) {
            setDeleteError(getErrorMessage(err, 'Could not delete. Please try again.'));
        } finally {
            setDeleteBusy(false);
        }
    };

    /* ---------- per-client actions ---------- */
    const copyPortal = async (client: Client) => {
        setPortalBusyId(client.id);
        try {
            const hadKey = !!client.portal_key;
            const key = await ensurePortalKey(client);
            if (!hadKey) { upsertLocal({ ...client, portal_key: key }); onClientsChanged?.(); }
            const url = portalUrl(key);
            if (await copyToClipboard(url)) {
                setCopiedId(client.id);
                window.setTimeout(() => setCopiedId((cur) => (cur === client.id ? null : cur)), 2500);
            } else {
                setNotice({ tone: 'info', text: `Copy this portal link for ${client.name}: ${url}` });
            }
        } catch (err) {
            setNotice({ tone: 'danger', text: getErrorMessage(err) });
        } finally {
            setPortalBusyId(null);
        }
    };

    /** Old "Convert to Regular": removes the [TEMPORARY] marker; the client moves to the main list. */
    const convertToRegular = async (client: Client): Promise<Client | null> => {
        try {
            const saved = await setClientTemporary(client, false);
            upsertLocal(saved);
            setNotice({ tone: 'success', text: `${saved.name} is now a regular client.` });
            changed();
            return saved;
        } catch (err) {
            setNotice({ tone: 'danger', text: getErrorMessage(err) });
            return null;
        }
    };

    /* ---------- export ---------- */
    const exportCsv = async () => {
        if (!userId) return;
        setExporting(true);
        try {
            const all: Client[] = [];
            const STEP = 1000;
            for (let from = 0; ; from += STEP) {
                const { data, error } = await supabase
                    .from('clients')
                    .select(CLIENT_COLUMNS)
                    .eq('user_id', userId)
                    .order('name', { ascending: true })
                    .order('id', { ascending: true })
                    .range(from, from + STEP - 1);
                if (error) throw new Error(error.message);
                all.push(...((data || []) as Client[]));
                if (!data || data.length < STEP) break;
            }
            if (!all.length) { setNotice({ tone: 'info', text: 'There are no clients to export yet.' }); return; }
            const rows: unknown[][] = [['Name', 'Email', 'Phone', 'Address', 'Notes', 'Temporary', 'Client since']];
            all.forEach((c) => rows.push([
                c.name, c.email || '', c.phone || '', c.address || '', stripTempTag(c.notes),
                isTemporaryClient(c) ? 'yes' : 'no', c.created_at ? c.created_at.slice(0, 10) : '',
            ]));
            downloadText(`clients-${todayYmd()}.csv`, toCsv(rows));
            setNotice({ tone: 'success', text: `Exported ${all.length} client${all.length === 1 ? '' : 's'}.` });
        } catch (err) {
            setNotice({ tone: 'danger', text: `Export failed: ${getErrorMessage(err)}` });
        } finally {
            setExporting(false);
        }
    };

    /* ---------- details page ---------- */
    if (detailsClient) {
        return (
            <ClientDetails
                client={detailsClient}
                userProfile={userProfile}
                userId={userId}
                onBack={() => setDetailsClient(null)}
                onClientUpdated={(c) => { upsertLocal(c); changed(); }}
                onClientDeleted={(id) => {
                    setItems((prev) => prev.filter((c) => c.id !== id));
                    setDetailsClient(null);
                    setNotice({ tone: 'success', text: 'Client deleted.' });
                    changed();
                }}
                onNavigateToJob={onNavigateToJob}
                onNavigateToDoc={onNavigateToDoc}
                onNavigateToNewDoc={onNavigateToNewDoc}
                onNavigateToCommunication={onNavigateToCommunication}
                onUpgradeClick={onUpgradeClick}
            />
        );
    }

    const atLimit = isFree && monthCount !== null && monthCount >= freeLimit;
    const searching = !!debouncedSearch || filter === 'temporary';
    const tempLabel = `Temporary${tempCount !== null ? ` (${tempCount})` : ''}`;

    return (
        <div className="page animate-fade-in">
            <PageHeader
                onBack={onBack}
                title="Clients"
                badge={isFree && monthCount !== null ? (
                    <span className={cx('badge', atLimit ? 'badge-warning' : 'badge-muted')} title="New clients this month (Free plan limit)">
                        {monthCount}/{freeLimit} this month
                    </span>
                ) : undefined}
                subtitle={totalCount === null ? 'Your customers, their documents and portal links' : `${totalCount} client${totalCount === 1 ? '' : 's'} · portal links, approvals and history`}
                actions={
                    <>
                        <HelpButton topic="clients" />
                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={() => setShowHistory(true)}>
                            <ClockIcon className="h-4 w-4" /> <span>Activity</span>
                        </button>
                        {/* old "Temporary (N)": walk-ins and quick check-out clients, kept out of the main list */}
                        <button
                            type="button"
                            className="btn btn-outline min-h-[40px] border-warning/50 bg-warning/10 text-warning hover:bg-warning/15"
                            onClick={() => setShowTemporary(true)}
                            title="Temporary clients (walk-ins)"
                        >
                            <UsersIcon className="h-4 w-4" /> <span>{tempLabel}</span>
                        </button>
                        <ActionMenu
                            label="Import or export clients"
                            triggerClassName="btn btn-outline min-h-[40px]"
                            trigger={<><FileTextIcon className="h-4 w-4" /> <span>Import / export</span></>}
                            items={[
                                { label: 'Import from CSV', icon: <UploadImageIcon className="h-4 w-4" />, onClick: () => setShowImport(true) },
                                { label: exporting ? 'Exporting…' : 'Export all to CSV', icon: <DownloadIcon className="h-4 w-4" />, onClick: exportCsv, disabled: exporting },
                            ]}
                        />
                        <button type="button" className="btn btn-primary min-h-[40px]" onClick={() => setForm({ mode: 'add', initial: EMPTY_DRAFT })}>
                            <PlusIcon className="h-4 w-4" /> Add client
                        </button>
                    </>
                }
            />

            <div className="space-y-3">
                {isOnline === false && (
                    <Notice tone="warning" title="You're offline">Changes can't be saved until you're back online.</Notice>
                )}
                {atLimit && (
                    <Notice
                        tone="warning"
                        title={`You've added ${freeLimit} new clients this month, the Free plan limit`}
                        action={onUpgradeClick ? <button type="button" className="btn btn-primary btn-sm min-h-[36px]" onClick={onUpgradeClick}>Upgrade for unlimited clients</button> : undefined}
                    >
                        Existing clients keep working. You can add more next month, or upgrade for unlimited clients.
                    </Notice>
                )}
                {notice && (
                    <Notice
                        tone={notice.tone}
                        onClose={() => setNotice(null)}
                        action={notice.upgrade && onUpgradeClick ? <button type="button" className="btn btn-primary btn-sm min-h-[36px]" onClick={onUpgradeClick}>Upgrade</button> : undefined}
                    >
                        <span className="break-words">{notice.text}</span>
                    </Notice>
                )}
            </div>

            {/* Toolbar */}
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-sm">
                    <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        className="input min-h-[44px] pl-10 pr-10"
                        placeholder="Search name, email or phone"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search clients"
                    />
                    {listLoading && serverLoaded && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"><Spinner /></span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-xl bg-muted p-1" role="group" aria-label="Filter clients">
                        {(['regular', 'temporary', 'all'] as Filter[]).map((f) => (
                            <button
                                key={f}
                                type="button"
                                aria-pressed={filter === f}
                                onClick={() => setFilter(f)}
                                className={cx(
                                    'min-h-[36px] rounded-lg px-3 text-sm font-semibold transition-colors',
                                    filter === f ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {f === 'regular' ? 'Clients' : f === 'temporary' ? tempLabel : 'All'}
                            </button>
                        ))}
                    </div>
                    {!selectionMode ? (
                        <button type="button" className="btn btn-ghost min-h-[40px]" onClick={() => setSelectionMode(true)} disabled={!visible.length}>
                            <CheckIcon className="h-4 w-4" /> Select
                        </button>
                    ) : (
                        <button type="button" className="btn btn-ghost min-h-[40px]" onClick={exitSelection}>Done</button>
                    )}
                </div>
            </div>

            {selectionMode && (
                <div className="sticky top-2 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-2 shadow-card backdrop-blur">
                    <span className="px-2 text-sm font-semibold text-foreground">{selected.size} selected</span>
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={toggleSelectAll}>
                        {allVisibleSelected ? 'Clear selection' : `Select all ${visible.length}`}
                    </button>
                    <button
                        type="button"
                        className="btn btn-danger btn-sm ml-auto min-h-[40px]"
                        disabled={!selected.size}
                        onClick={() => { setDeleteError(null); setDeleteIds([...selected]); }}
                    >
                        <TrashIcon className="h-4 w-4" /> Delete
                    </button>
                </div>
            )}

            {/* List */}
            <div className="mt-4">
                {listError && (
                    <Notice tone="danger" title="Could not load clients" className="mb-3" action={<button type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={loadFirstPage}>Retry</button>}>
                        {listError}
                    </Notice>
                )}
                {listLoading && !serverLoaded && visible.length === 0 ? (
                    <SkeletonRows rows={5} />
                ) : visible.length === 0 ? (
                    searching ? (
                        <EmptyState
                            icon={<SearchIcon className="h-6 w-6" />}
                            title={debouncedSearch
                                ? `No ${filter === 'temporary' ? 'temporary ' : filter === 'regular' ? 'regular ' : ''}clients match “${debouncedSearch}”`
                                : 'No temporary clients'}
                            description={debouncedSearch
                                ? (filter === 'all' ? 'Try another search.' : 'Try another search, or look in All.')
                                : 'Walk-ins you mark as temporary (on the client form, a new job or an inventory check-out) appear here.'}
                            action={<button type="button" className="btn btn-outline min-h-[40px]" onClick={() => { setSearch(''); setFilter(debouncedSearch ? 'all' : 'regular'); }}>{debouncedSearch ? 'Clear search' : 'Back to clients'}</button>}
                        />
                    ) : (
                        <EmptyState
                            icon={<UsersIcon className="h-6 w-6" />}
                            title={filter === 'regular' && tempCount ? 'No regular clients yet' : 'No clients yet'}
                            description={filter === 'regular' && tempCount
                                ? `You have ${tempCount} temporary client${tempCount === 1 ? '' : 's'}. Convert one to regular, or add a client.`
                                : 'Add your first client, or import a list from a spreadsheet.'}
                            action={
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button type="button" className="btn btn-primary min-h-[40px]" onClick={() => setForm({ mode: 'add', initial: EMPTY_DRAFT })}>
                                        <PlusIcon className="h-4 w-4" /> Add client
                                    </button>
                                    {filter === 'regular' && tempCount ? (
                                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={() => setShowTemporary(true)}>
                                            <UsersIcon className="h-4 w-4" /> {tempLabel}
                                        </button>
                                    ) : (
                                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={() => setShowImport(true)}>
                                            <UploadImageIcon className="h-4 w-4" /> Import CSV
                                        </button>
                                    )}
                                </div>
                            }
                        />
                    )
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {visible.map((client) => {
                            const unseen = unseenActivityFor(client, forms, seenIds);
                            const isSelected = selected.has(client.id);
                            const temp = isTemporaryClient(client);
                            return (
                                <li
                                    key={client.id}
                                    className={cx('card flex flex-col gap-3 p-4 transition-shadow hover:shadow-card', isSelected && 'ring-2 ring-primary')}
                                >
                                    <div className="flex items-start gap-2">
                                        {selectionMode && (
                                            <label className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    className="h-5 w-5 accent-[hsl(var(--primary))]"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelected(client.id)}
                                                    aria-label={`Select ${client.name}`}
                                                />
                                            </label>
                                        )}
                                        <button
                                            type="button"
                                            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
                                            onClick={() => (selectionMode ? toggleSelected(client.id) : setDetailsClient(client))}
                                        >
                                            <Avatar name={client.name} />
                                            <span className="min-w-0">
                                                <span className="block truncate font-semibold text-foreground">{client.name}</span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {client.address || (client.created_at ? `Added ${fmtDate(client.created_at)}` : 'View details')}
                                                </span>
                                            </span>
                                        </button>
                                        <ActionMenu
                                            label={`Actions for ${client.name}`}
                                            items={[
                                                { label: 'Edit', icon: <EditIcon className="h-4 w-4" />, onClick: () => setForm({ mode: 'edit', initial: draftFromClient(client), clientId: client.id }) },
                                                { label: 'Email client', icon: <MailIcon className="h-4 w-4" />, onClick: () => goToCommunication({ clientId: client.id, clientName: client.name, clientEmail: client.email || undefined }) },
                                                ...(temp ? [{ label: 'Convert to regular', icon: <UsersIcon className="h-4 w-4" />, onClick: () => convertToRegular(client) }] : []),
                                                { label: 'Select', icon: <CheckIcon className="h-4 w-4" />, onClick: () => { setSelectionMode(true); setSelected((p) => new Set(p).add(client.id)); } },
                                                { label: 'Delete', icon: <TrashIcon className="h-4 w-4" />, destructive: true, onClick: () => { setDeleteError(null); setDeleteIds([client.id]); } },
                                            ]}
                                        />
                                    </div>

                                    {(temp || unseen.length > 0) && (
                                        <div className="flex flex-wrap gap-2">
                                            {temp && <span className="badge badge-warning">Temporary</span>}
                                            {unseen.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="badge badge-success min-h-[28px] cursor-pointer hover:brightness-95"
                                                    onClick={() => setActivityClient(client)}
                                                >
                                                    <CheckIcon className="h-3.5 w-3.5" /> {unseen.length} new signed {unseen.length === 1 ? 'update' : 'updates'}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <div className="space-y-0.5 text-sm">
                                        {client.email ? (
                                            <a className="flex min-h-[32px] items-center gap-2 truncate text-muted-foreground hover:text-primary" href={`mailto:${client.email}`}>
                                                <MailIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{client.email}</span>
                                            </a>
                                        ) : (
                                            <p className="flex min-h-[32px] items-center gap-2 text-muted-foreground/70"><MailIcon className="h-4 w-4 shrink-0" /> No email</p>
                                        )}
                                        {client.phone ? (
                                            <a className="flex min-h-[32px] items-center gap-2 text-muted-foreground hover:text-primary" href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}>
                                                <SmartphoneIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{client.phone}</span>
                                            </a>
                                        ) : (
                                            <p className="flex min-h-[32px] items-center gap-2 text-muted-foreground/70"><SmartphoneIcon className="h-4 w-4 shrink-0" /> No phone</p>
                                        )}
                                        {client.address && (
                                            <p className="flex min-h-[32px] items-center gap-2 text-muted-foreground"><MapPinIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{client.address}</span></p>
                                        )}
                                    </div>

                                    {!selectionMode && (
                                        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3">
                                            {temp && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm col-span-2 min-h-[40px] border border-warning/50 bg-warning/10 text-warning hover:bg-warning/15"
                                                    onClick={() => convertToRegular(client)}
                                                >
                                                    <UsersIcon className="h-4 w-4" /> Convert to regular
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={cx('btn btn-sm min-h-[40px]', copiedId === client.id ? 'btn-secondary text-success' : 'btn-outline')}
                                                onClick={() => copyPortal(client)}
                                                disabled={portalBusyId === client.id}
                                                title="Copy the client's portal link"
                                            >
                                                {portalBusyId === client.id ? <Spinner /> : copiedId === client.id ? <CheckIcon className="h-4 w-4" /> : <GlobeIcon className="h-4 w-4" />}
                                                {copiedId === client.id ? 'Copied' : 'Portal'}
                                            </button>
                                            {/* old "Get Approval": the client's estimates & change orders, a link to copy for each */}
                                            <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => setApprovalClient(client)} title="Get an approval link for one of this client's estimates or change orders">
                                                <PenIcon className="h-4 w-4" /> Get approval
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {hasMore && serverLoaded && (
                    <div className="mt-6 flex justify-center">
                        <button type="button" className="btn btn-outline min-h-[44px] px-6" onClick={loadMore} disabled={loadingMore}>
                            {loadingMore ? <Spinner label="Loading…" /> : 'Load more clients'}
                        </button>
                    </div>
                )}
            </div>

            {/* Modals */}
            <ClientFormModal
                open={!!form}
                mode={form?.mode || 'add'}
                initial={form?.initial}
                clientId={form?.clientId}
                initialError={form?.error || null}
                userId={userId}
                onClose={() => setForm(null)}
                onSaved={(saved, mode) => {
                    setForm(null);
                    const temp = isTemporaryClient(saved);
                    if (mode === 'add' && filter === 'temporary' && !temp) setFilter('regular');
                    upsertLocal(saved);
                    const hidden = filter === 'regular' && temp;
                    setNotice({
                        tone: 'success',
                        text: mode === 'add'
                            ? `${saved.name} was added${hidden ? ' as a temporary client (see “Temporary”)' : ''}.`
                            : `Client updated${hidden ? `: ${saved.name} is now under “Temporary”` : ''}.`,
                    });
                    changed();
                }}
                onUpgrade={onUpgradeClick}
            />

            <RequestApprovalModal
                open={!!approvalClient}
                client={approvalClient}
                onClose={() => setApprovalClient(null)}
                onEmail={(prefill) => { setApprovalClient(null); goToCommunication(prefill); }}
                onNavigateToNewDoc={onNavigateToNewDoc}
            />

            <TemporaryClientsModal
                open={showTemporary}
                userId={userId}
                reloadKey={tempReload}
                onClose={() => setShowTemporary(false)}
                onConvert={async (c) => !!(await convertToRegular(c))}
                onView={(c) => { setShowTemporary(false); setDetailsClient(c); }}
                onDelete={(c) => { setDeleteError(null); setDeleteIds([c.id]); }}
            />

            <ConfirmDialog
                open={!!deleteIds}
                title={deleteIds && deleteIds.length > 1 ? `Delete ${deleteIds.length} clients?` : 'Delete this client?'}
                message={<p>{deleteIds && deleteIds.length > 1 ? 'Their portal links stop working.' : "The client's portal link stops working."} Jobs and documents are kept.</p>}
                confirmLabel={deleteIds && deleteIds.length > 1 ? `Delete ${deleteIds.length} clients` : 'Delete client'}
                destructive
                busy={deleteBusy}
                error={deleteError}
                onConfirm={doDelete}
                onCancel={() => setDeleteIds(null)}
            />

            <ClientActivityModal
                client={activityClient}
                forms={forms}
                onClose={() => setActivityClient(null)}
                onOpenDoc={onNavigateToDoc}
                onMarkedSeen={(ids) => {
                    setSeenIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
                    onDocumentsViewed?.(ids);
                }}
            />

            <ActivityHistoryModal
                open={showHistory}
                userId={userId}
                onClose={() => setShowHistory(false)}
                onOpenDoc={onNavigateToDoc}
            />

            <ImportClientsModal
                open={showImport}
                userId={userId}
                knownClients={items}
                onClose={() => setShowImport(false)}
                onUpgrade={onUpgradeClick}
                onImported={(count) => {
                    if (count > 0) {
                        loadFirstPage();
                        changed();
                    }
                }}
            />
        </div>
    );
};

/* ================================================================== temporary clients (old "Temporary (N)" window) */

const TemporaryClientsModal: React.FC<{
    open: boolean;
    userId: string | null;
    /** changes whenever clients were added / converted / deleted elsewhere on the page */
    reloadKey: number;
    onClose: () => void;
    onConvert: (client: Client) => Promise<boolean>;
    onView: (client: Client) => void;
    onDelete: (client: Client) => void;
}> = ({ open, userId, reloadKey, onClose, onConvert, onView, onDelete }) => {
    const LIMIT = 200;
    const [list, setList] = useState<Client[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [term, setTerm] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        const t = window.setTimeout(() => setTerm(search.trim()), 250);
        return () => window.clearTimeout(t);
    }, [search]);
    useEffect(() => { if (!open) { setSearch(''); setTerm(''); } }, [open]);

    useEffect(() => {
        if (!open) return;
        let alive = true;
        setError(null);
        (async () => {
            let q = supabase.from('clients').select(CLIENT_COLUMNS).ilike('notes', `%${TEMP_TAG}%`).order('name', { ascending: true }).limit(LIMIT);
            if (userId) q = q.eq('user_id', userId);
            if (term) {
                const pat = ilikePattern(term);
                q = q.or(`name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat}`);
            }
            const { data, error: err } = await q;
            if (!alive) return;
            if (err) { setError(getErrorMessage(err, 'Could not load temporary clients.')); setList((prev) => prev ?? []); return; }
            setList(((data || []) as Client[]).filter(isTemporaryClient));
        })();
        return () => { alive = false; };
    }, [open, userId, term, reloadKey]);

    const convert = async (client: Client) => {
        setBusyId(client.id);
        if (await onConvert(client)) setList((prev) => prev?.filter((c) => c.id !== client.id) ?? prev);
        setBusyId(null);
    };

    const count = list?.length ?? 0;
    return (
        <Modal
            open={open}
            onClose={onClose}
            size="xl"
            title={<span className="flex items-center gap-2 text-warning"><UsersIcon className="h-5 w-5" /> Temporary clients</span>}
            description="Walk-ins, quick check-out clients and one-off jobs. They stay out of your main client list until you convert them to regular."
            footer={
                <>
                    <span className="mr-auto self-center text-xs text-muted-foreground">
                        {list === null ? '' : `${count}${count >= LIMIT ? '+' : ''} temporary client${count === 1 ? '' : 's'}${term ? ' found' : ''}`}
                    </span>
                    <button type="button" className="btn btn-outline min-h-[40px]" onClick={onClose}>Close</button>
                </>
            }
        >
            <div className="relative mb-4">
                <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="search"
                    className="input min-h-[44px] pl-10"
                    placeholder="Search temporary clients"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search temporary clients"
                />
            </div>
            {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
            {list === null ? (
                <SkeletonRows rows={3} />
            ) : list.length === 0 ? (
                <EmptyState
                    icon={<UsersIcon className="h-6 w-6" />}
                    title={term ? `No temporary clients match “${term}”` : 'No temporary clients'}
                    description="Tick “Mark as temporary client” when you add a client, create a job for a new client, check out inventory or create a client from a quote request."
                />
            ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                    {list.map((client) => (
                        <li key={client.id} className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-card p-4">
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-foreground">{client.name}</p>
                                    <p className="text-xs text-muted-foreground">{client.created_at ? `Added ${fmtDate(client.created_at)}` : 'Temporary client'}</p>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-ghost h-9 w-9 shrink-0 rounded-full p-0 text-destructive hover:bg-destructive/10"
                                    onClick={() => onDelete(client)}
                                    aria-label={`Delete ${client.name}`}
                                    title="Delete"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            </div>
                            {(client.email || client.phone) && (
                                <div className="space-y-0.5 text-sm text-muted-foreground">
                                    {client.email && <p className="flex items-center gap-2 truncate"><MailIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{client.email}</span></p>}
                                    {client.phone && <p className="flex items-center gap-2"><SmartphoneIcon className="h-4 w-4 shrink-0" /> {client.phone}</p>}
                                </div>
                            )}
                            <div className="mt-1 grid grid-cols-2 gap-2 border-t border-border pt-3">
                                <button
                                    type="button"
                                    className="btn btn-sm min-h-[40px] border border-warning/50 bg-warning/10 text-warning hover:bg-warning/15"
                                    onClick={() => convert(client)}
                                    disabled={busyId === client.id}
                                >
                                    {busyId === client.id ? <Spinner /> : <CheckIcon className="h-4 w-4" />} Convert to regular
                                </button>
                                <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => onView(client)}>
                                    View details
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
};

/* ================================================================== per-client activity (badge) */

const ClientActivityModal: React.FC<{
    client: Client | null;
    forms: FormDataType[];
    onClose: () => void;
    onOpenDoc?: (formId: string, jobId: string, type: FormType) => void;
    onMarkedSeen: (ids: string[]) => void;
}> = ({ client, forms, onClose, onOpenDoc, onMarkedSeen }) => {
    const [docs, setDocs] = useState<ClientDocSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [newIds, setNewIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!client) return;
        let alive = true;
        setDocs(null);
        setError(null);
        (async () => {
            try {
                const jobs = await fetchClientJobs(client);
                const list = await fetchClientDocuments(client, { jobIds: jobs.map((j) => j.id) });
                const acted = list
                    .filter((d) => d.data.clientSignedAt || d.data.clientDeclinedAt || d.data.status === 'Accepted' || d.data.status === 'Rejected')
                    .sort((a, b) => (parseDate(activityDate(b))?.getTime() || 0) - (parseDate(activityDate(a))?.getTime() || 0));
                if (!alive) return;
                const unseen = new Set<string>([
                    ...acted.filter((d) => !d.data.viewedByProvider).map((d) => d.id),
                    ...unseenActivityFor(client, forms, new Set()).map((f) => f.id),
                ]);
                setNewIds(unseen);
                setDocs(acted);
                if (unseen.size) {
                    const ids = [...unseen];
                    if (await markDocumentsViewed(ids)) onMarkedSeen(ids);
                }
            } catch (err) {
                if (alive) { setError(getErrorMessage(err)); setDocs([]); }
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client?.id]);

    return (
        <Modal
            open={!!client}
            onClose={onClose}
            size="lg"
            title="Recent client activity"
            description={client ? `Documents ${client.name} signed or declined.` : undefined}
            footer={<button type="button" className="btn btn-outline min-h-[40px]" onClick={onClose}>Close</button>}
        >
            {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
            {docs === null ? <SkeletonRows rows={3} /> : docs.length === 0 ? (
                <EmptyState icon={<ClockIcon className="h-6 w-6" />} title="No signed documents yet" description="When the client signs or declines an estimate or change order it shows up here." />
            ) : (
                <ActivityList docs={docs} newIds={newIds} onOpenDoc={onOpenDoc} onAfterOpen={onClose} />
            )}
        </Modal>
    );
};

const ActivityList: React.FC<{
    docs: ClientDocSummary[];
    newIds?: Set<string>;
    showClient?: boolean;
    onOpenDoc?: (formId: string, jobId: string, type: FormType) => void;
    onAfterOpen?: () => void;
}> = ({ docs, newIds, showClient, onOpenDoc, onAfterOpen }) => (
    <ul className="space-y-2">
        {docs.map((doc) => {
            const declined = !!doc.data.clientDeclinedAt || doc.data.status === 'Rejected';
            const who = doc.data.clientSignerName || doc.data.clientName || 'Client';
            const when = activityDate(doc);
            const label = documentLabel(doc.type, doc.data);
            const Wrapper: any = onOpenDoc ? 'button' : 'div';
            return (
                <li key={doc.id}>
                    <Wrapper
                        {...(onOpenDoc ? { type: 'button', onClick: () => { onOpenDoc(doc.id, doc.jobId, doc.type as FormType); onAfterOpen?.(); } } : {})}
                        className={cx('flex w-full min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card p-3 text-left', onOpenDoc && 'hover:bg-muted/40')}
                    >
                        <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', declined ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
                            <DocTypeIcon type={doc.type} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">
                                <span className="font-semibold">{who}</span> {declined ? 'declined' : 'signed'} <span className="font-semibold">{label}</span>
                                {showClient && doc.data.clientName && doc.data.clientName !== who ? <span className="text-muted-foreground"> · {doc.data.clientName}</span> : null}
                            </p>
                            <p className="text-xs text-muted-foreground">{fmtDate(when, !!(doc.data.clientSignedAt || doc.data.clientDeclinedAt)) || 'Date unknown'}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                            {newIds?.has(doc.id) && <span className="badge badge-primary">New</span>}
                            <StatusBadge status={declined ? 'Declined' : 'Signed'} />
                        </div>
                    </Wrapper>
                </li>
            );
        })}
    </ul>
);

/* ================================================================== global activity history (COMM-040) */

const ACTIVITY_COLUMNS = [
    'id', 'job_id', 'type', 'created_at', 'public_token',
    'title:data->>title', 'invoiceNumber:data->>invoiceNumber', 'estimateNumber:data->>estimateNumber',
    'changeOrderNumber:data->>changeOrderNumber', 'status:data->>status', 'clientName:data->>clientName',
    'clientSignedAt:data->>clientSignedAt', 'clientSignerName:data->>clientSignerName', 'clientSignedBy:data->>clientSignedBy',
    'clientDeclinedAt:data->>clientDeclinedAt', 'viewedByProvider:data->>viewedByProvider',
].join(', ');

const ActivityHistoryModal: React.FC<{
    open: boolean;
    userId: string | null;
    onClose: () => void;
    onOpenDoc?: (formId: string, jobId: string, type: FormType) => void;
}> = ({ open, userId, onClose, onOpenDoc }) => {
    const [docs, setDocs] = useState<ClientDocSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setDocs(null);
        setError(null);
        let q = supabase
            .from('documents')
            .select(ACTIVITY_COLUMNS)
            .or('data->>clientSignedAt.not.is.null,data->>clientDeclinedAt.not.is.null,data->>status.in.(Accepted,Rejected)')
            .order('created_at', { ascending: false })
            .limit(200);
        if (userId) q = q.eq('user_id', userId);
        const { data, error: err } = await q;
        if (err) { setError(getErrorMessage(err, 'Could not load activity.')); setDocs([]); return; }
        const mapped: ClientDocSummary[] = (data || []).map((row: any) => ({
            id: row.id,
            jobId: row.job_id,
            type: row.type,
            createdAt: row.created_at,
            publicToken: row.public_token ?? null,
            clientId: null,
            data: {
                title: row.title || undefined,
                number: row.estimateNumber || row.changeOrderNumber || row.invoiceNumber || undefined,
                status: row.status || undefined,
                clientName: row.clientName || undefined,
                clientSignedAt: row.clientSignedAt || undefined,
                clientSignerName: row.clientSignerName || row.clientSignedBy || undefined,
                clientDeclinedAt: row.clientDeclinedAt || undefined,
                viewedByProvider: String(row.viewedByProvider).toLowerCase() === 'true',
            },
        }));
        mapped.sort((a, b) => (parseDate(activityDate(b))?.getTime() || 0) - (parseDate(activityDate(a))?.getTime() || 0));
        setDocs(mapped);
    }, [userId]);

    useEffect(() => { if (open) load(); }, [open, load]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title="Client activity"
            description="Estimates and change orders your clients signed or declined, newest first."
            footer={<button type="button" className="btn btn-outline min-h-[40px]" onClick={onClose}>Close</button>}
        >
            {error && (
                <Notice tone="danger" className="mb-3" action={<button type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={load}>Retry</button>}>{error}</Notice>
            )}
            {docs === null ? <SkeletonRows rows={4} /> : docs.length === 0 ? (
                <EmptyState icon={<ClockIcon className="h-6 w-6" />} title="No activity yet" description="Send an approval link or a portal link; signatures will appear here." />
            ) : (
                <ActivityList
                    docs={docs}
                    newIds={new Set(docs.filter((d) => !d.data.viewedByProvider).map((d) => d.id))}
                    showClient
                    onOpenDoc={onOpenDoc}
                    onAfterOpen={onClose}
                />
            )}
        </Modal>
    );
};

/* ================================================================== CSV import */

const ImportClientsModal: React.FC<{
    open: boolean;
    userId: string | null;
    knownClients: Client[];
    onClose: () => void;
    onImported: (count: number) => void;
    onUpgrade?: () => void;
}> = ({ open, userId, knownClients, onClose, onImported, onUpgrade }) => {
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<ImportRow[] | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<{ imported: number; tone: 'success' | 'warning' | 'danger'; text: string; upgrade?: boolean } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setFileName('');
        setRows(null);
        setParseError(null);
        setBusy(false);
        setProgress(0);
        setResult(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    useEffect(() => { if (open) reset(); }, [open]);

    const downloadTemplate = () => downloadText('clients-template.csv', toCsv([
        ['Name', 'Email', 'Phone', 'Address', 'Notes'],
        ['Jane Cooper', 'jane@example.com', '(555) 201-3344', '12 Oak St, Springfield', 'Prefers text messages'],
    ]));

    const onFile = async (file: File | undefined) => {
        setParseError(null);
        setRows(null);
        setResult(null);
        if (!file) return;
        setFileName(file.name);
        if (file.size > 5 * 1024 * 1024) { setParseError('That file is larger than 5 MB. Split it into smaller files.'); return; }
        try {
            const table = parseCsv(await file.text());
            if (table.length < 2) { setParseError('The file needs a header row and at least one client.'); return; }
            const headers = table[0].map(normHeader);
            const col = (key: keyof ClientDraft) => headers.findIndex((h) => HEADER_ALIASES[key].includes(h));
            const idx = { name: col('name'), email: col('email'), phone: col('phone'), address: col('address'), notes: col('notes') };
            const firstIdx = headers.findIndex((h) => ['first name', 'firstname', 'given name'].includes(h));
            const lastIdx = headers.findIndex((h) => ['last name', 'lastname', 'surname', 'family name'].includes(h));
            if (idx.name < 0 && firstIdx < 0) {
                setParseError('Could not find a "Name" column. Use headers like Name, Email, Phone, Address, Notes (download the template below).');
                return;
            }
            const body = table.slice(1, MAX_IMPORT_ROWS + 1);
            const existingEmails = new Set(knownClients.map((c) => (c.email || '').toLowerCase()).filter(Boolean));
            const existingNames = new Set(knownClients.map((c) => c.name.toLowerCase()));

            // Also check the server for emails already saved (only the ones in this file).
            const fileEmails = [...new Set(body.map((r) => (idx.email >= 0 ? (r[idx.email] || '').trim() : '')).filter((e) => EMAIL_RE.test(e)))];
            for (let i = 0; i < fileEmails.length && i < 1000; i += 200) {
                const chunk = fileEmails.slice(i, i + 200);
                let q = supabase.from('clients').select('email').in('email', chunk);
                if (userId) q = q.eq('user_id', userId);
                const { data } = await q;
                (data || []).forEach((r: any) => r.email && existingEmails.add(String(r.email).toLowerCase()));
            }

            const seenInFile = new Set<string>();
            const parsed: ImportRow[] = body.map((r, i) => {
                const get = (j: number) => (j >= 0 ? String(r[j] ?? '').trim() : '');
                const composedName = idx.name >= 0 ? get(idx.name) : [get(firstIdx), get(lastIdx)].filter(Boolean).join(' ');
                const draft: ClientDraft = {
                    name: composedName.replace(/\s+/g, ' '),
                    email: get(idx.email),
                    phone: get(idx.phone),
                    address: get(idx.address),
                    notes: get(idx.notes),
                };
                const errors: string[] = [];
                const warnings: string[] = [];
                if (!draft.name) errors.push('Name is missing');
                if (draft.name.length > 200) errors.push('Name is too long');
                if (draft.email && !EMAIL_RE.test(draft.email)) {
                    warnings.push(`Invalid email "${draft.email}" will be left empty`);
                    draft.email = '';
                }
                const emailKey = draft.email.toLowerCase();
                let include = errors.length === 0;
                if (emailKey && existingEmails.has(emailKey)) { warnings.push('Already a client with this email'); include = false; }
                else if (!emailKey && draft.name && existingNames.has(draft.name.toLowerCase())) { warnings.push('A client with this name already exists'); include = false; }
                if (emailKey) {
                    if (seenInFile.has(emailKey)) { warnings.push('Duplicate email in this file'); include = false; }
                    seenInFile.add(emailKey);
                }
                return { line: i + 2, draft, errors, warnings, include };
            });
            if (table.length - 1 > MAX_IMPORT_ROWS) {
                setParseError(`Only the first ${MAX_IMPORT_ROWS} rows are shown. Import the rest in another file.`);
            }
            setRows(parsed);
        } catch (err) {
            setParseError(`Could not read the file: ${getErrorMessage(err)}`);
        }
    };

    const toggleRow = (line: number) => setRows((prev) => prev?.map((r) => (r.line === line && !r.errors.length ? { ...r, include: !r.include } : r)) ?? prev);

    const selectedRows = (rows || []).filter((r) => r.include && !r.errors.length);

    const runImport = async () => {
        if (!userId) { setResult({ imported: 0, tone: 'danger', text: 'You are signed out. Please sign in again.' }); return; }
        if (!selectedRows.length) return;
        setBusy(true);
        setProgress(0);
        let imported = 0;
        const toRow = (d: ClientDraft) => ({
            id: crypto.randomUUID(),
            user_id: userId,
            name: d.name,
            email: d.email,
            phone: d.phone,
            address: d.address,
            notes: d.notes,
        });
        try {
            for (let i = 0; i < selectedRows.length; i += 100) {
                const chunk = selectedRows.slice(i, i + 100);
                const { error } = await supabase.from('clients').insert(chunk.map((r) => toRow(r.draft)));
                if (!error) {
                    imported += chunk.length;
                    setProgress(imported);
                    continue;
                }
                if (isPlanLimitError(error)) {
                    // The whole chunk was rolled back: add one by one until the limit is reached.
                    for (const r of chunk) {
                        const one = await supabase.from('clients').insert(toRow(r.draft));
                        if (one.error) {
                            const limit = isPlanLimitError(one.error);
                            setResult({
                                imported,
                                tone: 'warning',
                                upgrade: limit,
                                text: limit
                                    ? `Imported ${imported} of ${selectedRows.length} clients. ${getErrorMessage(one.error)}`
                                    : `Imported ${imported} of ${selectedRows.length}. Stopped at line ${r.line}: ${getErrorMessage(one.error)}`,
                            });
                            return;
                        }
                        imported++;
                        setProgress(imported);
                    }
                    continue;
                }
                setResult({
                    imported,
                    tone: imported ? 'warning' : 'danger',
                    text: `Imported ${imported} of ${selectedRows.length}. ${getErrorMessage(error)}`,
                });
                return;
            }
            setResult({ imported, tone: 'success', text: `Imported ${imported} client${imported === 1 ? '' : 's'}.` });
        } finally {
            setBusy(false);
            onImported(imported);
        }
    };

    const errorCount = (rows || []).filter((r) => r.errors.length).length;
    const warnCount = (rows || []).filter((r) => !r.errors.length && r.warnings.length).length;

    return (
        <Modal
            open={open}
            onClose={onClose}
            locked={busy}
            size="xl"
            title="Import clients from CSV"
            description="Export a spreadsheet as CSV (Excel, Google Sheets, QuickBooks…). Columns: Name, Email, Phone, Address, Notes."
            footer={
                result ? (
                    <>
                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={reset}>Import another file</button>
                        <button type="button" className="btn btn-primary min-h-[40px]" onClick={onClose}>Done</button>
                    </>
                ) : (
                    <>
                        <button type="button" className="btn btn-outline min-h-[40px]" onClick={onClose} disabled={busy}>Cancel</button>
                        <button type="button" className="btn btn-primary min-h-[40px]" onClick={runImport} disabled={busy || !selectedRows.length}>
                            {busy ? <Spinner label={`Importing ${progress}/${selectedRows.length}…`} /> : `Import ${selectedRows.length} client${selectedRows.length === 1 ? '' : 's'}`}
                        </button>
                    </>
                )
            }
        >
            <div className="space-y-4">
                {result && (
                    <Notice
                        tone={result.tone}
                        title={result.tone === 'success' ? 'Import complete' : 'Import stopped'}
                        action={result.upgrade && onUpgrade ? <button type="button" className="btn btn-primary btn-sm min-h-[36px]" onClick={onUpgrade}>Upgrade</button> : undefined}
                    >
                        {result.text}
                    </Notice>
                )}

                {!result && (
                    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <UploadImageIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{fileName || 'Choose a .csv file'}</p>
                            <p className="text-xs text-muted-foreground">Up to {MAX_IMPORT_ROWS.toLocaleString()} rows, 5 MB. Nothing is saved until you confirm.</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <label className="btn btn-primary min-h-[40px] cursor-pointer">
                                <UploadImageIcon className="h-4 w-4" /> {fileName ? 'Choose another' : 'Choose file'}
                                <input
                                    ref={inputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="sr-only"
                                    onChange={(e) => onFile(e.target.files?.[0])}
                                    disabled={busy}
                                />
                            </label>
                            <button type="button" className="btn btn-ghost min-h-[40px]" onClick={downloadTemplate}>
                                <DownloadIcon className="h-4 w-4" /> Template
                            </button>
                        </div>
                    </div>
                )}

                {parseError && <Notice tone="warning">{parseError}</Notice>}

                {rows && !result && (
                    <>
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="badge badge-primary">{selectedRows.length} ready to import</span>
                            {warnCount > 0 && <span className="badge badge-warning">{warnCount} with warnings</span>}
                            {errorCount > 0 && <span className="badge badge-danger">{errorCount} skipped (errors)</span>}
                        </div>
                        <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                            {rows.map((r) => (
                                <li
                                    key={r.line}
                                    className={cx(
                                        'rounded-xl border p-3',
                                        r.errors.length ? 'border-destructive/30 bg-destructive/5' : r.warnings.length ? 'border-warning/40 bg-warning/5' : 'border-border bg-card',
                                    )}
                                >
                                    <label className={cx('flex items-start gap-3', !r.errors.length && 'cursor-pointer')}>
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                                            checked={r.include && !r.errors.length}
                                            disabled={!!r.errors.length || busy}
                                            onChange={() => toggleRow(r.line)}
                                            aria-label={`Import line ${r.line}`}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-baseline gap-x-2">
                                                <span className="font-semibold text-foreground">{r.draft.name || <em className="text-muted-foreground">No name</em>}</span>
                                                <span className="text-xs text-muted-foreground">line {r.line}</span>
                                            </span>
                                            <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                                                {[r.draft.email, r.draft.phone, r.draft.address].filter(Boolean).join(' · ') || 'No contact details'}
                                            </span>
                                            {[...r.errors, ...r.warnings].map((m) => (
                                                <span key={m} className={cx('mt-1 flex items-center gap-1 text-xs font-medium', r.errors.includes(m) ? 'text-destructive' : 'text-warning')}>
                                                    <XCircleIcon className="h-3.5 w-3.5 shrink-0" /> {m}
                                                </span>
                                            ))}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {!rows && !result && !parseError && (
                    <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground">Tips</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            <li>The first row must contain column names. "First name" + "Last name" columns are combined.</li>
                            <li>Rows whose email already belongs to a client are unchecked so you don't get duplicates.</li>
                            <li>Comma, semicolon and tab separated files work.</li>
                        </ul>
                        <button type="button" className="btn btn-ghost btn-sm mt-2 min-h-[36px]" onClick={() => copyToClipboard('Name,Email,Phone,Address,Notes')}>
                            <CopyIcon className="h-4 w-4" /> Copy header row
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ClientsView;
