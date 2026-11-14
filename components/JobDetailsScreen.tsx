import React, { useMemo, useState } from 'react';
import type { Job, Client, FormData as FormDataType } from '../types.ts';
import { JobStatusBadge, formatShortDate, JOB_STATUS_META } from './JobCard.tsx';
import { getDocTypeMeta } from './SelectDocType.tsx';
import { EmptyState } from './ui/EmptyState.tsx';
import { Skeleton } from './ui/Skeleton.tsx';
import { DropdownMenu, DropdownItem, DropdownSeparator } from './ui/DropdownMenu.tsx';
import {
    BackArrowIcon, PlusIcon, SearchIcon, CalculatorIcon, MapPinIcon, CalendarIcon, UserIcon, MailIcon, PhoneIcon,
    MoreVerticalIcon, CopyIcon, TrashIcon, FileTextIcon, SparklesIcon, CheckCircleIcon, StarIcon, WifiOffIcon, ClockIcon,
} from './Icons.tsx';
import { getDocumentTitle } from '../lib/documents.ts';
import HelpButton from './help/HelpButton.tsx';
import type { Translation } from '../utils/translations.ts';
import { DocSyncChip, useDocSyncState } from './offline/OfflineContext.tsx';

interface JobDetailsScreenProps {
    job: Job;
    client?: Client | null;
    /** All loaded documents of this job (unfiltered). */
    documents: FormDataType[];
    /** First page still loading. */
    loadingDocuments: boolean;
    hasMoreDocuments: boolean;
    loadingMoreDocuments: boolean;
    /** Free plan: documents created this month for this job, and the limit (null = unlimited). */
    docsThisMonth: number;
    docLimit: number | null;
    isOnline: boolean;
    /** offline, "New document" still opens (field documents and estimate / invoice drafts wait in the outbox) */
    canCreateOffline?: boolean;
    t: Translation;
    /** AI assistant button + modal (rendered by App, owned by the AI area). */
    aiButton?: React.ReactNode;
    aiModal?: React.ReactNode;
    onBack: () => void;
    onNewDocument: () => void;
    onOpenDocument: (form: FormDataType) => void;
    onDuplicateDocument: (form: FormDataType) => void;
    /** "Copy to another job" (the picker lives in App); omitted when there is no other job */
    onCopyDocumentToJob?: (form: FormDataType) => void;
    onDeleteDocument: (form: FormDataType) => void;
    onStatusChange: (status: Job['status']) => void;
    onLoadMore: () => void;
    onOpenFinancials: () => void;
    /** "Bill time & materials": unbilled time sheets and material lines → a Draft invoice (optional) */
    onBillTimeMaterials?: () => void;
    onUpgrade: () => void;
    /** "Mark as paid" in an invoice's menu (optional) */
    onMarkPaid?: (form: FormDataType) => void;
    /** Job photo timeline (rendered by App); adds a Documents / Photos switch. URL hash #photos opens it. */
    photosSlot?: React.ReactNode;
}

// "get paid": invoice still open (not Paid / Cancelled) and the client's "I've paid" report
const isOpenInvoice = (form: FormDataType) => String(form.type) === 'Invoice' &&!/^(paid|cancel+ed|void)$/i.test(String((form.data as any)?.status || ''));

const statusTone = (status?: string): string => {
    const s = String(status || '').toLowerCase();
    if (['paid', 'accepted', 'approved', 'completed', 'signed'].includes(s)) return 'badge-success';
    if (['sent', 'pending', 'in progress', 'open', 'submitted'].includes(s)) return 'badge-primary';
    if (['overdue', 'rejected', 'declined', 'cancelled', 'canceled', 'void'].includes(s)) return 'badge-danger';
    if (['draft', ''].includes(s)) return 'badge-muted';
    return 'badge-muted';
};

