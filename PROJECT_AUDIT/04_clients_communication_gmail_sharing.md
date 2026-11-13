# 04 — Clients, Communication (Gmail) and Sharing / Client Portal

Scope: `components/ClientsView.tsx`, `components/ClientDetails.tsx`, `components/CommunicationView.tsx`, `components/EmailTemplateSelector.tsx`, `components/GmailCallback.tsx`, `components/BatchEmailReviewCard.tsx`, `services/gmailService.ts`, `services/batchEmailSender.ts`, `utils/buildEmailBatch.ts`, `utils/emailTemplates.ts`, `supabase/functions/gmail-auth/index.ts`, `create_user_gmail_accounts.sql`, `create_user_credentials.sql`, `components/ShareModal.tsx`, `components/DocumentApprovalView.tsx`, `components/PortalView.tsx`, the SQL embedded in `App.tsx` (`SQL_SETUP_SCRIPT`) and `supabase_setup.sql`, plus the wiring in `App.tsx`.

All line numbers refer to the files as they are on branch `my-branch` (working tree) at audit time. "CONFIRMED" = the defect is visible in code and the failure follows deterministically. "LIKELY" = depends on runtime/deployment state that cannot be verified from the repo (for example which SQL script was run last in Supabase).

`src/` copies: `src/components/CommunicationView.tsx`, `src/services/gmailService.ts`, `src/components/ClientsView.tsx`, `src/components/EmailTemplateSelector.tsx` and `src/components/DocumentApprovalView.tsx` are **older** versions (single attachment, legacy `provider_token` flow). None of them contains a fix that the root lost, with one exception: the `src` CommunicationView ran its template auto-fill effect only on `[selectedDocId]`; the root version added `forms` to the dependency list, which introduced COMM-014.

---

## 1. How it works

### 1.1 Wiring in App.tsx

| Concern | Where |
|---|---|
| Route `/gmail-callback` -> `{screen:'gmailCallback'}` | `App.tsx:861`, rendered at `App.tsx:3142` |
| Route `/communication` (+ `location.state.prefillData` from the AI router) | `App.tsx:856`, rendered at `App.tsx:3141`; AI action `OPEN_COMMUNICATION` navigates there at `App.tsx:1187-1189` |
| Route `/clients` | `App.tsx:853`, rendered at `App.tsx:3077-3101` |
| Public portal `?portal=<key>` and approval `?approval_token=<uuid>` | detection `App.tsx:835-842` and `App.tsx:1324-1336`; render short-circuit `App.tsx:3045-3049` (before any auth check) |
| Connect Gmail | `handleConnectGmail` `App.tsx:1913-1931` |
| Disconnect (legacy cleanup) | `handleDisconnectGmail` `App.tsx:1932-1953` |
| Email quota counter | `handleEmailSent` `App.tsx:2028-2034` |
| Legacy Google token capture on login | `App.tsx:1373-1425` (writes `localStorage.google_provider_token`, `profiles.gmail_*`, `user_credentials`) |
| Client CRUD | `handleAddClient`/`handleUpdateClient`/`handleDeleteClient` `App.tsx:2148-2163`; `loadMoreClients` `App.tsx:1722-1735` |
| "Mark signed documents as seen" | `markDocumentsAsViewed` `App.tsx:1015-1042` |
| Documents in memory | Loaded as **lightweight metadata only** (`DOCUMENT_METADATA_COLUMNS`, `App.tsx:77`, `mapDocumentRow` `App.tsx:100-107`, `fetchData` `App.tsx:1614-1627`). `data` then only holds `title, status, clientName, clientSignatureUrl, viewedByProvider, isAiGenerated, __lightweight`. Full JSON is fetched lazily by `loadDocumentData` (`App.tsx:1823-1848`) or `loadDocumentsForClient` (`App.tsx:1850-1871`). This fact drives COMM-001 and COMM-007. |
| Batch email via AI | `useMasterAIRouter.sendEmailBatch` (`src/hooks/useMasterAIRouter.ts:727-772`) -> `services/batchEmailSender.ts`; UI `BatchEmailReviewCard` inside `DashboardMasterAIButton.tsx:635-643`; `AUTO_SEND_BATCH` from the router calls it directly (`App.tsx:1199-1207`) |

### 1.2 Gmail OAuth: step-by-step as implemented

1. User clicks **Connect Gmail** / **Add Account** in `CommunicationView` (`CommunicationView.tsx:500-510`, `517-524`, `778`) -> `onConnectGmail` = `App.handleConnectGmail`.
2. `handleConnectGmail` (`App.tsx:1913-1931`) builds `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=<origin>/gmail-callback&client_id=292965678575-p8smva2vfeguocsppjr45r05jsvhggjo.apps.googleusercontent.com&access_type=offline&response_type=code&prompt=consent select_account&scope=https://www.googleapis.com/auth/gmail.send` and does a full-page redirect.
   - No `state` parameter (COMM-006). No `openid`/`email` scope (COMM-005). No `include_granted_scopes`.
3. Google redirects to `<origin>/gmail-callback?code=...&scope=...` (Vercel `vercel.json` rewrites every path to `index.html`, so the SPA loads). App restores the Supabase session and renders `GmailCallback` (`App.tsx:3142`).
4. `GmailCallback` (`GmailCallback.tsx:21-94`), guarded by a `useRef` against StrictMode double invocation, calls `supabase.auth.getUser()` then `supabase.functions.invoke('gmail-auth', { body: { action:'exchange', code, redirect_uri: origin + '/gmail-callback' } })`.
5. Edge function `gmail-auth` (`supabase/functions/gmail-auth/index.ts`):
   1. Validates the caller's Supabase JWT with the service-role client (`index.ts:31-35`).
   2. `POST https://oauth2.googleapis.com/token` with `grant_type=authorization_code` (`index.ts:45-62`).
   3. `GET https://www.googleapis.com/oauth2/v2/userinfo` with the new access token to learn the Gmail address (`index.ts:65-74`). **This call needs `openid`/`email`/`userinfo.email`; the token only carries `gmail.send`, so it fails or returns no `email` (COMM-005).**
   4. Upserts `{user_id, gmail_address, refresh_token?, updated_at}` into `user_gmail_accounts` on conflict `(user_id, gmail_address)` (`index.ts:77-91`). Refresh token stored in plaintext (COMM-010).
   5. Returns `{success, email, access_token, expires_in}`. The access token is discarded by the client.
6. `GmailCallback` shows success and `navigate('/communication')` after 2 s.
7. `CommunicationView` loads `select gmail_address from user_gmail_accounts where user_id = me` (`CommunicationView.tsx:61-82`) and preselects the first row. Switching account only changes local state (`467-473`), not persisted (COMM-039).

### 1.3 Sending an email (Communication page)

1. Pick client (`<select>` `CommunicationView.tsx:539-546`). Recipient is set to `client.email` (`121-132`).
2. Optional attachments: list = `forms` whose `data.clientName === client.name` (`110-119`), i.e. only among the 50 most recent lightweight docs already in memory (COMM-007).
3. Selecting docs triggers an effect that overwrites Subject/Body from the user's saved template or a default (`134-143`, `221-256`) (COMM-014).
4. Optional HTML template (`EmailTemplateSelector`) + colors; `generateHtmlEmail` substitutes `{{vars}}` (`394-413`, `utils/emailTemplates.ts:13-32`).
5. **Send via Gmail** (`749-759`) -> `handleSendEmail` (`322-391`):
   1. If no linked account -> open connect modal. Free plan check `emailsSent >= 10` (client-side only, COMM-037).
   2. For each selected doc: `generateDocumentBase64(doc.type, doc.data, profile, job!)` -> **runs on lightweight data** (COMM-007).
   3. `functions.invoke('gmail-auth', {action:'refresh', gmail_address})` -> edge function reads `refresh_token`, calls Google token endpoint, returns a 1 h access token (`index.ts:102-137`). Any failure -> generic "reconnect" modal (COMM-018).
   4. `sendGmail()` (`services/gmailService.ts:14-62`) builds a `multipart/mixed` MIME message (fixed boundary `foo_bar_baz`, optional `multipart/alternative` text+HTML, PDF parts base64 wrapped at 76 chars), base64url-encodes it via `btoa(unescape(encodeURIComponent(mime)))` and POSTs `{raw}` to `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`. Subject/filenames are not RFC 2047 encoded and bodies are declared `7bit` (COMM-015).
   5. On success -> `onEmailSent` increments `profiles.email_usage` (`App.tsx:2028-2034`).
6. **Disconnect**: trash icon -> confirm -> deletes the `user_gmail_accounts` row (no Google revoke), then `App.handleDisconnectGmail` nulls legacy `profiles.gmail_*` and deletes `user_credentials` provider `google` (COMM-018/COMM-019).

### 1.4 Batch email (AI)

`buildEmailBatch.ts` derives `{client_id, recipient_email, subject, body_html, attachment_document_ids}` from @mentions / natural language; `BatchEmailReviewCard` renders and lets the user edit/remove; `sendEmailBatch` (`batchEmailSender.ts:95-148`) gets an access token for **the first linked account** (or falls back to `localStorage.google_provider_token`), builds PDFs from in-memory `forms` (lightweight), and sends each email with a 1.5 s delay. Emails are not counted against the quota. A second, server-side `AUTO_SEND_BATCH` implementation exists in `supabase/functions/master-ai-router/index.ts:68-165` but is only reachable with `forceAction` (not sent by the client) and attaches placeholder text instead of PDFs (COMM-036).

### 1.5 Sharing, portal and approval links

| Link | Generated at | Token | Read RPC | Write RPC |
|---|---|---|---|---|
| Client portal `?portal=<portal_key>` | `ClientsView.tsx:279-288`, `ClientDetails.tsx:49-55` | `clients.portal_key` = `encode(gen_random_bytes(16),'hex')` (128-bit, not guessable, never rotates/expires) | `get_portal_data(p_key)` | `sign_document_via_portal(p_key, p_doc_id, p_signature)` |
| Single document approval `?approval_token=<uuid>` | `ClientsView.tsx:316-325`, `EstimateForm.tsx:300-311`, `ChangeOrderForm.tsx:269` | `documents.public_token` = `gen_random_uuid()` (122-bit, never rotates/expires) | `get_document_by_token(doc_token)` | `approve_document_by_token(doc_token, p_signature)` |
| Share email (Invoice) | `InvoiceForm.tsx:898` -> `ShareModal` | none (mailto, no link, no attachment) | – | – |

The public pages are rendered before any auth check (`App.tsx:3045-3049`) and call `SECURITY DEFINER` RPCs with the anon key. `documents`/`clients` tables themselves are protected by owner-only RLS (`App.tsx:199-201`, `238-240`), so the RPCs are the only public surface.

**There are two incompatible definitions of all four RPCs**: one inside `App.tsx` `SQL_SETUP_SCRIPT` (`App.tsx:281-344`, `397-446`, `RETURNS json/void`, returns whole rows) and one in `supabase_setup.sql` (`RETURNS jsonb`, whitelisted columns, client signature stored separately in the approval path). Whichever was executed last is live. Both versions have the authorization bugs below; the App.tsx version additionally leaks secrets (COMM-002).

