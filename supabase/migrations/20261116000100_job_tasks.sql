-- Applied 2026-11-15 with the owner's OK ("Yes, approve all", roadmap D2) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: RLS on both tables, 8 owner policies, 4 triggers, 6 definer functions with search_path '', anon can run only the 3 crew functions, no anon table grants, storage policy cd_crew_task_photos_insert_public.
-- =====================================================================================
-- ContractorDocs: job tasks + schedule (competitor roadmap batch D2: #16 #17 #18 #19)
--
-- Tasks live INSIDE a job (no new top-level area): title, notes, status todo / doing / blocked / done, an assignee
-- from the crew, start / due dates, milestones, dependencies on other tasks of the same job, an order, a "done"
-- photo taken by the worker, where the task came from (typed, AI, work order, template) and the work order it was
-- made from. The schedule / timeline, overdue lists, templates and the critical path are app logic
-- (lib/tasks/taskLogic.ts). Task templates are NOT a table: public.user_settings 'tasks.templates'.
--
-- The crew link (/clock/<token>, migration 20261115000100) shows the worker the tasks assigned to them and lets
-- them mark one doing / done, with an optional photo (private crew-photos bucket) and an optional comment. The
-- worker can change nothing else.
--
-- ADDITIVE ONLY: two new tables, their triggers, six functions, one storage policy. No existing table, row,
-- function or policy is changed. Safe to run twice (if not exists / create or replace / drop ... if exists).
-- Needs 20261115000100_crew_clock_in.sql (crew_members, _crew_member_id, _crew_rate_guard, _crew_ip_hash,
-- crew_rate_events, crew-photos bucket) and 20261113000400 (_clean_multiline), both applied in production.
--
-- Objects
--   job_tasks                      the tasks (owner RLS: full access to own rows)
--   task_comments                  comments on a task (owner or crew)
--   guard_job_task()               same-owner job / crew member / work order, dependencies (same job, no self, no
--                                  cycle), status timestamps, the done photo is set only by the crew link,
--                                  at most 500 tasks per job
--   cleanup_job_task_deps()        a deleted task is removed from the other tasks' dependencies
--   guard_task_comment()           same-owner task; crew comments come only from the crew link; 200 per task
--   crew_tasks_get(token)                                  anon: the worker's tasks (+ comments)
--   crew_task_update(token, task, status, comment, photo)  anon: doing / done, comment, done photo upload path
--   can_upload_crew_task_photo(name)                       anon: storage policy helper (path handed out, 24 h)
--
-- Keep in sync with lib/tasks/taskTypes.ts (TASK_STATUSES, TASK_SOURCES, TASK_LIMITS) and
-- scripts/job-tasks-check.ts (lints this file).
--
-- Rollback: drop policy cd_crew_task_photos_insert_public on storage.objects;
--   drop function public.can_upload_crew_task_photo(text), public.crew_task_update(text, uuid, text, text, text),
--   public.crew_tasks_get(text), public.guard_task_comment(), public.cleanup_job_task_deps(), public.guard_job_task();
--   drop table public.task_comments, public.job_tasks;
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.job_tasks (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id                uuid not null references public.jobs(id) on delete cascade,
  title                 text not null check (length(btrim(title)) between 1 and 200),
  notes                 text check (notes is null or length(notes) <= 4000),
  status                text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  crew_member_id        uuid references public.crew_members(id) on delete set null,
  start_date            date,
  due_date              date,
  is_milestone          boolean not null default false,
  depends_on            uuid[] not null default '{}'::uuid[] check (cardinality(depends_on) <= 50),
  sort_order            integer not null default 0 check (sort_order between -1000000 and 1000000),
  completed_at          timestamptz,
  completed_photo_path  text check (completed_photo_path is null or length(completed_photo_path) <= 300),
  source                text not null default 'manual' check (source in ('manual', 'ai', 'work_order', 'template')),
  work_order_doc_id     uuid references public.documents(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint job_tasks_dates_order check (start_date is null or due_date is null or start_date <= due_date)
);
comment on table public.job_tasks is 'Tasks inside a job (schedule, milestones, dependencies, crew). See lib/tasks/taskLogic.ts.';

create table if not exists public.task_comments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id      uuid not null references public.job_tasks(id) on delete cascade,
  body         text not null check (length(btrim(body)) between 1 and 2000),
  author_kind  text not null default 'owner' check (author_kind in ('owner', 'crew')),
  author_name  text check (author_name is null or length(author_name) <= 80),
  created_at   timestamptz not null default now()
);
comment on table public.task_comments is 'Comments on a job task, by the owner or by the assigned worker (crew link).';

create index if not exists idx_job_tasks_user_job on public.job_tasks (user_id, job_id);
create index if not exists idx_job_tasks_user_due_open on public.job_tasks (user_id, due_date) where status <> 'done';
create index if not exists idx_job_tasks_job_sort on public.job_tasks (job_id, sort_order, created_at);
create index if not exists idx_job_tasks_member_open on public.job_tasks (crew_member_id) where crew_member_id is not null;
create index if not exists idx_job_tasks_work_order on public.job_tasks (work_order_doc_id) where work_order_doc_id is not null;
create index if not exists idx_job_tasks_photo on public.job_tasks (completed_photo_path) where completed_photo_path is not null;
create index if not exists idx_job_tasks_depends_on on public.job_tasks using gin (depends_on);
create index if not exists idx_task_comments_task on public.task_comments (task_id, created_at);
create index if not exists idx_task_comments_user on public.task_comments (user_id);

drop trigger if exists tr_job_tasks_updated_at on public.job_tasks;
create trigger tr_job_tasks_updated_at before update on public.job_tasks
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- B. Write guards
--    The crew link functions set the transaction-local flag cd.task_rpc = 'on'; a browser write (PostgREST) can't
--    set it, so the guards tell the two apart without depending on current_user.
-- -------------------------------------------------------------------------------------
create or replace function public.guard_job_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rpc        boolean := coalesce(current_setting('cd.task_rpc', true), '') = 'on';
  v_count      integer;
  v_deps       uuid[];
  v_bad        uuid;
  v_old_status text;
  v_old_done   timestamptz;
  v_old_photo  text;
  -- the row before this write (null on insert); OLD is only read inside the UPDATE branch
  v_old_deps   uuid[];
  v_deps_moved boolean;
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id then
      raise exception 'A task cannot move to another job' using errcode = '22023';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'A task cannot move to another account' using errcode = '42501';
    end if;
    v_old_status := old.status;
    v_old_done := old.completed_at;
    v_old_photo := old.completed_photo_path;
    v_old_deps := old.depends_on;
  else
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'job_tasks.job_id must belong to the same user';
    end if;
  end if;

  v_deps_moved := tg_op = 'INSERT' or new.depends_on is distinct from v_old_deps;

  -- one writer per job at a time for the count and the dependency walk
  if v_deps_moved then
    perform pg_advisory_xact_lock(hashtextextended('job-tasks:' || new.job_id::text, 0));
  end if;
  if tg_op = 'INSERT' then
    select count(*) into v_count from public.job_tasks t where t.job_id = new.job_id;
    if v_count >= 500 then
      raise exception 'A job holds up to 500 tasks. Remove finished tasks you no longer need.' using errcode = 'P0001';
    end if;
  end if;

  -- assignee and work order must be the owner's own
  if new.crew_member_id is not null and not exists (
       select 1 from public.crew_members m where m.id = new.crew_member_id and m.user_id = new.user_id) then
    raise exception 'Crew member not found' using errcode = '23503';
  end if;
  if new.work_order_doc_id is not null and not exists (
       select 1 from public.documents d where d.id = new.work_order_doc_id and d.user_id = new.user_id) then
    new.work_order_doc_id := null;
  end if;

  new.title := btrim(regexp_replace(new.title, '[[:cntrl:]]+', ' ', 'g'));
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');

  -- dependencies: tasks of the same job, never itself, no cycle. Ids of deleted tasks are dropped quietly.
  if cardinality(new.depends_on) > 0 and v_deps_moved then
    if new.id = any(new.depends_on) then
      raise exception 'A task cannot depend on itself' using errcode = '22023';
    end if;
    select t.id into v_bad
    from public.job_tasks t
    where t.id = any(new.depends_on) and (t.job_id <> new.job_id or t.user_id <> new.user_id)
    limit 1;
    if found then
      raise exception 'A task can only depend on tasks of the same job' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct t.id), '{}'::uuid[]) into v_deps
    from public.job_tasks t
    where t.id = any(new.depends_on) and t.job_id = new.job_id and t.user_id = new.user_id;
    new.depends_on := v_deps;
    if cardinality(new.depends_on) > 0 and exists (
         with recursive walk(id) as (
           select unnest(new.depends_on)
           union
           select d.dep
           from walk w
           join public.job_tasks t on t.id = w.id and t.job_id = new.job_id and t.id <> new.id
           cross join lateral unnest(t.depends_on) as d(dep)
         )
         select 1 from walk where walk.id = new.id) then
      raise exception 'These dependencies would make a loop (a task waiting on itself)' using errcode = '22023';
    end if;
  end if;

  -- status timestamps
  if new.status = 'done' then
    new.completed_at := coalesce(case when v_old_status = 'done' then v_old_done end, new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  -- the done photo is uploaded by the worker through the crew link; the owner can keep or clear it, not invent one
  if not v_rpc then
    if tg_op = 'INSERT' then
      new.completed_photo_path := null;
    elsif new.completed_photo_path is not null and new.completed_photo_path is distinct from v_old_photo then
      new.completed_photo_path := v_old_photo;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_tasks_guard on public.job_tasks;
create trigger trg_job_tasks_guard before insert or update on public.job_tasks
  for each row execute function public.guard_job_task();

-- A deleted task no longer blocks the tasks that waited on it.
create or replace function public.cleanup_job_task_deps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job_tasks t
     set depends_on = array_remove(t.depends_on, old.id)
   where t.job_id = old.job_id
     and t.user_id = old.user_id
     and old.id = any(t.depends_on);
  return old;
end;
$$;

drop trigger if exists trg_job_tasks_cleanup_deps on public.job_tasks;
create trigger trg_job_tasks_cleanup_deps after delete on public.job_tasks
  for each row execute function public.cleanup_job_task_deps();

create or replace function public.guard_task_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rpc   boolean := coalesce(current_setting('cd.task_rpc', true), '') = 'on';
  v_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.task_id is distinct from old.task_id or new.user_id is distinct from old.user_id then
      raise exception 'A comment cannot move' using errcode = '22023';
    end if;
    if not v_rpc and (old.author_kind = 'crew' or new.author_kind is distinct from old.author_kind
                      or new.author_name is distinct from old.author_name) then
      raise exception 'A worker''s comment can be removed, not changed' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  else
    if not exists (select 1 from public.job_tasks t where t.id = new.task_id and t.user_id = new.user_id) then
      raise exception 'Task not found' using errcode = '23503', detail = 'task_comments.task_id must belong to the same user';
    end if;
    if not v_rpc and new.author_kind <> 'owner' then
      raise exception 'Only the crew link can add a worker''s comment' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('task-comments:' || new.task_id::text, 0));
    select count(*) into v_count from public.task_comments c where c.task_id = new.task_id;
    if v_count >= 200 then
      raise exception 'A task holds up to 200 comments.' using errcode = 'P0001';
    end if;
    new.created_at := now();
  end if;
  new.body := btrim(new.body);
  new.author_name := nullif(btrim(coalesce(new.author_name, '')), '');
  return new;
