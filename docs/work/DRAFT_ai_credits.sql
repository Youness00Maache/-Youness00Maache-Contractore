-- =====================================================================================
-- DRAFT FOR THE OWNER'S OK. Not in supabase/migrations, NOT applied.
-- AI credit top-ups: when the plan's monthly AI requests are used up, the user can buy credit packs
-- ($5 / $10 / $20 / $50, minimum $5) and turn on automatic top-up (the card saved by Kelviq at the first
-- purchase is charged off-session when the balance drops below a threshold).
--
-- ADDITIVE ONLY: 4 new tables, 1 view, new functions. No existing table, column, function or row is changed;
-- subscriptions keep using apply_kelviq_event() exactly as before.
--
-- Turning it on (in this order):
--   1. Kelviq (Product catalog): create 4 ONE-TIME plans ("Billing cycle: One time"), ideally in a separate
--      product "ContractorDocs AI credits", with these plan identifiers and prices:
--        ai-credits-5 = $5 (100 credits), ai-credits-10 = $10 (220), ai-credits-20 = $20 (480), ai-credits-50 = $50 (1,300)
--      (the credits are counted by this SQL, no Kelviq "feature" is needed).
--   2. Kelviq webhook endpoint (the existing kelviq-webhook URL): also send order.created, order.updated,
--      order.refunded, refund.created, refund.updated (checkout.completed is already sent).
--   3. Apply this file (SQL editor). Then redeploy ai-assistant, kelviq-checkout and kelviq-webhook.
--   4. Edge Functions → Secrets: AI_CREDITS_ENABLED = true (KELVIQ_SERVER_API_KEY and KELVIQ_WEBHOOK_SECRET must
--      already be set: see NEXT_STEPS.md D1). Remove the secret (or set it to false) to switch the feature off.
--
-- Same numbers as supabase/functions/_shared/aiCredits.ts (checked by scripts/ai-credits-check.ts).
-- Rollback: see the end of this file.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0. Pack sizes (Kelviq plan identifier -> credits). null = not an AI credit pack.
-- -------------------------------------------------------------------------------------
create or replace function public.ai_credit_pack_credits(p_pack text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_pack, '')))
    when 'ai-credits-5'  then 100
    when 'ai-credits-10' then 220
    when 'ai-credits-20' then 480
    when 'ai-credits-50' then 1300
  end;
$$;

-- -------------------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------------------

-- Every credit movement. Balance = sum(delta). source_key makes purchases/refunds idempotent:
--   checkout:<checkout session id>   credit pack bought through Kelviq checkout (checkout.completed)
--   charge:<charge id>               automatic top-up (POST /charges/ answered 201)
--   order:<order id>                 automatic top-up confirmed later by order.created (the charge answer was lost)
--   refund:<refund id> | order-refunded:<order id> | refund-reversed:<refund id> | adjust:<uuid>
--   null                             usage (one row per AI request paid with a credit)
create table if not exists public.ai_credit_ledger (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  delta           integer not null check (delta <> 0 and delta between -100000 and 100000),
  reason          text not null check (reason in ('purchase', 'usage', 'refund', 'adjust')),
  source_key      text unique,
  pack            text,
  amount          numeric(12, 2),
  currency        text,
  kelviq_event_id text,
  kelviq_order_id text,
  note            text,
  created_at      timestamptz not null default now(),
  constraint ai_credit_ledger_key_required check (reason = 'usage' or source_key is not null),
  constraint ai_credit_ledger_sign check (
    (reason = 'purchase' and delta > 0) or (reason in ('usage', 'refund') and delta < 0) or reason = 'adjust')
);
create index if not exists idx_ai_credit_ledger_user on public.ai_credit_ledger (user_id, created_at desc);

-- Automatic top-up settings (one row per user; written only through set_ai_credit_settings by the edge function).
create table if not exists public.ai_credit_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  auto_recharge boolean not null default false,
  threshold     integer not null default 20 check (threshold between 5 and 500),
  pack          text not null default 'ai-credits-10' check (public.ai_credit_pack_credits(pack) is not null),
  updated_at    timestamptz not null default now()
);

