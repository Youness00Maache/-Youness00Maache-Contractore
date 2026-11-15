-- =====================================================================================
-- Applied 2026-11-15 with the owner's OK ("Yes, approve all", roadmap D13) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: 3 new functions + 2 replaced (bodies diffed against the originals: only the marked add-on lines differ), anon can run only the two new signing functions, a read-only test of _estimate_addon_patch (chosen id selected, others not, non-optional / unknown ids refused), bad portal key refused.
-- Optional add-ons chosen by the client when signing (roadmap D13, after N4 "proposal builder").
--
-- An estimate's optional add-on lines (documents.data.lineItems[i].optional = true) count in the money only when
-- `selected` is true (the app's rule, utils/money.ts isExcludedOptionalLine). Until now only the contractor could
-- switch one on. With this file the client ticks the add-ons they want on the approval link / portal and the database
-- stores the choice in the same transaction as the signature, the same way the good/better/best option choice
-- (20261114000100_estimate_options_choice.sql) stores its pick. No money is computed here: only `selected` flags are
-- written, and the app computes the totals from them exactly as it did on the client's screen (lib/addonChoice.ts
-- applyAddonChoice is the JS mirror of _estimate_addon_patch).
--
-- Why NEW signing functions instead of a new defaulted parameter on sign_document_via_portal /
-- approve_document_by_token: `create or replace` with a different argument list creates a SECOND overload, and every
-- existing call (3 or 4 arguments) would then fail as ambiguous ("function is not unique" / PGRST203), i.e. no client
-- could sign until the app changed. The existing signing functions are therefore NOT touched.
--
-- Functions:
--   _estimate_addon_patch             NEW (internal) checks the chosen ids and builds the data patch
--   sign_document_addons_via_portal   NEW  = sign_document_option_via_portal (20261114000100) with the add-on patch
--                                          instead of the option patch                      (/?portal=<key>)
--   approve_document_addons_by_token  NEW  = approve_document_option_by_token (20261114000100) with the add-on patch
--                                          (/?approval_token=<token>)
--   guard_document_write              REPLACED, body = 20261114000100_estimate_options_choice.sql version
--                                          + clientAddonChoice kept like clientOptionChoice (a stale form can't drop
--                                          it) and removed with it when the signature is removed on purpose
--                                          ("Revise -> Unlock"). Stays NOT security definer like the original (it
--                                          relies on current_user to tell browser saves apart).
--   _document_stock_lines             REPLACED, body = 20261112000200_portal_forum_inventory.sql version
--                                          + optional lines whose `selected` is not true take no stock (an accepted
--                                          estimate used to count every line, add-ons the client did not take
--                                          included). Lines without the optional flag: unchanged.
-- No table / column change, NO existing row is modified by this file. Runs top to bottom, idempotent.
--
-- Rules of the choice (raised errors use the SQLSTATEs the app already classifies):
--   * only an Estimate with lineItems, no open good/better/best options (an `options` array of 2+ and no appliedId),
--     at least one optional line with a string id (1-100 characters)                                    else 22023
--   * every chosen id must be such an optional line of THIS document; at most 50 ids; null = none chosen else 22023
--   * the document must be open for signing (_assert_document_open: not signed / declined / expired)    else 23505/P0001
--
-- Data written (documents.data), then the usual signature keys / status Accepted by _apply_client_decision (unchanged):
--   lineItems[i].selected = true / false on every optional line with an id (all other lines and keys untouched)
--   clientAddonChoice     = {"ids": ["<line id>", ...], "by": "client", "at": "<utc iso>", "name": "<signer>"}
--
-- The app tries the new functions only for an estimate with add-ons to choose; while they don't exist (PGRST202) it
-- signs with the existing functions, the choice is not recorded and the client is told the signed total without them.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Add-on patch (internal)
-- -------------------------------------------------------------------------------------
create or replace function public._estimate_addon_patch(p_doc public.documents, p_addon_ids text[], p_signer_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lines jsonb := p_doc.data -> 'lineItems';
  v_set   jsonb := p_doc.data -> 'estimateOptions';
  v_ids   text[];
  v_bad   integer;
  v_out   jsonb;
begin
  if p_doc.type <> 'Estimate' or coalesce(jsonb_typeof(v_lines), '') <> 'array' then
    raise exception 'This estimate has no optional add-ons to choose from' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(v_set), '') = 'object' and coalesce(jsonb_typeof(v_set -> 'options'), '') = 'array'
     and jsonb_array_length(v_set -> 'options') >= 2 and coalesce(v_set ->> 'appliedId', '') = '' then
    raise exception 'Add-ons can''t be chosen on an estimate with options' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_lines) as l(value)
     where jsonb_typeof(l.value) = 'object'
       and lower(btrim(coalesce(l.value ->> 'optional', ''))) = 'true'
       and jsonb_typeof(l.value -> 'id') = 'string' and length(l.value ->> 'id') between 1 and 100) then
    raise exception 'This estimate has no optional add-ons to choose from' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_addon_ids), 0) > 50 then
    raise exception 'Too many add-ons chosen' using errcode = '22023';
  end if;

  -- every chosen id must be an optional line (with an id) of this document
  select count(*) into v_bad
    from unnest(coalesce(p_addon_ids, '{}'::text[])) as x(id)
   where not exists (
     select 1 from jsonb_array_elements(v_lines) as l(value)
      where jsonb_typeof(l.value) = 'object'
        and lower(btrim(coalesce(l.value ->> 'optional', ''))) = 'true'
        and jsonb_typeof(l.value -> 'id') = 'string' and length(l.value ->> 'id') between 1 and 100
        and l.value ->> 'id' = x.id);
  if v_bad > 0 then
    raise exception 'Choose from the optional add-ons of this estimate' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x.id order by x.id), '{}'::text[]) into v_ids
    from unnest(coalesce(p_addon_ids, '{}'::text[])) as x(id);

  -- selected = chosen, on every optional line with an id; everything else as stored (private fields included)
  select coalesce(jsonb_agg(
           case when jsonb_typeof(l.value) = 'object'
                     and lower(btrim(coalesce(l.value ->> 'optional', ''))) = 'true'
                     and jsonb_typeof(l.value -> 'id') = 'string' and length(l.value ->> 'id') between 1 and 100
                then l.value || jsonb_build_object('selected', (l.value ->> 'id') = any (v_ids))
                else l.value end
           order by l.ord), '[]'::jsonb) into v_out
    from jsonb_array_elements(v_lines) with ordinality as l(value, ord);

  return jsonb_build_object(
    'clientAddonChoice', jsonb_strip_nulls(jsonb_build_object(
      'ids', to_jsonb(v_ids),
      'by', 'client',
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'name', p_signer_name)),
    'lineItems', v_out);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 2. Sign with add-ons: portal (/?portal=<key>)
