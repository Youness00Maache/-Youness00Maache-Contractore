/**
 * Client feedback / reviews (roadmap D8): Supabase calls. Shapes: ./feedbackTypes.ts, pure logic: ./feedbackLogic.ts,
 * link paths: ./feedbackPath.ts. Table public.feedback_responses + functions of
 * supabase/migrations/20261116001000_feedback_profile.sql.
 *
 * OWNER (signed in; keep the UI HIDDEN until `useFeedbackFeature(userId, online) === 'ready'`)
 *   probeFeedbackBackend()                        'ready' | 'missing' | 'error'
 *   feedbackFeature / useFeedbackFeature(uid, online)   'unknown' | 'ready' | 'missing'
 *   listFeedback({ jobId?, limit? })              FeedbackResponse[] | null   (null = table missing; newest first)
 *   createFeedbackRequest(userId, { jobId?, clientId?, jobName? }, { reuseOpen = true })
 *                                                 FeedbackResponse  (an unanswered request of the same job is reused;
 *                                                 the token / status / snapshots come from the database; Free plan:
 *                                                 throws "PLAN_LIMIT: Feedback requests are part of Premium.")
 *   updateFeedback(id, FeedbackOwnerPatch)        FeedbackResponse  (only testimonial / testimonialName /
 *                                                 testimonialText / ownerNote / hidden are sent)
 *   setTestimonial(id, on, { name?, text? })      FeedbackResponse  (on: owner approves it for the public page;
 *                                                 name defaults to "Jane S." in the database; text must be a part of
 *                                                 the client's comment)
 *   setFeedbackHidden(id, hidden) / setFeedbackNote(id, note)   FeedbackResponse
 *   deleteFeedback(id)                            void
 *   feedbackLink(token)                           'https://<site>/feedback/<token>'  (send it by email / text)
 *   Every write needs a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline it throws an Error whose
 *   message is NEEDS_CONNECTION; isPlanLimitError(e) tells the Premium refusal.
 *
 * PUBLIC (the client's link, no login; never throw)
 *   loadFeedbackRequest(token)  -> { status: 'ready', data: PublicFeedbackRequest } | { status: 'invalid' }
 *                                  | { status: 'missing' } | { status: 'error', message }
 *                                  (data.submitted = already answered: show the thank-you state)
 *   submitFeedback(token, { rating, comment?, name? })
 *                               -> { status: 'ready', data: { ok, rating, reviewUrl } } | { status: 'already' }
 *                                  | { status: 'invalid' } | { status: 'missing' } | { status: 'error', message }
 *                                  reviewUrl: the contractor's Google review link, ONLY for 4-5 stars (else null)
 *   'missing' = the migration is not applied: the page shows "link not available" (same fallback as
 *   lib/portal/questionsApi.ts; remembered until reload).
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isCrewBackendMissing, isNetworkError } from '../crew/crewLogic.ts';
import { createBackendFeature } from '../jobFiles/featureFlag.ts';
import { isMissingBackendError } from '../../components/requests/requestLogic.ts';
import {
    FEEDBACK_COLUMNS, feedbackInsertRow, feedbackPatchRow, mapFeedbackRow, parseFeedbackSubmitResult,
    parsePublicFeedbackRequest, validateFeedbackInput,
} from './feedbackLogic.ts';
import { feedbackRequestUrl, isFeedbackToken } from './feedbackPath.ts';
import type {
    FeedbackOwnerPatch, FeedbackPublicResult, FeedbackRequestInput, FeedbackResponse, FeedbackSubmitInput,
    FeedbackSubmitResult, PublicFeedbackRequest,
} from './feedbackTypes.ts';

/** The Free plan refusal of createFeedbackRequest ("PLAN_LIMIT: ..."). */
export const isPlanLimitError = (e: unknown): boolean => /PLAN_LIMIT/.test(String((e as { message?: unknown } | null)?.message ?? e ?? ''));

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

const writeError = (error: DbError | unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isCrewBackendMissing(error as any)) { feedbackFeature.markMissing(); return new Error('Client feedback is not switched on yet. Please try again later.'); }
    return new Error(errorText(error, fallback));
};

const oneRow = (res: { data: unknown; error: DbError }, fallback: string): FeedbackResponse => {
    if (res.error || !res.data) throw writeError(res.error, fallback);
    return mapFeedbackRow(res.data as Record<string, unknown>);
};

// ------------------------------------------------------------------------------------------------- feature
export async function probeFeedbackBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const { error } = await supabase.from('feedback_responses').select('id').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export const feedbackFeature = createBackendFeature('cd.feedback.feature', probeFeedbackBackend);
export const useFeedbackFeature = feedbackFeature.useFeature;

// ------------------------------------------------------------------------------------------------- owner reads
export async function listFeedback(opts: { jobId?: string | null; limit?: number } = {}): Promise<FeedbackResponse[] | null> {
    let q = supabase.from('feedback_responses').select(FEEDBACK_COLUMNS).order('created_at', { ascending: false })
        .limit(Math.min(Math.max(1, opts.limit ?? 500), 5000));
    if (opts.jobId) q = q.eq('job_id', opts.jobId);
    const { data, error } = await q;
    if (error) {
        if (isCrewBackendMissing(error as any)) { feedbackFeature.markMissing(); return null; }
        throw writeError(error, 'The feedback could not be loaded.');
    }
    return ((data as Record<string, unknown>[] | null) || []).map(mapFeedbackRow);
}

