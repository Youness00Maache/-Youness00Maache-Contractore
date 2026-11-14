# SEO / AI-visibility work: DONE 2026-11-14 (second helper)

## Earlier (first helper, already committed in 921f35d)
- robots.txt AI crawler group, /llms.txt + /llms-full.txt generated at build time, answer-first blog posts with
  HowTo JSON-LD, 9 new posts, seo-check + blog lint extensions, landing data model + 8 trade modules.

## Finished now
- Landing pages rendered and prerendered (14): /ai-estimate-generator, /ai-invoice-generator, /for/{electricians,
  plumbers, hvac, roofers, remodelers, handyman, painters, landscapers}, /compare/{joist, invoice2go, jobber,
  housecall-pro}-alternative.
  - pages/landingLoader.ts (code-split bodies, preloaded before hydration), pages/LandingPages.tsx (trade / AI / compare
    layouts: answer box with data-answer, example document as a real table, ledger + timeline sections, FAQ, related
    guides, sibling links, CTA), routes in pages/MarketingSite.tsx, getPageSeo() landing branch in pages/seo.ts
    (WebPage + BreadcrumbList + FAQPage; SoftwareApplication on AI + compare; HowTo on AI), entry-server loads the body.
  - pages/routes.ts MARKETING_RE + getPrerenderRoutes, index.html boot script, vercel.json CSP hash updated.
  - Sitemap lastmod = registry `updated`, priority 0.8. llms.txt lists the pages; llms-full.txt has answers, compare
    facts with sources, AI can/limits and trade documents.
- Content: ai-estimate-generator, ai-invoice-generator and 4 compare modules. Competitor facts come from the report's
  sources and were re-read on the vendors' pricing pages on 2026-11-14 (Joist, Invoice2go, Jobber, Housecall Pro);
  Invoice2go's page shows no prices, so its price cites Capterra.
- The 25 rewritten blog links point at the real pages again (rewritten-links.txt is now history only).
- Footer: Product column gets the two AI generators; new "For your trade" and "Compare" columns. Home "Made for the
  trades" tape links to the trade pages; Features › AI assistant links to /ai-estimate-generator.
- IndexNow: key file public/0c1123aa3adc22d3f1b108f8dc7539c7.txt, scripts/indexnow-ping.ts (reads the live sitemap,
  checks the key file is live, POSTs to api.indexnow.org; `--dry-run`, `--sitemap=dist/sitemap.xml`). NOT run yet.
- Checks: seo-check now covers the landing pages (JSON-LD types, answer first, a table, signup + pricing + 2 guide
  links, compare pages dated "as of November 2026" with sources and a "better fit" section), the IndexNow key file and
  the owner rule (no billing-provider name / "merchant of record" in any page, llms or sitemap). seo-blog-lint also
  lints landing modules (lengths, counts, related slugs, internal links, compare rules).

## After deploy (coordinator)
1. `npx tsx scripts/indexnow-ping.ts` (submits all sitemap URLs to IndexNow).
2. Search Console: request indexing for the 14 new URLs; Bing picks them up from IndexNow.

## Ideas, not done
- Hub pages /for and /compare (breadcrumbs are two levels today), a general-contractor trade page, an
  "estimate options" or "lien waiver" landing page.
- Refresh the compare pages when competitor prices change (registry `updated` drives the sitemap lastmod).
