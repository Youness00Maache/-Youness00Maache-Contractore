# 05 — Inventory, Price Book, Analytics/Planning, Community, Account & Billing

Scope: ROOT `App.tsx`, `components/`, `services/`, `utils/`, `types.ts`, the inventory / price-book SQL files, `persistent_tracking.sql`, `index.html` (PayPal SDK) and `supabase/functions/paypal-webhook/index.ts`. The stale `src/` duplicate was ignored.

Status legend: **CONFIRMED** = the defect follows directly from the code shown. **LIKELY** = the defect depends on a database or deployment fact the repo cannot prove (for example, which SQL script was actually run in production). For each LIKELY item, the evidence and the way to verify it are given.

Libraries in this area and where they load from:

| Library | Source | Used by |
|---|---|---|
| Supabase JS | **CDN** `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">` (index.html:17). `App.tsx:73` uses `window.supabase.createClient`. The npm package is used for types only. | everything |
| PayPal JS SDK | **CDN** `https://www.paypal.com/sdk/js?client-id=…&vault=true&intent=subscription` (index.html:23-25) | `UpgradeModal.tsx` |
| html5-qrcode | **npm** `^2.3.8` | `QRScannerModal.tsx` |
| qrcode.react | **npm** `^4.2.0` | `PrintTagsModal.tsx` |
| react-big-calendar + date-fns | **npm** (the importmap in index.html:363-378 is dead for the Vite bundle) | `CalendarView.tsx` |
| tesseract | CDN (index.html:15) and npm `5.0.5` (not used in this area) | — |
| Tailwind | **CDN** `cdn.tailwindcss.com` (index.html:14), the play-CDN, which is not meant for production | all UI |

---

## 1. How it works

### 1.1 Inventory (`components/InventoryView.tsx`, route `/inventory`)
* **Wiring (App.tsx:3102-3123).** Props are `inventory` (App state; only the **first 50 rows**, App.tsx:1655-1667, `LIST_PAGE_SIZE = 50`), `history` (first 50 `inventory_history` rows), `jobs` and `clients`. The handlers are `handleAddInventoryItem`, `handleDuplicateInventoryItem`, `handleUpdateInventoryItem`, `handleDeleteInventoryItem` and `handleAllocateInventory` (App.tsx:2433-2500), plus `loadMoreInventory` / `loadMoreInventoryHistory`. `openAddModal` and `prefillData` come from `location.state` (set by the AI router).
* **Header.** Back, Scan QR (opens `QRScannerModal`), History (the general audit log) and Add New Item. The subtitle shows the total stock value: Σ(cost_price × quantity) over the **loaded page only**.
* **Controls.** Free-text search (name/category/supplier), category filter (derived from loaded rows) and sort (name/qty/value).
* **Card per item.** Shows badges (category, Assembly, Low Stock when `quantity <= (low_stock_threshold || 5)`), a kit-contents button (assemblies), a ⋮ menu (Duplicate, Delete), − / + buttons (`adjustQuantity` → `onUpdateItem({...item, quantity})`), Print Tags, per-item History and "Use / Check Out" (the allocate modal).
* **Add modal.** Name, kit/assembly checkbox, category/location/supplier (hidden for kits), initial quantity, unit, cost, low-stock alert and a kit component builder (pick existing non-kit items or add custom rows). Save calls `onAddItem(newItem)`. The App inserts into `inventory`, logs an `add` history row and then calls `fetchData()` (a full reload of profile, jobs, docs, clients, inventory, history and price book).
* **Allocate ("Scan Out") modal.** Quantity, job (only `active` jobs, plus an "Independent Scan" option), a quick-create-client sub-form and notes. Confirm calls `handleAllocateInventory`, which does a read-modify-write `inventory.update({quantity: max(0, q - n)})` and then inserts a `job_allocation` history row with `-n`.
* **QR flow.** `PrintTagsModal` renders QR codes that encode the raw `item.id` and calls `window.print()`. `QRScannerModal` (html5-qrcode) decodes a string; `handleScanSuccess` looks the id up in the **loaded** `inventory` array and opens the allocate modal.
* **Automatic deduction from documents** (database side, `SQL_DOCUMENT_INVENTORY_LINK.sql`, and the copy embedded in `App.tsx` `SQL_SETUP_SCRIPT` lines 541-733). An `AFTER INSERT/UPDATE OF data/DELETE` trigger on `documents` covers types `Invoice`, `Estimate` and `Change Order`. When `data.status` moves into `approved/accepted/paid`, every line item that has `inventoryItemId` (or `item_id`) is deducted with `CEIL(quantity)`. Leaving those statuses restores stock. If the line items change while the document stays committed, the trigger restores the old lines and deducts the new ones. Delete restores. Insufficient stock raises an exception, which aborts the document save.
* **Material Log deduction** is done client-side in `handleSaveForm` (App.tsx:2108-2122) when the form's `deductInventory` checkbox is set.

### 1.2 Price Book (`PriceBookView.tsx` + `PriceBookItemDetails.tsx`, route `/pricebook`)
* **Wiring (App.tsx:3124-3136).** `savedItems` (first 50 rows of `saved_items`, selecting the 19 columns in `SAVED_ITEM_COLUMNS`, App.tsx:82). Add, update, duplicate and delete go through `handleAddSavedItem` / `handleUpdateSavedItem` / `handleDuplicateSavedItem` / `handleDeleteSavedItem` (App.tsx:2320-2430); add and update have a "basic mode" fallback when columns are missing. Uploads go to the `price-book-images` bucket. `isPremium` gates image upload in the UI only.
* **Layout.** Desktop sidebar (All Items, categories derived from loaded rows, an Add Item dropdown with Standard or Assembly/Kit). Mobile header with the same dropdown. Search (name/description/SKU), grid/list toggle, card or row click opens the details modal, ⋮ menu has Duplicate and Delete.
* **Details modal tabs.** *General*: name, SKU, category, type, description, taxable. *Components* (kits only): search the catalog, add components, add custom components with an override price, set quantities; cost and price are auto-summed. *Pricing*: cost, markup %, price; the three are kept consistent (`price = cost × (1+markup)`; editing the price back-computes markup). *Media*: premium-only upload. Save calls `onSave(formData)`.
* **Database.** `saved_items` gets its columns from four overlapping scripts: the App setup script (basic columns), `SQL_MIGRATION_PRICEBOOK.sql` (type, images TEXT[], taxable, sku, markup, category, unit_cost), `SQL_ELITE_PRICEBOOK.sql` (is_assembly, assembly_items JSONB, favourites/usage, category_id, plus `price_history`, `item_vendors` and `price_book_categories` tables that are never used by the UI) and `FIX_ASSEMBLIES.sql` / `SQL_ASSEMBLIES_FEATURE.sql` (an `assembly_components` join table that is **never used**; the UI stores components as JSON in `assembly_items`).

### 1.3 Analytics (`AnalyticsView.tsx`, route `/analytics`, "Insights" in the Tools menu)
* Props: `jobs` and `forms` (App state). There is no fetching of its own.
* State: `startDate` (today minus 1 month) and `endDate` (today), both from `toISOString()` (UTC).
* Metrics are computed from `forms` whose `createdAt` falls in the range. For each Invoice: subtotal = Σ qty×rate, then −discount, +tax%, +shipping. This gives Total Revenue, Outstanding (status ≠ Paid), an average per invoice (labelled "Avg. Job Value"), a top-5 client leaderboard, and an estimate win rate (`Accepted`/all estimates). Revenue is charted by day (≤90 days) or by month. A job status bar shows active/paused/completed/inactive.
* **Important.** `forms` in App state are *lightweight metadata rows* (App.tsx:77, 90-107, 1614-1621) that carry no `lineItems`, `discount`, `taxRate` or `issueDate`. See VIEW-033.

### 1.4 Calendar (`CalendarView.tsx`, route `/calendar`)
* react-big-calendar with the date-fns localizer. Each job becomes one all-day event from `startDate` to `endDate` (or the start date). It has a custom toolbar (prev/today/next, Month/Week/List) and stat badges (Active, Upcoming = start date > now, Done). Clicking an event goes to the job details. "New Job" goes to `navigateToCreateJob('calendar')`, which returns to the calendar after save.

### 1.5 Profit Calculator (`ProfitCalculatorView.tsx`, route `/calculator`)
* Line items have cost and charge; it shows totals, profit, margin = profit/charge and markup = profit/cost. Advanced mode adds a target margin (sets every charge to `cost / (1 - m)`) and a VAT toggle and rate. Save and Load use `localStorage['profit_calcs']`. Export builds a `ProfitReportData` and calls `generateDocumentBase64('Profit Report', …)`, then downloads a data-URI PDF. **The math is correct.**

### 1.6 Recurring invoices (`services/recurringService.ts`)
* `processRecurringInvoices(supabase, userId, forms)` copies due invoices and advances `nextRunDate`. **It is never imported or called anywhere** (VIEW-039).

### 1.7 Jobs (`JobForm.tsx`, `JobCard.tsx`)
* `JobForm` (route `/jobs/create`) loads the first 50 clients itself and has a client picker that fills name and address. Fields are name, client name and address, start date and assigned worker. It enforces a 6-per-month free limit locally and calls `onSave({name, clientName, clientAddress, startDate, workerName})`, which is `handleSaveJob` (App.tsx:2037-2084). That function checks for worker date conflicts and then **inserts the camelCase object into `jobs`** (VIEW-037).
* `JobCard` (dashboard grid) has a ⋮ menu (Duplicate opens `DuplicateJobModal`; Delete opens a confirmation modal) and a "View Project" button. The job status is changed from the select on the job-details page (App.tsx:2876-2885 → `handleUpdateJobStatus`).

### 1.8 Community (`ForumView.tsx`, routes `/forum` and `/forum/:id`)
* Tables (not defined in any repo SQL; App.tsx:270 says "Skipped for brevity, assumed existing"): `forum_posts`, `forum_comments`, `forum_votes`, `forum_comment_votes` and `notifications`, joined with `profiles`.
* List: category tabs (General, Suggestion, Project Showcase, My Posts) and sort (newest/popular). `fetchPosts` loads **all** posts of the category plus **all** the user's votes. Each card has up/down vote, owner edit/delete (visible on hover), show more and a comment count.
* Detail (`initialPostId` from the URL): the post with votes; comments sorted newest or popular; comment votes; a fixed composer with image upload and camera capture.
* Votes: the client upserts or deletes `forum_votes`, **computes new totals locally and writes `forum_posts.upvotes/downvotes`** (ForumView.tsx:358). Comment votes work the same way (line 385). Likes and comments insert a `notifications` row for the author.
* Notifications bell: unread count and a list of 20; clicking marks the notification read and navigates to the post.
* Content is rendered as React text (`{post.content}`), so **there is no HTML/script XSS**. YouTube links are reduced to an 11-character video id before being embedded. Images are `<img src>` with arbitrary URLs (VIEW-044).

### 1.9 Account
* **Settings / Profile (`Settings.tsx`, routes `/settings` and `/profile`, App.tsx:3075-3076).** *Settings* mode: company info, logo upload, theme (light/blue/dark, applied immediately via `setTheme`) and language. *Profile* mode: avatar upload, first and last name, job title, the plan card with an Upgrade button, and Log Out. Every Save button calls `handleSaveProfile` (App.tsx:1992-2026), which uploads files to `logos`, upserts `profiles` and navigates to the dashboard. There is **no delete-account, no signature setup and no subscription management**.
* **Translations.** `utils/translations.ts` has 32 keys × 10 languages and is used only by the dashboard, job details and dock (`getTranslation`, App.tsx:2502).
* **Welcome / Login / Signup / UpdatePassword.** These are Supabase email/password and Google OAuth. Reset sends `resetPasswordForEmail` with redirect `/update-password`; the recovery event pins the user to that page (App.tsx:1379-1400).
* **Billing.** `UpgradeModal` renders a PayPal Subscriptions button for plan `P-65E58669J9805670ENFP23EA` with `custom_id = userId`. `onApprove` calls `handleUpgradeSuccess` (App.tsx:1286-1292), which **writes `subscription_tier='Premium'` from the browser**. The edge function `paypal-webhook` sets `Premium/Basic` from `resource.custom_id` **with no signature verification**. Free limits (6 jobs, 15 clients, 12 docs per project, per month) are enforced only in React (`checkLimit`, App.tsx:1294-1322).
* **Legal pages.** `PrivacyPolicy`, `TermsOfService` and `Security` are static pages. The Welcome footer links Privacy and Terms to external domains and only Security to the in-app page.
* **Navigation.** `Dock.tsx` is the floating bottom bar (dashboard, job details, clients). `Toolbar.tsx` is **not** navigation: it is the rich-text toolbar used by `NoteForm` and `DailyJobReportForm`.

