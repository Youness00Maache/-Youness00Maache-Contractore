// kelviq-checkout: AI credit actions. No Deno / npm imports (index.ts passes the clients in), so
// scripts/ai-credits-check.ts runs it in Node with fakes.
//
//  POST { action: 'credits_status' }                                  -> { enabled: false } | { enabled: true, balance, ... }
//  POST { action: 'credits_checkout', pack, successUrl?, cancelUrl? } -> { url, sessionId }   (one-time Kelviq checkout)
//  POST { action: 'credits_settings', autoRecharge, threshold, pack } -> status (as credits_status)
//
// OFF (credits_status says enabled: false, the others answer 503 CREDITS_DISABLED) until the secret
// AI_CREDITS_ENABLED=true is set AND docs/work/DRAFT_ai_credits.sql is applied. Credits are added only by
// kelviq-webhook (checkout.completed) or by an automatic top-up in ai-assistant, never from here.
import { AI_CREDIT_PACKS, AUTO_RECHARGE, aiCreditsEnabled, packById } from '../_shared/aiCredits.ts';

export const CREDIT_ACTIONS = ['credits_status', 'credits_checkout', 'credits_settings'] as const;
export type CreditAction = typeof CREDIT_ACTIONS[number];
export const isCreditsAction = (action: unknown): action is CreditAction =>
    (CREDIT_ACTIONS as readonly string[]).includes(String(action ?? ''));

export interface RpcError { message?: string; code?: string; details?: string; hint?: string }
export interface CreditsContext {
    /** From the verified JWT, never from the body. */
    userId: string;
    email?: string;
    env: (name: string) => string | undefined;
    /** Service-role RPC (supabase-js `.rpc`). */
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
    /** Kelviq REST call with the server key (throws on non-2xx; index.ts maps provider errors). */
    kelviq: <T = any>(method: 'POST', path: string, body: unknown) => Promise<T>;
    /** Creates / updates the Kelviq customer (customerId = user id). Errors are logged, not fatal. */
    ensureCustomer: () => Promise<void>;
    /** Allow-listed return URL or SITE_URL + fallbackPath. */
    returnUrl: (candidate: unknown, fallbackPath: string) => string;
}
export interface CreditsResult { status: number; body: Record<string, unknown> }

const DISABLED: CreditsResult = { status: 503, body: { error: 'AI credits are not available yet.', code: 'CREDITS_DISABLED' } };
const UNAVAILABLE: CreditsResult = { status: 503, body: { error: 'Your AI credits could not be loaded. Please try again in a minute.', code: 'CREDITS_UNAVAILABLE' } };

/** The credits SQL is not applied (PostgREST: function not in the schema cache). */
export const isMissingFunction = (err: RpcError | null | undefined): boolean =>
    Boolean(err) && /PGRST202|42883|Could not find the function|function .* does not exist/i.test(`${err?.code || ''} ${err?.message || ''}`);

/** What the app shows (Settings › Plan & billing › AI credits). */
export function creditsStatusBody(data: unknown): Record<string, unknown> {
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, any>;
    const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
    return {
        enabled: true,
        balance: Math.max(0, Math.floor(Number(d.balance) || 0)),
        hasPurchase: Boolean(d.has_purchase),
        usedThisMonth: Math.max(0, Number(d.used_this_month) || 0),
        autoRecharge: {
            enabled: Boolean(s.auto_recharge),
            threshold: Number(s.threshold) || AUTO_RECHARGE.defaultThreshold,
            pack: packById(s.pack)?.id || AUTO_RECHARGE.defaultPack,
        },
        lastRecharge: d.last_recharge && typeof d.last_recharge === 'object'
            ? { status: String(d.last_recharge.status || ''), pack: String(d.last_recharge.pack || ''), detail: d.last_recharge.detail ?? null, at: d.last_recharge.at ?? null }
            : null,
        recent: Array.isArray(d.recent) ? d.recent.slice(0, 5) : [],
        packs: AI_CREDIT_PACKS.map((p) => ({ ...p })),
        thresholds: [...AUTO_RECHARGE.thresholds],
        maxPerDay: AUTO_RECHARGE.maxPerDay,
    };
}

