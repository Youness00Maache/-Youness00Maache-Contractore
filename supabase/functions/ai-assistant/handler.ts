/**
 * ai-assistant request handler (runtime-agnostic: only web-standard APIs, so it runs in
 * Deno and can be exercised from Node tests with a fake fetch).
 *
 * Pipeline: CORS → JWT (real signed-in user only) → input limits → plan limit + rate limit
 * (usage_events, service role) → model (Gemini JSON mode with responseSchema, or the mock; busy
 * models are retried with a short backoff, then the next model is tried) → robust parse →
 * buildProposal (validation/normalization) → meter usage (successful answers only) → JSON response.
 *
 * Photo tasks (body.task = "photo_update" | "photo_walkthrough", shared/photoTasks.ts): same auth, limits, model
 * chain and metering, plus a Premium + AI plan check; up to 8 photos; see handlePhotoTask.
 * Estimate review (body.task = "estimate_review", shared/estimateReview.ts): same auth, limits, model chain and
 * metering, Premium + AI only; returns findings (missing items / expenses / risky assumptions); see handleEstimateReview.
 */
import {
    buildProposal, buildResponseSchema, hasPriceBook, isSampleRequest, parseModelJson, requestHasEstimateOptions, RouterInputError, sanitizeRequest,
    type ModelOutput, type RouterRequest, type RouterResponse,
} from './shared/routerContract.ts';
import {
    buildPhotoResponseSchema, buildPhotoSystemPrompt, buildPhotoUserParts, buildWalkthroughProposal, isPhotoTaskBody, mockPhotoTaskOutput,
    parsePhotoUpdate, PHOTO_TASK_TIER, PHOTO_TASK_UPGRADE_MESSAGE, sanitizePhotoTaskRequest, type PhotoTaskRequest,
} from './shared/photoTasks.ts';
import {
    buildReviewResponseSchema, buildReviewSystemPrompt, buildReviewUserTurn, ESTIMATE_REVIEW_TIER, ESTIMATE_REVIEW_UPGRADE_MESSAGE,
    isEstimateReviewBody, mockEstimateReviewOutput, parseReviewFindings, sanitizeEstimateReviewRequest, type EstimateReviewRequest,
} from './shared/estimateReview.ts';
import { buildSystemPrompt, buildUserTurn } from './shared/prompt.ts';
import { mockModelOutput } from './shared/mockModel.ts';
import { REQUEST_LIMITS } from './shared/routerContract.ts';
import {
    aiCreditsEnabled, chargeRequestBody, classifyChargeResponse, creditsBuyInfo, creditsEmptyMessage, kelviqApiBase, packById,
} from '../_shared/aiCredits.ts';

export interface RouterEnv { get(name: string): string | undefined }
export interface HandlerDeps {
    fetch: typeof fetch;
    now?: () => Date;
    log?: (...args: unknown[]) => void;
    /** Waits between retries of a busy model (tests pass a fake that does not wait). */
    sleep?: (ms: number) => Promise<void>;
    /** Tests only: shorter model time limits (defaults: MODEL_TIMEOUT_MS, 45 s per attempt, 12 s minimum). */
    modelTimeouts?: { totalMs: number; attemptMs: number; minAttemptMs: number };
    /**
     * Keeps background work (an automatic AI-credit top-up after the answer) alive after the response is sent
     * (Supabase: EdgeRuntime.waitUntil). Without it the work is awaited before answering.
     */
    waitUntil?: (task: Promise<unknown>) => void;
}

/** What admit() allowed: the plan's monthly allowance, or (AI credits on, allowance used up) a purchased credit. */
interface Admission {
    tier: 'free' | 'premium' | 'ai';
    used: number;
    limit: number;
    payWith: 'plan' | 'credits';
    /** Credit balance before this request (payWith = credits). */
    credits?: number;
}

/** Monthly AI requests per plan. Keep in sync with lib/plans.ts (FREE_LIMITS.ai, PAID_AI_LIMITS). */
export const AI_MONTHLY_LIMITS: Record<'free' | 'premium' | 'ai', number> = { free: 15, premium: 60, ai: 600 };

/**
 * Models (Google's model list + deprecations page, checked 2026-11-13). The 2.5 models are closed to
 * new users (2.5-flash-lite answers 404 "no longer available to new users", 2.5-flash is deprecated and
 * routes to 3.5-flash-lite on 2026-12-01). gemini-3.5-flash is retired too (routed to 3.6-flash).
 *   gemini-3.5-flash-lite  stable, Google's migration target for gemini-2.5-flash, same price, fastest
 *   gemini-3.6-flash       stable, stronger Flash model (separate capacity), used when the first is busy
 *   gemini-3.1-flash-lite  stable until 2027-05, cheapest; last resort
 * GEMINI_MODEL (secret) is always tried first; duplicates are skipped.
 */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const BACKUP_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'] as const;
