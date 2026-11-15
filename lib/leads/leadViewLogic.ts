/**
 * Leads screen + calendar (roadmap D1 phase B): the pure helpers behind the UI. No React, no Supabase.
 * Tested by scripts/leads-check.ts. Stage / follow-up / appointment rules live in leadLogic.ts and appointmentLogic.ts;
 * this file only shapes them for the screens.
 *
 * Dates
 *   addDaysYmd(ymd, n)                       YYYY-MM-DD plus n days (local calendar)
 *   followUpChips(today)                     the quick follow-up buttons: Tomorrow / In 3 days / Next week
 *   followUpText(lead, today, locale?)       { tone, short, long } for the follow-up date of a lead
 *   shortAge(iso, now)                       "today", "3 d", "2 mo"
 * Board + list
 *   LeadFilters, filterLeads(leads, filters, today)
 *   leadSourceOptions(leads)                 origins present, most leads first (for the source filter)
 *   leadBoardColumns(leads, { showArchived })  columns by stage; archived leads still in an open stage are held back
 *   sortBoardColumn(stage, leads, today)     follow-ups due first, then newest (Won / Lost: latest change first)
 *   leadsDueCount(leads, today)              open leads whose follow-up is today or earlier (the nav badge)
 *   leadInsights(leads, now)                 win rate, open total, quiet leads, top sources (the Premium strip)
 * Appointments
 *   AppointmentFormValues, APPOINTMENT_DURATIONS, defaultAppointmentForm(lead, today)
 *   appointmentTitleFor(kind, leadName)
 *   localDateTimeToDate(date, time)          Date | null
 *   appointmentFormToDraft(form, lead)       { draft, errors }  (errors {} = fine)
 *   appointmentWhenLabel(appt, today, locale?)   "Tomorrow · 9:00 AM – 10:00 AM"
 *   icsFileName(appt)                        "site-visit-ann-2026-11-17.ics"
 * Calendar
 *   leadAgenda(items, monthStart, monthEnd)  late follow-ups, then the month's items grouped by day
 * Files
 *   formatFileSize(bytes), attachmentKind(attachment)
 */
import {
    followUpState, isOpenStage, isStaleLead, isYmd, leadPipelineSummary, leadSourcesSummary, leadWinRate, localYmd,
    needsFollowUp, overdueFollowUps, searchLeads, ymdDiff, daysSince,
    type FollowUpState, type LeadSourceSummary,
} from './leadLogic.ts';
import { APPOINTMENT_KIND_LABELS, appointmentTimeLabel, validateAppointmentDraft, type AppointmentErrors } from './appointmentLogic.ts';
import {
    APPOINTMENT_LIMITS, LEAD_STAGES,
    type Appointment, type AppointmentDraft, type AppointmentKind, type Lead, type LeadAttachment, type LeadCalendarItem, type LeadOrigin, type LeadStage,
} from './leadTypes.ts';

// ------------------------------------------------------------------------------------------------ dates
export const addDaysYmd = (ymd: string, days: number): string => {
    const [y, m, d] = ymd.split('-').map(Number);
    return localYmd(new Date(y, m - 1, d + days));
};

export interface FollowUpChip { id: 'tomorrow' | 'in_3_days' | 'next_week'; label: string; ymd: string }

export const followUpChips = (today: string): FollowUpChip[] => [
    { id: 'tomorrow', label: 'Tomorrow', ymd: addDaysYmd(today, 1) },
    { id: 'in_3_days', label: 'In 3 days', ymd: addDaysYmd(today, 3) },
    { id: 'next_week', label: 'Next week', ymd: addDaysYmd(today, 7) },
];

const dayText = (ymd: string, today: string, locale?: string): string => {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const sameYear = ymd.slice(0, 4) === today.slice(0, 4);
    try {
        return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
    } catch {
        return ymd;
    }
};

export interface FollowUpText { tone: FollowUpState; /** for a card: "Today", "2 d late", "Nov 20" */ short: string; /** for the detail: "Follow up was due 2 days ago" */ long: string }

export const followUpText = (
    lead: Pick<Lead, 'followUpOn' | 'stage' | 'archived'>, today: string, locale?: string,
): FollowUpText => {
    const tone = followUpState(lead, today);
    const ymd = lead.followUpOn;
    if (tone === 'none' || !ymd) {
        // a follow-up date on a won / lost lead is still shown, but quietly
        if (ymd && isYmd(ymd)) {
            const label = dayText(ymd, today, locale);
            return { tone: 'none', short: label, long: `Follow-up date: ${label}` };
        }
        return { tone: 'none', short: '', long: '' };
    }
    const diff = ymdDiff(today, ymd); // > 0 in the future
    if (tone === 'overdue') {
        const late = -diff;
        return {
            tone,
            short: late === 1 ? 'Yesterday' : `${late} d late`,
            long: late === 1 ? 'Follow-up was due yesterday' : `Follow-up was due ${late} days ago`,
        };
    }
    if (tone === 'today') return { tone, short: 'Today', long: 'Follow up today' };
    if (diff === 1) return { tone, short: 'Tomorrow', long: 'Follow up tomorrow' };
    const label = dayText(ymd, today, locale);
    return { tone, short: diff <= 6 ? label.split(',')[0] : label.replace(/^\w+,\s*/, ''), long: diff <= 14 ? `Follow up in ${diff} days (${label})` : `Follow up on ${label}` };
};