end;
$$;

drop trigger if exists trg_task_comments_guard on public.task_comments;
create trigger trg_task_comments_guard before insert or update on public.task_comments
  for each row execute function public.guard_task_comment();

-- -------------------------------------------------------------------------------------
-- C. Row level security + table privileges (owner full access to own rows)
-- -------------------------------------------------------------------------------------
alter table public.job_tasks enable row level security;
alter table public.task_comments enable row level security;

drop policy if exists job_tasks_select_own on public.job_tasks;
drop policy if exists job_tasks_insert_own on public.job_tasks;
drop policy if exists job_tasks_update_own on public.job_tasks;
drop policy if exists job_tasks_delete_own on public.job_tasks;
create policy job_tasks_select_own on public.job_tasks for select to authenticated
  using (user_id = (select auth.uid()));
create policy job_tasks_insert_own on public.job_tasks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy job_tasks_update_own on public.job_tasks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy job_tasks_delete_own on public.job_tasks for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists task_comments_select_own on public.task_comments;
drop policy if exists task_comments_insert_own on public.task_comments;
drop policy if exists task_comments_update_own on public.task_comments;
drop policy if exists task_comments_delete_own on public.task_comments;
create policy task_comments_select_own on public.task_comments for select to authenticated
  using (user_id = (select auth.uid()));
