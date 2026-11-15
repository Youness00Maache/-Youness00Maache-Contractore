/**
 * Job files + links: pure logic (no Supabase, no React). Shapes: lib/jobFiles/jobFileTypes.ts.
 *
 *   categoryLabel(id) / isJobFileCategory(x) / guessCategory(fileName, mime)
 *   normalizeTags(list | "a, b")       -> string[]   (trim, lower case, 30 chars, no duplicates, max 12)
 *   sanitizeFileName(name)             -> { base, ext }   (safe storage name parts; ext '' when unknown)
 *   mimeFor(fileName, type?)           -> JobFileMime | null
 *   validateFile({ name, size, type }) -> string | null   (a readable error, or null when ok)
 *   validateLink(url)                  -> { ok: true, url } | { ok: false, error }   (http / https only)
 *   jobFileStoragePath(userId, jobId, fileName, mime?, random?) -> '<user>/job-files/<job>/<rand>-<base>.<ext>'
 *   titleFromFileName(name) / titleFromLink(url) / shareBlockReason(file) / nextVersionNumber(files, group) / totalBytes(files)
 *   portalFilePath(userId, random, mime)                 -> '<user>/<random>.<jpg|png|webp>' (public copy)
 *   canShareInPortal(file)             -> boolean      (links, and image files the portal can show)
 *   groupVersions(files)               -> JobFileGroup[] (newest activity first)
 *   latestVersions(files)              -> JobFile[]     (one per document)
 *   filterFiles(files, filter) / sortFiles(files, sort) / allTags(files) / countByCategory(files)
 *   formatBytes(n)
 *   mapJobFileRow(row) / jobFileInsertRow(...) / jobFilePatchRow(patch)   (database rows <-> JobFile)
 */
import {
    JOB_FILE_CATEGORIES, JOB_FILE_LIMITS, JOB_FILE_MIMES, PORTAL_SHAREABLE_MIMES,
    type JobFile, type JobFileCategory, type JobFileFilter, type JobFileGroup, type JobFileMime, type JobFilePatch, type JobFileSort,
} from './jobFileTypes.ts';

// ------------------------------------------------------------------------------------------------ categories
export const isJobFileCategory = (x: unknown): x is JobFileCategory =>
    typeof x === 'string' && JOB_FILE_CATEGORIES.some(c => c.id === x);

export const categoryLabel = (id: JobFileCategory): string => JOB_FILE_CATEGORIES.find(c => c.id === id)?.label ?? 'Other';

/** A first guess from the file name (the user can change it). */
export const guessCategory = (fileName: string, mime?: string | null): JobFileCategory => {
    // "Kitchen_plan_A101.pdf": an underscore is a word character, so it would hide the word boundary
    const n = (fileName || '').toLowerCase().replace(/_+/g, ' ');
    if (/\b(plan|plans|drawing|blueprint|floor|elevation|layout|dwg|sheet[-_ ]?a\d)/.test(n)) return 'plans';
    if (/permit|inspection|approval/.test(n)) return 'permits';
    if (/contract|agreement|signed|change[-_ ]?order/.test(n)) return 'contracts';
    if (/spec|datasheet|data[-_ ]sheet|submittal|manual|warranty/.test(n)) return 'specs';
    if (/receipt|invoice|bill/.test(n)) return 'receipts';
    if (/render|visual|3d|mood|concept/.test(n)) return 'visuals';
    if (mime && mime.startsWith('image/')) return 'visuals';
    return 'other';
};

