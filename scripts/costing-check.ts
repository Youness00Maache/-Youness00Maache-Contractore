/**
 * Job costing + one-tap T&M invoice checks (pure logic, no browser, no network):
 *   npx tsx scripts/costing-check.ts
 *
 *  1. lib/costing.ts: budget (= contract value) split by kind, actual (= profit costs + sent purchase orders, PO lines
 *     already on a material log counted once), % used, % complete (progress invoice / manual), status + projection
 *  2. the shared profit definition is unchanged: costing's profit part = Job financials costs = Insights costs
 *  3. lib/tmInvoice.ts: unbilled entries, billed record + markers (cancel / delete / duplicate free them),
 *     rates, lines (per worker / per day, OT 1.5×, price book vs markup, expenses), the Draft invoice data
 *  4. wiring: job page button, App mount with the Free-plan slot check before creating, no migration, help guide
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    classifyBudgetLine, classifyExpense, classifyPurchaseLine, classifyText, costingStatus, overrunText, parsePercent, priceBookTypes,
    progressFromInvoices, resolveProgress, summarizeJobCosting, type CostingDoc,
} from '../lib/costing.ts';
import {
    billedIndex, buildTmInvoiceData, buildTmLines, collectUnbilled, dayRange, defaultTmPrefs, entryDay, materialItemKeys, materialPrice,
    nextInvoiceNumber, parseTmRecord, priceBookLaborRate, shortDay, tmRecordFor, unbilledSummary, withBilledMarker, type TmPrefs,
} from '../lib/tmInvoice.ts';
import { summarizeJobMoney } from '../lib/finance.ts';
import { computeAnalytics, type AnalyticsDoc } from '../utils/analyticsMath.ts';
import { computeDocumentTotals } from '../utils/money.ts';
import { localISODate } from '../components/forms/formUtils.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => {
    if (ok) passed++;
    else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
};
const eq = (name: string, actual: unknown, expected: unknown) => check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
const near = (name: string, actual: number | null | undefined, expected: number, tol = 0.01) =>
    check(name, actual !== null && actual !== undefined && Math.abs(actual - expected) <= tol, { actual, expected });

// ---------------------------------------------------------------------------------------------------------------
// fixture: one job
// ---------------------------------------------------------------------------------------------------------------
const C = '2026-11-01T12:00:00.000Z';
const doc = (id: string, type: string, fields: Partial<CostingDoc>): CostingDoc => ({ id, type, jobId: 'job-1', createdAt: C, ...fields });
const DOCS: CostingDoc[] = [
    doc('est1', 'Estimate', {
        status: 'Accepted', taxRate: 0,
        lineItems: [
            { description: 'Labor - framing', quantity: 40, rate: 65 },
            { description: 'Lumber package', quantity: 1, rate: 3000, inventoryItemId: 'inv-1' } as any,
            { description: 'Permit fee', quantity: 1, rate: 250 } as any,
            { description: 'Kitchen remodel misc', quantity: 1, rate: 500 } as any,
        ],
    }),
    doc('est2', 'Estimate', { status: 'Draft', lineItems: [{ description: 'Labor', quantity: 1, rate: 10000 } as any] }),
    doc('co1', 'Change Order', { status: 'Approved', lineItems: [{ description: 'Install additional outlets', quantity: 4, rate: 50 } as any] }),
    doc('co2', 'Change Order', { status: 'Rejected', lineItems: [{ description: 'Labor', quantity: 1, rate: 900 } as any] }),
    doc('ts1', 'Time Sheet', { date: '2026-11-03', workerName: 'Mike', hoursWorked: '8', overtimeHours: '2' }),
    doc('ts2', 'Time Sheet', { date: '2026-11-04', workerName: 'Mike', hoursWorked: 8, overtimeHours: 0 }),
    doc('ts3', 'Time Sheet', { date: '2026-11-05', workerName: 'Ana', hoursWorked: 6, overtimeHours: 0 }),
    doc('ml1', 'Material Log', {
        date: '2026-11-04',
        items: [
            { id: 'a', name: '2x4 studs', quantity: 20, unitCost: 4.5, inventoryItemId: 'inv-9' } as any,
            { id: 'b', name: 'Drywall sheet', quantity: 10, unitCost: 12 } as any,
        ],
    }),
    doc('ex1', 'Expense Log', { date: '2026-11-02', category: 'Material', vendor: 'Home Depot', item: 'Screws', amount: 200 }),
    doc('ex2', 'Expense Log', { date: '2026-11-02', category: 'Fuel', vendor: 'Shell', amount: 60 }),
    doc('ex3', 'Expense Log', { date: '2026-11-02', category: 'Other', vendor: 'WM', item: 'Dumpster rental', amount: 350 }),
    doc('ex4', 'Expense Log', { date: '2026-11-02', category: 'Other', item: 'Parking', amount: 15 }),
    doc('po1', 'Purchase Order', {
        status: 'Sent', date: '2026-11-02',
        lineItems: [
            { description: '2x4 studs', quantity: 20, rate: 4.5 } as any,
            { description: 'Electrical subcontractor rough-in', quantity: 1, rate: 1200 } as any,
            { description: 'Drywall mud', quantity: 2, rate: 15 } as any,
        ],
    }),
    doc('po2', 'Purchase Order', { status: 'Draft', lineItems: [{ description: 'Tile', quantity: 1, rate: 999 } as any] }),
    doc('po3', 'Purchase Order', { status: 'Cancelled', lineItems: [{ description: 'Tile', quantity: 1, rate: 888 } as any] }),
    doc('inv1', 'Invoice', { status: 'Sent', issueDate: '2026-11-06', invoiceNumber: 'INV-2026-11-001', lineItems: [{ description: 'Deposit', quantity: 1, rate: 2000 } as any] }),
];
const RATE = 40;

// ---------------------------------------------------------------------------------------------------------------
// 1. classifying
// ---------------------------------------------------------------------------------------------------------------
{
    eq('words: labor', classifyText('Labor - framing'), 'labor');
    eq('words: install beats the material word', classifyText('Install additional outlets'), 'labor');
    eq('words: sub panel is not a subcontractor', classifyText('Sub panel install'), 'labor');
    eq('words: permit fee → subs & other', classifyText('Permit fee'), 'other');
    eq('words: subcontractor → subs & other', classifyText('Electrical subcontractor rough-in'), 'other');
    eq('words: mileage → expenses', classifyText('Mileage'), 'expenses');
    eq('words: copper pipe → materials', classifyText('Copper pipe 3/4"'), 'materials');
    eq('words: nothing said → null', classifyText('Kitchen remodel misc'), null);
    const types = priceBookTypes([{ name: 'Tile setting', type: 'labor' }, { name: 'Grout bag', type: 'material' }, { name: 'Bath kit', type: 'bundle' }]);
    eq('price book: "<name> - <description>" uses the item type', classifyBudgetLine({ description: 'Tile setting - bathroom floor' }, types), 'labor');
    eq('price book: material type', classifyBudgetLine({ description: 'Grout bag' }, types), 'materials');
    eq('price book: bundle falls back to the words', classifyBudgetLine({ description: 'Bath kit' }, types), null);
    eq('inventory line → materials', classifyBudgetLine({ description: 'Widget', inventoryItemId: 'x' }), 'materials');
    eq('PO line without words → materials', classifyPurchaseLine({ description: 'ABC-123' }), 'materials');
    eq('PO line for labor → subs & other', classifyPurchaseLine({ description: 'Install crew day' }), 'other');
    eq('expense category Material → materials', classifyExpense({ category: 'Material', vendor: 'Shell' }), 'materials');
    eq('expense rental → subs & other', classifyExpense({ category: 'Other', item: 'Tool rental' }), 'other');
    eq('expense fuel → expenses', classifyExpense({ category: 'Fuel', vendor: 'Shell' }), 'expenses');
}

// ---------------------------------------------------------------------------------------------------------------
// 2. budget vs actual
// ---------------------------------------------------------------------------------------------------------------
{
    const money = summarizeJobMoney(DOCS, { laborRate: RATE });
    const c = summarizeJobCosting(DOCS, { laborRate: RATE, manualPercent: 60 });
    const row = (id: string) => c.rows.find(r => r.id === id)!;
    eq('budget = contract value (accepted estimate + approved change order)', [c.budget, money.contractValue], [6550, 6550]);
    eq('counts', [c.estimateCount, c.changeOrderCount], [1, 1]);
    eq('budget split: labor / materials / expenses / other / not split', [row('labor').budget, row('materials').budget, row('expenses').budget, row('other').budget, c.unsplitBudget], [2800, 3000, null, 250, 500]);
    eq('kinds + not split add up to the budget', c.rows.reduce((s, r) => s + (r.budget ?? 0), 0) + c.unsplitBudget, c.budget);
    eq('labor actual = time sheets × labor rate (OT 1.5×)', row('labor').actual, 8 * 40 + 2 * 60 + 8 * 40 + 6 * 40);
    // roadmap N2: the Sent PO (nothing delivered yet) is COMMITTED, not spent; spent + ordered = the old "actual"
    eq('materials: spent = material logs + Material expense logs; the Sent PO material line is ordered', [row('materials').actual, row('materials').sources, row('materials').committed], [410, [{ label: 'Material logs', amount: 210 }, { label: 'Expense logs', amount: 200 }], 30]);
    eq('expenses = fuel + parking', row('expenses').actual, 75);
    eq('subs & other: dumpster rental spent + subcontractor PO line ordered', [row('other').actual, row('other').committed], [350, 1200]);
    eq('purchase orders: Sent = committed, Draft / Cancelled = nothing, line already on a material log counted once', c.purchaseOrders, { amount: 0, committed: 1230, count: 0, committedCount: 1, skippedLines: 1 });
    eq('actual = profit costs + purchase orders (delivered part)', c.actual, c.profitCosts + c.purchaseOrders.amount);
    eq('spent + ordered = the old actual (profit costs + sent POs)', c.actual + c.committed, 3065);
    eq('remaining = revised budget − spent − ordered', c.remaining, 6550 - 3065);
    eq('original budget = the first accepted estimate; change order on top', [c.original?.amount, c.original?.id, c.budgetChanges], [6350, 'est1', 200]);
    eq('profit part of actual = Job financials costs (one profit definition)', c.profitCosts, money.costs);
    near('% used', c.usedPct, (3065 / 6550) * 100);
    near('labor % used', row('labor').usedPct, (1000 / 2800) * 100);
    eq('expenses % used without a budget is null', row('expenses').usedPct, null);
    eq('manual % complete used without a progress invoice', c.progress, { percent: 60, source: 'manual' });
    near('projection: final cost at this pace', c.projection?.finalCost, 3065 / 0.6, 0.01);
    near('projection: profit', c.projection?.profit, 6550 - 3065 / 0.6, 0.01);
    eq('status: on track', [c.status.kind, c.status.tone], ['ok', 'success']);

    const ahead = summarizeJobCosting(DOCS, { laborRate: RATE, manualPercent: 40 });
    eq('status: costs ahead of the work (47% used at 40% complete)', [ahead.status.kind, ahead.status.tone, ahead.status.title], ['ahead', 'danger', 'Costs are ahead of the work']);
    eq('status: thin margin (47% used at 50% complete)', summarizeJobCosting(DOCS, { laborRate: RATE, manualPercent: 50 }).status.kind, 'thin');
    eq('status: too early to judge at 5% complete', summarizeJobCosting(DOCS, { laborRate: RATE, manualPercent: 5 }).status.kind, 'unknown');
    eq('status: no % complete', summarizeJobCosting(DOCS, { laborRate: RATE, manualPercent: null }).status.kind, 'unknown');
    eq('no projection without % complete', summarizeJobCosting(DOCS, { laborRate: RATE }).projection, null);
    const over = summarizeJobCosting([...DOCS, doc('exBig', 'Expense Log', { category: 'Other', item: 'Crane', amount: 5000 })], { laborRate: RATE, manualPercent: 90 });
    eq('status: over budget', [over.status.kind, over.status.tone], ['over', 'danger']);
    const early = costingStatus({ budget: 1000, actual: 600, usedPct: 60, progress: { percent: 5, source: 'manual' }, projection: null });
    eq('status: a big gap counts even early (60% used at 5%)', early.kind, 'ahead');
    const none = summarizeJobCosting(DOCS.filter(d => d.type !== 'Estimate' && d.type !== 'Change Order'), { laborRate: RATE, manualPercent: 50 });
    eq('status: no budget', [none.budget, none.usedPct, none.status.kind, none.projection], [0, null, 'nobudget', null]);

    // tax / discount: the split still adds up to the cent
    const taxed = summarizeJobCosting([doc('e', 'Estimate', {
        status: 'Accepted', taxRate: 8.25, discount: 10,
        lineItems: [{ description: 'Labor', quantity: 1, rate: 100 } as any, { description: 'Paint', quantity: 1, rate: 200 } as any, { description: 'Misc', quantity: 1, rate: 333.33 } as any],
    })], { laborRate: RATE });
    eq('taxed estimate: kinds + not split = budget', Math.round((taxed.rows.reduce((s, r) => s + (r.budget ?? 0), 0) + taxed.unsplitBudget) * 100) / 100, taxed.budget);
    eq('client-signed estimate counts (status Sent + signature)', summarizeJobCosting([doc('e', 'Estimate', { status: 'Sent', clientSignedAt: '2026-11-01', lineItems: [{ description: 'Labor', quantity: 1, rate: 10 } as any] })], { laborRate: 0 }).budget, 10);

    // Insights (utils/analyticsMath.ts) costs = Job financials costs on the same documents: purchase orders stay out of profit
    const ins = computeAnalytics(DOCS as unknown as AnalyticsDoc[], '2026-11-01', '2026-11-30', { laborRate: RATE, todayYMD: '2026-11-14' });
    eq('Insights costs = Job financials costs = costing profit part', [ins.costs, money.costs], [c.profitCosts, c.profitCosts]);
}

// ---------------------------------------------------------------------------------------------------------------
// 2b. roadmap N2: purchase orders split into actual (delivered / invoiced) vs committed (still expected)
// ---------------------------------------------------------------------------------------------------------------
{
    const est = doc('e1', 'Estimate', {
        status: 'Accepted', issueDate: '2026-10-01', estimateNumber: 'EST-2026-10-001',
        lineItems: [{ description: 'Labor - install', quantity: 1, rate: 4000 } as any, { description: 'Materials', quantity: 1, rate: 3000 } as any],
    });
    const later = doc('e2', 'Estimate', { status: 'Accepted', issueDate: '2026-10-20', estimateNumber: 'EST-2026-10-002', lineItems: [{ description: 'Labor', quantity: 1, rate: 500 } as any] });
    const co = doc('co', 'Change Order', { status: 'Approved', lineItems: [{ description: 'Extra materials', quantity: 1, rate: 300 } as any] });
    const line = (id: string, description: string, quantity: number, rate: number) => ({ id, description, quantity, rate }) as any;
    const dlv = (id: string, lines: Array<[string, number]>, state = 'done') => ({
        id, date: '2026-11-05', note: '', at: C, claimedAt: C, state, items: [], applied: [],
        lines: lines.map(([lineId, qty], index) => ({ lineId, index, description: '', qty })),
    });
    const deliveries = (...list: any[]) => ({ v: 1, rev: 'r1', list });
    const sum = (docs: CostingDoc[], pct: number | null = null) => summarizeJobCosting(docs, { laborRate: 0, manualPercent: pct });

    // partial delivery: 4 of 10 arrived → $400 spent, $600 ordered, never both
    const partial = doc('p1', 'Purchase Order', {
        status: 'Partially delivered', lineItems: [line('a', 'Lumber', 10, 100)], internalDeliveries: deliveries(dlv('dlv_aaaaaa', [['a', 4]])),
    });
    let s = sum([est, partial]);
    eq('partially delivered: delivered quantity is spent, the rest ordered', [s.actual, s.committed], [400, 600]);
    eq('partially delivered: spent + ordered = the PO total (not double counted)', s.actual + s.committed, 1000);
    eq('partially delivered: PO counts', [s.purchaseOrders.count, s.purchaseOrders.committedCount], [1, 1]);
    // the light row from the database carries the deliveries as JSON text in some drivers
    eq('deliveries read from a JSON string too', sum([est, { ...partial, internalDeliveries: JSON.stringify(partial.internalDeliveries) }]).actual, 400);
    // two deliveries on the same line add up; more than ordered is capped
    s = sum([est, { ...partial, internalDeliveries: deliveries(dlv('dlv_aaaaaa', [['a', 4]]), dlv('dlv_bbbbbb', [['a', 9]])) }]);
    eq('two deliveries add up, capped at the ordered quantity', [s.actual, s.committed], [1000, 0]);
    // a delivery still being added (receiving) already counts as delivered
    eq('a delivery being added counts as delivered', sum([est, { ...partial, internalDeliveries: deliveries(dlv('dlv_aaaaaa', [['a', 4]], 'receiving')) }]).actual, 400);

    // statuses
    const po = (status: string, extra: Partial<CostingDoc> = {}) => doc(`po-${status}`, 'Purchase Order', { status, lineItems: [line('a', 'Lumber', 10, 100)], ...extra });
    eq('Sent: all committed', [sum([est, po('Sent')]).actual, sum([est, po('Sent')]).committed], [0, 1000]);
    eq('Confirmed: all committed', sum([est, po('Confirmed')]).committed, 1000);
    eq('Accepted (supplier confirm link, older wording): committed', sum([est, po('Accepted')]).committed, 1000);
    eq('Delivered: all spent', [sum([est, po('Delivered')]).actual, sum([est, po('Delivered')]).committed], [1000, 0]);
    eq('older Received: all spent, exactly like before', [sum([est, po('Received')]).actual, sum([est, po('Received')]).committed], [1000, 0]);
    eq('older Received through Mark received (receipt done): all spent', sum([est, po('Sent', { internalStockReceipt: { state: 'done', items: [], applied: [] } })]).actual, 1000);
    eq('Invoiced with the supplier amount: the invoice is the cost', [sum([est, po('Invoiced', { supplierInvoiceAmount: 1100 })]).actual, sum([est, po('Invoiced', { supplierInvoiceAmount: 1100 })]).committed], [1100, 0]);
    eq('Paid without an amount: the PO total (with tax)', sum([est, po('Paid', { taxRate: 10 })]).actual, 1100);
    eq('Invoiced before any delivery: spent, nothing committed', sum([est, po('Invoiced')]).committed, 0);
    eq('Draft: nothing', [sum([est, po('Draft')]).actual, sum([est, po('Draft')]).committed], [0, 0]);
    eq('Rejected (supplier can’t fill it): nothing committed', sum([est, po('Rejected')]).committed, 0);
    eq('Cancelled after a partial delivery: only what arrived is spent', [
        sum([est, po('Cancelled', { internalDeliveries: deliveries(dlv('dlv_cccccc', [['a', 3]])) })]).actual,
        sum([est, po('Cancelled', { internalDeliveries: deliveries(dlv('dlv_cccccc', [['a', 3]])) })]).committed,
    ], [300, 0]);
    eq('Invoiced order with no prices: the invoice is a materials cost', sum([est, doc('np', 'Purchase Order', { status: 'Invoiced', supplierInvoiceAmount: 250, lineItems: [line('a', 'Lumber', 10, 0)] })]).rows.find(r => r.id === 'materials')?.actual, 250);

    // budgets: original = first accepted estimate (by date), revised = + later estimate + approved change orders
    s = sum([later, co, est, partial]);
    eq('original budget = the earliest accepted estimate (its number)', [s.original?.amount, s.original?.label], [7000, 'EST-2026-10-001']);
    eq('revised budget and the change', [s.budget, s.budgetChanges], [7800, 800]);
    eq('remaining = revised − spent − ordered', s.remaining, 7800 - 400 - 600);
    eq('no accepted estimate → no original budget', sum([partial]).original, null);

    // per-kind overrun: Materials $2,000 spent + $1,400 ordered vs $3,000 budget → $400 over
    const spentMat = doc('ml', 'Material Log', { items: [{ name: 'Drywall', quantity: 100, unitCost: 20 } as any] });
    const orderedMat = doc('po-m', 'Purchase Order', { status: 'Confirmed', lineItems: [line('a', 'Tile', 14, 100)] });
    s = sum([est, spentMat, orderedMat]);
    const mat = s.rows.find(r => r.id === 'materials')!;
    eq('materials row: budget, spent, ordered, over', [mat.budget, mat.actual, mat.committed, mat.over], [3000, 2000, 1400, 400]);
    near('materials % used = (spent + ordered) ÷ budget', mat.usedPct, (3400 / 3000) * 100);
    eq('overrun list', s.overruns, [{ id: 'materials', label: 'Materials', spentOrOrdered: 3400, budget: 3000, over: 400 }]);
    eq('overrun sentence', overrunText(s.overruns[0]), 'Materials: $3,400 spent or ordered vs $3,000 budget, $400 over');
    eq('labor under its budget is not flagged', s.rows.find(r => r.id === 'labor')?.over, null);
    eq('a kind without a budget is never "over"', sum([est, doc('x', 'Expense Log', { category: 'Fuel', amount: 50 })]).overruns, []);
    eq('less than $1 over is not flagged (rounding)', sum([est, doc('ml2', 'Material Log', { items: [{ name: 'x', quantity: 1, unitCost: 3000.4 } as any] })]).overruns, []);

    // alerts and the projection read spent + ordered (as before N2, when a sent PO counted as actual)
    const overByOrders = costingStatus({ budget: 1000, actual: 600, committed: 500, usedPct: 110, progress: { percent: 50, source: 'manual' }, projection: null });
    eq('over budget counting what is ordered', [overByOrders.kind, overByOrders.detail], ['over', 'Spent and ordered costs are $100 above the budget ($500 still on order).']);
    eq('older callers without committed still work', costingStatus({ budget: 1000, actual: 600, usedPct: 60, progress: { percent: 70, source: 'manual' }, projection: { finalCost: 857, profit: 143, margin: 14.3 } }).kind, 'ok');
    s = sum([est, partial], 50);
    near('expected final cost = (spent + ordered) ÷ % complete', s.projection?.finalCost, 2000, 0.01);
    near('expected profit + margin', s.projection?.margin, ((7000 - 2000) / 7000) * 100, 0.01);
    near('expected final cost is never below spent + ordered', sum([est, partial], 100).projection?.finalCost, 1000, 0.01);

    // Insights and the profit definition never read purchase orders: unchanged by deliveries
    const withPos = [est, spentMat, partial, orderedMat];
    const insA = computeAnalytics(withPos as unknown as AnalyticsDoc[], '2026-10-01', '2026-11-30', { laborRate: 0, todayYMD: '2026-11-14' });
    const insB = computeAnalytics([est, spentMat] as unknown as AnalyticsDoc[], '2026-10-01', '2026-11-30', { laborRate: 0, todayYMD: '2026-11-14' });
    eq('Insights costs ignore purchase orders (same with or without them)', insA.costs, insB.costs);
    eq('Job financials profit ignores purchase orders', summarizeJobMoney(withPos, { laborRate: 0 }).costs, summarizeJobMoney([est, spentMat], { laborRate: 0 }).costs);
    check('costing selects the PO lifecycle paths', ['internalDeliveries:data->internalDeliveries', 'internalStockReceipt:data->internalStockReceipt', 'supplierInvoiceAmount:data->>supplierInvoiceAmount', 'estimateNumber:data->>estimateNumber'].every(p => read('lib/costingApi.ts').includes(p)));
    const panel = read('components/costing/JobCostingPanel.tsx');
    check('panel: original / revised, spent + ordered, remaining, expected final cost + profit, overruns', ['Original', 'revised', 'ordered', 'Remaining', 'Expected final cost', 'Expected profit', 'overrunText('].every(t => panel.includes(t)));
}

// ---------------------------------------------------------------------------------------------------------------
// 3. % complete
// ---------------------------------------------------------------------------------------------------------------
{
    const prog = [
        doc('p-old', 'Invoice', { status: 'Paid', isProgressBilling: 'true', issueDate: '2026-10-01', invoiceNumber: 'INV-1', lineItems: [{ quantity: 1, rate: 100, percentComplete: 20 } as any] }),
        doc('p-new', 'Invoice', { status: 'Sent', isProgressBilling: 'true', issueDate: '2026-11-10', invoiceNumber: 'INV-2', lineItems: [{ quantity: 1, rate: 1000, percentComplete: 50 } as any, { quantity: 1, rate: 3000, percentComplete: 80 } as any] }),
        doc('p-cancel', 'Invoice', { status: 'Cancelled', isProgressBilling: true, issueDate: '2026-11-12', lineItems: [{ quantity: 1, rate: 100, percentComplete: 100 } as any] }),
        doc('plain', 'Invoice', { status: 'Sent', issueDate: '2026-11-13', lineItems: [{ quantity: 1, rate: 100 } as any] }),
    ];
    eq('latest progress invoice, value-weighted %', progressFromInvoices(prog), { percent: 72.5, source: 'progress', invoiceId: 'p-new', invoiceNumber: 'INV-2', date: '2026-11-10' });
    eq('progress invoice wins over the manual %', resolveProgress(prog, 10).percent, 72.5);
    eq('no progress invoice → manual', resolveProgress([], 33.33), { percent: 33.3, source: 'manual' });
    eq('nothing → unknown', resolveProgress([], null), { percent: null, source: null });
    eq('parsePercent clamps', [parsePercent(150), parsePercent(-3), parsePercent(''), parsePercent('42.46')], [100, 0, null, 42.5]);
}

// ---------------------------------------------------------------------------------------------------------------
// 4. T&M: what is unbilled
// ---------------------------------------------------------------------------------------------------------------
const BOOK = [{ name: 'Drywall sheet', rate: 18, type: 'material' }, { name: 'Labor (hourly)', type: 'labor', rate: 85 }, { name: 'Helper', type: 'labor', rate: 55, use_count: 99 }];
const ALL_THROUGH = '2026-11-30';
{
    const c = collectUnbilled(DOCS, { through: ALL_THROUGH, priceBook: BOOK });
    eq('unbilled: 3 time sheets, 2 material lines, 4 expense logs', [c.labor.length, c.materials.length, c.expenses.length], [3, 2, 4]);
    eq('unbilled: oldest first', c.labor.map(e => e.docId), ['ts1', 'ts2', 'ts3']);
    eq('material price: price book by name, else null (markup)', c.materials.map(e => [e.name, e.bookPrice]), [['2x4 studs', null], ['Drywall sheet', 18]]);
    eq('material price via the inventory item name', collectUnbilled(DOCS, { priceBook: [{ name: 'Stud 2x4 8ft', rate: 7 }], inventory: [{ id: 'inv-9', name: 'Stud 2x4 8ft' }] }).materials[0].bookPrice, 7);
    eq('nothing billed yet → no last invoice', c.lastInvoice, null);
    const cut = collectUnbilled(DOCS, { through: '2026-11-04' });
    eq('bill through: later entries wait', [cut.labor.map(e => e.docId), cut.later], [['ts1', 'ts2'], 1]);
    eq('summary', unbilledSummary(c), { timeSheets: 3, hours: 22, overtime: 2, materialLines: 2, materialCost: 210, expenses: 4, expenseAmount: 625, empty: false });
    eq('item keys: id, else #position (also for duplicated ids)', materialItemKeys([{ id: 'a' }, { id: 'a' }, {}, { id: 'c' }]), ['#0', '#1', '#2', 'c']);
    eq('entry day: date, else the local day it was created', [entryDay({ date: '2026-11-03' }), entryDay({ createdAt: '2026-11-03T10:00:00Z' })], ['2026-11-03', localISODate(new Date('2026-11-03T10:00:00Z'))]);
    eq('short dates', [shortDay('2026-11-03'), dayRange('2026-11-03', '2026-11-14'), dayRange('2026-11-03', '2026-11-03'), shortDay('x')], ['Nov 3', 'Nov 3 – Nov 14', 'Nov 3', '']);
}

// ---------------------------------------------------------------------------------------------------------------
// 5. T&M: rates, lines, invoice
// ---------------------------------------------------------------------------------------------------------------
{
    eq('price book labor item: "Labor (hourly)" beats the most used', priceBookLaborRate(BOOK), { rate: 85, name: 'Labor (hourly)' });
    const d1 = defaultTmPrefs({ saved: null, priceBook: BOOK, accountLaborRate: 40 });
    eq('rates: price book labor, 50% markup (price book default), expenses at cost, per worker', [d1.prefs, d1.laborSource], [{ laborRate: 85, materialMarkup: 50, expenseMarkup: 0, groupLabor: 'worker' }, 'Price book: Labor (hourly)']);
    eq('rates: last ones used win', defaultTmPrefs({ saved: { laborRate: 90, materialMarkup: 20, expenseMarkup: 0, groupLabor: 'entry' }, priceBook: BOOK, accountLaborRate: 40 }).prefs, { laborRate: 90, materialMarkup: 20, expenseMarkup: 0, groupLabor: 'entry' });
    eq('rates: else the labor rate', defaultTmPrefs({ saved: null, priceBook: [], accountLaborRate: 40 }).prefs.laborRate, 40);
    eq('material price: cost + markup', materialPrice({ bookPrice: null, unitCost: 4.5 }, 50), 6.75);

    const c = collectUnbilled(DOCS, { through: ALL_THROUGH, priceBook: BOOK });
    const selected = new Set([...c.labor, ...c.materials].map(e => e.key));
    const prefs: TmPrefs = { laborRate: 85, materialMarkup: 50, expenseMarkup: 0, groupLabor: 'worker' };
    const b = buildTmLines(c, selected, prefs, RATE);
    eq('lines per worker (OT 1.5×), materials (price book / markup)', b.lines.map(l => [l.description, l.quantity, l.rate, l.unitCost]), [
        ['Labor: Mike (Nov 3 – Nov 4)', 16, 85, 40],
        ['Overtime (1.5×): Mike (Nov 3 – Nov 4)', 2, 127.5, 60],
        ['Labor: Ana (Nov 5)', 6, 85, 40],
        ['2x4 studs', 20, 6.75, 4.5],
        ['Drywall sheet', 10, 18, 12],
    ]);
    eq('total', b.totals.total, 1360 + 255 + 510 + 135 + 180);
    eq('build counts', [b.timeSheets, b.hours, b.overtime, b.materialLines, b.expenses, b.unpriced, b.from, b.to], [3, 22, 2, 2, 0, 0, '2026-11-03', '2026-11-05']);
    check('lines never carry an inventory link (stock already moved by the material log)', b.lines.every(l => !('inventoryItemId' in l) && !('item_id' in l) && !('itemSource' in l) && !('track_inventory' in l)));
    eq('per day: one line per time sheet', buildTmLines(c, selected, { ...prefs, groupLabor: 'entry' }, RATE).lines.slice(0, 4).map(l => l.description), ['Labor: Mike, Nov 3', 'Overtime (1.5×): Mike, Nov 3', 'Labor: Mike, Nov 4', 'Labor: Ana, Nov 5']);
    const withExp = buildTmLines(c, new Set([c.expenses[1].key]), { ...prefs, expenseMarkup: 10 }, RATE);
    eq('expense log line: amount + markup', withExp.lines.map(l => [l.description, l.quantity, l.rate, l.unitCost]), [['Shell: Fuel (Nov 2)', 1, 66, 60]]);
    eq('unticked entries are left out', buildTmLines(c, new Set([c.labor[2].key]), prefs, RATE).lines.map(l => l.description), ['Labor: Ana (Nov 5)']);
    const merged = buildTmLines({ ...c, materials: [c.materials[0], { ...c.materials[0], key: 'k2', docId: 'ml9', quantity: 5, unitCost: 5.5, bookPrice: 6.75 }] }, new Set([c.materials[0].key, 'k2']), prefs, RATE);
    eq('same item at the same price → one line (average cost)', merged.lines.map(l => [l.description, l.quantity, l.rate, l.unitCost]), [['2x4 studs', 25, 6.75, 4.7]]);

    const record = tmRecordFor(c, selected, prefs, b, ALL_THROUGH, new Date('2026-11-14T15:00:00Z'));
    eq('record: what was billed', [record.timeSheetIds, record.materialItems, record.expenseLogIds, record.from, record.to, record.through, record.laborRate], [['ts1', 'ts2', 'ts3'], { ml1: ['a', 'b'] }, [], '2026-11-03', '2026-11-05', ALL_THROUGH, 85]);
    eq('record parses back', parseTmRecord(JSON.parse(JSON.stringify(record))), record);
    eq('empty record is no record', parseTmRecord({ timeSheetIds: [] }), null);

    const job = { id: 'job-1', userId: 'u', name: 'Kitchen', clientName: 'Pat Lee', clientAddress: '1 Main St', startDate: '2026-11-01', endDate: null, status: 'active' as const };
    const profile = { companyName: 'Acme Builders', payLinkDefault: 'paypal.me/acme', payLinkLabel: 'PayPal', address: '', phone: '', website: '', logoUrl: '' } as any;
    const number = nextInvoiceNumber(['INV-2026-11-001', 'INV-2026-11-007', 'EST-2026-11-009'], new Date(2026, 10, 14));
    eq('next invoice number in the form series', number, 'INV-2026-11-008');
    const data = buildTmInvoiceData({ job, profile, lines: b.lines, number, record: { ...record, invoiceId: 'tm-inv' }, today: '2026-11-14' }) as any;
    eq('invoice: Draft, number, dates, client, company', [data.status, data.invoiceNumber, data.issueDate, data.dueDate, data.clientName, data.companyName, data.title], ['Draft', number, '2026-11-14', '2026-12-14', 'Pat Lee', 'Acme Builders', 'Time & materials']);
    eq('invoice: default "Pay now" link from Settings (like a new invoice in the form)', [data.paypalLink, data.payLinkLabel], ['https://paypal.me/acme', 'PayPal']);
    check('invoice: not marked AI-generated, not progress billing', !data.isAiGenerated && data.isProgressBilling === false);
    eq('invoice: totals come from the lines (utils/money.ts)', computeDocumentTotals(data).total, b.totals.total);
    eq('invoice: keeps what it billed', data.timeAndMaterials.timeSheetIds, ['ts1', 'ts2', 'ts3']);
    check('invoice: notes say the period', /^Time and materials from Nov 3 to Nov 5\.\nThank you for your business\.$/.test(data.notes), data.notes);
    check('invoice: same default keys as a new invoice form (template, theme, recurrence)', data.templateId && data.themeColors && data.recurrence && data.recurrence.enabled === false);

    // ---- after creating: billed by the invoice's record
    const tmInv = doc('tm-inv', 'Invoice', { status: 'Draft', invoiceNumber: number, tm: data.timeAndMaterials });
    const after = collectUnbilled([...DOCS, tmInv], { through: ALL_THROUGH });
    eq('after billing: only the expense logs are left', [after.labor.length, after.materials.length, after.expenses.length], [0, 0, 4]);
    eq('after billing: last T&M invoice', after.lastInvoice && [after.lastInvoice.id, after.lastInvoice.number, after.lastInvoice.to], ['tm-inv', number, '2026-11-05']);
    eq('cancelled T&M invoice frees its entries', collectUnbilled([...DOCS, { ...tmInv, status: 'Cancelled' }]).labor.length, 3);
    eq('void T&M invoice frees its entries', collectUnbilled([...DOCS, { ...tmInv, status: 'Void' }]).labor.length, 3);
    eq('a duplicated T&M invoice bills nothing', collectUnbilled([...DOCS, { ...tmInv, id: 'dup' }]).labor.length, 3);
    const partial = doc('tm2', 'Invoice', { status: 'Sent', tm: { ...data.timeAndMaterials, invoiceId: 'tm2', timeSheetIds: ['ts1'], materialItems: { ml1: ['a'] } } });
    const left = collectUnbilled([...DOCS, partial]);
    eq('part of a material log billed: the other line stays', [left.labor.map(e => e.docId), left.materials.map(e => e.itemKey)], [['ts2', 'ts3'], ['b']]);
    eq('billed index', [billedIndex([...DOCS, partial]).timeSheets.get('ts1')?.invoiceId], ['tm2']);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. T&M: markers on the entries
// ---------------------------------------------------------------------------------------------------------------
{
    const inv = doc('inv-x', 'Invoice', { status: 'Sent', invoiceNumber: 'INV-X' });
    const marked = DOCS.map(d => {
        if (d.id === 'ts1') return { ...d, billedInvoiceId: 'inv-x', billedDocId: 'ts1' };
        if (d.id === 'ml1') return { ...d, billedInvoiceId: 'inv-x', billedDocId: 'ml1', billedItems: { a: 'inv-x' } };
        return d;
    });
    const c = collectUnbilled([...marked, inv]);
    eq('marker: billed time sheet and material line are left out', [c.labor.map(e => e.docId), c.materials.map(e => e.itemKey)], [['ts2', 'ts3'], ['b']]);
    eq('marker: deleted invoice → billable again', collectUnbilled(marked).labor.length, 3);
    const copy = { ...marked.find(d => d.id === 'ts1')!, id: 'ts1-copy' };
    eq('marker: a "Duplicate as draft" copy is unbilled', collectUnbilled([...marked, inv, copy]).labor.map(e => e.docId), ['ts1-copy', 'ts2', 'ts3']);

    const tsData = { workerName: 'Mike', hoursWorked: 8, notes: 'x', status: 'Draft' };
    const m1 = withBilledMarker(tsData, 'ts1', 'time sheet', { id: 'inv-x', number: 'INV-X' }, '2026-11-14T00:00:00Z');
    eq('marker on a time sheet keeps its data', m1, { ...tsData, billedInvoiceId: 'inv-x', billedInvoiceNumber: 'INV-X', billedAt: '2026-11-14T00:00:00Z', billedDocId: 'ts1' });
    const items = [{ id: 'a', name: 'x', quantity: 1, unitCost: 1, inventoryItemId: 'inv-9' }, { id: 'b', name: 'y', quantity: 2, unitCost: 2 }];
    const mlData = { items, deductInventory: true, billedDocId: 'ml1', billedItems: { a: 'inv-old' } };
    const m2 = withBilledMarker(mlData, 'ml1', 'material log', { id: 'inv-y', number: 'INV-Y' }, 'now', ['b']) as any;
    check('marker on a material log never rewrites its lines (stock stays put)', m2.items === items && m2.deductInventory === true);
    eq('marker on a material log adds to the billed lines', m2.billedItems, { a: 'inv-old', b: 'inv-y' });
    const m3 = withBilledMarker({ ...mlData, billedDocId: 'other' }, 'ml1', 'material log', { id: 'inv-y', number: 'INV-Y' }, 'now', ['b']) as any;
    eq('marker copied from another document is ignored', m3.billedItems, { b: 'inv-y' });
}

// ---------------------------------------------------------------------------------------------------------------
// 7. wiring (static)
// ---------------------------------------------------------------------------------------------------------------
{
    const jobPage = read('components/JobDetailsScreen.tsx');
    check('job page: "Bill time & materials" button (Bill T&M on a phone)', jobPage.includes('onBillTimeMaterials') && jobPage.includes('Bill time &amp; materials') && jobPage.includes('Bill T&amp;M'));
    const app = read('App.tsx');
    check('App: modal mounted with the Free-plan slot check', /<BillTimeMaterialsModal[\s\S]*?ensureDocSlot=\{\(\) => ensureDocSlot\(viewJob\.id\)\}/.test(app));
    check('App: the new invoice counts toward this month\'s documents', /handleTimeMaterialsBilled[\s\S]*?bumpDocUsage\(invoice\.jobId\)/.test(app));
    check('App: Job financials gets the price book and the T&M button', /<JobFinancialsModal[\s\S]*?savedItems=\{savedItems\}[\s\S]*?onBillTimeMaterials=/.test(app));
    const modal = read('components/costing/BillTimeMaterialsModal.tsx');
    const slotAt = modal.indexOf('await ensureDocSlot()');
    check('T&M modal: checks the Free-plan slot before creating', slotAt > 0 && slotAt < modal.indexOf('await createTmInvoice('));
    check('T&M modal: plan-limit refusal opens the upgrade window', /TmPlanLimitError[\s\S]*?onUpgrade\(/.test(modal));
    const api = read('lib/costingApi.ts');
    check('costing reads JSON paths only (never the whole data column)', !/'data'/.test(api.split('COSTING_TYPES')[0]) && api.includes("'tm:data->timeAndMaterials'"));
    check('marker writes go through withBilledMarker + assertFullDocument', api.includes('withBilledMarker(') && api.includes('assertFullDocument({ data: next })'));
    for (const f of ['lib/costing.ts', 'lib/tmInvoice.ts']) check(`${f} is pure (no supabase import)`, !/from '\.\/supabase|lib\/supabase/.test(read(f)));
    check('no migration for this feature', !readdirSync(join(root, 'supabase/migrations')).some(f => /costing|time_?and_?materials|tm_/i.test(f)));
    const finance = read('lib/finance.ts');
    check('shared profit definition unchanged (materials + expenses + labor)', finance.includes("const costs = roundMoney(materials + expenses + labor);"));
    const help = read('components/help/helpContent.ts');
    check('help guide: job costing and T&M', help.includes("id: 'job-costing'") && help.includes('[[Bill time & materials]]'));
    check('AI knowledge has the guide (run document-ai-flow-qa --sync-knowledge)', read('supabase/functions/ai-assistant/shared/helpGuides.generated.ts').includes('"id": "job-costing"'));
}

// ---------------------------------------------------------------------------------------------------------------
const total = passed + failures.length;
for (const f of failures.slice(0, 60)) console.log(`FAIL  ${f}`);
console.log(failures.length ? `costing-check: ${failures.length} of ${total} checks failed` : `costing-check: all ${total} checks passed`);
process.exit(failures.length ? 1 : 0);
