-- =====================================================================================
-- ContractorDocs part 3/4: client portal & approvals, forum, inventory, recurring invoices
-- =====================================================================================

-- =====================================================================================
-- A. Client portal and approval links (anon-callable, SECURITY DEFINER, whitelisted output)
-- =====================================================================================

-- Types a client may see; internal paperwork (Expense Log, Purchase Order, Material Log, Time Sheet,
-- Note, Receipt, Profit Report) never leaves the database through the public RPCs.
create or replace function public._client_visible_type(p_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('Invoice', 'Estimate', 'Change Order', 'Work Order', 'Daily Job Report', 'Warranty');
$$;

create or replace function public._signable_type(p_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('Estimate', 'Change Order');
$$;

-- Strip internal fields (costs, inventory links, flags, recurrence, AI metadata) from document JSON.
create or replace function public._client_safe_doc_data(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
           e.key,
           case
             when e.key in ('lineItems', 'items') and jsonb_typeof(e.value) = 'array' then (
               select coalesce(jsonb_agg(
                        case when jsonb_typeof(li.value) = 'object'
                             then li.value - array['unitCost', 'unit_cost', 'currentStock', 'inventoryItemId', 'item_id',
                                                   'track_inventory', 'itemSource', 'costPrice', 'cost_price', 'markup',
                                                   'supplier']
                             else li.value end
                        order by li.ordinality), '[]'::jsonb)
               from jsonb_array_elements(e.value) with ordinality as li(value, ordinality))
             else e.value
           end), '{}'::jsonb)
  from jsonb_each(coalesce(p, '{}'::jsonb)) as e(key, value)
  where e.key <> all (array['viewedByProvider', 'isAiGenerated', '__lightweight', 'deductInventory', 'recurrence',
                            'recurrenceSourceId', 'recurrencePeriod', 'ai_visual_data', 'aiMeta', 'internalNotes',
                            'privateNotes', 'inventoryDeductedAt', 'sourceDocumentId'])
    and e.key !~* '(internal|private|profit|margin|markup|unitcost|costprice)';
$$;

create or replace function public._contractor_public_info(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'name', p.name, 'company_name', p.company_name, 'logo_url', p.logo_url,
           'phone', p.phone, 'email', p.email, 'website', p.website, 'address', p.address)
  from public.profiles p
  where p.id = p_user_id;
$$;

-- Documents of a client: linked by id (documents.client_id, else jobs.client_id); legacy rows without
-- ids fall back to the client name. Scoped to the client's contractor.
create or replace function public._client_document_ids(p_client_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.clients c
  join public.documents d on d.user_id = c.user_id
  left join public.jobs j on j.id = d.job_id
  where c.id = p_client_id
    and (
      d.client_id = c.id
      or (d.client_id is null and j.client_id = c.id)
      or (d.client_id is null and j.client_id is null
          and coalesce(nullif(btrim(d.data->>'clientName'), ''), j.client_name) = c.name)
    );
$$;

create or replace function public._validate_signature(p_signature text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_signature is null
     or length(p_signature) > 500000
     or p_signature !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then
    raise exception 'Invalid signature image' using errcode = '22023';
  end if;
end;
$$;

create or replace function public._clean_text(p text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]]+', ' ', 'g')), p_max), '');
$$;

-- Shared state checks before a client signs / declines (raises with the messages the UI classifies)
create or replace function public._assert_document_open(p_doc public.documents)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status text := coalesce(p_doc.data->>'status', '');
  v_expiry text := p_doc.data->>'expiryDate';
begin
  if not public._signable_type(p_doc.type) then
    raise exception 'Document not found or not available for online approval' using errcode = 'P0002';
  end if;
  if v_status = 'Accepted' or coalesce(p_doc.data->>'clientSignatureUrl', '') <> '' then
    raise exception 'This document was already signed' using errcode = '23505';
  end if;
  if v_status = 'Rejected' or coalesce(p_doc.data->>'clientDeclinedAt', '') <> '' then
    raise exception 'This document was already declined' using errcode = '23505';
  end if;
  if v_expiry ~ '^\d{4}-\d{2}-\d{2}' and left(v_expiry, 10)::date < current_date then
    raise exception 'This estimate has expired' using errcode = 'P0001';
  end if;
end;
$$;

-- Applies a client signature/decline to a locked document row.
create or replace function public._apply_client_decision(
  p_doc_id uuid, p_accept boolean, p_signature text, p_signer_name text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_patch jsonb;
begin
  if p_accept then
    v_patch := jsonb_build_object(
      'clientSignatureUrl', p_signature,
      'clientSignedAt', v_now,
      'clientSignerName', p_signer_name,
      'clientSignedBy', p_signer_name,
      'status', 'Accepted',
      'viewedByProvider', false);
  else
    v_patch := jsonb_strip_nulls(jsonb_build_object(
      'clientDeclinedAt', v_now,
      'clientDeclineReason', p_reason,
      'clientSignerName', p_signer_name)) || jsonb_build_object('status', 'Rejected', 'viewedByProvider', false);
  end if;

  update public.documents
     set data = data || v_patch,
         approval_used_at = now()
   where id = p_doc_id;

  return jsonb_build_object('success', true, 'status', v_patch->>'status',
                            'at', v_now, 'signer_name', p_signer_name);
end;
$$;

-- /?portal=<key>
create or replace function public.get_portal_data(p_key text)
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

  return jsonb_build_object(
    'client', jsonb_build_object('name', v_client.name, 'email', v_client.email),
    'contractor', public._contractor_public_info(v_client.user_id),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'type', d.type, 'job_id', d.job_id, 'created_at', d.created_at,
               'data', public._client_safe_doc_data(d.data))
             order by d.created_at desc)
      from (
        select d.*
        from public.documents d
        where d.id in (select public._client_document_ids(v_client.id))
          and public._client_visible_type(d.type)
          and coalesce(d.data->>'status', '') <> 'Draft'
        order by d.created_at desc
        limit 200
      ) d
    ), '[]'::jsonb));
