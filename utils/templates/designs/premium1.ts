/**
 * Design module "premium1": the first five original Premium designs (pre-2026-11 `documentHtmlTemplates.ts`),
 * restored under their original ids and ported to the shared engine:
 *
 *   template_html        Modern Single       - clean single column, accent rule under the header
 *   template_html_2      High End            - dark full-height left column (white logo), huge title, date stack
 *   template_html_2_new  Glassmorphism       - gradient header band with blurred glass circles, soft cards
 *   template_html_3      Minimalist Premium  - top accent bar, tinted info panel, solid table header
 *   template_html_4      Gradient            - slanted gradient header (white logo) with an overlapping shadowed card
 *
 * Differences from the originals (on purpose): labels/titles come from the document model (no hardcoded
 * "INVOICE"/"Bill To"), money is formatted, table headers on accent fills use a readable text color, and
 * every field the model provides has a place (pay button + QR, all parties and dates, notes/terms, signatures).
 * The PDF is drawn by the browser, so the original effects are used again (logo `filter`, backdrop blur,
 * box shadows); on very old browsers (html2canvas fallback) they degrade without hiding any text.
 */
import type { DocModel, ItemsTable, MetaItem, Section } from '../model.ts';
import type { TemplateMeta } from '../registry.ts';
import {
  block, defaultCompose, hasSummary, itemsBlock, lines, logoImg, metaList, payButton, statusBadge, summaryNotes, titleH1, totalsHtml,
  type DesignDef, type Parts, type RenderCtx, type ThemeDef,
} from '../blocks.ts';
import { isLight } from '../colors.ts';
import { without } from '../kit.ts';

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
const premium = (meta: Omit<TemplateMeta, 'collection'>): TemplateMeta => ({ ...meta, collection: 'premium' });

/** Company address / phone / email / website, one per line (website gets its own class). */
const companyLines = (m: DocModel, cls: string, opts: { website?: boolean } = {}) => {
  const c = m.company;
  const rows = [
    ...c.addressLines.map((l) => `<div>${l}</div>`),
    c.phone ? `<div>${c.phone}</div>` : '',
    c.email ? `<div>${c.email}</div>` : '',
    opts.website !== false && c.website ? `<div class="p1-web">${c.website}</div>` : '',
  ].join('');
  return rows ? `<div class="${cls}">${rows}</div>` : '';
};

const partyHtml = (m: DocModel, cls = 'cd-party') =>
  m.parties.map((p) => `<div class="${cls}"><div class="cd-label">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('');

const plainLength = (html: string) => html.replace(/<[^>]+>/g, '').length;

/** Notes/terms short enough to sit beside the totals (as in the original layouts). */
const shortAfter = (sections: Section[]) =>
  sections.length > 0 && sections.length <= 3
  && sections.every((s) => plainLength(s.html) < 650 && !/<(img|table|h[1-3])/i.test(s.html))
  && sections.reduce((a, s) => a + plainLength(s.html), 0) < 900;

/** Adds classes to the root `<section class="cd-block …">` of a rendered block. */
const addClass = (html: string, cls: string) => (html ? html.replace(/^<section class="cd-block /, `<section class="cd-block ${cls} `) : html);

/** Document number with the original "#" prefix (never doubled). */
const hashNo = (m: DocModel) => `#${m.number.replace(/^#\s*/, '')}`;

const pagenoFooter = (cls: string, text = '') => `<div class="cd-footer ${cls}"><div class="cd-footer-text">${text}</div><div class="cd-pageno"></div></div>`;

/** Meta items that are dates (the originals printed the dates apart from the other details). */
const isDateMeta = (i: MetaItem) => /\bdate\b|until|required by|through|\bdue\b|issued/i.test(i.label);

/** The originals turned the logo white on their dark headers (CSS filter); on a light custom color it keeps its colors. */
const logoFilter = (onColor: string) => (isLight(onColor) ? 'filter:brightness(0) invert(1);' : '');

// --- items table: numeric columns sized to their content, so the description gets the room (as in the originals)
const plainText = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, 'x').trim();

