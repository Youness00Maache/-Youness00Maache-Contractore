/**
 * Job tasks: table rows <-> app shapes (pure, no Supabase; tested by scripts/job-tasks-check.ts).
 *   TASK_COLUMNS / COMMENT_COLUMNS   the select lists
 *   mapTaskRow, mapCommentRow        row -> JobTask / TaskComment (tolerant: bad values get safe defaults)
 *   taskInsertRow, taskPatchRow      TaskDraft / TaskPatch -> row (trimmed, clamped; only keys present)
 *   mapCrewTasksView, mapCrewTaskUpdate   crew link RPC answers -> CrewTasksView / CrewTaskUpdateResult
 */
import {
    COMMENT_AUTHOR_KINDS, TASK_LIMITS, TASK_SOURCES, TASK_STATUSES,
    type CommentAuthorKind, type CrewTask, type CrewTaskUpdateResult, type CrewTasksView, type JobTask, type TaskComment,
    type TaskDraft, type TaskPatch, type TaskSource, type TaskStatus,
} from './taskTypes.ts';
import { isYmd } from './taskLogic.ts';

export const TASK_COLUMNS = 'id, user_id, job_id, title, notes, status, crew_member_id, start_date, due_date, is_milestone, depends_on, sort_order, completed_at, completed_photo_path, source, work_order_doc_id, created_at, updated_at';
export const COMMENT_COLUMNS = 'id, task_id, body, author_kind, author_name, created_at';

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const sOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const ymdOrNull = (v: unknown): string | null => {
    const x = typeof v === 'string' ? v.slice(0, 10) : '';
    return isYmd(x) ? x : null;
};
const statusOf = (v: unknown): TaskStatus => ((TASK_STATUSES as readonly string[]).includes(s(v)) ? s(v) as TaskStatus : 'todo');
const sourceOf = (v: unknown): TaskSource => ((TASK_SOURCES as readonly string[]).includes(s(v)) ? s(v) as TaskSource : 'manual');
const authorOf = (v: unknown): CommentAuthorKind => ((COMMENT_AUTHOR_KINDS as readonly string[]).includes(s(v)) ? s(v) as CommentAuthorKind : 'owner');
const intOf = (v: unknown, dflt = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : dflt;
};

export function mapTaskRow(r: Row): JobTask {
    return {
        id: s(r.id),
        userId: s(r.user_id),
        jobId: s(r.job_id),
        title: s(r.title),
        notes: sOrNull(r.notes),
        status: statusOf(r.status),
        crewMemberId: sOrNull(r.crew_member_id),
        startDate: ymdOrNull(r.start_date),
        dueDate: ymdOrNull(r.due_date),
        isMilestone: r.is_milestone === true,
        dependsOn: Array.isArray(r.depends_on) ? r.depends_on.map(s).filter(Boolean) : [],
        sortOrder: intOf(r.sort_order),
        completedAt: sOrNull(r.completed_at),
        completedPhotoPath: sOrNull(r.completed_photo_path),
        source: sourceOf(r.source),
        workOrderDocId: sOrNull(r.work_order_doc_id),
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
    };
}

export function mapCommentRow(r: Row): TaskComment {
    return {
        id: s(r.id),
        taskId: s(r.task_id),
        body: s(r.body),
        authorKind: authorOf(r.author_kind),
        authorName: sOrNull(r.author_name),
        createdAt: s(r.created_at),
    };
}

const cleanTitle = (v: unknown): string => s(v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TASK_LIMITS.title);
const cleanNotes = (v: unknown): string | null => {
    const t = s(v).replace(/\r\n?/g, '\n').trim().slice(0, TASK_LIMITS.notes);
    return t || null;
};
const clampSort = (v: unknown): number => Math.max(-TASK_LIMITS.sortOrder, Math.min(TASK_LIMITS.sortOrder, intOf(v)));

