# Tutorial video: chapter list and coverage map

One video, 30 chapters (YouTube-style: jump to any chapter, "Next section"). Target total ~92 minutes (~13,900 English
words at 150 words per minute). Each chapter = ONE topic, in the order a new contractor needs it. "Wave" = shipping order
(the player ships with wave 1; later waves add chapters without changing anything already live).

Kinds: **S** = screen recording of the real app with demo data. **M** = motion-graphic scene (things you cannot record:
what the client sees on their phone, e-mails, offline syncing, AI thinking, pricing comparison). Most chapters mix both.

| # | id | Chapter title | Min | Wave | Help guides covered (`components/help/helpContent.ts` ids) | Other things it must show |
|---|---|---|---|---|---|---|
| 01 | welcome-setup | Welcome and your first 10 minutes | 3 | 1 | `setup-assistant` | product tour, Settings > company/logo/tax/terms, language + theme, example project |
| 02 | dashboard-navigation | The dashboard and finding your way | 2.5 | 1 | `dashboard`, `notifications` | top bar + Tools menu, bell, "How it works" buttons, phone bottom bar, AI Command button |
| 03 | jobs | Jobs: one place for a whole project | 3 | 1 | `jobs` | job page tabs, status, Financials, duplicate/delete job, free-plan job limit |
| 04 | clients | Clients | 2.5 | 1 | `clients` (client list/notes/temporary clients part) | search, client detail, notes, "Mark as temporary client" |
| 05 | documents | Documents: invoices, estimates and 10 more | 4 | 1 | `documents` | the 12 types, Items/price book tag, Design (templates, accent, paper), Preview, Save/PDF, Copy to another job, repeat invoice, progress billing, change order, receipt, free-plan limits, Settings > Document design |
| 06 | estimates-signatures | Estimates, approvals and e-signatures | 3 | 1 | `estimates` | send approval link, client signs, Accepted, Convert to invoice, Create revision, expiry |
| 07 | options-proposals | Good / better / best, proposals and the estimate check | 4 | 1 | `estimate-options`, `proposals`, `estimate-review` | optional add-ons, scope, payment milestones, photos, save as template, review warnings |
| 08 | send-and-portal | Sending documents and the client portal | 4 | 1 | `messages`, `sent-email-log`, `client-questions-view`, `client-selections-view` | Share menu, Send with Gmail, copy portal link, text/WhatsApp, portal project dashboard, "What my client sees", Emails sent list (**M**: client phone) |
| 09 | get-paid | Getting paid | 3 | 1 | `payments`, `reminders` | Pay now link, "I've paid" from the client, Mark as paid, partial payments, receipt, automatic reminders, review request |
| 10 | leads-requests | Leads and the request-a-quote link | 3.5 | 1 | `quote-link`, `leads`, `appointments` | QR code, inbox, lead board, follow-ups, book appointment, convert to job |
| 11 | reputation | Reviews, feedback and your public page | 2 | 1 | `client-feedback`, `public-profile` | feedback link, testimonials, Google review link, `/r/<slug>` page (**M**) |
| 12 | schedule | The calendar | 2 | 2 | `calendar` (calendar part) | job spans, appointments, task markers, month/week/day |
| 13 | tasks-timeline | Tasks and the job timeline | 3 | 2 | `job-tasks`, `job-timeline` | task board, templates, AI "note to tasks", timeline filters, "Log a conversation" |
| 14 | photos-reports | Job photos and daily reports | 3 | 2 | `photos` | stages, captions, show in portal, mark up, Daily Job Report, Work Order, Material Log |
| 15 | crew-clock | Crew clock-in and time sheets | 2.5 | 2 | `crew` | worker link, clock in/out on a phone (**M**), weekly hours, "My tasks" |
| 16 | punch-lists | Punch lists | 2 | 2 | `punch-list` | items, photos, client sign-off in the portal |
| 17 | papers-warranty | Papers, lien waivers and warranty | 3.5 | 2 | `papers`, `warranty-tracking`, `after-job-emails` | expiry reminders, lien waiver, warranty coverage + claims, thank-you/maintenance e-mails |
| 18 | service-plans | Service plans (repeat maintenance visits) | 2 | 2 | `service-plans` | plan, visits on the schedule, client portal view |
| 19 | price-book | Price book, kits and price lists | 3.5 | 2 | `pricebook`, `import-price-list` | add/duplicate items, save line to price book, starter kits (assemblies: labor, expenses), import a price list |
| 20 | inventory-suppliers | Inventory, suppliers and purchase orders | 4 | 2 | `inventory`, `suppliers` | stock, QR tags, check-out to a job, low stock, supplier catalogue, reorder POs, Record delivery, supplier invoice |
| 21 | job-costing | Job costing, time-and-materials bills and the profit calculator | 3 | 2 | `job-costing`, `calculator` | budget vs actual, spent vs ordered, overruns, T&M invoice, profit calculator |
| 22 | subs-quotes | Subcontractors and comparing quotes | 3.5 | 2 | `subcontractors`, `compare-quotes`, `sub-link` | subcontract, committed cost, sub link "My subcontract" (**M**), quote comparison |
| 23 | selections-files | Selections, mood boards, files and client questions | 4 | 3 | `job-selections`, `job-boards`, `job-files`, `job-questions` | tile example, send to client, approvals, files + versions, submittals |
| 24 | plans-measure | Measuring from plans | 3 | 3 | `plans`, `quick-measure` | upload PDF, calibrate, line/area/count, totals, send to estimate, Quick measure |
| 25 | ai-tools | The AI tools | 4.5 | 3 | `ai`, `read-documents` | AI Command / assistant, AI fill, photo updates, tasks from notes, receipt reading, estimate reviewer, business summary (**M**: AI thinking) |
| 26 | insights-pipeline | Pipeline, Insights and the business overview | 3 | 3 | `pipeline`, `business-overview` | stages, what needs you, period KPIs, best/worst jobs, estimates waiting, CSV |
| 27 | automations-exports | Automations, integrations and exports | 3.5 | 3 | `automations`, `integrations`, `calendar-file`, `accounting-exports` | rules, Gmail connect, .ics download, QuickBooks / Xero CSV, notification settings |
| 28 | offline-phone | Working offline and on your phone | 3.5 | 3 | (documents + dashboard tips, offline audit in `NEXT_STEPS.md`) | install the app, Waiting to sync, what works offline vs needs a connection (**M**: sync animation) |
| 29 | community-help | Community and getting help | 2 | 3 | (Community, Help Center `/tutorials`, "How it works") | forum, search the guides, AI help, contact |
| 30 | plans-account | Plans, pricing and your account | 2.5 | 3 | `settings`, `plans` | Free vs Premium vs Premium + AI (numbers from `lib/plans.ts`), upgrade, billing, delete account. NEVER mention Kelviq or "merchant of record". |

