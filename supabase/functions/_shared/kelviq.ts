// Kelviq (Merchant of Record) helpers shared by kelviq-checkout and kelviq-webhook.
// Docs: https://docs.kelviq.com (checkout: POST /checkout/, portal: POST /portal/session/,
// customers: POST /customers/ + PATCH /customers/{customerId}/, webhooks: HMAC-SHA256 "v1,<hex>").

export type PaidTier = 'premium' | 'ai';
export type ChargePeriod = 'MONTHLY' | 'YEARLY';

/** Plan identifiers published in the Kelviq product (keep in sync with lib/plans.ts). */
export const TIER_TO_PLAN: Record<PaidTier, string> = { premium: 'premium', ai: 'premium-ai' };

export function planToTier(plan: string | null | undefined): PaidTier | null {
  const p = String(plan || '').toLowerCase();
  if (p === 'premium') return 'premium';
  if (p === 'premium-ai' || p === 'premium_ai') return 'ai';
  return null;
}

export function kelviqBaseUrl(): string {
  return (Deno.env.get('KELVIQ_ENV') || 'live').toLowerCase() === 'sandbox'
    ? 'https://sandboxapi.kelviq.com/api/v1'
    : 'https://api.kelviq.com/api/v1';
}

export class KelviqError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

/** Calls the Kelviq REST API with the server key. Throws KelviqError on non-2xx. */
export async function kelviqRequest<T = any>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const key = Deno.env.get('KELVIQ_SERVER_API_KEY');
  if (!key) throw new KelviqError('Billing is not configured', 503, null);
  const res = await fetch(`${kelviqBaseUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) throw new KelviqError(`Kelviq ${method} ${path} failed with ${res.status}`, res.status, parsed);
  return parsed as T;
}

// ------------------------------------------------------------------ webhook signatures
const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))));
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

/**
 * Verifies a Kelviq delivery exactly as documented: HMAC-SHA256 (hex) over
 * `${webhook-id}.${webhook-timestamp}.${rawBody}` with the endpoint signing secret, header
 * `webhook-signature: v1,<hex>` (several space-separated signatures are accepted during secret
 * rotation), constant-time comparison, and a 5 minute replay window on webhook-timestamp.
 */
export async function verifyKelviqSignature(
  headers: Headers, rawBody: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300,
): Promise<SignatureCheck> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signature = headers.get('webhook-signature');
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing webhook headers' };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'invalid timestamp' };
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return { ok: false, reason: 'timestamp outside tolerance' };

  const expected = hexToBytes(await hmacSha256Hex(secret, `${id}.${timestamp}.${rawBody}`))!;
  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',', 2);
    if (version !== 'v1' || !value) continue;
    const received = hexToBytes(value.trim());
    if (received && timingSafeEqual(expected, received)) return { ok: true };
  }
  return { ok: false, reason: 'signature mismatch' };
}
