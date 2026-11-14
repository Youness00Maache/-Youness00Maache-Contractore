/**
 * Quick measure (competitor gap #20, the calculator part): the math behind the "Measure" sheet on estimate, invoice
 * and change-order lines (components/measure/QuickMeasureSheet.tsx). Pure: no React, no browser, no network, so
 * scripts/measure-check.ts can test every rule.
 *
 *   Room    length × width × height → floor, walls (minus doors / windows), ceiling, walls + ceiling, perimeter
 *   Area    rectangles and triangles, added or taken away
 *   Linear  lengths (× count) added up
 *   Roof    plan area (L × W, or typed) × pitch factor √(1 + (rise / 12)²) → roof area and roofing squares (100 sq ft)
 *   Volume  length × width × depth → cubic yards (cu ft ÷ 27), or m³
 * then + waste %, rounded up (to whole packs when a pack size is set: 1 box = 20 sq ft) → the line's quantity + unit.
 *
 * Imperial lengths are typed as feet + inches, metric ones in metres. The math runs in the system the user typed in
 * (never through metres and back), so 12' × 14' is exactly 168 sq ft and stays 168 after rounding up.
 *
 * Nothing here changes a document: the sheet fills the line's quantity (and its `unit`, shown in the editor only) and
 * adds the summary to the description only when the user ticks "Add measurement to description".
 */
import type { KeyValueStore } from './userDataSync.ts';

export type UnitSystem = 'imperial' | 'metric';
export type MeasureMode = 'room' | 'area' | 'linear' | 'roof' | 'volume';
export type MeasureUnit = 'sq ft' | 'lf' | 'sq' | 'cu yd' | 'cu ft' | 'm²' | 'm' | 'm³';
export type OpeningKind = 'door' | 'window' | 'other';
export type ShapeKind = 'rect' | 'tri';
export type PitchUnit = 'rise' | 'deg';
export type FillAs = 'unit' | 'pack';

export const MEASURE_MODES: ReadonlyArray<{ id: MeasureMode; label: string }> = [
    { id: 'room', label: 'Room' },
    { id: 'area', label: 'Area' },
    { id: 'linear', label: 'Linear' },
    { id: 'roof', label: 'Roof' },
    { id: 'volume', label: 'Volume' },
];

export const M_PER_FT = 0.3048;
export const SQ_FT_PER_SQUARE = 100;
export const CU_FT_PER_CU_YD = 27;
/** steepest pitch accepted (24/12 ≈ 63°) and the degree equivalent */
export const PITCH_MAX_RISE = 24;
export const PITCH_MAX_DEG = 75;
export const WASTE_MAX = 100;
export const WASTE_CHOICES = [0, 5, 10, 15] as const;
export const PACK_NAMES = ['box', 'bundle', 'bag', 'roll', 'sheet', 'piece', 'pallet'] as const;
/** limits for typed text and lists (a stored measurement stays small) */
export const TEXT_MAX = 24;
export const NAME_MAX = 40;
export const LIST_MAX = 20;

/** Each unit in metres / m² / m³ (`dim` 1 = length, 2 = area, 3 = volume). */
const SI: Record<MeasureUnit, { dim: 1 | 2 | 3; factor: number }> = {
    lf: { dim: 1, factor: M_PER_FT },
    m: { dim: 1, factor: 1 },
    'sq ft': { dim: 2, factor: M_PER_FT ** 2 },
    sq: { dim: 2, factor: SQ_FT_PER_SQUARE * M_PER_FT ** 2 },
    'm²': { dim: 2, factor: 1 },
    'cu ft': { dim: 3, factor: M_PER_FT ** 3 },
    'cu yd': { dim: 3, factor: CU_FT_PER_CU_YD * M_PER_FT ** 3 },
    'm³': { dim: 3, factor: 1 },
};
export const MEASURE_UNITS = Object.keys(SI) as MeasureUnit[];

/**
 * Rounding up without rounding the measurement: whole units for the small imperial units (sq ft, lf, cu ft), 2
 * decimals for the big ones (squares, cubic yards) and for metric.
 */
export const ROUND_STEP: Record<MeasureUnit, number> = {
    'sq ft': 1, lf: 1, 'cu ft': 1, sq: 0.01, 'cu yd': 0.01, 'm²': 0.01, m: 0.01, 'm³': 0.01,
};

/** Area / length / volume unit of a system. */
export const unitsOf = (system: UnitSystem) => (system === 'metric'
    ? { length: 'm' as const, area: 'm²' as const, volume: 'm³' as const }
    : { length: 'lf' as const, area: 'sq ft' as const, volume: 'cu yd' as const });

// ---------------------------------------------------------------------------------------------------------------
// numbers
// ---------------------------------------------------------------------------------------------------------------
/** Drops float noise (0.1 + 0.2, 7 in ÷ 12 × 12) before comparing or rounding up. */
export const clean = (n: number, places = 6): number => {
    if (!Number.isFinite(n)) return 0;
    const f = 10 ** places;
    const v = Math.round(n * f) / f;
    return v === 0 ? 0 : v; // no −0
};

/** Rounds UP to a multiple of `step` (0.01, 1, a pack size); exact values stay as they are. */
export const ceilTo = (n: number, step: number): number => {
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (!(step > 0)) return clean(n);
    return clean(Math.ceil(clean(n / step)) * step, 6);
};

const positive = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/**
 * A number as typed: "12", "12.5", "12,5" (decimal comma), "1,250" (thousands), "6 1/2", "6-1/2", "1/2", "−3".
 * Empty or anything else → null.
 */
