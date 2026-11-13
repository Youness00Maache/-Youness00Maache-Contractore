-- ContractorDocs local seed (runs after migrations on `supabase db reset`).
-- Intentionally contains NO real data: users, jobs, clients and documents are created through the
-- app or by supabase/tests/db-tests.mjs (local auth admin API). Nothing here is ever pushed to
-- production (`supabase db push` does not run seed files).
select 1;
