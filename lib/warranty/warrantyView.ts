/**
 * Warranty screens, pure (no React, no Supabase): the words and the small decisions the Warranty form, the warranties
 * list and the after-the-job settings use. scripts/warranty-check.ts runs it.
 *
 *   formatDay / timeLeftText / warrantySummary   "Active, ends 12 Mar 2028 (4 months left)"
 *   coverageMode / applyCoverage                 the form's "Coverage period" block: length, exact end date or lifetime.
 *                                                Everything is written into the form's data (documents.data), so the
 *                                                form's normal Save keeps it; the printed `duration` text follows the length.
 *   claimMoves / claimNeedsReason                the buttons a claim offers (CLAIM_TRANSITIONS only)
 *   warrantyBuckets / openClaimsText             the warranties list (Ending soon / Active / Ended / Void)
 *   offsetsText / parseOffsetsText               the "days" boxes of the after-the-job settings
 */
import {
    CLAIM_STATUS_LABELS, CLAIM_TRANSITIONS, readWarrantyTracking, setTerm, warrantySourceOf, warrantyOverview,
    withWarrantyTracking, isFailure, parseDurationText,
    type WarrantyOverview,
} from './warrantyLogic.ts';
import { normalizePostJobOffsets, POST_JOB_RULES } from '../../supabase/functions/reminders/shared/postjob.ts';
import { diffDays } from '../../supabase/functions/reminders/shared/schedule.ts';
import { WARRANTY_LIMITS } from './warrantyLogic.ts';
import type { ClaimStatus, PostJobKind, PostJobSettings, TermUnit, ValidationFailure, WarrantyClaim, WarrantyStatus } from './types.ts';

type Data = Record<string, unknown>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Mar 2028" from YYYY-MM-DD ('' when it is not a day). The same words on every device. */
export function formatDay(ymd: unknown): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd ?? '').trim());
    if (!m) return '';
    const month = MONTHS[Number(m[2]) - 1];
    return month ? `${Number(m[3])} ${month} ${m[1]}` : '';
}

/**
 * A count of days in plain words (sign ignored): "25 days" under two months, then "4 months", "1 year", "1 year and 9 months".
 * Rounded to whole months, so a long warranty never reads "631 days".
 */
export function timeLeftText(days: number): string {
    const n = Math.max(1, Math.abs(Math.trunc(days)));
    const plural = (v: number, w: string) => `${v} ${w}${v === 1 ? '' : 's'}`;
    if (n < 60) return plural(n, 'day');
    const months = Math.round(n / 30.44);
    if (months < 12) return plural(months, 'month');
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest ? `${plural(years, 'year')} and ${plural(rest, 'month')}` : plural(years, 'year');
}

/** "2 Years", "90 Days", "1 Year", "6 Months": the words the certificate prints for a length. */
export function durationLabel(value: number, unit: TermUnit): string {
    const word = unit === 'days' ? 'Day' : unit === 'months' ? 'Month' : 'Year';
    return `${value} ${word}${value === 1 ? '' : 's'}`;
}

export type SummaryTone = 'good' | 'warn' | 'bad' | 'muted';

const TONE: Record<WarrantyStatus, SummaryTone> = { active: 'good', lifetime: 'good', expiring: 'warn', expired: 'bad', void: 'muted', unknown: 'muted' };

export interface WarrantySummary {
    tone: SummaryTone;
    /** "Active, ends 12 Mar 2028 (4 months left)" */
    text: string;
    /** the same without the status word: "Ends 12 Mar 2028" (lists) */
    short: string;
}

