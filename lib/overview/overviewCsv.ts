/**
 * Business overview (N3): "Download this overview as CSV". One tidy table (what the owner sees, section by section) so
 * it opens cleanly in Excel / Google Sheets and can be filtered or pivoted. Uses the app's CSV writer
 * (lib/export/csv.ts: UTF-8 with BOM, CRLF, money with 2 decimals, formula-looking text neutralised) and the same
 * download helper as the bookkeeper CSV (lib/export/bookkeeperApi.ts downloadCsv).
 *
 * Columns: Section | Name | Customer | Status | Revenue | Cost | Profit | Margin % | Value | Unit | Days | Budget used % | Tasks | Next due | Note
 *   Summary                  one row per number of the strip at the top (Value + Unit: "$", "days", "jobs", "leads", "%")
 *   Profit by job            every job with activity: revenue, cost, profit, margin; "Not enough data" in Note when it is not ranked
 *   Waiting for approval     sent estimates: Value = amount, Days = days waiting
 *   Active jobs              Value = budget, Budget used %, Tasks "5/8", Next due, warnings in Note
 *   Revenue by customer      Revenue, Value = collected
 */
import { money, toCsv, type CsvValue } from '../export/csv.ts';
import { rangeFileTag } from './period.ts';
import type { ActiveJobRow } from './activeJobs.ts';
import { JOB_WARNING_LABELS } from './activeJobs.ts';
import type { AwaitingSummary } from './awaiting.ts';
import type { CustomerRevenueRow, JobProfitRow, LeadKpis, OverviewKpis, RankBy } from './overview.ts';
import { rankJobs } from './overview.ts';
import type { DayRange } from './types.ts';

export const OVERVIEW_CSV_HEADER = [
    'Section', 'Name', 'Customer', 'Status', 'Revenue', 'Cost', 'Profit', 'Margin %', 'Value', 'Unit', 'Days', 'Budget used %', 'Tasks', 'Next due', 'Note',
] as const;

export interface OverviewExportModel {
    /** "March", "Q1 2026" ... */
    label: string;
    range: DayRange | null;
    /** the customer / project filters in words ('' = all) */
    customerFilter: string;
    projectFilter: string;
    /** 'period' (documents dated in the range) or 'job' (whole job) */
    profitBasis: 'period' | 'job';
    kpis: OverviewKpis;
    /** null = the Leads tool is not ready, or a customer / project filter is on (leads are not tied to them) */
    leads: LeadKpis | null;
    activeJobCount: number;
    profitRows: readonly JobProfitRow[];
    rankBy: RankBy;
    awaiting: AwaitingSummary;
    activeJobs: readonly ActiveJobRow[];
    customers: readonly CustomerRevenueRow[];
}

const COLS = OVERVIEW_CSV_HEADER.length;
const row = (cells: Partial<Record<typeof OVERVIEW_CSV_HEADER[number], CsvValue>>): CsvValue[] =>
    OVERVIEW_CSV_HEADER.map(h => cells[h] ?? '');
const round1 = (n: number): number => Math.round(n * 10) / 10;

export const overviewCsvRows = (m: OverviewExportModel): CsvValue[][] => {
    const out: CsvValue[][] = [];
    const summary = (name: string, value: CsvValue, unit: string, note = '') => out.push(row({ Section: 'Summary', Name: name, Value: value, Unit: unit, Note: note }));

    out.push(row({
        Section: 'Summary', Name: 'Period', Note: m.range ? `${m.label} (${m.range.startYMD} to ${m.range.endYMD})` : m.label,
    }));
    out.push(row({ Section: 'Summary', Name: 'Customer filter', Note: m.customerFilter || 'All customers' }));
    out.push(row({ Section: 'Summary', Name: 'Project filter', Note: m.projectFilter || 'All projects' }));
    summary('Billed', money(m.kpis.billed), '$', `${m.kpis.invoiceCount} invoice${m.kpis.invoiceCount === 1 ? '' : 's'} issued`);
    summary('Collected', money(m.kpis.collected), '$');
    summary('Outstanding', money(m.kpis.outstanding), '$', `${m.kpis.outstandingCount} open invoice${m.kpis.outstandingCount === 1 ? '' : 's'}`);
    summary('Overdue', money(m.kpis.overdue), '$', `${m.kpis.overdueCount} overdue invoice${m.kpis.overdueCount === 1 ? '' : 's'}`);
    summary('Costs', money(m.kpis.costs), '$', 'Material logs + expense logs + labor');
    summary('Profit', money(m.kpis.profit), '$', 'Income - costs');
    summary('Average days to get paid', m.kpis.avgDaysToPaid === null ? '' : m.kpis.avgDaysToPaid, 'days',
        m.kpis.avgDaysToPaid === null ? 'No paid invoices with a known paid date' : `Invoices paid in this period (${m.kpis.paidSample})`);
    summary('Active jobs', m.activeJobCount, 'jobs');
    if (m.leads) {
        summary('New leads', m.leads.newLeads, 'leads');
        summary('Lead win rate', m.leads.winRate === null ? '' : round1(m.leads.winRate * 100), '%', `${m.leads.won} won, ${m.leads.lost} lost`);
    }

    const ranking = rankJobs(m.profitRows, m.rankBy, Number.MAX_SAFE_INTEGER);
    const ordered = [...ranking.top, ...ranking.notEnough];
    for (const r of ordered) {
        out.push(row({
            Section: m.profitBasis === 'job' ? 'Profit by job (whole job)' : 'Profit by job',
            Name: r.name, Customer: r.customer, Status: r.jobStatus,
            Revenue: money(r.revenue), Cost: money(r.cost), Profit: money(r.profit),
            'Margin %': r.margin === null ? '' : round1(r.margin),
            Note: r.status === 'ok' ? '' : `Not enough data: ${r.note.toLowerCase()}`,
        }));
    }

    for (const a of m.awaiting.rows) {
        out.push(row({
            Section: 'Waiting for approval', Name: [a.number, a.jobName].filter(Boolean).join(' - '), Customer: a.customer, Status: 'Sent',
            Value: money(a.amount), Unit: '$', Days: a.daysWaiting ?? '',
            Note: [a.expired ? 'Expired' : '', a.stale ? 'No answer yet' : ''].filter(Boolean).join('; '),
        }));
    }

    for (const j of m.activeJobs) {
        out.push(row({
            Section: 'Active jobs', Name: j.name, Customer: j.customer, Status: j.status,
            Value: j.budget > 0 ? money(j.budget) : '', Unit: j.budget > 0 ? '$' : '',
            'Budget used %': j.usedPct === null ? '' : Math.round(j.usedPct),
            Tasks: j.tasks ? `${j.tasks.done}/${j.tasks.total}` : '',
            'Next due': j.next ? j.next.ymd : '',
            Note: j.warnings.map(w => JOB_WARNING_LABELS[w]).join('; '),
        }));
    }

    for (const c of m.customers) {
        out.push(row({
            Section: 'Revenue by customer', Name: c.name || 'No customer name', Customer: c.name,
            Revenue: money(c.revenue), Value: money(c.collected), Unit: '$ collected',
            Note: `${c.invoices} invoice${c.invoices === 1 ? '' : 's'}, ${money(c.outstanding)} waiting`,
        }));
    }
    return out;
};

export const overviewCsv = (m: OverviewExportModel): string => toCsv([...OVERVIEW_CSV_HEADER], overviewCsvRows(m));

export const overviewCsvFileName = (range: DayRange | null): string => `overview${range ? `-${rangeFileTag(range)}` : ''}.csv`;

export const OVERVIEW_CSV_COLUMNS = COLS;
