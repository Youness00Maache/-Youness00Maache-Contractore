/**
 * One-tap time & materials (T&M) invoice for a job (competitor gap #12). Pure (no network): scripts/costing-check.ts
 * tests it under Node; lib/costingApi.ts saves what it builds.
 *
 *  1. Unbilled = time sheets, material-log lines and expense logs of the job that no live invoice has billed yet.
 *     Two records say what is billed, so a failed write or an edited log can't make something bill twice:
 *       - the invoice keeps the list it billed in `data.timeAndMaterials` (TmRecord);
 *       - each entry gets a marker in its own data: `billedInvoiceId`, `billedInvoiceNumber`, `billedAt`,
 *         `billedDocId` (= the entry's own id, so a "Duplicate as draft" copy is unbilled), and on material logs
 *         `billedItems` { item key → invoice id } (lines are never rewritten: stock and the form stay untouched).
 *     A Cancelled / Void / deleted invoice frees its entries again.
 *  2. Lines: labor = hours × the billing rate (overtime 1.5×), per worker or per time sheet; materials = the price-book
 *     price of the same item, else cost + markup; expenses (optional) = amount + markup. Lines never carry an
 *     inventory link (the material log already moved the stock); `unitCost` keeps the internal cost.
 *  3. The invoice = the Invoice form's defaults for a new invoice (src/ai/planDocuments.ts makeDocumentDefaults + the
 *     default "Pay now" link from Settings), the next INV number, status Draft. Totals are computed from the lines.
 */
import { FormType, type Job, type LineItem, type UserProfile } from '../types.ts';
import { computeDocumentTotals, roundMoney, toNumber, type DocumentTotals } from '../utils/money.ts';
import { DOC_NUMBER_CONFIG, isISODate, localISODate, newId, nextDocumentNumber, normalizeLinkUrl } from '../components/forms/formUtils.ts';
import { makeDocumentDefaults } from '../src/ai/planDocuments.ts';
import { PRICE_BOOK_DEFAULT_MARKUP, priceFromMarkup } from '../utils/stockMath.ts';
import { OVERTIME_MULTIPLIER, expenseTotal, isType } from './finance.ts';
import type { CostingDoc, InventoryLite, PriceBookLite } from './costing.ts';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
const norm = (v: unknown) => str(v).toLowerCase().replace(/\s+/g, ' ');
const isLiveInvoiceStatus = (status: unknown) => !['cancelled', 'canceled', 'void'].includes(norm(status));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------------------------------ the record
/** What a T&M invoice billed (stored in the invoice's data as `timeAndMaterials`). */
export interface TmRecord {
    version: 1;
    /** the invoice that holds this record (a duplicated invoice is a new draft and bills nothing) */
    invoiceId?: string;
    /** first and last day of the billed entries, and the cut-off chosen (YYYY-MM-DD) */
    from: string;
    to: string;
    through: string;
    createdAt: string;
    timeSheetIds: string[];
    /** material log id → item keys (materialItemKeys) */
    materialItems: Record<string, string[]>;
    expenseLogIds: string[];
    laborRate: number;
    materialMarkup: number;
    expenseMarkup: number;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

export const parseTmRecord = (v: unknown): TmRecord | null => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const r = v as Record<string, unknown>;
    const items: Record<string, string[]> = {};
    if (r.materialItems && typeof r.materialItems === 'object' && !Array.isArray(r.materialItems)) {
        for (const [logId, keys] of Object.entries(r.materialItems as Record<string, unknown>)) {
            const list = strList(keys);
            if (logId && list.length) items[logId] = list;
        }
    }
    const rec: TmRecord = {
        version: 1,
        ...(str(r.invoiceId) ? { invoiceId: str(r.invoiceId) } : {}),
        from: str(r.from), to: str(r.to), through: str(r.through), createdAt: str(r.createdAt),
        timeSheetIds: strList(r.timeSheetIds), materialItems: items, expenseLogIds: strList(r.expenseLogIds),
        laborRate: toNumber(r.laborRate), materialMarkup: toNumber(r.materialMarkup), expenseMarkup: toNumber(r.expenseMarkup),
    };
    return rec.timeSheetIds.length || Object.keys(items).length || rec.expenseLogIds.length ? rec : null;
};

