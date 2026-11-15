/**
 * Timeline source: notes (Note documents, including the "conversation notes" typed or dictated on the Timeline). A note
 * keeps its own time: `data.noteAt` (set by the Timeline quick-add, so a note written offline keeps the minute it was
 * written), else the moment the document was created. Pure.
 */
import { isoOf, makeEvent, plainText, safely, str } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent } from '../timelineTypes.ts';

/** the tag the Timeline quick-add puts on its notes */
export const CONVERSATION_TAG = 'Conversation';

export const isConversationNote = (doc: Pick<TimelineDoc, 'data'>): boolean =>
    doc.data?.conversationNote === true || doc.data?.conversationNote === 'true'
    || (Array.isArray(doc.data?.tags) && doc.data.tags.some((t: unknown) => str(t).toLowerCase() === CONVERSATION_TAG.toLowerCase()));

export const noteEvents = ({ docs }: { docs: readonly TimelineDoc[] }, _ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    for (const doc of docs) {
        if (doc.type !== 'Note') continue;
        const at = isoOf(doc.data?.noteAt) || isoOf(doc.createdAt);
        if (!at) continue;
        const full = plainText(doc.data?.content, 1200);
        const heading = plainText(doc.data?.title, 90);
        const conversation = isConversationNote(doc);
        // named by its title (a conversation note's title is its first line); the whole text opens under it
        const excerpt = plainText(heading || full, 90);
        out.push(makeEvent({
            id: `note:${doc.id}`, at, kind: 'note', source: 'notes', actor: 'you',
            title: `${conversation ? 'Conversation' : 'Note'}${excerpt ? `: ${excerpt}` : ' added'}`,
            body: full && full !== excerpt ? full : undefined,
            link: { type: 'document', docId: doc.id, formType: 'Note' }, pending: doc.pending ? true : undefined,
        }));
    }
    return out;
});
