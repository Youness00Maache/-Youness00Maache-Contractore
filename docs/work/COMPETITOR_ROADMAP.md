# Competitor feature roadmap (owner request 2026-11-14 ~21:00 UTC)

Source: the owner's "Complete Premium Competitor Feature Analysis" (Buildxact / Houzz Pro / Buildertrend, 46 features).
Goal: add every feature that is missing, finish the missing parts of partial ones, skip what exists. Each batch is
built, tested, confirmed working, then SHIPPED (push my-branch + main; deploy edge functions when touched).

## Rules for this work (owner)
- Pacing: pause at 70% of the 5-hour limit (commit, note state here, one-shot timer just after the reset, continue
  by yourself); stop at 50% WEEKLY until the weekly reset (Thursday 17:00 UTC), then continue. Loop until all shipped.
  Recurring 15-minute get_usage check. (Memory: contractordocs-pacing-roadmap.)
- All the usual rules in NEXT_STEPS.md "HOW TO WORK" (max 2 helpers, Sonnet for simple work, worktrees with the
  node_modules junction, tests before every push, no Docker, never type secrets, never remove old features, no
  generic icon-card design, never mention Kelviq / "merchant of record" on the site).
- DATABASE: new tables / ALTERs / new SQL functions only with the owner's explicit OK. The list to ask about is in
  "DB changes to approve" below. Until the OK, build the no-DB batches.
- Product principles (owner's doc): features connect to existing workflows; advanced tools optional (toggle per
  account, e.g. Settings > Tools); keep navigation small: tasks, selections, files, questions, timeline live INSIDE the
  job page; top-level areas stay Dashboard, Leads, Jobs, Clients, Schedule, Documents, Inventory, Suppliers,
  Analytics, Settings.
- Plan gating: follow the existing pattern (Free = get paid + look professional; Premium = automation, volume, crew;
  Premium+AI = AI that writes/acts). New advanced tools default to Premium unless the old app had them.

