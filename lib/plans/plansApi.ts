/**
 * Plan measurement (roadmap N9): storage calls of the signed-in contractor. No database table: a plan is a file in
 * the private `document-assets` bucket and its measurements a small file next to it (layout: lib/plans/planFiles.ts).
 *
 * Every write needs a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline it throws an Error whose
 * message is NEEDS_CONNECTION.
 *
 *   listPlans(userId, jobId)            PlanEntry[]   (one folder listing)
 *   uploadPlan(userId, jobId, file)     PlanEntry
 *   downloadPlan(plan)                  Blob          (the original, for pdf.js / the image)
 *   loadMeasurements(plan)              ReadResult    (blank when nothing is saved yet)
 *   saveMeasurements(plan, doc)         { doc, measurePath }   last write wins (version + 1, updatedAt now)
 *   deletePlan(plan)                    void          (the plan and its measurement files)
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import {
    PLANS_BUCKET, measurePathFor, parsePlanListing, planFolder, planKindOf, planMimeFor, planStoragePath, planTitle, validatePlanFile,
    type PlanEntry,
} from './planFiles.ts';
import { readMeasureDoc, serializeMeasureDoc, stampForSave, type MeasureDoc, type ReadResult } from './schema.ts';
import { encodeTextPng, readStoredText } from './pngText.ts';

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

const failure = (error: unknown, fallback: string): Error => {
    if (isBrowserOffline()) return new Error(NEEDS_CONNECTION);
    return new Error(errorText(error, fallback));
};

const isNotFound = (error: unknown): boolean => {
    const e = error as { status?: number; statusCode?: string | number; message?: string } | null;
    return !!e && (e.status === 404 || String(e.statusCode) === '404' || /not.?found|does not exist/i.test(String(e.message || '')));
};

export async function listPlans(userId: string, jobId: string): Promise<PlanEntry[]> {
    const folder = planFolder(userId, jobId);
    const { data, error } = await supabase.storage.from(PLANS_BUCKET).list(folder, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) throw failure(error, 'The plans could not be loaded.');
    return parsePlanListing(folder, data as never);
}

export async function uploadPlan(userId: string, jobId: string, file: File): Promise<PlanEntry> {
    ensureOnline();
    const problem = validatePlanFile({ name: file.name, size: file.size, type: file.type });
    if (problem) throw new Error(problem);
    const mime = planMimeFor(file.name, file.type)!;
    const path = planStoragePath(userId, jobId, file.name, mime);
    const { error } = await supabase.storage.from(PLANS_BUCKET).upload(path, file, { upsert: false, contentType: mime, cacheControl: '3600' });
    if (error) throw failure(error, 'The plan could not be uploaded.');
    const fileName = path.split('/').pop() || path;
    return {
        path, fileName, title: planTitle(fileName), kind: planKindOf(mime), mime, size: file.size,
        createdAt: new Date().toISOString(), measurePath: null, measuredAt: null,
    };
}

export async function downloadPlan(plan: Pick<PlanEntry, 'path'>): Promise<Blob> {
    const { data, error } = await supabase.storage.from(PLANS_BUCKET).download(plan.path);
    if (error || !data) throw failure(error, 'The plan could not be opened.');
    return data;
}

export async function loadMeasurements(plan: Pick<PlanEntry, 'measurePath' | 'kind'>): Promise<ReadResult> {
    if (!plan.measurePath) return readMeasureDoc(null, plan.kind);
    const { data, error } = await supabase.storage.from(PLANS_BUCKET).download(plan.measurePath);
    if (error || !data) {
        if (isNotFound(error)) return readMeasureDoc(null, plan.kind);
        throw failure(error, 'The measurements could not be loaded.');
    }
    const text = readStoredText(new Uint8Array(await data.arrayBuffer()));
    return readMeasureDoc(text ?? '{bad', plan.kind);
}

/** Saves the measurements next to the plan (always the .measure.png file). Last write wins. */
export async function saveMeasurements(plan: Pick<PlanEntry, 'path'>, doc: MeasureDoc): Promise<{ doc: MeasureDoc; measurePath: string }> {
    ensureOnline();
    const stamped = stampForSave(doc);
    const text = serializeMeasureDoc(stamped);
    const measurePath = measurePathFor(plan.path);
    const body = new Blob([encodeTextPng(text) as BlobPart], { type: 'image/png' });
    const { error } = await supabase.storage.from(PLANS_BUCKET).upload(measurePath, body, { upsert: true, contentType: 'image/png', cacheControl: '0' });
    if (error) throw failure(error, 'The measurements could not be saved.');
    return { doc: stamped, measurePath };
}

export async function deletePlan(plan: Pick<PlanEntry, 'path' | 'measurePath'>): Promise<void> {
    ensureOnline();
    const paths = [plan.path, measurePathFor(plan.path), ...(plan.measurePath ? [plan.measurePath] : [])];
    const { error } = await supabase.storage.from(PLANS_BUCKET).remove([...new Set(paths)]);
    if (error) throw failure(error, 'The plan could not be deleted.');
}
