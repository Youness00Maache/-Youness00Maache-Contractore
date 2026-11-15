/**
 * Appointments of one lead (inside the lead window): the list with Done / No-show / Cancel / "Add to my calendar",
 * and the "Book appointment" form (type, day, time, how long, where, notes) with a warning when it overlaps another
 * appointment. Booking moves a new or contacted lead to "Appointment set" (stageAfterAppointment).
 * "Add to my calendar" downloads an .ics file the phone's or computer's calendar opens (nothing is sent anywhere).
 */
import React, { useState } from 'react';
import { Field } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { CalendarIcon, PlusIcon } from '../Icons.tsx';
import { describeError } from '../../lib/account.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { cancelAppointment, createAppointment, deleteAppointment, moveLeadStage, setAppointmentStatus } from '../../lib/leads/leadsApi.ts';
import { patchAppointment, patchLead, removeAppointment } from '../../lib/leads/leadsStore.ts';
import { stageAfterAppointment } from '../../lib/leads/leadLogic.ts';
import {
    APPOINTMENT_KIND_LABELS, APPOINTMENT_STATUS_LABELS, conflictsFor, isPastAppointment,
} from '../../lib/leads/appointmentLogic.ts';
import {
    APPOINTMENT_DURATIONS, appointmentFormToDraft, appointmentTitleFor, appointmentWhenLabel, defaultAppointmentForm,
    type AppointmentFormValues,
} from '../../lib/leads/leadViewLogic.ts';
import { APPOINTMENT_KINDS, APPOINTMENT_LIMITS, type Appointment, type AppointmentKind, type Lead } from '../../lib/leads/leadTypes.ts';
import { addToMyCalendar, cx } from './leadUi.tsx';

