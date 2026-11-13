/**
 * Client-side image downscaling/compression for logos, signatures, document photos and forum images.
 * - Keeps transparency: images with transparent pixels are exported as PNG (never JPEG, which turns them black).
 * - Opaque images are exported as JPEG on a white background, reducing quality until under the target size.
 * - Unsupported formats (HEIC/HEIF from iPhones, PDFs, ...) and huge files fail with a clear, user-facing message.
 */

export class ImageProcessingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImageProcessingError';
    }
}

const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
const TARGET_BYTES = 300 * 1024; // opaque images
const MAX_ALPHA_BYTES = 1024 * 1024; // transparent PNGs
const SKIP_BELOW_BYTES = 200 * 1024;
const MAX_DIMENSION = 1600;

const SUPPORTED_TYPES = /^image\/(png|jpe?g|webp|gif|bmp)$/i;

export const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

/** Throws an ImageProcessingError with a friendly message when the file can't be used. */
export const assertUsableImage = (file: File): void => {
    if (!file) throw new ImageProcessingError('No file selected.');
    if (isHeic(file)) {
        throw new ImageProcessingError('HEIC photos can’t be used here. On iPhone, set Camera → Formats → Most Compatible, or share the photo as JPG/PNG and try again.');
    }
    if (file.type && !file.type.startsWith('image/')) {
        throw new ImageProcessingError('That file isn’t an image. Please choose a JPG, PNG or WebP file.');
    }
    if (file.size > MAX_INPUT_BYTES) {
        throw new ImageProcessingError(`That image is ${(file.size / 1024 / 1024).toFixed(0)} MB. Please choose an image under 25 MB.`);
    }
};

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

const decodeImage = async (file: File): Promise<Decoded> => {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file);
            return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
        } catch {
            /* fall back to <img> */
        }
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ source: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, close: () => undefined });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new ImageProcessingError('This image format isn’t supported by your browser. Please use a JPG or PNG.'));
        };
        img.src = url;
    });
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new ImageProcessingError('Could not process the image.'))), type, quality);
    });

const hasTransparentPixels = (ctx: CanvasRenderingContext2D, width: number, height: number): boolean => {
    try {
        const { data } = ctx.getImageData(0, 0, width, height);
        // sample every 4th pixel: fast and good enough to detect transparent backgrounds
        for (let i = 3; i < data.length; i += 16) if (data[i] < 250) return true;
        return false;
    } catch {
        return true; // tainted canvas etc.: keep alpha to be safe
    }
};

const renameWithExt = (name: string, ext: string) => `${(name || 'image').replace(/\.[^/.]+$/, '')}.${ext}`;

/**
 * Downscales (max 1600px) and compresses an image. Returns the original file when it is already small and in a
 * supported format. Throws ImageProcessingError with a user-facing message on failure.
 */
export const compressImage = async (file: File): Promise<File> => {
    assertUsableImage(file);
    if (file.size <= SKIP_BELOW_BYTES && SUPPORTED_TYPES.test(file.type || '')) return file;

    const decoded = await decodeImage(file);
    try {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height, 1));
        let width = Math.max(1, Math.round(decoded.width * scale));
        let height = Math.max(1, Math.round(decoded.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new ImageProcessingError('Your browser could not process this image.');
        ctx.drawImage(decoded.source, 0, 0, width, height);

        const mayHaveAlpha = /png|webp|gif/i.test(file.type || '');
        if (mayHaveAlpha && hasTransparentPixels(ctx, width, height)) {
            // PNG keeps transparency. Shrink dimensions (not quality) until it's a reasonable size.
            let blob = await canvasToBlob(canvas, 'image/png');
            while (blob.size > MAX_ALPHA_BYTES && Math.max(width, height) > 400) {
                width = Math.round(width * 0.75);
                height = Math.round(height * 0.75);
                const next = document.createElement('canvas');
                next.width = width;
                next.height = height;
                const nctx = next.getContext('2d');
                if (!nctx) break;
                nctx.drawImage(canvas, 0, 0, width, height);
                canvas.width = width;
                canvas.height = height;
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(next, 0, 0);
                blob = await canvasToBlob(canvas, 'image/png');
            }
            return new File([blob], renameWithExt(file.name, 'png'), { type: 'image/png', lastModified: Date.now() });
        }

        // Opaque: flatten onto white (so nothing turns black) and export JPEG.
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';

        let quality = 0.9;
        let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        while (blob.size > TARGET_BYTES && quality > 0.45) {
            quality -= 0.1;
            blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        }
        return new File([blob], renameWithExt(file.name, 'jpg'), { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
        decoded.close();
    }
};

/** Reads a (compressed) image as a data URL. */
export const fileToDataUrl = (file: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new ImageProcessingError('Could not read the image.'));
        reader.readAsDataURL(file);
    });

/** User-facing message for any image error. */
export const describeImageError = (error: unknown): string => {
    if (error instanceof ImageProcessingError) return error.message;
    const msg = error instanceof Error ? error.message : '';
    if (/failed to fetch|network/i.test(msg)) return 'Upload failed: you appear to be offline. Please try again.';
    return msg ? `Image upload failed: ${msg}` : 'Image upload failed. Please use a JPG or PNG under 25 MB.';
};
