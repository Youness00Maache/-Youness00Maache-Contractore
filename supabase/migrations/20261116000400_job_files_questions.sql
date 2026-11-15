-- Applied: NOT YET (needs owner OK)
-- =====================================================================================
-- ContractorDocs: job files + project questions + submittals (competitor roadmap batch D3: #12, #20, #21, #22)
--
-- Everything lives INSIDE the job page (no new top-level area). Premium (owner rule: new advanced tools default to
-- Premium); the plan check runs on insert only, so a downgraded account keeps reading, sharing and closing what it has.
--
--   job_files       per-job files and links: category (plans, permits, contracts, specs, receipts, visuals, other),
--                   versions of the same document (version_group; "latest" = highest version), tags, notes, optional
--                   "shared in the client portal". Files are kept in the EXISTING private bucket `document-assets`
--                   (PDF + images, 15 MB, owner-folder policies from 20261112000300) under
--                   <user_id>/job-files/<job_id>/<random>-<name>.<ext>. No new bucket, no new storage policy.
--                   Sharing a file in the portal works like job photos: the browser copies an IMAGE file to the public
--                   `portal-photos` bucket (unguessable name, no listing) and stores portal_path. PDFs cannot be put in
--                   that bucket (images only), so a PDF can't be shared in the portal yet: share a link instead.
--                   Links (kind 'link': a 3D / render viewer, a Drive folder...) are shared as their URL.
--   job_questions   questions and submittals the contractor sends the client. The client answers a question, or
--                   approves / rejects a submittal (with a note), ONCE per send, from the portal link. History is
--                   append-only and written by the database (never by the browser).
--
-- Who writes what
--   * the contractor (browser, RLS owner-only) writes everything except the client's answer fields (answer,
--     answered_by, answered_at, decision), the history and the client statuses (answered / approved / rejected):
--     guard_job_question_flow() keeps those as they were on a browser write.
--   * the client writes only through answer_portal_question() (portal key; status sent -> answered / approved /
--     rejected, the answer fields and one history entry).
--
-- ADDITIVE ONLY: two new tables, their triggers, new functions. No existing table, column, row, function or policy is
-- changed (a trigger inserts rows into the existing storage_cleanup_queue, bucket 'portal-photos', like job photos).
-- Safe to run twice. Needs (applied in production): 20261112000100 (user_effective_tier, is_service_context),
-- 20261112000200 (_clean_text), 20261113000400 (_clean_multiline, storage_cleanup_queue, portal-photos),
-- 20261112000300 (document-assets bucket), _try_uuid.
--
-- Limits (keep in sync with lib/jobFiles/jobFileTypes.ts JOB_FILE_LIMITS and lib/questions/questionTypes.ts
-- QUESTION_LIMITS): 500 files + links per job, 15 MB per file, 5 GB of job files per Premium account (10 GB on
-- Premium + AI), 12 tags of 30 characters; 500 questions per job, 10 attachments each, 200 history entries.
--
-- Portal reads (anon, portal key; same client rule as get_portal_photos / get_portal_project_dashboard):
--   get_portal_questions(key, job?)  sent / answered / approved / rejected items of the client's jobs (never drafts or
--                                    closed ones), attachments as {kind,title,url,path} (path = public portal-photos
--                                    copy of a shared image file, else null: the portal shows the title only)
--   get_portal_job_files(key, job?)  the latest shared version of each shared link / image file (url or path only;
--                                    never notes, tags, storage paths or sizes)
-- Rate limiting: none, like punch_item_feedback_via_portal (a question can only be answered once per send).
--
-- Known gap (documented): deleting a job cascades to job_files rows; their document-assets files are not queued for
-- deletion (storage_cleanup_queue only accepts the photo buckets and must not be altered here). The app removes the
-- file itself when a single file is deleted (lib/jobFiles/jobFilesApi.ts deleteJobFile).
--
-- Rollback: drop function public.answer_portal_question(text, uuid, text, text, text),
--   public.get_portal_questions(text, uuid), public.get_portal_job_files(text, uuid),
--   public._portal_question_json(public.job_questions, text), public.guard_job_question(),
--   public.guard_job_question_flow(), public.guard_job_file(), public.enqueue_job_file_cleanup();
--   drop table public.job_questions, public.job_files;
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.job_files (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id            uuid not null references public.jobs(id) on delete cascade,
  kind              text not null default 'file' check (kind in ('file', 'link')),
  category          text not null default 'other'
                    check (category in ('plans', 'permits', 'contracts', 'specs', 'receipts', 'visuals', 'other')),
  title             text not null check (length(btrim(title)) between 1 and 200),
  notes             text check (notes is null or length(notes) <= 2000),
  tags              text[] not null default '{}'::text[] check (cardinality(tags) <= 12),
  -- kind 'file': private document-assets bucket
  storage_path      text check (storage_path is null
                                or storage_path ~ '^[0-9a-f-]{36}/job-files/[0-9a-f-]{36}/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(pdf|jpg|jpeg|png|webp|gif)$'),
  file_name         text check (file_name is null or length(file_name) <= 200),
  mime              text check (mime is null or mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes        integer check (size_bytes is null or size_bytes between 1 and 15728640),
  -- kind 'link'
  url               text check (url is null or (length(url) <= 2000 and url ~* '^https?://[^[:space:]]+$')),
  -- versions: rows sharing version_group are versions of one document; the database numbers them
  version           integer not null default 1 check (version between 1 and 1000),
  version_group     uuid not null default gen_random_uuid(),
  shared_in_portal  boolean not null default false,
  -- portal-photos bucket (public copy of a shared IMAGE file): <user_id>/<random>.<ext>, set while shared
  portal_path       text check (portal_path is null or portal_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint job_files_storage_path_key unique (storage_path),
  constraint job_files_kind_shape check (
    (kind = 'file' and storage_path is not null and url is null and mime is not null and size_bytes is not null)
    or (kind = 'link' and url is not null and storage_path is null and portal_path is null and size_bytes is null)),
  constraint job_files_shared_has_copy check (not shared_in_portal or kind = 'link' or portal_path is not null)
);
comment on table public.job_files is 'Per-job files (document-assets/<user>/job-files/<job>/) and links: category, versions, tags, portal sharing. See lib/jobFiles.';

create table if not exists public.job_questions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id            uuid not null references public.jobs(id) on delete cascade,
  kind              text not null default 'question' check (kind in ('question', 'submittal')),
  title             text not null check (length(btrim(title)) between 1 and 200),
  body              text check (body is null or length(body) <= 4000),
  due_date          date,
  status            text not null default 'draft'
                    check (status in ('draft', 'sent', 'answered', 'approved', 'rejected', 'closed')),
  -- [{file_id, title} | {url, title}] (normalized by guard_job_question)
  attachments       jsonb not null default '[]'::jsonb
                    check (case when jsonb_typeof(attachments) = 'array' then jsonb_array_length(attachments) <= 10 else false end),
  -- the client's answer (written only by answer_portal_question)
  answer            text check (answer is null or length(answer) <= 4000),
  answered_by       text check (answered_by is null or length(answered_by) <= 120),
  answered_at       timestamptz,
  decision          text check (decision is null or decision in ('approved', 'rejected')),
  -- append-only [{at, by: 'owner'|'client', action, note}] (written by the database)
  history           jsonb not null default '[]'::jsonb
                    check (case when jsonb_typeof(history) = 'array' then jsonb_array_length(history) <= 200 else false end),
  shared_in_portal  boolean not null default false,
  sent_at           timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint job_questions_decision_kind check (kind = 'submittal' or decision is null)
);
comment on table public.job_questions is 'Project questions and submittals sent to the client portal (answer / approve / reject once per send). See lib/questions.';

create index if not exists idx_job_files_user_job on public.job_files (user_id, job_id, created_at desc);
create index if not exists idx_job_files_job on public.job_files (job_id);
create index if not exists idx_job_files_group on public.job_files (version_group, version desc);
create index if not exists idx_job_files_shared on public.job_files (user_id, job_id) where shared_in_portal;
create index if not exists idx_job_questions_user_job on public.job_questions (user_id, job_id, created_at desc);
create index if not exists idx_job_questions_job on public.job_questions (job_id);
create index if not exists idx_job_questions_shared on public.job_questions (user_id, job_id) where shared_in_portal;

drop trigger if exists tr_job_files_updated_at on public.job_files;
create trigger tr_job_files_updated_at before update on public.job_files
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_job_questions_updated_at on public.job_questions;
create trigger tr_job_questions_updated_at before update on public.job_questions
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- B. Job files: write guard + public copy cleanup
-- -------------------------------------------------------------------------------------
-- Insert: same-owner job, Premium, 500 per job, storage path in <user>/job-files/<job>/, account storage cap, the
-- version number (max + 1 in the group; a group of another job / owner starts a new group). Sharing a file is a
-- separate step (the public copy is made first). Update: the file itself never changes (upload a new version).
create or replace function public.guard_job_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier    text;
  v_count   integer;
  v_used    bigint;
  v_total   bigint;
  v_prefix  text;
  v_version integer;
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id
       or new.kind is distinct from old.kind or new.storage_path is distinct from old.storage_path
       or new.mime is distinct from old.mime or new.size_bytes is distinct from old.size_bytes
       or new.version_group is distinct from old.version_group or new.version is distinct from old.version then
      raise exception 'A file cannot be replaced in place. Upload a new version instead.' using errcode = '22023';
    end if;
  else
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'job_files.job_id must belong to the same user';
    end if;
    if not public.is_service_context() then
      v_tier := public.user_effective_tier(new.user_id);
      if v_tier not in ('premium', 'ai') then
        raise exception 'PLAN_LIMIT: Job files and links are part of Premium.' using errcode = 'P0001', hint = 'job_files';
      end if;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('job-files:' || new.job_id::text, 0));
    select count(*) into v_count from public.job_files f where f.job_id = new.job_id;
    if v_count >= 500 then
      raise exception 'A job holds up to 500 files and links. Delete old versions you no longer need.' using errcode = 'P0001';
    end if;

    if new.kind = 'file' then
      v_prefix := new.user_id::text || '/job-files/' || new.job_id::text || '/';
      if left(coalesce(new.storage_path, ''), length(v_prefix)) <> v_prefix then
        raise exception 'Invalid file path' using errcode = '22023';
      end if;
      if v_tier is not null then
        v_total := case when v_tier = 'ai' then 10737418240 else 5368709120 end;
        perform pg_advisory_xact_lock(hashtextextended('job-files-bytes:' || new.user_id::text, 0));
        select coalesce(sum(f.size_bytes), 0) into v_used from public.job_files f where f.user_id = new.user_id;
        if v_used + coalesce(new.size_bytes, 0) > v_total then
          raise exception 'PLAN_LIMIT: Your job files use all % GB of file storage. Delete files you no longer need.', v_total / 1073741824
            using errcode = 'P0001', hint = 'job_files';
        end if;
      end if;
    end if;

    -- version number: the database decides
    select max(f.version) into v_version
    from public.job_files f
    where f.version_group = new.version_group and f.user_id = new.user_id and f.job_id = new.job_id;
    if v_version is null then
      if exists (select 1 from public.job_files f where f.version_group = new.version_group) then
        new.version_group := gen_random_uuid();
      end if;
      new.version := 1;
    else
      new.version := least(v_version + 1, 1000);
    end if;

    -- sharing a file is a separate step (the public copy is made first); a link can be shared right away
    if new.kind = 'file' then
      new.shared_in_portal := false;
      new.portal_path := null;
    else
      new.mime := null;
      new.file_name := null;
    end if;
  end if;

  -- a public copy: the owner's folder, image files only
  if new.portal_path is not null
     and (split_part(new.portal_path, '/', 1) <> new.user_id::text
          or new.kind <> 'file' or coalesce(new.mime, '') not in ('image/jpeg', 'image/png', 'image/webp')) then
    raise exception 'Only images can be shared in the client portal. Share a link for PDFs.' using errcode = '22023';
  end if;
  if not new.shared_in_portal then
    new.portal_path := null;
  end if;

  new.title := btrim(regexp_replace(new.title, '[[:cntrl:]]+', ' ', 'g'));
  new.notes := public._clean_multiline(new.notes, 2000);
  new.file_name := nullif(left(btrim(regexp_replace(coalesce(new.file_name, ''), '[[:cntrl:]/\\]+', ' ', 'g')), 200), '');
  new.url := nullif(btrim(coalesce(new.url, '')), '');
  -- tags: trimmed, lower case, 30 characters, no duplicates, at most 12 (first ones kept)
  new.tags := coalesce((
    select array_agg(x.t order by x.o)
    from (
      select c.t, min(u.o) as o
      from unnest(coalesce(new.tags, '{}'::text[])) with ordinality as u(raw, o)
      cross join lateral (select left(lower(btrim(regexp_replace(coalesce(u.raw, ''), '[[:cntrl:]]+', ' ', 'g'))), 30) as t) c
      where c.t <> ''
      group by c.t
      order by min(u.o)
      limit 12
    ) x), '{}'::text[]);
  return new;
