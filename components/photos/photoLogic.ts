/**
 * Job photo timeline: pure helpers (no React, no Supabase). Tested by scripts/requests-photos-check.ts.
 * PHOTO_LIMITS mirrors public.photo_limits() in supabase/migrations/20261113000400_requests_and_job_photos.sql.
 */
import { esc } from '../../utils/escapeHtml.ts';

export type PhotoTag = 'before' | 'during' | 'after' | 'issue';
export type PhotoFilter = 'all' | PhotoTag | 'shared';

export const PHOTO_TAGS: { value: PhotoTag; label: string }[] = [
    { value: 'before', label: 'Before' },
    { value: 'during', label: 'During' },
    { value: 'after', label: 'After' },
    { value: 'issue', label: 'Issue' },
];

export const tagLabel = (tag: string): string => PHOTO_TAGS.find(t => t.value === tag)?.label || 'During';

export interface JobPhoto {
    id: string;
    jobId: string;
    storagePath: string;
    thumbPath: string | null;
    tag: PhotoTag;
    caption: string;
    takenAt: string;
    width: number | null;
    height: number | null;
    sizeBytes: number;
    sharedInPortal: boolean;
    portalPath: string | null;
    sourcePhotoId: string | null;
    requestId: string | null;
    createdAt: string;
}

export const JOB_PHOTO_COLUMNS = 'id, job_id, storage_path, thumb_path, tag, caption, taken_at, width, height, size_bytes, shared_in_portal, portal_path, source_photo_id, request_id, created_at';

const isTag = (v: unknown): v is PhotoTag => v === 'before' || v === 'during' || v === 'after' || v === 'issue';

export const mapPhotoRow = (r: any): JobPhoto => ({
    id: String(r?.id || ''),
    jobId: String(r?.job_id || ''),
    storagePath: String(r?.storage_path || ''),
    thumbPath: r?.thumb_path ? String(r.thumb_path) : null,
    tag: isTag(r?.tag) ? r.tag : 'during',
    caption: String(r?.caption || ''),
    takenAt: String(r?.taken_at || r?.created_at || ''),
    width: Number.isFinite(Number(r?.width)) && r?.width ? Number(r.width) : null,
    height: Number.isFinite(Number(r?.height)) && r?.height ? Number(r.height) : null,
    sizeBytes: Number(r?.size_bytes) || 0,
    sharedInPortal: Boolean(r?.shared_in_portal),
    portalPath: r?.portal_path ? String(r.portal_path) : null,
    sourcePhotoId: r?.source_photo_id ?? null,
    requestId: r?.request_id ?? null,
    createdAt: String(r?.created_at || ''),
});

// ---------------------------------------------------------------------------------------------
// Plan limits
// ---------------------------------------------------------------------------------------------
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PHOTO_LIMITS = {
    free: { perJob: 30 as number | null, totalBytes: 250 * MB },
    premium: { perJob: null as number | null, totalBytes: 5 * GB },
    ai: { perJob: null as number | null, totalBytes: 10 * GB },
} as const;

export type PhotoTier = keyof typeof PHOTO_LIMITS;
export const photoTier = (tier: string | null | undefined): PhotoTier => (tier === 'premium' || tier === 'ai' ? tier : 'free');

export interface PhotoUsage {
    tier: PhotoTier;
    perJob: number | null;
    totalBytes: number;
    usedBytes: number;
    usedCount: number;
    jobCount: number;
}

/** get_photo_usage() row → PhotoUsage (falls back to the plan table when the server sends no limits). */
export const mapPhotoUsage = (row: any, fallbackTier: string): PhotoUsage => {
    const tier = photoTier(row?.tier || fallbackTier);
    const l = row?.limits || {};
    const plan = PHOTO_LIMITS[tier];
    return {
        tier,
        perJob: 'per_job' in l ? (l.per_job === null ? null : Number(l.per_job)) : plan.perJob,
        totalBytes: Number(l.total_bytes) || plan.totalBytes,
        usedBytes: Number(row?.total_bytes) || 0,
        usedCount: Number(row?.total_count) || 0,
        jobCount: Number(row?.job_count) || 0,
    };
};

/**
 * Can `adding` more photos (with about `addBytes` bytes) be stored? Same rules as the guard_job_photo trigger:
 * per-job count (Free) and total bytes. `allowed` is how many of them fit.
 */