export const feedbackLink = (token: string): string =>
    feedbackRequestUrl(typeof window !== 'undefined' ? window.location.origin : '', token);

// ------------------------------------------------------------------------------------------------- owner writes
export async function createFeedbackRequest(
    userId: string, input: FeedbackRequestInput, opts: { reuseOpen?: boolean } = {},
): Promise<FeedbackResponse> {
    ensureOnline();
    if (input.jobId && opts.reuseOpen !== false) {
        const open = await supabase.from('feedback_responses').select(FEEDBACK_COLUMNS)
            .eq('job_id', input.jobId).eq('status', 'requested').order('requested_at', { ascending: false }).limit(1);
        if (!open.error && Array.isArray(open.data) && open.data[0]) return mapFeedbackRow(open.data[0] as Record<string, unknown>);
    }
    const row = feedbackInsertRow(input, userId);
    const res = await supabase.from('feedback_responses').insert(row).select(FEEDBACK_COLUMNS).single();
    return oneRow(res, 'The feedback request could not be created.');
}

export async function updateFeedback(id: string, patch: FeedbackOwnerPatch): Promise<FeedbackResponse> {
    ensureOnline();
    const row = feedbackPatchRow(patch);
    const res = await supabase.from('feedback_responses').update(row).eq('id', id).select(FEEDBACK_COLUMNS).single();
    return oneRow(res, 'The change could not be saved.');
}

export const setTestimonial = (id: string, on: boolean, opts: { name?: string | null; text?: string | null } = {}): Promise<FeedbackResponse> =>
    updateFeedback(id, {
        testimonial: on,
        ...(on ? { hidden: false } : {}),
        ...(opts.name !== undefined ? { testimonialName: opts.name } : {}),
        ...(opts.text !== undefined ? { testimonialText: opts.text } : {}),
    });

export const setFeedbackHidden = (id: string, hidden: boolean): Promise<FeedbackResponse> => updateFeedback(id, { hidden });
export const setFeedbackNote = (id: string, note: string | null): Promise<FeedbackResponse> => updateFeedback(id, { ownerNote: note });

export async function deleteFeedback(id: string): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('feedback_responses').delete().eq('id', id);
    if (error) throw writeError(error, 'The feedback could not be deleted.');
}

// ------------------------------------------------------------------------------------------------- public (client link)
let publicFeature: 'unknown' | 'ready' | 'missing' = 'unknown';
export const publicFeedbackFeature = () => publicFeature;

type ErrLike = { code?: string; message?: string; hint?: string } | null | undefined;
const isNotFound = (e: ErrLike): boolean => !!e && (e.code === 'P0002' || /feedback link not found/i.test(String(e.message || '')));
const isAlready = (e: ErrLike): boolean => !!e && (e.hint === 'already_submitted' || /ALREADY_SUBMITTED/.test(String(e.message || '')));
const readable = (e: ErrLike, fallback: string): string => String(e?.message || fallback).replace(/^[A-Z_]+:\s*/, '') || fallback;

export async function loadFeedbackRequest(token: string): Promise<FeedbackPublicResult<PublicFeedbackRequest>> {
    if (publicFeature === 'missing') return { status: 'missing' };
    if (!isFeedbackToken(token)) return { status: 'invalid' };
    try {
        const { data, error } = await supabase.rpc('get_feedback_request', { p_token: token });
        if (error) {
            if (isMissingBackendError(error)) { publicFeature = 'missing'; return { status: 'missing' }; }
            if (isNotFound(error)) return { status: 'invalid' };
            return { status: 'error', message: readable(error, 'Could not open this feedback link.') };
        }
        publicFeature = 'ready';
        const parsed = parsePublicFeedbackRequest(data);
        return parsed ? { status: 'ready', data: parsed } : { status: 'error', message: 'Could not open this feedback link.' };
    } catch (e) {
        if (isMissingBackendError(e as any)) { publicFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Could not open this feedback link.' };
    }
}

export async function submitFeedback(token: string, input: FeedbackSubmitInput): Promise<FeedbackPublicResult<FeedbackSubmitResult>> {
    if (publicFeature === 'missing') return { status: 'missing' };
    if (!isFeedbackToken(token)) return { status: 'invalid' };
    const v = validateFeedbackInput(input);
    if (!v.ok) return { status: 'error', message: v.errors.rating || v.errors.comment || v.errors.name || 'Please check your answer.' };
    try {
        const { data, error } = await supabase.rpc('submit_feedback', {
            p_token: token,
            p_rating: v.value.rating,
            p_comment: v.value.comment,
            p_name: v.value.name,
        });
        if (error) {
            if (isMissingBackendError(error)) { publicFeature = 'missing'; return { status: 'missing' }; }
            if (isAlready(error)) return { status: 'already' };
            if (isNotFound(error)) return { status: 'invalid' };
            return { status: 'error', message: readable(error, 'Your feedback could not be sent.') };
        }
        const parsed = parseFeedbackSubmitResult(data);
        return parsed ? { status: 'ready', data: parsed } : { status: 'error', message: 'Your feedback could not be sent.' };
    } catch (e) {
        if (isMissingBackendError(e as any)) { publicFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Your feedback could not be sent.' };
    }
}
