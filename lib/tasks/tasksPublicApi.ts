/**
 * The worker side of job tasks on the crew link (/clock/<token>, no login): the two public RPCs of migration
 * 20261116000100_job_tasks.sql and the done-photo upload. Same errors as the clock-in calls (CrewSendError kinds:
 * 'invalid_link', 'paused', 'network', 'rate_limit', 'unavailable', 'rejected', 'unknown'; lib/crew/punchQueue.ts).
 *
 *   fetchCrewTasks(token)                                     CrewTasksView  (the worker's tasks + comments)
 *   updateCrewTask(token, taskId, { status?, comment?, photoType? })   CrewTaskUpdateResult
 *        status 'doing' | 'done' (or omitted), comment ≤ 1000 characters, photoType 'jpg' | 'png' | 'webp' -> uploadPath
 *   uploadCrewTaskPhoto(path, blob)                           puts the photo at uploadPath (allowed for 24 hours)
 *   'unavailable' = the task tables are not in the database yet: hide the task list on the crew page.
 */
import { supabase } from '../supabase.ts';
import { classifyCrewError } from '../crew/crewLogic.ts';
import { CrewSendError } from '../crew/punchQueue.ts';
import { crewAnswerError, mapCrewTaskUpdate, mapCrewTasksView } from './taskRows.ts';
import type { CrewTaskUpdateResult, CrewTasksView } from './taskTypes.ts';

export const CREW_TASK_PHOTOS_BUCKET = 'crew-photos';

const toSendError = (error: unknown): CrewSendError => {
    if (error instanceof CrewSendError) return error;
    const c = classifyCrewError(error as any);
    const kind = c.kind === 'premium' ? 'paused' : c.kind;
    return new CrewSendError(kind, c.message);
};

const answerError = (data: unknown): CrewSendError | null => {
    const e = crewAnswerError(data);
    if (e === 'invalid_link') return new CrewSendError('invalid_link', 'This link is not valid anymore. Ask your boss for a new one.');
    if (e === 'paused') return new CrewSendError('paused', 'Tasks are paused for this company right now. Ask your boss.');
    return null;
};

export async function fetchCrewTasks(token: string): Promise<CrewTasksView> {
    let res;
    try {
        res = await supabase.rpc('crew_tasks_get', { p_token: token });
    } catch (e) {
        throw toSendError(e);
    }
    if (res.error) throw toSendError(res.error);
    const bad = answerError(res.data);
    if (bad) throw bad;
    return mapCrewTasksView(res.data);
}

export async function updateCrewTask(
    token: string,
    taskId: string,
    change: { status?: 'doing' | 'done' | null; comment?: string | null; photoType?: 'jpg' | 'png' | 'webp' | null },
): Promise<CrewTaskUpdateResult> {
    let res;
    try {
        res = await supabase.rpc('crew_task_update', {
            p_token: token,
            p_task_id: taskId,
            p_status: change.status || null,
            p_comment: (change.comment || '').trim() || null,
            p_photo_type: change.photoType || null,
        });
    } catch (e) {
        throw toSendError(e);
    }
    if (res.error) throw toSendError(res.error);
    const bad = answerError(res.data);
    if (bad) throw bad;
    const out = mapCrewTaskUpdate(res.data);
    if (!out) throw new CrewSendError('unknown', 'The change could not be confirmed. Please try again.');
    return out;
}

export async function uploadCrewTaskPhoto(path: string, blob: Blob): Promise<void> {
    let res;
    try {
        res = await supabase.storage.from(CREW_TASK_PHOTOS_BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || 'image/jpeg' });
    } catch (e) {
        throw toSendError(e);
    }
    if (res.error) {
        const msg = String(res.error.message || '');
        if (/exists|duplicate/i.test(msg)) return; // already there (a retry)
        throw toSendError(res.error);
    }
}
