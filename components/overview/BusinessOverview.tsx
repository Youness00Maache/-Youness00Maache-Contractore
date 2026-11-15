/**
 * Business overview (roadmap N3, competitor gap #35): "how is my business doing" at the top of the Insights screen.
 * Everything is computed on this device from the owner's documents, jobs, tasks and leads (lib/overview/*, tested by
 * scripts/overview-check.ts), so it also opens offline with the figures last loaded.
 *
 *   headline sentence + money bar + one line of figures   (billed, collected, waiting, overdue, days to get paid ...)
 *   jobs by profit        best and worst jobs, "not enough data" when a job has no revenue or no costs yet
 *   waiting on a yes      sent estimates nobody answered, oldest first, with a "Nudge" that opens the follow-up window
 *   active jobs           budget used, task progress, next date, warnings
 *   revenue by customer   tap a customer to filter everything by them
 *   filters               period, customer, project: every section follows them (waiting estimates and active jobs
 *                         show what is true today, so they ignore the period but follow customer and project)
 *   "Download this overview as CSV"
 * The "AI summary" slot (OverviewAiSlot.tsx): "Summarize with AI" (Premium + AI, the ai-assistant task business_summary).
 */
import React, { Suspense, lazy, useMemo, useState } from 'react';
import type { Client, Job, UserProfile } from '../../types.ts';
import { PROFIT_FORMULA, PROFIT_DEFINITION } from '../../lib/finance.ts';
import { useLeadsStore } from '../../lib/leads/leadsStore.ts';
import { OVERVIEW_PERIODS, isValidRange, periodLabel, periodRange, type OverviewPeriod } from '../../lib/overview/period.ts';
import { buildFacts, jobCustomerMap } from '../../lib/overview/facts.ts';
import {
    activeJobCount, customerOptions, headlineMoney, headlineSentence, jobOptions, jobProfitRows, leadKpis, overviewKpis, rankJobs, reconcileFilters,
    revenueByCustomer, setCustomerFilter, setJobFilter, type JobProfitRow, type ProfitBasis, type RankBy,
} from '../../lib/overview/overview.ts';
import { awaitingEstimates, type AwaitingEstimate } from '../../lib/overview/awaiting.ts';
import { JOB_WARNING_LABELS, activeJobRows, type ActiveJobRow } from '../../lib/overview/activeJobs.ts';
import { overviewCsv, overviewCsvFileName } from '../../lib/overview/overviewCsv.ts';
import { NO_FILTERS, isFiltering, type OverviewFilters, type OverviewJob } from '../../lib/overview/types.ts';
import { formatYMD, todayYMD } from '../../utils/localDates.ts';
import { InlineError, Segmented, money, timeAgo } from '../viewKit.tsx';
import { DownloadIcon, SendIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { useOverviewData } from './useOverviewData.ts';
import OverviewAiSlot from './OverviewAiSlot.tsx';

const FollowUpShare = lazy(() => import('../pipeline/FollowUp.tsx').then(m => ({ default: m.FollowUpShare })));

export interface BusinessOverviewProps {
    jobs: Array<Job & { clientId?: string | null }>;
    clients: Client[];
    profile: UserProfile | null;
    /** the labor rate Insights uses (time sheets are costed with it) */
    laborRate: number;
    isOnline: boolean;
    /** true when the Tasks tool is in the database (task progress and next dates show) */
    tasksReady: boolean;
    /** set when the Leads tool is ready (new leads and win rate show) */
    leadsUserId?: string | null;
    /** change it to read the data again (Insights' Refresh button) */
    refreshKey?: unknown;
    onOpenJob: (jobId: string) => void;
}

const EMPTY_DOCS: never[] = [];
/** an empty range, for an invalid custom period (shows zeros) */
const NO_DAYS = { startYMD: '0001-01-01', endYMD: '0001-01-01' };

const dollars = (n: number) => money(n, { cents: false });
const pct = (n: number) => `${Math.round(n)}%`;
const shortDate = (ymd: string) => formatYMD(ymd, { month: 'short', day: 'numeric' });
const signed = (n: number) => `${n < 0 ? '-' : ''}${dollars(Math.abs(n))}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const marginTone = (m: number | null) => (m === null ? 'text-muted-foreground' : m >= 30 ? 'text-success' : m > 0 ? 'text-warning' : 'text-destructive');

/** "5 days late" / "today" / "in 3 days" */
const whenText = (days: number) => (days === 0 ? 'today' : days > 0 ? `in ${plural(days, 'day')}` : `${plural(-days, 'day')} late`);

/** Inline bar (0..100). */
const Meter: React.FC<{ value: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; className?: string }> = ({ value, tone = 'primary', className = 'w-16' }) => (
    <span className={`inline-block h-1.5 shrink-0 overflow-hidden rounded-full bg-muted align-middle ${className}`} aria-hidden="true">
        <span className={`block h-full rounded-full ${tone === 'danger' ? 'bg-destructive' : tone === 'warning' ? 'bg-warning' : tone === 'success' ? 'bg-success' : 'bg-primary'}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
);

