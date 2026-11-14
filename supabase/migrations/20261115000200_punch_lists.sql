-- =====================================================================================
-- ContractorDocs: punch lists (competitor gap #18, NEXT_STEPS 0c "NEXT")
--
-- A per-job checklist of what is left to finish: title, room / area, assignee, due date, status
-- open -> done -> verified, an optional before / after photo (rows of public.job_photos, so they also show in the
-- job's photo timeline and count against the plan's photo storage). The contractor can share the list in the client
-- portal, where the client can mark a done item "Looks good" (verified by the client) or "Needs work" (open again,
-- with a note). On every plan (owner rule: punch lists are Free).
--
-- ADDITIVE ONLY: two new tables, their triggers, three functions. No existing table, row, function or policy is
-- changed. Needs 20261113000400 (job_photos) applied first (it is, in production).
--
-- Objects
--   punch_lists                one row per job that has portal settings (shared_in_portal)
--   punch_items                the items (owner RLS: full access to own rows)
--   guard_punch_item()         same-owner job / photos, status timestamps, the client's verification can only
--                              come from the portal function, at most 500 items per job
--   get_portal_punch_list(key)              anon: shared punch lists of the portal's client (with portal photo paths)
--   punch_item_feedback_via_portal(key, item, ok, note)   anon: "Looks good" / "Needs work" on a done item
--
-- No cron job. Rollback: drop function public.punch_item_feedback_via_portal(text, uuid, boolean, text),
--   public.get_portal_punch_list(text), public.guard_punch_item(), public.guard_punch_list();
--   drop table public.punch_items, public.punch_lists;
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.punch_lists (
  job_id            uuid primary key references public.jobs(id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shared_in_portal  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.punch_lists is 'Punch list settings per job (shared in the client portal or not).';

create table if not exists public.punch_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id           uuid not null references public.jobs(id) on delete cascade,
  title            text not null check (length(btrim(title)) between 1 and 300),
  area             text check (area is null or length(area) <= 120),
  assignee         text check (assignee is null or length(assignee) <= 120),
  due_on           date,
  status           text not null default 'open' check (status in ('open', 'done', 'verified')),
  position         integer not null default 0 check (position between -1000000 and 1000000),
  notes            text check (notes is null or length(notes) <= 2000),
  before_photo_id  uuid references public.job_photos(id) on delete set null,
  after_photo_id   uuid references public.job_photos(id) on delete set null,
  done_at          timestamptz,
  verified_at      timestamptz,
  verified_by      text check (verified_by is null or verified_by in ('contractor', 'client')),
  client_note      text check (client_note is null or length(client_note) <= 1000),
  client_note_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.punch_items is 'Punch list items per job (open / done / verified). See lib/punchList.ts for the state rules.';

create index if not exists idx_punch_items_user_job on public.punch_items (user_id, job_id, position, created_at);
create index if not exists idx_punch_items_job on public.punch_items (job_id);
create index if not exists idx_punch_items_before_photo on public.punch_items (before_photo_id) where before_photo_id is not null;
create index if not exists idx_punch_items_after_photo on public.punch_items (after_photo_id) where after_photo_id is not null;
create index if not exists idx_punch_items_client_note on public.punch_items (user_id, client_note_at desc) where client_note_at is not null;

drop trigger if exists tr_punch_lists_updated_at on public.punch_lists;
create trigger tr_punch_lists_updated_at before update on public.punch_lists
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_punch_items_updated_at on public.punch_items;
create trigger tr_punch_items_updated_at before update on public.punch_items
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- B. Write guards
-- -------------------------------------------------------------------------------------
create or replace function public.guard_punch_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    raise exception 'Job not found' using errcode = '23503', detail = 'punch_lists.job_id must belong to the same user';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_punch_lists_guard on public.punch_lists;
create trigger trg_punch_lists_guard before insert or update on public.punch_lists
  for each row execute function public.guard_punch_list();

-- Same-owner job and photos; timestamps follow the status; the client's verification / note are written only by
-- punch_item_feedback_via_portal (a browser save can keep or clear them, never invent them).
create or replace function public.guard_punch_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_browser         boolean := current_user in ('authenticated', 'anon');
  v_count           integer;
  -- the row before this write (null on insert); OLD is only read inside UPDATE branches
  v_old_status      text;
  v_old_done_at     timestamptz;
  v_old_verified_by text;
  v_old_note        text;
  v_old_note_at     timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id then
      raise exception 'A punch item cannot move to another job' using errcode = '22023';
    end if;
    v_old_status := old.status;
    v_old_done_at := old.done_at;
    v_old_verified_by := old.verified_by;
    v_old_note := old.client_note;
    v_old_note_at := old.client_note_at;
  else
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'punch_items.job_id must belong to the same user';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('punch:' || new.job_id::text, 0));
    select count(*) into v_count from public.punch_items p where p.job_id = new.job_id;
    if v_count >= 500 then
      raise exception 'A punch list holds up to 500 items. Remove verified items you no longer need.' using errcode = 'P0001';
    end if;
  end if;

  -- photos must be the owner's photos of this job (else the link is dropped)
  if new.before_photo_id is not null and not exists (
       select 1 from public.job_photos p where p.id = new.before_photo_id and p.user_id = new.user_id and p.job_id = new.job_id) then
    new.before_photo_id := null;
  end if;
  if new.after_photo_id is not null and not exists (
       select 1 from public.job_photos p where p.id = new.after_photo_id and p.user_id = new.user_id and p.job_id = new.job_id) then
    new.after_photo_id := null;
  end if;

  new.title := btrim(new.title);
  new.area := nullif(btrim(coalesce(new.area, '')), '');
  new.assignee := nullif(btrim(coalesce(new.assignee, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');

  -- the client's answer belongs to the client
  if v_browser then
    if new.verified_by = 'client'
       and (v_old_status is null or v_old_verified_by is distinct from 'client' or v_old_status <> 'verified') then
      raise exception 'Only the client can verify an item as the client' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.client_note := null;
      new.client_note_at := null;
    elsif new.client_note is not null and new.client_note is distinct from v_old_note then
      -- the contractor may clear the client's note, not write one
      new.client_note := v_old_note;
      new.client_note_at := v_old_note_at;
    end if;
  end if;

  -- timestamps follow the status
  if new.status = 'open' then
    new.done_at := null;
    new.verified_at := null;
    new.verified_by := null;
  elsif new.status = 'done' then
    new.done_at := coalesce(case when v_old_status in ('done', 'verified') then v_old_done_at end, new.done_at, now());
    new.verified_at := null;
    new.verified_by := null;
  else -- verified
    new.done_at := coalesce(new.done_at, v_old_done_at, now());
    new.verified_at := coalesce(new.verified_at, now());
    new.verified_by := coalesce(new.verified_by, 'contractor');
  end if;
  if new.client_note is null then
    new.client_note_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_punch_items_guard on public.punch_items;
create trigger trg_punch_items_guard before insert or update on public.punch_items
  for each row execute function public.guard_punch_item();

-- -------------------------------------------------------------------------------------
-- C. Row level security + table privileges (owner full access to own rows)
-- -------------------------------------------------------------------------------------
alter table public.punch_lists enable row level security;
alter table public.punch_items enable row level security;

drop policy if exists punch_lists_select_own on public.punch_lists;
drop policy if exists punch_lists_insert_own on public.punch_lists;
drop policy if exists punch_lists_update_own on public.punch_lists;
drop policy if exists punch_lists_delete_own on public.punch_lists;
create policy punch_lists_select_own on public.punch_lists for select to authenticated
  using (user_id = (select auth.uid()));
create policy punch_lists_insert_own on public.punch_lists for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy punch_lists_update_own on public.punch_lists for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy punch_lists_delete_own on public.punch_lists for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists punch_items_select_own on public.punch_items;
drop policy if exists punch_items_insert_own on public.punch_items;
drop policy if exists punch_items_update_own on public.punch_items;
drop policy if exists punch_items_delete_own on public.punch_items;
create policy punch_items_select_own on public.punch_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy punch_items_insert_own on public.punch_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy punch_items_update_own on public.punch_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy punch_items_delete_own on public.punch_items for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.punch_lists, public.punch_items from anon;
revoke truncate on public.punch_lists, public.punch_items from authenticated;
grant select, insert, update, delete on public.punch_lists, public.punch_items to authenticated;
grant all on public.punch_lists, public.punch_items to service_role;

-- -------------------------------------------------------------------------------------
-- D. Client portal (anon, portal key): shared punch lists of that client's jobs
--    Jobs are the client's when jobs.client_id = the client, or (no client_id) the job's client name matches
--    (trimmed, case-insensitive), as in get_portal_photos. Photos only when the photo itself is shared in the
--    portal (public portal-photos copy).
-- -------------------------------------------------------------------------------------
create or replace function public.get_portal_punch_list(p_key text)
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
             'job_id', j.id,
             'job_name', j.name,
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', i.id, 'title', i.title, 'area', i.area, 'status', i.status, 'due_on', i.due_on,
                        'done_at', i.done_at, 'verified_at', i.verified_at, 'verified_by', i.verified_by,
                        'client_note', i.client_note, 'client_note_at', i.client_note_at,
                        'before_path', bp.portal_path, 'after_path', ap.portal_path)
                      order by i.position, i.created_at)
               from public.punch_items i
               left join public.job_photos bp on bp.id = i.before_photo_id and bp.shared_in_portal and bp.portal_path is not null
               left join public.job_photos ap on ap.id = i.after_photo_id and ap.shared_in_portal and ap.portal_path is not null
               where i.job_id = j.id and i.user_id = j.user_id), '[]'::jsonb))
           order by j.name)
    from public.punch_lists l
    join public.jobs j on j.id = l.job_id and j.user_id = l.user_id
    where l.user_id = v_client.user_id
      and l.shared_in_portal
      and (j.client_id = v_client.id
           or (j.client_id is null and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
      and exists (select 1 from public.punch_items i where i.job_id = j.id)
  ), '[]'::jsonb);
