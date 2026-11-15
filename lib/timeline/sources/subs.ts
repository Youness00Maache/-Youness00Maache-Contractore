/**
 * Timeline source: subcontracts (lib/subs): issued to the sub, accepted by them, finished, cancelled, and the payments
 * you recorded (a payment is a Money entry, the rest are Team). A negative payment is a correction. Pure.
 */
import type { SubCommitment } from '../../subs/subTypes.ts';
import { isoOf, makeEvent, moneyText, plainText, safely, str, whenOf } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineEvent } from '../timelineTypes.ts';

export const subEvents = ({ commitments }: { commitments: readonly SubCommitment[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    const link = { type: 'tab' as const, tab: 'subs' as const };
    for (const c of commitments) {
        const sub = plainText(c.subName, 40) || 'the sub';
        const title = plainText(c.title, 60);
        const amount = c.amount > 0 ? c.amount : undefined;
        const issued = isoOf(c.issuedAt);
        if (issued) out.push(makeEvent({ id: `sub:${c.id}:issued`, at: issued, kind: 'sub_issued', source: 'subs', title: `Subcontract “${title}” issued to ${sub}`, amount, currency: ctx.currency, actor: 'you', link }));
        const accepted = isoOf(c.acceptedAt);
        if (accepted) out.push(makeEvent({ id: `sub:${c.id}:accepted`, at: accepted, kind: 'sub_accepted', source: 'subs', title: `${sub} accepted “${title}”`, detail: str(c.acceptedBy) ? `Signed by ${plainText(c.acceptedBy, 40)}` : undefined, actor: 'sub', link }));
        const completed = isoOf(c.completedAt);
        if (completed) out.push(makeEvent({ id: `sub:${c.id}:completed`, at: completed, kind: 'sub_completed', source: 'subs', title: `${sub} finished “${title}”`, actor: 'sub', link }));
        const cancelled = isoOf(c.cancelledAt);
        if (cancelled) out.push(makeEvent({ id: `sub:${c.id}:cancelled`, at: cancelled, kind: 'sub_cancelled', source: 'subs', title: `Subcontract “${title}” with ${sub} cancelled`, actor: 'you', link }));
        for (const p of Array.isArray(c.payments) ? c.payments : []) {
            const when = whenOf(p.at, ctx.tz);
            if (!when || !p.amount) continue;
            const refund = p.amount < 0;
            out.push(makeEvent({
                id: `sub:${c.id}:paid:${p.id || p.at}`, at: when.at, dayOnly: when.dayOnly, kind: 'sub_paid', source: 'subs', group: 'money',
                title: refund ? `Payment to ${sub} corrected by ${moneyText(Math.abs(p.amount), ctx.currency)}` : `Paid ${sub} ${moneyText(p.amount, ctx.currency)} on “${title}”`,
                detail: plainText(p.note, 100) || undefined, amount: p.amount, currency: ctx.currency, actor: 'you', link,
            }));
        }
    }
    return out;
});
