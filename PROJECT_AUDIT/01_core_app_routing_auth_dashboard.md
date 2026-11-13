# 01 — Core App: routing, auth, data loading, dashboard, job details (ROOT `App.tsx`)

Scope: `App.tsx` (3,224 lines, working-tree version with uncommitted changes), plus the props contract with the children it renders (`Login`, `Signup`, `UpdatePassword`, `JobForm`, `SelectDocType`, `JobCard`, `DocumentCard`, `DuplicateJobModal`, `ConfirmationModal`, `UpgradeModal`, `Dock`, `Settings`, `ClientsView`, `InventoryView`, `PriceBookView`, `CommunicationView`, `GmailCallback`, `DashboardMasterAIButton`, `JobDocumentAIModal`, `AIDocumentReviewModal`), `src/hooks/useMasterAIRouter.ts` (only where App depends on it), `utils/db.ts`, `sw.js`, `manifest.json`, `index.html`, `index.tsx`, `vercel.json`.

Status legend: **CONFIRMED** = visible in code. **LIKELY** = strongly suspected, but the outcome depends on runtime or on the live database.

Line numbers refer to the current working-tree files.

---

## 1. How it works

### 1.1 Boot sequence

1. `index.html` loads, synchronously in `<head>`: Tailwind CDN, tesseract.js, `@supabase/supabase-js@2` (unpinned major), jsPDF + autotable, html2canvas, PayPal SDK (subscription intent). It also contains an import map for esm.sh, which the Vite build does not use (Vite bundles React itself). `index.tsx` mounts `<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>`.
2. Module scope of `App.tsx` (`App.tsx:68-73`): builds the **CDN** Supabase client `window.supabase.createClient(url, anonKey)`. If the CDN script failed, `supabase` is `null`. `src/hooks/useMasterAIRouter.ts:15-17` builds a **second** client from the npm package with the same URL and key.
3. Also at module scope: column lists (`DOCUMENT_METADATA_COLUMNS` etc., `App.tsx:75-83`), the "lightweight document" mapper (`mapDocumentRow`, `App.tsx:100-109`), a 600-line `SQL_SETUP_SCRIPT` string (`App.tsx:111-736`), `DbSetupScreen` (`App.tsx:738-782`) and `uploadFile` (`App.tsx:786-800`).
4. `App` component (`App.tsx:803-3220`):
   - `view` is **derived from the URL** with `useMemo` over `location.pathname/search/state` (`App.tsx:835-900`). There is no `<Routes>`; App parses the path by hand.
   - `setView(newView)` (`App.tsx:902-931`) converts a view object back to a path and calls `navigate()`. Only the `form` case forwards `state` (`prefillData`). Every other `state` (clients `openCreateModal`, inventory `openAddModal`, etc.) is only set by direct `navigate()` calls in `handleMasterAIAction`.
   - Effects run in this order on mount: portal or approval detection (`1324-1336`), online/offline listeners (`1338-1350`), theme (`1357-1363`), auth bootstrap (`1365-1450`), first data load when `session.user.id` changes (`1718-1720`), per-job document load (`1873-1877`) and full-document load for a form URL (`1879-1883`).

### 1.2 URL → screen map (`getViewFromPath` inside `useMemo`, `App.tsx:835-900`)

| URL | `view.screen` | Notes |
|---|---|---|
| any path with `?portal=KEY` | `welcome` (but `renderContent` shows `PortalView` because the `portalKey` state is set) | `App.tsx:840-842`, `3046` |
| any path with `?approval_token=T` | `welcome` → `DocumentApprovalView` | `3049` |
| `/` , `''`, unknown paths | `dashboard` | `844`, `899` |
| `/welcome` | `welcome` | Logged-in users fall into `default → renderDashboard()` |
| `/auth/login`, `/auth/signup`, `/auth/checkEmail` | `auth` | Any other segment is cast `as any` and renders nothing |
| `/update-password` | `updatePassword` | Only rendered when a session exists (`3063`) |
| `/privacy`, `/terms`, `/security` | static pages | Shown with or without a session |
| `/dashboard`, `/settings`, `/profile`, `/analytics`, `/calendar`, `/pricebook`, `/calculator`, `/forum`, `/gmail-callback` | the matching screen | |
| `/clients` | `clients` (+ `location.state.openCreateModal/prefillData`) | |
| `/communication` | `communication` (+ `state.prefillData`) | |
| `/inventory` | `inventory` (+ `state.openAddModal/prefillData`) | |
| `/forum/:postId` | `forum` with `postId` | |
| `/jobs/create?returnTo=calendar` | `createJob` | |
| `/jobs/:jobId` | `jobDetails` | |
| `/jobs/:jobId/select-doc` | `selectDocType` | |
| `/jobs/:jobId/forms/:FormType[/:formId]` | `form` (+ `state.prefillData`) | FormType is URL-encoded (`"Daily Job Report"` → `Daily%20Job%20Report`) |
| `/qa-ai-documents` (DEV only) | `qaAiDocuments` | |

Back, forward and refresh work by construction, because the screen is a pure function of the URL. Component-local state (open modals, filters) does not survive them. Prefill data lives in `history.state`, so it **does** survive Back and refresh (see CORE-010).

Hosting: `vercel.json` rewrites `/(.*)` to `/index.html`. Vercel checks the filesystem first, so deep links do not 404 on Vercel.

### 1.3 Render gate (`renderContent`, `App.tsx:3044-3160`)

In order:
1. `portalKey` set → `PortalView` (public client portal).
2. `approvalToken` set → `DocumentApprovalView` (public single-document approval).
3. `dbSetupError` set → full-screen "Database Update Required" SQL screen.
4. `loading` true → bare text (`loadingMessage`).
5. DEV QA harness.
6. No session → `welcome` / `privacy` / `terms` / `security`, otherwise `renderAuth()` (login / signup / checkEmail). Anything else renders `null`, which is a blank page.
7. Session → `switch (view.screen)` for every app screen, with `default → renderDashboard()`.

Always mounted around the content (`3162-3219`): `Dock` (only on dashboard, jobDetails and clients), `AIDocumentReviewModal` (when `pendingAIDrafts`), the global `UpgradeModal`, two `ConfirmationModal`s (delete job, delete document) and `DuplicateJobModal`.

### 1.4 Auth and session (`App.tsx:1365-1450`, handlers `1886-1960`)

- **Bootstrap**: `supabase.auth.getSession()` reads the stored session, and with `detectSessionInUrl` the client also consumes OAuth and recovery hash tokens. With a session:
  - if the URL hash had `type=recovery` or the path is `/update-password`, App stays on or goes to `/update-password`;
  - otherwise, if the path is `/`, `/welcome` or `/auth/*`, App navigates to `/dashboard`.
  - Without a session, `loading=false`.
- **`onAuthStateChange`** (subscribed once; the closure comes from the first render):
  - Recovery events, or anything that happens while on `/update-password`, are ignored apart from `setSession`.
  - With a session: if `session.provider_token` exists (right after Google OAuth), App stores it in `localStorage.google_provider_token`. It also *tries* to write it to `profiles.gmail_access_token`, but that query is never executed (CORE-018), and upserts it into `user_credentials`. On a guest page it redirects to the dashboard.
  - With no session: App clears profile, jobs, forms, clients, inventory and saved items, then navigates to `/welcome`, except on public pages.
- **Login** (`handleLogin`): `signInWithPassword`; the listener then routes to the dashboard.
- **Signup** (`handleSignup`): `signUp`, then `/auth/checkEmail`.
- **Forgot password** (`handleResetPassword`): `resetPasswordForEmail(email, {redirectTo: origin + '/update-password'})`.
- **Update password** (`handleUpdatePassword`): `updateUser({password})`, then the dashboard.
- **Google sign-in** (`handleLoginWithGoogle`): `signInWithOAuth({provider:'google', redirectTo: origin})`, which requests no Gmail scopes.
- **Connect Gmail** (`handleConnectGmail`): a hand-built Google OAuth URL (`gmail.send`, offline, consent) → `/gmail-callback` → `GmailCallback` calls the `gmail-auth` edge function, which stores the tokens in `user_gmail_accounts`.
- **Disconnect Gmail**: nulls the profile tokens and deletes `user_credentials` rows.
- **Logout** (`handleLogout`): `signOut()` (online only), then removes `app_view_state` and `google_provider_token` and goes to `/welcome`.

### 1.5 Data loading and caching

`fetchData(force=true)` (`App.tsx:1452-1716`) runs once per user (`fetchedUserIdRef`) and again, with force, after almost every mutation. A re-entrancy flag (`fetchingDataRef`) makes concurrent calls return early, so they are dropped rather than queued. It runs these steps in sequence:

1. **Profile**: `profiles.select(... gmail_access_token, gmail_refresh_token)`. It resets `email_usage` when the month changes and falls back to `user_credentials` for Gmail tokens. It applies the theme and caches the profile, tokens included, in IndexedDB. If the row is missing, it inserts a default profile. Offline, it reads the IndexedDB `profile` store.
2. **Jobs**: all jobs, unpaginated. It retries without `worker_name` if that column is missing. Rows are mapped to camelCase, and `workerName` is **not** mapped. They are written to IndexedDB **one row at a time**.
3. **Documents**: the newest 50 documents across all jobs, metadata only (`DOCUMENT_METADATA_COLUMNS` pulls `title`, the number fields, `status`, `clientName`, `clientSignatureUrl`, `viewedByProvider` and `isAiGenerated` out of the JSON). Each is mapped to a "lightweight" `FormData` whose `data` is a stub flagged `__lightweight`. `setForms` **replaces** the whole array.
4. **Clients, inventory, inventory history, saved items**: first 50 of each, with `hasMore*` flags. Clients and inventory are also cached in IndexedDB.
5. An `ai_chat_history` probe (`select id limit 1`) that can trigger the DB setup screen.

On-demand loaders:
- `loadDocumentsForJob(jobId, reset)` (`1782-1821`): 20 metadata rows per page for one job, merged into `forms`. It runs when `/jobs/:id` opens and drives the "Load more documents" button.
- `loadDocumentData(formId)` (`1823-1848`): one full row (`data` included) when a form URL with an id opens. `renderForm` shows "Loading document..." while the cached copy is lightweight.
- `loadDocumentsForClient(clientName)` (`1850-1871`): up to 20 full documents for a client (ClientsView details and approval modal).
- `loadMoreClients`, `loadMoreInventory`, `loadMoreInventoryHistory`, `loadMoreSavedItems`: offset pagination.

IndexedDB (`utils/db.ts`): `contractor_db` v3 with stores `jobs, documents, clients, profile, offline_queue, inventory, saved_items`. Every `dbApi` call opens a **new** connection and never closes it. Only `fetchData` reads and writes these stores, and nothing reads `offline_queue`. `syncOfflineData` (`1352-1355`) only calls `fetchData()`.

Service worker and PWA: `sw.js` sits in the repo root. Nothing registers it and Vite does not copy it into `dist`, so it is dead. `manifest.json` is emitted as a hashed asset and points to icons on an external domain.

### 1.6 Screens and what every control does

**Welcome / Login / Signup / CheckEmail / UpdatePassword**: see the inventory table.

**Dashboard** (`renderDashboard`, `2514-2670`):
- Header: logo; "Welcome {first name}!" (desktop only); "OFFLINE MODE" pill (desktop only).
- **Upgrade** (free users) opens the global `UpgradeModal`.
- **Tools ▾** (with a low-stock badge) opens a dropdown with Inventory, Price Book, Calendar, Calculator and Insights (Analytics).
- **Community** goes to `/forum`. Its badge reads `notificationCount`, which is never set.
- **+ New Job** runs `checkLimit('jobs')`, then `/jobs/create`.
- **AI** (`DashboardMasterAIButton`) is a chat panel. Its results go to `handleMasterAIAction`.
- **Avatar** goes to `/profile`.
- Search box (name, client, address, status); Status filter (All / active / paused / completed / inactive); Client filter (distinct `job.clientName`). There is no sort control: jobs come back sorted by `created_at desc`.
- Job grid uses `JobCard`: **View Project** → `/jobs/:id`; **⋮ Duplicate** → `DuplicateJobModal`; **⋮ Delete** → `ConfirmationModal` → `handleDeleteJob`.
- Dock: Home, Clients (badge = unseen signed documents), Communication, Settings.

**Job details** (`renderJobDetails`, `2672-2978`):
- **Back** → dashboard.
- Free users see a "n/12 Docs" badge and an **Upgrade** button.
- **AI** opens `JobDocumentAIModal` scoped to the job.
- **+ New Document** runs `checkLimit('docs', jobId)`, then `/jobs/:id/select-doc`.
- **Calculator icon** opens the "Job Financials" modal.
- Job **status select** → `handleUpdateJobStatus`. **Search docs**. **Type filter**: a `<select>` on desktop; on mobile a transparent `<select>` sits over a decorative filter button.
- Document grid uses `DocumentCard`: click → `/jobs/:id/forms/:type/:formId`; **⋮ Duplicate** → `handleDuplicateDoc`; **⋮ Delete** → confirmation → `handleDeleteDoc`.
- **Load more documents**; empty state with **Create First Document**.
- Dock: Home, New Document, Communication, Settings.

**Create job** (`JobForm`): picks an existing client (its own Supabase query, first 50) or free text; job name, client name and address, start date, worker. **Create Job** → `handleSaveJob`.

