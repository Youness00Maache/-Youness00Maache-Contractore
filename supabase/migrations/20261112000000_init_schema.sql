-- =====================================================================================
-- ContractorDocs: baseline schema for a FRESH Supabase project (part 1/4: tables + RLS)
--
-- Conventions
--   * snake_case columns; documents.data is the camelCase form JSON.
--   * Every table has RLS. Owner-only policies use (select auth.uid()) (evaluated once per query).
--   * anon has NO table privileges at all: the public portal/approval pages use SECURITY DEFINER RPCs.
--   * Billing/credit columns on profiles are written only by the service role / trusted functions
--     (trigger in part 2).
--   * Function EXECUTE privileges are reset at the end of part 4 (default-deny, explicit grants).
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- -------------------------------------------------------------------------------------
-- Generic helpers
-- -------------------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -------------------------------------------------------------------------------------
-- profiles (1 row per auth user, created by trigger on auth.users, see part 2)
-- -------------------------------------------------------------------------------------
create table public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text,
  name                     text,
  company_name             text,
  logo_url                 text,
  profile_picture_url      text,
  address                  text,
  phone                    text,
  website                  text,
  job_title                text,
  language                 text not null default 'English',
  email_templates          jsonb not null default '{}'::jsonb,
  theme                    text not null default 'light',
  default_labor_rate       numeric(12,2),
  default_signature_url    text,
  -- billing (service role only; see protect_profile_billing_columns)
  subscription_tier        text not null default 'free'
                           check (subscription_tier in ('free', 'premium', 'ai')),
  subscription_status      text not null default 'none'
                           check (subscription_status in ('active', 'past_due', 'cancelled', 'paused', 'none')),
  subscription_period_end  timestamptz,
  subscription_cancel_at   timestamptz,
  kelviq_customer_id       text,
  kelviq_subscription_id   text,
  billing_updated_at       timestamptz,
  ai_credits_used          integer not null default 0,
  ai_credits_period_start  date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
comment on table public.profiles is 'One row per user. Billing columns are written only by kelviq-webhook (service role).';

create trigger tr_profiles_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- clients
-- -------------------------------------------------------------------------------------
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  email       text,
  phone       text,
  address     text,
  notes       text,
  -- unguessable key for /?portal=<key> (128 random bits); owners may regenerate it
  portal_key  text not null default encode(extensions.gen_random_bytes(16), 'hex')
              check (portal_key ~ '^[A-Za-z0-9_-]{32,128}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint clients_portal_key_key unique (portal_key)
);
create trigger tr_clients_updated_at before update on public.clients
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- jobs
-- -------------------------------------------------------------------------------------
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  client_id       uuid references public.clients(id) on delete set null,
  client_name     text,
  client_address  text,
  start_date      date,
  end_date        date,
  status          text not null default 'active',
  worker_name     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger tr_jobs_updated_at before update on public.jobs
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- documents (12 types; data = camelCase form JSON)
-- -------------------------------------------------------------------------------------
create table public.documents (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id                uuid not null references public.jobs(id) on delete cascade,
  client_id             uuid references public.clients(id) on delete set null,
  type                  text not null,
  data                  jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  -- approval link token (/?approval_token=<public_token>); owners may regenerate it
  public_token          uuid not null default gen_random_uuid(),
  approval_expires_at   timestamptz,
  approval_used_at      timestamptz,
  has_client_signature  boolean generated always as (coalesce(data->>'clientSignatureUrl', '') <> '') stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint documents_public_token_key unique (public_token)
);
create trigger tr_documents_updated_at before update on public.documents
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- Price book
-- -------------------------------------------------------------------------------------
create table public.price_book_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.price_book_categories(id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.saved_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  rate            numeric(14,2) not null default 0,
  unit_cost       numeric(14,2) not null default 0,
  unit            text,
  category        text default 'General',
  category_id     uuid references public.price_book_categories(id) on delete set null,
  type            text not null default 'service',
  images          jsonb not null default '[]'::jsonb,
  taxable         boolean not null default true,
  sku             text,
  markup          numeric(8,2) not null default 0,
  is_assembly     boolean not null default false,
  assembly_items  jsonb not null default '[]'::jsonb,
  is_favorite     boolean not null default false,
  last_used_at    timestamptz,
  use_count       integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger tr_saved_items_updated_at before update on public.saved_items
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- Inventory. quantity changes ONLY through adjust_inventory / checkout_inventory / the
-- document trigger (the browser has no UPDATE privilege on quantity).
-- -------------------------------------------------------------------------------------
create table public.inventory (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                 text not null,
  quantity             numeric(14,3) not null default 0,
  category             text,
  unit                 text,
  cost_price           numeric(14,2) not null default 0,
  supplier             text,
  location             text,
  sku                  text,
  low_stock_threshold  numeric(14,3) not null default 5,
  is_assembly          boolean not null default false,
  assembly_items       jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger tr_inventory_updated_at before update on public.inventory
  for each row execute function public.handle_updated_at();

-- Every stock movement. Rows with document_id are the document ledger: the current allocation of a
-- document line is -sum(quantity_change) over (document_id, line_key, item_id).
create table public.inventory_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  item_id          uuid references public.inventory(id) on delete set null,
  item_name        text,
  action           text not null,
  quantity_change  numeric(14,3) not null,
  quantity_after   numeric(14,3),
  notes            text,
  job_id           uuid references public.jobs(id) on delete set null,
  document_id      uuid,          -- no FK on purpose: the ledger outlives deleted documents
  line_key         text,
  source           text not null default 'manual' check (source in ('manual', 'document', 'kit', 'initial')),
  created_at       timestamptz not null default now()
);

-- -------------------------------------------------------------------------------------
-- AI chat history
-- -------------------------------------------------------------------------------------
create table public.ai_chat_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default 'New chat',
  messages    jsonb not null default '[]'::jsonb,
  scope       text not null default 'dashboard',
  scope_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger tr_ai_chat_history_updated_at before update on public.ai_chat_history
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- Gmail (COMMS contract). Tokens never reach the browser.
-- -------------------------------------------------------------------------------------
create table public.user_gmail_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  gmail_address   text not null,
  display_name    text,
  is_default      boolean not null default false,
  status          text not null default 'active' check (status in ('active', 'needs_reconnect')),
  granted_scopes  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint user_gmail_accounts_user_gmail_key unique (user_id, gmail_address)
);
create trigger tr_user_gmail_accounts_updated_at before update on public.user_gmail_accounts
  for each row execute function public.handle_updated_at();

