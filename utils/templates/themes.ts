/**
 * Theme lookup by design id: Classic (the default design, Basic) lives here; every other design comes from the
 * design modules (designs/*.ts: the 10 original Standard designs and the Premium designs). Each theme re-uses the
 * shared blocks (blocks.ts) and adds its own header, page chrome and stylesheet. All colors come from the palette
 * (user accent/secondary or the design defaults).
 *
 * 2026-11-14: the 12 other "Featured" designs of the 2026-11 rebuild were replaced by the Premium designs; their ids
 * resolve to the replacements (registry.ts RETIRED_TEMPLATE_MAP).
 */
import type { TemplateId } from './registry.ts';
import { block, docNumber, lines, logoImg, statusBadge, titleH1, type ThemeDef } from './blocks.ts';
import { DESIGN_LIST } from './designs/index.ts';

// ---------------------------------------------------------------------------
// 1. Classic Professional
// ---------------------------------------------------------------------------
const classic: ThemeDef = {
  id: 'classic',
  pad: { top: 54, x: 56, bottom: 66 },
  header: ({ m }) => block('cd-hdr', `
    <div class="cl-brand">${logoImg(m)}<div class="cl-name">${m.company.name}</div>${lines(m.company.compactLines)}</div>
    <div class="cl-doc">${titleH1(m)}${docNumber(m)}${statusBadge(m)}${m.highlight ? `<div class="cl-hl"><div class="cl-hl-label">${m.highlight.label}</div><div class="cl-hl-value">${m.highlight.value}</div></div>` : ''}</div>`),
  chrome: () => '<div class="cl-bar"></div>',
  css: () => `
.cd-t-classic{--title-size:34px;}
.cd-t-classic .cl-bar{position:absolute;left:0;right:0;top:0;height:8px;background:var(--accent);}
.cd-t-classic .cd-hdr{display:flex;justify-content:space-between;gap:32px;padding-bottom:22px;border-bottom:1px solid var(--rule);margin-bottom:24px;}
.cd-t-classic .cl-brand{max-width:52%;}
.cd-t-classic .cd-logo{margin-bottom:10px;max-height:56px;}
.cd-t-classic .cl-name{font-family:var(--font-head);font-size:17px;font-weight:800;margin-bottom:3px;}
.cd-t-classic .cl-doc{text-align:right;}
.cd-t-classic .cd-title{text-transform:uppercase;letter-spacing:.08em;}
.cd-t-classic .cl-hl{margin-top:14px;display:inline-block;text-align:right;background:var(--accent-soft);border-right:3px solid var(--accent);padding:8px 12px 8px 26px;}
.cd-t-classic .cl-hl-label{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.cd-t-classic .cl-hl-value{font-size:20px;font-weight:800;color:var(--accent-ink);font-family:var(--font-head);}
.cd-t-classic .cd-parties{margin-bottom:26px;}
.cd-t-classic .cd-table th{background:var(--accent);color:var(--on-accent);}
.cd-t-classic .cd-table tbody tr:nth-child(even) td{background:var(--accent-soft);}
.cd-t-classic .cd-footer{border-top:1px solid var(--rule);padding-top:8px;}
`,
};

/** Every theme by design id (Classic + design modules). Retired and legacy ids resolve before lookup. */
export const THEMES = Object.fromEntries(
  [classic, ...DESIGN_LIST.map((d) => d.theme)].map((t) => [t.id, t]),
) as Record<TemplateId, ThemeDef>;
