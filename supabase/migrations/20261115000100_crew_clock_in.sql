-- =====================================================================================
-- ContractorDocs: crew clock-in links (competitor gap #13 "GPS time clock").
--
-- ADDITIVE ONLY: new tables, functions, triggers, one storage bucket and its policies. No existing table,
-- function, policy or row is changed. Safe to run twice (if not exists / create or replace / drop ... if exists).
--
-- Workers are NOT app users: no login, no seat. Each crew member gets a private, signed link
-- (/clock/<token>) that only works for the jobs assigned to them and can be turned off or replaced at any time.
--
-- A. crew_members       the owner's workers: name, phone, email, hourly cost rate, link nonce
--    crew_assignments   which jobs a worker may clock in to (optional date window)
--    crew_job_sites     a job's site pin (lat / lng + radius) for the "far from the job" flag
--    time_punches       clock in / out / break start / break end; ONE location reading per punch, only when the
--                       worker allowed it (no tracking in between); a punch without location is flagged, never refused
--    crew_rate_events   rate limit log of the public link (sha256 of the IP, never the IP)          (server only)
--    crew_link_secret   the HMAC key that signs the links                                           (server only)
-- B. link signing: token = nonce (24 chars) + HMAC-SHA256(member id : nonce) (16 chars), base64url, 40 chars.
--    The nonce alone (readable by the owner) is useless without the server key; "New link" replaces the nonce
--    (old link dead at once), "Turn off" clears it.
-- C. guards (triggers): ownership of every referenced row, Premium to add crew, caps, the link nonce and the
--    worker-side fields of a punch can't be set or changed by a direct table write
-- D. public RPCs (anon, token): crew_portal_get, crew_punch, can_upload_crew_photo
--    owner RPCs: crew_links, crew_member_link
-- E. storage bucket crew-photos (private): the worker uploads only to the path crew_punch handed out (24 h),
--    the owner reads / deletes their own folder
-- F. RLS + privileges (default deny, explicit grants)
--
-- Keep in sync with lib/crew/crewLogic.ts (CREW_TOKEN_RE, PUNCH_KINDS, LOCATION_STATUSES, CREW_LIMITS,
-- DEFAULT_SITE_RADIUS_M) and scripts/crew-clock-check.ts (lints this file).
-- =====================================================================================

-- =====================================================================================
-- A. Tables
-- =====================================================================================
create table if not exists public.crew_members (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 80),
  phone            text check (phone is null or length(phone) <= 40),
  email            text check (email is null or length(email) <= 254),
  cost_rate        numeric(10, 2) check (cost_rate is null or (cost_rate >= 0 and cost_rate <= 10000)),
  active           boolean not null default true,
  -- first half of the signed link; null = link turned off. Set only by the server (guard + crew_member_link).
  link_nonce       text check (link_nonce is null or link_nonce ~ '^[A-Za-z0-9_-]{24}$'),
  link_created_at  timestamptz,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint crew_members_link_nonce_key unique (link_nonce)
);
comment on table public.crew_members is 'Crew members (no login, no seat). Their private clock-in link is signed by the server (crew_links()).';

create table if not exists public.crew_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id   uuid not null references public.crew_members(id) on delete cascade,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  starts_on   date,
  ends_on     date,
  created_at  timestamptz not null default now(),
  constraint crew_assignments_member_job_key unique (member_id, job_id),
  constraint crew_assignments_window_check check (starts_on is null or ends_on is null or ends_on >= starts_on)
);
comment on table public.crew_assignments is 'Jobs a crew member may clock in to (null dates = while the job is open).';