/**
 * Stable key of every line of a material log: its id, or `#<position>` when it has none or shares it with another
 * line (the log's lines are never rewritten, so the key stays the same).
 */
export const materialItemKeys = (items: ReadonlyArray<Record<string, unknown> | null | undefined>): string[] => {
    const counts = new Map<string, number>();
    for (const it of items) { const id = str(it?.id); if (id) counts.set(id, (counts.get(id) || 0) + 1); }
    return items.map((it, i) => { const id = str(it?.id); return id && counts.get(id) === 1 ? id : `#${i}`; });
};

const itemsOf = (d: CostingDoc): Array<Record<string, unknown> | null> =>
    (Array.isArray(d.items) && d.items.length ? d.items : Array.isArray(d.materials) ? d.materials : []) as Array<Record<string, unknown> | null>;

// ------------------------------------------------------------------------------------- what is billed
export interface BilledRef { invoiceId: string; invoiceNumber: string }

export interface TmBilledIndex {
    timeSheets: Map<string, BilledRef>;
    /** `${logId}|${itemKey}` */
    materialItems: Map<string, BilledRef>;
    expenseLogs: Map<string, BilledRef>;
    /** the newest T&M invoice of the job that is not Cancelled / Void */
    lastInvoice: { id: string; number: string; to: string; createdAt: string } | null;
}

export const materialKey = (logId: string, itemKey: string) => `${logId}|${itemKey}`;

/** Everything a live (not Cancelled / Void / deleted) invoice of the job has billed. */
export const billedIndex = (docs: readonly CostingDoc[]): TmBilledIndex => {
    const live = new Map<string, CostingDoc>();
    for (const d of docs) if (isType(d, 'invoice') && isLiveInvoiceStatus(d.status)) live.set(d.id, d);
    const idx: TmBilledIndex = { timeSheets: new Map(), materialItems: new Map(), expenseLogs: new Map(), lastInvoice: null };
    const refOf = (inv: CostingDoc): BilledRef => ({ invoiceId: inv.id, invoiceNumber: str(inv.invoiceNumber) });

    for (const inv of live.values()) {
        const rec = parseTmRecord(inv.tm);
        if (!rec || (rec.invoiceId && rec.invoiceId !== inv.id)) continue;
        const ref = refOf(inv);
        rec.timeSheetIds.forEach(id => idx.timeSheets.set(id, ref));
        rec.expenseLogIds.forEach(id => idx.expenseLogs.set(id, ref));
        for (const [logId, keys] of Object.entries(rec.materialItems)) keys.forEach(k => idx.materialItems.set(materialKey(logId, k), ref));
        const created = rec.createdAt || str(inv.createdAt);
        if (!idx.lastInvoice || created > idx.lastInvoice.createdAt) {
            idx.lastInvoice = { id: inv.id, number: str(inv.invoiceNumber), to: rec.to || rec.through, createdAt: created };
        }
    }
    // markers written on the entries themselves (only on the entry they were written for, and only while the invoice lives)
    for (const d of docs) {
        if (str(d.billedDocId) !== d.id) continue;
        if (isType(d, 'time sheet') || isType(d, 'expense log')) {
            const inv = live.get(str(d.billedInvoiceId));
            const map = isType(d, 'time sheet') ? idx.timeSheets : idx.expenseLogs;
            if (inv && !map.has(d.id)) map.set(d.id, refOf(inv));
        } else if (isType(d, 'material log') && d.billedItems && typeof d.billedItems === 'object' && !Array.isArray(d.billedItems)) {
            for (const [key, invoiceId] of Object.entries(d.billedItems as Record<string, unknown>)) {
                const inv = live.get(str(invoiceId));
                const k = materialKey(d.id, key);
                if (inv && !idx.materialItems.has(k)) idx.materialItems.set(k, refOf(inv));
            }
        }
    }
    return idx;
};

// ----------------------------------------------------------------------------------------- unbilled
export interface TmLaborEntry { key: string; docId: string; date: string; worker: string; hours: number; overtime: number; note: string }
export interface TmMaterialEntry {
    key: string; docId: string; itemKey: string; date: string; name: string; supplier: string; quantity: number; unitCost: number;
    /** price-book price of the same item (null: cost + markup) */
    bookPrice: number | null;
}
export interface TmExpenseEntry { key: string; docId: string; date: string; label: string; amount: number }

