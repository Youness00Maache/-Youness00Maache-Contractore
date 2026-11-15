/**
 * Business overview (N3): the numbers of the top of the Insights screen. Everything here adds up the dated facts of
 * lib/overview/facts.ts (money documents) for a day range and the customer / project filters; nothing is stored.
 *
 *   overviewKpis        billed, collected, outstanding, overdue, average days to get paid, costs, profit
 *   leadKpis            new leads and win rate of the Leads tool (only when it is ready)
 *   activeJobCount      jobs with status Active
 *   jobProfitRows       revenue / cost / profit / margin per job, with the data-sufficiency rule
 *   rankJobs            top 5 / bottom 5 / "not enough data"
 *   revenueByCustomer   who the money comes from
 *   headlineSentence    "March: $24.1k billed, $18.3k collected, $5.8k waiting"
 *   customerOptions / jobOptions / setCustomerFilter / setJobFilter / reconcileFilters   the filter bar
 *
 * Profit rule (shared with Job financials and Insights, lib/finance.ts): profit = income - costs, where income is the
 * billed invoices + receipts that are not for one of them, and costs are material logs + expense logs + labor.
 * A job is only ranked with BOTH revenue and cost data: no revenue = "No revenue yet", no costs = "No costs logged yet"
 * (shown as "not enough data", never as a 100% margin).
 */
import { roundMoney } from '../../utils/money.ts';
import { daysBetween, instantToLocalYMD, parseLocalDate } from '../../utils/localDates.ts';
import { leadWinRate } from '../leads/leadLogic.ts';
import type { Lead } from '../leads/leadTypes.ts';
import { customerKey, type FactBase, type OverviewFacts } from './facts.ts';
import { NO_FILTERS, type DayRange, type OverviewFilters, type OverviewDoc, type OverviewJob } from './types.ts';

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** A fact is in scope when its day is in the range (null = all time) and it matches the customer / project filters. */
export const factInScope = (f: Pick<FactBase, 'day' | 'jobId' | 'customerKey'>, range: DayRange | null, filters: OverviewFilters): boolean =>
    (!range || (f.day >= range.startYMD && f.day <= range.endYMD))
    && (filters.jobId === null || f.jobId === filters.jobId)
    && (filters.customerKey === null || f.customerKey === filters.customerKey);

// ------------------------------------------------------------------------------------------------ KPI strip
export interface OverviewKpis {
    /** billed invoices issued in the range (= Insights' "billed") */
    billed: number;
    invoiceCount: number;
    /** collected: paid invoices + deposits / receipts + receipts that are not for an invoice (= Insights' "Revenue collected") */
    collected: number;
    /** receipts that are not for a billed invoice */
    otherReceipts: number;
    /** billed + otherReceipts (= Insights' income) */
    income: number;
    /** balance still due on invoices issued in the range (= Insights' "Outstanding") */
    outstanding: number;
    outstandingCount: number;
    /** the part of the outstanding balance that is past its due date */
    overdue: number;
    overdueCount: number;
    /** material logs + expense logs + labor dated in the range */
    costs: number;
    /** income - costs */
    profit: number;
    /** average days from issue to the day the last payment came in, for invoices PAID in the range; null = none known */
    avgDaysToPaid: number | null;
    /** how many paid invoices that average is made of */
    paidSample: number;
}

export const overviewKpis = (facts: OverviewFacts, range: DayRange | null, filters: OverviewFilters = NO_FILTERS): OverviewKpis => {
    let billed = 0, invoiceCount = 0, collected = 0, otherReceipts = 0, outstanding = 0, outstandingCount = 0, overdue = 0, overdueCount = 0, costs = 0;
    for (const f of facts.invoices) {
        if (!factInScope(f, range, filters)) continue;
        billed += f.total;
        invoiceCount++;
        collected += f.collected;
        if (f.due > 0) {
            outstanding += f.due;
            outstandingCount++;
            if (f.overdue) { overdue += f.due; overdueCount++; }
        }
    }
    for (const f of facts.receipts) {
        if (!factInScope(f, range, filters)) continue;
        otherReceipts += f.amount;
        collected += f.amount;
    }
    for (const f of facts.costs) {
        if (factInScope(f, range, filters)) costs += f.amount;
    }
    // average days to get paid: the invoices whose last payment came in inside the range
    let daysSum = 0, paidSample = 0;
    for (const f of facts.invoices) {
        if (!f.paid || !f.paidDay) continue;
        if (!factInScope({ day: f.paidDay, jobId: f.jobId, customerKey: f.customerKey }, range, filters)) continue;
        const a = parseLocalDate(f.day);
        const b = parseLocalDate(f.paidDay);
        if (!a || !b) continue;
        daysSum += Math.max(0, daysBetween(a, b));
        paidSample++;
    }
    const income = roundMoney(billed + otherReceipts);
    const costTotal = roundMoney(costs);
    return {
        billed: roundMoney(billed), invoiceCount, collected: roundMoney(collected), otherReceipts: roundMoney(otherReceipts), income,
        outstanding: roundMoney(outstanding), outstandingCount, overdue: roundMoney(overdue), overdueCount,
        costs: costTotal, profit: roundMoney(income - costTotal),
        avgDaysToPaid: paidSample ? Math.round((daysSum / paidSample) * 10) / 10 : null,
        paidSample,
    };
};

