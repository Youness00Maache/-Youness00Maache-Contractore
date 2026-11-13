// Automatic reminders: WHEN to send what (pure logic, no I/O).
// Shared by the `reminders` edge function (Deno), the app (components/reminders via lib/reminders.ts) and the
// checks in scripts/reminders-check.ts (Node), so the dates shown in the app are the dates the server uses.
//
// Model
//   * A target is an invoice, an estimate or a job visit. Each kind has a list of day offsets from an anchor date:
//       invoice  anchor = due date             default 0, +7, +14  ("due", "7 days late", "14 days late")
//       estimate anchor = day it was sent      default +3, +7
//       visit    anchor = job start date       default -1          ("the day before")
//   * A step is sent on its date at `sendHour` in the user's time zone (or at the next run after that).
//   * Only the LATEST step that is due is ever sent (older unsent steps are superseded, so a pause or an outage
//     never produces a burst), and only within `catchUpDays` of its date (a step that is days late is "missed").
//   * Steps on or before the day the document was sent are dropped (the client just got it).
//   * Turning reminders ON for one document/job (explicit opt-in) moves its past steps to the opt-in day, so
//     the client gets one reminder now and the rest of the schedule after that.
//   * Every send is recorded under a dedupe key (kind:target:step:date) that is UNIQUE in the database, so a
//     step is never sent twice; at most one reminder per target per run, and never two within `minGapHours`.

export type ReminderKind = 'invoice' | 'estimate' | 'visit';
export type TemplateKey = 'invoice_due' | 'invoice_overdue' | 'estimate' | 'visit';
export type RecordStatus = 'sending' | 'sent' | 'failed' | 'skipped';

export interface MessageTemplate {
  subject: string;
  body: string;
}

export const REMINDER_KINDS: ReminderKind[] = ['invoice', 'estimate', 'visit'];

export const REMINDER_RULES = {
  /** a due step is still sent this many days after its date (then it counts as missed) */
  catchUpDays: 2,
  /** retries of a failed send (Gmail busy, token refresh failed) before giving up */
  maxAttempts: 3,
  /** never two reminders for the same document/job closer than this */
  minGapHours: 20,
  /** a send that started but never finished is closed as "interrupted" after this (never retried) */
  staleSendingMinutes: 15,
  offsets: {
    invoice: { min: -30, max: 120, maxCount: 6 },
    estimate: { min: 1, max: 60, maxCount: 6 },
    visit: { min: -14, max: -1, maxCount: 4 },
  },
} as const;

export const DEFAULT_TIMEZONE = 'America/New_York';
export const DEFAULT_SEND_HOUR = 9;

export interface KindSettings {
  enabled: boolean;
  offsets: number[];
}

export interface ReminderSettings {
  /** master switch: off = nothing is sent, not even for documents switched on one by one */
  enabled: boolean;
  invoice: KindSettings;
  estimate: KindSettings;
  visit: KindSettings;
  /** local hour (0-23) */
  sendHour: number;
  timezone: string;
  /** custom wording; a missing or empty template uses DEFAULT_TEMPLATES (messages.ts) */
  templates: Partial<Record<TemplateKey, MessageTemplate>>;
  /** Premium+AI hook (not built yet): let the AI write each message */
  aiWording: boolean;
  /** Gmail account to send from (null = the default account) */
  accountId: string | null;
}

export const DEFAULT_OFFSETS: Record<ReminderKind, number[]> = {
  invoice: [0, 7, 14],
  estimate: [3, 7],
  visit: [-1],
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  invoice: { enabled: true, offsets: DEFAULT_OFFSETS.invoice },
  estimate: { enabled: true, offsets: DEFAULT_OFFSETS.estimate },
  visit: { enabled: false, offsets: DEFAULT_OFFSETS.visit },
  sendHour: DEFAULT_SEND_HOUR,
  timezone: DEFAULT_TIMEZONE,
  templates: {},
  aiWording: false,
  accountId: null,
};

/** Row of public.reminder_settings (snake_case, as stored). */
export interface ReminderSettingsRow {
  user_id?: string;
  enabled?: boolean | null;
  invoice_enabled?: boolean | null;
  invoice_offsets?: number[] | null;
  estimate_enabled?: boolean | null;
  estimate_offsets?: number[] | null;
  visit_enabled?: boolean | null;
  visit_offsets?: number[] | null;
  send_hour?: number | null;
  timezone?: string | null;
  templates?: Record<string, unknown> | null;
  ai_wording?: boolean | null;
  account_id?: string | null;
}