/** What the form and the list say about the coverage, as of the overview's day. */
export function warrantySummary(o: Pick<WarrantyOverview, 'status' | 'daysLeft' | 'expiresOn' | 'tracking'>): WarrantySummary {
    const tone = TONE[o.status];
    const end = formatDay(o.expiresOn);
    switch (o.status) {
        case 'void': {
            const since = formatDay(String(o.tracking?.voidedAt ?? '').slice(0, 10));
            return { tone, text: since ? `Void since ${since}` : 'Void', short: 'Void' };
        }
        case 'lifetime':
            return { tone, text: 'Lifetime, no end date', short: 'Lifetime' };
        case 'unknown':
            return { tone, text: 'No end date yet: pick a length or an end date', short: 'No end date' };
        case 'expired':
            return { tone, text: `Ended ${end} (${timeLeftText(o.daysLeft ?? 0)} ago)`, short: `Ended ${end}` };
        default: {
            const days = o.daysLeft ?? 0;
            const label = o.status === 'expiring' ? 'Ending soon' : 'Active';
            if (days === 0) return { tone, text: `${label}, ends today (${end})`, short: 'Ends today' };
            return { tone, text: `${label}, ends ${end} (${timeLeftText(days)} left)`, short: `Ends ${end}` };
        }
    }
}

/* ---------------------------------------------------------------------------------- coverage period */

export type CoverageMode = 'length' | 'date' | 'lifetime';

export const TERM_UNITS: ReadonlyArray<{ value: TermUnit; label: string }> = [
    { value: 'days', label: 'days' },
    { value: 'months', label: 'months' },
    { value: 'years', label: 'years' },
];

/** Which of the three ways the coverage is set today (an old warranty reads its duration text, so 'length'). */
export function coverageMode(o: Pick<WarrantyOverview, 'source'>): CoverageMode {
    return o.source === 'explicit' ? 'date' : o.source === 'lifetime' ? 'lifetime' : 'length';
}

export interface CoverageEdit {
    mode: CoverageMode;
    /** 'YYYY-MM-DD', '' or null = back to the work-completed day; undefined = leave as is */
    startDate?: string | null;
    value?: number | null;
    unit?: TermUnit;
    expiresOn?: string | null;
}

export type CoverageResult = { ok: true; data: Data } | ValidationFailure;

/**
 * New form data with the coverage period changed. Validated with setTerm (end after start, whole-number length in range).
 * The certificate prints `duration`, so a length also rewrites it ("2 Years") and Lifetime writes "Lifetime"; an exact end
 * date leaves the printed text alone. Claims and the void flag are never touched.
 */
export function applyCoverage(data: Data, edit: CoverageEdit): CoverageResult {
    const cur = readWarrantyTracking(data);
    const src = warrantySourceOf(data);
    const startDate = edit.startDate === undefined ? cur.startDate ?? null : edit.startDate || null;
    const value = edit.value != null && Number.isFinite(edit.value) ? Math.trunc(edit.value) : null;
    const patch = edit.mode === 'length'
        ? { startDate, termValue: value, termUnit: value != null ? edit.unit ?? cur.termUnit ?? 'years' : null, expiresOn: null, lifetime: false }
        : edit.mode === 'date'
            ? { startDate, termValue: null, termUnit: null, expiresOn: edit.expiresOn || null, lifetime: false }
            : { startDate, termValue: null, termUnit: null, expiresOn: null, lifetime: true };
    const r = setTerm(cur, patch, src);
    if (isFailure(r)) return r;
    let next = withWarrantyTracking(data, r.tracking);
    if (edit.mode === 'lifetime') next = { ...next, duration: 'Lifetime' };
    else if (edit.mode === 'length' && r.tracking.termValue && r.tracking.termUnit) next = { ...next, duration: durationLabel(r.tracking.termValue, r.tracking.termUnit) };
    return { ok: true, data: next };
}

/**
 * The form's old "Duration" text box was typed. With a structured length or lifetime already saved, a text the logic
 * understands ("2 Years", "Lifetime") moves the structure with it so the certificate and the emails agree; a text it
 * does not understand stays printed as written and the structure keeps governing. With an exact end date, or nothing
 * structured yet, only the text changes (an old warranty keeps reading its duration text).
 */
export function applyDurationText(data: Data, text: string): Data {
    const next: Data = { ...data, duration: text };
    const t = readWarrantyTracking(data);
    if (t.expiresOn || (!t.termValue && !t.lifetime)) return next;
    const parsed = parseDurationText(text);
    if (!parsed) return next;
    const r = applyCoverage(next, 'lifetime' in parsed ? { mode: 'lifetime' } : { mode: 'length', value: parsed.value, unit: parsed.unit });
    return isFailure(r) ? next : { ...(r as { data: Data }).data, duration: text };
}