Signature write-back: `DocumentApprovalView` -> `approve_document_by_token` (supabase_setup.sql version) sets `clientSignatureUrl/status=Accepted/clientSignedAt/clientSignedBy`. `PortalView` -> `sign_document_via_portal` (both versions) sets **`signatureUrl`** (the contractor's own signature field) and `status=Accepted` (COMM-008). Contractor sees signed docs through the green badge / "Signed Documents" modal / "History" modal in `ClientsView` (which look for `clientSignatureUrl`) and the dock badge `clientNotificationCount` (`App.tsx:1008-1013`).

There is **no inbox/thread view, no SMS, no `tel:`/WhatsApp buttons** anywhere in this area. Phone numbers are plain text (`ClientsView.tsx:528-537`, `ClientDetails.tsx:208-214`).

---

## 2. Feature & button inventory

Status legend: Works / Broken / Partial / Unverifiable (needs live DB/Google).

### 2.1 CommunicationView / EmailTemplateSelector / GmailCallback

| Control | file:line | Intended behavior | Actual status | Issue ref |
|---|---|---|---|---|
| Back | CommunicationView.tsx:420 | Return to dashboard | Works | – |
| Email quota pill | CommunicationView.tsx:428-432 | Show x/10 free emails | Partial (batch sends not counted; client-side only) | COMM-016, COMM-037 |
| Gmail account pill (dropdown toggle) | CommunicationView.tsx:441-451 | Open account menu | Works | – |
| Account row (switch account) | CommunicationView.tsx:467-473 | Make account the sender | Partial (not persisted; batch sender ignores it) | COMM-016, COMM-039 |
| Trash per account | CommunicationView.tsx:482-494 | Ask to disconnect | Partial (invisible until hover; invisible on touch) | COMM-034 |
| Add Account | CommunicationView.tsx:500-510 | Start OAuth for another account | Broken (exchange fails at userinfo) | COMM-005, COMM-006 |
| Connect Gmail (header) | CommunicationView.tsx:517-524 | Open connect modal | Works (opens modal) | – |
| Connect modal "Connect Gmail" | CommunicationView.tsx:778 | Redirect to Google | Broken end-to-end | COMM-005, COMM-006, COMM-004 |
| Connect modal Cancel / backdrop | CommunicationView.tsx:768, 783 | Close | Works | – |
| Client select | CommunicationView.tsx:539-546 | Choose recipient | Partial (only first 50 clients loaded) | COMM-021 |
| Document cards (toggle attach) | CommunicationView.tsx:573-590 | Select PDFs to attach | Partial (only recent 50 docs; name match only; overwrites subject/body) | COMM-007, COMM-014 |
| Browse/Change Template | CommunicationView.tsx:613-621 | Open template gallery | Works (label uses `window.innerWidth` at render) | COMM-034 |
| Gallery category tabs | EmailTemplateSelector.tsx:95-104 | Filter | Works | – |
| Gallery card click | EmailTemplateSelector.tsx:113-115 | Select template | Works (also closes gallery via parent `onSelect`) | – |
| "Use This Template" | EmailTemplateSelector.tsx:149-159 | Select + close | Works (calls `onClose` twice, harmless) | – |
| Gallery close X | EmailTemplateSelector.tsx:78-85 | Close | Works | – |
| Remove template | CommunicationView.tsx:632-640 | Clear template | Works | – |
| Primary/secondary color inputs | CommunicationView.tsx:648-676 | Brand colors | Works (free text injected into CSS, own email only) | – |
| Preview Email | CommunicationView.tsx:681-688 | Preview HTML | Works (sandboxed iframe) | COMM-033 |
| Preview close | CommunicationView.tsx:808 | Close | Works | – |
| To / Subject / Body | CommunicationView.tsx:695-722 | Compose | Partial (overwritten by template effect; no address validation) | COMM-014, COMM-015 |
| Insert Info chips | CommunicationView.tsx:728-736 | Append variable values | Partial (`[My Company]` appends "undefined" when profile field empty; totals ignore tax) | COMM-024 |
| Copy Email | CommunicationView.tsx:741 | Copy subject+body | Works (no error handling for clipboard denial) | – |
| Send via Gmail | CommunicationView.tsx:749-759 | Send with PDFs | Broken when an attachment is selected (lightweight data); text-only works only if an account could be linked | COMM-007, COMM-005, COMM-015, COMM-018 |
| Disconnect confirm "Yes, Disconnect" | CommunicationView.tsx:838-848 | Remove account | Partial (no revoke at Google; error ignored; wipes unrelated legacy creds) | COMM-018 |
| Disconnect Cancel | CommunicationView.tsx:849-857 | Close | Works | – |
| AI prefill + auto-send | CommunicationView.tsx:146-208 | Pre-fill and send | Broken (stale closure: shows connect modal instead of sending) | COMM-013 |
| GmailCallback auto exchange | GmailCallback.tsx:21-94 | Exchange code, link account | Broken (see COMM-005); error screen is a dead end | COMM-005, COMM-038 |

### 2.2 Batch email (AI)

| Control | file:line | Intended behavior | Actual status | Issue ref |
|---|---|---|---|---|
| Edit email (pencil) | BatchEmailReviewCard.tsx:96-101 | Edit recipient/subject/body | Works (hover-only on touch) | COMM-034 |
| Remove email | BatchEmailReviewCard.tsx:102-107 | Drop recipient | Works (hover-only) | COMM-034 |
| Body preview | BatchEmailReviewCard.tsx:113-116 | Show body | Works but XSS sink | COMM-017 |
| Edit modal fields / remove attachment / Save / Cancel / X | BatchEmailReviewCard.tsx:138-209 | Edit | Works | – |
| Discard | BatchEmailReviewCard.tsx:215-220 | Cancel batch | Works | – |
| Confirm & Send All | BatchEmailReviewCard.tsx:221-232 | Send all | Broken with attachments; uses first Gmail account only | COMM-007, COMM-016 |
| "Go back" (empty batch) | BatchEmailReviewCard.tsx:65 | Close | Works | – |

### 2.3 ClientsView / ClientDetails

| Control | file:line | Intended behavior | Actual status | Issue ref |
|---|---|---|---|---|
| Back | ClientsView.tsx:373 | Dashboard | Works | – |
| History | ClientsView.tsx:389-392 | Portal activity | Partial (dates = creation date, only loaded docs) | COMM-040 |
| Temporary (n) | ClientsView.tsx:393-396 | Temp clients modal | Works | – |
| Add Client | ClientsView.tsx:397-400 | Open add modal | Works | – |
| Search | ClientsView.tsx:407-412 | Filter by name/email | Partial (only the loaded page of 50) | COMM-021 |
| Select All | ClientsView.tsx:417-424 | Select all | Works (regular list) | – |
| Bulk Duplicate | ClientsView.tsx:430-437 | Duplicate selected | Broken (writes DB, UI never refreshes; loading flag stuck until fetch) | COMM-020 |
| Bulk Delete | ClientsView.tsx:438-445 | Delete selected | Broken (deleted clients stay on screen; no error check) | COMM-020 |
| Exit Selection | ClientsView.tsx:450-457 | Leave selection mode | Works | – |
| Card click | ClientsView.tsx:477 | Open details / toggle selection | Works | – |
| Green "signed" badge | ClientsView.tsx:496-507 | Show newly signed docs, mark seen | **Broken - destroys document data** | COMM-001 |
| Portal (copy link) | ClientsView.tsx:540-549 | Copy portal URL | Works (link itself leaks data, see COMM-002/009) | COMM-002, COMM-009, COMM-011 |
| Get Approval | ClientsView.tsx:550-558 | Open approval-link modal | Works | – |
| Menu: Select | ClientsView.tsx:573-578 | Enter selection mode | Works | – |
| Menu: Delete Client | ClientsView.tsx:579-585 | Delete with confirm | Partial (errors ignored; misleading confirm text) | COMM-022, COMM-040 |
| Load more clients | ClientsView.tsx:593-599 | Pagination | Works | – |
| Add modal: Add Client | ClientsView.tsx:617 | Insert client | Partial (modal closes and input lost even if insert fails or limit hit) | COMM-022 |
| Add modal: Cancel | ClientsView.tsx:616 | Close | Works | – |
| Approval modal: Copy Link | ClientsView.tsx:654-662 | Copy approval URL | Works for docs loaded via `loadDocumentsForClient` (also offered for already-Accepted docs) | COMM-012 |
| Approval modal: Close | ClientsView.tsx:674 | Close | Works | – |
| Signed docs modal: Close | ClientsView.tsx:734 | Close | Works | – |
| Temp modal: Select All | ClientsView.tsx:747-754 | Select all temp clients | Broken (uses empty `localClients`) | COMM-020 |
| Temp modal: Delete / Duplicate | ClientsView.tsx:757-758 | Bulk ops | Broken (same as bulk ops) | COMM-020 |
| Temp modal: Exit / search / Close | ClientsView.tsx:761, 771, 846 | – | Works (search box shares state with main search) | – |
| Temp card: Select / Delete | ClientsView.tsx:811-823 | – | Works / Partial (as above) | COMM-022 |
| Temp card: Convert to Regular | ClientsView.tsx:832-834 | Strip `[TEMPORARY]` | Works (via `App.handleUpdateClient`, no error check) | COMM-022 |
| Temp card: View Details | ClientsView.tsx:835-837 | Open details | Partial (skips `onLoadClientDocuments`, so history incomplete) | COMM-021 |
| History modal: Close | ClientsView.tsx:903 | Close | Works | – |
| Edit client | – | Edit name/email/phone/address | **Missing** (no UI anywhere) | COMM-021 |
| Import clients (CSV) | – | Bulk import | **Missing** (only AI array prefill `ClientsView.tsx:132-142`) | COMM-021 |
| ClientDetails Back | ClientDetails.tsx:134-140 | Back to list | Works | – |
| ClientDetails Get Approval | ClientDetails.tsx:141-146 | Approval links | **Dead** (`alert("...coming soon...")`) | COMM-021 |
| ClientDetails Portal Link | ClientDetails.tsx:147-155 | Copy portal URL | Works | – |
| ClientDetails tabs | ClientDetails.tsx:244-246 | Switch tab | Works | – |
| Timeline / project / document rows | ClientDetails.tsx:270-271, 303-306, 346-349 | Navigate | Works (history matched by name only) | COMM-011 |

### 2.4 Sharing / public pages

| Control | file:line | Intended behavior | Actual status | Issue ref |
|---|---|---|---|---|
| Invoice "Share" | InvoiceForm.tsx:898 | Save + share modal | Partial (saves again - for an unsaved invoice each click inserts a new row, see COMM-025) | COMM-025, COMM-032 |
| ShareModal X / backdrop | ShareModal.tsx:99, 92 | Close | Works | – |
| ShareModal Copy Text | ShareModal.tsx:132 | Copy | Works | – |
| ShareModal Open Email App | ShareModal.tsx:135 | mailto | Partial (no attachment, no link, empty To, wrong total) | COMM-032, COMM-024 |
| Estimate "Get approval link" | EstimateForm.tsx:300-311 | Copy approval URL | Broken for new documents | COMM-025 |
| Portal "Go Home" (error) | PortalView.tsx:88 | Navigate `/` | Works | – |
| Portal tabs | PortalView.tsx:198-210 | Filter docs | Works | – |
| Portal "Review & Sign" | PortalView.tsx:271 | Open signing modal | Partial (signature from a previous cancelled modal is reused) | COMM-030 |
| Portal "Submit Signature" | PortalView.tsx:157 | Sign | Broken semantics (writes contractor field; no ownership check) | COMM-008, COMM-029 |
| Portal signing Cancel / backdrop | PortalView.tsx:156, 144 | Close | Partial (does not reset signature) | COMM-030 |
| Portal "Download" | PortalView.tsx:275 | PDF download | Partial (wrong argument shapes: no company name/logo/job name) | COMM-023 |
| Approval SignaturePad | DocumentApprovalView.tsx:183 | Draw signature | Works | – |
| Approval "Approve & Sign" | DocumentApprovalView.tsx:191-198 | Sign | Partial (re-sign allowed, total wrong, `result.error` ignored) | COMM-012, COMM-024, COMM-029 |

---

## 3. Issues

### COMM-001 — "Signed" badge overwrites whole documents with metadata stubs (data loss, documents become unopenable)
- **Severity:** Critical  **Status:** CONFIRMED
- **Location:** `App.tsx:1015-1042` (`markDocumentsAsViewed`), triggered from `ClientsView.tsx:496-503`; data shape from `App.tsx:90-107`, `1614-1627`.
- **What's wrong:** `forms` holds lightweight rows whose `data` is `{title,status,clientName,clientSignatureUrl,viewedByProvider,isAiGenerated,__lightweight:true}`. `markDocumentsAsViewed` writes `{ ...doc.data, viewedByProvider: true }` back as the **entire** `documents.data` column. Line items, terms, notes, totals, contractor signature and everything else are erased. It also persists `__lightweight: true`, so `isLightweightDocument()` stays true forever: `renderForm` (`App.tsx:2986-2997`) shows "Loading document..." permanently.
- **Repro / impact:** Client signs an estimate -> contractor opens Clients -> clicks the green bouncing badge on the client avatar. Every Accepted/signed document of that client (estimates, change orders and any other doc with `status === 'Accepted'`) is wiped and can no longer be opened.
- **Root cause:** Read-modify-write of a JSONB column using a partial in-memory copy.
- **Fix:** Never write `data` from lightweight copies. Patch the single key server-side.

```sql
-- supabase/migrations/2026xxxx_mark_documents_viewed.sql
create or replace function public.mark_documents_viewed(p_doc_ids uuid[])
returns void
language sql
security invoker              -- RLS on documents still applies
set search_path = public
as $$
  update public.documents
     set data = data || jsonb_build_object('viewedByProvider', true)
   where id = any(p_doc_ids)
     and user_id = auth.uid();
$$;
grant execute on function public.mark_documents_viewed(uuid[]) to authenticated;

-- One-off repair: find already-damaged rows (data cannot be recovered except from backups / IndexedDB caches)
select id, type, created_at from public.documents where data ? '__lightweight';
update public.documents set data = data - '__lightweight' where data ? '__lightweight';
```

```ts
// App.tsx  (replace lines 1015-1042)
const markDocumentsAsViewed = async (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client || !session) return;
    const ids = forms
        .filter(f => {
            const d = f.data as any;
            return d.clientName === client.name && (d.status === 'Accepted' || d.clientSignatureUrl) && !d.viewedByProvider;
        })
        .map(f => f.id);
    if (ids.length === 0) return;

    const { error } = await supabase.rpc('mark_documents_viewed', { p_doc_ids: ids });
    if (error) { console.error('mark_documents_viewed failed', error); return; }

    setForms(prev => prev.map(f => ids.includes(f.id)
        ? { ...f, data: { ...(f.data as any), viewedByProvider: true } }
        : f));
};
```

Defense in depth in `handleSaveForm` (`App.tsx:2093`): strip the flag and refuse to save a stub.

```ts
const { __lightweight, ...cleanFormData } = formData as any;
if (__lightweight) { alert('Document is still loading; please retry.'); return; }
const dataToSave = { ...cleanFormData, /* existing isAiGenerated logic */ };
```

---

### COMM-002 — App.tsx portal/approval RPCs return the contractor's full `profiles` row (Gmail tokens), client private notes and raw documents to anonymous visitors
- **Severity:** Critical  **Status:** CONFIRMED in code (live impact depends on whether the `App.tsx` `SQL_SETUP_SCRIPT` version of the functions is the one deployed; see COMM-028)
- **Location:** `App.tsx:300-318` (`get_portal_data`: `row_to_json(c)`, `row_to_json(p)`, `json_agg(d)`), `App.tsx:413-418` (`get_document_by_token`: `row_to_json(v_doc)`, `row_to_json(p)`).
- **What's wrong:** `row_to_json(p)` on `profiles` includes `gmail_access_token`, `gmail_refresh_token`, `email`, `phone`, `address`, `subscription_tier`, `email_usage`, `email_templates`. `row_to_json(c)` includes the client's internal `notes`, `user_id`, `portal_key`. `json_agg(d)` includes `user_id`, `public_token` of every document and the full `data` (internal costs, see COMM-009).
- **Repro / impact:** Anyone holding a portal link (the client, or anyone the client forwards it to) opens DevTools -> Network -> `rpc/get_portal_data` response and reads the contractor's Google tokens and private notes about the client.
- **Root cause:** `SECURITY DEFINER` functions serializing whole rows.
- **Fix:** Delete the RPC definitions from `App.tsx` `SQL_SETUP_SCRIPT` (keep a single migration file) and deploy whitelisted versions. Full replacement (also fixes COMM-008, COMM-009, COMM-012, COMM-029):

```sql
-- supabase/migrations/2026xxxx_portal_rpcs.sql

-- Strip internal fields from a document JSON before it leaves the database
create or replace function public.client_safe_doc_data(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select (p - 'viewedByProvider' - 'isAiGenerated' - '__lightweight' - 'deductInventory')
         || case when p ? 'lineItems' then jsonb_build_object('lineItems', coalesce((
              select jsonb_agg(li - 'unitCost' - 'currentStock' - 'inventoryItemId'
                                  - 'item_id' - 'track_inventory' - 'itemSource')
              from jsonb_array_elements(p->'lineItems') li), '[]'::jsonb))
            else '{}'::jsonb end;
$$;

drop function if exists public.get_portal_data(text);
create function public.get_portal_data(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_contractor jsonb;
  v_documents jsonb;
begin
  if p_key is null or length(p_key) <> 32 then
    raise exception 'Invalid portal key' using errcode = '28000';
  end if;

  select * into v_client from public.clients where portal_key = p_key;
  if not found then
    raise exception 'Invalid portal key' using errcode = '28000';
  end if;

  select jsonb_build_object('company_name', company_name, 'logo_url', logo_url,
                            'phone', phone, 'email', email, 'website', website, 'address', address)
    into v_contractor
    from public.profiles where id = v_client.user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'type', d.type, 'created_at', d.created_at,
           'data', public.client_safe_doc_data(d.data))
           order by d.created_at desc), '[]'::jsonb)
    into v_documents
    from public.documents d
    join public.jobs j on j.id = d.job_id
   where d.user_id = v_client.user_id
     and coalesce(d.data->>'clientName', j.client_name) = v_client.name   -- replace with client_id once COMM-011 lands
     and d.type in ('Invoice', 'Estimate', 'Change Order', 'Daily Job Report', 'Warranty')
     and coalesce(d.data->>'status', 'Draft') <> 'Draft';

  return jsonb_build_object(
    'client', jsonb_build_object('name', v_client.name),
    'contractor', v_contractor,
    'documents', v_documents);
end;
$$;

drop function if exists public.sign_document_via_portal(text, uuid, text);
create function public.sign_document_via_portal(p_key text, p_doc_id uuid, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_doc public.documents%rowtype;
begin
  select * into v_client from public.clients where portal_key = p_key;
  if not found then raise exception 'Invalid portal key' using errcode = '28000'; end if;

  if p_signature is null or p_signature !~ '^data:image/png;base64,' or length(p_signature) > 300000 then
    raise exception 'Invalid signature';
  end if;

  select d.* into v_doc
    from public.documents d
    join public.jobs j on j.id = d.job_id
   where d.id = p_doc_id
     and d.user_id = v_client.user_id                                   -- same contractor
     and coalesce(d.data->>'clientName', j.client_name) = v_client.name  -- same client
     and d.type in ('Estimate', 'Change Order')
   for update of d;
  if not found then raise exception 'Document not found'; end if;

  if v_doc.data->>'status' in ('Accepted', 'Rejected') then
    raise exception 'Document already %', lower(v_doc.data->>'status');
  end if;
  if (v_doc.data->>'expiryDate') ~ '^\d{4}-\d{2}-\d{2}' and (v_doc.data->>'expiryDate')::date < current_date then
    raise exception 'This estimate has expired';
  end if;

  update public.documents
     set data = data || jsonb_build_object(
           'clientSignatureUrl', p_signature,
           'status', 'Accepted',
           'clientSignedAt', now()::text,
           'clientSignedBy', v_client.name,
           'viewedByProvider', false)
   where id = v_doc.id;

  return jsonb_build_object('success', true);
end;
$$;

drop function if exists public.get_document_by_token(uuid);
create function public.get_document_by_token(doc_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_contractor jsonb;
begin
  select * into v_doc from public.documents where public_token = doc_token;
  if not found or v_doc.type not in ('Estimate', 'Change Order') then
    raise exception 'Invalid or expired approval link' using errcode = '28000';
  end if;

  select jsonb_build_object('company_name', company_name, 'logo_url', logo_url,
                            'phone', phone, 'email', email, 'website', website)
    into v_contractor from public.profiles where id = v_doc.user_id;

  return jsonb_build_object(
    'document', jsonb_build_object('id', v_doc.id, 'type', v_doc.type,
                                   'data', public.client_safe_doc_data(v_doc.data),
                                   'created_at', v_doc.created_at),
    'contractor', v_contractor);
end;
$$;

drop function if exists public.approve_document_by_token(uuid, text);
create function public.approve_document_by_token(doc_token uuid, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
begin
  if p_signature is null or p_signature !~ '^data:image/png;base64,' or length(p_signature) > 300000 then
    raise exception 'Invalid signature';
  end if;

  select * into v_doc from public.documents where public_token = doc_token for update;
  if not found or v_doc.type not in ('Estimate', 'Change Order') then
    raise exception 'Invalid approval token' using errcode = '28000';
  end if;
  if v_doc.data->>'status' in ('Accepted', 'Rejected') then
    raise exception 'Document already %', lower(v_doc.data->>'status');
  end if;

  update public.documents
     set data = data || jsonb_build_object(
           'clientSignatureUrl', p_signature,
           'status', 'Accepted',
           'clientSignedAt', now()::text,
           'clientSignedBy', coalesce(v_doc.data->>'clientName', 'Client'),
           'viewedByProvider', false)
   where id = v_doc.id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.get_portal_data(text), public.sign_document_via_portal(text, uuid, text),
                       public.get_document_by_token(uuid), public.approve_document_by_token(uuid, text)
  from public;
grant execute on function public.get_portal_data(text), public.sign_document_via_portal(text, uuid, text),
                          public.get_document_by_token(uuid), public.approve_document_by_token(uuid, text)
  to anon, authenticated;
```

Then drop the legacy columns (also COMM-003): `alter table public.profiles drop column if exists gmail_access_token, drop column if exists gmail_refresh_token;` and remove them from `App.tsx:1470` and `App.tsx:1512-1529`.

---

### COMM-003 — Any signed-in user can read every contractor's profile (PII and legacy Gmail tokens)
- **Severity:** Critical  **Status:** CONFIRMED in code (policy is part of the setup script shown to users; verify in the dashboard with `select * from pg_policies where tablename='profiles'`)
- **Location:** `App.tsx:171-172` (`create policy "Users can view all profiles" ... for select to authenticated using (true)`), columns `App.tsx:132-133`.
- **What's wrong:** A free account plus the public anon key (`App.tsx:70`) is enough to run `supabase.from('profiles').select('*')` and dump every contractor's email, phone, address, `subscription_tier`, `email_templates` and any legacy `gmail_access_token` / `gmail_refresh_token` values.
- **Root cause:** Over-broad policy (probably added so the forum can show author names).
- **Fix:**

```sql
drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- Narrow public projection for forum/author display (owner-rights view bypasses RLS on purpose)
create or replace view public.public_profiles as
  select id, name, company_name, profile_picture_url from public.profiles;
grant select on public.public_profiles to authenticated;

alter table public.profiles drop column if exists gmail_access_token;
alter table public.profiles drop column if exists gmail_refresh_token;

-- Stop users from editing their own quota / tier (see COMM-037)
revoke update on public.profiles from authenticated;
grant update (id, name, company_name, logo_url, profile_picture_url, address, phone, website,
              job_title, language, email_templates, theme, updated_at, email)
  on public.profiles to authenticated;   -- `id` is needed because handleSaveProfile uses upsert (App.tsx:2020); RLS still pins it to auth.uid()
```

Update the forum code (other audit area) to read `public_profiles` for other users' names. Apply the column grant only together with COMM-037: after it, `handleEmailSent` (`App.tsx:2033`) and the monthly reset (`App.tsx:1490-1493`) must call `consume_email_quota` instead of updating `email_usage` directly, and `subscription_tier` can only be changed by the PayPal webhook (service role).

---

### COMM-004 — Two incompatible `user_gmail_accounts` schemas; the App.tsx one breaks linking and has no RLS
- **Severity:** High (Critical if the App.tsx variant is what exists in the database)  **Status:** CONFIRMED in code
- **Location:** `App.tsx:384-394` vs `create_user_gmail_accounts.sql:3-31`; consumers `supabase/functions/gmail-auth/index.ts:79,89,107-110`, `CommunicationView.tsx:64-67,89-93`, `batchEmailSender.ts:36-42`.
- **What's wrong:** `App.tsx` creates `user_gmail_accounts(email, access_token, refresh_token, profile_picture, unique(user_id,email))` with **no `enable row level security` and no policies**. Every consumer uses `gmail_address` and `onConflict: 'user_id,gmail_address'`. Both use `create table if not exists`, so whichever ran first wins.
- **Repro / impact:** If the App.tsx script ran first: every exchange fails with `column "gmail_address" does not exist`, the account list is always empty, and (because RLS is off and Supabase grants table access to `anon`) anyone with the anon key can `select * from user_gmail_accounts` and read all users' refresh/access tokens.
- **Fix:** Delete the block at `App.tsx:384-394`. Run this idempotent reconciliation once:

```sql
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='user_gmail_accounts' and column_name='email')
     and not exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='user_gmail_accounts' and column_name='gmail_address') then
    alter table public.user_gmail_accounts rename column email to gmail_address;
  end if;
end $$;

alter table public.user_gmail_accounts add column if not exists updated_at timestamptz default now();
alter table public.user_gmail_accounts add column if not exists needs_reconnect boolean not null default false;
alter table public.user_gmail_accounts add column if not exists granted_scopes text;
alter table public.user_gmail_accounts drop column if exists access_token;
alter table public.user_gmail_accounts enable row level security;

-- the browser may only list and delete its own accounts; tokens are never readable from the client
revoke all on public.user_gmail_accounts from anon, authenticated;
grant select (id, user_id, gmail_address, needs_reconnect, created_at, updated_at)
  on public.user_gmail_accounts to authenticated;
grant delete on public.user_gmail_accounts to authenticated;

drop policy if exists "Users can insert their own gmail accounts" on public.user_gmail_accounts;
drop policy if exists "Users can update their own gmail accounts" on public.user_gmail_accounts;
drop policy if exists "Users can view their own gmail accounts" on public.user_gmail_accounts;
drop policy if exists "Users can delete their own gmail accounts" on public.user_gmail_accounts;
create policy "own gmail accounts select" on public.user_gmail_accounts for select to authenticated using (auth.uid() = user_id);
create policy "own gmail accounts delete" on public.user_gmail_accounts for delete to authenticated using (auth.uid() = user_id);

create unique index if not exists user_gmail_accounts_user_addr on public.user_gmail_accounts(user_id, gmail_address);
```

Inserts/updates are then done only by the edge function with the service role.

---

### COMM-005 — OAuth requests only `gmail.send`, but the edge function needs the user's email: linking fails
- **Severity:** High  **Status:** CONFIRMED
- **Location:** `App.tsx:1917` (`SCOPE = 'https://www.googleapis.com/auth/gmail.send'`), `supabase/functions/gmail-auth/index.ts:65-79`, `services/gmailService.ts:64-90` (`getGmailProfile` would also fail: `users/me/profile` needs a read/compose/metadata scope).
- **What's wrong:** `GET https://www.googleapis.com/oauth2/v2/userinfo` requires `openid`/`email` (`userinfo.email`). With a `gmail.send`-only token Google rejects the call (401/403) or returns no `email`; the function then throws `Failed to fetch Google profile: ...`, or, if a body without `email` comes back, the upsert hits `null value in column "gmail_address"`. Also, Google's granular consent lets users untick the Gmail checkbox; the returned `scope` is never checked, so the account is "linked" but every send returns 403.
- **Repro / impact:** Connect Gmail -> Google consent -> callback page shows an error and no account appears. This matches the repeated "Gmail improvments" commits.
- **Fix:** Request `openid email` together with `gmail.send`, read the address from the `id_token` (or OIDC userinfo), and verify the granted scopes. See the full edge function in COMM-006 (it also builds the URL server-side).

```diff
- const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
+ const SCOPE = 'openid email https://www.googleapis.com/auth/gmail.send';
```

```ts
// gmail-auth: after the token exchange
if (!String(tokens.scope ?? '').split(' ').includes('https://www.googleapis.com/auth/gmail.send')) {
  return json({ error: 'Please tick "Send email on your behalf" on the Google consent screen.', code: 'SCOPE_MISSING' }, 400);
}
const idPayload = JSON.parse(new TextDecoder().decode(fromB64url(tokens.id_token.split('.')[1])));
if (!idPayload.email || idPayload.email_verified === false) return json({ error: 'Google did not return a verified email' }, 400);
const email = String(idPayload.email).toLowerCase();
```

(The `id_token` comes straight from Google's token endpoint over TLS, so reading its claims without verifying the signature is acceptable per OIDC Core 3.1.3.7.)

---

### COMM-006 — No OAuth `state` parameter: CSRF lets an attacker link their Gmail to a victim's account
- **Severity:** High  **Status:** CONFIRMED
- **Location:** `App.tsx:1919-1930` (no `state`), `GmailCallback.tsx:26-57` (no check), `gmail-auth/index.ts:37-62` (no binding).
- **What's wrong:** The callback exchanges any `code` it receives for the signed-in user. An attacker completes the Google flow with their own Gmail, stops before the redirect, and sends the victim `https://<app>/gmail-callback?code=<attacker_code>`. The victim's app links the attacker's mailbox, so invoices/estimates the victim later sends go out from (and are stored in "Sent" of) the attacker's Gmail, with client emails and PDFs.
- **Fix:** Generate the auth URL in the edge function with an HMAC-signed, user-bound, expiring `state`, and verify it on exchange. Complete replacement for `supabase/functions/gmail-auth/index.ts` (also fixes COMM-005, COMM-010, COMM-018, COMM-035):

```ts
// supabase/functions/gmail-auth/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const GMAIL_SEND = 'https://www.googleapis.com/auth/gmail.send';
const SCOPES = ['openid', 'email', GMAIL_SEND].join(' ');
const ALLOWED_REDIRECTS = (Deno.env.get('GMAIL_REDIRECT_URIS') ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);           // e.g. https://app.example.com/gmail-callback,http://localhost:3000/gmail-callback

const te = new TextEncoder();
const td = new TextDecoder();
const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(p), c => c.charCodeAt(0));
};

// ---- signed state ----
const hmacKey = () => crypto.subtle.importKey('raw', te.encode(Deno.env.get('OAUTH_STATE_SECRET')!),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
async function signState(userId: string, redirectUri: string) {
  const payload = b64url(te.encode(JSON.stringify({ u: userId, r: redirectUri, n: crypto.randomUUID(), e: Date.now() + 10 * 60_000 })));
  const sig = b64url(await crypto.subtle.sign('HMAC', await hmacKey(), te.encode(payload)));
  return `${payload}.${sig}`;
}
async function verifyState(state: string, userId: string): Promise<{ r: string } | null> {
  const [payload, sig] = (state ?? '').split('.');
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), te.encode(payload));
  if (!ok) return null;
  const data = JSON.parse(td.decode(fromB64url(payload)));
  return data.u === userId && Date.now() < data.e ? data : null;
}

// ---- token encryption (AES-256-GCM, key = 32 random bytes, base64url, in TOKEN_ENCRYPTION_KEY) ----
const aesKey = () => crypto.subtle.importKey('raw', fromB64url(Deno.env.get('TOKEN_ENCRYPTION_KEY')!), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), te.encode(plain));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}
async function decrypt(blob: string) {
  if (!blob.startsWith('v1.')) return blob;                  // legacy plaintext rows; re-encrypted on next refresh
  const [, iv, ct] = blob.split('.');
  return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(), fromB64url(ct)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim();
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();
  if (!clientId || !clientSecret) return json({ error: 'Gmail integration is not configured', code: 'NOT_CONFIGURED' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { action } = body ?? {};

  try {
    if (action === 'start') {
      const redirectUri = String(body.redirect_uri ?? '');
      if (!ALLOWED_REDIRECTS.includes(redirectUri)) return json({ error: `redirect_uri not allowed: ${redirectUri}` }, 400);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES,
        access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true',
        state: await signState(user.id, redirectUri),
      }).toString();
      return json({ url: url.toString() });
    }

    if (action === 'exchange') {
      const st = await verifyState(String(body.state ?? ''), user.id);
      if (!st) return json({ error: 'Invalid or expired OAuth state. Please try connecting again.', code: 'BAD_STATE' }, 400);
      if (!body.code) return json({ error: 'Authorization code is required' }, 400);

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: body.code, client_id: clientId, client_secret: clientSecret,
                                    redirect_uri: st.r, grant_type: 'authorization_code' }),
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok || tokens.error) {
        console.error('token exchange failed', tokens.error, tokens.error_description);
        return json({ error: `Google rejected the authorization (${tokens.error ?? tokenRes.status})`, code: 'EXCHANGE_FAILED' }, 400);
      }
      if (!String(tokens.scope ?? '').split(' ').includes(GMAIL_SEND)) {
        return json({ error: 'Please allow "Send email on your behalf" on the Google consent screen.', code: 'SCOPE_MISSING' }, 400);
      }
      const claims = JSON.parse(td.decode(fromB64url(String(tokens.id_token).split('.')[1])));
      const email = String(claims.email ?? '').toLowerCase();
      if (!email || claims.email_verified === false) return json({ error: 'Google did not return a verified email' }, 400);

      const row: Record<string, unknown> = {
        user_id: user.id, gmail_address: email, granted_scopes: tokens.scope,
        needs_reconnect: false, updated_at: new Date().toISOString(),
      };
      if (tokens.refresh_token) {
        row.refresh_token = await encrypt(tokens.refresh_token);
      } else {
        const { data: existing } = await admin.from('user_gmail_accounts').select('id')
          .eq('user_id', user.id).eq('gmail_address', email).maybeSingle();
        if (!existing) {
          return json({ error: 'Google did not issue a refresh token. Remove "ContractorDocs" at myaccount.google.com/permissions and connect again.', code: 'NO_REFRESH_TOKEN' }, 400);
        }
      }
      const { error } = await admin.from('user_gmail_accounts').upsert(row, { onConflict: 'user_id,gmail_address' });
      if (error) throw error;
      return json({ success: true, email });
    }

    if (action === 'refresh') {
      const address = String(body.gmail_address ?? '').toLowerCase();
      const { data: acc } = await admin.from('user_gmail_accounts').select('id, refresh_token')
        .eq('user_id', user.id).eq('gmail_address', address).maybeSingle();
      if (!acc) return json({ error: 'Gmail account not linked', code: 'NOT_LINKED' }, 404);

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
                                    refresh_token: await decrypt(acc.refresh_token), grant_type: 'refresh_token' }),
      });
      const t = await res.json();
      if (t.error === 'invalid_grant') {
        await admin.from('user_gmail_accounts').update({ needs_reconnect: true }).eq('id', acc.id);
        return json({ error: 'Google access was revoked or expired. Please reconnect this account.', code: 'RECONNECT_REQUIRED' }, 409);
      }
      if (!res.ok || t.error) return json({ error: `Google refresh failed (${t.error ?? res.status})`, code: 'REFRESH_FAILED' }, 502);
      if (!acc.refresh_token.startsWith('v1.')) {   // opportunistic re-encryption of legacy plaintext rows
        await admin.from('user_gmail_accounts').update({ refresh_token: await encrypt(await decrypt(acc.refresh_token)) }).eq('id', acc.id);
      }
      return json({ access_token: t.access_token, expires_in: t.expires_in });
    }

    if (action === 'disconnect') {
      const address = String(body.gmail_address ?? '').toLowerCase();
      const { data: acc } = await admin.from('user_gmail_accounts').select('id, refresh_token')
        .eq('user_id', user.id).eq('gmail_address', address).maybeSingle();
      if (acc) {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: await decrypt(acc.refresh_token) }),
        }).catch(() => {});
        await admin.from('user_gmail_accounts').delete().eq('id', acc.id);
      }
      return json({ success: true });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (e) {
    console.error('gmail-auth', e);
    return json({ error: 'Internal error' }, 500);
  }
});
```

Client side:

```ts
// App.tsx: replace handleConnectGmail (1913-1931)
const handleConnectGmail = async () => {
    const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'start', redirect_uri: `${window.location.origin}/gmail-callback` },
    });
    if (error || !data?.url) { alert('Could not start Google authorization. Please try again.'); return; }
    window.location.assign(data.url);
};
```

```ts
// GmailCallback.tsx: inside exchangeCode()
const state = params.get('state');
if (!state) { setStatus('error'); setMessage('Missing OAuth state. Please start again from the Communication page.'); return; }
window.history.replaceState({}, document.title, '/gmail-callback');   // drop code from the URL immediately
const { data, error: functionError } = await supabase.functions.invoke('gmail-auth', {
    body: { action: 'exchange', code, state },
});
```

---

### COMM-007 — Email attachments are generated from metadata-only documents (crash or empty PDF); attachable list limited to 50 recent docs
- **Severity:** High  **Status:** CONFIRMED
- **Location:** `CommunicationView.tsx:340-358` (`generateDocumentBase64(doc.type, doc.data, profile, job!)`), `CommunicationView.tsx:110-119` (doc list); `services/batchEmailSender.ts:68-90`; data shape `App.tsx:90-107`, `App.tsx:1614-1627`; PDF code `services/pdfGenerator.ts:585,619,737`.
- **What's wrong:** `forms` entries are lightweight (`lineItems` absent). `generateInvoicePDF` does `invoice.lineItems.map(...)` -> `TypeError: Cannot read properties of undefined (reading 'map')`; the email fails with that message. Docs the user opened earlier are hydrated and work, which makes the bug look random. `job!` can also be `undefined`. The attachable list only covers docs among the 50 most recent loaded rows and matches `data.clientName` only (docs whose job has the client but whose `clientName` is blank are missed).
- **Fix:** Fetch full documents right before generating PDFs, shared by both senders.

```ts
// services/documentLoader.ts (new)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormData, Job } from '../types.ts';

export async function fetchFullDocument(supabase: SupabaseClient, id: string): Promise<FormData> {
    const { data, error } = await supabase.from('documents').select('id, job_id, type, data, created_at').eq('id', id).single();
    if (error || !data) throw new Error(`Could not load document ${id.slice(0, 8)} for attachment`);
    return { ...data, jobId: data.job_id, createdAt: data.created_at } as unknown as FormData;
}
export async function fetchJob(supabase: SupabaseClient, id: string): Promise<Job> {
    const { data, error } = await supabase.from('jobs').select('*').eq('id', id).single();
    if (error || !data) throw new Error('Could not load the job for this document');
    return { ...data, startDate: data.start_date, endDate: data.end_date, clientName: data.client_name,
             clientAddress: data.client_address, userId: data.user_id } as Job;
}
```

```ts
// CommunicationView.tsx handleSendEmail (replace 340-358)
for (const docId of selectedDocIds) {
    const full = await fetchFullDocument(supabase, docId);
    const job = jobs.find(j => j.id === full.jobId) ?? await fetchJob(supabase, full.jobId);
    const base64Data = await generateDocumentBase64(full.type, full.data, profile, job);
    if (!base64Data) throw new Error(`PDF generation failed for ${full.type}`);
    const d = full.data as any;
    attachments.push({ name: `${full.type}-${d.invoiceNumber || d.estimateNumber || d.poNumber || docId.slice(0, 6)}.pdf`,
                       data: base64Data, type: 'application/pdf' });
}
```

Apply the same change to `batchEmailSender.ts:74-87` (replace `ctx.forms.find` with `fetchFullDocument(ctx.supabase, docId)` and throw instead of silently `continue`). For the list, call the existing loader when a client is picked: pass `onLoadClientDocuments={loadDocumentsForClient}` from `App.tsx:3141` and in `CommunicationView` run `useEffect(() => { if (client) onLoadClientDocuments?.(client.name); }, [selectedClientId])`.

---

### COMM-008 — Portal signing: no check that the document belongs to the portal's client, and it overwrites the contractor's signature
- **Severity:** High  **Status:** CONFIRMED (both SQL versions)
- **Location:** `App.tsx:322-344`, `supabase_setup.sql:101-138`; caller `PortalView.tsx:45-66`; consumers `ClientsView.tsx:270-277` (expects `clientSignatureUrl`).
- **What's wrong:** After validating `p_key`, the function updates `documents where id = p_doc_id` with no `user_id`/client/type/status condition. Any holder of any portal link can mark any document of any tenant as Accepted and replace its `signatureUrl` (document UUIDs are random, so cross-tenant abuse needs a leaked id; same-contractor abuse needs only an id seen in emails/URLs/AI chats). It writes `signatureUrl` (the contractor's own signature, `types.ts:291`) instead of `clientSignatureUrl`, so the contractor's signature on the PDF is replaced by the client's, the green badge/Signed Documents modal (which require `clientSignatureUrl`) never show portal signatures, and no `clientSignedAt` is recorded.
- **Fix:** Use the `sign_document_via_portal` definition in COMM-002 (ownership + client + type + status + expiry checks, writes `clientSignatureUrl/clientSignedAt/clientSignedBy`, raises errors so `PortalView`'s `if (error)` path works).

---

### COMM-009 — Client portal and approval links expose internal documents and internal costs
- **Severity:** High  **Status:** CONFIRMED
- **Location:** `App.tsx:309-312` (all docs where `data->>clientName` matches), `supabase_setup.sql:74-85` (all docs of jobs whose `client_name` matches), `supabase_setup.sql:176-182` / `App.tsx:416-418` (full `data` in approval); client-side filtering only `PortalView.tsx:96-98`.
- **What's wrong:** The RPC response contains every document type (Expense Log, Purchase Order with supplier prices, Material Log, Time Sheet with worker hours, Notes, drafts) even though the UI only shows invoices/estimates/reports. Line items carry `unitCost` ("Internal cost for profit calculation", `types.ts:132`), `inventoryItemId`, `currentStock`. Approval links return the same raw `data`.
- **Repro / impact:** Client opens portal -> DevTools -> sees the contractor's costs and margins, private notes and draft documents.
- **Fix:** Server-side type/status filtering and `client_safe_doc_data()` as in COMM-002.

---

### COMM-010 — Gmail refresh tokens stored in plaintext and readable from the browser; other Google tokens in localStorage/IndexedDB
- **Severity:** High  **Status:** CONFIRMED
- **Location:** `gmail-auth/index.ts:83-85` (plaintext), `create_user_gmail_accounts.sql:17-19` (owner SELECT policy covers `refresh_token`), `App.tsx:1377,1404` (`localStorage.google_provider_token`), `App.tsx:1416-1424` (`user_credentials.access_token/refresh_token` plaintext), `App.tsx:1512-1534` (tokens copied into `UserProfile` and cached in IndexedDB via `dbApi.put('profile', ...)`), `create_user_credentials.sql`.
- **What's wrong:** Any XSS (see COMM-017) can call `supabase.from('user_gmail_accounts').select('refresh_token')` and read long-lived tokens; DB backups/log exports hold them in clear. The legacy paths add more copies in places that XSS can read directly.
- **Fix:** Column privileges from COMM-004 (browser can no longer select `refresh_token`), AES-GCM encryption in the edge function (COMM-006), and remove the legacy plumbing (COMM-019). Then:

```sql
drop table if exists public.user_credentials;   -- after confirming nothing else reads it
```

---

### COMM-011 — Clients are linked to jobs/documents by **name string**: same-name clients share a portal; renames orphan history
- **Severity:** Medium  **Status:** CONFIRMED (design)
- **Location:** `ClientsView.tsx:270-276, 303-314, 349-354`, `CommunicationView.tsx:110-119`, `App.tsx:1015-1022, 1850-1858, 2284-2290`, `App.tsx:306-312`, `supabase_setup.sql:83-85`, `buildEmailBatch.ts:42-55`.
- **What's wrong:** No `client_id` column exists on `jobs`/`documents` (`App.tsx:203-228`). Two clients of the same contractor called "John Smith" see each other's invoices and can sign each other's estimates via their portal links. Correcting a client's name (once edit exists) detaches all history, approval lists and portal content.
- **Fix:** Add a real FK and backfill; switch every matcher to `client_id` with name as fallback.

```sql
alter table public.jobs add column if not exists client_id uuid references public.clients(id) on delete set null;
create index if not exists jobs_client_id_idx on public.jobs(client_id);
-- backfill only unambiguous names
update public.jobs j set client_id = c.id
  from public.clients c
 where j.client_id is null and c.user_id = j.user_id and c.name = j.client_name
   and (select count(*) from public.clients c2 where c2.user_id = j.user_id and c2.name = j.client_name) = 1;
```

Then in the portal RPC replace the name predicate with `j.client_id = v_client.id`, set `client_id` in `JobForm`/`handleNavigateToNewDoc` (`App.tsx:2302-2309`), and filter `jobs.filter(j => j.clientId === client.id || (!j.clientId && j.clientName === client.name))` in the UI.

---

### COMM-012 — Approval/sign flow has no state machine (re-sign, expired, wrong type, no reject, no audit, unbounded payload, permanent links)
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `supabase_setup.sql:195-233`, `App.tsx:423-446`, `DocumentApprovalView.tsx:41-57, 177-198`, `ClientsView.tsx:654-662` (link offered for already-Accepted docs).
- **What's wrong:** The approval page always shows the signature pad, even for Accepted docs; a new signature silently replaces the previous one. Any document type with a token (invoices, POs) can be "approved". Estimate `expiryDate` is ignored. There is no Reject button although `status: 'Rejected'` exists. `p_signature` is arbitrary text of any size written by anonymous callers into `documents.data`. Tokens never expire and cannot be rotated.
- **Fix:** SQL in COMM-002 (status/type/expiry checks, PNG data-URL validation, 300 KB cap). UI:

```tsx
// DocumentApprovalView.tsx after `const docData = doc.data;`
const alreadySigned = docData.status === 'Accepted' || !!docData.clientSignatureUrl;
if (alreadySigned) {
    return <div className="min-h-screen flex items-center justify-center p-4"><Card className="max-w-md w-full text-center p-8">
        <h2 className="text-xl font-bold mb-2">Already approved</h2>
        <p className="text-muted-foreground">Signed by {docData.clientSignedBy || 'the client'}{docData.clientSignedAt ? ` on ${new Date(docData.clientSignedAt).toLocaleString()}` : ''}.</p>
    </Card></div>;
}
```

Add a `reject_document_by_token(doc_token uuid, p_reason text)` RPC mirroring the approve one (sets `status='Rejected'`, `clientRejectedAt`, `clientRejectReason`) and a "Decline" button. To rotate links add `update documents set public_token = gen_random_uuid() where id = $1 and user_id = auth.uid()` behind a "Reset link" action; optionally add `public_token_expires_at`.

---

### COMM-013 — AI "auto send" in Communication never sends (stale closure) and the prefill effect keeps re-running
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `CommunicationView.tsx:146-208`.
- **What's wrong:** The effect schedules `handleSendEmail` from the render in which the effect ran. That closure has `gmailAccounts = []` (accounts are fetched asynchronously, `61-82`), `recipientEmail = ''`, `selectedDocIds = []`, so after 1 s it opens the "Connect Gmail" modal even for connected users. The effect depends on `clients, forms, jobs, profile.name`, so each forms reload re-applies the prefill (overwriting user edits) and re-arms the auto-send timer.
- **Fix:** Process the prefill once and turn auto-send into an explicit, state-driven step.

```tsx
const processedPrefill = React.useRef<string | null>(null);
const [autoSendRequested, setAutoSendRequested] = useState(false);
const [accountsLoaded, setAccountsLoaded] = useState(false);   // set true at the end of fetchAccounts

useEffect(() => {
    if (!prefillData) return;
    const key = JSON.stringify(prefillData);
    if (processedPrefill.current === key) return;
    processedPrefill.current = key;
    // ...existing client/doc/subject/body resolution (lines 152-198)...
    if (prefillData.auto_send) setAutoSendRequested(true);
}, [prefillData, clients, forms, jobs, profile.name]);

useEffect(() => {
    if (!autoSendRequested || !accountsLoaded || !recipientEmail || !subject) return;
    setAutoSendRequested(false);
    if (window.confirm(`Send "${subject}" to ${recipientEmail} now?`)) handleSendEmail();
}, [autoSendRequested, accountsLoaded, recipientEmail, subject]);
```

Also clear router state after consuming it: `navigate(location.pathname, { replace: true, state: null })` (in App) so a refresh does not replay it.

---

### COMM-014 — Selecting documents (or any forms reload) overwrites the subject/body the user typed or the AI drafted
- **Severity:** Medium  **Status:** CONFIRMED (regression versus `src/components/CommunicationView.tsx`, which depended on `[selectedDocId]` only)
- **Location:** `CommunicationView.tsx:134-143`, `221-256`.
- **What's wrong:** The effect depends on `forms`; `forms` changes whenever the app reloads documents (`loadDocumentsForJob`, `fetchData`, `markDocumentsAsViewed`). Each change re-applies the template, wiping edits. The AI prefill sets `selectedDocIds` and the body in the same tick; the effect then replaces the AI text.
- **Fix:** Apply the template from the toggle handler, and only when the user has not edited the text.

```tsx
const [userEdited, setUserEdited] = useState(false);
// in subject/body onChange: setUserEdited(true)
const toggleDoc = (docId: string) => {
    setSelectedDocIds(prev => {
        const next = prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId];
        const client = clients.find(c => c.id === selectedClientId);
        const docs = forms.filter(f => next.includes(f.id));
        if (!userEdited && client && docs.length) applyTemplate(docs, client);
        return next;
    });
};
// delete the useEffect at lines 134-143
```

---

### COMM-015 — MIME builder: non-ASCII headers not encoded, `7bit` declared for UTF-8, CR/LF header injection, unencoded filenames
- **Severity:** Medium  **Status:** CONFIRMED (spec violations); garbled output LIKELY for non-ASCII subjects
- **Location:** `services/gmailService.ts:92-149` and `:32`; same pattern in `master-ai-router/index.ts:89-126`.
- **What's wrong:**
  - `Subject: ${subject}` is raw UTF-8. RFC 5322 headers must be ASCII (RFC 2047 encoded-words for others). Accents, "ñ", emoji and the em dash that `buildEmailBatch.ts:88-91` itself puts in subjects ("Your Invoice — Company") can render as mojibake.
  - Text/HTML parts are declared `Content-Transfer-Encoding: 7bit` while carrying 8-bit UTF-8 and possibly lines longer than 998 octets.
  - `to`/`subject` are not stripped of `\r\n`. They come from AI output (`prefillData.subject`, batch `subject`, `recipient_email`), so a crafted prompt or document can inject `Bcc:` headers.
  - `filename="${attachment.name}"` breaks on quotes/non-ASCII; the fixed boundaries `foo_bar_baz`/`alt_boundary` are fragile.
  - `btoa(unescape(encodeURIComponent(...)))` relies on deprecated `unescape`.
- **Fix:** Replace `createMimeMessage` and the encoder.

```ts
// services/gmailService.ts
const utf8ToBase64 = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
};
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n');
const noCrlf = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
const encodeHeader = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8ToBase64(s)}?=`;
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

const createMimeMessage = (to: string, subject: string, body: string,
                           attachments?: { name: string; data: string; type: string }[], htmlBody?: string) => {
    const recipients = noCrlf(to).split(',').map(s => s.trim()).filter(Boolean);
    if (!recipients.length || !recipients.every(r => EMAIL_RE.test(r))) throw new Error(`Invalid recipient address: ${to}`);

    const mixed = `mixed_${crypto.randomUUID()}`;
    const alt = `alt_${crypto.randomUUID()}`;
    const nl = '\r\n';
    const part = (type: string, content: string) =>
        `Content-Type: ${type}; charset="UTF-8"${nl}Content-Transfer-Encoding: base64${nl}${nl}${wrap76(utf8ToBase64(content))}`;

    let m = `To: ${recipients.join(', ')}${nl}Subject: ${encodeHeader(noCrlf(subject))}${nl}MIME-Version: 1.0${nl}`;
    m += `Content-Type: multipart/mixed; boundary="${mixed}"${nl}${nl}--${mixed}${nl}`;
    if (htmlBody) {
        m += `Content-Type: multipart/alternative; boundary="${alt}"${nl}${nl}`;
        m += `--${alt}${nl}${part('text/plain', body)}${nl}--${alt}${nl}${part('text/html', htmlBody)}${nl}--${alt}--${nl}`;
    } else {
        m += `${part('text/plain', body)}${nl}`;
    }
    for (const a of attachments ?? []) {
        const b64 = (a.data.includes(',') ? a.data.split(',')[1] : a.data).replace(/\s+/g, '');
        const ascii = noCrlf(a.name).replace(/[^\x20-\x7e]|"/g, '_');
        m += `--${mixed}${nl}Content-Type: ${a.type}; name="${ascii}"${nl}`;
        m += `Content-Disposition: attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(noCrlf(a.name))}${nl}`;
        m += `Content-Transfer-Encoding: base64${nl}${nl}${wrap76(b64)}`;
    }
    return m + `--${mixed}--${nl}`;
};

// in sendGmail (line 32)
const raw = utf8ToBase64(mimeMessage).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
```

---

### COMM-016 — Batch sender ignores the selected account, falls back to a token without Gmail scope, bypasses the quota
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `services/batchEmailSender.ts:32-55, 95-148`; `src/hooks/useMasterAIRouter.ts:727-772`.
- **What's wrong:** Always uses `accounts[0]`; if refresh fails it silently uses `localStorage.google_provider_token` (the Supabase Google sign-in token, issued without `gmail.send` -> every send returns 403). Batch sends never call `onEmailSent`, so free users can send unlimited emails via the AI. Docs without a loaded job are skipped silently (`:78-79`), so the email goes out without the promised attachment.
- **Fix:**

```ts
async function getGmailAccessToken(supabase: SupabaseClient, session: Session, preferred?: string | null): Promise<string> {
    const { data: accounts, error } = await supabase.from('user_gmail_accounts')
        .select('gmail_address, needs_reconnect').eq('user_id', session.user.id);
    if (error) throw new Error(`Could not read linked Gmail accounts: ${error.message}`);
    const acc = accounts?.find(a => a.gmail_address === preferred) ?? accounts?.[0];
    if (!acc) throw new Error('GMAIL_NOT_CONNECTED: Connect Gmail in Communications to send emails.');
    const { data, error: fnErr } = await supabase.functions.invoke('gmail-auth', { body: { action: 'refresh', gmail_address: acc.gmail_address } });
    if (fnErr || !data?.access_token) throw new Error('GMAIL_AUTH_ERROR: Please reconnect ' + acc.gmail_address);
    return data.access_token;   // no localStorage fallback
}
```

Persist the chosen sender (`localStorage.setItem('gmail_sender', address)`, see COMM-039) and pass it in `BatchSendContext`. Add `onEmailSent?: (n: number) => Promise<void>` to the context, enforce `remaining = 10 - emailUsage` before sending, and call it with `results.sent`. Ideally move quota enforcement to a server RPC (COMM-037).

---

### COMM-017 — `dangerouslySetInnerHTML` on AI/client-derived email bodies (XSS in the app origin)
- **Severity:** Medium  **Status:** CONFIRMED (sink + unescaped sources)
- **Location:** `BatchEmailReviewCard.tsx:113-116`; sources `buildEmailBatch.ts:79-82, 162` (interpolates `client.name`, `companyName` raw) and LLM output from `master-ai-router` (`email_batch[].body_html`).
- **What's wrong:** A client named `<img src=x onerror=...>` (clients can be created by the AI from free text) or a prompt-injected LLM response executes script in the app's origin, where the Supabase session lives in localStorage and the client can call `user_gmail_accounts`/`gmail-auth refresh` for an access token.
- **Fix:** Escape on build and sanitize on render.

```ts
// utils/buildEmailBatch.ts
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// use ${esc(client.name)} and ${esc(companyName)} in buildThankYouBody and line 162
```

```tsx
// BatchEmailReviewCard.tsx (npm i dompurify)
import DOMPurify from 'dompurify';
<div className="..." dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html, { USE_PROFILES: { html: true } }) }} />
```

Also sanitize `body_html` with DOMPurify in `sendEmailBatch` before sending, so prompt-injected HTML (tracking pixels, phishing links) is reduced.

---

### COMM-018 — Send/refresh/disconnect errors are masked; expired/revoked accounts are never flagged; disconnect does not revoke
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `CommunicationView.tsx:363-370` (any edge error -> "authenticate with Google" -> connect modal), `CommunicationView.tsx:84-104` (delete result ignored, no revoke), `gmail-auth/index.ts:128` (invalid_grant indistinguishable), `gmailService.ts:45-47` (`response.json()` throws on non-JSON errors).
- **What's wrong:** Misconfiguration (`Google OAuth credentials not configured`), schema errors (COMM-004), network errors and true revocation all show the same "Connect Gmail" modal; reconnecting does not help, hence the endless "Gmail doesn't work" loop. Disconnect removes the DB row only; the grant stays active in the user's Google account.
- **Fix:** Use the `code` values returned by the new edge function (COMM-006):

```ts
const { data: authData, error: authError } = await supabase.functions.invoke('gmail-auth', { body: { action: 'refresh', gmail_address: selectedGmailAccount } });
if (authError) {
    let body: any = {};
    try { body = await (authError as any).context?.json(); } catch { /* ignore */ }
    if (body.code === 'RECONNECT_REQUIRED' || body.code === 'NOT_LINKED') { setShowConnectModal(true); return; }
    throw new Error(body.error || authError.message);
}

