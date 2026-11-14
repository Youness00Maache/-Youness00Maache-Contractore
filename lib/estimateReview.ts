/**
 * Estimate reviewer (roadmap N1, competitor feature "AI estimate reviewer"): a second opinion before an estimate is
 * sent. It explains problems and NEVER changes the estimate by itself: the form shows each finding with "Add line"
 * (AI suggestions only) or "Ignore".
 *
 *  1. reviewEstimate: deterministic checks, every plan, no AI cost, instant (pure; scripts/estimate-review-check.ts):
 *       math        a stored line / document total that is not qty × price, prices with more than 2 decimals, a
 *                   discount larger than the subtotal, a tax rate that looks mistyped (82% or 0.08%)
 *       quantities  0, negative (not a credit), unusually high for the unit (> 10 × typical), decimals on "each"
 *       prices      lines without a price, priced below your cost, > ±25% from the matching price-book item
 *       mix         materials but no labor line (and the reverse)
 *       margin      below your usual margin (price-book items with a cost, or their markup) or below 10%
 *       tax         no tax when your recent estimates and invoices charge tax (usualTaxRateOf)
 *       options     every good / better / best option checked on its own (its lines + the shared lines), and two
 *                   options with the same lines
 *  2. The AI part (Premium + AI, task "estimate_review", supabase/functions/ai-assistant/shared/estimateReview.ts):
 *     buildAiReviewBody / parseAiReviewResponse; missing items, missing expenses and risky assumptions, each with an
 *     optional suggested line priced only from the price book (suggestionToLine = the same line as picking the item).
 */
import type { LineItem } from '../types.ts';
import { computeDocumentCost, computeDocumentTotals, formatMoney, roundMoney, toNumber } from '../utils/money.ts';
import { newId } from '../components/forms/formUtils.ts';
import { optionName, readOptionSet, type OptionSet } from './estimateOptions.ts';
import { foldText } from '../supabase/functions/ai-assistant/shared/priceBook.ts';
import {
    REVIEW_AI_KINDS, REVIEW_SEVERITIES, type ReviewAiKind, type ReviewSeverity,
} from '../supabase/functions/ai-assistant/shared/estimateReview.ts';
import { buildPriceBookSlice, linkDraftToPriceBook, type PriceBookSource } from '../src/ai/priceBookContext.ts';

export type { ReviewSeverity, ReviewAiKind };

export type ReviewRule =
    | 'empty' | 'math' | 'decimals' | 'discount' | 'tax_rate' | 'zero_qty' | 'negative' | 'qty_unusual' | 'qty_decimal'
    | 'no_price' | 'below_cost' | 'margin_low' | 'no_labor' | 'no_materials' | 'price_book' | 'tax_missing' | 'options_same'
    | 'ai';

/** A line the AI suggests (added only when the contractor clicks "Add line"). */
export interface SuggestedLine {
    description: string;
    quantity: number | null;
    unit?: string;
    /** price-book price, or null: the line goes in without a price */
    rate: number | null;
    priceBookItemId?: string;
    needsPrice: boolean;
}

export interface ReviewFinding {
    /** stable across edits (rule + option + line), so Ignore survives re-checks */
    id: string;
    rule: ReviewRule;
    severity: ReviewSeverity;
    message: string;
    source: 'check' | 'ai';
    /** good / better / best: the option it is about ('shared' = a line in every option) */
    optionId?: string;
    optionName?: string;
    lineId?: string;
    /** AI findings */
    kind?: ReviewAiKind;
    suggested?: SuggestedLine;
}

/** A price-book item as the app loads it (types.ts SavedItem). */
export interface ReviewPriceItem {
    id: string;
    name: string;
    description?: string | null;
    rate?: number | string | null;
    unit?: string | null;
    unit_cost?: number | string | null;
    cost?: number | string | null;
    markup?: number | string | null;
    sku?: string | null;
    type?: string | null;
}

/** What the user usually does (null / undefined = unknown: that check is skipped or uses its default). */
export interface ReviewHistory {
    /** tax rate (%) of most recent estimates / invoices (usualTaxRateOf) */
    usualTaxRate?: number | null;
    /** margin (%) the user usually prices at; default: from the price book (usualMarginOf) */
    usualMargin?: number | null;
}

export const REVIEW_LIMITS = {
    /** a price this far from the price-book item's (either way) is flagged */
    priceBookGap: 0.25,
    /** margin below this is flagged when the usual margin is unknown */
    minMargin: 10,
    /** flagged when the margin is this many points below the usual one */
    marginSlack: 5,
    /** "unusual" = more than this times the typical quantity of the unit */
    qtyFactor: 10,
    /** tax rates above this look mistyped */
    maxTaxRate: 25,
} as const;

export const SEVERITY_RANK: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };

