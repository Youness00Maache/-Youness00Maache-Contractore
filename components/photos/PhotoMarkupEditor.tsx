/**
 * Full-screen markup editor: arrows, circles, text labels and freehand lines on a photo. Shapes are kept in
 * normalized coordinates (markupGeometry.ts); "Save copy" renders them on the full-size photo and hands back a
 * new JPEG. The original photo is never changed.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UndoIcon, TrashIcon } from '../Icons.tsx';
import {
    MARKUP_COLORS, drawShapes, fitSize, isTinyShape, simplifyStroke, toNormalized,
    type MarkupShape, type MarkupTool,
} from './markupGeometry.ts';

interface Props {
    /** The photo file (downloaded from private storage, so the canvas is never tainted). */
    source: Blob;
    onCancel: () => void;
    onSave: (file: File) => Promise<void> | void;
}

const TOOLS: { value: MarkupTool; label: string; glyph: React.ReactNode }[] = [
    { value: 'arrow', label: 'Arrow', glyph: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5" /><path d="M10 5h9v9" /></svg> },
    { value: 'circle', label: 'Circle', glyph: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2"><ellipse cx="12" cy="12" rx="9" ry="7" /></svg> },
    { value: 'text', label: 'Text', glyph: <span className="text-base font-bold leading-none">T</span> },
    { value: 'pen', label: 'Draw', glyph: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17c3-4 5 2 8-2s4-8 7-6 1 6 3 6" /></svg> },
];

const EXPORT_MAX = 1600;

const PhotoMarkupEditor: React.FC<Props> = ({ source, onCancel, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<ImageBitmap | HTMLImageElement | null>(null);
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const [display, setDisplay] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [shapes, setShapes] = useState<MarkupShape[]>([]);
    const [draft, setDraft] = useState<MarkupShape | null>(null);
    const [tool, setTool] = useState<MarkupTool>('arrow');
    const [color, setColor] = useState<string>(MARKUP_COLORS[0].value);
    const [textAt, setTextAt] = useState<[number, number] | null>(null);
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const drawing = useRef(false);

    // decode the photo once
    useEffect(() => {
        let cancelled = false;
        let objectUrl = '';
        (async () => {
            try {
                if (typeof createImageBitmap === 'function') {
                    const bmp = await createImageBitmap(source);
                    if (cancelled) { bmp.close(); return; }
                    imgRef.current = bmp;
                    setNatural({ w: bmp.width, h: bmp.height });
                    return;
                }
                objectUrl = URL.createObjectURL(source);
                const img = new Image();
                await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('decode')); img.src = objectUrl; });
                if (cancelled) return;
                imgRef.current = img;
                setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            } catch {
                if (!cancelled) setError('This photo could not be opened for markup.');
            }
        })();
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            const img = imgRef.current as ImageBitmap | null;
            if (img && typeof (img as ImageBitmap).close === 'function') (img as ImageBitmap).close();
        };
    }, [source]);

    // fit the canvas into the stage
    useEffect(() => {
        if (!natural) return;
        const fit = () => {
            const stage = stageRef.current;
            if (!stage) return;
            const maxW = stage.clientWidth;
            const maxH = stage.clientHeight;
            const scale = Math.min(maxW / natural.w, maxH / natural.h, 1);
            setDisplay({ w: Math.max(1, Math.floor(natural.w * scale)), h: Math.max(1, Math.floor(natural.h * scale)) });
        };
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [natural]);

    // lock page scroll and close on Escape
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel(); };
        document.addEventListener('keydown', onKey);
        return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
    }, [onCancel, saving]);

    // redraw
    useEffect(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !display.w) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(display.w * dpr);
        canvas.height = Math.round(display.h * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        drawShapes(ctx, draft ? [...shapes, draft] : shapes, canvas.width, canvas.height);
    }, [display, shapes, draft]);

    const pos = (e: React.PointerEvent) => toNormalized(e.clientX, e.clientY, (e.currentTarget as HTMLCanvasElement).getBoundingClientRect());

    const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (saving) return;
        const [x, y] = pos(e);
        if (tool === 'text') {
            setTextAt([x, y]);
            setText('');
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        if (tool === 'pen') setDraft({ kind: 'pen', points: [[x, y]], color });
        else setDraft({ kind: tool, x1: x, y1: y, x2: x, y2: y, color } as MarkupShape);
    };

    const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current) return;
        const [x, y] = pos(e);
        setDraft(d => {
            if (!d) return d;
            if (d.kind === 'pen') return { ...d, points: [...d.points, [x, y]] };
            if (d.kind === 'arrow' || d.kind === 'circle') return { ...d, x2: x, y2: y };
            return d;
        });
    };

    const onUp = () => {
        if (!drawing.current) return;
        drawing.current = false;
        setDraft(d => {
            if (d) {
                const done = d.kind === 'pen' ? { ...d, points: simplifyStroke(d.points) } : d;
                if (!isTinyShape(done)) setShapes(s => [...s, done]);
            }
            return null;
        });
    };

    const addText = () => {
        const t = text.trim();
        if (textAt && t) setShapes(s => [...s, { kind: 'text', x: textAt[0], y: textAt[1], text: t.slice(0, 80), color }]);
        setTextAt(null);
        setText('');
    };

    const save = async () => {
        const img = imgRef.current;
        if (!img || !natural || !shapes.length) return;
        setSaving(true);
        setError('');
        try {
            const { width, height } = fitSize(natural.w, natural.h, EXPORT_MAX);
            const out = document.createElement('canvas');
            out.width = width;
            out.height = height;
            const ctx = out.getContext('2d');
            if (!ctx) throw new Error('canvas');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            drawShapes(ctx, shapes, width, height);
            const blob = await new Promise<Blob>((resolve, reject) => out.toBlob(b => (b ? resolve(b) : reject(new Error('export'))), 'image/jpeg', 0.88));
            await onSave(new File([blob], `markup-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
        } catch (e) {
            setError((e as Error)?.message && !/^(canvas|export)$/.test((e as Error).message) ? (e as Error).message : 'The marked-up copy could not be saved.');
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-neutral-950 text-white" role="dialog" aria-modal="true" aria-label="Mark up photo">
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <button type="button" className="btn btn-ghost min-h-[44px] text-white hover:bg-white/10" onClick={onCancel} disabled={saving}>Cancel</button>
                <p className="truncate text-sm font-semibold">Mark up</p>
                <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => void save()} disabled={saving || !shapes.length}>
                    {saving ? 'Saving…' : 'Save copy'}
                </button>
            </div>

            <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center px-2">
                {!natural && !error && <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-2 border-white border-r-transparent" />}
                {error && <p className="max-w-sm px-4 text-center text-sm text-red-300" role="alert">{error}</p>}
                {natural && (
                    <canvas
                        ref={canvasRef}
                        style={{ width: display.w, height: display.h, touchAction: 'none' }}
                        className={tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                        aria-label="Photo. Drag to draw."
                    />
                )}
                {textAt && (
                    <div className="absolute inset-x-3 bottom-3 mx-auto flex max-w-md gap-2 rounded-2xl bg-neutral-900/95 p-2 shadow-lg">
                        <input
                            autoFocus
                            className="input min-h-[44px] flex-1 border-white/20 bg-neutral-800 text-white placeholder:text-white/50"
                            placeholder="Label, e.g. Crack here"
                            value={text}
                            maxLength={80}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addText(); } }}
                        />
                        <button type="button" className="btn btn-primary min-h-[44px]" onClick={addText} disabled={!text.trim()}>Add</button>
                        <button type="button" className="btn btn-ghost min-h-[44px] text-white hover:bg-white/10" onClick={() => setTextAt(null)}>Cancel</button>
                    </div>
                )}
            </div>

            <div className="space-y-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                <div className="flex items-center justify-center gap-3" role="radiogroup" aria-label="Color">
                    {MARKUP_COLORS.map(c => (
                        <button
                            key={c.value}
                            type="button"
                            role="radio"
                            aria-checked={color === c.value}
                            aria-label={c.label}
                            onClick={() => setColor(c.value)}
                            className={`h-9 w-9 rounded-full border-2 transition ${color === c.value ? 'scale-110 border-white' : 'border-white/30'}`}
                            style={{ backgroundColor: c.value }}
                        />
                    ))}
                </div>
                <div className="flex items-stretch justify-center gap-1.5">
                    {TOOLS.map(t => (
                        <button
                            key={t.value}
                            type="button"
                            aria-pressed={tool === t.value}
                            onClick={() => { setTool(t.value); setTextAt(null); }}
                            className={`flex min-h-[52px] min-w-[60px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium transition ${tool === t.value ? 'bg-white text-neutral-950' : 'text-white/80 hover:bg-white/10'}`}
                        >
                            {t.glyph}
                            {t.label}
                        </button>
                    ))}
                    <span className="mx-1 w-px self-stretch bg-white/15" aria-hidden />
                    <button type="button" onClick={() => setShapes(s => s.slice(0, -1))} disabled={!shapes.length || saving}
                        className="flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40">
                        <UndoIcon className="h-5 w-5" /> Undo
                    </button>
                    <button type="button" onClick={() => setShapes([])} disabled={!shapes.length || saving}
                        className="flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40">
                        <TrashIcon className="h-5 w-5" /> Clear
                    </button>
                </div>
                <p className="text-center text-xs text-white/50">{tool === 'text' ? 'Tap where the label goes.' : 'Drag on the photo.'} The original photo is kept.</p>
            </div>
        </div>,
        document.body,
    );
};

export default PhotoMarkupEditor;
