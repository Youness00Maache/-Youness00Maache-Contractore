-- Free plan clients: back to the old app's rule of 15 NEW clients per month (it counted clients created in the
-- current month), instead of 15 saved clients in total. get_my_usage() also reports clients_this_month
-- (clients_total is kept for older clients of the API). Approved by the owner on 2026-11-13.

create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier   text;
  v_limits jsonb;
  v_limit  integer;
  v_count  integer;
begin
  if public.is_service_context() then
    return new;
  end if;

  -- INSERT ... ON CONFLICT (upsert of an existing row) also fires BEFORE INSERT: not a new row.
  if tg_table_name = 'documents' and exists (select 1 from public.documents d where d.id = new.id) then
    return new;
  elsif tg_table_name = 'jobs' and exists (select 1 from public.jobs j where j.id = new.id) then
    return new;
  elsif tg_table_name = 'clients' and exists (select 1 from public.clients c where c.id = new.id) then
    return new;
  end if;

  v_tier := public.user_effective_tier(new.user_id);
  v_limits := public.plan_limits(v_tier);

  if tg_table_name = 'jobs' then
    v_limit := (v_limits->>'jobs')::int;
    if v_limit is null then return new; end if;
    select count(*) into v_count from public.usage_events
     where user_id = new.user_id and kind = 'job' and created_at >= date_trunc('month', now());
    if v_count >= v_limit then
      raise exception 'PLAN_LIMIT: The Free plan includes % new jobs per month and you have used them all. Upgrade to Premium for unlimited jobs.', v_limit
        using errcode = 'P0001', hint = 'jobs';
    end if;
  elsif tg_table_name = 'clients' then
    v_limit := (v_limits->>'clients')::int;
    if v_limit is null then return new; end if;
    select count(*) into v_count from public.clients
     where user_id = new.user_id and created_at >= date_trunc('month', now());
    if v_count >= v_limit then
      raise exception 'PLAN_LIMIT: The Free plan includes % new clients per month and you have used them all. Upgrade to Premium for unlimited clients.', v_limit
        using errcode = 'P0001', hint = 'clients';
    end if;
  elsif tg_table_name = 'documents' then
    v_limit := (v_limits->>'docs')::int;
    if v_limit is null then return new; end if;
    select count(*) into v_count from public.usage_events
     where user_id = new.user_id and kind = 'document' and ref_id = new.job_id
       and created_at >= date_trunc('month', now());
    if v_count >= v_limit then
      raise exception 'PLAN_LIMIT: The Free plan includes % new documents per job each month. Upgrade to Premium for unlimited documents.', v_limit
        using errcode = 'P0001', hint = 'docs';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.get_my_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_p     public.profiles%rowtype;
  v_tier  text;
  v_month timestamptz := date_trunc('month', now());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select * into v_p from public.profiles where id = v_uid;
  v_tier := public.effective_tier(v_p.subscription_tier, v_p.subscription_status, v_p.subscription_period_end);
  return jsonb_build_object(
    'tier', v_tier,
    'stored_tier', coalesce(v_p.subscription_tier, 'free'),
    'status', coalesce(v_p.subscription_status, 'none'),
    'period_end', v_p.subscription_period_end,
    'cancel_at', v_p.subscription_cancel_at,
    'month_start', v_month,
    'jobs_this_month', (select count(*) from public.usage_events where user_id = v_uid and kind = 'job' and created_at >= v_month),
    'documents_this_month', (select count(*) from public.usage_events where user_id = v_uid and kind = 'document' and created_at >= v_month),
    'clients_total', (select count(*) from public.clients where user_id = v_uid),
    'clients_this_month', (select count(*) from public.clients where user_id = v_uid and created_at >= v_month),
    'emails_this_month', (select count(*) from public.usage_events where user_id = v_uid and kind = 'email' and created_at >= v_month),
    'ai_this_month', (select count(*) from public.usage_events where user_id = v_uid and kind = 'ai' and created_at >= v_month),
    'limits', public.plan_limits(v_tier));
end;
$$;
