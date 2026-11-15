/**
 * Appointments + calendar items of leads (roadmap D1): pure logic, no React / Supabase. Tested by
 * scripts/leads-check.ts. Shapes: ./leadTypes.ts.
 *
 *   APPOINTMENT_KIND_LABELS / APPOINTMENT_STATUS_LABELS
 *   appointmentEnd(appt)                       end Date (ends_at, else start + 60 min)
 *   appointmentsOverlap(a, b)                  both scheduled and their times cross
 *   findOverlaps(appts)                        [a, b] pairs that cross (scheduled only)
 *   conflictsFor(draft, appts, ignoreId?)      scheduled appointments a new / moved one would cross
 *   nextAppointment(appts, now, filter?)       first scheduled one that has not ended ({ leadId?, jobId?, clientId? })
 *   isPastAppointment(appt, now)               scheduled but already ended (ask: done / no-show?)
 *   validateAppointmentDraft(draft)            { title?, startsAt?, endsAt?, notes?, location? } errors ({} = fine)
 *   appointmentTimeLabel(appt, locale?)        "9:30 AM – 10:30 AM"
 *   appointmentIcsFields(appt, opts)           { uid, dtstamp, dtstart, dtend, summary, description, location, status }
 *   appointmentToIcs(appt, opts)               a full .ics (VCALENDAR, CRLF, folded lines) to download / share
 *   leadCalendarItems({ leads, appointments, today, now, from?, to? })   LeadCalendarItem[] sorted by day + time:
 *       one 'follow_up' per open lead with a follow-up date, one 'appointment' per appointment (cancelled left out)
 *   calendarItemsOnDay(items, ymd) / countCalendarItemsByDay(items)
 */
import { isOpenStage, isYmd, localYmd } from './leadLogic.ts';
import {
    APPOINTMENT_LIMITS, APPOINTMENT_KINDS,
    type Appointment, type AppointmentDraft, type AppointmentKind, type AppointmentStatus, type Lead, type LeadCalendarItem,
} from './leadTypes.ts';

export const APPOINTMENT_KIND_LABELS: Record<AppointmentKind, string> = {
    site_visit: 'Site visit',
    estimate: 'Estimate meeting',
    meeting: 'Meeting',
    call: 'Call',
    other: 'Appointment',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
    scheduled: 'Scheduled',
    done: 'Done',
    cancelled: 'Cancelled',
    no_show: 'No-show',
};

const MIN_MS = 60_000;
const ms = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : Number.NaN);

export const appointmentEnd = (a: Pick<Appointment, 'startsAt' | 'endsAt'>): Date => {
    const end = ms(a.endsAt);
    if (Number.isFinite(end) && end >= ms(a.startsAt)) return new Date(end);
    return new Date(ms(a.startsAt) + APPOINTMENT_LIMITS.defaultMinutes * MIN_MS);
};

type Timed = Pick<Appointment, 'startsAt' | 'endsAt'> & { status?: AppointmentStatus; id?: string };

const crosses = (a: Timed, b: Timed): boolean => {
    const as = ms(a.startsAt);
    const bs = ms(b.startsAt);
    if (!Number.isFinite(as) || !Number.isFinite(bs)) return false;
    return as < appointmentEnd(b).getTime() && bs < appointmentEnd(a).getTime();
};

export const appointmentsOverlap = (a: Timed, b: Timed): boolean =>
    (a.status ?? 'scheduled') === 'scheduled' && (b.status ?? 'scheduled') === 'scheduled' && crosses(a, b);

export const findOverlaps = <T extends Timed>(appts: readonly T[]): Array<[T, T]> => {
    const list = appts.filter(a => (a.status ?? 'scheduled') === 'scheduled' && Number.isFinite(ms(a.startsAt)))
        .sort((x, y) => ms(x.startsAt) - ms(y.startsAt));
    const out: Array<[T, T]> = [];
    for (let i = 0; i < list.length; i++) {
        const endI = appointmentEnd(list[i]).getTime();
        for (let j = i + 1; j < list.length && ms(list[j].startsAt) < endI; j++) {
            if (crosses(list[i], list[j])) out.push([list[i], list[j]]);
        }
    }
    return out;
};

/** Scheduled appointments a new or moved appointment would cross (ignoreId = the one being moved). */
export const conflictsFor = <T extends Timed>(draft: Pick<AppointmentDraft, 'startsAt' | 'endsAt'>, appts: readonly T[], ignoreId?: string): T[] =>
    appts.filter(a => a.id !== ignoreId && (a.status ?? 'scheduled') === 'scheduled' && crosses({ startsAt: draft.startsAt, endsAt: draft.endsAt ?? null }, a));