end;
$$;

drop trigger if exists trg_job_files_guard on public.job_files;
create trigger trg_job_files_guard before insert or update on public.job_files
  for each row execute function public.guard_job_file();

-- The public portal copy is queued for deletion when a file is deleted or unshared (the app empties the queue,
-- components/requests/requestsApi.ts flushStorageCleanup). The private document-assets file is removed by the app.
create or replace function public.enqueue_job_file_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return null;
  end if;
  if old.portal_path is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    insert into public.storage_cleanup_queue (user_id, bucket, path) values (old.user_id, 'portal-photos', old.portal_path);
  elsif old.portal_path is distinct from new.portal_path then
    insert into public.storage_cleanup_queue (user_id, bucket, path) values (old.user_id, 'portal-photos', old.portal_path);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_job_files_cleanup on public.job_files;
-- (every update, not "update of portal_path": unsharing clears portal_path inside guard_job_file)
create trigger trg_job_files_cleanup after delete or update on public.job_files
  for each row execute function public.enqueue_job_file_cleanup();

-- -------------------------------------------------------------------------------------
-- C. Job questions: write guards
-- -------------------------------------------------------------------------------------
-- Same-owner job, Premium, 500 per job, attachments normalized ({file_id, title} of this job's files, or {url, title}
-- with an http(s) URL; at most 10).
create or replace function public.guard_job_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count   integer;
  v_el      jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_title   text;
  v_url     text;
  v_fid     uuid;
  v_ftitle  text;
  v_check   boolean := true;   -- normalize the attachments (insert, or changed on update)
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id then
      raise exception 'A question cannot move to another job' using errcode = '22023';
    end if;
    v_check := new.attachments is distinct from old.attachments;
  else
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'job_questions.job_id must belong to the same user';
    end if;
    if not public.is_service_context() and public.user_effective_tier(new.user_id) not in ('premium', 'ai') then
      raise exception 'PLAN_LIMIT: Client questions and submittals are part of Premium.' using errcode = 'P0001', hint = 'questions';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('job-questions:' || new.job_id::text, 0));
    select count(*) into v_count from public.job_questions q where q.job_id = new.job_id;
    if v_count >= 500 then
      raise exception 'A job holds up to 500 questions. Delete closed ones you no longer need.' using errcode = 'P0001';
    end if;
  end if;

  new.title := btrim(regexp_replace(new.title, '[[:cntrl:]]+', ' ', 'g'));
  new.body := public._clean_multiline(new.body, 4000);

  if v_check then
    if jsonb_typeof(new.attachments) is distinct from 'array' then
      new.attachments := '[]'::jsonb;
    end if;
    if jsonb_array_length(new.attachments) > 10 then
      raise exception 'Add up to 10 attachments.' using errcode = '22023';
    end if;
    for v_el in select a.value from jsonb_array_elements(new.attachments) as a(value) loop
      if jsonb_typeof(v_el) <> 'object' then
        raise exception 'Invalid attachment' using errcode = '22023';
      end if;
      v_title := public._clean_text(v_el->>'title', 200);
      if v_el ? 'file_id' then
        v_fid := public._try_uuid(v_el->>'file_id');
        select f.title into v_ftitle
        from public.job_files f
        where f.id = v_fid and f.user_id = new.user_id and f.job_id = new.job_id;
        if found then
          v_out := v_out || jsonb_build_array(jsonb_build_object('file_id', v_fid, 'title', coalesce(v_title, v_ftitle)));
        end if;
        -- a file of another job / owner (or deleted) is dropped
      else
        v_url := btrim(coalesce(v_el->>'url', ''));
        if length(v_url) > 2000 or v_url !~* '^https?://[^[:space:]]+$' then
          raise exception 'Attachment links must start with http:// or https://' using errcode = '22023';
        end if;
        v_out := v_out || jsonb_build_array(jsonb_build_object('url', v_url, 'title', coalesce(v_title, left(v_url, 200))));
      end if;
    end loop;
    new.attachments := v_out;
  end if;
  return new;