end;
$$;

create or replace function public.sign_document_via_portal(
  p_key text, p_doc_id uuid, p_signature text, p_signer_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_doc    public.documents%rowtype;
begin
  select * into v_client from public.clients where portal_key = p_key and p_key ~ '^[A-Za-z0-9_-]{32,128}$';
  if not found then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;
  perform public._validate_signature(p_signature);

  select d.* into v_doc
    from public.documents d
   where d.id = p_doc_id
     and d.id in (select public._client_document_ids(v_client.id))
     and coalesce(d.data->>'status', '') <> 'Draft'
   for update;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  perform public._assert_document_open(v_doc);

  return public._apply_client_decision(
    v_doc.id, true, p_signature,
    coalesce(public._clean_text(p_signer_name, 200), v_client.name), null);
end;
$$;

create or replace function public.decline_document_via_portal(
  p_key text, p_doc_id uuid, p_reason text default null, p_signer_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_doc    public.documents%rowtype;
begin
  select * into v_client from public.clients where portal_key = p_key and p_key ~ '^[A-Za-z0-9_-]{32,128}$';
  if not found then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;

  select d.* into v_doc
    from public.documents d
   where d.id = p_doc_id
     and d.id in (select public._client_document_ids(v_client.id))
     and coalesce(d.data->>'status', '') <> 'Draft'
   for update;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  perform public._assert_document_open(v_doc);

  return public._apply_client_decision(
    v_doc.id, false, null, public._clean_text(p_signer_name, 200), public._clean_text(p_reason, 1000));
end;
$$;

-- /?approval_token=<documents.public_token>
create or replace function public.get_document_by_token(doc_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where public_token = doc_token;
  if not found or not public._client_visible_type(v_doc.type) then
    raise exception 'Approval link not found or no longer valid' using errcode = 'P0002';
  end if;
  -- an unsigned document behind an expired link is not shown; signed/declined ones stay viewable
  if v_doc.approval_expires_at is not null and v_doc.approval_expires_at < now()
     and v_doc.approval_used_at is null then
    raise exception 'This approval link has expired' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_doc.id, 'type', v_doc.type, 'job_id', v_doc.job_id, 'created_at', v_doc.created_at,
      'data', public._client_safe_doc_data(v_doc.data)),
    'contractor', public._contractor_public_info(v_doc.user_id),
    'link', jsonb_build_object('expires_at', v_doc.approval_expires_at, 'used_at', v_doc.approval_used_at));
end;
$$;

create or replace function public.approve_document_by_token(
  doc_token uuid, p_signature text, p_signer_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
begin
  perform public._validate_signature(p_signature);
  select * into v_doc from public.documents where public_token = doc_token for update;
  if not found then
    raise exception 'Approval link not found or no longer valid' using errcode = 'P0002';
  end if;
  perform public._assert_document_open(v_doc);
  if v_doc.approval_used_at is not null then
    raise exception 'This approval link was already used' using errcode = '23505';
  end if;
  if v_doc.approval_expires_at is not null and v_doc.approval_expires_at < now() then
    raise exception 'This approval link has expired' using errcode = 'P0001';
  end if;

  return public._apply_client_decision(
    v_doc.id, true, p_signature,
    coalesce(public._clean_text(p_signer_name, 200), public._clean_text(v_doc.data->>'clientName', 200), 'Client'),
    null);
end;
$$;

create or replace function public.decline_document_by_token(
  doc_token uuid, p_reason text default null, p_signer_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where public_token = doc_token for update;
  if not found then
    raise exception 'Approval link not found or no longer valid' using errcode = 'P0002';
  end if;
  perform public._assert_document_open(v_doc);
  if v_doc.approval_used_at is not null then
    raise exception 'This approval link was already used' using errcode = '23505';
  end if;
  if v_doc.approval_expires_at is not null and v_doc.approval_expires_at < now() then
    raise exception 'This approval link has expired' using errcode = 'P0001';
  end if;

  return public._apply_client_decision(
    v_doc.id, false, null, public._clean_text(p_signer_name, 200), public._clean_text(p_reason, 1000));
end;
$$;

-- =====================================================================================
-- B. Forum: counters, votes, notifications (server-side only), moderation
-- =====================================================================================
create or replace function public.recount_post_votes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posts uuid[] := '{}';
  v_post  uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_posts := v_posts || old.post_id; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_posts := v_posts || new.post_id; end if;

  foreach v_post in array (select array_agg(distinct x) from unnest(v_posts) x where x is not null)
  loop
    update public.forum_posts p set
      upvotes   = (select count(*) from public.forum_votes v where v.post_id = v_post and v.vote_type = 'up'),
      downvotes = (select count(*) from public.forum_votes v where v.post_id = v_post and v.vote_type = 'down')
    where p.id = v_post;
  end loop;

  -- 'like' notification: once per (liker, post), never to yourself
  if tg_op in ('INSERT', 'UPDATE') then
    if new.vote_type = 'up' then
      insert into public.notifications (user_id, source_user_id, type, post_id)
      select p.user_id, new.user_id, 'like', p.id
        from public.forum_posts p
       where p.id = new.post_id
         and p.user_id <> new.user_id
         and not exists (select 1 from public.notifications n
                          where n.user_id = p.user_id and n.source_user_id = new.user_id
                            and n.post_id = p.id and n.type = 'like');
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_forum_votes_recount
  after insert or update or delete on public.forum_votes
  for each row execute function public.recount_post_votes();

create or replace function public.recount_comment_votes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comments uuid[] := '{}';
  v_comment  uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_comments := v_comments || old.comment_id; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_comments := v_comments || new.comment_id; end if;

  foreach v_comment in array (select array_agg(distinct x) from unnest(v_comments) x where x is not null)
  loop
    update public.forum_comments c set
      upvotes   = (select count(*) from public.forum_comment_votes v where v.comment_id = v_comment and v.vote_type = 'up'),
      downvotes = (select count(*) from public.forum_comment_votes v where v.comment_id = v_comment and v.vote_type = 'down')
    where c.id = v_comment;
  end loop;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.vote_type = 'up' then
      insert into public.notifications (user_id, source_user_id, type, post_id, comment_id)
      select c.user_id, new.user_id, 'comment_like', c.post_id, c.id
        from public.forum_comments c
       where c.id = new.comment_id
         and c.user_id <> new.user_id
         and not exists (select 1 from public.notifications n
                          where n.user_id = c.user_id and n.source_user_id = new.user_id
                            and n.comment_id = c.id and n.type = 'comment_like');
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_forum_comment_votes_recount
  after insert or update or delete on public.forum_comment_votes
  for each row execute function public.recount_comment_votes();

-- 'comment' notification to the post author
create or replace function public.notify_forum_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, source_user_id, type, post_id, comment_id)
  select p.user_id, new.user_id, 'comment', p.id, new.id
    from public.forum_posts p
   where p.id = new.post_id and p.user_id <> new.user_id;
  return null;
end;
$$;

create trigger trg_forum_comments_notify
  after insert on public.forum_comments
  for each row execute function public.notify_forum_comment();

-- toggle_forum_vote(post, 1 | -1): same value again removes the vote. Returns upvotes - downvotes.
create or replace function public.toggle_forum_vote(p_post_id uuid, p_value integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_type text;
  v_cur  text;
  v_score integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_value not in (1, -1) then raise exception 'p_value must be 1 or -1' using errcode = '22023'; end if;
  if not exists (select 1 from public.forum_posts where id = p_post_id and (not is_hidden or user_id = v_uid)) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  v_type := case when p_value = 1 then 'up' else 'down' end;

  select vote_type into v_cur from public.forum_votes where post_id = p_post_id and user_id = v_uid for update;
  if v_cur = v_type then
    delete from public.forum_votes where post_id = p_post_id and user_id = v_uid;
  elsif v_cur is not null then
    update public.forum_votes set vote_type = v_type, created_at = now() where post_id = p_post_id and user_id = v_uid;
  else
    insert into public.forum_votes (post_id, user_id, vote_type) values (p_post_id, v_uid, v_type);
  end if;

  select upvotes - downvotes into v_score from public.forum_posts where id = p_post_id;
  return v_score;
end;
$$;

create or replace function public.toggle_forum_comment_vote(p_comment_id uuid, p_value integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_type text;
  v_cur  text;
  v_score integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_value not in (1, -1) then raise exception 'p_value must be 1 or -1' using errcode = '22023'; end if;
  if not exists (select 1 from public.forum_comments where id = p_comment_id and (not is_hidden or user_id = v_uid)) then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;
  v_type := case when p_value = 1 then 'up' else 'down' end;

  select vote_type into v_cur from public.forum_comment_votes where comment_id = p_comment_id and user_id = v_uid for update;
  if v_cur = v_type then
    delete from public.forum_comment_votes where comment_id = p_comment_id and user_id = v_uid;
  elsif v_cur is not null then
    update public.forum_comment_votes set vote_type = v_type, created_at = now() where comment_id = p_comment_id and user_id = v_uid;
  else
    insert into public.forum_comment_votes (comment_id, user_id, vote_type) values (p_comment_id, v_uid, v_type);
  end if;

  select upvotes - downvotes into v_score from public.forum_comments where id = p_comment_id;
  return v_score;
end;
$$;

-- Hide a post/comment after 3 distinct reports (authors still see it; RLS hides it from others)
create or replace function public.apply_forum_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.post_id is not null then
    if (select count(distinct reporter_id) from public.forum_reports where post_id = new.post_id) >= 3 then
      update public.forum_posts set is_hidden = true where id = new.post_id;
    end if;
  else
    if (select count(distinct reporter_id) from public.forum_reports where comment_id = new.comment_id) >= 3 then
      update public.forum_comments set is_hidden = true where id = new.comment_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_forum_reports_apply
  after insert on public.forum_reports
  for each row execute function public.apply_forum_report();

-- =====================================================================================
-- C. Inventory: ONE idempotent mechanism
--
-- Manual stock changes: adjust_inventory / checkout_inventory (atomic, owner-only, logged).
-- Document-driven stock: a trigger on documents keeps a ledger in inventory_history keyed by
-- (document_id, line_key, item_id). On every relevant save the DESIRED allocation of every
-- stock-moving document in the job is recomputed and only the difference to the ledger is applied,
-- so re-saves never double-deduct, edits move only the delta, and delete/cancel returns the stock.
--
-- Rules (per job and per inventory item; kits are expanded into their components):
--   1. Estimate (status Accepted/Approved) and Change Order (Accepted/Approved): deduct their lines.
--   2. Material Log with deductInventory = true: deducts what exceeds stage 1 for that item.
--   3. Invoice with status Paid: deducts what exceeds max(stage 1, stage 2) for that item.
--   => stock used by a job = max(accepted, logged, paid) for each item; never counted twice.
--   Within a stage, older documents are covered first (created_at, id).
--   Stock may go negative (an invoice can always be marked Paid); such rows say so in notes.
-- =====================================================================================

create or replace function public._try_uuid(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

create or replace function public._try_numeric(p text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when btrim(coalesce(p, '')) ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then btrim(p)::numeric end;
$$;

create or replace function public._document_stock_stage(p_type text, p_data jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('Estimate', 'Change Order')
         and lower(coalesce(p_data->>'status', '')) in ('accepted', 'approved') then 1
    when p_type = 'Material Log'
         and lower(coalesce(p_data->>'deductInventory', 'false')) in ('true', '1', 'yes') then 2
    when p_type = 'Invoice'
         and lower(coalesce(p_data->>'status', '')) = 'paid' then 3
    else null
  end;
$$;

-- Lines a document consumes (kits expanded), before the job-level netting.
create or replace function public._document_stock_lines(p_user_id uuid, p_type text, p_data jsonb)
returns table (line_key text, item_id uuid, qty numeric, seq integer)
language sql
stable
security definer
set search_path = ''
as $$
  with raw as (
    select li.value as li, li.ordinality::int as seq
    from jsonb_array_elements(
           case when jsonb_typeof(p_data -> (case when p_type = 'Material Log' then 'items' else 'lineItems' end)) = 'array'
                then p_data -> (case when p_type = 'Material Log' then 'items' else 'lineItems' end)
                else '[]'::jsonb end) with ordinality as li(value, ordinality)
    where public._document_stock_stage(p_type, p_data) is not null
      and jsonb_typeof(li.value) = 'object'
      and lower(coalesce(li.value->>'track_inventory', 'true')) <> 'false'
  ),
  parsed as (
    select seq,
           coalesce(public._try_uuid(li->>'inventoryItemId'),
                    case when coalesce(li->>'itemSource', 'inventory') = 'inventory' then public._try_uuid(li->>'item_id') end) as item_id,
           public._try_numeric(li->>'quantity') as qty,
           nullif(btrim(li->>'id'), '') as line_id
    from raw
  ),
  owned as (
    select p.seq, p.qty, coalesce(p.line_id, '#' || p.item_id::text) as line_key, i.id as item_id,
           i.is_assembly, i.assembly_items
    from parsed p
    join public.inventory i on i.id = p.item_id and i.user_id = p_user_id
    where p.qty is not null and p.qty > 0
  )
  -- plain items
  select o.line_key, o.item_id, o.qty, o.seq from owned o where not o.is_assembly
  union all
  -- kits: every stocked component x kit quantity
  select o.line_key, c.id, o.qty * comp.qty, o.seq
  from owned o
  cross join lateral (
    select public._try_uuid(a.value->>'item_id') as comp_id,
           coalesce(public._try_numeric(a.value->>'quantity'), 1) as qty
    from jsonb_array_elements(case when jsonb_typeof(o.assembly_items) = 'array' then o.assembly_items else '[]'::jsonb end) a
    where lower(coalesce(a.value->>'is_custom', 'false')) <> 'true'
  ) comp
  join public.inventory c on c.id = comp.comp_id and c.user_id = p_user_id and not c.is_assembly
  where o.is_assembly and comp.qty > 0;
$$;

-- Desired allocation of every stock-moving document of a job after netting the stages.
create or replace function public._job_stock_plan(p_user_id uuid, p_job_id uuid)
returns table (document_id uuid, line_key text, item_id uuid, qty numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with lines as (
    select d.id as document_id, d.created_at, public._document_stock_stage(d.type, d.data) as stage,
           l.line_key, l.item_id, sum(l.qty) as qty, min(l.seq) as seq
    from public.documents d
    cross join lateral public._document_stock_lines(d.user_id, d.type, d.data) l
    where d.user_id = p_user_id and d.job_id = p_job_id
      and d.type in ('Estimate', 'Change Order', 'Material Log', 'Invoice')
    group by d.id, d.created_at, d.type, d.data, l.line_key, l.item_id
  ),
  totals as (
    select item_id,
           coalesce(sum(qty) filter (where stage = 1), 0) as s1,
           coalesce(sum(qty) filter (where stage = 2), 0) as s2
    from lines group by item_id
  ),
  ordered as (
    select l.*,
           coalesce(sum(l.qty) over (partition by l.item_id, l.stage
                                     order by l.created_at, l.document_id, l.seq, l.line_key
                                     rows between unbounded preceding and 1 preceding), 0) as before_qty,
           case l.stage when 1 then 0 when 2 then t.s1 else greatest(t.s1, t.s2) end as pool
    from lines l join totals t using (item_id)
  )
  select document_id, line_key, item_id,
         case when stage = 1 then qty
              else qty - least(qty, greatest(pool - before_qty, 0)) end as qty
  from ordered;
$$;

-- Applies the difference between a desired allocation and the ledger for one document line.
create or replace function public._apply_ledger_delta(
  p_user_id uuid, p_document_id uuid, p_job_id uuid, p_line_key text, p_item_id uuid,
  p_alloc_delta numeric, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_after numeric;
  v_name  text;
begin
  if p_alloc_delta is null or p_alloc_delta = 0 then return; end if;
  update public.inventory
     set quantity = quantity - p_alloc_delta
   where id = p_item_id and user_id = p_user_id
  returning quantity, name into v_after, v_name;
  if not found then return; end if;

  insert into public.inventory_history
    (user_id, item_id, item_name, action, quantity_change, quantity_after, notes, job_id, document_id, line_key, source)
  values
    (p_user_id, p_item_id, v_name,
     case when p_alloc_delta > 0 then 'deduct' else 'restock' end,
     -p_alloc_delta, v_after,
     coalesce(p_label, 'Document') || case when p_alloc_delta > 0 then ': used' else ': returned to stock' end
       || case when v_after < 0 then ' (stock went negative)' else '' end,
     (select j.id from public.jobs j where j.id = p_job_id),
     p_document_id, p_line_key, 'document');
end;
$$;

create or replace function public._document_label(p_type text, p_data jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(coalesce(p_type, 'Document') || ' ' || coalesce(
           nullif(p_data->>'invoiceNumber', ''), nullif(p_data->>'estimateNumber', ''),
           nullif(p_data->>'changeOrderNumber', ''), nullif(p_data->>'title', ''),
           nullif(p_data->>'date', ''), ''));
$$;

-- Re-syncs every stock-moving document of a job with the ledger. Idempotent.
create or replace function public._sync_job_inventory(p_user_id uuid, p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_user_id is null or p_job_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('inventory-job:' || p_job_id::text, 0));

  for r in
    with job_docs as (
      select d.id, d.type, d.data from public.documents d
      where d.user_id = p_user_id and d.job_id = p_job_id
    ),
    desired as (
      select p.document_id, p.line_key, p.item_id, sum(p.qty) as qty
      from public._job_stock_plan(p_user_id, p_job_id) p
      group by 1, 2, 3
    ),
    current_alloc as (
      select h.document_id, h.line_key, h.item_id, -sum(h.quantity_change) as qty
      from public.inventory_history h
      where h.user_id = p_user_id and h.item_id is not null
        and h.document_id in (select id from job_docs)
      group by 1, 2, 3
    )
    select coalesce(ds.document_id, c.document_id) as document_id,
           coalesce(ds.line_key, c.line_key) as line_key,
           coalesce(ds.item_id, c.item_id) as item_id,
           coalesce(ds.qty, 0) - coalesce(c.qty, 0) as delta
    from desired ds
    full join current_alloc c
      on c.document_id = ds.document_id and c.line_key = ds.line_key and c.item_id = ds.item_id
    where coalesce(ds.qty, 0) <> coalesce(c.qty, 0)
    order by 3, 1, 2
  loop
    perform public._apply_ledger_delta(
      p_user_id, r.document_id, p_job_id, r.line_key, r.item_id, r.delta,
      (select public._document_label(jd.type, jd.data) from public.documents jd where jd.id = r.document_id));
  end loop;
end;
$$;

-- Returns everything a (deleted) document still holds.
create or replace function public._release_document_inventory(
  p_user_id uuid, p_document_id uuid, p_job_id uuid, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select h.line_key, h.item_id, -sum(h.quantity_change) as qty
    from public.inventory_history h
    where h.user_id = p_user_id and h.document_id = p_document_id and h.item_id is not null
    group by 1, 2
    having sum(h.quantity_change) <> 0
    order by 2, 1
  loop
    perform public._apply_ledger_delta(p_user_id, p_document_id, p_job_id, r.line_key, r.item_id, -r.qty,
                                       coalesce(p_label, 'Deleted document'));
  end loop;
end;
$$;

create or replace function public._document_stock_signature(p_type text, p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(p_type, public._document_stock_stage(p_type, p_data),
                           case when p_type = 'Material Log' then p_data->'items' else p_data->'lineItems' end);
$$;

create or replace function public.trg_documents_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_types constant text[] := array['Estimate', 'Change Order', 'Material Log', 'Invoice'];
begin
  if tg_op = 'DELETE' then
    -- user deletion cascades: nothing to give back
    if not exists (select 1 from auth.users u where u.id = old.user_id) then
      return null;
    end if;
    perform public._release_document_inventory(old.user_id, old.id, old.job_id,
                                               public._document_label(old.type, old.data) || ' (deleted)');
    if old.type = any (v_types) then
      perform public._sync_job_inventory(old.user_id, old.job_id);
    end if;
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.type = any (v_types) and public._document_stock_stage(new.type, new.data) is not null then
      perform public._sync_job_inventory(new.user_id, new.job_id);
    end if;
    return null;
  end if;

  -- UPDATE: skip saves that change nothing stock-related (e.g. mark as viewed, notes)
  if new.job_id = old.job_id
     and public._document_stock_signature(new.type, new.data) = public._document_stock_signature(old.type, old.data) then
    return null;
  end if;
  if new.type = any (v_types) or old.type = any (v_types) then
    perform public._sync_job_inventory(new.user_id, new.job_id);
    if new.job_id is distinct from old.job_id then
      perform public._sync_job_inventory(old.user_id, old.job_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_documents_inventory
  after insert or update of data, type, job_id or delete on public.documents
  for each row execute function public.trg_documents_inventory();

-- A browser insert with an opening quantity is logged as initial stock (history stays complete).
create or replace function public.log_initial_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quantity is distinct from 0 and not new.is_assembly then
    insert into public.inventory_history
      (user_id, item_id, item_name, action, quantity_change, quantity_after, notes, source)
    values (new.user_id, new.id, new.name, 'add', new.quantity, new.quantity, 'Initial stock', 'initial');
  end if;
  return null;
end;
$$;

create trigger trg_inventory_initial_history
  after insert on public.inventory
  for each row execute function public.log_initial_inventory();

-- Manual stock change (owner only, atomic). Negative stock is allowed and flagged in notes.
create or replace function public.adjust_inventory(
  p_item_id uuid, p_delta numeric, p_reason text default null, p_job_id uuid default null)
returns public.inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_item public.inventory%rowtype;
  v_job  uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'Quantity change must not be zero' using errcode = '22023';
  end if;
  if abs(p_delta) > 1000000000 then
    raise exception 'Quantity change is too large' using errcode = '22023';
  end if;
  select * into v_item from public.inventory where id = p_item_id and user_id = v_uid for update;
  if not found then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;
  if v_item.is_assembly then
    raise exception 'Kits have no stock of their own: use checkout_inventory or adjust the components' using errcode = '22023';
  end if;
  if p_job_id is not null then
    select id into v_job from public.jobs where id = p_job_id and user_id = v_uid;
    if v_job is null then
      raise exception 'Job not found' using errcode = 'P0002';
    end if;
  end if;

  update public.inventory set quantity = quantity + p_delta where id = p_item_id
  returning * into v_item;

  insert into public.inventory_history
    (user_id, item_id, item_name, action, quantity_change, quantity_after, notes, job_id, source)
  values
    (v_uid, v_item.id, v_item.name,
     case when p_delta > 0 then 'restock' when v_job is not null then 'job_allocation' else 'remove' end,
     p_delta, v_item.quantity,
     coalesce(public._clean_text(p_reason, 500), case when p_delta > 0 then 'Restock' else 'Stock removed' end)
       || case when v_item.quantity < 0 then ' (stock went negative)' else '' end,
     v_job, 'manual');

  return v_item;
end;
$$;

-- Check out a plain item or a kit (kit = every stocked component x p_qty) in one transaction.
create or replace function public.checkout_inventory(
  p_item_id uuid, p_qty numeric, p_job_id uuid default null, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_item public.inventory%rowtype;
  c      record;
  v_done integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = '22023';
  end if;
  select * into v_item from public.inventory where id = p_item_id and user_id = v_uid;
  if not found then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;

  if not v_item.is_assembly then
    perform public.adjust_inventory(p_item_id, -p_qty, p_reason, p_job_id);
    return;
  end if;

  for c in
    select public._try_uuid(a.value->>'item_id') as comp_id,
           coalesce(public._try_numeric(a.value->>'quantity'), 1) as qty
    from jsonb_array_elements(case when jsonb_typeof(v_item.assembly_items) = 'array' then v_item.assembly_items else '[]'::jsonb end) a
    where lower(coalesce(a.value->>'is_custom', 'false')) <> 'true'
    order by 1
  loop
    continue when c.comp_id is null or c.qty <= 0;
    perform public.adjust_inventory(
      c.comp_id, -(c.qty * p_qty),
      coalesce(public._clean_text(p_reason, 400), 'Kit checkout') || ' (kit: ' || v_item.name || ')',
      p_job_id);
    v_done := v_done + 1;
  end loop;

  if v_done = 0 then
    raise exception 'This kit has no stocked components' using errcode = '22023';
  end if;
end;
$$;

-- =====================================================================================
-- D. Recurring invoices: generate_due_recurring_invoices() for the calling user.
--    One copy per (source invoice, period) thanks to documents_recurrence_period_key.
-- =====================================================================================
create or replace function public._add_months_anchored(p_date date, p_months integer, p_anchor_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_date::timestamp) + make_interval(months => p_months))::date
         + (least(greatest(coalesce(p_anchor_day, extract(day from p_date)::int), 1),
                  extract(day from (date_trunc('month', p_date::timestamp) + make_interval(months => p_months + 1)
                                    - interval '1 day'))::int) - 1);
$$;

-- Next invoice number in the series of p_source for the period p_date.
--   'INV-2026-11-007' (PREFIX-YYYY-MM-NNN, as the forms create them) -> 'INV-2026-12-00x' (next free in that month)
--   'INV-1042' (PREFIX-NNN)                                            -> next free number in that series
--   anything else                                                      -> '<source>-YYYYMM'
create or replace function public._next_invoice_number(p_user_id uuid, p_source text, p_date date)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_src    text := coalesce(nullif(btrim(p_source), ''), 'INV');
  v_prefix text;
  v_base   text;
  v_width  integer;
  v_max    integer;
begin
  if v_src ~ '^[A-Za-z]+-\d{4}-\d{2}-\d+$' then
    v_prefix := substring(v_src from '^([A-Za-z]+)-');
    v_width  := greatest(length(substring(v_src from '(\d+)$')), 3);
    v_base   := v_prefix || '-' || to_char(p_date, 'YYYY-MM') || '-';
  elsif v_src ~ '^.*?\d+$' then
    v_base  := substring(v_src from '^(.*?)\d+$');
    v_width := length(substring(v_src from '(\d+)$'));
  else
    return v_src || '-' || to_char(p_date, 'YYYYMM');
  end if;

  select max(substring(d.data->>'invoiceNumber' from length(v_base) + 1)::int) into v_max
  from public.documents d
  where d.user_id = p_user_id and d.type = 'Invoice'
    and left(d.data->>'invoiceNumber', length(v_base)) = v_base
    and substring(d.data->>'invoiceNumber' from length(v_base) + 1) ~ '^\d{1,9}$';

  return v_base || lpad((coalesce(v_max, 0) + 1)::text, v_width, '0');
end;
$$;

create or replace function public.generate_due_recurring_invoices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_created integer := 0;
  src       record;
  v_rec     jsonb;
  v_next    date;
  v_months  integer;
  v_anchor  integer;
  v_issue   date;
  v_due     date;
  v_gap     integer;
  v_number  text;
  v_data    jsonb;
  v_rows    integer;
  v_iter    integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('recurring:' || v_uid::text, 0));

  for src in
    select d.* from public.documents d
    where d.user_id = v_uid and d.type = 'Invoice'
      and (d.data->'recurrence'->>'enabled') = 'true'
      and (d.data->'recurrence'->>'nextRunDate') ~ '^\d{4}-\d{2}-\d{2}'
      and left(d.data->'recurrence'->>'nextRunDate', 10)::date <= current_date
      and not (d.data ? 'recurrenceSourceId')
    order by d.created_at
    for update
  loop
    v_rec := src.data->'recurrence';
    v_months := case v_rec->>'frequency'
                  when 'Monthly' then 1 when 'Quarterly' then 3 when 'Bi-Annually' then 6
                  when 'Annually' then 12 else null end;
    continue when v_months is null;
    v_next := left(v_rec->>'nextRunDate', 10)::date;
    v_anchor := coalesce(public._try_numeric(v_rec->>'anchorDay')::int, extract(day from v_next)::int);
    v_issue := case when (src.data->>'issueDate') ~ '^\d{4}-\d{2}-\d{2}' then left(src.data->>'issueDate', 10)::date end;
    v_due   := case when (src.data->>'dueDate') ~ '^\d{4}-\d{2}-\d{2}' then left(src.data->>'dueDate', 10)::date end;
    v_gap   := coalesce(greatest(v_due - v_issue, 0), 30);
    v_iter  := 0;

    begin
      while v_next <= current_date and v_iter < 24 loop
        v_iter := v_iter + 1;
        v_number := public._next_invoice_number(v_uid, src.data->>'invoiceNumber', v_next);
        v_data := (src.data - array['recurrence', 'clientSignatureUrl', 'clientSignedAt', 'clientSignerName',
                                    'clientSignedBy', 'clientDeclinedAt', 'clientDeclineReason', 'payments',
                                    'viewedByProvider', '__lightweight', 'inventoryDeductedAt'])
                  || jsonb_build_object(
                       'recurrence', jsonb_build_object('enabled', false, 'frequency', v_rec->>'frequency'),
                       'invoiceNumber', v_number,
                       'issueDate', to_char(v_next, 'YYYY-MM-DD'),
                       'dueDate', to_char(v_next + v_gap, 'YYYY-MM-DD'),
                       'status', 'Draft',
                       'amountPaid', 0,
                       'recurrenceSourceId', src.id::text,
                       'recurrencePeriod', to_char(v_next, 'YYYY-MM-DD'));

        insert into public.documents (user_id, job_id, client_id, type, data)
        values (v_uid, src.job_id, src.client_id, 'Invoice', v_data)
        on conflict ((data->>'recurrenceSourceId'), (data->>'recurrencePeriod')) where (data ? 'recurrenceSourceId')
        do nothing;
        get diagnostics v_rows = row_count;
        v_created := v_created + v_rows;

        v_next := public._add_months_anchored(v_next, v_months, v_anchor);
      end loop;

      update public.documents
         set data = jsonb_set(data, '{recurrence}',
                              (data->'recurrence') || jsonb_build_object(
                                'nextRunDate', to_char(v_next, 'YYYY-MM-DD'),
                                'lastRunDate', to_char(current_date, 'YYYY-MM-DD'),
                                'anchorDay', v_anchor))
       where id = src.id;
    exception when sqlstate 'P0001' then
      -- PLAN_LIMIT (or another business rule) for this invoice: leave it due, try again later
      null;
    end;
  end loop;

  return v_created;
end;
$$;
