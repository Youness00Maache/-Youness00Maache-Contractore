-- Applied 2026-11-15 with the owner's OK ("Yes, approve all", roadmap D7) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: 3 new crew_members columns (kind default 'employee'), RLS on both new tables with 8 owner policies, 6 triggers, no anon table grants, anon can run only crew_sub_get / crew_sub_accept, existing crew_tasks_get still answers.. Roadmap D7 phase A; do not run until the owner approves it.
-- =====================================================================================
-- ContractorDocs: subcontractors + sub commitments + quote comparison + the sub's view of the crew link
-- (competitor roadmap batch D7: #11, #29, #23)
--
-- Everything lives INSIDE the job page and the existing Crew area (no new top-level area). Premium (owner rule: new
-- advanced tools default to Premium); the plan check runs on insert only, so a downgraded account keeps reading,
-- paying and closing what it has.
--
--   crew_members (3 new columns)  kind 'employee' (default: every existing row and every existing insert stays an
--                                 hourly worker, unchanged) | 'subcontractor' (a company / person paid per scope),
--                                 company, trade. The existing guard, RPCs and the crew link are NOT changed; the
--                                 columns are written only by the owner (RLS owner-only; anon has no table grant and
--                                 the crew RPCs never write them).
--   sub_commitments               a subcontract on a job = COMMITTED cost of the job: scope (title + description the
--                                 sub sees), agreed amount, retainage %, schedule, status, payments made (append-only
--                                 list), the sub's acceptance (written only by crew_sub_accept), the quote it came from,
--                                 private notes. crew_member_id (a subcontractor of the same owner) is optional so a
--                                 vendor without a crew link can still be committed; sub_name keeps who it is even if
--                                 the crew member is deleted later.
--   job_quotes                    quotes collected for one scope of a job ("Electrical rough-in"): vendor, amount,
--                                 inclusions / exclusions, lead time, valid until, an https link and / or a private
--                                 file in the EXISTING bucket `document-assets` under <user_id>/quotes/<job_id>/
--                                 <random>-<name>.<ext> (owner-folder policies from 20261112000300: no new bucket, no
--                                 new storage policy). Quotes of a scope share scope_key (derived by the database).
--                                 At most ONE chosen quote per scope (unique index). Choosing one makes a DRAFT
--                                 commitment in the app (lib/subs/quoteCompare.ts commitmentDraftFromQuote).
--
-- Who writes what
--   * the contractor (browser, RLS owner-only) writes both tables, except: accepted_at / accepted_by, the status
--     'accepted' and the issued / completed / cancelled times (guard_sub_commitment_flow keeps or derives them), and
--     payments, which can only be APPENDED (guard_sub_commitment); paid_total is derived.
--   * the sub writes only through crew_sub_accept() (crew link token; issued -> accepted, once, + their name + time).
--
-- Status machine of a commitment (lib/subs/subLogic.ts OWNER_TRANSITIONS mirrors it):
--   browser: insert as draft or issued.  draft -> issued | cancelled;  issued -> draft | in_progress | completed |
--            cancelled;  accepted -> in_progress | completed | cancelled;  in_progress -> completed | cancelled;
--            completed -> in_progress (reopen);  cancelled -> draft.
--            Changing the terms (title, description, amount, retainage, dates) of an ACCEPTED commitment sends it
--            back to 'issued' (the acceptance is cleared: the sub must accept the new terms).
--   sub (crew_sub_accept): issued -> accepted.
--
-- ADDITIVE ONLY: three columns on crew_members (add column if not exists), two new tables, their triggers, new
-- functions. No existing column, row, function, trigger or policy is changed. Safe to run twice. Needs (applied in
-- production): 20261112000100 (user_effective_tier, is_service_context), 20261112000200 (_clean_text, _try_uuid),
-- 20261113000400 (_clean_multiline), 20261112000300 (document-assets bucket), 20261115000100 (crew_members,
-- _crew_member_id, _crew_rate_guard, _crew_ip_hash, crew_rate_events), 20261116000100 (job_tasks: progress counts),
-- 20261116000200 (public.suppliers: a quote's supplier_id).
--
-- Limits (keep in sync with lib/subs/subTypes.ts SUB_LIMITS): 200 commitments per job, 300 quotes per job, amounts
-- 0..99,999,999, retainage 0..50 %, 100 payments per commitment, lead time 0..3650 days, 15 MB per quote file.
--
-- Crew link (anon, signed token; exactly the crew_tasks_get / crew_task_update checks: _crew_member_id,
-- _crew_rate_guard, paused account, { error: 'invalid_link' | 'paused' }):
--   crew_sub_get(token)                       the link's OWN commitments (issued / accepted / in progress, and
--                                             completed ones of the last 90 days): scope, amount, retainage, schedule,
--                                             status, paid total, job name / address / status (what crew_portal_get
--                                             already shows) and the job's task progress counts. Never other subs,
--                                             other commitments, quotes, payments detail, private notes, job prices or
--                                             the client's contact details. Their tasks come from crew_tasks_get.
--   crew_sub_accept(token, commitment, name)  issued -> accepted (once); raises ALREADY_ACCEPTED when it isn't
--                                             'issued' any more because it was accepted.
--
-- Known gaps (documented): deleting a job cascades to job_quotes rows; their document-assets files are not queued for
-- deletion (same as D3 job files). The app removes the file when a single quote is deleted (lib/subs/subsApi.ts
-- deleteQuote). Anyone holding the link can accept (the owner too): accepted_by is the name typed, like a portal
-- answer.
--
-- Rollback: drop function public.crew_sub_accept(text, uuid, text), public.crew_sub_get(text),
--   public._crew_sub_commitment_json(public.sub_commitments), public.guard_sub_commitment(),
--   public.guard_sub_commitment_flow(), public.guard_job_quote(), public.guard_crew_member_sub();
--   drop trigger trg_crew_members_sub on public.crew_members; drop table public.sub_commitments, public.job_quotes;
--   alter table public.crew_members drop column kind, drop column company, drop column trade;
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. crew_members: kind / company / trade (existing rows become 'employee': unchanged behaviour)
-- -------------------------------------------------------------------------------------
alter table public.crew_members add column if not exists kind text not null default 'employee'
  check (kind in ('employee', 'subcontractor'));
alter table public.crew_members add column if not exists company text
  check (company is null or length(company) <= 120);
alter table public.crew_members add column if not exists trade text
  check (trade is null or length(trade) <= 60);

create index if not exists idx_crew_members_user_kind on public.crew_members (user_id, kind) where kind = 'subcontractor';

-- -------------------------------------------------------------------------------------
-- B. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.job_quotes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  -- the scope this quote is for; quotes with the same scope_key (derived: trimmed, single spaces, lower case) are compared
  scope           text not null check (length(btrim(scope)) between 1 and 200),
  scope_key       text not null default '' check (length(scope_key) <= 200),
  vendor_name     text not null check (length(btrim(vendor_name)) between 1 and 120),
  crew_member_id  uuid references public.crew_members(id) on delete set null,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  amount          numeric(12, 2) not null check (amount between 0 and 99999999),
  inclusions      text check (inclusions is null or length(inclusions) <= 4000),
  exclusions      text check (exclusions is null or length(exclusions) <= 4000),
  notes           text check (notes is null or length(notes) <= 4000),
  lead_time_days  integer check (lead_time_days is null or lead_time_days between 0 and 3650),
  valid_until     date,
  received_on     date not null default current_date,
  url             text check (url is null or (length(url) <= 2000 and url ~ '^https://[^[:space:]]+$')),
  -- private file in document-assets
  file_path       text check (file_path is null
                              or file_path ~ '^[0-9a-f-]{36}/quotes/[0-9a-f-]{36}/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(pdf|jpg|jpeg|png|webp)$'),
  file_name       text check (file_name is null or length(file_name) <= 200),
  size_bytes      integer check (size_bytes is null or size_bytes between 1 and 15728640),
  status          text not null default 'received' check (status in ('received', 'shortlisted', 'rejected', 'chosen')),
  chosen_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint job_quotes_file_path_key unique (file_path)
);
comment on table public.job_quotes is 'Quotes for a scope of a job (compare side by side, choose one -> sub commitment). Owner only. See lib/subs.';

