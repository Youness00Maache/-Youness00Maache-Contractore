/**
 * Supplier ordering for solo contractors (competitor gap #21): saved suppliers, "Send PO to supplier", low-stock
 * reorder POs grouped by supplier, and "Mark received" that adds a PO's quantities to stock ONCE.
 *
 * Pure logic (no React, no Supabase) so scripts/supplier-orders-check.ts can test it; lib/suppliersApi.ts binds it to
 * the database and components/suppliers/* is the UI.
 *
 * NO database change. Where everything lives:
 *   saved suppliers           public.user_settings 'suppliers.list'    = SuppliersSetting   (lib/userData.ts)
 *   reorder qty per item      public.user_settings 'inventory.reorder' = ReorderSetting     (+ the job reorder POs go to)
 *   low-stock threshold       inventory.low_stock_threshold  (existing column: "Low-stock alert at")
 *   preferred supplier        inventory.supplier             (existing text column: the supplier's NAME, matched to a
 *                                                             saved supplier trimmed + case-insensitive)
 *   reorder purchase orders   documents (type 'Purchase Order'); data.internalReorder = ReorderMarker
 *   received into stock       documents.data.internalStockReceipt = StockReceipt (once-only guard), plus one
 *                             inventory_history row per item (RPC adjust_inventory) whose note ends with
 *                             "[po:<document id>]": a second guard that survives a stale form overwriting `data`.
 * Keys containing "internal" are never sent to client / supplier pages (public._client_safe_doc_data strips them).
 */
import { FormType, type Job, type LineItem, type UserProfile } from '../types.ts';
import { toNumber, roundMoney } from '../utils/money.ts';
import { DOC_NUMBER_CONFIG, newId, nextDocumentNumber } from '../components/forms/formUtils.ts';
import { makeDocumentDefaults } from '../src/ai/planDocuments.ts';
import { lowStockThreshold, stockStatus } from '../utils/stockMath.ts';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const clip = (v: unknown, max: number): string => str(v).replace(/\s+/g, ' ').slice(0, max);
const clipMultiline = (v: unknown, max: number): string => str(v).replace(/\r\n?/g, '\n').slice(0, max);
/** Names compared the way the app compares names: trimmed, single spaces, case-insensitive. */
export const normName = (v: unknown): string => str(v).replace(/\s+/g, ' ').toLowerCase();
/** Stock quantities are numeric(14,3). */
const q3 = (n: number): number => Math.round(n * 1000) / 1000;
const isoOr = (v: unknown, fallback: string): string => {
    const t = Date.parse(str(v));
    return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
};

/** public.user_settings.value must stay under 20000 characters (check constraint); keep a margin. */
export const SETTING_MAX_CHARS = 19_000;

const EMAIL_RE = /^[^\s@?&,;]+@[^\s@?&,;]+\.[^\s@?&,;]{2,}$/;
export const isValidEmail = (v: unknown): boolean => EMAIL_RE.test(str(v));

/** Short random id for a saved supplier (keeps the setting small). */
export const newSupplierId = (): string => {
    const bytes = new Uint8Array(6);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return `s_${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)}`;
};

// =====================================================================================================================
// Saved suppliers: public.user_settings 'suppliers.list'
// =====================================================================================================================
export const SUPPLIERS_SETTING = 'suppliers.list';

export interface Supplier {
    /** short id ("s_…"), stable across renames */
    id: string;
    /** shown on the PO as the vendor; required, ≤ 80 */
    name: string;
    /** where "Send to supplier" emails the PO ('' = none) */
    email: string;
    phone: string;
    address: string;
    /** the contractor's account number with this supplier (printed in the PO notes) */
    accountNumber: string;
    notes: string;
    updatedAt: string;
}

/** Value stored under 'suppliers.list'. */
export interface SuppliersSetting {
    v: 1;
    suppliers: Supplier[];
    updatedAt: string;
}

export const SUPPLIER_LIMITS = { name: 80, email: 254, phone: 40, address: 200, accountNumber: 60, notes: 300 } as const;

/** Cleans one saved supplier from any source. Null = unusable (no name). */
export const normalizeSupplier = (raw: unknown, makeId: () => string = newSupplierId, now: string = new Date().toISOString()): Supplier | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const name = clip(r.name, SUPPLIER_LIMITS.name);
    if (!name) return null;
    const email = clip(r.email, SUPPLIER_LIMITS.email).toLowerCase();
    return {
        id: /^[A-Za-z0-9_-]{3,40}$/.test(str(r.id)) ? str(r.id) : makeId(),
        name,
        email: email && isValidEmail(email) ? email : '',
        phone: clip(r.phone, SUPPLIER_LIMITS.phone),
        address: clipMultiline(r.address, SUPPLIER_LIMITS.address),
        accountNumber: clip(r.accountNumber ?? r.account, SUPPLIER_LIMITS.accountNumber),
        notes: clipMultiline(r.notes, SUPPLIER_LIMITS.notes),
        updatedAt: isoOr(r.updatedAt, now),
    };
};

