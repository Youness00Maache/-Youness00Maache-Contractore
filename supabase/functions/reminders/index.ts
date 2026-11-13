// reminders: sends automatic invoice reminders, estimate follow-ups and visit reminders from each user's own Gmail.
//
// Called every 10 minutes by pg_cron (public.reminders_cron_tick() -> pg_net) — never by browsers.
//   POST { action: 'run', dry_run?: boolean }   header  x-reminders-secret: <REMINDERS_CRON_SECRET>
//   -> { ok, sent, skipped, failed, taken, deferred, reasons, users, targets, ms }   (dry_run: what would go out)
//
// What goes out when is decided by ./shared/schedule.ts (same code the app uses to show planned dates).
// Sending reuses the gmail function's code (../gmail/core.ts: encrypted tokens, refresh, Gmail errors, usage).
// Every send is recorded in public.reminders under a unique (user_id, dedupe_key) BEFORE Gmail is called, so a
// reminder is never sent twice, even when two runs overlap. Free plan: each reminder counts toward the monthly
// email cap (usage_events kind 'email'); when the cap is reached the reminder is skipped and logged.
//
// Secrets (Edge Functions → Secrets): REMINDERS_CRON_SECRET (new, random, same value as the Vault secret
// 'reminders_cron_secret'), plus the gmail ones: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET, SITE_URL, TOKEN_ENCRYPTION_KEY (if set for gmail). Deploy with JWT verification OFF.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buildMimeMessage, MimeError } from '../gmail/mime.ts';
import {
  adminClient, env, FREE_EMAIL_LIMIT, GmailTransportError, HttpError, monthStartIso, recordEmailUsage, sendWithAccount,
  stripActiveHtml, tokenKeys, type AccountRow,
} from '../gmail/core.ts';
import {
  addDays, decideDue, effectiveTier, REMINDER_RULES, safeTimezone, sentDay, settingsFromRow, zonedNow,
  type EmailAllowance, type RecordedReminder, type ReminderKind, type ReminderSettings, type ReminderSettingsRow,
} from './shared/schedule.ts';
import { buildValues, renderReminder, resolveTemplate, type RenderedReminder } from './shared/messages.ts';
import {
  CLIENT_SELECT, DOC_SELECT, docNumber, factsFromDoc, factsFromJob, indexOverrides, JOB_SELECT, OVERRIDE_SELECT, overridesFor,
  RECEIPT_SELECT, receiptsTotalFor, recipientOf, RECORD_SELECT, recordFromRow, reminderLink, resolveClient, STATE_SELECT,
  type ClientRow, type DocRow, type JobRow, type OverrideRow, type ReceiptRow, type RecordRow,
} from './shared/targets.ts';
import { dispatchReminders, emptySummary, mergeSummary, SendFailure, type Claim, type OutgoingReminder } from './shared/dispatch.ts';

const SITE_URL = (env('SITE_URL') || 'https://www.contractordocs.app').split(',')[0].trim().replace(/\/+$/, '');
const USERS_PER_BATCH = 40;
const TIME_BUDGET_MS = 110_000;
const ID_CHUNK = 80;
const PAGE = 1000;
const MAX_PAGES = 20;

