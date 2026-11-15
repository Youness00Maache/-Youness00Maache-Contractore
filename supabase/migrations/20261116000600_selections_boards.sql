-- Applied 2026-11-15 with the owner's OK ("Yes, approve all", roadmap D5) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: RLS on both tables, 8 owner policies, 4 triggers, no anon table grants, anon can run only get_portal_selections / choose_portal_selection / get_portal_boards, a bad portal key is refused by all three.. Roadmap D5 phase A; do not run until the owner approves it.
-- =====================================================================================
-- ContractorDocs: client selections + mood boards (competitor roadmap batch D5: #14, #15)
--
-- Everything lives INSIDE the job page (no new top-level area). Premium (owner rule: new advanced tools default to
-- Premium); the plan check runs on insert only, so a downgraded account keeps reading, sending and closing what it has.
--
--   job_selections  choices the CLIENT makes for a job (tile, paint colour, fixtures...). The contractor writes 1-6
--                   options (name, description, image, product link, SKU, supplier, quantity, price to the client,
--                   own cost), an optional allowance and a due date, and sends it; the client picks ONE option (+ a
--                   comment) from the portal link, ONCE per send; the contractor approves it (or asks for changes /
--                   asks again). An approved selection can become a Draft purchase order (po_document_id) and feeds
--                   the job budget (allowance vs the chosen option's price: an upgrade or a credit for the client).
--   job_boards      mood boards of a job: inspiration items (images, links, notes, colours), optionally shared
--                   read-only in the client portal.
--
-- Images: the EXISTING private bucket `document-assets` (images + PDF, 15 MB, owner-folder policies from
-- 20261112000300) under <user_id>/selections/<job_id>/<random>-<name>.<ext> and <user_id>/boards/<job_id>/...; what the
-- client sees is a copy in the public `portal-photos` bucket (<user_id>/<random>.<jpg|png|webp>, unguessable name, no
-- listing) made by the browser, exactly like D3 job files. No new bucket, no new storage policy.
--
-- Who writes what
--   * the contractor (browser, RLS owner-only) writes everything except the client's fields (chosen_option_id,
--     client_comment, chosen_by, chosen_at), the history and the timestamps sent_at / approved_at / ordered_at /
--     closed_at: guard_job_selection_flow() keeps those as they were on a browser write and derives them itself.
--   * the client writes only through choose_portal_selection() (portal key; status sent -> chosen, the client's
--     fields and one history entry).
--
-- Status machine (lib/selections/selectionLogic.ts OWNER_TRANSITIONS mirrors it):
--   browser: insert as draft or sent.  draft -> sent | closed;  sent -> draft (withdraw) | closed;
--            chosen -> approved | changes_requested | sent (ask again) | closed;
--            changes_requested -> sent (send the new options) | closed;  approved -> ordered | changes_requested | closed;
--            ordered -> approved (the order was cancelled) | closed;  closed -> sent (reopen) | draft (only if never sent).
--            Going back to 'sent' clears the client's choice (it stays in the history).
--   client (choose_portal_selection): sent -> chosen.
--   Options are locked while a choice stands (chosen / approved / ordered): only their images may change.
--
-- ADDITIVE ONLY: two new tables, their triggers, new functions. No existing table, column, row, function or policy is
-- changed (a trigger inserts rows into the existing storage_cleanup_queue, bucket 'portal-photos', like D3).
-- get_portal_project_dashboard is NOT changed: the portal calls the new functions separately.
-- Safe to run twice. Needs (applied in production): 20261112000100 (user_effective_tier, is_service_context),
-- 20261112000200 (_clean_text, _try_uuid), 20261113000400 (_clean_multiline, storage_cleanup_queue, portal-photos),
-- 20261112000300 (document-assets bucket), 20261116000200 (public.suppliers: an option's supplier_id).
--
-- Limits (keep in sync with lib/selections/selectionTypes.ts SELECTION_LIMITS and lib/boards/boardTypes.ts
-- BOARD_LIMITS): 300 selections per job, 6 options each, prices 0..99,999,999, quantity up to 1,000,000,
-- 200 history entries; 50 boards per job, 60 items each.
--
-- Portal (anon, portal key; same client rule as get_portal_questions / get_portal_job_files):
--   get_portal_selections(key, job?)        sent / chosen / approved / changes_requested / ordered selections of the
--                                           client's jobs (never drafts or closed ones). Options as the client sees
--                                           them: name, description, image (public copy path), link, unit, quantity,
--                                           unit price, total and the difference to the allowance. Never the cost,
--                                           SKU, supplier, private image path, purchase order or the owner's history.
--   choose_portal_selection(key, id, option, comment, name)   once per send (sent -> chosen)
--   get_portal_boards(key, job?)            shared boards: title + items (title, caption, link, image copy, colour)
-- Rate limiting: none, like answer_portal_question (a selection can only be chosen once per send).
--
-- Known gap (documented, same as D3): deleting a job cascades to these rows; their document-assets images are not
-- queued for deletion (storage_cleanup_queue only accepts the photo buckets and must not be altered here). The app
-- removes the private images itself when a selection / board / item is deleted (lib/selections/selectionsApi.ts,
-- lib/boards/boardsApi.ts). Public portal copies ARE queued by the database.
--
-- Rollback: drop function public.choose_portal_selection(text, uuid, text, text, text),
--   public.get_portal_selections(text, uuid), public.get_portal_boards(text, uuid),
--   public._portal_selection_json(public.job_selections, text), public.guard_job_selection(),
--   public.guard_job_selection_flow(), public.guard_job_board(), public.enqueue_selection_board_cleanup(),
--   public._selection_number(jsonb);
--   drop table public.job_selections, public.job_boards;
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.job_selections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id            uuid not null references public.jobs(id) on delete cascade,
  title             text not null check (length(btrim(title)) between 1 and 200),
  category          text check (category is null or length(category) <= 60),
  room              text check (room is null or length(room) <= 80),
  body              text check (body is null or length(body) <= 4000),
  due_date          date,
  -- what the contract includes for this choice (price to the client); null = no allowance
  allowance         numeric(12, 2) check (allowance is null or allowance between 0 and 99999999),
  -- [{id, name, description, image_path, portal_path, url, sku, supplier_id, unit, qty, unit_price, unit_cost}]
  -- (normalized by guard_job_selection; at most 6)
  options           jsonb not null default '[]'::jsonb
                    check (case when jsonb_typeof(options) = 'array' then jsonb_array_length(options) <= 6 else false end),
  status            text not null default 'draft'
                    check (status in ('draft', 'sent', 'chosen', 'approved', 'changes_requested', 'ordered', 'closed')),
  -- the client's choice (written only by choose_portal_selection)
  chosen_option_id  text check (chosen_option_id is null or length(chosen_option_id) <= 40),
  client_comment    text check (client_comment is null or length(client_comment) <= 2000),
  chosen_by         text check (chosen_by is null or length(chosen_by) <= 120),
  chosen_at         timestamptz,
  -- append-only [{at, by: 'owner'|'client', action, note}] (written by the database)
  history           jsonb not null default '[]'::jsonb
                    check (case when jsonb_typeof(history) = 'array' then jsonb_array_length(history) <= 200 else false end),
  -- the Draft purchase order made from the approved choice
  po_document_id    uuid references public.documents(id) on delete set null,
  sent_at           timestamptz,
  approved_at       timestamptz,
  ordered_at        timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.job_selections is 'Client selections of a job (options, allowance, the client picks one in the portal, approve, purchase order). See lib/selections.';

create table if not exists public.job_boards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id            uuid not null references public.jobs(id) on delete cascade,
  title             text not null check (length(btrim(title)) between 1 and 120),
  -- the contractor's own notes (never shown in the portal)
  notes             text check (notes is null or length(notes) <= 2000),
  -- [{id, kind: 'image'|'link'|'note'|'color', title, caption, url, image_path, portal_path, color}]
  -- (normalized by guard_job_board; at most 60)
  items             jsonb not null default '[]'::jsonb
                    check (case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) <= 60 else false end),
  shared_in_portal  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.job_boards is 'Mood boards of a job (images, links, notes, colours), optionally shared read-only in the client portal. See lib/boards.';

create index if not exists idx_job_selections_user_job on public.job_selections (user_id, job_id, created_at desc);
create index if not exists idx_job_selections_job on public.job_selections (job_id);
create index if not exists idx_job_selections_portal on public.job_selections (user_id, job_id)
  where status in ('sent', 'chosen', 'approved', 'changes_requested', 'ordered');
create index if not exists idx_job_selections_po on public.job_selections (po_document_id) where po_document_id is not null;
create index if not exists idx_job_boards_user_job on public.job_boards (user_id, job_id, created_at desc);
create index if not exists idx_job_boards_job on public.job_boards (job_id);
create index if not exists idx_job_boards_shared on public.job_boards (user_id, job_id) where shared_in_portal;

drop trigger if exists tr_job_selections_updated_at on public.job_selections;
create trigger tr_job_selections_updated_at before update on public.job_selections
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_job_boards_updated_at on public.job_boards;
create trigger tr_job_boards_updated_at before update on public.job_boards
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- B. Helpers
-- -------------------------------------------------------------------------------------
-- A json number or numeric string as numeric (null when missing or not a plain number). Internal helper.
create or replace function public._selection_number(p_value jsonb)
returns numeric
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric
    when jsonb_typeof(p_value) = 'string' and btrim(p_value #>> '{}') ~ '^[0-9]{1,9}(\.[0-9]{1,6})?$'
      then btrim(p_value #>> '{}')::numeric
    else null
  end;
$$;

-- -------------------------------------------------------------------------------------
-- C. Selections: write guards
-- -------------------------------------------------------------------------------------
-- Same-owner job, Premium (insert), 300 per job, the options normalized (1-6 on send; names; https links; prices
-- 0..99,999,999; quantity > 0; images in the owner's folder; a supplier of the same owner), a purchase order of the
-- same owner, options locked while a choice stands (only their images may change).
create or replace function public.guard_job_selection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count     integer;
  v_el        jsonb;
  v_out       jsonb := '[]'::jsonb;
  v_ids       text[] := '{}'::text[];
  v_id        text;
  v_name      text;
  v_url       text;
  v_img       text;
  v_portal    text;
  v_sup       uuid;
  v_qty       numeric;
  v_price     numeric;
  v_cost      numeric;
  v_prefix    text;
  v_check     boolean := true;
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id then
      raise exception 'A selection cannot move to another job' using errcode = '22023';
    end if;
    v_check := new.options is distinct from old.options;
  else
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'job_selections.job_id must belong to the same user';
    end if;
    if not public.is_service_context() and public.user_effective_tier(new.user_id) not in ('premium', 'ai') then
      raise exception 'PLAN_LIMIT: Client selections are part of Premium.' using errcode = 'P0001', hint = 'selections';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('job-selections:' || new.job_id::text, 0));
    select count(*) into v_count from public.job_selections s where s.job_id = new.job_id;
    if v_count >= 300 then
      raise exception 'A job holds up to 300 selections. Delete closed ones you no longer need.' using errcode = 'P0001';
    end if;
  end if;

  new.title := btrim(regexp_replace(new.title, '[[:cntrl:]]+', ' ', 'g'));
  new.category := public._clean_text(new.category, 60);
  new.room := public._clean_text(new.room, 80);
  new.body := public._clean_multiline(new.body, 4000);
  if new.allowance is not null then
    new.allowance := round(new.allowance, 2);
  end if;

  if v_check then
    if jsonb_typeof(new.options) is distinct from 'array' then
      new.options := '[]'::jsonb;
    end if;
    if jsonb_array_length(new.options) > 6 then
      raise exception 'A selection has up to 6 options.' using errcode = '22023';
    end if;
    v_prefix := new.user_id::text || '/selections/' || new.job_id::text || '/';
    for v_el in select o.value from jsonb_array_elements(new.options) as o(value) loop
      if jsonb_typeof(v_el) <> 'object' then
        raise exception 'Invalid option' using errcode = '22023';
      end if;
      v_id := btrim(coalesce(v_el->>'id', ''));
      if v_id = '' then
        v_id := gen_random_uuid()::text;
      elsif v_id !~ '^[A-Za-z0-9_-]{6,40}$' then
        raise exception 'Invalid option id' using errcode = '22023';
      end if;
      if v_id = any(v_ids) then
        raise exception 'Two options have the same id' using errcode = '22023';
      end if;
      v_ids := v_ids || v_id;
      v_name := public._clean_text(v_el->>'name', 200);
      if v_name is null then
        raise exception 'Give every option a name.' using errcode = '22023';
      end if;
      v_url := nullif(btrim(coalesce(v_el->>'url', '')), '');
      if v_url is not null and (length(v_url) > 2000 or v_url !~* '^https://[^[:space:]]+$') then
        raise exception 'Product links must start with https://' using errcode = '22023';
      end if;
      v_img := nullif(btrim(coalesce(v_el->>'image_path', '')), '');
      if v_img is not null and (left(v_img, length(v_prefix)) <> v_prefix
           or v_img !~ '^[0-9a-f-]{36}/selections/[0-9a-f-]{36}/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$') then
        raise exception 'Invalid image path' using errcode = '22023';
      end if;
      v_portal := nullif(btrim(coalesce(v_el->>'portal_path', '')), '');
      if v_portal is not null and (split_part(v_portal, '/', 1) <> new.user_id::text
           or v_portal !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$') then
        raise exception 'Invalid portal image path' using errcode = '22023';
      end if;
      if v_img is null then
        v_portal := null;
      end if;
      v_sup := public._try_uuid(v_el->>'supplier_id');
      if v_sup is not null and not exists (select 1 from public.suppliers s where s.id = v_sup and s.user_id = new.user_id) then
        v_sup := null;   -- a supplier of another owner (or deleted) is dropped
      end if;
      v_qty := coalesce(public._selection_number(v_el->'qty'), 1);
      v_price := coalesce(public._selection_number(v_el->'unit_price'), 0);
      v_cost := public._selection_number(v_el->'unit_cost');
      if v_qty <= 0 or v_qty > 1000000 then
        raise exception 'Check the quantity of "%".', v_name using errcode = '22023';
      end if;
      if v_price < 0 or v_price > 99999999 or coalesce(v_cost, 0) < 0 or coalesce(v_cost, 0) > 99999999 then
        raise exception 'Check the price of "%".', v_name using errcode = '22023';
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'name', v_name,
        'description', public._clean_multiline(v_el->>'description', 2000),
        'image_path', v_img,
        'portal_path', v_portal,
        'url', v_url,
        'sku', public._clean_text(v_el->>'sku', 80),
        'supplier_id', v_sup,
        'unit', public._clean_text(v_el->>'unit', 40),
        'qty', round(v_qty, 3),
        'unit_price', round(v_price, 2),
        'unit_cost', round(v_cost, 2)));
    end loop;
    new.options := v_out;

    -- a standing choice locks the options (only their images may change)
    if tg_op = 'UPDATE' and old.chosen_option_id is not null and new.status in ('chosen', 'approved', 'ordered')
       and (select coalesce(jsonb_agg(o.value - 'image_path' - 'portal_path' order by o.ord), '[]'::jsonb)
            from jsonb_array_elements(new.options) with ordinality as o(value, ord))
           is distinct from
           (select coalesce(jsonb_agg(o.value - 'image_path' - 'portal_path' order by o.ord), '[]'::jsonb)
            from jsonb_array_elements(old.options) with ordinality as o(value, ord)) then
      raise exception 'The client already chose. Ask for changes or ask again before you change the options.' using errcode = '22023';
    end if;
  end if;

  if new.status <> 'draft' and new.status <> 'closed' and jsonb_array_length(new.options) = 0 then
    raise exception 'Add at least one option before you send it.' using errcode = '22023';
  end if;

  if new.po_document_id is not null and (tg_op = 'INSERT' or new.po_document_id is distinct from old.po_document_id)
     and not exists (select 1 from public.documents d where d.id = new.po_document_id and d.user_id = new.user_id) then
    raise exception 'Purchase order not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

-- Status machine, the client's fields, the timestamps and the history.
-- NOT security definer (like guard_job_question_flow): current_user is then the writer, so a save from the browser
-- ('authenticated') is told apart from choose_portal_selection (which runs as its owner). It reads no table.
create or replace function public.guard_job_selection_flow()
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
        raise exception 'A new selection starts as a draft or is sent' using errcode = '22023';
      end if;
      new.chosen_option_id := null;
      new.client_comment := null;
      new.chosen_by := null;
      new.chosen_at := null;
      new.history := '[]'::jsonb;
      new.po_document_id := null;
      new.approved_at := null;
      new.ordered_at := null;
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
      -- the client's choice, the history and the timestamps belong to the database
      new.chosen_option_id := old.chosen_option_id;
      new.client_comment := old.client_comment;
      new.chosen_by := old.chosen_by;
      new.chosen_at := old.chosen_at;
      new.history := old.history;
      new.sent_at := old.sent_at;
      new.approved_at := old.approved_at;
      new.ordered_at := old.ordered_at;
      if new.status is distinct from old.status then
        if not (
             (old.status = 'draft' and new.status in ('sent', 'closed'))
          or (old.status = 'sent' and new.status in ('draft', 'closed'))
          or (old.status = 'chosen' and new.status in ('approved', 'changes_requested', 'sent', 'closed'))
          or (old.status = 'changes_requested' and new.status in ('sent', 'closed'))
          or (old.status = 'approved' and new.status in ('ordered', 'changes_requested', 'closed'))
          or (old.status = 'ordered' and new.status in ('approved', 'closed'))
          or (old.status = 'closed' and (new.status = 'sent' or (new.status = 'draft' and old.sent_at is null)))) then
          raise exception 'This change of status is not allowed' using errcode = '22023';
        end if;
        v_action := case
          when new.status = 'sent' and old.status = 'draft' then 'sent'
          when new.status = 'sent' then 'reopened'
          when new.status = 'draft' and old.status = 'sent' then 'withdrawn'
          when new.status = 'approved' and old.status = 'ordered' then 'order_cancelled'
          else new.status end;
        if new.status = 'sent' then
          -- asking again: the previous choice stays in the history only
          new.chosen_option_id := null;
          new.client_comment := null;
          new.chosen_by := null;
          new.chosen_at := null;
          new.approved_at := null;
          new.ordered_at := null;
          new.po_document_id := null;
          new.sent_at := now();
        elsif new.status = 'approved' and old.status = 'chosen' then
          new.approved_at := now();
        elsif new.status = 'ordered' then
          new.ordered_at := now();
        elsif new.status = 'approved' and old.status = 'ordered' then
          new.ordered_at := null;
          new.po_document_id := null;
        elsif new.status = 'changes_requested' then
          new.approved_at := null;
          new.ordered_at := null;
          new.po_document_id := null;
        end if;
        new.history := new.history || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'owner', 'action', v_action, 'note', null));
      elsif old.status <> 'draft'
            and (new.title is distinct from old.title or new.body is distinct from old.body
                 or new.options is distinct from old.options or new.due_date is distinct from old.due_date
                 or new.allowance is distinct from old.allowance) then
        new.history := new.history || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'owner', 'action', 'edited', 'note', null));
      end if;
      -- a purchase order is linked only once approved (the "ordered" step)
      if new.status not in ('approved', 'ordered', 'closed') then
        new.po_document_id := null;
      end if;
    end if;
  end if;

  new.chosen_by := nullif(left(btrim(coalesce(new.chosen_by, '')), 120), '');
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

