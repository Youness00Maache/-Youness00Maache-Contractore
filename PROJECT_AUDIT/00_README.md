# ContractorDocs: full project audit

Audit date: 2026-11-10 · Branch `my-branch` (last commit `25ae5cc`, 2026-05-18, plus 43 modified and about 30 untracked files) · No project source files were changed by this audit.

This folder is the complete map of how the app works, what is broken (every screen, button and minor defect we could find), and how to fix each problem with concrete code.

## How to read this folder

| File | What's in it |
|---|---|
| **00_README.md** (this file) | What you were working on, the critical findings, the de-duplicated root causes, and the order to fix things in |
| [00_ISSUE_INDEX.md](00_ISSUE_INDEX.md) | All 239 issues in one table, sorted by severity, each linked to its full write-up |
| [01_core_app_routing_auth_dashboard.md](01_core_app_routing_auth_dashboard.md) | `App.tsx`: auth, routing, data loading, dashboard, job details, limits, offline. CORE-001…038 |
| [02_documents_forms_templates_pdf.md](02_documents_forms_templates_pdf.md) | The 12 document forms, templates, PDF generation, signatures, OCR. DOC-001…042 |
| [03_ai_assistant_system.md](03_ai_assistant_system.md) | Master AI router, job AI modal, setup cards, voice and mentions, edge functions. AI-001…038 |
| [04_clients_communication_gmail_sharing.md](04_clients_communication_gmail_sharing.md) | Clients, Gmail OAuth and sending, batch email, client portal, approvals, sharing. COMM-001…040 |
| [05_inventory_analytics_forum_settings_billing.md](05_inventory_analytics_forum_settings_billing.md) | Inventory, price book, QR tags, analytics, calendar, profit calculator, forum, settings, login/signup, PayPal. VIEW-001…046 |
| [06_database_security_build_infra.md](06_database_security_build_infra.md) | Reconstructed schema, table↔code matrix, security, build, repo hygiene, every TypeScript error. SEC/DB/INFRA |
| [06b_proposed_consolidated_schema.sql](06b_proposed_consolidated_schema.sql) | One idempotent migration replacing the 12 contradictory SQL files (Part A is safe now; Part B goes in after the frontend fixes) |
| [tools/template-render-check.ts](tools/template-render-check.ts) | Renders all 20 premium templates with a known invoice and report, and flags wrong totals, missing signatures, dropped content and XSS. Run with `cd PROJECT_AUDIT/tools && npx tsx template-render-check.ts` |
| `_tsc_errors_raw.txt` | Raw `tsc --noEmit` output at audit time |

Every issue has: **Severity** (Critical/High/Medium/Low), **Status** (CONFIRMED = visible in the code; LIKELY = depends on the live database or runtime), **Location** (`file:line`), what's wrong, user impact, root cause, and a **Fix** with code.

Some problems were found independently by more than one reviewer, so they appear under several IDs (for example CORE-001 = COMM-001 = VIEW-045 = DB-001). The root-cause table below groups them, so fix each group once.

---

## 1. What you were working on (reconstructed from the repo)

ContractorDocs (contractordocs.app) is a React 18 + Vite single-page app on Supabase, deployed on Vercel. Contractors create **jobs**, then create **documents** for each job: Invoice, Estimate, Work Order, Daily Job Report, Time Sheet, Material Log, Expense Log, Warranty, Note, Receipt, Change Order and Purchase Order. Each document is rendered with one of about 20 HTML templates or a jsPDF layout, then downloaded, emailed through the user's Gmail, or sent to a **client portal** for approval and signature. Around that sit Clients, Inventory (with QR tags and stock deduction), a Price Book, Analytics, a Calendar, a Profit Calculator, a community Forum, and a PayPal subscription (free plan versus Premium).

The git history and file dates show this sequence:

| When | What |
|---|---|
| Jan–May 2026 (committed) | Core app, templates, inventory and price book, then a long struggle with **white-screen** bugs ("fixing the white page 1-8") and with **Gmail** ("Gmail improvements 1-5", several reverts, "undo the gmail thing"), and finally "Mobile/desktop view fix" (last commit, May 18) |
| May–Jul 2026 (uncommitted) | The **AI document assistant**: `DashboardMasterAIButton`, `JobDocumentAIModal`, the `master-ai-router` edge function, `src/hooks/useMasterAIRouter.ts`, the "setup card" that asks for missing fields, template inference, the AI QA harness (`/qa-ai-documents`) and `scripts/document-ai-flow-qa.ts`. Last touched **Jul 18** |
| Sep 3 2026 (uncommitted) | **AI batch email** (`BatchEmailReviewCard`, `batchEmailSender`, `buildEmailBatch`) and the `useDocumentDraftPrefill` hook wired into the Invoice, Estimate, Work Order and Change Order forms |
| Oct 14 2026 | An edit to `src/components/InvoiceForm.tsx`. **That file is the dead duplicate copy: the app never loads it**, so whatever that change was meant to fix is not live (see INFRA-008) |

