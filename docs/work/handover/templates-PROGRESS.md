# Templates rework (owner feedback 2026-11-14) — progress log

Repo: C:\Users\JAAF\Downloads\-Youness00Maache-Contractore-c2ee2b2908a94c029486956a75db59d142a2ee41 (branch my-branch, NOT committing)

## Status
- [ ] Phase 1 picker + plan gating
- [ ] Phase 2 customization
- [ ] Phase 3 premium redesign + thumbnails
- [ ] Final tests + compare images

## Log
- 11:20 started; read NEXT_STEPS B1, registry.ts, TemplateSelector.tsx, model.ts, blocks.ts, render.ts, plans.ts.
  Findings: old app (25ae5cc) had NO template gating (Standard/Premium tabs only, all free). No per-user default design today
  (new docs always 'classic'). Free plan feature list says "every PDF design" (lib/plans.ts) -> must change.
- 12:10 DISK FULL (C: 0 bytes). Deleted only my own scratch QA output (before/html, long pngs) -> ~44 MB free. Something else fills the disk. Keep QA outputs small, clean after runs.
- Other agents are editing concurrently: AppNav.tsx, InventoryView.tsx, Settings.tsx, RequestsInbox.tsx, supabase/functions/ai-assistant/handler.ts (its tsc errors are theirs), components/notifications/.
- Phase 1 code written: registry tiers (BASIC_TEMPLATE_IDS = classic + 10 standard; DESIGN_GROUPS), lib/designPlan.ts (plan store, App sets in render),
  lib/designAccess.ts (rules + enforce + default helpers + requestDesignUpgrade via 'contractordocs:upgrade' event), lib/designDefaults.ts (binds lib/userData raw storage 'documents.design'),
  useDocumentForm (default design for new docs, baseline, enforce on save+download), useDocumentDraftPrefill (AI template gated), src/ai/planDocuments (default design),
  TemplateSelector rewritten (Basic/Premium tabs, locks, preview w/ upgrade, grandfather note, Customize panel, Use-for-new-documents), Sections.tsx TemplateSection wiring.
  Phase 2 groundwork: types.ts DocumentDesignOptions, utils/templates/designOptions.ts, render.ts (o, hideSections, FONT_PAIRS, cd-o-* classes), blocks.ts RenderCtx.o + ThemeDef.layout.
