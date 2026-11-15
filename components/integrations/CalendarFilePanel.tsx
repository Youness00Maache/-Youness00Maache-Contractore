/**
 * Settings > Integrations & data > Calendar: "Download calendar file". The owner's upcoming jobs, appointments, lead
 * follow-ups, task due dates and invoice / estimate / order dates as one standard .ics file for Google, Apple or
 * Outlook Calendar. It is a SNAPSHOT (there is no server address to subscribe to), and the screen says so.
 * Logic and file format: lib/integrations/icsCalendar.ts. Reads only; nothing is written to the account.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DownloadIcon } from '../Icons.tsx';
import { errorText } from '../../lib/offline/connection.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { CALENDAR_KINDS, buildIcsCalendar, calendarFileName, collectCalendarEvents, describeCounts, type CalendarKind } from '../../lib/integrations/icsCalendar.ts';
import { downloadTextFile, loadCalendarSource, type CalendarSource } from '../../lib/integrations/integrationsApi.ts';
import { Group, Note, Segmented, Spinner, cx } from './ui.tsx';

const PERIODS = [
    { value: '30', text: '30 days' },
    { value: '90', text: '90 days' },
    { value: '365', text: 'A year' },
] as const;
const ALL_ON: Record<CalendarKind, boolean> = { jobs: true, appointments: true, followUps: true, tasks: true, dueDates: true };
const UNAVAILABLE_TEXT: Record<string, string> = {
    jobs: 'Jobs could not be read.', appointments: 'Appointments are not available on this account yet.', 'lead follow-ups': 'Leads are not available on this account yet.',
    tasks: 'Tasks are not available on this account yet.', 'invoice and estimate dates': 'Invoice and estimate dates could not be read.',
};

const CalendarFilePanel: React.FC<{ userId: string }> = ({ userId }) => {
    const today = useMemo(() => todayYMD(), []);
    const [days, setDays] = useState(90);
    const [include, setInclude] = useState<Record<CalendarKind, boolean>>(ALL_ON);
    const [source, setSource] = useState<CalendarSource | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // one read for the longest period; the period and the ticks are then applied here, so changing them is instant
            setSource(await loadCalendarSource(userId, { today, days: 365, include: ALL_ON }));
        } catch (e) {
            setError(errorText(e, 'Your calendar items could not be read. Check your connection and try again.'));
        } finally {
            setLoading(false);
        }
    }, [userId, today]);
    useEffect(() => { void load(); }, [load]);

    // every kind counted on its own for this period (so each tick shows its own number), then what is ticked
    const perKind = useMemo(() => (source ? collectCalendarEvents(source.input, { today, days, include: ALL_ON }).counts : null), [source, today, days]);
    const chosen = useMemo(() => (source ? collectCalendarEvents(source.input, { today, days, include }) : null), [source, today, days, include]);
    const total = chosen ? chosen.events.length : 0;

    const download = () => {
        if (!chosen || !total) return;
        downloadTextFile(buildIcsCalendar(chosen.events, { now: new Date() }), calendarFileName(today, days), 'text/calendar;charset=utf-8');
        setSaved(`Saved ${describeCounts(chosen.counts)}.`);
    };

    return (
        <div className="space-y-5 pt-4">
            <p className="text-sm text-muted-foreground">
                Take your schedule to your phone’s calendar. This is a <span className="font-medium text-foreground">snapshot</span>: it does not update by itself,
                so download it again when your jobs change.
            </p>

            <Group label="Which days">
                <Segmented label="Period" value={String(days)} options={PERIODS} onChange={(v) => { setDays(Number(v)); setSaved(null); }} />
                <p className="mt-1.5 text-xs text-muted-foreground">From today, {today}, to {chosen?.windowEnd || '…'}.</p>
            </Group>

            <Group label="What to include">
                <ul className="divide-y divide-border rounded-xl border border-border">
                    {CALENDAR_KINDS.map((k) => (
                        <li key={k.id}>
                            <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3 py-2">
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                                    checked={include[k.id]}
                                    onChange={() => { setInclude((p) => ({ ...p, [k.id]: !p[k.id] })); setSaved(null); }}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-foreground">{k.label}</span>
                                    <span className="block text-xs text-muted-foreground">{k.about}</span>
                                </span>
                                <span className={cx('shrink-0 text-sm font-semibold tabular-nums', perKind && perKind[k.id] ? 'text-foreground' : 'text-muted-foreground')}>
                                    {loading ? '…' : perKind ? perKind[k.id] : '–'}
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>
            </Group>

            {error && (
                <div role="alert" className="flex flex-col gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>{error}</span>
                    <button type="button" className="btn btn-sm btn-outline min-h-[36px] self-start sm:self-auto" onClick={() => { void load(); }}>Try again</button>
                </div>
            )}
            {source && source.unavailable.length > 0 && (
                <Note tone="warn">{source.unavailable.map((u) => UNAVAILABLE_TEXT[u] || `${u} could not be read.`).join(' ')} They are left out of the file.</Note>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button type="button" className="btn btn-primary min-h-[44px]" onClick={download} disabled={loading || !total}>
                    {loading ? <Spinner /> : <DownloadIcon className="h-4 w-4" />} Download calendar file
                </button>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                    {loading ? 'Reading your jobs and dates…' : chosen ? describeCounts(chosen.counts) : ''}
                </p>
            </div>
            {saved && <p role="status" className="text-sm font-medium text-foreground">{saved} Open it with your calendar app.</p>}

            <div>
                <h4 className="text-sm font-semibold text-foreground">Add it to your calendar</h4>
                <ol className="mt-2 space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-3"><span className="w-4 shrink-0 font-mono font-bold text-foreground">1</span><span>Download the file above.</span></li>
                    <li className="flex gap-3">
                        <span className="w-4 shrink-0 font-mono font-bold text-foreground">2</span>
                        <span>
                            <span className="font-medium text-foreground">Google Calendar:</span> Settings, Import &amp; export, Import.{' '}
                            <span className="font-medium text-foreground">Apple:</span> open the file and tap Add All.{' '}
                            <span className="font-medium text-foreground">Outlook:</span> Add calendar, Upload from file.
                        </span>
                    </li>
                    <li className="flex gap-3"><span className="w-4 shrink-0 font-mono font-bold text-foreground">3</span><span>Choose the calendar to put it in. A new calendar of its own is easiest to clear later.</span></li>
                </ol>
                <Note className="mt-3">
                    Appointments keep their time in your time zone. Jobs, follow-ups and due dates are whole-day items. Every item keeps the same ID in the file, so Google and
                    Apple Calendar usually update it when you import a newer file; if you see doubles, delete the old calendar first.
                </Note>
            </div>
        </div>
    );
};

export default CalendarFilePanel;
