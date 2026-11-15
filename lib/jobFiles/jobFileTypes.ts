/**
 * Job files + links (roadmap D3): shapes and limits. Database: public.job_files
 * (supabase/migrations/20261116000400_job_files_questions.sql). Premium. Lives inside the job page.
 *
 *   JobFile (one row = one version of one document, or one link)
 *   {
 *     id, userId, jobId,
 *     kind: 'file' | 'link',
 *     category: 'plans' | 'permits' | 'contracts' | 'specs' | 'receipts' | 'visuals' | 'other',
 *     title, notes: string | null, tags: string[] (lower case, <= 12 x 30 chars),
 *     storagePath: string | null   (kind 'file': private bucket document-assets, <user>/job-files/<job>/<rand>-<name>.<ext>)
 *     fileName: string | null      (original name, for the download)
 *     mime: JobFileMime | null, sizeBytes: number | null,
 *     url: string | null           (kind 'link': http(s) URL)
 *     version: number (1, 2, ...), versionGroup: string (rows of one document share it),
 *     sharedInPortal: boolean,
 *     portalPath: string | null    (public portal-photos copy of a shared IMAGE file; PDFs can't be shared yet)
 *     createdAt, updatedAt (ISO strings)
 *   }
 *   JobFileGroup  { versionGroup, latest: JobFile, versions: JobFile[] (newest first), count }
 *   NewFileInput  { file: File | Blob, fileName, title?, category?, notes?, tags? }
 *   NewLinkInput  { url, title?, category?, notes?, tags?, shared? }
 *   JobFilePatch  { title?, category?, notes?, tags?, url? (links only) }
 */

export type JobFileKind = 'file' | 'link';
export type JobFileCategory = 'plans' | 'permits' | 'contracts' | 'specs' | 'receipts' | 'visuals' | 'other';
export type JobFileMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface JobFile {
    id: string;
    userId: string;
    jobId: string;
    kind: JobFileKind;
    category: JobFileCategory;
    title: string;
    notes: string | null;
    tags: string[];
    storagePath: string | null;
    fileName: string | null;
    mime: JobFileMime | null;
    sizeBytes: number | null;
    url: string | null;
    version: number;
    versionGroup: string;
    sharedInPortal: boolean;
    portalPath: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface JobFileGroup {
    versionGroup: string;
    /** Highest version. */
    latest: JobFile;
    /** Every version, newest first. */
    versions: JobFile[];
    count: number;
}

export interface NewFileInput {
    file: Blob;
    /** The original file name (File.name). */
    fileName: string;
    title?: string;
    category?: JobFileCategory;
    notes?: string | null;
    tags?: readonly string[];
}

export interface NewLinkInput {
    url: string;
    title?: string;
    category?: JobFileCategory;
    notes?: string | null;
    tags?: readonly string[];
    /** Show in the client portal right away. */
    shared?: boolean;
}

export interface JobFilePatch {
    title?: string;
    category?: JobFileCategory;
    notes?: string | null;
    tags?: readonly string[];
    /** Links only. */
    url?: string;
}

export interface JobFileFilter {
    category?: JobFileCategory | 'all';
    tag?: string | null;
    /** Matches title, file name, notes, tags, URL (case-insensitive). */
    search?: string;
    kind?: JobFileKind | 'all';
    sharedOnly?: boolean;
}

export type JobFileSort = 'newest' | 'oldest' | 'title' | 'category';

/** Keep in sync with the migration (guard_job_file, column checks) and the document-assets bucket. */
export const JOB_FILE_LIMITS = {
    perJob: 500,
    maxFileBytes: 15 * 1024 * 1024,
    /** Image files shared in the portal are copied to portal-photos (5 MB, jpg / png / webp). */
    maxPortalImageBytes: 5 * 1024 * 1024,
    accountBytes: { premium: 5 * 1024 ** 3, ai: 10 * 1024 ** 3 } as const,
    tags: 12,
    tagLength: 30,
    title: 200,
    notes: 2000,
    url: 2000,
    fileName: 200,
} as const;

export const JOB_FILE_MIMES: readonly JobFileMime[] = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Images the portal can show (public portal-photos copy). */
export const PORTAL_SHAREABLE_MIMES: readonly JobFileMime[] = ['image/jpeg', 'image/png', 'image/webp'];

export const JOB_FILE_CATEGORIES: readonly { id: JobFileCategory; label: string }[] = [
    { id: 'plans', label: 'Plans' },
    { id: 'permits', label: 'Permits' },
    { id: 'contracts', label: 'Contracts' },
    { id: 'specs', label: 'Specs' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'visuals', label: 'Visuals / renders' },
    { id: 'other', label: 'Other' },
];
