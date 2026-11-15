/**
 * Timeline source: emails sent from the app. RESERVED for roadmap D11: the `gmail` edge function will write one row per
 * email to a table `email_log` (owner-only RLS) and the Timeline will read it here. Nothing reads it yet, so this slot
 * returns nothing. When D11 ships: load the rows for the job in lib/timeline/timelineApi.ts (add `email` to
 * TimelineData), give them to this adapter, and return one `email_sent` event per row ("Estimate E-1042 emailed to
 * jane@example.com"), group 'client' (already the default for this source), actor 'you', linked to the document.
 */
import type { TimelineContext, TimelineEvent } from '../timelineTypes.ts';

/** The columns the Timeline will need from `email_log`. */
export interface EmailLogRow {
    id: string;
    document_id?: string | null;
    to_email?: string | null;
    subject?: string | null;
    sent_at?: string | null;
}

export const emailEvents = (_data: { rows?: readonly EmailLogRow[] }, _ctx: TimelineContext): TimelineEvent[] => [];
