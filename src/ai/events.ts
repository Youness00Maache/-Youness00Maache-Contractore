/**
 * Window event fired when an AI request hits the monthly plan limit (HTTP 402 PLAN_LIMIT).
 * App (CORE) listens and opens the upgrade modal:
 *   window.addEventListener(AI_UPGRADE_EVENT, (e) => openUpgrade((e as CustomEvent).detail.message))
 */
export const AI_UPGRADE_EVENT = 'contractordocs:upgrade';

export interface AIUpgradeDetail {
    /** 'designs': a Free user picked a Premium document design (lib/designAccess.ts) */
    feature: 'ai' | 'designs';
    message: string;
}

/**
 * The AI refused because the monthly allowance is used up: PLAN_LIMIT, or CREDITS_EMPTY when AI credit top-ups are
 * on and the purchased credits are used up too (the panel then also offers "Buy more credits").
 */
export const isAiLimitCode = (code: string | null | undefined): boolean => code === 'PLAN_LIMIT' || code === 'CREDITS_EMPTY';

export function dispatchUpgradeEvent(message: string): void {
    try {
        window.dispatchEvent(new CustomEvent<AIUpgradeDetail>(AI_UPGRADE_EVENT, { detail: { feature: 'ai', message } }));
    } catch { /* non-browser environment */ }
}