So the most recent, unfinished work is the **AI document generation and batch email flow**, and that is also where many of the High issues are (file 03).

---

## 2. Findings that block everything (fix these first)

These were verified directly during the audit, not only by reading code.

1. **The app's database can't be reached.** `App.tsx:69` and `src/hooks/useMasterAIRouter.ts:15` hardcode the Supabase project `iauteblvljppwzsxloyd`. On 2026-11-10 that hostname returned *Non-existent domain* from both the local DNS and Google DNS (8.8.8.8). `supabase/.temp/linked-project.json` shows it is "supabase-yellow-elephant" in a **Vercel-managed Supabase org**, so it does not appear in your Supabase dashboard org ("Youness00Maache's Org"). That org has a separate project, **ContractoreAI** (`mrpvmszmedsjgmdyohli`), which is **paused** and which the code does not use. While the backend is unreachable, login, data loading, saving and AI all fail.
   **Fix:** In Vercel → your project → Storage, restore or unpause "supabase-yellow-elephant". If it was deleted, resume ContractoreAI or create a new project, run `06b_proposed_consolidated_schema.sql`, and move the URL and anon key into env vars instead of hardcoding them:
   ```ts
   // lib/supabase.ts  (the single client for the whole app; see INFRA-001)
   import { createClient } from '@supabase/supabase-js';
   export const supabase = createClient(
     import.meta.env.VITE_SUPABASE_URL,
     import.meta.env.VITE_SUPABASE_ANON_KEY,
   );
   ```
   ```bash
   # .env.local (also set the same two variables in Vercel → Settings → Environment Variables)
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
   Add `/// <reference types="vite/client" />` in a `vite-env.d.ts` file (this also fixes the `import.meta.env` TypeScript errors at `App.tsx:862` and `App.tsx:3053`).

2. **A live Google/Gemini API key is in plain text** in `list_models.js` and `list_models.ts` (untracked and not git-ignored). **Rotate it in Google AI Studio now**, delete both files, and add them to `.gitignore` (AI-002, SEC-009).

3. **The AI never actually calls an LLM.** `supabase/functions/master-ai-router/index.ts:351` calls `gemini-1.5-flash`, a retired model that is not even in your own `models.json`. Every request errors, and the client silently falls back to a regex "heuristic router" (AI-001). The second function, `process-contractor-ai/index.ts:144`, uses a retired Claude model (AI-012). Fix both: move the model name into an env secret and use a current model (see AI-001 for the code).

4. **Much of the live code is not committed.** `src/hooks`, `src/config`, the new utils, the new components and two edge functions are untracked. A fresh clone or a Vercel build from git would fail (INFRA-002). Commit the live code once the key files above are removed.

What does work: `npm run build` succeeds (one 1.95 MB bundle), and `npm run qa:document-ai` passes for all 12 document types. That script only tests the pure parsing layer, not the UI or the edge function.

---

## 3. How the app works (short version; each report has the full walkthrough)

```
index.html ── CDN scripts: Tailwind (Play CDN), supabase-js@2 (unpinned), jsPDF, autotable, html2canvas, tesseract, PayPal SDK
   └─ index.tsx → <BrowserRouter><App/>  (ROOT App.tsx, 3,224 lines: the whole app shell)
        ├─ view state machine  (getViewFromPath ⇄ URL; ~25 screens: dashboard, jobDetails, form, clients, inventory …)
        ├─ supabase = window.supabase.createClient(...)   ← client #1 (CDN)
        ├─ fetchData(): profile, jobs, clients, documents (documents are loaded as LIGHTWEIGHT STUBS,
        │      i.e. metadata only; full `data` is fetched per document when opened)  ← source of many bugs
        ├─ components/*Form.tsx  ← 12 document editors → onSave → documents.upsert({data: jsonb})
        ├─ services/pdfGenerator.ts + utils/templates/*  ← jsPDF layouts and 20 HTML templates (html2canvas)
        ├─ DashboardMasterAIButton / JobDocumentAIModal
        │      └─ src/hooks/useMasterAIRouter.ts  ← client #2 (npm createClient)
        │             └─ edge fn master-ai-router (Gemini) → action_type: GENERATE_DOCUMENT | GATHER_INFO |
        │                NAVIGATE | AUTO_SEND_BATCH | UPDATE_JOB_STATUS | …  → prefill → form → auto-save
        ├─ CommunicationView → services/gmailService.ts → edge fn gmail-auth (OAuth code exchange) → Gmail API send
        ├─ Portal / DocumentApprovalView  ← anonymous access through SECURITY DEFINER RPCs + share tokens
        └─ UpgradeModal → PayPal subscription → edge fn paypal-webhook → profiles.subscription_tier
Supabase: Postgres (jsonb documents, triggers that deduct inventory), Auth (email + Google), Storage (logos, forum, price-book-images)
```