---

## 2. Feature & button inventory

### 2.1 InventoryView
| Control | file:line | Intended behavior | Actual status | Issue |
|---|---|---|---|---|
| Back | InventoryView.tsx:257 | to dashboard | Works | — |
| Scan QR | :268 | open camera scanner | Partial: only finds items in the first loaded page | VIEW-020, VIEW-026 |
| History (general) | :271 | audit log | Partial: first 50 rows plus "Load more" | VIEW-020 |
| Add New Item | :274 | open add modal | Works | — |
| Search / category / sort | :284 / :294 / :304 | filter loaded rows | Partial: client-side only, loaded page only; `item.name.toLowerCase()` throws on null name | VIEW-030 |
| Kit components button | :356 | show kit contents | Works | — |
| ⋮ Duplicate | :371 | copy item | Works (menu stays open) | VIEW-031 |
| ⋮ Delete | :377 | delete item | Broken UX: no confirmation, no error handling, wipes history | VIEW-023 |
| − / + quantity | :413 / :421 | adjust stock by 1 | Broken under fast clicks: lost updates, full reload per click | VIEW-020, VIEW-032 |
| Print Tags | :430 | print QR sheet | Broken: prints the whole page; geometry wrong | VIEW-025 |
| History (item) | :433 | per-item log | Partial: only loaded history rows | VIEW-020 |
| Use / Check Out | :437 | deduct stock to a job | Partial: non-atomic, allows negative/over quantity, kits don't deduct components | VIEW-020, VIEW-021 |
| Load more inventory | :450 | next page | Works, but any mutation resets to page 1 | VIEW-032 |
| Add modal fields | :469-530 | item data | Works | — |
| Kit checkbox / component picker / custom | :472 / :542 / :537 | build kit | Works (UI); has no stock effect | VIEW-021 |
| Save Item | :590 | insert | Partial: insert errors ignored; spinner stuck if it throws | VIEW-020 |
| Allocate quantity input | :611 | qty ≤ available | Broken: no min/max validation (negative restocks) | VIEW-020 |
| Allocate job select | :620 | link to job | Works (active jobs only) | — |
| Quick create client (👥) | :630 / :695 | create client and note it | Partial: client is only mentioned in notes text | VIEW-022 |
| Quick Create Job section | :642-669 | create job inline | **Dead: unreachable** (`setQuickJobMode(true)` is never called) | VIEW-022 |
| Confirm Scan Out / Cancel | :708 / :702 | submit / close | Partial: backdrop close keeps quick-client state | VIEW-022 |
| Edit item | — | change name/price/etc. | **Missing** | VIEW-022 |
| Low-stock badge | :327 | threshold alert | Partial: threshold 0 treated as 5 | VIEW-024 |
| PrintTags checkboxes / Print / Close | PrintTagsModal.tsx:64-90 / :93 / :41 | customise and print | Partial | VIEW-025 |
| QR scanner close | QRScannerModal.tsx:61 | close | Works | VIEW-026 |

### 2.2 PriceBookView / PriceBookItemDetails
| Control | file:line | Intended behavior | Actual status | Issue |
|---|---|---|---|---|
| Back (desktop / mobile) | PriceBookView.tsx:75 / :139 | to dashboard | Works | — |
| All Items / category buttons | :85 / :103 | filter | Works (loaded page only) | — |
| Add Item → Standard / Assembly | :125 / :128 (mobile :150/:153, empty :205/:206) | open editor | Works; title wrongly says "Edit Item" | VIEW-029 |
| Search | :163 | filter | Partial: throws on null name | VIEW-030 |
| Grid / List | :173 / :179 | toggle | Works | — |
| Card / row click | :215 / :291 | edit | Works | — |
| Profit chip | :264 | show margin | Bug: renders a literal "0" when unit_cost = 0 | VIEW-030 |
| ⋮ Duplicate / Delete | :239,:319 / :245,:325 | copy / delete | Duplicate works; Delete has no confirmation; menu stays open | VIEW-023, VIEW-031 |
| Load more items | :342 | next page | Works (reset by any mutation) | VIEW-032 |
| Whole list | App.tsx:1689-1700 | load items | **Broken (empty list) if any optional column is missing** | VIEW-027 |
| Details: close / tabs | PriceBookItemDetails.tsx:242 / :248-253 | — | Works | — |
| General fields | :269-333 | edit | Works | — |
| Components: search / Add / Custom / qty / remove | :352 / :367 / :379 / :423 / :431 | build kit | Works; kit price is locked to the component sum | VIEW-029 |
| Pricing: cost / markup / price | :466 / :478 / :490 | linked pricing | Works (disabled for kits) | VIEW-029 |
| Media: Choose File | :533 | upload | Partial: bucket may not exist; premium gating is client-only | VIEW-028, VIEW-008 |
| Media: "Drag & drop" | :525 | drop upload | **Not implemented** (text only) | VIEW-029 |
| Media: remove image ✕ | :546 | remove | **Dead: no onClick** | VIEW-029 |
| Cancel / Save Item | :563 / :564 | close / save | Works | — |

### 2.3 AnalyticsView
| Control | file:line | Intended | Actual | Issue |
|---|---|---|---|---|
| Back | AnalyticsView.tsx:152 | dashboard | Works | — |
| Start / End date | :164 / :171 | range filter | Partial: UTC parsing, off-by-one days | VIEW-034 |
| Total Revenue / Outstanding / Avg | :190 / :201 / :224 | money KPIs | **Broken: $0 for documents not opened this session** | VIEW-033 |
| Win rate | :212 | accepted / all estimates | Partial (first 50 docs only) | VIEW-033 |
| Revenue chart | :237 | trend | Broken (same data problem) and wrong day labels | VIEW-033, VIEW-034 |
| Top clients | :279 | leaderboard | Broken (zeros); "jobs" label is really invoice count | VIEW-033, VIEW-034 |
| Job overview bar | :324 | status split | Works | — |

### 2.4 CalendarView
| Control | file:line | Intended | Actual | Issue |
|---|---|---|---|---|
| Back | CalendarView.tsx:140 | dashboard | Works | — |
| New Job | :163 | create job, return to calendar | Partial (job creation itself is broken) | VIEW-037 |
| Prev / Today / Next | :181 / :187 / :193 | navigate | Works | — |
| Month / Week / List | :206-217 | view switch | Works | — |
| Event click | :274 | open job | Works | — |
| Event placement | :39-54 | job dates | **Broken west of UTC** (one day early); multi-day ends one day short | VIEW-035 |
| Grid styling / dark mode | :222-262 | themed grid | Broken: invalid CSS colour values | VIEW-036 |

### 2.5 ProfitCalculatorView
| Control | file:line | Intended | Actual | Issue |
|---|---|---|---|---|
| Back | :206 | dashboard | Works | — |
| Simple/Advanced | :218 | toggle | Partial: VAT still exported after switching to Simple | VIEW-040 |
| Load / Save | :227 / :231, :459, :479, :484 | localStorage | Works (device-local only) | VIEW-040 |
| Export PDF | :235 | download report | Works | — |
| Reset (desktop / mobile) | :239 / :312 | clear | Works | — |
| Target margin + Calculate | :255 / :265 | price to margin | Works (0 % rejected) | VIEW-040 |
| VAT toggle / rate | :278 / :288 | tax | Works | — |
| Item rows / Add / Remove | :328-360 | edit items | Works | — |

### 2.6 JobForm / JobCard / job status
| Control | file:line | Intended | Actual | Issue |
|---|---|---|---|---|
| Back / Cancel | JobForm.tsx:81 / :154 | dashboard | Works | — |
| Client select | :122 | prefill client | Partial (first 50 clients) | VIEW-038 |
| Fields | :115-149 | job data | Works (no end date field) | VIEW-038 |
| Create Job | :155 | insert job | **LIKELY broken: camelCase insert**; stays on "Saving..." on conflict | VIEW-037, VIEW-038 |
| Limit Upgrade (inside JobForm) | :162-166 | pay and upgrade | **Broken: no userId or onUpgrade** | VIEW-006 |
| JobCard ⋮ Duplicate / Delete | JobCard.tsx:42 / :46 | modals | Works (menu stays open) | VIEW-031 |
| View Project | JobCard.tsx:60 | job details | Works | — |
| Status select | App.tsx:2876 | update status | Works | — |

### 2.7 ForumView
| Control | file:line | Intended | Actual | Issue |
|---|---|---|---|---|
| Back | ForumView.tsx:521 | list or dashboard | Works | — |
| Bell / item / close | :534 / :543 / :540 | notifications | Works (notifications spoofable) | VIEW-041 |
| + New Post | :553 | composer | Works | — |
| Category tabs / sort | :584 / :588-589 | filter | Works (no pagination) | VIEW-042 |
| Vote up/down (list, detail) | :610,:614 / :675,:679 | vote | Partial: counts written by client | VIEW-041 |
| Owner edit / delete (list) | :631 / :632 | manage own post | Partial: invisible on touch devices | VIEW-044 |
| Owner edit / delete (detail) | :692 / :693 | — | Works; delete of 0 rows shows the full-screen "DB setup" page | VIEW-042 |
| Show more | :627 / :640 | expand | Works | — |
| Comment sort / vote | :718-719 / :726,:728 | — | Partial (client counters) | VIEW-041 |
| Comment image / camera / text / Post | :754 / :755 / :757 / :758 | add comment | Works; Enter can double-post | VIEW-044 |
| Comment edit / delete / report | — | moderation | **Missing** | VIEW-042 |
| Post modal fields / upload / camera / video / remove image | :776-819 | compose | Works; edit cannot change image or category | VIEW-044 |
| Deep link `/forum/:id` | App.tsx:869 | open post | Works only when already logged in | VIEW-043 |
| Dashboard Community badge | App.tsx:2590 | unread count | **Dead** (`setNotificationCount` never called) | VIEW-043 |

### 2.8 Settings / Account / Auth / Billing
| Control | file:line | Intended | Actual | Issue |
|---|---|---|---|---|
| Back | Settings.tsx:105 | dashboard | Works | — |
| Company fields, logo | :119-131 | edit profile | Works | — |
| Save Changes (×3) | :145 / :187 / :224 | upsert profile | Partial: errors swallowed, edits lost on failure | VIEW-010 |
| Theme buttons | :154 / :162 / :170 | theme | Partial: not persisted until Save, reverted on next load | VIEW-010 |
| Language | :182 | UI language | Partial: dashboard strings only | VIEW-011 |
| Avatar / Change Photo | :206 / :211 | upload | Works | — |
| Upgrade | :235 | open plan modal | Works | VIEW-007 |
| Log Out | :242 | sign out | Works | — |
| Delete account / signature / manage or cancel subscription | — | — | **Missing** | VIEW-009 |
| UpgradeModal PayPal button | UpgradeModal.tsx:91 | subscribe | Partial: client-side upgrade; may not render | VIEW-002, VIEW-007 |
| "Get Started with AI" | UpgradeModal.tsx:129 | AI plan | **Dead** | VIEW-007 |
| Close / Maybe later / backdrop | :44 / :136 / :40 | close | Works | — |
| Login submit / Google / forgot / reset | Login.tsx:182 / :197 / :146 / :117 | auth | Works | — |
| Signup submit / Google / to login | Signup.tsx:145 / :160 / :167 | auth | Works | VIEW-013 |
| "Check your email" screen | App.tsx:2510 | next step | Dead end (no button) | VIEW-013 |
| UpdatePassword submit | UpdatePassword.tsx:102 | set password | Works with a session; blank page without one | VIEW-013 |
| Welcome nav links | Welcome.tsx:43-45, :66-67 | scroll to sections | Partial: 3 of 4 anchors don't exist; mobile links are `#` | VIEW-015 |
| Welcome CTAs | :51, :71, :104, :253, :347 | signup | Works | — |
| Footer Product / Company / social | :383-395, :372-376 | pages | **Dead** (`onClick={() => {}}` / `href="#"`) | VIEW-015 |
| Footer Privacy / Terms / Security | :401 / :402 / :403 | legal | Privacy and Terms go to external domains; Security works | VIEW-014 |
| Privacy / Terms / Security back | PrivacyPolicy.tsx:14 etc. | back | Works | VIEW-014 |
| Dock items | App.tsx:3022-3041, Dock.tsx | nav | Works; "Clients"/"Communication" labels not translated; labels only on hover | VIEW-011 |
| Rich-text Toolbar font / heading labels | Toolbar.tsx:200, :214 | show current style | Partial: static text "Normal"/"Arial" | VIEW-046 |

---

## 3. Issues

### Billing & account security

