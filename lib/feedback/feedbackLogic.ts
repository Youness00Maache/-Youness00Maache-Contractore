/**
 * Client feedback / reviews (roadmap D8): pure logic (no React, no Supabase). Shapes: ./feedbackTypes.ts.
 * Tested by scripts/feedback-check.ts. The server rules live in supabase/migrations/20261116001000_feedback_profile.sql.
 *
 *   FEEDBACK_COLUMNS                         select list of the owner's reads
 *   mapFeedbackRow(row)                      -> FeedbackResponse
 *   feedbackInsertRow(input, userId)         -> insert row (job / client / job name only; the rest is the database's)
 *   feedbackPatchRow(patch)                  -> update row with ONLY the owner's columns (trimmed, capped)
 *   clampRating(v)                           -> 1..5 | null
 *   shouldNudgeReview(rating)                -> any valid rating (no review gating)
 *   reviewNudgeUrl(rating, url)              -> the https review link for 4-5 stars, else null
 *   validateFeedbackInput(input)             -> { ok, errors: { rating?, comment?, name? }, value }
 *   displayNameFromClientName(name)          -> 'Jane S.' | 'Jane' | null  (mirror of SQL _feedback_display_name)
 *   testimonialNameError(name)               -> message | null (no email / phone, 60 chars)
 *   isExcerptOf(text, comment)               -> the owner's quote is a part of the client's comment
 *   testimonialTextError(text, comment)      -> message | null
 *   canBeTestimonial(r)                      -> submitted with a rating
 *   testimonialFromResponse(r)               -> Testimonial | null (approved, not hidden, submitted)
 *   approvedTestimonials(rows)               -> Testimonial[] newest first
 *   averageRating(ratings) / ratingSummary(ratings)
 *   starsText(rating)                        -> '★★★★☆'
 *   openRequestForJob(rows, jobId)           -> the unanswered request of that job (reuse instead of a new link)
 *   parsePublicFeedbackRequest(raw) / parseFeedbackSubmitResult(raw) / parseTestimonial(raw)
 */
import {
    FEEDBACK_LIMITS, REVIEW_NUDGE_MIN_RATING,
    type FeedbackOwnerPatch, type FeedbackRequestInput, type FeedbackResponse, type FeedbackSubmitInput,
    type FeedbackSubmitResult, type PublicFeedbackRequest, type RatingSummary, type Testimonial,
} from './feedbackTypes.ts';

export const FEEDBACK_COLUMNS =
    'id, job_id, client_id, job_name, client_first_name, token, status, requested_at, submitted_at, rating, comment, client_name, testimonial, testimonial_name, testimonial_text, owner_note, hidden, created_at, updated_at';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
/** one line: control characters to spaces, trimmed, capped; '' -> null */
export const cleanLine = (v: unknown, max: number): string | null => {
    const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max).trim();
    return s || null;
};
/** several lines: \r\n -> \n, other control characters to spaces, at most 2 blank lines in a row, capped; '' -> null */
export const cleanMultiline = (v: unknown, max: number): string | null => {
    const s = String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n').slice(0, max).trim();
    return s || null;
};

export const clampRating = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return null;
    const r = Math.round(n);
    return r >= 1 && r <= 5 ? r : null;
};

export const mapFeedbackRow = (row: Record<string, unknown>): FeedbackResponse => ({
    id: String(row.id ?? ''),
    jobId: str(row.job_id),
    clientId: str(row.client_id),
    jobName: str(row.job_name),
    clientFirstName: str(row.client_first_name),
    token: String(row.token ?? ''),
    status: row.status === 'submitted' ? 'submitted' : 'requested',
    requestedAt: String(row.requested_at ?? row.created_at ?? ''),
    submittedAt: str(row.submitted_at),
    rating: clampRating(row.rating),
    comment: str(row.comment),
    clientName: str(row.client_name),
    testimonial: row.testimonial === true,
    testimonialName: str(row.testimonial_name),
    testimonialText: str(row.testimonial_text),
    ownerNote: str(row.owner_note),
    hidden: row.hidden === true,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? ''),
});

