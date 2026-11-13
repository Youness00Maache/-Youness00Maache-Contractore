# ContractorDocs backend: deploy & operations notes

Owner: BACKEND. Everything below uses placeholders. **Never paste real keys into the repo, chat or tickets.**

## 1. What is in `supabase/`

| Path | What |
|---|---|
| `migrations/20261111000000_move_legacy_schema.sql` | Existing databases only: moves an OLD ContractorDocs schema from `public` into `legacy_backup` (no-op on a fresh project) |
| `migrations/20261112000000_init_schema.sql` | Tables, indexes, RLS policies, table/column privileges, `forum_authors` view |
| `migrations/20261112000100_accounts_billing_limits.sql` | Profile auto-creation, billing-column protection, `plan_limits()`, free-plan limit triggers, usage (`record_usage`, `consume_usage`, `consume_ai_credit`, `get_my_usage`), document write guards, `mark_documents_viewed` |
| `migrations/20261112000200_portal_forum_inventory.sql` | Client portal / approval RPCs, forum votes + notifications + moderation, inventory ledger (`adjust_inventory`, `checkout_inventory`, document trigger), recurring invoices |
| `migrations/20261112000300_billing_storage_privileges.sql` | `apply_kelviq_event()` (webhook logic), storage buckets + policies, pg_cron job, function EXECUTE privileges (default-deny) |
| `migrations/20261112000400_import_legacy_data.sql` | Existing databases only: copies data from `legacy_backup` into the new tables (no-op on a fresh project) |
| `seed.sql` | Empty on purpose (no real data) |
| `functions/kelviq-checkout` | Checkout session + signed customer-portal link (JWT required) |
| `functions/kelviq-webhook` | Kelviq webhook receiver (`verify_jwt = false`, HMAC-verified) |
| `functions/delete-account` | Account deletion (cancels Kelviq subscription, deletes files, deletes auth user) |
| `functions/_shared/` | `cors.ts`, `auth.ts` (JWT -> user, service client), `kelviq.ts` (API client, plan map, signature check) |
| `tests/db-tests.mjs`, `tests/webhook-test.mjs` | Local test suites (see section 8) |

Rule for future migrations: Postgres grants EXECUTE on new functions to everyone. Every new function in `public` must be followed by `revoke all on function ... from public, anon, authenticated;` and an explicit `grant execute ... to <role>`. Every SECURITY DEFINER function must `set search_path = ''` (or `public`) and fully qualify names.

## 2. New production project (fresh)

```bash
npx supabase login
npx supabase link --project-ref <project-ref>          # asks for the DB password
npx supabase db push --dry-run                          # lists the 6 migrations
npx supabase db push                                    # applies them (seed.sql is NOT pushed)
```

Then: secrets (section 4), functions (section 5), Auth settings (section 6), Kelviq webhook (section 7).

## 3. Existing project that already has an OLD ContractorDocs schema (ContractoreAI, ref `mrpvmszmedsjgmdyohli`)

The old schema came from a dozen contradictory SQL files (permissive policies such as "every user reads every profile", leaky SECURITY DEFINER portal functions, `quantity integer`, `images text[]`, tier values `Basic/Premium`, two inventory trigger sets). Patching it in place with `IF NOT EXISTS` would keep those old policies and functions alive next to the new ones (permissive policies are OR-ed), so the migrations do this instead, automatically and reversibly:

1. `20261111000000_move_legacy_schema.sql` detects the old tables and moves **everything the app owns in `public`** (tables with data, indexes, triggers, policies, views, sequences, functions, types) into schema `legacy_backup`. It only drops the old triggers on `auth.users`/`storage.objects` that call public functions and the old storage policies for the app buckets (they would stay active otherwise). `legacy_backup` gets no API access.
2. The normal migrations create the new schema.
3. `20261112000400_import_legacy_data.sql` copies the data (profiles, clients incl. their existing portal keys, jobs, documents incl. approval tokens, price book, inventory + history, chat history, forum, notifications, Gmail account rows), with safe casts, skipping orphans. It links jobs/documents to clients by id where the client name is unique, recomputes vote counters, writes historic creations to `usage_events` with their original dates, and records an "opening" inventory ledger for documents that already moved stock (no stock change, so the next save never deducts twice). Corrupted list stubs lose their `__lightweight` flag.
   - Billing is **not** imported (PayPal is gone): everyone starts on Free. Gmail tokens are **not** imported (they were plaintext): accounts come in as `needs_reconnect`. `user_credentials`, `ai_generated_documents`, `price_history`, `item_vendors`, `assembly_components` are not imported (unused).

Steps:

