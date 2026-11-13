/**
 * master-ai-router request handler (runtime-agnostic: only web-standard APIs, so it runs in
 * Deno and can be exercised from Node tests with a fake fetch).
 *
 * Pipeline: CORS → JWT (real signed-in user only) → input limits → plan limit + rate limit
 * (usage_events, service role) → model (Gemini JSON mode with responseSchema, or the mock)
 * → robust parse → buildProposal (validation/normalization) → meter usage → JSON response.
 */
import {
    buildProposal, buildResponseSchema, parseModelJson, RouterInputError, sanitizeRequest,
    type ModelOutput, type RouterRequest, type RouterResponse,
} from './shared/routerContract.ts';
import { buildSystemPrompt, buildUserTurn } from './shared/prompt.ts';
import { mockModelOutput } from './shared/mockModel.ts';
import { REQUEST_LIMITS } from './shared/routerContract.ts';

export interface RouterEnv { get(name: string): string | undefined }
export interface HandlerDeps {
    fetch: typeof fetch;
    now?: () => Date;
    log?: (...args: unknown[]) => void;
}

/** Monthly AI requests per plan. Keep in sync with lib/plans.ts (FREE_LIMITS.ai, PAID_AI_LIMITS). */
export const AI_MONTHLY_LIMITS: Record<'free' | 'premium' | 'ai', number> = { free: 15, premium: 60, ai: 600 };

const DEFAULT_MODEL = 'gemini-flash-latest';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const MODEL_TIMEOUT_MS = 30_000;

class HttpError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
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
    const log = deps.log || ((...a: unknown[]) => console.error('[master-ai-router]', ...a));

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

    async function countUsage(userId: string, sinceIso: string): Promise<number> {
        const url = `${supabaseUrl}/rest/v1/usage_events?select=id&user_id=eq.${encodeURIComponent(userId)}&kind=eq.ai&created_at=gte.${encodeURIComponent(sinceIso)}`;
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
     * Records one AI request. Prefers the atomic `consume_usage` RPC (locks the profile row, re-checks
     * the limit, updates ai_credits_used); falls back to a plain insert when the RPC does not exist.
     * Only successful answers are metered. Throws PLAN_LIMIT when parallel requests crossed the limit.
     */
    async function recordUsage(userId: string): Promise<void> {
        const rpc = await fetchWithTimeout(f, `${supabaseUrl}/rest/v1/rpc/consume_usage`, {
            method: 'POST',
            headers: { ...restHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_user_id: userId, p_kind: 'ai', p_count: 1 }),
        }, 8000).catch(() => null);
        if (rpc?.ok) return;
        const text = rpc ? await rpc.text().catch(() => '') : '';
        if (/PLAN_LIMIT/.test(text)) {
            throw new HttpError(402, 'PLAN_LIMIT', 'PLAN_LIMIT: You have used all AI requests included in your plan this month. Upgrade your plan to keep using the assistant.');
        }
        const res = await fetchWithTimeout(f, `${supabaseUrl}/rest/v1/usage_events`, {
            method: 'POST',
            headers: { ...restHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ user_id: userId, kind: 'ai' }),
        }, 8000).catch(() => null);
        if (!res || !res.ok) log('usage insert failed', rpc?.status, text.slice(0, 200), res?.status);
    }

    async function callGemini(request: RouterRequest): Promise<{ output: ModelOutput; model: string }> {
        const key = env.get('GEMINI_API_KEY') || '';
        if (!key) throw new HttpError(503, 'NOT_CONFIGURED', 'The AI assistant is not configured yet (missing model key).');
        const primary = (env.get('GEMINI_MODEL') || DEFAULT_MODEL).trim();
        const models = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];

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

        const body = JSON.stringify({
            systemInstruction: { parts: [{ text: buildSystemPrompt(request) }] },
            contents,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: buildResponseSchema(request.scope),
                temperature: 0.2,
                maxOutputTokens: 8192,
            },
        });

        let lastError = '';
        for (const model of models) {
            let res: Response;
            try {
                res = await fetchWithTimeout(f, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                    body,
                }, MODEL_TIMEOUT_MS);
            } catch (err) {
                const aborted = err instanceof Error && err.name === 'AbortError';
                log('model request failed', model, aborted ? 'timeout' : String(err));
                if (aborted) throw new HttpError(504, 'AI_TIMEOUT', 'The AI took too long to answer. Please try again.');
                lastError = 'network';
                continue;
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                log('model error', model, res.status, text.slice(0, 300));
                lastError = `${res.status}`;
                const modelProblem = res.status === 404 || (res.status === 400 && /model|not found|not supported|unsupported|invalid argument/i.test(text));
                if (modelProblem || res.status >= 500) continue;
                if (res.status === 429) throw new HttpError(503, 'AI_BUSY', 'The AI service is busy right now. Please try again in a minute.');
                throw new HttpError(502, 'AI_UPSTREAM', 'The AI service returned an error. Please try again.');
            }
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
            if (!parsed) {
                log('unparseable model output', model, finish, text.slice(0, 200));
                throw new HttpError(502, 'AI_BAD_OUTPUT', 'The AI returned an answer I could not read. Please try again.');
            }
            return { output: parsed as unknown as ModelOutput, model };
        }
        throw new HttpError(502, 'AI_UPSTREAM', `The AI service is unavailable right now (${lastError || 'unknown'}). Please try again later.`);
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
            const request = sanitizeRequest(body);

            if (!serviceKey) throw new HttpError(503, 'NOT_CONFIGURED', 'The AI assistant is not configured on the server.');
            const nowDate = now();
            if (burstExceeded(user.id, nowDate.getTime())) throw new HttpError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a few seconds.');
            const monthStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1)).toISOString();
            const minuteAgo = new Date(nowDate.getTime() - 60_000).toISOString();
            const perMinute = Number(env.get('AI_RATE_PER_MINUTE') || 10);
            const [tier, used, lastMinute] = await Promise.all([
                getTier(user.id),
                countUsage(user.id, monthStart),
                countUsage(user.id, minuteAgo),
            ]);
            const limit = AI_MONTHLY_LIMITS[tier];
            if (used >= limit) {
                const upgrade = tier === 'ai' ? 'Your allowance resets on the 1st of next month.' : 'Upgrade your plan to keep using the assistant this month.';
                return json({ error: `PLAN_LIMIT: You have used all ${limit} AI requests included in your plan this month. ${upgrade}`, code: 'PLAN_LIMIT', limit, used, tier }, 402, cors);
            }
            if (lastMinute >= perMinute) throw new HttpError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a minute.');

            const provider = (env.get('AI_PROVIDER') || 'gemini').toLowerCase() === 'mock' ? 'mock' : 'gemini';
            const { output, model } = provider === 'mock'
                ? { output: mockModelOutput(request), model: 'mock' }
                : await callGemini(request);

            const proposal = buildProposal(output, { request });
            await recordUsage(user.id);
            const response: RouterResponse = { ok: true, proposal, meta: { provider, model, usage: { used: used + 1, limit, tier } } };
            return json(response, 200, cors);
        } catch (err) {
            if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status, cors);
            if (err instanceof RouterInputError) return json({ error: err.message, code: err.code }, err.status, cors);
            log('unexpected error', err instanceof Error ? err.stack || err.message : String(err));
            return json({ error: 'The AI assistant hit an unexpected error. Please try again.', code: 'INTERNAL' }, 500, cors);
        }
    };
}
