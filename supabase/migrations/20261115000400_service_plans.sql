-- Applied 2026-11-14 with the owner's OK ("Crew & field tables"), Supabase SQL editor, project iauteblvljppwzsxloyd.
-- =====================================================================================
-- ContractorDocs: recurring service plans (competitor gap #15, NEXT_STEPS 0c "NEXT")
--
-- A plan such as "HVAC maintenance, twice a year, $129 a visit" for a client: what is done, how often, the price, how it
-- is billed and who does it. The engine creates each visit ahead of time (lead_days before it):
--   * a service_visits row (Done / Skip in the app),
--   * a Work Order (status Scheduled) on the plan's job, numbered WO-YYYY-MM-NNN,
--   * with "per visit" billing, a Draft invoice for the visit (INV-YYYY-MM-NNN, due 14 days after the visit),
--   * the plan's job moves to the next visit date, so it is on the calendar, and the EXISTING visit reminders
--     (reminders edge function, job start date) remind the client when "Remind the client" is on (a per-job
--     reminder switch is set for that job; no edge-function change needed).
-- Monthly / quarterly / twice-yearly / yearly billing uses the EXISTING recurring invoices: the app creates one
-- recurring source invoice on the plan's job (data.recurrence) and generate_due_recurring_invoices() does the rest.
-- Generation runs from pg_cron every hour (visits appear even when the owner doesn't log in) and from the app
-- (generate_due_service_visits()). Idempotent: one visit per plan and day (unique key). Premium (owner rule).
--
-- ADDITIVE ONLY: two new tables, their triggers, new functions, one new cron job. Existing tables are only WRITTEN
-- the normal way (a job per plan, documents per visit, a reminder_overrides row per plan job); no existing table,
-- function or policy is altered.
--
-- Objects
--   service_plans                 the plans (owner RLS; insert needs a paid plan)
--   service_visits                one row per visit (owner can read / delete; written by the functions)
--   _service_next_date(...)       next visit date (weeks, or months keeping the anchor day: Jan 31 → Feb 28 → Mar 31)
--   _next_series_number(...)      next PREFIX-YYYY-MM-NNN number of a document type for a user
--   guard_service_plan()          plan check, same-owner client / job, anchor day, creates the plan's job
--   _sync_service_plan_job(plan)  job dates / crew / status follow the plan; per-job visit reminder switch
--   _create_service_visit(...)    visit + Work Order (+ per-visit Draft invoice)
--   _generate_service_visits(user, plan)   every due visit of a user (paid plans only)
--   generate_due_service_visits()           signed-in user (app)
--   complete_service_visit(visit, status)   Done / Skip / back to Scheduled (Work Order status follows)
--   service_plans_cron_tick()               pg_cron, every user
--   get_portal_service_plans(key)           anon: the client's plans in the portal (next visit, last visit)
--   cron job 'contractordocs-service-visits'  15 * * * *  (select public.service_plans_cron_tick())
--
-- Rollback: select cron.unschedule('contractordocs-service-visits'); drop the functions above;
--   drop table public.service_visits, public.service_plans;  (jobs and documents they created stay)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.service_plans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id          uuid references public.clients(id) on delete set null,
  client_name        text check (client_name is null or length(client_name) <= 200),
  client_address     text check (client_address is null or length(client_address) <= 500),
  -- the job the visits, work orders and invoices go on (created by guard_service_plan when empty)
  job_id             uuid references public.jobs(id) on delete set null,
  name               text not null check (length(btrim(name)) between 1 and 120),
  service            text check (service is null or length(service) <= 2000),
  price              numeric(12, 2) not null default 0 check (price between 0 and 10000000),
  -- per_visit: a Draft invoice with each visit; monthly..annual: a recurring invoice; none: billed some other way
  billing            text not null default 'per_visit' check (billing in ('per_visit', 'monthly', 'quarterly', 'semiannual', 'annual', 'none')),
  interval_unit      text not null default 'month' check (interval_unit in ('week', 'month')),
  interval_count     integer not null default 6 check (interval_count between 1 and 52),
  -- day of the month the visits keep (month plans); set from next_visit when empty
  anchor_day         integer check (anchor_day is null or anchor_day between 1 and 31),
  next_visit         date not null,
  ends_on            date,
  assigned_to        text check (assigned_to is null or length(assigned_to) <= 120),
  lead_days          integer not null default 14 check (lead_days between 0 and 60),
  remind_client      boolean not null default true,
  show_in_portal     boolean not null default true,
  status             text not null default 'active' check (status in ('active', 'paused', 'ended')),
  -- the recurring source invoice (billing monthly..annual)
  invoice_source_id  uuid references public.documents(id) on delete set null,
  visits_created     integer not null default 0 check (visits_created >= 0),
  last_generated_at  timestamptz,
  notes              text check (notes is null or length(notes) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.service_plans is 'Recurring service plans (maintenance visits). Visits are generated by _generate_service_visits (pg_cron hourly + the app).';

create table if not exists public.service_visits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  plan_id        uuid not null references public.service_plans(id) on delete cascade,
  job_id         uuid references public.jobs(id) on delete set null,
  scheduled_for  date not null,
  status         text not null default 'scheduled' check (status in ('scheduled', 'done', 'skipped')),
  assigned_to    text check (assigned_to is null or length(assigned_to) <= 120),
  work_order_id  uuid references public.documents(id) on delete set null,
  invoice_id     uuid references public.documents(id) on delete set null,
  done_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint service_visits_plan_day_key unique (plan_id, scheduled_for)
);
comment on table public.service_visits is 'Visits of service plans (one per plan and day), with their Work Order and per-visit invoice.';

create index if not exists idx_service_plans_user on public.service_plans (user_id, status, next_visit);
create index if not exists idx_service_plans_due on public.service_plans (next_visit) where status = 'active';
create index if not exists idx_service_plans_client on public.service_plans (client_id) where client_id is not null;
create index if not exists idx_service_plans_job on public.service_plans (job_id) where job_id is not null;
create index if not exists idx_service_plans_invoice_source on public.service_plans (invoice_source_id) where invoice_source_id is not null;
create index if not exists idx_service_visits_user_day on public.service_visits (user_id, scheduled_for);
create index if not exists idx_service_visits_job on public.service_visits (job_id) where job_id is not null;
create index if not exists idx_service_visits_work_order on public.service_visits (work_order_id) where work_order_id is not null;
create index if not exists idx_service_visits_invoice on public.service_visits (invoice_id) where invoice_id is not null;

drop trigger if exists tr_service_plans_updated_at on public.service_plans;
create trigger tr_service_plans_updated_at before update on public.service_plans
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_service_visits_updated_at on public.service_visits;
create trigger tr_service_visits_updated_at before update on public.service_visits
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- B. Date and number helpers
-- -------------------------------------------------------------------------------------
-- Next visit: weeks add 7 days each; months keep the anchor day, clamped to the month's length
-- (uses _add_months_anchored from 20261112000200, the same math as recurring invoices and lib/recurring.ts).
create or replace function public._service_next_date(p_date date, p_unit text, p_count integer, p_anchor integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_unit = 'week' then p_date + 7 * greatest(coalesce(p_count, 1), 1)
    else public._add_months_anchored(p_date, greatest(coalesce(p_count, 1), 1), coalesce(p_anchor, extract(day from p_date)::int))
  end;
$$;

-- Next number in the PREFIX-YYYY-MM-NNN series of a document type for the month of p_date (like the forms do).
create or replace function public._next_series_number(p_user_id uuid, p_type text, p_field text, p_prefix text, p_date date)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := p_prefix || '-' || to_char(p_date, 'YYYY-MM') || '-';
  v_max  integer;
  v_next text;
begin
  select max(substring(d.data->>p_field from length(v_base) + 1)::int) into v_max
  from public.documents d
  where d.user_id = p_user_id and d.type = p_type
    and left(d.data->>p_field, length(v_base)) = v_base
    and substring(d.data->>p_field from length(v_base) + 1) ~ '^\d{1,9}$';
  v_next := (coalesce(v_max, 0) + 1)::text;
  return v_base || case when length(v_next) >= 3 then v_next else lpad(v_next, 3, '0') end;
end;
$$;

-- -------------------------------------------------------------------------------------
-- C. Plan writes: checks, the plan's job, job follows the plan
-- -------------------------------------------------------------------------------------
create or replace function public.guard_service_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client         public.clients%rowtype;
  v_job_id         uuid;
  -- what changed (OLD is only read in the UPDATE branch)
  v_client_changed boolean := true;
  v_job_changed    boolean := true;
begin
  if tg_op = 'INSERT' then
    if not public.is_service_context() and public.user_effective_tier(new.user_id) not in ('premium', 'ai') then
      raise exception 'PLAN_LIMIT: Service plans (maintenance visits that schedule themselves) are part of Premium.'
        using errcode = 'P0001', hint = 'service_plans';
    end if;
  else
    v_client_changed := new.client_id is distinct from old.client_id;
    v_job_changed := new.job_id is distinct from old.job_id;
  end if;
  if new.client_id is not null and v_client_changed then
    select * into v_client from public.clients c where c.id = new.client_id and c.user_id = new.user_id;
    if not found then
      raise exception 'Client not found' using errcode = '23503', detail = 'service_plans.client_id must belong to the same user';
    end if;
    new.client_name := coalesce(nullif(btrim(coalesce(new.client_name, '')), ''), v_client.name);
    new.client_address := coalesce(nullif(btrim(coalesce(new.client_address, '')), ''), v_client.address);
  end if;
  if new.job_id is not null and v_job_changed
     and not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    raise exception 'Job not found' using errcode = '23503', detail = 'service_plans.job_id must belong to the same user';
  end if;
  if new.interval_unit = 'month' and new.interval_count > 24 then
    raise exception 'Choose at most 24 months between visits' using errcode = '22023';
  end if;
  new.name := btrim(new.name);
  new.assigned_to := nullif(btrim(coalesce(new.assigned_to, '')), '');
  -- month plans keep the day of the month; the app sends anchor_day = null when the user picks a new visit date or
  -- rhythm, so it is taken from that date (the generator moving next_visit keeps it: Jan 31 → Feb 28 → Mar 31)
  if new.interval_unit = 'month' and new.anchor_day is null then
    new.anchor_day := extract(day from new.next_visit)::int;
  end if;
  if new.interval_unit = 'week' then
    new.anchor_day := null;
  end if;
  -- the job the visits go on
  if tg_op = 'INSERT' and new.job_id is null then
    insert into public.jobs (user_id, name, client_id, client_name, client_address, start_date, end_date, status, worker_name)
    values (new.user_id, left(new.name || ' (service plan)', 200), new.client_id, new.client_name, new.client_address,
            new.next_visit, new.next_visit, 'active', new.assigned_to)
    returning id into v_job_id;
    new.job_id := v_job_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_plans_guard on public.service_plans;
create trigger trg_service_plans_guard before insert or update on public.service_plans
  for each row execute function public.guard_service_plan();

-- The plan's job shows the next visit (calendar, visit reminders), its crew and the plan's state; the client gets
-- visit reminders for that job when "Remind the client" is on (explicit per-job switch of the reminders feature).
create or replace function public._sync_service_plan_job(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pl       public.service_plans%rowtype;
  v_day    date;
  v_status text;
  v_today  date := (now() at time zone 'utc')::date;
begin
  select * into pl from public.service_plans where id = p_plan_id;
  if not found or pl.job_id is null then
    return;
  end if;
  select min(v.scheduled_for) into v_day
  from public.service_visits v
  where v.plan_id = pl.id and v.status = 'scheduled' and v.scheduled_for >= v_today - 1;
  if v_day is null and pl.status = 'active' then
    v_day := pl.next_visit;
  end if;
  v_status := case pl.status when 'active' then 'active' when 'paused' then 'paused' else 'completed' end;
  update public.jobs j
     set start_date = coalesce(v_day, j.start_date),
         end_date = coalesce(v_day, j.end_date),
         worker_name = coalesce(pl.assigned_to, j.worker_name),
         status = v_status
   where j.id = pl.job_id and j.user_id = pl.user_id
     and (j.start_date is distinct from coalesce(v_day, j.start_date)
          or j.end_date is distinct from coalesce(v_day, j.end_date)
          or j.worker_name is distinct from coalesce(pl.assigned_to, j.worker_name)
          or j.status is distinct from v_status);
  if to_regclass('public.reminder_overrides') is not null then
    insert into public.reminder_overrides (user_id, job_id, enabled)
    values (pl.user_id, pl.job_id, pl.remind_client and pl.status = 'active')
    on conflict (user_id, job_id) do update set enabled = excluded.enabled
      where public.reminder_overrides.enabled is distinct from excluded.enabled;
  end if;
exception when others then
  -- never block a plan save because of the job / reminder side
  raise warning 'service plans: could not update the job of plan %: %', p_plan_id, sqlerrm;
end;
$$;

create or replace function public._service_plan_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public._sync_service_plan_job(new.id);
  elsif new.next_visit is distinct from old.next_visit or new.status is distinct from old.status
     or new.assigned_to is distinct from old.assigned_to or new.remind_client is distinct from old.remind_client
     or new.job_id is distinct from old.job_id then
    perform public._sync_service_plan_job(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_service_plans_after_write on public.service_plans;
create trigger trg_service_plans_after_write after insert or update on public.service_plans
  for each row execute function public._service_plan_after_write();

-- -------------------------------------------------------------------------------------
-- D. Visits
-- -------------------------------------------------------------------------------------
-- One visit: the row, a Work Order (Scheduled) and, with per-visit billing, a Draft invoice. Null when that day
-- already has a visit (idempotent) .
create or replace function public._create_service_visit(p public.service_plans, p_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit   uuid;
  v_prof    public.profiles%rowtype;
  v_job     public.jobs%rowtype;
  v_wo      uuid;
  v_inv     uuid;
  v_company jsonb;
  v_day     text := to_char(p_date, 'YYYY-MM-DD');
  v_label   text := to_char(p_date, 'Mon FMDD, YYYY');
begin
  insert into public.service_visits (user_id, plan_id, job_id, scheduled_for, assigned_to)
  values (p.user_id, p.id, p.job_id, p_date, p.assigned_to)
  on conflict (plan_id, scheduled_for) do nothing
  returning id into v_visit;
  if v_visit is null or p.job_id is null then
    return v_visit;
  end if;
  select * into v_job from public.jobs where id = p.job_id and user_id = p.user_id;
  if not found then
    return v_visit;
  end if;
  select * into v_prof from public.profiles where id = p.user_id;
  v_company := jsonb_build_object(
    'companyName', coalesce(v_prof.company_name, v_prof.name, ''), 'companyAddress', coalesce(v_prof.address, ''),
    'companyPhone', coalesce(v_prof.phone, ''), 'companyWebsite', coalesce(v_prof.website, ''), 'logoUrl', coalesce(v_prof.logo_url, ''),
    'clientName', coalesce(p.client_name, v_job.client_name, ''), 'clientAddress', coalesce(p.client_address, v_job.client_address, ''),
    'projectName', v_job.name,
    'servicePlanId', p.id::text, 'serviceVisitId', v_visit::text);

  insert into public.documents (user_id, job_id, client_id, type, data)
  values (p.user_id, p.job_id, coalesce(p.client_id, v_job.client_id), 'Work Order',
          v_company || jsonb_build_object(
            'title', left(p.name || ' · ' || v_label, 200),
            'workOrderNumber', public._next_series_number(p.user_id, 'Work Order', 'workOrderNumber', 'WO', p_date),
            'date', v_day, 'status', 'Scheduled', 'assignedTo', coalesce(p.assigned_to, ''),
            'description', coalesce(nullif(btrim(coalesce(p.service, '')), ''), p.name),
            'materialsUsed', '', 'hours', 0, 'cost', 0, 'terms', ''))
  returning id into v_wo;

  if p.billing = 'per_visit' and p.price > 0 then
    insert into public.documents (user_id, job_id, client_id, type, data)
    values (p.user_id, p.job_id, coalesce(p.client_id, v_job.client_id), 'Invoice',
            v_company || jsonb_build_object(
              'title', p.name,
              'invoiceNumber', public._next_series_number(p.user_id, 'Invoice', 'invoiceNumber', 'INV', p_date),
              'issueDate', v_day, 'dueDate', to_char(p_date + 14, 'YYYY-MM-DD'),
              'lineItems', jsonb_build_array(jsonb_build_object(
                'id', gen_random_uuid()::text, 'description', left(p.name || ' · visit ' || v_label, 300), 'quantity', 1, 'rate', p.price)),
              'taxRate', 0, 'discount', 0, 'shipping', 0, 'amountPaid', 0,
              'notes', coalesce(p.service, ''), 'status', 'Draft'))
    returning id into v_inv;
  end if;

  update public.service_visits set work_order_id = v_wo, invoice_id = v_inv where id = v_visit;
  return v_visit;
end;
$$;

-- Every due visit of one user (or one plan): a visit is created lead_days before its day; visits more than 30 days
-- in the past are skipped (a plan started in the past, or paused for a long time, never makes a burst); at most 24
-- per plan per run. Paid plans only. One plan failing never stops the others.
create or replace function public._generate_service_visits(p_user_id uuid, p_plan_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pl        public.service_plans%rowtype;
  v_today   date := (now() at time zone 'utc')::date;
  v_next    date;
  v_iter    integer;
  v_n       integer;
  v_job     uuid;
  v_created integer := 0;
begin
  if p_user_id is null or public.user_effective_tier(p_user_id) not in ('premium', 'ai') then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service-visits:' || p_user_id::text, 0));
  for pl in
    select * from public.service_plans
    where user_id = p_user_id and status = 'active' and (p_plan_id is null or id = p_plan_id)
      and next_visit - lead_days <= v_today
    order by next_visit
  loop
    begin
      -- the plan's job was deleted: the visits need one again
      if pl.job_id is null then
        insert into public.jobs (user_id, name, client_id, client_name, client_address, start_date, end_date, status, worker_name)
        values (pl.user_id, left(pl.name || ' (service plan)', 200), pl.client_id, pl.client_name, pl.client_address,
                pl.next_visit, pl.next_visit, 'active', pl.assigned_to)
        returning id into v_job;
        update public.service_plans set job_id = v_job where id = pl.id;
        pl.job_id := v_job;
      end if;
      v_next := pl.next_visit;
      v_iter := 0;
      v_n := 0;
      while v_next - pl.lead_days <= v_today and v_iter < 24 loop
        exit when pl.ends_on is not null and v_next > pl.ends_on;
        v_iter := v_iter + 1;
        if v_next >= v_today - 30 and public._create_service_visit(pl, v_next) is not null then
          v_n := v_n + 1;
        end if;
        v_next := public._service_next_date(v_next, pl.interval_unit, pl.interval_count, pl.anchor_day);
      end loop;
      if v_next is distinct from pl.next_visit then
        update public.service_plans
           set next_visit = v_next, visits_created = visits_created + v_n, last_generated_at = now()
         where id = pl.id;
      end if;
      v_created := v_created + v_n;
    exception when others then
      raise warning 'service plans: plan % skipped: %', pl.id, sqlerrm;
    end;
  end loop;
  return v_created;
end;
$$;

-- App: the signed-in user's due visits (called after login and after a plan is saved).
create or replace function public.generate_due_service_visits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  return public._generate_service_visits(auth.uid(), null);
end;
$$;

-- pg_cron: every user with a due plan.
create or replace function public.service_plans_cron_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_total integer := 0;
begin
  for r in
    select distinct p.user_id from public.service_plans p
    where p.status = 'active' and p.next_visit - p.lead_days <= (now() at time zone 'utc')::date
  loop
    v_total := v_total + public._generate_service_visits(r.user_id, null);
  end loop;
  return v_total;
end;
$$;

-- Done / Skip / back to Scheduled. The visit's Work Order status follows (Completed / On Hold / Scheduled) and the
-- plan's job moves to the next visit.
create or replace function public.complete_service_visit(p_visit_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v       public.service_visits%rowtype;
  v_wo    text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_status not in ('scheduled', 'done', 'skipped') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.service_visits
     set status = p_status, done_at = case when p_status = 'done' then coalesce(done_at, now()) else null end
   where id = p_visit_id and user_id = v_uid
  returning * into v;
  if not found then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;
  v_wo := case p_status when 'done' then 'Completed' when 'skipped' then 'On Hold' else 'Scheduled' end;
  if v.work_order_id is not null then
    update public.documents
       set data = jsonb_set(data, '{status}', to_jsonb(v_wo))
     where id = v.work_order_id and user_id = v_uid and type = 'Work Order'
       and coalesce(data->>'status', '') is distinct from v_wo;
  end if;
  perform public._sync_service_plan_job(v.plan_id);
  return jsonb_build_object('id', v.id, 'status', v.status, 'done_at', v.done_at);
end;
$$;

-- -------------------------------------------------------------------------------------
-- E. Client portal (anon, portal key): the client's plans, next and last visit
-- -------------------------------------------------------------------------------------
create or replace function public.get_portal_service_plans(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_today  date := (now() at time zone 'utc')::date;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;
  select * into v_client from public.clients where portal_key = p_key;
  if not found then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name, 'service', p.service, 'price', p.price, 'billing', p.billing,
             'interval_unit', p.interval_unit, 'interval_count', p.interval_count, 'status', p.status,
             'next_visit', coalesce(
               (select min(v.scheduled_for) from public.service_visits v
                 where v.plan_id = p.id and v.status = 'scheduled' and v.scheduled_for >= v_today - 1),
               case when p.status = 'active' then p.next_visit end),
             'last_visit', (select max(v.scheduled_for) from public.service_visits v where v.plan_id = p.id and v.status = 'done'))
           order by p.name)
    from public.service_plans p
    where p.user_id = v_client.user_id
      and p.show_in_portal
      and p.status in ('active', 'paused')
      and (p.client_id = v_client.id
           or (p.client_id is null and lower(btrim(coalesce(p.client_name, ''))) = lower(btrim(v_client.name))))
  ), '[]'::jsonb);
end;
$$;

-- -------------------------------------------------------------------------------------
-- F. Row level security + table privileges
-- -------------------------------------------------------------------------------------
alter table public.service_plans  enable row level security;
alter table public.service_visits enable row level security;

drop policy if exists service_plans_select_own on public.service_plans;
drop policy if exists service_plans_insert_own on public.service_plans;
drop policy if exists service_plans_update_own on public.service_plans;
drop policy if exists service_plans_delete_own on public.service_plans;
create policy service_plans_select_own on public.service_plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy service_plans_insert_own on public.service_plans for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy service_plans_update_own on public.service_plans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy service_plans_delete_own on public.service_plans for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists service_visits_select_own on public.service_visits;
drop policy if exists service_visits_delete_own on public.service_visits;
create policy service_visits_select_own on public.service_visits for select to authenticated
  using (user_id = (select auth.uid()));
create policy service_visits_delete_own on public.service_visits for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.service_plans, public.service_visits from anon;
revoke truncate on public.service_plans from authenticated;
grant select, insert, update, delete on public.service_plans to authenticated;
-- visits are written by the functions (generation, complete_service_visit); the owner reads and may delete one
revoke insert, update, truncate on public.service_visits from authenticated;
grant select, delete on public.service_visits to authenticated;
grant all on public.service_plans, public.service_visits to service_role;

-- -------------------------------------------------------------------------------------
-- G. Schedule (skipped quietly when pg_cron is not available)
-- -------------------------------------------------------------------------------------
do $outer$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('contractordocs-service-visits', '15 * * * *', 'select public.service_plans_cron_tick()');
exception when others then
  raise notice 'pg_cron not available (%): call select public.service_plans_cron_tick() every hour', sqlerrm;
end
$outer$;

-- -------------------------------------------------------------------------------------
-- H. Function privileges (default-deny, explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public._service_next_date(date, text, integer, integer) from public, anon, authenticated;
revoke all on function public._next_series_number(uuid, text, text, text, date) from public, anon, authenticated;
revoke all on function public.guard_service_plan() from public, anon, authenticated;
revoke all on function public._sync_service_plan_job(uuid) from public, anon, authenticated;
revoke all on function public._service_plan_after_write() from public, anon, authenticated;
revoke all on function public._create_service_visit(public.service_plans, date) from public, anon, authenticated;
revoke all on function public._generate_service_visits(uuid, uuid) from public, anon, authenticated;
revoke all on function public.generate_due_service_visits() from public, anon, authenticated;
revoke all on function public.service_plans_cron_tick() from public, anon, authenticated;
revoke all on function public.complete_service_visit(uuid, text) from public, anon, authenticated;
revoke all on function public.get_portal_service_plans(text) from public, anon, authenticated;

grant execute on function public.generate_due_service_visits()          to authenticated;
grant execute on function public.complete_service_visit(uuid, text)     to authenticated;
grant execute on function public.get_portal_service_plans(text)         to anon, authenticated;
grant execute on function public.service_plans_cron_tick()              to service_role;

notify pgrst, 'reload schema';
