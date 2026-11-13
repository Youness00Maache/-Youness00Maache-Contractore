// Token encryption (AES-256-GCM) and signed OAuth `state` (HMAC-SHA256), WebCrypto only.
// TOKEN_ENCRYPTION_KEY: 32 random bytes, base64 or base64url (`openssl rand -base64 32`).
// The HMAC key for `state` is derived from the same secret with a separate label, so one secret is enough.

import { base64ToBytes, base64UrlToBytes, bytesToBase64Url, fromBase64Url, randomHex, td, te } from './encoding.ts';

const ENC_PREFIX = 'v1.';

async function secretBytes(secret: string): Promise<Uint8Array<ArrayBuffer>> {
  const s = secret.trim();
  if (!s) throw new Error('TOKEN_ENCRYPTION_KEY is empty');
  try {
    const raw = base64ToBytes(fromBase64Url(s));
    if (raw.length === 32) return raw;
  } catch { /* not base64: derive below */ }
  // Accept a long passphrase too (derived to 32 bytes), but a random 32-byte key is recommended.
  if (s.length < 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 random bytes (base64) or a passphrase of at least 32 characters');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s)));
}

export interface TokenKeys {
  aes: CryptoKey;
  hmac: CryptoKey;
}

export async function importKeys(secret: string): Promise<TokenKeys> {
  const raw = await secretBytes(secret);
  const aes = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const label = te.encode('contractordocs/gmail-oauth-state/v1');
  const material = new Uint8Array(raw.length + label.length);
  material.set(raw, 0);
  material.set(label, raw.length);
  const hmacRaw = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  const hmac = await crypto.subtle.importKey('raw', hmacRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return { aes, hmac };
}

/** Returns `v1.<iv>.<ciphertext>` (base64url). */
export async function encryptString(keys: TokenKeys, plain: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.aes, te.encode(plain)));
  return `${ENC_PREFIX}${bytesToBase64Url(iv)}.${bytesToBase64Url(ct)}`;
}

export const isEncrypted = (blob: string | null | undefined): boolean => typeof blob === 'string' && blob.startsWith(ENC_PREFIX);

export async function decryptString(keys: TokenKeys, blob: string): Promise<string> {
  if (!isEncrypted(blob)) throw new Error('Stored token is not encrypted with the current format');
  const [, iv, ct] = blob.split('.');
  if (!iv || !ct) throw new Error('Malformed encrypted token');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(iv) }, keys.aes, base64UrlToBytes(ct));
  return td.decode(plain);
}

export interface OAuthState {
  /** Supabase user id the flow was started for. */
  u: string;
  /** Exact redirect_uri used in the authorization request. */
  r: string;
  /** Path inside the app to return to after linking. */
  t: string;
  /** Random nonce. */
  n: string;
  /** Expiry, ms since epoch. */
  e: number;
}

export async function signState(keys: TokenKeys, data: Omit<OAuthState, 'n'> & { n?: string }): Promise<string> {
  const payload = bytesToBase64Url(te.encode(JSON.stringify({ ...data, n: data.n ?? randomHex(16) })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', keys.hmac, te.encode(payload)));
  return `${payload}.${bytesToBase64Url(sig)}`;
}

/** Verifies signature, expiry and the user binding. Returns null when anything is off. */
export async function verifyState(keys: TokenKeys, state: unknown, userId: string, now = Date.now()): Promise<OAuthState | null> {
  if (typeof state !== 'string' || state.length > 2048) return null;
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', keys.hmac, base64UrlToBytes(sig), te.encode(payload));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const data = JSON.parse(td.decode(base64UrlToBytes(payload))) as OAuthState;
    if (!data || data.u !== userId || typeof data.e !== 'number' || data.e < now) return null;
    if (typeof data.r !== 'string' || typeof data.t !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

/** Reads the claims of a Google id_token (received directly from Google's token endpoint over TLS). */
export function readJwtClaims(jwt: unknown): Record<string, unknown> | null {
  if (typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(td.decode(base64UrlToBytes(parts[1])));
  } catch {
    return null;
  }
}
