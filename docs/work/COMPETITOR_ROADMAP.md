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
   Tests: qa:document-ai cases. Deploy ai-assistant. [Opus]                                     BUILDING (helper, 2026-11-14 21:20)
N2 Budget + POs (#30, #26, #27): committed vs actual (Sent/Confirmed POs not yet received = committed; received =
   actual), original vs revised budget, remaining, expected final cost/profit/margin, category overrun highlight;
   PO statuses Draft/Sent/Confirmed/Partially delivered/Delivered/Invoiced/Paid, partial deliveries with remaining
   qty (stock += delivered qty once per delivery), supplier invoice attachment (document-assets bucket), expected
   delivery date. Data in documents.data. Tests: costing-check, supplier-orders-check. [Opus]           TODO
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
OWNER ANSWER: (pending)

## Done log
(append: date, batch, commit, tests, deploys)
