/**
 * "Add to my calendar" file (.ics) for Settings > Integrations & data (roadmap N10). Pure: no React, no network, no
 * clock unless passed in. scripts/integrations-check.ts tests it with golden strings.
 *
 * There is no server that could host a live subscription address, so this is a SNAPSHOT the owner downloads again when
 * they want it refreshed. Every event keeps the same UID each time, so importing a newer file into the same calendar
 * updates the events instead of copying them.
 *
 * FILE FORMAT (RFC 5545)
 *   - one VCALENDAR (VERSION 2.0, METHOD:PUBLISH) with one VEVENT per item, CRLF after every line
 *   - lines longer than 75 OCTETS are folded (a CRLF + one space); a multi-byte character is never split
 *   - TEXT values escape backslash, semicolon, comma and line breaks (\\ \; \, \n); control characters are dropped
 *
 * TIME ZONES (one rule, documented here)
 *   - Items that happen at a time of day (appointments) are written as UTC instants: DTSTART:20261116T143000Z. The
 *     calendar app shows them in the viewer's own time zone, so a 9:30 AM Chicago appointment is 9:30 AM in Chicago.
 *   - Items that belong to a calendar DAY (jobs, follow-ups, task and document due dates) are written as dates with no
 *     time and no zone: DTSTART;VALUE=DATE:20261116. They stay on that day wherever the file is opened. DTEND of an
 *     all-day event is the day AFTER the last day (the format's rule), which this module adds.
 *   - "Which days are the next 30 / 90 / 365 days" is decided in the owner's local time zone (`dayOf`, default the
 *     browser's), never in UTC, so an evening appointment is not moved to tomorrow.
 *
 *   collectCalendarEvents(input, options)   rows from the account -> IcsEvent[] + counts per kind
 *   buildIcsCalendar(events, { now })       the file text
 */
import { appointmentEnd, appointmentIcsFields } from '../leads/appointmentLogic.ts';
import { isOpenStage } from '../leads/leadLogic.ts';
import type { Appointment, Lead } from '../leads/leadTypes.ts';
import type { JobTask } from '../tasks/taskTypes.ts';
import { documentTotals, isBilledInvoiceStatus, isPaidStatus, type FinanceDoc } from '../finance.ts';
import { normalizeYMD, toLocalYMD } from '../../utils/localDates.ts';

export const ICS_PRODID = '-//ContractorDocs//Calendar file//EN';
export const ICS_DOMAIN = 'contractordocs.app';
export const ICS_CALENDAR_NAME = 'ContractorDocs';
/** Longest a content line may be before it is folded (octets, without the CRLF). */
export const ICS_LINE_OCTETS = 75;

// ======================================================================================================== text, dates
const utf8 = new TextEncoder();
const octets = (s: string): number => utf8.encode(s).length;

/** TEXT value escaping (RFC 5545 3.3.11). Control characters other than tab and line breaks are removed. */
export const icsEscapeText = (value: unknown): string =>
    String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');

/**
 * Folds one content line so no physical line is longer than `limit` octets: the first line holds `limit` octets, every
 * continuation line starts with one space plus `limit - 1` octets. Characters are never split (not even emoji).
 */