export interface TmCandidates {
    labor: TmLaborEntry[];
    materials: TmMaterialEntry[];
    expenses: TmExpenseEntry[];
    lastInvoice: TmBilledIndex['lastInvoice'];
    /** unbilled entries dated after the cut-off (left out) */
    later: number;
}

/** The day an entry belongs to: its date, else the local day it was created. */
export const entryDay = (d: Pick<CostingDoc, 'date' | 'createdAt'>): string => {
    const date = str(d.date).slice(0, 10);
    if (isISODate(date)) return date;
    const created = new Date(str(d.createdAt));
    return Number.isNaN(created.getTime()) ? '' : localISODate(created);
};

/** Price-book sell prices by item name (lower case). */
export const priceBookPrices = (book: readonly PriceBookLite[] | null | undefined): Map<string, number> => {
    const byName = new Map<string, number>();
    for (const it of book || []) {
        const n = norm(it?.name);
        const rate = toNumber(it?.rate);
        if (n && rate > 0 && !byName.has(n)) byName.set(n, rate);
    }
    return byName;
};

/** Price-book price of a material: an item with the same name (or the same name as its inventory item). */
export const bookPriceFor = (
    name: string, inventoryItemId: string, prices: Map<string, number>, inventory: readonly InventoryLite[] | null | undefined,
): number | null => {
    const direct = prices.get(norm(name));
    if (direct !== undefined) return direct;
    if (inventoryItemId) {
        const inv = (inventory || []).find(i => i.id === inventoryItemId);
        const viaInventory = inv ? prices.get(norm(inv.name)) : undefined;
        if (viaInventory !== undefined) return viaInventory;
    }
    return null;
};

const LABEL_MAX = 120;
const expenseLabel = (d: CostingDoc): string => {
    const lines = Array.isArray(d.lineItems) ? d.lineItems.map(li => str((li as { description?: unknown })?.description)).filter(Boolean) : [];
    const what = str(d.item) || lines.join(', ') || str(d.title) || str(d.category) || 'Expense';
    const label = str(d.vendor) && !norm(what).includes(norm(d.vendor)) ? `${str(d.vendor)}: ${what}` : what;
    return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
};

/** Unbilled time sheets, material-log lines and expense logs of a job, oldest first, up to `through` (YYYY-MM-DD). */
export const collectUnbilled = (
    docs: readonly CostingDoc[],
    opts: { through?: string; priceBook?: readonly PriceBookLite[] | null; inventory?: readonly InventoryLite[] | null } = {},
): TmCandidates => {
    const billed = billedIndex(docs);
    const prices = priceBookPrices(opts.priceBook);
    const through = isISODate(opts.through) ? opts.through : '';
    const out: TmCandidates = { labor: [], materials: [], expenses: [], lastInvoice: billed.lastInvoice, later: 0 };
    /** after the cut-off: counted in `later`, left out */
    const isLater = (day: string, entries = 1) => {
        if (!(through && day && day > through)) return false;
        out.later += entries;
        return true;
    };
    for (const d of docs) {
        const day = entryDay(d);
        if (isType(d, 'time sheet')) {
            if (billed.timeSheets.has(d.id)) continue;
            const hours = Math.max(0, toNumber(d.hoursWorked));
            const overtime = Math.max(0, toNumber(d.overtimeHours));
            if (!(hours + overtime > 0) || isLater(day)) continue;
            out.labor.push({ key: `ts:${d.id}`, docId: d.id, date: day, worker: str(d.workerName), hours, overtime, note: str(d.notes) });
        } else if (isType(d, 'material log')) {
            const items = itemsOf(d);
            const keys = materialItemKeys(items);
            const pending: TmMaterialEntry[] = [];
            items.forEach((it, i) => {
                if (!it) return;
                const quantity = toNumber(it.quantity);
                const unitCost = toNumber(it.unitCost ?? it.unit_cost ?? it.cost);
                const name = str(it.name ?? it.description);
                if (!(quantity > 0) || (!name && !unitCost)) return;
                if (billed.materialItems.has(materialKey(d.id, keys[i]))) return;
                pending.push({
                    key: `mat:${d.id}:${keys[i]}`, docId: d.id, itemKey: keys[i], date: day, name: name || 'Material',
                    supplier: str(it.supplier), quantity, unitCost,
                    bookPrice: bookPriceFor(name, str(it.inventoryItemId ?? it.item_id), prices, opts.inventory),
                });
            });
            if (pending.length && !isLater(day, pending.length)) out.materials.push(...pending);
        } else if (isType(d, 'expense log')) {
            if (billed.expenseLogs.has(d.id)) continue;
            const amount = expenseTotal(d);
            if (!(amount > 0) || isLater(day)) continue;
            out.expenses.push({ key: `exp:${d.id}`, docId: d.id, date: day, label: expenseLabel(d), amount });
        }
    }
    const byDay = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);
    out.labor.sort(byDay); out.materials.sort(byDay); out.expenses.sort(byDay);
    return out;
};

