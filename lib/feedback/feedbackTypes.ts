/**
 * Client feedback / reviews (roadmap D8): shapes + limits. Table public.feedback_responses, SQL functions in
 * supabase/migrations/20261116001000_feedback_profile.sql (keep FEEDBACK_LIMITS in sync with it).
 *
 *   FeedbackResponse (owner view, one row)
 *     { id, jobId: string | null, clientId: string | null, jobName: string | null, clientFirstName: string | null,
 *       token, status: 'requested' | 'submitted', requestedAt, submittedAt: string | null,
 *       rating: 1..5 | null, comment: string | null, clientName: string | null,
 *       testimonial: boolean, testimonialName: string | null, testimonialText: string | null,
 *       ownerNote: string | null, hidden: boolean, createdAt, updatedAt }
 *   FeedbackOwnerPatch   the ONLY fields the owner can change: { testimonial?, testimonialName?, testimonialText?,
 *                        ownerNote?, hidden? }  (the database ignores anything else)
 *   PublicFeedbackRequest (what /feedback/<token> shows; never ids, email, phone or notes)
 *     { status, submitted, rating: number | null, submittedAt: string | null, jobName: string | null,
 *       clientFirstName: string | null, contractor: { name, companyName, logoUrl } }
 *   FeedbackSubmitResult  { ok: true, rating: number, reviewUrl: string | null }   (reviewUrl for every rating when a review link is set)
 *   Testimonial (public page model) { rating, name, text: string | null, date: 'YYYY-MM-DD' }
 *   RatingSummary        { average: number | null (1 decimal), count, byStar: { 1..5: count } }
 */

export type FeedbackStatus = 'requested' | 'submitted';

export const FEEDBACK_LIMITS = {
    perAccount: 5000,
    perDay: 200,
    comment: 2000,
    clientName: 80,
    testimonialName: 60,
    testimonialText: 600,
    ownerNote: 2000,
    jobName: 160,
} as const;

/** Every client who sends feedback is offered the SAME Google review link, whatever the stars: showing it only to
 *  happy clients is "review gating", which Google's policies forbid. (1 = every valid rating.) */
export const REVIEW_NUDGE_MIN_RATING = 1;

export interface FeedbackResponse {
    id: string;
    jobId: string | null;
    clientId: string | null;
    jobName: string | null;
    clientFirstName: string | null;
    token: string;
    status: FeedbackStatus;
    requestedAt: string;
    submittedAt: string | null;
    rating: number | null;
    comment: string | null;
    clientName: string | null;
    testimonial: boolean;
    testimonialName: string | null;
    testimonialText: string | null;
    ownerNote: string | null;
    hidden: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface FeedbackOwnerPatch {
    testimonial?: boolean;
    testimonialName?: string | null;
    testimonialText?: string | null;
    ownerNote?: string | null;
    hidden?: boolean;
}

export interface FeedbackRequestInput {
    jobId?: string | null;
    clientId?: string | null;
    /** only used when there is no job (the database copies the job's name otherwise) */
    jobName?: string | null;
}

export interface PublicFeedbackRequest {
    status: FeedbackStatus;
    submitted: boolean;
    rating: number | null;
    submittedAt: string | null;
    jobName: string | null;
    clientFirstName: string | null;
    contractor: { name: string; companyName: string; logoUrl: string };
}

export interface FeedbackSubmitInput {
    rating: number;
    comment?: string | null;
    name?: string | null;
}

export interface FeedbackSubmitResult {
    ok: true;
    rating: number;
    reviewUrl: string | null;
}

export interface Testimonial {
    rating: number;
    name: string;
    text: string | null;
    date: string;
}

export interface RatingSummary {
    average: number | null;
    count: number;
    byStar: Record<1 | 2 | 3 | 4 | 5, number>;
}

/** Public calls (never throw). 'already' = this link was answered before; 'invalid' = bad / unknown link. */
export type FeedbackPublicResult<T> =
    | { status: 'ready'; data: T }
    | { status: 'missing' }
    | { status: 'invalid' }
    | { status: 'already' }
    | { status: 'error'; message: string };
