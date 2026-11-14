/**
 * Prepaid AI credits ("top-ups") for the AI assistant. Pure TypeScript: no Deno, browser or Supabase APIs, so it is
 * bundled into ai-assistant, kelviq-checkout and kelviq-webhook, imported by the app (lib/aiCredits.ts) and tested
 * in Node (scripts/ai-credits-check.ts).
 *
 *  - 1 credit = 1 AI request, used only AFTER the plan's monthly allowance is used up. Credits never expire.
 *  - Packs are one-time Kelviq plans (Product catalog: billing cycle "One time") with the identifiers below.
 *    The SQL (docs/work/DRAFT_ai_credits.sql, ai_credit_pack_credits()) holds the same numbers; the check script
 *    compares them.
 *  - Everything is OFF until the edge-function secret AI_CREDITS_ENABLED=true is set AND the SQL is applied
 *    (the functions also check that the SQL exists and fall back to the old behaviour when it does not).
 *  - Automatic top-up charges the card Kelviq saved at the first purchase (POST /charges/, off-session), at most
 *    AUTO_RECHARGE.maxPerDay times a day; a declined card switches it off, an unclear answer pauses it for a day.
 *
 * Pricing assumption (2026-11-14): Premium + AI = $10 for 600 requests (~$0.017/request incl. Premium), so credits
 * cost more per request than upgrading (~$0.038-0.05) and the plan stays the better deal for steady use. A request
 * costs us roughly $0.002-0.004 on gemini-3.5-flash-lite and at most ~$0.01 on the fallback models; Kelviq takes
 * 2.9% + $0.40 (+1.5% international) per payment. Even the $5 pack keeps ~75% after fees at the worst-case cost.
 */

export interface AiCreditPack {
    /** Kelviq plan identifier (one-time plan). */
    id: string;
    /** USD */
    price: number;
    credits: number;
}

/** Minimum top-up in USD (owner: "$5 or above"). */
export const MIN_CREDIT_PURCHASE_USD = 5;

/** Fixed packs (bigger packs carry a small bonus). Keep in sync with ai_credit_pack_credits() in the SQL. */
export const AI_CREDIT_PACKS: readonly AiCreditPack[] = [
    { id: 'ai-credits-5', price: 5, credits: 100 },
    { id: 'ai-credits-10', price: 10, credits: 220 },
    { id: 'ai-credits-20', price: 20, credits: 480 },
    { id: 'ai-credits-50', price: 50, credits: 1300 },
] as const;

export const CREDIT_PACK_PREFIX = 'ai-credits-';

export const AUTO_RECHARGE = {
    /** "Top up when fewer than N credits are left" choices offered in Settings. */
    thresholds: [10, 20, 50, 100] as const,
    minThreshold: 5,
    maxThreshold: 500,
    defaultThreshold: 20,
    defaultPack: 'ai-credits-10',
    /** Successful + pending automatic charges allowed in 24 hours (runaway protection). */
    maxPerDay: 3,
    /** An unanswered charge blocks new automatic charges for this long (it may still have gone through). */
    unclearPauseHours: 24,
} as const;

/** Server flag (edge-function secret). Anything but 1/true/yes/on = off = the old behaviour. */
export const AI_CREDITS_FLAG = 'AI_CREDITS_ENABLED';

export function aiCreditsEnabled(get: (name: string) => string | undefined): boolean {
    return /^(1|true|yes|on)$/i.test(String(get(AI_CREDITS_FLAG) ?? '').trim());
}

export function packById(id: unknown): AiCreditPack | null {
    const key = String(id ?? '').trim().toLowerCase();
    return AI_CREDIT_PACKS.find((p) => p.id === key) || null;
}

export function isCreditPackPlan(identifier: unknown): boolean {
    return packById(identifier) !== null;
}

/** "$5 · 100 credits" */
export function packLabel(pack: AiCreditPack): string {
    return `$${pack.price} · ${pack.credits.toLocaleString('en-US')} credits`;
}

/** USD per AI request for a pack (for the pricing check and the UI hint). */
export function pricePerRequest(pack: AiCreditPack): number {
    return pack.price / pack.credits;
}

// ------------------------------------------------------------------ webhook routing

/**
 * Which SQL function handles a Kelviq event:
 *  - 'credits'  : an AI credit pack (checkout.completed / order.* with a credit-pack plan). NEVER the subscription
 *                 handler: its order.refunded branch would end the user's subscription for a credit-pack refund.
 *  - 'refund'   : refund.* (no plan on the payload). apply_ai_credit_event handles it when the credits SQL exists
 *                 (it ignores refunds of other orders, like the subscription handler does); otherwise the old handler.
 *  - 'subscription': everything else, unchanged (apply_kelviq_event).
 */
export type KelviqEventRoute = 'credits' | 'refund' | 'subscription';

export function routeKelviqEvent(event: unknown): KelviqEventRoute {
    const e = (event && typeof event === 'object' ? event : {}) as { type?: unknown; data?: { object?: { plan?: { identifier?: unknown } } } };
    const type = String(e.type ?? '');
    if (isCreditPackPlan(e.data?.object?.plan?.identifier)) return 'credits';
    if (/^refund\./.test(type)) return 'refund';
    return 'subscription';
}

// ------------------------------------------------------------------ ledger math (mirrored by the SQL)