// ------------------------------------------------------------------------------------------------ tags
export const normalizeTags = (input: readonly string[] | string | null | undefined): string[] => {
    const raw = typeof input === 'string' ? input.split(/[,;\n]/) : (input || []);
    const out: string[] = [];
    for (const t of raw) {
        const tag = String(t ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().toLowerCase().replace(/^#+/, '').slice(0, JOB_FILE_LIMITS.tagLength).trim();
        if (tag && !out.includes(tag)) out.push(tag);
        if (out.length >= JOB_FILE_LIMITS.tags) break;
    }
    return out;
};

// ------------------------------------------------------------------------------------------------ files
const EXT_MIME: Record<string, JobFileMime> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};
const MIME_EXT: Record<JobFileMime, string> = {
    'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

/** Safe storage name parts: base [A-Za-z0-9_-]{1,80} (accents dropped), ext lower case without the dot. */
export const sanitizeFileName = (name: string): { base: string; ext: string } => {
    const clean = String(name || '').split(/[\\/]/).pop() || '';
    const m = /^(.*?)(?:\.([A-Za-z0-9]{1,8}))?$/.exec(clean.trim());
    const ext = (m?.[2] || '').toLowerCase();
    const base = (m?.[1] || '')
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 80).replace(/-+$/g, '');
    return { base: base || 'file', ext };
};

/** The file's type: the browser's type when it is one we keep, else from the extension. */
export const mimeFor = (fileName: string, type?: string | null): JobFileMime | null => {
    const t = String(type || '').toLowerCase();
    if ((JOB_FILE_MIMES as readonly string[]).includes(t)) return t as JobFileMime;
    if (t === 'image/jpg') return 'image/jpeg';
    return EXT_MIME[sanitizeFileName(fileName).ext] ?? null;
};

export const formatBytes = (n: number | null | undefined): string => {
    const b = Math.max(0, Number(n) || 0);
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
    return `${(b / 1024 ** 3).toFixed(1)} GB`;
};

/** A readable error for a file that can't be added, or null. */
export const validateFile = (f: { name: string; size: number; type?: string | null }): string | null => {
    if (!f || !(f.size > 0)) return 'This file is empty.';
    if (!mimeFor(f.name, f.type)) return 'Add PDFs or images (JPG, PNG, WebP, GIF). For other files, add a link instead.';
    if (f.size > JOB_FILE_LIMITS.maxFileBytes) return `Files can be up to ${formatBytes(JOB_FILE_LIMITS.maxFileBytes)}. For bigger files, add a link instead.`;
    return null;
};

/** http(s) links only; adds https:// to a bare "drive.google.com/..." */
export const validateLink = (input: string): { ok: true; url: string; error: null } | { ok: false; url: null; error: string } => {
    let s = String(input ?? '').trim();
    if (!s) return { ok: false, url: null, error: 'Paste a link.' };
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
    if (!/^https?:\/\//i.test(s)) return { ok: false, url: null, error: 'Links must start with http:// or https://' };
    if (/\s/.test(s)) return { ok: false, url: null, error: 'Links cannot contain spaces.' };
    if (s.length > JOB_FILE_LIMITS.url) return { ok: false, url: null, error: 'This link is too long.' };
    try {
        const u = new URL(s);
        if (!u.hostname || !u.hostname.includes('.') && u.hostname !== 'localhost') return { ok: false, url: null, error: 'Check the link.' };
    } catch {
        return { ok: false, url: null, error: 'Check the link.' };
    }
    return { ok: true, url: s, error: null };
};

/** A title from a link: the host + last path part ("drive.google.com", "matterport.com/show"). */
export const titleFromLink = (url: string): string => {
    try {
        const u = new URL(url);
        const last = u.pathname.split('/').filter(Boolean).pop();
        return `${u.hostname.replace(/^www\./, '')}${last ? `/${decodeURIComponent(last)}` : ''}`.slice(0, JOB_FILE_LIMITS.title);
    } catch {
        return url.slice(0, JOB_FILE_LIMITS.title);
    }
};

/** A title from a file name: without the extension, separators as spaces. */
export const titleFromFileName = (name: string): string => {
    const clean = String(name || '').split(/[\\/]/).pop() || '';
    return (clean.replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/[_]+/g, ' ').trim() || 'File').slice(0, JOB_FILE_LIMITS.title);
};

const randomPart = (len = 12): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(len);
    const c = globalThis.crypto;
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
};

/**
 * Private storage path (matches the job_files.storage_path check). The extension follows the file type (`mime`, else
 * the name's own extension). `random`: 8-32 of [a-z0-9] (tests pass one).
 */
export const jobFileStoragePath = (userId: string, jobId: string, fileName: string, mime?: JobFileMime | null, random = randomPart()): string => {
    const { base, ext } = sanitizeFileName(fileName);
    const type = mime || mimeFor(fileName);
    const safeExt = type ? (EXT_MIME[ext] === type ? ext : MIME_EXT[type]) : 'pdf';
    const r = random.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32).padEnd(8, '0');
    return `${userId}/job-files/${jobId}/${r}-${base}.${safeExt}`;
};

