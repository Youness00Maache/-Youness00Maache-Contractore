/**
 * Plans (roadmap N9): turning a plan file into a bitmap.
 *
 *  - pdf.js is loaded LAZILY (dynamic import: only in the Plans chunk), legacy build for older iOS Safari, with its
 *    worker bundled from our own origin by Vite (`?url` asset; CSP worker-src 'self' allows it). No eval
 *    (isEvalSupported: false), no CDN fonts.
 *  - Bitmaps are capped (pixel count and longest side) so phones don't run out of canvas memory; a newer render
 *    cancels the older one; pages are released after rendering.
 *
 * Page units (what measurements are stored in): PDF points at scale 1 for a PDF page, natural pixels for an image.
 */
import { PLAN_LIMITS } from '../../lib/plans/planFiles.ts';

/** Bitmap caps (CSS px × devicePixelRatio already included by the caller). */
export const MAX_BITMAP_PIXELS = 12_000_000;
export const MAX_BITMAP_SIDE = 4096;

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDocProxy = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js + its worker (both from our own origin), loaded once. */
export function loadPdfJs(): Promise<PdfJs> {
    if (!pdfjsPromise) {
        pdfjsPromise = Promise.all([
            import('pdfjs-dist/legacy/build/pdf.mjs'),
            import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ]).then(([lib, worker]) => {
            lib.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
            return lib;
        }).catch((e) => {
            pdfjsPromise = null;
            throw e;
        });
    }
    return pdfjsPromise;
}

/** Scale that keeps a w × h page under the caps (never above `wanted`). */
export function cappedScale(w: number, h: number, wanted: number, maxPixels = MAX_BITMAP_PIXELS, maxSide = MAX_BITMAP_SIDE): number {
    if (!(w > 0) || !(h > 0) || !(wanted > 0)) return 1;
    const byPixels = Math.sqrt(maxPixels / (w * h));
    const bySide = maxSide / Math.max(w, h);
    return Math.max(0.05, Math.min(wanted, byPixels, bySide));
}

export interface PageSize { w: number; h: number }

export interface PlanSource {
    kind: 'pdf' | 'image';
    /** pages that can be measured (PDF: at most PLAN_LIMITS.maxPages) */
    pageCount: number;
    /** pages of the PDF in total */
    totalPages: number;
    pageSize(page: number): Promise<PageSize>;
    /**
     * Draws page `page` at `scale` (bitmap px per page unit) into a new canvas. A newer call cancels an older one
     * still running (the older promise rejects with { cancelled: true }).
     */
    render(page: number, scale: number): Promise<HTMLCanvasElement>;
    destroy(): void;
}

export const isCancelled = (e: unknown): boolean => !!e && typeof e === 'object' && (
    (e as { cancelled?: boolean }).cancelled === true || (e as { name?: string }).name === 'RenderingCancelledException'
);

export async function openPdfSource(data: ArrayBuffer): Promise<PlanSource> {
    const lib = await loadPdfJs();
    const doc: PdfDocProxy = await lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: true }).promise;
    const sizes = new Map<number, PageSize>();
    let current: { cancel: () => void } | null = null;
    const pageCount = Math.min(doc.numPages, PLAN_LIMITS.maxPages);
    return {
        kind: 'pdf',
        pageCount,
        totalPages: doc.numPages,
        async pageSize(n) {
            const hit = sizes.get(n);
            if (hit) return hit;
            const page = await doc.getPage(n);
            const vp = page.getViewport({ scale: 1 });
            const size = { w: vp.width, h: vp.height };
            sizes.set(n, size);
            page.cleanup();
            return size;
        },
        async render(n, scale) {
            current?.cancel();
            let cancelled = false;
            let task: { cancel: () => void; promise: Promise<void> } | null = null;
            const me = { cancel: () => { cancelled = true; task?.cancel(); } };
            current = me;
            const page = await doc.getPage(n);
            try {
                if (cancelled) throw { cancelled: true };
                const base = page.getViewport({ scale: 1 });
                const vp = page.getViewport({ scale: cappedScale(base.width, base.height, scale) });
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.floor(vp.width));
                canvas.height = Math.max(1, Math.floor(vp.height));
                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) throw new Error('This device could not draw the plan.');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                task = page.render({ canvasContext: ctx, viewport: vp });
                await task.promise;
                if (cancelled) throw { cancelled: true };
                return canvas;
            } finally {
                page.cleanup();
                if (current === me) current = null;
            }
        },
        destroy() {
            current?.cancel();
            void doc.destroy();
        },
    };
}

/** An image plan: one page, page units = the image's natural pixels. */
export async function openImageSource(blob: Blob): Promise<PlanSource> {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    try {
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('This image could not be opened.'));
            img.src = url;
        });
    } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
    }
    const size = { w: img.naturalWidth, h: img.naturalHeight };
    return {
        kind: 'image',
        pageCount: 1,
        totalPages: 1,
        pageSize: async () => size,
        async render(_n, scale) {
            const s = cappedScale(size.w, size.h, scale);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(size.w * s));
            canvas.height = Math.max(1, Math.round(size.h * s));
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('This device could not draw the plan.');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas;
        },
        destroy() {
            URL.revokeObjectURL(url);
            img.src = '';
        },
    };
}

export async function openPlanSource(kind: 'pdf' | 'image', blob: Blob): Promise<PlanSource> {
    return kind === 'pdf' ? openPdfSource(await blob.arrayBuffer()) : openImageSource(blob);
}