const SectionTitle: React.FC<{ title: string; note?: React.ReactNode; right?: React.ReactNode }> = ({ title, note, right }) => (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {right}
    </div>
);

/** One money fact of the strip: a small label over its value, divided by thin rules (not tiles). */
const Fact: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }> = ({ label, value, hint, tone = 'text-foreground' }) => (
    <div className="min-w-0 border-l-2 border-border pl-2.5">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className={`text-base font-bold tabular-nums ${tone}`}>{value}</dd>
        {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
);

/** The headline with its money amounts in bold. */
const Headline: React.FC<{ text: string }> = ({ text }) => (
    <p className="text-lg font-medium leading-snug text-foreground sm:text-xl">
        {text.split(/(\$[\d.,]+[kM]?)/).map((part, i) => (/^\$[\d.,]+[kM]?$/.test(part) ? <strong key={i} className="font-extrabold tabular-nums">{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>))}
    </p>
);

const ProfitTable: React.FC<{ title: string; note?: React.ReactNode; rows: JobProfitRow[]; empty: React.ReactNode; onOpen: (jobId: string) => void }> = ({ title, note, rows, empty, onOpen }) => (
    <div>
        <SectionTitle title={title} note={note} />
        {rows.length === 0 ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">{empty}</p>
        ) : (
            <table className="w-full table-fixed text-sm">
                <colgroup>
                    <col />
                    <col className="hidden w-24 sm:table-column" />
                    <col className="hidden w-24 sm:table-column" />
                    <col className="w-24" />
                    <col className="w-20" />
                </colgroup>
                <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="py-1.5 pr-2 text-left font-semibold">Job</th>
                        <th className="hidden px-2 py-1.5 text-right font-semibold sm:table-cell">Revenue</th>
                        <th className="hidden px-2 py-1.5 text-right font-semibold sm:table-cell">Cost</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Profit</th>
                        <th className="py-1.5 pl-2 text-right font-semibold">Margin</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.jobId} className="cursor-pointer border-t border-border/60 hover:bg-muted/50" onClick={() => onOpen(r.jobId)}>
                            <td className="py-2 pr-2">
                                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r.jobId); }} className="block w-full truncate text-left font-semibold text-foreground hover:underline" aria-label={`Open job ${r.name}`}>{r.name}</button>
                                {r.customer && <span className="block truncate text-xs text-muted-foreground">{r.customer}</span>}
                                <span className="block text-xs text-muted-foreground sm:hidden">{dollars(r.revenue)} in · {dollars(r.cost)} costs</span>
                            </td>
                            <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{dollars(r.revenue)}</td>
                            <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{dollars(r.cost)}</td>
                            <td className={`px-2 py-2 text-right font-bold tabular-nums ${r.profit < 0 ? 'text-destructive' : 'text-foreground'}`}>{signed(r.profit)}</td>
                            <td className="py-2 pl-2 text-right">
                                <span className={`font-semibold tabular-nums ${marginTone(r.margin)}`}>{r.margin === null ? '—' : pct(r.margin)}</span>
                                <span className="mt-1 block"><Meter value={r.margin ?? 0} tone={(r.margin ?? 0) >= 30 ? 'success' : (r.margin ?? 0) > 0 ? 'warning' : 'danger'} className="w-14" /></span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
    </div>
);

