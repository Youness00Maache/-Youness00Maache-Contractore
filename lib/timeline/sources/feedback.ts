/**
 * Timeline source: client feedback (lib/feedback): the request you sent, and the stars and comment that came back.
 * Client group. Pure.
 */
import type { FeedbackResponse } from '../../feedback/feedbackTypes.ts';
import { clientWord, firstName, isoOf, makeEvent, plainText, safely } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineEvent } from '../timelineTypes.ts';

export const feedbackEvents = ({ responses }: { responses: readonly FeedbackResponse[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    for (const r of responses) {
        const who = firstName(r.clientFirstName) || firstName(r.clientName) || clientWord(null, ctx);
        const asked = isoOf(r.requestedAt) || isoOf(r.createdAt);
        if (asked) out.push(makeEvent({ id: `feedback:${r.id}:requested`, at: asked, kind: 'feedback_requested', source: 'feedback', title: `Asked ${who} for feedback`, actor: 'you' }));
        const answered = isoOf(r.submittedAt);
        if (answered && r.status === 'submitted') {
            const stars = r.rating && r.rating >= 1 ? `${r.rating} ${r.rating === 1 ? 'star' : 'stars'}` : '';
            out.push(makeEvent({ id: `feedback:${r.id}:received`, at: answered, kind: 'feedback_received', source: 'feedback', title: `${who} left feedback${stars ? `: ${stars}` : ''}`, detail: plainText(r.comment, 160) ? `“${plainText(r.comment, 160)}”` : undefined, actor: 'client' }));
        }
    }
    return out;
});