/** "AUTO_RECHARGE_NEEDS_PURCHASE: Buy a credit pack…" → "Buy a credit pack…" */
const stripCode = (message: string | undefined) => String(message || '').replace(/^[A-Z_]+:\s*/, '').trim();

export async function handleCreditsAction(action: CreditAction, body: Record<string, unknown>, ctx: CreditsContext): Promise<CreditsResult> {
    if (!aiCreditsEnabled(ctx.env)) return action === 'credits_status' ? { status: 200, body: { enabled: false } } : DISABLED;

    if (action === 'credits_status') {
        const { data, error } = await ctx.rpc('ai_credit_status', { p_user_id: ctx.userId });
        if (error) return isMissingFunction(error) ? { status: 200, body: { enabled: false } } : UNAVAILABLE;
        return { status: 200, body: creditsStatusBody(data) };
    }

    if (action === 'credits_settings') {
        const pack = packById(body.pack);
        const threshold = Number(body.threshold);
        if (!pack) return { status: 400, body: { error: 'Choose a credit pack.', code: 'BAD_REQUEST' } };
        if (!Number.isInteger(threshold) || threshold < AUTO_RECHARGE.minThreshold || threshold > AUTO_RECHARGE.maxThreshold) {
            return { status: 400, body: { error: `Choose a threshold between ${AUTO_RECHARGE.minThreshold} and ${AUTO_RECHARGE.maxThreshold} credits.`, code: 'BAD_REQUEST' } };
        }
        const { data, error } = await ctx.rpc('set_ai_credit_settings', {
            p_user_id: ctx.userId, p_auto_recharge: body.autoRecharge === true, p_threshold: threshold, p_pack: pack.id,
        });
        if (error) {
            const text = `${error.message || ''}`;
            if (/AUTO_RECHARGE_NEEDS_PURCHASE/.test(text)) return { status: 409, body: { error: stripCode(text), code: 'AUTO_RECHARGE_NEEDS_PURCHASE' } };
            if (/AI_CREDITS_INVALID/.test(text)) return { status: 400, body: { error: stripCode(text), code: 'BAD_REQUEST' } };
            return isMissingFunction(error) ? DISABLED : UNAVAILABLE;
        }
        return { status: 200, body: creditsStatusBody(data) };
    }

    // credits_checkout: one-time Kelviq checkout for a pack (on every plan, Free included; no "already subscribed" rule)
    const pack = packById(body.pack);
    if (!pack) return { status: 400, body: { error: 'Choose a credit pack.', code: 'BAD_REQUEST' } };
    // without the SQL the webhook could not add the credits: never take money for that
    const probe = await ctx.rpc('ai_credit_balance', { p_user_id: ctx.userId });
    if (probe.error) return isMissingFunction(probe.error) ? DISABLED : UNAVAILABLE;
    await ctx.ensureCustomer();
    const session = await ctx.kelviq<{ checkoutUrl?: string; checkoutSessionId?: string }>('POST', '/checkout/', {
        planIdentifier: pack.id,
        chargePeriod: 'ONE_TIME',
        customerId: ctx.userId,
        successUrl: ctx.returnUrl(body.successUrl, '/settings?credits=success#billing'),
        cancelUrl: ctx.returnUrl(body.cancelUrl, '/settings#billing'),
        ...(ctx.email ? { email: ctx.email } : {}),
        metadata: { user_id: ctx.userId, kind: 'ai_credits', pack: pack.id, credits: String(pack.credits) },
    });
    if (!session?.checkoutUrl) {
        return { status: 502, body: { error: 'Checkout is unavailable right now. Please try again.', code: 'BILLING_PROVIDER_ERROR' } };
    }
    return { status: 200, body: { url: session.checkoutUrl, sessionId: session.checkoutSessionId ?? null } };
}