create table if not exists public.crew_job_sites (
  job_id      uuid primary key references public.jobs(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_m    integer not null default 300 check (radius_m between 50 and 5000),
  label       text check (label is null or length(label) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.crew_job_sites is 'Job site pin for the "far from the job" flag on punches (no geocoding).';

create table if not exists public.time_punches (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id        uuid not null references public.crew_members(id) on delete cascade,
  job_id           uuid not null references public.jobs(id) on delete cascade,
  kind             text not null check (kind in ('in', 'out', 'break_start', 'break_end')),
  -- when the worker tapped (device time; queued offline punches keep their time)
  at               timestamptz not null,
  -- the worker's time before the owner first edited it
  original_at      timestamptz,
  lat              double precision check (lat is null or lat between -90 and 90),
  lng              double precision check (lng is null or lng between -180 and 180),
  accuracy_m       real check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 100000)),
  -- ok = one reading taken at the tap; denied / unavailable / timeout / skipped = no location (flagged);
  -- owner = added or fixed by the owner
  location_status  text not null default 'unavailable'
                   check (location_status in ('ok', 'denied', 'unavailable', 'timeout', 'skipped', 'owner')),
  distance_m       integer check (distance_m is null or distance_m >= 0),
  note             text check (note is null or length(note) <= 500),
  photo_path       text check (photo_path is null or length(photo_path) <= 300),
  -- idempotency key from the device (offline retries never create a second punch)
  client_id        text not null check (client_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  source           text not null default 'crew' check (source in ('crew', 'owner')),
  edited_at        timestamptz,
  approved_at      timestamptz,
  timesheet_id     uuid references public.documents(id) on delete set null,
  received_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint time_punches_member_client_key unique (member_id, client_id),
  constraint time_punches_location_pair check ((lat is null) = (lng is null))
);
comment on table public.time_punches is 'Crew clock-in punches. Workers write only through crew_punch(); owners read and fix their own rows.';

create table if not exists public.crew_rate_events (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  member_id   uuid references public.crew_members(id) on delete cascade,
  kind        text not null check (kind in ('view', 'punch', 'bad')),
  created_at  timestamptz not null default now()
);
comment on table public.crew_rate_events is 'Rate limit log for the crew link RPCs (sha256 of the IP, never the IP). Server only.';

create table if not exists public.crew_link_secret (
  id          boolean primary key default true check (id),
  secret      text not null,
  created_at  timestamptz not null default now()
);
comment on table public.crew_link_secret is 'HMAC key of the crew links. Server only (no policies, no grants).';
insert into public.crew_link_secret (id, secret)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

drop trigger if exists tr_crew_members_updated_at on public.crew_members;
create trigger tr_crew_members_updated_at before update on public.crew_members
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_crew_job_sites_updated_at on public.crew_job_sites;
create trigger tr_crew_job_sites_updated_at before update on public.crew_job_sites
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_time_punches_updated_at on public.time_punches;
create trigger tr_time_punches_updated_at before update on public.time_punches
  for each row execute function public.handle_updated_at();

create index if not exists idx_crew_members_user on public.crew_members (user_id, active, name);
create index if not exists idx_crew_assignments_user on public.crew_assignments (user_id);
create index if not exists idx_crew_assignments_job on public.crew_assignments (job_id);
create index if not exists idx_crew_job_sites_user on public.crew_job_sites (user_id);
create index if not exists idx_time_punches_user_at on public.time_punches (user_id, at desc);
create index if not exists idx_time_punches_member_at on public.time_punches (member_id, at desc);
create index if not exists idx_time_punches_job_at on public.time_punches (job_id, at desc);
create index if not exists idx_time_punches_timesheet on public.time_punches (timesheet_id) where timesheet_id is not null;
create index if not exists idx_crew_rate_events_ip_created on public.crew_rate_events (ip_hash, created_at desc);
create index if not exists idx_crew_rate_events_member_created on public.crew_rate_events (member_id, kind, created_at desc) where member_id is not null;
create index if not exists idx_crew_rate_events_created on public.crew_rate_events (created_at);

-- =====================================================================================
-- B. Link signing
-- =====================================================================================

-- 18 random bytes, base64url: 24 characters.
create or replace function public._new_crew_nonce()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'), '=');
$$;

-- First 12 bytes of HMAC-SHA256(member id : nonce) with the server key, base64url: 16 characters.
create or replace function public._crew_link_signature(p_member_id uuid, p_nonce text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rtrim(translate(encode(substring(
           extensions.hmac(p_member_id::text || ':' || p_nonce, s.secret, 'sha256') from 1 for 12), 'base64'),
           '+/', '-_'), '=')
  from public.crew_link_secret s
  where s.id;
$$;

-- The full link token of a member (null when the link is off).
create or replace function public._crew_token(p_member_id uuid, p_nonce text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_nonce is null then null else p_nonce || public._crew_link_signature(p_member_id, p_nonce) end;
$$;

-- Member id of a valid link token (signature checked), else null. Archived members' links don't work.
create or replace function public._crew_member_id(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_m     public.crew_members%rowtype;
begin
  if v_token !~ '^[A-Za-z0-9_-]{40}$' then
    return null;
  end if;
  select * into v_m from public.crew_members where link_nonce = left(v_token, 24);
  if not found or not v_m.active then
    return null;
  end if;
  if public._crew_link_signature(v_m.id, v_m.link_nonce) is distinct from right(v_token, 16) then
    return null;
  end if;
  return v_m.id;
end;
$$;

-- Great-circle distance in metres.
create or replace function public._crew_distance_m(p_lat1 double precision, p_lng1 double precision,
                                                   p_lat2 double precision, p_lng2 double precision)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round(2 * 6371000 * asin(least(1, sqrt(
           power(sin(radians(p_lat2 - p_lat1) / 2), 2)
           + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)))))::integer;
$$;

-- Caller IP (Cloudflare / gateway headers), hashed. Never stored raw.
create or replace function public._crew_ip_hash()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_ip      text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := coalesce(nullif(btrim(v_headers->>'cf-connecting-ip'), ''),
                   nullif(btrim(v_headers->>'x-real-ip'), ''),
                   nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
                   'unknown');
  return encode(extensions.digest('cd-crew-link:' || v_ip, 'sha256'), 'hex');
end;
$$;

-- Abuse guard of the public link. Per IP: 30 bad links an hour, 300 calls in 10 minutes.
-- Per member: 60 punches an hour, 400 a day, 600 page loads an hour. Raises RATE_LIMIT: (the worker page keeps
-- the punch on the device and tries later). With a member, the call is logged; without one only the IP limits are
-- checked (a bad link is logged by the caller, after the check, so the exception can't roll it back).
create or replace function public._crew_rate_guard(p_ip_hash text, p_member_id uuid, p_kind text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.crew_rate_events e
       where e.ip_hash = p_ip_hash and e.kind = 'bad' and e.created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.crew_rate_events e
          where e.ip_hash = p_ip_hash and e.created_at > now() - interval '10 minutes') >= 300 then
    raise exception 'RATE_LIMIT: Too many tries from this device. Please wait a few minutes.'
      using errcode = 'P0001', hint = 'rate_limit';
  end if;
  if p_member_id is not null and p_kind = 'punch' and (
       (select count(*) from public.crew_rate_events e
         where e.member_id = p_member_id and e.kind = 'punch' and e.created_at > now() - interval '1 hour') >= 60
       or (select count(*) from public.crew_rate_events e
            where e.member_id = p_member_id and e.kind = 'punch' and e.created_at > now() - interval '1 day') >= 400) then
    raise exception 'RATE_LIMIT: Too many punches in a short time. They are kept on this phone; try again later.'
      using errcode = 'P0001', hint = 'rate_limit';
  end if;
  if p_member_id is not null and p_kind = 'view' and
     (select count(*) from public.crew_rate_events e
       where e.member_id = p_member_id and e.kind = 'view' and e.created_at > now() - interval '1 hour') >= 600 then
    raise exception 'RATE_LIMIT: This page was opened too many times. Please wait a few minutes.'
      using errcode = 'P0001', hint = 'rate_limit';
  end if;
  if p_member_id is null then
    return;
  end if;
  insert into public.crew_rate_events (ip_hash, member_id, kind) values (p_ip_hash, p_member_id, p_kind);
  if random() < 0.02 then
    delete from public.crew_rate_events where created_at < now() - interval '2 days';
  end if;
end;
$$;

-- =====================================================================================
-- C. Guards
-- =====================================================================================

-- True inside crew_punch / crew_portal_get / crew_member_link (transaction-local flag).
create or replace function public._crew_rpc()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('cd.crew_rpc', true), '') = 'on';
$$;

-- crew_members: Premium to add, at most 200 per account; the link nonce, link date and last-seen time are set
-- only by the server; the owner can't move a member to another account.
create or replace function public.guard_crew_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := coalesce(public._clean_text(new.name, 80), '');
  new.phone := public._clean_text(new.phone, 40);
  new.email := lower(public._clean_text(new.email, 254));
  if tg_op = 'INSERT' then
    if public.user_effective_tier(new.user_id) = 'free' then
      raise exception 'PREMIUM_REQUIRED: Crew clock-in links are part of Premium. Upgrade to add your crew.'
        using errcode = 'P0001', hint = 'premium';
    end if;
    if (select count(*) from public.crew_members m where m.user_id = new.user_id) >= 200 then
      raise exception 'You can have up to 200 crew members. Remove people who left first.' using errcode = 'P0001', hint = 'cap';
    end if;
    new.link_nonce := public._new_crew_nonce();
    new.link_created_at := now();
    new.last_seen_at := null;
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  if not public._crew_rpc() then
    new.link_nonce := old.link_nonce;
    new.link_created_at := old.link_created_at;
    new.last_seen_at := old.last_seen_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crew_members_guard on public.crew_members;
create trigger trg_crew_members_guard before insert or update on public.crew_members
  for each row execute function public.guard_crew_member();

-- crew_assignments: the member and the job belong to the same account; at most 300 jobs per member.
create or replace function public.guard_crew_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.member_id := old.member_id;
  end if;
  if not exists (select 1 from public.crew_members m where m.id = new.member_id and m.user_id = new.user_id) then
    raise exception 'Crew member not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.crew_assignments a where a.member_id = new.member_id) >= 300 then
    raise exception 'A crew member can be on up to 300 jobs. Remove finished jobs first.' using errcode = 'P0001', hint = 'cap';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crew_assignments_guard on public.crew_assignments;
create trigger trg_crew_assignments_guard before insert or update on public.crew_assignments
  for each row execute function public.guard_crew_assignment();

-- crew_job_sites: the job belongs to the account.
create or replace function public.guard_crew_job_site()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.job_id := old.job_id;
  end if;
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  new.label := public._clean_text(new.label, 120);
  return new;
end;
$$;

drop trigger if exists trg_crew_job_sites_guard on public.crew_job_sites;
create trigger trg_crew_job_sites_guard before insert or update on public.crew_job_sites
  for each row execute function public.guard_crew_job_site();

-- time_punches:
--   * member and job belong to the row's account;
--   * a punch the owner adds directly is an owner punch (no location, photo or distance can be claimed);
--   * the worker's own fields (location, photo, device key, source) never change afterwards; editing the time,
--     kind or job keeps the worker's original time and stamps edited_at.
create or replace function public.guard_time_punch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.user_id := old.user_id;
    new.member_id := old.member_id;
    new.client_id := old.client_id;
    new.source := old.source;
    new.lat := old.lat;
    new.lng := old.lng;
    new.accuracy_m := old.accuracy_m;
    new.location_status := old.location_status;
    new.distance_m := old.distance_m;
    new.photo_path := old.photo_path;
    new.received_at := old.received_at;
    new.created_at := old.created_at;
    if new.at is distinct from old.at or new.kind is distinct from old.kind or new.job_id is distinct from old.job_id then
      new.original_at := coalesce(old.original_at, old.at);
      new.edited_at := now();
    else
      new.original_at := old.original_at;
      new.edited_at := old.edited_at;
    end if;
  elsif not public._crew_rpc() then
    new.source := 'owner';
    new.lat := null;
    new.lng := null;
    new.accuracy_m := null;
    new.location_status := 'owner';
    new.distance_m := null;
    new.photo_path := null;
    new.original_at := null;
    new.edited_at := null;
    new.received_at := now();
  end if;
  if new.at > now() + interval '1 day' then
    raise exception 'A punch can''t be more than a day in the future.' using errcode = '22023';
  end if;
  new.note := public._clean_multiline(new.note, 500);
  if not exists (select 1 from public.crew_members m where m.id = new.member_id and m.user_id = new.user_id) then
    raise exception 'Crew member not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_time_punches_guard on public.time_punches;
create trigger trg_time_punches_guard before insert or update on public.time_punches
  for each row execute function public.guard_time_punch();

-- =====================================================================================
-- D. RPCs
-- =====================================================================================

-- Public (anon): what /clock/<token> shows. Never returns prices, rates, clients' contact details or other
-- workers. A bad link returns { error: 'invalid_link' } (not an exception, so the abuse guard counts it).
--   jobs:    assigned jobs that are not Completed / Inactive and whose window hasn't ended (the page picks
--            today's by the phone's date), plus jobs of the member's last 3 days of punches (assigned = false)
--            so an open shift can always be closed
--   punches: the member's own punches of the last 8 days (the page's "today" and "this week")
create or replace function public.crew_portal_get(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash   text := public._crew_ip_hash();
  v_id     uuid;
  v_m      public.crew_members%rowtype;
  v_info   jsonb;
  v_paused boolean;
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
  v_paused := public.user_effective_tier(v_m.user_id) = 'free';
  v_info := coalesce(public._contractor_public_info(v_m.user_id), '{}'::jsonb);
  update public.crew_members set last_seen_at = now()
   where id = v_m.id and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');

  return jsonb_build_object(
    'member', jsonb_build_object('name', v_m.name),
    'company', jsonb_build_object(
      'name', coalesce(nullif(btrim(v_info->>'company_name'), ''), v_info->>'name', ''),
      'logo_url', coalesce(v_info->>'logo_url', ''),
      'phone', coalesce(v_info->>'phone', '')),
    'paused', v_paused,
    'server_now', now(),
    'jobs', case when v_paused then '[]'::jsonb else coalesce((
      select jsonb_agg(t.x order by t.assigned desc, t.name)
      from (
        select distinct on (j.id)
               j.name, (a.id is not null) as assigned,
               jsonb_build_object(
                 'id', j.id, 'name', j.name, 'address', coalesce(j.client_address, ''), 'status', j.status,
                 'from', a.starts_on, 'to', a.ends_on, 'assigned', a.id is not null,
                 'site', case when s.job_id is null then null
                              else jsonb_build_object('lat', s.lat, 'lng', s.lng, 'radius_m', s.radius_m) end) as x
        from public.jobs j
        left join public.crew_assignments a on a.job_id = j.id and a.member_id = v_m.id
        left join public.crew_job_sites s on s.job_id = j.id
        where j.user_id = v_m.user_id
          and (
            (a.id is not null and j.status not in ('completed', 'inactive')
             and (a.ends_on is null or a.ends_on >= current_date - 1))
            or exists (select 1 from public.time_punches p
                        where p.member_id = v_m.id and p.job_id = j.id and p.at > now() - interval '3 days'))
        order by j.id, (a.id is not null) desc
        limit 100
      ) t), '[]'::jsonb) end,
    'punches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'client_id', p.client_id, 'job_id', p.job_id, 'kind', p.kind, 'at', p.at,
               'location', p.location_status, 'distance_m', p.distance_m, 'note', p.note,
               'has_photo', p.photo_path is not null)
             order by p.at, p.created_at)
      from (
        select * from public.time_punches
        where member_id = v_m.id and at > now() - interval '8 days'
        order by at desc
        limit 300
      ) p), '[]'::jsonb));
