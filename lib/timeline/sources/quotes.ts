/**
 * Timeline source: quotes you collected to compare (lib/subs JobQuote): received, and the one you chose. Money group. Pure.
 */
import type { JobQuote } from '../../subs/subTypes.ts';
import { isoOf, makeEvent, plainText, safely, whenOf } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineEvent } from '../timelineTypes.ts';

export const quoteEvents = ({ quotes }: { quotes: readonly JobQuote[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    const link = { type: 'tab' as const, tab: 'subs' as const };
    for (const q of quotes) {
        const vendor = plainText(q.vendorName, 40) || 'A vendor';
        const scope = plainText(q.scope, 60);
        const amount = q.amount > 0 ? q.amount : undefined;
        // the day it came in (receivedOn) when typed, else when it was entered
        const received = whenOf(q.receivedOn, ctx.tz) || (isoOf(q.createdAt) ? { at: isoOf(q.createdAt) as string, dayOnly: false } : null);
        if (received) out.push(makeEvent({ id: `quote:${q.id}:received`, at: received.at, dayOnly: received.dayOnly, kind: 'quote_received', source: 'quotes', title: `Quote from ${vendor}${scope ? ` for ${scope}` : ''}`, amount, currency: ctx.currency, actor: 'sub', link }));
        const chosen = isoOf(q.chosenAt);
        if (chosen && q.status === 'chosen') out.push(makeEvent({ id: `quote:${q.id}:chosen`, at: chosen, kind: 'quote_chosen', source: 'quotes', title: `You chose ${vendor}'s quote${scope ? ` for ${scope}` : ''}`, amount, currency: ctx.currency, actor: 'you', link }));
    }
    return out;
});
