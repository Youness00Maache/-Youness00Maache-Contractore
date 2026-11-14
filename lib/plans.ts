/**
 * Plans, prices and limits. Single source of truth for the UI.
 * The database enforces the same free limits server-side (see supabase/migrations), so editing
 * a number here also requires the matching change in the `plan_limits()` SQL function.
 */
export type PlanTier = 'free' | 'premium' | 'ai';
export type BillingPeriod = 'MONTHLY' | 'YEARLY';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  tagline: string;
  /** Kelviq plan identifier (Product catalog → plan identifier). */
  kelviqPlanIdentifier?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  highlighted?: boolean;
}

export const FREE_LIMITS = {
  /** new jobs per calendar month */
  jobs: 6,
  /** new clients per calendar month */
  clients: 15,
  /** new documents per job per calendar month */
  docs: 12,
  /** emails sent per calendar month */
  emails: 10,
  /** AI requests per calendar month */
  ai: 15,
} as const;

export const PAID_AI_LIMITS = {
  premium: 60,
  ai: 600,
} as const;

/**
 * Feature lists describe what each plan really gets (owner decision 2026-11-13: the pricing matches the app, no new
 * locks). Everything except price book photos works on Free; paid plans remove the monthly limits, add photos on price book items (the only
 * feature the original app reserved for Premium) and raise the AI allowance.
 * Owner decision 2026-11-14: Premium PDF designs and their customization are paid-plan features (lib/designAccess.ts);
 * Free keeps the Basic designs (the original app's Standard designs + Classic).
 */
export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: 'free',
    name: 'Free',
    tagline: 'All the core features, with monthly limits',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      `${FREE_LIMITS.jobs} new jobs and ${FREE_LIMITS.clients} new clients per month`,
      `${FREE_LIMITS.docs} new documents per job each month`,
      'All 12 document types & the Basic PDF designs',
      'Client portal, approvals & e-signatures',
      'Inventory, price book & job profit tracking',
      `${FREE_LIMITS.emails} Gmail emails & ${FREE_LIMITS.ai} AI assistant requests per month`,
    ],
  },
  premium: {
    tier: 'premium',
    name: 'Premium',
    tagline: 'Unlimited paperwork for growing contractors',
    kelviqPlanIdentifier: 'premium',
    monthlyPrice: 5,
    yearlyPrice: 50,
    highlighted: true,
    features: [
      'Everything in Free, without the monthly limits',
      'Unlimited jobs, clients & documents',
      'Unlimited Gmail sending with PDF attachments',
      'All Premium PDF designs, with fonts, layout and sections you can customize',
      'Photos on price book items',
      `${PAID_AI_LIMITS.premium} AI assistant requests per month`,
    ],
  },
  ai: {
    tier: 'ai',
    name: 'Premium + AI',
    tagline: 'Let the AI assistant write your paperwork',
    kelviqPlanIdentifier: 'premium-ai',
    monthlyPrice: 10,
    yearlyPrice: 100,
    features: [
      'Everything in Premium',
      `${PAID_AI_LIMITS.ai} AI assistant requests per month (${Math.round(PAID_AI_LIMITS.ai / PAID_AI_LIMITS.premium)}× Premium)`,
      'Enough AI to draft most of your invoices, estimates, daily reports and batch emails',
      'Priority support',
    ],
  },
};

export const isPaidTier = (tier?: string | null): boolean => tier === 'premium' || tier === 'ai';

export const normalizeTier = (tier?: string | null): PlanTier => {
  const t = String(tier || '').toLowerCase();
  if (t === 'ai' || t === 'premium-ai' || t === 'premium_ai') return 'ai';
  if (t === 'premium' || t === 'pro') return 'premium';
  return 'free';
};
