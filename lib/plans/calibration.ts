/**
 * Plan measurement (roadmap N9): the known length typed when setting a page's scale, and the scale shown in the
 * toolbar. Pure (reuses the feet-inches / number parsing of Quick measure, lib/measure.ts).
 *
 *   parseKnownLength("12'6\"", system)   → metres | null   ("12.5 ft", "150 in", "3.8 m", "3800 mm", "380 cm", "12")
 *   scaleLabel(scale, kind, system)      → "1/4\" = 1'" / "1:50" / "≈ 1:73" / "Set from 12' 6\""
 */
import { M_PER_FT, formatLength, parseFeetInches, parseNumber, type UnitSystem } from '../measure.ts';
import { COMMON_SCALES, M_PER_PT } from './geometry.ts';

/** Longest length accepted (metres): 10 km. */
export const MAX_KNOWN_M = 10_000;

const ok = (m: number | null): number | null => (m !== null && Number.isFinite(m) && m > 0 && m <= MAX_KNOWN_M ? m : null);

/**
 * A typed real length → metres. A unit in the text wins ("3.8 m" on an imperial account is metres); a bare number
 * uses the account's system (feet or metres). Feet-inches accept 12'6", 12' 6 1/2", 12 ft 6 in, 6".
 */
export function parseKnownLength(raw: unknown, system: UnitSystem): number | null {
    if (typeof raw === 'number') return ok(Number.isFinite(raw) ? (system === 'metric' ? raw : raw * M_PER_FT) : null);
    if (typeof raw !== 'string') return null;
    const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s || s.length > 40) return null;
    const metric = /^(.*?)\s*(mm|cm|m|metres|meters|metre|meter)\.?$/.exec(s);
    if (metric) {
        const n = parseNumber(metric[1]);
        if (n === null) return null;
        const f = metric[2] === 'mm' ? 0.001 : metric[2] === 'cm' ? 0.01 : 1;
        return ok(n * f);
    }
    if (system === 'metric') {
        const plain = parseNumber(s);
        if (plain !== null) return ok(plain);
    }
    const ft = parseFeetInches(s);
    return ok(ft === null ? null : ft * M_PER_FT);
}

export interface PageScale {
    /** metres per page unit */
    mPerU: number;
    /** 'calibrated' = two points + a typed length; 'preset' = a drawing scale picked from the list */
    how: 'calibrated' | 'preset';
    /** the typed length (metres) for 'calibrated'; the ratio for 'preset' */
    ref: number;
}

/** Toolbar text for a page's scale. `kind` 'pdf' knows the paper size, so a ratio can be shown. */
export function scaleLabel(scale: PageScale | null | undefined, kind: 'pdf' | 'image', system: UnitSystem): string {
    if (!scale || !(scale.mPerU > 0)) return 'No scale';
    if (scale.how === 'preset') {
        const preset = COMMON_SCALES.find(c => Math.abs(c.ratio - scale.ref) < 1e-9);
        return preset ? preset.label : `1:${Math.round(scale.ref)}`;
    }
    if (kind === 'pdf') {
        const ratio = scale.mPerU / M_PER_PT;
        const near = COMMON_SCALES.find(c => c.system === system && Math.abs(c.ratio - ratio) / c.ratio <= 0.02);
        if (near) return `≈ ${near.label}`;
        return `≈ 1:${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}`;
    }
    const typed = system === 'metric' ? scale.ref : scale.ref / M_PER_FT;
    return `Set from ${formatLength(typed, system)}`;
}