- 12:40 PHASE 1 DONE: tsc clean (except other agent's handler.ts), templates-qa --no-browser 66,859/0, scripts/template-gating-check.ts 133/0.
  Copy updated: lib/plans.ts, pages/PricingPage.tsx, content/site.ts. TODO later: supabase/functions/ai-assistant/shared/knowledge.ts design help + --sync-knowledge.
- Phase 3 plan: engine utils/templates/designs/pro.ts + 15 designs (classic_trade, modern_contractor, blueprint_pro, executive, field_ready, corporate,
  craftsman, minimal_line, bold_block, heritage, slate, proposal, studio, letterhead, work_ticket); 43 retired ids -> RETIRED_TEMPLATE_MAP in registry.

## STATUS AT WRAP-UP (budget stop, 2026-11-14 ~13:10)
DONE
- Phase 1 (complete, tested): Basic/Premium groups, paid-only gating, grandfathering, upgrade window, plan copy, scripts/template-gating-check.ts.
- Phase 2 (code complete, static-tested only): designOptions (fonts pairs, header left/centered/band, logo s/m/l, table lines/striped/boxed,
  density, hide signatures/payment/terms/notes/photos) in render.ts + pro engine; picker Customize panel + live preview; "Use for new documents"
  default (user_settings 'documents.design', lib/designDefaults.ts). NOT done: a Settings page section for the default (picker button only).
- Phase 3 (code complete, static-tested only): engine utils/templates/designs/pro.ts, 15 Premium designs utils/templates/designs/premium.ts,
  registry RETIRED_TEMPLATE_MAP; removed designs/premium1-4.ts, fresh1-2.ts and 12 Featured themes from themes.ts.
LEFT
- Browser QA never run on the new designs: npx tsx scripts/templates-qa.ts --pdfdiff --templates=<premium ids> --out=<scratch> (then full run).
- Visual review/tuning of each Premium design (CSS written blind), before/after images (before: scratch tpl2/before-*.png only).
- AI help text supabase/functions/ai-assistant/shared/knowledge.ts still says "Featured, New, Standard, Premium... every design on every plan"
  -> update + `npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge`; npm run build; npm run qa:document-ai.
- content/templatePreviews.ts (marketing Templates page) lists retired designs' PNGs -> regenerate with --previews and update the list.
- Settings section for the default design (optional; picker has "Use for new documents").
OLD ID -> NEW ID
 template_html->minimal_line, template_html_2->corporate, template_html_2_new->modern_contractor, template_html_3->studio, template_html_4->modern_contractor,
 template_neon->slate, template_luxury->executive, template_nature->craftsman, template_geometric->slate, template_pastel->proposal,
 template_vintage->heritage, template_blueprint->blueprint_pro, template_memphis->bold_block, template_crimson->classic_trade,
 template_watercolor->proposal, template_swiss->studio, template_space->slate, template_retro->field_ready, template_pop->bold_block,
 template_serif->classic_trade; modern->minimal_line, spectrum->modern_contractor, statement->bold_block, ledger->heritage,
 serif_band->classic_trade, bold_header->modern_contractor, friendly->craftsman, boutique->executive, construction->bold_block,
 coastal->proposal, atelier->executive, sidebar->corporate, site_plan->blueprint_pro, timber->craftsman, colorblock->bold_block,
 paper_minimal->minimal_line, service_ticket->work_ticket, nordic->minimal_line, metro->modern_contractor, split->bold_block,
 greenbar->field_ready, voltage->slate, meadow->craftsman. (corporate, executive, heritage keep their ids, redesigned.)

## 2026-11-14 afternoon — finishing pass (branch worktree-agent-a300aae907df5b66c)
Browser QA of the 15 Premium designs × 12 kinds (+ options, sparse, long) with --pdfdiff, contact sheets reviewed by eye.
The automated checks were already green before; the problems were visual:
- Studio Grid, Heritage, Proposal, Field Ready: the plain sample invoice/estimate/daily report/change order/PO ran onto
  a 2nd page with only the notes + signature on it. Studio: details now sit beside the big title, the amount due at
  the end of the first party row (3 rows → 1), title 48px; its title block was squeezed to 44% by an engine rule
  (fixed). Heritage: small logo by default, tighter rhythm. Field Ready: 8px cells, 18px gaps (same look).
  Proposal: "Prepared by" column only on estimates/change orders/work orders/warranties (address + phone; the header
  then shows logo + name only); invoices/POs/time sheets no longer get a squeezed 5th "From" column.
- Every Premium design repeated the key figure in the facts row (work order "Estimated cost", warranty "Warranty
  period" + "Valid through", time sheet "Total hours", profit report "Gross profit"): pro.ts factsBesideKeyFigure.
  Single facts are max 250px wide instead of a full-width box.
- Field Ready "New contract total" wrapped inside the total box (label 16px now). Bold Block amount color is
  contrast-checked against the block (custom colors).
Other changes: line unit printed after the quantity ("42 sq ft", "3 boxes"; model.ts qtyCell; Qty column 14% only when a
line has a unit); blocks.ts isShortSection had a literal backspace (0x08) instead of \b, so the rule "images/tables/
headings never beside the signatures" never applied — fixed (no QA sample changes layout: none of their notes/terms
has an image, table or heading; only real documents with such notes now print them full width); paginate.ts totals
at a page break (carry 1 row if the gap stays ≤ 20% of the page, else short table whole, else "Continued from page N").
templates-qa: --shots=review|gaps, totals-at-page-break sweep (8…30 lines × every design), unit / signoff / previews
checks; Chrome profiles are now deleted at the end of a run (the old unref'd timer left one 30 MB profile per run in
%TEMP% — 138 of them, 4 GB, deleted 2026-11-14).
Marketing Templates page: content/templatePreviews.ts lists the 26 current designs (Basic / Premium groups, Premium
badge), public/templates/previews/<id>.webp (scripts/templates-qa.ts --kinds=invoice --previews).
Compare images: docs/work/handover/templates-compare/*.jpg.
