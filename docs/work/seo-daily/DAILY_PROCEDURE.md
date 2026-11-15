# ContractorDocs daily SEO routine (exact procedure)

Owner request, 2026-11-15: "Every day at 7 p.m. create 4 blog articles, add them to Google Search Console and Bing so it
helps our SEO. After a couple of days look at the data Bing and Google show, adjust the articles we create next and edit
the existing articles to match the data."

- Timer: scheduled task `contractordocs-daily-seo`, cron `0 19 * * *` (local time of this PC; the PC time zone is
  Casablanca = UTC+0, so 19:00 local = 19:00 UTC; the app adds a delay of a few minutes).
- Each run is a NEW session with no memory. This file + `LOG.md` + `metrics/` are the memory. Read this file fully, then
  LOG.md (top "State" block, topic backlog, last 3 entries), then the newest file in `metrics/`.
- Site: https://www.contractordocs.app (git branch `main` on Vercel). Search Console property:
  `https://www.contractordocs.app/` (URL-prefix; sitemap already submitted). Bing Webmaster Tools: site imported from
  Google. IndexNow key file is already live (scripts/indexnow-ping.ts).

## Owner rules (never break)
1. Additive only: never delete a post, never remove a feature, never change a published slug (indexed URLs). If a slug
   change is ever truly needed: add a permanent redirect in `vercel.json` first and say why in LOG.md.
2. Never type, paste, print or store passwords, API keys, tokens or secrets anywhere. The owner is already signed in to
   Search Console and Bing in Chrome. Never sign out, never clear cookies.
3. Never write "Kelviq" or "merchant of record" anywhere (seo-check fails on it).
4. No generic AI filler, no invented statistics, prices, laws, competitor claims, reviews or customer quotes. Anything
   factual needs a source or "as of <Month Year>" wording; legal/tax topics say "rules vary by state, not legal advice".
   Numbers in examples are labelled as examples. Do not copy other sites; write it from first principles.
