/**
 * Plan measurement (roadmap N9): pure geometry. No DOM, no imports beyond lib/measure.ts (unit constants).
 *
 * Coordinates are "page units": PDF points at scale 1 (1/72 inch on paper) for PDF pages, natural pixels for images.
 * A page's scale is stored as metres per page unit (`mPerU`), so a measurement never depends on the zoom.
 *
 *   dist(a, b) / polylineLength(pts) / polygonArea(pts) (shoelace, absolute) / polygonPerimeter(pts)
 *   signedArea(pts) / isDegeneratePolygon(pts) / centroid(pts)
 *   lengthM(lenU, mPerU) / areaM2(areaU2, mPerU)          page units → metres / m²
 *   lengthIn(m, system) / areaIn(m2, system)              metres → ft or m, m² → sq ft or m²
 *   scaleFromPoints(a, b, metres)                         calibration → mPerU (null when unusable)
 *   presetScale(ratio)                                    PDF only: "1/4\" = 1'" (48) or 1:50 → mPerU
 *   COMMON_SCALES                                         presets for the picker
 *   roundTo(n, step) / nearestVertex / distToSegment / pointInPolygon   editing helpers
 */
import { M_PER_FT, type UnitSystem } from '../measure.ts';

export type Pt = [number, number];

/** Metres per PDF point on paper (1 pt = 1/72 inch). */
export const M_PER_PT = 0.0254 / 72;
export const SQ_FT_PER_M2 = 1 / (M_PER_FT * M_PER_FT);

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const okPt = (p: unknown): p is Pt => Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1]);
const pointsOf = (pts: readonly unknown[] | null | undefined): Pt[] => (Array.isArray(pts) ? pts.filter(okPt) as Pt[] : []);

export const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Sum of the segments (open line). 0 for fewer than 2 points. */
export function polylineLength(pts: readonly Pt[] | null | undefined): number {
    const p = pointsOf(pts);
    let total = 0;
    for (let i = 1; i < p.length; i++) total += dist(p[i - 1], p[i]);
    return total;
}

/** Shoelace sum / 2 (positive = counter-clockwise in a y-up frame; on screen y goes down, so the sign flips). */
export function signedArea(pts: readonly Pt[] | null | undefined): number {
    const p = pointsOf(pts);
    if (p.length < 3) return 0;
    let s = 0;
    for (let i = 0; i < p.length; i++) {
        const [x1, y1] = p[i];
        const [x2, y2] = p[(i + 1) % p.length];
        s += x1 * y2 - x2 * y1;
    }
    return s / 2;
}

/** Area of a simple polygon (convex or concave), whatever the drawing direction. */
export const polygonArea = (pts: readonly Pt[] | null | undefined): number => Math.abs(signedArea(pts));

/** Closed outline length (the last point joins the first). */
export function polygonPerimeter(pts: readonly Pt[] | null | undefined): number {
    const p = pointsOf(pts);
    if (p.length < 2) return 0;
    if (p.length === 2) return 2 * dist(p[0], p[1]);
    return polylineLength(p) + dist(p[p.length - 1], p[0]);
}

/** Fewer than 3 distinct points, or (almost) no area: not an area yet. */
export function isDegeneratePolygon(pts: readonly Pt[] | null | undefined, minArea = 1e-6): boolean {
    const p = pointsOf(pts);
    const distinct = new Set(p.map(q => `${q[0]},${q[1]}`));
    return distinct.size < 3 || polygonArea(p) <= minArea;
}

/** Average of the points (label position). */
export function centroid(pts: readonly Pt[] | null | undefined): Pt {
    const p = pointsOf(pts);
    if (!p.length) return [0, 0];
    const sx = p.reduce((s, q) => s + q[0], 0);
    const sy = p.reduce((s, q) => s + q[1], 0);
    return [sx / p.length, sy / p.length];
}

// ------------------------------------------------------------------------------------------------- units
export const lengthM = (lenU: number, mPerU: number | null | undefined): number =>
    finite(lenU) && finite(mPerU) && mPerU > 0 ? Math.max(0, lenU) * mPerU : 0;
export const areaM2 = (areaU2: number, mPerU: number | null | undefined): number =>
    finite(areaU2) && finite(mPerU) && mPerU > 0 ? Math.max(0, areaU2) * mPerU * mPerU : 0;