/* ---------------------------------------------------------------------------------------- utils */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Constant-time comparison of the shared secret. */
function secretMatches(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const chunks = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const uniq = <T,>(list: Array<T | null | undefined>): T[] => [...new Set(list.filter((x): x is T => x !== null && x !== undefined && x !== ''))];

// deno-lint-ignore no-explicit-any
type Query = any;

/** Runs a select page by page (PostgREST caps rows per request). */
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

/** Same select over id lists of at most ID_CHUNK ids (keeps URLs short). */
async function selectIn<T>(label: string, ids: string[], build: (chunk: string[]) => Query): Promise<T[]> {
  const out: T[] = [];
  for (const chunk of chunks(uniq(ids), ID_CHUNK)) out.push(...(await selectAll<T>(label, () => build(chunk))));
  return out;
}

/* ------------------------------------------------------------------------------------- loading */

interface Profile {
  id: string;
  name: string | null;
  company_name: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
}

interface UserContext {
  userId: string;
  settings: ReminderSettings;
  profile: Profile | null;
  sender: AccountRow | null;
  allowance: EmailAllowance;
}

interface PlannedItem {
  item: OutgoingReminder;
  account: AccountRow | null;
  fromName: string;
}

async function loadLaunchedAt(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.rpc('reminders_config');
  if (error) throw new Error(`reminders_config: ${error.code ?? ''} ${error.message}`);
  const v = (data as { launched_at?: string } | null)?.launched_at;
  return typeof v === 'string' ? v : null;
}

/** Closes sends that started but never finished (crash / timeout). They are never retried: Gmail may have sent them. */
async function closeInterrupted(admin: SupabaseClient, now: Date) {
  const cutoff = new Date(now.getTime() - REMINDER_RULES.staleSendingMinutes * 60_000).toISOString();
  const { error } = await admin
    .from('reminders')
    .update({ status: 'failed', reason: 'interrupted', last_error: 'The send did not finish; it is not retried so the client never gets it twice.' })
    .eq('status', 'sending')
    .lt('updated_at', cutoff);
  if (error) console.error('[reminders] close interrupted failed:', error.code, error.message);
}

/** Users with at least one connected Gmail account, with their accounts. */
async function loadAccountsByUser(admin: SupabaseClient): Promise<Map<string, AccountRow[]>> {
  const rows = await selectAll<AccountRow>('accounts', () =>
    admin.from('user_gmail_accounts').select('id, user_id, gmail_address, display_name, is_default, status, created_at, updated_at').order('created_at', { ascending: true }));
  const map = new Map<string, AccountRow[]>();
  for (const a of rows) {
    const list = map.get(a.user_id) ?? [];
    list.push(a);
    map.set(a.user_id, list);
  }
  return map;
}

/** The account reminders go out from: the one chosen in settings, else the default, else the oldest. */
function pickSender(accounts: AccountRow[], settings: ReminderSettings): AccountRow | null {
  if (!accounts.length) return null;
  return accounts.find((a) => a.id === settings.accountId) ?? accounts.find((a) => a.is_default) ?? accounts[0];
}

async function buildUserContexts(admin: SupabaseClient, userIds: string[], accounts: Map<string, AccountRow[]>, now: Date): Promise<Map<string, UserContext>> {
  const [settingsRows, profiles] = await Promise.all([
    selectIn<ReminderSettingsRow>('settings', userIds, (ids) => admin.from('reminder_settings').select('*').in('user_id', ids)),
    selectIn<Profile>('profiles', userIds, (ids) =>
      admin.from('profiles').select('id, name, company_name, subscription_tier, subscription_status, subscription_period_end').in('id', ids)),
  ]);
  const settingsBy = new Map(settingsRows.map((r) => [String(r.user_id), r]));
  const profileBy = new Map(profiles.map((p) => [p.id, p]));

  const contexts = new Map<string, UserContext>();
  const freeUsers: string[] = [];
  for (const userId of userIds) {
    const settings = settingsFromRow(settingsBy.get(userId) ?? null);
    if (!settings.enabled) continue;
    const profile = profileBy.get(userId) ?? null;
    const tier = effectiveTier(profile?.subscription_tier, profile?.subscription_status, profile?.subscription_period_end, now);
    const paid = tier !== 'free';
    if (!paid) freeUsers.push(userId);
    contexts.set(userId, {
      userId,
      settings,
      profile,
      sender: pickSender(accounts.get(userId) ?? [], settings),
      allowance: { paid, used: 0, limit: paid ? null : FREE_EMAIL_LIMIT },
    });
  }
  if (freeUsers.length) {
    const usage = await selectIn<{ user_id: string }>('usage', freeUsers, (ids) =>
      admin.from('usage_events').select('user_id').in('user_id', ids).eq('kind', 'email').gte('created_at', monthStartIso()));
    for (const u of usage) {
      const ctx = contexts.get(u.user_id);
      if (ctx) ctx.allowance.used++;
    }
  }
  return contexts;
}

/** Everything due for a batch of users, as ready-to-send messages. */
async function planBatch(admin: SupabaseClient, contexts: Map<string, UserContext>, launchedAt: string | null, now: Date): Promise<PlannedItem[]> {
  const userIds = [...contexts.keys()];
  if (!userIds.length) return [];
  const todayUtc = zonedNow(now, 'UTC').ymd;

  const overrideRows = await selectIn<OverrideRow>('overrides', userIds, (ids) => admin.from('reminder_overrides').select(OVERRIDE_SELECT).in('user_id', ids));
  // one index per user: an override only ever applies to its owner's documents, jobs and clients
  const overridesByUser = new Map<string, ReturnType<typeof indexOverrides>>();
  for (const userId of userIds) overridesByUser.set(userId, indexOverrides(overrideRows.filter((o) => o.user_id === userId)));
  const ownOverrides = (userId: string | undefined) => overridesByUser.get(String(userId)) ?? indexOverrides([]);
  const onDocIds = overrideRows.filter((o) => o.enabled && o.document_id).map((o) => o.document_id as string);
  const onJobIds = overrideRows.filter((o) => o.enabled && o.job_id).map((o) => o.job_id as string);

  const wants = (kind: ReminderKind) => userIds.filter((id) => contexts.get(id)!.settings[kind].enabled);
  const invoiceUsers = wants('invoice');
  const estimateUsers = wants('estimate');
  const visitUsers = wants('visit');

  // Invoices whose due date is in the window any step can reach (+ the ones switched on one by one).
  const r = REMINDER_RULES.offsets;
  const dueFrom = addDays(todayUtc, -(r.invoice.max + REMINDER_RULES.catchUpDays + 2));
  const dueTo = addDays(todayUtc, -r.invoice.min + 2);
  const sentSince = new Date(now.getTime() - (r.estimate.max + REMINDER_RULES.catchUpDays + 3) * 86_400_000).toISOString();

  const [invoices, estimates, optedInDocs] = await Promise.all([
    selectIn<DocRow>('invoices', invoiceUsers, (ids) =>
      admin.from('documents').select(DOC_SELECT).in('user_id', ids).eq('type', 'Invoice')
        .in('data->>status', ['Sent', 'Overdue']).gte('data->>dueDate', dueFrom).lte('data->>dueDate', addDays(dueTo, 1))),
    selectIn<DocRow>('estimates', estimateUsers, (ids) =>
      admin.from('documents').select(DOC_SELECT).in('user_id', ids).eq('type', 'Estimate').eq('data->>status', 'Sent').gte('updated_at', sentSince)),
    selectIn<DocRow>('opted-in documents', onDocIds, (ids) => admin.from('documents').select(DOC_SELECT).in('id', ids).in('type', ['Invoice', 'Estimate'])),
  ]);
  const docsById = new Map<string, DocRow>();
  for (const d of [...invoices, ...estimates]) if (d.user_id && contexts.has(d.user_id)) docsById.set(d.id, d);
  for (const d of optedInDocs) if (d.user_id && contexts.has(d.user_id) && ownOverrides(d.user_id).byDocument.get(d.id)?.enabled) docsById.set(d.id, d);
  const docs = [...docsById.values()];

  const visitFrom = todayUtc;
  const visitTo = addDays(todayUtc, -r.visit.min + 2);
  const [visitJobs, optedInJobs] = await Promise.all([
    selectIn<JobRow>('visit jobs', visitUsers, (ids) =>
      admin.from('jobs').select(JOB_SELECT).in('user_id', ids).eq('status', 'active').gte('start_date', visitFrom).lte('start_date', visitTo)),
    selectIn<JobRow>('opted-in jobs', onJobIds, (ids) => admin.from('jobs').select(JOB_SELECT).in('id', ids).gte('start_date', visitFrom)),
  ]);
  const visitsById = new Map<string, JobRow>();
  for (const j of visitJobs) if (j.user_id && contexts.has(j.user_id)) visitsById.set(j.id, j);
  for (const j of optedInJobs) if (j.user_id && contexts.has(j.user_id) && ownOverrides(j.user_id).byJob.get(j.id)?.enabled) visitsById.set(j.id, j);
  const visits = [...visitsById.values()];
  if (!docs.length && !visits.length) return [];

  // Jobs of the documents (client link + job name), clients, receipts, sent times and earlier sends.
  const docJobs = await selectIn<JobRow>('document jobs', docs.map((d) => d.job_id as string), (ids) => admin.from('jobs').select(JOB_SELECT).in('id', ids));
  const jobsById = new Map<string, JobRow>([...docJobs, ...visits].map((j) => [j.id, j]));

  const clientIds = uniq([...docs.map((d) => d.client_id), ...[...jobsById.values()].map((j) => j.client_id)]);
  const clients = await selectIn<ClientRow>('clients', clientIds as string[], (ids) => admin.from('clients').select(CLIENT_SELECT).in('id', ids));
  // legacy rows without ids: match the client by name (same user)
  const namesByUser = new Map<string, Set<string>>();
  const wantName = (userId: string | undefined, name: string | null | undefined) => {
    const n = String(name ?? '').trim();
    if (!userId || !n) return;
    const set = namesByUser.get(userId) ?? new Set<string>();
    set.add(n);
    namesByUser.set(userId, set);
  };
  for (const d of docs) {
    const job = d.job_id ? jobsById.get(d.job_id) : undefined;
    if (!d.client_id && !job?.client_id) wantName(d.user_id, d.clientName || job?.client_name);
  }
  for (const j of visits) if (!j.client_id) wantName(j.user_id, j.client_name);
  for (const [userId, names] of namesByUser) {
    clients.push(...(await selectIn<ClientRow>('clients by name', [...names], (list) =>
      admin.from('clients').select(CLIENT_SELECT).eq('user_id', userId).in('name', list))));
  }

  const invoiceDocs = docs.filter((d) => d.type === 'Invoice');
  const [receiptsById, receiptsByNumber, states, records] = await Promise.all([
    selectIn<ReceiptRow>('receipts', invoiceDocs.map((d) => d.id), (ids) =>
      admin.from('documents').select(RECEIPT_SELECT).in('user_id', userIds).eq('type', 'Receipt').in('data->>invoiceId', ids)),
    selectIn<ReceiptRow>('receipts by number', invoiceDocs.map((d) => String(d.invoiceNumber ?? '').trim()).filter(Boolean), (nums) =>
      admin.from('documents').select(RECEIPT_SELECT).in('user_id', userIds).eq('type', 'Receipt').in('data->>invoiceNumber', nums)),
    selectIn<{ document_id: string; sent_at: string }>('sent times', docs.map((d) => d.id), (ids) =>
      admin.from('reminder_document_state').select(STATE_SELECT).in('document_id', ids)),
    Promise.all([
      selectIn<RecordRow>('records', docs.map((d) => d.id), (ids) => admin.from('reminders').select(RECORD_SELECT).in('document_id', ids)),
      selectIn<RecordRow>('visit records', visits.map((j) => j.id), (ids) => admin.from('reminders').select(RECORD_SELECT).in('job_id', ids)),
    ]).then(([a, b]) => [...a, ...b]),
  ]);
  const receipts = [...new Map([...receiptsById, ...receiptsByNumber].map((x) => [x.id, x])).values()];
  const sentAtBy = new Map(states.map((s) => [s.document_id, s.sent_at]));
  const recordsBy = new Map<string, RecordedReminder[]>();
  for (const rec of records) {
    const target = rec.document_id ?? rec.job_id ?? '';
    const list = recordsBy.get(target) ?? [];
    list.push(recordFromRow(rec));
    recordsBy.set(target, list);
  }

  const planned: PlannedItem[] = [];

  const compose = (
    ctx: UserContext,
    kind: ReminderKind,
    templateKey: Parameters<typeof resolveTemplate>[1],
    values: Parameters<typeof renderReminder>[1],
  ): RenderedReminder => {
    const custom = aiWording(ctx, kind, values);
    return custom ?? renderReminder(resolveTemplate(ctx.settings, templateKey), values);
  };

  const push = (ctx: UserContext, base: Omit<OutgoingReminder, 'block' | 'accountId' | 'subject' | 'text' | 'html'>, msg: RenderedReminder) => {
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

  for (const d of docs) {
    const ctx = contexts.get(d.user_id as string)!;
    const tz = safeTimezone(ctx.settings.timezone);
    const job = d.job_id ? jobsById.get(d.job_id) ?? null : null;
    const client = resolveClient({ clientId: d.client_id, jobClientId: job?.client_id, name: d.clientName || job?.client_name, userId: d.user_id }, clients);
    const facts = factsFromDoc(d, { sentAt: sentAtBy.get(d.id) ?? null, receiptsTotal: d.type === 'Invoice' ? receiptsTotalFor(d, receipts.filter((x) => x.user_id === d.user_id)) : 0 });
    const decision = decideDue({
      facts,
      settings: ctx.settings,
      overrides: overridesFor(ownOverrides(d.user_id), { documentId: d.id, clientId: client?.id ?? null }),
      launchedAt,
      recorded: recordsBy.get(d.id) ?? [],
      now,
    });
    if (decision.action !== 'send') continue;
    const today = zonedNow(now, tz).ymd;
    const values = buildValues({
      kind: facts.kind,
      today,
      clientName: client?.name || d.clientName || job?.client_name,
      number: docNumber(d),
      amount: facts.amount,
      currency: d.currency,
      link: reminderLink(facts.kind, SITE_URL, d, client, now),
      payLink: d.paypalLink,
      dueDate: d.dueDate,
      sentDate: sentDay(facts, tz),
      jobName: job?.name,
      company: ctx.profile?.company_name,
      myName: ctx.profile?.name,
    });
    push(ctx, {
      userId: ctx.userId,
      kind: facts.kind,
      documentId: d.id,
      jobId: d.job_id ?? null,
      clientId: client?.id ?? null,
      stepKey: decision.step.stepKey,
      scheduledFor: decision.step.date,
      dedupeKey: decision.dedupeKey,
      retry: decision.retry?.id ? { id: decision.retry.id, attempts: decision.retry.attempts ?? 0 } : null,
      to: recipientOf(client?.email, d.clientEmail),
    }, compose(ctx, facts.kind, decision.step.templateKey, values));
  }

  for (const j of visits) {
    const ctx = contexts.get(j.user_id as string)!;
    const tz = safeTimezone(ctx.settings.timezone);
    const client = resolveClient({ clientId: j.client_id, name: j.client_name, userId: j.user_id }, clients);
    const facts = factsFromJob(j);
    const decision = decideDue({
      facts,
      settings: ctx.settings,
      overrides: overridesFor(ownOverrides(j.user_id), { jobId: j.id, clientId: client?.id ?? null }),
      launchedAt,
      recorded: recordsBy.get(j.id) ?? [],
      now,
    });
    if (decision.action !== 'send') continue;
    const values = buildValues({
      kind: 'visit',
      today: zonedNow(now, tz).ymd,
      clientName: client?.name || j.client_name,
      link: reminderLink('visit', SITE_URL, null, client, now),
      visitDate: j.start_date,
      jobName: j.name,
      company: ctx.profile?.company_name,
      myName: ctx.profile?.name,
    });
    push(ctx, {
      userId: ctx.userId,
      kind: 'visit',
      documentId: null,
      jobId: j.id,
      clientId: client?.id ?? null,
      stepKey: decision.step.stepKey,
      scheduledFor: decision.step.date,
      dedupeKey: decision.dedupeKey,
      retry: decision.retry?.id ? { id: decision.retry.id, attempts: decision.retry.attempts ?? 0 } : null,
      to: recipientOf(client?.email),
    }, compose(ctx, 'visit', decision.step.templateKey, values));
  }
  return planned;
}

/**
 * Premium+AI hook: AI-written wording (tone that gets firmer, the client's language). Not built yet; returning
 * null keeps the user's templates. When built: only for effectiveTier 'ai' with settings.aiWording on, through
 * the ai-assistant model, counted as one AI request (consume_ai_credit), falling back to the template on any error.
 */
function aiWording(_ctx: UserContext, _kind: ReminderKind, _values: Record<string, string | undefined>): RenderedReminder | null {
  return null;
}

/* ------------------------------------------------------------------------------------- sending */

/** Gmail / server error -> reminder failure reason. Only failures where nothing reached Gmail are retryable. */
function toFailure(e: unknown): SendFailure {
  if (e instanceof SendFailure) return e;
  if (e instanceof GmailTransportError) return new SendFailure('interrupted', e.message, false);
  if (e instanceof MimeError) return new SendFailure('invalid_message', e.message, false);
  if (e instanceof HttpError) {
    switch (e.code) {
      case 'RECONNECT_REQUIRED': return new SendFailure('gmail_reconnect', e.message, false);
      case 'GMAIL_RATE_LIMIT': return new SendFailure('gmail_rate_limit', e.message, true);
      case 'GMAIL_API_DISABLED': return new SendFailure('gmail_api_disabled', e.message, false);
      case 'GMAIL_REJECTED': return new SendFailure('gmail_rejected', e.message, false);
      case 'REFRESH_FAILED': return new SendFailure('refresh_failed', e.message, true);
      case 'NOT_CONFIGURED': return new SendFailure('not_configured', e.message, true);
      case 'GMAIL_ERROR': return new SendFailure('gmail_error', e.message, true);
      default: return new SendFailure('internal', e.message, true);
    }
  }
  return new SendFailure('internal', (e as Error)?.message || 'Unknown error', true);
}

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

function makeDeps(admin: SupabaseClient, contexts: Map<string, UserContext>, byKey: Map<string, PlannedItem>, deadline: number) {
  const recordBase = (item: OutgoingReminder) => ({
    user_id: item.userId,
    kind: item.kind,
    document_id: item.documentId,
    job_id: item.jobId,
    client_id: item.clientId,
    step_key: item.stepKey,
    scheduled_for: item.scheduledFor,
    dedupe_key: item.dedupeKey,
    to_email: item.to,
    subject: clip(item.subject, 300),
    account_id: item.accountId,
  });

  return {
    allowance: (userId: string) => contexts.get(userId)!.allowance,

    async recordSkip(item: OutgoingReminder, reason: string) {
      const { error } = await admin
        .from('reminders')
        .upsert({ ...recordBase(item), status: 'skipped', reason, attempts: 0 }, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
      if (error) throw new Error(`record skip: ${error.code ?? ''} ${error.message}`);
    },

    async claim(item: OutgoingReminder): Promise<Claim | null> {
      if (item.retry) {
        const { data, error } = await admin
          .from('reminders')
          .update({ ...recordBase(item), status: 'sending', reason: null, last_error: null, attempts: item.retry.attempts + 1 })
          .eq('id', item.retry.id)
          .eq('status', 'failed')
          .eq('attempts', item.retry.attempts)
          .select('id, attempts');
        if (error) throw new Error(`claim retry: ${error.code ?? ''} ${error.message}`);
        const row = (data ?? [])[0] as Claim | undefined;
        return row ? { id: row.id, attempts: row.attempts } : null;
      }
      const { data, error } = await admin
        .from('reminders')
        .insert({ ...recordBase(item), status: 'sending', attempts: 1 })
        .select('id, attempts')
        .single();
      if (error) {
        if (error.code === '23505') return null; // already recorded by this or another run
        throw new Error(`claim: ${error.code ?? ''} ${error.message}`);
      }
      return data as Claim;
    },

    async send(item: OutgoingReminder): Promise<{ messageId: string }> {
      const planned = byKey.get(`${item.userId}|${item.dedupeKey}`);
      const account = planned?.account;
      if (!account) throw new SendFailure('no_gmail', 'Gmail is not connected.', false);
      try {
        const built = buildMimeMessage({
          from: { email: account.gmail_address, name: planned.fromName },
          to: item.to as string,
          subject: item.subject,
          text: item.text,
          html: stripActiveHtml(item.html),
        });
        const keys = await tokenKeys();
        const result = await sendWithAccount(admin, keys, account, built.raw);
        return { messageId: String(result?.id ?? '') };
      } catch (e) {
        throw toFailure(e);
      }
    },

    async markSent(claim: Claim, _item: OutgoingReminder, messageId: string) {
      const { error } = await admin
        .from('reminders')
        .update({ status: 'sent', sent_at: new Date().toISOString(), gmail_message_id: clip(messageId, 200) || null, reason: null, last_error: null })
        .eq('id', claim.id);
      if (error) throw new Error(`mark sent: ${error.code ?? ''} ${error.message}`);
    },

    async markFailed(claim: Claim, _item: OutgoingReminder, failure: SendFailure) {
      const { error } = await admin
        .from('reminders')
        .update({ status: 'failed', reason: failure.reason, last_error: clip(failure.message, 500) })
        .eq('id', claim.id);
      if (error) throw new Error(`mark failed: ${error.code ?? ''} ${error.message}`);
    },

    async recordUsage(claim: Claim, item: OutgoingReminder) {
      await recordEmailUsage(admin, item.userId, { source: 'reminder', reminder_id: claim.id, kind: item.kind });
    },

    hasTime: () => Date.now() < deadline,
    log: (m: string) => console.error(m),
  };
}

/* ----------------------------------------------------------------------------------------- run */

async function run(admin: SupabaseClient, opts: { dryRun: boolean }) {
  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const now = new Date();
  if (!opts.dryRun) await closeInterrupted(admin, now);
  const launchedAt = await loadLaunchedAt(admin);
  const accounts = await loadAccountsByUser(admin);
  const userIds = [...accounts.keys()];

  const summary = emptySummary();
  const preview: Array<Record<string, unknown>> = [];
  let targets = 0;
  for (const batch of chunks(userIds, USERS_PER_BATCH)) {
    if (Date.now() >= deadline) break;
    const contexts = await buildUserContexts(admin, batch, accounts, now);
    const planned = await planBatch(admin, contexts, launchedAt, now);
    targets += planned.length;
    if (opts.dryRun) {
      for (const p of planned) {
        preview.push({
          user_id: p.item.userId, kind: p.item.kind, document_id: p.item.documentId, job_id: p.item.jobId, step: p.item.stepKey,
          scheduled_for: p.item.scheduledFor, retry: !!p.item.retry, block: p.item.block, has_email: !!p.item.to, subject: p.item.subject,
          allowed: contexts.get(p.item.userId)?.allowance,
        });
      }
      continue;
    }
    const byKey = new Map(planned.map((p) => [`${p.item.userId}|${p.item.dedupeKey}`, p]));
    mergeSummary(summary, await dispatchReminders(planned.map((p) => p.item), makeDeps(admin, contexts, byKey, deadline)));
  }
  const result = { ok: true, dry_run: opts.dryRun, users: userIds.length, targets, ...summary, ms: Date.now() - started, ...(opts.dryRun ? { preview } : {}) };
  console.log('[reminders] run', JSON.stringify({ ...result, preview: undefined }));
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  const expected = env('REMINDERS_CRON_SECRET');
  if (!expected) {
    console.error('[reminders] REMINDERS_CRON_SECRET is not set');
    return json(503, { error: 'Reminders are not configured.', code: 'NOT_CONFIGURED' });
  }
  if (!secretMatches((req.headers.get('x-reminders-secret') ?? '').trim(), expected)) {
    return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json(400, { error: 'Invalid request.', code: 'INVALID_JSON' });
  }
  const action = String(body?.action ?? 'run');
  if (action !== 'run') return json(400, { error: 'Unknown action.', code: 'INVALID_ACTION' });
  try {
    return json(200, await run(adminClient(), { dryRun: body?.dry_run === true }));
  } catch (e) {
    console.error('[reminders] run failed:', (e as Error)?.message ?? e);
    const missing = /reminders_config|reminder_settings|reminders|relation|schema cache/i.test(String((e as Error)?.message ?? ''));
    return json(500, { error: missing ? 'The reminders migration is not applied yet.' : 'Reminder run failed.', code: missing ? 'NOT_MIGRATED' : 'INTERNAL' });
  }
});