create policy task_comments_insert_own on public.task_comments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy task_comments_update_own on public.task_comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy task_comments_delete_own on public.task_comments for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.job_tasks, public.task_comments from anon;
revoke truncate, references, trigger on public.job_tasks, public.task_comments from authenticated;
grant select, insert, update, delete on public.job_tasks, public.task_comments to authenticated;
grant all on public.job_tasks, public.task_comments to service_role;

-- -------------------------------------------------------------------------------------
-- D. Crew link (anon, signed token; same checks as crew_portal_get / crew_punch)
--    Shows only the tasks assigned to the link's crew member: open ones, and done ones of the last 14 days.
--    Job facts: name, address and status only (what crew_portal_get already shows). Never prices, clients'
--    contact details or other workers.
-- -------------------------------------------------------------------------------------
create or replace function public.crew_tasks_get(p_token text)
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
    'tasks', coalesce((
      select jsonb_agg(x.task order by x.done, x.due nulls last, x.sort_order, x.created_at)
      from (
        select (t.status = 'done') as done, t.due_date as due, t.sort_order, t.created_at,
               jsonb_build_object(
                 'id', t.id,
                 'job_id', j.id,
                 'job_name', j.name,
                 'job_address', coalesce(j.client_address, ''),
                 'job_status', j.status,
                 'title', t.title,
                 'notes', t.notes,
                 'status', t.status,
                 'start_date', t.start_date,
                 'due_date', t.due_date,
                 'is_milestone', t.is_milestone,
                 'completed_at', t.completed_at,
                 'has_photo', t.completed_photo_path is not null,
                 'waiting_on', (select count(*) from public.job_tasks d
                                 where d.id = any(t.depends_on) and d.job_id = t.job_id and d.status <> 'done'),
                 'comments', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', c.id, 'body', c.body, 'author_kind', c.author_kind,
                            'author_name', case when c.author_kind = 'crew' then c.author_name else null end,
                            'created_at', c.created_at) order by c.created_at)
                   from (select * from public.task_comments c0
                          where c0.task_id = t.id order by c0.created_at desc limit 30) c), '[]'::jsonb)) as task
        from public.job_tasks t
        join public.jobs j on j.id = t.job_id and j.user_id = t.user_id
        where t.user_id = v_m.user_id
          and t.crew_member_id = v_m.id
          and (t.status <> 'done' or t.completed_at > now() - interval '14 days')
        order by (t.status = 'done'), t.due_date nulls last, t.sort_order, t.created_at
        limit 200
      ) x), '[]'::jsonb));