drop trigger if exists trg_job_selections_flow on public.job_selections;
create trigger trg_job_selections_flow before insert or update on public.job_selections
  for each row execute function public.guard_job_selection_flow();
drop trigger if exists trg_job_selections_guard on public.job_selections;
create trigger trg_job_selections_guard before insert or update on public.job_selections
  for each row execute function public.guard_job_selection();

-- -------------------------------------------------------------------------------------
-- D. Boards: write guard
-- -------------------------------------------------------------------------------------
-- Same-owner job, Premium (insert), 50 per job, items normalized (kinds, https links, #rrggbb colours, images in the
-- owner's folder, at most 60). Unsharing a board drops its public image copies (queued for deletion).
create or replace function public.guard_job_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count   integer;
  v_el      jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_ids     text[] := '{}'::text[];
  v_id      text;
  v_kind    text;
  v_title   text;
  v_caption text;
  v_url     text;
  v_img     text;
  v_portal  text;
  v_color   text;
  v_prefix  text;
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id then
      raise exception 'A board cannot move to another job' using errcode = '22023';
    end if;
  else
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
      raise exception 'Job not found' using errcode = '23503', detail = 'job_boards.job_id must belong to the same user';
    end if;
    if not public.is_service_context() and public.user_effective_tier(new.user_id) not in ('premium', 'ai') then
      raise exception 'PLAN_LIMIT: Mood boards are part of Premium.' using errcode = 'P0001', hint = 'boards';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('job-boards:' || new.job_id::text, 0));
    select count(*) into v_count from public.job_boards b where b.job_id = new.job_id;
    if v_count >= 50 then
      raise exception 'A job holds up to 50 mood boards.' using errcode = 'P0001';
    end if;
  end if;

  new.title := btrim(regexp_replace(new.title, '[[:cntrl:]]+', ' ', 'g'));
  new.notes := public._clean_multiline(new.notes, 2000);

  if jsonb_typeof(new.items) is distinct from 'array' then
    new.items := '[]'::jsonb;
  end if;
  if jsonb_array_length(new.items) > 60 then
    raise exception 'A board holds up to 60 items.' using errcode = '22023';
  end if;
  v_prefix := new.user_id::text || '/boards/' || new.job_id::text || '/';
  for v_el in select i.value from jsonb_array_elements(new.items) as i(value) loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'Invalid board item' using errcode = '22023';
    end if;
    v_id := btrim(coalesce(v_el->>'id', ''));
    if v_id = '' then
      v_id := gen_random_uuid()::text;
    elsif v_id !~ '^[A-Za-z0-9_-]{6,40}$' then
      raise exception 'Invalid board item id' using errcode = '22023';
    end if;
    if v_id = any(v_ids) then
      raise exception 'Two board items have the same id' using errcode = '22023';
    end if;
    v_ids := v_ids || v_id;
    v_kind := lower(btrim(coalesce(v_el->>'kind', '')));
    if v_kind not in ('image', 'link', 'note', 'color') then
      raise exception 'Invalid board item kind' using errcode = '22023';
    end if;
    v_title := public._clean_text(v_el->>'title', 120);
    v_caption := public._clean_multiline(v_el->>'caption', 1000);
    v_url := nullif(btrim(coalesce(v_el->>'url', '')), '');
    if v_url is not null and (length(v_url) > 2000 or v_url !~* '^https://[^[:space:]]+$') then
      raise exception 'Links must start with https://' using errcode = '22023';
    end if;
    v_img := nullif(btrim(coalesce(v_el->>'image_path', '')), '');
    if v_img is not null and (left(v_img, length(v_prefix)) <> v_prefix
         or v_img !~ '^[0-9a-f-]{36}/boards/[0-9a-f-]{36}/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$') then
      raise exception 'Invalid image path' using errcode = '22023';
    end if;
    v_portal := nullif(btrim(coalesce(v_el->>'portal_path', '')), '');
    if v_portal is not null and (split_part(v_portal, '/', 1) <> new.user_id::text
         or v_portal !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$') then
      raise exception 'Invalid portal image path' using errcode = '22023';
    end if;
    v_color := lower(nullif(btrim(coalesce(v_el->>'color', '')), ''));
    if v_color is not null and v_color !~ '^#[0-9a-f]{6}$' then
      raise exception 'Colours are written #RRGGBB' using errcode = '22023';
    end if;

    -- the shape of each kind
    if v_kind = 'image' then
      if v_img is null and v_url is null then
        raise exception 'An image needs an upload or an https link' using errcode = '22023';
      end if;
      v_color := null;
    elsif v_kind = 'link' then
      if v_url is null then
        raise exception 'A link item needs an https link' using errcode = '22023';
      end if;
      v_img := null;
      v_color := null;
    elsif v_kind = 'note' then
      if v_caption is null and v_title is null then
        raise exception 'Write the note' using errcode = '22023';
      end if;
      v_img := null;
      v_url := null;
      v_color := null;
    else
      if v_color is null then
        raise exception 'A colour item needs a colour (#RRGGBB)' using errcode = '22023';
      end if;
      v_img := null;
      v_url := null;
    end if;
    if v_img is null or not new.shared_in_portal then
      v_portal := null;   -- a public copy only for an uploaded image of a shared board
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id, 'kind', v_kind, 'title', v_title, 'caption', v_caption, 'url', v_url,
      'image_path', v_img, 'portal_path', v_portal, 'color', v_color));
  end loop;
  new.items := v_out;
  return new;
