/**
 * Estimate reviewer: network side (the checks themselves are lib/estimateReview.ts, pure).
 *  - the AI check: the ai-assistant task "estimate_review" (same function, timeout and error messages as the assistant)
 *  - the tax rate the user usually charges: the last 20 estimates / invoices (row-level security scopes them to the
 *    owner); failures return null and the tax check is simply skipped.
 * Loaded on demand by the review panel, so the estimate form's own code stays small.
 */
import { supabase } from './supabase.ts';
import { FormType } from '../types.ts';
import { readFunctionError } from '../src/hooks/useMasterAIRouter.ts';
import { parseAiReviewResponse, usualTaxRateOf, type ReviewFinding } from './estimateReview.ts';

export class EstimateReviewError extends Error {
    constructor(message: string, public code: string) { super(message); }
}

/** Runs the AI check. Throws EstimateReviewError (code PLAN_REQUIRED / PLAN_LIMIT / CREDITS_EMPTY / AI_BUSY / NETWORK …). */
export async function runAiEstimateReview(body: Record<string, unknown>, estimate: unknown, signal?: AbortSignal): Promise<ReviewFinding[]> {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body, signal, timeout: 130_000 });
    if (error) {
        const info = await readFunctionError(error);
        throw new EstimateReviewError(info.message.replace(/^PLAN_REQUIRED:\s*/, ''), info.code);
    }
    try {
        return parseAiReviewResponse(data, estimate);
    } catch (e) {
        throw new EstimateReviewError((e as Error).message, 'AI_BAD_OUTPUT');
    }
}

/** The tax rate the user normally charges (lib/estimateReview.ts usualTaxRateOf), or null. */
export async function fetchUsualTaxRate(excludeId?: string): Promise<number | null> {
    try {
        let query = (supabase as any)
            .from('documents')
            .select('id, taxRate:data->>taxRate')
            .in('type', [FormType.Estimate, FormType.Invoice])
            .order('created_at', { ascending: false })
            .limit(21);
        if (excludeId) query = query.neq('id', excludeId);
        const { data, error } = await query;
        if (error || !Array.isArray(data)) return null;
        return usualTaxRateOf(data.slice(0, 20).map((r: { taxRate?: unknown }) => r.taxRate));
    } catch {
        return null;
    }
}
