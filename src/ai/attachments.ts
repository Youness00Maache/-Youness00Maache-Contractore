/**
 * Photo attachments for the assistant (AI-020): compressed in the browser (≤1600 px, ~300 KB),
 * limited in number, sent to the model as base64, and embedded into documents only as uploaded
 * Storage URLs (never as base64 inside the saved document).
 */
import { compressImage, describeImageError, fileToDataUrl } from '../../utils/imageCompression.ts';
import type { RouterImage } from '../../supabase/functions/master-ai-router/shared/routerContract.ts';
import { escapeHtml } from '../../supabase/functions/master-ai-router/shared/documentSchema.ts';

export const MAX_AI_IMAGES = 3;

export interface PendingImage {
    id: string;
    file: File;
    name: string;
    previewUrl: string;
}

export async function prepareImage(file: File): Promise<PendingImage> {
    const compressed = await compressImage(file);
    if (!/^image\/(jpeg|png|webp)$/i.test(compressed.type)) {
        throw new Error('Please attach a JPG, PNG or WebP photo.');
    }
    return {
        id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `img-${Date.now()}`,
        file: compressed,
        name: file.name || 'photo.jpg',
        previewUrl: URL.createObjectURL(compressed),
    };
}

export function describeAttachmentError(error: unknown): string {
    return describeImageError(error);
}

export async function toRouterImages(images: PendingImage[]): Promise<RouterImage[]> {
    const out: RouterImage[] = [];
    for (const img of images.slice(0, MAX_AI_IMAGES)) {
        const dataUrl = await fileToDataUrl(img.file);
        const data = dataUrl.split(',')[1] || '';
        if (data) out.push({ mime_type: img.file.type || 'image/jpeg', data, name: img.name.slice(0, 80) });
    }
    return out;
}

/** Uploads photos and returns HTML to append to a report body. Skips photos that fail. */
export async function imagesToHtml(files: File[], upload?: (file: File) => Promise<string>): Promise<string> {
    if (!upload || !files.length) return '';
    const parts: string[] = [];
    for (const file of files) {
        try {
            const url = await upload(file);
            if (url && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/i.test(url)) parts.push(`<p><img src="${escapeHtml(url)}" alt="${escapeHtml(file.name || 'Site photo')}"></p>`);
        } catch { /* a failed upload must not block the draft */ }
    }
    return parts.length ? `<h3>Photos</h3>${parts.join('')}` : '';
}
