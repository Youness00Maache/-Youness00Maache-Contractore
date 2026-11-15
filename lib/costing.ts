/**
 * Job costing: budget vs actual for one job (competitor gap #12, NEXT_STEPS 0c). Pure (no network), so
 * scripts/costing-check.ts tests it under Node. Shown in Job financials (components/JobFinancialsModal.tsx →
 * components/costing/JobCostingPanel.tsx).
 *
 *   Budget  = contract value (lib/finance.ts): accepted (or client-signed) estimates + approved change orders
 *             (an estimate with good/better/best options counts its chosen option, else Recommended, else lowest).
 *             Split by kind from their lines (price-book type, inventory link, then the words of the line);
 *             a line that mixes labor and materials stays "not split", except a price-book kit with labor /
 *             expense rows (roadmap N5), which splits by those rows (assemblyBudgetShares).
 *   Actual  = the costs of the shared profit definition (lib/finance.ts: material logs + expense logs + labor at the
 *             labor rate, overtime 1.5×) + purchase orders, but only what has ARRIVED: the delivered quantities, or
 *             the whole order once Delivered / Received / Invoiced / Paid (an Invoiced / Paid order with the
 *             supplier's invoice amount costs that amount). A purchase-order line for an item that is also on one of
 *             the job's material logs is counted once (in the material log).
 *   Committed = purchase orders still expected (Sent / Confirmed / Partially delivered): the undelivered rest of each
 *             line. Never counted twice: a line's delivered part is actual, its rest committed (lib/poLifecycle.ts).
 *   % used  = (actual + committed) ÷ budget ("spent or ordered").  % complete = the latest progress-billing invoice,
 *             else the % typed on the job.
 *   Alert   = costs outrun the work: % used > % complete (or spent + ordered > budget).
 *   Remaining = revised budget − actual − committed.  Original budget = the first accepted estimate (its chosen
 *             option); revised budget = the budget above (+ approved change orders).
 *
 * Roadmap N2 note: before, a Sent purchase order counted whole as "actual". Now the same amount is split into actual
 * (delivered / invoiced) + committed (still to come), so actual + committed, % used, the alerts and the projection give
 * the same numbers as before for the same documents; only POs that a supplier can't fill ('Rejected') no longer count.
 * Insights (utils/analyticsMath.ts) and the pipeline never read purchase orders: their numbers don't change.
 */
import { lineItemAmount, roundMoney, toNumber, type MoneyLineItem } from '../utils/money.ts';
import {
    documentTotals, expenseTotal, isAcceptedDoc, isType, laborOf, materialCost, moneyLines, type FinanceDoc,
} from './finance.ts';
import { poCostShares } from './poLifecycle.ts';

export type CostCategory = 'labor' | 'materials' | 'expenses' | 'other';

export const COST_CATEGORIES: ReadonlyArray<{ id: CostCategory; label: string }> = [
    { id: 'labor', label: 'Labor' },
    { id: 'materials', label: 'Materials' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'other', label: 'Subs & other' },
];

/** The fields job costing and T&M billing read (JSON-path selects: lib/costingApi.ts COSTING_COLUMNS). */
export interface CostingDoc extends FinanceDoc {
    createdAt?: string | null;
    /** time sheet / material log / expense log / PO date (YYYY-MM-DD) */
    date?: string | null;
    issueDate?: string | null;
    /** expense log category: Material | Fuel | Food | Other */
    category?: string | null;
    vendor?: string | null;
    item?: string | null;
    workerName?: string | null;
    notes?: string | null;
    poNumber?: string | null;
    estimateNumber?: string | null;
    /** purchase orders (lib/poLifecycle.ts): deliveries, the older one-shot receipt, the supplier's invoice amount */
    internalDeliveries?: unknown;
    internalStockReceipt?: unknown;
    supplierInvoiceAmount?: number | string | null;
    /** T&M invoice: what it billed (lib/tmInvoice.ts TmRecord) */
    tm?: unknown;
    /** billed marker written on time sheets / material logs / expense logs by "Bill time & materials" */
    billedInvoiceId?: string | null;
    billedInvoiceNumber?: string | null;
    billedDocId?: string | null;
    billedItems?: unknown;
}

