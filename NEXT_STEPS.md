# ContractorDocs: paused on 2026-11-13 (~12:00). Progress and exact next steps

Work is paused at the owner's request. Nothing has been pushed to GitHub. The local test site is
`http://localhost:3010` (Vite dev server, connected to the REAL production database `iauteblvljppwzsxloyd`).
Owner's rules for this work: never remove a feature the old app had (old app = commit `25ae5cc` = the live
site today); no Docker; don't push unless asked; no generic "vibe-coded" design (icon-in-a-square cards).

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

A backup copy is in `docs/work/paused/` (`wip-tracked-changes.patch` + `wip-new-files.tar`).
`npx tsc --noEmit -p .` was clean at pause time.

### B1. Templates (owner requests, all still to finish)
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

## C. Checks still to do after A and B

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
