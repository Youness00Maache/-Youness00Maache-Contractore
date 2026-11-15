/**
 * Checks for the Business overview (roadmap N3, lib/overview/*): period math (month / quarter / year boundaries, leap
 * years, local time), the KPI strip against Insights (computeAnalytics) and an independent recomputation on random data,
 * profit by job against Job financials (summarizeJobMoney) and the job costing panel (summarizeJobCosting), the
 * "not enough data" rule, estimates awaiting approval (against the pipeline), active jobs, the customer / project
 * filters and the CSV. Pure logic: no network, no browser. Run in several time zones:
 *   npx tsx scripts/overview-check.ts
 */
import { computeAnalytics, presetRange, type AnalyticsDoc } from '../utils/analyticsMath.ts';
import { summarizeJobMoney } from '../lib/finance.ts';
import { summarizeJobCosting } from '../lib/costing.ts';
import { approvalState, mapPipelineRow, placeJob, type PipelineDoc } from '../lib/pipeline.ts';
import { taskProgress } from '../lib/tasks/taskLogic.ts';
import { toLocalYMD } from '../utils/localDates.ts';
import { CSV_BOM } from '../lib/export/csv.ts';
import { OVERVIEW_PERIODS, isValidRange, periodLabel, periodRange, rangeFileTag, type OverviewPeriod } from '../lib/overview/period.ts';
import { buildFacts, customerKey, jobCustomerMap } from '../lib/overview/facts.ts';
import {
    activeJobCount, customerOptions, headlineMoney, headlineSentence, jobOptions, jobProfitRows, leadKpis, overviewKpis, rankJobs, reconcileFilters,
    revenueByCustomer, setCustomerFilter, setJobFilter,
} from '../lib/overview/overview.ts';
import { awaitingEstimates } from '../lib/overview/awaiting.ts';
import { activeJobRows } from '../lib/overview/activeJobs.ts';
import { OVERVIEW_CSV_HEADER, overviewCsv, overviewCsvFileName, overviewCsvRows, type OverviewExportModel } from '../lib/overview/overviewCsv.ts';
import { NO_FILTERS, isFiltering, type OverviewDoc, type OverviewJob, type OverviewTask } from '../lib/overview/types.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);
const near = (label: string, actual: number, expected: number, eps = 0.0051) => {
    if (Math.abs(actual - expected) <= eps) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ${expected}\n  actual   ${actual}`); }
};

// ------------------------------------------------------------------------------------------------ helpers
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const noon = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0).toISOString(); };
const addDays = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); return toLocalYMD(new Date(y, m - 1, d + n)); };
const utcDays = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const mulberry32 = (seed: number) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let docSeq = 0;
const doc = (type: string, jobId: string | null, extra: Record<string, unknown>): OverviewDoc =>
    ({ id: `d${++docSeq}`, type, jobId, createdAt: noon('2026-01-01'), ...extra }) as OverviewDoc;
const line = (quantity: number, rate: number, unitCost?: number) => ({ description: 'Work', quantity, rate, ...(unitCost !== undefined ? { unitCost } : {}) });
const job = (id: string, name: string, clientName: string, status = 'active', extra: Partial<OverviewJob> = {}): OverviewJob =>
    ({ id, name, clientName, status, startDate: '2026-01-01', endDate: null, ...extra });

function runAll() {
    docSeq = 0;
    // ============================================================================================ period math
    const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 30);
    const range = (p: OverviewPeriod, y: number, m: number, d: number) => periodRange(p, at(y, m, d));
    eq('this month', range('this-month', 2026, 11, 15), { startYMD: '2026-11-01', endYMD: '2026-11-15' });
    eq('this month = Insights preset', range('this-month', 2026, 3, 10), presetRange('this-month', at(2026, 3, 10)));
    eq('this quarter = Insights preset', range('this-quarter', 2026, 5, 31), presetRange('this-quarter', at(2026, 5, 31)));
    eq('this year = Insights preset', range('this-year', 2026, 5, 31), presetRange('this-year', at(2026, 5, 31)));
    eq('last month', range('last-month', 2026, 11, 15), { startYMD: '2026-10-01', endYMD: '2026-10-31' });
    eq('last month from January goes to December of last year', range('last-month', 2026, 1, 10), { startYMD: '2025-12-01', endYMD: '2025-12-31' });
    eq('last month in a leap year', range('last-month', 2028, 3, 1), { startYMD: '2028-02-01', endYMD: '2028-02-29' });
    eq('last month in a normal year', range('last-month', 2026, 3, 31), { startYMD: '2026-02-01', endYMD: '2026-02-28' });
    eq('last month from the 31st into a 30-day month', range('last-month', 2026, 5, 31), { startYMD: '2026-04-01', endYMD: '2026-04-30' });
    eq('this quarter, Q1', range('this-quarter', 2026, 3, 31), { startYMD: '2026-01-01', endYMD: '2026-03-31' });
    eq('this quarter, first day of Q2', range('this-quarter', 2026, 4, 1), { startYMD: '2026-04-01', endYMD: '2026-04-01' });
    eq('this quarter, Q4', range('this-quarter', 2026, 12, 31), { startYMD: '2026-10-01', endYMD: '2026-12-31' });
    eq('this year', range('this-year', 2026, 12, 31), { startYMD: '2026-01-01', endYMD: '2026-12-31' });
    eq('last 12 months', range('last-12-months', 2026, 11, 15), { startYMD: '2025-11-16', endYMD: '2026-11-15' });
    eq('last 12 months from Mar 31', range('last-12-months', 2026, 3, 31), { startYMD: '2025-04-01', endYMD: '2026-03-31' });
    eq('last 12 months on Feb 29', range('last-12-months', 2028, 2, 29), { startYMD: '2027-03-01', endYMD: '2028-02-29' });
    eq('last 12 months on Mar 1 of a leap year', range('last-12-months', 2028, 3, 1), { startYMD: '2027-03-02', endYMD: '2028-03-01' });
    eq('custom valid', periodRange('custom', at(2026, 11, 15), { startYMD: '2026-03-03', endYMD: '2026-03-20' }), { startYMD: '2026-03-03', endYMD: '2026-03-20' });
    eq('custom reversed', periodRange('custom', at(2026, 11, 15), { startYMD: '2026-03-21', endYMD: '2026-03-20' }), null);
    eq('custom missing', periodRange('custom', at(2026, 11, 15), {}), null);
    eq('custom impossible day', periodRange('custom', at(2026, 11, 15), { startYMD: '2026-02-31', endYMD: '2026-03-20' }), null);
    eq('custom one day', periodRange('custom', at(2026, 11, 15), { startYMD: '2026-03-03', endYMD: '2026-03-03' }), { startYMD: '2026-03-03', endYMD: '2026-03-03' });
    ok('isValidRange', isValidRange({ startYMD: '2026-01-01', endYMD: '2026-01-01' }) && !isValidRange({ startYMD: '2026-01-02', endYMD: '2026-01-01' }) && !isValidRange(null));
    eq('every period has a label', OVERVIEW_PERIODS.map(p => p.value), ['this-month', 'last-month', 'this-quarter', 'this-year', 'last-12-months', 'custom']);
    const label = (p: OverviewPeriod, y: number, m: number, d: number, custom?: { startYMD: string; endYMD: string }) => periodLabel(p, periodRange(p, at(y, m, d), custom), at(y, m, d));
    eq('label this month', label('this-month', 2026, 3, 10), 'March');
    eq('label last month', label('last-month', 2026, 11, 15), 'October');
    eq('label last month across the year', label('last-month', 2026, 1, 10), 'December 2025');
    eq('label quarter', label('this-quarter', 2026, 11, 15), 'Q4 2026');
    eq('label year', label('this-year', 2026, 11, 15), '2026');
    eq('label last 12', label('last-12-months', 2026, 11, 15), 'Last 12 months');
    eq('label custom whole month', label('custom', 2026, 11, 15, { startYMD: '2026-03-01', endYMD: '2026-03-31' }), 'March');
    eq('label custom whole month of another year', label('custom', 2026, 11, 15, { startYMD: '2025-12-01', endYMD: '2025-12-31' }), 'December 2025');
    eq('label custom February in a leap year', label('custom', 2028, 6, 1, { startYMD: '2028-02-01', endYMD: '2028-02-29' }), 'February');
    eq('label custom whole year', label('custom', 2026, 11, 15, { startYMD: '2025-01-01', endYMD: '2025-12-31' }), '2025');
    eq('label custom dates', label('custom', 2026, 11, 15, { startYMD: '2026-03-03', endYMD: '2026-03-20' }), 'Mar 3 – Mar 20');
    eq('label custom dates of another year', label('custom', 2026, 11, 15, { startYMD: '2025-03-03', endYMD: '2025-03-20' }), 'Mar 3 – Mar 20, 2025');
    eq('label custom across years', label('custom', 2026, 11, 15, { startYMD: '2025-12-20', endYMD: '2026-01-05' }), 'Dec 20, 2025 – Jan 5, 2026');
    eq('label without dates', periodLabel('custom', null), 'No dates chosen');
    eq('file tag', rangeFileTag({ startYMD: '2026-03-01', endYMD: '2026-03-31' }), '2026-03-01_to_2026-03-31');

    // ============================================================================================ local days: a document at 23:30 / 00:30 on a month edge
    {
        const jobs = [job('j', 'Edge', 'Edge Co')];
        const late = new Date(2026, 2, 31, 23, 30).toISOString(); // Mar 31, late evening, LOCAL
        const early = new Date(2026, 3, 1, 0, 30).toISOString(); // Apr 1, just after midnight, LOCAL
        const docs = [
            doc('Invoice', 'j', { status: 'Sent', createdAt: late, lineItems: [line(1, 100)], invoiceNumber: 'INV-L' }),
            doc('Invoice', 'j', { status: 'Sent', createdAt: early, lineItems: [line(1, 200)], invoiceNumber: 'INV-E' }),
        ];
        const facts = buildFacts(docs, { laborRate: 45, todayYMD: '2026-05-01', jobs });
        eq('invoice at 23:30 on Mar 31 is March', overviewKpis(facts, { startYMD: '2026-03-01', endYMD: '2026-03-31' }).billed, 100);
        eq('invoice at 00:30 on Apr 1 is April', overviewKpis(facts, { startYMD: '2026-04-01', endYMD: '2026-04-30' }).billed, 200);
        eq('both in Q1+April span', overviewKpis(facts, { startYMD: '2026-03-31', endYMD: '2026-04-01' }).billed, 300);
        // a written issue date wins over created_at
        const written = [doc('Invoice', 'j', { status: 'Sent', createdAt: early, issueDate: '2026-03-31', lineItems: [line(1, 50)] })];
        eq('issue date beats created_at', overviewKpis(buildFacts(written, { laborRate: 45, todayYMD: '2026-05-01', jobs }), { startYMD: '2026-03-01', endYMD: '2026-03-31' }).billed, 50);
        // leads: creation instant, local day
        const leads = [{ createdAt: late, stage: 'won' }, { createdAt: early, stage: 'lost' }, { createdAt: early, stage: 'new' }] as any[];
        eq('lead at 23:30 Mar 31 is March', leadKpis(leads, { startYMD: '2026-03-01', endYMD: '2026-03-31' }), { newLeads: 1, won: 1, lost: 0, winRate: 1 });
        eq('leads in April', leadKpis(leads, { startYMD: '2026-04-01', endYMD: '2026-04-30' }), { newLeads: 2, won: 0, lost: 1, winRate: 0 });
        eq('leads all time', leadKpis(leads, null).newLeads, 3);
        eq('no decided lead = no win rate', leadKpis([{ createdAt: early, stage: 'new' }] as any[], null).winRate, null);
    }

    // ============================================================================================ KPI strip: hand-made case
    {
        const jobs = [job('j1', 'Kitchen', 'Smith'), job('j2', 'Deck', 'Jones')];
        const docs: OverviewDoc[] = [
            // billed, paid in full 9 days after it was issued
            doc('Invoice', 'j1', { status: 'Paid', issueDate: '2026-03-02', paidAt: '2026-03-11', lineItems: [line(1, 1000)], invoiceNumber: 'INV-0001' }),
            // sent, 300 deposit recorded, due date passed -> overdue 700
            doc('Invoice', 'j1', { status: 'Sent', issueDate: '2026-03-05', dueDate: '2026-03-20', lineItems: [line(1, 1000)], amountPaid: 300, invoiceNumber: 'INV-0002' }),
            // sent, not due yet -> outstanding only
            doc('Invoice', 'j2', { status: 'Sent', issueDate: '2026-03-10', dueDate: '2026-04-30', lineItems: [line(2, 250)], taxRate: 10, invoiceNumber: 'INV-0003' }),
            // draft and cancelled are not billed
            doc('Invoice', 'j2', { status: 'Draft', issueDate: '2026-03-12', lineItems: [line(1, 999)] }),
            doc('Invoice', 'j2', { status: 'Cancelled', issueDate: '2026-03-12', lineItems: [line(1, 888)] }),
            // a receipt for INV-0003 (counted in its collected) and one for nothing (income by itself)
            doc('Receipt', 'j2', { date: '2026-03-15', amount: 100, description: 'Deposit for INV-0003' }),
            doc('Receipt', 'j2', { date: '2026-03-16', amount: 40, description: 'cash for extras' }),
            doc('Expense Log', 'j1', { date: '2026-03-03', amount: 120 }),
            doc('Material Log', 'j1', { date: '2026-03-04', items: [{ quantity: 4, unitCost: 25 }] }),
            doc('Time Sheet', 'j1', { date: '2026-03-04', hoursWorked: 8, overtimeHours: 2 }),
        ];
        const facts = buildFacts(docs, { laborRate: 40, todayYMD: '2026-03-31', jobs });
        const k = overviewKpis(facts, { startYMD: '2026-03-01', endYMD: '2026-03-31' });
        eq('hand: billed', k.billed, 1000 + 1000 + 550);
        eq('hand: invoice count', k.invoiceCount, 3);
        eq('hand: collected (paid + deposit + receipt for the invoice + loose receipt)', k.collected, 1000 + 300 + 100 + 40);
        eq('hand: outstanding', k.outstanding, 700 + 450);
        eq('hand: overdue', k.overdue, 700);
        eq('hand: overdue count', k.overdueCount, 1);
        eq('hand: other receipts', k.otherReceipts, 40);
        eq('hand: income', k.income, 2590);
        eq('hand: costs = 120 + 100 + labor(8h x 40 + 2h x 60)', k.costs, 120 + 100 + 440);
        eq('hand: profit', k.profit, 2590 - 660);
        eq('hand: average days to get paid', k.avgDaysToPaid, 9);
        eq('hand: paid sample', k.paidSample, 1);
        eq('paid outside the period is not in the average', overviewKpis(facts, { startYMD: '2026-04-01', endYMD: '2026-04-30' }).avgDaysToPaid, null);
        eq('customer filter Jones', overviewKpis(facts, { startYMD: '2026-03-01', endYMD: '2026-03-31' }, { customerKey: 'jones', jobId: null }).billed, 550);
        eq('project filter Kitchen', overviewKpis(facts, { startYMD: '2026-03-01', endYMD: '2026-03-31' }, { customerKey: null, jobId: 'j1' }).billed, 2000);
        eq('customer + project that do not match = nothing', overviewKpis(facts, { startYMD: '2026-03-01', endYMD: '2026-03-31' }, { customerKey: 'jones', jobId: 'j1' }).billed, 0);
        eq('all time (null range)', overviewKpis(facts, null).invoiceCount, 3);
        eq('empty period', overviewKpis(facts, { startYMD: '2025-01-01', endYMD: '2025-01-31' }).billed, 0);
        // a Sent invoice fully covered by receipts is paid on the last receipt day
        const covered = [
            doc('Invoice', 'j1', { status: 'Sent', issueDate: '2026-05-01', lineItems: [line(1, 500)], invoiceNumber: 'INV-0009' }),
            doc('Receipt', 'j1', { date: '2026-05-04', amount: 200, description: 'INV-0009 part 1' }),
            doc('Receipt', 'j1', { date: '2026-05-08', amount: 300, description: 'INV-0009 part 2' }),
        ];
        const kc = overviewKpis(buildFacts(covered, { laborRate: 45, todayYMD: '2026-05-31', jobs }), { startYMD: '2026-05-01', endYMD: '2026-05-31' });
        eq('covered by receipts: nothing outstanding', kc.outstanding, 0);
        eq('covered by receipts: paid 7 days after issue', kc.avgDaysToPaid, 7);
        // payments array (no paidAt)
        const withPayments = [doc('Invoice', 'j1', { status: 'Paid', issueDate: '2026-05-01', lineItems: [line(1, 500)], payments: [{ amount: 200, date: '2026-05-05' }, { amount: 300, date: '2026-05-20' }] })];
        eq('paid day from the last payment', overviewKpis(buildFacts(withPayments, { laborRate: 45, todayYMD: '2026-05-31', jobs }), null).avgDaysToPaid, 19);
        const noPaidDay = [doc('Invoice', 'j1', { status: 'Paid', issueDate: '2026-05-01', lineItems: [line(1, 500)] })];
        eq('paid with no known paid day: no average', overviewKpis(buildFacts(noPaidDay, { laborRate: 45, todayYMD: '2026-05-31', jobs }), null).avgDaysToPaid, null);
        const sameDay = [doc('Invoice', 'j1', { status: 'Paid', issueDate: '2026-05-10', paidAt: '2026-05-10', lineItems: [line(1, 500)] })];
        eq('paid the day it was issued = 0 days', overviewKpis(buildFacts(sameDay, { laborRate: 45, todayYMD: '2026-05-31', jobs }), null).avgDaysToPaid, 0);
        const backwards = [doc('Invoice', 'j1', { status: 'Paid', issueDate: '2026-05-10', paidAt: '2026-05-05', lineItems: [line(1, 500)] })];
        eq('paid before issued (bad data) never goes negative', overviewKpis(buildFacts(backwards, { laborRate: 45, todayYMD: '2026-05-31', jobs }), null).avgDaysToPaid, 0);
        // headline
        eq('headlineMoney', [0, 840, 999, 999.5, 1000, 5800, 11500, 24100, 999_949, 999_950, 1_200_000, -5800, NaN].map(headlineMoney),
            ['$0', '$840', '$999', '$1k', '$1k', '$5.8k', '$11.5k', '$24.1k', '$999.9k', '$1M', '$1.2M', '-$5.8k', '$0']);
        const money = (n: number) => `$${(n / 1000).toFixed(1)}k`;
        eq('headline full', headlineSentence('March', { billed: 24100, collected: 18300, outstanding: 5800, overdue: 1200 }, money), 'March: $24.1k billed, $18.3k collected, $5.8k waiting ($1.2k overdue).');
        eq('headline without overdue', headlineSentence('March', { billed: 24100, collected: 18300, outstanding: 5800, overdue: 0 }, money), 'March: $24.1k billed, $18.3k collected, $5.8k waiting.');
        eq('headline only collected', headlineSentence('2026', { billed: 0, collected: 1000, outstanding: 0, overdue: 0 }, money), '2026: $1.0k collected.');
        eq('headline empty', headlineSentence('May', { billed: 0, collected: 0, outstanding: 0, overdue: 0 }, money), 'May: nothing billed or collected yet.');
    }

    // ============================================================================================ random data: KPIs = Insights = an independent recomputation
    {
        const CLIENTS = ['Smith', 'Jones', 'Acme Corp', 'Dee Builders', 'Nguyen', '', 'smith '];
        for (let seed = 1; seed <= 40; seed++) {
            const rng = mulberry32(seed * 7919);
            const int = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
            const pick = <T,>(arr: readonly T[]): T => arr[int(0, arr.length - 1)];
            const randomDay = () => toLocalYMD(new Date(2025, 9, 1 + int(0, 455)));
            const jobs: OverviewJob[] = Array.from({ length: 12 }, (_, i) => job(`job-${seed}-${i}`, `Job ${i}`, pick(CLIENTS), pick(['active', 'active', 'paused', 'completed', 'inactive'])));
            const today = randomDay();
            const docs: OverviewDoc[] = [];
            // the generator's own truth, computed WITHOUT any app helper
            const truth = {
                invoices: [] as Array<{ job: string; customer: string; day: string; total: number; collected: number; status: string; due: string | null; paidAt: string | null }>,
                receipts: [] as Array<{ job: string | null; customer: string; day: string; amount: number }>,
                costs: [] as Array<{ job: string; customer: string; day: string; amount: number }>,
            };
            let inv = 0;
            for (const j of jobs) {
                const customer = String(j.clientName || '').trim();
                for (let n = int(0, 4); n > 0; n--) {
                    const status = pick(['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled', 'Sent', 'Paid']);
                    const lines = Array.from({ length: int(1, 3) }, () => ({ description: 'Item', quantity: int(1, 5), rate: int(10, 500) }));
                    const subtotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
                    const taxRate = pick([0, 5, 8, 10]);
                    const total = subtotal + (subtotal * taxRate) / 100;
                    const issue = randomDay();
                    const number = `INV-2026-${pad(seed)}${String(++inv).padStart(4, '0')}`;
                    const due = rng() < 0.7 ? addDays(issue, int(7, 45)) : null;
                    const amountPaid = status === 'Sent' && rng() < 0.4 ? int(1, Math.max(1, Math.floor(total) - 2)) : 0;
                    const paidAt = status === 'Paid' && rng() < 0.7 ? addDays(issue, int(0, 60)) : null;
                    const d = doc('Invoice', j.id, {
                        status, issueDate: issue, dueDate: due, lineItems: lines, taxRate, amountPaid: amountPaid || undefined, invoiceNumber: number,
                        paidAt, clientName: rng() < 0.2 ? 'Someone Else' : customer, createdAt: noon(issue),
                    });
                    docs.push(d);
                    const billed = ['Sent', 'Paid', 'Overdue'].includes(status);
                    let collected = 0;
                    if (billed) {
                        collected = status === 'Paid' ? total : Math.min(amountPaid, total);
                        if (status === 'Sent' && rng() < 0.5) {
                            const r = int(1, Math.max(1, Math.floor(total) - 2));
                            const rday = addDays(issue, int(0, 30));
                            docs.push(doc('Receipt', j.id, { date: rday, amount: r, description: `Payment for ${number}`, createdAt: noon(rday) }));
                            collected = Math.max(collected, r);
                        }
                    }
                    if (billed) truth.invoices.push({ job: j.id, customer, day: issue, total, collected, status, due, paidAt });
                }
                for (let n = int(0, 2); n > 0; n--) {
                    const day = randomDay(); const amount = int(5, 400);
                    docs.push(doc('Receipt', rng() < 0.8 ? j.id : null, { date: day, amount, description: 'cash', createdAt: noon(day) }));
                    const last = docs[docs.length - 1];
                    truth.receipts.push({ job: last.jobId ?? null, customer: last.jobId ? customer : '', day, amount });
                }
                for (let n = int(0, 3); n > 0; n--) {
                    const day = randomDay(); const amount = int(5, 600);
                    docs.push(doc('Expense Log', j.id, { date: day, amount, createdAt: noon(day) }));
                    truth.costs.push({ job: j.id, customer, day, amount });
                }
                for (let n = int(0, 2); n > 0; n--) {
                    const day = randomDay(); const items = [{ quantity: int(1, 9), unitCost: int(2, 80) }, { quantity: int(1, 3), unitCost: int(10, 90) }];
                    docs.push(doc('Material Log', j.id, { date: day, items, createdAt: noon(day) }));
                    truth.costs.push({ job: j.id, customer, day, amount: items.reduce((s, i) => s + i.quantity * i.unitCost, 0) });
                }
                for (let n = int(0, 2); n > 0; n--) {
                    const day = randomDay(); const h = int(1, 10); const ot = int(0, 3);
                    docs.push(doc('Time Sheet', j.id, { date: day, hoursWorked: h, overtimeHours: ot, createdAt: noon(day) }));
                    truth.costs.push({ job: j.id, customer, day, amount: h * 52 + ot * 52 * 1.5 });
                }
                for (let n = int(0, 3); n > 0; n--) {
                    const status = pick(['Draft', 'Sent', 'Accepted', 'Rejected', 'Sent', 'Sent']);
                    const day = randomDay();
                    docs.push(doc('Estimate', j.id, {
                        status, issueDate: day, lineItems: [line(int(1, 4), int(100, 900))], estimateNumber: `EST-${seed}-${n}`,
                        expiryDate: rng() < 0.3 ? addDays(day, int(10, 60)) : null, clientSignedAt: status === 'Accepted' && rng() < 0.5 ? noon(day) : null,
                        createdAt: noon(day),
                    }));
                }
            }
            const jobCustomers = jobCustomerMap(jobs, docs);
            const facts = buildFacts(docs, { laborRate: 52, todayYMD: today, jobs });
            const a = randomDay(); const b = randomDay();
            const r = a <= b ? { startYMD: a, endYMD: b } : { startYMD: b, endYMD: a };
            const k = overviewKpis(facts, r);
            // (1) Insights on the same documents
            const an = computeAnalytics(docs as unknown as AnalyticsDoc[], r.startYMD, r.endYMD, { todayYMD: today, laborRate: 52 });
            near(`seed ${seed}: billed = Insights invoiced`, k.billed, an.invoiced);
            near(`seed ${seed}: collected = Insights revenue`, k.collected, an.revenue);
            near(`seed ${seed}: outstanding = Insights`, k.outstanding, an.outstanding);
            near(`seed ${seed}: overdue = Insights`, k.overdue, an.overdue);
            near(`seed ${seed}: income = Insights`, k.income, an.income);
            near(`seed ${seed}: costs = Insights`, k.costs, an.costs);
            near(`seed ${seed}: profit = Insights`, k.profit, an.profit);
            eq(`seed ${seed}: invoice count = Insights`, k.invoiceCount, an.invoiceCount);
            eq(`seed ${seed}: outstanding count = Insights`, k.outstandingCount, an.outstandingCount);
            eq(`seed ${seed}: overdue count = Insights`, k.overdueCount, an.overdueCount);
            // (2) the generator's own truth
            const inR = (day: string) => day >= r.startYMD && day <= r.endYMD;
            const tInv = truth.invoices.filter(i => inR(i.day));
            near(`seed ${seed}: billed = truth`, k.billed, tInv.reduce((s, i) => s + i.total, 0));
            near(`seed ${seed}: collected = truth`, k.collected, tInv.reduce((s, i) => s + i.collected, 0) + truth.receipts.filter(x => inR(x.day)).reduce((s, x) => s + x.amount, 0));
            const open = tInv.filter(i => i.status !== 'Paid' && i.total - i.collected > 0.004);
            near(`seed ${seed}: outstanding = truth`, k.outstanding, open.reduce((s, i) => s + (i.total - i.collected), 0));
            near(`seed ${seed}: overdue = truth`, k.overdue, open.filter(i => i.status === 'Overdue' || (i.due && i.due < today)).reduce((s, i) => s + (i.total - i.collected), 0));
            near(`seed ${seed}: costs = truth`, k.costs, truth.costs.filter(c => inR(c.day)).reduce((s, c) => s + c.amount, 0));
            const paidIn = truth.invoices.filter(i => i.status === 'Paid' && i.paidAt && inR(i.paidAt));
            eq(`seed ${seed}: paid sample = truth`, k.paidSample, paidIn.length);
            if (paidIn.length) near(`seed ${seed}: average days to get paid = truth`, k.avgDaysToPaid ?? -1, paidIn.reduce((s, i) => s + Math.max(0, utcDays(i.day, i.paidAt as string)), 0) / paidIn.length, 0.051);
            else eq(`seed ${seed}: no paid invoice = no average`, k.avgDaysToPaid, null);

            // (3) filters = the same numbers on the filtered documents
            const someJob = jobs[int(0, jobs.length - 1)];
            const byJob = overviewKpis(facts, r, { customerKey: null, jobId: someJob.id });
            const anJob = computeAnalytics(docs.filter(d => d.jobId === someJob.id) as unknown as AnalyticsDoc[], r.startYMD, r.endYMD, { todayYMD: today, laborRate: 52 });
            near(`seed ${seed}: project filter billed`, byJob.billed, anJob.invoiced);
            near(`seed ${seed}: project filter collected`, byJob.collected, anJob.revenue);
            near(`seed ${seed}: project filter outstanding`, byJob.outstanding, anJob.outstanding);
            near(`seed ${seed}: project filter profit`, byJob.profit, anJob.profit);
            const cKey = customerKey(someJob.clientName) || '';
            if (cKey) {
                const byCustomer = overviewKpis(facts, r, { customerKey: cKey, jobId: null });
                const customerDocs = docs.filter(d => customerKey(jobCustomers.get(d.jobId as string) || d.clientName) === cKey);
                const anC = computeAnalytics(customerDocs as unknown as AnalyticsDoc[], r.startYMD, r.endYMD, { todayYMD: today, laborRate: 52 });
                near(`seed ${seed}: customer filter billed`, byCustomer.billed, anC.invoiced);
                near(`seed ${seed}: customer filter collected`, byCustomer.collected, anC.revenue);
                near(`seed ${seed}: customer filter costs`, byCustomer.costs, anC.costs);
            }

            // (4) profit by job = Job financials + the job costing panel, on the same documents (whole job)
            const whole = jobProfitRows(facts, jobs, { range: null, basis: 'job' });
            const wholeById = new Map(whole.map(x => [x.jobId, x]));
            for (const j of jobs) {
                const jd = docs.filter(d => d.jobId === j.id);
                const fin = summarizeJobMoney(jd, { laborRate: 52 });
                const row = wholeById.get(j.id);
                if (!row) { ok(`seed ${seed} ${j.name}: no row = no income and no costs`, fin.income === 0 && fin.costs === 0); continue; }
                near(`seed ${seed} ${j.name}: revenue = Job financials income`, row.revenue, fin.income);
                near(`seed ${seed} ${j.name}: cost = Job financials costs`, row.cost, fin.costs);
                near(`seed ${seed} ${j.name}: profit = Job financials profit`, row.profit, fin.profit);
                const costing = summarizeJobCosting(jd, { laborRate: 52 });
                near(`seed ${seed} ${j.name}: cost = job costing panel's profit costs`, row.cost, costing.profitCosts);
                if (row.status === 'ok') near(`seed ${seed} ${j.name}: margin = Job financials margin`, row.margin as number, fin.margin as number, 0.0001);
                else eq(`seed ${seed} ${j.name}: no margin without data`, row.margin, null);
                eq(`seed ${seed} ${j.name}: status rule`, row.status, !(fin.income > 0) ? 'no_revenue' : !(fin.costs > 0) ? 'no_cost' : 'ok');
            }
            // the period basis with every day = the same numbers; and = Insights per job
            const everyDay = jobProfitRows(facts, jobs, { range: { startYMD: '1990-01-01', endYMD: '2100-12-31' }, basis: 'period' });
            eq(`seed ${seed}: period basis over all days = whole job`, JSON.stringify(everyDay), JSON.stringify(whole));
            const periodRows = jobProfitRows(facts, jobs, { range: r, basis: 'period' });
            for (const row of periodRows) {
                const anJ = computeAnalytics(docs.filter(d => d.jobId === row.jobId) as unknown as AnalyticsDoc[], r.startYMD, r.endYMD, { todayYMD: today, laborRate: 52 });
                near(`seed ${seed} ${row.name}: period profit = Insights profit`, row.profit, anJ.profit);
                near(`seed ${seed} ${row.name}: period revenue = Insights income`, row.revenue, anJ.income);
            }
            // ranking invariants
            const rank = rankJobs(periodRows, 'profit', 5);
            ok(`seed ${seed}: top and bottom never overlap`, !rank.top.some(t => rank.bottom.some(b => b.jobId === t.jobId)));
            ok(`seed ${seed}: at most 5 each`, rank.top.length <= 5 && rank.bottom.length <= 5);
            eq(`seed ${seed}: ranked + not enough = all rows`, rank.ranked + rank.notEnough.length, periodRows.length);
            ok(`seed ${seed}: top is sorted by profit`, rank.top.every((t, i) => i === 0 || rank.top[i - 1].profit >= t.profit));
            ok(`seed ${seed}: bottom is worst first`, rank.bottom.every((t, i) => i === 0 || rank.bottom[i - 1].profit <= t.profit));
            ok(`seed ${seed}: best of bottom is not better than the worst of top`, !rank.top.length || !rank.bottom.length || rank.bottom[0].profit <= rank.top[rank.top.length - 1].profit);
            ok(`seed ${seed}: only rows with data are ranked`, [...rank.top, ...rank.bottom].every(x => x.status === 'ok' && x.revenue > 0 && x.cost > 0 && x.margin !== null));
            ok(`seed ${seed}: not enough = no revenue or no cost, margin null`, rank.notEnough.every(x => (x.revenue <= 0 || x.cost <= 0) && x.margin === null && x.note !== ''));
            if (rank.ranked >= 10) eq(`seed ${seed}: 5 + 5 with 10 ranked jobs`, [rank.top.length, rank.bottom.length], [5, 5]);

            // revenue by customer: adds up to the income of the same filters
            const rc = revenueByCustomer(facts, r, NO_FILTERS, 1000);
            near(`seed ${seed}: revenue by customer adds up to income`, rc.rows.reduce((s, x) => s + x.revenue, 0), k.income);
            near(`seed ${seed}: revenue by customer collected adds up`, rc.rows.reduce((s, x) => s + x.collected, 0), k.collected);
            near(`seed ${seed}: revenue by customer waiting adds up`, rc.rows.reduce((s, x) => s + x.outstanding, 0), k.outstanding);
            ok(`seed ${seed}: customers sorted by revenue`, rc.rows.every((x, i) => i === 0 || rc.rows[i - 1].revenue >= x.revenue));
            const rc3 = revenueByCustomer(facts, r, NO_FILTERS, 3);
            eq(`seed ${seed}: limited list`, rc3.rows.length, Math.min(3, rc.rows.length));
            near(`seed ${seed}: limited list + other = all`, rc3.rows.reduce((s, x) => s + x.revenue, 0) + rc3.otherRevenue, rc.rows.reduce((s, x) => s + x.revenue, 0));
            // active jobs: the costing panel's own % and the task progress
            const rows = activeJobRows(jobs, docs, null, jobCustomers, { todayYMD: today, laborRate: 52 });
            eq(`seed ${seed}: active rows = active + paused jobs`, rows.map(x => x.jobId).sort(), jobs.filter(j => ['active', 'paused'].includes(String(j.status))).map(j => j.id).sort());
            for (const row of rows) {
                const cost = summarizeJobCosting(docs.filter(d => d.jobId === row.jobId), { laborRate: 52 });
                eq(`seed ${seed} ${row.name}: budget`, row.budget, cost.budget);
                eq(`seed ${seed} ${row.name}: used %`, row.usedPct, cost.usedPct);
                eq(`seed ${seed} ${row.name}: over budget chip = costing status`, row.warnings.includes('over_budget'), cost.status.kind === 'over');
                eq(`seed ${seed} ${row.name}: no tasks without the Tasks tool`, row.tasks, null);
                ok(`seed ${seed} ${row.name}: no task warning without tasks`, !row.warnings.includes('task_overdue'));
            }
            eq(`seed ${seed}: active job count`, activeJobCount(jobs, jobCustomers), jobs.filter(j => j.status === 'active').length);

            // awaiting estimates agree with the pipeline's own rule
            const aw = awaitingEstimates(docs, jobs, jobCustomers, today);
            for (const row of aw.rows) {
                const pd = mapPipelineRow(docs.find(d => d.id === row.id));
                eq(`seed ${seed}: awaiting ${row.number} is "sent" for the pipeline`, approvalState(pd), 'sent');
            }
            const inactive = new Set(jobs.filter(j => j.status === 'inactive').map(j => j.id));
            const expectedIds = docs.filter(d => d.type === 'Estimate' && !inactive.has(d.jobId as string) && approvalState(mapPipelineRow(d)) === 'sent').map(d => d.id).sort();
            eq(`seed ${seed}: awaiting = every sent estimate of a job that is not inactive`, aw.rows.map(x => x.id).sort(), expectedIds);
            ok(`seed ${seed}: oldest first`, aw.rows.every((x, i) => i === 0 || (aw.rows[i - 1].daysWaiting ?? -1) >= (x.daysWaiting ?? -1)));
            near(`seed ${seed}: total waiting`, aw.total, aw.rows.reduce((s, x) => s + x.amount, 0));
            // a job whose only open estimate is a sent one sits in the pipeline's "Estimate sent" column: it is on the list
            for (const j of jobs) {
                if (j.status === 'inactive') continue;
                const jd = docs.filter(d => d.jobId === j.id).map(d => ({ ...mapPipelineRow(d), type: String(d.type) })) as PipelineDoc[];
                const placed = placeJob({ id: j.id, name: j.name, clientName: j.clientName, status: j.status }, jd, today);
                if ('card' in placed && placed.card.stage === 'estimate') ok(`seed ${seed} ${j.name}: pipeline's "Estimate sent" card is on the awaiting list`, aw.rows.some(x => x.id === placed.card.doc?.id));
            }
        }
    }

    // ============================================================================================ profit ranking: the data-sufficiency rule
    {
        const jobs = [job('a', 'Alpha', 'A'), job('b', 'Bravo', 'B'), job('c', 'Charlie', 'C'), job('d', 'Delta', 'D'), job('e', 'Echo', 'E'), job('f', 'Foxtrot', 'F')];
        const docs: OverviewDoc[] = [
            // Alpha: revenue and costs -> ranked, margin 40%
            doc('Invoice', 'a', { status: 'Sent', issueDate: '2026-03-05', lineItems: [line(1, 1000)] }), doc('Expense Log', 'a', { date: '2026-03-06', amount: 600 }),
            // Bravo: revenue, NO costs -> "no costs logged yet", never 100% margin
            doc('Invoice', 'b', { status: 'Sent', issueDate: '2026-03-05', lineItems: [line(1, 5000)] }),
            // Charlie: costs, NO revenue -> "no revenue yet"
            doc('Material Log', 'c', { date: '2026-03-05', items: [{ quantity: 10, unitCost: 30 }] }),
            // Delta: a draft invoice only (not billed) + costs -> no revenue
            doc('Invoice', 'd', { status: 'Draft', issueDate: '2026-03-05', lineItems: [line(1, 900)] }), doc('Expense Log', 'd', { date: '2026-03-06', amount: 50 }),
            // Echo: loss
            doc('Invoice', 'e', { status: 'Paid', issueDate: '2026-03-05', lineItems: [line(1, 500)] }), doc('Expense Log', 'e', { date: '2026-03-06', amount: 800 }),
            // Foxtrot: nothing in March
            doc('Invoice', 'f', { status: 'Sent', issueDate: '2026-01-05', lineItems: [line(1, 500)] }), doc('Expense Log', 'f', { date: '2026-01-06', amount: 100 }),
        ];
        const facts = buildFacts(docs, { laborRate: 45, todayYMD: '2026-03-31', jobs });
        const march = { startYMD: '2026-03-01', endYMD: '2026-03-31' };
        const rows = jobProfitRows(facts, jobs, { range: march, basis: 'period' });
        eq('rows: jobs with activity only', rows.map(r => r.jobId).sort(), ['a', 'b', 'c', 'd', 'e']);
        const byId = Object.fromEntries(rows.map(r => [r.jobId, r]));
        eq('Alpha ok', [byId.a.status, byId.a.revenue, byId.a.cost, byId.a.profit, byId.a.margin], ['ok', 1000, 600, 400, 40]);
        eq('Bravo: revenue only is NOT a 100% margin', [byId.b.status, byId.b.margin, byId.b.note], ['no_cost', null, 'No costs logged yet']);
        eq('Charlie: costs only', [byId.c.status, byId.c.margin, byId.c.note], ['no_revenue', null, 'No revenue yet']);
        eq('Delta: a draft invoice is not revenue', [byId.d.status, byId.d.revenue], ['no_revenue', 0]);
        eq('Echo: a loss is ranked with a negative margin', [byId.e.status, byId.e.profit, byId.e.margin], ['ok', -300, -60]);
        const rank = rankJobs(rows, 'profit', 5);
        eq('ranked jobs', rank.ranked, 2);
        eq('top (best first)', rank.top.map(r => r.name), ['Alpha', 'Echo']);
        eq('bottom has no job already in top', rank.bottom, []);
        eq('not enough data (biggest revenue first)', rank.notEnough.map(r => r.name), ['Bravo', 'Charlie', 'Delta']);
        eq('whole-job basis brings Foxtrot in', jobProfitRows(facts, jobs, { range: march, basis: 'job' }).map(r => r.jobId).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
        eq('project filter', jobProfitRows(facts, jobs, { range: march, filters: { customerKey: null, jobId: 'a' } }).map(r => r.jobId), ['a']);
        eq('customer filter', jobProfitRows(facts, jobs, { range: march, filters: { customerKey: 'e', jobId: null } }).map(r => r.jobId), ['e']);

        // 12 jobs: 5 + 5, never the same job twice; sort by margin
        const many = Array.from({ length: 12 }, (_, i) => job(`m${i}`, `Job ${pad(i)}`, `C${i}`));
        const md: OverviewDoc[] = [];
        many.forEach((j, i) => {
            md.push(doc('Invoice', j.id, { status: 'Sent', issueDate: '2026-03-05', lineItems: [line(1, 1000 + i * 100)] }));
            md.push(doc('Expense Log', j.id, { date: '2026-03-06', amount: 500 + ((i * 7) % 12) * 100 }));
        });
        const mf = buildFacts(md, { laborRate: 45, todayYMD: '2026-03-31', jobs: many });
        const mrows = jobProfitRows(mf, many, { range: march });
        const byProfit = rankJobs(mrows, 'profit', 5);
        eq('12 jobs: 5 best', byProfit.top.length, 5);
        eq('12 jobs: 5 worst', byProfit.bottom.length, 5);
        eq('12 jobs: 2 in the middle are in neither list', byProfit.ranked - byProfit.top.length - byProfit.bottom.length, 2);
        eq('12 jobs: the sort is by profit', byProfit.top.map(r => r.profit), [...mrows].sort((a, b) => b.profit - a.profit).slice(0, 5).map(r => r.profit));
        const byMargin = rankJobs(mrows, 'margin', 5);
        eq('12 jobs: the sort by margin', byMargin.top.map(r => r.margin), [...mrows].sort((a, b) => (b.margin as number) - (a.margin as number)).slice(0, 5).map(r => r.margin));
        eq('6 ranked jobs: top 5 and the 1 left over', [rankJobs(mrows.slice(0, 6), 'profit', 5).top.length, rankJobs(mrows.slice(0, 6), 'profit', 5).bottom.length], [5, 1]);
        eq('no jobs', rankJobs([], 'profit', 5), { top: [], bottom: [], ranked: 0, notEnough: [] });
    }

    // ============================================================================================ estimates awaiting approval
    {
        const jobs = [job('j1', 'Kitchen', 'Smith'), job('j2', 'Deck', 'Jones'), job('j3', 'Old shed', 'Smith', 'inactive')];
        const today = '2026-11-15';
        const docs: OverviewDoc[] = [
            doc('Estimate', 'j1', { status: 'Sent', issueDate: '2026-11-10', lineItems: [line(1, 4000)], estimateNumber: 'EST-1' }), // 5 days
            doc('Estimate', 'j2', { status: 'Sent', issueDate: '2026-10-20', lineItems: [line(2, 1500)], taxRate: 10, estimateNumber: 'EST-2', expiryDate: '2026-11-01' }), // 26 days, expired, 3300
            doc('Estimate', 'j1', { status: 'Sent', issueDate: '2026-11-01', lineItems: [line(1, 900)], estimateNumber: 'EST-3', clientSignedAt: noon('2026-11-03') }), // signed = accepted
            doc('Estimate', 'j1', { status: 'Accepted', issueDate: '2026-11-01', lineItems: [line(1, 100)], estimateNumber: 'EST-4' }),
            doc('Estimate', 'j2', { status: 'Rejected', issueDate: '2026-11-01', lineItems: [line(1, 100)], estimateNumber: 'EST-5' }),
            doc('Estimate', 'j2', { status: 'Sent', issueDate: '2026-11-01', lineItems: [line(1, 100)], estimateNumber: 'EST-6', clientDeclinedAt: '2026-11-04' }), // declined by the client
            doc('Estimate', 'j2', { status: 'Draft', issueDate: '2026-11-01', lineItems: [line(1, 100)], estimateNumber: 'EST-7' }),
            doc('Estimate', 'j3', { status: 'Sent', issueDate: '2026-09-01', lineItems: [line(1, 100)], estimateNumber: 'EST-8' }), // inactive job
            doc('Estimate', 'j2', { status: 'Sent', issueDate: '2026-11-12', lineItems: [line(1, 700)], estimateNumber: 'EST-9' }), // 3 days
            doc('Invoice', 'j1', { status: 'Sent', issueDate: '2026-11-01', lineItems: [line(1, 100)] }),
        ];
        // EST-10 revises EST-9 and is sent: it replaces it
        docs.push(doc('Estimate', 'j2', { status: 'Sent', issueDate: '2026-11-14', lineItems: [line(1, 800)], estimateNumber: 'EST-10', revisionOf: docs[8].id }));
        const jc = jobCustomerMap(jobs, docs);
        const aw = awaitingEstimates(docs, jobs, jc, today);
        eq('awaiting: oldest first', aw.rows.map(r => r.number), ['EST-2', 'EST-1', 'EST-10']);
        eq('awaiting: days waiting', aw.rows.map(r => r.daysWaiting), [26, 5, 1]);
        eq('awaiting: amounts (tax counted like the PDF)', aw.rows.map(r => r.amount), [3300, 4000, 800]);
        eq('awaiting: total value waiting', aw.total, 8100);
        eq('awaiting: count', aw.count, 3);
        eq('awaiting: stale after 7 days', aw.rows.map(r => r.stale), [true, false, false]);
        eq('awaiting: expired', aw.rows.map(r => r.expired), [true, false, false]);
        eq('awaiting: customers', aw.rows.map(r => r.customer), ['Jones', 'Smith', 'Jones']);
        eq('awaiting: job names', aw.rows.map(r => r.jobName), ['Deck', 'Kitchen', 'Deck']);
        eq('awaiting: the document is ready for the follow-up window', [aw.rows[0].doc.id, aw.rows[0].doc.type, aw.rows[0].doc.number], [docs[1].id, 'Estimate', 'EST-2']);
        eq('awaiting: customer filter', awaitingEstimates(docs, jobs, jc, today, { customerKey: 'smith', jobId: null }).rows.map(r => r.number), ['EST-1']);
        eq('awaiting: project filter', awaitingEstimates(docs, jobs, jc, today, { customerKey: null, jobId: 'j2' }).rows.map(r => r.number), ['EST-2', 'EST-10']);
        eq('awaiting: customer + project that do not match', awaitingEstimates(docs, jobs, jc, today, { customerKey: 'smith', jobId: 'j2' }).count, 0);
        eq('awaiting: unknown date goes last', awaitingEstimates([...docs, doc('Estimate', 'j1', { status: 'Sent', lineItems: [line(1, 50)], createdAt: 'not a date', estimateNumber: 'EST-X' })], jobs, jc, today).rows.map(r => r.number).pop(), 'EST-X');
        eq('awaiting: nothing', awaitingEstimates([], jobs, jc, today), { rows: [], total: 0, count: 0 });
        // an estimate with good/better/best options counts the option that counts
        const opt = doc('Estimate', 'j1', {
            status: 'Sent', issueDate: '2026-11-10', estimateNumber: 'EST-OPT', lineItems: [line(1, 100)],
            estimateOptions: {
                version: 1, kind: 'estimate', sharedLineItems: [], recommendedId: 'b',
                options: [{ id: 'g', name: 'Good', lineItems: [{ id: 'l1', ...line(1, 1000) }] }, { id: 'b', name: 'Best', lineItems: [{ id: 'l2', ...line(1, 3000) }] }],
            },
        });
        const awo = awaitingEstimates([opt], jobs, jc, today);
        eq('awaiting: an options estimate is worth the option that counts (Recommended)', awo.rows[0]?.amount, 3000);
    }

    // ============================================================================================ active jobs
    {
        const jobs: OverviewJob[] = [
            job('a', 'Alpha', 'Smith', 'active', { endDate: '2026-12-20' }),
            job('b', 'Bravo', 'Jones', 'active'),
            job('c', 'Charlie', 'Smith', 'paused', { endDate: '2026-11-30' }),
            job('d', 'Delta', 'Smith', 'completed'),
            job('e', 'Echo', 'Smith', 'inactive'),
            job('f', 'Foxtrot', 'Lee', 'active', { endDate: '2026-11-01' }),
        ];
        const today = '2026-11-15';
        const docs: OverviewDoc[] = [
            doc('Estimate', 'a', { status: 'Accepted', issueDate: '2026-10-01', lineItems: [line(1, 1000)] }),
            doc('Material Log', 'a', { date: '2026-10-05', items: [{ quantity: 1, unitCost: 1200 }] }), // 120% of the budget
            doc('Estimate', 'c', { status: 'Accepted', issueDate: '2026-10-01', lineItems: [line(1, 5000)] }),
            doc('Material Log', 'c', { date: '2026-10-05', items: [{ quantity: 1, unitCost: 500 }] }), // 10%
            doc('Expense Log', 'b', { date: '2026-10-05', amount: 80 }), // no budget
        ];
        const t = (id: string, jobId: string, extra: Partial<OverviewTask>): OverviewTask => ({ id, jobId, title: id, status: 'todo', startDate: null, dueDate: null, dependsOn: [], isMilestone: false, sortOrder: 10, ...extra });
        const tasks: OverviewTask[] = [
            t('t1', 'a', { status: 'done', dueDate: '2026-11-01' }),
            t('t2', 'a', { dueDate: '2026-11-10', title: 'Rough-in inspection', isMilestone: true }), // overdue
            t('t3', 'a', { dueDate: '2026-11-25' }),
            t('t4', 'b', { dueDate: '2026-11-20', status: 'doing', title: 'Order tile' }),
            t('t5', 'b', { dueDate: '2026-11-20', title: 'Pour slab', isMilestone: true }),
            t('t6', 'c', { status: 'done', dueDate: '2026-11-01' }),
            t('t7', 'd', { dueDate: '2026-11-01' }),
        ];
        const jc = jobCustomerMap(jobs, docs);
        const rows = activeJobRows(jobs, docs, tasks, jc, { todayYMD: today, laborRate: 45 });
        eq('active: active + paused jobs only', rows.map(r => r.name).sort(), ['Alpha', 'Bravo', 'Charlie', 'Foxtrot']);
        const by = Object.fromEntries(rows.map(r => [r.name, r]));
        eq('Alpha: over budget at 120%', [by.Alpha.budget, by.Alpha.spent, Math.round(by.Alpha.usedPct as number)], [1000, 1200, 120]);
        eq('Alpha: tasks 1 of 3, 1 overdue', by.Alpha.tasks, { done: 1, total: 3, percent: 33, overdue: 1 });
        eq('Alpha: progress = the Tasks tool', by.Alpha.tasks?.percent, taskProgress(tasks.filter(x => x.jobId === 'a'), today).percent);
        eq('Alpha: next due is the overdue milestone', [by.Alpha.next?.ymd, by.Alpha.next?.label, by.Alpha.next?.kind, by.Alpha.next?.overdue, by.Alpha.next?.days], ['2026-11-10', 'Rough-in inspection', 'milestone', true, -5]);
        eq('Alpha: warnings', by.Alpha.warnings, ['over_budget', 'task_overdue']);
        eq('Bravo: no budget, no % used', [by.Bravo.budget, by.Bravo.usedPct, by.Bravo.spent], [0, null, 80]);
        eq('Bravo: a milestone beats a task on the same day', [by.Bravo.next?.label, by.Bravo.next?.kind], ['Pour slab', 'milestone']);
        eq('Bravo: no warnings', by.Bravo.warnings, []);
        eq('Charlie: 10% used, all tasks done -> next date is the job end date', [Math.round(by.Charlie.usedPct as number), by.Charlie.next?.kind, by.Charlie.next?.ymd, by.Charlie.status], [10, 'job_end', '2026-11-30', 'paused']);
        eq('Foxtrot: past its end date, no tasks', [by.Foxtrot.tasks, by.Foxtrot.next?.overdue, by.Foxtrot.next?.days], [null, true, -14]);
        eq('sorted: over budget first, then the rest by their next date (Foxtrot Nov 1, Bravo Nov 20, Charlie Nov 30)', rows.map(r => r.name), ['Alpha', 'Foxtrot', 'Bravo', 'Charlie']);
        const noTasks = activeJobRows(jobs, docs, null, jc, { todayYMD: today, laborRate: 45 });
        eq('Tasks tool not ready: no task numbers, no task warning', noTasks.map(r => [r.tasks, r.warnings.includes('task_overdue')]), noTasks.map(() => [null, false]));
        eq('Tasks tool not ready: the next date is the job end date', noTasks.find(r => r.name === 'Alpha')?.next?.kind, 'job_end');
        eq('customer filter', activeJobRows(jobs, docs, tasks, jc, { todayYMD: today, laborRate: 45, filters: { customerKey: 'smith', jobId: null } }).map(r => r.name).sort(), ['Alpha', 'Charlie']);
        eq('project filter', activeJobRows(jobs, docs, tasks, jc, { todayYMD: today, laborRate: 45, filters: { customerKey: null, jobId: 'b' } }).map(r => r.name), ['Bravo']);
        eq('a completed job is not listed even when filtered', activeJobRows(jobs, docs, tasks, jc, { todayYMD: today, laborRate: 45, filters: { customerKey: null, jobId: 'd' } }), []);
        eq('active count', activeJobCount(jobs, jc), 3);
        eq('active count, customer filter', activeJobCount(jobs, jc, { customerKey: 'smith', jobId: null }), 1);
        eq('active count, project filter', activeJobCount(jobs, jc, { customerKey: null, jobId: 'f' }), 1);
        // costs ahead of the work: 60% of the budget spent while a progress invoice says 20% done
        const ahead: OverviewDoc[] = [
            doc('Estimate', 'a', { status: 'Accepted', issueDate: '2026-10-01', lineItems: [line(1, 1000)] }),
            doc('Material Log', 'a', { date: '2026-10-05', items: [{ quantity: 1, unitCost: 600 }] }),
            doc('Invoice', 'a', { status: 'Sent', issueDate: '2026-10-20', isProgressBilling: true, lineItems: [{ description: 'Work', quantity: 1, rate: 1000, percentComplete: 20 }] }),
        ];
        eq('costs ahead of the work', activeJobRows([jobs[0]], ahead, null, jc, { todayYMD: today, laborRate: 45 })[0].warnings, ['costs_ahead']);
    }

    // ============================================================================================ filters
    {
        const jobs = [job('1', 'Kitchen', 'Smith'), job('2', 'Deck', 'smith '), job('3', 'Roof', 'Jones'), job('4', 'Fence', '')];
        const docs: OverviewDoc[] = [
            doc('Invoice', '4', { status: 'Sent', issueDate: '2026-03-05', lineItems: [line(1, 10)], clientName: 'Lee Family' }),
            doc('Invoice', null, { status: 'Sent', issueDate: '2026-03-05', lineItems: [line(1, 10)], clientName: 'No Job Co' }),
        ];
        const jc = jobCustomerMap(jobs, docs);
        eq('job customers: the job client (trimmed), else the client written on its documents', [jc.get('1'), jc.get('2'), jc.get('3'), jc.get('4')], ['Smith', 'smith', 'Jones', 'Lee Family']);
        eq('customer options: A to Z, same name once', customerOptions(jobs, docs, jc), [
            { key: 'jones', name: 'Jones' }, { key: 'lee family', name: 'Lee Family' }, { key: 'no job co', name: 'No Job Co' }, { key: 'smith', name: 'Smith' },
        ]);
        eq('job options: all', jobOptions(jobs, jc, null).map(j => j.name), ['Deck', 'Fence', 'Kitchen', 'Roof']);
        eq('job options: one customer', jobOptions(jobs, jc, 'smith').map(j => j.name), ['Deck', 'Kitchen']);
        eq('pick a customer clears a project of someone else', setCustomerFilter({ customerKey: null, jobId: '3' }, 'smith', jc), { customerKey: 'smith', jobId: null });
        eq('pick the same customer keeps the project', setCustomerFilter({ customerKey: 'jones', jobId: '3' }, 'jones', jc), { customerKey: 'jones', jobId: '3' });
        eq('pick all customers keeps the project', setCustomerFilter({ customerKey: 'jones', jobId: '3' }, null, jc), { customerKey: null, jobId: '3' });
        eq('pick a project picks its customer', setJobFilter(NO_FILTERS, '3', jc), { customerKey: 'jones', jobId: '3' });
        eq('pick all projects keeps the customer', setJobFilter({ customerKey: 'jones', jobId: '3' }, null, jc), { customerKey: 'jones', jobId: null });
        eq('reconcile: a project that is gone', reconcileFilters({ customerKey: null, jobId: 'zzz' }, jobs, jc), { customerKey: null, jobId: null });
        eq('reconcile: a project of another customer', reconcileFilters({ customerKey: 'smith', jobId: '3' }, jobs, jc), { customerKey: 'smith', jobId: null });
        eq('reconcile: fine as it is', reconcileFilters({ customerKey: 'jones', jobId: '3' }, jobs, jc), { customerKey: 'jones', jobId: '3' });
        ok('isFiltering', !isFiltering(NO_FILTERS) && isFiltering({ customerKey: 'x', jobId: null }) && isFiltering({ customerKey: null, jobId: '1' }));
        eq('customerKey ignores case and spacing', customerKey('  Acme   Corp '), 'acme corp');
        const facts = buildFacts(docs, { laborRate: 45, todayYMD: '2026-03-31', jobs });
        eq('a document without a job keeps its own client name', facts.invoices.map(i => i.customer), ['Lee Family', 'No Job Co']);
    }

    // ============================================================================================ CSV
    {
        const jobs = [job('1', 'Kitchen, "big" job', '=HYPERLINK("http://evil","x")'), job('2', 'Deck', 'Jones'), job('3', 'Roof', 'Lee')];
        const docs: OverviewDoc[] = [
            doc('Invoice', '1', { status: 'Sent', issueDate: '2026-03-05', dueDate: '2026-03-10', lineItems: [line(1, 1000)], invoiceNumber: 'INV-1' }), doc('Expense Log', '1', { date: '2026-03-06', amount: 600 }),
            doc('Invoice', '2', { status: 'Paid', issueDate: '2026-03-05', paidAt: '2026-03-12', lineItems: [line(1, 500)] }),
            doc('Estimate', '3', { status: 'Sent', issueDate: '2026-02-20', lineItems: [line(1, 2500)], estimateNumber: 'EST-9' }),
        ];
        const today = '2026-03-31';
        const jc = jobCustomerMap(jobs, docs);
        const facts = buildFacts(docs, { laborRate: 45, todayYMD: today, jobs });
        const r = { startYMD: '2026-03-01', endYMD: '2026-03-31' };
        const model: OverviewExportModel = {
            label: 'March', range: r, customerFilter: '', projectFilter: '', profitBasis: 'period', rankBy: 'profit',
            kpis: overviewKpis(facts, r), leads: { newLeads: 4, won: 1, lost: 1, winRate: 0.5 }, activeJobCount: 3,
            profitRows: jobProfitRows(facts, jobs, { range: r }), awaiting: awaitingEstimates(docs, jobs, jc, today),
            activeJobs: activeJobRows(jobs, docs, null, jc, { todayYMD: today, laborRate: 45 }), customers: revenueByCustomer(facts, r).rows,
        };
        const rows = overviewCsvRows(model);
        ok('csv: every row has every column', rows.every(x => x.length === OVERVIEW_CSV_HEADER.length));
        const sections = Array.from(new Set(rows.map(x => x[0])));
        eq('csv: sections', sections, ['Summary', 'Profit by job', 'Waiting for approval', 'Active jobs', 'Revenue by customer']);
        const sum = (name: string) => rows.find(x => x[0] === 'Summary' && x[1] === name);
        eq('csv: billed', sum('Billed')?.[8], '1500.00');
        eq('csv: collected', sum('Collected')?.[8], '500.00');
        eq('csv: outstanding + overdue', [sum('Outstanding')?.[8], sum('Overdue')?.[8]], ['1000.00', '1000.00']);
        eq('csv: profit', sum('Profit')?.[8], '900.00');
        eq('csv: average days to get paid', [sum('Average days to get paid')?.[8], sum('Average days to get paid')?.[9]], [7, 'days']);
        eq('csv: leads', [sum('New leads')?.[8], sum('Lead win rate')?.[8]], [4, 50]);
        eq('csv: period note', sum('Period')?.[14], 'March (2026-03-01 to 2026-03-31)');
        eq('csv: filters in words', [sum('Customer filter')?.[14], sum('Project filter')?.[14]], ['All customers', 'All projects']);
        const profitRows = rows.filter(x => x[0] === 'Profit by job');
        eq('csv: profit rows = ranked, then not enough data', profitRows.map(x => [x[1], x[4], x[5], x[6], x[7], x[14]]), [
            ['Kitchen, "big" job', '1000.00', '600.00', '400.00', 40, ''],
            ['Deck', '500.00', '0.00', '500.00', '', 'Not enough data: no costs logged yet'],
        ]);
        const aw = rows.filter(x => x[0] === 'Waiting for approval');
        eq('csv: awaiting row', aw.map(x => [x[1], x[2], x[8], x[10]]), [['EST-9 - Roof', 'Lee', '2500.00', 39]]);
        const text = overviewCsv(model);
        ok('csv: BOM + CRLF', text.startsWith(CSV_BOM) && text.includes('\r\n'));
        ok('csv: a customer called =HYPERLINK(...) is neutralised', text.includes(`'=HYPERLINK(`) && !/(^|,)=HYPERLINK/.test(text));
        ok('csv: quotes and commas in names are escaped', text.includes('"Kitchen, ""big"" job"'));
        eq('csv: header row', text.slice(1, text.indexOf('\r\n')), OVERVIEW_CSV_HEADER.join(','));
        eq('csv: no leads when the Tasks/Leads tool is off', overviewCsvRows({ ...model, leads: null }).some(x => x[1] === 'New leads'), false);
        eq('csv: file name', overviewCsvFileName(r), 'overview-2026-03-01_to_2026-03-31.csv');
        eq('csv: file name without a range', overviewCsvFileName(null), 'overview.csv');
        const empty = overviewCsvRows({ ...model, profitRows: [], awaiting: { rows: [], total: 0, count: 0 }, activeJobs: [], customers: [] });
        eq('csv: empty sections add no rows', Array.from(new Set(empty.map(x => x[0]))), ['Summary']);
    }
}

// Git Bash on Windows does not forward TZ to node, so the script switches zones itself.
const zones = ['UTC', 'America/Los_Angeles', 'America/St_Johns', 'Pacific/Auckland', 'Europe/Berlin', 'Asia/Kolkata'];
for (const zone of zones) {
    process.env.TZ = zone;
    const before = failures;
    const offset = new Date(2026, 0, 15).getTimezoneOffset();
    runAll();
    console.log(`overview-check [${zone}, UTC${offset <= 0 ? '+' : '-'}${Math.abs(offset) / 60}h]: ${failures - before === 0 ? 'ok' : `${failures - before} failed`}`);
}
console.log(`overview-check: ${passes} assertions passed, ${failures} failed`);
if (failures) process.exit(1);