end;
$$;

-- Status machine, the client's fields and the history.
-- NOT security definer (like guard_punch_item): current_user is then the writer, so a save from the browser
-- ('authenticated') is told apart from answer_portal_question (which runs as its owner). It reads no table.
--   browser:  draft -> sent | closed;  sent -> closed;  answered | approved | rejected -> sent (ask again) | closed;
--             closed -> sent (reopen) | draft (only if never sent). Insert as draft or sent.
--             The answer fields and the history stay as they were; the database appends the owner's entries.
--   portal function / service: trusted (answer_portal_question appends the client's entry itself).
create or replace function public.guard_job_question_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_browser     boolean := current_user in ('authenticated', 'anon');
  v_old_status  text;
  v_old_closed  timestamptz;
  v_action      text;
begin
  if tg_op = 'INSERT' then
    if v_browser then
      if new.status not in ('draft', 'sent') then
        raise exception 'A new question starts as a draft or is sent' using errcode = '22023';
      end if;
      new.answer := null;
      new.answered_by := null;
      new.answered_at := null;
      new.decision := null;
      new.history := '[]'::jsonb;
    end if;
    if jsonb_typeof(new.history) is distinct from 'array' then
      new.history := '[]'::jsonb;
    end if;
    new.history := new.history || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'owner', 'action', 'created', 'note', null));
    if new.status = 'sent' then
      new.history := new.history || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'owner', 'action', 'sent', 'note', null));
      new.sent_at := now();
    else
      new.sent_at := null;
    end if;
  else
    v_old_status := old.status;
    v_old_closed := old.closed_at;
    if v_browser then
      -- the client's answer and the history belong to the database
      new.answer := old.answer;
      new.answered_by := old.answered_by;
      new.answered_at := old.answered_at;
      new.decision := old.decision;
      new.history := old.history;
      new.sent_at := old.sent_at;
      if new.kind is distinct from old.kind and old.status <> 'draft' then
        raise exception 'A sent question cannot change type' using errcode = '22023';
      end if;
      if new.status is distinct from old.status then
        if not (
             (old.status = 'draft' and new.status in ('sent', 'closed'))
          or (old.status = 'sent' and new.status = 'closed')
          or (old.status in ('answered', 'approved', 'rejected') and new.status in ('sent', 'closed'))
          or (old.status = 'closed' and (new.status = 'sent' or (new.status = 'draft' and old.sent_at is null)))) then
          raise exception 'This change of status is not allowed' using errcode = '22023';
        end if;
        v_action := case
          when new.status = 'sent' and old.status = 'draft' then 'sent'
          when new.status = 'sent' then 'reopened'
          else new.status end;
        if new.status = 'sent' then
          -- asking again: the previous answer stays in the history only
          new.answer := null;
          new.answered_by := null;
          new.answered_at := null;
          new.decision := null;
          new.sent_at := now();
        end if;
        new.history := new.history || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'owner', 'action', v_action, 'note', null));
      elsif old.status <> 'draft'
            and (new.title is distinct from old.title or new.body is distinct from old.body
                 or new.attachments is distinct from old.attachments or new.due_date is distinct from old.due_date) then
        new.history := new.history || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'owner', 'action', 'edited', 'note', null));
      end if;
    end if;
  end if;

  -- answers match the kind
  if new.kind = 'question' then
    new.decision := null;
  elsif new.status in ('approved', 'rejected') then
    new.decision := new.status;
  end if;
  new.answered_by := nullif(left(btrim(coalesce(new.answered_by, '')), 120), '');
  -- derived: visible in the portal once sent (the portal reads only sent / answered / approved / rejected)
  new.shared_in_portal := new.status <> 'draft';
  new.closed_at := case when new.status = 'closed' then coalesce(case when v_old_status = 'closed' then v_old_closed end, now()) end;
  -- keep the newest 200 history entries
  if jsonb_array_length(new.history) > 200 then
    new.history := (select jsonb_agg(h.value order by h.o)
                    from jsonb_array_elements(new.history) with ordinality as h(value, o)
                    where h.o > jsonb_array_length(new.history) - 200);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_questions_flow on public.job_questions;