const byName = (a: Supplier, b: Supplier) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Saved suppliers from the stored setting (or a bare array). Duplicate ids keep the first; sorted by name. */
export const parseSuppliers = (value: unknown): Supplier[] => {
    const list = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { suppliers?: unknown }).suppliers : null;
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: Supplier[] = [];
    for (const raw of list) {
        const s = normalizeSupplier(raw);
        if (!s || seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
    }
    return out.sort(byName);
};

/** The value to store, or why it can't be stored. */
export const serializeSuppliers = (list: Supplier[], now: string = new Date().toISOString()): { value: SuppliersSetting; error?: string } => {
    const value: SuppliersSetting = { v: 1, suppliers: [...list].sort(byName), updatedAt: now };
    if (JSON.stringify(value).length > SETTING_MAX_CHARS) {
        return { value, error: 'Your supplier list is full. Remove a supplier you no longer use, or shorten some notes.' };
    }
    return { value };
};

export const findSupplierByName = (list: readonly Supplier[], name: unknown): Supplier | null => {
    const n = normName(name);
    return n ? list.find((s) => normName(s.name) === n) || null : null;
};

/**
 * Adds or updates a supplier. Same id → that one; otherwise the same name → that one (non-empty fields win, so
 * "Save as supplier" from a PO never erases an account number); otherwise a new supplier.
 */
export const upsertSupplier = (
    list: readonly Supplier[], input: Partial<Supplier>, now: string = new Date().toISOString(), makeId: () => string = newSupplierId,
): { list: Supplier[]; supplier: Supplier | null; created: boolean } => {
    const target = (input.id && list.find((s) => s.id === input.id)) || findSupplierByName(list, input.name);
    if (target) {
        const merged: Record<string, unknown> = { ...target };
        for (const k of ['name', 'email', 'phone', 'address', 'accountNumber', 'notes'] as const) {
            const v = input[k];
            if (v === undefined) continue;
            // an explicit edit (same id) may clear a field; a name match only fills / replaces with non-empty values
            if (input.id === target.id || str(v)) merged[k] = v;
        }
        const s = normalizeSupplier({ ...merged, id: target.id, updatedAt: now }, makeId, now);
        if (!s) return { list: [...list], supplier: null, created: false };
        return { list: list.map((x) => (x.id === target.id ? s : x)).sort(byName), supplier: s, created: false };
    }
    const s = normalizeSupplier({ ...input, id: undefined, updatedAt: now }, makeId, now);
    if (!s) return { list: [...list], supplier: null, created: false };
    return { list: [...list, s].sort(byName), supplier: s, created: true };
};

export const removeSupplier = (list: readonly Supplier[], id: string): Supplier[] => list.filter((s) => s.id !== id);

/** Purchase-order vendor fields of a saved supplier. */
export const supplierToVendor = (s: Supplier) => ({
    vendorName: s.name,
    vendorEmail: s.email,
    vendorPhone: s.phone,
    vendorAddress: s.address,
});

/** "Save as supplier" input from a PO's vendor fields. */
export const vendorToSupplierInput = (po: { vendorName?: unknown; vendorEmail?: unknown; vendorPhone?: unknown; vendorAddress?: unknown }): Partial<Supplier> => ({
    name: clip(po.vendorName, SUPPLIER_LIMITS.name),
    email: isValidEmail(po.vendorEmail) ? clip(po.vendorEmail, SUPPLIER_LIMITS.email).toLowerCase() : '',
    phone: clip(po.vendorPhone, SUPPLIER_LIMITS.phone),
    address: clipMultiline(po.vendorAddress, SUPPLIER_LIMITS.address),
});

/**
 * What "Save as supplier" would do for these vendor fields: 'none' (no name), 'saved' (a saved supplier already has
 * exactly these details), 'update' (same name, different details) or 'new'.
 */
