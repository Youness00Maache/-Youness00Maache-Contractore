// Papers vault (competitor gap #17): WHEN to remind about an expiring insurance certificate, license, permit or bond
// (pure logic, no I/O). Shared by the `reminders` edge function (Deno: the email to the contractor), the app
// (lib/papers.ts: the vault screen and the notification bell) and scripts/field-features-check.ts (Node), so the app
// shows the dates the server uses.
//
// Rules
//   * A paper with an expiry date has reminder steps 30, 7 and 1 days before it (the user can change them per paper).
//   * Only the LATEST step that is due is sent (a paper added 5 days before expiry gets the 1-day reminder, not three
//     at once), never on a day before the paper was added to the vault, never after the expiry date.
//   * Every send is recorded under a dedupe key (paper:<id>:<expiry date>:-<offset>) that is UNIQUE in the database,
//     so a step is never sent twice. A renewed paper (new expiry date) starts a new schedule.
import { addDays, diffDays } from './schedule.ts';

export type PaperKind = 'coi' | 'license' | 'permit' | 'bond' | 'w9' | 'other';

export const PAPER_KINDS: ReadonlyArray<{ value: PaperKind; label: string; short: string; hint: string }> = [
  { value: 'coi', label: 'Insurance certificate (COI)', short: 'COI', hint: 'General liability, workers’ comp, auto' },
  { value: 'license', label: 'License', short: 'License', hint: 'Contractor or trade license' },
  { value: 'permit', label: 'Permit', short: 'Permit', hint: 'Building, electrical, plumbing… (link it to the job)' },
  { value: 'bond', label: 'Bond', short: 'Bond', hint: 'License or surety bond' },
  { value: 'w9', label: 'W-9', short: 'W-9', hint: 'Tax form for clients and GCs' },
  { value: 'other', label: 'Other', short: 'Other', hint: 'Certifications, safety training…' },
];

export const paperKindLabel = (kind: unknown): string => PAPER_KINDS.find((k) => k.value === kind)?.label || 'Document';
export const paperKindShort = (kind: unknown): string => PAPER_KINDS.find((k) => k.value === kind)?.short || 'Document';

/** Default reminder steps: days before the expiry date. */
export const PAPER_REMINDER_OFFSETS: readonly number[] = [30, 7, 1];
export const PAPER_OFFSET_LIMITS = { min: 1, max: 120, maxCount: 4 } as const;

export type ExpiryState = 'none' | 'ok' | 'soon' | 'urgent' | 'expired';

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;
const ymdOf = (v: unknown): string => {
  const m = typeof v === 'string' ? YMD.exec(v.trim()) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

/**
 * Where a paper stands today: none (no expiry date), ok (> 30 days), soon (8-30 days), urgent (0-7 days),
 * expired (the day after the expiry date). `days` = days left (negative once expired).
 */
export const expiryState = (expiresOn: unknown, today: string): { state: ExpiryState; days: number | null } => {
  const exp = ymdOf(expiresOn);
  if (!exp || !ymdOf(today)) return { state: 'none', days: null };
  const days = diffDays(exp, today);
  if (days < 0) return { state: 'expired', days };
  if (days <= 7) return { state: 'urgent', days };
  if (days <= 30) return { state: 'soon', days };
  return { state: 'ok', days };
};

/** "expires today", "expires tomorrow", "expires in 7 days", "expired 3 days ago". */
export const expiryPhrase = (days: number | null): string => {
  if (days === null) return 'no expiry date';
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  if (days > 1) return `expires in ${days} days`;
  if (days === -1) return 'expired yesterday';
  return `expired ${-days} days ago`;
};

/** Valid, de-duplicated offsets, largest first (falls back to the defaults). */
export const normalizePaperOffsets = (offsets: unknown): number[] => {
  const list = Array.isArray(offsets) ? offsets : [];
  const clean = [...new Set(list.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n >= PAPER_OFFSET_LIMITS.min && n <= PAPER_OFFSET_LIMITS.max))]
    .sort((a, b) => b - a)
    .slice(0, PAPER_OFFSET_LIMITS.maxCount);
  return Array.isArray(offsets) ? clean : [...PAPER_REMINDER_OFFSETS];
};