create trigger trg_job_questions_flow before insert or update on public.job_questions
  for each row execute function public.guard_job_question_flow();
drop trigger if exists trg_job_questions_guard on public.job_questions;
create trigger trg_job_questions_guard before insert or update on public.job_questions
  for each row execute function public.guard_job_question();

-- -------------------------------------------------------------------------------------
-- D. Row level security + table privileges (owner full access to own rows)
-- -------------------------------------------------------------------------------------
alter table public.job_files enable row level security;
alter table public.job_questions enable row level security;

drop policy if exists job_files_select_own on public.job_files;
drop policy if exists job_files_insert_own on public.job_files;
drop policy if exists job_files_update_own on public.job_files;
drop policy if exists job_files_delete_own on public.job_files;
create policy job_files_select_own on public.job_files for select to authenticated
  using (user_id = (select auth.uid()));
create policy job_files_insert_own on public.job_files for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy job_files_update_own on public.job_files for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy job_files_delete_own on public.job_files for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists job_questions_select_own on public.job_questions;
drop policy if exists job_questions_insert_own on public.job_questions;
drop policy if exists job_questions_update_own on public.job_questions;
drop policy if exists job_questions_delete_own on public.job_questions;
create policy job_questions_select_own on public.job_questions for select to authenticated
  using (user_id = (select auth.uid()));
