/**
 * Client feedback (roadmap D8, phase B): the pure rules behind the screens (no React, no Supabase), so they can be
 * tested without a browser (scripts/feedback-check.ts). Data layer: ./feedbackApi.ts, ./feedbackLogic.ts.
 *
 * CLIENT PAGE (/feedback/<token>)
 *   nextStarValue(current, key)        star picker keyboard: arrows / Home / End / 1-5 -> the new rating, null = key not used
 *   shownStars(selected, hover)        how many stars look filled (the hover preview wins)
 *   tabbableStar(selected)             roving tabindex: the chosen star, else the first
 *   afterSend(rating, reviewUrl)       what the thank-you shows: google (4-5 stars + a safe https link) | thanks (4-5, no link)
 *                                      | sorry (1-3: "we'll make it right", never a Google prompt)
 * OWNER
 *   testimonialDraftFor(r)             name (first name + initial) and quote (the client's words, trimmed) to start from
 *   suggestedQuote(comment)            the comment, or its first sentences up to the 600-character limit (no "…" added:
 *                                      the quote must stay a part of the client's words)
 *   validateTestimonialDraft(d, r)     { ok, nameError, textError }
 *   testimonialPatch(d)                { name, text } for setTestimonial (empty -> null)
 *   filterFeedback(rows, filter)       all | answered | waiting | page
 *   feedbackStats(rows)                answered / waiting / onPage / hidden counts, overall + on-page average
 *   feedbackHeadline(stats)            "4.8 from 12 · 2 waiting · 3 on your page"
 *   jobFeedbackLabel(rows, jobId)      the job page button: "Ask for feedback" | "Feedback: waiting" | "Feedback: 4.5 of 5" (+ a short phone form)
 *   feedbackRequestMessage(o)          subject + email body + text message with the link
 *   feedbackLinkMessage(o)             the same message as one line for "Copy link"
 */
import {
    FEEDBACK_LIMITS, REVIEW_NUDGE_MIN_RATING, type FeedbackResponse,
} from './feedbackTypes.ts';
import {
    averageRating, cleanLine, displayNameFromClientName, openRequestForJob, safeHttpsUrl, shouldNudgeReview, testimonialFromResponse,
    testimonialNameError, testimonialTextError,
} from './feedbackLogic.ts';

// ------------------------------------------------------------------------------------------------- star picker
export const STAR_VALUES: ReadonlyArray<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

/** Radio-group keys of the star picker. Returns the new rating, or null when the key does nothing. */
export const nextStarValue = (current: number | null | undefined, key: string): number | null => {
    const cur = typeof current === 'number' && current >= 1 && current <= 5 ? current : null;
    switch (key) {
        case 'ArrowRight':
        case 'ArrowUp': return cur === null ? 1 : Math.min(5, cur + 1);
        case 'ArrowLeft':
        case 'ArrowDown': return cur === null ? 1 : Math.max(1, cur - 1);
        case 'Home': return 1;
        case 'End': return 5;
        case '1': case '2': case '3': case '4': case '5': return Number(key);
        default: return null;
    }
};

export const shownStars = (selected: number | null | undefined, hover: number | null | undefined): number => {
    const h = typeof hover === 'number' && hover >= 1 && hover <= 5 ? hover : null;
    const s = typeof selected === 'number' && selected >= 1 && selected <= 5 ? selected : 0;
    return h ?? s;
};

export const tabbableStar = (selected: number | null | undefined): number =>
    typeof selected === 'number' && selected >= 1 && selected <= 5 ? selected : 1;

export type AfterSend =
    | { kind: 'google'; url: string }
    | { kind: 'thanks' }
    | { kind: 'sorry' };

/** 4-5 stars with a usable https review link: offer Google. 4-5 without a link: only thanks. 1-3: a gentle "we'll make it right". */
export const afterSend = (rating: number, reviewUrl: string | null | undefined): AfterSend => {
    if (rating < REVIEW_NUDGE_MIN_RATING) return { kind: 'sorry' };
    const url = shouldNudgeReview(rating) ? safeHttpsUrl(reviewUrl) : null;
    return url ? { kind: 'google', url } : { kind: 'thanks' };
};

// ------------------------------------------------------------------------------------------------- testimonials
export interface TestimonialDraft {
    /** the name shown with the quote; '' = the database default (first name + initial, else "A client") */
    name: string;
    /** the quote; '' = no words, only the stars and the name */
    text: string;
}

/** The client's comment, or its beginning cut at a sentence (else a word) so it fits the quote limit. */
export const suggestedQuote = (comment: string | null | undefined): string => {
    const c = String(comment ?? '').replace(/\r\n?/g, '\n').trim();
    const max = FEEDBACK_LIMITS.testimonialText;
    if (c.length <= max) return c;
    const cut = c.slice(0, max);
    const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('.\n'));
    if (sentence > max * 0.4) return cut.slice(0, sentence + 1).trim();
    const space = cut.lastIndexOf(' ');
    return (space > max * 0.4 ? cut.slice(0, space) : cut).trim();
};

export const defaultTestimonialName = (r: Pick<FeedbackResponse, 'clientName' | 'clientFirstName'>): string =>
    displayNameFromClientName(r.clientName) || displayNameFromClientName(r.clientFirstName) || '';

export const testimonialDraftFor = (r: FeedbackResponse): TestimonialDraft => ({
    name: r.testimonialName || defaultTestimonialName(r),
    text: r.testimonialText ?? suggestedQuote(r.comment),
});

export const validateTestimonialDraft = (
    d: TestimonialDraft, r: Pick<FeedbackResponse, 'comment'>,
): { ok: boolean; nameError: string | null; textError: string | null } => {
    const nameError = testimonialNameError(d.name);
    const textError = testimonialTextError(d.text, r.comment);
    return { ok: !nameError && !textError, nameError, textError };
};

