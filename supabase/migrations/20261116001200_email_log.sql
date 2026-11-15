-- Applied 2026-11-15 with the owner's OK ("Yes, approve all", roadmap D11) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: RLS on, owner SELECT + DELETE policies only, anon has no access, trigger cleans text / drops foreign links / clears the error on a sent row, a bogus kind is refused, trigger function not executable by anon.
-- =====================================================================================
-- ContractorDocs: sent-email log (competitor roadmap D11, #4 job communication timeline, #46 Gmail)
--
-- One row per email the `gmail` edge function tried to send from the owner's own Gmail (documents, review requests,
-- job updates, payment thank-yous, papers, bookkeeper exports...). The job timeline and the client's screen show
-- "Estimate E-1042 emailed to jane@... (subject ...)". Reminder emails are NOT here: the `reminders` function keeps
-- its own record in public.reminders.
--
-- PRIVACY: only who / what / when is stored (recipient, subject, kind, linked job / client / document, status,
-- a short error, Gmail's message id). NEVER the message body, attachments or any token.
--
-- Rows are written ONLY by the `gmail` edge function (service role). The owner can read and delete their own rows;
-- the browser cannot insert or edit them.
--
-- ADDITIVE ONLY: one new table, its indexes, one trigger function. No existing table, row, function or policy is
-- changed. Runs top to bottom; safe to run twice.
--
-- Objects
--   email_log            the log (owner RLS: select + delete own rows)
--   guard_email_log()    cleans text, drops links to jobs / clients / documents that are not the same owner's,
--                        keeps the newest 5000 rows per user
--
-- Rollback: drop table public.email_log; drop function public.guard_email_log();
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Table
-- -------------------------------------------------------------------------------------
create table if not exists public.email_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id            uuid references public.jobs(id) on delete set null,
  client_id         uuid references public.clients(id) on delete set null,
  document_id       uuid references public.documents(id) on delete set null,
  kind              text not null default 'other'
                    check (kind in ('document', 'purchase_order', 'review_request', 'job_update', 'payment', 'paper', 'export', 'other')),
  to_email          text not null check (length(to_email) between 1 and 254),
  subject           text not null default '' check (length(subject) <= 300),
  status            text not null check (status in ('sent', 'failed')),
  error             text check (error is null or length(error) <= 300),
  gmail_message_id  text check (gmail_message_id is null or length(gmail_message_id) <= 100),
  sent_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
comment on table public.email_log is 'Emails sent from the app through the owner''s Gmail (who / what / when only; no body, no attachments, no tokens). Written by the gmail edge function.';

create index if not exists idx_email_log_user_job on public.email_log (user_id, job_id, sent_at desc);
create index if not exists idx_email_log_user_client on public.email_log (user_id, client_id, sent_at desc);
create index if not exists idx_email_log_document on public.email_log (document_id);
create index if not exists idx_email_log_user_sent on public.email_log (user_id, sent_at desc);

-- -------------------------------------------------------------------------------------
-- B. Write guard (runs for the edge function's inserts)
-- -------------------------------------------------------------------------------------
create or replace function public.guard_email_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- one line each, trimmed, within the limits (control characters become spaces)
  new.to_email := left(btrim(regexp_replace(coalesce(new.to_email, ''), '[[:cntrl:]]+', ' ', 'g')), 254);
  if new.to_email = '' then
    new.to_email := '(unknown)';
  end if;
  new.subject := left(btrim(regexp_replace(coalesce(new.subject, ''), '[[:cntrl:]]+', ' ', 'g')), 300);
  new.error := nullif(left(btrim(regexp_replace(coalesce(new.error, ''), '[[:cntrl:]]+', ' ', 'g')), 300), '');
  new.gmail_message_id := nullif(left(btrim(coalesce(new.gmail_message_id, '')), 100), '');
  if new.status = 'sent' then
    new.error := null;
  end if;
  if new.sent_at is null or new.sent_at > now() + interval '5 minutes' then
    new.sent_at := now();
  end if;

  -- links must point at the same owner's rows (else they are dropped, the row is still kept)
  if new.job_id is not null and not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id) then
    new.job_id := null;
  end if;
  if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.user_id = new.user_id) then
    new.client_id := null;
  end if;
  if new.document_id is not null and not exists (select 1 from public.documents d where d.id = new.document_id and d.user_id = new.user_id) then
    new.document_id := null;
  end if;

  -- keep the newest 5000 rows per user (this one included): one short index scan on (user_id, sent_at desc)
  delete from public.email_log e
   where e.user_id = new.user_id
     and e.id in (select x.id from public.email_log x
                   where x.user_id = new.user_id
                   order by x.sent_at desc, x.id desc
                   offset 4999);
  return new;
end;
$$;

drop trigger if exists trg_email_log_guard on public.email_log;
create trigger trg_email_log_guard before insert on public.email_log
  for each row execute function public.guard_email_log();

-- -------------------------------------------------------------------------------------
-- C. Row level security + table privileges (owner: read + delete own rows; writes = service role only)
-- -------------------------------------------------------------------------------------
alter table public.email_log enable row level security;

drop policy if exists email_log_select_own on public.email_log;
drop policy if exists email_log_delete_own on public.email_log;
create policy email_log_select_own on public.email_log for select to authenticated
  using (user_id = (select auth.uid()));
create policy email_log_delete_own on public.email_log for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.email_log from anon;
revoke all on public.email_log from authenticated;
grant select, delete on public.email_log to authenticated;
grant all on public.email_log to service_role;

-- -------------------------------------------------------------------------------------
-- D. Function privileges (trigger only)
-- -------------------------------------------------------------------------------------
revoke all on function public.guard_email_log() from public, anon, authenticated;

notify pgrst, 'reload schema';