create policy job_questions_insert_own on public.job_questions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy job_questions_update_own on public.job_questions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy job_questions_delete_own on public.job_questions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.job_files, public.job_questions from anon;
revoke truncate on public.job_files, public.job_questions from authenticated;
grant select, insert, update, delete on public.job_files, public.job_questions to authenticated;
grant all on public.job_files, public.job_questions to service_role;

-- -------------------------------------------------------------------------------------
-- E. Client portal (anon, portal key)
--    A job is the client's when it belongs to the client's contractor and jobs.client_id = the client, or (no
--    client_id) the job's client name matches the client's (trimmed, case-insensitive, never an empty name).
--    A p_job_id that is not one of the client's jobs raises the SAME 'Invalid portal link'.
-- -------------------------------------------------------------------------------------

-- One question as the portal sees it (never user_id, notes, storage paths, drafts' history...). Internal helper:
-- not executable by anon / authenticated.
create or replace function public._portal_question_json(p_q public.job_questions, p_job_name text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_q.id,
    'job_id', p_q.job_id,
    'job_name', p_job_name,
    'kind', p_q.kind,
    'title', p_q.title,
    'body', p_q.body,
    'due_date', p_q.due_date,
    'status', p_q.status,
    'decision', p_q.decision,
    'answer', p_q.answer,
    'answered_by', p_q.answered_by,
    'answered_at', p_q.answered_at,
    'sent_at', p_q.sent_at,
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', case when a.el ? 'url' or f.kind = 'link' then 'link' else 'file' end,
               'title', coalesce(a.el->>'title', f.title),
               'url', coalesce(a.el->>'url', case when f.kind = 'link' then f.url end),
               'path', f.portal_path)
             order by a.o)
      from jsonb_array_elements(p_q.attachments) with ordinality as a(el, o)
      left join public.job_files f
        on a.el ? 'file_id' and f.id = public._try_uuid(a.el->>'file_id') and f.user_id = p_q.user_id and f.job_id = p_q.job_id
      where a.el ? 'url' or f.id is not null), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', h.el->'at', 'by', h.el->'by', 'action', h.el->'action', 'note', h.el->'note')
             order by h.o)
      from jsonb_array_elements(p_q.history) with ordinality as h(el, o)
      where h.el->>'action' in ('sent', 'reopened', 'answered', 'approved', 'rejected', 'closed')), '[]'::jsonb));
