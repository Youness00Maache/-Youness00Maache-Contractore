/**
 * Job files + links: Supabase calls of the signed-in contractor (shapes: lib/jobFiles/jobFileTypes.ts, pure logic:
 * lib/jobFiles/jobFileLogic.ts). Table public.job_files, files in the private bucket `document-assets`.
 *
 *  - Keep the feature HIDDEN until the migration is applied: `useJobFilesFeature(userId, online) === 'ready'`.
 *    Reads return null while the table is missing (and mark the feature missing).
 *  - Every write needs a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline it throws an Error
 *    whose message is NEEDS_CONNECTION; other failures throw an Error with a readable message (a plan limit reads
 *    "PLAN_LIMIT: ..." like the other Premium tables: show the upgrade prompt when isPlanLimitError(e)).
 *
 * API (all async unless noted):
 *   probeJobFilesBackend()                               'ready' | 'missing' | 'error'
 *   jobFilesFeature / useJobFilesFeature(uid, online)    feature state (sync hook)
 *   listJobFiles(jobId)                                  JobFile[] | null   (every version, newest first; use
 *                                                        groupVersions / latestVersions from jobFileLogic)
 *   addJobFile(userId, jobId, input: NewFileInput)       JobFile   (row first: plan + cap checks; then the upload;
 *                                                        a failed upload removes the row)
 *   addJobFileVersion(userId, of: JobFile, input)        JobFile   (same document: version = highest + 1; keeps the
 *                                                        category / title / tags unless given)
 *   addJobLink(userId, jobId, input: NewLinkInput)       JobFile
 *   updateJobFile(id, patch: JobFilePatch)               JobFile
 *   setJobFileShared(file, shared, userId)               JobFile   (links: a flag; image files: public copy in
 *                                                        portal-photos; PDFs throw shareBlockReason)
 *   deleteJobFile(file)                                  void      (row + its private file; the public copy is
 *                                                        queued by the database)
 *   deleteJobFileVersions(files)                         void      (a whole document: every version)
 *   jobFileUrl(file, { seconds?, download? })            string | null  (links: the URL; files: a signed URL, 1 h)
 *   portalJobFileUrl(path)                               string (sync)  (public URL of a shared image copy)
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isCrewBackendMissing, isNetworkError } from '../crew/crewLogic.ts';
import { flushStorageCleanup } from '../../components/requests/requestsApi.ts';
import { createBackendFeature } from './featureFlag.ts';
import {
    JOB_FILE_COLUMNS, jobFileInsertRow, jobFilePatchRow, jobFileStoragePath, jobLinkInsertRow, mapJobFileRow, mimeFor,
    portalFilePath, shareBlockReason, validateFile, validateLink,
} from './jobFileLogic.ts';
import { JOB_FILE_LIMITS, type JobFile, type JobFilePatch, type NewFileInput, type NewLinkInput } from './jobFileTypes.ts';

export const JOB_FILES_BUCKET = 'document-assets';
export const JOB_FILES_PORTAL_BUCKET = 'portal-photos';

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

/** A plan limit refusal (Premium, storage cap): show the upgrade prompt. */
export const isPlanLimitError = (e: unknown): boolean => /PLAN_LIMIT/.test(String((e as { message?: unknown } | null)?.message ?? e ?? ''));

const writeError = (error: DbError | unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isCrewBackendMissing(error as any)) { jobFilesFeature.markMissing(); return new Error('Job files are not switched on yet. Please try again later.'); }
    return new Error(errorText(error, fallback));
};

