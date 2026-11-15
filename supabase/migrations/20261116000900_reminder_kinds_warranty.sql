-- =====================================================================================
-- ContractorDocs: after-the-job reminder kinds (roadmap D10: #37 email automations, #40 warranty tracking)
--
-- Applied: NOT YET (needs owner OK)
--
-- The `reminders` edge function (supabase/functions/reminders/postjob.ts + shared/postjob.ts) sends three more kinds
-- through the existing log public.reminders (migration 20261113000300):
--   completion   thank-you N days after a job is completed          target = job        step 'done+3'
--   maintenance  maintenance note N days after completion          target = job        step 'done+180'
--   warranty     warranty ends in 60/30/7 days / today (client)     target = Warranty   step 'exp-30', 'exp-0'
--                ... and the owner's own note                         document            step 'oexp-30'
-- Settings live in public.user_settings 'reminders.postjob' (existing table); warranty claims / term live inside the
-- Warranty document (documents.data.warrantyTracking). NO new table, NO new column.
--
-- What this changes (ADDITIVE, IDEMPOTENT; re-running is safe):
--   1. public.reminders CHECK on kind      ('invoice','estimate','visit')  + 'completion','warranty','maintenance'
--   2. public.reminders CHECK on step_key  '^(due|sent|start)[+-][0-9]{1,3}$'
--                                          + '^(done|exp|oexp)[+-][0-9]{1,4}$' (maintenance offsets reach 1825 days)
--   3. public.skip_reminder(...)           same body + the three kinds ("Skip" in the app); job kinds resolve the job
--                                          like 'visit', 'warranty' resolves a Warranty document. Same grants.
-- Every existing row stays valid (the new checks only allow more). Old kinds behave exactly as before.
--
-- Rollback (only while no row uses a new kind):
--   delete from public.reminders where kind in ('completion', 'warranty', 'maintenance');
--   then re-add the two original checks and re-run section F of 20261113000300 for skip_reminder.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1 + 2. Wider checks on public.reminders
-- -------------------------------------------------------------------------------------
do $chk$
declare
  r record;
begin
  -- the original inline checks are named reminders_kind_check / reminders_step_key_check; drop any differently
  -- named check that carries the same old lists too, so the old rule cannot keep blocking the new kinds
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.reminders'::regclass
       and c.contype = 'c'
       and c.conname not in ('reminders_kind_check', 'reminders_step_key_check')
       and (pg_get_constraintdef(c.oid) like '%''visit''%' or pg_get_constraintdef(c.oid) like '%(due|sent|start)%')
       and pg_get_constraintdef(c.oid) not like '%completion%'
       and pg_get_constraintdef(c.oid) not like '%oexp%'
  loop
    execute format('alter table public.reminders drop constraint %I', r.conname);
  end loop;
end
$chk$;

alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check
  check (kind in ('invoice', 'estimate', 'visit', 'completion', 'warranty', 'maintenance'));

alter table public.reminders drop constraint if exists reminders_step_key_check;
alter table public.reminders add constraint reminders_step_key_check
  check (step_key ~ '^(due|sent|start)[+-][0-9]{1,3}$' or step_key ~ '^(done|exp|oexp)[+-][0-9]{1,4}$');

-- -------------------------------------------------------------------------------------
-- 3. "Skip" an upcoming reminder: the 20261113000300 body, plus the three kinds
-- -------------------------------------------------------------------------------------
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
  if v_kind not in ('invoice', 'estimate', 'visit', 'completion', 'warranty', 'maintenance') or p_target_id is null or p_scheduled_for is null
     or (coalesce(p_step_key, '') !~ '^(due|sent|start)[+-][0-9]{1,3}$' and coalesce(p_step_key, '') !~ '^(done|exp|oexp)[+-][0-9]{1,4}$') then
    raise exception 'Invalid reminder' using errcode = '22023';
  end if;

  if v_kind in ('visit', 'completion', 'maintenance') then
    select j.id, j.client_id into v_job_id, v_client_id from public.jobs j where j.id = p_target_id and j.user_id = v_uid;
    if v_job_id is null then
      raise exception 'Job not found' using errcode = 'P0002';
    end if;
  else
    select * into v_doc from public.documents d
     where d.id = p_target_id and d.user_id = v_uid
       and d.type = case v_kind when 'invoice' then 'Invoice' when 'warranty' then 'Warranty' else 'Estimate' end;
    if not found then
      raise exception 'Document not found' using errcode = 'P0002';
    end if;
    v_job_id := v_doc.job_id;
    v_client_id := v_doc.client_id;
  end if;

  v_key := v_kind || ':' || p_target_id::text || ':' || p_step_key || ':' || to_char(p_scheduled_for, 'YYYY-MM-DD');
  insert into public.reminders (user_id, kind, document_id, job_id, client_id, step_key, scheduled_for, dedupe_key, status, reason, attempts)
  values (v_uid, v_kind, case when v_kind in ('visit', 'completion', 'maintenance') then null else p_target_id end, v_job_id, v_client_id,
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

-- same privileges as 20261113000300 section H
revoke all on function public.skip_reminder(text, uuid, text, date) from public, anon, authenticated;
grant execute on function public.skip_reminder(text, uuid, text, date)   to authenticated;

notify pgrst, 'reload schema';
