/**
 * "Write client update" / "AI walkthrough": browser work and Supabase calls.
 *  - photos for the AI: the stored photo, redrawn as a ≤1024 px JPEG (low token cost)
 *  - the ai-assistant photo tasks (same function, timeout and error messages as the assistant)
 *  - the record of sent updates: a Note document on the job tagged "Client update" (built like an AI plan
 *    document, so it opens and prints like one saved from the Note form); no new table
 *  - the walkthrough's photos block, uploaded and embedded exactly like photos sent to the assistant
 */
import { supabase } from '../../lib/supabase.ts';
import { isMissingColumnError } from '../../lib/account.ts';
import { mapDocumentRow, primeDocumentCache } from '../../lib/documents.ts';
import type { Job, UserProfile } from '../../types.ts';
import { buildPlanDocument } from '../../src/ai/planDocuments.ts';
import { imagesToHtml } from '../../src/ai/attachments.ts';
import { readFunctionError } from '../../src/hooks/useMasterAIRouter.ts';
import { blobToCanvas, downloadPhoto } from './photosApi.ts';
import type { JobPhoto } from './photoLogic.ts';
import {
    AI_IMAGE_MAX_DIM, AI_IMAGE_QUALITY, buildUpdateRecord, parsePhotoTaskResponse, reportPhotoName, sentUpdatesFromNotes,
    type AiPhotoImage, type PhotoTask, type SentUpdate,
} from './photoUpdates.ts';

/** One photo as the AI receives it (≤1024 px JPEG, base64 without the data: prefix). */
export const photoToAiImage = async (photo: JobPhoto): Promise<AiPhotoImage> => {
    const blob = await downloadPhoto(photo.storagePath);
    const { canvas } = await blobToCanvas(blob, AI_IMAGE_MAX_DIM);
    const dataUrl = canvas.toDataURL('image/jpeg', AI_IMAGE_QUALITY);
    const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (!data) throw new Error('A photo could not be prepared.');
    return { photo, mimeType: 'image/jpeg', data };
};

/** Prepares the photos one by one (skips a photo that can't be read); reports progress. */
export const photosToAiImages = async (photos: JobPhoto[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<AiPhotoImage[]> => {
    const out: AiPhotoImage[] = [];
    for (let i = 0; i < photos.length; i++) {
        if (signal?.aborted) break;
        try { out.push(await photoToAiImage(photos[i])); } catch { /* a missing photo is left out */ }
        onProgress?.(i + 1, photos.length);
    }
    return out;
};

export class PhotoTaskError extends Error {
    constructor(message: string, public code: string) { super(message); }
}

/** Calls the ai-assistant photo task. Throws PhotoTaskError (code PLAN_REQUIRED / PLAN_LIMIT / AI_BUSY …). */
export const runPhotoTask = async (task: PhotoTask, body: Record<string, unknown>, signal?: AbortSignal) => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body, signal, timeout: 130_000 });
    if (error) {
        const info = await readFunctionError(error);
        throw new PhotoTaskError(info.message.replace(/^PLAN_REQUIRED:\s*/, ''), info.code);
    }
    try {
        return parsePhotoTaskResponse(task, data);
    } catch (e) {
        throw new PhotoTaskError((e as Error).message, 'AI_BAD_OUTPUT');
    }
};

// ---------------------------------------------------------------------------------------------
// Sent updates (Notes tagged "Client update")
// ---------------------------------------------------------------------------------------------
/** The job's recorded client updates, newest first ([] when none or on any error). */
export const loadSentUpdates = async (jobId: string): Promise<SentUpdate[]> => {
    const { data, error } = await supabase
        .from('documents')
        .select('id, created_at, title:data->>title, tags:data->tags, content:data->>content')
        .eq('job_id', jobId)
        .eq('type', 'Note')
        .order('created_at', { ascending: false })
        .limit(60);
    if (error || !data) return [];
    return sentUpdatesFromNotes(data as Array<Record<string, unknown>>);
};

export interface UpdateRecordRef { id: string; data: Record<string, unknown> }

/**
 * Saves (first channel) or updates (later channels) the Note that records this update. The Note is built like an
 * AI plan document (form defaults, sanitized body, Draft-free type), filed under the job and its client.
 */
export const saveUpdateRecord = async (input: {
    ref: UpdateRecordRef | null;
    userId: string;
    job: Job & { clientId?: string | null };
    profile?: UserProfile | null;
    record: ReturnType<typeof buildUpdateRecord>;
    today: string;
}): Promise<UpdateRecordRef> => {
    if (input.ref) {
        const data = { ...input.ref.data, content: input.record.content };
        const { error } = await supabase.from('documents').update({ data }).eq('id', input.ref.id);
        if (error) throw error;
        return { id: input.ref.id, data };
    }
    const built = buildPlanDocument('NOTE', input.record, { job: input.job, profile: input.profile, today: input.today });
    const data = { ...built.data, tags: input.record.tags };
    const row: Record<string, unknown> = { id: crypto.randomUUID(), user_id: input.userId, job_id: input.job.id, type: built.formType, data };
    if (input.job.clientId) row.client_id = input.job.clientId;
    let { error } = await supabase.from('documents').insert(row);
    if (error && 'client_id' in row && isMissingColumnError(error)) {
        delete row.client_id;
        ({ error } = await supabase.from('documents').insert(row));
    }
    if (error) throw error;
    primeDocumentCache(mapDocumentRow({ ...row, created_at: new Date().toISOString() }, true));
    return { id: String(row.id), data };
};

// ---------------------------------------------------------------------------------------------
// Walkthrough photos in the report
// ---------------------------------------------------------------------------------------------
/** The walkthrough's photos as the "Photos" block of the report body (uploaded like the assistant's photos). */
export const walkthroughPhotosHtml = async (photos: JobPhoto[], upload?: (file: File) => Promise<string>): Promise<string> => {
    if (!upload || !photos.length) return '';
    const files: File[] = [];
    for (const p of photos) {
        try {
            const blob = await downloadPhoto(p.storagePath);
            files.push(new File([blob], reportPhotoName(p), { type: blob.type || 'image/jpeg', lastModified: Date.now() }));
        } catch { /* a missing photo is left out */ }
    }
    return imagesToHtml(files, upload);
};
