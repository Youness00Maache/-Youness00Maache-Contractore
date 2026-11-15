/**
 * Job timeline: the "Conversation note" quick-add, pure part. A short note typed or dictated on the Timeline ("Client
 * called, wants the tile in grey") becomes a Note document on the job (the same document the Note form makes, tagged
 * Conversation, with `noteAt` = the minute it was written so an offline note keeps its time), and optionally ONE
 * follow-up task. The saving itself is lib/timeline/noteSave.ts (it reuses lib/noteDocuments.ts and the offline outbox:
 * no new write path). Tested by scripts/timeline-check.ts.
 */
import { esc } from '../../utils/escapeHtml.ts';
import type { TaskDraft } from '../tasks/taskTypes.ts';
import { TASK_LIMITS } from '../tasks/taskTypes.ts';
import { nextSortOrder } from '../tasks/taskLogic.ts';
import { CONVERSATION_TAG } from './sources/notes.ts';
import type { TimelineDoc } from './timelineTypes.ts';

export const CONVERSATION_NOTE_MAX = 2000;

/** null = fine; else the sentence to show. */
export const noteTextProblem = (text: string): string | null => {
    const t = String(text ?? '').trim();
    if (!t) return 'Write or say what was discussed first.';
    if (t.length > CONVERSATION_NOTE_MAX) return `That is a long note. Keep it under ${CONVERSATION_NOTE_MAX.toLocaleString('en-US')} characters, or make a Note document for it.`;
    return null;
};

/** The first line of the note, cut at a word: the document's title. */
export const conversationNoteTitle = (text: string, max = 80): string => {
    const first = String(text ?? '').trim().split(/\r?\n/)[0].replace(/\s+/g, ' ').trim();
    if (first.length <= max) return first;
    const cut = first.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/** The body as simple rich text: escaped, one paragraph per line break. */
export const conversationNoteHtml = (text: string): string =>
    String(text ?? '').trim().split(/\r?\n+/).map(line => line.trim()).filter(Boolean).map(line => `<p>${esc(line)}</p>`).join('');

export interface ConversationNote {
    title: string;
    content: string;
    tags: string[];
    /** extra keys kept on the document data */
    extra: { conversationNote: true; noteAt: string };
}

/** The Note document content for a typed note; null when there is nothing to save. */
export const buildConversationNote = (text: string, now: Date = new Date()): ConversationNote | null => {
    if (noteTextProblem(text) !== null) return null;
    return {
        title: conversationNoteTitle(text), content: conversationNoteHtml(text), tags: [CONVERSATION_TAG],
        extra: { conversationNote: true, noteAt: now.toISOString() },
    };
};

/** The saved note as the timeline reads documents (so it shows at once, before any reload). */
export const conversationNoteDoc = (args: { id: string; jobId: string; note: ConversationNote; createdAt?: string; pending?: boolean }): TimelineDoc => ({
    id: args.id, jobId: args.jobId, type: 'Note', createdAt: args.createdAt || args.note.extra.noteAt, pending: args.pending,
    data: { title: args.note.title, content: args.note.content, tags: args.note.tags, ...args.note.extra },
});

/** The one follow-up task of "Also make a follow-up task": its title is the start of the note, the note is its notes. */
export const followUpTaskDraft = (text: string, existing: ReadonlyArray<{ sortOrder: number }> = []): TaskDraft => {
    const title = `Follow up: ${conversationNoteTitle(text, 120)}`.slice(0, TASK_LIMITS.title);
    return { title, notes: String(text ?? '').trim().slice(0, TASK_LIMITS.notes), source: 'manual', sortOrder: nextSortOrder(existing) };
};