create table public.gmail_tokens (
  account_id               uuid primary key references public.user_gmail_accounts(id) on delete cascade,
  refresh_token_encrypted  text,
  access_token             text,
  access_token_expires_at  timestamptz,
  updated_at               timestamptz not null default now()
);
create trigger tr_gmail_tokens_updated_at before update on public.gmail_tokens
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- Usage (emails, AI requests, created jobs/documents) and billing webhook log
-- -------------------------------------------------------------------------------------
create table public.usage_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind ~ '^[a-z_]{2,32}$'),
  ref_id      uuid,                 -- job id for kind='document'
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create table public.billing_events (
  id           text primary key,     -- Kelviq event id (= webhook-id header)
  type         text not null,
  user_id      uuid references auth.users(id) on delete set null,
  test         boolean not null default false,
  status       text not null default 'received',   -- received | processed | ignored | unmatched | stale | test | error
  detail       text,
  payload      jsonb not null,
  attempts     integer not null default 1,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- -------------------------------------------------------------------------------------
-- Forum + notifications (FKs to profiles so PostgREST embeds resolve)
-- -------------------------------------------------------------------------------------
create table public.forum_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 300),
  content      text check (content is null or length(content) <= 20000),
  category     text not null default 'General',
  image_url    text,
  youtube_url  text,
  upvotes      integer not null default 0,
  downvotes    integer not null default 0,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger tr_forum_posts_updated_at before update on public.forum_posts
  for each row execute function public.handle_updated_at();

create table public.forum_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.forum_posts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content     text check (content is null or length(content) <= 10000),
  image_url   text,
  upvotes     integer not null default 0,
  downvotes   integer not null default 0,
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger tr_forum_comments_updated_at before update on public.forum_comments
  for each row execute function public.handle_updated_at();