export const vendorSaveState = (list: readonly Supplier[], po: Parameters<typeof vendorToSupplierInput>[0]): 'none' | 'saved' | 'update' | 'new' => {
    const input = vendorToSupplierInput(po);
    if (!input.name) return 'none';
    const s = findSupplierByName(list, input.name);
    if (!s) return 'new';
    const same = (a: unknown, b: unknown) => normName(a) === normName(b);
    // empty PO fields never count as a difference (saving would keep the supplier's value)
    const differs = (['email', 'phone', 'address'] as const).some((k) => str(input[k]) && !same(input[k], s[k]));
    return differs ? 'update' : 'saved';
};

/** Adds "Account #: …" as the first line of the PO notes (once). */
export const withAccountNumberNote = (notes: unknown, accountNumber: unknown): string => {
    const n = clipMultiline(notes, 5000);
    const acct = clip(accountNumber, SUPPLIER_LIMITS.accountNumber);
    if (!acct || n.toLowerCase().includes(acct.toLowerCase())) return n;
    return n ? `Account #: ${acct}\n${n}` : `Account #: ${acct}`;
};

// =====================================================================================================================
// Reorder settings: public.user_settings 'inventory.reorder'
// =====================================================================================================================
export const REORDER_SETTING = 'inventory.reorder';

/** Value stored under 'inventory.reorder'. Only items with a quantity the user typed are listed. */
export interface ReorderSetting {
    v: 1;
    /** inventory item id → quantity to order when it runs low */
    qty: Record<string, number>;
    /** job the last reorder POs were filed under (documents need a job) */
    jobId?: string;
    updatedAt: string;
}

export interface ParsedReorder {
    qty: Record<string, number>;
    jobId: string | null;
}

const ITEM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_REORDER_QTY = 1_000_000;

export const parseReorderSetting = (value: unknown): ParsedReorder => {
    const out: ParsedReorder = { qty: {}, jobId: null };
    if (!value || typeof value !== 'object') return out;
    const r = value as Record<string, unknown>;
    if (r.qty && typeof r.qty === 'object' && !Array.isArray(r.qty)) {
        for (const [id, raw] of Object.entries(r.qty as Record<string, unknown>)) {
            const n = toNumber(raw);
            if (ITEM_ID_RE.test(id) && n > 0 && n <= MAX_REORDER_QTY) out.qty[id.toLowerCase()] = q3(n);
        }
    }
    if (ITEM_ID_RE.test(str(r.jobId))) out.jobId = str(r.jobId).toLowerCase();
    return out;
};

/** Sets (qty > 0) or clears (null / 0) one item's reorder quantity. */
export const setReorderQty = (setting: ParsedReorder, itemId: string, qty: number | null): ParsedReorder => {
    const id = str(itemId).toLowerCase();
    const next = { ...setting, qty: { ...setting.qty } };
    const n = qty === null ? 0 : toNumber(qty);
    if (n > 0 && n <= MAX_REORDER_QTY && ITEM_ID_RE.test(id)) next.qty[id] = q3(n);
    else delete next.qty[id];
    return next;
};

/**
 * The value to store. Items that no longer exist are dropped (`knownItemIds`), so the setting stays small; when it is
 * still too big, the save is refused with a readable reason.
 */
export const serializeReorderSetting = (
    setting: ParsedReorder, opts: { knownItemIds?: Iterable<string>; now?: string } = {},
): { value: ReorderSetting; error?: string } => {
    const known = opts.knownItemIds ? new Set(Array.from(opts.knownItemIds, (id) => str(id).toLowerCase())) : null;
    const qty: Record<string, number> = {};
    for (const [id, n] of Object.entries(setting.qty)) {
        if (known && !known.has(id)) continue;
        if (n > 0) qty[id] = q3(n);
    }
    const value: ReorderSetting = { v: 1, qty, ...(setting.jobId ? { jobId: setting.jobId } : {}), updatedAt: opts.now || new Date().toISOString() };
    if (JSON.stringify(value).length > SETTING_MAX_CHARS) {
        return { value, error: 'Too many items have their own reorder quantity. Clear it on items you no longer reorder.' };
    }
    return { value };
};

// =====================================================================================================================
// Matching purchase-order lines to inventory items
// =====================================================================================================================
export interface StockItemLike {
    id: string;
    name: string;
    quantity?: number | string | null;
    low_stock_threshold?: number | string | null;
    cost_price?: number | string | null;
    supplier?: string | null;
    sku?: string | null;
    unit?: string | null;
    is_assembly?: boolean | null;
}

export interface ItemIndex<T extends StockItemLike = StockItemLike> {
    byId: Map<string, T>;
    byName: Map<string, T[]>;
}

