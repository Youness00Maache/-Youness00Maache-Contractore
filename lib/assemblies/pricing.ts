/**
 * Assemblies (price-book kits) with labor and expenses (roadmap N5). Pure (no network), tested by
 * scripts/assemblies-check.ts.
 *
 * Storage: NOTHING new in the database. A kit is a `saved_items` row with `is_assembly` and an `assembly_items` JSON
 * array. Labor and expense rows are two more kinds of entry in that same array (additive fields, see KitComponent in
 * utils/stockMath.ts). They are also written as ordinary custom parts (is_custom, custom_name, custom_cost and
 * override_price per unit), so everything that only knows custom parts (stock moves, the assistant's kit summary, the
 * kit-contents list on a document) keeps working. A kit without such rows is read exactly as before.
 *
 *   Materials  price-book items and custom parts, as always: cost = Σ cost × qty, price = Σ (override or item price) × qty
 *   Labor      hours × labor rate = labor cost; + burden % (payroll taxes, insurance); price = cost × (1 + markup %)
 *   Expenses   rental, dump fee, permit, subcontract: quantity × cost; price = cost × (1 + markup %)
 *   Kit price  the sum of the parts' prices until the user types a price or markup (the existing kit rule)
 *
 * On a document an assembly is still ONE line at the kit price (the existing convention); labor and expenses show in
 * "View kit contents" next to the materials. Only names, quantities and prices go onto the document: never a cost,
 * a burden or a markup (the client portal shows document lines).
 */
import { extraLineAmounts, priceBookKitTotals, type KitComponent, type PriceBookLike } from '../../utils/stockMath.ts';
import { roundMoney, toNumber } from '../../utils/money.ts';
import type { LineItem } from '../../types.ts';

export const LABOR_NAME = 'Labor';
export const EXPENSE_NAME = 'Expense';

export const isLaborRow = (c: Pick<KitComponent, 'kind'> | null | undefined): boolean => c?.kind === 'labor';
export const isExpenseRow = (c: Pick<KitComponent, 'kind'> | null | undefined): boolean => c?.kind === 'expense';
/** A labor or expense row (not a material). */
export const isExtraRow = (c: Pick<KitComponent, 'kind'> | null | undefined): boolean => isLaborRow(c) || isExpenseRow(c);

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const newId = (): string => globalThis.crypto.randomUUID();
const asList = (v: unknown): KitComponent[] => (Array.isArray(v) ? (v as KitComponent[]).filter((c) => c && typeof c === 'object') : []);

/** A new labor row. `rate` is the user's labor rate (Job financials / Settings), `hours` the time for ONE kit. */
export const newLaborRow = (rate: number, hours = 1): KitComponent =>
  withDerived({ item_id: newId(), quantity: hours, is_custom: true, kind: 'labor', custom_name: LABOR_NAME, labor_rate: Math.max(0, toNumber(rate)), burden_pct: 0, markup_pct: 0 });

/** A new expense row: a cost that is not stock (equipment rental, dump fee, permit, subcontract). */
export const newExpenseRow = (name = ''): KitComponent =>
  withDerived({ item_id: newId(), quantity: 1, is_custom: true, kind: 'expense', custom_name: name, custom_cost: 0, markup_pct: 0 });

/**
 * Writes the per-unit cost and price a labor / expense row also carries as a custom part. The labor rate, burden and
 * markup (labor) or the cost and markup (expense) are the truth; these two are derived from them. Other rows: unchanged.
 */
export function withDerived(c: KitComponent): KitComponent {
  if (c.kind !== 'labor' && c.kind !== 'expense') return c;
  const markup = Math.max(-100, toNumber(c.markup_pct));
  if (c.kind === 'labor') {
    const unitCost = Math.max(0, toNumber(c.labor_rate)) * (1 + Math.max(0, toNumber(c.burden_pct)) / 100);
    return { ...c, is_custom: true, custom_name: (c.custom_name || '').trim() ? c.custom_name : LABOR_NAME, custom_cost: round4(unitCost), override_price: round4(unitCost * (1 + markup / 100)) };
  }
  const unitCost = Math.max(0, toNumber(c.custom_cost));
  return { ...c, is_custom: true, custom_cost: unitCost, override_price: round4(unitCost * (1 + markup / 100)) };
}

/** Components as they are saved: labor / expense rows carry their derived fields, other rows are untouched. */
export const normalizeAssemblyItems = (components: unknown): KitComponent[] => asList(components).map(withDerived);

