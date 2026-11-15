/**
 * Timeline source: the punch list (lib/punchList.ts). Items added (several added in the same minute become one entry),
 * marked done, checked off by you or the client, and a note the client left on an item. Field group. Pure.
 */
import type { PunchItem } from '../../punchList.ts';
import { countWord, isoOf, makeEvent, plainText, safely, str } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineEvent } from '../timelineTypes.ts';

const minute = (iso: string): string => iso.slice(0, 16);
const where = (i: PunchItem): string => (str(i.area) ? ` (${plainText(i.area, 30)})` : '');

export const punchEvents = ({ items }: { items: readonly PunchItem[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    const link = { type: 'tab' as const, tab: 'punch' as const };

    // added: items created in the same minute (a quick walk-through) are one entry
    const added = new Map<string, Array<{ item: PunchItem; at: string }>>();
    for (const item of items) {
        const at = isoOf(item.createdAt);
        if (at) added.set(minute(at), [...(added.get(minute(at)) || []), { item, at }]);
    }
    for (const [key, list] of added) {
        const at = list.map(x => x.at).sort().pop() as string;
        if (list.length === 1) {
            const { item } = list[0];
            out.push(makeEvent({ id: `punch:${item.id}:added`, at, kind: 'punch_added', source: 'punch', title: `Punch list item added: ${plainText(item.title, 80)}${where(item)}`, actor: 'you', link }));
        } else {
            out.push(makeEvent({
                id: `punch:added:${key}`, at, kind: 'punch_added', source: 'punch', title: `${countWord(list.length, 'punch list item')} added`,
                detail: list.slice(0, 3).map(x => plainText(x.item.title, 40)).join(' · ') + (list.length > 3 ? ` and ${list.length - 3} more` : ''),
                rows: list.map(x => ({ label: x.item.area ? plainText(x.item.area, 30) : 'Item', value: plainText(x.item.title, 90) })), actor: 'you', link,
            }));
        }
    }

    for (const item of items) {
        const done = isoOf(item.doneAt);
        if (done) out.push(makeEvent({ id: `punch:${item.id}:done`, at: done, kind: 'punch_done', source: 'punch', title: `Punch list item done: ${plainText(item.title, 80)}${where(item)}`, detail: str(item.assignee) ? `By ${plainText(item.assignee, 30)}` : undefined, actor: str(item.assignee) ? 'crew' : 'you', link }));
        const verified = isoOf(item.verifiedAt);
        if (verified) {
            const byClient = item.verifiedBy === 'client';
            out.push(makeEvent({
                id: `punch:${item.id}:verified`, at: verified, kind: 'punch_verified', source: 'punch', group: byClient ? 'client' : 'field',
                title: `${byClient ? 'The client checked off' : 'You checked off'} “${plainText(item.title, 70)}”${where(item)}`, actor: byClient ? 'client' : 'you', link,
            }));
        }
        const noted = isoOf(item.clientNoteAt);
        if (noted && str(item.clientNote)) {
            out.push(makeEvent({ id: `punch:${item.id}:clientnote`, at: noted, kind: 'punch_client_note', source: 'punch', group: 'client', title: `The client left a note on “${plainText(item.title, 70)}”`, detail: `“${plainText(item.clientNote, 140)}”`, actor: 'client', link }));
        }
    }
    void ctx;
    return out;
});
