/**
 * Design module "premium1": the first five original Premium designs (pre-2026-11 `documentHtmlTemplates.ts`),
 * restored under their original ids and ported to the shared engine:
 *
 *   template_html        Modern Single       - clean single column, accent rule under the header
 *   template_html_2      High End            - dark full-height left column, huge title
 *   template_html_2_new  Glassmorphism       - gradient header band with glass circles, soft cards
 *   template_html_3      Minimalist Premium  - top accent bar, tinted info panel, solid table header
 *   template_html_4      Gradient            - slanted gradient header with an overlapping content card
 *
 * Differences from the originals (on purpose): labels/titles come from the document model (no hardcoded
 * "INVOICE"/"Bill To"), money is formatted, table headers on accent fills use a readable text color, and
 * effects html2canvas cannot draw (backdrop blur, clip-path, logo color inversion) are approximated.
 */
import type { DocModel, Section } from '../model.ts';
import type { TemplateMeta } from '../registry.ts';
import {
  block, defaultCompose, hasSummary, lines, logoImg, metaList, payButton, statusBadge, summaryNotes, titleH1, totalsHtml,
  type DesignDef, type ThemeDef,
} from '../blocks.ts';
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

const pagenoFooter = (cls: string, text = '') => `<div class="cd-footer ${cls}"><div class="cd-footer-text">${text}</div><div class="cd-pageno"></div></div>`;

// ---------------------------------------------------------------------------
// 1. Modern Single (template_html)
// ---------------------------------------------------------------------------
const modernSingle: ThemeDef = {
  id: 'template_html',
  pad: { top: 46, x: 52, bottom: 72, footer: 26 },
  noSignoff: true,
  header: ({ m }) => block('cd-hdr', `
    <div class="ms-brand">${m.company.logoUrl ? `${logoImg(m)}${m.company.name ? `<div class="ms-co-sm">${m.company.name}</div>` : ''}` : (m.company.name ? `<div class="ms-co">${m.company.name}</div>` : '')}${companyLines(m, 'ms-lines')}</div>
    <div class="ms-doc">${titleH1(m)}<div class="ms-ids">${m.number ? `<div><span class="ms-k">${m.numberLabel}</span> <span class="ms-v">${m.number}</span></div>` : ''}${m.meta.map((i) => `<div><span class="ms-k">${i.label}</span> <span class="ms-v">${i.value}</span></div>`).join('')}</div>${statusBadge(m)}</div>`),
  parties: ({ m }) => (m.parties.length ? block('cd-parties ms-parties', partyHtml(m)) : ''),
  footer: ({ m }) => pagenoFooter('ms-footer', `Authorized Document${m.company.name ? `<span class="cd-dot">•</span>${m.company.name}` : ''}`),
  css: () => `
.cd-t-template_html{--title-size:42px;color:#333;}
.cd-t-template_html .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;padding-bottom:20px;border-bottom:2px solid var(--accent);margin-bottom:30px;}
.cd-t-template_html .ms-brand{flex:1 1 auto;min-width:0;max-width:54%;}
.cd-t-template_html .cd-logo{max-height:80px;max-width:200px;margin-bottom:12px;}
.cd-t-template_html .ms-co{font-family:var(--font-head);font-size:28px;font-weight:700;line-height:1.15;color:var(--accent-ink);margin-bottom:6px;overflow-wrap:anywhere;}
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
.cd-t-template_html .cd-table th{color:#999;font-size:11px;letter-spacing:.5px;padding:10px 8px;border-bottom:2px solid #eee;}
.cd-t-template_html .cd-table td{padding:12px 8px;border-bottom:1px solid #eee;color:#555;font-size:13px;}
.cd-t-template_html .cd-table th:first-child,.cd-t-template_html .cd-table td:first-child{padding-left:0;}
.cd-t-template_html .cd-table th:last-child,.cd-t-template_html .cd-table td:last-child{padding-right:0;}
.cd-t-template_html .cd-table td.cd-c-desc{color:#333;font-size:14px;font-weight:600;}
.cd-t-template_html .cd-table td.cd-col-last{color:#333;font-weight:600;}
.cd-t-template_html .cd-summary{margin-bottom:24px;}
.cd-t-template_html .cd-totals{flex:0 0 250px;}
.cd-t-template_html .cd-tot{padding:0 0 8px;font-size:13px;color:#666;}
.cd-t-template_html .cd-tot-label{color:#666;}
.cd-t-template_html .cd-tot-value{font-weight:400;}
.cd-t-template_html .cd-tot-grand{margin-top:7px;padding:15px 0 0;border-top:2px solid #eee;border-radius:0;background:none;color:var(--accent-ink);font-size:18px;font-weight:700;}
.cd-t-template_html .cd-tot-grand .cd-tot-label{color:inherit;}
.cd-t-template_html .cd-tot-grand .cd-tot-value{font-weight:700;}
.cd-t-template_html .cd-tot-balance{padding-top:8px;color:#333;}
.cd-t-template_html .cd-tot-balance .cd-tot-value{font-weight:800;}
.cd-t-template_html .cd-section:not(.cd-before):not(.cd-visuals){background:#f9f9f9;border-radius:8px;padding:18px 20px 8px;}
.cd-t-template_html .cd-section-body>*:last-child,.cd-t-template_html .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_html .cd-h{color:#999;font-family:var(--font-body);font-size:11px;font-weight:700;letter-spacing:.04em;}
.cd-t-template_html .cd-section:not(.cd-before) .cd-prose{font-size:13px;color:#555;}
.cd-t-template_html .cd-sigs{margin-top:16px;}
.cd-t-template_html .cd-sig{max-width:240px;}
.cd-t-template_html .cd-sig-img{height:60px;}
.cd-t-template_html .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html .cd-sig-line{border-top:2px solid var(--accent);width:200px;margin-top:8px;}
.cd-t-template_html .cd-sig-label{color:#999;font-size:11px;font-weight:400;letter-spacing:.5px;}
.cd-t-template_html .cd-pay-btn{border-radius:6px;}
.cd-t-template_html .ms-footer{justify-content:center;gap:14px;border-top:1px dashed #e4e4e4;padding-top:10px;color:#b8b8b8;font-size:11px;}
`,
};