type Rec = Record<string, any>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
const pct = (n: number): string => `${Math.round(n * 10) / 10}%`;
/** tax rates keep their decimals (8.25%, 8.875%) */
const taxPct = (n: number): string => `${Math.round(n * 1000) / 1000}%`;
const short = (s: string, max = 40): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const fmtQty = (n: number): string => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 1000) / 1000));

/** A line the client would see (a description or a price). */
export const isMeaningfulLine = (li: Partial<LineItem> | null | undefined): boolean =>
    Boolean(li) && (Boolean(str(li!.description)) || toNumber(li!.rate) !== 0);

// ─────────────────────────────────────────── units ───────────────────────────────────────────

export type UnitFamily =
    | 'each' | 'hour' | 'day' | 'week' | 'sqft' | 'sqyd' | 'sqm' | 'lf' | 'm' | 'cuyd' | 'lump' | 'square' | 'gallon' | 'box'
    | 'bag' | 'sheet' | 'ton' | 'other' | 'none';

const UNIT_FAMILIES: Array<[RegExp, UnitFamily]> = [
    [/^(?:ea|each|pc|pcs|piece|pieces|unit|units|item|items|ct|count|no|nos|x)$/, 'each'],
    [/^(?:h|hr|hrs|hour|hours|man ?hours?|mh|labor hours?)$/, 'hour'],
    [/^(?:d|day|days|man ?days?|crew ?days?)$/, 'day'],
    [/^(?:wk|wks|week|weeks)$/, 'week'],
    [/^(?:sq ?ft|sqft|sf|ft2|ft²|square (?:feet|foot))$/, 'sqft'],
    [/^(?:sq ?yd|sy|yd2|yd²|square yards?)$/, 'sqyd'],
    [/^(?:m2|m²|sqm|sq ?m|square met(?:er|re)s?)$/, 'sqm'],
    [/^(?:lf|lin ?ft|linear (?:feet|foot)|ft|feet|foot)$/, 'lf'],
    [/^(?:m|lm|met(?:er|re)s?|linear met(?:er|re)s?)$/, 'm'],
    [/^(?:cy|cu ?yd|yd3|yd³|cubic yards?)$/, 'cuyd'],
    [/^(?:ls|lump ?sum|lot|job|flat|flat rate|allowance)$/, 'lump'],
    [/^(?:sq|squares?)$/, 'square'],
    [/^(?:gal|gals|gallon|gallons)$/, 'gallon'],
    [/^(?:box|boxes|bx|carton|cartons|case|cases|cs)$/, 'box'],
    [/^(?:bag|bags)$/, 'bag'],
    [/^(?:sheet|sheets|sht)$/, 'sheet'],
    [/^(?:ton|tons|tonne|tonnes|t)$/, 'ton'],
];

export const unitFamily = (unit: unknown): UnitFamily => {
    const u = foldText(str(unit)).replace(/\.$/, '').replace(/\s+/g, ' ');
    if (!u) return 'none';
    for (const [re, family] of UNIT_FAMILIES) if (re.test(u)) return family;
    return 'other';
};

/** A typical quantity of one estimate line in each unit (a line above 10 × this is worth a second look). */
export const TYPICAL_QTY: Record<UnitFamily, number> = {
    each: 25, hour: 60, day: 15, week: 6, sqft: 1500, sqyd: 150, sqm: 150, lf: 400, m: 150, cuyd: 30, lump: 1, square: 40,
    gallon: 25, box: 40, bag: 40, sheet: 60, ton: 20, other: 100, none: 25,
};