/** Row of a TaskPatch: only the keys present (dates checked; a start after the due date is swapped). */
export function taskPatchRow(p: TaskPatch): Row {
    const row: Row = {};
    if (p.title !== undefined) row.title = cleanTitle(p.title);
    if (p.notes !== undefined) row.notes = cleanNotes(p.notes);
    if (p.status !== undefined) row.status = statusOf(p.status);
    if (p.crewMemberId !== undefined) row.crew_member_id = p.crewMemberId || null;
    if (p.startDate !== undefined) row.start_date = ymdOrNull(p.startDate);
    if (p.dueDate !== undefined) row.due_date = ymdOrNull(p.dueDate);
    if (p.isMilestone !== undefined) row.is_milestone = p.isMilestone === true;
    if (p.dependsOn !== undefined) row.depends_on = [...new Set((p.dependsOn || []).filter(Boolean))].slice(0, TASK_LIMITS.dependsOn);
    if (p.sortOrder !== undefined) row.sort_order = clampSort(p.sortOrder);
    if (p.workOrderDocId !== undefined) row.work_order_doc_id = p.workOrderDocId || null;
    if (typeof row.start_date === 'string' && typeof row.due_date === 'string' && row.start_date > row.due_date) {
        [row.start_date, row.due_date] = [row.due_date, row.start_date];
    }
    return row;
}

/** Insert row of a new task. Throws when the title is empty. */
export function taskInsertRow(d: TaskDraft, userId: string, jobId: string): Row {
    const title = cleanTitle(d.title);
    if (!title) throw new Error('Give the task a short name.');
    const row: Row = {
        ...taskPatchRow({ ...d, title }),
        user_id: userId,
        job_id: jobId,
        source: sourceOf(d.source),
    };
    if (d.id) row.id = d.id;
    for (const k of ['notes', 'crew_member_id', 'start_date', 'due_date', 'work_order_doc_id'] as const) if (!(k in row)) row[k] = null;
    if (!('status' in row)) row.status = 'todo';
    if (!('is_milestone' in row)) row.is_milestone = false;
    if (!('depends_on' in row)) row.depends_on = [];
    if (!('sort_order' in row)) row.sort_order = 0;
    return row;
}

// ------------------------------------------------------------------------------------------ crew link
const obj = (v: unknown): Row => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Row;
    if (typeof v === 'string') {
        try { const x = JSON.parse(v); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; }
    }
    return {};
};

export function mapCrewTask(r: Row): CrewTask {
    return {
        id: s(r.id),
        jobId: s(r.job_id),
        jobName: s(r.job_name),
        jobAddress: s(r.job_address),
        jobStatus: s(r.job_status),
        title: s(r.title),
        notes: sOrNull(r.notes),
        status: statusOf(r.status),
        startDate: ymdOrNull(r.start_date),
        dueDate: ymdOrNull(r.due_date),
        isMilestone: r.is_milestone === true,
        completedAt: sOrNull(r.completed_at),
        hasPhoto: r.has_photo === true,
        waitingOn: Math.max(0, intOf(r.waiting_on)),
        comments: (Array.isArray(r.comments) ? r.comments : []).map(c => {
            const x = obj(c);
            return { id: s(x.id), body: s(x.body), authorKind: authorOf(x.author_kind), authorName: sOrNull(x.author_name), createdAt: s(x.created_at) };
        }),
    };
}

/** crew_tasks_get answer (without its { error } case, which the caller handles first). */
export function mapCrewTasksView(data: unknown): CrewTasksView {
    const r = obj(data);
    return {
        serverNow: s(r.server_now) || new Date().toISOString(),
        tasks: (Array.isArray(r.tasks) ? r.tasks : []).map(t => mapCrewTask(obj(t))).filter(t => t.id && t.title),
    };
}

/** crew_task_update answer. */
export function mapCrewTaskUpdate(data: unknown): CrewTaskUpdateResult | null {
    const r = obj(data);
    const t = obj(r.task);
    if (!t.id) return null;
    return {
        id: s(t.id),
        status: statusOf(t.status),
        completedAt: sOrNull(t.completed_at),
        hasPhoto: t.has_photo === true,
        uploadPath: sOrNull(r.upload_path),
    };
}

/** Error key of a crew link answer ({ error: 'invalid_link' | 'paused' }), or null. */
export const crewAnswerError = (data: unknown): 'invalid_link' | 'paused' | null => {
    const e = obj(data).error;
    return e === 'invalid_link' || e === 'paused' ? e : null;
};
