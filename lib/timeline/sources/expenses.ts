/**
 * Timeline source: expenses logged on the job (Expense Log documents, receipts you scanned). Money group. Pure.
 */
import { expenseTotal } from '../../finance.ts';
import { arr, dateFieldWhen, isoOf, makeEvent, moneyText, plainText, safely, str } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent } from '../timelineTypes.ts';

export const expenseEvents = ({ docs }: { docs: readonly TimelineDoc[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    for (const doc of docs) {
        if (doc.type !== 'Expense Log') continue;
        const created = isoOf(doc.createdAt);
        if (!created) continue;
        const d = doc.data || {};
        const when = dateFieldWhen(d.date, created, ctx.tz);
        const amount = expenseTotal({ amount: d.amount, lineItems: arr(d.lineItems), tax: d.tax });
        const vendor = str(d.vendor);
        const currency = str(d.currency) || ctx.currency;
        out.push(makeEvent({
            id: `expense:${doc.id}`, at: when.at, dayOnly: when.dayOnly, kind: 'expense', source: 'expenses', actor: 'you',
            title: `Expense logged${vendor ? ` at ${plainText(vendor, 40)}` : ''}${amount > 0 ? `: ${moneyText(amount, currency)}` : ''}`,
            detail: [str(d.category), plainText(d.notes || d.description, 100)].filter(Boolean).join(' · ') || undefined,
            amount: amount > 0 ? amount : undefined, currency,
            link: { type: 'document', docId: doc.id, formType: doc.type }, pending: doc.pending ? true : undefined,
        }));
    }
    return out;
});
