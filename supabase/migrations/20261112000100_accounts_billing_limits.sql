-- =====================================================================================
-- ContractorDocs part 2/4: accounts, billing protection, plan limits, usage, document guards
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Who is calling?
--   request_role(): the PostgREST/JWT role ('authenticated', 'anon', 'service_role'), or the
--   database user when there is no JWT (migrations, SQL editor, cron => 'postgres').
--   It is NOT changed by SECURITY DEFINER, so limits still apply inside definer RPCs.
-- -------------------------------------------------------------------------------------
create or replace function public.request_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
    session_user::text
  );
$$;

create or replace function public.is_service_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.request_role() in ('service_role', 'postgres', 'supabase_admin');
$$;

-- -------------------------------------------------------------------------------------
-- Plans (keep in sync with lib/plans.ts FREE_LIMITS / PAID_AI_LIMITS). ONE place in SQL.
--   jobs:    new jobs per calendar month (UTC)
--   clients: saved clients in total
--   docs:    new documents per job per calendar month
--   emails:  emails sent per calendar month
--   ai:      AI assistant requests per calendar month
--   null = unlimited
-- -------------------------------------------------------------------------------------
create or replace function public.plan_limits(p_tier text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_tier, 'free'))
    when 'premium' then jsonb_build_object('jobs', null, 'clients', null, 'docs', null, 'emails', null, 'ai', 60)
    when 'ai'      then jsonb_build_object('jobs', null, 'clients', null, 'docs', null, 'emails', null, 'ai', 600)
    else                jsonb_build_object('jobs', 6,    'clients', 15,   'docs', 12,   'emails', 10,   'ai', 15)
  end;
$$;

-- The tier that is in force right now: paid tiers keep access while active / past_due (Kelviq retries
-- for 14 days) and, when cancelled or paused, until the end of the paid period.
create or replace function public.effective_tier(p_tier text, p_status text, p_period_end timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_tier not in ('premium', 'ai') then 'free'
    when coalesce(p_status, 'none') in ('active', 'past_due', 'none') then p_tier
    when p_status in ('cancelled', 'paused') and p_period_end is not null and p_period_end > now() then p_tier
    else 'free'
  end;
$$;

create or replace function public.user_effective_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.effective_tier(p.subscription_tier, p.subscription_status, p.subscription_period_end)
                   from public.profiles p where p.id = p_user_id), 'free');
$$;

-- -------------------------------------------------------------------------------------
-- Profile row for every new auth user (copies name/email from the sign-up metadata)
-- -------------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, profile_picture_url)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), ''),
    nullif(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when the user changes their login email
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- -------------------------------------------------------------------------------------
-- Billing / credit columns: only the service role or trusted (definer) functions may change them.
-- Browser roles get a clear error instead of a silent no-op.
-- -------------------------------------------------------------------------------------
create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- current_user is 'authenticated'/'anon' for direct API writes, and the function owner inside
  -- SECURITY DEFINER functions; the JWT role must also not be a browser role unless inside a definer fn.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.subscription_tier, 'free') <> 'free'
       or coalesce(new.subscription_status, 'none') <> 'none'
       or new.subscription_period_end is not null or new.subscription_cancel_at is not null
       or new.kelviq_customer_id is not null or new.kelviq_subscription_id is not null
       or new.billing_updated_at is not null or coalesce(new.ai_credits_used, 0) <> 0
       or new.ai_credits_period_start is not null then
      raise exception 'Billing fields can only be changed by the billing system'
        using errcode = '42501', hint = 'Subscriptions are updated by the Kelviq webhook.';
    end if;
    return new;
  end if;

  if new.subscription_tier       is distinct from old.subscription_tier
  or new.subscription_status     is distinct from old.subscription_status
  or new.subscription_period_end is distinct from old.subscription_period_end
  or new.subscription_cancel_at  is distinct from old.subscription_cancel_at
  or new.kelviq_customer_id      is distinct from old.kelviq_customer_id
  or new.kelviq_subscription_id  is distinct from old.kelviq_subscription_id
  or new.billing_updated_at      is distinct from old.billing_updated_at
  or new.ai_credits_used         is distinct from old.ai_credits_used
  or new.ai_credits_period_start is distinct from old.ai_credits_period_start
  or new.id                      is distinct from old.id then
    raise exception 'Billing fields can only be changed by the billing system'
      using errcode = '42501', hint = 'Subscriptions are updated by the Kelviq webhook.';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_protect_billing
  before insert or update on public.profiles
  for each row execute function public.protect_profile_billing_columns();

