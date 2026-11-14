/**
 * Crew clock-in links (competitor gap #13 "GPS time clock"): the rules. Pure (no Supabase, React or browser APIs),
 * so scripts/crew-clock-check.ts runs it under Node, and the public worker page (components/crew/CrewClockPage.tsx)
 * stays small.
 *
 *   Link     /clock/<token> (lib/crew/crewPath.ts): 40 characters, signed by the server (supabase/migrations/20261115000100_crew_clock_in.sql),
 *            only for the jobs assigned to that worker, turned off or replaced by the owner at any time.
 *   Punches  in / out / break_start / break_end. Each one stores the tap time and ONE location reading, only when
 *            the worker allowed it; without a reading the punch is still saved and flagged "No location".
 *   Sessions punches are paired per worker in time order:
 *              in → (break_start → break_end)* → out          one shift (breaks are not paid time)
 *              a shift past midnight counts on the day it started (overnight work stays one shift)
 *              in, then another in (no out)                   the first shift has a missing clock-out (0 h counted
 *                                                             until the owner adds the clock-out)
 *              still open, and it's late                      missing clock-out (MISSED_OUT_HOURS, end of the day)
 *              out with no in                                 missing clock-in (0 h)
 *              the same job tapped "in" twice within 2 min     the second tap is ignored (double tap)
 *              a shift over LONG_SHIFT_HOURS                  counted, but flagged for review
 *   Week     Monday to Sunday (local time). Overtime: hours past 40 in the week (default), past 8 in a day, or none;
 *            the overtime hours go to the job they were worked on.
 *   Far      a punch more than the site radius (+ the reading's accuracy, at most 1 km) from the job's saved pin.
 *            No pin = no check (no geocoding).
 */
import { addDaysLocal, parseLocalDate, toLocalYMD } from '../../utils/localDates.ts';
import { CREW_PATH_PREFIX, CREW_TOKEN_RE, crewTokenFromPath, isCrewToken } from './crewPath.ts';

export { CREW_PATH_PREFIX, CREW_TOKEN_RE, crewTokenFromPath, isCrewToken };

// =====================================================================================================================
// Constants (kept in sync with the migration by scripts/crew-clock-check.ts)
// =====================================================================================================================
export type PunchKind = 'in' | 'out' | 'break_start' | 'break_end';
export const PUNCH_KINDS: readonly PunchKind[] = ['in', 'out', 'break_start', 'break_end'];

/** Why a punch has (or hasn't) a location: ok = one reading at the tap; owner = added / fixed by the owner. */
export type LocationStatus = 'ok' | 'denied' | 'unavailable' | 'timeout' | 'skipped' | 'owner';
export const LOCATION_STATUSES: readonly LocationStatus[] = ['ok', 'denied', 'unavailable', 'timeout', 'skipped', 'owner'];

/** Device key of a punch (idempotency): same rule as time_punches.client_id. */
export const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export const CREW_LIMITS = {
    name: 80,
    phone: 40,
    email: 254,
    note: 500,
    members: 200,
    jobsPerMember: 300,
    maxRate: 10000,
    photoBytes: 4 * 1024 * 1024,
    punchMaxAgeDays: 14,
    siteRadiusMin: 50,
    siteRadiusMax: 5000,
} as const;

export const DEFAULT_SITE_RADIUS_M = 300;
export const SITE_RADIUS_OPTIONS: readonly number[] = [150, 300, 500, 1000];
/** A second "Clock in" on the same job this soon after the first is a double tap. */
export const DUPLICATE_TAP_MS = 2 * 60_000;
/** A closed shift longer than this is flagged for review (probably a forgotten clock-out fixed the next day). */
export const LONG_SHIFT_HOURS = 16;
/** Still clocked in after this many hours = missed clock-out. */
export const MISSED_OUT_HOURS = 12;
/** Evening hour (local) after which a shift that started in the morning counts as a missed clock-out. */
export const MISSED_OUT_EVENING_HOUR = 20;
export const OVERTIME_WEEKLY_HOURS = 40;
export const OVERTIME_DAILY_HOURS = 8;
/** Same as lib/finance.ts OVERTIME_MULTIPLIER (checked by the test). */
export const CREW_OVERTIME_MULTIPLIER = 1.5;

const HOUR = 3_600_000;
const DAY_MS = 86_400_000;

// =====================================================================================================================
// Types
// =====================================================================================================================
export interface LatLng { lat: number; lng: number }

