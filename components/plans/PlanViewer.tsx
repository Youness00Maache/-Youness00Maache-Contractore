/**
 * Plans (roadmap N9): the full-screen measuring view of one plan (phone first).
 *
 *   top:     close · title · page switcher · save state
 *   tools:   Move | Line | Area | Count | Scale (a segmented control) + the page's scale
 *   canvas:  the page bitmap (pdf.js / image, capped) + the measurements; pinch / wheel zoom, drag / two-finger pan
 *   bottom:  label · cut-out · undo / redo · done / delete · zoom · Totals (a bottom sheet with labels, totals,
 *            Add to estimate, downloads)
 *
 * Measurements are stored in page units with the page's scale (lib/plans/*); they are saved next to the plan in
 * storage a moment after each change (last write wins). Keyboard: Esc cancel, Enter finish, Ctrl+Z / Ctrl+Y.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SavedItem } from '../../types.ts';
import { defaultUnitSystem, formatQty, rememberMeasurement, type UnitSystem } from '../../lib/measure.ts';
import { activeUserIdNow, browserStore, loadMeasureUnits, readMeasureUnitsLocal } from '../../lib/userData.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { COMMON_SCALES, dist, distToSegment, isDegeneratePolygon, nearestVertex, pointInPolygon, polygonArea, polylineLength, presetScale, scaleFromPoints, areaIn, areaM2, lengthIn, lengthM, type Pt } from '../../lib/plans/geometry.ts';
import { parseKnownLength, scaleLabel, type PageScale } from '../../lib/plans/calibration.ts';
import { LABELS_MAX, LABEL_COLORS, POINTS_PER_ITEM_MAX, ITEMS_PER_PAGE_MAX, blankMeasureDoc, hasContent, newItem, newLabel, type ItemTool, type MeasureDoc, type PlanItem, type PlanPage } from '../../lib/plans/schema.ts';
import { buildEstimateLine, estimateSeed, kindsOf, labelTotals, matchPriceItems, quantityFor, quickMeasureState, totalsCsv, wasteOf, type LabelTotal, type QuantityKind } from '../../lib/plans/totals.ts';
import type { PlanEntry } from '../../lib/plans/planFiles.ts';
import { downloadPlan, loadMeasurements, saveMeasurements } from '../../lib/plans/plansApi.ts';
import { formatMoney } from '../../utils/money.ts';
import { toast } from '../Toast.tsx';
import { cx } from '../commsKit.tsx';
import ItemPickerModal from '../forms/ItemPickerModal.tsx';
import { drawDraft, drawItems, drawLegend, fmtArea, fmtLength, legendHeight, toPage, toScreen, type View } from './planDraw.ts';
import { cappedScale, isCancelled, openPlanSource, type PageSize, type PlanSource } from './planRender.ts';

type Tool = 'move' | ItemTool | 'scale';
type SaveState = 'saved' | 'dirty' | 'saving' | 'offline' | 'error' | 'readonly';

export interface DraftEstimateRef { id: string; title: string }

interface PlanViewerProps {
    plan: PlanEntry;
    canEdit: boolean;
    isOnline: boolean;
    savedItems: SavedItem[];
    draftEstimates: DraftEstimateRef[];
    jobId: string;
    onClose: () => void;
    /** the plan got (or changed) its measurement file */
    onSaved: (plan: PlanEntry) => void;
    onNewEstimate: (seed: Record<string, unknown>) => void;
    onOpenEstimate: (id: string) => void;
    onUpgrade: () => void;
}

const TOOLS: Array<{ id: Tool; label: string }> = [
    { id: 'move', label: 'Move' },
    { id: 'line', label: 'Line' },
    { id: 'area', label: 'Area' },
    { id: 'count', label: 'Count' },
    { id: 'scale', label: 'Scale' },
];
const DEFAULT_NAME: Record<ItemTool, string> = { line: 'Length', area: 'Area', count: 'Count' };
const SUGGESTED = ['Drywall', 'Flooring', 'Paint', 'Baseboard', 'Roofing', 'Outlets', 'Lights'];
const HISTORY_MAX = 60;
const SAVE_DELAY = 1200;
const MIN_Z = 0.02;
const MAX_Z = 40;

const systemNow = (): UnitSystem =>
    readMeasureUnitsLocal(activeUserIdNow()) || defaultUnitSystem(typeof navigator !== 'undefined' ? navigator.language : 'en-US');

const pageOf = (doc: MeasureDoc, n: number): PlanPage => doc.pages[String(n)] || { items: [] };
const withPage = (doc: MeasureDoc, n: number, page: PlanPage): MeasureDoc => ({ ...doc, pages: { ...doc.pages, [String(n)]: page } });

function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'plan';
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