/** metres → feet (imperial) or metres (metric) */
export const lengthIn = (m: number, system: UnitSystem): number => (finite(m) ? (system === 'metric' ? m : m / M_PER_FT) : 0);
/** m² → sq ft (imperial) or m² (metric) */
export const areaIn = (m2: number, system: UnitSystem): number => (finite(m2) ? (system === 'metric' ? m2 : m2 * SQ_FT_PER_M2) : 0);
/** feet or metres (the system's length) → metres */
export const toMetres = (value: number, system: UnitSystem): number => (finite(value) ? (system === 'metric' ? value : value * M_PER_FT) : 0);

/** Rounds to a multiple of `step` (0.01, 1…) without float noise; -0 → 0. */
export function roundTo(n: number, step = 0.01): number {
    if (!finite(n)) return 0;
    if (!(step > 0)) return n;
    const decimals = Math.max(0, Math.min(10, Math.ceil(-Math.log10(step) + 1e-9)));
    const v = Number((Math.round(n / step) * step).toFixed(decimals));
    return v === 0 ? 0 : v;
}

// ------------------------------------------------------------------------------------------------- scale
/** Smallest calibration line (page units): shorter lines are too imprecise. */
export const MIN_CALIBRATION_UNITS = 4;

/** Two points of a known real length (metres) → metres per page unit; null when the line is too short or the length unusable. */
export function scaleFromPoints(a: Pt, b: Pt, metres: number): number | null {
    if (!okPt(a) || !okPt(b) || !finite(metres) || metres <= 0) return null;
    const d = dist(a, b);
    if (d < MIN_CALIBRATION_UNITS) return null;
    return metres / d;
}

/** Drawing scale ratio (real ÷ paper) → metres per PDF point. Only meaningful for PDF pages (known paper size). */
export const presetScale = (ratio: number): number | null => (finite(ratio) && ratio > 0 ? ratio * M_PER_PT : null);

export interface CommonScale { id: string; label: string; ratio: number; system: UnitSystem }
export const COMMON_SCALES: readonly CommonScale[] = [
    { id: 'i-1-8', label: '1/8" = 1\'', ratio: 96, system: 'imperial' },
    { id: 'i-3-16', label: '3/16" = 1\'', ratio: 64, system: 'imperial' },
    { id: 'i-1-4', label: '1/4" = 1\'', ratio: 48, system: 'imperial' },
    { id: 'i-3-8', label: '3/8" = 1\'', ratio: 32, system: 'imperial' },
    { id: 'i-1-2', label: '1/2" = 1\'', ratio: 24, system: 'imperial' },
    { id: 'i-3-4', label: '3/4" = 1\'', ratio: 16, system: 'imperial' },
    { id: 'i-1', label: '1" = 1\'', ratio: 12, system: 'imperial' },
    { id: 'i-1-10', label: '1" = 10\'', ratio: 120, system: 'imperial' },
    { id: 'i-1-20', label: '1" = 20\'', ratio: 240, system: 'imperial' },
    { id: 'm-20', label: '1:20', ratio: 20, system: 'metric' },
    { id: 'm-50', label: '1:50', ratio: 50, system: 'metric' },
    { id: 'm-100', label: '1:100', ratio: 100, system: 'metric' },
    { id: 'm-200', label: '1:200', ratio: 200, system: 'metric' },
    { id: 'm-500', label: '1:500', ratio: 500, system: 'metric' },
];

// ------------------------------------------------------------------------------------------------- editing
/** Index of the closest point within `radius` (same units as the points), or -1. */
export function nearestVertex(pts: readonly Pt[] | null | undefined, p: Pt, radius: number): number {
    const list = pointsOf(pts);
    let best = -1;
    let bestD = radius;
    list.forEach((q, i) => {
        const d = dist(q, p);
        if (d <= bestD) { best = i; bestD = d; }
    });
    return best;
}

/** Shortest distance from p to the segment a-b. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return dist(p, a);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Even-odd rule (works for concave outlines). */
export function pointInPolygon(p: Pt, pts: readonly Pt[] | null | undefined): boolean {
    const poly = pointsOf(pts);
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
