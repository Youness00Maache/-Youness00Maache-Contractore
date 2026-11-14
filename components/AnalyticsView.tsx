import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import type { FormData as FormDataType, Job } from '../types.ts';
import { AwardIcon, BarChartIcon, BriefcaseIcon, ClockIcon, CreditCardIcon, PieChartIcon, RefreshCwIcon, TrendingUpIcon, ReceiptIcon } from './Icons.tsx';
import { EmptyState, InlineError, PageHeader, StatCard, fetchAllPages, friendlyError, getCurrentUserId, money, useIsMobile } from './viewKit.tsx';
import { computeAnalytics, presetRange, previousRange, relativeChange, type AnalyticsDoc, type AnalyticsResult, type Bucket, type RangePreset } from '../utils/analyticsMath.ts';
import { formatYMD } from '../utils/localDates.ts';
import { COLLECTED_DEFINITION, PROFIT_DEFINITION, PROFIT_FORMULA, resolveLaborRate } from '../lib/finance.ts';
import { OPTION_SELECT_PATHS } from '../lib/estimateOptions.ts';

interface AnalyticsViewProps {
  jobs?: Job[];
  /** @deprecated ignored: list stubs have no line items; the view loads full document data itself (VIEW-033) */
  forms?: FormDataType[];
  /** Profile labor rate (time sheets are costed with it, like Job financials). */
  defaultLaborRate?: number;
  onBack: () => void;
}

// JSON-path select: only the fields the math needs (no signatures, logos or notes are downloaded).
const DOC_SELECT = [
  'id', 'type', 'job_id', 'created_at',
  'status:data->>status', 'issueDate:data->>issueDate', 'date:data->>date', 'dueDate:data->>dueDate', 'clientName:data->>clientName',
  'lineItems:data->lineItems', 'taxRate:data->taxRate', 'discount:data->discount', 'shipping:data->shipping',
  'isProgressBilling:data->isProgressBilling', 'amountPaid:data->amountPaid', 'amount:data->amount', 'tax:data->tax',
  'items:data->items', 'materials:data->materials', 'hoursWorked:data->hoursWorked', 'overtimeHours:data->overtimeHours',
  'invoiceNumber:data->>invoiceNumber', 'invoiceId:data->>invoiceId', 'description:data->>description', 'title:data->>title',
  // good/better/best options: an estimate is worth the option that counts (lib/estimateOptions.ts)
  'clientSignedAt:data->>clientSignedAt', ...OPTION_SELECT_PATHS,
].join(',');
// Same documents as Job financials, so income, collected, costs and profit follow one definition (lib/finance.ts).
const DOC_TYPES = ['Invoice', 'Estimate', 'Expense Log', 'Receipt', 'Material Log', 'Time Sheet'];
const JOB_STATUSES = ['active', 'paused', 'completed', 'inactive'] as const;

type PresetKey = RangePreset | 'custom';
const PRESETS: { value: PresetKey; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'last-90', label: 'Last 90 days' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
];

/** Chart colors: validated categorical slots 1 and 2 (light and dark steps), status colors for invoice states. */
const VIZ_CSS = `
.cd-viz { --viz-revenue: #2a78d6; --viz-expense: #eb6834; --viz-good: #0ca30c; --viz-critical: #d03b3b; --viz-neutral: #a3a29d; --viz-faint: #d6d5d0; }
.dark .cd-viz { --viz-revenue: #3987e5; --viz-expense: #d95926; --viz-neutral: #6b6a66; --viz-faint: #3a3a37; }
`;

const niceCeil = (v: number) => {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
};