The **live** code is the ROOT `App.tsx`, `components/`, `utils/`, `services/` and `types.ts`, plus `src/hooks`, `src/config` and `src/utils/aiTemplateUtils.ts`. Everything else under `src/` (`src/components`, `src/services`, `src/types.ts`, an empty `src/App.tsx`) is a stale duplicate, and so is `my-pdf-app/`.

---

## 4. Root causes, de-duplicated

Most of the 239 issues come from a handful of underlying mistakes. Fixing each root cause once clears its whole group.

| # | Root cause | What users see | Issue IDs |
|---|---|---|---|
| R1 | **Documents are kept in memory as metadata-only stubs**, and code treats those stubs as full documents | Clicking a client's "signed" badge **erases documents** (line items, signatures) and restocks inventory; emailed PDFs are empty or crash; Analytics and Job Financials show $0; open documents get stuck on "Loading document…" | CORE-001, COMM-001, VIEW-045, DB-001, CORE-007, CORE-011, DOC-008, DOC-016, COMM-007, VIEW-033 |
| R2 | **Security lives in the browser**: an RLS policy lets every user read every profile, users can update their own `subscription_tier`, the webhook and edge functions don't authenticate, and SECURITY DEFINER RPCs trust their arguments | Gmail tokens and personal data exposed to any user or link holder; free Premium; anyone can call your Gemini key; stock can be tampered with across accounts | CORE-002/003/004, COMM-002/003/006/008/009/010, VIEW-001/002/003/008/016, SEC-001…008, AI-003, AI-021 |
| R3 | **No single database schema**: 12 SQL files plus SQL embedded in `App.tsx` contradict each other, and tables and columns used by the code are never created | Job creation fails silently (camelCase vs snake_case); Gmail linking fails (`email` vs `gmail_address`); the webhook writes a column that doesn't exist; the price book is empty; storage buckets are missing | CORE-005, VIEW-037, COMM-004, COMM-028, VIEW-004/019/027/028, DB-002, DB-003 |
| R4 | **Inventory is deducted in more than one place** (client code and two trigger sets) and never idempotently | Stock deducted on every re-save of a Material Log, deducted twice for estimate plus invoice, and drifting counts | DOC-002, CORE-009, VIEW-017, VIEW-018, VIEW-019, VIEW-020, CORE-027, DB-006 |
| R5 | **AI prefill is fire-and-forget**: it is stored in `history.state`, the effect re-runs on every render, auto-save has no idempotency key, and the queue reuses React keys | Duplicate documents on Back/Refresh, the user's edits overwritten, fields leaking between drafts, documents attached to the wrong job | DOC-004/005/006/007, CORE-010, CORE-013, CORE-015, AI-008, AI-026, COMM-025 |
| R6 | **The AI pipeline is not wired correctly**: retired model, forced document intent, actions run without confirmation, payloads dropped | "Email the invoice" opens a new invoice; batch email sends twice with no review; job status changes the wrong job; daily reports contain invented facts | AI-001, AI-004…019, CORE-006, CORE-014, DOC-003 |
| R7 | **Templates calculate totals and fields themselves** instead of using the form's numbers, and nothing is HTML-escaped | The PDF total differs from the screen on all 20 templates; signatures, terms and PayPal links missing; report content dropped; script injection through client names and notes | DOC-001, DOC-009/010/011/012/013/028, COMM-017, AI-013, SEC-013 |
| R8 | **The Gmail OAuth flow is incomplete**: it requests the wrong scopes, has no `state` check, stores tokens in plaintext, and the Google app is probably still in "Testing" mode | Connecting Gmail fails, or works and then stops after about 7 days; tokens leak | COMM-004/005/006/010/015/016/018/019/027, CORE-018 |
| R9 | **Errors are swallowed**: Supabase `{error}` is ignored and there is no error boundary | Silent failures everywhere, blank screens, a "Database Update Required" SQL screen shown to end users | CORE-020/021/022/023, COMM-022, VIEW-010/012/023 |
| R10 | **Repo and build drift**: a duplicate `src/` tree, two Supabase clients, Tailwind CDN, TypeScript not enforced in the build | Fixes made in the wrong file, random sign-outs, a slow first load, type errors that hide runtime crashes | INFRA-001…012, CORE-019 |

