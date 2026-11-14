/**
 * Job tasks: Supabase calls of the signed-in contractor (shapes: lib/tasks/taskTypes.ts; rows: lib/tasks/taskRows.ts).
 *
 *  - Reads return null while migration 20261116000100_job_tasks.sql is not applied (keep the feature hidden; see
 *    lib/tasks/taskFeature.ts useTasksFeature).
 *  - Every write needs a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline it throws an Error
 *    whose message is NEEDS_CONNECTION, and other failures throw an Error with a readable message.
 *
 * API (all async):
 *   probeTasksBackend()                          'ready' | 'missing' | 'error'
 *   listJobTasks(jobId)                          JobTask[] | null          (sorted by sortOrder)
 *   listOpenTasks({ limit?, dueOnOrBefore? })    JobTask[] | null          (every job; for the Schedule / dashboard)
 *   listWorkOrderTasks(docId)                    JobTask[] | null
 *   createTask(userId, jobId, draft)             JobTask
 *   createTasks(userId, jobId, drafts)           JobTask[]   (batch: AI / work order / template; links dependencies)
 *   updateTask(id, patch)                        JobTask
 *   setTaskStatus(id, status)                    JobTask
 *   applyDatePatches(patches)                    void        (shiftDependents / pushDependents results)
 *   reorderTasks(patches)                        void        (reorderPatches result)
 *   deleteTask(task)                             void        (also removes the worker's done photo)
 *   listTaskComments(taskId)                     TaskComment[] | null
 *   addTaskComment(userId, taskId, body, authorName?)  TaskComment
 *   deleteTaskComment(id)                        void
 *   taskPhotoUrl(path, seconds?)                 signed URL of a done photo (crew-photos bucket), or null
 *   loadTaskTemplates() / saveTaskTemplates(list)  saved templates (public.user_settings 'tasks.templates')
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isCrewBackendMissing, isNetworkError } from '../crew/crewLogic.ts';
import { loadTaskTemplatesRaw, saveTaskTemplatesRaw, type SyncMode } from '../userData.ts';
import { parseTaskTemplates, serializeTaskTemplates, topologicalOrder, type DatePatch } from './taskLogic.ts';
import { COMMENT_COLUMNS, TASK_COLUMNS, mapCommentRow, mapTaskRow, taskInsertRow, taskPatchRow } from './taskRows.ts';
import { TASK_LIMITS, type JobTask, type TaskComment, type TaskDraft, type TaskPatch, type TaskStatus, type TaskTemplate } from './taskTypes.ts';

export const TASK_PHOTOS_BUCKET = 'crew-photos';

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

/** A readable Error for a failed write. */
const writeError = (error: DbError | unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isCrewBackendMissing(error as any)) return new Error('Job tasks are not switched on yet. Please try again later.');
    return new Error(errorText(error, fallback));
};

/** Read result: rows, null (feature not in the database) or throws. */
const readRows = <T>(res: { data: unknown; error: DbError }, map: (r: Record<string, unknown>) => T): T[] | null => {
    if (res.error) {
        if (isCrewBackendMissing(res.error as any)) return null;
        throw writeError(res.error, 'Your tasks could not be loaded.');
    }
    return ((res.data as Record<string, unknown>[] | null) || []).map(map);
};

// ------------------------------------------------------------------------------------------------- reads
export async function probeTasksBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const { error } = await supabase.from('job_tasks').select('id').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export async function listJobTasks(jobId: string): Promise<JobTask[] | null> {
    const res = await supabase.from('job_tasks').select(TASK_COLUMNS).eq('job_id', jobId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }).limit(TASK_LIMITS.perJob);
    return readRows(res, mapTaskRow);
}

/** Unfinished tasks of every job, soonest due first (undated last). `dueOnOrBefore` keeps dated ones up to that day. */
export async function listOpenTasks(opts: { limit?: number; dueOnOrBefore?: string } = {}): Promise<JobTask[] | null> {
    let q = supabase.from('job_tasks').select(TASK_COLUMNS).neq('status', 'done');
    if (opts.dueOnOrBefore) q = q.lte('due_date', opts.dueOnOrBefore);
    const res = await q.order('due_date', { ascending: true, nullsFirst: false }).order('sort_order', { ascending: true })
        .limit(Math.min(Math.max(1, opts.limit ?? 500), 2000));
    return readRows(res, mapTaskRow);
}

export async function listWorkOrderTasks(docId: string): Promise<JobTask[] | null> {
    const res = await supabase.from('job_tasks').select(TASK_COLUMNS).eq('work_order_doc_id', docId)
        .order('sort_order', { ascending: true }).limit(TASK_LIMITS.perJob);
    return readRows(res, mapTaskRow);
}

export async function listTaskComments(taskId: string): Promise<TaskComment[] | null> {
    const res = await supabase.from('task_comments').select(COMMENT_COLUMNS).eq('task_id', taskId)
        .order('created_at', { ascending: true }).limit(TASK_LIMITS.commentsPerTask);
    return readRows(res, mapCommentRow);
}

/** Signed URL (default 1 hour) of a worker's done photo; null when it can't be made. */
export async function taskPhotoUrl(path: string, seconds = 3600): Promise<string | null> {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(TASK_PHOTOS_BUCKET).createSignedUrl(path, seconds);
    return error || !data?.signedUrl ? null : data.signedUrl;
}

