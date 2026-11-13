# 06 · Database, Security, Build/Infra and Repo Health Audit

Scope: cross-cutting audit of ContractorDocs (React 18 + Vite + Supabase, deployed on Vercel).
Live code audited: `index.html`, `index.tsx`, root `App.tsx`, `components/`, `services/`, `utils/`, `hooks/`, `lib/`, `types.ts`, `src/hooks`, `src/config`, `src/utils/aiTemplateUtils.ts`, `supabase/functions/*`, plus every `.sql` file and the SQL string embedded in `App.tsx`.

Status labels:
- **CONFIRMED**: proven by the code or SQL in this repo (file and line given).
- **LIKELY**: the code allows it, but the outcome depends on state that is not in the repo (which SQL scripts were actually run in production, dashboard settings, deploy flags).

Secrets are redacted in this report. Where a value has to be rotated, the file and line are given instead.

## Summary

| Severity | SEC | DB | INFRA | Total |
|---|---|---|---|---|
| Critical | 3 | 1 | 0 | **4** |
| High | 6 | 2 | 3 | **11** |
| Medium | 5 | 3 | 5 | **13** |
| Low | 1 | 2 | 4 | **7** |
| **Total** | 15 | 8 | 12 | **35** |

Top 5:
1. **SEC-001 / SEC-002 (Critical)**: the `profiles` SELECT policy is `USING (true)`, and the App.tsx versions of the portal and approval RPCs return `row_to_json(profiles)`. Any signed-in user, and anyone holding a portal or approval link, can read other contractors' PII and the Google tokens stored in `profiles.gmail_access_token` / `gmail_refresh_token`.
2. **SEC-003 (Critical)**: users can make themselves Premium or give themselves AI credits. The `profiles` UPDATE policy has no column restriction, `App.tsx:1288` writes `subscription_tier: 'Premium'` from the browser, and every free-plan limit is checked only in the client.
3. **DB-001 (Critical)**: `markDocumentsAsViewed` (`App.tsx:1015-1032`) writes the *lightweight list stub* back as the document's whole `data` JSON. The line items, totals and content are lost, and the inventory trigger then puts the stock back.
4. **SEC-004 / SEC-005 / SEC-006 / SEC-008 (High)**: the PayPal webhook does not verify signatures; `master-ai-router` has no auth and acts as an open Gemini proxy and Gmail relay; `process-contractor-ai` has an IDOR on `jobId`; and `apply_document_inventory_delta` is a SECURITY DEFINER function that takes a caller-supplied `p_user_id` and is executable by `anon`.
5. **DB-002 / DB-003 (High)**: there is no single schema. Ten SQL files plus a string inside `App.tsx` contradict each other (column names, types, return types, two trigger sets that double-deduct stock), and the forum and notification tables, `jobs.worker_name`, `profiles.subscription_status` and two storage buckets are never created.

---

## 1. How it works

### 1.1 Architecture

```
Browser (Vercel static SPA, vercel.json rewrites /(.*) -> /index.html)
 ├─ index.html: CDN globals: Tailwind Play CDN, tesseract.js (unpkg), supabase-js@2 (jsDelivr, unpinned),
 │              jsPDF + autotable (cdnjs), html2canvas (jsDelivr), PayPal SDK (client-id inline),
 │              45 Google Font families, plus a dead AI-Studio importmap (esm.sh)
 ├─ index.tsx -> App.tsx (3,224 lines: routing state machine + all data access + embedded SQL)
 │    ├─ Supabase client #1: window.supabase.createClient(...) (CDN build)       App.tsx:68-73
 │    ├─ Supabase client #2: createClient(...) from npm                          src/hooks/useMasterAIRouter.ts:14-17
 │    ├─ IndexedDB "contractor_db" (jobs, documents, clients, profile, offline_queue, inventory, saved_items) utils/db.ts
 │    ├─ localStorage: google_provider_token, theme, chat ids, profit_calcs
 │    └─ Direct browser -> Gmail API send (services/gmailService.ts:34) with the user's Google access token
 │
Supabase project iauteblvljppwzsxloyd (linked through the Vercel Marketplace integration, supabase/.temp/linked-project.json)
 ├─ Auth: email/password + Google OAuth (signInWithOAuth, App.tsx:1911)
 ├─ Postgres + PostgREST: 15 tables used by the frontend (matrix in 1.3), RLS
 ├─ RPC (anon-callable SECURITY DEFINER): get_portal_data, sign_document_via_portal,
 │     get_document_by_token, approve_document_by_token
 ├─ Triggers: documents -> inventory deduction/restore (apply_document_inventory_delta)
 ├─ Storage: logos (public), forum, price-book-images (getPublicUrl, App.tsx:787-800)
 └─ Edge Functions (Deno, std@0.168.0, no supabase/config.toml)
      gmail-auth             Gmail OAuth code exchange + refresh (service role, verifies user JWT)
      master-ai-router       Gemini 1.5 Flash router + server-side Gmail batch send (no user auth)
      process-contractor-ai  Claude 3.5 Sonnet document extraction, AI credits (service role)
      paypal-webhook         Sets subscription_tier on PayPal events (service role, no signature check)

Third parties: Google OAuth / Gmail API, PayPal Subscriptions (plan P-65E58669J9805670ENFP23EA),
Google Gemini, Anthropic, Tesseract OCR (wasm/lang data from CDN), YouTube embeds (forum),
images.contractordocs.app (manifest and marketing images).
```

Public, unauthenticated entry points:
- `/?portal=<clients.portal_key>` → `PortalView` → `get_portal_data`, `sign_document_via_portal` (`App.tsx:837-840`)
- `/?approval_token=<documents.public_token>` → `DocumentApprovalView` → `get_document_by_token`, `approve_document_by_token`
- `paypal-webhook` (has to be deployed with `--no-verify-jwt` for PayPal to reach it)

How the schema got into the database: there is no `supabase/migrations`. When a profile or `ai_chat_history` query fails, `App.tsx` shows `DbSetupScreen` (`App.tsx:738`), which tells the end user to paste `SQL_SETUP_SCRIPT` (`App.tsx:111-736`) into the SQL editor. The other `.sql` files were run by hand in an unknown order.

### 1.2 Reconstructed schema (union of all SQL sources)

Sources: **A** = `App.tsx` `SQL_SETUP_SCRIPT`, **S** = `supabase_setup.sql`, **AI** = `supabase_ai_schema.sql`, **P** = `persistent_tracking.sql`, **UC** = `create_user_credentials.sql`, **UG** = `create_user_gmail_accounts.sql`, **AF** = `SQL_ASSEMBLIES_FEATURE.sql`, **DI** = `SQL_DOCUMENT_INVENTORY_LINK.sql`, **EP** = `SQL_ELITE_PRICEBOOK.sql`, **IA** = `SQL_INVENTORY_ASSEMBLIES.sql`, **MP** = `SQL_MIGRATION_PRICEBOOK.sql`, **FA** = `FIX_ASSEMBLIES.sql`, **EG** = `supabase/egress_optimization_indexes.sql`.

| Table | Columns (source) | FKs | RLS / policies | Indexes |
|---|---|---|---|---|
| `profiles` | id, email, name, company_name, logo_url, profile_picture_url, address, phone, website, job_title, subscription_tier ('Basic'), language, email_templates jsonb, theme, gmail_access_token, gmail_refresh_token, email_usage, email_usage_month, updated_at (A; S/P add the gmail and email_usage columns); ai_credits_remaining, ai_addon_active (AI) | id → auth.users | A: SELECT **TO authenticated USING (true)**; INSERT own; UPDATE own (**all columns**) | PK |
| `clients` | id, user_id, name, email, phone, address, notes, portal_key (default hex(16 random bytes)), created_at (A) | user_id → auth.users | A: FOR ALL USING owner | PK; EG (user_id, name). **No unique index on portal_key** |
| `jobs` | id, user_id, name, client_name, client_address, start_date, end_date, status, created_at (A) | user_id → auth.users | A: FOR ALL owner | PK only. **No (user_id, created_at)** |
| `documents` | id, user_id, job_id NOT NULL, type, data jsonb, created_at, public_token uuid (A) | job_id → jobs CASCADE; user_id → auth.users | A: FOR ALL owner | PK; EG (user_id, created_at), (user_id, job_id, created_at). **No unique index on public_token** |
| `saved_items` | id, user_id, name, description, rate, unit_cost, created_at (A); type, images **TEXT[]**, taxable, sku, markup **default 50**, category, unit_cost (MP); is_assembly, assembly_items jsonb, is_favorite, last_used_at, use_count, category_id (EP); type, is_assembly (AF); sku, markup **default 0**, images **JSONB**, taxable, is_favorite (FA) | category_id → price_book_categories | A: FOR ALL owner | EP: favourites, last_used, use_count, assemblies; EG (user_id, name) |
| `inventory` | id, user_id, name, quantity int, category, low_stock_threshold, created_at (A); unit, cost_price, supplier, location (A §10.5); is_assembly, assembly_items (IA) | user_id → auth.users | A: FOR ALL owner WITH CHECK | EG (user_id, name) |
| `inventory_history` | id, user_id, item_id, action, quantity_change, notes, job_id, created_at (A) | item_id → inventory CASCADE; job_id → jobs SET NULL | A: FOR ALL owner | EG (user_id, created_at) |
| `ai_chat_history` | id, user_id, title, messages jsonb, scope, scope_id, created_at (A) | user_id → auth.users | A: FOR ALL TO authenticated owner | **none besides PK** |
| `ai_generated_documents` | id, user_id, document_type, document_name, template_style, form_payload, created_at (AI; `CREATE TABLE` without IF NOT EXISTS) | user_id → auth.users | AI: FOR ALL owner | PK. **Unused by code** |
| `user_credentials` | id, user_id, provider, access_token, refresh_token, created_at, updated_at, UNIQUE(user_id, provider) (A, UC); expires_at (UC only) | user_id → auth.users | A/UC: FOR ALL owner | unique; UC trigger `tr_user_credentials_updated_at` (`CREATE TRIGGER` is not idempotent) |
| `user_gmail_accounts` | **A**: id, user_id, **email**, access_token, refresh_token, profile_picture, created_at, UNIQUE(user_id, email), **RLS never enabled in A**. **UG**: id, user_id, **gmail_address**, refresh_token **NOT NULL**, created_at, updated_at, UNIQUE(user_id, gmail_address) | user_id → auth.users | UG: 4 owner policies (not idempotent) | unique |
| `price_history` | id, item_id, old/new price/cost, changed_at, changed_by (EP) | item_id → saved_items | EP: SELECT/INSERT by changed_by | EP. **Unused by code** |
| `item_vendors` | id, item_id, vendor_name, vendor_sku, vendor_price, lead_time_days, is_preferred, last_updated, user_id (EP) | item_id → saved_items | EP: FOR ALL owner | EP. **Unused by code** |
| `price_book_categories` | id, name, parent_id, user_id, sort_order, created_at (EP) | self, auth.users | EP: FOR ALL owner | PK. Only referenced through `saved_items.category_id` |
| `assembly_components` | **AF**: id (uuid_generate_v4), assembly_id, **component_id**, quantity DECIMAL, override_price, created_at. **FA**: id, assembly_id, **component_item_id** (ON DELETE RESTRICT), quantity INTEGER, override_price, created_at | → saved_items | AF: two policies (SELECT + ALL, not idempotent); FA: one ALL policy | AF indexes. **Unused by code** |
| `forum_posts`, `forum_comments`, `forum_votes`, `forum_comment_votes`, `notifications` | **Not defined anywhere** ("FORUM & NOTIFICATIONS (Skipped for brevity, assumed existing)", `App.tsx:270`) | ? | ? | ? |

Storage (A §8, `App.tsx:272-278`): bucket `logos` public; policy "Allow public view access to logos" (SELECT, also allows listing every object); "Allow users to upload their own logo" (INSERT for any authenticated user, **any path**). Buckets `forum` and `price-book-images` are used by the code but **never created**.

Functions and triggers:

| Function | Source(s) | Security | Notes |
|---|---|---|---|
| `get_portal_data(text)` | A (returns **json**, `row_to_json(profiles)`, matches docs by `data->>'clientName'`); S (returns **jsonb**, whitelisted fields, matches by `jobs.client_name`) | SECURITY DEFINER, no `search_path` | The two versions conflict (DB-002) and A leaks data (SEC-002) |
| `sign_document_via_portal(text, uuid, text)` | A (returns void, raises, overwrites `signatureUrl`); S (returns jsonb `{error}`) | DEFINER | No document ownership check (SEC-007) |
| `get_document_by_token(uuid)` | A (`row_to_json(v_doc)` + full profile); S (whitelisted) | DEFINER | SEC-002 |
| `approve_document_by_token(uuid, text)` | A (overwrites contractor `signatureUrl`); S (writes `clientSignatureUrl`) | DEFINER | Re-signable, never expires |
| `adjust_inventory(uuid,int,uuid,text)` | A | DEFINER, uses `auth.uid()` | Not called by the frontend |
| `apply_document_inventory_delta(uuid,uuid,jsonb,int,uuid,text)` | A, DI | DEFINER, **trusts `p_user_id`** | SEC-008 |
| `trg_documents_invoice_inventory()` + triggers `trg_documents_invoice_inventory_{insert,update,delete}` | A | invoker | Duplicate of the DI set (DB-002) |
| `trg_documents_inventory()` + triggers `trg_documents_inventory_{insert,update,delete}` | DI | invoker | DI drops the A set, but A does not drop the DI set |
| `deduct_assembly_inventory(uuid, decimal)` | AF | invoker | Updates `inventory` with **saved_items** ids |
| `deduct_assembly_inventory(uuid, int, uuid, text)` | FA | DEFINER | Calls `adjust_inventory` with saved_items ids: always fails and is swallowed |
| `handle_updated_at()` | UC | invoker | — |

### 1.3 Table / bucket / function → code usage matrix

