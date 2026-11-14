-- Applied 2026-11-14 with the owner's OK ("Yes, approve all", roadmap D4) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: RLS on both tables, 8 owner policies, 3 saved_items columns, 3 triggers, definer function with search_path '', no anon grants.
-- =====================================================================================
-- ContractorDocs: suppliers + product library (competitor roadmap D4, gaps #10, #13, #25)
--
-- Real supplier records (until now the supplier list was a small JSON list in the user's settings; that list stays
-- as it is and is copied in once by the app, matched by legacy_key), a per-supplier product catalogue with its price
-- history (price-change flags are computed by the app: lib/suppliers/priceChange.ts), and three optional
-- product-library fields on price-book items (saved_items): a product link, specs and a preferred supplier.
--
-- ADDITIVE ONLY: two new tables, their triggers, one function, three new nullable columns on saved_items. No existing
-- row, column, function or policy is changed or removed. Old purchase orders keep their vendor text; old price-book
-- items keep working (the new columns are empty).
--
-- Objects
--   suppliers                one row per supplier (owner RLS: full access to own rows); archived instead of deleted
--   supplier_items           a supplier's products: sku, name, unit, unit price, link, optional price-book item link;
--                            price_history jsonb = [{price, at}] oldest first (last 100), written ONLY by the trigger
--   guard_supplier_item()    same-owner supplier / price-book item, price history + last_price_at on every price change
--   saved_items.url / specs / supplier_id     (ADD COLUMN IF NOT EXISTS, nothing else on saved_items)
--
-- Rollback (owner only): alter table public.saved_items drop column supplier_id, drop column specs, drop column url;
--   drop function public.guard_supplier_item(); drop table public.supplier_items, public.suppliers;
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  contact_name    text check (contact_name is null or length(contact_name) <= 120),
  email           text check (email is null or length(email) <= 254),
  phone           text check (phone is null or length(phone) <= 40),
  address         text check (address is null or length(address) <= 300),
  website         text check (website is null or length(website) <= 500),
  account_number  text check (account_number is null or length(account_number) <= 60),
  payment_terms   text check (payment_terms is null or length(payment_terms) <= 120),
  notes           text check (notes is null or length(notes) <= 2000),
  lead_time_days  integer check (lead_time_days is null or lead_time_days between 0 and 365),
  preferred       boolean not null default false,
  archived        boolean not null default false,
  -- id of the entry in the old settings supplier list this row was imported from (import runs once, idempotent)
  legacy_key      text check (legacy_key is null or length(legacy_key) <= 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.suppliers is 'Suppliers (roadmap D4). The old settings supplier list stays; rows imported from it carry legacy_key. See lib/suppliers/.';

create unique index if not exists uq_suppliers_user_legacy_key on public.suppliers (user_id, legacy_key) where legacy_key is not null;
create index if not exists idx_suppliers_user_name on public.suppliers (user_id, archived, name);

create table if not exists public.supplier_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  saved_item_id   uuid references public.saved_items(id) on delete set null,
  sku             text check (sku is null or length(sku) <= 80),
  name            text not null check (length(btrim(name)) between 1 and 300),
  unit            text check (unit is null or length(unit) <= 40),
  unit_price      numeric(14,4) not null default 0 check (unit_price >= 0 and unit_price < 100000000),
  url             text check (url is null or length(url) <= 1000),
  notes           text check (notes is null or length(notes) <= 2000),
  last_price_at   timestamptz,
  price_history   jsonb not null default '[]'::jsonb check (jsonb_typeof(price_history) = 'array'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.supplier_items is 'A supplier''s products and prices (roadmap D4). price_history is written by guard_supplier_item() only.';

create index if not exists idx_supplier_items_user_supplier on public.supplier_items (user_id, supplier_id, name);
create index if not exists idx_supplier_items_supplier on public.supplier_items (supplier_id);
create index if not exists idx_supplier_items_saved_item on public.supplier_items (saved_item_id) where saved_item_id is not null;

drop trigger if exists tr_suppliers_updated_at on public.suppliers;
create trigger tr_suppliers_updated_at before update on public.suppliers
  for each row execute function public.handle_updated_at();
drop trigger if exists tr_supplier_items_updated_at on public.supplier_items;
create trigger tr_supplier_items_updated_at before update on public.supplier_items
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- B. Product-library fields on price-book items (saved_items): ADD COLUMN IF NOT EXISTS only
-- -------------------------------------------------------------------------------------
alter table public.saved_items add column if not exists url text;
alter table public.saved_items add column if not exists specs jsonb;
alter table public.saved_items add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

-- -------------------------------------------------------------------------------------
-- C. Write guard + price history
--    Same-owner supplier (else refused) and price-book item (else the link is dropped). price_history and
--    last_price_at are never taken from the browser: the first price on insert, then one entry per price change.
-- -------------------------------------------------------------------------------------
create or replace function public.guard_supplier_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hist jsonb;
  v_len  integer;
begin
  if not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.user_id = new.user_id) then
    raise exception 'Supplier not found' using errcode = '23503', detail = 'supplier_items.supplier_id must belong to the same user';
  end if;
  if new.saved_item_id is not null and not exists (
       select 1 from public.saved_items i where i.id = new.saved_item_id and i.user_id = new.user_id) then
    new.saved_item_id := null;
  end if;

  new.name := btrim(new.name);
  new.sku := nullif(btrim(coalesce(new.sku, '')), '');
  new.unit := nullif(btrim(coalesce(new.unit, '')), '');
  new.url := nullif(btrim(coalesce(new.url, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');

  if tg_op = 'INSERT' then
    new.price_history := jsonb_build_array(jsonb_build_object('price', new.unit_price, 'at', now()));
    new.last_price_at := now();
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'A supplier item cannot change owner' using errcode = '42501';
    end if;
    new.price_history := coalesce(old.price_history, '[]'::jsonb);
    new.last_price_at := old.last_price_at;
    if new.unit_price is distinct from old.unit_price then
      v_hist := new.price_history || jsonb_build_array(jsonb_build_object('price', new.unit_price, 'at', now()));
      v_len := jsonb_array_length(v_hist);
      if v_len > 100 then
        select coalesce(jsonb_agg(t.e order by t.o), '[]'::jsonb) into v_hist
        from jsonb_array_elements(v_hist) with ordinality as t(e, o)
        where t.o > v_len - 100;
      end if;
      new.price_history := v_hist;
      new.last_price_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_supplier_items_guard on public.supplier_items;
create trigger trg_supplier_items_guard before insert or update on public.supplier_items
  for each row execute function public.guard_supplier_item();

-- -------------------------------------------------------------------------------------
-- D. Row level security + table privileges (owner full access to own rows)
-- -------------------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.supplier_items enable row level security;

drop policy if exists suppliers_select_own on public.suppliers;
drop policy if exists suppliers_insert_own on public.suppliers;
drop policy if exists suppliers_update_own on public.suppliers;
drop policy if exists suppliers_delete_own on public.suppliers;
create policy suppliers_select_own on public.suppliers for select to authenticated
  using (user_id = (select auth.uid()));
create policy suppliers_insert_own on public.suppliers for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy suppliers_update_own on public.suppliers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy suppliers_delete_own on public.suppliers for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists supplier_items_select_own on public.supplier_items;
drop policy if exists supplier_items_insert_own on public.supplier_items;
drop policy if exists supplier_items_update_own on public.supplier_items;
drop policy if exists supplier_items_delete_own on public.supplier_items;
create policy supplier_items_select_own on public.supplier_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy supplier_items_insert_own on public.supplier_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy supplier_items_update_own on public.supplier_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy supplier_items_delete_own on public.supplier_items for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.suppliers, public.supplier_items from anon;
revoke truncate on public.suppliers, public.supplier_items from authenticated;
grant select, insert, update, delete on public.suppliers, public.supplier_items to authenticated;
grant all on public.suppliers, public.supplier_items to service_role;

-- -------------------------------------------------------------------------------------
-- E. Function privileges (trigger only: nobody calls it directly)
-- -------------------------------------------------------------------------------------
revoke all on function public.guard_supplier_item() from public, anon, authenticated;

notify pgrst, 'reload schema';
