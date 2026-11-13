# Parity audit v2: new app vs. the live production app (2026-11-13)

Old app = commit `25ae5cc` (the live site). New app = this working tree (uncommitted helper work included).
References: old code is cited as `25ae5cc:<path>:<line>` (same line numbers as `git show 25ae5cc:<path>`), new code as
`<path>:<line>`. Nothing in the app was changed by this audit.

Priorities: **P0** broken / data changed or lost; **P1** missing or broken feature the owner will notice; **P2** reduced
or different; **P3** small. "QUEUED" = already listed in NEXT_STEPS.md (section given).

Owner's complaint: client portal and per-client "Get approval" don't work like production; no temporary clients; many
production features missing; things saved disappear after logout/login.

---------------------------------------------------------------------------------------------------------

## 0. Live database check (read-only, anon key from lib/supabase.ts, 2026-11-13 18:20)

- `get_portal_data('000…0')` → `28000 Invalid portal link`; `get_document_by_token(<random uuid>)` → `P0002 Approval
  link not found or no longer valid`. So the NEW portal functions (20261112000200) are live. The old site at
  www.contractordocs.app runs on them too, so the problems in section A already affect the live site today.
- anon can't read tables (`permission denied for table clients`): RLS/grants OK. Portal RPC grants:
  `20261112000300_billing_storage_privileges.sql:344-349` (anon + authenticated). OK.
- Migration state on live (from which tables/functions exist):
  - **0400 (requests + job photos) IS applied**: `job_photos`, `quote_requests`, `request_pages`, `get_portal_photos`
    exist. NEXT_STEPS §0e says "NOT applied". Fix NEXT_STEPS.
  - 0200 (pay): not applied (`report_payment_via_portal` / `report_payment_by_token` missing). The portal's
    "I've paid" button (working tree) fails until it is.
  - 0300 (reminders), 0500 (user data sync): not applied (`reminders`, `user_settings`, `profit_calculations` missing).