| Object | Used where (live code) | Columns / contract the code expects | Defined in SQL? | RLS |
|---|---|---|---|---|
| `profiles` | `App.tsx` 1288 (update Premium), 1413 (update tokens), 1470 (select), 1490, 1539 (insert), 1936, 2020 (upsert), 2033; `paypal-webhook` (update by id); `process-contractor-ai` (select `ai_credits_remaining`, update); `ForumView.tsx` 140/241/261/293/490 (embed `profiles:user_id(name, profile_picture_url)`) | id, email, name, company_name, logo_url, profile_picture_url, address, phone, website, job_title, subscription_tier, language, email_templates, theme, email_usage, email_usage_month, gmail_access_token, gmail_refresh_token, updated_at, **subscription_status**, ai_credits_remaining | Yes (A + S/P + AI). **`subscription_status` missing**, so the webhook update fails with PGRST204 | Yes, but SELECT open to all authenticated users and UPDATE unrestricted (SEC-001, SEC-003) |
| `clients` | `App.tsx` 1636, 1726, 2151, 2157, 2161; `ClientsView.tsx` 122, 173, 187, 196, 219, 245; `JobForm.tsx` 34; RPCs | `CLIENT_COLUMNS` (`App.tsx:79`) | Yes (A) | Owner |
| `jobs` | `App.tsx` 1575, 1582, 2062, 2071, 2086, 2167, 2226, 2302; `process-contractor-ai` (service role select by id) | id, user_id, name, client_name, client_address, start_date, end_date, status, **worker_name**, created_at | Yes, **`worker_name` missing**: every job load errors and is retried without it (`App.tsx:1580`) | Owner (bypassed by the edge function, SEC-006) |
| `documents` | `App.tsx` 1029, 1617, 1793, 1830, 1853, 2124, 2207, 2267, 2277; `recurringService.ts` 107, 124; `process-contractor-ai` insert; `master-ai-router` REST GET with the anon key; RPCs; triggers | id, user_id, job_id, type, data, created_at, public_token + JSON paths title, *Number, status, clientName, **clientSignatureUrl**, viewedByProvider, isAiGenerated | Yes (A) | Owner |
| `saved_items` | `App.tsx` 1690, 1771, 2325, 2347, 2361, 2372, 2387, 2394, 2402, 2413, 2424 | `SAVED_ITEM_COLUMNS` (`App.tsx:83`) | Yes, but spread over A/MP/EP/AF/FA with conflicting types and defaults | Owner |
| `inventory` | `App.tsx` 1657, 1741, 2443, 2452, 2470, 2478, 2497; triggers | `INVENTORY_COLUMNS` (`App.tsx:81`) | Yes (A + IA) | Owner |
| `inventory_history` | `App.tsx` 1676, 1756, 2436; SQL functions | `INVENTORY_HISTORY_COLUMNS` | Yes (A) | Owner |
| `ai_chat_history` | `App.tsx` 1705 (existence probe); `useMasterAIRouter.ts` 285 (select incl. `messages` ×30), 316 (upsert), 702 (delete) | id, user_id, title, messages, scope, scope_id, created_at | Yes (A) | Owner. No index |
| `user_credentials` | `App.tsx` 1416 (upsert tokens), 1519 (select access/refresh token), 1943 (delete) | user_id, provider, access_token, refresh_token, updated_at | Yes (A, UC) | Owner. Refresh token readable in the browser (SEC-012) |
| `user_gmail_accounts` | `CommunicationView.tsx` 65, 90; `batchEmailSender.ts` 37; `gmail-auth` (service role upsert/select) | user_id, **gmail_address**, refresh_token, updated_at; upsert `onConflict: 'user_id,gmail_address'` | **Conflicting**: A uses `email` and leaves RLS off; UG uses `gmail_address` | UG only |
| `forum_posts` | `ForumView.tsx` 240, 261, 358, 453, 467, 474 | id, user_id, title, content, category, image_url, youtube_url, upvotes, downvotes, created_at; FK user_id → **profiles** (needed for the embed) | **No** | Unknown. Updating `upvotes` on other users' posts (`:358`) only works if *any* user may UPDATE *any* post |
| `forum_comments` | `ForumView.tsx` 293, 385, 490; count embed at 241/261 | id, post_id, user_id, content, image_url, upvotes, downvotes, created_at | **No** | Unknown (same issue at `:385`) |
| `forum_votes` | `ForumView.tsx` 246, 274, 334, 348 | post_id, user_id, vote_type; unique (post_id, user_id) for `onConflict` | **No** | Unknown |
| `forum_comment_votes` | `ForumView.tsx` 296, 374, 381 | comment_id, user_id, vote_type; unique (comment_id, user_id) | **No** | Unknown |
| `notifications` | `ForumView.tsx` 123, 137, 167, 317 | id, user_id, source_user_id (FK → profiles), type, post_id (FK → forum_posts), is_read, created_at | **No** | Unknown. Insert targets *another* user's `user_id` |
| bucket `logos` | `App.tsx` 1986, 1999, 2000 (`uploadFile`, `getPublicUrl`) | public read, `<uid>/<ts>.<ext>` | Yes (A) | INSERT any path; SELECT allows listing |
| bucket `forum` | `App.tsx` 2036 | public read | **No** | — |
| bucket `price-book-images` | `App.tsx` 3132 | public read | **No** | — |
| rpc `get_portal_data` | `PortalView.tsx:27` | `{client{name}, contractor{company_name, logo_url}, documents[{id,type,data,created_at}]}`; checks `result.error` | Two versions (A/S) | anon, DEFINER |
| rpc `sign_document_via_portal` | `PortalView.tsx:49` | throws on error | Two versions | anon, DEFINER |
| rpc `get_document_by_token` | `DocumentApprovalView.tsx:23` | `{document, contractor}`; checks `result.error` | Two versions | anon, DEFINER |
| rpc `approve_document_by_token` | `DocumentApprovalView.tsx:45` | throws on error (S version returns `{error}` instead, so the UI reports success on a bad token) | Two versions | anon, DEFINER |
| fn `gmail-auth` | `CommunicationView.tsx:364`, `GmailCallback.tsx:51`, `batchEmailSender.ts:43` | `{action:'exchange' or 'refresh', code, redirect_uri, gmail_address}` | n/a | Verifies JWT itself ✓ |
| fn `master-ai-router` | `useMasterAIRouter.ts:429` (+ `X-Google-Token` header at 452) | router payload | n/a | **No user check** (SEC-005) |
| fn `process-contractor-ai` | `useContractorAI.ts:51` ← `AIDocumentModal.tsx` | `{inputData, formTypeRestrictions, jobId, saveToDb}` | n/a | User check ✓, job ownership ✗ (SEC-006) |
| fn `paypal-webhook` | PayPal → HTTPS | PayPal event JSON | n/a | **No signature check** (SEC-004) |

Not used by any live code: `ai_generated_documents`, `price_history`, `item_vendors`, `assembly_components`, rpc `adjust_inventory`, `deduct_assembly_inventory` (both overloads).

---

## 2. Issues

### Security

#### SEC-001: Every signed-in user can read every profile, including Google OAuth tokens
- **Severity:** Critical · **Status:** LIKELY (the policy is in the only SQL that defines `profiles` policies; whether it is live depends on what was run)
- **Location:** `App.tsx:171-172` (embedded SQL); token storage at `App.tsx:1406-1413`; the read at `App.tsx:1470`
- **What's wrong:** `CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);`. The same table holds `gmail_access_token`, `gmail_refresh_token` (written from `session.provider_token` on every login, `App.tsx:1406-1413`), email, phone, address and subscription data.
- **Impact:** anyone who signs up can run `supabase.from('profiles').select('*')` with the public anon key and get every contractor's contact details and Google tokens. The policy exists so the forum can show author names.
- **Root cause:** row-level policy used where column-level visibility is needed; secrets kept in a widely readable table.
- **Fix:**
  1. Apply PART A of the migration (non-breaking), then deploy the code below, then apply PART B (own-row SELECT + `public_profiles` view + drop the token columns).
  2. `components/ForumView.tsx`: read author data from the view (lines 140, 241, 261, 293, 490):
     ```diff
     - .select('*, profiles:user_id(name, profile_picture_url), forum_comments(count)')
     + .select('id, user_id, title, content, category, image_url, youtube_url, upvotes, downvotes, created_at, profiles:public_profiles!user_id(name, profile_picture_url), forum_comments(count)')
     ```
     Same change for `profiles:source_user_id (...)` → `profiles:public_profiles!source_user_id(name, profile_picture_url)` in notifications. Check the embed on staging: PostgREST infers the view relationship from the `forum_posts.user_id → profiles.id` FK.
  3. `App.tsx`: stop storing and selecting Google tokens in `profiles` (see SEC-012).

#### SEC-002: Portal and approval RPCs (App.tsx version) return the contractor's full profile row to anonymous callers
- **Severity:** Critical · **Status:** LIKELY (the embedded version is what `DbSetupScreen` tells users to run; `supabase_setup.sql` has a safe version, and whichever ran last is live)
- **Location:** `App.tsx:304` (`SELECT row_to_json(p) INTO v_contractor_data FROM public.profiles p`), `App.tsx:397-421` (`get_document_by_token` returns `row_to_json(v_doc)` and the full profile)
- **What's wrong:** `get_portal_data` and `get_document_by_token` are `SECURITY DEFINER` and granted to `anon`. They serialize the whole `profiles` row (gmail tokens, `subscription_tier`, `email_usage`) and the whole client row (incl. `portal_key`, `user_id`).
- **Impact:** anyone who gets a portal link or an approval link (they are emailed to clients and forwarded) gets the contractor's Google tokens and PII.
- **Root cause:** `row_to_json(*)` in a privileged function, plus two divergent copies of the function.
- **Fix:** replace both with the whitelisted versions in PART A.5 of the migration (`_contractor_public_info()` returns only name, company_name, logo_url, phone, email, website, address). Delete `SQL_SETUP_SCRIPT` and `DbSetupScreen` from `App.tsx` (DB-002) so the leaking version can't be re-applied.

#### SEC-003: Self-service Premium, AI credits and plan limits are enforced only in the browser
- **Severity:** Critical · **Status:** CONFIRMED
- **Location:** `App.tsx:1286-1292` (`handleUpgradeSuccess` → `profiles.update({ subscription_tier: 'Premium' })`), `components/UpgradeModal.tsx:28-31` (`onApprove` calls it), `App.tsx:1284` (`FREE_LIMITS`), `App.tsx:1294` (`checkLimit` returns true for Premium), `App.tsx:176` (UPDATE policy with no column restriction), `persistent_tracking.sql:27-30` (says "the application enforces" the limits), `process-contractor-ai/index.ts` (credit check reads `profiles.ai_credits_remaining`)
- **What's wrong:** the UPDATE policy `USING (auth.uid() = id)` allows any column. One request makes a user Premium: `supabase.from('profiles').update({subscription_tier:'Premium', ai_credits_remaining: 999999}).eq('id', uid)`. Job, client, document and email limits are all counted in React state, so direct REST inserts skip them.
- **Impact:** revenue bypass (free Premium, unlimited paid AI calls billed to your Anthropic and Gemini accounts).
- **Root cause:** billing state lives in a user-writable row; there is no server-side check.
- **Fix:**
  - Migration PART A.4: trigger `protect_profile_billing_columns` silently keeps `subscription_tier`, `subscription_status`, `paypal_subscription_id`, `ai_credits_remaining`, `ai_addon_active` unchanged for `authenticated`/`anon`. Optional trigger `enforce_free_plan_limits` for jobs, clients and documents (commented out until the numbers are confirmed).
  - `App.tsx`: remove the direct write and re-read the profile instead:
    ```diff
     const handleUpgradeSuccess = async () => {
         if (!session) return;
    -    await supabase.from('profiles').update({ subscription_tier: 'Premium' }).eq('id', session.user.id);
    -    setProfile(prev => prev ? ({ ...prev, subscriptionTier: 'Premium' }) : null);
    +    // The PayPal webhook is the source of truth. Poll briefly for it to land.
    +    for (let i = 0; i < 10; i++) {
    +        const { data } = await supabase.from('profiles').select('subscription_tier').eq('id', session.user.id).single();
    +        if (data?.subscription_tier === 'Premium') { setProfile(p => p ? { ...p, subscriptionTier: 'Premium' } : p); break; }
    +        await new Promise(r => setTimeout(r, 1500));
    +    }
         setShowGlobalUpgrade(false);
    ```
  - `process-contractor-ai`: consume credits atomically with `supabaseAdmin.rpc('consume_ai_credit', { p_user_id: user.id })` *before* calling Claude, and stop on a `null` result (this also fixes the read-then-write race that allows extra calls).

#### SEC-004: PayPal webhook accepts unauthenticated, unverified events
- **Severity:** High · **Status:** CONFIRMED
- **Location:** `supabase/functions/paypal-webhook/index.ts:11-12` (verification commented out), `:29`, `:41` (`resource.custom_id || resource.custom`); `DEPLOYMENT_GUIDE.md` (no `--no-verify-jwt`)
- **What's wrong:** the function trusts whatever JSON is POSTed. Anyone can send `{"event_type":"BILLING.SUBSCRIPTION.ACTIVATED","resource":{"custom_id":"<any uid>"}}` to upgrade any user, or `...CANCELLED` to downgrade paying customers. Without `--no-verify-jwt`, Supabase rejects PayPal's real calls with 401, so the integration is either open or broken. It also writes `subscription_status`, which no SQL creates, so the update fails with PGRST204. For `PAYMENT.SALE.COMPLETED`, the subscription user id is not in `resource.custom_id` (LIKELY). `PAYMENT.SALE.DENIED` is subscribed in the guide but not handled.
- **Impact:** subscription fraud and denial of service against paying users.
- **Root cause:** MVP shortcut.
- **Fix:**
  ```ts
  // supabase/functions/paypal-webhook/index.ts (core of the fix)
  const PAYPAL_API = Deno.env.get('PAYPAL_API_BASE') ?? 'https://api-m.paypal.com';
  async function verify(req: Request, event: unknown): Promise<boolean> {
    const auth = btoa(`${Deno.env.get('PAYPAL_CLIENT_ID')}:${Deno.env.get('PAYPAL_SECRET')}`);
    const tok = await fetch(`${PAYPAL_API}/v1/oauth2/token`, { method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials' }).then(r => r.json());
    const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, { method: 'POST',
      headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: req.headers.get('paypal-auth-algo'), cert_url: req.headers.get('paypal-cert-url'),
        transmission_id: req.headers.get('paypal-transmission-id'), transmission_sig: req.headers.get('paypal-transmission-sig'),
        transmission_time: req.headers.get('paypal-transmission-time'), webhook_id: Deno.env.get('PAYPAL_WEBHOOK_ID'),
        webhook_event: event }) }).then(r => r.json());
    return res.verification_status === 'SUCCESS';
  }
  Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    const event = await req.json();
    if (!(await verify(req, event))) return new Response('invalid signature', { status: 401 });
    // map: BILLING.SUBSCRIPTION.* -> resource.id (subscription id) + resource.custom_id (user id);
    //      PAYMENT.SALE.*         -> resource.billing_agreement_id -> profiles.paypal_subscription_id
    // update subscription_tier / subscription_status / paypal_subscription_id with the service role
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  });
  ```
  Deploy with `supabase functions deploy paypal-webhook --no-verify-jwt` and `supabase secrets set PAYPAL_CLIENT_ID=… PAYPAL_SECRET=… PAYPAL_WEBHOOK_ID=…`. The migration adds `subscription_status` and `paypal_subscription_id`.