/** "today", "3 d", "2 mo": time since an ISO moment. */
export const shortAge = (iso: string | null | undefined, now: number | Date = Date.now()): string => {
    const days = daysSince(iso, now);
    if (days === null) return '';
    if (days < 1) return 'today';
    if (days < 60) return `${days} d`;
    if (days < 365) return `${Math.floor(days / 30)} mo`;
    return `${Math.floor(days / 365)} y`;
};

// ------------------------------------------------------------------------------------------------ filters
export interface LeadFilters { query: string; origin: LeadOrigin | 'all'; needsFollowUp: boolean }
export const NO_LEAD_FILTERS: LeadFilters = { query: '', origin: 'all', needsFollowUp: false };

export const filterLeads = (leads: readonly Lead[], f: LeadFilters, today: string): Lead[] => {
    let list = searchLeads(leads, f.query);
    if (f.origin !== 'all') list = list.filter(l => l.origin === f.origin);
    if (f.needsFollowUp) list = list.filter(l => needsFollowUp(l, today));
    return list;
};

export const isFiltering = (f: LeadFilters): boolean => f.query.trim() !== '' || f.origin !== 'all' || f.needsFollowUp;

export interface LeadSourceOption { origin: LeadOrigin; label: string; count: number }

export const leadSourceOptions = (leads: readonly Lead[]): LeadSourceOption[] =>
    leadSourcesSummary(leads).map(s => ({ origin: s.origin, label: s.label, count: s.count }));

// ------------------------------------------------------------------------------------------------ board
export interface LeadBoardColumns {
    columns: Record<LeadStage, Lead[]>;
    /** archived leads that were still in an open stage: left out of the board unless showArchived */
    archived: Lead[];
}

/**
 * Columns by stage. A lost lead is archived by the app (the old inbox's Archive), so lost / won leads always show;
 * only an archived lead that is still in an open stage (dismissed from the old inbox with an explicit stage) is held back.
 */
export const leadBoardColumns = (leads: readonly Lead[], opts: { showArchived?: boolean } = {}): LeadBoardColumns => {
    const columns = Object.fromEntries(LEAD_STAGES.map(s => [s, [] as Lead[]])) as Record<LeadStage, Lead[]>;
    const archived: Lead[] = [];
    for (const lead of leads) {
        if (lead.archived && isOpenStage(lead.stage)) {
            archived.push(lead);
            if (!opts.showArchived) continue;
        }
        columns[lead.stage]?.push(lead);
    }
    return { columns, archived };
};

const timeOf = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() || 0 : 0);

export const sortBoardColumn = (stage: LeadStage, leads: readonly Lead[], today: string): Lead[] => {
    if (!isOpenStage(stage)) {
        return [...leads].sort((a, b) => timeOf(b.stageChangedAt || b.createdAt) - timeOf(a.stageChangedAt || a.createdAt));
    }
    const due = leads.filter(l => needsFollowUp(l, today)).sort((a, b) => String(a.followUpOn).localeCompare(String(b.followUpOn)));
    const rest = leads.filter(l => !needsFollowUp(l, today)).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
    return [...due, ...rest];
};

/** Open leads whose follow-up is today or earlier. */
export const leadsDueCount = (leads: readonly Lead[], today: string): number => overdueFollowUps(leads, today).length;

// ------------------------------------------------------------------------------------------------ insights (Premium)
export interface LeadInsights {
    winRate: number | null;
    won: number;
    lost: number;
    openCount: number;
    openBudget: number;
    /** open leads with nothing happening for a week */
    stale: Lead[];
    sources: LeadSourceSummary[];
}

export const leadInsights = (leads: readonly Lead[], now: number | Date = Date.now(), topSources = 4): LeadInsights => {
    const summary = leadPipelineSummary(leads);
    return {
        winRate: leadWinRate(leads),
        won: summary.wonCount,
        lost: summary.lostCount,
        openCount: summary.openCount,
        openBudget: summary.openBudget,
        stale: leads.filter(l => isStaleLead(l, now)),
        sources: leadSourcesSummary(leads).slice(0, topSources),
    };
};

// ------------------------------------------------------------------------------------------------ appointments
export const APPOINTMENT_DURATIONS: ReadonlyArray<{ minutes: number; label: string }> = [
    { minutes: 30, label: '30 minutes' },
    { minutes: 60, label: '1 hour' },
    { minutes: 90, label: '1.5 hours' },
    { minutes: 120, label: '2 hours' },
    { minutes: 180, label: '3 hours' },
    { minutes: 240, label: 'Half a day' },
    { minutes: 480, label: 'All day' },
];