// disconnect
const handleDisconnectGmail = async (email?: string) => {
    const target = email || selectedGmailAccount;
    if (!target) return;
    const { error } = await supabase.functions.invoke('gmail-auth', { body: { action: 'disconnect', gmail_address: target } });
    if (error) { alert('Could not disconnect this account. Please try again.'); return; }
    setGmailAccounts(prev => prev.filter(a => a.gmail_address !== target));
    if (selectedGmailAccount === target) setSelectedGmailAccount(null);
};
```

In `sendGmail`, read the error body defensively: `const errorData = await response.json().catch(() => ({}));`. Show `needs_reconnect` accounts with a red "Reconnect" chip in the dropdown.

---

### COMM-019 — Legacy Google-token plumbing in App.tsx (localStorage, `user_credentials`, a profiles write that never runs)
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `App.tsx:1376-1378`, `1403-1425`, `1516-1529`, `1932-1953`, `1957`; `gmailService.ts:24,68`.
- **What's wrong:**
  - `supabase.from('profiles').update(tokenData).eq('id', ...)` at `App.tsx:1413` is never awaited/`.then`-ed. Supabase query builders are lazy thenables, so this request is never sent (dead code that looks like it works).
  - `fetchData()` at `App.tsx:1423` runs inside the `onAuthStateChange` closure created on mount, where `session` state is still `null`, so it returns immediately.
  - The Supabase Google sign-in token (no Gmail scope) is copied to localStorage and `user_credentials` in plaintext and used as a "fallback" sender token (`gmailService.ts:24`, `batchEmailSender.ts:51`), which always fails with 403 and hides the real error.
  - `App.handleDisconnectGmail` wipes `user_credentials` and the profile token columns whenever the user removes *any* linked Gmail account.
- **Fix:** Delete `App.tsx:1376-1378`, `1403-1425`, `1516-1529`, the `gmail_access_token, gmail_refresh_token` columns from the select at `App.tsx:1470`, `gmailAccessToken/gmailRefreshToken` from `types.ts:66-67`, the `localStorage` fallbacks in `gmailService.ts:24,68`, and reduce `handleDisconnectGmail` to a no-op callback (the edge function handles disconnect). Make `accessToken` a required parameter of `sendGmail`.

---

### COMM-020 — ClientsView bulk delete/duplicate do not refresh the visible list; "Select All" in Temporary modal does nothing
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `ClientsView.tsx:155-191` (`toggleSelectAll`, `handleBulkDelete`, `handleBulkDuplicate`), `ClientsView.tsx:88` (`activeClients = propClients || localClients`).
- **What's wrong:** App always passes `clients`, so `activeClients` is the App array. Bulk actions write to Supabase directly and then refresh `localClients`, which is never displayed: deleted clients stay on screen, duplicates do not appear, and App's IndexedDB cache stays stale. Errors are ignored. `toggleSelectAll(true)` builds its pool from `localClients` (empty), so in the Temporary modal "Select All" always clears the selection.
- **Fix:** Route through App callbacks and use `activeClients`.

```tsx
// props
onBulkDeleteClients?: (ids: string[]) => Promise<void>;
onBulkDuplicateClients?: (ids: string[]) => Promise<void>;

