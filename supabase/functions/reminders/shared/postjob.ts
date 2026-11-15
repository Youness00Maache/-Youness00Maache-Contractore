// After-the-job emails (roadmap D10 #37 / #40): three more reminder kinds, pure logic shared by the reminders edge
// function, the app (lib/warranty) and scripts/warranty-check.ts.
//
//   completion   a thank-you N days after a job is completed, with the owner's review link when set   -> client
//   warranty     the client's warranty ends in 60 / 30 / 7 days and on the day it ends, how to make a claim -> client
//                + a note to the OWNER (their own Gmail) on 30 days / the day it ends                      -> owner
//   maintenance  a short maintenance / service-due note N days after completion (owner-editable tip)    -> client
//
// Same machinery as the invoice / estimate / visit kinds (./schedule.ts): sent from the user's own Gmail at their
// reminder hour in their time zone, only the latest due step within `catchUpDays`, never twice (UNIQUE dedupe key in
// public.reminders, kind:target:step:date), the reminders master switch, per-document / per-client OFF switches
// (reminder_overrides), the email skip reasons and the dispatch loop (./dispatch.ts). Differences, on purpose:
//   * Premium only (paid plans), like the papers vault reminders. Free accounts are never planned.
//   * Off by default. Turning a kind on records `since` (that day): only jobs completed / steps falling on or after it
//     are emailed, so switching it on never mails a backlog of old jobs.
//   * A per-job or per-document switch can only turn these OFF (service plans switch visit reminders ON per job; that
//     must not start thank-you emails).
//   * completion / maintenance: a step is done once ANY record of kind:job:step exists, whatever its date, because
//     the completion day can move when a completed job is edited (jobs have no completion timestamp).
//
// Settings live in public.user_settings 'reminders.postjob' (no new column): PostJobSettings below.

import {
  addDays, diffDays, instantYmd, isRetryable, REMINDER_RULES, safeTimezone, toYmd, zonedNow,
  type MessageTemplate, type RecordedReminder, type ReminderSettings, type TargetOverrides,
} from './schedule.ts';
import { fillTemplate, formatLongDate, textToHtml, type RenderedReminder, type ReminderValues } from './messages.ts';

export type PostJobKind = 'completion' | 'warranty' | 'maintenance';
export const POST_JOB_KINDS: PostJobKind[] = ['completion', 'warranty', 'maintenance'];
export const isPostJobKind = (v: unknown): v is PostJobKind => typeof v === 'string' && (POST_JOB_KINDS as string[]).includes(v);

export type PostJobTemplateKey = 'completion' | 'warranty_client' | 'warranty_owner' | 'maintenance';
export const POST_JOB_TEMPLATE_KEYS: PostJobTemplateKey[] = ['completion', 'warranty_client', 'warranty_owner', 'maintenance'];

export type Audience = 'client' | 'owner';

export const POST_JOB_SETTING = 'reminders.postjob';

/** Offsets: completion / maintenance = days AFTER completion; warranty = days BEFORE the end (0 = the day it ends). */
export const POST_JOB_RULES = {
  completion: { min: 1, max: 60, maxCount: 2 },
  maintenance: { min: 14, max: 1825, maxCount: 6 },
  warranty: { min: 0, max: 120, maxCount: 4 },
  tipMax: 600,
} as const;

export const POST_JOB_DEFAULT_OFFSETS = {
  completion: [3],
  maintenance: [180, 365],
  warranty: [60, 30, 7, 0],
  warrantyOwner: [30, 0],
} as const;

export const DEFAULT_MAINTENANCE_TIP = 'A quick check now keeps everything working well and helps it last longer.';

export interface PostJobKindSettings {
  enabled: boolean;
  offsets: number[];
  /** YYYY-MM-DD the kind was switched on (null = never: nothing is sent) */
  since: string | null;
}