/** The length boxes' starting values: the length the logic reads (structured or from the duration text). */
export function lengthOf(o: Pick<WarrantyOverview, 'term' | 'tracking'>): { value: number | null; unit: TermUnit } {
    const t = o.term;
    return t ? { value: t.value, unit: t.unit } : { value: null, unit: o.tracking.termUnit ?? 'years' };
}

/* ------------------------------------------------------------------------------------------ claims */

export interface ClaimMove {
    to: ClaimStatus;
    label: string;
    /** closing a claim asks for what was done / why it was denied */
    closes: boolean;
}

const MOVE_LABEL = (from: ClaimStatus, to: ClaimStatus): string => {
    if (to === 'in_review') return 'Start review';
    if (to === 'resolved') return 'Mark resolved';
    if (to === 'denied') return 'Deny claim';
    return from === 'in_review' ? 'Back to open' : 'Reopen';
};

/** The moves a claim offers (CLAIM_TRANSITIONS, nothing else). */
export const claimMoves = (from: ClaimStatus): ClaimMove[] =>
    (CLAIM_TRANSITIONS[from] ?? []).map(to => ({ to, label: MOVE_LABEL(from, to), closes: to === 'resolved' || to === 'denied' }));

/** A denial must say why. */
export const claimNeedsReason = (to: ClaimStatus): boolean => to === 'denied';

export const claimStatusLabel = (s: ClaimStatus): string => CLAIM_STATUS_LABELS[s] ?? s;

/** "Open", "In review", "Resolved 3 Mar 2027" for a claim's chip. */
export const claimChipText = (c: Pick<WarrantyClaim, 'status' | 'resolvedOn'>): string =>
    (c.status === 'resolved' || c.status === 'denied') && c.resolvedOn ? `${claimStatusLabel(c.status)} ${formatDay(c.resolvedOn)}` : claimStatusLabel(c.status);

/** "1 open claim" / "3 open claims" ('' when none). Open = open + in review. */
export function openClaimsText(o: Pick<WarrantyOverview, 'claims'>): string {
    const n = o.claims.active;
    return n > 0 ? `${n} open claim${n === 1 ? '' : 's'}` : '';
}

/* ------------------------------------------------------------------------------------- the list */

export type WarrantyBucketId = 'expiring' | 'active' | 'ended' | 'void';
export const WARRANTY_BUCKET_LABELS: Record<WarrantyBucketId, string> = { expiring: 'Ending soon', active: 'Active', ended: 'Ended', void: 'Void' };
const BUCKET_ORDER: WarrantyBucketId[] = ['expiring', 'active', 'ended', 'void'];

const bucketOf = (s: WarrantyStatus): WarrantyBucketId =>
    s === 'expiring' ? 'expiring' : s === 'expired' ? 'ended' : s === 'void' ? 'void' : 'active';

/**
 * Groups warranties: Ending soon, Active (lifetime and "no end date" too), Ended, Void. Inside a group the ones with an
 * open claim come first, then the soonest end (no end last). Empty groups are left out.
 */
export function warrantyBuckets<T extends { overview: Pick<WarrantyOverview, 'status' | 'expiresOn' | 'claims'> }>(items: readonly T[]): Array<{ id: WarrantyBucketId; label: string; items: T[] }> {
    const by = new Map<WarrantyBucketId, T[]>();
    for (const it of items) {
        const id = bucketOf(it.overview.status);
        by.set(id, [...(by.get(id) ?? []), it]);
    }
    return BUCKET_ORDER.filter(id => by.has(id)).map(id => ({
        id,
        label: WARRANTY_BUCKET_LABELS[id],
        items: [...(by.get(id) as T[])].sort((a, b) => {
            const ca = a.overview.claims.active > 0 ? 0 : 1;
            const cb = b.overview.claims.active > 0 ? 0 : 1;
            if (ca !== cb) return ca - cb;
            const ea = a.overview.expiresOn ?? '9999-12-31';
            const eb = b.overview.expiresOn ?? '9999-12-31';
            return ea < eb ? -1 : ea > eb ? 1 : 0;
        }),
    }));
}