const toggleSelectAll = (isTemp = false) => {
    const pool = isTemp ? temporaryClients : regularClients;
    const allSelected = pool.length > 0 && pool.every(c => selectedClientIds.includes(c.id));
    setSelectedClientIds(allSelected ? [] : pool.map(c => c.id));
};
const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedClientIds.length} clients?`)) return;
    setLoading(true);
    try { await onBulkDeleteClients?.(selectedClientIds); setSelectedClientIds([]); setIsSelectionMode(false); }
    catch (e: any) { alert(`Delete failed: ${e.message}`); }
    finally { setLoading(false); }
};
```

```ts
// App.tsx
const handleBulkDeleteClients = async (ids: string[]) => {
    const { error } = await supabase.from('clients').delete().in('id', ids).eq('user_id', session!.user.id);
    if (error) throw error;
    setClients(prev => prev.filter(c => !ids.includes(c.id)));
    for (const id of ids) await dbApi.delete('clients', id);   // if dbApi exposes delete
};
```

---

### COMM-021 — Client management gaps: no edit, no import, dead "Get Approval" in details, search only over the loaded page
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `ClientDetails.tsx:141-146` (`alert("Get Approval feature coming soon to this view")`), no edit UI anywhere (`onUpdateClient` used only by "Convert to Regular", `ClientsView.tsx:258-267`), no CSV import, search `ClientsView.tsx:337-345` filters only `activeClients` (first 50 + "Load more"), `CommunicationView.tsx:545` likewise, "View Details" for temporary clients skips `onLoadClientDocuments` (`ClientsView.tsx:835`).
- **Fix (sketch):**
  - Reuse the Add modal as an Edit modal: add `editingClient` state, prefill `newClient`, and call `onUpdateClient({ id, name, email, phone, address, notes })` (send only editable columns, not `portal_key`/`created_at`). Once COMM-011 lands, renames are safe.
  - Wire ClientDetails "Get Approval" to the same approval modal: lift `openApprovalModal` into a prop `onGetApproval(client)`.
  - Server search: `supabase.from('clients').select(CLIENT_COLUMNS).eq('user_id', uid).or(`name.ilike.%${q}%,email.ilike.%${q}%`).limit(50)` debounced 300 ms when `hasMoreClients`.
  - Import: parse CSV client-side (Papa Parse), preview, then `insert` in chunks of 100 with `user_id`.