end;
$$;

-- "Looks good" (p_ok = true) on a done item -> verified by the client.
-- "Needs work" (p_ok = false, a note is required) on a done item, or on an item the client verified -> open again.
create or replace function public.punch_item_feedback_via_portal(p_key text, p_item_id uuid, p_ok boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_item   public.punch_items%rowtype;
  v_note   text := nullif(left(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]+', ' ', 'g')), 1000), '');
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{32,128}$' or p_item_id is null or p_ok is null then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;
  select * into v_client from public.clients where portal_key = p_key;
  if not found then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;

  select i.* into v_item
  from public.punch_items i
  join public.punch_lists l on l.job_id = i.job_id and l.user_id = i.user_id and l.shared_in_portal
  join public.jobs j on j.id = i.job_id and j.user_id = i.user_id
  where i.id = p_item_id
    and i.user_id = v_client.user_id
    and (j.client_id = v_client.id
         or (j.client_id is null and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
  for update of i;
  if not found then
    raise exception 'This item is not available any more' using errcode = 'P0002';
  end if;

  if p_ok then
    if v_item.status <> 'done' then
      raise exception 'Only finished items can be marked as looking good' using errcode = '22023';
    end if;
    update public.punch_items
       set status = 'verified', verified_by = 'client', verified_at = now(),
           client_note = coalesce(v_note, client_note), client_note_at = case when v_note is null then client_note_at else now() end
     where id = v_item.id
    returning * into v_item;
  else
    if v_note is null then
      raise exception 'Say what still needs work' using errcode = '22023';
    end if;
    if not (v_item.status = 'done' or (v_item.status = 'verified' and v_item.verified_by = 'client')) then
      raise exception 'This item is not finished yet' using errcode = '22023';
    end if;
    update public.punch_items
       set status = 'open', client_note = v_note, client_note_at = now()
     where id = v_item.id
    returning * into v_item;
  end if;

  return jsonb_build_object('id', v_item.id, 'status', v_item.status, 'verified_by', v_item.verified_by,
                            'verified_at', v_item.verified_at, 'client_note', v_item.client_note, 'client_note_at', v_item.client_note_at);
end;
$$;

-- -------------------------------------------------------------------------------------
-- E. Function privileges (default-deny, explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public.guard_punch_list() from public, anon, authenticated;
revoke all on function public.guard_punch_item() from public, anon, authenticated;
revoke all on function public.get_portal_punch_list(text) from public, anon, authenticated;
revoke all on function public.punch_item_feedback_via_portal(text, uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.get_portal_punch_list(text)                                  to anon, authenticated;
grant execute on function public.punch_item_feedback_via_portal(text, uuid, boolean, text)    to anon, authenticated;

notify pgrst, 'reload schema';
