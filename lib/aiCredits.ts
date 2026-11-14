/**
 * AI credit top-ups in the app (Settings › Plan & billing › AI credits, the AI panel at the monthly limit and the
 * upgrade window). Everything goes through the `kelviq-checkout` edge function (service role, user id from the
 * JWT); credits are added only by the Kelviq webhook or an automatic top-up, never from the browser.
 *
 * Hidden unless the server says `enabled: true` (secret AI_CREDITS_ENABLED + docs/work/DRAFT_ai_credits.sql applied).
 * Packs and rules: supabase/functions/_shared/aiCredits.ts (same numbers on the server and in the SQL).
 */
import { invokeFunction } from './supabase.ts';
import {
    AI_CREDIT_PACKS, AUTO_RECHARGE, MIN_CREDIT_PURCHASE_USD, packById, packLabel, pricePerRequest, type AiCreditPack,
} from '../supabase/functions/_shared/aiCredits.ts';

export { AI_CREDIT_PACKS, AUTO_RECHARGE, MIN_CREDIT_PURCHASE_USD, packById, packLabel, pricePerRequest, type AiCreditPack };

/** The AI request was refused because the plan allowance AND the credits are used up (HTTP 402). */
export const CREDITS_EMPTY = 'CREDITS_EMPTY';

export interface AiCreditsStatus {
    enabled: boolean;
    balance: number;
    hasPurchase: boolean;
    usedThisMonth: number;
    autoRecharge: { enabled: boolean; threshold: number; pack: string };
    lastRecharge: { status: string; pack: string; detail: string | null; at: string | null } | null;
    recent: Array<{ delta: number; reason: string; pack: string | null; note: string | null; at: string }>;
    packs: AiCreditPack[];
    thresholds: number[];
    maxPerDay: number;
}

export const DISABLED_STATUS: AiCreditsStatus = {
    enabled: false, balance: 0, hasPurchase: false, usedThisMonth: 0,
    autoRecharge: { enabled: false, threshold: AUTO_RECHARGE.defaultThreshold, pack: AUTO_RECHARGE.defaultPack },
    lastRecharge: null, recent: [], packs: AI_CREDIT_PACKS.map(p => ({ ...p })), thresholds: [...AUTO_RECHARGE.thresholds], maxPerDay: AUTO_RECHARGE.maxPerDay,
};

/** Server answer → status (anything unexpected = disabled, so the UI simply stays hidden). */
export function normalizeCreditsStatus(raw: unknown): AiCreditsStatus {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
    if (r.enabled !== true) return DISABLED_STATUS;
    const auto = r.autoRecharge && typeof r.autoRecharge === 'object' ? r.autoRecharge : {};
    return {
        enabled: true,
        balance: Math.max(0, Math.floor(Number(r.balance) || 0)),
        hasPurchase: Boolean(r.hasPurchase),
        usedThisMonth: Math.max(0, Number(r.usedThisMonth) || 0),
        autoRecharge: {
            enabled: Boolean(auto.enabled),
            threshold: Number(auto.threshold) || AUTO_RECHARGE.defaultThreshold,
            pack: packById(auto.pack)?.id || AUTO_RECHARGE.defaultPack,
        },
        lastRecharge: r.lastRecharge && typeof r.lastRecharge === 'object' ? r.lastRecharge : null,
        recent: Array.isArray(r.recent) ? r.recent : [],
        packs: Array.isArray(r.packs) && r.packs.length ? r.packs.filter((p: unknown) => packById((p as AiCreditPack)?.id)).map((p: AiCreditPack) => packById(p.id)!) : DISABLED_STATUS.packs,
        thresholds: Array.isArray(r.thresholds) && r.thresholds.length ? r.thresholds.map(Number).filter(Number.isFinite) : [...AUTO_RECHARGE.thresholds],
        maxPerDay: Number(r.maxPerDay) || AUTO_RECHARGE.maxPerDay,
    };
}

let cache: { at: number; value: Promise<AiCreditsStatus> } | null = null;
const CACHE_MS = 60_000;

/** Credits status for the signed-in user (cached a minute; `fresh` reloads). Never throws: errors = hidden. */
export function getAiCreditsStatus(opts: { fresh?: boolean } = {}): Promise<AiCreditsStatus> {
    if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
    const value = invokeFunction<unknown>('kelviq-checkout', { action: 'credits_status' })
        .then(normalizeCreditsStatus)
        .catch(() => DISABLED_STATUS);
    cache = { at: Date.now(), value };
    return value;
}

export function forgetAiCreditsStatus(): void {
    cache = null;
}

const siteUrl = () => (import.meta.env?.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://www.contractordocs.app')).replace(/\/$/, '');

/** Starts the one-time Kelviq checkout for a pack and returns its URL (throws a readable error). */
export async function startCreditsCheckout(packId: string): Promise<string> {
    const pack = packById(packId);
    if (!pack) throw new Error('Choose a credit pack.');
    const res = await invokeFunction<{ url?: string }>('kelviq-checkout', {
        action: 'credits_checkout',
        pack: pack.id,
        successUrl: `${siteUrl()}/settings?credits=success#billing`,
        cancelUrl: `${siteUrl()}/settings#billing`,
    });
    if (!res?.url) throw new Error('Checkout is unavailable right now. Please try again.');
    forgetAiCreditsStatus();
    return res.url;
}

export async function saveAutoRecharge(input: { enabled: boolean; threshold: number; pack: string }): Promise<AiCreditsStatus> {
    const res = await invokeFunction<unknown>('kelviq-checkout', {
        action: 'credits_settings', autoRecharge: input.enabled, threshold: input.threshold, pack: input.pack,
    });
    const status = normalizeCreditsStatus(res);
    cache = { at: Date.now(), value: Promise.resolve(status) };
    return status;
}

/** Back from a credit-pack checkout (`/settings?credits=success#billing`). */
export const isCreditsCheckoutReturn = (search: string): boolean => /(?:^|[?&])credits=success(?:&|$)/.test(search || '');

/** "100 credits", "1 credit" */
export const creditsText = (n: number): string => `${Math.max(0, Math.floor(n)).toLocaleString('en-US')} credit${Math.floor(n) === 1 ? '' : 's'}`;

/** One line about the last automatic top-up, or null when there is nothing worth saying. */
export function lastRechargeNote(status: AiCreditsStatus): { tone: 'warning' | 'muted'; text: string } | null {
    const last = status.lastRecharge;
    if (!last) return null;
    const pack = packById(last.pack);
    const what = pack ? `$${pack.price}` : 'the top-up';
    if (last.status === 'failed') return { tone: 'warning', text: `Automatic top-up of ${what} failed${last.detail ? `: ${last.detail}` : ''}. It was switched off; buy a pack to update your card, then turn it on again.` };
    if (last.status === 'unclear') return { tone: 'warning', text: `We could not confirm your last automatic top-up of ${what}. Automatic top-up waits 24 hours; if your card was charged, the credits are added as soon as the payment is confirmed.` };
    if (last.status === 'pending') return { tone: 'muted', text: `Automatic top-up of ${what} in progress…` };
    return null;
}