```bash
# 0. BACKUP first: Dashboard -> Database -> Backups (or)
pg_dump "postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres" -Fc -f contractoreai-before-migration.dump

# 1. Check what is there (SQL editor):
#    select tablename from pg_tables where schemaname = 'public';
#    select version from supabase_migrations.schema_migrations;   -- may not exist

npx supabase link --project-ref mrpvmszmedsjgmdyohli
npx supabase migration list            # remote-only versions (if any) must be marked reverted:
npx supabase migration repair --status reverted <old-version> [<old-version> ...]
npx supabase db push --dry-run
npx supabase db push                   # NOTICEs show "legacy import: N rows -> public.<table>"
```

Verify, then (optionally, weeks later) drop the backup: `drop schema legacy_backup cascade;`

Rollback (if something is badly wrong right after the push): restore the dump, or in SQL: drop the new objects (`drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;` plus the default grants), then `alter table legacy_backup.<t> set schema public` for each table/function. Restoring the pg_dump is simpler.

Former paying users (decide manually whether to honor them; PayPal subscriptions must be cancelled in PayPal):

```sql
select p.id, p.email, p.subscription_tier from legacy_backup.profiles p where p.subscription_tier ilike 'premium%';
-- grant manually (service role / SQL editor only; the browser cannot):
update public.profiles set subscription_tier = 'premium', subscription_status = 'active',
       subscription_period_end = now() + interval '1 year' where id = '<user-id>';
```

Note: the free-plan triggers do not apply to the SQL editor / service role.

## 4. Secrets (Edge Functions)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase automatically. Set the rest:

```bash
npx supabase secrets set \
  SITE_URL=https://www.contractordocs.app \
  KELVIQ_ENV=live \
  KELVIQ_SERVER_API_KEY=<kelviq-server-api-key> \
  KELVIQ_WEBHOOK_SECRET=<kq_whsec_... from the Kelviq webhook endpoint> \
  KELVIQ_PRODUCT_ID=45575a06-3bbc-4fe3-9151-ebfc34d19332 \
  GEMINI_API_KEY=<gemini-key> \
  GEMINI_MODEL=gemini-flash-latest \
  GOOGLE_CLIENT_ID=<google-oauth-client-id> \
  GOOGLE_CLIENT_SECRET=<google-oauth-client-secret> \
  TOKEN_ENCRYPTION_KEY=<32+ random bytes, base64; generate with: openssl rand -base64 32>
npx supabase secrets list
```

Optional (owned by AI / COMMS, defaults are fine): `AI_PROVIDER` (`gemini`; `mock` only for local tests), `AI_RATE_PER_MINUTE`, `FREE_EMAIL_LIMIT` (keep equal to `plan_limits('free')->'emails'` = 10).

`SITE_URL` drives CORS (its www/non-www twin is allowed too, plus `http://localhost:3010` / `http://127.0.0.1:3010`) and the checkout return URLs. For a sandbox test: `KELVIQ_ENV=sandbox` with sandbox keys and a sandbox webhook secret.

Frontend (Vercel env vars): see `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, `VITE_KELVIQ_ENV`, `VITE_KELVIQ_PRODUCT_ID`, optional `VITE_KELVIQ_PORTAL_URL`, `VITE_SUPPORT_EMAIL`).

## 5. Deploy the functions

```bash
npx supabase functions deploy kelviq-webhook --no-verify-jwt
npx supabase functions deploy kelviq-checkout
npx supabase functions deploy delete-account
npx supabase functions deploy gmail-auth           # COMMS
npx supabase functions deploy master-ai-router     # AI
```

`supabase/config.toml` also records `verify_jwt` per function (`kelviq-webhook = false`, all others `true`), so a plain `npx supabase functions deploy` uses the same settings. `paypal-webhook` was removed: if it is deployed on the old project, delete it (`npx supabase functions delete paypal-webhook`).

## 6. Auth settings (Dashboard -> Authentication)

- **URL Configuration**: Site URL `https://www.contractordocs.app`. Redirect URLs:
  `https://www.contractordocs.app/**`, `https://contractordocs.app/**`, `https://www.contractordocs.app/update-password`, `https://www.contractordocs.app/gmail-callback`, `https://www.contractordocs.app/auth/login`, `https://www.contractordocs.app/billing/success`, plus Vercel preview URLs if used (`https://*-<team>.vercel.app/**`) and `http://localhost:3010/**` for local testing against production (optional).