export const buildItemIndex = <T extends StockItemLike>(items: readonly T[]): ItemIndex<T> => {
    const byId = new Map<string, T>();
    const byName = new Map<string, T[]>();
    for (const it of items) {
        if (!it?.id) continue;
        byId.set(String(it.id).toLowerCase(), it);
        const n = normName(it.name);
        if (n) byName.set(n, [...(byName.get(n) || []), it]);
    }
    return { byId, byName };
};

/** Inventory item a line is linked to (picked from Inventory in the form), else null. */
export const lineInventoryId = (line: unknown): string | null => {
    if (!line || typeof line !== 'object') return null;
    const l = line as Record<string, unknown>;
    const direct = str(l.inventoryItemId);
    if (direct) return direct.toLowerCase();
    // item_id is the inventory link unless the line came from the price book
    const legacy = str(l.item_id);
    return legacy && str(l.itemSource) !== 'pricebook' ? legacy.toLowerCase() : null;
};

export type LineMatch<T extends StockItemLike = StockItemLike> =
    | { item: T; by: 'id' | 'name' }
    | { item: null; reason: 'not-in-inventory' | 'several-items' | 'kit' };

/** Linked item first (by id), else the ONE non-kit item with exactly this name. */
export const matchLineToItem = <T extends StockItemLike>(line: unknown, index: ItemIndex<T>): LineMatch<T> => {
    const id = lineInventoryId(line);
    const linked = id ? index.byId.get(id) : undefined;
    if (linked) return linked.is_assembly ? { item: null, reason: 'kit' } : { item: linked, by: 'id' };
    const l = (line || {}) as Record<string, unknown>;
    const candidates = index.byName.get(normName(l.description ?? l.name)) || [];
    const stock = candidates.filter((c) => !c.is_assembly);
    if (stock.length === 1) return { item: stock[0], by: 'name' };
    if (stock.length > 1) return { item: null, reason: 'several-items' };
    return { item: null, reason: candidates.length ? 'kit' : 'not-in-inventory' };
};

const linesOf = (data: unknown): Record<string, unknown>[] => {
    const raw = data && typeof data === 'object' ? (data as Record<string, unknown>).lineItems : null;
    return Array.isArray(raw) ? raw.filter((l): l is Record<string, unknown> => !!l && typeof l === 'object') : [];
};

// =====================================================================================================================
// Open purchase orders ("on order")
// =====================================================================================================================
/** Statuses of a purchase order whose goods have not arrived yet (Accepted = confirmed by the supplier). */
export const OPEN_PO_STATUSES = ['draft', 'sent', 'accepted', 'approved', ''] as const;

export interface PurchaseOrderLike {
    id: string;
    status?: unknown;
    poNumber?: unknown;
    vendorName?: unknown;
    lineItems?: unknown;
    /** data.internalStockReceipt (or the whole data object's) */
    internalStockReceipt?: unknown;
    createdAt?: unknown;
}

export const isOpenPurchaseOrder = (po: PurchaseOrderLike): boolean => {
    if (!(OPEN_PO_STATUSES as readonly string[]).includes(normName(po.status))) return false;
    const receipt = parseStockReceipt({ internalStockReceipt: po.internalStockReceipt });
    return !receipt;
};

export interface OnOrder {
    qty: number;
    /** PO numbers (or "PO") holding this item */
    orders: string[];
}

/** How much of each item is already on an open purchase order (linked lines, else exact-name lines). */
export const onOrderByItem = (pos: readonly PurchaseOrderLike[], items: readonly StockItemLike[]): Map<string, OnOrder> => {
    const index = buildItemIndex(items);
    const out = new Map<string, OnOrder>();
    for (const po of pos) {
        if (!isOpenPurchaseOrder(po)) continue;
        const label = str(po.poNumber) || 'PO';
        for (const line of linesOf({ lineItems: po.lineItems })) {
            const qty = toNumber(line.quantity);
            if (!(qty > 0)) continue;
            const m = matchLineToItem(line, index);
            if (!m.item) continue;
            const key = String(m.item.id).toLowerCase();
            const prev = out.get(key) || { qty: 0, orders: [] };
            out.set(key, { qty: q3(prev.qty + qty), orders: prev.orders.includes(label) ? prev.orders : [...prev.orders, label] });
        }
    }
    return out;
};

// =====================================================================================================================
// Low stock → reorder plan
// =====================================================================================================================
/** Low, out or oversold (kits have no stock of their own and never count). */
export const isLowStock = (item: StockItemLike): boolean => !item.is_assembly && stockStatus(item) !== 'ok';

/**
 * Quantity suggested when the user set none: enough to bring stock (plus what is already on order) up to twice the
 * low-stock alert level, at least 1. Whole units.
 */
