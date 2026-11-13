// gmail: everything Gmail, server-side. The browser NEVER receives a Google token.
//
// Actions (POST JSON, caller's Supabase JWT required):
//   auth_url    { return_to?, origin?, login_hint? }        -> { url, redirect_uri }
//   exchange    { code, state }                              -> { success, email, account_id, return_to }
//   list        {}                                           -> { accounts[], usage }
//   set_default { account_id }                               -> { success }
//   disconnect  { account_id }                               -> { success }  (revokes at Google, deletes tokens)
//   send        { account_id?, to, cc?, bcc?, reply_to?, subject, text?, html?, from_name?, attachments?[] }
//                                                            -> { success, id, thread_id, from }
// Errors: { error: <human message>, code: <MACHINE_CODE> } with a meaningful HTTP status.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SITE_URL, TOKEN_ENCRYPTION_KEY.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buildMimeMessage, cleanHeaderText, isValidEmail, MimeError } from './mime.ts';
import { decryptString, encryptString, importKeys, isEncrypted, readJwtClaims, signState, type TokenKeys, verifyState } from './crypto.ts';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const OAUTH_SCOPES = ['openid', 'email', GMAIL_SEND_SCOPE].join(' ');
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_UPLOAD_SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';
const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 28 * 1024 * 1024;
/** Keep in sync with FREE_LIMITS.emails in lib/plans.ts (and the DB's plan_limits()). */
const FREE_EMAIL_LIMIT = Number(Deno.env.get('FREE_EMAIL_LIMIT') ?? '10') || 10;
const PAID_TIERS = new Set(['premium', 'ai', 'pro', 'premium-ai', 'premium_ai']);

/* ----------------------------------------------------------------------------------------- env */

const env = (name: string) => (Deno.env.get(name) ?? '').trim();
const SITE_URL = env('SITE_URL').replace(/\/+$/, '');
const ALLOWED_ORIGINS = new Set([SITE_URL, 'http://localhost:3010', 'http://127.0.0.1:3010'].filter(Boolean));

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const notConfigured = (missing: string[]) => {
  console.error(`[gmail] missing secrets: ${missing.join(', ')}`);
  return new HttpError(503, 'NOT_CONFIGURED', 'Gmail is not set up on the server yet. Please contact support.');
};