export const TEMPLATE_KEYS: TemplateKey[] = ['invoice_due', 'invoice_overdue', 'estimate', 'visit'];

const TEMPLATE_LIMITS = { subject: 200, body: 2000 };

/** Sorted, unique, whole days within the kind's range (at most maxCount). */
export function normalizeOffsets(kind: ReminderKind, offsets: unknown): number[] {
  const rule = REMINDER_RULES.offsets[kind];
  const list = Array.isArray(offsets) ? offsets : [];
  const out = new Set<number>();
  for (const raw of list) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    const day = Math.trunc(n);
    if (day < rule.min || day > rule.max) continue;
    out.add(day);
  }
  return [...out].sort((a, b) => a - b).slice(0, rule.maxCount);
}

export function normalizeTemplates(value: unknown): Partial<Record<TemplateKey, MessageTemplate>> {
  const out: Partial<Record<TemplateKey, MessageTemplate>> = {};
  if (!value || typeof value !== 'object') return out;
  for (const key of TEMPLATE_KEYS) {
    const t = (value as Record<string, unknown>)[key];
    if (!t || typeof t !== 'object') continue;
    const subject = String((t as Record<string, unknown>).subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, TEMPLATE_LIMITS.subject);
    const body = String((t as Record<string, unknown>).body ?? '').replace(/\r\n?/g, '\n').trim().slice(0, TEMPLATE_LIMITS.body);
    if (subject || body) out[key] = { subject, body };
  }
  return out;
}

export const clampHour = (h: unknown): number => {
  const n = Math.trunc(Number(h));
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : DEFAULT_SEND_HOUR;
};

export function settingsFromRow(row: ReminderSettingsRow | null | undefined): ReminderSettings {
  if (!row) return { ...DEFAULT_REMINDER_SETTINGS, templates: {} };
  const kind = (k: ReminderKind, enabled: boolean | null | undefined, offsets: number[] | null | undefined): KindSettings => ({
    enabled: enabled ?? DEFAULT_REMINDER_SETTINGS[k].enabled,
    offsets: offsets == null ? DEFAULT_OFFSETS[k] : normalizeOffsets(k, offsets),
  });
  return {
    enabled: row.enabled ?? true,
    invoice: kind('invoice', row.invoice_enabled, row.invoice_offsets),
    estimate: kind('estimate', row.estimate_enabled, row.estimate_offsets),
    visit: kind('visit', row.visit_enabled, row.visit_offsets),
    sendHour: row.send_hour == null ? DEFAULT_SEND_HOUR : clampHour(row.send_hour),
    timezone: safeTimezone(row.timezone),
    templates: normalizeTemplates(row.templates),
    aiWording: !!row.ai_wording,
    accountId: row.account_id || null,
  };
}

export function settingsToRow(s: ReminderSettings): Omit<ReminderSettingsRow, 'user_id'> {
  return {
    enabled: !!s.enabled,
    invoice_enabled: !!s.invoice.enabled,
    invoice_offsets: normalizeOffsets('invoice', s.invoice.offsets),
    estimate_enabled: !!s.estimate.enabled,
    estimate_offsets: normalizeOffsets('estimate', s.estimate.offsets),
    visit_enabled: !!s.visit.enabled,
    visit_offsets: normalizeOffsets('visit', s.visit.offsets),
    send_hour: clampHour(s.sendHour),
    timezone: safeTimezone(s.timezone),
    templates: normalizeTemplates(s.templates) as Record<string, unknown>,
    ai_wording: !!s.aiWording,
    account_id: s.accountId || null,
  };
}