export interface PostJobSettings {
  v: 1;
  /** epoch ms of the last change (newest copy wins between devices) */
  at: number;
  completion: PostJobKindSettings & {
    /** add the review link (profiles.google_review_link) when it is set and no review request went out for the job */
    includeReview: boolean;
  };
  warranty: PostJobKindSettings & {
    /** email the owner too */
    notifyOwner: boolean;
    /** days before the end the owner is told (0 = the day it ends) */
    ownerOffsets: number[];
  };
  maintenance: PostJobKindSettings & {
    /** the owner's short tip, shown in the email ({tip}) */
    tip: string;
  };
  /** custom wording; a missing or empty template uses POST_JOB_TEMPLATES */
  templates: Partial<Record<PostJobTemplateKey, MessageTemplate>>;
}

export const defaultPostJobSettings = (): PostJobSettings => ({
  v: 1,
  at: 0,
  completion: { enabled: false, offsets: [...POST_JOB_DEFAULT_OFFSETS.completion], since: null, includeReview: true },
  warranty: { enabled: false, offsets: [...POST_JOB_DEFAULT_OFFSETS.warranty], since: null, notifyOwner: true, ownerOffsets: [...POST_JOB_DEFAULT_OFFSETS.warrantyOwner] },
  maintenance: { enabled: false, offsets: [...POST_JOB_DEFAULT_OFFSETS.maintenance], since: null, tip: DEFAULT_MAINTENANCE_TIP },
  templates: {},
});

/* ------------------------------------------------------------------------------------- settings */

/** Sorted (warranty: farthest first), unique whole days in the kind's range, at most maxCount. */
export function normalizePostJobOffsets(kind: PostJobKind, offsets: unknown): number[] {
  const rule = POST_JOB_RULES[kind];
  const out = new Set<number>();
  for (const raw of Array.isArray(offsets) ? offsets : []) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    const d = Math.trunc(n);
    if (d >= rule.min && d <= rule.max) out.add(d);
  }
  const list = [...out].sort((a, b) => (kind === 'warranty' ? b - a : a - b));
  return list.slice(0, rule.maxCount);
}

const TEMPLATE_LIMITS = { subject: 200, body: 2000 };

export function normalizePostJobTemplates(value: unknown): Partial<Record<PostJobTemplateKey, MessageTemplate>> {
  const out: Partial<Record<PostJobTemplateKey, MessageTemplate>> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const key of POST_JOB_TEMPLATE_KEYS) {
    const t = (value as Record<string, unknown>)[key];
    if (!t || typeof t !== 'object') continue;
    const subject = String((t as Record<string, unknown>).subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, TEMPLATE_LIMITS.subject);
    const body = String((t as Record<string, unknown>).body ?? '').replace(/\r\n?/g, '\n').trim().slice(0, TEMPLATE_LIMITS.body);
    if (subject || body) out[key] = { subject, body };
  }
  return out;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Stored value (user_settings 'reminders.postjob') -> settings; anything odd falls back to the default. Never throws. */
export function parsePostJobSettings(raw: unknown): PostJobSettings {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = null; }
  }
  const d = defaultPostJobSettings();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return d;
  const r = v as Record<string, unknown>;
  const kind = <K extends PostJobKind>(k: K) => {
    const s = obj(r[k]);
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d[k].enabled,
      offsets: Array.isArray(s.offsets) ? normalizePostJobOffsets(k, s.offsets) : [...d[k].offsets],
      since: toYmd(s.since),
      s,
    };
  };
  const c = kind('completion');
  const w = kind('warranty');
  const m = kind('maintenance');
  const at = typeof r.at === 'number' && Number.isFinite(r.at) && r.at > 0 && r.at < 1e14 ? Math.floor(r.at) : 0;
  const tip = typeof m.s.tip === 'string' ? m.s.tip.replace(/\r\n?/g, '\n').trim().slice(0, POST_JOB_RULES.tipMax) : DEFAULT_MAINTENANCE_TIP;
  return {
    v: 1,
    at,
    completion: { enabled: c.enabled, offsets: c.offsets, since: c.since, includeReview: typeof c.s.includeReview === 'boolean' ? c.s.includeReview : true },
    warranty: {
      enabled: w.enabled, offsets: w.offsets, since: w.since,
      notifyOwner: typeof w.s.notifyOwner === 'boolean' ? w.s.notifyOwner : true,
      ownerOffsets: Array.isArray(w.s.ownerOffsets) ? normalizePostJobOffsets('warranty', w.s.ownerOffsets) : [...POST_JOB_DEFAULT_OFFSETS.warrantyOwner],
    },
    maintenance: { enabled: m.enabled, offsets: m.offsets, since: m.since, tip },
    templates: normalizePostJobTemplates(r.templates),
  };
}

