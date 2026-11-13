// Gmail server core: accounts, encrypted tokens, usage and sending. Shared by the `gmail` function (browser
// requests) and the `reminders` function (scheduled sends), so both refresh tokens, count emails and map Gmail
// errors the same way. Moved here unchanged from gmail/index.ts (2026-11-13); behaviour of `gmail` is identical.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY (optional).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { cleanHeaderText } from './mime.ts';
import { decryptString, encryptString, importKeys, isEncrypted, type TokenKeys } from './crypto.ts';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GMAIL_UPLOAD_SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';
/** Keep in sync with FREE_LIMITS.emails in lib/plans.ts (and the DB's plan_limits()). */
export const FREE_EMAIL_LIMIT = Number(Deno.env.get('FREE_EMAIL_LIMIT') ?? '10') || 10;
export const PAID_TIERS = new Set(['premium', 'ai', 'pro', 'premium-ai', 'premium_ai']);

/* ----------------------------------------------------------------------------------------- env */

export const env = (name: string) => (Deno.env.get(name) ?? '').trim();

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** fetch() itself failed while sending to Gmail: the message may or may not have been accepted. */
export class GmailTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailTransportError';
  }
}

export const notConfigured = (missing: string[]) => {
  console.error(`[gmail] missing secrets: ${missing.join(', ')}`);
  return new HttpError(503, 'NOT_CONFIGURED', 'Gmail is not set up on the server yet. Please contact support.');
};

export function googleCredentials(): { clientId: string; clientSecret: string } {
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  const missing = [!clientId && 'GOOGLE_CLIENT_ID', !clientSecret && 'GOOGLE_CLIENT_SECRET'].filter(Boolean) as string[];
  if (missing.length) throw notConfigured(missing);
  return { clientId, clientSecret };
}

/**
 * Encryption secret for stored Gmail tokens: TOKEN_ENCRYPTION_KEY when set, otherwise a key derived from the
 * project's own SUPABASE_SERVICE_ROLE_KEY (always present in Supabase functions, never exposed to browsers).
 * Note: with the derived key, rotating the service-role key means users reconnect Gmail once.
 */
export function encryptionSecret(): string | undefined {
  const explicit = env('TOKEN_ENCRYPTION_KEY');
  if (explicit) return explicit;
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY');
  return serviceRole ? `contractordocs/gmail-token-key/v1:${serviceRole}` : undefined;
}

let keysPromise: Promise<TokenKeys> | null = null;
export function tokenKeys(): Promise<TokenKeys> {
  const secret = encryptionSecret();
  if (!secret) throw notConfigured(['TOKEN_ENCRYPTION_KEY']);
  if (!keysPromise) {
    keysPromise = importKeys(secret).catch((e) => {
      keysPromise = null;
      console.error('[gmail] invalid TOKEN_ENCRYPTION_KEY:', (e as Error).message);
      throw new HttpError(503, 'NOT_CONFIGURED', 'Gmail is not set up on the server yet. Please contact support.');
    });
  }
  return keysPromise;
}

export const str = (v: unknown, max = 10_000): string => (typeof v === 'string' ? v : '').slice(0, max);

