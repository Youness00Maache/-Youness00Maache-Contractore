/**
 * Job tasks + schedule (roadmap batch D2): the data shapes every other file of lib/tasks/ uses.
 * Database: supabase/migrations/20261116000100_job_tasks.sql (keep TASK_STATUSES, TASK_SOURCES and TASK_LIMITS in
 * sync with its checks; scripts/job-tasks-check.ts compares them).
 *
 * Dates are LOCAL calendar days as 'YYYY-MM-DD' strings (start_date / due_date are SQL `date`). Timestamps
 * (completedAt, createdAt, updatedAt) are ISO strings.
 *
 * Shapes (camelCase in the app, snake_case in the table):
 *   JobTask           one row of public.job_tasks
 *   TaskComment       one row of public.task_comments
 *   TaskDraft         what the app sends to create a task (id optional: pass one to link dependencies in a batch)
 *   TaskPatch         what the app sends to change a task (only the keys present change)
 *   ProposedTask      a task suggested by AI or a work order, not saved yet (dependsOnIndex = positions in the list)
 *   TaskTemplate      a saved list of tasks with day offsets (public.user_settings 'tasks.templates')
 *   CrewTask          a task as the worker sees it on the crew link (crew_tasks_get)
 */

export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

/** Plain words for the UI. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
    todo: 'To do',
    doing: 'In progress',
    blocked: 'Blocked',
    done: 'Done',
};

export const TASK_SOURCES = ['manual', 'ai', 'work_order', 'template'] as const;
export type TaskSource = typeof TASK_SOURCES[number];

export const COMMENT_AUTHOR_KINDS = ['owner', 'crew'] as const;
export type CommentAuthorKind = typeof COMMENT_AUTHOR_KINDS[number];

/** Same limits as the table checks / guards of the migration. */
export const TASK_LIMITS = {
    title: 200,
    notes: 4000,
    dependsOn: 50,
    perJob: 500,
    comment: 2000,
    commentsPerTask: 200,
    authorName: 80,
    /** comment typed on the crew link */
    crewComment: 1000,
    sortOrder: 1_000_000,
} as const;

export interface JobTask {
    id: string;
    userId: string;
    jobId: string;
    title: string;
    notes: string | null;
    status: TaskStatus;
    /** assignee (public.crew_members.id) or null */
    crewMemberId: string | null;
    startDate: string | null;
    dueDate: string | null;
    isMilestone: boolean;
    /** ids of tasks of the same job this one waits for */
    dependsOn: string[];
    sortOrder: number;
    completedAt: string | null;
    /** crew-photos bucket path of the worker's "done" photo (signed URL to show it) */
    completedPhotoPath: string | null;
    source: TaskSource;
    /** the Work Order document this task came from */
    workOrderDocId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TaskComment {
    id: string;
    taskId: string;
    body: string;
    authorKind: CommentAuthorKind;
    authorName: string | null;
    createdAt: string;
}

export interface TaskDraft {
    /** optional client-made uuid (lets a batch link dependencies before it is saved) */
    id?: string;
    title: string;
    notes?: string | null;
    status?: TaskStatus;
    crewMemberId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    isMilestone?: boolean;
    dependsOn?: string[];
    sortOrder?: number;
    source?: TaskSource;
    workOrderDocId?: string | null;
}

export type TaskPatch = Partial<Omit<TaskDraft, 'id' | 'source'>>;

/** A suggested task (AI / work order / template before saving). */
export interface ProposedTask {
    title: string;
    notes: string | null;
    startDate: string | null;
    dueDate: string | null;
    isMilestone: boolean;
    /** matched crew member, or null */
    crewMemberId: string | null;
    /** the name as written in the text (shown when no crew member matched) */
    assigneeName: string | null;
    /** positions (0-based) of earlier tasks in the same proposal list */
    dependsOnIndex: number[];
    source: TaskSource;
    workOrderDocId: string | null;
}

// ------------------------------------------------------------------------------------------- templates
/** public.user_settings key of the saved task templates. */
export const TASK_TEMPLATES_SETTING = 'tasks.templates';

export const TEMPLATE_LIMITS = {
    templates: 25,
    itemsPerTemplate: 60,
    name: 80,
    itemTitle: 200,
    itemNotes: 500,
    /** day offsets / lengths stay within about 3 years */
    maxDays: 1000,
    /** user_settings.value is checked at 20,000 characters: keep a margin */
    jsonChars: 18_000,
} as const;

export interface TaskTemplateItem {
    title: string;
    notes?: string;
    /** days after the template's start date the task starts (0 = same day) */
    offsetDays: number;
    /** calendar days the task takes (1 = a one-day task); a milestone is 0 */
    durationDays: number;
    isMilestone?: boolean;
    /** positions (0-based) of EARLIER items this one waits for */
    dependsOn?: number[];
}

export interface TaskTemplate {
    id: string;
    name: string;
    items: TaskTemplateItem[];
    updatedAt: string;
}

/** The stored value: { version: 1, templates: [...] }. */
export interface TaskTemplatesSetting {
    version: 1;
    templates: TaskTemplate[];
}

// --------------------------------------------------------------------------------------------- crew link
export interface CrewTaskComment {
    id: string;
    body: string;
    authorKind: CommentAuthorKind;
    /** the worker's own name on their comments; null for the owner's */
    authorName: string | null;
    createdAt: string;
}

export interface CrewTask {
    id: string;
    jobId: string;
    jobName: string;
    jobAddress: string;
    jobStatus: string;
    title: string;
    notes: string | null;
    status: TaskStatus;
    startDate: string | null;
    dueDate: string | null;
    isMilestone: boolean;
    completedAt: string | null;
    hasPhoto: boolean;
    /** unfinished tasks this one waits for */
    waitingOn: number;
    comments: CrewTaskComment[];
}

export interface CrewTasksView {
    serverNow: string;
    tasks: CrewTask[];
}

/** What crew_task_update returns (uploadPath: put the photo there within 24 hours). */
export interface CrewTaskUpdateResult {
    id: string;
    status: TaskStatus;
    completedAt: string | null;
    hasPhoto: boolean;
    uploadPath: string | null;
}