create table if not exists public.sub_commitments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  -- a crew member of kind 'subcontractor' of the same owner (optional: a vendor without a crew link)
  crew_member_id  uuid references public.crew_members(id) on delete set null,
  -- who does the work (kept when the crew member is deleted)
  sub_name        text not null check (length(btrim(sub_name)) between 1 and 120),
  title           text not null check (length(btrim(title)) between 1 and 200),
  -- scope details the sub sees on their link
  description     text check (description is null or length(description) <= 4000),
  amount          numeric(12, 2) not null default 0 check (amount between 0 and 99999999),
  retainage_pct   numeric(5, 2) not null default 0 check (retainage_pct between 0 and 50),
  start_date      date,
  due_date        date,
  status          text not null default 'draft'
                  check (status in ('draft', 'issued', 'accepted', 'in_progress', 'completed', 'cancelled')),
  -- append-only [{id, at (date), amount, note}] (a negative amount is a correction); derived total in paid_total
  payments        jsonb not null default '[]'::jsonb
                  check (case when jsonb_typeof(payments) = 'array' then jsonb_array_length(payments) <= 100 else false end),
  paid_total      numeric(12, 2) not null default 0,
  issued_at       timestamptz,
  -- written only by crew_sub_accept
  accepted_at     timestamptz,
  accepted_by     text check (accepted_by is null or length(accepted_by) <= 120),
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  quote_id        uuid references public.job_quotes(id) on delete set null,
  -- private (never on the sub's link)
  notes           text check (notes is null or length(notes) <= 4000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sub_commitments_dates_order check (start_date is null or due_date is null or start_date <= due_date),
  constraint sub_commitments_paid_range check (paid_total >= 0 and paid_total <= amount)
);
comment on table public.sub_commitments is 'Subcontracts on a job (committed cost): scope, amount, retainage, schedule, payments, the sub''s acceptance. See lib/subs.';

create index if not exists idx_job_quotes_user_job on public.job_quotes (user_id, job_id, scope_key, amount);
create index if not exists idx_job_quotes_job on public.job_quotes (job_id);
create index if not exists idx_job_quotes_member on public.job_quotes (crew_member_id) where crew_member_id is not null;
create index if not exists idx_job_quotes_supplier on public.job_quotes (supplier_id) where supplier_id is not null;
create unique index if not exists ux_job_quotes_chosen_scope on public.job_quotes (job_id, scope_key) where status = 'chosen';
create index if not exists idx_sub_commitments_user_job on public.sub_commitments (user_id, job_id, created_at desc);
create index if not exists idx_sub_commitments_job on public.sub_commitments (job_id);
create index if not exists idx_sub_commitments_member on public.sub_commitments (crew_member_id, status) where crew_member_id is not null;
create index if not exists idx_sub_commitments_quote on public.sub_commitments (quote_id) where quote_id is not null;

drop trigger if exists tr_job_quotes_updated_at on public.job_quotes;
create trigger tr_job_quotes_updated_at before update on public.job_quotes
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_sub_commitments_updated_at on public.sub_commitments;
create trigger tr_sub_commitments_updated_at before update on public.sub_commitments
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- C. Write guards
-- -------------------------------------------------------------------------------------

-- crew_members (new columns only; runs after trg_crew_members_guard, which is unchanged): company / trade cleaned; a
-- subcontractor with open commitments (issued / accepted / in progress) can't be switched back to an employee.
create or replace function public.guard_crew_member_sub()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.company := public._clean_text(new.company, 120);
  new.trade := public._clean_text(new.trade, 60);
  -- OLD is only read inside the UPDATE branch
  if tg_op = 'UPDATE' then
    if old.kind = 'subcontractor' and new.kind = 'employee'
       and exists (select 1 from public.sub_commitments c
                    where c.crew_member_id = old.id and c.user_id = old.user_id
                      and c.status in ('issued', 'accepted', 'in_progress')) then
      raise exception 'This subcontractor has open commitments. Complete or cancel them first.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crew_members_sub on public.crew_members;
create trigger trg_crew_members_sub before insert or update on public.crew_members
  for each row execute function public.guard_crew_member_sub();

-- job_quotes: same-owner job, Premium, 300 per job, crew member / supplier of the same owner (else dropped), vendor
-- name (from the crew member or supplier when empty), scope_key, https links only, file in <user>/quotes/<job>/.
create or replace function public.guard_job_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count       integer;
  v_prefix      text;
  v_name        text;
  -- the row before this write (null on insert); OLD is only read inside the UPDATE branch
  v_old_path    text;
  v_old_status  text;
  v_old_chosen  timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id then
      raise exception 'A quote cannot move to another job' using errcode = '22023';
    end if;
    v_old_path := old.file_path;
    v_old_status := old.status;
    v_old_chosen := old.chosen_at;
  else
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'job_quotes.job_id must belong to the same user';
    end if;
    if not public.is_service_context() and public.user_effective_tier(new.user_id) not in ('premium', 'ai') then
      raise exception 'PLAN_LIMIT: Quote comparison is part of Premium.' using errcode = 'P0001', hint = 'quotes';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('job-quotes:' || new.job_id::text, 0));
    select count(*) into v_count from public.job_quotes q where q.job_id = new.job_id;
    if v_count >= 300 then
      raise exception 'A job holds up to 300 quotes. Delete rejected ones you no longer need.' using errcode = 'P0001';
    end if;
  end if;

  if new.crew_member_id is not null and not exists (
       select 1 from public.crew_members m where m.id = new.crew_member_id and m.user_id = new.user_id) then
    new.crew_member_id := null;   -- a crew member of another owner (or deleted) is dropped
  end if;
  if new.supplier_id is not null and not exists (
       select 1 from public.suppliers s where s.id = new.supplier_id and s.user_id = new.user_id) then
    new.supplier_id := null;
  end if;

  v_name := public._clean_text(new.vendor_name, 120);
  if v_name is null and new.crew_member_id is not null then
    select public._clean_text(coalesce(nullif(btrim(m.company), ''), m.name), 120) into v_name
    from public.crew_members m where m.id = new.crew_member_id;
  end if;
  if v_name is null and new.supplier_id is not null then
    select public._clean_text(s.name, 120) into v_name from public.suppliers s where s.id = new.supplier_id;
  end if;
  if v_name is null then
    raise exception 'Add who the quote is from.' using errcode = '22023';
  end if;
  new.vendor_name := v_name;

  new.scope := coalesce(public._clean_text(new.scope, 200), '');
  new.scope_key := left(lower(regexp_replace(new.scope, '\s+', ' ', 'g')), 200);
  new.amount := round(new.amount, 2);
  new.inclusions := public._clean_multiline(new.inclusions, 4000);
  new.exclusions := public._clean_multiline(new.exclusions, 4000);
  new.notes := public._clean_multiline(new.notes, 4000);
  new.url := nullif(btrim(coalesce(new.url, '')), '');
  if new.url is not null and (length(new.url) > 2000 or new.url !~ '^https://[^[:space:]]+$') then
    raise exception 'Quote links must start with https://' using errcode = '22023';
  end if;
  if new.file_path is not null and new.file_path is distinct from v_old_path then
    v_prefix := new.user_id::text || '/quotes/' || new.job_id::text || '/';
    if left(new.file_path, length(v_prefix)) <> v_prefix then
      raise exception 'Invalid file path' using errcode = '22023';
    end if;
  end if;
  if new.file_path is null then
    new.file_name := null;
    new.size_bytes := null;
  end if;
  new.file_name := nullif(left(btrim(regexp_replace(coalesce(new.file_name, ''), '[[:cntrl:]/\\]+', ' ', 'g')), 200), '');
  if new.status = 'chosen' then
    new.chosen_at := coalesce(case when v_old_status = 'chosen' then v_old_chosen end, now());
  else
    new.chosen_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_quotes_guard on public.job_quotes;