export function adminClient(): SupabaseClient {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw notConfigured([!url && 'SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean) as string[]);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* ------------------------------------------------------------------------------------ accounts */

export interface AccountRow {
  id: string;
  user_id: string;
  gmail_address: string;
  display_name: string | null;
  is_default: boolean | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TokenRow {
  account_id: string;
  refresh_token_encrypted: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
}

export const ACCOUNT_COLUMNS = 'id, user_id, gmail_address, display_name, is_default, status, created_at, updated_at';

export async function listAccounts(admin: SupabaseClient, userId: string): Promise<AccountRow[]> {
  const { data, error } = await admin
    .from('user_gmail_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[gmail] list accounts failed:', error.code, error.message);
    throw new HttpError(500, 'DB_ERROR', 'Could not load your Gmail accounts.');
  }
  return (data ?? []) as AccountRow[];
}

/** The requested account (by id or address), else the default, else the only/oldest one. */
export async function resolveAccount(admin: SupabaseClient, userId: string, requested: unknown): Promise<AccountRow> {
  const accounts = await listAccounts(admin, userId);
  if (accounts.length === 0) {
    throw new HttpError(400, 'NO_ACCOUNT', 'Connect a Gmail account first (Communication → Connect Gmail).');
  }
  const want = str(requested, 320).trim().toLowerCase();
  if (want) {
    const found = accounts.find((a) => a.id === want || a.gmail_address.toLowerCase() === want);
    if (!found) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'That Gmail account is no longer connected. Choose another sender.');
    return found;
  }
  return accounts.find((a) => a.is_default) ?? accounts[0];
}

export async function markNeedsReconnect(admin: SupabaseClient, accountId: string) {
  const { error } = await admin
    .from('user_gmail_accounts')
    .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
    .eq('id', accountId);
  if (error) console.error('[gmail] could not flag account:', error.code, error.message);
}

export async function loadTokens(admin: SupabaseClient, accountId: string): Promise<TokenRow | null> {
  const { data, error } = await admin
    .from('gmail_tokens')
    .select('account_id, refresh_token_encrypted, access_token, access_token_expires_at')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) {
    console.error('[gmail] load tokens failed:', error.code, error.message);
    throw new HttpError(500, 'DB_ERROR', 'Could not load the Gmail connection.');
  }
  return (data as TokenRow | null) ?? null;
}

export async function saveTokens(admin: SupabaseClient, row: Partial<TokenRow> & { account_id: string }) {
  const { error } = await admin.from('gmail_tokens').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'account_id' });
  if (error) {
    console.error('[gmail] save tokens failed:', error.code, error.message);
    throw new HttpError(500, 'DB_ERROR', 'Could not save the Gmail connection.');
  }
}

/* ---------------------------------------------------------------------------------- google api */

export async function postForm(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

/** Returns a valid access token for the account, refreshing it server-side when needed. */
export async function getAccessToken(admin: SupabaseClient, keys: TokenKeys, account: AccountRow, forceRefresh = false): Promise<string> {
  const tokens = await loadTokens(admin, account.id);
  if (!tokens?.refresh_token_encrypted || !isEncrypted(tokens.refresh_token_encrypted)) {
    await markNeedsReconnect(admin, account.id);
    throw new HttpError(409, 'RECONNECT_REQUIRED', `Please reconnect ${account.gmail_address} to keep sending email.`);
  }

  const expiresAt = tokens.access_token_expires_at ? Date.parse(tokens.access_token_expires_at) : 0;
  if (!forceRefresh && tokens.access_token && isEncrypted(tokens.access_token) && expiresAt - Date.now() > 60_000) {
    try {
      return await decryptString(keys, tokens.access_token);
    } catch { /* fall through and refresh */ }
  }

  let refreshToken: string;
  try {
    refreshToken = await decryptString(keys, tokens.refresh_token_encrypted);
  } catch (e) {
    console.error('[gmail] cannot decrypt refresh token (key rotated?):', (e as Error).message);
    await markNeedsReconnect(admin, account.id);
    throw new HttpError(409, 'RECONNECT_REQUIRED', `Please reconnect ${account.gmail_address} to keep sending email.`);
  }

  const { clientId, clientSecret } = googleCredentials();
  const res = await postForm(GOOGLE_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (!res.ok || typeof res.body.access_token !== 'string') {
    const err = String(res.body.error ?? res.status);
    if (err === 'invalid_grant' || err === 'unauthorized_client') {
      await markNeedsReconnect(admin, account.id);
      throw new HttpError(409, 'RECONNECT_REQUIRED', `Google access for ${account.gmail_address} was revoked or expired. Please reconnect this account.`);
    }
    console.error('[gmail] refresh failed:', err);
    throw new HttpError(502, 'REFRESH_FAILED', 'Google did not respond as expected. Please try again in a minute.');
  }

  const accessToken = res.body.access_token as string;
  const expiresIn = Number(res.body.expires_in ?? 3600);
  const update: Partial<TokenRow> & { account_id: string } = {
    account_id: account.id,
    access_token: await encryptString(keys, accessToken),
    access_token_expires_at: new Date(Date.now() + Math.max(60, expiresIn) * 1000).toISOString(),
  };
  if (typeof res.body.refresh_token === 'string' && res.body.refresh_token) {
    update.refresh_token_encrypted = await encryptString(keys, res.body.refresh_token);
  }
  await saveTokens(admin, update);
  return accessToken;
}

/* -------------------------------------------------------------------------------------- limits */

export const monthStartIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

export interface Usage {
  tier: string;
  paid: boolean;
  emails_this_month: number;
  limit: number | null;
}

export async function getUsage(admin: SupabaseClient, userId: string): Promise<Usage & { profile: { company_name?: string | null; name?: string | null } }> {
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('subscription_tier, company_name, name')
    .eq('id', userId)
    .maybeSingle();
  if (pErr) console.error('[gmail] profile read failed:', pErr.code, pErr.message);
  const tier = String((profile as { subscription_tier?: string } | null)?.subscription_tier ?? 'free').toLowerCase();
  const paid = PAID_TIERS.has(tier);

  let count = 0;
  const { count: c, error } = await admin
    .from('usage_events')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'email')
    .gte('created_at', monthStartIso());
  if (error) console.error('[gmail] usage count failed:', error.code, error.message);
  else count = c ?? 0;

  return {
    tier: paid ? tier : 'free',
    paid,
    emails_this_month: count,
    limit: paid ? null : FREE_EMAIL_LIMIT,
    profile: (profile as { company_name?: string | null; name?: string | null } | null) ?? {},
  };
}

/** Counts one sent email. `meta` (optional) says where it came from, e.g. { source: 'reminder' }. */
export async function recordEmailUsage(admin: SupabaseClient, userId: string, meta?: Record<string, unknown>) {
  const row: Record<string, unknown> = { user_id: userId, kind: 'email' };
  if (meta) row.meta = meta;
  const { error } = await admin.from('usage_events').insert(row);
  if (error) console.error('[gmail] usage insert failed:', error.code, error.message);
}

/* ------------------------------------------------------------------------------------- sending */

/** Defense in depth: the app sanitizes HTML before sending; strip active content anyway. */
export const stripActiveHtml = (html: string) =>
  html
    .replace(/<\s*(script|iframe|object|embed|form|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|form|link|meta|base)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"');

export async function gmailSend(accessToken: string, raw: string) {
  let res: Response;
  try {
    res = await fetch(GMAIL_UPLOAD_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'message/rfc822' },
      body: raw,
    });
  } catch (e) {
    throw new GmailTransportError((e as Error)?.message || 'Could not reach Gmail');
  }
  // deno-lint-ignore no-explicit-any
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { res, body };
}

