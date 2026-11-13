/**
 * Window event fired when an AI request hits the monthly plan limit (HTTP 402 PLAN_LIMIT).
 * App (CORE) listens and opens the upgrade modal:
 *   window.addEventListener(AI_UPGRADE_EVENT, (e) => openUpgrade((e as CustomEvent).detail.message))
 */
export const AI_UPGRADE_EVENT = 'contractordocs:upgrade';

export interface AIUpgradeDetail {
    feature: 'ai';
    message: string;
}

export function dispatchUpgradeEvent(message: string): void {
    try {
        window.dispatchEvent(new CustomEvent<AIUpgradeDetail>(AI_UPGRADE_EVENT, { detail: { feature: 'ai', message } }));
    } catch { /* non-browser environment */ }
}