const axisMoney = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k`;
  return `$${Math.round(v)}`;
};

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

const Delta: React.FC<{ current: number; previous: number; goodWhenUp?: boolean; label: string }> = ({ current, previous, goodWhenUp = true, label }) => {
  const change = relativeChange(current, previous);
  if (change === null || !Number.isFinite(change)) return <span>No data for the previous {label}</span>;
  if (Math.abs(change) < 0.005) return <span>Same as the previous {label}</span>;
  const up = change > 0;
  const good = up === goodWhenUp;
  return (
    <span className={good ? 'text-success' : 'text-destructive'}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(change * 100))}% <span className="text-muted-foreground">vs previous {label}</span>
    </span>
  );
};

// ------------------------------------------------------------------------------------------------
// Revenue vs expenses chart (CSS bars, hover/tap tooltip, table alternative)
// ------------------------------------------------------------------------------------------------
const TrendChart: React.FC<{ buckets: Bucket[]; granularity: AnalyticsResult['granularity'] }> = ({ buckets, granularity }) => {
  const isMobile = useIsMobile();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = niceCeil(Math.max(0, ...buckets.map((b) => Math.max(b.revenue, b.expenses))));
  const totalRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
  const totalExpenses = buckets.reduce((s, b) => s + b.expenses, 0);
  const labelEvery = Math.max(1, Math.ceil(buckets.length / (isMobile ? 6 : 12)));
  const empty = totalRevenue === 0 && totalExpenses === 0;
  const periodWord = granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week of' : 'Month';

  return (
    <div className="card card-pad cd-viz">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Collected vs costs</h2>
          <p className="text-xs text-muted-foreground">Money collected and costs (materials, expenses, labor) per {granularity}.</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--viz-revenue)' }} />Collected <strong className="tabular-nums text-foreground">{money(totalRevenue, { cents: false })}</strong></span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--viz-expense)' }} />Costs <strong className="tabular-nums text-foreground">{money(totalExpenses, { cents: false })}</strong></span>
          <button type="button" className="btn btn-ghost btn-sm h-9" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>{asTable ? 'Chart' : 'Table'}</button>
        </div>
      </div>

      {empty ? (
        <EmptyState compact icon={<BarChartIcon />} title="Nothing to chart yet" description="Payments, receipts and job costs dated in this period will show up here." />
      ) : asTable ? (
        <div className="max-h-80 overflow-y-auto">
          <table className="table-clean">
            <thead><tr><th>{periodWord}</th><th className="text-right">Collected</th><th className="text-right">Costs</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.key}>
                  <td>{b.startYMD === b.endYMD || granularity !== 'week' ? b.label : `${formatYMD(b.startYMD, { month: 'short', day: 'numeric' })} – ${formatYMD(b.endYMD, { month: 'short', day: 'numeric' })}`}</td>
                  <td className="text-right tabular-nums">{money(b.revenue)}</td>
                  <td className="text-right tabular-nums">{money(b.expenses)}</td>
                  <td className={`text-right font-semibold tabular-nums ${b.revenue - b.expenses < 0 ? 'text-destructive' : ''}`}>{money(b.revenue - b.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative pl-10" onMouseLeave={() => setActive(null)}>
          {/* grid + y axis */}
          <div className="pointer-events-none absolute bottom-6 left-0 right-0 top-0">
            {[1, 0.5, 0].map((f) => (
              <div key={f} className="absolute left-0 right-0 flex items-center" style={{ bottom: `${f * 100}%`, transform: 'translateY(50%)' }}>
                <span className="w-10 pr-2 text-right text-[10px] tabular-nums text-muted-foreground">{axisMoney(max * f)}</span>
                <span className={`h-px flex-1 ${f === 0 ? 'bg-border' : 'bg-border/50'}`} />
              </div>
            ))}
          </div>
          <div className="relative flex h-56 items-stretch sm:h-64" style={{ gap: buckets.length > 40 ? 1 : 3 }}>
            {buckets.map((b, i) => {
              const rh = (b.revenue / max) * 100;
              const eh = (b.expenses / max) * 100;
              const show = active === i;
              return (
                <button
                  key={b.key}
                  type="button"
                  className="group relative flex min-w-0 flex-1 flex-col justify-end pb-6 outline-none"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive((a) => (a === i ? null : i))}
                  aria-label={`${b.label}: collected ${money(b.revenue)}, costs ${money(b.expenses)}`}
                >
                  <div className={`flex h-full items-end justify-center gap-[2px] rounded-sm ${show ? 'bg-muted/60' : ''}`}>
                    <span className="w-1/2 max-w-[18px] rounded-t-[4px]" style={{ height: `${rh}%`, minHeight: b.revenue > 0 ? 2 : 0, background: 'var(--viz-revenue)' }} />
                    <span className="w-1/2 max-w-[18px] rounded-t-[4px]" style={{ height: `${eh}%`, minHeight: b.expenses > 0 ? 2 : 0, background: 'var(--viz-expense)' }} />
                  </div>
                  <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground ${i % labelEvery === 0 ? '' : 'invisible'}`}>{b.label}</span>
                  {show && (
                    <span
                      role="tooltip"
                      className={`pointer-events-none absolute bottom-full z-10 mb-1 w-44 rounded-xl border border-border bg-popover p-3 text-left text-xs text-popover-foreground shadow-lift ${i < buckets.length / 2 ? 'left-0' : 'right-0'}`}
                    >
                      <span className="mb-1 block font-semibold text-foreground">{granularity === 'week' && b.startYMD !== b.endYMD ? `${formatYMD(b.startYMD, { month: 'short', day: 'numeric' })} – ${formatYMD(b.endYMD, { month: 'short', day: 'numeric' })}` : granularity === 'day' ? formatYMD(b.startYMD) : b.label}</span>
                      <span className="flex justify-between gap-2"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'var(--viz-revenue)' }} />Collected</span><span className="tabular-nums">{money(b.revenue)}</span></span>
                      <span className="flex justify-between gap-2"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'var(--viz-expense)' }} />Costs</span><span className="tabular-nums">{money(b.expenses)}</span></span>
                      <span className="mt-1 flex justify-between gap-2 border-t border-border pt-1 font-semibold"><span>Net</span><span className="tabular-nums">{money(b.revenue - b.expenses)}</span></span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------------------------

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ jobs = [], defaultLaborRate, onBack }) => {
  const laborRate = useMemo(() => resolveLaborRate(defaultLaborRate), [defaultLaborRate]);
  const [preset, setPreset] = useState<PresetKey>('this-month');
  const initial = presetRange('this-month');
  const [startYMD, setStartYMD] = useState(initial.startYMD);
  const [endYMD, setEndYMD] = useState(initial.endYMD);
  const [docs, setDocs] = useState<AnalyticsDoc[]>([]);
  const [jobCounts, setJobCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const uid = await getCurrentUserId();
    const run = (select: string) => fetchAllPages<any>((from, to) => {
      let q = supabase.from('documents').select(select).in('type', DOC_TYPES).order('created_at', { ascending: false }).range(from, to);
      if (uid) q = q.eq('user_id', uid);
      return q;
    });
    let res = await run(DOC_SELECT);
    let mapRow = (r: any): AnalyticsDoc => ({ ...r, createdAt: r.created_at, jobId: r.job_id });
    if (res.error) {
      // Fallback for servers that reject JSON-path selects: download `data` and pick the fields locally.
      res = await run('id,type,job_id,created_at,data');
      mapRow = (r: any) => {
        const d = r.data || {};
        return {
          id: r.id, type: r.type, createdAt: r.created_at, jobId: r.job_id, status: d.status, issueDate: d.issueDate, date: d.date, dueDate: d.dueDate,
          clientName: d.clientName, lineItems: d.lineItems, taxRate: d.taxRate, discount: d.discount, shipping: d.shipping,
          isProgressBilling: d.isProgressBilling, amountPaid: d.amountPaid, amount: d.amount, tax: d.tax,
          items: d.items, materials: d.materials, hoursWorked: d.hoursWorked, overtimeHours: d.overtimeHours,
          invoiceNumber: d.invoiceNumber, invoiceId: d.invoiceId, description: d.description, title: d.title,
          clientSignedAt: d.clientSignedAt, estimateOptions: d.estimateOptions, clientOptionChoice: d.clientOptionChoice, clientSignedBy: d.clientSignedBy,
        };
      };
    }
    if (res.error) {
      setError(friendlyError(res.error, 'Could not load your documents.'));
    } else {
      setDocs(res.rows.map(mapRow));
      setTruncated(res.truncated);
    }

    const counts = await Promise.all(JOB_STATUSES.map(async (s) => {
      let q = supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', s);
      if (uid) q = q.eq('user_id', uid);
      const { count, error: e } = await q;
      return e ? null : [s, count || 0] as const;
    }));
    if (counts.every(Boolean)) setJobCounts(Object.fromEntries(counts as (readonly [string, number])[]));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const choosePreset = (p: PresetKey) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = presetRange(p);
      setStartYMD(r.startYMD);
      setEndYMD(r.endYMD);
    }
  };

  const rangeValid = !!startYMD && !!endYMD && startYMD <= endYMD;
  const current = useMemo(() => computeAnalytics(docs, startYMD, endYMD, { laborRate }), [docs, startYMD, endYMD, laborRate]);
  const prev = useMemo(() => {
    const r = previousRange(startYMD, endYMD);
    return r ? computeAnalytics(docs, r.startYMD, r.endYMD, { laborRate }) : null;
  }, [docs, startYMD, endYMD, laborRate]);
  const periodLabel = 'period';

  const fallbackJobCounts = useMemo(() => {
    const c: Record<string, number> = { active: 0, paused: 0, completed: 0, inactive: 0 };
    for (const j of jobs) if (j.status in c) c[j.status] += 1;
    return c;
  }, [jobs]);
  const jc = jobCounts ?? fallbackJobCounts;
  const jobTotal = Object.values(jc).reduce((a, b) => a + b, 0);

  const statusOrder: { key: string; label: string; color: string }[] = [
    { key: 'Paid', label: 'Paid', color: 'var(--viz-good)' },
    { key: 'Sent', label: 'Sent', color: 'var(--viz-revenue)' },
    { key: 'Overdue', label: 'Overdue', color: 'var(--viz-critical)' },
    { key: 'Draft', label: 'Draft', color: 'var(--viz-neutral)' },
    { key: 'Cancelled', label: 'Cancelled', color: 'var(--viz-faint)' },
  ];
  const statusTotal = statusOrder.reduce((s, x) => s + (current.invoiceStatusCounts[x.key] || 0), 0);
  const topMax = Math.max(1, ...current.topClients.map((c) => c.invoiced));
  const hasAnyDocs = docs.length > 0;

  return (
    <div className="page">
      <style>{VIZ_CSS}</style>
      <PageHeader
        onBack={onBack}
        icon={<TrendingUpIcon className="h-7 w-7" />}
        title="Insights"
        subtitle="Collected, costs, profit and win rate, calculated from your invoices, receipts, estimates and job cost documents."
        actions={<button type="button" className="btn btn-outline" onClick={load} disabled={loading}><RefreshCwIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>}
      />

      <div className="card mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:p-4">
        <div className="sm:w-48">
          <label htmlFor="an-preset" className="label">Period</label>
          <select id="an-preset" className="input" value={preset} onChange={(e) => choosePreset(e.target.value as PresetKey)}>
            {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:flex sm:flex-none">
          <div>
            <label htmlFor="an-start" className="label">From</label>
            <input id="an-start" type="date" className="input" value={startYMD} max={endYMD || undefined} onChange={(e) => { setPreset('custom'); setStartYMD(e.target.value); }} />
          </div>
          <div>
            <label htmlFor="an-end" className="label">To</label>
            <input id="an-end" type="date" className="input" value={endYMD} min={startYMD || undefined} onChange={(e) => { setPreset('custom'); setEndYMD(e.target.value); }} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground sm:ml-auto sm:max-w-xs sm:text-right">Documents count on their issue date (expenses on their date), in your local time.</p>
      </div>

      {!rangeValid && <div className="mb-4"><InlineError>Choose a start date that is on or before the end date.</InlineError></div>}
      {error && <div className="mb-4"><InlineError onRetry={load}>{error}</InlineError></div>}
      {truncated && <p className="mb-4 text-xs text-muted-foreground">Showing your most recent 50,000 documents.</p>}

      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card space-y-3 p-4"><div className="skeleton h-3 w-1/2" /><div className="skeleton h-7 w-2/3" /><div className="skeleton h-3 w-3/4" /></div>)}</div>
          <div className="card p-4"><div className="skeleton h-64 w-full" /></div>
        </div>
      ) : !hasAnyDocs && !error ? (
        <EmptyState icon={<BarChartIcon />} title="No financial documents yet" description="Create invoices, receipts, estimates and expense logs on your jobs, and your revenue, costs and win rate will appear here." action={<button type="button" className="btn btn-primary" onClick={onBack}>Go to jobs</button>} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Revenue collected" icon={<CreditCardIcon />} tone="primary" value={money(current.revenue, { cents: false })} hint={prev ? <Delta current={current.revenue} previous={prev.revenue} label={periodLabel} /> : undefined} />
            <StatCard label="Outstanding" icon={<ClockIcon />} tone={current.overdue > 0 ? 'danger' : 'warning'} value={money(current.outstanding, { cents: false })} hint={current.overdueCount ? <span className="text-destructive">{money(current.overdue, { cents: false })} overdue · {current.overdueCount} invoice{current.overdueCount === 1 ? '' : 's'}</span> : `${current.outstandingCount} open invoice${current.outstandingCount === 1 ? '' : 's'}`} />
            <StatCard label="Costs" icon={<ReceiptIcon />} value={money(current.costs, { cents: false })} hint={`Materials ${money(current.materials, { cents: false })} · Expenses ${money(current.expenses, { cents: false })} · Labor ${money(current.labor, { cents: false })}`} />
            <StatCard label="Profit" icon={<TrendingUpIcon />} tone={current.profit < 0 ? 'danger' : 'success'} value={<span className={current.profit < 0 ? 'text-destructive' : ''}>{money(current.profit, { cents: false })}</span>} hint={`${PROFIT_FORMULA.replace('Profit = ', '')}${current.profitMargin === null ? '' : ` · ${pct(current.profitMargin)} margin`}`} />
            <StatCard label="Average invoice" icon={<BarChartIcon />} value={money(current.avgInvoice, { cents: false })} hint={`${current.invoiceCount} invoice${current.invoiceCount === 1 ? '' : 's'} · ${money(current.invoiced, { cents: false })} billed`} />
            <StatCard label="Estimate win rate" icon={<PieChartIcon />} value={pct(current.winRate)} hint={current.estimatesSent ? `${current.estimatesAccepted} of ${current.estimatesSent} accepted · ${money(current.pipeline, { cents: false })} pending` : 'No estimates sent in this period'} />
          </div>

          <TrendChart buckets={current.buckets} granularity={current.granularity} />

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card card-pad cd-viz">
              <h2 className="mb-1 text-base font-semibold text-foreground">Invoices by status</h2>
              <p className="mb-4 text-xs text-muted-foreground">{statusTotal} invoice{statusTotal === 1 ? '' : 's'} issued in this period.</p>
              {statusTotal === 0 ? (
                <EmptyState compact icon={<CreditCardIcon />} title="No invoices in this period" />
              ) : (
                <>
                  <div className="mb-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={statusOrder.map((s) => `${s.label} ${current.invoiceStatusCounts[s.key] || 0}`).join(', ')}>
                    {statusOrder.filter((s) => current.invoiceStatusCounts[s.key]).map((s) => (
                      <span key={s.key} style={{ width: `${((current.invoiceStatusCounts[s.key] || 0) / statusTotal) * 100}%`, background: s.color }} />
                    ))}
                  </div>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    {statusOrder.map((s) => (
                      <li key={s.key} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
                        <span className="font-semibold tabular-nums text-foreground">{current.invoiceStatusCounts[s.key] || 0}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="card card-pad cd-viz">
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-foreground"><AwardIcon className="h-4 w-4 text-primary" /> Top clients</h2>
              <p className="mb-4 text-xs text-muted-foreground">By amount invoiced in this period.</p>
              {current.topClients.length === 0 ? (
                <EmptyState compact icon={<AwardIcon />} title="No client invoices yet" description="Invoices with a client name appear here." />
              ) : (
                <ol className="space-y-3">
                  {current.topClients.map((c, i) => (
                    <li key={c.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate"><span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span><span className="font-medium text-foreground">{c.name}</span></span>
                        <span className="shrink-0 font-semibold tabular-nums">{money(c.invoiced, { cents: false })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(c.invoiced / topMax) * 100}%`, background: 'var(--viz-revenue)' }} /></div>
                        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{c.invoices} invoice{c.invoices === 1 ? '' : 's'}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="card card-pad">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground"><BriefcaseIcon className="h-4 w-4 text-primary" /> Jobs</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['active', 'Active', 'badge-success'], ['paused', 'Paused', 'badge-warning'], ['completed', 'Completed', 'badge-primary'], ['inactive', 'Inactive', 'badge-muted']] as const).map(([k, label, badge]) => (
                <div key={k} className="rounded-xl bg-muted/50 p-3">
                  <span className={`badge ${badge}`}>{label}</span>
                  <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">{jc[k] || 0}</div>
                  <div className="text-xs text-muted-foreground">{jobTotal ? `${Math.round(((jc[k] || 0) / jobTotal) * 100)}% of all jobs` : 'No jobs yet'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p><strong className="font-semibold text-foreground">{PROFIT_FORMULA}.</strong> {PROFIT_DEFINITION} Labor is priced at {money(laborRate)}/h (your default labor rate, else the last rate used in Job financials on this device).</p>
            <p>{COLLECTED_DEFINITION} Invoices count on their issue date, other documents on their date. Outstanding is the balance still due on sent and overdue invoices. Totals use the same math as your PDFs.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsView;
