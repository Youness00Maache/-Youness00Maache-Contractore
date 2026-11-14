/**
 * Job photos without a connection (job page → Photos tab). No React, no Supabase: tested by
 * scripts/offline-drafts-check.ts.
 *
 *  - A photo taken or picked offline is compressed as usual (components/photos/photosApi.ts preparePhoto); the photo
 *    and its preview are kept on this device (outbox `blobs`, per user, with room limits below) next to an outbox item
 *    `job_photo` holding its row: stage, caption, taken-at, size, "show in portal".
 *  - The Photos tab shows them at once with a "Waiting to sync" chip; stage / caption / portal changes made offline
 *    (to any photo) wait in the outbox too.
 *  - On sync, uploadQueuedPhoto() does exactly what an online "Add photos" does (photosApi.addJobPhoto): insert the
 *    row (the database checks the plan's photo limits and reserves the paths), upload the photo and its preview to the
 *    same bucket and paths (<user>/<job>/<id>.<ext>, <id>_t.jpg), then the portal copy when it was asked for. A plan
 *    limit refusal keeps the photo on the device with the reason (blocked until the user acts).
 */
import {
    PHOTO_LIMITS, photoStoragePaths, photoTier,
    type JobPhoto, type PhotoTag, type PhotoUsage,
} from '../../components/photos/photoLogic.ts';
import { entityOf, itemsOfUser, type DocSyncTone, type OutboxItem } from './outboxModel.ts';
import type { OutboxBlobs } from './outboxStore.ts';

const MB = 1024 * 1024;

/** Room on this device for photos waiting to sync (per user). */
export const OFFLINE_PHOTO_MAX_COUNT = 200;
export const OFFLINE_PHOTO_MAX_BYTES = 200 * MB;
/** One photo (after compression it is ~300 KB; this only stops something unexpected). */
export const OFFLINE_PHOTO_FILE_MAX_BYTES = 15 * MB;

/** File names inside the item's blobs. */
export const PHOTO_FILE_MAIN = 'main';
export const PHOTO_FILE_THUMB = 'thumb';

/** Paths the Photos tab uses for a photo that is only on this device (never sent anywhere). */
export const OFFLINE_PATH_PREFIX = 'offline:';
export const offlineMainPath = (photoId: string) => `${OFFLINE_PATH_PREFIX}${photoId}`;
export const offlineThumbPath = (photoId: string) => `${OFFLINE_PATH_PREFIX}${photoId}:thumb`;
export const isOfflinePath = (path: string | null | undefined): boolean => typeof path === 'string' && path.startsWith(OFFLINE_PATH_PREFIX);

const TAGS: readonly PhotoTag[] = ['before', 'during', 'after', 'issue'];
const isTag = (v: unknown): v is PhotoTag => TAGS.includes(v as PhotoTag);

export const extensionForMime = (mime: string | null | undefined): 'jpg' | 'png' | 'webp' => {
    const m = String(mime || '').toLowerCase();
    if (m === 'image/png') return 'png';
    if (m === 'image/webp') return 'webp';
    return 'jpg';
};

export const cleanCaption = (caption: unknown): string | null => String(caption ?? '').trim().slice(0, 500) || null;

// ---------------------------------------------------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------------------------------------------------

export interface OfflinePhotoInput {
    userId: string;
    jobId: string;
    /** the photo's id (a UUID made on this device; kept on the account) */
    id: string;
    tag: PhotoTag;
    caption?: string | null;
    takenAt: string;
    width?: number | null;
    height?: number | null;
    /** compressed photo */
    mainType: string;
    mainSize: number;
    thumbSize: number;
    sourcePhotoId?: string | null;
    requestId?: string | null;
    /** show it in the client portal once it is uploaded */
    shared?: boolean;
}

