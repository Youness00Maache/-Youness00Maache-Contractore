-- Applied: NOT YET (needs owner OK). Covered by the owner's "Yes, approve all" for roadmap D1 (2026-11-14), but it
-- is applied only when the coordinator asks; keep this line until then.
-- =====================================================================================
-- ContractorDocs: leads + appointments (competitor roadmap D1, gaps #3, #6)
--
-- Quote requests become LEADS: the owner can also add one by hand (phone call, referral, walk-in...), move it through
-- stages (new, contacted, appointment set, quote sent, won, lost + lost reason), note a budget, a follow-up date, notes
-- and attachments, and book appointments (site visits) for a lead, a job or a client. Convert to job stays the
-- existing convert_quote_request() (unchanged: the app reads a converted request as stage "won").
--
-- ADDITIVE ONLY: new nullable / defaulted columns on quote_requests (ADD COLUMN IF NOT EXISTS), one new table
-- (appointments), two trigger functions, one INSERT policy on quote_requests, column grants. No existing column,
-- status, row, function or policy is changed or removed. Old rows keep their values; the app maps them to a stage
-- (status converted -> won, archived -> hidden, else the stored stage which defaults to 'new').
--
-- Public path unchanged: submit_quote_request() still inserts the same columns; the guard trigger below gives every
-- such row lead_source 'request_page' and forces the owner-only fields (stage, budget, follow-up, lost reason, notes,
-- attachments, last contact) to their defaults, so a visitor can never set them. anon gets no new privilege.
-- Manual leads: authenticated INSERT (own user_id, lead_source <> 'request_page' by policy); the trigger forces
-- source = 'manual', photo_paths = '{}', status = 'seen' (not counted as a new web request), no client / job link, so a
-- manual row can never look like a public submission and can't open the request-photos upload window.
-- Attachments (jsonb [{path, name, type, size, added_at}]) are files in the existing private document-assets bucket
-- under <user_id>/leads/<lead_id>/... (owner-folder policies already exist; no storage change here).
--
-- Objects
--   quote_requests + stage, lead_source, budget_min, budget_max, follow_up_on, lost_reason, notes, attachments,
--                    last_contact_at, stage_changed_at        (ADD COLUMN IF NOT EXISTS; CHECKs added NOT VALID)
--   guard_quote_request_lead()   BEFORE INSERT/UPDATE on quote_requests (see above; owner and lead_source fixed)
--   policy quote_requests_insert_own_manual  (authenticated, own rows, lead_source <> 'request_page')
--   appointments                 owner-only table (RLS), same-owner guard guard_appointment()
--
-- Rollback (owner only): drop table public.appointments; drop trigger trg_quote_requests_lead_guard on
--   public.quote_requests; drop function public.guard_quote_request_lead(), public.guard_appointment();
--   drop policy quote_requests_insert_own_manual on public.quote_requests; revoke insert, update on public.quote_requests
--   from authenticated; grant update (status) on public.quote_requests to authenticated; alter table
--   public.quote_requests drop column stage, ... (the ten columns above).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Lead columns on quote_requests (ADD COLUMN IF NOT EXISTS only)
-- -------------------------------------------------------------------------------------
alter table public.quote_requests add column if not exists stage text not null default 'new';
alter table public.quote_requests add column if not exists lead_source text not null default 'request_page';
alter table public.quote_requests add column if not exists budget_min numeric(12,2);
alter table public.quote_requests add column if not exists budget_max numeric(12,2);
alter table public.quote_requests add column if not exists follow_up_on date;
alter table public.quote_requests add column if not exists lost_reason text;
alter table public.quote_requests add column if not exists notes text;
alter table public.quote_requests add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.quote_requests add column if not exists last_contact_at timestamptz;
alter table public.quote_requests add column if not exists stage_changed_at timestamptz;

-- CHECKs: added once (NOT VALID: existing rows are not re-checked; they all hold the defaults anyway).
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('quote_requests_stage_check',
       'check (stage in (''new'', ''contacted'', ''appointment_set'', ''quote_sent'', ''won'', ''lost''))'),
      ('quote_requests_lead_source_check',
       'check (lead_source in (''request_page'', ''phone'', ''email'', ''referral'', ''walk_in'', ''website'', ''social'', ''repeat_client'', ''advertising'', ''other''))'),
      ('quote_requests_budget_check',
       'check ((budget_min is null or budget_min between 0 and 9999999999) and (budget_max is null or budget_max between 0 and 9999999999) and (budget_min is null or budget_max is null or budget_min <= budget_max))'),
      ('quote_requests_lost_reason_check', 'check (lost_reason is null or length(lost_reason) <= 300)'),
      ('quote_requests_notes_check', 'check (notes is null or length(notes) <= 5000)'),
      ('quote_requests_attachments_check',
       'check (jsonb_typeof(attachments) = ''array'' and jsonb_array_length(attachments) <= 20)')
    ) as t(name, def)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name and conrelid = 'public.quote_requests'::regclass) then
      execute format('alter table public.quote_requests add constraint %I %s not valid', c.name, c.def);
    end if;
  end loop;