-- -------------------------------------------------------------------------------------
create or replace function public.sign_document_addons_via_portal(
  p_key text, p_doc_id uuid, p_addon_ids text[], p_signature text, p_signer_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_doc    public.documents%rowtype;
  v_name   text;
  v_patch  jsonb;
  v_result jsonb;
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

  v_name := coalesce(public._clean_text(p_signer_name, 200), v_client.name);
  v_patch := public._estimate_addon_patch(v_doc, p_addon_ids, v_name);
  update public.documents set data = data || v_patch where id = v_doc.id;

  v_result := public._apply_client_decision(v_doc.id, true, p_signature, v_name, null);
  return v_result || jsonb_build_object('addon_ids', v_patch -> 'clientAddonChoice' -> 'ids');
end;
$$;

-- -------------------------------------------------------------------------------------
-- 3. Sign with add-ons: approval link (/?approval_token=<documents.public_token>)
-- -------------------------------------------------------------------------------------
create or replace function public.approve_document_addons_by_token(
  doc_token uuid, p_addon_ids text[], p_signature text, p_signer_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc    public.documents%rowtype;
  v_name   text;
  v_patch  jsonb;
  v_result jsonb;
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

  v_name := coalesce(public._clean_text(p_signer_name, 200), public._clean_text(v_doc.data->>'clientName', 200), 'Client');
  v_patch := public._estimate_addon_patch(v_doc, p_addon_ids, v_name);
  update public.documents set data = data || v_patch where id = v_doc.id;

  v_result := public._apply_client_decision(v_doc.id, true, p_signature, v_name, null);
  return v_result || jsonb_build_object('addon_ids', v_patch -> 'clientAddonChoice' -> 'ids');
end;
$$;

-- -------------------------------------------------------------------------------------
-- 4. Documents: write guards (20261114000100 version; two additions marked "add-ons")
-- -------------------------------------------------------------------------------------
create or replace function public.guard_document_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k              text;
  v_browser      boolean := current_user in ('authenticated', 'anon');
  v_old_status   text;
  v_new_status   text;
  v_old_declined text;
  v_sig_restored boolean := false;
begin
  if new.data ? '__lightweight' then
    raise exception 'Refusing to save an incomplete document (list stub). Reload the document and try again.'
      using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if v_browser then
      new.approval_expires_at := null;
      new.approval_used_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if v_browser then
    new.approval_expires_at := old.approval_expires_at;
    new.approval_used_at := old.approval_used_at;
    v_old_status := lower(btrim(coalesce(old.data->>'status', '')));

    -- client signature: keys a save leaves out are kept (and so is the status the signature set)
    -- options: the client's pick (clientOptionChoice) is kept the same way
    -- add-ons: the client's add-on choice (clientAddonChoice) too
    foreach k in array array['clientSignatureUrl', 'clientSignedAt', 'clientSignerName', 'clientSignedBy', 'clientOptionChoice', 'clientAddonChoice']
    loop
      if (old.data ? k) and not (new.data ? k) then
        new.data := new.data || jsonb_build_object(k, old.data -> k);
        if k in ('clientSignatureUrl', 'clientSignedAt') and coalesce(old.data->>k, '') <> '' then
          v_sig_restored := true;
        end if;
      end if;
    end loop;
    if v_sig_restored and v_old_status in ('accepted', 'approved') then
      new.data := new.data || jsonb_build_object('status', old.data -> 'status');
    end if;

    -- signature removed on purpose ("Revise -> Unlock": keys saved as ''): the client may sign again with the same link
    if (coalesce(old.data->>'clientSignatureUrl', '') <> '' or coalesce(old.data->>'clientSignedAt', '') <> '')
       and coalesce(new.data->>'clientSignatureUrl', '') = '' and coalesce(new.data->>'clientSignedAt', '') = '' then
      new.approval_used_at := null;
      -- options: the pick belonged to that signature
      new.data := new.data - 'clientOptionChoice';
      -- add-ons: so did the add-on choice
      new.data := new.data - 'clientAddonChoice';
    end if;

    -- client decline: a save can't set, change or erase it
    v_old_declined := coalesce(old.data->>'clientDeclinedAt', '');
    if (new.data -> 'clientDeclinedAt') is distinct from (old.data -> 'clientDeclinedAt') then
      -- e.g. a form opened before the client declined: put the decline back, with its Rejected status
      foreach k in array array['clientDeclinedAt', 'clientDeclineReason']
      loop
        if old.data ? k then
          new.data := new.data || jsonb_build_object(k, old.data -> k);
        else
          new.data := new.data - k;
        end if;
      end loop;
      if v_old_declined <> '' and v_old_status in ('rejected', 'declined') then
        new.data := new.data || jsonb_build_object('status', old.data -> 'status');
      end if;
    else
      if (new.data -> 'clientDeclineReason') is distinct from (old.data -> 'clientDeclineReason') then
        if old.data ? 'clientDeclineReason' then
          new.data := new.data || jsonb_build_object('clientDeclineReason', old.data -> 'clientDeclineReason');
        else
          new.data := new.data - 'clientDeclineReason';
        end if;
      end if;
      v_new_status := lower(btrim(coalesce(new.data->>'status', '')));
      -- the contractor re-sent the declined document (its status changed, from a form that knows the decline)
      if v_old_declined <> '' and v_new_status not in ('rejected', 'declined')
         and v_new_status is distinct from v_old_status then
        new.data := new.data || jsonb_build_object('clientDeclinedAt', '', 'clientDeclineReason', '');
        new.approval_used_at := null;
      end if;
    end if;

    v_new_status := lower(btrim(coalesce(new.data->>'status', '')));
    if new.public_token is distinct from old.public_token then
      -- a new link: never used, no end date
      new.approval_expires_at := null;
      new.approval_used_at := null;
    elsif v_new_status = 'sent' and v_old_status is distinct from 'sent' then
      -- sent (again): the link works with no end date
      new.approval_expires_at := null;
    end if;
  end if;
  return new;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 5. Stock: lines a document consumes (20261112000200 version; one addition marked "add-ons")
-- -------------------------------------------------------------------------------------
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
      -- add-ons: an optional line the client / contractor did not take (selected not true) takes no stock
      and not (lower(btrim(coalesce(li.value->>'optional', ''))) = 'true'
               and lower(btrim(coalesce(li.value->>'selected', ''))) <> 'true')
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

-- -------------------------------------------------------------------------------------
-- 6. Privileges (default-deny like 20261112000300; the two signing functions are public like the existing ones)
-- -------------------------------------------------------------------------------------
revoke all on function public._estimate_addon_patch(public.documents, text[], text)                  from public, anon, authenticated;
revoke all on function public.guard_document_write()                                                  from public, anon, authenticated;
revoke all on function public._document_stock_lines(uuid, text, jsonb)                                from public, anon, authenticated;
revoke all on function public.sign_document_addons_via_portal(text, uuid, text[], text, text)         from public, anon, authenticated;
revoke all on function public.approve_document_addons_by_token(uuid, text[], text, text)              from public, anon, authenticated;
grant execute on function public.sign_document_addons_via_portal(text, uuid, text[], text, text) to anon, authenticated;
grant execute on function public.approve_document_addons_by_token(uuid, text[], text, text)      to anon, authenticated;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------------------------------
-- Check after applying (read-only):
--   select proname, prosecdef from pg_proc where proname in ('sign_document_addons_via_portal',
--     'approve_document_addons_by_token', '_estimate_addon_patch', '_document_stock_lines', 'guard_document_write');
-- Note: the stock change takes effect for a job the next time one of its documents is saved (the inventory trigger
-- re-syncs that job): an accepted estimate's unselected add-on lines linked to stock are then given back.
-- Rollback (functions only): drop the two new signing functions and _estimate_addon_patch, and re-run the
-- guard_document_write block of 20261114000100_estimate_options_choice.sql and the _document_stock_lines block of
-- 20261112000200_portal_forum_inventory.sql (+ their revoke lines).
-- =====================================================================================
