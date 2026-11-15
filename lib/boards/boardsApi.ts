/**
 * Mood boards: Supabase calls of the signed-in contractor (shapes: lib/boards/boardTypes.ts, pure logic:
 * lib/boards/boardLogic.ts). Table public.job_boards, uploaded images in the private bucket `document-assets`
 * (<user>/boards/<job>/...), client copies in `portal-photos` while a board is shared.
 *
 *  - Keep the feature HIDDEN until the migration is applied: `useBoardsFeature(userId, online) === 'ready'`.
 *  - Every write needs a connection (NEEDS_CONNECTION offline); "PLAN_LIMIT: ..." on Free (isPlanLimitError from
 *    lib/jobFiles/jobFilesApi.ts).
 *
 * API (all async unless noted):
 *   probeBoardsBackend() / boardsFeature / useBoardsFeature(uid, online)
 *   listJobBoards(jobId)                     JobBoard[] | null   (newest first)
 *   createBoard(userId, jobId, draft)        JobBoard   (private; share with setBoardShared)
 *   updateBoard(current, patch, userId)      JobBoard   (a shared board gets copies of new uploaded images; private
 *                                                        images an edit dropped are removed)
 *   setBoardShared(board, shared, userId)    JobBoard   (share: public copies of uploaded images; unshare: the database
 *                                                        drops the copies and queues them for deletion)
 *   deleteBoard(board)                       void       (row + private images; copies queued by the database)
 *   uploadBoardImage(userId, jobId, file)    { imagePath }  (then add an item { kind: 'image', imagePath } and save)
 *   removeBoardImageFile(imagePath)          void       (an image uploaded but never saved)
 *   boardImageUrl(imagePath, seconds?)       string | null  (signed URL of the private image)
 *   portalBoardImageUrl(portalPath)          string (sync)
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isCrewBackendMissing, isNetworkError } from '../crew/crewLogic.ts';
import { createBackendFeature } from '../jobFiles/featureFlag.ts';
import { flushStorageCleanup } from '../../components/requests/requestsApi.ts';
import { droppedImagePaths, imageMimeFor, validateOptionImage } from '../selections/selectionLogic.ts';
import { copyImageToPortal } from '../selections/selectionsApi.ts';
import { BOARD_COLUMNS, boardImagePath, boardInsertRow, boardPatchRow, itemsToJson, mapBoardRow, normalizeItems } from './boardLogic.ts';
import { BOARD_LIMITS, type BoardDraft, type BoardItem, type BoardPatch, type JobBoard } from './boardTypes.ts';

export const BOARD_IMAGES_BUCKET = 'document-assets';
export const BOARD_PORTAL_BUCKET = 'portal-photos';

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

const writeError = (error: DbError | unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isCrewBackendMissing(error as any)) { boardsFeature.markMissing(); return new Error('Mood boards are not switched on yet. Please try again later.'); }
    return new Error(errorText(error, fallback));
};

// ------------------------------------------------------------------------------------------------- feature
export async function probeBoardsBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const { error } = await supabase.from('job_boards').select('id').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export const boardsFeature = createBackendFeature('cd.boards.feature', probeBoardsBackend);
export const useBoardsFeature = boardsFeature.useFeature;

// ------------------------------------------------------------------------------------------------- reads
export async function listJobBoards(jobId: string): Promise<JobBoard[] | null> {
    const res = await supabase.from('job_boards').select(BOARD_COLUMNS).eq('job_id', jobId)
        .order('created_at', { ascending: false }).limit(BOARD_LIMITS.perJob);
    if (res.error) {
        if (isCrewBackendMissing(res.error as any)) { boardsFeature.markMissing(); return null; }
        throw writeError(res.error, 'The mood boards could not be loaded.');
    }
    return ((res.data as Record<string, unknown>[] | null) || []).map(mapBoardRow);
}

export async function boardImageUrl(imagePath: string, seconds = 3600): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BOARD_IMAGES_BUCKET).createSignedUrl(imagePath, seconds);
    return error || !data?.signedUrl ? null : data.signedUrl;
}

export const portalBoardImageUrl = (portalPath: string): string =>
    supabase.storage.from(BOARD_PORTAL_BUCKET).getPublicUrl(portalPath).data.publicUrl;

// ------------------------------------------------------------------------------------------------ images
export async function uploadBoardImage(userId: string, jobId: string, file: File): Promise<{ imagePath: string }> {
    ensureOnline();
    const problem = validateOptionImage({ name: file.name, size: file.size, type: file.type });
    if (problem) throw new Error(problem);
    const mime = imageMimeFor(file.name, file.type)!;
    const imagePath = boardImagePath(userId, jobId, file.name, mime);
    const { error } = await supabase.storage.from(BOARD_IMAGES_BUCKET).upload(imagePath, file, {
        upsert: false, contentType: mime, cacheControl: '3600',
    });
    if (error) throw writeError(error, 'The image could not be uploaded.');
    return { imagePath };
}

export async function removeBoardImageFile(imagePath: string | null | undefined): Promise<void> {
    if (!imagePath) return;
    await supabase.storage.from(BOARD_IMAGES_BUCKET).remove([imagePath]).catch(() => undefined);
}

/** Public copies for uploaded images that lack one. Returns the items + the copies made (to undo on failure). */
async function withPortalCopies(items: readonly BoardItem[], userId: string): Promise<{ items: BoardItem[]; made: string[] }> {
    const made: string[] = [];
    const out: BoardItem[] = [];
    try {
        for (const it of items) {
            if (it.kind === 'image' && it.imagePath && !it.portalPath) {
                const portalPath = await copyImageToPortal(it.imagePath, userId);
                made.push(portalPath);
                out.push({ ...it, portalPath });
            } else out.push(it);
        }
    } catch (e) {
        if (made.length) await supabase.storage.from(BOARD_PORTAL_BUCKET).remove(made).catch(() => undefined);
        throw e;
    }
    return { items: out, made };
}

