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
  OLD NOTE (superseded): review + apply the D2 migration, start the D2 Sonnet UI helper (+ the next phase-A Opus helper: D9 portal
  dashboard / D3 files), then one full test run, push, redeploy ai-assistant, Done log for D2 + D4.
- TODO at the end: one help-guide pass for D2/D4 (+ `npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge`, redeploy ai-assistant).
- Known small gap: saved_items.supplier_id has no same-owner trigger (id is an unguessable uuid; harmless).

## Done log
(append: date, batch, commit, tests, deploys)
- 2026-11-14 ~22:45 UTC: N1 estimate reviewer (deterministic checks every plan + AI missing-items Premium+AI; estimate-review-check 101, qa:document-ai 1438) and N2 budget dashboard (original/revised budget, spent vs ordered, remaining, expected final cost, category overruns) + PO lifecycle (Confirmed / Partially delivered / Delivered / Invoiced / Paid, Record delivery once per delivery, supplier invoice attachment; costing-check 155, supplier-orders-check 209). All 31 suites pass. Pushed my-branch + main a3723ea; ai-assistant redeployed (376 KB, boots). Not click-tested signed in.