create trigger trg_job_quotes_guard before insert or update on public.job_quotes
  for each row execute function public.guard_job_quote();

-- Status machine, the sub's acceptance and the derived times.
-- NOT security definer (like guard_job_question_flow): current_user is then the writer, so a save from the browser
-- ('authenticated') is told apart from crew_sub_accept (which runs as its owner). It reads no table.
create or replace function public.guard_sub_commitment_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_browser boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if v_browser then
      if new.status not in ('draft', 'issued') then
        raise exception 'A new commitment starts as a draft or is issued' using errcode = '22023';
      end if;
      new.accepted_at := null;
      new.accepted_by := null;
      new.completed_at := null;
      new.cancelled_at := null;
      new.issued_at := case when new.status = 'issued' then now() end;
    end if;
    return new;
  end if;

  if not v_browser then
    return new;   -- crew_sub_accept / service: trusted
  end if;

  -- the sub's acceptance and the times belong to the database
  new.accepted_at := old.accepted_at;
  new.accepted_by := old.accepted_by;
  new.issued_at := old.issued_at;
  new.completed_at := old.completed_at;
  new.cancelled_at := old.cancelled_at;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft' and new.status in ('issued', 'cancelled'))
      or (old.status = 'issued' and new.status in ('draft', 'in_progress', 'completed', 'cancelled'))
      or (old.status = 'accepted' and new.status in ('in_progress', 'completed', 'cancelled'))
      or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
      or (old.status = 'completed' and new.status = 'in_progress')
      or (old.status = 'cancelled' and new.status = 'draft')) then
      raise exception 'This change of status is not allowed' using errcode = '22023';
    end if;
    if new.status = 'issued' then
      new.issued_at := now();
    elsif new.status = 'draft' then
      new.issued_at := null;
      new.accepted_at := null;
      new.accepted_by := null;
      new.cancelled_at := null;
    elsif new.status = 'completed' then
      new.completed_at := now();
    elsif new.status = 'in_progress' then
      new.completed_at := null;
    elsif new.status = 'cancelled' then
      new.cancelled_at := now();
    end if;
  elsif old.status = 'accepted'
        and (new.title is distinct from old.title or new.description is distinct from old.description
             or new.amount is distinct from old.amount or new.retainage_pct is distinct from old.retainage_pct
             or new.start_date is distinct from old.start_date or new.due_date is distinct from old.due_date) then
    -- new terms: the sub must accept them again
    new.status := 'issued';
    new.issued_at := now();
    new.accepted_at := null;
    new.accepted_by := null;
  end if;
  return new;