/** Short totals of what is not billed yet (Job financials). */
export const unbilledSummary = (c: TmCandidates) => ({
    timeSheets: c.labor.length,
    hours: round2(c.labor.reduce((s, e) => s + e.hours, 0)),
    overtime: round2(c.labor.reduce((s, e) => s + e.overtime, 0)),
    materialLines: c.materials.length,
    materialCost: roundMoney(c.materials.reduce((s, e) => s + e.quantity * e.unitCost, 0)),
    expenses: c.expenses.length,
    expenseAmount: roundMoney(c.expenses.reduce((s, e) => s + e.amount, 0)),
    empty: !c.labor.length && !c.materials.length && !c.expenses.length,
});

// --------------------------------------------------------------------------------------------- rates
export interface TmRates {
    /** billing rate per hour (overtime × 1.5) */
    laborRate: number;
    /** % added to the cost of materials that are not in the price book */
    materialMarkup: number;
    /** % added to expense logs (0 = billed at cost) */
    expenseMarkup: number;
}

export interface TmPrefs extends TmRates {
    groupLabor: 'worker' | 'entry';
}

/** The price book's hourly labor item: type Labor, a name that says labor / hour first, then favorites and most used. */
export const priceBookLaborRate = (book: readonly PriceBookLite[] | null | undefined): { rate: number; name: string } | null => {
    const labor = (book || []).filter(it => norm(it?.type) === 'labor' && toNumber(it?.rate) > 0);
    if (!labor.length) return null;
    const score = (it: PriceBookLite) => (/\b(labou?r|hour|hourly|hr)\b/i.test(str(it.name)) ? 4 : 0) + (it.is_favorite ? 2 : 0);
    const best = [...labor].sort((a, b) => score(b) - score(a) || toNumber(b.use_count) - toNumber(a.use_count))[0];
    return { rate: toNumber(best.rate), name: str(best.name) };
};

/** Rates to start from: the last ones used (account), else the price book's labor item, else the labor rate. */
export const defaultTmPrefs = (args: {
    saved?: Partial<TmPrefs> | null;
    priceBook?: readonly PriceBookLite[] | null;
    accountLaborRate: number;
}): { prefs: TmPrefs; laborSource: string } => {
    const saved = args.saved || {};
    const book = priceBookLaborRate(args.priceBook);
    let laborRate = toNumber(saved.laborRate);
    let laborSource = 'Last rate you billed';
    if (!(laborRate > 0) && book) { laborRate = book.rate; laborSource = `Price book: ${book.name}`; }
    if (!(laborRate > 0)) { laborRate = Math.max(0, toNumber(args.accountLaborRate)); laborSource = 'Your labor rate (Job financials)'; }
    const markup = (v: unknown, fallback: number) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? fallback : Math.max(0, toNumber(v)));
    return {
        prefs: {
            laborRate: roundMoney(laborRate),
            materialMarkup: markup(saved.materialMarkup, PRICE_BOOK_DEFAULT_MARKUP),
            expenseMarkup: markup(saved.expenseMarkup, 0),
            groupLabor: saved.groupLabor === 'entry' ? 'entry' : 'worker',
        },
        laborSource,
    };
};