const median = (list: number[]): number => {
    const s = [...list].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// ─────────────────────────────────────────── price book ───────────────────────────────────────────

/**
 * The price-book item a line is (like the assistant's findPriceBookItem): the item's name, "name - description" as the
 * line editor writes it, or the item's SKU as a whole word of the description.
 */
export function matchPriceBookItem(line: Partial<LineItem>, book: readonly ReviewPriceItem[] | null | undefined): ReviewPriceItem | null {
    const d = foldText(str(line.description));
    if (!d || !book?.length) return null;
    for (const item of book) {
        const n = foldText(item.name || '');
        if (n && (d === n || d.startsWith(`${n} - `))) return item;
    }
    const words = new Set(d.split(/[^\p{L}\p{N}-]+/u).filter(Boolean));
    for (const item of book) {
        const sku = foldText(str(item.sku));
        if (sku.length >= 3 && words.has(sku)) return item;
    }
    return null;
}

/**
 * The margin (%) the user usually prices at, from the price book: the median margin of items with a price and a cost
 * (3 or more), else the median of their markups (3 or more, as a margin). Null when the price book doesn't say.
 */
export function usualMarginOf(book: readonly ReviewPriceItem[] | null | undefined): number | null {
    const margins: number[] = [];
    const markups: number[] = [];
    for (const item of book || []) {
        const rate = toNumber(item.rate);
        const cost = toNumber(item.unit_cost ?? item.cost);
        if (rate > 0 && cost > 0) margins.push(((rate - cost) / rate) * 100);
        const markup = toNumber(item.markup);
        if (markup > 0 && markup < 1000) markups.push(markup);
    }
    if (margins.length >= 3) return Math.round(median(margins) * 10) / 10;
    if (markups.length >= 3) { const m = median(markups); return Math.round((m / (100 + m)) * 1000) / 10; }
    return null;
}

/**
 * The tax rate the user normally charges, from the tax rates of their most recent estimates and invoices (newest
 * first): needs 3 or more documents, at least 60% of them with tax; the most common rate (the newest on a tie).
 */
export function usualTaxRateOf(rates: readonly unknown[]): number | null {
    const list = rates.map(r => (r === null || r === undefined || r === '' ? NaN : toNumber(r))).filter(n => Number.isFinite(n) && n >= 0);
    if (list.length < 3) return null;
    const positive = list.filter(n => n > 0 && n <= 100).map(n => Math.round(n * 1000) / 1000);
    if (positive.length / list.length < 0.6) return null;
    const counts = new Map<number, number>();
    for (const r of positive) counts.set(r, (counts.get(r) || 0) + 1);
    let best = positive[0];
    for (const r of positive) if ((counts.get(r) || 0) > (counts.get(best) || 0)) best = r;
    return best;
}

// ─────────────────────────────────────────── labor / materials ───────────────────────────────────────────

/** 'expense' = a fee or cost of doing the job (permit, disposal, delivery, rental…); 'other' = a lump sum or unclear. */
export type LineKind = 'labor' | 'material' | 'both' | 'expense' | 'other';

const BOTH_RE = /\b(?:supply (?:and|&) install|furnish (?:and|&) install|install(?:ed)? (?:and|&) suppl|labou?r (?:and|&) materials?|materials? (?:and|&) labou?r|parts (?:and|&) labou?r|labou?r (?:and|&) parts|turn ?key|complete (?:install|job|package))\b/;
const LABOR_RE = /\b(?:labou?r|install(?:ation|ing|ed)?|remov(?:e|al|ing)|demo(?:lition)?|tear ?out|hang(?:ing)?|taping|mudding|finishing|painting|paint (?:walls?|ceilings?|trim|rooms?|exterior|interior|house|cabinets?)|prep(?:aration|ping)?|set ?up|service(?: call)?|repairs?|repairing|haul(?:ing)?(?: away)?|clean ?up|cleaning|crew|man ?hours?|carpentry|framing|tiling|grouting|sanding|staining|mowing|trimming|inspection|diagnos\w*|trip charge|mobili[sz]ation|work(?:manship)?|helper|electrician|plumber|technician|tech time)\b/;
const MATERIAL_RE = /\b(?:materials?|supplies|sheets?|boards?|lumber|plywood|osb|drywall|sheetrock|tiles?|grout|adhesive|thinset|thin-set|mortar|cement|concrete|gravel|sand|mulch|sod|paint|primer|stain|sealer|sealant|caulk|screws?|nails?|fasteners?|anchors?|pipes?|fittings?|valves?|wire|wiring|cable|breakers?|outlets?|receptacles?|switch(?:es)?|fixtures?|faucets?|toilets?|vanit(?:y|ies)|cabinets?|counter ?tops?|shingles?|underlayment|membrane|insulation|flashing|gutters?|trim|moldings?|mouldings?|baseboards?|doors?|windows?|flooring|laminate|vinyl|carpet|hardware|studs?|joists?|beams?|posts?|pavers?|blocks?|bricks?|rebar|mesh|filters?|parts|lights?|lamps?|fans?|heater|appliances?|decking)\b/;
const EXPENSE_RE = /\b(?:permits?|fees?|disposal|dump|dumpster|delivery|freight|shipping|travel|mileage|rentals?|rent|tax|deposit|contingency|insurance|bond|surcharge)\b/;
const LABOR_UNITS: ReadonlySet<UnitFamily> = new Set(['hour', 'day', 'week']);
const MATERIAL_UNITS: ReadonlySet<UnitFamily> = new Set(['gallon', 'box', 'bag', 'sheet', 'ton', 'cuyd']);

/** Labor, material, both (supply & install) or other (a lump sum, a fee, a permit…). */
export function lineKind(line: Partial<LineItem>, book?: readonly ReviewPriceItem[] | null): LineKind {
    const text = foldText(str(line.description));
    if (BOTH_RE.test(text)) return 'both';
    const item = matchPriceBookItem(line, book);
    const type = foldText(str(item?.type));
    if (type === 'labor' || type === 'service') return 'labor';
    if (type === 'material') return 'material';
    if (type === 'bundle' || line.isAssembly) return 'both';
    if (line.itemSource === 'inventory' || line.inventoryItemId || line.item_id) return 'material';
    const family = unitFamily(line.unit);
    const labor = LABOR_RE.test(text) || LABOR_UNITS.has(family);
    const material = MATERIAL_RE.test(text) || MATERIAL_UNITS.has(family);
    if (labor && material) return LABOR_UNITS.has(family) ? 'labor' : MATERIAL_UNITS.has(family) ? 'material' : 'both';
    if (labor || material) return labor ? 'labor' : 'material';
    return EXPENSE_RE.test(text) ? 'expense' : 'other';
}

const MATERIALS_EXCLUDED_RE = /(?:materials?|supplies|parts) (?:are |is )?(?:not included|excluded|by (?:the )?(?:client|owner|customer|homeowner|others)|(?:supplied|provided|furnished) by (?:the )?(?:client|owner|customer|homeowner|others))|(?:client|owner|customer|homeowner)[- ](?:supplied|provided|furnished)|labou?r only/;
const LABOR_EXCLUDED_RE = /labou?r (?:is )?(?:not included|excluded|by (?:the )?(?:client|owner|customer|homeowner|others))|materials? only|supply only|(?:client|owner|customer|homeowner) (?:will )?install/;

// ─────────────────────────────────────────── the checks ───────────────────────────────────────────

/** Lines that are a heading / note ("DEMOLITION:", "Bathroom") or say they cost nothing: never "no price". */
const NO_CHARGE_RE = /\b(?:included|incl\.?|no charge|n\/c|free|complimentary|at no cost|by (?:the )?(?:client|owner|others)|tbd|to be determined)\b/;
const isHeading = (desc: string): boolean => /:\s*$/.test(desc) || (desc.length <= 40 && /[A-Z]/.test(desc) && desc === desc.toUpperCase() && !/\d/.test(desc));
const CREDIT_RE = /\b(?:credit|discount|refund|deduct\w*|rebate|deposit|less|minus|adjustment|allowance|trade[- ]?in|returned)\b/;

interface LineRef { line: LineItem; label: string; optionId?: string; optionName?: string }
interface Group { optionId?: string; optionName?: string; lines: LineItem[] }

const SHARED_ID = 'shared';
const SHARED_NAME = 'In every option';

/** Private fields of option lines when the document comes as saved (the form keeps them on the lines). */
const internalOf = (d: Rec): Record<string, Rec> => {
    let raw: unknown = d.estimateOptionsInternal;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
    const out: Record<string, Rec> = {};
    for (const [k, v] of Object.entries(rec(raw))) if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = v as Rec;
    return out;
};
const withPrivate = (lines: LineItem[], internal: Record<string, Rec>): LineItem[] =>
    lines.map(li => (internal[str(li.id)] ? ({ ...internal[str(li.id)], ...li } as LineItem) : li));

/** Every line as the checks see it, and the groups the totals are checked on (one, or one per option). */
function linesAndGroups(d: Rec, set: OptionSet | null): { refs: LineRef[]; groups: Group[] } {
    const label = (li: LineItem, n: number) => (str(li.description) ? `“${short(str(li.description))}”` : `Line ${n}`);
    if (set && !set.appliedId) {
        const internal = internalOf(d);
        const shared = withPrivate(set.sharedLineItems.filter(isMeaningfulLine), internal);
        const refs: LineRef[] = [];
        const groups: Group[] = set.options.map((o, i) => {
            const own = withPrivate(o.lineItems.filter(isMeaningfulLine), internal);
            const name = optionName(o, i);
            own.forEach((li, n) => refs.push({ line: li, label: label(li, n + 1), optionId: o.id, optionName: name }));
            return { optionId: o.id, optionName: name, lines: [...own, ...shared] };
        });
        shared.forEach((li, n) => refs.push({ line: li, label: label(li, n + 1), optionId: SHARED_ID, optionName: SHARED_NAME }));
        return { refs, groups };
    }
    const lines = (Array.isArray(d.lineItems) ? d.lineItems : []).filter((li: unknown) => li && typeof li === 'object' && isMeaningfulLine(li as LineItem)) as LineItem[];
    return { refs: lines.map((li, n) => ({ line: li, label: label(li, n + 1) })), groups: [{ lines }] };
}

const lineSignature = (lines: LineItem[]): string => lines
    .map(li => [foldText(str(li.description)), toNumber(li.quantity), toNumber(li.rate), foldText(str(li.unit))].join('|'))
    .sort().join('\n');

export interface ReviewOptions {
    priceBook?: readonly ReviewPriceItem[] | null;
    history?: ReviewHistory | null;
}

/** The deterministic checks (see the file header). Highest severity first; [] for a clean estimate. */
export function reviewEstimate(data: unknown, opts: ReviewOptions = {}): ReviewFinding[] {
    const d = rec(data);
    const book = opts.priceBook || [];
    const set = readOptionSet(d);
    const { refs, groups } = linesAndGroups(d, set);
    const out: ReviewFinding[] = [];
    const add = (f: Omit<ReviewFinding, 'id' | 'source'>) => {
        const id = `${f.rule}:${f.optionId ?? '-'}:${f.lineId ?? '-'}`;
        if (!out.some(x => x.id === id)) out.push({ ...f, id, source: 'check' });
    };
    const where = (r: { optionId?: string; optionName?: string }) => (r.optionId ? { optionId: r.optionId, optionName: r.optionName } : {});

    if (!refs.length) {
        add({ rule: 'empty', severity: 'high', message: 'No lines yet: add the work and its prices before you send it.' });
        return out;
    }

    // ── math (document) ──
    const taxRate = toNumber(d.taxRate);
    if (taxRate > REVIEW_LIMITS.maxTaxRate) {
        const guess = [10, 100].map(x => taxRate / x).find(x => x >= 1 && x <= REVIEW_LIMITS.maxTaxRate);
        add({ rule: 'tax_rate', severity: 'high', message: `Tax rate ${taxPct(taxRate)} looks too high${guess ? `: did you mean ${taxPct(guess)}?` : ': check it before you send.'}` });
    } else if (taxRate > 0 && taxRate < 1) {
        add({ rule: 'tax_rate', severity: 'medium', message: `Tax rate ${taxPct(taxRate)} is very low: did you mean ${taxPct(taxRate * 100)}? The rate is a percent.` });
    }
    const discount = toNumber(d.discount);
    for (const g of groups) {
        const totals = computeDocumentTotals({ lineItems: g.lines, taxRate: d.taxRate, discount: d.discount });
        if (discount > 0 && totals.subtotal > 0 && discount > totals.subtotal + 0.005) {
            add({ rule: 'discount', severity: 'high', ...where(g), message: `The discount (${formatMoney(discount)}) is more than the subtotal (${formatMoney(totals.subtotal)}): the client sees only ${formatMoney(totals.subtotal)} off.` });
        }
        // a total stored on the document (imports, older drafts) that is not what the lines add up to
        if (!g.optionId) {
            for (const key of ['subtotal', 'total'] as const) {
                const stored = d[key];
                if (typeof stored === 'number' && Number.isFinite(stored) && Math.abs(stored - totals[key]) > 0.01) {
                    add({ rule: 'math', severity: 'high', lineId: `doc-${key}`, message: `The saved ${key} (${formatMoney(stored)}) doesn’t match the lines (${formatMoney(totals[key])}). Re-check the lines, then save.` });
                }
            }
        }
    }

    // ── each line ──
    for (const ref of refs) {
        const li = ref.line;
        const desc = str(li.description);
        const folded = foldText(desc);
        const qty = toNumber(li.quantity);
        const rate = toNumber(li.rate);
        const cost = toNumber(li.unitCost);
        const base = { ...where(ref), lineId: str(li.id) || undefined };
        const credit = CREDIT_RE.test(folded);

        const storedTotal = rec(li).total ?? rec(li).lineTotal ?? rec(li).line_total;
        if (typeof storedTotal === 'number' && Number.isFinite(storedTotal) && Math.abs(storedTotal - roundMoney(qty * rate)) > 0.01) {
            add({ ...base, rule: 'math', severity: 'high', message: `${ref.label}: the line total ${formatMoney(storedTotal)} is not ${fmtQty(qty)} × ${formatMoney(rate)} (${formatMoney(qty * rate)}).` });
        }
        if (rate !== 0 && Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-6 && qty !== 1) {
            add({ ...base, rule: 'decimals', severity: 'low', message: `${ref.label}: the price has more than 2 decimals (${rate}), so the printed line total can be a cent off ${fmtQty(qty)} × ${formatMoney(rate)}.` });
        }
        if (qty === 0) {
            add({ ...base, rule: 'zero_qty', severity: rate !== 0 ? 'high' : 'medium', message: `${ref.label}: quantity is 0, so this line adds nothing to the total.` });
        } else if ((qty < 0 || rate < 0) && !credit) {
            add({ ...base, rule: 'negative', severity: 'medium', message: `${ref.label}: negative line (${formatMoney(qty * rate)}). Fine for a credit; otherwise fix the ${qty < 0 ? 'quantity' : 'price'}.` });
        }
        if (rate === 0 && qty > 0 && desc && !NO_CHARGE_RE.test(folded) && !isHeading(desc)) {
            add({ ...base, rule: 'no_price', severity: 'high', message: `${ref.label} has no price: the client sees ${formatMoney(0)} for it.` });
        }
        if (qty > 0) {
            const family = unitFamily(li.unit);
            const typical = TYPICAL_QTY[family];
            const peers = refs.filter(r => r !== ref && unitFamily(r.line.unit) === family && toNumber(r.line.quantity) > 0).map(r => toNumber(r.line.quantity));
            const peerTypical = peers.length >= 2 ? median(peers) : 0;
            if (qty > REVIEW_LIMITS.qtyFactor * Math.max(typical, peerTypical)) {
                const unit = str(li.unit);
                add({ ...base, rule: 'qty_unusual', severity: 'medium', message: `${ref.label}: ${fmtQty(qty)}${unit ? ` ${unit}` : ''} is an unusually large quantity for one line. Check for a typo.` });
            }
            if (family === 'each' && !Number.isInteger(Math.round(qty * 1e6) / 1e6)) {
                add({ ...base, rule: 'qty_decimal', severity: 'medium', message: `${ref.label}: ${fmtQty(qty)} ${str(li.unit)}, but items counted by the piece usually take a whole number.` });
            }
        }
        if (cost > 0 && rate > 0 && rate < cost) {
            add({ ...base, rule: 'below_cost', severity: 'high', message: `${ref.label}: priced at ${formatMoney(rate)}, below your cost of ${formatMoney(cost)}.` });
        }
        const item = rate > 0 && qty > 0 ? matchPriceBookItem(li, book) : null;
        const bookRate = toNumber(item?.rate);
        if (item && bookRate > 0) {
            const unitLine = unitFamily(li.unit);
            const unitBook = unitFamily(item.unit);
            const sameUnit = unitLine === 'none' || unitBook === 'none' || unitLine === unitBook;
            const gap = (rate - bookRate) / bookRate;
            if (sameUnit && Math.abs(gap) > REVIEW_LIMITS.priceBookGap + 1e-9) {
                add({
                    ...base, rule: 'price_book', severity: gap < 0 ? 'medium' : 'low',
                    message: `${ref.label}: ${formatMoney(rate)} is ${Math.round(Math.abs(gap) * 100)}% ${gap < 0 ? 'below' : 'above'} your price book (${formatMoney(bookRate)}${str(item.unit) ? ` / ${str(item.unit)}` : ''}).`,
                });
            }
        }
    }

    // ── each option (or the whole estimate) ──
    const notes = foldText([str(d.notes), str(d.terms), str(d.title)].join(' \n '));
    const usualMargin = opts.history?.usualMargin ?? usualMarginOf(book);
    for (const g of groups) {
        const kinds = g.lines.filter(li => toNumber(li.quantity) >= 0 && toNumber(li.rate) >= 0).map(li => lineKind(li, book));
        const hasLabor = kinds.some(k => k === 'labor' || k === 'both');
        const hasMaterial = kinds.some(k => k === 'material' || k === 'both');
        const allText = `${notes} ${g.lines.map(li => foldText(str(li.description))).join(' ')}`;
        if (hasMaterial && !hasLabor && !LABOR_EXCLUDED_RE.test(allText) && !kinds.includes('other')) {
            add({ rule: 'no_labor', severity: 'medium', ...where(g), message: 'Materials but no labor line: add the labor, or say in the notes that it is included or not part of this estimate.' });
        } else if (hasLabor && !hasMaterial && !MATERIALS_EXCLUDED_RE.test(allText) && !kinds.includes('other')) {
            add({ rule: 'no_materials', severity: 'low', ...where(g), message: 'Labor but no materials: fine if the client supplies them; otherwise add them or say so in the notes.' });
        }

        if (g.lines.some(li => toNumber(li.unitCost) > 0)) {
            const totals = computeDocumentTotals({ lineItems: g.lines, discount: d.discount });
            const revenue = roundMoney(totals.subtotal - totals.discount);
            const cost = computeDocumentCost({ lineItems: g.lines });
            if (revenue > 0) {
                const margin = ((revenue - cost) / revenue) * 100;
                if (margin < 0) {
                    add({ rule: 'margin_low', severity: 'high', ...where(g), message: `Your costs (${formatMoney(cost)}) are more than the price (${formatMoney(revenue)}): this estimate loses ${formatMoney(cost - revenue)}.` });
                } else if (usualMargin !== null && usualMargin !== undefined && usualMargin > REVIEW_LIMITS.marginSlack && margin < usualMargin - REVIEW_LIMITS.marginSlack) {
                    add({ rule: 'margin_low', severity: 'medium', ...where(g), message: `Margin ${pct(margin)} is below your usual ${pct(usualMargin)} (from your price book).` });
                } else if ((usualMargin === null || usualMargin === undefined) && margin < REVIEW_LIMITS.minMargin) {
                    add({ rule: 'margin_low', severity: 'medium', ...where(g), message: `Margin ${pct(margin)} is below ${REVIEW_LIMITS.minMargin}%: little room for surprises.` });
                }
            }
        }
    }

    // ── tax ──
    const usualTax = toNumber(opts.history?.usualTaxRate);
    if (usualTax > 0 && taxRate === 0) {
        add({ rule: 'tax_missing', severity: 'medium', message: `No tax on this estimate, but your recent estimates and invoices charge ${taxPct(usualTax)}. Add it unless this job is tax-free.` });
    }

    // ── options with the same lines ──
    if (set && !set.appliedId) {
        const sigs = set.options.map((o, i) => ({ id: o.id, name: optionName(o, i), sig: lineSignature(o.lineItems.filter(isMeaningfulLine)) }));
        for (let i = 0; i < sigs.length; i++) {
            const twin = sigs.slice(0, i).find(s => s.sig === sigs[i].sig);
            if (twin && sigs[i].sig) {
                add({ rule: 'options_same', severity: 'medium', optionId: sigs[i].id, optionName: sigs[i].name, message: `${sigs[i].name} has the same lines as ${twin.name}: change one so the client gets a real choice.` });
            }
        }
    }

    return out.map((f, i) => ({ f, i })).sort((a, b) => (SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity]) || (a.i - b.i)).map(x => x.f);
}