export const isPastAppointment = (a: Timed, now: number | Date = Date.now()): boolean =>
    (a.status ?? 'scheduled') === 'scheduled' && appointmentEnd(a).getTime() <= (typeof now === 'number' ? now : now.getTime());

/** First scheduled appointment that has not ended yet (optionally of one lead / job / client). */
export const nextAppointment = <T extends Appointment>(
    appts: readonly T[], now: number | Date = Date.now(), filter: { leadId?: string; jobId?: string; clientId?: string } = {},
): T | null => {
    const n = typeof now === 'number' ? now : now.getTime();
    let best: T | null = null;
    for (const a of appts) {
        if (a.status !== 'scheduled') continue;
        if (filter.leadId && a.leadId !== filter.leadId) continue;
        if (filter.jobId && a.jobId !== filter.jobId) continue;
        if (filter.clientId && a.clientId !== filter.clientId) continue;
        if (appointmentEnd(a).getTime() <= n) continue;
        if (!best || ms(a.startsAt) < ms(best.startsAt)) best = a;
    }
    return best;
};

export type AppointmentErrors = Partial<Record<'title' | 'startsAt' | 'endsAt' | 'notes' | 'location' | 'kind', string>>;

export const validateAppointmentDraft = (d: AppointmentDraft): AppointmentErrors => {
    const errors: AppointmentErrors = {};
    const title = String(d.title || '').trim();
    if (!title) errors.title = 'Please add a title.';
    else if (title.length > APPOINTMENT_LIMITS.title) errors.title = `Please keep the title under ${APPOINTMENT_LIMITS.title} characters.`;
    const start = ms(d.startsAt);
    if (!Number.isFinite(start)) errors.startsAt = 'Please pick a date and time.';
    if (d.endsAt) {
        const end = ms(d.endsAt);
        if (!Number.isFinite(end)) errors.endsAt = 'Please pick an end time.';
        else if (Number.isFinite(start) && end < start) errors.endsAt = 'The end is before the start.';
        else if (Number.isFinite(start) && end - start > APPOINTMENT_LIMITS.maxDays * 86_400_000) errors.endsAt = 'An appointment can last up to 7 days.';
    }
    if ((d.notes || '').trim().length > APPOINTMENT_LIMITS.notes) errors.notes = `Please keep the notes under ${APPOINTMENT_LIMITS.notes} characters.`;
    if ((d.location || '').trim().length > APPOINTMENT_LIMITS.location) errors.location = `Please keep the address under ${APPOINTMENT_LIMITS.location} characters.`;
    if (d.kind && !(APPOINTMENT_KINDS as readonly string[]).includes(d.kind)) errors.kind = 'Please pick a type.';
    return errors;
};

const timeFmt = (d: Date, locale?: string): string => {
    try { return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }); } catch { return d.toISOString().slice(11, 16); }
};

export const appointmentTimeLabel = (a: Pick<Appointment, 'startsAt' | 'endsAt'>, locale?: string): string => {
    const start = new Date(ms(a.startsAt));
    if (!Number.isFinite(start.getTime())) return '';
    if (!a.endsAt) return timeFmt(start, locale);
    return `${timeFmt(start, locale)} – ${timeFmt(appointmentEnd(a), locale)}`;
};

// ------------------------------------------------------------------------------------------------ ICS
/** 2026-11-15T09:30:00.000Z -> 20261115T093000Z */
export const icsUtc = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545 text escaping. */
export const icsEscape = (s: string): string =>
    String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds a content line at 73 characters (continuation lines start with a space). */
export const icsFold = (line: string): string => {
    if (line.length <= 73) return line;
    const parts: string[] = [];
    for (let i = 0; i < line.length; i += 73) parts.push((i ? ' ' : '') + line.slice(i, i + 73));
    return parts.join('\r\n');
};

export interface IcsFields {
    uid: string;
    dtstamp: string;
    dtstart: string;
    dtend: string;
    summary: string;
    description: string;
    location: string;
    status: 'CONFIRMED' | 'CANCELLED';
}

export const appointmentIcsFields = (
    a: Pick<Appointment, 'id' | 'title' | 'notes' | 'location' | 'startsAt' | 'endsAt' | 'status' | 'kind'>,
    opts: { domain?: string; now?: Date; contactLine?: string } = {},
): IcsFields => ({
    uid: `${a.id}@${opts.domain || 'contractordocs.app'}`,
    dtstamp: icsUtc(opts.now ?? new Date()),
    dtstart: icsUtc(new Date(ms(a.startsAt))),
    dtend: icsUtc(appointmentEnd(a)),
    summary: a.title.trim() || APPOINTMENT_KIND_LABELS[a.kind] || 'Appointment',
    description: [a.notes.trim(), opts.contactLine?.trim() || ''].filter(Boolean).join('\n'),
    location: a.location.trim(),
    status: a.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
});

