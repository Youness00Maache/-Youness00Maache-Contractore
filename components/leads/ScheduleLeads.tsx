/**
 * Lead follow-ups and appointments on the Schedule (components/CalendarView.tsx), drawn the same quiet way the job
 * tasks are: a hook that reads them and a few small pieces. Tapping one opens that lead on the Leads screen. Nothing
 * here changes the calendar's own job bars; without the feature (or before the lists are read) the hook returns
 * nothing and the calendar looks as before.
 *   useScheduleLeads(ui)   { items, byDay, appointmentById, leadById }
 *   LeadDayList            "Leads" under the selected day (month view)
 *   LeadChips              one day column of the week view
 *   LeadAgenda             the list view: late follow-ups, then the month's follow-ups and appointments by day
 *   LeadDayMarker          the small pill in a desktop month cell
 * An appointment can be added to the phone's or computer's own calendar (.ics download).
 */
import React, { useMemo } from 'react';
import { CalendarIcon, PhoneIcon } from '../Icons.tsx';
import { useLeadsStore } from '../../lib/leads/leadsStore.ts';
import { calendarItemsOnDay, leadCalendarItems } from '../../lib/leads/appointmentLogic.ts';
import { leadAgenda } from '../../lib/leads/leadViewLogic.ts';
import { localYmd } from '../../lib/leads/leadLogic.ts';
import type { Appointment, Lead, LeadCalendarItem } from '../../lib/leads/leadTypes.ts';
import { addToMyCalendar, cx } from './leadUi.tsx';

export interface LeadsUi {
    userId: string;
    isOnline: boolean;
    onOpenLead: (leadId: string) => void;
}

export interface ScheduleLeadsData {
    items: LeadCalendarItem[];
    byDay: Map<string, { count: number; overdue: boolean }>;
    appointmentById: ReadonlyMap<string, Appointment>;
    leadById: ReadonlyMap<string, Lead>;
}

const NONE: ScheduleLeadsData = { items: [], byDay: new Map(), appointmentById: new Map(), leadById: new Map() };

export function useScheduleLeads(ui: LeadsUi | undefined): ScheduleLeadsData {
    const store = useLeadsStore(ui?.userId, Boolean(ui), ui?.isOnline ?? true);
    const { leads, appointments } = store;
    const today = localYmd(new Date());
    return useMemo(() => {
        if (!ui || !leads || !appointments) return NONE;
        const items = leadCalendarItems({ leads, appointments, today });
        const byDay = new Map<string, { count: number; overdue: boolean }>();
        for (const i of items) {
            const cur = byDay.get(i.date) || { count: 0, overdue: false };
            byDay.set(i.date, { count: cur.count + 1, overdue: cur.overdue || i.overdue });
        }
        return { items, byDay, appointmentById: new Map(appointments.map(a => [a.id, a])), leadById: new Map(leads.map(l => [l.id, l])) };
    }, [ui, leads, appointments, today]);
}

/** Items to draw on one day (late follow-ups also show on today). */
export const leadsOnDay = (items: readonly LeadCalendarItem[], ymd: string, today: string): LeadCalendarItem[] => calendarItemsOnDay(items, ymd, today);

const Glyph: React.FC<{ item: LeadCalendarItem; className?: string }> = ({ item, className = 'h-4 w-4' }) =>
    item.kind === 'appointment' ? <CalendarIcon className={className} /> : <PhoneIcon className={className} />;

