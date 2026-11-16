# SEO daily log (newest first). Procedure: `DAILY_PROCEDURE.md`. Data snapshots: `metrics/`.

## State (update at the end of every run)
- Timer: `contractordocs-daily-seo`, every day 19:00 local (PC time zone UTC+0). Set up 2026-11-15.
- First publication: not yet (2026-11-16 run skipped: weekly usage at 90%; next try 2026-11-17 19:00).
- Posts live from this routine: 0. Posts on the site before it: 24 (registry order = newest first).
- Last data review: none. First review due: 3 days after the first publication (2026-11-19 if day 1 is 2026-11-16),
  then every 3rd day.
- Pending Google indexing requests (pending-index): none.
- Unpublished work waiting on branch `seo-daily`: the dry-run article from the setup session (see "2026-11-15 setup").

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