export const defaultReorderQty = (stock: number, threshold: number, onOrder = 0): number => {
    const target = threshold > 0 ? threshold * 2 : 1;
    return Math.max(1, Math.ceil(q3(target - (toNumber(stock) + toNumber(onOrder)))));
};

export interface PriceBookLike {
    name?: string | null;
    sku?: string | null;
    unit_cost?: number | string | null;
    cost?: number | string | null;
}

/** Unit cost for the PO: the item's own cost, else the price-book item with the same SKU or name, else 0 (unknown). */
export const unitCostFor = (item: StockItemLike, priceBook: readonly PriceBookLike[] = []): { cost: number; source: 'item' | 'price book' | null } => {
    const own = toNumber(item.cost_price);
    if (own > 0) return { cost: roundMoney(own), source: 'item' };
    const sku = normName(item.sku);
    const name = normName(item.name);
    const book = (sku && priceBook.find((p) => normName(p.sku) === sku)) || priceBook.find((p) => name && normName(p.name) === name);
    const cost = book ? toNumber(book.unit_cost ?? book.cost) : 0;
    return cost > 0 ? { cost: roundMoney(cost), source: 'price book' } : { cost: 0, source: null };
};

export interface ReorderLine {
    itemId: string;
    name: string;
    unit: string;
    sku: string;
    stock: number;
    threshold: number;
    onOrder: number;
    onOrderPos: string[];
    /** suggested quantity (the item's own reorder quantity, else defaultReorderQty) */
    qty: number;
    /** the user typed this item's reorder quantity */
    customQty: boolean;
    unitCost: number;
    costSource: 'item' | 'price book' | null;
    /** the item's supplier text (may not be a saved supplier) */
    supplierText: string;
    /** what is already on order brings it back above the alert level: not ticked by default */
    covered: boolean;
}

export interface ReorderGroup {
    /** saved supplier id, "name:<supplier text>" or "none" */
    key: string;
    supplier: Supplier | null;
    /** vendor name for the PO ('' = no supplier yet) */
    vendorName: string;
    lines: ReorderLine[];
}

/**
 * Low items grouped by supplier, with the suggested quantity and unit cost. Order: saved suppliers (A–Z), other
 * supplier names (A–Z), then "No supplier". Lines are sorted by name.
 */
export const planReorder = (args: {
    items: readonly StockItemLike[];
    suppliers: readonly Supplier[];
    reorderQty?: Record<string, number>;
    onOrder?: Map<string, OnOrder>;
    priceBook?: readonly PriceBookLike[];
}): ReorderGroup[] => {
    const groups = new Map<string, ReorderGroup>();
    for (const item of args.items) {
        if (!item?.id || !isLowStock(item)) continue;
        const id = String(item.id).toLowerCase();
        const stock = toNumber(item.quantity);
        const threshold = lowStockThreshold(item);
        const on = args.onOrder?.get(id);
        const onOrder = on?.qty || 0;
        const custom = toNumber(args.reorderQty?.[id]);
        const { cost, source } = unitCostFor(item, args.priceBook);
        const supplierText = clip(item.supplier, SUPPLIER_LIMITS.name);
        const line: ReorderLine = {
            itemId: String(item.id),
            name: str(item.name) || 'Item',
            unit: str(item.unit),
            sku: str(item.sku),
            stock,
            threshold,
            onOrder,
            onOrderPos: on?.orders || [],
            qty: custom > 0 ? custom : defaultReorderQty(stock, threshold, onOrder),
            customQty: custom > 0,
            unitCost: cost,
            costSource: source,
            supplierText,
            covered: onOrder > 0 && q3(stock + onOrder) > threshold,
        };
        const saved = findSupplierByName(args.suppliers, supplierText);
        const key = saved ? saved.id : supplierText ? `name:${normName(supplierText)}` : 'none';
        const group = groups.get(key) || { key, supplier: saved, vendorName: saved ? saved.name : supplierText, lines: [] };
        group.lines.push(line);
        groups.set(key, group);
    }
    const rank = (g: ReorderGroup) => (g.supplier ? 0 : g.key === 'none' ? 2 : 1);
    return Array.from(groups.values())
        .map((g) => ({ ...g, lines: g.lines.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) }))
        .sort((a, b) => rank(a) - rank(b) || a.vendorName.localeCompare(b.vendorName, undefined, { sensitivity: 'base' }));
};

