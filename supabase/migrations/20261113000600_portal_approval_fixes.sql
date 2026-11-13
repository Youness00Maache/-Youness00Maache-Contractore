-- =====================================================================================
-- ContractorDocs: client portal & approval links work like the original app (docs/work/PARITY_V2.md A1-A5, A7, A8)
--
-- Functions only (create or replace, same signatures, privileges kept). No table/column change and NO existing
-- row is modified by this file.
--
--   _client_visible_type      + Receipt: a shared receipt link opens (view only), receipts show in the portal (A3)
--   _client_document_ids      document client_id, else job client_id, else the client's NAME compared trimmed and
--                             case-insensitively with the document's clientName OR the job's client_name, so a
--                             client created later ("QA Client") sees the older documents of that name (A1)
--   _expiry_rule_start        NEW  documents created before this instant never expire for signing (old app) (A2)
--   _signing_blocked_by_expiry NEW "valid until" passed (new documents only, one day of grace for time zones)
--   _client_doc_state         NEW  readonly / signed / declined / expired / open; Approved counts as signed (A7)
--   _assert_document_open     uses _client_doc_state (sign/decline via portal and via link)
--   get_portal_data           Drafts stay hidden, every other status (and no status) shows; up to 1000 documents;
--                             each document carries its `state` (A1, A8)
--   get_document_by_token     every client-facing type, view only unless it is an open estimate / change order;
--                             returns `state` and `link.can_sign` (A3, A5)
--   guard_document_write      * approval links no longer get an automatic 60-day expiry (null = never expires, as
--                               in the old app); a new token or re-sending (status -> Sent) clears it (A5)
--                             * a declined estimate / change order re-sent by the contractor (status changed from
--                               Rejected by a save that carries that decline) is open again: decline cleared, the
--                               same link and the portal accept a new answer (A4)
--                             * a signature removed with "Revise -> Unlock" also re-arms the link
--                             * a save from a form opened before the client answered can't undo the answer
--                               (decline keys and the Rejected / Accepted status are put back)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Types a client may see
-- -------------------------------------------------------------------------------------
create or replace function public._client_visible_type(p_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('Invoice', 'Estimate', 'Change Order', 'Work Order', 'Daily Job Report', 'Warranty', 'Receipt');
$$;

-- -------------------------------------------------------------------------------------
-- 2. Documents of a client (scoped to the client's contractor)
--    linked by documents.client_id; else by the job's client_id; rows linked to neither fall back to the
--    client's name, trimmed and case-insensitive, against the document's clientName or the job's client_name.
-- -------------------------------------------------------------------------------------
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
  left join public.jobs j on j.id = d.job_id and j.user_id = d.user_id
  where c.id = p_client_id
    and (
      d.client_id = c.id
      or (d.client_id is null and j.client_id = c.id)
      or (d.client_id is null and j.client_id is null
          and btrim(c.name) <> ''
          and lower(btrim(c.name)) in (lower(btrim(coalesce(d.data->>'clientName', ''))),
                                       lower(btrim(coalesce(j.client_name, '')))))
    );
$$;

-- -------------------------------------------------------------------------------------
-- 3. Signing state
-- -------------------------------------------------------------------------------------
-- Documents created before this instant come from the original app, which never enforced the "valid until"
-- date. Same instant as EXPIRY_RULE_START in utils/clientPortalRules.ts.
create or replace function public._expiry_rule_start()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select timestamptz '2026-11-13 00:00:00+00';
$$;

-- The "valid until" date (data.expiryDate) stops online signing: new documents only, and a date is valid through
-- the end of that day wherever the client is (one day of grace on the UTC calendar). Unreadable dates never block.
create or replace function public._signing_blocked_by_expiry(p_doc public.documents)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_expiry text := btrim(coalesce(p_doc.data->>'expiryDate', ''));
  v_date   date;
begin
  if p_doc.created_at < public._expiry_rule_start() then
    return false;
  end if;
  if v_expiry !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then
    return false;
  end if;
  begin
    v_date := left(v_expiry, 10)::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    return false;
  end;
  return v_date < (now() at time zone 'utc')::date - 1;
end;
$$;

-- readonly (not an estimate / change order) | signed | declined | expired | open
create or replace function public._client_doc_state(p_doc public.documents)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when not public._signable_type(p_doc.type) then 'readonly'
    when lower(btrim(coalesce(p_doc.data->>'status', ''))) in ('accepted', 'approved')
      or coalesce(p_doc.data->>'clientSignatureUrl', '') <> ''
      or coalesce(p_doc.data->>'clientSignedAt', '') <> '' then 'signed'
    when lower(btrim(coalesce(p_doc.data->>'status', ''))) in ('rejected', 'declined')
      or coalesce(p_doc.data->>'clientDeclinedAt', '') <> '' then 'declined'
    when public._signing_blocked_by_expiry(p_doc) then 'expired'
    else 'open'
  end;
$$;

-- Shared state checks before a client signs / declines (raises with the messages the UI classifies)
create or replace function public._assert_document_open(p_doc public.documents)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  case public._client_doc_state(p_doc)
    when 'readonly' then
      raise exception 'Document not found or not available for online approval' using errcode = 'P0002';
    when 'signed' then
      raise exception 'This document was already signed' using errcode = '23505';
    when 'declined' then
      raise exception 'This document was already declined' using errcode = '23505';
    when 'expired' then
      raise exception 'This estimate has expired' using errcode = 'P0001';
    else
      null;
  end case;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 4. /?portal=<key>: Drafts stay hidden; documents without a status and every other status show
-- -------------------------------------------------------------------------------------
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
               'id', x.id, 'type', x.type, 'job_id', x.job_id, 'created_at', x.created_at,
               'data', public._client_safe_doc_data(x.data),
               'state', x.state)
             order by x.created_at desc)
      from (
        select d.id, d.type, d.job_id, d.created_at, d.data, public._client_doc_state(d) as state
        from public.documents d
        where d.id in (select public._client_document_ids(v_client.id))
          and public._client_visible_type(d.type)
          and coalesce(d.data->>'status', '') <> 'Draft'
        order by d.created_at desc
        limit 1000
      ) x
    ), '[]'::jsonb));