export function parseNumber(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== 'string') return null;
    let s = raw.trim().replace(/−/g, '-').replace(/\s+/g, ' ');
    if (!s) return null;
    if (s.includes(',')) {
        if (s.includes('.')) s = s.replace(/,/g, ''); // 1,250.5
        else if (/^-?[1-9]\d{0,2}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ''); // 1,250 / 12,000
        else if ((s.match(/,/g) || []).length === 1) s = s.replace(',', '.'); // 12,5 / 0,125
        else return null;
    }
    let m = s.match(/^(-?)(\d+(?:\.\d+)?)(?: |-| ?- ?)(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/); // 6 1/2
    if (m) {
        const den = Number(m[4]);
        if (!den) return null;
        const v = Number(m[2]) + Number(m[3]) / den;
        return m[1] ? -v : v;
    }
    m = s.match(/^(-?)(\d+(?:\.\d+)?) ?\/ ?(\d+(?:\.\d+)?)$/); // 1/2
    if (m) {
        const den = Number(m[3]);
        if (!den) return null;
        const v = Number(m[2]) / den;
        return m[1] ? -v : v;
    }
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

const normalizeMarks = (raw: string) => raw.trim().toLowerCase()
    .replace(/[′’‘`´]/g, "'").replace(/[″“”]/g, '"').replace(/''/g, '"');

/** The inches box: 6, 6.5, 6 1/2, 6", 6 in → inches; null if not a number. */
export function parseInches(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== 'string') return null;
    const s = normalizeMarks(raw).replace(/\s*(?:"|inches|inch|in)\.?$/, '').trim();
    return s ? parseNumber(s) : null;
}

/**
 * The feet box: 12, 12.5, 12'6", 12' 6 1/2", 12 ft 6 in, 12ft, 6" (inches only) → feet. Lets a keyboard user type a
 * whole length in one box; on a phone the feet and inches boxes are used.
 */
export function parseFeetInches(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== 'string') return null;
    const s = normalizeMarks(raw);
    if (!s) return null;
    const plain = parseNumber(s);
    if (plain !== null) return plain;
    const ft = s.match(/^(.*?)\s*(?:'|feet|foot|ft)\.?\s*(.*)$/);
    if (ft) {
        const feet = parseNumber(ft[1]);
        if (feet === null) return null;
        const rest = ft[2].trim();
        const inches = rest ? parseInches(rest) : 0;
        if (inches === null) return null;
        return feet < 0 ? feet - inches / 12 : feet + inches / 12;
    }
    if (/(?:"|inches|inch|in)\.?$/.test(s)) {
        const inches = parseInches(s);
        return inches === null ? null : inches / 12;
    }
    return null;
}

/** Whole count (doors, segments): "2" → 2, "" → `empty`, junk / negative → null. */
export function parseCount(raw: unknown, empty = 1): number | null {
    if (typeof raw === 'string' && !raw.trim()) return empty;
    if (raw === undefined || raw === null) return empty;
    const n = parseNumber(raw);
    if (n === null || n < 0) return null;
    return Math.min(9999, Math.round(n));
}

/** 1234.5 → "1,234.5" (at most `decimals` decimals, no trailing zeros). */
export function formatQty(n: number, decimals = 2): string {
    const v = clean(Number.isFinite(n) ? n : 0, decimals);
    return v.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

/** Plain decimal text for an input box (no thousands separator): 3.81, 12, 0.125. */
export const inputNumber = (n: number, decimals = 3): string => String(clean(n, decimals));

// ---------------------------------------------------------------------------------------------------------------
// lengths (feet + inches / metres)
// ---------------------------------------------------------------------------------------------------------------
/** A typed length: imperial `major` = feet, `minor` = inches; metric `major` = metres (`minor` = cm, optional). */
export interface LengthInput { major: string; minor: string }
export const emptyLength = (): LengthInput => ({ major: '', minor: '' });
export const lengthOfText = (major: string, minor = ''): LengthInput => ({ major, minor });

export interface LengthValue {
    /** feet or metres (0 when empty or invalid) */
    value: number;
    empty: boolean;
    /** false = not a number, or negative */
    valid: boolean;
}

export function readLength(l: LengthInput | null | undefined, system: UnitSystem): LengthValue {
    const major = String(l?.major ?? '').trim();
    const minor = String(l?.minor ?? '').trim();
    if (!major && !minor) return { value: 0, empty: true, valid: true };
    const a = major ? (system === 'imperial' ? parseFeetInches(major) : parseNumber(major)) : 0;
    const b = minor ? (system === 'imperial' ? parseInches(minor) : parseNumber(minor)) : 0;
    if (a === null || b === null || a < 0 || b < 0) return { value: 0, empty: false, valid: false };
    const value = system === 'imperial' ? a + b / 12 : a + b / 100;
    return { value: clean(value, 9), empty: false, valid: true };
}

/** 12.5 ft → 12' 6"; 0.333 ft → 4"; 3.81 m → 3.81 m. */
export function formatLength(value: number, system: UnitSystem): string {
    const v = Math.max(0, Number.isFinite(value) ? value : 0);
    if (system === 'metric') return `${formatQty(v, 3)} m`;
    let ft = Math.floor(clean(v, 6));
    let inches = clean((v - ft) * 12, 2);
    if (inches >= 12) { ft += 1; inches = 0; }
    if (!inches) return `${ft}'`;
    return ft ? `${ft}' ${formatQty(inches, 2)}"` : `${formatQty(inches, 2)}"`;
}

/**
 * A typed length in the other system (the units toggle): imperial → metres to the millimetre; metric → feet +
 * inches to the nearest 1/8". Empty stays empty; text that is not a length is kept as typed.
 */
export function convertLength(l: LengthInput, from: UnitSystem, to: UnitSystem): LengthInput {
    if (from === to) return { major: l.major, minor: l.minor };
    const r = readLength(l, from);
    if (r.empty) return emptyLength();
    if (!r.valid) return { major: l.major, minor: l.minor };
    if (to === 'metric') return { major: inputNumber(r.value * M_PER_FT, 3), minor: '' };
    const feet = r.value / M_PER_FT;
    let ft = Math.floor(clean(feet, 6));
    let inches = clean(Math.round((feet - ft) * 12 * 8) / 8, 3);
    if (inches >= 12) { ft += 1; inches = 0; }
    return { major: String(ft), minor: inches ? inputNumber(inches, 3) : '' };
}

/** A quantity in another unit of the same kind (sq ft → m², cu yd → m³); null across kinds (sq ft → lf). */
export function convertAmount(value: number, from: MeasureUnit, to: MeasureUnit): number | null {
    const a = SI[from];
    const b = SI[to];
    if (!a || !b || a.dim !== b.dim || !Number.isFinite(value)) return null;
    return (value * a.factor) / b.factor;
}

// ---------------------------------------------------------------------------------------------------------------
// the math (numbers in feet / metres)
// ---------------------------------------------------------------------------------------------------------------
export interface OpeningSize { count: number; width: number; height: number }

export interface RoomAreas {
    floor: number;
    ceiling: number;
    perimeter: number;
    /** walls before doors and windows */
    wallsGross: number;
    openings: number;
    /** walls minus doors and windows (never below 0) */
    walls: number;
    wallsAndCeiling: number;
    openingsExceedWalls: boolean;
}

export function roomAreas(length: number, width: number, height: number, openings: OpeningSize[] = []): RoomAreas {
    const L = positive(length);
    const W = positive(width);
    const H = positive(height);
    const floor = clean(L * W);
    const perimeter = clean(2 * (L + W));
    const wallsGross = clean(perimeter * H);
    const openingArea = clean(openings.reduce((a, o) => a + positive(o.count) * positive(o.width) * positive(o.height), 0));
    const walls = Math.max(0, clean(wallsGross - openingArea));
    return {
        floor,
        ceiling: floor,
        perimeter,
        wallsGross,
        openings: openingArea,
        walls,
        wallsAndCeiling: clean(walls + floor),
        openingsExceedWalls: wallsGross > 0 && openingArea > wallsGross,
    };
}

export const shapeArea = (kind: ShapeKind, a: number, b: number): number =>
    clean(kind === 'tri' ? (positive(a) * positive(b)) / 2 : positive(a) * positive(b));

export interface AreaTotal { total: number; added: number; removed: number; negative: boolean }

/** Shapes added up, the "take away" ones subtracted; a total below 0 is 0 (`negative` says so). */
export function areaTotal(shapes: Array<{ kind: ShapeKind; a: number; b: number; subtract?: boolean }>): AreaTotal {
    let added = 0;
    let removed = 0;
    for (const s of shapes) {
        const v = shapeArea(s.kind, s.a, s.b);
        if (s.subtract) removed += v; else added += v;
    }
    const raw = clean(added - removed);
    return { total: Math.max(0, raw), added: clean(added), removed: clean(removed), negative: raw < 0 };
}

export const linearTotal = (segments: Array<{ length: number; count?: number }>): number =>
    clean(segments.reduce((a, s) => a + positive(s.length) * (s.count === undefined ? 1 : positive(s.count)), 0));

/** Roof pitch factor: √(1 + (rise / run)²). 6/12 → 1.118, 12/12 → 1.414. Flat or invalid → 1. */
export function pitchFactor(rise: number, run = 12): number {
    if (!(run > 0)) return 1;
    const r = Math.min(PITCH_MAX_RISE, positive(rise));
    return Math.sqrt(1 + (r / run) ** 2);
}

/** Pitch factor from an angle: 1 / cos(angle). 45° → 1.414. */
export function pitchFactorFromDegrees(deg: number): number {
    const d = Math.min(PITCH_MAX_DEG, positive(deg));
    return 1 / Math.cos((d * Math.PI) / 180);
}

export const pitchDegrees = (rise: number, run = 12): number => (run > 0 ? (Math.atan(positive(rise) / run) * 180) / Math.PI : 0);
export const riseFromDegrees = (deg: number): number => Math.tan((Math.min(PITCH_MAX_DEG, positive(deg)) * Math.PI) / 180) * 12;

export interface RoofResult { factor: number; area: number; squares: number }

/** Roof area from the plan (footprint) area; squares = sq ft ÷ 100 (meaningful for imperial). */
export function roofResult(planArea: number, factor: number): RoofResult {
    const area = clean(positive(planArea) * (factor >= 1 && Number.isFinite(factor) ? factor : 1));
    return { factor, area, squares: clean(area / SQ_FT_PER_SQUARE) };
}

export interface VolumeResult { cubic: number; cuYd: number | null }

/** L × W × depth: imperial → cu ft and cu yd (÷ 27); metric → m³. */
export function volumeResult(length: number, width: number, depth: number, system: UnitSystem): VolumeResult {
    const cubic = clean(positive(length) * positive(width) * positive(depth));
    return { cubic, cuYd: system === 'imperial' ? clean(cubic / CU_FT_PER_CU_YD) : null };
}

export interface FinalQuantity {
    base: number;
    /** waste % used (0–100) */
    waste: number;
    withWaste: number;
    /** pack size in the measured unit (null = none) */
    pack: number | null;
    /** whole packs (null without a pack size) */
    packs: number | null;
    /** in the measured unit: rounded up to `step`, or to whole packs */
    quantity: number;
}

/** Measured amount + waste %, rounded up to whole packs (or to `step` without a pack size). */
export function finalQuantity(base: number, wastePct: number, packSize?: number | null, step = 0.01): FinalQuantity {
    const b = positive(base);
    const waste = Number.isFinite(wastePct) ? Math.min(WASTE_MAX, Math.max(0, wastePct)) : 0;
    const withWaste = clean(b * (1 + waste / 100));
    const pack = typeof packSize === 'number' && Number.isFinite(packSize) && packSize > 0 ? packSize : null;
    if (!pack) return { base: b, waste, withWaste, pack: null, packs: null, quantity: ceilTo(withWaste, step) };
    const packs = withWaste > 0 ? Math.ceil(clean(withWaste / pack)) : 0;
    return { base: b, waste, withWaste, pack, packs, quantity: clean(packs * pack, 4) };
}

// ---------------------------------------------------------------------------------------------------------------
// the sheet's state (what the user typed) → results
// ---------------------------------------------------------------------------------------------------------------
export interface OpeningInput { id: string; kind: OpeningKind; count: string; width: LengthInput; height: LengthInput }
export interface ShapeInput { id: string; kind: ShapeKind; a: LengthInput; b: LengthInput; subtract: boolean }
export interface SegmentInput { id: string; length: LengthInput; count: string }

export interface MeasureState {
    system: UnitSystem;
    mode: MeasureMode;
    /** optional name: "Kitchen" (recent list + description summary) */
    name: string;
    room: { length: LengthInput; width: LengthInput; height: LengthInput; openings: OpeningInput[] };
    area: { shapes: ShapeInput[] };
    linear: { segments: SegmentInput[] };
    roof: { by: 'dims' | 'area'; length: LengthInput; width: LengthInput; planArea: string; pitch: string; pitchUnit: PitchUnit };
    volume: { length: LengthInput; width: LengthInput; depth: LengthInput };
    /** waste % as typed */
    waste: string;
    /** pack size in the picked result's unit ("" = no packs) */
    pack: string;
    packName: string;
    /** picked result per mode (floor, walls, squares…) */
    pick: Partial<Record<MeasureMode, string>>;
    fillAs: FillAs;
}

let seq = 0;
export const measureId = (): string => `m${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Standard door / window sizes ("count × standard size"); the size stays editable per row. */
export const STANDARD_OPENINGS: Record<UnitSystem, Record<Exclude<OpeningKind, 'other'>, { width: LengthInput; height: LengthInput }>> = {
    imperial: {
        door: { width: lengthOfText('3'), height: lengthOfText('6', '8') }, // 3' × 6' 8" = 20 sq ft
        window: { width: lengthOfText('3'), height: lengthOfText('4') }, // 3' × 4' = 12 sq ft
    },
    metric: {
        door: { width: lengthOfText('0.9'), height: lengthOfText('2.1') }, // 1.89 m²
        window: { width: lengthOfText('1.2'), height: lengthOfText('1.2') }, // 1.44 m²
    },
};

export function newOpening(kind: OpeningKind, system: UnitSystem): OpeningInput {
    const std = kind === 'other' ? null : STANDARD_OPENINGS[system][kind];
    return {
        id: measureId(), kind, count: '1',
        width: std ? { ...std.width } : emptyLength(),
        height: std ? { ...std.height } : emptyLength(),
    };
}
export const newShape = (kind: ShapeKind = 'rect', subtract = false): ShapeInput => ({ id: measureId(), kind, a: emptyLength(), b: emptyLength(), subtract });
export const newSegment = (): SegmentInput => ({ id: measureId(), length: emptyLength(), count: '' });

export function blankMeasureState(system: UnitSystem = 'imperial', mode: MeasureMode = 'room'): MeasureState {
    return {
        system,
        mode,
        name: '',
        room: { length: emptyLength(), width: emptyLength(), height: emptyLength(), openings: [] },
        area: { shapes: [newShape()] },
        linear: { segments: [newSegment(), newSegment()] },
        roof: { by: 'dims', length: emptyLength(), width: emptyLength(), planArea: '', pitch: '', pitchUnit: 'rise' },
        volume: { length: emptyLength(), width: emptyLength(), depth: emptyLength() },
        waste: '',
        pack: '',
        packName: 'box',
        pick: {},
        fillAs: 'unit',
    };
}

/** One result the user can pick (Floor 168 sq ft); `work` is the calculation shown under it. */
export interface MeasureOutput { key: string; label: string; value: number; unit: MeasureUnit; work: string }

export interface MeasureReading {
    outputs: MeasureOutput[];
    /** problems to show (a box that is not a number, openings bigger than the walls…) */
    issues: string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listWork = (parts: string[], max: number) =>
    parts.length > max ? `${parts.slice(0, max).join(' ')} + ${parts.length - max} more` : parts.join(' ');

export function readMeasure(state: MeasureState): MeasureReading {
    const sys = state.system;
    const u = unitsOf(sys);
    const issues: string[] = [];
    const len = (l: LengthInput, label: string) => {
        const r = readLength(l, sys);
        if (!r.valid) issues.push(`${label}: not a length.`);
        return r.value;
    };
    const fl = (v: number) => formatLength(v, sys);
    const q = (v: number) => formatQty(v, 2);
    const outputs: MeasureOutput[] = [];

    if (state.mode === 'room') {
        const r = state.room;
        const L = len(r.length, 'Length');
        const W = len(r.width, 'Width');
        const H = len(r.height, 'Height');
        let doors = 0;
        let windows = 0;
        let others = 0;
        const openings: OpeningSize[] = r.openings.map((o, i) => {
            const label = o.kind === 'door' ? 'Door' : o.kind === 'window' ? 'Window' : 'Opening';
            const count = parseCount(o.count, 1);
            if (count === null) issues.push(`${label} ${i + 1}: count is not a whole number.`);
            const c = count ?? 0;
            if (o.kind === 'door') doors += c; else if (o.kind === 'window') windows += c; else others += c;
            return { count: c, width: len(o.width, `${label} ${i + 1} width`), height: len(o.height, `${label} ${i + 1} height`) };
        });
        const a = roomAreas(L, W, H, openings);
        if (a.openingsExceedWalls) issues.push('Doors and windows are bigger than the walls: walls set to 0.');
        const openingWords = [doors && plural(doors, 'door'), windows && plural(windows, 'window'), others && plural(others, 'opening')].filter(Boolean).join(', ');
        const dims = `${fl(L)} × ${fl(W)}`;
        outputs.push({ key: 'floor', label: 'Floor', value: a.floor, unit: u.area, work: dims });
        outputs.push({
            key: 'walls', label: 'Walls', value: a.walls, unit: u.area,
            work: `${q(a.perimeter)} ${u.length} × ${fl(H)}${a.openings > 0 ? ` − ${q(a.openings)} ${u.area} (${openingWords})` : ''}`,
        });
        outputs.push({ key: 'ceiling', label: 'Ceiling', value: a.ceiling, unit: u.area, work: dims });
        outputs.push({ key: 'wallsCeiling', label: 'Walls + ceiling', value: a.wallsAndCeiling, unit: u.area, work: `${q(a.walls)} + ${q(a.ceiling)}` });
        outputs.push({ key: 'perimeter', label: 'Perimeter', value: a.perimeter, unit: u.length, work: `2 × (${fl(L)} + ${fl(W)})` });
    } else if (state.mode === 'area') {
        const shapes = state.area.shapes.map((s, i) => ({
            kind: s.kind, subtract: s.subtract,
            a: len(s.a, `Shape ${i + 1} ${s.kind === 'tri' ? 'base' : 'length'}`),
            b: len(s.b, `Shape ${i + 1} ${s.kind === 'tri' ? 'height' : 'width'}`),
        }));
        const t = areaTotal(shapes);
        if (t.negative) issues.push('The shapes taken away are bigger than the shapes added: total set to 0.');
        const parts = shapes
            .filter(s => s.a > 0 && s.b > 0)
            .map((s, i) => `${i === 0 && !s.subtract ? '' : s.subtract ? '− ' : '+ '}${s.kind === 'tri' ? '½ × ' : ''}${fl(s.a)} × ${fl(s.b)}`);
        outputs.push({ key: 'total', label: 'Area', value: t.total, unit: u.area, work: listWork(parts, 4) || '—' });
    } else if (state.mode === 'linear') {
        const segs = state.linear.segments.map((s, i) => {
            const count = parseCount(s.count, 1);
            if (count === null) issues.push(`Length ${i + 1}: count is not a whole number.`);
            return { length: len(s.length, `Length ${i + 1}`), count: count ?? 0 };
        });
        const total = linearTotal(segs);
        const parts = segs.filter(s => s.length > 0 && s.count > 0)
            .map((s, i) => `${i ? '+ ' : ''}${s.count !== 1 ? `${s.count} × ` : ''}${fl(s.length)}`);
        outputs.push({ key: 'total', label: 'Total length', value: total, unit: u.length, work: listWork(parts, 5) || '—' });
    } else if (state.mode === 'roof') {
        const r = state.roof;
        let plan = 0;
        let planWork = '';
        if (r.by === 'area') {
            const typed = r.planArea.trim() ? parseNumber(r.planArea) : 0;
            if (typed === null || typed < 0) issues.push('Plan area: not a number.');
            plan = positive(typed ?? 0);
            planWork = `${q(plan)} ${u.area}`;
        } else {
            const L = len(r.length, 'Length');
            const W = len(r.width, 'Width');
            plan = clean(L * W);
            planWork = `${fl(L)} × ${fl(W)}`;
        }
        const pitchRaw = r.pitch.trim() ? parseNumber(r.pitch) : 0;
        if (pitchRaw === null || pitchRaw < 0) issues.push('Pitch: not a number.');
        const max = r.pitchUnit === 'deg' ? PITCH_MAX_DEG : PITCH_MAX_RISE;
        if (pitchRaw !== null && pitchRaw > max) issues.push(`Pitch: at most ${r.pitchUnit === 'deg' ? `${max}°` : `${max}/12`}.`);
        const p = positive(pitchRaw ?? 0);
        const factor = r.pitchUnit === 'deg' ? pitchFactorFromDegrees(p) : pitchFactor(p);
        const pitchText = r.pitchUnit === 'deg' ? `${formatQty(Math.min(p, max), 1)}°` : `${formatQty(Math.min(p, max), 2)}/12`;
        const roof = roofResult(plan, factor);
        outputs.push({ key: 'area', label: 'Roof area', value: roof.area, unit: u.area, work: `${planWork} × ${factor.toFixed(3)} (${pitchText})` });
        if (sys === 'imperial') outputs.push({ key: 'squares', label: 'Roofing squares', value: roof.squares, unit: 'sq', work: `${q(roof.area)} sq ft ÷ 100` });
    } else {
        const v = state.volume;
        const L = len(v.length, 'Length');
        const W = len(v.width, 'Width');
        const D = len(v.depth, 'Depth');
        const res = volumeResult(L, W, D, sys);
        const dims = `${fl(L)} × ${fl(W)} × ${fl(D)}`;
        if (sys === 'imperial') {
            outputs.push({ key: 'volume', label: 'Cubic yards', value: res.cuYd ?? 0, unit: 'cu yd', work: `${dims} ÷ 27` });
            outputs.push({ key: 'cubicFeet', label: 'Cubic feet', value: res.cubic, unit: 'cu ft', work: dims });
        } else {
            outputs.push({ key: 'volume', label: 'Volume', value: res.cubic, unit: 'm³', work: dims });
        }
    }
    return { outputs, issues };
}

/** The picked result (the first one when the pick is not available, e.g. squares in metric). */
export const pickedOutput = (state: MeasureState, reading: MeasureReading = readMeasure(state)): MeasureOutput | null =>
    reading.outputs.find(o => o.key === state.pick[state.mode]) || reading.outputs[0] || null;

export interface MeasureFinal extends FinalQuantity {
    output: MeasureOutput | null;
    /** what "Use this quantity" puts on the line */
    lineQuantity: number;
    lineUnit: string;
}

/** The final quantity of the picked result (waste + rounding) and what goes on the line. */
export function measureFinal(state: MeasureState, reading: MeasureReading = readMeasure(state)): MeasureFinal {
    const output = pickedOutput(state, reading);
    const unit: MeasureUnit = output?.unit ?? unitsOf(state.system).area;
    const waste = state.waste.trim() ? parseNumber(state.waste) : 0;
    const pack = state.pack.trim() ? parseNumber(state.pack) : null;
    const f = finalQuantity(output?.value ?? 0, waste ?? 0, pack, ROUND_STEP[unit]);
    const asPacks = state.fillAs === 'pack' && f.packs !== null;
    return {
        ...f,
        output,
        lineQuantity: asPacks ? (f.packs as number) : clean(f.quantity, 3),
        lineUnit: asPacks ? (cleanText(state.packName, TEXT_MAX) || 'pack') : unit,
    };
}

/** "box" → "boxes" for the sheet's labels (the line keeps the singular unit). */
export function pluralUnit(word: string, n: number): string {
    if (n === 1 || !/^[a-z]+$/i.test(word)) return word;
    if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
    return `${word}s`;
}

// ---------------------------------------------------------------------------------------------------------------
// "Add measurement to description"
// ---------------------------------------------------------------------------------------------------------------
export const MEASURED_PREFIX = 'Measured:';
const MEASURED_TAIL = /\s*·\s*Measured:.*$/;
export const SUMMARY_MAX = 220;

/** "Measured: Kitchen, floor 12' × 14' = 168 sq ft + 10% waste → 10 boxes of 20 sq ft" */
export function measurementSummary(state: MeasureState, final: MeasureFinal = measureFinal(state)): string {
    const o = final.output;
    if (!o) return '';
    const name = cleanText(state.name, NAME_MAX);
    let text = `${MEASURED_PREFIX} ${name ? `${name}, ` : ''}${o.label.toLowerCase()} ${o.work} = ${formatQty(o.value)} ${o.unit}`;
    if (final.waste > 0) text += ` + ${formatQty(final.waste, 1)}% waste`;
    if (final.packs !== null && final.pack !== null) {
        text += ` → ${final.packs} ${pluralUnit(cleanText(state.packName, TEXT_MAX) || 'pack', final.packs)} of ${formatQty(final.pack, 3)} ${o.unit}`;
    } else if (final.quantity !== clean(o.value, 2)) {
        text += ` → ${formatQty(final.quantity)} ${o.unit}`;
    }
    return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

/** The description with the summary at the end; a summary added before is replaced, never repeated. */
export function withMeasurement(description: string, summary: string): string {
    const base = String(description || '').replace(MEASURED_TAIL, '').replace(/^Measured:.*$/, '').trimEnd();
    if (!summary) return base;
    return base ? `${base} · ${summary}` : summary;
}

// ---------------------------------------------------------------------------------------------------------------
// unit hints (a line priced "per square" opens Roof → squares)
// ---------------------------------------------------------------------------------------------------------------
const UNIT_PATTERNS: Array<[MeasureUnit, RegExp]> = [
    ['sq ft', /(\bsq\.?\s*f(?:ee|oo)?t\b|\bsquare\s*f(?:ee|oo)t\b|\bsf\b|\bft²|\bft2\b)/i],
    ['cu yd', /(\bcu\.?\s*yds?\b|\bcubic\s*yards?\b|\byd³|\byd3\b|\bcy\b)/i],
    ['cu ft', /(\bcu\.?\s*ft\b|\bcubic\s*f(?:ee|oo)t\b|\bft³|\bft3\b)/i],
    ['lf', /(\blf\b|\blin\.?\s*ft\b|\blinear\s*f(?:ee|oo)t\b|\blineal\s*f(?:ee|oo)t\b)/i],
    ['m²', /(m²|\bm2\b|\bsq\.?\s*m\b|\bsqm\b|\bsquare\s*met(?:er|re)s?\b)/i],
    ['m³', /(m³|\bm3\b|\bcubic\s*met(?:er|re)s?\b)/i],
    ['m', /(\blm\b|\blin\.?\s*m\b|\blinear\s*met(?:er|re)s?\b)/i],
    ['sq', /(\bper\s+square\b|\bsquares\b|\b\/\s*sq\b|\(sq\)|\bsq\b(?!\.?\s*(?:f|m|yd|in)))/i],
];

/** The unit a line's text mentions ("Shingles (per square)" → sq), or null. */
export function unitFromText(text: unknown): MeasureUnit | null {
    const s = typeof text === 'string' ? text : '';
    if (!s.trim()) return null;
    if ((MEASURE_UNITS as string[]).includes(s.trim())) return s.trim() as MeasureUnit;
    for (const [unit, re] of UNIT_PATTERNS) if (re.test(s)) return unit;
    return null;
}

/** Where the sheet opens for a unit: per square → Roof / squares, cu yd → Volume, lf → Linear. */
export function suggestFromUnit(unit: MeasureUnit | null): { mode: MeasureMode; pick?: string } | null {
    switch (unit) {
        case 'sq': return { mode: 'roof', pick: 'squares' };
        case 'cu yd': case 'm³': return { mode: 'volume', pick: 'volume' };
        case 'cu ft': return { mode: 'volume', pick: 'cubicFeet' };
        case 'lf': case 'm': return { mode: 'linear' };
        default: return null;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// units toggle + preference
// ---------------------------------------------------------------------------------------------------------------
/** No saved choice: imperial for the US (and Liberia / Myanmar / Canada's trades) or a bare "en", metric elsewhere. */
export function defaultUnitSystem(locale?: string | null): UnitSystem {
    const tag = String(locale || '').trim();
    if (!tag) return 'imperial';
    const parts = tag.replace(/_/g, '-').split('-');
    const lang = parts[0].toLowerCase();
    const region = parts.slice(1).find(p => /^[a-z]{2}$/i.test(p) || /^\d{3}$/.test(p))?.toUpperCase();
    if (!region) return lang === 'en' ? 'imperial' : 'metric';
    return ['US', 'LR', 'MM', 'CA', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM'].includes(region) ? 'imperial' : 'metric';
}

export const parseUnitSystem = (v: unknown): UnitSystem | null => {
    const s = v && typeof v === 'object' ? (v as { system?: unknown }).system : v;
    return s === 'imperial' || s === 'metric' ? s : null;
};

/** Everything typed, in the other system (lengths, plan area, pack size). Picks without a match fall back. */
export function convertMeasureState(state: MeasureState, to: UnitSystem): MeasureState {
    const from = state.system;
    if (from === to) return state;
    const cl = (l: LengthInput) => convertLength(l, from, to);
    const beforeUnit = pickedOutput(state)?.unit ?? null;
    const planArea = (() => {
        const v = state.roof.planArea.trim() ? parseNumber(state.roof.planArea) : null;
        if (v === null) return state.roof.planArea.trim() ? state.roof.planArea : '';
        const c = convertAmount(v, unitsOf(from).area, unitsOf(to).area);
        return c === null ? state.roof.planArea : inputNumber(c, 2);
    })();
    const next: MeasureState = {
        ...state,
        system: to,
        room: { length: cl(state.room.length), width: cl(state.room.width), height: cl(state.room.height), openings: state.room.openings.map(o => ({ ...o, width: cl(o.width), height: cl(o.height) })) },
        area: { shapes: state.area.shapes.map(s => ({ ...s, a: cl(s.a), b: cl(s.b) })) },
        linear: { segments: state.linear.segments.map(s => ({ ...s, length: cl(s.length) })) },
        roof: { ...state.roof, length: cl(state.roof.length), width: cl(state.roof.width), planArea },
        volume: { length: cl(state.volume.length), width: cl(state.volume.width), depth: cl(state.volume.depth) },
    };
    const afterUnit = pickedOutput(next)?.unit ?? null;
    const pack = state.pack.trim() ? parseNumber(state.pack) : null;
    if (pack !== null && beforeUnit && afterUnit) {
        const c = convertAmount(pack, beforeUnit, afterUnit);
        next.pack = c === null ? '' : inputNumber(c, 3);
    }
    return next;
}

// ---------------------------------------------------------------------------------------------------------------
// stored state (recent measurements) — every value re-checked when read back
// ---------------------------------------------------------------------------------------------------------------
const cleanText = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const box = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, TEXT_MAX) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const asLength = (v: unknown): LengthInput => {
    const r = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    return { major: box(r.major), minor: box(r.minor) };
};
const idOf = (v: unknown): string => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : measureId());
const listOf = (v: unknown): Record<string, unknown>[] =>
    (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)).slice(0, LIST_MAX);
const MODES = MEASURE_MODES.map(m => m.id);

/** Any stored / pasted value → a complete, valid state (unknown keys dropped, text and lists capped). */
export function sanitizeMeasureState(raw: unknown, fallbackSystem: UnitSystem = 'imperial'): MeasureState {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const system = parseUnitSystem(r.system) || fallbackSystem;
    const base = blankMeasureState(system);
    const sub = (k: string): Record<string, unknown> => (r[k] && typeof r[k] === 'object' && !Array.isArray(r[k]) ? (r[k] as Record<string, unknown>) : {});
    const room = sub('room');
    const area = sub('area');
    const linear = sub('linear');
    const roof = sub('roof');
    const volume = sub('volume');
    const pickRaw = sub('pick');
    const pick: Partial<Record<MeasureMode, string>> = {};
    for (const m of MODES) if (typeof pickRaw[m] === 'string' && /^[a-zA-Z]{1,20}$/.test(pickRaw[m] as string)) pick[m] = pickRaw[m] as string;
    const shapes = listOf(area.shapes).map(s => ({
        id: idOf(s.id), kind: (s.kind === 'tri' ? 'tri' : 'rect') as ShapeKind, a: asLength(s.a), b: asLength(s.b), subtract: s.subtract === true,
    }));
    const segments = listOf(linear.segments).map(s => ({ id: idOf(s.id), length: asLength(s.length), count: box(s.count) }));
    return {
        system,
        mode: MODES.includes(r.mode as MeasureMode) ? (r.mode as MeasureMode) : 'room',
        name: cleanText(r.name, NAME_MAX),
        room: {
            length: asLength(room.length), width: asLength(room.width), height: asLength(room.height),
            openings: listOf(room.openings).map(o => ({
                id: idOf(o.id), kind: (o.kind === 'door' || o.kind === 'window' ? o.kind : 'other') as OpeningKind,
                count: box(o.count), width: asLength(o.width), height: asLength(o.height),
            })),
        },
        area: { shapes: shapes.length ? shapes : base.area.shapes },
        linear: { segments: segments.length ? segments : base.linear.segments },
        roof: {
            by: roof.by === 'area' ? 'area' : 'dims', length: asLength(roof.length), width: asLength(roof.width),
            planArea: box(roof.planArea), pitch: box(roof.pitch), pitchUnit: roof.pitchUnit === 'deg' ? 'deg' : 'rise',
        },
        volume: { length: asLength(volume.length), width: asLength(volume.width), depth: asLength(volume.depth) },
        waste: box(r.waste),
        pack: box(r.pack),
        packName: cleanText(r.packName, TEXT_MAX) || 'box',
        pick,
        fillAs: r.fillAs === 'pack' ? 'pack' : 'unit',
    };
}

export const RECENT_MAX = 8;

export interface RecentMeasurement {
    id: string;
    /** ISO time it was used */
    at: string;
    /** "Kitchen · Floor" */
    label: string;
    quantity: number;
    unit: string;
    state: MeasureState;
}

/** Device-only list per user and job (localStorage). */
export const recentMeasureKey = (uid: string | null | undefined, jobId: string | null | undefined): string =>
    `cd.measure.recent:${String(uid || 'guest').slice(0, 64)}:${String(jobId || 'no-job').slice(0, 64)}`;

/** What makes two measurements "the same" (the newer one replaces the older one in the list). */
const signatureOf = (s: MeasureState): string => {
    const part = s.mode === 'room' ? s.room : s.mode === 'area' ? s.area.shapes.map(x => [x.kind, x.a, x.b, x.subtract])
        : s.mode === 'linear' ? s.linear.segments.map(x => [x.length, x.count]) : s.mode === 'roof' ? s.roof : s.volume;
    const strip = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, val) => (k === 'id' ? undefined : val)));
    return JSON.stringify([s.system, s.mode, s.name, s.pick[s.mode] || '', strip(part), s.waste, s.pack, s.packName, s.fillAs]);
};

const readRecentRaw = (store: KeyValueStore, key: string): unknown[] => {
    try {
        const raw = store.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export function readRecentMeasurements(store: KeyValueStore, uid: string | null | undefined, jobId: string | null | undefined): RecentMeasurement[] {
    const out: RecentMeasurement[] = [];
    for (const item of readRecentRaw(store, recentMeasureKey(uid, jobId))) {
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        const quantity = typeof r.quantity === 'number' && Number.isFinite(r.quantity) && r.quantity >= 0 ? r.quantity : null;
        if (quantity === null || !r.state) continue;
        out.push({
            id: idOf(r.id),
            at: typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at)) ? r.at : new Date(0).toISOString(),
            label: cleanText(r.label, 80) || 'Measurement',
            quantity,
            unit: cleanText(r.unit, TEXT_MAX),
            state: sanitizeMeasureState(r.state),
        });
        if (out.length >= RECENT_MAX) break;
    }
    return out;
}

/** "Kitchen · Floor" / "Floor" */
export const recentLabel = (state: MeasureState, output: MeasureOutput | null): string =>
    [cleanText(state.name, NAME_MAX), output?.label || MEASURE_MODES.find(m => m.id === state.mode)?.label || 'Measurement'].filter(Boolean).join(' · ');

/**
 * Remembers a used measurement for this user + job on the device: newest first, the same measurement only once,
 * at most RECENT_MAX. Returns the new list (the old list if storage is full or blocked).
 */
export function rememberMeasurement(
    store: KeyValueStore, uid: string | null | undefined, jobId: string | null | undefined, state: MeasureState, now: Date = new Date(),
): RecentMeasurement[] {
    const current = readRecentMeasurements(store, uid, jobId);
    const safe = sanitizeMeasureState(state, state.system);
    const reading = readMeasure(safe);
    const final = measureFinal(safe, reading);
    if (!final.output || final.lineQuantity <= 0) return current;
    const sig = signatureOf(safe);
    const entry: RecentMeasurement = {
        id: measureId(), at: now.toISOString(), label: recentLabel(safe, final.output),
        quantity: final.lineQuantity, unit: final.lineUnit, state: safe,
    };
    const next = [entry, ...current.filter(r => signatureOf(r.state) !== sig)].slice(0, RECENT_MAX);
    try {
        store.setItem(recentMeasureKey(uid, jobId), JSON.stringify(next));
        return next;
    } catch {
        return current;
    }
}

/** "today", "yesterday", "3 days ago", "Mar 4" */
export function recentWhen(iso: string, now: Date = new Date()): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((day(now) - day(new Date(t))) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
