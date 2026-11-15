/**
 * Plan measurement (roadmap N9): per-label totals, waste, CSV, price book matching and the estimate line. Pure.
 *
 *   itemMeasure(item, scale, system)          one item → { length, area, perimeter, count } in the account's units
 *   labelTotals(doc, system, pages?)          per label: length (lines), net area (areas minus cut-outs, never < 0),
 *                                             perimeter, count, + what was skipped on pages without a scale
 *   defaultWaste(kind) / wasteOf(label, kind) 10% for lengths and areas, 0 for counts (a label's own % wins)
 *   quantityFor(total, kind, waste, system)   { base, waste, withWaste, quantity (rounded up like Quick measure), unit }
 *   totalsCsv(rows, system)                   "Download totals (CSV)"
 *   matchPriceItems(name, items, kind?)       price book items ranked by name similarity (+ unit fit)
 *   buildEstimateLine(...)                    ONE line item (description = label, quantity incl. waste, unit, price)
 *   estimateSeed(lines, title?)               data for a new estimate (components/forms/useDocumentForm makeSeedPrefill)
 *   quickMeasureState(...)                    the quantity as a Quick measure state, so it shows under "Recent on
 *                                             this job" in any estimate of the job (lib/measure.ts rememberMeasurement)
 */
import {
    ROUND_STEP, blankMeasureState, finalQuantity, formatQty, inputNumber, newSegment, newShape, unitsOf,
    type MeasureState, type MeasureUnit, type UnitSystem,
} from '../measure.ts';
import { areaIn, areaM2, lengthIn, lengthM, polygonArea, polygonPerimeter, polylineLength, roundTo } from './geometry.ts';
import type { PageScale } from './calibration.ts';
import type { MeasureDoc, PlanItem, PlanLabel } from './schema.ts';
import type { LineItem, SavedItem } from '../../types.ts';

export type QuantityKind = 'area' | 'length' | 'count';

export interface ItemMeasure { length: number; area: number; perimeter: number; count: number }

/** One item in the account's units (ft / sq ft or m / m²). Lines and areas need a scale; counts don't. */
export function itemMeasure(item: PlanItem, scale: PageScale | null | undefined, system: UnitSystem): ItemMeasure | null {
    if (item.tool === 'count') return { length: 0, area: 0, perimeter: 0, count: item.pts.length };
    const k = scale?.mPerU;
    if (!k || !(k > 0)) return null;
    if (item.tool === 'line') return { length: lengthIn(lengthM(polylineLength(item.pts), k), system), area: 0, perimeter: 0, count: 0 };
    return {
        length: 0,
        area: areaIn(areaM2(polygonArea(item.pts), k), system),
        perimeter: lengthIn(lengthM(polygonPerimeter(item.pts), k), system),
        count: 0,
    };
}

export interface LabelTotal {
    label: PlanLabel;
    /** lines, in ft or m */
    length: number;
    /** areas minus cut-outs, in sq ft or m² (never below 0) */
    area: number;
    /** areas before cut-outs, and the cut-outs */
    areaAdded: number;
    areaRemoved: number;
    /** outline of the (added) areas, in ft or m */
    perimeter: number;
    count: number;
    items: number;
    /** lines / areas on pages without a scale (not counted) */
    unscaled: number;
}

/** Per-label totals across the pages (all pages, or only `pages`). Labels without items are listed too (zeros). */
export function labelTotals(doc: MeasureDoc, system: UnitSystem, pages?: readonly number[]): LabelTotal[] {
    const rows = new Map<string, LabelTotal>(doc.labels.map(l => [l.id, {
        label: l, length: 0, area: 0, areaAdded: 0, areaRemoved: 0, perimeter: 0, count: 0, items: 0, unscaled: 0,
    }]));
    for (const [key, page] of Object.entries(doc.pages)) {
        if (pages && !pages.includes(Number(key))) continue;
        for (const item of page.items) {
            const row = rows.get(item.label);
            if (!row) continue;
            const m = itemMeasure(item, page.scale, system);
            if (!m) { row.unscaled++; continue; }
            row.items++;
            row.length += m.length;
            row.count += m.count;
            if (item.tool === 'area') {
                if (item.subtract) row.areaRemoved += m.area;
                else { row.areaAdded += m.area; row.perimeter += m.perimeter; }
            }
        }
    }
    return [...rows.values()].map(r => ({ ...r, area: Math.max(0, r.areaAdded - r.areaRemoved) }));
}

