// kelviq-webhook: which SQL function applies a verified event. No Deno / npm imports (tested in Node by
// scripts/ai-credits-check.ts).
//  - AI credit packs (plan identifier ai-credits-*) -> apply_ai_credit_event. NEVER apply_kelviq_event: its
//    order.refunded branch would end the user's subscription for a credit-pack refund. If the credits SQL is not
//    applied the delivery fails (500) so Kelviq retries / it can be resent from the Kelviq dashboard later.
//  - refund.* (no plan on the payload) -> apply_ai_credit_event when the credits SQL exists (it ignores other
//    orders, like apply_kelviq_event does), otherwise apply_kelviq_event exactly as before.
//  - everything else (subscriptions) -> apply_kelviq_event, unchanged.
import { routeKelviqEvent } from '../_shared/aiCredits.ts';

export interface WebhookRpcError { message?: string; code?: string }
export type WebhookRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: WebhookRpcError | null }>;

const isMissingFunction = (err: WebhookRpcError | null | undefined): boolean =>
    Boolean(err) && /PGRST202|42883|Could not find the function|function .* does not exist/i.test(`${err?.code || ''} ${err?.message || ''}`);

export async function applyKelviqWebhookEvent(event: Record<string, unknown>, rpc: WebhookRpc): Promise<{ fn: string; data: unknown; error: WebhookRpcError | null }> {
    const route = routeKelviqEvent(event);
    if (route === 'credits') {
        const r = await rpc('apply_ai_credit_event', { p_event: event });
        if (r.error && isMissingFunction(r.error)) {
            return { fn: 'apply_ai_credit_event', data: null, error: { message: 'AI credit pack event, but docs/work/DRAFT_ai_credits.sql is not applied', code: r.error.code } };
        }
        return { fn: 'apply_ai_credit_event', ...r };
    }
    if (route === 'refund') {
        const r = await rpc('apply_ai_credit_event', { p_event: event });
        if (!r.error || !isMissingFunction(r.error)) return { fn: 'apply_ai_credit_event', ...r };
    }
    const r = await rpc('apply_kelviq_event', { p_event: event });
    return { fn: 'apply_kelviq_event', ...r };
}
