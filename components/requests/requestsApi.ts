/**
 * Request-a-quote: Supabase calls. Every function that reads the new tables/RPCs reports "unavailable" instead of
 * throwing when the migration 20261113000400 is not applied yet, so the app keeps working without the feature.
 */
import { supabase } from '../../lib/supabase.ts';
import {
    MAX_REQUEST_PHOTOS, isMissingBackendError, mapQuoteRequestRow, photoExtension,
    type QuoteRequest, type QuoteRequestStatus, type RequestFormValues,
} from './requestLogic.ts';

export const REQUEST_PHOTOS_BUCKET = 'request-photos';

/** Thrown when the database doesn't have this feature yet. */
export class FeatureUnavailableError extends Error {
    constructor() {
        super('This feature is not available yet.');
        this.name = 'FeatureUnavailableError';
    }
}

const rpcObject = (data: unknown): Record<string, any> => {
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, any>;
    if (typeof data === 'string') {
        try { const v = JSON.parse(data); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
    }
    return {};
};

const raise = (error: any): never => {
    if (isMissingBackendError(error)) throw new FeatureUnavailableError();
    throw error;
};

// ---------------------------------------------------------------------------------------------
// Public page
// ---------------------------------------------------------------------------------------------
export interface PublicRequestPage {
    slug: string;
    enabled: boolean;
    intro: string;
    branded: boolean;
    contractor: { name: string; companyName: string; logoUrl: string; phone: string; email: string; website: string };
}

export const fetchRequestPage = async (slug: string): Promise<PublicRequestPage> => {
    const { data, error } = await supabase.rpc('get_request_page', { p_slug: slug });
    if (error) raise(error);
    const r = rpcObject(data);
    const c = rpcObject(r.contractor);
    return {
        slug: String(r.slug || slug),
        enabled: r.enabled !== false,
        intro: String(r.intro || ''),
        branded: r.branded !== false,
        contractor: {
            name: String(c.name || ''),
            companyName: String(c.company_name || ''),
            logoUrl: String(c.logo_url || ''),
            phone: String(c.phone || ''),
            email: String(c.email || ''),
            website: String(c.website || ''),
        },
    };
};

export const submitQuoteRequest = async (input: {
    slug: string;
    values: RequestFormValues;
    photos: File[];
    source: string;
    elapsedMs: number;
}): Promise<{ requestId: string; uploadPaths: string[] }> => {
    const photoTypes = input.photos.slice(0, MAX_REQUEST_PHOTOS).map(f => photoExtension(f.type) || 'jpg');
    const { data, error } = await supabase.rpc('submit_quote_request', {
        p_slug: input.slug,
        p_name: input.values.name.trim(),
        p_phone: input.values.phone.trim() || null,
        p_email: input.values.email.trim() || null,
        p_address: input.values.address.trim() || null,
        p_details: input.values.details.trim(),
        p_photo_types: photoTypes,
        p_source: input.source || null,
        p_website: input.values.website || null,
        p_elapsed_ms: Math.round(input.elapsedMs),
    });
    if (error) raise(error);
    const r = rpcObject(data);
    const uploadPaths = Array.isArray(r.upload_paths) ? r.upload_paths.filter((p: unknown) => typeof p === 'string') : [];
    return { requestId: String(r.request_id || ''), uploadPaths };
};

/** Uploads photo i to uploadPaths[i] (two at a time). Returns how many failed. */
export const uploadRequestPhotos = async (
    uploadPaths: string[], photos: File[], onProgress?: (done: number, total: number) => void,
): Promise<{ failed: number }> => {
    const jobs = uploadPaths.slice(0, photos.length).map((path, i) => ({ path, file: photos[i] }));
    let done = 0;
    let failed = 0;
    const run = async (job: { path: string; file: File }) => {
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
            const { error } = await supabase.storage.from(REQUEST_PHOTOS_BUCKET).upload(job.path, job.file, {
                upsert: false, contentType: job.file.type || 'image/jpeg', cacheControl: '3600',
            });
            ok = !error || /exists|duplicate/i.test(error.message || '');
        }
        if (!ok) failed++;
        done++;
        onProgress?.(done, jobs.length);
    };
    const queue = [...jobs];
    const worker = async () => { while (queue.length) await run(queue.shift()!); };
    await Promise.all([worker(), worker()]);
    return { failed };
};

// ---------------------------------------------------------------------------------------------
// Contractor: inbox
// ---------------------------------------------------------------------------------------------
const REQUEST_COLUMNS = 'id, name, phone, email, address, details, photo_paths, source, status, client_id, job_id, converted_at, created_at';

/** null = the feature isn't in the database yet. */
export const listQuoteRequests = async (opts: { view?: 'open' | 'archived' | 'all'; limit?: number } = {}): Promise<QuoteRequest[] | null> => {
    let q = supabase.from('quote_requests').select(REQUEST_COLUMNS).order('created_at', { ascending: false }).limit(opts.limit ?? 100);
    if (opts.view === 'open') q = q.in('status', ['new', 'seen', 'converted']);
    else if (opts.view === 'archived') q = q.eq('status', 'archived');
    const { data, error } = await q;
    if (error) {
        if (isMissingBackendError(error)) return null;
        throw error;
    }
    return (data || []).map(mapQuoteRequestRow);
};

