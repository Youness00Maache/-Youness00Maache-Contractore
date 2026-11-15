/**
 * Small shared pieces of the Leads screens: stage accents, the follow-up pill, file download and the plan note text.
 * Colours are the app's tokens plus the same slate / sky / violet accents the pipeline board uses, so both boards
 * read as one family.
 */
import React from 'react';
import { toast } from '../Toast.tsx';
import { appointmentToIcs } from '../../lib/leads/appointmentLogic.ts';
import type { Appointment, Lead, LeadStage } from '../../lib/leads/leadTypes.ts';
import { icsFileName, type FollowUpText } from '../../lib/leads/leadViewLogic.ts';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** Stage accents: a bar colour (board column, tab dot) and a text colour. Readable in light and dark. */
export const LEAD_STAGE_STYLE: Record<LeadStage, { bar: string; text: string }> = {
    new: { bar: 'bg-slate-400 dark:bg-slate-500', text: 'text-slate-600 dark:text-slate-300' },
    contacted: { bar: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
    appointment_set: { bar: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
    quote_sent: { bar: 'bg-primary', text: 'text-primary' },
    won: { bar: 'bg-success', text: 'text-success' },
    lost: { bar: 'bg-destructive/70', text: 'text-destructive' },
};

export const LEADS_PREMIUM_REASON = 'Lead insights (win rate, where your leads come from) and quiet-lead reminders are part of Premium.';

const TONE_TEXT: Record<FollowUpText['tone'], string> = {
    none: 'text-muted-foreground',
    upcoming: 'text-muted-foreground',
    today: 'text-warning',
    overdue: 'text-destructive',
};

/** "Today" / "2 d late" / "Nov 20" with a dot that is red when late and amber when due today. */
export const FollowUpPill: React.FC<{ text: FollowUpText; className?: string }> = ({ text, className = '' }) => {
    if (!text.short) return null;
    const hot = text.tone === 'today' || text.tone === 'overdue';
    return (
        <span className={cx('inline-flex items-center gap-1 whitespace-nowrap font-semibold', TONE_TEXT[text.tone], className)} title={text.long}>
            <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', hot ? 'bg-current' : 'border border-current')} aria-hidden />
            <span className="sr-only">Follow-up: </span>
            {text.short}
        </span>
    );
};

/** Saves text as a file (the browser's own download; nothing leaves the device). */
export const downloadTextFile = (fileName: string, text: string, mime: string): void => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** Saves the appointment as an .ics file the device's calendar opens (the contact goes in the description). */
export const addToMyCalendar = (appt: Appointment, lead: Pick<Lead, 'name' | 'phone' | 'email'> | null): void => {
    const contact = lead ? [lead.name, lead.phone, lead.email].filter(Boolean).join(' · ') : '';
    downloadTextFile(icsFileName(appt), appointmentToIcs(appt, { contactLine: contact }), 'text/calendar;charset=utf-8');
    toast.success('Calendar file saved. Open it to add the appointment to your calendar.');
};
