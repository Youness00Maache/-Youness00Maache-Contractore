-- =====================================================================================
-- DRAFT FOR THE OWNER'S OK. Not in supabase/migrations, NOT applied.
-- Good / better / best options on estimates (#6): the client picks ONE option and signs, and the database stores
-- the pick as data (instead of inside the signer's name, which is what the app does until this is applied).
--
-- Functions only: 2 NEW signing functions + 1 new internal helper + guard_document_write replaced (same signature,
-- trigger unchanged). No table / column change and NO existing row is modified by this file.
--
--   _estimate_option_patch            NEW (internal) checks the option and builds the data patch: clientOptionChoice
--                                     + lineItems = the chosen option's lines + the lines in every option, with their
--                                     private fields (unit cost, inventory links) put back from estimateOptionsInternal
--   sign_document_option_via_portal   NEW  = sign_document_via_portal  + p_option_id   (/?portal=<key>)
--   approve_document_option_by_token  NEW  = approve_document_by_token + p_option_id   (/?approval_token=<token>)
--   guard_document_write              = 20261113000600 version + clientOptionChoice is kept like the signature keys
--                                       (a stale form can't drop it) and removed when the signature is removed on
--                                       purpose ("Revise -> Unlock")
--
-- The app is already ready (lib/estimateOptions.ts planChoiceSigning, components/DocumentApprovalView.tsx
-- signWithOption): it calls the new functions first and, while they don't exist (PGRST202), signs with the existing
-- functions and writes the pick in the signer's name: "Jane Doe (chose B: Better)". Both forms are read by the app.
--
-- Data written (documents.data):
--   clientOptionChoice = {"optionId": "...", "optionName": "Better", "by": "client", "at": "<utc iso>", "name": "<signer>"}
--   lineItems          = chosen option's lines + shared lines (so invoices, stock, pipeline, emails use the choice)
--   + the usual signature keys / status Accepted written by _apply_client_decision (unchanged)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Option patch (internal)
-- -------------------------------------------------------------------------------------
create or replace function public._estimate_option_patch(p_doc public.documents, p_option_id text, p_signer_name text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_set    jsonb := p_doc.data -> 'estimateOptions';
  v_option jsonb;
  v_lines  jsonb;
begin
  if p_doc.type <> 'Estimate' or coalesce(jsonb_typeof(v_set), '') <> 'object'
     or coalesce(jsonb_typeof(v_set -> 'options'), '') <> 'array' then
    raise exception 'This estimate has no options to choose from' using errcode = '22023';
  end if;
  if coalesce(v_set ->> 'appliedId', '') <> '' then
    raise exception 'An option was already applied to this estimate' using errcode = '23505';
  end if;
  if p_option_id is null or length(p_option_id) > 100 then
    raise exception 'Choose one of the options' using errcode = '22023';
  end if;

  select o.value into v_option
    from jsonb_array_elements(v_set -> 'options') as o(value)
   where jsonb_typeof(o.value) = 'object' and o.value ->> 'id' = p_option_id
   limit 1;
  if v_option is null then
    raise exception 'Choose one of the options' using errcode = '22023';
  end if;

  -- the option's lines, then the lines in every option; private fields back from estimateOptionsInternal
  select coalesce(jsonb_agg(x.line order by x.part, x.ord), '[]'::jsonb) into v_lines
    from (
      select 0 as part, l.ord,
             l.value || coalesce(p_doc.data -> 'estimateOptionsInternal' -> (l.value ->> 'id'), '{}'::jsonb) as line
        from jsonb_array_elements(case when jsonb_typeof(v_option -> 'lineItems') = 'array' then v_option -> 'lineItems' else '[]'::jsonb end)
             with ordinality as l(value, ord)
       where jsonb_typeof(l.value) = 'object'
      union all
      select 1 as part, l.ord,
             l.value || coalesce(p_doc.data -> 'estimateOptionsInternal' -> (l.value ->> 'id'), '{}'::jsonb) as line
        from jsonb_array_elements(case when jsonb_typeof(v_set -> 'sharedLineItems') = 'array' then v_set -> 'sharedLineItems' else '[]'::jsonb end)
             with ordinality as l(value, ord)
       where jsonb_typeof(l.value) = 'object'
    ) x;

  return jsonb_build_object(
    'clientOptionChoice', jsonb_strip_nulls(jsonb_build_object(
      'optionId', p_option_id,
      'optionName', left(coalesce(v_option ->> 'name', ''), 40),
      'by', 'client',
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'name', p_signer_name)),
    'lineItems', v_lines);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 2. Sign with an option: portal (/?portal=<key>)
-- -------------------------------------------------------------------------------------
create or replace function public.sign_document_option_via_portal(
  p_key text, p_doc_id uuid, p_option_id text, p_signature text, p_signer_name text default null)
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
  v_patch := public._estimate_option_patch(v_doc, p_option_id, v_name);
  update public.documents set data = data || v_patch where id = v_doc.id;

  v_result := public._apply_client_decision(v_doc.id, true, p_signature, v_name, null);
  return v_result || jsonb_build_object('option_id', p_option_id);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 3. Sign with an option: approval link (/?approval_token=<documents.public_token>)
-- -------------------------------------------------------------------------------------
create or replace function public.approve_document_option_by_token(
  doc_token uuid, p_option_id text, p_signature text, p_signer_name text default null)
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
  v_patch := public._estimate_option_patch(v_doc, p_option_id, v_name);
  update public.documents set data = data || v_patch where id = v_doc.id;

  v_result := public._apply_client_decision(v_doc.id, true, p_signature, v_name, null);
  return v_result || jsonb_build_object('option_id', p_option_id);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 4. Documents: write guards (20261113000600 version; two additions marked "options")
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
    foreach k in array array['clientSignatureUrl', 'clientSignedAt', 'clientSignerName', 'clientSignedBy', 'clientOptionChoice']
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
-- 5. Privileges (default-deny like 20261112000300; the two signing functions are public like the existing ones)
-- -------------------------------------------------------------------------------------
revoke all on function public._estimate_option_patch(public.documents, text, text)                   from public, anon, authenticated;
revoke all on function public.guard_document_write()                                                  from public, anon, authenticated;
revoke all on function public.sign_document_option_via_portal(text, uuid, text, text, text)          from public, anon, authenticated;
revoke all on function public.approve_document_option_by_token(uuid, text, text, text)               from public, anon, authenticated;
grant execute on function public.sign_document_option_via_portal(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.approve_document_option_by_token(uuid, text, text, text)      to anon, authenticated;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------------------------------
-- Check after applying (read-only):
--   select proname from pg_proc where proname in ('sign_document_option_via_portal', 'approve_document_option_by_token',
--                                                 '_estimate_option_patch');
-- Rollback (functions only): drop the two new functions and _estimate_option_patch, and re-run the
-- guard_document_write block of supabase/migrations/20261113000600_portal_approval_fixes.sql.
-- -------------------------------------------------------------------------------------