-- Downgrade stored tiers whose paid period ended after a cancellation/pause (hourly cron, see part 4).
create or replace function public.expire_lapsed_subscriptions()
returns integer
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.profiles
       set subscription_tier = 'free'
     where subscription_tier <> 'free'
       and subscription_status in ('cancelled', 'paused')
       and (subscription_period_end is null or subscription_period_end <= now())
    returning 1)
  select count(*)::int from u;
$$;

-- -------------------------------------------------------------------------------------
-- Cross-tenant integrity: rows may only point at the same user's jobs / clients
-- (FK checks bypass RLS, so without this a user could attach rows to someone else's job).
-- -------------------------------------------------------------------------------------
create or replace function public.enforce_same_owner_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'documents' then
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'documents.job_id must belong to the same user';
    end if;
  end if;
  if new.client_id is not null
     and not exists (select 1 from public.clients c where c.id = new.client_id and c.user_id = new.user_id) then
    raise exception 'Client not found' using errcode = '23503', detail = 'client_id must belong to the same user';
  end if;
  return new;
end;
$$;

create trigger trg_jobs_same_owner before insert or update of client_id, user_id on public.jobs
  for each row execute function public.enforce_same_owner_refs();
create trigger trg_documents_same_owner before insert or update of job_id, client_id, user_id on public.documents
  for each row execute function public.enforce_same_owner_refs();

-- -------------------------------------------------------------------------------------
-- Free-plan limits (insert triggers). Errors start with 'PLAN_LIMIT:' so the UI can open the
-- upgrade modal. Monthly limits count creations (usage_events), so delete + re-create does not
-- free a slot. The service role (and SQL editor / cron) is not limited.
-- -------------------------------------------------------------------------------------
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
    select count(*) into v_count from public.clients where user_id = new.user_id;
    if v_count >= v_limit then
      raise exception 'PLAN_LIMIT: The Free plan includes up to % saved clients. Upgrade to Premium for unlimited clients.', v_limit
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

create trigger trg_jobs_plan_limit before insert on public.jobs
  for each row execute function public.enforce_plan_limits();
create trigger trg_clients_plan_limit before insert on public.clients
  for each row execute function public.enforce_plan_limits();
create trigger trg_documents_plan_limit before insert on public.documents
  for each row execute function public.enforce_plan_limits();

-- Count creations (only real inserts: an upsert that updates fires UPDATE triggers instead)
create or replace function public.track_creation_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'jobs' then
    insert into public.usage_events (user_id, kind, ref_id) values (new.user_id, 'job', new.id);
  elsif tg_table_name = 'documents' then
    insert into public.usage_events (user_id, kind, ref_id, meta)
    values (new.user_id, 'document', new.job_id, jsonb_build_object('document_id', new.id, 'type', new.type));
  end if;
  return null;
end;
$$;

create trigger trg_jobs_track_usage after insert on public.jobs
  for each row execute function public.track_creation_usage();
create trigger trg_documents_track_usage after insert on public.documents
  for each row execute function public.track_creation_usage();

-- -------------------------------------------------------------------------------------
-- Email / AI usage
--   record_usage(p_kind, p_count)          browser (JWT user), kinds 'email' | 'ai'
--   consume_usage(p_user_id, p_kind, ...)  service role (edge functions)
--   consume_ai_credit(p_user_id)           service role, returns remaining AI requests this month
-- All raise 'PLAN_LIMIT: ...' (and record nothing) when the monthly allowance would be exceeded.
-- -------------------------------------------------------------------------------------
create or replace function public._consume_usage(p_user_id uuid, p_kind text, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind   text := lower(btrim(coalesce(p_kind, '')));
  v_count  integer := coalesce(p_count, 1);
  v_tier   text;
  v_limit  integer;
  v_used   integer;
  v_month  timestamptz := date_trunc('month', now());
begin
  if p_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_kind not in ('email', 'ai') then
    raise exception 'Unknown usage kind: %', p_kind using errcode = '22023';
  end if;
  if v_count < 1 or v_count > 100 then
    raise exception 'Usage count must be between 1 and 100' using errcode = '22023';
  end if;

  -- serialize per user so two parallel requests cannot both pass the limit check
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  v_tier  := public.user_effective_tier(p_user_id);
  v_limit := (public.plan_limits(v_tier) ->> case v_kind when 'email' then 'emails' else 'ai' end)::int;
  select count(*) into v_used from public.usage_events
   where user_id = p_user_id and kind = v_kind and created_at >= v_month;

  if v_limit is not null and v_used + v_count > v_limit then
    if v_kind = 'email' then
      raise exception 'PLAN_LIMIT: You have sent all % emails included in the Free plan this month. Upgrade to Premium for unlimited emails.', v_limit
        using errcode = 'P0001', hint = 'emails';
    else
      raise exception 'PLAN_LIMIT: You have used all % AI requests included in your plan this month. Upgrade for more AI requests.', v_limit
        using errcode = 'P0001', hint = 'ai';
    end if;
  end if;

  insert into public.usage_events (user_id, kind)
  select p_user_id, v_kind from generate_series(1, v_count);

  if v_kind = 'ai' then
    update public.profiles
       set ai_credits_used = case when ai_credits_period_start = v_month::date then ai_credits_used + v_count else v_count end,
           ai_credits_period_start = v_month::date
     where id = p_user_id;
  end if;

  return jsonb_build_object(
    'kind', v_kind,
    'used', v_used + v_count,
    'limit', v_limit,
    'remaining', case when v_limit is null then null else greatest(v_limit - v_used - v_count, 0) end,
    'tier', v_tier);
end;
$$;

create or replace function public.record_usage(p_kind text, p_count integer default 1)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public._consume_usage(auth.uid(), p_kind, p_count);
$$;

create or replace function public.consume_usage(p_user_id uuid, p_kind text, p_count integer default 1)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public._consume_usage(p_user_id, p_kind, p_count);
$$;

create or replace function public.consume_ai_credit(p_user_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select (public._consume_usage(p_user_id, 'ai', 1) ->> 'remaining')::int;
$$;

-- Usage snapshot for the Settings / upgrade UI
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
    'emails_this_month', (select count(*) from public.usage_events where user_id = v_uid and kind = 'email' and created_at >= v_month),
    'ai_this_month', (select count(*) from public.usage_events where user_id = v_uid and kind = 'ai' and created_at >= v_month),
    'limits', public.plan_limits(v_tier));
end;
$$;

-- -------------------------------------------------------------------------------------
-- Documents: write guards
--   * refuse to save a lightweight list stub as a document (DB-001 / CORE-001 data loss)
--   * a contractor re-saving a stale form never erases the client's signature / decline fields
--   * approval links expire 60 days after they are issued (insert, token regenerated, or status
--     set to Sent again); the browser cannot set expiry/used columns itself
-- -------------------------------------------------------------------------------------
create or replace function public.guard_document_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
  v_browser boolean := current_user in ('authenticated', 'anon');
begin
  if new.data ? '__lightweight' then
    raise exception 'Refusing to save an incomplete document (list stub). Reload the document and try again.'
      using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if v_browser or new.approval_expires_at is null then
      new.approval_expires_at := now() + interval '60 days';
    end if;
    if v_browser then
      new.approval_used_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if v_browser then
    foreach k in array array['clientSignatureUrl', 'clientSignedAt', 'clientSignerName', 'clientSignedBy',
                             'clientDeclinedAt', 'clientDeclineReason']
    loop
      if (old.data ? k) and not (new.data ? k) then
        new.data := new.data || jsonb_build_object(k, old.data -> k);
      end if;
    end loop;

    new.approval_expires_at := old.approval_expires_at;
    new.approval_used_at := old.approval_used_at;
    if new.public_token is distinct from old.public_token then
      new.approval_expires_at := now() + interval '60 days';
      new.approval_used_at := null;
    elsif lower(coalesce(new.data->>'status', '')) = 'sent'
          and lower(coalesce(old.data->>'status', '')) is distinct from 'sent' then
      new.approval_expires_at := greatest(coalesce(old.approval_expires_at, now()), now() + interval '60 days');
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_documents_guard_write
  before insert or update on public.documents
  for each row execute function public.guard_document_write();

-- Mark documents as seen by the contractor: flips ONLY data.viewedByProvider (DB-001 fix).
create or replace function public.mark_documents_viewed(p_document_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with u as (
    update public.documents
       set data = jsonb_set(data, '{viewedByProvider}', 'true'::jsonb, true)
     where id = any (p_document_ids)
       and user_id = auth.uid()
       and coalesce(data->>'viewedByProvider', 'false') <> 'true'
    returning 1)
  select count(*)::int from u;
$$;