const ActiveJobLine: React.FC<{ r: ActiveJobRow; onOpen: (jobId: string) => void }> = ({ r, onOpen }) => {
    const used = r.usedPct;
    const usedTone = used === null ? 'primary' : used > 100 ? 'danger' : used >= 85 ? 'warning' : 'primary';
    return (
        <li className="border-t border-border/60 first:border-t-0">
            <button type="button" onClick={() => onOpen(r.jobId)} className="grid w-full gap-x-4 gap-y-1.5 px-1 py-2.5 text-left hover:bg-muted/50 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)] sm:items-center" aria-label={`Open job ${r.name}`}>
                <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-semibold text-foreground">{r.name}</span>
                        <span className={`badge ${r.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{r.status === 'active' ? 'Active' : 'Paused'}</span>
                        {r.warnings.map(w => <span key={w} className="badge badge-danger">{JOB_WARNING_LABELS[w]}</span>)}
                    </span>
                    {r.customer && <span className="block truncate text-xs text-muted-foreground">{r.customer}</span>}
                </span>
                <span className="min-w-0 text-xs text-muted-foreground">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide sm:hidden">Budget used</span>
                    {used === null ? (r.spent > 0 ? <span>No budget yet · {dollars(r.spent)} spent</span> : <span>No budget yet</span>) : (
                        <span className="flex items-center gap-2">
                            <Meter value={used} tone={usedTone} className="w-20" />
                            <span><strong className={`tabular-nums ${used > 100 ? 'text-destructive' : 'text-foreground'}`}>{pct(used)}</strong> of {dollars(r.budget)}</span>
                        </span>
                    )}
                </span>
                <span className="min-w-0 text-xs text-muted-foreground">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide sm:hidden">Tasks</span>
                    {r.tasks ? (
                        <span className="flex items-center gap-2">
                            <Meter value={r.tasks.percent} tone="success" className="w-14" />
                            <span><strong className="tabular-nums text-foreground">{r.tasks.done}/{r.tasks.total}</strong> done</span>
                        </span>
                    ) : <span>—</span>}
                </span>
                <span className="min-w-0 text-xs text-muted-foreground">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide sm:hidden">Next</span>
                    {r.next ? (
                        <span className={r.next.overdue ? 'text-destructive' : ''}>
                            <span className="block truncate text-foreground">{r.next.label}</span>
                            {shortDate(r.next.ymd)} · {whenText(r.next.days)}
                        </span>
                    ) : <span>No date set</span>}
                </span>
            </button>
        </li>
    );
};

const BusinessOverview: React.FC<BusinessOverviewProps> = ({ jobs, clients, profile, laborRate, isOnline, tasksReady, leadsUserId, refreshKey, onOpenJob }) => {
    const [period, setPeriod] = useState<OverviewPeriod>('this-month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [filters, setFilters] = useState<OverviewFilters>(NO_FILTERS);
    const [basis, setBasis] = useState<ProfitBasis>('period');
    const [rankBy, setRankBy] = useState<RankBy>('profit');
    const [nudge, setNudge] = useState<AwaitingEstimate | null>(null);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const [showAllCustomers, setShowAllCustomers] = useState(false);

    const { data, loading, error, fromDevice, reload } = useOverviewData({ withTasks: tasksReady, refreshKey, isOnline });
    const leadStore = useLeadsStore(leadsUserId ?? null, Boolean(leadsUserId), isOnline);

    const today = todayYMD();
    const docs = data?.docs ?? EMPTY_DOCS;
    const tasks = tasksReady ? data?.tasks ?? null : null;
    const jobList = useMemo<OverviewJob[]>(() => jobs.map(j => ({
        id: j.id, name: j.name, clientName: j.clientName, clientId: j.clientId ?? null, status: j.status, startDate: j.startDate, endDate: j.endDate, createdAt: j.createdAt ?? null,
    })), [jobs]);
    const jobCustomers = useMemo(() => jobCustomerMap(jobList, docs), [jobList, docs]);
    const facts = useMemo(() => buildFacts(docs, { laborRate, todayYMD: today, jobs: jobList }), [docs, laborRate, today, jobList]);

    const range = useMemo(() => periodRange(period, new Date(), { startYMD: customStart, endYMD: customEnd }), [period, customStart, customEnd, today]); // eslint-disable-line react-hooks/exhaustive-deps
    const f = useMemo(() => reconcileFilters(filters, jobList, jobCustomers), [filters, jobList, jobCustomers]);
    const filtering = isFiltering(f);
    const label = periodLabel(period, range);

    const kpis = useMemo(() => overviewKpis(facts, range ?? NO_DAYS, f), [facts, range, f]);
    const activeCount = useMemo(() => activeJobCount(jobList, jobCustomers, f), [jobList, jobCustomers, f]);
    const leads = useMemo(() => (leadStore.leads && !filtering && range ? leadKpis(leadStore.leads, range) : null), [leadStore.leads, filtering, range]);
    const profitRows = useMemo(() => jobProfitRows(facts, jobList, { range: range ?? NO_DAYS, filters: f, basis }), [facts, jobList, range, f, basis]);
    const ranking = useMemo(() => rankJobs(profitRows, rankBy, 5), [profitRows, rankBy]);
    const awaiting = useMemo(() => awaitingEstimates(docs, jobList, jobCustomers, today, f), [docs, jobList, jobCustomers, today, f]);
    const active = useMemo(() => activeJobRows(jobList, docs, tasks, jobCustomers, { todayYMD: today, laborRate, filters: f }), [jobList, docs, tasks, jobCustomers, today, laborRate, f]);
    const customers = useMemo(() => revenueByCustomer(facts, range ?? NO_DAYS, f, showAllCustomers ? 1000 : 6), [facts, range, f, showAllCustomers]);
    const customerChoices = useMemo(() => customerOptions(jobList, docs, jobCustomers), [jobList, docs, jobCustomers]);
    const jobChoices = useMemo(() => jobOptions(jobList, jobCustomers, f.customerKey), [jobList, jobCustomers, f.customerKey]);

    const headline = range ? headlineSentence(label, kpis, headlineMoney) : 'Choose the first and the last day to see your numbers.';
    const settled = Math.max(0, kpis.billed - kpis.outstanding);
    const barTotal = Math.max(kpis.billed, 1);
    const customerName = f.customerKey ? customerChoices.find(c => c.key === f.customerKey)?.name ?? '' : '';
    const projectName = f.jobId ? jobList.find(j => j.id === f.jobId)?.name ?? '' : '';
    const hasAnything = docs.length > 0 || jobList.length > 0;

    const exportCsv = async () => {
        setExporting(true);
        setExportError('');
        try {
            const { downloadCsv } = await import('../../lib/export/bookkeeperApi.ts');
            const csv = overviewCsv({
                label, range, customerFilter: customerName, projectFilter: projectName, profitBasis: basis, rankBy, kpis, leads, activeJobCount: activeCount,
                profitRows, awaiting, activeJobs: active, customers: revenueByCustomer(facts, range ?? NO_DAYS, f, 100000).rows,
            });
            downloadCsv(csv, overviewCsvFileName(range));
        } catch {
            setExportError('The file could not be made. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const nudgeJob = nudge?.jobId ? jobs.find(j => j.id === nudge.jobId) : undefined;
    const rangeOk = period !== 'custom' || isValidRange({ startYMD: customStart, endYMD: customEnd });
    const aiProps = {
        periodLabel: label, startYMD: range?.startYMD ?? null, endYMD: range?.endYMD ?? null, headline, kpis, leads, activeJobs: activeCount,
        topJobs: ranking.top, bottomJobs: ranking.bottom, awaiting, customers: customers.rows, customerFilter: customerName, projectFilter: projectName, isOnline, onOpenJob,
    };

    return (
        <section className="card mb-5 p-4 sm:p-6" aria-labelledby="overview-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="overview-title" className="text-base font-bold text-foreground">Business overview</h2>
                    <p className="text-xs text-muted-foreground">
                        {fromDevice && data ? `Last loaded ${timeAgo(new Date(data.loadedAt).toISOString()) || 'earlier'}${isOnline ? '' : ' · you are offline'}` : loading ? 'Updating…' : 'Up to date'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} disabled={exporting || !hasAnything}>
                        <DownloadIcon className="h-3.5 w-3.5" /> {exporting ? 'Making file…' : 'Download this overview as CSV'}
                    </button>
                    <HelpButton topic="business-overview" iconOnly />
                </div>
            </div>
            {exportError && <p className="mt-2 text-xs text-destructive" role="alert">{exportError}</p>}

            {/* filters */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                <div className="sm:w-40">
                    <label htmlFor="ov-period" className="label">Period</label>
                    <select
                        id="ov-period"
                        className="input py-2"
                        value={period}
                        onChange={(e) => {
                            const next = e.target.value as OverviewPeriod;
                            // custom dates start from the days that were showing
                            if (next === 'custom' && !customStart && !customEnd && range) { setCustomStart(range.startYMD); setCustomEnd(range.endYMD); }
                            setPeriod(next);
                        }}
                    >
                        {OVERVIEW_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </div>
                {period === 'custom' && (
                    <>
                        <div>
                            <label htmlFor="ov-from" className="label">From</label>
                            <input id="ov-from" type="date" className="input py-2" value={customStart} max={customEnd || undefined} onChange={(e) => setCustomStart(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="ov-to" className="label">To</label>
                            <input id="ov-to" type="date" className="input py-2" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)} />
                        </div>
                    </>
                )}
                <div className="sm:w-48">
                    <label htmlFor="ov-customer" className="label">Customer</label>
                    <select id="ov-customer" className="input py-2" value={f.customerKey ?? ''} onChange={(e) => setFilters(setCustomerFilter(f, e.target.value || null, jobCustomers))}>
                        <option value="">All customers</option>
                        {customerChoices.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                    </select>
                </div>
                <div className="sm:w-52">
                    <label htmlFor="ov-job" className="label">Project</label>
                    <select id="ov-job" className="input py-2" value={f.jobId ?? ''} onChange={(e) => setFilters(setJobFilter(f, e.target.value || null, jobCustomers))}>
                        <option value="">All projects</option>
                        {jobChoices.map(j => <option key={j.id} value={j.id}>{j.name}{j.status && j.status !== 'active' ? ` (${j.status})` : ''}</option>)}
                    </select>
                </div>
                {filtering && <button type="button" className="btn btn-ghost btn-sm col-span-2 sm:col-span-1" onClick={() => setFilters(NO_FILTERS)}>Show everything</button>}
            </div>
            {!rangeOk && <p className="mt-2 text-xs text-destructive" role="alert">{customStart && customEnd ? 'Choose a start date that is on or before the end date.' : 'Pick the first and the last day.'}</p>}
            {error && <div className="mt-3"><InlineError onRetry={() => void reload()}>{error}</InlineError></div>}

            {!data && loading ? (
                <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading">
                    <div className="skeleton h-6 w-3/4" />
                    <div className="skeleton h-2.5 w-full" />
                    <div className="skeleton h-10 w-full" />
                </div>
            ) : !hasAnything ? (
                <p className="mt-4 rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">Create a job and send an invoice, and your numbers will show up here.</p>
            ) : (
                <div className="mt-4 space-y-5">
                    {/* headline, money bar, figures */}
                    <div>
                        <Headline text={headline} />
                        {kpis.billed > 0 && (
                            <div className="mt-3" role="img" aria-label={`Of ${dollars(kpis.billed)} billed: ${dollars(settled)} paid, ${dollars(kpis.outstanding - kpis.overdue)} waiting, ${dollars(kpis.overdue)} overdue`}>
                                <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-muted">
                                    <span className="bg-success" style={{ width: `${(settled / barTotal) * 100}%` }} />
                                    <span className="bg-warning" style={{ width: `${(Math.max(0, kpis.outstanding - kpis.overdue) / barTotal) * 100}%` }} />
                                    <span className="bg-destructive" style={{ width: `${(kpis.overdue / barTotal) * 100}%` }} />
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">Of what you billed: paid · waiting · overdue</p>
                            </div>
                        )}
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 min-[420px]:grid-cols-3 sm:flex sm:flex-wrap sm:gap-x-6">
                            <Fact label="Billed" value={dollars(kpis.billed)} hint={plural(kpis.invoiceCount, 'invoice')} />
                            <Fact label="Collected" value={dollars(kpis.collected)} />
                            <Fact label="Waiting" value={dollars(kpis.outstanding)} hint={kpis.outstandingCount ? `${plural(kpis.outstandingCount, 'open invoice')}` : 'nothing open'} />
                            <Fact label="Overdue" value={dollars(kpis.overdue)} tone={kpis.overdue > 0 ? 'text-destructive' : 'text-foreground'} hint={kpis.overdueCount ? plural(kpis.overdueCount, 'invoice') : 'none'} />
                            <Fact label="Days to get paid" value={kpis.avgDaysToPaid === null ? '—' : `${Math.round(kpis.avgDaysToPaid)}`} hint={kpis.avgDaysToPaid === null ? 'no paid invoices yet' : `avg of ${plural(kpis.paidSample, 'paid invoice')}`} />
                            <Fact label="Profit" value={signed(kpis.profit)} tone={kpis.profit < 0 ? 'text-destructive' : 'text-foreground'} hint={`${dollars(kpis.costs)} costs`} />
                            <Fact label="Active jobs" value={activeCount} />
                            {leads && <Fact label="New leads" value={leads.newLeads} hint={leads.winRate === null ? 'none decided yet' : `${pct(leads.winRate * 100)} won`} />}
                        </dl>
                        <OverviewAiSlot {...aiProps} />
                    </div>

                    {/* jobs by profit */}
                    <div className="border-t border-border pt-4">
                        <SectionTitle
                            title="Jobs by profit"
                            note={basis === 'period' ? 'Money in and costs dated in this period, per job.' : 'Everything a job ever billed and cost, like Job financials.'}
                            right={(
                                <div className="flex flex-wrap items-center gap-2">
                                    <Segmented<ProfitBasis> size="sm" ariaLabel="What to count" value={basis} onChange={setBasis} options={[{ value: 'period', label: 'This period' }, { value: 'job', label: 'Whole job' }]} />
                                    <Segmented<RankBy> size="sm" ariaLabel="Rank by" value={rankBy} onChange={setRankBy} options={[{ value: 'profit', label: 'By profit' }, { value: 'margin', label: 'By margin' }]} />
                                </div>
                            )}
                        />
                        <div className="space-y-5">
                            <ProfitTable
                                title="Most profitable" rows={ranking.top} onOpen={onOpenJob}
                                empty="No job has both income and costs in this period yet, so there is nothing to rank."
                            />
                            {ranking.ranked > 0 && (
                                <ProfitTable
                                    title="Least profitable" rows={ranking.bottom} onOpen={onOpenJob}
                                    empty={ranking.ranked <= ranking.top.length ? `Only ${plural(ranking.ranked, 'job')} ${ranking.ranked === 1 ? 'has' : 'have'} income and costs, and ${ranking.ranked === 1 ? 'it is' : 'they are'} listed above.` : 'Nothing else to show.'}
                                />
                            )}
                        </div>
                        {ranking.notEnough.length > 0 && (
                            <details className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                                <summary className="cursor-pointer select-none text-muted-foreground">
                                    <strong className="text-foreground">{plural(ranking.notEnough.length, 'job')}</strong> without enough data to rank (no income or no costs yet)
                                </summary>
                                <ul className="mt-2 divide-y divide-border/60">
                                    {ranking.notEnough.map(r => (
                                        <li key={r.jobId}>
                                            <button type="button" onClick={() => onOpenJob(r.jobId)} className="flex w-full items-baseline justify-between gap-3 py-1.5 text-left hover:text-primary">
                                                <span className="min-w-0 truncate font-medium">{r.name}</span>
                                                <span className="shrink-0 text-xs text-muted-foreground">Not enough data · {r.note.toLowerCase()}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>

                    {/* estimates waiting */}
                    <div className="border-t border-border pt-4">
                        <SectionTitle
                            title="Waiting on a yes"
                            note={awaiting.count ? <><strong className="text-foreground tabular-nums">{dollars(awaiting.total)}</strong> in {plural(awaiting.count, 'estimate')} sent and not answered, longest wait first. Shows today, whatever period is chosen.</> : 'Estimates you sent that the client has not accepted or declined.'}
                        />
                        {awaiting.rows.length === 0 ? (
                            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">No sent estimate is waiting for an answer.</p>
                        ) : (
                            <ul>
                                {awaiting.rows.map(a => (
                                    <li key={a.id} className="flex items-center gap-3 border-t border-border/60 py-2 first:border-t-0">
                                        <button type="button" disabled={!a.jobId} onClick={() => a.jobId && onOpenJob(a.jobId)} className="min-w-0 flex-1 text-left">
                                            <span className="block truncate font-semibold text-foreground">{a.customer || a.jobName || 'Estimate'}</span>
                                            <span className="block break-words text-xs text-muted-foreground">{[a.number, a.jobName && a.jobName !== a.customer ? a.jobName : '', a.expired ? 'expired' : ''].filter(Boolean).join(' · ')}</span>
                                        </button>
                                        <span className="shrink-0 text-right">
                                            <span className="block font-bold tabular-nums text-foreground">{dollars(a.amount)}</span>
                                            <span className={`block text-xs tabular-nums ${a.stale ? 'font-semibold text-warning' : 'text-muted-foreground'}`}>
                                                {a.daysWaiting === null ? 'date unknown' : a.daysWaiting === 0 ? 'sent today' : `${plural(a.daysWaiting, 'day')} waiting`}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-outline btn-sm shrink-0"
                                            disabled={!isOnline || !profile}
                                            title={isOnline ? 'Send a follow-up for this estimate' : 'Reconnect to send a follow-up'}
                                            onClick={() => setNudge(a)}
                                        >
                                            <SendIcon className="h-3.5 w-3.5" /> Nudge
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* active jobs */}
                    <div className="border-t border-border pt-4">
                        <SectionTitle title="Active jobs" note="Budget used is what you spent or ordered against the accepted estimates. Shows today, whatever period is chosen." />
                        {active.length === 0 ? (
                            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">No active jobs{filtering ? ' for this customer or project' : ''}.</p>
                        ) : (
                            <>
                                <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)] gap-x-4 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                                    <span>Job</span><span>Budget used</span><span>Tasks</span><span>Next date</span>
                                </div>
                                <ul>{active.map(r => <ActiveJobLine key={r.jobId} r={r} onOpen={onOpenJob} />)}</ul>
                            </>
                        )}
                    </div>

                    {/* revenue by customer */}
                    <div className="border-t border-border pt-4">
                        <SectionTitle title="Revenue by customer" note="Income in this period (invoices and loose receipts), biggest first. Tap a customer to see only them." />
                        {customers.rows.length === 0 ? (
                            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">No invoices in this period.</p>
                        ) : (
                            <ol className="space-y-2">
                                {customers.rows.map(c => {
                                    const top = customers.rows[0].revenue || 1;
                                    return (
                                        <li key={c.key || 'none'}>
                                            <button type="button" disabled={!c.key} onClick={() => c.key && setFilters(setCustomerFilter(f, c.key, jobCustomers))} className="block w-full rounded-lg px-1 py-1 text-left hover:bg-muted/50 disabled:hover:bg-transparent">
                                                <span className="flex items-baseline justify-between gap-3 text-sm">
                                                    <span className="min-w-0 truncate font-medium text-foreground">{c.name || 'No customer name'}</span>
                                                    <span className="shrink-0 font-bold tabular-nums">{dollars(c.revenue)}</span>
                                                </span>
                                                <span className="mt-1 flex items-center gap-2">
                                                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(c.revenue / top) * 100}%` }} /></span>
                                                    <span className="shrink-0 text-[11px] text-muted-foreground">{dollars(c.collected)} collected{c.outstanding > 0 ? ` · ${dollars(c.outstanding)} waiting` : ''}</span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        {(customers.totalCustomers > 6 || showAllCustomers) && (
                            <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => setShowAllCustomers(v => !v)}>
                                {showAllCustomers ? 'Show the top 6 only' : `Show all ${customers.totalCustomers} customers`}
                            </button>
                        )}
                    </div>

                    <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                        <strong className="font-semibold text-foreground">{PROFIT_FORMULA}.</strong> {PROFIT_DEFINITION} Billed counts invoices on their issue date, days to get paid counts invoices paid in the period, and a job needs both income and costs to be ranked.{data?.truncated ? ' Only your newest 50,000 documents are read.' : ''}
                    </p>
                </div>
            )}

            {nudge && (
                <Suspense fallback={null}>
                    {profile && <FollowUpShare doc={nudge.doc} job={nudgeJob} profile={profile} clients={clients} onClose={() => setNudge(null)} />}
                </Suspense>
            )}
        </section>
    );
};

export default BusinessOverview;