end $$;

create index if not exists idx_quote_requests_user_stage on public.quote_requests (user_id, stage, created_at desc);
create index if not exists idx_quote_requests_user_follow_up on public.quote_requests (user_id, follow_up_on)
  where follow_up_on is not null;

-- -------------------------------------------------------------------------------------
-- B. Lead guard (public rows can't carry owner fields; manual rows can't look public; owner never changes)
-- -------------------------------------------------------------------------------------
create or replace function public.guard_quote_request_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item   jsonb;
  v_prefix text;
begin
  if tg_op = 'INSERT' then
    if new.lead_source = 'request_page' then
      -- public request page (submit_quote_request): owner-only fields always start empty
      new.stage := 'new';
      new.budget_min := null;
      new.budget_max := null;
      new.follow_up_on := null;
      new.lost_reason := null;
      new.notes := null;
      new.attachments := '[]'::jsonb;
      new.last_contact_at := null;
    else
      -- added by the owner: never a web submission, never linked or converted on creation
      new.source := 'manual';
      new.photo_paths := '{}'::text[];
      new.status := 'seen';
      new.client_id := null;
      new.job_id := null;
      new.converted_at := null;
      if new.stage = 'won' then
        new.stage := 'new';
      end if;
    end if;
    new.stage_changed_at := now();
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'A lead cannot change owner' using errcode = '42501';
    end if;
    new.lead_source := old.lead_source;
    if new.stage is distinct from old.stage then
      new.stage_changed_at := now();
    end if;
  end if;

  new.lost_reason := nullif(btrim(coalesce(new.lost_reason, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  if new.attachments is null then
    new.attachments := '[]'::jsonb;
  end if;
  if jsonb_typeof(new.attachments) <> 'array' then
    raise exception 'Invalid attachments' using errcode = '22023';
  end if;
  -- attachment files live in the owner's folder of document-assets: <user_id>/leads/<lead_id>/<file>
  v_prefix := new.user_id::text || '/leads/' || new.id::text || '/';
  for v_item in select e from jsonb_array_elements(new.attachments) as t(e) loop
    if jsonb_typeof(v_item) <> 'object'
       or left(coalesce(v_item->>'path', ''), length(v_prefix)) <> v_prefix
       or substr(v_item->>'path', length(v_prefix) + 1) !~ '^[A-Za-z0-9._-]{1,120}$' then
      raise exception 'Invalid attachment path' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_quote_requests_lead_guard on public.quote_requests;
create trigger trg_quote_requests_lead_guard before insert or update on public.quote_requests
  for each row execute function public.guard_quote_request_lead();

-- -------------------------------------------------------------------------------------
-- C. Appointments (site visits, estimate meetings, calls) for a lead, a job or a client
-- -------------------------------------------------------------------------------------
create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id     uuid references public.quote_requests(id) on delete set null,
  job_id      uuid references public.jobs(id) on delete set null,
  client_id   uuid references public.clients(id) on delete set null,
  kind        text not null default 'site_visit' check (kind in ('site_visit', 'estimate', 'meeting', 'call', 'other')),
  title       text not null check (length(btrim(title)) between 1 and 160),
  notes       text check (notes is null or length(notes) <= 2000),
  location    text check (location is null or length(location) <= 300),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  status      text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'no_show')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint appointments_time_check check (ends_at is null or (ends_at >= starts_at and ends_at <= starts_at + interval '7 days'))
);
comment on table public.appointments is 'Appointments of a lead / job / client (roadmap D1). Owner-only. See lib/leads/.';

create index if not exists idx_appointments_user_starts on public.appointments (user_id, starts_at);
create index if not exists idx_appointments_lead on public.appointments (lead_id) where lead_id is not null;
create index if not exists idx_appointments_job on public.appointments (job_id) where job_id is not null;
create index if not exists idx_appointments_client on public.appointments (client_id) where client_id is not null;

drop trigger if exists tr_appointments_updated_at on public.appointments;
create trigger tr_appointments_updated_at before update on public.appointments
  for each row execute function public.handle_updated_at();

-- Same owner for the lead / job / client (else refused); the owner never changes.
create or replace function public.guard_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'An appointment cannot change owner' using errcode = '42501';
  end if;
  if new.lead_id is not null
     and not exists (select 1 from public.quote_requests r where r.id = new.lead_id and r.user_id = new.user_id) then
    raise exception 'Lead not found' using errcode = '23503', detail = 'appointments.lead_id must belong to the same user';
  end if;
  if new.job_id is not null
     and not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    raise exception 'Job not found' using errcode = '23503', detail = 'appointments.job_id must belong to the same user';
  end if;
  if new.client_id is not null
     and not exists (select 1 from public.clients c where c.id = new.client_id and c.user_id = new.user_id) then
    raise exception 'Client not found' using errcode = '23503', detail = 'appointments.client_id must belong to the same user';
  end if;
  new.title := btrim(new.title);
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  new.location := nullif(btrim(coalesce(new.location, '')), '');
  return new;
end;
$$;

drop trigger if exists trg_appointments_guard on public.appointments;
create trigger trg_appointments_guard before insert or update on public.appointments
  for each row execute function public.guard_appointment();

-- -------------------------------------------------------------------------------------
-- D. Row level security + privileges
-- -------------------------------------------------------------------------------------
-- quote_requests: the owner may now add leads by hand (own rows, never 'request_page'). Select / update / delete
-- policies are unchanged (20261113000400).
drop policy if exists quote_requests_insert_own_manual on public.quote_requests;
create policy quote_requests_insert_own_manual on public.quote_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and lead_source <> 'request_page');