end;
$$;

-- Same-owner job, Premium, 200 per job, the crew member is a subcontractor of the same owner, the quote is of the
-- same job (else dropped), texts cleaned, payments append-only (normalized; total between 0 and the amount).
create or replace function public.guard_sub_commitment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count   integer;
  v_old_len integer := 0;
  v_el      jsonb;
  v_o       bigint;
  v_out     jsonb := '[]'::jsonb;
  v_amount  numeric;
  v_at      date;
  v_raw     text;
  v_new     boolean := false;
  v_name    text;
  -- the row before this write (null on insert); OLD is only read inside the UPDATE branch
  v_old_pay     jsonb;
  v_old_member  uuid;
  v_old_quote   uuid;
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id then
      raise exception 'A commitment cannot move to another job' using errcode = '22023';
    end if;
    v_old_len := jsonb_array_length(old.payments);
    v_old_pay := old.payments;
    v_old_member := old.crew_member_id;
    v_old_quote := old.quote_id;
  else
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'sub_commitments.job_id must belong to the same user';
    end if;
    if not public.is_service_context() and public.user_effective_tier(new.user_id) not in ('premium', 'ai') then
      raise exception 'PLAN_LIMIT: Subcontractor commitments are part of Premium.' using errcode = 'P0001', hint = 'subs';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('sub-commitments:' || new.job_id::text, 0));
    select count(*) into v_count from public.sub_commitments c where c.job_id = new.job_id;
    if v_count >= 200 then
      raise exception 'A job holds up to 200 commitments. Delete cancelled ones you no longer need.' using errcode = 'P0001';
    end if;
  end if;

  if new.crew_member_id is not null
     and new.crew_member_id is distinct from v_old_member
     and not exists (select 1 from public.crew_members m
                      where m.id = new.crew_member_id and m.user_id = new.user_id and m.kind = 'subcontractor') then
    raise exception 'Subcontractor not found' using errcode = '23503';
  end if;
  if new.quote_id is not null
     and new.quote_id is distinct from v_old_quote
     and not exists (select 1 from public.job_quotes q
                      where q.id = new.quote_id and q.user_id = new.user_id and q.job_id = new.job_id) then
    new.quote_id := null;
  end if;

  v_name := public._clean_text(new.sub_name, 120);
  if v_name is null and new.crew_member_id is not null then
    select public._clean_text(coalesce(nullif(btrim(m.company), ''), m.name), 120) into v_name
    from public.crew_members m where m.id = new.crew_member_id;
  end if;
  if v_name is null then
    raise exception 'Add who does the work.' using errcode = '22023';
  end if;
  new.sub_name := v_name;
  new.title := coalesce(public._clean_text(new.title, 200), '');
  new.description := public._clean_multiline(new.description, 4000);
  new.notes := public._clean_multiline(new.notes, 4000);
  new.accepted_by := public._clean_text(new.accepted_by, 120);
  new.amount := round(new.amount, 2);
  new.retainage_pct := round(new.retainage_pct, 2);

  -- payments: the existing entries never change; new ones are normalized
  if jsonb_typeof(new.payments) is distinct from 'array' then
    raise exception 'Invalid payments' using errcode = '22023';
  end if;
  if jsonb_array_length(new.payments) > 100 then
    raise exception 'A commitment holds up to 100 payments.' using errcode = '22023';
  end if;
  if v_old_len > 0 and (jsonb_array_length(new.payments) < v_old_len
       or (select jsonb_agg(p.value order by p.o) from jsonb_array_elements(new.payments) with ordinality as p(value, o)
            where p.o <= v_old_len) is distinct from v_old_pay) then
    raise exception 'Payments can be added, not changed or removed. Add a correction instead.' using errcode = '42501';
  end if;
  for v_el, v_o in select p.value, p.o from jsonb_array_elements(new.payments) with ordinality as p(value, o) loop
    if v_o <= v_old_len then
      v_out := v_out || jsonb_build_array(v_el);
      continue;
    end if;
    v_new := true;
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'Invalid payment' using errcode = '22023';
    end if;
    v_raw := btrim(coalesce(v_el->>'amount', ''));
    if v_raw !~ '^-?[0-9]{1,8}(\.[0-9]{1,2})?$' then
      raise exception 'Enter the payment amount.' using errcode = '22023';
    end if;
    v_amount := round(v_raw::numeric, 2);
    if v_amount = 0 then
      raise exception 'A payment can''t be zero.' using errcode = '22023';
    end if;
    v_at := current_date;
    if coalesce(v_el->>'at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      begin
        v_at := (v_el->>'at')::date;
      exception when others then
        v_at := current_date;
      end;
    end if;
    if v_at > current_date + 31 or v_at < date '2000-01-01' then
      raise exception 'Check the payment date.' using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', coalesce(public._try_uuid(v_el->>'id'), gen_random_uuid()),
      'at', v_at,
      'amount', v_amount,
      'note', public._clean_text(v_el->>'note', 200)));
  end loop;
  if v_new and new.status in ('draft', 'cancelled') then
    raise exception 'Issue the commitment before recording payments.' using errcode = '22023';
  end if;
  new.payments := v_out;
  new.paid_total := coalesce((select sum((p.value->>'amount')::numeric) from jsonb_array_elements(v_out) as p(value)), 0);
  if new.paid_total < 0 then
    raise exception 'Payments can''t add up to less than zero.' using errcode = '22023';
  end if;
  if new.paid_total > new.amount then
    raise exception 'Payments can''t add up to more than the agreed amount.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sub_commitments_flow on public.sub_commitments;
