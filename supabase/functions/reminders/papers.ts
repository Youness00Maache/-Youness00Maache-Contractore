// Papers vault expiry reminders (migration 20261115000300): an email to the contractor, from and to their own Gmail,
// 30 / 7 / 1 days before an insurance certificate, license, permit or bond expires (the steps set on the paper).
// Runs at the end of each reminders run (pg_cron, every 10 minutes); WHEN is decided by ./shared/papers.ts (same code
// as the app). Paid plans only (the vault is Premium). Every send is claimed in public.paper_reminders under a UNIQUE
// dedupe key BEFORE Gmail is called, so a reminder is never sent twice. Quietly does nothing while the migration is
// not applied. Sent at or after the user's reminder hour, in their time zone (Settings › Reminders).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buildMimeMessage } from '../gmail/mime.ts';
import { sendWithAccount, stripActiveHtml, tokenKeys, type AccountRow } from '../gmail/core.ts';
import { effectiveTier, safeTimezone, settingsFromRow, zonedNow, type ReminderSettingsRow } from './shared/schedule.ts';
import { duePaperStep, paperDedupeKey, paperReminderEmail } from './shared/papers.ts';

interface PaperRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  number: string | null;
  issuer: string | null;
  expires_on: string;
  reminder_offsets: number[] | null;
  created_at: string;
}

interface Profile {
  id: string;
  subscription_tier: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
}

export interface PaperRunSummary {
  papers: number;
  sent: number;
  failed: number;
  skipped: number;
  preview?: Array<Record<string, unknown>>;
}

const MISSING = /company_papers|paper_reminders|relation|schema cache|does not exist|PGRST20[05]|42P01/i;
const CHUNK = 80;

const chunks = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

function pickSender(accounts: AccountRow[], accountId: string | null): AccountRow | null {
  const active = accounts.filter((a) => a.status !== 'needs_reconnect');
  return active.find((a) => a.id === accountId) ?? active.find((a) => a.is_default) ?? active[0] ?? null;
}