- Old links: `/?portal=<32-hex key>` and `/?approval_token=<uuid>` still route to the portal/approval pages
  (`pages/routes.ts:50` → `index.tsx:66-68` → `App.tsx:199-200,1743-1744`; key regex `{32,128}` accepts the old keys,
  the import kept keys and tokens: `20261112000400_import_legacy_data.sql:152-153,197-198`; old approval links never
  expire: `20261113000000_legacy_links_never_expire.sql`). They open, but see A1 (drafts hidden) and A2 (expired
  estimates can't be signed): in practice most old links now show "No documents yet" or "This estimate has expired".

---------------------------------------------------------------------------------------------------------

## TOP 15 (do in this order)

| # | Item | Pri | Section |
|---|------|-----|---------|
| 1 | Portal hides every Draft document (estimates, change orders, invoices default to Draft and nothing ever marks them Sent) | P0 | A1 |
| 2 | Estimates can't be signed after their expiry date: every old unsigned estimate (old default expiry = 7 days) now says "expired" | P0 | A2 |
| 3 | Share messages point to the portal even when the document can't be shown there; receipt links are always dead | P1 | A3 |
| 4 | Declined estimates/change orders can never be sent again (UI says "Edit it… to ask again", but nothing reopens it) | P1 | A4 |
| 5 | Temporary clients: no "Temporary (N)" button, temps mixed into the main list, Convert hidden; new job/quote-request clients can't be temporary | P1 | B1 |
| 6 | Opening an old document rounds prices to cents and turns negative quantities into 0 (totals change on save) | P0 | D1 |
| 7 | Old "Repeat this invoice" settings will create up to 24 draft invoices each on first login | P1 | D2 |
| 8 | Old inventory kits lose their own stock and their cost is wiped on edit | P1 | D3 |
| 9 | Approval links expire after 60 days (old: never); "used" links are re-copied as-is | P1 | A5 |
| 10 | Duplicate job copies only the first 20 documents (Free plan: copies none if more than 12) | P1 | D4 |
| 11 | Account data that must survive logout (profit calcs, signature, labor rate, label sheet, theme): 0500 not applied, theme doesn't follow the account | P1 | C1 |
| 12 | App-level list caps hide saved items (price book > 300, inventory/clients > 500) in pickers | P2 | C2 |
| 13 | "Signed by client" badges only see the 50 newest documents; declines never badge | P2 | A6 |
| 14 | Price book: new items start at 0% markup (old 50%), kits priced at cost instead of sum of parts | P2 | D6 |
| 15 | Profit calculator Simple/Advanced switch missing (QUEUED §0d.9, but its spec there is wrong) | P1 | D5 |

---------------------------------------------------------------------------------------------------------

## A. Client portal and approvals

### How the old flow worked (end to end)
1. **Contractor gets links** (`25ae5cc:components/ClientsView.tsx`): each client card has **Portal** (copies
   `origin?portal=<portal_key>`, :169-178, :363-373) and **Get Approval** (:374-382) which opens a modal listing ALL
   the client's Estimates and Change Orders (matched by `data.clientName`, any status, newest first, :187-198) with
   **Copy Link** on every row (`origin?approval_token=<public_token>`, :200-209, :464-472). The Estimate and Change Order
   forms also have **Get Approval Link** (saves first if needed: `25ae5cc:components/EstimateForm.tsx:231-242,433`,
   `ChangeOrderForm.tsx:217-226,393`). Client details had a "Portal Link" button (`ClientDetails.tsx:147-155`) and a
   "Get Approval" placeholder alert (:141-146).
2. **Portal** (`25ae5cc:components/PortalView.tsx`): tabs Invoices / Estimates (+ change orders) / Reports (daily
   reports) (:96-100); **every** document of the client regardless of status (RPC `25ae5cc:App.tsx:234-273` matched
   `data.clientName`; the older `supabase_setup.sql:29-93` matched `jobs.client_name`); "Outstanding" = all invoices not
   Paid (:183-189); **Review & Sign** on any estimate/change order not Accepted (:232, no expiry check); **Download** PDF
   for invoice/estimate/change order/daily report (:102-117).
3. **Approval page** (`25ae5cc:components/DocumentApprovalView.tsx`): shows the document, signature pad, **Approve &
   Sign** (:40-56). No decline, no expiry, no "already used" check (`supabase_setup.sql:195-233`). Sets
   `clientSignatureUrl`, `status: Accepted`, `clientSignedAt`, `clientSignedBy`.
4. **Back to the contractor**: green bouncing count on the client's avatar (unseen signed docs, `ClientsView.tsx:320-333`),
   Clients badge in the dock (`25ae5cc:App.tsx:837-842,2299`), per-client "Signed Documents" modal (:491-548) which marks
   them seen (`App.tsx:844-870`), global "Portal Activity History" (:611-666). All documents were loaded at login
   (`App.tsx:1201-1212`), so badges covered everything.

### What is equal or better in the new app (no action)
Portal link on each client card + client page (with Open / Email / Text / WhatsApp / New link,
`components/ClientDetails.tsx:1112-1156`); "Request approval" on each card and on the client page
(`ClientsView.tsx:843-845`, `ClientDetails.tsx:1061-1063`, modal :482-737) with Copy / Email / New link; approval link in
the Estimate/CO form (`components/forms/Sections.tsx:266-315`) and in Share (`ShareModal.tsx:289-299`); decline with a
reason; signer name; Work Orders and Warranties in the portal; correct totals with tax; PDF for every visible type;
per-client activity + global Activity modal (`ClientsView.tsx:937-1120`); signed documents lock (QA 0b.1); portal keys
exist for every client (`clients.portal_key not null default`, `20261112000000_init_schema.sql:80`), and
`ensurePortalKey` covers legacy rows (`utils/clientLinks.ts:66-69`).

### A1. P0: the portal hides every Draft document
- **Old:** all documents shown, any status (`25ae5cc:App.tsx:234-273`, `PortalView.tsx:96-100,232`).
- **New:** the RPC drops Drafts (`supabase/migrations/20261112000200_portal_forum_inventory.sql:212`), signing/declining
  in the portal refuses Drafts (:241, :274), and the page filters them again (`components/PortalView.tsx:193`).
  Estimates, change orders and invoices are created as Draft (`EstimateForm.tsx:128`, `ChangeOrderForm.tsx:71`,
  `InvoiceForm.tsx:86`) and **nothing ever sets Sent** (no code path changes Draft→Sent on copy/share/email; only
  `lib/payments.ts:228` when a payment is recorded). Legacy estimates and invoices are mostly Draft too (old default,
  `25ae5cc:components/EstimateForm.tsx:43`, `InvoiceForm.tsx:36`). Result: the portal says "No documents yet", the
  client can't sign there, and old portal links that showed documents yesterday show nothing.
  The "Outstanding balance" also only counts Sent/Overdue (`PortalView.tsx:216`); old counted every invoice not Paid.
- **Fix:**
  1. New migration `supabase/migrations/20261114000000_portal_parity.sql` (`create or replace`, same signatures, grants
     are kept): remove `and coalesce(d.data->>'status','') <> 'Draft'` from `get_portal_data`,
     `sign_document_via_portal`, `decline_document_via_portal`. (Same file also carries A2, A3, A7.)
  2. `components/PortalView.tsx:193`: drop `&& str(d.data.status) !== 'Draft'`. `:216`: unpaid =
     `!['Paid','Cancelled'].includes(status)` (old rule, plus Cancelled). Keep the Pay button hidden on Drafts (:104).
  3. Recommended (keeps statuses honest, feeds reminders): new owner-only RPC `mark_documents_sent(p_ids uuid[])`
     (security invoker, `user_id = auth.uid()`, sets `data.status='Sent'` only where status is '' or 'Draft' and type in
     Invoice/Estimate/Change Order) called after a successful Copy/Email link in `RequestApprovalModal`
     (`ClientDetails.tsx:536-577`), `Sections.tsx` approval copy (:270-285), and ShareModal copy/email/share actions.
     Update the in-memory form/list status afterwards.
  4. Optional (owner decision): a per-document "Hide from client portal" switch (`data.portalHidden`) honoured by
     `get_portal_data`, for contractors who don't want drafts visible.
- **DB change:** yes (live functions; owner OK needed).
- **Test:** create an estimate (leave Draft) for client X → Clients → X → Portal link → open in a private window: the
  estimate is listed under "Estimates & change orders" with Review & sign; sign it → the contractor sees the badge.
  Draft invoice appears under Invoices and in Outstanding. An old portal link of a legacy client shows all its documents.

### A2. P0: estimates can't be signed after the expiry date (breaks almost every old approval link)
- **Old:** no expiry check anywhere (`25ae5cc:supabase_setup.sql:195-233`, `PortalView.tsx:232`,
  `DocumentApprovalView.tsx:40-56`). Old estimates got `expiryDate = today + 7 days` by default
  (`25ae5cc:components/EstimateForm.tsx:39`), so nearly every legacy unsigned estimate is "past expiry".
- **New:** server refuses (`20261112000200…sql:137-139`, `_assert_document_open`), the page shows "expired" and no
  signing (`DocumentApprovalView.tsx:161`, `PortalView.tsx:146-148`), and the contractor's Request approval modal hides
  Copy/Email for expired estimates (`ClientDetails.tsx:242,667-674`).
- **Fix:** in the A1 migration, drop the expiry block from `_assert_document_open`. In the UI keep an informational
  notice ("Valid until Nov 6 — this date has passed; contact X if prices changed") but let the client sign:
  `getDocState` (`DocumentApprovalView.tsx:157-163`) returns `open` (add a separate `isPastExpiry` flag for the
  "expired" notice in `DocumentDetail`, `DocumentApprovalView.tsx:773-776`), `approvalState` (`ClientDetails.tsx:238-244`) returns `open` with an "expired" hint, PortalView DocBadge
  shows "Past valid date". Optional profile setting "Block signing after the expiry date" (default OFF).
- **DB change:** yes (same migration).
- **Test:** estimate with expiry date last month → approval link and portal both allow signing; status becomes Accepted.

### A3. P1: share messages link to a page that can't show the document; receipt links are dead
- **New:** ShareModal puts the client's **portal** link in the message whenever the client is known
  (`components/ShareModal.tsx:126,144-153,160-171`), else the token link. But the portal never shows Receipt, Purchase
  Order, Time Sheet, Material Log, Expense Log, Note (`20261112000200…sql:11-18`, `PortalView.tsx:40`) and hid Drafts
  (A1). The token page also refuses those types (`get_document_by_token`, :297-299), so a shared **Receipt** link always
  shows "This link is not valid" (receipt Share was added in commit 9350095).
- **Old:** no link in share messages (PDF only), so nothing was broken.
- **Fix:**
  - Add `'Receipt'` to `_client_visible_type` (A1 migration) and remove it from `INTERNAL_TYPES` (`PortalView.tsx:40`);
    show receipts under "Reports & other". A receipt is the client's proof of payment.
  - ShareModal: link = token (single-document) link for Estimate/Change Order (sign) and for every other client-visible
    type; portal link only as a secondary "All your documents" line; **no link** for Purchase Order / Time Sheet /
    Material Log / Expense Log / Note (`defaultTemplate(docType, false)`).
- **Test:** share a Receipt and a Draft invoice → the link in the message opens and shows that document; share a
  Purchase Order → message has no client link.

### A4. P1: a declined document can never be sent for approval again
- **New:** after a decline, `clientDeclinedAt` + `status: Rejected` + `approval_used_at` are set
  (`20261112000200…sql:144-178`). The DB re-adds decline keys if a save drops them
  (`20261112000100_accounts_billing_limits.sql:482-489`) and `_assert_document_open` then refuses ("already declined",
  :131-133); token links also refuse "already used" (:332). The Request approval modal shows no buttons for declined docs
  but says "Edit it or create a new version to ask again" (`ClientDetails.tsx:662-666,674`). Editing does not help.
  (Signed documents have "Revise → Unlock / New revision", `components/forms/SignedLock.tsx:100-139`; declined ones have
  nothing.)
- **Old:** no decline; the contractor could change the status and the client could sign the same link again.
- **Fix (no DB change):** "Ask again" action in `RequestApprovalModal` (declined rows) and a banner in Estimate/Change
  Order forms when declined: save `clientDeclinedAt: ''`, `clientDeclineReason: ''`, `status: 'Sent'` (set to '' rather
  than removed, exactly like `unsignedPatch()` in `components/forms/signedLock.ts`), then `regenerateApprovalToken(id)`
  (resets `approval_used_at`, `utils/clientLinks.ts:105-115`) and show/copy the new link. Keep "New revision" as the
  alternative.
- **Test:** client declines → contractor clicks Ask again → new link opens with the signing panel; old link says it was
  replaced; portal shows the document as awaiting signature.

### A5. P1: approval links expire after 60 days; "used" links are copied again
- **Old:** links never expired (`25ae5cc:supabase_setup.sql:146-233`).
- **New:** `guard_document_write` sets `approval_expires_at = now()+60 days` on every insert and token change
  (`20261112000100_accounts_billing_limits.sql:473-474,494-500`); only the 53 legacy docs were exempted
  (`20261113000000_legacy_links_never_expire.sql`). `ensureApprovalToken` reissues expired tokens but returns a token
  whose `approval_used_at` is set (`utils/clientLinks.ts:88-102`).
- **Fix:** migration: in `guard_document_write` stop setting `approval_expires_at` on insert/token change (null = no
  expiry; keep the column for a future manual expiry) + one-time `update documents set approval_expires_at = null where
  approval_used_at is null` (owner OK). `Sections.tsx:309`: remove "Links expire after 60 days if unused".
  `ensureApprovalToken`: also regenerate when `approval_used_at` is set and the document is no longer signed/declined.
- **Test:** document created today → `approval_expires_at` is null; link still opens after changing the server date
  (or check the column).

### A6. P2: "new signed" badges only see the 50 newest documents; declines never badge
- **Old:** every unseen signed/accepted document counted (`25ae5cc:App.tsx:837-842,1201-1212`).
- **New:** App/Dashboard/AppNav count from `forms`, which holds the 50 most recent document summaries
  (`lib/documents.ts:16`, `App.tsx:315,553-565`, `DashboardScreen.tsx:160`); the summary has no `clientDeclinedAt`
  (`lib/documents.ts:19-38`), so declines never badge in the nav (`isUnseenClientSignedDocument`, :241-245).
- **Fix:** add `clientDeclinedAt:data->>clientDeclinedAt` to `DOCUMENT_METADATA_COLUMNS` and count declines in
  `isUnseenClientSignedDocument` (rename to `isUnseenClientDecision`). In `loadAccountData` (`App.tsx` ~652) run one
  extra query for unseen client decisions (`.or('data->>clientSignedAt.not.is.null,data->>clientDeclinedAt.not.is.null,
  data->>status.in.(Accepted,Rejected)')` + viewedByProvider not true, limit 500) and merge into `forms`; repeat it on
  the forum-badge timer so a signature that arrives while the app is open shows up.
- **Test:** account with 60+ documents, sign the oldest estimate by link → Clients badge = 1; decline another → 2.

### A7. P2: a change order marked "Approved" by hand still asks the client to sign
- **New:** CO statuses are Draft/Sent/**Approved**/Rejected (`components/forms/documentFields.ts:47`), but signed state
  only knows `Accepted` (`DocumentApprovalView.tsx:152-153`, `20261112000200…sql:127-129`), so the portal shows
  "Awaiting your signature" and lets the client sign over it.
- **Fix:** treat `Approved` like `Accepted` in `isSignedData` and `_assert_document_open` (A1 migration).
- **Test:** CO set to Approved with no signature → portal shows Approved, no sign button.

### A8. P3: smaller differences
- Request approval list: Copy link only on open documents (`ClientDetails.tsx:674`). Old allowed copying any row
  (`25ae5cc:ClientsView.tsx:464-472`). Add "Copy view link" for signed/declined rows (the page is read-only then).
- Form approval link needs a manual save first ("Save this estimate to create its approval link",
  `Sections.tsx:311-315`); old button saved for you (`25ae5cc:EstimateForm.tsx:231-236`). Add "Save & copy link"
  using `form.ensureSaved`.
- Portal lists at most 200 documents (`20261112000200…sql:214`); old had no cap. Raise to 1000 or paginate.
- A document is attached to a client by the job's client (`App.tsx:1395-1396`) even if its own "Client name" was
  changed to someone else; old matched the document's `clientName`. Prefer the document's client name when it differs.
- Legacy rows signed through the oldest `sign_document_via_portal` (`25ae5cc:App.tsx:275-297`) stored the client's
  signature in `signatureUrl` (the contractor's slot). Read-only quirk; leave as is.

---------------------------------------------------------------------------------------------------------

## B. Temporary clients

### How the old app did it
- Flag = the text `[TEMPORARY]` in `clients.notes` (no column). Created only from **Inventory → Scan out → Quick create
  client → "Mark as Temporary Client"** (`25ae5cc:components/InventoryView.tsx:66,119-141,607-612`).
- Clients screen: temporary clients are **hidden from the main list** (`ClientsView.tsx:218-224`); orange
  **"Temporary (N)"** button in the header (:277-280) opens a "Temporary Clients" modal (walk-ins and QR-scanner jobs)
  with its own search, and on each card **Convert to Regular** (strips the tag, :148-157), **View Details**, Delete
  (:551-609). No automatic cleanup. They counted toward the Free plan's 15 clients/month (`25ae5cc:App.tsx:926`).

### What the new app has
Same `[TEMPORARY]` flag (`components/ClientDetails.tsx:86,99-100`), so legacy temporary clients are still temporary.
Creation: "Temporary client" checkbox in Add/Edit client (`ClientDetails.tsx:343-372,461-471`), Inventory check-out
"Mark as temporary client" (`InventoryView.tsx:497-500,1250-1256`), AI `isTemporary` (`ClientsView.tsx:410-419`).
List: All / Regular / Temporary segmented filter (`ClientsView.tsx:285,671-686`), "Temporary" badge, Convert in the ⋮
menu (:789), CSV export column.

### B1. P1: temporary clients are hard to find and work differently
- Default view is **All** (`ClientsView.tsx:285`), so temporary clients are mixed with regular ones (old hid them).
- No "Temporary (N)" button/count; the filter is a small lowercase tab with no count.
- Convert is only in the ⋮ menu; the client page shows only a badge (`ClientDetails.tsx:1054`), converting needs Edit →
  untick.
- Clients typed in a new job are created as **regular** clients (0b.8, `App.tsx:1052-1080,1146-1150`) with no way to
  make them temporary; request-a-quote clients are regular too
  (`20261113000400_requests_and_job_photos.sql:443-446`, although NEXT_STEPS §0c.3 says "creates a temporary client").
- **Fix (UI, no schema change; keep the `[TEMPORARY]` flag for compatibility):**
  1. `ClientsView.tsx`: header button **"Temporary (N)"** (orange/warning style, icon-only on phones) next to Activity;
     N from a head count `clients.notes ilike '%[TEMPORARY]%'` in `loadCount` (:345-355). It switches the list to the
     temporary view with a clear "Back to all clients" control (or opens a modal like the old one).
  2. Default filter `'regular'` (old behaviour); label the segments "Clients · Temporary (N) · All".
  3. Temporary cards: visible **Convert to regular** + **View details** buttons in the card footer (instead of Portal /
     Request approval, which stay in ⋮), Delete in ⋮.
  4. `ClientDetails.tsx` header: **Convert to regular** button when temporary (reuse `convertToRegular` logic,
     `ClientsView.tsx:523-535`).
  5. `JobForm.tsx` (new client name typed, :168-185): checkbox "Temporary client (walk-in)" → pass `temporary` through
     `handleSaveJob` → `createClientForJob(…, notes: TEMP_TAG)`.
  6. Request-a-quote: `convert_quote_request` inserts `notes = '[TEMPORARY] From your request-a-quote page (…)'`
     (new migration; 0400 is already live). Owner decision.
- **Test:** create a temporary client from the Clients form, from Inventory check-out and from a new job → each is
  missing from the default list, counted in "Temporary (N)", listed there; Convert → it moves to the main list and the
  count drops; log out/in → unchanged.

---------------------------------------------------------------------------------------------------------

## C. Data that must still be there after logout/login

The OLD app kept only two things in the browser: the theme (also saved to `profiles.theme`) and saved profit
calculations (`localStorage 'profit_calcs'`, `25ae5cc:components/ProfitCalculatorView.tsx:55,126,142`). Everything else
was in the database. The new app adds a few browser-only values; the data-sync helper (§0e, migration 0500) covers most.

### C1. P1: account data still in the browser (QUEUED §0e / 0b.20, plus one gap)
- Profit calculations, default signature (`components/SignaturePad.tsx:29-47`), labor rate (`lib/finance.ts:30-50`),
  label sheet (`PrintTagsModal.tsx:143-156`): `lib/userData.ts` + `lib/userDataSync.ts` + migration
  `20261113000500_user_data_sync.sql` move them to the account. **0500 is not applied on live** (see §0). QUEUED §0e.
- **Gap (not queued): theme doesn't follow the account.** `deviceThemeChosenRef` is true whenever the browser has a
  saved theme (`App.tsx:273`), and the effect at :417 writes one on every visit, so after the first visit a device never
  applies `profiles.theme` again (:650). Old applied the account theme on every login (`25ae5cc:App.tsx:1145-1147`).
  Fix: start the ref `false` (only a change made in this session wins), queue the DB write when offline, change the
  Settings text "remembered on this device" (`Settings.tsx:553`), add theme to the list in `lib/userData.ts`.
  Test: Dark on phone → laptop reload/login → Dark.
- Unsaved form drafts (`cd_draft_*`) are cleared at logout (`lib/account.ts:273-275`). The old app had no drafts, so
  not a regression; consider keeping them per user id instead of deleting (P3).

### C2. P2: saved items "missing" because App lists are capped
- Old loaded everything (`25ae5cc:App.tsx:1188,1220-1257`). New caps: jobs 1000, clients 500, inventory 500, price
  book 300 (`App.tsx:96-108`). The pages page themselves, but pickers use the capped lists: price-book picker in
  Invoice/Estimate/CO/PO (`App.tsx:1708-1719`), inventory picker and low-stock badge (:316), client dropdowns in the job
  form (:1802) and Duplicate job (:2015); a job beyond #1000 opens "Job not found".
- Fix: load these four lists with `fetchAllPages` (`components/viewKit.tsx:60`), safety cap ~5000.
- Test: 301 price-book items → the "Z…" item is pickable in an invoice.

### C3. P2: Gmail accounts connected in the old app must be reconnected
- Old kept the refresh token (`25ae5cc:create_user_gmail_accounts.sql:3-11`). The import marks every account
  `needs_reconnect` (`20261112000400_import_legacy_data.sql:206-216`). Fix: (a) show the Reconnect notice on the
  dashboard too, or (b) one-time service-role step that encrypts `legacy_backup.user_gmail_accounts.refresh_token` into
  `gmail_tokens` (owner decision; tokens were stored in plain text).

---------------------------------------------------------------------------------------------------------

## D. Everything else (other screens)

### D1. P0: opening an old document silently changes its numbers
- Old stored prices/quantities as typed (e.g. $2.375/sq ft, −1 credit lines): `25ae5cc:components/InvoiceForm.tsx:509-517`,
  `ChangeOrderForm.tsx:353-354`, `MaterialLogForm.tsx:209-210`.
- New `normalizeLineItem` rounds `rate` to cents and clamps `quantity ≥ 0` when loading saved documents
  (`components/forms/formUtils.ts:497-498`); `normalizeMaterialItem` the same for `unitCost` (:551-552). 1200 × 2.375 =
  $2,850 opens as $2,856; −1 × $500 becomes $0; the next save writes it. New input also can't type negative quantities
  (`LineItemsEditor.tsx:248`) and shows 2 decimals for unit prices (:258, `MaterialLogForm.tsx:165`).
  `computeDocumentTotals` clamps negative discount/shipping (`utils/money.ts:78-82`).
- Fix: when `cleanText === false` (saved docs) keep `toNumber(qty)` / `toNumber(rate|unitCost)` unrounded and
  unclamped (round only AI input); `allowNegative` on the quantity input; 2–4 decimal display for unit prices.
- Test: saved estimate line 1200 × 2.375 opens as $2,850.00 and stays 2.375 after save; CO line −1 × 500 keeps −$500.

### D2. P1: legacy "Repeat this invoice" settings will create a burst of drafts
- Old saved `recurrence.enabled/nextRunDate` (`25ae5cc:components/InvoiceForm.tsx:363-410`) but never ran it
  (`services/recurringService.ts` not imported by `25ae5cc:App.tsx`).
- New runs `generate_due_recurring_invoices` after login (`App.tsx:689-705`) and catches up to 24 periods per invoice
  (`20261112000200…sql` ~1090-1140): a monthly invoice ticked in January makes ~10 drafts at once, each counting toward
  the Free plan limit.
- Fix (live data, owner OK): one-time SQL moving each legacy past-due `nextRunDate` to its next future date (no
  back-fill), or change the function to skip missed periods older than one. Count first:
  `select count(*) from documents where type='Invoice' and data->'recurrence'->>'enabled'='true' and not data ? 'recurrenceSourceId';`
- Related P2: `buildDuplicateDocumentData` (`lib/documents.ts:261`) keeps `recurrence.enabled`,
  `recurrenceSourceId`, `recurrencePeriod`: a duplicate starts a second series, and duplicating a generated copy fails
  on the unique index (`init_schema.sql:376`). Drop those keys / disable recurrence on copies.

### D3. P1: old inventory kits lose their own stock and cost
- Old kits were normal stock items (own quantity, cost, −/+ buttons, value, check-out from the kit itself):
  `25ae5cc:components/InventoryView.tsx:90-92,340-353,429-451`, `App.tsx:1845-1853`.
- New: kit saved with quantity 0 / cost 0 (`components/InventoryView.tsx:334,337`), **edit overwrites cost_price with 0**
  (:364-374), kit needs a stocked component (:356), no stepper (:530,540-547), $0 value (`utils/stockMath.ts:49-50`), DB
  refuses kit stock changes (`adjust_inventory` ~line 932), check-out only from components (~984-1007).
- Fix: additive column `inventory.kit_own_stock boolean default false` backfilled true for kits with quantity/cost or no
  stocked component; `adjust_inventory` / `checkout_inventory` use the kit's own stock when set; UI: never send
  `cost_price` for kits in the edit patch, show stepper/cost/unit for own-stock kits, switch "Keep pre-built kits in
  stock". (Live DB change, owner OK.)
- Test: an old kit with quantity > 0 shows its quantity/value, −/+ works, check-out lowers the kit, edit keeps cost.

### D4. P1: Duplicate job copies only part of the job
- Old copied every selected document (`25ae5cc:App.tsx:1600-1631`; all docs loaded).
- New loads only the first page of 20 before showing the modal (`App.tsx:816-820,2016`, `lib/documents.ts:15`);
  `fetchFullDocuments` sends all ids in one `.in()` (`lib/documents.ts:217`). Free plan: one batch insert
  (`App.tsx:1235`) fails entirely past 12 documents (`20261112000100…sql:274-281`) → job copied with zero documents.
- Fix: `loadAllDocumentsForJob(jobId)` with `fetchAllPages` before the modal stops loading; chunk ids/inserts by 100; on
  Free copy up to the remaining limit and say "Only 12 of 15 copied" with Upgrade (or let duplicates bypass the trigger —
  owner decision, old had no limit).
- Test: job with 35 docs → all listed and copied.

### D5. P1: profit calculator Simple/Advanced (QUEUED §0d.9 — correct the spec)
- Old Advanced mode = header toggle (`25ae5cc:components/ProfitCalculatorView.tsx:40,218-226`) revealing: Target margin %
  (default 30) + "Calculate Pricing" (price = cost ÷ (1 − margin)); Tax/VAT switch + rate (default **20%**); summary
  Tax, "Total w/ Tax", "Tax Included" badge (:247-300,372,385-406). **There were no overhead / labor-hours / labor-rate
  fields** (NEXT_STEPS §0d.9 says there were — fix the note so nobody invents them).
- New: margin + tax always visible, no switch (`components/ProfitCalculatorView.tsx:265-291`), tax default 8% (:65),
  no "Tax included" badge.
- Fix: `mode: 'simple' | 'advanced'` toggle (Simple hides the pricing/tax card, tax off), save the mode in
  `user_settings` (`profitCalc.mode`) with localStorage fallback, badge, ask the owner about 20% default.
- Test: Advanced, cost 100, margin 30 → 142.86; tax on → totals + badge; Simple hides them; survives logout.

### D6. P2: price book pricing defaults
- New item: old default markup 50% (`25ae5cc:components/PriceBookItemDetails.tsx:28,100,113-118`); new `markup: 0`
  (`components/PriceBookItemDetails.tsx:35`) so typing a cost sets price = cost. Fix: default 50 (or last used).
- Kits: old price = sum of the parts' prices (`25ae5cc:…PriceBookItemDetails.tsx:205-233`); new = cost × (1+markup)
  (`PriceBookItemDetails.tsx:97-102`). Fix: follow the parts total until the user types a price.
- Old kit with no components can't be saved now (`:159`); apply that rule to new kits only. (P3)

### D7. P2: Material Log stock can be deducted twice for old logs
- Old deducted once and saved `deductInventory:false` (`25ae5cc:App.tsx:1489-1503`). New treats it as a lasting flag
  applied by the DB (`MaterialLogForm.tsx:187-195`); old logs open with the toggle off and are not in the opening ledger
  (`20261112000400…sql:282-291`), so switching it on deducts again. Fix: for logs created before the cut-over with
  linked items, warn/confirm (or ledger them without moving stock, owner OK).

### D8. P2: job page search/filter only covers loaded documents
- Old searched all of the job's documents (`25ae5cc:App.tsx:2007-2010`). New pages by 20 (`App.tsx:727-759`) and filters
  only what is loaded (`JobDetailsScreen.tsx:128-142`). Fix: auto "load more" while a search/filter is active; "+" on
  chip counts while more exist.

### D9. P2: Expense "Scan receipt" can't pick a saved photo
- Old input had no `capture` (`25ae5cc:components/ExpenseLogForm.tsx:383-393`); new forces the camera
  (`ExpenseLogForm.tsx:204`). Fix: two buttons (Take photo / Choose photo).

### D10. P3: small differences
- Nav labels always English (old used `t.dashboard/t.newDocument/t.settings`, `25ae5cc:App.tsx:2286-2305`; new
  `AppNav.tsx:111-136,197`, `App.tsx:1925-1929`). Pass `t` to AppNav.
- Offline: inventory/price book not cached, unopened documents can't open offline (`App.tsx:579-610,729-785`,
  `JobFinancialsModal.tsx:53-67`); old cached everything (`25ae5cc:App.tsx:1187-1247`).
- Work order: unknown statuses forced to Scheduled (`WorkOrderForm.tsx:70`); Duplicate sets "Draft" on work orders.
- New save blockers on old documents: receipt amount > 0 (`ReceiptForm.tsx:72`), PO vendor (`PurchaseOrderForm.tsx:90`),
  non-empty note (`NoteForm.tsx:44`). Make them warnings for already-saved documents.
- Change order reason list lost the old labels (Client Request / Unforeseen Condition / Design Change / Code Requirement
  / Other, `25ae5cc:components/ChangeOrderForm.tsx:256-262`; new `ChangeOrderForm.tsx:38`). Add them back.
- Estimate validity default 30 days (old 7, `EstimateForm.tsx:127`): confirm with the owner.
- Communication: `[Client Name]` fills the first name only (`CommunicationView.tsx:324`; old full name, old :162); email
  design colours lost their hex inputs (old :588-610). Two "Connect Gmail" buttons: QUEUED §0d.6.
- Inventory: scanning opens the item card instead of Scan out (old `InventoryView.tsx:166-174`, new :487-493: call
  `setCheckoutFor(item)`); labels default logo off / Letter (old logo on / A4, `PrintTagsModal.tsx:20,124-127`; new
  :143,149); threshold 0 now means "only when out" (old treated 0 as 5, `stockMath.ts:31-36`).
- Forum: compression size label gone (old `ForumView.tsx:816-818`), comments default Oldest (old Newest; new :391),
  title capped at 150 (DB allows 300; new :1037).

---------------------------------------------------------------------------------------------------------

## E. Checked and equal or better (no action)

Dashboard (Tools menu + low-stock badge, Community badge, upgrade, search, status/client filters, job cards), job form
(+ end date, worker conflict check), job page (status, doc counter, Financials with a real labor rate), document type
picker (12 types), calendar, insights, login/signup/reset/Google, Gmail callback, Settings/Profile (every old field saved
to `profiles`, 3 themes, 10 languages with the same strings), keyboard shortcuts (old had none), all 12 forms' fields and
saved keys (old documents open with their fields), price book/inventory pickers, progress billing, discount/tax/shipping,
signature pad, design picker + colours, Share (To/Subject/Body), voice input, receipt OCR, Communication compose +
attachments + 15 email designs + several Gmail accounts, inventory fields/sort/history/labels/QR, price book
categories/photos/types/SKU, forum tabs/sort/votes/comments/notifications/edit/delete (+ report). Details are in the
three helper reports (2026-11-13).

---------------------------------------------------------------------------------------------------------

## F. One migration for section A (draft scope, apply only with the owner's OK)

`supabase/migrations/20261114000000_portal_parity.sql` (additive `create or replace`, same signatures and grants):
1. `_client_visible_type`: add `'Receipt'` (A3).
2. `_assert_document_open`: drop the expiry block (A2); treat `Approved` like `Accepted` (A7).
3. `get_portal_data`, `sign_document_via_portal`, `decline_document_via_portal`: drop the Draft condition (A1); raise
   `limit 200` to 1000 (A8).
4. `guard_document_write`: no automatic `approval_expires_at` (A5) + one-time `update … set approval_expires_at = null
   where approval_used_at is null`.
5. Optional: `mark_documents_sent(uuid[])` (A1 step 3), `revoke all … from public, anon` + `grant execute … to
   authenticated` per the BACKEND_NOTES rule.
Then update `scripts/`/`supabase/tests/db-tests.mjs` portal cases (Draft visible, expired signable, Approved CO
read-only, receipt token page) and run the portal flows of A1–A4 in a private window.
