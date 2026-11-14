/**
 * Pure-logic checks for "subscribe without an account" (lib/pendingPlan.ts):
 * plan intent save/expire/validate, already-registered detection, and which action App.tsx takes per case.
 *   npx tsx scripts/subscribe-flow-check.ts
 */
import { readFileSync } from 'node:fs';
import {
  BANNER_INTERVAL_MS, EXPIRE_MS, FRESH_MS, PENDING_PLAN_KEY,
  captureIntentFromSearch, clearIntent, decideIntentAction, intentLabel, intentSearch, parseIntent, parsePlanParams,
  readIntent, saveIntent, signupOutcome, tierCovers, toBillingPeriod, updateIntent, type PlanIntent,
} from '../lib/pendingPlan.ts';
import { signupHref } from '../pages/components/PlanCards.tsx';
import { PENDING_PLAN_KEY as ROUTES_KEY } from '../pages/routes.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else {
    failures++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);
const throws = (label: string, fn: () => unknown) => {
  try { fn(); ok(label, false); } catch { ok(label, true); }
};

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, map: m };
};

const T0 = Date.parse('2026-11-14T10:00:00Z');
const H = 60 * 60 * 1000;
const D = 24 * H;

// ---------------------------------------------------------------- URL params / validation
eq('params premium monthly', parsePlanParams('?plan=premium&period=monthly'), { plan: 'premium', period: 'monthly' });
eq('params ai yearly', parsePlanParams('?plan=ai&period=yearly'), { plan: 'ai', period: 'yearly' });
eq('params legacy premium-ai', parsePlanParams('?plan=premium-ai'), { plan: 'ai', period: 'monthly' });
eq('params case-insensitive', parsePlanParams('?plan=PREMIUM&period=YEARLY'), { plan: 'premium', period: 'yearly' });
eq('params unknown period → monthly', parsePlanParams('?plan=ai&period=weekly'), { plan: 'ai', period: 'monthly' });
eq('params free', parsePlanParams('?plan=free&period=yearly'), 'free');
eq('params unknown plan', parsePlanParams('?plan=enterprise'), null);
eq('params injected plan', parsePlanParams('?plan=__proto__'), null);
eq('params none', parsePlanParams(''), null);
eq('pricing card link → intent (ai yearly)', parsePlanParams(new URL(signupHref('ai', 'yearly'), 'https://x.test').search), { plan: 'ai', period: 'yearly' });
eq('pricing card link → intent (premium monthly)', parsePlanParams(new URL(signupHref('premium', 'monthly'), 'https://x.test').search), { plan: 'premium', period: 'monthly' });
eq('free card link carries no plan', parsePlanParams(new URL(signupHref('free', 'yearly'), 'https://x.test').search), null);
eq('routes.ts re-exports the same key', ROUTES_KEY, PENDING_PLAN_KEY);
eq('intentSearch', intentSearch({ plan: 'ai', period: 'yearly' }), '?plan=ai&period=yearly');
eq('intentSearch none', intentSearch(null), '');
eq('intentSearch round-trips', parsePlanParams(intentSearch({ plan: 'premium', period: 'yearly' })), { plan: 'premium', period: 'yearly' });
eq('toBillingPeriod yearly', toBillingPeriod('yearly'), 'YEARLY');
eq('toBillingPeriod monthly', toBillingPeriod('monthly'), 'MONTHLY');
eq('intentLabel', intentLabel({ plan: 'premium', period: 'yearly' }), 'Premium (yearly)');

