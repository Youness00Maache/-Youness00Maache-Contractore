/**
 * Client selections: Supabase calls of the signed-in contractor (shapes: lib/selections/selectionTypes.ts, pure logic:
 * lib/selections/selectionLogic.ts, PO + budget: lib/selections/selectionPo.ts). Table public.job_selections, option
 * images in the private bucket `document-assets` (<user>/selections/<job>/...), client copies in `portal-photos`.
 *
 *  - Keep the feature HIDDEN until the migration is applied: `useSelectionsFeature(userId, online) === 'ready'`.
 *    Reads return null while the table is missing (and mark the feature missing).
 *  - Every write needs a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline it throws an Error
 *    whose message is NEEDS_CONNECTION; other failures throw a readable Error ("PLAN_LIMIT: ..." on Free: use
 *    isPlanLimitError from lib/jobFiles/jobFilesApi.ts).
 *  - The client's choice, the history and the sent / approved / ordered / closed times are written by the database.
 *
 * API (all async unless noted):
 *   probeSelectionsBackend()                          'ready' | 'missing' | 'error'
 *   selectionsFeature / useSelectionsFeature(uid, online)
 *   listJobSelections(jobId)                          JobSelection[] | null   (sortSelections order)
 *   listOpenSelections(limit?)                        JobSelection[] | null   (sent / chosen / approved, every job: badges)
 *   createSelection(userId, jobId, draft, { send? })  JobSelection   (send: shares the option images first)
 *   updateSelection(current, patch)                   JobSelection   (removes private images an edit dropped)
 *   sendSelection(sel, userId)                        JobSelection   (draft / changes_requested / closed -> sent;
 *                                                                     makes the portal copies of the option images)
 *   askAgain(sel, userId)                             JobSelection   (chosen -> sent: the choice is cleared, kept in history)
 *   withdrawSelection(id)                             JobSelection   (sent -> draft)
 *   approveSelection(id)                              JobSelection   (chosen -> approved)
 *   requestChanges(id)                                JobSelection   (chosen / approved -> changes_requested)
 *   markOrdered(id, poDocumentId?)                    JobSelection   (approved -> ordered, optional PO link)
 *   cancelOrder(id)                                   JobSelection   (ordered -> approved, PO link cleared)
 *   closeSelection(id) / reopenSelection(sel, userId) JobSelection
 *   setSelectionStatus(id, status)                    JobSelection   (any allowed move, see canTransition)
 *   deleteSelection(sel)                              void           (row + its private images; copies queued by the DB)
 *   uploadOptionImage(userId, jobId, file)            { imagePath }  (private; put it on an option, then save)
 *   removeOptionImageFile(imagePath)                  void           (an image picked but never saved)
 *   shareOptionImages(sel, userId)                    JobSelection   (portal copies for options that lack one)
 *   optionImageUrl(imagePath, seconds?)               string | null  (signed URL of the private image)
 *   portalOptionImageUrl(portalPath)                  string (sync)  (public URL of a copy)
 *   createSelectionPurchaseOrder({ userId, job, profile?, selection, supplier?, vendorName? })
 *                                                     { doc: FormData, selection: JobSelection }
 *        Draft Purchase Order (same record + numbering as lib/suppliersApi.ts createReorderPurchaseOrders), then the
 *        selection -> ordered with po_document_id. If the PO was saved but the selection could not be updated it throws
 *        SelectionPoLinkError (`.doc` = the new PO): retry markOrdered(selection.id, doc.id).
 */
import { supabase } from '../supabase.ts';
import { FormType } from '../../types.ts';
import type { FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isCrewBackendMissing, isNetworkError } from '../crew/crewLogic.ts';
import { createBackendFeature } from '../jobFiles/featureFlag.ts';
import { flushStorageCleanup } from '../../components/requests/requestsApi.ts';
import { describeError, isMissingColumnError, isPlanLimitError as isDocPlanLimit, planLimitMessage } from '../account.ts';
import { assertFullDocument, mapDocumentRow, primeDocumentCache } from '../documents.ts';
import { newId, todayISO } from '../../components/forms/formUtils.ts';
import { nextPoNumber, type Supplier } from '../suppliers.ts';
import type { SupplierRecord } from '../suppliers/types.ts';
import {
    SELECTION_COLUMNS, droppedImagePaths, imageMimeFor, mapSelectionRow, mimeOfPath, optionImageStoragePath, optionsToJson,
    portalImagePath, selectionInsertRow, selectionPatchRow, sortSelections, validateOptionImage,
} from './selectionLogic.ts';
import { buildSelectionPoData } from './selectionPo.ts';
import { SELECTION_LIMITS, type JobSelection, type SelectionDraft, type SelectionOption, type SelectionPatch, type SelectionStatus } from './selectionTypes.ts';

