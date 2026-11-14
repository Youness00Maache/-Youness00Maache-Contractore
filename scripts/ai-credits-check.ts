/**
 * AI credit top-ups (pure logic + edge-function handlers with fakes; no network, no database):
 *   npx tsx scripts/ai-credits-check.ts
 *
 *  1. packs and pricing (minimum $5, credits per dollar, margin vs the plans and the model cost, Kelviq fees)
 *  2. ledger math: balance, refunds (proportional, capped, never below zero), automatic top-up due, charge outcomes
 *  3. the DRAFT SQL (supabase/migrations/20261114000200_ai_credits.sql): same numbers as the code, additive only, RLS read-own,
 *     service-role-only functions, idempotency keys, nothing applied (it is not in supabase/migrations)
 *  4. kelviq-webhook routing: credit packs never reach the subscription handler; refunds fall back when the SQL is missing
 *  5. kelviq-checkout credit actions: flag off, SQL missing, one-time checkout body, settings validation
 *  6. ai-assistant admit(): plan allowance → credits → 402 CREDITS_EMPTY; automatic top-up; races; flag off = old behaviour
 *  7. app pieces: status normalization, UI renders nothing while off, panel/limit wiring, help + knowledge
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
    AI_CREDIT_PACKS, AUTO_RECHARGE, MIN_CREDIT_PURCHASE_USD, aiCreditsEnabled, autoRechargeDue, chargeRequestBody, classifyChargeResponse,
    creditsBuyInfo, creditsEmptyMessage, isCreditPackPlan, kelviqApiBase, ledgerBalance, packById, pricePerRequest, refundCreditsFor,
    refundTake, routeKelviqEvent, type LedgerEntry,
} from '../supabase/functions/_shared/aiCredits.ts';
import { applyKelviqWebhookEvent } from '../supabase/functions/kelviq-webhook/route.ts';
import { handleCreditsAction, isCreditsAction, type CreditsContext } from '../supabase/functions/kelviq-checkout/credits.ts';
import { AI_MONTHLY_LIMITS, createHandler } from '../supabase/functions/ai-assistant/handler.ts';
import { AI_CREDIT_PACK_FACTS, KNOWLEDGE } from '../supabase/functions/ai-assistant/shared/knowledge.ts';
import { DISABLED_STATUS, isCreditsCheckoutReturn, lastRechargeNote, normalizeCreditsStatus } from '../lib/aiCredits.ts';
import { AICreditsRow, AICreditsStrip, BuyCreditsButton, PackPicker } from '../components/billing/AICredits.tsx';
import { isAiLimitCode } from '../src/ai/events.ts';
import { FREE_LIMITS, PAID_AI_LIMITS, PLANS } from '../lib/plans.ts';
import { HELP_GUIDES } from '../components/help/helpContent.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => {
    if (ok) passed++;
    else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
};
const eq = (name: string, actual: unknown, expected: unknown) => check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });

// ───────────────────────────── 1. packs + pricing ─────────────────────────────
{
    eq('four packs: $5, $10, $20, $50', AI_CREDIT_PACKS.map(p => p.price), [5, 10, 20, 50]);
    eq('minimum purchase is $5', [MIN_CREDIT_PURCHASE_USD, Math.min(...AI_CREDIT_PACKS.map(p => p.price))], [5, 5]);
    check('pack ids are ai-credits-<price>', AI_CREDIT_PACKS.every(p => p.id === `ai-credits-${p.price}`));
    check('ids unique', new Set(AI_CREDIT_PACKS.map(p => p.id)).size === AI_CREDIT_PACKS.length);
    check('at least 20 credits per dollar on every pack', AI_CREDIT_PACKS.every(p => p.credits / p.price >= 20));
    check('bigger packs never cost more per request', AI_CREDIT_PACKS.every((p, i) => i === 0 || pricePerRequest(p) <= pricePerRequest(AI_CREDIT_PACKS[i - 1])));
    // the plan stays the better deal for steady use (no reason to downgrade and buy credits instead)
    const aiPlanPerRequest = PLANS.ai.monthlyPrice / PAID_AI_LIMITS.ai;
    check('every pack costs more per request than Premium + AI', AI_CREDIT_PACKS.every(p => pricePerRequest(p) > aiPlanPerRequest * 2), { aiPlanPerRequest });
    eq('handler limits = lib/plans.ts', AI_MONTHLY_LIMITS, { free: FREE_LIMITS.ai, premium: PAID_AI_LIMITS.premium, ai: PAID_AI_LIMITS.ai });
    // profitable after Kelviq fees (2.9% + $0.40 + 1.5% international) at a worst-case $0.01 per request
    const WORST_COST = 0.01;
    for (const p of AI_CREDIT_PACKS) {
        const net = p.price - (p.price * (0.029 + 0.015) + 0.40);
        const margin = (net - p.credits * WORST_COST) / p.price;
        check(`${p.id}: margin after fees ≥ 60% at $0.01/request`, margin >= 0.6, { net: +net.toFixed(2), margin: +margin.toFixed(2) });
    }
    eq('packById is case/space tolerant and rejects others', [packById(' AI-CREDITS-10 ')?.credits, packById('premium'), packById(undefined)], [220, null, null]);
    eq('isCreditPackPlan', [isCreditPackPlan('ai-credits-50'), isCreditPackPlan('premium-ai'), isCreditPackPlan('ai-credits-7')], [true, false, false]);
    eq('flag parsing', ['true', 'TRUE', '1', 'on', 'yes', 'false', '', undefined, 'enabled'].map(v => aiCreditsEnabled(() => v)), [true, true, true, true, true, false, false, false, false]);
    eq('auto-recharge defaults are valid choices', [AUTO_RECHARGE.thresholds.includes(AUTO_RECHARGE.defaultThreshold as 20), Boolean(packById(AUTO_RECHARGE.defaultPack))], [true, true]);
    eq('Kelviq API base follows KELVIQ_ENV', [kelviqApiBase(undefined), kelviqApiBase('sandbox'), kelviqApiBase('LIVE')],
        ['https://api.kelviq.com/api/v1', 'https://sandboxapi.kelviq.com/api/v1', 'https://api.kelviq.com/api/v1']);
    eq('off-session charge body (one-time plan, our user id as customerId)', chargeRequestBody(packById('ai-credits-20')!, 'u-1'),
        { planIdentifier: 'ai-credits-20', chargePeriod: 'ONE_TIME', customerId: 'u-1' });
}

// ───────────────────────────── 2. ledger math ─────────────────────────────
{
    const ledger: LedgerEntry[] = [
        { delta: 100, reason: 'purchase', sourceKey: 'checkout:cs_1' },
        { delta: -1, reason: 'usage' }, { delta: -1, reason: 'usage' },
        { delta: 220, reason: 'purchase', sourceKey: 'charge:ch_1' },
        { delta: -50, reason: 'refund', sourceKey: 'refund:r_1' },
    ];
    eq('balance = sum of the ledger', ledgerBalance(ledger), 268);
    eq('empty ledger = 0', ledgerBalance([]), 0);
    // idempotent crediting: the same source key is only counted once (mirrors the UNIQUE source_key + on conflict do nothing)
    const applyOnce = (rows: LedgerEntry[], row: LedgerEntry) => rows.some(r => r.sourceKey && r.sourceKey === row.sourceKey) ? rows : [...rows, row];
    let replay: LedgerEntry[] = [];
    for (const k of ['checkout:cs_9', 'checkout:cs_9', 'charge:c1', 'checkout:cs_9', 'charge:c1']) replay = applyOnce(replay, { delta: 100, reason: 'purchase', sourceKey: k });
    eq('replayed webhooks / finish calls credit once per source key', ledgerBalance(replay), 200);

    const order = { credits: 220, amountUnits: 1000, refundedCredits: 0 };
    eq('half refund = half the credits', refundCreditsFor(order, 500), 110);
    eq('full refund flag = everything left', refundCreditsFor({ ...order, refundedCredits: 110 }, null, true), 110);
    eq('refund never exceeds what is left on the order', refundCreditsFor({ ...order, refundedCredits: 200 }, 1000), 20);
    eq('unknown amounts = everything left', [refundCreditsFor({ credits: 100, amountUnits: null }, 300), refundCreditsFor({ credits: 100, amountUnits: 500 }, null)], [100, 100]);
    eq('rounding matches SQL round()', [refundCreditsFor({ credits: 100, amountUnits: 500 }, 1), refundCreditsFor({ credits: 100, amountUnits: 500 }, 3)], [0, 1]);
    eq('negative refund amounts take nothing', refundCreditsFor(order, -50), 0);
    eq('refund takes at most the balance (used credits stay used)', [refundTake(220, 500), refundTake(220, 30), refundTake(220, 0), refundTake(220, -5)], [220, 30, 0, 0]);

    eq('auto top-up due only when on and below the threshold', [
        autoRechargeDue({ autoRecharge: true, threshold: 20 }, 19), autoRechargeDue({ autoRecharge: true, threshold: 20 }, 20),
        autoRechargeDue({ autoRecharge: false, threshold: 20 }, 0), autoRechargeDue(null, 0),
    ], [true, false, false, false]);

    eq('201 with id = paid', classifyChargeResponse(201, { id: 'ch_1', amount: '10.00', currency: 'USD', status: 'active' }),
        { status: 'succeeded', chargeId: 'ch_1', amount: 10, currency: 'USD' });
    eq('400 decline = failed with Kelviq detail', classifyChargeResponse(400, { detail: 'A payment method is required to complete this payment.' }),
        { status: 'failed', detail: 'A payment method is required to complete this payment.' });
    eq('other 4xx = failed (not charged)', classifyChargeResponse(401, null).status, 'failed');
    eq('no answer = unclear (never retried blindly)', classifyChargeResponse(null, null).status, 'unclear');
    eq('5xx = unclear', classifyChargeResponse(502, 'bad gateway').status, 'unclear');
    eq('2xx without id = unclear', classifyChargeResponse(200, { status: 'active' }).status, 'unclear');

    const msgFree = creditsEmptyMessage('free', 15);
    const msgAi = creditsEmptyMessage('ai', 600);
    check('CREDITS_EMPTY message keeps the PLAN_LIMIT: prefix (old clients still show the upgrade)', msgFree.startsWith('PLAN_LIMIT: ') && msgAi.startsWith('PLAN_LIMIT: '));
    check('messages mention buying credits; AI plan mentions the reset', /Buy AI credits \(from \$5\)/.test(msgFree) && /upgrade/i.test(msgFree) && /1st/.test(msgAi) && !/upgrade/i.test(msgAi));
    const info = creditsBuyInfo(0, { enabled: true, lastStatus: 'failed', lastDetail: 'declined' });
    eq('buy info: packs, in-app path, auto state', [info.packs.length, info.buy_path, info.auto_recharge], [4, '/settings#billing', { enabled: true, last_status: 'failed', last_detail: 'declined' }]);
}

// ───────────────────────────── 3. DRAFT SQL ─────────────────────────────
{
    const sqlPath = 'supabase/migrations/20261114000200_ai_credits.sql';
    const sql = read(sqlPath);
    const code = sql.replace(/--[^\n]*/g, ''); // statements only (the header and the rollback are comments)
    // Applied 2026-11-14 with the owner's OK: exactly one migration holds it.
    check('the SQL is one applied migration', readdirSync(join(root, 'supabase/migrations')).filter(f => /ai_credits/i.test(f)).length === 1);
    check('header records the owner-approved apply', /Applied 2026-11-14 with the owner's OK/.test(sql));

    const sqlPacks = Object.fromEntries(Array.from(code.matchAll(/when '(ai-credits-\d+)'\s+then (\d+)/g), m => [m[1], Number(m[2])]));
    eq('SQL pack sizes = code', sqlPacks, Object.fromEntries(AI_CREDIT_PACKS.map(p => [p.id, p.credits])));
    eq('knowledge pack facts = code', AI_CREDIT_PACK_FACTS.map(p => [p.id, p.price, p.credits]), AI_CREDIT_PACKS.map(p => [p.id, p.price, p.credits]));
    check('SQL threshold range = code', code.includes(`threshold between ${AUTO_RECHARGE.minThreshold} and ${AUTO_RECHARGE.maxThreshold}`) && code.includes(`p_threshold < ${AUTO_RECHARGE.minThreshold} or p_threshold > ${AUTO_RECHARGE.maxThreshold}`));
    check('SQL defaults = code', code.includes(`threshold     integer not null default ${AUTO_RECHARGE.defaultThreshold}`) && code.includes(`default '${AUTO_RECHARGE.defaultPack}'`));
    check(`SQL daily cap = ${AUTO_RECHARGE.maxPerDay}`, new RegExp(`status = 'succeeded' and started_at > now\\(\\) - interval '24 hours'\\) >= ${AUTO_RECHARGE.maxPerDay}`).test(code));
    check(`SQL pauses after an unclear charge for ${AUTO_RECHARGE.unclearPauseHours} h`, code.includes(`status in ('pending', 'unclear')`) && code.includes(`interval '${AUTO_RECHARGE.unclearPauseHours} hours'`));

    // additive only: no existing object is altered, replaced, dropped or written
    const existingFns = ['apply_kelviq_event', '_consume_usage', 'consume_usage', 'consume_ai_credit', 'record_usage', 'get_my_usage', 'plan_limits', 'effective_tier', 'kelviq_plan_tier', '_kelviq_uuid'];
    eq('no existing function is replaced', existingFns.filter(fn => new RegExp(`create or replace function public\\.${fn}\\(`).test(code)), []);
    check('no ALTER of existing tables, no DROP statements', !/alter table public\.(profiles|usage_events|billing_events)/.test(code) && !/^\s*drop\s+(table|function|view)/im.test(code));
    check('profiles are never written (only row-locked)', !/update public\.profiles|insert into public\.profiles|delete from public\.profiles/.test(code));
    check('new tables only (create table if not exists)', Array.from(code.matchAll(/create table (if not exists )?public\.(\w+)/g)).every(m => m[1] && /^ai_credit_/.test(m[2])));

    // RLS: read own; only the service role writes
    const tables = ['ai_credit_ledger', 'ai_credit_settings', 'ai_credit_recharges', 'ai_credit_orders'];
    check('RLS enabled on every new table', tables.every(t => new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(code)));
    const policies = Array.from(code.matchAll(/create policy (\w+) on public\.(\w+) for (\w+) to (\w+)/g));
    eq('one policy per table: SELECT own rows for authenticated', policies.map(p => [p[2], p[3], p[4]]), tables.map(t => [t, 'select', 'authenticated']));
    check('every policy is user_id = auth.uid()', (code.match(/using \(user_id = \(select auth\.uid\(\)\)\)/g) || []).length === 4);
    check('browser roles cannot write', /revoke insert, update, delete, truncate on public\.ai_credit_ledger, public\.ai_credit_settings, public\.ai_credit_recharges,\s+public\.ai_credit_orders from authenticated/.test(code)
        && /revoke all on public\.ai_credit_ledger[\s\S]*?from anon/.test(code));
    check('balance view runs with the caller\'s RLS', /create or replace view public\.ai_credit_balances with \(security_invoker = true\)/.test(code));

    // functions: server only, safe search_path
    const fnDefs = Array.from(code.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$;/g));
    const fnNames = fnDefs.map(m => m[1]);
    check('functions defined', fnNames.length >= 12, fnNames);
    eq('every function sets search_path = \'\'', fnDefs.filter(m => !/set search_path = ''/.test(m[0])).map(m => m[1]), []);
    eq('every function is revoked from public/anon/authenticated', fnNames.filter(n => !new RegExp(`revoke all on function public\\.${n}\\([^)]*\\)\\s+from public, anon, authenticated`).test(code)), []);
    check('no function is granted to anon/authenticated', !/grant execute on function public\.\w+\([^)]*\)\s+to [^;]*(anon|authenticated)/.test(code));
    check('internal helpers are not granted at all', ['_ai_credit_add', '_ai_credit_refund', '_ai_credit_match_recharge'].every(n => !new RegExp(`grant execute on function public\\.${n}\\(`).test(code)));
    check('webhook / spend / claim / finish / status / settings granted to service_role', ['apply_ai_credit_event', 'spend_ai_credit', 'claim_ai_auto_recharge', 'finish_ai_auto_recharge', 'ai_credit_status', 'set_ai_credit_settings', 'ai_credit_balance']
        .every(n => new RegExp(`grant execute on function public\\.${n}\\([^)]*\\)\\s+to service_role`).test(code)));

    // idempotency + atomicity
    check('ledger source_key is UNIQUE; purchases/refunds require it', /source_key\s+text unique/.test(code) && /check \(reason = 'usage' or source_key is not null\)/.test(code));
    check('ledger rows are inserted with on conflict (source_key) do nothing', /on conflict \(source_key\) do nothing/.test(code));
    check('webhook events deduplicated by billing_events id (like apply_kelviq_event)', /insert into public\.billing_events as be[\s\S]*?on conflict \(id\) do update set attempts = be\.attempts \+ 1/.test(code)
        && /v_prev <> 'received' then\s+return jsonb_build_object\('status', 'duplicate'/.test(code));
    check('checkout credited once per checkout session (checkout:<id>)', /'checkout:' \|\| coalesce\(nullif\(v_obj->>'id', ''\), v_id\)/.test(code));
    check('automatic top-up credited once per charge id (charge:<id>)', /'charge:' \|\| v_charge/.test(code) && /charge_id\s+text unique/.test(code));
    check('spend locks the profile row and refuses at zero with CREDITS_EMPTY', /spend_ai_credit[\s\S]*?for update;[\s\S]*?if v_balance < 1 then\s+raise exception 'CREDITS_EMPTY/.test(code));
    check('claim is serialized per user (settings row lock) and blocks while a charge is in flight or unclear', /claim_ai_auto_recharge[\s\S]*?ai_credit_settings where user_id = p_user_id for update/.test(code));
    check('a refused card switches automatic top-up off', /p_status = 'failed'[\s\S]*?set auto_recharge = false/.test(code));
    check('refunds counted once per refund id (order.refunds map)', /if v_o\.refunds \? p_refund_key then return/.test(code));
    check('a refund never takes more than the balance', /v_take := least\(v_target, greatest\(v_balance, 0\)\)/.test(code));
    check('enabling auto top-up needs a first purchase', /AUTO_RECHARGE_NEEDS_PURCHASE/.test(code));
    check('test deliveries have no side effects', /if v_test then[\s\S]*?status = 'test'/.test(code));
    check('error codes match the edge functions', /CREDITS_EMPTY/.test(read('supabase/functions/ai-assistant/handler.ts')) && /AUTO_RECHARGE_NEEDS_PURCHASE/.test(read('supabase/functions/kelviq-checkout/credits.ts')) && /AI_CREDITS_INVALID/.test(read('supabase/functions/kelviq-checkout/credits.ts')));
    check('every RPC the edge functions call exists in the SQL',
        ['ai_credit_balance', 'ai_credit_status', 'spend_ai_credit', 'claim_ai_auto_recharge', 'finish_ai_auto_recharge', 'set_ai_credit_settings', 'apply_ai_credit_event'].every(n => fnNames.includes(n)));
    check('RPC argument names match the SQL', /p_attempt_id uuid, p_status text, p_charge_id text default null, p_detail text default null,\s+p_amount numeric default null, p_currency text default null/.test(code)
        && /set_ai_credit_settings\(p_user_id uuid, p_auto_recharge boolean, p_threshold integer, p_pack text\)/.test(code));
}

// ───────────────────────────── 4. webhook routing ─────────────────────────────
type RpcCall = { fn: string; args: Record<string, unknown> };
const fakeRpc = (missing: string[] = [], fail: Record<string, string> = {}) => {
    const calls: RpcCall[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (missing.includes(fn)) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}(p_event) in the schema cache` } };
        if (fail[fn]) return { data: null, error: { code: 'XX000', message: fail[fn] } };
        return { data: { status: 'processed' }, error: null };
    };
    return { rpc, calls };
};
const ev = (type: string, plan?: string, extra: Record<string, unknown> = {}) => ({ id: `evt_${type}_${plan || ''}`, type, created_at: '2026-11-14T10:00:00Z', data: { object: { ...(plan ? { plan: { identifier: plan } } : {}), ...extra } } });
async function webhookTests() {
    eq('route: credit checkout', routeKelviqEvent(ev('checkout.completed', 'ai-credits-10')), 'credits');
    eq('route: credit order.refunded', routeKelviqEvent(ev('order.refunded', 'ai-credits-5')), 'credits');
    eq('route: subscription checkout', routeKelviqEvent(ev('checkout.completed', 'premium')), 'subscription');
    eq('route: subscription order.refunded', routeKelviqEvent(ev('order.refunded', 'premium-ai')), 'subscription');
    eq('route: refund.created', routeKelviqEvent(ev('refund.created', undefined, { order_id: 'ORD-1' })), 'refund');
    eq('route: junk', [routeKelviqEvent(null), routeKelviqEvent({ type: 5 })], ['subscription', 'subscription']);

    {
        const f = fakeRpc();
        const r = await applyKelviqWebhookEvent(ev('subscription.updated', 'premium'), f.rpc);
        eq('subscription events → apply_kelviq_event only (unchanged)', [r.fn, f.calls.map(c => c.fn)], ['apply_kelviq_event', ['apply_kelviq_event']]);
    }
    {
        const f = fakeRpc();
        const event = ev('checkout.completed', 'ai-credits-20');
        const r = await applyKelviqWebhookEvent(event, f.rpc);
        eq('credit checkout → apply_ai_credit_event only', [r.fn, f.calls.map(c => c.fn), r.error], ['apply_ai_credit_event', ['apply_ai_credit_event'], null]);
        eq('the whole signed event is passed', f.calls[0].args, { p_event: event });
    }
    {
        const f = fakeRpc(['apply_ai_credit_event']);
        const r = await applyKelviqWebhookEvent(ev('order.refunded', 'ai-credits-10', { status: 'REFUNDED' }), f.rpc);
        eq('credit-pack refund NEVER reaches the subscription handler (SQL missing → 500, Kelviq retries)', [f.calls.map(c => c.fn), Boolean(r.error)], [['apply_ai_credit_event'], true]);
    }
    {
        const f = fakeRpc();
        const r = await applyKelviqWebhookEvent(ev('refund.created', undefined, { order_id: 'ORD-7' }), f.rpc);
        eq('refund.* → credits handler when installed', [r.fn, f.calls.map(c => c.fn)], ['apply_ai_credit_event', ['apply_ai_credit_event']]);
    }
    {
        const f = fakeRpc(['apply_ai_credit_event']);
        const r = await applyKelviqWebhookEvent(ev('refund.created', undefined, { order_id: 'ORD-7' }), f.rpc);
        eq('refund.* without the credits SQL → old handler (flag off = old behaviour)', [r.fn, f.calls.map(c => c.fn), r.error], ['apply_kelviq_event', ['apply_ai_credit_event', 'apply_kelviq_event'], null]);
    }
    {
        const f = fakeRpc([], { apply_ai_credit_event: 'deadlock detected' });
        const r = await applyKelviqWebhookEvent(ev('refund.created', undefined, { order_id: 'ORD-7' }), f.rpc);
        eq('a real credits error is reported (500), not hidden by the fallback', [f.calls.map(c => c.fn), r.error?.message], [['apply_ai_credit_event'], 'deadlock detected']);
    }
}

// ───────────────────────────── 5. kelviq-checkout credit actions ─────────────────────────────
function checkoutCtx(o: { flag?: string; missing?: string[]; rpcData?: Record<string, unknown>; rpcError?: Record<string, string> } = {}) {
    const rpcCalls: RpcCall[] = [];
    const kelviqCalls: Array<{ method: string; path: string; body: any }> = [];
    let ensured = 0;
    const ctx: CreditsContext = {
        userId: 'user-1',
        email: 'pro@example.test',
        env: (n) => (n === 'AI_CREDITS_ENABLED' ? o.flag : undefined),
        rpc: async (fn, args) => {
            rpcCalls.push({ fn, args });
            if (o.missing?.includes(fn)) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
            if (o.rpcError?.[fn]) return { data: null, error: { code: 'P0001', message: o.rpcError[fn] } };
            return { data: o.rpcData?.[fn] ?? null, error: null };
        },
        kelviq: async (method, path, body) => { kelviqCalls.push({ method, path, body }); return { checkoutUrl: 'https://kelviq.test/checkout/cs_1', checkoutSessionId: 'cs_1' } as any; },
        ensureCustomer: async () => { ensured++; },
        returnUrl: (candidate, fallback) => (typeof candidate === 'string' && candidate.startsWith('https://www.contractordocs.app/') ? candidate : `https://www.contractordocs.app${fallback}`),
    };
    return { ctx, rpcCalls, kelviqCalls, ensured: () => ensured };
}
async function checkoutTests() {
    eq('credit actions recognised; others untouched', [isCreditsAction('credits_status'), isCreditsAction('credits_checkout'), isCreditsAction('credits_settings'), isCreditsAction('portal'), isCreditsAction(undefined)], [true, true, true, false, false]);
    {
        const t = checkoutCtx();
        const s = await handleCreditsAction('credits_status', {}, t.ctx);
        const c = await handleCreditsAction('credits_checkout', { pack: 'ai-credits-5' }, t.ctx);
        const st = await handleCreditsAction('credits_settings', { pack: 'ai-credits-5', threshold: 20, autoRecharge: true }, t.ctx);
        eq('flag off: status says disabled, the rest 503, nothing called', [s, c.status, c.body.code, st.status, t.rpcCalls.length, t.kelviqCalls.length],
            [{ status: 200, body: { enabled: false } }, 503, 'CREDITS_DISABLED', 503, 0, 0]);
    }
    {
        const t = checkoutCtx({ flag: 'true', missing: ['ai_credit_status', 'ai_credit_balance'] });
        eq('flag on but SQL missing: status disabled', (await handleCreditsAction('credits_status', {}, t.ctx)).body, { enabled: false });
        const c = await handleCreditsAction('credits_checkout', { pack: 'ai-credits-10' }, t.ctx);
        eq('flag on but SQL missing: no checkout (credits could never arrive)', [c.status, c.body.code, t.kelviqCalls.length], [503, 'CREDITS_DISABLED', 0]);
    }
    {
        const t = checkoutCtx({ flag: 'true', rpcData: { ai_credit_status: { balance: 42, has_purchase: true, used_this_month: 7, settings: { auto_recharge: true, threshold: 50, pack: 'ai-credits-20' }, last_recharge: { status: 'failed', pack: 'ai-credits-20', detail: 'declined', at: '2026-11-14' }, recent: [{ delta: 100, reason: 'purchase' }] } } });
        const s = await handleCreditsAction('credits_status', {}, t.ctx);
        const b = s.body as any;
        eq('status mapping', [b.enabled, b.balance, b.hasPurchase, b.usedThisMonth, b.autoRecharge, b.lastRecharge.status, b.packs.length, b.thresholds, b.maxPerDay],
            [true, 42, true, 7, { enabled: true, threshold: 50, pack: 'ai-credits-20' }, 'failed', 4, [10, 20, 50, 100], 3]);
        eq('status for the JWT user only', t.rpcCalls[0], { fn: 'ai_credit_status', args: { p_user_id: 'user-1' } });
    }
    {
        const t = checkoutCtx({ flag: 'true' });
        eq('unknown pack → 400, no checkout', [(await handleCreditsAction('credits_checkout', { pack: 'ai-credits-3' }, t.ctx)).status, t.kelviqCalls.length], [400, 0]);
        const r = await handleCreditsAction('credits_checkout', { pack: 'ai-credits-10', user_id: 'someone-else', successUrl: 'https://evil.test/x' }, t.ctx);
        eq('checkout answers the Kelviq URL', r, { status: 200, body: { url: 'https://kelviq.test/checkout/cs_1', sessionId: 'cs_1' } });
        const call = t.kelviqCalls[0];
        eq('one-time Kelviq checkout for the pack', [call.method, call.path, call.body.planIdentifier, call.body.chargePeriod, call.body.customerId],
            ['POST', '/checkout/', 'ai-credits-10', 'ONE_TIME', 'user-1']);
        eq('metadata carries the JWT user and the pack (never the body user id)', call.body.metadata, { user_id: 'user-1', kind: 'ai_credits', pack: 'ai-credits-10', credits: '220' });
        eq('return URLs are allow-listed (Settings › billing)', [call.body.successUrl, call.body.cancelUrl],
            ['https://www.contractordocs.app/settings?credits=success#billing', 'https://www.contractordocs.app/settings#billing']);
        eq('Kelviq customer ensured; SQL probed first', [t.ensured(), t.rpcCalls.map(c => c.fn)], [1, ['ai_credit_balance']]);
    }
    {
        const t = checkoutCtx({ flag: 'true', rpcData: { set_ai_credit_settings: { balance: 5, has_purchase: true, settings: { auto_recharge: true, threshold: 20, pack: 'ai-credits-10' } } } });
        eq('threshold outside 5..500 → 400 before the database', [(await handleCreditsAction('credits_settings', { pack: 'ai-credits-10', threshold: 2 }, t.ctx)).status, (await handleCreditsAction('credits_settings', { pack: 'ai-credits-10', threshold: 20.5 }, t.ctx)).status, t.rpcCalls.length], [400, 400, 0]);
        const ok = await handleCreditsAction('credits_settings', { pack: 'ai-credits-10', threshold: 20, autoRecharge: true }, t.ctx);
        eq('settings saved with the JWT user', [ok.status, (ok.body as any).autoRecharge, t.rpcCalls[0]], [200, { enabled: true, threshold: 20, pack: 'ai-credits-10' },
            { fn: 'set_ai_credit_settings', args: { p_user_id: 'user-1', p_auto_recharge: true, p_threshold: 20, p_pack: 'ai-credits-10' } }]);
        const truthy = checkoutCtx({ flag: 'true' });
        await handleCreditsAction('credits_settings', { pack: 'ai-credits-10', threshold: 20, autoRecharge: 'yes' }, truthy.ctx);
        eq('only a real true turns automatic top-up on', truthy.rpcCalls[0].args.p_auto_recharge, false);
    }
    {
        const t = checkoutCtx({ flag: 'true', rpcError: { set_ai_credit_settings: 'AUTO_RECHARGE_NEEDS_PURCHASE: Buy a credit pack once first, so your card is saved for automatic top-ups.' } });
        const r = await handleCreditsAction('credits_settings', { pack: 'ai-credits-10', threshold: 20, autoRecharge: true }, t.ctx);
        eq('auto top-up before any purchase → 409 with a readable message', [r.status, r.body.code, r.body.error], [409, 'AUTO_RECHARGE_NEEDS_PURCHASE', 'Buy a credit pack once first, so your card is saved for automatic top-ups.']);
    }
    // index.ts wiring: credits branch before the subscription code, which is unchanged
    const idx = read('supabase/functions/kelviq-checkout/index.ts');
    check('kelviq-checkout: credits branch runs before portal/checkout and the ALREADY_SUBSCRIBED rule is untouched',
        idx.indexOf('isCreditsAction(body.action)') > 0 && idx.indexOf('isCreditsAction(body.action)') < idx.indexOf("body.action === 'portal'") && /code: 'ALREADY_SUBSCRIBED'/.test(idx) && /planIdentifier: TIER_TO_PLAN\[tier\]/.test(idx));
    const wh = read('supabase/functions/kelviq-webhook/index.ts');
    check('kelviq-webhook: signature check still before any processing', wh.indexOf('verifyKelviqSignature(') < wh.indexOf('applyKelviqWebhookEvent(event'));
}