export interface AppointmentFormValues {
    kind: AppointmentKind;
    title: string;
    /** YYYY-MM-DD */
    date: string;
    /** HH:MM (24 h) */
    time: string;
    durationMinutes: number;
    location: string;
    notes: string;
}

export const appointmentTitleFor = (kind: AppointmentKind, leadName: string): string =>
    `${APPOINTMENT_KIND_LABELS[kind] ?? 'Appointment'}: ${leadName}`.slice(0, APPOINTMENT_LIMITS.title);

/** One line of an address, for the appointment's location. */
const oneLine = (s: string): string => s.replace(/\s*\r?\n\s*/g, ', ').trim().slice(0, APPOINTMENT_LIMITS.location);

/** A site visit tomorrow at 9:00, at the lead's address. */
export const defaultAppointmentForm = (lead: Pick<Lead, 'name' | 'address'>, today: string): AppointmentFormValues => ({
    kind: 'site_visit',
    title: appointmentTitleFor('site_visit', lead.name),
    date: addDaysYmd(today, 1),
    time: '09:00',
    durationMinutes: APPOINTMENT_LIMITS.defaultMinutes,
    location: oneLine(lead.address || ''),
    notes: '',
});

export const localDateTimeToDate = (date: string, time: string): Date | null => {
    if (!isYmd(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    if (hh > 23 || mm > 59) return null;
    const out = new Date(y, m - 1, d, hh, mm, 0, 0);
    return Number.isFinite(out.getTime()) ? out : null;
};

export const appointmentFormToDraft = (
    form: AppointmentFormValues, lead: Pick<Lead, 'id' | 'clientId' | 'jobId'>,
): { draft: AppointmentDraft | null; errors: AppointmentErrors } => {
    const start = localDateTimeToDate(form.date, form.time);
    if (!start) return { draft: null, errors: { startsAt: 'Please pick a date and time.' } };
    const minutes = Math.min(Math.max(1, Math.round(form.durationMinutes || APPOINTMENT_LIMITS.defaultMinutes)), APPOINTMENT_LIMITS.maxDays * 24 * 60);
    const draft: AppointmentDraft = {
        leadId: lead.id,
        clientId: lead.clientId,
        jobId: lead.jobId,
        kind: form.kind,
        title: form.title.trim(),
        notes: form.notes.trim(),
        location: form.location.trim(),
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
    };
    return { draft, errors: validateAppointmentDraft(draft) };
};

const apptDayLabel = (iso: string, today: string, locale?: string): string => {
    const start = new Date(iso);
    if (!Number.isFinite(start.getTime())) return '';
    const ymd = localYmd(start);
    if (ymd === today) return 'Today';
    if (ymd === addDaysYmd(today, 1)) return 'Tomorrow';
    if (ymd === addDaysYmd(today, -1)) return 'Yesterday';
    return dayText(ymd, today, locale);
};

export const appointmentWhenLabel = (
    a: Pick<Appointment, 'startsAt' | 'endsAt'>, today: string, locale?: string,
): string => [apptDayLabel(a.startsAt, today, locale), appointmentTimeLabel(a, locale)].filter(Boolean).join(' · ');

export const icsFileName = (a: Pick<Appointment, 'title' | 'startsAt' | 'kind' | 'endsAt'>): string => {
    const slug = (a.title || APPOINTMENT_KIND_LABELS[a.kind] || 'appointment')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'appointment';
    const start = new Date(a.startsAt);
    const day = Number.isFinite(start.getTime()) ? localYmd(start) : '';
    return `${slug}${day ? `-${day}` : ''}.ics`;
};

// ------------------------------------------------------------------------------------------------ calendar
export interface LeadAgenda {
    /** follow-ups before today (shown first, whatever month is open) */
    late: LeadCalendarItem[];
    days: Array<{ day: string; items: LeadCalendarItem[] }>;
}

export const leadAgenda = (items: readonly LeadCalendarItem[], monthStart: string, monthEnd: string): LeadAgenda => {
    const late = items.filter(i => i.kind === 'follow_up' && i.overdue).sort((a, b) => a.date.localeCompare(b.date));
    const byDay = new Map<string, LeadCalendarItem[]>();
    for (const i of items) {
        if (i.kind === 'follow_up' && i.overdue) continue;
        if (i.date < monthStart || i.date > monthEnd) continue;
        byDay.set(i.date, [...(byDay.get(i.date) || []), i]);
    }
    return { late, days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, items: list })) };
};

// ------------------------------------------------------------------------------------------------ files
export const formatFileSize = (bytes: number): string => {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const attachmentKind = (a: Pick<LeadAttachment, 'type' | 'name'>): 'image' | 'pdf' | 'file' => {
    const type = (a.type || '').toLowerCase();
    const name = (a.name || '').toLowerCase();
    if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic)$/.test(name)) return 'image';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    return 'file';
};
