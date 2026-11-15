/**
 * Timeline source: warranties (lib/warranty): the day coverage starts (and for how long), and every claim the client
 * reported or that was resolved. Read from the Warranty documents' own data (`warrantyTracking`, completedDate,
 * duration) with the same logic the warranty cards use. Field group. Pure.
 */
import { warrantyOverview } from '../../warranty/warrantyLogic.ts';
import { dayOf, makeEvent, plainText, safely, str, whenOf } from '../timelineHelpers.ts';
import { shortDate } from '../timelineFormat.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent } from '../timelineTypes.ts';

const CLAIM_RESULT: Record<string, string> = { resolved: 'resolved', denied: 'denied' };

export const warrantyEvents = ({ docs }: { docs: readonly TimelineDoc[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    const today = dayOf(new Date(ctx.now).toISOString(), ctx.tz) || '';
    const year = Number(today.slice(0, 4)) || undefined;
    for (const doc of docs) {
        if (doc.type !== 'Warranty') continue;
        const view = warrantyOverview(doc.data, today, { createdAt: doc.createdAt });
        const number = str(doc.data.warrantyNumber);
        const label = number ? `Warranty ${number}` : 'Warranty';
        const link = { type: 'document' as const, docId: doc.id, formType: 'Warranty' };

        const start = view.startDate ? whenOf(view.startDate, ctx.tz) : null;
        if (start) {
            const length = view.lifetime ? 'for life' : view.expiresOn ? `until ${shortDate(view.expiresOn, year)}` : '';
            out.push(makeEvent({ id: `warranty:${doc.id}:start`, at: start.at, dayOnly: true, kind: 'warranty_started', source: 'warranty', title: `${label} coverage starts${length ? ` (${length})` : ''}`, actor: 'system', link }));
        }
        for (const claim of view.tracking.claims) {
            const reported = whenOf(claim.date, ctx.tz);
            if (reported) out.push(makeEvent({ id: `warranty:${doc.id}:claim:${claim.id}`, at: reported.at, dayOnly: true, kind: 'warranty_claim', source: 'warranty', group: 'client', title: `Warranty claim reported${plainText(claim.description, 80) ? `: ${plainText(claim.description, 80)}` : ''}`, actor: 'client', link }));
            const closed = claim.resolvedOn ? whenOf(claim.resolvedOn, ctx.tz) : null;
            if (closed && CLAIM_RESULT[claim.status]) {
                out.push(makeEvent({ id: `warranty:${doc.id}:claim:${claim.id}:${claim.status}`, at: closed.at, dayOnly: true, kind: 'warranty_claim_resolved', source: 'warranty', title: `Warranty claim ${CLAIM_RESULT[claim.status]}`, detail: plainText(claim.resolution, 140) || undefined, actor: 'you', link }));
            }
        }
    }
    return out;
});
