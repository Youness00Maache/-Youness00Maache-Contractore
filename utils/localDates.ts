/**
 * Local-calendar date helpers (owned by VIEWS, safe for anyone to import).
 *
 * Business dates in this app ("2026-03-10" for a job start, an invoice issue date, an expense date)
 * are CALENDAR days, not instants. `new Date('2026-03-10')` parses as UTC midnight, which is the
 * previous evening anywhere west of UTC, so never use it for business dates. Use these instead.
 */

const YMD_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

/** Builds a local Date at 00:00 for a calendar day. */
export const localDay = (year: number, monthIndex: number, day: number): Date => new Date(year, monthIndex, day);

/**
 * Parses a business date into a local Date at 00:00.
 * - "YYYY-MM-DD" (or "YYYY-MM-DDT..." from a `date`/timestamptz column): the calendar day as written.
 * - a Date: its local calendar day.
 * Returns null for empty or invalid input.
 */
export const parseLocalDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return localDay(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== 'string') return null;
  const m = YMD_RE.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = localDay(y, mo - 1, d);
  // Reject overflow such as 2026-02-31
  if (date.getMonth() !== mo - 1) return null;
  return date;
};

/** Formats a Date as its local calendar day "YYYY-MM-DD". */
export const toLocalYMD = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local calendar day ("YYYY-MM-DD") of an instant (e.g. a `created_at` timestamp). */
export const instantToLocalYMD = (iso: unknown): string | null => {
  if (typeof iso !== 'string' && !(iso instanceof Date)) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toLocalYMD(d);
};

/** Normalises any business-date-ish value to "YYYY-MM-DD" (or null). */
export const normalizeYMD = (value: unknown): string | null => {
  const d = parseLocalDate(value);
  return d ? toLocalYMD(d) : null;
};

export const todayYMD = (): string => toLocalYMD(new Date());

/** Adds whole calendar days (DST-safe: works on the calendar, not on milliseconds). */
export const addDaysLocal = (d: Date, days: number): Date => localDay(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29, never Mar 3). */
export const addMonthsClamped = (d: Date, months: number): Date => {
  const target = localDay(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = localDay(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return localDay(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
};

/** Whole calendar days from a to b (b - a). DST-safe. */
export const daysBetween = (a: Date, b: Date): number => {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
};

/** First day of the week containing d (weekStartsOn: 0 = Sunday, 1 = Monday). */
export const startOfWeekLocal = (d: Date, weekStartsOn = 0): Date => {
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDaysLocal(d, -diff);
};

export const startOfMonthLocal = (d: Date): Date => localDay(d.getFullYear(), d.getMonth(), 1);
export const endOfMonthLocal = (d: Date): Date => localDay(d.getFullYear(), d.getMonth() + 1, 0);

/** "YYYY-MM-DD" strings compare correctly as strings; these helpers make intent explicit. */
export const ymdInRange = (ymd: string, startYMD: string, endYMD: string): boolean => ymd >= startYMD && ymd <= endYMD;

/** Human label for a business date, e.g. "Mar 10, 2026". */
export const formatYMD = (value: unknown, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string => {
  const d = parseLocalDate(value);
  return d ? d.toLocaleDateString(undefined, opts) : '';
};