// ─────────────────────────────────────────── review state ───────────────────────────────────────────

/** Short hash of what the AI check depends on (lines, options, tax, discount, notes): a changed estimate needs a new check. */
export function reviewSignature(data: unknown): string {
    const d = rec(data);
    const set = readOptionSet(d);
    const lines = (list: unknown) => (Array.isArray(list) ? list : []).filter(isMeaningfulLine)
        .map((li: Rec) => [str(li.description), toNumber(li.quantity), toNumber(li.rate), str(li.unit), toNumber(li.unitCost)]);
    const text = JSON.stringify([
        set && !set.appliedId ? [set.options.map(o => [o.name, lines(o.lineItems)]), lines(set.sharedLineItems)] : lines(d.lineItems),
        toNumber(d.taxRate), toNumber(d.discount), str(d.notes), str(d.title),
    ]);
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return `${text.length.toString(36)}-${h.toString(36)}`;
}

/** HIGH findings the contractor has not looked at (the review was not opened while they showed) or ignored. */
export const unreviewedHigh = (findings: readonly ReviewFinding[], handled: ReadonlySet<string>): ReviewFinding[] =>
    findings.filter(f => f.severity === 'high' && !handled.has(f.id));

/** "3 things to check" */
export const thingsToCheck = (n: number): string => `${n} ${n === 1 ? 'thing' : 'things'} to check`;

