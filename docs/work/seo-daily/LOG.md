# SEO daily log (newest first). Procedure: `DAILY_PROCEDURE.md`. Data snapshots: `metrics/`.

## State (update at the end of every run)
- Timer: `contractordocs-daily-seo`, every day 19:00 local (PC time zone UTC+0). Set up 2026-11-15.
- First publication: 2026-11-17 (the setup session's article, published by hand at the owner's request; the 2026-11-16
  timer run had skipped: weekly usage at 90%).
- METHOD CHANGED 2026-11-24 (owner): data-first topics (Search Console + Keyword Planner volumes), SERP check, one post
  at a time, 1-2 page improvements every day. See "The method" at the top of DAILY_PROCEDURE.md.
- Posts live from this routine: 24 (20 up to 2026-11-24 + 4 on 2026-11-26). Posts before it: 24. Registry order = newest first.
- Last data review: 2026-11-24 short review (`metrics/2026-11-24.md`, Google only). Next full review (Google + Bing,
  Page indexing report) due 2026-11-27: DO IT on the next run.
- Pending Google indexing requests (pending-index): none. On 2026-11-26 the 7 posts of 2026-11-24 were already indexed;
  the electrician page, home and /estimate-generator were requested again.
- Unpublished work waiting on branch `seo-daily`: none (everything is on origin/main).
- Google quota tip: run the Google requests BEFORE ~20:00 local, or at least before the Framitor job reaches its
  indexing step, because both share the account's daily quota.
- Chrome note 2026-11-26: the owner's device (deviceId 23a0a75c) showed as "Browser 3"; select it by deviceId. In a
  narrow window the URL inspection box is hidden behind the search icon.
