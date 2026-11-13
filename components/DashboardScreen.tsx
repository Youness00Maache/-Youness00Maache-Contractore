import React, { useEffect, useMemo, useState } from 'react';
import type { Job, FormData as FormDataType } from '../types.ts';
import { JobCard, JobStatusBadge, formatShortDate } from './JobCard.tsx';
import { EmptyState } from './ui/EmptyState.tsx';
import { Skeleton } from './ui/Skeleton.tsx';
import { BriefcaseIcon, PlusIcon, SearchIcon, UsersIcon, CheckCircleIcon, StarIcon, SortIcon, ChevronRightIcon, BoxIcon, CalendarIcon } from './Icons.tsx';
import { getDocTypeMeta } from './SelectDocType.tsx';
import { getDocumentTitle, isUnseenClientSignedDocument } from '../lib/documents.ts';
import type { Translation } from '../utils/translations.ts';
import type { UsageSnapshot } from '../lib/account.ts';
import { isPaidTier, type PlanTier } from '../lib/plans.ts';

type StatusFilter = 'All' | Job['status'];
type SortKey = 'newest' | 'oldest' | 'name' | 'start';

interface DashboardScreenProps {
    userName: string;
    plan: PlanTier;
    jobs: Job[];
    forms: FormDataType[];
    clientsCount: number;
    lowStockCount: number;
    usage: UsageSnapshot | null;
    /** True until the first jobs list arrives. */
    loading: boolean;
    t: Translation;
    /** AI assistant entry point (rendered by App, owned by the AI area). */
    aiSlot?: React.ReactNode;
    onNewJob: () => void;
    onOpenJob: (jobId: string) => void;
    onOpenDocument: (form: FormDataType) => void;
    onDuplicateJob: (job: Job) => void;
    onDeleteJob: (job: Job) => void;
    onUpgrade: () => void;
    onOpenClients: () => void;
    onOpenInventory: () => void;
    onOpenCalendar: () => void;
}

const FILTERS_KEY = 'cd_dashboard_filters';
const PAGE = 24;

const readFilters = (): { status: StatusFilter; client: string; sort: SortKey } => {
    try {
        const v = JSON.parse(sessionStorage.getItem(FILTERS_KEY) || '{}');
        return {
            status: ['All', 'active', 'paused', 'completed', 'inactive'].includes(v.status) ? v.status : 'All',
            client: typeof v.client === 'string' ? v.client : 'All',
            sort: ['newest', 'oldest', 'name', 'start'].includes(v.sort) ? v.sort : 'newest',
        };
    } catch {
        return { status: 'All', client: 'All', sort: 'newest' };
    }
};

const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
};

const isThisMonth = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const StatCard: React.FC<{
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    tone: string;
    onClick?: () => void;
    meter?: { used: number; limit: number } | null;
}> = ({ label, value, hint, icon: Icon, tone, onClick, meter }) => {
    const content = (
        <>
            <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</div>
            {meter && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                        className={`h-full rounded-full ${meter.used >= meter.limit ? 'bg-warning' : 'bg-primary'}`}
                        style={{ width: `${Math.min(100, (meter.used / Math.max(1, meter.limit)) * 100)}%` }}
                    />
                </div>
            )}
            {hint && <div className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</div>}
        </>
    );
    return onClick ? (
        <button type="button" onClick={onClick} className="card p-4 text-left transition hover:border-primary/40 hover:shadow-card">{content}</button>
    ) : (
        <div className="card p-4">{content}</div>
    );
};

