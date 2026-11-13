-- =====================================================================================
-- ContractorDocs: automatic reminders and follow-ups (NEXT_STEPS 0c.2, competitor gap #1)
--
-- Overdue-invoice reminders, estimate follow-ups and (optional) visit reminders, sent on a schedule from the
-- user's OWN Gmail by the `reminders` edge function. When to send what is decided in
-- supabase/functions/reminders/shared/schedule.ts (the app shows the same plan).
--
-- ADDITIVE ONLY: new tables, functions, one AFTER trigger on documents and one cron job. No existing row or
-- column is changed.
--
-- Objects
--   reminder_settings        one row per user (no row = defaults: on; invoices due/+7/+14, estimates +3/+7,
--                            visits off/-1 day; 9 AM America/New_York; default wording)
--   reminder_overrides       per-document / per-client / per-job on-off switch (owner RLS)
--   reminder_document_state  when an invoice/estimate was marked Sent (filled by a trigger; base date of follow-ups)
--   reminders                every reminder sent, skipped or failed. UNIQUE (user_id, dedupe_key): a reminder is
--                            never sent twice. Written by the edge function (service role) and skip_reminder().
--   reminders_config()       { launched_at }: invoices/estimates created before this are not chased unless the
--                            user switches reminders on for them (no surprise emails about old documents)
--   skip_reminder(...) / unskip_reminder(id)   "Skip" / "Undo" on an upcoming reminder (app)
--   reminders_cron_tick()    called by pg_cron every 10 minutes: POSTs to the edge function through pg_net
--   cron job 'contractordocs-reminders'  */10 * * * *
--
-- ONE-TIME SETUP after applying (SQL editor; replace the placeholders, never commit real values):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/reminders', 'reminders_function_url');
--   select vault.create_secret('<REMINDERS_CRON_SECRET: 32+ random chars, e.g. openssl rand -hex 32>', 'reminders_cron_secret');
-- and set the SAME secret on the function:  Edge Functions -> Secrets -> REMINDERS_CRON_SECRET = <same value>.
-- Deploy supabase/functions/reminders with "Verify JWT" OFF (it checks the x-reminders-secret header instead).
-- Until both secrets exist the cron tick does nothing (it only raises a notice). Test without sending:
--   curl -X POST https://<project-ref>.supabase.co/functions/v1/reminders \
--        -H "x-reminders-secret: <secret>" -H "content-type: application/json" -d '{"action":"run","dry_run":true}'
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Settings
-- -------------------------------------------------------------------------------------
create or replace function public._reminder_offsets_ok(p integer[], p_min integer, p_max integer, p_max_count integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and coalesce(cardinality(p), 0) <= p_max_count
     and coalesce((select bool_and(x is not null and x between p_min and p_max) from unnest(p) as x), true);
$$;

create table if not exists public.reminder_settings (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled           boolean not null default true,
  invoice_enabled   boolean not null default true,
  invoice_offsets   integer[] not null default '{0,7,14}',
  estimate_enabled  boolean not null default true,
  estimate_offsets  integer[] not null default '{3,7}',
  visit_enabled     boolean not null default false,
  visit_offsets     integer[] not null default '{-1}',
  send_hour         smallint not null default 9 check (send_hour between 0 and 23),
  timezone          text not null default 'America/New_York'
                    check (length(timezone) between 1 and 64 and timezone ~ '^[A-Za-z0-9_+/-]+$'),
  templates         jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(templates) = 'object' and length(templates::text) <= 20000),
  -- Premium+AI hook (AI-written wording); stored only, not used yet
  ai_wording        boolean not null default false,
  -- Gmail account to send from (null = the default account); the server only uses the user's own accounts
  account_id        uuid references public.user_gmail_accounts(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reminder_settings_invoice_offsets_check  check (public._reminder_offsets_ok(invoice_offsets, -30, 120, 6)),
  constraint reminder_settings_estimate_offsets_check check (public._reminder_offsets_ok(estimate_offsets, 1, 60, 6)),
  constraint reminder_settings_visit_offsets_check    check (public._reminder_offsets_ok(visit_offsets, -14, -1, 4))
);
comment on table public.reminder_settings is 'Automatic reminders: one row per user (no row = defaults). See supabase/functions/reminders/shared/schedule.ts.';

drop trigger if exists tr_reminder_settings_updated_at on public.reminder_settings;
create trigger tr_reminder_settings_updated_at before update on public.reminder_settings
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- B. On/off per document, client or job (explicit switches beat the settings)
-- -------------------------------------------------------------------------------------
create table if not exists public.reminder_overrides (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id  uuid references public.documents(id) on delete cascade,
  client_id    uuid references public.clients(id) on delete cascade,
  job_id       uuid references public.jobs(id) on delete cascade,
  enabled      boolean not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reminder_overrides_one_target check (num_nonnulls(document_id, client_id, job_id) = 1),
  -- plain unique constraints (NULLs are distinct) so the app can upsert on (user_id, document_id) etc.
  constraint reminder_overrides_document_key unique (user_id, document_id),
  constraint reminder_overrides_client_key unique (user_id, client_id),
  constraint reminder_overrides_job_key unique (user_id, job_id)
);
create index if not exists idx_reminder_overrides_document on public.reminder_overrides (document_id) where document_id is not null;
create index if not exists idx_reminder_overrides_client on public.reminder_overrides (client_id) where client_id is not null;
create index if not exists idx_reminder_overrides_job on public.reminder_overrides (job_id) where job_id is not null;

drop trigger if exists tr_reminder_overrides_updated_at on public.reminder_overrides;
create trigger tr_reminder_overrides_updated_at before update on public.reminder_overrides
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- C. When a document was marked Sent (estimate follow-ups count from this day; nothing goes out that same day)
-- -------------------------------------------------------------------------------------
create table if not exists public.reminder_document_state (
  document_id  uuid primary key references public.documents(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  sent_at      timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_reminder_document_state_user on public.reminder_document_state (user_id);

-- Never blocks a document save: any error is downgraded to a warning.
create or replace function public._reminders_track_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text := coalesce(new.data->>'status', '');
  v_old text := case when tg_op = 'UPDATE' then coalesce(old.data->>'status', '') else '' end;
begin
  if new.type not in ('Invoice', 'Estimate') or v_new not in ('Sent', 'Overdue') or v_old in ('Sent', 'Overdue') then
    return null;
  end if;
  begin
    insert into public.reminder_document_state (document_id, user_id, sent_at)
    values (new.id, new.user_id, now())
    on conflict (document_id) do update set sent_at = excluded.sent_at, updated_at = now();
  exception when others then
    raise warning 'reminders: could not record when document % was sent: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_documents_reminders_sent on public.documents;
create trigger trg_documents_reminders_sent
  after insert or update of data on public.documents
  for each row execute function public._reminders_track_sent();

-- -------------------------------------------------------------------------------------
-- D. Reminder log (also the "never twice" lock)
-- -------------------------------------------------------------------------------------
create table if not exists public.reminders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  kind              text not null check (kind in ('invoice', 'estimate', 'visit')),
  document_id       uuid references public.documents(id) on delete cascade,
  job_id            uuid references public.jobs(id) on delete cascade,
  client_id         uuid references public.clients(id) on delete set null,
  -- 'due+7', 'due-3', 'sent+3', 'start-1'
  step_key          text not null check (step_key ~ '^(due|sent|start)[+-][0-9]{1,3}$'),
  -- the step's date (anchor + offset); with the target and step it forms dedupe_key
  scheduled_for     date not null,
  -- kind:target_id:step_key:scheduled_for (same formula in schedule.ts dedupeKey())
  dedupe_key        text not null check (length(dedupe_key) <= 200),
  -- sending = claimed, Gmail call in progress (never re-sent; closed as failed/interrupted when stale)
  status            text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  -- email_limit, no_email, gmail_reconnect, no_gmail, skipped_by_user, gmail_rate_limit, interrupted, ...
  reason            text check (reason is null or reason ~ '^[a-z_]{2,40}$'),
  attempts          integer not null default 0 check (attempts between 0 and 10),
  to_email          text check (to_email is null or length(to_email) <= 320),
  subject           text check (subject is null or length(subject) <= 300),
  account_id        uuid references public.user_gmail_accounts(id) on delete set null,
  gmail_message_id  text check (gmail_message_id is null or length(gmail_message_id) <= 200),
  last_error        text check (last_error is null or length(last_error) <= 500),
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reminders_user_dedupe_key unique (user_id, dedupe_key),
  constraint reminders_target check (document_id is not null or job_id is not null)
);
comment on table public.reminders is 'Automatic reminders sent / skipped / failed. Unique (user_id, dedupe_key) guarantees a reminder is sent at most once.';
create index if not exists idx_reminders_user_created on public.reminders (user_id, created_at desc);
create index if not exists idx_reminders_document on public.reminders (document_id) where document_id is not null;
create index if not exists idx_reminders_job on public.reminders (job_id) where job_id is not null;
create index if not exists idx_reminders_sending on public.reminders (updated_at) where status = 'sending';

drop trigger if exists tr_reminders_updated_at on public.reminders;
create trigger tr_reminders_updated_at before update on public.reminders
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- E. Row level security and table privileges
-- -------------------------------------------------------------------------------------
alter table public.reminder_settings       enable row level security;
alter table public.reminder_overrides      enable row level security;
alter table public.reminder_document_state enable row level security;
alter table public.reminders               enable row level security;

drop policy if exists reminder_settings_select_own on public.reminder_settings;
drop policy if exists reminder_settings_insert_own on public.reminder_settings;
drop policy if exists reminder_settings_update_own on public.reminder_settings;
drop policy if exists reminder_settings_delete_own on public.reminder_settings;
create policy reminder_settings_select_own on public.reminder_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy reminder_settings_insert_own on public.reminder_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy reminder_settings_update_own on public.reminder_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reminder_settings_delete_own on public.reminder_settings for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists reminder_overrides_select_own on public.reminder_overrides;
drop policy if exists reminder_overrides_insert_own on public.reminder_overrides;
drop policy if exists reminder_overrides_update_own on public.reminder_overrides;
drop policy if exists reminder_overrides_delete_own on public.reminder_overrides;
create policy reminder_overrides_select_own on public.reminder_overrides for select to authenticated
  using (user_id = (select auth.uid()));
-- the target must be the user's own document / client / job (FK checks alone bypass RLS)
create policy reminder_overrides_insert_own on public.reminder_overrides for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())))
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid())))
    and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = (select auth.uid()))));
