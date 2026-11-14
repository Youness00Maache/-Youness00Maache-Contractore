/**
 * Suppliers + product library (roadmap D4): pure logic. No React, no Supabase (lib/suppliers/suppliersDb.ts binds it to
 * the database; scripts/supplier-library-check.ts tests it).
 *
 *   mapSupplierRow / supplierInputToRow          public.suppliers row <-> SupplierRecord
 *   mapSupplierItemRow / supplierItemInputToRow  public.supplier_items row <-> SupplierItemRecord
 *   mapPriceBookRow / priceBookPatchToRow        public.saved_items row -> PriceBookLibraryItem; the 3 new columns
 *   legacyToRecord / recordToLegacy              old settings-list Supplier <-> SupplierRecord (so the existing PO /
 *                                                reorder code, which takes lib/suppliers.ts `Supplier`, keeps working)
 *   planLegacyImport                             which old-list suppliers still need a row (by legacy_key, then name)
 *   suppliersToShow                              table rows when the feature is ready, else the old list
 *   normSku / matchBySkuOrName                  matching: SKU first (case / spaces / dashes ignored), then name
 *   cheapestSupplierFor                          cheapest supplier item for a price-book item
 *   marginImpact                                 what a new cost does to a price-book item's margin / markup
 *   prefillPoLines                               PO draft lines + a supplier's catalogue -> sku / unit / price filled
 *   suggestSupplierForInventoryItem              reorder: price-book item's preferred supplier, else the cheapest
 */
import { normName, normalizeSupplier, type Supplier } from '../suppliers.ts';
import { markupFromPrice, marginFromPrice, priceFromMarkup } from '../../utils/stockMath.ts';
import { parsePriceHistory } from './priceChange.ts';
import type {
    PriceBookLibraryItem, PriceBookLibraryPatch, SupplierInput, SupplierItemInput, SupplierItemRecord, SupplierRecord, SuppliersFeatureState,
} from './types.ts';

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const clip = (v: unknown, max: number): string => str(v).replace(/\s+/g, ' ').slice(0, max);
const clipMulti = (v: unknown, max: number): string => str(v).replace(/\r\n?/g, '\n').slice(0, max);
const numOr = (v: unknown, fallback: number): number => {
    if (v === null || v === undefined || v === '') return fallback;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
};
const nullIfEmpty = (s: string): string | null => (s ? s : null);
const money4 = (n: number) => Math.round(n * 10000) / 10000;

/** Column limits (same as the migration's checks). */
export const SUPPLIER_RECORD_LIMITS = {
    name: 120, contactName: 120, email: 254, phone: 40, address: 300, website: 500, accountNumber: 60, paymentTerms: 120, notes: 2000,
} as const;
export const SUPPLIER_ITEM_LIMITS = { sku: 80, name: 300, unit: 40, url: 1000, notes: 2000, maxPrice: 99_999_999 } as const;

// =====================================================================================================================
// Row mapping
// =====================================================================================================================
export const SUPPLIER_COLUMNS = 'id, name, contact_name, email, phone, address, website, account_number, payment_terms, notes, lead_time_days, preferred, archived, legacy_key, created_at, updated_at';
export const SUPPLIER_ITEM_COLUMNS = 'id, supplier_id, saved_item_id, sku, name, unit, unit_price, url, notes, last_price_at, price_history, created_at, updated_at';

export const mapSupplierRow = (r: Row): SupplierRecord => ({
    id: str(r.id),
    name: str(r.name),
    contactName: str(r.contact_name),
    email: str(r.email),
    phone: str(r.phone),
    address: str(r.address),
    website: str(r.website),
    accountNumber: str(r.account_number),
    paymentTerms: str(r.payment_terms),
    notes: str(r.notes),
    leadTimeDays: r.lead_time_days === null || r.lead_time_days === undefined ? null : numOr(r.lead_time_days, 0),
    preferred: r.preferred === true,
    archived: r.archived === true,
    legacyKey: str(r.legacy_key) || null,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
});

/**
 * Database columns for a supplier create / update (only the fields given). Throws a readable error when the name is
 * empty on create (`requireName`).
 */