export const icsFoldLine = (line: string, limit = ICS_LINE_OCTETS): string => {
    if (octets(line) <= limit) return line;
    const parts: string[] = [];
    let cur = '';
    let used = 0;
    let max = limit;
    for (const ch of line) {
        const size = octets(ch);
        if (used + size > max) { parts.push(cur); cur = ''; used = 0; max = limit - 1; }
        cur += ch;
        used += size;
    }
    parts.push(cur);
    return parts.join('\r\n ');
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const isYmdString = (v: unknown): v is string => {
    if (typeof v !== 'string' || !YMD.test(v)) return false;
    const [y, m, d] = v.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** "2026-11-30" + 2 -> "2026-12-02" (calendar arithmetic, no time zone involved). */
export const addDaysYmd = (ymd: string, days: number): string => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Date -> "20261116T143000Z" (UTC). */
export const icsDateTimeUtc = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** "2026-11-16" -> "20261116". */
export const icsDateValue = (ymd: string): string => ymd.replace(/-/g, '');

// ============================================================================================================== events
interface EventBase {
    /** stable id: the same item always gets the same UID, so a newer file updates it */
    uid: string;
    summary: string;
    description?: string;
    location?: string;
    categories?: string[];
    status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
}
/** Happens at a time of day: written as UTC instants. */
export interface IcsTimedEvent extends EventBase { kind: 'timed'; start: Date; end: Date }
/** Belongs to calendar days: written as dates. `endYmd` is the LAST day (inclusive); omitted = a one-day event. */
export interface IcsAllDayEvent extends EventBase { kind: 'allday'; startYmd: string; endYmd?: string }
export type IcsEvent = IcsTimedEvent | IcsAllDayEvent;

const MS_HOUR = 3_600_000;

const eventStartKey = (e: IcsEvent): string => (e.kind === 'timed' ? e.start.toISOString() : `${e.startYmd}T00:00:00.000Z`);

/** The lines of one VEVENT (unfolded). Returns [] for an event with an unusable date. */
export const icsEventLines = (e: IcsEvent, stamp: string): string[] => {
    const lines: string[] = ['BEGIN:VEVENT', `UID:${String(e.uid).replace(/[\r\n]/g, '')}`, `DTSTAMP:${stamp}`];
    if (e.kind === 'timed') {
        if (!(e.start instanceof Date) || Number.isNaN(e.start.getTime())) return [];
        const end = e.end instanceof Date && !Number.isNaN(e.end.getTime()) && e.end.getTime() > e.start.getTime() ? e.end : new Date(e.start.getTime() + MS_HOUR);
        lines.push(`DTSTART:${icsDateTimeUtc(e.start)}`, `DTEND:${icsDateTimeUtc(end)}`);
    } else {
        if (!isYmdString(e.startYmd)) return [];
        const last = e.endYmd && isYmdString(e.endYmd) && e.endYmd >= e.startYmd ? e.endYmd : e.startYmd;
        lines.push(`DTSTART;VALUE=DATE:${icsDateValue(e.startYmd)}`, `DTEND;VALUE=DATE:${icsDateValue(addDaysYmd(last, 1))}`);
    }
    lines.push(`SUMMARY:${icsEscapeText(e.summary || 'Untitled')}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscapeText(e.location)}`);
    if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(icsEscapeText).join(',')}`);
    lines.push(`STATUS:${e.status || 'CONFIRMED'}`, `TRANSP:${e.kind === 'timed' ? 'OPAQUE' : 'TRANSPARENT'}`, 'END:VEVENT');
    return lines;
};

/**
 * The whole file. Events are sorted by start and then summary (the same input always gives the same file) and an event
 * whose UID was already used is dropped.
 */
export const buildIcsCalendar = (events: readonly IcsEvent[], opts: { now?: Date; name?: string } = {}): string => {
    const stamp = icsDateTimeUtc(opts.now ?? new Date());
    const lines: string[] = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${ICS_PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        `X-WR-CALNAME:${icsEscapeText(opts.name || ICS_CALENDAR_NAME)}`,
    ];
    const seen = new Set<string>();
    // events with an unusable date are dropped BEFORE sorting (sorting reads their dates)
    const usable = events.filter((e) => icsEventLines(e, stamp).length > 0);
    const sorted = [...usable].sort((a, b) => eventStartKey(a).localeCompare(eventStartKey(b)) || a.summary.localeCompare(b.summary) || a.uid.localeCompare(b.uid));
    for (const e of sorted) {
        if (seen.has(e.uid)) continue;
        seen.add(e.uid);
        lines.push(...icsEventLines(e, stamp));
    }
    lines.push('END:VCALENDAR');
    return `${lines.map((l) => icsFoldLine(l)).join('\r\n')}\r\n`;
};

// ====================================================================================================== from the account
export interface CalendarJobRow {
    id: string; name?: string | null; clientName?: string | null; clientAddress?: string | null;
    startDate?: string | null; endDate?: string | null; status?: string | null; workerName?: string | null;
}
export interface CalendarDocRow {
    id: string; type: string; job_id?: string | null;
    /** the fields the money math needs plus the numbers and due dates (JSON-path select) */
    data: Record<string, any>;
}

export type CalendarKind = 'jobs' | 'appointments' | 'followUps' | 'tasks' | 'dueDates';
export const CALENDAR_KINDS: ReadonlyArray<{ id: CalendarKind; label: string; about: string; /** [one, many] for "3 jobs" */ nouns: readonly [string, string] }> = [
    { id: 'jobs', label: 'Jobs', nouns: ['job', 'jobs'], about: 'start and end dates of jobs that are active or paused' },
    { id: 'appointments', label: 'Appointments', nouns: ['appointment', 'appointments'], about: 'site visits, estimate meetings and calls with a time' },
    { id: 'followUps', label: 'Lead follow-ups', nouns: ['lead follow-up', 'lead follow-ups'], about: 'the day to call back an open lead' },
    { id: 'tasks', label: 'Task due dates', nouns: ['task due date', 'task due dates'], about: 'job tasks that are not done yet' },
    { id: 'dueDates', label: 'Invoice, estimate and order dates', nouns: ['invoice, estimate or order date', 'invoice, estimate and order dates'], about: 'unpaid invoices due, estimates that expire, purchase orders to deliver' },
];

export interface CalendarInput {
    jobs?: readonly CalendarJobRow[];
    appointments?: readonly Pick<Appointment, 'id' | 'title' | 'notes' | 'location' | 'startsAt' | 'endsAt' | 'status' | 'kind' | 'leadId'>[];
    leads?: readonly Pick<Lead, 'id' | 'name' | 'phone' | 'email' | 'details' | 'stage' | 'archived' | 'followUpOn'>[];
    tasks?: readonly Pick<JobTask, 'id' | 'title' | 'notes' | 'status' | 'dueDate' | 'jobId'>[];
    documents?: readonly CalendarDocRow[];
}

export interface CalendarOptions {
    /** the owner's local day (YYYY-MM-DD) */
    today: string;
    /** the window is [today, today + days] */
    days: number;
    include: Record<CalendarKind, boolean>;
    /** local calendar day of an instant; default = this device's time zone */
    dayOf?: (d: Date) => string;
    domain?: string;
}

export interface CalendarCollection {
    events: IcsEvent[];
    counts: Record<CalendarKind, number>;
    windowEnd: string;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BUSY_JOB = new Set(['active', 'paused']);

/** A job is "upcoming" when it is active or paused and its dates reach into the window (it may already be running). */
const jobEvent = (j: CalendarJobRow, today: string, windowEnd: string, domain: string): IcsAllDayEvent | null => {
    if (!BUSY_JOB.has(str(j.status).toLowerCase() || 'active')) return null;
    const start = normalizeYMD(j.startDate);
    const end = normalizeYMD(j.endDate);
    const first = start || end;
    if (!first) return null;
    const last = end && end >= first ? end : first;
    if (last < today || first > windowEnd) return null;
    const name = str(j.name) || 'Job';
    return {
        kind: 'allday', uid: `job-${j.id}@${domain}`, startYmd: first, endYmd: last, summary: `Job: ${name}`,
        description: [str(j.clientName) ? `Client: ${str(j.clientName)}` : '', str(j.workerName) ? `Assigned to: ${str(j.workerName)}` : '', start && !end ? 'No end date set.' : ''].filter(Boolean).join('\n'),
        location: str(j.clientAddress) || undefined, categories: ['Job'],
    };
};

const docEvent = (d: CalendarDocRow, today: string, windowEnd: string, domain: string): IcsAllDayEvent | null => {
    const type = str(d.type).toLowerCase();
    const data = d.data || {};
    const status = str(data.status);
    let date: string | null = null;
    let summary = '';
    const lines: string[] = [];
    if (type === 'invoice') {
        if (!isBilledInvoiceStatus(status) || isPaidStatus(status)) return null;
        date = normalizeYMD(data.dueDate);
        const totals = documentTotals({ id: d.id, type: 'Invoice', ...data } as FinanceDoc);
        if (totals.balanceDue <= 0) return null;
        summary = `Invoice ${str(data.invoiceNumber) || '(no number)'} due`;
        lines.push(str(data.clientName) ? `Client: ${str(data.clientName)}` : '', `Balance due: ${usd(totals.balanceDue)}`);
    } else if (type === 'estimate') {
        if (str(status).toLowerCase() !== 'sent') return null;
        date = normalizeYMD(data.expiryDate);
        summary = `Estimate ${str(data.estimateNumber) || '(no number)'} expires`;
        lines.push(str(data.clientName) ? `Client: ${str(data.clientName)}` : '', 'Still waiting for an answer.');
    } else if (type === 'purchase order') {
        if (!['sent', 'confirmed', 'partially delivered'].includes(status.toLowerCase())) return null;
        date = normalizeYMD(data.deliveryDate);
        summary = `Order ${str(data.poNumber) || '(no number)'} delivery`;
        lines.push(str(data.supplier) ? `Supplier: ${str(data.supplier)}` : '');
    }
    if (!date || date < today || date > windowEnd) return null;
    return { kind: 'allday', uid: `doc-${d.id}-due@${domain}`, startYmd: date, summary, description: lines.filter(Boolean).join('\n'), categories: ['Money'] };
};

/**
 * Turns the account's rows into calendar events for the next `days` days. Only what is ticked in `include` is read.
 * Cancelled appointments, finished leads, done tasks and paid invoices are left out.
 */
export const collectCalendarEvents = (input: CalendarInput, opts: CalendarOptions): CalendarCollection => {
    const domain = opts.domain || ICS_DOMAIN;
    const dayOf = opts.dayOf || toLocalYMD;
    const windowEnd = addDaysYmd(opts.today, Math.max(0, Math.round(opts.days)));
    const events: IcsEvent[] = [];
    const counts: Record<CalendarKind, number> = { jobs: 0, appointments: 0, followUps: 0, tasks: 0, dueDates: 0 };
    const add = (kind: CalendarKind, e: IcsEvent | null) => { if (e) { events.push(e); counts[kind]++; } };
    const leadName = new Map((input.leads || []).map((l) => [l.id, l.name]));
    const jobName = new Map((input.jobs || []).map((j) => [j.id, str(j.name)]));

    if (opts.include.jobs) for (const j of input.jobs || []) add('jobs', jobEvent(j, opts.today, windowEnd, domain));

    if (opts.include.appointments) {
        for (const a of input.appointments || []) {
            if (a.status === 'cancelled') continue;
            const start = new Date(a.startsAt);
            if (Number.isNaN(start.getTime())) continue;
            const day = dayOf(start);
            if (day < opts.today || day > windowEnd) continue;
            const f = appointmentIcsFields(a as Appointment, { domain });
            const who = a.leadId ? leadName.get(a.leadId) : '';
            add('appointments', {
                kind: 'timed', uid: f.uid, start, end: appointmentEnd(a),
                summary: f.summary, description: [f.description, who ? `With: ${who}` : ''].filter(Boolean).join('\n'), location: f.location || undefined,
                categories: ['Appointment'], status: 'CONFIRMED',
            });
        }
    }

    if (opts.include.followUps) {
        for (const l of input.leads || []) {
            if (l.archived || !isOpenStage(l.stage) || !l.followUpOn || !isYmdString(l.followUpOn)) continue;
            if (l.followUpOn < opts.today || l.followUpOn > windowEnd) continue;
            add('followUps', {
                kind: 'allday', uid: `followup-${l.id}-${l.followUpOn}@${domain}`, startYmd: l.followUpOn, summary: `Follow up: ${str(l.name) || 'lead'}`,
                description: [str(l.phone) ? `Phone: ${str(l.phone)}` : '', str(l.email) ? `Email: ${str(l.email)}` : '', str(l.details).slice(0, 300)].filter(Boolean).join('\n'),
                categories: ['Lead'],
            });
        }
    }

    if (opts.include.tasks) {
        for (const t of input.tasks || []) {
            if (t.status === 'done' || !t.dueDate || !isYmdString(t.dueDate)) continue;
            if (t.dueDate < opts.today || t.dueDate > windowEnd) continue;
            const job = jobName.get(t.jobId);
            add('tasks', {
                kind: 'allday', uid: `task-${t.id}@${domain}`, startYmd: t.dueDate, summary: `Task due: ${str(t.title) || 'task'}`,
                description: [job ? `Job: ${job}` : '', str(t.notes).slice(0, 300)].filter(Boolean).join('\n'), categories: ['Task'],
            });
        }
    }

    if (opts.include.dueDates) for (const d of input.documents || []) add('dueDates', docEvent(d, opts.today, windowEnd, domain));

    return { events, counts, windowEnd };
};

export const calendarFileName = (today: string, days: number): string => `ContractorDocs-calendar-${today}-next-${days}-days.ics`;

/** Used by the screen: "42 items: 6 jobs, 3 appointments ..." */
export const describeCounts = (c: Record<CalendarKind, number>): string => {
    const total = Object.values(c).reduce((s, n) => s + n, 0);
    if (!total) return 'Nothing in this period';
    const parts = CALENDAR_KINDS.filter((k) => c[k.id]).map((k) => `${c[k.id]} ${k.nouns[c[k.id] === 1 ? 0 : 1]}`);
    return `${total} item${total === 1 ? '' : 's'}: ${parts.join(', ')}`;
};

