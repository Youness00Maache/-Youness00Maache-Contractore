/**
 * Job photos: Supabase calls + browser image work (compression, previews, public portal copies).
 * Order for a new photo: insert the row (the database checks the plan's storage cap and reserves the paths),
 * then upload the files (the storage policy only accepts reserved paths); a failed upload removes the row again.
 * Reads return null instead of throwing while the migration 20261113000400 is not applied.
 */
import { supabase } from '../../lib/supabase.ts';
import { compressImage } from '../../utils/imageCompression.ts';
import { isMissingBackendError, photoExtension } from '../requests/requestLogic.ts';
import { flushStorageCleanup } from '../requests/requestsApi.ts';
import {
    JOB_PHOTO_COLUMNS, mapPhotoRow, mapPhotoUsage, photoStoragePaths, portalPhotoPath,
    type JobPhoto, type PhotoTag, type PhotoUsage,
} from './photoLogic.ts';

export const JOB_PHOTOS_BUCKET = 'job-photos';
export const PORTAL_PHOTOS_BUCKET = 'portal-photos';
const THUMB_MAX = 360;

/** UUID v4 (row ids and file names). */
const newId = (): string => {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export const currentUserId = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
};

// ---------------------------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------------------------
const decode = async (blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> => {
    if (typeof createImageBitmap === 'function') {
        try {
            const bmp = await createImageBitmap(blob);
            return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
        } catch { /* fall back to <img> */ }
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined }); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read. Please use a JPG or PNG photo.')); };
        img.src = url;
    });
};

const toJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
    new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process the photo.'))), 'image/jpeg', quality));