export const supplierInputToRow = (input: SupplierInput, requireName = false): Row => {
    const L = SUPPLIER_RECORD_LIMITS;
    const row: Row = {};
    if (input.name !== undefined || requireName) {
        const name = clip(input.name, L.name);
        if (!name) throw new Error('Give the supplier a name.');
        row.name = name;
    }
    const text = (k: keyof SupplierInput, col: string, max: number, multi = false) => {
        if (input[k] === undefined) return;
        row[col] = nullIfEmpty(multi ? clipMulti(input[k], max) : clip(input[k], max));
    };
    text('contactName', 'contact_name', L.contactName);
    if (input.email !== undefined) row.email = nullIfEmpty(clip(input.email, L.email).toLowerCase());
    text('phone', 'phone', L.phone);
    text('address', 'address', L.address, true);
    text('website', 'website', L.website);
    text('accountNumber', 'account_number', L.accountNumber);
    text('paymentTerms', 'payment_terms', L.paymentTerms);
    text('notes', 'notes', L.notes, true);
    if (input.leadTimeDays !== undefined) {
        const d = input.leadTimeDays === null ? null : Math.round(numOr(input.leadTimeDays, -1));
        row.lead_time_days = d === null || d < 0 ? null : Math.min(365, d);
    }
    if (input.preferred !== undefined) row.preferred = !!input.preferred;
    if (input.archived !== undefined) row.archived = !!input.archived;
    if (input.legacyKey !== undefined) row.legacy_key = nullIfEmpty(clip(input.legacyKey, 60));
    return row;
};

export const mapSupplierItemRow = (r: Row): SupplierItemRecord => ({
    id: str(r.id),
    supplierId: str(r.supplier_id),
    savedItemId: str(r.saved_item_id) || null,
    sku: str(r.sku),
    name: str(r.name),
    unit: str(r.unit),
    unitPrice: Math.max(0, numOr(r.unit_price, 0)),
    url: str(r.url),
    notes: str(r.notes),
    lastPriceAt: str(r.last_price_at) || null,
    priceHistory: parsePriceHistory(r.price_history),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
});

/** Database columns for a supplier-item create / update (price_history / last_price_at are never sent). */
export const supplierItemInputToRow = (input: SupplierItemInput, requireCreateFields = false): Row => {
    const L = SUPPLIER_ITEM_LIMITS;
    const row: Row = {};
    if (input.supplierId !== undefined || requireCreateFields) {
        if (!str(input.supplierId)) throw new Error('Pick a supplier for this item.');
        row.supplier_id = str(input.supplierId);
    }
    if (input.name !== undefined || requireCreateFields) {
        const name = clip(input.name, L.name);
        if (!name) throw new Error('Give the item a name.');
        row.name = name;
    }
    if (input.savedItemId !== undefined) row.saved_item_id = str(input.savedItemId) || null;
    if (input.sku !== undefined) row.sku = nullIfEmpty(clip(input.sku, L.sku));
    if (input.unit !== undefined) row.unit = nullIfEmpty(clip(input.unit, L.unit));
    if (input.unitPrice !== undefined || requireCreateFields) {
        const p = numOr(input.unitPrice, 0);
        if (p < 0 || p > L.maxPrice) throw new Error('Enter a price of 0 or more.');
        row.unit_price = money4(p);
    }
    if (input.url !== undefined) row.url = nullIfEmpty(clip(input.url, L.url));
    if (input.notes !== undefined) row.notes = nullIfEmpty(clipMulti(input.notes, L.notes));
    return row;
};

const parseSpecs = (v: unknown): Record<string, string> | null => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Row)) {
        const key = clip(k, 80);
        if (key && val !== null && val !== undefined && typeof val !== 'object') out[key] = clip(val, 500);
    }
    return Object.keys(out).length ? out : null;
};

export const mapPriceBookRow = (r: Row): PriceBookLibraryItem => {
    const unitCost = numOr(r.unit_cost, 0);
    return {
        id: str(r.id),
        name: str(r.name),
        sku: str(r.sku),
        unit: str(r.unit),
        rate: numOr(r.rate, 0),
        cost: unitCost > 0 ? unitCost : Math.max(0, numOr(r.cost, 0)),
        markup: r.markup === null || r.markup === undefined || r.markup === '' ? null : numOr(r.markup, 0),
        url: str(r.url),
        specs: parseSpecs(r.specs),
        supplierId: str(r.supplier_id) || null,
        isAssembly: r.is_assembly === true,
    };
};

/** The 3 new saved_items columns only (url, specs, supplier_id). */
export const priceBookPatchToRow = (patch: PriceBookLibraryPatch): Row => {
    const row: Row = {};
    if (patch.url !== undefined) row.url = nullIfEmpty(clip(patch.url, 1000));
    if (patch.specs !== undefined) row.specs = patch.specs === null ? null : parseSpecs(patch.specs);
    if (patch.supplierId !== undefined) row.supplier_id = str(patch.supplierId) || null;
    return row;
};