end;
$$;

-- -------------------------------------------------------------------------------------
-- 5. /?approval_token=<documents.public_token>: every client-facing type (view only), signing for open
--    estimates / change orders. Links with no expiry date never expire.
-- -------------------------------------------------------------------------------------
create or replace function public.get_document_by_token(doc_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc     public.documents%rowtype;
  v_state   text;
  v_expired boolean;
begin
  select * into v_doc from public.documents where public_token = doc_token;
  if not found or not public._client_visible_type(v_doc.type) then
    raise exception 'Approval link not found or no longer valid' using errcode = 'P0002';
  end if;
  v_expired := v_doc.approval_expires_at is not null and v_doc.approval_expires_at < now();
  -- an unsigned document behind an expired link is not shown; signed/declined ones stay viewable
  if v_expired and v_doc.approval_used_at is null then
    raise exception 'This approval link has expired' using errcode = 'P0001';
  end if;
  v_state := public._client_doc_state(v_doc);

  return jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_doc.id, 'type', v_doc.type, 'job_id', v_doc.job_id, 'created_at', v_doc.created_at,
      'data', public._client_safe_doc_data(v_doc.data),
      'state', v_state),
    'contractor', public._contractor_public_info(v_doc.user_id),
    'link', jsonb_build_object(
      'expires_at', v_doc.approval_expires_at,
      'used_at', v_doc.approval_used_at,
      -- same conditions as approve_document_by_token / decline_document_by_token
      'can_sign', v_state = 'open' and v_doc.approval_used_at is null and not v_expired));
end;
$$;

-- -------------------------------------------------------------------------------------
-- 6. Documents: write guards
--   * refuse to save a lightweight list stub as a document (DB-001 / CORE-001 data loss)
--   * the client's answer belongs to the client: a save from a form opened before the client signed / declined
--     keeps the signature / decline and the status it set
--   * re-sending a declined estimate / change order (the contractor changes the status of the declined document)
--     opens it again: decline cleared, link usable again
--   * approval links have no automatic expiry (null = never expires, like the original app); the browser can't set
--     the expiry / used columns itself; a new token or re-sending clears an expiry
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
    foreach k in array array['clientSignatureUrl', 'clientSignedAt', 'clientSignerName', 'clientSignedBy']
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
-- 7. Privileges: replaced functions keep theirs; the new helpers are internal (default-deny like 20261112000300)
-- -------------------------------------------------------------------------------------
revoke all on function public._expiry_rule_start()                         from public, anon, authenticated;
revoke all on function public._signing_blocked_by_expiry(public.documents) from public, anon, authenticated;
revoke all on function public._client_doc_state(public.documents)         from public, anon, authenticated;
revoke all on function public._client_visible_type(text)                   from public, anon, authenticated;
revoke all on function public._client_document_ids(uuid)                   from public, anon, authenticated;
revoke all on function public._assert_document_open(public.documents)     from public, anon, authenticated;
revoke all on function public.guard_document_write()                       from public, anon, authenticated;

-- public client pages (no login), unchanged
grant execute on function public.get_portal_data(text)       to anon, authenticated;
grant execute on function public.get_document_by_token(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
