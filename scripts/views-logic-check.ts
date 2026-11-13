/**
 * Pure-logic checks for the VIEWS area (analytics aggregation, calendar date mapping, label grid math,
 * stock/pricing math, local dates). Run in several time zones:
 *   npx tsx scripts/views-logic-check.ts
 *   TZ=America/Los_Angeles npx tsx scripts/views-logic-check.ts
 *   TZ=Pacific/Auckland npx tsx scripts/views-logic-check.ts
 */
import { addMonthsClamped, daysBetween, instantToLocalYMD, normalizeYMD, parseLocalDate, startOfWeekLocal, toLocalYMD } from '../utils/localDates.ts';
import { buildBuckets, chooseGranularity, computeAnalytics, documentDay, expenseTotal, presetRange, previousRange, relativeChange, type AnalyticsDoc } from '../utils/analyticsMath.ts';
import { agendaGroups, layoutWeek, monthGrid, scheduleStats, spansFor, spansOnDay, toDaySpan } from '../utils/calendarLayout.ts';
import { LABEL_SHEETS, getSheet, labelsPerSheet, placeLabels, sheetFitsPage, slotPosition } from '../utils/labelSheets.ts';
import { findReceiptInvoice, summarizeJobMoney, type FinanceDoc } from '../lib/finance.ts';
import { checkoutMoves, kitBuildable, kitCost, markupFromPrice, marginFromPrice, parseInventoryCode, priceBookKitTotals, priceFromMarkup, stockStatus, stockValue } from '../utils/stockMath.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else {
    failures++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

