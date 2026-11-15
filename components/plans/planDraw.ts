/**
 * Plans (roadmap N9): drawing measurements on a canvas (the viewer and the "marked-up plan" PNG share it).
 * A view maps page units to canvas pixels: x_canvas = x_page * z + ox.
 */
import { formatLength, formatQty, unitsOf, type UnitSystem } from '../../lib/measure.ts';
import { centroid, type Pt } from '../../lib/plans/geometry.ts';
import { itemMeasure, kindsOf, quantityFor, wasteOf, type LabelTotal } from '../../lib/plans/totals.ts';
import type { PlanItem, PlanLabel, PlanPage } from '../../lib/plans/schema.ts';

export interface View { z: number; ox: number; oy: number }

export const toScreen = (p: Pt, v: View): Pt => [p[0] * v.z + v.ox, p[1] * v.z + v.oy];
export const toPage = (p: Pt, v: View): Pt => [(p[0] - v.ox) / v.z, (p[1] - v.oy) / v.z];

const withAlpha = (hex: string, a: number): string => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** "12' 6"" / "3.81 m" for lengths, "123 sq ft" / "11.4 m²" for areas */
export const fmtLength = (v: number, system: UnitSystem): string => (system === 'metric' ? `${formatQty(v, 2)} m` : formatLength(v, system));
export const fmtArea = (v: number, system: UnitSystem): string => `${formatQty(v, system === 'metric' ? 2 : 1)} ${unitsOf(system).area}`;

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, px: number) {
    ctx.font = `600 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const w = ctx.measureText(text).width + px * 0.9;
    const h = px * 1.55;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, px / 10);
    ctx.beginPath();
    const r = h / 2;
    const left = x - w / 2;
    const top = y - h / 2;
    ctx.moveTo(left + r, top);
    ctx.arcTo(left + w, top, left + w, top + h, r);
    ctx.arcTo(left + w, top + h, left, top + h, r);
    ctx.arcTo(left, top + h, left, top, r);
    ctx.arcTo(left, top, left + w, top, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + px * 0.05);
}

export interface DrawOptions {
    view: View;
    /** CSS px → canvas px (devicePixelRatio, or the export scale) */
    unit: number;
    labels: readonly PlanLabel[];
    system: UnitSystem;
    scaleKnown: boolean;
    page: PlanPage;
    selectedId?: string | null;
    /** show the length / area of each item */
    values?: boolean;
}

/** Every visible item of a page. */
export function drawItems(ctx: CanvasRenderingContext2D, o: DrawOptions) {
    const byId = new Map(o.labels.map(l => [l.id, l]));
    const u = o.unit;
    // areas first (fills under the lines), cut-outs over their areas
    const order = (it: PlanItem) => (it.tool === 'area' ? (it.subtract ? 1 : 0) : it.tool === 'line' ? 2 : 3);
    const items = [...o.page.items].sort((a, b) => order(a) - order(b));
    for (const item of items) {
        const label = byId.get(item.label);
        if (!label || label.hidden) continue;
        const color = label.color;
        const selected = item.id === o.selectedId;
        const pts = item.pts.map(p => toScreen(p, o.view));
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (item.tool === 'area') {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.closePath();
            if (item.subtract) {
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fill();
                ctx.setLineDash([6 * u, 4 * u]);
                ctx.strokeStyle = color;
                ctx.lineWidth = (selected ? 3 : 2) * u;
                ctx.stroke();
            } else {
                ctx.fillStyle = withAlpha(color, selected ? 0.32 : 0.2);
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = (selected ? 3.5 : 2.5) * u;
                ctx.stroke();
            }
        } else if (item.tool === 'line') {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.strokeStyle = color;
            ctx.lineWidth = (selected ? 4.5 : 3) * u;
            ctx.stroke();
            for (const p of [pts[0], pts[pts.length - 1]]) {
                ctx.beginPath();
                ctx.arc(p[0], p[1], 3.5 * u, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            }
        } else {
            const r = 10 * u;
            pts.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.lineWidth = (selected ? 3 : 1.5) * u;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = `700 ${11 * u}px system-ui, -apple-system, "Segoe UI", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(i + 1), p[0], p[1] + 0.5 * u);
            });
        }
        if (selected && item.tool !== 'count') {
            for (const p of pts) {
                ctx.beginPath();
                ctx.rect(p[0] - 5 * u, p[1] - 5 * u, 10 * u, 10 * u);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.lineWidth = 2 * u;
                ctx.strokeStyle = color;
                ctx.setLineDash([]);
                ctx.stroke();
            }
        }
        if (o.values !== false && o.scaleKnown && item.tool !== 'count') {
            const m = itemMeasure(item, o.page.scale, o.system);
            if (m) {
                const text = item.tool === 'line' ? fmtLength(m.length, o.system) : `${item.subtract ? '− ' : ''}${fmtArea(m.area, o.system)}`;
                const at = item.tool === 'line' ? midOf(pts) : toScreen(centroid(item.pts), o.view);
                pill(ctx, text, at[0], at[1], color, 11 * u);
            }
        }
        ctx.restore();
    }
}

