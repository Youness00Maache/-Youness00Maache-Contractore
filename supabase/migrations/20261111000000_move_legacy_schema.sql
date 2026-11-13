-- =====================================================================================
-- ContractorDocs part 0: existing databases.
--
-- On a FRESH project this migration does nothing.
--
-- If the database already contains an OLD ContractorDocs schema (created by the old App.tsx setup
-- script / supabase/legacy-sql/*.sql), everything the app owns in schema `public` is moved, intact,
-- into schema `legacy_backup` (tables with their data, indexes, triggers and policies, views,
-- sequences, functions, types). Nothing is dropped except legacy triggers on auth.users / storage
-- and legacy storage policies for the app buckets, which would otherwise stay active next to the
-- new ones (permissive policies are OR-ed). The next migrations then create the new schema and
-- 20261112000400_import_legacy_data.sql copies the data across.
--
-- Rollback: the old objects are untouched in legacy_backup (see docs/work/BACKEND_NOTES.md).
-- =====================================================================================
do $migration$
declare
  r record;
  v_app_tables constant text[] := array['profiles', 'clients', 'jobs', 'documents', 'saved_items', 'inventory',
                                        'inventory_history', 'ai_chat_history', 'user_gmail_accounts', 'forum_posts'];
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = any (v_app_tables)) then
    raise notice 'No legacy ContractorDocs schema found: nothing to move.';
    return;
  end if;
  if exists (select 1 from pg_namespace where nspname = 'legacy_backup') then
    raise exception 'Schema legacy_backup already exists. Rename or drop it before applying the ContractorDocs migrations.';
  end if;

  raise notice 'Legacy ContractorDocs schema found: moving public.* to legacy_backup';
  create schema legacy_backup;
  comment on schema legacy_backup is 'Old ContractorDocs schema moved aside by migration 20261111000000 (read-only backup).';

  -- 1. legacy triggers on Supabase-managed tables that call public functions
  for r in
    select t.tgname, tn.nspname as tbl_schema, tc.relname as tbl
    from pg_trigger t
    join pg_class tc on tc.oid = t.tgrelid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where not t.tgisinternal and tn.nspname in ('auth', 'storage') and pn.nspname = 'public'
  loop
    execute format('drop trigger %I on %I.%I', r.tgname, r.tbl_schema, r.tbl);
  end loop;

  -- 2. legacy storage policies for the app buckets (e.g. "Allow users to upload their own logo": any path)
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(logos|forum|price-book-images|signatures|document-assets)'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;

  -- 3. relations (tables carry their indexes, constraints, triggers, policies and owned sequences)
  for r in
    select c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
      and not (c.relkind in ('r', 'p') and c.relispartition)
  loop
    execute format(case r.relkind
                     when 'v' then 'alter view public.%I set schema legacy_backup'
                     when 'm' then 'alter materialized view public.%I set schema legacy_backup'
                     when 'f' then 'alter foreign table public.%I set schema legacy_backup'
                     else 'alter table public.%I set schema legacy_backup' end, r.relname);
  end loop;

  -- 4. free-standing sequences
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype in ('e', 'a', 'i'))
  loop
    execute format('alter sequence public.%I set schema legacy_backup', r.relname);
  end loop;

  -- 5. functions / procedures
  for r in
    select p.oid::regprocedure as sig, p.prokind
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if r.prokind = 'a' then
      execute format('alter aggregate %s set schema legacy_backup', r.sig);
    else
      execute format('alter routine %s set schema legacy_backup', r.sig);
    end if;
  end loop;

  -- 6. free-standing types (enums, domains, composite types)
  for r in
    select t.typname, t.typtype
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype in ('e', 'd', 'c', 'r')
      and (t.typtype <> 'c' or exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'))
      and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop
    execute format(case when r.typtype = 'd' then 'alter domain public.%I set schema legacy_backup'
                        else 'alter type public.%I set schema legacy_backup' end, r.typname);
  end loop;

  -- 7. the backup is never reachable from the API
  revoke all on schema legacy_backup from public, anon, authenticated;
  revoke all on all tables in schema legacy_backup from public, anon, authenticated;
  revoke all on all functions in schema legacy_backup from public, anon, authenticated;
  revoke all on all sequences in schema legacy_backup from public, anon, authenticated;
end
$migration$;