// =====================================================================================================================
// Old settings list <-> table rows
// =====================================================================================================================
/** An old-list supplier shown as a record (id = its old id, legacyKey = the same; nothing is written). */
export const legacyToRecord = (s: Supplier): SupplierRecord => ({
    id: s.id, name: s.name, contactName: '', email: s.email, phone: s.phone, address: s.address, website: '',
    accountNumber: s.accountNumber, paymentTerms: '', notes: s.notes, leadTimeDays: null, preferred: false, archived: false,
    legacyKey: s.id, createdAt: s.updatedAt, updatedAt: s.updatedAt,
});

/**
 * A record in the old `Supplier` shape, so supplierToVendor / planReorder / withAccountNumberNote (lib/suppliers.ts)
 * work with table rows unchanged. Over-long fields are clipped to the old limits.
 */
export const recordToLegacy = (r: SupplierRecord): Supplier =>
    normalizeSupplier({ id: r.id, name: r.name, email: r.email, phone: r.phone, address: r.address, accountNumber: r.accountNumber, notes: r.notes, updatedAt: r.updatedAt },
        () => r.id, r.updatedAt || new Date().toISOString()) as Supplier;

/** Insert input for an old-list supplier (legacyKey = its old id). */
export const legacyToInput = (s: Supplier): SupplierInput => ({
    name: s.name, email: s.email, phone: s.phone, address: s.address, accountNumber: s.accountNumber, notes: s.notes, legacyKey: s.id,
});

/**
 * Old-list suppliers that still need a row: not imported yet (legacy_key) and no row with the same name (a supplier
 * the user already re-created by hand is not duplicated). Running it again after an import returns nothing.
 */
export const planLegacyImport = (legacy: readonly Supplier[], existing: ReadonlyArray<Pick<SupplierRecord, 'name' | 'legacyKey'>>): SupplierInput[] => {
    const keys = new Set(existing.map((r) => str(r.legacyKey)).filter(Boolean));
    const names = new Set(existing.map((r) => normName(r.name)));
    const out: SupplierInput[] = [];
    for (const s of legacy) {
        if (!s?.id || !str(s.name) || keys.has(s.id) || names.has(normName(s.name))) continue;
        keys.add(s.id);
        names.add(normName(s.name));
        out.push(legacyToInput(s));
    }
    return out;
};

export interface SuppliersToShow {
    /** 'table' = public.suppliers rows; 'legacy' = the old settings list (feature not in the database yet) */
    source: 'table' | 'legacy';
    suppliers: SupplierRecord[];
}

/** Which suppliers a screen shows: table rows (not archived unless asked) when ready, else the old list. A-Z. */
export const suppliersToShow = (
    state: SuppliersFeatureState, tableRows: readonly SupplierRecord[] | null, legacy: readonly Supplier[], opts: { includeArchived?: boolean } = {},
): SuppliersToShow => {
    const byName = (a: SupplierRecord, b: SupplierRecord) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (state === 'ready' && tableRows) {
        return { source: 'table', suppliers: tableRows.filter((r) => opts.includeArchived || !r.archived).slice().sort(byName) };
    }
    return { source: 'legacy', suppliers: legacy.map(legacyToRecord).sort(byName) };
};

// =====================================================================================================================
// Matching (SKU first, then name)
// =====================================================================================================================
/** SKU compared without case, spaces, dashes, dots or slashes ("AB-12 3" = "ab123"). */
export const normSku = (v: unknown): string => str(v).toLowerCase().replace(/[\s\-_./]+/g, '');

export interface Matchable {
    sku?: string | null;
    name?: string | null;
}

/** The ONE item with this SKU, else the ONE item with this name; null when none or several. */
export const matchBySkuOrName = <T extends Matchable>(
    probe: Matchable, items: readonly T[],
): { item: T; by: 'sku' | 'name' } | null => {
    const sku = normSku(probe.sku);
    if (sku) {
        const hits = items.filter((i) => normSku(i.sku) === sku);
        if (hits.length === 1) return { item: hits[0], by: 'sku' };
        if (hits.length > 1) return null;
    }
    const name = normName(probe.name);
    if (!name) return null;
    const hits = items.filter((i) => normName(i.name) === name);
    return hits.length === 1 ? { item: hits[0], by: 'name' } : null;
};

// =====================================================================================================================
// Cheapest supplier for a price-book item
// =====================================================================================================================
export interface SupplierOffer {
    supplierItem: SupplierItemRecord;
    supplier: SupplierRecord;
    price: number;
}

