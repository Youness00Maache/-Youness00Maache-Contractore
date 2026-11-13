import { invokeFunction } from './supabase.ts';
import type { BillingPeriod, PlanTier } from './plans.ts';
import { PLANS } from './plans.ts';

/**
 * Kelviq billing (Merchant of Record).
 * - startCheckout(): asks the `kelviq-checkout` edge function for a checkout URL (server API key stays on the server).
 *   Only if the function cannot be reached / is not deployed / billing is not configured does it fall back to the
 *   static product link (VITE_KELVIQ_PRODUCT_ID). Business errors (e.g. "already subscribed") are thrown as-is.
 * - getBillingPortal(): signed Kelviq customer-portal link (manage plan, invoices, payment method, cancel).
 * - Access is granted ONLY by the `kelviq-webhook` edge function after a signature-verified webhook.
 */
const env = import.meta.env;
const KELVIQ_ENV = (env.VITE_KELVIQ_ENV || 'live') as 'live' | 'sandbox';
const PRODUCT_ID = env.VITE_KELVIQ_PRODUCT_ID || '';
export const KELVIQ_PORTAL_URL = env.VITE_KELVIQ_PORTAL_URL || '';

const siteUrl = () => (env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://www.contractordocs.app')).replace(/\/$/, '');

export const billingSuccessUrl = () => `${siteUrl()}/billing/success`;

/** Static checkout link (no server key needed). */
export function buildStaticCheckoutUrl(tier: Exclude<PlanTier, 'free'>, period: BillingPeriod, userId: string): string | null {
  const plan = PLANS[tier];
  if (!PRODUCT_ID || !plan.kelviqPlanIdentifier) return null;
  const base = KELVIQ_ENV === 'sandbox'
    ? `https://www.kelviq.com/sandbox/buy/${PRODUCT_ID}/`
    : `https://www.kelviq.com/buy/${PRODUCT_ID}/`;
  const url = new URL(base);
  url.searchParams.set('enabled', [PLANS.premium.kelviqPlanIdentifier, PLANS.ai.kelviqPlanIdentifier].filter(Boolean).join(','));
  url.searchParams.set('plan_identifier', plan.kelviqPlanIdentifier);
  url.searchParams.set('charge_period', period);
  url.searchParams.set('customer_id', userId);
  url.searchParams.set('success_url', billingSuccessUrl());
  return url.toString();
}

export interface CheckoutResult { url: string; sessionId?: string }

/** True when the error means "the checkout function is unavailable", not a business rule. */
const isFunctionUnavailable = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /failed to send a request|failed to fetch|networkerror|function not found|requested function was not found|not configured|boot_error|worker/i.test(message);
};

export async function startCheckout(tier: Exclude<PlanTier, 'free'>, period: BillingPeriod, userId: string): Promise<CheckoutResult> {
  try {
    const result = await invokeFunction<CheckoutResult>('kelviq-checkout', { tier, period, successUrl: billingSuccessUrl() });
    if (result?.url) return result;
    throw new Error('Checkout did not return a URL');
  } catch (err) {
    if (isFunctionUnavailable(err)) {
      const fallback = buildStaticCheckoutUrl(tier, period, userId);
      if (fallback) return { url: fallback };
    }
    throw err instanceof Error ? err : new Error('Could not start checkout');
  }
}

export interface BillingPortalResult {
  /** Signed portal link (open with window.location.assign / window.open). null when unavailable. */
  url: string | null;
  /** User-facing reason when url is null, e.g. "You don't have a billing account yet. Choose a plan to subscribe first." */
  error?: string;
}

/** Signed Kelviq customer-portal link for the signed-in user, with a readable error when there is none. */
export async function getBillingPortal(): Promise<BillingPortalResult> {
  try {
    const res = await invokeFunction<{ url?: string }>('kelviq-checkout', { action: 'portal' });
    if (res?.url) return { url: res.url };
    return { url: KELVIQ_PORTAL_URL || null, error: KELVIQ_PORTAL_URL ? undefined : 'The billing portal is unavailable right now.' };
  } catch (err) {
    if (isFunctionUnavailable(err) && KELVIQ_PORTAL_URL) return { url: KELVIQ_PORTAL_URL };
    return { url: null, error: err instanceof Error ? err.message : 'The billing portal is unavailable right now.' };
  }
}

/** Opens the Kelviq customer portal (manage plan, invoices, payment method, cancel). Returns null when unavailable. */
export async function getBillingPortalUrl(): Promise<string | null> {
  return (await getBillingPortal()).url;
}