export const feedbackInsertRow = (input: FeedbackRequestInput, userId: string): Record<string, unknown> => ({
    user_id: userId,
    job_id: input.jobId || null,
    client_id: input.clientId || null,
    job_name: input.jobId ? null : cleanLine(input.jobName, FEEDBACK_LIMITS.jobName),
});

export const feedbackPatchRow = (patch: FeedbackOwnerPatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (patch.testimonial !== undefined) row.testimonial = !!patch.testimonial;
    if (patch.testimonialName !== undefined) row.testimonial_name = cleanLine(patch.testimonialName, FEEDBACK_LIMITS.testimonialName);
    if (patch.testimonialText !== undefined) row.testimonial_text = cleanMultiline(patch.testimonialText, FEEDBACK_LIMITS.testimonialText);
    if (patch.ownerNote !== undefined) row.owner_note = cleanMultiline(patch.ownerNote, FEEDBACK_LIMITS.ownerNote);
    if (patch.hidden !== undefined) row.hidden = !!patch.hidden;
    return row;
};

export const shouldNudgeReview = (rating: number | null | undefined): boolean =>
    typeof rating === 'number' && rating >= REVIEW_NUDGE_MIN_RATING && rating <= 5;

export const safeHttpsUrl = (url: unknown): string | null => {
    const s = typeof url === 'string' ? url.trim() : '';
    return /^https:\/\/[^\s]+$/i.test(s) ? s : null;
};

export const reviewNudgeUrl = (rating: number | null | undefined, url: unknown): string | null =>
    shouldNudgeReview(rating) ? safeHttpsUrl(url) : null;

export const validateFeedbackInput = (input: FeedbackSubmitInput): {
    ok: boolean;
    errors: { rating?: string; comment?: string; name?: string };
    value: { rating: number | null; comment: string | null; name: string | null };
} => {
    const errors: { rating?: string; comment?: string; name?: string } = {};
    const rating = clampRating(input.rating);
    if (rating === null || rating !== input.rating) errors.rating = 'Please choose 1 to 5 stars.';
    const rawComment = String(input.comment ?? '');
    if (rawComment.length > FEEDBACK_LIMITS.comment) errors.comment = `Please keep it under ${FEEDBACK_LIMITS.comment} characters.`;
    const rawName = String(input.name ?? '');
    if (rawName.trim().length > FEEDBACK_LIMITS.clientName) errors.name = `Please keep your name under ${FEEDBACK_LIMITS.clientName} characters.`;
    return {
        ok: Object.keys(errors).length === 0,
        errors,
        value: {
            rating,
            comment: cleanMultiline(rawComment, FEEDBACK_LIMITS.comment),
            name: cleanLine(rawName, FEEDBACK_LIMITS.clientName),
        },
    };
};