**Select document type** (`SelectDocType`): 12 tiles → `/jobs/:id/forms/:type`.

**Form** (`renderForm`, `2980-3020`): renders one of 12 form components with `onSave=handleSaveForm`, `onClose/onBack=handleCloseForm` (→ job details) and `prefillData` from `history.state`. `handleSaveForm` upserts the `documents` row, deducts inventory for Material Logs, reloads the job's documents, then opens the next queued AI draft or returns to job details.

**AI document flow**:
1. The dashboard AI or job AI returns a `MasterRouterPayload` with `action_type: GENERATE_DOCUMENT`.
2. `queueAIDraftsFromPayload` (`1097-1146`) resolves the target job, runs `checkLimit('docs')`, normalizes the draft and calls `setPendingAIDrafts`.
3. `AIDocumentReviewModal` offers **Save all** (`openAIDraft(first,'auto_save',rest)`) or **Review**.
4. `openAIDraft` (`1069-1095`) navigates to the form URL with `state.prefillData = {...draft, ai_open_mode, auto_submit, start_page}`.
5. The form applies the prefill. With `auto_submit`, it calls `onSave` after 1 s.
6. `handleSaveForm` pops the next draft from `aiDocProcessQueue`.

Other AI actions are routed in `handleMasterAIAction` (`1149-1278`).

**Settings / Profile** (`Settings`): edit the profile, upload logo and avatar, theme, language, email templates, logout and upgrade. Saving calls `handleSaveProfile`.

**Other views** (Clients, Inventory, Price Book, Calculator, Analytics, Calendar, Communication, Forum, Gmail callback) get their data and callbacks from App. Their internals are covered in other audit files. Their contract issues with App are listed below.

### 1.7 Subscription and limits

- `FREE_LIMITS = { jobs: 6, clients: 15, docs: 12 }` (`1284`), counted **per calendar month** from in-memory arrays. Documents are counted per job. `checkLimit` (`1294-1322`) opens the global `UpgradeModal` when the limit is reached.
- `UpgradeModal` renders a PayPal Subscriptions button (plan `P-65E58669J9805670ENFP23EA`, `custom_id = userId`). `onApprove` calls `handleUpgradeSuccess` (`1286-1292`), which **writes `subscription_tier='Premium'` from the browser**. `supabase/functions/paypal-webhook` sets or clears the tier server-side from `custom_id`, without verifying the PayPal signature.

---

## 2. Feature & button inventory

| # | Control | Location | Intended behavior | Actual status | Issue |
|---|---|---|---|---|---|
| 1 | Welcome "Get started" | `App.tsx:3055`, `components/Welcome.tsx` | Go to signup | Works | — |
| 2 | Welcome "Login" | `App.tsx:3055` | Go to login | Works | — |
| 3 | Welcome footer Privacy/Terms/Security | `App.tsx:3055-3058` | Static pages; Back → welcome | Works | — |
| 4 | Login form submit | `components/Login.tsx:24-39`, `App.tsx:1886-1890` | Email/password login → dashboard | Works | CORE-008 (same user re-login after logout without reload → blank) |
| 5 | Login "Forgot Password?" → Send reset link | `Login.tsx:78-95`, `App.tsx:1897-1902` | Email a recovery link to `/update-password` | Partial | CORE-017 (expired link → blank page) |
| 6 | Login / Signup "Sign in with Google" | `Login.tsx:41-55`, `App.tsx:1910-1912` | Google OAuth → dashboard | Partial | CORE-018, CORE-019 |
| 7 | Login "Sign up" link / Signup "Log in" link | `App.tsx:2508-2509` | Switch screen | Works | — |
| 8 | Signup submit | `components/Signup.tsx:26-51`, `App.tsx:1891-1895` | Create account → "Check your email" | Partial | CORE-017 (checkEmail is a dead end, no button) |
| 9 | UpdatePassword submit | `components/UpdatePassword.tsx:19-46`, `App.tsx:1904-1908` | Set a new password → dashboard | Partial | CORE-017 |
| 10 | Dashboard "Upgrade" | `App.tsx:2546-2556` | Open PayPal upgrade modal | Partial | CORE-004, CORE-012 |
| 11 | Dashboard "Tools ▾" + low-stock badge | `App.tsx:2557-2585` | Dropdown | Works (badge only counts the first 50 inventory items) | CORE-029 |
| 12 | Tools → Inventory / Price Book / Calendar / Calculator / Insights | `App.tsx:2574-2581` | Navigate | Works (Insights shows $0 revenue) | CORE-011 |
| 13 | Dashboard "Community" + badge | `App.tsx:2587-2591` | Forum; badge = notifications | Partial: badge never shows | CORE-031 |
| 14 | Dashboard "+ New Job" | `App.tsx:2593-2596` | Limit check → create job | Works (route) | CORE-024 |
| 15 | Dashboard AI button | `App.tsx:2599-2619` | AI assistant; executes actions | Partial | CORE-006, CORE-013, CORE-014, CORE-015 |
| 16 | Dashboard avatar | `App.tsx:2621-2623` | Profile screen | Works | — |
| 17 | Search jobs | `App.tsx:2631` | Filter by name/client/address/status | Works | — |
| 18 | Status filter | `App.tsx:2634-2644` | Filter by status | Works | — |
| 19 | Client filter | `App.tsx:2645-2652` | Filter by client | Works (only clients that appear on jobs) | — |
| 20 | JobCard "View Project" | `components/JobCard.tsx:59`, `App.tsx:2661` | Job details | Works | CORE-007 (documents can vanish) |
| 21 | JobCard ⋮ Duplicate | `JobCard.tsx:39-42`, `App.tsx:2663` | Duplicate job + chosen documents | Partial | CORE-026, CORE-024 |
| 22 | JobCard ⋮ Delete → Confirm | `JobCard.tsx:43-46`, `App.tsx:2662`, `2165-2172` | Delete job (cascade documents) | Works if online; errors ignored | CORE-020 |
| 23 | Dock: Home / Clients / Communication / Settings / New Document | `App.tsx:3022-3042` | Navigate | Works | — |
| 24 | Job details Back | `App.tsx:2691` | Dashboard | Works (always goes to the dashboard, even if you came from the calendar or clients) | — |
| 25 | Job details "n/12 Docs" badge | `App.tsx:2708-2710` | Monthly document usage for this job | Broken: counts the *filtered* list | CORE-024 |
| 26 | Job details "Upgrade" | `App.tsx:2711-2719` | Upgrade modal | Partial | CORE-004 |
| 27 | Job details "AI" | `App.tsx:2723-2739` | Job-scoped AI modal | Partial | CORE-032, CORE-010 |
| 28 | Job details "+ New Document" | `App.tsx:2740-2743` | Limit check → select type | Works | CORE-024 |
| 29 | Job details Financials (calculator icon) | `App.tsx:2744-2746`, `2791-2868` | Revenue / material / labor / profit | Broken: always $0 | CORE-011 |
| 30 | Job status select | `App.tsx:2876-2885`, `2085-2088` | Update job status | Partial: optimistic, error ignored | CORE-020 |
| 31 | Search docs | `App.tsx:2891-2896` | Filter documents | Partial: persists across jobs | CORE-025 |
| 32 | Doc type filter (desktop select) | `App.tsx:2910-2917` | Filter by type | Partial | CORE-025 |
| 33 | Doc type filter (mobile icon button) | `App.tsx:2901-2908`, `2922-2929` | Open type filter | Works only because an invisible `<select>` covers the button; the button's own `onClick` is empty | CORE-031 |
| 34 | DocumentCard click | `components/DocumentCard.tsx:56`, `App.tsx:2960` | Open the document | Partial | CORE-007, CORE-016 |
| 35 | DocumentCard ⋮ Duplicate | `DocumentCard.tsx:79-82`, `App.tsx:2174-2213` | Copy as Draft | Works | — |
| 36 | DocumentCard ⋮ Delete → Confirm | `App.tsx:2961`, `2275-2281` | Delete document | Partial: the list may not refresh, errors ignored | CORE-020, CORE-007 |
| 37 | Load more documents | `App.tsx:2966-2972` | Next 20 documents | Partial: the offset breaks after any `fetchData` | CORE-007 |
| 38 | Create First Document (empty state) | `App.tsx:2948` | Select type | Works; the empty state is also shown when a filter just hides documents | CORE-025 |
| 39 | Job Financials "Close" / ✕ | `App.tsx:2824`, `2863` | Close the modal | Works | — |
| 40 | JobForm client picker / Create Job / Cancel | `components/JobForm.tsx:122-157` | Create a job | **Broken (likely)**: camelCase columns are inserted, errors are swallowed | CORE-005, CORE-030 |
| 41 | JobForm inner Upgrade modal (limit) | `JobForm.tsx:162-166` | PayPal upgrade | Broken: payment not linked to the user | CORE-012 |
| 42 | SelectDocType tiles / Back | `App.tsx:3073`, `components/SelectDocType.tsx` | Open the form | Works (no limit check on a deep link) | CORE-024 |
| 43 | Form Save | `App.tsx:2089-2147` | Upsert document → job details | Partial | CORE-009, CORE-010, CORE-015, CORE-034 |
| 44 | Form Back/Close | `App.tsx:2998` | Job details | Works (leaves the AI queue behind) | CORE-015 |
| 45 | AI review modal "Save all" / "Review" / ✕ | `App.tsx:3168-3180` | Create the AI documents | Partial | CORE-010, CORE-013, CORE-015 |
| 46 | Global UpgradeModal PayPal button | `components/UpgradeModal.tsx:14-35`, `App.tsx:3182-3188` | Subscribe → Premium | Works for payment; the tier is trusted from the client | CORE-004 |
| 47 | UpgradeModal "Get Started with AI" | `UpgradeModal.tsx:129-131` | AI plan | Dead button (no handler) | CORE-031 |
| 48 | DuplicateJobModal Duplicate / Select all / ✕ | `components/DuplicateJobModal.tsx`, `App.tsx:3210-3217` | Duplicate | Partial | CORE-026 |
| 49 | Settings Save / Logout / Theme / Upgrade | `App.tsx:3075-3076`, `1992-2026`, `1954-1960` | Save profile, sign out | Partial | CORE-021, CORE-008, CORE-028 |
| 50 | Settings / Communication "Connect Gmail" | `App.tsx:1913-1931` | Gmail OAuth | Works (no CSRF `state`) | CORE-037 |
| 51 | Communication "Disconnect Gmail" | `App.tsx:1932-1953` | Clear Gmail tokens | Partial: only legacy tables | CORE-018 |
| 52 | Clients badge "new signed documents" | `components/ClientsView.tsx:496-505` → `App.tsx:1015-1042` | Mark as viewed | **Destroys document content** | CORE-001 |
| 53 | Clients quick "new document for client" | `App.tsx:2284-2316` | Create a job if needed, open the form | Partial: no limits, no error handling | CORE-024, CORE-020 |
| 54 | Calendar "New Job" / job click | `App.tsx:3140` | Create job / open job | Works (JobForm Cancel returns to the dashboard, not the calendar) | — |
| 55 | DB setup screen "Refresh Page" | `App.tsx:775` | Reload | Works; the screen should not be shown to end users | CORE-022 |
| 56 | Offline banner | `App.tsx:2542`, `2750` | Inform + "documents will sync later" | Misleading | CORE-016 |

---

## 3. Issues

### CORE-001: "Mark signed documents as viewed" overwrites the whole document with a stub (data loss)
- **Severity:** Critical | **Status:** CONFIRMED
- **Location:** `App.tsx:1015-1042`; called from `components/ClientsView.tsx:502`
- **What's wrong:** `markDocumentsAsViewed` writes `data: { ...doc.data, viewedByProvider: true }` for every matching document. `forms` holds **lightweight** rows by default: `fetchData` (`App.tsx:1623`) and `loadDocumentsForJob` (`1801`) set `data` to the stub from `createLightweightDocumentData`, which contains only title, status, clientName, clientSignatureUrl, viewedByProvider, isAiGenerated and `__lightweight`. Writing that object back replaces the JSONB column, so line items, totals, notes, photos and signatures are deleted. Separately, the DB trigger `trg_documents_invoice_inventory` (`App.tsx:689-692`) sees `lineItems` change from the real list to `NULL` on committed Invoices, Estimates and Change Orders. It returns stock for the old lines and deducts nothing, so inventory is inflated.
- **Reproduce / impact:**
  1. A client signs an estimate through the portal or approval link.
  2. The contractor opens Clients and clicks the green badge on the client avatar.
  3. Every signed or accepted document for that client is now an empty shell: it opens blank and the PDF is empty. Accepted-estimate inventory is restocked.
  This is permanent: there is no history table.