const touch = (s: PostJobSettings, now: number): PostJobSettings => ({ ...s, at: Math.max(now, s.at + 1) });

/** Switches a kind on / off. Turning it on records `since` = today (only later jobs / steps are emailed). */
export function setPostJobEnabled(s: PostJobSettings, kind: PostJobKind, on: boolean, today: string, now: number): PostJobSettings {
  const cur = s[kind];
  if (cur.enabled === on && (!on || cur.since)) return s;
  const since = on ? (cur.enabled && cur.since ? cur.since : toYmd(today)) : cur.since;
  return touch({ ...s, [kind]: { ...cur, enabled: on, since } } as PostJobSettings, now);
}

export function setPostJobOffsets(s: PostJobSettings, kind: PostJobKind, offsets: number[], now: number): PostJobSettings {
  const list = normalizePostJobOffsets(kind, offsets);
  if (!list.length) return s;
  return touch({ ...s, [kind]: { ...s[kind], offsets: list } } as PostJobSettings, now);
}

export function setWarrantyOwner(s: PostJobSettings, patch: { notifyOwner?: boolean; ownerOffsets?: number[] }, now: number): PostJobSettings {
  const ownerOffsets = patch.ownerOffsets ? normalizePostJobOffsets('warranty', patch.ownerOffsets) : s.warranty.ownerOffsets;
  return touch({ ...s, warranty: { ...s.warranty, notifyOwner: patch.notifyOwner ?? s.warranty.notifyOwner, ownerOffsets: ownerOffsets.length ? ownerOffsets : s.warranty.ownerOffsets } }, now);
}

export const setCompletionReview = (s: PostJobSettings, includeReview: boolean, now: number): PostJobSettings =>
  touch({ ...s, completion: { ...s.completion, includeReview } }, now);

export const setMaintenanceTip = (s: PostJobSettings, tip: string, now: number): PostJobSettings =>
  touch({ ...s, maintenance: { ...s.maintenance, tip: String(tip ?? '').replace(/\r\n?/g, '\n').trim().slice(0, POST_JOB_RULES.tipMax) } }, now);

/** Saves custom wording for one email; an empty subject and body goes back to the default. */
export function setPostJobTemplate(s: PostJobSettings, key: PostJobTemplateKey, t: MessageTemplate | null, now: number): PostJobSettings {
  const templates = { ...s.templates };
  if (t) templates[key] = t;
  else delete templates[key];
  return touch({ ...s, templates: normalizePostJobTemplates(templates) }, now);
}

export const newerPostJobSettings = (a: PostJobSettings, b: PostJobSettings): PostJobSettings => (b.at > a.at ? b : a);

/* ---------------------------------------------------------------------------------------- facts */