/** Mirror of SQL public._feedback_display_name: first name + last initial, never an email, no digits / symbols. */
export const displayNameFromClientName = (name: string | null | undefined): string | null => {
    const raw = String(name ?? '');
    if (raw.includes('@')) return null;
    const parts = raw.replace(/[^\p{L}\s'-]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0].slice(0, 30);
    if (parts.length === 1) return first;
    return `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
};

export const testimonialNameError = (name: string | null | undefined): string | null => {
    const s = String(name ?? '').trim();
    if (!s) return null;
    if (s.length > FEEDBACK_LIMITS.testimonialName) return `Please keep the name under ${FEEDBACK_LIMITS.testimonialName} characters.`;
    if (s.includes('@') || s.replace(/\D/g, '').length >= 5) return 'The name shown with a testimonial cannot be an email address or a phone number.';
    return null;
};

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

export const isExcerptOf = (text: string | null | undefined, comment: string | null | undefined): boolean => {
    const t = norm(String(text ?? ''));
    if (!t) return true;
    return norm(String(comment ?? '')).includes(t);
};

export const testimonialTextError = (text: string | null | undefined, comment: string | null | undefined): string | null => {
    const s = String(text ?? '').trim();
    if (!s) return null;
    if (s.length > FEEDBACK_LIMITS.testimonialText) return `Please keep the quote under ${FEEDBACK_LIMITS.testimonialText} characters.`;
    return isExcerptOf(s, comment) ? null : 'The quote must be a part of what the client wrote.';
};

export const canBeTestimonial = (r: Pick<FeedbackResponse, 'status' | 'rating'>): boolean => r.status === 'submitted' && r.rating !== null;

const ymd = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

/** What the public page shows for one response (same rules as get_public_profile_extras), or null. */
export const testimonialFromResponse = (r: FeedbackResponse): Testimonial | null => {
    if (!r.testimonial || r.hidden || !canBeTestimonial(r)) return null;
    return {
        rating: r.rating as number,
        name: r.testimonialName || displayNameFromClientName(r.clientName) || displayNameFromClientName(r.clientFirstName) || 'A client',
        text: r.testimonialText || r.comment || null,
        date: ymd(r.submittedAt),
    };
};

export const approvedTestimonials = (rows: FeedbackResponse[], limit = 20): Testimonial[] =>
    [...rows]
        .filter(r => testimonialFromResponse(r) !== null)
        .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
        .slice(0, limit)
        .map(r => testimonialFromResponse(r) as Testimonial);

/** Average of valid 1-5 ratings, 1 decimal (Postgres round: half away from zero); null when none. */
export const averageRating = (ratings: Array<number | null | undefined>): number | null => {
    const ok = ratings.map(clampRating).filter((r): r is number => r !== null);
    if (!ok.length) return null;
    const avg = ok.reduce((s, r) => s + r, 0) / ok.length;
    return Math.round(avg * 10 + 1e-9) / 10;
};

export const ratingSummary = (ratings: Array<number | null | undefined>): RatingSummary => {
    const byStar: RatingSummary['byStar'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let count = 0;
    for (const r of ratings.map(clampRating)) {
        if (r === null) continue;
        byStar[r as 1 | 2 | 3 | 4 | 5]++;
        count++;
    }
    return { average: averageRating(ratings), count, byStar };
};

export const starsText = (rating: number | null | undefined): string => {
    const r = clampRating(rating) ?? 0;
    return '★'.repeat(r) + '☆'.repeat(5 - r);
};

export const openRequestForJob = (rows: FeedbackResponse[], jobId: string): FeedbackResponse | null =>
    rows.filter(r => r.jobId === jobId && r.status === 'requested')
        .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))[0] || null;

// ------------------------------------------------------------------------------------------- public parsers
const obj = (raw: unknown): Record<string, unknown> | null => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
    }
    return null;
};

export const parsePublicFeedbackRequest = (raw: unknown): PublicFeedbackRequest | null => {
    const r = obj(raw);
    if (!r) return null;
    const c = obj(r.contractor) || {};
    const submitted = r.status === 'submitted' || r.submitted === true;
    return {
        status: submitted ? 'submitted' : 'requested',
        submitted,
        rating: submitted ? clampRating(r.rating) : null,
        submittedAt: str(r.submitted_at),
        jobName: str(r.job_name),
        clientFirstName: str(r.client_first_name),
        contractor: {
            name: String(c.name ?? ''),
            companyName: String(c.company_name ?? ''),
            logoUrl: String(c.logo_url ?? ''),
        },
    };
};

export const parseFeedbackSubmitResult = (raw: unknown): FeedbackSubmitResult | null => {
    const r = obj(raw);
    const rating = clampRating(r?.rating);
    if (!r || r.ok !== true || rating === null) return null;
    return { ok: true, rating, reviewUrl: reviewNudgeUrl(rating, r.review_url) };
};

export const parseTestimonial = (raw: unknown): Testimonial | null => {
    const r = obj(raw);
    const rating = clampRating(r?.rating);
    if (!r || rating === null) return null;
    return {
        rating,
        name: cleanLine(r.name, FEEDBACK_LIMITS.testimonialName) || 'A client',
        text: str(r.text),
        date: typeof r.date === 'string' ? r.date.slice(0, 10) : '',
    };
};
