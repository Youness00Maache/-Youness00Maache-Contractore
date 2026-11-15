/**
 * Inventory stock status, kit math and price-book pricing math (owned by VIEWS).
 * Stock itself only ever changes in the database (RPC adjust_inventory); these helpers only read.
 */
import { roundMoney, toNumber } from './money.ts';

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export type StockStatus = 'oversold' | 'out' | 'low' | 'ok';

export interface StockLike {
  id: string;
  quantity?: number | string | null;
  low_stock_threshold?: number | string | null;
  cost_price?: number | string | null;
  is_assembly?: boolean | null;
  assembly_items?: KitComponent[] | null;
}

export interface KitComponent {
  item_id: string;
  quantity: number | string;
  is_custom?: boolean;
  custom_name?: string;
  override_price?: number | string | null;
  /** price-book kits only: internal cost of a custom component */
  custom_cost?: number | string | null;
  /**
   * Assemblies (roadmap N5), price-book kits only. Absent = a price-book item or custom part, as always.
   *  'labor'   quantity = hours; cost = hours × labor_rate × (1 + burden_pct); price = cost × (1 + markup_pct)
   *  'expense' a cost line that is not stock (rental, dump fee, permit, subcontract): cost = quantity × custom_cost
   * These rows are also written as custom parts (is_custom, custom_cost, override_price per unit) so readers that
   * only know custom parts still see them.
   */
  kind?: 'material' | 'labor' | 'expense';
  /** unit of the quantity for a custom part ("sheet", "gal", "hr") */
  unit?: string;
  labor_rate?: number | string | null;
  burden_pct?: number | string | null;
  markup_pct?: number | string | null;
}

/** Low-stock threshold with `??` semantics: an explicit 0 means "warn only when empty" (VIEW-024). */
export const lowStockThreshold = (item: Pick<StockLike, 'low_stock_threshold'>): number => {
  const raw = item.low_stock_threshold;
  if (raw === null || raw === undefined || raw === '') return DEFAULT_LOW_STOCK_THRESHOLD;
  const n = toNumber(raw);
  return n < 0 ? 0 : n;
};

export const stockStatus = (item: Pick<StockLike, 'quantity' | 'low_stock_threshold'>): StockStatus => {
  const q = toNumber(item.quantity);
  if (q < 0) return 'oversold';
  if (q === 0) return 'out';
  if (q <= lowStockThreshold(item)) return 'low';
  return 'ok';
};

export const isAttention = (s: StockStatus) => s !== 'ok';

/**
 * A kit's OWN stock: in the original app kits were normal stock items (own quantity and cost), and those rows still
 * carry them. New kits have none (they are built from components at check-out). null = no own stock (PARITY_V2 D3).
 */
export const kitOwnStock = (item: Pick<StockLike, 'is_assembly' | 'quantity'>): number | null => {
  if (!item.is_assembly) return null;
  const q = toNumber(item.quantity);
  return q !== 0 ? q : null;
};

/** Stock value (negative stock counts as 0 value). Kits count only their own pre-built stock, at the kit's cost. */
export const stockValue = (item: StockLike): number => {
  if (item.is_assembly) {
    const own = kitOwnStock(item);
    return own === null ? 0 : roundMoney(Math.max(0, own) * toNumber(item.cost_price));
  }
  return roundMoney(Math.max(0, toNumber(item.quantity)) * toNumber(item.cost_price));
};

/**
 * Update for "Edit item" on a kit. The editor hides category, supplier and unit cost for kits, so they are not sent
 * (sending the hidden empty values wiped an old kit's cost, category and supplier). A kit with its own stock shows
 * its unit cost, so that one is sent.
 */
export const kitEditPatch = <T extends Record<string, unknown>>(patch: T, kit: Pick<StockLike, 'is_assembly' | 'quantity'>): Partial<T> => {
  if (!kit.is_assembly) return patch;
  const { category: _category, supplier: _supplier, cost_price: cost, ...rest } = patch as Record<string, unknown>;
  return (kitOwnStock(kit) !== null && cost !== undefined ? { ...rest, cost_price: cost } : rest) as Partial<T>;
};

/** Components of a kit that are tracked in stock (custom rows are free-text notes). */
export const trackedComponents = (kit: Pick<StockLike, 'assembly_items'>): KitComponent[] =>
  (Array.isArray(kit.assembly_items) ? kit.assembly_items : []).filter((c) => !c?.is_custom && c?.item_id && toNumber(c.quantity) > 0);

/** How many complete kits can be built from current component stock (null when the kit has no tracked components). */
export const kitBuildable = (kit: StockLike, byId: Map<string, StockLike>): number | null => {
  const comps = trackedComponents(kit);
  if (!comps.length) return null;
  let min = Infinity;
  for (const c of comps) {
    const item = byId.get(c.item_id);
    const stock = item ? Math.max(0, toNumber(item.quantity)) : 0;
    min = Math.min(min, Math.floor(stock / toNumber(c.quantity)));
  }
  return Number.isFinite(min) ? min : 0;
};

/** Internal cost of one kit = Σ component cost × quantity. */
export const kitCost = (kit: StockLike, byId: Map<string, StockLike>): number =>
  roundMoney(trackedComponents(kit).reduce((sum, c) => sum + toNumber(byId.get(c.item_id)?.cost_price) * toNumber(c.quantity), 0));