export const SELECTION_IMAGES_BUCKET = 'document-assets';
export const SELECTION_PORTAL_BUCKET = 'portal-photos';

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

const writeError = (error: DbError | unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isCrewBackendMissing(error as any)) { selectionsFeature.markMissing(); return new Error('Client selections are not switched on yet. Please try again later.'); }
    return new Error(errorText(error, fallback));
};

const readRows = (res: { data: unknown; error: DbError }): JobSelection[] | null => {
    if (res.error) {
        if (isCrewBackendMissing(res.error as any)) { selectionsFeature.markMissing(); return null; }
        throw writeError(res.error, 'The selections could not be loaded.');
    }
    return sortSelections(((res.data as Record<string, unknown>[] | null) || []).map(mapSelectionRow));
};

const randomName = (): string => {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

// ------------------------------------------------------------------------------------------------- feature
export async function probeSelectionsBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const { error } = await supabase.from('job_selections').select('id').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export const selectionsFeature = createBackendFeature('cd.selections.feature', probeSelectionsBackend);
export const useSelectionsFeature = selectionsFeature.useFeature;

// ------------------------------------------------------------------------------------------------- reads
export async function listJobSelections(jobId: string): Promise<JobSelection[] | null> {
    const res = await supabase.from('job_selections').select(SELECTION_COLUMNS).eq('job_id', jobId)
        .order('created_at', { ascending: false }).limit(SELECTION_LIMITS.perJob);
    return readRows(res);
}

export async function listOpenSelections(limit = 200): Promise<JobSelection[] | null> {
    const res = await supabase.from('job_selections').select(SELECTION_COLUMNS).in('status', ['sent', 'chosen', 'approved'])
        .order('due_date', { ascending: true, nullsFirst: false }).limit(Math.min(Math.max(1, limit), 1000));
    return readRows(res);
}

export async function optionImageUrl(imagePath: string, seconds = 3600): Promise<string | null> {
    const { data, error } = await supabase.storage.from(SELECTION_IMAGES_BUCKET).createSignedUrl(imagePath, seconds);
    return error || !data?.signedUrl ? null : data.signedUrl;
}

export const portalOptionImageUrl = (portalPath: string): string =>
    supabase.storage.from(SELECTION_PORTAL_BUCKET).getPublicUrl(portalPath).data.publicUrl;

// ------------------------------------------------------------------------------------------------ images
/** Uploads an option image to the private bucket. Put the returned path on an option (imagePath) and save. */
export async function uploadOptionImage(userId: string, jobId: string, file: File): Promise<{ imagePath: string }> {
    ensureOnline();
    const problem = validateOptionImage({ name: file.name, size: file.size, type: file.type });
    if (problem) throw new Error(problem);
    const mime = imageMimeFor(file.name, file.type)!;
    const imagePath = optionImageStoragePath(userId, jobId, file.name, mime);
    const { error } = await supabase.storage.from(SELECTION_IMAGES_BUCKET).upload(imagePath, file, {
        upsert: false, contentType: mime, cacheControl: '3600',
    });
    if (error) throw writeError(error, 'The image could not be uploaded.');
    return { imagePath };
}

/** Removes a private image that was uploaded but never saved on a selection (best effort). */
export async function removeOptionImageFile(imagePath: string | null | undefined): Promise<void> {
    if (!imagePath) return;
    await supabase.storage.from(SELECTION_IMAGES_BUCKET).remove([imagePath]).catch(() => undefined);
}

/** Copies one private image (document-assets) to the public portal bucket (server copy, else download + upload). Returns the copy's path; the caller saves it (and removes the copy if that save fails). Also used by lib/boards/boardsApi.ts. */
export async function copyImageToPortal(imagePath: string, userId: string): Promise<string> {
    const mime = mimeOfPath(imagePath);
    const portalPath = portalImagePath(userId, randomName(), mime);
    const { error: copyError } = await supabase.storage.from(SELECTION_IMAGES_BUCKET)
        .copy(imagePath, portalPath, { destinationBucket: SELECTION_PORTAL_BUCKET });
    if (copyError) {
        // Older storage servers: download + upload instead of a server-side copy.
        const { data: blob, error: dlError } = await supabase.storage.from(SELECTION_IMAGES_BUCKET).download(imagePath);
        if (dlError || !blob) throw writeError(dlError || copyError, 'The image could not be shared.');
        const { error: upError } = await supabase.storage.from(SELECTION_PORTAL_BUCKET).upload(portalPath, blob, {
            upsert: false, contentType: mime, cacheControl: '86400',
        });
        if (upError) throw writeError(upError, 'The image could not be shared.');
    }
    return portalPath;
}

/** Makes the client's copies of option images that don't have one yet, and saves them on the selection. */
export async function shareOptionImages(sel: JobSelection, userId: string): Promise<JobSelection> {
    ensureOnline();
    const missing = sel.options.filter(o => o.imagePath && !o.portalPath);
    if (!missing.length) return sel;
    const made: string[] = [];
    const options: SelectionOption[] = [];
    try {
        for (const o of sel.options) {
            if (o.imagePath && !o.portalPath) {
                const portalPath = await copyImageToPortal(o.imagePath, userId);
                made.push(portalPath);
                options.push({ ...o, portalPath });
            } else options.push(o);
        }
    } catch (e) {
        if (made.length) await supabase.storage.from(SELECTION_PORTAL_BUCKET).remove(made).catch(() => undefined);
        throw e;
    }
    const { data, error } = await supabase.from('job_selections').update({ options: optionsToJson(options) }).eq('id', sel.id)
        .select(SELECTION_COLUMNS).single();
    if (error || !data) {
        await supabase.storage.from(SELECTION_PORTAL_BUCKET).remove(made).catch(() => undefined);
        throw writeError(error, 'The images could not be shared.');
    }
    return mapSelectionRow(data as Record<string, unknown>);
}

// ------------------------------------------------------------------------------------------------ writes
export async function createSelection(userId: string, jobId: string, draft: SelectionDraft, opts: { send?: boolean } = {}): Promise<JobSelection> {
    ensureOnline();
    // saved as a draft first (the images get their portal copies), then sent; `send` validates the options up front
    if (opts.send) selectionInsertRow(draft, userId, jobId, true);
    const row = selectionInsertRow(draft, userId, jobId, false);
    const { data, error } = await supabase.from('job_selections').insert(row).select(SELECTION_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The selection could not be saved.');
    const saved = mapSelectionRow(data as Record<string, unknown>);
    return opts.send ? sendSelection(saved, userId) : saved;
}

export async function updateSelection(current: JobSelection, patch: SelectionPatch): Promise<JobSelection> {
    ensureOnline();
    const row = selectionPatchRow(patch);
    const { data, error } = await supabase.from('job_selections').update(row).eq('id', current.id).select(SELECTION_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The changes could not be saved.');
    const saved = mapSelectionRow(data as Record<string, unknown>);
    const dropped = droppedImagePaths(current.options, saved.options);
    if (dropped.length) await supabase.storage.from(SELECTION_IMAGES_BUCKET).remove(dropped).catch(() => undefined);
    if (current.options.some(o => o.portalPath && !saved.options.some(n => n.portalPath === o.portalPath))) flushStorageCleanup().catch(() => undefined);
    return saved;
}

export async function setSelectionStatus(id: string, status: SelectionStatus): Promise<JobSelection> {
    ensureOnline();
    const { data, error } = await supabase.from('job_selections').update({ status }).eq('id', id).select(SELECTION_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The change could not be saved.');
    return mapSelectionRow(data as Record<string, unknown>);
}

/** Sends (or sends again): the option images get their portal copies first, then the status moves to 'sent'. */
export async function sendSelection(sel: JobSelection, userId: string): Promise<JobSelection> {
    const shared = await shareOptionImages(sel, userId);
    return setSelectionStatus(shared.id, 'sent');
}

export const askAgain = (sel: JobSelection, userId: string): Promise<JobSelection> => sendSelection(sel, userId);
export const reopenSelection = (sel: JobSelection, userId: string): Promise<JobSelection> => sendSelection(sel, userId);
export const withdrawSelection = (id: string): Promise<JobSelection> => setSelectionStatus(id, 'draft');
export const approveSelection = (id: string): Promise<JobSelection> => setSelectionStatus(id, 'approved');
export const requestChanges = (id: string): Promise<JobSelection> => setSelectionStatus(id, 'changes_requested');
export const closeSelection = (id: string): Promise<JobSelection> => setSelectionStatus(id, 'closed');
export const cancelOrder = (id: string): Promise<JobSelection> => setSelectionStatus(id, 'approved');

export async function markOrdered(id: string, poDocumentId?: string | null): Promise<JobSelection> {
    ensureOnline();
    const body: Record<string, unknown> = { status: 'ordered' };
    if (poDocumentId) body.po_document_id = poDocumentId;
    const { data, error } = await supabase.from('job_selections').update(body).eq('id', id).select(SELECTION_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The change could not be saved.');
    return mapSelectionRow(data as Record<string, unknown>);
}

/** Deletes the selection and its private images (the public copies are queued by the database). */
export async function deleteSelection(sel: JobSelection): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('job_selections').delete().eq('id', sel.id);
    if (error) throw writeError(error, 'The selection could not be deleted.');
    const paths = sel.options.map(o => o.imagePath).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from(SELECTION_IMAGES_BUCKET).remove(paths).catch(() => undefined);
    if (sel.options.some(o => o.portalPath)) flushStorageCleanup().catch(() => undefined);
}

// ------------------------------------------------------------------------------------------ purchase order
/** The PO was created but the selection could not be marked ordered: retry markOrdered(selection.id, doc.id). */
export class SelectionPoLinkError extends Error {
    doc: FormDataType;
    constructor(message: string, doc: FormDataType) {
        super(message);
        this.name = 'SelectionPoLinkError';
        this.doc = doc;
    }
}

async function usedPoNumbers(): Promise<string[]> {
    try {
        const { data } = await supabase.from('documents').select('num:data->>poNumber').eq('type', FormType.PurchaseOrder)
            .order('created_at', { ascending: false }).limit(1000);
        return ((data || []) as Array<{ num?: unknown }>).map(r => r?.num).filter((n): n is string => typeof n === 'string' && !!n);
    } catch {
        return [];
    }
}

/** Draft Purchase Order from an approved selection (filed under the job), then the selection -> ordered. */
export async function createSelectionPurchaseOrder(args: {
    userId: string;
    job: Job & { clientId?: string | null };
    profile?: UserProfile | null;
    selection: JobSelection;
    supplier?: SupplierRecord | Supplier | null;
    vendorName?: string;
}): Promise<{ doc: FormDataType; selection: JobSelection }> {
    ensureOnline();
    if (args.selection.status !== 'approved') throw new Error('Approve the client\'s choice first.');
    if (args.selection.jobId !== args.job.id) throw new Error('This selection belongs to another job.');
    const number = nextPoNumber(await usedPoNumbers());
    const id = newId();
    const data = buildSelectionPoData({
        job: args.job, profile: args.profile, selection: args.selection, supplier: args.supplier ?? null,
        vendorName: args.vendorName, number, today: todayISO(), now: new Date().toISOString(),
    });
    assertFullDocument({ data });
    const record: Record<string, unknown> = { id, user_id: args.userId, job_id: args.job.id, type: FormType.PurchaseOrder, data };
    if (args.job.clientId) record.client_id = args.job.clientId;
    let res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
    if (res.error && 'client_id' in record && isMissingColumnError(res.error)) {
        delete record.client_id;
        res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
    }
    if (res.error) {
        throw new Error(isDocPlanLimit(res.error) ? planLimitMessage(res.error) : describeError(res.error, 'The purchase order could not be created.'));
    }
    const row = (res.data || {}) as { public_token?: string | null; created_at?: string | null };
    const doc = mapDocumentRow({ ...record, public_token: row.public_token ?? null, created_at: row.created_at ?? new Date().toISOString() }, true);
    primeDocumentCache(doc);
    try {
        const selection = await markOrdered(args.selection.id, id);
        return { doc, selection };
    } catch (e) {
        throw new SelectionPoLinkError(
            `The purchase order ${String(data.poNumber)} was created, but the selection could not be marked ordered. ${e instanceof Error ? e.message : ''}`.trim(),
            doc,
        );
    }
}