/** Total time for all model attempts and waits (the edge runtime allows 150 s; the browser waits 130 s). */
export const MODEL_TIMEOUT_MS = 100_000;
/** One attempt of a model that is not the last one: a hanging model is abandoned so the next one has time. */
const ATTEMPT_TIMEOUT_MS = 45_000;
/** Never start an attempt with less time than this left. */
const MIN_ATTEMPT_MS = 12_000;
/** 503 "high demand" / 429: wait, then ask the same model again (first model twice, the others once). */
const BUSY_BACKOFF_MS = [1_200, 3_000];
/** A 429 that asks to wait longer than this moves on to the next model instead. */
const MAX_BUSY_WAIT_MS = 6_000;
/** Gemini 2.x: small thinking budget (planning multi-step requests, still fast). */
const THINKING_BUDGET = 1024;
/** Gemini 3+: thinking level (3.5-flash-lite defaults to "minimal", too little for multi-step plans). */
const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
const DEFAULT_THINKING_LEVEL = 'LOW';

/** Major version of a "gemini-<major>[.<minor>]-…" id; 0 for aliases like gemini-flash-latest. */
export function geminiGeneration(model: string): number {
    const m = model.match(/^(?:models\/)?gemini-(\d+)(?:\.\d+)?-/i);
    return m ? Number(m[1]) : 0;
}

/** What one failed model attempt means for the user (the final message picks the most useful one). */
type FailureKind = 'busy' | 'timeout' | 'bad_output' | 'schema' | 'unavailable';

/** Honest, user-facing errors. Status codes and model names stay in the function logs. */
const FAILURE_ERRORS: Record<FailureKind, { status: number; code: string; message: string }> = {
    busy: { status: 503, code: 'AI_BUSY', message: 'The AI is busy right now. Please try again in a minute.' },
    timeout: { status: 504, code: 'AI_TIMEOUT', message: 'The AI took too long to answer. Please try again, or ask for fewer things at once.' },
    bad_output: { status: 502, code: 'AI_BAD_OUTPUT', message: 'The AI returned an answer I could not read. Please try again.' },
    schema: { status: 502, code: 'AI_UPSTREAM', message: 'The AI could not handle this request. Please try again, or ask for fewer things at once.' },
    unavailable: { status: 503, code: 'AI_UNAVAILABLE', message: 'The AI service is not available right now. Please try again in a few minutes.' },
};
const FAILURE_PRIORITY: FailureKind[] = ['busy', 'timeout', 'bad_output', 'schema', 'unavailable'];

/** Seconds from a Google RetryInfo ("retryDelay": "12s"), or null. */
function retryDelayMs(body: string): number | null {
    const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    return m ? Math.round(Number(m[1]) * 1000) : null;
}

class HttpError extends Error {
    /** `extra` is added to the JSON error body (e.g. the AI-credit packs on CREDITS_EMPTY). */
    constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) { super(message); }
}

function normalizeTier(tier: unknown): 'free' | 'premium' | 'ai' {
    const t = String(tier || '').toLowerCase();
    if (t === 'ai' || t === 'premium-ai' || t === 'premium_ai') return 'ai';
    if (t === 'premium' || t === 'pro') return 'premium';
    return 'free';
}

