/**
 * Recurring invoices: catch-up cap (PARITY_V2 D2). Pure logic, no Supabase (scripts/data-fidelity-check.ts tests it).
 *
 * The database (`generate_due_recurring_invoices()`, migration 20261112000200) creates one draft per missed period, up
 * to 24 per invoice. The original app saved "Repeat this invoice" settings but never ran them, so an old monthly
 * invoice ticked in January would make ~10 drafts at once on the first login. The browser therefore moves a series
 * that is more than one period behind to its LATEST due period before calling the RPC: exactly one draft is created
 * (for the most recent period), the older periods are skipped and reported to the user. No database change needed.
 */

export const RECURRENCE_MONTHS: Record<string, number> = { Monthly: 1, Quarterly: 3, 'Bi-Annually': 6, Annually: 12 };

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-01-31" → [2026, 1, 31] (month 1-based), null when not a date. */
const parseYmd = (value: unknown): [number, number, number] | null => {
    const m = typeof value === 'string' ? YMD.exec(value) : null;
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return [y, mo, d];
};

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Same as SQL `_add_months_anchored`: month arithmetic that keeps the anchor day (Jan 31 → Feb 28 → Mar 31). */
export const addMonthsAnchored = (ymd: string, months: number, anchorDay?: number | null): string => {
    const p = parseYmd(ymd);
    if (!p) return ymd;
    const [y, m, d] = p;
    const total = (y * 12 + (m - 1)) + months;
    const ty = Math.floor(total / 12);
    const tm = (total % 12) + 1;
    const anchor = Math.max(1, Math.round(anchorDay ?? d));
    return `${ty}-${pad(tm)}-${pad(Math.min(anchor, daysInMonth(ty, tm)))}`;
};

/** The database's `current_date` (UTC), so the browser and the RPC agree on what is due today. */
export const serverToday = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

export interface RecurrenceLike {
    enabled?: unknown;
    frequency?: unknown;
    nextRunDate?: unknown;
    anchorDay?: unknown;
}

export interface CatchUpPlan {
    /** periods the database would create right now (0 = nothing due) */
    due: number;
    /** the most recent due period: the one that is still created */
    latestDue: string | null;
    /** older due periods that are skipped (empty when at most one period is due) */
    skipped: string[];
    /** anchor day the database uses for this series */
    anchorDay: number | null;
}

const MAX_PERIODS = 600; // safety stop (50 years of monthly invoices)

/** What `generate_due_recurring_invoices()` would create for one source invoice, and what the cap skips. */
export const planRecurringCatchUp = (rec: RecurrenceLike | null | undefined, today: string): CatchUpPlan => {
    const none: CatchUpPlan = { due: 0, latestDue: null, skipped: [], anchorDay: null };
    if (!rec || !(rec.enabled === true || rec.enabled === 'true')) return none;
    const months = RECURRENCE_MONTHS[String(rec.frequency ?? '')];
    const start = parseYmd(rec.nextRunDate);
    if (!months || !start || !parseYmd(today)) return none;
    const anchorRaw = Number(rec.anchorDay);
    const anchorDay = Number.isFinite(anchorRaw) && anchorRaw >= 1 ? Math.trunc(anchorRaw) : start[2];
    const periods: string[] = [];
    let next = String(rec.nextRunDate).slice(0, 10);
    while (next <= today && periods.length < MAX_PERIODS) {
        periods.push(next);
        next = addMonthsAnchored(next, months, anchorDay);
    }
    if (!periods.length) return { ...none, anchorDay };
    return { due: periods.length, latestDue: periods[periods.length - 1], skipped: periods.slice(0, -1), anchorDay };
};

/**
 * New `recurrence` object for a series that is more than one period behind: the next run is its latest due period
 * (created by the RPC right after), the anchor day is pinned so the following dates stay the same, and the skipped
 * periods are noted on the invoice. Null when nothing needs to change.
 */
export interface CappedFields {
    nextRunDate: string;
    anchorDay: number | null;
    catchUp: { skipped: number; from: string; to: string; at: string };
}

export const cappedRecurrence = <T extends Record<string, unknown>>(rec: T, plan: CatchUpPlan, at: string = new Date().toISOString()): (Omit<T, keyof CappedFields> & CappedFields) | null => {
    if (plan.skipped.length === 0 || !plan.latestDue) return null;
    return {
        ...rec,
        nextRunDate: plan.latestDue,
        anchorDay: plan.anchorDay,
        catchUp: { skipped: plan.skipped.length, from: plan.skipped[0], to: plan.skipped[plan.skipped.length - 1], at },
    };
};

export interface SkippedSeries {
    id: string;
    invoiceNumber: string;
    skipped: number;
    from: string;
    to: string;
}

const shortDate = (ymd: string) => {
    const p = parseYmd(ymd);
    if (!p) return ymd;
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

/** Toast text after a run: what was created and which missed periods were skipped. Null = say nothing. */
export const describeRecurringRun = (created: number, skipped: SkippedSeries[]): string | null => {
    const parts: string[] = [];
    if (created > 0) parts.push(`${created} recurring ${created === 1 ? 'invoice was' : 'invoices were'} created as ${created === 1 ? 'a draft' : 'drafts'}.`);
    if (skipped.length === 1) {
        const s = skipped[0];
        parts.push(`${s.invoiceNumber || 'A recurring invoice'} had ${s.skipped + 1} missed periods: only the latest was created; ${s.skipped === 1 ? 'the one' : `the ${s.skipped}`} from ${shortDate(s.from)}${s.skipped > 1 ? ` to ${shortDate(s.to)}` : ''} ${s.skipped === 1 ? 'was' : 'were'} skipped.`);
    } else if (skipped.length > 1) {
        const total = skipped.reduce((n, s) => n + s.skipped, 0);
        parts.push(`${skipped.length} recurring invoices were behind: only the latest period of each was created (${total} older ${total === 1 ? 'period' : 'periods'} skipped).`);
    }
    return parts.length ? parts.join(' ') : null;
};
