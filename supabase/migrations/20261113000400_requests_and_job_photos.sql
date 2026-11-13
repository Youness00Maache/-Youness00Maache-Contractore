-- =====================================================================================
-- ContractorDocs: request-a-quote link (gap #5) and job photo timeline (gap #11).
--
-- ADDITIVE ONLY: new tables, functions, storage buckets and policies. No existing table, function,
-- policy or row is changed. Safe to run twice (if not exists / create or replace / drop policy if exists).
--
-- A. request_pages          one public page per contractor: /r/<slug> (slug can be regenerated, page turned off)
--    quote_requests         what visitors send (name, contact, address, details, up to 5 photos)
--    request_rate_events    rate limit per IP hash / contractor (server only, no raw IPs stored)
--    get_request_page()     anon: branding + intro of a page (never the contractor's private data)
--    submit_quote_request() anon: honeypot + rate limit + validation, returns the photo upload paths
--    convert_quote_request() owner: one tap -> client (matched or new) + job, respecting plan limits
-- B. job_photos             per-job photo stream (before / during / after / issue, caption, markup copies,
--                           shared in the client portal), Free plan storage cap enforced by a trigger
--    get_photo_usage(), get_portal_photos()
-- C. storage_cleanup_queue  files to delete after rows are deleted (job deleted, request deleted, unshared)
-- D. storage buckets: request-photos (private), job-photos (private), portal-photos (public copies of the
--    photos a contractor shares with a client; unguessable paths, no listing)
-- E. privileges (only for the functions created here; other migrations' grants are not touched)
--
-- Keep in sync with components/photos/photoLogic.ts (PHOTO_LIMITS) and components/requests/requestLogic.ts.
-- =====================================================================================

-- =====================================================================================
-- Helpers
-- =====================================================================================

-- Multi-line user text: keeps line breaks, drops other control characters, at most 2 blank lines in a row.
create or replace function public._clean_multiline(p text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(left(
           regexp_replace(
             replace(
               regexp_replace(replace(replace(coalesce(p, ''), E'\r\n', E'\n'), E'\n', chr(57344)), '[[:cntrl:]]+', ' ', 'g'),
               chr(57344), E'\n'),
             E'\n{3,}', E'\n\n', 'g'),
           p_max), E' \n'), '');
$$;

-- Photo storage per plan (keep in sync with components/photos/photoLogic.ts PHOTO_LIMITS).
--   per_job:     photos per job (null = unlimited)
--   total_bytes: all job photos of the account
create or replace function public.photo_limits(p_tier text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_tier, 'free'))
    when 'premium' then jsonb_build_object('per_job', null, 'total_bytes', 5368709120)
    when 'ai'      then jsonb_build_object('per_job', null, 'total_bytes', 10737418240)
    else                jsonb_build_object('per_job', 30,   'total_bytes', 262144000)
  end;
$$;

-- =====================================================================================
-- A. Request-a-quote
-- =====================================================================================
create table if not exists public.request_pages (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  enabled     boolean not null default true,
  intro       text check (intro is null or length(intro) <= 400),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint request_pages_slug_key unique (slug)
);
comment on table public.request_pages is 'Public request-a-quote page per contractor (/r/<slug>). Written only through RPCs.';

create table if not exists public.quote_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  phone         text check (phone is null or length(phone) <= 40),
  email         text check (email is null or length(email) <= 254),
  address       text check (address is null or length(address) <= 300),
  details       text check (details is null or length(details) <= 3000),
  -- storage paths in the request-photos bucket: <user_id>/<request_id>/<n>.<ext>
  photo_paths   text[] not null default '{}'::text[] check (cardinality(photo_paths) <= 5),
  source        text check (source is null or source ~ '^[a-z0-9_-]{1,20}$'),
  status        text not null default 'new' check (status in ('new', 'seen', 'converted', 'archived')),
  client_id     uuid references public.clients(id) on delete set null,
  job_id        uuid references public.jobs(id) on delete set null,
  converted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint quote_requests_contact_check check (phone is not null or email is not null)
);
comment on table public.quote_requests is 'Requests sent from the public request-a-quote page. Inserted only by submit_quote_request().';

create table if not exists public.request_rate_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);
comment on table public.request_rate_events is 'Rate limit log for submit_quote_request (sha256 of the IP, never the IP). Server only.';

