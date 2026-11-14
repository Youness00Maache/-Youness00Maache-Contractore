/**
 * Decides which top-level tree renders a URL: the lightweight marketing site or the (lazy) app.
 * Pure + browser-safe; the inline boot script in index.html mirrors `isMarketingPath` and
 * `rootBelongsToApp` (keep both in sync).
 */
import { BLOG_POSTS } from '../content/blog/registry.ts';
import { LANDING_PAGES } from '../content/landing/registry.ts';
import { PENDING_PLAN_KEY, captureIntentFromSearch } from '../lib/pendingPlan.ts';

export const AUTH_STORAGE_KEY = 'contractordocs-auth'; // lib/supabase.ts storageKey
export const LANDING_FLAG_KEY = 'cd_landing_token';
export { PENDING_PLAN_KEY }; // 'cd_pending_plan' (lib/pendingPlan.ts owns the intent)

/** Static marketing routes (also prerendered). */
export const STATIC_MARKETING_ROUTES = [
  '/',
  '/features',
  '/pricing',
  '/templates',
  '/invoice-generator',
  '/estimate-generator',
  '/blog',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/security',
  '/help',
] as const;

const MARKETING_RE = /^\/(features|pricing|templates|blog|invoice-generator|estimate-generator|about|contact|privacy|terms|security|help|for|compare|ai-estimate-generator|ai-invoice-generator)(\/|$)/;

export const normalizePath = (pathname: string): string => {
  let p = pathname || '/';
  try { p = decodeURIComponent(p); } catch { /* keep raw */ }
  return p.replace(/\/+$/, '') || '/';
};

export const isMarketingPath = (pathname: string): boolean => {
  const p = normalizePath(pathname);
  return p === '/' || MARKETING_RE.test(p);
};

/** Every URL that is prerendered to static HTML (marketing pages, landing pages and blog posts). */
export const getPrerenderRoutes = (): string[] => [
  ...STATIC_MARKETING_ROUTES,
  ...LANDING_PAGES.map((p) => p.path),
  ...BLOG_POSTS.map((p) => `/blog/${p.slug}`),
];

interface LocLike { pathname: string; search: string; hash: string }

/** OAuth callback or client link that the app must process at "/". */
export const isAppCallback = (loc: LocLike): boolean =>
  /[?&](portal|approval_token|code)=/.test(loc.search) || /(access_token|error_description)=/.test(loc.hash);

const safeGet = (storage: 'localStorage' | 'sessionStorage', key: string): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    return window[storage].getItem(key);
  } catch {
    return null;
  }
};

/** True when a stored session exists that the app has not already rejected. */
export const hasStoredSession = (): boolean => {
  const token = safeGet('localStorage', AUTH_STORAGE_KEY);
  if (!token) return false;
  return token !== safeGet('sessionStorage', LANDING_FLAG_KEY);
};

/** "/" belongs to the app for OAuth callbacks, client links and signed-in users. */
export const rootBelongsToApp = (loc: LocLike): boolean => isAppCallback(loc) || hasStoredSession();

/**
 * Called when the app sends a user to the landing page (`/welcome`): remembers the current stored
 * session value so a stale/expired session can't bounce "/" back to the dashboard in a loop.
 */
export const markLandingForced = (): void => {
  try {
    sessionStorage.setItem(LANDING_FLAG_KEY, localStorage.getItem(AUTH_STORAGE_KEY) || '');
  } catch { /* storage unavailable */ }
};

/** Remembers the plan picked on the pricing page (?plan=premium|ai&period=monthly|yearly) for after signup (lib/pendingPlan.ts). */
export const rememberPendingPlan = (search: string): { plan: 'premium' | 'ai'; period: 'monthly' | 'yearly' } | null => {
  const intent = captureIntentFromSearch(search);
  return intent ? { plan: intent.plan, period: intent.period } : null;
};