end;
$$;

-- Public (anon): saves one punch. Idempotent on (member, p_client_id): a retry returns the punch saved the first
-- time with duplicate = true (and its photo upload path again).
--   p_kind      in | out | break_start | break_end
--   p_at        when the worker tapped (offline punches keep their time; at most 14 days old; a time in the
--               future beyond 10 minutes of clock drift is replaced by now)
--   p_job_id    'in': a job assigned to the member (or one they punched in the last 14 days);
--               other kinds: null = the job of their last clock-in
--   p_lat/p_lng one reading taken at the tap, with the worker's consent; none = flagged, never refused
--   p_location  ok | denied | unavailable | timeout | skipped (why there is no reading)
--   p_photo_type jpg | png | webp: returns upload_path (crew-photos bucket, allowed for 24 hours)
-- Returns { punch, duplicate, upload_path } or { error: 'invalid_link' | 'paused' }.
create or replace function public.crew_punch(
  p_token      text,
  p_job_id     uuid,
  p_kind       text,
  p_at         timestamptz,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_accuracy   double precision default null,
  p_note       text default null,
  p_client_id  text default null,
  p_location   text default null,
  p_photo_type text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash      text := public._crew_ip_hash();
  v_id        uuid;
  v_m         public.crew_members%rowtype;
  v_row       public.time_punches%rowtype;
  v_kind      text := lower(btrim(coalesce(p_kind, '')));
  v_client    text := btrim(coalesce(p_client_id, ''));
  v_at        timestamptz := coalesce(p_at, now());
  v_job       uuid := p_job_id;
  v_status    text := lower(btrim(coalesce(p_location, '')));
  v_lat       double precision;
  v_lng       double precision;
  v_acc       real;
  v_site      public.crew_job_sites%rowtype;
  v_distance  integer;
  v_ext       text := lower(btrim(coalesce(p_photo_type, '')));
  v_punch_id  uuid := gen_random_uuid();
  v_path      text;
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
  if v_client !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'This punch has no valid device key. Reload the page and try again.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('crew-punch:' || v_m.id::text, 0));

  -- a retry of a punch already saved
  select * into v_row from public.time_punches where member_id = v_m.id and client_id = v_client;
  if found then
    return jsonb_build_object(
      'punch', jsonb_build_object('id', v_row.id, 'client_id', v_row.client_id, 'job_id', v_row.job_id, 'kind', v_row.kind,
                                  'at', v_row.at, 'location', v_row.location_status, 'distance_m', v_row.distance_m),
      'duplicate', true,
      'upload_path', v_row.photo_path);
  end if;

  perform public._crew_rate_guard(v_hash, v_m.id, 'punch');

  if v_kind not in ('in', 'out', 'break_start', 'break_end') then
    raise exception 'Unknown punch.' using errcode = '22023';
  end if;
  if v_at > now() + interval '10 minutes' then
    v_at := now();
  end if;
  if v_at < now() - interval '14 days' then
    raise exception 'This punch is more than 14 days old and can''t be saved. Tell your boss the times instead.'
      using errcode = '22023', hint = 'too_old';
  end if;

  if v_job is null and v_kind <> 'in' then
    select p.job_id into v_job from public.time_punches p
     where p.member_id = v_m.id and p.kind = 'in' and p.at <= v_at
     order by p.at desc limit 1;
  end if;
  if v_job is null then
    raise exception 'Pick the job you are clocking in to.' using errcode = '22023', hint = 'job';
  end if;
  if not exists (select 1 from public.jobs j where j.id = v_job and j.user_id = v_m.user_id)
     or not (exists (select 1 from public.crew_assignments a where a.member_id = v_m.id and a.job_id = v_job)
             or exists (select 1 from public.time_punches p
                         where p.member_id = v_m.id and p.job_id = v_job and p.at > now() - interval '14 days')) then
    raise exception 'You are not on this job anymore. Ask your boss to add you to it.' using errcode = '22023', hint = 'job';
  end if;

  -- one location reading, only with the worker's consent
  if p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180
     and not (p_lat = 0 and p_lng = 0) then
    v_lat := p_lat;
    v_lng := p_lng;
    v_acc := case when p_accuracy is null or p_accuracy < 0 then null else least(p_accuracy, 100000)::real end;
    v_status := 'ok';
    select * into v_site from public.crew_job_sites where job_id = v_job;
    if found then
      v_distance := public._crew_distance_m(v_site.lat, v_site.lng, v_lat, v_lng);
    end if;
  else
    v_status := case when v_status in ('denied', 'unavailable', 'timeout', 'skipped') then v_status else 'unavailable' end;
  end if;

  if v_ext <> '' then
    if v_ext = 'jpeg' then v_ext := 'jpg'; end if;
    if v_ext not in ('jpg', 'png', 'webp') then
      raise exception 'Photos must be JPG, PNG or WebP images.' using errcode = '22023';
    end if;
    v_path := v_m.user_id::text || '/' || v_m.id::text || '/' || v_punch_id::text || '.' || v_ext;
  end if;

  insert into public.time_punches (id, user_id, member_id, job_id, kind, at, lat, lng, accuracy_m, location_status,
                                   distance_m, note, photo_path, client_id, source)
  values (v_punch_id, v_m.user_id, v_m.id, v_job, v_kind, v_at, v_lat, v_lng, v_acc, v_status,
          v_distance, public._clean_multiline(p_note, 500), v_path, v_client, 'crew')
  returning * into v_row;

  update public.crew_members set last_seen_at = now() where id = v_m.id;

  return jsonb_build_object(
    'punch', jsonb_build_object('id', v_row.id, 'client_id', v_row.client_id, 'job_id', v_row.job_id, 'kind', v_row.kind,
                                'at', v_row.at, 'location', v_row.location_status, 'distance_m', v_row.distance_m),
    'duplicate', false,
    'upload_path', v_path);
end;
$$;

-- Storage policy helper (anon): a crew-photos upload must be a path crew_punch handed out, within 24 hours
-- (offline phones upload when they're back; insert only, so a file is never replaced).
create or replace function public.can_upload_crew_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.time_punches p
    where p.id = public._try_uuid(split_part(split_part(coalesce(p_name, ''), '/', 3), '.', 1))
      and p.member_id = public._try_uuid(split_part(coalesce(p_name, ''), '/', 2))
      and p.user_id = public._try_uuid(split_part(coalesce(p_name, ''), '/', 1))
      and p.photo_path = p_name
      and p.received_at > now() - interval '24 hours');
$$;

-- Owner: the links of their active crew members ([{ member_id, token }]; members whose link is off are left out).
create or replace function public.crew_links()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('member_id', m.id, 'token', public._crew_token(m.id, m.link_nonce)) order by m.name)
    from public.crew_members m
    where m.user_id = v_uid and m.active and m.link_nonce is not null), '[]'::jsonb);
