// kelviq-webhook: receives Kelviq billing events and updates profiles.subscription_* (service role).
// Deployed with verify_jwt = false (Kelviq has no Supabase JWT); every request must carry a valid
// Kelviq signature instead. Business logic + idempotency live in SQL: public.apply_kelviq_event(jsonb)
// records the event in billing_events (unique by event id) and updates the profile in ONE transaction.
// AI credit packs (and refund.*) go to public.apply_ai_credit_event(jsonb) instead (route.ts;
// supabase/migrations/20261114000200_ai_credits.sql); subscription events are handled exactly as before.
//
// Responses: 401 bad/missing signature or stale timestamp (Kelviq does not retry 4xx),
//            400 malformed JSON, 200 processed / duplicate / test / ignored / unmatched,
//            500 database error (Kelviq retries 5xx up to 3 times).
import { serviceClient } from '../_shared/auth.ts';
import { json } from '../_shared/cors.ts';
import { verifyKelviqSignature } from '../_shared/kelviq.ts';
import { applyKelviqWebhookEvent } from './route.ts';

const MAX_BODY_BYTES = 1_000_000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(null, { error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('KELVIQ_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[kelviq-webhook] KELVIQ_WEBHOOK_SECRET is not set');
    return json(null, { error: 'Webhook not configured' }, 500);
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return json(null, { error: 'Payload too large' }, 413);

  const check = await verifyKelviqSignature(req.headers, rawBody, secret);
  if (!check.ok) {
    console.warn(`[kelviq-webhook] rejected delivery: ${check.reason}`);
    return json(null, { error: 'Invalid signature' }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json(null, { error: 'Invalid JSON' }, 400);
  }
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    return json(null, { error: 'Invalid event' }, 400);
  }
  // The event id must match the signed webhook-id header (dedupe key).
  if (!event.id) event.id = req.headers.get('webhook-id');

  const admin = serviceClient();
  const { fn, data, error } = await applyKelviqWebhookEvent(event, async (name, args) => {
    const r = await admin.rpc(name, args);
    return { data: r.data, error: r.error ? { message: r.error.message, code: r.error.code } : null };
  });
  if (error) {
    console.error(`[kelviq-webhook] ${fn} failed`, event.type, event.id, error.message);
    return json(null, { error: 'Processing failed' }, 500);
  }
  const result = data as { status?: string; user_id?: string; detail?: string } | null;
  console.log(`[kelviq-webhook] ${event.type} ${event.id} -> ${result?.status}${result?.detail ? ` (${result.detail})` : ''}`);
  return json(null, { received: true, status: result?.status ?? 'processed' }, 200);
});