export interface PostJobJobRow {
  id: string;
  user_id?: string;
  name?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  status?: string | null;
  end_date?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export const POST_JOB_JOB_SELECT = 'id, user_id, name, client_id, client_name, start_date, end_date, status, created_at, updated_at';

/** documents columns of a Warranty (JSON paths; claims come with the tracking object). */
export const WARRANTY_DOC_SELECT = [
  'id', 'user_id', 'job_id', 'client_id', 'type', 'created_at', 'public_token', 'approval_expires_at', 'approval_used_at',
  'warrantyNumber:data->>warrantyNumber', 'title:data->>title', 'clientName:data->>clientName',
  'completedDate:data->>completedDate', 'duration:data->>duration', 'warrantyTracking:data->warrantyTracking',
].join(', ');

export interface WarrantyDocRow {
  id: string;
  user_id?: string;
  job_id?: string | null;
  client_id?: string | null;
  type?: string;
  created_at?: string | null;
  public_token?: string | null;
  approval_expires_at?: string | null;
  approval_used_at?: string | null;
  warrantyNumber?: string | null;
  title?: string | null;
  clientName?: string | null;
  completedDate?: string | null;
  duration?: string | null;
  warrantyTracking?: unknown;
}

/**
 * The day a completed job was finished: its end date when that is not after the day it was last saved, else the
 * day it was last saved (marked completed early, or no end date). null when the job is not completed.
 */
export function completionDay(job: Pick<PostJobJobRow, 'status' | 'end_date' | 'updated_at'>, tz: string): string | null {
  if (String(job.status ?? '').trim().toLowerCase() !== 'completed') return null;
  const end = toYmd(job.end_date);
  const saved = instantYmd(job.updated_at ?? null, tz);
  if (end && (!saved || end <= saved)) return end;
  return saved ?? end;
}

export interface PostJobFacts {
  kind: PostJobKind;
  /** job id (completion / maintenance) or warranty document id */
  id: string;
  /** completion day (completion / maintenance) or the warranty's last day (warranty) */
  anchor: string | null;
  /** warranty only: voided or lifetime = nothing to remind */
  inactive?: boolean;
}

/* ----------------------------------------------------------------------------------------- steps */

export interface PostJobStep {
  audience: Audience;
  /** 'done+3', 'done+180', 'exp-30', 'exp-0', 'oexp-30' */
  stepKey: string;
  /** days after completion / days before the end */
  offset: number;
  /** the step's day (anchor ± offset): part of the dedupe key */
  date: string;
  templateKey: PostJobTemplateKey;
}

export const postJobStepKey = (kind: PostJobKind, audience: Audience, offset: number): string =>
  kind === 'warranty' ? `${audience === 'owner' ? 'oexp' : 'exp'}-${offset}` : `done+${offset}`;

export const postJobDedupeKey = (kind: PostJobKind, targetId: string, stepKey: string, date: string): string =>
  `${kind}:${targetId}:${stepKey}:${date}`;

const templateFor = (kind: PostJobKind, audience: Audience): PostJobTemplateKey =>
  kind === 'warranty' ? (audience === 'owner' ? 'warranty_owner' : 'warranty_client') : kind;

/** Every step of a target (both audiences for a warranty), sorted by date. */
export function planPostJobSteps(facts: PostJobFacts, s: PostJobSettings): PostJobStep[] {
  const anchor = toYmd(facts.anchor);
  if (!anchor || facts.inactive) return [];
  const k = s[facts.kind];
  const steps: PostJobStep[] = [];
  const add = (audience: Audience, offsets: number[]) => {
    for (const offset of normalizePostJobOffsets(facts.kind, offsets)) {
      const date = facts.kind === 'warranty' ? addDays(anchor, -offset) : addDays(anchor, offset);
      steps.push({ audience, stepKey: postJobStepKey(facts.kind, audience, offset), offset, date, templateKey: templateFor(facts.kind, audience) });
    }
  };
  add('client', k.offsets);
  if (facts.kind === 'warranty' && s.warranty.notifyOwner) add('owner', s.warranty.ownerOffsets);
  return steps.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.audience < b.audience ? -1 : 1));
}

/* ------------------------------------------------------------------------------------- decisions */

export interface PostJobDecisionInput {
  facts: PostJobFacts;
  /** the reminders settings (master switch, hour, time zone) */
  base: Pick<ReminderSettings, 'enabled' | 'sendHour' | 'timezone'>;
  settings: PostJobSettings;
  /** only OFF switches count (document for a warranty, job for completion / maintenance, the client) */
  overrides: TargetOverrides;
  /** paid plan (these emails are Premium) */
  paid: boolean;
  /** earlier records of this target (any kind; filtered here) */
  recorded: RecordedReminder[];
  now: Date;
}

export type PostJobOff = 'paused' | 'plan' | 'kind_off' | 'switched_off' | 'client_off' | 'no_anchor' | 'before_since';

export interface PostJobSend {
  step: PostJobStep;
  dedupeKey: string;
  retry: RecordedReminder | null;
}

export type PostJobDecision =
  | { action: 'none'; why: PostJobOff | 'nothing_due' }
  | { action: 'send'; sends: PostJobSend[] };

