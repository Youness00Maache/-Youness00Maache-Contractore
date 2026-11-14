# ContractorDocs: paused on 2026-11-13 (~12:00). Progress and exact next steps

Work is paused at the owner's request. Nothing has been pushed to GitHub. The local test site is
`http://localhost:3010` (Vite dev server, connected to the REAL production database `iauteblvljppwzsxloyd`).
Owner's rules for this work: never remove a feature the old app had (old app = commit `25ae5cc` = the live
site today); no Docker; don't push unless asked; no generic "vibe-coded" design (icon-in-a-square cards).
**Pacing rule (updated 2026-11-13 21:05): AUTONOMOUS CYCLE.** Work until ~90% of the 5-hour limit (5-minute check stops at 86%), stop until the reset, then continue automatically without waiting for the owner; repeat until the weekly limit (stop when weekly >= 95%) (check with
`mcp__ccd_session_mgmt__get_usage` before each major step), commit finished work, update this file, and set a
one-shot timer a few minutes after the reset (local time = UTC) to continue.

---------------------------------------------------------------------------------------------------------

## 0. NEW fixes reported by the owner (2026-11-13 ~15:05). Do these FIRST

1. **AI fails with "The AI service is unavailable right now (404)."** Cause, from the `ai-assistant` logs at
   15:02: `gemini-2.5-flash` answered **503** ("model is currently experiencing high demand"), then the
   fallback `gemini-2.5-flash-lite` answered **404**: "no longer available to new users, use
   models/gemini-3.5-flash-lite". (Earlier, `gemini-flash-latest` hung.) Fix in
   `supabase/functions/ai-assistant/handler.ts`:
   - Replace the backup list with models that exist now (e.g. `gemini-3.5-flash`, then
     `gemini-3.5-flash-lite`; confirm the current names on Google's model list first) and set the
     `GEMINI_MODEL` secret to the best one (needs the owner's explicit OK: it's a live setting).
   - On 503/overloaded: retry the same model once or twice with a short backoff before moving on.
   - The error shown to users should say "busy, try again in a minute", not "(404)".
   - Update `scripts/document-ai-flow-qa.ts` model-name checks, bundle and redeploy `ai-assistant`, and test
     the owner's request: "create new clients Jack and Paul and assign to them a daily report and an
     invoice, filled with random information because this is just a test".
2. **Voice button is a box inside a box** (Note / Daily Report editor, the Camera · Voice · Photo row under
   the text editor). Owner: "a card inside a card is bad". The Voice tile has its own bordered round icon
   inside the bordered tile. Make it look like the Camera and Photo buttons (one flat button: icon +
   label), with the recording state shown on that same button.

## 0b. QA test report (owner's file "ContractorDocs QA Test Report.docx", Nov 13, 2026). Fix ALL, in this order

**Owner decisions (2026-11-13 ~15:40):** plan gating → make the pricing table match the app (only gate what
the old app gated). Live changes approved: switch GEMINI_MODEL to the current model ONLY. NOT approved (ask
again later): database rule locking signed documents (app-side lock is done instead), profit-calculator table
(0b.20), one-time backfill linking existing jobs' typed client names (new jobs link clients from now on).
Work started 15:45 with 3 helpers: AI (0.1, 0b.2/9/19), forms (0.2, 0b.1/6/11–14/16 PO/18/21), app
(0b.3/4/5/7/8/10/15/16 phone/17/22).

Tested on localhost:3010 desktop Chrome + 375px. Bugs:
1. **HIGH: signed estimates stay editable.** After the client signs, the estimate can be edited (a line changed
   $1,500 → $9,999), it stays "Accepted", and the client link shows "Approved by …" next to the NEW total.
   Fix: once signed, estimates AND change orders are read-only (show a banner "Signed by X on date").
   Offer "Revise" that makes a new revision as Draft, clears the signature and needs a new client
   signature. Enforce it on the server too (documents write guard: refuse changes to totals/lines of a
   signed doc unless it goes back to Draft and the signature is cleared). The approval page must show
   what was actually signed.
2. **HIGH: dashboard AI Command fails on every request** ("…unavailable (404)", really HTTP 502). Same as
   item 0.1 above (Gemini 2.5 models busy or retired). Also make the message show the real reason. Note:
   the job-level assistant works; check why only the dashboard scope fails (bigger schema with plans?).
3. **HIGH: job page document ⋮ menu opens UNDER the next card**, so Delete/Duplicate clicks open the other
   document. Only the last row works. Fix: render the menu in a portal or give it a higher z-index above
   sibling cards.
4. **MEDIUM: free-plan document limit.** After deleting a document the UI says 11 of 12 and opens a new
   form, but Save is refused by the server and the typed work is lost (upgrade popup). Duplicate is blocked
   at 11 of 12 too. Fix: count the same way as the server (server counts creations this month per job,
   deletions don't give a slot back). Show the right number, and check BEFORE the form opens, never lose
   typed work: keep the draft and offer upgrade.
5. **MEDIUM: plan gating.** Things the pricing table calls Premium work on Free (premium PDF designs like
   Glassmorphism, client portal + e-signatures, inventory, price book, profit tracking). OWNER DECISION
   needed: enforce, or change the pricing table. Before enforcing, check what the OLD app (25ae5cc) gated,
   so existing free users don't lose something they had (owner rule). Recommendation: make the pricing table
   match reality, and gate only what the old app gated.
6. **MEDIUM: share email text with no company name** reads "Invoice INV-… from" and ends "Thank you," with
   nothing after. Fall back to the user's name, then email.
7. **MEDIUM: job financials.** Receipts don't count as Collected (a $112.68 receipt showed $0 until the
   invoice was set to Paid). The accepted estimate and change orders don't appear. Fix: Collected = paid
   invoices + receipts (no double count when a receipt references a paid invoice). Show contract value =
   accepted estimate + approved change orders.
8. **MEDIUM: clients typed when creating a job never appear in Clients** (count stays 0 even after that
   client signed an estimate). Fix: creating a job with a new client name creates/links a client record
   (match an existing one by name first), and backfill existing jobs without a client_id (ask the owner
   before a production data backfill).

Partly working / rough edges (do after the 8 bugs):
9. Job AI Assistant can't see document status or line items ("is the invoice paid?" gets no answer). Add a
   compact status/total/line summary to the job context.
10. Insights profit (+$80: invoices − expense logs) ≠ Job financials (−$1,500.97: also materials + labor).
    Use one definition everywhere and label it.
11. Estimates: add tax and discount fields, and "Convert to invoice" after the client accepts.
12. Change order: add a status field (Draft/Sent/Approved) and pre-fill "Current contract value" from the
    accepted estimate (+ earlier approved change orders).
13. Work order: add an "Assigned to" field (worker), which is used in the PDF too.
14. Missing Share button on Purchase Order (send to vendor), Warranty, Work Order, Time Sheet, Note. Purchase
    Order and Warranty also have no AI fill: add both.
15. Client "New invoice" silently creates a "<Client> - General" job even if the invoice is discarded (uses
    one of the 6 free jobs). Only create the job when the invoice is saved, or reuse the client's existing
    "General" job.
16. Validation: client phone accepts letters. Vendor email is only checked on Save (check while typing).
    Progress billing accepts 150% (clamp to 0–100 with a message).
17. Number fields pre-filled with 0 keep the zero ("0100") in price book cost/markup and the profit
    calculator. Select-all on focus or start empty.
18. Rounding: progress billing 50% of $99.99 − $20 shows $29.99; round half-up to cents ($30.00)
    consistently.
19. AI usage counter: failed AI requests seem to count (7 of 15 after 3 failures). Only count successful
    answers.
20. Profit calculator saved calculations are only in the browser. Save them to the account (DB) so they
    sync across devices (keep the local ones: migrate them on first load).
21. Time Sheet and Expense Log headers show raw "2026-11-13". Use the same "Nov 13, 2026" format as the others.
22. Dev page `/qa-ai-documents` (AI mock test page) opens for signed-in users. Disable it in production
    builds.
Test data the QA left in the b@b.com account: jobs "QA Test Job", "QA Client Two - General", client "QA Client
Two", price book "Kitchen cabinets"/"Outlet install", inventory "Drywall sheet", profit calc "QA calc".

**PROGRESS 2026-11-13 16:40: sections 0 and 0b DONE** (commits ab1f3f5 AI + deployed + GEMINI_MODEL=gemini-3.5-flash-lite,
3b000bc app/jobs/clients/financials/pricing text, 2433c83 forms/signed lock/estimates/change orders/share/rounding).
Still open from 0/0b: (a) in-app click-through of everything above needs the owner signed in; (b) NOT approved yet:
database rule locking signed documents (+ skip stock deduction for a superseded signed estimate), profit-calculator
table (0b.20), backfill linking old jobs' typed clients; (c) small follow-ups: add the new fields to the AI field list
(supabase/functions/ai-assistant/shared/documentSchema.ts: estimate taxRate/discount, change order status, work order
assignedTo, invoice amountPaid, receipt invoiceNumber) and redeploy; run the free-plan check before "Convert to
invoice" / "Create revision" open a new form (App.tsx).

## 0e. Data that isn't saved to the account (owner, 2026-11-13 17:37). APPROVED: additive tables to fix it

Owner: saved profit calculations disappear after logout/login. Audit EVERYTHING stored only in the browser and
move real user data to the database (migration 20261113000500_user_data_sync.sql, additive; apply after review),
with a one-time import of existing browser data. A helper started 17:40.

**STOPPED 2026-11-13 17:47 at 92% (owner's 95% rule).** Uncommitted in the tree, NOTHING committed or applied:
requests+photos FINISHED (199 checks; migration 0400 written); pay, reminders and data-sync stopped mid-work
(pay was adding the RequestLinkSettings mount in Settings.tsx and PortalPhotos in PortalView.tsx; reminders was
doing a visual check; data-sync was writing the sync module). On resume: SendMessage pay/reminders/data-sync to
finish, then tsc + all tests (incl. scripts/requests-photos-check.ts, reminders-check.ts), commit, apply migrations
0200/0300/0400/0500, deploy the reminders + gmail functions.
**18:13 new window:** reminders FINISHED (141 checks; migration 0300; mounts handed to pay). Resumed pay + data-sync.
New: parity audit v2 (owner: client portal + per-client "get approval" don't work like production; temporary clients
missing; review production again and add everything; nothing may be lost after logout/login) → writes
docs/work/PARITY_V2.md, then implement it. Helper IDs: parity-v2 ae60c2aa3fda85201.
**18:40:** committed pay + reminders + requests/photos (91322c3; note: it also picked up part of data-sync's
ProfitCalculatorView/JobFinancialsModal change, which imports the not-yet-committed lib/userData.ts: commit data-sync next).
APPLIED to production: migrations 0200 (pay/financing/review) and 0400 (requests + job photos). PENDING: 0300 reminders
(being changed so its cron secret is generated inside the DB; then apply + deploy `reminders` function, verify_jwt off),
0500 data-sync (after that helper finishes).
**19:00: feature wave 1 + data sync DONE and LIVE.** Commits 91322c3, 4dde2c6, 6a02a68. Applied to production:
0200, 0300 (reminders: tables, pg_cron "contractordocs-reminders" every 10 min, Vault secret generated in the DB),
0400, 0500 (profit_calculations, user_settings). Deployed function `reminders` (verify_jwt off; refuses calls
without the secret). The `gmail` function code was refactored (core.ts) but the live one is unchanged (redeploy is
optional). Needs the owner signed in to click-test: Pay now / I've paid / Mark as paid, reminders, quote link,
photos, profit calculator saving across logout.
**19:05 helpers for 0d:** AI quality+UI a5ff00bb5da18ddcd (0d.1-4 + AI field list); UI polish ad82842e81aea70d2
(0d.5-8); advanced calculator + tutorials a05bd498c73326970 (0d.9-10). Parity audit v2 ae60c2aa3fda85201 still running
(→ docs/work/PARITY_V2.md, then implement).
**19:45 production review v2 DONE** → docs/work/PARITY_V2.md (top 15 + smaller items). Real portal bug (verified on
b@b.com data): documents of jobs whose client was only typed (e.g. "QA Client") belong to no client record, and the
name matcher is exact/case-sensitive. Owner: Drafts may stay hidden; Sent/Accepted/Paid must show. APPROVED: DB change
for portal & approval rules (migration 0600, to write+apply). NOT approved: backfilling old jobs to clients.
Helpers: portal/approval/temporary clients abdb2d533f6fc5933; data fidelity (PARITY_V2 6,7,8,10,11,12,13,14)
a13b8163ce3a8d37f. Calculator helper told: old Advanced mode = target margin + tax (default 20%).
**20:10:** AI fixes committed (5f8b774) + ai-assistant DEPLOYED; UI polish partly committed (da4fa0a; CommunicationView/
AppNav/DashboardScreen wait for the shared commit); calculator + tutorials FINISHED (uncommitted, shared files).
Owner: restored OLD designs still wrong (preview vs downloaded PDF differ, PDF "simplified", spacing, empty bordered
boxes) → templates helper ab3e480c0eebe3ce2 resumed for that. Still running: portal abdb2d533f6fc5933, data fidelity
a13b8163ce3a8d37f. When all report: full tests + build + seo:check, ONE combined commit, apply migration 0600.
**20:40: production parity DONE** (f8acfe5): portal/Get approval/temporary clients, data fidelity, calculator
Simple/Advanced, tutorials, UI polish rest. Migration 0600 APPLIED to production (9 portal/approval functions).
Only the templates helper ab3e480c0eebe3ce2 still runs (old designs: preview = PDF, spacing, no empty boxes;
uncommitted: Sections.tsx, pdfGenerator.ts, templates-qa.ts, templates-visual.ts, utils/templates/**).
Owner to test (signed in): create client "QA Client" → its portal shows the QA Test Job paid invoice + accepted
estimate; Get approval / Ask again; Temporary (N); tour; /tutorials; calculator Advanced; AI sample fill.
Note: the expiry cut-off for "legacy estimates can be signed after expiry" is 2026-11-13 (utils/clientPortalRules.ts
EXPIRY_RULE_START + SQL _expiry_rule_start()); consider moving it to the go-live date.
**20:55 owner: the AI must know the whole platform** (exact steps with real button names, no generic answers, and
"do it for me"). AI helper a5ff00bb5da18ddcd resumed: knowledge base from components/help/helpContent.ts + app map,
retrieval per message, HOW_TO answers with "Do it for me"/"Take me there", tests. Then redeploy ai-assistant.
**STOPPED 21:00 at 87% (owner's 95% cap; usage was rising ~8%/5 min).** Uncommitted, mid-work: templates helper
ab3e480c0eebe3ce2 (was writing an SVG-foreignObject page renderer so the PDF matches the preview; files
utils/templates/**, services/pdfGenerator.ts, Sections.tsx, scripts/templates-*) and AI-knowledge helper
a5ff00bb5da18ddcd (knowledge base + retrieval + HOW_TO/"Do it for me"). Resume both after the 23:10 reset, then
test, commit, redeploy ai-assistant.
**23:15 cycle 1 started** (5-hour 0%, weekly 67%). Resumed templates ab3e480c0eebe3ce2 + AI-knowledge a5ff00bb5da18ddcd.
New: #7 Export everything + bookkeeper CSV + price promise → aff2f94e4414c0f80. Pacing job: every 5 min, stop at 86%.
**00:10 (Nov 14):** AI product knowledge DONE + committed (34e56d1, 860 QA checks). PENDING: redeploy `ai-assistant`
(bundle: esbuild supabase/functions/ai-assistant/index.ts → scratchpad; the Supabase dashboard wasn't loading at
00:10). Until deployed, how-to answers in the local app show only a one-line reply. After the export helper lands,
add /settings#data to NAV_ROUTES + knowledge.ts. Still running: templates ab3e480c0eebe3ce2, export aff2f94e4414c0f80.
**00:35:** #7 Export everything DONE + committed (b124d28; fflate added). Owner to confirm the price promise wording
("prices locked 12 months for existing subscribers") and then align TermsOfService. NEXT features started (no DB
changes): pipeline board a6f93a02a6c772da0, job costing + T&M invoice aef749bf3a0d5af15. Waiting: good/better/best
(#6) until the templates helper ab3e480c0eebe3ce2 finishes (needs template changes); DB-needing NEXT items (crew
clock-in, service plans, papers vault, punch lists) need the owner's OK for new tables.
**STOPPED 00:55 (Nov 14) at 87% of the 5-hour limit (weekly 79%).** Resume after 04:10 UTC. Stopped mid-work,
uncommitted: templates ab3e480c0eebe3ce2 (native page renderer + QA diff tuning), pipeline a6f93a02a6c772da0 (was
verifying UI with a local harness), job costing + T&M aef749bf3a0d5af15 (was writing its test script). Also pending:
redeploy ai-assistant (34e56d1 knowledge base), then add /settings#data to the AI knowledge.
**04:20 (Nov 14) cycle 2 started** (5-hour 0%, weekly 79%). ai-assistant REDEPLOYED with the product knowledge (34e56d1).
Resumed templates ab3e480c0eebe3ce2, pipeline a6f93a02a6c772da0, job costing aef749bf3a0d5af15. Pacing job every 5 min.
**04:45:** pipeline board (#8) + job costing/T&M (#12) DONE and committed. Follow-ups: add /pipeline and /settings#data to
the AI NAV_ROUTES + knowledge.ts, then redeploy ai-assistant. Templates helper ab3e480c0eebe3ce2 still running. Next:
good/better/best (#6) after templates; DB-needing items wait for the owner's OK.
**05:10:** AI knowledge for pipeline/costing/export committed (e80f9e9, 891 checks) and ai-assistant REDEPLOYED.
**05:20:** Started supplier POs + low-stock reorder (#21) helper a63826d76f236258a (no DB changes; data in existing
columns / user_settings; does not touch template files). Templates helper ab3e480c0eebe3ce2 still running.
**06:25:** DONE + committed (f3d28bd) + ai-assistant REDEPLOYED (photo tasks + knowledge, 922 QA checks):
- AI client updates + AI walkthrough from job photos (#11, Premium + AI): Photos tab › Write client update (sent by
  Gmail / Text / WhatsApp, saved as a "Client update" Note on the job) and AI walkthrough (Daily Job Report / Note draft).
- Supplier ordering (#21): saved suppliers (user_settings `suppliers.list`), PO vendor picker + Save as supplier, Send to
  supplier (Premium, via the Share window + Gmail), reorder qty + Create reorder POs grouped by supplier (Premium, Draft
  POs under a "Shop stock" job), Mark received adds stock once (every plan).
**Needs the owner's OK (ask when back):**
1. Supplier "Confirm order" link: functions-only SQL (no table changes) in docs/work/DRAFT_purchase_order_confirm_link.sql
   (NOT applied). Until then the PO email asks the supplier to confirm by reply.
2. Plan gating of new features: Send to supplier + reorder POs = Premium; photo AI = Premium + AI (per the research plan;
   old features keep their old gating).
3. Photo AI defaults: each sent update creates a Note on the job; walkthrough photos are uploaded as public copies to
   the `logos` bucket (same as the assistant's existing photo path); one photo task = one AI request (1–8 photos);
   "show these photos in the portal" is ticked by default; Text/WhatsApp/Copy count as sent when tapped.
Owner click-test after sign-in: Photos › Write client update / AI walkthrough; Inventory › Suppliers / Create reorder
POs; a PO › Send to supplier / Mark received.
**Running helpers (resume with SendMessage if stopped):** pay a87fff5bdb8a5338f, reminders a2d750dfe2e6a0437,
requests+photos a0be84ce1286d1bf1, data-sync a01ef4379db5b1224.

## 0d. Owner feedback with screenshots (2026-11-13 ~17:15). Do RIGHT AFTER the paused feature wave 1 is finished
## and committed (before #7 "Export everything")

1. **AI "Fill the form" refuses sample data:** "I can't make up random information…" when asked for random/test
   data. Form-fill scope must honour sample/test requests (reuse `isSampleRequest()` from the plans work) and
   fill EVERY field realistically.
2. **AI doesn't fill all the boxes it's asked to** (e.g. "create client Michael with random info in all the
   boxes"): client creation must fill name, email, phone, address, notes, etc.; documents must fill every
   relevant field. Check the action schemas (CREATE_CLIENT entity fields, document fields) and the prompt.
3. **AI "Fill the form" dialog is bad and stuck at the top of the screen** (overlaps the form header on the
   invoice page). Redesign it: well placed (centered sheet on mobile, anchored panel on desktop), clearer,
   shows what will be filled. Better results (see 1–2).
4. **Dashboard AI panel:** owner wants the **rainbow border** (same rainbow as the AI Command button) on the
   panel; the message box at the bottom is cut off / overflows the panel edge ("issue here"). Also one reply
   said "The AI service is not reachable right now…" at 17:12: check the ai-assistant logs for that request.
5. **Upgrade window:** too crowded at the top (title + subtitle + toggle). The ✕ and "Maybe later" do the same
   job: keep ✕, remove "Maybe later" (or the reverse), and give the header room.
6. **Communication page has two "Connect Gmail" buttons** (header + banner). Keep one. The message editor
   there is the old basic one: use the new rich editor style.
7. **Mobile dashboard:** the top header bar is mostly empty space "for no reason". Make it useful (page title,
   quick actions) or slimmer. The floating AI button covers the "Newest first" sort control: move it so it never
   covers content.
8. **Rich text editor is "still so basic"** (Daily Report/Note): the toolbar wraps onto two rows and looks
   plain. Make it feel modern: one clean toolbar row with an overflow menu, a floating selection toolbar,
   "/" slash commands for blocks (heading, checklist, table, photo, divider), nicer block styling, sensible
   height. Keep all current functions.
9. **Profit calculator: "we used to have an advanced calculator, check the production site".** Restore the
   OLD app's advanced calculator (git show 25ae5cc:components/… profit calculator: the Simple/Advanced switch
   and every field/feature it had: overhead, labor hours/rates, markup/margin, etc.) on top of the new one.
10. **Tutorials:** add tutorials showing how everything works: a short first-run guided tour of the app, contextual
    "how this works" help on each main screen (jobs, documents, AI assistant, client portal, inventory, price book,
    profit calculator, communication), and a Help/Tutorials page (marketing site + in-app) with step-by-step guides
    (screenshots, optionally short videos/GIFs).

## 0c. New features from the competitor research (do AFTER 0 and 0b)

Full report: `reports/Contractor software competitor feature gaps.md` (notes in
`research_notes/Contractor software competitor feature gaps/`). Gap numbers (#) refer to the report. Main
idea: ContractorDocs already beats rivals on documents. What's missing is automation that turns documents
into money and new work. Use the contractor's OWN channels (their Gmail, their phone, their Stripe).
Plan rule: Free = get paid + look professional at low volume; Premium $5 = automation, volume, crew; Premium+AI
$10 = AI that writes and acts. Photo storage and AI tokens need per-tier caps. No telephony.

**Owner decision 2026-11-13 16:45:** "choose whatever option fits best" → Claude chose ALL four database additions
(pay now + profile settings; reminders; request-a-quote; job photos). Additive migrations only, applied after the
code is tested: 20261113000200_pay_review_financing.sql, 20261113000300_reminders.sql,
20261113000400_requests_and_job_photos.sql. Started 16:45 with 3 helpers: pay (#1, #4, #5, #6), reminders (#2),
requests + photos (#3, #8). Still to do after them: #7 export everything + bookkeeper CSV + price promise.

**PAUSED 2026-11-13 16:56 at 77% of the 5-hour limit (owner's 80% rule). Feature wave 1 is UNFINISHED and UNCOMMITTED in
the working tree** (do not commit it as-is; it was stopped mid-edit):
- pay (#1/#4/#5/#6), last step "type-check": Settings, Invoice/Estimate forms, ShareModal, PortalView,
  DocumentApprovalView, utils/emailTemplates + templates (QR), lib/payments.ts, lib/paymentsApi.ts, lib/qrcode.ts,
  lib/messaging.ts, components/payments/, components/MessageAppButtons.tsx, migration 20261113000200 (NOT applied).
- reminders (#2), last step "test script": supabase/functions/gmail/core.ts + index.ts (shared code, live function
  NOT redeployed), supabase/functions/reminders/, lib/reminders.ts, scripts/reminders-check.ts, migration
  20261113000300 (NOT applied).
- requests + photos (#3/#8), last step "JobPhotos timeline component": components/requests/, components/photos/,
  App.tsx/Dashboard/JobDetails mounts, migration 20261113000400 (NOT applied).
To resume: SendMessage the three helpers (they keep their context), let them finish, then type-check + all tests,
review, commit, apply the three additive migrations (owner chose all four additions), deploy reminders + gmail
functions, and test in the app (needs the owner signed in).

**NOW (in this order; the payment webhook unlocks the rest):**
1. "Pay now" WITHOUT Stripe (owner: Stripe can't be used; Kelviq is only for selling our own subscriptions, so
   don't route client payments through it). Build on the existing invoice "Pay-now link" field (the
   contractor's own PayPal / Square / Venmo / Stripe link / bank link):
   - default pay link saved once in the profile, so every new invoice gets it (editable per invoice);
   - a clear "Pay now" button in the client portal, the invoice email and as a QR code on the PDF, with the right
     amount for deposit / progress / balance;
   - "I've paid" button for the client in the portal (optional note, e.g. "PayPal, Nov 14"). The contractor is
     notified and the invoice shows "Payment reported";
   - one-tap "Mark as paid" for the contractor: records the payment, auto-creates the receipt, updates Collected in
     job financials, and stops reminders / triggers the review request.
   No automatic payment detection (no webhooks). Everything after "Mark as paid" is automatic.
2. Automatic reminders and follow-ups (#1): overdue invoices, estimate follow-ups and visit reminders sent on
   a schedule (pg_cron) from the user's own Gmail. They stop by themselves on approval/payment. Free counts
   toward the email cap, Premium unlimited, AI wording on Premium+AI.
3. Request-a-quote link + QR code (#5): public mobile form (for the truck, yard sign, Google profile) that
   creates a temporary client and a draft job. AI replies within minutes and drafts an estimate from the
   photos and price book (AI reply on Premium+AI).
4. Text / WhatsApp buttons (#9): open the phone's own messaging app with the message and portal link filled
   in (no SMS bill). Free.
5. Review request after payment (#7): one email/text with the contractor's Google review link when the
   invoice is paid. Premium. (Verify Google's review-gating rules: ask everyone, not only happy clients.)
6. Financing link on large estimates (#3): a field for the contractor's financing partner link (e.g.
   Wisetack/Hearth), shown on big estimates.
7. "Export everything" ZIP (all PDFs + CSVs) on every plan, including Free and after cancelling, plus a monthly
   bookkeeper CSV (#4 step 1). Add a written "price promise" on the pricing page.
8. Job photo timeline basics (#11): per-job photo stream tagged before/during/after, simple markup, one-tap
   before/after photo report, shared in the portal.

**NEXT:** good/better/best estimate options (#6); job budget vs actual + one-tap T&M invoice from time sheets and
material logs (#12); pipeline board over jobs that moves by itself with document status (#8); crew clock-in
links with no seat fee, location stamped only at the punch, feeding time sheets (#13); AI walkthrough and client
progress updates from photos (#11); recurring service plans (#15); "papers" vault (insurance/permit expiry
reminders + lien-waiver templates) (#17); punch lists (#18); supplier POs by email + low-stock reorder (#21);
offline field drafts that sync later (#14).

**LATER:** QuickBooks Online one-way sync, then Xero (#4); selections and allowances (#19); job phases strip
instead of Gantt (#16); measurement calculator + AI reading of imported reports (#20); MCP connector for
ChatGPT/Claude (#23); financing partner integration (#3); SMS credits (#9); voice receptionist via a partner,
only if users ask (#10).

**DON'T BUILD (for this audience):** voice AI receptionist / phone system, aerial 3D measurements, distributor
catalog sync, RFIs/submittals/BIM, full Gantt with critical path, dispatch/route optimization/fleet GPS,
marketing suites, payroll, AIA G702/G703 pay apps, in-house lending. The report lists the cheap alternative
for each.

---------------------------------------------------------------------------------------------------------

## A. Landing page changes requested (screenshots, 2026-11-13). Do these first

All in `pages/LandingPage.tsx` unless noted. Reload the page first: some screenshots showed an older version.

1. ~~DONE (commit below)~~ **Delete** the whole "WHAT YOU CAN DO / One week on a remodel, without the paper chase" section
   (Mon–Fri planner, `pages/LandingPage.tsx` around line 295, plus its `WEEK` data array around line 64 and
   any helpers in `pages/components/LandingVisuals.tsx` that only it uses).
2. ~~DONE: whole section deleted~~ **"How it works" 3 cards** (01 Add a job and your client / 02 Create documents / 03 Send, sign and get
   paid; `STEPS` around line 73, rendered around line 274). Owner circled the icons and wrote
   "delete this". Default plan: **delete this whole 3-step section**. (The icons in the screenshot were the
   old version; they are already replaced by drawings, but the owner still marked the section.) Confirm with
   the owner if unsure.
3. ~~DONE (commit 5bdd2c6: light band "What we can and can't see" with real-protection visuals)~~ **Improve the security section** (`TRUST` around line 79: Encrypted connections / Your data stays yours /
   Send-only Gmail access / Payments by Kelviq). Owner wrote "Improve this". No generic icons; make it
   distinctive and compact. Check the current "rating plate" version first, then improve further.
4. ~~DONE (realistic frame, side buttons, island, status bar, home bar; check the top on a real screen)~~ **Client portal phone: "make this an actual phone"** (`PhoneMockup` in `pages/components/Mockups.tsx`
   around line 348, the "Change Order #3 / Approved & signed" screen). Make it look like a real modern phone:
   realistic frame/bezel, rounded screen, dynamic-island notch, status bar (time, signal, battery), side
   buttons, depth/shadow. Keep the screen content.
5. ~~DONE: now "One job. Every document. Signed online."~~ **Hero badge "Built for contractors · Free plan available"** (around line 100): owner wrote "change this".
   Replace it with something less generic (e.g. a specific, true line about who it's for or a concrete
   benefit), or remove the pill. No invented claims (no fake user counts).
6. ~~DONE: footer moved under the form (right column)~~ **Login/sign-up page, blue left panel** (`pages/components/AuthShell.tsx` line 50): the
   "© 2026 ContractorDocs · Privacy · Terms" line collides with the bottom of the invoice picture (owner
   circled it). Remove that line from the panel, or move it so it never touches the card at any height.

Then: `npx tsc --noEmit -p .`, check desktop + 375px phone width, `npm run build` + `npm run seo:check`, commit.

---------------------------------------------------------------------------------------------------------

## B. Unfinished work that was paused (in the working tree, NOT committed)

(Paused work was resumed and committed; the backup folder was removed.)
`npx tsc --noEmit -p .` was clean at pause time.

### B1. Templates. ALL DONE 2026-11-13 (commit 1b419c3): field-placement sentinel test + fixes, 30 old designs restored, standard polished, 14 new (57 total), picker shows the real document, searchable PDF text. templates-qa 63,917 checks / 0 failures. (Original list kept below for reference.)
Files: `utils/templates/registry.ts`, `themes.ts`, `blocks.ts`, `render.ts`, new `utils/templates/kit.ts`,
new `utils/templates/designs/` (`standard.ts`, `premium1-4.ts`, `fresh1-2.ts`, `index.ts`),
`components/forms/Sections.tsx`.
1. **Field placement (highest priority).** Owner: values typed in a form showed up in the wrong box in the
   PDF. For all 12 document types and every template, every form field must appear once, under the right
   label. Build a sentinel test in `scripts/templates-qa.ts` (fill each field with a unique value, render
   with every template, assert each value lands in its section) and fix every mismatch. Forms were already
   checked: they write the correct `types.ts` keys, so bugs are on the template side.
2. **Restore the 20 old designs** from `git show 25ae5cc:components/TemplateSelector.tsx` (lines 40-72) and
   the old renderers, so documents saved with an old design id render with that design again. Partly done
   in `utils/templates/designs/`; finish and verify each one visually.
3. **Improve the basic/standard templates** so they look professional.
4. **Add many more new designs**: at least double the 13 the new version had, on top of the restored
   ones.
5. ~~DONE in the working tree (uncommitted; commit together with Sections.tsx + templates)~~ **Design picker shows the current document**: `Sections.tsx` now reads a `DocumentDesignContext`. One
   line is still missing in `components/forms/FormShell.tsx`: add
   `import { DocumentDesignContext } from './Sections.tsx';` and wrap `{children}` inside `<main>` as
   `<DocumentDesignContext.Provider value={preview ?? null}>{children}</DocumentDesignContext.Provider>`.
6. Optional, last: selectable/searchable text in PDFs (old standard designs wrote real text; the new
   generator saves pages as images). Only if it can be made reliable.
7. Known test failure while this is unfinished: `npx tsx scripts/forms-prefill-qa.ts` 869/870
   (legacy id `template_html_2` no longer maps to `executive`). Fix the mapping or the test.

### B2. AI assistant: multi-step plans. DONE + DEPLOYED 2026-11-13 13:27 (commit 949f6af, 506 QA checks). Remaining: end-to-end test of the owner's exact request in the app (needs the owner to sign in on localhost:3010 as b@b.com).
Files: `supabase/functions/ai-assistant/shared/routerContract.ts`, `prompt.ts`, `mockModel.ts`,
`src/hooks/useAIAssistant.ts`, `src/hooks/useMasterAIRouter.ts`, `src/ai/components/ProposalCards.tsx`,
new `src/ai/planRunner.ts`, new `src/ai/planDocuments.ts`, `App.tsx` (2 lines: `createJob` callback and a
wider `refreshData`).
Goal: "Create one job, two clients Michael and Jake, each with a daily report and an invoice" gives ONE card
listing every step, "Do it all", steps run in order with progress, and documents are saved as Drafts
attached to the right job/client. Single actions keep working as before.
To finish:
1. Complete the implementation and extend `scripts/document-ai-flow-qa.ts`; `npm run qa:document-ai` green.
2. Bundle and deploy the `ai-assistant` function (dashboard editor, "Deploy updates"):
   `npx esbuild supabase/functions/ai-assistant/index.ts --bundle --format=esm --platform=neutral "--external:npm:*" --target=es2022 --outfile=<scratch>/ai-assistant.ts`
3. Test the owner's exact request on localhost:3010 (signed in as the test account b@b.com) and check the
   created job, clients and documents.

---------------------------------------------------------------------------------------------------------

## C. Checks still to do (A and B are finished; build, seo:check, templates-qa, forms-prefill-qa, qa:document-ai all pass as of 2026-11-13 14:10)

Everything below needs the owner signed in on localhost:3010 (Claude cannot type passwords).
0. AI: run the owner's exact request ("one job, clients Michael and Jake, a daily report and an invoice each, just an example") and check the plan card, "Do it all", and the created job/clients/documents.

1. Daily Job Report + new text editor: look at it in the browser (the forms work was only tested by
   scripts). Try every toolbar button, paste from Word/Google Docs, photo upload, checklist, table; then
   download the PDF and check everything prints in the right place.
2. Gmail: connect a Gmail account on localhost:3010 and send a test email (Google may take minutes to hours
   to accept the new `http://localhost:3010/gmail-callback`).
3. Upgrade window: confirm it fits on a laptop screen without scrolling.
4. Mobile: dashboard and forms at 375px; the AI button sits bottom-right; nothing runs off the screen.
5. Full regression pass of the app as b@b.com, then `npm run build`, `npm run seo:check`, all
   `scripts/*qa*` scripts.

---------------------------------------------------------------------------------------------------------

## D. Things only the owner can do

1. Supabase → Edge Functions → Secrets: add `KELVIQ_WEBHOOK_SECRET` (the `kq_whsec_…` of the webhook
   endpoint) and `KELVIQ_SERVER_API_KEY` (Kelviq → Settings → API keys, Live). Until then, paid upgrades are
   not applied to accounts automatically.
2. GitHub push access for this computer (`gh auth login` as Youness00Maache, or add YounessMaache as a
   collaborator). Needed only when you want to publish.
3. Namecheap DNS TXT for Search Console: host `@`, value
   `google-site-verification=5SlJQTlsq6Y_-ZjwIUyUrL1cN3ggRy8FkwYTJSZIOfU`.
4. Rotate the old Gemini key that was in the old `list_models.js` if it is the same as `GEMINI_API_KEY`.
5. Optional: Kelviq organization is named "Framitor"; receipt emails may still show that name
   (Kelviq → Settings → Organization). The checkout itself now shows ContractorDocs + logo.
6. Delete the b@b.com test account when testing is finished.

---------------------------------------------------------------------------------------------------------

## E. Publishing (only when the owner says so)

1. Commit everything, push `my-branch`, merge into `main` → Vercel deploys the new site.
2. Verify the live site (sign-in, AI, Gmail, checkout, PDFs, client portal links).
3. Search Console: verify the domain, submit `https://www.contractordocs.app/sitemap.xml`.
4. After the new site is live and verified, ask the owner before removing the old functions
   `master-ai-router`, `gmail-auth`, `paypal-webhook`, and before cleaning up the ContractoreAI Supabase
   project / un-pausing Textlinker.

---------------------------------------------------------------------------------------------------------

## F. Done so far (for reference)

Commits on `my-branch` (local, not pushed), newest first:
- `9350095` Forms: old behaviours restored (weekly time sheets, optional fields, free-text payment method,
  typed prices kept, picker always visible, Save & Download on phones, Share saves first + "To" field,
  receipt share link, receipt scan fills the client), Daily Report fixes (crew/labor hours, report sections,
  logo sync), rich text editor rebuilt.
- `d1bed87` Landing page redesign without generic icons; free plan = 15 new clients per month; old
  approval links never expire.
- `0791d6b` Inventory check-out to a new client, client names in history, duplicate keeps stock, QR scanner
  photo/flashlight/camera choice, A4 30-up labels, forum camera + "Show more", price book phone layout switch
  + Bundle type, worker double-booking check, translated greeting, mobile AI button fix, AI model fallback.
- `855933a` New edge functions `ai-assistant` and `gmail` (old ones untouched), AI timeout, compact upgrade
  window, logo margin.
- `eaf878a` Original hard-hat logo restored (brand blue) on the site, app and icons.

Live production changes (all owner-approved):
- Edge functions `ai-assistant` and `gmail` deployed; old `master-ai-router`, `gmail-auth`, `paypal-webhook`
  left as they were for the old site.
- Secret `GEMINI_MODEL` = `gemini-2.5-flash` (the previous model hung).
- Database: approval links on the 53 old documents never expire; free plan counts 15 new clients per month
  (migrations `20261113000000_*` and `20261113000100_*`, already applied).
- Kelviq checkout branding: ContractorDocs name + logo (was "Framitor").
- Google Cloud OAuth client: added `http://localhost:3010/gmail-callback`.

Notes:
- On localhost the page reloads by itself whenever code files change (dev server). This closes open panels;
  it doesn't happen on the real site.
- Auth logs showed "Log out" pressed on localhost at 11:26:11 and 11:26:24; the app never signs out on its
  own.