// ───────────────────────────── 6. ai-assistant handler ─────────────────────────────
type FakeCall = { url: string; init?: RequestInit };
interface FakeOpts {
    used?: number;
    tier?: string;
    consume?: 'ok' | 'limit';
    balance?: number | 'missing' | 'error';
    spend?: 'ok' | 'empty' | 'missing' | 'error';
    spendDue?: boolean;
    claim?: boolean;
    charge?: { status: number; body: unknown } | 'timeout';
    finish?: { status: string; balance: number } | 'error';
    lastMinute?: number;
    auto?: boolean;
}
function makeFetch(o: FakeOpts = {}) {
    const calls: FakeCall[] = [];
    let balance = typeof o.balance === 'number' ? o.balance : 0;
    const monthIso = encodeURIComponent(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString());
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        const headers = new Headers(init?.headers);
        const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
        if (url.endsWith('/auth/v1/user')) {
            return headers.get('Authorization') === 'Bearer user-jwt' ? json({ id: 'user-1', role: 'authenticated' }) : json({ msg: 'bad jwt' }, 401);
        }
        if (url.includes('/rest/v1/profiles')) return json([{ subscription_tier: o.tier || 'free', subscription_status: 'active' }]);
        if (url.includes('/rest/v1/usage_events') && init?.method === 'HEAD') {
            const n = url.includes(monthIso) ? (o.used ?? 0) : (o.lastMinute ?? 0);
            return new Response(null, { status: 200, headers: { 'content-range': `*/${n}` } });
        }
        if (url.includes('/rest/v1/usage_events') && init?.method === 'POST') return new Response(null, { status: 201 });
        if (url.endsWith('/rpc/consume_usage')) {
            return o.consume === 'limit' ? json({ code: 'P0001', message: 'PLAN_LIMIT: You have used all 15 AI requests' }, 400) : json({ used: 1, remaining: 14 });
        }
        if (url.endsWith('/rpc/ai_credit_balance')) {
            if (o.balance === 'missing') return json({ code: 'PGRST202', message: 'Could not find the function public.ai_credit_balance(p_user_id) in the schema cache' }, 404);
            if (o.balance === 'error') return json({ code: '57014', message: 'canceling statement due to statement timeout' }, 500);
            return json(balance);
        }
        if (url.endsWith('/rpc/spend_ai_credit')) {
            if (o.spend === 'empty' || (o.spend !== 'ok' && o.spend !== 'error' && o.spend !== 'missing' && balance < 1)) return json({ code: 'P0001', message: 'CREDITS_EMPTY: You have no AI credits left.', hint: 'ai_credits' }, 400);
            if (o.spend === 'missing') return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
            if (o.spend === 'error') return json({ code: '57014', message: 'timeout' }, 500);
            balance -= 1;
            return json({ balance, auto_recharge_due: Boolean(o.spendDue) });
        }
        if (url.endsWith('/rpc/ai_credit_status')) {
            return json({ balance, has_purchase: true, settings: { auto_recharge: Boolean(o.auto), threshold: 20, pack: 'ai-credits-10' }, last_recharge: o.finish && o.finish !== 'error' ? { status: o.finish.status, detail: 'declined' } : null });
        }
        if (url.endsWith('/rpc/claim_ai_auto_recharge')) {
            return json(o.claim ? { claimed: true, attempt_id: 'att-1', pack: 'ai-credits-10', credits: 220, balance } : { claimed: false, reason: 'off' });
        }
        if (url.endsWith('/rpc/finish_ai_auto_recharge')) {
            if (o.finish === 'error') return json({ message: 'boom' }, 500);
            const fin = o.finish || { status: 'succeeded', balance: balance + 220 };
            balance = fin.balance;
            return json({ status: fin.status, credits: 220, balance: fin.balance });
        }
        if (url.startsWith('https://api.kelviq.com/api/v1/charges/') || url.startsWith('https://sandboxapi.kelviq.com/api/v1/charges/')) {
            if (o.charge === 'timeout') throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
            const c = o.charge || { status: 201, body: { id: 'ch_77', amount: '10.00', currency: 'USD', status: 'active' } };
            return json(c.body, c.status);
        }
        if (url.includes('generativelanguage.googleapis.com')) return json({}, 500);
        return new Response('not found', { status: 404 });
    }) as typeof fetch;
    return { f, calls };
}
const envOf = (extra: Record<string, string> = {}) => ({ get: (k: string) => ({ SUPABASE_URL: 'http://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', SITE_URL: 'https://contractordocs.app', AI_PROVIDER: 'mock', ...extra } as Record<string, string>)[k] });
const ON = { AI_CREDITS_ENABLED: 'true', KELVIQ_SERVER_API_KEY: 'kq_test_server_key' };
const post = (body: unknown) => new Request('http://fn.test/ai-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://contractordocs.app', Authorization: 'Bearer user-jwt' }, body: JSON.stringify(body) });
const quiet = () => undefined;
const chatBody = { message: 'Create an invoice for 2 doors at $450', scope: 'dashboard', context: { today: '2026-11-14' } };
const photoBody = {
    task: 'photo_update', note: 'Cabinets go in Monday.',
    images: [{ mime_type: 'image/jpeg', data: 'QUJD'.repeat(10), tag: 'after', caption: 'Kitchen', taken_at: '2026-11-12T15:00:00Z' }],
    context: { today: '2026-11-14', job: { id: 'job-1', name: 'Kitchen remodel', client_name: 'Jane Smith', address: '1 Main St', status: 'active' }, company_name: 'Acme', sender_name: 'Bob', client_name: 'Jane Smith' },
};
const rpcNames = (calls: FakeCall[]) => calls.filter(c => c.url.includes('/rest/v1/rpc/')).map(c => c.url.split('/rpc/')[1]);
const creditRpc = (calls: FakeCall[]) => rpcNames(calls).filter(n => /credit|recharge/.test(n));
const kelviqCalls = (calls: FakeCall[]) => calls.filter(c => c.url.includes('kelviq.com'));
const modelOrMock = async (res: Response) => ({ status: res.status, body: await res.json() as any });

