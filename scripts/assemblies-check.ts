/**
 * Assemblies (roadmap N5) checks. Pure logic, no browser, no database:
 *   npx tsx scripts/assemblies-check.ts
 *  1. OLD assemblies are untouched: the kit math and the kit's rows on a document come out exactly as the original code
 *     (a copy of the original algorithms is kept below as the reference) for thousands of random old-shape kits
 *  2. labor (hours × rate, burden, markup), expenses (quantity × cost, markup): the cent rounding, bad input
 *  3. the breakdown (materials / labor / expenses): adds up to the kit's cost and price
 *  4. expansion into document lines: still ONE line at the kit price; the rows list labor and expenses; never a cost
 *  5. starter kits: shape of every kit, no brand names, import rows, duplicates skipped, labor takes the user's rate
 *  6. job costing: a kit with labor / expense rows splits the budget by its rows; every other line is unchanged
 *  7. wiring: no database change, price-book writes stay on the registered paths, help text, screen entry
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICE_BOOK_DEFAULT_MARKUP, extraLineAmounts, kitPriceIsManual, markupFromPrice, priceBookKitTotals, trackedComponents, type KitComponent } from '../utils/stockMath.ts';
import { computeDocumentCost, computeDocumentTotals, roundMoney, toNumber } from '../utils/money.ts';
import {
    EXPENSE_NAME, LABOR_NAME, assemblyBreakdown, documentComponents, extraRowsSummary, hasExtraRows, newExpenseRow, newLaborRow, normalizeAssemblyItems, withDerived,
} from '../lib/assemblies/pricing.ts';
import { STARTER_KITS, STARTER_PRICES_NOTE, STARTER_TRADES, starterKitsOf } from '../lib/assemblies/starterKits.ts';
import { planStarterImport, starterComponents, starterKitExists, starterKitRow, starterPreview, usableLaborRate } from '../lib/assemblies/starterImport.ts';
import { assemblyBudgetShares, summarizeJobCosting, type CostingDoc } from '../lib/costing.ts';
import { normalizeLineItems } from '../components/forms/formUtils.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => { if (ok) passed++; else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`); };
const eq = (name: string, a: unknown, b: unknown) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });
const near = (name: string, a: number, b: number, tol = 0.0051) => check(name, Math.abs(a - b) <= tol, { got: a, want: b });

// a small seeded random generator, so a failure repeats
let seed = 20261116;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const money2 = () => Math.round(rnd() * 20000) / 100;
const money3 = () => Math.round(rnd() * 100000) / 1000;

// ---------------------------------------------------------------------------------------------------------------
// reference: the ORIGINAL code, copied before roadmap N5 (utils/stockMath.ts priceBookKitTotals and
// components/forms/LineItemsEditor.tsx applySaved). Old kits must keep producing exactly what these produce.
// ---------------------------------------------------------------------------------------------------------------
type Pb = { id: string; name?: string; rate?: number | string | null; unit_cost?: number | string | null; cost?: number | string | null };
const oldTotals = (components: KitComponent[] | null | undefined, byId: Map<string, Pb>) => {
    let cost = 0; let retail = 0;
    for (const c of Array.isArray(components) ? components : []) {
        const qty = toNumber(c.quantity);
        if (qty <= 0) continue;
        if (c.is_custom) { cost += toNumber(c.custom_cost) * qty; retail += toNumber(c.override_price) * qty; continue; }
        const def = byId.get(c.item_id);
        if (!def) continue;
        cost += toNumber(def.unit_cost ?? def.cost) * qty;
        const hasOverride = c.override_price !== null && c.override_price !== undefined && c.override_price !== '';
        retail += (hasOverride ? toNumber(c.override_price) : toNumber(def.rate)) * qty;
    }
    return { cost: roundMoney(cost), retail: roundMoney(retail) };
};
const oldDocRows = (assemblyItems: any[], catalog: Pb[]) => assemblyItems.map(c => {
    const def = catalog.find(i => i.id === c.item_id);
    return { item_id: c.item_id, name: c.custom_name || def?.name || 'Component', quantity: toNumber(c.quantity), rate: c.override_price !== null && c.override_price !== undefined ? toNumber(c.override_price) : toNumber(def?.rate) };
});

const book: Pb[] = [
    { id: 'a', name: 'Faucet', rate: 40, unit_cost: 25 },
    { id: 'b', name: 'Supply line', rate: 15, unit_cost: 6 },
    { id: 'c', name: 'Putty', rate: 7.5, unit_cost: 2.25 },
    { id: 'd', name: 'Cost-only item', rate: 0, cost: 3 },
];
const byId = new Map(book.map(i => [i.id, i]));

const randomOldKit = (): KitComponent[] => {
    const n = 1 + Math.floor(rnd() * 6);
    const out: KitComponent[] = [];
    for (let i = 0; i < n; i++) {
        const quantity = pick<number | string>([1, 2, 3, 0.5, 1.25, 2.375, '4', 0, -1, '']);
        if (rnd() < 0.35) out.push({ item_id: `custom-${i}`, quantity, is_custom: true, custom_name: pick(['Hauling', 'Misc', '']), custom_cost: pick<number | string | undefined>([money2(), money3(), undefined, '']), override_price: pick<number | string | null | undefined>([money2(), money3(), null, undefined, '']) });
        else out.push({ item_id: pick(['a', 'b', 'c', 'd', 'gone']), quantity, override_price: pick<number | string | null | undefined>([null, undefined, money2(), '']) });
    }
    return out;
};

// ---------------------------------------------------------------------------------------------------------------
// 1. old assemblies untouched
// ---------------------------------------------------------------------------------------------------------------
{
    const comps: KitComponent[] = [{ item_id: 'a', quantity: 2 }, { item_id: 'b', quantity: 1, override_price: 20 }, { item_id: 'c9', quantity: 1, is_custom: true, override_price: 5, custom_cost: 2 }];
    eq('old golden: cost and retail (as scripts/data-fidelity-check.ts)', priceBookKitTotals(comps, byId as any), { cost: 58, retail: 105 });
    eq('old golden: follows its parts', kitPriceIsManual({ rate: 105, assembly_items: comps }, byId as any), false);
    eq('old golden: priced by hand', kitPriceIsManual({ rate: 120, assembly_items: comps }, byId as any), true);

    let same = 0; let sameBreakdown = 0; let sameRows = 0; let sameTracked = 0; const bad: unknown[] = [];
    for (let i = 0; i < 4000; i++) {
        const kit = randomOldKit();
        const want = oldTotals(kit, byId);
        const got = priceBookKitTotals(kit, byId as any);
        if (JSON.stringify(want) === JSON.stringify(got)) same++; else bad.push({ kit, want, got });
        const b = assemblyBreakdown(kit, byId as any);
        if (b.cost === want.cost && b.price === want.retail && b.materials.cost === want.cost && b.materials.price === want.retail && b.labor.cost === 0 && b.expenses.cost === 0 && b.labor.price === 0 && b.expenses.price === 0) sameBreakdown++;
        if (JSON.stringify(documentComponents(kit, book)) === JSON.stringify(oldDocRows(kit, book))) sameRows++;
        if (!hasExtraRows(kit) && extraRowsSummary(kit) === '' && JSON.stringify(normalizeAssemblyItems(kit)) === JSON.stringify(kit)) sameTracked++;
    }
    check('old kits: totals identical to the original algorithm (4000 random kits)', same === 4000, bad.slice(0, 2));
    check('old kits: the breakdown is all materials, same cost and price', sameBreakdown === 4000, sameBreakdown);
    check('old kits: document rows identical to the original mapping (key for key)', sameRows === 4000, sameRows);
    check('old kits: no labor / expense rows, saved shape unchanged by normalizing', sameTracked === 4000, sameTracked);
    // a kit saved by the old editor survives an open and save without a single key changing
    const saved = JSON.parse(JSON.stringify([{ item_id: 'a', quantity: 2, override_price: null }, { item_id: 'x1', quantity: 1, is_custom: true, custom_name: 'Haul', override_price: 12, custom_cost: 5 }]));
    eq('old kit: normalizing changes nothing', normalizeAssemblyItems(saved), saved);
    eq('old kit: rows have the four original keys only', Object.keys(documentComponents(saved, book)[0]), ['item_id', 'name', 'quantity', 'rate']);
    eq('stock (inventory kits) still skips custom rows: tracked parts of an old kit', trackedComponents({ assembly_items: saved } as any).map(c => c.item_id), ['a']);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. labor + expenses math
// ---------------------------------------------------------------------------------------------------------------
{
    const labor = (o: Partial<KitComponent>): KitComponent => ({ item_id: 'l', quantity: 6, is_custom: true, kind: 'labor', labor_rate: 45, ...o });
    eq('labor: 6 h × $45', extraLineAmounts(labor({})), { cost: 270, price: 270 });
    eq('labor: 20% burden is cost', extraLineAmounts(labor({ burden_pct: 20 })), { cost: 324, price: 324 });
    eq('labor: 25% markup on the loaded cost', extraLineAmounts(labor({ burden_pct: 20, markup_pct: 25 })), { cost: 324, price: 405 });
    eq('labor: half an hour', extraLineAmounts(labor({ quantity: 0.5, labor_rate: 47 })), { cost: 23.5, price: 23.5 });
    // half-up to the cent (the app's rule): 3 h × $0.335 = $1.005 → $1.01
    eq('labor: half a cent rounds up', extraLineAmounts(labor({ quantity: 3, labor_rate: 0.335 })).cost, 1.01);
    near('labor: odd hours, burden and markup', extraLineAmounts(labor({ quantity: 7.5, labor_rate: 47.35, burden_pct: 8.25, markup_pct: 12.5 })).price, roundMoney(roundMoney(7.5 * 47.35 * 1.0825) * 1.125));
    eq('labor: zero hours is nothing', extraLineAmounts(labor({ quantity: 0 })), { cost: 0, price: 0 });
    eq('labor: negative hours is nothing', extraLineAmounts(labor({ quantity: -3 })), { cost: 0, price: 0 });
    eq('labor: a negative rate is treated as zero', extraLineAmounts(labor({ labor_rate: -45 })), { cost: 0, price: 0 });
    eq('labor: a negative burden is ignored', extraLineAmounts(labor({ burden_pct: -50 })), { cost: 270, price: 270 });
    eq('labor: markup can not go below -100%', extraLineAmounts(labor({ markup_pct: -500 })), { cost: 270, price: 0 });
    eq('labor: text numbers', extraLineAmounts(labor({ quantity: '6', labor_rate: '45.5' as any, burden_pct: '10' as any })), { cost: 300.3, price: 300.3 });
    const exp = (o: Partial<KitComponent>): KitComponent => ({ item_id: 'e', quantity: 1, is_custom: true, kind: 'expense', custom_name: 'Dump fee', custom_cost: 150, ...o });
    eq('expense: one dump fee', extraLineAmounts(exp({})), { cost: 150, price: 150 });
    eq('expense: 2 × $150 + 10%', extraLineAmounts(exp({ quantity: 2, markup_pct: 10 })), { cost: 300, price: 330 });
    eq('expense: no cost is no expense', extraLineAmounts(exp({ custom_cost: 0 })), { cost: 0, price: 0 });
    eq('a material row is not an extra', extraLineAmounts({ item_id: 'a', quantity: 3, is_custom: true, custom_cost: 5, override_price: 9 }), { cost: 0, price: 0 });

    // derived fields (what other readers see as an ordinary custom part)
    const d = withDerived(labor({ burden_pct: 20, markup_pct: 25 }));
    eq('labor derives its per-hour cost and price', [d.custom_cost, d.override_price, d.is_custom, d.custom_name], [54, 67.5, true, LABOR_NAME]);
    const e = withDerived(exp({ markup_pct: 10 }));
    eq('expense derives its per-unit price', [e.custom_cost, e.override_price], [150, 165]);
    eq('derive keeps a name the user typed', withDerived(labor({ custom_name: 'Crew day' })).custom_name, 'Crew day');
    check('new labor row starts at the labor rate, with no burden or markup', (() => { const r = newLaborRow(52.5, 8); return r.labor_rate === 52.5 && r.quantity === 8 && r.burden_pct === 0 && r.markup_pct === 0 && r.kind === 'labor' && r.is_custom === true; })());
    check('new expense row is a custom, cost-0, markup-0 row', (() => { const r = newExpenseRow('Permit fee'); return r.kind === 'expense' && r.custom_name === 'Permit fee' && r.custom_cost === 0 && r.markup_pct === 0 && r.quantity === 1; })());
    check('ids are unique', newLaborRow(40).item_id !== newLaborRow(40).item_id);

    // old readers (a kit total that only knows custom parts) agree with the new math, to the cent per row
    let agree = 0;
    for (let i = 0; i < 1500; i++) {
        const row = withDerived(rnd() < 0.5
            ? labor({ quantity: money2() / 10, labor_rate: money2() / 4, burden_pct: pick([0, 10, 18.5, 25]), markup_pct: pick([0, 15, 30, 50]) })
            : exp({ quantity: pick([1, 2, 3, 0.5]), custom_cost: money2(), markup_pct: pick([0, 10, 12.5]) }));
        const asCustom = priceBookKitTotals([{ ...row, kind: undefined }], new Map());
        const real = extraLineAmounts(row);
        if (Math.abs(asCustom.cost - real.cost) <= 0.015 && Math.abs(asCustom.retail - real.price) <= 0.015) agree++;
    }
    check('derived custom-part fields agree with the labor / expense math (within 1.5 cents: the row rounds its own cost first)', agree === 1500, agree);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. breakdown
// ---------------------------------------------------------------------------------------------------------------
{
    const kit: KitComponent[] = [
        { item_id: 'a', quantity: 2 },
        { item_id: 'z1', quantity: 3, is_custom: true, custom_name: 'Tile', unit: 'sq ft', custom_cost: 4, override_price: 6.5 },
        withDerived({ item_id: 'l1', quantity: 6, is_custom: true, kind: 'labor', labor_rate: 45, burden_pct: 20, markup_pct: 25 }),
        withDerived({ item_id: 'e1', quantity: 1, is_custom: true, kind: 'expense', custom_name: 'Dump fee', custom_cost: 150, markup_pct: 10 }),
        withDerived({ item_id: 'e2', quantity: 2, is_custom: true, kind: 'expense', custom_name: 'Equipment rental', custom_cost: 80 }),
    ];
    const b = assemblyBreakdown(kit, byId as any);
    eq('breakdown materials = price-book parts + custom parts', [b.materials.cost, b.materials.price, b.materials.count], [62, 99.5, 2]);
    eq('breakdown labor', [b.labor.hours, b.labor.base, b.labor.burden, b.labor.cost, b.labor.price], [6, 270, 54, 324, 405]);
    eq('breakdown expenses', [b.expenses.cost, b.expenses.price, b.expenses.count], [310, 325, 2]);
    eq('breakdown total = the kit math the editor uses', [b.cost, b.price], [priceBookKitTotals(kit, byId as any).cost, priceBookKitTotals(kit, byId as any).retail]);
    eq('breakdown total adds up', [b.cost, b.price], [roundMoney(62 + 324 + 310), roundMoney(99.5 + 405 + 325)]);
    eq('a kit with extras is not "manual" at its parts price', kitPriceIsManual({ rate: b.price, assembly_items: kit }, byId as any), false);
    eq('a kit with extras priced by hand is manual', kitPriceIsManual({ rate: b.price + 50, assembly_items: kit }, byId as any), true);
    check('hasExtraRows / summary', hasExtraRows(kit) && extraRowsSummary(kit) === '6 h labor · 2 expenses', extraRowsSummary(kit));
    eq('summary of a half-hour, one expense', extraRowsSummary([newLaborRow(45, 0.5), withDerived({ ...newExpenseRow('x'), custom_cost: 5 })]), '0.5 h labor · 1 expense');
    eq('zero-quantity rows do not count', extraRowsSummary([newLaborRow(45, 0), newExpenseRow('x')].map(c => ({ ...c, quantity: 0 }))), '');

    let adds = 0;
    for (let i = 0; i < 1500; i++) {
        const parts: KitComponent[] = [...randomOldKit()];
        if (rnd() < 0.8) parts.push(withDerived({ item_id: `l${i}`, quantity: money2() / 10, is_custom: true, kind: 'labor', labor_rate: money2() / 3, burden_pct: pick([0, 12, 22.5]), markup_pct: pick([0, 20, 40]) }));
        const ne = Math.floor(rnd() * 3);
        for (let k = 0; k < ne; k++) parts.push(withDerived({ item_id: `e${i}-${k}`, quantity: pick([1, 2, 0.5]), is_custom: true, kind: 'expense', custom_name: 'x', custom_cost: money2(), markup_pct: pick([0, 10, 25]) }));
        const bb = assemblyBreakdown(parts, byId as any);
        const t = priceBookKitTotals(parts, byId as any);
        const costSum = roundMoney(bb.materials.cost + bb.labor.cost + bb.expenses.cost);
        const priceSum = roundMoney(bb.materials.price + bb.labor.price + bb.expenses.price);
        if (bb.cost === t.cost && bb.price === t.retail && Math.abs(costSum - bb.cost) <= 0.011 && Math.abs(priceSum - bb.price) <= 0.011) adds++;
    }
    check('breakdown parts add up to the total for random kits with labor and expenses', adds === 1500, adds);
    eq('empty kit breakdown', assemblyBreakdown([], byId as any), { materials: { cost: 0, price: 0, count: 0 }, labor: { hours: 0, base: 0, burden: 0, cost: 0, price: 0, count: 0 }, expenses: { cost: 0, price: 0, count: 0 }, cost: 0, price: 0 });
    eq('breakdown of garbage does not throw', assemblyBreakdown(null, byId as any).cost, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// 4. expansion into document lines
// ---------------------------------------------------------------------------------------------------------------
{
    const kit: KitComponent[] = [
        { item_id: 'a', quantity: 2 },
        withDerived({ item_id: 'l1', quantity: 6, is_custom: true, kind: 'labor', labor_rate: 45, burden_pct: 20, markup_pct: 25 }),
        withDerived({ item_id: 'e1', quantity: 2, is_custom: true, kind: 'expense', custom_name: 'Dump fee', custom_cost: 150, markup_pct: 10 }),
        withDerived({ item_id: 'e2', quantity: 1, is_custom: true, kind: 'expense', custom_name: '  ', custom_cost: 20 }),
    ];
    const b = assemblyBreakdown(kit, byId as any);
    const rows = documentComponents(kit, book);
    eq('rows: the part as always, then labor, then expenses', rows.map(r => r.name), ['Faucet', 'Labor (6 h)', 'Dump fee (x2)', EXPENSE_NAME]);
    eq('rows: labor is one row for the whole amount', [rows[1].quantity, rows[1].rate, rows[1].kind], [1, 405, 'labor']);
    eq('rows: expense row amount', [rows[2].quantity, rows[2].rate, rows[2].kind], [1, 330, 'expense']);
    eq('rows: the part has no kind key', 'kind' in rows[0], false);
    near('rows add up to the kit price', rows.reduce((s, r) => s + r.quantity * r.rate, 0), b.price, 0.0051);
    check('rows carry no cost, markup or burden (the client portal shows document rows)', rows.every(r => Object.keys(r).every(k => ['item_id', 'name', 'quantity', 'rate', 'kind'].includes(k))), rows);
    check('serialised rows hold no internal word', !/cost|markup|burden|labor_rate|margin/i.test(JSON.stringify(rows.map(({ item_id, ...r }) => r)).replace(/"kind"/g, '')), JSON.stringify(rows));

    // the line on an estimate: ONE line at the kit price, cost = the kit's cost (labor and expenses are cost too)
    const rate = b.price;
    const line = { id: 'l', description: 'Bathroom refresh', quantity: 2, rate, unitCost: b.cost, isAssembly: true, hideComponentsOnPdf: true, assemblyComponents: rows };
    const totals = computeDocumentTotals({ lineItems: [line], taxRate: 0 } as any);
    near('estimate subtotal = kit price × quantity', totals.subtotal, roundMoney(rate * 2));
    near('document cost counts labor and expenses', computeDocumentCost({ lineItems: [line] } as any), roundMoney(b.cost * 2));
    // saving and reloading the line keeps the rows and their kind
    const reloaded = normalizeLineItems(JSON.parse(JSON.stringify([line])), false)[0] as any;
    eq('reloaded line keeps the kinds', reloaded.assemblyComponents.map((c: any) => c.kind ?? null), [null, 'labor', 'expense', 'expense']);
    eq('reloaded line keeps the amounts', reloaded.assemblyComponents.map((c: any) => c.rate), rows.map(r => r.rate));
    const oldLine = normalizeLineItems([{ id: 'o', description: 'Old kit', quantity: 1, rate: 40, isAssembly: true, assemblyComponents: oldDocRows([{ item_id: 'a', quantity: 1 }], book) }], false)[0] as any;
    eq('an old kit line reloads with its original four keys', Object.keys(oldLine.assemblyComponents[0]), ['item_id', 'name', 'quantity', 'rate']);
    // a document with an old kit totals exactly the same as before this batch
    const oldKit: KitComponent[] = [{ item_id: 'a', quantity: 2 }, { item_id: 'b', quantity: 1, override_price: 20 }];
    const oldRate = priceBookKitTotals(oldKit, byId as any).retail;
    eq('old kit line: price and cost unchanged', [oldRate, priceBookKitTotals(oldKit, byId as any).cost], [100, 56]);
}

// ---------------------------------------------------------------------------------------------------------------
// 5. starter kits
// ---------------------------------------------------------------------------------------------------------------
{
    const ids = STARTER_KITS.map(k => k.id);
    const names = STARTER_KITS.map(k => k.name.toLowerCase());
    check('starter ids are unique', new Set(ids).size === ids.length);
    check('starter names are unique', new Set(names).size === names.length);
    const tradeIds = STARTER_TRADES.map(t => t.id);
    check('every starter kit has a known trade', STARTER_KITS.every(k => tradeIds.includes(k.trade)));
    check('every trade has at least one kit', tradeIds.every(t => starterKitsOf(t).length > 0));
    eq('trades covered (owner list)', tradeIds, ['bathroom', 'kitchen', 'painting', 'electrical', 'plumbing', 'roofing', 'flooring']);
    const have = (re: RegExp) => STARTER_KITS.some(k => re.test(k.name));
    check('owner list: bathroom remodel, kitchen refresh, painting per room, outlet / switch / light, panel, fixture swap, water heater, shingle repair per square, LVP and tile per sq ft',
        [/bathroom remodel/i, /kitchen refresh/i, /painting, per room/i, /outlet or switch/i, /light fixture/i, /panel/i, /fixture swap/i, /water heater/i, /shingle repair, per square/i, /lvp.*per sq ft/i, /tile flooring, per sq ft/i].every(have));
    check('a handful, not a catalogue (10 to 20 kits)', STARTER_KITS.length >= 10 && STARTER_KITS.length <= 20, STARTER_KITS.length);

    const BRANDS = /\b(home\s?depot|lowe'?s|sherwin|benjamin moore|behr|kohler|moen|delta|american standard|romex|sheetrock|durock|hardiebacker|hardie|tyvek|kilz|rheem|bradford|a\.? ?o\.? smith|siemens|square d|eaton|leviton|lutron|ge\b|gaf|owens corning|certainteed|shaw|armstrong|mohawk|trex|dewalt|milwaukee|makita|wire-?nut|liquid nails|gorilla|dap|3m|rust-?oleum|amazon)\b/i;
    for (const k of STARTER_KITS) {
        const text = JSON.stringify(k);
        check(`${k.id}: no brand names`, !BRANDS.test(text), text.match(BRANDS)?.[0]);
        check(`${k.id}: has a name, a one-line summary and a unit`, k.name.trim().length > 3 && /[a-z]/i.test(k.summary) && !/\n/.test(k.summary) && k.summary.length <= 200 && k.unit.trim().length > 0);
        check(`${k.id}: materials have names, units, positive quantities and costs`, k.materials.length >= 2 && k.materials.every(m => m.name.trim() && m.unit.trim() && m.quantity > 0 && m.cost > 0 && Number.isFinite(m.quantity) && Number.isFinite(m.cost)));
        check(`${k.id}: material names are unique`, new Set(k.materials.map(m => m.name.toLowerCase())).size === k.materials.length);
        check(`${k.id}: labor hours are set and sane`, k.laborHours > 0 && k.laborHours <= 200);
        check(`${k.id}: expenses have names and costs`, k.expenses.every(e => e.name.trim() && e.cost > 0 && (e.quantity === undefined || e.quantity > 0)));
        check(`${k.id}: markups are in a sane range`, [k.markup.materials, k.markup.labor, k.markup.expenses].every(m => m >= 0 && m <= 150));
        check(`${k.id}: the summary does not tell the client these are placeholder prices`, !/starter|placeholder/i.test(k.summary));
        const p = starterPreview(k, 45);
        check(`${k.id}: price is above cost, and both are positive`, p.cost > 0 && p.price > p.cost, p);
        const row = starterKitRow(k, { laborRate: 45 });
        check(`${k.id}: imports as a normal kit row`, row.is_assembly === true && row.type === 'bundle' && row.name === k.name && row.description === k.summary && row.unit === k.unit && row.taxable === true && Array.isArray(row.assembly_items) && row.images.length === 0 && row.sku === null);
        eq(`${k.id}: rate and cost are the breakdown's`, [row.rate, row.unit_cost], [p.price, p.cost]);
        check(`${k.id}: priced at its parts (the editor lets it follow them)`, !kitPriceIsManual({ rate: row.rate, assembly_items: row.assembly_items }, new Map()));
        check(`${k.id}: markup matches cost and price`, Math.abs(row.markup - (markupFromPrice(row.unit_cost, row.rate) ?? 0)) <= 0.051, row.markup);
        check(`${k.id}: JSON-safe and small`, JSON.stringify(row.assembly_items).length < 6000 && JSON.parse(JSON.stringify(row.assembly_items)).length === row.assembly_items.length);
        const comps = row.assembly_items;
        check(`${k.id}: every part is custom (starter materials are not in the price book) and has a unique id`, comps.every(c => c.is_custom === true && !!c.item_id) && new Set(comps.map(c => c.item_id)).size === comps.length);
        check(`${k.id}: one labor row at the user's rate, expense rows as expenses`, comps.filter(c => c.kind === 'labor').length === 1 && comps.filter(c => c.kind === 'expense').length === k.expenses.length && comps.find(c => c.kind === 'labor')!.labor_rate === 45 && comps.find(c => c.kind === 'labor')!.quantity === k.laborHours);
        check(`${k.id}: stock tracking ignores every row (none is a stock item)`, trackedComponents({ assembly_items: comps } as any).length === 0);
    }
    eq('placeholder note says what the owner asked', STARTER_PRICES_NOTE.startsWith('Starter prices: set your own'), true);

    // labor takes the user's rate
    const k = STARTER_KITS[0];
    const at45 = starterKitRow(k, { laborRate: 45 });
    const at60 = starterKitRow(k, { laborRate: 60 });
    check('a higher labor rate raises cost and price by the labor difference', at60.unit_cost > at45.unit_cost && at60.rate > at45.rate);
    near('labor cost difference = hours × rate difference', at60.unit_cost - at45.unit_cost, roundMoney(k.laborHours * 15), 0.011);
    eq('usable labor rate falls back to $45', [usableLaborRate(0), usableLaborRate(undefined), usableLaborRate(52.5), usableLaborRate('abc')], [45, 45, 52.5, 45]);
    check('deterministic with an id factory', JSON.stringify(starterComponents(k, 45, (() => { let n = 0; return () => `id-${n++}`; })())) === JSON.stringify(starterComponents(k, 45, (() => { let n = 0; return () => `id-${n++}`; })())));

    // duplicates are skipped
    const plan = planStarterImport(['bath-remodel', 'floor-lvp', 'paint-room-full'], ['  FLOOR-LVP names do not match ', 'LVP flooring, per  SQ FT', 'something else'], { laborRate: 45 });
    eq('import skips a kit whose name is already in the price book (case and spacing ignored)', [plan.rows.map(r => r.name), plan.skipped.map(s => s.id)], [['Bathroom remodel (standard 5x8)', 'Interior painting, per room (walls and ceiling)'], ['floor-lvp']]);
    const twice = planStarterImport(['bath-remodel', 'bath-remodel'], [], { laborRate: 45 });
    eq('the same kit chosen twice is created once', [twice.rows.length, twice.skipped.length], [1, 1]);
    eq('an unknown id is ignored', planStarterImport(['nope'], [], { laborRate: 45 }).rows.length, 0);
    eq('everything already there: nothing to create', planStarterImport(ids, STARTER_KITS.map(x => x.name), { laborRate: 45 }).rows.length, 0);
    check('starterKitExists', starterKitExists(STARTER_KITS[0], [STARTER_KITS[0].name.toUpperCase()]) && !starterKitExists(STARTER_KITS[0], ['other']));
    const all = planStarterImport(ids, [], { laborRate: 45 });
    eq('importing every kit makes one row per kit, in order', all.rows.map(r => r.name), STARTER_KITS.map(x => x.name));
    check('categories are the trade names', all.rows.every((r, i) => r.category === STARTER_TRADES.find(t => t.id === STARTER_KITS[i].trade)!.label));
    // an imported kit is a normal kit: opened and saved by the editor it keeps its numbers
    const row = all.rows[0];
    const savedAgain = normalizeAssemblyItems(row.assembly_items);
    eq('an imported kit survives the editor save', savedAgain, row.assembly_items);
    eq('PRICE_BOOK_DEFAULT_MARKUP is still the original 50', PRICE_BOOK_DEFAULT_MARKUP, 50);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. job costing
// ---------------------------------------------------------------------------------------------------------------
{
    const kitComps = [{ item_id: 'k1', name: 'Tile', quantity: 3, rate: 100 }, { item_id: 'k2', name: 'Labor (8 h)', quantity: 1, rate: 600, kind: 'labor' as const }, { item_id: 'k3', name: 'Dump fee', quantity: 1, rate: 100, kind: 'expense' as const }, { item_id: 'k4', name: 'Fuel surcharge', quantity: 1, rate: 100, kind: 'expense' as const }];
    const shares = assemblyBudgetShares({ isAssembly: true, assemblyComponents: kitComps } as any);
    eq('split: labor, materials, expenses, subs & other by price', shares?.map(s => [s.kind, s.weight]).sort(), [['expenses', 100], ['labor', 600], ['materials', 300], ['other', 100]].sort());
    eq('an old kit (parts only) is not split: classified as before', assemblyBudgetShares({ isAssembly: true, assemblyComponents: [{ item_id: 'a', name: 'Faucet', quantity: 1, rate: 40 }] } as any), null);
    eq('a plain line is not split', assemblyBudgetShares({ description: 'Labor' } as any), null);
    eq('a kit with no components is not split', assemblyBudgetShares({ isAssembly: true } as any), null);
    eq('a kit whose rows have no price is not split', assemblyBudgetShares({ isAssembly: true, assemblyComponents: [{ name: 'x', quantity: 1, rate: 0, kind: 'labor' }] } as any), null);

    const C = '2026-11-01T12:00:00.000Z';
    const est = (lines: any[]): CostingDoc => ({ id: 'e', type: 'Estimate', jobId: 'j', createdAt: C, status: 'Accepted', taxRate: 0, lineItems: lines });
    const kitLine = { description: 'Bathroom refresh', quantity: 1, rate: 1000, isAssembly: true, assemblyComponents: kitComps };
    const s = summarizeJobCosting([est([kitLine])], { laborRate: 45 });
    const row = (id: string) => s.rows.find(r => r.id === id)!;
    eq('budget of a kit with labor and expenses is split by its rows', [row('labor').budget, row('materials').budget, row('expenses').budget, row('other').budget, s.unsplitBudget], [600 * 1000 / 1100, 300 * 1000 / 1100, 100 * 1000 / 1100, 100 * 1000 / 1100, 0].map(roundMoney));
    check('split budget adds up to the job budget', Math.abs(s.rows.reduce((a, r) => a + (r.budget ?? 0), 0) + s.unsplitBudget - s.budget) < 0.011, s);
    // two kits and a plain line together still add up
    const mixed = summarizeJobCosting([est([kitLine, { ...kitLine, quantity: 2 }, { description: 'Permit fee', quantity: 1, rate: 250 }])], { laborRate: 45 });
    check('mixed estimate: budget adds up', Math.abs(mixed.rows.reduce((a, r) => a + (r.budget ?? 0), 0) + mixed.unsplitBudget - mixed.budget) < 0.011, mixed);
    // an OLD kit line costs out exactly like the same line without the kit marks
    const oldKitLine = { description: 'Faucet kit', quantity: 1, rate: 300, isAssembly: true, assemblyComponents: [{ item_id: 'a', name: 'Faucet', quantity: 1, rate: 40 }] };
    const plainLine = { description: 'Faucet kit', quantity: 1, rate: 300 };
    eq('old kit line: same costing as before', summarizeJobCosting([est([oldKitLine])], { laborRate: 45 }), summarizeJobCosting([est([plainLine])], { laborRate: 45 }));
    // labor spent shows against the labor budget
    const withHours = summarizeJobCosting([est([kitLine]), { id: 't', type: 'Time Sheet', jobId: 'j', createdAt: C, date: '2026-11-02', workerName: 'M', hoursWorked: 4, overtimeHours: 0 } as CostingDoc], { laborRate: 45 });
    eq('time sheet hours land on the labor row of a kit', [withHours.rows.find(r => r.id === 'labor')!.actual, withHours.rows.find(r => r.id === 'labor')!.usedPct !== null], [180, true]);
}

// ---------------------------------------------------------------------------------------------------------------
// 7. wiring
// ---------------------------------------------------------------------------------------------------------------
{
    const view = read('components/PriceBookView.tsx');
    const details = read('components/PriceBookItemDetails.tsx');
    const editor = read('components/forms/LineItemsEditor.tsx');
    const help = read('components/help/helpContent.ts');
    const audit = read('lib/offline/writePathAudit.ts');
    check('price book: "Starter kits" entry opens the picker, import skips duplicates through the planner', /Starter kits/.test(view) && /StarterKitsModal/.test(view) && /planStarterImport/.test(view));
    check('price book: kits are not gated (the price book and kits are free; only photos are paid)', !/isPremium[^\n]*StarterKits|starter[^\n]*isPremium/i.test(view));
    check('price book: import writes through the registered price-book paths (insert(p) and the offline outbox)', /from\('saved_items'\)\.insert\(p\)/.test(view) && /outbox\.queue\('price_item', 'create'/.test(view) && audit.includes("from('saved_items').insert(p)"));
    check('price book: the labor rate comes from the account setting (App passes the profile rate)', /defaultLaborRate/.test(view) && /defaultLaborRate=\{profile\?\.defaultLaborRate\}/.test(read('App.tsx')));
    check('editor: labor and expense rows with the breakdown', /KitLaborExpenses/.test(details) && /KitBreakdown/.test(details) && /laborRate=\{laborRate\}/.test(view));
    check('documents: the kit line uses the shared expansion', /documentComponents\(s\.assembly_items, catalog\)/.test(editor));
    check('help: Assemblies text covers labor, expenses and starter kits', /Starter kits/.test(help) && /labor/i.test(help) && /expense/i.test(help) && /burden/i.test(help));
    check('help: never names the payment partner or the merchant of record', !/kelviq|merchant of record/i.test(help.split('\n').filter(l => /starter kits|burden/i.test(l)).join('\n')));
    const migrationsBefore = readdirSync(join(root, 'supabase', 'migrations')).filter(f => /assembl|starter|labor/i.test(f));
    check('no database change for assemblies (no migration for them)', migrationsBefore.length === 0, migrationsBefore);
    for (const f of ['lib/assemblies/pricing.ts', 'lib/assemblies/starterKits.ts', 'lib/assemblies/starterImport.ts']) {
        check(`${f} is pure (no network, no storage, no React)`, !/from 'react'|supabase|fetch\(|localStorage/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')));
    }
    check('no "Kelviq" or "merchant of record" in the new files', ['lib/assemblies/pricing.ts', 'lib/assemblies/starterKits.ts', 'lib/assemblies/starterImport.ts', 'components/assemblies/KitLaborExpenses.tsx', 'components/assemblies/StarterKitsModal.tsx'].every(f => existsSync(join(root, f)) && !/kelviq|merchant of record/i.test(read(f))));
}

if (failures.length) {
    console.error(`FAILED (${failures.length}) / passed ${passed}`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
}
console.log(`assemblies-check: all ${passed} checks passed`);