// ─────────────────────────────────────────── suggested lines ───────────────────────────────────────────

/**
 * The line "Add line" puts on the estimate: a price-book suggestion becomes exactly the line picking that item gives
 * (description, unit, your cost, kit parts; the price-book price); any other suggestion goes in without a price.
 */
export function suggestionToLine(s: SuggestedLine, savedItems?: readonly PriceBookSource[] | null): LineItem {
    const line: LineItem & { priceBookItemId?: string } = {
        id: newId(),
        description: str(s.description),
        quantity: s.quantity !== null && s.quantity > 0 ? s.quantity : 1,
        rate: s.rate !== null && s.rate > 0 ? s.rate : 0,
        ...(str(s.unit) ? { unit: str(s.unit).slice(0, 24) } : {}),
    };
    if (!s.priceBookItemId || !savedItems?.some(i => i.id === s.priceBookItemId)) return line;
    const linked = linkDraftToPriceBook({ lineItems: [{ ...line, priceBookItemId: s.priceBookItemId }] }, savedItems).lineItems[0] as LineItem;
    return { ...linked, id: line.id };
}

/**
 * Adds a suggested line without touching anything typed: one-total estimates get it at the end (an empty last line
 * is reused); options estimates get it in the finding's option, or in the lines of every option.
 */