/** Rough rendered width (px) of a short text; only used to size numeric columns, with a safety margin. */
const textWidth = (s: string, size: number, opts: { upper?: boolean; spacing?: number; bold?: boolean } = {}) => {
  let w = 0;
  for (const ch of opts.upper ? s.toUpperCase() : s) {
    // digits are sized for the widest body fonts the user can pick (tabular figures)
    const k = /[.,:;'!|]/.test(ch) || ch === ' ' ? 0.28 : /[iljIft]/.test(ch) ? 0.3 : /[MWmw%@]/.test(ch) ? 0.88 : /[A-Z]/.test(ch) ? 0.72 : /[0-9$€£¥]/.test(ch) ? 0.62 : 0.56;
    w += k * size + (opts.spacing || 0);
  }
  return w * (opts.bold ? 1.07 : 1);
};

interface FitOpts {
  /** table header font size / letter-spacing (px) */
  th: number;
  spacing: number;
  /** body cell font size (px) */
  td: number;
  /** horizontal cell padding (left + right) plus a safety margin */
  pad: number;
  /** minimum width of a numeric column (px, padding included) */
  min: number;
}

/** Tighter cell metrics, used when a table has too many numeric columns for the normal ones (`.p1-tight`). */
const TIGHT: Omit<FitOpts, 'min'> = { th: 9.5, spacing: 0.4, td: 11.5, pad: 14 };

/** Width of every column with the given metrics; short left columns with a % width (dates) fit their content too. */
const columnWidths = (t: ItemsTable, avail: number, o: Omit<FitOpts, 'min'> & { min?: number }) => {
  const last = t.columns.length - 1;
  const hw = (s: string) => textWidth(s, o.th, { upper: true, spacing: o.spacing, bold: true });
  return t.columns.map((c, i) => {
    const texts = t.rows.map((r) => plainText(r[i] || ''));
    if (c.align === 'left') {
      if (!c.width) return 0;
      const pct = (parseFloat(c.width) / 100) * avail;
      // a short left column (a date, a name) only needs its longest value, not its % of the table
      return texts.every((x) => x.length <= 16) ? Math.min(pct, Math.ceil(Math.max(hw(plainText(c.label)), ...texts.map((x) => textWidth(x, o.td))) + o.pad)) : pct;
    }
    // short headers stay on one line; longer ones may wrap between words
    const label = plainText(c.label);
    const head = hw(label) <= 90 ? hw(label) : Math.max(...label.split(/\s+/).map(hw));
    const cells = Math.max(0, ...texts.map((x) => textWidth(x, o.td, { bold: i === last })));
    return Math.ceil(Math.max(head + o.pad, cells + o.pad, o.min ?? 0));
  });
};

/**
 * Right/center aligned columns get a px width that fits their header and values; the description column keeps
 * the rest (at least what its own short values need, up to 36% of the table). When the numbers need more room,
 * the table switches to tighter cell metrics (`tight`), and as a last resort the widths are scaled down.
 */
const fitColumns = (t: ItemsTable, avail: number, o: FitOpts): { table: ItemsTable; tight: boolean } => {
  if (!t.rows.length) return { table: t, tight: false };
  const desc = t.columns.findIndex((c) => c.align === 'left' && !c.width);
  const descNeed = desc < 0 ? 0 : Math.max(...t.rows.map((r) => textWidth(plainText(r[desc] || ''), o.td))) + o.pad;
  const descMin = desc < 0 ? 0 : Math.min(avail * 0.36, Math.max(100, descNeed));
  const sum = (ws: number[]) => ws.reduce((a, w) => a + w, 0);
  let tight = false;
  let ws = columnWidths(t, avail, o);
  if (sum(ws) > avail - descMin) {
    tight = true;
    ws = columnWidths(t, avail, { ...TIGHT, min: Math.min(o.min, 40) });
    const total = sum(ws);
    if (total > avail - descMin) ws = ws.map((w) => (w * (avail - descMin)) / total);
  }
  const columns = t.columns.map((c, i) => (ws[i] ? { ...c, width: `${Math.floor(ws[i])}px` } : c));
  return { table: { ...t, columns }, tight };
};

/** Parts with the items table re-rendered with fitted columns. */
const fitItems = (ctx: RenderCtx, p: Parts, avail: number, o: FitOpts): Parts => {
  const t = ctx.m.items;
  if (!t || !p.items || !t.rows.length) return p;
  const { table, tight } = fitColumns(t, avail, o);
  const html = itemsBlock({ ...ctx, m: { ...ctx.m, items: table } });
  return { ...p, items: tight ? html.replace('class="cd-table"', 'class="cd-table p1-tight"') : html };
};

/** CSS of the tight table variant (after the design's own cell rules, before its first/last-child paddings). */
const tightCss = (id: string) => `
.cd-t-${id} .cd-table.p1-tight th{font-size:${TIGHT.th}px;letter-spacing:${TIGHT.spacing}px;padding-left:5px;padding-right:5px;}
.cd-t-${id} .cd-table.p1-tight td{font-size:${TIGHT.td}px;padding-left:5px;padding-right:5px;}`;

/** Content width of a theme's page body. */
const bodyWidth = (ctx: RenderCtx, theme: Pick<ThemeDef, 'pad'>) => ctx.page.width - (theme.pad.left ?? theme.pad.x) - theme.pad.x;

// ---------------------------------------------------------------------------
// 1. Modern Single (template_html)
// ---------------------------------------------------------------------------
const MS_PAD = { top: 46, x: 52, bottom: 72, footer: 26 };
const modernSingle: ThemeDef = {
  id: 'template_html',
  pad: MS_PAD,
  noSignoff: true,
  header: ({ m }) => block('cd-hdr', `
    <div class="ms-brand">${m.company.logoUrl ? `${logoImg(m)}${m.company.name ? `<div class="ms-co-sm">${m.company.name}</div>` : ''}` : (m.company.name ? `<div class="ms-co">${m.company.name}</div>` : '')}${companyLines(m, 'ms-lines')}</div>
    <div class="ms-doc">${titleH1(m)}<div class="ms-ids">${m.number ? `<div><span class="ms-k">${m.numberLabel}</span> <span class="ms-v">${m.number}</span></div>` : ''}${m.meta.map((i) => `<div><span class="ms-k">${i.label}</span> <span class="ms-v">${i.value}</span></div>`).join('')}</div>${statusBadge(m)}</div>`),
  parties: ({ m }) => (m.parties.length ? block('cd-parties ms-parties', partyHtml(m)) : ''),
  compose: (ctx, p) => defaultCompose(fitItems(ctx, p, bodyWidth(ctx, { pad: MS_PAD }), { th: 11, spacing: 0.5, td: 13, pad: 22, min: 64 })),
  footer: ({ m }) => pagenoFooter('ms-footer', `Authorized Document${m.company.name ? `<span class="cd-dot">•</span>${m.company.name}` : ''}`),
  css: () => `
.cd-t-template_html{--title-size:42px;color:#333;}
.cd-t-template_html .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;padding-bottom:20px;border-bottom:2px solid var(--accent);margin-bottom:30px;}
.cd-t-template_html .ms-brand{flex:1 1 auto;min-width:0;max-width:54%;}
.cd-t-template_html .cd-logo{max-height:80px;max-width:200px;margin-bottom:14px;}
.cd-t-template_html .ms-co{font-family:var(--font-head);font-size:28px;font-weight:700;line-height:1.15;color:var(--accent-ink);margin-bottom:8px;overflow-wrap:anywhere;}
.cd-t-template_html .ms-co-sm{font-weight:700;font-size:13px;color:#333;margin-bottom:2px;}
.cd-t-template_html .ms-lines{font-size:13px;line-height:1.55;color:#666;overflow-wrap:anywhere;}
.cd-t-template_html .p1-web{color:var(--accent-ink);}
.cd-t-template_html .ms-doc{flex:none;max-width:48%;text-align:right;}
.cd-t-template_html .cd-title{font-weight:800;letter-spacing:-1px;text-transform:uppercase;line-height:1;}
.cd-t-template_html .ms-ids{margin-top:15px;font-size:14px;line-height:1.6;}
.cd-t-template_html .ms-k{color:#999;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.02em;}
.cd-t-template_html .ms-v{font-weight:600;color:#333;}
.cd-t-template_html .ms-doc .cd-status{margin-top:8px;}
.cd-t-template_html .ms-parties{gap:40px;margin-bottom:28px;}
.cd-t-template_html .ms-parties .cd-party{flex:0 1 45%;}
.cd-t-template_html .cd-label{font-size:11px;font-weight:700;color:#999;letter-spacing:.5px;margin-bottom:8px;}
.cd-t-template_html .cd-party-name{font-size:16px;font-weight:700;color:#333;margin-bottom:4px;}
.cd-t-template_html .cd-lines{font-size:13.5px;color:#666;}
.cd-t-template_html .cd-facts{gap:14px;margin-bottom:24px;}
.cd-t-template_html .cd-fact{background:#f9f9f9;border:0;border-radius:8px;padding:14px 18px;}
.cd-t-template_html .cd-fact-label{color:#999;font-size:10.5px;letter-spacing:.5px;}
.cd-t-template_html .cd-fact-value{color:#333;font-size:18px;margin-top:5px;}
.cd-t-template_html .cd-fact-sub{color:#999;}
.cd-t-template_html .cd-table th{color:#999;font-size:11px;letter-spacing:.5px;padding:10px 8px;border-bottom:2px solid #eee;}
.cd-t-template_html .cd-table td{padding:12px 8px;border-bottom:1px solid #eee;color:#555;font-size:13px;}
${tightCss('template_html')}
.cd-t-template_html .cd-table th:first-child,.cd-t-template_html .cd-table td:first-child{padding-left:0;}
.cd-t-template_html .cd-table th:last-child,.cd-t-template_html .cd-table td:last-child{padding-right:0;}
.cd-t-template_html .cd-table td.cd-c-desc{color:#333;font-size:14px;font-weight:600;}
.cd-t-template_html .cd-table td.cd-col-last{color:#333;font-weight:600;}
.cd-t-template_html .cd-items{margin-bottom:26px;}
.cd-t-template_html .cd-summary{margin-bottom:26px;}
.cd-t-template_html .cd-totals{flex:0 0 250px;}
.cd-t-template_html .cd-tot{padding:0 0 8px;font-size:13px;color:#666;}
.cd-t-template_html .cd-tot-label{color:#666;}
.cd-t-template_html .cd-tot-value{font-weight:400;}
.cd-t-template_html .cd-tot-grand{margin-top:7px;padding:15px 0 0;border-top:2px solid #eee;border-radius:0;background:none;color:var(--accent-ink);font-size:18px;font-weight:700;}
.cd-t-template_html .cd-tot-grand:first-child{margin-top:0;}
.cd-t-template_html .cd-tot-grand .cd-tot-label{color:inherit;}
.cd-t-template_html .cd-tot-grand .cd-tot-value{font-weight:700;}
.cd-t-template_html .cd-tot-balance{padding-top:8px;color:#333;}
.cd-t-template_html .cd-tot-balance .cd-tot-value{font-weight:800;}
.cd-t-template_html .cd-section:not(.cd-before):not(.cd-visuals){background:#f9f9f9;border-radius:8px;padding:20px;}
.cd-t-template_html .cd-section-body>*:last-child,.cd-t-template_html .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_html .cd-h{color:#999;font-family:var(--font-body);font-size:11px;font-weight:700;letter-spacing:.04em;margin-bottom:8px;}
.cd-t-template_html .cd-section:not(.cd-before) .cd-prose{font-size:13px;color:#555;}
.cd-t-template_html .cd-section.cd-before{margin-bottom:24px;}
.cd-t-template_html .cd-before .cd-prose{font-size:12.5px;line-height:1.6;}
.cd-t-template_html .cd-sigs{margin-top:10px;}
.cd-t-template_html .cd-sig{max-width:240px;}
.cd-t-template_html .cd-sig-img{height:60px;}
.cd-t-template_html .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html .cd-sig-line{border-top:2px solid var(--accent);width:200px;margin-top:8px;}
.cd-t-template_html .cd-sig-label{color:#999;font-size:11px;font-weight:400;letter-spacing:.5px;}
.cd-t-template_html .cd-closing{text-align:center;margin-top:6px;}
.cd-t-template_html .cd-closing-text{font-family:var(--font-body);font-size:13px;font-weight:600;color:#555;}
.cd-t-template_html .cd-pay-btn{border-radius:6px;}
.cd-t-template_html .ms-footer{justify-content:center;gap:14px;border-top:1px dashed #e4e4e4;padding-top:10px;color:#b8b8b8;font-size:11px;}
`,
};

// ---------------------------------------------------------------------------
// 2. High End (template_html_2): dark full-height left column (page chrome), big title + date stack on the right
// ---------------------------------------------------------------------------
/** width of the dark column (the original: 35% + 2 × 40px padding; here ≈ 40% of the page, so the table keeps room) */
const HE_SIDE = 320;
const HE_PAD = { top: 60, x: 40, left: HE_SIDE + 40, bottom: 66 };

/** Font size (in cqi of the title box) at which the longest word of the title still fits the box. */
const heTitleFit = (m: DocModel) => {
  const em = Math.max(...plainText(m.title).split(/\s+/).map((w) => textWidth(w, 1, { upper: true, bold: true }) - 0.05 * w.length));
  return `${Math.min(30, 92 / Math.max(em, 1)).toFixed(1)}cqi`;
};

const highEnd: ThemeDef = {
  id: 'template_html_2',
  pad: HE_PAD,
  noSignoff: true,
  header: ({ m }) => {
    // the original stacked the dates beside the title (date, then the due date in the accent color)
    const key = m.keyDate?.value;
    const dates = m.meta.filter(isDateMeta).map((i, n) => `<div class="he-d${n > 0 && key && i.value === key ? ' he-key' : ''}"><div class="he-dk">${i.label}</div><div class="he-dv">${i.value}</div></div>`).join('');
    return block('cd-hdr', `<div class="he-titlebox" style="--he-fit:${heTitleFit(m)}">${titleH1(m)}${m.number ? `<div class="he-no"><span class="he-no-k">${m.numberLabel}</span> ${hashNo(m)}</div>` : ''}${statusBadge(m)}</div>${dates ? `<div class="he-dates">${dates}</div>` : ''}`);
  },
  parties: () => '',
  chrome: ({ m }) => {
    const brand = m.company.logoUrl
      ? `<div class="he-logo">${logoImg(m)}</div>`
      : (m.company.name ? `<div class="he-co-big">${m.company.name}</div>` : '');
    const from = m.company.name || m.company.lines.length
      ? `<div class="he-sec"><div class="he-k">From</div>${m.company.name ? `<div class="he-from-name">${m.company.name}</div>` : ''}${companyLines(m, 'he-lines he-co-lines')}</div>`
      : '';
    const parties = m.parties.map((p) => `<div class="he-sec"><div class="he-k">${p.label}</div>${p.name ? `<div class="he-pname">${p.name}</div>` : ''}${lines(p.lines, 'he-lines')}</div>`);
    // details that are not dates (project, terms, PO…) live in the dark column, under the parties
    const rest = m.meta.filter((i) => !isDateMeta(i));
    const details = rest.length
      ? `<div class="he-sec">${rest.map((i) => `<div class="he-di"><div class="he-k">${i.label}</div><div class="he-dval">${i.value}</div></div>`).join('')}</div>`
      : '';
    const secs = [from, ...parties, details].filter(Boolean);
    return `<div class="he-side"></div><div class="he-side-in">${brand ? `<div class="he-brand">${brand}</div><div class="he-gap he-gap-brand"></div>` : ''}<div class="cd-first-only he-secs">${secs.join('<div class="he-gap"></div>')}</div></div>`;
  },
  compose: (ctx, p) => defaultCompose(fitItems(ctx, p, bodyWidth(ctx, { pad: HE_PAD }), { th: 10, spacing: 0.8, td: 12.5, pad: 18, min: 44 })),
  footer: ({ m }) => pagenoFooter('he-footer', `${m.company.name ? `${m.company.name} • ` : ''}Generated Document`),
  css: ({ c }) => `
.cd-t-template_html_2{--title-size:60px;--side:${HE_SIDE}px;color:#333;}
.cd-t-template_html_2 .he-side{position:absolute;left:0;top:0;bottom:0;width:var(--side);background:var(--secondary);}
.cd-t-template_html_2 .he-side-in{position:absolute;left:0;top:0;bottom:70px;width:var(--side);padding:60px 40px 0;display:flex;flex-direction:column;color:var(--on-secondary);}
.cd-t-template_html_2 .he-brand{flex:none;}
.cd-t-template_html_2 .he-logo .cd-logo{max-height:100px;max-width:100%;${logoFilter(c.onSecondary)}}
.cd-t-template_html_2 .he-co-big{font-family:var(--font-head);font-size:28px;font-weight:800;letter-spacing:-.5px;line-height:1.15;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-gap{flex:0 1 54px;min-height:18px;}
.cd-t-template_html_2 .he-gap-brand{flex-basis:76px;min-height:26px;}
.cd-t-template_html_2 .cd-first .he-secs{display:flex;flex-direction:column;flex:0 1 auto;min-height:0;overflow:hidden;}
.cd-t-template_html_2 .he-sec{flex:none;}
.cd-t-template_html_2 .he-k{text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:2px;opacity:.5;margin-bottom:14px;}
.cd-t-template_html_2 .he-from-name{font-weight:600;font-size:15px;line-height:1.4;margin-bottom:5px;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-pname{font-size:20px;font-weight:700;line-height:1.25;margin-bottom:8px;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-lines{font-size:14px;line-height:1.6;opacity:.8;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-co-lines{font-size:13px;line-height:1.95;opacity:.9;}
.cd-t-template_html_2 .he-di+.he-di{margin-top:16px;}
.cd-t-template_html_2 .he-di .he-k{margin-bottom:6px;}
.cd-t-template_html_2 .he-dval{font-size:15px;font-weight:600;line-height:1.35;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-footer{left:40px;right:auto;width:calc(var(--side) - 80px);bottom:28px;flex-direction:column;align-items:flex-start;gap:2px;color:var(--on-secondary);opacity:.4;font-size:10px;}
.cd-t-template_html_2 .he-footer .cd-footer-text{max-width:100%;}
.cd-t-template_html_2 .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:40px;}
.cd-t-template_html_2 .he-titlebox{flex:1 1 0;min-width:0;container-type:inline-size;}
.cd-t-template_html_2 .cd-title{font-weight:900;letter-spacing:-3px;line-height:.9;text-transform:uppercase;font-size:min(var(--title-size),var(--he-fit,19cqi));}
.cd-t-template_html_2 .cd-title.cd-len-m{font-size:min(calc(var(--title-size) * .8),var(--he-fit,19cqi));letter-spacing:-2px;}
.cd-t-template_html_2 .cd-title.cd-len-l{font-size:min(calc(var(--title-size) * .68),var(--he-fit,19cqi));letter-spacing:-1.5px;}
.cd-t-template_html_2 .he-no{font-size:16px;font-weight:500;color:#999;margin-top:15px;letter-spacing:1px;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-no-k{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.cd-t-template_html_2 .he-titlebox .cd-status{margin-top:12px;}
.cd-t-template_html_2 .he-dates{flex:none;max-width:46%;text-align:right;padding-top:10px;}
.cd-t-template_html_2 .he-d+.he-d{margin-top:20px;}
.cd-t-template_html_2 .he-dk{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#999;margin-bottom:4px;}
.cd-t-template_html_2 .he-dv{font-size:18px;font-weight:600;line-height:1.25;color:#333;white-space:nowrap;}
.cd-t-template_html_2 .he-key .he-dv{color:var(--accent-ink);}
.cd-t-template_html_2 .cd-facts{flex-wrap:wrap;gap:12px;margin-bottom:30px;}
.cd-t-template_html_2 .cd-fact:first-child:nth-last-child(n+4),.cd-t-template_html_2 .cd-fact:first-child:nth-last-child(n+4)~.cd-fact{flex:1 1 calc(50% - 6px);}
.cd-t-template_html_2 .cd-fact{background:#f8f9fa;border:0;border-left:4px solid var(--accent);border-radius:0 6px 6px 0;padding:12px 14px;}
.cd-t-template_html_2 .cd-fact-label{color:#999;letter-spacing:1px;}
.cd-t-template_html_2 .cd-fact-value{font-size:17px;color:#333;}
.cd-t-template_html_2 .cd-block.cd-tags{margin-top:-14px;margin-bottom:22px;}
.cd-t-template_html_2 .cd-tag{background:#f3f4f6;color:#333;}
.cd-t-template_html_2 .cd-table th{color:#999;font-size:10px;letter-spacing:.8px;padding:14px 7px;border-bottom:2px solid var(--accent);}
.cd-t-template_html_2 .cd-table td{padding:12px 7px;border-bottom:1px solid #f0f0f0;color:#666;font-size:12.5px;}
${tightCss('template_html_2')}
.cd-t-template_html_2 .cd-table tbody tr:nth-child(odd) td{background:#fafafa;}
.cd-t-template_html_2 .cd-table td.cd-c-desc{color:#333;font-weight:500;}
.cd-t-template_html_2 .cd-table td.cd-col-last{color:#333;font-weight:700;}
.cd-t-template_html_2 .cd-items{margin-bottom:24px;}
.cd-t-template_html_2 .cd-summary{flex-direction:column;align-items:flex-end;gap:14px;margin-bottom:26px;}
.cd-t-template_html_2 .cd-totals{order:-1;flex:none;width:320px;max-width:100%;}
.cd-t-template_html_2 .cd-summary-side{align-self:stretch;}
.cd-t-template_html_2 .cd-tot{padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14.5px;color:#666;}
.cd-t-template_html_2 .cd-tot-label{color:#666;}
.cd-t-template_html_2 .cd-tot-grand{margin:0;padding:16px 0 6px;border:0;border-radius:0;background:none;color:var(--accent-ink);font-size:30px;font-weight:800;align-items:baseline;flex-wrap:wrap;gap:4px 16px;}
.cd-t-template_html_2 .cd-tot-grand .cd-tot-label{color:inherit;font-size:24px;line-height:1.2;}
.cd-t-template_html_2 .cd-tot-grand .cd-tot-value{margin-left:auto;}
.cd-t-template_html_2 .cd-tot-balance{border-top:2px solid var(--accent);border-bottom:0;padding-top:12px;color:#333;font-size:16px;}
.cd-t-template_html_2 .cd-section:not(.cd-before):not(.cd-visuals){padding:24px 26px;background:#f8f9fa;border-left:5px solid var(--accent);border-radius:6px;}
.cd-t-template_html_2 .cd-section-body>*:last-child,.cd-t-template_html_2 .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_html_2 .cd-h{color:#999;font-family:var(--font-body);font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:12px;}
.cd-t-template_html_2 .cd-section:not(.cd-before) .cd-prose{font-size:13.5px;line-height:1.8;color:#555;}
.cd-t-template_html_2 .cd-section.cd-before{margin-bottom:24px;}
.cd-t-template_html_2 .cd-before .cd-prose{font-size:12.5px;line-height:1.65;color:#444;}
.cd-t-template_html_2 .cd-closing-text{font-family:var(--font-body);font-size:13.5px;}
.cd-t-template_html_2 .cd-sigs{gap:28px;margin-top:8px;}
.cd-t-template_html_2 .cd-sig{flex:1 1 160px;max-width:220px;}
.cd-t-template_html_2 .cd-sig-img{height:60px;}
.cd-t-template_html_2 .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html_2 .cd-sig-line{border-top:2px solid var(--accent);width:200px;max-width:100%;margin-top:8px;}
.cd-t-template_html_2 .cd-sig-label{color:#666;font-size:10px;font-weight:400;letter-spacing:1px;}
.cd-t-template_html_2 .cd-parties{gap:20px;}
`,
};

// ---------------------------------------------------------------------------
// 3. Glassmorphism (template_html_2_new): gradient band with blurred glass circles, soft cards
// ---------------------------------------------------------------------------
const GL_PAD = { top: 40, x: 52, bottom: 70, footer: 28 };
const glassmorphism: ThemeDef = {
  id: 'template_html_2_new',
  pad: GL_PAD,
  noSignoff: true,
  closingBlock: true,
  header: ({ m }) => block('cd-hdr gl-band', `
    <div class="gl-c1 cd-deco"></div><div class="gl-c2 cd-deco"></div>
    <div class="gl-row">
      <div class="gl-left">${m.company.logoUrl ? `<div class="gl-logo">${logoImg(m)}</div>` : ''}${titleH1(m)}${m.number ? `<div class="gl-no">${m.numberLabel} ${hashNo(m)}</div>` : ''}${m.keyDate ? `<div class="gl-date">${m.keyDate.label} · ${m.keyDate.value}</div>` : ''}${statusBadge(m)}</div>
      <div class="gl-right">${m.company.name ? `<div class="gl-co">${m.company.name}</div>` : ''}${companyLines(m, 'gl-lines', { website: false })}</div>
    </div>`),
  parties: ({ m }) => {
    if (!m.parties.length) {
      // no parties (notes): the details card spans the row, its items side by side
      return m.meta.length
        ? block('cd-parties gl-cards', `<div class="gl-card gl-card-meta gl-meta-row"><div class="cd-label">Details</div><div class="gl-mrow">${m.meta.map((i) => `<div class="gl-mi"><div class="gl-mk">${i.label}</div><div class="gl-mv">${i.value}</div></div>`).join('')}</div></div>`)
        : '';
    }
    const cards = [
      ...m.parties.map((p) => `<div class="gl-card"><div class="cd-label">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      m.meta.length ? `<div class="gl-card gl-card-meta"><div class="cd-label">Details</div>${metaList(m)}</div>` : '',
    ].join('');
    return block('cd-parties gl-cards', cards);
  },
  compose: (ctx, base) => {
    const { m } = ctx;
    const p = fitItems(ctx, base, bodyWidth(ctx, { pad: GL_PAD }), { th: 11.5, spacing: 0.9, td: 12.5, pad: 32, min: 64 });
    const tail = [p.closing, p.signatures];
    // notes / terms beside the totals, as in the original (only when they are short enough to stay on one page)
    // (only for short item lists: a tall summary would otherwise drag table rows onto the next page)
    if (m.totals.length && (m.items?.rows.length ?? 0) <= 4 && shortAfter(m.after)) {
      const notes = m.after.map((s) => `<div class="gl-note gl-note-${s.id}">${s.title ? `<div class="cd-h">${s.title}</div>` : ''}<div class="cd-prose">${s.html}</div></div>`).join('');
      const summary = block('cd-summary gl-summary', `<div class="cd-summary-side">${payButton(m)}${summaryNotes(m)}${notes}</div>${totalsHtml(m.totals)}`);
      return [...defaultCompose({ ...without(p, 'closing', 'signatures', 'after'), summary }), ...tail];
    }
    return [...defaultCompose(without(p, 'closing', 'signatures')), ...tail];
  },
  footer: ({ m }) => pagenoFooter('gl-footer', m.company.website),
  css: () => `
.cd-t-template_html_2_new{--title-size:36px;color:#000;}
.cd-t-template_html_2_new .gl-band{position:relative;overflow:hidden;margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 28px calc(-1 * var(--pl));padding:38px var(--px) 36px var(--pl);background:linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%);color:var(--on-accent);}
.cd-t-template_html_2_new .gl-c1,.cd-t-template_html_2_new .gl-c2{position:absolute;border-radius:50%;background:rgba(255,255,255,.1);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}
.cd-t-template_html_2_new .gl-c1{top:-50px;right:-50px;width:300px;height:300px;}
.cd-t-template_html_2_new .gl-c2{bottom:-30px;left:50px;width:150px;height:150px;-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);}
.cd-t-template_html_2_new .gl-row{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
.cd-t-template_html_2_new .gl-left{flex:1 1 auto;min-width:0;}
.cd-t-template_html_2_new .gl-logo{display:inline-block;background:rgba(255,255,255,.9);border-radius:8px;padding:5px;margin-bottom:16px;}
.cd-t-template_html_2_new .gl-logo .cd-logo{max-height:70px;max-width:230px;}
.cd-t-template_html_2_new .cd-title{color:var(--on-accent);font-weight:800;letter-spacing:-1px;text-transform:uppercase;line-height:1.1;}
.cd-t-template_html_2_new .gl-no{margin-top:8px;font-size:16px;font-weight:600;opacity:.95;}
.cd-t-template_html_2_new .gl-date{margin-top:2px;font-size:14px;opacity:.9;}
.cd-t-template_html_2_new .gl-band .cd-status{background:#ffffff;border-color:#ffffff;margin-top:12px;}
.cd-t-template_html_2_new .gl-right{flex:none;max-width:46%;text-align:right;margin-top:8px;}
.cd-t-template_html_2_new .gl-co{font-family:var(--font-head);font-size:24px;font-weight:800;line-height:1.2;margin-bottom:8px;overflow-wrap:anywhere;}
.cd-t-template_html_2_new .gl-lines{font-size:13px;line-height:1.6;opacity:.95;overflow-wrap:anywhere;}
.cd-t-template_html_2_new .gl-cards{gap:20px;margin-bottom:26px;align-items:stretch;}
.cd-t-template_html_2_new .gl-card{flex:1 1 0;min-width:0;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:20px;}
.cd-t-template_html_2_new .cd-label{color:var(--accent-ink);font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:12px;}
.cd-t-template_html_2_new .cd-party-name{font-size:16px;font-weight:700;color:#000;margin-bottom:4px;}
.cd-t-template_html_2_new .gl-card .cd-lines{font-size:14px;color:#000;line-height:1.5;}
.cd-t-template_html_2_new .cd-meta-row{border-bottom:1px dashed #E5E7EB;padding:4px 0 5px;margin-bottom:4px;font-size:13px;}
.cd-t-template_html_2_new .cd-meta-row:last-child{border-bottom:0;margin-bottom:0;}
.cd-t-template_html_2_new .cd-meta-row dt{color:#000;}
.cd-t-template_html_2_new .gl-mrow{display:flex;flex-wrap:wrap;gap:10px 44px;}
.cd-t-template_html_2_new .gl-mi{min-width:0;}
.cd-t-template_html_2_new .gl-mk{font-size:12px;color:#4B5563;margin-bottom:2px;}
.cd-t-template_html_2_new .gl-mv{font-size:14px;font-weight:600;color:#000;overflow-wrap:anywhere;}
.cd-t-template_html_2_new .cd-facts{gap:16px;margin-bottom:24px;}
.cd-t-template_html_2_new .cd-fact{background:#F9FAFB;border-color:#E5E7EB;border-radius:12px;padding:14px 18px;}
.cd-t-template_html_2_new .cd-fact-label{color:var(--accent-ink);letter-spacing:1px;}
.cd-t-template_html_2_new .cd-fact-value{color:#000;font-size:18px;}
.cd-t-template_html_2_new .cd-table{border-collapse:separate;border-spacing:0;}
.cd-t-template_html_2_new .cd-table th{background:var(--accent);color:var(--on-accent);font-size:11.5px;padding:14px 16px;}
.cd-t-template_html_2_new .cd-table th:first-child{border-top-left-radius:8px;}
.cd-t-template_html_2_new .cd-table th:last-child{border-top-right-radius:8px;}
.cd-t-template_html_2_new .cd-table td{padding:14px 16px;border-bottom:1px solid rgba(0,0,0,.1);color:#000;font-size:12.5px;}
${tightCss('template_html_2_new')}
.cd-t-template_html_2_new .cd-table td.cd-c-desc{font-weight:500;}
.cd-t-template_html_2_new .cd-table td.cd-col-last{font-weight:600;}
.cd-t-template_html_2_new .cd-items{margin-bottom:22px;}
.cd-t-template_html_2_new .cd-summary{margin-top:6px;margin-bottom:24px;gap:40px;}
.cd-t-template_html_2_new .cd-summary-side{padding-right:20px;}
.cd-t-template_html_2_new .gl-note{font-size:12px;line-height:1.6;}
.cd-t-template_html_2_new .gl-note+.gl-note{margin-top:20px;}
.cd-t-template_html_2_new .gl-note-notes{background:#F9FAFB;border-left:4px solid var(--accent);border-radius:4px;padding:15px;}
.cd-t-template_html_2_new .gl-note .cd-prose{font-size:13px;line-height:1.6;color:#000;}
.cd-t-template_html_2_new .gl-note-notes .cd-h,.cd-t-template_html_2_new .cd-sec-notes .cd-h{color:var(--accent-ink);}
.cd-t-template_html_2_new .cd-h{font-family:var(--font-body);color:#000;font-size:11px;font-weight:700;letter-spacing:.06em;margin-bottom:6px;}
.cd-t-template_html_2_new .cd-totals{flex:0 0 280px;}
.cd-t-template_html_2_new .cd-tot{padding:0 0 10px;font-size:14px;color:#000;}
.cd-t-template_html_2_new .cd-tot-label{color:#000;}
.cd-t-template_html_2_new .cd-tot-grand{margin-top:5px;padding:15px 0 0;border-top:1px solid #E5E7EB;border-radius:0;background:none;color:var(--accent-ink);align-items:center;font-size:24px;font-weight:800;}
.cd-t-template_html_2_new .cd-tot-grand:first-child{margin-top:0;}
.cd-t-template_html_2_new .cd-tot-grand .cd-tot-label{font-size:16px;font-weight:700;color:var(--accent-ink);}
.cd-t-template_html_2_new .cd-tot-muted{margin-top:10px;}
.cd-t-template_html_2_new .cd-section:not(.cd-before):not(.cd-visuals) .cd-prose{font-size:13px;line-height:1.6;color:#000;}
.cd-t-template_html_2_new .cd-sec-notes:not(.cd-before){background:#F9FAFB;border-left:4px solid var(--accent);border-radius:4px;padding:15px;}
.cd-t-template_html_2_new .cd-section.cd-before{margin-bottom:24px;}
.cd-t-template_html_2_new .cd-before .cd-prose{font-size:12.5px;line-height:1.6;}
.cd-t-template_html_2_new .cd-section-body>*:last-child,.cd-t-template_html_2_new .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_html_2_new .cd-closing{border-top:1px solid #E5E7EB;padding-top:16px;text-align:center;}
.cd-t-template_html_2_new .cd-closing-text{font-family:var(--font-body);font-size:12.5px;font-weight:500;color:#000;}
.cd-t-template_html_2_new .cd-sigs{border-top:1px solid #E5E7EB;padding-top:20px;}
.cd-t-template_html_2_new .cd-sig-img{height:60px;}
.cd-t-template_html_2_new .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html_2_new .cd-sig-line{border-top:2px solid var(--accent);width:200px;max-width:100%;margin-top:8px;}
.cd-t-template_html_2_new .cd-sig-label{color:var(--accent-ink);font-size:11px;letter-spacing:1px;}
.cd-t-template_html_2_new .cd-pay-btn{border-radius:8px;}
.cd-t-template_html_2_new .gl-footer{justify-content:center;gap:14px;color:var(--accent-ink);font-size:11px;font-weight:500;}
`,
};

// ---------------------------------------------------------------------------
// 4. Minimalist Premium (template_html_3): top accent bar, tinted info panel, solid table header
// ---------------------------------------------------------------------------
const MP_PAD = { top: 46, x: 56, bottom: 70 };
const minimalistPremium: ThemeDef = {
  id: 'template_html_3',
  pad: MP_PAD,
  noSignoff: true,
  header: ({ m }) => {
    // the original printed the document date in the header and the due date in the info panel
    const [first] = m.meta;
    return block('cd-hdr', `<div class="mp-bar"></div><div class="mp-row">
      <div class="mp-brand">${m.company.logoUrl ? `${logoImg(m)}${m.company.name ? `<div class="mp-co-sm">${m.company.name}</div>` : ''}` : (m.company.name ? `<div class="mp-co">${m.company.name}</div>` : '')}${companyLines(m, 'mp-lines')}</div>
      <div class="mp-doc">${titleH1(m)}${m.number ? `<div class="mp-no">${m.numberLabel} ${hashNo(m)}</div>` : ''}${first ? `<div class="mp-date"><div class="mp-dk">${first.label}</div><div class="mp-dv">${first.value}</div></div>` : ''}${statusBadge(m)}</div>
    </div>`);
  },
  parties: ({ m }) => {
    const rest = m.meta.slice(1);
    if (!m.parties.length && !rest.length) return '';
    const items = rest.map((i) => `<div class="mp-mi"><div class="cd-label">${i.label}</div><div class="mp-mv">${i.value}</div></div>`).join('');
    // without parties the details fill the panel from the left, side by side
    if (!m.parties.length) return block('cd-parties mp-panel mp-panel-meta', `<div class="mp-meta mp-meta-row">${items}</div>`);
    return block('cd-parties mp-panel', `<div class="mp-who">${partyHtml(m)}</div>${items ? `<div class="mp-meta">${items}</div>` : ''}`);
  },
  compose: (ctx, p) => defaultCompose(fitItems(ctx, p, bodyWidth(ctx, { pad: MP_PAD }), { th: 11.5, spacing: 1, td: 12.5, pad: 32, min: 64 })),
  footer: () => pagenoFooter('mp-footer'),
  css: () => `
.cd-t-template_html_3{--title-size:32px;color:#000;}
.cd-t-template_html_3 .mp-bar{height:8px;background:var(--accent);margin-bottom:32px;}
.cd-t-template_html_3 .cd-hdr{margin-bottom:36px;}
.cd-t-template_html_3 .mp-row{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
.cd-t-template_html_3 .mp-brand{flex:1 1 auto;min-width:0;max-width:56%;}
.cd-t-template_html_3 .cd-logo{max-height:60px;margin-bottom:18px;}
.cd-t-template_html_3 .mp-co{font-family:var(--font-head);font-size:28px;font-weight:800;letter-spacing:-.5px;line-height:1.15;margin-bottom:14px;overflow-wrap:anywhere;}
.cd-t-template_html_3 .mp-co-sm{font-size:13px;font-weight:700;margin-bottom:2px;}
.cd-t-template_html_3 .mp-lines{font-size:13px;line-height:1.6;font-weight:500;overflow-wrap:anywhere;}
.cd-t-template_html_3 .p1-web{color:var(--accent-ink);}
.cd-t-template_html_3 .mp-doc{flex:none;max-width:44%;text-align:right;}
.cd-t-template_html_3 .cd-title{font-weight:800;text-transform:uppercase;letter-spacing:-1px;line-height:1.3;margin-bottom:6px;}
.cd-t-template_html_3 .mp-no{font-size:15px;font-weight:500;margin-bottom:20px;}
.cd-t-template_html_3 .mp-dk{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#6B7280;}
.cd-t-template_html_3 .mp-dv{font-size:15px;font-weight:600;}
.cd-t-template_html_3 .mp-doc .cd-status{margin-top:10px;}
.cd-t-template_html_3 .mp-panel{display:flex;justify-content:space-between;gap:28px;background:#F9FAFB;border-radius:8px;padding:24px 25px;margin-bottom:32px;}
.cd-t-template_html_3 .mp-who{flex:1 1 auto;min-width:0;display:flex;gap:28px;}
.cd-t-template_html_3 .mp-who .cd-party{flex:1 1 0;min-width:0;}
.cd-t-template_html_3 .cd-label{color:var(--accent-ink);font-size:11px;font-weight:700;letter-spacing:1.5px;margin-bottom:10px;}
.cd-t-template_html_3 .cd-party-name{font-size:18px;font-weight:700;margin-bottom:5px;}
.cd-t-template_html_3 .cd-lines{font-size:14px;color:#000;line-height:1.5;}
.cd-t-template_html_3 .mp-meta{flex:none;max-width:42%;text-align:right;}
.cd-t-template_html_3 .mp-mi+.mp-mi{margin-top:14px;}
.cd-t-template_html_3 .mp-mi .cd-label{margin-bottom:6px;}
.cd-t-template_html_3 .mp-mv{font-size:16px;font-weight:600;overflow-wrap:anywhere;}
.cd-t-template_html_3 .mp-meta-row{flex:1 1 auto;max-width:none;text-align:left;display:flex;flex-wrap:wrap;gap:14px 56px;}
.cd-t-template_html_3 .mp-meta-row .mp-mi+.mp-mi{margin-top:0;}
.cd-t-template_html_3 .cd-facts{gap:14px;margin-bottom:26px;}
.cd-t-template_html_3 .cd-fact{background:#F9FAFB;border:0;border-top:3px solid var(--accent);border-radius:0 0 8px 8px;padding:14px 18px;}
.cd-t-template_html_3 .cd-fact-label{color:#6B7280;letter-spacing:1px;}
.cd-t-template_html_3 .cd-fact-value{color:#000;font-size:18px;font-weight:800;}
.cd-t-template_html_3 .cd-table{border-collapse:separate;border-spacing:0;}
.cd-t-template_html_3 .cd-table th{background:var(--accent);color:var(--on-accent);font-size:11.5px;letter-spacing:1px;padding:16px 15px;}
.cd-t-template_html_3 .cd-table th:first-child{border-top-left-radius:4px;}
.cd-t-template_html_3 .cd-table th:last-child{border-top-right-radius:4px;}
.cd-t-template_html_3 .cd-table td{padding:16px 15px;border-bottom:1px solid #E5E7EB;color:#000;font-size:12.5px;}
${tightCss('template_html_3')}
.cd-t-template_html_3 .cd-table td.cd-c-desc{font-weight:500;}
.cd-t-template_html_3 .cd-table td.cd-col-last{font-weight:700;}
.cd-t-template_html_3 .cd-items{margin-bottom:24px;}
.cd-t-template_html_3 .cd-summary{margin-bottom:26px;}
.cd-t-template_html_3 .cd-totals{flex:0 0 320px;}
.cd-t-template_html_3 .cd-tot{padding:0 0 12px;font-size:14px;font-weight:500;color:#000;}
.cd-t-template_html_3 .cd-tot-label{color:#000;}
.cd-t-template_html_3 .cd-tot-value{font-weight:500;}
.cd-t-template_html_3 .cd-tot-grand{margin-top:8px;padding:20px 0 0;border-top:2px solid var(--accent);border-radius:0;background:none;color:var(--accent-ink);align-items:center;font-size:28px;font-weight:800;}
.cd-t-template_html_3 .cd-tot-grand:first-child{margin-top:0;}
.cd-t-template_html_3 .cd-tot-grand .cd-tot-label{font-size:16px;font-weight:800;text-transform:uppercase;color:var(--accent-ink);}
.cd-t-template_html_3 .cd-tot-grand .cd-tot-value{font-weight:800;}
.cd-t-template_html_3 .cd-tot-muted{margin-top:14px;}
.cd-t-template_html_3 .cd-section:not(.cd-before):not(.cd-visuals){margin-top:8px;margin-bottom:22px;}
.cd-t-template_html_3 .cd-h{font-family:var(--font-body);color:var(--accent-ink);font-size:11px;font-weight:800;letter-spacing:1.5px;margin-bottom:12px;}
.cd-t-template_html_3 .cd-section:not(.cd-visuals) .cd-h+.cd-section-body{padding-top:10px;border-top:1px solid #E5E7EB;}
.cd-t-template_html_3 .cd-section:not(.cd-before):not(.cd-visuals) .cd-section-body{font-size:13.5px;line-height:1.8;}
.cd-t-template_html_3 .cd-section.cd-before{margin-bottom:24px;}
.cd-t-template_html_3 .cd-before .cd-prose{font-size:13px;line-height:1.6;}
.cd-t-template_html_3 .cd-section-body>*:last-child{margin-bottom:0;}
.cd-t-template_html_3 .cd-closing-text{font-family:var(--font-body);font-size:14px;}
.cd-t-template_html_3 .cd-sigs{margin-top:12px;}
.cd-t-template_html_3 .cd-sig-img{height:60px;}
.cd-t-template_html_3 .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html_3 .cd-sig-line{border-top:1px solid #d6d9de;width:200px;max-width:100%;margin-top:8px;}
.cd-t-template_html_3 .cd-sig-label{color:var(--accent-ink);font-size:10px;letter-spacing:1.5px;}
.cd-t-template_html_3 .cd-pay-btn{border-radius:4px;}
.cd-t-template_html_3 .mp-footer{justify-content:flex-end;}
`,
};

// ---------------------------------------------------------------------------
// 5. Gradient (template_html_4): slanted gradient header, shadowed content card overlapping it
// ---------------------------------------------------------------------------
type CardKey = 'parties' | 'subject' | 'intro' | 'facts' | 'tags';
const GB_PAD = { top: 48, x: 40, bottom: 70 };

const gradient: ThemeDef = {
  id: 'template_html_4',
  pad: GB_PAD,
  noSignoff: true,
  closingBlock: true,
  header: ({ m }) => {
    // as in the original: "address • phone" on one line, then the website in bold (e-mail on its own line)
    const contact = [m.company.addressLines.join(', '), m.company.phone].filter(Boolean).join('<span class="cd-dot">•</span>');
    return block('cd-hdr gb-band', `<div class="gb-row">
      <div class="gb-left">${m.company.name ? `<div class="gb-co">${m.company.name}</div>` : ''}${contact ? `<div class="gb-contact">${contact}</div>` : ''}${m.company.email ? `<div class="gb-contact">${m.company.email}</div>` : ''}${m.company.website ? `<div class="gb-web">${m.company.website}</div>` : ''}</div>
      <div class="gb-right">${m.company.logoUrl ? `<div class="gb-logo">${logoImg(m)}</div>` : ''}${titleH1(m)}${m.number ? `<div class="gb-pill"><span class="gb-pill-k">${m.numberLabel}</span><span class="gb-pill-v">${hashNo(m)}</span></div>` : ''}${statusBadge(m)}</div>
    </div><div class="gb-cut cd-deco"></div>`);
  },
  parties: ({ m }) => {
    if (!m.parties.length && !m.meta.length) return '';
    const items = m.meta.map((i) => `<div class="gb-mi">${i.label}: <strong>${i.value}</strong></div>`).join('');
    // without parties the details take the whole bar, side by side
    if (!m.parties.length) return block('cd-parties gb-info', `<div class="gb-meta gb-meta-solo"><div class="cd-label gb-meta-h">Details</div><div class="gb-mrow">${items}</div></div>`);
    return block('cd-parties gb-info', `<div class="gb-who">${partyHtml(m)}</div>${items ? `<div class="gb-meta"><div class="cd-label gb-meta-h">Details</div>${items}</div>` : ''}`);
  },
  compose: (ctx, base) => {
    const { m } = ctx;
    // the card is inset 12px on each side of the body, with a 1px border
    const p = fitItems(ctx, base, bodyWidth(ctx, { pad: GB_PAD }) - 26, { th: 11.5, spacing: 0.9, td: 12.5, pad: 32, min: 64 });
    // the "card": parties … summary rendered as joined pieces (each piece is still its own paginated block)
    const order: CardKey[] = ['subject', 'intro', 'facts', 'tags'];
    const pieces: Array<[string, string]> = [];
    if (p.parties) pieces.push([p.parties, '']);
    for (const k of order) if (p[k]) pieces.push([p[k], 'gb-pad']);
    for (const b of p.before) if (b) pieces.push([b, 'gb-pad']);
    // good/better/best options are several blocks (blocks.ts choicesBlocks): each one is a piece of the card
    if (p.items) for (const piece of p.items.split(/(?=<section class="cd-block )/).filter(Boolean)) pieces.push([piece, /cd-opts"|cd-opt-sum/.test(piece) ? 'gb-pad' : '']);
    if (p.summary) pieces.push([p.summary, '']);
    const card = pieces.map(([html, extra], i) => addClass(html, ['gb-card', extra, i === 0 ? 'gb-card-top' : '', i === pieces.length - 1 ? 'gb-card-end' : ''].filter(Boolean).join(' ')));
    const closing = m.closing ? block('cd-closing gb-closing', `<div class="gb-bar cd-deco"></div><div class="cd-closing-text">${m.closing}</div>`) : '';
    return [p.header, ...card, p.visuals, ...p.after, closing, p.signatures];
  },
  summary: ({ m }) => (hasSummary(m) ? block('cd-summary gb-summary', `<div class="cd-summary-side">${payButton(m)}${summaryNotes(m)}</div>${totalsHtml(m.totals)}`) : ''),
  footer: () => pagenoFooter('gb-footer'),
  css: ({ c }) => `
.cd-t-template_html_4{--title-size:28px;color:#000;}
.cd-t-template_html_4 .gb-band{position:relative;margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 0 calc(-1 * var(--pl));padding:48px calc(var(--px) + 10px) 92px calc(var(--pl) + 10px);background:linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%);color:var(--on-accent);}
.cd-t-template_html_4 .gb-cut{position:absolute;left:0;right:0;bottom:-1px;height:0;border-left:var(--page-w) solid transparent;border-bottom:36px solid var(--paper);}
.cd-t-template_html_4 .gb-row{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
.cd-t-template_html_4 .gb-left{flex:1 1 auto;min-width:0;}
.cd-t-template_html_4 .gb-co{font-family:var(--font-head);font-size:24px;font-weight:800;line-height:1.2;margin-bottom:8px;overflow-wrap:anywhere;}
.cd-t-template_html_4 .gb-contact{font-size:13px;line-height:1.5;opacity:.95;overflow-wrap:anywhere;}
.cd-t-template_html_4 .gb-web{font-size:13px;font-weight:600;margin-top:4px;overflow-wrap:anywhere;}
.cd-t-template_html_4 .gb-right{flex:none;max-width:50%;display:flex;flex-direction:column;align-items:flex-end;text-align:right;}
.cd-t-template_html_4 .gb-logo{margin-bottom:15px;}
.cd-t-template_html_4 .gb-logo .cd-logo{max-height:60px;max-width:220px;${logoFilter(c.onAccent)}}
.cd-t-template_html_4 .cd-title{color:var(--on-accent);font-weight:800;text-transform:uppercase;letter-spacing:1px;line-height:1.15;margin-bottom:10px;}
.cd-t-template_html_4 .gb-pill{display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:6px;background:rgba(255,255,255,.25);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.4);}
.cd-t-template_html_4 .gb-pill-k{font-size:11px;font-weight:700;opacity:.9;}
.cd-t-template_html_4 .gb-pill-v{font-size:14px;font-weight:700;}
.cd-t-template_html_4 .gb-band .cd-status{background:#ffffff;border-color:#ffffff;}
.cd-t-template_html_4 .gb-card{position:relative;margin:0 12px;background:#ffffff;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;clip-path:inset(0 -70px);}
.cd-t-template_html_4 .gb-card::before{content:'';position:absolute;left:0;right:0;top:-90px;bottom:-90px;z-index:-1;pointer-events:none;box-shadow:0 15px 40px rgba(0,0,0,.08);}
.cd-t-template_html_4 .gb-card-top{margin-top:-52px;border-top:1px solid #E5E7EB;border-radius:12px 12px 0 0;clip-path:inset(-70px -70px 0 -70px);}
.cd-t-template_html_4 .gb-card-top::before{top:0;border-radius:12px 12px 0 0;}
.cd-t-template_html_4 .gb-card-end{margin-bottom:28px;border-bottom:1px solid #E5E7EB;border-radius:0 0 12px 12px;clip-path:inset(0 -70px -80px -70px);}
.cd-t-template_html_4 .gb-card-end::before{bottom:0;border-radius:0 0 12px 12px;}
.cd-t-template_html_4 .gb-card-top.gb-card-end{border-radius:12px;clip-path:none;}
.cd-t-template_html_4 .gb-card-top.gb-card-end::before{border-radius:12px;}
.cd-t-template_html_4 .gb-card-end .cd-table tbody tr:last-child td{border-bottom:0;}
.cd-t-template_html_4 .gb-card-end .cd-table tbody tr:last-child td:first-child{border-bottom-left-radius:11px;}
.cd-t-template_html_4 .gb-card-end .cd-table tbody tr:last-child td:last-child{border-bottom-right-radius:11px;}
.cd-t-template_html_4 .gb-pad{padding:24px 40px 12px;}
.cd-t-template_html_4 .gb-pad+.gb-pad{padding-top:6px;}
.cd-t-template_html_4 .gb-pad.gb-card-end{padding-bottom:28px;}
.cd-t-template_html_4 .gb-pad .cd-section-body>*:last-child{margin-bottom:0;}
.cd-t-template_html_4 .gb-info.gb-card{display:flex;justify-content:space-between;gap:28px;padding:32px 40px;border-bottom:1px solid #E5E7EB;}
.cd-t-template_html_4 .gb-who{flex:1 1 auto;min-width:0;display:flex;gap:28px;}
.cd-t-template_html_4 .gb-who .cd-party{flex:1 1 0;min-width:0;}
.cd-t-template_html_4 .cd-label{color:var(--accent-ink);font-size:11px;font-weight:800;letter-spacing:1px;margin-bottom:10px;}
.cd-t-template_html_4 .cd-party-name{font-size:18px;font-weight:700;margin-bottom:6px;}
.cd-t-template_html_4 .cd-lines{font-size:14px;color:#000;}
.cd-t-template_html_4 .gb-meta{flex:none;max-width:46%;text-align:right;font-size:14px;line-height:1.75;}
.cd-t-template_html_4 .gb-meta-h{color:var(--secondary-ink);}
.cd-t-template_html_4 .gb-mi{overflow-wrap:anywhere;}
.cd-t-template_html_4 .gb-meta-solo{flex:1 1 auto;max-width:none;text-align:left;}
.cd-t-template_html_4 .gb-mrow{display:flex;flex-wrap:wrap;gap:2px 36px;}
.cd-t-template_html_4 .cd-items.gb-card{margin-bottom:0;}
.cd-t-template_html_4 .cd-table{border-collapse:separate;border-spacing:0;}
.cd-t-template_html_4 .cd-table th{background:#ffffff;color:#000;font-size:11.5px;font-weight:800;padding:16px 15px;border-bottom:2px solid #000;}
.cd-t-template_html_4 .cd-table th:first-child,.cd-t-template_html_4 .cd-table td:first-child{padding-left:20px;}
.cd-t-template_html_4 .cd-opt.gb-card{padding-top:22px;}
.cd-t-template_html_4 .cd-opt .cd-opt-head,.cd-t-template_html_4 .cd-opt .cd-opt-desc{margin-left:20px;margin-right:20px;}
.cd-t-template_html_4 .cd-table th:last-child,.cd-t-template_html_4 .cd-table td:last-child{padding-right:20px;}
.cd-t-template_html_4 .cd-table td{padding:16px 15px;border-bottom:1px solid #E5E7EB;color:#6B7280;font-size:12.5px;}
${tightCss('template_html_4')}
.cd-t-template_html_4 .cd-table tbody tr:nth-child(odd) td{background:#FAFAFA;}
.cd-t-template_html_4 .cd-table td.cd-c-desc{color:#111827;font-weight:500;}
.cd-t-template_html_4 .cd-table td.cd-col-last{color:#111827;font-weight:700;}
.cd-t-template_html_4 .gb-summary.gb-card{padding:28px 36px 28px 40px;background:#FAFAFA;border-top:1px solid #000;}
.cd-t-template_html_4 .cd-totals{flex:0 0 280px;}
.cd-t-template_html_4 .gb-summary{gap:28px;}
.cd-t-template_html_4 .cd-tot{padding:0 0 10px;font-size:14px;color:#000;}
.cd-t-template_html_4 .cd-tot-label{color:#000;font-weight:500;}
.cd-t-template_html_4 .cd-tot-value{font-weight:700;}
.cd-t-template_html_4 .cd-tot-grand{margin-top:10px;padding:15px 0 0;border-top:2px solid var(--accent);border-radius:0;background:none;color:#000;align-items:center;font-size:24px;font-weight:900;}
.cd-t-template_html_4 .cd-tot-grand:first-child{margin-top:0;}
.cd-t-template_html_4 .cd-tot-grand .cd-tot-label{color:var(--accent-ink);font-size:14px;font-weight:800;text-transform:uppercase;}
.cd-t-template_html_4 .cd-tot-grand .cd-tot-value{font-weight:900;}
.cd-t-template_html_4 .cd-tot-muted{margin-top:12px;}
.cd-t-template_html_4 .cd-fact{background:#FAFAFA;border-color:#E5E7EB;border-radius:10px;padding:12px 16px;}
.cd-t-template_html_4 .cd-fact-label{color:var(--accent-ink);}
.cd-t-template_html_4 .cd-fact-value{color:#000;}
.cd-t-template_html_4 .cd-section:not(.cd-before):not(.cd-visuals){padding:0 10px;}
.cd-t-template_html_4 .cd-h{font-family:var(--font-body);color:#000;font-size:11px;font-weight:800;letter-spacing:1px;margin-bottom:8px;}
.cd-t-template_html_4 .gb-card .cd-h{color:var(--accent-ink);}
.cd-t-template_html_4 .cd-section:not(.cd-before) .cd-prose{font-size:13px;line-height:1.6;}
.cd-t-template_html_4 .cd-before .cd-prose{font-size:12.5px;line-height:1.6;}
.cd-t-template_html_4 .gb-closing{text-align:center;margin-top:12px;margin-bottom:24px;}
.cd-t-template_html_4 .gb-bar{height:4px;width:60px;border-radius:4px;margin:0 auto 15px;background:linear-gradient(90deg, var(--accent) 0%, var(--secondary) 100%);}
.cd-t-template_html_4 .gb-closing .cd-closing-text{font-family:var(--font-body);font-size:12px;font-weight:400;color:#000;opacity:.7;}
.cd-t-template_html_4 .cd-sigs{padding:0 10px;}
.cd-t-template_html_4 .cd-sig-img{height:60px;}
.cd-t-template_html_4 .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html_4 .cd-sig-line{border-top:2px solid var(--accent);width:200px;max-width:100%;margin-top:8px;}
.cd-t-template_html_4 .cd-sig-label{color:var(--accent-ink);font-size:11px;letter-spacing:1px;}
.cd-t-template_html_4 .cd-pay-btn{border-radius:8px;background:linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%);}
.cd-t-template_html_4 .gb-footer{justify-content:center;}
`,
};

// ---------------------------------------------------------------------------
export const DESIGNS: DesignDef[] = [
  {
    meta: premium({ id: 'template_html', name: 'Modern Single', description: 'The original clean single-column layout: big uppercase title, accent rule and quiet gray labels.', accent: '#000000', secondary: '#666666', paper: '#ffffff', headFont: 'helvetica', bodyFont: 'helvetica', tags: ['modern', 'clean', 'single', 'original'] }),
    theme: modernSingle,
  },
  {
    meta: premium({ id: 'template_html_2', name: 'High End', description: 'The original split layout: a dark full-height side column with your details and a huge title.', accent: '#2c3e50', secondary: '#1a1a1a', paper: '#ffffff', headFont: 'helvetica', bodyFont: 'helvetica', tags: ['high end', 'split', 'dark', 'original'] }),
    theme: highEnd,
  },
  {
    meta: premium({ id: 'template_html_2_new', name: 'Glassmorphism', description: 'The original gradient header with glass circles, soft rounded cards and a solid table header.', accent: '#2563eb', secondary: '#60a5fa', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['glass', 'gradient', 'modern', 'original'] }),
    theme: glassmorphism,
  },
  {
    meta: premium({ id: 'template_html_3', name: 'Minimalist Premium', description: 'The original agency-style minimal design: a top accent bar, tinted info panel and bold totals.', accent: '#1a1a1a', secondary: '#6b7280', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['minimal', 'premium', 'agency', 'original'] }),
    theme: minimalistPremium,
  },
  {
    meta: premium({ id: 'template_html_4', name: 'Gradient', description: 'The original slanted gradient header with a content card that overlaps it.', accent: '#4f46e5', secondary: '#7c3aed', paper: '#ffffff', headFont: 'outfit', bodyFont: 'outfit', tags: ['gradient', 'vibrant', 'card', 'original'] }),
    theme: gradient,
  },
];
