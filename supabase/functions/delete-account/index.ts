// delete-account: authenticated. Permanently deletes the caller's account (GDPR).
//   1. cancels the caller's Kelviq subscription(s) immediately (refusing to continue if a paid
//      subscription exists but cannot be cancelled, so nobody keeps being charged),
//   2. removes the caller's files (<uid>/...) from every app storage bucket,
//   3. deletes the auth user; every table cascades from auth.users / profiles.
// Body: {} (optional { confirm: true } is accepted). Returns { ok: true } or { error, code }.
import { getUser, serviceClient } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/cors.ts';
import { KelviqError, kelviqRequest } from '../_shared/kelviq.ts';

const BUCKETS = ['logos', 'forum', 'price-book-images', 'signatures', 'document-assets'];
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']);

async function cancelSubscriptions(userId: string, storedSubscriptionId: string | null, hasPaidPlan: boolean) {
  if (!Deno.env.get('KELVIQ_SERVER_API_KEY')) {
    if (hasPaidPlan) throw new Error('BILLING_NOT_CONFIGURED');
    return;
  }
  const ids = new Set<string>();
  if (storedSubscriptionId) ids.add(storedSubscriptionId);
  try {
    const list = await kelviqRequest<{ results?: Array<{ id: string; status?: string }> }>(
      'GET', `/subscriptions/?customer_id=${encodeURIComponent(userId)}`);
    for (const s of list?.results || []) {
      if (s?.id && LIVE_STATUSES.has(String(s.status || '').toLowerCase())) ids.add(s.id);
    }
  } catch (e) {
    // no Kelviq customer yet => nothing to cancel
    if (!(e instanceof KelviqError && [400, 404].includes(e.status))) throw e;
  }
  for (const id of ids) {
    try {
      await kelviqRequest('POST', `/subscriptions/${encodeURIComponent(id)}/cancel/`, {
        cancellationType: 'IMMEDIATE',
        cancellationFeedback: 'OTHER',
        cancellationComment: 'Account deleted by the user in ContractorDocs.',
      });
    } catch (e) {
      // already cancelled / unknown subscription is fine; anything else stops the deletion
      if (!(e instanceof KelviqError && [400, 404, 409].includes(e.status))) throw e;
    }
  }
}

async function removeFiles(userId: string) {
  const storage = serviceClient().storage;
  for (const bucket of BUCKETS) {
    for (let round = 0; round < 50; round++) {
      const { data, error } = await storage.from(bucket).list(userId, { limit: 1000 });
      if (error || !data?.length) break;
      const paths = data.filter((f) => f.name).map((f) => `${userId}/${f.name}`);
      if (!paths.length) break;
      const { error: removeError } = await storage.from(bucket).remove(paths);
      if (removeError) throw new Error(`Could not delete files in ${bucket}: ${removeError.message}`);
      if (data.length < 1000) break;
    }
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const user = await getUser(req);
  if (!user) return json(req, { error: 'Please sign in again.', code: 'UNAUTHORIZED' }, 401);

  const admin = serviceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status, kelviq_subscription_id')
    .eq('id', user.id)
    .maybeSingle();
  const hasPaidPlan = !!profile && profile.subscription_tier !== 'free'
    && ['active', 'past_due', 'paused'].includes(profile.subscription_status);

  try {
    await cancelSubscriptions(user.id, profile?.kelviq_subscription_id ?? null, hasPaidPlan);
  } catch (e) {
    console.error('[delete-account] subscription cancel failed', e instanceof KelviqError ? `${e.status} ${JSON.stringify(e.body)}` : e);
    return json(req, {
      error: 'We could not cancel your subscription automatically, so your account was not deleted. Please cancel it in "Manage billing" first, or contact support.',
      code: 'SUBSCRIPTION_CANCEL_FAILED',
    }, 502);
  }

  try {
    await removeFiles(user.id);
  } catch (e) {
    console.error('[delete-account] storage cleanup failed', e);
    return json(req, { error: 'Your files could not be deleted. Please try again.', code: 'STORAGE_CLEANUP_FAILED' }, 500);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('[delete-account] deleteUser failed', error.message);
    return json(req, { error: 'Your account could not be deleted. Please try again or contact support.', code: 'DELETE_FAILED' }, 500);
  }
  return json(req, { ok: true });
});
