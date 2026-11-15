-- Applied 2026-11-15 with the owner's OK ("Yes, approve all", roadmap D8) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: feedback_responses with RLS + 4 owner policies + column-level update grants (browser can't write rating/status), 6 new request_pages columns, 3 triggers, no anon table grants, anon can run only get_feedback_request / submit_feedback / get_public_profile_extras, bad tokens and unknown pages refused, owner profile functions need a login. (The Premium insert path could not be exercised: no Premium account exists yet.)
-- =====================================================================================
-- ContractorDocs: client feedback / reviews + richer public profile (competitor roadmap batch D8: #36, #38)
--
-- A. feedback_responses   after a job the contractor asks the client for feedback. The client opens a private link
--                         (/feedback/<token>), gives 1-5 stars, an optional comment and their name, ONCE. A rating of
--                         4-5 is then nudged to the contractor's Google review link (profiles.google_review_link),
--                         which is returned ONLY in the submit result (never before). The owner sees the responses,
--                         can show one as a TESTIMONIAL on the public page (owner approval, display name chosen by the
--                         owner, never an email / phone), hide it again, and keep a private note.
-- B. request_pages        new nullable columns for the public page /r/<slug>: about, services, service area,
--                         license line, years-in-business line, gallery (owner-picked job photos COPIED to the public
--                         portal-photos bucket like portal photos; removed copies go to storage_cleanup_queue).
--
-- Who writes what (feedback_responses)
--   * the contractor (browser, RLS owner-only): inserts a request (job / client / names; the token, status and the
--     client's fields are set by the database) and updates ONLY testimonial, testimonial_name, testimonial_text,
--     owner_note, hidden (column grants + guard_feedback_flow keep everything else as it was), deletes.
--   * the client writes only through submit_feedback() (token; rating, comment, client_name, submitted_at, status).
-- Plan: creating a feedback request is Premium (the existing review request after "Mark as paid" is Premium); the
--   check runs on insert only, so a downgraded account keeps its responses and testimonials. Profile fields: no gate.
-- Limits (keep in sync with lib/feedback/feedbackTypes.ts FEEDBACK_LIMITS and lib/profile/profileTypes.ts
--   PROFILE_LIMITS): 5000 feedback requests per account, 200 new per day; comment 2000, client name 80, testimonial
--   name 60, testimonial text 600 (must be a part of the client's own comment), owner note 2000. Profile: about 1500,
--   20 services of 60, service area 200, license line 160, years line 80, gallery 12 photos (caption 200).
-- Rate limiting: none on submit_feedback (like answer_portal_question): the token is 256-bit random and a request
--   can be answered once. The quote-request rate table is NOT used (it would eat the contractor's quote quota).
--
-- Public functions (anon + authenticated):
--   get_feedback_request(token)          contractor name / company / logo, job name, client first name, status
--   submit_feedback(token, rating, comment, name)   once; returns {ok, rating, review_url (rating >= 4 only)}
--   get_public_profile_extras(slug)      about, services, service area, license / years lines, gallery (public paths +
--                                        captions), approved testimonials (rating, display name, text, date) + their
--                                        average and count. NOTHING else. The existing get_request_page and
--                                        submit_quote_request are NOT changed: the app calls both reads.
-- Owner functions (authenticated): get_my_request_profile(), update_request_profile(...), set_request_profile_gallery(items)
--   (request_pages has no browser write grant: it is written only through definer functions, like update_request_page,
--   which is left as it is).
--
-- ADDITIVE ONLY: one new table, nullable columns on request_pages (add column if not exists), new functions and
-- triggers. No existing column, row, function or policy is changed. Safe to run twice. Needs (applied in production):
-- 20261112000100 (user_effective_tier, is_service_context), 20261112000200 (_clean_text, _contractor_public_info,
-- _try_uuid), 20261113000200 (profiles.google_review_link), 20261113000400 (request_pages, _clean_multiline,
-- get_my_request_page, job_photos, storage_cleanup_queue, portal-photos bucket + owner insert policy).
--
-- Known gap (same as job photos): deleting the account cascades request_pages; its gallery copies are not queued.
--
-- Rollback: drop function public.get_feedback_request(text), public.submit_feedback(text, integer, text, text),
--   public.get_public_profile_extras(text), public.get_my_request_profile(), public.update_request_profile(text, text[],
--   text, text, text), public.set_request_profile_gallery(jsonb), public.guard_feedback_flow(),
--   public.guard_feedback_response(), public._feedback_display_name(text); drop table public.feedback_responses;
--   alter table public.request_pages drop column about, services, service_area, license_line, years_line, gallery.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Table + request_pages columns
-- -------------------------------------------------------------------------------------
create table if not exists public.feedback_responses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete set null,
  client_id          uuid references public.clients(id) on delete set null,
  -- snapshots (kept when the job / client is deleted); first name only
  job_name           text check (job_name is null or length(job_name) <= 160),
  client_first_name  text check (client_first_name is null or length(client_first_name) <= 60),
  -- private link: 43 url-safe characters from 32 random bytes, set by guard_feedback_response (never by the browser)
  token              text not null check (token ~ '^[A-Za-z0-9_-]{32,128}$'),
  status             text not null default 'requested' check (status in ('requested', 'submitted')),
  requested_at       timestamptz not null default now(),
  -- the client's answer (written only by submit_feedback)
  submitted_at       timestamptz,
  rating             smallint check (rating is null or rating between 1 and 5),
  comment            text check (comment is null or length(comment) <= 2000),
  client_name        text check (client_name is null or length(client_name) <= 80),
  -- the owner's choices
  testimonial        boolean not null default false,
  testimonial_name   text check (testimonial_name is null or length(testimonial_name) <= 60),
  testimonial_text   text check (testimonial_text is null or length(testimonial_text) <= 600),
  owner_note         text check (owner_note is null or length(owner_note) <= 2000),
  hidden             boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint feedback_responses_token_key unique (token),
  constraint feedback_responses_submitted_rated check (status = 'requested' or (rating is not null and submitted_at is not null)),
  constraint feedback_responses_testimonial_submitted check (not testimonial or status = 'submitted')
);
comment on table public.feedback_responses is 'Client feedback requests and answers (private link /feedback/<token>). Testimonials shown on /r/<slug> only when the owner approves. See lib/feedback.';

create index if not exists idx_feedback_responses_user_created on public.feedback_responses (user_id, created_at desc);
create index if not exists idx_feedback_responses_job on public.feedback_responses (job_id) where job_id is not null;
create index if not exists idx_feedback_responses_public on public.feedback_responses (user_id, submitted_at desc)
  where testimonial and not hidden and status = 'submitted';

drop trigger if exists tr_feedback_responses_updated_at on public.feedback_responses;
create trigger tr_feedback_responses_updated_at before update on public.feedback_responses
  for each row execute function public.handle_updated_at();

alter table public.request_pages add column if not exists about text
  check (about is null or length(about) <= 1500);
alter table public.request_pages add column if not exists services text[]
  check (services is null or (cardinality(services) <= 20 and length(array_to_string(services, '|')) <= 1400));
alter table public.request_pages add column if not exists service_area text
  check (service_area is null or length(service_area) <= 200);
alter table public.request_pages add column if not exists license_line text
  check (license_line is null or length(license_line) <= 160);
alter table public.request_pages add column if not exists years_line text
  check (years_line is null or length(years_line) <= 80);
-- [{path, caption, photo_id}]: path = public copy in portal-photos (<user_id>/<random>.<ext>)
alter table public.request_pages add column if not exists gallery jsonb
  check (gallery is null or (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 12));

-- -------------------------------------------------------------------------------------
-- B. Helpers + write guards
-- -------------------------------------------------------------------------------------
-- "Jane Smith" -> "Jane S."; "Jane" -> "Jane"; anything with '@' (an email) or nothing usable -> null.
-- Digits and symbols are dropped (no phone numbers). Mirror: lib/feedback/feedbackLogic.ts displayNameFromClientName.
create or replace function public._feedback_display_name(p_name text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
           when coalesce(p_name, '') like '%@%' then null
           when c.parts[1] is null or c.parts[1] = '' then null
           when cardinality(c.parts) = 1 then left(c.parts[1], 30)
           else left(c.parts[1], 30) || ' ' || upper(left(c.parts[cardinality(c.parts)], 1)) || '.'
         end
  from (select regexp_split_to_array(
                 btrim(regexp_replace(coalesce(p_name, ''), '[^[:alpha:][:space:]''-]+', ' ', 'g')), '\s+') as parts) c;
$$;

-- The client's fields, the token and the status belong to the database.
-- NOT security definer (like guard_job_question_flow): current_user is then the writer, so a save from the browser
-- ('authenticated') is told apart from submit_feedback (which runs as its owner). It reads no table.
--   browser insert: status 'requested', no answer, no testimonial.
--   browser update: only testimonial, testimonial_name, testimonial_text, owner_note, hidden change.
create or replace function public.guard_feedback_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_browser boolean := current_user in ('authenticated', 'anon');
begin
  if not v_browser then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'requested';
    new.requested_at := now();
    new.submitted_at := null;
    new.rating := null;
    new.comment := null;
    new.client_name := null;
    new.testimonial := false;
    new.testimonial_name := null;
    new.testimonial_text := null;
    new.hidden := false;
    return new;
  end if;
  -- update: the request itself and the client's answer stay as they were
  new.user_id := old.user_id;
  new.token := old.token;
  new.job_id := case when new.job_id is null then null else old.job_id end;
  new.client_id := case when new.client_id is null then null else old.client_id end;
  new.job_name := old.job_name;
  new.client_first_name := old.client_first_name;
  new.status := old.status;
  new.requested_at := old.requested_at;
  new.submitted_at := old.submitted_at;
  new.rating := old.rating;
  new.comment := old.comment;
  new.client_name := old.client_name;
  return new;
end;
$$;

-- Insert: token, same-owner job / client, snapshots, Premium, caps. Update: token / owner fixed, owner fields cleaned
-- (the testimonial name is never an email or phone; the testimonial text must be a part of the client's comment).
create or replace function public.guard_feedback_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_name    text;
  v_job_client  uuid;
  v_job_cname   text;
  v_client_name text;
  v_count       integer;
  v_norm_text   text;
  v_norm_comm   text;
begin
  if tg_op = 'INSERT' then
    new.token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
    if new.job_id is not null then
      select j.name, j.client_id, j.client_name into v_job_name, v_job_client, v_job_cname
        from public.jobs j where j.id = new.job_id and j.user_id = new.user_id;
      if not found then
        raise exception 'Job not found' using errcode = '23503', detail = 'feedback_responses.job_id must belong to the same user';
      end if;
      new.job_name := public._clean_text(v_job_name, 160);
      new.client_id := coalesce(new.client_id, v_job_client);
    else
      new.job_name := public._clean_text(new.job_name, 160);
    end if;
    if new.client_id is not null then
      select c.name into v_client_name from public.clients c where c.id = new.client_id and c.user_id = new.user_id;
      if not found then
        raise exception 'Client not found' using errcode = '23503', detail = 'feedback_responses.client_id must belong to the same user';
      end if;
    end if;
    -- first name only
    new.client_first_name := public._clean_text(
      split_part(btrim(coalesce(v_client_name, v_job_cname, new.client_first_name, '')), ' ', 1), 60);
    if new.client_first_name like '%@%' then
      new.client_first_name := null;
    end if;

    if not public.is_service_context() then
      if public.user_effective_tier(new.user_id) not in ('premium', 'ai') then
        raise exception 'PLAN_LIMIT: Feedback requests are part of Premium.' using errcode = 'P0001', hint = 'feedback';
      end if;
      perform pg_advisory_xact_lock(hashtextextended('feedback:' || new.user_id::text, 0));
      select count(*) into v_count from public.feedback_responses f where f.user_id = new.user_id;
      if v_count >= 5000 then
        raise exception 'Your account holds up to 5000 feedback requests. Delete old ones you no longer need.' using errcode = 'P0001';
      end if;
      select count(*) into v_count from public.feedback_responses f
       where f.user_id = new.user_id and f.created_at > now() - interval '1 day';
      if v_count >= 200 then
        raise exception 'You can send up to 200 feedback requests a day. Please try again tomorrow.' using errcode = 'P0001';
      end if;
    end if;
  else
    new.token := old.token;
    new.user_id := old.user_id;
  end if;

  -- owner fields (both operations; a browser insert has them cleared by guard_feedback_flow)
  new.owner_note := public._clean_multiline(new.owner_note, 2000);
  new.testimonial_name := public._clean_text(new.testimonial_name, 60);
  if new.testimonial_name is not null
     and (new.testimonial_name like '%@%' or length(regexp_replace(new.testimonial_name, '[^0-9]', '', 'g')) >= 5) then
    raise exception 'The name shown with a testimonial cannot be an email address or a phone number.' using errcode = '22023';
  end if;
  new.testimonial_text := public._clean_multiline(new.testimonial_text, 600);
  if new.testimonial_text is not null then
    v_norm_text := lower(regexp_replace(btrim(new.testimonial_text), '\s+', ' ', 'g'));
    v_norm_comm := lower(regexp_replace(coalesce(new.comment, ''), '\s+', ' ', 'g'));
    if position(v_norm_text in v_norm_comm) = 0 then
      raise exception 'The quote must be a part of what the client wrote.' using errcode = '22023';
    end if;
  end if;
  if new.testimonial and new.status <> 'submitted' then
    raise exception 'Only a received answer can be shown as a testimonial.' using errcode = '22023';
  end if;
  if new.testimonial and new.testimonial_name is null then
    new.testimonial_name := coalesce(public._feedback_display_name(new.client_name),
                                     public._feedback_display_name(new.client_first_name));
  end if;
  return new;
end;
$$;

-- guard_feedback_flow runs first (triggers fire in name order: ..._flow < ..._guard)
drop trigger if exists trg_feedback_responses_flow on public.feedback_responses;
create trigger trg_feedback_responses_flow before insert or update on public.feedback_responses
  for each row execute function public.guard_feedback_flow();
drop trigger if exists trg_feedback_responses_guard on public.feedback_responses;
create trigger trg_feedback_responses_guard before insert or update on public.feedback_responses
  for each row execute function public.guard_feedback_response();

-- -------------------------------------------------------------------------------------
-- C. Row level security + table privileges (owner-only; update limited to the owner's columns)
-- -------------------------------------------------------------------------------------
alter table public.feedback_responses enable row level security;

drop policy if exists feedback_responses_select_own on public.feedback_responses;
drop policy if exists feedback_responses_insert_own on public.feedback_responses;
drop policy if exists feedback_responses_update_own on public.feedback_responses;
drop policy if exists feedback_responses_delete_own on public.feedback_responses;
create policy feedback_responses_select_own on public.feedback_responses for select to authenticated
  using (user_id = (select auth.uid()));
create policy feedback_responses_insert_own on public.feedback_responses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy feedback_responses_update_own on public.feedback_responses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy feedback_responses_delete_own on public.feedback_responses for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.feedback_responses from anon;
revoke all on public.feedback_responses from authenticated;
grant select, insert, delete on public.feedback_responses to authenticated;
grant update (testimonial, testimonial_name, testimonial_text, owner_note, hidden) on public.feedback_responses to authenticated;
grant all on public.feedback_responses to service_role;

-- -------------------------------------------------------------------------------------
-- D. Feedback link (anon, token). A bad / unknown token always gets the same 'Feedback link not found'.
-- -------------------------------------------------------------------------------------
create or replace function public.get_feedback_request(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_f public.feedback_responses%rowtype;
  v_c jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Feedback link not found' using errcode = 'P0002';
  end if;
  select * into v_f from public.feedback_responses where token = p_token;
  if not found then
    raise exception 'Feedback link not found' using errcode = 'P0002';
  end if;
  v_c := coalesce(public._contractor_public_info(v_f.user_id), '{}'::jsonb);
  return jsonb_build_object(
    'status', v_f.status,
    'submitted', v_f.status = 'submitted',
    'rating', case when v_f.status = 'submitted' then v_f.rating end,
    'submitted_at', v_f.submitted_at,
    'job_name', v_f.job_name,
    'client_first_name', v_f.client_first_name,
    'contractor', jsonb_build_object(
      'name', v_c->>'name', 'company_name', v_c->>'company_name', 'logo_url', v_c->>'logo_url'));
end;
$$;

-- Once per link. The Google review link comes back only here, only for 4-5 stars, only an https link.
create or replace function public.submit_feedback(p_token text, p_rating integer, p_comment text default null, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f       public.feedback_responses%rowtype;
  v_comment text := public._clean_multiline(p_comment, 2000);
  v_name    text := public._clean_text(p_name, 80);
  v_review  text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Feedback link not found' using errcode = 'P0002';
  end if;
  select * into v_f from public.feedback_responses where token = p_token for update;
  if not found then
    raise exception 'Feedback link not found' using errcode = 'P0002';
  end if;
  if v_f.status <> 'requested' then
    raise exception 'ALREADY_SUBMITTED: Thank you, your feedback was already sent.' using errcode = 'P0001', hint = 'already_submitted';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Please choose 1 to 5 stars.' using errcode = '22023';
  end if;

  update public.feedback_responses
     set status = 'submitted',
         rating = p_rating,
         comment = v_comment,
         client_name = v_name,
         submitted_at = now()
   where id = v_f.id;

  if p_rating >= 4 then
    select p.google_review_link into v_review from public.profiles p where p.id = v_f.user_id;
    if v_review is null or v_review !~* '^https://[^[:space:]]+$' then
      v_review := null;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'rating', p_rating, 'review_url', v_review);
end;
$$;

-- -------------------------------------------------------------------------------------
-- E. Public profile extras for /r/<slug> (anon). Same not-found error as get_request_page. A page turned off shows
--    no extras. Testimonials: approved (testimonial), not hidden, submitted only.
-- -------------------------------------------------------------------------------------
create or replace function public.get_public_profile_extras(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_page public.request_pages%rowtype;
  v_on   boolean;
begin
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then
    raise exception 'Request page not found' using errcode = 'P0002';
  end if;
  select * into v_page from public.request_pages where slug = v_slug;
  if not found then
    raise exception 'Request page not found' using errcode = 'P0002';
  end if;
  v_on := v_page.enabled;

  return jsonb_build_object(
    'about', case when v_on then v_page.about end,
    'services', case when v_on then coalesce(to_jsonb(v_page.services), '[]'::jsonb) else '[]'::jsonb end,
    'service_area', case when v_on then v_page.service_area end,
    'license_line', case when v_on then v_page.license_line end,
    'years_line', case when v_on then v_page.years_line end,
    'gallery', coalesce((
      select jsonb_agg(jsonb_build_object('path', g.el->>'path', 'caption', g.el->>'caption') order by g.o)
      from jsonb_array_elements(case when v_on and jsonb_typeof(v_page.gallery) = 'array' then v_page.gallery else '[]'::jsonb end)
           with ordinality as g(el, o)
      where split_part(g.el->>'path', '/', 1) = v_page.user_id::text
        and g.el->>'path' ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$'), '[]'::jsonb),
    'testimonials', coalesce((
      select jsonb_agg(jsonb_build_object('rating', t.rating, 'name', t.name, 'text', t.body, 'date', t.day) order by t.at desc)
      from (
        select f.rating,
               coalesce(f.testimonial_name, public._feedback_display_name(f.client_name),
                        public._feedback_display_name(f.client_first_name), 'A client') as name,
               coalesce(f.testimonial_text, f.comment) as body,
               (f.submitted_at at time zone 'utc')::date as day,
               f.submitted_at as at
        from public.feedback_responses f
        where v_on
          and f.user_id = v_page.user_id
          and f.testimonial
          and not f.hidden
          and f.status = 'submitted'
          and f.rating is not null
        order by f.submitted_at desc
        limit 20
      ) t), '[]'::jsonb),
    'rating_average', (
      select round(avg(f.rating)::numeric, 1)
      from public.feedback_responses f
      where v_on and f.user_id = v_page.user_id and f.testimonial and not f.hidden and f.status = 'submitted' and f.rating is not null),
    'rating_count', (
      select count(*)
      from public.feedback_responses f
      where v_on and f.user_id = v_page.user_id and f.testimonial and not f.hidden and f.status = 'submitted' and f.rating is not null));
end;
$$;

-- -------------------------------------------------------------------------------------
-- F. Owner: profile fields of the request page (request_pages has no browser write grant)
-- -------------------------------------------------------------------------------------
create or replace function public.get_my_request_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_page public.request_pages%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform public.get_my_request_page();
  select * into v_page from public.request_pages where user_id = v_uid;
  return jsonb_build_object(
    'slug', v_page.slug,
    'about', v_page.about,
    'services', coalesce(to_jsonb(v_page.services), '[]'::jsonb),
    'service_area', v_page.service_area,
    'license_line', v_page.license_line,
    'years_line', v_page.years_line,
    'gallery', case when jsonb_typeof(v_page.gallery) = 'array' then v_page.gallery else '[]'::jsonb end);
end;
$$;

-- null = keep; '' (or an empty services list) = remove.
create or replace function public.update_request_profile(
  p_about text default null, p_services text[] default null, p_service_area text default null,
  p_license_line text default null, p_years_line text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_services text[];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform public.get_my_request_page();
  if p_services is not null then
    select coalesce(array_agg(d.s order by d.o), '{}'::text[]) into v_services
    from (
      select dd.s, dd.o
      from (
        select distinct on (lower(c.s)) c.s, c.o
        from (select public._clean_text(u.x, 60) as s, u.o from unnest(p_services) with ordinality as u(x, o)) c
        where c.s is not null
        order by lower(c.s), c.o
      ) dd
      order by dd.o
      limit 20
    ) d;
  end if;
  update public.request_pages
     set about = case when p_about is null then about else public._clean_multiline(p_about, 1500) end,
         services = case when p_services is null then services when cardinality(v_services) = 0 then null else v_services end,
         service_area = case when p_service_area is null then service_area else public._clean_text(p_service_area, 200) end,
         license_line = case when p_license_line is null then license_line else public._clean_text(p_license_line, 160) end,
         years_line = case when p_years_line is null then years_line else public._clean_text(p_years_line, 80) end
   where user_id = v_uid;
  return public.get_my_request_profile();
end;
$$;

-- Replaces the gallery ([{path, caption, photo_id}], at most 12). Each path is a public copy the app made in the
-- owner's portal-photos folder (never a job photo's own portal copy). Copies taken out are queued for deletion.
create or replace function public.set_request_profile_gallery(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_el    jsonb;
  v_path  text;
  v_pid   uuid;
  v_out   jsonb := '[]'::jsonb;
  v_old   jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid gallery' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 12 then
    raise exception 'The gallery holds up to 12 photos.' using errcode = '22023';
  end if;
  perform public.get_my_request_page();

  for v_el in select e.value from jsonb_array_elements(p_items) as e(value) loop
    v_path := v_el->>'path';
    if v_path is null
       or split_part(v_path, '/', 1) <> v_uid::text
       or v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$' then
      raise exception 'Invalid gallery photo' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_out) as o(el) where o.el->>'path' = v_path) then
      continue;
    end if;
    if exists (select 1 from public.job_photos p where p.user_id = v_uid and p.portal_path = v_path) then
      raise exception 'Invalid gallery photo' using errcode = '22023';
    end if;
    v_pid := public._try_uuid(v_el->>'photo_id');
    if v_pid is not null and not exists (select 1 from public.job_photos p where p.id = v_pid and p.user_id = v_uid) then
      v_pid := null;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'path', v_path, 'caption', public._clean_text(v_el->>'caption', 200), 'photo_id', v_pid));
  end loop;

  select r.gallery into v_old from public.request_pages r where r.user_id = v_uid for update;
  update public.request_pages
     set gallery = case when jsonb_array_length(v_out) = 0 then null else v_out end
   where user_id = v_uid;

  insert into public.storage_cleanup_queue (user_id, bucket, path)
  select v_uid, 'portal-photos', o.el->>'path'
  from jsonb_array_elements(case when jsonb_typeof(v_old) = 'array' then v_old else '[]'::jsonb end) as o(el)
  where split_part(coalesce(o.el->>'path', ''), '/', 1) = v_uid::text
    and not exists (select 1 from jsonb_array_elements(v_out) as n(el) where n.el->>'path' = o.el->>'path')
    and not exists (select 1 from public.job_photos p where p.portal_path = o.el->>'path');

  return public.get_my_request_profile();
end;
$$;

-- -------------------------------------------------------------------------------------
-- G. Function privileges (default-deny, explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public._feedback_display_name(text) from public, anon, authenticated;
revoke all on function public.guard_feedback_flow() from public, anon, authenticated;
revoke all on function public.guard_feedback_response() from public, anon, authenticated;
revoke all on function public.get_feedback_request(text) from public, anon, authenticated;
revoke all on function public.submit_feedback(text, integer, text, text) from public, anon, authenticated;
revoke all on function public.get_public_profile_extras(text) from public, anon, authenticated;
revoke all on function public.get_my_request_profile() from public, anon, authenticated;
revoke all on function public.update_request_profile(text, text[], text, text, text) from public, anon, authenticated;
revoke all on function public.set_request_profile_gallery(jsonb) from public, anon, authenticated;

-- public pages (no login)
grant execute on function public.get_feedback_request(text)                         to anon, authenticated;
grant execute on function public.submit_feedback(text, integer, text, text)         to anon, authenticated;
grant execute on function public.get_public_profile_extras(text)                    to anon, authenticated;
-- signed-in app
grant execute on function public.get_my_request_profile()                           to authenticated;
grant execute on function public.update_request_profile(text, text[], text, text, text) to authenticated;
grant execute on function public.set_request_profile_gallery(jsonb)                 to authenticated;

notify pgrst, 'reload schema';
