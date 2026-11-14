/**
 * "Turn this into tasks" (Premium + AI): the browser side of the ai-assistant task 'extract_tasks'
 * (supabase/functions/ai-assistant/shared/taskExtraction.ts). A voice note, daily report or typed text goes in;
 * PROPOSED job tasks come back. Nothing is saved here: show the proposals, let the contractor edit / untick them,
 * then save with proposalsToDrafts() + createTasks() (lib/tasks).
 *
 *   const { tasks, replyText } = await runExtractTasks({ text, sourceKind: 'voice_note', today, job, crew, existingTitles });
 *   errors: ExtractTasksError with code PLAN_REQUIRED (not Premium + AI) / PLAN_LIMIT / CREDITS_EMPTY / AI_BUSY /
 *           AI_BAD_OUTPUT / TOO_LARGE / BAD_REQUEST …, message ready to show (offline: NEEDS_CONNECTION).
 */
import { supabase } from '../../lib/supabase.ts';
import { NEEDS_CONNECTION, isBrowserOffline } from '../../lib/offline/connection.ts';
import { isYmd } from '../../lib/tasks/taskLogic.ts';
import { TASK_LIMITS, type ProposedTask } from '../../lib/tasks/taskTypes.ts';
import {
    EXTRACT_TASKS_LIMITS, EXTRACT_TASKS_TASK, type CrewRef, type ExtractSourceKind,
} from '../../supabase/functions/ai-assistant/shared/taskExtraction.ts';
import { readFunctionError } from '../hooks/useMasterAIRouter.ts';

export interface ExtractTasksInput {
    text: string;
    sourceKind: ExtractSourceKind;
    /** the user's local date YYYY-MM-DD (due phrases are resolved from it) */
    today: string;
    job?: { id: string; name: string } | null;
    /** the account's crew members (assignee names are matched against them) */
    crew?: readonly CrewRef[];
    /** titles of the job's current tasks (skipped) */
    existingTitles?: readonly string[];
    language?: string;
}

export interface ExtractTasksResult {
    tasks: ProposedTask[];
    replyText: string;
}

export class ExtractTasksError extends Error {
    constructor(message: string, public code: string) { super(message); }
}

/** The request body (exported for tests). */
export function buildExtractTasksBody(input: ExtractTasksInput): Record<string, unknown> {
    return {
        task: EXTRACT_TASKS_TASK,
        text: input.text,
        source_kind: input.sourceKind,
        context: {
            today: input.today,
            language: input.language,
            job: input.job ? { id: input.job.id, name: input.job.name } : undefined,
            crew: (input.crew || []).slice(0, EXTRACT_TASKS_LIMITS.crew).map(m => ({ id: m.id, name: m.name })),
            existing_titles: (input.existingTitles || []).slice(0, EXTRACT_TASKS_LIMITS.existingTitles),
        },
    };
}

/**
 * The function's answer -> proposals (checked again here: titles, dates, crew ids from the input only, dependencies
 * only to earlier tasks). Throws on an answer that is not an extract_tasks answer.
 */
export function parseExtractTasksResponse(data: unknown, input: Pick<ExtractTasksInput, 'crew'>): ExtractTasksResult {
    const o = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
    if (!o || o.ok !== true || o.task !== EXTRACT_TASKS_TASK || !Array.isArray(o.tasks)) throw new Error('The assistant sent an answer the app could not read. Please try again.');
    const crewIds = new Map((input.crew || []).map(m => [m.id, m.name]));
    const tasks: ProposedTask[] = [];
    o.tasks.slice(0, EXTRACT_TASKS_LIMITS.tasks).forEach((raw) => {
        const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
        const title = typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim().slice(0, TASK_LIMITS.title) : '';
        if (!title) return;
        const memberId = typeof r.crew_member_id === 'string' && crewIds.has(r.crew_member_id) ? r.crew_member_id : null;
        const index = tasks.length;
        tasks.push({
            title,
            notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, TASK_LIMITS.notes) : null,
            startDate: null,
            dueDate: isYmd(r.due_date) ? r.due_date : null,
            isMilestone: r.is_milestone === true,
            crewMemberId: memberId,
            assigneeName: memberId ? crewIds.get(memberId)! : typeof r.assignee_name === 'string' && r.assignee_name.trim() ? r.assignee_name.trim().slice(0, 80) : null,
            dependsOnIndex: Array.isArray(r.depends_on)
                ? [...new Set(r.depends_on.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < index))]
                : [],
            source: 'ai',
            workOrderDocId: null,
        });
    });
    return { tasks, replyText: typeof o.reply_text === 'string' ? o.reply_text : '' };
}

/** Calls the ai-assistant 'extract_tasks' task. Throws ExtractTasksError. */
export async function runExtractTasks(input: ExtractTasksInput, signal?: AbortSignal): Promise<ExtractTasksResult> {
    if (isBrowserOffline()) throw new ExtractTasksError(NEEDS_CONNECTION, 'OFFLINE');
    const text = input.text.trim();
    if (!text) throw new ExtractTasksError('Add a note or report to turn into tasks.', 'BAD_REQUEST');
    if (text.length > EXTRACT_TASKS_LIMITS.textChars) throw new ExtractTasksError('That text is too long. Please shorten it.', 'TOO_LARGE');
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body: buildExtractTasksBody({ ...input, text }), signal, timeout: 130_000 });
    if (error) {
        const info = await readFunctionError(error);
        throw new ExtractTasksError(info.message.replace(/^PLAN_REQUIRED:\s*/, ''), info.code);
    }
    try {
        return parseExtractTasksResponse(data, input);
    } catch (e) {
        throw new ExtractTasksError((e as Error).message, 'AI_BAD_OUTPUT');
    }
}