Totals: wave 1 = chapters 01-11 (~34 min), wave 2 = 12-22 (~33 min), wave 3 = 23-30 (~26 min).

## Coverage check (every help guide id -> chapter)
dashboard 02 · setup-assistant 01 · jobs 03 · documents 05 · estimates 06 · estimate-options 07 · proposals 07 ·
estimate-review 07 · read-documents 25 · quick-measure 24 · payments 09 · pipeline 26 · job-costing 21 · ai 25 ·
clients 04 · messages 08 · reminders 09 · quote-link 10 · client-feedback 11 · public-profile 11 · leads 10 ·
appointments 10 · photos 14 · punch-list 16 · job-tasks 13 · job-timeline 13 · sent-email-log 08 · plans 24 ·
job-files 23 · job-questions 23 · client-questions-view 08 · job-selections 23 · job-boards 23 ·
client-selections-view 08 · subcontractors 22 · compare-quotes 22 · sub-link 22 · papers 17 · service-plans 18 ·
warranty-tracking 17 · after-job-emails 17 · inventory 20 · suppliers 20 · pricebook 19 · calculator 21 · calendar 12 ·
business-overview 26 · crew 15 · notifications 02 · automations 27 · integrations 27 · calendar-file 27 ·
accounting-exports 27 · import-price-list 19 · settings 30 (+ 01).  `scripts/validate-chapters.mjs` checks that every id in
`helpContent.ts` is listed in some chapter's `covers`.

Features that have no help guide but must still appear: product tour (01), phone bottom bar + Install app banner (02, 28),
AI Command (02, 25), recurring invoices / progress billing / change orders / receipts / lien waiver (05, 09, 17),
templates + PDF designs (05), assemblies / starter kits (19), time sheets (15), purchase orders (20), Community (29),
Help Center (29), language + theme (01), data export (27).