// ------------------------------------------------------------------------------------------------ leads, active jobs
export interface LeadKpis {
    newLeads: number;
    won: number;
    lost: number;
    /** won / (won + lost) of the leads that came in during the range; null = none decided yet */
    winRate: number | null;
}

/** Leads that came in during the range (their creation day, local time) and how many of them were won / lost. */
export const leadKpis = (leads: readonly Pick<Lead, 'createdAt' | 'stage'>[], range: DayRange | null): LeadKpis => {
    const mine = leads.filter(l => {
        const day = instantToLocalYMD(l.createdAt);
        return !!day && (!range || (day >= range.startYMD && day <= range.endYMD));
    });
    return {
        newLeads: mine.length,
        won: mine.filter(l => l.stage === 'won').length,
        lost: mine.filter(l => l.stage === 'lost').length,
        winRate: leadWinRate(mine),
    };
};

/** Does a job match the customer / project filters? (A job's customer: lib/overview/facts.ts jobCustomerMap.) */
export const jobMatchesFilters = (job: Pick<OverviewJob, 'id'>, jobCustomers: ReadonlyMap<string, string>, filters: OverviewFilters): boolean =>
    (filters.jobId === null || job.id === filters.jobId)
    && (filters.customerKey === null || customerKey(jobCustomers.get(job.id)) === filters.customerKey);

export const activeJobCount = (jobs: readonly OverviewJob[], jobCustomers: ReadonlyMap<string, string>, filters: OverviewFilters = NO_FILTERS): number =>
    jobs.filter(j => norm(j.status) === 'active' && jobMatchesFilters(j, jobCustomers, filters)).length;

// ------------------------------------------------------------------------------------------------ profit by job
export type ProfitBasis = 'period' | 'job';
export type ProfitStatus = 'ok' | 'no_revenue' | 'no_cost';

export interface JobProfitRow {
    jobId: string;
    name: string;
    customer: string;
    jobStatus: string;
    /** income of the job (billed invoices + receipts that are not for an invoice) */
    revenue: number;
    /** material logs + expense logs + labor */
    cost: number;
    /** revenue - cost */
    profit: number;
    /** profit / revenue in percent; null unless the job has both revenue and cost data */
    margin: number | null;
    status: ProfitStatus;
    /** "" when ranked, else why it is not: "No revenue yet" / "No costs logged yet" */
    note: string;
}

/**
 * One row per job with activity: its documents dated in the range (basis 'period') or all its documents (basis 'job',
 * the whole-job numbers of Job financials). Documents without a job are not in a job row (they are in the KPI strip).
 */
export const jobProfitRows = (
    facts: OverviewFacts,
    jobs: readonly OverviewJob[],
    options: { range: DayRange | null; filters?: OverviewFilters; basis?: ProfitBasis },
): JobProfitRow[] => {
    const filters = options.filters ?? NO_FILTERS;
    const range = options.basis === 'job' ? null : options.range;
    const sums = new Map<string, { revenue: number; cost: number }>();
    const bump = (jobId: string | null, key: 'revenue' | 'cost', amount: number) => {
        if (!jobId) return;
        const s = sums.get(jobId) || { revenue: 0, cost: 0 };
        s[key] += amount;
        sums.set(jobId, s);
    };
    for (const f of facts.invoices) if (factInScope(f, range, filters)) bump(f.jobId, 'revenue', f.total);
    for (const f of facts.receipts) if (factInScope(f, range, filters)) bump(f.jobId, 'revenue', f.amount);
    for (const f of facts.costs) if (factInScope(f, range, filters)) bump(f.jobId, 'cost', f.amount);

    const rows: JobProfitRow[] = [];
    for (const job of jobs) {
        const s = sums.get(job.id);
        if (!s) continue;
        const revenue = roundMoney(s.revenue);
        const cost = roundMoney(s.cost);
        const profit = roundMoney(revenue - cost);
        const status: ProfitStatus = !(revenue > 0) ? 'no_revenue' : !(cost > 0) ? 'no_cost' : 'ok';
        rows.push({
            jobId: job.id,
            name: String(job.name ?? '').trim() || 'Untitled job',
            customer: facts.jobCustomers.get(job.id) || '',
            jobStatus: norm(job.status),
            revenue, cost, profit,
            margin: status === 'ok' ? (profit / revenue) * 100 : null,
            status,
            note: status === 'no_revenue' ? 'No revenue yet' : status === 'no_cost' ? 'No costs logged yet' : '',
        });
    }
    return rows;
};