/** Low-stock summary for the inventory strip. */
export const lowStockSummary = (groups: readonly ReorderGroup[]) => {
    const lines = groups.flatMap((g) => g.lines);
    return {
        low: lines.length,
        toOrder: lines.filter((l) => !l.covered).length,
        onOrder: lines.filter((l) => l.onOrder > 0).length,
    };
};

/** Marker stored on a reorder PO (data.internalReorder). */
export interface ReorderMarker {
    v: 1;
    at: string;
    items: Array<{ itemId: string; qty: number }>;
}

/** Next PO number in the form's series (PO-YYYY-MM-NNN), unique against `used`. */
export const nextPoNumber = (used: Iterable<string | null | undefined>, now: Date = new Date()): string =>
    nextDocumentNumber(DOC_NUMBER_CONFIG[FormType.PurchaseOrder]?.prefix || 'PO', used, now);

/**
 * Full `data` of a Draft reorder PO: the Purchase Order form's defaults, delivered to the company office, the
 * supplier's details, one line per item (linked to inventory, at cost) and the reorder marker.
 */
export const buildReorderPoData = (args: {
    job: Job;
    profile?: UserProfile | null;
    group: Pick<ReorderGroup, 'supplier' | 'vendorName'>;
    lines: ReadonlyArray<Pick<ReorderLine, 'itemId' | 'name' | 'qty' | 'unitCost' | 'stock'>>;
    number: string;
    today: string;
    now?: string;
    makeId?: () => string;
}): Record<string, unknown> => {
    const p = (args.profile || {}) as Partial<UserProfile>;
    const base = makeDocumentDefaults(FormType.PurchaseOrder, args.job, args.profile, args.today);
    const s = args.group.supplier;
    const vendor = s ? supplierToVendor(s) : { vendorName: clip(args.group.vendorName, SUPPLIER_LIMITS.name), vendorEmail: '', vendorPhone: '', vendorAddress: '' };
    const makeId = args.makeId || newId;
    const lineItems: LineItem[] = args.lines
        .filter((l) => toNumber(l.qty) > 0)
        .map((l) => ({
            id: makeId(),
            description: l.name,
            quantity: q3(toNumber(l.qty)),
            rate: roundMoney(toNumber(l.unitCost)),
            unitCost: roundMoney(toNumber(l.unitCost)),
            inventoryItemId: l.itemId,
            item_id: l.itemId,
            currentStock: toNumber(l.stock),
            track_inventory: true,
            itemSource: 'inventory',
        }));
    const marker: ReorderMarker = { v: 1, at: args.now || new Date().toISOString(), items: lineItems.map((l) => ({ itemId: String(l.inventoryItemId), qty: l.quantity })) };
    return {
        ...base,
        title: vendor.vendorName ? `Stock reorder – ${vendor.vendorName}` : 'Stock reorder',
        poNumber: args.number,
        status: 'Draft',
        ...vendor,
        shipToType: 'Company Office',
        shipToName: str(p.companyName) || str(p.name) || str(base.shipToName),
        shipToAddress: str(p.address),
        shipToPhone: str(p.phone),
        lineItems,
        notes: withAccountNumberNote('', s?.accountNumber),
        internalReorder: marker,
    };
};

// =====================================================================================================================
// "Mark received": the PO's quantities go into stock exactly once
// =====================================================================================================================
export const RECEIPT_KEY = 'internalStockReceipt';

export interface ReceiveMove {
    itemId: string;
    name: string;
    unit: string;
    qty: number;
}

export interface UnmatchedLine {
    description: string;
    qty: number;
    reason: 'not-in-inventory' | 'several-items' | 'kit';
}

/** Stored on the PO (data.internalStockReceipt). */
export interface StockReceipt {
    v: 1;
    /** when receiving started (the claim) */
    at: string;
    /**
     * when the latest claim was made (the first one, or a retry of a partial receipt). While a claim is fresh
     * (RECEIVE_CLAIM_FRESH_MS) another device / tab is still adding stock: a second "Mark received" waits.
     */
    claimedAt?: string;
    /** receiving = claimed, stock being added; partial = some items failed (retry adds only those); done */
    state: 'receiving' | 'partial' | 'done';
    /** what this PO adds to stock, per item (frozen at the claim) */
    items: ReceiveMove[];
    /** item ids already added */
    applied: string[];
    failed?: string[];
    unmatched?: UnmatchedLine[];
    doneAt?: string;
}