drop trigger if exists tr_request_pages_updated_at on public.request_pages;
create trigger tr_request_pages_updated_at before update on public.request_pages
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_quote_requests_updated_at on public.quote_requests;
create trigger tr_quote_requests_updated_at before update on public.quote_requests
  for each row execute function public.handle_updated_at();

create index if not exists idx_quote_requests_user_status_created on public.quote_requests (user_id, status, created_at desc);
create index if not exists idx_quote_requests_user_created on public.quote_requests (user_id, created_at desc);
create index if not exists idx_quote_requests_job on public.quote_requests (job_id) where job_id is not null;
create index if not exists idx_request_rate_events_ip_created on public.request_rate_events (ip_hash, created_at desc);
create index if not exists idx_request_rate_events_user_created on public.request_rate_events (user_id, created_at desc);
create index if not exists idx_request_rate_events_created on public.request_rate_events (created_at);

-- "acme-roofing-7k2mq": readable base from the company name + 5 random characters (no 0/o/1/l/i).
create or replace function public._new_request_slug(p_base text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_base   text := btrim(regexp_replace(lower(coalesce(p_base, '')), '[^a-z0-9]+', '-', 'g'), '-');
  v_bytes  bytea;
  v_suffix text;
  v_slug   text;
  i        integer;
  n        integer;
begin
  v_base := btrim(left(v_base, 24), '-');
  for n in 1..20 loop
    v_bytes := extensions.gen_random_bytes(5);
    v_suffix := '';
    for i in 0..4 loop
      v_suffix := v_suffix || substr(v_alpha, (get_byte(v_bytes, i) % length(v_alpha)) + 1, 1);
    end loop;
    v_slug := case when length(v_base) >= 2 then v_base || '-' || v_suffix else 'quote-' || v_suffix end;
    if not exists (select 1 from public.request_pages where slug = v_slug) then
      return v_slug;
    end if;
  end loop;
  raise exception 'Could not create a unique link. Please try again.' using errcode = 'P0001';
end;
$$;

-- Signed-in contractor: their page (created on first call, turned on).
create or replace function public.get_my_request_page()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_row  public.request_pages%rowtype;
  v_base text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select * into v_row from public.request_pages where user_id = v_uid;
  if not found then
    select coalesce(nullif(btrim(p.company_name), ''), p.name) into v_base from public.profiles p where p.id = v_uid;
    insert into public.request_pages (user_id, slug)
    values (v_uid, public._new_request_slug(v_base))
    on conflict (user_id) do nothing;
    select * into v_row from public.request_pages where user_id = v_uid;
  end if;
  return jsonb_build_object(
    'slug', v_row.slug,
    'enabled', v_row.enabled,
    'intro', v_row.intro,
    'tier', public.user_effective_tier(v_uid),
    'new_count', (select count(*) from public.quote_requests r where r.user_id = v_uid and r.status = 'new'));
end;
$$;

-- p_enabled / p_intro: null = keep; p_intro '' = remove the intro.
create or replace function public.update_request_page(p_enabled boolean default null, p_intro text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform public.get_my_request_page();
  update public.request_pages
     set enabled = coalesce(p_enabled, enabled),
         intro = case when p_intro is null then intro else public._clean_multiline(p_intro, 400) end
   where user_id = v_uid;
  return public.get_my_request_page();
end;
$$;

-- New link: the old link and printed QR codes stop working right away.
create or replace function public.regenerate_request_slug()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_base text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform public.get_my_request_page();
  select coalesce(nullif(btrim(p.company_name), ''), p.name) into v_base from public.profiles p where p.id = v_uid;
  update public.request_pages set slug = public._new_request_slug(v_base) where user_id = v_uid;
  return public.get_my_request_page();
end;
$$;

-- Public (anon): what /r/<slug> shows. Never returns the contractor's address, ids or plan details.
create or replace function public.get_request_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_page public.request_pages%rowtype;
begin
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then
    raise exception 'Request page not found' using errcode = 'P0002';
  end if;
  select * into v_page from public.request_pages where slug = v_slug;
  if not found then
    raise exception 'Request page not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'slug', v_page.slug,
    'enabled', v_page.enabled,
    'intro', v_page.intro,
    'contractor', coalesce(public._contractor_public_info(v_page.user_id), '{}'::jsonb) - 'address',
    'branded', public.user_effective_tier(v_page.user_id) = 'free',
    'limits', jsonb_build_object('photos', 5, 'photo_bytes', 4194304));
end;
$$;

-- Public (anon): stores a request. Returns { request_id, upload_paths[] }; the browser then uploads each photo
-- to its path in the request-photos bucket (allowed for 30 minutes, see can_upload_request_photo).
--   Spam protection: p_website is a honeypot (bots fill it) and p_elapsed_ms < 2.5 s is not a human: both get a
--   normal-looking answer and nothing is stored. Rate limit per IP hash: 3 per 10 minutes per page, 10 per day
--   overall; per page: 50 per day. Errors meant for the visitor are plain sentences (RATE_LIMIT: prefix for limits).
create or replace function public.submit_quote_request(
  p_slug        text,
  p_name        text,
  p_phone       text default null,
  p_email       text default null,
  p_address     text default null,
  p_details     text default null,
  p_photo_types text[] default '{}'::text[],
  p_source      text default null,
  p_website     text default null,
  p_elapsed_ms  integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug    text := lower(btrim(coalesce(p_slug, '')));
  v_page    public.request_pages%rowtype;
  v_headers jsonb;
  v_ip      text;
  v_hash    text;
  v_name    text := public._clean_text(p_name, 120);
  v_phone   text := public._clean_text(p_phone, 40);
  v_email   text := lower(public._clean_text(p_email, 254));
  v_address text := public._clean_multiline(p_address, 300);
  v_details text := public._clean_multiline(p_details, 3000);
  v_source  text := nullif(lower(left(regexp_replace(coalesce(p_source, ''), '[^A-Za-z0-9_-]', '', 'g'), 20)), '');
  v_id      uuid := gen_random_uuid();
  v_paths   text[] := '{}'::text[];
  v_ext     text;
  v_n       integer := 0;
begin
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then
    raise exception 'Request page not found' using errcode = 'P0002';
  end if;
  select * into v_page from public.request_pages where slug = v_slug;
  if not found then
    raise exception 'Request page not found' using errcode = 'P0002';
  end if;
  if not v_page.enabled then
    raise exception 'This business is not taking online requests right now.' using errcode = 'P0001', hint = 'disabled';
  end if;

  -- caller IP (Cloudflare / gateway headers), hashed
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := coalesce(nullif(btrim(v_headers->>'cf-connecting-ip'), ''),
                   nullif(btrim(v_headers->>'x-real-ip'), ''),
                   nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
                   'unknown');
  v_hash := encode(extensions.digest('cd-quote-request:' || v_ip, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('quote-request:' || v_page.user_id::text, 0));
  if (select count(*) from public.request_rate_events e
       where e.ip_hash = v_hash and e.user_id = v_page.user_id and e.created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.request_rate_events e
          where e.ip_hash = v_hash and e.created_at > now() - interval '1 day') >= 10
     or (select count(*) from public.request_rate_events e
          where e.user_id = v_page.user_id and e.created_at > now() - interval '1 day') >= 50 then
    raise exception 'RATE_LIMIT: Too many requests were sent from this device. Please try again later.'
      using errcode = 'P0001', hint = 'rate_limit';
  end if;
  insert into public.request_rate_events (user_id, ip_hash) values (v_page.user_id, v_hash);
  if random() < 0.02 then
    delete from public.request_rate_events where created_at < now() - interval '2 days';
  end if;

  -- honeypot / filled in faster than a person can: looks accepted, nothing is stored
  if nullif(btrim(coalesce(p_website, '')), '') is not null or (p_elapsed_ms is not null and p_elapsed_ms < 2500) then
    return jsonb_build_object('request_id', v_id, 'upload_paths', '[]'::jsonb);
  end if;

  if v_name is null then
    raise exception 'Please enter your name.' using errcode = '22023';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'Please enter a phone number or an email address so we can reach you.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Please check the email address.' using errcode = '22023';
  end if;
  if v_phone is not null and length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 6 and 20 then
    raise exception 'Please check the phone number.' using errcode = '22023';
  end if;
  if v_details is null or length(v_details) < 3 then
    raise exception 'Please tell us what you need.' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_photo_types, '{}'::text[])) > 5 then
    raise exception 'You can add up to 5 photos.' using errcode = '22023';
  end if;

  foreach v_ext in array coalesce(p_photo_types, '{}'::text[]) loop
    v_ext := lower(btrim(coalesce(v_ext, '')));
    if v_ext = 'jpeg' then v_ext := 'jpg'; end if;
    if v_ext not in ('jpg', 'png', 'webp') then
      raise exception 'Photos must be JPG, PNG or WebP images.' using errcode = '22023';
    end if;
    v_n := v_n + 1;
    v_paths := v_paths || (v_page.user_id::text || '/' || v_id::text || '/' || v_n::text || '.' || v_ext);
  end loop;

  insert into public.quote_requests (id, user_id, name, phone, email, address, details, photo_paths, source)
  values (v_id, v_page.user_id, v_name, v_phone, v_email, v_address, v_details, v_paths, v_source);

  return jsonb_build_object('request_id', v_id, 'upload_paths', to_jsonb(v_paths));
end;
$$;

-- Storage policy helper (anon): a request-photos upload must be one of the paths handed out by
-- submit_quote_request, within 30 minutes.
create or replace function public.can_upload_request_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quote_requests r
    where r.id = public._try_uuid(split_part(coalesce(p_name, ''), '/', 2))
      and r.user_id = public._try_uuid(split_part(coalesce(p_name, ''), '/', 1))
      and p_name = any (r.photo_paths)
      and r.created_at > now() - interval '30 minutes');
