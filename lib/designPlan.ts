/**
 * The signed-in user's plan, for the document-design rules (lib/designAccess.ts). App sets it during render (before
 * any form mounts); forms read it when they open or save a document. Tiny on purpose: App imports it eagerly,
 * designAccess (which pulls in the design registry) stays in the lazy form chunks.
 */
import { normalizeTier, type PlanTier } from './plans.ts';

let currentPlan: PlanTier | null = null;

/** App sets the signed-in user's plan here (null on logout). */
export const setDesignPlan = (plan: string | null | undefined): void => {
    currentPlan = plan == null ? null : normalizeTier(plan);
};

/** The signed-in user's plan ('free' until App knows it: never more than the user has). */
export const designPlan = (): PlanTier => currentPlan ?? 'free';