end;
$$;

drop trigger if exists trg_job_boards_guard on public.job_boards;
create trigger trg_job_boards_guard before insert or update on public.job_boards
  for each row execute function public.guard_job_board();

-- -------------------------------------------------------------------------------------
-- E. Public copy cleanup (both tables): a portal copy that is no longer referenced is queued for deletion
--    (the app empties the queue: components/requests/requestsApi.ts flushStorageCleanup). Private images in
--    document-assets are removed by the app.
-- -------------------------------------------------------------------------------------
create or replace function public.enqueue_selection_board_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text := case when tg_table_name = 'job_boards' then 'items' else 'options' end;
  v_old   jsonb;
  v_new   jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return null;
  end if;
  v_old := to_jsonb(old) -> v_key;
  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new) -> v_key;
  end if;
  if jsonb_typeof(v_old) is distinct from 'array' then
    return null;
  end if;
  if jsonb_typeof(v_new) is distinct from 'array' then
    v_new := '[]'::jsonb;
  end if;
  insert into public.storage_cleanup_queue (user_id, bucket, path)
  select distinct old.user_id, 'portal-photos', o.value->>'portal_path'
  from jsonb_array_elements(v_old) as o(value)
  where coalesce(o.value->>'portal_path', '') <> ''
    and split_part(o.value->>'portal_path', '/', 1) = old.user_id::text
    and not exists (select 1 from jsonb_array_elements(v_new) as n(value)
                    where n.value->>'portal_path' = o.value->>'portal_path');
  return null;