/** Draws a blob onto a white canvas no bigger than maxDim. */
export const blobToCanvas = async (blob: Blob, maxDim: number): Promise<{ canvas: HTMLCanvasElement; width: number; height: number; naturalWidth: number; naturalHeight: number }> => {
    const d = await decode(blob);
    try {
        const scale = Math.min(1, maxDim / Math.max(d.width, d.height, 1));
        const width = Math.max(1, Math.round(d.width * scale));
        const height = Math.max(1, Math.round(d.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Your browser could not process this photo.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(d.source, 0, 0, width, height);
        return { canvas, width, height, naturalWidth: d.width, naturalHeight: d.height };
    } finally {
        d.close();
    }
};

/** Small JPEG data URL (for the PDF report and previews). */
export const blobToJpegDataUrl = async (blob: Blob, maxDim: number, quality = 0.82): Promise<string> => {
    const { canvas } = await blobToCanvas(blob, maxDim);
    return canvas.toDataURL('image/jpeg', quality);
};

export interface PreparedPhoto {
    main: File;
    thumb: Blob;
    width: number;
    height: number;
    takenAt: string;
}

/**
 * Compresses a photo with the app's compressImage (≤1600 px, ~300 KB; friendly errors for HEIC, PDFs, huge files),
 * makes sure the result is JPG/PNG/WebP, and builds a 360 px preview for the grid.
 */
export const preparePhoto = async (file: File): Promise<PreparedPhoto> => {
    let main = await compressImage(file);
    if (!photoExtension(main.type)) {
        const { canvas } = await blobToCanvas(main, 1600);
        const jpeg = await toJpeg(canvas, 0.85);
        main = new File([jpeg], `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    }
    const { canvas, naturalWidth, naturalHeight } = await blobToCanvas(main, THUMB_MAX);
    const thumb = await toJpeg(canvas, 0.72);
    const lm = Number(file.lastModified);
    const now = Date.now();
    // A camera shot's lastModified is when it was taken; ignore values in the future or before 2000.
    const takenAt = Number.isFinite(lm) && lm > 946684800000 && lm <= now + 60_000 ? new Date(lm).toISOString() : new Date(now).toISOString();
    return { main, thumb, width: naturalWidth, height: naturalHeight, takenAt };
};

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------
/** null = the feature isn't in the database yet. */
export const listJobPhotos = async (jobId: string): Promise<JobPhoto[] | null> => {
    const { data, error } = await supabase
        .from('job_photos')
        .select(JOB_PHOTO_COLUMNS)
        .eq('job_id', jobId)
        .order('taken_at', { ascending: false })
        .limit(1000);
    if (error) {
        if (isMissingBackendError(error)) return null;
        throw error;
    }
    return (data || []).map(mapPhotoRow);
};

export const fetchPhotoUsage = async (jobId: string, fallbackTier: string): Promise<PhotoUsage | null> => {
    const { data, error } = await supabase.rpc('get_photo_usage', { p_job_id: jobId });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapPhotoUsage(row, fallbackTier) : null;
};

/** Signed URLs (1 hour) for private photos; files that are missing are left out. */
export const signedPhotoUrls = async (paths: string[], bucket = JOB_PHOTOS_BUCKET): Promise<Record<string, string>> => {
    const unique = Array.from(new Set(paths.filter(Boolean)));
    const out: Record<string, string> = {};
    for (let i = 0; i < unique.length; i += 100) {
        const chunk = unique.slice(i, i + 100);
        const { data, error } = await supabase.storage.from(bucket).createSignedUrls(chunk, 3600);
        if (error || !data) continue;
        for (const item of data as Array<{ path: string | null; signedUrl: string | null; error: string | null }>) {
            if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl;
        }
    }
    return out;
};

export const downloadPhoto = async (path: string, bucket = JOB_PHOTOS_BUCKET): Promise<Blob> => {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) throw new Error(error?.message || 'The photo could not be downloaded.');
    return data;
};

export const portalPhotoUrl = (path: string): string => supabase.storage.from(PORTAL_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------
export const addJobPhoto = async (input: {
    userId: string;
    jobId: string;
    photo: PreparedPhoto;
    tag: PhotoTag;
    caption?: string;
    sourcePhotoId?: string | null;
    requestId?: string | null;
}): Promise<JobPhoto> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error("You're offline. Reconnect to add photos.");
    const id = newId();
    const ext = photoExtension(input.photo.main.type) || 'jpg';
    const paths = photoStoragePaths(input.userId, input.jobId, id, ext);
    const row = {
        id,
        user_id: input.userId,
        job_id: input.jobId,
        storage_path: paths.main,
        thumb_path: paths.thumb,
        tag: input.tag,
        caption: (input.caption || '').trim().slice(0, 500) || null,
        taken_at: input.photo.takenAt,
        width: input.photo.width || null,
        height: input.photo.height || null,
        size_bytes: Math.max(1, input.photo.main.size + input.photo.thumb.size),
        source_photo_id: input.sourcePhotoId || null,
        request_id: input.requestId || null,
    };
    const { data, error } = await supabase.from('job_photos').insert(row).select(JOB_PHOTO_COLUMNS).single();
    if (error) throw error;

    const bucket = supabase.storage.from(JOB_PHOTOS_BUCKET);
    const { error: upError } = await bucket.upload(paths.main, input.photo.main, { upsert: false, contentType: input.photo.main.type || 'image/jpeg', cacheControl: '3600' });
    if (upError) {
        await supabase.from('job_photos').delete().eq('id', id);
        flushStorageCleanup().catch(() => undefined);
        throw new Error(`The photo could not be uploaded. ${upError.message || ''}`.trim());
    }
    // The preview is optional: the grid falls back to the photo itself.
    await bucket.upload(paths.thumb, input.photo.thumb, { upsert: false, contentType: 'image/jpeg', cacheControl: '3600' }).catch(() => undefined);
    return mapPhotoRow(data);
};

export const updateJobPhoto = async (id: string, patch: { tag?: PhotoTag; caption?: string; takenAt?: string }): Promise<void> => {
    const row: Record<string, unknown> = {};
    if (patch.tag) row.tag = patch.tag;
    if (patch.caption !== undefined) row.caption = patch.caption.trim().slice(0, 500) || null;
    if (patch.takenAt) row.taken_at = patch.takenAt;
    if (!Object.keys(row).length) return;
    const { error } = await supabase.from('job_photos').update(row).eq('id', id);
    if (error) throw error;
};

/** Deletes rows; their files (and public copies) are queued by a trigger and removed right after. */
export const deleteJobPhotos = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const { error } = await supabase.from('job_photos').delete().in('id', ids);
    if (error) throw error;
    await flushStorageCleanup().catch(() => undefined);
};

/**
 * Show / hide a photo in the client portal. Sharing copies the file to the public portal-photos bucket under an
 * unguessable name; hiding clears the row (the trigger queues the public copy for deletion).
 */
export const setPhotoShared = async (photo: JobPhoto, shared: boolean, userId: string): Promise<Pick<JobPhoto, 'sharedInPortal' | 'portalPath'>> => {
    if (!shared) {
        const { error } = await supabase.from('job_photos').update({ shared_in_portal: false, portal_path: null }).eq('id', photo.id);
        if (error) throw error;
        flushStorageCleanup().catch(() => undefined);
        return { sharedInPortal: false, portalPath: null };
    }
    if (photo.sharedInPortal && photo.portalPath) return { sharedInPortal: true, portalPath: photo.portalPath };
    const portalPath = portalPhotoPath(userId, newId(), photo.storagePath);
    const { error: copyError } = await supabase.storage
        .from(JOB_PHOTOS_BUCKET)
        .copy(photo.storagePath, portalPath, { destinationBucket: PORTAL_PHOTOS_BUCKET });
    if (copyError) {
        // Older storage servers: download + upload instead of a server-side copy.
        const blob = await downloadPhoto(photo.storagePath);
        const { error: upError } = await supabase.storage.from(PORTAL_PHOTOS_BUCKET).upload(portalPath, blob, {
            upsert: false, contentType: blob.type || 'image/jpeg', cacheControl: '86400',
        });
        if (upError) throw new Error(`The photo could not be shared. ${upError.message || ''}`.trim());
    }
    const { error } = await supabase.from('job_photos').update({ shared_in_portal: true, portal_path: portalPath }).eq('id', photo.id);
    if (error) {
        await supabase.storage.from(PORTAL_PHOTOS_BUCKET).remove([portalPath]).catch(() => undefined);
        throw error;
    }
    return { sharedInPortal: true, portalPath };
};

/**
 * Request photos → the new job's timeline as "Before" photos (best effort: stops quietly at a plan limit).
 * Returns how many were added.
 */
export const addRequestPhotosToJob = async (input: { userId: string; jobId: string; requestId: string; files: File[] }): Promise<number> => {
    let added = 0;
    for (const file of input.files) {
        try {
            const photo = await preparePhoto(file);
            await addJobPhoto({ userId: input.userId, jobId: input.jobId, photo, tag: 'before', caption: 'From the quote request', requestId: input.requestId });
            added++;
        } catch (error) {
            if (/PLAN_LIMIT/i.test(String((error as any)?.message || ''))) break;
        }
    }
    return added;
};
