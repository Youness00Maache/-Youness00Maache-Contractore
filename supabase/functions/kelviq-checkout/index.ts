// kelviq-checkout: authenticated. Creates a Kelviq checkout session or a customer-portal link.
//
//  POST { tier: 'premium' | 'ai', period: 'MONTHLY' | 'YEARLY', successUrl }  -> { url, sessionId }
//  POST { action: 'portal' }                                                  -> { url }
//  POST { action: 'credits_status' | 'credits_checkout' | 'credits_settings' } -> AI credit top-ups (credits.ts;
//       off until AI_CREDITS_ENABLED=true and docs/work/DRAFT_ai_credits.sql is applied)
//
// Errors: { error, code } with 401 UNAUTHORIZED, 400 BAD_REQUEST, 409 ALREADY_SUBSCRIBED,
//         404 NO_BILLING_ACCOUNT (portal before any purchase), 503 BILLING_NOT_CONFIGURED,
//         502 BILLING_PROVIDER_ERROR.
// The Kelviq customerId is always the Supabase user id (never taken from the request body), so the
// webhook can map events back to the user. Access is granted only by kelviq-webhook.
import { getUser, serviceClient } from '../_shared/auth.ts';
import { allowedOrigins, json, preflight } from '../_shared/cors.ts';
import { KelviqError, kelviqRequest, TIER_TO_PLAN, type ChargePeriod, type PaidTier } from '../_shared/kelviq.ts';
import { handleCreditsAction, isCreditsAction } from './credits.ts';

const SITE_URL = () => (Deno.env.get('SITE_URL') || 'https://www.contractordocs.app').split(',')[0].trim().replace(/\/$/, '');

function safeReturnUrl(candidate: unknown, fallbackPath: string): string {
  const fallback = `${SITE_URL()}${fallbackPath}`;
  if (typeof candidate !== 'string' || candidate.length > 500) return fallback;
  try {
    const u = new URL(candidate);
    if (!allowedOrigins().includes(u.origin)) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

function displayName(user: { email?: string; user_metadata?: Record<string, unknown> }, profileName?: string | null) {
  const meta = user.user_metadata || {};
  return String(profileName || meta.full_name || meta.name || (user.email || '').split('@')[0] || '').slice(0, 120) || undefined;
}

/** Creates the Kelviq customer (customerId = user id) or updates its email/name. Returns false if it does not exist and create=false. */
async function upsertCustomer(userId: string, email: string | undefined, name: string | undefined, create: boolean): Promise<boolean> {
  const patch: Record<string, string> = {};
  if (email) patch.email = email;
  if (name) patch.name = name;
  try {
    await kelviqRequest('PATCH', `/customers/${encodeURIComponent(userId)}/`, patch);
    return true;
  } catch (e) {
    if (!(e instanceof KelviqError) || ![400, 404].includes(e.status)) throw e;
  }
  if (!create) return false;
  await kelviqRequest('POST', '/customers/', { customerId: userId, ...patch, metadata: { user_id: userId } });
  return true;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed', code: 'BAD_REQUEST' }, 405);

  const user = await getUser(req);
  if (!user) return json(req, { error: 'Please sign in again.', code: 'UNAUTHORIZED' }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* empty body */ }

  const admin = serviceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('name, email, subscription_tier, subscription_status, subscription_period_end, kelviq_customer_id')
    .eq('id', user.id)
    .maybeSingle();
  const email = (user.email || profile?.email || undefined) as string | undefined;
  const name = displayName(user, profile?.name);

  try {
    // ------------------------------------------------------------ AI credit top-ups (separate from subscriptions)
    if (isCreditsAction(body.action)) {
      const result = await handleCreditsAction(body.action, body, {
        userId: user.id,
        email,
        env: (n) => Deno.env.get(n),
        rpc: async (fn, args) => {
          const { data, error } = await admin.rpc(fn, args);
          return { data, error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null };
        },
        kelviq: (method, path, payload) => kelviqRequest(method, path, payload),
        ensureCustomer: async () => {
          try {
            await upsertCustomer(user.id, email, name, true);
          } catch (e) {
            console.warn('[kelviq-checkout] could not upsert customer (continuing):', e instanceof KelviqError ? e.status : e);
          }
        },
        returnUrl: safeReturnUrl,
      });
      return json(req, result.body, result.status);
    }

    // ------------------------------------------------------------ customer portal
    if (body.action === 'portal') {
      const exists = await upsertCustomer(user.id, email, name, false);
      if (!exists) {
        return json(req, {
          error: "You don't have a billing account yet. Choose a plan to subscribe first.",
          code: 'NO_BILLING_ACCOUNT',
        }, 404);
      }
      const session = await kelviqRequest<{ token?: string; customerPortalUrl?: string }>(
        'POST', '/portal/session/', { customerId: user.id });
      if (!session?.customerPortalUrl || !session?.token) {
        return json(req, { error: 'The billing portal is unavailable right now. Please try again.', code: 'BILLING_PROVIDER_ERROR' }, 502);
      }
      const url = `${session.customerPortalUrl}${session.customerPortalUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(session.token)}`;
      return json(req, { url });
    }

    // ------------------------------------------------------------ checkout
    const tier = String(body.tier || '') as PaidTier;
    const period = String(body.period || 'MONTHLY').toUpperCase() as ChargePeriod;
    if (!(tier in TIER_TO_PLAN)) return json(req, { error: 'Unknown plan.', code: 'BAD_REQUEST' }, 400);
    if (period !== 'MONTHLY' && period !== 'YEARLY') return json(req, { error: 'Unknown billing period.', code: 'BAD_REQUEST' }, 400);

    const activePaid = profile
      && ['premium', 'ai'].includes(profile.subscription_tier)
      && ['active', 'past_due'].includes(profile.subscription_status);
    if (activePaid) {
      return json(req, {
        error: 'You already have an active subscription. Use "Manage billing" to change or cancel your plan.',
        code: 'ALREADY_SUBSCRIBED',
      }, 409);
    }

    // Make sure the Kelviq customer exists with an email (needed later for the customer portal).
    try {
      await upsertCustomer(user.id, email, name, true);
    } catch (e) {
      console.warn('[kelviq-checkout] could not upsert customer (continuing):', e instanceof KelviqError ? e.status : e);
    }

    const session = await kelviqRequest<{ checkoutUrl?: string; checkoutSessionId?: string }>('POST', '/checkout/', {
      planIdentifier: TIER_TO_PLAN[tier],
      chargePeriod: period,
      customerId: user.id,
      successUrl: safeReturnUrl(body.successUrl, '/billing/success'),
      cancelUrl: safeReturnUrl(body.cancelUrl, '/settings'),
      ...(email ? { email } : {}),
      metadata: { user_id: user.id, tier },
    });
    if (!session?.checkoutUrl) {
      return json(req, { error: 'Checkout is unavailable right now. Please try again.', code: 'BILLING_PROVIDER_ERROR' }, 502);
    }
    return json(req, { url: session.checkoutUrl, sessionId: session.checkoutSessionId ?? null });
  } catch (e) {
    if (e instanceof KelviqError && e.status === 503) {
      return json(req, { error: 'Billing is not configured', code: 'BILLING_NOT_CONFIGURED' }, 503);
    }
    console.error('[kelviq-checkout] provider error', e instanceof KelviqError ? `${e.status} ${JSON.stringify(e.body)}` : e);
    return json(req, { error: 'The billing provider could not be reached. Please try again in a minute.', code: 'BILLING_PROVIDER_ERROR' }, 502);
  }
});