/** What a label measures most: area, else length, else count (null = nothing yet). */
export function mainKind(t: Pick<LabelTotal, 'area' | 'areaAdded' | 'length' | 'count'>): QuantityKind | null {
    if (t.areaAdded > 0) return 'area';
    if (t.length > 0) return 'length';
    if (t.count > 0) return 'count';
    return null;
}

/** The kinds a label has (for the "what to send" choice). */
export const kindsOf = (t: Pick<LabelTotal, 'areaAdded' | 'length' | 'count'>): QuantityKind[] =>
    ([['area', t.areaAdded > 0], ['length', t.length > 0], ['count', t.count > 0]] as Array<[QuantityKind, boolean]>).filter(([, on]) => on).map(([k]) => k);

export const defaultWaste = (kind: QuantityKind): number => (kind === 'count' ? 0 : 10);
export const wasteOf = (label: Pick<PlanLabel, 'waste'>, kind: QuantityKind): number =>
    typeof label.waste === 'number' && Number.isFinite(label.waste) ? Math.min(100, Math.max(0, label.waste)) : defaultWaste(kind);

/** Unit of a kind: sq ft / lf / each, or m² / m / each. */
export const unitFor = (kind: QuantityKind, system: UnitSystem): string =>
    kind === 'count' ? 'each' : kind === 'area' ? unitsOf(system).area : unitsOf(system).length;

export const baseOf = (t: Pick<LabelTotal, 'area' | 'length' | 'count'>, kind: QuantityKind): number =>
    kind === 'area' ? t.area : kind === 'length' ? t.length : t.count;

export interface PlanQuantity { kind: QuantityKind; base: number; waste: number; withWaste: number; quantity: number; unit: string }

/** Measured amount + waste %, rounded up like Quick measure (whole sq ft / lf, 0.01 m² / m, whole counts). */
export function quantityFor(t: Pick<LabelTotal, 'area' | 'length' | 'count'>, kind: QuantityKind, wastePct: number, system: UnitSystem): PlanQuantity {
    const unit = unitFor(kind, system);
    const step = kind === 'count' ? 1 : ROUND_STEP[unit as MeasureUnit] ?? 0.01;
    const base = kind === 'count' ? Math.round(baseOf(t, kind)) : roundTo(baseOf(t, kind), 0.0001);
    const f = finalQuantity(base, wastePct, null, step);
    return { kind, base, waste: f.waste, withWaste: f.withWaste, quantity: f.quantity, unit };
}

// ------------------------------------------------------------------------------------------------- CSV
const csvCell = (v: unknown): string => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no formulas when opened in a spreadsheet
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per label and measured kind: Label, Measure, Measured, Unit, Waste %, Total with waste. */
export function totalsCsv(rows: readonly LabelTotal[], system: UnitSystem): string {
    const head = ['Label', 'Measure', 'Measured', 'Unit', 'Waste %', 'Total with waste', 'Perimeter', 'Cut-outs'];
    const lines = [head.join(',')];
    for (const r of rows) {
        for (const kind of kindsOf(r)) {
            const q = quantityFor(r, kind, wasteOf(r.label, kind), system);
            lines.push([
                r.label.name, kind === 'area' ? 'Area' : kind === 'length' ? 'Length' : 'Count',
                formatQty(q.base, 2).replace(/,/g, ''), q.unit, q.waste, formatQty(q.quantity, 2).replace(/,/g, ''),
                kind === 'area' ? `${formatQty(r.perimeter, 2).replace(/,/g, '')} ${unitsOf(system).length}` : '',
                kind === 'area' && r.areaRemoved > 0 ? formatQty(r.areaRemoved, 2).replace(/,/g, '') : '',
            ].map(csvCell).join(','));
        }
    }
    return `${lines.join('\r\n')}\r\n`;
}

