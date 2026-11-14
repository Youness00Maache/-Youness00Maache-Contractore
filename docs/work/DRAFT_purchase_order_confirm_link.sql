-- =====================================================================================
-- DRAFT FOR THE OWNER'S OK. Not in supabase/migrations, NOT applied.
-- Supplier ordering (#21): the supplier opens a purchase order sent with "Send to supplier" through the EXISTING
-- approval link (/?approval_token=<documents.public_token>) and confirms it ("Confirm order") or says it can't fill
-- it, with the EXISTING approve_document_by_token / decline_document_by_token functions.
--
-- Functions only (create or replace, same signatures, privileges kept). No table/column change, no row modified.
-- The app is already ready: lib/suppliersApi.ts supplierConfirmLink() checks get_document_by_token and adds the
-- link to the "Send to supplier" email as soon as this is applied; DocumentApprovalView words it for orders.
-- =====================================================================================

-- 1. A purchase order's state on the link: open while Draft / Sent; supplier confirmed = signed; can't fill =
--    declined; Received / Cancelled / already received into stock = view only. Other types: unchanged (0600).
create or replace function public._client_doc_state(p_doc public.documents)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_doc.type = 'Purchase Order' then
      case
        when lower(btrim(coalesce(p_doc.data->>'status', ''))) in ('accepted', 'approved')
          or coalesce(p_doc.data->>'clientSignatureUrl', '') <> ''
          or coalesce(p_doc.data->>'clientSignedAt', '') <> '' then 'signed'
        when lower(btrim(coalesce(p_doc.data->>'status', ''))) in ('rejected', 'declined')
          or coalesce(p_doc.data->>'clientDeclinedAt', '') <> '' then 'declined'
        when lower(btrim(coalesce(p_doc.data->>'status', ''))) in ('received', 'cancelled', 'canceled')
          or (p_doc.data ? 'internalStockReceipt') then 'readonly'
        else 'open'
      end
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

-- 2. The approval link also serves purchase orders (only change vs 0600: "or v_doc.type = 'Purchase Order'").
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
  if not found or not (public._client_visible_type(v_doc.type) or v_doc.type = 'Purchase Order') then
    raise exception 'Approval link not found or no longer valid' using errcode = 'P0002';
  end if;
  v_expired := v_doc.approval_expires_at is not null and v_doc.approval_expires_at < now();
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
      'can_sign', v_state = 'open' and v_doc.approval_used_at is null and not v_expired));
end;
$$;

-- 3. Purchase orders never belong to a client's portal, so the portal sign / decline / "I've paid" functions can't
--    reach them (only change vs 0600: "and d.type <> 'Purchase Order'").
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
    and d.type <> 'Purchase Order'
    and (
      d.client_id = c.id
      or (d.client_id is null and j.client_id = c.id)
      or (d.client_id is null and j.client_id is null
          and btrim(c.name) <> ''
          and lower(btrim(c.name)) in (lower(btrim(coalesce(d.data->>'clientName', ''))),
                                       lower(btrim(coalesce(j.client_name, '')))))
    );
$$;

revoke all on function public._client_doc_state(public.documents) from public, anon, authenticated;
revoke all on function public._client_document_ids(uuid)           from public, anon, authenticated;
grant execute on function public.get_document_by_token(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- Effects to know:
--  * approve_document_by_token sets the PO's status to 'Accepted' + the supplier's name/signature/time; the PO form
--    shows "Confirmed by <name>". decline sets 'Rejected' + reason ("<vendor> can't fill it: <reason>").
--  * the confirmation also sets viewedByProvider = false, so it shows with the other client decisions (Clients
--    badge / Activity) until opened.
--  * line items on the supplier page keep the order price (rate); internal keys (internalStockReceipt,
--    internalReorder, unitCost, supplier) are stripped by _client_safe_doc_data as for every document.