// ---------------------------------------------------------------- save / read / expire
{
  const s = memStore();
  const saved = captureIntentFromSearch('?plan=premium&period=yearly', T0, s);
  eq('capture saves fresh intent', saved, { plan: 'premium', period: 'yearly', createdAt: T0 });
  eq('read back', readIntent(T0 + H, s), { plan: 'premium', period: 'yearly', createdAt: T0 });
  eq('no params keeps stored', captureIntentFromSearch('', T0 + 2 * H, s)?.createdAt, T0);
  eq('unknown plan keeps stored', captureIntentFromSearch('?plan=gold', T0 + 2 * H, s)?.plan, 'premium');
  eq('re-pick restarts (fresh createdAt)', captureIntentFromSearch('?plan=ai&period=monthly', T0 + 3 * H, s), { plan: 'ai', period: 'monthly', createdAt: T0 + 3 * H });
  eq('plan=free forgets the intent', captureIntentFromSearch('?plan=free', T0 + 3 * H, s), null);
  eq('…and storage is empty', s.map.has(PENDING_PLAN_KEY), false);

  captureIntentFromSearch('?plan=ai&period=yearly', T0, s);
  eq('valid at 6.9 days', readIntent(T0 + EXPIRE_MS - H, s)?.plan, 'ai');
  eq('expired after 7 days', readIntent(T0 + EXPIRE_MS + 1, s), null);
  eq('expired intent removed from storage', s.map.has(PENDING_PLAN_KEY), false);

  captureIntentFromSearch('?plan=ai&period=yearly', T0, s);
  eq('updateIntent merges', updateIntent({ checkoutStartedAt: T0 + 5 }, T0 + 10, s)?.checkoutStartedAt, T0 + 5);
  eq('updateIntent persisted', readIntent(T0 + 10, s)?.checkoutStartedAt, T0 + 5);
  clearIntent(s);
  eq('clearIntent', readIntent(T0, s), null);
  eq('updateIntent with nothing stored', updateIntent({ bannerShownAt: T0 }, T0, s), null);

  s.setItem(PENDING_PLAN_KEY, '{not json');
  eq('junk → null', readIntent(T0, s), null);
  eq('junk removed', s.map.has(PENDING_PLAN_KEY), false);
}
eq('legacy {savedAt} format accepted', parseIntent(JSON.stringify({ plan: 'premium', period: 'yearly', savedAt: new Date(T0).toISOString() }), T0 + H), { plan: 'premium', period: 'yearly', createdAt: T0 });
eq('stored free plan rejected', parseIntent(JSON.stringify({ plan: 'free', period: 'monthly', createdAt: T0 }), T0), null);
eq('stored unknown plan rejected', parseIntent(JSON.stringify({ plan: 'gold', period: 'monthly', createdAt: T0 }), T0), null);
eq('future createdAt rejected', parseIntent(JSON.stringify({ plan: 'ai', period: 'monthly', createdAt: T0 + D }), T0), null);
eq('missing date rejected', parseIntent(JSON.stringify({ plan: 'ai', period: 'monthly' }), T0), null);
eq('no storage (SSR) is a no-op', readIntent(T0, null), null);
saveIntent({ plan: 'ai', period: 'monthly', createdAt: T0 }, null); // must not throw
ok('saveIntent without storage does not throw', true);

// ---------------------------------------------------------------- already-registered detection
eq('signUp: identities [] → already registered', signupOutcome({ user: { identities: [] }, session: null }, null), 'alreadyRegistered');
eq('signUp: explicit error → already registered', signupOutcome(null, { message: 'User already registered' }), 'alreadyRegistered');
eq('signUp: "already been registered" → already registered', signupOutcome(null, { message: 'A user with this email address has already been registered' }), 'alreadyRegistered');
eq('signUp: new user, confirmation on', signupOutcome({ user: { identities: [{ id: 'x' }] }, session: null }, null), 'checkEmail');
eq('signUp: new user, confirmation off', signupOutcome({ user: { identities: [{ id: 'x' }] }, session: { access_token: 't' } }, null), 'signedIn');
eq('signUp: identities missing → not flagged', signupOutcome({ user: {}, session: null }, null), 'checkEmail');
throws('signUp: other errors are re-thrown', () => signupOutcome(null, { message: 'Email rate limit exceeded' }));

// ---------------------------------------------------------------- tiers
ok('premium covers premium', tierCovers('premium', 'premium'));
ok('ai covers premium', tierCovers('ai', 'premium'));
ok('premium does not cover ai', !tierCovers('premium', 'ai'));
ok('free covers nothing paid', !tierCovers('free', 'premium'));

// ---------------------------------------------------------------- decisions per case
const intent = (o: Partial<PlanIntent> = {}): PlanIntent => ({ plan: 'premium', period: 'yearly', createdAt: T0, ...o });
eq('no intent → nothing', decideIntentAction(null, 'free', T0).type, 'none');
eq('new visitor: signed up + confirmed within the hour → checkout', decideIntentAction(intent(), 'free', T0 + 5 * 60_000).type, 'checkout');
eq('checkout carries the same plan + period', decideIntentAction(intent({ plan: 'ai', period: 'monthly' }), 'free', T0), { type: 'checkout', intent: intent({ plan: 'ai', period: 'monthly' }) });
eq('existing user logs in from signup page → checkout', decideIntentAction(intent(), 'free', T0 + 30 * 60_000).type, 'checkout');
eq('already signed in, clicks Premium on the site → checkout', decideIntentAction(intent(), 'free', T0 + 1000).type, 'checkout');
eq('Premium user clicks AI → checkout (upgrade)', decideIntentAction(intent({ plan: 'ai' }), 'premium', T0).type, 'checkout');
eq('already on that plan → message, no checkout', decideIntentAction(intent(), 'premium', T0), { type: 'alreadyOnPlan', current: 'premium' });
eq('on a higher plan → message, no checkout', decideIntentAction(intent(), 'ai', T0), { type: 'alreadyOnPlan', current: 'ai' });
eq('just under 1 hour → still checkout', decideIntentAction(intent(), 'free', T0 + FRESH_MS - 1).type, 'checkout');
eq('old intent (> 1 hour) → banner', decideIntentAction(intent(), 'free', T0 + FRESH_MS).type, 'banner');
eq('closed checkout without paying → banner (not forced again)', decideIntentAction(intent({ checkoutStartedAt: T0 + 1000 }), 'free', T0 + 2000).type, 'banner');
eq('banner shown 2h ago → nothing (once a day)', decideIntentAction(intent({ checkoutStartedAt: T0, bannerShownAt: T0 + H }), 'free', T0 + 3 * H).type, 'none');
eq('banner shown a day ago → banner again', decideIntentAction(intent({ checkoutStartedAt: T0, bannerShownAt: T0 + H }), 'free', T0 + H + BANNER_INTERVAL_MS).type, 'banner');
eq('paid then closed the tab (webhook upgraded) → clear quietly', decideIntentAction(intent({ checkoutStartedAt: T0 }), 'premium', T0 + D).type, 'clear');

