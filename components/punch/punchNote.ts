/** "Save as Note on the job": the punch list as a Note document (no photos, so the document stays small). */
import type { Job, UserProfile } from '../../types.ts';
import { PUNCH_NOTE_TAG, buildPunchListHtml, type PunchItem } from '../../lib/punchList.ts';
import { saveJobNote, type SavedNote } from '../../lib/noteDocuments.ts';

export const savePunchNote = (input: {
    userId: string;
    job: Job & { clientId?: string | null };
    profile: UserProfile | null;
    items: readonly PunchItem[];
    today: string;
}): Promise<SavedNote> => saveJobNote({
    userId: input.userId,
    job: input.job,
    profile: input.profile,
    today: input.today,
    title: `Punch list · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    content: buildPunchListHtml({ items: input.items, today: input.today }),
    tags: [PUNCH_NOTE_TAG],
});