end;
$$;

-- The worker marks one of THEIR tasks doing / done (p_status null = no status change), adds an optional comment
-- (≤ 1000 characters) and, with p_photo_type jpg | png | webp, gets an upload path in the crew-photos bucket
-- (<owner>/<member>/task-<random>.<ext>, allowed for 24 hours). Nothing else of the task can change here.
-- Returns { task: { id, status, completed_at, has_photo }, upload_path } or { error: 'invalid_link' | 'paused' }.
create or replace function public.crew_task_update(
  p_token      text,
  p_task_id    uuid,
  p_status     text default null,
  p_comment    text default null,
  p_photo_type text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash    text := public._crew_ip_hash();
  v_id      uuid;
  v_m       public.crew_members%rowtype;
  v_task    public.job_tasks%rowtype;
  v_status  text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_comment text := public._clean_multiline(p_comment, 1000);
  v_ext     text := lower(btrim(coalesce(p_photo_type, '')));
  v_path    text;
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

  if v_status is not null and v_status not in ('doing', 'done') then
    raise exception 'A task can be marked as started or done.' using errcode = '22023';
  end if;
  if v_ext <> '' then
    if v_ext = 'jpeg' then v_ext := 'jpg'; end if;
    if v_ext not in ('jpg', 'png', 'webp') then
      raise exception 'Photos must be JPG, PNG or WebP images.' using errcode = '22023';
    end if;
  end if;
  if v_status is null and v_comment is null and v_ext = '' then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;

  select t.* into v_task
  from public.job_tasks t
  where t.id = p_task_id and t.user_id = v_m.user_id and t.crew_member_id = v_m.id
  for update;
  if not found then
    raise exception 'This task is not assigned to you anymore. Ask your boss.' using errcode = 'P0002', hint = 'task';
  end if;

  perform set_config('cd.task_rpc', 'on', true);
  if v_ext <> '' then
    v_path := v_m.user_id::text || '/' || v_m.id::text || '/task-' || gen_random_uuid()::text || '.' || v_ext;
  end if;
  if v_status is not null or v_path is not null then
    update public.job_tasks
       set status = coalesce(v_status, status),
           completed_photo_path = coalesce(v_path, completed_photo_path)
     where id = v_task.id
    returning * into v_task;
  end if;
  if v_comment is not null then
    insert into public.task_comments (user_id, task_id, body, author_kind, author_name)
    values (v_m.user_id, v_task.id, v_comment, 'crew', v_m.name);
  end if;
  perform set_config('cd.task_rpc', '', true);

  update public.crew_members set last_seen_at = now() where id = v_m.id;

  return jsonb_build_object(
    'task', jsonb_build_object('id', v_task.id, 'status', v_task.status, 'completed_at', v_task.completed_at,
                               'has_photo', v_task.completed_photo_path is not null),
    'upload_path', v_path);
end;
$$;

-- Storage policy helper (anon): a crew-photos upload of a task photo must be the path crew_task_update handed out
-- (stored on the task), within 24 hours of that change. Insert only, so a file is never replaced.
create or replace function public.can_upload_crew_task_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_name, '') ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/task-[0-9a-f-]{36}\.(jpg|png|webp)$'
     and exists (
       select 1
       from public.job_tasks t
       where t.completed_photo_path = p_name
         and t.user_id = public._try_uuid(split_part(p_name, '/', 1))
         and t.crew_member_id = public._try_uuid(split_part(p_name, '/', 2))
         and t.updated_at > now() - interval '24 hours');
$$;

-- -------------------------------------------------------------------------------------
-- E. Storage: one more insert policy on the existing private crew-photos bucket (owner read / delete of their
--    own folder already exist: cd_crew_photos_select_own, cd_crew_photos_delete_own)
-- -------------------------------------------------------------------------------------
drop policy if exists cd_crew_task_photos_insert_public on storage.objects;
create policy cd_crew_task_photos_insert_public on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'crew-photos' and public.can_upload_crew_task_photo(name));

-- -------------------------------------------------------------------------------------
-- F. Function privileges (default-deny, explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public.guard_job_task() from public, anon, authenticated;
revoke all on function public.cleanup_job_task_deps() from public, anon, authenticated;
revoke all on function public.guard_task_comment() from public, anon, authenticated;
revoke all on function public.crew_tasks_get(text) from public, anon, authenticated;
revoke all on function public.crew_task_update(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.can_upload_crew_task_photo(text) from public, anon, authenticated;

grant execute on function public.crew_tasks_get(text)                              to anon, authenticated;
grant execute on function public.crew_task_update(text, uuid, text, text, text)    to anon, authenticated;
grant execute on function public.can_upload_crew_task_photo(text)                  to anon, authenticated;

notify pgrst, 'reload schema';
