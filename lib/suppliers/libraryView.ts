/**
 * Suppliers + product library (roadmap D4, phase B): the small pure helpers the screens use. No React, no Supabase
 * (scripts/supplier-library-check.ts tests them).
 *
 *   filterCatalogue / historyRows / sparkline   a supplier's catalogue list: search, "price changed" filter, the price
 *                                               history of one item (newest first, with the change at each step), a tiny
 *                                               oldest -> newest line
 *   specsToRows / rowsToSpecs / specProblem     the key / value Specs editor of a price-book item
 *   normalizeUrl / urlProblem                   the Product link field ("homedepot.com/p/1" -> https://...)
 *   libraryDraftFromItem / libraryPatch         the 3 product-library fields of a price-book item: what the form shows,
 *                                               and only what the user changed (written by updatePriceBookLibraryFields)
 *   productHints / impactSentence               cheapest known supplier + margin impact for a price-book item
 *   suppliersTableDiff                          the old-style supplier list the PO / reorder code edits -> writes to the
 *                                               suppliers table (create / update / archive, a removed one comes back by name)
 *   suggestForReorderGroup / reorderPriceFills  reorder: which supplier to suggest for a group of low-stock items, and the
 *                                               supplier's own price for each line
 *   prefillPoForm                               manual purchase order: sku / unit / price from the supplier's catalogue
 */
import { normName, type Supplier } from '../suppliers.ts';
import { formatMoney } from '../../utils/money.ts';
import { detectPriceChange, isNotableChange, latestPriceChange, parsePriceHistory, type PriceChange } from './priceChange.ts';
import {
    cheapestSupplierFor, legacyToInput, marginImpact, prefillPoLines, recordToLegacy, suggestSupplierForInventoryItem, supplierOffersFor,
    type MarginImpact, type PoLineLike, type SupplierOffer, type SupplierSuggestion,
} from './libraryLogic.ts';
import type { PriceBookLibraryItem, PriceBookLibraryPatch, PriceHistoryEntry, SupplierInput, SupplierItemRecord, SupplierRecord } from './types.ts';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const clip = (v: unknown, max: number): string => str(v).replace(/\s+/g, ' ').slice(0, max);
const money = (n: number) => formatMoney(n);

// =====================================================================================================================
// Catalogue list
// =====================================================================================================================
/** Items matching the search (sku, name, unit, notes) and, with `changedOnly`, whose last price change is notable. A-Z. */
export const filterCatalogue = (
    items: readonly SupplierItemRecord[], query: string, opts: { changedOnly?: boolean; minPct?: number } = {},
): SupplierItemRecord[] => {
    const q = str(query).toLowerCase();
    return items
        .filter((i) => {
            if (opts.changedOnly && !isNotableChange(latestPriceChange(i.priceHistory), opts.minPct ?? 5)) return false;
            return !q || [i.sku, i.name, i.unit, i.notes].some((v) => str(v).toLowerCase().includes(q));
        })
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
};

export interface HistoryRow {
    price: number;
    at: string;
    /** the change from the entry before (flag 'new' for the first price ever) */
    change: PriceChange;
}

/** The last `max` prices of an item, newest first, each with its change against the price before. */
export const historyRows = (history: readonly PriceHistoryEntry[], max = 8): HistoryRow[] => {
    const h = parsePriceHistory(history);
    const rows: HistoryRow[] = h.map((e, i) => ({ price: e.price, at: e.at, change: detectPriceChange(i === 0 ? null : h[i - 1].price, e.price) }));
    return rows.reverse().slice(0, Math.max(1, max));
};

export interface Sparkline {
    /** SVG polyline points ("x,y x,y ...") */
    points: string;
    trend: 'up' | 'down' | 'flat';
    /** the last point, for a dot */
    last: { x: number; y: number };
}