const Row: React.FC<{ item: LeadCalendarItem; data: ScheduleLeadsData; onOpen: (leadId: string) => void }> = ({ item, data, onOpen }) => {
    const appt = item.appointmentId ? data.appointmentById.get(item.appointmentId) : undefined;
    const lead = item.leadId ? data.leadById.get(item.leadId) : undefined;
    const body = (
        <>
            <span className={cx('shrink-0', item.overdue ? 'text-destructive' : 'text-sky-600 dark:text-sky-400')}><Glyph item={item} /></span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {item.kind === 'follow_up'
                        ? <><span className={item.overdue ? 'font-semibold text-destructive' : ''}>{item.overdue ? 'Late follow-up' : 'Follow up'}</span>{item.subtitle ? ` · ${item.subtitle}` : ''}</>
                        : <>{item.timeLabel}{item.subtitle ? ` · ${item.subtitle}` : ''}</>}
                </span>
            </span>
        </>
    );
    return (
        <li data-testid="schedule-lead-item">
            {item.leadId ? (
                <button type="button" onClick={() => onOpen(item.leadId as string)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40" aria-label={`Open lead: ${item.title}`}>
                    {body}
                </button>
            ) : (
                <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">{body}</div>
            )}
            {appt && appt.status === 'scheduled' && (
                <button type="button" className="ml-3 mt-1 text-xs font-semibold text-primary hover:underline" onClick={() => addToMyCalendar(appt, lead || null)}>Add to my calendar</button>
            )}
        </li>
    );
};

/** Leads of the selected day. */
export const LeadDayList: React.FC<{ items: readonly LeadCalendarItem[]; data: ScheduleLeadsData; onOpen: (leadId: string) => void }> = ({ items, data, onOpen }) => {
    if (!items.length) return null;
    return (
        <div className="mt-4 border-t border-border pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leads <span className="normal-case tracking-normal">· {items.length}</span></h3>
            <ul className="space-y-1.5">{items.slice(0, 12).map(i => <Row key={i.key} item={i} data={data} onOpen={onOpen} />)}</ul>
            {items.length > 12 && <p className="mt-1.5 px-1 text-xs text-muted-foreground">and {items.length - 12} more on the Leads screen.</p>}
        </div>
    );
};

/** Slim chips under a day's jobs in the week view (a coloured edge, not an outline, so they differ from task chips). */
export const LeadChips: React.FC<{ items: readonly LeadCalendarItem[]; onOpen: (leadId: string) => void }> = ({ items, onOpen }) => {
    if (!items.length) return null;
    return (
        <div className="mt-1.5 space-y-1 border-t border-dashed border-border pt-1.5">
            {items.slice(0, 4).map(i => (
                <button
                    key={i.key}
                    type="button"
                    onClick={() => i.leadId && onOpen(i.leadId)}
                    title={`${i.title}${i.timeLabel ? `, ${i.timeLabel}` : ''}${i.overdue ? ', late' : ''}`}
                    className={cx('flex w-full items-center gap-1.5 truncate rounded-r-sm border-l-2 bg-muted/60 px-1.5 py-1 text-left text-[11px] font-medium', i.overdue ? 'border-destructive text-destructive' : 'border-sky-500 text-foreground')}
                >
                    <Glyph item={i} className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{i.kind === 'appointment' ? `${i.timeLabel.split(' – ')[0]} ${i.title}` : i.title}</span>
                </button>
            ))}
            {items.length > 4 && <p className="px-1 text-[11px] text-muted-foreground">+{items.length - 4} more</p>}
        </div>
    );
};

/** The pill in the top-left of a desktop month cell (col = the day's column, 0-6): one lead opens it, several select the day. */
export const LeadDayMarker: React.FC<{ col: number; items: readonly LeadCalendarItem[]; overdue: boolean; onOpenOne: (leadId: string) => void; onSelectDay: () => void }> = ({ col, items, overdue, onOpenOne, onSelectDay }) => {
    if (!items.length) return null;
    const one = items.length === 1 ? items[0] : null;
    const label = one
        ? (one.kind === 'appointment' ? `${one.timeLabel.split(' – ')[0]} ${one.title.replace(/^[^:]*:\s*/, '')}` : one.title.replace(/^Follow up:\s*/, ''))
        : `${items.length} leads`;
    return (
        <button
            type="button"
            onClick={() => (one?.leadId ? onOpenOne(one.leadId) : onSelectDay())}
            title={one ? one.title : `${items.length} lead follow-ups and appointments`}
            className={cx('absolute flex items-center gap-1 truncate rounded-r-sm border-l-2 bg-muted/70 px-1 text-[11px] font-semibold leading-[1.15rem]', overdue ? 'border-destructive text-destructive' : 'border-sky-500 text-foreground')}
            style={{ top: '0.4rem', left: `calc(${(col / 7) * 100}% + 6px)`, maxWidth: 'calc(100% / 7 - 3.4rem)' }}
        >
            {one ? <Glyph item={one} className="h-2.5 w-2.5 shrink-0" /> : null}
            <span className="truncate">{label}</span>
        </button>
    );
};

/** List view: late follow-ups first, then the month's follow-ups and appointments by day. */
export const LeadAgenda: React.FC<{
    items: readonly LeadCalendarItem[]; data: ScheduleLeadsData; monthStart: string; monthEnd: string; onOpen: (leadId: string) => void; heading: (day: string) => string;
}> = ({ items, data, monthStart, monthEnd, onOpen, heading }) => {
    const agenda = leadAgenda(items, monthStart, monthEnd);
    if (!agenda.late.length && !agenda.days.length) return null;
    return (
        <section aria-label="Leads" className="space-y-4">
            <h2 className="border-b border-border pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leads</h2>
            {agenda.late.length > 0 && (
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-destructive">Late follow-ups</h3>
                    <ul className="space-y-1.5">{agenda.late.slice(0, 20).map(i => <Row key={i.key} item={i} data={data} onOpen={onOpen} />)}</ul>
                </div>
            )}
            {agenda.days.map(d => (
                <div key={d.day}>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">{heading(d.day)}</h3>
                    <ul className="space-y-1.5">{d.items.map(i => <Row key={i.key} item={i} data={data} onOpen={onOpen} />)}</ul>
                </div>
            ))}
        </section>
    );
};