export type LedgerReason = 'purchase' | 'usage' | 'refund' | 'adjust';
export interface LedgerEntry { delta: number; reason: LedgerReason; sourceKey?: string | null }

/** Balance = sum of the ledger. */
export function ledgerBalance(entries: readonly LedgerEntry[]): number {
    return entries.reduce((sum, e) => sum + e.delta, 0);
}

/**
 * Credits to take back for a refund of a credit-pack order (same rule as _ai_credit_refund() in the SQL):
 * proportional to the refunded amount, never more than what the order still has, the whole remainder for a full
 * refund or when amounts are unknown.
 */
export function refundCreditsFor(
    order: { credits: number; amountUnits?: number | null; refundedCredits?: number | null },
    refundUnits: number | null | undefined,
    full = false,
): number {
    const remaining = Math.max(0, order.credits - Math.max(0, order.refundedCredits || 0));
    if (full || !order.amountUnits || refundUnits == null || !Number.isFinite(refundUnits)) return remaining;
    const share = Math.round((order.credits * Math.max(0, refundUnits)) / order.amountUnits);
    return Math.min(remaining, Math.max(0, share));
}

/** A refund never pushes the balance below zero: credits already used stay used (the shortfall is noted). */
export function refundTake(target: number, balance: number): number {
    return Math.max(0, Math.min(target, Math.max(0, balance)));
}

/** Automatic top-up is due when it is on and the balance fell below the threshold. */
export function autoRechargeDue(settings: { autoRecharge: boolean; threshold: number } | null | undefined, balance: number): boolean {
    return Boolean(settings?.autoRecharge) && balance < (settings?.threshold ?? 0);
}

// ------------------------------------------------------------------ off-session charge (POST /charges/)

/** Kelviq REST base (same rule as _shared/kelviq.ts kelviqBaseUrl, without Deno). */
export function kelviqApiBase(kelviqEnv: string | undefined): string {
    return String(kelviqEnv || 'live').trim().toLowerCase() === 'sandbox'
        ? 'https://sandboxapi.kelviq.com/api/v1'
        : 'https://api.kelviq.com/api/v1';
}

/** Body of the off-session charge for one pack (customerId = our user id, as at checkout). */
export function chargeRequestBody(pack: AiCreditPack, userId: string): Record<string, unknown> {
    return { planIdentifier: pack.id, chargePeriod: 'ONE_TIME', customerId: userId };
}

export type ChargeOutcome =
    | { status: 'succeeded'; chargeId: string; amount: number | null; currency: string | null }
    | { status: 'failed'; detail: string }
    | { status: 'unclear'; detail: string };

/**
 * Kelviq POST /charges/ answer → outcome. 201 with an id = paid. Any 4xx = not charged (Kelviq: "Do not
 * automatically retry a 400"; declined, needs authentication, no saved card). No answer / 5xx / 2xx without an id
 * = unclear: the card MAY have been charged, so we never retry blindly (POST /charges/ has no idempotency key).
 */
export function classifyChargeResponse(status: number | null, body: unknown): ChargeOutcome {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (status === null) return { status: 'unclear', detail: 'No answer from the payment provider.' };
    if (status >= 200 && status < 300) {
        const id = typeof b.id === 'string' || typeof b.id === 'number' ? String(b.id) : '';
        if (!id) return { status: 'unclear', detail: 'The payment provider did not confirm the charge.' };
        const amount = Number(b.amount);
        return { status: 'succeeded', chargeId: id, amount: Number.isFinite(amount) ? amount : null, currency: typeof b.currency === 'string' ? b.currency : null };
    }
    if (status >= 400 && status < 500) {
        const detail = typeof b.detail === 'string' && b.detail.trim() ? b.detail.trim().slice(0, 200) : 'Your card could not be charged.';
        return { status: 'failed', detail };
    }
    return { status: 'unclear', detail: `The payment provider answered ${status}.` };
}

// ------------------------------------------------------------------ messages + 402 payload

/** User-facing text when the plan allowance AND the credits are used up. Starts with "PLAN_LIMIT:" like before. */
export function creditsEmptyMessage(tier: 'free' | 'premium' | 'ai', limit: number): string {
    const head = `PLAN_LIMIT: You have used all ${limit} AI requests included in your plan this month and have no AI credits left.`;
    return tier === 'ai'
        ? `${head} Buy AI credits (from $${MIN_CREDIT_PURCHASE_USD}) to keep going now, or wait for your allowance to reset on the 1st.`
        : `${head} Buy AI credits (from $${MIN_CREDIT_PURCHASE_USD}) or upgrade your plan to keep going.`;
}

export interface CreditsBuyInfo {
    balance: number;
    packs: AiCreditPack[];
    /** In-app place to buy and set automatic top-up. */
    buy_path: string;
    auto_recharge: { enabled: boolean; last_status: string | null; last_detail: string | null };
}

export function creditsBuyInfo(balance: number, auto?: { enabled?: boolean; lastStatus?: string | null; lastDetail?: string | null }): CreditsBuyInfo {
    return {
        balance,
        packs: AI_CREDIT_PACKS.map((p) => ({ ...p })),
        buy_path: '/settings#billing',
        auto_recharge: { enabled: Boolean(auto?.enabled), last_status: auto?.lastStatus ?? null, last_detail: auto?.lastDetail ?? null },
    };
}