/** Oldest -> newest line of an item's prices; null with fewer than two prices. */
export const sparkline = (history: readonly PriceHistoryEntry[], width = 72, height = 20, pad = 2): Sparkline | null => {
    const h = parsePriceHistory(history).slice(-24);
    if (h.length < 2) return null;
    const prices = h.map((e) => e.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const x = (i: number) => Math.round((pad + (i * (width - 2 * pad)) / (h.length - 1)) * 10) / 10;
    const y = (p: number) => (hi === lo ? height / 2 : Math.round((height - pad - ((p - lo) / (hi - lo)) * (height - 2 * pad)) * 10) / 10);
    const pts = prices.map((p, i) => ({ x: x(i), y: y(p) }));
    const change = detectPriceChange(prices[0], prices[prices.length - 1]);
    return { points: pts.map((p) => `${p.x},${p.y}`).join(' '), trend: change.flag === 'up' ? 'up' : change.flag === 'down' ? 'down' : 'flat', last: pts[pts.length - 1] };
};

// =====================================================================================================================
// Specs (key / value list on a price-book item)
// =====================================================================================================================
export interface SpecRow {
    key: string;
    value: string;
}

export const MAX_SPECS = 30;

export const specsToRows = (specs: Record<string, string> | null | undefined): SpecRow[] =>
    specs && typeof specs === 'object' ? Object.entries(specs).map(([key, value]) => ({ key, value: str(value) })) : [];

/** Rows -> the stored object (labels clipped to 80, values to 500; rows missing a label or a value dropped; none left = null). */
export const rowsToSpecs = (rows: readonly SpecRow[]): Record<string, string> | null => {
    const out: Record<string, string> = {};
    for (const r of rows) {
        const key = clip(r.key, 80);
        const value = clip(r.value, 500);
        if (!key || !value) continue;
        if (Object.keys(out).length >= MAX_SPECS && !(key in out)) break;
        out[key] = value;
    }
    return Object.keys(out).length ? out : null;
};

/** A readable problem with the rows (the same label twice), or null. */
export const specProblem = (rows: readonly SpecRow[]): string | null => {
    const seen = new Set<string>();
    for (const r of rows) {
        const key = clip(r.key, 80).toLowerCase();
        if (!key) continue;
        if (seen.has(key)) return `“${clip(r.key, 80)}” is listed twice. Give each spec its own name.`;
        seen.add(key);
    }
    return null;
};

// =====================================================================================================================
// Product link
// =====================================================================================================================
/** Adds https:// to "homedepot.com/p/1"; anything else is returned as typed (trimmed). */
export const normalizeUrl = (v: unknown): string => {
    const s = str(v);
    if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || /\s/.test(s)) return s;
    return /^[^\s/]+\.[^\s/]{2,}(\/|$)/.test(s) ? `https://${s}` : s;
};

export const isWebUrl = (v: unknown): boolean => {
    try {
        const u = new URL(normalizeUrl(v));
        return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
    } catch {
        return false;
    }
};

/** Readable problem with a Product link, or null (empty is fine). */
export const urlProblem = (v: unknown): string | null =>
    !str(v) || isWebUrl(v) ? null : 'That link doesn’t look right (example: https://supplier.com/item).';

// =====================================================================================================================
// Price-book item: the three product-library fields
// =====================================================================================================================
export interface LibraryDraft {
    url: string;
    specs: SpecRow[];
    supplierId: string | null;
}

/** What the form starts with (from a saved_items row / price-book item that may not have the columns yet). */
export const libraryDraftFromItem = (item: unknown): LibraryDraft => {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const specs = r.specs && typeof r.specs === 'object' && !Array.isArray(r.specs) ? (r.specs as Record<string, string>) : null;
    return { url: str(r.url), specs: specsToRows(specs), supplierId: str(r.supplier_id ?? r.supplierId) || null };
};

/** Only the fields the user changed (empty object = nothing to write). */
export const libraryPatch = (initial: LibraryDraft, current: LibraryDraft): PriceBookLibraryPatch => {
    const patch: PriceBookLibraryPatch = {};
    const url = normalizeUrl(current.url);
    if (url !== normalizeUrl(initial.url)) patch.url = url || null;
    if (JSON.stringify(rowsToSpecs(current.specs)) !== JSON.stringify(rowsToSpecs(initial.specs))) patch.specs = rowsToSpecs(current.specs);
    if ((current.supplierId || null) !== (initial.supplierId || null)) patch.supplierId = current.supplierId || null;
    return patch;
};

export const hasLibraryPatch = (p: PriceBookLibraryPatch | null | undefined): boolean => !!p && Object.keys(p).length > 0;

// =====================================================================================================================
// Product hints: cheapest known supplier + margin impact
// =====================================================================================================================
export interface ProductHints {
    /** every supplier offering this item, cheapest first */
    offers: SupplierOffer[];
    cheapest: SupplierOffer | null;
    /** item cost - cheapest price (> 0 = buying from the cheapest supplier saves this per unit) */
    savingPerUnit: number | null;
    /** the offer of the chosen preferred supplier */
    preferred: SupplierOffer | null;
    /** the preferred supplier's price (else the cheapest) when it differs from the item's cost: what that does to the margin */
    impact: { offer: SupplierOffer; impact: MarginImpact; pctVsCost: number | null } | null;
}