// ---------------------------------------------------------------------------
// 2. High End (template_html_2): dark full-height left column (page chrome), big title on the right
// ---------------------------------------------------------------------------
const highEnd: ThemeDef = {
  id: 'template_html_2',
  // the left column is 35% of the page width (286px on Letter, 278px on A4); body starts 50px to its right
  pad: { top: 58, x: 46, left: 332, bottom: 66 },
  noSignoff: true,
  header: ({ m }) => {
    const key = m.keyDate?.value;
    const dates = m.meta.map((i) => `<div class="he-d${key && i.value === key ? ' he-key' : ''}"><div class="he-dk">${i.label}</div><div class="he-dv">${i.value}</div></div>`).join('');
    return block('cd-hdr', `<div class="he-titlebox">${titleH1(m)}${m.number ? `<div class="he-no">${m.numberLabel} <span class="he-no-v">#${m.number}</span></div>` : ''}${statusBadge(m)}</div>${dates ? `<div class="he-dates">${dates}</div>` : ''}`);
  },
  parties: () => '',
  chrome: ({ m }) => {
    const brand = m.company.logoUrl
      ? `<div class="he-logo">${logoImg(m)}</div>`
      : (m.company.name ? `<div class="he-co-big">${m.company.name}</div>` : '');
    const from = m.company.name || m.company.lines.length
      ? `<div class="he-sec"><div class="he-k">From</div>${m.company.name ? `<div class="he-from-name">${m.company.name}</div>` : ''}${companyLines(m, 'he-lines')}</div>`
      : '';
    const parties = m.parties.map((p) => `<div class="he-sec"><div class="he-k">${p.label}</div>${p.name ? `<div class="he-pname">${p.name}</div>` : ''}${lines(p.lines, 'he-lines')}</div>`).join('');
    return `<div class="he-side"></div><div class="he-side-in">${brand ? `<div class="he-brand">${brand}</div>` : ''}<div class="cd-first-only">${from}${parties}</div></div>`;
  },
  footer: ({ m }) => pagenoFooter('he-footer', `${m.company.name ? `${m.company.name} • ` : ''}Generated Document`),
  css: () => `
.cd-t-template_html_2{--title-size:60px;--side:calc(var(--page-w) * .35);color:#333;}
.cd-t-template_html_2 .he-side{position:absolute;left:0;top:0;bottom:0;width:var(--side);background:var(--secondary);}
.cd-t-template_html_2 .he-side-in{position:absolute;left:0;top:0;width:var(--side);padding:58px 38px 0 40px;color:var(--on-secondary);}
.cd-t-template_html_2 .he-brand{margin-bottom:54px;}
.cd-t-template_html_2 .he-logo{display:inline-block;background:#ffffff;border-radius:8px;padding:10px 12px;max-width:100%;}
.cd-t-template_html_2 .he-logo .cd-logo{max-height:76px;max-width:100%;}
.cd-t-template_html_2 .he-co-big{font-family:var(--font-head);font-size:28px;font-weight:800;letter-spacing:-.5px;line-height:1.1;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-sec{margin-bottom:46px;}
.cd-t-template_html_2 .he-k{text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:2px;opacity:.55;margin-bottom:12px;}
.cd-t-template_html_2 .he-from-name{font-weight:600;font-size:15px;margin-bottom:4px;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-pname{font-size:20px;font-weight:700;line-height:1.25;margin-bottom:6px;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-lines{font-size:13px;line-height:1.75;opacity:.88;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-footer{left:40px;right:auto;width:calc(var(--side) - 78px);bottom:26px;flex-direction:column;align-items:flex-start;gap:2px;color:var(--on-secondary);opacity:.45;font-size:9.5px;}
.cd-t-template_html_2 .he-footer .cd-footer-text{max-width:100%;}
.cd-t-template_html_2 .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:36px;}
.cd-t-template_html_2 .he-titlebox{flex:1 1 0;min-width:min-content;}
.cd-t-template_html_2 .cd-title{font-weight:900;letter-spacing:-3px;line-height:.9;text-transform:uppercase;}
.cd-t-template_html_2 .cd-title.cd-len-l{letter-spacing:-2px;}
.cd-t-template_html_2 .he-no{font-size:13px;font-weight:500;color:#999;margin-top:15px;letter-spacing:.5px;}
.cd-t-template_html_2 .he-no-v{font-size:16px;letter-spacing:1px;}
.cd-t-template_html_2 .he-dates{flex:0 1 auto;max-width:160px;min-width:92px;text-align:right;padding-top:6px;}
.cd-t-template_html_2 .he-d+.he-d{margin-top:11px;}
.cd-t-template_html_2 .he-dk{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#999;margin-bottom:3px;}
.cd-t-template_html_2 .he-dv{font-size:15.5px;font-weight:600;color:#333;overflow-wrap:anywhere;}
.cd-t-template_html_2 .he-key .he-dv{color:var(--accent-ink);}
.cd-t-template_html_2 .cd-table th{color:#999;font-size:10.5px;letter-spacing:1px;padding:14px 9px;border-bottom:2px solid var(--accent);}
.cd-t-template_html_2 .cd-table td{padding:12px 9px;border-bottom:1px solid #f0f0f0;color:#666;font-size:12.5px;}
.cd-t-template_html_2 .cd-table tbody tr:nth-child(odd) td{background:#fafafa;}
.cd-t-template_html_2 .cd-table td.cd-c-desc{color:#333;font-weight:500;}
.cd-t-template_html_2 .cd-table td.cd-col-last{color:#333;font-weight:700;}
.cd-t-template_html_2 .cd-items{margin-bottom:24px;}
.cd-t-template_html_2 .cd-summary{flex-direction:column;align-items:flex-end;gap:14px;}
.cd-t-template_html_2 .cd-totals{order:-1;flex:none;width:320px;max-width:100%;}
.cd-t-template_html_2 .cd-summary-side{align-self:stretch;}
.cd-t-template_html_2 .cd-tot{padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14.5px;color:#666;}
.cd-t-template_html_2 .cd-tot-label{color:#666;}
.cd-t-template_html_2 .cd-tot-grand{margin:0;padding:16px 0;border:0;border-radius:0;background:none;color:var(--accent-ink);font-size:28px;font-weight:800;align-items:baseline;flex-wrap:wrap;gap:4px 16px;}
.cd-t-template_html_2 .cd-tot-grand .cd-tot-label{color:inherit;font-size:20px;line-height:1.2;}
.cd-t-template_html_2 .cd-tot-grand .cd-tot-value{margin-left:auto;}
.cd-t-template_html_2 .cd-tot-balance{border-top:2px solid var(--accent);border-bottom:0;padding-top:12px;color:#333;font-size:16px;}
.cd-t-template_html_2 .cd-section:not(.cd-before):not(.cd-visuals){margin-top:10px;padding:22px 26px 8px;background:#f8f9fa;border-left:5px solid var(--accent);border-radius:6px;}
.cd-t-template_html_2 .cd-section-body>*:last-child,.cd-t-template_html_2 .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_html_2 .cd-h{color:#999;font-family:var(--font-body);font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:12px;}
.cd-t-template_html_2 .cd-section:not(.cd-before) .cd-prose{font-size:13.5px;line-height:1.8;color:#555;}
.cd-t-template_html_2 .cd-sigs{gap:28px;margin-top:12px;}
.cd-t-template_html_2 .cd-sig{flex:1 1 180px;max-width:220px;}
.cd-t-template_html_2 .cd-sig-img{height:60px;}
.cd-t-template_html_2 .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html_2 .cd-sig-line{border-top:2px solid var(--accent);width:200px;max-width:100%;margin-top:8px;}
.cd-t-template_html_2 .cd-sig-label{color:#666;font-size:10px;font-weight:400;letter-spacing:1px;}
.cd-t-template_html_2 .cd-parties{gap:20px;}
`,
};

// ---------------------------------------------------------------------------
// 3. Glassmorphism (template_html_2_new): gradient band with glass circles, soft cards
// ---------------------------------------------------------------------------
const glassmorphism: ThemeDef = {
  id: 'template_html_2_new',
  pad: { top: 40, x: 52, bottom: 70, footer: 28 },
  noSignoff: true,
  closingBlock: true,
  header: ({ m }) => block('cd-hdr gl-band', `
    <div class="gl-c1"></div><div class="gl-c2"></div>
    <div class="gl-row">
      <div class="gl-left">${m.company.logoUrl ? `<div class="gl-logo">${logoImg(m)}</div>` : ''}${titleH1(m)}${m.number ? `<div class="gl-no">${m.numberLabel} ${m.number}</div>` : ''}${m.keyDate ? `<div class="gl-date">${m.keyDate.label} · ${m.keyDate.value}</div>` : ''}${statusBadge(m)}</div>
      <div class="gl-right">${m.company.name ? `<div class="gl-co">${m.company.name}</div>` : ''}${companyLines(m, 'gl-lines', { website: false })}</div>
    </div>`),
  parties: ({ m }) => {
    const cards = [
      ...m.parties.map((p) => `<div class="gl-card"><div class="cd-label">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      m.meta.length ? `<div class="gl-card gl-card-meta"><div class="cd-label">Details</div>${metaList(m)}</div>` : '',
    ].join('');
    return cards ? block('cd-parties gl-cards', cards) : '';
  },
  compose: (ctx, p) => {
    const { m } = ctx;
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
.cd-t-template_html_2_new .gl-band{position:relative;overflow:hidden;margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 28px calc(-1 * var(--pl));padding:38px var(--px) 34px var(--pl);background:linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%);color:var(--on-accent);}
.cd-t-template_html_2_new .gl-c1,.cd-t-template_html_2_new .gl-c2{position:absolute;border-radius:50%;background:radial-gradient(circle at 50% 50%, rgba(255,255,255,.13) 0%, rgba(255,255,255,.11) 66%, rgba(255,255,255,.05) 70.5%, rgba(255,255,255,0) 71%);}
.cd-t-template_html_2_new .gl-c1{top:-70px;right:-70px;width:340px;height:340px;}
.cd-t-template_html_2_new .gl-c2{bottom:-45px;left:30px;width:180px;height:180px;}
.cd-t-template_html_2_new .gl-row{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
.cd-t-template_html_2_new .gl-left{flex:1 1 auto;min-width:0;}
.cd-t-template_html_2_new .gl-logo{display:inline-block;background:rgba(255,255,255,.9);border-radius:8px;padding:6px 10px;margin-bottom:16px;}
.cd-t-template_html_2_new .gl-logo .cd-logo{max-height:68px;max-width:220px;}
.cd-t-template_html_2_new .cd-title{color:var(--on-accent);font-weight:800;letter-spacing:-1px;text-transform:uppercase;line-height:1.05;}
.cd-t-template_html_2_new .gl-no{margin-top:8px;font-size:16px;font-weight:600;opacity:.95;}
.cd-t-template_html_2_new .gl-date{margin-top:2px;font-size:13.5px;opacity:.9;}
.cd-t-template_html_2_new .gl-band .cd-status{background:#ffffff;border-color:#ffffff;margin-top:12px;}
.cd-t-template_html_2_new .gl-right{flex:none;max-width:46%;text-align:right;margin-top:8px;}
.cd-t-template_html_2_new .gl-co{font-family:var(--font-head);font-size:24px;font-weight:800;line-height:1.2;margin-bottom:8px;overflow-wrap:anywhere;}
.cd-t-template_html_2_new .gl-lines{font-size:13px;line-height:1.6;opacity:.95;overflow-wrap:anywhere;}
.cd-t-template_html_2_new .gl-cards{gap:20px;margin-bottom:26px;align-items:stretch;}
.cd-t-template_html_2_new .gl-card{flex:1 1 0;min-width:0;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:20px;}
.cd-t-template_html_2_new .cd-label{color:var(--accent-ink);font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:12px;}
.cd-t-template_html_2_new .cd-party-name{font-size:16px;font-weight:700;color:#000;margin-bottom:4px;}
.cd-t-template_html_2_new .gl-card .cd-lines{font-size:13.5px;color:#000;line-height:1.55;}
.cd-t-template_html_2_new .cd-meta-row{border-bottom:1px dashed #E5E7EB;padding:4px 0 5px;margin-bottom:4px;font-size:13px;}
.cd-t-template_html_2_new .cd-meta-row:last-child{border-bottom:0;margin-bottom:0;}
.cd-t-template_html_2_new .cd-meta-row dt{color:#000;}
.cd-t-template_html_2_new .cd-table{border-collapse:separate;border-spacing:0;}
.cd-t-template_html_2_new .cd-table th{background:var(--accent);color:var(--on-accent);font-size:11.5px;padding:14px 14px;}
.cd-t-template_html_2_new .cd-table th:first-child{border-top-left-radius:8px;}
.cd-t-template_html_2_new .cd-table th:last-child{border-top-right-radius:8px;}
.cd-t-template_html_2_new .cd-table td{padding:13px 14px;border-bottom:1px solid rgba(0,0,0,.1);color:#000;font-size:12.5px;}
.cd-t-template_html_2_new .cd-table td.cd-c-desc{font-weight:500;}
.cd-t-template_html_2_new .cd-table td.cd-col-last{font-weight:600;}
.cd-t-template_html_2_new .cd-summary{margin-top:10px;gap:40px;}
.cd-t-template_html_2_new .cd-summary-side{padding-right:20px;}
.cd-t-template_html_2_new .gl-note{font-size:12px;line-height:1.6;}
.cd-t-template_html_2_new .gl-note+.gl-note{margin-top:18px;}
.cd-t-template_html_2_new .gl-note-notes{background:#F9FAFB;border-left:4px solid var(--accent);border-radius:4px;padding:15px;}
.cd-t-template_html_2_new .gl-note .cd-prose{font-size:12.5px;line-height:1.6;color:#000;}
.cd-t-template_html_2_new .gl-note-notes .cd-h,.cd-t-template_html_2_new .cd-sec-notes .cd-h{color:var(--accent-ink);}
.cd-t-template_html_2_new .cd-h{font-family:var(--font-body);color:#000;font-size:11px;font-weight:700;letter-spacing:.06em;margin-bottom:6px;}
.cd-t-template_html_2_new .cd-totals{flex:0 0 280px;}
.cd-t-template_html_2_new .cd-tot{padding:0 0 10px;font-size:14px;color:#000;}
.cd-t-template_html_2_new .cd-tot-label{color:#000;}
.cd-t-template_html_2_new .cd-tot-grand{margin-top:5px;padding:15px 0 0;border-top:1px solid #E5E7EB;border-radius:0;background:none;color:var(--accent-ink);align-items:center;font-size:24px;font-weight:800;}
.cd-t-template_html_2_new .cd-tot-grand .cd-tot-label{font-size:16px;font-weight:700;color:var(--accent-ink);}
.cd-t-template_html_2_new .cd-tot-muted{margin-top:10px;}
.cd-t-template_html_2_new .cd-section:not(.cd-before):not(.cd-visuals) .cd-prose{font-size:12.5px;color:#000;}
.cd-t-template_html_2_new .cd-sec-notes:not(.cd-before){background:#F9FAFB;border-left:4px solid var(--accent);border-radius:4px;padding:15px 15px 8px;}
.cd-t-template_html_2_new .cd-section-body>*:last-child,.cd-t-template_html_2_new .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_html_2_new .cd-closing{border-top:1px solid #E5E7EB;padding-top:18px;text-align:center;}
.cd-t-template_html_2_new .cd-closing-text{font-family:var(--font-body);font-size:12.5px;font-weight:500;color:#000;}
.cd-t-template_html_2_new .cd-sigs{border-top:1px solid #E5E7EB;padding-top:26px;}
.cd-t-template_html_2_new .cd-sig-img{height:60px;}
.cd-t-template_html_2_new .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html_2_new .cd-sig-line{border-top:2px solid var(--accent);width:200px;max-width:100%;margin-top:8px;}
.cd-t-template_html_2_new .cd-sig-label{color:var(--accent-ink);font-size:11px;letter-spacing:1px;}
.cd-t-template_html_2_new .cd-pay-btn{border-radius:8px;}
.cd-t-template_html_2_new .cd-fact{background:#F9FAFB;border-color:#E5E7EB;border-radius:12px;}
.cd-t-template_html_2_new .gl-footer{justify-content:center;gap:14px;color:var(--accent-ink);font-size:11px;font-weight:500;}
`,
};

// ---------------------------------------------------------------------------
// 4. Minimalist Premium (template_html_3): top accent bar, tinted info panel, solid table header
// ---------------------------------------------------------------------------
const minimalistPremium: ThemeDef = {
  id: 'template_html_3',
  pad: { top: 46, x: 56, bottom: 70 },
  noSignoff: true,
  header: ({ m }) => {
    // the original printed the document date in the header and the due date in the info panel
    const [first] = m.meta;
    return block('cd-hdr', `<div class="mp-bar"></div><div class="mp-row">
      <div class="mp-brand">${m.company.logoUrl ? `${logoImg(m)}${m.company.name ? `<div class="mp-co-sm">${m.company.name}</div>` : ''}` : (m.company.name ? `<div class="mp-co">${m.company.name}</div>` : '')}${companyLines(m, 'mp-lines')}</div>
      <div class="mp-doc">${titleH1(m)}${m.number ? `<div class="mp-no">${m.numberLabel} ${m.number}</div>` : ''}${first ? `<div class="mp-date"><div class="mp-dk">${first.label}</div><div class="mp-dv">${first.value}</div></div>` : ''}${statusBadge(m)}</div>
    </div>`);
  },
  parties: ({ m }) => {
    const rest = m.meta.slice(1);
    if (!m.parties.length && !rest.length) return '';
    return block('cd-parties mp-panel', `<div class="mp-who">${partyHtml(m)}</div>${rest.length ? `<div class="mp-meta">${rest.map((i) => `<div class="mp-mi"><div class="cd-label">${i.label}</div><div class="mp-mv">${i.value}</div></div>`).join('')}</div>` : ''}`);
  },
  footer: () => pagenoFooter('mp-footer'),
  css: () => `
.cd-t-template_html_3{--title-size:32px;color:#000;}
.cd-t-template_html_3 .mp-bar{height:8px;background:var(--accent);margin-bottom:30px;}
.cd-t-template_html_3 .cd-hdr{margin-bottom:34px;}
.cd-t-template_html_3 .mp-row{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
.cd-t-template_html_3 .mp-brand{flex:1 1 auto;min-width:0;max-width:56%;}
.cd-t-template_html_3 .cd-logo{max-height:60px;margin-bottom:16px;}
.cd-t-template_html_3 .mp-co{font-family:var(--font-head);font-size:28px;font-weight:800;letter-spacing:-.5px;line-height:1.15;margin-bottom:12px;overflow-wrap:anywhere;}
.cd-t-template_html_3 .mp-co-sm{font-size:13px;font-weight:700;margin-bottom:2px;}
.cd-t-template_html_3 .mp-lines{font-size:13px;line-height:1.6;font-weight:500;overflow-wrap:anywhere;}
.cd-t-template_html_3 .p1-web{color:var(--accent-ink);}
.cd-t-template_html_3 .mp-doc{flex:none;max-width:44%;text-align:right;}
.cd-t-template_html_3 .cd-title{font-weight:800;text-transform:uppercase;letter-spacing:-1px;margin-bottom:6px;}
.cd-t-template_html_3 .mp-no{font-size:15px;font-weight:500;margin-bottom:18px;}
.cd-t-template_html_3 .mp-dk{font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#6B7280;}
.cd-t-template_html_3 .mp-dv{font-size:15px;font-weight:600;}
.cd-t-template_html_3 .mp-doc .cd-status{margin-top:10px;}
.cd-t-template_html_3 .mp-panel{display:flex;justify-content:space-between;gap:28px;background:#F9FAFB;border-radius:8px;padding:24px 25px;margin-bottom:30px;}
.cd-t-template_html_3 .mp-who{flex:1 1 auto;min-width:0;display:flex;gap:28px;}
.cd-t-template_html_3 .mp-who .cd-party{flex:1 1 0;min-width:0;}
.cd-t-template_html_3 .cd-label{color:var(--accent-ink);font-size:11px;font-weight:700;letter-spacing:1.5px;margin-bottom:10px;}
.cd-t-template_html_3 .cd-party-name{font-size:18px;font-weight:700;margin-bottom:5px;}
.cd-t-template_html_3 .cd-lines{font-size:13.5px;color:#000;line-height:1.5;}
.cd-t-template_html_3 .mp-meta{flex:none;max-width:42%;text-align:right;}
.cd-t-template_html_3 .mp-mi+.mp-mi{margin-top:12px;}
.cd-t-template_html_3 .mp-mi .cd-label{margin-bottom:4px;}
.cd-t-template_html_3 .mp-mv{font-size:15px;font-weight:600;overflow-wrap:anywhere;}
.cd-t-template_html_3 .cd-table{border-collapse:separate;border-spacing:0;}
.cd-t-template_html_3 .cd-table th{background:var(--accent);color:var(--on-accent);font-size:11.5px;letter-spacing:1px;padding:15px 14px;}
.cd-t-template_html_3 .cd-table th:first-child{border-top-left-radius:4px;}
.cd-t-template_html_3 .cd-table th:last-child{border-top-right-radius:4px;}
.cd-t-template_html_3 .cd-table td{padding:15px 14px;border-bottom:1px solid #E5E7EB;color:#000;font-size:12.5px;}
.cd-t-template_html_3 .cd-table td.cd-c-desc{font-weight:500;}
.cd-t-template_html_3 .cd-table td.cd-col-last{font-weight:700;}
.cd-t-template_html_3 .cd-items{margin-bottom:24px;}
.cd-t-template_html_3 .cd-totals{flex:0 0 320px;}
.cd-t-template_html_3 .cd-tot{padding:0 0 12px;font-size:14px;font-weight:500;color:#000;}
.cd-t-template_html_3 .cd-tot-label{color:#000;}
.cd-t-template_html_3 .cd-tot-value{font-weight:500;}
.cd-t-template_html_3 .cd-tot-grand{margin-top:8px;padding:20px 0 0;border-top:2px solid var(--accent);border-radius:0;background:none;color:var(--accent-ink);align-items:center;font-size:28px;font-weight:800;}
.cd-t-template_html_3 .cd-tot-grand .cd-tot-label{font-size:16px;font-weight:800;text-transform:uppercase;color:var(--accent-ink);}
.cd-t-template_html_3 .cd-tot-grand .cd-tot-value{font-weight:800;}
.cd-t-template_html_3 .cd-tot-muted{margin-top:14px;}
.cd-t-template_html_3 .cd-section:not(.cd-before):not(.cd-visuals){margin-top:22px;}
.cd-t-template_html_3 .cd-h{font-family:var(--font-body);color:var(--accent-ink);font-size:11px;font-weight:800;letter-spacing:1.5px;margin-bottom:12px;}
.cd-t-template_html_3 .cd-section:not(.cd-before):not(.cd-visuals) .cd-section-body{padding-top:10px;border-top:1px solid #E5E7EB;font-size:13.5px;line-height:1.8;}
.cd-t-template_html_3 .cd-section-body>*:last-child{margin-bottom:0;}
.cd-t-template_html_3 .cd-sigs{margin-top:26px;}
.cd-t-template_html_3 .cd-sig-img{height:60px;}
.cd-t-template_html_3 .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html_3 .cd-sig-line{border-top:1px solid #d6d9de;width:200px;max-width:100%;margin-top:8px;}
.cd-t-template_html_3 .cd-sig-label{color:var(--accent-ink);font-size:10px;letter-spacing:1.5px;}
.cd-t-template_html_3 .cd-pay-btn{border-radius:4px;}
.cd-t-template_html_3 .cd-fact{background:#F9FAFB;border-color:#E5E7EB;}
.cd-t-template_html_3 .mp-footer{justify-content:flex-end;}
`,
};

// ---------------------------------------------------------------------------
// 5. Gradient (template_html_4): slanted gradient header, content card overlapping it
// ---------------------------------------------------------------------------
type CardKey = 'parties' | 'subject' | 'intro' | 'facts' | 'tags';

const gradient: ThemeDef = {
  id: 'template_html_4',
  pad: { top: 48, x: 40, bottom: 70 },
  noSignoff: true,
  closingBlock: true,
  header: ({ m }) => {
    const contact = [m.company.addressLines.join(', '), m.company.phone, m.company.email].filter(Boolean).join('<span class="cd-dot">•</span>');
    return block('cd-hdr gb-band', `<div class="gb-row">
      <div class="gb-left">${m.company.name ? `<div class="gb-co">${m.company.name}</div>` : ''}${contact ? `<div class="gb-contact">${contact}</div>` : ''}${m.company.website ? `<div class="gb-web">${m.company.website}</div>` : ''}</div>
      <div class="gb-right">${m.company.logoUrl ? `<div class="gb-logo">${logoImg(m)}</div>` : ''}${titleH1(m)}${m.number ? `<div class="gb-pill"><span class="gb-pill-k">${m.numberLabel}</span><span class="gb-pill-v">#${m.number}</span></div>` : ''}${statusBadge(m)}</div>
    </div><div class="gb-cut"></div>`);
  },
  parties: ({ m }) => {
    if (!m.parties.length && !m.meta.length) return '';
    return block('cd-parties gb-info', `<div class="gb-who">${partyHtml(m)}</div>${m.meta.length ? `<div class="gb-meta"><div class="cd-label gb-meta-h">Details</div>${m.meta.map((i) => `<div class="gb-mi">${i.label}: <strong>${i.value}</strong></div>`).join('')}</div>` : ''}`);
  },
  compose: (ctx, p) => {
    const { m } = ctx;
    // the "card": parties … summary rendered as joined pieces (each piece is still its own paginated block)
    const order: CardKey[] = ['subject', 'intro', 'facts', 'tags'];
    const pieces: Array<[string, string]> = [];
    if (p.parties) pieces.push([p.parties, '']);
    for (const k of order) if (p[k]) pieces.push([p[k], 'gb-pad']);
    for (const b of p.before) if (b) pieces.push([b, 'gb-pad']);
    if (p.items) pieces.push([p.items, '']);
    if (p.summary) pieces.push([p.summary, '']);
    const card = pieces.map(([html, extra], i) => addClass(html, ['gb-card', extra, i === 0 ? 'gb-card-top' : '', i === pieces.length - 1 ? 'gb-card-end' : ''].filter(Boolean).join(' ')));
    const closing = m.closing ? block('cd-closing gb-closing', `<div class="gb-bar"></div><div class="cd-closing-text">${m.closing}</div>`) : '';
    return [p.header, ...card, p.visuals, ...p.after, closing, p.signatures];
  },
  summary: ({ m }) => (hasSummary(m) ? block('cd-summary gb-summary', `<div class="cd-summary-side">${payButton(m)}${summaryNotes(m)}</div>${totalsHtml(m.totals)}`) : ''),
  footer: () => pagenoFooter('gb-footer'),
  css: () => `
.cd-t-template_html_4{--title-size:28px;color:#000;}
.cd-t-template_html_4 .gb-band{position:relative;margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 0 calc(-1 * var(--pl));padding:48px calc(var(--px) + 10px) 92px calc(var(--pl) + 10px);background:linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%);color:var(--on-accent);}
.cd-t-template_html_4 .gb-cut{position:absolute;left:0;right:0;bottom:-1px;height:0;border-left:var(--page-w) solid transparent;border-bottom:36px solid var(--paper);}
.cd-t-template_html_4 .gb-row{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
.cd-t-template_html_4 .gb-left{flex:1 1 auto;min-width:0;}
.cd-t-template_html_4 .gb-co{font-family:var(--font-head);font-size:24px;font-weight:800;line-height:1.2;margin-bottom:8px;overflow-wrap:anywhere;}
.cd-t-template_html_4 .gb-contact{font-size:13px;line-height:1.5;opacity:.95;overflow-wrap:anywhere;}
.cd-t-template_html_4 .gb-web{font-size:13px;font-weight:600;margin-top:4px;overflow-wrap:anywhere;}
.cd-t-template_html_4 .gb-right{flex:none;max-width:46%;display:flex;flex-direction:column;align-items:flex-end;text-align:right;}
.cd-t-template_html_4 .gb-logo{background:rgba(255,255,255,.92);border-radius:8px;padding:6px 10px;margin-bottom:15px;}
.cd-t-template_html_4 .gb-logo .cd-logo{max-height:52px;max-width:200px;}
.cd-t-template_html_4 .cd-title{color:var(--on-accent);font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;}
.cd-t-template_html_4 .gb-pill{display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:6px;background:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.45);}
.cd-t-template_html_4 .gb-pill-k{font-size:11px;font-weight:700;opacity:.9;}
.cd-t-template_html_4 .gb-pill-v{font-size:14px;font-weight:700;}
.cd-t-template_html_4 .gb-band .cd-status{background:#ffffff;border-color:#ffffff;}
.cd-t-template_html_4 .gb-card{position:relative;margin:0 12px;background:#ffffff;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;}
.cd-t-template_html_4 .gb-card-top{margin-top:-52px;border-top:1px solid #E5E7EB;border-radius:12px 12px 0 0;}
.cd-t-template_html_4 .gb-card-end{margin-bottom:28px;border-bottom:1px solid #E5E7EB;border-radius:0 0 12px 12px;overflow:hidden;}
.cd-t-template_html_4 .gb-card-top.gb-card-end{border-radius:12px;}
.cd-t-template_html_4 .gb-pad{padding:22px 40px 4px;}
.cd-t-template_html_4 .gb-pad.cd-before{padding-bottom:6px;}
.cd-t-template_html_4 .gb-pad .cd-section-body>*:last-child{margin-bottom:0;}
.cd-t-template_html_4 .gb-info.gb-card{display:flex;justify-content:space-between;gap:28px;padding:34px 40px;border-bottom:1px solid #E5E7EB;}
.cd-t-template_html_4 .gb-info.gb-card-end{border-bottom:1px solid #E5E7EB;}
.cd-t-template_html_4 .gb-who{flex:1 1 auto;min-width:0;display:flex;gap:28px;}
.cd-t-template_html_4 .gb-who .cd-party{flex:1 1 0;min-width:0;}
.cd-t-template_html_4 .cd-label{color:var(--accent-ink);font-size:11px;font-weight:800;letter-spacing:1px;margin-bottom:10px;}
.cd-t-template_html_4 .cd-party-name{font-size:18px;font-weight:700;margin-bottom:6px;}
.cd-t-template_html_4 .cd-lines{font-size:13.5px;color:#000;}
.cd-t-template_html_4 .gb-meta{flex:none;max-width:44%;text-align:right;font-size:13.5px;line-height:1.75;}
.cd-t-template_html_4 .gb-meta-h{color:var(--secondary-ink);}
.cd-t-template_html_4 .gb-mi{overflow-wrap:anywhere;}
.cd-t-template_html_4 .cd-items.gb-card{margin-bottom:0;}
.cd-t-template_html_4 .cd-table th{background:#ffffff;color:#000;font-size:11.5px;font-weight:800;padding:16px 15px;border-bottom:2px solid #000;}
.cd-t-template_html_4 .cd-table th:first-child,.cd-t-template_html_4 .cd-table td:first-child{padding-left:20px;}
.cd-t-template_html_4 .cd-table th:last-child,.cd-t-template_html_4 .cd-table td:last-child{padding-right:20px;}
.cd-t-template_html_4 .cd-table td{padding:16px 15px;border-bottom:1px solid #E5E7EB;color:#6B7280;font-size:12.5px;}
.cd-t-template_html_4 .cd-table tbody tr:nth-child(odd) td{background:#FAFAFA;}
.cd-t-template_html_4 .cd-table td.cd-c-desc{color:#111827;font-weight:500;}
.cd-t-template_html_4 .cd-table td.cd-col-last{color:#111827;font-weight:700;}
.cd-t-template_html_4 .gb-summary.gb-card{padding:28px 40px;background:#FAFAFA;border-top:1px solid #000;}
.cd-t-template_html_4 .cd-totals{flex:0 0 300px;}
.cd-t-template_html_4 .cd-tot{padding:0 0 10px;font-size:14px;color:#000;}
.cd-t-template_html_4 .cd-tot-label{color:#000;font-weight:500;}
.cd-t-template_html_4 .cd-tot-value{font-weight:700;}
.cd-t-template_html_4 .cd-tot-grand{margin-top:10px;padding:15px 0 0;border-top:2px solid var(--accent);border-radius:0;background:none;color:#000;align-items:center;font-size:24px;font-weight:900;}
.cd-t-template_html_4 .cd-tot-grand .cd-tot-label{color:var(--accent-ink);font-size:14px;font-weight:800;text-transform:uppercase;}
.cd-t-template_html_4 .cd-tot-grand .cd-tot-value{font-weight:900;}
.cd-t-template_html_4 .cd-tot-muted{margin-top:12px;}
.cd-t-template_html_4 .cd-section:not(.cd-before):not(.cd-visuals){padding:0 10px;}
.cd-t-template_html_4 .cd-h{font-family:var(--font-body);color:#000;font-size:11px;font-weight:800;letter-spacing:1px;margin-bottom:8px;}
.cd-t-template_html_4 .gb-card .cd-h{color:var(--accent-ink);}
.cd-t-template_html_4 .cd-section:not(.cd-before) .cd-prose{font-size:13px;}
.cd-t-template_html_4 .gb-closing{text-align:center;margin-top:12px;}
.cd-t-template_html_4 .gb-bar{height:4px;width:60px;border-radius:4px;margin:0 auto 14px;background:linear-gradient(90deg, var(--accent) 0%, var(--secondary) 100%);}
.cd-t-template_html_4 .gb-closing .cd-closing-text{font-family:var(--font-body);font-size:12px;font-weight:400;color:#000;opacity:.7;}
.cd-t-template_html_4 .cd-sigs{padding:0 10px;}
.cd-t-template_html_4 .cd-sig-img{height:60px;}
.cd-t-template_html_4 .cd-sig-img img{max-height:58px;max-width:200px;}
.cd-t-template_html_4 .cd-sig-line{border-top:2px solid var(--accent);width:200px;max-width:100%;margin-top:8px;}
.cd-t-template_html_4 .cd-sig-label{color:var(--accent-ink);font-size:11px;letter-spacing:1px;}
.cd-t-template_html_4 .cd-pay-btn{border-radius:8px;background:linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%);}
.cd-t-template_html_4 .cd-fact{background:#FAFAFA;border-color:#E5E7EB;border-radius:10px;}
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
