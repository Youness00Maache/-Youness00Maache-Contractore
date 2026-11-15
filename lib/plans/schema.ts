/**
 * Plan measurement (roadmap N9): the small measurement file kept next to each plan in storage (no database table).
 *
 *   { v: 1, version, updatedAt, kind, pageCount, labels: [...], pages: { "1": { scale, items: [...] } } }
 *
 *   blankMeasureDoc(kind)               a new file
 *   readMeasureDoc(raw)                 any JSON text / object → { doc, readOnly, problem }  (never throws)
 *                                         - malformed / too big → an empty doc + problem
 *                                         - no `v` (first draft shape { scale, items }) → migrated to v1
 *                                         - v newer than this app → read as far as possible, readOnly (never saved
 *                                           over, so a newer app's data is not lost)
 *   serializeMeasureDoc(doc)            JSON text (throws when over MEASURE_MAX_BYTES)
 *   stampForSave(doc, remote?, now)     last write wins: version = max(local, remote) + 1, updatedAt = now
 *   labelColor(i) / newLabel(...) / newItem(...)
 */
import type { Pt } from './geometry.ts';
import type { PageScale } from './calibration.ts';

export const MEASURE_DOC_VERSION = 1;
export const MEASURE_MAX_BYTES = 200 * 1024;
export const PLAN_MAX_PAGES = 10;
export const LABELS_MAX = 30;
export const ITEMS_PER_PAGE_MAX = 400;
export const POINTS_PER_ITEM_MAX = 300;
export const LABEL_NAME_MAX = 40;
export const COORD_MAX = 1_000_000;

export type PlanKind = 'pdf' | 'image';
export type ItemTool = 'line' | 'area' | 'count';

export interface PlanLabel {
    id: string;
    name: string;
    /** #rrggbb */
    color: string;
    hidden?: boolean;
    /** waste % for this label (0-100); null/undefined = default (10 for lengths and areas, 0 for counts) */
    waste?: number | null;
}

export interface PlanItem {
    id: string;
    tool: ItemTool;
    /** PlanLabel.id */
    label: string;
    pts: Pt[];
    /** area only: a cut-out (taken away from the label's area) */
    subtract?: boolean;
}

export interface PlanPage {
    scale?: PageScale | null;
    items: PlanItem[];
}

export interface MeasureDoc {
    v: 1;
    /** grows by one on every save (last write wins) */
    version: number;
    updatedAt: string;
    kind: PlanKind;
    pageCount: number;
    labels: PlanLabel[];
    pages: Record<string, PlanPage>;
}

export interface ReadResult {
    doc: MeasureDoc;
    /** written by a newer version of the app: show it, never save over it */
    readOnly: boolean;
    problem: string | null;
}

/** Distinct colours that stay readable on white plans and in dark mode. */
export const LABEL_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#e67700', '#495057'] as const;
export const labelColor = (i: number): string => LABEL_COLORS[((i % LABEL_COLORS.length) + LABEL_COLORS.length) % LABEL_COLORS.length];

let seq = 0;
export const planId = (prefix = 'p'): string => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const blankMeasureDoc = (kind: PlanKind = 'pdf', pageCount = 1): MeasureDoc => ({
    v: 1, version: 0, updatedAt: new Date(0).toISOString(), kind, pageCount: clampInt(pageCount, 1, PLAN_MAX_PAGES, 1), labels: [], pages: {},
});

export const newLabel = (name: string, index: number, waste?: number | null): PlanLabel => ({
    id: planId('l'), name: cleanName(name) || `Label ${index + 1}`, color: labelColor(index), ...(waste !== undefined ? { waste } : {}),
});

export const newItem = (tool: ItemTool, label: string, pts: Pt[], subtract = false): PlanItem => ({
    id: planId('i'), tool, label, pts: pts.map(p => [p[0], p[1]] as Pt), ...(tool === 'area' && subtract ? { subtract: true } : {}),
});