/** Stock moves needed to check out `qty` of an item (a kit expands into its tracked components). */
export const checkoutMoves = (item: StockLike, qty: number): { itemId: string; delta: number }[] => {
  const n = Math.abs(toNumber(qty));
  if (!n) return [];
  if (!item.is_assembly) return [{ itemId: item.id, delta: -n }];
  const merged = new Map<string, number>();
  for (const c of trackedComponents(item)) merged.set(c.item_id, (merged.get(c.item_id) ?? 0) - toNumber(c.quantity) * n);
  return Array.from(merged.entries()).map(([itemId, delta]) => ({ itemId, delta }));
};

// ---------------------------------------------------------------------------------------------
// Price book pricing: price = cost × (1 + markup/100); markup = (price − cost) / cost × 100.
// Margin (shown as a helper) = (price − cost) / price × 100.
// ---------------------------------------------------------------------------------------------

export const priceFromMarkup = (cost: unknown, markupPct: unknown): number =>
  roundMoney(toNumber(cost) * (1 + toNumber(markupPct) / 100));

/** Null when cost is 0 (markup undefined). Rounded to 0.1%. */
export const markupFromPrice = (cost: unknown, price: unknown): number | null => {
  const c = toNumber(cost);
  if (c <= 0) return null;
  return Math.round(((toNumber(price) - c) / c) * 1000) / 10;
};

/** Null when price is 0. Rounded to 0.1%. */
export const marginFromPrice = (cost: unknown, price: unknown): number | null => {
  const p = toNumber(price);
  if (p <= 0) return null;
  return Math.round(((p - toNumber(cost)) / p) * 1000) / 10;
};

export interface PriceBookLike {
  id: string;
  rate?: number | string | null;
  unit_cost?: number | string | null;
  cost?: number | string | null;
}

/**
 * Cost and price of one labor or expense row of a kit (roadmap N5), each rounded to the cent. Labor: hours × labor rate,
 * plus the labor burden (payroll taxes, insurance), priced with its own markup. Expense: quantity × cost, plus markup.
 * Anything else is not an extra row: zero.
 */
export const extraLineAmounts = (c: KitComponent): { cost: number; price: number } => {
  if (c.kind !== 'labor' && c.kind !== 'expense') return { cost: 0, price: 0 };
  const qty = toNumber(c.quantity);
  if (qty <= 0) return { cost: 0, price: 0 };
  const markup = Math.max(-100, toNumber(c.markup_pct));
  const cost = c.kind === 'labor'
    ? roundMoney(qty * Math.max(0, toNumber(c.labor_rate)) * (1 + Math.max(0, toNumber(c.burden_pct)) / 100))
    : roundMoney(qty * Math.max(0, toNumber(c.custom_cost)));
  return { cost, price: roundMoney(cost * (1 + markup / 100)) };
};

/** Cost and summed retail price of a price-book kit's components (labor and expense rows included). */
export const priceBookKitTotals = (components: KitComponent[] | null | undefined, byId: Map<string, PriceBookLike>) => {
  let cost = 0;
  let retail = 0;
  for (const c of Array.isArray(components) ? components : []) {
    const qty = toNumber(c.quantity);
    if (qty <= 0) continue;
    if (c.kind === 'labor' || c.kind === 'expense') {
      const x = extraLineAmounts(c);
      cost += x.cost;
      retail += x.price;
      continue;
    }
    if (c.is_custom) {
      cost += toNumber(c.custom_cost) * qty;
      retail += toNumber(c.override_price) * qty;
      continue;
    }
    const def = byId.get(c.item_id);
    if (!def) continue;
    cost += toNumber(def.unit_cost ?? def.cost) * qty;
    const hasOverride = c.override_price !== null && c.override_price !== undefined && c.override_price !== '';
    retail += (hasOverride ? toNumber(c.override_price) : toNumber(def.rate)) * qty;
  }
  return { cost: roundMoney(cost), retail: roundMoney(retail) };
};

/** Markup a new price-book item starts with, as in the original app (a $100 cost suggests a $150 price). */
export const PRICE_BOOK_DEFAULT_MARKUP = 50;

/**
 * A price-book kit's price follows the sum of its parts' prices (original app) until the user sets it by hand. A
 * saved kit whose price differs from its parts total was priced by hand, so opening it keeps that price.
 */
export const kitPriceIsManual = (
  kit: { rate?: number | string | null; assembly_items?: KitComponent[] | null } | null | undefined,
  byId: Map<string, PriceBookLike>,
): boolean => {
  if (!kit) return false;
  return Math.abs(toNumber(kit.rate) - priceBookKitTotals(kit.assembly_items, byId).retail) >= 0.005;
};

// ---------------------------------------------------------------------------------------------
// QR label codes
// ---------------------------------------------------------------------------------------------
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Extracts an inventory item id from what a label encodes: either the app URL
 * (`https://…/inventory?item=<uuid>`, printed since VIEW-025) or a bare uuid (older labels).
 */
export const parseInventoryCode = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const raw = String(text).trim();
  const fromParam = /[?&]item=([0-9a-f-]{36})/i.exec(raw);
  if (fromParam && UUID_RE.test(fromParam[1])) return fromParam[1].toLowerCase();
  const m = UUID_RE.exec(raw);
  return m ? m[0].toLowerCase() : null;
};