create trigger trg_sub_commitments_flow before insert or update on public.sub_commitments
  for each row execute function public.guard_sub_commitment_flow();
drop trigger if exists trg_sub_commitments_guard on public.sub_commitments;
create trigger trg_sub_commitments_guard before insert or update on public.sub_commitments
  for each row execute function public.guard_sub_commitment();

-- -------------------------------------------------------------------------------------
-- D. Row level security + table privileges (owner full access to own rows)
-- -------------------------------------------------------------------------------------
alter table public.job_quotes enable row level security;
alter table public.sub_commitments enable row level security;

drop policy if exists job_quotes_select_own on public.job_quotes;
drop policy if exists job_quotes_insert_own on public.job_quotes;
drop policy if exists job_quotes_update_own on public.job_quotes;
drop policy if exists job_quotes_delete_own on public.job_quotes;
create policy job_quotes_select_own on public.job_quotes for select to authenticated
  using (user_id = (select auth.uid()));
create policy job_quotes_insert_own on public.job_quotes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy job_quotes_update_own on public.job_quotes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy job_quotes_delete_own on public.job_quotes for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists sub_commitments_select_own on public.sub_commitments;
drop policy if exists sub_commitments_insert_own on public.sub_commitments;
drop policy if exists sub_commitments_update_own on public.sub_commitments;
drop policy if exists sub_commitments_delete_own on public.sub_commitments;
create policy sub_commitments_select_own on public.sub_commitments for select to authenticated
  using (user_id = (select auth.uid()));