// ------------------------------------------------------------------------------------------------ sanitizing
function clampInt(v: unknown, min: number, max: number, fallback: number): number {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.min(max, Math.max(min, n));
}
const cleanName = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_NAME_MAX) : '');
const cleanId = (v: unknown, prefix: string): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : planId(prefix));
const cleanColor = (v: unknown, i: number): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : labelColor(i));
const round2 = (n: number) => Math.round(n * 100) / 100;

function cleanPoint(p: unknown): Pt | null {
    if (!Array.isArray(p) || p.length < 2) return null;
    const [x, y] = p;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (Math.abs(x) > COORD_MAX || Math.abs(y) > COORD_MAX) return null;
    return [round2(x), round2(y)];
}

function cleanScale(v: unknown): PageScale | null {
    if (!v || typeof v !== 'object') return null;
    const s = v as Record<string, unknown>;
    const mPerU = typeof s.mPerU === 'number' && Number.isFinite(s.mPerU) && s.mPerU > 0 && s.mPerU < 1e6 ? s.mPerU : null;
    if (mPerU === null) return null;
    const how = s.how === 'preset' ? 'preset' : 'calibrated';
    const ref = typeof s.ref === 'number' && Number.isFinite(s.ref) && s.ref > 0 ? s.ref : 0;
    return { mPerU, how, ref };
}