$$;

-- Owner: request -> client (existing one with the same email / phone / name, else a new one) + job.
-- The Free plan limits apply (triggers): a job limit refuses the whole conversion (PLAN_LIMIT), a client limit
-- only skips the client (the job keeps the typed name, like jobs created by hand). Converting twice returns the
-- job created the first time.
create or replace function public.convert_quote_request(
  p_request_id uuid, p_job_name text default null, p_start_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_req     public.quote_requests%rowtype;
  v_client  public.clients%rowtype;
  v_job     public.jobs%rowtype;
  v_digits  text;
  v_skipped text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select * into v_req from public.quote_requests where id = p_request_id and user_id = v_uid for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  if v_req.job_id is not null then
    select * into v_job from public.jobs where id = v_req.job_id and user_id = v_uid;
    if found then
      return jsonb_build_object(
        'job', to_jsonb(v_job),
        'client', (select to_jsonb(c) from public.clients c where c.id = v_req.client_id and c.user_id = v_uid),
        'already', true);
    end if;
  end if;

  v_digits := regexp_replace(coalesce(v_req.phone, ''), '[^0-9]', '', 'g');
  select c.* into v_client
    from public.clients c
   where c.user_id = v_uid
     and ((v_req.email is not null and lower(btrim(coalesce(c.email, ''))) = v_req.email)
          or (length(v_digits) >= 6 and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = v_digits))
   order by c.created_at
   limit 1;
  if not found then
    select c.* into v_client
      from public.clients c
     where c.user_id = v_uid and lower(btrim(c.name)) = lower(btrim(v_req.name))
     order by c.created_at
     limit 1;
  end if;
  if not found then
    begin
      insert into public.clients (user_id, name, email, phone, address, notes)
      values (v_uid, v_req.name, v_req.email, v_req.phone, v_req.address,
              'From your request-a-quote page (' || to_char(v_req.created_at at time zone 'utc', 'Mon DD, YYYY') || ').')
      returning * into v_client;
    exception when sqlstate 'P0001' then
      if sqlerrm like 'PLAN_LIMIT%' then
        v_skipped := btrim(regexp_replace(sqlerrm, '^PLAN_LIMIT:?', ''));
        v_client := null;
      else
        raise;
      end if;
    end;
  end if;

  insert into public.jobs (user_id, name, client_id, client_name, client_address, start_date, status)
  values (v_uid,
          coalesce(public._clean_text(p_job_name, 120), 'Quote request - ' || v_req.name),
          v_client.id,
          coalesce(v_client.name, v_req.name),
          coalesce(v_req.address, nullif(btrim(coalesce(v_client.address, '')), '')),
          coalesce(p_start_date, current_date),
          'active')
  returning * into v_job;

  update public.quote_requests
     set status = 'converted', client_id = v_client.id, job_id = v_job.id, converted_at = now()
   where id = v_req.id;

  return jsonb_build_object(
    'job', to_jsonb(v_job),
    'client', case when v_client.id is null then null else to_jsonb(v_client) end,
    'client_skipped', v_skipped,
    'already', false);
end;
$$;

-- =====================================================================================
-- B. Job photos
-- =====================================================================================
create table if not exists public.job_photos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id            uuid not null references public.jobs(id) on delete cascade,
  -- job-photos bucket: <user_id>/<job_id>/<photo_id>.jpg and the small preview <photo_id>_t.jpg
  storage_path      text not null,
  thumb_path        text,
  tag               text not null default 'during' check (tag in ('before', 'during', 'after', 'issue')),
  caption           text check (caption is null or length(caption) <= 500),
  taken_at          timestamptz not null default now(),
  width             integer check (width is null or width between 1 and 20000),
  height            integer check (height is null or height between 1 and 20000),
  -- photo + preview, as uploaded (counted against the plan's photo storage)
  size_bytes        integer not null check (size_bytes between 1 and 12582912),
  shared_in_portal  boolean not null default false,
  -- portal-photos bucket (public copy): <user_id>/<random>.jpg, set while shared
  portal_path       text,
  source_photo_id   uuid references public.job_photos(id) on delete set null,
  request_id        uuid references public.quote_requests(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint job_photos_storage_path_key unique (storage_path),
  constraint job_photos_shared_has_path check (not shared_in_portal or portal_path is not null)
);
comment on table public.job_photos is 'Per-job photo timeline. Files live in the private job-photos bucket; shared photos are copied to portal-photos.';

drop trigger if exists tr_job_photos_updated_at on public.job_photos;
create trigger tr_job_photos_updated_at before update on public.job_photos
  for each row execute function public.handle_updated_at();

create index if not exists idx_job_photos_user_job_taken on public.job_photos (user_id, job_id, taken_at desc);
create index if not exists idx_job_photos_job on public.job_photos (job_id);
create index if not exists idx_job_photos_thumb_path on public.job_photos (thumb_path) where thumb_path is not null;
create index if not exists idx_job_photos_shared on public.job_photos (user_id, job_id) where shared_in_portal;
create index if not exists idx_job_photos_source on public.job_photos (source_photo_id) where source_photo_id is not null;
create index if not exists idx_job_photos_request on public.job_photos (request_id) where request_id is not null;

-- Insert: same-owner job, paths inside <user>/<job>/, plan storage cap (PLAN_LIMIT, hint 'photos').
-- Update: a shared copy must live in the owner's folder.
create or replace function public.guard_job_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix  text;
  v_re      constant text := '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$';
  v_tier    text;
  v_limits  jsonb;
  v_per_job integer;
  v_total   bigint;
  v_count   integer;
  v_used    bigint;
begin
  if tg_op = 'UPDATE' then
    if new.portal_path is not null
       and (split_part(new.portal_path, '/', 1) <> new.user_id::text
            or new.portal_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$') then
      raise exception 'Invalid shared photo path' using errcode = '22023';
    end if;
    return new;
  end if;

  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    raise exception 'Job not found' using errcode = '23503', detail = 'job_photos.job_id must belong to the same user';
  end if;
  v_prefix := new.user_id::text || '/' || new.job_id::text || '/';
  if left(new.storage_path, length(v_prefix)) <> v_prefix or new.storage_path !~ v_re
     or (new.thumb_path is not null and (left(new.thumb_path, length(v_prefix)) <> v_prefix or new.thumb_path !~ v_re)) then
    raise exception 'Invalid photo path' using errcode = '22023';
  end if;
  -- sharing is a separate step (the public copy is made first)
  new.shared_in_portal := false;
  new.portal_path := null;
  if new.source_photo_id is not null
     and not exists (select 1 from public.job_photos p where p.id = new.source_photo_id and p.user_id = new.user_id) then
    new.source_photo_id := null;
  end if;
  if new.request_id is not null
     and not exists (select 1 from public.quote_requests r where r.id = new.request_id and r.user_id = new.user_id) then
    new.request_id := null;
  end if;

  if public.is_service_context() then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('job-photos:' || new.user_id::text, 0));
  v_tier := public.user_effective_tier(new.user_id);
  v_limits := public.photo_limits(v_tier);
  v_per_job := (v_limits->>'per_job')::int;
  v_total := (v_limits->>'total_bytes')::bigint;

  if v_per_job is not null then
    select count(*) into v_count from public.job_photos p where p.user_id = new.user_id and p.job_id = new.job_id;
    if v_count >= v_per_job then
      raise exception 'PLAN_LIMIT: The Free plan keeps up to % photos per job. Upgrade to Premium for unlimited photos per job and 5 GB of photo storage.', v_per_job
        using errcode = 'P0001', hint = 'photos';
    end if;
  end if;
  if v_total is not null then
    select coalesce(sum(p.size_bytes), 0) into v_used from public.job_photos p where p.user_id = new.user_id;
    if v_used + new.size_bytes > v_total then
      if v_tier = 'free' then
        raise exception 'PLAN_LIMIT: Your photos use all % MB included in the Free plan. Upgrade to Premium for 5 GB of photo storage.', v_total / 1048576
          using errcode = 'P0001', hint = 'photos';
      elsif v_tier = 'premium' then
        raise exception 'PLAN_LIMIT: Your photos use all 5 GB included in Premium. Upgrade to Premium + AI for 10 GB, or delete photos you no longer need.'
          using errcode = 'P0001', hint = 'photos';
      else
        raise exception 'PLAN_LIMIT: Your photos use all 10 GB of photo storage. Delete photos you no longer need to add more.'
          using errcode = 'P0001', hint = 'photos';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_photos_guard on public.job_photos;
create trigger trg_job_photos_guard before insert or update on public.job_photos
  for each row execute function public.guard_job_photo();

-- Storage policy helper: a job-photos upload must match a row the user created in the last hour.
create or replace function public.can_upload_job_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.job_photos p
    where p.user_id = (select auth.uid())
      and (p.storage_path = p_name or p.thumb_path = p_name)
      and p.created_at > now() - interval '1 hour');
$$;

-- Signed-in user: photo storage used / allowed (p_job_id adds that job's photo count).
create or replace function public.get_photo_usage(p_job_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_tier text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  v_tier := public.user_effective_tier(v_uid);
  return (
    select jsonb_build_object(
      'tier', v_tier,
      'limits', public.photo_limits(v_tier),
      'total_bytes', coalesce(sum(p.size_bytes), 0),
      'total_count', count(*),
      'job_count', count(*) filter (where p.job_id = p_job_id))
    from public.job_photos p
    where p.user_id = v_uid);
end;
$$;

-- Public (anon, portal key): photos the contractor shared, from the jobs of that client.
-- Paths point into the public portal-photos bucket (unguessable names, the bucket cannot be listed).
create or replace function public.get_portal_photos(p_key text)
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
    select jsonb_agg(to_jsonb(x) order by x.job_name, x.taken_at)
    from (
      select p.id, p.job_id, j.name as job_name, p.tag, p.caption, p.taken_at, p.portal_path as path
      from public.job_photos p
      join public.jobs j on j.id = p.job_id and j.user_id = p.user_id
      where p.user_id = v_client.user_id
        and p.shared_in_portal
        and p.portal_path is not null
        and (j.client_id = v_client.id
             or (j.client_id is null and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
      order by p.taken_at
      limit 300
    ) x), '[]'::jsonb);
end;
$$;

-- =====================================================================================
-- C. Files to remove after rows are deleted (the app empties this queue; SQL cannot delete storage files)
-- =====================================================================================
create table if not exists public.storage_cleanup_queue (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  bucket      text not null check (bucket in ('job-photos', 'portal-photos', 'request-photos')),
  path        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_storage_cleanup_queue_user on public.storage_cleanup_queue (user_id, id);

create or replace function public.enqueue_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- a deleted account cascades here: nothing to queue
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return null;
  end if;
  if tg_table_name = 'job_photos' then
    if tg_op = 'DELETE' then
      insert into public.storage_cleanup_queue (user_id, bucket, path)
      select old.user_id, v.b, v.p
      from (values ('job-photos', old.storage_path), ('job-photos', old.thumb_path), ('portal-photos', old.portal_path)) v(b, p)
      where v.p is not null;
    elsif old.portal_path is not null and old.portal_path is distinct from new.portal_path then
      insert into public.storage_cleanup_queue (user_id, bucket, path) values (old.user_id, 'portal-photos', old.portal_path);
    end if;
  elsif tg_table_name = 'quote_requests' and tg_op = 'DELETE' then
    insert into public.storage_cleanup_queue (user_id, bucket, path)
    select old.user_id, 'request-photos', x.p from unnest(old.photo_paths) as x(p) where x.p is not null;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_job_photos_cleanup on public.job_photos;
create trigger trg_job_photos_cleanup after delete or update of portal_path on public.job_photos
  for each row execute function public.enqueue_storage_cleanup();
drop trigger if exists trg_quote_requests_cleanup on public.quote_requests;
create trigger trg_quote_requests_cleanup after delete on public.quote_requests
  for each row execute function public.enqueue_storage_cleanup();

-- =====================================================================================
-- Row level security + table privileges (Supabase grants ALL on new tables by default: tighten it)
-- =====================================================================================
alter table public.request_pages          enable row level security;
alter table public.quote_requests         enable row level security;
alter table public.request_rate_events    enable row level security;
alter table public.job_photos             enable row level security;
alter table public.storage_cleanup_queue  enable row level security;

drop policy if exists request_pages_select_own on public.request_pages;
create policy request_pages_select_own on public.request_pages for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists quote_requests_select_own on public.quote_requests;
create policy quote_requests_select_own on public.quote_requests for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists quote_requests_update_own on public.quote_requests;
create policy quote_requests_update_own on public.quote_requests for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists quote_requests_delete_own on public.quote_requests;
create policy quote_requests_delete_own on public.quote_requests for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists job_photos_select_own on public.job_photos;
create policy job_photos_select_own on public.job_photos for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists job_photos_insert_own on public.job_photos;
create policy job_photos_insert_own on public.job_photos for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists job_photos_update_own on public.job_photos;
create policy job_photos_update_own on public.job_photos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists job_photos_delete_own on public.job_photos;
create policy job_photos_delete_own on public.job_photos for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists storage_cleanup_queue_select_own on public.storage_cleanup_queue;
create policy storage_cleanup_queue_select_own on public.storage_cleanup_queue for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists storage_cleanup_queue_delete_own on public.storage_cleanup_queue;
create policy storage_cleanup_queue_delete_own on public.storage_cleanup_queue for delete to authenticated
  using (user_id = (select auth.uid()));
-- request_rate_events: RLS on, no policies => server only.

revoke all on public.request_pages, public.quote_requests, public.request_rate_events, public.job_photos,
              public.storage_cleanup_queue from anon;
revoke all on public.request_rate_events from authenticated;
revoke insert, update, delete, truncate on public.request_pages from authenticated;
grant select on public.request_pages to authenticated;
revoke insert, update, truncate on public.quote_requests from authenticated;
grant select, delete on public.quote_requests to authenticated;
grant update (status) on public.quote_requests to authenticated;
revoke update, truncate on public.job_photos from authenticated;
grant select, insert, delete on public.job_photos to authenticated;
grant update (tag, caption, taken_at, shared_in_portal, portal_path) on public.job_photos to authenticated;
revoke insert, update, truncate on public.storage_cleanup_queue from authenticated;
grant select, delete on public.storage_cleanup_queue to authenticated;

do $$
declare
  v_seq text;
begin
  foreach v_seq in array array[pg_get_serial_sequence('public.request_rate_events', 'id'),
                               pg_get_serial_sequence('public.storage_cleanup_queue', 'id')]
  loop
    if v_seq is not null then
      execute format('revoke all on sequence %s from anon, authenticated', v_seq);
    end if;
  end loop;
end $$;

-- =====================================================================================
-- D. Storage buckets + policies (first path segment = owner's user id)
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('request-photos', 'request-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp']),
  ('job-photos',     'job-photos',     false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('portal-photos',  'portal-photos',  true,  5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Visitors (anon) upload request photos only to the paths submit_quote_request handed out (30 minutes).
drop policy if exists cd_request_photos_insert_public on storage.objects;
create policy cd_request_photos_insert_public on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'request-photos' and public.can_upload_request_photo(name));

-- Owners read / delete their own files in the three buckets.
drop policy if exists cd_photos_select_own on storage.objects;
create policy cd_photos_select_own on storage.objects for select to authenticated
  using (bucket_id in ('request-photos', 'job-photos', 'portal-photos')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists cd_photos_delete_own on storage.objects;
create policy cd_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id in ('request-photos', 'job-photos', 'portal-photos')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Owners upload job photos only for rows they created (so the plan cap can't be bypassed), and public
-- portal copies into their own folder. No UPDATE policy: files are never overwritten (markup = new photo).
drop policy if exists cd_photos_insert_own on storage.objects;
create policy cd_photos_insert_own on storage.objects for insert to authenticated
  with check ((bucket_id = 'job-photos'
               and (storage.foldername(name))[1] = (select auth.uid())::text
               and public.can_upload_job_photo(name))
           or (bucket_id = 'portal-photos'
               and (storage.foldername(name))[1] = (select auth.uid())::text));

-- =====================================================================================
-- E. Function privileges: only the functions of this migration (default-deny, explicit grants)
-- =====================================================================================
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
        '_clean_multiline', 'photo_limits', '_new_request_slug', 'get_my_request_page', 'update_request_page',
        'regenerate_request_slug', 'get_request_page', 'submit_quote_request', 'can_upload_request_photo',
        'convert_quote_request', 'guard_job_photo', 'can_upload_job_photo', 'get_photo_usage', 'get_portal_photos',
        'enqueue_storage_cleanup'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- public pages (no login)
grant execute on function public.get_request_page(text)                                   to anon, authenticated;
grant execute on function public.submit_quote_request(text, text, text, text, text, text, text[], text, text, integer)
                                                                                           to anon, authenticated;
grant execute on function public.can_upload_request_photo(text)                           to anon, authenticated;
grant execute on function public.get_portal_photos(text)                                  to anon, authenticated;

-- signed-in app
grant execute on function public.get_my_request_page()                                    to authenticated;
grant execute on function public.update_request_page(boolean, text)                       to authenticated;
grant execute on function public.regenerate_request_slug()                                to authenticated;
grant execute on function public.convert_quote_request(uuid, text, date)                  to authenticated;
grant execute on function public.get_photo_usage(uuid)                                    to authenticated;
grant execute on function public.can_upload_job_photo(text)                               to authenticated;
grant execute on function public.photo_limits(text)                                       to authenticated;

notify pgrst, 'reload schema';