---

### COMM-022 — Client add/update/delete ignore Supabase errors; the Add modal closes and the input is lost
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `App.tsx:2148-2163`, `App.tsx:3090`, `ClientsView.tsx:209-231, 237-256`.
- **What's wrong:** `handleAddClient` never checks `error`, so offline/RLS/constraint failures look like success. When the free limit blocks (`checkLimit` false), `onAddClient` resolves and `ClientsView` still closes the modal and clears the form. Each mutation calls `fetchData()` (refetch of profile, jobs, 50 docs, clients, inventory...), which returns early if another fetch is in flight (`fetchingDataRef`, `App.tsx:1454`), so the new client may not appear. The fetch also resets `forms` to lightweight rows.
- **Fix:**

```ts
const handleAddClient = async (clientData: any) => {
    if (!session) throw new Error('Not signed in');
    const row = { id: crypto.randomUUID(), user_id: session.user.id, ...clientData };
    const { data, error } = await supabase.from('clients').insert(row).select(CLIENT_COLUMNS).single();
    if (error) throw error;
    setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    await dbApi.put('clients', data);
    return data;
};
// onAddClient={async (d) => { if (!checkLimit('clients')) throw new Error('LIMIT'); await handleAddClient(d); }}
```

```tsx
// ClientsView.handleAdd
try { await onAddClient!(newClient); setShowAddModal(false); setNewClient(EMPTY); }
catch (e: any) { if (e.message !== 'LIMIT') alert(`Failed to add client: ${e.message}`); }
finally { setLoading(false); }
```