const isDueNow = (date: string, today: string, hour: number, sendHour: number) => date < today || (date === today && hour >= sendHour);

/** Why this target gets nothing at all (null = it may get emails). Client OFF only blocks client emails (see decide). */
export function postJobOff(input: Omit<PostJobDecisionInput, 'recorded' | 'now'>): PostJobOff | null {
  if (!input.base.enabled) return 'paused';
  if (!input.paid) return 'plan';
  const k = input.settings[input.facts.kind];
  if (!k.enabled || !k.since) return 'kind_off';
  const own = input.facts.kind === 'warranty' ? input.overrides.document : input.overrides.job;
  if (own && !own.enabled) return 'switched_off';
  if (!toYmd(input.facts.anchor) || input.facts.inactive) return 'no_anchor';
  // completion / maintenance: only jobs completed on or after the day the kind was switched on
  if (input.facts.kind !== 'warranty' && (toYmd(input.facts.anchor) as string) < k.since) return 'before_since';
  return null;
}

/**
 * What goes out now for one target: per audience, the LATEST due step within catchUpDays that was never recorded
 * (or failed in a retryable way), at most one per audience, never within minGapHours of the last email that
 * audience got for this target. Warranty steps before `since` are dropped.
 */
export function decidePostJob(input: PostJobDecisionInput): PostJobDecision {
  const off = postJobOff(input);
  if (off) return { action: 'none', why: off };
  const { facts, settings } = input;
  const tz = safeTimezone(input.base.timezone);
  const { ymd: today, hour } = zonedNow(input.now, tz);
  const since = settings[facts.kind].since as string;
  const clientOff = !!input.overrides.client && !input.overrides.client.enabled;
  const prefix = `${facts.kind}:${facts.id}:`;
  const mine = input.recorded.filter((r) => r.dedupeKey.startsWith(prefix));
  const sends: PostJobSend[] = [];

  for (const audience of ['client', 'owner'] as Audience[]) {
    if (audience === 'client' && clientOff) continue;
    const steps = planPostJobSteps(facts, settings)
      .filter((st) => st.audience === audience && (facts.kind !== 'warranty' || st.date >= since));
    const due = steps.filter((st) => isDueNow(st.date, today, hour, input.base.sendHour));
    if (!due.length) continue;
    const latest = due[due.length - 1];
    if (diffDays(today, latest.date) > REMINDER_RULES.catchUpDays) continue;
    const key = postJobDedupeKey(facts.kind, facts.id, latest.stepKey, latest.date);
    const exact = mine.find((r) => r.dedupeKey === key) ?? null;
    if (exact && (exact.status === 'sending' || !isRetryable(exact))) continue;
    // completion / maintenance: the same step under another date (the completion day moved) counts as done
    if (!exact && facts.kind !== 'warranty' && mine.some((r) => r.dedupeKey.startsWith(`${prefix}${latest.stepKey}:`))) continue;
    const stepPrefix = audience === 'owner' ? 'oexp' : facts.kind === 'warranty' ? 'exp' : 'done';
    const lastSent = mine
      .filter((r) => r.status === 'sent' && r.sentAt && r.dedupeKey.split(':')[2]?.startsWith(stepPrefix + (facts.kind === 'warranty' ? '-' : '+')))
      .reduce((max, r) => Math.max(max, Date.parse(String(r.sentAt)) || 0), 0);
    if (lastSent && input.now.getTime() - lastSent < REMINDER_RULES.minGapHours * 3_600_000) continue;
    sends.push({ step: latest, dedupeKey: key, retry: exact });
  }
  return sends.length ? { action: 'send', sends } : { action: 'none', why: 'nothing_due' };
}