- **Providers -> Google**: enable, set the Google OAuth client id/secret; in Google Cloud Console add the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. (Gmail sending uses a separate OAuth flow through `gmail-auth` with redirect `https://www.contractordocs.app/gmail-callback`; add that to the Google client's authorized redirect URIs too and publish the consent screen "In production".)
- **Email**: confirm email on; set a custom SMTP sender for production (the built-in sender is rate limited).
- A profile row is created automatically for every new auth user (trigger `on_auth_user_created`).

## 7. Kelviq

- Webhook URL: **`https://<project-ref>.supabase.co/functions/v1/kelviq-webhook`** (for ContractoreAI: `https://mrpvmszmedsjgmdyohli.supabase.co/functions/v1/kelviq-webhook`).
- Events to subscribe: `checkout.completed`, `subscription.created`, `subscription.updated`, `subscription.plan_changed`, `subscription.cancelled`, `subscription.paused`, `subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, `order.refunded`.
- Copy the endpoint signing secret (`kq_whsec_...`) into `KELVIQ_WEBHOOK_SECRET`. "Verify endpoint" sends an unsigned POST: the function answers 401, which Kelviq treats as reachable. "Send test event" deliveries (`test: true`) are acknowledged (200) and recorded with no side effects.
- Plans: identifier `premium` -> tier `premium`, `premium-ai` -> tier `ai` (Monthly/Yearly). The Kelviq `customerId` is always the Supabase user id.
- Behaviour: `past_due` keeps access (Kelviq retries for 14 days); `subscription.cancelled` / `paused` keep access until the end of the paid period, then the tier becomes `free` (immediately if the period is over, otherwise the hourly pg_cron job `contractordocs-expire-lapsed-subscriptions`); a full refund (`order.refunded` with status `REFUNDED`) ends access immediately; events for a non-current subscription and out-of-order (older) events are ignored; every event is stored in `billing_events` (unique id => duplicates are no-ops). Kelviq retries 5xx; we return 500 only for database errors.
- Customer portal: `kelviq-checkout` with `{action:'portal'}` updates the Kelviq customer's email/name, calls `POST /portal/session/` and returns the signed link `customerPortalUrl?token=...`. Users who never bought get 404 `NO_BILLING_ACCOUNT` ("You don't have a billing account yet...").
- Check: `select id, type, status, detail, user_id, received_at from billing_events order by received_at desc limit 20;`

## 8. Local development & tests

```bash
npx supabase start                    # API http://127.0.0.1:56321, DB 56322, Studio 56323, Mailpit 56324
npx supabase db reset                 # applies all migrations + seed
node supabase/tests/db-tests.mjs      # RLS, billing protection, limits, portal, inventory, forum, recurring, storage
npx supabase functions serve --env-file supabase/functions/.env     # second terminal
node supabase/tests/webhook-test.mjs  # webhook signatures/idempotency/events, checkout, delete-account
```

`supabase/functions/.env` (git-ignored) holds TEST values only (`KELVIQ_WEBHOOK_SECRET=kq_whsec_local_test_...`, no Kelviq server key, so checkout answers 503 `BILLING_NOT_CONFIGURED` locally and the app falls back to the static checkout link). The test scripts refuse to run against a non-localhost URL and delete the users they create.

## 9. Storage

| Bucket | Public read | Size | Types | Write |
|---|---|---|---|---|
| `logos` (logos, avatars, document photos) | yes (public URL) | 5 MB | png, jpeg, webp, gif | own folder `<uid>/...` |
| `forum` | yes | 5 MB | png, jpeg, webp, gif | own folder |
| `price-book-images` | yes | 5 MB | png, jpeg, webp, gif | own folder |
| `signatures` | no (owner only) | 1 MB | png, jpeg, webp | own folder |
| `document-assets` | no (owner only) | 15 MB | images + pdf | own folder |

SVG is rejected everywhere (script-capable). Listing through the API only shows your own folder. `delete-account` removes `<uid>/` from every bucket.

## 10. Rules worth knowing (behaviour the frontend relies on)

- **Plan limits** (`plan_limits()`, same numbers as `lib/plans.ts`): Free = 6 new jobs/month, 15 clients total, 12 new documents per job per month, 10 emails/month, 15 AI requests/month; Premium = unlimited except 60 AI/month; Premium + AI = 600 AI/month. Months are calendar months in UTC. Monthly limits count creations (deleting does not free a slot). Errors start with `PLAN_LIMIT:` followed by a user-facing sentence.
- **Inventory**: stock moves only through `adjust_inventory`, `checkout_inventory` and the documents trigger. Per job and item, stock used = max(accepted Estimates + approved Change Orders, Material Logs with `deductInventory = true`, Paid Invoices); each document only takes what an earlier stage did not. Re-saves are idempotent, edits move the difference, cancel/untick/delete return stock, kits deduct their components, stock may go negative (notes say "stock went negative"). `inventory_history` rows with `document_id` are the ledger.
- **Approval links** expire 60 days after they are issued (document created, token regenerated, or status set to Sent again) and are single-use for signing/declining; signed/declined documents stay viewable.
- **Documents**: saving a list stub (`data.__lightweight`) is refused; a stale contractor save never erases the client signature/decline fields.