create policy reminder_overrides_update_own on public.reminder_overrides for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())))
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid())))
    and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = (select auth.uid()))));
create policy reminder_overrides_delete_own on public.reminder_overrides for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists reminder_document_state_select_own on public.reminder_document_state;
create policy reminder_document_state_select_own on public.reminder_document_state for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists reminders_select_own on public.reminders;
create policy reminders_select_own on public.reminders for select to authenticated
  using (user_id = (select auth.uid()));

-- Supabase grants ALL on new tables to anon/authenticated by default: tighten it.
revoke all on public.reminder_settings, public.reminder_overrides, public.reminder_document_state, public.reminders from anon;
revoke truncate on public.reminder_settings, public.reminder_overrides from authenticated;
-- written only by the server (service role), the trigger and skip/unskip_reminder()
revoke insert, update, delete, truncate on public.reminder_document_state, public.reminders from authenticated;
grant select on public.reminder_document_state, public.reminders to authenticated;
grant select, insert, update, delete on public.reminder_settings, public.reminder_overrides to authenticated;
grant all on public.reminder_settings, public.reminder_overrides, public.reminder_document_state, public.reminders to service_role;

-- -------------------------------------------------------------------------------------
-- F. Functions
-- -------------------------------------------------------------------------------------

-- reminders_config(): when the feature went live (set once, at the first apply of this migration).
do $cfg$
begin
  if to_regprocedure('public.reminders_config()') is null then
    execute format($f$
      create function public.reminders_config()
      returns jsonb
      language sql
      immutable
      set search_path = ''
      as $body$ select jsonb_build_object('launched_at', %L::timestamptz) $body$
    $f$, now());
  end if;
