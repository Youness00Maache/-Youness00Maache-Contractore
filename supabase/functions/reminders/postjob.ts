// After-the-job emails (D10): completion thank-you, warranty ending (client + owner) and maintenance reminders.
// WHEN is decided by ./shared/postjob.ts (same code as the app); this file loads the rows and builds the messages.
// The result goes through the SAME dispatch loop as the other kinds (index.ts: claim in public.reminders under the
// UNIQUE (user_id, dedupe_key) before Gmail, skips logged, failures retried), from the same sender.
// Needs migration 20261116000900 (widens public.reminders kind / step_key checks). Before it is applied nothing can
// be claimed (check violation): the dispatch loop leaves those items as "deferred" and nothing is sent.
// Paid plans only; a user's settings come from public.user_settings 'reminders.postjob' (all kinds off by default).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { AccountRow } from '../gmail/core.ts';
import { zonedNow, safeTimezone, type EmailAllowance, type RecordedReminder, type ReminderSettings } from './shared/schedule.ts';
import {
  CLIENT_SELECT, indexOverrides, OVERRIDE_SELECT, overridesFor, recipientOf, RECORD_SELECT, recordFromRow, reminderLink, resolveClient,
  type ClientRow, type OverrideRow, type RecordRow,
} from './shared/targets.ts';
import {
  buildPostJobValues, completionDay, decidePostJob, parsePostJobSettings, POST_JOB_JOB_SELECT, POST_JOB_RULES, POST_JOB_SETTING,
  renderPostJob, WARRANTY_DOC_SELECT, warrantyAppLink, type PostJobFacts, type PostJobJobRow, type PostJobSettings, type WarrantyDocRow,
} from './shared/postjob.ts';
import { claimsSummary, parseTracking, warrantyTerm } from './shared/warranty.ts';
import type { OutgoingReminder } from './shared/dispatch.ts';

/** What index.ts keeps per user (structural: its UserContext fits). */
export interface PostJobUserContext {
  userId: string;
  settings: ReminderSettings;
  profile: { name: string | null; company_name: string | null } | null;
  sender: AccountRow | null;
  allowance: EmailAllowance;
}

export interface PostJobPlanned {
  item: OutgoingReminder;
  account: AccountRow | null;
  fromName: string;
}

const CHUNK = 80;
const PAGE = 1000;
const MAX_PAGES = 20;

// deno-lint-ignore no-explicit-any
type Query = any;

const chunks = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};
const uniq = (list: Array<string | null | undefined>): string[] => [...new Set(list.filter((x): x is string => !!x))];

async function selectAll<T>(label: string, build: () => Query): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build().range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.code ?? ''} ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function selectIn<T>(label: string, ids: string[], build: (chunk: string[]) => Query): Promise<T[]> {
  const out: T[] = [];
  for (const c of chunks(uniq(ids), CHUNK)) out.push(...(await selectAll<T>(label, () => build(c))));
  return out;
}

/** Optional reads (a column / table that may not exist yet): an error gives an empty list. */
async function tryIn<T>(label: string, ids: string[], build: (chunk: string[]) => Query): Promise<T[]> {
  try {
    return await selectIn<T>(label, ids, build);
  } catch (e) {
    console.error(`[reminders] postjob ${label} skipped:`, (e as Error)?.message ?? e);
    return [];
  }
}

/** Everything after-the-job that is due for this batch of users. Never throws (logs and returns what it has). */
export async function planPostJobBatch(
  admin: SupabaseClient,
  contexts: Map<string, PostJobUserContext>,
  now: Date,
  siteUrl: string,
): Promise<PostJobPlanned[]> {
  try {
    return await plan(admin, contexts, now, siteUrl);
  } catch (e) {
    console.error('[reminders] postjob plan failed:', (e as Error)?.message ?? e);
    return [];
  }
}