/** Sends the paper reminders that are due. Never throws (a failure here must not break the invoice reminders). */
export async function runPaperReminders(
  admin: SupabaseClient,
  accountsByUser: Map<string, AccountRow[]>,
  now: Date,
  opts: { dryRun: boolean; deadline: number; siteUrl: string },
): Promise<PaperRunSummary> {
  const summary: PaperRunSummary = { papers: 0, sent: 0, failed: 0, skipped: 0, ...(opts.dryRun ? { preview: [] } : {}) };
  try {
    const userIds = [...accountsByUser.keys()];
    if (!userIds.length) return summary;
    const today = now.toISOString().slice(0, 10);
    const horizon = new Date(now.getTime() + 121 * 86_400_000).toISOString().slice(0, 10);
    // token keys are read only when a reminder is actually sent
    let keys: Awaited<ReturnType<typeof tokenKeys>> | null = null;

    for (const ids of chunks(userIds, CHUNK)) {
      if (Date.now() >= opts.deadline) break;
      const { data: rows, error } = await admin
        .from('company_papers')
        .select('id, user_id, kind, title, number, issuer, expires_on, reminder_offsets, created_at')
        .in('user_id', ids)
        .eq('remind', true)
        .is('archived_at', null)
        .gte('expires_on', new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10))
        .lte('expires_on', horizon)
        .limit(2000);
      if (error) {
        if (MISSING.test(`${error.code ?? ''} ${error.message}`)) return summary; // migration not applied yet
        throw new Error(`papers: ${error.code ?? ''} ${error.message}`);
      }
      const papers = (rows ?? []) as PaperRow[];
      if (!papers.length) continue;
      summary.papers += papers.length;

      const owners = [...new Set(papers.map((p) => p.user_id))];
      const [profilesRes, settingsRes, logRes] = await Promise.all([
        admin.from('profiles').select('id, subscription_tier, subscription_status, subscription_period_end').in('id', owners),
        admin.from('reminder_settings').select('*').in('user_id', owners),
        admin.from('paper_reminders').select('paper_id, expires_on, offset_days').in('paper_id', papers.map((p) => p.id)),
      ]);
      if (logRes.error) {
        if (MISSING.test(`${logRes.error.code ?? ''} ${logRes.error.message}`)) return summary;
        throw new Error(`paper log: ${logRes.error.code ?? ''} ${logRes.error.message}`);
      }
      const profiles = new Map(((profilesRes.data ?? []) as Profile[]).map((p) => [p.id, p]));
      const settings = new Map(((settingsRes.data ?? []) as ReminderSettingsRow[]).map((r) => [String(r.user_id), settingsFromRow(r)]));
      const sentBy = new Map<string, number[]>();
      for (const r of (logRes.data ?? []) as Array<{ paper_id: string; expires_on: string; offset_days: number }>) {
        const k = `${r.paper_id}|${String(r.expires_on).slice(0, 10)}`;
        sentBy.set(k, [...(sentBy.get(k) ?? []), Number(r.offset_days)]);
      }

      for (const p of papers) {
        if (Date.now() >= opts.deadline) break;
        const prof = profiles.get(p.user_id);
        if (effectiveTier(prof?.subscription_tier, prof?.subscription_status, prof?.subscription_period_end, now) === 'free') continue;
        const s = settings.get(p.user_id) ?? settingsFromRow(null);
        const tz = safeTimezone(s.timezone);
        const local = zonedNow(now, tz);
        if (local.hour < s.sendHour) continue;
        const expires = String(p.expires_on).slice(0, 10);
        const addedOn = zonedNow(new Date(p.created_at), tz).ymd;
        const step = duePaperStep({ expiresOn: expires, offsets: p.reminder_offsets ?? undefined, today: local.ymd, addedOn, sent: sentBy.get(`${p.id}|${expires}`) ?? [] });
        if (!step) continue;
        const sender = pickSender(accountsByUser.get(p.user_id) ?? [], s.accountId ?? null);
        const mail = paperReminderEmail({ title: p.title, kind: p.kind, number: p.number, issuer: p.issuer, expiresOn: expires, today: local.ymd, appUrl: opts.siteUrl });
        if (opts.dryRun) {
          summary.preview!.push({ user_id: p.user_id, paper_id: p.id, offset: step.offset, scheduled_for: step.date, has_sender: !!sender, subject: mail.subject });
          continue;
        }
        const base = {
          user_id: p.user_id, paper_id: p.id, expires_on: expires, offset_days: step.offset, scheduled_for: step.date,
          dedupe_key: paperDedupeKey(p.id, expires, step.offset), to_email: sender?.gmail_address ?? null,
        };
        if (!sender) {
          await admin.from('paper_reminders').upsert({ ...base, status: 'skipped', reason: 'no_gmail' }, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
          summary.skipped++;
          continue;
        }
        // claim first: a second run (or an overlap) gets 23505 and moves on
        const { data: claim, error: claimError } = await admin.from('paper_reminders').insert({ ...base, status: 'sending' }).select('id').single();
        if (claimError) {
          if (claimError.code !== '23505') console.error('[reminders] paper claim failed:', claimError.code, claimError.message);
          continue;
        }
        try {
          const built = buildMimeMessage({
            from: { email: sender.gmail_address, name: sender.display_name || 'ContractorDocs' },
            to: sender.gmail_address,
            subject: mail.subject,
            text: mail.text,
            html: stripActiveHtml(mail.html),
          });
          keys = keys ?? await tokenKeys();
          const result = await sendWithAccount(admin, keys, sender, built.raw);
          await admin.from('paper_reminders').update({ status: 'sent', sent_at: new Date().toISOString(), gmail_message_id: String(result?.id ?? '').slice(0, 200) || null }).eq('id', (claim as { id: string }).id);
          summary.sent++;
        } catch (e) {
          await admin.from('paper_reminders').update({ status: 'failed', reason: 'gmail_error', last_error: String((e as Error)?.message ?? e).slice(0, 500) }).eq('id', (claim as { id: string }).id);
          summary.failed++;
        }
      }
    }
  } catch (e) {
    console.error('[reminders] paper reminders failed:', (e as Error)?.message ?? e);
  }
  return summary;
}
