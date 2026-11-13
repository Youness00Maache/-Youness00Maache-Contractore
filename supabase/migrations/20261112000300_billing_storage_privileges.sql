-- =====================================================================================
-- ContractorDocs part 4/4: Kelviq billing events, storage buckets, cron, function privileges
-- =====================================================================================

-- =====================================================================================
-- A. Kelviq webhook -> profiles (called ONLY by the kelviq-webhook edge function with the service
--    role, after the signature was verified). Idempotent by event id; one transaction per event.
-- =====================================================================================

-- Our Kelviq customerId is the Supabase user id. Kelviq may echo it without dashes.
create or replace function public._kelviq_uuid(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
    when p ~* '^[0-9a-f]{32}$' then (substr(p, 1, 8) || '-' || substr(p, 9, 4) || '-' || substr(p, 13, 4) || '-'
                                     || substr(p, 17, 4) || '-' || substr(p, 21, 12))::uuid
  end;
$$;

create or replace function public._kelviq_ts(p text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end;
$$;

-- Kelviq plan identifier -> our tier (lib/plans.ts kelviqPlanIdentifier)
create or replace function public.kelviq_plan_tier(p_plan text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_plan, ''))
    when 'premium' then 'premium'
    when 'premium-ai' then 'ai'
    when 'premium_ai' then 'ai'
  end;
$$;

-- Kelviq subscription status -> profiles.subscription_status (null = not an access state)
create or replace function public._kelviq_status(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_status, ''))
    when 'active' then 'active'
    when 'trialing' then 'active'
    when 'past_due' then 'past_due'
    when 'unpaid' then 'past_due'
    when 'canceled' then 'cancelled'
    when 'cancelled' then 'cancelled'
    when 'expired' then 'cancelled'
    when 'incomplete_expired' then 'cancelled'
    when 'paused' then 'paused'
  end;
$$;

create or replace function public.apply_kelviq_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id          text := nullif(btrim(p_event->>'id'), '');
  v_type        text := nullif(btrim(p_event->>'type'), '');
  v_test        boolean := lower(coalesce(p_event->>'test', 'false')) = 'true';
  v_obj         jsonb := case when jsonb_typeof(p_event->'data'->'object') = 'object' then p_event->'data'->'object' else '{}'::jsonb end;
  v_created     timestamptz := coalesce(public._kelviq_ts(p_event->>'created_at'), now());
  v_inserted    boolean;
  v_prev_status text;
  v_user        uuid;
  v_p           public.profiles%rowtype;
  v_cust        text := coalesce(nullif(v_obj->'customer'->>'id', ''), nullif(v_obj->>'customer_id', ''));
  v_sub_id      text;
  v_tier        text := public.kelviq_plan_tier(v_obj->'plan'->>'identifier');
  v_raw_status  text := lower(coalesce(v_obj->>'status', ''));
  v_status      text;
  v_period_end  timestamptz := public._kelviq_ts(v_obj->>'billing_period_end_time');
  v_end_date    timestamptz := public._kelviq_ts(v_obj->>'end_date');
  v_result      text := 'processed';
  v_detail      text;
  v_is_current  boolean;
