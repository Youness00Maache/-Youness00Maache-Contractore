import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TrashIcon, PenIcon, UndoIcon, CheckIcon } from './Icons.tsx';
import { SIGNATURE_LOCAL_PREFIX } from '../lib/userDataSync.ts';
import { saveDefaultSignatureToAccount } from '../lib/userData.ts';

/**
 * Signature pad: mouse, touch and stylus (pointer events, pressure-aware), high-DPI and resize aware,
 * undo + clear, and it emits a TRIMMED transparent PNG data URL after every stroke.
 *
 * Optional "default signature": pass `defaultSignatureKey` (e.g. the user id) to offer
 * "Use my saved signature" / "Save as my default". The default is applied ONLY when the user clicks it,
 * so a signature never ends up on a document the user didn't sign.
 */
interface SignaturePadProps {
    onSave: (dataUrl: string) => void;
    onClear?: () => void;
    initialDataUrl?: string;
    height?: number;
    label?: string;
    defaultSignatureKey?: string;
    /** account-level default (profile.defaultSignatureUrl); used when this device has none saved */
    defaultSignatureUrl?: string;
    disabled?: boolean;
}

type Point = { x: number; y: number; w: number };

/** Device copy of the default signature; the account copy is profiles.default_signature_url (lib/userData.ts). */
const STORAGE_PREFIX = SIGNATURE_LOCAL_PREFIX;
const INK = '#111827';

export const getDefaultSignature = (key?: string | null): string => {
    if (!key) return '';
    try {
        const v = localStorage.getItem(STORAGE_PREFIX + key) || '';
        return v.startsWith('data:image/png;base64,') ? v : '';
    } catch {
        return '';
    }
};

export const setDefaultSignature = (key: string | null | undefined, dataUrl: string): boolean => {
    if (!key) return false;
    try {
        if (dataUrl) localStorage.setItem(STORAGE_PREFIX + key, dataUrl);
        else localStorage.removeItem(STORAGE_PREFIX + key);
        return true;
    } catch {
        return false;
    }
};