export interface AssemblyBreakdown {
  materials: { cost: number; price: number; count: number };
  labor: { hours: number; /** hours × rate, before the burden */ base: number; burden: number; cost: number; price: number; count: number };
  expenses: { cost: number; price: number; count: number };
  /** Σ of the three (the same numbers priceBookKitTotals gives) */
  cost: number;
  /** the parts' prices added up (a kit priced by hand has its own price: use the saved rate for that) */
  price: number;
}

/** Cost and price of a kit split into materials, labor and expenses. A kit without labor / expense rows: all materials. */
export function assemblyBreakdown(components: unknown, byId: Map<string, PriceBookLike>): AssemblyBreakdown {
  const list = asList(components);
  const materialsList = list.filter((c) => !isExtraRow(c));
  const laborList = list.filter(isLaborRow);
  const expenseList = list.filter(isExpenseRow);
  const m = priceBookKitTotals(materialsList, byId);
  const l = priceBookKitTotals(laborList, byId);
  const e = priceBookKitTotals(expenseList, byId);
  const counted = (l: KitComponent[]) => l.filter((c) => toNumber(c.quantity) > 0).length;
  const hours = laborList.reduce((s, c) => s + Math.max(0, toNumber(c.quantity)), 0);
  const base = roundMoney(laborList.reduce((s, c) => s + Math.max(0, toNumber(c.quantity)) * Math.max(0, toNumber(c.labor_rate)), 0));
  const total = priceBookKitTotals(list, byId);
  return {
    materials: { cost: m.cost, price: m.retail, count: counted(materialsList) },
    labor: { hours: Math.round(hours * 1000) / 1000, base, burden: roundMoney(l.cost - base), cost: l.cost, price: l.retail, count: counted(laborList) },
    expenses: { cost: e.cost, price: e.retail, count: counted(expenseList) },
    cost: total.cost,
    price: total.retail,
  };
}

/** True when the kit has a labor or an expense row (the new kind of kit). */
export const hasExtraRows = (components: unknown): boolean => asList(components).some((c) => isExtraRow(c) && toNumber(c.quantity) > 0);

/** "6 h labor · 2 expenses" for a price-book card; '' for a kit without them. */
export function extraRowsSummary(components: unknown): string {
  const list = asList(components).filter((c) => toNumber(c.quantity) > 0);
  const hours = list.filter(isLaborRow).reduce((s, c) => s + toNumber(c.quantity), 0);
  const expenses = list.filter(isExpenseRow).length;
  const bits: string[] = [];
  if (hours > 0) bits.push(`${Math.round(hours * 100) / 100} h labor`);
  if (expenses > 0) bits.push(`${expenses} expense${expenses === 1 ? '' : 's'}`);
  return bits.join(' · ');
}

type CatalogEntry = { id: string; name?: string | null; rate?: unknown };

/**
 * The rows "View kit contents" lists under a kit line on an estimate or invoice (LineItem.assemblyComponents). A kit's
 * materials come out exactly as they always did ({ item_id, name, quantity, rate }). A labor or expense row comes out as
 * ONE row for the whole amount (quantity 1, rate = its price in dollars and cents, `kind` set) with the hours or the
 * count in its name ("Labor (6 h)"), so the amount survives the cent rounding documents apply to prices. Names,
 * quantities and prices only: never a cost, a burden or a markup.
 */
export function documentComponents(components: unknown, catalog: ReadonlyArray<CatalogEntry>): NonNullable<LineItem['assemblyComponents']> {
  return asList(components).map((c) => {
    if (isExtraRow(c)) {
      const count = Math.round(toNumber(c.quantity) * 100) / 100;
      const label = isLaborRow(c)
        ? `${LABOR_NAME} (${count} h)`
        : `${(c.custom_name || '').trim() || EXPENSE_NAME}${count !== 1 ? ` (x${count})` : ''}`;
      return { item_id: c.item_id, name: label, quantity: 1, rate: extraLineAmounts(c).price, kind: c.kind as 'labor' | 'expense' };
    }
    const def = catalog.find((i) => i.id === c.item_id);
    return {
      item_id: c.item_id,
      name: c.custom_name || def?.name || 'Component',
      quantity: toNumber(c.quantity),
      rate: c.override_price !== null && c.override_price !== undefined ? toNumber(c.override_price) : toNumber(def?.rate),
    };
  });
}
