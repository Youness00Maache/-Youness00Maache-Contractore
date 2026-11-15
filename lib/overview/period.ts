/**
 * Business overview periods (roadmap N3). All days are LOCAL calendar days ("YYYY-MM-DD", see utils/localDates.ts),
 * so a month starts and ends on the owner's own midnight, not on UTC's.
 *
 *   this month    first of the month .. today      (same as Insights' "This month")
 *   last month    first .. last day of the previous month
 *   this quarter  first day of the quarter .. today (same as Insights' "This quarter")
 *   this year     January 1 .. today                (same as Insights' "This year")
 *   last 12 months  the same day a year ago + 1 day .. today (e.g. 2025-11-16 .. 2026-11-15)
 *   custom        two dates typed by the owner
 */
import { addDaysLocal, addMonthsClamped, endOfMonthLocal, parseLocalDate, startOfMonthLocal, toLocalYMD } from '../../utils/localDates.ts';
import { presetRange } from '../../utils/analyticsMath.ts';
import type { DayRange } from './types.ts';

export type OverviewPeriod = 'this-month' | 'last-month' | 'this-quarter' | 'this-year' | 'last-12-months' | 'custom';

export const OVERVIEW_PERIODS: ReadonlyArray<{ value: OverviewPeriod; label: string }> = [
    { value: 'this-month', label: 'This month' },
    { value: 'last-month', label: 'Last month' },
    { value: 'this-quarter', label: 'This quarter' },
    { value: 'this-year', label: 'This year' },
    { value: 'last-12-months', label: 'Last 12 months' },
    { value: 'custom', label: 'Custom dates' },
];

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A valid range: both days real calendar days, start on or before end. */
export const isValidRange = (r: Partial<DayRange> | null | undefined): r is DayRange => {
    if (!r) return false;
    const s = parseLocalDate(r.startYMD ?? null);
    const e = parseLocalDate(r.endYMD ?? null);
    return !!s && !!e && s <= e;
};

/** The day range of a period (null for an invalid custom range). `now` is injectable for tests. */
export const periodRange = (period: OverviewPeriod, now: Date = new Date(), custom?: Partial<DayRange>): DayRange | null => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (period) {
        case 'this-month':
        case 'this-quarter':
        case 'this-year':
            return presetRange(period, now);
        case 'last-month': {
            const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            return { startYMD: toLocalYMD(first), endYMD: toLocalYMD(endOfMonthLocal(first)) };
        }
        case 'last-12-months':
            return { startYMD: toLocalYMD(addDaysLocal(addMonthsClamped(today, -12), 1)), endYMD: toLocalYMD(today) };
        case 'custom':
            return isValidRange(custom) ? { startYMD: custom.startYMD, endYMD: custom.endYMD } : null;
        default:
            return null;
    }
};

/** Does the range cover exactly one whole calendar month? Returns that month's first day, else null. */
const wholeMonth = (r: DayRange): Date | null => {
    const s = parseLocalDate(r.startYMD);
    const e = parseLocalDate(r.endYMD);
    if (!s || !e || s.getDate() !== 1) return null;
    return toLocalYMD(endOfMonthLocal(s)) === toLocalYMD(e) ? startOfMonthLocal(s) : null;
};

/** The label that opens the headline sentence: "March", "Q1 2026", "2026", "Last 12 months", "Mar 3 – Mar 20". */
export const periodLabel = (period: OverviewPeriod, range: DayRange | null, now: Date = new Date()): string => {
    if (!range) return 'No dates chosen';
    const s = parseLocalDate(range.startYMD);
    const e = parseLocalDate(range.endYMD);
    if (!s || !e) return 'No dates chosen';
    const month = (d: Date) => (d.getFullYear() === now.getFullYear() ? MONTHS_LONG[d.getMonth()] : `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`);
    if (period === 'this-month' || period === 'last-month') return month(s);
    if (period === 'this-quarter') return `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}`;
    if (period === 'this-year') return String(s.getFullYear());
    if (period === 'last-12-months') return 'Last 12 months';
    // custom: a whole month / a whole year read as such, anything else as dates
    const m = wholeMonth(range);
    if (m) return month(m);
    if (s.getMonth() === 0 && s.getDate() === 1 && e.getMonth() === 11 && e.getDate() === 31 && s.getFullYear() === e.getFullYear()) return String(s.getFullYear());
    const short = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
    if (s.getFullYear() === e.getFullYear()) return `${short(s)} – ${short(e)}${s.getFullYear() === now.getFullYear() ? '' : `, ${s.getFullYear()}`}`;
    return `${short(s)}, ${s.getFullYear()} – ${short(e)}, ${e.getFullYear()}`;
};

/** "2026-03-01_to_2026-03-31" for file names. */
export const rangeFileTag = (r: DayRange): string => `${r.startYMD}_to_${r.endYMD}`;
