-- =====================================================================================
-- ContractorDocs: user data that used to live only in the browser now belongs to the account.
--
-- Owner report (2026-11-13): "I save a profit calculation, log out and log back in, and it's gone."
-- Saved profit calculations were kept in localStorage (`profit_calcs`) and the logout cleanup wiped them.
-- They now live in the account; the browser keeps only a cache plus not-yet-uploaded items.
--
-- ADDITIVE ONLY: two new tables. No existing table, column or row is changed.
--
-- Objects
--   profit_calculations   saved profit-calculator calculations (owner RLS)
--   user_settings         small account-level preferences, one row per (user, key) (owner RLS)
--                         keys in use: 'labels.sheet' (label sheet chosen in Print labels)
--
-- The default labor rate and the default signature use the existing profiles.default_labor_rate /
-- profiles.default_signature_url columns (no change here).
--
-- The app works before this migration is applied: it keeps these items on the device and uploads them
-- automatically (one time) the first time it can reach these tables (lib/userData.ts).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Saved profit calculations
-- -------------------------------------------------------------------------------------
create table if not exists public.profit_calculations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 120),
  -- [{ id, description, cost, charge }]
  items        jsonb not null default '[]'::jsonb
               check (jsonb_typeof(items) = 'array' and length(items::text) <= 200000),
  tax_enabled  boolean not null default false,
  tax_rate     numeric(7,3) not null default 0 check (tax_rate between 0 and 100),
  -- margin % at save time (shown in the list only; the calculator recomputes it from the items)
  margin       numeric(14,4) not null default 0,
  -- when the user saved it (kept from the device copy when an older calculation is uploaded)
  saved_at     timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profit_calculations is 'Saved profit-calculator calculations (components/ProfitCalculatorView.tsx, lib/userData.ts).';

create index if not exists idx_profit_calculations_user on public.profit_calculations (user_id, saved_at desc);

drop trigger if exists tr_profit_calculations_updated_at on public.profit_calculations;
create trigger tr_profit_calculations_updated_at before update on public.profit_calculations
  for each row execute function public.handle_updated_at();

alter table public.profit_calculations enable row level security;

drop policy if exists profit_calculations_select_own on public.profit_calculations;
drop policy if exists profit_calculations_insert_own on public.profit_calculations;
drop policy if exists profit_calculations_update_own on public.profit_calculations;
drop policy if exists profit_calculations_delete_own on public.profit_calculations;
create policy profit_calculations_select_own on public.profit_calculations for select to authenticated
  using (user_id = (select auth.uid()));
create policy profit_calculations_insert_own on public.profit_calculations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profit_calculations_update_own on public.profit_calculations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profit_calculations_delete_own on public.profit_calculations for delete to authenticated
  using (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------------------
-- B. Small account-level preferences (key -> jsonb value)
-- -------------------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_.:-]{1,64}$'),
  value       jsonb not null default 'null'::jsonb check (length(value::text) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);
comment on table public.user_settings is 'Account-level preferences that follow the user to every device (lib/userData.ts). Device-only UI state stays in the browser.';

drop trigger if exists tr_user_settings_updated_at on public.user_settings;
create trigger tr_user_settings_updated_at before update on public.user_settings
  for each row execute function public.handle_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists user_settings_select_own on public.user_settings;
drop policy if exists user_settings_insert_own on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;
drop policy if exists user_settings_delete_own on public.user_settings;
create policy user_settings_select_own on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_insert_own on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_settings_delete_own on public.user_settings for delete to authenticated
  using (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------------------
-- C. Privileges (Supabase grants everything to anon/authenticated on new tables by default)
-- -------------------------------------------------------------------------------------
revoke all on public.profit_calculations, public.user_settings from anon;
revoke truncate on public.profit_calculations, public.user_settings from authenticated;
grant select, insert, update, delete on public.profit_calculations, public.user_settings to authenticated;
