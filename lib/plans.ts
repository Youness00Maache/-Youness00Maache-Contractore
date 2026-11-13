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

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: 'free',
    name: 'Free',
    tagline: 'For trying ContractorDocs on a few jobs',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      `${FREE_LIMITS.jobs} new jobs per month`,
      `${FREE_LIMITS.clients} new clients per month`,
      `${FREE_LIMITS.docs} documents per job each month`,
      'All 12 document types & PDF export',
      `${FREE_LIMITS.ai} AI assistant requests per month`,
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
      'Unlimited jobs, clients & documents',
      'All premium document templates',
      'Unlimited Gmail sending with PDF attachments',
      'Client portal, e-signatures & approvals',
      'Inventory, price book & profit tracking',
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
      `${PAID_AI_LIMITS.ai} AI assistant requests per month`,
      'AI-drafted invoices, estimates & daily reports',
      'AI batch emails to clients',
      'Voice-to-document dictation',
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