function googleCredentials(): { clientId: string; clientSecret: string } {
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
function encryptionSecret(): string | undefined {
  const explicit = env('TOKEN_ENCRYPTION_KEY');
  if (explicit) return explicit;
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY');
  return serviceRole ? `contractordocs/gmail-token-key/v1:${serviceRole}` : undefined;
}

let keysPromise: Promise<TokenKeys> | null = null;
function tokenKeys(): Promise<TokenKeys> {
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

/* ---------------------------------------------------------------------------------------- http */

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

const json = (status: number, body: unknown, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The email with its attachments is too large to send.');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The email with its attachments is too large to send.');
  try {
    const parsed = JSON.parse(text || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Invalid request.');
  }
}

const str = (v: unknown, max = 10_000): string => (typeof v === 'string' ? v : '').slice(0, max);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------------------------------------------------------------------------------------- auth */

function adminClient(): SupabaseClient {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw notConfigured([!url && 'SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean) as string[]);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticate(req: Request, admin: SupabaseClient): Promise<{ id: string; email?: string }> {
  const header = req.headers.get('Authorization') ?? '';
  const jwt = header.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in again.');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError(401, 'UNAUTHORIZED', 'Your session expired. Please sign in again.');
  return { id: data.user.id, email: data.user.email ?? undefined };
}

/* ------------------------------------------------------------------------------------ accounts */

interface AccountRow {
  id: string;
  user_id: string;
  gmail_address: string;
  display_name: string | null;
  is_default: boolean | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface TokenRow {
  account_id: string;
  refresh_token_encrypted: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
}

const ACCOUNT_COLUMNS = 'id, user_id, gmail_address, display_name, is_default, status, created_at, updated_at';

const publicAccount = (a: AccountRow) => ({
  id: a.id,
  gmail_address: a.gmail_address,
  display_name: a.display_name,
  is_default: !!a.is_default,
  status: a.status === 'needs_reconnect' ? 'needs_reconnect' : 'active',
  needs_reconnect: a.status === 'needs_reconnect',
  created_at: a.created_at,
  updated_at: a.updated_at,
});

async function listAccounts(admin: SupabaseClient, userId: string): Promise<AccountRow[]> {
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
async function resolveAccount(admin: SupabaseClient, userId: string, requested: unknown): Promise<AccountRow> {
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

async function markNeedsReconnect(admin: SupabaseClient, accountId: string) {
  const { error } = await admin
    .from('user_gmail_accounts')
    .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
    .eq('id', accountId);
  if (error) console.error('[gmail] could not flag account:', error.code, error.message);
}

async function loadTokens(admin: SupabaseClient, accountId: string): Promise<TokenRow | null> {
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

async function saveTokens(admin: SupabaseClient, row: Partial<TokenRow> & { account_id: string }) {
  const { error } = await admin.from('gmail_tokens').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'account_id' });
  if (error) {
    console.error('[gmail] save tokens failed:', error.code, error.message);
    throw new HttpError(500, 'DB_ERROR', 'Could not save the Gmail connection.');
  }
}

/* ---------------------------------------------------------------------------------- google api */

async function postForm(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

/** Returns a valid access token for the account, refreshing it server-side when needed. */
async function getAccessToken(admin: SupabaseClient, keys: TokenKeys, account: AccountRow, forceRefresh = false): Promise<string> {
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

const monthStartIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

interface Usage {
  tier: string;
  paid: boolean;
  emails_this_month: number;
  limit: number | null;
}

async function getUsage(admin: SupabaseClient, userId: string): Promise<Usage & { profile: { company_name?: string | null; name?: string | null } }> {
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

async function recordEmailUsage(admin: SupabaseClient, userId: string) {
  const { error } = await admin.from('usage_events').insert({ user_id: userId, kind: 'email' });
  if (error) console.error('[gmail] usage insert failed:', error.code, error.message);
}

/* ------------------------------------------------------------------------------------- actions */

function pickRedirectOrigin(requested: unknown, headerOrigin: string | null): string {
  const candidates = [str(requested, 200).replace(/\/+$/, ''), (headerOrigin ?? '').replace(/\/+$/, '')];
  for (const c of candidates) if (c && ALLOWED_ORIGINS.has(c)) return c;
  if (SITE_URL) return SITE_URL;
  throw notConfigured(['SITE_URL']);
}

function sanitizeReturnTo(value: unknown): string {
  const v = str(value, 300).trim();
  if (!v.startsWith('/') || v.startsWith('//') || /[\r\n\\]/.test(v) || v.startsWith('/gmail-callback')) return '/communication';
  return v;
}

async function actionAuthUrl(req: Request, body: Record<string, unknown>, userId: string) {
  const { clientId } = googleCredentials();
  const keys = await tokenKeys();
  const origin = pickRedirectOrigin(body.origin, req.headers.get('Origin'));
  const redirectUri = `${origin}/gmail-callback`;
  const state = await signState(keys, { u: userId, r: redirectUri, t: sanitizeReturnTo(body.return_to), e: Date.now() + STATE_TTL_MS });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
  });
  const hint = str(body.login_hint, 254).trim();
  if (hint && isValidEmail(hint)) params.set('login_hint', hint);
  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}`, redirect_uri: redirectUri };
}

async function actionExchange(admin: SupabaseClient, body: Record<string, unknown>, userId: string) {
  const keys = await tokenKeys();
  const st = await verifyState(keys, body.state, userId);
  if (!st) {
    throw new HttpError(400, 'BAD_STATE', 'This Google sign-in expired or was started from a different account. Please connect Gmail again.');
  }
  const code = str(body.code, 2048).trim();
  if (!code) throw new HttpError(400, 'MISSING_CODE', 'Google did not return an authorization code. Please try again.');

  const { clientId, clientSecret } = googleCredentials();
  const res = await postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: st.r,
    grant_type: 'authorization_code',
  });
  if (!res.ok || typeof res.body.access_token !== 'string') {
    const err = String(res.body.error ?? res.status);
    console.error('[gmail] code exchange failed:', err);
    if (err === 'invalid_grant') throw new HttpError(400, 'CODE_EXPIRED', 'This Google authorization was already used or has expired. Please connect Gmail again.');
    if (err === 'redirect_uri_mismatch') throw new HttpError(500, 'REDIRECT_MISMATCH', 'Gmail is not set up correctly on the server (redirect URI). Please contact support.');
    throw new HttpError(502, 'EXCHANGE_FAILED', 'Google rejected the connection. Please try again.');
  }
  const accessToken = res.body.access_token as string;
  const refreshToken = typeof res.body.refresh_token === 'string' ? res.body.refresh_token : '';

  const granted = String(res.body.scope ?? '').split(/\s+/);
  if (!granted.includes(GMAIL_SEND_SCOPE)) {
    await postForm(GOOGLE_REVOKE_URL, { token: refreshToken || accessToken }).catch(() => undefined);
    throw new HttpError(400, 'SCOPE_MISSING', 'Please allow "Send email on your behalf" on the Google screen. ContractorDocs needs it to send your documents.');
  }

  let email = '';
  let emailVerified = true;
  let displayName: string | null = null;
  const claims = readJwtClaims(res.body.id_token);
  if (claims && claims.aud === clientId) {
    email = String(claims.email ?? '');
    emailVerified = claims.email_verified !== false && claims.email_verified !== 'false';
    displayName = typeof claims.name === 'string' ? claims.name : null;
  }
  if (!email) {
    const info = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = (await info.json().catch(() => ({}))) as Record<string, unknown>;
    email = String(data.email ?? '');
    emailVerified = data.email_verified !== false;
    displayName = typeof data.name === 'string' ? data.name : displayName;
  }
  email = email.trim().toLowerCase();
  if (!email || !emailVerified || !isValidEmail(email)) {
    throw new HttpError(400, 'NO_EMAIL', 'Google did not share a verified email address for this account.');
  }

  const accounts = await listAccounts(admin, userId);
  let account = accounts.find((a) => a.gmail_address.toLowerCase() === email);
  const now = new Date().toISOString();
  if (account) {
    const { error } = await admin
      .from('user_gmail_accounts')
      .update({ status: 'active', display_name: displayName ?? account.display_name, granted_scopes: granted.join(' '), updated_at: now })
      .eq('id', account.id);
    if (error) {
      console.error('[gmail] account update failed:', error.code, error.message);
      throw new HttpError(500, 'DB_ERROR', 'Could not save the Gmail account.');
    }
  } else {
    const { data, error } = await admin
      .from('user_gmail_accounts')
      .insert({ user_id: userId, gmail_address: email, display_name: displayName, is_default: accounts.length === 0, status: 'active', granted_scopes: granted.join(' ') })
      .select(ACCOUNT_COLUMNS)
      .single();
    if (error || !data) {
      console.error('[gmail] account insert failed:', error?.code, error?.message);
      throw new HttpError(500, 'DB_ERROR', 'Could not save the Gmail account.');
    }
    account = data as AccountRow;
  }

  const tokenRow: Partial<TokenRow> & { account_id: string } = {
    account_id: account.id,
    access_token: await encryptString(keys, accessToken),
    access_token_expires_at: new Date(Date.now() + Math.max(60, Number(res.body.expires_in ?? 3600)) * 1000).toISOString(),
  };
  if (refreshToken) {
    tokenRow.refresh_token_encrypted = await encryptString(keys, refreshToken);
  } else {
    const existing = await loadTokens(admin, account.id);
    if (!existing?.refresh_token_encrypted) {
      await markNeedsReconnect(admin, account.id);
      throw new HttpError(400, 'NO_REFRESH_TOKEN', 'Google did not grant offline access. Remove ContractorDocs at myaccount.google.com/permissions, then connect again.');
    }
  }
  await saveTokens(admin, tokenRow);
  return { success: true, email, account_id: account.id, return_to: st.t };
}

async function actionList(admin: SupabaseClient, userId: string) {
  const [accounts, usage] = await Promise.all([listAccounts(admin, userId), getUsage(admin, userId)]);
  const { profile: _profile, ...publicUsage } = usage;
  return { accounts: accounts.map(publicAccount), usage: publicUsage };
}

async function actionSetDefault(admin: SupabaseClient, body: Record<string, unknown>, userId: string) {
  const id = str(body.account_id, 64);
  if (!UUID_RE.test(id)) throw new HttpError(400, 'INVALID_ACCOUNT', 'Choose a Gmail account.');
  const accounts = await listAccounts(admin, userId);
  if (!accounts.some((a) => a.id === id)) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'That Gmail account is no longer connected.');
  const now = new Date().toISOString();
  const off = await admin.from('user_gmail_accounts').update({ is_default: false, updated_at: now }).eq('user_id', userId).neq('id', id);
  const on = await admin.from('user_gmail_accounts').update({ is_default: true, updated_at: now }).eq('user_id', userId).eq('id', id);
  if (off.error || on.error) {
    console.error('[gmail] set default failed:', off.error?.message, on.error?.message);
    throw new HttpError(500, 'DB_ERROR', 'Could not change the default sender.');
  }
  return { success: true };
}

async function actionDisconnect(admin: SupabaseClient, body: Record<string, unknown>, userId: string) {
  const accounts = await listAccounts(admin, userId);
  const want = str(body.account_id ?? body.gmail_address, 320).trim().toLowerCase();
  const account = accounts.find((a) => a.id === want || a.gmail_address.toLowerCase() === want);
  if (!account) return { success: true }; // already gone

  // Revoke the grant at Google (best effort: the user can also remove it at myaccount.google.com/permissions).
  const tokens = await loadTokens(admin, account.id).catch(() => null);
  const encrypted = tokens?.refresh_token_encrypted || tokens?.access_token;
  if (encrypted && isEncrypted(encrypted) && encryptionSecret()) {
    try {
      const keys = await tokenKeys();
      const token = await decryptString(keys, encrypted);
      const r = await postForm(GOOGLE_REVOKE_URL, { token });
      if (!r.ok && r.body.error !== 'invalid_token') console.error('[gmail] revoke failed:', r.status, r.body.error);
    } catch (e) {
      console.error('[gmail] revoke skipped:', (e as Error).message);
    }
  }

  const delTokens = await admin.from('gmail_tokens').delete().eq('account_id', account.id);
  if (delTokens.error) console.error('[gmail] delete tokens failed:', delTokens.error.message);
  const del = await admin.from('user_gmail_accounts').delete().eq('id', account.id).eq('user_id', userId);
  if (del.error) {
    console.error('[gmail] delete account failed:', del.error.code, del.error.message);
    throw new HttpError(500, 'DB_ERROR', 'Could not disconnect this account. Please try again.');
  }

  if (account.is_default) {
    const next = accounts.find((a) => a.id !== account.id);
    if (next) await admin.from('user_gmail_accounts').update({ is_default: true }).eq('id', next.id);
  }
  return { success: true };
}

/** Defense in depth: the app sanitizes HTML before sending; strip active content anyway. */
const stripActiveHtml = (html: string) =>
  html
    .replace(/<\s*(script|iframe|object|embed|form|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|form|link|meta|base)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"');

async function gmailSend(accessToken: string, raw: string) {
  const res = await fetch(GMAIL_UPLOAD_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'message/rfc822' },
    body: raw,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { res, body };
}

async function actionSend(admin: SupabaseClient, body: Record<string, unknown>, userId: string) {
  // 1. Sender account (clear error when nothing is connected).
  const account = await resolveAccount(admin, userId, body.account_id ?? body.gmail_address);
  if (account.status === 'needs_reconnect') {
    throw new HttpError(409, 'RECONNECT_REQUIRED', `Please reconnect ${account.gmail_address} before sending.`);
  }

  // 2. Build and validate the message before spending quota or tokens.
  const usage = await getUsage(admin, userId);
  const fromName = cleanHeaderText(str(body.from_name, 200)) || usage.profile.company_name || account.display_name || usage.profile.name || '';
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  let built;
  try {
    built = buildMimeMessage({
      from: { email: account.gmail_address, name: fromName },
      to: body.to as string | string[],
      cc: (body.cc ?? null) as string | string[] | null,
      bcc: (body.bcc ?? null) as string | string[] | null,
      replyTo: str(body.reply_to, 320) || null,
      subject: str(body.subject, 2000),
      text: str(body.text, 2_000_000) || null,
      html: body.html ? stripActiveHtml(str(body.html, 2_000_000)) : null,
      attachments: attachments.map((a: any) => ({
        filename: str(a?.filename ?? a?.name, 300),
        mimeType: str(a?.mime_type ?? a?.mimeType ?? a?.type, 120),
        contentBase64: str(a?.data_base64 ?? a?.data ?? a?.content, MAX_BODY_BYTES),
      })),
    });
  } catch (e) {
    if (e instanceof MimeError) throw new HttpError(400, e.code, e.message);
    throw e;
  }

  // 3. Free-plan monthly limit (server-side, COMM-037).
  if (!usage.paid && usage.limit !== null && usage.emails_this_month >= usage.limit) {
    throw new HttpError(402, 'PLAN_LIMIT', `PLAN_LIMIT: The free plan includes ${usage.limit} emails per month. Upgrade to Premium for unlimited sending.`);
  }

  // 4. Send (refresh the token server-side; retry once on 401).
  const keys = await tokenKeys();
  let accessToken = await getAccessToken(admin, keys, account);
  let { res, body: result } = await gmailSend(accessToken, built.raw);
  if (res.status === 401) {
    accessToken = await getAccessToken(admin, keys, account, true);
    ({ res, body: result } = await gmailSend(accessToken, built.raw));
  }

  if (!res.ok) {
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

  await recordEmailUsage(admin, userId);
  return {
    success: true,
    id: String(result?.id ?? ''),
    thread_id: String(result?.threadId ?? ''),
    from: account.gmail_address,
    recipients: built.recipients.length,
  };
}

/* -------------------------------------------------------------------------------------- server */

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, cors);

  let action = '';
  try {
    const admin = adminClient();
    const user = await authenticate(req, admin);
    const body = await readJson(req);
    action = str(body.action, 40);

    switch (action) {
      case 'auth_url':
      case 'start':
        return json(200, await actionAuthUrl(req, body, user.id), cors);
      case 'exchange':
        return json(200, await actionExchange(admin, body, user.id), cors);
      case 'list':
        return json(200, await actionList(admin, user.id), cors);
      case 'set_default':
        return json(200, await actionSetDefault(admin, body, user.id), cors);
      case 'disconnect':
        return json(200, await actionDisconnect(admin, body, user.id), cors);
      case 'send':
        return json(200, await actionSend(admin, body, user.id), cors);
      case 'refresh':
        // The old client asked for raw access tokens. Tokens never leave the server any more.
        return json(410, { error: 'Please reload the page to update ContractorDocs.', code: 'DEPRECATED' }, cors);
      default:
        return json(400, { error: 'Unknown action.', code: 'INVALID_ACTION' }, cors);
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code }, cors);
    console.error(`[gmail] ${action || 'request'} failed:`, (e as Error)?.message ?? e);
    return json(500, { error: 'Something went wrong. Please try again.', code: 'INTERNAL' }, cors);
  }
});