- **Root cause:** a read-modify-write of the whole JSON column, using a copy that was never the full document.
- **Fix:** do a server-side JSON merge, scoped to the user. Add the RPC to `SQL_SETUP_SCRIPT` and to `supabase_setup.sql`:
```sql
CREATE OR REPLACE FUNCTION public.mark_documents_viewed(p_ids uuid[])
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.documents
     SET data = data || jsonb_build_object('viewedByProvider', true)
   WHERE id = ANY(p_ids) AND user_id = auth.uid();
$$;
```
```diff
@@ App.tsx:1015
-    const markDocumentsAsViewed = async (clientId: string) => {
-        ...
-        for (const doc of docsToUpdate) {
-            const updatedData = { ...doc.data, viewedByProvider: true };
-            await supabase
-                .from('documents')
-                .update({ data: updatedData })
-                .eq('id', doc.id);
-        }
-        // Update local state is faster than fetch
-        setForms(prev => prev.map(f => {
-            const d = f.data as any;
-            if (d.clientName === client.name && (d.status === 'Accepted' || d.clientSignatureUrl)) {
-                return { ...f, data: { ...d, viewedByProvider: true } };
-            }
-            return f;
-        }));
+    const markDocumentsAsViewed = async (clientId: string) => {
+        const client = clients.find(c => c.id === clientId);
+        if (!client) return;
+        const ids = forms
+            .filter(f => { const d = f.data as any; return d.clientName === client.name && (d.status === 'Accepted' || d.clientSignatureUrl) && !d.viewedByProvider; })
+            .map(f => f.id);
+        if (ids.length === 0) return;
+        const { error } = await supabase.rpc('mark_documents_viewed', { p_ids: ids });
+        if (error) { console.error('mark viewed failed', error); return; }
+        const idSet = new Set(ids);
+        setForms(prev => prev.map(f => idSet.has(f.id) ? { ...f, data: { ...(f.data as any), viewedByProvider: true } } : f));
     };
```
  Also add a guard so no code path ever persists a stub:
```ts
const assertFullDocument = (f: FormDataType) => {
  if (isLightweightDocument(f)) throw new Error('Refusing to write a lightweight document stub');
};
```

### CORE-002: Every logged-in user can read every profile, including Gmail OAuth tokens
- **Severity:** Critical | **Status:** CONFIRMED in the shipped SQL / LIKELY on the live DB
- **Location:** `App.tsx:131-153` (token columns on `profiles`), `App.tsx:171-172` (`CREATE POLICY "Users can view all profiles" ... FOR SELECT TO authenticated USING (true)`), `App.tsx:1468-1471` (the client selects the tokens), `App.tsx:1534` (tokens cached in IndexedDB)
- **What's wrong:** the setup script that App asks users to run makes `profiles` readable by any authenticated user. `profiles` stores `gmail_access_token` and `gmail_refresh_token`, plus email, phone, address and `subscription_tier`. A refresh token with `gmail.send` scope lets an attacker send mail as that contractor indefinitely.
- **Reproduce:** sign up with any account, then in the console run `window.supabase.createClient(URL, ANON).from('profiles').select('email,gmail_refresh_token')` (a signed-in client works the same way). This returns every user's tokens.
- **Root cause:** a permissive SELECT policy (probably added for the forum's author names), with secrets stored on the same row.
- **Fix:**
```sql
-- 1) Lock profiles down
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- 2) Public-safe projection for forum/author display
CREATE OR REPLACE VIEW public.public_profiles WITH (security_invoker = false) AS
  SELECT id, name, company_name, profile_picture_url FROM public.profiles;
GRANT SELECT ON public.public_profiles TO authenticated;

-- 3) Secrets never readable from the browser
REVOKE SELECT (gmail_access_token, gmail_refresh_token) ON public.profiles FROM anon, authenticated;
-- (then migrate tokens to user_gmail_accounts only and drop these columns)
```
```diff
@@ App.tsx:1470
-                .select('id, email, name, company_name, logo_url, profile_picture_url, address, phone, website, job_title, subscription_tier, language, email_templates, theme, email_usage, email_usage_month, gmail_access_token, gmail_refresh_token')
+                .select('id, email, name, company_name, logo_url, profile_picture_url, address, phone, website, job_title, subscription_tier, language, email_templates, theme, email_usage, email_usage_month')
```
  Remove the `user_credentials` fallback (`1516-1529`) and stop writing tokens into IndexedDB. Point the forum (`ForumView`) at `public_profiles`.

### CORE-003: The in-app "DB setup" SQL ships leaky and conflicting portal and approval functions
- **Severity:** Critical | **Status:** CONFIRMED
- **Location:** `App.tsx:281-320` (`get_portal_data`), `App.tsx:322-344` (`sign_document_via_portal`), `App.tsx:397-421` (`get_document_by_token`), `App.tsx:423-446` (`approve_document_by_token`)
- **What's wrong:**
  1. `get_portal_data` and `get_document_by_token` are `SECURITY DEFINER` and return `row_to_json(p)` of the contractor's **entire profile row** (`App.tsx:304`, `414`) to *unauthenticated* holders of a portal or approval link. That includes Gmail access and refresh tokens. Approval links are emailed to clients.
  2. `sign_document_via_portal` updates `documents WHERE id = p_doc_id` without checking that the document belongs to the portal key's contractor or client (`App.tsx:337-342`). Any valid portal key can mark any document id as Accepted and inject a signature.
  3. Both "approve" functions overwrite `signatureUrl`, which is the **contractor's** signature, with the client's (`App.tsx:339`, `441`).
  4. `supabase_setup.sql` has safer versions: whitelisted contractor fields, a separate `clientSignatureUrl`, and a `jsonb` return type. Because the return types differ (`json` vs `jsonb`), running App's script on a DB that was set up with `supabase_setup.sql` fails with "cannot change return type of existing function". If it runs first instead, it reintroduces the leak.
  5. No `SET search_path` on any `SECURITY DEFINER` function.
- **Impact:** credential leak to the public, document tampering, and contractor signatures replaced on approved documents.
- **Fix:** replace the four functions inside `SQL_SETUP_SCRIPT` with the hardened versions and keep one source of truth (`supabase_setup.sql`):
```sql
DROP FUNCTION IF EXISTS public.get_document_by_token(uuid);
CREATE FUNCTION public.get_document_by_token(doc_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc record; v_contractor jsonb;
BEGIN
  SELECT id, user_id, type, data, created_at INTO v_doc FROM documents WHERE public_token = doc_token LIMIT 1;
  IF v_doc.id IS NULL THEN RETURN jsonb_build_object('error','Invalid or expired approval link'); END IF;
  SELECT jsonb_build_object('company_name',company_name,'logo_url',logo_url,'phone',phone,'email',email,'website',website)
    INTO v_contractor FROM profiles WHERE id = v_doc.user_id;
  RETURN jsonb_build_object('document', jsonb_build_object('id',v_doc.id,'type',v_doc.type,'data',v_doc.data,'created_at',v_doc.created_at),
                            'contractor', v_contractor);
END $$;

CREATE OR REPLACE FUNCTION public.sign_document_via_portal(p_key text, p_doc_id uuid, p_signature text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client clients%ROWTYPE;
BEGIN
  SELECT * INTO v_client FROM clients WHERE portal_key = p_key LIMIT 1;
  IF v_client.id IS NULL THEN RAISE EXCEPTION 'Invalid portal key'; END IF;
  UPDATE documents
     SET data = data || jsonb_build_object('clientSignatureUrl', p_signature, 'status', 'Accepted', 'clientSignedAt', now()::text)
   WHERE id = p_doc_id
     AND user_id = v_client.user_id
     AND data->>'clientName' = v_client.name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found for this portal'; END IF;
END $$;
-- get_portal_data: replace row_to_json(p) with the same whitelisted jsonb_build_object(...) as above.
```
  Then delete `SQL_SETUP_SCRIPT` from the bundle entirely (see CORE-022). It also ships the schema to every visitor.

### CORE-004: Premium status and all free-plan limits are enforced only in the browser
- **Severity:** Critical (revenue) | **Status:** CONFIRMED
- **Location:** `App.tsx:175-176` (profile UPDATE policy has no column restriction), `App.tsx:1286-1292` (`handleUpgradeSuccess` writes `subscription_tier: 'Premium'` from the client), `App.tsx:1294-1322` (`checkLimit` counts in-memory arrays), `components/JobForm.tsx:58-66`, `components/CommunicationView.tsx:106-108` (email limit), `supabase/functions/paypal-webhook/index.ts:11-12` (no signature verification)
- **What's wrong:**
  - Any user can run `supabase.from('profiles').update({ subscription_tier: 'Premium' }).eq('id', myId)` from devtools.
  - Jobs, documents and clients can be inserted straight through PostgREST with no limit.
  - `email_usage` is client-maintained and resettable.
  - The webhook accepts any POST, so anyone who knows a user id can upgrade it.
- **Fix:** enforce on the server.
```sql
-- Block tier changes except by service_role (webhook)
CREATE OR REPLACE FUNCTION public.protect_subscription_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
          OR NEW.email_usage < OLD.email_usage) THEN
    RAISE EXCEPTION 'subscription fields are read-only';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_subscription ON public.profiles;
CREATE TRIGGER trg_protect_subscription BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_fields();

-- Monthly job limit (same pattern for clients = 15 and documents-per-job = 12)
CREATE OR REPLACE FUNCTION public.enforce_job_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tier text; v_count int;
BEGIN
  SELECT subscription_tier INTO v_tier FROM profiles WHERE id = NEW.user_id;
  IF coalesce(v_tier,'Basic') <> 'Premium' THEN
    SELECT count(*) INTO v_count FROM jobs
     WHERE user_id = NEW.user_id AND created_at >= date_trunc('month', now());
    IF v_count >= 6 THEN RAISE EXCEPTION 'FREE_LIMIT_JOBS'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_enforce_job_limit BEFORE INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_job_limit();
```
```diff
@@ App.tsx:1286
-    const handleUpgradeSuccess = async () => {
-        if (!session) return;
-        await supabase.from('profiles').update({ subscription_tier: 'Premium' }).eq('id', session.user.id);
-        setProfile(prev => prev ? ({ ...prev, subscriptionTier: 'Premium' }) : null);
-        setShowGlobalUpgrade(false);
-        alert("Upgrade Successful! You are now a Premium user.");
-    };
+    const handleUpgradeSuccess = async () => {
+        if (!session) return;
+        setShowGlobalUpgrade(false);
+        // Webhook is the source of truth: poll briefly for the tier flip.
+        for (let i = 0; i < 10; i++) {
+            const { data } = await supabase.from('profiles').select('subscription_tier').eq('id', session.user.id).single();
+            if (data?.subscription_tier === 'Premium') {
+                setProfile(prev => prev ? { ...prev, subscriptionTier: 'Premium' } : prev);
+                alert('Upgrade successful! You are now a Premium user.');
+                return;
+            }
+            await new Promise(r => setTimeout(r, 2000));
+        }
+        alert('Payment received. Your Premium plan will activate within a few minutes.');
+    };
```
  In `paypal-webhook`, verify each event with PayPal's `POST /v1/notifications/verify-webhook-signature` (headers `PAYPAL-TRANSMISSION-ID`, `-TIME`, `-SIG`, `-CERT-URL`, `PAYPAL-AUTH-ALGO`, plus your `webhook_id`) before touching `profiles`. Keep `checkLimit` on the client for UX, and map the `FREE_LIMIT_*` exception to the upgrade modal.

### CORE-005: Creating a job sends camelCase keys that the `jobs` table doesn't have; failures are silent
- **Severity:** High | **Status:** CONFIRMED (code) / LIKELY (runtime failure, depends on the live schema)
- **Location:** `App.tsx:2061-2084`; payload from `components/JobForm.tsx:69-75`
- **What's wrong:** `newJob = { id, user_id, ...jobData, status, worker_name }`, where `jobData` is `{ name, clientName, clientAddress, startDate, workerName }`. The schema App creates and reads (`App.tsx:204-214`, `1576`) has `client_name`, `client_address` and `start_date`. PostgREST answers with `PGRST204 Could not find the 'clientAddress' column of 'jobs'`. The fallback branch only runs for `42703` or a message containing `worker_name`, so the insert fails. Even if the DB happened to have both column styles, `client_name` and `start_date` would stay NULL, so client names disappear and the calendar breaks. In every case the code then calls `fetchData()`, navigates away and returns `newJob.id` as if it worked. `InventoryView`'s `onAddJob` (`App.tsx:3118`) receives the id of a job that doesn't exist.
- **Reproduce:** Dashboard → New Job → fill in the form → Create Job. You return to the dashboard with no new card and no error, only a console error.
- **Fix:**
```diff
@@ App.tsx:2061
-        const newJob = { id: crypto.randomUUID(), user_id: session.user.id, ...jobData, status: 'active', worker_name: jobData.workerName };
-        const { error } = await supabase.from('jobs').insert(newJob);
-
-        if (error) {
-            console.error('Failed to create job', error);
-            if (error.code === '42703' || error.message?.includes('worker_name')) {
-                // Fallback if missing column in schema
-                const fallbackJob = { ...newJob };
-                delete (fallbackJob as any).worker_name;
-                delete (fallbackJob as any).workerName;
-                await supabase.from('jobs').insert(fallbackJob);
-            }
-        }
-
-        fetchData(); // Refresh
+        const row: Record<string, unknown> = {
+            id: crypto.randomUUID(),
+            user_id: session.user.id,
+            name: jobData.name,
+            client_name: jobData.clientName || null,
+            client_address: jobData.clientAddress || null,
+            start_date: jobData.startDate || null,
+            end_date: jobData.endDate || null,
+            status: 'active',
+            worker_name: jobData.workerName || null,
+        };
+        let { error } = await supabase.from('jobs').insert(row);
+        if (error && /worker_name/i.test(error.message || '')) {
+            const { worker_name, ...withoutWorker } = row;
+            ({ error } = await supabase.from('jobs').insert(withoutWorker));
+        }
+        if (error) {
+            alert(error.message?.includes('FREE_LIMIT') ? 'Free plan job limit reached.' : `Could not create job: ${error.message}`);
+            throw error; // lets JobForm reset its "Saving..." state
+        }
+        const created: Job = {
+            id: row.id as string, userId: session.user.id, name: jobData.name,
+            clientName: jobData.clientName, clientAddress: jobData.clientAddress,
+            startDate: jobData.startDate, endDate: jobData.endDate ?? null,
+            status: 'active', workerName: jobData.workerName, createdAt: new Date().toISOString(),
+        };
+        setJobs(prev => [created, ...prev]);
```
  In `JobForm.handleSave`: `try { await onSave(...) } catch { setLoading(false) }`, and change the prop type to `=> Promise<unknown>`.

### CORE-006: AI "update job status" creates a job instead of updating one, and never succeeds
- **Severity:** High | **Status:** CONFIRMED
- **Location:** `App.tsx:1213-1222`
- **What's wrong:** `handleSaveJob({ ...job, status: targetStatus }, true)` calls the **insert** path. The spread carries the existing `id`, so the insert hits a duplicate primary key (or CORE-005's column errors). `handleSaveJob` then forces `status: 'active'` anyway. If the job has a `workerName`, the conflict check would flag the job against itself. The error is swallowed, so the AI says "done" and nothing changes. Also, when `p.jobId` is missing, the code silently picks the first active job.
- **Fix:**
```diff
@@ App.tsx:1213
             case 'UPDATE_JOB_STATUS': {
                 const p = payload.payload as any;
-                const jobId = p?.jobId || jobs.find(j => j.status === 'active')?.id;
+                const jobId = p?.jobId || jobForAI?.id;
                 const targetStatus = p?.targetStatus;
-                if (jobId && targetStatus) {
-                    const job = jobs.find(j => j.id === jobId);
-                    if (job) handleSaveJob({ ...job, status: targetStatus }, true);
-                }
+                if (!jobId || !['active','paused','completed','inactive'].includes(targetStatus)) {
+                    alert('Which job should I update? Open the job first or name it.');
+                    break;
+                }
+                handleUpdateJobStatus(jobId, targetStatus);
                 break;
             }
```
  Together with CORE-020's fix, `handleUpdateJobStatus` checks the error and rolls back.