/** Sell price of a material entry: price book, else cost + markup. */
export const materialPrice = (e: Pick<TmMaterialEntry, 'bookPrice' | 'unitCost'>, markup: number): number =>
    e.bookPrice !== null && e.bookPrice > 0 ? roundMoney(e.bookPrice) : priceFromMarkup(e.unitCost, markup);

// --------------------------------------------------------------------------------------------- lines
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-03" → "Nov 3" */
export const shortDay = (ymd: string): string => {
    if (!isISODate(ymd)) return '';
    const [, m, d] = ymd.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}`;
};
export const dayRange = (from: string, to: string): string => {
    if (!from) return shortDay(to);
    if (!to || from === to) return shortDay(from);
    return `${shortDay(from)} – ${shortDay(to)}`;
};

export interface TmBuild {
    lines: LineItem[];
    totals: DocumentTotals;
    timeSheets: number;
    hours: number;
    overtime: number;
    materialLines: number;
    expenses: number;
    /** selected materials with neither a price nor a cost */
    unpriced: number;
    from: string;
    to: string;
}

const line = (description: string, quantity: number, rate: number, unitCost: number): LineItem => ({
    id: newId(), description, quantity: round2(quantity), rate: roundMoney(rate), unitCost: roundMoney(unitCost),
});

/**
 * The invoice lines for the selected entries (`selected` holds entry keys). `costRate` = the labor rate of Job
 * financials, kept as the lines' internal cost.
 */
export const buildTmLines = (
    c: TmCandidates, selected: ReadonlySet<string>, prefs: TmPrefs, costRate: number,
): TmBuild => {
    const labor = c.labor.filter(e => selected.has(e.key));
    const materials = c.materials.filter(e => selected.has(e.key));
    const expenses = c.expenses.filter(e => selected.has(e.key));
    const lines: LineItem[] = [];
    const rate = Math.max(0, toNumber(prefs.laborRate));
    const cost = Math.max(0, toNumber(costRate));
    const otRate = rate * OVERTIME_MULTIPLIER;
    const otCost = cost * OVERTIME_MULTIPLIER;

    // labor
    if (prefs.groupLabor === 'entry') {
        for (const e of labor) {
            const who = e.worker || 'Crew';
            const when = shortDay(e.date);
            if (e.hours > 0) lines.push(line(`Labor: ${who}${when ? `, ${when}` : ''}`, e.hours, rate, cost));
            if (e.overtime > 0) lines.push(line(`Overtime (1.5×): ${who}${when ? `, ${when}` : ''}`, e.overtime, otRate, otCost));
        }
    } else {
        const groups = new Map<string, { worker: string; hours: number; overtime: number; from: string; to: string }>();
        for (const e of labor) {
            const k = norm(e.worker) || '~crew';
            const g = groups.get(k) || { worker: e.worker || 'Crew', hours: 0, overtime: 0, from: e.date, to: e.date };
            g.hours += e.hours; g.overtime += e.overtime;
            if (e.date && (!g.from || e.date < g.from)) g.from = e.date;
            if (e.date && e.date > g.to) g.to = e.date;
            groups.set(k, g);
        }
        for (const g of groups.values()) {
            const when = dayRange(g.from, g.to);
            if (g.hours > 0) lines.push(line(`Labor: ${g.worker}${when ? ` (${when})` : ''}`, g.hours, rate, cost));
            if (g.overtime > 0) lines.push(line(`Overtime (1.5×): ${g.worker}${when ? ` (${when})` : ''}`, g.overtime, otRate, otCost));
        }
    }

    // materials: the same item at the same price is one line
    const merged = new Map<string, { name: string; quantity: number; cost: number; price: number }>();
    let unpriced = 0;
    for (const e of materials) {
        const price = materialPrice(e, prefs.materialMarkup);
        if (!(price > 0)) unpriced++;
        const k = `${norm(e.name)}|${price}`;
        const m = merged.get(k) || { name: e.name, quantity: 0, cost: 0, price };
        m.quantity += e.quantity;
        m.cost += e.quantity * e.unitCost;
        merged.set(k, m);
    }
    for (const m of merged.values()) lines.push(line(m.name, m.quantity, m.price, m.quantity > 0 ? m.cost / m.quantity : 0));

    // expenses
    for (const e of expenses) {
        const when = shortDay(e.date);
        lines.push(line(`${e.label}${when ? ` (${when})` : ''}`, 1, priceFromMarkup(e.amount, prefs.expenseMarkup), e.amount));
    }

    const days = [...labor, ...materials, ...expenses].map(e => e.date).filter(Boolean).sort();
    return {
        lines,
        totals: computeDocumentTotals({ lineItems: lines }),
        timeSheets: labor.length,
        hours: round2(labor.reduce((s, e) => s + e.hours, 0)),
        overtime: round2(labor.reduce((s, e) => s + e.overtime, 0)),
        materialLines: materials.length,
        expenses: expenses.length,
        unpriced,
        from: days[0] || '',
        to: days[days.length - 1] || '',
    };
};

/** What the invoice records about the entries it billed. */
export const tmRecordFor = (c: TmCandidates, selected: ReadonlySet<string>, prefs: TmRates, build: Pick<TmBuild, 'from' | 'to'>, through: string, now: Date = new Date()): TmRecord => {
    const materialItems: Record<string, string[]> = {};
    for (const e of c.materials) if (selected.has(e.key)) (materialItems[e.docId] ||= []).push(e.itemKey);
    return {
        version: 1,
        from: build.from, to: build.to, through, createdAt: now.toISOString(),
        timeSheetIds: c.labor.filter(e => selected.has(e.key)).map(e => e.docId),
        materialItems,
        expenseLogIds: c.expenses.filter(e => selected.has(e.key)).map(e => e.docId),
        laborRate: roundMoney(prefs.laborRate), materialMarkup: toNumber(prefs.materialMarkup), expenseMarkup: toNumber(prefs.expenseMarkup),
    };
};

// ------------------------------------------------------------------------------------------- invoice
export const nextInvoiceNumber = (existing: Iterable<string | null | undefined>, now: Date = new Date()): string =>
    nextDocumentNumber(DOC_NUMBER_CONFIG[FormType.Invoice]?.prefix || 'INV', existing, now);

/** Full `data` of the Draft T&M invoice: the Invoice form's defaults + the lines + what it billed. */
export const buildTmInvoiceData = (args: {
    job: Job;
    profile?: UserProfile | null;
    lines: LineItem[];
    number: string;
    record: TmRecord;
    today: string;
}): Record<string, unknown> => {
    const base = makeDocumentDefaults(FormType.Invoice, args.job, args.profile, args.today);
    const p = (args.profile || {}) as Partial<UserProfile>;
    // the default "Pay now" link from Settings, exactly like a new invoice in the form
    const payLink = str(p.payLinkDefault) ? normalizeLinkUrl(p.payLinkDefault) || str(p.payLinkDefault) : '';
    const range = dayRange(args.record.from, args.record.to);
    return {
        ...base,
        paypalLink: payLink,
        ...(payLink && str(p.payLinkLabel) ? { payLinkLabel: str(p.payLinkLabel) } : {}),
        title: 'Time & materials',
        invoiceNumber: args.number,
        lineItems: args.lines,
        notes: `Time and materials${range ? ` ${args.record.from === args.record.to ? 'for' : 'from'} ${range.replace(' – ', ' to ')}` : ''}.\n${str(base.notes) || 'Thank you for your business.'}`,
        status: 'Draft',
        timeAndMaterials: args.record,
    };
};

/** An entry's data with the billed marker (everything else, lines included, is kept as it is). */
export const withBilledMarker = (
    data: Record<string, unknown>, docId: string, type: 'time sheet' | 'material log' | 'expense log',
    invoice: { id: string; number: string }, at: string, itemKeys: readonly string[] = [],
): Record<string, unknown> => {
    const marker = { billedInvoiceId: invoice.id, billedInvoiceNumber: invoice.number, billedAt: at, billedDocId: docId };
    if (type !== 'material log') return { ...data, ...marker };
    const prev = str(data.billedDocId) === docId && data.billedItems && typeof data.billedItems === 'object' && !Array.isArray(data.billedItems)
        ? (data.billedItems as Record<string, unknown>) : {};
    const billedItems: Record<string, string> = {};
    for (const [k, v] of Object.entries(prev)) if (str(v)) billedItems[k] = str(v);
    for (const k of itemKeys) billedItems[k] = invoice.id;
    return { ...data, ...marker, billedItems };
};