begin
  if v_id is null or v_type is null then
    raise exception 'Malformed Kelviq event (missing id or type)' using errcode = '22023';
  end if;

  insert into public.billing_events as be (id, type, test, payload)
  values (v_id, v_type, v_test, p_event)
  on conflict (id) do update set attempts = be.attempts + 1
  returning (be.xmax = 0), be.status into v_inserted, v_prev_status;

  if not v_inserted and v_prev_status <> 'received' then
    return jsonb_build_object('status', 'duplicate', 'event_id', v_id);
  end if;

  if v_test then
    update public.billing_events set status = 'test', processed_at = now(), detail = 'test delivery: no side effects'
     where id = v_id;
    return jsonb_build_object('status', 'test', 'event_id', v_id);
  end if;

  if v_type not in ('checkout.completed', 'subscription.created', 'subscription.updated', 'subscription.plan_changed',
                    'subscription.resumed', 'subscription.cancelled', 'subscription.paused', 'invoice.paid',
                    'invoice.payment_failed', 'order.refunded') then
    update public.billing_events set status = 'ignored', processed_at = now(), detail = 'event type not handled'
     where id = v_id;
    return jsonb_build_object('status', 'ignored', 'event_id', v_id);
  end if;

  v_sub_id := case when v_obj->>'object' = 'subscription' then nullif(v_obj->>'id', '')
                   else nullif(v_obj->>'subscription_id', '') end;

  -- ---- who is it? our customerId (= user id), checkout metadata, then stored Kelviq ids
  v_user := public._kelviq_uuid(v_obj->'customer'->>'customer_id');
  if v_user is not null and not exists (select 1 from public.profiles where id = v_user) then v_user := null; end if;
  if v_user is null then
    v_user := public._kelviq_uuid(v_obj->'metadata'->>'user_id');
    if v_user is not null and not exists (select 1 from public.profiles where id = v_user) then v_user := null; end if;
  end if;
  if v_user is null and v_cust is not null then
    select id into v_user from public.profiles where kelviq_customer_id = v_cust limit 1;
  end if;
  if v_user is null and v_sub_id is not null then
    select id into v_user from public.profiles where kelviq_subscription_id = v_sub_id limit 1;
  end if;

  if v_user is null then
    update public.billing_events set status = 'unmatched', processed_at = now(),
           detail = 'no profile for this customer' where id = v_id;
    return jsonb_build_object('status', 'unmatched', 'event_id', v_id);
  end if;

  select * into v_p from public.profiles where id = v_user for update;

  -- out-of-order delivery: never let an older event overwrite newer state
  if v_p.billing_updated_at is not null and v_created < v_p.billing_updated_at
     and v_type in ('subscription.created', 'subscription.updated', 'subscription.plan_changed',
                    'subscription.resumed', 'subscription.cancelled', 'subscription.paused',
                    'invoice.paid', 'invoice.payment_failed', 'checkout.completed') then
    update public.billing_events set status = 'stale', user_id = v_user, processed_at = now(),
           detail = 'older than the last applied billing event' where id = v_id;
    return jsonb_build_object('status', 'stale', 'event_id', v_id, 'user_id', v_user);
  end if;

  v_is_current := v_p.kelviq_subscription_id is null or v_sub_id is null or v_p.kelviq_subscription_id = v_sub_id;

  if v_type = 'checkout.completed' then
    if v_tier is null then
      v_result := 'ignored'; v_detail := 'unknown plan ' || coalesce(v_obj->'plan'->>'identifier', 'null');
    else
      update public.profiles set
        subscription_tier = v_tier,
        subscription_status = 'active',
        subscription_cancel_at = null,
        kelviq_customer_id = coalesce(v_cust, kelviq_customer_id),
        billing_updated_at = greatest(coalesce(billing_updated_at, v_created), v_created)
      where id = v_user;
    end if;

  elsif v_type in ('subscription.created', 'subscription.updated', 'subscription.plan_changed', 'subscription.resumed') then
    v_status := public._kelviq_status(v_raw_status);
    if v_raw_status = 'superseded' or v_status is null then
      v_result := 'ignored'; v_detail := 'subscription status ' || coalesce(nullif(v_raw_status, ''), 'null');
    elsif not v_is_current and v_status not in ('active', 'past_due') then
      v_result := 'ignored'; v_detail := 'event for a non-current subscription';
    else
      update public.profiles set
        subscription_tier = case
          when v_status in ('cancelled', 'paused') and coalesce(v_end_date, v_period_end, now()) <= now() then 'free'
          else coalesce(v_tier, subscription_tier) end,
        subscription_status = v_status,
        subscription_period_end = case
          when v_status = 'cancelled' then coalesce(v_end_date, v_period_end, now())
          else coalesce(v_period_end, subscription_period_end) end,
        subscription_cancel_at = v_end_date,
        kelviq_subscription_id = coalesce(v_sub_id, kelviq_subscription_id),
        kelviq_customer_id = coalesce(v_cust, kelviq_customer_id),
        billing_updated_at = greatest(coalesce(billing_updated_at, v_created), v_created)
      where id = v_user;
      if v_tier is null then v_detail := 'unknown plan; tier unchanged'; end if;
    end if;

  elsif v_type = 'subscription.cancelled' then
    if not v_is_current then
      v_result := 'ignored'; v_detail := 'event for a non-current subscription';
    else
      v_period_end := coalesce(v_end_date, v_period_end, now());
      update public.profiles set
        subscription_status = 'cancelled',
        subscription_period_end = v_period_end,
        subscription_cancel_at = v_period_end,
        subscription_tier = case when v_period_end <= now() then 'free' else subscription_tier end,
        kelviq_subscription_id = coalesce(v_sub_id, kelviq_subscription_id),
        billing_updated_at = greatest(coalesce(billing_updated_at, v_created), v_created)
      where id = v_user;
    end if;

  elsif v_type = 'subscription.paused' then
    if not v_is_current then
      v_result := 'ignored'; v_detail := 'event for a non-current subscription';
    else
      -- access continues until the end of the period that was already paid
      v_period_end := coalesce(v_period_end, public._kelviq_ts(v_obj->>'paused_at'), now());
      update public.profiles set
        subscription_status = 'paused',
        subscription_period_end = v_period_end,
        subscription_tier = case when v_period_end <= now() then 'free' else subscription_tier end,
        kelviq_subscription_id = coalesce(v_sub_id, kelviq_subscription_id),
        billing_updated_at = greatest(coalesce(billing_updated_at, v_created), v_created)
      where id = v_user;
    end if;

  elsif v_type = 'invoice.paid' then
    if not v_is_current then
      v_result := 'ignored'; v_detail := 'invoice for a non-current subscription';
    else
      update public.profiles set
        subscription_status = case when subscription_status = 'past_due' then 'active' else subscription_status end,
        kelviq_subscription_id = coalesce(kelviq_subscription_id, v_sub_id),
        kelviq_customer_id = coalesce(v_cust, kelviq_customer_id),
        billing_updated_at = greatest(coalesce(billing_updated_at, v_created), v_created)
      where id = v_user;
    end if;

  elsif v_type = 'invoice.payment_failed' then
    if not v_is_current then
      v_result := 'ignored'; v_detail := 'invoice for a non-current subscription';
    else
      -- keep access: Kelviq retries for up to 14 days, then sends subscription.cancelled
      update public.profiles set
        subscription_status = case when subscription_status = 'active' and subscription_tier <> 'free'
                                   then 'past_due' else subscription_status end,
        billing_updated_at = greatest(coalesce(billing_updated_at, v_created), v_created)
      where id = v_user;
    end if;

  elsif v_type = 'order.refunded' then
    if upper(coalesce(v_obj->>'status', '')) = 'REFUNDED' and v_is_current then
      -- full refund of the current subscription: access ends now
      update public.profiles set
        subscription_tier = 'free',
        subscription_status = 'cancelled',
        subscription_period_end = now(),
        subscription_cancel_at = now(),
        billing_updated_at = greatest(coalesce(billing_updated_at, v_created), v_created)
      where id = v_user;
    else
      v_result := 'ignored'; v_detail := 'partial refund or other subscription: recorded only';
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

