/**
 * "Subscribe without an account": the paid plan a visitor picked on the marketing site (pricing cards link to
 * `/signup?plan=premium|ai&period=monthly|yearly`) is kept as an INTENT until they are signed in, then App.tsx
 * starts checkout for it once (fresh intent) or shows a small "Finish upgrading" banner (older intent).
 *
 * Stored in localStorage under `cd_pending_plan` (cleared on logout: lib/account.ts USER_LOCAL_STORAGE_KEYS) and
 * mirrored in the email-confirmation / OAuth redirect URLs (?plan=&period=) so it survives a different browser.
 * Pure + SSR-safe: every storage access is guarded, and tests pass their own storage.
 */
import { PLANS, type BillingPeriod, type PlanTier } from './plans.ts';

export const PENDING_PLAN_KEY = 'cd_pending_plan';
/** One-shot "log in with this email" hand-off from Signup (sessionStorage; never put in the URL). */
export const LOGIN_PREFILL_KEY = 'cd_login_prefill';

export type IntentPlan = Exclude<PlanTier, 'free'>;
export type IntentPeriod = 'monthly' | 'yearly';

export interface PlanIntent {
  plan: IntentPlan;
  period: IntentPeriod;
  /** ms epoch when the plan was picked (or re-picked). */
  createdAt: number;
  /** ms epoch when we sent them to checkout (they may have closed it without paying). */
  checkoutStartedAt?: number;
  /** ms epoch when the "Finish upgrading" banner was last shown (max once a day). */
  bannerShownAt?: number;
}

export const FRESH_MS = 60 * 60 * 1000; // auto-checkout only within 1 hour of picking the plan
export const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000; // forget the plan after 7 days
export const BANNER_INTERVAL_MS = 24 * 60 * 60 * 1000; // banner at most once a day

interface StoreLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const defaultStore = (): StoreLike | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

const isIntentPlan = (v: unknown): v is IntentPlan =>
  typeof v === 'string' && v !== 'free' && Object.prototype.hasOwnProperty.call(PLANS, v);

const normalizePlanParam = (raw: string | null | undefined): IntentPlan | 'free' | null => {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'free' || t === 'basic') return 'free';
  const mapped = t === 'premium-ai' || t === 'premium_ai' ? 'ai' : t === 'pro' ? 'premium' : t;
  return isIntentPlan(mapped) ? mapped : null;
};

const normalizePeriod = (raw: unknown): IntentPeriod => {
  const t = String(raw || '').trim().toLowerCase();
  return t === 'yearly' || t === 'annual' || t === 'year' ? 'yearly' : 'monthly';
};

/** `?plan=&period=` → the picked plan, 'free' (explicitly no plan), or null (no / unknown plan). */
export function parsePlanParams(search: string): { plan: IntentPlan; period: IntentPeriod } | 'free' | null {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search || ''); } catch { return null; }
  const plan = normalizePlanParam(params.get('plan'));
  if (!plan) return null;
  if (plan === 'free') return 'free';
  return { plan, period: normalizePeriod(params.get('period')) };
}

/** Validates a stored value (also the older `{ plan, period, savedAt }` format). Expired/invalid → null. */
export function parseIntent(raw: string | null, now = Date.now()): PlanIntent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || !isIntentPlan(v.plan)) return null;
    const createdAt = typeof v.createdAt === 'number' ? v.createdAt : Date.parse(v.savedAt || '');
    if (!Number.isFinite(createdAt) || createdAt > now + 60_000 || now - createdAt > EXPIRE_MS) return null;
    const out: PlanIntent = { plan: v.plan, period: normalizePeriod(v.period), createdAt };
    if (typeof v.checkoutStartedAt === 'number') out.checkoutStartedAt = v.checkoutStartedAt;
    if (typeof v.bannerShownAt === 'number') out.bannerShownAt = v.bannerShownAt;
    return out;
  } catch {
    return null;
  }
}

export function readIntent(now = Date.now(), store: StoreLike | null = defaultStore()): PlanIntent | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_PLAN_KEY);
    const intent = parseIntent(raw, now);
    if (raw && !intent) store.removeItem(PENDING_PLAN_KEY); // expired or junk
    return intent;
  } catch {
    return null;
  }
}

export function saveIntent(intent: PlanIntent, store: StoreLike | null = defaultStore()): void {
  try { store?.setItem(PENDING_PLAN_KEY, JSON.stringify(intent)); } catch { /* storage unavailable */ }
}

