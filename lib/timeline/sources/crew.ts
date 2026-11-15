/**
 * Timeline source: crew time clock (lib/crew). The clock-in / clock-out punches on this job are paired into shifts
 * (the same logic as the Crew hours screen) and each day becomes ONE entry: who was on site and for how long. A shift
 * still open shows as "on the clock". Team group. Pure.
 */
import { buildSessions, durationLabel, type Punch } from '../../crew/crewLogic.ts';
import { countWord, dayOf, makeEvent, safely } from '../timelineHelpers.ts';
import { timeLabel } from '../timelineFormat.ts';
import type { TimelineContext, TimelineEvent, TimelineRow } from '../timelineTypes.ts';

export const crewEvents = ({ punches }: { punches: readonly Punch[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const sessions = buildSessions(punches, { now: ctx.now });
    const byDay = new Map<string, typeof sessions>();
    for (const s of sessions) {
        const day = dayOf(new Date(s.start).toISOString(), ctx.tz);
        if (day) byDay.set(day, [...(byDay.get(day) || []), s]);
    }
    const out: TimelineEvent[] = [];
    for (const [day, list] of byDay) {
        const perPerson = new Map<string, { ms: number; first: number; last: number; open: boolean }>();
        for (const s of list) {
            const name = ctx.memberNames?.[s.memberId] || 'A worker';
            const cur = perPerson.get(name) || { ms: 0, first: s.start, last: s.start, open: false };
            cur.ms += s.workedMs || (s.open ? s.liveMs : 0);
            cur.first = Math.min(cur.first, s.start);
            cur.last = Math.max(cur.last, s.end ?? s.start);
            cur.open = cur.open || s.open;
            perPerson.set(name, cur);
        }
        const names = [...perPerson.keys()];
        const totalMs = [...perPerson.values()].reduce((sum, p) => sum + p.ms, 0);
        const rows: TimelineRow[] = names.map(name => {
            const p = perPerson.get(name)!;
            const span = `${timeLabel(new Date(p.first).toISOString(), ctx.tz)}${p.open ? ' on the clock' : ` – ${timeLabel(new Date(p.last).toISOString(), ctx.tz)}`}`;
            return { label: name, value: `${p.ms > 0 ? durationLabel(p.ms) : 'clocked in'} (${span})` };
        });
        const last = Math.max(...[...perPerson.values()].map(p => p.last));
        out.push(makeEvent({
            id: `crew:${day}`, at: new Date(last).toISOString(), kind: 'crew_time', source: 'crew', actor: 'crew',
            title: names.length === 1 ? `${names[0]} on site${totalMs > 0 ? `: ${durationLabel(totalMs)}` : ''}` : `${countWord(names.length, 'worker')} on site${totalMs > 0 ? `: ${durationLabel(totalMs)} in all` : ''}`,
            detail: names.length > 1 ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '') : undefined,
            rows, link: { type: 'tab', tab: 'crew' },
        }));
    }
    return out;
});