end
$cfg$;

-- "Skip" an upcoming reminder: records it as skipped so the server never sends that step.
create or replace function public.skip_reminder(p_kind text, p_target_id uuid, p_step_key text, p_scheduled_for date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_kind      text := lower(btrim(coalesce(p_kind, '')));
  v_doc       public.documents%rowtype;
  v_job_id    uuid;
  v_client_id uuid;
  v_key       text;
  v_id        uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_kind not in ('invoice', 'estimate', 'visit') or p_target_id is null or p_scheduled_for is null
     or coalesce(p_step_key, '') !~ '^(due|sent|start)[+-][0-9]{1,3}$' then
    raise exception 'Invalid reminder' using errcode = '22023';
  end if;

  if v_kind = 'visit' then
    select j.id, j.client_id into v_job_id, v_client_id from public.jobs j where j.id = p_target_id and j.user_id = v_uid;
    if v_job_id is null then
      raise exception 'Job not found' using errcode = 'P0002';
    end if;
  else
    select * into v_doc from public.documents d
     where d.id = p_target_id and d.user_id = v_uid
       and d.type = case v_kind when 'invoice' then 'Invoice' else 'Estimate' end;
    if not found then
      raise exception 'Document not found' using errcode = 'P0002';
    end if;
    v_job_id := v_doc.job_id;
    v_client_id := v_doc.client_id;
  end if;

  v_key := v_kind || ':' || p_target_id::text || ':' || p_step_key || ':' || to_char(p_scheduled_for, 'YYYY-MM-DD');
  insert into public.reminders (user_id, kind, document_id, job_id, client_id, step_key, scheduled_for, dedupe_key, status, reason, attempts)
  values (v_uid, v_kind, case when v_kind = 'visit' then null else p_target_id end, v_job_id, v_client_id,
          p_step_key, p_scheduled_for, v_key, 'skipped', 'skipped_by_user', 0)
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- already recorded: fine when it is a skip, otherwise it was sent (or is being sent) already
    select r.id into v_id from public.reminders r
     where r.user_id = v_uid and r.dedupe_key = v_key and r.status = 'skipped';
    if v_id is null then
      raise exception 'This reminder was already sent' using errcode = '23505';
    end if;
  end if;
  return v_id;
end;
$$;

-- "Undo" a skip made in the app.
create or replace function public.unskip_reminder(p_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with d as (
    delete from public.reminders
     where id = p_id and user_id = auth.uid() and status = 'skipped' and reason = 'skipped_by_user'
    returning 1)
  select exists (select 1 from d);
$$;

-- pg_cron -> pg_net -> edge function. Reads the URL and the shared secret from Vault (see the header).
create or replace function public.reminders_cron_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_id     bigint;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'reminders_function_url' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'reminders_cron_secret' limit 1;
  exception when others then
    raise notice 'reminders: cannot read Vault (%)', sqlerrm;
    return null;
  end;
  if coalesce(v_url, '') !~ '^https://' or length(coalesce(v_secret, '')) < 16 then
    raise notice 'reminders: set the Vault secrets reminders_function_url and reminders_cron_secret to enable sending';
    return null;
  end if;
  select net.http_post(
           url := v_url,
           body := jsonb_build_object('action', 'run', 'source', 'pg_cron'),
           headers := jsonb_build_object('Content-Type', 'application/json', 'x-reminders-secret', v_secret),
           timeout_milliseconds := 150000)
    into v_id;
  return v_id;
end;
$$;

-- -------------------------------------------------------------------------------------
-- G. Schedule (skipped quietly when pg_cron / pg_net are not available)
-- -------------------------------------------------------------------------------------
do $outer$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net not available (%): enable it under Database -> Extensions', sqlerrm;
  end;
  create extension if not exists pg_cron;
  perform cron.schedule('contractordocs-reminders', '*/10 * * * *', 'select public.reminders_cron_tick()');
exception when others then
  raise notice 'pg_cron not available (%): call select public.reminders_cron_tick() every 10 minutes', sqlerrm;
end
$outer$;

-- -------------------------------------------------------------------------------------
-- H. Function privileges (default-deny like 20261112000300, then explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public._reminder_offsets_ok(integer[], integer, integer, integer) from public, anon, authenticated;
revoke all on function public._reminders_track_sent() from public, anon, authenticated;
revoke all on function public.reminders_config() from public, anon, authenticated;
revoke all on function public.skip_reminder(text, uuid, text, date) from public, anon, authenticated;
revoke all on function public.unskip_reminder(uuid) from public, anon, authenticated;
revoke all on function public.reminders_cron_tick() from public, anon, authenticated;

grant execute on function public.reminders_config()                      to authenticated, service_role;
grant execute on function public.skip_reminder(text, uuid, text, date)   to authenticated;
grant execute on function public.unskip_reminder(uuid)                   to authenticated;
grant execute on function public.reminders_cron_tick()                   to service_role;
-- CHECK constraints call it as the writing role
grant execute on function public._reminder_offsets_ok(integer[], integer, integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