export function addSuggestedLine<T extends Rec>(d: T, line: LineItem, optionId?: string): T {
    const set = readOptionSet(d);
    if (set && !set.appliedId) {
        const target = optionId && set.options.some(o => o.id === optionId) ? optionId : null;
        const next: OptionSet = target
            ? { ...set, options: set.options.map(o => (o.id === target ? { ...o, lineItems: [...o.lineItems, line] } : o)) }
            : { ...set, sharedLineItems: [...set.sharedLineItems, line] };
        return { ...d, estimateOptions: next };
    }
    const lines: LineItem[] = Array.isArray(d.lineItems) ? d.lineItems : [];
    const last = lines[lines.length - 1];
    const keep = last && !isMeaningfulLine(last) && !toNumber(last.unitCost) ? lines.slice(0, -1) : lines;
    return { ...d, lineItems: [...keep, line] };
}

// ─────────────────────────────────────────── the AI request ───────────────────────────────────────────

export interface AiReviewInput {
    data: unknown;
    savedItems?: readonly PriceBookSource[] | null;
    jobName?: string;
    clientName?: string;
    language?: string;
    /** YYYY-MM-DD, local */
    today: string;
    /** the deterministic findings on screen (the AI is told not to repeat them) */
    checks?: readonly ReviewFinding[];
}