const DashboardScreen: React.FC<DashboardScreenProps> = ({
    userName, plan, jobs, forms, clientsCount, lowStockCount, usage, loading, t, aiSlot,
    onNewJob, onOpenJob, onOpenDocument, onDuplicateJob, onDeleteJob, onUpgrade, onOpenClients, onOpenInventory, onOpenCalendar,
}) => {
    const initial = useMemo(readFilters, []);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<StatusFilter>(initial.status);
    const [client, setClient] = useState<string>(initial.client);
    const [sort, setSort] = useState<SortKey>(initial.sort);
    const [visible, setVisible] = useState(PAGE);

    useEffect(() => {
        try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ status, client, sort })); } catch { /* ignore */ }
        setVisible(PAGE);
    }, [status, client, sort]);

    const paid = isPaidTier(plan);
    const firstName = (userName || '').trim().split(/\s+/)[0] || '';

    const clientNames = useMemo(
        () => Array.from(new Set(jobs.map(j => j.clientName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
        [jobs],
    );
    useEffect(() => {
        if (client !== 'All' && clientNames.length && !clientNames.includes(client)) setClient('All');
    }, [client, clientNames]);

    const filteredJobs = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = jobs.filter(j => {
            if (status !== 'All' && j.status !== status) return false;
            if (client !== 'All' && j.clientName !== client) return false;
            if (!q) return true;
            return [j.name, j.clientName, j.clientAddress, j.workerName].some(v => (v || '').toLowerCase().includes(q));
        });
        const byCreated = (a: Job, b: Job) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        switch (sort) {
            case 'oldest': return [...list].sort((a, b) => -byCreated(a, b));
            case 'name': return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            case 'start': return [...list].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
            default: return [...list].sort(byCreated);
        }
    }, [jobs, query, status, client, sort]);

    const activeCount = useMemo(() => jobs.filter(j => j.status === 'active').length, [jobs]);
    const jobsThisMonth = usage?.jobsThisMonth ?? jobs.filter(j => isThisMonth(j.createdAt)).length;
    const jobLimit = paid ? null : (usage?.limits.jobs ?? null);
    const clientTotal = usage?.clientsTotal ?? clientsCount;
    const clientLimit = paid ? null : (usage?.limits.clients ?? null);
    const unseenSigned = useMemo(() => forms.filter(isUnseenClientSignedDocument).length, [forms]);
    const recentDocs = useMemo(() => forms.slice(0, 5), [forms]);
    const jobNameById = useMemo(() => new Map(jobs.map(j => [j.id, j.name])), [jobs]);
    const upcoming = useMemo(() => {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return jobs.filter(j => j.status === 'active' && j.startDate && j.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    }, [jobs]);

    const filtersActive = status !== 'All' || client !== 'All' || query.trim() !== '';
    const statusOptions: { value: StatusFilter; label: string }[] = [
        { value: 'All', label: 'All' },
        { value: 'active', label: 'Active' },
        { value: 'paused', label: 'Paused' },
        { value: 'completed', label: 'Completed' },
        { value: 'inactive', label: 'Inactive' },
    ];

    return (
        <div className="page">
            {/* Header */}
            <div className="page-header">
                <div className="min-w-0">
                    <h1 className="page-title truncate">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
                    <p className="page-subtitle">
                        {loading ? 'Loading your jobs...' : activeCount > 0 ? `You have ${activeCount} active ${activeCount === 1 ? 'job' : 'jobs'}.` : 'Create a job to start making documents.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {aiSlot}
                    <button type="button" onClick={onNewJob} className="btn btn-primary hidden sm:inline-flex">
                        <PlusIcon className="h-4 w-4" /> {t.newJob || 'New job'}
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <section aria-label="Overview" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {loading ? (
                    [0, 1, 2, 3].map(i => (
                        <div key={i} className="card space-y-3 p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-12" /><Skeleton className="h-3 w-24" /></div>
                    ))
                ) : (
                    <>
                        <StatCard label="Active jobs" value={activeCount} hint={`${jobs.length} total`} icon={BriefcaseIcon} tone="bg-primary/10 text-primary" />
                        <StatCard
                            label="Jobs this month"
                            value={jobLimit ? <>{jobsThisMonth}<span className="text-base font-medium text-muted-foreground"> / {jobLimit}</span></> : jobsThisMonth}
                            hint={jobLimit ? (jobsThisMonth >= jobLimit ? <span className="font-medium text-warning">Limit reached, upgrade for more</span> : 'Free plan limit') : 'Unlimited on your plan'}
                            meter={jobLimit ? { used: jobsThisMonth, limit: jobLimit } : null}
                            icon={CalendarIcon}
                            tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            onClick={jobLimit && jobsThisMonth >= jobLimit ? onUpgrade : onOpenCalendar}
                        />
                        <StatCard
                            label="Clients"
                            value={clientLimit ? <>{clientTotal}<span className="text-base font-medium text-muted-foreground"> / {clientLimit}</span></> : clientTotal}
                            hint={unseenSigned > 0 ? <span className="font-medium text-success">{unseenSigned} new signed {unseenSigned === 1 ? 'document' : 'documents'}</span> : 'Manage contacts and portals'}
                            meter={clientLimit ? { used: clientTotal, limit: clientLimit } : null}
                            icon={UsersIcon}
                            tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            onClick={onOpenClients}
                        />
                        {lowStockCount > 0 ? (
                            <StatCard label="Low stock" value={lowStockCount} hint="Items at or below threshold" icon={BoxIcon} tone="bg-warning/15 text-warning" onClick={onOpenInventory} />
                        ) : paid ? (
                            <StatCard label="Signed by clients" value={unseenSigned} hint="New since you last checked" icon={CheckCircleIcon} tone="bg-success/10 text-success" onClick={onOpenClients} />
                        ) : (
                            <button type="button" onClick={onUpgrade} className="card flex flex-col justify-between bg-gradient-to-br from-primary/10 to-transparent p-4 text-left transition hover:border-primary/40 hover:shadow-card">
                                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><StarIcon className="h-4 w-4" /> Free plan</span>
                                <span className="mt-2 text-sm font-semibold text-foreground">Unlimited jobs, clients &amp; documents</span>
                                <span className="mt-1 text-xs font-semibold text-primary">Upgrade from $5/mo</span>
                            </button>
                        )}
                    </>
                )}
            </section>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_320px]">
                {/* Jobs */}
                <section aria-labelledby="jobs-heading" className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 id="jobs-heading" className="text-lg font-bold">{t.yourJobs || 'Your jobs'}</h2>
                        {!loading && jobs.length > 0 && <span className="text-sm text-muted-foreground">{filteredJobs.length} of {jobs.length}</span>}
                    </div>

                    {jobs.length > 0 && (
                        <div className="mb-4 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <div className="relative flex-1">
                                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="search"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search jobs, clients, addresses..."
                                        className="input pl-10"
                                        aria-label="Search jobs"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:flex">
                                    <select value={client} onChange={(e) => setClient(e.target.value)} className="input sm:w-44" aria-label="Filter by client">
                                        <option value="All">All clients</option>
                                        {clientNames.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <div className="relative">
                                        <SortIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input pl-9 sm:w-44" aria-label="Sort jobs">
                                            <option value="newest">Newest first</option>
                                            <option value="oldest">Oldest first</option>
                                            <option value="name">Name A-Z</option>
                                            <option value="start">Start date</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Filter by status">
                                {statusOptions.map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={status === opt.value}
                                        onClick={() => setStatus(opt.value)}
                                        className={`h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition ${status === opt.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {opt.label}
                                        {opt.value !== 'All' && <span className="ml-1.5 opacity-70">{jobs.filter(j => j.status === opt.value).length}</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className="card space-y-3 p-5">
                                    <div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>
                                    <Skeleton className="h-3 w-3/4" />
                                    <Skeleton className="h-6 w-20 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : jobs.length === 0 ? (
                        <EmptyState
                            icon={BriefcaseIcon}
                            title={t.noJobs || 'No jobs yet'}
                            description={t.clickNewJob}
                            action={<button type="button" className="btn btn-primary" onClick={onNewJob}><PlusIcon className="h-4 w-4" /> {t.newJob || 'New job'}</button>}
                        />
                    ) : filteredJobs.length === 0 ? (
                        <EmptyState
                            icon={SearchIcon}
                            title="No jobs match your filters"
                            description="Try a different search or clear the filters."
                            action={filtersActive ? <button type="button" className="btn btn-outline" onClick={() => { setQuery(''); setStatus('All'); setClient('All'); }}>Clear filters</button> : undefined}
                        />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                                {filteredJobs.slice(0, visible).map(job => (
                                    <JobCard
                                        key={job.id}
                                        job={job}
                                        t={t}
                                        onClick={() => onOpenJob(job.id)}
                                        onDuplicate={() => onDuplicateJob(job)}
                                        onDelete={() => onDeleteJob(job)}
                                    />
                                ))}
                            </div>
                            {filteredJobs.length > visible && (
                                <div className="mt-6 flex justify-center">
                                    <button type="button" className="btn btn-outline" onClick={() => setVisible(v => v + PAGE)}>
                                        Show more jobs ({filteredJobs.length - visible} more)
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>

                {/* Side column: recent documents + next start */}
                <aside className="space-y-4" aria-label="Recent activity">
                    <div className="card">
                        <div className="flex items-center justify-between border-b border-border px-4 py-3">
                            <h2 className="text-sm font-semibold">Recent documents</h2>
                        </div>
                        {loading ? (
                            <div className="space-y-3 p-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                        ) : recentDocs.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Documents you create will show up here.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {recentDocs.map(doc => {
                                    const meta = getDocTypeMeta(doc.type);
                                    const Icon = meta.icon;
                                    const st = (doc.data as any)?.status as string | undefined;
                                    return (
                                        <li key={doc.id}>
                                            <button type="button" onClick={() => onOpenDocument(doc)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/60">
                                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}><Icon className="h-4 w-4" /></span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium">{getDocumentTitle(doc)}</span>
                                                    <span className="block truncate text-xs text-muted-foreground">{jobNameById.get(doc.jobId) || doc.type}{doc.createdAt ? ` · ${formatShortDate(doc.createdAt)}` : ''}</span>
                                                </span>
                                                {st && <span className="badge badge-muted shrink-0">{st}</span>}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {upcoming && (
                        <button type="button" onClick={() => onOpenJob(upcoming.id)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-primary/40">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarIcon className="h-5 w-5" /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next start</span>
                                <span className="block truncate text-sm font-semibold">{upcoming.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">{formatShortDate(upcoming.startDate)} · {upcoming.clientName}</span>
                            </span>
                            <JobStatusBadge status={upcoming.status} />
                            <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                    )}
                </aside>
            </div>
        </div>
    );
};

export default DashboardScreen;