-- One row per automatic top-up attempt (claim -> Kelviq charge -> finish). Also the runaway / double-charge guard.
create table if not exists public.ai_credit_recharges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  pack        text not null,
  status      text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'unclear')),
  charge_id   text unique,
  order_id    text unique,
  detail      text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_ai_credit_recharges_user on public.ai_credit_recharges (user_id, started_at desc);

-- Kelviq orders of credit packs (order.* webhooks): needed to map refunds (refund.* only carries the order id).
-- refunds = { "<refund id>": credits counted for it, "order": credits counted for a full refund }.
create table if not exists public.ai_credit_orders (
  order_id         text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  pack             text not null,
  credits          integer not null check (credits > 0),
  amount_units     bigint,
  currency         text,
  status           text,
  refunded_credits integer not null default 0 check (refunded_credits >= 0),
  refunds          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_ai_credit_orders_user on public.ai_credit_orders (user_id, created_at desc);

-- Balance per user (security_invoker: the caller's RLS applies, so a user sees only their own row).
create or replace view public.ai_credit_balances with (security_invoker = true) as
  select user_id, coalesce(sum(delta), 0)::integer as balance, max(created_at) as updated_at
    from public.ai_credit_ledger
   group by user_id;

-- -------------------------------------------------------------------------------------
-- 2. RLS: users read their own rows; only the service role (edge functions) writes.
-- -------------------------------------------------------------------------------------
alter table public.ai_credit_ledger    enable row level security;
alter table public.ai_credit_settings  enable row level security;
alter table public.ai_credit_recharges enable row level security;
alter table public.ai_credit_orders    enable row level security;

drop policy if exists ai_credit_ledger_select_own on public.ai_credit_ledger;
create policy ai_credit_ledger_select_own on public.ai_credit_ledger for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists ai_credit_settings_select_own on public.ai_credit_settings;
create policy ai_credit_settings_select_own on public.ai_credit_settings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists ai_credit_recharges_select_own on public.ai_credit_recharges;
create policy ai_credit_recharges_select_own on public.ai_credit_recharges for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists ai_credit_orders_select_own on public.ai_credit_orders;
create policy ai_credit_orders_select_own on public.ai_credit_orders for select to authenticated
  using (user_id = (select auth.uid()));

-- Supabase grants ALL on new tables to anon/authenticated by default: tighten it.
revoke all on public.ai_credit_ledger, public.ai_credit_settings, public.ai_credit_recharges, public.ai_credit_orders,
              public.ai_credit_balances from anon;
revoke insert, update, delete, truncate on public.ai_credit_ledger, public.ai_credit_settings, public.ai_credit_recharges,
              public.ai_credit_orders from authenticated;
grant select on public.ai_credit_ledger, public.ai_credit_settings, public.ai_credit_recharges, public.ai_credit_orders,
              public.ai_credit_balances to authenticated;
grant all on public.ai_credit_ledger, public.ai_credit_settings, public.ai_credit_recharges, public.ai_credit_orders,
              public.ai_credit_balances to service_role;

-- -------------------------------------------------------------------------------------
-- 3. Balance and ledger helpers
-- -------------------------------------------------------------------------------------
create or replace function public.ai_credit_balance(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer from public.ai_credit_ledger where user_id = p_user_id;
$$;

-- Adds one ledger row unless its source_key exists already. Returns true when the row was added.
create or replace function public._ai_credit_add(
  p_user_id uuid, p_delta integer, p_reason text, p_source_key text,
  p_pack text default null, p_amount numeric default null, p_currency text default null,
  p_event_id text default null, p_order_id text default null, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if coalesce(p_delta, 0) = 0 then return false; end if;
  insert into public.ai_credit_ledger (user_id, delta, reason, source_key, pack, amount, currency, kelviq_event_id, kelviq_order_id, note)
  values (p_user_id, p_delta, p_reason, p_source_key, p_pack, p_amount, upper(nullif(btrim(p_currency), '')),
          p_event_id, p_order_id, left(p_note, 300))
  on conflict (source_key) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- Owner tool (SQL editor): goodwill credits or a manual fix, e.g. select public.adjust_ai_credits('<user id>', 100, 'Unclear charge on Nov 14');
create or replace function public.adjust_ai_credits(p_user_id uuid, p_delta integer, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  perform public._ai_credit_add(p_user_id, p_delta, 'adjust', 'adjust:' || gen_random_uuid()::text,
                                null, null, null, null, null, coalesce(nullif(btrim(p_note), ''), 'Manual adjustment'));
  return public.ai_credit_balance(p_user_id);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 4. Spending (ai-assistant, AFTER a successful answer, only when the plan allowance is used up)
-- -------------------------------------------------------------------------------------
create or replace function public.spend_ai_credit(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_auto    boolean;
  v_thresh  integer;
begin
  if p_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  -- same per-user lock as _consume_usage(): two parallel requests can never spend the same credit
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  v_balance := public.ai_credit_balance(p_user_id);
  if v_balance < 1 then
    raise exception 'CREDITS_EMPTY: You have no AI credits left.' using errcode = 'P0001', hint = 'ai_credits';
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason) values (p_user_id, -1, 'usage');
  -- also an event (kind ai_credit) so the per-minute rate limit and the usage history see it;
  -- kind 'ai' would count toward the monthly plan allowance, which is already used up
  insert into public.usage_events (user_id, kind) values (p_user_id, 'ai_credit');

  select auto_recharge, threshold into v_auto, v_thresh from public.ai_credit_settings where user_id = p_user_id;
  return jsonb_build_object(
    'balance', v_balance - 1,
    'auto_recharge_due', coalesce(v_auto, false) and (v_balance - 1) < coalesce(v_thresh, 0));
end;
$$;

-- -------------------------------------------------------------------------------------
-- 5. Automatic top-up: claim (one at a time, capped) -> Kelviq POST /charges/ -> finish
-- -------------------------------------------------------------------------------------

-- Links a paid credit-pack order to an automatic top-up whose charge answer was lost (status unclear, or a
-- pending attempt older than 2 minutes = the function died mid-charge) and credits it once ('order:<id>').
create or replace function public._ai_credit_match_recharge(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.ai_credit_orders%rowtype;
  v_a public.ai_credit_recharges%rowtype;
begin
  select * into v_o from public.ai_credit_orders where order_id = p_order_id;
  if not found then return false; end if;
  if exists (select 1 from public.ai_credit_recharges where order_id = p_order_id) then return false; end if;
  if exists (select 1 from public.ai_credit_ledger where kelviq_order_id = p_order_id and reason = 'purchase') then return false; end if;

  select * into v_a from public.ai_credit_recharges
   where user_id = v_o.user_id and pack = v_o.pack and order_id is null
     and (status = 'unclear' or (status = 'pending' and started_at < now() - interval '2 minutes'))
     and started_at between v_o.created_at - interval '2 hours' and v_o.created_at + interval '1 minute'
   order by started_at
   limit 1
   for update;
  if not found then return false; end if;

  perform public._ai_credit_add(v_o.user_id, v_o.credits, 'purchase', 'order:' || p_order_id, v_o.pack,
                                case when v_o.amount_units is null then null else v_o.amount_units / 100.0 end,
                                v_o.currency, null, p_order_id, 'Automatic top-up (confirmed by the order)');
  update public.ai_credit_recharges
     set status = 'succeeded', order_id = p_order_id, finished_at = coalesce(finished_at, now()),
         detail = 'Confirmed by the Kelviq order'
   where id = v_a.id;
  return true;
end;
$$;

-- Returns {claimed: true, attempt_id, pack, credits, balance} when the edge function should charge now,
-- else {claimed: false, reason}. Serialized per user by the settings row lock.
create or replace function public.claim_ai_auto_recharge(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s       public.ai_credit_settings%rowtype;
  v_balance integer;
  v_id      uuid;
begin
  select * into v_s from public.ai_credit_settings where user_id = p_user_id for update;
  if not found or not v_s.auto_recharge then
    return jsonb_build_object('claimed', false, 'reason', 'off');
  end if;
  v_balance := public.ai_credit_balance(p_user_id);
  if v_balance >= v_s.threshold then
    return jsonb_build_object('claimed', false, 'reason', 'above_threshold', 'balance', v_balance);
  end if;
  -- a charge in flight, or one whose answer was lost (it may have gone through): never charge again blindly
  if exists (select 1 from public.ai_credit_recharges
              where user_id = p_user_id and status in ('pending', 'unclear')
                and started_at > now() - interval '24 hours') then
    return jsonb_build_object('claimed', false, 'reason', 'in_progress_or_unclear', 'balance', v_balance);
  end if;
  if (select count(*) from public.ai_credit_recharges
       where user_id = p_user_id and status = 'succeeded' and started_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('claimed', false, 'reason', 'daily_cap', 'balance', v_balance);
  end if;

  insert into public.ai_credit_recharges (user_id, pack) values (p_user_id, v_s.pack) returning id into v_id;
  return jsonb_build_object('claimed', true, 'attempt_id', v_id, 'pack', v_s.pack,
                            'credits', public.ai_credit_pack_credits(v_s.pack), 'balance', v_balance);
end;
$$;

-- p_status: succeeded (p_charge_id required) | failed (card not charged: automatic top-up is switched off) |
-- unclear (no / bad answer: paused 24 h; credited later if Kelviq reports the order). Idempotent per attempt.
create or replace function public.finish_ai_auto_recharge(
  p_attempt_id uuid, p_status text, p_charge_id text default null, p_detail text default null,
  p_amount numeric default null, p_currency text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a       public.ai_credit_recharges%rowtype;
  v_credits integer;
  v_charge  text := nullif(btrim(coalesce(p_charge_id, '')), '');
  v_order   text;
begin
  if p_status not in ('succeeded', 'failed', 'unclear') then
    raise exception 'Unknown top-up status %', p_status using errcode = '22023';
  end if;
  select * into v_a from public.ai_credit_recharges where id = p_attempt_id for update;
  if not found then
    raise exception 'Unknown top-up attempt' using errcode = 'P0002';
  end if;
  if v_a.status <> 'pending' then
    return jsonb_build_object('status', v_a.status, 'duplicate', true, 'balance', public.ai_credit_balance(v_a.user_id));
  end if;
  v_credits := public.ai_credit_pack_credits(v_a.pack);

  if p_status = 'succeeded' then
    if v_charge is null then
      raise exception 'A successful top-up needs the charge id' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = v_a.user_id for update;
    perform public._ai_credit_add(v_a.user_id, v_credits, 'purchase', 'charge:' || v_charge, v_a.pack,
                                  p_amount, p_currency, null, null, 'Automatic top-up');
    update public.ai_credit_recharges
       set status = 'succeeded', charge_id = v_charge, detail = null, finished_at = now()
     where id = v_a.id;

  elsif p_status = 'failed' then
    update public.ai_credit_recharges
       set status = 'failed', detail = left(coalesce(nullif(btrim(p_detail), ''), 'Your card could not be charged.'), 300),
           finished_at = now()
     where id = v_a.id;
    -- a declined card would fail every time: stop until the user turns it on again
    update public.ai_credit_settings set auto_recharge = false, updated_at = now() where user_id = v_a.user_id;

  else
    update public.ai_credit_recharges
       set status = 'unclear', detail = left(coalesce(nullif(btrim(p_detail), ''), 'No answer from the payment provider.'), 300),
           finished_at = now()
     where id = v_a.id;
    -- the payment may have gone through and Kelviq may have reported the order already
    select o.order_id into v_order
      from public.ai_credit_orders o
     where o.user_id = v_a.user_id and o.pack = v_a.pack and o.created_at >= v_a.started_at - interval '1 minute'
       and not exists (select 1 from public.ai_credit_recharges r where r.order_id = o.order_id)
       and not exists (select 1 from public.ai_credit_ledger l where l.kelviq_order_id = o.order_id and l.reason = 'purchase')
     order by o.created_at
     limit 1;
    if v_order is not null then
      perform public._ai_credit_match_recharge(v_order);
    end if;
  end if;

  return jsonb_build_object(
    'status', (select status from public.ai_credit_recharges where id = v_a.id),
    'credits', v_credits,
    'balance', public.ai_credit_balance(v_a.user_id));
end;
$$;

-- -------------------------------------------------------------------------------------
-- 6. Settings and status (called by kelviq-checkout with the service role; the user id comes from the JWT)
-- -------------------------------------------------------------------------------------
create or replace function public.ai_credit_status(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'balance', public.ai_credit_balance(p_user_id),
    'has_purchase', exists (select 1 from public.ai_credit_ledger where user_id = p_user_id and reason = 'purchase'),
    'used_this_month', (select count(*) from public.ai_credit_ledger
                         where user_id = p_user_id and reason = 'usage' and created_at >= date_trunc('month', now())),
    'settings', coalesce(
      (select jsonb_build_object('auto_recharge', s.auto_recharge, 'threshold', s.threshold, 'pack', s.pack)
         from public.ai_credit_settings s where s.user_id = p_user_id),
      jsonb_build_object('auto_recharge', false, 'threshold', 20, 'pack', 'ai-credits-10')),
    'last_recharge', (select jsonb_build_object('status', r.status, 'pack', r.pack, 'detail', r.detail, 'at', r.started_at)
                        from public.ai_credit_recharges r where r.user_id = p_user_id
                       order by r.started_at desc limit 1),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('delta', x.delta, 'reason', x.reason, 'pack', x.pack,
                                                            'note', x.note, 'at', x.created_at) order by x.created_at desc)
                          from (select delta, reason, pack, note, created_at from public.ai_credit_ledger
                                 where user_id = p_user_id and reason <> 'usage'
                                 order by created_at desc limit 5) x), '[]'::jsonb));
$$;

create or replace function public.set_ai_credit_settings(p_user_id uuid, p_auto_recharge boolean, p_threshold integer, p_pack text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if p_threshold is null or p_threshold < 5 or p_threshold > 500 then
    raise exception 'AI_CREDITS_INVALID: Choose a threshold between 5 and 500 credits.' using errcode = '22023';
  end if;
  if public.ai_credit_pack_credits(p_pack) is null then
    raise exception 'AI_CREDITS_INVALID: Unknown credit pack.' using errcode = '22023';
  end if;
  if coalesce(p_auto_recharge, false)
     and not exists (select 1 from public.ai_credit_ledger where user_id = p_user_id and reason = 'purchase') then
    raise exception 'AUTO_RECHARGE_NEEDS_PURCHASE: Buy a credit pack once first, so your card is saved for automatic top-ups.'
      using errcode = 'P0001';
  end if;
  insert into public.ai_credit_settings as s (user_id, auto_recharge, threshold, pack, updated_at)
  values (p_user_id, coalesce(p_auto_recharge, false), p_threshold, lower(btrim(p_pack)), now())
  on conflict (user_id) do update
    set auto_recharge = excluded.auto_recharge, threshold = excluded.threshold, pack = excluded.pack, updated_at = now();
  return public.ai_credit_status(p_user_id);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 7. Refunds of credit-pack orders
-- -------------------------------------------------------------------------------------
-- Takes back up to p_target credits for one refund (p_refund_key = refund id, or 'order' for a full refund of the
-- order) exactly once. The order remembers what each refund counted, so refund.created + refund.updated +
-- order.refunded never take credits twice. The balance never goes below zero: credits already used stay used.
create or replace function public._ai_credit_refund(p_order_id text, p_refund_key text, p_target integer, p_event_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.ai_credit_orders%rowtype;
  v_target  integer;
  v_balance integer;
  v_take    integer;
  v_key     text := case when p_refund_key = 'order' then 'order-refunded:' || p_order_id else 'refund:' || p_refund_key end;
begin
  select * into v_o from public.ai_credit_orders where order_id = p_order_id for update;
  if not found then return jsonb_build_object('taken', 0, 'detail', 'unknown order'); end if;
  if v_o.refunds ? p_refund_key then return jsonb_build_object('taken', 0, 'detail', 'refund already counted'); end if;

  v_target := least(greatest(coalesce(p_target, 0), 0), greatest(v_o.credits - v_o.refunded_credits, 0));
  update public.ai_credit_orders
     set refunds = refunds || jsonb_build_object(p_refund_key, v_target),
         refunded_credits = refunded_credits + v_target, updated_at = now()
   where order_id = p_order_id;
  if v_target = 0 then return jsonb_build_object('taken', 0, 'detail', 'nothing left to refund on this order'); end if;

  perform 1 from public.profiles where id = v_o.user_id for update;
  v_balance := public.ai_credit_balance(v_o.user_id);
  v_take := least(v_target, greatest(v_balance, 0));
  if v_take > 0 then
    perform public._ai_credit_add(v_o.user_id, -v_take, 'refund', v_key, v_o.pack, null, v_o.currency, p_event_id, p_order_id,
      case when v_take < v_target then format('Refund (%s of %s credits had been used)', v_target - v_take, v_target) else 'Refund' end);
  end if;
  return jsonb_build_object('taken', v_take, 'target', v_target,
                            'detail', format('%s credits taken back%s', v_take,
                                             case when v_take < v_target then format(' (%s already used)', v_target - v_take) else '' end));
end;
$$;

-- -------------------------------------------------------------------------------------
-- 8. Kelviq webhook for AI credit packs (called ONLY by kelviq-webhook with the service role, after the
--    signature check; the edge function routes credit-pack events and refund.* here, everything else to
--    apply_kelviq_event). Idempotent: billing_events (event id) + ledger source_key.
-- -------------------------------------------------------------------------------------
create or replace function public.apply_ai_credit_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id         text := nullif(btrim(p_event->>'id'), '');
  v_type       text := nullif(btrim(p_event->>'type'), '');
  v_test       boolean := lower(coalesce(p_event->>'test', 'false')) = 'true';
  v_obj        jsonb := case when jsonb_typeof(p_event->'data'->'object') = 'object' then p_event->'data'->'object' else '{}'::jsonb end;
  v_plan       text := lower(nullif(btrim(v_obj->'plan'->>'identifier'), ''));
  v_credits    integer;
  v_inserted   boolean;
  v_prev       text;
  v_user       uuid;
  v_cust       text := coalesce(nullif(v_obj->'customer'->>'id', ''), nullif(v_obj->>'customer_id', ''));
  v_status     text := upper(coalesce(v_obj->>'status', ''));
  v_order_id   text;
  v_refund_id  text;
  v_units      bigint;
  v_o          public.ai_credit_orders%rowtype;
  v_res        jsonb;
  v_taken      integer;
  v_result     text := 'processed';
  v_detail     text;
begin
  if v_id is null or v_type is null then
    raise exception 'Malformed Kelviq event (missing id or type)' using errcode = '22023';
  end if;
  v_credits := public.ai_credit_pack_credits(v_plan);

  insert into public.billing_events as be (id, type, test, payload)
  values (v_id, v_type, v_test, p_event)
  on conflict (id) do update set attempts = be.attempts + 1
  returning (be.xmax = 0), be.status into v_inserted, v_prev;
  if not v_inserted and v_prev <> 'received' then
    return jsonb_build_object('status', 'duplicate', 'event_id', v_id);
  end if;

  if v_test then
    update public.billing_events set status = 'test', processed_at = now(), detail = 'test delivery: no side effects' where id = v_id;
    return jsonb_build_object('status', 'test', 'event_id', v_id);
  end if;

  -- who is it? our customerId (= user id), checkout metadata, then the stored Kelviq customer id
  v_user := public._kelviq_uuid(v_obj->'customer'->>'customer_id');
  if v_user is not null and not exists (select 1 from public.profiles where id = v_user) then v_user := null; end if;
  if v_user is null then
    v_user := public._kelviq_uuid(v_obj->'metadata'->>'user_id');
    if v_user is not null and not exists (select 1 from public.profiles where id = v_user) then v_user := null; end if;
  end if;
  if v_user is null and v_cust is not null then
    select id into v_user from public.profiles where kelviq_customer_id = v_cust limit 1;
  end if;

  if v_type = 'checkout.completed' then
    if v_credits is null then
      v_result := 'ignored'; v_detail := 'not an AI credit pack';
    elsif v_user is null then
      v_result := 'unmatched'; v_detail := 'no profile for this customer';
    else
      perform 1 from public.profiles where id = v_user for update;
      if public._ai_credit_add(v_user, v_credits, 'purchase', 'checkout:' || coalesce(nullif(v_obj->>'id', ''), v_id), v_plan,
                               case when coalesce(v_obj->>'amount', '') ~ '^\d{1,10}(\.\d{1,4})?$' then (v_obj->>'amount')::numeric end,
                               v_obj->>'currency', v_id, null, 'Credit pack') then
        v_detail := v_credits || ' credits added';
      else
        v_result := 'ignored'; v_detail := 'this checkout was already credited';
      end if;
    end if;

  elsif v_type in ('order.created', 'order.updated', 'order.refunded') then
    v_order_id := nullif(btrim(v_obj->>'id'), '');
    if v_credits is null or v_order_id is null then
      v_result := 'ignored'; v_detail := 'not an AI credit pack order';
    else
      select * into v_o from public.ai_credit_orders where order_id = v_order_id;
      if not found and v_user is null then
        v_result := 'unmatched'; v_detail := 'no profile for this customer';
      else
        v_units := case when coalesce(v_obj->>'amount_total_units', '') ~ '^\d{1,15}$' then (v_obj->>'amount_total_units')::bigint end;
        insert into public.ai_credit_orders as o (order_id, user_id, pack, credits, amount_units, currency, status)
        values (v_order_id, coalesce(v_o.user_id, v_user), v_plan, v_credits, v_units, upper(nullif(v_obj->>'currency', '')), v_status)
        on conflict (order_id) do update
          set status = excluded.status, amount_units = coalesce(excluded.amount_units, o.amount_units),
              currency = coalesce(excluded.currency, o.currency), updated_at = now();
        select * into v_o from public.ai_credit_orders where order_id = v_order_id;
        v_user := v_o.user_id;

        if v_type = 'order.refunded' then
          if v_status = 'REFUNDED' then
            v_res := public._ai_credit_refund(v_order_id, 'order', v_o.credits, v_id);
            v_detail := 'full refund: ' || (v_res->>'detail');
          else
            v_result := 'ignored'; v_detail := 'partial refund: credits are taken back by refund.created';
          end if;
        elsif nullif(v_obj->>'paid_at', '') is not null and v_status not like '%REFUND%'
              and v_status not in ('FAILED', 'CANCELED', 'CANCELLED', 'VOID', 'EXPIRED') then
          -- credited by checkout.completed or by the charge answer; only a lost charge answer is credited here
          if public._ai_credit_match_recharge(v_order_id) then
            v_detail := 'automatic top-up confirmed: ' || v_o.credits || ' credits added';
          else
            v_detail := 'order recorded';
          end if;
        else
          v_detail := 'order recorded (' || coalesce(nullif(v_status, ''), 'no status') || ')';
        end if;
      end if;
    end if;

  elsif v_type in ('refund.created', 'refund.updated') then
    v_order_id := nullif(btrim(v_obj->>'order_id'), '');
    v_refund_id := coalesce(nullif(btrim(v_obj->>'id'), ''), v_id);
    select * into v_o from public.ai_credit_orders where order_id = v_order_id;
    if v_order_id is null or not found then
      v_result := 'ignored'; v_detail := 'not an AI credit pack order';
    else
      v_user := v_o.user_id;
      if lower(v_status) in ('failed', 'canceled', 'cancelled', 'rejected', 'reversed') then
        -- the refund did not happen: give back what it took
        if v_o.refunds ? v_refund_id then
          select -delta into v_taken from public.ai_credit_ledger where source_key = 'refund:' || v_refund_id;
          update public.ai_credit_orders
             set refunded_credits = greatest(refunded_credits - (refunds->>v_refund_id)::integer, 0),
                 refunds = refunds - v_refund_id, updated_at = now()
           where order_id = v_order_id;
          if coalesce(v_taken, 0) > 0 then
            perform public._ai_credit_add(v_user, v_taken, 'adjust', 'refund-reversed:' || v_refund_id, v_o.pack, null, null,
                                          v_id, v_order_id, 'Refund failed: credits given back');
          end if;
          v_detail := 'refund ' || lower(v_status) || ': ' || coalesce(v_taken, 0) || ' credits given back';
        else
          v_result := 'ignored'; v_detail := 'refund ' || lower(v_status) || ' before it was counted';
        end if;
      else
        v_units := case when coalesce(v_obj->>'amount_units', '') ~ '^\d{1,15}$' then (v_obj->>'amount_units')::bigint end;
        v_res := public._ai_credit_refund(v_order_id, v_refund_id,
                   case when v_units is null or coalesce(v_o.amount_units, 0) = 0 then v_o.credits
                        else round(v_o.credits::numeric * v_units / v_o.amount_units)::integer end,
                   v_id);
        v_detail := v_res->>'detail';
      end if;
    end if;

  else
    v_result := 'ignored'; v_detail := 'event type not handled';
  end if;

  update public.billing_events
     set status = v_result, user_id = v_user, detail = v_detail, processed_at = now()
   where id = v_id;
  return jsonb_build_object('status', v_result, 'event_id', v_id, 'user_id', v_user, 'detail', v_detail);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 9. Function privileges: server only (edge functions with the service role key)
-- -------------------------------------------------------------------------------------
revoke all on function public.ai_credit_pack_credits(text)                                         from public, anon, authenticated;
revoke all on function public.ai_credit_balance(uuid)                                              from public, anon, authenticated;
revoke all on function public._ai_credit_add(uuid, integer, text, text, text, numeric, text, text, text, text) from public, anon, authenticated;
revoke all on function public.adjust_ai_credits(uuid, integer, text)                               from public, anon, authenticated;
revoke all on function public.spend_ai_credit(uuid)                                                from public, anon, authenticated;
revoke all on function public._ai_credit_match_recharge(text)                                      from public, anon, authenticated;
revoke all on function public.claim_ai_auto_recharge(uuid)                                         from public, anon, authenticated;
revoke all on function public.finish_ai_auto_recharge(uuid, text, text, text, numeric, text)       from public, anon, authenticated;
revoke all on function public.ai_credit_status(uuid)                                               from public, anon, authenticated;
revoke all on function public.set_ai_credit_settings(uuid, boolean, integer, text)                 from public, anon, authenticated;
revoke all on function public._ai_credit_refund(text, text, integer, text)                         from public, anon, authenticated;
revoke all on function public.apply_ai_credit_event(jsonb)                                         from public, anon, authenticated;

grant execute on function public.ai_credit_pack_credits(text)                                      to service_role;
grant execute on function public.ai_credit_balance(uuid)                                           to service_role;
grant execute on function public.spend_ai_credit(uuid)                                             to service_role;
grant execute on function public.claim_ai_auto_recharge(uuid)                                      to service_role;
grant execute on function public.finish_ai_auto_recharge(uuid, text, text, text, numeric, text)    to service_role;
grant execute on function public.ai_credit_status(uuid)                                            to service_role;
grant execute on function public.set_ai_credit_settings(uuid, boolean, integer, text)              to service_role;
grant execute on function public.apply_ai_credit_event(jsonb)                                      to service_role;
grant execute on function public.adjust_ai_credits(uuid, integer, text)                            to service_role;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------------------------------
-- Rollback (only if nothing was sold yet; the ledger is the record of what users paid for):
--   drop function if exists public.apply_ai_credit_event(jsonb), public._ai_credit_refund(text, text, integer, text),
--     public.set_ai_credit_settings(uuid, boolean, integer, text), public.ai_credit_status(uuid),
--     public.finish_ai_auto_recharge(uuid, text, text, text, numeric, text), public.claim_ai_auto_recharge(uuid),
--     public._ai_credit_match_recharge(text), public.spend_ai_credit(uuid), public.adjust_ai_credits(uuid, integer, text),
--     public._ai_credit_add(uuid, integer, text, text, text, numeric, text, text, text, text), public.ai_credit_balance(uuid);
--   drop view if exists public.ai_credit_balances;
--   drop table if exists public.ai_credit_orders, public.ai_credit_recharges, public.ai_credit_settings, public.ai_credit_ledger;
--   drop function if exists public.ai_credit_pack_credits(text);
-- -------------------------------------------------------------------------------------