/** Body for supabase.functions.invoke('ai-assistant'): the compact estimate, the ranked price-book slice and the checks. */
export function buildAiReviewBody(input: AiReviewInput): Record<string, unknown> {
    const d = rec(input.data);
    const set = readOptionSet(d);
    const internal = internalOf(d);
    const toLine = (li: LineItem) => {
        const cost = toNumber(li.unitCost);
        return {
            desc: str(li.description).slice(0, 120),
            qty: toNumber(li.quantity),
            ...(str(li.unit) ? { unit: str(li.unit).slice(0, 16) } : {}),
            price: toNumber(li.rate),
            ...(cost > 0 ? { cost } : {}),
        };
    };
    const lines = (list: LineItem[]) => withPrivate(list.filter(isMeaningfulLine), internal).map(toLine);
    const estimate: Rec = {
        ...(str(d.title) ? { title: str(d.title) } : {}),
        ...(str(d.notes) ? { notes: str(d.notes).slice(0, 1500) } : {}),
        tax_rate: toNumber(d.taxRate),
        ...(toNumber(d.discount) > 0 ? { discount: toNumber(d.discount) } : {}),
    };
    let text: string;
    if (set && !set.appliedId) {
        estimate.options = set.options.map((o, i) => ({ name: optionName(o, i), ...(set.recommendedId === o.id ? { recommended: true } : {}), lines: lines(o.lineItems) }));
        estimate.shared = lines(set.sharedLineItems);
        text = [...set.options.flatMap(o => o.lineItems), ...set.sharedLineItems].map(li => str(li.description)).join('\n');
    } else {
        estimate.lines = lines(Array.isArray(d.lineItems) ? d.lineItems : []);
        text = (Array.isArray(d.lineItems) ? d.lineItems : []).map((li: LineItem) => str(li.description)).join('\n');
    }
    const checks = (input.checks || []).filter(f => f.source === 'check').slice(0, 12)
        .map(f => `${f.optionName ? `${f.optionName}: ` : ''}${f.message}`.slice(0, 160));
    return {
        task: 'estimate_review',
        estimate,
        context: {
            today: input.today,
            ...(input.jobName ? { job_name: input.jobName } : {}),
            ...(input.clientName ? { client_name: input.clientName } : {}),
            ...(input.language ? { language: input.language } : {}),
            checks,
        },
        price_book: buildPriceBookSlice(input.savedItems || [], [str(d.title), input.jobName || '', text, str(d.notes)].join('\n')),
    };
}