## Audit result (2026-11-14, file pointers in brackets)
EXISTS (skip): #28 time clock [components/crew/*], #33 online payments within scope (own pay link, I've paid, Mark as
paid -> receipt; no card processing by design: owner said no Stripe), #24 mostly (offline outbox, PWA, camera,
voice, offline punches; missing only true push + background sync).
PARTIAL: #3 leads (quote_requests + convert), #5 proposals (good/better/best), #6 calendar/follow-ups, #7 quick
measure, #8 assemblies (kits w/ markup), #10/#25 suppliers (user_settings list), #12/#20 files (papers + photos),
#13 product library (price book has images/sku), #16 schedule (job spans only), #17 tasks (punch items), #18 work
orders, #19 daily logs (separate docs), #23/#44 access (crew links), #26 POs (Draft/Sent/Received), #27 inventory,
#29 subs (crew members), #30 budget (costing panel), #31/#43 receipts (Tesseract OCR), #34 accounting (bookkeeper CSV),
#35 analytics, #36 public page (/r/<slug>), #37 email automation (reminders), #38 Google review request, #39 portal,
#40 warranty docs, #41 job AI, #45 tour + tutorials, #46 (Gmail in Communication).
MISSING: #4 job communication timeline, #9 AI estimate reviewer, #11 quote comparison, #14 mood boards,
#15 selections, #21 project questions, #22 submittals, #32 bills to pay, #42 automation rules.
Not building (owner's doc says so): full 3D editor (#12 -> "Project visuals" = files category + external links),
payment processor (#33), enterprise RFI/bidding, push needs VAPID secret from the owner (#24, later).

## Batches. Status: TODO / BUILDING (helper) / SHIPPED <commit>
### No database needed (start here)
N1 AI estimate reviewer (#9): ai-assistant task "review_estimate" (price book slice, lines, totals, markup) ->
   list of findings (missing materials/labor/expenses, odd quantities, math, low markup, price vs price book), shown
   before Send / on demand; accept = adds suggested line, ignore = dismiss; never silent changes. Premium+AI.
   Tests: qa:document-ai cases. Deploy ai-assistant. [Opus]                                     SHIPPED a3723ea
N2 Budget + POs (#30, #26, #27): committed vs actual (Sent/Confirmed POs not yet received = committed; received =
   actual), original vs revised budget, remaining, expected final cost/profit/margin, category overrun highlight;
   PO statuses Draft/Sent/Confirmed/Partially delivered/Delivered/Invoiced/Paid, partial deliveries with remaining
   qty (stock += delivered qty once per delivery), supplier invoice attachment (document-assets bucket), expected
   delivery date. Data in documents.data. Tests: costing-check, supplier-orders-check. [Opus]       SHIPPED a3723ea
N3 Business overview (#35): most/least profitable jobs, estimates awaiting approval list, active jobs, customer +
   project filters, AI monthly summary (Premium+AI, ai-assistant task). Tests: views-logic-check. [Sonnet] TODO
N4 Proposal builder (#5, contractor side): optional line items (shown as "Optional" with their price, not in the
   total unless chosen), project images, structured scope + exclusions, payment milestones (deposit/progress/final
   %), reusable proposal templates (user_settings), all printed in every PDF design. Client toggling optional items
   in the portal needs a SQL function change -> D13. Tests: forms-prefill-qa, templates-qa --no-browser. [Opus] TODO
N5 Assemblies (#8): labor hours + labor rate on kits, expense components, starter kits per trade (bathroom,
   kitchen, painting, electrical, plumbing, roofing, flooring) the user can import into the price book. [Sonnet] TODO
N6 AI document understanding (#31, #43): photo/PDF of a receipt or supplier invoice -> Gemini vision extraction
   (supplier, date, number, items, tax, total, category) -> review -> Expense Log (or PO/bill later); PDF summary;
   auto-classification; Tesseract stays as the offline fallback. Premium+AI. Deploy ai-assistant. [Opus]    TODO
N7 Contextual job AI (#41): add cost/profit/spend-by-category, overdue invoices, reorder list, this-week activity
   aggregates to the assistant context; "summarize this week", "what did we spend on materials", "profit on this
   job"; still proposals only. Deploy ai-assistant. [Opus]                                              TODO
N8 Setup assistant (#45): first-login wizard (business + logo, contact, currency + tax default, services, labor
   rate, payment terms, starter price book with AI suggestions to review, design default, team = crew link) +
   optional example project; skippable, resumable. [Sonnet]                                             TODO
N9 Plan measurement (#7): job "Plans" tool: upload PDF/image (document-assets bucket <user>/plans/<job>/...),
   pdf.js render, calibrate by a known length, line / area / count tools with labels, totals per label, send to an
   estimate as lines (price book match). Measurements JSON stored next to the plan in storage. [Opus]       TODO
N10 Integrations + exports (#46, #34, #6 part, #10 part): Settings > Integrations page (Gmail status/connect,
   Calendar .ics download/subscribe text, QuickBooks Online + Xero CSV import layouts for invoices/contacts/
   expenses, CSV/Excel export, price-list CSV import into the price book with price-change flags). [Sonnet]  TODO
N11 Job timeline (#19, #4 derived part): one per-job "Timeline" tab: documents created/sent/approved/signed/paid,
   daily reports with their time sheets + material logs of that day, photos, notes, reminders sent; dictated
   "conversation note" -> Note document (+ follow-up task once D2 exists). [Sonnet]                         TODO
N12 Automation rules (#42): Settings > Automations: list of predefined rules with on/off (existing hard-wired ones
   + new: estimate approved -> offer/auto create invoice-ready job state, job completed -> warranty draft, PO
   delivered -> stock (exists), invoice overdue -> reminder (exists), task overdue -> notify once D2). [Sonnet,
   after N2/N11]                                                                                       TODO
### Need the owner's DB OK (see list below)
D1 Leads (#3, #6): quote_requests -> leads (stage, budget, follow_up_on, appointment_at, lost_reason, manual add,
   attachments) + Leads view with stages + Convert to job + follow-ups on the calendar.
D2 Tasks + schedule (#16, #17, #18, #19 issues): job_tasks (+ task_comments), Gantt/timeline, milestones,
   dependencies, overdue, templates, AI tasks from voice/daily report, work order <-> task, crew link shows tasks and
   lets a worker mark done with a photo.
D3 Files + questions + submittals (#12, #20, #21, #22): job_files (category, versions, tags, links),
   job_questions (kind question|submittal, approve/reject via portal link).
D4 Suppliers + product library (#10, #13, #25): suppliers + supplier_items (sku, price, url, history), price-change
   flags; saved_items + url/specs/supplier_id.
D5 Selections + boards (#14, #15): job_selections (+ portal approve/comment), job_boards; approved selection -> PO
   + budget.
D6 Bills to pay (#32): bills + bill_payments, overdue notifications, job cost.
D7 Subcontractors + quote comparison (#11, #29, #23): crew_members kind/company/trade, sub_commitments (committed
   cost), job_quotes comparison; sub link view (tasks, docs, photos, progress).
D8 Reviews + public profile (#36, #38): feedback responses + public RPC, request_pages services/about/gallery,
   testimonials on the public page.
D9 Portal project dashboard (#39): portal RPC per job (status, milestones, balance, selections, updates).
D10 Email automations (#37, #40): reminders kinds completion/warranty/maintenance; warranty start/expiry/claims.
D11 Communication log (#4): email_log written by the gmail function on send.
D12 Push notifications (#24): push_subscriptions (+ owner adds VAPID secrets).
D13 Optional items chosen by the client in the portal (#5): signing functions accept the chosen optional lines.

## DB changes to approve (ask once, one short list)
New tables: leads columns on quote_requests (ALTER) + appointments; job_tasks, task_comments; job_files;
job_questions; suppliers, supplier_items; job_selections, job_boards; bills, bill_payments; sub_commitments,
job_quotes; feedback_responses; email_log; push_subscriptions. ALTERs: quote_requests, saved_items, crew_members,
request_pages, reminder kinds. New/changed SQL functions for the portal and links. All additive, RLS owner-only,
same patterns as the crew & field migrations.
OWNER ANSWER: "Yes, approve all" (2026-11-14 ~21:40 UTC) = every table / ALTER / function listed above, D1-D13.
Still: review each migration before applying (RLS owner-only, SECURITY DEFINER + search_path '', `as $$` on every
body, additive only), apply in the SQL editor, verify, add the "Applied <date> with the owner's OK" header.
D12 push also needs VAPID secrets the owner adds (never type them).

## Build order (after N1 + N2), interleaving DB and no-DB, Priority 1 first (owner's doc section 47)
1. D2 tasks + schedule   2. D4 suppliers + product library   3. D9 portal dashboard (+ D3 files)   4. N12 after D2
5. D1 leads + appointments   6. N4 proposal builder (+ D13)   7. N5 assemblies   8. D5 selections + boards
9. D7 subs + quote comparison + sub access   10. D10 warranty + email automations   11. N7 job AI   12. D8 profile +
reviews   13. N3 business overview   14. N6 AI documents   15. N8 setup   16. N9 plan measurement   17. N10
integrations   18. N11 timeline + D11 email log   19. D6 bills   20. D12 push (needs owner's VAPID secrets).

## Coordinator state (fresh session started 2026-11-14 ~21:30 UTC; update after every step)
- Helpers: Opus phase A (SQL + data layer + tests) then Sonnet phase B (UI). Pattern for every DB batch.
- D4 phase A: merged on my-branch (641f73b); migration 20261116000200_suppliers_library.sql APPLIED to production
  2026-11-14 (verified). Phase B (Sonnet UI) building in a worktree.
- D2 phase A (Opus) DONE, commit 8fbce3d on branch worktree-agent-a15acbcf4ec4631a7 (worktree .claude/worktrees/agent-a15acbcf4ec4631a7):
  migration supabase/migrations/20261116000100_job_tasks.sql (job_tasks, task_comments, crew-link RPCs), lib/tasks/*,
  src/ai/extractTasks.ts, ai-assistant shared/taskExtraction.ts + handler route `extract_tasks`, scripts/job-tasks-check.ts
  (228 checks; its header check expects "NOT YET" -> change like supplier-library-check when applying). Its tests all pass.
  NOT merged, SQL NOT applied. STILL TO DO: (1) REVIEW the SQL myself before applying: helper says it grants anon a 3rd
  function `can_upload_crew_task_photo` (storage rule for worker photo upload; same as clock-in upload check) and adds one
  more insert policy on the crew-photos bucket; a worker may only set 'doing'/'done' (+photo/comment); (2) merge, apply in
  the SQL editor, verify, header; (3) Sonnet UI helper (API names: useTasksFeature, tasksApi.*, taskLogic.*, tasksPublicApi
  fetchCrewTasks/updateCrewTask/uploadCrewTaskPhoto, workOrderTasks.*, runExtractTasks); (4) redeploy ai-assistant
  (extract_tasks).
- PAUSED 2026-11-14 ~21:40 UTC at 71% of the 5-hour limit (weekly 23%). Resume timer 23:55 UTC (5-hour reset 23:50).
  D4 phase B (Sonnet UI) DONE and MERGED on my-branch (9a3b8aa; supplier-library-check 253). D4 is ready to SHIP together
  with D2 (not pushed yet). D4 click path to test live: Inventory > Suppliers > a supplier > Catalogue / Price list; Price
  book > edit item > Product; Inventory > low stock > Create reorder POs; a PO > pick a saved supplier. Help text was added
  in components/help/helpContent.ts: run `npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge` once (together with D2's
  help) before shipping, then redeploy ai-assistant. Worktrees to remove at ship time: agent-a8065d0e9893c21f9,
  agent-a851aa5eafd62ef24 (junction first: `cmd /c rmdir <worktree>\node_modules`).
  HAND-OVER (2026-11-14 23:40 UTC, coordinator context passed 150k): a FRESH coordinator session should take over from
  here. Brief for it: "Continue docs/work/COMPETITOR_ROADMAP.md from 'Coordinator state'. Cost rules: NEXT_STEPS.md top
  (rule 8). Apply the DB changes with the SQL-editor method in NEXT_STEPS (Chrome deviceId 23a0a75c...: hidden file input +
  monaco setValue, confirm the destructive dialog, verify read-only, add the 'Applied <date> with the owner's OK' header).
  The owner pre-approved ALL D1-D13 DB changes." Pattern per DB batch: Opus helper = SQL + data layer + tests (phase A),
  review SQL, merge, apply; then Sonnet helper = UI (phase B); no-DB batches = Sonnet. Max 2 helpers. Pacing: pause at 70% of
  the 5-hour limit (one-shot timer after reset), stop at 50% weekly (resume Thu 2026-11-19 17:00 UTC). Old session timers
  (hourly usage check c214774c, resume 0c677266) die with the old session: the new one re-creates them.
  UPDATE 2026-11-15 ~00:10 UTC (owner said: "continue without stopping until you finish" -> no more 70% pauses; only
  stop for a real limit): 5-hour limit reset (1% at 23:50). D2 phase A merged (f4e5932, handler.ts conflict resolved:
  estimate_review + extract_tasks), migration 20261116000100_job_tasks.sql APPLIED + verified. Help knowledge synced
  (0b59250). Helpers running: D2 phase B Sonnet UI (tasks/timeline/templates/AI/work orders/crew page) and D9 phase A Opus
  (portal project dashboard function 20261116000300_portal_project_dashboard.sql + lib/portal). Full test suite running
  in background (scratchpad fullsuite.sh) -> if green: push my-branch + main, redeploy ai-assistant (bundle: esbuild, see
  NEXT_STEPS), Done log for D4 + D2 data layer (D2 UI ships with the next pair).
  SHIPPED 2026-11-15 (see Done log): D4 + D2 data layer; worktrees of finished helpers removed. Still running: D2 phase B
  (Sonnet UI, agent-a39ca3c6a843e297a) and D9 phase A (Opus, agent-ac2e8af93cd125cc2). NEXT: merge both, apply the D9
  migration (20261116000300_portal_project_dashboard.sql), start D9 phase B (Sonnet portal UI) + next Opus phase A (D3
  files/questions/submittals, then D1 leads...), ship D2 UI + D9 as the next pair (sync help knowledge + redeploy
  ai-assistant first).
  2026-11-15 ~01:30 UTC: D9 phase A + B merged on my-branch (cd6630d); get_portal_project_dashboard APPLIED + verified
  (20261116000300, header done). NOT pushed yet (ships with D2 UI). D9 UI: portal "Project" tab (PortalView.tsx), owner
  button "What my client sees" in ClientDetails; click path: /?portal=<key> > Project tab; Clients > client > Client portal
  card. Running: D2 phase B (Sonnet, agent-a39ca3c6a843e297a) and D3 phase A (Opus, agent-ad14aaf9362318f8c: migration
  20261116000400_job_files_questions.sql, lib/jobFiles, lib/questions, portal RPCs get_portal_questions/answer_portal_question).
  2026-11-15 ~03:00 UTC: SHIPPED D2 UI + D9 (main 6dba0a6; full suite green after 2 small fixes; ai-assistant redeployed
  with task help; live bundle has Tasks/Note to tasks/What my client sees). D3 + D1 phase A merged (6045c7f) and BOTH
  migrations APPLIED + verified (20261116000400_job_files_questions.sql, 20261116000500_leads_appointments.sql).
  RUNNING: D3 phase B (Sonnet, agent-aca227d03d93c6dc4: job Files/Questions tabs + portal Questions/Files) and D1 phase B
  (Sonnet, agent-a8dd3fb3603f357bb: Leads board/detail/appointments/calendar). NEXT: merge both, sync help knowledge
  (`npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge`), full suite (scratchpad fullsuite.sh: tsc, all scripts/*-check.ts,
  forms-prefill-qa, payments-qa, qa:document-ai, templates-qa --no-browser, build, seo:check), push, redeploy ai-assistant
  (esbuild bundle + dashboard method; use JS click on the dialog's "Deploy updates" AND check the functions list shows
  "a few seconds ago"), Done log. Then Build order 4-5: N12 automations (Sonnet), N4 proposal builder (+D13), N5
  assemblies, D5 selections + boards, D7 subs + quote comparison, D10 warranty/email automations, N7 job AI, D8 profile +
  reviews, N3 business overview, N6 AI documents, N8 setup, N9 plan measurement, N10 integrations, N11 timeline + D11,
  D6 bills, D12 push (needs VAPID secrets from the owner).
  2026-11-15 ~04:30 UTC: D1 + D3 SHIPPED (see Done log). RUNNING: N12 automations (Sonnet, agent-a93109e97f5456518) and
  N4 proposal builder (Opus, agent-a9e8be64fa26cafe4; no DB; D13 = SQL change to the signing functions comes AFTER, needs
  its own careful review: the helper reports portal/SQL risks). After them: D5 selections + boards (Opus phase A) -> UI,
  N5 assemblies (Sonnet), D7 subs + quote comparison, D10 warranty/email automations, N7 job AI, D8 profile + reviews, N3,
  N6, N8, N9, N10, N11 + D11, D6 bills, D12 push (needs the owner's VAPID secrets).
  2026-11-15 ~06:30 UTC: N4 + N12 SHIPPED. RUNNING (both Opus): D5 selections + boards phase A (agent-a3f89c75be3eef34f;
  migration 20261116000600_selections_boards.sql) and D13 client picks add-ons at signing (agent-a6b861008a11a2d1a; migration
  20261116000700_optional_addons_choice.sql replaces signing + stock functions: REVIEW the diff vs the originals carefully;
  apply the SQL BEFORE shipping the app part). After: D5 phase B (Sonnet UI), N5 assemblies (Sonnet), D7, D10, N7, D8, N3, N6,
  N8, N9, N10, N11 + D11, D6, D12.
  2026-11-15 ~07:30 UTC: D13 (client picks add-ons at signing) merged on my-branch (b01a22f) + its SQL APPLIED + verified
  (20261116000700: 3 new functions sign_document_addons_via_portal / approve_document_addons_by_token / _estimate_addon_patch,
  guard_document_write + _document_stock_lines replaced with only the marked add-on lines changed). The app part is NOT pushed
  yet (tolerant: retries without the add-on parameter when the function is missing). D5 phase A merged (f2675f7) + SQL APPLIED
  + verified (20261116000600). NOT pushed yet: D13 app part + D5 data layer. RUNNING (Sonnet): D5 phase B UI
  (agent-a1b48bbae8e2b8d8b) and N5 assemblies (agent-aeded001445c9d2b5). NEXT: merge both, sync help knowledge, full suite,
  push, redeploy ai-assistant (+ reminders only if its shared/ code changed), Done log (D13 + D5 + N5). Then D7 subs + quote
  comparison (Opus A -> Sonnet B), D10 warranty/email automations (touches reminders edge function), N7 job AI (Opus,
  ai-assistant), D8 profile + reviews, N3 overview (Sonnet), N6 AI documents (Opus), N8 setup (Sonnet), N9 plan measurement
  (Opus), N10 integrations (Sonnet), N11 timeline + D11 email log, D6 bills, D12 push (needs the owner's VAPID secrets).
  2026-11-15 ~04:30 UTC: D13 + D5 + N5 SHIPPED (1c4cd10). RUNNING: N3 business overview (Sonnet, agent-abd0fe49edd61257e) and
  D7 subs + quote comparison phase A (Opus, agent-ac151f44e1be5f483; migration 20261116000800_subs_quotes.sql; ALTERs
  crew_members; sub link RPCs crew_sub_get / crew_sub_accept). NEXT after them: D7 phase B (Sonnet UI), D10 warranty/email
  automations (touches the reminders edge function + a new reminders kind: check supabase/functions/reminders and the
  reminders migration), N7 job AI (Opus; ai-assistant context aggregates; include the AI monthly summary for N3's slot),
  D8 profile + reviews, N6 AI documents (Opus; Gemini vision), N8 setup wizard (Sonnet), N9 plan measurement (Opus),
  N10 integrations (Sonnet), N11 timeline + D11 email log, D6 bills, D12 push (needs the owner's VAPID secrets: never
  type them).
  2026-11-15 ~04:20 UTC USAGE LIMIT REACHED (5-hour 100%, resets 04:50 UTC; weekly 40%). On my-branch, NOT pushed (my-branch
  fb497b6, origin/main 1c4cd10): N3 business overview, D7 phase A (migration 20261116000800 APPLIED + verified, data layer),
  N8 setup assistant (adds `documents.money` setting: tax %, due days, terms for NEW docs only). RUNNING when stopped: D7
  phase B Sonnet UI (agent-a139d0f8e22c8411e, worktree .claude/worktrees/agent-a139d0f8e22c8411e; if it was cut off, check
  its worktree for commits, resume with SendMessage or restart from the brief in this file's history). NEXT: merge D7-B,
  `npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge`, full suite (scratchpad fullsuite.sh), push my-branch + main,
  redeploy ai-assistant, Done log (N3 + D7 + N8). Then D10, N7, D8, N6, N9, N10, N11 + D11, D6, D12.
  2026-11-15 ~05:25 UTC: N3 + N8 + D7 SHIPPED (94aac57). RUNNING (Opus): D10 warranty + post-job email reminders
  (agent-a85366dce76fdb802: reminders edge function + maybe migration 20261116000900 for reminder kinds; REDEPLOY `reminders`
  with JWT verify OFF after merge) and N7 job AI + AI business summary (agent-afaedc695c469247e: ai-assistant task
  business_summary + aggregates; redeploy ai-assistant after merge + `--sync-knowledge` if help changed). REMAINING after
  those: D10 phase B UI (Sonnet), D8 profile + reviews (Opus A -> Sonnet B), N6 AI documents (Opus; Gemini vision), N9 plan
  measurement (Opus), N10 integrations (Sonnet), N11 timeline + D11 email log, D6 bills, D12 push (owner adds VAPID
  secrets; never type them).
  2026-11-15 ~06:10 UTC: D10 phase A merged (f6c9a10) + migration 20261116000900_reminder_kinds_warranty.sql APPLIED +
  verified (reminders kind/step_key checks widened; skip_reminder with the 3 kinds) + `reminders` edge function REDEPLOYED
  (JWT verify still OFF; new kinds are off by default so nothing sends yet). App part (lib/warranty etc.) merged on my-branch,
  NOT pushed. RUNNING: D10 phase B Sonnet UI (agent-ae7bd8327b0ff78fc: warranty coverage + claims in the Warranty form,
  Warranties list, Automations rows for the 3 emails) and N7 Opus (agent-afaedc695c469247e). Ship D10 + N7 together next
  (merge, --sync-knowledge, full suite, push, redeploy ai-assistant, Done log).
  2026-11-15 ~07:30 UTC: D10 + N7 + D8 SHIPPED (b7a13d0). RUNNING: N10 integrations + exports (Sonnet,
  agent-a1cee4ebdecc3f694; ICS file, QuickBooks/Xero CSV layouts, price-book price-list import). REMAINING: N11 job timeline +
  D11 email log (DB email_log written by the gmail function on send: Opus A: SQL + gmail edge function; Sonnet B: timeline
  tab), N6 AI documents (Opus: Gemini vision for receipts/invoices; ai-assistant), N9 plan measurement (Opus: pdf.js,
  measurements JSON in storage), D6 bills to pay (DB; Opus A -> Sonnet B), D12 push (needs the owner's VAPID secrets:
  never type them; ask the owner). Weekly usage was ~44% (stop at 50% = resume Thu 2026-11-19 17:00 UTC).
  2026-11-15 ~07:20 UTC HAND-OVER (weekly 46%, 5-hour 43%; owner rule: stop at 50% weekly; resume Thu 2026-11-19 17:00 UTC):
  EVERYTHING BELOW IS SHIPPED AND LIVE (main = my-branch = abb05e1 + docs): N1, N2, D2, D4, D9, D1, D3, N4, N12, D13, D5, N5, N3,
  N8, D7, D10, N7, D8, N10, N6. All migrations 20261116000100..001100 are APPLIED (headers say so). No helper is running.
  REMAINING (each = Opus phase A, review SQL, apply, Sonnet phase B UI, then ship):
    1. D11 email log (#4/#46): N11 (timeline) is DONE and shipped (57fce1c); D11 = new table email_log written by the `gmail`
       edge function when it sends (redeploy gmail; check `supabase/functions/gmail`) + owner RLS, then fill the empty
       "email" source slot of the timeline (lib/timeline/sources). Opus phase A (SQL + gmail function + data layer), small
       Sonnet phase B (timeline source + a "Sent emails" list).
    2. N9 plan measurement (#7): job "Plans" tool (PDF/image upload to document-assets <user>/plans/<job>/, pdf.js render,
       calibrate by a known length, line/area/count tools with labels, totals per label, send to an estimate as lines with
       price-book match; measurements JSON stored next to the plan). No DB. Opus.
    3. D6 bills to pay (#32): bills + bill_payments tables, overdue notifications (extend N12 automations), job cost. DB.
    4. D12 push notifications (#24): push_subscriptions table + service-worker push + a sender edge function; needs VAPID
       secrets that THE OWNER adds (never type/create them): ask the owner first.
  OWNER TO-DOs: (a) check QuickBooks/Xero column names, account codes, tax names in lib/integrations/accountingExport.ts;
  (b) click-test the new screens with a real account (all helpers verified with fake-data harnesses only): paths are in the Done
  log; (c) test the Premium path of feedback_responses (no Premium account existed when D8 was applied); (d) real-model quality
  of: AI estimate reviewer, task extraction, business summary, receipt reading; (e) Google review link: now offered to EVERY
  rating (policy-safe).
  HOW TO CONTINUE (fresh coordinator session, small context): read this file's top + NEXT_STEPS.md top; pattern per batch is in
  the Done log; helpers Opus for SQL/AI, Sonnet for UI; apply SQL via the Supabase SQL editor method in NEXT_STEPS (Chrome;
  hidden file input + monaco setValue; JS-click "Run" then the confirm dialog; verify with a read-only DO block that raises
  its result); ship: sync help (`npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge`), full suite (scratchpad fullsuite.sh
  = tsc + every scripts/*-check.ts + forms-prefill-qa + payments-qa + qa:document-ai + templates-qa --no-browser + build +
  seo:check), push my-branch and my-branch:main, redeploy changed edge functions (esbuild bundle, dashboard "Deploy updates":
  JS-click the dialog button; confirm "a few seconds ago" in the functions list; `reminders` keeps JWT verify OFF), curl the live
  site/bundles, Done log. Known gotchas: Windows CRLF (read migrations with .replace(/\r\n/g,'\n') in checks); never use
  String.replace with a replacement containing `$'`/`$$` (use a callback); helper worktree folders sometimes stay locked
  ("Permission denied" on remove): ignore or rmdir later; leftover worktree folders .claude/worktrees/agent-a30d73f8a09732abb and
  agent-ae7bd8327b0ff78fc may exist (remove with `git worktree remove --force` after the app restarts).
  OLD NOTE (superseded): review + apply the D2 migration, start the D2 Sonnet UI helper (+ the next phase-A Opus helper: D9 portal
  dashboard / D3 files), then one full test run, push, redeploy ai-assistant, Done log for D2 + D4.
- TODO at the end: one help-guide pass for D2/D4 (+ `npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge`, redeploy ai-assistant).
- Known small gap: saved_items.supplier_id has no same-owner trigger (id is an unguessable uuid; harmless).

## Done log
(append: date, batch, commit, tests, deploys)
- 2026-11-15 SHIPPED N11 job Timeline tab (per-job tab after Photos: 16 sources derived client-side: documents sent/signed/paid/
  converted, daily reports with hours + materials, photos by day/stage, notes, punch, tasks, questions, selections, subs,
  quotes, warranty, feedback, reminders, crew time, expenses, POs; filters, search, paging; "Log a conversation" note ->
  Note document (+ optional follow-up task); email source = empty slot for D11). No DB. main/my-branch 57fce1c; suite green
  (49 steps); live bundle has "Log a conversation". ai-assistant NOT redeployed (help knowledge only): redeploy it with the
  next release. Untested: the real documents query, offline note sync after reconnect, microphone.
  (ai-assistant REDEPLOYED later the same day with all help knowledge up to the timeline: nothing pending to deploy.)
- 2026-11-15 SHIPPED N6 AI document understanding (ai-assistant task `read_document`: 1-4 photos or one PDF <= 4 MB / 10 pages ->
  vendor, date, number, lines, subtotal/tax/total, category from the Expense Log list, per-field confidence, warnings; Expense
  Log "Read with AI" review screen with editable fields + "adds up" indicator; Save uses the existing expense save; Premium + AI;
  Tesseract and manual entry untouched). main/my-branch abb05e1; suite green (48 steps); ai-assistant REDEPLOYED (also carries
  the help knowledge for N10); live bundle has "Read with AI". Not tested: real model accuracy on real receipts, real PDF path.
- 2026-11-15 SHIPPED N10 integrations + exports (Settings > "Integrations & data": Gmail status/connect, calendar .ics download
  with period + include boxes, QuickBooks Online / Xero CSV exports for invoices, customers, expenses, payments (sums equal the
  documents), price-book price-list import with review + "download old prices" instead of undo). main/my-branch 0488329;
  suite green (47 steps); live bundle has "Download calendar file". ai-assistant NOT redeployed for this (help knowledge only):
  redeploy it with N6. TODO for the owner: check the QuickBooks/Xero column names, account codes and tax names in
  lib/integrations/accountingExport.ts against the apps' current import templates (written from memory).
- 2026-11-15 SHIPPED D10 warranty tracking + post-job emails (DB 20261116000900 applied: reminders kind/step_key checks widened +
  skip_reminder; `reminders` edge function REDEPLOYED, JWT verify OFF, new emails Premium + OFF by default; Warranty form
  coverage + claims, Warranties list on the job page, 3 rows in Settings > Automations), N7 job AI (assistant answers from job /
  business numbers; ai-assistant task `business_summary` + "Summarize with AI" in the Insights overview; ai-assistant REDEPLOYED)
  and D8 client feedback + testimonials + richer public profile (DB 20261116001000 applied + 20261116001100 applied =
  submit_feedback returns the Google link for EVERY rating: no review gating, Google forbids it; `/feedback/<token>` page,
  Job > Ask for feedback, Settings > Request-a-quote link > Client feedback / Public profile, `/r/<slug>` extras).
  main/my-branch b7a13d0; suite green (46 steps). Not clicked live (needs the owner's account); the Premium insert path of
  feedback_responses could not be exercised (no Premium account yet); QuickBooks/Xero columns (N10) to be checked.
- 2026-11-15 SHIPPED N3 business overview (top of Insights: period KPIs, best/worst jobs by profit, estimates waiting on a yes,
  active jobs, revenue by customer, filters, CSV, AI slot), N8 setup assistant (first-login sheet, "Setup x of y" hint, Settings
  resume + example project add/remove; new settings key `documents.money` = tax %, due days, terms for NEW docs only) and D7
  subcontractors + quote comparison + sub link (DB 20261116000800 applied 2026-11-15: crew_members kind/company/trade,
  job_quotes, sub_commitments, crew_sub_get / crew_sub_accept; job Subs tab, crew screen Worker/Subcontractor, "My subcontract"
  on the crew link, "Subcontracts (committed)" in job financials). main/my-branch 94aac57; suite green (44 steps);
  ai-assistant redeployed (help for overview / setup / subs). Click paths: Insights (top); Settings > Setup assistant;
  dashboard "Setup x of y"; Job > Subs > Subcontracts / Quotes; Crew > Members > Edit > Type; /clock/<sub token> > My
  subcontract > Accept. Not clicked live (needs the owner's account).
- 2026-11-15 SHIPPED D13 client chooses add-ons when signing (DB 20261116000700 applied: 3 new functions + guard_document_write /
  _document_stock_lines with only the add-on lines changed; app tolerant when the function is missing), D5 client selections +
  mood boards (DB 20261116000600 applied; job Selections/Boards tabs, portal "Your selections" + "Ideas board", selections
  line in job financials, PO draft from an approved selection) and N5 assemblies (labor hours/rate/burden, expense rows,
  14 starter kits in 7 trades; old kits identical). main/my-branch 1c4cd10; suite green (41 steps); ai-assistant
  redeployed; live bundle has "Your selections", "Ideas board", "Starter kits", "Add to my estimate". Click paths: Job >
  Selections > New (Tile) > Send; client link > Your selections; Estimate > send add-ons client link > tick add-ons >
  sign; Price book > Starter kits; kit editor > Labor / Expenses. Not clicked live (needs the owner's account).
- 2026-11-15 SHIPPED N4 proposal builder (optional add-ons excluded from totals via utils/money.ts isExcludedOptionalLine /
  countedLineItems, structured scope, payment milestones + deposit invoice via progress billing, project photos, reusable
  templates; owner-only for now) and N12 Settings > Automations (rules: estimate approved -> invoice draft, job completed ->
  warranty draft, overdue tasks, lead follow-ups, client answers, estimate no-answer; existing reminders as switches). No DB.
  main/my-branch 4abcf65; suite green (38 steps); ai-assistant AND reminders redeployed (reminders keeps JWT verify OFF;
  its money.ts skips unselected optional lines); live bundle has "Optional add-ons", "Save as template", "What to invoice",
  "Automations". Click paths: Estimate form > Optional add-ons / Proposal (Scope, Payments, Photos) / Save as template;
  Convert to invoice > "What to invoice"; Settings > Automations. Not clicked live (needs the owner's account).
  KNOWN RISK until D13: SQL stock function counts every line of an accepted estimate (an unselected add-on linked to an
  inventory item would take stock); D13 (helper running) fixes it.
- 2026-11-15 SHIPPED D1 leads + appointments (Leads board/list, lead window, manual add, follow-ups + appointments on the
  Schedule, .ics, "due" count) and D3 job files + client questions/submittals (job Files/Questions tabs; portal "Questions
  for you" + Files). DB 20261116000400 + 20261116000500 applied 2026-11-15 (verified; D1 guard trigger tested with a
  rolled-back insert). main/my-branch 23cd475; suite green (36 steps); ai-assistant redeployed (help for leads/files/questions);
  live bundle has "Needs follow-up", "Add lead", "Questions for you", "Upload new version". Click paths: Leads (nav);
  lead > Book appointment / Convert to job; Job > Files / Questions; /?portal=<key> > Project > "Questions for you"
  (not clicked live: needs the owner's account).
- 2026-11-15 SHIPPED D2 job tasks + schedule UI (Tasks tab, Timeline, calendar markers, templates, AI "Note to tasks", work-order
  tasks, worker "My tasks") and D9 client portal project dashboard (portal Project tab, owner "What my client sees"); DB:
  20261116000100 (applied 2026-11-15), 20261116000300 get_portal_project_dashboard (applied 2026-11-15). main/my-branch
  6dba0a6; suite green (tsc, 29 checks, forms 945, payments 153, qa:document-ai 1473, templates 31418, build, seo 51);
  ai-assistant redeployed (help for tasks/dashboard); live bundle verified. Click paths: Job > Tasks; Documents > Work Order
  > Tasks; Tools > Calendar; crew link > My tasks; /?portal=<key> > Project tab; Clients > client > Client portal >
  "What my client sees" (not clicked through live: needs the owner's account).
- 2026-11-15 SHIPPED D4 suppliers + product library (UI + data layer, migration 20261116000200 applied 2026-11-14) and D2
  data layer (migration 20261116000100 applied 2026-11-15; AI extract_tasks route; UI still to ship): main/my-branch
  4d5c56f. Full suite green (tsc, 29 check scripts, forms 945, payments 153, qa:document-ai 1473, templates 31418, build,
  seo 51). ai-assistant redeployed (398 KB: estimate_review + extract_tasks + supplier help); live site 200, live bundle has
  the supplier screens. D4 live click path: Inventory > Suppliers > a supplier > Catalogue / Price list; Price book > edit
  item > Product; Inventory > low stock > Create reorder POs; PO > pick a saved supplier (not clicked through live: needs
  the owner's account).
- 2026-11-14 ~22:45 UTC: N1 estimate reviewer (deterministic checks every plan + AI missing-items Premium+AI; estimate-review-check 101, qa:document-ai 1438) and N2 budget dashboard (original/revised budget, spent vs ordered, remaining, expected final cost, category overruns) + PO lifecycle (Confirmed / Partially delivered / Delivered / Invoiced / Paid, Record delivery once per delivery, supplier invoice attachment; costing-check 155, supplier-orders-check 209). All 31 suites pass. Pushed my-branch + main a3723ea; ai-assistant redeployed (376 KB, boots). Not click-tested signed in.