create table public.forum_votes (
  post_id     uuid not null references public.forum_posts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  vote_type   text not null check (vote_type in ('up', 'down')),
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.forum_comment_votes (
  comment_id  uuid not null references public.forum_comments(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  vote_type   text not null check (vote_type in ('up', 'down')),
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table public.forum_reports (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid references public.forum_posts(id) on delete cascade,
  comment_id   uuid references public.forum_comments(id) on delete cascade,
  reporter_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason       text check (reason is null or length(reason) <= 1000),
  created_at   timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1)
);
create unique index forum_reports_once_key on public.forum_reports
  (reporter_id, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
                coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  source_user_id  uuid references public.profiles(id) on delete cascade,
  type            text not null,
  post_id         uuid references public.forum_posts(id) on delete cascade,
  comment_id      uuid references public.forum_comments(id) on delete cascade,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Public author info for the forum (profiles itself is owner-only). Owner-rights view on purpose:
-- it exposes only id, name and avatar, and only to signed-in users.
create view public.forum_authors with (security_invoker = false) as
  select p.id, coalesce(nullif(btrim(p.name), ''), 'Member') as name, p.profile_picture_url
  from public.profiles p;

-- =====================================================================================
-- Indexes (every common filter / order / FK)
-- =====================================================================================
create index idx_clients_user_name             on public.clients (user_id, name);
create index idx_clients_user_created          on public.clients (user_id, created_at desc);
create index idx_jobs_user_created             on public.jobs (user_id, created_at desc);
create index idx_jobs_user_status              on public.jobs (user_id, status);
create index idx_jobs_user_client_name         on public.jobs (user_id, client_name);
create index idx_jobs_client_id                on public.jobs (client_id) where client_id is not null;
create index idx_documents_user_created        on public.documents (user_id, created_at desc);
create index idx_documents_user_job_created    on public.documents (user_id, job_id, created_at desc);
create index idx_documents_job_id              on public.documents (job_id);
create index idx_documents_client_id           on public.documents (client_id) where client_id is not null;
create index idx_documents_user_type           on public.documents (user_id, type);
create index idx_documents_user_client_name    on public.documents (user_id, (data->>'clientName'));
create unique index documents_recurrence_period_key on public.documents
  ((data->>'recurrenceSourceId'), (data->>'recurrencePeriod')) where (data ? 'recurrenceSourceId');
create index idx_documents_recurring_invoices  on public.documents (user_id)
  where type = 'Invoice' and (data->'recurrence'->>'enabled') = 'true';
create index idx_price_book_categories_user    on public.price_book_categories (user_id, sort_order);
create index idx_saved_items_user_name         on public.saved_items (user_id, name);
create index idx_saved_items_user_favorite     on public.saved_items (user_id) where is_favorite;
create index idx_saved_items_user_last_used    on public.saved_items (user_id, last_used_at desc nulls last);
create index idx_inventory_user_name           on public.inventory (user_id, name);
create index idx_inventory_history_user_created on public.inventory_history (user_id, created_at desc);
create index idx_inventory_history_item        on public.inventory_history (item_id, created_at desc);
create index idx_inventory_history_job         on public.inventory_history (job_id) where job_id is not null;
create index idx_inventory_history_doc_line    on public.inventory_history (document_id, line_key, item_id) where document_id is not null;
create index idx_ai_chat_history_user_created  on public.ai_chat_history (user_id, created_at desc);
create index idx_ai_chat_history_user_scope    on public.ai_chat_history (user_id, scope, scope_id);
create index idx_user_gmail_accounts_user      on public.user_gmail_accounts (user_id);
create index idx_usage_events_user_kind_created on public.usage_events (user_id, kind, created_at desc);
create index idx_usage_events_doc_job          on public.usage_events (user_id, ref_id, created_at desc) where kind = 'document';
create index idx_billing_events_user           on public.billing_events (user_id, received_at desc);
create index idx_profiles_kelviq_customer      on public.profiles (kelviq_customer_id) where kelviq_customer_id is not null;
create index idx_profiles_kelviq_subscription  on public.profiles (kelviq_subscription_id) where kelviq_subscription_id is not null;
create index idx_profiles_lapsed               on public.profiles (subscription_period_end)
  where subscription_tier <> 'free' and subscription_status in ('cancelled', 'paused');
create index idx_forum_posts_category_created  on public.forum_posts (category, created_at desc);
create index idx_forum_posts_created           on public.forum_posts (created_at desc);
create index idx_forum_posts_user              on public.forum_posts (user_id);
create index idx_forum_comments_post_created   on public.forum_comments (post_id, created_at);
create index idx_forum_comments_user           on public.forum_comments (user_id);
create index idx_forum_votes_user              on public.forum_votes (user_id);
create index idx_forum_comment_votes_user      on public.forum_comment_votes (user_id);
create index idx_forum_reports_post            on public.forum_reports (post_id) where post_id is not null;
create index idx_forum_reports_comment         on public.forum_reports (comment_id) where comment_id is not null;
create index idx_notifications_user_unread     on public.notifications (user_id, is_read, created_at desc);
create index idx_notifications_post            on public.notifications (post_id) where post_id is not null;

-- =====================================================================================
-- Row Level Security
-- =====================================================================================
alter table public.profiles              enable row level security;
alter table public.clients               enable row level security;
alter table public.jobs                  enable row level security;
alter table public.documents             enable row level security;
alter table public.price_book_categories enable row level security;
alter table public.saved_items           enable row level security;
alter table public.inventory             enable row level security;
alter table public.inventory_history     enable row level security;
alter table public.ai_chat_history       enable row level security;
alter table public.user_gmail_accounts   enable row level security;
alter table public.gmail_tokens          enable row level security;
alter table public.usage_events          enable row level security;
alter table public.billing_events        enable row level security;
alter table public.forum_posts           enable row level security;
alter table public.forum_comments        enable row level security;
alter table public.forum_votes           enable row level security;
alter table public.forum_comment_votes   enable row level security;
alter table public.forum_reports         enable row level security;
alter table public.notifications         enable row level security;

-- profiles: only the owner, never delete from the browser
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- owner-only tables (user_id column)
do $$
declare t text;
begin
  foreach t in array array['clients', 'jobs', 'documents', 'price_book_categories', 'saved_items', 'inventory',
                           'ai_chat_history']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;

-- read-only for the owner (written by functions / service role)
create policy inventory_history_select_own on public.inventory_history for select to authenticated
  using (user_id = (select auth.uid()));
create policy usage_events_select_own on public.usage_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_gmail_accounts_select_own on public.user_gmail_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_gmail_accounts_delete_own on public.user_gmail_accounts for delete to authenticated
  using (user_id = (select auth.uid()));
-- gmail_tokens, billing_events: RLS on, no policies => service role only.

-- forum: every signed-in user reads (hidden rows only for their author); authors write their own rows
create policy forum_posts_select on public.forum_posts for select to authenticated
  using (not is_hidden or user_id = (select auth.uid()));
create policy forum_posts_insert_own on public.forum_posts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy forum_posts_update_own on public.forum_posts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy forum_posts_delete_own on public.forum_posts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy forum_comments_select on public.forum_comments for select to authenticated
  using (not is_hidden or user_id = (select auth.uid()));
create policy forum_comments_insert_own on public.forum_comments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy forum_comments_update_own on public.forum_comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy forum_comments_delete_own on public.forum_comments for delete to authenticated
  using (user_id = (select auth.uid()));

-- votes: a user sees and changes only their own votes (counters are maintained by triggers)
create policy forum_votes_own on public.forum_votes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy forum_comment_votes_own on public.forum_comment_votes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- reports: insert only (no reading other people's reports)
create policy forum_reports_insert_own on public.forum_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- notifications: recipients read / mark read / delete; nobody inserts from the browser
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- =====================================================================================
-- Table privileges (Supabase grants ALL to anon/authenticated by default; tighten it)
-- =====================================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- server-only tables
revoke all on public.gmail_tokens, public.billing_events from authenticated;

-- read-only for the browser (written by SECURITY DEFINER functions)
revoke insert, update, delete, truncate on public.inventory_history, public.usage_events from authenticated;

-- gmail accounts: list + disconnect only (the gmail-auth function writes them)
revoke insert, update, truncate on public.user_gmail_accounts from authenticated;

-- inventory: stock is never written by the browser (only name/details)
revoke update on public.inventory from authenticated;
grant update (name, category, unit, cost_price, supplier, location, sku, low_stock_threshold,
              is_assembly, assembly_items) on public.inventory to authenticated;

-- forum: counters and moderation flags are server-managed
revoke update on public.forum_posts, public.forum_comments from authenticated;
grant update (title, content, category, image_url, youtube_url) on public.forum_posts to authenticated;
grant update (content, image_url) on public.forum_comments to authenticated;
revoke update, delete on public.forum_reports from authenticated;

-- notifications: created server-side only, recipients may only flip is_read
revoke insert, update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- no truncate from the API roles
revoke truncate on all tables in schema public from authenticated;

-- forum author view: signed-in users only
revoke all on public.forum_authors from anon, authenticated;
grant select on public.forum_authors to authenticated;
