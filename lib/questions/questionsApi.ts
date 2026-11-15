/**
 * Project questions + submittals: Supabase calls of the signed-in contractor (shapes: lib/questions/questionTypes.ts,
 * pure logic: lib/questions/questionLogic.ts). Table public.job_questions.
 *
 *  - Keep the feature HIDDEN until the migration is applied: `useQuestionsFeature(userId, online) === 'ready'`.
 *    Reads return null while the table is missing (and mark the feature missing).
 *  - Every write needs a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline it throws an Error
 *    whose message is NEEDS_CONNECTION; other failures throw a readable Error ("PLAN_LIMIT: ..." on Free: use
 *    isPlanLimitError from lib/jobFiles/jobFilesApi.ts).
 *  - The client's answer, the history, sentAt / closedAt and sharedInPortal are written by the database; the
 *    contractor's calls never send them.
 *
 * API (all async):
 *   probeQuestionsBackend()                         'ready' | 'missing' | 'error'
 *   questionsFeature / useQuestionsFeature(uid, online)
 *   listJobQuestions(jobId)                         JobQuestion[] | null   (sortQuestions order)
 *   listWaitingQuestions(limit?)                    JobQuestion[] | null   (sent, every job; for a dashboard badge)
 *   createQuestion(userId, jobId, draft, { send? }) JobQuestion   (a draft, or sent at once)
 *   updateQuestion(id, patch)                       JobQuestion   (draft or sent items; a sent one logs "edited")
 *   sendQuestion(id)                                JobQuestion   (draft -> sent: visible in the portal)
 *   askAgain(id)                                    JobQuestion   (answered / approved / rejected / closed -> sent;
 *                                                                  the previous answer stays in the history)
 *   closeQuestion(id)                               JobQuestion
 *   setQuestionStatus(id, status)                   JobQuestion   (any allowed move, see canTransition)
 *   deleteQuestion(id)                              void
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isCrewBackendMissing, isNetworkError } from '../crew/crewLogic.ts';
import { createBackendFeature } from '../jobFiles/featureFlag.ts';
import { QUESTION_COLUMNS, mapQuestionRow, questionInsertRow, questionPatchRow, sortQuestions } from './questionLogic.ts';
import { QUESTION_LIMITS, type JobQuestion, type QuestionDraft, type QuestionPatch, type QuestionStatus } from './questionTypes.ts';

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

const writeError = (error: DbError | unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isCrewBackendMissing(error as any)) { questionsFeature.markMissing(); return new Error('Client questions are not switched on yet. Please try again later.'); }
    return new Error(errorText(error, fallback));
};

const readRows = (res: { data: unknown; error: DbError }): JobQuestion[] | null => {
    if (res.error) {
        if (isCrewBackendMissing(res.error as any)) { questionsFeature.markMissing(); return null; }
        throw writeError(res.error, 'The questions could not be loaded.');
    }
    return sortQuestions(((res.data as Record<string, unknown>[] | null) || []).map(mapQuestionRow));
};

// ------------------------------------------------------------------------------------------------- feature
export async function probeQuestionsBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const { error } = await supabase.from('job_questions').select('id').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export const questionsFeature = createBackendFeature('cd.questions.feature', probeQuestionsBackend);
export const useQuestionsFeature = questionsFeature.useFeature;

// ------------------------------------------------------------------------------------------------- reads
export async function listJobQuestions(jobId: string): Promise<JobQuestion[] | null> {
    const res = await supabase.from('job_questions').select(QUESTION_COLUMNS).eq('job_id', jobId)
        .order('created_at', { ascending: false }).limit(QUESTION_LIMITS.perJob);
    return readRows(res);
}

export async function listWaitingQuestions(limit = 200): Promise<JobQuestion[] | null> {
    const res = await supabase.from('job_questions').select(QUESTION_COLUMNS).eq('status', 'sent')
        .order('due_date', { ascending: true, nullsFirst: false }).limit(Math.min(Math.max(1, limit), 1000));
    return readRows(res);
}

// ------------------------------------------------------------------------------------------------ writes
export async function createQuestion(userId: string, jobId: string, draft: QuestionDraft, opts: { send?: boolean } = {}): Promise<JobQuestion> {
    ensureOnline();
    const row = questionInsertRow(draft, userId, jobId, !!opts.send);
    const { data, error } = await supabase.from('job_questions').insert(row).select(QUESTION_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The question could not be saved.');
    return mapQuestionRow(data as Record<string, unknown>);
}

export async function updateQuestion(id: string, patch: QuestionPatch): Promise<JobQuestion> {
    ensureOnline();
    const row = questionPatchRow(patch);
    const { data, error } = await supabase.from('job_questions').update(row).eq('id', id).select(QUESTION_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The changes could not be saved.');
    return mapQuestionRow(data as Record<string, unknown>);
}

export async function setQuestionStatus(id: string, status: QuestionStatus): Promise<JobQuestion> {
    ensureOnline();
    const { data, error } = await supabase.from('job_questions').update({ status }).eq('id', id).select(QUESTION_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The change could not be saved.');
    return mapQuestionRow(data as Record<string, unknown>);
}

export const sendQuestion = (id: string): Promise<JobQuestion> => setQuestionStatus(id, 'sent');
export const askAgain = (id: string): Promise<JobQuestion> => setQuestionStatus(id, 'sent');
export const closeQuestion = (id: string): Promise<JobQuestion> => setQuestionStatus(id, 'closed');

export async function deleteQuestion(id: string): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('job_questions').delete().eq('id', id);
    if (error) throw writeError(error, 'The question could not be deleted.');
}
