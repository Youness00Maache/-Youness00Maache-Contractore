/**
 * Timeline source: the money / paper documents of the job (Estimate, Invoice, Change Order, Work Order, Receipt,
 * Warranty). Created, sent, signed or approved by the client, declined, "I've paid", paid, converted (estimate ->
 * invoice), revised and expired. The other document types have their own adapters (daily reports, notes, expenses,
 * purchase orders). Pure: `sentAt` is the day the reminders saw it sent (reminder_document_state), when the account
 * has it; without it a document simply has no "sent" entry (the app does not record the time any other way).
 */
import { documentTotals, type FinanceDoc } from '../../finance.ts';
import { computeDocumentTotals, toNumber } from '../../../utils/money.ts';
import { addDays, arr, atLocal, clientWord, docLabel, firstName, isoOf, makeEvent, moneyText, plainText, rec, safely, str, toYmd, whenOf } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent, TimelineLink } from '../timelineTypes.ts';

/** types this adapter does not turn into events (they have their own adapter) */
const OTHER_ADAPTERS = new Set(['Daily Job Report', 'Time Sheet', 'Material Log', 'Note', 'Expense Log', 'Purchase Order', 'Profit Report']);

const linkOf = (doc: TimelineDoc): TimelineLink => ({ type: 'document', docId: doc.id, formType: doc.type });

const totalOf = (doc: TimelineDoc): number | undefined => {
    try {
        if (doc.type === 'Estimate' || doc.type === 'Invoice') {
            const total = documentTotals({ id: doc.id, type: doc.type, ...doc.data } as FinanceDoc).total;
            return total > 0 ? total : undefined;
        }
        if (doc.type === 'Change Order') {
            const net = computeDocumentTotals({ lineItems: arr(doc.data.lineItems) }).subtotal;
            return net !== 0 ? net : undefined;
        }
        if (doc.type === 'Receipt') {
            const amount = toNumber(doc.data.amount);
            return amount > 0 ? amount : undefined;
        }
    } catch { /* odd data: no amount */ }
    return undefined;
};

const chosenOption = (doc: TimelineDoc): string => str(rec(doc.data.clientOptionChoice).optionName) || str(rec(rec(doc.data.estimateOptions).choice).optionName);

const signer = (doc: TimelineDoc, ctx: TimelineContext): string =>
    firstName(doc.data.clientSignerName) || firstName(doc.data.clientSignedBy) || clientWord(doc, ctx);

const PAYMENT_METHOD_WORDS = /^(cash|check|cheque|zelle|venmo|paypal|other)$/i;

export interface DocumentSourceData {
    docs: readonly TimelineDoc[];
    /** document id -> ISO time the reminders saw it marked Sent (reminder_document_state.sent_at) */
    sentAt?: Readonly<Record<string, string>>;
}