export interface CheapestResult {
    best: SupplierOffer;
    /** every offer, cheapest first */
    offers: SupplierOffer[];
    /** current cost - best price (> 0 = buying from `best` saves this per unit); null when the item has no cost */
    savingPerUnit: number | null;
}

/**
 * Offers for a price-book item: supplier items linked to it (savedItemId), else matched by SKU then name; archived
 * suppliers and 0 prices left out. Cheapest first; ties: preferred supplier, then supplier name.
 */
export const supplierOffersFor = (
    item: Pick<PriceBookLibraryItem, 'id' | 'sku' | 'name'>, supplierItems: readonly SupplierItemRecord[], suppliers: readonly SupplierRecord[],
): SupplierOffer[] => {
    const byId = new Map(suppliers.map((s) => [s.id, s]));
    const linked = supplierItems.filter((si) => si.savedItemId === item.id);
    let pool = linked;
    if (!pool.length) {
        const sku = normSku(item.sku);
        pool = sku ? supplierItems.filter((si) => !si.savedItemId && normSku(si.sku) === sku) : [];
        if (!pool.length) pool = supplierItems.filter((si) => !si.savedItemId && normName(si.name) && normName(si.name) === normName(item.name));
    }
    const offers: SupplierOffer[] = [];
    for (const si of pool) {
        const s = byId.get(si.supplierId);
        if (!s || s.archived || !(si.unitPrice > 0)) continue;
        offers.push({ supplierItem: si, supplier: s, price: si.unitPrice });
    }
    return offers.sort((a, b) => a.price - b.price
        || Number(b.supplier.preferred) - Number(a.supplier.preferred)
        || a.supplier.name.localeCompare(b.supplier.name, undefined, { sensitivity: 'base' }));
};

export const cheapestSupplierFor = (
    item: Pick<PriceBookLibraryItem, 'id' | 'sku' | 'name' | 'cost'>, supplierItems: readonly SupplierItemRecord[], suppliers: readonly SupplierRecord[],
): CheapestResult | null => {
    const offers = supplierOffersFor(item, supplierItems, suppliers);
    if (!offers.length) return null;
    const cost = numOr(item.cost, 0);
    return { best: offers[0], offers, savingPerUnit: cost > 0 ? money4(cost - offers[0].price) : null };
};

// =====================================================================================================================
// Margin impact of a cost change on a price-book item (price = cost x (1 + markup %), utils/stockMath.ts)
// =====================================================================================================================
export interface MarginImpact {
    oldCost: number;
    newCost: number;
    /** the item's current selling price (unchanged unless the user picks keepMarkupPrice) */
    price: number;
    oldMarginPct: number | null;
    newMarginPct: number | null;
    oldMarkupPct: number | null;
    newMarkupPct: number | null;
    /** selling price that keeps the current markup at the new cost */
    keepMarkupPrice: number;
    /** price stays: profit per unit drops below 0 */
    sellingBelowCost: boolean;
    change: 'up' | 'down' | 'unchanged';
}

export const marginImpact = (item: Pick<PriceBookLibraryItem, 'rate' | 'cost' | 'markup'>, newCost: number): MarginImpact => {
    const oldCost = Math.max(0, numOr(item.cost, 0));
    const nc = Math.max(0, numOr(newCost, 0));
    const price = Math.max(0, numOr(item.rate, 0));
    const currentMarkup = markupFromPrice(oldCost, price) ?? (item.markup === null ? null : numOr(item.markup, 0));
    const diff = nc - oldCost;
    return {
        oldCost, newCost: nc, price,
        oldMarginPct: marginFromPrice(oldCost, price),
        newMarginPct: marginFromPrice(nc, price),
        oldMarkupPct: markupFromPrice(oldCost, price),
        newMarkupPct: markupFromPrice(nc, price),
        keepMarkupPrice: currentMarkup === null ? price : priceFromMarkup(nc, currentMarkup),
        sellingBelowCost: price > 0 && nc > price,
        change: Math.abs(diff) < 0.005 ? 'unchanged' : diff > 0 ? 'up' : 'down',
    };
};

// =====================================================================================================================
// Purchase orders: pre-fill sku / unit / price from the chosen supplier's catalogue
// =====================================================================================================================
export interface PoLineLike {
    description?: string;
    quantity?: number;
    rate?: number;
    unitCost?: number;
    unit?: string;
    sku?: string;
    item_id?: string;
    itemSource?: 'pricebook' | 'inventory';
}

export type PrefilledLine<T> = T & { sku?: string; supplierItemId?: string };

export interface PrefillResult<T> {
    lines: PrefilledLine<T>[];
    /** per line: how it matched ('pricebook' = the line's price-book item is linked to a supplier item) */
    matches: Array<'pricebook' | 'sku' | 'name' | null>;
}