/** Minimal price-book item (public.saved_items). */
export interface PriceBookLite {
    id?: string;
    name?: string | null;
    type?: string | null;
    rate?: number | string | null;
    unit_cost?: number | string | null;
    cost?: number | string | null;
    markup?: number | string | null;
    is_favorite?: boolean | null;
    use_count?: number | null;
}

/** Minimal inventory item. */
export interface InventoryLite {
    id: string;
    name?: string | null;
    cost_price?: number | string | null;
}

interface LineLike extends MoneyLineItem {
    description?: unknown;
    name?: unknown;
    inventoryItemId?: unknown;
    item_id?: unknown;
    itemSource?: unknown;
    /** a price-book kit on the line (components: LineItem.assemblyComponents) */
    isAssembly?: unknown;
    assemblyComponents?: unknown;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
const norm = (v: unknown) => str(v).toLowerCase().replace(/\s+/g, ' ');
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

// ------------------------------------------------------------------------------------------- classifying
const LABOR_RE = /\b(labou?r|install(?:ation|ations|ing|ed|s)?|hours?|hrs?|hourly|man[- ]?hours?|crew|technicians?|workmanship|service calls?|demo(?:lition)?|tear[- ]?out|removal|haul[- ]?away|prep(?:aration)?|clean[- ]?up)\b/i;
const SUB_RE = /\b(sub[- ]?contract(?:or|ors|ed|s)?|subs|permits?|inspections?|dumpsters?|rentals?|disposal|engineer(?:ing)?|architect(?:ural)?|surveys?|fees?)\b/i;
const EXPENSE_RE = /\b(fuel|gasoline|diesel|mileage|travel|trip charges?|per diem|meals?|food|parking|tolls?|lodging|hotel)\b/i;
const MATERIAL_RE = /\b(materials?|supplies|supply|lumber|plywood|osb|drywall|sheetrock|paint|primer|stain|tiles?|grout|pipes?|piping|fittings?|pvc|copper|pex|wire|wiring|cables?|conduit|fixtures?|shingles?|underlayment|roofing|concrete|cement|mortar|rebar|gravel|sand|insulation|cabinets?|counter ?tops?|flooring|carpet|vinyl|laminate|hardwood|hardware|fasteners?|screws?|nails?|bolts?|studs?|\d+x\d+|trim|molding|moulding|doors?|windows?|faucets?|toilets?|sinks?|vanity|vanities|water heaters?|outlets?|switch(?:es)?|breakers?|ducts?|ductwork|filters?|caulk|adhesive|sealant|membrane|siding|gutters?|lights?|lighting|bulbs?)\b/i;

/** Price-book type of a line (lines from the price book carry "<name>" or "<name> - <description>"). */
export const priceBookTypes = (items: readonly PriceBookLite[] | null | undefined): Map<string, string> => {
    const map = new Map<string, string>();
    for (const it of items || []) {
        const name = norm(it?.name);
        const type = norm(it?.type);
        if (name && type && !map.has(name)) map.set(name, type);
    }
    return map;
};

const typeOfLine = (text: string, types: Map<string, string>): CostCategory | null => {
    if (!types.size || !text) return null;
    const key = norm(text);
    const type = types.get(key) || types.get(norm(key.split(' - ')[0]));
    if (type === 'labor' || type === 'service') return 'labor';
    if (type === 'material') return 'materials';
    return null;
};

/** What a word-only description is (null when the words don't say). */
export const classifyText = (text: unknown): CostCategory | null => {
    const t = str(text);
    if (!t) return null;
    if (SUB_RE.test(t)) return 'other';
    if (LABOR_RE.test(t)) return 'labor';
    if (EXPENSE_RE.test(t)) return 'expenses';
    if (MATERIAL_RE.test(t)) return 'materials';
    return null;
};

const isInventoryLine = (li: LineLike): boolean =>
    Boolean(str(li.inventoryItemId)) || (str(li.itemSource) === 'inventory' && Boolean(str(li.item_id)));

/** Kind of an estimate / change-order line, or null ("not split": the line doesn't say). */
export const classifyBudgetLine = (li: LineLike, types: Map<string, string> = new Map()): CostCategory | null => {
    const text = str(li.description ?? li.name);
    return typeOfLine(text, types) ?? (isInventoryLine(li) ? 'materials' : classifyText(text));
};

/**
 * An assembly line (roadmap N5) with labor and / or expense rows: its budget split by what the kit is made of, in
 * proportion to the prices of its rows. Labor rows → labor; expense rows → "Expenses" when their words say fuel, travel
 * and the like, else "Subs & other" (rental, dump fee, permit, subcontract); everything else in the kit → materials.
 * null for any other line, including every kit without labor / expense rows, so those are classified exactly as before.
 */
export const assemblyBudgetShares = (li: LineLike): Array<{ kind: CostCategory; weight: number }> | null => {
    if (!li || li.isAssembly !== true || !Array.isArray(li.assemblyComponents)) return null;
    const rows = (li.assemblyComponents as Array<Record<string, unknown> | null>).filter((c): c is Record<string, unknown> => !!c && typeof c === 'object');
    if (!rows.some(c => c.kind === 'labor' || c.kind === 'expense')) return null;
    const weights: Record<CostCategory, number> = { labor: 0, materials: 0, expenses: 0, other: 0 };
    for (const c of rows) {
        const amount = Math.max(0, toNumber(c.quantity) * toNumber(c.rate));
        if (!amount) continue;
        const kind: CostCategory = c.kind === 'labor' ? 'labor' : c.kind === 'expense' ? (classifyText(c.name) === 'expenses' ? 'expenses' : 'other') : 'materials';
        weights[kind] += amount;
    }
    const out = COST_CATEGORIES.map(({ id }) => ({ kind: id, weight: weights[id] })).filter(x => x.weight > 0);
    return out.length ? out : null;
};

/** Kind of a purchase-order line: a supplier order unless its words say labor/subcontract (→ subs) or an expense. */
export const classifyPurchaseLine = (li: LineLike, types: Map<string, string> = new Map()): CostCategory => {
    const text = str(li.description ?? li.name);
    const byType = typeOfLine(text, types);
    if (byType === 'materials' || isInventoryLine(li)) return 'materials';
    if (byType === 'labor') return 'other';
    const words = classifyText(text);
    if (words === 'labor' || words === 'other') return 'other';
    if (words === 'expenses') return 'expenses';
    return 'materials';
};

/** Kind of an expense log: category Material → materials; subcontract / permit / rental words → subs; else expenses. */
export const classifyExpense = (doc: Pick<CostingDoc, 'category' | 'vendor' | 'item' | 'title' | 'lineItems'>): CostCategory => {
    if (norm(doc.category) === 'material') return 'materials';
    const lines = Array.isArray(doc.lineItems) ? doc.lineItems.map(li => str((li as LineLike)?.description)).join(' ') : '';
    return SUB_RE.test(`${str(doc.vendor)} ${str(doc.item)} ${str(doc.title)} ${lines}`) ? 'other' : 'expenses';
};

// ----------------------------------------------------------------------------------------- % complete
export interface ProgressInfo {
    /** 0–100, null when unknown */
    percent: number | null;
    source: 'progress' | 'manual' | null;
    invoiceId?: string;
    invoiceNumber?: string;
    date?: string;
}

const dayOf = (doc: Pick<CostingDoc, 'issueDate' | 'date' | 'createdAt'>): string =>
    str(doc.issueDate).slice(0, 10) || str(doc.date).slice(0, 10) || str(doc.createdAt).slice(0, 10);

const isCancelled = (status: unknown) => ['cancelled', 'canceled', 'void'].includes(norm(status));
const flag = (v: unknown) => v === true || norm(v) === 'true';

/** % complete of the latest progress-billing invoice (any status but Cancelled / Void): Σ(value × %) ÷ Σ value. */
export const progressFromInvoices = (docs: readonly CostingDoc[]): ProgressInfo | null => {
    const candidates = docs
        .filter(d => isType(d, 'invoice') && flag(d.isProgressBilling) && !isCancelled(d.status))
        .map(d => {
            const lines = Array.isArray(d.lineItems) ? d.lineItems : [];
            let value = 0, done = 0;
            for (const li of lines) {
                const v = Math.max(0, toNumber(li?.quantity) * toNumber(li?.rate));
                value += v;
                done += v * Math.min(100, Math.max(0, toNumber(li?.percentComplete)));
            }
            return { d, day: dayOf(d), created: str(d.createdAt), percent: value > 0 ? done / value : null };
        })
        .filter(c => c.percent !== null)
        .sort((a, b) => (b.day.localeCompare(a.day)) || b.created.localeCompare(a.created));
    const latest = candidates[0];
    if (!latest) return null;
    return {
        percent: Math.round((latest.percent as number) * 10) / 10,
        source: 'progress',
        invoiceId: latest.d.id,
        invoiceNumber: str(latest.d.invoiceNumber) || undefined,
        date: latest.day || undefined,
    };
};

/** A typed % (0–100, one decimal) or null. */
export const parsePercent = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = toNumber(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
};

/** % complete: the latest progress-billing invoice wins; otherwise the manual % saved for the job. */
export const resolveProgress = (docs: readonly CostingDoc[], manualPercent: number | null | undefined): ProgressInfo => {
    const fromInvoice = progressFromInvoices(docs);
    if (fromInvoice) return fromInvoice;
    const manual = parsePercent(manualPercent);
    return manual === null ? { percent: null, source: null } : { percent: manual, source: 'manual' };
};

// -------------------------------------------------------------------------------------------- summary
export interface CostingRow {
    id: CostCategory;
    label: string;
    /** share of the budget planned for this kind (null when the estimate has no line of this kind) */
    budget: number | null;
    /** spent: arrived / logged costs */
    actual: number;
    /** ordered on purchase orders, not delivered yet */
    committed: number;
    /** (actual + committed) ÷ budget × 100 (null without a budget for this kind) */
    usedPct: number | null;
    /** spent or ordered above this kind's budget (null = not over, or no budget for it) */
    over: number | null;
    /** where the actual comes from, e.g. [['Material logs', 1800], ['Purchase orders', 400]] */
    sources: Array<{ label: string; amount: number }>;
}

/** A kind whose spent + ordered costs passed its share of the budget. */
export interface CostingOverrun {
    id: CostCategory;
    label: string;
    spentOrOrdered: number;
    budget: number;
    over: number;
}

export type CostingStatusKind = 'nobudget' | 'unknown' | 'ok' | 'thin' | 'ahead' | 'over';

export interface CostingStatus {
    kind: CostingStatusKind;
    tone: 'muted' | 'success' | 'warning' | 'danger';
    title: string;
    detail: string;
}

export interface CostingSummary {
    /** contract value (lib/finance.ts) = the revised budget */
    budget: number;
    /** the first accepted estimate (its chosen option); null without one */
    original: { amount: number; label: string; id: string } | null;
    /** revised − original: approved change orders (+ any later accepted estimate) */
    budgetChanges: number;
    estimateCount: number;
    changeOrderCount: number;
    /** budget that the estimate lines don't split by kind */
    unsplitBudget: number;
    /** spent: profit costs + what arrived on purchase orders */
    actual: number;
    /** ordered on purchase orders, not delivered yet */
    committed: number;
    /** budget − actual − committed (null without a budget) */
    remaining: number | null;
    /** the part of `actual` that is in the shared profit costs (material logs + expense logs + labor) */
    profitCosts: number;
    /** amount = the purchase orders' actual part; committed = their still-expected part */
    purchaseOrders: { amount: number; committed: number; count: number; committedCount: number; skippedLines: number };
    /** (actual + committed) ÷ budget × 100 */
    usedPct: number | null;
    rows: CostingRow[];
    /** kinds whose spent + ordered passed their budget */
    overruns: CostingOverrun[];
    progress: ProgressInfo;
    /**
     * Expected final cost at the current pace (needs ≥ 10% complete and a budget): (actual + committed) ÷ % complete,
     * never less than what is already spent + ordered; profit and margin against the revised budget.
     */
    projection: { finalCost: number; profit: number; margin: number } | null;
    status: CostingStatus;
}

/** Below this % complete the pace is not judged (projection, "ahead" alert), unless EARLY_ALERT_USED is reached. */
export const ALERT_MIN_COMPLETE = 10;
export const EARLY_ALERT_USED = 50;
/** Projected margin (%) under which "Thin margin at this pace" shows. */
export const THIN_MARGIN = 10;

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pctText = (n: number) => `${Math.round(n)}%`;

/** "Materials: $3,400 spent or ordered vs $3,000 budget, $400 over" */
export const overrunText = (o: Pick<CostingOverrun, 'label' | 'spentOrOrdered' | 'budget' | 'over'>): string =>
    `${o.label}: ${fmt(o.spentOrOrdered)} spent or ordered vs ${fmt(o.budget)} budget, ${fmt(o.over)} over`;

/**
 * Status line: over budget, costs ahead of the work, thin margin, on track, or what is missing. "Used" is spent +
 * ordered (`committed`, optional): the same amount a Sent purchase order counted for before roadmap N2.
 */
export const costingStatus = (s: Pick<CostingSummary, 'budget' | 'actual' | 'usedPct' | 'progress' | 'projection'> & { committed?: number }): CostingStatus => {
    if (!(s.budget > 0)) {
        return {
            kind: 'nobudget', tone: 'muted', title: 'No budget yet',
            detail: 'Accept an estimate (or get a change order approved) on this job to compare costs with it.',
        };
    }
    const used = s.usedPct ?? 0;
    const committed = Math.max(0, s.committed ?? 0);
    if (s.actual + committed > s.budget) {
        return {
            kind: 'over', tone: 'danger', title: 'Over budget',
            detail: s.actual > s.budget || committed <= 0
                ? `Costs are ${fmt(s.actual - s.budget)} above the budget (${pctText(used)} used).`
                : `Spent and ordered costs are ${fmt(s.actual + committed - s.budget)} above the budget (${fmt(committed)} still on order).`,
        };
    }
    const done = s.progress.percent;
    if (done === null || done <= 0) {
        return {
            kind: 'unknown', tone: 'muted', title: `${pctText(used)} of the budget used`,
            detail: 'Set how complete the job is to see whether costs are on track.',
        };
    }
    // very early (materials are often bought up front): only a big gap counts
    if (used > done && (done >= ALERT_MIN_COMPLETE || used >= EARLY_ALERT_USED)) {
        return {
            kind: 'ahead', tone: 'danger', title: 'Costs are ahead of the work',
            detail: `${pctText(used)} of the budget is used but the job is ${pctText(done)} complete.`,
        };
    }
    if (done < ALERT_MIN_COMPLETE) {
        return {
            kind: 'unknown', tone: 'muted', title: `${pctText(used)} of the budget used`,
            detail: `The job is ${pctText(done)} complete: too early to judge the pace.`,
        };
    }
    if (s.projection && s.projection.margin < THIN_MARGIN) {
        return {
            kind: 'thin', tone: 'warning', title: 'Thin margin at this pace',
            detail: `${pctText(used)} used at ${pctText(done)} complete: the job would end with a ${pctText(s.projection.margin)} margin.`,
        };
    }
    return {
        kind: 'ok', tone: 'success', title: 'On track',
        detail: `${pctText(used)} of the budget used at ${pctText(done)} complete.`,
    };
};

/**
 * Budget vs actual for the documents of one job. `laborRate` prices time-sheet hours (the same rate as profit);
 * `priceBook` helps split the budget; `manualPercent` is the % typed on the job (used without a progress invoice).
 */
export const summarizeJobCosting = (
    docs: readonly CostingDoc[],
    options: { laborRate: number; priceBook?: readonly PriceBookLite[] | null; manualPercent?: number | null },
): CostingSummary => {
    const rate = Math.max(0, toNumber(options.laborRate));
    const types = priceBookTypes(options.priceBook);

    // ---- budget, split by kind
    const planned: Record<CostCategory, number> = { labor: 0, materials: 0, expenses: 0, other: 0 };
    const hasPlanned: Record<CostCategory, boolean> = { labor: false, materials: false, expenses: false, other: false };
    let unsplit = 0, budget = 0, estimateCount = 0, changeOrderCount = 0;
    let original: CostingSummary['original'] = null;
    let originalKey = '';
    for (const d of docs) {
        const isEstimate = isType(d, 'estimate');
        if (!isEstimate && !isType(d, 'change order')) continue;
        if (!isAcceptedDoc(d)) continue;
        if (isEstimate) estimateCount++; else changeOrderCount++;
        const total = documentTotals(d).total;
        budget += total;
        if (isEstimate) {
            // the first accepted estimate (by its date, then when it was created) is the original budget
            const key = `${dayOf(d) || '9999'}|${str(d.createdAt)}`;
            if (!original || key < originalKey) {
                original = { amount: roundMoney(total), label: str(d.estimateNumber) || str(d.title) || 'Estimate', id: str(d.id) };
                originalKey = key;
            }
        }
        // an estimate with options: the lines of the option that counts (lib/estimateOptions.ts)
        const lines = moneyLines(d) as LineLike[];
        const amounts = lines.map(li => lineItemAmount(li));
        const sum = amounts.reduce((a, b) => a + b, 0);
        if (Math.abs(sum) < 0.005) { unsplit += total; continue; }
        lines.forEach((li, i) => {
            const share = (amounts[i] / sum) * total;
            // a kit with labor / expense rows splits by what it is made of (roadmap N5); other lines as before
            const parts = assemblyBudgetShares(li);
            if (parts) {
                const weight = parts.reduce((a, p) => a + p.weight, 0);
                for (const p of parts) { planned[p.kind] += share * (p.weight / weight); hasPlanned[p.kind] = true; }
                return;
            }
            const kind = classifyBudgetLine(li, types);
            if (kind) { planned[kind] += share; hasPlanned[kind] = true; } else unsplit += share;
        });
    }
    budget = roundMoney(budget);

    // ---- actual (the profit costs, grouped by kind, + purchase orders)
    const sources: Record<CostCategory, Map<string, number>> = { labor: new Map(), materials: new Map(), expenses: new Map(), other: new Map() };
    const add = (kind: CostCategory, label: string, amount: number) => {
        if (!amount) return;
        sources[kind].set(label, (sources[kind].get(label) || 0) + amount);
    };
    let profitCosts = 0;
    const loggedNames = new Set<string>();
    const loggedItems = new Set<string>();
    for (const d of docs) {
        if (isType(d, 'time sheet')) {
            const cost = laborOf(d, rate).cost;
            add('labor', 'Time sheets', cost);
            profitCosts += cost;
        } else if (isType(d, 'material log')) {
            const cost = materialCost(d);
            add('materials', 'Material logs', cost);
            profitCosts += cost;
            const items = (Array.isArray(d.items) && d.items.length ? d.items : Array.isArray(d.materials) ? d.materials : []) as Array<Record<string, unknown> | null>;
            for (const it of items) {
                if (!it) continue;
                const name = norm(it.name ?? it.description);
                if (name) loggedNames.add(name);
                const inv = str(it.inventoryItemId ?? it.item_id);
                if (inv) loggedItems.add(inv);
            }
        } else if (isType(d, 'expense log')) {
            const cost = expenseTotal(d);
            add(classifyExpense(d), 'Expense logs', cost);
            profitCosts += cost;
        }
    }
    // purchase orders: the arrived part is actual, the still-expected part committed (lib/poLifecycle.ts poCostShares)
    const committedBy: Record<CostCategory, number> = { labor: 0, materials: 0, expenses: 0, other: 0 };
    let poAmount = 0, poCommitted = 0, poCount = 0, poCommittedCount = 0, skippedLines = 0;
    for (const d of docs) {
        if (norm(d.type) !== 'purchase order') continue;
        const shares = poCostShares(d as unknown as Record<string, unknown>);
        const lines = (Array.isArray(d.lineItems) ? d.lineItems : []) as LineLike[];
        const totals = documentTotals({ ...d, isProgressBilling: false, amountPaid: 0 });
        // tax / shipping spread over the lines; an Invoiced / Paid order with the supplier's amount costs that amount
        const factor = shares.invoiceAmount !== null
            ? (totals.subtotal > 0 ? shares.invoiceAmount / totals.subtotal : 0)
            : totals.subtotal > 0 ? totals.total / totals.subtotal : 1;
        let counted = false, committedHere = false;
        lines.forEach((li, i) => {
            const share = shares.lines[i] || { actualShare: 0, committedShare: 0 };
            if (!(share.actualShare > 0) && !(share.committedShare > 0)) return;
            const amount = lineItemAmount(li) * factor;
            if (!amount) return;
            const name = norm(li.description ?? li.name);
            const inv = str(li.inventoryItemId ?? li.item_id);
            if ((name && loggedNames.has(name)) || (inv && loggedItems.has(inv))) { skippedLines++; return; }
            const kind = classifyPurchaseLine(li, types);
            const spent = amount * share.actualShare;
            const ordered = amount * share.committedShare;
            if (spent) { add(kind, 'Purchase orders', spent); poAmount += spent; counted = true; }
            if (ordered) { committedBy[kind] += ordered; poCommitted += ordered; committedHere = true; }
        });
        // the supplier billed an order without prices: its invoice is a materials cost
        if (shares.invoiceAmount !== null && !(totals.subtotal > 0)) {
            add('materials', 'Purchase orders', shares.invoiceAmount);
            poAmount += shares.invoiceAmount;
            counted = true;
        }
        if (counted) poCount++;
        if (committedHere) poCommittedCount++;
    }

    const rows: CostingRow[] = COST_CATEGORIES.map(({ id, label }) => {
        const src = Array.from(sources[id].entries()).map(([l, a]) => ({ label: l, amount: roundMoney(a) })).filter(x => x.amount !== 0);
        const actual = roundMoney(src.reduce((s, x) => s + x.amount, 0));
        const committed = roundMoney(committedBy[id]);
        const rowBudget = hasPlanned[id] ? roundMoney(planned[id]) : null;
        return { id, label, budget: rowBudget, actual, committed, usedPct: rowBudget && rowBudget > 0 ? pct(actual + committed, rowBudget) : null, over: null, sources: src };
    });
    // rounding: the kinds + "not split" add up to the budget exactly
    let unsplitBudget = roundMoney(unsplit);
    const splitSum = roundMoney(rows.reduce((s, r) => s + (r.budget ?? 0), 0));
    const drift = roundMoney(budget - splitSum - unsplitBudget);
    if (drift !== 0) {
        if (unsplitBudget !== 0 || splitSum === 0) unsplitBudget = roundMoney(unsplitBudget + drift);
        else {
            const biggest = rows.filter(r => r.budget !== null).sort((a, b) => Math.abs(b.budget as number) - Math.abs(a.budget as number))[0];
            if (biggest) {
                biggest.budget = roundMoney((biggest.budget as number) + drift);
                biggest.usedPct = biggest.budget > 0 ? pct(biggest.actual + biggest.committed, biggest.budget) : null;
            }
        }
    }
    // overrun per kind: spent + ordered above that kind's share of the budget (≥ $1, so rounding never flags)
    const overruns: CostingOverrun[] = [];
    for (const r of rows) {
        if (r.budget === null || !(r.budget > 0)) continue;
        const spentOrOrdered = roundMoney(r.actual + r.committed);
        const over = roundMoney(spentOrOrdered - r.budget);
        if (over >= 1) {
            r.over = over;
            overruns.push({ id: r.id, label: r.label, spentOrOrdered, budget: r.budget, over });
        }
    }

    const actual = roundMoney(rows.reduce((s, r) => s + r.actual, 0));
    const committed = roundMoney(rows.reduce((s, r) => s + r.committed, 0));
    const used = roundMoney(actual + committed);
    const usedPct = budget > 0 ? pct(used, budget) : null;
    const progress = resolveProgress(docs, options.manualPercent);
    let projection: CostingSummary['projection'] = null;
    if (budget > 0 && progress.percent !== null && progress.percent >= ALERT_MIN_COMPLETE && used > 0) {
        const finalCost = roundMoney(Math.max(used, used / (progress.percent / 100)));
        const profit = roundMoney(budget - finalCost);
        projection = { finalCost, profit, margin: (profit / budget) * 100 };
    }
    const summary: CostingSummary = {
        budget, original, budgetChanges: original ? roundMoney(budget - original.amount) : 0,
        estimateCount, changeOrderCount, unsplitBudget, actual, committed,
        remaining: budget > 0 ? roundMoney(budget - actual - committed) : null,
        profitCosts: roundMoney(profitCosts),
        purchaseOrders: { amount: roundMoney(poAmount), committed: roundMoney(poCommitted), count: poCount, committedCount: poCommittedCount, skippedLines },
        usedPct, rows, overruns, progress, projection,
        status: { kind: 'nobudget', tone: 'muted', title: '', detail: '' },
    };
    summary.status = costingStatus(summary);
    return summary;
};