export const checkPhotoQuota = (usage: PhotoUsage, adding: number, addBytes: number): { ok: boolean; allowed: number; reason: string } => {
    let allowed = adding;
    let reason = '';
    if (usage.perJob !== null) {
        const room = Math.max(0, usage.perJob - usage.jobCount);
        if (room < allowed) {
            allowed = room;
            reason = `The Free plan keeps up to ${usage.perJob} photos per job. Upgrade to Premium for unlimited photos per job and 5 GB of photo storage.`;
        }
    }
    const per = adding > 0 ? addBytes / adding : 0;
    const roomBytes = Math.max(0, usage.totalBytes - usage.usedBytes);
    if (per > 0 && Math.floor(roomBytes / per) < allowed) {
        allowed = Math.floor(roomBytes / per);
        reason = usage.tier === 'free'
            ? `Your photos use all ${Math.round(usage.totalBytes / MB)} MB included in the Free plan. Upgrade to Premium for 5 GB of photo storage.`
            : usage.tier === 'premium'
                ? 'Your photos use all 5 GB included in Premium. Upgrade to Premium + AI for 10 GB, or delete photos you no longer need.'
                : 'Your photos use all 10 GB of photo storage. Delete photos you no longer need to add more.';
    }
    return { ok: allowed >= adding, allowed: Math.max(0, allowed), reason };
};

export const formatBytes = (n: number): string => {
    const v = Math.max(0, Number(n) || 0);
    if (v >= GB) return `${(v / GB).toFixed(v >= 10 * GB ? 0 : 1)} GB`;
    if (v >= MB) return `${(v / MB).toFixed(v >= 100 * MB ? 0 : 1)} MB`;
    if (v >= 1024) return `${Math.round(v / 1024)} KB`;
    return `${v} B`;
};

// ---------------------------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------------------------
export const filterPhotos = (photos: JobPhoto[], filter: PhotoFilter): JobPhoto[] => {
    if (filter === 'all') return photos;
    if (filter === 'shared') return photos.filter(p => p.sharedInPortal);
    return photos.filter(p => p.tag === filter);
};

export const countByFilter = (photos: JobPhoto[]): Record<PhotoFilter, number> => {
    const out: Record<PhotoFilter, number> = { all: photos.length, before: 0, during: 0, after: 0, issue: 0, shared: 0 };
    for (const p of photos) {
        out[p.tag] += 1;
        if (p.sharedInPortal) out.shared += 1;
    }
    return out;
};

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day of an instant (YYYY-MM-DD). */
export const localDay = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const byTakenDesc = (a: JobPhoto, b: JobPhoto) =>
    String(b.takenAt).localeCompare(String(a.takenAt)) || String(b.createdAt).localeCompare(String(a.createdAt));
const byTakenAsc = (a: JobPhoto, b: JobPhoto) => -byTakenDesc(a, b);

export const sortPhotos = (photos: JobPhoto[]): JobPhoto[] => [...photos].sort(byTakenDesc);

/** Newest day first, newest photo first inside a day. */
export const groupByDay = (photos: JobPhoto[], now = new Date()): { day: string; label: string; photos: JobPhoto[] }[] => {
    const groups = new Map<string, JobPhoto[]>();
    for (const p of sortPhotos(photos)) {
        const day = localDay(p.takenAt) || 'unknown';
        const list = groups.get(day);
        if (list) list.push(p); else groups.set(day, [p]);
    }
    const today = localDay(now.toISOString());
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const yesterday = localDay(y.toISOString());
    return Array.from(groups.entries()).map(([day, list]) => {
        let label = day;
        if (day === today) label = 'Today';
        else if (day === yesterday) label = 'Yesterday';
        else if (day !== 'unknown') {
            const [yy, mm, dd] = day.split('-').map(Number);
            const d = new Date(yy, mm - 1, dd);
            label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: yy === now.getFullYear() ? undefined : 'numeric' });
        } else label = 'Unknown date';
        return { day, label, photos: list };
    });
};

/** Stage for the next photos: Before on an empty job, then During. */
export const defaultTagForNewPhotos = (photos: JobPhoto[]): PhotoTag => (photos.length === 0 ? 'before' : 'during');

export interface PhotoPair { before: JobPhoto | null; after: JobPhoto | null }