export interface PaperStep {
  /** days before expiry */
  offset: number;
  /** YYYY-MM-DD the step is due */
  date: string;
}

/** Every reminder step of a paper, earliest first. */
export const paperReminderSteps = (expiresOn: unknown, offsets: unknown = PAPER_REMINDER_OFFSETS): PaperStep[] => {
  const exp = ymdOf(expiresOn);
  if (!exp) return [];
  return normalizePaperOffsets(offsets).map((offset) => ({ offset, date: addDays(exp, -offset) })).sort((a, b) => a.date.localeCompare(b.date));
};

export const paperDedupeKey = (paperId: string, expiresOn: string, offset: number): string => `paper:${paperId}:${ymdOf(expiresOn)}:-${offset}`;

/**
 * The step to send today, or null. `sent` = offsets already recorded for THIS expiry date (sent, failed for good or
 * skipped); `addedOn` = local day the paper was added (steps before it are dropped).
 */
export const duePaperStep = (input: {
  expiresOn: unknown;
  offsets?: unknown;
  today: string;
  addedOn?: string | null;
  sent?: ReadonlySet<number> | readonly number[];
  enabled?: boolean;
}): PaperStep | null => {
  if (input.enabled === false) return null;
  const exp = ymdOf(input.expiresOn);
  if (!exp || input.today > exp) return null;
  const sent = new Set(input.sent ?? []);
  const added = ymdOf(input.addedOn ?? '') || '';
  const due = paperReminderSteps(exp, input.offsets ?? PAPER_REMINDER_OFFSETS)
    .filter((s) => s.date <= input.today && (!added || s.date >= added));
  const latest = due[due.length - 1];
  if (!latest || sent.has(latest.offset)) return null;
  // a later step already went out (e.g. the offsets were changed): never go back to an earlier one
  if ([...sent].some((o) => o < latest.offset)) return null;
  return latest;
};

/** The next planned step (for "Next reminder: Nov 24" in the app), or null. */
export const nextPaperStep = (input: { expiresOn: unknown; offsets?: unknown; today: string; sent?: readonly number[] }): PaperStep | null => {
  const sent = new Set(input.sent ?? []);
  return paperReminderSteps(input.expiresOn, input.offsets ?? PAPER_REMINDER_OFFSETS).find((s) => s.date >= input.today && !sent.has(s.offset)) ?? null;
};

const fmtLong = (ymd: string): string => {
  const m = YMD.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const escHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** The reminder email the contractor gets about their own paper (sent from and to their own Gmail). */
export const paperReminderEmail = (input: {
  title: string;
  kind: unknown;
  number?: string | null;
  issuer?: string | null;
  expiresOn: string;
  today: string;
  appUrl: string;
}): { subject: string; text: string; html: string } => {
  const days = diffDays(ymdOf(input.expiresOn), input.today);
  const what = input.title || paperKindLabel(input.kind);
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const subject = `Reminder: ${what} expires ${when} (${fmtLong(input.expiresOn)})`.slice(0, 200);
  const details = [
    `${paperKindLabel(input.kind)}: ${what}`,
    input.number ? `Number: ${input.number}` : '',
    input.issuer ? `Issued by: ${input.issuer}` : '',
    `Expires: ${fmtLong(input.expiresOn)}`,
  ].filter(Boolean);
  const link = `${input.appUrl.replace(/\/+$/, '')}/papers`;
  const text = [
    `Your ${what} expires ${when}.`,
    '',
    ...details,
    '',
    'Renew it, then upload the new copy and its new expiry date in ContractorDocs (Papers):',
    link,
    '',
    'You set this reminder in your papers vault. Clients and GCs often ask for current certificates before they pay.',
  ].join('\n');
  const html = `<p>Your <strong>${escHtml(what)}</strong> expires <strong>${escHtml(when)}</strong>.</p><p>${details.map(escHtml).join('<br>')}</p><p>Renew it, then upload the new copy and its new expiry date in <a href="${escHtml(link)}">ContractorDocs › Papers</a>.</p><p style="color:#64748b;font-size:12px">You set this reminder in your papers vault.</p>`;
  return { subject, text, html };
};