// ------------------------------------------------------------------------------------------------ writes
export async function createBoard(userId: string, jobId: string, draft: BoardDraft): Promise<JobBoard> {
    ensureOnline();
    const row = boardInsertRow(draft, userId, jobId);
    const { data, error } = await supabase.from('job_boards').insert(row).select(BOARD_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The board could not be saved.');
    return mapBoardRow(data as Record<string, unknown>);
}

export async function updateBoard(current: JobBoard, patch: BoardPatch, userId: string): Promise<JobBoard> {
    ensureOnline();
    const row = boardPatchRow(patch);
    let made: string[] = [];
    if (patch.items !== undefined && current.sharedInPortal) {
        const copied = await withPortalCopies(normalizeItems(patch.items), userId);
        made = copied.made;
        row.items = itemsToJson(copied.items);
    }
    const { data, error } = await supabase.from('job_boards').update(row).eq('id', current.id).select(BOARD_COLUMNS).single();
    if (error || !data) {
        if (made.length) await supabase.storage.from(BOARD_PORTAL_BUCKET).remove(made).catch(() => undefined);
        throw writeError(error, 'The changes could not be saved.');
    }
    const saved = mapBoardRow(data as Record<string, unknown>);
    const dropped = droppedImagePaths(current.items, saved.items);
    if (dropped.length) await supabase.storage.from(BOARD_IMAGES_BUCKET).remove(dropped).catch(() => undefined);
    if (current.items.some(i => i.portalPath && !saved.items.some(n => n.portalPath === i.portalPath))) flushStorageCleanup().catch(() => undefined);
    return saved;
}

export async function setBoardShared(board: JobBoard, shared: boolean, userId: string): Promise<JobBoard> {
    ensureOnline();
    if (!shared) {
        const { data, error } = await supabase.from('job_boards').update({ shared_in_portal: false }).eq('id', board.id).select(BOARD_COLUMNS).single();
        if (error || !data) throw writeError(error, 'The change could not be saved.');
        flushStorageCleanup().catch(() => undefined);
        return mapBoardRow(data as Record<string, unknown>);
    }
    const { items, made } = await withPortalCopies(board.items, userId);
    const { data, error } = await supabase.from('job_boards').update({ shared_in_portal: true, items: itemsToJson(items) }).eq('id', board.id)
        .select(BOARD_COLUMNS).single();
    if (error || !data) {
        if (made.length) await supabase.storage.from(BOARD_PORTAL_BUCKET).remove(made).catch(() => undefined);
        throw writeError(error, 'The board could not be shared.');
    }
    return mapBoardRow(data as Record<string, unknown>);
}

export async function deleteBoard(board: JobBoard): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('job_boards').delete().eq('id', board.id);
    if (error) throw writeError(error, 'The board could not be deleted.');
    const paths = board.items.map(i => i.imagePath).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from(BOARD_IMAGES_BUCKET).remove(paths).catch(() => undefined);
    if (board.items.some(i => i.portalPath)) flushStorageCleanup().catch(() => undefined);
}