create policy sub_commitments_insert_own on public.sub_commitments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sub_commitments_update_own on public.sub_commitments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sub_commitments_delete_own on public.sub_commitments for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.job_quotes, public.sub_commitments from anon;
revoke truncate, references, trigger on public.job_quotes, public.sub_commitments from authenticated;
grant select, insert, update, delete on public.job_quotes, public.sub_commitments to authenticated;
grant all on public.job_quotes, public.sub_commitments to service_role;

-- -------------------------------------------------------------------------------------
-- E. Crew link: the sub's view (anon, signed token; same checks as crew_tasks_get / crew_task_update)
-- -------------------------------------------------------------------------------------

-- One commitment as the sub sees it (never notes, payments detail, quote, user id or other subs). Internal helper:
-- not executable by anon / authenticated.
create or replace function public._crew_sub_commitment_json(p_c public.sub_commitments)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_c.id,
    'job_id', j.id,
    'job_name', j.name,
    'job_address', coalesce(j.client_address, ''),
    'job_status', j.status,
    'title', p_c.title,
    'description', p_c.description,
    'amount', p_c.amount,
    'retainage_pct', p_c.retainage_pct,
    'start_date', p_c.start_date,
    'due_date', p_c.due_date,
    'status', p_c.status,
    'paid_total', p_c.paid_total,
    'issued_at', p_c.issued_at,
    'accepted_at', p_c.accepted_at,
    'accepted_by', p_c.accepted_by,
    'completed_at', p_c.completed_at,
    'tasks_done', (select count(*) from public.job_tasks t
                    where t.job_id = p_c.job_id and t.user_id = p_c.user_id and t.status = 'done'),
    'tasks_total', (select count(*) from public.job_tasks t
                     where t.job_id = p_c.job_id and t.user_id = p_c.user_id))
  from public.jobs j
  where j.id = p_c.job_id and j.user_id = p_c.user_id;