---

## 5. Fix roadmap (suggested order)

Each step names the issues it closes. The code for every fix is in the linked report.

### Phase 0: get it running and safe (about half a day)
1. Restore the Supabase project or point the app at a live one using env vars (section 2.1); collapse to **one** Supabase client (INFRA-001, CORE-019).
2. Rotate the Gemini key; delete `list_models.*`, `models.*` and the logs; update `.gitignore` (AI-002, SEC-009, 06 "Cleanup plan").
3. Exclude `supabase/functions`, `src/components`, `src/services` and `my-pdf-app` in `tsconfig.json`, and add `vite-env.d.ts` (INFRA-006). Then commit the live code (INFRA-002).

### Phase 1: stop data loss and close the security holes (1–2 days)
4. Fix `markDocumentsAsViewed` to patch only the flag on the server (`jsonb_set` RPC), never write back a stub (**R1**: CORE-001).
5. Run **Part A** of `06b_proposed_consolidated_schema.sql`: owner-only profile RLS, protected `subscription_tier` and AI-credit columns, safe portal/approval RPCs that return only whitelisted fields, `search_path` on definer functions, and revoke anon access on `apply_document_inventory_delta` (**R2**, **R3**).
6. Verify PayPal webhook signatures and set the tier only on the server (VIEW-001/004, SEC-004); add JWT checks to `master-ai-router` and `process-contractor-ai` (AI-003, SEC-005/006).

### Phase 2: make the core flows work (2–4 days)
7. Job creation: map camelCase to snake_case and surface errors (CORE-005).
8. Introduce `ensureFullDocument(id)` and use it for every PDF, email, analytics and duplicate path (**R1**: DOC-016, COMM-007, CORE-011, VIEW-033).
9. Fix the `fetchData` races and the stuck "Loading document…" screen (CORE-007, DOC-008), the logout/login blank dashboard (CORE-008), and add an error boundary (CORE-023).
10. AI: current model, a confirmation step for side-effect actions, idempotent auto-save, and prefill consumed once (**R5**, **R6**).
11. Gmail: `openid email gmail.send` scopes, a `state` nonce, an encrypted refresh-token table, one `user_gmail_accounts` schema, and the Google app published to "In production" (**R8**; checklist at the end of file 04).

### Phase 3: correct numbers and documents (2–3 days)
12. One shared `computeTotals()` used by forms, templates, the portal and email, plus an `escapeHtml()` helper in every template (**R7**: DOC-001, DOC-013); add signatures and terms to the templates (DOC-009).
13. Inventory: one server-side, idempotent deduction path; drop the duplicate trigger set (**R4**).
14. Number parsing (NaN), UTC date defaults, the calendar time zone, and PDF page breaks (DOC-014/015/018/022, VIEW-035).

### Phase 4: finish half-built features and clean up
15. Dead or unwired features: recurring invoices (VIEW-039, DOC-023), client edit and import (COMM-021), inventory item edit (VIEW-022), Print Tags (VIEW-025), account deletion (VIEW-009), the widgets library (DOC-034, AI-031), "Get Approval" (COMM-021).
16. Delete the dead `src/` copies, `my-pdf-app/`, `temp/` and the stray `html` file; set up Tailwind as a build dependency; code-split the bundle (INFRA-003/005/008).
17. Extend `scripts/document-ai-flow-qa.ts` with the regression assertions in file 03 and add `tools/template-render-check.ts` to CI.

---

## 6. What was verified and how

- **Run during the audit:** `vite build` (passes); `tsc --noEmit` (errors listed; 22 of them in live code, each with a fix in file 06); `npm run qa:document-ai` (passes); DNS lookups and a check of the Supabase dashboard org for the project (section 2.1); `tools/template-render-check.ts`, which rendered all 20 templates and reproduced the wrong totals, missing signatures, dropped report content and the unescaped-HTML findings.
- **Spot-checked against the code by me after the area reviews:** CORE-001 (`App.tsx:1015-1042` writes stub data back), CORE-005 (`App.tsx:2061` spreads camelCase fields into `jobs`, and the fallback only catches `worker_name`), AI-001 (`gemini-1.5-flash` at `master-ai-router/index.ts:351`), AI-002 (a key is present in both `list_models.*` files and is not ignored), and the retired Claude model in `process-contractor-ai`.
- **Not possible:** inspecting the live database schema and policies, because the project host does not resolve. Issues that depend on which SQL was actually run are marked **LIKELY**, and each says how to check. Once the database is reachable, run the checks in file 06 (§2) to turn them into CONFIRMED or not-applicable.
- None of the proposed fixes have been applied or tested yet. They are written to be applied one at a time, and each should be checked in the running app.