export const parseStockReceipt = (data: unknown): StockReceipt | null => {
    const raw = data && typeof data === 'object' ? (data as Record<string, unknown>)[RECEIPT_KEY] : null;
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const state = r.state === 'done' || r.state === 'partial' || r.state === 'receiving' ? r.state : null;
    if (!state) return null;
    const items: ReceiveMove[] = (Array.isArray(r.items) ? r.items : [])
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .map((m) => ({ itemId: str(m.itemId).toLowerCase(), name: str(m.name), unit: str(m.unit), qty: q3(toNumber(m.qty)) }))
        .filter((m) => m.itemId && m.qty > 0);
    const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x).toLowerCase()).filter(Boolean) : []);
    const receipt: StockReceipt = {
        v: 1, at: isoOr(r.at, ''), ...(str(r.claimedAt) ? { claimedAt: isoOr(r.claimedAt, '') } : {}), state, items, applied: ids(r.applied),
    };
    if (Array.isArray(r.failed)) receipt.failed = ids(r.failed);
    if (Array.isArray(r.unmatched)) {
        receipt.unmatched = r.unmatched
            .filter((u): u is Record<string, unknown> => !!u && typeof u === 'object')
            .map((u) => ({ description: str(u.description), qty: toNumber(u.qty), reason: (['not-in-inventory', 'several-items', 'kit'].includes(str(u.reason)) ? str(u.reason) : 'not-in-inventory') as UnmatchedLine['reason'] }));
    }
    if (str(r.doneAt)) receipt.doneAt = isoOr(r.doneAt, '');
    return receipt;
};

/** Ends the stock-history note of every item received from this PO (the history guard). */
export const receiptMarker = (documentId: string): string => `[po:${str(documentId).toLowerCase()}]`;

/** Stock-history note for one received item. */
export const receiveReason = (po: { poNumber?: unknown; vendorName?: unknown }, documentId: string): string => {
    const num = clip(po.poNumber, 60);
    const vendor = clip(po.vendorName, 80);
    return `Received ${num ? `PO ${num}` : 'purchase order'}${vendor ? ` from ${vendor}` : ''} ${receiptMarker(documentId)}`;
};

const MARKER_RE = /\s*\[po:[0-9a-f-]{36}\]/gi;
/** The note without the guard marker (for display). */
export const stripReceiptMarker = (note: unknown): string => str(note).replace(MARKER_RE, '').trim();

/** Items whose stock already went up for this PO, read from inventory_history rows (positive change + marker). */
export const appliedFromHistory = (
    rows: ReadonlyArray<{ item_id?: string | null; quantity_change?: unknown; notes?: string | null }>, documentId: string,
): string[] => {
    const marker = receiptMarker(documentId);
    const totals = new Map<string, number>();
    for (const r of rows) {
        const id = str(r.item_id).toLowerCase();
        if (!id || !str(r.notes).toLowerCase().includes(marker)) continue;
        totals.set(id, (totals.get(id) || 0) + toNumber(r.quantity_change));
    }
    return Array.from(totals.entries()).filter(([, n]) => n > 0).map(([id]) => id);
};

/**
 * A 'receiving' receipt claimed less than this long ago belongs to a "Mark received" still running on another device
 * or tab (it adds one item after the other): nothing is added a second time meanwhile. Older = abandoned (tab closed
 * mid-way): it can be finished.
 */
export const RECEIVE_CLAIM_FRESH_MS = 2 * 60 * 1000;

export interface ReceivePlan {
    /**
     * ready = there is stock to add; already = this PO was received (nothing left to add); nothing = no line matches;
     * busy = another device / tab is receiving it right now (try again in a moment)
     */
    status: 'ready' | 'already' | 'nothing' | 'busy';
    /** stock to add now */
    moves: ReceiveMove[];
    /** items of this PO already added (marker or history): never added again */
    skipped: ReceiveMove[];
    unmatched: UnmatchedLine[];
    /** the receipt already on the PO (a retry finishes it) */
    receipt: StockReceipt | null;
}

/**
 * What "Mark received" adds. A finished receipt → 'already'. A started one (partial) → only its items not added yet.
 * Otherwise the PO's lines, matched to inventory (linked id, else exact name), summed per item. Items in
 * `appliedItemIds` (from the stock history) are never added again.
 */