/** Next step per audience that will go out (app: "next email on …"), ignoring records. */
export function nextPostJobSteps(input: Omit<PostJobDecisionInput, 'recorded'>): PostJobStep[] {
  if (postJobOff(input)) return [];
  const tz = safeTimezone(input.base.timezone);
  const { ymd: today, hour } = zonedNow(input.now, tz);
  const since = input.settings[input.facts.kind].since as string;
  const clientOff = !!input.overrides.client && !input.overrides.client.enabled;
  const out: PostJobStep[] = [];
  for (const audience of ['client', 'owner'] as Audience[]) {
    if (audience === 'client' && clientOff) continue;
    const next = planPostJobSteps(input.facts, input.settings)
      .filter((st) => st.audience === audience && (input.facts.kind !== 'warranty' || st.date >= since))
      .find((st) => !isDueNow(st.date, today, hour, input.base.sendHour));
    if (next) out.push(next);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ text */

export const POST_JOB_TEMPLATES: Record<PostJobTemplateKey, MessageTemplate> = {
  completion: {
    subject: 'Thank you, {client}',
    body: [
      'Hi {client},',
      '',
      'Thanks again for having us do {job}. It was a pleasure working with you.',
      '',
      'If anything needs a second look, just reply to this email.',
      '',
      'If you have a minute, a short review helps other people find us: {review_link}',
      '',
      '{my_name}',
      '{company}',
    ].join('\n'),
  },
  warranty_client: {
    subject: 'Your warranty for {job} ends {when}',
    body: [
      'Hi {client},',
      '',
      'A quick note: the warranty on {job} ends on {warranty_end} ({when}).',
      '',
      'If you have noticed anything that should be looked at under the warranty, let us know before then. Just reply to this email with a short description and a photo or two, and we will set up a time to check it.',
      '',
      'Your warranty: {link}',
      '',
      '{my_name}',
      '{company}',
    ].join('\n'),
  },
  warranty_owner: {
    subject: 'Warranty {number} for {client} ends {when}',
    body: [
      'Warranty {number} for {client} ({job}) ends on {warranty_end} ({when}).',
      '',
      'Open claims: {open_claims}',
      '{client_note}',
      '',
      'Open it: {link}',
    ].join('\n'),
  },
  maintenance: {
    subject: 'A quick maintenance reminder',
    body: [
      'Hi {client},',
      '',
      'It has been {since_done} since we finished {job}. {tip}',
      '',
      'If you would like us to take a look, just reply to this email.',
      '',
      '{my_name}',
      '{company}',
    ].join('\n'),
  },
};

export const POST_JOB_TEMPLATE_TITLES: Record<PostJobTemplateKey, string> = {
  completion: 'Thank-you after the job',
  warranty_client: 'Warranty ending (to the client)',
  warranty_owner: 'Warranty ending (to you)',
  maintenance: 'Maintenance reminder',
};

export type PostJobPlaceholder =
  | 'client' | 'job' | 'company' | 'my_name' | 'review_link' | 'link' | 'number' | 'warranty_end' | 'when'
  | 'open_claims' | 'client_note' | 'since_done' | 'tip';

export const POST_JOB_PLACEHOLDER_HELP: Record<PostJobPlaceholder, string> = {
  client: 'Client name',
  job: 'Job name',
  company: 'Your company',
  my_name: 'Your name',
  review_link: 'Your review link (the line is left out when there is none)',
  link: 'Link to the warranty / the app',
  number: 'Warranty number',
  warranty_end: 'Day the warranty ends',
  when: '"in 30 days" / "today"',
  open_claims: 'Open warranty claims',
  client_note: 'Whether the client was emailed too',
  since_done: '"6 months" / "1 year"',
  tip: 'Your maintenance tip',
};

export const POST_JOB_TEMPLATE_PLACEHOLDERS: Record<PostJobTemplateKey, PostJobPlaceholder[]> = {
  completion: ['client', 'job', 'review_link', 'company', 'my_name'],
  warranty_client: ['client', 'job', 'number', 'warranty_end', 'when', 'link', 'company', 'my_name'],
  warranty_owner: ['client', 'job', 'number', 'warranty_end', 'when', 'open_claims', 'client_note', 'link'],
  maintenance: ['client', 'job', 'since_done', 'tip', 'company', 'my_name'],
};

export function resolvePostJobTemplate(s: Pick<PostJobSettings, 'templates'>, key: PostJobTemplateKey): MessageTemplate {
  const custom = s.templates?.[key];
  const def = POST_JOB_TEMPLATES[key];
  return {
    subject: custom?.subject?.trim() ? custom.subject : def.subject,
    body: custom?.body?.trim() ? custom.body : def.body,
  };
}

/** "6 months", "1 year", "18 months", "45 days" */
export function durationText(days: number): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const years = Math.round(days / 365);
  if (years >= 1 && Math.abs(days - years * 365) <= 5) return plural(years, 'year');
  const months = Math.round(days / 30.4);
  if (months >= 1 && days >= 28 && Math.abs(days - months * 30.4) <= 3) return plural(months, 'month');
  return plural(days, 'day');
}

/** "in 30 days" / "tomorrow" / "today" */
export const whenText = (daysLeft: number): string =>
  daysLeft <= 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;

const httpsOnly = (url: unknown): string => {
  const s = String(url ?? '').trim();
  return /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])[^\s<>"']+$/i.test(s) ? s : '';
};