export const documentEvents = ({ docs, sentAt = {} }: DocumentSourceData, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    const byId = new Map(docs.map(d => [d.id, d]));
    // receipts that belong to a recorded payment: the payment entry already tells it
    const paymentReceipts = new Set<string>();
    for (const d of docs) for (const p of arr(d.data.payments)) if (str(rec(p).receiptId)) paymentReceipts.add(str(rec(p).receiptId));

    for (const doc of docs) {
        if (OTHER_ADAPTERS.has(doc.type)) continue;
        const d = doc.data || {};
        const label = docLabel(doc);
        const link = linkOf(doc);
        const currency = str(d.currency) || ctx.currency;
        const total = totalOf(doc);
        const who = clientWord(doc, ctx);
        const created = isoOf(doc.createdAt);
        const pending = doc.pending ? true : undefined;

        // --- created / converted / revised (one entry for how this document came to be)
        if (created) {
            const sourceEstimateId = str(d.sourceEstimateId);
            const revisionOf = str(d.revisionOf);
            if (doc.type === 'Invoice' && sourceEstimateId) {
                const est = byId.get(sourceEstimateId);
                const from = est ? docLabel(est) : str(d.sourceEstimateNumber) ? `Estimate ${str(d.sourceEstimateNumber)}` : 'the estimate';
                out.push(makeEvent({ id: `doc:${doc.id}:converted`, at: created, kind: 'doc_converted', source: 'documents', title: `${from} turned into ${label}`, amount: total, currency, actor: 'you', link, pending }));
            } else if (revisionOf) {
                const earlier = byId.get(revisionOf);
                out.push(makeEvent({
                    id: `doc:${doc.id}:revised`, at: created, kind: 'doc_revised', source: 'documents',
                    title: `${label} started as a new version${earlier ? ` of ${docLabel(earlier)}` : ''}`, amount: total, currency, actor: 'you', link, pending,
                }));
            } else if (doc.type === 'Receipt' && paymentReceipts.has(doc.id)) {
                // covered by the payment entry of its invoice
            } else {
                const detail = doc.type === 'Receipt' ? str(d.description) || (str(d.paymentMethod) ? `Paid by ${str(d.paymentMethod).toLowerCase()}` : '') : '';
                const title = doc.type === 'Receipt' ? `${label} made out to ${who}` : `${label} created`;
                out.push(makeEvent({ id: `doc:${doc.id}:created`, at: created, kind: 'doc_created', source: 'documents', title, detail: plainText(detail, 120), amount: total, currency, actor: 'you', link, pending }));
            }
        }

        // --- sent
        const sent = isoOf(sentAt[doc.id]);
        if (sent && (doc.type === 'Invoice' || doc.type === 'Estimate')) {
            out.push(makeEvent({ id: `doc:${doc.id}:sent`, at: sent, kind: 'doc_sent', source: 'documents', title: `${label} sent to ${who}`, amount: total, currency, actor: 'you', link }));
        }

        // --- the client signed / approved / declined
        const signedAt = isoOf(d.clientSignedAt);
        if (signedAt) {
            const verb = doc.type === 'Change Order' ? 'approved' : 'signed';
            const choice = doc.type === 'Estimate' ? chosenOption(doc) : '';
            out.push(makeEvent({
                id: `doc:${doc.id}:signed:${signedAt}`, at: signedAt, kind: 'doc_signed', source: 'documents', group: 'client',
                title: `${signer(doc, ctx)} ${verb} ${label}${choice ? ` and chose ${choice}` : ''}`, amount: total, currency, actor: 'client', link,
            }));
        }
        const declinedAt = isoOf(d.clientDeclinedAt);
        if (declinedAt) {
            const reason = plainText(d.clientDeclineReason, 160);
            out.push(makeEvent({
                id: `doc:${doc.id}:declined:${declinedAt}`, at: declinedAt, kind: 'doc_declined', source: 'documents', group: 'client',
                title: `${firstName(d.clientSignerName) || who} declined ${label}`, detail: reason ? `“${reason}”` : undefined, actor: 'client', link,
            }));
        }

        // --- invoices: "I've paid" from the client, then the payments the contractor recorded
        if (doc.type === 'Invoice') {
            const reportedAt = isoOf(d.paymentReportedAt);
            if (reportedAt) {
                const amount = toNumber(d.paymentReportAmount);
                out.push(makeEvent({
                    id: `doc:${doc.id}:reported:${reportedAt}`, at: reportedAt, kind: 'payment_reported', source: 'documents', group: 'money',
                    title: `${who} says they paid ${label}`, detail: plainText(d.paymentReportNote, 140), amount: amount > 0 ? amount : undefined, currency, actor: 'client', link,
                }));
            }
            const payments = arr(d.payments).map(rec).filter(p => toNumber(p.amount) > 0)
                .map(p => ({ p, when: whenOf(str(p.recordedAt) || str(p.date), ctx.tz) }))
                .filter((x): x is { p: Record<string, any>; when: { at: string; dayOnly: boolean } } => !!x.when)
                .sort((a, b) => a.when.at.localeCompare(b.when.at));
            // a deposit taken with the invoice is in `amountPaid` but is not one of the recorded payments
            const recorded = payments.reduce((s, x) => s + toNumber(x.p.amount), 0);
            let running = Math.max(0, toNumber(d.amountPaid) - recorded);
            payments.forEach(({ p, when }, i) => {
                const amount = toNumber(p.amount);
                running += amount;
                const full = total !== undefined && running + 0.005 >= total;
                const method = str(p.method);
                out.push(makeEvent({
                    id: `doc:${doc.id}:paid:${str(p.id) || i}`, at: when.at, dayOnly: when.dayOnly, kind: 'doc_paid', source: 'documents', group: 'money',
                    title: full ? `${label} paid in full` : `Payment received on ${label}`,
                    detail: [method && (PAYMENT_METHOD_WORDS.test(method) ? method.toLowerCase() : method), str(p.receiptNumber) && `receipt ${str(p.receiptNumber)}`].filter(Boolean).join(' · ') || undefined,
                    amount, currency, actor: 'you', link,
                }));
            });
            // "Paid" with no recorded payment (older invoices, a status change): one entry on the paid date
            if (payments.length === 0 && /^paid$/i.test(str(d.status))) {
                const when = whenOf(str(d.paidAt) || str(d.paidDate), ctx.tz);
                if (when) out.push(makeEvent({ id: `doc:${doc.id}:paid:status`, at: when.at, dayOnly: when.dayOnly, kind: 'doc_paid', source: 'documents', group: 'money', title: `${label} marked as paid`, amount: total, currency, actor: 'you', link }));
            }
        }

        // --- an estimate nobody answered before its expiry date
        if (doc.type === 'Estimate' && /^sent$/i.test(str(d.status)) && !signedAt && !declinedAt) {
            const expiry = toYmd(str(d.expiryDate));
            if (expiry) {
                const at = atLocal(addDays(expiry, 1), 12, ctx.tz);
                if (Date.parse(at) <= ctx.now) out.push(makeEvent({ id: `doc:${doc.id}:expired:${expiry}`, at, dayOnly: true, kind: 'doc_expired', source: 'documents', title: `${label} expired without an answer`, amount: total, currency, actor: 'system', link }));
            }
        }
    }
    return out;
});