end;
$$;

drop trigger if exists trg_job_selections_cleanup on public.job_selections;
create trigger trg_job_selections_cleanup after delete or update on public.job_selections
  for each row execute function public.enqueue_selection_board_cleanup();
drop trigger if exists trg_job_boards_cleanup on public.job_boards;
create trigger trg_job_boards_cleanup after delete or update on public.job_boards
  for each row execute function public.enqueue_selection_board_cleanup();

-- -------------------------------------------------------------------------------------
-- F. Row level security + table privileges (owner full access to own rows)
-- -------------------------------------------------------------------------------------
alter table public.job_selections enable row level security;
alter table public.job_boards enable row level security;

drop policy if exists job_selections_select_own on public.job_selections;
drop policy if exists job_selections_insert_own on public.job_selections;
drop policy if exists job_selections_update_own on public.job_selections;
drop policy if exists job_selections_delete_own on public.job_selections;
create policy job_selections_select_own on public.job_selections for select to authenticated
  using (user_id = (select auth.uid()));
create policy job_selections_insert_own on public.job_selections for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy job_selections_update_own on public.job_selections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy job_selections_delete_own on public.job_selections for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists job_boards_select_own on public.job_boards;
drop policy if exists job_boards_insert_own on public.job_boards;
drop policy if exists job_boards_update_own on public.job_boards;
drop policy if exists job_boards_delete_own on public.job_boards;
create policy job_boards_select_own on public.job_boards for select to authenticated
  using (user_id = (select auth.uid()));
