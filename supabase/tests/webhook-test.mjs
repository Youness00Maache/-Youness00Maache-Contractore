#!/usr/bin/env node
/**
 * Edge function tests against the LOCAL stack: kelviq-webhook (signatures, idempotency, state
 * changes), kelviq-checkout (auth, validation, CORS, "not configured") and delete-account.
 *
 *   npx supabase functions serve --env-file supabase/functions/.env     # separate terminal
 *   node supabase/tests/webhook-test.mjs
 *
 * Uses the TEST secret from supabase/functions/.env (never a real key).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '..', 'functions', '.env');
const fnEnv = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const SECRET = fnEnv.KELVIQ_WEBHOOK_SECRET;
if (!SECRET || !/test/i.test(SECRET)) throw new Error('supabase/functions/.env must contain a TEST KELVIQ_WEBHOOK_SECRET');

const status = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(status.split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const URL_ = env.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) throw new Error('local stack only');
const FN = `${URL_}/functions/v1`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, env.SERVICE_ROLE_KEY, opts);

let passed = 0;
let failed = 0;
const ok = (cond, label, extra) => {
  if (cond) { passed++; console.log(`  PASS ${label}`); } else { failed++; console.log(`  FAIL ${label}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); }
};

const sign = (id, ts, body, secret = SECRET) => `v1,${createHmac('sha256', secret).update(`${id}.${ts}.${body}`, 'utf8').digest('hex')}`;
let clock = Math.floor(Date.now() / 1000);
function makeEvent(type, object, extra = {}) {
  clock += 2;
  return { id: randomUUID(), type, created_at: new Date(clock * 1000).toISOString(), data: { object }, ...extra };
}
async function deliver(event, { secret = SECRET, ts = Math.floor(Date.now() / 1000), body, headers = true } = {}) {
  const raw = body ?? JSON.stringify(event);
  const h = { 'Content-Type': 'application/json' };
  if (headers) Object.assign(h, { 'webhook-id': event.id, 'webhook-timestamp': String(ts), 'webhook-signature': sign(event.id, ts, raw, secret) });
  const res = await fetch(`${FN}/kelviq-webhook`, { method: 'POST', headers: h, body: raw });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}
const profile = async (id) => (await admin.from('profiles').select('subscription_tier, subscription_status, subscription_period_end, kelviq_subscription_id, kelviq_customer_id').eq('id', id).single()).data;

const users = [];
async function makeUser(tag) {
  const email = `cd-fn-${tag}-${Date.now().toString(36)}@example.test`;
  const password = `Fn-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const client = createClient(URL_, env.ANON_KEY, opts);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, email, token: s.session.access_token, db: client };
}

async function main() {
  const probe = await fetch(`${FN}/kelviq-webhook`, { method: 'POST', body: '' }).catch(() => null);
  if (!probe) throw new Error(`Functions are not reachable at ${FN}. Run: npx supabase functions serve --env-file supabase/functions/.env`);

  const U = await makeUser('webhook');
  const sub = `sub_${randomUUID()}`;
  const periodEnd = new Date(Date.now() + 30 * 864e5).toISOString();
  const subObject = (overrides = {}) => ({
    object: 'subscription', id: sub, status: 'active', plan: { name: 'Premium + AI', identifier: 'premium-ai' },
    billing_period_end_time: periodEnd, end_date: null,
    customer: { id: 'kq_internal_customer', email: U.email, customer_id: U.id.replace(/-/g, '') }, ...overrides,
  });

  console.log('\n== kelviq-webhook: signatures');
  const created = makeEvent('subscription.created', subObject());
  let r = await deliver(created, { headers: false });
  ok(r.status === 401, 'unsigned delivery -> 401', r);
  r = await deliver(created, { secret: 'kq_whsec_wrong_secret_test' });
  ok(r.status === 401, 'wrongly signed delivery -> 401', r);
  ok((await profile(U.id)).subscription_tier === 'free', 'tier unchanged after bad signatures');
  r = await deliver(created, { ts: Math.floor(Date.now() / 1000) - 600 });
  ok(r.status === 401, 'timestamp older than 5 minutes -> 401 (replay)', r);
  {
    // valid signature for the original body, but the body was modified in transit
    const t0 = Math.floor(Date.now() / 1000);
    const tampered = JSON.stringify({ ...created, data: { object: subObject({ plan: { identifier: 'premium' } }) } });
    const resT = await fetch(`${FN}/kelviq-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'webhook-id': created.id, 'webhook-timestamp': String(t0), 'webhook-signature': sign(created.id, t0, JSON.stringify(created)) }, body: tampered });
    ok(resT.status === 401, 'tampered body -> 401', resT.status);
  }
  // signature computed over a different body than sent
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(`${FN}/kelviq-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'webhook-id': created.id, 'webhook-timestamp': String(ts), 'webhook-signature': sign(created.id, ts, '{}') }, body: JSON.stringify(created) });
  ok(res.status === 401, 'signature over another body -> 401', res.status);
  ok((await profile(U.id)).subscription_tier === 'free', 'still free');

  console.log('\n== kelviq-webhook: events');
  r = await deliver(makeEvent('subscription.created', subObject(), { test: true }));
  ok(r.status === 200 && r.json?.status === 'test' && (await profile(U.id)).subscription_tier === 'free', 'test:true delivery -> 200 without side effects', r);
  r = await deliver(created);
  let p = await profile(U.id);
  ok(r.status === 200 && p.subscription_tier === 'ai' && p.subscription_status === 'active' && p.kelviq_subscription_id === sub && p.kelviq_customer_id === 'kq_internal_customer',
     'signed subscription.created (premium-ai, customer id without dashes) -> tier ai', { r, p });
  r = await deliver(created);
  const ev = (await admin.from('billing_events').select('attempts, status').eq('id', created.id).single()).data;
  ok(r.status === 200 && r.json?.status === 'duplicate' && ev.attempts === 2 && ev.status === 'processed', 'duplicate delivery ignored (idempotent by event id)', { r, ev });
  await admin.from('profiles').update({ subscription_tier: 'premium' }).eq('id', U.id);
  r = await deliver(created);
  ok((await profile(U.id)).subscription_tier === 'premium', 'replaying an old event never re-applies it');
  await admin.from('profiles').update({ subscription_tier: 'ai' }).eq('id', U.id);

  r = await deliver(makeEvent('invoice.payment_failed', { object: 'invoice', id: 'INV-1', status: 'PAYMENT_FAILED', subscription_id: sub, customer: { id: 'kq_internal_customer', customer_id: U.id } }));
  p = await profile(U.id);
  ok(r.status === 200 && p.subscription_status === 'past_due' && p.subscription_tier === 'ai', 'invoice.payment_failed -> past_due, access kept', p);
  r = await deliver(makeEvent('invoice.paid', { object: 'invoice', id: 'INV-1', status: 'PAID', subscription_id: sub, customer: { id: 'kq_internal_customer', customer_id: U.id } }));
  ok((await profile(U.id)).subscription_status === 'active', 'invoice.paid -> active again');
  r = await deliver(makeEvent('subscription.plan_changed', subObject({ plan: { identifier: 'premium' } })));
  ok((await profile(U.id)).subscription_tier === 'premium', 'subscription.plan_changed premium-ai -> premium');
  const cancelAt = new Date(Date.now() + 10 * 864e5).toISOString();
  r = await deliver(makeEvent('subscription.updated', subObject({ plan: { identifier: 'premium' }, end_date: cancelAt })));
  p = await profile(U.id);
  ok(p.subscription_tier === 'premium' && p.subscription_status === 'active', 'scheduled cancellation keeps access until the end date', p);
  r = await deliver(makeEvent('subscription.paused', subObject({ plan: { identifier: 'premium' }, status: 'paused', billing_period_end_time: periodEnd })));
  p = await profile(U.id);
  ok(p.subscription_status === 'paused' && p.subscription_tier === 'premium', 'paused -> keeps access until the paid period ends', p);
  r = await deliver(makeEvent('subscription.resumed', subObject({ plan: { identifier: 'premium' } })));
  ok((await profile(U.id)).subscription_status === 'active', 'resumed -> active');
  const other = makeEvent('subscription.cancelled', subObject({ id: 'sub_other', status: 'canceled', end_date: new Date(Date.now() - 1000).toISOString() }));
  r = await deliver(other);
  ok(r.json?.status === 'ignored' && (await profile(U.id)).subscription_tier === 'premium', 'cancellation of a different (old) subscription is ignored', r.json);
  r = await deliver(makeEvent('subscription.cancelled', subObject({ status: 'canceled', end_date: new Date(Date.now() - 1000).toISOString() })));
  p = await profile(U.id);
  ok(p.subscription_tier === 'free' && p.subscription_status === 'cancelled', 'subscription.cancelled at period end -> free', p);
  r = await deliver(makeEvent('checkout.completed', { object: 'checkout_session', id: 'cs_1', status: 'success', plan: { identifier: 'premium' }, customer_id: 'kq_internal_customer', customer: { id: 'kq_internal_customer', customer_id: 'someone-else' }, metadata: { user_id: U.id } }));
  ok((await profile(U.id)).subscription_tier === 'premium', 'checkout.completed mapped through metadata.user_id -> premium');
  r = await deliver(makeEvent('order.refunded', { object: 'order', id: 'ORD-1', status: 'REFUNDED', subscription_id: sub, customer: { id: 'kq_internal_customer', customer_id: U.id }, plan: { identifier: 'premium' } }));
  ok((await profile(U.id)).subscription_tier === 'free', 'full refund -> free');
  r = await deliver(makeEvent('subscription.created', subObject({ id: 'sub_unknown', customer: { id: 'kq_unknown', customer_id: randomUUID() } })));
  ok(r.status === 200 && r.json?.status === 'unmatched', 'unknown customer -> 200 unmatched (recorded, not retried)', r.json);
  r = await deliver(makeEvent('customer.updated', { object: 'customer', id: 'kq_internal_customer', customer_id: U.id }));
  ok(r.status === 200 && r.json?.status === 'ignored', 'unhandled event type -> 200 ignored', r.json);

  console.log('\n== kelviq-checkout');
  let c = await fetch(`${FN}/kelviq-checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'premium', period: 'MONTHLY' }) });
  ok(c.status === 401, 'no JWT -> 401', c.status);
  const call = async (body, origin = 'http://localhost:3010') => {
    const res2 = await fetch(`${FN}/kelviq-checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${U.token}`, apikey: env.ANON_KEY, Origin: origin }, body: JSON.stringify(body) });
    return { status: res2.status, cors: res2.headers.get('access-control-allow-origin'), json: await res2.json().catch(() => null) };
  };
  c = await call({ tier: 'gold', period: 'MONTHLY' });
  ok(c.status === 400 && c.json?.code === 'BAD_REQUEST', 'unknown tier -> 400', c);
  // the LOCAL API gateway (Kong) answers CORS with '*' itself; hosted Supabase passes the function's own headers through
  ok(c.cors === 'http://localhost:3010' || c.cors === '*', 'CORS allows the dev origin', c.cors);
  c = await call({ tier: 'premium', period: 'MONTHLY' }, 'https://evil.example');
  ok(c.cors !== 'https://evil.example', 'CORS does not reflect other origins', c.cors);
  c = await call({ tier: 'premium', period: 'YEARLY', successUrl: 'https://evil.example/steal' });
  ok(c.status === 503 && c.json?.code === 'BILLING_NOT_CONFIGURED', 'no server key locally -> 503 BILLING_NOT_CONFIGURED (static-link fallback in lib/billing.ts)', c);
  c = await call({ action: 'portal' });
  ok(c.status === 503 && c.json?.code === 'BILLING_NOT_CONFIGURED', 'portal without server key -> 503', c);
  await admin.from('profiles').update({ subscription_tier: 'premium', subscription_status: 'active' }).eq('id', U.id);
  c = await call({ tier: 'ai', period: 'MONTHLY' });
  ok(c.status === 409 && c.json?.code === 'ALREADY_SUBSCRIBED', 'active subscriber is sent to the portal instead of a second checkout', c);

  console.log('\n== delete-account');
  const V = await makeUser('delete');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await V.db.storage.from('logos').upload(`${V.id}/logo.png`, png, { contentType: 'image/png' });
  await V.db.from('clients').insert({ name: 'To be deleted' });
  let d = await fetch(`${FN}/delete-account`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok(d.status === 401, 'delete-account without JWT -> 401', d.status);
  d = await fetch(`${FN}/delete-account`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${V.token}`, apikey: env.ANON_KEY }, body: '{}' });
  const dj = await d.json().catch(() => null);
  ok(d.status === 200 && dj?.ok === true, 'delete-account (free user) -> ok', { status: d.status, dj });
  const gone = await admin.auth.admin.getUserById(V.id);
  ok(!!gone.error || !gone.data?.user, 'auth user deleted');
  const files = await admin.storage.from('logos').list(V.id);
  ok(!files.error && files.data.length === 0, 'user files removed from storage');
  const rows = await admin.from('clients').select('id').eq('user_id', V.id);
  ok(!rows.error && rows.data.length === 0, 'user rows cascaded');
  d = await fetch(`${FN}/delete-account`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${U.token}`, apikey: env.ANON_KEY }, body: '{}' });
  const dj2 = await d.json().catch(() => null);
  ok(d.status === 502 && dj2?.code === 'SUBSCRIPTION_CANCEL_FAILED' && !(await admin.auth.admin.getUserById(U.id)).error,
     'paying user is NOT deleted when the subscription cannot be cancelled', { status: d.status, dj2 });
}

try {
  await main();
} catch (e) {
  failed++;
  console.error('\nUNEXPECTED ERROR:', e);
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