const DocumentTile: React.FC<{
    form: FormDataType;
    onOpen: () => void;
    onDuplicate: () => void;
    onCopyToJob?: () => void;
    onDelete: () => void;
    onMarkPaid?: () => void;
}> = ({ form, onOpen, onDuplicate, onCopyToJob, onDelete, onMarkPaid }) => {
    const meta = getDocTypeMeta(form.type);
    const Icon = meta.icon;
    const d = (form.data || {}) as any;
    const signed = Boolean(d.clientSignatureUrl || d.clientSignedAt);
    // waiting in the offline outbox: "Mark as paid" waits until it is on the account
    const waiting = useDocSyncState(form.id);
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
            className={`card group relative flex cursor-pointer items-center gap-3 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card sm:p-4 ${d.isAiGenerated ? 'ring-1 ring-primary/25' : ''}`}
            aria-label={`Open ${form.type}: ${getDocumentTitle(form)}`}
        >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}>
                <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{getDocumentTitle(form)}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {form.type}{form.createdAt ? ` · ${formatShortDate(form.createdAt)}` : ''}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.status && <span className={`badge ${statusTone(d.status)}`}>{d.status}</span>}
                    {signed && <span className="badge badge-success"><CheckCircleIcon className="h-3 w-3" /> Client signed</span>}
                    {d.isAiGenerated && <span className="badge badge-primary"><SparklesIcon className="h-3 w-3" /> AI drafted</span>}
                    {d.paymentReportedAt && isOpenInvoice(form) && <span className="badge badge-warning">Payment reported</span>}
                    <DocSyncChip docId={form.id} />
                </div>
            </div>
            <DropdownMenu
                asButton
                portal
                label="Document actions"
                trigger={
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground">
                        <MoreVerticalIcon className="h-4 w-4" />
                    </span>
                }
            >
                {onMarkPaid && !waiting && isOpenInvoice(form) && <DropdownItem onClick={onMarkPaid}><CheckCircleIcon className="h-4 w-4" /> Mark as paid</DropdownItem>}
                <DropdownItem onClick={onDuplicate}><CopyIcon className="h-4 w-4" /> Duplicate as draft</DropdownItem>
                {onCopyToJob && <DropdownItem onClick={onCopyToJob}><CopyIcon className="h-4 w-4" /> Copy to another job</DropdownItem>}
                <DropdownSeparator />
                <DropdownItem onClick={onDelete} destructive><TrashIcon className="h-4 w-4" /> Delete</DropdownItem>
            </DropdownMenu>
        </div>
    );
};

