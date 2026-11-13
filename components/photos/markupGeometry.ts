/**
 * Photo markup (arrows, circles, text, freehand): shapes are stored in normalized image coordinates (0..1), so
 * the same list draws on the small on-screen canvas and on the full-size export. Pure math + one drawing
 * function that only needs a CanvasRenderingContext2D-like object. Tested by scripts/requests-photos-check.ts.
 */

export type MarkupTool = 'arrow' | 'circle' | 'text' | 'pen';

export type MarkupShape =
    | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
    | { kind: 'circle'; x1: number; y1: number; x2: number; y2: number; color: string }
    | { kind: 'text'; x: number; y: number; text: string; color: string }
    | { kind: 'pen'; points: Array<[number, number]>; color: string };

/** High-visibility colors that read on most job-site photos. */
export const MARKUP_COLORS = [
    { value: '#ef4444', label: 'Red' },
    { value: '#facc15', label: 'Yellow' },
    { value: '#ffffff', label: 'White' },
    { value: '#111827', label: 'Black' },
] as const;

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Pointer position → normalized image coordinates (the canvas may be scaled by CSS). */
export const toNormalized = (clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): [number, number] => [
    clamp01((clientX - rect.left) / Math.max(1, rect.width)),
    clamp01((clientY - rect.top) / Math.max(1, rect.height)),
];

/** Line width in pixels for an image of this size (thicker on bigger images, never hairline). */
export const strokeWidthFor = (w: number, h: number): number => Math.max(3, Math.round(Math.min(w, h) * 0.008));

/** Label font size in pixels. */
export const fontSizeFor = (w: number, h: number): number => Math.max(16, Math.round(Math.min(w, h) * 0.045));

/** The two outer points of an arrow head at (x2, y2), in pixels. */
export const arrowHead = (x1: number, y1: number, x2: number, y2: number, size: number): [[number, number], [number, number]] => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const spread = Math.PI / 7;
    return [
        [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)],
        [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)],
    ];
};

/** Ellipse inside the dragged box (pixels). */
export const ellipseFromBox = (x1: number, y1: number, x2: number, y2: number) => ({
    cx: (x1 + x2) / 2,
    cy: (y1 + y2) / 2,
    rx: Math.abs(x2 - x1) / 2,
    ry: Math.abs(y2 - y1) / 2,
});

/** A tap without dragging makes no arrow / circle / stroke. */
export const isTinyShape = (s: MarkupShape, minSize = 0.012): boolean => {
    switch (s.kind) {
        case 'arrow':
            return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < minSize;
        case 'circle':
            return Math.abs(s.x2 - s.x1) < minSize && Math.abs(s.y2 - s.y1) < minSize;
        case 'pen':
            return s.points.length < 2;
        case 'text':
            return !s.text.trim();
        default:
            return true;
    }
};

/** Fit an image into maxDim (longest side), keeping the aspect ratio. Never upscales. */
export const fitSize = (w: number, h: number, maxDim: number): { width: number; height: number } => {
    const W = Math.max(1, Math.round(w || 1));
    const H = Math.max(1, Math.round(h || 1));
    const scale = Math.min(1, maxDim / Math.max(W, H));
    return { width: Math.max(1, Math.round(W * scale)), height: Math.max(1, Math.round(H * scale)) };
};

/** Simplify a freehand stroke: drop points closer than `minStep` (normalized) to the last kept one. */
export const simplifyStroke = (points: Array<[number, number]>, minStep = 0.003): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) out.push(p);
    }
    const end = points[points.length - 1];
    if (end && out[out.length - 1] !== end && out.length > 0) out.push(end);
    return out;
};

type Ctx = Pick<CanvasRenderingContext2D,
    'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'fill' | 'closePath' | 'ellipse' | 'fillText' | 'strokeText'
> & {
    lineWidth: number; strokeStyle: string | CanvasGradient | CanvasPattern; fillStyle: string | CanvasGradient | CanvasPattern;
    lineCap: CanvasLineCap; lineJoin: CanvasLineJoin; font: string; textBaseline: CanvasTextBaseline;
    shadowColor: string; shadowBlur: number;
};

/** Contrasting outline for labels and lines (dark on light colors, light on black). */
export const outlineFor = (color: string): string => (/^#(111827|000000|000)$/i.test(color) ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)');

/** Draws every shape on a canvas of w x h pixels (the image is drawn first by the caller). */
export const drawShapes = (ctx: Ctx, shapes: MarkupShape[], w: number, h: number): void => {
    const lw = strokeWidthFor(w, h);
    for (const s of shapes) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.shadowColor = outlineFor(s.color);
        ctx.shadowBlur = Math.max(2, lw * 0.8);
        ctx.lineWidth = lw;
        if (s.kind === 'arrow') {
            const x1 = s.x1 * w; const y1 = s.y1 * h; const x2 = s.x2 * w; const y2 = s.y2 * h;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            const [a, b] = arrowHead(x1, y1, x2, y2, lw * 5);
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.closePath();
            ctx.fill();
        } else if (s.kind === 'circle') {
            const e = ellipseFromBox(s.x1 * w, s.y1 * h, s.x2 * w, s.y2 * h);
            ctx.beginPath();
            ctx.ellipse(e.cx, e.cy, Math.max(1, e.rx), Math.max(1, e.ry), 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (s.kind === 'pen') {
            if (s.points.length > 1) {
                ctx.beginPath();
                ctx.moveTo(s.points[0][0] * w, s.points[0][1] * h);
                for (const [px, py] of s.points.slice(1)) ctx.lineTo(px * w, py * h);
                ctx.stroke();
            }
        } else if (s.kind === 'text') {
            const size = fontSizeFor(w, h);
            ctx.font = `700 ${size}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 0;
            ctx.lineWidth = Math.max(3, size * 0.18);
            ctx.strokeStyle = outlineFor(s.color);
            ctx.strokeText(s.text, s.x * w, s.y * h);
            ctx.fillText(s.text, s.x * w, s.y * h);
        }
        ctx.restore();
    }
};