/** Public portal copy of an image file (matches job_files.portal_path and the portal-photos bucket). */
export const portalFilePath = (userId: string, random: string, mime: JobFileMime): string => {
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const r = random.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80).padEnd(6, '0');
    return `${userId}/${r}.${ext}`;
};

/** Links always; files only when the portal can show them (jpg / png / webp up to 5 MB). */
export const canShareInPortal = (f: Pick<JobFile, 'kind' | 'mime' | 'sizeBytes'>): boolean =>
    f.kind === 'link' || (!!f.mime && PORTAL_SHAREABLE_MIMES.includes(f.mime) && (f.sizeBytes ?? 0) <= JOB_FILE_LIMITS.maxPortalImageBytes);

/** Why a file can't be shared (null = it can). */
export const shareBlockReason = (f: Pick<JobFile, 'kind' | 'mime' | 'sizeBytes'>): string | null => {
    if (canShareInPortal(f)) return null;
    if (f.mime && PORTAL_SHAREABLE_MIMES.includes(f.mime)) return 'Images up to 5 MB can be shown in the client portal.';
    return 'PDFs and GIFs can\'t be shown in the client portal yet. Share a link to the file instead.';
};

// ------------------------------------------------------------------------------------------------ versions
const time = (iso: string): number => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };

/** Versions of each document together; groups sorted by their newest activity, versions newest first. */
export const groupVersions = (files: readonly JobFile[]): JobFileGroup[] => {
    const byGroup = new Map<string, JobFile[]>();
    for (const f of files) {
        const list = byGroup.get(f.versionGroup);
        if (list) list.push(f); else byGroup.set(f.versionGroup, [f]);
    }
    const groups: JobFileGroup[] = [];
    for (const [versionGroup, list] of byGroup) {
        const versions = [...list].sort((a, b) => b.version - a.version || time(b.createdAt) - time(a.createdAt));
        groups.push({ versionGroup, latest: versions[0], versions, count: versions.length });
    }
    return groups.sort((a, b) => time(b.latest.createdAt) - time(a.latest.createdAt) || a.latest.title.localeCompare(b.latest.title));
};

/** One row per document: its highest version. */
export const latestVersions = (files: readonly JobFile[]): JobFile[] => groupVersions(files).map(g => g.latest);

/** The version number the database will give a new version of this group (for "Upload v3"). */
export const nextVersionNumber = (files: readonly JobFile[], versionGroup: string): number =>
    files.filter(f => f.versionGroup === versionGroup).reduce((m, f) => Math.max(m, f.version), 0) + 1;