export const appointmentToIcs = (
    a: Pick<Appointment, 'id' | 'title' | 'notes' | 'location' | 'startsAt' | 'endsAt' | 'status' | 'kind'>,
    opts: { domain?: string; now?: Date; contactLine?: string } = {},
): string => {
    const f = appointmentIcsFields(a, opts);
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ContractorDocs//Appointments//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${f.uid}`, `DTSTAMP:${f.dtstamp}`, `DTSTART:${f.dtstart}`, `DTEND:${f.dtend}`,
        `SUMMARY:${icsEscape(f.summary)}`,
        f.description ? `DESCRIPTION:${icsEscape(f.description)}` : '',
        f.location ? `LOCATION:${icsEscape(f.location)}` : '',
        `STATUS:${f.status}`,
        'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).map(icsFold);
    return `${lines.join('\r\n')}\r\n`;
};

// ------------------------------------------------------------------------------------------------ calendar
export const leadCalendarItems = (input: {
    leads: readonly Lead[];
    appointments: readonly Appointment[];
    today: string;
    now?: number | Date;
    /** inclusive local days YYYY-MM-DD; overdue follow-ups before `from` are kept (shown on today) */
    from?: string;
    to?: string;
    locale?: string;
}): LeadCalendarItem[] => {
    const { today } = input;
    const now = input.now === undefined ? Date.now() : typeof input.now === 'number' ? input.now : input.now.getTime();
    const leadName = new Map(input.leads.map(l => [l.id, l.name]));
    const items: LeadCalendarItem[] = [];

    for (const lead of input.leads) {
        if (!lead.followUpOn || !isYmd(lead.followUpOn) || !isOpenStage(lead.stage) || lead.archived) continue;
        const overdue = lead.followUpOn < today;
        if (input.to && lead.followUpOn > input.to) continue;
        if (input.from && lead.followUpOn < input.from && !overdue) continue;
        items.push({
            key: `follow_up:${lead.id}`,
            kind: 'follow_up',
            date: lead.followUpOn,
            startsAt: null,
            endsAt: null,
            timeLabel: '',
            title: `Follow up: ${lead.name}`,
            subtitle: lead.phone || lead.email || '',
            leadId: lead.id,
            jobId: lead.jobId,
            clientId: lead.clientId,
            appointmentId: null,
            overdue,
            status: 'follow_up',
        });
    }

    for (const a of input.appointments) {
        if (a.status === 'cancelled') continue;
        const start = new Date(ms(a.startsAt));
        if (!Number.isFinite(start.getTime())) continue;
        const date = localYmd(start);
        if (input.from && date < input.from) continue;
        if (input.to && date > input.to) continue;
        const who = a.leadId ? leadName.get(a.leadId) : undefined;
        items.push({
            key: `appointment:${a.id}`,
            kind: 'appointment',
            date,
            startsAt: a.startsAt,
            endsAt: appointmentEnd(a).toISOString(),
            timeLabel: appointmentTimeLabel(a, input.locale),
            title: a.title,
            subtitle: [APPOINTMENT_KIND_LABELS[a.kind], who, a.location].filter(Boolean).join(' · '),
            leadId: a.leadId,
            jobId: a.jobId,
            clientId: a.clientId,
            appointmentId: a.id,
            overdue: isPastAppointment(a, now),
            status: a.status,
        });
    }

    return items.sort((x, y) =>
        x.date.localeCompare(y.date)
        || (x.startsAt ? 1 : 0) - (y.startsAt ? 1 : 0) // follow-ups (all day) first
        || ms(x.startsAt) - ms(y.startsAt)
        || x.title.localeCompare(y.title));
};

/** Items to show on one day; overdue follow-ups also show on today. */
export const calendarItemsOnDay = (items: readonly LeadCalendarItem[], ymd: string, today?: string): LeadCalendarItem[] =>
    items.filter(i => i.date === ymd || (today !== undefined && ymd === today && i.kind === 'follow_up' && i.overdue));

export const countCalendarItemsByDay = (items: readonly LeadCalendarItem[]): Map<string, number> => {
    const out = new Map<string, number>();
    for (const i of items) out.set(i.date, (out.get(i.date) || 0) + 1);
    return out;
};