// ------------------------------------------------------------------------------------------------ writes
export async function createTask(userId: string, jobId: string, draft: TaskDraft): Promise<JobTask> {
    ensureOnline();
    const row = taskInsertRow(draft, userId, jobId);
    const { data, error } = await supabase.from('job_tasks').insert(row).select(TASK_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The task could not be saved.');
    return mapTaskRow(data as Record<string, unknown>);
}

/**
 * Saves several new tasks of one job at once (AI proposals, a work order, a template). Give each draft an `id` to link
 * dependencies inside the batch (proposalsToDrafts / instantiateTemplate do). Saved with the tasks waited for first;
 * a dependency the database could not link in the batch is set again right after. Returns the saved tasks.
 */
export async function createTasks(userId: string, jobId: string, drafts: readonly TaskDraft[]): Promise<JobTask[]> {
    ensureOnline();
    if (!drafts.length) return [];
    const withIds = drafts.map(d => ({ ...d, id: d.id || crypto.randomUUID() }));
    const order = topologicalOrder(withIds.map((d, i) => ({
        id: d.id, status: 'todo' as const, startDate: null, dueDate: null, isMilestone: false, dependsOn: d.dependsOn || [], sortOrder: i,
    })));
    const byId = new Map(withIds.map(d => [d.id, d]));
    const rows = order.map(id => taskInsertRow(byId.get(id)!, userId, jobId));
    const { data, error } = await supabase.from('job_tasks').insert(rows).select(TASK_COLUMNS);
    if (error || !data) throw writeError(error, 'The tasks could not be saved.');
    const saved = (data as Record<string, unknown>[]).map(mapTaskRow);
    // the database drops a dependency on a task it had not saved yet: link those now
    const out: JobTask[] = [];
    for (const t of saved) {
        const wanted = (byId.get(t.id)?.dependsOn || []).filter(id => byId.has(id));
        if (wanted.some(id => !t.dependsOn.includes(id))) {
            const res = await supabase.from('job_tasks').update({ depends_on: wanted }).eq('id', t.id).select(TASK_COLUMNS).single();
            out.push(!res.error && res.data ? mapTaskRow(res.data as Record<string, unknown>) : t);
        } else {
            out.push(t);
        }
    }
    const pos = new Map(withIds.map((d, i) => [d.id, i]));
    return out.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

export async function updateTask(id: string, patch: TaskPatch): Promise<JobTask> {
    ensureOnline();
    const row = taskPatchRow(patch);
    if ('title' in row && !row.title) throw new Error('Give the task a short name.');
    const { data, error } = await supabase.from('job_tasks').update(row).eq('id', id).select(TASK_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The task could not be saved.');
    return mapTaskRow(data as Record<string, unknown>);
}

export const setTaskStatus = (id: string, status: TaskStatus): Promise<JobTask> => updateTask(id, { status });

/** Saves new dates of several tasks (from shiftDependents / pushDependents), one after the other. */
export async function applyDatePatches(patches: readonly DatePatch[]): Promise<void> {
    ensureOnline();
    for (const p of patches) {
        const { error } = await supabase.from('job_tasks').update(taskPatchRow({ startDate: p.startDate, dueDate: p.dueDate })).eq('id', p.id);
        if (error) throw writeError(error, 'The new dates could not be saved.');
    }
}

/** Saves a new order (from reorderPatches). */
export async function reorderTasks(patches: ReadonlyArray<{ id: string; sortOrder: number }>): Promise<void> {
    ensureOnline();
    for (const p of patches) {
        const { error } = await supabase.from('job_tasks').update({ sort_order: p.sortOrder }).eq('id', p.id);
        if (error) throw writeError(error, 'The new order could not be saved.');
    }
}

/** Deletes a task (its comments go with it; tasks waiting on it stop waiting) and the worker's done photo. */
export async function deleteTask(task: Pick<JobTask, 'id' | 'completedPhotoPath'>): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('job_tasks').delete().eq('id', task.id);
    if (error) throw writeError(error, 'The task could not be deleted.');
    if (task.completedPhotoPath) {
        // best effort: a photo left behind is only storage
        try { await supabase.storage.from(TASK_PHOTOS_BUCKET).remove([task.completedPhotoPath]); } catch { /* ignore */ }
    }
}

export async function addTaskComment(userId: string, taskId: string, body: string, authorName?: string | null): Promise<TaskComment> {
    ensureOnline();
    const text = body.replace(/\r\n?/g, '\n').trim().slice(0, TASK_LIMITS.comment);
    if (!text) throw new Error('Write a comment first.');
    const row = { user_id: userId, task_id: taskId, body: text, author_kind: 'owner', author_name: (authorName || '').trim().slice(0, TASK_LIMITS.authorName) || null };
    const { data, error } = await supabase.from('task_comments').insert(row).select(COMMENT_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The comment could not be saved.');
    return mapCommentRow(data as Record<string, unknown>);
}

export async function deleteTaskComment(id: string): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('task_comments').delete().eq('id', id);
    if (error) throw writeError(error, 'The comment could not be deleted.');
}

// --------------------------------------------------------------------------------------------- templates
/** The contractor's saved task templates ([] when none or unreadable). STARTER_TASK_TEMPLATES are separate. */
export async function loadTaskTemplates(): Promise<TaskTemplate[]> {
    try {
        return parseTaskTemplates(await loadTaskTemplatesRaw());
    } catch {
        return [];
    }
}

/** Saves the whole list (account + this device). Throws a readable error when it is too big or can't be stored. */
export async function saveTaskTemplates(list: readonly TaskTemplate[]): Promise<SyncMode> {
    const { value, error } = serializeTaskTemplates(list);
    if (error) throw new Error(error);
    const mode = await saveTaskTemplatesRaw(value);
    if (mode === 'failed') throw new Error('Your task templates could not be saved. Check your connection and try again.');
    return mode;
}