Same pattern for update/delete (patch local state instead of `fetchData()`).

---

### COMM-023 — Portal PDF download passes wrongly shaped arguments (no company name/logo/job on client PDFs)
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `PortalView.tsx:102-117`; signatures `services/pdfGenerator.ts:529, 692, 1419` (`(profile: UserProfile, job: Job, data, templateId)`).
- **What's wrong:** `contractor` is a snake_case DB object (`company_name`, `logo_url`) passed as `UserProfile` (expects `companyName`, `logoUrl`); `commonProps` (`{clientName, ...doc.data}`) is passed as `Job`. Headers/logos fall back to empty values unless the document JSON carries its own `companyName`/`logoUrl`. Errors are swallowed into a generic alert.
- **Fix:**

```ts
const contractorProfile = {
    id: '', email: contractor.email || '', name: contractor.company_name || '',
    companyName: contractor.company_name || '', logoUrl: contractor.logo_url || '',
    address: contractor.address || '', phone: contractor.phone || '', website: contractor.website || '',
} as UserProfile;
const jobLike = { id: '', name: doc.data.projectName || doc.data.title || '', clientName: client.name,
                  clientAddress: doc.data.clientAddress || '', startDate: doc.created_at, status: 'active' } as unknown as Job;
// generateInvoicePDF(contractorProfile, jobLike, doc.data, doc.data.templateId || 'standard') etc.
```