const runAll = () => {

// ---------------------------------------------------------------- local dates
eq('parseLocalDate keeps the calendar day', toLocalYMD(parseLocalDate('2026-03-10')!), '2026-03-10');
eq('parseLocalDate from timestamptz string keeps the written day', toLocalYMD(parseLocalDate('2026-03-10T00:00:00+00:00')!), '2026-03-10');
eq('parseLocalDate rejects overflow', parseLocalDate('2026-02-31'), null);
eq('parseLocalDate rejects junk', parseLocalDate('next tuesday'), null);
eq('parseLocalDate null', parseLocalDate(null), null);
eq('normalizeYMD pads', normalizeYMD('2026-3-5'), '2026-03-05');
eq('addMonthsClamped Jan31+1', toLocalYMD(addMonthsClamped(parseLocalDate('2026-01-31')!, 1)), '2026-02-28');
eq('addMonthsClamped leap', toLocalYMD(addMonthsClamped(parseLocalDate('2028-01-31')!, 1)), '2028-02-29');
eq('addMonthsClamped -1 from Mar 31', toLocalYMD(addMonthsClamped(parseLocalDate('2026-03-31')!, -1)), '2026-02-28');
eq('daysBetween across US DST', daysBetween(parseLocalDate('2026-03-07')!, parseLocalDate('2026-03-09')!), 2);
eq('daysBetween across EU DST', daysBetween(parseLocalDate('2026-10-24')!, parseLocalDate('2026-10-26')!), 2);
eq('startOfWeek Sunday', toLocalYMD(startOfWeekLocal(parseLocalDate('2026-11-12')!, 0)), '2026-11-08');
eq('startOfWeek Monday', toLocalYMD(startOfWeekLocal(parseLocalDate('2026-11-12')!, 1)), '2026-11-09');
{
  // an instant late in the local evening must stay on that local day
  const d = new Date(2026, 2, 10, 23, 30);
  eq('instantToLocalYMD local evening', instantToLocalYMD(d.toISOString()), '2026-03-10');
}

// ---------------------------------------------------------------- calendar
const jobs = [
  { id: 'a', name: 'A', startDate: '2026-03-10', endDate: '2026-03-12', status: 'active' },
  { id: 'b', name: 'B', startDate: '2026-03-10', endDate: null, status: 'active' },
  { id: 'c', name: 'C', startDate: '2026-03-07', endDate: '2026-03-16', status: 'paused' },
  { id: 'd', name: 'D', startDate: null, endDate: null, status: 'active' },
  { id: 'e', name: 'E', startDate: '2026-03-20', endDate: '2026-03-18', status: 'completed' }, // end before start
  { id: 'f', name: 'F', startDate: '2026-03-11T00:00:00+00:00', endDate: '2026-03-11', status: 'active' },
  { id: 'g', name: 'G', startDate: '2026-03-10', endDate: '2026-03-10', status: 'inactive' },
];
const spans = spansFor(jobs);
eq('unscheduled job skipped', spans.map((s) => s.id), ['a', 'b', 'c', 'e', 'f', 'g']);
eq('span a inclusive', [toDaySpan(jobs[0])!.startYMD, toDaySpan(jobs[0])!.endYMD, toDaySpan(jobs[0])!.days], ['2026-03-10', '2026-03-12', 3]);
eq('end before start → single day', [toDaySpan(jobs[4])!.endYMD, toDaySpan(jobs[4])!.days], ['2026-03-20', 1]);
eq('timestamptz start lands on written day', toDaySpan(jobs[5])!.startYMD, '2026-03-11');
eq('jobs on Mar 10', spansOnDay(spans, '2026-03-10').map((s) => s.id), ['c', 'a', 'b', 'g']);
eq('jobs on Mar 12 (multi-day end inclusive)', spansOnDay(spans, '2026-03-12').map((s) => s.id), ['c', 'a']);
eq('jobs on Mar 13', spansOnDay(spans, '2026-03-13').map((s) => s.id), ['c']);
eq('jobs on Mar 9', spansOnDay(spans, '2026-03-09').map((s) => s.id), ['c']);

const march = monthGrid(parseLocalDate('2026-03-15')!, 0);
eq('March 2026 grid starts Sun Mar 1', toLocalYMD(march[0][0]), '2026-03-01');
eq('March 2026 grid rows', march.length, 5);
eq('March 2026 grid last day', toLocalYMD(march[march.length - 1][6]), '2026-04-04');
const feb2026Mon = monthGrid(parseLocalDate('2026-02-01')!, 1);
eq('Feb 2026 Monday grid starts Jan 26', toLocalYMD(feb2026Mon[0][0]), '2026-01-26');
ok('every grid row has 7 consecutive days', march.every((w) => w.length === 7 && daysBetween(w[0], w[6]) === 6));

// week of Mar 8..14
const week2 = march[1];
eq('week 2 starts Mar 8', toLocalYMD(week2[0]), '2026-03-08');
const lay = layoutWeek(week2, spans, 3);
const segById = Object.fromEntries(lay.segments.map((s) => [s.span.id, [s.startCol, s.endCol, s.lane, s.continuesBefore, s.continuesAfter]]));
eq('c spans whole week, continues both sides', segById.c, [0, 6, 0, true, true]);
eq('a cols Tue..Thu lane 1', segById.a, [2, 4, 1, false, false]);
eq('b Tue lane 2', segById.b, [2, 2, 2, false, false]);
eq('f Wed reuses lane 2 (b ended Tue)', segById.f, [3, 3, 2, false, false]);
eq('g Tue needs a 4th lane → hidden and counted', [segById.g, lay.hiddenPerDay, lay.lanesUsed], [undefined, [0, 0, 1, 0, 0, 0, 0], 3]);
const lay2 = layoutWeek(week2, spans, 5);
eq('with 5 lanes g is visible in lane 3', lay2.segments.find((s) => s.span.id === 'g')?.lane, 3);
ok('no two visible segments overlap in the same lane', lay2.segments.every((s, i) => lay2.segments.every((t, j) => i === j || s.lane !== t.lane || s.endCol < t.startCol || t.endCol < s.startCol)));

const agenda = agendaGroups(spans, '2026-03-10', '2026-03-31');
eq('agenda groups', agenda.map((g) => [g.key, g.spans.map((s) => s.id)]), [['ongoing', ['c']], ['2026-03-10', ['a', 'b', 'g']], ['2026-03-11', ['f']], ['2026-03-20', ['e']]]);
eq('schedule stats', scheduleStats(jobs, '2026-03-15'), { active: 4, upcoming: 0, completed: 1, unscheduled: 1 });
eq('schedule stats upcoming (completed excluded)', scheduleStats(jobs, '2026-03-01').upcoming, 5);

// ---------------------------------------------------------------- analytics
const inv = (id: string, issueDate: string, status: string, lines: [number, number, number?][], extra: Partial<AnalyticsDoc> = {}): AnalyticsDoc => ({
  id, type: 'Invoice', createdAt: '2026-01-01T12:00:00Z', issueDate, status,
  lineItems: lines.map(([quantity, rate, unitCost]) => ({ quantity, rate, unitCost })), ...extra,
});
const docs: AnalyticsDoc[] = [
  inv('i1', '2026-03-01', 'Paid', [[2, 100, 40]], { taxRate: 10, discount: 20 }), // sub 200, -20 = 180, tax 18 => 198; cost 80
  inv('i2', '2026-03-15', 'Sent', [[1, 500]], { dueDate: '2026-03-20', clientName: 'Acme' }), // 500 overdue (today 3/31)
  inv('i3', '2026-03-31', 'Overdue', [[3, 50]], { shipping: 10, clientName: 'acme ' }), // 160
  inv('i4', '2026-03-10', 'Draft', [[1, 999]]),
  inv('i5', '2026-03-12', 'Cancelled', [[1, 999]]),
  inv('i6', '2026-04-01', 'Paid', [[1, 1000]]), // out of range
  inv('i7', '2026-02-28', 'Paid', [[1, 1000]]), // out of range (previous period)
  inv('i8', '2026-03-20', 'Sent', [[1, 300]], { amountPaid: 100, dueDate: '2026-04-30' }), // 300, collected 100, outstanding 200
  { id: 'i9', type: 'Invoice', createdAt: new Date(2026, 2, 5, 23, 30).toISOString(), status: 'Paid', lineItems: [{ quantity: 1, rate: 50 }] }, // no issueDate → local created day Mar 5
  { id: 'p1', type: 'Invoice', createdAt: '2026-03-02T10:00:00Z', issueDate: '2026-03-02', status: 'Paid', isProgressBilling: true, lineItems: [{ quantity: 1, rate: 1000, percentComplete: 50, previouslyBilled: 200 }] }, // 300
  { id: 'e1', type: 'Estimate', createdAt: '2026-03-01T10:00:00Z', issueDate: '2026-03-03', status: 'Accepted', lineItems: [{ quantity: 1, rate: 100 }] },
  { id: 'e2', type: 'Estimate', createdAt: '2026-03-01T10:00:00Z', issueDate: '2026-03-04', status: 'Rejected', lineItems: [{ quantity: 1, rate: 100 }] },
  { id: 'e3', type: 'Estimate', createdAt: '2026-03-01T10:00:00Z', issueDate: '2026-03-05', status: 'Sent', lineItems: [{ quantity: 2, rate: 250 }] },
  { id: 'e4', type: 'Estimate', createdAt: '2026-03-01T10:00:00Z', issueDate: '2026-03-06', status: 'Draft', lineItems: [{ quantity: 1, rate: 100 }] },
  { id: 'x1', type: 'Expense Log', createdAt: '2026-03-01T10:00:00Z', date: '2026-03-08', amount: 45.5 },
  { id: 'x2', type: 'Expense Log', createdAt: '2026-03-01T10:00:00Z', date: '2026-03-09', amount: 0, lineItems: [{ quantity: 2, rate: 10 }], tax: 1.6 },
  { id: 'x3', type: 'Expense Log', createdAt: '2026-03-01T10:00:00Z', date: '2026-04-09', amount: 999 },
  { id: 'n1', type: 'Note', createdAt: '2026-03-01T10:00:00Z' },
];
eq('documentDay invoice', documentDay(docs[0]), '2026-03-01');
eq('documentDay falls back to local created day', documentDay(docs[8]), '2026-03-05');
eq('expenseTotal amount', expenseTotal(docs[14]), 45.5);
eq('expenseTotal from lines + tax', expenseTotal(docs[15]), 21.6);

const a = computeAnalytics(docs, '2026-03-01', '2026-03-31', { todayYMD: '2026-03-31' });
eq('revenue = paid totals + partial payments', a.revenue, 198 + 50 + 300 + 100);
eq('invoiced excludes draft/cancelled', a.invoiced, 198 + 500 + 160 + 300 + 50 + 300);
eq('invoice count', a.invoiceCount, 6);
eq('avg invoice', a.avgInvoice, Math.round(((198 + 500 + 160 + 300 + 50 + 300) / 6) * 100) / 100);
eq('outstanding = balance due on sent/overdue', a.outstanding, 500 + 160 + 200);
eq('outstanding count', a.outstandingCount, 3);
eq('overdue (status or past due date)', [a.overdue, a.overdueCount], [660, 2]);
eq('cost of goods on paid invoices', a.costOfGoods, 80);
eq('expenses in range', [a.expenses, a.expenseCount], [67.1, 2]);
eq('income = billed invoices (no receipts here)', a.income, 1508);
eq('costs = expense logs (no material logs / time sheets here)', a.costs, 67.1);
eq('profit = income - costs (lib/finance.ts, same as Job financials)', a.profit, Math.round((1508 - 67.1) * 100) / 100);
eq('estimates', [a.estimatesSent, a.estimatesAccepted, a.estimatesRejected, a.estimatesPending, a.pipeline], [3, 1, 1, 1, 500]);
eq('win rate', a.winRate, 1 / 3);
eq('status counts', a.invoiceStatusCounts, { Paid: 3, Sent: 2, Overdue: 1, Draft: 1, Cancelled: 1 });
eq('top clients merge case/space, unnamed excluded', a.topClients, [{ name: 'Acme', invoiced: 660, collected: 0, invoices: 2 }]);
eq('daily granularity for a month', a.granularity, 'day');
eq('31 daily buckets', a.buckets.length, 31);
eq('bucket Mar 1 revenue', a.buckets[0].revenue, 198);
eq('bucket Mar 5 revenue (created-day fallback)', a.buckets[4].revenue, 50);
eq('bucket Mar 9 expenses', a.buckets[8].expenses, 21.6);
eq('bucket sum = revenue', Math.round(a.buckets.reduce((s, b) => s + b.revenue, 0) * 100) / 100, a.revenue);
const empty = computeAnalytics(docs, '2026-03-31', '2026-03-01');
eq('inverted range yields zeros', [empty.revenue, empty.buckets.length], [0, 0]);

// ---------------------------------------------------------------- one money definition (lib/finance.ts)
{
  const job: FinanceDoc[] = [
    { id: 'inv1', type: 'Invoice', jobId: 'j', status: 'Sent', invoiceNumber: 'INV-2026-11-004', lineItems: [{ quantity: 1, rate: 112.68 }] },
    { id: 'inv2', type: 'Invoice', jobId: 'j', status: 'Paid', invoiceNumber: 'INV-2026-11-005', lineItems: [{ quantity: 2, rate: 100 }] },
    { id: 'inv3', type: 'Invoice', jobId: 'j', status: 'Draft', invoiceNumber: 'INV-2026-11-006', lineItems: [{ quantity: 1, rate: 999 }] },
    { id: 'inv4', type: 'Invoice', jobId: 'j', status: 'Sent', invoiceNumber: 'INV-1', amountPaid: 50, isProgressBilling: 'false', lineItems: [{ quantity: 1, rate: 300 }] },
    { id: 'r1', type: 'Receipt', jobId: 'j', amount: 112.68, description: 'Deposit for kitchen (invoice INV-2026-11-004)' },
    { id: 'r2', type: 'Receipt', jobId: 'j', amount: 200, description: 'Paid INV-2026-11-005 in full' },
    { id: 'r3', type: 'Receipt', jobId: 'j', amount: 40, description: 'Cash for extra trip' },
    { id: 'r4', type: 'Receipt', jobId: 'j', amount: 25, description: 'Part of INV-10' },
    { id: 'e1', type: 'Estimate', jobId: 'j', status: 'Accepted', lineItems: [{ quantity: 1, rate: 5000 }] },
    { id: 'e2', type: 'Estimate', jobId: 'j', status: 'Sent', lineItems: [{ quantity: 1, rate: 7000 }] },
    { id: 'c1', type: 'Change Order', jobId: 'j', clientSignedAt: '2026-11-10T10:00:00Z', lineItems: [{ quantity: 1, rate: 750 }] },
    { id: 'c2', type: 'Change Order', jobId: 'j', status: 'Draft', lineItems: [{ quantity: 1, rate: 99 }] },
    { id: 'c3', type: 'Change Order', jobId: 'j', status: 'Approved', lineItems: [{ quantity: 1, rate: -100 }] },
    { id: 'm1', type: 'Material Log', jobId: 'j', items: [{ quantity: 3, unitCost: 10 }, { quantity: 1, unitCost: 5.5 }] },
    { id: 'm2', type: 'Material Log', jobId: 'j', materials: [{ quantity: 2, unitCost: 4 }] },
    { id: 'x1', type: 'Expense Log', jobId: 'j', amount: 21.6, lineItems: [{ quantity: 2, rate: 10 }], tax: 1.6 },
    { id: 't1', type: 'Time Sheet', jobId: 'j', hoursWorked: '8', overtimeHours: '2' },
  ];
  const money = summarizeJobMoney(job, { laborRate: 50 });
  eq('receipt matched by the invoice number in its text', findReceiptInvoice(job[4], job.filter((d) => d.type === 'Invoice'))?.id, 'inv1');
  eq('INV-10 does not match INV-1', findReceiptInvoice(job[7], job.filter((d) => d.type === 'Invoice')), null);
  eq('invoiced = billed invoices only', [money.invoiced, money.invoiceCount], [612.68, 3]);
  eq('collected = receipt on open invoice + paid invoice (its receipt not doubled) + deposit + other receipts', money.collected, Math.round((112.68 + 200 + 50 + 40 + 25) * 100) / 100);
  eq('outstanding after receipts and deposits', money.outstanding, 250);
  eq('other receipts are income', [money.otherReceipts, money.income], [65, Math.round((612.68 + 65) * 100) / 100]);
  eq('contract value = accepted estimate + approved/signed change orders', [money.contractValue, money.estimateCount, money.changeOrderCount], [5000 + 750 - 100, 1, 2]);
  eq('costs = materials + expenses + labor (OT 1.5x)', [money.materials, money.expenses, money.labor, money.costs], [43.5, 21.6, 8 * 50 + 2 * 75, 43.5 + 21.6 + 550]);
  eq('job profit = income - costs', money.profit, Math.round((677.68 - 615.1) * 100) / 100);
  const ins = computeAnalytics(job.map((d) => ({ ...d, createdAt: '2026-11-10T12:00:00Z', issueDate: '2026-11-10', date: '2026-11-10' })), '2026-11-01', '2026-11-30', { todayYMD: '2026-11-13', laborRate: 50 });
  eq('Insights uses the same profit as Job financials', [ins.income, ins.costs, ins.profit], [money.income, money.costs, money.profit]);
  eq('Insights collected matches Job financials', ins.revenue, money.collected);
}

eq('granularity week', chooseGranularity('2026-01-01', '2026-03-31'), 'week');
eq('granularity month', chooseGranularity('2026-01-01', '2026-12-31'), 'month');
const weeks = buildBuckets('2026-03-04', '2026-03-31', 'week');
eq('week buckets Mon-based, clipped to range', weeks.map((b) => [b.startYMD, b.endYMD]), [['2026-03-04', '2026-03-08'], ['2026-03-09', '2026-03-15'], ['2026-03-16', '2026-03-22'], ['2026-03-23', '2026-03-29'], ['2026-03-30', '2026-03-31']]);
const months = buildBuckets('2026-01-15', '2026-04-10', 'month');
eq('month buckets clipped to range', months.map((b) => [b.startYMD, b.endYMD]), [['2026-01-15', '2026-01-31'], ['2026-02-01', '2026-02-28'], ['2026-03-01', '2026-03-31'], ['2026-04-01', '2026-04-10']]);
eq('month bucket labels', months.map((b) => b.label), ['Jan', 'Feb', 'Mar', 'Apr']);
eq('previous range', previousRange('2026-03-01', '2026-03-31'), { startYMD: '2026-01-29', endYMD: '2026-02-28' });
eq('relative change', [relativeChange(150, 100), relativeChange(5, 0)], [0.5, null]);
eq('preset this-month', presetRange('this-month', new Date(2026, 10, 12, 22, 0)), { startYMD: '2026-11-01', endYMD: '2026-11-12' });
eq('preset last-30', presetRange('last-30', new Date(2026, 10, 12, 22, 0)), { startYMD: '2026-10-14', endYMD: '2026-11-12' });
eq('preset last-year', presetRange('last-year', new Date(2026, 0, 1, 0, 5)), { startYMD: '2025-01-01', endYMD: '2025-12-31' });
{
  const year = computeAnalytics(docs, '2026-01-01', '2026-12-31', { todayYMD: '2026-12-31' });
  eq('year: month buckets', year.buckets.length, 12);
  eq('year: Feb has i7', year.buckets[1].revenue, 1000);
  eq('year: Apr has i6', year.buckets[3].revenue, 1000);
}

// ---------------------------------------------------------------- label sheets
for (const sheet of LABEL_SHEETS) ok(`${sheet.id} fits its page`, sheetFitsPage(sheet));
const s5160 = getSheet('avery-5160');
eq('5160 has 30 labels', labelsPerSheet(s5160), 30);
eq('5160 slot 0', slotPosition(s5160, 0), { row: 0, col: 0, x: 0.1875, y: 0.5 });
eq('5160 slot 29 (last)', slotPosition(s5160, 29), { row: 9, col: 2, x: 5.6875, y: 9.5 });
ok('5160 right margin symmetric', Math.abs(8.5 - (5.6875 + 2.625) - 0.1875) < 1e-9);
const p = placeLabels(s5160, 35, 28);
eq('start slot 28: page sizes', p.map((pg) => pg.labels.length), [2, 30, 3]);
eq('start slot 28: first labels slots', p[0].labels.map((l) => l.slot), [28, 29]);
eq('second page restarts at slot 0', p[1].labels[0].slot, 0);
eq('label indices are continuous', p.flatMap((pg) => pg.labels.map((l) => l.index)).join(','), Array.from({ length: 35 }, (_, i) => i).join(','));
eq('zero labels → no pages', placeLabels(s5160, 0).length, 0);
eq('start slot clamped', placeLabels(s5160, 1, 99)[0].labels[0].slot, 29);
const s5163 = getSheet('avery-5163');
eq('5163 slot 9', slotPosition(s5163, 9), { row: 4, col: 1, x: 4.3438, y: 8.5 });
const l7160 = getSheet('avery-l7160');
eq('L7160 has 21', labelsPerSheet(l7160), 21);
ok('L7160 right margin ~= left', Math.abs(210 - (slotPosition(l7160, 2).x + 63.5) - 7.21) < 0.02);
const a430 = getSheet('a4-30');
eq('A4 30 is the original layout', [a430.id, a430.pageSize, labelsPerSheet(a430), a430.labelWidth, a430.labelHeight], ['a4-30', 'A4', 30, 60, 25.4]);
eq('A4 30 slot 29 (last)', slotPosition(a430, 29), { row: 9, col: 2, x: 144, y: 238.6 });

// ---------------------------------------------------------------- stock & pricing
eq('stock ok', stockStatus({ quantity: 10, low_stock_threshold: 5 }), 'ok');
eq('stock low at threshold', stockStatus({ quantity: 5, low_stock_threshold: 5 }), 'low');
eq('threshold 0 means only empty warns', stockStatus({ quantity: 1, low_stock_threshold: 0 }), 'ok');
eq('missing threshold defaults to 5', stockStatus({ quantity: 4, low_stock_threshold: null }), 'low');
eq('zero is out', stockStatus({ quantity: 0, low_stock_threshold: 0 }), 'out');
eq('negative is oversold', stockStatus({ quantity: -2 }), 'oversold');
eq('stock value ignores negative', stockValue({ id: 'x', quantity: -3, cost_price: 10 }), 0);
eq('stock value', stockValue({ id: 'x', quantity: 3, cost_price: 2.5 }), 7.5);
const byId = new Map([
  ['p', { id: 'p', quantity: 10, cost_price: 2 }],
  ['q', { id: 'q', quantity: 3, cost_price: 5 }],
]);
const kit = { id: 'k', is_assembly: true, quantity: 99, assembly_items: [
  { item_id: 'p', quantity: 2 }, { item_id: 'q', quantity: 1 }, { item_id: 'zz', quantity: 1, is_custom: true, custom_name: 'Zip ties' }, { item_id: 'p', quantity: 1 },
] };
eq('kit buildable = min(floor(stock/qty))', kitBuildable(kit, byId), 3);
eq('kit cost', kitCost(kit, byId), 2 * 2 + 5 + 2);
eq('kit checkout merges duplicate components, skips custom', checkoutMoves(kit, 2), [{ itemId: 'p', delta: -6 }, { itemId: 'q', delta: -2 }]);
eq('plain checkout', checkoutMoves({ id: 'p', quantity: 1 }, 3), [{ itemId: 'p', delta: -3 }]);
eq('kit without components not buildable', kitBuildable({ id: 'k2', is_assembly: true, assembly_items: [] }, byId), null);
eq('price from markup', priceFromMarkup(80, 25), 100);
eq('markup from price', markupFromPrice(80, 100), 25);
eq('margin from price', marginFromPrice(80, 100), 20);
eq('markup undefined at cost 0', markupFromPrice(0, 100), null);
eq('price book kit totals', priceBookKitTotals(
  [{ item_id: 'a', quantity: 2 }, { item_id: 'b', quantity: 1, override_price: 0 }, { item_id: 'c', quantity: 1, is_custom: true, override_price: 15, custom_cost: 9 }],
  new Map([['a', { id: 'a', rate: 30, unit_cost: 10 }], ['b', { id: 'b', rate: 50, unit_cost: 20 }]]),
), { cost: 2 * 10 + 20 + 9, retail: 2 * 30 + 0 + 15 });

  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  eq('code: app link', parseInventoryCode(`https://contractordocs.app/inventory?item=${id}`), id);
  eq('code: link with extra params', parseInventoryCode(`http://localhost:3010/inventory?x=1&item=${id.toUpperCase()}&y=2`), id);
  eq('code: bare uuid (old labels)', parseInventoryCode(`  ${id}  `), id);
  eq('code: junk', parseInventoryCode('hello world'), null);
  eq('code: empty', parseInventoryCode(''), null);
  eq('fractional stock is fine', stockStatus({ quantity: 0.5, low_stock_threshold: 0 }), 'ok');

};

// Git Bash on Windows does not forward TZ to node, so the script switches zones itself.
const zones = ['UTC', 'America/Los_Angeles', 'America/St_Johns', 'Pacific/Auckland', 'Europe/Berlin', 'Asia/Kolkata'];
for (const zone of zones) {
  process.env.TZ = zone;
  const before = failures;
  const offset = new Date(2026, 0, 15).getTimezoneOffset();
  runAll();
  console.log(`views-logic-check [${zone}, UTC${offset <= 0 ? '+' : '-'}${Math.abs(offset) / 60}h]: ${failures - before === 0 ? 'ok' : `${failures - before} failed`}`);
}
console.log(`views-logic-check: ${passes} assertions passed, ${failures} failed`);
if (failures) process.exit(1);