export interface JobSite extends LatLng {
    radiusM: number;
    label?: string | null;
}

export interface Punch {
    /** server id, or `local:<clientId>` for a punch still waiting on the phone */
    id: string;
    clientId?: string | null;
    memberId: string;
    jobId: string;
    kind: PunchKind;
    /** ISO time of the tap */
    at: string;
    locationStatus?: LocationStatus | null;
    lat?: number | null;
    lng?: number | null;
    accuracyM?: number | null;
    distanceM?: number | null;
    note?: string | null;
    photoPath?: string | null;
    hasPhoto?: boolean;
    source?: 'crew' | 'owner';
    editedAt?: string | null;
    originalAt?: string | null;
    approvedAt?: string | null;
    timesheetId?: string | null;
    /** waiting on the worker's phone (not on the account yet) */
    pending?: boolean;
}

export type SessionFlag = 'open' | 'missing_out' | 'missing_in' | 'long_shift' | 'stray_break' | 'double_tap' | 'edited';

export interface WorkBreak {
    start: number;
    end: number | null;
    startPunch: Punch;
    endPunch: Punch | null;
}

export interface WorkSession {
    /** id of the clock-in punch (or of the clock-out when the clock-in is missing) */
    key: string;
    memberId: string;
    jobId: string;
    inPunch: Punch | null;
    outPunch: Punch | null;
    /** epoch ms */
    start: number;
    /** epoch ms; null = still open, or the clock-out is missing */
    end: number | null;
    breaks: WorkBreak[];
    breakMs: number;
    /** paid time that counts (0 for an open shift, a missing clock-in or a missing clock-out) */
    workedMs: number;
    /** open shift: time so far (breaks excluded), for "on the clock 3h 12m" */
    liveMs: number;
    /** no clock-out yet */
    open: boolean;
    /** local YYYY-MM-DD of the clock-in: the day the shift counts on */
    day: string;
    flags: SessionFlag[];
    punches: Punch[];
}

export const sessionCounts = (s: Pick<WorkSession, 'open' | 'end' | 'flags'>): boolean =>
    !s.open && s.end !== null && !s.flags.includes('missing_in') && !s.flags.includes('missing_out');

// =====================================================================================================================
// Small helpers
// =====================================================================================================================
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};
export const ms = (iso: unknown): number => {
    const t = typeof iso === 'number' ? iso : new Date(String(iso ?? '')).getTime();
    return Number.isFinite(t) ? t : NaN;
};

export const isPunchKind = (v: unknown): v is PunchKind => (PUNCH_KINDS as readonly unknown[]).includes(v);

/** Device key for a new punch (crypto.randomUUID when there is one). */
export const newClientId = (): string => {
    try {
        const c = (globalThis as { crypto?: Crypto }).crypto;
        if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '');
        if (c && typeof c.getRandomValues === 'function') {
            const b = new Uint8Array(16);
            c.getRandomValues(b);
            return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
        }
    } catch { /* fall through */ }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.replace(/[^A-Za-z0-9]/g, '').padEnd(12, '0');
};

// =====================================================================================================================
// Link
// =====================================================================================================================

export const crewLinkUrl = (origin: string, token: string): string => `${String(origin || '').replace(/\/+$/, '')}${CREW_PATH_PREFIX}${token}`;

export const firstName = (name: string): string => str(name).split(/\s+/)[0] || '';

/** Text the owner sends with the link (Text / Email / Copy). */
export const crewInviteText = (memberName: string, company: string, url: string): string => {
    const hi = firstName(memberName) ? `Hi ${firstName(memberName)}, ` : '';
    const who = str(company) ? `${str(company)} ` : '';
    return `${hi}here is your ${who}clock-in link: ${url}\nOpen it on your phone to clock in and out of today's jobs. No app or password needed. Your location is saved only at the moment you tap, never in between.`;
};

// =====================================================================================================================
// Time
// =====================================================================================================================
export const localDayOf = (t: number): string => toLocalYMD(new Date(t));

/** Monday of the week of a day / instant (local). */
export const weekStartOf = (value: string | number | Date): string => {
    const d = typeof value === 'string' ? parseLocalDate(value) : new Date(typeof value === 'number' ? value : value.getTime());
    const base = d && !Number.isNaN(d.getTime()) ? d : new Date();
    const dow = base.getDay(); // 0 = Sunday
    const back = (dow + 6) % 7;
    return toLocalYMD(addDaysLocal(new Date(base.getFullYear(), base.getMonth(), base.getDate()), -back));
};