---

### COMM-024 — Totals shown to clients ignore tax, discount, shipping and progress billing
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `PortalView.tsx:183-189, 229`, `DocumentApprovalView.tsx:80-82, 148, 155`, `ShareModal.tsx:68`, `CommunicationView.tsx:236-243, 302-309`; correct formula in `services/pdfGenerator.ts:619-634`.
- **What's wrong:** All of these use `Σ quantity × rate`. The PDF uses `subtotal (progress-aware) - discount + tax + shipping`. A client signs/approves or receives an email stating a different amount than the attached PDF. "Outstanding" also counts Draft and Cancelled invoices.
- **Fix:** One shared helper used everywhere:

```ts
// utils/documentTotals.ts
export function computeDocumentTotal(d: any): number {
    const items: any[] = Array.isArray(d?.lineItems) ? d.lineItems : [];
    const subtotal = items.reduce((acc, it) => {
        const line = Number(it.quantity || 0) * Number(it.rate || 0);
        return acc + (d.isProgressBilling ? line * (Number(it.percentComplete || 0) / 100) : line);
    }, 0);
    const discount = Number(d?.discount || 0);
    const taxable = subtotal - discount;
    const tax = taxable * (Number(d?.taxRate || 0) / 100);
    return items.length ? taxable + tax + Number(d?.shipping || 0) : Number(d?.amount || 0);
}
```

In `PortalView`, compute Outstanding over `['Sent', 'Overdue'].includes(i.data.status)` only.

---

### COMM-025 — Approval link unavailable for newly created estimates/change orders; repeated saves create duplicate documents
- **Severity:** Medium  **Status:** LIKELY (needs a click-through to confirm the exact UX)
- **Location:** `EstimateForm.tsx:300-311`, `ChangeOrderForm.tsx:~265-272`, `App.tsx:2101` (`id: view.formId || crypto.randomUUID()`), `App.tsx:2132` (`public_token` copied from the previous in-memory row, `undefined` for new docs), `App.tsx:1807` (reload keeps the non-lightweight in-memory copy without token), `InvoiceForm.tsx:898` (Share saves again).
- **What's wrong:** After the first save of a new document `view.formId` stays `null`, so `form`/`publicToken` remain undefined. "Get approval link" alerts "Please save first" and calls `onSave` again, which inserts **another** document with a new UUID. The same happens with Invoice "Save Only" followed by "Share".
- **Fix:** Return the saved row and move the view to it.

```ts
const { data: saved, error: saveError } = await supabase.from('documents')
    .upsert(formRecord).select(DOCUMENT_DETAIL_COLUMNS).single();
if (saveError) { /* existing alert */ return; }
const savedForm = mapDocumentRow(saved, true);         // includes the DB-generated public_token
setForms(prev => [savedForm, ...prev.filter(f => f.id !== savedForm.id)]);
if (!view.formId) setView({ ...view, formId: savedForm.id });   // subsequent saves update, not insert
```

and in `loadDocumentsForJob` (`App.tsx:1807`) merge the token: `existingById.set(doc.id, existing && !isLightweightDocument(existing) ? { ...existing, public_token: existing.public_token ?? doc.public_token } : doc)`.

---

### COMM-026 — Signed documents can be edited afterwards, and an open editor can overwrite the client's signature
- **Severity:** Medium  **Status:** LIKELY
- **Location:** `App.tsx:2089-2137` (`handleSaveForm` upserts the full `data` from the form state), `EstimateForm`/`ChangeOrderForm` (no read-only mode for Accepted docs).
- **What's wrong:** (a) A contractor can change line items of an Accepted estimate and the client's signature stays attached to the new content. (b) If the contractor has the estimate open while the client signs, the next save writes the editor's stale `data` (without `clientSignatureUrl`, status not Accepted), silently discarding the signature.
- **Fix:** Make signed docs read-only in the forms (show "Signed by X on Y - create a Change Order to modify"), and protect the DB:

```sql
create or replace function public.protect_client_signature()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.data ? 'clientSignatureUrl' and coalesce(old.data->>'clientSignatureUrl','') <> '' then
    if new.data->>'clientSignatureUrl' is distinct from old.data->>'clientSignatureUrl'
       or new.data->'lineItems' is distinct from old.data->'lineItems' then
      raise exception 'This document was signed by the client and can no longer be changed';
    end if;
  end if;
  return new;
end $$;
create trigger documents_protect_signature before update on public.documents
  for each row execute function public.protect_client_signature();
```

(Exempt the `viewedByProvider` patch: it only changes that key, so the trigger above lets it through.)

---

### COMM-027 — Google Cloud app configuration likely causes "Gmail stops working after a few days"
- **Severity:** Medium  **Status:** LIKELY (console settings are not in the repo)
- **Location:** Google Cloud console for client `292965678575-p8smva2vfeguocsppjr45r05jsvhggjo` (`App.tsx:1915`).
- **What's wrong:** `gmail.send` is a *sensitive* scope. While the OAuth consent screen is in "Testing", only listed test users can connect and Google expires refresh tokens after 7 days (`invalid_grant`), which the current code reports as "reconnect" with no explanation. In "Production" without verification users see the "Google hasn't verified this app" screen and the 100-user cap applies. The Gmail API must also be enabled in the project or sends fail with `accessNotConfigured` 403.
- **Fix:** See the checklist in section 4; publish the consent screen and submit for sensitive-scope verification (privacy policy URL already exists at `/privacy`).

---

### COMM-028 — Conflicting SQL definitions; setup script can abort halfway; definer functions without `search_path`
- **Severity:** Medium  **Status:** LIKELY
- **Location:** `App.tsx:281` / `322` / `397` / `423` (`CREATE OR REPLACE ... RETURNS json|void`) vs `supabase_setup.sql:28-29, 100-106, 145-150, 194-201` (`DROP` + `RETURNS jsonb`).
- **What's wrong:** If `supabase_setup.sql` was run first, running the App.tsx script later (it is shown to users by `DbSetupScreen` whenever a "does not exist"/"schema cache" error appears, `App.tsx:1475-1477`, `1646-1647`, `3152`) fails at `CREATE OR REPLACE FUNCTION get_portal_data` with "cannot change return type of existing function", and every statement after it (Gmail table, approval RPCs, inventory history) is skipped. Neither file sets `search_path` on `SECURITY DEFINER` functions (Supabase linter `function_search_path_mutable`), and both leave `EXECUTE` granted to `PUBLIC` by default.
- **Fix:** Move all schema into `supabase/migrations/*.sql` managed by the Supabase CLI; delete the duplicated function/table definitions from `SQL_SETUP_SCRIPT` and `supabase_setup.sql`; use the definitions in COMM-002/COMM-004 (`set search_path = public`, explicit `revoke ... from public` / `grant ... to anon, authenticated`).

---

### COMM-029 — RPC `{error}` results are treated as success
- **Severity:** Low  **Status:** CONFIRMED (with the `supabase_setup.sql` versions, which `RETURN jsonb_build_object('error', ...)` instead of raising)
- **Location:** `PortalView.tsx:49-57`, `DocumentApprovalView.tsx:45-51`.
- **What's wrong:** Only the transport `error` is checked, so "Invalid portal key" / "Document not found" results show "Document signed successfully!" / "Approved!".
- **Fix:** Raise in SQL (COMM-002) and also check the payload:

```ts
const { data: res, error } = await supabase.rpc('sign_document_via_portal', { ... });
if (error) throw error;
if (res?.error) throw new Error(res.error);
```

---

### COMM-030 — Portal signing modal reuses a signature drawn for a different document
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `PortalView.tsx:21-23, 143-160`.
- **What's wrong:** Cancel/backdrop only does `setSigningDocId(null)`; `signature` keeps the last drawing. Opening "Review & Sign" on another document shows an empty pad but "Submit Signature" is already enabled and submits the old image. The modal also shows no document details, so the client signs blind.
- **Fix:** `const openSign = (id: string) => { setSignature(''); setSigningDocId(id); };` and `const closeSign = () => { setSignature(''); setSigningDocId(null); };`; show title, number and `computeDocumentTotal` inside the modal, or link to the full approval page (`?approval_token=`) instead of signing from the list.

---

### COMM-031 — "Lightweight" document list still downloads every client signature image
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `App.tsx:77` (`clientSignatureUrl:data->>clientSignatureUrl` in `DOCUMENT_METADATA_COLUMNS`).
- **What's wrong:** Signatures are base64 PNG data URLs (tens of KB each). They are fetched with every metadata page and stored in IndexedDB, defeating the egress optimisation.
- **Fix:** Select `clientSignedAt:data->>clientSignedAt` instead and use `!!clientSignedAt` for badges (`ClientsView.tsx:274`, `App.tsx:1011, 1021`). Longer term, upload signatures to a private storage bucket and store only the path.

---

### COMM-032 — ShareModal promises an attachment it cannot send, has no link and no recipient
- **Severity:** Medium  **Status:** CONFIRMED
- **Location:** `ShareModal.tsx:26-38, 40-58, 84-87`; opened from `InvoiceForm.tsx:898-1004`.
- **What's wrong:** The default body says "Please find attached invoice ..." but `mailto:` cannot carry attachments, so the client receives text only. No portal/approval link or PayPal link (`InvoiceData.paypalLink`) is included. The To field is always reset to `''` instead of the client's email. `window.open(mailto, '_blank')` leaves an empty tab on some browsers. `[Job Name]` uses `data.projectName` (invoices usually do not have it), and `[Total Amount]` ignores tax (COMM-024).
- **Fix:** Offer "Send via Gmail" (open `/communication` with `prefillData: { clientName, documentIds: [id] }`), keep mailto as a fallback with a link instead of an attachment:

```ts
const portalUrl = client?.portal_key ? `${window.location.origin}?portal=${client.portal_key}` : '';
const bodyWithLink = portalUrl ? `${body}\n\nView and download your documents: ${portalUrl}` : body;
window.location.href = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyWithLink)}`;
```

Pass `clients`/`job` into `ShareModal` to prefill `recipientEmail` and `[Job Name]`, and change the default copy from "attached" to "linked below".

---

### COMM-033 — HTML email: body and profile values are inserted without escaping
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `CommunicationView.tsx:397-412`, `utils/emailTemplates.ts:13-32`.
- **What's wrong:** `body.replace(/\n/g, '<br>')` inserts raw text into HTML: "Price < $500 & tax" breaks the markup; company names with `&` or `<` corrupt the template; `{{logo_url}}` is placed inside `src="..."` unescaped. Only affects the sender's own emails (the preview iframe is sandboxed without scripts), but produces broken emails.
- **Fix:**

```ts
const esc = (s = '') => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const variables = {
    body: esc(body).replace(/\n/g, '<br>'),
    logo_url: /^https:\/\//.test(profile.logoUrl || '') ? esc(profile.logoUrl) : '',
    company_name: esc(profile.companyName), /* ...esc() every text value... */
    primary_color: /^#[0-9a-f]{3,8}$/i.test(primaryColor) ? primaryColor : '#3b82f6',
    secondary_color: /^#[0-9a-f]{3,8}$/i.test(secondaryColor) ? secondaryColor : '#8b5cf6',
};
```

Note: the gallery preview (`EmailTemplateSelector.tsx:28-38`) uses an un-sandboxed `srcDoc` iframe (same origin as the app); add `sandbox=""` there too.

---

### COMM-034 — Touch/mobile defects: hover-only controls and non-reactive `window.innerWidth`
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `CommunicationView.tsx:481` (`opacity-0 group-hover:opacity-100` disconnect button), `BatchEmailReviewCard.tsx:95` (edit/remove hover-only), `CommunicationView.tsx:620` (`window.innerWidth < 640` evaluated during render).
- **Fix:** `className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"` (same for the batch card); replace the JS width check with responsive spans: `<span className="sm:hidden">Browse</span><span className="hidden sm:inline">Browse Templates</span>`.

