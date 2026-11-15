/**
 * Job timeline: the words for days and times (pure, US English like the rest of the app). Days are calendar days in the
 * user's time zone; a time is shown in that zone too.
 */
import { addDays, safeTimezone, toYmd } from '../../supabase/functions/reminders/shared/schedule.ts';

const parts = (ymd: string): [number, number, number] | null => {
    const day = toYmd(ymd);
    if (!day) return null;
    const [y, m, d] = day.split('-').map(Number);
    return [y, m, d];
};

/** "Mon, Nov 3" (with the year when it is not `thisYear`: "Mon, Nov 3, 2025"). */
export const shortDate = (ymd: string, thisYear?: number): string => {
    const p = parts(ymd);
    if (!p) return ymd;
    const withYear = thisYear !== undefined && p[0] !== thisYear;
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
        .format(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)));
};

/** The sticky header of a day: "Today", "Yesterday", else "Mon, Nov 3". */
export const dayLabel = (ymd: string, today: string): string => {
    if (ymd === today) return 'Today';
    if (ymd === addDays(today, -1)) return 'Yesterday';
    return shortDate(ymd, Number(today.slice(0, 4)) || undefined);
};

/** "3:42 PM" in the time zone. */
export const timeLabel = (iso: string, tz: string): string => {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: safeTimezone(tz), hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
};

/** "Mon, Nov 3, 3:42 PM" for a tooltip. */
export const stamp = (iso: string, tz: string): string => {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: safeTimezone(tz), weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
};

/** Titles name a day without "today" so they read the same tomorrow: "Daily report for Mon, Nov 3". */
export const dayHeading = (ymd: string, today: string): string => shortDate(ymd, Number(today.slice(0, 4)) || undefined);