export type RankBy = 'profit' | 'margin';

export interface ProfitRanking {
    /** the best jobs, best first */
    top: JobProfitRow[];
    /** the worst jobs, worst first (never a job already in `top`) */
    bottom: JobProfitRow[];
    /** jobs with revenue and cost data (top + bottom come from these) */
    ranked: number;
    /** jobs without revenue or without cost data, biggest revenue first */
    notEnough: JobProfitRow[];
}

export const rankJobs = (rows: readonly JobProfitRow[], by: RankBy = 'profit', limit = 5): ProfitRanking => {
    const ok = rows.filter(r => r.status === 'ok');
    const key = (r: JobProfitRow) => (by === 'margin' ? (r.margin ?? -Infinity) : r.profit);
    const other = (r: JobProfitRow) => (by === 'margin' ? r.profit : (r.margin ?? -Infinity));
    const sorted = [...ok].sort((a, b) => key(b) - key(a) || other(b) - other(a) || a.name.localeCompare(b.name) || a.jobId.localeCompare(b.jobId));
    const top = sorted.slice(0, limit);
    const rest = sorted.slice(top.length);
    const bottom = rest.slice(Math.max(0, rest.length - limit)).reverse();
    const notEnough = rows.filter(r => r.status !== 'ok').sort((a, b) => b.revenue - a.revenue || b.cost - a.cost || a.name.localeCompare(b.name) || a.jobId.localeCompare(b.jobId));
    return { top, bottom, ranked: ok.length, notEnough };
};

// ------------------------------------------------------------------------------------------------ revenue by customer
export interface CustomerRevenueRow {
    key: string;
    name: string;
    /** income: billed invoices + receipts that are not for an invoice */
    revenue: number;
    billed: number;
    collected: number;
    outstanding: number;
    invoices: number;
    /** distinct jobs the revenue came from */
    jobs: number;
}

export interface CustomerRevenue {
    rows: CustomerRevenueRow[];
    /** customers with revenue in the range (rows may show fewer) */
    totalCustomers: number;
    /** revenue of the customers beyond `limit` */
    otherRevenue: number;
}

export const revenueByCustomer = (facts: OverviewFacts, range: DayRange | null, filters: OverviewFilters = NO_FILTERS, limit = 8): CustomerRevenue => {
    const map = new Map<string, CustomerRevenueRow & { jobSet: Set<string> }>();
    const row = (key: string, name: string) => {
        let r = map.get(key);
        if (!r) { r = { key, name, revenue: 0, billed: 0, collected: 0, outstanding: 0, invoices: 0, jobs: 0, jobSet: new Set() }; map.set(key, r); }
        else if (!r.name && name) r.name = name;
        return r;
    };
    for (const f of facts.invoices) {
        if (!factInScope(f, range, filters)) continue;
        const r = row(f.customerKey, f.customer);
        r.revenue += f.total; r.billed += f.total; r.collected += f.collected; r.outstanding += f.due; r.invoices++;
        if (f.jobId) r.jobSet.add(f.jobId);
    }
    for (const f of facts.receipts) {
        if (!factInScope(f, range, filters)) continue;
        const r = row(f.customerKey, f.customer);
        r.revenue += f.amount; r.collected += f.amount;
        if (f.jobId) r.jobSet.add(f.jobId);
    }
    const all = Array.from(map.values())
        .map(({ jobSet, ...r }) => ({ ...r, revenue: roundMoney(r.revenue), billed: roundMoney(r.billed), collected: roundMoney(r.collected), outstanding: roundMoney(r.outstanding), jobs: jobSet.size }))
        .filter(r => r.revenue > 0 || r.collected > 0)
        .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
    const rows = all.slice(0, limit);
    return { rows, totalCustomers: all.length, otherRevenue: roundMoney(all.slice(limit).reduce((s, r) => s + r.revenue, 0)) };
};