-- Column grants (the table-level INSERT/UPDATE stay revoked; update (status) stays as it was).
grant insert (user_id, name, phone, email, address, details, stage, lead_source, budget_min, budget_max, follow_up_on,
              lost_reason, notes, attachments, last_contact_at)
  on public.quote_requests to authenticated;
grant update (name, phone, email, address, details, stage, budget_min, budget_max, follow_up_on, lost_reason, notes,
              attachments, last_contact_at)
  on public.quote_requests to authenticated;

-- appointments: owner-only
alter table public.appointments enable row level security;

drop policy if exists appointments_select_own on public.appointments;
drop policy if exists appointments_insert_own on public.appointments;
drop policy if exists appointments_update_own on public.appointments;
drop policy if exists appointments_delete_own on public.appointments;
create policy appointments_select_own on public.appointments for select to authenticated
  using (user_id = (select auth.uid()));
create policy appointments_insert_own on public.appointments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy appointments_update_own on public.appointments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy appointments_delete_own on public.appointments for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.appointments from anon;
revoke truncate on public.appointments from authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;

-- -------------------------------------------------------------------------------------
-- E. Function privileges (triggers only: nobody calls them directly)
-- -------------------------------------------------------------------------------------
revoke all on function public.guard_quote_request_lead() from public, anon, authenticated;
revoke all on function public.guard_appointment() from public, anon, authenticated;

notify pgrst, 'reload schema';