export const productHints = (
    item: Pick<PriceBookLibraryItem, 'id' | 'sku' | 'name' | 'cost' | 'rate' | 'markup'>,
    preferredSupplierId: string | null,
    supplierItems: readonly SupplierItemRecord[],
    suppliers: readonly SupplierRecord[],
): ProductHints => {
    const res = cheapestSupplierFor(item, supplierItems, suppliers);
    const offers = res?.offers || supplierOffersFor(item, supplierItems, suppliers);
    const preferred = preferredSupplierId ? offers.find((o) => o.supplier.id === preferredSupplierId) || null : null;
    const basis = preferred || res?.best || null;
    let impact: ProductHints['impact'] = null;
    if (basis && item.cost > 0 && Math.abs(basis.price - item.cost) >= 0.005) {
        impact = { offer: basis, impact: marginImpact(item, basis.price), pctVsCost: detectPriceChange(item.cost, basis.price).pct };
    }
    return { offers, cheapest: res?.best || null, savingPerUnit: res ? res.savingPerUnit : null, preferred, impact };
};

/** One plain sentence about a supplier price that differs from the item's cost. */
export const impactSentence = (h: NonNullable<ProductHints['impact']>): string => {
    const { offer, impact: m, pctVsCost } = h;
    const pct = pctVsCost === null ? '' : ` (${pctVsCost > 0 ? '+' : ''}${pctVsCost}%)`;
    const parts = [`${offer.supplier.name} charges ${money(offer.price)}, your cost is ${money(m.oldCost)}${pct}.`];
    if (m.oldMarginPct !== null && m.newMarginPct !== null) parts.push(`Margin at your price: ${m.oldMarginPct}% now, ${m.newMarginPct}% at that cost.`);
    if (m.sellingBelowCost) parts.push('That is more than you charge.');
    else if (m.change === 'up' && Math.abs(m.keepMarkupPrice - m.price) >= 0.005) parts.push(`To keep your markup, charge ${money(m.keepMarkupPrice)}.`);
    return parts.join(' ');
};

// =====================================================================================================================
// Old-style supplier list <-> the suppliers table (what the purchase order / reorder screens still edit)
// =====================================================================================================================
const LEGACY_FIELDS = ['name', 'email', 'phone', 'address', 'accountNumber', 'notes'] as const;

export interface SuppliersTablePlan {
    create: SupplierInput[];
    /** existing rows to change (a removed supplier saved again by name is brought back: archived false) */
    update: Array<{ id: string; input: SupplierInput }>;
    /** rows that were in the list and are no longer */
    archive: string[];
}

/**
 * Turns the list the old screens edit (`next`: the active suppliers in the old shape) into table writes. Only fields the
 * old shape has are compared, against the old-shape version of the row (so a long note kept in the table is never cut
 * to the old limit by an unrelated edit). A supplier removed from the list is archived, never deleted.
 */
export const suppliersTableDiff = (records: readonly SupplierRecord[], next: readonly Supplier[]): SuppliersTablePlan => {
    const plan: SuppliersTablePlan = { create: [], update: [], archive: [] };
    const byId = new Map(records.map((r) => [r.id, r]));
    const nextIds = new Set(next.map((s) => s.id));
    for (const r of records) if (!r.archived && !nextIds.has(r.id)) plan.archive.push(r.id);
    const archivedByName = new Map<string, SupplierRecord>();
    for (const r of records) if (r.archived && !archivedByName.has(normName(r.name))) archivedByName.set(normName(r.name), r);
    for (const s of next) {
        const rec = byId.get(s.id);
        if (rec) {
            const old = recordToLegacy(rec);
            const input: SupplierInput = {};
            for (const f of LEGACY_FIELDS) if (str(s[f]) !== str(old[f])) (input as Record<string, unknown>)[f] = s[f];
            if (Object.keys(input).length) plan.update.push({ id: rec.id, input });
            continue;
        }
        const back = archivedByName.get(normName(s.name));
        const input = legacyToInput(s);
        delete input.legacyKey;
        if (back) { plan.update.push({ id: back.id, input: { ...input, archived: false } }); archivedByName.delete(normName(s.name)); }
        else plan.create.push(input);
    }
    return plan;
};

export const isEmptyTablePlan = (p: SuppliersTablePlan): boolean => !p.create.length && !p.update.length && !p.archive.length;