function corsHeaders(req: Request, env: RouterEnv): Record<string, string> {
    const origin = req.headers.get('Origin') || '';
    const allowed = new Set(
        [env.get('SITE_URL'), 'http://localhost:3010', 'http://127.0.0.1:3010', ...(env.get('ALLOWED_ORIGINS') || '').split(',')]
            .map(o => (o || '').trim().replace(/\/$/, ''))
            .filter(Boolean),
    );
    const headers: Record<string, string> = {
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
    if (origin && allowed.has(origin.replace(/\/$/, ''))) headers['Access-Control-Allow-Origin'] = origin;
    return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function fetchWithTimeout(f: typeof fetch, url: string, init: RequestInit, ms: number): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await f(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

export function createHandler(env: RouterEnv, deps: HandlerDeps) {
    const f = deps.fetch;
    const now = deps.now || (() => new Date());
    const log = deps.log || ((...a: unknown[]) => console.error('[ai-assistant]', ...a));
    const sleep = deps.sleep || ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
    const limits = deps.modelTimeouts || { totalMs: MODEL_TIMEOUT_MS, attemptMs: ATTEMPT_TIMEOUT_MS, minAttemptMs: MIN_ATTEMPT_MS };

    // Per-isolate burst guard (the usage_events check below is the real limit).
    const burst = new Map<string, number[]>();
    const burstExceeded = (userId: string, nowMs: number): boolean => {
        const recent = (burst.get(userId) || []).filter(t => nowMs - t < 10_000);
        recent.push(nowMs);
        burst.set(userId, recent);
        if (burst.size > 5000) burst.clear();
        return recent.length > 6;
    };

    const supabaseUrl = (env.get('SUPABASE_URL') || '').replace(/\/$/, '');
    const anonKey = env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    /** AI credit top-ups (secret AI_CREDITS_ENABLED). Off = exactly the old behaviour, no extra calls. */
    const creditsOn = aiCreditsEnabled(name => env.get(name));

    async function getUser(req: Request): Promise<{ id: string }> {
        const auth = req.headers.get('Authorization') || '';
        const token = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
        if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to use the AI assistant.');
        if (!supabaseUrl || !anonKey) throw new HttpError(503, 'NOT_CONFIGURED', 'The AI assistant is not configured on the server.');
        const res = await fetchWithTimeout(f, `${supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } }, 8000)
            .catch(() => { throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Could not verify your session. Please try again.'); });
        if (!res.ok) throw new HttpError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
        const user = await res.json().catch(() => null) as { id?: string; role?: string; aud?: string } | null;
        if (!user?.id || user.role === 'anon') throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to use the AI assistant.');
        return { id: user.id };
    }

    const restHeaders = () => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });

    async function getTier(userId: string): Promise<'free' | 'premium' | 'ai'> {
        const base = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`;
        for (const select of ['subscription_tier,subscription_status,subscription_period_end', 'subscription_tier']) {
            const res = await fetchWithTimeout(f, `${base}&select=${select}`, { headers: restHeaders() }, 8000).catch(() => null);
            if (!res || !res.ok) continue;
            const rows = await res.json().catch(() => []) as Array<Record<string, unknown>>;
            const row = rows[0];
            if (!row) return 'free';
            const tier = normalizeTier(row.subscription_tier);
            const status = String(row.subscription_status || '').toLowerCase();
            if (tier === 'free') return 'free';
            if (!status || status === 'active' || status === 'past_due') return tier;
            const periodEnd = row.subscription_period_end ? Date.parse(String(row.subscription_period_end)) : NaN;
            return Number.isFinite(periodEnd) && periodEnd > now().getTime() ? tier : 'free';
        }
        return 'free';
    }

    /** `kinds`: usage_events kinds to count (the per-minute rate limit also counts requests paid with AI credits). */
    async function countUsage(userId: string, sinceIso: string, kinds: string[] = ['ai']): Promise<number> {
        const kindFilter = kinds.length === 1 ? `kind=eq.${kinds[0]}` : `kind=in.(${kinds.join(',')})`;
        const url = `${supabaseUrl}/rest/v1/usage_events?select=id&user_id=eq.${encodeURIComponent(userId)}&${kindFilter}&created_at=gte.${encodeURIComponent(sinceIso)}`;
        const res = await fetchWithTimeout(f, url, { method: 'HEAD', headers: { ...restHeaders(), Prefer: 'count=exact' } }, 8000).catch(() => null);
        const range = res?.headers.get('content-range') || '';
        const total = Number(range.split('/')[1]);
        if (!res || !res.ok || !Number.isFinite(total)) {
            log('usage count failed', res?.status, range);
            throw new HttpError(503, 'USAGE_UNAVAILABLE', 'The AI assistant is temporarily unavailable. Please try again in a minute.');
        }
        return total;
    }

    /**
     * Records one AI request. Called ONLY after the model answered and the answer was validated:
     * failed, refused, timed-out or cancelled requests are never metered (QA report 0b #19).
     * Prefers the atomic `consume_usage` RPC (locks the profile row, re-checks the limit, updates
     * ai_credits_used). The plain insert is used only when the RPC does not exist: after an RPC
     * timeout or error the RPC may still have counted, and a second insert would count twice.
     * Throws PLAN_LIMIT when parallel requests crossed the limit (with AI credits on: a credit is spent instead,
     * CREDITS_EMPTY when there is none). A request admitted on credits spends one credit (spend_ai_credit).
     * Returns the credit balance after a credit was spent.
     */
    async function recordUsage(userId: string, admission: Admission): Promise<{ credits?: number }> {
        if (admission.payWith === 'credits') return spendCredit(userId, admission);
        const rpc = await fetchWithTimeout(f, `${supabaseUrl}/rest/v1/rpc/consume_usage`, {
            method: 'POST',
            headers: { ...restHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_user_id: userId, p_kind: 'ai', p_count: 1 }),
        }, 8000).catch(() => null);
        if (rpc?.ok) return {};
        const text = rpc ? await rpc.text().catch(() => '') : '';
        if (/PLAN_LIMIT/.test(text)) {
            // parallel requests used the last plan request: pay this one with a credit when the user has one
            if (creditsOn) return spendCredit(userId, admission);
            throw new HttpError(402, 'PLAN_LIMIT', 'PLAN_LIMIT: You have used all AI requests included in your plan this month. Upgrade your plan to keep using the assistant.');
        }
        const rpcMissing = Boolean(rpc) && (rpc!.status === 404 || /PGRST202|Could not find the function/i.test(text));
        if (!rpcMissing) {
            log('usage rpc failed (not counted twice)', rpc?.status ?? 'timeout', text.slice(0, 200));
            return {};
        }
        const res = await fetchWithTimeout(f, `${supabaseUrl}/rest/v1/usage_events`, {
            method: 'POST',
            headers: { ...restHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ user_id: userId, kind: 'ai' }),
        }, 8000).catch(() => null);
        if (!res || !res.ok) log('usage insert failed', rpc?.status, text.slice(0, 200), res?.status);
        return {};
    }

    // ───────────────────────────── AI credits (only when creditsOn) ─────────────────────────────

    /** Service-role RPC call. `missing` = the function does not exist (the credits SQL is not applied). */
    async function callRpc(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any; text: string; missing: boolean }> {
        const res = await fetchWithTimeout(f, `${supabaseUrl}/rest/v1/rpc/${name}`, {
            method: 'POST',
            headers: { ...restHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        }, 8000).catch(() => null);
        if (!res) return { ok: false, status: 0, data: null, text: '', missing: false };
        const text = await res.text().catch(() => '');
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        return { ok: res.ok, status: res.status, data, text, missing: res.status === 404 || /PGRST202|Could not find the function/i.test(text) };
    }

    /** Purchased credits left; null when the credits SQL is not applied (then the old 402 PLAN_LIMIT applies). */
    async function creditBalance(userId: string): Promise<number | null> {
        const r = await callRpc('ai_credit_balance', { p_user_id: userId });
        if (r.ok) return Math.max(0, Math.floor(Number(r.data) || 0));
        if (r.missing) {
            log('AI_CREDITS_ENABLED is on but the AI credits SQL is not applied; using the plan limit only');
            return null;
        }
        log('credit balance failed', r.status || 'timeout', r.text.slice(0, 200));
        throw new HttpError(503, 'USAGE_UNAVAILABLE', 'The AI assistant is temporarily unavailable. Please try again in a minute.');
    }

    /** The 402 for "plan allowance and credits used up", with the packs and the automatic top-up state. */
    async function creditsEmptyError(userId: string, admission: Pick<Admission, 'tier' | 'used' | 'limit'>): Promise<HttpError> {
        const status = await callRpc('ai_credit_status', { p_user_id: userId });
        const s = status.ok ? status.data || {} : {};
        const info = creditsBuyInfo(Math.max(0, Number(s.balance) || 0), {
            enabled: Boolean(s.settings?.auto_recharge),
            lastStatus: s.last_recharge?.status ?? null,
            lastDetail: s.last_recharge?.detail ?? null,
        });
        return new HttpError(402, 'CREDITS_EMPTY', creditsEmptyMessage(admission.tier, admission.limit),
            { limit: admission.limit, used: admission.used, tier: admission.tier, credits: info });
    }

    /** Spends one credit after a successful answer; starts an automatic top-up when the balance fell below the threshold. */
    async function spendCredit(userId: string, admission: Admission): Promise<{ credits?: number }> {
        const r = await callRpc('spend_ai_credit', { p_user_id: userId });
        if (r.ok) {
            const balance = Math.max(0, Number(r.data?.balance) || 0);
            if (r.data?.auto_recharge_due) await background(autoRecharge(userId));
            return { credits: balance };
        }
        if (/CREDITS_EMPTY/.test(r.text)) throw await creditsEmptyError(userId, admission);
        if (r.missing) {
            throw new HttpError(402, 'PLAN_LIMIT', 'PLAN_LIMIT: You have used all AI requests included in your plan this month. Upgrade your plan to keep using the assistant.');
        }
        // timeout / database error: the RPC may still have spent it; never spend twice
        log('credit spend failed (not spent twice)', r.status || 'timeout', r.text.slice(0, 200));
        return {};
    }

    /** Background work: kept alive with waitUntil when the runtime has it, else awaited. Never throws. */
    async function background(task: Promise<unknown>): Promise<void> {
        const safe = task.catch(err => log('background task failed', err instanceof Error ? err.message : String(err)));
        if (deps.waitUntil) {
            try { deps.waitUntil(safe); return; } catch { /* fall through: await it */ }
        }
        await safe;
    }

    /**
     * Automatic top-up: claim (SQL: on, below the threshold, nothing in flight or unclear, under the daily cap) →
     * Kelviq POST /charges/ (off-session, the card saved at the first purchase) → finish (credits added once by the
     * charge id; a refused card switches automatic top-up off; no answer = unclear, never retried blindly).
     * Returns the outcome and the new balance, or null when nothing was charged.
     */
    async function autoRecharge(userId: string): Promise<{ status: string; balance: number } | null> {
        const kelviqKey = env.get('KELVIQ_SERVER_API_KEY') || '';
        if (!kelviqKey) {
            log('automatic top-up skipped: KELVIQ_SERVER_API_KEY is not set');
            return null;
        }
        const claim = await callRpc('claim_ai_auto_recharge', { p_user_id: userId });
        if (!claim.ok || !claim.data?.claimed) return null;
        const attemptId = String(claim.data.attempt_id || '');
        const pack = packById(claim.data.pack);
        let outcome = classifyChargeResponse(400, { detail: 'Unknown credit pack.' });
        if (pack) {
            let status: number | null = null;
            let body: unknown = null;
            try {
                const res = await fetchWithTimeout(f, `${kelviqApiBase(env.get('KELVIQ_ENV'))}/charges/`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${kelviqKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(chargeRequestBody(pack, userId)),
                }, 20_000);
                status = res.status;
                const text = await res.text().catch(() => '');
                try { body = text ? JSON.parse(text) : null; } catch { body = text; }
            } catch {
                status = null; // timeout / network: the card MAY have been charged
            }
            outcome = classifyChargeResponse(status, body);
        }
        const fin = await callRpc('finish_ai_auto_recharge', {
            p_attempt_id: attemptId,
            p_status: outcome.status,
            p_charge_id: outcome.status === 'succeeded' ? outcome.chargeId : null,
            p_detail: outcome.status === 'succeeded' ? null : outcome.detail,
            p_amount: outcome.status === 'succeeded' ? outcome.amount : null,
            p_currency: outcome.status === 'succeeded' ? outcome.currency : null,
        });
        log(`automatic top-up ${outcome.status}`, pack?.id || String(claim.data.pack), outcome.status === 'succeeded' ? '' : outcome.detail);
        if (!fin.ok) {
            // the attempt stays "pending": it blocks new charges and the Kelviq order webhook credits it later
            log('automatic top-up finish failed', fin.status || 'timeout', fin.text.slice(0, 200));
            return null;
        }
        return { status: String(fin.data?.status || outcome.status), balance: Math.max(0, Number(fin.data?.balance) || 0) };
    }

    /** GEMINI_THINKING_LEVEL (Gemini 3+), else the default. */
    const thinkingLevelOf = (): string => {
        const level = (env.get('GEMINI_THINKING_LEVEL') || '').trim().toUpperCase();
        return (THINKING_LEVELS as readonly string[]).includes(level) ? level : DEFAULT_THINKING_LEVEL;
    };

    async function callGemini(request: RouterRequest): Promise<{ output: ModelOutput; model: string }> {
        const thinkingLevel = thinkingLevelOf();

        const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];
        for (const m of request.history || []) {
            const role = m.role === 'assistant' ? 'model' : 'user';
            if (!contents.length && role === 'model') continue;
            const last = contents[contents.length - 1];
            if (last && last.role === role) last.parts[0].text = `${last.parts[0].text}\n${m.text}`;
            else contents.push({ role, parts: [{ text: m.text }] });
        }
        const userParts: Array<Record<string, unknown>> = [{ text: buildUserTurn(request) }];
        for (const img of request.images || []) userParts.push({ inlineData: { mimeType: img.mime_type, data: img.data } });
        if (contents.length && contents[contents.length - 1].role === 'user') contents.pop();
        contents.push({ role: 'user', parts: userParts });

        /**
         * Gemini 3+: thinkingLevel and the default temperature (Google: changing it can cause loops).
         * Gemini 2.x and aliases: thinkingBudget (still accepted by 3+ for backward compatibility) and a
         * low temperature. Never both thinking fields (that is a 400).
         */
        const makeBody = (model: string, opts: { thinking: boolean; compact: boolean }) => {
            const modern = geminiGeneration(model) >= 3;
            return JSON.stringify({
                systemInstruction: { parts: [{ text: buildSystemPrompt(request) }] },
                contents,
                generationConfig: {
                    responseMimeType: 'application/json',
                    // a drafting request with the user's price book: lines may name their item (price_book_ref)
                    responseSchema: buildResponseSchema(request.scope, { compact: opts.compact, priceBook: hasPriceBook(request), estimateOptions: requestHasEstimateOptions(request) }),
                    ...(modern ? {} : { temperature: 0.2 }),
                    maxOutputTokens: 16384,
                    ...(opts.thinking ? { thinkingConfig: modern ? { thinkingLevel } : { thinkingBudget: THINKING_BUDGET } } : {}),
                },
            });
        };
        const { output, model } = await generateJson(makeBody);
        return { output: output as unknown as ModelOutput, model };
    }

    /**
     * One JSON answer from the model chain (GEMINI_MODEL, then BACKUP_MODELS): busy models are retried with a short
     * backoff, a hanging or failing model hands over to the next one, a model that rejects the thinking setting or
     * the schema is asked again without it / with the compact schema. `makeBody` builds the request for one model.
     */
    async function generateJson(makeBody: (model: string, opts: { thinking: boolean; compact: boolean }) => string): Promise<{ output: Record<string, unknown>; model: string }> {
        const key = env.get('GEMINI_API_KEY') || '';
        if (!key) throw new HttpError(503, 'NOT_CONFIGURED', 'The AI assistant is not configured yet (missing model key).');
        const primary = (env.get('GEMINI_MODEL') || '').trim().replace(/^models\//, '') || DEFAULT_MODEL;
        const models = [...new Set([primary, ...BACKUP_MODELS])];
        const startedAt = Date.now();
        const remaining = () => limits.totalMs - (Date.now() - startedAt);
        const failures: FailureKind[] = [];

        models: for (const [index, model] of models.entries()) {
            const isLast = index === models.length - 1;
            const opts = { thinking: true, compact: false };
            let busyRetries = index === 0 ? BUSY_BACKOFF_MS.length : 1;
            let busyAttempt = 0;
            for (;;) {
                const left = remaining();
                if (left < limits.minAttemptMs) {
                    if (!failures.length) failures.push('timeout');
                    break models;
                }
                // A model that is not the last one gets at most ATTEMPT_TIMEOUT_MS, so a hanging model
                // (gemini-flash-latest hung for 100 s on 2026-11-13) leaves time for the next one.
                const budget = isLast ? left : Math.min(limits.attemptMs, left);
                let res: Response;
                try {
                    res = await fetchWithTimeout(f, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                        body: makeBody(model, opts),
                    }, budget);
                } catch (err) {
                    const aborted = err instanceof Error && err.name === 'AbortError';
                    log('model request failed', model, aborted ? `timeout after ${budget} ms` : String(err));
                    failures.push(aborted ? 'timeout' : 'unavailable');
                    continue models;
                }

                if (res.ok) {
                    const data = await res.json().catch(() => null) as Record<string, any> | null;
                    if (data?.promptFeedback?.blockReason) {
                        throw new HttpError(422, 'AI_BLOCKED', 'The AI could not answer that request. Please rephrase it.');
                    }
                    const candidate = data?.candidates?.[0];
                    const finish = String(candidate?.finishReason || '');
                    if (/SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(finish)) {
                        throw new HttpError(422, 'AI_BLOCKED', 'The AI could not answer that request. Please rephrase it.');
                    }
                    const text = (candidate?.content?.parts || [])
                        .filter((p: Record<string, unknown>) => typeof p?.text === 'string' && !p.thought)
                        .map((p: Record<string, unknown>) => p.text as string)
                        .join('');
                    const parsed = parseModelJson(text);
                    if (parsed) return { output: parsed, model };
                    const usage = data?.usageMetadata || {};
                    log('unparseable model output', model, finish,
                        `chars=${text.length} out=${usage.candidatesTokenCount ?? '?'} thoughts=${usage.thoughtsTokenCount ?? '?'} compact=${opts.compact} thinking=${opts.thinking}`,
                        text.slice(0, 160), '…', JSON.stringify(text.slice(-120)));
                    // Cut off (MAX_TOKENS), e.g. a long multi-step plan (2026-11-14: client + job + 3 documents ran
                    // out on gemini-3.5-flash-lite): ask the SAME fast model once more with the compact schema and no
                    // thinking before handing over to a slower model.
                    if (/MAX_TOKENS/.test(finish) && (!opts.compact || opts.thinking)) {
                        opts.compact = true;
                        opts.thinking = false;
                        continue;
                    }
                    // Not JSON: the next model may do better.
                    failures.push('bad_output');
                    continue models;
                }

                const status = res.status;
                const body = await res.text().catch(() => '');
                log('model error', model, status, body.slice(0, 300));

                // Bad API key: every model will refuse, stop here (the owner has to fix the secret).
                if ((status === 400 || status === 401 || status === 403) && /API_KEY_INVALID|API key not valid|API key expired/i.test(body)) {
                    throw new HttpError(503, 'NOT_CONFIGURED', 'The AI assistant is not set up correctly on the server. Please try again later.');
                }
                if (status === 400 && opts.thinking && /thinking/i.test(body)) {
                    opts.thinking = false; // this model does not take the thinking setting: same model without it
                    continue;
                }
                if (status === 400 && !opts.compact && /schema|too many states|nesting depth/i.test(body)) {
                    opts.compact = true; // schema too complex for this model: same model, smaller schema
                    continue;
                }
                const busy = status === 503 || status === 429 || (status >= 500 && /overloaded|high demand/i.test(body));
                if (busy) {
                    const asked = status === 429 ? retryDelayMs(body) : null;
                    const wait = asked ?? BUSY_BACKOFF_MS[Math.min(busyAttempt, BUSY_BACKOFF_MS.length - 1)] + Math.floor(Math.random() * 300);
                    if (busyRetries > 0 && wait <= MAX_BUSY_WAIT_MS && remaining() - wait >= limits.minAttemptMs) {
                        busyRetries--;
                        busyAttempt++;
                        log('model busy, retrying', model, `in ${wait} ms`);
                        await sleep(wait);
                        continue;
                    }
                    failures.push('busy');
                    continue models;
                }
                // 404 retired / "no longer available to new users", other 400s, 401/403, 500, 502, 504: next model.
                failures.push(status === 400 && opts.compact ? 'schema' : 'unavailable');
                continue models;
            }
        }
        log('all models failed', models.join(' > '), failures.join(','));
        const kind = FAILURE_PRIORITY.find(k => failures.includes(k)) || 'unavailable';
        const e = FAILURE_ERRORS[kind];
        throw new HttpError(e.status, e.code, e.message);
    }

    /** Photo tasks: the photos (each with its stage / time / caption line) in one user turn, own prompt and schema. */
    async function callGeminiPhotos(request: PhotoTaskRequest): Promise<{ output: Record<string, unknown>; model: string }> {
        const thinkingLevel = thinkingLevelOf();
        const contents = [{ role: 'user', parts: buildPhotoUserParts(request) }];
        const system = buildPhotoSystemPrompt(request);
        const makeBody = (model: string, opts: { thinking: boolean; compact: boolean }) => {
            const modern = geminiGeneration(model) >= 3;
            return JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents,
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: buildPhotoResponseSchema(request, { compact: opts.compact }),
                    ...(modern ? {} : { temperature: 0.3 }),
                    maxOutputTokens: 8192,
                    ...(opts.thinking ? { thinkingConfig: modern ? { thinkingLevel } : { thinkingBudget: THINKING_BUDGET } } : {}),
                },
            });
        };
        return generateJson(makeBody);
    }

    /** Estimate review: the compact estimate, the price-book slice and the checks already shown, own prompt and schema. */
    async function callGeminiReview(request: EstimateReviewRequest): Promise<{ output: Record<string, unknown>; model: string }> {
        const thinkingLevel = thinkingLevelOf();
        const contents = [{ role: 'user', parts: [{ text: buildReviewUserTurn(request) }] }];
        const system = buildReviewSystemPrompt(request);
        const makeBody = (model: string, opts: { thinking: boolean; compact: boolean }) => {
            const modern = geminiGeneration(model) >= 3;
            return JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents,
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: buildReviewResponseSchema({ compact: opts.compact }),
                    ...(modern ? {} : { temperature: 0.2 }),
                    maxOutputTokens: 4096,
                    ...(opts.thinking ? { thinkingConfig: modern ? { thinkingLevel } : { thinkingBudget: THINKING_BUDGET } } : {}),
                },
            });
        };
        return generateJson(makeBody);
    }

    /**
     * Configuration, burst guard, plan and rate limits for one request. Returns the plan facts, or the 402 response
     * to send (monthly limit reached, or a feature of a higher plan when `requiredTier` is set).
     * Order: the plan's monthly allowance → (AI credits on) a purchased credit, after an automatic top-up when the
     * balance is empty and it is switched on → 402 CREDITS_EMPTY (credits on) / PLAN_LIMIT (off or SQL missing).
     */
    async function admit(userId: string, cors: Record<string, string>, requiredTier?: 'ai', upgradeMessage: string = PHOTO_TASK_UPGRADE_MESSAGE): Promise<Admission | Response> {
        if (!serviceKey) throw new HttpError(503, 'NOT_CONFIGURED', 'The AI assistant is not configured on the server.');
        const nowDate = now();
        if (burstExceeded(userId, nowDate.getTime())) throw new HttpError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a few seconds.');
        const monthStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1)).toISOString();
        const minuteAgo = new Date(nowDate.getTime() - 60_000).toISOString();
        const perMinute = Number(env.get('AI_RATE_PER_MINUTE') || 10);
        const [tier, used, lastMinute] = await Promise.all([
            getTier(userId),
            countUsage(userId, monthStart),
            countUsage(userId, minuteAgo, creditsOn ? ['ai', 'ai_credit'] : ['ai']),
        ]);
        const limit = AI_MONTHLY_LIMITS[tier];
        if (requiredTier && tier !== requiredTier) {
            return json({ error: `PLAN_REQUIRED: ${upgradeMessage}`, code: 'PLAN_REQUIRED', tier, required: requiredTier }, 402, cors);
        }
        if (used >= limit) {
            if (creditsOn) {
                if (lastMinute >= perMinute) throw new HttpError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a minute.');
                const credits = await creditBalance(userId);
                if (credits !== null) {
                    if (credits > 0) return { tier, used, limit, payWith: 'credits', credits };
                    const recharge = await autoRecharge(userId);
                    if (recharge && recharge.balance > 0) return { tier, used, limit, payWith: 'credits', credits: recharge.balance };
                    const empty = await creditsEmptyError(userId, { tier, used, limit });
                    return json({ error: empty.message, code: empty.code, ...empty.extra }, 402, cors);
                }
            }
            const upgrade = tier === 'ai' ? 'Your allowance resets on the 1st of next month.' : 'Upgrade your plan to keep using the assistant this month.';
            return json({ error: `PLAN_LIMIT: You have used all ${limit} AI requests included in your plan this month. ${upgrade}`, code: 'PLAN_LIMIT', limit, used, tier }, 402, cors);
        }
        if (lastMinute >= perMinute) throw new HttpError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a minute.');
        return { tier, used, limit, payWith: 'plan' };
    }

    /** meta.usage of a successful answer (`credits` = balance left when the request was paid with a credit). */
    const usageMeta = (admission: Admission, spent: { credits?: number }) => admission.payWith === 'credits' || spent.credits !== undefined
        ? { used: admission.used, limit: admission.limit, tier: admission.tier, paid_with: 'credits' as const, ...(spent.credits !== undefined ? { credits: spent.credits } : {}) }
        : { used: admission.used + 1, limit: admission.limit, tier: admission.tier };

    /**
     * "Write client update" / "AI walkthrough" from job photos (Premium + AI). Metered as one AI request, only when
     * the answer is usable and the browser is still waiting.
     *   photo_update      → { ok, task, update: { subject, message, decision } }
     *   photo_walkthrough → { ok, task, proposal } (GENERATE_DOCUMENT, Daily Job Report or Note, for the open job)
     */
    async function handlePhotoTask(req: Request, userId: string, body: unknown, cors: Record<string, string>): Promise<Response> {
        const request = sanitizePhotoTaskRequest(body);
        const admission = await admit(userId, cors, PHOTO_TASK_TIER);
        if (admission instanceof Response) return admission;

        const provider = (env.get('AI_PROVIDER') || 'gemini').toLowerCase() === 'mock' ? 'mock' : 'gemini';
        const { output, model } = provider === 'mock'
            ? { output: mockPhotoTaskOutput(request), model: 'mock' }
            : await callGeminiPhotos(request);
        let payload: Record<string, unknown>;
        if (request.task === 'photo_update') {
            const update = parsePhotoUpdate(output);
            if (!update) {
                log('photo update without a usable message', model);
                throw new HttpError(FAILURE_ERRORS.bad_output.status, FAILURE_ERRORS.bad_output.code, FAILURE_ERRORS.bad_output.message);
            }
            payload = { update };
        } else {
            const proposal = buildWalkthroughProposal(output, request);
            if (proposal.action_type !== 'GENERATE_DOCUMENT') {
                log('walkthrough without a document', model, proposal.action_type);
                throw new HttpError(FAILURE_ERRORS.bad_output.status, FAILURE_ERRORS.bad_output.code, FAILURE_ERRORS.bad_output.message);
            }
            payload = { proposal };
        }
        if (req.signal?.aborted) {
            log('client went away before the answer; not metered');
            return json({ error: 'The request was cancelled.', code: 'CANCELLED' }, 499, cors);
        }
        const spent = await recordUsage(userId, admission);
        return json({ ok: true, task: request.task, ...payload, meta: { provider, model, usage: usageMeta(admission, spent) } }, 200, cors);
    }

    /**
     * "Review estimate" AI check (Premium + AI). Metered as one AI request, only when the answer has a findings list
     * (an empty list is a valid answer: nothing missing) and the browser is still waiting.
     *   estimate_review → { ok, task, review: { findings } }
     */
    async function handleEstimateReview(req: Request, userId: string, body: unknown, cors: Record<string, string>): Promise<Response> {
        const request = sanitizeEstimateReviewRequest(body);
        const admission = await admit(userId, cors, ESTIMATE_REVIEW_TIER, ESTIMATE_REVIEW_UPGRADE_MESSAGE);
        if (admission instanceof Response) return admission;

        const provider = (env.get('AI_PROVIDER') || 'gemini').toLowerCase() === 'mock' ? 'mock' : 'gemini';
        const { output, model } = provider === 'mock'
            ? { output: mockEstimateReviewOutput(request), model: 'mock' }
            : await callGeminiReview(request);
        const findings = parseReviewFindings(output, request);
        if (!findings) {
            log('estimate review without a findings list', model);
            throw new HttpError(FAILURE_ERRORS.bad_output.status, FAILURE_ERRORS.bad_output.code, FAILURE_ERRORS.bad_output.message);
        }
        if (req.signal?.aborted) {
            log('client went away before the answer; not metered');
            return json({ error: 'The request was cancelled.', code: 'CANCELLED' }, 499, cors);
        }
        const spent = await recordUsage(userId, admission);
        return json({ ok: true, task: request.task, review: { findings }, meta: { provider, model, usage: usageMeta(admission, spent) } }, 200, cors);
    }

    return async function handle(req: Request): Promise<Response> {
        const cors = corsHeaders(req, env);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (req.method !== 'POST') return json({ error: 'Method not allowed.', code: 'METHOD' }, 405, cors);
        try {
            const user = await getUser(req);

            const declared = Number(req.headers.get('content-length') || 0);
            if (declared > REQUEST_LIMITS.bodyBytes) throw new HttpError(413, 'TOO_LARGE', 'That request is too large. Attach fewer or smaller photos.');
            const raw = await req.text();
            if (raw.length > REQUEST_LIMITS.bodyBytes) throw new HttpError(413, 'TOO_LARGE', 'That request is too large. Attach fewer or smaller photos.');
            let body: unknown;
            try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'BAD_REQUEST', 'Request body must be JSON.'); }
            if (isPhotoTaskBody(body)) return await handlePhotoTask(req, user.id, body, cors);
            if (isEstimateReviewBody(body)) return await handleEstimateReview(req, user.id, body, cors);
            const request = sanitizeRequest(body);

            const admission = await admit(user.id, cors);
            if (admission instanceof Response) return admission;

            const provider = (env.get('AI_PROVIDER') || 'gemini').toLowerCase() === 'mock' ? 'mock' : 'gemini';
            let { output, model } = provider === 'mock'
                ? { output: mockModelOutput(request), model: 'mock' }
                : await callGemini(request);
            // "Fill the form" with sample / test / random data must never end in a refusal: when the model
            // answers without filling anything, the built-in sample document of this form type is used.
            if (request.scope === 'form' && isSampleRequest([...(request.history || []).filter(h => h.role === 'user').map(h => h.text), request.message].join('\n'))) {
                const filled = output?.action_type === 'GENERATE_DOCUMENT'
                    && ((Array.isArray(output.fields) && output.fields.length > 0) || (Array.isArray(output.line_items) && output.line_items.length > 0));
                if (!filled) {
                    log('form sample request answered without fields; using the sample document', model, String(output?.action_type || ''));
                    output = mockModelOutput(request);
                    model = `${model}+sample`;
                }
            }

            const proposal = buildProposal(output, { request });
            // Only an answer the user actually receives is metered: when the browser already gave up
            // (panel closed, Cancel, its own timeout) the request does not count.
            if (req.signal?.aborted) {
                log('client went away before the answer; not metered');
                return json({ error: 'The request was cancelled.', code: 'CANCELLED' }, 499, cors);
            }
            const spent = await recordUsage(user.id, admission);
            const response: RouterResponse = { ok: true, proposal, meta: { provider, model, usage: usageMeta(admission, spent) } };
            return json(response, 200, cors);
        } catch (err) {
            if (err instanceof HttpError) return json({ error: err.message, code: err.code, ...(err.extra || {}) }, err.status, cors);
            if (err instanceof RouterInputError) return json({ error: err.message, code: err.code }, err.status, cors);
            log('unexpected error', err instanceof Error ? err.stack || err.message : String(err));
            return json({ error: 'The AI assistant hit an unexpected error. Please try again.', code: 'INTERNAL' }, 500, cors);
        }
    };
}
