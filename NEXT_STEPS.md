# >>> HOW TO WORK IN THIS PROJECT (read first; owner's rules + cost rules, 2026-11-14) <<<
The site is LIVE: www.contractordocs.app = branch `main` (Vercel deploys main). Work on `my-branch`.

## Cost rules (the owner noticed heavy usage; follow these strictly)
1. Start lean: read only this file's top sections and docs/work/handover/*. Don't re-read the whole repo; open only
   the files a task touches. Use grep/tail/head instead of reading big files or full logs.
2. Keep the conversation small: start a NEW session when context passes ~40-50% (check with get_usage). Everything
   needed to continue must be in this file (update it after each finished step), so a fresh session loses nothing.
3. Helpers (sub-agents): at most 2 at a time. Use model "sonnet" for simple/mechanical work (UI tweaks, copy, small
   bug fixes, test updates); default (Opus) only for hard work (template design, offline sync, AI prompts/schemas,
   SQL). Give each a tight scope + exact test commands. Prefer `isolation: "worktree"` so helpers can't collide; inside a
   worktree, link deps instead of installing: `cmd /c mklink /J node_modules "<repo>
ode_modules"`. When removing a
   worktree, FIRST `cmd /c rmdir <worktree>
ode_modules` (junction only), then `git worktree remove --force <path>`.
4. Usage pacing: check get_usage before big steps; a recurring check every 15 minutes (not 5). Stop at 80% of the
   5-hour limit (commit finished work, note state here, set a one-shot timer just after the reset) and stop entirely at
   95% weekly. Don't run anything big when the weekly limit is near.
5. Screenshots cost a lot: verify with get_page_text / read_page / find / small zoom; take a screenshot only to judge
   visuals, at scale 0.5 or lower.