// ------------------------------------------------------------------------------------------------ lists
export const filterFiles = (files: readonly JobFile[], filter: JobFileFilter = {}): JobFile[] => {
    const q = (filter.search || '').trim().toLowerCase();
    const tag = filter.tag ? normalizeTags([filter.tag])[0] : null;
    return files.filter(f => {
        if (filter.category && filter.category !== 'all' && f.category !== filter.category) return false;
        if (filter.kind && filter.kind !== 'all' && f.kind !== filter.kind) return false;
        if (filter.sharedOnly && !f.sharedInPortal) return false;
        if (tag && !f.tags.includes(tag)) return false;
        if (q) {
            const hay = [f.title, f.fileName, f.notes, f.url, ...f.tags].filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
};

const CATEGORY_ORDER = new Map(JOB_FILE_CATEGORIES.map((c, i) => [c.id, i]));

export const sortFiles = (files: readonly JobFile[], sort: JobFileSort = 'newest'): JobFile[] => {
    const list = [...files];
    const byTitle = (a: JobFile, b: JobFile) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    switch (sort) {
        case 'oldest': return list.sort((a, b) => time(a.createdAt) - time(b.createdAt) || byTitle(a, b));
        case 'title': return list.sort((a, b) => byTitle(a, b) || b.version - a.version);
        case 'category': return list.sort((a, b) => (CATEGORY_ORDER.get(a.category)! - CATEGORY_ORDER.get(b.category)!) || byTitle(a, b));
        default: return list.sort((a, b) => time(b.createdAt) - time(a.createdAt) || byTitle(a, b));
    }
};

/** Every tag in use, most used first. */
export const allTags = (files: readonly JobFile[]): string[] => {
    const counts = new Map<string, number>();
    for (const f of files) for (const t of f.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
};

/** Documents (latest versions) per category, every category present (0 when empty). */
export const countByCategory = (files: readonly JobFile[]): Record<JobFileCategory, number> => {
    const out = Object.fromEntries(JOB_FILE_CATEGORIES.map(c => [c.id, 0])) as Record<JobFileCategory, number>;
    for (const f of latestVersions(files)) out[f.category] += 1;
    return out;
};

/** Bytes of all versions (what counts against the account's file storage). */
export const totalBytes = (files: readonly JobFile[]): number => files.reduce((s, f) => s + (f.sizeBytes || 0), 0);

// ------------------------------------------------------------------------------------------------ rows
export const JOB_FILE_COLUMNS =
    'id, user_id, job_id, kind, category, title, notes, tags, storage_path, file_name, mime, size_bytes, url, version, version_group, shared_in_portal, portal_path, created_at, updated_at';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export const mapJobFileRow = (r: Record<string, unknown>): JobFile => ({
    id: String(r.id),
    userId: String(r.user_id ?? ''),
    jobId: String(r.job_id ?? ''),
    kind: r.kind === 'link' ? 'link' : 'file',
    category: isJobFileCategory(r.category) ? r.category : 'other',
    title: String(r.title ?? ''),
    notes: str(r.notes),
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
    storagePath: str(r.storage_path),
    fileName: str(r.file_name),
    mime: (JOB_FILE_MIMES as readonly string[]).includes(String(r.mime)) ? (r.mime as JobFileMime) : null,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    url: str(r.url),
    version: Number(r.version) || 1,
    versionGroup: String(r.version_group ?? r.id),
    sharedInPortal: r.shared_in_portal === true,
    portalPath: str(r.portal_path),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? r.created_at ?? ''),
});

const cleanTitle = (s: string | undefined | null): string => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, JOB_FILE_LIMITS.title);
const cleanNotes = (s: string | undefined | null): string | null => {
    const t = String(s ?? '').trim().slice(0, JOB_FILE_LIMITS.notes);
    return t || null;
};

/** Insert row of a file (after its storage path is chosen). versionGroup: an existing group for a new version. */
export const jobFileInsertRow = (p: {
    userId: string; jobId: string; storagePath: string; fileName: string; mime: JobFileMime; sizeBytes: number;
    title?: string; category?: JobFileCategory; notes?: string | null; tags?: readonly string[]; versionGroup?: string;
}): Record<string, unknown> => ({
    user_id: p.userId,
    job_id: p.jobId,
    kind: 'file',
    category: p.category && isJobFileCategory(p.category) ? p.category : guessCategory(p.fileName, p.mime),
    title: cleanTitle(p.title) || titleFromFileName(p.fileName),
    notes: cleanNotes(p.notes),
    tags: normalizeTags(p.tags || []),
    storage_path: p.storagePath,
    file_name: String(p.fileName || '').split(/[\\/]/).pop()!.slice(0, JOB_FILE_LIMITS.fileName) || null,
    mime: p.mime,
    size_bytes: p.sizeBytes,
    ...(p.versionGroup ? { version_group: p.versionGroup } : {}),
});

export const jobLinkInsertRow = (p: {
    userId: string; jobId: string; url: string; title?: string; category?: JobFileCategory; notes?: string | null;
    tags?: readonly string[]; shared?: boolean; versionGroup?: string;
}): Record<string, unknown> => ({
    user_id: p.userId,
    job_id: p.jobId,
    kind: 'link',
    category: p.category && isJobFileCategory(p.category) ? p.category : 'other',
    title: cleanTitle(p.title) || titleFromLink(p.url),
    notes: cleanNotes(p.notes),
    tags: normalizeTags(p.tags || []),
    url: p.url,
    shared_in_portal: !!p.shared,
    ...(p.versionGroup ? { version_group: p.versionGroup } : {}),
});

/** Update row (only the fields given). Throws on an invalid link. */
export const jobFilePatchRow = (patch: JobFilePatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) {
        const t = cleanTitle(patch.title);
        if (!t) throw new Error('Give the file a name.');
        row.title = t;
    }
    if (patch.category !== undefined && isJobFileCategory(patch.category)) row.category = patch.category;
    if (patch.notes !== undefined) row.notes = cleanNotes(patch.notes);
    if (patch.tags !== undefined) row.tags = normalizeTags(patch.tags);
    if (patch.url !== undefined) {
        const v = validateLink(patch.url);
        if (!v.ok) throw new Error(v.error);
        row.url = v.url;
    }
    return row;
};
