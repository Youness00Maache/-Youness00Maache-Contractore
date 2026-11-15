/**
 * Plan measurement (roadmap N9): storage layout + file checks. Pure (no Supabase).
 *
 * Private bucket `document-assets` (owner-folder policies: first folder = the user's id):
 *   <user>/plans/<job>/<random>-<name>.<pdf|jpg|png|webp>     the original plan
 *   <user>/plans/<job>/<random>-<name>.measure.png            its measurements (see below)
 *
 * The bucket only accepts PDF and image types (no application/json), so the measurement JSON is stored inside a
 * tiny 1×1 PNG (an iTXt text chunk, lib/plans/pngText.ts). A `.measure.json` file next to a plan is read too
 * (should the bucket ever accept JSON), but never written.
 *
 *   PLAN_LIMITS / planMimeFor / validatePlanFile
 *   planFolder(uid, job) / planStoragePath(uid, job, name, mime?, random?) / measurePathFor(planPath)
 *   parsePlanListing(entries)  folder listing → plans (newest first), each with its measurement file if any
 *   planTitle(fileName)        "a1b2c3d4e5f6-Floor-plan-L1.pdf" → "Floor plan L1"
 */
import { formatBytes, sanitizeFileName } from '../jobFiles/jobFileLogic.ts';

export const PLANS_BUCKET = 'document-assets';

export const PLAN_LIMITS = {
    /** the bucket's own limit */
    maxBytes: 15 * 1024 * 1024,
    /** pages of a PDF that can be measured */
    maxPages: 10,
    /** plans per job (listing size) */
    perJob: 40,
} as const;

export type PlanMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
const EXT_MIME: Record<string, PlanMime> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MIME_EXT: Record<PlanMime, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const PLAN_ACCEPT = '.pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

export const planMimeFor = (fileName: string, type?: string | null): PlanMime | null => {
    const t = String(type || '').toLowerCase();
    if (t === 'image/jpg') return 'image/jpeg';
    if ((Object.values(EXT_MIME) as string[]).includes(t)) return t as PlanMime;
    return EXT_MIME[sanitizeFileName(fileName).ext] ?? null;
};

export const planKindOf = (mime: PlanMime | null | undefined): 'pdf' | 'image' => (mime === 'application/pdf' ? 'pdf' : 'image');

/** A readable reason a file can't be a plan, or null. */
export function validatePlanFile(f: { name: string; size: number; type?: string | null }): string | null {
    if (!f || !(f.size > 0)) return 'This file is empty.';
    if (!planMimeFor(f.name, f.type)) return 'Plans can be PDFs or images (JPG, PNG, WebP).';
    if (f.size > PLAN_LIMITS.maxBytes) return `Plans can be up to ${formatBytes(PLAN_LIMITS.maxBytes)}. Save a smaller PDF (or only the pages you need) and try again.`;
    return null;
}

const randomPart = (len = 12): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(len);
    const c = globalThis.crypto;
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
};

const safeSegment = (s: string): string => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

export const planFolder = (userId: string, jobId: string): string => `${safeSegment(userId)}/plans/${safeSegment(jobId)}`;

/** `<user>/plans/<job>/<random>-<name>.<ext>`; the extension follows the file type. */
export function planStoragePath(userId: string, jobId: string, fileName: string, mime?: PlanMime | null, random = randomPart()): string {
    const { base } = sanitizeFileName(fileName);
    const type = mime || planMimeFor(fileName) || 'application/pdf';
    const r = random.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32).padEnd(8, '0');
    // ".measure" can't end a plan's own name (it would look like a measurement file)
    const name = base.replace(/(?:[-_.]?measure)+$/i, '') || 'plan';
    return `${planFolder(userId, jobId)}/${r}-${name.slice(0, 60)}.${MIME_EXT[type]}`;
}

const PLAN_FILE = /^([a-z0-9]{8,32})-([A-Za-z0-9_-]{1,80})\.(pdf|jpg|png|webp)$/;
const MEASURE_FILE = /^([a-z0-9]{8,32})-([A-Za-z0-9_-]{1,80})\.measure\.(png|json)$/;

/** The measurement file of a plan: same folder and name, `.measure.png`. */
export const measurePathFor = (planPath: string): string => planPath.replace(/\.(pdf|jpg|png|webp)$/i, '') + '.measure.png';

export const planTitle = (fileName: string): string => {
    const m = PLAN_FILE.exec(fileName);
    const base = m ? m[2] : fileName.replace(/\.[A-Za-z0-9]{1,8}$/, '');
    return base.replace(/[-_]+/g, ' ').trim() || 'Plan';
};

export interface StorageEntry {
    name: string;
    created_at?: string | null;
    updated_at?: string | null;
    metadata?: { size?: number; mimetype?: string } | null;
}

export interface PlanEntry {
    /** full storage path of the plan */
    path: string;
    fileName: string;
    title: string;
    kind: 'pdf' | 'image';
    mime: PlanMime;
    size: number | null;
    createdAt: string | null;
    /** the measurement file (png, else a json one), null = nothing measured yet */
    measurePath: string | null;
    measuredAt: string | null;
}

/** A folder listing → plans, newest first. Files that are not plans (or stray measurement files) are skipped. */
export function parsePlanListing(folder: string, entries: readonly StorageEntry[] | null | undefined): PlanEntry[] {
    const list = Array.isArray(entries) ? entries : [];
    const measures = new Map<string, StorageEntry & { ext: string }>();
    for (const e of list) {
        const m = e && typeof e.name === 'string' ? MEASURE_FILE.exec(e.name) : null;
        if (!m) continue;
        const key = `${m[1]}-${m[2]}`;
        const had = measures.get(key);
        if (!had || (had.ext === 'json' && m[3] === 'png')) measures.set(key, { ...e, ext: m[3] });
    }
    const out: PlanEntry[] = [];
    for (const e of list) {
        const m = e && typeof e.name === 'string' ? PLAN_FILE.exec(e.name) : null;
        if (!m) continue;
        const mime = EXT_MIME[m[3]];
        const measure = measures.get(`${m[1]}-${m[2]}`);
        out.push({
            path: `${folder}/${e.name}`,
            fileName: e.name,
            title: planTitle(e.name),
            kind: planKindOf(mime),
            mime,
            size: typeof e.metadata?.size === 'number' ? e.metadata.size : null,
            createdAt: e.created_at || null,
            measurePath: measure ? `${folder}/${measure.name}` : null,
            measuredAt: measure ? (measure.updated_at || measure.created_at || null) : null,
        });
    }
    const t = (s: string | null) => (s ? Date.parse(s) || 0 : 0);
    return out.sort((a, b) => t(b.createdAt) - t(a.createdAt) || a.title.localeCompare(b.title)).slice(0, PLAN_LIMITS.perJob);
}