- Usage: NO stop line any more (owner's order 2026-11-17: run every day whatever the percentages). See step A of the procedure.

## Access check, 2026-11-15 ~21:30 UTC (setup session, look only, nothing changed)
Chrome: one browser connected, shown as "Browser 1" (deviceId 23a0a75c-cc82-4d0f-b3b0-312e9279d13e; NEXT_STEPS calls the
same device "Browser 2"; select it by deviceId). Both dashboards were already signed in and loaded in 5 to 10 seconds.
- Google Search Console, property `https://www.contractordocs.app/` (URL-prefix): opens. Sitemaps: `/sitemap.xml`
  submitted Nov 14 2026, last read Nov 14 2026, status Success, 37 discovered pages (it was read BEFORE the 14 landing
  pages and the 9 newest posts existed on the site: it will pick up the 51+ URLs on its next read; a "Submit" of the same
  sitemap URL is allowed if it has not re-read it in a few days). Performance: 0 clicks and 0 impressions, data only up to
  11/13/26 (data is about 2 days behind). Page indexing report: "Processing data, please check again in a day or so" (the
  property is new). URL Inspection of https://www.contractordocs.app/blog/contractor-paperwork-checklist: "URL is on
  Google", page is indexed, HTTP 200, "Request indexing" button present (not clicked).
- Bing Webmaster Tools, site `https://www.contractordocs.app/` (imported from Google): opens. Sitemap `/sitemap.xml`
  imported 11/14/2026, last crawl 11/14/2026, status Success, 37 URLs discovered, 0 errors. Home says data and reports
  take up to 48 hours to appear. URL Submission: quota 100 URLs per day, 0 submitted in the last 28 days (not used yet).
- Blockers: none. Expect empty data in the first review (day 3); judge by indexation first, impressions second.

## Topic backlog (take the best unused rows; add rows from data reviews at the TOP)
Rating: H = specific question with clear buyer/contractor intent, M = good, L = fill-in. Status: `todo`, `used <date>`.
Verify every fact (laws, numbers, product features) before writing. Legal and tax topics: rules vary by state.

| Rating | Working title / target query | Intent | Notes | Status |
| --- | --- | --- | --- | --- |
| H | change order template (copyable, filled-in) | template | KP 2026-11-24: "change order template" 1K-10K; check overlap with change-order-form-guide (47 impr, pos 30.7): maybe refresh that post for this query instead | used 2026-11-26 |
| H | construction proposal template | template | KP: 1K-10K; distinct from scope of work and estimate template; link estimate-vs-quote-vs-bid | used 2026-11-26 |
| H | subcontractor agreement: what to include (checklist) | template | KP: subcontractor agreement / contract 1K-10K each; not legal advice; app: subcontracts (Premium) | used 2026-11-26 |
| H | certificate of completion (construction) template | template | KP: certificate of completion 1K-10K, construction variant 100-1K | used 2026-11-26 |
| M | net 30 invoice: what it means for contractors | question | KP: net30 1K-10K, net 30 invoice 100-1K; "net 30 vs due on receipt" row below | used 2026-11-26 |
| M | HVAC service call pricing: flat fee vs hourly | comparison / trade | KP: 100-1K (service call cost, average hvac service call cost); write for HVAC contractors, no invented prices | todo |
| M | HVAC invoice template | template / trade | KP: 100-1K; model: free-electrical-invoice-template | todo |
| M | bid proposal / contractor bid template | template | KP: 100-1K each; link estimate-vs-quote-vs-bid | todo |
| H | REFRESH how-to-calculate-job-profit-margin for "markup vs margin" | refresh | KP: markup vs margin 1K-10K; post ranks ~60 for "job margin" (54 impr) | todo |
| H | work order examples (filled-in, by trade) | template | data 2026-11-20: "work order example" 7, "example of work order" 5, "work order sample"; work-order-template ranks 55; distinct intent: examples, link to the template | used 2026-11-22 |
| H | can construction contracts and change orders be signed electronically (is it legally binding) | question | data 2026-11-20: question queries rank 2-3.5; rules vary, not legal advice; check overlap with e-signatures-for-contractors first (maybe extend that post instead) | todo |
| M | what is a good job margin for small contractors | question | data 2026-11-20: "job margin" 26 impr at pos 55; no invented benchmarks; overlap check with the profit margin post | todo |
| H | how to write a scope of work for a construction job (template) | template | dry run 2026-11-15 | drafted |
| H | what to do when a client won't pay a contractor | how-to | reminders, demand letter, lien, small claims; rules vary | used 2026-11-17 |
| H | contractor deposit: how much can you ask for | question | states limit deposits differently; no invented %; formula + examples | used 2026-11-22 |
| H | past-due invoice letter / payment reminder templates for contractors | template | 3 tones: friendly, firm, final | used 2026-11-17 |
| H | estimate vs quote vs bid vs proposal: what is the difference | question | KP 1K-10K | used 2026-11-24 |
| H | estimate vs invoice: what is the difference | question | links to both generators | used 2026-11-17 |
| H | how to follow up on an estimate (scripts and timing) | how-to | | used 2026-11-17 |
| H | contractor payment schedule template (milestone billing) | template | KP 100-1K | used 2026-11-24 |
| H | punch list template for contractors and how to run one | template | KP 1K-10K | used 2026-11-24 |
| H | job closeout checklist for contractors | template | warranty, final invoice, lien waiver, photos | used 2026-11-20 |
| H | time and materials vs fixed price contract | comparison | when each fits, examples | used 2026-11-20 |
| H | cost-plus contract explained for small contractors | comparison | KP 1K-10K | used 2026-11-24 |
| H | how to estimate a painting job (labor, materials, prep) | how-to / trade | method + worked example, no invented rates | used 2026-11-20 |
| H | how to estimate a roofing job (squares, waste, tear-off) | how-to / trade | link /for/roofers | used 2026-11-22 |
| H | how to estimate a deck / fence / landscaping job | how-to / trade | deck used 2026-11-24; fence, landscaping todo | todo |
| H | HVAC service call pricing: flat rate vs hourly | comparison / trade | link /for/hvac | todo |
| M | free HVAC / roofing / painting / landscaping / handyman invoice template (one per trade) | template | model: free-plumbing-invoice-template | todo |
| M | how to set your labor rate (burden, overhead, billable hours) | how-to | formula and example | used 2026-11-20 |
| M | how much markup to put on materials | question | markup vs margin link, no fixed "right" number | todo |
| M | retainage explained for subcontractors | question | KP 1K-10K | used 2026-11-24 |
| M | progress billing / schedule of values step by step | how-to | | used 2026-11-22 |
| M | net 30 vs due on receipt for contractors | question | | todo |
| M | how to take job-site photos that protect you (before, during, after) | checklist | | used 2026-11-24 |
| M | final walkthrough checklist and certificate of completion | template | | todo |
| M | how to schedule multiple jobs and crews | how-to | | todo |
| M | how to track leftover materials and tools (small contractor inventory) | how-to | | todo |
| M | do contractors charge sales tax on labor and materials | question | varies by state; point to state tax office; no invented rates | todo |
| M | late fee clause wording for contractor invoices | template | legal caution | todo |
| M | contractor quote request form: what to ask before you bid | template | | todo |
| L | free invoice generator vs invoicing software for contractors | comparison | | todo |
| L | how to turn a phone call into an estimate in 10 minutes | how-to | AI assistant angle | todo |
| L | how to write a change order for a handyman job (example) | how-to / trade | | todo |

## Daily entries

### 2026-11-26 (published: 4 articles + 1 improvement)
Usage at start: weekly 0% (all models), no 5-hour window reported (information only). No entry for 2026-11-25 (nothing
from that day on origin/main or on this branch).
Topics and volumes (Keyword Planner, US, English, read 2026-11-24): certificate of completion 1K-10K (construction
variant 100-1K), construction proposal template 1K-10K, subcontractor agreement / contract 1K-10K, net30 1K-10K (net 30
invoice 100-1K). Keyword Planner was not reopened today (two-day-old volumes, enough backlog rows).
Search Console 28 days (11/11-11/24): 4 clicks, 1.69K impressions, CTR 0.2%, position 39; overview shows 59 pages
indexed, 4 not indexed.
SERP check (WebSearch, search summaries only, no page fetched): template sites and software vendors rank (Sitemate,
Mastt, Certifier; Smartsheet, ClickUp, PandaDoc, Jobber; JobNimbus, Knowify; Invoice Simple, InvoiceOwl, Sage). Our posts
add copyable field tables, invented examples whose numbers add up, wording to copy, checklists and state-rules caution.

| # | Slug | Target query | Intent | URL | Live (Googlebot) | IndexNow | Google request | Bing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | certificate-of-completion-construction | certificate of completion construction | template | https://www.contractordocs.app/blog/certificate-of-completion-construction | 200, title, JSON-LD ok, in sitemap | HTTP 200 | requested | Submitted |
| 2 | construction-proposal-template | construction proposal template | template | https://www.contractordocs.app/blog/construction-proposal-template | same | same | requested | Submitted |
| 3 | subcontractor-agreement-checklist | subcontractor agreement | checklist | https://www.contractordocs.app/blog/subcontractor-agreement-checklist | same | same | requested | Submitted |
| 4 | net-30-invoice-for-contractors | net 30 invoice | question | https://www.contractordocs.app/blog/net-30-invoice-for-contractors | same | same | requested | Submitted |

Improved https://www.contractordocs.app/blog/change-order-form-guide: new title "Change Order Template for Contractors
(Free, With Example)", description, answer, copyable "Change order template" section, 3 H2s phrased as questions,
keywords, updated = 2026-11-26 (because: 59 impressions, 1 click, position 28.7; "change orders" 25 impressions at 35;
"change order template" 1K-10K and the page had no copyable template). Judge at the review after next.
Checks: lint, tsc (before post 1; later posts add only typed content, covered by each build), build and seo:check
(75 pages) green. Final push 047f4c4. IndexNow after the last push: 75 URLs, HTTP 200.
Google: 8 requests accepted, no quota message (4 new posts, change order guide, electrician invoice page,
/estimate-generator, home). Already indexed, so not requested: the 7 posts of 2026-11-24.
Product claims checked in components/help/helpContent.ts (proposals, subcontracts and papers on Premium, reminders).
The certificate post states that ContractorDocs has no certificate of completion document type.

### 2026-11-24 (published: 7 articles + 1 improvement; method switched to the Framitor way)
Usage at start: 5-hour 22%, weekly 90% (information only). The owner stopped the timer run at its first command, asked
why posts were missing and why the routine is worse than the Framitor SEO job, then said "Yes, upgrade and run".
- Missed days found: 2026-11-21 (run finished, published nothing, no log), 2026-11-23 (run wrote 3 posts, committed 2
  and left the punch list post uncommitted and 125 words short; nothing pushed; no log; the data review due that day was
  skipped). Today published those 3 too (dates set to 2026-11-24).
- Procedure upgraded (DAILY_PROCEDURE.md "The method", B, "Order of work", E Googlebot check, H1) and the timer prompt
  (scheduled task SKILL.md) updated to match.
| # | Slug | Target query (US volume, Keyword Planner) | Intent | URL | Live (Googlebot) | IndexNow | Google request | Bing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | punch-list-template-for-contractors | punch list (1K-10K) | template | https://www.contractordocs.app/blog/punch-list-template-for-contractors | 200, title, JSON-LD ok, in sitemap | 71 URLs, HTTP 200 | Quota Exceeded: pending-index | Submitted |
| 2 | job-site-photos-for-contractors | job site photos for contractors (not measured) | checklist | https://www.contractordocs.app/blog/job-site-photos-for-contractors | same | same | pending-index | Submitted |
| 3 | how-to-estimate-a-deck-job | deck estimate (100-1K) | how-to / trade | https://www.contractordocs.app/blog/how-to-estimate-a-deck-job | same | same | pending-index | Submitted |
| 4 | cost-plus-contract-for-contractors | cost plus contract (1K-10K) | comparison | https://www.contractordocs.app/blog/cost-plus-contract-for-contractors | same | same | pending-index | Submitted |
| 5 | estimate-vs-quote-vs-bid | estimate vs quote / quote vs estimate (1K-10K each) | question | https://www.contractordocs.app/blog/estimate-vs-quote-vs-bid | same | same | pending-index | Submitted |
| 6 | retainage-in-construction | retainage in construction (1K-10K) | how-to | https://www.contractordocs.app/blog/retainage-in-construction | same | same | pending-index | Submitted |
| 7 | construction-payment-schedule-template | construction / contractor payment schedule (100-1K each) | template | https://www.contractordocs.app/blog/construction-payment-schedule-template | same | same | pending-index | Submitted |
Improved: https://www.contractordocs.app/blog/free-electrical-invoice-template: H2s use the searched words (sample,
example, "What should an electrician invoice include?"), new self-employed electrician section, description and
keywords (because: 167 impressions, 0 clicks, "electrician invoice sample" pos 23.3, "electrician invoice example" 29.6,
"invoice template electrician" 18.7). updated = 2026-11-24. Bing submitted; Google pending-index.
Notes:
- SERP check (WebSearch) before writing: Procore, Autodesk, NetSuite, FreshBooks, Jobber dominate these queries; our
  posts add worked examples with numbers, copyable tables and wording, small-contractor focus, state-rules caution.