const BookForm: React.FC<{
    lead: Lead;
    userId: string;
    allAppointments: readonly Appointment[];
    onDone: () => void;
}> = ({ lead, userId, allAppointments, onDone }) => {
    const [form, setForm] = useState<AppointmentFormValues>(() => defaultAppointmentForm(lead, todayYMD()));
    const [titleTouched, setTitleTouched] = useState(false);
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState<Record<string, string | undefined>>({});
    const set = (patch: Partial<AppointmentFormValues>) => setForm(f => ({ ...f, ...patch }));

    const { draft } = appointmentFormToDraft(form, lead);
    const conflicts = draft ? conflictsFor({ startsAt: draft.startsAt, endsAt: draft.endsAt ?? null }, allAppointments) : [];

    const save = async () => {
        const res = appointmentFormToDraft(form, lead);
        const found = res.errors as Record<string, string | undefined>;
        setErrors(found);
        if (!res.draft || Object.values(found).some(Boolean)) return;
        setBusy(true);
        try {
            const appt = await createAppointment(userId, res.draft);
            patchAppointment(appt);
            const next = stageAfterAppointment(lead.stage);
            if (next) {
                try {
                    patchLead(await moveLeadStage(lead, next));
                } catch {
                    toast.info('The appointment is booked, but the lead could not be moved to Appointment set.');
                }
            }
            toast.success('Appointment booked.');
            onDone();
        } catch (e) {
            setErrors({ form: describeError(e, 'The appointment could not be saved.') });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-4" data-testid="book-appointment">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Field label="Type" htmlFor="appt-kind" className="col-span-2 sm:col-span-1">
                    <select
                        id="appt-kind"
                        className="input"
                        value={form.kind}
                        disabled={busy}
                        onChange={e => {
                            const kind = e.target.value as AppointmentKind;
                            set({ kind, ...(titleTouched ? {} : { title: appointmentTitleFor(kind, lead.name) }) });
                        }}
                    >
                        {APPOINTMENT_KINDS.map(k => <option key={k} value={k}>{APPOINTMENT_KIND_LABELS[k]}</option>)}
                    </select>
                </Field>
                <Field label="Title" htmlFor="appt-title" error={errors.title} className="col-span-2 sm:col-span-1">
                    <input id="appt-title" className="input" value={form.title} maxLength={APPOINTMENT_LIMITS.title} disabled={busy} onChange={e => { setTitleTouched(true); set({ title: e.target.value }); }} />
                </Field>
                <Field label="Day" htmlFor="appt-date" error={errors.startsAt} className="col-span-1">
                    <input id="appt-date" type="date" className="input" value={form.date} disabled={busy} onChange={e => set({ date: e.target.value })} />
                </Field>
                <Field label="Time" htmlFor="appt-time" className="col-span-1">
                    <input id="appt-time" type="time" className="input" value={form.time} disabled={busy} onChange={e => set({ time: e.target.value })} />
                </Field>
                <Field label="How long" htmlFor="appt-duration" error={errors.endsAt} className="col-span-2 sm:col-span-1">
                    <select id="appt-duration" className="input" value={form.durationMinutes} disabled={busy} onChange={e => set({ durationMinutes: Number(e.target.value) })}>
                        {APPOINTMENT_DURATIONS.map(d => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
                    </select>
                </Field>
                <Field label="Where" htmlFor="appt-location" error={errors.location} className="col-span-2 sm:col-span-1">
                    <input id="appt-location" className="input" value={form.location} maxLength={APPOINTMENT_LIMITS.location} disabled={busy} onChange={e => set({ location: e.target.value })} placeholder="Address or phone" />
                </Field>
                <Field label="Notes" htmlFor="appt-notes" error={errors.notes} className="col-span-2">
                    <textarea id="appt-notes" className="input min-h-[3.5rem]" rows={2} value={form.notes} maxLength={APPOINTMENT_LIMITS.notes} disabled={busy} onChange={e => set({ notes: e.target.value })} />
                </Field>
            </div>
            {conflicts.length > 0 && (
                <p role="status" className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground" data-testid="appointment-overlap">
                    This overlaps {conflicts.length === 1 ? 'another appointment' : `${conflicts.length} other appointments`}:{' '}
                    {conflicts.slice(0, 3).map(c => `${c.title} (${appointmentWhenLabel(c, todayYMD())})`).join('; ')}. You can still book it.
                </p>
            )}
            {errors.form && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{errors.form}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Booking…' : 'Book appointment'}</button>
                <button type="button" className="btn btn-outline" onClick={onDone} disabled={busy}>Cancel</button>
            </div>
        </div>
    );
};

const Row: React.FC<{ appt: Appointment; lead: Lead; today: string; busy: boolean; run: (fn: () => Promise<void>) => void }> = ({ appt, lead, today, busy, run }) => {
    const past = isPastAppointment(appt);
    const scheduled = appt.status === 'scheduled';
    return (
        <li className="rounded-xl border border-border bg-card px-3 py-2.5" data-testid="appointment-row">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{appt.title}</p>
                    <p className={cx('text-xs', past ? 'font-semibold text-warning' : 'text-muted-foreground')}>
                        {appointmentWhenLabel(appt, today)}{appt.location ? ` · ${appt.location}` : ''}
                    </p>
                </div>
                <span className={cx('badge shrink-0', appt.status === 'done' ? 'badge-success' : appt.status === 'no_show' ? 'badge-danger' : past ? 'badge-warning' : 'badge-primary')}>
                    {past ? 'Did it happen?' : APPOINTMENT_STATUS_LABELS[appt.status]}
                </span>
            </div>
            {appt.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{appt.notes}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
                {scheduled && (
                    <>
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => addToMyCalendar(appt, lead)}>Add to my calendar</button>
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(async () => { patchAppointment(await setAppointmentStatus(appt.id, 'done')); })}>Done</button>
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(async () => { patchAppointment(await setAppointmentStatus(appt.id, 'no_show')); })}>No-show</button>
                        <button type="button" className="btn btn-ghost btn-sm text-destructive" disabled={busy} onClick={() => run(async () => { patchAppointment(await cancelAppointment(appt.id)); toast.success('Appointment cancelled.'); })}>Cancel</button>
                    </>
                )}
                {!scheduled && (
                    <>
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(async () => { patchAppointment(await setAppointmentStatus(appt.id, 'scheduled')); })}>Back to scheduled</button>
                        <button type="button" className="btn btn-ghost btn-sm text-destructive" disabled={busy} onClick={() => run(async () => { await deleteAppointment(appt.id); removeAppointment(appt.id); })}>Delete</button>
                    </>
                )}
            </div>
        </li>
    );
};

const LeadAppointments: React.FC<{
    lead: Lead;
    userId: string;
    /** this lead's appointments (soonest first) */
    appointments: readonly Appointment[];
    /** every appointment of the account (for the overlap warning) */
    allAppointments: readonly Appointment[];
    /** false: the lead is won / lost: booking stays possible but is not pushed */
    canBook?: boolean;
}> = ({ lead, userId, appointments, allAppointments, canBook = true }) => {
    const [booking, setBooking] = useState(false);
    const [busy, setBusy] = useState(false);
    const today = todayYMD();
    const run = (fn: () => Promise<void>) => {
        setBusy(true);
        fn().catch(e => toast.error(describeError(e))).finally(() => setBusy(false));
    };
    return (
        <section aria-labelledby="lead-appointments-heading">
            <div className="flex items-center justify-between gap-2">
                <h3 id="lead-appointments-heading" className="label !mb-0">Appointments{appointments.length ? ` (${appointments.length})` : ''}</h3>
                {!booking && canBook && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setBooking(true)}><PlusIcon className="h-3.5 w-3.5" /> Book appointment</button>
                )}
            </div>
            {appointments.length === 0 && !booking && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarIcon className="h-4 w-4 shrink-0" /> No visit or call booked yet.</p>
            )}
            {appointments.length > 0 && (
                <ul className="mt-2 space-y-2">
                    {appointments.map(a => <Row key={a.id} appt={a} lead={lead} today={today} busy={busy} run={run} />)}
                </ul>
            )}
            {booking && <BookForm lead={lead} userId={userId} allAppointments={allAppointments} onDone={() => setBooking(false)} />}
        </section>
    );
};

export default LeadAppointments;