export interface PostJobValueContext {
  templateKey: PostJobTemplateKey;
  /** the step's day */
  stepDate: string;
  /** completion day (completion / maintenance) or last day (warranty) */
  anchor: string;
  offset: number;
  clientName?: string | null;
  jobName?: string | null;
  company?: string | null;
  myName?: string | null;
  reviewLink?: string | null;
  link?: string | null;
  number?: string | null;
  openClaims?: number;
  /** warranty owner note: the client gets an email that day too */
  clientEmailed?: boolean;
  tip?: string | null;
}

export function buildPostJobValues(ctx: PostJobValueContext): Record<PostJobPlaceholder, string> {
  const company = String(ctx.company ?? '').trim();
  const myName = String(ctx.myName ?? '').trim();
  const daysLeft = diffDays(ctx.anchor, ctx.stepDate);
  return {
    client: String(ctx.clientName ?? '').trim() || (ctx.templateKey === 'warranty_owner' ? 'your client' : 'there'),
    job: String(ctx.jobName ?? '').trim() || (ctx.templateKey === 'warranty_owner' ? 'the job' : 'the work'),
    company,
    my_name: myName && myName !== company ? myName : '',
    review_link: httpsOnly(ctx.reviewLink),
    link: httpsOnly(ctx.link),
    number: String(ctx.number ?? '').trim(),
    warranty_end: formatLongDate(ctx.anchor),
    when: whenText(daysLeft),
    open_claims: String(Math.max(0, ctx.openClaims ?? 0)),
    client_note: ctx.templateKey === 'warranty_owner'
      ? (ctx.clientEmailed ? 'Your client gets a reminder email today too.' : 'Your client is not emailed about it today.')
      : '',
    since_done: durationText(Math.max(1, ctx.offset)),
    tip: String(ctx.tip ?? '').trim(),
  };
}

/** The email for one step (subject, text, simple HTML), with the user's wording when set. */
export function renderPostJob(s: Pick<PostJobSettings, 'templates'>, key: PostJobTemplateKey, values: Record<PostJobPlaceholder, string>): RenderedReminder {
  const t = resolvePostJobTemplate(s, key);
  const v = values as unknown as ReminderValues;
  const subject = fillTemplate(t.subject, v).replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim().slice(0, 300);
  const text = fillTemplate(t.body, v);
  return { subject, text, html: textToHtml(text) };
}

/** App link for the owner: the warranty in the app (or the dashboard). */
export function warrantyAppLink(siteUrl: string, jobId: string | null | undefined, documentId: string): string {
  const site = String(siteUrl || '').replace(/\/+$/, '');
  if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$)/i.test(site)) return '';
  return jobId ? `${site}/jobs/${encodeURIComponent(jobId)}/forms/Warranty/${encodeURIComponent(documentId)}` : `${site}/dashboard`;
}

/** Human text for a step ("3 days after the job", "30 days before it ends", "The day it ends"). */
export function postJobStepLabel(kind: PostJobKind, offset: number): string {
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  if (kind === 'warranty') return offset === 0 ? 'The day it ends' : `${days(offset)} before it ends`;
  if (kind === 'maintenance') return `${durationText(offset)} after the job`;
  return `${days(offset)} after the job`;
}