const PlanViewer: React.FC<PlanViewerProps> = ({
    plan, canEdit, isOnline, savedItems, draftEstimates, jobId, onClose, onSaved, onNewEstimate, onOpenEstimate, onUpgrade,
}) => {
    const [system, setSystem] = useState<UnitSystem>(systemNow);
    const [source, setSource] = useState<PlanSource | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [doc, setDoc] = useState<MeasureDoc>(() => blankMeasureDoc(plan.kind));
    const [docReady, setDocReady] = useState(false);
    const [readOnlyDoc, setReadOnlyDoc] = useState(false);
    const [past, setPast] = useState<MeasureDoc[]>([]);
    const [future, setFuture] = useState<MeasureDoc[]>([]);
    const [pageNo, setPageNo] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize | null>(null);
    const [tool, setTool] = useState<Tool>('move');
    const [subtract, setSubtract] = useState(false);
    const [activeLabel, setActiveLabel] = useState<string | null>(null);
    const [draft, setDraft] = useState<Pt[]>([]);
    const [hover, setHover] = useState<Pt | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [sheet, setSheet] = useState<null | 'totals' | 'labels' | 'send' | 'scale'>(null);
    const [calibration, setCalibration] = useState<[Pt, Pt] | null>(null);
    const [saveState, setSaveState] = useState<SaveState>('saved');
    const [busy, setBusy] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    const editable = canEdit && !readOnlyDoc;
    const page = pageOf(doc, pageNo);
    const scale = page.scale || null;
    const scaleKnown = !!scale && scale.mPerU > 0;
    const labelById = useMemo(() => new Map(doc.labels.map(l => [l.id, l])), [doc.labels]);
    const current = activeLabel ? labelById.get(activeLabel) || null : null;

    // ------------------------------------------------------------------------------------------- refs for the canvas
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewRef = useRef<View>({ z: 1, ox: 0, oy: 0 });
    const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
    const bitmapRef = useRef<{ canvas: HTMLCanvasElement; scale: number; page: number } | null>(null);
    const fittedRef = useRef<number | null>(null);
    const stateRef = useRef({ doc, page, draft, hover, selectedId, tool, labelById, scaleKnown, system, subtract, current, pageNo });
    stateRef.current = { doc, page, draft, hover, selectedId, tool, labelById, scaleKnown, system, subtract, current, pageNo };
    const rafRef = useRef(0);

    // ------------------------------------------------------------------------------------------- load
    useEffect(() => {
        let alive = true;
        let src: PlanSource | null = null;
        void (async () => {
            try {
                const [blob, measured] = await Promise.all([downloadPlan(plan), loadMeasurements(plan)]);
                if (!alive) return;
                src = await openPlanSource(plan.kind, blob);
                if (!alive) { src.destroy(); return; }
                const d = { ...measured.doc, kind: plan.kind, pageCount: src.pageCount };
                setDoc(d);
                setReadOnlyDoc(measured.readOnly);
                if (measured.problem) toast.info(measured.problem);
                setActiveLabel(d.labels[0]?.id ?? null);
                setSource(src);
                setDocReady(true);
                setSaveState(measured.readOnly || !canEdit ? 'readonly' : 'saved');
                if (src.totalPages > src.pageCount) toast.info(`Only the first ${src.pageCount} pages of this PDF can be measured.`);
            } catch (e) {
                if (alive) setLoadError(e instanceof Error ? e.message : 'The plan could not be opened.');
            }
        })();
        void loadMeasureUnits().then(sys => { if (alive && sys) setSystem(sys); }).catch(() => undefined);
        return () => { alive = false; src?.destroy(); };
    }, [plan.path]); // eslint-disable-line react-hooks/exhaustive-deps

    // body scroll lock while open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    // ------------------------------------------------------------------------------------------- drawing
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { w, h, dpr } = sizeRef.current;
        const v = viewRef.current;
        const s = stateRef.current;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w * dpr, h * dpr);
        const bmp = bitmapRef.current;
        const dv: View = { z: v.z * dpr, ox: v.ox * dpr, oy: v.oy * dpr };
        if (bmp && bmp.page === s.pageNo && pageSize) {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.18)';
            ctx.shadowBlur = 12 * dpr;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(dv.ox, dv.oy, pageSize.w * dv.z, pageSize.h * dv.z);
            ctx.restore();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bmp.canvas, dv.ox, dv.oy, pageSize.w * dv.z, pageSize.h * dv.z);
        }
        drawItems(ctx, { view: dv, unit: dpr, labels: s.doc.labels, system: s.system, scaleKnown: s.scaleKnown, page: s.page, selectedId: s.selectedId });
        if (s.draft.length || (s.hover && s.tool !== 'move')) {
            const color = s.tool === 'scale' ? '#111827' : s.current?.color || LABEL_COLORS[s.doc.labels.length % LABEL_COLORS.length];
            const pts = s.draft;
            const hv = s.tool === 'count' || s.tool === 'move' ? null : s.hover;
            const all = hv ? [...pts, hv] : pts;
            let text: string | null = null;
            const k = s.page.scale?.mPerU;
            if (s.tool === 'line' && k && all.length > 1) text = fmtLength(lengthIn(lengthM(polylineLength(all), k), s.system), s.system);
            if (s.tool === 'area' && k && all.length > 2) text = `${s.subtract ? '− ' : ''}${fmtArea(areaIn(areaM2(polygonArea(all), k), s.system), s.system)}`;
            const firstHot = s.tool === 'area' && pts.length >= 3 && !!s.hover && dist(toScreen(pts[0], v), toScreen(s.hover, v)) < 18;
            if (pts.length || s.tool !== 'count') drawDraft(ctx, pts, hv && pts.length ? hv : null, { view: dv, unit: dpr, color, closed: s.tool === 'area', text, firstHot });
        }
    }, [pageSize]);

    const schedule = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(draw);
    }, [draw]);
    useEffect(() => { schedule(); }, [schedule, doc, draft, hover, selectedId, tool, pageNo, tick, system, subtract, activeLabel]);
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const fit = useCallback(() => {
        const { w, h } = sizeRef.current;
        if (!pageSize || !w || !h) return;
        const pad = 12;
        const z = Math.min((w - pad * 2) / pageSize.w, MAX_Z);
        const shown = pageSize.h * z;
        viewRef.current = { z, ox: (w - pageSize.w * z) / 2, oy: shown + pad * 2 < h ? (h - shown) / 2 : pad };
        setTick(t => t + 1);
    }, [pageSize]);

    // canvas size follows its box
    useEffect(() => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return;
        const apply = () => {
            const r = wrap.getBoundingClientRect();
            const dpr = Math.min(3, window.devicePixelRatio || 1);
            sizeRef.current = { w: r.width, h: r.height, dpr };
            canvas.width = Math.max(1, Math.round(r.width * dpr));
            canvas.height = Math.max(1, Math.round(r.height * dpr));
            canvas.style.width = `${r.width}px`;
            canvas.style.height = `${r.height}px`;
            if (fittedRef.current !== pageNo) { fit(); if (pageSize) fittedRef.current = pageNo; }
            schedule();
        };
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(wrap);
        return () => ro.disconnect();
    }, [fit, schedule, pageNo, pageSize]);

    // page size, then a bitmap for the page
    useEffect(() => {
        if (!source) return;
        let alive = true;
        bitmapRef.current = null;
        setPageSize(null);
        fittedRef.current = null;
        void source.pageSize(pageNo).then(size => { if (alive) setPageSize(size); }).catch(() => undefined);
        return () => { alive = false; };
    }, [source, pageNo]);

    const renderGen = useRef(0);
    const ensureBitmap = useCallback(async (force = false) => {
        if (!source || !pageSize) return;
        const { dpr } = sizeRef.current;
        const wanted = cappedScale(pageSize.w, pageSize.h, Math.max(0.5, viewRef.current.z * dpr * 1.25));
        const have = bitmapRef.current;
        if (!force && have && have.page === pageNo && have.scale >= wanted * 0.8) return;
        const gen = ++renderGen.current;
        try {
            const canvas = await source.render(pageNo, wanted);
            if (gen !== renderGen.current) return;
            bitmapRef.current = { canvas, scale: canvas.width / pageSize.w, page: pageNo };
            setTick(t => t + 1);
        } catch (e) {
            if (!isCancelled(e) && gen === renderGen.current) setLoadError(e instanceof Error ? e.message : 'This page could not be drawn.');
        }
    }, [source, pageSize, pageNo]);
    useEffect(() => { if (pageSize) { fit(); fittedRef.current = pageNo; void ensureBitmap(true); } }, [pageSize]); // eslint-disable-line react-hooks/exhaustive-deps
    // sharper bitmap after zooming in (debounced)
    const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const afterZoom = useCallback(() => {
        if (zoomTimer.current) clearTimeout(zoomTimer.current);
        zoomTimer.current = setTimeout(() => { void ensureBitmap(); }, 250);
    }, [ensureBitmap]);
    useEffect(() => () => { if (zoomTimer.current) clearTimeout(zoomTimer.current); }, []);

    const zoomAt = useCallback((factor: number, cx0?: number, cy0?: number) => {
        const v = viewRef.current;
        const { w, h } = sizeRef.current;
        const x = cx0 ?? w / 2;
        const y = cy0 ?? h / 2;
        const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * factor));
        const f = z / v.z;
        viewRef.current = { z, ox: x - (x - v.ox) * f, oy: y - (y - v.oy) * f };
        setTick(t => t + 1);
        afterZoom();
    }, [afterZoom]);

    // ------------------------------------------------------------------------------------------- doc edits
    const historyRef = useRef({ past, future });
    historyRef.current = { past, future };
    const markDirty = () => setSaveState(s => (s === 'readonly' ? s : 'dirty'));
    const commit = useCallback((next: MeasureDoc) => {
        setPast([...historyRef.current.past.slice(-(HISTORY_MAX - 1)), stateRef.current.doc]);
        setFuture([]);
        setDoc(next);
        markDirty();
    }, []);

    const undo = useCallback(() => {
        if (stateRef.current.draft.length) { setDraft(d => d.slice(0, -1)); return; }
        const { past: p, future: f } = historyRef.current;
        if (!p.length) return;
        setFuture([stateRef.current.doc, ...f].slice(0, HISTORY_MAX));
        setDoc(p[p.length - 1]);
        setPast(p.slice(0, -1));
        setSelectedId(null);
        markDirty();
    }, []);
    const redo = useCallback(() => {
        const { past: p, future: f } = historyRef.current;
        if (!f.length) return;
        setPast([...p, stateRef.current.doc].slice(-HISTORY_MAX));
        setDoc(f[0]);
        setFuture(f.slice(1));
        setSelectedId(null);
        markDirty();
    }, []);

    /** The label new items go to (created on first use: "Area", "Length", "Count"). */
    const labelFor = (t: ItemTool, base: MeasureDoc): { doc: MeasureDoc; id: string } | null => {
        const cur = stateRef.current.current;
        if (cur && base.labels.some(l => l.id === cur.id)) return { doc: base, id: cur.id };
        if (base.labels.length >= LABELS_MAX) return null;
        const existing = base.labels.find(l => l.name === DEFAULT_NAME[t]);
        if (existing) { setActiveLabel(existing.id); return { doc: base, id: existing.id }; }
        const label = newLabel(DEFAULT_NAME[t], base.labels.length);
        setActiveLabel(label.id);
        return { doc: { ...base, labels: [...base.labels, label] }, id: label.id };
    };

    const finishDraft = useCallback(() => {
        const s = stateRef.current;
        const t = s.tool;
        if (t !== 'line' && t !== 'area') return;
        const pts = s.draft;
        if (t === 'line' && pts.length < 2) return;
        if (t === 'area' && (pts.length < 3 || isDegeneratePolygon(pts))) { toast.info('An area needs at least 3 points.'); return; }
        if (s.page.items.length >= ITEMS_PER_PAGE_MAX) { toast.error('This page has the most measurements it can hold.'); return; }
        const got = labelFor(t, s.doc);
        if (!got) { toast.error('Too many labels. Delete one first.'); return; }
        const item = newItem(t, got.id, pts, t === 'area' && s.subtract);
        const pg = pageOf(got.doc, s.pageNo);
        commit(withPage(got.doc, s.pageNo, { ...pg, items: [...pg.items, item] }));
        setDraft([]);
        setSelectedId(null);
    }, [commit]); // eslint-disable-line react-hooks/exhaustive-deps

    const deleteSelected = useCallback(() => {
        const s = stateRef.current;
        if (!s.selectedId) return;
        commit(withPage(s.doc, s.pageNo, { ...s.page, items: s.page.items.filter(i => i.id !== s.selectedId) }));
        setSelectedId(null);
    }, [commit]);

    const setPageScale = (next: PageScale | null) => {
        const s = stateRef.current;
        commit(withPage(s.doc, s.pageNo, { ...s.page, scale: next }));
    };

    // ------------------------------------------------------------------------------------------- taps
    const hitItem = (p: Pt, radius: number): PlanItem | null => {
        const s = stateRef.current;
        const items = [...s.page.items].reverse().filter(i => !s.labelById.get(i.label)?.hidden);
        for (const it of items) {
            if (it.tool === 'count' && nearestVertex(it.pts, p, radius) >= 0) return it;
            if (it.tool === 'line') for (let i = 1; i < it.pts.length; i++) if (distToSegment(p, it.pts[i - 1], it.pts[i]) <= radius) return it;
        }
        for (const it of items) if (it.tool === 'area' && (pointInPolygon(p, it.pts) || nearestVertex(it.pts, p, radius) >= 0)) return it;
        return null;
    };

    const snap = (p: Pt, radius: number, exclude?: { id: string; idx: number }): Pt => {
        const s = stateRef.current;
        let best: Pt | null = null;
        let bestD = radius;
        const consider = (q: Pt) => { const d = dist(p, q); if (d <= bestD) { best = q; bestD = d; } };
        for (const it of s.page.items) {
            if (it.tool === 'count' || s.labelById.get(it.label)?.hidden) continue;
            it.pts.forEach((q, i) => { if (!(exclude && exclude.id === it.id && exclude.idx === i)) consider(q); });
        }
        s.draft.forEach(consider);
        return best ? [best[0], best[1]] : p;
    };

    const tap = (sx: number, sy: number, touch: boolean) => {
        const s = stateRef.current;
        const v = viewRef.current;
        const radius = (touch ? 22 : 12) / v.z;
        const raw = toPage([sx, sy], v);
        if (s.tool === 'move') {
            setSelectedId(hitItem(raw, radius)?.id ?? null);
            return;
        }
        if (!editable) { if (!canEdit) onUpgrade(); return; }
        if (s.tool === 'scale') {
            const p = snap(raw, radius);
            const next = [...s.draft, p];
            if (next.length >= 2) { setDraft([]); setCalibration([next[0], next[1]]); setSheet('scale'); }
            else setDraft(next);
            return;
        }
        if (s.tool === 'count') {
            if (s.page.items.length >= ITEMS_PER_PAGE_MAX) { toast.error('This page has the most measurements it can hold.'); return; }
            const got = labelFor('count', s.doc);
            if (!got) { toast.error('Too many labels. Delete one first.'); return; }
            const pg = pageOf(got.doc, s.pageNo);
            const existing = pg.items.find(i => i.tool === 'count' && i.label === got.id && i.pts.length < POINTS_PER_ITEM_MAX);
            const items = existing
                ? pg.items.map(i => (i === existing ? { ...i, pts: [...i.pts, raw] } : i))
                : [...pg.items, newItem('count', got.id, [raw])];
            commit(withPage(got.doc, s.pageNo, { ...pg, items }));
            return;
        }
        if (!s.scaleKnown) { toast.info('Set the scale of this page first: tap Scale, then two ends of a length you know.'); return; }
        const p = snap(raw, radius);
        if (s.tool === 'area' && s.draft.length >= 3 && dist(p, s.draft[0]) <= radius) { finishDraft(); return; }
        if (s.tool === 'line' && s.draft.length >= 2 && dist(p, s.draft[s.draft.length - 1]) <= radius) { finishDraft(); return; }
        if (s.draft.length >= POINTS_PER_ITEM_MAX) return;
        setDraft([...s.draft, p]);
    };

    // ------------------------------------------------------------------------------------------- pointers
    const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
    const gesture = useRef<null | {
        kind: 'one'; x0: number; y0: number; view: View; moved: boolean; touch: boolean;
        drag: null | { type: 'draft'; idx: number } | { type: 'item'; id: string; idx: number; started: boolean };
    } | { kind: 'pinch'; d0: number; mx: number; my: number; view: View }>(null);

    const local = (e: React.PointerEvent | PointerEvent | WheelEvent) => {
        const r = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = local(e);
        pointers.current.set(e.pointerId, { ...p, type: e.pointerType });
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: { ...viewRef.current } };
            return;
        }
        if (pointers.current.size > 2) return;
        const s = stateRef.current;
        const v = viewRef.current;
        const touch = e.pointerType !== 'mouse';
        const radius = (touch ? 22 : 12) / v.z;
        const at = toPage([p.x, p.y], v);
        let drag: null | { type: 'draft'; idx: number } | { type: 'item'; id: string; idx: number; started: boolean } = null;
        if (editable && s.draft.length && (s.tool === 'line' || s.tool === 'area')) {
            const i = nearestVertex(s.draft, at, radius);
            // the first point of an area closes it on a tap; it is still draggable
            if (i >= 0) drag = { type: 'draft', idx: i };
        }
        if (!drag && editable && s.selectedId) {
            const item = s.page.items.find(it => it.id === s.selectedId);
            if (item) {
                const i = nearestVertex(item.pts, at, radius);
                if (i >= 0) drag = { type: 'item', id: item.id, idx: i, started: false };
            }
        }
        gesture.current = { kind: 'one', x0: p.x, y0: p.y, view: { ...v }, moved: false, touch, drag };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const p = local(e);
        if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { ...p, type: e.pointerType });
        const g = gesture.current;
        const s = stateRef.current;
        if (!g) {
            if (e.pointerType === 'mouse' && s.tool !== 'move') setHover(toPage([p.x, p.y], viewRef.current));
            return;
        }
        if (g.kind === 'pinch') {
            const pts = [...pointers.current.values()];
            if (pts.length < 2) return;
            const [a, b] = pts;
            const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const z = Math.min(MAX_Z, Math.max(MIN_Z, g.view.z * (d / g.d0)));
            const f = z / g.view.z;
            viewRef.current = { z, ox: mx - (g.mx - g.view.ox) * f, oy: my - (g.my - g.view.oy) * f };
            setTick(t => t + 1);
            afterZoom();
            return;
        }
        const dx = p.x - g.x0;
        const dy = p.y - g.y0;
        if (!g.moved && Math.hypot(dx, dy) > (g.touch ? 8 : 4)) g.moved = true;
        if (!g.moved) return;
        const v = viewRef.current;
        if (g.drag) {
            const radius = (g.touch ? 16 : 10) / v.z;
            if (g.drag.type === 'draft') {
                const idx = g.drag.idx;
                const at = snap(toPage([p.x, p.y], v), radius);
                setDraft(d => d.map((q, i) => (i === idx ? at : q)));
            } else {
                const drag = g.drag;
                const at = snap(toPage([p.x, p.y], v), radius, { id: drag.id, idx: drag.idx });
                const move = (docIn: MeasureDoc) => {
                    const pg = pageOf(docIn, s.pageNo);
                    return withPage(docIn, s.pageNo, { ...pg, items: pg.items.map(it => (it.id === drag.id ? { ...it, pts: it.pts.map((q, i) => (i === drag.idx ? at : q)) } : it)) });
                };
                if (!drag.started) { drag.started = true; commit(move(s.doc)); }
                else { setDoc(d => move(d)); }
            }
            return;
        }
        viewRef.current = { z: g.view.z, ox: g.view.ox + dx, oy: g.view.oy + dy };
        setTick(t => t + 1);
        if (e.pointerType === 'mouse' && s.tool !== 'move') setHover(toPage([p.x, p.y], viewRef.current));
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const g = gesture.current;
        const p = local(e);
        pointers.current.delete(e.pointerId);
        if (g?.kind === 'pinch') {
            // keep panning with the finger left on the screen
            const rest = [...pointers.current.values()][0];
            gesture.current = rest ? { kind: 'one', x0: rest.x, y0: rest.y, view: { ...viewRef.current }, moved: true, touch: true, drag: null } : null;
            return;
        }
        gesture.current = null;
        if (g && g.kind === 'one' && !g.moved && e.type === 'pointerup') tap(p.x, p.y, g.touch);
    };

    const onWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const r = canvasRef.current!.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
            const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
            zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
        } else {
            const v = viewRef.current;
            viewRef.current = { ...v, ox: v.ox - e.deltaX, oy: v.oy - e.deltaY };
            setTick(t => t + 1);
        }
    }, [zoomAt]);
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        c.addEventListener('wheel', onWheel, { passive: false });
        return () => c.removeEventListener('wheel', onWheel);
    }, [onWheel]);

    // ------------------------------------------------------------------------------------------- keyboard
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isTyping(e.target)) return;
            const s = stateRef.current;
            if (e.key === 'Escape') {
                if (sheet) { setSheet(null); setCalibration(null); }
                else if (s.draft.length) setDraft([]);
                else if (s.selectedId) setSelectedId(null);
                else return;
                e.preventDefault();
            } else if (e.key === 'Enter') {
                if (!sheet && s.draft.length) { e.preventDefault(); finishDraft(); }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (!editable) return;
                if (e.shiftKey) redo(); else undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                if (editable) redo();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId && editable && !sheet) {
                e.preventDefault();
                deleteSelected();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [sheet, editable, finishDraft, undo, redo, deleteSelected]);

    // ------------------------------------------------------------------------------------------- saving
    const docRef = useRef(doc);
    docRef.current = doc;
    const savingRef = useRef<Promise<boolean> | null>(null);
    const planRef = useRef(plan);
    planRef.current = plan;
    const saveNow = useCallback(async (): Promise<boolean> => {
        if (!editable || !docReady) return true;
        if (savingRef.current) await savingRef.current;
        const snapshot = docRef.current;
        if (!hasContent(snapshot) && !planRef.current.measurePath) { setSaveState('saved'); return true; }
        if (!navigator.onLine) { setSaveState('offline'); return false; }
        setSaveState('saving');
        const run = (async () => {
            try {
                const res = await saveMeasurements(planRef.current, snapshot);
                // keep later edits; only the version / time come from the save
                setDoc(d => (d === snapshot ? res.doc : { ...d, version: res.doc.version, updatedAt: res.doc.updatedAt }));
                if (docRef.current === snapshot) setSaveState('saved');
                else setSaveState('dirty');
                if (planRef.current.measurePath !== res.measurePath || !planRef.current.measuredAt) {
                    onSaved({ ...planRef.current, measurePath: res.measurePath, measuredAt: res.doc.updatedAt });
                }
                return true;
            } catch (e) {
                const msg = e instanceof Error ? e.message : '';
                setSaveState(msg === NEEDS_CONNECTION ? 'offline' : 'error');
                if (msg && msg !== NEEDS_CONNECTION) toast.error(msg);
                return false;
            } finally {
                savingRef.current = null;
            }
        })();
        savingRef.current = run;
        return run;
    }, [editable, docReady, onSaved]);

    useEffect(() => {
        if (saveState !== 'dirty') return;
        const t = setTimeout(() => { void saveNow(); }, SAVE_DELAY);
        return () => clearTimeout(t);
    }, [doc, saveState, saveNow]);
    // back online: save what waited
    useEffect(() => { if (isOnline && saveState === 'offline') void saveNow(); }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

    const close = async () => {
        if (saveState === 'dirty' || saveState === 'saving') {
            setBusy('Saving…');
            const ok = await saveNow();
            setBusy(null);
            if (!ok && !window.confirm('Your latest measurements are not saved yet (no connection). Close anyway?')) return;
        } else if (saveState === 'offline' && !window.confirm('Your latest measurements are not saved yet (no connection). Close anyway?')) {
            return;
        }
        onClose();
    };

    // ------------------------------------------------------------------------------------------- totals + exports
    const [totalsScope, setTotalsScope] = useState<'page' | 'all'>('all');
    const totals = useMemo(() => labelTotals(doc, system, totalsScope === 'page' ? [pageNo] : undefined), [doc, system, totalsScope, pageNo]);
    const unscaledCount = totals.reduce((n, t) => n + t.unscaled, 0);

    const exportPng = async () => {
        if (!source || !pageSize) return;
        setBusy('Preparing the image…');
        try {
            const wanted = source.kind === 'pdf' ? 2.5 : 1;
            const bmp = await source.render(pageNo, cappedScale(pageSize.w, pageSize.h, wanted, 16_000_000, 6000));
            const s = bmp.width / pageSize.w;
            const unit = Math.max(1, bmp.width / 1100);
            const rows = labelTotals(doc, system, [pageNo]);
            const legend = legendHeight(rows, unit);
            const out = document.createElement('canvas');
            out.width = bmp.width;
            out.height = bmp.height + legend;
            const ctx = out.getContext('2d');
            if (!ctx) throw new Error('This device could not make the image.');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.drawImage(bmp, 0, 0);
            drawItems(ctx, { view: { z: s, ox: 0, oy: 0 }, unit, labels: doc.labels, system, scaleKnown, page, selectedId: null });
            ctx.fillStyle = '#d1d5db';
            ctx.fillRect(0, bmp.height, out.width, Math.max(1, unit));
            drawLegend(ctx, rows, {
                x: 0, y: bmp.height + unit, width: out.width, unit, system,
                title: `${plan.title}${doc.pageCount > 1 ? ` · page ${pageNo}` : ''}`, scaleText: `Scale: ${scaleLabel(scale, plan.kind, system)}`,
            });
            const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('This device could not make the image.');
            saveBlob(blob, `${fileSafe(plan.title)}${doc.pageCount > 1 ? `-p${pageNo}` : ''}-measured.png`);
        } catch (e) {
            if (!isCancelled(e)) toast.error(e instanceof Error ? e.message : 'The image could not be made.');
        } finally {
            setBusy(null);
            void ensureBitmap(true);
        }
    };

    const exportCsv = () => {
        const csv = totalsCsv(labelTotals(doc, system), system);
        saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileSafe(plan.title)}-totals.csv`);
    };

    // ------------------------------------------------------------------------------------------- labels
    const updateLabel = (id: string, patch: Partial<MeasureDoc['labels'][number]>) =>
        commit({ ...doc, labels: doc.labels.map(l => (l.id === id ? { ...l, ...patch } : l)) });
    const addLabel = (name: string) => {
        const clean = name.trim();
        if (!clean) return;
        const same = doc.labels.find(l => l.name.toLowerCase() === clean.toLowerCase());
        if (same) { setActiveLabel(same.id); return; }
        if (doc.labels.length >= LABELS_MAX) { toast.error('Too many labels. Delete one first.'); return; }
        const label = newLabel(clean, doc.labels.length);
        commit({ ...doc, labels: [...doc.labels, label] });
        setActiveLabel(label.id);
    };
    const removeLabel = (id: string) => {
        const used = Object.values(doc.pages).reduce((n, p) => n + p.items.filter(i => i.label === id).length, 0);
        if (used && !window.confirm(`Delete this label and its ${used} measurement${used === 1 ? '' : 's'}?`)) return;
        const pages: MeasureDoc['pages'] = {};
        for (const [k, p] of Object.entries(doc.pages)) pages[k] = { ...p, items: p.items.filter(i => i.label !== id) };
        commit({ ...doc, labels: doc.labels.filter(l => l.id !== id), pages });
        if (activeLabel === id) setActiveLabel(doc.labels.find(l => l.id !== id)?.id ?? null);
    };

    // ------------------------------------------------------------------------------------------- render
    const hint = !scaleKnown && (tool === 'line' || tool === 'area')
        ? 'Set the scale first: tap Scale, then the two ends of a length you know.'
        : tool === 'scale' ? (draft.length ? 'Now tap the other end.' : 'Tap one end of a length you know (a dimension line, a door).')
            : tool === 'line' ? (draft.length ? 'Tap to add points. Tap the last point again or Done to finish.' : 'Tap where the line starts.')
                : tool === 'area' ? (draft.length >= 3 ? 'Tap the first point (or Done) to close the area.' : `Tap the corners${subtract ? ' of the cut-out' : ''}.`)
                    : tool === 'count' ? 'Tap each item to drop a numbered marker.' : selectedId ? 'Drag a corner to move it, or Delete.' : 'Drag to move around. Tap a measurement to select it.';

    const selectedItem = selectedId ? page.items.find(i => i.id === selectedId) || null : null;
    const saveText: Record<SaveState, string> = { saved: 'Saved', dirty: 'Unsaved', saving: 'Saving…', offline: 'Offline: not saved', error: 'Not saved', readonly: 'View only' };

    const body = (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label={`Plan: ${plan.title}`}>
            {/* top bar */}
            <div className="flex min-h-[48px] items-center gap-2 border-b border-border px-2 pt-[env(safe-area-inset-top)] sm:px-3">
                <button type="button" className="inline-flex h-10 items-center rounded-lg px-2.5 text-sm font-semibold hover:bg-muted" onClick={() => { void close(); }}>
                    <span aria-hidden className="mr-1 text-lg leading-none">‹</span> Back
                </button>
                <p className="min-w-0 flex-1 truncate text-sm font-bold">{plan.title}</p>
                {doc.pageCount > 1 && (
                    <div className="flex items-center rounded-lg border border-border" role="group" aria-label="Page">
                        <button type="button" className="h-9 w-9 text-lg disabled:opacity-30" disabled={pageNo <= 1} onClick={() => { setDraft([]); setSelectedId(null); setPageNo(n => n - 1); }} aria-label="Previous page">‹</button>
                        <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums">{pageNo} / {doc.pageCount}</span>
                        <button type="button" className="h-9 w-9 text-lg disabled:opacity-30" disabled={pageNo >= doc.pageCount} onClick={() => { setDraft([]); setSelectedId(null); setPageNo(n => n + 1); }} aria-label="Next page">›</button>
                    </div>
                )}
                <span className={cx('hidden text-xs font-medium sm:inline', saveState === 'error' || saveState === 'offline' ? 'text-destructive' : 'text-muted-foreground')} role="status">{saveText[saveState]}</span>
            </div>

            {/* tools */}
            <div className="flex items-center gap-2 border-b border-border px-2 py-1.5 sm:px-3">
                <div className="flex min-w-0 flex-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Tool">
                    {TOOLS.map(tl => (
                        <button
                            key={tl.id}
                            type="button"
                            role="radio"
                            aria-checked={tool === tl.id}
                            onClick={() => { setTool(tl.id); setDraft([]); setHover(null); if (tl.id !== 'move') setSelectedId(null); }}
                            className={cx('min-h-[36px] flex-1 rounded-lg px-1 text-xs font-semibold transition-colors sm:text-sm',
                                tool === tl.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                (tl.id === 'line' || tl.id === 'area') && !scaleKnown && 'opacity-60')}
                        >
                            {tl.label}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={() => { setCalibration(null); setSheet('scale'); }}
                    className={cx('h-10 shrink-0 rounded-lg border px-2.5 text-xs font-semibold tabular-nums', scaleKnown ? 'border-border' : 'border-warning/60 bg-warning/10')}
                    title="Scale of this page">
                    {scaleLabel(scale, plan.kind, system)}
                </button>
            </div>

            {/* canvas */}
            <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#d9dde3] dark:bg-[#1f2329]">
                <canvas
                    ref={canvasRef}
                    className={cx('block touch-none select-none', tool === 'move' ? 'cursor-grab' : 'cursor-crosshair')}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}
                    aria-label="Plan page"
                />
                <p className="pointer-events-none absolute left-2 right-2 top-2 mx-auto w-fit max-w-full rounded-lg bg-background/90 px-2.5 py-1.5 text-center text-xs font-medium shadow-sm">
                    {loadError || (!docReady ? 'Opening the plan…' : !editable && tool !== 'move' ? (canEdit ? 'These measurements can only be viewed here.' : 'Measuring plans is part of Premium.') : hint)}
                </p>
                <div className="absolute bottom-2 right-2 flex flex-col overflow-hidden rounded-lg border border-border bg-background/95 shadow-sm">
                    <button type="button" className="h-10 w-10 text-lg font-semibold hover:bg-muted" onClick={() => zoomAt(1.4)} aria-label="Zoom in">+</button>
                    <button type="button" className="h-10 w-10 border-y border-border text-lg font-semibold hover:bg-muted" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out">−</button>
                    <button type="button" className="h-10 w-10 text-[10px] font-bold uppercase tracking-wide hover:bg-muted" onClick={() => { fit(); afterZoom(); }} aria-label="Fit to width">Fit</button>
                </div>
                {busy && <div className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background" role="status">{busy}</div>}
            </div>

            {/* bottom bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:px-3">
                <button type="button" onClick={() => setSheet('labels')} className="inline-flex h-10 min-w-0 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold" title="Label for new measurements">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: current?.color || '#9ca3af' }} aria-hidden />
                    <span className="truncate">{current?.name || 'Label'}</span>
                    <span aria-hidden className="text-muted-foreground">▾</span>
                </button>
                {tool === 'area' && (
                    <button type="button" aria-pressed={subtract} onClick={() => { setSubtract(v => !v); setDraft([]); }}
                        className={cx('h-10 shrink-0 rounded-lg px-2.5 text-xs font-semibold', subtract ? 'bg-foreground text-background' : 'border border-border')}
                        title="Draw a cut-out (taken away from the label's area)">
                        Cut-out
                    </button>
                )}
                <button type="button" className="h-10 shrink-0 rounded-lg border border-border px-2.5 text-xs font-semibold disabled:opacity-40" onClick={undo} disabled={!editable || (!past.length && !draft.length)} title="Undo (Ctrl+Z)">Undo</button>
                <button type="button" className="h-10 shrink-0 rounded-lg border border-border px-2.5 text-xs font-semibold disabled:opacity-40" onClick={redo} disabled={!editable || !future.length} title="Redo (Ctrl+Y)">Redo</button>
                {draft.length > 0 && (tool === 'line' || tool === 'area') && (
                    <button type="button" className="h-10 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground" onClick={finishDraft}>Done</button>
                )}
                {draft.length > 0 && <button type="button" className="h-10 shrink-0 rounded-lg px-2 text-xs font-semibold text-muted-foreground" onClick={() => setDraft([])}>Cancel</button>}
                {selectedItem && editable && (
                    <button type="button" className="h-10 shrink-0 rounded-lg border border-destructive/40 px-2.5 text-xs font-semibold text-destructive" onClick={deleteSelected}>Delete</button>
                )}
                <span className="flex-1" />
                <button type="button" className="h-10 shrink-0 rounded-lg bg-foreground px-3 text-xs font-semibold text-background" onClick={() => setSheet('totals')}>Totals</button>
            </div>

            {sheet && (
                <Sheet title={sheet === 'scale' ? 'Scale of this page' : sheet === 'labels' ? 'Labels' : sheet === 'send' ? 'Add to estimate' : 'Totals'} onClose={() => { setSheet(null); setCalibration(null); }}>
                    {sheet === 'scale' && (
                        <ScalePanel
                            kind={plan.kind} system={system} scale={scale} calibration={calibration} editable={editable}
                            onPickPoints={() => { setSheet(null); setTool('scale'); setDraft([]); }}
                            onSet={(next) => { setPageScale(next); setSheet(null); setCalibration(null); setTool(t => (t === 'scale' ? 'line' : t)); toast.success('Scale set for this page.'); }}
                            onClear={() => { setPageScale(null); setSheet(null); }}
                        />
                    )}
                    {sheet === 'labels' && (
                        <LabelsPanel
                            doc={doc} totals={labelTotals(doc, system)} system={system} activeId={activeLabel} editable={editable}
                            onPick={(id) => { setActiveLabel(id); setSheet(null); }}
                            onAdd={addLabel} onUpdate={updateLabel} onRemove={removeLabel}
                        />
                    )}
                    {sheet === 'totals' && (
                        <TotalsPanel
                            totals={totals} system={system} scope={totalsScope} onScope={setTotalsScope} multiPage={doc.pageCount > 1} unscaled={unscaledCount}
                            onSend={() => setSheet('send')} onCsv={exportCsv} onPng={() => { setSheet(null); void exportPng(); }}
                            onLabels={() => setSheet('labels')}
                        />
                    )}
                    {sheet === 'send' && (
                        <SendPanel
                            totals={labelTotals(doc, system)} system={system} savedItems={savedItems} draftEstimates={draftEstimates} jobId={jobId}
                            onNew={async (seed) => { await saveNow(); onNewEstimate(seed); }}
                            onDraft={async (id) => { await saveNow(); onOpenEstimate(id); }}
                        />
                    )}
                </Sheet>
            )}
        </div>
    );
    return createPortal(body, document.body);
};

// ------------------------------------------------------------------------------------------------ bottom sheet
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
    <div className="fixed inset-0 z-[61] flex items-end justify-center sm:items-center" role="presentation">
        <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
        <div className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-xl sm:max-w-lg sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={title}>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <h2 className="text-base font-bold">{title}</h2>
                <button type="button" className="h-9 rounded-lg px-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted" onClick={onClose}>Close</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{children}</div>
        </div>
    </div>
);

// ------------------------------------------------------------------------------------------------ scale
const ScalePanel: React.FC<{
    kind: 'pdf' | 'image'; system: UnitSystem; scale: PageScale | null; calibration: [Pt, Pt] | null; editable: boolean;
    onPickPoints: () => void; onSet: (s: PageScale) => void; onClear: () => void;
}> = ({ kind, system, scale, calibration, editable, onPickPoints, onSet, onClear }) => {
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const metres = parseKnownLength(text, system);
    const apply = () => {
        if (!calibration) return;
        if (metres === null) { setError(system === 'metric' ? 'Type a length like 3.8 m or 3800 mm.' : 'Type a length like 12\' 6" or 12.5 ft.'); return; }
        const mPerU = scaleFromPoints(calibration[0], calibration[1], metres);
        if (!mPerU) { setError('The two points are too close. Zoom in and pick a longer line.'); return; }
        onSet({ mPerU, how: 'calibrated', ref: metres });
    };
    const presets = COMMON_SCALES.filter(c => c.system === system).concat(COMMON_SCALES.filter(c => c.system !== system));
    return (
        <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">Now: <strong className="text-foreground">{scaleLabel(scale, kind, system)}</strong></p>
            {!editable ? <p className="text-muted-foreground">The scale can't be changed here.</p> : calibration ? (
                <form className="space-y-2" onSubmit={e => { e.preventDefault(); apply(); }}>
                    <label className="block font-semibold" htmlFor="plan-known">How long is the line you picked?</label>
                    <input id="plan-known" className="input h-11 text-base" autoFocus inputMode="text" autoComplete="off" value={text}
                        placeholder={system === 'metric' ? '3.8 m' : '12\' 6"'} onChange={e => { setText(e.target.value.slice(0, 40)); setError(''); }} />
                    <p className={cx('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error || 'Feet and inches (12\'6", 12.5 ft) or metric (3.8 m, 3800 mm).'}</p>
                    <button type="submit" className="btn btn-primary h-11 w-full" disabled={!text.trim()}>Set scale</button>
                </form>
            ) : (
                <div className="space-y-2">
                    <button type="button" className="btn btn-primary h-11 w-full" onClick={onPickPoints}>Pick two points on the plan</button>
                    <p className="text-xs text-muted-foreground">Tap both ends of a length you know (a dimension line, a door, a wall), then type its length. The most accurate way.</p>
                </div>
            )}
            {editable && kind === 'pdf' && (
                <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or the drawing scale printed on the plan</p>
                    <div className="flex flex-wrap gap-1.5">
                        {presets.map(c => (
                            <button key={c.id} type="button" className="min-h-[36px] rounded-lg border border-border px-2.5 text-xs font-semibold tabular-nums hover:border-primary/50"
                                onClick={() => { const mPerU = presetScale(c.ratio); if (mPerU) onSet({ mPerU, how: 'preset', ref: c.ratio }); }}>
                                {c.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Only for PDFs printed at their true size. Check one known length after picking.</p>
                </div>
            )}
            {editable && scale && <button type="button" className="text-xs font-semibold text-destructive" onClick={onClear}>Clear the scale of this page</button>}
        </div>
    );
};

// ------------------------------------------------------------------------------------------------ labels
const describe = (t: LabelTotal, system: UnitSystem): string => {
    const parts: string[] = [];
    if (t.areaAdded > 0) parts.push(`${fmtArea(t.area, system)}${t.areaRemoved > 0 ? ` net` : ''}`);
    if (t.length > 0) parts.push(fmtLength(t.length, system));
    if (t.count > 0) parts.push(`${t.count} each`);
    return parts.join(' · ') || 'Nothing measured yet';
};

const LabelsPanel: React.FC<{
    doc: MeasureDoc; totals: LabelTotal[]; system: UnitSystem; activeId: string | null; editable: boolean;
    onPick: (id: string) => void; onAdd: (name: string) => void;
    onUpdate: (id: string, patch: Partial<MeasureDoc['labels'][number]>) => void; onRemove: (id: string) => void;
}> = ({ doc, totals, system, activeId, editable, onPick, onAdd, onUpdate, onRemove }) => {
    const [name, setName] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const byId = new Map(totals.map(t => [t.label.id, t]));
    return (
        <div className="space-y-3 text-sm">
            {doc.labels.length === 0 && <p className="text-muted-foreground">Labels group what you measure ("Drywall", "Baseboard", "Outlets"), each with its own colour and total.</p>}
            <ul className="divide-y divide-border">
                {doc.labels.map(l => {
                    const t = byId.get(l.id);
                    const open = editing === l.id;
                    return (
                        <li key={l.id} className="py-2">
                            <div className="flex items-center gap-2">
                                <button type="button" className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left', activeId === l.id && 'bg-muted')} onClick={() => onPick(l.id)} aria-pressed={activeId === l.id}>
                                    <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: l.color }} aria-hidden />
                                    <span className="min-w-0">
                                        <span className={cx('block truncate font-semibold', l.hidden && 'text-muted-foreground line-through')}>{l.name}</span>
                                        <span className="block truncate text-xs text-muted-foreground">{t ? describe(t, system) : ''}</span>
                                    </span>
                                </button>
                                <button type="button" className="h-9 shrink-0 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted" onClick={() => onUpdate(l.id, { hidden: !l.hidden })} disabled={!editable} aria-pressed={!l.hidden}>
                                    {l.hidden ? 'Show' : 'Hide'}
                                </button>
                                {editable && <button type="button" className="h-9 shrink-0 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted" onClick={() => setEditing(open ? null : l.id)} aria-expanded={open}>Edit</button>}
                            </div>
                            {open && editable && (
                                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2 pl-7">
                                    <input className="input h-10" value={l.name} maxLength={40} aria-label="Label name" onChange={e => onUpdate(l.id, { name: e.target.value.slice(0, 40) || l.name })} />
                                    <div className="relative">
                                        <input className="input h-10 pr-6 tabular-nums" inputMode="decimal" aria-label="Waste %"
                                            placeholder={t && t.count > 0 && !t.length && !t.areaAdded ? '0' : '10'}
                                            value={typeof l.waste === 'number' ? String(l.waste) : ''}
                                            onChange={e => { const v = e.target.value.trim(); const n = Number(v); onUpdate(l.id, { waste: v === '' ? null : Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : l.waste ?? null }); }} />
                                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                                    </div>
                                    <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                                        {LABEL_COLORS.map(c => (
                                            <button key={c} type="button" className={cx('h-7 w-7 rounded-md border-2', l.color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} onClick={() => onUpdate(l.id, { color: c })} aria-label={`Colour ${c}`} />
                                        ))}
                                        <span className="flex-1" />
                                        <button type="button" className="text-xs font-semibold text-destructive" onClick={() => onRemove(l.id)}>Delete label</button>
                                    </div>
                                    <p className="col-span-2 text-xs text-muted-foreground">Waste: empty = 10% for lengths and areas, 0 for counts.</p>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            {editable && (
                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); onAdd(name); setName(''); }}>
                    <input className="input h-11 min-w-0 flex-1" placeholder="New label (e.g. Drywall)" value={name} maxLength={40} onChange={e => setName(e.target.value)} aria-label="New label" />
                    <button type="submit" className="btn btn-primary h-11 shrink-0" disabled={!name.trim()}>Add</button>
                </form>
            )}
            {editable && (
                <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED.filter(s => !doc.labels.some(l => l.name.toLowerCase() === s.toLowerCase())).map(s => (
                        <button key={s} type="button" className="min-h-[32px] rounded-full border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => onAdd(s)}>+ {s}</button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ------------------------------------------------------------------------------------------------ totals
const TotalsPanel: React.FC<{
    totals: LabelTotal[]; system: UnitSystem; scope: 'page' | 'all'; onScope: (s: 'page' | 'all') => void; multiPage: boolean; unscaled: number;
    onSend: () => void; onCsv: () => void; onPng: () => void; onLabels: () => void;
}> = ({ totals, system, scope, onScope, multiPage, unscaled, onSend, onCsv, onPng, onLabels }) => {
    const rows = totals.filter(t => kindsOf(t).length);
    return (
        <div className="space-y-3 text-sm">
            {multiPage && (
                <div className="flex rounded-lg bg-muted p-1" role="radiogroup" aria-label="Pages">
                    {(['all', 'page'] as const).map(s => (
                        <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => onScope(s)}
                            className={cx('min-h-[34px] flex-1 rounded-md text-xs font-semibold', scope === s ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                            {s === 'all' ? 'All pages' : 'This page'}
                        </button>
                    ))}
                </div>
            )}
            {rows.length === 0 ? (
                <p className="text-muted-foreground">Nothing measured yet. Set the scale, pick Line, Area or Count and tap on the plan.</p>
            ) : (
                <table className="w-full text-left">
                    <thead>
                        <tr className="text-xs text-muted-foreground"><th className="py-1 font-medium">Label</th><th className="py-1 text-right font-medium">Measured</th><th className="py-1 text-right font-medium">+ waste</th></tr>
                    </thead>
                    <tbody>
                        {rows.flatMap(t => kindsOf(t).map(k => {
                            const q = quantityFor(t, k, wasteOf(t.label, k), system);
                            return (
                                <tr key={`${t.label.id}-${k}`} className="border-t border-border">
                                    <td className="py-1.5 pr-2">
                                        <span className="inline-flex items-center gap-1.5 font-semibold"><span className="h-3 w-3 rounded-sm" style={{ background: t.label.color }} aria-hidden />{t.label.name}</span>
                                        {k === 'area' && <span className="block text-xs text-muted-foreground">Perimeter {fmtLength(t.perimeter, system)}{t.areaRemoved > 0 ? ` · cut-outs ${fmtArea(t.areaRemoved, system)}` : ''}</span>}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums">{k === 'area' ? fmtArea(q.base, system) : k === 'length' ? fmtLength(q.base, system) : `${q.base} each`}</td>
                                    <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{formatQty(q.quantity, 2)} {q.unit}<span className="block text-[11px] font-normal text-muted-foreground">{q.waste}%</span></td>
                                </tr>
                            );
                        }))}
                    </tbody>
                </table>
            )}
            {unscaled > 0 && <p className="text-xs text-warning">{unscaled} measurement{unscaled === 1 ? ' is' : 's are'} on a page without a scale and not counted.</p>}
            <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn btn-primary col-span-2 h-11" onClick={onSend} disabled={!rows.length}>Add to estimate</button>
                <button type="button" className="btn btn-outline h-11" onClick={onPng}>Marked-up plan (PNG)</button>
                <button type="button" className="btn btn-outline h-11" onClick={onCsv} disabled={!rows.length}>Totals (CSV)</button>
            </div>
            <button type="button" className="text-xs font-semibold text-primary" onClick={onLabels}>Labels and waste %</button>
        </div>
    );
};

// ------------------------------------------------------------------------------------------------ send to estimate
const SendPanel: React.FC<{
    totals: LabelTotal[]; system: UnitSystem; savedItems: SavedItem[]; draftEstimates: DraftEstimateRef[]; jobId: string;
    onNew: (seed: Record<string, unknown>) => void | Promise<void>; onDraft: (id: string) => void | Promise<void>;
}> = ({ totals, system, savedItems, draftEstimates, jobId, onNew, onDraft }) => {
    const rows = totals.filter(t => kindsOf(t).length);
    const [labelId, setLabelId] = useState(rows[0]?.label.id ?? '');
    const row = rows.find(r => r.label.id === labelId) || rows[0];
    const kinds = row ? kindsOf(row) : [];
    const [kind, setKind] = useState<QuantityKind | null>(kinds[0] ?? null);
    const k = kind && kinds.includes(kind) ? kind : kinds[0] ?? null;
    const matches = useMemo(() => (row ? matchPriceItems(row.label.name, savedItems, k) : []), [row, savedItems, k]);
    const [itemId, setItemId] = useState<string | null | undefined>(undefined);
    const [picker, setPicker] = useState(false);
    const [picked, setPicked] = useState<SavedItem | null>(null);
    const [busy, setBusy] = useState(false);
    // the best match is pre-selected until the user picks (or picks "no price")
    const item = itemId === undefined ? matches[0]?.item ?? null : itemId === null ? null : (picked?.id === itemId ? picked : savedItems.find(s => s.id === itemId) ?? null);
    if (!row || !k) return <p className="text-sm text-muted-foreground">Measure something first.</p>;
    const q = quantityFor(row, k, wasteOf(row.label, k), system);
    const plan = buildEstimateLine(row.label.name, q, item);
    const amount = plan.line.quantity * plan.line.rate;
    const qmState = quickMeasureState(row.label.name, q, system);
    return (
        <div className="space-y-3 text-sm">
            <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label</p>
                <div className="flex flex-wrap gap-1.5">
                    {rows.map(r => (
                        <button key={r.label.id} type="button" aria-pressed={r.label.id === row.label.id} onClick={() => { setLabelId(r.label.id); setKind(null); setItemId(undefined); }}
                            className={cx('inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold', r.label.id === row.label.id ? 'border-foreground' : 'border-border')}>
                            <span className="h-3 w-3 rounded-sm" style={{ background: r.label.color }} aria-hidden />{r.label.name}
                        </button>
                    ))}
                </div>
            </div>
            {kinds.length > 1 && (
                <div className="flex rounded-lg bg-muted p-1" role="radiogroup" aria-label="Quantity">
                    {kinds.map(x => (
                        <button key={x} type="button" role="radio" aria-checked={x === k} onClick={() => setKind(x)} className={cx('min-h-[34px] flex-1 rounded-md text-xs font-semibold', x === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                            {x === 'area' ? 'Area' : x === 'length' ? 'Length' : 'Count'}
                        </button>
                    ))}
                </div>
            )}
            <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price book item</p>
                <div className="flex flex-wrap gap-1.5">
                    {matches.map(m => (
                        <button key={m.item.id} type="button" aria-pressed={item?.id === m.item.id} onClick={() => setItemId(m.item.id)}
                            className={cx('min-h-[36px] rounded-lg border px-2.5 text-left text-xs font-semibold', item?.id === m.item.id ? 'border-foreground' : 'border-border')}>
                            {m.item.name} <span className="font-normal text-muted-foreground">{formatMoney(m.item.rate)}{m.item.unit ? `/${m.item.unit}` : ''}</span>
                        </button>
                    ))}
                    {picked && !matches.some(m => m.item.id === picked.id) && (
                        <button type="button" aria-pressed={item?.id === picked.id} onClick={() => setItemId(picked.id)} className={cx('min-h-[36px] rounded-lg border px-2.5 text-xs font-semibold', item?.id === picked.id ? 'border-foreground' : 'border-border')}>
                            {picked.name}
                        </button>
                    )}
                    <button type="button" className="min-h-[36px] rounded-lg border border-dashed border-border px-2.5 text-xs font-semibold" onClick={() => setPicker(true)}>Price book…</button>
                    <button type="button" aria-pressed={item === null} onClick={() => setItemId(null)} className={cx('min-h-[36px] rounded-lg px-2.5 text-xs font-semibold', item === null ? 'bg-muted' : 'text-muted-foreground')}>No price yet</button>
                </div>
                {!matches.length && <p className="mt-1 text-xs text-muted-foreground">No price book item looks like “{row.label.name}”. Pick one, or add the line without a price.</p>}
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adds one line</p>
                <p className="mt-1 font-semibold">{plan.line.description}</p>
                <p className="tabular-nums">{formatQty(plan.line.quantity, 3)} {plan.line.unit} × {formatMoney(plan.line.rate)} = <strong>{formatMoney(amount)}</strong></p>
                <p className="text-xs text-muted-foreground">Measured {formatQty(q.base, 2)} {q.unit}{q.waste ? ` + ${q.waste}% waste` : ''}, rounded up.</p>
                {plan.unitWarning && <p className="mt-1 text-xs text-warning">{plan.unitWarning}</p>}
            </div>
            <button type="button" className="btn btn-primary h-11 w-full" disabled={busy}
                onClick={async () => { setBusy(true); try { await onNew(estimateSeed([plan.line])); } finally { setBusy(false); } }}>
                New estimate with this line
            </button>
            {draftEstimates.length > 0 && qmState && (
                <details className="rounded-xl border border-border p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Use it in a draft estimate</summary>
                    <p className="mt-1 text-xs text-muted-foreground">The quantity is kept in Quick measure on this job. In the estimate, tap the ruler on a line and pick “{row.label.name} (plans)” under Recent on this job.</p>
                    <ul className="mt-2 space-y-1">
                        {draftEstimates.map(d => (
                            <li key={d.id}>
                                <button type="button" className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm font-medium hover:border-primary/50" disabled={busy}
                                    onClick={async () => {
                                        setBusy(true);
                                        try {
                                            rememberMeasurement(browserStore, activeUserIdNow(), jobId, qmState);
                                            await onDraft(d.id);
                                        } finally { setBusy(false); }
                                    }}>
                                    {d.title}
                                </button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            <ItemPickerModal open={picker} onClose={() => setPicker(false)} savedItems={savedItems} inventoryItems={[]} showInventory={false}
                title="Price book item for this line"
                onPickSaved={s => { setPicked(s); setItemId(s.id); setPicker(false); }} onPickInventory={() => setPicker(false)} />
        </div>
    );
};

export default PlanViewer;
