/**
 * Timeline source: emails sent from the app through the owner's Gmail (roadmap D11, table `email_log`, written by the
 * `gmail` edge function; owner-only RLS). One `email_sent` event per row: "Emailed estimate E-1042 to jane@example.com"
 * or "Email to jane@example.com failed". Client group, done by you, linked to the document when the row names one.
 * Reminder emails are not here (they come from the `reminders` source). Rows are only loaded when the table exists
 * (lib/emailLog/emailLogFeature.ts), so without it this source returns nothing and the timeline is unchanged. Pure.
 */
import type { EmailLogEntry } from '../../emailLog/types.ts';
import { emailLogDetail, emailLogSentence } from '../../emailLog/format.ts';
import { docLabel, isoOf, makeEvent, safely } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent } from '../timelineTypes.ts';

/** The columns the Timeline needs from `email_log`. */
export type EmailLogRow = EmailLogEntry;

export const emailEvents = (
    { rows = [], docs = [] }: { rows?: readonly EmailLogRow[]; docs?: readonly TimelineDoc[] },
    _ctx: TimelineContext,
): TimelineEvent[] => safely(() => {
    const byId = new Map(docs.map(d => [d.id, d]));
    const out: TimelineEvent[] = [];
    for (const r of rows) {
        if (!r || !r.id) continue;
        const at = isoOf(r.sent_at);
        if (!at || !String(r.to_email || '').trim()) continue;
        const doc = r.document_id ? byId.get(r.document_id) : undefined;
        out.push(makeEvent({
            id: `email:${r.id}`, at, kind: 'email_sent', source: 'email', actor: 'you',
            title: emailLogSentence(r, doc ? docLabel(doc) : null),
            detail: emailLogDetail(r) || undefined,
            link: doc ? { type: 'document', docId: doc.id, formType: doc.type } : undefined,
        }));
    }
    return out;
});