/**
 * Before/after pairs, oldest first: the n-th before photo with the n-th after photo (a marked-up copy is used
 * instead of its original when both are in the list, so the same shot isn't printed twice). Unpaired photos
 * get a pair with one side empty.
 */
export const pairBeforeAfter = (photos: JobPhoto[]): PhotoPair[] => {
    const ids = new Set(photos.map(p => p.id));
    const replaced = new Set(photos.filter(p => p.sourcePhotoId && ids.has(p.sourcePhotoId)).map(p => p.sourcePhotoId as string));
    const usable = photos.filter(p => !replaced.has(p.id));
    const before = usable.filter(p => p.tag === 'before').sort(byTakenAsc);
    const after = usable.filter(p => p.tag === 'after').sort(byTakenAsc);
    const n = Math.max(before.length, after.length);
    const pairs: PhotoPair[] = [];
    for (let i = 0; i < n; i++) pairs.push({ before: before[i] || null, after: after[i] || null });
    return pairs;
};

/** Storage paths for a new photo: <user>/<job>/<id>.<ext> and the preview <id>_t.jpg (see guard_job_photo). */
export const photoStoragePaths = (userId: string, jobId: string, photoId: string, ext: 'jpg' | 'png' | 'webp' = 'jpg') => ({
    main: `${userId}/${jobId}/${photoId}.${ext}`,
    thumb: `${userId}/${jobId}/${photoId}_t.jpg`,
});

/** Public copy for the client portal: <user>/<random>.<ext> (portal-photos bucket). */
export const portalPhotoPath = (userId: string, randomId: string, storagePath: string): string => {
    const ext = /\.(png|webp)$/i.exec(storagePath)?.[1]?.toLowerCase() || 'jpg';
    return `${userId}/${randomId.replace(/[^A-Za-z0-9_-]/g, '')}.${ext}`;
};

// ---------------------------------------------------------------------------------------------
// Photo report (rich text for the Note template of the PDF pipeline)
// ---------------------------------------------------------------------------------------------
export interface ReportPhoto { src: string; caption: string; takenAt: string; tag: PhotoTag }
export interface ReportPair { before: ReportPhoto | null; after: ReportPhoto | null }

const fmtWhen = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const cell = (p: ReportPhoto | null, label: string): string => {
    if (!p) {
        return `<td style="width: 50%; vertical-align: top; padding: 6px;"><p style="color: #94a3b8; font-size: 12px;">No ${label.toLowerCase()} photo</p></td>`;
    }
    const when = fmtWhen(p.takenAt);
    const cap = [esc(label), when ? esc(when) : '', p.caption ? esc(p.caption) : ''].filter(Boolean).join(' · ');
    return `<td style="width: 50%; vertical-align: top; padding: 6px;"><img src="${esc(p.src)}" alt="${esc(label)}" style="width: 100%; max-width: 100%; border-radius: 6px;" /><p style="font-size: 11px; color: #475569; margin-top: 4px;">${cap}</p></td>`;
};

/**
 * Body of the "Before & after photo report": one two-column table per pair (so pages break between pairs),
 * then the extra photos (progress / issues) two per row. Every text is escaped; image sources must be data:
 * or https: URLs (the PDF sanitizer drops anything else).
 */
export const buildPhotoReportHtml = (input: { pairs: ReportPair[]; extra?: ReportPhoto[]; intro?: string }): string => {
    const parts: string[] = [];
    if (input.intro) parts.push(`<p>${esc(input.intro)}</p>`);
    if (input.pairs.length) {
        parts.push('<h3>Before &amp; after</h3>');
        for (const pair of input.pairs) {
            parts.push(`<table style="width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 10px;"><tbody><tr>${cell(pair.before, 'Before')}${cell(pair.after, 'After')}</tr></tbody></table>`);
        }
    }
    const extra = input.extra || [];
    if (extra.length) {
        parts.push(`<h3>${extra.every(p => p.tag === 'issue') ? 'Issues' : 'Progress photos'}</h3>`);
        for (let i = 0; i < extra.length; i += 2) {
            const a = extra[i];
            const b = extra[i + 1] || null;
            parts.push(`<table style="width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 10px;"><tbody><tr>${cell(a, tagLabel(a.tag))}${b ? cell(b, tagLabel(b.tag)) : '<td style="width: 50%;"></td>'}</tr></tbody></table>`);
        }
    }
    if (!parts.length) parts.push('<p>No photos selected.</p>');
    return parts.join('');
};
