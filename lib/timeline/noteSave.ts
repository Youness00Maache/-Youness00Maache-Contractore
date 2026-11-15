/**
 * Job timeline: saves a "Conversation note". NO new write path:
 *   online   lib/noteDocuments.ts saveJobNote (the same insert the punch list and the lien waiver use; audited there)
 *   offline  the offline outbox, exactly like a Note saved from the Note form (App.tsx saveFormToOutbox): the document
 *            waits on this device with a "Waiting to sync" chip and is sent when the connection is back. `noteAt` keeps
 *            the minute it was written.
 * The optional follow-up task goes through lib/tasks/tasksApi.ts createTask (needs a connection).
 */
import type { Job, UserProfile } from '../../types.ts';
import { buildJobNoteData, saveJobNote } from '../noteDocuments.ts';
import { NEEDS_CONNECTION } from '../offline/connection.ts';
import type { QueueInput } from '../offline/outboxModel.ts';
import { createTask } from '../tasks/tasksApi.ts';
import type { JobTask } from '../tasks/taskTypes.ts';
import { buildConversationNote, conversationNoteDoc, followUpTaskDraft, noteTextProblem } from './noteInput.ts';
import { dayOf } from './timelineHelpers.ts';
import type { TimelineDoc } from './timelineTypes.ts';

export interface SaveConversationNoteInput {
    userId: string;
    job: Job & { clientId?: string | null };
    profile?: UserProfile | null;
    text: string;
    tz: string;
    /** the offline outbox's `queue` (App passes outbox.queue); without it a note can't wait offline */
    queue?: (input: QueueInput) => Promise<unknown>;
    /** the job itself is still waiting to sync: the note waits with it */
    jobWaiting?: boolean;
    now?: Date;
}

export interface SavedConversationNote {
    doc: TimelineDoc;
    /** saved on this device, not on the account yet */
    waiting: boolean;
}

export async function saveConversationNote(input: SaveConversationNoteInput): Promise<SavedConversationNote> {
    const problem = noteTextProblem(input.text);
    if (problem) throw new Error(problem);
    const now = input.now || new Date();
    const note = buildConversationNote(input.text, now)!;
    const today = dayOf(now.toISOString(), input.tz) || now.toISOString().slice(0, 10);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const noteInput = { job: input.job, profile: input.profile, title: note.title, content: note.content, tags: note.tags, today, extra: note.extra };

    if (!offline && !input.jobWaiting) {
        const saved = await saveJobNote({ ...noteInput, userId: input.userId });
        return { doc: conversationNoteDoc({ id: saved.id, jobId: input.job.id, note, createdAt: saved.form.createdAt }), waiting: false };
    }
    if (!input.queue) throw new Error(NEEDS_CONNECTION);
    const built = buildJobNoteData(noteInput);
    const docId = crypto.randomUUID();
    await input.queue({ userId: input.userId, docId, jobId: input.job.id, type: built.formType, kind: 'create', data: built.data, clientId: input.job.clientId ?? null });
    return { doc: conversationNoteDoc({ id: docId, jobId: input.job.id, note, pending: true }), waiting: true };
}

/** The one follow-up task ("Also make a follow-up task"). Needs a connection. */
export async function saveFollowUpTask(input: { userId: string; jobId: string; text: string; tasks?: ReadonlyArray<{ sortOrder: number }> }): Promise<JobTask> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(NEEDS_CONNECTION);
    return createTask(input.userId, input.jobId, followUpTaskDraft(input.text, input.tasks || []));
}