/** The outbox data of a photo taken offline: its job_photos row without the storage paths (set when it syncs). */
export const offlinePhotoRow = (input: OfflinePhotoInput): Record<string, unknown> => ({
    id: input.id,
    user_id: input.userId,
    job_id: input.jobId,
    tag: isTag(input.tag) ? input.tag : 'during',
    caption: cleanCaption(input.caption),
    taken_at: input.takenAt,
    width: input.width || null,
    height: input.height || null,
    size_bytes: Math.max(1, Math.round((Number(input.mainSize) || 0) + (Number(input.thumbSize) || 0))),
    source_photo_id: input.sourcePhotoId || null,
    request_id: input.requestId || null,
    shared_in_portal: Boolean(input.shared),
    ext: extensionForMime(input.mainType),
});

/** Patch of an offline change to a photo: stage, caption, show / hide in the portal. */
export const photoEditPatch = (patch: { tag?: PhotoTag; caption?: string; shared?: boolean }): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (patch.tag && isTag(patch.tag)) out.tag = patch.tag;
    if (patch.caption !== undefined) out.caption = cleanCaption(patch.caption);
    if (patch.shared !== undefined) out.shared_in_portal = Boolean(patch.shared);
    return out;
};

/** This user's photo items (optionally of one job). */
export const photoItems = (items: readonly OutboxItem[], userId: string | null | undefined, jobId?: string | null): OutboxItem[] =>
    itemsOfUser(items, userId).filter(i => entityOf(i) === 'job_photo' && (!jobId || i.jobId === jobId));

/** Photos waiting on this device: how many, their size, and how many of them belong to `jobId`. */
export const pendingPhotoStats = (items: readonly OutboxItem[], userId: string | null | undefined, jobId?: string | null) => {
    let count = 0;
    let bytes = 0;
    let jobCount = 0;
    for (const i of photoItems(items, userId)) {
        if (i.kind !== 'create') continue;
        count++;
        bytes += Number(i.data?.size_bytes) || 0;
        if (jobId && i.jobId === jobId) jobCount++;
    }
    return { count, bytes, jobCount };
};

/**
 * Is there room on this device for `adding` more photos (about `addBytes` bytes)? `stored` = what already waits.
 * `allowed` is how many fit.
 */
export const offlinePhotoRoom = (stored: { count: number; bytes: number }, adding: number, addBytes: number): { ok: boolean; allowed: number; reason: string } => {
    const per = adding > 0 ? addBytes / adding : 0;
    let allowed = Math.max(0, Math.min(adding, OFFLINE_PHOTO_MAX_COUNT - stored.count));
    if (per > 0) allowed = Math.max(0, Math.min(allowed, Math.floor((OFFLINE_PHOTO_MAX_BYTES - stored.bytes) / per)));
    const ok = allowed >= adding;
    return {
        ok,
        allowed,
        reason: ok ? '' : `This device keeps up to ${OFFLINE_PHOTO_MAX_COUNT} photos (${Math.round(OFFLINE_PHOTO_MAX_BYTES / MB)} MB) while you're offline. Reconnect to upload the ones waiting, then add more.`,
    };
};

/**
 * The plan's photo usage as far as this device knows: the last usage read from the account (or the plan's limits
 * with the photos on the job's last loaded list) plus the photos waiting on this device. checkPhotoQuota() on it is
 * the offline version of the online check; the database checks again when the photos sync.
 */
export const offlinePhotoUsage = (
    known: PhotoUsage | null,
    plan: string,
    loadedJobCount: number,
    pending: { count: number; bytes: number; jobCount: number },
): PhotoUsage => {
    const base: PhotoUsage = known || (() => {
        const tier = photoTier(plan);
        return { tier, perJob: PHOTO_LIMITS[tier].perJob, totalBytes: PHOTO_LIMITS[tier].totalBytes, usedBytes: 0, usedCount: loadedJobCount, jobCount: loadedJobCount };
    })();
    return {
        ...base,
        jobCount: Math.max(base.jobCount, loadedJobCount) + pending.jobCount,
        usedCount: base.usedCount + pending.count,
        usedBytes: base.usedBytes + pending.bytes,
    };
};