6. Long jobs (templates browser QA ~45 min, full builds) run in the background; read only the result lines.
7. Tests: run the suites for the area you changed; before publishing run `npx tsc --noEmit -p .`, `npm run build`,
   `npm run seo:check`, plus the area suites (scripts/*-check.ts, scripts/forms-prefill-qa.ts, npm run qa:document-ai,
   npx tsx scripts/templates-qa.ts --no-browser). Never push anything that fails.

8. (2026-11-14, owner: "usage is draining") Biggest costs were a 420k-token coordinator chat re-read on every step,
   a 15-minute timer waking it, and two Opus helpers in parallel. From now on: coordinator = a FRESH short session
   (hand over via docs/work/COMPETITOR_ROADMAP.md before ~150k tokens of context); helpers on Sonnet by default
   (Opus only for SQL migration review and AI prompt/schema design); usage check hourly or when a helper finishes;
   ship batches in pairs (one full test run + one deploy per pair); helpers get exact file paths, no exploring.

## Publishing (owner asked to keep production updated)
- After tests pass: `git push origin my-branch && git push origin my-branch:main` (gh is logged in as Youness00Maache).
  Check the live site (curl key pages; cache-bust with ?x=$RANDOM) after Vercel finishes (~1-3 min).
- New public pages: after deploy run `npx tsx scripts/indexnow-ping.ts` (Bing/IndexNow). Google reads the sitemap
  (property https://www.contractordocs.app/ in Search Console, already set up; Bing imported from it).
- Edge functions (ai-assistant, kelviq-checkout, kelviq-webhook, gmail, reminders, delete-account): bundle with
  `npx esbuild supabase/functions/<fn>/index.ts --bundle --format=esm --platform=neutral "--external:npm:*" --target=es2022 --outfile=<scratch>/<fn>.ts`,
  then in Chrome "Browser 2" (deviceId 23a0a75c...; it has the owner's Supabase/Vercel/Kelviq/Search Console sessions)
  open the function's Code page, inject the file into Monaco (hidden file input + monaco.editor.getModels()[0].setValue)
  and click "Deploy updates" (+ confirm). Keep kelviq-webhook and reminders with JWT verification OFF.
- Database: production project iauteblvljppwzsxloyd. Schema/data changes ONLY with the owner's explicit OK (ask with one
  short question listing each change). Apply via the SQL editor; keep every applied change as a file in
  supabase/migrations/ with a header "Applied <date> with the owner's OK".

## Owner rules (always)
- Never remove features the old app had; additive changes only.
- No Docker. Never type passwords, API keys or secret values anywhere (the owner does that).
- Design: compact and distinctive; no generic "icon in a tinted square + title + text" card grids, no stock icon grids.
- Never mention Kelviq or "merchant of record" on the website.
- Keep the owner updated in short, plain messages.

# >>> GENERATORS → APP HAND-OFF + SEARCH FIXES (owner request 2026-11-21) <<<
- Search data (Google 11/11-11/19): 1.04K impressions, 3 clicks, avg position 36.8; Bing 14 impressions, 0 clicks. Cause: a 10-day-old
  domain ranking on page 3-4 (CTR there is ~0), plus /estimate-generator (half the impressions) shows for homeowner queries ("free
  estimate", "get a free estimate") that will never click. Fixed: the bare domain contractordocs.app now redirects 308 (was 307) in
  Vercel → Domains (Google had picked the apex as the home canonical); generator titles/descriptions/H1 now match the queries people type
  ("free estimate generator", "estimate maker"). Daily SEO routine keeps running (it was skipped 11/16 for usage, paused 11/18 and
  interrupted 11/19 by the owner; 11/17 and 11/20 published). Old subdomains terms./policy./images.contractordocs.app are separate
  Vercel projects (maybe used by the Google OAuth consent screen): left as they are.
- /estimate-generator and /invoice-generator: "Print / Save as PDF" removed; "Preview" opens a full-size look-only preview;
  "Create it in ContractorDocs" keeps the typed data in localStorage `cd_generator_draft` (lib/generatorHandoff.ts), goes to sign up
  (or /dashboard when signed in); after sign-in App.tsx creates the job + saved client, fills an empty profile company name, and opens
  the estimate/invoice as a seed with `__autoSave` (saved once as a draft; useDocumentForm.ts). Tour + setup assistant still run the
  first time the user opens the dashboard. Signup/Login show "your estimate is saved". Tests: scripts/generator-handoff-check.ts (71).
  Tested end to end on the fake backend (launch.json "fake-backend" + "contractordocs-fake", port 3012): estimate + invoice OK.

# >>> TUTORIAL VIDEO (owner request 2026-11-15; own session; everything in docs/work/tutorial-video/) <<<
Read docs/work/tutorial-video/PLAN.md + README.md first. STATE 2026-11-15 ~15:10 (branch my-branch, last commit d647e27, NOTHING PUSHED):
**UPDATE 2026-11-16 (after the owner said "Publish now"): THE VIDEO COURSE IS LIVE IN PRODUCTION.** `git push origin my-branch:main` done
  (main = 7d2e4e5, Vercel production deployment "completed"); the live app's chunk chain App -> HelpCenter -> VideoCourse (16.5 KB) contains the
  course and the bucket URL; the bucket files allow CORS from the site and the CSP (media-src https:, connect-src *.supabase.co) lets them load.
  Not testable without a login: the page inside the signed-in app (Help & tutorials, top of the page, "Video course"). TO WATCH FOR: audio is
  served from the bucket as `application/octet-stream` (the upload tool gave .m4a no type); Chrome plays it (tested live); iPhone Safari is UNTESTED:
  if there is no sound on an iPhone, fix by fetching the audio in lib/VideoCourse as a Blob typed audio/mp4 (media-src already allows blob:) or by
  re-uploading the voice files as .mp4. The daily SEO session pushes only `seo-daily:main`; always `git fetch` + rebase before any push to main.
**UPDATE 2026-11-15 ~22:45 (NEWEST): THE WHOLE COURSE IS RECORDED AND LIVE IN THE BUCKET; ONLY THE PRODUCTION PUSH WAITS FOR THE OWNER'S OK.**
  30 chapters, 99:41 (incl. the new complete phone chapter 28 "The app on your phone, and working offline", 6:47), English voice for all,
  Spanish voice for 01-11, captions: 10 languages for 01-11, English + Spanish for 12-30 (the player shows English captions with a note
  where a language has none). Bucket `tutorial-media`: 82 files, all verified equal to <work>/publish/v1 (re-checked by size at 22:40);
  live manifest = 30 chapters. Tested in the real app against the live bucket (list of 30, deep link /tutorials?video=offline-phone&t=60,
  play, voice+video in sync, captions switch + English fallback). All suites were green at 19:41 (tsc, build, seo:check, qa:document-ai, 40+
  check scripts, forms/payments/templates); the app code has not changed since (only tutorial-video tooling). my-branch pushed; MAIN NOT
  PUSHED: pushing `my-branch:main` makes the Video course visible to everybody (owner wants to watch the new timing first; the watch page
  has all 30 chapters: http://127.0.0.1:3999/watch.html via `node scripts/serve-media.mjs <notes folder> 3999`, files in the notes folder
  `watch/`). AFTER THE OWNER'S OK: `git push origin my-branch:main`, wait 1-3 min, curl https://www.contractordocs.app/tutorials (200) and
  check the live app shows the Video course. NOTE the daily SEO session pushes only `seo-daily:main` (fast-forward on origin/main): rebase
  my-branch on origin/main (git fetch; git rebase origin/main) BEFORE pushing main so that SEO commits are not lost.
  To update the course later: `node build/assemble.mjs` (TUTORIAL_WORK_DIR=C:/Users/JAAF/contractordocs-tutorial-work), compare with the
  bucket by size, delete changed names in the Storage UI (filter box, tick rows, Delete), upload the changed files with the chrome tool
  file_upload (hidden input, <10 MB per call, files must be in the notes folder), manifest.json LAST. Still optional: subtitles in the
  other 8 languages for chapters 12-30, Spanish voice for 12-30 (owner said no: keep it small).
**UPDATE 2026-11-15 ~19:45 (newest; older bullets below may be outdated):** OWNER RESUMED ("continue, tell me the % done") and CUT THE SCOPE:
  ENGLISH voice for every chapter + subtitles only; no new voice languages (Spanish voice stays for 01-11 only; subtitles: 10 languages for
  01-11, Spanish+English for 12-30). SYNC FIXED and measured (clicks land 0.02-0.3 s from the spoken word on average, elastic timing):
  chapters 01-11 re-recorded with it; English voice for 12-30 generated (cache/audio/en), Spanish subtitles 12-30 done. WAVE 1 IS LIVE IN THE
  BUCKET: public `tutorial-media` (FLAT folder: manifest.json, NN-id.video.mp4, NN-id.<lang>.m4a, subtitles.<lang>.json; 44 files, 52 MB),
  uploaded through the owner's Chrome (chrome tool file_upload into the hidden input of the bucket page, <10 MB per call, ~8 calls;
  re-uploading an existing name needs deleting it first). The real app loads it from there (tested: 11 chapters, play, captions, language
  switch). my-branch PUSHED (a0f13f7); MAIN NOT PUSHED yet: the course becomes visible in production the moment main is pushed, so wait
  for the owner's OK after they watch the new chapters (watch page: node scripts/make-watch-page.mjs <notes folder>; node scripts/
  serve-media.mjs <notes folder> 3999). All checks pass for wave 1 (tsc, build, seo:check, qa:document-ai, 40+ check scripts, forms,
  payments, templates). IN PROGRESS: two Sonnet helpers record chapters 12-20 (slot a) and 21-30 (slot b) as FINAL videos
  (`TUTORIAL_WORK_DIR=C:/Users/JAAF/contractordocs-tutorial-work node record/run.mjs <slot> NN --langs en`); coordinator released them by
  writing GO.txt in that folder. THEN: assemble all (`node build/assemble.mjs`, TUTORIAL_WORK_DIR as above), re-upload: delete manifest.json
  and subtitles.en.json/subtitles.es.json in the bucket first, upload the new NN-id files, subtitles.en/es, then manifest.json LAST
  (copy the publish/v1 files to the notes folder `upload/` so the chrome tool can read them; scripts in scratchpad plan-batches.mjs).
  Then push main (verification script: scratchpad verify-all.sh; all green at 19:41) and curl the live site.
- Owner decisions: voice English + Spanish (subtitles in all 10 languages), public bucket `tutorial-media`, ship in waves
  (wave 1 = chapters 1-11, wave 2 = 12-22, wave 3 = 23-30). The bucket EXISTS (created by the assistant in the Supabase
  Storage UI 2026-11-15: public, 50 MB limit; supabase/migrations/20261116001300_tutorial_media_bucket.sql records it). It is
  EMPTY: nothing uploaded yet, so the Help page shows no "Video course" (the player hides itself until manifest.json exists).
- DONE: 30 English chapter scripts; wave 1 (01-11) fixed to 0 missed actions + demo data (fake-backend/demo/*.mjs) + motion/phone
  scenes; English AND Spanish AI33 voice for 01-11 in <home>/contractordocs-tutorial-work/cache/audio/{en,es} (Mark voice
  elevenlabs_TZCbdntnleSl53jkcRsm; Spanish at speed 1.1; en 31.7 min, es 34.6 min); subtitles fr/de/it/pt (committed) and
  zh/ja/ko/ru (helper writing them); final recordings with real timing: 01-06 DONE in <home>/contractordocs-tutorial-work/out/chapters,
  07-11 running (log: scratchpad final-07-11.log); the in-app player (lib/tutorialVideo.ts, components/help/VideoCourse.tsx, wired in
  HelpCenter, App.tsx passes profile.language) tested in a browser with a 1-chapter package: plays, voice+captions in sync.
- AI33 KEY: the owner allowed reading it IN MEMORY from C:/Users/JAAF/Documents/ChatGPT/dd/worker/.env: run with env
  AI33_ENV_FILE=that path (tts/ai33.mjs). NEVER print, copy or store the key.
- NEXT STEPS (wave 1): (1) when final-07-11 finishes: `node build/assemble.mjs` (from docs/work/tutorial-video, TUTORIAL_WORK_DIR=
  <home>/contractordocs-tutorial-work) -> <work>/publish/v1/; check manifest.json + subtitles (all 10 langs; add zh/ja/ko/ru
  _titles); (2) test the player locally: serve <work>/publish with scripts/serve-media.mjs 3998, run vite with
  VITE_TUTORIAL_MEDIA_BASE=http://127.0.0.1:3998/v1 and the fake backend (see README), sign in via localStorage fake session;
  (3) UPLOAD the folder v1/ into bucket tutorial-media (Supabase dashboard works in the owner's Chrome but is SLOW to boot,
  ~40 s; chrome tool file_upload takes <10 MB per call, one file per input, folders must be created in the UI first: or ask the
  owner to drag the publish/v1 folder into the bucket); (4) npx tsc --noEmit -p ., npm run build, npm run seo:check, scripts/
  *-check.ts, npm run qa:document-ai; a help snapshot mismatch: npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge; (5) push
  my-branch and my-branch:main, curl the live site; no ai-assistant redeploy needed (help guides unchanged); (6) wave 2 and 3:
  chapters 12-30 scripts exist (chapters/), need: fix with `node record/run.mjs <slot> NN` (one helper per slot a/b, 0 unresolved),
  Spanish + 8 languages translations (translations/<lang>/NN-id.json, scripts/dump-say.mjs, scripts/validate-translations.mjs),
  voice `node tts/narrate.mjs en|es --speed 1.1 for es --chapters ...`, final record `run.mjs f NN --langs en,es`, assemble, upload.
- Owner watches finished chapters on the watch page: node scripts/make-watch-page.mjs <notes folder> then node scripts/serve-media.mjs
  <notes folder> 3999 -> http://127.0.0.1:3999/watch.html (the owner twice did not receive SendUserFile videos; reveal_path + the
  Browser pane worked).
- Known narration/screen mismatches left as written (true but not shown): 08.s05.0/.1/.5 (Project tab, All documents), 09.s03.0,
  10.s02.2, 11.s02.4. Gotchas: run.mjs only makes placeholder timing when NO audio exists (pass --mock for a new chapter in a slot);
  never run two recordings on one slot; Vite reloads if any .html under the repo changes during a run; C: disk was nearly full once.
- PAUSED BY THE OWNER 2026-11-15 ~16:20 ("pause everything, don't lose anything; I will tell you when to continue"). Nothing of
  mine is running except the watch-page file server (port 3999, node scripts/serve-media.mjs <notes folder> 3999). Do not resume
  until the owner says so. ALL work is committed on my-branch (NOTHING pushed); the big files (voices, recordings, packages) live in
  C:/Users/JAAF/contractordocs-tutorial-work (cache/audio = AI33 voices en+es, out/chapters = recordings): do not delete them.
- Owner feedback on chapters 1-2 (the 18:28 version on the watch page): unnecessary pauses, narration sometimes ahead of the screen,
  sometimes behind. The recordings 01-11 on disk were made with the OLD timing. FIX WRITTEN, committed, NOT yet verified end to end:
  record/lib.mjs (capture.pause()/resume() cut page-load time out of the video; cursor glide follows the clock), record/chapter.mjs
  (narration starts 0.45 s into a scene, scene tail 0.3 s; each action is timed to LAND on the spoken word, with a learned travel
  ratio; several actions in one sentence are spread over it; ELASTIC offsets: when a step is slow, later sentences wait, so the voice
  never runs ahead; one audio segment per sentence placed individually; the Spanish voice is sped up <= 1.12x to fit the English
  length; typing at most ~1.4 s; a `sync:` line + chapter.json `timing` report how well clicks landed), tts/snap.mjs + tts/resnap.mjs
  (sentence cuts at real pauses; resnap already run on all 156 cached scenes; narrate.mjs does it for new audio), build/assemble.mjs
  (captions use the offsets/tempo). Measured before the elastic step: chapter 02 mean click error 0.14 s, chapter 01 0.7-1.1 s.
  NEXT: TUTORIAL_WORK_DIR=C:/Users/JAAF/contractordocs-tutorial-work node record/run.mjs f 01 02 --langs en,es (one run at a time on
  a slot; ~4 min per chapter), read the `sync:` line, look at the result (scripts/make-watch-page.mjs), then re-record 03-11 the same
  way (+ 12-30 later), assemble, upload.
- Usage rule: pause at 70% of the 5-hour limit; weekly was 55% at 15:05 (the owner asked for this video explicitly).

# >>> STATUS 2026-11-14 afternoon: owner requests 1-5 below are DONE and LIVE (main) <<<
- Community in the phone bottom bar (457427c); phone app bar: offline = one-line strip under the bar (0f0d9ba).
- Offline jobs + clients (96e7088): create job (+ new client), job status, client add/edit/notes; ids kept, sync order
  clients -> jobs -> inventory/price book -> stock changes -> documents, remap if the account changes an id, documents of
  a refused job wait, plan-limit/stock refusals keep their reason, "Waiting to sync" chips (job cards, job page, clients).
- Install-app banner on phones (f396496). AI "fill every box" (a0f9410) -> REDEPLOY the ai-assistant edge function.
- Offline inventory items, stock changes, price-book items (9dbd8c5); client notes (1266293).
- OFFLINE AUDIT (updated 2026-11-14 evening, branch worktree-agent-ab4b5d1fee0b54215: "offline everywhere").
  Source of truth: lib/offline/writePathAudit.ts = one row per write call (140 calls); scripts/offline-drafts-check.ts
  scans the code and FAILS when a new write isn't in the table (307 checks).
  WORKS OFFLINE (saved on the device, "Waiting to sync", synced in order when back online):
  field documents + estimate/invoice drafts; jobs (create from "New job" — the button no longer blocks offline —,
  status); clients (add, edit, notes, temporary/regular); inventory items, stock +/-, CHECK-OUT to a job/client (same
  stock moves); price-book items (add, edit, duplicate, "save line to price book" from a form); JOB PHOTOS (take/pick,
  stage, caption, show in portal, mark up; files kept per user, max 200 photos / 200 MB on the device; uploaded to the
  same paths as online; plan photo limit checked offline and again by the database, refusal keeps its reason);
  SETTINGS (profile, company, logo/picture, payment + review links: last write wins + "changed on another device");
  reminder settings. Device-pending (uploaded at next login): profit calculator, labor rate, theme, language, signature.
  OPENS OFFLINE (also after a reload, last copy + outbox items on top): dashboard, jobs, job page documents + photos
  (with previews), clients, inventory, price book, calendar, pipeline, analytics, settings, document reminders.
  Installed app: sw.js keeps the shell with its own files; the main screens' files load once per session after sign-in.
  NEEDS A CONNECTION (says "You're offline. This needs a connection; try again when you're back online."; the Supabase
  client fails offline requests with that sentence, edge functions/Gmail too): sending email, client links/portal,
  Mark as paid / payments, deleting jobs/documents/clients/uploaded photos/items, duplicating jobs/documents, copy to
  job, bill time & materials, purchase orders + receiving, quote requests, CSV import/export, reminders on/off per
  document + skip, billing/AI credits, AI (assistant, photo updates, form fill), community, account deletion.
  Not redeployed: helpGuides.generated.ts (help text now mentions photos/settings offline) -> next ai-assistant deploy.
  To test on a phone: sign in online once (screens load in the background), then airplane mode.

# >>> ROADMAP N2 (helper branch worktree-agent-a7ef3645c5ed44c0c, not merged / not live): PO lifecycle + budget dashboard <<<
- lib/poLifecycle.ts (pure, data shapes documented there): statuses Draft/Sent/Confirmed/Partially delivered/Delivered/
  Invoiced/Paid/Cancelled (old Received = Delivered, kept as saved); deliveries in data.internalDeliveries {rev, list};
  supplier invoice #/amount/date (feed Invoiced), paidDate, file in document-assets/<uid>/purchase-orders/<doc>/.
- Record delivery (components/suppliers/RecordDeliveryDialog.tsx, lib/suppliersApi.ts recordDelivery): per-line qty
  (default = remaining), adds ONLY that delivery's stock once per delivery id (claim = compare-and-set on rev; history
  notes "[po:<id>] [dlv:<id>]" recover a delivery lost by a stale form save). Older half-way "Mark received" still
  finishes the old way. Notifications: one per finished delivery.
- Costing (lib/costing.ts + JobCostingPanel): spent vs ordered (committed), remaining, original/revised budget,
  expected final cost/profit, per-kind overruns. Spent + ordered = the old "actual", so % used/alerts/projection keep
  their numbers; Rejected POs no longer count. Insights/pipeline untouched.
- TODO after merge (needs the ai-assistant files the other helper owns): help guide 'suppliers' still says [[Mark
  received]] → mention [[Record delivery]], deliveries, supplier invoice, [[Mark paid]]; job-costing guide: "spent +
  ordered"; then `npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge` and redeploy ai-assistant. The AI PO status
  enum (documentFields STATUS_OPTIONS.purchaseOrder + ai-assistant documentSchema) still lists the 4 old statuses.
- Not checked in a browser (needs a signed-in account): the PO form strip / dialog / invoice upload and the panel.

# >>> START HERE (owner requests 2026-11-14 15:20, weekly limit hit at 99%; do these FIRST after the reset Nov 19 17:00 UTC) <<<
**2026-11-14 ~21:10 UTC: NEW BIG TASK = docs/work/COMPETITOR_ROADMAP.md** (46 competitor features: audit done,
batches N1-N12 need no DB, D1-D13 need the owner's DB OK). Owner pacing for it: pause at 70% of the 5-hour limit,
stop at 50% weekly, loop until everything is shipped. Read that file first.
**2026-11-14 ~20:30 UTC: "small things" DONE and LIVE** (main fb3c34d, ai-assistant redeployed 354 KB, 30 suites pass):
- Free plan: Convert to invoice + Create revision check the job's document slot before the new form opens
  (components/forms/DocSlotContext.ts; copy-to-job-check +4).
- AI fill on an OPEN estimate: "turn this into good/better/best options" / "add a premium option" uses the form's
  current lines (lib/estimateOptions.ts applyAiOptionsDraft; qa:document-ai 1388). The job assistant can't be opened
  from the estimate form, so the form's AI fill is the path.
- Settings › Document design (/settings#documents): default PDF design for new documents (same store as "Use for new
  documents"; Free = Basic only). components/settings/DocumentDesignSettings.tsx.
- IndexNow: 51 URLs submitted (HTTP 200).
- WAITING FOR THE OWNER'S OK: docs/work/DRAFT_expiry_rule_go_live.sql moves the "sign after expiry" cut-off from
  2026-11-13 00:00 to the go-live 2026-11-14 15:00 UTC (one function; apply together with EXPIRY_RULE_START in
  utils/clientPortalRules.ts + portal-approval-check). Not applied.
- Still open for the owner: click-test signed in, first live payment, old questions (Premium gating of supplier
  send/reorder + photo AI, photo AI defaults), housekeeping (old Gemini key, b@b.com, Kelviq org name, old functions).
  The two empty "busy" folders in .claude/worktrees: rmdir after the app restarts.
**2026-11-14 ~19:00 UTC: owner's 5 steps ALL DONE and LIVE.** Post-merge suites all passed (30); pushed my-branch +
main (7bc0dd5: templates merge + shared offline message); live /templates = 200 with the 26 new designs + Premium
badges, preview images load. Still open: the two EMPTY folders .claude/worktrees/agent-a300aae907df5b66c and
agent-ab4b5d1fee0b54215 are "busy" (another process has them open) -> `rmdir` them after the app restarts.
**UPDATE 2026-11-14 ~18:10 UTC (owner: stop at 95% of the 5-hour limit):**
- DONE step 1: all suites passed (estimate-options-check fixed for CRLF checkouts); pushed my-branch + main (a9ddaed).
- DONE step 2: review verdicts: 0100 crew OK (+ added: punch timesheet_id must be the owner's document); 0200 punch OK;
  0300 papers had a BUG (guard_company_paper missing `as $$`, the file would not run) -> fixed; 0400 service plans OK.
  field-features-check now checks every function body opens with `as $$`. All 4 APPLIED to production in the SQL
  editor and verified (12 tables + RLS, cron contractordocs-service-visits, private crew-photos bucket, link key, 12
  definer RPCs with search_path, anon can't run the cron tick or read punches). Headers added; pushed (f295d1d).
- DONE step 3: `reminders` (86 KB, papers expiry emails; JWT verification still OFF) and `ai-assistant` (342 KB, new
  screens + offline help) redeployed from the esbuild bundles; live code checked in the editor; both boot.
- DONE step 4: the templates helper had finished its whole scope (browser QA of the 15 Premium designs x 12 kinds,
  marketing previews of the 26 designs, line units on PDFs, isShortSection backspace fix, totals at page breaks); its
  notes + compare images committed, merged into my-branch (6f80e51; one test conflict resolved). Full suite rerun.
- DONE step 5: punch lists / papers / lien waiver / service plans use NEEDS_CONNECTION (lib/offline/connection.ts)
  (76b0025). Worktrees a1a42b37360684bec + abbb5deadbe96121d removed (junction first), a300aae907df5b66c dropped from
  git; folders .claude/worktrees/agent-a300aae907df5b66c and agent-ab4b5d1fee0b54215 are EMPTY but "busy" (another
  process has them as its folder): delete them after the app restarts (`rmdir`). Not touched: the worktree
  ...\Temp\claude\0525b7dc1b82fde1\2fce5d51-...\scratchpad\base (another session's scratch, detached f57e051).

**PAUSED 2026-11-14 ~15:50 at 80% of the 5-hour limit (resume timer 18:57 UTC).** State (steps 1-2 below now DONE):
- my-branch has, merged + tested but NOT pushed yet: crew clock-in (6ed0745), punch lists + papers vault + service plans,
  merge 7f72eff + fix 8b43b21 (all suites pass: offline 307, crew 255, field 173, notifications 162, qa:document-ai 1315,
  forms 945, views 804, seo 51 pages). These features stay hidden until their tables exist, so pushing is safe.
- NOT applied yet (owner approved "Crew & field tables"): supabase/migrations/20261115000100_crew_clock_in.sql,
  0200_punch_lists, 0300_papers_vault (then redeploy `reminders` for expiry emails), 0400_service_plans (adds pg_cron
  job contractordocs-service-visits). FIRST a read-only review (the reviewer was stopped): verdict per file + fixes.
- vercel.json now allows geolocation=(self) (crew worker page needs it).
- Redeploy ai-assistant (new screens /crew /papers /service-plans + offline help).
- Templates helper a300aae907df5b66c stopped mid-work in worktree branch worktree-agent-a300aae907df5b66c (resume with
  SendMessage; it was committing the Premium design fixes). Then merge/test/publish.
- Small follow-up: field-feature screens use their own offline text; switch them to the shared offline message.
- Leftover worktree folder .claude/worktrees/agent-ab4b5d1fee0b54215 could not be deleted (Permission denied: a process
  held files); remove its node_modules junction first, then delete it.

**15:05 owner decisions applied:** (1) estimate option choice SQL APPLIED (20261114000100; functions verified);
(2) AI credits ON: SQL applied (20261114000200), Kelviq Live plans ai-credits-5/10/20/50 ($5/$10/$20/$50, one-time,
published, product ContractorDocs), webhook endpoint now also sends order.* + refund.* (16 events), kelviq-webhook +
kelviq-checkout + ai-assistant redeployed, secret AI_CREDITS_ENABLED=true; webhook test event → HTTP 200.
(3) crew & field tables approved → helpers building (crew clock-in abbb5deadbe96121d; punch lists + papers vault +
service plans a1a42b37360684bec), migrations to apply after review. Supplier confirm link NOT approved (leave it).
Price promise: owner had no preference → Terms now match the pricing page (12 months from a change).

**2026-11-14 14:45 (weekly reset to 2%): "finish everything".** Helpers in their own git worktrees (merge their
branches into my-branch, test, push my-branch + main): SEO pages + IndexNow ab4e22c8920d43a3d; templates (full QA all
kinds, marketing previews, units on PDFs, isShortSection fix, paginator gap) a300aae907df5b66c; offline gaps (photos,
settings, cached lists, write-path audit, PWA shell) ab4b5d1fee0b54215. Pacing job 995b5af6.

Site is LIVE (main = production). Every fix: test, commit, push my-branch AND main (owner asked to keep production updated).
1. OFFLINE EVERYWHERE (top priority). Documents already work offline (create/edit, sync later). Make the rest work offline
   with the same outbox (lib/offline/*): create/edit JOBS (owner could not create a job offline), clients, inventory
   items + stock moves, price book items, notes/photos queue, time punches, profit calculator, settings. Temporary ids
   remapped on sync (a document created offline inside a job created offline must land in the real job). Audit EVERY
   feature that writes data; list which work offline and make each one queue + sync with a "Waiting to sync" chip.
2. "INSTALL THE APP" prompt on phones: when a phone user is using the site (e.g. after creating a document), show a
   friendly banner "Add ContractorDocs to your home screen — works offline" with the real install prompt
   (beforeinstallprompt on Android/Chrome; iOS Safari instructions: Share → Add to Home Screen). Dismissible, not
   pushy; manifest.webmanifest + sw.js already exist (check icons/start_url/display standalone).
3. PHONE DASHBOARD HEADER CROWDED when the offline banner shows: the logo + "Good morning…" + offline badge crowd the
   app bar. Re-layout (e.g. move the offline state to a thin strip under the bar, shorten the greeting on phones).
4. COMMUNITY MISSING ON PHONE: add Community to the phone navigation (Dock "More" sheet or bottom bar) with its badge.
5. AI MUST FILL EVERY BOX: owner asked the AI to create two documents and fill every box; it filled only a couple.
   Make the assistant fill all fields the user gives (and sensible defaults/sample data when asked "fill everything"):
   check documentSchema/field keys per doc type, prompt rules, compact-schema fallback (it may drop fields), prefill
   mapping (hooks/useDocumentDraftPrefill.ts); add QA cases "fill every field" for all 12 types; redeploy ai-assistant.
Then continue the leftovers below (SEO pages, IndexNow, templates leftovers, live payment test).

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
**06:30:** Started offline field drafts (#14) helper affb2a5fd1f3baea4 (no DB changes; local outbox in IndexedDB).
**07:05:** Offline field drafts (#14) DONE + committed (435824f; offline-drafts-check 145, all suites pass). Field docs
create/edit offline; estimates/invoices drafted offline with a provisional number; per-user IndexedDB outbox
(`contractordocs_outbox`); sync on start/reconnect/Sync now; logout guard. Pending: redeploy ai-assistant with the next
change (only one help tip changed). Owner OK (ask when back): public/sw.js service worker (production, signed-in users
only; network-first pages, cache-first hashed assets; the old app had an sw.js that was never registered); forms
preloaded on job pages; price book + inventory now cached on the device (cleared on logout).
Templates helper ab3e480c0eebe3ce2 FINISHED (native page renderer: PDF = preview; 30 old designs re-matched to 25ae5cc;
empty-box + --pdfdiff QA).
**07:50:** Templates COMMITTED (4074f37): full browser templates-qa --pdfdiff 70,885 checks, 0 failures (1,482 pages
compared, worst 1.72%; 11 headless font-timeout fallbacks). Owner: please download a few PDFs to confirm they match.
Known leftovers: paginator carries the last 2 rows with the totals (can leave a gap at the bottom of page 1,
utils/templates paginate.ts); browsers that need the html2canvas fallback lose the dark-page logo effects.
**07:35:** Started good/better/best (#6) helper aeff85915b68325bd (told "templates committed" at 07:50; draft SQL only
if the client's choice needs an RPC change).
**09:05:** Good/better/best (#6) DONE + committed (8e40d01; estimate-options 229, templates-qa static 66,859, estimate
pdfdiff 2,936, all suites pass). ai-assistant REDEPLOYED (knowledge: offline drafts + options). Today the client's
pick is stored in the signer name ("Jane Doe (chose B: Better)"); the clean version needs
docs/work/DRAFT_estimate_options_choice.sql (functions only, NOT applied). Options are open on every plan (research
said Premium). Follow-ups: AI drafting good/better/best options (prompt + schema + deploy); old bug in
utils/templates/blocks.ts ~line 257 (isShortSection regex has a broken  → notes with images/tables can sit beside
the signatures; fixing changes how some existing estimates print, so ask first).
**Owner decisions waiting (one list):** (1) apply DRAFT_purchase_order_confirm_link.sql? (2) apply
DRAFT_estimate_options_choice.sql? (3) plan gating of new features (suppliers send/reorder = Premium, photo AI =
Premium+AI, options = all plans)? (4) service worker + device caching for offline OK? (5) photo AI defaults
(see 06:25). (6) price promise wording. (7) DB tables for crew clock-in, service plans, papers vault, punch lists.
Remaining NEXT items all need DB tables (7) → waiting for the owner.
**09:15:** Started quick-measure calculator (#20, calculator only, Free, no DB) helper a5b698492176df43c.
**10:00:** Quick measure (#20) DONE + committed (4fde2c0; measure-check 294, all suites pass) and ai-assistant
REDEPLOYED (help guide). Owner questions: print the line unit ("sq ft", "box") on PDFs? (needs a template change);
defaults: door 3'x6'8", window 3'x4", US/Canada start in feet-inches.
**10:05:** Started AI good/better/best drafting helper a14720f57f8896cb5 (assistant can draft estimate options; no DB).
**10:45:** AI drafts good/better/best options DONE + committed (2a3d2ab; qa:document-ai 1105, forms-prefill 945) and
ai-assistant REDEPLOYED (the old live app never calls ai-assistant, so this is safe before the frontend release).
Owner notes: the price book isn't sent to the assistant, so prices the user didn't give stay empty (flagged on the
card); Recommended defaults to the 2nd option. Not done: "turn this estimate into options" on an open form.
**10:50:** Started helper ac5970b502af39d6e: send a relevance-ranked slice of the price book (sell prices only) to the
assistant so drafted lines get real prices (no DB). Weekly 91%: stop everything at 95%.
**11:25:** Price book for the AI DONE + committed (ccebdbc; qa:document-ai 1208) and ai-assistant REDEPLOYED. Also
committed utils/documentDraft.ts that 2a3d2ab had missed. Owner OK: price-book names/units/sell prices/short
descriptions/kit parts now go to Gemini with drafting requests (never costs); matched lines take the price book's
"name - description" text and unit.
**11:35:** Smoke test (local dev, signed out): landing, /help, /pricing, /login load with no console errors;
/dashboard redirects to login. Started a bug-review helper ad857e90fabe20e37 on the riskiest new code (offline sync,
options in portal/PDF, supplier Mark received, photo AI); it fixes only bugs it can reproduce with a test.
**11:55:** Bug review DONE. Fixed + committed (325851a): Mark received could add stock twice when two devices/tabs
received the same PO (6 new tests). Nothing else reproducible in offline sync, options, photo AI.
IMPORTANT before launch: when a client signs choosing a NON-recommended option, the saved line items still hold the
Recommended option until the contractor clicks Apply chosen option, so stock taken on acceptance can follow the wrong
option. Fix = apply docs/work/DRAFT_estimate_options_choice.sql (switches lines at signing). Recommend applying it
before launch (needs the owner's OK).
**12:00: NEW FEATURE WORK PAUSED** (weekly 92%; owner asked "is the site ready to ship?"). Remaining budget is kept for
fixing the owner's click-test findings and the publish. Pacing job deleted. Ship checklist given to the owner:
(1) owner click-test on localhost:3010; (2) Kelviq secrets in Supabase (D1); (3) Vercel env vars VITE_SUPABASE_URL,
VITE_SUPABASE_ANON_KEY, VITE_SITE_URL=https://www.contractordocs.app, VITE_KELVIQ_*, VITE_SUPPORT_EMAIL;
(4) price promise wording -> TermsOfService; (5) apply the options SQL (above); (6) "publish" -> push + merge (E).
**12:30 OWNER FEEDBACK BATCH (2026-11-14):** logo missing in the phone app bar + job page "New Document" wrong place
→ FIXED (90cd4e6). AI failed on the test prompt (client + job + 3 docs): MAX_TOKENS on flash-lite → backup timeout →
546 → FIXED + DEPLOYED (3cc23c5: same-model compact retry, compact JSON rule, better logs). Copy a document to another
job as a draft → DONE (0edd167). Running (resume with SendMessage if stopped; each leaves PROGRESS.md in its scratch
folder): notifications acc86775768bf741d (scratchpad/notif), templates rework a0b2903ffd888a515 (scratchpad/tpl2:
Basic vs Premium groups, Premium only for paid plans, customization beyond colors, professional premium redesign,
better thumbnails), AI credit top-ups a591f3dddbe37d852 (scratchpad/credits: buy credits $5+, auto-recharge if Kelviq
supports it; draft SQL + feature flag OFF; nothing applied). Weekly budget ~93%: if it runs out, continue after the
weekly reset (Nov 19 17:00 UTC). AI test prompt for the owner is in the chat (Maria Lopez / Lopez Bathroom Remodel).
**12:50:** Owner: "ship as fast as possible" + SEO complete + get found by AI chatbots. Started SEO/AI-visibility helper
a4639163d6c212037 (scratchpad/seo: robots AI-bot groups, llms.txt + llms-full.txt, answer-first + FAQ + BlogPosting/
Breadcrumb JSON-LD on posts, /ai-estimate-generator, /ai-invoice-generator, /for/<trade> pages, /compare/* pages,
new posts, IndexNow key + ping script, seo:check extended). AI credits helper asked to wrap up (flag OFF) to save budget.
AFTER DEPLOY: Search Console (verification file public/google58a3bf2c7e0ed45b.html) → submit sitemap + request indexing
of key pages; Bing Webmaster Tools import from Search Console; run scripts/indexnow-ping.ts.
**13:05:** AI credits DONE (uncommitted, feature flag OFF; commit together with the other running tasks because they
share Settings.tsx / helpContent.ts / knowledge.ts). Kelviq supports one-time plans + charging a saved card
(POST /charges/), so auto-recharge is real (max 3/day, off on decline). Packs $5=100, $10=220, $20=480, $50=1300
credits; credits used only after the plan allowance; Free can buy. Also fixes: a credit-pack refund can't downgrade a
subscriber. TO SWITCH ON (owner): 4 one-time Kelviq plans ai-credits-5/10/20/50, webhook + order.* refund.* events,
apply docs/work/DRAFT_ai_credits.sql (never run yet), redeploy ai-assistant + kelviq-checkout + kelviq-webhook, secret
AI_CREDITS_ENABLED=true (needs Kelviq secrets D1). Details: scratchpad/credits/PROGRESS.md.
DISK: C: was at 800 MB free; deleted old scratchpad QA output and stale HeadlessChrome temp profiles.
**13:20: WEEKLY 96%.** Notifications DONE (uncommitted; bell in the app bar, events from existing data, read state in
user_settings notifications.state/prefs; no DB change; ai-assistant needs a redeploy for its knowledge). Templates
a0b2903ffd888a515 + SEO a4639163d6c212037 told to wrap up in a working state (PROGRESS.md in scratchpad/tpl2 and
scratchpad/seo). NEXT: when both report → tsc + build + seo:check + templates-qa --no-browser + key suites → commit
(groups: credits, notifications, templates, SEO) → redeploy ai-assistant → publish only on the owner's "publish".
If the budget runs out first: everything is on disk (uncommitted); resume after Nov 19 17:00 UTC from here.
**13:55 (weekly 97%): EVERYTHING COMMITTED** (921f35d templates/notifications/credits/SEO; 50b3844 landing fixes: hero
badge removed + raised, natural phone mockup, no Kelviq/merchant-of-record text anywhere on the site, footer "Blog").
Premium designs browser-checked (12,352 checks, PDF = preview; contact sheet scratchpad/tpl2/compare/premium_invoice_sheet.png).
BLOCKERS FOR PUBLISHING (owner):
1. GitHub: `git push` is refused (403): this computer is logged in as YounessMaache, which is not a collaborator on
   Youness00Maache/-Youness00Maache-Contractore. Add YounessMaache as a collaborator (or `gh auth login` as
   Youness00Maache), then: push my-branch, merge into main → Vercel deploys.
2. Supabase dashboard in Chrome is signed out → sign in, then redeploy ai-assistant (bundle command in section 0;
   needed for templates/notifications knowledge; credits code ships with the flag OFF).
3. Vercel env vars + Kelviq secrets (D1) as listed at 12:00. 4. Owner click-test.
SEO leftovers (scratchpad/seo/PROGRESS.md + rewritten-links.txt): render the 8 trade pages (content written), write
/ai-estimate-generator, /ai-invoice-generator, 4 /compare pages, nav/footer links, IndexNow key + ping script.
Templates leftovers (scratchpad/tpl2/PROGRESS.md): full --pdfdiff run on all kinds, marketing Templates page PNGs
(content/templatePreviews.ts) still show retired designs, optional Settings default-design section.
**14:10:** Chrome "Browser 2" (deviceId 23a0a75c…) has Supabase, Vercel, Kelviq signed in (Browser 1 is a different
profile, signed out). ai-assistant REDEPLOYED (templates/notifications knowledge; credits flag off). Vercel env has
VITE_SUPABASE_URL, VITE_SUPPORT_EMAIL, VITE_KELVIQ_PRODUCT_ID, VITE_KELVIQ_ENV, VITE_SITE_URL (anon key falls back
to the built-in production key: OK). Supabase secrets still missing KELVIQ_WEBHOOK_SECRET + KELVIQ_SERVER_API_KEY
(owner adds: Kelviq Settings > Webhooks > endpoint > signing secret; Settings > API keys (Live); Supabase
Functions > Secrets). Kelviq webhook endpoint exists (to iauteblvljppwzsxloyd.supabase.co), not yet verified: after
the secrets are in, click Verify endpoint + Send test event. kelviq-checkout / kelviq-webhook code changed (credits
routing, flag off) but NOT redeployed yet — deploy together with the subscribe-flow change.
Started subscribe-flow helper a5bac949ae036a6c1 (sign up first → automatic checkout for the chosen plan; existing
account → log in; intent survives email confirmation/OAuth; "Finish upgrading" banner; no DB change).
**14:35:** Subscribe flow DONE + committed (433f012, 753cca6; subscribe-flow-check 81). Existing email → log in for
EVERY sign-up (owner rule). Owner added KELVIQ_WEBHOOK_SECRET + KELVIQ_SERVER_API_KEY; Kelviq "Send test event" →
HTTP 200 {"received":true,"status":"test"} (3 of 4 webhook steps done; 4th = first live payment). Supabase Auth
redirect list already allows https://www.contractordocs.app/** (plan params OK). kelviq-webhook/kelviq-checkout NOT
redeployed on purpose (live version works; new code only adds credits routing behind the OFF flag).
ONLY BLOCKER LEFT FOR PUBLISHING: GitHub push access (add YounessMaache as collaborator or gh auth login as
Youness00Maache), then push my-branch → merge main → verify live → Search Console sitemap + Bing.
**15:00 — PUBLISHED.** gh is now logged in as Youness00Maache. Merged origin/main (only PR merge commits) into
my-branch (2d56577), pushed my-branch and main → Vercel production deploy Ready; www.contractordocs.app serves the
new site (37 pages, llms.txt, AI-bot robots groups, no Kelviq text). Kept both google-site-verification meta tags.
Google Search Console (account of the owner in Chrome "Browser 2"): added URL-prefix property
https://www.contractordocs.app/ (auto-verified by HTML tag) and submitted sitemap.xml (success).
Checked owner QA items: multiple Gmail accounts ARE supported (account menu with switch / reconnect / "Add another
Gmail account" appears after the first account is connected); Tools low-stock badge now red like the old app (84d9535).
BING DONE (15:15): imported www.contractordocs.app from Search Console (framitor.site left out on purpose); sitemap
read by Bing: Success, 37 URLs.
NEXT (after the weekly reset Nov 19): IndexNow,
SEO leftovers (trade/AI-generator/compare pages; docs/work/handover/seo-PROGRESS.md + seo-rewritten-links.txt; templates-PROGRESS.md, credits-PROGRESS.md there too;
it lives in the old session scratchpad 0525b7dc…/d0cef399…/scratchpad/seo), templates leftovers, first live payment test.
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