async function handlerTests() {
    // flag OFF: exactly the old behaviour
    {
        const { f, calls } = makeFetch({ used: 15, balance: 500 });
        const r = await modelOrMock(await createHandler(envOf({ KELVIQ_SERVER_API_KEY: 'k' }), { fetch: f, log: quiet })(post(chatBody)));
        eq('flag off: plan limit → 402 PLAN_LIMIT (even with credits in the database)', [r.status, r.body.code, r.body.error.startsWith('PLAN_LIMIT:')], [402, 'PLAN_LIMIT', true]);
        eq('flag off: no credit RPC, no Kelviq call', [creditRpc(calls), kelviqCalls(calls).length], [[], 0]);
        check('flag off: per-minute limit counts kind ai only (unchanged query)', calls.filter(c => c.init?.method === 'HEAD').every(c => c.url.includes('kind=eq.ai&')));
        const ok = makeFetch({ used: 3 });
        const res = await modelOrMock(await createHandler(envOf(), { fetch: ok.f, log: quiet })(post(chatBody)));
        eq('flag off: under the limit unchanged (200, consume_usage, usage meta)', [res.status, rpcNames(ok.calls), res.body.meta.usage], [200, ['consume_usage'], { used: 4, limit: 15, tier: 'free' }]);
        const race = await createHandler(envOf(), { fetch: makeFetch({ used: 14, consume: 'limit', balance: 50 }).f, log: quiet })(post(chatBody));
        eq('flag off: parallel request past the limit still 402 PLAN_LIMIT', [race.status, ((await race.json()) as any).code], [402, 'PLAN_LIMIT']);
    }
    // flag ON, allowance left: plan first, no credit calls
    {
        const { f, calls } = makeFetch({ used: 3, balance: 40 });
        const r = await modelOrMock(await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody)));
        eq('order 1: plan allowance first (credits untouched)', [r.status, rpcNames(calls), r.body.meta.usage], [200, ['consume_usage'], { used: 4, limit: 15, tier: 'free' }]);
        check('flag on: per-minute limit also counts requests paid with credits', calls.some(c => c.init?.method === 'HEAD' && c.url.includes('kind=in.(ai,ai_credit)')));
    }
    // flag ON, allowance used, credits left
    {
        const { f, calls } = makeFetch({ used: 15, balance: 5 });
        const r = await modelOrMock(await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody)));
        eq('order 2: allowance used → paid with a credit', [r.status, r.body.proposal?.action_type, r.body.meta.usage], [200, 'GENERATE_DOCUMENT', { used: 15, limit: 15, tier: 'free', paid_with: 'credits', credits: 4 }]);
        eq('one credit spent, the monthly allowance not touched', rpcNames(calls), ['ai_credit_balance', 'spend_ai_credit']);
        eq('spend for the JWT user', JSON.parse(String(calls.find(c => c.url.endsWith('/rpc/spend_ai_credit'))?.init?.body)), { p_user_id: 'user-1' });
    }
    {
        const { f, calls } = makeFetch({ used: 600, tier: 'ai', balance: 3 });
        const r = await modelOrMock(await createHandler(envOf(ON), { fetch: f, log: quiet })(post(photoBody)));
        eq('photo task (Premium + AI over 600) paid with a credit', [r.status, r.body.meta?.usage?.paid_with, rpcNames(calls)], [200, 'credits', ['ai_credit_balance', 'spend_ai_credit']]);
        const free = await modelOrMock(await createHandler(envOf(ON), { fetch: makeFetch({ used: 15, tier: 'free', balance: 50 }).f, log: quiet })(post(photoBody)));
        eq('credits never unlock a Premium + AI feature (PLAN_REQUIRED stays)', [free.status, free.body.code], [402, 'PLAN_REQUIRED']);
    }
    // flag ON, allowance and credits used up
    {
        const { f, calls } = makeFetch({ used: 15, balance: 0 });
        const r = await modelOrMock(await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody)));
        eq('order 3: nothing left → 402 CREDITS_EMPTY', [r.status, r.body.code, r.body.error.startsWith('PLAN_LIMIT:')], [402, 'CREDITS_EMPTY', true]);
        eq('402 carries the packs and where to buy', [r.body.credits.packs.map((p: any) => p.price), r.body.credits.buy_path, r.body.credits.balance, r.body.limit, r.body.tier], [[5, 10, 20, 50], '/settings#billing', 0, 15, 'free']);
        check('blocked request: no model call, nothing spent, no charge', !calls.some(c => c.url.includes('generativelanguage')) && !rpcNames(calls).includes('spend_ai_credit') && kelviqCalls(calls).length === 0);
        eq('auto top-up off: claim asked, nothing charged', rpcNames(calls), ['ai_credit_balance', 'claim_ai_auto_recharge', 'ai_credit_status']);
    }
    {
        const missing = await modelOrMock(await createHandler(envOf(ON), { fetch: makeFetch({ used: 15, balance: 'missing' }).f, log: quiet })(post(chatBody)));
        eq('flag on but SQL not applied → old 402 PLAN_LIMIT', [missing.status, missing.body.code], [402, 'PLAN_LIMIT']);
        const broken = await modelOrMock(await createHandler(envOf(ON), { fetch: makeFetch({ used: 15, balance: 'error' }).f, log: quiet })(post(chatBody)));
        eq('balance unreadable → 503 (never a wrong "no credits")', [broken.status, broken.body.code], [503, 'USAGE_UNAVAILABLE']);
        const { f, calls } = makeFetch({ used: 15, balance: 0, claim: true, lastMinute: 10 });
        const limited = await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody));
        eq('rate-limited before any balance check or charge', [limited.status, creditRpc(calls), kelviqCalls(calls).length], [429, [], 0]);
    }
    // automatic top-up at zero
    {
        const { f, calls } = makeFetch({ used: 15, balance: 0, claim: true, auto: true });
        const r = await modelOrMock(await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody)));
        eq('auto top-up at zero: charged, credited, answered', [r.status, r.body.meta.usage.paid_with, r.body.meta.usage.credits], [200, 'credits', 219]);
        eq('sequence: balance → claim → charge → finish → spend', [...rpcNames(calls).slice(0, 2), 'charge', ...rpcNames(calls).slice(2)], ['ai_credit_balance', 'claim_ai_auto_recharge', 'charge', 'finish_ai_auto_recharge', 'spend_ai_credit']);
        const charge = kelviqCalls(calls)[0];
        eq('Kelviq POST /charges/ off-session for the claimed pack', [charge.url, charge.init?.method, JSON.parse(String(charge.init?.body)), new Headers(charge.init?.headers).get('Authorization')],
            ['https://api.kelviq.com/api/v1/charges/', 'POST', { planIdentifier: 'ai-credits-10', chargePeriod: 'ONE_TIME', customerId: 'user-1' }, 'Bearer kq_test_server_key']);
        eq('finish gets the charge id (credited once per charge)', JSON.parse(String(calls.find(c => c.url.endsWith('/rpc/finish_ai_auto_recharge'))?.init?.body)),
            { p_attempt_id: 'att-1', p_status: 'succeeded', p_charge_id: 'ch_77', p_detail: null, p_amount: 10, p_currency: 'USD' });
    }
    {
        const { f, calls } = makeFetch({ used: 15, balance: 0, claim: true, auto: true, charge: { status: 400, body: { detail: 'Your card was declined.' } }, finish: { status: 'failed', balance: 0 } });
        const r = await modelOrMock(await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody)));
        eq('declined card → finish failed → 402 CREDITS_EMPTY with the auto state', [r.status, r.body.code, r.body.credits.auto_recharge.last_status], [402, 'CREDITS_EMPTY', 'failed']);
        eq('declined: finish told "failed" with Kelviq\'s reason', JSON.parse(String(calls.find(c => c.url.endsWith('/rpc/finish_ai_auto_recharge'))?.init?.body)).p_detail, 'Your card was declined.');
    }
    {
        const { f, calls } = makeFetch({ used: 15, balance: 0, claim: true, auto: true, charge: 'timeout', finish: { status: 'unclear', balance: 0 } });
        const r = await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody));
        eq('no answer from Kelviq → unclear, one charge attempt only', [r.status, JSON.parse(String(calls.find(c => c.url.endsWith('/rpc/finish_ai_auto_recharge'))?.init?.body)).p_status, kelviqCalls(calls).length], [402, 'unclear', 1]);
    }
    {
        const { f, calls } = makeFetch({ used: 15, balance: 0, claim: true });
        const r = await createHandler(envOf({ AI_CREDITS_ENABLED: 'true' }), { fetch: f, log: quiet })(post(chatBody));
        eq('no Kelviq server key → no claim, no charge, 402', [r.status, rpcNames(calls).includes('claim_ai_auto_recharge'), kelviqCalls(calls).length], [402, false, 0]);
    }
    {
        const { f, calls } = makeFetch({ used: 15, balance: 0, claim: true, auto: true, finish: 'error' });
        const r = await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody));
        eq('finish RPC failed after a charge → not answered on unconfirmed credits (attempt stays pending for the webhook)', r.status, 402);
    }
    {
        const { f, calls } = makeFetch({ used: 15, balance: 0, claim: true, auto: true, charge: { status: 201, body: { id: 'ch_9' } } });
        await createHandler(envOf({ ...ON, KELVIQ_ENV: 'sandbox' }), { fetch: f, log: quiet })(post(chatBody));
        eq('KELVIQ_ENV=sandbox charges the sandbox API', kelviqCalls(calls)[0]?.url, 'https://sandboxapi.kelviq.com/api/v1/charges/');
    }
    // top-up after the answer (balance fell below the threshold)
    {
        const { f, calls } = makeFetch({ used: 15, balance: 10, spendDue: true, claim: true, auto: true });
        const r = await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody));
        eq('below threshold after spending → top-up runs (awaited without waitUntil)', [r.status, rpcNames(calls), kelviqCalls(calls).length],
            [200, ['ai_credit_balance', 'spend_ai_credit', 'claim_ai_auto_recharge', 'finish_ai_auto_recharge'], 1]);
        const bg = makeFetch({ used: 15, balance: 10, spendDue: true, claim: true, auto: true });
        const queued: Promise<unknown>[] = [];
        const r2 = await createHandler(envOf(ON), { fetch: bg.f, log: quiet, waitUntil: p => { queued.push(p); } })(post(chatBody));
        eq('with waitUntil the top-up runs in the background', [r2.status, queued.length], [200, 1]);
        await Promise.all(queued);
        eq('background top-up completes', kelviqCalls(bg.calls).length, 1);
        const notDue = makeFetch({ used: 15, balance: 50, spendDue: false, claim: true, auto: true });
        await createHandler(envOf(ON), { fetch: notDue.f, log: quiet })(post(chatBody));
        eq('above threshold → no top-up', [rpcNames(notDue.calls).includes('claim_ai_auto_recharge'), kelviqCalls(notDue.calls).length], [false, 0]);
    }
    // races
    {
        const { f, calls } = makeFetch({ used: 14, consume: 'limit', balance: 3 });
        const r = await modelOrMock(await createHandler(envOf(ON), { fetch: f, log: quiet })(post(chatBody)));
        eq('race: the last plan request was taken in parallel → a credit pays', [r.status, r.body.meta.usage.paid_with, rpcNames(calls)], [200, 'credits', ['consume_usage', 'spend_ai_credit']]);
        const none = await modelOrMock(await createHandler(envOf(ON), { fetch: makeFetch({ used: 14, consume: 'limit', balance: 0 }).f, log: quiet })(post(chatBody)));
        eq('race with no credits → 402 CREDITS_EMPTY with packs', [none.status, none.body.code, none.body.credits?.packs?.length], [402, 'CREDITS_EMPTY', 4]);
        const spentElsewhere = await modelOrMock(await createHandler(envOf(ON), { fetch: makeFetch({ used: 15, balance: 1, spend: 'empty' }).f, log: quiet })(post(chatBody)));
        eq('race: the last credit was spent in parallel → 402 CREDITS_EMPTY', [spentElsewhere.status, spentElsewhere.body.code], [402, 'CREDITS_EMPTY']);
        const timeout = makeFetch({ used: 15, balance: 2, spend: 'error' });
        const t = await createHandler(envOf(ON), { fetch: timeout.f, log: quiet })(post(chatBody));
        eq('spend timeout → answered, never spent twice', [t.status, rpcNames(timeout.calls).filter(n => n === 'spend_ai_credit').length], [200, 1]);
    }
}