/** What the Photos tab gets from the app's outbox (App.tsx). */
export interface OfflinePhotoApi {
    userId: string;
    /** this user's job photo items */
    items: OutboxItem[];
    /** the job isn't on the account yet (created offline): its photos wait with it, even online */
    jobWaiting: boolean;
    stateOf: (photoId: string) => { tone: DocSyncTone; label: string; reason: string } | null;
    add: (input: OfflinePhotoInput, files: { main: Blob; thumb: Blob }) => Promise<void>;
    edit: (photoId: string, jobId: string, patch: { tag?: PhotoTag; caption?: string; shared?: boolean }) => Promise<void>;
    discard: (photoId: string) => Promise<void>;
    filesOf: (photoId: string) => Promise<Record<string, Blob> | null>;
    fileUsage: () => Promise<{ count: number; bytes: number }>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------------------------------------------------

/** A photo that is only on this device, as the Photos tab shows it (its paths are the device copies). */
export const pendingPhotoToJobPhoto = (item: OutboxItem): JobPhoto => {
    const d = item.data || {};
    return {
        id: item.docId,
        jobId: String(d.job_id || item.jobId),
        storagePath: offlineMainPath(item.docId),
        thumbPath: offlineThumbPath(item.docId),
        tag: isTag(d.tag) ? d.tag : 'during',
        caption: String(d.caption || ''),
        takenAt: String(d.taken_at || item.createdAt),
        width: Number(d.width) || null,
        height: Number(d.height) || null,
        sizeBytes: Number(d.size_bytes) || 0,
        sharedInPortal: Boolean(d.shared_in_portal),
        portalPath: null,
        sourcePhotoId: (d.source_photo_id as string | null | undefined) ?? null,
        requestId: (d.request_id as string | null | undefined) ?? null,
        createdAt: item.createdAt,
    };
};

/**
 * The job's photos as the Photos tab shows them: the account's (or the device's last copy), with the changes made
 * offline on top and the photos taken offline added. Without such items the SAME array is returned.
 */
export const applyPhotoOverlay = (photos: JobPhoto[], items: readonly OutboxItem[], userId: string | null | undefined, jobId: string): JobPhoto[] => {
    const mine = photoItems(items, userId, jobId);
    if (!mine.length) return photos;
    const byId = new Map(photos.map(p => [p.id, p]));
    const added: JobPhoto[] = [];
    for (const item of mine) {
        const prev = byId.get(item.docId);
        if (item.kind === 'create' && !prev) { added.push(pendingPhotoToJobPhoto(item)); continue; }
        if (!prev) continue; // a change to a photo that isn't in this list (deleted elsewhere)
        const d = item.data || {};
        byId.set(item.docId, {
            ...prev,
            ...(isTag(d.tag) ? { tag: d.tag } : {}),
            ...('caption' in d ? { caption: String(d.caption || '') } : {}),
            ...('shared_in_portal' in d ? { sharedInPortal: Boolean(d.shared_in_portal) } : {}),
        });
    }
    return [...added, ...photos.map(p => byId.get(p.id) || p)];
};

// ---------------------------------------------------------------------------------------------------------------------
// Sync: the same upload as an online "Add photos"
// ---------------------------------------------------------------------------------------------------------------------

export interface PhotoUploadDeps {
    /** insert into job_photos (the database checks the plan's limits; PLAN_LIMIT on refusal) */
    insertRow: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    /** upload to the job-photos bucket (upsert off, like online) */
    upload: (path: string, file: Blob, contentType: string) => Promise<{ error: unknown }>;
    deleteRow: (id: string) => Promise<void>;
    updateRow: (id: string, patch: Record<string, unknown>) => Promise<{ error: unknown }>;
    /** the account's row (null = deleted) */
    fetchRow: (id: string) => Promise<JobPhoto | null>;
    /** show / hide in the portal (photosApi.setPhotoShared: the public copy) */
    share: (photo: JobPhoto, shared: boolean) => Promise<void>;
}

const errText = (e: unknown): string => {
    if (!e) return '';
    if (typeof e === 'string') return e;
    const x = e as { message?: unknown; error?: unknown; statusCode?: unknown; status?: unknown };
    return `${String(x.message || x.error || '')} ${String(x.statusCode ?? x.status ?? '')}`;
};
const isDuplicateRow = (e: unknown) => String((e as { code?: unknown } | null)?.code || '') === '23505' || /duplicate key/i.test(errText(e));
const isExistingFile = (e: unknown) => /already exists|duplicate|\b409\b/i.test(errText(e));

/** The job_photos row a queued photo is inserted with (same columns as photosApi.addJobPhoto). */
export const uploadRowFor = (row: Record<string, unknown>): { dbRow: Record<string, unknown>; paths: { main: string; thumb: string } } => {
    const id = String(row.id);
    const ext = row.ext === 'png' || row.ext === 'webp' ? row.ext : 'jpg';
    const paths = photoStoragePaths(String(row.user_id), String(row.job_id), id, ext);
    return {
        paths,
        dbRow: {
            id,
            user_id: row.user_id,
            job_id: row.job_id,
            storage_path: paths.main,
            thumb_path: paths.thumb,
            tag: isTag(row.tag) ? row.tag : 'during',
            caption: cleanCaption(row.caption),
            taken_at: row.taken_at,
            width: row.width || null,
            height: row.height || null,
            size_bytes: Math.max(1, Number(row.size_bytes) || 1),
            source_photo_id: row.source_photo_id || null,
            request_id: row.request_id || null,
        },
    };
};

/**
 * Sends one queued photo item. 'create': row, photo, preview, then the portal copy if asked (a retry after a partial
 * run is safe: an existing row / file counts as done). 'edit': stage / caption, then show / hide in the portal.
 * Resolves `{ error }` like the other entity saves (a network error keeps the item pending).
 */
export async function uploadQueuedPhoto(
    deps: PhotoUploadDeps,
    kind: 'create' | 'edit',
    row: Record<string, unknown>,
    files: OutboxBlobs | null | undefined,
): Promise<{ error: unknown }> {
    const id = String(row.id || '');
    if (!id) return { error: new Error('This photo has no id.') };
    if (kind === 'create') {
        const main = files?.files?.[PHOTO_FILE_MAIN];
        if (!main) return { error: new Error('The photo file is no longer on this device (the browser cleared its storage). Discard it and take the photo again.') };
        const { dbRow, paths } = uploadRowFor(row);
        const inserted = await deps.insertRow(dbRow);
        if (inserted.error && !isDuplicateRow(inserted.error)) return { error: inserted.error };
        const up = await deps.upload(paths.main, main, main.type || 'image/jpeg');
        if (up.error && !isExistingFile(up.error)) {
            // like online: a photo whose file didn't upload doesn't stay on the account (it is tried again later)
            await deps.deleteRow(id).catch(() => undefined);
            return { error: up.error };
        }
        const thumb = files?.files?.[PHOTO_FILE_THUMB];
        if (thumb) await deps.upload(paths.thumb, thumb, 'image/jpeg').catch(() => undefined); // optional, as online
        if (row.shared_in_portal === true) {
            try {
                await deps.share({
                    id, jobId: String(row.job_id), storagePath: paths.main, thumbPath: paths.thumb, tag: dbRow.tag as PhotoTag,
                    caption: String(dbRow.caption || ''), takenAt: String(row.taken_at || ''), width: null, height: null, sizeBytes: 0,
                    sharedInPortal: false, portalPath: null, sourcePhotoId: null, requestId: null, createdAt: '',
                }, true);
            } catch (e) {
                return { error: e }; // tried again: the row and the files already there count as done
            }
        }
        return { error: null };
    }
    const patch: Record<string, unknown> = {};
    if (isTag(row.tag)) patch.tag = row.tag;
    if ('caption' in row) patch.caption = cleanCaption(row.caption);
    if (Object.keys(patch).length) {
        const { error } = await deps.updateRow(id, patch);
        if (error) return { error };
    }
    if ('shared_in_portal' in row) {
        const current = await deps.fetchRow(id);
        if (!current) return { error: new Error('This photo was deleted on another device.') };
        const wanted = Boolean(row.shared_in_portal);
        if (current.sharedInPortal !== wanted) {
            try { await deps.share(current, wanted); } catch (e) { return { error: e }; }
        }
    }
    return { error: null };
}