create policy job_boards_insert_own on public.job_boards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy job_boards_update_own on public.job_boards for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy job_boards_delete_own on public.job_boards for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.job_selections, public.job_boards from anon;
revoke truncate on public.job_selections, public.job_boards from authenticated;
grant select, insert, update, delete on public.job_selections, public.job_boards to authenticated;
grant all on public.job_selections, public.job_boards to service_role;

-- -------------------------------------------------------------------------------------
-- G. Client portal (anon, portal key)
--    A job is the client's when it belongs to the client's contractor and jobs.client_id = the client, or (no
--    client_id) the job's client name matches the client's (trimmed, case-insensitive, never an empty name).
--    A p_job_id that is not one of the client's jobs raises the SAME 'Invalid portal link'.
-- -------------------------------------------------------------------------------------

-- One selection as the portal sees it. Options: name, description, public image copy, link, unit, quantity, unit
-- price, total and the difference to the allowance (> 0 = an upgrade the client pays, < 0 = a credit). Never the
-- cost, SKU, supplier, private image path, purchase order, owner-only history entries. Internal helper: not executable
-- by anon / authenticated.
create or replace function public._portal_selection_json(p_s public.job_selections, p_job_name text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_s.id,
    'job_id', p_s.job_id,
    'job_name', p_job_name,
    'title', p_s.title,
    'category', p_s.category,
    'room', p_s.room,
    'body', p_s.body,
    'due_date', p_s.due_date,
    'status', p_s.status,
    'allowance', p_s.allowance,
    'sent_at', p_s.sent_at,
    'chosen_option_id', p_s.chosen_option_id,
    'client_comment', p_s.client_comment,
    'chosen_by', p_s.chosen_by,
    'chosen_at', p_s.chosen_at,
    'approved_at', p_s.approved_at,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.el->>'id',
               'name', o.el->>'name',
               'description', o.el->>'description',
               'path', o.el->>'portal_path',
               'url', o.el->>'url',
               'unit', o.el->>'unit',
               'qty', public._selection_number(o.el->'qty'),
               'unit_price', public._selection_number(o.el->'unit_price'),
               'total', round(coalesce(public._selection_number(o.el->'unit_price'), 0) * coalesce(public._selection_number(o.el->'qty'), 1), 2),
               'difference', case when p_s.allowance is null then null
                 else round(coalesce(public._selection_number(o.el->'unit_price'), 0) * coalesce(public._selection_number(o.el->'qty'), 1), 2) - p_s.allowance end)
             order by o.ord)
      from jsonb_array_elements(p_s.options) with ordinality as o(el, ord)), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', h.el->'at', 'by', h.el->'by', 'action', h.el->'action', 'note', h.el->'note')
             order by h.o)
      from jsonb_array_elements(p_s.history) with ordinality as h(el, o)
      where h.el->>'action' in ('sent', 'reopened', 'chosen', 'approved', 'changes_requested', 'ordered')), '[]'::jsonb));