const drawStroke = (ctx: CanvasRenderingContext2D, pts: Point[], offsetX = 0, offsetY = 0, scale = 1) => {
    if (!pts.length) return;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const tx = (p: Point) => ({ x: (p.x - offsetX) * scale, y: (p.y - offsetY) * scale });
    if (pts.length === 1) {
        const p = tx(pts[0]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, (pts[0].w * scale) / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
    }
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const pa = tx(a);
        const pb = tx(b);
        const prev = i > 1 ? tx(pts[i - 2]) : pa;
        ctx.lineWidth = ((a.w + b.w) / 2) * scale;
        ctx.beginPath();
        // smooth: curve from the midpoint of the previous segment to the midpoint of this one
        ctx.moveTo((prev.x + pa.x) / 2, (prev.y + pa.y) / 2);
        ctx.quadraticCurveTo(pa.x, pa.y, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
        ctx.stroke();
    }
    const last = tx(pts[pts.length - 1]);
    const beforeLast = tx(pts[pts.length - 2]);
    ctx.beginPath();
    ctx.moveTo((beforeLast.x + last.x) / 2, (beforeLast.y + last.y) / 2);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
};

/** Renders strokes into a tightly cropped, transparent PNG (2x resolution). */
const exportTrimmedPng = (strokes: Point[][]): string => {
    const all = strokes.flat();
    if (!all.length) return '';
    const pad = 8;
    const minX = Math.min(...all.map(p => p.x - p.w)) - pad;
    const minY = Math.min(...all.map(p => p.y - p.w)) - pad;
    const maxX = Math.max(...all.map(p => p.x + p.w)) + pad;
    const maxY = Math.max(...all.map(p => p.y + p.w)) + pad;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil((maxX - minX) * scale));
    canvas.height = Math.max(1, Math.ceil((maxY - minY) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    for (const s of strokes) drawStroke(ctx, s, minX, minY, scale);
    return canvas.toDataURL('image/png');
};

const SignaturePad: React.FC<SignaturePadProps> = ({
    onSave, onClear, initialDataUrl, height = 180, label = 'Sign here', defaultSignatureKey, defaultSignatureUrl, disabled,
}) => {
    const accountDefault = typeof defaultSignatureUrl === 'string' && /^data:image\/png;base64,|^https:\/\//.test(defaultSignatureUrl) ? defaultSignatureUrl : '';
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokesRef = useRef<Point[][]>([]);
    const currentRef = useRef<Point[] | null>(null);
    const lastEmittedRef = useRef<string>(initialDataUrl || '');
    const imageBeforeDrawingRef = useRef<string>('');
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;

    const [image, setImage] = useState(initialDataUrl || '');
    const [strokeCount, setStrokeCount] = useState(0);
    const [savedDefault, setSavedDefault] = useState(() => getDefaultSignature(defaultSignatureKey) || accountDefault);
    const [defaultSavedFlash, setDefaultSavedFlash] = useState(false);

    // external value changes (AI prefill, "use saved signature", parent reset)
    useEffect(() => {
        const next = initialDataUrl || '';
        if (next === lastEmittedRef.current) return;
        lastEmittedRef.current = next;
        strokesRef.current = [];
        currentRef.current = null;
        setStrokeCount(0);
        setImage(next);
    }, [initialDataUrl]);

    useEffect(() => setSavedDefault(getDefaultSignature(defaultSignatureKey) || accountDefault), [defaultSignatureKey, accountDefault]);

    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const s of strokesRef.current) drawStroke(ctx, s);
        if (currentRef.current) drawStroke(ctx, currentRef.current);
    }, []);

    // size the canvas to its container at device pixel ratio, redraw on resize
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;
        const fit = () => {
            const dpr = window.devicePixelRatio || 1;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (!w || !h) return;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            redraw();
        };
        fit();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', fit);
            return () => window.removeEventListener('resize', fit);
        }
        const ro = new ResizeObserver(fit);
        ro.observe(container);
        return () => ro.disconnect();
    }, [redraw]);

    // iOS Safari inside sheets/modals: block scrolling while drawing (touch-action alone isn't always honored)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const block = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
        canvas.addEventListener('touchstart', block, { passive: false });
        canvas.addEventListener('touchmove', block, { passive: false });
        return () => {
            canvas.removeEventListener('touchstart', block);
            canvas.removeEventListener('touchmove', block);
        };
    }, []);

    const emit = (dataUrl: string) => {
        lastEmittedRef.current = dataUrl;
        onSaveRef.current(dataUrl);
    };

    const pointFrom = (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent): Point => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
        const w = e.pointerType === 'pen' ? 1.2 + pressure * 2.6 : 2.4;
        return { x: e.clientX - rect.left, y: e.clientY - rect.top, w };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        if (image && strokesRef.current.length === 0) {
            // drawing replaces the existing signature (restored if every new stroke is undone)
            imageBeforeDrawingRef.current = image;
            setImage('');
        }
        currentRef.current = [pointFrom(e)];
        redraw();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!currentRef.current) return;
        e.preventDefault();
        const native = e.nativeEvent as PointerEvent;
        const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
        if (events.length) for (const ev of events) currentRef.current.push(pointFrom(ev));
        else currentRef.current.push(pointFrom(e));
        redraw();
    };

    const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!currentRef.current) return;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
        strokesRef.current = [...strokesRef.current, currentRef.current];
        currentRef.current = null;
        setStrokeCount(strokesRef.current.length);
        redraw();
        emit(exportTrimmedPng(strokesRef.current));
    };

    const handleUndo = () => {
        if (!strokesRef.current.length) return;
        strokesRef.current = strokesRef.current.slice(0, -1);
        setStrokeCount(strokesRef.current.length);
        redraw();
        if (strokesRef.current.length) {
            emit(exportTrimmedPng(strokesRef.current));
        } else {
            const restored = imageBeforeDrawingRef.current;
            setImage(restored);
            emit(restored);
        }
    };

    const handleClear = () => {
        strokesRef.current = [];
        currentRef.current = null;
        imageBeforeDrawingRef.current = '';
        setStrokeCount(0);
        setImage('');
        redraw();
        emit('');
        onClear?.();
    };

    const applySavedDefault = () => {
        if (!savedDefault) return;
        strokesRef.current = [];
        setStrokeCount(0);
        setImage(savedDefault);
        redraw();
        emit(savedDefault);
    };

    const current = strokeCount > 0 ? lastEmittedRef.current : image;
    const saveAsDefault = () => {
        if (!current || !setDefaultSignature(defaultSignatureKey, current)) return;
        // Also to the account, so it is there after logout and on other devices (only for the signed-in owner).
        void saveDefaultSignatureToAccount(defaultSignatureKey, current);
        setSavedDefault(current);
        setDefaultSavedFlash(true);
        window.setTimeout(() => setDefaultSavedFlash(false), 2000);
    };

    const isEmpty = strokeCount === 0 && !image;

    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <PenIcon className="h-3.5 w-3.5" /> {label}
                </span>
                <div className="flex items-center gap-1">
                    {defaultSignatureKey && savedDefault && current !== savedDefault && (
                        <button type="button" onClick={applySavedDefault} disabled={disabled} className="btn btn-ghost btn-sm min-h-[32px]">
                            Use my saved signature
                        </button>
                    )}
                    <button type="button" onClick={handleUndo} disabled={disabled || strokeCount === 0} className="btn btn-ghost btn-sm min-h-[32px]" aria-label="Undo last stroke">
                        <UndoIcon className="h-3.5 w-3.5" /> Undo
                    </button>
                    <button type="button" onClick={handleClear} disabled={disabled || isEmpty} className="btn btn-ghost btn-sm min-h-[32px] text-destructive hover:bg-destructive/10" aria-label="Clear signature">
                        <TrashIcon className="h-3.5 w-3.5" /> Clear
                    </button>
                </div>
            </div>
            <div ref={containerRef} className="relative w-full select-none bg-white dark:bg-zinc-100" style={{ height, touchAction: 'none' }}>
                {image && strokeCount === 0 && (
                    <img src={image} alt="Signature" className="pointer-events-none absolute inset-0 h-full w-full object-contain p-4" draggable={false} />
                )}
                {isEmpty && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-serif text-3xl italic text-zinc-300">
                        Sign here
                    </div>
                )}
                <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-zinc-300" />
                <canvas
                    ref={canvasRef}
                    className={`absolute inset-0 block h-full w-full ${disabled ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
                    style={{ touchAction: 'none' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishStroke}
                    onPointerCancel={finishStroke}
                    aria-label="Signature drawing area"
                    role="img"
                />
            </div>
            {defaultSignatureKey && !isEmpty && (current !== savedDefault || defaultSavedFlash) && (
                <div className="flex justify-end border-t border-border bg-muted/40 px-3 py-1.5">
                    <button type="button" onClick={saveAsDefault} className="btn btn-ghost btn-sm min-h-[32px] text-primary">
                        {defaultSavedFlash ? (<><CheckIcon className="h-3.5 w-3.5" /> Saved as default</>) : 'Save as my default signature'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default SignaturePad;
