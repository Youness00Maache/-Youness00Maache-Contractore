-- =====================================================================================
-- ContractorDocs: "get paid" features (NEXT_STEPS 0c: pay link, "I've paid", review request, financing link)
--
-- Additive only: new nullable columns, one index, one trigger and two public RPCs. No existing row is changed
-- (the new columns start empty) and no existing function is replaced.
--
--   profiles   default_pay_link, default_pay_link_label   contractor's own PayPal / Square / Venmo / Stripe / bank link,
--                                                         copied onto every new invoice (editable per invoice)
--              financing_link, financing_min_amount       financing partner link shown on estimates above the amount
--              google_review_link, review_auto_send       review request after "Mark as paid" (Premium)
--   documents  payment_reported_at, payment_report_note, payment_report_amount
--              set by the client with "I've paid" (portal key or approval-link token), cleared by the
--              contractor's "Mark as paid". A trigger mirrors them into data (paymentReportedAt / paymentReportNote /
--              paymentReportAmount) so the existing portal/approval RPCs and the app's list queries see them, and a
--              form saved from a stale copy can't drop them.
--   RPCs       report_payment_via_portal(p_key, p_doc_id, p_note, p_amount)   (anon, authenticated)
--              report_payment_by_token(doc_token, p_note, p_amount)           (anon, authenticated)
--              Same security pattern as sign_document_via_portal / approve_document_by_token: SECURITY DEFINER,
--              the key/token is the credential, only invoices the client can already see, whitelisted output.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Profile settings
-- -------------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists default_pay_link text
    check (default_pay_link is null or (length(default_pay_link) <= 2000 and default_pay_link ~* '^https?://')),
  add column if not exists default_pay_link_label text
    check (default_pay_link_label is null or length(default_pay_link_label) <= 60),
  add column if not exists financing_link text
    check (financing_link is null or (length(financing_link) <= 2000 and financing_link ~* '^https://')),
  add column if not exists financing_min_amount numeric(12,2)
    check (financing_min_amount is null or financing_min_amount >= 0),
  add column if not exists google_review_link text
    check (google_review_link is null or (length(google_review_link) <= 2000 and google_review_link ~* '^https://')),
  add column if not exists review_auto_send boolean not null default false;

comment on column public.profiles.default_pay_link is 'Contractor''s own payment page (PayPal.me, Square, Venmo, Stripe Payment Link, bank page). Copied onto new invoices.';
comment on column public.profiles.financing_link is 'Financing partner application link (Wisetack, Hearth, GoodLeap, local lender). Shown on estimates >= financing_min_amount.';
comment on column public.profiles.google_review_link is 'Google review link used in the review request sent after an invoice is marked paid (Premium).';

-- -------------------------------------------------------------------------------------
-- 2. "I've paid" reported by the client
-- -------------------------------------------------------------------------------------
alter table public.documents
  add column if not exists payment_reported_at timestamptz,
  add column if not exists payment_report_note text
    check (payment_report_note is null or length(payment_report_note) <= 500),
  add column if not exists payment_report_amount numeric(12,2)
    check (payment_report_amount is null or payment_report_amount >= 0);

-- dashboard: "payments reported by clients" (only rows with a report are indexed)
create index if not exists idx_documents_payment_reported
  on public.documents (user_id, payment_reported_at desc)
  where payment_reported_at is not null;

-- Keeps data.paymentReportedAt / paymentReportNote / paymentReportAmount equal to the columns on every write:
--  * the public RPCs only set the columns;
--  * a contractor saving an invoice form opened before the report can't erase it (the keys are put back);
--  * "Mark as paid" clears the columns, which removes the keys;
--  * a duplicated document (insert) never inherits a report.
create or replace function public.sync_document_payment_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data := coalesce(new.data, '{}'::jsonb) - array['paymentReportedAt', 'paymentReportNote', 'paymentReportAmount'];
  if new.payment_reported_at is not null then
    new.data := new.data || jsonb_strip_nulls(jsonb_build_object(
      'paymentReportedAt', to_char(new.payment_reported_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'paymentReportNote', new.payment_report_note,
      'paymentReportAmount', new.payment_report_amount));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_payment_report on public.documents;
create trigger trg_documents_payment_report
  before insert or update on public.documents
  for each row execute function public.sync_document_payment_report();

-- Shared checks before a client reports a payment (raises with messages the UI classifies)
create or replace function public._assert_invoice_payable(p_doc public.documents)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status text := lower(coalesce(p_doc.data->>'status', ''));
begin
  if p_doc.type <> 'Invoice' or v_status = 'draft' then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if v_status = 'paid' then
    raise exception 'This invoice is already marked as paid' using errcode = '23505';
  end if;
  if v_status in ('cancelled', 'canceled', 'void') then
    raise exception 'This invoice was cancelled' using errcode = 'P0001';
  end if;
end;
$$;

-- Writes the report on a locked invoice row. Repeated clicks within a minute keep the first report.
create or replace function public._apply_payment_report(p_doc_id uuid, p_note text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  update public.documents
     set payment_reported_at = now(),
         payment_report_note = p_note,
         payment_report_amount = case when p_amount > 0 and p_amount < 10000000000 then round(p_amount, 2) end
   where id = p_doc_id
     and (payment_reported_at is null or payment_reported_at < now() - interval '1 minute')
  returning payment_reported_at into v_at;

  if v_at is null then
    select payment_reported_at into v_at from public.documents where id = p_doc_id;
  end if;

  return jsonb_build_object('success', true,
                            'reported_at', to_char(v_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

-- /?portal=<key>: "I've paid" on one of the client's invoices
create or replace function public.report_payment_via_portal(
  p_key text, p_doc_id uuid, p_note text default null, p_amount numeric default null)
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
  perform public._assert_invoice_payable(v_doc);

  return public._apply_payment_report(v_doc.id, public._clean_text(p_note, 500), p_amount);
end;
$$;

-- /?approval_token=<documents.public_token>: "I've paid" on the invoice behind the link
create or replace function public.report_payment_by_token(
  doc_token uuid, p_note text default null, p_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where public_token = doc_token for update;
  if not found or not public._client_visible_type(v_doc.type) then
    raise exception 'Approval link not found or no longer valid' using errcode = 'P0002';
  end if;
  -- same rule as get_document_by_token: an expired link no longer accepts anything
  if v_doc.approval_expires_at is not null and v_doc.approval_expires_at < now()
     and v_doc.approval_used_at is null then
    raise exception 'This approval link has expired' using errcode = 'P0001';
  end if;
  perform public._assert_invoice_payable(v_doc);

  return public._apply_payment_report(v_doc.id, public._clean_text(p_note, 500), p_amount);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 3. Privileges (default-deny like 20261112000300, then explicit grants)
-- -------------------------------------------------------------------------------------
revoke all on function public.sync_document_payment_report()                     from public, anon, authenticated;
revoke all on function public._assert_invoice_payable(public.documents)           from public, anon, authenticated;
revoke all on function public._apply_payment_report(uuid, text, numeric)          from public, anon, authenticated;
revoke all on function public.report_payment_via_portal(text, uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.report_payment_by_token(uuid, text, numeric)        from public, anon, authenticated;

grant execute on function public.report_payment_via_portal(text, uuid, text, numeric) to anon, authenticated;
grant execute on function public.report_payment_by_token(uuid, text, numeric)        to anon, authenticated;

notify pgrst, 'reload schema';