---

### COMM-035 — `gmail-auth` edge function hygiene
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `supabase/functions/gmail-auth/index.ts:2, 41-42, 59-61, 83-91, 141-146`.
- **What's wrong:** Uses deprecated `std@0.168.0` `serve`; logs the client ID and returns Google's full error JSON plus the redirect URI to the browser; every failure (including `Unauthorized`) returns HTTP 400 so the client cannot distinguish cases; the first-time upsert without a `refresh_token` violates `refresh_token NOT NULL` (`create_user_gmail_accounts.sql:7`) with a cryptic error; `redirect_uri` is taken from the request body without an allowlist; no handling for `invalid_grant`.
- **Fix:** Replaced by the function in COMM-006 (`Deno.serve`, allowlisted redirect URIs, typed error codes and statuses, explicit NO_REFRESH_TOKEN path, RECONNECT_REQUIRED path).

---

### COMM-036 — Server-side `AUTO_SEND_BATCH` in master-ai-router sends placeholder attachments
- **Severity:** Low (dead path today)  **Status:** CONFIRMED
- **Location:** `supabase/functions/master-ai-router/index.ts:68-165`, `:184-188`; client header `src/hooks/useMasterAIRouter.ts:413, 452`.
- **What's wrong:** Reachable only when the request body has `forceAction` (the client never sends it). If wired up, it would (a) attach the literal text `PLACEHOLDER_BASE64_FOR_DOC_<id>` as `application/pdf`, (b) fetch documents with the anon key (RLS returns nothing), and (c) send with `X-Google-Token`, which is the Supabase sign-in token from localStorage without `gmail.send`. The client still forwards that Google token to the AI function on every request, needlessly exposing it to server logs.
- **Fix:** Delete the block `index.ts:69-165` and the `X-Google-Token` header (`useMasterAIRouter.ts:413, 452`, CORS list `index.ts:5`); keep batch sending in the client-side reviewed flow (or move it to a dedicated `gmail-send` edge function that uses `user_gmail_accounts` and server-side PDF generation).

---

### COMM-037 — Email quota is enforced only in the browser and is user-writable
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `CommunicationView.tsx:106-108, 329-333`, `App.tsx:2028-2034` (read-modify-write `email_usage` from stale `profile`), `App.tsx:175-176` (users may update any column of their profile row).
- **What's wrong:** Free users can bypass the 10-email limit by using the AI batch (COMM-016), by two quick sends (stale `profile` increments to the same value), or by `update profiles set email_usage=0` from the console.
- **Fix:** Column grants in COMM-003 plus an atomic RPC called by the sender (or by a future `gmail-send` edge function before sending):

```sql
create or replace function public.consume_email_quota(p_count int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v_used int; v_tier text; v_month text := to_char(now(), 'YYYY-MM');
begin
  update public.profiles
     set email_usage = case when email_usage_month = v_month then email_usage else 0 end + p_count,
         email_usage_month = v_month
   where id = auth.uid()
  returning email_usage, subscription_tier into v_used, v_tier;
  if coalesce(v_tier, 'Basic') <> 'Premium' and v_used > 10 then
    raise exception 'EMAIL_LIMIT_REACHED';
  end if;
  return v_used;
end $$;
grant execute on function public.consume_email_quota(int) to authenticated;
```

(The exception rolls the increment back.)

---

### COMM-038 — GmailCallback error screen is a dead end and leaves the code in the URL
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `GmailCallback.tsx:30-40, 72-90, 117-130`.
- **What's wrong:** On error there is no button back to Communication; a refresh re-submits the single-use `code` (`invalid_grant`). Google's `access_denied` (user clicked Cancel) is shown as "OAuth Error: access_denied".
- **Fix:** `window.history.replaceState({}, '', '/gmail-callback')` before exchanging (see COMM-006), map `access_denied` to "You cancelled the Google authorization.", and render `<Button onClick={() => navigate('/communication')}>Back to Communication</Button>` in the error state.

---

### COMM-039 — Selected sender account not persisted; accounts re-queried on every switch; fetch errors ignored
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `CommunicationView.tsx:61-82` (`selectedGmailAccount` in dependency list, `error` unused).
- **Fix:**

```ts
const [selectedGmailAccount, setSelectedGmailAccount] = useState<string | null>(() => {
    try { return localStorage.getItem('gmail_sender'); } catch { return null; }
});
useEffect(() => { try { selectedGmailAccount ? localStorage.setItem('gmail_sender', selectedGmailAccount) : localStorage.removeItem('gmail_sender'); } catch {} }, [selectedGmailAccount]);
useEffect(() => {
    (async () => {
        const { data, error } = await supabase.from('user_gmail_accounts').select('gmail_address, needs_reconnect').eq('user_id', session.user.id);
        if (error) { console.error(error); setAccountsError(error.message); return; }
        setGmailAccounts(data ?? []);
        setSelectedGmailAccount(cur => (data ?? []).some(a => a.gmail_address === cur) ? cur : data?.[0]?.gmail_address ?? null);
        setAccountsLoaded(true);
    })();
}, [session?.user?.id, supabase]);
```

---

### COMM-040 — Activity history and delete-confirmation copy are misleading
- **Severity:** Low  **Status:** CONFIRMED
- **Location:** `ClientsView.tsx:864-889` (filters differ between the empty check and the list; sorted and timestamped by `createdAt` of the document, not by signing time); `ClientsView.tsx:914` ("will remove all associated data" - deleting a client removes nothing else, but its portal link stops working and history is still matched by name).
- **Fix:** Use one filter `const activity = forms.filter(f => (f.data as any).clientSignedAt || ['Accepted','Rejected'].includes((f.data as any).status))`, sort by `new Date(d.clientSignedAt || f.createdAt)` and display that date. Change the confirm text to "The client's portal link will stop working. Jobs and documents are kept."

---

## 4. Recommended refactors

1. **One schema source of truth.** Move every table/policy/function into `supabase/migrations/` (Supabase CLI), delete `SQL_SETUP_SCRIPT` from `App.tsx` (keep a link to docs in `DbSetupScreen`), delete `supabase_setup.sql`, `create_user_gmail_accounts.sql`, `create_user_credentials.sql` after porting. Run `supabase db lint` in CI.
2. **Server-side email sending.** Add a `gmail-send` edge function: input `{gmail_address, to, subject, text, html, document_ids[]}`; it consumes quota (COMM-037), refreshes the token (never returned to the browser), loads documents with the caller's JWT (RLS), generates PDFs server-side or accepts pre-rendered base64 and sends via Gmail. Use the upload endpoint `POST /upload/gmail/v1/users/me/messages/send?uploadType=media` with `Content-Type: message/rfc822` for large attachments. Communication page and AI batch both call it. This removes access tokens from the browser entirely.
3. **Real client foreign keys** (`jobs.client_id`, optionally `documents.client_id`) and a `client_id`-based portal (COMM-011).
4. **Document hydration service.** A single `getFullDocument(id)` (cache + fetch) used by every consumer that needs `data` (email, batch, duplicate, AI). Never write `data` from in-memory copies; use JSON patch RPCs (`data || jsonb_build_object(...)`) for flags like `viewedByProvider`, `status`.
5. **Public-link model.** Table `share_links(id, user_id, scope 'portal'|'document', target_id, token_hash, expires_at, revoked_at, last_viewed_at)`; store only SHA-256 of the token; RPCs resolve by hash; UI to revoke/regenerate; record `viewed`/`signed` events with timestamp and user-agent for an audit trail.
6. **Signing as an append-only record.** Table `document_signatures(document_id, signer_name, signature_path, signed_at, ip, user_agent, document_hash)`; store the image in a private bucket; compute `document_hash` of the client-visible content so later edits are detectable (COMM-026).
7. **Shared money math** (`utils/documentTotals.ts`, COMM-024) used by PDF generator, portal, approval, emails and analytics.
8. **Communication page state.** Replace the four interacting effects with a reducer (`{client, docs, subject, body, dirty, sender}`) and explicit actions; consume router `prefillData` once.
9. **Remove legacy Google token code** (COMM-019) and the `src/` duplicates of these components to avoid edits landing in dead copies.
10. **Sanitize every HTML sink** (DOMPurify wrapper component `SafeHtml`) and ban `dangerouslySetInnerHTML` elsewhere via ESLint `react/no-danger`.

### Gmail setup checklist (matches the fixed code in COMM-006; items marked "current code" apply today)

**Google Cloud console** (project that owns client `292965678575-p8smva2vfeguocsppjr45r05jsvhggjo.apps.googleusercontent.com`):
- [ ] APIs & Services -> Library -> **Gmail API: Enabled** (current code needs this too; otherwise sends return 403 `accessNotConfigured`).
- [ ] OAuth consent screen: User type External; app name, support email, logo; **Privacy policy** `https://<prod-domain>/privacy`, **Terms** `https://<prod-domain>/terms`; authorized domain `<prod-domain>`.
- [ ] Scopes: `openid`, `.../auth/userinfo.email` (`email`), `https://www.googleapis.com/auth/gmail.send` (sensitive). (Current code requests only `gmail.send`; that is the cause of COMM-005.)
- [ ] Publishing status: **In production** and submit for **sensitive scope verification** (demo video of the send flow). While in Testing: add each tester under "Test users" and expect refresh tokens to expire after 7 days.
- [ ] Credentials -> OAuth 2.0 Client ID of type **Web application**. Its ID must equal the one hard-coded at `App.tsx:1915` (current code) or the `GOOGLE_CLIENT_ID` secret (fixed code).
- [ ] **Authorized redirect URIs** (exact match, scheme + host + port + path, no trailing slash):
  - `https://<prod-domain>/gmail-callback`
  - `https://www.<prod-domain>/gmail-callback` (only if the app is also served on www; better redirect www to apex)
  - `http://localhost:3000/gmail-callback` (Vite dev port from `vite.config.ts:13`)
  - Vercel preview URLs change per deployment and will not work unless added individually; test Gmail on a stable domain.
  - If Supabase "Sign in with Google" uses the **same** client: also `https://iauteblvljppwzsxloyd.supabase.co/auth/v1/callback`. Using a separate client for login is cleaner.
- [ ] Authorized JavaScript origins: not required for the server-side code flow (harmless to add the same origins).
- [ ] If a user connected before scopes changed: they must reconnect (the fixed function reports `SCOPE_MISSING`/`NO_REFRESH_TOKEN`), or remove the app at `https://myaccount.google.com/permissions` and connect again.

**Supabase**
- [ ] Secrets (`supabase secrets set ...` or Dashboard -> Edge Functions -> Secrets):
  - `GOOGLE_CLIENT_ID` (same as above) - current code
  - `GOOGLE_CLIENT_SECRET` - current code
  - `GMAIL_REDIRECT_URIS` = comma-separated list identical to the Google console list - fixed code
  - `OAUTH_STATE_SECRET` = 32+ random bytes (`openssl rand -base64 32`) - fixed code
  - `TOKEN_ENCRYPTION_KEY` = 32 random bytes **base64url** (`openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')`) - fixed code; back it up, losing it invalidates all stored refresh tokens
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
- [ ] Deploy: `supabase functions deploy gmail-auth` with JWT verification **on** (default). The client calls it through `supabase.functions.invoke`, which sends the user's JWT.
- [ ] Database: run the COMM-004 reconciliation; verify `select column_name from information_schema.columns where table_name='user_gmail_accounts'` shows `gmail_address`, `refresh_token`, `needs_reconnect`, `granted_scopes`, and `select relrowsecurity from pg_class where relname='user_gmail_accounts'` is `true`.
- [ ] Verify the anon role cannot read tokens: with the anon key, `select * from user_gmail_accounts` must return a permission error or 0 rows; as a signed-in user, selecting `refresh_token` must fail with "permission denied for column".
- [ ] Auth -> URL configuration: Site URL `https://<prod-domain>`; additional redirect URLs include `https://<prod-domain>/**` and `http://localhost:3000/**` (for Supabase login and password reset; Gmail does not go through Supabase Auth).

**Hosting**
- [ ] `vercel.json` SPA rewrite (already present) so `/gmail-callback` serves `index.html`.
- [ ] Serve the app on a single canonical origin (redirect `www` <-> apex), because `redirect_uri` is built from `window.location.origin`.

**Smoke test after deploying**
1. Communication -> Connect Gmail -> Google shows the app name and the "Send email on your behalf" checkbox -> allow.
2. Callback shows "Successfully linked you@gmail.com"; `user_gmail_accounts` has one row with `refresh_token` starting `v1.`.
3. Send to yourself with a subject containing `é — ✓` and one estimate attached that you have not opened in this session -> subject renders correctly, PDF opens with line items.
4. Revoke the app at myaccount.google.com/permissions -> send again -> UI shows "reconnect this account" and the row has `needs_reconnect = true`.
5. Disconnect -> row deleted and the app disappears from myaccount.google.com/permissions.