$$;

create or replace function public.get_portal_questions(p_key text, p_job_id uuid default null)
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
  if p_job_id is not null and not exists (
       select 1 from public.jobs j
       where j.id = p_job_id
         and j.user_id = v_client.user_id
         and (j.client_id = v_client.id
              or (j.client_id is null
                  and btrim(coalesce(v_client.name, '')) <> ''
                  and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))) then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(public._portal_question_json(x.q, x.job_name)
                     order by (x.q).status <> 'sent', (x.q).due_date nulls last, (x.q).sent_at desc)
    from (
      select q as q, j.name as job_name
      from public.job_questions q
      join public.jobs j on j.id = q.job_id and j.user_id = q.user_id
      where q.user_id = v_client.user_id
        and q.shared_in_portal
        and q.status in ('sent', 'answered', 'approved', 'rejected')
        and (p_job_id is null or q.job_id = p_job_id)
        and (j.client_id = v_client.id
             or (j.client_id is null
                 and btrim(coalesce(v_client.name, '')) <> ''
                 and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
      order by q.sent_at desc nulls last
      limit 200
    ) x), '[]'::jsonb);
end;
$$;

-- The client answers a question (p_decision null or 'answered', an answer is required) or approves / rejects a
-- submittal (p_decision 'approved' | 'rejected'; a note is required to reject). Once per send: an item that is not
-- 'sent' any more raises 'ALREADY_ANSWERED: ...'. Returns the updated item (same shape as get_portal_questions).
create or replace function public.answer_portal_question(
  p_key text, p_question_id uuid, p_decision text default null, p_answer text default null, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client   public.clients%rowtype;
  v_q        public.job_questions%rowtype;
  v_job_name text;
  v_answer   text := public._clean_multiline(p_answer, 4000);
  v_name     text := public._clean_text(p_name, 120);
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_status   text;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{32,128}$' or p_question_id is null then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;
  select * into v_client from public.clients where portal_key = p_key;
  if not found then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;

  select q.* into v_q
  from public.job_questions q
  join public.jobs j on j.id = q.job_id and j.user_id = q.user_id
  where q.id = p_question_id
    and q.user_id = v_client.user_id
    and q.shared_in_portal
    and q.status in ('sent', 'answered', 'approved', 'rejected')
    and (j.client_id = v_client.id
         or (j.client_id is null
             and btrim(coalesce(v_client.name, '')) <> ''
             and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
  for update of q;
  if not found then
    raise exception 'This question is not available any more' using errcode = 'P0002';
  end if;
  if v_q.status <> 'sent' then
    raise exception 'ALREADY_ANSWERED: This was already answered.' using errcode = 'P0001', hint = 'already_answered';
  end if;

  if v_q.kind = 'question' then
    if v_decision not in ('', 'answered') then
      raise exception 'Invalid answer' using errcode = '22023';
    end if;
    if v_answer is null then
      raise exception 'Please write your answer.' using errcode = '22023';
    end if;
    v_status := 'answered';
  else
    if v_decision not in ('approved', 'rejected') then
      raise exception 'Please approve or reject.' using errcode = '22023';
    end if;
    if v_decision = 'rejected' and v_answer is null then
      raise exception 'Please say what needs to change.' using errcode = '22023';
    end if;
    v_status := v_decision;
  end if;

  update public.job_questions
     set status = v_status,
         decision = case when v_q.kind = 'submittal' then v_status end,
         answer = v_answer,
         answered_by = v_name,
         answered_at = now(),
         history = history || jsonb_build_array(jsonb_build_object(
                     'at', now(), 'by', 'client', 'action', v_status, 'note', left(v_answer, 1000)))
   where id = v_q.id
  returning * into v_q;

  select j.name into v_job_name from public.jobs j where j.id = v_q.job_id;
  return public._portal_question_json(v_q, v_job_name);
end;
$$;

-- Shared files and links of the client's jobs: the latest shared version of each document. Links come with their
-- url; files only when they have a public copy (shared images), with its portal-photos path.
create or replace function public.get_portal_job_files(p_key text, p_job_id uuid default null)
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
  if p_job_id is not null and not exists (
       select 1 from public.jobs j
       where j.id = p_job_id
         and j.user_id = v_client.user_id
         and (j.client_id = v_client.id
              or (j.client_id is null
                  and btrim(coalesce(v_client.name, '')) <> ''
                  and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))) then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'job_id', x.job_id, 'job_name', x.job_name, 'kind', x.kind, 'category', x.category,
             'title', x.title, 'version', x.version, 'url', x.url, 'path', x.path, 'mime', x.mime)
           order by x.job_name, x.category, x.title)
    from (
      select distinct on (f.version_group)
             f.id, f.job_id, j.name as job_name, f.kind, f.category, f.title, f.version,
             case when f.kind = 'link' then f.url end as url,
             case when f.kind = 'file' then f.portal_path end as path,
             case when f.kind = 'file' then f.mime end as mime
      from public.job_files f
      join public.jobs j on j.id = f.job_id and j.user_id = f.user_id
      where f.user_id = v_client.user_id
        and f.shared_in_portal
        and (f.kind = 'link' or f.portal_path is not null)
        and (p_job_id is null or f.job_id = p_job_id)
        and (j.client_id = v_client.id
             or (j.client_id is null
                 and btrim(coalesce(v_client.name, '')) <> ''
                 and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
      order by f.version_group, f.version desc
      limit 300
    ) x), '[]'::jsonb);
end;
$$;

-- -------------------------------------------------------------------------------------
-- F. Function privileges (default-deny, explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public.guard_job_file() from public, anon, authenticated;
revoke all on function public.enqueue_job_file_cleanup() from public, anon, authenticated;
revoke all on function public.guard_job_question() from public, anon, authenticated;
revoke all on function public.guard_job_question_flow() from public, anon, authenticated;
revoke all on function public._portal_question_json(public.job_questions, text) from public, anon, authenticated;
revoke all on function public.get_portal_questions(text, uuid) from public, anon, authenticated;
revoke all on function public.answer_portal_question(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.get_portal_job_files(text, uuid) from public, anon, authenticated;

grant execute on function public.get_portal_questions(text, uuid)                       to anon, authenticated;
grant execute on function public.answer_portal_question(text, uuid, text, text, text)   to anon, authenticated;
grant execute on function public.get_portal_job_files(text, uuid)                       to anon, authenticated;

notify pgrst, 'reload schema';