// ───────────────────────────── 7. app pieces ─────────────────────────────
function appTests() {
    eq('disabled answers stay hidden', [normalizeCreditsStatus({ enabled: false }).enabled, normalizeCreditsStatus(null).enabled, normalizeCreditsStatus('x').enabled, normalizeCreditsStatus({ enabled: 'true' }).enabled], [false, false, false, false]);
    const s = normalizeCreditsStatus({ enabled: true, balance: 12.7, hasPurchase: 1, autoRecharge: { enabled: true, threshold: 50, pack: 'nope' }, packs: [{ id: 'ai-credits-5', price: 1, credits: 99999 }, { id: 'bogus' }] });
    eq('status normalized; packs always the real ones', [s.balance, s.hasPurchase, s.autoRecharge, s.packs], [12, true, { enabled: true, threshold: 50, pack: 'ai-credits-10' }, [packById('ai-credits-5')]]);
    eq('checkout return detected', [isCreditsCheckoutReturn('?credits=success'), isCreditsCheckoutReturn('?a=1&credits=success'), isCreditsCheckoutReturn('?credits=successful'), isCreditsCheckoutReturn('')], [true, true, false, false]);
    eq('last top-up notes', [
        lastRechargeNote({ ...DISABLED_STATUS, lastRecharge: { status: 'failed', pack: 'ai-credits-10', detail: 'Card declined', at: null } })?.tone,
        lastRechargeNote({ ...DISABLED_STATUS, lastRecharge: { status: 'unclear', pack: 'ai-credits-10', detail: null, at: null } })?.text.includes('24 hours'),
        lastRechargeNote({ ...DISABLED_STATUS, lastRecharge: { status: 'succeeded', pack: 'ai-credits-10', detail: null, at: null } }),
    ], ['warning', true, null]);
    eq('AI limit codes', [isAiLimitCode('PLAN_LIMIT'), isAiLimitCode('CREDITS_EMPTY'), isAiLimitCode('PLAN_REQUIRED'), isAiLimitCode(undefined)], [true, true, false, false]);

    const inRouter = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
    eq('Settings row renders nothing until the server enables credits', inRouter(createElement(AICreditsRow)), '');
    eq('upgrade strip renders nothing for other limits / while loading', [inRouter(createElement(AICreditsStrip, { reason: 'You have used 6 of 6 jobs this month.' })), inRouter(createElement(AICreditsStrip, { reason: 'You have used all 15 AI requests' }))], ['', '']);
    const button = inRouter(createElement(BuyCreditsButton));
    check('panel button reads "Buy more credits"', button.includes('Buy more credits') && button.includes('<button'));
    const picker = renderToStaticMarkup(createElement(PackPicker, { packs: AI_CREDIT_PACKS.map(p => ({ ...p })), value: 'ai-credits-20', onChange: () => undefined }));
    check('pack picker: 4 radios, $5…$50, the chosen one checked', (picker.match(/role="radio"/g) || []).length === 4 && ['$5', '$10', '$20', '$50', '1,300 credits'].every(t => picker.includes(t)) && (picker.match(/aria-checked="true"/g) || []).length === 1);
    check('no generic icon cards in the credits UI', !/Icon\b|<svg/.test(read('components/billing/AICredits.tsx')));

    const panel = read('src/ai/components/AssistantPanel.tsx');
    check('AI panel: limit box for both codes, "Buy more credits" only on CREDITS_EMPTY, next to See plans',
        /isAiLimitCode\(err\?\.code\)/.test(panel) && /err!\.code === 'CREDITS_EMPTY' && <BuyCreditsButton \/>/.test(panel) && panel.indexOf('See plans') < panel.indexOf('<BuyCreditsButton'));
    check('upgrade window opens on CREDITS_EMPTY too (chat, AI fill, photo AI)', /isAiLimitCode\(err\?\.code\)\) dispatchUpgradeEvent/.test(read('src/hooks/useAIAssistant.ts'))
        && /isAiLimitCode\(code\)\) dispatchUpgradeEvent/.test(read('src/hooks/useContractorAI.ts')) && /code === 'CREDITS_EMPTY'/.test(read('components/photos/PhotoAIModal.tsx'))
        && /isAiLimitCode\(errorCode\)/.test(read('components/AIDocumentModal.tsx')));
    check('Settings › Plan & billing has the AI credits row; the upgrade window the strip', /<AICreditsRow \/>/.test(read('components/Settings.tsx')) && /<AICreditsStrip reason=\{featureName\} \/>/.test(read('components/UpgradeModal.tsx')));
    check('the browser never writes credits (only the edge function actions)', !/from\('ai_credit_|rpc\('(spend_ai_credit|apply_ai_credit_event|finish_ai_auto_recharge)/.test(read('lib/aiCredits.ts') + read('components/billing/AICredits.tsx')));

    const aiGuide = HELP_GUIDES.find(g => g.id === 'ai')!;
    const settingsGuide = HELP_GUIDES.find(g => g.id === 'settings')!;
    check('help: AI guide explains credits as available only when shown', (aiGuide.tips || []).some(t => /AI credits \(only when your Plan & billing shows an AI credits line\)/.test(t)));
    check('help: Settings guide mentions the AI credits line conditionally', (settingsGuide.tips || []).some(t => /Where AI credits are offered/.test(t)));
    const entry = KNOWLEDGE.find(e => e.id === 'ai-credits');
    check('AI knowledge: entry exists, routes to billing, says ONLY AVAILABLE WHEN SWITCHED ON', Boolean(entry) && entry!.route === '/settings#billing' && /ONLY AVAILABLE WHEN SWITCHED ON/.test(entry!.facts[0]));
    check('AI knowledge: the $5 minimum and every pack', ['$5 = 100', '$10 = 220', '$20 = 480', '$50 = 1,300'].every(t => entry!.facts.join(' ').includes(t)));
}

await webhookTests();
await checkoutTests();
await handlerTests();
appTests();

console.log(`ai-credits-check: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
    for (const f of failures) console.log(`  FAIL ${f}`);
    process.exit(1);
}