// ------------------------------------------------------------------------------------------------ headline
/** "$840", "$5.8k", "$24.1k", "$1.2M": short money for the headline sentence (one decimal from $1,000, no ".0"). */
export const headlineMoney = (n: number): string => {
    const v = Number.isFinite(n) ? n : 0;
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    const trim = (x: number) => x.toFixed(1).replace(/\.0$/, '');
    if (abs >= 999_950) return `${sign}$${trim(abs / 1_000_000)}M`;
    if (abs >= 999.5) {
        const k = Math.round(abs / 100) / 10; // one decimal, half-up on the cents
        return k >= 1000 ? `${sign}$${trim(abs / 1_000_000)}M` : `${sign}$${trim(k)}k`;
    }
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
};

/**
 * "March: $24.1k billed, $18.3k collected, $5.8k waiting ($1.2k overdue)." `fmt` formats money (the screen passes the
 * app's compactMoney; tests pass their own).
 */
export const headlineSentence = (
    label: string,
    k: Pick<OverviewKpis, 'billed' | 'collected' | 'outstanding' | 'overdue'>,
    fmt: (n: number) => string,
): string => {
    const parts: string[] = [];
    if (k.billed > 0) parts.push(`${fmt(k.billed)} billed`);
    if (k.collected > 0) parts.push(`${fmt(k.collected)} collected`);
    if (k.outstanding > 0) parts.push(`${fmt(k.outstanding)} waiting${k.overdue > 0 ? ` (${fmt(k.overdue)} overdue)` : ''}`);
    return parts.length ? `${label}: ${parts.join(', ')}.` : `${label}: nothing billed or collected yet.`;
};

// ------------------------------------------------------------------------------------------------ filters
export interface CustomerOption { key: string; name: string }
export interface JobOption { id: string; name: string; customer: string; status: string }

/** Every customer the owner has: job clients and client names on documents, A to Z. */
export const customerOptions = (jobs: readonly OverviewJob[], docs: readonly Pick<OverviewDoc, 'jobId' | 'clientName'>[], jobCustomers: ReadonlyMap<string, string>): CustomerOption[] => {
    const map = new Map<string, string>();
    const add = (name: unknown) => {
        const n = String(name ?? '').trim().replace(/\s+/g, ' ');
        if (n && !map.has(customerKey(n))) map.set(customerKey(n), n);
    };
    for (const j of jobs) add(jobCustomers.get(j.id) ?? j.clientName);
    for (const d of docs) add(d.jobId && jobCustomers.has(d.jobId) ? jobCustomers.get(d.jobId) : d.clientName);
    return Array.from(map, ([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
};

/** The projects to pick from: all, or only the selected customer's, A to Z. */
export const jobOptions = (jobs: readonly OverviewJob[], jobCustomers: ReadonlyMap<string, string>, customer: string | null): JobOption[] =>
    jobs
        .filter(j => customer === null || customerKey(jobCustomers.get(j.id)) === customer)
        .map(j => ({ id: j.id, name: String(j.name ?? '').trim() || 'Untitled job', customer: jobCustomers.get(j.id) || '', status: norm(j.status) }))
        .sort((a, b) => a.name.localeCompare(b.name));

/** Picking a customer clears a project that belongs to someone else. */
export const setCustomerFilter = (f: OverviewFilters, key: string | null, jobCustomers: ReadonlyMap<string, string>): OverviewFilters => {
    const jobId = f.jobId !== null && key !== null && customerKey(jobCustomers.get(f.jobId)) !== key ? null : f.jobId;
    return { customerKey: key, jobId };
};

/** Picking a project also picks its customer (a project belongs to one). */
export const setJobFilter = (f: OverviewFilters, jobId: string | null, jobCustomers: ReadonlyMap<string, string>): OverviewFilters => {
    if (jobId === null) return { customerKey: f.customerKey, jobId: null };
    const c = jobCustomers.get(jobId);
    return { customerKey: c ? customerKey(c) : f.customerKey, jobId };
};

/** Drops a project that no longer exists or no longer matches the customer (data reloaded, filters kept). */
export const reconcileFilters = (f: OverviewFilters, jobs: readonly OverviewJob[], jobCustomers: ReadonlyMap<string, string>): OverviewFilters => {
    if (f.jobId === null) return f;
    const job = jobs.find(j => j.id === f.jobId);
    if (!job) return { ...f, jobId: null };
    if (f.customerKey !== null && customerKey(jobCustomers.get(job.id)) !== f.customerKey) return { ...f, jobId: null };
    return f;
};
