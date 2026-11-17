# SEO daily log (newest first). Procedure: `DAILY_PROCEDURE.md`. Data snapshots: `metrics/`.

## State (update at the end of every run)
- Timer: `contractordocs-daily-seo`, every day 19:00 local (PC time zone UTC+0). Set up 2026-11-15.
- First publication: 2026-11-17 (the setup session's article, published by hand at the owner's request; the 2026-11-16
  timer run had skipped: weekly usage at 90%).
- Posts live from this routine: 1 (how-to-write-a-construction-scope-of-work). Posts before it: 24. Registry order =
  newest first.
- Last data review: none. First review due 2026-11-20 (3 days after the first publication), then every 3rd day.
- Pending Google indexing requests (pending-index): none.
- Unpublished work waiting on branch `seo-daily`: none (everything is on origin/main).
- Usage rule in DAILY_PROCEDURE.md step A (skip at 5-hour 60% or weekly 90%) is under review by the owner, who wants
  the daily posts to keep going; weekly usage was 94% on 2026-11-17 (resets 2026-11-19 17:00 UTC). Follow whatever the
  newest note below says.

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
| H | how to write a scope of work for a construction job (template) | template | dry run 2026-11-15 | drafted |
| H | what to do when a client won't pay a contractor | how-to | reminders, demand letter, lien, small claims; rules vary | todo |
| H | contractor deposit: how much can you ask for | question | states limit deposits differently; no invented %; formula + examples | todo |
| H | past-due invoice letter / payment reminder templates for contractors | template | 3 tones: friendly, firm, final | todo |
| H | estimate vs quote vs bid vs proposal: what is the difference | question | | todo |
| H | estimate vs invoice: what is the difference | question | links to both generators | todo |
| H | how to follow up on an estimate (scripts and timing) | how-to | | todo |
| H | contractor payment schedule template (milestone billing) | template | percent per milestone examples | todo |
| H | punch list template for contractors and how to run one | template | only claim app support if live | todo |
| H | job closeout checklist for contractors | template | warranty, final invoice, lien waiver, photos | todo |
| H | time and materials vs fixed price contract | comparison | when each fits, examples | todo |
| H | cost-plus contract explained for small contractors | comparison | | todo |
| H | how to estimate a painting job (labor, materials, prep) | how-to / trade | method + worked example, no invented rates | todo |
| H | how to estimate a roofing job (squares, waste, tear-off) | how-to / trade | link /for/roofers | todo |
| H | how to estimate a deck / fence / landscaping job | how-to / trade | one trade per post | todo |
| H | HVAC service call pricing: flat rate vs hourly | comparison / trade | link /for/hvac | todo |
| M | free HVAC / roofing / painting / landscaping / handyman invoice template (one per trade) | template | model: free-plumbing-invoice-template | todo |
| M | how to set your labor rate (burden, overhead, billable hours) | how-to | formula and example | todo |
| M | how much markup to put on materials | question | markup vs margin link, no fixed "right" number | todo |
| M | retainage explained for subcontractors | question | rules vary by state | todo |
| M | progress billing / schedule of values step by step | how-to | | todo |
| M | net 30 vs due on receipt for contractors | question | | todo |
| M | how to take job-site photos that protect you (before, during, after) | checklist | | todo |
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
(none yet)