- Product claims checked in components/help/helpContent.ts (proposals/payment schedule presets, job costing/Bill T&M,
  subcontracts with retainage (Premium), punch lists on every plan). No invoice-level retainage feature exists: the
  retainage post says so implicitly (ledger table) and does not claim one.
- Pushes: c5f9b2c (punch list + dates), 8246995 (cost-plus), 5eb8bcb (estimate vs quote, retainage), 740ae80 (payment
  schedule + electrician improvement). The last push first failed with GitHub "Internal Server Error", then worked.
  Posts 2 and 3 of the new ones were pushed together (one build) to save time.
- Keyword Planner opened in Morocco / French by default: switched to United States / English before reading.
- Related lists: T&M -> cost-plus, progress billing -> retainage, estimate vs invoice -> estimate vs quote, deposit ->
  payment schedule.

### 2026-11-22 (published: 4 articles; no data review, next due 2026-11-23)
Usage at start: 5-hour 49%, weekly 62% (information only). No entry existed for 2026-11-21 (no run that day).
| # | Slug | Target query | Intent | URL | Live (HTTP) | IndexNow | Google request | Bing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | work-order-examples-for-contractors | work order examples | template | https://www.contractordocs.app/blog/work-order-examples-for-contractors | 200, title correct, in sitemap | 60 URLs, HTTP 200 | Indexing requested | Submitted |
| 2 | how-to-estimate-a-roofing-job | how to estimate a roofing job | how-to / trade | https://www.contractordocs.app/blog/how-to-estimate-a-roofing-job | same | same | Indexing requested | Submitted |
| 3 | how-much-deposit-can-a-contractor-ask-for | how much deposit can a contractor ask for | question | https://www.contractordocs.app/blog/how-much-deposit-can-a-contractor-ask-for | same | same | Indexing requested | Submitted |
| 4 | progress-billing-schedule-of-values-for-contractors | progress billing schedule of values | how-to | https://www.contractordocs.app/blog/progress-billing-schedule-of-values-for-contractors | same | same | Indexing requested | Submitted |
Notes:
- Checks: lint, tsc, build, seo:check (64 pages) green; pushed seo-daily:main (c1ef57f..9e70336). Live about 4 minutes later.
- Backlog rows used: work order examples (from the 11-20 data), contractor deposit, progress billing / schedule of values,
  roofing estimate. Product claims (deposit line on estimate-to-invoice conversion, progress invoice with % complete,
  deposit wording in settings, work order tasks) checked against components/help/helpContent.ts.
