/**
 * Timeline source: purchase orders and their deliveries (Purchase Order documents). Created, confirmed or turned down
 * by the supplier, and every delivery that was received (lib/poLifecycle.ts parseDeliveries). The time an order was
 * "sent" is not recorded anywhere, so it has no entry. Money group. Pure.
 */
import { documentTotals, type FinanceDoc } from '../../finance.ts';
import { parseDeliveries } from '../../poLifecycle.ts';
import { arr, countWord, isoOf, makeEvent, plainText, safely, str, whenOf } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent } from '../timelineTypes.ts';

export const orderEvents = ({ docs }: { docs: readonly TimelineDoc[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    for (const doc of docs) {
        if (doc.type !== 'Purchase Order') continue;
        const d = doc.data || {};
        const number = str(d.poNumber);
        const label = number ? `Purchase order ${number}` : 'Purchase order';
        const vendor = plainText(d.vendorName, 40);
        const link = { type: 'document' as const, docId: doc.id, formType: doc.type };
        let amount: number | undefined;
        try { const t = documentTotals({ id: doc.id, type: doc.type, lineItems: arr(d.lineItems) } as FinanceDoc).total; amount = t > 0 ? t : undefined; } catch { /* no amount */ }
        const created = isoOf(doc.createdAt);
        if (created) out.push(makeEvent({ id: `po:${doc.id}:created`, at: created, kind: 'order_sent', source: 'orders', title: `${label}${vendor ? ` to ${vendor}` : ''} created`, amount, currency: ctx.currency, actor: 'you', link, pending: doc.pending ? true : undefined }));
        const confirmed = isoOf(d.clientSignedAt);
        if (confirmed) out.push(makeEvent({ id: `po:${doc.id}:confirmed`, at: confirmed, kind: 'order_sent', source: 'orders', group: 'client', title: `${vendor || 'The supplier'} confirmed ${label}`, actor: 'client', link }));
        const declined = isoOf(d.clientDeclinedAt);
        if (declined) out.push(makeEvent({ id: `po:${doc.id}:declined`, at: declined, kind: 'order_sent', source: 'orders', group: 'client', title: `${vendor || 'The supplier'} can't fill ${label}`, detail: plainText(d.clientDeclineReason, 140) || undefined, actor: 'client', link }));
        for (const dl of parseDeliveries(d)?.list || []) {
            if (dl.state === 'receiving') continue;
            const when = whenOf(dl.doneAt || dl.at || dl.date, ctx.tz);
            if (!when) continue;
            const lines = dl.lines.length;
            out.push(makeEvent({
                id: `po:${doc.id}:delivery:${dl.id}`, at: when.at, dayOnly: when.dayOnly, kind: 'order_delivered', source: 'orders', actor: 'you',
                title: `Delivery received on ${label}${vendor ? ` from ${vendor}` : ''}`,
                detail: [lines ? countWord(lines, 'item') : '', plainText(dl.note, 100)].filter(Boolean).join(' · ') || undefined, link,
            }));
        }
    }
    return out;
});
