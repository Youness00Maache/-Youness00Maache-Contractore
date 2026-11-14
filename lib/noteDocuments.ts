/**
 * Saves a Note document on a job from a feature (punch list, lien waiver): built exactly like a Note saved from the
 * form or an AI plan document (form defaults, the user's default design, sanitized body), filed under the job and its
 * client, so it opens, prints, emails and shares like any document. Same path as the photo "client update" record
 * (components/photos/photoUpdatesApi.ts). Needs a connection.
 */
import { supabase } from './supabase.ts';
import { isMissingColumnError } from './account.ts';
import { mapDocumentRow, primeDocumentCache } from './documents.ts';
import type { FormData as FormDataType, Job, UserProfile } from '../types.ts';
import { buildPlanDocument } from '../src/ai/planDocuments.ts';

export interface SavedNote {
    id: string;
    form: FormDataType;
}

export const saveJobNote = async (input: {
    userId: string;
    job: Job & { clientId?: string | null };
    profile?: UserProfile | null;
    title: string;
    /** rich text (HTML); sanitized like the Note form does */
    content: string;
    tags?: string[];
    today: string;
    /** extra keys kept on the document data (e.g. lienWaiver: { … } so the waiver can be told apart) */
    extra?: Record<string, unknown>;
}): Promise<SavedNote> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error("You're offline, this needs a connection.");
    const built = buildPlanDocument('NOTE', { title: input.title, content: input.content, tags: input.tags || [] }, { job: input.job, profile: input.profile, today: input.today });
    const data: Record<string, unknown> = { ...built.data, title: input.title, tags: input.tags || [], isAiGenerated: false, ...(input.extra || {}) };
    const row: Record<string, unknown> = { id: crypto.randomUUID(), user_id: input.userId, job_id: input.job.id, type: built.formType, data };
    if (input.job.clientId) row.client_id = input.job.clientId;
    let { error } = await supabase.from('documents').insert(row);
    if (error && 'client_id' in row && isMissingColumnError(error)) {
        delete row.client_id;
        ({ error } = await supabase.from('documents').insert(row));
    }
    if (error) throw error;
    const form = mapDocumentRow({ ...row, created_at: new Date().toISOString() }, true);
    primeDocumentCache(form);
    return { id: String(row.id), form };
};