export const setQuoteRequestStatus = async (id: string, status: QuoteRequestStatus): Promise<void> => {
    const { error } = await supabase.from('quote_requests').update({ status }).eq('id', id);
    if (error) raise(error);
};

/** Deletes the request; its photos are queued for removal by a trigger and removed right away. */
export const deleteQuoteRequest = async (id: string): Promise<void> => {
    const { error } = await supabase.from('quote_requests').delete().eq('id', id);
    if (error) raise(error);
    await flushStorageCleanup().catch(() => undefined);
};

export interface ConvertResult {
    job: Record<string, any>;
    client: Record<string, any> | null;
    clientSkipped: string | null;
    already: boolean;
}

export const convertQuoteRequest = async (id: string, jobName: string, startDate: string): Promise<ConvertResult> => {
    const { data, error } = await supabase.rpc('convert_quote_request', {
        p_request_id: id, p_job_name: jobName.trim() || null, p_start_date: startDate || null,
    });
    if (error) raise(error);
    const r = rpcObject(data);
    if (!r.job?.id) throw new Error('The job could not be created.');
    return { job: r.job, client: r.client?.id ? r.client : null, clientSkipped: r.client_skipped || null, already: Boolean(r.already) };
};

/** Signed URLs (1 hour) for request photos; missing files are left out. */
export const requestPhotoUrls = async (paths: string[]): Promise<Record<string, string>> => {
    if (!paths.length) return {};
    const { data, error } = await supabase.storage.from(REQUEST_PHOTOS_BUCKET).createSignedUrls(paths, 3600);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const item of data as Array<{ path: string | null; signedUrl: string | null; error: string | null }>) {
        if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl;
    }
    return out;
};

/** Downloads request photos as Files (for the job photo timeline and the AI assistant). Missing ones are skipped. */
export const downloadRequestPhotos = async (paths: string[], max = MAX_REQUEST_PHOTOS): Promise<File[]> => {
    const files: File[] = [];
    for (const path of paths.slice(0, max)) {
        const { data, error } = await supabase.storage.from(REQUEST_PHOTOS_BUCKET).download(path);
        if (error || !data) continue;
        const name = path.split('/').pop() || 'photo.jpg';
        files.push(new File([data], name, { type: data.type || 'image/jpeg', lastModified: Date.now() }));
    }
    return files;
};

// ---------------------------------------------------------------------------------------------
// Contractor: link settings
// ---------------------------------------------------------------------------------------------
export interface MyRequestPage {
    slug: string;
    enabled: boolean;
    intro: string;
    tier: string;
    newCount: number;
}

const mapMyPage = (data: unknown): MyRequestPage => {
    const r = rpcObject(data);
    return {
        slug: String(r.slug || ''),
        enabled: r.enabled !== false,
        intro: String(r.intro || ''),
        tier: String(r.tier || 'free'),
        newCount: Number(r.new_count) || 0,
    };
};

/** Creates the page (turned on) the first time. Throws FeatureUnavailableError before the migration. */
export const getMyRequestPage = async (): Promise<MyRequestPage> => {
    const { data, error } = await supabase.rpc('get_my_request_page');
    if (error) raise(error);
    return mapMyPage(data);
};

export const updateMyRequestPage = async (patch: { enabled?: boolean; intro?: string }): Promise<MyRequestPage> => {
    const { data, error } = await supabase.rpc('update_request_page', {
        p_enabled: patch.enabled ?? null,
        p_intro: patch.intro ?? null,
    });
    if (error) raise(error);
    return mapMyPage(data);
};

export const regenerateRequestSlug = async (): Promise<MyRequestPage> => {
    const { data, error } = await supabase.rpc('regenerate_request_slug');
    if (error) raise(error);
    return mapMyPage(data);
};

// ---------------------------------------------------------------------------------------------
// Storage cleanup (files of deleted rows; SQL can't delete storage files itself)
// ---------------------------------------------------------------------------------------------
let flushing: Promise<void> | null = null;

/** Removes the files listed in storage_cleanup_queue (the user's own), then the queue rows. Best effort. */
export const flushStorageCleanup = (): Promise<void> => {
    if (flushing) return flushing;
    flushing = (async () => {
        try {
            for (let round = 0; round < 5; round++) {
                const { data, error } = await supabase.from('storage_cleanup_queue').select('id, bucket, path').order('id').limit(200);
                if (error || !data || data.length === 0) return;
                const byBucket = new Map<string, { ids: number[]; paths: string[] }>();
                for (const row of data as Array<{ id: number; bucket: string; path: string }>) {
                    const entry = byBucket.get(row.bucket) || { ids: [], paths: [] };
                    entry.ids.push(row.id);
                    entry.paths.push(row.path);
                    byBucket.set(row.bucket, entry);
                }
                const doneIds: number[] = [];
                for (const [bucket, entry] of byBucket) {
                    const { error: rmError } = await supabase.storage.from(bucket).remove(entry.paths);
                    if (!rmError) doneIds.push(...entry.ids);
                }
                if (!doneIds.length) return;
                await supabase.from('storage_cleanup_queue').delete().in('id', doneIds);
                if (data.length < 200) return;
            }
        } finally {
            flushing = null;
        }
    })();
    return flushing;
};