$$;

create or replace function public.get_portal_selections(p_key text, p_job_id uuid default null)
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
    select jsonb_agg(public._portal_selection_json(x.s, x.job_name)
                     order by (x.s).status <> 'sent', (x.s).due_date nulls last, (x.s).sent_at desc)
    from (
      select s as s, j.name as job_name
      from public.job_selections s
      join public.jobs j on j.id = s.job_id and j.user_id = s.user_id
      where s.user_id = v_client.user_id
        and s.status in ('sent', 'chosen', 'approved', 'changes_requested', 'ordered')
        and (p_job_id is null or s.job_id = p_job_id)
        and (j.client_id = v_client.id
             or (j.client_id is null
                 and btrim(coalesce(v_client.name, '')) <> ''
                 and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
      order by s.sent_at desc nulls last
      limit 300
    ) x), '[]'::jsonb);
end;
$$;

-- The client picks ONE option (+ an optional comment and name). Once per send: a selection that is not 'sent' any
-- more raises 'ALREADY_CHOSEN: ...'. Returns the updated selection (same shape as get_portal_selections).
create or replace function public.choose_portal_selection(
  p_key text, p_selection_id uuid, p_option_id text, p_comment text default null, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client   public.clients%rowtype;
  v_s        public.job_selections%rowtype;
  v_job_name text;
  v_comment  text := public._clean_multiline(p_comment, 2000);
  v_name     text := public._clean_text(p_name, 120);
  v_option   text := btrim(coalesce(p_option_id, ''));
  v_opt_name text;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{32,128}$' or p_selection_id is null then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;
  select * into v_client from public.clients where portal_key = p_key;
  if not found then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;

  select s.* into v_s
  from public.job_selections s
  join public.jobs j on j.id = s.job_id and j.user_id = s.user_id
  where s.id = p_selection_id
    and s.user_id = v_client.user_id
    and s.status in ('sent', 'chosen', 'approved', 'changes_requested', 'ordered')
    and (j.client_id = v_client.id
         or (j.client_id is null
             and btrim(coalesce(v_client.name, '')) <> ''
             and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
  for update of s;
  if not found then
    raise exception 'This selection is not available any more' using errcode = 'P0002';
  end if;
  if v_s.status <> 'sent' then
    raise exception 'ALREADY_CHOSEN: A choice was already made.' using errcode = 'P0001', hint = 'already_chosen';
  end if;

  select o.value->>'name' into v_opt_name
  from jsonb_array_elements(v_s.options) as o(value)
  where o.value->>'id' = v_option
  limit 1;
  if v_option = '' or v_opt_name is null then
    raise exception 'Please choose one of the options.' using errcode = '22023';
  end if;

  update public.job_selections
     set status = 'chosen',
         chosen_option_id = v_option,
         client_comment = v_comment,
         chosen_by = v_name,
         chosen_at = now(),
         history = history || jsonb_build_array(jsonb_build_object(
                     'at', now(), 'by', 'client', 'action', 'chosen',
                     'note', left(v_opt_name || coalesce(': ' || v_comment, ''), 1000)))
   where id = v_s.id
  returning * into v_s;

  select j.name into v_job_name from public.jobs j where j.id = v_s.job_id;
  return public._portal_selection_json(v_s, v_job_name);
end;
$$;

-- Shared mood boards of the client's jobs: title + items (kind, title, caption, link, public image copy, colour).
-- Image items show only with a public copy or an https link; never the owner's notes or private image paths.
create or replace function public.get_portal_boards(p_key text, p_job_id uuid default null)
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
             'id', x.id, 'job_id', x.job_id, 'job_name', x.job_name, 'title', x.title,
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', i.el->>'id',
                        'kind', i.el->>'kind',
                        'title', i.el->>'title',
                        'caption', i.el->>'caption',
                        'url', i.el->>'url',
                        'path', i.el->>'portal_path',
                        'color', i.el->>'color')
                      order by i.ord)
               from jsonb_array_elements(x.items) with ordinality as i(el, ord)
               where i.el->>'kind' <> 'image'
                  or coalesce(i.el->>'portal_path', '') <> ''
                  or coalesce(i.el->>'url', '') <> ''), '[]'::jsonb))
           order by x.job_name, x.title)
    from (
      select b.id, b.job_id, j.name as job_name, b.title, b.items
      from public.job_boards b
      join public.jobs j on j.id = b.job_id and j.user_id = b.user_id
      where b.user_id = v_client.user_id
        and b.shared_in_portal
        and (p_job_id is null or b.job_id = p_job_id)
        and (j.client_id = v_client.id
             or (j.client_id is null
                 and btrim(coalesce(v_client.name, '')) <> ''
                 and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
      order by b.created_at desc
      limit 100
    ) x), '[]'::jsonb);
end;
$$;

-- -------------------------------------------------------------------------------------
-- H. Function privileges (default-deny, explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public._selection_number(jsonb) from public, anon, authenticated;
revoke all on function public.guard_job_selection() from public, anon, authenticated;
revoke all on function public.guard_job_selection_flow() from public, anon, authenticated;
revoke all on function public.guard_job_board() from public, anon, authenticated;
revoke all on function public.enqueue_selection_board_cleanup() from public, anon, authenticated;
revoke all on function public._portal_selection_json(public.job_selections, text) from public, anon, authenticated;
revoke all on function public.get_portal_selections(text, uuid) from public, anon, authenticated;
revoke all on function public.choose_portal_selection(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.get_portal_boards(text, uuid) from public, anon, authenticated;

grant execute on function public.get_portal_selections(text, uuid)                       to anon, authenticated;
grant execute on function public.choose_portal_selection(text, uuid, text, text, text)   to anon, authenticated;
grant execute on function public.get_portal_boards(text, uuid)                           to anon, authenticated;

notify pgrst, 'reload schema';