// =====================================================================================================================
// Reorder
// =====================================================================================================================
export interface ReorderLineLike {
    itemId: string;
    name: string;
    sku: string;
    unit: string;
    unitCost: number;
    supplierText?: string;
}

export interface GroupSuggestion {
    supplier: SupplierRecord;
    /** how many of the group's lines this supplier is suggested for */
    lines: number;
    total: number;
    reason: SupplierSuggestion['reason'];
}

export const suggestionReasonText = (reason: SupplierSuggestion['reason']): string =>
    reason === 'preferred' ? 'preferred supplier in your price book' : reason === 'cheapest' ? 'cheapest in your catalogues' : 'named on the item';

/**
 * Supplier to suggest for a group of low-stock items: the one suggested for the most lines (ties: preferred before
 * cheapest before the item's own supplier text, then A-Z). Null = no suggestion for any line.
 */
export const suggestForReorderGroup = (
    lines: readonly ReorderLineLike[],
    ctx: { priceBook: readonly PriceBookLibraryItem[]; suppliers: readonly SupplierRecord[]; supplierItems: readonly SupplierItemRecord[] },
): GroupSuggestion | null => {
    const rank = { preferred: 0, cheapest: 1, inventory: 2 } as const;
    const tally = new Map<string, GroupSuggestion>();
    for (const l of lines) {
        const s = suggestSupplierForInventoryItem({ id: l.itemId, name: l.name, sku: l.sku, supplier: l.supplierText }, ctx);
        if (!s) continue;
        const prev = tally.get(s.supplier.id);
        if (!prev) tally.set(s.supplier.id, { supplier: s.supplier, lines: 1, total: lines.length, reason: s.reason });
        else { prev.lines++; if (rank[s.reason] < rank[prev.reason]) prev.reason = s.reason; }
    }
    return Array.from(tally.values()).sort((a, b) => b.lines - a.lines || rank[a.reason] - rank[b.reason]
        || a.supplier.name.localeCompare(b.supplier.name, undefined, { sensitivity: 'base' }))[0] || null;
};

export interface PriceFill {
    price: number;
    supplierItem: SupplierItemRecord;
    by: 'pricebook' | 'sku' | 'name';
}

/** The supplier's own price for each reorder line that is in its catalogue (item id -> fill). */
export const reorderPriceFills = (
    lines: readonly ReorderLineLike[], supplierItems: readonly SupplierItemRecord[], supplierId: string,
): Map<string, PriceFill> => {
    const out = new Map<string, PriceFill>();
    const poLines = lines.map((l) => ({ description: l.name, sku: l.sku, unit: l.unit, rate: l.unitCost, unitCost: l.unitCost }));
    const res = prefillPoLines(poLines, supplierItems, supplierId, { overwritePrices: true });
    res.lines.forEach((r, i) => {
        const by = res.matches[i];
        const si = r.supplierItemId ? supplierItems.find((x) => x.id === r.supplierItemId) : undefined;
        if (by && si && si.unitPrice > 0) out.set(lines[i].itemId, { price: si.unitPrice, supplierItem: si, by });
    });
    return out;
};

// =====================================================================================================================
// Manual purchase order: fill from the supplier's catalogue
// =====================================================================================================================
export interface PoFormLine extends PoLineLike {
    description?: string;
}

/**
 * Lines of a purchase order with the supplier's unit and price filled in where they are empty (a price you typed is
 * kept) and its SKU added to the description ("2x4 stud (SKU 1234)") unless the description already has it. `filled` =
 * lines that changed. Lines that match nothing come back unchanged.
 */
export const prefillPoForm = <T extends PoFormLine>(
    lines: readonly T[], supplierItems: readonly SupplierItemRecord[], supplierId: string,
): { lines: T[]; filled: number } => {
    const res = prefillPoLines(lines, supplierItems, supplierId);
    let filled = 0;
    const out = res.lines.map((r, i) => {
        const { supplierItemId, sku, ...rest } = r as typeof r & { supplierItemId?: string };
        const next = rest as unknown as T;
        if (res.matches[i] && sku) {
            const d = str(next.description);
            if (d && !d.toLowerCase().includes(sku.toLowerCase())) next.description = `${d} (SKU ${sku})`;
        }
        const before = lines[i];
        if (str(before.sku)) (next as PoLineLike).sku = before.sku;
        if (str(before.description) !== str(next.description) || str(before.unit) !== str(next.unit) || (before.rate ?? 0) !== (next.rate ?? 0) || (before.unitCost ?? 0) !== (next.unitCost ?? 0)) filled++;
        return next;
    });
    return { lines: out, filled };
};
