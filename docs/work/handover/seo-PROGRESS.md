# SEO / AI-visibility work: stopped early (weekly budget at 96%), 2026-11-14

## Done (uncommitted; tsc clean, `npm run build` OK, `npm run seo:check` passed on 37 pages, blog lint passes on 24 posts)
- robots.txt: one group listing GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot,
  Perplexity-User, Google-Extended, Applebot-Extended, Bingbot and CCBot. It allows /, /llms.txt and /llms-full.txt and has the
  same Disallows as `*`, because a crawler named in its own group ignores the `*` group.
- /llms.txt and /llms-full.txt are generated at build time (pages/llms.ts, exported via pages/entry-server.tsx `llms()`,
  written by scripts/prerender.mjs) from lib/plans.ts, content/site.ts and the blog registry, so they can't go stale.
- Blog: new required `answer` field (shown first as a "Short answer" box, marked with data-answer) on all 24 posts;
  optional `howTo` field, output as HowTo JSON-LD (3 posts). BlogPosting, BreadcrumbList and FAQPage were already there.
- 9 new posts (2026-11-14): how-to-create-a-construction-estimate-with-ai (featured), best-ai-tools-for-contractors,
  good-better-best-pricing-for-contractors, send-estimate-clients-can-sign-on-phone, job-costing-budget-vs-actual,
  change-orders-with-ai, free-electrical-invoice-template, free-plumbing-invoice-template, contractor-app-that-works-offline.
- seo-check now also checks: the robots AI group, that llms.txt/llms-full.txt exist with prices and every URL, that every
  FAQ question and answer in the JSON-LD appears on the page, and the short answer box on posts.
- seo-blog-lint: requires `answer` (150–480 chars), checks howTo steps, and accepts links to landing pages.
- Landing-page data: content/landing/types.ts and registry.ts (14 pages), plus the 8 finished trade modules in
  content/landing/pages/for-*.ts. Nothing imports these yet: no page component, route or sitemap entry.

## Left to do (in order)
1. Landing-page renderer: pages/landingLoader.ts (import.meta.glob of content/landing/pages/*.ts, like blogLoader);
   call it from preloadRouteData; pages/LandingPages.tsx (AI, trade and compare layouts; answer box with data-answer,
   example document table, FAQ with FaqList); routes /for/:slug, /compare/:slug, /ai-estimate-generator and
   /ai-invoice-generator in MarketingSite.tsx; getPageSeo for these paths (WebPage + BreadcrumbList + FAQPage, plus
   SoftwareApplication/HowTo on the AI pages); entry-server loads the content; add the landing paths to getPrerenderRoutes
   and seo-check ROUTES (parse `path: '…'` from content/landing/registry.ts).
2. Add `for|compare|ai-estimate-generator|ai-invoice-generator` to MARKETING_RE (pages/routes.ts) AND the inline boot
   script in index.html. The boot script's sha256 then changes: replace the hash in vercel.json's CSP (seo:check prints
   the new one).
3. Write content modules: ai-estimate-generator, ai-invoice-generator and the 4 compare pages (Joist, Invoice2go, Jobber,
   Housecall Pro). Use facts from reports/Contractor software competitor feature gaps.md only, say "as of November 2026",
   cite sources, and say fairly when the competitor is the better fit.
4. Restore the 25 post links rewritten to existing pages (see rewritten-links.txt in this folder: /ai-* went to
   /features#ai-assistant, /for/* to /templates, /compare/* to /blog/best-invoicing-software-for-contractors).
5. Footer/nav links to the new pages; landing paths in llms.txt.
6. IndexNow: key file in public/<key>.txt + scripts/indexnow-ping.ts (POST all sitemap URLs to api.indexnow.org). Not started.
7. Optional: vercel.json header `Content-Type: text/plain; charset=utf-8` for /llms*.txt (Vercel already serves .txt as text/plain).

## Not in sitemap on purpose
- /tutorials is an in-app route for signed-in users. Its public twin, /help, is already prerendered and in the sitemap.