/* ------------------------------------------------------------------------------------------- dates */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** 'YYYY-MM-DD' (the leading date of any ISO-ish string), or null when it is not a real calendar date. */
export function toYmd(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = YMD_RE.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const ymdToUtcMs = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

const utcMsToYmd = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const addDays = (ymd: string, days: number): string => utcMsToYmd(ymdToUtcMs(ymd) + days * 86_400_000);

/** a − b in whole calendar days. */
export const diffDays = (a: string, b: string): number => Math.round((ymdToUtcMs(a) - ymdToUtcMs(b)) / 86_400_000);

export const maxYmd = (a: string | null, b: string | null): string | null => (!a ? b : !b ? a : a >= b ? a : b);

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

/** A valid IANA time zone name, else DEFAULT_TIMEZONE. */
export function safeTimezone(tz: unknown): string {
  const name = typeof tz === 'string' ? tz.trim() : '';
  if (!name || name.length > 64 || !/^[A-Za-z0-9_+/-]+$/.test(name)) return DEFAULT_TIMEZONE;
  try {
    zonedFormatter(name).format(new Date(0));
    return name;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Local calendar date and hour of an instant in a time zone. */
export function zonedNow(now: Date, tz: string): { ymd: string; hour: number } {
  const parts = zonedFormatter(safeTimezone(tz)).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const hour = Number(get('hour')) % 24;
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

/** Local calendar date of an ISO timestamp (a plain 'YYYY-MM-DD' is returned as is). */
export function instantYmd(value: unknown, tz: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return toYmd(s);
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return toYmd(s);
  return zonedNow(new Date(ms), tz).ymd;
}

/* ------------------------------------------------------------------------------------- targets */

/** What the scheduler needs to know about one invoice, estimate or job. */
export interface TargetFacts {
  kind: ReminderKind;
  /** document id (invoice / estimate) or job id (visit) */
  id: string;
  createdAt?: string | null;
  /** document status (invoice / estimate) */
  status?: string | null;
  dueDate?: string | null;
  issueDate?: string | null;
  /** when the status became Sent (public.reminder_document_state) */
  sentAt?: string | null;
  expiryDate?: string | null;
  /** client signed / approved (estimate) */
  signed?: boolean;
  /** client declined (estimate) */
  declined?: boolean;
  /** invoice / estimate total and what is still owed (invoice) */
  total?: number | null;
  balanceDue?: number | null;
  /** the client said "I've paid" (invoice) */
  paymentReported?: boolean;
  /** job (visit) */
  startDate?: string | null;
  jobStatus?: string | null;
}

export type StopReason =
  | 'not_sent'
  | 'paid'
  | 'cancelled'
  | 'payment_reported'
  | 'nothing_due'
  | 'approved'
  | 'declined'
  | 'expired'
  | 'job_inactive'
  | 'visit_passed'
  | 'no_date';

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** Why reminders stop for this target today (null = keep going). */
export function stopReason(t: TargetFacts, today: string): StopReason | null {
  if (t.kind === 'invoice') {
    const s = norm(t.status);
    if (s === 'paid') return 'paid';
    if (s === 'cancelled' || s === 'canceled' || s === 'void') return 'cancelled';
    if (s !== 'sent' && s !== 'overdue') return 'not_sent';
    if (t.paymentReported) return 'payment_reported';
    if (t.balanceDue != null && t.balanceDue <= 0.004) return t.total != null && t.total > 0 ? 'paid' : 'nothing_due';
    if (!toYmd(t.dueDate)) return 'no_date';
    return null;
  }
  if (t.kind === 'estimate') {
    const s = norm(t.status);
    if (t.signed || s === 'accepted' || s === 'approved' || s === 'signed') return 'approved';
    if (t.declined || s === 'rejected' || s === 'declined') return 'declined';
    if (s !== 'sent') return 'not_sent';
    const expiry = toYmd(t.expiryDate);
    if (expiry && expiry < today) return 'expired';
    return null;
  }
  // visit
  if (norm(t.jobStatus || 'active') !== 'active') return 'job_inactive';
  const start = toYmd(t.startDate);
  if (!start) return 'no_date';
  if (today >= start) return 'visit_passed';
  return null;
}

export interface OverrideFlag {
  enabled: boolean;
  updatedAt?: string | null;
}

export interface TargetOverrides {
  document?: OverrideFlag | null;
  job?: OverrideFlag | null;
  client?: OverrideFlag | null;
}

export type EligibilitySource = 'paused' | 'document' | 'job' | 'client' | 'account' | 'older';

export interface Eligibility {
  on: boolean;
  source: EligibilitySource;
  /** day reminders were switched on explicitly for this document/job (past steps move to it) */
  optInDate: string | null;
}

/**
 * Are automatic reminders on for this target?
 *   master switch off            -> off ('paused'), whatever else is set
 *   document / job switch        -> that switch ('document' / 'job')
 *   client switched off          -> off ('client')
 *   kind switched off in settings-> off ('account')
 *   invoice/estimate created before the feature launched -> off ('older'; switch it on per document)
 *   otherwise                    -> on ('account')
 */
export function eligibility(
  t: Pick<TargetFacts, 'kind' | 'createdAt'>,
  settings: ReminderSettings,
  overrides: TargetOverrides,
  launchedAt: string | null,
  tz: string,
): Eligibility {
  if (!settings.enabled) return { on: false, source: 'paused', optInDate: null };
  const own = t.kind === 'visit' ? overrides.job : overrides.document;
  if (own) {
    return {
      on: !!own.enabled,
      source: t.kind === 'visit' ? 'job' : 'document',
      optInDate: own.enabled ? instantYmd(own.updatedAt ?? null, tz) : null,
    };
  }
  if (overrides.client && !overrides.client.enabled) return { on: false, source: 'client', optInDate: null };
  if (!settings[t.kind].enabled) return { on: false, source: 'account', optInDate: null };
  if (t.kind !== 'visit' && launchedAt) {
    const created = Date.parse(String(t.createdAt ?? ''));
    const launched = Date.parse(launchedAt);
    if (Number.isFinite(created) && Number.isFinite(launched) && created < launched) {
      return { on: false, source: 'older', optInDate: null };
    }
  }
  return { on: true, source: 'account', optInDate: null };
}

/* --------------------------------------------------------------------------------------- steps */

export interface PlannedStep {
  /** 'due+7', 'due-3', 'sent+3', 'start-1' */
  stepKey: string;
  offset: number;
  /** anchor + offset (part of the dedupe key; never changes when the step is moved) */
  date: string;
  /** the day it goes out (later than `date` when moved to the opt-in day) */
  sendDate: string;
  shifted: boolean;
  templateKey: TemplateKey;
}

const STEP_PREFIX: Record<ReminderKind, string> = { invoice: 'due', estimate: 'sent', visit: 'start' };

export const stepKeyFor = (kind: ReminderKind, offset: number): string =>
  `${STEP_PREFIX[kind]}${offset < 0 ? '-' : '+'}${Math.abs(offset)}`;

export const templateKeyFor = (kind: ReminderKind, offset: number): TemplateKey =>
  kind === 'invoice' ? (offset <= 0 ? 'invoice_due' : 'invoice_overdue') : kind;

/** Calendar day the document went to the client: status-Sent time, else created, else issue date. */
export function sentDay(t: TargetFacts, tz: string): string | null {
  return instantYmd(t.sentAt ?? null, tz) ?? instantYmd(t.createdAt ?? null, tz) ?? toYmd(t.issueDate);
}

/** The date the offsets count from. */
export function anchorDate(t: TargetFacts, tz: string): string | null {
  if (t.kind === 'invoice') return toYmd(t.dueDate);
  if (t.kind === 'estimate') return instantYmd(t.sentAt ?? null, tz) ?? toYmd(t.issueDate) ?? instantYmd(t.createdAt ?? null, tz);
  return toYmd(t.startDate);
}

/** All steps of a target with their send dates (see the rules at the top of this file). */
export function planSteps(t: TargetFacts, offsets: number[], opts: { tz: string; optInDate?: string | null }): PlannedStep[] {
  const anchor = anchorDate(t, opts.tz);
  if (!anchor) return [];
  let floor: string | null;
  if (t.kind === 'visit') {
    floor = instantYmd(t.createdAt ?? null, opts.tz); // a visit booked today can be reminded today
  } else {
    const sent = sentDay(t, opts.tz);
    floor = sent ? addDays(sent, 1) : null;
  }
  const optIn = opts.optInDate ? toYmd(opts.optInDate) : null;
  const shiftTo = optIn ? maxYmd(floor, optIn) : null;

  const byDay = new Map<string, PlannedStep>();
  for (const offset of normalizeOffsets(t.kind, offsets)) {
    const date = addDays(anchor, offset);
    let sendDate = date;
    let shifted = false;
    if (shiftTo && date < shiftTo) {
      sendDate = shiftTo;
      shifted = true;
    } else if (floor && date < floor) {
      continue;
    }
    const step: PlannedStep = { stepKey: stepKeyFor(t.kind, offset), offset, date, sendDate, shifted, templateKey: templateKeyFor(t.kind, offset) };
    const existing = byDay.get(sendDate);
    if (!existing || existing.offset < offset) byDay.set(sendDate, step); // same day: the later step wins
  }
  return [...byDay.values()].sort((a, b) => (a.sendDate < b.sendDate ? -1 : a.sendDate > b.sendDate ? 1 : a.offset - b.offset));
}

export const dedupeKey = (kind: ReminderKind, targetId: string, stepKey: string, date: string): string =>
  `${kind}:${targetId}:${stepKey}:${date}`;

/* ---------------------------------------------------------------------------------- decisions */

export interface RecordedReminder {
  id?: string;
  dedupeKey: string;
  status: RecordStatus;
  reason?: string | null;
  attempts?: number | null;
  sentAt?: string | null;
  createdAt?: string | null;
}

/** Failures that may be retried: nothing reached Gmail, or Gmail said "try later". */
export const RETRYABLE_REASONS = new Set(['gmail_rate_limit', 'gmail_error', 'refresh_failed', 'not_configured', 'internal']);
export const isRetryable = (r: RecordedReminder): boolean =>
  r.status === 'failed' && RETRYABLE_REASONS.has(String(r.reason || '')) && (r.attempts ?? 0) < REMINDER_RULES.maxAttempts;

export interface DecisionInput {
  facts: TargetFacts;
  settings: ReminderSettings;
  overrides: TargetOverrides;
  launchedAt: string | null;
  recorded: RecordedReminder[];
  now: Date;
}

export type DueDecision =
  | { action: 'none'; why: 'off' | 'stopped' | 'no_steps' | 'not_yet' | 'missed' | 'done' | 'in_flight' | 'gap'; stop?: StopReason }
  | { action: 'send'; step: PlannedStep; dedupeKey: string; retry: RecordedReminder | null };

const isDueNow = (sendDate: string, today: string, hour: number, sendHour: number) =>
  sendDate < today || (sendDate === today && hour >= sendHour);

/** Should a reminder for this target go out now? (The server's decision; at most one step per target.) */
export function decideDue(input: DecisionInput): DueDecision {
  const { facts, settings } = input;
  const tz = safeTimezone(settings.timezone);
  const { ymd: today, hour } = zonedNow(input.now, tz);
  const elig = eligibility(facts, settings, input.overrides, input.launchedAt, tz);
  if (!elig.on) return { action: 'none', why: 'off' };
  const stop = stopReason(facts, today);
  if (stop) return { action: 'none', why: 'stopped', stop };
  const steps = planSteps(facts, settings[facts.kind].offsets, { tz, optInDate: elig.optInDate });
  if (!steps.length) return { action: 'none', why: 'no_steps' };
  const due = steps.filter((s) => isDueNow(s.sendDate, today, hour, settings.sendHour));
  if (!due.length) return { action: 'none', why: 'not_yet' };
  const latest = due[due.length - 1];
  if (diffDays(today, latest.sendDate) > REMINDER_RULES.catchUpDays) return { action: 'none', why: 'missed' };

  const key = dedupeKey(facts.kind, facts.id, latest.stepKey, latest.date);
  const rec = input.recorded.find((r) => r.dedupeKey === key) ?? null;
  if (rec) {
    if (rec.status === 'sending') return { action: 'none', why: 'in_flight' };
    if (!isRetryable(rec)) return { action: 'none', why: 'done' };
  }
  const lastSent = input.recorded
    .filter((r) => r.status === 'sent' && r.sentAt)
    .reduce((max, r) => Math.max(max, Date.parse(String(r.sentAt)) || 0), 0);
  if (lastSent && input.now.getTime() - lastSent < REMINDER_RULES.minGapHours * 3_600_000) return { action: 'none', why: 'gap' };
  return { action: 'send', step: latest, dedupeKey: key, retry: rec };
}

/* ------------------------------------------------------------------------------- app overview */

export type StepState = 'sent' | 'skipped' | 'failed' | 'sending' | 'planned' | 'due' | 'missed' | 'superseded';

export interface StepView extends PlannedStep {
  state: StepState;
  dedupeKey: string;
  record: RecordedReminder | null;
}

export interface TargetPlan {
  today: string;
  timezone: string;
  eligibility: Eligibility;
  stop: StopReason | null;
  /** reminders will go out for this target (on, not stopped) */
  active: boolean;
  steps: StepView[];
  /** next step that will go out (planned or due), when active */
  next: StepView | null;
}

/** Every step of a target with its state, for the app (document panel, upcoming list). */
export function planTarget(input: DecisionInput): TargetPlan {
  const { facts, settings } = input;
  const tz = safeTimezone(settings.timezone);
  const { ymd: today, hour } = zonedNow(input.now, tz);
  const elig = eligibility(facts, settings, input.overrides, input.launchedAt, tz);
  const stop = stopReason(facts, today);
  const steps = planSteps(facts, settings[facts.kind].offsets, { tz, optInDate: elig.optInDate });
  const pastIdx = steps.reduce((idx, s, i) => (isDueNow(s.sendDate, today, hour, settings.sendHour) ? i : idx), -1);
  const views: StepView[] = steps.map((s, i) => {
    const key = dedupeKey(facts.kind, facts.id, s.stepKey, s.date);
    const record = input.recorded.find((r) => r.dedupeKey === key) ?? null;
    let state: StepState;
    if (record) {
      state = record.status === 'failed' && isRetryable(record) && i === pastIdx ? 'due' : record.status;
    } else if (i > pastIdx) {
      state = 'planned';
    } else if (i < pastIdx) {
      state = 'superseded';
    } else {
      state = diffDays(today, s.sendDate) > REMINDER_RULES.catchUpDays ? 'missed' : 'due';
    }
    return { ...s, state, dedupeKey: key, record };
  });
  const active = elig.on && !stop;
  const next = active ? views.find((v) => v.state === 'planned' || v.state === 'due') ?? null : null;
  return { today, timezone: tz, eligibility: elig, stop, active, steps: views, next };
}

/* --------------------------------------------------------------------------------- plan / cap */

export type EffectiveTier = 'free' | 'premium' | 'ai';

/** Same rule as public.effective_tier(): paid while active / past_due, or until the paid period ends. */
export function effectiveTier(tier: unknown, status: unknown, periodEnd: unknown, now: Date = new Date()): EffectiveTier {
  const t = norm(tier);
  const paidTier: EffectiveTier | null = t === 'premium' || t === 'pro' ? 'premium' : t === 'ai' || t === 'premium-ai' || t === 'premium_ai' ? 'ai' : null;
  if (!paidTier) return 'free';
  const s = norm(status) || 'none';
  if (s === 'active' || s === 'past_due' || s === 'none') return paidTier;
  if (s === 'cancelled' || s === 'paused') {
    const end = Date.parse(String(periodEnd ?? ''));
    if (Number.isFinite(end) && end > now.getTime()) return paidTier;
  }
  return 'free';
}

export interface EmailAllowance {
  paid: boolean;
  /** emails counted this calendar month (usage_events kind 'email') */
  used: number;
  /** null = unlimited */
  limit: number | null;
}

export const canSendEmail = (a: EmailAllowance): boolean => a.paid || a.limit === null || a.used < a.limit;

/* ------------------------------------------------------------------------------------- labels */

export function stepLabel(kind: ReminderKind, offset: number): string {
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  if (kind === 'invoice') {
    if (offset === 0) return 'On the due date';
    return offset < 0 ? `${days(-offset)} before due` : `${days(offset)} late`;
  }
  if (kind === 'estimate') return `${days(offset)} after sending`;
  return offset === -1 ? 'Day before the visit' : `${days(-offset)} before the visit`;
}

/** Short chip text for an offset: "Due", "+7", "−3", "Day before". */
export function offsetChip(kind: ReminderKind, offset: number): string {
  if (kind === 'invoice') return offset === 0 ? 'Due date' : offset > 0 ? `+${offset} days` : `${offset} days`;
  if (kind === 'estimate') return `+${offset} days`;
  return offset === -1 ? 'Day before' : `${-offset} days before`;
}

export const STOP_LABELS: Record<StopReason, string> = {
  not_sent: 'Starts when the status is Sent',
  paid: 'Paid',
  cancelled: 'Cancelled',
  payment_reported: 'Client reported a payment',
  nothing_due: 'Nothing left to pay',
  approved: 'Approved',
  declined: 'Declined',
  expired: 'Estimate expired',
  job_inactive: 'Job is not active',
  visit_passed: 'Visit date has passed',
  no_date: 'No date set',
};

/** Human text for the `reason` column of public.reminders. */
export const REASON_LABELS: Record<string, string> = {
  email_limit: 'Monthly email limit reached',
  no_email: 'Client has no email address',
  gmail_reconnect: 'Gmail needs to be reconnected',
  no_gmail: 'Gmail is not connected',
  skipped_by_user: 'Skipped by you',
  gmail_rate_limit: 'Gmail was busy',
  gmail_error: 'Gmail could not send it',
  gmail_rejected: 'Gmail rejected the message',
  gmail_api_disabled: 'Gmail sending is not enabled',
  refresh_failed: 'Google did not respond',
  not_configured: 'Email is not set up on the server',
  invalid_message: 'The message could not be built',
  interrupted: 'Sending was interrupted',
  internal: 'Something went wrong',
};