end;
$$;

-- Owner: p_action 'new' = a new link (the old one stops at once), 'off' = turn the link off.
-- Returns { member_id, token } (token null when off).
create or replace function public.crew_member_link(p_member_id uuid, p_action text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_m      public.crew_members%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_action not in ('new', 'off') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  select * into v_m from public.crew_members where id = p_member_id and user_id = v_uid for update;
  if not found then
    raise exception 'Crew member not found' using errcode = 'P0002';
  end if;
  perform set_config('cd.crew_rpc', 'on', true);
  if v_action = 'new' then
    update public.crew_members set link_nonce = public._new_crew_nonce(), link_created_at = now()
     where id = v_m.id returning * into v_m;
  else
    update public.crew_members set link_nonce = null, link_created_at = null
     where id = v_m.id returning * into v_m;
  end if;
  return jsonb_build_object('member_id', v_m.id, 'token', public._crew_token(v_m.id, v_m.link_nonce));
end;
$$;

-- =====================================================================================
-- E. Storage bucket (first path segment = owner's user id, second = crew member id)
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('crew-photos', 'crew-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cd_crew_photos_insert_public on storage.objects;
create policy cd_crew_photos_insert_public on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'crew-photos' and public.can_upload_crew_photo(name));

drop policy if exists cd_crew_photos_select_own on storage.objects;
create policy cd_crew_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'crew-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists cd_crew_photos_delete_own on storage.objects;
create policy cd_crew_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'crew-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================================
-- F. Row level security + table privileges (Supabase grants ALL on new tables by default: tighten it)
-- =====================================================================================
alter table public.crew_members      enable row level security;
alter table public.crew_assignments  enable row level security;
alter table public.crew_job_sites    enable row level security;
alter table public.time_punches      enable row level security;
alter table public.crew_rate_events  enable row level security;
alter table public.crew_link_secret  enable row level security;

drop policy if exists crew_members_select_own on public.crew_members;
create policy crew_members_select_own on public.crew_members for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists crew_members_insert_own on public.crew_members;
create policy crew_members_insert_own on public.crew_members for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists crew_members_update_own on public.crew_members;
create policy crew_members_update_own on public.crew_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists crew_members_delete_own on public.crew_members;
create policy crew_members_delete_own on public.crew_members for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists crew_assignments_select_own on public.crew_assignments;
create policy crew_assignments_select_own on public.crew_assignments for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists crew_assignments_insert_own on public.crew_assignments;
create policy crew_assignments_insert_own on public.crew_assignments for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists crew_assignments_update_own on public.crew_assignments;
create policy crew_assignments_update_own on public.crew_assignments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists crew_assignments_delete_own on public.crew_assignments;
create policy crew_assignments_delete_own on public.crew_assignments for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists crew_job_sites_select_own on public.crew_job_sites;
create policy crew_job_sites_select_own on public.crew_job_sites for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists crew_job_sites_insert_own on public.crew_job_sites;
create policy crew_job_sites_insert_own on public.crew_job_sites for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists crew_job_sites_update_own on public.crew_job_sites;
create policy crew_job_sites_update_own on public.crew_job_sites for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists crew_job_sites_delete_own on public.crew_job_sites;
create policy crew_job_sites_delete_own on public.crew_job_sites for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists time_punches_select_own on public.time_punches;
create policy time_punches_select_own on public.time_punches for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists time_punches_insert_own on public.time_punches;
create policy time_punches_insert_own on public.time_punches for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists time_punches_update_own on public.time_punches;
create policy time_punches_update_own on public.time_punches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists time_punches_delete_own on public.time_punches;
create policy time_punches_delete_own on public.time_punches for delete to authenticated
  using (user_id = (select auth.uid()));
-- crew_rate_events, crew_link_secret: RLS on, no policies => server only.

revoke all on public.crew_members, public.crew_assignments, public.crew_job_sites, public.time_punches,
              public.crew_rate_events, public.crew_link_secret from anon;
revoke all on public.crew_rate_events, public.crew_link_secret from authenticated;
revoke truncate, references, trigger on public.crew_members, public.crew_assignments, public.crew_job_sites,
                                        public.time_punches from authenticated;
grant select, insert, update, delete on public.crew_members, public.crew_assignments, public.crew_job_sites,
                                        public.time_punches to authenticated;

-- Function privileges: only the functions of this migration (default-deny, explicit grants)
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        '_new_crew_nonce', '_crew_link_signature', '_crew_token', '_crew_member_id', '_crew_distance_m', '_crew_ip_hash',
        '_crew_rate_guard', '_crew_rpc', 'guard_crew_member', 'guard_crew_assignment', 'guard_crew_job_site',
        'guard_time_punch', 'crew_portal_get', 'crew_punch', 'can_upload_crew_photo', 'crew_links', 'crew_member_link'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- public crew link (no login)
grant execute on function public.crew_portal_get(text)                                     to anon, authenticated;
grant execute on function public.crew_punch(text, uuid, text, timestamptz, double precision, double precision,
                                            double precision, text, text, text, text)       to anon, authenticated;
grant execute on function public.can_upload_crew_photo(text)                               to anon, authenticated;

-- signed-in app
grant execute on function public.crew_links()                                              to authenticated;
grant execute on function public.crew_member_link(uuid, text)                              to authenticated;

notify pgrst, 'reload schema';