export const planReceive = (args: { data: unknown; items: readonly StockItemLike[]; appliedItemIds?: Iterable<string>; now?: string | number | Date }): ReceivePlan => {
    const receipt = parseStockReceipt(args.data);
    const applied = new Set<string>([...(receipt?.applied || []), ...Array.from(args.appliedItemIds || [], (id) => str(id).toLowerCase())]);
    if (receipt?.state === 'done') {
        return { status: 'already', moves: [], skipped: receipt.items, unmatched: receipt.unmatched || [], receipt };
    }
    let all: ReceiveMove[];
    let unmatched: UnmatchedLine[] = [];
    if (receipt) {
        all = receipt.items;
        unmatched = receipt.unmatched || [];
    } else {
        const index = buildItemIndex(args.items);
        const per = new Map<string, ReceiveMove>();
        for (const line of linesOf(args.data)) {
            const qty = toNumber(line.quantity);
            if (!(qty > 0)) continue;
            const m = matchLineToItem(line, index);
            const description = str(line.description ?? line.name);
            if (!m.item) {
                if (description) unmatched.push({ description, qty: q3(qty), reason: 'reason' in m ? m.reason : 'not-in-inventory' });
                continue;
            }
            const id = String(m.item.id).toLowerCase();
            const prev = per.get(id);
            per.set(id, { itemId: id, name: str(m.item.name), unit: str(m.item.unit), qty: q3((prev?.qty || 0) + qty) });
        }
        all = Array.from(per.values());
    }
    const moves = all.filter((m) => !applied.has(m.itemId));
    const skipped = all.filter((m) => applied.has(m.itemId));
    if (moves.length && receipt?.state === 'receiving') {
        // claimed moments ago: that run is still adding stock (the history doesn't show all of it yet)
        const claimed = Date.parse(receipt.claimedAt || receipt.at);
        const nowMs = args.now === undefined ? Date.now() : new Date(args.now).getTime();
        if (Number.isFinite(claimed) && Number.isFinite(nowMs) && nowMs - claimed < RECEIVE_CLAIM_FRESH_MS) {
            return { status: 'busy', moves: [], skipped, unmatched, receipt };
        }
    }
    const status = moves.length ? 'ready' : skipped.length ? 'already' : 'nothing';
    return { status, moves, skipped, unmatched, receipt };
};

/** The receipt written BEFORE any stock moves (the claim). */
export const claimReceipt = (plan: ReceivePlan, now: string): StockReceipt => plan.receipt
    ? { ...plan.receipt, state: 'receiving', claimedAt: now, applied: Array.from(new Set([...plan.receipt.applied, ...plan.skipped.map((m) => m.itemId)])) }
    : {
        v: 1, at: now, claimedAt: now, state: 'receiving',
        items: [...plan.moves, ...plan.skipped],
        applied: plan.skipped.map((m) => m.itemId),
        ...(plan.unmatched.length ? { unmatched: plan.unmatched } : {}),
    };

/** The receipt after the stock moves: done when every item is in, partial otherwise (a retry adds the rest). */
export const finishReceipt = (receipt: StockReceipt, appliedNow: readonly string[], failedNow: readonly string[], now: string): StockReceipt => {
    const applied = Array.from(new Set([...receipt.applied, ...appliedNow.map((id) => id.toLowerCase())]));
    const left = receipt.items.filter((m) => !applied.includes(m.itemId));
    const next: StockReceipt = { ...receipt, applied, state: left.length ? 'partial' : 'done' };
    if (failedNow.length) next.failed = failedNow.map((id) => id.toLowerCase()); else delete next.failed;
    if (!left.length) next.doneAt = now;
    return next;
};

/** PO data with the receipt; a finished receipt also sets the status to Received. */
export const withReceipt = <T extends Record<string, unknown>>(data: T, receipt: StockReceipt): T => ({
    ...data,
    [RECEIPT_KEY]: receipt,
    ...(receipt.state === 'done' ? { status: 'Received' } : {}),
});

/** A copy of a PO (Duplicate) starts un-received and is not a reorder record. */
export const SUPPLIER_INTERNAL_KEYS = [RECEIPT_KEY, 'internalReorder'] as const;

// =====================================================================================================================
// Purchase-order status line (form header strip)
// =====================================================================================================================
export type PoStage = 'draft' | 'sent' | 'confirmed' | 'cant-fill' | 'receiving' | 'received' | 'cancelled';

/** Where a purchase order stands, for the status strip in the form. */
export const purchaseOrderStage = (data: Record<string, unknown> | null | undefined): PoStage => {
    const d = data || {};
    const receipt = parseStockReceipt(d);
    if (receipt?.state === 'done') return 'received';
    if (receipt) return 'receiving';
    const s = normName(d.status);
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    if (s === 'received') return 'received';
    if (s === 'rejected' || s === 'declined' || str(d.clientDeclinedAt)) return 'cant-fill';
    if (s === 'accepted' || s === 'approved' || str(d.clientSignedAt)) return 'confirmed';
    if (s === 'sent') return 'sent';
    return 'draft';
};