#### VIEW-001 — PayPal webhook accepts unauthenticated requests: anyone can make any account Premium (or downgrade anyone)
* **Severity:** Critical. **Status:** CONFIRMED
* **Location:** `supabase/functions/paypal-webhook/index.ts:11-12, 26-50`
* **What's wrong:** The signature check is commented out. Any POST with `{"event_type":"BILLING.SUBSCRIPTION.ACTIVATED","resource":{"custom_id":"<uuid>"}}` sets `subscription_tier='Premium'` using the **service-role key**. A `…CANCELLED` event downgrades any user. User ids are easy to find: `profiles` is readable by every authenticated user (VIEW-003) and every forum post carries `user_id`.
* **Repro:** `curl -X POST https://<ref>.supabase.co/functions/v1/paypal-webhook -H "Authorization: Bearer <anon key>" -d '{"event_type":"BILLING.SUBSCRIPTION.ACTIVATED","resource":{"custom_id":"<my uid>"}}'`. The anon key is public in `App.tsx:70`.
* **Root cause:** An MVP shortcut. The handler trusts the body.
* **Fix:** Verify every event with PayPal's verify-webhook-signature API, then re-fetch the subscription from PayPal as the source of truth, map the plan to a tier, store the subscription id, and make processing idempotent.

```ts
// supabase/functions/paypal-webhook/index.ts  (full replacement)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYPAL_API = Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.paypal.com"; // sandbox: https://api-m.sandbox.paypal.com
const PLAN_TO_TIER: Record<string, "Premium"> = {
  "P-65E58669J9805670ENFP23EA": "Premium",
};

async function paypalToken(): Promise<string> {
  const id = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
  const r = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`paypal oauth ${r.status}`);
  return (await r.json()).access_token;
}

async function verifySignature(req: Request, event: unknown, token: string): Promise<boolean> {
  const h = (n: string) => req.headers.get(n);
  const r = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: Deno.env.get("PAYPAL_WEBHOOK_ID"),
      webhook_event: event,
    }),
  });
  return r.ok && (await r.json()).verification_status === "SUCCESS";
}

async function getSubscription(id: string, token: string) {
  const r = await fetch(`${PAYPAL_API}/v1/billing/subscriptions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`subscription lookup ${r.status}`);
  return await r.json(); // { id, status, plan_id, custom_id, billing_info: { next_billing_time } }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const event = await req.json();
  const token = await paypalToken();
  if (!(await verifySignature(req, event, token))) return new Response("invalid signature", { status: 401 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Idempotency: PayPal retries; insert fails on a duplicate id
  const { error: dupErr } = await admin.from("billing_events").insert({ id: event.id, event_type: event.event_type, payload: event });
  if (dupErr?.code === "23505") return new Response(JSON.stringify({ duplicate: true }), { status: 200 });
  if (dupErr) return new Response(dupErr.message, { status: 500 }); // 5xx => PayPal retries

  const r = event.resource ?? {};
  const subId: string | undefined = event.event_type.startsWith("BILLING.SUBSCRIPTION") ? r.id : r.billing_agreement_id;
  if (!subId) return new Response(JSON.stringify({ ignored: true }), { status: 200 });

  const sub = await getSubscription(subId, token); // authoritative status, plan and custom_id
  const userId = sub.custom_id;
  const tier = PLAN_TO_TIER[sub.plan_id];
  if (!userId || !tier) return new Response(JSON.stringify({ ignored: "unknown user or plan" }), { status: 200 });

  const active = ["ACTIVE"].includes(sub.status);
  const { error } = await admin.from("profiles").update({
    subscription_tier: active ? tier : "Basic",
    subscription_status: sub.status.toLowerCase(),
    paypal_subscription_id: sub.id,
    subscription_current_period_end: sub.billing_info?.next_billing_time ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", userId);
  if (error) return new Response(error.message, { status: 500 });

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
```
Required SQL (see also VIEW-004):
```sql
alter table public.profiles
  add column if not exists subscription_status text default 'inactive',
  add column if not exists paypal_subscription_id text,
  add column if not exists subscription_current_period_end timestamptz;
create table if not exists public.billing_events (
  id text primary key, event_type text not null, payload jsonb, received_at timestamptz default now()
);
alter table public.billing_events enable row level security; -- no policies: service role only
```
Set the secrets `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` and `PAYPAL_API_BASE`.

#### VIEW-002 — The Premium tier is granted by the browser, and RLS lets any user set their own tier
* **Severity:** Critical. **Status:** CONFIRMED (policy as defined in the App setup script)
* **Location:** `App.tsx:1286-1292` (`handleUpgradeSuccess`), `App.tsx:175-176` (policy `FOR UPDATE USING (auth.uid() = id)`), `UpgradeModal.tsx:28-31`
* **What's wrong:** After PayPal `onApprove` the client runs `supabase.from('profiles').update({ subscription_tier: 'Premium' })`. Because the update policy has no column restriction, any logged-in user can run the same statement in DevTools and get Premium for free. A user can also lower `email_usage` (VIEW-008).
* **Root cause:** Entitlements are stored in a user-writable row.
* **Fix:** Protect the billing columns in the database and make the client wait for the webhook.
```sql
create or replace function public.protect_billing_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.subscription_tier := 'Basic';
    new.subscription_status := 'inactive';
    new.paypal_subscription_id := null;
  elsif new.subscription_tier is distinct from old.subscription_tier
     or new.subscription_status is distinct from old.subscription_status
     or new.paypal_subscription_id is distinct from old.paypal_subscription_id then
    raise exception 'Billing fields are managed by the billing service';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_billing on public.profiles;
create trigger trg_protect_billing before insert or update on public.profiles
for each row execute function public.protect_billing_columns();
```
```ts
// App.tsx — replace handleUpgradeSuccess (1286-1292)
const handleUpgradeSuccess = async () => {
    if (!session) return;
    setShowGlobalUpgrade(false);
    for (let i = 0; i < 10; i++) {               // webhook usually lands within seconds
        const { data } = await supabase.from('profiles')
            .select('subscription_tier').eq('id', session.user.id).single();
        if (data?.subscription_tier === 'Premium') {
            setProfile(p => p ? { ...p, subscriptionTier: 'Premium' } : p);
            alert('Upgrade successful! You are now a Premium user.');
            return;
        }
        await new Promise(r => setTimeout(r, 3000));
    }
    alert('Payment received. Your plan will be activated within a few minutes.');
};
```

#### VIEW-003 — Every user can read every other user's profile, including Gmail OAuth tokens
* **Severity:** Critical. **Status:** CONFIRMED (per the repo SQL; LIKELY in production if that script was run)
* **Location:** `App.tsx:131-133` (token columns), `App.tsx:171-172` (`"Users can view all profiles" … FOR SELECT TO authenticated USING (true)`), `App.tsx:1406-1413` (tokens written to `profiles`)
* **What's wrong:** Any authenticated user can run `supabase.from('profiles').select('id,email,phone,address,gmail_access_token,gmail_refresh_token')` and harvest other users' Gmail send tokens and contact data. This also contradicts the privacy policy (PrivacyPolicy.tsx:64).
* **Root cause:** The policy was opened so the forum could show author names and avatars.
* **Fix:** Restrict `profiles` to the owner, expose a minimal author view for the forum, and stop storing tokens in `profiles` (the `user_credentials` table already exists with own-row RLS).
```sql
drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view own profile" on public.profiles for select to authenticated using (auth.uid() = id);

create or replace view public.forum_authors as
  select id, name, profile_picture_url from public.profiles;   -- runs with owner rights (security definer view)
revoke all on public.forum_authors from anon;
grant select on public.forum_authors to authenticated;

update public.profiles set gmail_access_token = null, gmail_refresh_token = null;
```
```ts
// App.tsx:1406-1413 — stop writing tokens to profiles (keep only the user_credentials upsert)
- supabase.from('profiles').update(tokenData).eq('id', session.user.id);
// App.tsx:1470 — remove gmail_access_token, gmail_refresh_token from the profiles select
```
```ts
// ForumView.tsx fetchPosts — replace the profiles embed with a second query
const { data: postsData } = await query.select('*, forum_comments(count)');
const authorIds = [...new Set((postsData || []).map((p: any) => p.user_id))];
const { data: authors } = await supabase.from('forum_authors').select('id,name,profile_picture_url').in('id', authorIds);
const byId = new Map((authors || []).map((a: any) => [a.id, a]));
const formattedPosts = (postsData || []).map((p: any) => ({ ...p, profiles: byId.get(p.user_id) /* … */ }));
```
Apply the same change to the comment and notification queries.

#### VIEW-004 — The webhook can never update anyone: a missing column, ignored errors and the default JWT gate
* **Severity:** High. **Status:** LIKELY (CONFIRMED against the repo schema)
* **Location:** `paypal-webhook/index.ts:33-37, 45-49, 53`; there is no `supabase/config.toml`; `DEPLOYMENT_GUIDE.md:28`
* **What's wrong:**
  1. It writes `subscription_status`, which no SQL in the repo creates. PostgREST returns `PGRST204`, the `error` is never checked, and the function replies 200, so PayPal never retries.
  2. Supabase edge functions verify a JWT by default. PayPal sends no `Authorization` header, so a function deployed as the guide says (`functions deploy paypal-webhook`, without `--no-verify-jwt`) answers **401** to every real PayPal event.
* **Impact:** Cancellations never downgrade anyone, and paid users only become Premium through the insecure client path (VIEW-002).
* **Fix:** Add the columns (SQL in VIEW-001), check `error` and return 5xx so PayPal retries (VIEW-001 code), and deploy without the gateway JWT check (signature verification replaces it):
```toml
# supabase/config.toml
[functions.paypal-webhook]
verify_jwt = false
```
```bash
npx supabase functions deploy paypal-webhook --no-verify-jwt
```

#### VIEW-005 — Webhook business logic gaps
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `paypal-webhook/index.ts:26-50`; `DEPLOYMENT_GUIDE.md:45-51`
* **What's wrong:** There is no plan to tier mapping (any plan or sale event means Premium). The subscription id is not stored, so support cannot reconcile and users cannot cancel in-app. `PAYMENT.SALE.DENIED` and `BILLING.SUBSCRIPTION.PAYMENT.FAILED` are subscribed in the guide but unhandled. `CANCELLED` downgrades immediately even though the user has paid until the period end. There is no idempotency.
* **Fix:** Use the VIEW-001 code: re-fetch the subscription, `PLAN_TO_TIER`, store `paypal_subscription_id` and `subscription_current_period_end`, and keep the `billing_events` table. For a period-end downgrade, set the tier to Basic only when `status in ('EXPIRED','SUSPENDED')`. For `CANCELLED`, keep Premium and run a daily job:
```sql
update public.profiles set subscription_tier = 'Basic'
where subscription_status = 'cancelled' and subscription_current_period_end < now();
```

#### VIEW-006 — Paying from the job-limit modal charges the user but never upgrades them
* **Severity:** High. **Status:** CONFIRMED
* **Location:** `JobForm.tsx:162-166` renders `<UpgradeModal isOpen onClose featureName="Unlimited Jobs" />`; `UpgradeModal.tsx:25,29`
* **What's wrong:** This instance has no `userId` (so `custom_id` is undefined and the webhook cannot map the subscription to a user) and no `onUpgrade` (so there is no client update). This modal is reached at `/jobs/create` when `jobCount >= 6`. The subscription is charged but the account stays Basic.
* **Fix:** Remove the private modal and use the global one.
```tsx
// JobForm.tsx
interface JobFormProps { /* … */ onUpgradeClick?: () => void; }
- const [showUpgrade, setShowUpgrade] = useState(false);
  if (jobCount >= limit) { onUpgradeClick?.(); return; }
- <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} featureName="Unlimited Jobs" />
```
```tsx
// App.tsx:3066
<JobForm … onUpgradeClick={() => { setUpgradeFeature('Unlimited Jobs'); setShowGlobalUpgrade(true); }} />
```
```tsx
// UpgradeModal.tsx — never render a purchase button without a user id
if (isOpen && (window as any).paypal && userId) { … }
```

#### VIEW-007 — UpgradeModal UX: the reason is never shown, the button may never render, and the AI plan button is dead
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `UpgradeModal.tsx:13` (`featureName` is destructured but unused), `:14-35` (effect deps `[isOpen]`, no retry if the SDK has not loaded), `:129-131` (a button with no handler)
* **Impact:** Users who hit a limit see a generic "Choose Your Plan" with no explanation (App sets messages such as "6 jobs limit per month… You have created 6"). On slow networks the PayPal area stays empty.
* **Fix:**
```tsx
<p className="text-sm text-amber-600 font-medium mt-2">{featureName}</p>

React.useEffect(() => {
  if (!isOpen || !userId) return;
  let cancelled = false;
  const render = () => {
    const pp = (window as any).paypal;
    const el = document.getElementById(containerId);
    if (!pp || !el) { if (!cancelled) setTimeout(render, 300); return; }
    el.innerHTML = '';
    pp.Buttons({ /* same as today */ }).render('#' + containerId);
  };
  render();
  return () => { cancelled = true; };
}, [isOpen, userId]);

<button disabled className="… opacity-50 cursor-not-allowed">Coming soon</button>
```

#### VIEW-008 — Free-plan limits are enforced only in React and are easy to bypass
* **Severity:** High. **Status:** CONFIRMED
* **Location:** `App.tsx:1294-1322` (`checkLimit`, in-memory counts); bypass paths: `handleNavigateToNewDoc` (App.tsx:2284-2316) creates a job and opens a doc with no check; `handleDuplicateJob` (2215-2273) has no jobs check; the email counter is written by the client (2028-2034, 1487-1494); the price-book image premium gate is UI-only (PriceBookItemDetails.tsx:514-537). `persistent_tracking.sql:24-28` documents limits ("Max 6 Jobs (Active)", "Max 12 Documents", "Max 10 Emails") that differ from the code (monthly, 12 per project).
* **Impact:** Any free user can create unlimited jobs, docs and emails via the API or the bypass paths, and can reset their email counter.
* **Fix:** Enforce limits in the database and keep `checkLimit` only for UX.
```sql
create or replace function public.enforce_free_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tier text; v_count int; v_limit int;
begin
  select subscription_tier into v_tier from profiles where id = new.user_id;
  if coalesce(v_tier,'Basic') = 'Premium' then return new; end if;
  if tg_table_name = 'documents' and exists (select 1 from documents where id = new.id) then
    return new; -- upsert of an existing doc (BEFORE INSERT fires on ON CONFLICT too)
  end if;
  if tg_table_name = 'jobs' then
    v_limit := 6;  select count(*) into v_count from jobs where user_id = new.user_id and created_at >= date_trunc('month', now());
  elsif tg_table_name = 'clients' then
    v_limit := 15; select count(*) into v_count from clients where user_id = new.user_id and created_at >= date_trunc('month', now());
  else
    v_limit := 12; select count(*) into v_count from documents where user_id = new.user_id and job_id = new.job_id and created_at >= date_trunc('month', now());
  end if;
  if v_count >= v_limit then raise exception 'FREE_LIMIT_REACHED:%', tg_table_name; end if;
  return new;
end $$;
create trigger trg_limit_jobs before insert on public.jobs for each row execute function public.enforce_free_limits();
create trigger trg_limit_clients before insert on public.clients for each row execute function public.enforce_free_limits();
create trigger trg_limit_docs before insert on public.documents for each row execute function public.enforce_free_limits();

-- email usage: server-side increment only
revoke update (email_usage, email_usage_month) on public.profiles from authenticated;
create or replace function public.increment_email_usage() returns int
language plpgsql security definer set search_path = public as $$
declare v int; m text := to_char(now(), 'YYYY-MM');
begin
  update profiles set email_usage = case when email_usage_month = m then email_usage + 1 else 1 end,
                      email_usage_month = m
  where id = auth.uid() returning email_usage into v;
  return v;
end $$;
```
Note: a column-level `revoke update (…)` has no effect while a table-level UPDATE grant exists. Either grant UPDATE per column, or extend the `protect_billing_columns` trigger (VIEW-002) to reject changes to `email_usage` and `email_usage_month` from non-service roles.

In App, map `FREE_LIMIT_REACHED` errors to `setShowGlobalUpgrade(true)` in `handleSaveJob`, `handleAddClient` and `handleSaveForm`, and call `supabase.rpc('increment_email_usage')` in `handleEmailSent`. Remove the client-side reset at App.tsx:1487-1494.

#### VIEW-009 — Settings is missing account deletion, default-signature setup and subscription management
* **Severity:** Medium (compliance: GDPR/CCPA and the Google API user-data policy expect deletion). **Status:** CONFIRMED (absent)
* **Location:** `Settings.tsx` (whole file); there is no delete-user code anywhere.
* **Fix:** Add an edge function and buttons.
```ts
// supabase/functions/delete-account/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // 1) cancel the PayPal subscription if profiles.paypal_subscription_id is set (POST /v1/billing/subscriptions/{id}/cancel)
  // 2) remove storage objects under `${user.id}/` in logos, forum, price-book-images
  for (const bucket of ["logos", "forum", "price-book-images"]) {
    const { data } = await admin.storage.from(bucket).list(user.id);
    if (data?.length) await admin.storage.from(bucket).remove(data.map(f => `${user.id}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id); // FKs are ON DELETE CASCADE
  return error ? new Response(error.message, { status: 500 }) : new Response(JSON.stringify({ ok: true }));
});
```
```tsx
// Settings.tsx (profile mode, Account Actions card)
<Button variant="destructive" onClick={async () => {
  if (prompt('Type DELETE to permanently delete your account and all data') !== 'DELETE') return;
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) return alert(error.message);
  onLogout();
}}>Delete account</Button>
```
For the signature, add `profiles.default_signature_url`, reuse `SetupSignatureModal` in Settings, and prefill forms from it. For subscription management, show the status and renewal date from the new columns and a "Manage on PayPal" link (`https://www.paypal.com/myaccount/autopay/`).

#### VIEW-010 — Settings save: errors are swallowed, unsaved edits are lost, and the theme is not persisted
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `App.tsx:1992-2026`, `App.tsx:3052`, `App.tsx:1531-1533`, `App.tsx:1357-1363`, `Settings.tsx:154-178`
* **What's wrong:**
  1. `setLoading(true)` makes `renderContent` return the full-screen loading div, which **unmounts Settings**. If the upload throws (line 2001) or the upsert fails (2020-2025), nothing is shown, Settings remounts from the old `profile`, and the user's edits are gone.
  2. The theme buttons call `setTheme` (localStorage only). `profiles.theme` is written only by Save, and `fetchData` sets the theme from `profiles.theme` on every load, so an unsaved theme choice reverts on the next reload or device.
* **Fix:**
```ts
// App.tsx
const [savingProfile, setSavingProfile] = useState(false);
const handleSaveProfile = async (updated: UserProfile, logoFile?: File | null, picFile?: File | null) => {
    if (!session) return;
    setSavingProfile(true);
    try {
        const logo = logoFile ? await uploadFile('logos', logoFile, session.user.id, true) : updated.logoUrl;
        const pic  = picFile  ? await uploadFile('logos', picFile,  session.user.id, true) : updated.profilePictureUrl;
        const { error } = await supabase.from('profiles').upsert({ /* same fields */ logo_url: logo, profile_picture_url: pic, theme });
        if (error) throw error;
        setProfile({ ...updated, logoUrl: logo, profilePictureUrl: pic });
        setView({ screen: 'dashboard' });
    } catch (e: any) {
        alert(`Could not save your profile: ${e.message || e}`);
    } finally { setSavingProfile(false); }
};
const handleThemeChange = (t: 'light' | 'dark' | 'blue') => {
    setTheme(t);
    if (session) supabase.from('profiles').update({ theme: t }).eq('id', session.user.id);
};
// pass setTheme={handleThemeChange} and isSaving={savingProfile} to <Settings/>; disable the Save buttons while saving
```

#### VIEW-011 — Translations cover only about 30 dashboard strings, and an unknown language crashes the dashboard
* **Severity:** Low. **Status:** CONFIRMED (partial coverage); LIKELY (crash)
* **Location:** `utils/translations.ts:2`, `App.tsx:2502`, `App.tsx:3031-3038` (hard-coded "Clients", "Communication"); every screen in this area (Inventory, Price Book, Analytics, Calendar, Forum, Settings, JobForm, UpgradeModal) is hard-coded English.
* **What's wrong:** `translations[profile?.language || 'English']` returns `undefined` for any value not among the 10 keys (for example `'en'`, `'Arabic'`, or a value written by the AI or an older client). `t.welcome` then throws and the dashboard goes blank.
* **Fix:**
```ts
const getTranslation = () => ({ ...translations.English, ...(translations[profile?.language ?? 'English'] ?? {}) });
```
Then move every user-visible string into the dictionary (or adopt `react-i18next`) and pass `t` into these screens.

#### VIEW-012 — A missing `profiles` column produces a blank app with no error
* **Severity:** Medium. **Status:** LIKELY
* **Location:** `App.tsx:1468-1480, 1535, 1570, 2515`
* **What's wrong:** The profile select names 18 columns (including `email_usage_month`, `theme` and `email_templates`). If any is missing (for example the DB only had `persistent_tracking.sql`, which adds `email_usage` but not `email_usage_month`), Postgres returns 42703 "column … does not exist". The regex at 1475 doesn't match that message, the `else if` at 1535 is false, `currentProfile` stays `null`, and `renderDashboard` returns `null`: a white screen.
* **Fix:**
```ts
if (profileError && profileError.code !== 'PGRST116') {
    if (/does not exist|schema cache|invalid input syntax/i.test(profileError.message) || profileError.code === '42703') {
        setDbSetupError(SQL_SETUP_SCRIPT); setLoading(false); return;
    }
    throw profileError; // surfaced by an error boundary / toast instead of a white page
}
```
Also add `email_usage_month` to `persistent_tracking.sql`.

#### VIEW-013 — Auth flow dead ends
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `App.tsx:2510` (the "Check your email" card has no action); `App.tsx:3054-3063` (`/update-password` is only routed when a session exists, otherwise `renderAuth()` returns null and the page is blank); `Signup.tsx` (no Terms/Privacy consent).
* **Fix:**
```tsx
case 'checkEmail': return (<div …><Card …><CardHeader><CardTitle>Check your email</CardTitle></CardHeader>
  <CardContent><p>We've sent a confirmation link.</p></CardContent>
  <CardFooter><Button className="w-full" onClick={() => setView({ screen: 'auth', authScreen: 'login' })}>Back to login</Button></CardFooter></Card></div>);
// in the !session branch:
if (view.screen === 'updatePassword') return <div className="p-8 text-center">This reset link has expired. <Button variant="link" onClick={() => setView({ screen: 'auth', authScreen: 'login' })}>Request a new one</Button></div>;
```
Add an "I agree to the Terms and Privacy Policy" checkbox to Signup that is required before submit.

#### VIEW-014 — Legal pages show a fake "Last Updated" date and make inaccurate claims
* **Severity:** Medium (legal and compliance). **Status:** CONFIRMED
* **Location:** `PrivacyPolicy.tsx:31` and `TermsOfService.tsx:31` (`new Date().toLocaleDateString()`, which is always today); `PrivacyPolicy.tsx:64` ("isolated and accessible only by you", false per VIEW-003; the forum is public to all users); `:51` ("we do not … store" Gmail data, but OAuth tokens are stored in `profiles` and `user_credentials`); there is no mention of PayPal, AI processing of user content, or the public forum; the Terms have no subscription, refund or cancellation clause; `Security.tsx:38` asserts AES-256 at-rest encryption of uploaded files (true for Supabase disks, but the `logos` bucket is **public**, App.tsx:273-276).
* **Fix:** Hard-code the revision date (`const LAST_UPDATED = '2026-11-10';`), correct the claims after VIEW-003 is fixed, and add sections for payment processor (PayPal), AI sub-processors, the community forum (content visible to other users), data retention and account deletion (VIEW-009), and subscription and refunds in the Terms. Link the Welcome footer to the in-app routes (`onNavigate('privacy')`, `onNavigate('terms')`) or make sure the external pages are the same text.

#### VIEW-015 — Landing page: dead links and buttons, and unverifiable marketing claims
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `Welcome.tsx:43-45` (anchors `#solutions`, `#pricing`, `#resources` do not exist), `:66-67` (mobile links `href="#"`, and the menu doesn't close), `:372-376` (social `href="#"`), `:383-395` (seven footer buttons with `onClick={() => {}}`), `:344` ("Join 15,000+ contractors"), `:281-298` (testimonials), `:408` (© 2024).
* **Fix:** Remove the items that don't exist or link them to real sections and pages. Add `id="pricing"` with the real plans (from `UpgradeModal`). Close the mobile menu on click (`onClick={() => setIsMobileMenuOpen(false)}`). Remove unverifiable numbers and testimonials unless they are real. Use `© {new Date().getFullYear()}`.

### Inventory & Price Book

#### VIEW-016 — `apply_document_inventory_delta` is a SECURITY DEFINER RPC that trusts a caller-supplied `p_user_id`: cross-tenant inventory tampering
* **Severity:** Critical. **Status:** CONFIRMED
* **Location:** `SQL_DOCUMENT_INVENTORY_LINK.sql:7-18, 56-91`; the same function in `App.tsx:543-629`
* **What's wrong:** Public-schema functions are EXECUTE-able by `anon` and `authenticated` by default, and PostgREST exposes them as `/rpc/apply_document_inventory_delta`. The function bypasses RLS and filters only by `user_id = p_user_id`, which the attacker chooses. An attacker needs a victim `user_id` (forum posts, readable `profiles`) and an inventory item id, which is **printed on every QR sticker** (`PrintTagsModal.tsx:131`). They can then drain or inflate stock and write fake history rows: `rpc('apply_document_inventory_delta', { p_user_id, p_doc_id, p_line_items: [{inventoryItemId, quantity: 999}], p_direction: -1 })`. Neither this function nor `adjust_inventory` sets `search_path`.
* **Fix:**
```sql
alter function public.apply_document_inventory_delta(uuid, uuid, jsonb, integer, uuid, text) set search_path = public;
revoke all on function public.apply_document_inventory_delta(uuid, uuid, jsonb, integer, uuid, text) from public, anon, authenticated;
-- the trigger must now run as owner to keep calling it:
alter function public.trg_documents_inventory() security definer set search_path = public;
alter function public.adjust_inventory(uuid, integer, uuid, text) set search_path = public;
revoke all on function public.adjust_inventory(uuid, integer, uuid, text) from anon;
```
(`adjust_inventory` already checks `auth.uid()`, so keep it callable by `authenticated`.)

#### VIEW-017 — A Material Log deducts stock again on every later save
* **Severity:** High. **Status:** CONFIRMED
* **Location:** `App.tsx:2093-2122`; `MaterialLogForm.tsx:26, 257-258`
* **What's wrong:** `dataToSave` is built (2093) **before** `formData.deductInventory = false` (2121), so the stored JSON keeps `deductInventory: true`. Reopening the log loads that data (`useState(data || …)`) with the checkbox still ticked, and every save deducts the full quantities again. Also, the deduction runs before the document upsert (2124): if the save fails, stock is gone. `handleAllocateInventory` clamps at 0 while logging the full negative (VIEW-020).
* **Fix (preferred):** Move Material Log into the existing DB trigger so stock follows the document state, then remove the client-side loop.
```sql
-- inside trg_documents_inventory(): treat a Material Log with deductInventory=true as "committed"
-- and read its 'items' array (each row already has inventoryItemId + quantity)
IF NEW.type = 'Material Log' THEN
  is_new_committed := COALESCE((NEW.data->>'deductInventory')::boolean, false);
  is_old_committed := TG_OP = 'UPDATE' AND COALESCE((OLD.data->>'deductInventory')::boolean, false);
  -- then use NEW.data->'items' / OLD.data->'items' instead of 'lineItems' in the same three branches
END IF;
-- and add 'Material Log' to the type lists in INSERT/UPDATE/DELETE
```
```ts
// App.tsx handleSaveForm — delete lines 2108-2122 entirely
```
Minimal client-only alternative: build `dataToSave` after the loop with `deductInventory: false, inventoryDeductedAt: new Date().toISOString()` and skip when `inventoryDeductedAt` is already set.

#### VIEW-018 — Estimate "Accepted" and its Invoice "Paid" both deduct the same stock, and insufficient stock blocks marking an invoice paid
* **Severity:** High. **Status:** CONFIRMED (logic)
* **Location:** `SQL_DOCUMENT_INVENTORY_LINK.sql:109, 113-119, 125-146, 68-70` (same in App.tsx:645-692)
* **What's wrong:** All three types commit on `approved/accepted/paid`. The normal flow (estimate accepted, then converted to an invoice that is paid) deducts twice. Because `RAISE EXCEPTION 'Insufficient stock'` aborts the whole upsert, a contractor **cannot record a payment** (App shows "Insufficient stock…" at 2127) when stock went negative in reality. Fractional quantities are `CEIL`ed (1.5 units deduct 2).
* **Fix:** Commit stock on exactly one document per sale, and never block financial status changes.
```sql
-- trg_documents_inventory(): only Invoices and Change Orders move stock
IF NEW.type NOT IN ('Invoice', 'Change Order') THEN RETURN NEW; END IF;
-- Invoice commits when sent or paid (goods leave when invoiced); Change Order when approved
is_new_committed := (NEW.type = 'Invoice' AND lower(new_status) IN ('sent','paid','overdue'))
                 OR (NEW.type = 'Change Order' AND lower(new_status) IN ('approved','accepted'));

-- apply_document_inventory_delta(): allow negative stock and flag it instead of raising
-- (change the column to numeric(12,3) if fractional units matter, and drop CEIL)
v_next := v_prev + (p_direction * v_qty);
INSERT INTO public.inventory_history (…, action, …)
VALUES (…, CASE WHEN v_next < 0 THEN 'oversold' WHEN p_direction < 0 THEN 'deduct' ELSE 'restock' END, …);
```
In the UI, highlight negative quantities in red ("Oversold").

#### VIEW-019 — Two competing trigger sets, and neither SQL script can be re-run
* **Severity:** High. **Status:** CONFIRMED (re-run failure); LIKELY (double deduction in production)
* **Location:** `App.tsx:631-733` (creates `trg_documents_invoice_inventory_*` and function `trg_documents_invoice_inventory()`); `SQL_DOCUMENT_INVENTORY_LINK.sql:96-192` (creates `trg_documents_inventory_*` and drops the invoice ones)
* **What's wrong:**
  1. The App shows `SQL_SETUP_SCRIPT` whenever **any** schema-ish error happens (missing column, forum relationship, App.tsx:1476/1647/1699/1707/3152). Running it after `SQL_DOCUMENT_INVENTORY_LINK.sql` recreates the *invoice* trigger set without dropping the *inventory* set, so **both fire and every committed document deducts twice**.
  2. Both scripts run `DROP FUNCTION IF EXISTS <trigger fn>()` **before** dropping the triggers that depend on it (App.tsx:631 vs 717-733; LINK.sql:96 vs 171-190). On the second run Postgres fails with "cannot drop function … because other objects depend on it" and the rest of the script is skipped.
* **Fix:** Keep one canonical script (and remove the copy from `App.tsx`). Drop triggers first, never drop functions whose signature doesn't change, and drop both name variants:
```sql
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_insert ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_update ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_delete ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_inventory_insert ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_inventory_update ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_inventory_delete ON public.documents;
DROP FUNCTION IF EXISTS public.trg_documents_invoice_inventory();
CREATE OR REPLACE FUNCTION public.trg_documents_inventory() … ;   -- no DROP before it
CREATE TRIGGER trg_documents_inventory_insert …; -- etc.
```
Check production with `select tgname from pg_trigger where tgrelid = 'public.documents'::regclass and not tgisinternal;`. More than three inventory triggers means stock is being double-counted today.

#### VIEW-020 — Manual stock changes are non-atomic and stale, the log can disagree with stock, negative or over-allocation is accepted, and lookups only see page 1
* **Severity:** High. **Status:** CONFIRMED
* **Location:** `InventoryView.tsx:175-178, 180-189, 238-246, 611`; `App.tsx:2433-2500`
* **What's wrong:**
  * `adjustQuantity` sends `item.quantity ± 1` from props. Props refresh only after a full `fetchData()`, so three quick taps on "+" from 10 all write 11 (lost updates). Two devices overwrite each other.
  * `handleAllocateInventory` writes `max(0, q - n)` but logs `-n`, so the history no longer sums to stock. It reads `inventory` state: items beyond the first 50 return silently (`if (!item) return`), and scanned items beyond page 1 report "Item not found".
  * The allocate quantity accepts negatives (`parseInt('-5')`), which turns a checkout into a hidden restock, and values above available (the `max` attribute is not validated).
  * None of `insert/update/delete` check `error`. `handleAddInventoryItem` logs history and resolves even when the insert failed. `onAddItem` has no try/finally, so the modal spinner sticks on a throw.
* **Fix:** Route all stock changes through the existing atomic RPC and refresh only the affected row.
```ts
// App.tsx
const refreshInventoryItem = async (id: string) => {
    const { data } = await supabase.from('inventory').select(INVENTORY_COLUMNS).eq('id', id).maybeSingle();
    if (data) setInventory(prev => prev.some(i => i.id === id) ? prev.map(i => i.id === id ? data : i) : [data, ...prev]);
    const { data: hist } = await supabase.from('inventory_history').select(INVENTORY_HISTORY_COLUMNS)
        .eq('item_id', id).order('created_at', { ascending: false }).limit(1);
    if (hist?.[0]) setInventoryHistory(prev => [hist[0], ...prev.filter(h => h.id !== hist[0].id)]);
};
const adjustStock = async (itemId: string, delta: number, context: string, jobId?: string | null) => {
    if (!Number.isInteger(delta) || delta === 0) return false;
    const { error } = await supabase.rpc('adjust_inventory', { p_item_id: itemId, p_delta: delta, p_job_id: jobId ?? null, p_context: context });
    if (error) { alert(/Insufficient/.test(error.message) ? 'Not enough stock.' : `Stock update failed: ${error.message}`); return false; }
    await refreshInventoryItem(itemId);
    return true;
};
const handleAllocateInventory = (itemId: string, jobId: string | null, qty: number, notes?: string) =>
    adjustStock(itemId, -Math.abs(qty), notes || 'Allocated', jobId);
const handleQuickAdjust = (item: InventoryItem, delta: number) =>
    adjustStock(item.id, delta, delta > 0 ? 'Manual restock' : 'Manual adjustment');
const findInventoryItem = async (id: string) =>
    inventory.find(i => i.id === id) ?? (await supabase.from('inventory').select(INVENTORY_COLUMNS).eq('id', id).maybeSingle()).data;
```
```tsx
// InventoryView.tsx — validate the allocate quantity
const qtyValid = allocateData.quantity >= 1 && allocateData.quantity <= allocateModalItem.quantity;
<Input type="number" min={1} max={allocateModalItem.quantity} value={allocateData.quantity}
  onChange={e => setAllocateData({ ...allocateData, quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
<Button onClick={handleAllocate} disabled={loading || !qtyValid}>Confirm Scan Out</Button>
// scan: const item = await onFindItem(decodedId)  (new prop wired to findInventoryItem)
// add:  try { await onAddItem(newItem); setShowAddModal(false); } catch (e) { alert(…) } finally { setLoading(false); }
```
Separate the "edit item details" update (no quantity) from stock changes (VIEW-022).

#### VIEW-021 — Kits: checking out a kit doesn't touch component stock, and the assembly SQL is dead and conflicting
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `InventoryView.tsx:437, 180-189` (a kit is allocated like a plain row); `SQL_ASSEMBLIES_FEATURE.sql:6-13, 37-54, 61-75`; `FIX_ASSEMBLIES.sql:5-12, 63-103`
* **What's wrong:** A kit (`is_assembly`, `assembly_items` JSON) decrements only its own `quantity`; the real components are untouched. The kit's cost isn't derived from its components. The two assembly scripts define `assembly_components` with **different column names** (`component_id` vs `component_item_id`), reference `saved_items` ids (price book) rather than `inventory` ids, use `CREATE POLICY` without `DROP` (re-run fails), and define a `deduct_assembly_inventory` that nothing calls. `SQL_ASSEMBLIES_FEATURE.sql`'s version updates `inventory` with no user filter.
* **Fix:** Decide that inventory kits are virtual bundles and deduct their components atomically. Drop the unused table and functions.
```sql
create or replace function public.checkout_inventory(p_item_id uuid, p_qty int, p_job_id uuid default null, p_notes text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare v inventory%rowtype; c jsonb;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be positive'; end if;
  select * into v from inventory where id = p_item_id and user_id = auth.uid() for update;
  if not found then raise exception 'Inventory item not found'; end if;
  if v.is_assembly then
    for c in select * from jsonb_array_elements(coalesce(v.assembly_items, '[]'::jsonb)) loop
      continue when coalesce((c->>'is_custom')::boolean, false);
      perform adjust_inventory((c->>'item_id')::uuid, -((c->>'quantity')::int * p_qty), p_job_id,
                               coalesce(p_notes, 'Kit checkout') || ' (kit: ' || v.name || ')');
    end loop;
  else
    perform adjust_inventory(p_item_id, -p_qty, p_job_id, p_notes);
  end if;
end $$;
drop function if exists public.deduct_assembly_inventory(uuid, integer, uuid, text);
drop function if exists public.deduct_assembly_inventory(uuid, numeric);
drop table if exists public.assembly_components;
```
Call `supabase.rpc('checkout_inventory', …)` from `handleAllocateInventory`. Show the kit cost as Σ(component cost × qty) in the card and the add modal.

#### VIEW-022 — Inventory items can't be edited, "Quick Create Job" is unreachable, and the allocate modal leaks state
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `InventoryView.tsx` (no edit UI; `onUpdateItem` is only used for ±1 at :177); `:136, 642-669` (`setQuickJobMode(true)` is never called); `:600` (backdrop close doesn't reset `quickClientMode` / `quickJobMode` like Cancel at :702-706); `App.tsx:2452-2461` (`handleUpdateInventoryItem` ignores `name`, `is_assembly` and `assembly_items`); the quick-created client is only written into notes text (:207-211).
* **Fix:**
```tsx
// InventoryView.tsx — reuse the add modal for edits
const [editingItemId, setEditingItemId] = useState<string | null>(null);
<DropdownItem onClick={() => { setEditingItemId(item.id); setNewItem({ ...item, assembly_items: item.assembly_items || [] } as any); setShowAddModal(true); }}>Edit</DropdownItem>
const handleAddItem = async () => {
  if (!newItem.name) return;
  setLoading(true);
  try {
    if (editingItemId) await onUpdateItem({ ...(inventory.find(i => i.id === editingItemId)!), ...newItem, quantity: undefined } as any);
    else await onAddItem(newItem);
    setShowAddModal(false); setEditingItemId(null);
  } finally { setLoading(false); }
};
// make the quick-job form reachable, next to the 👥 button
<Button variant="outline" size="sm" onClick={() => { setQuickJobMode(true); setQuickClientMode(false); }} title="New job"><PlusIcon className="w-4 h-4" /></Button>
// backdrop
<div … onClick={() => { setAllocateModalItem(null); setQuickJobMode(false); setQuickClientMode(false); }}>
```
```ts
// App.tsx handleUpdateInventoryItem — details only (quantity goes through adjust_inventory)
const { error } = await supabase.from('inventory').update({
  name: item.name, category: item.category, unit: item.unit, cost_price: item.cost_price, supplier: item.supplier,
  location: item.location, low_stock_threshold: item.low_stock_threshold, is_assembly: item.is_assembly, assembly_items: item.assembly_items
}).eq('id', item.id);
if (error) { alert(error.message); return; }
await refreshInventoryItem(item.id);
```

#### VIEW-023 — Deletes happen with no confirmation, inventory delete erases its audit trail, and errors are ignored
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `InventoryView.tsx:377`; `PriceBookView.tsx:245, 325`; `App.tsx:2469-2473` (no error check); `App.tsx:469` (`inventory_history.item_id … ON DELETE CASCADE`)
* **Fix:**
```tsx
<DropdownItem destructive onClick={() => { if (confirm(`Delete "${item.name}"? This cannot be undone.`)) onDeleteItem(item.id); }}>
```
```sql
-- keep history when an item is removed
alter table public.inventory_history add column if not exists item_name text;
alter table public.inventory_history alter column item_id drop not null;
alter table public.inventory_history drop constraint if exists inventory_history_item_id_fkey;
alter table public.inventory_history add constraint inventory_history_item_id_fkey
  foreign key (item_id) references public.inventory(id) on delete set null;
```
```ts
const handleDeleteInventoryItem = async (id: string) => {
  const { error } = await supabase.from('inventory').delete().eq('id', id);
  if (error) return alert(`Delete failed: ${error.message}`);
  setInventory(prev => prev.filter(i => i.id !== id));
};
```

#### VIEW-024 — A low-stock threshold of 0 is treated as 5 on the card but not on the dashboard badge
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `InventoryView.tsx:327` (`|| 5`) vs `App.tsx:2531` (`?? 5`)
* **Fix:** `const isLowStock = item.quantity <= (item.low_stock_threshold ?? 5);`

#### VIEW-025 — "Print Tags" prints the whole Inventory page, and the label grid doesn't fit the sheet
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `PrintTagsModal.tsx:27-29, 36, 124-141`
* **What's wrong:** Only the modal has `print:hidden`. The header, filters and every inventory card print first, then the label grid flows after them, so stickers never line up. The grid is 3×60 mm + 2×7 mm = 194 mm inside 210−20 = 190 mm (it overflows). "30-per-page" Avery (5160) is a US-Letter 2⅝"×1" layout, not A4.
* **Fix:** Render the sheet in a portal and hide the app while printing.
```tsx
import { createPortal } from 'react-dom';
// …
{createPortal(
  <div id="print-tags-sheet" className="hidden print:block">{/* existing grid */}</div>,
  document.body
)}
<style>{`@media print {
  body > *:not(#print-tags-sheet) { display: none !important; }
  @page { size: letter; margin: 0.5in 0.19in; }
  #print-tags-sheet .grid { grid-template-columns: repeat(3, 2.625in); column-gap: 0.125in; }
  #print-tags-sheet .tag { width: 2.625in; height: 1in; }
}`}</style>
```
Encode a URL instead of the bare id (`${location.origin}/inventory?item=${item.id}`) so a phone camera opens the app.

#### VIEW-026 — The QR scanner restarts the camera on every parent re-render
* **Severity:** Low. **Status:** LIKELY
* **Location:** `QRScannerModal.tsx:18-51` (effect deps include `onScanSuccess`); `InventoryView.tsx:238` (a new function each render); `:39` and `:49` call `scanner.clear()` twice on success.
* **Fix:**
```tsx
const cbRef = React.useRef(onScanSuccess); cbRef.current = onScanSuccess;
useEffect(() => {
  if (!isOpen) return;
  const scanner = new Html5QrcodeScanner('qr-reader', config, false);
  let done = false;
  scanner.render(text => { if (done) return; done = true; cbRef.current(text); }, () => {});
  return () => { scanner.clear().catch(() => {}); };
}, [isOpen]);
```

#### VIEW-027 — The Price Book list is empty if any optional column is missing, because three migrations are required and the App's setup script creates none of them
* **Severity:** High. **Status:** LIKELY (CONFIRMED logic)
* **Location:** `App.tsx:82, 1689-1700`; `App.tsx:243-251` (setup creates only id/user_id/name/description/rate/unit_cost/created_at); `SQL_MIGRATION_PRICEBOOK.sql` (category, type, …), `SQL_ELITE_PRICEBOOK.sql` (category_id, is_favorite, last_used_at, use_count, assembly_items), `FIX_ASSEMBLIES.sql`
* **What's wrong:** The select names 19 columns. If e.g. `category_id` is missing (ELITE not run), PostgREST returns 42703, the code only handles "relation … does not exist", `savedItems` stays `[]`, and the Price Book shows "No items found". Invoices and estimates also receive an empty `savedItems`. Conflicting definitions: `images TEXT[]` (MIGRATION:6) vs `JSONB` (FIX:50); `markup` default 50 vs 0.
* **Fix:** One idempotent migration, plus a tolerant select.
```sql
alter table public.saved_items
  add column if not exists category text default 'General',
  add column if not exists category_id uuid,
  add column if not exists type text default 'service',
  add column if not exists images jsonb default '[]'::jsonb,
  add column if not exists taxable boolean default true,
  add column if not exists sku text,
  add column if not exists markup numeric default 0,
  add column if not exists is_assembly boolean default false,
  add column if not exists assembly_items jsonb default '[]'::jsonb,
  add column if not exists is_favorite boolean default false,
  add column if not exists last_used_at timestamptz,
  add column if not exists use_count integer default 0;
notify pgrst, 'reload schema';
```
```ts
let { data: savedData, error: savedError } = await supabase.from('saved_items').select(SAVED_ITEM_COLUMNS)…;
if (savedError && (savedError.code === '42703' || /does not exist/.test(savedError.message))) {
    console.warn('saved_items schema outdated, falling back to *', savedError.message);
    ({ data: savedData, error: savedError } = await supabase.from('saved_items').select('*').eq('user_id', user.id).order('name').range(0, LIST_PAGE_SIZE - 1));
}
```
Delete the unused `price_history`, `item_vendors` and `price_book_categories` tables, or build UI for them.

#### VIEW-028 — The storage buckets `forum` and `price-book-images` are never provisioned
* **Severity:** Medium. **Status:** LIKELY
* **Location:** `App.tsx:2036` (`uploadFile('forum', …)`), `App.tsx:3132` (`'price-book-images'`); only `logos` is created (App.tsx:273-278)
* **Impact:** Forum images and price-book images fail with "Bucket not found" unless they were created by hand. The `logos` policy allows any authenticated user to write any path.
* **Fix:**
```sql
insert into storage.buckets (id, name, public) values ('forum','forum',true), ('price-book-images','price-book-images',true)
on conflict (id) do nothing;
create policy "own folder upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('logos','forum','price-book-images') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder delete" on storage.objects for delete to authenticated
  using (bucket_id in ('logos','forum','price-book-images') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Allow users to upload their own logo" on storage.objects;
```
(`uploadFile` already writes to `${userId}/…`.)

#### VIEW-029 — Price-book editor defects: dead image-remove button, fake drag & drop, hooks after an early return, wrong title, and kit price locked and overwritten
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `PriceBookItemDetails.tsx:546` (✕ has no `onClick`; also hover-only), `:525` ("Drag & drop" has no handlers), `:21` (`if (!isOpen) return null;` runs before all hooks, violating the Rules of Hooks; it only works because React treats the zero-hook render as a remount), `:240` + `PriceBookView.tsx:57` (a new kit passes `{is_assembly}` so the title says "Edit Item"), `:218-233` + `:473, :483, :496` (opening an existing kit recomputes `rate` from the components, overwriting the saved selling price; the pricing fields are disabled for kits, so no kit markup or discount is possible)
* **Fix:**
```tsx
// move the early return below all hooks
const PriceBookItemDetails = (props) => { /* all useState/useEffect … */ if (!isOpen) return null; return (…); };

<CardTitle>{item?.id ? 'Edit Item' : (formData.is_assembly ? 'New Assembly/Kit' : 'New Price Book Item')}</CardTitle>

<button type="button" onClick={() => setFormData(p => ({ ...p, images: (p.images || []).filter((_, j) => j !== i) }))}
  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">…</button>

<div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && isPremium) handleImageUpload({ target: { files: [f] } } as any); }} …>

// kits: recompute cost only; keep price = cost × (1 + markup) and leave the Markup input enabled
useEffect(() => {
  if (!formData.is_assembly) return;
  const cost = calculateAssemblyCost();
  setFormData(p => ({ ...p, unit_cost: cost, rate: +(cost * (1 + (p.markup ?? 0) / 100)).toFixed(2) }));
}, [formData.assembly_items, allItems]);
// …and `disabled={formData.is_assembly}` only on the Unit Cost input
```
Also initialise `name: ''`, `rate: 0`, `taxable: true` when `item` has no id, to avoid controlled/uncontrolled warnings.

#### VIEW-030 — Price Book shows a stray "0", and search throws on a null name
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `PriceBookView.tsx:264` (`{item.unit_cost && item.unit_cost > 0 && (…)}` renders `0`), `:41`; `InventoryView.tsx:149`; `PriceBookView.tsx:262, 309` (`item.rate.toFixed` throws if `rate` is null)
* **Fix:** `{(item.unit_cost ?? 0) > 0 && (…)}`; `(item.name || '').toLowerCase()`; `Number(item.rate || 0).toFixed(2)`.

#### VIEW-031 — Dropdown menus stay open after choosing an item
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `components/ui/DropdownMenu.tsx:37-48, 53-68` (an item click is inside `menuRef`, so the outside-click handler never closes it). Affects JobCard, Inventory and Price Book menus.
* **Fix:**
```tsx
{isOpen && (
  <div className={…} onClick={() => setIsOpen(false)}>
    <div className="py-2" role="menu">{children}</div>
  </div>
)}
```

#### VIEW-032 — Every mutation calls the global `fetchData()`: refreshes are dropped, pagination resets, and it is slow
* **Severity:** Medium. **Status:** LIKELY
* **Location:** `App.tsx:1452-1456` (`if (fetchingDataRef.current) return;`), and calls at 2445, 2467, 2472, 2487, 2499, 2152, 2158, 2162, 2075
* **What's wrong:** A second mutation while a fetch is in flight is never reflected. An AI bulk add of several inventory items ends with missing rows until reload. Each ± tap re-downloads profile, jobs, 50 docs, clients, inventory, history and the price book (7+ queries), then truncates every list back to page 1.
* **Fix:** Replace with targeted updates (VIEW-020 `refreshInventoryItem`). If a full refresh is needed, queue it instead of dropping it:
```ts
const pendingFetchRef = React.useRef(false);
const fetchData = async (force = true) => {
  if (!session) return;
  if (fetchingDataRef.current) { pendingFetchRef.current = true; return; }
  fetchingDataRef.current = true;
  try { /* …existing body… */ }
  finally {
    fetchingDataRef.current = false;
    if (pendingFetchRef.current) { pendingFetchRef.current = false; fetchData(true); }
  }
};
```

### Analytics & planning

#### VIEW-033 — Analytics totals are computed from lightweight metadata, so revenue, outstanding and averages read $0
* **Severity:** High. **Status:** CONFIRMED
* **Location:** `AnalyticsView.tsx:47-74`; `App.tsx:77, 90-107, 1614-1621, 3139`
* **What's wrong:** App state `forms` holds rows built by `createLightweightDocumentData`, which has only title, status, clientName, signature, flags and **no `lineItems`, `discount`, `taxRate`, `shipping` or `issueDate`**. Every invoice that wasn't opened in this session contributes `0`. Only the newest 50 documents are loaded at all, so older periods are always empty. The leaderboard and chart are equally wrong.
* **Fix:** Let Analytics query what it needs for the selected range.
```tsx
// App.tsx:3139
case 'analytics': return <AnalyticsView jobs={jobs} supabase={supabase} userId={session.user.id} onBack={navigateToDashboard} />;
```
```tsx
// AnalyticsView.tsx
const [docs, setDocs] = useState<FormDataType[]>([]);
useEffect(() => {
  const start = parseLocalDate(startDate); const end = parseLocalDate(endDate); end.setHours(23, 59, 59, 999);
  supabase.from('documents')
    .select('id, type, job_id, created_at, data')
    .eq('user_id', userId).in('type', ['Invoice', 'Estimate'])
    .gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
    .then(({ data, error }) => { if (error) console.error(error); setDocs((data || []).map((r: any) => ({ ...r, jobId: r.job_id, createdAt: r.created_at }))); });
}, [startDate, endDate, userId]);
// then compute metrics from `docs` instead of `forms`
```
For scale, move the aggregation into an RPC (`select date_trunc('day', …), sum(…)`) and share one `computeInvoiceTotal(data)` with `InvoiceForm.tsx:369-374` and the PDF generator.

#### VIEW-034 — Analytics date and time-zone errors, and wrong status semantics
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `AnalyticsView.tsx:14-19` (defaults via `toISOString()`, so in the evening in the Americas "today" is tomorrow), `:41-44` (`new Date('YYYY-MM-DD')` is UTC midnight while `end.setHours` is local, so west of UTC the range starts the previous evening), `:110-115` (the loop date is UTC midnight, the key uses UTC, the label uses local `getDate()`, so every bar is labelled one day early west of UTC), `:92-93` (monthly bucket from a UTC-parsed date, so the 1st of the month lands in the previous month), `:60` (Draft and Cancelled count as "Outstanding"), `:57` (Cancelled counts as revenue), `:294` ("N jobs" is really an invoice count), `:224` ("Avg. Job Value" is per invoice).
* **Fix:**
```ts
// utils/dates.ts
export const parseLocalDate = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const toLocalYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
```
```ts
// AnalyticsView.tsx
const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return toLocalYMD(d); });
const [endDate, setEndDate] = useState(() => toLocalYMD(new Date()));
const start = parseLocalDate(startDate); const end = parseLocalDate(endDate); end.setHours(23, 59, 59, 999);
if (start > end) return emptyMetrics;
// per invoice
if (data.status === 'Draft' || data.status === 'Cancelled') return;      // not revenue
if (data.status !== 'Paid') outstandingPayments += total;
const dateKey = (data.issueDate || toLocalYMD(new Date(form.createdAt))).slice(0, 10);
// daily loop
for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
  const key = toLocalYMD(cur); chartData.push({ label: String(cur.getDate()), value: dailyRevenue[key] || 0, height: '0%' });
}
// monthly bucket
const d = parseLocalDate(dateStr); const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
```
Relabel "N jobs" as "N invoices" and "Avg. Job Value" as "Avg. Invoice".

#### VIEW-035 — Calendar places jobs one day early west of UTC, multi-day jobs end a day short, and empty dates break
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `CalendarView.tsx:39-54, 58`
* **What's wrong:** `new Date('2026-03-10')` is 2026-03-10T00:00Z, which is March 9 in the Americas. react-big-calendar treats an all-day `end` as exclusive, so a 10–12 job renders as 10–11. A null `start_date` produces an Invalid Date event.
* **Fix:**
```ts
import { parseLocalDate } from '../utils/dates';
const events = useMemo(() => jobs.filter(j => j.startDate).map(job => {
  const start = parseLocalDate(job.startDate);
  const lastDay = job.endDate ? parseLocalDate(job.endDate) : start;
  const end = new Date(Math.max(lastDay.getTime(), start.getTime())); end.setDate(end.getDate() + 1); // exclusive end
  return { id: job.id, title: `${job.name} - ${job.clientName}`, start, end, allDay: true, resource: job };
}), [jobs]);
const upcoming = jobs.filter(j => j.startDate && parseLocalDate(j.startDate) > new Date()).length;
```
Also add an end-date field to JobForm (VIEW-038).

#### VIEW-036 — Calendar CSS uses raw HSL triplets as colours, so the grid loses its borders and header backgrounds, and dark mode is keyed to the OS rather than the app theme
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `CalendarView.tsx:222-262` vs `index.html:98, 92` (`--border: 214.3 31.8% 91.4%`)
* **What's wrong:** `border: 1px solid var(--border)` resolves to `1px solid 214.3 31.8% 91.4%`, which is invalid at computed-value time, so the property becomes `unset` and the default react-big-calendar borders are removed too. The same applies to `var(--muted)` and `var(--muted-foreground)`. The `@media (prefers-color-scheme: dark)` block ignores the app's `.dark` class.
* **Fix:** Wrap every variable: `hsl(var(--border))`, `hsl(var(--muted))`, `hsl(var(--muted-foreground))`, `hsl(var(--primary))`. Replace the media query with `.dark .rbc-off-range-bg { … } .dark .rbc-today { background: hsl(var(--primary) / 0.12); }`.

#### VIEW-037 — Creating a job inserts camelCase keys into `jobs` and silently fails
* **Severity:** High. **Status:** LIKELY (CONFIRMED against the repo schema; verify by creating a job and checking the network tab for a `PGRST204` response)
* **Location:** `App.tsx:2061-2073` (`{ id, user_id, ...jobData, status: 'active', worker_name }`, where jobData = `{name, clientName, clientAddress, startDate, workerName}` from `JobForm.tsx:69-75`); `App.tsx:3118` (Inventory quick job); `App.tsx:1219` (AI "update status" calls `handleSaveJob({...job, status})`, which tries to **insert** an existing id and also forces `status: 'active'`)
* **What's wrong:** `jobs` has `client_name`, `client_address` and `start_date` (App.tsx:204-214, and the fetch at 1576). PostgREST rejects unknown keys (`PGRST204 Could not find the 'clientAddress' column`). The fallback (2066) only fires for `42703` or a message containing `worker_name`, and it retries with the same camelCase keys. The error is only logged, `fetchData()` runs, the user lands on the dashboard and **no job exists**. `worker_name` is not created by any SQL.
* **Fix:**
```ts
const handleSaveJob = async (jobData: any, skipNavigation = false): Promise<string> => {
    if (!session) return '';
    /* conflict detection unchanged */
    const row: Record<string, any> = {
        id: crypto.randomUUID(), user_id: session.user.id, name: jobData.name,
        client_name: jobData.clientName ?? null, client_address: jobData.clientAddress ?? null,
        start_date: jobData.startDate || null, end_date: jobData.endDate || null,
        status: 'active', worker_name: jobData.workerName || null,
    };
    let { error } = await supabase.from('jobs').insert(row);
    if (error && /worker_name/.test(error.message)) { delete row.worker_name; ({ error } = await supabase.from('jobs').insert(row)); }
    if (error) { alert(`Could not create job: ${error.message}`); return ''; }
    setJobs(prev => [{ ...row, clientName: row.client_name, clientAddress: row.client_address, startDate: row.start_date, endDate: row.end_date, workerName: row.worker_name, userId: row.user_id, createdAt: new Date().toISOString() } as any, ...prev]);
    if (!skipNavigation) setView(view.screen === 'createJob' && view.returnTo === 'calendar' ? { screen: 'calendar' } : { screen: 'dashboard' });
    return row.id;
};
// App.tsx:1219 — status changes must not go through the insert path
if (job) handleUpdateJobStatus(jobId, targetStatus);
```
```sql
alter table public.jobs add column if not exists worker_name text;
```

#### VIEW-038 — JobForm: stuck "Saving…", only 50 clients, misleading limit text, no end date
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `JobForm.tsx:68` (loading is never reset when `handleSaveJob` returns `''` after a conflict alert, App.tsx:2055-2057), `:33-38` (`.range(0, 49)`), `:61` + `:108` ("6 active jobs" vs a monthly count), no `endDate` input.
* **Fix:**
```tsx
onSave: (jobData: …) => Promise<string>;
const handleSave = async () => { …; setLoading(true); const id = await onSave({ …, endDate }); if (!id) setLoading(false); };
```
Use the App `clients` prop (already loaded, paginated) or a search-as-you-type query. Change the text to "Jobs created this month: X / 6". Add `<Input type="date" value={endDate} min={startDate} …/>`.

#### VIEW-039 — Recurring invoices are never generated (dead service), and the service itself is buggy
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `services/recurringService.ts` (no importer; checked with grep); `:20-24` (it would scan lightweight `forms`, which carry no `recurrence`); `:28` (UTC parse); `:42` (`invoiceNumber.split` throws when undefined); `:69-79` (Jan 31 plus 1 month gives Mar 3); `:43` (random suffix numbers); `:107-118` (insert errors ignored); there is no locking, so two open tabs generate duplicates.
* **Fix:** Run it server-side once a day (`pg_cron` or a scheduled edge function) with an idempotency key:
```sql
create unique index if not exists documents_recurrence_uniq
  on public.documents ((data->>'recurrenceSourceId'), (data->>'recurrencePeriod'))
  where data ? 'recurrenceSourceId';
```
```ts
// edge function "run-recurring" (cron daily): for each Invoice with data->recurrence->enabled and nextRunDate <= today:
//   insert copy with data.recurrenceSourceId = src.id, data.recurrencePeriod = nextRunDate (unique index blocks duplicates)
//   advance nextRunDate with a clamped month add:
const addMonthsClamped = (d: Date, n: number) => { const r = new Date(d.getFullYear(), d.getMonth() + n, 1); r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); return r; };
```
If it stays client-side, call it after `fetchData` with full invoice rows (`select('id,job_id,type,created_at,data').eq('type','Invoice').not('data->recurrence', 'is', null)`), not `forms`.

#### VIEW-040 — Profit Calculator minor defects
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `ProfitCalculatorView.tsx:92` (tax is computed and exported even after switching back to Simple mode, where it is hidden), `:103` (`!targetMargin` rejects a valid 0 %), `:131-136` (Load doesn't restore the name, so Export of a loaded calculation is titled generically), `:45` (`targetMarginMode` is unused), `:55-63` (`localStorage` only, so calculations don't sync across devices)
* **Fix:** `const taxAmount = isAdvanced && vatEnabled ? … : 0;`; `if (targetMargin == null || targetMargin < 0 || targetMargin >= 100) return;`; in `handleLoad` add `setCalcName(calc.name)`; remove `targetMarginMode`. Optionally persist to a `profit_calculations` table (RLS own-row).

### Community

#### VIEW-041 — Vote counters are written by the client, and notifications can be forged
* **Severity:** Medium. **Status:** LIKELY (forum DDL and RLS are not in the repo)
* **Location:** `ForumView.tsx:321-359` (local recompute, then `forum_posts.update({upvotes, downvotes})`), `:361-386` (same for comments), `:314-319` (`notifications.insert({ user_id: recipientId, source_user_id: session.user.id, … })`)
* **What's wrong:** One of two things must be true. If RLS lets only the author update `forum_posts`, other users' votes never persist in the counters and the UI shows stale scores after reload. If RLS lets anyone update, any user can rewrite anyone's title or content or set arbitrary scores. Concurrent votes lose updates. Toggling up, down, up creates repeated "liked your post" notifications, and a client can insert notifications with any `source_user_id`.
* **Fix:** Database-maintained counters, author-only edits, and server-generated notifications.
```sql
create or replace function public.forum_recount_post() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.post_id, old.post_id);
begin
  update forum_posts p set
    upvotes   = (select count(*) from forum_votes v where v.post_id = pid and v.vote_type = 'up'),
    downvotes = (select count(*) from forum_votes v where v.post_id = pid and v.vote_type = 'down')
  where p.id = pid;
  if tg_op <> 'DELETE' and new.vote_type = 'up' then
    insert into notifications (user_id, source_user_id, type, post_id, is_read)
    select p.user_id, new.user_id, 'like', pid, false from forum_posts p
    where p.id = pid and p.user_id <> new.user_id
      and not exists (select 1 from notifications n where n.user_id = p.user_id and n.source_user_id = new.user_id and n.post_id = pid and n.type = 'like');
  end if;
  return null;
end $$;
create trigger trg_forum_votes_count after insert or update or delete on forum_votes for each row execute function forum_recount_post();
-- same pattern for forum_comment_votes -> forum_comments, and an AFTER INSERT on forum_comments for 'comment' notifications

alter table forum_posts enable row level security;
create policy "read posts" on forum_posts for select to authenticated using (not coalesce(is_hidden, false) or user_id = auth.uid());
create policy "insert own posts" on forum_posts for insert to authenticated with check (user_id = auth.uid());
create policy "edit own posts" on forum_posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own posts" on forum_posts for delete to authenticated using (user_id = auth.uid());
revoke update (upvotes, downvotes) on forum_posts from authenticated;
alter table forum_votes enable row level security;
create policy "own votes" on forum_votes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create unique index if not exists forum_votes_uniq on forum_votes(post_id, user_id);
alter table notifications enable row level security;
create policy "read own notifications" on notifications for select to authenticated using (user_id = auth.uid());
create policy "mark own read" on notifications for update to authenticated using (user_id = auth.uid());
-- no INSERT policy: only the triggers above create notifications
```
Note: a column-level `revoke update (upvotes, downvotes)` has no effect while a table-level UPDATE grant exists. Grant UPDATE only on `(title, content, youtube_url, category)` to `authenticated` instead.

```ts
// ForumView.tsx — drop the client counter writes and the createNotification calls
- await supabase.from('forum_posts').update({ upvotes: newUpvotes, downvotes: newDownvotes }).eq('id', postId);
- await supabase.from('forum_comments').update({ upvotes: newUpvotes, downvotes: newDownvotes }).eq('id', commentId);
- createNotification(…)
```
Also commit the forum DDL to the repo (it is currently "assumed existing").

#### VIEW-042 — No moderation, no comment management, no pagination; a failed delete shows the DB-setup screen
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:** `ForumView.tsx` (no report, hide or admin path; no comment edit or delete); `:259-290` (all posts in the category plus **all** of the user's votes); `:292-312` (all comments); `:453-455` (`count === 0` calls `onDbSetupNeeded()`, which replaces the app with the SQL setup page, App.tsx:3152 and 3051)
* **Fix:**
```sql
alter table forum_posts add column if not exists is_hidden boolean default false;
create table if not exists forum_reports (id uuid primary key default gen_random_uuid(), post_id uuid references forum_posts(id) on delete cascade,
  comment_id uuid references forum_comments(id) on delete cascade, reporter_id uuid not null default auth.uid(), reason text, created_at timestamptz default now());
alter table forum_reports enable row level security;
create policy "report" on forum_reports for insert to authenticated with check (reporter_id = auth.uid());
create table if not exists app_admins (user_id uuid primary key);
create policy "admins moderate" on forum_posts for update to authenticated using (exists (select 1 from app_admins a where a.user_id = auth.uid()));
create policy "delete own comments" on forum_comments for delete to authenticated using (user_id = auth.uid());
-- optional: auto-hide after 3 reports via trigger
```
```ts
// pagination
const PAGE = 20;
query = query.range(page * PAGE, page * PAGE + PAGE - 1);
const ids = postsData.map(p => p.id);
const { data: votesData } = await supabase.from('forum_votes').select('post_id, vote_type').eq('user_id', session.user.id).in('post_id', ids);
// delete
if (error) alert(…); else if (count === 0) alert('You can only delete your own posts.'); else …
```
Add "Report" and "Delete comment" buttons, and an "Infinite scroll / Load more" control.

#### VIEW-043 — Deep links and the unread badge are broken
* **Severity:** Medium. **Status:** CONFIRMED
* **Location:**
  * `App.tsx:1431-1442`: a logged-out user opening `/forum/<id>` is redirected to `/welcome`; after login they land on `/dashboard` and the post id is lost.
  * `App.tsx:1266-1268`: the AI `OPEN_FORUM` action navigates to `/forum` with `state.postId`, but the router reads the id only from the path (App.tsx:860, 869), so the post is never opened.
  * `App.tsx:1007, 2590`: `notificationCount` is never set, so the Community badge never appears.
* **Fix:**
```ts
// before redirecting a guest to welcome (App.tsx:1439-1442)
const path = window.location.pathname;
if (!['/', '/welcome'].includes(path) && !path.startsWith('/auth/')) sessionStorage.setItem('postLoginRedirect', path + window.location.search);
// after a session appears (1428-1430)
const back = sessionStorage.getItem('postLoginRedirect');
if (back) { sessionStorage.removeItem('postLoginRedirect'); navigate(back); } else setView({ screen: 'dashboard' });
// OPEN_FORUM
case 'OPEN_FORUM': { const pid = (payload.payload as any)?.postId; navigate(pid ? `/forum/${pid}` : '/forum'); break; }
// badge
useEffect(() => {
  if (!session) return;
  supabase.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id).eq('is_read', false)
    .then(({ count }) => setNotificationCount(count || 0));
}, [session?.user?.id, view.screen]);
```

#### VIEW-044 — Forum mobile and UX defects, and unvalidated `image_url`
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `ForumView.tsx:630` (`opacity-0 group-hover:opacity-100` makes the owner's edit and delete invisible on touch), `:757` (Enter submits even while `isCommenting`, causing double comments), `:447, :782` (edit cannot change or remove the image or the category), `:646, :704, :742` (`<img src={image_url}>` accepts any URL inserted through the API: tracking pixels or mixed content). **No HTML or script injection was found**: all user text renders as React text nodes, and YouTube is reduced to an id.
* **Fix:**
```tsx
<div className="flex gap-1 ml-2 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 …">
<Input … onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isCommenting) { e.preventDefault(); handleAddComment(); } }} />
```
```sql
alter table forum_posts add constraint forum_posts_image_host
  check (image_url is null or image_url like 'https://iauteblvljppwzsxloyd.supabase.co/storage/v1/object/public/forum/%');
alter table forum_comments add constraint forum_comments_image_host
  check (image_url is null or image_url like 'https://iauteblvljppwzsxloyd.supabase.co/storage/v1/object/public/forum/%');
```

### Cross-area

#### VIEW-045 — "Mark as viewed" overwrites full documents with their lightweight stub (data loss), which also restocks inventory
* **Severity:** Critical. **Status:** CONFIRMED
* **Location:** `App.tsx:1015-1042` (called from ClientsView via `onMarkDocumentsAsViewed`, App.tsx:3097)
* **What's wrong:** `forms` contains lightweight rows (VIEW-033). `updatedData = { ...doc.data, viewedByProvider: true }` is a stub (`title, status, clientName, clientSignatureUrl, isAiGenerated, __lightweight`), and `.update({ data: updatedData })` **replaces the whole JSONB**. That destroys line items, totals, signatures and template settings of every accepted or signed document of that client. Because the status stays "Accepted" but `lineItems` becomes null, the inventory trigger (VIEW-018/019) runs its "lines changed" branch: it **restocks** the old lines and deducts nothing.
* **Fix:** Patch only the flag on the server.
```sql
create or replace function public.mark_documents_viewed(p_ids uuid[]) returns void
language sql security invoker set search_path = public as $$
  update documents set data = jsonb_set(data, '{viewedByProvider}', 'true'::jsonb)
  where id = any(p_ids) and user_id = auth.uid();
$$;
```
```ts
const markDocumentsAsViewed = async (clientId: string) => {
  const client = clients.find(c => c.id === clientId); if (!client) return;
  const ids = forms.filter(f => { const d = f.data as any; return d.clientName === client.name && (d.status === 'Accepted' || d.clientSignatureUrl) && !d.viewedByProvider; }).map(f => f.id);
  if (!ids.length) return;
  const { error } = await supabase.rpc('mark_documents_viewed', { p_ids: ids });
  if (error) return console.error(error);
  setForms(prev => prev.map(f => ids.includes(f.id) ? { ...f, data: { ...(f.data as any), viewedByProvider: true } } : f));
};
```
Audit production for documents whose `data ? '__lightweight'` and restore them from backups.

#### VIEW-046 — The rich-text Toolbar shows static font and heading labels
* **Severity:** Low. **Status:** CONFIRMED
* **Location:** `Toolbar.tsx:200` ("Normal"), `:214` ("Arial", while the default font is Inter), `:49, :70-71` (tooltip state is set but never rendered)
* **Fix:** Add `currentBlock` and `currentFont` props derived from `document.queryCommandValue('formatBlock' | 'fontName')` in the editors' `checkActiveState`, render them, and delete the unused tooltip state.

---

### Issue summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 5 | VIEW-001, 002, 003, 016, 045 |
| High | 10 | VIEW-004, 006, 008, 017, 018, 019, 020, 027, 033, 037 |
| Medium | 18 | VIEW-005, 009, 010, 012, 014, 021, 022, 023, 025, 028, 029, 032, 034, 035, 039, 041, 042, 043 |
| Low | 13 | VIEW-007, 011, 013, 015, 024, 026, 030, 031, 036, 038, 040, 044, 046 |
| **Total** | **46** | |

---

## 4. Recommended refactors

1. **One migration history.** Replace the ad-hoc root `*.sql` files and the 600-line `SQL_SETUP_SCRIPT` string in `App.tsx` with `supabase/migrations/*.sql` managed by the Supabase CLI, including the forum, notification and storage DDL that is currently "assumed existing". Remove the in-app "run this SQL" screen for end users; schema drift should be an ops alarm, not a user prompt (it caused VIEW-019).
2. **Server-authoritative money, stock and entitlements.** All stock movement goes through `adjust_inventory` / `checkout_inventory` and the document trigger. All plan state is written only by the verified webhook. All limits are enforced by triggers or RLS. The browser never writes counters, tiers or totals (VIEW-001/002/008/020/041).
3. **Entity data hooks instead of the global `fetchData`.** Add `useInventory`, `usePriceBook`, `useJobs`, `useDocuments` (or TanStack Query) with per-entity pagination, targeted invalidation and optimistic updates. That removes the dropped refreshes, page resets and the 7-query reloads (VIEW-032).
4. **Separate list DTOs from full documents in types.** Give lightweight rows their own type (`DocumentSummary`), so code like Analytics (VIEW-033) or mark-as-viewed (VIEW-045) cannot treat a stub as a full `FormData`.
5. **Shared domain utilities.** `utils/dates.ts` (`parseLocalDate`, `toLocalYMD`, clamped month add) and a ban on `new Date('YYYY-MM-DD')` / `toISOString().split('T')` for business dates. `utils/money.ts` with one `computeInvoiceTotal` used by forms, analytics, PDF and the portal.
6. **Billing module.** A `subscriptions` table (or the profile columns from VIEW-001), a verified webhook, a "Manage subscription" panel, an `entitlements` helper (`can('unlimited_jobs')`) used by both UI and DB, and a single global `UpgradeModal` that receives a reason (VIEW-006/007).
7. **UI primitives.** Use `tailwind-merge` in `lib/utils.ts#cn` (today `size="sm"` and `className="h-12 p-0"` both apply and the CSS order decides the winner). Add a shared `Modal` (escape, backdrop, focus trap, mobile safe-area), a `ConfirmDialog` for destructive actions, a `Toast` instead of `alert()`, and fix `DropdownMenu` closing (VIEW-031). Avoid hover-only affordances on touch devices.
8. **Build hygiene.** Replace the Tailwind play-CDN, the Supabase CDN global and the dead importmap in `index.html` with npm imports bundled by Vite. Add `vite/client` types (fixes the `import.meta.env` tsc errors in `PROJECT_AUDIT/_tsc_errors_raw.txt`), enable `strict`, and exclude `supabase/functions/**` from the web `tsconfig` (Deno code).
9. **i18n.** Adopt `react-i18next` or a typed dictionary with an English fallback, and pass translations to every screen (VIEW-011).
10. **Delete dead code.** `services/recurringService.ts` (or move it server-side, VIEW-039), the `assembly_components` / `deduct_assembly_inventory` / `price_history` / `item_vendors` / `price_book_categories` schema unless features are built, `handleUpdateAppLogo` (App.tsx:1981), the `targetMarginMode` state, the stale `src/` tree, and the "AI Plan" card until it exists.
11. **Observability.** Log Supabase errors centrally (Sentry or similar) instead of `console.error` with silent continuation. Most "doesn't work" reports in this area come from swallowed errors (VIEW-004, 010, 020, 037).