-- =====================================================================================
-- B. Storage buckets (owner folder = first path segment = auth.uid())
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('logos',             'logos',             true,   5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('forum',             'forum',             true,   5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('price-book-images', 'price-book-images', true,   5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('signatures',        'signatures',        false,  1048576, array['image/png', 'image/jpeg', 'image/webp']),
  ('document-assets',   'document-assets',   false, 15728640, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets are readable by anyone through the public URL endpoint (no policy needed).
-- Through the API, a signed-in user can list/read/write/delete only inside their own folder.
create policy cd_storage_select_own on storage.objects for select to authenticated
  using (bucket_id in ('logos', 'forum', 'price-book-images', 'signatures', 'document-assets')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy cd_storage_insert_own on storage.objects for insert to authenticated
  with check (bucket_id in ('logos', 'forum', 'price-book-images', 'signatures', 'document-assets')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy cd_storage_update_own on storage.objects for update to authenticated
  using (bucket_id in ('logos', 'forum', 'price-book-images', 'signatures', 'document-assets')
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('logos', 'forum', 'price-book-images', 'signatures', 'document-assets')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy cd_storage_delete_own on storage.objects for delete to authenticated
  using (bucket_id in ('logos', 'forum', 'price-book-images', 'signatures', 'document-assets')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================================
-- C. Hourly housekeeping (pg_cron is available on Supabase; skipped quietly if it isn't)
-- =====================================================================================
do $outer$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('contractordocs-expire-lapsed-subscriptions', '17 * * * *',
                        'select public.expire_lapsed_subscriptions()');
exception when others then
  raise notice 'pg_cron not available (%): run select public.expire_lapsed_subscriptions() periodically', sqlerrm;
end
$outer$;

-- =====================================================================================
-- D. Function privileges: default-deny, then explicit grants.
--    (Postgres grants EXECUTE to PUBLIC and Supabase to anon/authenticated by default.)
--    Trigger functions need no grant to fire.
-- =====================================================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- public client pages (no login)
grant execute on function public.get_portal_data(text)                                to anon, authenticated;
grant execute on function public.sign_document_via_portal(text, uuid, text, text)     to anon, authenticated;
grant execute on function public.decline_document_via_portal(text, uuid, text, text)  to anon, authenticated;
grant execute on function public.get_document_by_token(uuid)                          to anon, authenticated;
grant execute on function public.approve_document_by_token(uuid, text, text)          to anon, authenticated;
grant execute on function public.decline_document_by_token(uuid, text, text)          to anon, authenticated;

-- signed-in app
grant execute on function public.get_my_usage()                                       to authenticated;
grant execute on function public.record_usage(text, integer)                          to authenticated;
grant execute on function public.plan_limits(text)                                    to authenticated;
grant execute on function public.mark_documents_viewed(uuid[])                        to authenticated;
grant execute on function public.adjust_inventory(uuid, numeric, text, uuid)          to authenticated;
grant execute on function public.checkout_inventory(uuid, numeric, uuid, text)        to authenticated;
grant execute on function public.toggle_forum_vote(uuid, integer)                     to authenticated;
grant execute on function public.toggle_forum_comment_vote(uuid, integer)             to authenticated;
grant execute on function public.generate_due_recurring_invoices()                    to authenticated;

-- server only (edge functions with the service role key)
grant execute on function public.consume_usage(uuid, text, integer)                   to service_role;
grant execute on function public.consume_ai_credit(uuid)                              to service_role;
grant execute on function public.apply_kelviq_event(jsonb)                            to service_role;
grant execute on function public.expire_lapsed_subscriptions()                        to service_role;
grant execute on function public.kelviq_plan_tier(text)                               to service_role;

notify pgrst, 'reload schema';