export function clearIntent(store: StoreLike | null = defaultStore()): void {
  try { store?.removeItem(PENDING_PLAN_KEY); } catch { /* storage unavailable */ }
}

export function updateIntent(patch: Partial<PlanIntent>, now = Date.now(), store: StoreLike | null = defaultStore()): PlanIntent | null {
  const current = readIntent(now, store);
  if (!current) return null;
  const next = { ...current, ...patch };
  saveIntent(next, store);
  return next;
}

/**
 * Reads `?plan=&period=`: a valid paid plan is saved as a FRESH intent (picking a plan again restarts the flow),
 * `plan=free` forgets any intent, anything else keeps (and returns) the stored one.
 */
export function captureIntentFromSearch(search: string, now = Date.now(), store: StoreLike | null = defaultStore()): PlanIntent | null {
  const picked = parsePlanParams(search);
  if (picked === 'free') {
    clearIntent(store);
    return null;
  }
  if (picked) {
    const intent: PlanIntent = { plan: picked.plan, period: picked.period, createdAt: now };
    saveIntent(intent, store);
    return intent;
  }
  return readIntent(now, store);
}

/** `?plan=ai&period=yearly` for the current intent (or '' when there is none). */
export function intentSearch(intent: Pick<PlanIntent, 'plan' | 'period'> | null | undefined): string {
  return intent ? `?plan=${encodeURIComponent(intent.plan)}&period=${encodeURIComponent(intent.period)}` : '';
}

export const intentLabel = (intent: Pick<PlanIntent, 'plan' | 'period'>): string =>
  `${PLANS[intent.plan].name} (${intent.period})`;

export const toBillingPeriod = (period: IntentPeriod): BillingPeriod => (period === 'yearly' ? 'YEARLY' : 'MONTHLY');

/**
 * Supabase signUp outcome. With email confirmation on, an existing email returns NO error but a user with
 * `identities: []` (and no session); older setups return "User already registered".
 */
export type SignupOutcome = 'signedIn' | 'checkEmail' | 'alreadyRegistered';
export function signupOutcome(
  data: { session?: unknown; user?: { identities?: unknown[] | null } | null } | null | undefined,
  error?: { message?: string } | null,
): SignupOutcome {
  if (error) {
    if (/already\s+(been\s+)?registered|already exists/i.test(error.message || '')) return 'alreadyRegistered';
    throw error;
  }
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return 'alreadyRegistered';
  return data?.session ? 'signedIn' : 'checkEmail';
}

const TIER_RANK: Record<PlanTier, number> = { free: 0, premium: 1, ai: 2 };
export const tierCovers = (current: PlanTier, wanted: PlanTier): boolean => TIER_RANK[current] >= TIER_RANK[wanted];

export type IntentAction =
  | { type: 'none' }
  /** Paid during an earlier visit (webhook upgraded the account): forget the intent quietly. */
  | { type: 'clear' }
  /** Already on that plan or higher without going through checkout: say so, no checkout. */
  | { type: 'alreadyOnPlan'; current: PlanTier }
  | { type: 'checkout'; intent: PlanIntent }
  | { type: 'banner'; intent: PlanIntent };

/** What to do once the session AND the user's current plan are known. */
export function decideIntentAction(intent: PlanIntent | null, currentTier: PlanTier, now = Date.now()): IntentAction {
  if (!intent) return { type: 'none' };
  if (tierCovers(currentTier, intent.plan)) {
    return intent.checkoutStartedAt ? { type: 'clear' } : { type: 'alreadyOnPlan', current: currentTier };
  }
  const fresh = now - intent.createdAt < FRESH_MS;
  if (fresh && !intent.checkoutStartedAt) return { type: 'checkout', intent };
  if (!intent.bannerShownAt || now - intent.bannerShownAt >= BANNER_INTERVAL_MS) return { type: 'banner', intent };
  return { type: 'none' };
}

/** One-shot email hand-off to the Login screen (sessionStorage, read once). */
export function setLoginPrefill(email: string): void {
  try { sessionStorage.setItem(LOGIN_PREFILL_KEY, JSON.stringify({ email, existing: true })); } catch { /* ignore */ }
}
export function takeLoginPrefill(): { email: string; existing: boolean } | null {
  try {
    const raw = sessionStorage.getItem(LOGIN_PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(LOGIN_PREFILL_KEY);
    const v = JSON.parse(raw);
    return typeof v?.email === 'string' ? { email: v.email, existing: Boolean(v.existing) } : null;
  } catch {
    return null;
  }
}