#### SEC-005: `master-ai-router` is an unauthenticated Gemini proxy and Gmail relay
- **Severity:** High · **Status:** CONFIRMED
- **Location:** `supabase/functions/master-ai-router/index.ts:176-195` (no auth, no credit check), `:187-189` (`forceAction` → `processAndReturn` with no AI call), `:92-93` (raw `To:`/`Subject:` concatenation), `:106-108` (fetches `documents` with the anon key as Bearer, so RLS returns nothing and attachments are a literal `PLACEHOLDER_BASE64_FOR_DOC_…`), `:351` (`gemini-1.5-flash`)
- **What's wrong:** the platform's `verify_jwt` accepts the public anon key as a valid JWT, so anyone with the key in `App.tsx` can spend your Gemini quota. With `forceAction` plus their own `X-Google-Token`, a caller can make the function send arbitrary HTML mail. `recipient_email`/`subject` containing `\r\n` inject extra MIME headers (Bcc).
- **Impact:** cost abuse, abuse of your infrastructure for spam, broken attachments.
- **Root cause:** the auth step from `process-contractor-ai` was never copied here.
- **Fix:**
  ```ts
  // top of the handler
  const authHeader = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  // header-safe values
  const clean = (s: string) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(email.recipient_email))) throw new Error('bad recipient');
  mimeMessage = `To: ${clean(email.recipient_email)}\r\nSubject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(clean(email.subject))))}?=\r\n…`;
  // attachments: query documents with `sb` (user-scoped), not the anon key
  ```
  Also: rate-limit per user (a counter row or `ai_credits_remaining`), cap `batch.length` (for example 25), and move the model to a currently available one (`gemini-2.5-flash` is listed in the repo's own `models.json`; `gemini-1.5-flash` is not).

#### SEC-006: `process-contractor-ai`: cross-tenant job read/write (IDOR) and a credit race
- **Severity:** High · **Status:** CONFIRMED
- **Location:** `supabase/functions/process-contractor-ai/index.ts` "Fetch job details" block (`supabaseAdmin.from('jobs').select(...).eq('id', jobId)`: service role, no `user_id` filter) and "Step E" insert (`job_id: jobId`, `user_id: user.id`)
- **What's wrong:** a user can pass another tenant's `jobId`. The function reads that job's name, client and address (they end up in the AI output and in the inserted rows) and inserts documents pointing at the other tenant's job. The FK allows it and RLS is bypassed by the service role. Credits are read and then written back as `profile.ai_credits_remaining - 1`, so parallel calls spend one credit for many requests.
- **Impact:** data disclosure across tenants and corrupted relations; extra paid AI calls.
- **Root cause:** service-role client used without manual authorization.
- **Fix:**
  ```diff
   const { data: job } = await supabaseAdmin
       .from('jobs')
       .select('id, name, client_name, client_address, start_date, status')
       .eq('id', jobId)
  +    .eq('user_id', user.id)
       .single();
  +if (!job) return new Response(JSON.stringify({ error: 'JOB_NOT_FOUND' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  ...
  -await supabaseAdmin.from('profiles').update({ ai_credits_remaining: profile.ai_credits_remaining - 1 }).eq('id', user.id);
  +// before calling Claude:
  +const { data: left, error: creditErr } = await supabaseAdmin.rpc('consume_ai_credit', { p_user_id: user.id });
  +if (creditErr || left === null) return new Response(JSON.stringify({ error: 'NO_CREDITS' }), { status: 403, headers: corsHeaders });
  ```
  The migration also adds the `trg_documents_job_owner` trigger, which rejects any `documents` row whose `job_id` belongs to another user, whatever the client. Update the model id: `claude-3-5-sonnet-20241022` has been retired by Anthropic (LIKELY; check against the current model list).

#### SEC-007: Portal signing is not scoped to the client's documents; approval links never expire and can be re-signed
- **Severity:** High · **Status:** CONFIRMED
- **Location:** `App.tsx:322-343` and `supabase_setup.sql` FUNCTION 2 (`UPDATE public.documents … WHERE id = p_doc_id` with no owner check); `App.tsx:423-443` and `supabase_setup.sql` FUNCTION 4
- **What's wrong:** any valid portal key (any client of any contractor) can sign and set `status: 'Accepted'` on **any** document UUID in the database. The App.tsx versions overwrite the contractor's own `signatureUrl` with the client's signature. Approval links can be used again after signing, and they never expire. Accepting an Invoice/Estimate/Change Order fires the inventory trigger in the victim's tenant.
- **Impact:** cross-tenant tampering with legal approvals and stock levels.
- **Root cause:** the key is checked, but not tied to the document.
- **Fix:** PART A.5: `sign_document_via_portal` checks `p_doc_id IN _client_document_ids(client)`, validates the signature data URL (format and size), refuses re-signing, writes `clientSignatureUrl/clientSignedAt/clientSignedBy` only, and raises errors (so `PortalView`/`DocumentApprovalView` see them). Optional next step: `documents.public_token_expires_at` plus a "revoke link" button that sets a fresh `public_token`.

#### SEC-008: Anon-executable SECURITY DEFINER function that trusts the caller's `p_user_id`; definer functions without `search_path`
- **Severity:** High · **Status:** CONFIRMED
- **Location:** `SQL_DOCUMENT_INVENTORY_LINK.sql:6-17` and `App.tsx:543-553` (`apply_document_inventory_delta(p_user_id uuid, …) SECURITY DEFINER`); every `SECURITY DEFINER` in `App.tsx`, `supabase_setup.sql`, `FIX_ASSEMBLIES.sql`
- **What's wrong:** Supabase grants EXECUTE on new `public` functions to `anon` and `authenticated` by default. `POST /rest/v1/rpc/apply_document_inventory_delta` with `{"p_user_id":"<victim>","p_line_items":[{"inventoryItemId":"<id>","quantity":1000}],"p_direction":1,…}` changes any tenant's inventory and history. None of the definer functions set `search_path`, which the Supabase linter flags (function search-path hijack).
- **Impact:** cross-tenant data tampering (needs the victim's inventory item UUIDs, which are not secret once shared, for example in a QR tag from `PrintTagsModal`).
- **Root cause:** an internal helper exposed through PostgREST.
- **Fix:** PART A.6/A.7: `SET search_path = ''` on every function; `REVOKE ALL ON FUNCTION apply_document_inventory_delta(...) FROM PUBLIC, anon, authenticated`; the trigger function becomes `SECURITY DEFINER` so it can still call the helper.

#### SEC-009: Live Gemini API key in plaintext in the working tree
- **Severity:** High · **Status:** CONFIRMED (not in git history: `git log --all -S AIza` is empty; the files are untracked but **not ignored**)
- **Location:** `list_models.js:3`, `list_models.ts:1` (`const GEMINI_API_KEY = "AIzaSyD7…"`); output files `models.json`, `models.txt`
- **What's wrong:** a real Google API key is hardcoded. One `git add .` publishes it.
- **Impact:** quota theft and billing on the Google Cloud project.
- **Root cause:** a throwaway script.
- **Fix:** rotate the key in Google Cloud Console (APIs & Services → Credentials), restrict the new key to the Generative Language API and to server use only, store it only as a Supabase secret (`supabase secrets set GEMINI_API_KEY=…`), then delete `list_models.js list_models.ts models.json models.txt` (see Cleanup). If the script is needed:
  ```js
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY; if (!GEMINI_API_KEY) throw new Error('set GEMINI_API_KEY');
  ```
  Other values found are public by design and not secrets: the Supabase anon key (`App.tsx:70`, `useMasterAIRouter.ts:16`), the PayPal client-id (`index.html:24`), the Google OAuth client id (`App.tsx:1915`). The Google client **secret** is only read from `Deno.env` ✓. No service-role key appears anywhere in the frontend ✓. `supabase/.temp/pooler-url` contains no password ✓, but it is tracked (INFRA-010).

#### SEC-010: Storage: write anywhere in `logos`, list everything, no type/size limits, two buckets undefined
- **Severity:** Medium · **Status:** CONFIRMED (policies in `App.tsx:272-278`; the `forum`/`price-book-images` setup is unknown)
- **Location:** `App.tsx:272-278`, `App.tsx:786-800` (`uploadFile`), `App.tsx:2036`, `App.tsx:3132`
- **What's wrong:** INSERT is allowed for any authenticated user at any path (`bucket_id = 'logos' AND auth.role() = 'authenticated'`), so users can drop files into other users' folders. The SELECT policy allows `list()` of every object in the bucket. There are no MIME or size limits, so HTML/SVG uploads are possible on your storage domain. `uploadFile` uses `upsert: true`, but no UPDATE policy exists (LIKELY fails on name collision). The `forum` and `price-book-images` buckets are not in any SQL file.
- **Fix:** PART A.8: three buckets with `file_size_limit` and `allowed_mime_types`, and owner-folder policies `(storage.foldername(name))[1] = auth.uid()::text` for SELECT/INSERT/UPDATE/DELETE. Public URLs keep working because the buckets stay `public`. In code, take the extension from the MIME type, not the filename:
  ```diff
  -const fileExt = file.name.split('.').pop();
  +const fileExt = ({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif' } as Record<string,string>)[file.type];
  +if (!fileExt) throw new Error('Unsupported image type');
  -const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
  +const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: false, contentType: file.type });
  ```

#### SEC-011: Forum vote counts need cross-user UPDATE rights
- **Severity:** Medium · **Status:** LIKELY (forum policies are not in the repo)
- **Location:** `components/ForumView.tsx:358` (`forum_posts.update({ upvotes, downvotes }).eq('id', postId)`), `:385` (same on `forum_comments`)
- **What's wrong:** voters write absolute counters on rows they do not own. Either the counts silently never persist (owner-only UPDATE policy), or there is a policy that lets any user edit any post's title/content too.
- **Fix:** PART A.3: owner-only UPDATE/DELETE policies, `recount_post_votes`/`recount_comment_votes` triggers keep the counters in sync, and `guard_vote_counters` ignores browser writes, so the current frontend keeps working. Then delete lines 358 and 385 in `ForumView.tsx`.

#### SEC-012: Google tokens kept in the browser and readable through RLS; not cleared on logout
- **Severity:** Medium · **Status:** CONFIRMED
- **Location:** `App.tsx:1377`, `:1404` (`localStorage.setItem('google_provider_token', …)`); `App.tsx:1408-1423` (tokens written to `profiles` and `user_credentials`); `App.tsx:1519-1528` (refresh token selected into React state); `App.tsx:1534` (`dbApi.put('profile', currentProfile)`: the IndexedDB profile cache includes `gmailAccessToken`/`gmailRefreshToken`); `App.tsx:1954-1959` (`handleLogout` clears localStorage keys but not IndexedDB); `App.tsx:385-394` (A's `user_gmail_accounts` has **no RLS** if that version was created: LIKELY)
- **What's wrong:** long-lived Google refresh tokens sit in browser storage, and on a shared device the next user of the browser inherits the cached profile, jobs, clients and documents. The `user_gmail_accounts.refresh_token` column is readable by its owner from the browser even though only the edge function needs it.
- **Impact:** any XSS (SEC-013) or shared-device use leads to Gmail send-as-user.
- **Fix:**
  - PART A.7 already limits the browser to `user_gmail_accounts(id, user_id, gmail_address, created_at, updated_at)`.
  - Use only the `gmail-auth` edge function to mint short-lived access tokens; remove the `profiles` token writes (`App.tsx:1408-1413`), the `user_credentials` refresh-token select (`:1519-1528`) and `gmailRefreshToken` from `UserProfile`; then run PART B.
  - On logout:
    ```ts
    const handleLogout = async () => {
        if (navigator.onLine) await supabase.auth.signOut();
        ['app_view_state', 'google_provider_token'].forEach(k => localStorage.removeItem(k));
        await Promise.all(['jobs','documents','clients','profile','offline_queue','inventory','saved_items'].map(s => dbApi.clear(s)));
        setSession(null); setView({ screen: 'welcome' });
    };
    ```

#### SEC-013: XSS sinks
- **Severity:** Medium · **Status:** LIKELY (sinks CONFIRMED; exploitation needs attacker-influenced HTML, which AI output provides)

| # | Sink | Input | User/attacker-controlled? | Verdict |
|---|---|---|---|---|
| 1 | `components/BatchEmailReviewCard.tsx:115` `dangerouslySetInnerHTML={{ __html: email.body_html }}` | Gemini output from `master-ai-router` (prompt includes client and document data) | Yes, indirectly (prompt injection through stored names, notes and pasted text) | **Unsanitized**: wrap in `sanitizeAiHtml()` or DOMPurify |
| 2 | `components/DailyJobReportForm.tsx:958` `dangerouslySetInnerHTML` `prefillData.content \|\| prefillData.description_html` | AI draft | Yes, indirectly. `description_html` is sanitized in `utils/documentDraft.ts:280-284`, `content` is not always | Sanitize both |
| 3 | `components/DailyJobReportForm.tsx:320` `editorRef.current.innerHTML = data.content` | Stored document (own data, AI-generated content saved) | Self / AI | Sanitize on load |
| 4 | `components/DailyJobReportForm.tsx:444` `innerHTML = mockData.content` | constant | No | OK |
| 5 | `components/NoteForm.tsx:77`, `:96` `innerHTML = data.content / html` | Stored note / editor | Self | Sanitize on load |
| 6 | `services/pdfGenerator.ts:94` `wrapper.innerHTML = html` into `#pdf-render-content` (same document, scripts in `onerror` run) | HTML templates in `utils/templates/documentHtmlTemplates.ts` interpolate `${item.description}`, `${clientName}`, `${data.notes}`, `${data.signature}` with **no escaping** (lines 93, 129, 180, 186, 225, 265, 311, 353, 389, 421, 493, 498…), plus AI visual HTML | Yes, indirectly (AI-filled fields, AI-created clients via `CREATE_CLIENT`) | **Escape every interpolation** |
| 7 | `components/DailyJobReportForm.tsx:1009` `<iframe srcDoc={…${templatePreviewHtml}…}>` **without `sandbox`** | Template preview with report data | Same as 6; a srcdoc iframe shares the app's origin | Add `sandbox=""` |
| 8 | `components/EmailTemplateSelector.tsx:30`, `components/TemplateSelector.tsx:261` `srcDoc` without sandbox | Constant templates + mock vars | No | Add `sandbox=""` anyway |
| 9 | `components/CommunicationView.tsx:815` `srcDoc` with `sandbox="allow-same-origin"` | User email HTML | Self | OK (no scripts) |
| 10 | `pdfGenerator.ts:90, 106, 272`, `UpgradeModal.tsx:19` | constants / empty | No | OK |

- **Root cause:** HTML is built by string concatenation, and the sanitizer `utils/richTextHtml.ts:37` is regex-based.
- **Fix:** `npm i dompurify` and one helper:
  ```ts
  // utils/safeHtml.ts
  import DOMPurify from 'dompurify';
  export const safeHtml = (html: string) => DOMPurify.sanitize(html ?? '', { USE_PROFILES: { html: true }, FORBID_TAGS: ['style'], FORBID_ATTR: ['style'] });
  export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
  ```
  Use `safeHtml()` at sinks 1, 2, 3, 5 and inside `renderHtmlToPdf` (`wrapper.innerHTML = safeHtml(html)`); use `${esc(item.description)}` and so on in every template literal in `utils/templates/*.ts`; reduce `sanitizeAiHtml` to a call to `safeHtml`.

#### SEC-014: No CSP or security headers; unpinned third-party scripts without SRI
- **Severity:** Medium · **Status:** CONFIRMED
- **Location:** `vercel.json` (rewrites only), `index.html:14-25`
- **What's wrong:** seven external script origins are loaded synchronously, without SRI; `supabase-js@2` from jsDelivr floats to whatever is latest. That script creates the client that holds the session, so a CDN compromise or bad release means account takeover for every user. There is no CSP, no `X-Content-Type-Options`, no `frame-ancestors` (clickjacking on the approval and signature page), and no `Referrer-Policy`.
- **Fix:** remove the CDN copies (INFRA-001/003/004), then add to `vercel.json` (start as `Content-Security-Policy-Report-Only`, switch once it is clean):
  ```json
  {
    "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }],
    "headers": [
      { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/(.*)", "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://www.paypal.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://iauteblvljppwzsxloyd.supabase.co wss://iauteblvljppwzsxloyd.supabase.co https://gmail.googleapis.com https://oauth2.googleapis.com https://www.paypal.com https://*.paypal.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; worker-src 'self' blob:; frame-src https://www.paypal.com https://*.paypal.com https://www.youtube.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "Permissions-Policy", "value": "camera=(self), microphone=(self), geolocation=()" }
      ]}
    ]
  }
  ```
  For the CDN scripts that stay (jsPDF, autotable, html2canvas, PayPal), pin the version and add `integrity="sha384-…" crossorigin="anonymous"`, or better, `npm i jspdf jspdf-autotable html2canvas` and import them (removes three origins).

#### SEC-015: Gmail OAuth without `state`, CORS `*` on all functions, verbose errors
- **Severity:** Low · **Status:** CONFIRMED
- **Location:** `App.tsx:1913-1930` (no `state` param), `components/GmailCallback.tsx` (no state check); `corsHeaders` in all four functions (`'Access-Control-Allow-Origin': '*'`); `gmail-auth/index.ts:41-42` (logs client_id and redirect_uri), `:61` (returns the full Google error body); `master-ai-router` returns `err.message` with HTTP 200.
- **Fix:** generate `state = crypto.randomUUID()`, store it in `sessionStorage`, compare in `GmailCallback` before calling `exchange`. Set `Access-Control-Allow-Origin` to `https://www.contractordocs.app` (and preview domains) from an env var. Return generic error codes and log the details server-side.

### Database

#### DB-001: "Mark as viewed" overwrites full documents with the lightweight list stub (data loss + inventory corruption)
- **Severity:** Critical · **Status:** CONFIRMED
- **Location:** `App.tsx:1015-1032`, wired at `App.tsx:3097` → `components/ClientsView.tsx:502` (click on the green signed-docs badge)
- **What's wrong:** the dashboard loads documents with `DOCUMENT_METADATA_COLUMNS` (`App.tsx:77`). `mapDocumentRow` (`:100-107`) then replaces `data` with `createLightweightDocumentData()`, which has only title, status, clientName, clientSignatureUrl, viewedByProvider, isAiGenerated and `__lightweight`. `markDocumentsAsViewed` then does `update({ data: { ...doc.data, viewedByProvider: true } })` with no `isLightweightDocument` check. Only documents that `loadDocumentsForClient` happened to load in full are safe.
- **Impact:** line items, totals, notes and rich content of every signed document for that client are destroyed. Because status stays "Accepted" and `lineItems` changes from an array to NULL, the inventory trigger restores stock (`+1` on OLD lineItems) and then deducts nothing.
- **Root cause:** a whole-object JSON overwrite instead of a merge; the lightweight-row optimization was added after this function.
- **Fix:** use the `mark_documents_viewed` RPC from the migration (a server-side `data || '{"viewedByProvider":true}'`, one call instead of N):
  ```diff
  -for (const doc of docsToUpdate) {
  -    const updatedData = { ...doc.data, viewedByProvider: true };
  -    await supabase.from('documents').update({ data: updatedData }).eq('id', doc.id);
  -}
  +const { error } = await supabase.rpc('mark_documents_viewed', { p_ids: docsToUpdate.map(d => d.id) });
  +if (error) { console.error(error); return; }
  ```
  The migration's trigger also refuses to "restore" stock when the new JSON has no `lineItems` key. Apply the same `isLightweightDocument` guard to any other path that writes `form.data` back (`services/recurringService.ts:124` writes `f.data`; check that the offline queue never holds lightweight rows).

#### DB-002: No single source of truth; SQL files contradict each other
- **Severity:** High · **Status:** CONFIRMED (the contradictions are in the files; which variant is live is LIKELY unknown)
- **Location / contradictions:**
  1. `user_gmail_accounts`: A (`App.tsx:385-394`) column `email`, no RLS; UG column `gmail_address`, `refresh_token NOT NULL`. The code uses `gmail_address` and upserts without `refresh_token` when Google does not return one (`gmail-auth/index.ts:83-85`), which fails on a new row under UG.
  2. `assembly_components`: AF `component_id` + `quantity DECIMAL` + `uuid_generate_v4()`; FA `component_item_id` + `quantity INTEGER`.
  3. `saved_items.images`: MP `TEXT[]` vs FA `JSONB`; `markup` default 50 (MP) vs 0 (FA).
  4. Portal and approval RPCs: A returns `json`/`void`, S returns `jsonb`. `CREATE OR REPLACE` cannot change a return type, so running A after S fails at `get_portal_data` and **aborts the rest of A** (inventory history, triggers…).
  5. Two inventory trigger sets: A creates `trg_documents_invoice_inventory_*`; DI drops those and creates `trg_documents_inventory_*`. Running A after DI leaves **both** active, so every accepted invoice deducts stock twice.
  6. `deduct_assembly_inventory` has two overloads (AF `(uuid, decimal)`, FA `(uuid, int, uuid, text)`), and both use saved_items ids as inventory ids.
  7. Not idempotent: AI `CREATE TABLE` and `CREATE POLICY`; UC `CREATE TRIGGER`; UG four `CREATE POLICY`; AF two `CREATE POLICY`.
  8. The schema is shipped to end users: `DbSetupScreen` (`App.tsx:738-781`) shows the full SQL, including the definer functions, to any user whose profile query fails with a matching error (`App.tsx:1476`, `:1647`, `:1699`, `:1707`, `:3152`).
- **Impact:** unknown production state, double stock deductions, scripts that fail halfway, and a risk of re-applying the leaky functions (SEC-002).
- **Fix:** adopt `06b_proposed_consolidated_schema.sql` as `supabase/migrations/20261110000000_baseline.sql`; move the old `.sql` files to `supabase/legacy_sql/` (Cleanup); delete `SQL_SETUP_SCRIPT` and `DbSetupScreen` from `App.tsx` and replace them with a plain "Service unavailable" error; manage schema changes with `supabase db diff` / `supabase migration new`. Before running the baseline, check what is live: `select tgname from pg_trigger where tgrelid='public.documents'::regclass and not tgisinternal;` and `select proname, pg_get_function_result(oid) from pg_proc where proname in ('get_portal_data','approve_document_by_token');`.

#### DB-003: Objects used by the code that no SQL creates
- **Severity:** High · **Status:** CONFIRMED
- **Location / list:** `forum_posts`, `forum_comments`, `forum_votes`, `forum_comment_votes`, `notifications` (`ForumView.tsx`; `App.tsx:270` "assumed existing"); `jobs.worker_name` (`App.tsx:1576`, `:2061`; the code falls back on error, so every dashboard load pays an extra failed query when the column is missing); `profiles.subscription_status` (`paypal-webhook:35`, `:47`), which makes the whole webhook update fail; buckets `forum`, `price-book-images`; `saved_items.cost` (the fallback in `App.tsx:2343` reads `newItem.cost`; harmless).
- **Impact:** a fresh environment (staging, disaster recovery) cannot be rebuilt from the repo; forum RLS state is unknown (SEC-011); PayPal upgrades never persist.
- **Fix:** PART A.1 creates all of them with FKs to `profiles` (required for the `profiles:user_id(...)` embeds) and the unique keys the `onConflict` upserts need.

#### DB-004: Missing indexes and uniqueness on hot or public lookups
- **Severity:** Medium · **Status:** CONFIRMED
- **What's missing:** `documents.public_token` and `clients.portal_key` are queried by every anonymous portal/approval call with `LIMIT 1` and have **no index and no UNIQUE** (sequential scan of the largest table; a collision would silently return the wrong tenant's row). Also missing: `jobs(user_id, created_at)` (dashboard), `documents(user_id, (data->>'clientName'))` (`App.tsx:1856` and the portal), `documents(job_id)` (the FK used by `ON DELETE CASCADE` from jobs), `ai_chat_history(user_id, created_at)`, `inventory_history(item_id)`, `notifications(user_id, is_read)`, `forum_comments(post_id)`, `forum_votes(user_id)`. The useful `supabase/egress_optimization_indexes.sql` is untracked and optional.
- **Fix:** PART A.2.

#### DB-005: Egress and N+1 patterns
- **Severity:** Medium · **Status:** CONFIRMED
- **Location / what's wrong:**
  1. `App.tsx:77`: list metadata selects `clientSignatureUrl:data->>clientSignatureUrl`, a base64 PNG data URL (`SignaturePad` → `canvas.toDataURL()`, stored by the portal RPCs) of tens of KB **per row**, only to test truthiness (`App.tsx:1011`, `ClientsView` badge).
  2. `fetchData()` re-runs profile + jobs + documents + clients + inventory + history + saved_items (7+ queries, jobs unpaginated) after **every** mutation (`App.tsx:2066, 2152, 2158, 2162, 2168, 2445, 2464, 2472, 2488, 2499`).
  3. Material-log save loops over items (`App.tsx:2113-2118`); each `handleAllocateInventory` makes 1 update + 1 insert + a full `fetchData()`: **N × 9 queries**.
  4. `markDocumentsAsViewed`: one UPDATE per document (DB-001).
  5. `ForumView.tsx:261`: `select('*')` of all posts in a category, unpaginated; `:274` selects every vote the user ever cast; `:293` `select('*')` comments.
  6. `useMasterAIRouter.ts:285`: loads `messages` jsonb for 30 conversations up front and then filters by a title prefix in JS (`:300-302`) although `scope`/`scope_id` columns exist.
  7. `App.tsx:2361, 2394, 2424`: after a saved-item write, reloads the first page of the price book.
- **Fix:**
  ```diff
  // App.tsx:77 (after the migration adds documents.has_client_signature)
  - …, clientSignatureUrl:data->>clientSignatureUrl, …
  + …, has_client_signature, …
  // createLightweightDocumentData
  - clientSignatureUrl: row.clientSignatureUrl,
  + clientSignatureUrl: row.has_client_signature ? '__signed__' : undefined,
  ```
  Replace `fetchData()` after mutations with local state updates (the insert already has the row) or a targeted reload of one table. Allocate inventory in one RPC per item (`adjust_inventory`) and call `fetchData()` once after the loop. Forum: explicit columns, `.range(0, 19)`, and `.in('post_id', postIds)` for votes. Chat history: `.select('id, title, created_at').eq('scope', historyScope).eq('scope_id', historyScopeId ?? null)` and load `messages` only when a conversation is opened.

#### DB-006: Inventory consistency (client-side read-modify-write, flag persisted)
- **Severity:** Medium · **Status:** CONFIRMED
- **Location:** `App.tsx:2491-2500` (`newQty = Math.max(0, item.quantity - quantity)` computed from a possibly stale page-1 cache; an oversell is silently clamped to 0); `App.tsx:2447-2466` (manual update writes the absolute quantity); `App.tsx:2093-2121` (`dataToSave` is a shallow copy made **before** `formData.deductInventory = false`, so `deductInventory: true` is saved in the document and stock is deducted again on every later save of that Material Log)
- **Impact:** wrong stock levels; lost concurrent updates between devices and the server-side trigger.
- **Fix:**
  ```diff
  -const newQty = Math.max(0, item.quantity - quantity);
  -await supabase.from('inventory').update({ quantity: newQty }).eq('id', itemId);
  -await handleLogInventoryAction(itemId, 'job_allocation', -quantity, notes || 'Allocated', jobId || undefined);
  +const { error } = await supabase.rpc('adjust_inventory', { p_item_id: itemId, p_delta: -quantity, p_job_id: jobId, p_context: notes || 'Allocated' });
  +if (error) { alert(error.message); return; }
  ```
  and in `handleSaveForm`, build `dataToSave` after the deduction loop, or set `dataToSave.deductInventory = false` explicitly.

#### DB-007: Documents linked to clients by display name
- **Severity:** Low · **Status:** CONFIRMED
- **Location:** `get_portal_data` (A: `d.data->>'clientName' = name`; S: `jobs.client_name = name`); `App.tsx:1856`; `markDocumentsAsViewed`
- **What's wrong:** renaming a client hides their documents from the portal; two clients with the same name in one tenant see each other's documents in the portal.
- **Fix (follow-up migration):** `ALTER TABLE jobs ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL; ALTER TABLE documents ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL;` backfill by name per `user_id`, set them in `JobForm`/forms, then switch `_client_document_ids()` to `client_id`.

#### DB-008: Unused tables and functions
- **Severity:** Low · **Status:** CONFIRMED (no `.from()`/`.rpc()` references)
- **List:** `ai_generated_documents`, `price_history`, `item_vendors`, `assembly_components`, `adjust_inventory` (until DB-006 uses it), `deduct_assembly_inventory` ×2 (dropped by the migration).
- **Fix:** keep them (the migration makes them consistent and RLS-protected) or drop them once product confirms they are abandoned.

### Build / infrastructure / repo health

#### INFRA-001: Two Supabase clients, one of them from an unpinned CDN global
- **Severity:** High · **Status:** CONFIRMED
- **Location:** `index.html:17`, `App.tsx:68-73` (`(window as any).supabase ? … : null`), `src/hooks/useMasterAIRouter.ts:4, 14-17`
- **What's wrong:** two GoTrue instances share one localStorage session key. Both auto-refresh, and with refresh-token rotation one of them can present an already-rotated token, which signs the user out at random (LIKELY; supabase-js logs "Multiple GoTrueClient instances detected"). If the CDN script is blocked (ad blocker, CSP, offline first load, jsDelivr outage), `supabase` is `null` and the app crashes on the first `.auth` call. Two copies of supabase-js are shipped. URL and key are duplicated and hardcoded.
- **Fix:**
  ```ts
  // lib/supabase.ts
  import { createClient } from '@supabase/supabase-js';
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!url || !anon) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing');
  export const supabase = createClient(url, anon);
  ```
  `App.tsx`: delete lines 68-73 and add `import { supabase } from './lib/supabase.ts';`. `useMasterAIRouter.ts`: delete lines 4 and 14-17 and import the same module. Delete `index.html:16-17`. Add `.env.example` with the two `VITE_` keys and set them in Vercel → Project → Settings → Environment Variables.

#### INFRA-002: Live code is not committed
- **Severity:** High · **Status:** CONFIRMED
- **Location:** `git status`: untracked `src/hooks/`, `src/config/`, `src/utils/aiTemplateUtils.ts`, `utils/{aiMentionUtils,buildEmailBatch,documentDraft,documentMetadata,documentSetupPayload,parseDocumentSetup,richTextHtml,…}.ts`, `components/{AIChatMentionInput,AIDocumentModal,AIDocumentReviewModal,AIVisualComponents,BatchEmailReviewCard,DashboardMasterAIButton,DocumentAIQAHarness,JobDocumentAIModal,SetupSignatureModal}.tsx`, `services/batchEmailSender.ts`, `supabase/functions/master-ai-router/`, `supabase/functions/process-contractor-ai/`
- **What's wrong:** the modified, tracked `App.tsx` imports these files (`App.tsx:45-53`). Committing only the modified files (`git commit -a`), or a Vercel build from git, fails with "Could not resolve './src/hooks/useMasterAIRouter.ts'". Two deployed edge functions exist only on this machine.
- **Fix:** commit them together with the modified files on `my-branch` (after the cleanup of junk files), and add CI (`.github/workflows/ci.yml`) running `npm ci && npx tsc --noEmit && npm run build` on every push.

#### INFRA-003: Tailwind Play CDN in production
- **Severity:** High · **Status:** CONFIRMED
- **Location:** `index.html:14`, `index.html:30-77` (runtime `tailwind.config`)
- **What's wrong:** the Play CDN is a development tool. It compiles CSS in the browser on every load (slow first paint, flash of unstyled content), downloads a ~300 KB JIT engine, needs inline script (blocks a strict CSP) and has no version pin.
- **Fix:** `npm i -D tailwindcss@3 postcss autoprefixer && npx tailwindcss init -p`, then:
  ```js
  // tailwind.config.js
  export default {
    darkMode: 'class',
    content: ['./index.html','./App.tsx','./components/**/*.{ts,tsx}','./src/hooks/**/*.ts','./src/config/**/*.ts','./utils/**/*.ts','./services/**/*.ts'],
    theme: { extend: { /* move the colors/borderRadius block from index.html:33-75 */ } },
  };
  ```
  Create `index.css` with `@tailwind base; @tailwind components; @tailwind utilities;` plus the `:root`/`.dark`/`.blue.dark` variables and keyframes from `index.html:78-371`, `import './index.css'` in `index.tsx`, and delete `index.html:14` and the two inline blocks. Check for dynamically built class names (`` `bg-${x}-500` ``) and add them to `safelist`.

#### INFRA-004: `index.html` script hygiene
- **Severity:** Medium · **Status:** CONFIRMED
- **Location / what's wrong:**
  - `index.html:15` tesseract.js from unpkg, **unused**: `utils/ocr.ts:4` imports the npm package (pinned `5.0.5`).
  - `index.html:372-387` AI Studio `importmap` pointing at esm.sh with caret ranges. Vite bundles every bare import, so it is dead weight and confusing (it lists `react-hook-form`/`zod` versions that differ from `package.json`).
  - `index.html:21-25` PayPal SDK loaded eagerly on every page, render-blocking, for a modal most sessions never open.
  - `index.html:28-29` 45 Google Font families in one render-blocking stylesheet.
  - `index.html:11-12` `/favicon-96x96.png` and `/contractore-ai-logo.png` are not in `public/`, so the SPA rewrite serves `index.html` for them.
  - `sw.js` precaches `jspdf-autotable/3.5.23` and cdnjs `html2canvas` while `index.html` uses `3.8.3` and jsDelivr (see INFRA-009).
- **Fix:** delete lines 15-17 and 372-387; load PayPal on demand in `UpgradeModal`:
  ```ts
  const loadPayPal = () => (window as any).paypal ? Promise.resolve() : new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${import.meta.env.VITE_PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;
    s.onload = () => res(); s.onerror = rej; document.head.appendChild(s);
  });
  ```
  Load only Inter + JetBrains Mono in `index.html` and load template fonts when a template is chosen; add the two icon files to `public/`.

#### INFRA-005: 1.95 MB single JS chunk
- **Severity:** Medium · **Status:** CONFIRMED (`dist/assets/index-Cy-ePIPf.js` = 1,958,725 bytes)
- **Location:** `App.tsx:6-66` (every view, form and template set imported statically); `utils/templates/*Templates.ts`
- **Fix:**
  ```ts
  // App.tsx
  const ForumView = React.lazy(() => import('./components/ForumView.tsx'));
  const CalendarView = React.lazy(() => import('./components/CalendarView.tsx'));
  const InventoryView = React.lazy(() => import('./components/InventoryView.tsx'));
  // …all route-level views and forms; wrap renderContent() in <React.Suspense fallback={<Spinner/>}>
  ```
  ```ts
  // vite.config.ts
  build: { rollupOptions: { output: { manualChunks: {
    react: ['react', 'react-dom', 'react-router-dom'],
    supabase: ['@supabase/supabase-js'],
    calendar: ['react-big-calendar', 'date-fns'],
    scanner: ['html5-qrcode', 'qrcode.react'],
    ocr: ['tesseract.js'],
  } } } },
  ```
  Import `utils/ocr.ts` dynamically (`await import('../utils/ocr.ts')`) from `ReceiptForm`/`ExpenseLogForm`.

#### INFRA-006: TypeScript is not gated, and that hides runtime bugs
- **Severity:** Medium · **Status:** CONFIRMED
- **Location:** `tsconfig.json` (no `include`/`exclude`, `types: ["node"]` only); no CI
- **What's wrong:** `tsc --noEmit` reports **175 errors** (fresh run; `PROJECT_AUDIT/_tsc_errors_raw.txt` is an incomplete subset that lost several headers): 22 in `supabase/functions` (Deno), 113 in `my-pdf-app/`, 18 in the dead `src/components`, and **22 in live code**. Real runtime bugs hide among them, for example `src/hooks/useContractorAI.ts:96/116/139` (`resolveTemplateId`/`extractRichTextField` are only *re-exported*, never imported, so calling `resolveTemplate()` or `getRichTextPayload()` throws `ReferenceError`).
- **Fix:** see section 3 (tsconfig with `include`/`exclude` + `vite/client` types + one fix per error), and add `"typecheck": "tsc --noEmit"` to `package.json` and to CI.

#### INFRA-007: Edge function configuration and model drift
- **Severity:** Medium · **Status:** CONFIRMED (model availability: CONFIRMED for Gemini via the repo's own `models.json`; LIKELY for Claude)
- **Location:** no `supabase/config.toml`; all functions use `deno.land/std@0.168.0` `serve` (deprecated) and unpinned `esm.sh/@supabase/supabase-js@2`; `master-ai-router/index.ts:351` `gemini-1.5-flash` (absent from `models.json`, which lists `gemini-2.5-flash`, `gemini-2.0-flash`…); `process-contractor-ai` `claude-3-5-sonnet-20241022` (retired).
- **What's wrong:** JWT verification per function is decided by whoever runs `functions deploy`, with no record in the repo; the AI features fail with model-not-found.
- **Fix:**
  ```toml
  # supabase/config.toml
  [functions.paypal-webhook]
  verify_jwt = false        # PayPal signature verified in code (SEC-004)
  [functions.gmail-auth]
  verify_jwt = true
  [functions.master-ai-router]
  verify_jwt = true
  [functions.process-contractor-ai]
  verify_jwt = true
  ```
  ```json
  // supabase/functions/deno.json
  { "imports": { "@supabase/supabase-js": "npm:@supabase/supabase-js@2.89.0" } }
  ```
  Replace `serve(…)` with `Deno.serve(…)`; read the model ids from env (`GEMINI_MODEL`, `ANTHROPIC_MODEL`) with current defaults.

#### INFRA-008: Duplicate `src/` tree is diverging, and fixes landed in the dead copy
- **Severity:** Medium · **Status:** CONFIRMED
- **Live in `src/`:** `src/hooks/useMasterAIRouter.ts`, `src/hooks/useContractorAI.ts`, `src/config/{docTypeMap,documentFieldRequirements,widgetMap}.ts`, `src/utils/aiTemplateUtils.ts`. `src/config/widgetCatalog.ts` is used only by dead code.
- **Dead in `src/`:** `src/App.tsx` (0 bytes), `src/components/**` (52 files; 18 identical to root, the rest diverged), `src/services/*`, `src/utils/{db,emailTemplates,imageCompression,ocr,translations}.ts`, `src/types.ts`.
- **Evidence of fixes made only in the dead copy:** `src/components/JobForm.tsx` (uncommitted edit) adds `useLocation()` + `prefillData` + `auto_submit`. Root `components/JobForm.tsx` has **0** references to `prefillData`, but `App.tsx:1158-1160` navigates to `/jobs/create` with `state: { prefillData }` for the AI `CREATE_JOB` action. **The AI "create job" prefill does nothing in the live app.** Uncommitted edits were also made to `src/components/{ClientsView,DailyJobReportForm,ForumView,NoteForm,SignaturePad,TemplateSelector}.tsx`, `src/services/pdfGenerator.ts` and `src/types.ts` (+1,031/−723 lines). For SignaturePad, TemplateSelector and the ForumView `select('id')` change the root copy has the same fix, so those edits were duplicated work.
- **Fix:** port the `prefillData` effect from `src/components/JobForm.tsx:22-74` into `components/JobForm.tsx`, then delete the dead `src/` files (Cleanup). Optionally move `src/hooks`, `src/config` and `src/utils/aiTemplateUtils.ts` to root `hooks/`, `config/`, `utils/` so there is one tree.

#### INFRA-009: Dead service worker, broken PWA assets
- **Severity:** Low · **Status:** CONFIRMED
- **Location:** `sw.js` (root, not in `public/`, so it is not copied to `dist/`; no `navigator.serviceWorker.register` anywhere, now or in git history); `manifest.json` icons point at `https://images.contractordocs.app/contractor-icon.png`.
- **What's wrong:** the file suggests offline support that does not exist. If it were registered as written, it would cache `/` and `/index.html` stale-while-revalidate under a fixed `contractordocs-v1` name, serve an old `index.html` that references deleted hashed chunks after each deploy, and break the app until a second reload.
- **Fix:** delete `sw.js`. If offline mode is wanted, use `vite-plugin-pwa` (`registerType: 'prompt'`, `navigateFallback: '/index.html'`, network-first for HTML, versioned precache from the build manifest). Host the manifest icons in `public/`.

#### INFRA-010: `.gitignore` gaps and tracked junk
- **Severity:** Low · **Status:** CONFIRMED
- **Tracked but should not be:** `supabase/.temp/*` (project ref, pooler URL, CLI versions), `ts_errors.txt`, `tsc_output.txt`, `html` (stray 19-byte file containing "/hi clearyui zsc…"), `temp/*.jpg` (24 files, 9 MB; `temp/N.jpg` is byte-identical to `public/templates/N.jpg`), `my-pdf-app/` (unused, breaks tsc), `utils/templates/1.pptx` (3.1 MB), `utils/templates/analyze_template.js`, `metadata.json` (AI Studio leftover).
- **Untracked and not ignored:** `list_models.js/.ts` (secret), `models.json`, `models.txt`, `ts_errors_utf8.txt`, `tsc_output_debug.txt`, `document-ai-qa-invoice.png`, `.claude/settings.local.json`, `.qodo/`. `.env` is not ignored (only `*.local`).
- **Fix:** see section 4 (Cleanup plan) for the `.gitignore` block and the commands.

#### INFRA-011: Dead code inside the live tree
- **Severity:** Low · **Status:** CONFIRMED (no import found by basename search)
- **List:** `components/DocumentWidgets/` (33 files, including `DocumentWidgetRenderer.tsx`), `utils/widgetDataBuilders.ts`, `utils/dailyReportSetup.ts`, `src/config/widgetCatalog.ts` (only used by `widgetDataBuilders`), `hooks/useDocumentDraftPrefill.ts`, `hooks/useLocalStorage.ts` (0 bytes), `src/App.tsx` (0 bytes), `public/template-test.html`, `public/templates/*.jpg` (not referenced by code; verify before deleting).
- **Fix:** these look like an unfinished feature (all untracked, created May 2026). Either wire `DocumentWidgetRenderer` into the document views or move the set to a feature branch; delete the two 0-byte files.

#### INFRA-012: Root markdown docs are inaccurate or historical
- **Severity:** Low · **Status:** CONFIRMED
- **Findings:**
  - `DEPLOYMENT_GUIDE.md`: tells users to add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as secrets. Those are injected automatically, and the CLI refuses secrets prefixed `SUPABASE_`. It omits `--no-verify-jwt` (needed for PayPal, SEC-004), the PayPal verification secrets, and the other three functions and their secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`). It lists `PAYMENT.SALE.DENIED`, which the code ignores.
  - `FIX_SUMMARY.md`: a one-off changelog for a TemplateSelector crash ("running on http://localhost:3001/"), not documentation.
  - `HOW_TO_ADD_TEMPLATES.md`, `FIVE_NEW_TEMPLATES.md`, `HTML_TEMPLATE_2_GLASSMORPHISM.md`, `utils/templates/TEMPLATE_ANALYSIS_1.md`: AI-generated design notes about a specific session; line references (for example "templateColors around line 15") no longer match.
  - `README.md` (75 bytes) has no setup, environment variables, SQL order, or deploy steps.
  - `persistent_tracking.sql` comments claim limits are enforced by "the application" (client only, SEC-003).
- **Fix:** move the historical docs to `docs/history/`; rewrite `README.md` (prerequisites, `.env.example`, `supabase db push`, `supabase functions deploy` with the `config.toml`, the secrets list, `npm run dev`/`build`/`typecheck`); replace `DEPLOYMENT_GUIDE.md` with a corrected version.

---

## 2b. Consolidated, idempotent schema migration (copy as-is)

The same content is in `PROJECT_AUDIT/06b_proposed_consolidated_schema.sql`. PART A is safe to run with the current frontend; PART B (commented out at the end) runs after the frontend changes from SEC-001 and SEC-012 are deployed. It covers every table, column, bucket, RPC and trigger the code uses (matrix 1.3), reconciles the conflicting definitions from DB-002, and contains the SQL fixes for SEC-001/002/003/007/008/010/011/012 and DB-001/003/004/005/006.

```sql
-- =============================================================================
-- ContractorDocs: consolidated, idempotent baseline schema (PROPOSAL)
-- Source: PROJECT_AUDIT/06_database_security_build_infra.md
--
-- Replaces: the SQL string embedded in App.tsx (SQL_SETUP_SCRIPT), supabase_setup.sql,
-- supabase_ai_schema.sql, persistent_tracking.sql, create_user_credentials.sql,
-- create_user_gmail_accounts.sql, SQL_*.sql, FIX_ASSEMBLIES.sql,
-- supabase/egress_optimization_indexes.sql.
--
-- HOW TO USE
--   1. Take a backup first (Dashboard > Database > Backups, or pg_dump).
--   2. Run PART A on a staging copy, then on production. PART A is safe to run
--      before any frontend change: it keeps every column, RPC name and argument
--      list the current frontend uses.
--   3. PART B changes what the browser can read or write. Deploy the frontend
--      changes listed in the audit (section "Fix" of SEC-001 / SEC-012) FIRST,
--      then run PART B.
--   4. Save this file as supabase/migrations/<timestamp>_baseline.sql so there is
--      one source of truth, and delete the SQL string from App.tsx.
--
-- Everything is wrapped in a transaction: if any statement fails, nothing changes.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PART A.0  Extensions and helpers
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- PART A.1  Tables and columns (CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS)
-- -----------------------------------------------------------------------------

-- profiles ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email                 text,
  ADD COLUMN IF NOT EXISTS name                  text,
  ADD COLUMN IF NOT EXISTS company_name          text,
  ADD COLUMN IF NOT EXISTS logo_url              text,
  ADD COLUMN IF NOT EXISTS profile_picture_url   text,
  ADD COLUMN IF NOT EXISTS address               text,
  ADD COLUMN IF NOT EXISTS phone                 text,
  ADD COLUMN IF NOT EXISTS website               text,
  ADD COLUMN IF NOT EXISTS job_title             text,
  ADD COLUMN IF NOT EXISTS subscription_tier     text    DEFAULT 'Basic',
  ADD COLUMN IF NOT EXISTS subscription_status   text,               -- written by paypal-webhook, was never created
  ADD COLUMN IF NOT EXISTS paypal_subscription_id text,              -- lets the webhook map PAYMENT.SALE.* events
  ADD COLUMN IF NOT EXISTS language              text    DEFAULT 'English',
  ADD COLUMN IF NOT EXISTS email_templates       jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS theme                 text,
  ADD COLUMN IF NOT EXISTS email_usage           integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_usage_month     text,
  ADD COLUMN IF NOT EXISTS ai_credits_remaining  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_addon_active       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmail_access_token    text,   -- LEGACY: still read by App.tsx:1470. Dropped in PART B.
  ADD COLUMN IF NOT EXISTS gmail_refresh_token   text,   -- LEGACY: idem.
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

-- clients ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email      text,
  ADD COLUMN IF NOT EXISTS phone      text,
  ADD COLUMN IF NOT EXISTS address    text,
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS portal_key text DEFAULT encode(extensions.gen_random_bytes(16), 'hex');
UPDATE public.clients SET portal_key = encode(extensions.gen_random_bytes(16), 'hex') WHERE portal_key IS NULL;

-- jobs -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS client_name    text,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS start_date     date,
  ADD COLUMN IF NOT EXISTS end_date       date,
  ADD COLUMN IF NOT EXISTS status         text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS worker_name    text;               -- used by App.tsx:1576/2061, never created before

-- documents --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id     uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  type       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS public_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();
UPDATE public.documents SET public_token = gen_random_uuid() WHERE public_token IS NULL;
-- Cheap boolean for list views so the base64 signature image is not shipped in every row (DB-005).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'has_client_signature') THEN
    ALTER TABLE public.documents
      ADD COLUMN has_client_signature boolean
      GENERATED ALWAYS AS (coalesce(data->>'clientSignatureUrl', '') <> '') STORED;
  END IF;
END $$;

-- price book -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_book_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  parent_id  uuid REFERENCES public.price_book_categories(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saved_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.saved_items
  ADD COLUMN IF NOT EXISTS description    text,
  ADD COLUMN IF NOT EXISTS rate           numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category       text    DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS category_id    uuid REFERENCES public.price_book_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type           text    DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS images         jsonb   DEFAULT '[]'::jsonb,  -- no-op if an older TEXT[] column exists
  ADD COLUMN IF NOT EXISTS taxable        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sku            text,
  ADD COLUMN IF NOT EXISTS markup         numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_assembly    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS assembly_items jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_favorite    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_used_at   timestamptz,
  ADD COLUMN IF NOT EXISTS use_count      integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.price_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid REFERENCES public.saved_items(id) ON DELETE CASCADE,
  old_price  numeric, new_price numeric, old_cost numeric, new_cost numeric,
  changed_at timestamptz DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.item_vendors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid REFERENCES public.saved_items(id) ON DELETE CASCADE,
  vendor_name    text NOT NULL,
  vendor_sku     text,
  vendor_price   numeric,
  lead_time_days integer,
  is_preferred   boolean DEFAULT false,
  last_updated   timestamptz DEFAULT now(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- assembly_components: SQL_ASSEMBLIES_FEATURE.sql used component_id, FIX_ASSEMBLIES.sql used
-- component_item_id. Converge on component_item_id (the name the SQL function uses).
CREATE TABLE IF NOT EXISTS public.assembly_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id       uuid NOT NULL REFERENCES public.saved_items(id) ON DELETE CASCADE,
  component_item_id uuid REFERENCES public.saved_items(id) ON DELETE RESTRICT,
  quantity          numeric NOT NULL DEFAULT 1,
  override_price    numeric,
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE public.assembly_components ADD COLUMN IF NOT EXISTS component_item_id uuid REFERENCES public.saved_items(id) ON DELETE RESTRICT;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'assembly_components' AND column_name = 'component_id') THEN
    EXECUTE 'UPDATE public.assembly_components SET component_item_id = component_id WHERE component_item_id IS NULL';
    EXECUTE 'ALTER TABLE public.assembly_components ALTER COLUMN component_id DROP NOT NULL';
  END IF;
END $$;

-- inventory --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS category            text,
  ADD COLUMN IF NOT EXISTS unit                text,
  ADD COLUMN IF NOT EXISTS cost_price          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier            text,
  ADD COLUMN IF NOT EXISTS location            text,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS is_assembly         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS assembly_items      jsonb   DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.inventory_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  action          text NOT NULL,
  quantity_change integer NOT NULL,
  notes           text,
  job_id          uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

-- AI ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_chat_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  messages   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_chat_history
  ADD COLUMN IF NOT EXISTS scope    text DEFAULT 'dashboard',
  ADD COLUMN IF NOT EXISTS scope_id text;

CREATE TABLE IF NOT EXISTS public.ai_generated_documents (   -- defined in supabase_ai_schema.sql, unused by code
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type  text NOT NULL,
  document_name  text NOT NULL,
  template_style text NOT NULL,
  form_payload   jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Google credentials -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  access_token  text NOT NULL,
  refresh_token text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);
ALTER TABLE public.user_credentials ADD COLUMN IF NOT EXISTS expires_at timestamptz;
DROP TRIGGER IF EXISTS tr_user_credentials_updated_at ON public.user_credentials;
CREATE TRIGGER tr_user_credentials_updated_at
  BEFORE UPDATE ON public.user_credentials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- user_gmail_accounts: App.tsx created it with column "email"; create_user_gmail_accounts.sql and
-- the code (gmail-auth, CommunicationView, batchEmailSender) use "gmail_address". Converge.
CREATE TABLE IF NOT EXISTS public.user_gmail_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_address text,
  refresh_token text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE public.user_gmail_accounts
  ADD COLUMN IF NOT EXISTS gmail_address text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'user_gmail_accounts' AND column_name = 'email') THEN
    EXECUTE 'UPDATE public.user_gmail_accounts SET gmail_address = email WHERE gmail_address IS NULL';
    EXECUTE 'ALTER TABLE public.user_gmail_accounts ALTER COLUMN email DROP NOT NULL';
  END IF;
END $$;
-- gmail-auth upserts without refresh_token when Google does not return one: must be nullable.
ALTER TABLE public.user_gmail_accounts ALTER COLUMN refresh_token DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_gmail_accounts_user_gmail_key
  ON public.user_gmail_accounts (user_id, gmail_address);
DROP TRIGGER IF EXISTS tr_user_gmail_accounts_updated_at ON public.user_gmail_accounts;
CREATE TRIGGER tr_user_gmail_accounts_updated_at
  BEFORE UPDATE ON public.user_gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Forum and notifications (used by components/ForumView.tsx, never defined in any SQL file).
-- FKs point at public.profiles so PostgREST embeds like profiles:user_id(name, ...) resolve.
CREATE TABLE IF NOT EXISTS public.forum_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text,
  category    text,
  image_url   text,
  youtube_url text,
  upvotes     integer NOT NULL DEFAULT 0,
  downvotes   integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.forum_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    text,
  image_url  text,
  upvotes    integer NOT NULL DEFAULT 0,
  downvotes  integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.forum_votes (
  post_id   uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.forum_comment_votes (
  comment_id uuid NOT NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote_type  text NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           text NOT NULL,
  post_id        uuid REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  is_read        boolean NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
-- ForumView upserts with onConflict 'post_id, user_id' / 'comment_id, user_id': needs a unique key
-- even if the tables pre-exist with a surrogate id.
CREATE UNIQUE INDEX IF NOT EXISTS forum_votes_post_user_key         ON public.forum_votes (post_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS forum_comment_votes_comment_user_key ON public.forum_comment_votes (comment_id, user_id);

-- -----------------------------------------------------------------------------
-- PART A.2  Indexes (all filters/orders used by the frontend)
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS documents_public_token_key ON public.documents (public_token);
CREATE UNIQUE INDEX IF NOT EXISTS clients_portal_key_key     ON public.clients (portal_key);
CREATE INDEX IF NOT EXISTS idx_documents_user_created_at     ON public.documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_job_created_at ON public.documents (user_id, job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_job_id              ON public.documents (job_id);           -- FK, ON DELETE CASCADE from jobs
CREATE INDEX IF NOT EXISTS idx_documents_user_client_name    ON public.documents (user_id, (data->>'clientName'));
CREATE INDEX IF NOT EXISTS idx_jobs_user_created_at          ON public.jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_user_client_name         ON public.jobs (user_id, client_name);
CREATE INDEX IF NOT EXISTS idx_clients_user_name             ON public.clients (user_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_user_name           ON public.inventory (user_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_history_user_created_at ON public.inventory_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_history_item        ON public.inventory_history (item_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_user_name         ON public.saved_items (user_id, name);
CREATE INDEX IF NOT EXISTS idx_saved_items_favorites         ON public.saved_items (user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_saved_items_last_used         ON public.saved_items (user_id, last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_price_history_item            ON public.price_history (item_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_vendors_item             ON public.item_vendors (item_id);
CREATE INDEX IF NOT EXISTS idx_assembly_components_assembly  ON public.assembly_components (assembly_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_created  ON public.ai_chat_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_scope    ON public.ai_chat_history (user_id, scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_category_created  ON public.forum_posts (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user              ON public.forum_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post           ON public.forum_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_forum_votes_user              ON public.forum_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_forum_comment_votes_user      ON public.forum_comment_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread     ON public.notifications (user_id, is_read, created_at DESC);

-- -----------------------------------------------------------------------------
-- PART A.3  Row Level Security: reset every app table to a known set of policies.
-- Old policies with other names (for example a permissive "anyone can update forum
-- posts" policy created by hand) would otherwise stay active, because permissive
-- policies are OR-ed together.
-- NOTE: the profiles SELECT policy stays permissive here (forum needs author names)
-- and is tightened in PART B.
-- -----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','clients','jobs','documents','saved_items','price_book_categories',
                        'price_history','item_vendors','assembly_components','inventory','inventory_history',
                        'ai_chat_history','ai_generated_documents','user_credentials','user_gmail_accounts',
                        'forum_posts','forum_comments','forum_votes','forum_comment_votes','notifications')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_book_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_vendors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_components    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credentials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_gmail_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comment_votes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;

-- profiles (interim: any signed-in user can read rows, needed by forum author embeds; see PART B)
CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Owner-only tables (user_id column)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','jobs','documents','saved_items','price_book_categories','item_vendors',
                           'inventory','inventory_history','ai_chat_history','ai_generated_documents',
                           'user_credentials','user_gmail_accounts']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
                   t || '_owner_all', t);
  END LOOP;
END $$;

-- documents.job_id must belong to the same user (stops attaching rows to someone else's job)
CREATE OR REPLACE FUNCTION public.enforce_document_job_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = NEW.job_id AND j.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'job % does not belong to user %', NEW.job_id, NEW.user_id USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_documents_job_owner ON public.documents;
CREATE TRIGGER trg_documents_job_owner BEFORE INSERT OR UPDATE OF job_id, user_id ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_job_owner();

-- price_history: owned through changed_by
CREATE POLICY price_history_select_own ON public.price_history FOR SELECT TO authenticated USING (changed_by = auth.uid());
CREATE POLICY price_history_insert_own ON public.price_history FOR INSERT TO authenticated WITH CHECK (changed_by = auth.uid());

-- assembly_components: both sides must be the caller's items
CREATE POLICY assembly_components_owner_all ON public.assembly_components FOR ALL TO authenticated
  USING (assembly_id IN (SELECT id FROM public.saved_items WHERE user_id = auth.uid()))
  WITH CHECK (assembly_id IN (SELECT id FROM public.saved_items WHERE user_id = auth.uid())
          AND (component_item_id IS NULL OR component_item_id IN (SELECT id FROM public.saved_items WHERE user_id = auth.uid())));

-- forum: everyone signed in can read; only authors can change their own rows
CREATE POLICY forum_posts_select    ON public.forum_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_posts_insert    ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_posts_update    ON public.forum_posts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_posts_delete    ON public.forum_posts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY forum_comments_select ON public.forum_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_comments_insert ON public.forum_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_comments_update ON public.forum_comments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_comments_delete ON public.forum_comments FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY forum_votes_own         ON public.forum_votes         FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_comment_votes_own ON public.forum_comment_votes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_insert_as_source ON public.notifications FOR INSERT TO authenticated WITH CHECK (source_user_id = auth.uid());

-- Vote counters are maintained by the database. The browser's own writes to
-- upvotes/downvotes (ForumView.tsx:358 and :385) are ignored instead of rejected,
-- so the current frontend keeps working.
CREATE OR REPLACE FUNCTION public.guard_vote_counters()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.upvotes := OLD.upvotes;
    NEW.downvotes := OLD.downvotes;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_forum_posts_guard_counters ON public.forum_posts;
CREATE TRIGGER trg_forum_posts_guard_counters BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_vote_counters();
DROP TRIGGER IF EXISTS trg_forum_comments_guard_counters ON public.forum_comments;
CREATE TRIGGER trg_forum_comments_guard_counters BEFORE UPDATE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_vote_counters();

CREATE OR REPLACE FUNCTION public.recount_post_votes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_post uuid := coalesce(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE public.forum_posts p SET
    upvotes   = (SELECT count(*) FROM public.forum_votes v WHERE v.post_id = v_post AND v.vote_type = 'up'),
    downvotes = (SELECT count(*) FROM public.forum_votes v WHERE v.post_id = v_post AND v.vote_type = 'down')
  WHERE p.id = v_post;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_forum_votes_recount ON public.forum_votes;
CREATE TRIGGER trg_forum_votes_recount AFTER INSERT OR UPDATE OR DELETE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.recount_post_votes();

CREATE OR REPLACE FUNCTION public.recount_comment_votes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_comment uuid := coalesce(NEW.comment_id, OLD.comment_id);
BEGIN
  UPDATE public.forum_comments c SET
    upvotes   = (SELECT count(*) FROM public.forum_comment_votes v WHERE v.comment_id = v_comment AND v.vote_type = 'up'),
    downvotes = (SELECT count(*) FROM public.forum_comment_votes v WHERE v.comment_id = v_comment AND v.vote_type = 'down')
  WHERE c.id = v_comment;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_forum_comment_votes_recount ON public.forum_comment_votes;
CREATE TRIGGER trg_forum_comment_votes_recount AFTER INSERT OR UPDATE OR DELETE ON public.forum_comment_votes
  FOR EACH ROW EXECUTE FUNCTION public.recount_comment_votes();

-- -----------------------------------------------------------------------------
-- PART A.4  Billing and credit columns can only be changed by the server
-- (service_role / postgres). Browser writes to them are silently ignored, so
-- App.tsx:1288 (client-side "upgrade to Premium") stops working by design and the
-- PayPal webhook becomes the only source of truth.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_billing_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.subscription_tier      := 'Basic';
      NEW.subscription_status    := NULL;
      NEW.paypal_subscription_id := NULL;
      NEW.ai_credits_remaining   := 0;
      NEW.ai_addon_active        := false;
    ELSE
      NEW.subscription_tier      := OLD.subscription_tier;
      NEW.subscription_status    := OLD.subscription_status;
      NEW.paypal_subscription_id := OLD.paypal_subscription_id;
      NEW.ai_credits_remaining   := OLD.ai_credits_remaining;
      NEW.ai_addon_active        := OLD.ai_addon_active;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_protect_billing ON public.profiles;
CREATE TRIGGER trg_profiles_protect_billing BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_billing_columns();

-- Server-side free-plan limits (mirrors FREE_LIMITS in App.tsx:1285: 6 jobs, 15 clients, 12 docs per month)
-- Deliberately SECURITY INVOKER: current_user must stay 'authenticated' for browser
-- requests (inside a SECURITY DEFINER function current_user is the owner), and RLS
-- already limits the counts to the caller's own rows.
CREATE OR REPLACE FUNCTION public.enforce_free_plan_limits()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_tier text; v_count int; v_limit int;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  SELECT subscription_tier INTO v_tier FROM public.profiles WHERE id = NEW.user_id;
  IF coalesce(v_tier, 'Basic') = 'Premium' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'jobs' THEN
    v_limit := 6;
    SELECT count(*) INTO v_count FROM public.jobs WHERE user_id = NEW.user_id AND created_at >= date_trunc('month', now());
  ELSIF TG_TABLE_NAME = 'clients' THEN
    v_limit := 15;
    SELECT count(*) INTO v_count FROM public.clients WHERE user_id = NEW.user_id;
  ELSE
    v_limit := 12;
    SELECT count(*) INTO v_count FROM public.documents WHERE user_id = NEW.user_id AND created_at >= date_trunc('month', now());
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'FREE_PLAN_LIMIT: % limit (%) reached', TG_TABLE_NAME, v_limit USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
-- Enable after checking the numbers match the product rules in checkLimit() (App.tsx:1293):
-- DROP TRIGGER IF EXISTS trg_jobs_free_limit ON public.jobs;
-- CREATE TRIGGER trg_jobs_free_limit BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_free_plan_limits();
-- DROP TRIGGER IF EXISTS trg_clients_free_limit ON public.clients;
-- CREATE TRIGGER trg_clients_free_limit BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.enforce_free_plan_limits();
-- DROP TRIGGER IF EXISTS trg_documents_free_limit ON public.documents;
-- CREATE TRIGGER trg_documents_free_limit BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.enforce_free_plan_limits();

-- Atomic AI credit consumption for the process-contractor-ai edge function (service_role only)
CREATE OR REPLACE FUNCTION public.consume_ai_credit(p_user_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.profiles
     SET ai_credits_remaining = ai_credits_remaining - 1
   WHERE id = p_user_id AND ai_credits_remaining > 0
  RETURNING ai_credits_remaining;
$$;

-- -----------------------------------------------------------------------------
-- PART A.5  Public portal / approval RPCs (anon-callable). Same names and
-- arguments as before, so PortalView.tsx and DocumentApprovalView.tsx keep working.
-- Changes: only public business fields of the contractor are returned (no tokens),
-- signing checks that the document belongs to that client, signatures cannot be
-- overwritten, errors are raised (the old jsonb {"error"} return made the UI report success).
-- DROP first because older versions returned json/void and CREATE OR REPLACE
-- cannot change a return type (this is why the App.tsx script failed when it was
-- run after supabase_setup.sql).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_portal_data(text);
DROP FUNCTION IF EXISTS public.sign_document_via_portal(text, uuid, text);
DROP FUNCTION IF EXISTS public.get_document_by_token(uuid);
DROP FUNCTION IF EXISTS public.approve_document_by_token(uuid, text);

CREATE OR REPLACE FUNCTION public._contractor_public_info(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'name', p.name, 'company_name', p.company_name, 'logo_url', p.logo_url,
    'phone', p.phone, 'email', p.email, 'website', p.website, 'address', p.address)
  FROM public.profiles p WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public._client_document_ids(p_client_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT d.id
  FROM public.clients c
  JOIN public.documents d ON d.user_id = c.user_id
  LEFT JOIN public.jobs j ON j.id = d.job_id
  WHERE c.id = p_client_id
    AND (d.data->>'clientName' = c.name OR j.client_name = c.name);
$$;

CREATE OR REPLACE FUNCTION public.get_portal_data(p_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client public.clients%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(p_key) < 32 THEN
    RAISE EXCEPTION 'Invalid portal key' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_client FROM public.clients WHERE portal_key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid portal key' USING ERRCODE = '28000';
  END IF;
  RETURN jsonb_build_object(
    'client', jsonb_build_object('id', v_client.id, 'name', v_client.name, 'email', v_client.email,
                                 'phone', v_client.phone, 'address', v_client.address),
    'contractor', public._contractor_public_info(v_client.user_id),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'type', d.type, 'data', d.data, 'created_at', d.created_at)
                       ORDER BY d.created_at DESC)
      FROM public.documents d
      WHERE d.id IN (SELECT public._client_document_ids(v_client.id))
    ), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.sign_document_via_portal(p_key text, p_doc_id uuid, p_signature text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client public.clients%ROWTYPE; v_data jsonb;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE portal_key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid portal key' USING ERRCODE = '28000'; END IF;
  IF p_doc_id NOT IN (SELECT public._client_document_ids(v_client.id)) THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_signature IS NULL OR p_signature !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$' OR length(p_signature) > 400000 THEN
    RAISE EXCEPTION 'Invalid signature image' USING ERRCODE = '22023';
  END IF;
  SELECT data INTO v_data FROM public.documents WHERE id = p_doc_id FOR UPDATE;
  IF coalesce(v_data->>'clientSignatureUrl', '') <> '' THEN
    RAISE EXCEPTION 'Document already signed' USING ERRCODE = '23505';
  END IF;
  UPDATE public.documents
     SET data = data || jsonb_build_object('clientSignatureUrl', p_signature, 'status', 'Accepted',
                                           'clientSignedAt', now()::text, 'clientSignedBy', v_client.name),
         updated_at = now()
   WHERE id = p_doc_id;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.get_document_by_token(doc_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE public_token = doc_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired approval link' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'document', jsonb_build_object('id', v_doc.id, 'type', v_doc.type, 'data', v_doc.data, 'created_at', v_doc.created_at),
    'contractor', public._contractor_public_info(v_doc.user_id));
END $$;

CREATE OR REPLACE FUNCTION public.approve_document_by_token(doc_token uuid, p_signature text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE public_token = doc_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid approval token' USING ERRCODE = 'P0002'; END IF;
  IF p_signature IS NULL OR p_signature !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$' OR length(p_signature) > 400000 THEN
    RAISE EXCEPTION 'Invalid signature image' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_doc.data->>'clientSignatureUrl', '') <> '' THEN
    RAISE EXCEPTION 'Document already signed' USING ERRCODE = '23505';
  END IF;
  UPDATE public.documents
     SET data = data || jsonb_build_object('clientSignatureUrl', p_signature, 'status', 'Accepted',
                                           'clientSignedAt', now()::text, 'clientSignedBy', v_doc.data->>'clientName'),
         updated_at = now()
   WHERE id = v_doc.id;
  RETURN jsonb_build_object('success', true, 'message', 'Document signed successfully');
END $$;

-- Mark-as-viewed without rewriting the whole JSON (fixes DB-001)
CREATE OR REPLACE FUNCTION public.mark_documents_viewed(p_ids uuid[])
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH u AS (
    UPDATE public.documents
       SET data = data || '{"viewedByProvider": true}'::jsonb
     WHERE id = ANY (p_ids) AND user_id = auth.uid()
    RETURNING 1)
  SELECT count(*)::int FROM u;
$$;

-- -----------------------------------------------------------------------------
-- PART A.6  Inventory functions and the single set of document triggers
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.adjust_inventory(uuid, integer, uuid, text);
CREATE OR REPLACE FUNCTION public.adjust_inventory(p_item_id uuid, p_delta integer, p_job_id uuid DEFAULT NULL, p_context text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_next integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  UPDATE public.inventory SET quantity = quantity + coalesce(p_delta, 0)
   WHERE id = p_item_id AND user_id = v_user AND quantity + coalesce(p_delta, 0) >= 0
  RETURNING quantity INTO v_next;
  IF v_next IS NULL THEN RAISE EXCEPTION 'Inventory item not found or insufficient stock' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.inventory_history (user_id, item_id, action, quantity_change, notes, job_id)
  VALUES (v_user, p_item_id, CASE WHEN p_delta < 0 THEN 'deduct' ELSE 'restock' END, p_delta, p_context, p_job_id);
  RETURN v_next;
END $$;

DROP FUNCTION IF EXISTS public.apply_document_inventory_delta(uuid, uuid, jsonb, integer, uuid, text);
CREATE OR REPLACE FUNCTION public.apply_document_inventory_delta(
  p_user_id uuid, p_doc_id uuid, p_line_items jsonb, p_direction integer,
  p_job_id uuid DEFAULT NULL, p_context text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE li jsonb; v_item_id uuid; v_qty integer; v_prev integer; v_next integer;
BEGIN
  IF p_line_items IS NULL OR jsonb_typeof(p_line_items) <> 'array' THEN RETURN; END IF;
  FOR li IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    IF li ? 'track_inventory' AND lower(coalesce(li->>'track_inventory', 'true')) = 'false' THEN CONTINUE; END IF;
    BEGIN
      v_item_id := coalesce(nullif(li->>'inventoryItemId', ''), nullif(li->>'item_id', ''))::uuid;
    EXCEPTION WHEN others THEN v_item_id := NULL; END;
    IF v_item_id IS NULL THEN CONTINUE; END IF;
    BEGIN
      v_qty := ceil(coalesce(nullif(li->>'quantity', '')::numeric, 0))::integer;
    EXCEPTION WHEN others THEN v_qty := 0; END;
    IF v_qty <= 0 THEN CONTINUE; END IF;
    SELECT quantity INTO v_prev FROM public.inventory WHERE id = v_item_id AND user_id = p_user_id FOR UPDATE;
    IF v_prev IS NULL THEN CONTINUE; END IF;
    v_next := v_prev + (p_direction * v_qty);
    IF v_next < 0 THEN RAISE EXCEPTION 'Insufficient stock for item %', v_item_id; END IF;
    UPDATE public.inventory SET quantity = v_next WHERE id = v_item_id AND user_id = p_user_id;
    INSERT INTO public.inventory_history (user_id, item_id, action, quantity_change, notes, job_id)
    VALUES (p_user_id, v_item_id, CASE WHEN (p_direction * v_qty) < 0 THEN 'deduct' ELSE 'restock' END,
            p_direction * v_qty, coalesce(p_context, '') || ' doc:' || p_doc_id::text, p_job_id);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.trg_documents_inventory() CASCADE;
DROP FUNCTION IF EXISTS public.trg_documents_invoice_inventory() CASCADE;  -- removes the duplicate App.tsx trigger set
CREATE OR REPLACE FUNCTION public.trg_documents_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rec public.documents%ROWTYPE := coalesce(NEW, OLD);
  old_c boolean := false; new_c boolean := false; v_ctx text;
BEGIN
  IF rec.type NOT IN ('Invoice', 'Estimate', 'Change Order') THEN RETURN rec; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN old_c := lower(coalesce(OLD.data->>'status', 'Draft')) IN ('approved', 'accepted', 'paid'); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN new_c := lower(coalesce(NEW.data->>'status', 'Draft')) IN ('approved', 'accepted', 'paid'); END IF;
  v_ctx := lower(rec.type) || ':' || coalesce(rec.data->>'invoiceNumber', rec.data->>'estimateNumber', rec.data->>'changeOrderNumber', rec.id::text);

  IF TG_OP = 'INSERT' AND new_c THEN
    PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_ctx);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT old_c AND new_c THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_ctx);
    ELSIF old_c AND NOT new_c THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, OLD.data->'lineItems', +1, NEW.job_id, v_ctx);
    ELSIF old_c AND new_c AND OLD.data->'lineItems' IS DISTINCT FROM NEW.data->'lineItems'
          AND NEW.data ? 'lineItems' THEN   -- never "restore" stock because a partial JSON lost lineItems
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, OLD.data->'lineItems', +1, NEW.job_id, v_ctx);
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_ctx);
    END IF;
  ELSIF TG_OP = 'DELETE' AND old_c THEN
    PERFORM public.apply_document_inventory_delta(OLD.user_id, OLD.id, OLD.data->'lineItems', +1, OLD.job_id, v_ctx);
  END IF;
  RETURN rec;
END $$;
DROP TRIGGER IF EXISTS trg_documents_inventory_insert ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_inventory_update ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_inventory_delete ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_insert ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_update ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_delete ON public.documents;
CREATE TRIGGER trg_documents_inventory_insert AFTER INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.trg_documents_inventory();
CREATE TRIGGER trg_documents_inventory_update AFTER UPDATE OF data ON public.documents FOR EACH ROW EXECUTE FUNCTION public.trg_documents_inventory();
CREATE TRIGGER trg_documents_inventory_delete AFTER DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.trg_documents_inventory();

-- Two incompatible overloads existed (SQL_ASSEMBLIES_FEATURE.sql and FIX_ASSEMBLIES.sql); the second one
-- called adjust_inventory() with saved_items ids, which are never inventory ids. Neither is called by the app.
DROP FUNCTION IF EXISTS public.deduct_assembly_inventory(uuid, numeric);
DROP FUNCTION IF EXISTS public.deduct_assembly_inventory(uuid, integer, uuid, text);

DROP TRIGGER IF EXISTS tr_documents_updated_at ON public.documents;
CREATE TRIGGER tr_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- PART A.7  Function privileges. Supabase grants EXECUTE on new public functions
-- to anon and authenticated through default privileges, so REVOKE FROM PUBLIC alone
-- is not enough.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.apply_document_inventory_delta(uuid, uuid, jsonb, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid)                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._contractor_public_info(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_document_ids(uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_document_job_owner()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_free_plan_limits()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recount_post_votes()                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recount_comment_votes()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_documents_inventory()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_inventory(uuid, integer, uuid, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_documents_viewed(uuid[])                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_documents_viewed(uuid[])             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_document_via_portal(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_by_token(uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_document_by_token(uuid, text)     TO anon, authenticated;

-- Refresh tokens never need to reach the browser (gmail-auth uses service_role).
-- CommunicationView.tsx and batchEmailSender.ts only select gmail_address and delete rows.
REVOKE ALL ON public.user_gmail_accounts FROM anon, authenticated;
GRANT SELECT (id, user_id, gmail_address, created_at, updated_at) ON public.user_gmail_accounts TO authenticated;
GRANT DELETE ON public.user_gmail_accounts TO authenticated;

-- -----------------------------------------------------------------------------
-- PART A.8  Storage buckets (logos, forum, price-book-images) and owner-folder policies.
-- uploadFile() in App.tsx:787 writes to "<userId>/<timestamp>.<ext>" and reads with
-- getPublicUrl(), so the buckets stay public for reads; writes are limited to the
-- caller's own folder, image types and 5 MB.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('logos',             'logos',             true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']),
  ('forum',             'forum',             true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif']),
  ('price-book-images', 'price-book-images', true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
-- SVG can carry script; drop 'image/svg+xml' from logos if logos are ever opened directly in the browser.

DROP POLICY IF EXISTS "Allow public view access to logos"   ON storage.objects;
DROP POLICY IF EXISTS "Allow users to upload their own logo" ON storage.objects;
DROP POLICY IF EXISTS app_images_select_own ON storage.objects;
DROP POLICY IF EXISTS app_images_insert_own ON storage.objects;
DROP POLICY IF EXISTS app_images_update_own ON storage.objects;
DROP POLICY IF EXISTS app_images_delete_own ON storage.objects;
CREATE POLICY app_images_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY app_images_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY app_images_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY app_images_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

NOTIFY pgrst, 'reload schema';


-- =============================================================================
-- PART B  Run ONLY after the frontend changes from the audit are deployed:
--   * ForumView.tsx embeds author data from public_profiles instead of profiles
--     (SEC-001 Fix, step 2)
--   * App.tsx no longer selects or writes profiles.gmail_access_token /
--     gmail_refresh_token, and no longer reads user_credentials tokens in the browser
--     (SEC-012 Fix)
-- =============================================================================
/*
BEGIN;

-- B.1 Profiles: only the owner reads their row; others see name and avatar through a view.
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, name, profile_picture_url FROM public.profiles;   -- owner-rights view, bypasses RLS on purpose
REVOKE ALL ON public.public_profiles FROM anon;
GRANT SELECT ON public.public_profiles TO authenticated;

-- B.2 Google tokens leave profiles (they already live in user_credentials / user_gmail_accounts).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS gmail_access_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS gmail_refresh_token;

-- B.3 user_credentials becomes server-only (read through an edge function).
REVOKE ALL ON public.user_credentials FROM anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
*/
```

---

## 3. TypeScript errors

A fresh `npx tsc --noEmit` gives **175 errors**. `PROJECT_AUDIT/_tsc_errors_raw.txt` lists only part of them (31 headers, and several continuation lines lost their headers). Breakdown:

| Group | Count | Cause | Fix |
|---|---|---|---|
| `supabase/functions/**` | 22 | Deno code (URL imports, global `Deno`) compiled by the browser tsconfig | Exclude from the root tsconfig; typecheck with `deno check` |
| `my-pdf-app/**` | 113 | Abandoned sub-project with missing modules (`../types`, `jspdf`, `./helpers`, template functions) | Delete the folder (Cleanup), or exclude it |
| `src/components/**` | 18 | Dead duplicate tree (imports `../../lib/utils.ts`, `../utils/templates/*`, icons that don't exist in `src/`) | Delete it (INFRA-008), or exclude it |
| Live code | 22 | Listed below | Per-error fixes below |

### 3.1 tsconfig fix (removes the 153 non-live errors and the two `import.meta.env` errors)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "types": ["node", "vite/client"],
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": { "@/*": ["./*"] },
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": [
    "index.tsx", "App.tsx", "types.ts", "vite.config.ts",
    "components", "services", "utils", "hooks", "lib", "scripts",
    "src/hooks", "src/config", "src/utils/aiTemplateUtils.ts"
  ],
  "exclude": [
    "node_modules", "dist", "supabase/functions", "my-pdf-app", "temp",
    "src/components", "src/services", "src/App.tsx", "src/types.ts",
    "src/utils/db.ts", "src/utils/emailTemplates.ts", "src/utils/imageCompression.ts",
    "src/utils/ocr.ts", "src/utils/translations.ts"
  ]
}
```
For the edge functions add `supabase/functions/deno.json` (INFRA-007) and run `deno check supabase/functions/*/index.ts` in CI.

### 3.2 Live-code errors: cause and exact fix

| # | Location | Error | Cause | Exact fix |
|---|---|---|---|---|
| 1 | `App.tsx:862:56` | TS2339 `Property 'env' does not exist on type 'ImportMeta'` | `types: ["node"]` stops TypeScript from loading Vite's `ImportMeta` augmentation | Add `"vite/client"` to `compilerOptions.types` (3.1), or create `vite-env.d.ts` with `/// <reference types="vite/client" />` |
| 2 | `App.tsx:3053:60` | same | same | same |
| 3 | `App.tsx:1586:17` | TS2322 fallback rows lack `worker_name` | `let { data: jobsData } = await …select('…worker_name…')` infers the type from the first query; the fallback query has no `worker_name` | Type the variable explicitly: <br>`const jobsRes = await supabase.from('jobs').select('id, user_id, name, client_name, client_address, start_date, end_date, status, worker_name, created_at').eq('user_id', user.id).order('created_at', { ascending: false });`<br>`let jobsData: Array<Record<string, any>> \| null = jobsRes.data;`<br>`let jobsError = jobsRes.error;` (keep the fallback block unchanged). Once the migration adds `jobs.worker_name`, the fallback can be deleted. |
| 4 | `components/DailyJobReportForm.tsx:257:38` | TS2339 `clientId` not on `Partial<DailyJobReportData>` | The form stores `clientId` but the type does not declare it | `types.ts:212` in `interface DailyJobReportData` add `clientId?: string;` |
| 5 | `components/DocumentAIQAHarness.tsx:36:5` | TS2561 `user_id` not in `Job` | `Job` uses camelCase `userId` | `-    user_id: 'qa-user',` → `+    userId: 'qa-user',` |
| 6 | `components/JobDocumentAIModal.tsx:379:37` | TS2322 `Promise<MasterRouterPayload>` not assignable to `void \| Promise<void>` | `AIChatMentionInput`'s `onSubmit` prop is typed to return void, but the modal passes a function that returns the payload | `components/AIChatMentionInput.tsx:27`: `onSubmit: (enrichedText: string, extras?: { attachedImages?: AttachedImage[] }) => unknown;` (the component only `await`s it, at line 101) |
| 7 | `services/batchEmailSender.ts:58:18` | TS2352 conversion to `Record<string, unknown>` | `FormData['data']` is a union that includes interfaces without an index signature (`ProfitReportData`) | `const data = form.data as unknown as Record<string, unknown>;` |
| 8 | `services/batchEmailSender.ts:84:22` | same | same | `const data = doc.data as unknown as Record<string, unknown>;` |
| 9 | `utils/aiMentionUtils.ts:13:18` | same | same | `const data = form.data as unknown as Record<string, unknown>;` |
| 10 | `utils/buildEmailBatch.ts:43:18` | same | same | `const data = form.data as unknown as Record<string, unknown>;` |
| 11 | `src/hooks/useContractorAI.ts:96:16` | TS2552 `Cannot find name 'resolveTemplateId'` | Lines 5-10 use `export { … } from '../utils/aiTemplateUtils.ts'`, which re-exports but does **not** bring the names into local scope. **Runtime `ReferenceError`** when `resolveTemplate()` is called | Add `import { resolveTemplateId, extractRichTextField } from '../utils/aiTemplateUtils.ts';` under line 3 (keep the re-export) |
| 12 | `src/hooks/useContractorAI.ts:116:16` | TS2304 `extractRichTextField` | same (runtime `ReferenceError` in `getRichTextPayload()`) | same import |
| 13 | `src/hooks/useContractorAI.ts:139:33` | TS2552 `resolveTemplateId` | same | same import |
| 14 | `src/hooks/useMasterAIRouter.ts:11:42` | TS2300 Duplicate identifier `MasterDocumentType` | `MasterDocumentType` is imported at line 11 (`import { resolveMasterDocumentType, type MasterDocumentType }`) **and** again at line 60 (`import type { MasterDocumentType }`) | Delete line 60. Keep line 59 (`export type { MasterDocumentType } from '../config/docTypeMap.ts';`) |
| 15 | `src/hooks/useMasterAIRouter.ts:60:15` | same | same | same |
| 16 | `src/hooks/useMasterAIRouter.ts:225:20` | TS2352 `MasterRouterPayload` → `Record<string, unknown>` | `MasterRouterPayload` has no index signature | `const anyRaw = raw as unknown as Record<string, unknown>;` |
| 17-21 | `src/hooks/useMasterAIRouter.ts:496:22, 515:30, 581:27, 609:30, 663:28` | TS2352 `EnrichedRouterResult` → `MasterRouterPayload` (missing `target_route`) | `enrichGenerateDocumentPayload` (`utils/documentDraft.ts:316`) takes and returns `EnrichedRouterResult`, a different shape from `MasterRouterPayload` | Add one adapter in `useMasterAIRouter.ts` and use it at the five call sites:<br>`import type { EnrichedRouterResult } from '../../utils/documentDraft.ts';`<br>`const enrichDoc = (r: MasterRouterPayload \| EnrichedRouterResult, input: string, ctx: Parameters<typeof enrichGenerateDocumentPayload>[2]): MasterRouterPayload => enrichGenerateDocumentPayload(r as unknown as EnrichedRouterResult, input, ctx) as unknown as MasterRouterPayload;`<br>then for example line 496: `result = enrichDoc({ ...result, payload: result.payload as Record<string, unknown> }, trimmedInput, { … });` |
| 22 | `src/hooks/useMasterAIRouter.ts:581:57` | TS2345 `MasterRouterPayload` not assignable to `EnrichedRouterResult` (`payload` may be an array) | `reconciledResult` is passed straight into `enrichGenerateDocumentPayload` | Same `enrichDoc(reconciledResult, trimmedInput, {…})` call |

The previously reported orphan lines (`'deductInventory' does not exist in type 'MaterialLogData'`, `Type '{}' is missing … UserProfile`) come from the dead `src/components/MaterialLogForm.tsx` and `my-pdf-app/src/index.ts` and go away with the excludes or the deletions.

After the fixes, add to `package.json`: `"typecheck": "tsc --noEmit"`, and to CI: `npm ci && npm run typecheck && npm run build`.

---

## 4. Cleanup plan

Run from the repo root in Git Bash, on `my-branch`. Do **step 0** first.

```bash
# 0. Secrets first: rotate the Gemini key in Google Cloud Console, then delete the local copies
rm -f list_models.js list_models.ts models.json models.txt

# 1. Commit the live code that is currently untracked (INFRA-002), before anything else moves
git add src/hooks src/config src/utils/aiTemplateUtils.ts \
        components/AIChatMentionInput.tsx components/AIDocumentModal.tsx components/AIDocumentReviewModal.tsx \
        components/AIVisualComponents.tsx components/BatchEmailReviewCard.tsx components/DashboardMasterAIButton.tsx \
        components/DocumentAIQAHarness.tsx components/JobDocumentAIModal.tsx components/SetupSignatureModal.tsx \
        services/batchEmailSender.ts utils/aiMentionUtils.ts utils/buildEmailBatch.ts utils/documentDraft.ts \
        utils/documentMetadata.ts utils/documentSetupPayload.ts utils/parseDocumentSetup.ts utils/richTextHtml.ts \
        supabase/functions/master-ai-router supabase/functions/process-contractor-ai scripts

# 2. Port the only fix that lives in the dead copy (INFRA-008), by hand:
#    copy the useLocation/prefillData/auto_submit effect from src/components/JobForm.tsx:22-74
#    into components/JobForm.tsx, then:

# 3. Remove the dead duplicate tree (keep src/hooks, src/config, src/utils/aiTemplateUtils.ts)
git rm -r -q src/components src/services
git rm -q src/App.tsx src/types.ts src/utils/db.ts src/utils/emailTemplates.ts \
          src/utils/imageCompression.ts src/utils/ocr.ts src/utils/translations.ts

# 4. Remove abandoned projects, scratch files and generated output
git rm -r -q my-pdf-app temp
git rm -q html ts_errors.txt tsc_output.txt metadata.json sw.js hooks/useLocalStorage.ts
rm -f ts_errors_utf8.txt tsc_output_debug.txt codex-vite.log codex-vite.err.log document-ai-qa-invoice.png

# 5. Stop tracking Supabase CLI state
git rm -r -q --cached supabase/.temp

# 6. Schema: one baseline migration; keep the old scripts only as history
mkdir -p supabase/migrations supabase/legacy_sql
cp PROJECT_AUDIT/06b_proposed_consolidated_schema.sql supabase/migrations/20261110000000_baseline.sql
git mv supabase_setup.sql create_user_credentials.sql persistent_tracking.sql \
       SQL_ASSEMBLIES_FEATURE.sql SQL_DOCUMENT_INVENTORY_LINK.sql SQL_ELITE_PRICEBOOK.sql \
       SQL_INVENTORY_ASSEMBLIES.sql SQL_MIGRATION_PRICEBOOK.sql FIX_ASSEMBLIES.sql \
       create_user_gmail_accounts.sql supabase/legacy_sql/
mv supabase_ai_schema.sql supabase/egress_optimization_indexes.sql supabase/legacy_sql/   # untracked files
# then delete SQL_SETUP_SCRIPT + DbSetupScreen from App.tsx (DB-002)

# 7. Docs: keep history out of the root
mkdir -p docs/history docs/design
git mv FIX_SUMMARY.md FIVE_NEW_TEMPLATES.md HTML_TEMPLATE_2_GLASSMORPHISM.md HOW_TO_ADD_TEMPLATES.md docs/history/
git mv utils/templates/TEMPLATE_ANALYSIS_1.md utils/templates/template_schema.json utils/templates/analyze_template.js docs/design/
git rm -q utils/templates/1.pptx          # 3.1 MB design source; keep it outside git (Drive) if still needed
# rewrite README.md and DEPLOYMENT_GUIDE.md (INFRA-012)

# 8. Unfinished widget feature (INFRA-011): either wire it in or park it on a branch
#    components/DocumentWidgets/  utils/widgetDataBuilders.ts  utils/dailyReportSetup.ts
#    hooks/useDocumentDraftPrefill.ts  src/config/widgetCatalog.ts

# 9. .gitignore additions
cat >> .gitignore <<'EOF'

# env and secrets
.env
.env.*
!.env.example

# supabase cli state
supabase/.temp/
supabase/.branches/

# tool / editor state
.claude/settings.local.json
.qodo/

# generated diagnostics and scratch output
ts_errors*.txt
tsc_output*.txt
models.json
models.txt
list_models.*
/document-ai-qa-*.png
/temp/
EOF

# 10. Environment template for the single Supabase client (INFRA-001)
cat > .env.example <<'EOF'
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PAYPAL_CLIENT_ID=<paypal client id>
EOF

git add .gitignore .env.example supabase/migrations supabase/legacy_sql docs
git status
```

Order of work after the cleanup:
1. Rotate the Gemini key (SEC-009). Apply migration PART A on staging, then production.
2. Deploy the edge function fixes (SEC-004/005/006, INFRA-007) with `supabase/config.toml`.
3. Ship the frontend fixes: DB-001, INFRA-001, SEC-003, SEC-012, SEC-001 ForumView embed, DB-005/006, the TypeScript fixes.
4. Apply migration PART B.
5. Tailwind build (INFRA-003), lazy routes (INFRA-005), CSP in Report-Only (SEC-014), then enforce it.