/** The function's answer → AI findings (ids stable for the same message), or throws when it is not a review. */
export function parseAiReviewResponse(data: unknown, estimate: unknown): ReviewFinding[] {
    const body = rec(data);
    const list = rec(body.review).findings;
    if (!body.ok || !Array.isArray(list)) throw new Error('The AI returned an unexpected answer. Please try again.');
    const set = readOptionSet(rec(estimate));
    const optionByName = new Map((set && !set.appliedId ? set.options : []).map((o, i) => [foldText(optionName(o, i)), o.id]));
    const out: ReviewFinding[] = [];
    for (const raw of list) {
        const f = rec(raw);
        const message = str(f.message).slice(0, 300);
        if (!message) continue;
        const severity = (REVIEW_SEVERITIES as readonly string[]).includes(f.severity) ? f.severity as ReviewSeverity : 'medium';
        const kind = (REVIEW_AI_KINDS as readonly string[]).includes(f.kind) ? f.kind as ReviewAiKind : 'other';
        const optionId = optionByName.get(foldText(str(f.option)));
        const l = rec(f.line);
        const description = str(l.description);
        const qty = toNumber(l.quantity);
        const rate = toNumber(l.rate);
        const id = `ai:${foldText(message).replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}`;
        if (out.some(x => x.id === id)) continue;
        out.push({
            id, rule: 'ai', severity, message, source: 'ai', kind,
            ...(optionId ? { optionId, optionName: str(f.option) } : {}),
            ...(description ? {
                suggested: {
                    description: description.slice(0, 120),
                    quantity: qty > 0 ? qty : null,
                    ...(str(l.unit) ? { unit: str(l.unit) } : {}),
                    rate: rate > 0 && str(l.price_book_item_id) ? rate : null,
                    ...(str(l.price_book_item_id) ? { priceBookItemId: str(l.price_book_item_id) } : {}),
                    needsPrice: !(rate > 0 && str(l.price_book_item_id)),
                },
            } : {}),
        });
    }
    return out;
}