/**
 * Lines of a purchase-order draft with the supplier's sku, unit and price filled in. A line matches the supplier item
 * linked to its price-book item (itemSource 'pricebook' + item_id), else by SKU, else by name. Empty fields are filled;
 * the price (rate + unitCost) is replaced only when `overwritePrices` (default: filled when 0 / empty). Lines that
 * match nothing are returned unchanged.
 */
export const prefillPoLines = <T extends PoLineLike>(
    lines: readonly T[], supplierItems: readonly SupplierItemRecord[], supplierId: string, opts: { overwritePrices?: boolean } = {},
): PrefillResult<T> => {
    const catalogue = supplierItems.filter((si) => si.supplierId === supplierId);
    const matches: PrefillResult<T>['matches'] = [];
    const out = lines.map((line) => {
        let si: SupplierItemRecord | undefined;
        let by: 'pricebook' | 'sku' | 'name' | null = null;
        if (line.itemSource === 'pricebook' && str(line.item_id)) {
            si = catalogue.find((c) => c.savedItemId === str(line.item_id));
            if (si) by = 'pricebook';
        }
        if (!si) {
            const m = matchBySkuOrName({ sku: line.sku, name: line.description }, catalogue);
            if (m) { si = m.item; by = m.by; }
        }
        matches.push(by);
        if (!si) return { ...line } as PrefilledLine<T>;
        const next: PrefilledLine<T> = { ...line, supplierItemId: si.id };
        if (!str(line.sku) && si.sku) next.sku = si.sku;
        if (!str(line.unit) && si.unit) next.unit = si.unit;
        if (!str(line.description)) next.description = si.name;
        const hasPrice = numOr(line.rate, 0) > 0;
        if (opts.overwritePrices || !hasPrice) {
            next.rate = si.unitPrice;
            next.unitCost = si.unitPrice;
        }
        return next;
    });
    return { lines: out, matches };
};

// =====================================================================================================================
// Reorder: which supplier to suggest for an inventory item (the reorder UI is unchanged; this is for the UI helper)
// =====================================================================================================================
export interface InventoryItemLike {
    id?: string;
    name?: string | null;
    sku?: string | null;
    /** the inventory item's supplier text (old behaviour) */
    supplier?: string | null;
}

export interface SupplierSuggestion {
    supplier: SupplierRecord;
    /** the supplier item to order (with its price), when known */
    supplierItem: SupplierItemRecord | null;
    price: number | null;
    /** preferred = the price-book item's supplier; cheapest = cheapest catalogue price; inventory = the item's supplier text */
    reason: 'preferred' | 'cheapest' | 'inventory';
    priceBookItem: PriceBookLibraryItem | null;
}

/**
 * Supplier to suggest for an inventory item: the preferred supplier of its price-book item (matched by SKU, then
 * name), else the cheapest supplier item for that price-book item (or for the inventory item itself), else the saved
 * supplier named in the item's supplier text. Archived suppliers are never suggested. Null = no suggestion.
 */
export const suggestSupplierForInventoryItem = (
    item: InventoryItemLike,
    ctx: { priceBook: readonly PriceBookLibraryItem[]; suppliers: readonly SupplierRecord[]; supplierItems: readonly SupplierItemRecord[] },
): SupplierSuggestion | null => {
    const active = ctx.suppliers.filter((s) => !s.archived);
    const byId = new Map(active.map((s) => [s.id, s]));
    const book = matchBySkuOrName({ sku: item.sku, name: item.name }, ctx.priceBook.filter((p) => !p.isAssembly))?.item || null;
    if (book?.supplierId) {
        const s = byId.get(book.supplierId);
        if (s) {
            const offer = supplierOffersFor(book, ctx.supplierItems, active).find((o) => o.supplier.id === s.id) || null;
            return { supplier: s, supplierItem: offer?.supplierItem || null, price: offer?.price ?? null, reason: 'preferred', priceBookItem: book };
        }
    }
    const probe = book || { id: '\u0000', sku: str(item.sku), name: str(item.name) };
    const offers = supplierOffersFor(probe, ctx.supplierItems, active);
    if (offers.length) return { supplier: offers[0].supplier, supplierItem: offers[0].supplierItem, price: offers[0].price, reason: 'cheapest', priceBookItem: book };
    const named = normName(item.supplier) ? active.find((s) => normName(s.name) === normName(item.supplier)) : undefined;
    return named ? { supplier: named, supplierItem: null, price: null, reason: 'inventory', priceBookItem: book } : null;
};