5. NEVER push or merge the branch `my-branch` (another session's unfinished video course work lives there). Only push
   the SEO branch: `git push origin seo-daily:main` (a fast-forward).
6. Keep the owner informed in short, plain messages. Max 2 helper agents (Sonnet); normally write the posts yourself.
   Screenshots cost tokens: prefer `get_page_text`, `read_page`, `find`, `javascript_tool`; screenshot only at scale 0.4
   when text tools fail.
7. Never leave production broken. Never `git push --force`, never skip hooks.

## 0. Where to work
- Work ONLY in the SEO worktree (branch `seo-daily`):
  `C:\Users\JAAF\Downloads\-Youness00Maache-Contractore-c2ee2b2908a94c029486956a75db59d142a2ee41\.claude\worktrees\seo-daily-b03c89`
  Never edit files in the main project folder (it is on `my-branch`).
- `node_modules` in that worktree is a junction to the project's `node_modules`. Never delete its contents. To remove the
  worktree some day: first `cmd /c rmdir node_modules` (junction only), then `git worktree remove --force <path>`.
- If that folder no longer exists: from the project folder run `git worktree prune`, then
  `git worktree add <new-folder> seo-daily` (the branch survives; if it is gone too, make a new branch from
  `origin/main`, the procedure files are on `origin/main` after the first successful push). Then
  `cmd /c mklink /J node_modules "<project folder>\node_modules"` in the new folder.
- `git fetch origin`, then `git status` (must be clean; if not, commit your own leftovers or ask yourself why) and
  `git rebase origin/main`. Unpushed commits on `seo-daily` are yours (for example articles finished earlier but not yet
  published: publish them today and count them among today's 4).
- Heavy commands (`npx tsc`, `npm run build`) must not run while the owner is recording a video. Check first:
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'record.(run|chapter)' }`
  If something shows up: write the posts first, retry every ~10 minutes (PowerShell `Start-Sleep -Seconds 300`), up to 90
  minutes. If it still runs, leave the commits local, log "build postponed: video recording", stop.
- Guard against double runs: if LOG.md already has an entry for today's date with status "published", do NOT write
  4 more articles; only finish missing steps (indexing requests, data review) and stop.

## A. Usage check (first)
`mcp__ccd_session_mgmt__get_usage`. If the 5-hour limit is at 60% or more, or the weekly limit at 90% or more: write
"skipped: usage (5h x%, weekly y%)" for today in LOG.md, commit it locally (push it with the next run's push), stop.
Check again before step H and before the Chrome work; stop cleanly at the same limits.

## B. Choose 4 NEW topics
1. Existing coverage: `grep "slug:" content/blog/registry.ts` and the landing pages in `content/landing/registry.ts`.
   Never duplicate a slug or an intent (the same question answered twice cannibalizes itself).
2. Sources, in order: (a) the newest `metrics/` snapshot (queries with impressions but no matching page; "Decision"
   section), (b) the "Topic backlog" table in LOG.md (take the highest-rated unused rows), (c) fresh ideas: WebSearch
   (mode "standard") for contractor questions; read what the first results answer and what they leave out; look at the
   "People also ask" style questions in the results.
3. Prefer specific, answerable, high-intent queries over broad ones ("how to write a scope of work for a bathroom
   remodel", not "construction tips"). Think: what would a contractor type into Google on a phone at 9 p.m.?
4. Mix per day: 2 how-to guides, 1 template/checklist page, 1 question/comparison or trade-specific piece.
5. Write the target query (the exact phrase), search intent (informational / template / comparison / trade) and the
   chosen slug of each into LOG.md BEFORE writing. Keep slugs short, lowercase, hyphenated, matching the query.

## C. Write each post
Create `content/blog/posts/<slug>.ts` (default export `BlogPostContent`, see `content/blog/types.ts`) and register it at
the TOP of `BLOG_POSTS` in `content/blog/registry.ts`. Models: `change-orders-with-ai.ts` (how-to with HowTo JSON-LD),
`lien-waivers-explained.ts` (guide with a legal disclaimer). The linter (`scripts/seo-blog-lint.ts`) enforces:

| Rule | Limit |
| --- | --- |
| body words (links reduced to text, markdown symbols ignored) | 1200 to 2300 (aim for 1500 to 1900) |
| `## ` sections | at least 4; no `# ` H1 in the body |
| table | at least one markdown table |
| checklist | at least one `- [ ] ` item |
| raw HTML, `${`, backticks inside the body | not allowed (never write `<b>` or a `<` followed by a letter) |
| internal links (body + FAQ) | valid targets only; at least 2 different `/blog/...` posts and at least 2 product pages |
| `faq` | 4 to 6 entries (`q`, `a`; markdown links allowed in `a`) |
| `takeaways` | 3 to 5 |
| `answer` | 150 to 480 characters, 2 to 3 sentences, answers the main question directly, first thing on the page |
| `howTo` (optional, step-by-step posts) | 3 to 10 steps, each with `name` and `text`; steps must also be visible in the body |
| `cta.href` | a valid internal link (`/auth/signup`, `/pricing`, `/invoice-generator`, `/estimate-generator`, `/templates`, `/ai-estimate-generator`, `/ai-invoice-generator`, a trade page, a post) |
| registry `readingTime` | within 2 minutes of round(words / 230) |

Valid internal link targets: `/`, `/features`, `/features#documents|ai-assistant|client-portal|gmail|inventory|profit-tracking|mobile`,
`/pricing`, `/templates`, `/invoice-generator`, `/estimate-generator`, `/about`, `/contact`, `/security`, `/privacy`,
`/terms`, `/blog`, `/blog/<existing-slug>`, `/auth/signup`, `/auth/login`, `/help`, `/ai-estimate-generator`,
`/ai-invoice-generator`, `/for/{electricians,plumbers,hvac,roofers,remodelers,handyman,painters,landscapers}`,
`/compare/{joist,invoice2go,jobber,housecall-pro}-alternative`.

Registry entry (`BlogPostMeta`): `slug`, `title` (the H1 and `<title>`; keep it at or under 65 characters, unique on the
site), `description` (140 to 160 characters, unique; seo-check hard limit 70 to 170), `date` and `updated` (the publishing
day, ISO), `author: AUTHOR`, `category` (one of: Invoicing & Payments, Estimating & Profit, Project Paperwork, Field
Reports & Crews, Running Your Business), `readingTime`, `keywords` (3 to 5, first = target query), `related` (2 or 3
EXISTING slugs). Also list the new post in the `related` of 1 or 2 older relevant posts (that is an internal link for
Google and a minor edit: bump their `updated` only if you changed visible text).

Quality bar (this is what ranks, not the count): answer first; concrete worked examples with realistic numbers labelled
"example"; a table or checklist the reader can copy; short paragraphs; real steps a contractor can do today; internal
links to related posts and to the real feature or generator page; one natural call to action to try ContractorDocs
(free plan), placed where it helps, never pushy; an honest "what this does not cover". Vary structure between posts;
do not reuse the same intro formula. Product claims must be true today: check `content/site.ts`, `lib/plans.ts`,
`pages/FeaturesPage.tsx`, `pages/PricingPage.tsx`, `content/landing/pages/*` or the help guides before you state a
feature, a limit or a price (known on 2026-11-15: 12 document types incl. estimates, invoices, change orders, work orders,
purchase orders, daily reports, time sheets, warranties; Free plan, Premium $5/mo, Premium + AI $10/mo, AI requests
15/60/600 a month; clients approve and sign on a phone via a link with no account; price book; progress billing; field
documents work offline). Do not claim features that are not live.

Post skeleton:

```ts
import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'the-slug',
  answer: '2 to 3 sentences, 150 to 480 characters ...',
  takeaways: ['...', '...', '...'],
  howTo: { name: '...', totalTime: 'PT15M', steps: [{ name: '...', text: '...' }] }, // optional
  body: `Intro paragraph(s)...

## Section
...`,
  faq: [{ q: '...?', a: '...' } /* 4 to 6 */],
  cta: { heading: '...', text: '...', href: '/invoice-generator', label: '...' },
};

export default post;
```

## D. Checks (all must pass; fix everything)
```
npx tsx scripts/seo-blog-lint.ts          # fast; run it after every post
npx tsc --noEmit -p .
npm run build                            # also writes dist/sitemap.xml
npm run seo:check
```
Run the slow ones in the background and read only the last lines. Also read the rendered
`dist/blog/<slug>/index.html` text once for a new post (no stray markdown, table and checklist render, links work).

## E. Publish
1. Commit only your files (`content/blog/`, `docs/work/seo-daily/`) with a clear message, e.g.
   `SEO daily 2026-11-16: <slug-1>, <slug-2>, <slug-3>, <slug-4>`, ending with the attribution line the harness gives.
2. `git fetch origin` then `git rebase origin/main`. If the rebase brought content changes, re-run the lint.
3. `git push origin seo-daily:main` (must be a fast-forward; never force). Never push `my-branch`.
4. Wait 2 to 3 minutes for Vercel, then check every new URL and the sitemap (cache-bust):
   `curl -s -o NUL -w "%{http_code}\n" "https://www.contractordocs.app/blog/<slug>?x=$RANDOM"` -> 200, and
   `curl -s "https://www.contractordocs.app/sitemap.xml?x=$RANDOM"` must contain the 4 URLs with today's lastmod.
   Not live after 10 minutes: look at the Vercel deployment in Chrome; if the build failed, fix forward or
   `git revert` your commit and push, then log it.

## F. Tell the search engines
1. `npx tsx scripts/indexnow-ping.ts` (submits the whole sitemap to Bing and the other IndexNow engines; expect HTTP 200
   or 202).
2. Google: Search Console, property `https://www.contractordocs.app/`, "Inspect any URL" with each new URL, then
   "Request indexing" (wait for "Indexing requested"). Google allows about 10 requests a day; stop at a quota message
   and write the remaining URLs as "pending-index" in LOG.md so the next run requests them first. The sitemap is already
   known to Google, requests only speed things up.
3. Bing Webmaster Tools: "Submit URLs" if available (also covered by IndexNow).
Chrome rules: load the Chrome tools with ONE ToolSearch call (tabs_context_mcp, navigate, read_page, get_page_text,
find, computer, tabs_create_mcp, tabs_close_mcp, list_connected_browsers, select_browser, browser_batch); read the skill
`anthropic-skills:chrome-browser` first. Use `list_connected_browsers`; the owner's device is the one with deviceId
`23a0a75c-cc82-4d0f-b3b0-312e9279d13e` (shown as "Browser 1" on 2026-11-15, "Browser 2" in older notes); `select_browser`
it if it is not already in use. Open your own new tab, close it when done, do not touch other tabs (the Framitor daily job
also uses Search Console around 20:00). Both dashboards were already signed in on 2026-11-15 and loaded in 5 to 10 seconds
(allow up to a minute); do not retry more than twice; if they will not load, log "dashboard did not load" and continue
(IndexNow still covers Bing; Google finds the sitemap on its own). Use `browser_batch` (navigate, wait, get_page_text).
Working links (tested 2026-11-15):
- Search Console overview: `https://search.google.com/search-console?resource_id=https%3A%2F%2Fwww.contractordocs.app%2F`
  Sitemaps: `.../search-console/sitemaps?resource_id=<same>`; Page indexing: `.../search-console/index?resource_id=<same>`;
  Performance: `.../search-console/performance/search-analytics?resource_id=<same>&num_of_days=28` (use 7 for 7 days; the
  Queries/Pages/Devices tabs are on that page, `get_page_text` reads the active table).
- URL Inspection / Request indexing: there is NO working deep link. On the overview page use `find` for the combobox
  "Inspect any URL in https://www.contractordocs.app/", click it, type the full URL, press Return, wait ~15 s, `find`
  "Request indexing" (button ref) and click it, wait for the live test (up to ~1-2 min) and the "Indexing requested"
  dialog, close it (Got it). "URL is on Google" means it is already indexed (still fine to request after edits).
  A quota message ("Quota exceeded") means stop for today.
- Bing: `https://www.bing.com/webmasters/home`; Sitemaps `https://www.bing.com/webmasters/sitemaps?siteUrl=https%3A%2F%2Fwww.contractordocs.app%2F`;
  URL Submission `https://www.bing.com/webmasters/submiturl?siteUrl=https%3A%2F%2Fwww.contractordocs.app%2F` (quota 100 URLs
  a day; paste the new URLs one per line and press Submit URLs); Search Performance and Site Explorer are in the left
  menu of the same site (use `find` / `read_page` to get the links, then `get_page_text`).
- The signed-in Google account in that Chrome is the owner's; never write its address into the repo or the logs.

## G. Log
Append today's entry at the TOP of the "Daily entries" in LOG.md (format below), update the "State" block, commit
(`SEO daily log 2026-11-16`) and push the same way as step E (fast-forward of `main`; a docs-only push is fine).

Entry format:
```
### 2026-11-16 (published | skipped: reason)
| # | Slug | Target query | Intent | URL | Live (HTTP) | IndexNow | Google request | Bing |
Notes: anything odd, quota messages, pending-index URLs, what changed on older posts and why.
```

## H. Data review (every 3rd day)
When: the first run that is 3 days after the first published articles (first publication: see LOG.md State; so on
2026-11-19 if day 1 was 2026-11-16), then every 3rd day after the previous snapshot (`metrics/YYYY-MM-DD.md`). Search
Console data is about 2 days behind; Bing is slower still: weigh small numbers carefully.
1. Search Console (property `https://www.contractordocs.app/`): Performance > Search results, date ranges "Last 7 days"
   and "Last 28 days", read the Pages tab and the Queries tab (clicks, impressions, CTR, position), then Indexing > Pages
   (indexed count and reasons) and Sitemaps (status, discovered URLs). Prefer `get_page_text` / `read_page` over
   screenshots. Compare the table filters "Query contains" for each new post's target query.
2. Bing Webmaster Tools: Search Performance (pages and queries), Sitemaps, URL Inspection for each URL published in the
   last 7 days.
3. Write `docs/work/seo-daily/metrics/YYYY-MM-DD.md` with: dates covered; site totals (clicks, impressions, CTR, avg
   position) for Google and Bing; a table per page (URL, impressions, clicks, CTR, avg position, top query, indexed?
   yes/no/why); the top 20 queries; for each URL published in the last 14 days: indexed or not and the reason shown;
   "Outcome of earlier decisions" (compare with the previous snapshot: did the edited posts improve?); "Decisions".
4. Decide and apply (record each decision, the numbers behind it and what you expect, in the snapshot and LOG.md):
   - Impressions (28 days) of 30 or more and CTR under 2%: rewrite title, description, H1 and the first answer paragraph so
     they match the wording of the top query and promise the answer; one metadata change per page per cycle, judge it
     after the next snapshot.
   - Average position 8 to 20 with 10+ impressions: add depth (new H2s that answer related queries, a better table or
     worked example, up to 6 FAQ entries), and more internal links to it from indexed posts.
   - Queries with impressions but no focused page (or the page ranks 30+): put them at the top of the backlog as new
     topics for the next days.
   - Published 7+ days ago but not indexed ("Discovered" or "Crawled - currently not indexed"): strengthen the page
     (original examples, a better table, more specific answer), add 2+ internal links from indexed posts and from the
     blog index related lists, then request indexing again.
   - Under 50 impressions on the whole site in 28 days: do not over-react; check indexation and keep publishing.
   - Bing and Google disagree: trust the larger data source but note Bing's view (Bing weights exact-match titles).
   - Edit existing posts through the same lint rules (the 2300 word cap holds: tighten before adding). Bump `updated`
     in the registry only for meaningful changes (sitemap lastmod follows it; never fake freshness).
5. Run step D, push (E) and ping (F) for the edited posts too (request indexing only for the ones with bigger changes).

## Failure handling
- Lint, tsc, build or seo:check fails and you cannot fix it: do not push; keep the commits local; write the reason in
  LOG.md; the next run continues from there.
- Topic or fact you are not sure about: drop it, pick another topic. A wrong legal or price claim is worse than a missing
  post. A day with 3 excellent posts beats 4 thin ones, but log why.
- Final message of every run: a few plain sentences: the 4 URLs, each target query, what was requested in Google/Bing,
  usage %, anything that failed or needs the owner.