const JobDetailsScreen: React.FC<JobDetailsScreenProps> = ({
    job, client, documents, loadingDocuments, hasMoreDocuments, loadingMoreDocuments, docsThisMonth, docLimit, isOnline, canCreateOffline = false, t,
    aiButton, aiModal, onBack, onNewDocument, onOpenDocument, onDuplicateDocument, onCopyDocumentToJob, onDeleteDocument, onStatusChange,
    onLoadMore, onOpenFinancials, onBillTimeMaterials, onUpgrade, onMarkPaid, photosSlot,
}) => {
    // Documents / Photos switch (kept in the URL hash so Back from a photo or a refresh stays on Photos).
    const [tab, setTabState] = useState<'docs' | 'photos'>(() => (typeof window !== 'undefined' && window.location.hash === '#photos' ? 'photos' : 'docs'));
    const setTab = (next: 'docs' | 'photos') => {
        setTabState(next);
        try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${next === 'photos' ? '#photos' : ''}`); } catch { /* ignore */ }
    };
    // Filters live here, so they reset when another job opens (CORE-025).
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('All');

    const typeCounts = useMemo(() => {
        const counts = new Map<string, number>();
        documents.forEach(f => counts.set(f.type, (counts.get(f.type) || 0) + 1));
        return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [documents]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return documents.filter(f => {
            if (typeFilter !== 'All' && f.type !== typeFilter) return false;
            if (!q) return true;
            const d = f.data as any;
            return [getDocumentTitle(f), f.type, d?.status, d?.clientName].some(v => String(v || '').toLowerCase().includes(q));
        });
    }, [documents, query, typeFilter]);

    const atDocLimit = docLimit !== null && docsThisMonth >= docLimit;
    const canCreate = isOnline || canCreateOffline;
    const start = formatShortDate(job.startDate);
    const end = formatShortDate(job.endDate);

    return (
        <div className="page">
            {/* Header */}
            <div className="mb-6">
                <button type="button" onClick={onBack} className="-ml-2 mb-2 inline-flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    <BackArrowIcon className="h-4 w-4" /> {t.dashboard || 'Dashboard'}
                </button>
                {/* Row 1: title + the primary action (New document, top right). Row 2: details. Row 3: job tools. */}
                <div className="flex flex-col gap-4">
                    <div className="min-w-0">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <h1 className="page-title break-words">{job.name || 'Untitled job'}</h1>
                                <JobStatusBadge status={job.status} />
                            </div>
                            <button type="button" onClick={onNewDocument} className="btn btn-primary hidden h-10 shrink-0 sm:inline-flex" disabled={!canCreate}>
                                <PlusIcon className="h-4 w-4" /> {t.newDocument || 'New document'}
                            </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                            <span className="inline-flex min-w-0 items-center gap-1.5"><UserIcon className="h-4 w-4 shrink-0" /><span className="truncate">{job.clientName || 'No client'}</span></span>
                            {job.clientAddress && <span className="inline-flex min-w-0 items-center gap-1.5"><MapPinIcon className="h-4 w-4 shrink-0" /><span className="truncate">{job.clientAddress}</span></span>}
                            {(start || end) && <span className="inline-flex items-center gap-1.5"><CalendarIcon className="h-4 w-4 shrink-0" />{start}{end ? ` – ${end}` : ''}</span>}
                            {job.workerName && <span className="inline-flex items-center gap-1.5">Crew: {job.workerName}</span>}
                            {client?.email && <a href={`mailto:${client.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-primary"><MailIcon className="h-4 w-4 shrink-0" /><span className="truncate">{client.email}</span></a>}
                            {client?.phone && <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary"><PhoneIcon className="h-4 w-4 shrink-0" />{client.phone}</a>}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor="job-status">Job status</label>
                        <select
                            id="job-status"
                            value={job.status}
                            onChange={(e) => onStatusChange(e.target.value as Job['status'])}
                            className="input h-10 w-auto py-2 pr-8 font-medium"
                            disabled={!isOnline}
                        >
                            {(Object.keys(JOB_STATUS_META) as Job['status'][]).map(s => <option key={s} value={s}>{JOB_STATUS_META[s].label}</option>)}
                        </select>
                        <button type="button" onClick={onOpenFinancials} className="btn btn-outline h-10" title="Job financials">
                            <CalculatorIcon className="h-4 w-4" /> <span className="hidden sm:inline">Financials</span>
                        </button>
                        {onBillTimeMaterials && (
                            <button type="button" onClick={onBillTimeMaterials} className="btn btn-outline h-10" title="Bill time & materials" disabled={!isOnline}>
                                <ClockIcon className="h-4 w-4" /> <span className="sm:hidden">Bill T&amp;M</span><span className="hidden sm:inline">Bill time &amp; materials</span>
                            </button>
                        )}
                        {aiButton}
                        <HelpButton topic="jobs" />
                    </div>
                </div>
            </div>

            {aiModal}

            {!isOnline && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground" role="status">
                    <WifiOffIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    {canCreateOffline
                        ? "You're offline. Daily reports, time sheets, material and expense logs, notes and receipts save on this device and sync when you reconnect; estimates and invoices can be drafted."
                        : "You're offline. You can view saved documents; creating and editing are paused until you reconnect."}
                </div>
            )}

            {docLimit !== null && (
                <div className={`mb-4 flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${atDocLimit ? 'border-warning/40 bg-warning/10' : 'border-border bg-muted/40'}`}>
                    <span>
                        Free plan: <strong>{Math.min(docsThisMonth, docLimit)} of {docLimit}</strong> new documents used for this job this month.
                        <span className="block text-xs text-muted-foreground">
                            {atDocLimit
                                ? 'All used: new documents and copies for this job need Premium until next month.'
                                : 'Deleted documents still count; the count resets on the 1st.'}
                        </span>
                    </span>
                    <button type="button" onClick={onUpgrade} className="btn btn-sm btn-outline shrink-0"><StarIcon className="h-3.5 w-3.5" /> Upgrade for unlimited</button>
                </div>
            )}

            {photosSlot && (
                <div className="mb-4 flex gap-6 border-b border-border" role="tablist" aria-label="Job sections">
                    {([['docs', t.projectDocs || 'Documents'], ['photos', 'Photos']] as const).map(([id, label]) => (
                        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                            className={`-mb-px min-h-[44px] border-b-2 px-1 text-base font-bold transition ${tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {photosSlot && tab === 'photos' ? photosSlot : (
            /* Documents */
            <section aria-labelledby="docs-heading">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 id="docs-heading" className="text-lg font-bold">{t.projectDocs || 'Documents'}</h2>
                    {documents.length > 0 && <span className="text-sm text-muted-foreground">{filtered.length} of {documents.length}{hasMoreDocuments ? '+' : ''}</span>}
                </div>

                {documents.length > 0 && (
                    <div className="mb-4 space-y-3">
                        <div className="relative">
                            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents..." className="input pl-10" aria-label="Search documents" />
                        </div>
                        {typeCounts.length > 1 && (
                            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Filter by document type">
                                {[['All', documents.length] as [string, number], ...typeCounts].map(([type, count]) => (
                                    <button
                                        key={type}
                                        type="button"
                                        role="radio"
                                        aria-checked={typeFilter === type}
                                        onClick={() => setTypeFilter(type)}
                                        className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition ${typeFilter === type ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {type === 'All' ? 'All' : type} <span className="ml-1 opacity-70">{count}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {loadingDocuments && documents.length === 0 ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="card flex items-center gap-3 p-4"><Skeleton className="h-11 w-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>
                        ))}
                    </div>
                ) : documents.length === 0 ? (
                    <EmptyState
                        icon={FileTextIcon}
                        title="No documents yet"
                        description={t.noDocsYet}
                        action={<button type="button" className="btn btn-primary" onClick={onNewDocument} disabled={!canCreate}><PlusIcon className="h-4 w-4" /> Create first document</button>}
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={SearchIcon}
                        title="No documents match your filters"
                        action={<button type="button" className="btn btn-outline" onClick={() => { setQuery(''); setTypeFilter('All'); }}>Clear filters</button>}
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {filtered.map(form => (
                            <DocumentTile
                                key={form.id}
                                form={form}
                                onOpen={() => onOpenDocument(form)}
                                onDuplicate={() => onDuplicateDocument(form)}
                                onCopyToJob={onCopyDocumentToJob ? () => onCopyDocumentToJob(form) : undefined}
                                onDelete={() => onDeleteDocument(form)}
                                onMarkPaid={onMarkPaid && isOnline ? () => onMarkPaid(form) : undefined}
                            />
                        ))}
                    </div>
                )}

                {hasMoreDocuments && documents.length > 0 && (
                    <div className="mt-6 flex justify-center">
                        <button type="button" className="btn btn-outline" onClick={onLoadMore} disabled={loadingMoreDocuments}>
                            {loadingMoreDocuments && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                            {loadingMoreDocuments ? 'Loading...' : 'Load more documents'}
                        </button>
                    </div>
                )}
            </section>
            )}
        </div>
    );
};

export default JobDetailsScreen;