async function plan(admin: SupabaseClient, contexts: Map<string, PostJobUserContext>, now: Date, siteUrl: string): Promise<PostJobPlanned[]> {
  // paid users with the reminders master switch on (index.ts only builds contexts for enabled users)
  const paidIds = [...contexts.values()].filter((c) => c.allowance.paid && c.settings.enabled).map((c) => c.userId);
  if (!paidIds.length) return [];
  const settingRows = await tryIn<{ user_id: string; value: unknown }>('settings', paidIds, (ids) =>
    admin.from('user_settings').select('user_id, value').eq('key', POST_JOB_SETTING).in('user_id', ids));
  const pj = new Map<string, PostJobSettings>();
  for (const r of settingRows) {
    const s = parsePostJobSettings(r.value);
    if ((s.completion.enabled && s.completion.since) || (s.warranty.enabled && s.warranty.since) || (s.maintenance.enabled && s.maintenance.since)) pj.set(r.user_id, s);
  }
  if (!pj.size) return [];
  const users = [...pj.keys()];
  const jobUsers = users.filter((u) => pj.get(u)!.completion.enabled || pj.get(u)!.maintenance.enabled);
  const warrantyUsers = users.filter((u) => pj.get(u)!.warranty.enabled);

  // completed jobs whose end date or last save is within reach of the largest offset in use (+ catch-up)
  const maxAfter = Math.max(1, ...jobUsers.map((u) => {
    const s = pj.get(u)!;
    return Math.max(s.completion.enabled ? Math.max(0, ...s.completion.offsets) : 0, s.maintenance.enabled ? Math.max(0, ...s.maintenance.offsets) : 0);
  }));
  const fromDay = new Date(now.getTime() - (Math.min(maxAfter, POST_JOB_RULES.maintenance.max) + 5) * 86_400_000).toISOString().slice(0, 10);
  const [jobs, warranties, overrideRows] = await Promise.all([
    selectIn<PostJobJobRow>('completed jobs', jobUsers, (ids) =>
      admin.from('jobs').select(POST_JOB_JOB_SELECT).in('user_id', ids).eq('status', 'completed')
        .or(`end_date.gte.${fromDay},updated_at.gte.${fromDay}`)),
    selectIn<WarrantyDocRow>('warranties', warrantyUsers, (ids) =>
      admin.from('documents').select(WARRANTY_DOC_SELECT).in('user_id', ids).eq('type', 'Warranty')),
    selectIn<OverrideRow>('overrides', users, (ids) => admin.from('reminder_overrides').select(OVERRIDE_SELECT).in('user_id', ids)),
  ]);
  if (!jobs.length && !warranties.length) return [];

  const warrantyJobs = await selectIn<PostJobJobRow>('warranty jobs', warranties.map((w) => w.job_id ?? ''), (ids) =>
    admin.from('jobs').select(POST_JOB_JOB_SELECT).in('id', ids));
  const jobsById = new Map<string, PostJobJobRow>([...warrantyJobs, ...jobs].map((j) => [j.id, j]));

  const clientIds = uniq([...jobs.map((j) => j.client_id), ...warranties.map((w) => w.client_id), ...warrantyJobs.map((j) => j.client_id)]);
  const clients = await selectIn<ClientRow>('clients', clientIds, (ids) => admin.from('clients').select(CLIENT_SELECT).in('id', ids));
  const namesByUser = new Map<string, Set<string>>();
  const wantName = (userId: string | undefined, name: string | null | undefined) => {
    const n = String(name ?? '').trim();
    if (!userId || !n) return;
    namesByUser.set(userId, (namesByUser.get(userId) ?? new Set()).add(n));
  };
  for (const j of jobs) if (!j.client_id) wantName(j.user_id, j.client_name);
  for (const w of warranties) {
    const job = w.job_id ? jobsById.get(w.job_id) : undefined;
    if (!w.client_id && !job?.client_id) wantName(w.user_id, w.clientName || job?.client_name);
  }
  for (const [userId, names] of namesByUser) {
    clients.push(...(await selectIn<ClientRow>('clients by name', [...names], (list) =>
      admin.from('clients').select(CLIENT_SELECT).eq('user_id', userId).in('name', list))));
  }

  const [records, reviewLinks, reviewedJobs] = await Promise.all([
    Promise.all([
      selectIn<RecordRow>('job records', jobs.map((j) => j.id), (ids) =>
        admin.from('reminders').select(RECORD_SELECT).in('job_id', ids).in('kind', ['completion', 'maintenance'])),
      selectIn<RecordRow>('warranty records', warranties.map((w) => w.id), (ids) =>
        admin.from('reminders').select(RECORD_SELECT).in('document_id', ids).eq('kind', 'warranty')),
    ]).then(([a, b]) => [...a, ...b]),
    tryIn<{ id: string; google_review_link: string | null }>('review links', users, (ids) =>
      admin.from('profiles').select('id, google_review_link').in('id', ids)),
    tryIn<{ job_id: string | null; reviewRequestedAt: string | null }>('review requests', jobs.map((j) => j.id), (ids) =>
      admin.from('documents').select('job_id, reviewRequestedAt:data->>reviewRequestedAt').in('job_id', ids).eq('type', 'Invoice')
        .not('data->>reviewRequestedAt', 'is', null)),
  ]);
  const reviewLinkBy = new Map(reviewLinks.map((p) => [p.id, p.google_review_link]));
  const reviewed = new Set(reviewedJobs.filter((r) => r.job_id && r.reviewRequestedAt).map((r) => r.job_id as string));
  const recordsBy = new Map<string, RecordedReminder[]>();
  for (const rec of records) {
    const target = rec.kind === 'warranty' ? rec.document_id ?? '' : rec.job_id ?? '';
    recordsBy.set(target, [...(recordsBy.get(target) ?? []), recordFromRow(rec)]);
  }
  const overridesByUser = new Map(users.map((u) => [u, indexOverrides(overrideRows.filter((o) => o.user_id === u))]));

  const planned: PostJobPlanned[] = [];
  const push = (ctx: PostJobUserContext, base: Omit<OutgoingReminder, 'block' | 'accountId' | 'subject' | 'text' | 'html'>, msg: { subject: string; text: string; html: string }) => {
    const account = ctx.sender;
    planned.push({
      account,
      fromName: String(ctx.profile?.company_name || account?.display_name || ctx.profile?.name || '').trim(),
      item: {
        ...base,
        block: !account ? 'no_gmail' : account.status === 'needs_reconnect' ? 'gmail_reconnect' : null,
        accountId: account?.id ?? null,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      },
    });
  };

  // completion + maintenance (target = the job)
  for (const j of jobs) {
    const ctx = contexts.get(String(j.user_id));
    const s = ctx ? pj.get(ctx.userId) : undefined;
    if (!ctx || !s) continue;
    const tz = safeTimezone(ctx.settings.timezone);
    const anchor = completionDay(j, tz);
    const client = resolveClient({ clientId: j.client_id, name: j.client_name, userId: j.user_id }, clients);
    const overrides = overridesFor(overridesByUser.get(ctx.userId) ?? indexOverrides([]), { jobId: j.id, clientId: client?.id ?? null });
    for (const kind of ['completion', 'maintenance'] as const) {
      const facts: PostJobFacts = { kind, id: j.id, anchor };
      const decision = decidePostJob({ facts, base: ctx.settings, settings: s, overrides, paid: ctx.allowance.paid, recorded: recordsBy.get(j.id) ?? [], now });
      if (decision.action !== 'send') continue;
      for (const send of decision.sends) {
        const values = buildPostJobValues({
          templateKey: send.step.templateKey, stepDate: send.step.date, anchor: anchor as string, offset: send.step.offset,
          clientName: client?.name || j.client_name, jobName: j.name, company: ctx.profile?.company_name, myName: ctx.profile?.name,
          reviewLink: kind === 'completion' && s.completion.includeReview && !reviewed.has(j.id) ? reviewLinkBy.get(ctx.userId) : null,
          tip: s.maintenance.tip,
        });
        push(ctx, {
          userId: ctx.userId, kind, documentId: null, jobId: j.id, clientId: client?.id ?? null,
          stepKey: send.step.stepKey, scheduledFor: send.step.date, dedupeKey: send.dedupeKey,
          retry: send.retry?.id ? { id: send.retry.id, attempts: send.retry.attempts ?? 0 } : null,
          to: recipientOf(client?.email),
        }, renderPostJob(s, send.step.templateKey, values));
      }
    }
  }

  // warranty (target = the Warranty document; client + owner)
  for (const w of warranties) {
    const ctx = contexts.get(String(w.user_id));
    const s = ctx ? pj.get(ctx.userId) : undefined;
    if (!ctx || !s || !s.warranty.enabled) continue;
    const tracking = parseTracking(w.warrantyTracking);
    const term = warrantyTerm({ completedDate: w.completedDate, duration: w.duration, createdAt: w.created_at }, tracking);
    const job = w.job_id ? jobsById.get(w.job_id) ?? null : null;
    const client = resolveClient({ clientId: w.client_id, jobClientId: job?.client_id, name: w.clientName || job?.client_name, userId: w.user_id }, clients);
    const facts: PostJobFacts = { kind: 'warranty', id: w.id, anchor: term.expiresOn, inactive: !!tracking.voidedAt || term.lifetime };
    const overrides = overridesFor(overridesByUser.get(ctx.userId) ?? indexOverrides([]), { documentId: w.id, clientId: client?.id ?? null });
    const decision = decidePostJob({ facts, base: ctx.settings, settings: s, overrides, paid: ctx.allowance.paid, recorded: recordsBy.get(w.id) ?? [], now });
    if (decision.action !== 'send') continue;
    const clientTo = recipientOf(client?.email);
    const today = zonedNow(now, safeTimezone(ctx.settings.timezone)).ymd;
    const clientEmailedToday = decision.sends.some((x) => x.step.audience === 'client' && x.step.date === today) && !!clientTo;
    const openClaims = claimsSummary(tracking.claims).active;
    for (const send of decision.sends) {
      const owner = send.step.audience === 'owner';
      const values = buildPostJobValues({
        templateKey: send.step.templateKey, stepDate: send.step.date, anchor: term.expiresOn as string, offset: send.step.offset,
        clientName: client?.name || w.clientName || job?.client_name, jobName: job?.name, company: ctx.profile?.company_name, myName: ctx.profile?.name,
        number: w.warrantyNumber,
        link: owner ? warrantyAppLink(siteUrl, w.job_id, w.id) : reminderLink('invoice', siteUrl, w, client, now),
        openClaims, clientEmailed: clientEmailedToday,
      });
      push(ctx, {
        userId: ctx.userId, kind: 'warranty', documentId: w.id, jobId: w.job_id ?? null, clientId: client?.id ?? null,
        stepKey: send.step.stepKey, scheduledFor: send.step.date, dedupeKey: send.dedupeKey,
        retry: send.retry?.id ? { id: send.retry.id, attempts: send.retry.attempts ?? 0 } : null,
        // the owner note goes to the sending account itself
        to: owner ? recipientOf(ctx.sender?.gmail_address) : clientTo,
      }, renderPostJob(s, send.step.templateKey, values));
    }
  }
  return planned;
}
