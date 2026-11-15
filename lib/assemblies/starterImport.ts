/**
 * Starter kits → price-book assemblies (roadmap N5). Pure. A starter kit becomes an ordinary kit row (`saved_items`:
 * is_assembly, type bundle, assembly_items JSON); its materials are custom parts (they are not in the user's price book),
 * its labor row takes the user's labor rate, its expense rows are expense rows. The price is the parts' prices added up,
 * so the kit "follows its parts" in the editor until the user types a price.
 */
import { markupFromPrice, priceFromMarkup, type KitComponent } from '../../utils/stockMath.ts';
import { roundMoney, toNumber } from '../../utils/money.ts';
import { assemblyBreakdown, newExpenseRow, newLaborRow, withDerived } from './pricing.ts';
import { STARTER_KITS, starterTradeLabel, type StarterKit } from './starterKits.ts';

/** The kit's parts as saved: materials (custom parts), then labor, then expenses. */
export function starterComponents(kit: StarterKit, laborRate: number, newId: () => string = () => globalThis.crypto.randomUUID()): KitComponent[] {
  const parts: KitComponent[] = kit.materials.map((m) => ({
    item_id: newId(),
    quantity: m.quantity,
    is_custom: true,
    custom_name: m.name,
    unit: m.unit,
    custom_cost: m.cost,
    override_price: priceFromMarkup(m.cost, kit.markup.materials),
  }));
  if (kit.laborHours > 0) {
    parts.push(withDerived({ ...newLaborRow(laborRate, kit.laborHours), item_id: newId(), markup_pct: kit.markup.labor }));
  }
  for (const e of kit.expenses) {
    parts.push(withDerived({ ...newExpenseRow(e.name), item_id: newId(), quantity: e.quantity ?? 1, custom_cost: e.cost, markup_pct: kit.markup.expenses }));
  }
  return parts;
}

/** Cost, price and markup a starter kit gets with this labor rate (for the preview and the imported row). */
export function starterPreview(kit: StarterKit, laborRate: number) {
  const parts = starterComponents(kit, laborRate, () => 'x');
  const b = assemblyBreakdown(parts, new Map());
  const markup = markupFromPrice(b.cost, b.price);
  return { breakdown: b, cost: b.cost, price: b.price, profit: roundMoney(b.price - b.cost), markupPct: markup };
}

/** The `saved_items` row for a starter kit (without id / user_id: the screen adds them). */
export function starterKitRow(kit: StarterKit, opts: { laborRate: number; newId?: () => string }) {
  const parts = starterComponents(kit, opts.laborRate, opts.newId);
  const b = assemblyBreakdown(parts, new Map());
  return {
    name: kit.name,
    description: kit.summary,
    sku: null as string | null,
    category: starterTradeLabel(kit.trade),
    type: 'bundle' as const,
    unit: kit.unit,
    taxable: true,
    rate: b.price,
    unit_cost: b.cost,
    markup: Math.round((markupFromPrice(b.cost, b.price) ?? 0) * 10) / 10,
    images: [] as string[],
    is_assembly: true,
    assembly_items: parts,
  };
}

const norm = (s: unknown): string => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export interface StarterImportPlan {
  /** rows to create, in the order of `ids` */
  rows: Array<ReturnType<typeof starterKitRow>>;
  /** kits left out because the price book already has an item with that name (or the same kit was chosen twice) */
  skipped: StarterKit[];
}

/** Which of the chosen kits to create: a kit whose name is already in the price book (any case, any spacing) is skipped. */
export function planStarterImport(ids: readonly string[], existingNames: Iterable<string>, opts: { laborRate: number; newId?: () => string }): StarterImportPlan {
  const taken = new Set<string>();
  for (const n of existingNames) { const k = norm(n); if (k) taken.add(k); }
  const rows: StarterImportPlan['rows'] = [];
  const skipped: StarterKit[] = [];
  for (const id of ids) {
    const kit = STARTER_KITS.find((k) => k.id === id);
    if (!kit) continue;
    const key = norm(kit.name);
    if (taken.has(key)) { skipped.push(kit); continue; }
    taken.add(key);
    rows.push(starterKitRow(kit, opts));
  }
  return { rows, skipped };
}

/** Is a starter kit already in the price book (same name)? */
export const starterKitExists = (kit: StarterKit, existingNames: Iterable<string>): boolean => {
  const key = norm(kit.name);
  for (const n of existingNames) if (norm(n) === key) return true;
  return false;
};

/** Labor rate to use: the user's, or a sane fallback. */
export const usableLaborRate = (rate: unknown, fallback = 45): number => (toNumber(rate) > 0 ? toNumber(rate) : fallback);
