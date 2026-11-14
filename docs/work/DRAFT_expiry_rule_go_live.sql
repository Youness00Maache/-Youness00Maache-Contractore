-- DRAFT, NOT APPLIED. Needs the owner's OK before it runs in production (project iauteblvljppwzsxloyd).
--
-- What it changes: the "valid until" date stops online signing only for documents created AFTER the cut-off;
-- older documents (made by the original app, which had no such rule) can still be signed after their date.
-- Today the cut-off is 2026-11-13 00:00 UTC (migration 20261113000600). But the original app stayed live until the
-- new site went live on 2026-11-14 ~15:00 UTC, so estimates clients received from the old app during those 39 hours
-- would now refuse a signature once their "valid until" date passes. This moves the cut-off to the go-live moment.
--
-- One function body only: no table, row, policy or grant changes (create or replace keeps the existing grants:
-- execute stays revoked from public / anon / authenticated, as set in 20261113000600).
--
-- Apply together with the app constant (same commit): utils/clientPortalRules.ts
--   export const EXPIRY_RULE_START = '2026-11-14T15:00:00Z';
-- and point scripts/portal-approval-check.ts "migration: same expiry cut-off as the app" at the new migration file.
-- When applied: move this file to supabase/migrations/20261115000500_expiry_rule_go_live.sql with the header
-- "-- Applied <date> with the owner's OK".
--
-- Rollback: the same statement with timestamptz '2026-11-13 00:00:00+00'.

create or replace function public._expiry_rule_start()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select timestamptz '2026-11-14 15:00:00+00';
$$;