/** Turns a non-OK Gmail send response into the matching HttpError (flags the account when access is gone). */
// deno-lint-ignore no-explicit-any
export async function throwGmailSendError(admin: SupabaseClient, account: AccountRow, res: Response, result: Record<string, any>): Promise<never> {
  const gErr = result?.error ?? {};
  const reason = String(gErr?.errors?.[0]?.reason ?? gErr?.status ?? '');
  const message = String(gErr?.message ?? '');
  console.error('[gmail] gmail send failed:', res.status, reason);
  if (res.status === 401) {
    await markNeedsReconnect(admin, account.id);
    throw new HttpError(409, 'RECONNECT_REQUIRED', `Please reconnect ${account.gmail_address} before sending.`);
  }
  if (res.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(`${reason} ${message}`)) {
    throw new HttpError(503, 'GMAIL_API_DISABLED', 'Gmail sending is not enabled for this app yet. Please contact support.');
  }
  if (res.status === 403 && /insufficient|scope|PERMISSION_DENIED/i.test(`${reason} ${message}`)) {
    await markNeedsReconnect(admin, account.id);
    throw new HttpError(409, 'RECONNECT_REQUIRED', `Gmail permission is missing for ${account.gmail_address}. Please reconnect and allow sending email.`);
  }
  if (res.status === 429 || /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded/i.test(reason)) {
    throw new HttpError(429, 'GMAIL_RATE_LIMIT', 'Gmail is limiting how fast this account can send. Please wait a few minutes and try again.');
  }
  if (res.status === 400) {
    throw new HttpError(400, 'GMAIL_REJECTED', `Gmail rejected the message${message ? `: ${cleanHeaderText(message).slice(0, 200)}` : '.'}`);
  }
  throw new HttpError(502, 'GMAIL_ERROR', 'Gmail could not send the message. Please try again.');
}

/** Sends a built RFC 822 message from the account (refreshes the token server-side; retries once on 401). */
// deno-lint-ignore no-explicit-any
export async function sendWithAccount(admin: SupabaseClient, keys: TokenKeys, account: AccountRow, raw: string): Promise<Record<string, any>> {
  let accessToken = await getAccessToken(admin, keys, account);
  let { res, body: result } = await gmailSend(accessToken, raw);
  if (res.status === 401) {
    accessToken = await getAccessToken(admin, keys, account, true);
    ({ res, body: result } = await gmailSend(accessToken, raw));
  }
  if (!res.ok) await throwGmailSendError(admin, account, res, result);
  return result;
}