// ---------------------------------------------------------------- end-to-end simulations (storage + decisions)
{
  // Email confirmation in another browser: the link carries ?plan=&period=, captured fresh on landing → checkout.
  const phone = memStore();
  const landed = captureIntentFromSearch('?plan=ai&period=yearly&code=abc', T0 + 2 * D, phone);
  eq('confirm link on another device → checkout', decideIntentAction(landed, 'free', T0 + 2 * D + 1000).type, 'checkout');

  // Same browser, confirmed 3 hours later WITHOUT params (old link) → banner, not a surprise checkout.
  const s = memStore();
  captureIntentFromSearch('?plan=premium&period=monthly', T0, s);
  eq('stale intent without params → banner', decideIntentAction(readIntent(T0 + 3 * H, s), 'free', T0 + 3 * H).type, 'banner');

  // Checkout started, user comes back unpaid: banner once, then nothing until tomorrow, gone after 7 days.
  captureIntentFromSearch('?plan=premium&period=monthly', T0, s);
  updateIntent({ checkoutStartedAt: T0 + 60_000 }, T0 + 60_000, s);
  eq('back unpaid → banner', decideIntentAction(readIntent(T0 + 2 * H, s), 'free', T0 + 2 * H).type, 'banner');
  updateIntent({ bannerShownAt: T0 + 2 * H }, T0 + 2 * H, s);
  eq('same day reopen → nothing', decideIntentAction(readIntent(T0 + 5 * H, s), 'free', T0 + 5 * H).type, 'none');
  eq('next day → banner', decideIntentAction(readIntent(T0 + 2 * H + D, s), 'free', T0 + 2 * H + D).type, 'banner');
  eq('after 7 days → intent gone', decideIntentAction(readIntent(T0 + EXPIRE_MS + 1, s), 'free', T0 + EXPIRE_MS + 1).type, 'none');
}

// ---------------------------------------------------------------- wiring checks (source text)
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const account = readFileSync(new URL('../lib/account.ts', import.meta.url), 'utf8');
const checkoutFn = readFileSync(new URL('../supabase/functions/kelviq-checkout/index.ts', import.meta.url), 'utf8');
ok('intent cleared on logout (USER_LOCAL_STORAGE_KEYS)', /USER_LOCAL_STORAGE_KEYS = \[[^\]]*'cd_pending_plan'/.test(account));
ok('confirmation email keeps the plan in emailRedirectTo', /emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/login\$\{intentSearch\(intent\)\}`/.test(app));
ok('Google OAuth keeps the plan in redirectTo', /signInWithOAuth\(\{ provider: 'google', options: \{ redirectTo: `\$\{window\.location\.origin\}\/auth\/login\$\{intentSearch\(readIntent\(\)\)\}`/.test(app));
ok('signup → login keeps the plan', /onSwitchToLogin=\{\(\) => navigate\(\{ pathname: '\/auth\/login', search: intentSearch\(readIntent\(\)\) \}/.test(app));
ok('signed-in /signup?plan= is captured', app.includes("if (view.screen === 'auth') captureIntentFromSearch(location.search);"));
// Owner rule (2026-11-14): signing up with an email that already has an account always goes to log in (plan or not).
ok('existing email → log in for every sign-up (with or without a picked plan)', app.includes("if (signupOutcome(data, error) === 'alreadyRegistered')"));
ok('kelviq-checkout: customerId is the user id', /customerId: user\.id,/.test(checkoutFn));
ok('kelviq-checkout: metadata carries user_id', /metadata: \{ user_id: user\.id, tier \}/.test(checkoutFn));

console.log(`subscribe-flow-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