/**
 * The same overview worked out again for another day. A list kept on the device (offline) was written on an earlier day:
 * its end date is still right, but "Active" may have become "Ending soon" or "Ended".
 */
export function refreshOverview<T extends Pick<WarrantyOverview, 'status' | 'daysLeft' | 'expiresOn' | 'lifetime' | 'tracking'>>(o: T, today: string): T {
    if (o.tracking?.voidedAt || o.lifetime || !o.expiresOn) return o;
    const daysLeft = diffDays(o.expiresOn, today);
    const status: WarrantyStatus = daysLeft < 0 ? 'expired' : daysLeft <= WARRANTY_LIMITS.expiringDays ? 'expiring' : 'active';
    return { ...o, daysLeft, status };
}

/** The overview of a warranty document as the job page holds it (form data + created_at). */
export const overviewOfDocument = (data: Data | null | undefined, createdAt: string | null | undefined, today: string): WarrantyOverview =>
    warrantyOverview(data ?? {}, today, { createdAt: createdAt ?? null });

/* -------------------------------------------------------------------------- after-the-job settings */

/** [60, 30, 7, 0] -> "60, 30, 7, 0" */
export const offsetsText = (offsets: readonly number[]): string => offsets.join(', ');

export interface OffsetsParse {
    offsets: number[];
    /** a plain sentence when the text can't be used, else null */
    problem: string | null;
}

const KIND_RANGE_TEXT: Record<PostJobKind, string> = {
    completion: `Use whole days from ${POST_JOB_RULES.completion.min} to ${POST_JOB_RULES.completion.max}, at most ${POST_JOB_RULES.completion.maxCount} numbers.`,
    maintenance: `Use whole days from ${POST_JOB_RULES.maintenance.min} to ${POST_JOB_RULES.maintenance.max}, at most ${POST_JOB_RULES.maintenance.maxCount} numbers.`,
    warranty: `Use whole days from ${POST_JOB_RULES.warranty.min} (the day it ends) to ${POST_JOB_RULES.warranty.max}, at most ${POST_JOB_RULES.warranty.maxCount} numbers.`,
};

/** "3" / "180, 365" / "60 30 7 0" -> clean offsets for the kind, or a sentence saying what to fix. */
export function parseOffsetsText(kind: PostJobKind, text: string): OffsetsParse {
    const parts = String(text ?? '').split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return { offsets: [], problem: 'Enter at least one number of days.' };
    const numbers = parts.map(Number);
    if (numbers.some(n => !Number.isFinite(n))) return { offsets: [], problem: 'Use numbers only, like 60, 30, 7.' };
    const offsets = normalizePostJobOffsets(kind, numbers);
    if (!offsets.length || offsets.length < new Set(numbers.map(Math.trunc)).size) return { offsets, problem: KIND_RANGE_TEXT[kind] };
    return { offsets, problem: null };
}

const numberList = (nums: readonly number[]): string =>
    nums.length <= 1 ? String(nums[0] ?? '') : `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;

/** "60, 30 and 7 days before it ends and on the day it ends" for a list of warranty offsets (0 = the day it ends). */
export function warrantyOffsetsPhrase(offsets: readonly number[]): string {
    const before = offsets.filter(n => n > 0);
    const parts: string[] = [];
    if (before.length) parts.push(`${numberList(before)} day${before.length === 1 && before[0] === 1 ? '' : 's'} before it ends`);
    if (offsets.includes(0)) parts.push('on the day it ends');
    return parts.join(' and ');
}

/** The warranty email schedule in one sentence, from the account's settings. */
export function warrantyScheduleText(s: Pick<PostJobSettings, 'warranty'>): string {
    const client = `The client is emailed ${warrantyOffsetsPhrase(s.warranty.offsets)}.`;
    const owner = s.warranty.notifyOwner && s.warranty.ownerOffsets.length ? ` You get a note ${warrantyOffsetsPhrase(s.warranty.ownerOffsets)}.` : '';
    return client + owner;
}

/** Words for the warranty step list under a row: "client, 30 days before" etc. are built by postJobStepLabel. */
export const AUDIENCE_LABELS = { client: 'Client', owner: 'You' } as const;