// ------------------------------------------------------------------------------------------------- price book
const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'for', 'with', 'per', 'in', 'to', 'x']);
const tokens = (s: string): string[] => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(w => w && !STOP.has(w))
    .map(w => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

/** Which kind a price book unit fits ("sq ft", "sf", "m2" → area; "lf", "ft", "m" → length; "each", "ea" → count). */
export function unitKind(unit: string | null | undefined): QuantityKind | null {
    const u = String(unit || '').toLowerCase().replace(/[.\s]/g, '');
    if (!u) return null;
    if (/^(sqft|sf|ft2|ft²|squarefeet|squarefoot|m2|m²|sqm|squaremetres?|squaremeters?)$/.test(u)) return 'area';
    if (/^(lf|linft|linearfeet|linearfoot|ft|feet|foot|m|metres?|meters?|lm|linearmetres?)$/.test(u)) return 'length';
    if (/^(each|ea|pc|pcs|piece|pieces|unit|units|item|items)$/.test(u)) return 'count';
    return null;
}

/** 0..1: shared words (Dice), a whole-name contains bonus. */
export function nameSimilarity(a: string, b: string): number {
    const ta = tokens(a);
    const tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    const sb = new Set(tb);
    const shared = new Set(ta.filter(w => sb.has(w))).size;
    let score = (2 * shared) / (new Set(ta).size + sb.size);
    const ja = ta.join(' ');
    const jb = tb.join(' ');
    if (ja === jb) score = 1;
    else if (jb.includes(ja) || ja.includes(jb)) score = Math.max(score, 0.75);
    else if (!shared && ta.some(w => w.length >= 4 && tb.some(v => v.startsWith(w) || w.startsWith(v)))) score = Math.max(score, 0.4);
    return Math.min(1, score);
}

export interface PriceMatch { item: SavedItem; score: number }

/** Price book items whose name looks like the label, best first (score ≥ 0.34); a fitting unit counts a little. */
export function matchPriceItems(name: string, items: readonly SavedItem[], kind?: QuantityKind | null, max = 5): PriceMatch[] {
    const out: PriceMatch[] = [];
    for (const item of items) {
        if (!item || !item.name) continue;
        let score = nameSimilarity(name, item.name);
        if (score < 0.34) continue;
        const uk = unitKind(item.unit);
        if (kind && uk === kind) score += 0.1;
        else if (kind && uk && uk !== kind) score -= 0.15;
        out.push({ item, score: Math.round(score * 1000) / 1000 });
    }
    return out.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).slice(0, max);
}

const money = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
};

const lineId = (): string => {
    const c = globalThis.crypto as Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID();
    return `li-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export interface EstimateLinePlan {
    line: LineItem;
    /** a price book unit that does not match the measured one ("priced per sheet"): shown before adding */
    unitWarning: string | null;
}

/** ONE estimate line: description = label, quantity incl. waste, unit = the measured unit, price from the item. */
export function buildEstimateLine(labelName: string, q: PlanQuantity, item?: SavedItem | null, id: string = lineId()): EstimateLinePlan {
    const line: LineItem = {
        id,
        description: (labelName || 'Measured from plans').slice(0, 200),
        quantity: q.quantity,
        rate: item ? money(item.rate) : 0,
        unit: q.unit,
    };
    let unitWarning: string | null = null;
    if (item) {
        line.unitCost = money(item.unit_cost ?? item.cost);
        line.itemSource = 'pricebook';
        const uk = unitKind(item.unit);
        if (item.unit && uk !== q.kind) unitWarning = `${item.name} is priced per ${item.unit}; the quantity is in ${q.unit}. Check the price after adding.`;
    }
    return { line, unitWarning };
}

/** A new estimate opened with these lines (the user reviews and saves it; nothing is written here). */
export const estimateSeed = (lines: LineItem[], title = ''): Record<string, unknown> => ({
    ...(title ? { title: title.slice(0, 120) } : {}),
    lineItems: lines.map(l => ({ ...l })),
});

/**
 * The quantity as a Quick measure state (Area: one rectangle total × 1; Linear: one length), named after the label,
 * with the label's waste. Counts have no Quick measure mode → null.
 */
export function quickMeasureState(labelName: string, q: PlanQuantity, system: UnitSystem): MeasureState | null {
    if (q.kind === 'count' || !(q.base > 0)) return null;
    const s = blankMeasureState(system, q.kind === 'area' ? 'area' : 'linear');
    s.name = `${labelName} (plans)`.slice(0, 40);
    s.waste = q.waste ? inputNumber(q.waste, 1) : '';
    if (q.kind === 'area') {
        const shape = newShape('rect');
        shape.a = { major: inputNumber(q.base, 4), minor: '' };
        shape.b = { major: '1', minor: '' };
        s.area = { shapes: [shape] };
    } else {
        const seg = newSegment();
        seg.length = { major: inputNumber(q.base, 4), minor: '' };
        seg.count = '1';
        s.linear = { segments: [seg] };
    }
    return s;
}