$$;

-- The link's own commitments: issued / accepted / in progress, and completed ones of the last 90 days (never drafts
-- or cancelled ones). Returns { server_now, member: { name, company, trade, is_subcontractor }, commitments: [...] }
-- or { error: 'invalid_link' | 'paused' }.
create or replace function public.crew_sub_get(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text := public._crew_ip_hash();
  v_id   uuid;
  v_m    public.crew_members%rowtype;
begin
  perform set_config('cd.crew_rpc', 'on', true);
  perform public._crew_rate_guard(v_hash, null, 'view');
  v_id := public._crew_member_id(p_token);
  if v_id is null then
    insert into public.crew_rate_events (ip_hash, kind) values (v_hash, 'bad');
    return jsonb_build_object('error', 'invalid_link');
  end if;
  select * into v_m from public.crew_members where id = v_id;
  perform public._crew_rate_guard(v_hash, v_m.id, 'view');
  if public.user_effective_tier(v_m.user_id) = 'free' then
    return jsonb_build_object('error', 'paused');
  end if;

  return jsonb_build_object(
    'server_now', now(),
    'member', jsonb_build_object(
      'name', v_m.name,
      'company', v_m.company,
      'trade', v_m.trade,
      'is_subcontractor', v_m.kind = 'subcontractor'),
    'commitments', coalesce((
      select jsonb_agg(public._crew_sub_commitment_json(x.c) order by x.rank, x.due nulls last, x.created_at)
      from (
        select c as c,
               case c.status when 'issued' then 0 when 'accepted' then 1 when 'in_progress' then 2 else 3 end as rank,
               c.due_date as due, c.created_at
        from public.sub_commitments c
        join public.jobs j on j.id = c.job_id and j.user_id = c.user_id
        where c.user_id = v_m.user_id
          and c.crew_member_id = v_m.id
          and (c.status in ('issued', 'accepted', 'in_progress')
               or (c.status = 'completed' and c.completed_at > now() - interval '90 days'))
        order by c.created_at desc
        limit 100
      ) x), '[]'::jsonb));
end;
$$;

-- The sub accepts one of THEIR issued commitments (p_name: who accepts, ≤ 120 characters; empty = the crew member's
-- name). Once: a commitment already accepted raises ALREADY_ACCEPTED. Returns the commitment (same shape as one item
-- of crew_sub_get) or { error: 'invalid_link' | 'paused' }.
create or replace function public.crew_sub_accept(p_token text, p_commitment_id uuid, p_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text := public._crew_ip_hash();
  v_id   uuid;
  v_m    public.crew_members%rowtype;
  v_c    public.sub_commitments%rowtype;
  v_name text := public._clean_text(p_name, 120);
begin
  perform set_config('cd.crew_rpc', 'on', true);
  perform public._crew_rate_guard(v_hash, null, 'punch');
  v_id := public._crew_member_id(p_token);
  if v_id is null then
    insert into public.crew_rate_events (ip_hash, kind) values (v_hash, 'bad');
    return jsonb_build_object('error', 'invalid_link');
  end if;
  select * into v_m from public.crew_members where id = v_id;
  if public.user_effective_tier(v_m.user_id) = 'free' then
    return jsonb_build_object('error', 'paused');
  end if;
  perform public._crew_rate_guard(v_hash, v_m.id, 'punch');

  select c.* into v_c
  from public.sub_commitments c
  where c.id = p_commitment_id and c.user_id = v_m.user_id and c.crew_member_id = v_m.id
    and c.status in ('issued', 'accepted', 'in_progress', 'completed')
  for update;
  if not found then
    raise exception 'This commitment is not available any more. Ask your contact.' using errcode = 'P0002', hint = 'commitment';
  end if;
  if v_c.status <> 'issued' then
    raise exception 'ALREADY_ACCEPTED: This was already accepted.' using errcode = 'P0001', hint = 'already_accepted';
  end if;

  update public.sub_commitments
     set status = 'accepted',
         accepted_at = now(),
         accepted_by = coalesce(v_name, v_m.name)
   where id = v_c.id
  returning * into v_c;

  update public.crew_members set last_seen_at = now() where id = v_m.id;

  return public._crew_sub_commitment_json(v_c);
end;
$$;

-- -------------------------------------------------------------------------------------
-- F. Function privileges (default-deny, explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public.guard_crew_member_sub() from public, anon, authenticated;
revoke all on function public.guard_job_quote() from public, anon, authenticated;
revoke all on function public.guard_sub_commitment_flow() from public, anon, authenticated;
revoke all on function public.guard_sub_commitment() from public, anon, authenticated;
revoke all on function public._crew_sub_commitment_json(public.sub_commitments) from public, anon, authenticated;
revoke all on function public.crew_sub_get(text) from public, anon, authenticated;
revoke all on function public.crew_sub_accept(text, uuid, text) from public, anon, authenticated;

grant execute on function public.crew_sub_get(text)                    to anon, authenticated;
grant execute on function public.crew_sub_accept(text, uuid, text)     to anon, authenticated;

notify pgrst, 'reload schema';