### CORE-007: `fetchData` replaces `forms` wholesale, racing with per-job and per-document loads (refresh shows "Loading document..." forever and documents vanish)
- **Severity:** High | **Status:** CONFIRMED (logic) / LIKELY (frequency)
- **Location:** `App.tsx:1622-1627` (`setForms(mappedForms)`), `1802-1810`, `1843-1846`, `1873-1883`; every `fetchData()` call after a mutation (`2075`, `2152`, `2158`, `2162`, `2169`, `2270`, `2278`, `2445`, `2467`, `2472`, `2487`, `2499`)
- **What's wrong:**
  1. Refreshing `/jobs/:id/forms/Invoice/:formId` starts `fetchData` and `loadDocumentData` at the same time. `fetchData` awaits profile, jobs and dozens of IndexedDB writes **before** it queries documents, so `loadDocumentData` usually finishes first and stores the full document. `fetchData` then calls `setForms(mappedForms)` and replaces it with the lightweight stub. `renderForm` (`2986`) shows "Loading document..." again, and the effect (`1879-1883`) never re-runs because its deps (`user.id`, `formId`) haven't changed. The page is stuck until the user navigates away. This matches the "refresh" bug reports.
  2. The same thing happens on `/jobs/:id`: `loadDocumentsForJob` merges the job's documents, then `fetchData` replaces them with the global newest 50. Jobs whose documents aren't in the newest 50 show "No documents yet". `documentPagination[job]` still says `offset: 20`, so "Load more" skips the first page.
  3. Every mutation calls `fetchData()` (force). That wipes any per-job or per-client documents and full documents, and re-downloads 7+ tables. If a fetch is already running, `fetchingDataRef` makes the new call a no-op, so the mutation's refresh is dropped (for example, a deleted document stays on screen).
- **Fix:** merge instead of replacing, never downgrade a full document, and re-trigger the loader when the cached copy is a stub.
```diff
@@ App.tsx:1622
-            if (formsData) {
-                const mappedForms = formsData.map((f: any) => mapDocumentRow(f));
-                setForms(mappedForms);
+            if (formsData) {
+                const mappedForms = formsData.map((f: any) => mapDocumentRow(f));
+                setForms(prev => {
+                    const byId = new Map(prev.map(f => [f.id, f]));
+                    for (const doc of mappedForms) {
+                        const existing = byId.get(doc.id);
+                        byId.set(doc.id, existing && !isLightweightDocument(existing) ? existing : doc);
+                    }
+                    return Array.from(byId.values())
+                        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
+                });
```
```diff
@@ App.tsx:1879
-    useEffect(() => {
-        if (view.screen === 'form' && view.formId && session?.user?.id) {
-            loadDocumentData(view.formId);
-        }
-    }, [session?.user?.id, view.screen === 'form' ? view.formId : '']);
+    const openFormId = view.screen === 'form' ? view.formId : null;
+    const openFormIsStub = !!openFormId && isLightweightDocument(forms.find(f => f.id === openFormId) ?? ({ data: { __lightweight: true } } as any));
+    useEffect(() => {
+        if (openFormId && openFormIsStub && session?.user?.id && loadingDocumentId !== openFormId) {
+            loadDocumentData(openFormId);
+        }
+    }, [session?.user?.id, openFormId, openFormIsStub]);
```
  Replace post-mutation `fetchData()` calls with local state updates, for example:
```ts
const handleDeleteDoc = async () => {
  if (!docToDelete || !session) return;
  const { error } = await supabase.from('documents').delete().eq('id', docToDelete).eq('user_id', session.user.id);
  if (error) { alert(`Delete failed: ${error.message}`); return; }
  setForms(prev => prev.filter(f => f.id !== docToDelete));
  setDocToDelete(null);
  setShowDeleteDocModal(false);
};
```
  Use the same pattern for clients and inventory: `setClients(prev => [...])` with the row returned by `.insert(...).select().single()`.

### CORE-008: Logging out and back in as the same user (without a reload) shows a blank dashboard
- **Severity:** High | **Status:** CONFIRMED
- **Location:** `App.tsx:1431-1445` (sign-out clears state), `1455` (`fetchedUserIdRef` short-circuit), `1718-1720`, `2515` (`if (!profile) return null`)
- **What's wrong:** on `SIGNED_OUT`, App clears `profile`, `jobs` and the rest, but never resets `fetchedUserIdRef`. When the same user signs in again, `fetchData(false)` sees `fetchedUserIdRef.current === session.user.id` and returns. `profile` stays `null`, so `renderDashboard()` returns `null`: a white screen until a manual reload. The AI hook state (`aiMessages`, history) also survives logout.
- **Fix:**
```diff
@@ App.tsx:1431
                 } else {
+                    fetchedUserIdRef.current = null;
                     setProfile(null);
                     setJobs([]);
                     setForms([]);
                     setClients([]);
                     setInventory([]);
+                    setInventoryHistory([]);
                     setSavedItems([]);
+                    setDocumentPagination({});
+                    aiCreateNewChat();
```
  `aiCreateNewChat` is defined later, so call it through a ref, or move the hook calls above the effect (they already are). Also make `renderDashboard` show a loader instead of `null` when `session && !profile`.

### CORE-009: Material Log inventory deduction repeats on every re-save, and is not atomic
- **Severity:** High | **Status:** CONFIRMED
- **Location:** `App.tsx:2093-2122`, `2491-2500`; `components/MaterialLogForm.tsx:88, 257-258`
- **What's wrong:**
  1. `dataToSave` is built from `formData` **before** the code sets `formData.deductInventory = false` (`2121`). The saved document therefore keeps `deductInventory: true`. Reopening it shows the box ticked, and every later save deducts the same quantities again.
  2. Stock is deducted **before** the document upsert. If the upsert fails, stock is gone and the document isn't saved.
  3. `handleAllocateInventory` does a client-side read-modify-write against the in-memory `inventory`, which holds the first 50 items only. Items that aren't loaded are skipped silently. Shortfalls are hidden by `Math.max(0, …)`. Two tabs race.
  4. It calls `fetchData()` once per line item.
- **Fix:** use the atomic RPC that already exists (`adjust_inventory`, `App.tsx:482-539`) and persist a "deducted" marker.
```diff
@@ App.tsx:2093
-        const dataToSave = {
-            ...formData,
+        const shouldDeduct = view.formType === FormType.MaterialLog && (formData as any).deductInventory && !(formData as any).inventoryDeductedAt;
+        const dataToSave = {
+            ...formData,
+            deductInventory: false,
+            ...(shouldDeduct ? { inventoryDeductedAt: new Date().toISOString() } : {}),
@@
-        // Inventory Deduction Logic (Phase 3)
-        if (view.formType === FormType.MaterialLog && (formData as any).deductInventory) {
-            ...
-        }
-
         const { error: saveError } = await supabase.from('documents').upsert(formRecord);
         if (saveError) { ... return; }
+        if (shouldDeduct) {
+            for (const item of (formData as MaterialLogData).items || []) {
+                if (!item.inventoryItemId || !(Number(item.quantity) > 0)) continue;
+                const { error } = await supabase.rpc('adjust_inventory', {
+                    p_item_id: item.inventoryItemId,
+                    p_delta: -Math.ceil(Number(item.quantity)),
+                    p_job_id: view.jobId,
+                    p_context: `material_log:${formRecord.id}`,
+                });
+                if (error) alert(`Stock not deducted for ${item.name}: ${error.message}`);
+            }
+            await loadInventoryFirstPage(); // small targeted refresh instead of fetchData()
+        }
```
  Rewrite `handleAllocateInventory` to call `adjust_inventory` as well.

### CORE-010: AI auto-save drafts replay on Back or refresh, creating duplicate documents
- **Severity:** High | **Status:** CONFIRMED
- **Location:** `App.tsx:1083-1094` (`prefillData` with `auto_submit: true` pushed into `history.state`), `App.tsx:923-927`, `App.tsx:2146` (`setView` → push), `App.tsx:3000-3003`; for example `components/InvoiceForm.tsx:141-144`
- **What's wrong:** React Router stores `state` in `window.history.state`, which survives refresh and Back. After an auto-saved draft, `handleSaveForm` **pushes** `/jobs/:id`. Pressing the browser Back button goes to `/jobs/:id/forms/Invoice` with the same `prefillData.auto_submit = true`. The form remounts, auto-saves again with a fresh `crypto.randomUUID()`, and navigates forward. Each Back press adds another duplicate. Refreshing during the 1 s window does the same. Large base64 images in `prefillData` also go into `history.state` (browsers cap its size, roughly 2–16 MB, and `pushState` throws above it).
- **Fix:**
  1. Give each draft a one-shot id and record consumed ids.
  2. Replace history after saving.
```diff
@@ App.tsx:1083 (openAIDraft)
+        const draftRunId = crypto.randomUUID();
         setView({
             screen: 'form',
             ...
             prefillData: {
                 ...draft,
+                __draftRunId: draftRunId,
                 ai_open_mode: mode,
                 auto_submit: mode === 'auto_save',
```
```diff
@@ App.tsx:3002 (renderForm)
-        const pf = prefillData;
+        const consumed = (() => { try { return new Set(JSON.parse(sessionStorage.getItem('consumed_ai_drafts') || '[]')); } catch { return new Set(); } })();
+        const pf = prefillData && consumed.has((prefillData as any).__draftRunId)
+            ? { ...prefillData, auto_submit: false }
+            : prefillData;
```
```diff
@@ App.tsx:2124 (handleSaveForm, after a successful upsert)
+        const runId = (view.prefillData as any)?.__draftRunId;
+        if (runId) {
+            try {
+                const ids = JSON.parse(sessionStorage.getItem('consumed_ai_drafts') || '[]');
+                sessionStorage.setItem('consumed_ai_drafts', JSON.stringify([...ids, runId].slice(-50)));
+            } catch {}
+        }
@@ App.tsx:2146
-        setView({ screen: 'jobDetails', jobId: view.jobId });
+        navigate(`/jobs/${view.jobId}`, { replace: true });
```
  Keep large image payloads in an in-memory `Map<draftRunId, draft>` (a ref) and put only the id into `history.state`.

### CORE-011: "Job Financials" always shows $0, and Analytics gets stub documents
- **Severity:** High | **Status:** CONFIRMED
- **Location:** `App.tsx:2791-2868`; `App.tsx:3139` (`AnalyticsView forms={forms}`); `components/AnalyticsView.tsx:47-55`
- **What's wrong:**
  - `jobForms` are lightweight stubs, so `data.total`, `data.materials`, `data.hoursWorked` and `lineItems` are all undefined.
  - Even with full data: invoices never store a `total` (`InvoiceData` has none; `InvoiceForm` computes it at render); Material Logs store `items`, not `materials`; `profile.defaultLaborRate` is never loaded in `fetchData`; and `'approved'` is not an invoice status.
  - Analytics calculates totals from `data.lineItems`, which stubs don't have, and only over the newest 50 documents. Revenue, outstanding and client revenue all show 0.
  - The free-plan badge in Insights is unaffected, but every money metric is wrong.