export const addDays = (ymd: string, days: number): string => {
    const d = parseLocalDate(ymd);
    return d ? toLocalYMD(addDaysLocal(d, days)) : ymd;
};

export const weekDays = (weekStart: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** Local midnight that starts a day (epoch ms). */
export const dayStartMs = (ymd: string): number => {
    const d = parseLocalDate(ymd);
    return d ? d.getTime() : NaN;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Nov 10 – 16", "Nov 28 – Dec 4", "Dec 29, 2025 – Jan 4, 2026". */
export const weekRangeLabel = (weekStart: string): string => {
    const a = parseLocalDate(weekStart);
    const b = parseLocalDate(addDays(weekStart, 6));
    if (!a || !b) return weekStart;
    if (a.getFullYear() !== b.getFullYear()) {
        return `${MONTHS[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()} – ${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
    }
    if (a.getMonth() !== b.getMonth()) return `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}`;
    return `${MONTHS[a.getMonth()]} ${a.getDate()} – ${b.getDate()}`;
};

/** "Mon 11/10" */
export const shortDayLabel = (ymd: string): string => {
    const d = parseLocalDate(ymd);
    return d ? `${DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}` : ymd;
};

export const weekdayLetter = (ymd: string): string => {
    const d = parseLocalDate(ymd);
    return d ? DAYS[d.getDay()] : '';
};

/** "7:02 AM" (local). */
export const clockLabel = (t: number | string): string => {
    const d = new Date(typeof t === 'number' ? t : ms(t));
    if (Number.isNaN(d.getTime())) return '';
    const h = d.getHours();
    return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "7h 32m", "45m", "0m". */
export const durationLabel = (msValue: number): string => {
    const mins = Math.max(0, Math.round(msValue / 60_000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
};

/** Hours with 2 decimals (what time sheets store): 7h 32m → 7.53. */
export const msToHours = (msValue: number): number => Math.round(Math.max(0, msValue) / 36_000) / 100;

/** "7.5", "8", "0.25" (no trailing zeros), "—" for 0 when `dash`. */
export const hoursLabel = (msValue: number, dash = false): string => {
    const h = msToHours(msValue);
    if (!h && dash) return '—';
    return String(Number(h.toFixed(2)));
};

// =====================================================================================================================
// Pairing punches into shifts
// =====================================================================================================================
// Same instant: a break ends before the clock-out, and a clock-out (job switch) comes before the next clock-in.
const TIE: Record<PunchKind, number> = { break_end: 0, out: 1, in: 2, break_start: 3 };

export const sortPunches = <T extends Pick<Punch, 'at' | 'kind' | 'id'>>(punches: readonly T[]): T[] =>
    [...punches].sort((a, b) => (ms(a.at) - ms(b.at)) || (TIE[a.kind] - TIE[b.kind]) || String(a.id).localeCompare(String(b.id)));

/**
 * Missed clock-out: still clocked in after MISSED_OUT_HOURS, or 3 h+ into a shift that started on an earlier day,
 * or past MISSED_OUT_EVENING_HOUR on a shift that started before noon (all local time).
 */
export const isMissedClockOut = (startMs: number, now: number): boolean => {
    if (!Number.isFinite(startMs) || !Number.isFinite(now) || now <= startMs) return false;
    const elapsed = now - startMs;
    if (elapsed >= MISSED_OUT_HOURS * HOUR) return true;
    const sameDay = localDayOf(startMs) === localDayOf(now);
    if (!sameDay && elapsed >= 3 * HOUR) return true;
    return sameDay && new Date(now).getHours() >= MISSED_OUT_EVENING_HOUR && new Date(startMs).getHours() < 12;
};

/** When a still-open shift becomes a missed clock-out (epoch ms), for the notification time. */
export const missedClockOutAt = (startMs: number): number => {
    const byHours = startMs + MISSED_OUT_HOURS * HOUR;
    const start = new Date(startMs);
    const evening = start.getHours() < 12
        ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), MISSED_OUT_EVENING_HOUR).getTime()
        : Infinity;
    const nextDay = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime();
    const afterMidnight = Math.max(nextDay, startMs + 3 * HOUR);
    return Math.min(byHours, evening, afterMidnight);
};

const breakTotal = (breaks: readonly WorkBreak[], start: number, end: number): number =>
    breaks.reduce((sum, b) => {
        const s = Math.max(b.start, start);
        const e = Math.min(b.end ?? end, end);
        return sum + Math.max(0, e - s);
    }, 0);

const newSession = (p: Punch): WorkSession => {
    const t = ms(p.at);
    return {
        key: p.id, memberId: p.memberId, jobId: p.jobId, inPunch: p, outPunch: null, start: t, end: null, breaks: [], breakMs: 0,
        workedMs: 0, liveMs: 0, open: true, day: localDayOf(t), flags: [], punches: [p],
    };
};

const addFlag = (s: WorkSession, f: SessionFlag) => { if (!s.flags.includes(f)) s.flags.push(f); };

const finishFlags = (s: WorkSession) => {
    if (s.punches.some(p => p.editedAt || p.source === 'owner')) addFlag(s, 'edited');
};

/**
 * Pairs punches into shifts (every worker separately, in time order). Shifts are returned oldest first.
 * `now` decides whether a shift that is still open counts as a missed clock-out.
 */
export const buildSessions = (punches: readonly Punch[], opts: { now: number }): WorkSession[] => {
    const byMember = new Map<string, Punch[]>();
    for (const p of punches) {
        if (!p || !isPunchKind(p.kind) || !Number.isFinite(ms(p.at))) continue;
        const list = byMember.get(p.memberId) || [];
        list.push(p);
        byMember.set(p.memberId, list);
    }
    const out: WorkSession[] = [];
    for (const list of byMember.values()) {
        let cur: WorkSession | null = null;
        const close = (s: WorkSession) => { finishFlags(s); out.push(s); };
        for (const p of sortPunches(list)) {
            const t = ms(p.at);
            if (p.kind === 'in') {
                if (cur) {
                    if (cur.jobId === p.jobId && t - cur.start <= DUPLICATE_TAP_MS && !cur.breaks.length) {
                        cur.punches.push(p);
                        addFlag(cur, 'double_tap');
                        continue;
                    }
                    // a new clock-in without a clock-out: the previous shift is missing its end
                    cur.open = false;
                    cur.liveMs = 0;
                    addFlag(cur, 'missing_out');
                    close(cur);
                }
                cur = newSession(p);
            } else if (p.kind === 'break_start') {
                if (!cur) continue; // a break outside a shift has nothing to pause
                const openBreak = cur.breaks.find(b => b.end === null);
                cur.punches.push(p);
                if (openBreak) addFlag(cur, 'stray_break');
                else cur.breaks.push({ start: t, end: null, startPunch: p, endPunch: null });
            } else if (p.kind === 'break_end') {
                if (!cur) continue;
                const openBreak = cur.breaks.find(b => b.end === null);
                cur.punches.push(p);
                if (openBreak) { openBreak.end = t; openBreak.endPunch = p; } else addFlag(cur, 'stray_break');
            } else {
                // out
                if (!cur) {
                    out.push({
                        key: p.id, memberId: p.memberId, jobId: p.jobId, inPunch: null, outPunch: p, start: t, end: t, breaks: [], breakMs: 0,
                        workedMs: 0, liveMs: 0, open: false, day: localDayOf(t), flags: ['missing_in', ...(p.editedAt || p.source === 'owner' ? ['edited' as const] : [])], punches: [p],
                    });
                    continue;
                }
                for (const b of cur.breaks) if (b.end === null) b.end = t;
                cur.punches.push(p);
                cur.outPunch = p;
                cur.end = t;
                cur.open = false;
                cur.breakMs = breakTotal(cur.breaks, cur.start, t);
                cur.workedMs = Math.max(0, t - cur.start - cur.breakMs);
                if (t - cur.start > LONG_SHIFT_HOURS * HOUR) addFlag(cur, 'long_shift');
                close(cur);
                cur = null;
            }
        }
        if (cur) {
            const now = opts.now;
            cur.breakMs = breakTotal(cur.breaks, cur.start, Math.max(cur.start, now));
            cur.liveMs = Math.max(0, now - cur.start - cur.breakMs);
            addFlag(cur, 'open');
            if (isMissedClockOut(cur.start, now)) addFlag(cur, 'missing_out');
            close(cur);
        }
    }
    return out.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
};

// =====================================================================================================================
// Weekly totals
// =====================================================================================================================
export type OvertimeRule = 'weekly40' | 'daily8' | 'none';
export const OVERTIME_RULES: ReadonlyArray<{ id: OvertimeRule; label: string }> = [
    { id: 'weekly40', label: 'Overtime after 40 h a week' },
    { id: 'daily8', label: 'Overtime after 8 h a day' },
    { id: 'none', label: 'No overtime' },
];
export const isOvertimeRule = (v: unknown): v is OvertimeRule => v === 'weekly40' || v === 'daily8' || v === 'none';

export interface JobWeek {
    jobId: string;
    /** worked ms per day, Monday first */
    days: number[];
    workedMs: number;
    regularMs: number;
    overtimeMs: number;
    sessions: WorkSession[];
}

export interface MemberWeek {
    memberId: string;
    days: number[];
    workedMs: number;
    regularMs: number;
    overtimeMs: number;
    jobs: JobWeek[];
    sessions: WorkSession[];
    /** shift running right now (any week) */
    open: WorkSession | null;
    /** shifts of the week that need a look */
    attention: number;
    /** every counted shift of the week is approved (and there is at least one) */
    approved: boolean;
}

export interface WeekSummary {
    weekStart: string;
    days: string[];
    members: MemberWeek[];
    workedMs: number;
    regularMs: number;
    overtimeMs: number;
}

const ATTENTION: readonly SessionFlag[] = ['missing_out', 'missing_in', 'long_shift', 'stray_break'];
export const needsAttention = (s: Pick<WorkSession, 'flags'>): boolean => s.flags.some(f => ATTENTION.includes(f));

export const sessionApproved = (s: Pick<WorkSession, 'punches'>): boolean => s.punches.length > 0 && s.punches.every(p => Boolean(p.approvedAt));

/**
 * Totals of one week (Monday weekStart … Sunday) per worker and job, from shifts that started in that week.
 * Only closed shifts count; overtime per `rule`, given to the job the extra hours were worked on.
 */
export const summarizeWeek = (sessions: readonly WorkSession[], opts: { weekStart: string; rule: OvertimeRule }): WeekSummary => {
    const days = weekDays(opts.weekStart);
    const dayIndex = new Map(days.map((d, i) => [d, i]));
    const members = new Map<string, MemberWeek>();
    const member = (id: string): MemberWeek => {
        let m = members.get(id);
        if (!m) {
            m = { memberId: id, days: Array(7).fill(0), workedMs: 0, regularMs: 0, overtimeMs: 0, jobs: [], sessions: [], open: null, attention: 0, approved: false };
            members.set(id, m);
        }
        return m;
    };
    const jobOf = (m: MemberWeek, jobId: string): JobWeek => {
        let j = m.jobs.find(x => x.jobId === jobId);
        if (!j) {
            j = { jobId, days: Array(7).fill(0), workedMs: 0, regularMs: 0, overtimeMs: 0, sessions: [] };
            m.jobs.push(j);
        }
        return j;
    };
    const sorted = [...sessions].sort((a, b) => a.start - b.start);
    const weeklyLimit = OVERTIME_WEEKLY_HOURS * HOUR;
    const dailyLimit = OVERTIME_DAILY_HOURS * HOUR;
    const dailyUsed = new Map<string, number>();
    const weeklyUsed = new Map<string, number>();
    for (const s of sorted) {
        if (s.open) {
            const m = member(s.memberId);
            if (!m.open || s.start > m.open.start) m.open = s;
        }
        const idx = dayIndex.get(s.day);
        if (idx === undefined) continue;
        const m = member(s.memberId);
        const j = jobOf(m, s.jobId);
        m.sessions.push(s);
        j.sessions.push(s);
        if (needsAttention(s)) m.attention++;
        if (!sessionCounts(s)) continue;
        const worked = s.workedMs;
        let regular = worked;
        if (opts.rule === 'weekly40') {
            const used = weeklyUsed.get(s.memberId) || 0;
            regular = Math.max(0, Math.min(worked, weeklyLimit - used));
            weeklyUsed.set(s.memberId, used + worked);
        } else if (opts.rule === 'daily8') {
            const key = `${s.memberId}|${s.day}`;
            const used = dailyUsed.get(key) || 0;
            regular = Math.max(0, Math.min(worked, dailyLimit - used));
            dailyUsed.set(key, used + worked);
        }
        const overtime = worked - regular;
        m.days[idx] += worked;
        j.days[idx] += worked;
        m.workedMs += worked; j.workedMs += worked;
        m.regularMs += regular; j.regularMs += regular;
        m.overtimeMs += overtime; j.overtimeMs += overtime;
    }
    const list = [...members.values()];
    for (const m of list) {
        const counted = m.sessions.filter(sessionCounts);
        m.approved = counted.length > 0 && counted.every(sessionApproved);
        m.jobs.sort((a, b) => b.workedMs - a.workedMs || a.jobId.localeCompare(b.jobId));
    }
    return {
        weekStart: opts.weekStart,
        days,
        members: list,
        workedMs: list.reduce((s, m) => s + m.workedMs, 0),
        regularMs: list.reduce((s, m) => s + m.regularMs, 0),
        overtimeMs: list.reduce((s, m) => s + m.overtimeMs, 0),
    };
};

/** Cost at the worker's own rate (regular + overtime × 1.5); null without a rate. */
export const laborCostAt = (regularMs: number, overtimeMs: number, rate: number | null | undefined): number | null => {
    const r = num(rate);
    if (r === null || r <= 0) return null;
    return Math.round((msToHours(regularMs) * r + msToHours(overtimeMs) * r * CREW_OVERTIME_MULTIPLIER) * 100) / 100;
};

// =====================================================================================================================
// Location
// =====================================================================================================================
/** Great-circle distance in metres (same formula as public._crew_distance_m). */
export const distanceMeters = (a: LatLng, b: LatLng): number => {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h))));
};

export const isValidLatLng = (v: Partial<LatLng> | null | undefined): v is LatLng => {
    if (!v) return false;
    const lat = num(v.lat);
    const lng = num(v.lng);
    return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
};

export type LocationFlag = 'ok' | 'far' | 'no_location' | 'no_site' | 'owner';

/**
 * How a punch's location compares with the job's pin. Owner punches have no reading by design ('owner').
 * Far = more than the site radius away, after allowing for the reading's accuracy (at most 1 km of it).
 */
export const punchLocationFlag = (
    p: Pick<Punch, 'lat' | 'lng' | 'accuracyM' | 'locationStatus' | 'source'>,
    site: JobSite | null | undefined,
): { flag: LocationFlag; distanceM: number | null } => {
    if (p.source === 'owner' || p.locationStatus === 'owner') return { flag: 'owner', distanceM: null };
    const at = { lat: num(p.lat) ?? NaN, lng: num(p.lng) ?? NaN };
    if (!isValidLatLng(at)) return { flag: 'no_location', distanceM: null };
    if (!site || !isValidLatLng(site)) return { flag: 'no_site', distanceM: null };
    const d = distanceMeters(site, at);
    const slack = Math.min(Math.max(0, num(p.accuracyM) ?? 0), 1000);
    const radius = Math.max(CREW_LIMITS.siteRadiusMin, num(site.radiusM) ?? DEFAULT_SITE_RADIUS_M);
    return { flag: d - slack > radius ? 'far' : 'ok', distanceM: d };
};

/** "350 ft", "0.4 mi", "12 mi" (US units). */
export const distanceLabel = (meters: number): string => {
    const m = Math.max(0, meters);
    const miles = m / 1609.344;
    if (miles < 0.1) return `${Math.round(m * 3.28084 / 10) * 10} ft`;
    if (miles < 10) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles)} mi`;
};

/**
 * Coordinates from what the owner pastes: "40.7128, -74.0060", a Google / Apple Maps link (@lat,lng, !3d!4d,
 * q= / ll= / query= / destination=). Null when nothing usable is found. No geocoding.
 */
export const parseLatLng = (input: string): LatLng | null => {
    const text = str(input);
    if (!text) return null;
    let decoded = text;
    try { decoded = decodeURIComponent(text); } catch { /* keep */ }
    const N = '(-?\\d{1,3}(?:\\.\\d+)?)';
    const patterns = [
        new RegExp(`!3d${N}!4d${N}`),
        new RegExp(`@${N},\\s*${N}`),
        new RegExp(`[?&](?:q|query|ll|sll|center|destination|daddr|saddr)=(?:loc:)?${N}\\s*,\\s*${N}`, 'i'),
        new RegExp(`^${N}\\s*[,;]\\s*${N}$`),
        new RegExp(`^${N}\\s+${N}$`),
    ];
    for (const re of patterns) {
        const m = re.exec(decoded);
        if (m) {
            const v = { lat: Number(m[1]), lng: Number(m[2]) };
            if (isValidLatLng(v)) return v;
        }
    }
    return null;
};

// =====================================================================================================================
// Worker page
// =====================================================================================================================
export interface PortalJob {
    id: string;
    name: string;
    address: string;
    status: string;
    /** assignment window (YYYY-MM-DD, null = open) */
    from: string | null;
    to: string | null;
    assigned: boolean;
    site: JobSite | null;
}

export interface WorkerPortal {
    member: { name: string };
    company: { name: string; logoUrl: string; phone: string };
    paused: boolean;
    serverNow: string | null;
    jobs: PortalJob[];
    punches: Punch[];
}

export type WorkerStatus = 'off' | 'working' | 'break';

export interface WorkerState {
    status: WorkerStatus;
    jobId: string | null;
    /** clock-in time of the running shift (ms) */
    since: number | null;
    /** start of the running break (ms) */
    breakSince: number | null;
    session: WorkSession | null;
    /** the running shift is a missed clock-out (it's late) */
    late: boolean;
}

/** What the worker is doing now, from their punches (account + waiting on the phone). */
export const workerState = (punches: readonly Punch[], now: number): WorkerState => {
    const sessions = buildSessions(punches, { now });
    const last = sessions[sessions.length - 1];
    if (!last || !last.open) return { status: 'off', jobId: null, since: null, breakSince: null, session: null, late: false };
    const openBreak = last.breaks.find(b => b.end === null) || null;
    return {
        status: openBreak ? 'break' : 'working',
        jobId: last.jobId,
        since: last.start,
        breakSince: openBreak ? openBreak.start : null,
        session: last,
        late: last.flags.includes('missing_out'),
    };
};

/** Punches the worker may make now. */
export const allowedKinds = (status: WorkerStatus): PunchKind[] =>
    status === 'off' ? ['in'] : status === 'working' ? ['out', 'break_start'] : ['break_end', 'out'];

/** Time a shift adds to the worker's own totals: closed = paid time; running = so far; a missed clock-out = nothing. */
const shownMs = (s: WorkSession): number => (s.open ? (s.flags.includes('missing_out') ? 0 : s.liveMs) : s.workedMs);

/** Paid time on a local day (closed shifts + the running one so far). */
export const workedOnDay = (sessions: readonly WorkSession[], ymd: string): number =>
    sessions.filter(s => s.day === ymd).reduce((sum, s) => sum + shownMs(s), 0);

/** Paid time in the week of `ymd` (Monday first). */
export const workedInWeek = (sessions: readonly WorkSession[], ymd: string): number => {
    const days = new Set(weekDays(weekStartOf(ymd)));
    return sessions.filter(s => days.has(s.day)).reduce((sum, s) => sum + shownMs(s), 0);
};

/** Jobs to show today (assigned, open, window includes today) and coming up later; finished jobs only when a shift is open on them. */
export const splitPortalJobs = (jobs: readonly PortalJob[], today: string, openJobId: string | null): { today: PortalJob[]; later: PortalJob[] } => {
    const todayList: PortalJob[] = [];
    const later: PortalJob[] = [];
    for (const j of jobs) {
        if (j.id === openJobId) { todayList.push(j); continue; }
        if (!j.assigned) continue;
        if (j.status === 'completed' || j.status === 'inactive') continue;
        if (j.to && j.to < today) continue;
        if (j.from && j.from > today) { later.push(j); continue; }
        todayList.push(j);
    }
    const byName = (a: PortalJob, b: PortalJob) => (a.id === openJobId ? -1 : b.id === openJobId ? 1 : a.name.localeCompare(b.name));
    return { today: todayList.sort(byName), later: later.sort((a, b) => String(a.from).localeCompare(String(b.from)) || a.name.localeCompare(b.name)) };
};

export const PUNCH_LABEL: Record<PunchKind, string> = {
    in: 'Clocked in',
    out: 'Clocked out',
    break_start: 'Break started',
    break_end: 'Break ended',
};

// =====================================================================================================================
// Rows from the database
// =====================================================================================================================
const locationOf = (v: unknown): LocationStatus | null => ((LOCATION_STATUSES as readonly unknown[]).includes(v) ? v as LocationStatus : null);

export const mapPunchRow = (r: Record<string, unknown>): Punch => ({
    id: str(r.id),
    clientId: str(r.client_id) || null,
    memberId: str(r.member_id),
    jobId: str(r.job_id),
    kind: (isPunchKind(r.kind) ? r.kind : 'in') as PunchKind,
    at: str(r.at),
    locationStatus: locationOf(r.location_status ?? r.location),
    lat: num(r.lat),
    lng: num(r.lng),
    accuracyM: num(r.accuracy_m),
    distanceM: num(r.distance_m),
    note: str(r.note) || null,
    photoPath: str(r.photo_path) || null,
    hasPhoto: Boolean(r.photo_path) || r.has_photo === true,
    source: r.source === 'owner' ? 'owner' : 'crew',
    editedAt: str(r.edited_at) || null,
    originalAt: str(r.original_at) || null,
    approvedAt: str(r.approved_at) || null,
    timesheetId: str(r.timesheet_id) || null,
});

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

export const mapPortal = (raw: unknown, memberId = 'me'): WorkerPortal => {
    const r = obj(typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : raw);
    const company = obj(r.company);
    const jobs = Array.isArray(r.jobs) ? r.jobs.map(obj) : [];
    const punches = Array.isArray(r.punches) ? r.punches.map(obj) : [];
    return {
        member: { name: str(obj(r.member).name) },
        company: { name: str(company.name), logoUrl: str(company.logo_url), phone: str(company.phone) },
        paused: r.paused === true,
        serverNow: str(r.server_now) || null,
        jobs: jobs.filter(j => str(j.id)).map(j => {
            const site = obj(j.site);
            const s = { lat: num(site.lat) ?? NaN, lng: num(site.lng) ?? NaN };
            return {
                id: str(j.id),
                name: str(j.name) || 'Job',
                address: str(j.address),
                status: str(j.status) || 'active',
                from: str(j.from) || null,
                to: str(j.to) || null,
                assigned: j.assigned !== false,
                site: isValidLatLng(s) ? { ...s, radiusM: num(site.radius_m) ?? DEFAULT_SITE_RADIUS_M } : null,
            };
        }),
        punches: punches.filter(p => str(p.id) && isPunchKind(p.kind)).map(p => ({ ...mapPunchRow(p), memberId })),
    };
};

// =====================================================================================================================
// Errors
// =====================================================================================================================
export type CrewErrorKind = 'invalid_link' | 'paused' | 'rate_limit' | 'rejected' | 'network' | 'unavailable' | 'premium' | 'unknown';

type ErrLike = { message?: string; code?: string; hint?: string; details?: string; name?: string; status?: number } | string | null | undefined;
const errText = (e: ErrLike): string => (typeof e === 'string' ? e : `${e?.message || ''} ${e?.details || ''}`.trim());
const errCode = (e: ErrLike): string => (typeof e === 'string' ? '' : String(e?.code || ''));

/** The crew tables / functions are not in the database yet (migration not applied): the feature stays hidden. */
export const isCrewBackendMissing = (e: ErrLike): boolean => {
    if (!e) return false;
    if (['42P01', '42883', 'PGRST202', 'PGRST205', 'PGRST200', 'PGRST106'].includes(errCode(e))) return true;
    return /does not exist|could not find the (function|table)|schema cache|bucket not found/i.test(errText(e));
};

export const isNetworkError = (e: ErrLike): boolean => {
    if (!e) return false;
    const t = errText(e);
    if (typeof e === 'object' && (e.name === 'TypeError' || e.name === 'AbortError') && /fetch|network|load failed|aborted/i.test(t)) return true;
    return /failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected|fetch failed|timed? ?out/i.test(t);
};

export const classifyCrewError = (e: ErrLike): { kind: CrewErrorKind; message: string } => {
    const text = errText(e);
    if (isNetworkError(e)) return { kind: 'network', message: "No connection. Your punch is saved on this phone and will send when you're back online." };
    if (isCrewBackendMissing(e)) return { kind: 'unavailable', message: 'Clock-in is not switched on yet. Please try again later.' };
    if (/RATE_LIMIT/i.test(text)) return { kind: 'rate_limit', message: text.replace(/^.*?RATE_LIMIT:?\s*/i, '').trim() || 'Too many tries. Please wait a few minutes.' };
    if (/PREMIUM_REQUIRED/i.test(text) || (typeof e === 'object' && e?.hint === 'premium')) {
        return { kind: 'premium', message: text.replace(/^.*?PREMIUM_REQUIRED:?\s*/i, '').trim() || 'Crew clock-in links are part of Premium.' };
    }
    if (/invalid_link/i.test(text)) return { kind: 'invalid_link', message: 'This clock-in link is not valid anymore. Ask your boss for a new one.' };
    if (/paused/i.test(text) && /crew|link|clock/i.test(text)) return { kind: 'paused', message: 'Clock-in is paused for this company right now. Ask your boss.' };
    const code = errCode(e);
    if (['22023', 'P0001', 'P0002', '23514', '23505'].includes(code)) return { kind: 'rejected', message: text || 'This punch could not be saved.' };
    return { kind: 'unknown', message: text || 'Something went wrong. Please try again.' };
};
