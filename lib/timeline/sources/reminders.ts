/**
 * Timeline source: reminder emails the app sent for this job's invoices and estimates (the `reminders` log the
 * Messages screen reads, lib/reminders.ts). Only the ones that were really sent. Client group, done by the system. Pure.
 */
import type { RecordRow } from '../../reminders.ts';
import { docLabel, isoOf, makeEvent, plainText, safely, str } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent } from '../timelineTypes.ts';

const KIND_WORD: Record<string, string> = { invoice: 'Invoice reminder', estimate: 'Estimate follow-up', visit: 'Visit reminder' };

export const reminderEvents = ({ records, docs = [] }: { records: readonly RecordRow[]; docs?: readonly TimelineDoc[] }, _ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const byId = new Map(docs.map(d => [d.id, d]));
    const out: TimelineEvent[] = [];
    for (const r of records) {
        if (r.status !== 'sent') continue;
        const at = isoOf(r.sent_at);
        if (!at) continue;
        const doc = r.document_id ? byId.get(r.document_id) : undefined;
        const word = KIND_WORD[String(r.kind)] || 'Reminder';
        const to = plainText(r.to_email, 60);
        out.push(makeEvent({
            id: `reminder:${r.id}`, at, kind: 'reminder_sent', source: 'reminders', actor: 'system',
            title: `${word} emailed${to ? ` to ${to}` : ''}${doc ? ` about ${docLabel(doc)}` : ''}`,
            detail: plainText(str(r.subject), 120) || undefined,
            link: doc ? { type: 'document', docId: doc.id, formType: doc.type } : undefined,
        }));
    }
    return out;
});