/** Middle of the longest segment (where a line's length reads best). */
function midOf(pts: Pt[]): Pt {
    let best: Pt = pts[0] || [0, 0];
    let len = -1;
    for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (d > len) { len = d; best = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2 - 12]; }
    }
    return best;
}

/** The shape being drawn (and the calibration line): dashed, with its points. */
export function drawDraft(ctx: CanvasRenderingContext2D, pagePts: Pt[], hover: Pt | null, opts: {
    view: View; unit: number; color: string; closed?: boolean; text?: string | null; firstHot?: boolean;
}) {
    const u = opts.unit;
    const pts = pagePts.map(p => toScreen(p, opts.view));
    const all = hover ? [...pts, toScreen(hover, opts.view)] : pts;
    if (!all.length) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    all.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (opts.closed && all.length > 2) {
        ctx.closePath();
        ctx.fillStyle = withAlpha(opts.color, 0.15);
        ctx.fill();
    }
    ctx.setLineDash([7 * u, 5 * u]);
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2.5 * u;
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], (i === 0 && opts.firstHot ? 9 : 5) * u, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2.5 * u;
        ctx.strokeStyle = opts.color;
        ctx.stroke();
    });
    if (opts.text && all.length) {
        const last = all[all.length - 1];
        pill(ctx, opts.text, last[0], last[1] - 22 * u, opts.color, 12 * u);
    }
    ctx.restore();
}

/** The legend under the exported plan: one row per label with its totals. Returns the height used. */
export function legendHeight(rows: readonly LabelTotal[], unit: number): number {
    const shown = rows.filter(r => kindsOf(r).length);
    return Math.round((44 + Math.max(1, shown.length) * 26) * unit);
}

export function drawLegend(ctx: CanvasRenderingContext2D, rows: readonly LabelTotal[], o: {
    x: number; y: number; width: number; unit: number; system: UnitSystem; title: string; scaleText: string;
}) {
    const u = o.unit;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(o.x, o.y, o.width, legendHeight(rows, u));
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${14 * u}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText(o.title, o.x + 16 * u, o.y + 20 * u);
    ctx.font = `500 ${12 * u}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = '#4b5563';
    ctx.textAlign = 'right';
    ctx.fillText(o.scaleText, o.x + o.width - 16 * u, o.y + 20 * u);
    const shown = rows.filter(r => kindsOf(r).length);
    let y = o.y + 48 * u;
    ctx.textAlign = 'left';
    if (!shown.length) {
        ctx.fillStyle = '#6b7280';
        ctx.fillText('Nothing measured on this page.', o.x + 16 * u, y);
    }
    for (const r of shown) {
        ctx.fillStyle = r.label.color;
        ctx.fillRect(o.x + 16 * u, y - 6 * u, 12 * u, 12 * u);
        ctx.fillStyle = '#111827';
        ctx.font = `600 ${12.5 * u}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.fillText(r.label.name, o.x + 36 * u, y);
        const parts = kindsOf(r).map(k => {
            const q = quantityFor(r, k, wasteOf(r.label, k), o.system);
            const measured = k === 'area' ? fmtArea(q.base, o.system) : k === 'length' ? fmtLength(q.base, o.system) : `${q.base} each`;
            return q.waste ? `${measured} (+${q.waste}% = ${formatQty(q.quantity, 2)} ${q.unit})` : measured;
        });
        ctx.font = `500 ${12.5 * u}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(parts.join(' · '), o.x + o.width - 16 * u, y);
        ctx.textAlign = 'left';
        y += 26 * u;
    }
    ctx.restore();
}