- **Fix:** fetch the minimal JSON paths needed, then compute the numbers the same way the forms do.
```ts
const FINANCIAL_COLUMNS = 'id, type, created_at, status:data->>status, lineItems:data->lineItems, discount:data->>discount, shipping:data->>shipping, taxRate:data->>taxRate, items:data->items, hoursWorked:data->>hoursWorked, overtimeHours:data->>overtimeHours';
const invoiceTotal = (r: any) => {
  const sub = (r.lineItems || []).reduce((s: number, li: any) => s + Number(li.quantity || 0) * Number(li.rate || 0), 0);
  const disc = Number(r.discount || 0), ship = Number(r.shipping || 0), tax = Number(r.taxRate || 0);
  return (sub - disc) * (1 + tax / 100) + ship;
};
const openFinancials = async (jobId: string) => {
  const { data, error } = await supabase.from('documents').select(FINANCIAL_COLUMNS)
    .eq('user_id', session!.user.id).eq('job_id', jobId)
    .in('type', [FormType.Invoice, FormType.MaterialLog, FormType.TimeSheet]);
  if (error) { alert(error.message); return; }
  const revenue = data.filter(r => r.type === FormType.Invoice && ['paid','sent'].includes(String(r.status).toLowerCase()))
                      .reduce((s, r) => s + invoiceTotal(r), 0);
  const material = data.filter(r => r.type === FormType.MaterialLog)
                       .reduce((s, r) => s + (r.items || []).reduce((a: number, i: any) => a + Number(i.quantity || 0) * Number(i.unitCost || 0), 0), 0);
  const rate = profile?.defaultLaborRate ?? 45;
  const labor = data.filter(r => r.type === FormType.TimeSheet)
                    .reduce((s, r) => s + Number(r.hoursWorked || 0) * rate + Number(r.overtimeHours || 0) * rate * 1.5, 0);
  setJobFinancials({ revenue, material, labor });
  setShowJobFinancials(true);
};
```
  Give `AnalyticsView` its own date-ranged query with the same column list (`.gte('created_at', start).lte('created_at', end)`) instead of the global `forms`. Add `default_labor_rate numeric` to `profiles` and map it in `fetchData`.

