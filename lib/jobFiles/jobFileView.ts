/**
 * Job files UI helpers (batch D3 phase B): pure, no React / Supabase, tested by scripts/job-files-check.ts.
 * The words and numbers the Files tab shows, kept out of the components so they can be checked without a browser.
 *
 *   dates        ymdOfIso, shortDate
 *   rows         stampOf (PDF / JPG / LINK), linkHost, rowMeta, versionBadge
 *   lists        categoryChips, filterGroups, groupByCategory, sharedDocuments, filesSummary
 *   sharing      shareInfo (can it go in the client portal, and why not)
 *   adding       FILE_ACCEPT, checkPickedFiles, titleFor
 */
import { todayYmd } from '../tasks/taskLogic.ts';
import {
    JOB_FILE_CATEGORIES, JOB_FILE_LIMITS,
    type JobFile, type JobFileCategory, type JobFileFilter, type JobFileGroup,
} from './jobFileTypes.ts';
import {
    canShareInPortal, filterFiles, formatBytes, shareBlockReason, titleFromFileName, validateFile,
} from './jobFileLogic.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// ===================================================================================================== dates
/** The local calendar day of an ISO timestamp ('YYYY-MM-DD'), or null. */
export const ymdOfIso = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : todayYmd(d);
};

/** "Nov 16" (with the year when it is not this year). '' for a bad date. */
export const shortDate = (iso: string | null | undefined, today: string = todayYmd()): string => {
    const ymd = ymdOfIso(iso);
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    const base = `${MONTHS[m - 1]} ${d}`;
    return y === Number(today.slice(0, 4)) ? base : `${base}, ${y}`;
};

// ===================================================================================================== rows
/** The small type stamp in front of a row. */
export const stampOf = (f: Pick<JobFile, 'kind' | 'mime'>): string => {
    if (f.kind === 'link') return 'LINK';
    switch (f.mime) {
        case 'application/pdf': return 'PDF';
        case 'image/jpeg': return 'JPG';
        case 'image/png': return 'PNG';
        case 'image/webp': return 'WEBP';
        case 'image/gif': return 'GIF';
        default: return 'FILE';
    }
};

/** "drive.google.com" of a link ('' when it is not a link). */
export const linkHost = (url: string | null | undefined): string => {
    if (!url) return '';
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

/** The grey line under a title: "2.4 MB · Nov 16" or "drive.google.com · Nov 16". */
export const rowMeta = (f: JobFile, today?: string): string[] => {
    const first = f.kind === 'link' ? linkHost(f.url) : (f.sizeBytes ? formatBytes(f.sizeBytes) : '');
    return [first, shortDate(f.createdAt, today)].filter(Boolean);
};

/** "v3" for a file (links have no versions). */
export const versionBadge = (f: Pick<JobFile, 'kind' | 'version'>): string => (f.kind === 'file' ? `v${f.version}` : '');

// ===================================================================================================== lists
export interface CategoryChip { id: JobFileCategory | 'all'; label: string; count: number }

/** "All" and every category that has documents (never an empty chip). */
export const categoryChips = (groups: readonly JobFileGroup[]): CategoryChip[] => {
    const counts = new Map<JobFileCategory, number>();
    for (const g of groups) counts.set(g.latest.category, (counts.get(g.latest.category) || 0) + 1);
    const chips: CategoryChip[] = [{ id: 'all', label: 'All', count: groups.length }];
    for (const c of JOB_FILE_CATEGORIES) {
        const n = counts.get(c.id) || 0;
        if (n > 0) chips.push({ id: c.id, label: c.label, count: n });
    }
    return chips;
};

/** Documents whose newest version matches the filter (category, tag, search, shared). */
export const filterGroups = (groups: readonly JobFileGroup[], filter: JobFileFilter): JobFileGroup[] =>
    groups.filter(g => filterFiles([g.latest], filter).length > 0);

export interface CategorySection { category: JobFileCategory; label: string; groups: JobFileGroup[] }

/** Sections in the category order; a category with nothing is left out. Inside a section the order of `groups` stays. */
export const groupByCategory = (groups: readonly JobFileGroup[]): CategorySection[] =>
    JOB_FILE_CATEGORIES
        .map(c => ({ category: c.id, label: c.label, groups: groups.filter(g => g.latest.category === c.id) }))
        .filter(s => s.groups.length > 0);

/** Documents the client can see (any version shown in the portal). */
export const sharedDocuments = (groups: readonly JobFileGroup[]): number =>
    groups.filter(g => g.versions.some(v => v.sharedInPortal)).length;

/** "5 documents · 2 shown to the client" ('' when nothing). */
export const filesSummary = (groups: readonly JobFileGroup[]): string => {
    if (groups.length === 0) return '';
    const shared = sharedDocuments(groups);
    return `${groups.length} ${groups.length === 1 ? 'document' : 'documents'}${shared ? ` · ${shared} shown to the client` : ''}`;
};

// ===================================================================================================== sharing
export interface ShareInfo {
    /** the toggle can be switched on */
    can: boolean;
    shared: boolean;
    /** why it can't (null when it can); for a PDF it already says "share a link to the file instead" */
    reason: string | null;
}

export const shareInfo = (f: Pick<JobFile, 'kind' | 'mime' | 'sizeBytes' | 'sharedInPortal'>): ShareInfo => ({
    can: canShareInPortal(f),
    shared: f.sharedInPortal,
    reason: shareBlockReason(f),
});

// ===================================================================================================== adding
export const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/gif';

export interface PickedFile { name: string; size: number; type?: string | null }

/** The files that can be added and a readable line for each one that can't. */
export const checkPickedFiles = <T extends PickedFile>(list: readonly T[], room: number = JOB_FILE_LIMITS.perJob): { ok: T[]; problems: string[] } => {
    const ok: T[] = [];
    const problems: string[] = [];
    for (const f of list) {
        const problem = validateFile(f);
        if (problem) problems.push(`${f.name || 'File'}: ${problem}`);
        else if (ok.length >= room) problems.push(`${f.name || 'File'}: this job already has ${JOB_FILE_LIMITS.perJob} files.`);
        else ok.push(f);
    }
    return { ok, problems };
};

/** The title a file starts with ("Floor plan rev B" from "Floor_plan_rev_B.pdf"). */
export const titleFor = (name: string): string => titleFromFileName(name);

// ===================================================================================================== words
/** Same sentence style as lib/offline/connection.ts, for the places that explain it before the user taps. */
export const FILES_NEED_CONNECTION = "You're offline. Files need a connection; they come back when you're online again.";
export const FILES_PREMIUM_REASON = 'Job files, links and versions are part of Premium.';

/** "Added 3 files" / "Added “Floor plan” (v2)". */
export const addedMessage = (count: number, title?: string, version?: number): string => {
    if (count === 1 && title) return version && version > 1 ? `Added v${version} of “${title}”.` : `Added “${title}”.`;
    return `Added ${count} ${count === 1 ? 'file' : 'files'}.`;
};