const cleanWaste = (v: unknown): number | null | undefined => {
    if (v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
};

function cleanLabels(raw: unknown): PlanLabel[] {
    if (!Array.isArray(raw)) return [];
    const out: PlanLabel[] = [];
    const ids = new Set<string>();
    for (const r of raw) {
        if (!r || typeof r !== 'object') continue;
        const o = r as Record<string, unknown>;
        let id = cleanId(o.id, 'l');
        if (ids.has(id)) id = planId('l');
        ids.add(id);
        const label: PlanLabel = { id, name: cleanName(o.name) || `Label ${out.length + 1}`, color: cleanColor(o.color, out.length) };
        if (o.hidden === true) label.hidden = true;
        const w = cleanWaste(o.waste);
        if (w !== undefined) label.waste = w;
        out.push(label);
        if (out.length >= LABELS_MAX) break;
    }
    return out;
}

function cleanItems(raw: unknown, labelIds: Set<string>): PlanItem[] {
    if (!Array.isArray(raw)) return [];
    const out: PlanItem[] = [];
    for (const r of raw) {
        if (!r || typeof r !== 'object') continue;
        const o = r as Record<string, unknown>;
        const tool: ItemTool | null = o.tool === 'line' || o.tool === 'area' || o.tool === 'count' ? o.tool : null;
        if (!tool) continue;
        const label = typeof o.label === 'string' && labelIds.has(o.label) ? o.label : null;
        if (!label) continue;
        const pts = (Array.isArray(o.pts) ? o.pts : []).map(cleanPoint).filter((p): p is Pt => p !== null).slice(0, POINTS_PER_ITEM_MAX);
        const min = tool === 'line' ? 2 : tool === 'area' ? 3 : 1;
        if (pts.length < min) continue;
        const item: PlanItem = { id: cleanId(o.id, 'i'), tool, label, pts };
        if (tool === 'area' && o.subtract === true) item.subtract = true;
        out.push(item);
        if (out.length >= ITEMS_PER_PAGE_MAX) break;
    }
    return out;
}

/** Any object → a valid v1 doc (unknown keys dropped, caps applied, items of unknown labels dropped). */
export function sanitizeMeasureDoc(raw: unknown, fallbackKind: PlanKind = 'pdf'): MeasureDoc {
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const kind: PlanKind = o.kind === 'image' ? 'image' : o.kind === 'pdf' ? 'pdf' : fallbackKind;
    const labels = cleanLabels(o.labels);
    const ids = new Set(labels.map(l => l.id));
    const pages: Record<string, PlanPage> = {};
    const rawPages = o.pages && typeof o.pages === 'object' && !Array.isArray(o.pages) ? o.pages as Record<string, unknown> : {};
    for (const [key, value] of Object.entries(rawPages)) {
        const n = Number(key);
        if (!Number.isInteger(n) || n < 1 || n > PLAN_MAX_PAGES || String(n) !== key) continue;
        if (!value || typeof value !== 'object') continue;
        const p = value as Record<string, unknown>;
        const scale = cleanScale(p.scale);
        const items = cleanItems(p.items, ids);
        if (!scale && !items.length) continue;
        pages[key] = { ...(scale ? { scale } : {}), items };
    }
    const updatedAt = typeof o.updatedAt === 'string' && !Number.isNaN(Date.parse(o.updatedAt)) ? new Date(Date.parse(o.updatedAt)).toISOString() : new Date(0).toISOString();
    return {
        v: 1,
        version: clampInt(o.version, 0, Number.MAX_SAFE_INTEGER, 0),
        updatedAt,
        kind,
        pageCount: clampInt(o.pageCount, 1, PLAN_MAX_PAGES, 1),
        labels,
        pages,
    };
}

/** The first draft shape (no `v`): { scale, items, labels } for a single page → v1. */
function migrateV0(o: Record<string, unknown>): Record<string, unknown> {
    if (o.pages) return { ...o, v: 1 };
    return { ...o, v: 1, pages: { 1: { scale: o.scale, items: o.items } } };
}

/** Reads a stored measurement file (text or parsed object). Never throws. */
export function readMeasureDoc(raw: unknown, fallbackKind: PlanKind = 'pdf'): ReadResult {
    let value: unknown = raw;
    if (typeof raw === 'string') {
        if (raw.length > MEASURE_MAX_BYTES * 2) return { doc: blankMeasureDoc(fallbackKind), readOnly: false, problem: 'The saved measurements are too big to open.' };
        try {
            value = JSON.parse(raw);
        } catch {
            return { doc: blankMeasureDoc(fallbackKind), readOnly: false, problem: 'The saved measurements could not be read. New measurements will replace them.' };
        }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { doc: blankMeasureDoc(fallbackKind), readOnly: false, problem: raw == null ? null : 'The saved measurements could not be read. New measurements will replace them.' };
    }
    const o = value as Record<string, unknown>;
    const v = o.v;
    if (v === undefined || v === 0) return { doc: sanitizeMeasureDoc(migrateV0(o), fallbackKind), readOnly: false, problem: null };
    if (v === MEASURE_DOC_VERSION) return { doc: sanitizeMeasureDoc(o, fallbackKind), readOnly: false, problem: null };
    if (typeof v === 'number' && Number.isFinite(v) && v > MEASURE_DOC_VERSION) {
        return { doc: sanitizeMeasureDoc(o, fallbackKind), readOnly: true, problem: 'These measurements were saved by a newer version of the app. Reload the page to edit them.' };
    }
    return { doc: blankMeasureDoc(fallbackKind), readOnly: false, problem: 'The saved measurements could not be read. New measurements will replace them.' };
}

/** JSON text of a doc (sanitized). Throws a readable Error when it is over the size cap. */
export function serializeMeasureDoc(doc: MeasureDoc): string {
    const text = JSON.stringify(sanitizeMeasureDoc(doc, doc.kind));
    if (utf8Length(text) > MEASURE_MAX_BYTES) throw new Error('Too many measurements on this plan to save. Delete some, or split the plan.');
    return text;
}

export const utf8Length = (s: string): number => {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
        else n += 3;
    }
    return n;
};

/** Last write wins: the saved copy gets a version above both the local and the remote one, and the current time. */
export function stampForSave(doc: MeasureDoc, remote?: Pick<MeasureDoc, 'version'> | null, now: Date = new Date()): MeasureDoc {
    const base = Math.max(doc.version || 0, remote?.version || 0);
    return { ...doc, version: base + 1, updatedAt: now.toISOString() };
}

/** Has anything been measured or calibrated? (an empty doc is not worth saving) */
export const hasContent = (doc: MeasureDoc): boolean =>
    doc.labels.length > 0 || Object.values(doc.pages).some(p => p.items.length > 0 || !!p.scale);
