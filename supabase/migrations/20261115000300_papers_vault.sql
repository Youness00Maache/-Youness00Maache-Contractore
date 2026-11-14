-- =====================================================================================
-- ContractorDocs: "Papers" vault (competitor gap #17, NEXT_STEPS 0c "NEXT")
--
-- Company papers with an expiry date: insurance certificates (COI), licenses, permits (per job, with the next
-- inspection date), bonds, W-9 and others. Each has a type, number, issuer, dates, an optional file and its own
-- reminder steps (30, 7 and 1 days before expiry by default). Reminders: the in-app bell (lib/notifications) and an
-- email to the contractor from their own Gmail, sent by the existing `reminders` edge function (pg_cron every 10
-- minutes, migration 20261113000300) once that function is redeployed with supabase/functions/reminders/papers.ts.
-- "Send COI" emails the file to a client / GC through the existing gmail function. Premium (owner rule; lien waivers,
-- which are Note documents, stay on every plan).
--
-- Files: the EXISTING private bucket `document-assets` (images + PDF, 15 MB, owner-folder policies from
-- 20261112000300), path <user_id>/papers/<paper_id>-<random>.<ext>. No new bucket, no new storage policy.
--
-- ADDITIVE ONLY: two new tables, triggers and functions. No existing table, row, function or policy is changed.
--
-- Objects
--   company_papers            the papers (owner RLS: full access to own rows; insert needs a paid plan)
--   paper_reminders           email reminder log; UNIQUE (user_id, dedupe_key) = never sent twice (server writes it)
--   guard_company_paper()     plan check on insert (PLAN_LIMIT, hint 'papers'), same-owner job, file path in the
--                             owner's folder, offsets valid
--   get_portal_credentials(key)  anon: "Licensed & insured" line in the client portal (papers the contractor marked
--                             "Show in client portal" that have not expired; no file, no internal notes)
--
-- No new cron job (the reminders cron already runs every 10 minutes).
-- Rollback: drop function public.get_portal_credentials(text), public.guard_company_paper(),
--   public._paper_offsets_ok(integer[]); drop table public.paper_reminders, public.company_papers;
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Papers
-- -------------------------------------------------------------------------------------
create or replace function public._paper_offsets_ok(p integer[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and coalesce(cardinality(p), 0) <= 4
     and coalesce((select bool_and(x is not null and x between 1 and 120) from unnest(p) as x), true);
$$;

create table if not exists public.company_papers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind              text not null check (kind in ('coi', 'license', 'permit', 'bond', 'w9', 'other')),
  title             text not null check (length(btrim(title)) between 1 and 200),
  number            text check (number is null or length(number) <= 120),
  issuer            text check (issuer is null or length(issuer) <= 200),
  issued_on         date,
  expires_on        date,
  -- permits: the job they are for, and the next inspection
  job_id            uuid references public.jobs(id) on delete set null,
  inspection_on     date,
  -- COI / bond limit (shown on the certificate line in the portal)
  coverage_amount   numeric(14, 2) check (coverage_amount is null or coverage_amount between 0 and 1000000000),
  -- file in the private document-assets bucket
  file_path         text check (file_path is null or file_path ~ '^[0-9a-f-]{36}/papers/[A-Za-z0-9_-]{6,100}\.(pdf|jpg|jpeg|png|webp)$'),
  file_name         text check (file_name is null or length(file_name) <= 200),
  file_type         text check (file_type is null or file_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  file_size         integer check (file_size is null or file_size between 1 and 15728640),
  notes             text check (notes is null or length(notes) <= 2000),
  remind            boolean not null default true,
  reminder_offsets  integer[] not null default '{30,7,1}' check (public._paper_offsets_ok(reminder_offsets)),
  show_in_portal    boolean not null default false,
  last_sent_at      timestamptz,
  last_sent_to      text check (last_sent_to is null or length(last_sent_to) <= 320),
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint company_papers_dates check (issued_on is null or expires_on is null or issued_on <= expires_on)
);
comment on table public.company_papers is 'Papers vault: COI, licenses, permits, bonds, W-9 with expiry reminders. Files in document-assets/<user>/papers/.';

create index if not exists idx_company_papers_user_expiry on public.company_papers (user_id, expires_on) where archived_at is null;
create index if not exists idx_company_papers_expiring on public.company_papers (expires_on) where archived_at is null and remind and expires_on is not null;
create index if not exists idx_company_papers_job on public.company_papers (job_id) where job_id is not null;

drop trigger if exists tr_company_papers_updated_at on public.company_papers;
create trigger tr_company_papers_updated_at before update on public.company_papers
  for each row execute function public.handle_updated_at();

create or replace function public.guard_company_paper()
returns trigger
language plpgsql
security definer
set search_path = ''
declare
  v_job_changed boolean := true;
begin
  if tg_op = 'INSERT' then
    if not public.is_service_context() and public.user_effective_tier(new.user_id) not in ('premium', 'ai') then
      raise exception 'PLAN_LIMIT: The papers vault (insurance, licenses, permits and expiry reminders) is part of Premium.'
        using errcode = 'P0001', hint = 'papers';
    end if;
  else
    v_job_changed := new.job_id is distinct from old.job_id;
  end if;
  if new.job_id is not null and v_job_changed
     and not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    raise exception 'Job not found' using errcode = '23503', detail = 'company_papers.job_id must belong to the same user';
  end if;
  if new.file_path is not null and split_part(new.file_path, '/', 1) <> new.user_id::text then
    raise exception 'Invalid file path' using errcode = '22023';
  end if;
  new.title := btrim(new.title);
  new.number := nullif(btrim(coalesce(new.number, '')), '');
  new.issuer := nullif(btrim(coalesce(new.issuer, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  -- only certificates of the company itself can show in the portal (not permits of one job, not a W-9)
  if new.kind not in ('coi', 'license', 'bond') then
    new.show_in_portal := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_company_papers_guard on public.company_papers;
create trigger trg_company_papers_guard before insert or update on public.company_papers
  for each row execute function public.guard_company_paper();

-- -------------------------------------------------------------------------------------
-- B. Email reminder log (written by the reminders edge function with the service role)
-- -------------------------------------------------------------------------------------
create table if not exists public.paper_reminders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  paper_id          uuid not null references public.company_papers(id) on delete cascade,
  expires_on        date not null,
  offset_days       integer not null check (offset_days between 1 and 120),
  scheduled_for     date not null,
  -- paper:<paper_id>:<expires_on>:-<offset> (supabase/functions/reminders/shared/papers.ts paperDedupeKey)
  dedupe_key        text not null check (length(dedupe_key) <= 200),
  status            text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  reason            text check (reason is null or reason ~ '^[a-z_]{2,40}$'),
  to_email          text check (to_email is null or length(to_email) <= 320),
  gmail_message_id  text check (gmail_message_id is null or length(gmail_message_id) <= 200),
  last_error        text check (last_error is null or length(last_error) <= 500),
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint paper_reminders_user_dedupe_key unique (user_id, dedupe_key)
);
comment on table public.paper_reminders is 'Expiry reminder emails about company papers (sent / failed / skipped); unique dedupe key = never twice.';
create index if not exists idx_paper_reminders_paper on public.paper_reminders (paper_id, expires_on);

drop trigger if exists tr_paper_reminders_updated_at on public.paper_reminders;
create trigger tr_paper_reminders_updated_at before update on public.paper_reminders
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- C. Row level security + table privileges
-- -------------------------------------------------------------------------------------
alter table public.company_papers  enable row level security;
alter table public.paper_reminders enable row level security;

drop policy if exists company_papers_select_own on public.company_papers;
drop policy if exists company_papers_insert_own on public.company_papers;
drop policy if exists company_papers_update_own on public.company_papers;
drop policy if exists company_papers_delete_own on public.company_papers;
create policy company_papers_select_own on public.company_papers for select to authenticated
  using (user_id = (select auth.uid()));
create policy company_papers_insert_own on public.company_papers for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy company_papers_update_own on public.company_papers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy company_papers_delete_own on public.company_papers for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists paper_reminders_select_own on public.paper_reminders;
create policy paper_reminders_select_own on public.paper_reminders for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.company_papers, public.paper_reminders from anon;
revoke truncate on public.company_papers from authenticated;
grant select, insert, update, delete on public.company_papers to authenticated;
revoke insert, update, delete, truncate on public.paper_reminders from authenticated;
grant select on public.paper_reminders to authenticated;
grant all on public.company_papers, public.paper_reminders to service_role;

-- -------------------------------------------------------------------------------------
-- D. Client portal: "Licensed & insured" (anon, portal key). Only what the contractor chose to show, not expired;
--    no file paths, notes or reminder settings.
-- -------------------------------------------------------------------------------------
create or replace function public.get_portal_credentials(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
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
             'kind', p.kind, 'title', p.title, 'number', p.number, 'issuer', p.issuer,
             'expires_on', p.expires_on, 'coverage_amount', p.coverage_amount)
           order by p.kind, p.expires_on nulls last)
    from public.company_papers p
    where p.user_id = v_client.user_id
      and p.show_in_portal
      and p.archived_at is null
      and p.kind in ('coi', 'license', 'bond')
      and (p.expires_on is null or p.expires_on >= (now() at time zone 'utc')::date - 1)
  ), '[]'::jsonb);
end;
$$;

-- -------------------------------------------------------------------------------------
-- E. Function privileges (default-deny, explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public._paper_offsets_ok(integer[]) from public, anon, authenticated;
revoke all on function public.guard_company_paper() from public, anon, authenticated;
revoke all on function public.get_portal_credentials(text) from public, anon, authenticated;

-- CHECK constraints call it as the writing role
grant execute on function public._paper_offsets_ok(integer[]) to authenticated, service_role;
grant execute on function public.get_portal_credentials(text) to anon, authenticated;

notify pgrst, 'reload schema';