export const testimonialPatch = (d: TestimonialDraft): { name: string | null; text: string | null } => ({
    name: cleanLine(d.name, FEEDBACK_LIMITS.testimonialName),
    text: d.text.trim() ? d.text.trim() : null,
});

/** What the public page will show for this response right now (null = not on the page). */
export const publicLookFor = (r: FeedbackResponse): { name: string; text: string | null; rating: number } | null => {
    const t = testimonialFromResponse(r);
    return t ? { name: t.name, text: t.text, rating: t.rating } : null;
};

// ------------------------------------------------------------------------------------------------- lists
export type FeedbackFilter = 'all' | 'answered' | 'waiting' | 'page';

export const filterFeedback = (rows: FeedbackResponse[], filter: FeedbackFilter): FeedbackResponse[] => {
    switch (filter) {
        case 'answered': return rows.filter(r => r.status === 'submitted');
        case 'waiting': return rows.filter(r => r.status === 'requested');
        case 'page': return rows.filter(r => testimonialFromResponse(r) !== null);
        default: return rows;
    }
};

export interface FeedbackStats {
    answered: number;
    waiting: number;
    onPage: number;
    hidden: number;
    /** average of every answered response (1 decimal), what the owner sees */
    average: number | null;
    /** average of the ones on the public page (what clients see) */
    pageAverage: number | null;
    byStar: Record<1 | 2 | 3 | 4 | 5, number>;
}

export const feedbackStats = (rows: FeedbackResponse[]): FeedbackStats => {
    const answered = rows.filter(r => r.status === 'submitted' && r.rating !== null);
    const onPage = rows.filter(r => testimonialFromResponse(r) !== null);
    const byStar: FeedbackStats['byStar'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of answered) byStar[r.rating as 1 | 2 | 3 | 4 | 5]++;
    return {
        answered: answered.length,
        waiting: rows.filter(r => r.status === 'requested').length,
        onPage: onPage.length,
        hidden: rows.filter(r => r.hidden).length,
        average: averageRating(answered.map(r => r.rating)),
        pageAverage: averageRating(onPage.map(r => r.rating)),
        byStar,
    };
};

export const feedbackHeadline = (s: FeedbackStats): string => {
    const parts: string[] = [];
    if (s.average !== null) parts.push(`${s.average.toFixed(1)} from ${s.answered}`);
    if (s.waiting) parts.push(`${s.waiting} waiting`);
    if (s.onPage) parts.push(`${s.onPage} on your page`);
    return parts.join(' · ') || 'No feedback yet';
};

/** Share of answered responses for one star level, 0-100 (the bars of the summary). */
export const starShare = (s: FeedbackStats, star: 1 | 2 | 3 | 4 | 5): number =>
    s.answered ? Math.round((s.byStar[star] / s.answered) * 100) : 0;

export const ratingAria = (rating: number | null | undefined): string =>
    rating ? `${rating} out of 5 stars` : 'Not rated yet';

/** Text of the "Ask for feedback" button on a job page, from that job's responses. */
export const jobFeedbackLabel = (rows: FeedbackResponse[], jobId: string): { long: string; short: string } => {
    const mine = rows.filter(r => r.jobId === jobId);
    const open = openRequestForJob(mine, jobId);
    const avg = averageRating(mine.filter(r => r.status === 'submitted').map(r => r.rating));
    if (open) return { long: 'Feedback: waiting', short: 'Feedback…' };
    if (avg !== null) return { long: `Feedback: ${avg.toFixed(1)} of 5`, short: `Feedback ${avg.toFixed(1)}` };
    return { long: 'Ask for feedback', short: 'Feedback' };
};

// ------------------------------------------------------------------------------------------------- the message to the client
const firstWord = (v: unknown): string => String(v ?? '').trim().split(/\s+/)[0] || '';

export interface FeedbackMessage {
    subject: string;
    /** email body (plain text) */
    body: string;
    /** short version for a text / WhatsApp */
    text: string;
}

/** The same friendly message for every client; no mention of reviews or stars in the email itself. */
export const feedbackRequestMessage = (o: {
    clientName?: string; company?: string; senderName?: string; jobName?: string; link: string;
}): FeedbackMessage => {
    const first = firstWord(o.clientName);
    const company = String(o.company || '').trim() || String(o.senderName || '').trim() || 'us';
    const job = String(o.jobName || '').trim();
    const sender = String(o.senderName || '').trim();
    const sign = [sender, String(o.company || '').trim() && String(o.company || '').trim() !== sender ? String(o.company || '').trim() : ''].filter(Boolean).join('\n');
    const link = String(o.link || '').trim();
    const about = job ? `the ${job} job` : 'the job';
    return {
        subject: job ? `How did we do on ${job}?` : `How did we do? ${company}`,
        body: `Hi${first ? ` ${first}` : ''},\n\nThank you for choosing ${company}. We would like to hear how ${about} went. It takes under a minute, and it helps us do better:\n${link}\n\nThank you,${sign ? `\n${sign}` : ''}`,
        text: `Hi${first ? ` ${first}` : ''}, thank you for choosing ${company}! How did ${about} go? It takes under a minute: ${link}`,
    };
};

/** One line for "Copy link": the greeting and the link, ready to paste into any app. */
export const feedbackLinkMessage = (o: { clientName?: string; company?: string; link: string }): string => {
    const first = firstWord(o.clientName);
    const company = String(o.company || '').trim();
    return `Hi${first ? ` ${first}` : ''}, how did we do${company ? ` at ${company}` : ''}? It takes under a minute: ${String(o.link || '').trim()}`;
};

export const FEEDBACK_PREMIUM_REASON = 'Asking clients for feedback is part of Premium.';