- Related lists updated (no visible text change, no date bump): work-order-template, how-to-write-a-construction-invoice,
  how-to-estimate-a-painting-job.
- Bing: form_input did not fill the URL box; typing into it worked (quota 100 -> 96). Google: 4 requests, no quota message.
- Pending-index: none. For the 2026-11-23 review: judge the 11-20 decisions (electrician invoice title, paperwork
  checklist, the two Discovered posts) and the 11-21 owner-session changes (308 apex redirect, generator titles).

### 2026-11-20 (published: 4 articles; first data review done)
Usage at start: 5-hour 0%, weekly 17% (information only).
| # | Slug | Target query | Intent | URL | Live (HTTP) | IndexNow | Google request | Bing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | how-to-estimate-a-painting-job | how to estimate a painting job | how-to / trade | https://www.contractordocs.app/blog/how-to-estimate-a-painting-job | 200, in sitemap, lastmod 2026-11-20 | 60 URLs, HTTP 200 | Indexing requested | Submitted |
| 2 | how-to-set-your-contractor-labor-rate | how to set your contractor labor rate | how-to | https://www.contractordocs.app/blog/how-to-set-your-contractor-labor-rate | same | same | Indexing requested | Submitted |
| 3 | job-closeout-checklist-for-contractors | job closeout checklist for contractors | template | https://www.contractordocs.app/blog/job-closeout-checklist-for-contractors | same | same | Indexing requested | Submitted |
| 4 | time-and-materials-vs-fixed-price-contract | time and materials vs fixed price contract | comparison | https://www.contractordocs.app/blog/time-and-materials-vs-fixed-price-contract | same | same | Indexing requested | Submitted |
Notes:
- No log entries exist for 2026-11-18 and 2026-11-19. The 11-18 run left posts 1 and 2 written but uncommitted and
  unregistered in the worktree (files dated 11-18 19:10); nothing from 11-19. This run finished them (the labor rate post
  was 75 words short and missing a product link; its FAQ linked the T&M post, which is one reason #4 was chosen),
  registered, checked and published them. Cause of the two missed days unknown: check the timer's run history.
- Checks: lint, tsc, build, seo:check (60 pages) green; pushed seo-daily:main (0475e46..e9ae2a4). Vercel took about 4
  minutes; until then the new URLs answered 200 with the generic app shell (SPA fallback), so check the page title,
  not just the HTTP code.
- Data review: see metrics/2026-11-20.md and the Decisions log below. Edited: free-electrical-invoice-template (title,
  description, answer opening; updated 2026-11-20), contractor-paperwork-checklist (3 in-context links; updated
  2026-11-20), related lists of 5 older posts (no visible text change, no date bump). Second push, IndexNow and Google
  re-requests for the edited / unindexed URLs: see the follow-up line under this entry.
- Follow-up: data-review commit pushed (e9ae2a4..6ee1e16), live after ~1 minute, IndexNow 60 URLs HTTP 200. Google
  "Indexing requested" for free-electrical-invoice-template (indexed), best-invoicing-software-for-contractors and
  construction-time-sheet-tracking (both Discovered - not indexed), contractor-paperwork-checklist (indexed). 8 Google
  requests today, no quota message. Pending-index: none. One inspection hung on "Retrieving data" for ~50 s, then loaded.

### 2026-11-17 evening run (published: 4 articles)
Usage at start: 5-hour 7%, weekly 95% (information only, per the owner's order).
| # | Slug | Target query | Intent | URL | Live | IndexNow | Google | Bing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | what-to-do-when-a-client-wont-pay-a-contractor | what to do when a client won't pay a contractor | how-to | https://www.contractordocs.app/blog/what-to-do-when-a-client-wont-pay-a-contractor | 200, in sitemap | 56 URLs, HTTP 200 | Indexing requested | Submitted |
| 2 | past-due-invoice-letter-templates-for-contractors | past due invoice letter template | template | https://www.contractordocs.app/blog/past-due-invoice-letter-templates-for-contractors | 200, in sitemap | same | Indexing requested | Submitted |
| 3 | how-to-follow-up-on-a-construction-estimate | how to follow up on a construction estimate | how-to | https://www.contractordocs.app/blog/how-to-follow-up-on-a-construction-estimate | 200, in sitemap | same | Indexing requested | Submitted |
| 4 | estimate-vs-invoice-difference | estimate vs invoice | question | https://www.contractordocs.app/blog/estimate-vs-invoice-difference | 200, in sitemap | same | Indexing requested | Submitted |
Notes: lint, tsc, build, seo:check all green (56 pages); pushed seo-daily:main (b02ec65..34f9cd7). Product claims used
(automatic reminders via Gmail: invoices due date +7/+14 days, estimates +3/+7 days; convert estimate to invoice/deposit)
come from components/help/helpContent.ts. Not done: adding the new posts to the `related` lists of older posts (do it at
the first data review). Backlog rows used: client won't pay, past-due letters, follow up on estimate, estimate vs invoice.

### 2026-11-17 owner's order: no usage stop line, the routine runs every day
The owner answered: the articles, pages and Google/Bing requests must keep happening whatever the weekly limit or the
percentage is. Step A of DAILY_PROCEDURE.md and the timer prompt were changed (no skip, no stop; percentages are only
logged). The 19:07 UTC run of 2026-11-17 is the first one under the new rule.

### 2026-11-17 (published by hand: 1 article; the rest paused by the usage rule, owner informed)
Owner asked why the timer was not posting. Cause: the 11-16 run (and the 11-17 19:07 run) stop at step A because weekly
usage is at 90% or more (94% now), a line this routine set on the brief's advice (the owner's own project rule in
NEXT_STEPS says "stop entirely at 95% weekly"). Published the one finished article now (cheap):
| # | Slug | Target query | Intent | URL | Live | IndexNow | Google | Bing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | how-to-write-a-construction-scope-of-work | how to write a scope of work (construction scope of work template) | how-to + template | https://www.contractordocs.app/blog/how-to-write-a-construction-scope-of-work | HTTP 200, in sitemap, lastmod 2026-11-17 | 52 URLs, HTTP 200 | Request indexing sent ("added to a priority crawl queue") | Submit URLs done (99 of 100 quota left) |
- Checks on the rebased tree (main was at 7d2e4e5): lint, `tsc -p .`, build, seo:check all green (52 pages); pushed
  `seo-daily:main` (7d2e4e5..3e61541, only blog + docs files).
- Heads-up: origin/main already contained the tutorial-video commits (up to 7d2e4e5 "NEXT_STEPS: the whole course is
  recorded..."), i.e. `my-branch` content reached main before this push. Not touched by this routine; the video session
  and the owner should confirm that was intended.

### 2026-11-17 indexing investigation (owner asked "why don't the pages get indexed"; look only, nothing changed)
- Technical side is clean: robots.txt allows everything public, pages return 200, `index, follow`, canonical = www URL,
  sitemap has 51 URLs and Google read it on Nov 16 (51 discovered); Bing read it Nov 14.
- Google: the `site:contractordocs.app` search lists about 40 of the 51 pages (all blog posts except
  construction-time-sheet-tracking and best-invoicing-software-for-contractors, most trade/compare pages, pricing,
  features, about, contact, terms, privacy, both generators). URL Inspection says "URL is on Google / Page is indexed"
  for /blog/work-order-template and /for/electricians. Performance (Nov 11-15): 84 impressions, 0 clicks, average position
  56, 14 pages with impressions (top: work-order-template 17, free-electrical-invoice-template 15, estimate-generator 13).
- BUT the Page indexing report says Indexed 0, Not indexed 29 = "Crawled - currently not indexed" 28 (first detected
  11/14; includes pages that URL Inspection calls indexed, so that report lags) and "Page with redirect" 1 = the home page.
- Home page problem: URL Inspection of https://www.contractordocs.app/ = "Page with redirect", last crawl Nov 13 21:48,
  Google-selected canonical = https://contractordocs.app/ (apex). Google also still shows an OLD apex page ("The Operating
  System for Modern Contractors", Nov 2025) and old subdomains policy./terms./images.contractordocs.app (all still answer
  200 on Vercel). Live now: apex answers 307 (temporary) to www, although vercel.json has a permanent (308) host redirect:
  the 307 most likely comes from the Vercel domain setting and wins. Suggested fix (owner's Vercel account, needs the
  owner's OK): make the apex -> www redirect 308 permanent, then request indexing of the www home; retire or redirect the
  old subdomains.
- Bing: `site:www.contractordocs.app` shows 1 result (the home page with an OLD description); Site Explorer "Indexed URLs"
  has no data yet; IndexNow was sent on Nov 14. Bing is slow for new domains; re-check at the first data review.
- Why rankings are low: new domain with no backlinks, average position 56. Next levers: links from the owner's own
  profiles (YouTube descriptions of the tutorial video, social profiles, directories) and more focused posts.
- The Nov 16 skip means no new posts yet. Weekly usage stays at 90% until 2026-11-19 17:00 UTC, so the Nov 17 and 18 runs
  will skip too; the first real run is expected on 2026-11-19 at 19:00.

### 2026-11-16 (skipped: usage (5h 4%, weekly 90%))
Timer run at ~19:10 UTC. The weekly limit (all models) was at 90% (resets 2026-11-19 17:00 UTC), the procedure's stop
line. Nothing written, built, pushed or pinged. Note for the next run: the dry-run article's registry `date`/`updated`
still say 2026-11-16; set them to the real publishing day before publishing it.

### 2026-11-15 setup (not published)
Setup session: created this folder, the timer `contractordocs-daily-seo` (next run 2026-11-16 ~19:07 UTC) and a dry-run
article. Nothing was pushed, no search engine was pinged. Branch `seo-daily` = origin/main (dcc1083) + 2 local commits.
| # | Slug | Target query | Intent | Status |
| --- | --- | --- | --- | --- |
| 1 | how-to-write-a-construction-scope-of-work | how to write a scope of work (construction scope of work template) | how-to + template | committed locally, NOT live |
- Checks run: `seo-blog-lint` for all posts and landing pages (pass; this post 2045 words, 14 H2, 13 internal links),
  a 2-file `tsc --strict` of the post and the registry (pass), no "Kelviq" / "merchant of record". NOT run:
  `npx tsc --noEmit -p .`, `npm run build`, `npm run seo:check` (the owner was recording a video: `record/run.mjs` and
  `chapter.mjs` node processes were running; heavy checks postponed). The first timer run must run all of step D.
- Heavy checks DONE later on 2026-11-15 (video recording had finished): `seo-blog-lint` all pass, `npx tsc --noEmit -p .`
  exit 0, `npm run build` exit 0, `npm run seo:check` passed (52 pages incl. the new post: 2924 rendered words,
  BlogPosting + BreadcrumbList + FAQPage + HowTo JSON-LD, sitemap lists it with lastmod 2026-11-16). Built HTML read once:
  4 tables, checklist renders, no stray markdown. Still nothing pushed. The first run only needs to re-run the checks
  after its own changes (the new posts, the date fix if the day differs).
- Registry entry already has `date`/`updated` = 2026-11-16 (the planned publishing day). If the first run happens on
  another day, change both dates to that day (the sitemap lastmod follows `updated`).
- First run: count this article as 1 of the 4 for 2026-11-16 (so write 3 new ones; re-read this one once with fresh eyes
  and in the built HTML, fix anything that reads like filler), then continue with steps D to G.
- Product facts used (verified in the repo 2026-11-15): estimate form has a Proposal section with a Scope tab (scope of
  work, inclusions, exclusions, assumptions, timeline), client sees it on the approval link and the signed estimate is
  locked, "Save as template" (Free keeps 1 template, Premium up to 20) per `components/help/helpContent.ts` (guide id
  `proposals`).
- Heads-up for the coordinator session: from the first run on, `origin/main` moves ahead of `my-branch` with SEO commits
  (content/blog/*, docs/work/seo-daily/*; NEXT_STEPS.md and app code are never touched by this routine). Before pushing
  `my-branch:main`, run `git fetch origin && git merge origin/main` on `my-branch` (the changes do not overlap), otherwise
  the push is rejected as non-fast-forward.

## Decisions log (data review decisions, newest first; later runs judge them against the next snapshot)
### 2026-11-24 (snapshot metrics/2026-11-24.md; Google 28 days 1,380 impr, 3 clicks, pos 38.6)
1. Topics now come from Keyword Planner volumes + Search Console (owner's order). Judge at the 11-27 review: are the 7
   new posts indexed, and do they get impressions for their target queries?
2. free-electrical-invoice-template: headings/description use "electrician invoice sample/example". Judge: position for
   the electrician cluster under 25, first clicks.
3. Next refresh candidates: how-to-calculate-job-profit-margin for "markup vs margin" (1K-10K) and "job margin" (54
   impr, pos 63); change-order-form-guide for "change order template" (1K-10K; page at pos 30.7).
### 2026-11-21 (owner session, outside the routine; commit c24f36a, live)
1. Apex contractordocs.app now redirects 308 (was 307) in Vercel → Domains. Next run: URL Inspection + Request indexing for
   https://www.contractordocs.app/ (Google had picked the apex as the home canonical; "Page with redirect"). The coordinator's
   Search Console tab did not respond, so no indexing request was sent today.
2. /estimate-generator: title "Free Estimate Generator & Estimate Maker | ContractorDocs", H1 "Free estimate generator for
   contractors", new description; /invoice-generator: "Free Invoice Generator for Contractors | ContractorDocs". The print button is
   gone (Preview + "Create it in ContractorDocs" hand-off into the app). Next run: request indexing for both. Judge at the next
   review: position and clicks for "estimate generator", "estimate generator free", "free estimate maker", "estimate maker".
3. Blog/landing text no longer says the generator saves a free PDF (electrician/plumbing invoice posts, handyman page): the PDF
   now needs a free account. Keep new posts consistent with that.
### 2026-11-20 (snapshot metrics/2026-11-20.md; Google 877 impr, 2 clicks, pos 37.7)
1. free-electrical-invoice-template: 64 impr, 0% CTR, searchers type "electrician invoice template" (pos 19.5-27.5).
   Title/H1, description and answer opening now say "electrician invoice template". Judge on 2026-11-23: position and
   CTR for the electrician wording.
2. contractor-paperwork-checklist (pos 9.1): added links to closeout checklist, time sheets, invoicing software. Judge:
   holds top 10.
3. best-invoicing-software-for-contractors and construction-time-sheet-tracking: "Discovered - currently not indexed"
   8 days after publishing. New internal links from indexed posts + indexing requested again. Judge: indexed?
4. 2026-11-17 posts linked from older posts' related lists (owed since 11-17).
5. /estimate-generator (369 impr, pos 33) left alone: position, not snippet, is the issue; app page, not blog.
6. New backlog rows from queries: work order examples, e-signature legality question, job margin.
