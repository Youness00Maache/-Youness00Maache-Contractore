/**
 * Timeline source: client selections (lib/selections): sent, chosen (with the option and its price), approved by you,
 * changes asked for, ordered (linked to the purchase order). Read from the selection's history; without history it
 * falls back to its sent / chosen / approved / ordered times. Client group. Pure.
 */
import { roundMoney } from '../../../utils/money.ts';
import type { JobSelection } from '../../selections/selectionTypes.ts';
import { clientWord, firstName, isoOf, makeEvent, plainText, safely, str } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineEvent, TimelineLink } from '../timelineTypes.ts';

interface Step { action: string; at: string; by: string; note: string }

const stepsOf = (s: JobSelection): Step[] => {
    const fromHistory = (Array.isArray(s.history) ? s.history : [])
        .map(h => ({ action: str(h?.action), at: isoOf(h?.at) || '', by: str(h?.by), note: str(h?.note) }))
        .filter(x => x.at && ['sent', 'chosen', 'approved', 'changes_requested', 'ordered'].includes(x.action));
    if (fromHistory.length) return fromHistory;
    const out: Step[] = [];
    const add = (action: string, value: unknown, by: string, note = '') => { const at = isoOf(value); if (at) out.push({ action, at, by, note }); };
    add('sent', s.sentAt, 'owner');
    add('chosen', s.chosenAt, 'client', str(s.clientComment));
    add('approved', s.approvedAt, 'owner');
    add('ordered', s.orderedAt, 'owner');
    return out;
};

export const selectionEvents = ({ selections }: { selections: readonly JobSelection[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    for (const sel of selections) {
        const name = plainText(sel.title, 60);
        const client = clientWord(null, ctx);
        const chosen = (sel.options || []).find(o => o.id === sel.chosenOptionId);
        const chosenAmount = chosen ? roundMoney((Number(chosen.qty) || 1) * (Number(chosen.unitPrice) || 0)) : 0;
        const tab: TimelineLink = { type: 'tab', tab: 'selections' };
        const link: TimelineLink = sel.poDocumentId ? { type: 'document', docId: sel.poDocumentId, formType: 'Purchase Order' } : tab;
        for (const s of stepsOf(sel)) {
            const id = `selection:${sel.id}:${s.action}:${s.at}`;
            if (s.action === 'sent') out.push(makeEvent({ id, at: s.at, kind: 'selection_sent', source: 'selections', title: `Selection “${name}” sent to ${client}`, detail: (sel.options || []).length ? `${sel.options.length} options` : undefined, actor: 'you', link: tab }));
            else if (s.action === 'chosen') out.push(makeEvent({
                id, at: s.at, kind: 'selection_chosen', source: 'selections', title: `${firstName(sel.chosenBy) || client} chose ${chosen ? `“${plainText(chosen.name, 50)}”` : 'an option'} for “${name}”`,
                detail: plainText(s.note || sel.clientComment, 140) ? `“${plainText(s.note || sel.clientComment, 140)}”` : undefined, amount: chosenAmount > 0 ? chosenAmount : undefined, actor: 'client', link: tab,
            }));
            else if (s.action === 'approved') out.push(makeEvent({ id, at: s.at, kind: 'selection_approved', source: 'selections', title: `You approved “${name}”`, actor: 'you', link: tab }));
            else if (s.action === 'changes_requested') out.push(makeEvent({ id, at: s.at, kind: 'selection_changes', source: 'selections', title: `${client} asked for changes on “${name}”`, detail: plainText(s.note, 160) ? `“${plainText(s.note, 160)}”` : undefined, actor: 'client', link: tab }));
            else if (s.action === 'ordered') out.push(makeEvent({ id, at: s.at, kind: 'selection_ordered', source: 'selections', title: `“${name}” ordered`, detail: chosen ? plainText(chosen.name, 60) : undefined, amount: chosenAmount > 0 ? chosenAmount : undefined, actor: 'you', link }));
        }
    }
    return out;
});