const newId = (): string => {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

// ------------------------------------------------------------------------------------------------- feature
export async function probeJobFilesBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const { error } = await supabase.from('job_files').select('id').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export const jobFilesFeature = createBackendFeature('cd.jobFiles.feature', probeJobFilesBackend);
export const useJobFilesFeature = jobFilesFeature.useFeature;

// ------------------------------------------------------------------------------------------------- reads
export async function listJobFiles(jobId: string): Promise<JobFile[] | null> {
    const res = await supabase.from('job_files').select(JOB_FILE_COLUMNS).eq('job_id', jobId)
        .order('created_at', { ascending: false }).limit(JOB_FILE_LIMITS.perJob);
    if (res.error) {
        if (isCrewBackendMissing(res.error as any)) { jobFilesFeature.markMissing(); return null; }
        throw writeError(res.error, 'The job files could not be loaded.');
    }
    return ((res.data as Record<string, unknown>[] | null) || []).map(mapJobFileRow);
}

/** Links: the URL. Files: a signed URL of the private file (default 1 hour); `download` asks the browser to save it. */
export async function jobFileUrl(file: JobFile, opts: { seconds?: number; download?: boolean } = {}): Promise<string | null> {
    if (file.kind === 'link') return file.url;
    if (!file.storagePath) return null;
    const { data, error } = await supabase.storage.from(JOB_FILES_BUCKET)
        .createSignedUrl(file.storagePath, opts.seconds ?? 3600, opts.download ? { download: file.fileName || true } : undefined);
    return error || !data?.signedUrl ? null : data.signedUrl;
}

export const portalJobFileUrl = (path: string): string => supabase.storage.from(JOB_FILES_PORTAL_BUCKET).getPublicUrl(path).data.publicUrl;

// ------------------------------------------------------------------------------------------------ writes
async function insertFileRow(userId: string, jobId: string, input: NewFileInput, versionGroup?: string): Promise<JobFile> {
    ensureOnline();
    const problem = validateFile({ name: input.fileName, size: input.file.size, type: input.file.type });
    if (problem) throw new Error(problem);
    const mime = mimeFor(input.fileName, input.file.type)!;
    const storagePath = jobFileStoragePath(userId, jobId, input.fileName, mime);
    const row = jobFileInsertRow({
        userId, jobId, storagePath, fileName: input.fileName, mime, sizeBytes: input.file.size,
        title: input.title, category: input.category, notes: input.notes, tags: input.tags, versionGroup,
    });
    const { data, error } = await supabase.from('job_files').insert(row).select(JOB_FILE_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The file could not be saved.');
    const saved = mapJobFileRow(data as Record<string, unknown>);

    const { error: upError } = await supabase.storage.from(JOB_FILES_BUCKET).upload(storagePath, input.file, {
        upsert: false, contentType: mime, cacheControl: '3600',
    });
    if (upError) {
        await supabase.from('job_files').delete().eq('id', saved.id);
        throw writeError(upError, 'The file could not be uploaded.');
    }
    return saved;
}

export const addJobFile = (userId: string, jobId: string, input: NewFileInput): Promise<JobFile> =>
    insertFileRow(userId, jobId, input);

/** A new version of the same document (the database numbers it). */
export const addJobFileVersion = (userId: string, of: JobFile, input: NewFileInput): Promise<JobFile> =>
    insertFileRow(userId, of.jobId, {
        ...input,
        title: input.title ?? of.title,
        category: input.category ?? of.category,
        tags: input.tags ?? of.tags,
    }, of.versionGroup);

export async function addJobLink(userId: string, jobId: string, input: NewLinkInput): Promise<JobFile> {
    ensureOnline();
    const v = validateLink(input.url);
    if (!v.ok) throw new Error(v.error);
    const row = jobLinkInsertRow({ userId, jobId, url: v.url, title: input.title, category: input.category, notes: input.notes, tags: input.tags, shared: input.shared });
    const { data, error } = await supabase.from('job_files').insert(row).select(JOB_FILE_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The link could not be saved.');
    return mapJobFileRow(data as Record<string, unknown>);
}

export async function updateJobFile(id: string, patch: JobFilePatch): Promise<JobFile> {
    ensureOnline();
    const row = jobFilePatchRow(patch);
    const { data, error } = await supabase.from('job_files').update(row).eq('id', id).select(JOB_FILE_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The changes could not be saved.');
    return mapJobFileRow(data as Record<string, unknown>);
}

/**
 * Show / hide a file or link in the client portal. Image files are copied to the public portal-photos bucket under an
 * unguessable name first (like job photos); hiding clears the copy (the database queues it for deletion).
 */
export async function setJobFileShared(file: JobFile, shared: boolean, userId: string): Promise<JobFile> {
    ensureOnline();
    if (!shared || file.kind === 'link') {
        const body = file.kind === 'link' ? { shared_in_portal: shared } : { shared_in_portal: false, portal_path: null };
        const { data, error } = await supabase.from('job_files').update(body).eq('id', file.id).select(JOB_FILE_COLUMNS).single();
        if (error || !data) throw writeError(error, 'The change could not be saved.');
        if (!shared) flushStorageCleanup().catch(() => undefined);
        return mapJobFileRow(data as Record<string, unknown>);
    }
    if (file.sharedInPortal && file.portalPath) return file;
    const blocked = shareBlockReason(file);
    if (blocked) throw new Error(blocked);
    if (!file.storagePath || !file.mime) throw new Error('This file cannot be shared.');

    const portalPath = portalFilePath(userId, newId(), file.mime);
    const { error: copyError } = await supabase.storage.from(JOB_FILES_BUCKET)
        .copy(file.storagePath, portalPath, { destinationBucket: JOB_FILES_PORTAL_BUCKET });
    if (copyError) {
        // Older storage servers: download + upload instead of a server-side copy.
        const { data: blob, error: dlError } = await supabase.storage.from(JOB_FILES_BUCKET).download(file.storagePath);
        if (dlError || !blob) throw writeError(dlError || copyError, 'The file could not be shared.');
        const { error: upError } = await supabase.storage.from(JOB_FILES_PORTAL_BUCKET).upload(portalPath, blob, {
            upsert: false, contentType: file.mime, cacheControl: '86400',
        });
        if (upError) throw writeError(upError, 'The file could not be shared.');
    }
    const { data, error } = await supabase.from('job_files').update({ shared_in_portal: true, portal_path: portalPath }).eq('id', file.id)
        .select(JOB_FILE_COLUMNS).single();
    if (error || !data) {
        await supabase.storage.from(JOB_FILES_PORTAL_BUCKET).remove([portalPath]).catch(() => undefined);
        throw writeError(error, 'The file could not be shared.');
    }
    return mapJobFileRow(data as Record<string, unknown>);
}

/** Several rows (one file, or every version of a document) and their private files. */
export async function deleteJobFileVersions(files: readonly JobFile[]): Promise<void> {
    ensureOnline();
    if (!files.length) return;
    const ids = files.map(f => f.id);
    const { error } = await supabase.from('job_files').delete().in('id', ids);
    if (error) throw writeError(error, 'The file could not be deleted.');
    const paths = files.map(f => f.storagePath).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from(JOB_FILES_BUCKET).remove(paths).catch(() => undefined);
    if (files.some(f => f.portalPath)) flushStorageCleanup().catch(() => undefined);
}

export const deleteJobFile = (file: JobFile): Promise<void> => deleteJobFileVersions([file]);