### CORE-012: The Upgrade modals inside JobForm and SelectDocType (and Communication) take payment without linking it to the user
- **Severity:** High | **Status:** CONFIRMED
- **Location:** `components/JobForm.tsx:162-166`, `components/SelectDocType.tsx:151-155`, `components/CommunicationView.tsx:765`; `components/UpgradeModal.tsx:22-30`
- **What's wrong:** these instances pass no `userId`, so `custom_id` is `undefined`. The webhook (`paypal-webhook/index.ts:29`) can't find the user, and these modals also have no `onUpgrade` (or no `userId`) callback. A user who hits the 6-job limit inside JobForm can pay $5/month and stay on the Basic plan. All instances also render into the same DOM id (`paypal-button-container-P-…`), so if two are open, the button lands in the wrong one.
- **Fix:** have only one upgrade modal (App's) and expose it to children.
```diff
@@ components/JobForm.tsx
-interface JobFormProps { ...; profile?: UserProfile | null; }
+interface JobFormProps { ...; profile?: UserProfile | null; onUpgradeClick: () => void; }
@@
-    if (jobCount >= limit) {
-      setShowUpgrade(true);
-      return;
-    }
+    if (jobCount >= limit) { onUpgradeClick(); return; }
@@
-      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} featureName="Unlimited Jobs" />
```
```diff
@@ App.tsx:3066
-            case 'createJob': return <JobForm onSave={handleSaveJob} ... profile={profile} />;
+            case 'createJob': return <JobForm onSave={handleSaveJob} ... profile={profile}
+                onUpgradeClick={() => { setUpgradeFeature('Unlimited Jobs'); setShowGlobalUpgrade(true); }} />;
```
  Do the same for `SelectDocType` and `CommunicationView`. In `UpgradeModal`, refuse to render the PayPal button when `!userId`, and use a per-instance container id (`useId()`).

### CORE-013: Dashboard AI attaches generated documents to the wrong job
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1108-1118`, `2723-2729`, `2766`
- **What's wrong:**
  - `activeJobId = jobForAI?.id || matched || fallback`. `jobForAI` is set when the job AI modal opens and **never cleared** (the `onClose` at `2766` only hides the modal). Any later dashboard request ("invoice for Bob") goes to the last job whose AI modal was opened.
  - The text used for type and job detection is `jobAiMessages.slice(-1)[0].content`, the **job** hook's last message (often the assistant's reply), even when the request came from the dashboard hook.
  - With no client mentioned, the code silently picks `jobs.find(active) || jobs[0]`.
- **Fix:**
```diff
-    const queueAIDraftsFromPayload = (payload: MasterRouterPayload) => {
+    const queueAIDraftsFromPayload = (payload: MasterRouterPayload, source: 'dashboard' | 'job') => {
@@
-        const inputForDetect = (rawWithStoredSignature.rawInput as string) || (jobAiMessages?.slice(-1)[0]?.content) || '';
+        const msgs = source === 'job' ? jobAiMessages : aiMessages;
+        const lastUser = [...(msgs || [])].reverse().find(m => m.role === 'user')?.content;
+        const inputForDetect = (rawWithStoredSignature.rawInput as string) || lastUser || '';
@@
-        const activeJobId = jobForAI?.id || matchedRequestJob?.id || fallbackJob?.id;
+        const scopedJobId = source === 'job' ? jobForAI?.id : undefined;
+        const activeJobId = scopedJobId || matchedRequestJob?.id;
+        if (!activeJobId) { alert('Which job is this document for? Mention the client or open the job first.'); return; }
```
  Call it with `'job'` from `JobDocumentAIModal.onOpenDraft` and with `'dashboard'` from `DashboardMasterAIButton.onAction`: pass the source through `handleMasterAIAction(payload, source)`. Also run `setJobForAI(null)` in the job modal's `onClose`.

### CORE-014: Several AI actions drop their payload, and AUTO_SEND_BATCH sends email with no confirmation
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1156-1162`, `1177-1181`, `1199-1207`, `1237-1240`, `1266-1268`; view parsing `App.tsx:858-860`, `875-878`
- **What's wrong:**
  - `CREATE_JOB` passes `state.prefillData`, but the `createJob` view ignores `location.state` and `JobForm` has no prefill prop, so you get an empty form.
  - `ADD_PRICE_BOOK_ITEM` passes `openAddModal`/`prefillData`, but `/pricebook` doesn't read state and `PriceBookView` has no such props.
  - `UPDATE_INVENTORY`/`RESTOCK_INVENTORY` pass `openAdjustModal`; the inventory view only reads `openAddModal`.
  - `OPEN_FORUM` passes `state.postId`; the forum only reads the path.
  - `AUTO_SEND_BATCH` mails clients straight from model output, with no review. That is a prompt-injection risk: client and document text is in the model context. It also bypasses the 10-emails/month free limit and never calls `handleEmailSent`.
- **Fix:**
```diff
@@ App.tsx:875 (view parsing)
-                return { screen: 'createJob', returnTo: rt };
+                return { screen: 'createJob', returnTo: rt, prefillData: location.state?.prefillData };
@@ App.tsx:858
-        if (path === '/pricebook') return { screen: 'pricebook' };
+        if (path === '/pricebook') return { screen: 'pricebook', openAddModal: location.state?.openAddModal, prefillData: location.state?.prefillData };
@@ App.tsx:1266
-                navigate('/forum', { state: { postId: (payload.payload as any)?.postId } });
+                setView({ screen: 'forum', postId: (payload.payload as any)?.postId });
@@ App.tsx:1237
-                navigate('/inventory', { state: { openAdjustModal: true, prefillData: payload.payload } });
+                navigate('/inventory', { state: { openAddModal: false, openAdjustModal: true, prefillData: payload.payload } });
+                // and add `openAdjustModal` to the inventory view parse + InventoryView props
@@ App.tsx:1199
-            case 'AUTO_SEND_BATCH':
-                if (payload.payload && (payload.payload as any).email_batch) {
-                    aiSendEmailBatch((payload.payload as any).email_batch).then(...);
-                }
-                break;
+            case 'AUTO_SEND_BATCH':   // never send without an explicit click
+            case 'PREPARE_EMAIL_BATCH':
+                break;                 // DashboardMasterAIButton renders the BatchReviewCard with a Send button
```
  Pass `prefillData` to `JobForm` (initialize its `useState`s from it) and to `PriceBookView` (open its add dialog). Count batch sends: after `sendEmailBatch` resolves, call `handleEmailSent(result.sent)`, changing it to accept a count.

### CORE-015: Cancelling an AI review leaves a stale queue that hijacks the next unrelated save
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:2139-2143`, `2998`, `3171`
- **What's wrong:**
  1. Generate 3 documents and choose Review.
  2. Close the first form without saving (`handleCloseForm`).
  3. `aiDocProcessQueue` still holds documents 2 and 3. The next time the user saves *any* form, even days later in the same session, `handleSaveForm` opens AI draft 2 instead of going back to the job.
  Closing the review modal (✕) doesn't clear the queue either.
- **Fix:**
```diff
@@ App.tsx:2998
-        const handleCloseForm = () => setView({ screen: 'jobDetails', jobId: jobId });
+        const handleCloseForm = () => {
+            setAiDocProcessQueue([]);
+            setAiDocProcessMode(null);
+            setView({ screen: 'jobDetails', jobId });
+        };
@@ App.tsx:2139
-        if (aiDocProcessQueue.length > 0 && aiDocProcessMode) {
+        const isAiRun = Boolean((view.prefillData as any)?.ai_open_mode);
+        if (isAiRun && aiDocProcessQueue.length > 0 && aiDocProcessMode) {
```

### CORE-016: Offline mode is a facade (saves fail, nothing syncs, documents can't open, no service worker)
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1352-1355` (`syncOfflineData` stub), `2750` ("Documents created will sync later"), `2124-2131`, `1823-1824` (`loadDocumentData` returns `null` offline), `2986-2996`, `2542` (offline pill `hidden md:block`); `utils/db.ts` (`offline_queue` never read); `sw.js` (never registered, not in `public/`)
- **What's wrong:**
  - Offline, `handleSaveForm` → `upsert` fails with "Failed to fetch" → "Save failed" alert, and nothing is queued.
  - Cached documents are stubs, and `loadDocumentData` returns `null` offline, so every document shows "Loading document..." forever.
  - The app shell is not cached, so a cold start offline doesn't load at all.
  - Mobile users never see the dashboard OFFLINE pill.
  - `services/recurringService.ts` writes into `offline_queue`, but nothing processes it.
- **Fix (minimum honest version):**
```diff
@@ App.tsx:2750
-{!isOnline && <div className="...">You are OFFLINE. Documents created will sync later.</div>}
+{!isOnline && <div className="...">You are offline. Viewing cached data; saving is disabled until you reconnect.</div>}
@@ App.tsx:2542
-{!isOnline && <div className="hidden md:block bg-orange-100 ...">OFFLINE MODE</div>}
+{!isOnline && <div className="bg-orange-100 ... text-xs md:text-sm">OFFLINE</div>}
@@ App.tsx:2986 (renderForm)
-        if (formId && (!form || isLightweightDocument(form))) {
+        if (formId && (!form || isLightweightDocument(form))) {
+            if (!isOnline) return <OfflineDocUnavailable onBack={() => setView({ screen: 'jobDetails', jobId })} />;
```
  Real offline support:
  1. Write failed upserts to `offline_queue` (`{id, table, op, row}`).
  2. In `syncOfflineData`, replay them in order and delete on success.
  3. Cache full document data in IndexedDB when a document is opened.
  4. Move `sw.js` to `public/sw.js` and register it in `index.tsx` (`if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`). Change its strategy to network-first for `index.html`, otherwise stale HTML will reference deleted hashed bundles after each deploy.

### CORE-017: Auth routing dead ends (blank pages, lost deep links)
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:3054-3061`, `2505-2512`, `1396-1400`, `864-867`
- **What's wrong:**
  - **Expired or invalid recovery link:** Supabase redirects to `/update-password#error=access_denied&error_code=otp_expired`. With no session, `renderContent` falls into `renderAuth()`, which returns `null` because the view is `updatePassword`, not `auth`. The listener's early return (`1396-1400`) keeps the user there: a blank white page.
  - `/auth/anything-else` also renders blank.
  - `/auth/checkEmail` has no way back to login.
  - A logged-out user opening `/jobs/123` (for example from an email) is redirected to `/welcome`, and after login lands on the dashboard: the deep link is lost.
  - Logged-in users on `/auth/checkEmail` (signup with email confirmation off) see the dashboard while the URL still says `/auth/checkEmail`.
- **Fix:**
```diff
@@ App.tsx:3054
         if (!session) {
+            if (view.screen === 'updatePassword') {
+                const hash = new URLSearchParams(window.location.hash.slice(1));
+                return <AuthMessage title="Link expired or invalid"
+                    body={hash.get('error_description') || 'Request a new password reset link.'}
+                    action={() => setView({ screen: 'auth', authScreen: 'login' })} actionLabel="Back to login" />;
+            }
             if (view.screen === 'welcome') return <Welcome .../>;
@@ App.tsx:2510
-            case 'checkEmail': return <div ...><p>We've sent a confirmation link.</p></CardContent></Card></div>;
+            case 'checkEmail': return <AuthMessage title="Check your email" body="We've sent a confirmation link."
+                action={() => setView({ screen: 'auth', authScreen: 'login' })} actionLabel="Back to login" />;
+            default: return <Navigate to="/auth/login" replace />;
@@ App.tsx:1439 (signed-out redirect)
-                    if (!['/privacy', '/terms', '/security', '/qa-ai-documents'].includes(path)) {
-                        setView({ screen: 'welcome' });
-                    }
+                    if (!['/privacy', '/terms', '/security', '/qa-ai-documents', '/update-password', '/welcome'].includes(path) && !path.startsWith('/auth/')) {
+                        sessionStorage.setItem('post_login_redirect', window.location.pathname + window.location.search);
+                        setView({ screen: 'welcome' });
+                    }
@@ App.tsx:1428 (signed-in redirect)
-                    if (window.location.pathname === '/' || ... ) {
-                        setView({ screen: 'dashboard' });
-                    }
+                    if (window.location.pathname === '/' || window.location.pathname === '/welcome' || window.location.pathname.startsWith('/auth/')) {
+                        const back = sessionStorage.getItem('post_login_redirect');
+                        sessionStorage.removeItem('post_login_redirect');
+                        navigate(back || '/dashboard', { replace: true });
+                    }
```

### CORE-018: Google sign-in token is stored as the Gmail credential; profile write never runs; refresh is a no-op
- **Severity:** Medium | **Status:** CONFIRMED (code) / LIKELY (send failures)
- **Location:** `App.tsx:1376-1378`, `1402-1425`, `1910-1912`; consumers `services/batchEmailSender.ts:51`, `services/gmailService.ts:24,68`
- **What's wrong:**
  1. `signInWithOAuth({provider:'google'})` requests only `openid email profile`. The resulting `provider_token` **cannot** call `gmail.send`, yet App stores it in `localStorage.google_provider_token` and upserts it into `user_credentials`. `batchEmailSender` falls back to that token when the `gmail-auth` refresh fails, and sends then fail with 403 "insufficient authentication scopes". The token also sits in `localStorage`, where any XSS can read it.
  2. `supabase.from('profiles').update(tokenData).eq(...)` (`1413`) is never awaited or `.then`-ed. Supabase query builders are lazy thenables, so **this request is never sent**.
  3. `fetchData()` inside the listener (`1423`) is the first-render closure, where `session` is still `null`, so it returns immediately and the "refresh profile to reflect linked status" never happens.
  4. `handleDisconnectGmail` only clears the legacy `profiles` and `user_credentials` storage, not `localStorage.google_provider_token`.
- **Fix:** stop treating the login token as a Gmail credential. Gmail linking happens only through `handleConnectGmail` → `gmail-auth` → `user_gmail_accounts`.
```diff
@@ App.tsx:1376
-                    if (session.provider_token) {
-                        localStorage.setItem('google_provider_token', session.provider_token);
-                    }
@@ App.tsx:1403-1425
-                    if (session.provider_token) {
-                        localStorage.setItem('google_provider_token', session.provider_token);
-                        ... profiles.update(...) ... user_credentials.upsert(...) ... fetchData() ...
-                    }
@@ App.tsx:1932 (handleDisconnectGmail)
+        localStorage.removeItem('google_provider_token');
```
  Remove the `localStorage.getItem('google_provider_token')` fallbacks in `batchEmailSender.ts`, `gmailService.ts` and `useMasterAIRouter.ts:413`. If you ever need fresh data from inside a long-lived callback, read it through a ref (`const fetchDataRef = useRef(fetchData); fetchDataRef.current = fetchData;`).

### CORE-019: Two Supabase clients plus an unpinned CDN build (random sign-outs; blank app if the CDN fails)
- **Severity:** Medium | **Status:** LIKELY
- **Location:** `App.tsx:68-73`; `src/hooks/useMasterAIRouter.ts:4,15-17`; `index.html:17`
- **What's wrong:**
  - App uses the CDN client (`supabase-js@2`, the latest 2.x at load time). The AI hook builds a second GoTrue client from the npm package with the same storage key. Both run auto-refresh timers. Concurrent refreshes of the same refresh token produce "Invalid Refresh Token: Already Used", and Supabase then signs the user out. This is a known multi-instance failure; the console warns "Multiple GoTrueClient instances detected".
  - `useMasterAIRouter` uses its private client for history and deletes, but `deps.supabase` for batches.
  - If the CDN script is blocked or slow, `supabase` is `null`: `renderContent` shows a blank page and `handleLogin` throws `Cannot read properties of null`.
  - The CDN version can change under you on any deploy-free day.
- **Fix:** one module-level client from the npm dependency (already in `package.json`):
```ts
// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
```
```diff
@@ App.tsx:68-73
-const supabaseUrl = '...';
-const supabaseAnonKey = '...';
-const supabase: SupabaseClient = (window as any).supabase ? (window as any).supabase.createClient(supabaseUrl, supabaseAnonKey) : null;
+import { supabase } from './lib/supabaseClient.ts';
@@ src/hooks/useMasterAIRouter.ts:4,15-17
-import { createClient } from '@supabase/supabase-js';
-const supabaseUrl = '...'; const supabaseAnonKey = '...';
-const supabase = createClient(supabaseUrl, supabaseAnonKey);
+import { supabase } from '../../lib/supabaseClient.ts';
@@ index.html:17
-  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```
  Grep for other `window.supabase` uses before removing the script tag. Add `/// <reference types="vite/client" />` (in `vite-env.d.ts`); that also fixes the `import.meta.env` tsc errors at `App.tsx:862,3053`.

### CORE-020: Mutation handlers ignore Supabase errors (silent failures, optimistic state never rolled back)
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `handleUpdateJobStatus` `2085-2088`; `handleAddClient` `2148-2154` (returns the client even on failure); `handleUpdateClient` `2155-2159` (sends the whole object including UI-only fields); `handleDeleteClient` `2160-2163`; `handleDeleteJob` `2165-2172`; `handleDuplicateJob` `2226-2233`, `2267`; `handleDeleteDoc` `2275-2281`; `handleNavigateToNewDoc` `2302-2309`; `handleAddInventoryItem` `2440-2446`; `handleUpdateInventoryItem` `2447-2468`; `handleDeleteInventoryItem` `2469-2473`; `handleLogInventoryAction` `2433-2438`; `handleEmailSent` `2028-2034`; `markDocumentsAsViewed` `1026-1032`; `handleUpgradeSuccess` `1288`
- **What's wrong:** none of these read `{ error }`. RLS denials, network failures and constraint violations look like success, the UI shows the change, and it disappears on the next reload. `handleUpdateJobStatus` updates local state even when the DB update failed. There is no toast system, and the code mixes `alert()` with `console.error`.
- **Fix:** add a small helper and use it everywhere:
```ts
const run = async <T,>(label: string, q: PromiseLike<{ data: T; error: any }>): Promise<T | null> => {
  const { data, error } = await q;
  if (error) { console.error(label, error); notify.error(`${label}: ${error.message}`); return null; }
  return data;
};

const handleUpdateJobStatus = async (jobId: string, newStatus: Job['status']) => {
  const prev = jobs.find(j => j.id === jobId)?.status;
  setJobs(p => p.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
  const ok = await run('Update job status', supabase.from('jobs').update({ status: newStatus }).eq('id', jobId).select('id').single());
  if (!ok && prev) setJobs(p => p.map(j => j.id === jobId ? { ...j, status: prev } : j));
};

const handleAddClient = async (clientData: Partial<Client>) => {
  if (!session) return null;
  const row = await run('Add client', supabase.from('clients')
     .insert({ user_id: session.user.id, name: clientData.name, email: clientData.email, phone: clientData.phone, address: clientData.address, notes: clientData.notes })
     .select(CLIENT_COLUMNS).single());
  if (row) setClients(p => [...p, row as Client].sort((a, b) => a.name.localeCompare(b.name)));
  return row as Client | null;
};
```
  (`notify` is a tiny toast context: see Refactor R4.)

### CORE-021: Saving the profile unmounts Settings, so a failed save silently discards the edits
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1992-2026`, `3052`
- **What's wrong:** `handleSaveProfile` sets the **global** `loading=true`. `renderContent` then returns the full-page loading text and unmounts `<Settings>`. On an upload error (`2001`) or an upsert error (`2020-2024`) it calls `setLoading(false)` and nothing else: Settings remounts from the unchanged `profile` and the edits are gone, with no message. It also upserts `email` into `profiles` without changing the auth email.
- **Fix:**
```diff
-        setLoading(true);
+        // do NOT toggle the global loading gate here
         let newLogoUrl = updatedProfile.logoUrl;
@@
-        } catch (error) { setLoading(false); return; }
+        } catch (error: any) { alert(`Image upload failed: ${error.message}`); throw error; }
@@
-        const { data, error } = await supabase.from('profiles').upsert(profileForDb).select().single();
-        if (!error && data) {
-            setProfile(...);
-            setView({ screen: 'dashboard' });
-        }
-        setLoading(false);
+        const { error } = await supabase.from('profiles').update(profileForDb).eq('id', session.user.id);
+        if (error) { alert(`Save failed: ${error.message}`); throw error; }
+        setProfile({ ...updatedProfile, logoUrl: newLogoUrl, profilePictureUrl: newProfilePicUrl });
+        setView({ screen: 'dashboard' });
```
  `Settings` should show its own "Saving..." state and stay mounted.

### CORE-022: End users get a "Database Update Required" SQL screen on unrelated errors
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1474-1479`, `1646-1648`, `1698-1700`, `1704-1708`, `3051`, `3152`
- **What's wrong:**
  - The trigger patterns are broad: any profile error mentioning `schema cache` or `invalid input syntax`, any client error matching `column ".*" does not exist`, and **any** `ai_chat_history` error containing the word `column`. A matching error replaces the entire app, for paying customers, with a SQL script and Supabase dashboard instructions they can't act on.
  - The script itself conflicts with `supabase_setup.sql` (CORE-003) and ships 25 KB of schema in the JS bundle.
  - The `ai_chat_history` probe adds a query to every `fetchData`.
- **Fix:**
  - Delete `SQL_SETUP_SCRIPT` and `DbSetupScreen` from the client. Keep migrations in `supabase/migrations/`.
  - On schema errors, log to the console or monitoring and show a generic "Something went wrong, please try again" toast.
  - Remove the probe:
```diff
@@ App.tsx:1703-1709
-        // AI Chat History Check
-        if (navigator.onLine) {
-            const { error: historyError } = await supabase.from('ai_chat_history').select('id').limit(1);
-            ...
-        }
```

### CORE-023: `fetchData` failures end in a permanent loader or a blank dashboard; no error boundary
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1452-1716` (`try/finally` with no `catch`), `1474-1481`, `1535-1562`, `2515`, `2540`; `index.tsx` (no ErrorBoundary)
- **What's wrong:**
  - If the profile query returns any error other than `PGRST116` and the regex doesn't match (for example a 500 or a timeout), `profileData` is null and the "create profile" branch is skipped. `profile` stays `null`, `loading` becomes `false`, and the dashboard renders `null`.
  - If the default-profile insert fails, the same thing happens.
  - If any awaited call throws (IndexedDB `put` rejects, `initDB` is blocked because another tab holds an old version, since `onblocked` isn't handled and connections are never closed), `setLoading(false)` is never reached and the user stares at "Loading profile..." forever.
  - Any render exception (for example `profile.name.split` when `name` is null, `2540`, or `decodeURIComponent` on a malformed URL, `844`) white-screens the whole app, because there is no ErrorBoundary.
- **Fix:**
```diff
@@ App.tsx:1457
         try {
             ...
-        setLoading(false);
-        fetchedUserIdRef.current = user.id;
-        } finally {
+            fetchedUserIdRef.current = user.id;
+        } catch (e: any) {
+            console.error('fetchData failed', e);
+            setLoadError(e?.message || 'Could not load your data.');
+        } finally {
+            setLoading(false);
             fetchingDataRef.current = false;
         }
```
```tsx
// renderDashboard / renderContent
if (session && !profile && !loading) return <RetryScreen message={loadError ?? 'Could not load your profile.'} onRetry={() => fetchData(true)} />;
```
```tsx
// index.tsx
<BrowserRouter><AppErrorBoundary><App /></AppErrorBoundary></BrowserRouter>
```
  Wrap IndexedDB writes in their own `try/catch` (a cache failure must not block the UI), use `(profile.name || '').split(' ')[0]`, and wrap `decodeURIComponent` in a try/catch.

### CORE-024: Free-plan limits are inconsistent and easy to bypass in the UI; email usage is miscounted
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1294-1322`, `2215-2273`, `2284-2316`, `1123`, `2709`, `3066-3073`, `2028-2034`; `components/SelectDocType.tsx:95-99`; `components/JobForm.tsx:61,108`
- **What's wrong:**
  - **Duplicate Job** and **client quick-create** (`handleNavigateToNewDoc`) insert jobs and documents without `checkLimit`.
  - Deep links (`/jobs/:id/select-doc`, `/jobs/:id/forms/Invoice`) skip the check.
  - An AI batch of N drafts is checked once, at queue time.
  - Deleting a job or document frees quota.
  - Counts come from in-memory arrays (first 50 documents, docs of visited jobs only), so `checkLimit('docs')` from the dashboard AI undercounts.
  - The job-details badge counts `jobForms`, the **filtered** list, so typing in "Search docs" changes "3/12".
  - `JobForm` says "6 active jobs" while the logic counts jobs *created this month* (including completed ones, and jobs with no date at all).
  - `SelectDocType` receives `docCount={forms.length}` and ignores it.
  - `handleEmailSent` builds from a stale `profile` closure, so several sends before a re-render are counted once. Batch sends never count.
- **Fix:** server-side enforcement (CORE-004) is the real fix. For the UI:
```diff
@@ App.tsx:2216 (handleDuplicateJob)
-        if (!session || !jobToDuplicate) return;
+        if (!session || !jobToDuplicate) return;
+        if (!checkLimit('jobs')) return;
@@ App.tsx:2293 (handleNavigateToNewDoc)
-        if (!activeJob) {
+        if (!activeJob) {
+            if (!checkLimit('jobs')) return;
@@ App.tsx:2709
-{jobForms.filter(f => { ... }).length}/{FREE_LIMITS.docs}
+{baseForms.filter(f => { ... }).length}/{FREE_LIMITS.docs}
@@ App.tsx:2028
-    const handleEmailSent = async () => {
-        if (!session || !profile) return;
-        const currentMonthStr = new Date().toISOString().substring(0, 7);
-        const newCount = (profile.emailUsage || 0) + 1;
-        setProfile({ ...profile, emailUsage: newCount });
-        await supabase.from('profiles').update({ email_usage: newCount, email_usage_month: currentMonthStr }).eq('id', session.user.id);
-    };
+    const handleEmailSent = async (n = 1) => {
+        if (!session) return;
+        const { data } = await supabase.rpc('increment_email_usage', { p_count: n }); // SECURITY DEFINER, uses auth.uid()
+        setProfile(prev => prev ? { ...prev, emailUsage: data ?? (prev.emailUsage || 0) + n } : prev);
+    };
```
  For the deep-link case, guard the `selectDocType` and new `form` routes in `renderContent` with `checkLimit('docs', jobId)` inside a `useEffect` that redirects to job details when it fails.

### CORE-025: Job-details search and type filter leak between jobs; empty state is misleading
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1052-1055`, `2679-2680`, `2910-2929`, `2941-2951`
- **What's wrong:**
  - `docSearchQuery` and `docTypeFilter` are App-level state that is never reset. Filter by "Warranty" in job A, open job B (which has no warranties): the `<select>` value isn't among B's options, so it *looks* like "All Types", and the page says "No documents yet / Create First Document" even though B has documents.
  - The empty-state check uses the filtered list.
- **Fix:**
```ts
useEffect(() => { setDocSearchQuery(''); setDocTypeFilter('All'); }, [view.screen === 'jobDetails' ? view.jobId : null]);
```
```diff
@@ App.tsx:2941
-                    {jobForms.length === 0 ? (
+                    {baseForms.length === 0 ? (
                         <EmptyState .../>
+                    ) : jobForms.length === 0 ? (
+                        <div className="text-center text-muted-foreground py-10">
+                            No documents match your filters. <Button variant="link" onClick={() => { setDocSearchQuery(''); setDocTypeFilter('All'); }}>Clear filters</Button>
+                        </div>
                     ) : (
```

### CORE-026: Duplicate Job copies the wrong set of documents, keeps client signatures and resets itself
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:2215-2273`, `2663`, `3210-3217`; `components/DuplicateJobModal.tsx:28-35`
- **What's wrong:**
  - From the dashboard, `forms.filter(f => f.jobId === job.id)` only contains this job's documents that happen to be in the global newest 50, so older documents are silently not offered.
  - Copied documents keep `clientSignatureUrl`, `clientSignedAt` and `viewedByProvider` (unlike `handleDuplicateDoc`), so the new job shows client signatures that were never given and lights up the "signed" badges.
  - Only `title`, `invoiceNumber` and `estimateNumber` get "-COPY"; other numbers duplicate.
  - No error handling, no limit check (CORE-024).
  - App passes a new `forms.filter(...)` array on every render, and the modal's effect depends on it, so any App re-render while the modal is open resets the typed name and the checkbox selection.
- **Fix:**
```diff
@@ App.tsx:2663
-onDuplicate={() => { setJobToDuplicate(job); setShowDuplicateJobModal(true); }}
+onDuplicate={async () => { await loadDocumentsForJob(job.id, true); setJobToDuplicate(job); setShowDuplicateJobModal(true); }}
@@ App.tsx:3215
-                forms={forms.filter(f => f.jobId === jobToDuplicate?.id)}
+                forms={duplicateCandidateForms}   // const duplicateCandidateForms = useMemo(() => forms.filter(f => f.jobId === jobToDuplicate?.id), [forms, jobToDuplicate?.id]);
@@ App.tsx:2241
-            const newDocData = { ...fullDoc.data };
+            const { clientSignatureUrl, clientSignedAt, clientSignedBy, viewedByProvider, ...rest } = fullDoc.data as any;
+            const newDocData: any = { ...rest, status: 'Draft' };
+            for (const k of ['invoiceNumber','estimateNumber','reportNumber','workOrderNumber','warrantyNumber','changeOrderNumber','poNumber','receiptNumber'])
+                if (newDocData[k]) newDocData[k] = `${newDocData[k]}-COPY`;
```
  In `DuplicateJobModal`, initialize only when `isOpen` flips to true: `useEffect(..., [isOpen, job?.id])`.

### CORE-027: The inventory trigger in the setup SQL can deduct the same stock twice (estimate accepted, then invoice paid)
- **Severity:** Medium | **Status:** LIKELY
- **Location:** `App.tsx:632-733`
- **What's wrong:** the trigger deducts linked line items when **any** of Invoice, Estimate or Change Order becomes `approved/accepted/paid`. The normal workflow is that an estimate is accepted and then invoiced with the same lines (Estimate → Invoice conversion). That deducts stock twice for one job. A portal signature (`status='Accepted'`) on an estimate also deducts stock with no contractor action.
- **Fix:** commit inventory from exactly one document type, for example Invoice only:
```diff
-    IF NEW.type NOT IN ('Invoice', 'Estimate', 'Change Order') THEN
+    IF NEW.type NOT IN ('Invoice') THEN
```
  in all three branches. Alternatively, record `inventoryCommittedBy` on the job and skip when another document already committed the same `inventoryItemId`.

### CORE-028: Logout leaves the previous user's data in IndexedDB, localStorage and the AI state
- **Severity:** Medium | **Status:** CONFIRMED
- **Location:** `App.tsx:1954-1960`, `1431-1445`, `1564-1567`, `1606-1607`, `1625-1626`; `utils/db.ts`
- **What's wrong:**
  - Logout never clears the IndexedDB stores (`jobs`, `documents`, `clients`, `inventory`, `profile`, with Gmail tokens until CORE-002 is fixed).
  - The next person who uses the device offline sees the previous user's jobs and clients, and `dbApi.getAll('profile')[0]` can return the wrong profile.
  - `localStorage` keeps `active_ai_chat_id` and `active_job_ai_chat_*`, and the in-memory AI messages persist.
  - Offline logout skips `signOut()`, so the session token stays in storage and the user is logged back in on reload.
- **Fix:**
```ts
const handleLogout = async () => {
  try { await supabase.auth.signOut({ scope: navigator.onLine ? 'global' : 'local' }); } catch {}
  await Promise.allSettled(['jobs','documents','clients','profile','inventory','saved_items','offline_queue'].map(s => dbApi.clear(s)));
  Object.keys(localStorage).filter(k => k.startsWith('active_') || k === 'google_provider_token' || k === 'app_view_state')
        .forEach(k => localStorage.removeItem(k));
  aiCreateNewChat(); jobAiCreateNewChat();
  fetchedUserIdRef.current = null;
  setSession(null);
  navigate('/welcome', { replace: true });
};
```

### CORE-029: Performance and egress
- **Severity:** Medium | **Status:** CONFIRMED (items 1–6) / LIKELY (7)
- **Location:** throughout, as noted below
- **What's wrong:**
  1. **Full reload after every mutation**: `fetchData()` runs 8–9 queries (profile, `user_credentials`, all jobs unpaginated, 50 documents, 50 clients, 50 inventory, 50 history, 50 saved items, the `ai_chat_history` probe) after each add, update or delete, and once per line item in `handleAllocateInventory`.
  2. **IndexedDB write storm before first paint**: `fetchData` awaits `dbApi.put` row by row (`1607`, `1626`, `1645`, `1666`). Each put **opens a new IDB connection** (`utils/db.ts:47-58`) and never closes it. With about 200 rows that is several hundred sequential opens before `setLoading(false)`, which delays the dashboard by seconds on low-end phones.
  3. The **two AI hooks** each fetch the last 30 `ai_chat_history` rows **including the full `messages` JSON** on mount (before login, so wasted) and again after every message (`useMasterAIRouter.ts:261-302, 337`).
  4. `DOCUMENT_METADATA_COLUMNS` pulls `clientSignatureUrl` (a base64 PNG data URL when signed through the portal) for every listed document, only to test it for truthiness (`App.tsx:77`, `1011`). `loadDocumentsForClient` pulls full `data` for 20 documents just to list them.
  5. **One 1.96 MB JS chunk** (`dist/assets/index-*.js`): all 12 forms, every view and the AI panel load up front. `index.html` loads 7 render-blocking third-party scripts in `<head>` (Tailwind JIT CDN, Tesseract, Supabase, jsPDF, autotable, html2canvas, PayPal) plus a stylesheet of about 45 Google font families.
  6. `App` is a 3,200-line single component. Every keystroke in "Search jobs" or "Search docs" re-renders everything, including both AI hooks' consumers (`DashboardMasterAIButton`, 734 lines), recomputes all `forms.filter` calls, and injects a `<style>` tag (`2930-2936`). `DuplicateJobModal` re-runs its reset effect on every App render.
  7. Jobs are fetched with no limit; large accounts download every job on each mutation.
- **Fix:**
  - Targeted state updates instead of `fetchData()` (CORE-007, CORE-020).
  - Batch IndexedDB writes in one transaction with a cached connection, and don't block the UI on them:
```ts
let dbPromise: Promise<IDBDatabase> | null = null;
const getDB = () => (dbPromise ??= initDB());
export const dbApi = {
  async replaceAll(store: string, rows: any[]) {
    const db = await getDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      s.clear(); rows.forEach(r => s.put(r));
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  },
  // getAll/put/delete/clear use getDB() too
};
// fetchData:
setJobs(mappedJobs);
void dbApi.replaceAll('jobs', mappedJobs).catch(console.warn);
```
  - AI history: `select('id, title, created_at, scope, scope_id')` for the list, load `messages` only on `loadConversation`, and gate the init effect on `session?.user?.id`.
  - Replace `clientSignatureUrl:data->>clientSignatureUrl` with a boolean. Add a generated column: `ALTER TABLE documents ADD COLUMN has_client_signature boolean GENERATED ALWAYS AS (coalesce(data->>'clientSignatureUrl','') <> '') STORED;` and select `has_client_signature`.
  - Code-split: `const InvoiceForm = React.lazy(() => import('./components/InvoiceForm.tsx'))` for every form and view, inside `<Suspense>`. Load tesseract, jsPDF, html2canvas and PayPal on demand (dynamic `import()` or script injection when first needed). Replace the Tailwind CDN with the Tailwind PostCSS build.
  - Memoize derived lists (`useMemo` for `filteredJobs`, `jobForms`, `lowStockItems`) and split screens into components (Refactor R1).

### CORE-030: Worker scheduling-conflict detection never fires (and would leave JobForm stuck if it did)
- **Severity:** Low | **Status:** CONFIRMED
- **Location:** `App.tsx:2041-2059`, `1594-1604`; `components/JobForm.tsx:68`
- **What's wrong:** jobs are mapped from DB rows without `workerName` (the raw `worker_name` is spread, but the check reads `j.workerName`), so `conflict` is always undefined. If it were fixed as is, `handleSaveJob` would `return ''` after the alert while `JobForm` stays at `loading=true` ("Saving...", disabled) forever.
- **Fix:** add `workerName: j.worker_name` to the mapping at `1594-1604`, and make the conflict path `throw` (or return a rejected promise) so `JobForm` resets `loading` (see the JobForm change under CORE-005).

### CORE-031: Dead or half-wired controls and dead code
- **Severity:** Low | **Status:** CONFIRMED
- **Location:**
  - `App.tsx:1007` / `2590`: `notificationCount` is never set, so the Community badge never appears.
  - `App.tsx:2901-2908`: mobile filter button with an empty `onClick`; it only works because an invisible `<select>` overlays it.
  - `components/UpgradeModal.tsx:129-131`: "Get Started with AI" has no handler.
  - `App.tsx:1981`: `handleUpdateAppLogo` placeholder returns `''`.
  - `App.tsx:2528-2530`, `2682-2683`: unused `getStatusColor`, `getDocIcon`, `getStatusBadge`.
  - `App.tsx:47`: unused import `DOC_TYPE_TO_FORM_TYPE`.
  - `App.tsx:1956`: removes a legacy `app_view_state` key.
  - `App.tsx:1171`, `1209`: `'CREATE_INVENTORY_ITEM' as any` and `'NAVIGATE_TO_PAGE' as any` casts hide action types missing from `MasterRouterPayload`.
  - `src/App.tsx` (empty) and the rest of `src/components`, `src/services`, `src/types.ts` are stale duplicates.
- **Fix:**
  - Either load forum notifications (`supabase.from('notifications').select('id', {count:'exact', head:true}).eq('user_id', uid).eq('read', false)`) into `setNotificationCount`, or remove the badge.
  - Make the mobile filter a real `<select>` with a visible icon (remove the decorative `Button`).
  - Disable "Get Started with AI" with `disabled aria-disabled title="Coming soon"`.
  - Delete the dead functions and the stale `src/*` duplicates, after confirming nothing imports them.

### CORE-032: Opening the job AI modal wipes the dashboard AI's saved conversation pointer
- **Severity:** Low | **Status:** CONFIRMED
- **Location:** `App.tsx:978-987`, `2724-2728`; `src/hooks/useMasterAIRouter.ts:253-258, 710-715`
- **What's wrong:**
  - Before any job is selected, the job hook has `historyScopeId=''`, so its `storageKey` is `'active_ai_chat_id'`, the same key the dashboard hook uses. It also loads the dashboard history and restores the dashboard's active chat.
  - On the first click of the job **AI** button, `jobAiCreateNewChat()` runs with that stale closure and `localStorage.removeItem('active_ai_chat_id')`, so the dashboard assistant forgets its conversation.
  - After `setJobForAI`, the hook's init effect then restores the *previous* job conversation, which defeats the "new chat" intent.
- **Fix:** don't run the job hook until a job is selected, and give it a distinct key:
```diff
@@ src/hooks/useMasterAIRouter.ts:255
-    const storageKey = historyScope === 'job' && historyScopeId
-        ? `active_job_ai_chat_${historyScopeId}`
-        : 'active_ai_chat_id';
+    const storageKey = historyScope === 'job'
+        ? `active_job_ai_chat_${historyScopeId || 'none'}`
+        : 'active_ai_chat_id';
@@ useEffect init
-        if (isEphemeral) return;
+        if (isEphemeral || (historyScope === 'job' && !historyScopeId)) return;
```
  In App, open the modal first and start a new chat in an effect keyed on `jobForAI?.id`.

### CORE-033: URL parsing robustness
- **Severity:** Low | **Status:** CONFIRMED
- **Location:** `App.tsx:844`, `864-867`, `882-890`, `899`
- **What's wrong:**
  - `decodeURIComponent(location.pathname)` throws `URIError` on a malformed escape (`/jobs/%E0%A4%A`), which crashes the app (no ErrorBoundary).
  - The path is decoded once and `parts[4]` again (double decode).
  - Unknown paths render the dashboard while the URL stays wrong.
  - `/auth/<x>` is cast `as any`.
  - The `form` route accepts any string as `FormType` and saves documents with that `type`. The AI `NAVIGATE_TO` action can produce, for example, `/jobs/1/forms/invoice`, which then shows "invoice not implemented."
- **Fix:**
```ts
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
const path = location.pathname.replace(/\/$/, '') || '/dashboard';
const parts = path.split('/').map(safeDecode);
...
const formType = resolveFormType(parts[4]);           // normalize 'invoice' → FormType.Invoice
if (!formType) return { screen: 'jobDetails', jobId: parts[2] };
...
if (path.startsWith('/auth/')) {
  const a = parts[2];
  return { screen: 'auth', authScreen: (['login','signup','checkEmail'] as const).includes(a as any) ? a as any : 'login' };
}
```
  For unknown paths, `navigate('/dashboard', { replace: true })` in an effect.

### CORE-034: Double-clicking Save creates two documents
- **Severity:** Low | **Status:** LIKELY
- **Location:** `App.tsx:2089-2147`
- **What's wrong:** for a new document the id is `view.formId || crypto.randomUUID()`, generated on each call, and there is no in-flight guard. Two quick Save clicks (or a form's auto-save plus a manual Save) insert two rows before navigation happens. The local `savedForm` also stamps `created_at = now` on *edited* documents, so the card date changes until the next reload.
- **Fix:**
```ts
const savingRef = useRef(false);
const newFormIdRef = useRef<string | null>(null);
// reset newFormIdRef when the form route changes:
useEffect(() => { newFormIdRef.current = null; }, [location.key]);

const handleSaveForm = async (formData: any) => {
  if (!session || view.screen !== 'form' || savingRef.current) return;
  savingRef.current = true;
  try {
    const id = view.formId || (newFormIdRef.current ??= crypto.randomUUID());
    ...
    const existing = forms.find(f => f.id === id);
    const savedForm = mapDocumentRow({ ...formRecord, created_at: existing?.createdAt ?? new Date().toISOString(), public_token: existing?.public_token }, true);
    ...
  } finally { savingRef.current = false; }
};
```

### CORE-035: Mobile layout risks
- **Severity:** Low | **Status:** LIKELY
- **Location:** `App.tsx:2537-2625`, `2688-2748`, `2542`
- **What's wrong:**
  - On a 360 px phone, the dashboard header's right cluster (Upgrade with label, Tools with icon, text and chevron, Community, +, the AI pill and the avatar) is `shrink-0`. Inside `main overflow-x-hidden` this clips the right-most buttons, often the avatar (the only route to Profile).
  - The job-details header has the same pattern (badge, Upgrade, AI pill, +, Financials).
  - The OFFLINE pill is desktop-only (CORE-016).
  - Hover-only tooltips on the Dock mean mobile users get unlabeled icons.
- **Fix:** let the right cluster shrink or wrap, and collapse secondary actions into the Tools menu below `md`:
```diff
-<div className="flex items-center gap-2 shrink-0">
+<div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-wrap justify-end">
@@ Upgrade button
-<span className="inline">Upgrade</span>
+<span className="hidden sm:inline">Upgrade</span>
```
  Add a "Profile" entry to the Tools menu as well, and add `aria-label={label}` on Dock buttons.

### CORE-036: PWA assets are missing or misconfigured
- **Severity:** Low | **Status:** CONFIRMED
- **Location:** `index.html:10-12`; `manifest.json`; `public/` (contains only `template-test.html` and `templates/`); `sw.js`
- **What's wrong:** `/favicon-96x96.png` and `/contractore-ai-logo.png` don't exist in `public/`. The Vercel catch-all rewrite serves `index.html` for them, so the icons are broken. Manifest icons point at `https://images.contractordocs.app/...` (an external domain, the same 512 image for both sizes). The service worker is never registered (CORE-016), so the app doesn't meet installability requirements in some browsers.
- **Fix:** add the icon files to `public/`, reference local icons in `manifest.json` (192 and 512, `purpose: "any maskable"`), move `manifest.json` and `sw.js` to `public/`, and register the service worker (see CORE-016).

### CORE-037: Gmail OAuth "connect" has no `state` parameter (login CSRF / account-linking confusion)
- **Severity:** Low | **Status:** CONFIRMED
- **Location:** `App.tsx:1913-1931`; `components/GmailCallback.tsx:26-57`
- **What's wrong:** the authorization request has no `state`, and the callback accepts any `code`. An attacker can trick a logged-in contractor into opening `/gmail-callback?code=<attacker's code>`, which links the attacker's Gmail as the sender. The client id is hard-coded (public, acceptable).
- **Fix:**
```ts
const state = crypto.randomUUID();
sessionStorage.setItem('gmail_oauth_state', state);
const options = { ..., state };
// GmailCallback:
if (params.get('state') !== sessionStorage.getItem('gmail_oauth_state')) { setStatus('error'); setMessage('Invalid OAuth state'); return; }
sessionStorage.removeItem('gmail_oauth_state');
```

### CORE-038: Portal and approval links lose their query string for signed-in contractors
- **Severity:** Low | **Status:** LIKELY
- **Location:** `App.tsx:1324-1336`, `1365-1388`
- **What's wrong:** the auth effect runs on first mount with `portalKey`/`approvalToken` still `null` (they are set by the earlier effect in the same commit). If the contractor previews their own portal link `/?portal=KEY` while logged in, `getSession().then` sees path `/` and navigates to `/dashboard`, dropping `?portal=`. The `PortalView` still renders from state, but a refresh then lands on the dashboard.
- **Fix:** read the tokens synchronously during initialization:
```ts
const initialParams = new URLSearchParams(window.location.search);
const [portalKey] = useState<string | null>(() => initialParams.get('portal'));
const [approvalToken] = useState<string | null>(() => initialParams.get('approval_token'));
const [loading, setLoading] = useState(() => !(initialParams.get('portal') || initialParams.get('approval_token')));
```
  Delete the effect at `1324-1336`. The auth effect's `if (!portalKey && !approvalToken)` then holds from the first render.

---

## 4. Recommended refactors

### R1. Real routes instead of a hand-written `view` state machine
React Router is already installed (v7). Replace `getViewFromPath`/`setView` and the 3,200-line `switch` with declared routes, a route guard, and one component per screen. This gives proper 404s, typed params, lazy loading and smaller re-renders.
```tsx
// AppRoutes.tsx
const Dashboard = lazy(() => import('./screens/Dashboard'));
const JobDetails = lazy(() => import('./screens/JobDetails'));
const FormScreen = lazy(() => import('./screens/FormScreen'));

<Routes>
  <Route element={<PublicOnly />}>
    <Route path="/welcome" element={<Welcome />} />
    <Route path="/auth/login" element={<Login />} />
    <Route path="/auth/signup" element={<Signup />} />
    <Route path="/auth/check-email" element={<CheckEmail />} />
  </Route>
  <Route path="/update-password" element={<UpdatePasswordRoute />} />
  <Route path="/privacy" element={<PrivacyPolicy />} />
  <Route element={<RequireAuth />}>          {/* stores the deep link, redirects to /welcome */}
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/jobs/new" element={<CreateJob />} />
    <Route path="/jobs/:jobId" element={<JobDetails />} />
    <Route path="/jobs/:jobId/new" element={<SelectDocType />} />
    <Route path="/jobs/:jobId/forms/:formType/:formId?" element={<FormScreen />} />
    {/* ...settings, clients, inventory, pricebook, calendar, analytics, communication, forum */}
  </Route>
  <Route path="*" element={<NotFound />} />
</Routes>
```

### R2. One Supabase client and an auth provider
Combine `lib/supabaseClient.ts` (CORE-019) with an `AuthProvider` that owns `session`, `profile` and loading or error state. It handles `onAuthStateChange` in one place, resets all caches on sign-out (CORE-008, CORE-028), and exposes `useAuth()`. This removes the stale-closure hazards in the listener.
```tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') queryClient.clear();   // see R3
    });
    return () => subscription.unsubscribe();
  }, []);
  return <AuthCtx.Provider value={{ session, ready }}>{ready ? children : <Splash />}</AuthCtx.Provider>;
}
```

### R3. A data layer with per-entity caches (React Query or a small store) instead of `fetchData()`
Most bugs here (CORE-001, 007, 011, 020, 026, 029) come from one global `forms` array that mixes stub and full rows, and from "refetch everything" after each write. Separate the query shapes and update caches precisely:
```ts
// documents.ts
export const useJobDocuments = (jobId: string) =>
  useInfiniteQuery({
    queryKey: ['docs', 'job', jobId],
    queryFn: ({ pageParam = 0 }) => supabase.from('documents').select(DOCUMENT_METADATA_COLUMNS)
      .eq('job_id', jobId).order('created_at', { ascending: false }).range(pageParam, pageParam + 19).throwOnError(),
    getNextPageParam: (last, all) => last.data!.length === 20 ? all.length * 20 : undefined,
  });

export const useDocument = (id?: string) =>
  useQuery({ queryKey: ['doc', id], enabled: !!id,
    queryFn: () => supabase.from('documents').select('*').eq('id', id!).single().throwOnError().then(r => r.data) });

export const useSaveDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: DocumentRow) => supabase.from('documents').upsert(row).select('*').single().throwOnError().then(r => r.data!),
    onSuccess: (saved) => {
      qc.setQueryData(['doc', saved.id], saved);
      qc.invalidateQueries({ queryKey: ['docs', 'job', saved.job_id] });
    },
  });
};
```
Typed `DocumentSummary` (list) and `DocumentFull` (editor) types make it a compile error to write a summary back into `data` (CORE-001).

### R4. Error boundary and toasts instead of `alert()` / `console.error`
```tsx
const ToastCtx = createContext<{ error(msg: string): void; success(msg: string): void }>(null!);
export const useNotify = () => useContext(ToastCtx);
class AppErrorBoundary extends React.Component<{children: React.ReactNode}, {err?: Error}> {
  state = { err: undefined as Error | undefined };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() { return this.state.err ? <Crash onReload={() => location.reload()} /> : this.props.children; }
}
```
Then route every Supabase `{ error }` through `notify.error` (CORE-020, CORE-021, CORE-023).

### R5. Server-side business rules
Move plan limits, `subscription_tier` protection, email-usage increments, inventory adjustments and "mark viewed" into Postgres triggers and RPCs (CORE-004, 009, 001, 024). Verify PayPal webhooks. The client keeps only UX pre-checks.

### R6. Move the AI action dispatcher out of App
`handleMasterAIAction`, `queueAIDraftsFromPayload` and `openAIDraft` should live in an `AIActionsProvider`. It should take an explicit `source` (dashboard or job) and `jobId`, keep large draft payloads in memory keyed by id rather than in `history.state`, and expose `runDraftQueue()` with a cancel method that clears the queue (CORE-010, 013, 014, 015).
