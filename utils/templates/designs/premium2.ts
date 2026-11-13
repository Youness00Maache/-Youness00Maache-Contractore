/**
 * Design module "premium2": five of the original Premium designs (pre-2026-11 HTML templates from
 * utils/templates/newHtmlTemplates.ts and allNewTemplates.ts), restored under their original ids and ported
 * to the shared engine so they render every document type with the real model data and labels.
 *
 *   template_neon      Neon Cyberpunk   - dark page, glowing neon frame + grid, typewriter type
 *   template_luxury    Luxury Gold      - navy header band with gold details, navy footer band
 *   template_nature    Organic Nature   - rounded card with green waves, earthy browns
 *   template_geometric Geometric Bold   - charcoal split header with slanted edges and hexagons
 *   template_pastel    Pastel Soft      - pastel gradients, rounded cards, pink-to-purple accents
 *
 * Changes from the originals (all intentional): labels come from the document type (no hard-coded
 * "INVOICE" / "Bill to" / "Invoice #"), money is formatted by the engine, every field of every document type
 * is shown, text keeps a readable contrast (the Neon company name was black on black when the old default
 * colors were saved), logos/signatures that the originals recolored with CSS filters (not printable) sit on
 * a light chip instead, and gradient text (not printable) is drawn in a solid blend of the two colors.
 */
import { ensureContrast, mix, readableOn } from '../colors.ts';
import {
  block, closingInline, hasSummary, lines, logoImg, payButton, statusBadge, summaryNotes, titleH1, totalsHtml,
  type DesignDef, type RenderCtx, type ThemeDef,
} from '../blocks.ts';
import type { DocModel } from '../model.ts';
import { rgba } from '../kit.ts';

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
const kv = (label: string, value: string, cls = '') =>
  `<div class="p2-kv${cls ? ' ' + cls : ''}"><div class="p2-k">${label}</div><div class="p2-v">${value}</div></div>`;

/** Party columns (+ a "Details" column with the meta items not shown in the header). */
const partyCols = (m: DocModel, restMeta = m.meta, labelSuffix = '') => [
  ...m.parties.map((p) => `<div class="cd-party"><div class="p2-plabel">${p.label}${labelSuffix}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
  restMeta.length
    ? `<div class="cd-party p2-details"><div class="p2-plabel">Details${labelSuffix}</div>${restMeta.map((i) => `<div class="p2-drow"><span class="p2-dk">${i.label}</span><span class="p2-dv">${i.value}</span></div>`).join('')}</div>`
    : '',
];

/** Summary with the totals wrapped (for decorations next to the totals card). */
const wrappedSummary = (ctx: RenderCtx, deco: string, wrapCls: string) => {
  const { m } = ctx;
  if (!hasSummary(m)) return '';
  const side = `${payButton(m)}${summaryNotes(m)}${closingInline(m)}`;
  const totals = totalsHtml(m.totals);
  return block('cd-summary', `<div class="cd-summary-side">${side}</div>${totals ? `<div class="${wrapCls}">${deco}${totals}</div>` : ''}`);
};

const hexagon = (fill: string, w: number, h: number, opacity = 1) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 100 87" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><polygon points="50,0 100,22 100,65 50,87 0,65 0,22" fill="${fill}" fill-opacity="${opacity}"/></svg>`;

const companyContact = (m: DocModel) => [m.company.phone, m.company.email, m.company.website].filter(Boolean);

// ---------------------------------------------------------------------------
// 6. Neon Cyberpunk
// ---------------------------------------------------------------------------
const NEON_FRAME = 30;

const neon: ThemeDef = {
  id: 'template_neon',
  pad: { top: NEON_FRAME + 3 + 25, x: NEON_FRAME + 30, bottom: NEON_FRAME + 42, footer: NEON_FRAME + 14 },
  ink: '#e0e0e0',
  header: ({ m }) => {
    const pairs = [m.number ? kv(m.numberLabel, m.number, 'nx-kv-no') : '', m.meta[0] ? kv(m.meta[0].label, m.meta[0].value) : ''].filter(Boolean);
    return block('cd-hdr', `
      <div class="nx-co"><div class="nx-name">${m.company.name}</div>${lines(m.company.lines)}</div>
      <div class="nx-doc">${m.company.logoUrl ? `<div class="nx-logo">${logoImg(m)}</div>` : ''}${titleH1(m)}${pairs.length ? `<div class="nx-kvs">${pairs.join('<span class="nx-sep"></span>')}</div>` : ''}${statusBadge(m)}</div>`);
  },
  parties: ({ m }) => {
    const cols = partyCols(m, m.meta.slice(1), ' //').join('');
    return cols ? block('cd-parties nx-parties', cols) : '';
  },
  chrome: ({ c, page }) => {
    const w = page.width;
    const h = page.height;
    const grid = `<svg class="nx-grid" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="nx-grid-p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${c.accent}" stroke-opacity="0.08" stroke-width="1"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#nx-grid-p)"/></svg>`;
    return `<div class="nx-bg"></div>${grid}<div class="nx-frame"><div class="nx-bar"></div></div>`;
  },
  footer: () => '<div class="cd-footer nx-footer"><div class="cd-footer-text">SECURE TRANSMISSION // END OF LINE</div><div class="cd-pageno"></div></div>',
  css: ({ c }) => {
    const a = (x: number) => rgba(c.accent, x);
    const s = (x: number) => rgba(c.secondary, x);
    const f = NEON_FRAME;
    return `
.cd-t-template_neon{--title-size:32px;font-size:11.5px;}
.cd-t-template_neon .nx-bg{position:absolute;left:0;top:0;right:0;bottom:0;background:linear-gradient(135deg,#0d0d0d 0%,#1a1a2e 50%,#16213e 100%);}
.cd-t-template_neon .nx-grid{position:absolute;left:0;top:0;}
.cd-t-template_neon .nx-frame{position:absolute;left:${f}px;top:${f}px;right:${f}px;bottom:${f}px;border:1px solid ${c.accent};background:rgba(13,13,13,.9);box-shadow:0 0 20px ${a(0.27)};}
.cd-t-template_neon .nx-bar{height:3px;background:linear-gradient(90deg,${c.accent},${c.secondary});box-shadow:0 0 8px ${c.accent};}
.cd-t-template_neon .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin:0 -30px 22px;padding:0 30px 22px;border-bottom:1px solid ${a(0.27)};}
.cd-t-template_neon .nx-co{flex:1 1 auto;min-width:0;}
.cd-t-template_neon .nx-name{font-family:var(--font-head);font-size:20px;font-weight:700;line-height:1.2;color:var(--accent-ink);text-shadow:0 0 8px ${a(0.85)};letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;overflow-wrap:anywhere;}
.cd-t-template_neon .nx-co .cd-lines{font-size:10px;line-height:1.6;color:#a0a0a0;}
.cd-t-template_neon .nx-doc{text-align:right;display:flex;flex-direction:column;align-items:flex-end;flex:none;max-width:56%;}
.cd-t-template_neon .nx-logo{background:#f3f5f8;border-radius:4px;padding:5px 8px;margin-bottom:8px;box-shadow:0 0 10px ${a(0.55)};}
.cd-t-template_neon .nx-logo .cd-logo{max-height:34px;max-width:160px;}
.cd-t-template_neon .cd-title{font-weight:700;color:var(--secondary-ink);letter-spacing:3px;text-transform:uppercase;line-height:1.05;text-shadow:0 0 15px ${s(0.9)};}
.cd-t-template_neon .nx-kvs{display:flex;gap:16px;align-items:center;justify-content:flex-end;margin-top:8px;}
.cd-t-template_neon .nx-sep{width:1px;height:22px;background:${a(0.27)};flex:none;}
.cd-t-template_neon .p2-kv{text-align:right;}
.cd-t-template_neon .p2-k{font-size:8px;color:#8a8a8a;text-transform:uppercase;letter-spacing:1px;}
.cd-t-template_neon .p2-v{font-size:12px;color:#e0e0e0;white-space:nowrap;}
.cd-t-template_neon .nx-kv-no .p2-v{color:var(--accent-ink);font-weight:700;}
.cd-t-template_neon .cd-status{margin-top:8px;}
.cd-t-template_neon .cd-tone-good{color:#4ade80;} .cd-t-template_neon .cd-tone-bad{color:#ff5c7a;} .cd-t-template_neon .cd-tone-warn{color:#fbbf24;} .cd-t-template_neon .cd-tone-neutral{color:#b0b0b0;}
.cd-t-template_neon .nx-parties{gap:30px;margin-bottom:24px;}
.cd-t-template_neon .p2-plabel{font-size:9px;font-weight:700;color:var(--secondary-ink);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;}
.cd-t-template_neon .cd-party-name{font-size:16px;color:#ffffff;margin-bottom:3px;}
.cd-t-template_neon .cd-lines{font-size:11px;color:#aaaaaa;}
.cd-t-template_neon .p2-drow{display:flex;justify-content:space-between;gap:12px;font-size:11px;padding:2px 0;border-bottom:1px dotted ${a(0.22)};}
.cd-t-template_neon .p2-drow:last-child{border-bottom:0;}
.cd-t-template_neon .p2-dk{color:#8a8a8a;}
.cd-t-template_neon .p2-dv{color:#e0e0e0;font-weight:700;text-align:right;overflow-wrap:anywhere;min-width:0;}
.cd-t-template_neon .cd-subject-text{color:#ffffff;}
.cd-t-template_neon .cd-table th{color:var(--accent-ink);font-size:9px;letter-spacing:1px;padding:10px 12px;border-bottom:1px solid ${c.accent};}
.cd-t-template_neon .cd-table td{color:#e0e0e0;font-size:11px;padding:10px 12px;border-bottom:1px solid ${a(0.2)};}
.cd-t-template_neon .cd-table tbody tr:nth-child(odd) td{background:${a(0.035)};}
.cd-t-template_neon .cd-table td.cd-num{color:#b8b8b8;}
.cd-t-template_neon .cd-table td.cd-col-last{color:#ececec;font-weight:700;}
.cd-t-template_neon .cd-totals{flex:0 0 270px;background:rgba(0,0,0,.4);border:1px solid ${a(0.27)};padding:15px;}
.cd-t-template_neon .cd-tot{padding:4px 0;font-size:11px;}
.cd-t-template_neon .cd-tot-label{color:#8a8a8a;}
.cd-t-template_neon .cd-tot-value{color:#eeeeee;font-weight:400;}
.cd-t-template_neon .cd-tot-grand{background:none;border-radius:0;border-top:1px solid ${a(0.4)};margin-top:10px;padding:10px 0 2px;align-items:center;}
.cd-t-template_neon .cd-tot-grand:first-child{border-top:0;margin-top:0;padding-top:0;}
.cd-t-template_neon .cd-tot-grand .cd-tot-label{font-size:12px;font-weight:700;color:var(--accent-ink);text-transform:uppercase;}
.cd-t-template_neon .cd-tot-grand .cd-tot-value{font-size:20px;font-weight:700;color:var(--secondary-ink);text-shadow:0 0 10px ${s(0.45)};}
.cd-t-template_neon .cd-tot-balance{border-top:1px solid ${a(0.4)};}
.cd-t-template_neon .cd-tot-balance .cd-tot-label,.cd-t-template_neon .cd-tot-balance .cd-tot-value{color:var(--accent-ink);}
.cd-t-template_neon .cd-pay-btn{background:transparent;border:1px solid ${c.accent};color:var(--accent-ink);border-radius:0;box-shadow:0 0 8px ${a(0.5)};letter-spacing:1px;}
.cd-t-template_neon .cd-sum-closing{color:var(--accent-ink);text-shadow:0 0 6px ${a(0.5)};}
.cd-t-template_neon .cd-h{color:var(--accent-ink);font-size:10px;letter-spacing:1px;}
.cd-t-template_neon .cd-section:not(.cd-before):not(.cd-visuals),.cd-t-template_neon .cd-grid2,.cd-t-template_neon .cd-signoff{border-top:1px solid #333333;padding-top:10px;}
.cd-t-template_neon .cd-section:not(.cd-before) .cd-prose,.cd-t-template_neon .cd-grid2 .cd-prose,.cd-t-template_neon .cd-signoff .cd-prose{font-size:10.5px;color:#a8a8a8;}
.cd-t-template_neon .cd-prose a{color:var(--accent-ink);}
.cd-t-template_neon .cd-fact{background:${a(0.05)};border:1px solid ${a(0.3)};border-radius:0;}
.cd-t-template_neon .cd-fact-value{color:var(--accent-ink);text-shadow:0 0 6px ${a(0.5)};}
.cd-t-template_neon .cd-tag{background:transparent;border:1px solid ${s(0.7)};color:var(--secondary-ink);}
.cd-t-template_neon .cd-widget{border-color:${a(0.3)};}
.cd-t-template_neon .cd-sig{display:flex;flex-direction:column;max-width:250px;}
.cd-t-template_neon .cd-sig-label{order:-1;margin:0 0 7px;font-size:9px;letter-spacing:1px;color:var(--accent-ink);}
.cd-t-template_neon .cd-sig-img{width:max-content;min-width:150px;max-width:100%;height:50px;padding:2px 10px;align-items:center;background:#f3f5f8;border-radius:3px;box-shadow:0 0 10px ${a(0.4)};}
.cd-t-template_neon .cd-sig-blank .cd-sig-img{background:none;box-shadow:none;padding:0;}
.cd-t-template_neon .cd-sig-line{border-top:1px solid ${c.accent};box-shadow:0 0 5px ${c.accent};margin-top:8px;}
.cd-t-template_neon .cd-sig-meta{color:#a8a8a8;}
.cd-t-template_neon .cd-sig-fill{color:#6a6a6a;}
.cd-t-template_neon .cd-runhead{color:#8a8a8a;border-bottom-color:${a(0.27)};}
.cd-t-template_neon .nx-footer{justify-content:center;gap:16px;font-size:9px;color:#5c5c5c;letter-spacing:2px;}
.cd-t-template_neon .nx-footer .cd-pageno{letter-spacing:1px;}
.cd-t-template_neon .cd-neg{color:#ff6b81;}
`;
  },
};

// ---------------------------------------------------------------------------
// 7. Luxury Gold (& Navy)
// ---------------------------------------------------------------------------
const LUX_STRIP = 6;
const LUX_FOOT = 74;

const luxury: ThemeDef = {
  id: 'template_luxury',
  pad: { top: 40, x: 40, bottom: LUX_FOOT + 24, footer: 0 },
  header: ({ m }) => {
    const co = m.company;
    const brand = co.logoUrl ? `<div class="lx-logo">${logoImg(m)}</div>` : '';
    const addr = co.addressLines.map((l) => `<div>${l}</div>`).join('');
    const contact = [co.phone, co.email].filter(Boolean).map((l) => `<div>${l}</div>`).join('');
    const rows = [m.number ? kv(m.numberLabel, m.number, 'lx-kv-no') : '', ...m.meta.map((i) => kv(i.label, i.value))].filter(Boolean);
    return block('cd-hdr', `
      <span class="lx-corner lx-tl"></span><span class="lx-corner lx-br"></span>
      <div class="lx-co">${brand}${!co.logoUrl && co.name ? `<div class="lx-name">${co.name}</div>` : ''}<div class="lx-lines">${addr}${contact}${co.website ? `<div class="lx-web">${co.website}</div>` : ''}</div></div>
      <div class="lx-doc">${titleH1(m)}${rows.length ? `<div class="lx-box${rows.length > 3 ? ' lx-box-2' : ''}">${rows.join('')}</div>` : ''}${statusBadge(m)}</div>`);
  },
  parties: ({ m }) => (m.parties.length
    ? block('cd-parties lx-parties', `<div class="lx-cards">${m.parties.map((p) => `<div class="lx-card"><div class="p2-plabel">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('')}</div><div class="lx-divider"></div>`)
    : ''),
  chrome: ({ c, page }) => {
    const w = page.width;
    const ticks = `<svg class="lx-ticks" width="${w}" height="${LUX_STRIP}" viewBox="0 0 ${w} ${LUX_STRIP}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="lx-tick-p" width="20" height="${LUX_STRIP}" patternUnits="userSpaceOnUse"><rect width="2" height="${LUX_STRIP}" fill="${c.accent}" fill-opacity="0.14"/></pattern></defs><rect width="${w}" height="${LUX_STRIP}" fill="url(#lx-tick-p)"/></svg>`;
    return `<div class="lx-strip">${ticks}</div>`;
  },
  footer: ({ m }) => {
    const co = m.company;
    const line = [co.addressLines.join(', '), co.phone, co.website].filter(Boolean).join(' • ');
    return `<div class="cd-footer lx-footer">${co.name ? `<div class="lx-f-name">${co.name}</div>` : ''}${line ? `<div class="lx-f-line">${line}</div>` : ''}${co.tagline ? `<div class="lx-f-tag">${co.tagline}</div>` : ''}<div class="cd-pageno"></div></div>`;
  },
  css: ({ c }) => {
    const gold = c.secondary;
    const goldOnNavy = ensureContrast(gold, c.accent, 3);
    const navy2 = mix(c.accent, '#3a5a8c', 0.18);
    const on = c.onAccent;
    return `
.cd-t-template_luxury{--title-size:26px;font-size:11.5px;--lx-gold:${gold};--lx-gold-on:${goldOnNavy};--lx-on:${on};}
.cd-t-template_luxury .lx-strip{position:absolute;left:0;right:0;top:0;height:${LUX_STRIP}px;background:linear-gradient(90deg,${gold} 0%,${mix(gold, '#fff3b0', 0.45)} 50%,${gold} 100%);}
.cd-t-template_luxury .lx-ticks{position:absolute;left:0;top:0;}
.cd-t-template_luxury .cd-hdr{position:relative;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;background:linear-gradient(135deg,${c.accent} 0%,${navy2} 100%);color:var(--lx-on);margin:calc(${LUX_STRIP}px - var(--pt)) calc(-1 * var(--px)) 22px calc(-1 * var(--pl));padding:24px var(--px) 20px var(--pl);}
.cd-t-template_luxury .lx-corner{position:absolute;width:30px;height:30px;opacity:.35;}
.cd-t-template_luxury .lx-tl{top:9px;left:9px;border-top:2px solid var(--lx-gold-on);border-left:2px solid var(--lx-gold-on);}
.cd-t-template_luxury .lx-br{bottom:9px;right:9px;border-bottom:2px solid var(--lx-gold-on);border-right:2px solid var(--lx-gold-on);}
.cd-t-template_luxury .lx-co{flex:1 1 auto;min-width:0;max-width:52%;}
.cd-t-template_luxury .lx-logo{display:inline-block;background:#ffffff;border:1px solid ${rgba(gold, 0.6)};border-radius:2px;padding:5px 8px;margin-bottom:10px;}
.cd-t-template_luxury .lx-logo .cd-logo{max-height:38px;max-width:170px;}
.cd-t-template_luxury .lx-name{font-family:var(--font-head);font-size:17px;font-weight:500;letter-spacing:2px;color:var(--lx-gold-on);margin-bottom:8px;line-height:1.25;}
.cd-t-template_luxury .lx-lines{font-size:10px;line-height:1.55;color:${rgba(on, 0.78)};overflow-wrap:anywhere;}
.cd-t-template_luxury .lx-web{color:var(--lx-gold-on);}
.cd-t-template_luxury .lx-doc{text-align:right;flex:none;max-width:46%;display:flex;flex-direction:column;align-items:flex-end;}
.cd-t-template_luxury .cd-title{font-weight:400;color:var(--lx-gold-on);letter-spacing:3px;text-transform:uppercase;line-height:1.1;margin-bottom:10px;}
.cd-t-template_luxury .lx-box{background:rgba(255,255,255,.1);border:1px solid ${rgba(gold, 0.3)};border-radius:2px;padding:10px 15px;text-align:right;}
.cd-t-template_luxury .lx-box-2{display:grid;grid-template-columns:auto auto;gap:6px 22px;}
.cd-t-template_luxury .lx-box .p2-kv+.p2-kv{margin-top:6px;}
.cd-t-template_luxury .lx-box-2 .p2-kv+.p2-kv{margin-top:0;}
.cd-t-template_luxury .p2-k{font-size:8px;color:${rgba(on, 0.6)};text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}
.cd-t-template_luxury .p2-v{font-size:11px;color:var(--lx-on);overflow-wrap:anywhere;}
.cd-t-template_luxury .lx-kv-no .p2-v{font-size:12px;font-weight:600;letter-spacing:1px;color:var(--lx-gold-on);}
.cd-t-template_luxury .lx-doc .cd-status{color:var(--lx-on);}
.cd-t-template_luxury .lx-parties{display:block;margin-bottom:6px;}
.cd-t-template_luxury .lx-cards{display:flex;gap:14px;}
.cd-t-template_luxury .lx-card{flex:1 1 0;min-width:0;background:linear-gradient(135deg,#f9f7f0 0%,#fefdfb 100%);border-left:3px solid var(--lx-gold);padding:12px 15px;box-shadow:0 2px 8px rgba(0,0,0,.03);}
.cd-t-template_luxury .p2-plabel{font-size:8px;color:#8b8b8b;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:5px;}
.cd-t-template_luxury .cd-party-name{font-size:14px;color:var(--accent-ink);margin-bottom:4px;}
.cd-t-template_luxury .lx-card .cd-lines{font-size:11px;color:#5a5a5a;line-height:1.45;}
.cd-t-template_luxury .lx-divider{height:1px;background:linear-gradient(90deg,transparent 0%,${gold} 50%,transparent 100%);margin:18px 0 0;}
.cd-t-template_luxury .cd-subject-text{color:var(--accent-ink);font-family:var(--font-head);font-size:17px;font-weight:500;}
.cd-t-template_luxury .cd-table th{background:${c.accent};color:var(--lx-gold-on);font-size:9px;letter-spacing:1px;padding:10px 10px;}
.cd-t-template_luxury .cd-table td{border-bottom:1px solid #e8e4d9;padding:8px 10px;font-size:11px;color:#4a4a4a;}
.cd-t-template_luxury .cd-table td.cd-c-desc{color:var(--accent-ink);font-weight:500;}
.cd-t-template_luxury .cd-table td.cd-col-last{color:var(--secondary-ink);font-weight:700;}
.cd-t-template_luxury .cd-totals{flex:0 0 250px;background:linear-gradient(135deg,${c.accent} 0%,${navy2} 100%);border:1px solid ${gold};padding:15px 20px;box-shadow:0 5px 15px ${rgba(c.accent, 0.3)};}
.cd-t-template_luxury .cd-tot{padding:4px 0;font-size:11px;}
.cd-t-template_luxury .cd-tot-label{color:${rgba(on, 0.68)};font-weight:500;}
.cd-t-template_luxury .cd-tot-value{color:var(--lx-on);font-weight:600;}
.cd-t-template_luxury .cd-tot-grand{background:none;border-radius:0;border-top:1px solid ${gold};margin-top:12px;padding:12px 0 2px;align-items:center;}
.cd-t-template_luxury .cd-tot-grand:first-child{border-top:0;margin-top:0;padding-top:0;}
.cd-t-template_luxury .cd-tot-grand .cd-tot-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--lx-gold-on);}
.cd-t-template_luxury .cd-tot-grand .cd-tot-value{font-size:18px;font-weight:700;color:var(--lx-gold-on);}
.cd-t-template_luxury .cd-tot-balance{border-top:1px solid ${rgba(gold, 0.6)};}
.cd-t-template_luxury .cd-tot-balance .cd-tot-label,.cd-t-template_luxury .cd-tot-balance .cd-tot-value{color:var(--lx-gold-on);}
.cd-t-template_luxury .cd-pay-btn{border-radius:2px;border:1px solid ${gold};}
.cd-t-template_luxury .cd-sum-closing{color:var(--accent-ink);font-weight:500;font-style:italic;}
.cd-t-template_luxury .cd-h{font-family:var(--font-body);font-size:8.5px;font-weight:700;letter-spacing:2px;color:#8b8b8b;}
.cd-t-template_luxury .cd-before .cd-h{color:var(--accent-ink);font-size:10px;}
.cd-t-template_luxury .cd-section:not(.cd-before):not(.cd-visuals),.cd-t-template_luxury .cd-grid-cell,.cd-t-template_luxury .cd-signoff-notes{background:#f9f7f0;border-left:2px solid var(--lx-gold);border-radius:2px;padding:11px 15px 8px;}
.cd-t-template_luxury .cd-section:not(.cd-before) .cd-prose,.cd-t-template_luxury .cd-grid-cell .cd-prose,.cd-t-template_luxury .cd-signoff .cd-prose{font-size:10.5px;color:#4a4a4a;line-height:1.55;}
.cd-t-template_luxury .cd-section:not(.cd-before):not(.cd-visuals) .cd-prose>*:last-child,.cd-t-template_luxury .cd-grid-cell .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_luxury .cd-fact{background:#f9f7f0;border:0;border-left:3px solid var(--lx-gold);border-radius:0;}
.cd-t-template_luxury .cd-fact-value{color:var(--accent-ink);}
.cd-t-template_luxury .cd-tag{background:#f9f7f0;color:var(--accent-ink);border:1px solid ${rgba(gold, 0.5)};}
.cd-t-template_luxury .cd-sigs{padding-left:15px;}
.cd-t-template_luxury .cd-sig{max-width:240px;}
.cd-t-template_luxury .cd-sig-line{border-top:1px solid var(--lx-gold);}
.cd-t-template_luxury .cd-sig-label{font-size:8px;letter-spacing:2px;color:var(--secondary-ink);}
.cd-t-template_luxury .lx-footer{left:0;right:0;bottom:0;height:${LUX_FOOT}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px;text-align:center;background:${c.accent};border-top:1px solid ${gold};padding:0 var(--px) 0 var(--pl);color:${rgba(on, 0.62)};}
.cd-t-template_luxury .lx-f-name{font-size:11px;font-weight:600;letter-spacing:1px;color:var(--lx-gold-on);}
.cd-t-template_luxury .lx-f-line{font-size:9px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cd-t-template_luxury .lx-f-tag{font-size:8px;font-style:italic;opacity:.8;}
.cd-t-template_luxury .lx-footer .cd-pageno{font-size:8px;}
`;
  },
};

// ---------------------------------------------------------------------------
// 8. Organic Nature
// ---------------------------------------------------------------------------
const NAT_CARD = 14;
const NAT_FOOT = 54;
const NAT_WAVE = 26;

const leafGlyph = (color: string) =>
  `<svg class="nt-glyph" width="11" height="11" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 21c0-9 6-15 16-16-1 10-7 16-16 16zm0 0l8-8" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const nature: ThemeDef = {
  id: 'template_nature',
  pad: { top: NAT_CARD + NAT_WAVE + 20, x: NAT_CARD + 32, bottom: NAT_CARD + NAT_FOOT + NAT_WAVE + 6, footer: NAT_CARD },
  header: ({ m, c }) => {
    const co = m.company;
    const brand = co.logoUrl ? logoImg(m) : (co.name ? `<div class="nt-name">${co.name}</div>` : '');
    const addr = co.addressLines.length ? `<div class="nt-addr">${leafGlyph(c.accent)}<span>${co.addressLines.join(', ')}</span></div>` : '';
    const contact = companyContact(m);
    return block('cd-hdr', `
      <div class="nt-co">${brand}${addr}${contact.length ? `<div class="nt-contact">${contact.join('<span class="cd-dot">·</span>')}</div>` : ''}</div>
      <div class="nt-doc">${titleH1(m)}${m.number ? `<div class="nt-no">${kv(m.numberLabel, m.number)}</div>` : ''}${statusBadge(m)}</div>`);
  },
  parties: ({ m }) => {
    const cols = partyCols(m).join('');
    return cols ? block('cd-parties nt-card', cols) : '';
  },
  chrome: ({ c, page }) => {
    const cw = page.width - NAT_CARD * 2;
    const top = `<svg class="nt-wave-top" width="${cw}" height="${NAT_WAVE}" viewBox="0 0 1200 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="M0,30 Q300,0 600,30 T1200,30 L1200,60 L0,60 Z" fill="${c.accent}"/></svg>`;
    const bottom = `<svg class="nt-wave-bottom" width="${cw}" height="${NAT_WAVE}" viewBox="0 0 1200 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="M0,30 Q300,60 600,30 T1200,30 L1200,60 L0,60 Z" fill="${c.accent}"/></svg>`;
    return `<div class="nt-bg"></div><div class="nt-blob"></div><div class="nt-cardbg">${top}${bottom}</div>`;
  },
  footer: ({ m }) => {
    const co = m.company;
    return `<div class="cd-footer nt-footer">${co.name ? `<div class="nt-f-name">${co.name}</div>` : ''}${co.addressLines.length ? `<div class="nt-f-line">${co.addressLines.join(', ')}</div>` : ''}<div class="cd-pageno"></div></div>`;
  },
  css: ({ c }) => {
    const green = c.accent;
    const light = c.custom ? mix(green, '#ffffff', 0.3) : '#52b788';
    const g = (x: number) => rgba(green, x);
    const k = NAT_CARD;
    return `
.cd-t-template_nature{--title-size:28px;font-size:11.5px;}
.cd-t-template_nature .nt-bg{position:absolute;left:0;top:0;right:0;bottom:0;background:linear-gradient(135deg,${c.custom ? mix(green, '#ffffff', 0.9) : '#e8f5e9'} 0%,#f1f8e9 50%,#fff8e1 100%);}
.cd-t-template_nature .nt-blob{position:absolute;top:-50px;right:-50px;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,${g(0.1)} 0%,${g(0)} 70%);}
.cd-t-template_nature .nt-cardbg{position:absolute;left:${k}px;top:${k}px;right:${k}px;bottom:${k}px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 15px 40px ${g(0.12)};}
.cd-t-template_nature .nt-wave-top{position:absolute;left:0;top:0;display:block;}
.cd-t-template_nature .nt-wave-bottom{position:absolute;left:0;bottom:${NAT_FOOT - 1}px;display:block;}
.cd-t-template_nature .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:18px;}
.cd-t-template_nature .nt-co{flex:1 1 auto;min-width:0;}
.cd-t-template_nature .cd-logo{max-height:42px;border-radius:6px;margin-bottom:8px;}
.cd-t-template_nature .nt-name{font-family:var(--font-head);font-size:18px;font-weight:700;color:var(--accent-ink);margin-bottom:8px;line-height:1.2;}
.cd-t-template_nature .nt-addr{display:flex;align-items:flex-start;gap:6px;font-size:10px;color:#5a6c5a;line-height:1.5;}
.cd-t-template_nature .nt-glyph{flex:none;margin-top:2px;}
.cd-t-template_nature .nt-contact{font-size:10px;color:#5a6c5a;line-height:1.5;margin-top:2px;padding-left:17px;}
.cd-t-template_nature .nt-doc{text-align:right;flex:none;max-width:52%;display:flex;flex-direction:column;align-items:flex-end;}
.cd-t-template_nature .cd-title{color:var(--secondary-ink);font-weight:800;text-transform:uppercase;line-height:1.1;}
.cd-t-template_nature .nt-no{display:inline-block;background:#f5f5f5;border-radius:10px;padding:9px 15px;margin-top:10px;text-align:right;}
.cd-t-template_nature .p2-k{font-size:8px;color:var(--accent-ink);margin-bottom:2px;}
.cd-t-template_nature .p2-v{font-size:12px;font-weight:700;color:#222222;}
.cd-t-template_nature .nt-card{background:linear-gradient(135deg,${g(0.08)} 0%,${g(0)} 100%);border-radius:12px;border-left:3px solid ${green};padding:14px 18px;gap:26px;margin-bottom:18px;}
.cd-t-template_nature .p2-plabel{font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:4px;}
.cd-t-template_nature .cd-party-name{font-size:14px;font-weight:800;color:var(--secondary-ink);margin-bottom:4px;}
.cd-t-template_nature .cd-lines{font-size:11px;color:#555555;}
.cd-t-template_nature .p2-drow{display:flex;justify-content:space-between;gap:12px;font-size:11px;padding:2px 0;}
.cd-t-template_nature .p2-dk{color:#5a6c5a;}
.cd-t-template_nature .p2-dv{font-weight:700;color:#333333;text-align:right;overflow-wrap:anywhere;min-width:0;}
.cd-t-template_nature .cd-subject-text{color:var(--secondary-ink);}
.cd-t-template_nature .cd-table{border-collapse:separate;border-spacing:2px;margin:0 -2px;width:calc(100% + 4px);}
.cd-t-template_nature .cd-table thead tr{background:linear-gradient(135deg,${green} 0%,${light} 100%);}
.cd-t-template_nature .cd-table th{background:transparent;color:var(--on-accent);font-size:10px;font-weight:700;text-transform:none;letter-spacing:0;padding:12px;}
.cd-t-template_nature .cd-table td{border-bottom:1px solid ${g(0.14)};padding:10px 12px;font-size:11px;color:#333333;}
.cd-t-template_nature .cd-table tbody tr:nth-child(odd) td{background:#f8fbf8;}
.cd-t-template_nature .cd-table td.cd-num{color:#666666;}
.cd-t-template_nature .cd-table td.cd-col-last{color:var(--secondary-ink);font-weight:700;}
.cd-t-template_nature .cd-summary{margin-top:6px;}
.cd-t-template_nature .cd-totals{flex:0 0 250px;background:linear-gradient(135deg,#f8fbf8 0%,${mix(green, '#ffffff', 0.93)} 100%);border:1px solid ${g(0.2)};border-radius:12px;padding:16px 18px;}
.cd-t-template_nature .cd-tot{padding:4px 0;font-size:11px;}
.cd-t-template_nature .cd-tot-label{color:#333333;}
.cd-t-template_nature .cd-tot-value{font-weight:700;color:#222222;}
.cd-t-template_nature .cd-tot-grand{background:none;border-radius:0;border-top:1px solid ${green};margin-top:12px;padding:12px 0 0;align-items:flex-start;}
.cd-t-template_nature .cd-tot-grand:first-child{border-top:0;margin-top:0;padding-top:0;}
.cd-t-template_nature .cd-tot-grand .cd-tot-label{font-size:10px;font-weight:800;color:var(--accent-ink);}
.cd-t-template_nature .cd-tot-grand .cd-tot-value{font-size:22px;font-weight:800;color:var(--secondary-ink);}
.cd-t-template_nature .cd-tot-balance{border-top:1px solid ${g(0.4)};}
.cd-t-template_nature .cd-pay-btn{border-radius:999px;}
.cd-t-template_nature .cd-sum-closing{color:var(--accent-ink);}
.cd-t-template_nature .cd-h{font-size:10.5px;letter-spacing:.06em;color:var(--accent-ink);}
.cd-t-template_nature .cd-section:not(.cd-before):not(.cd-visuals),.cd-t-template_nature .cd-grid-cell,.cd-t-template_nature .cd-signoff-notes{background:#f8fbf8;border-radius:12px;padding:11px 16px 8px;}
.cd-t-template_nature .cd-section:not(.cd-before):not(.cd-visuals) .cd-prose>*:last-child,.cd-t-template_nature .cd-grid-cell .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_nature .cd-fact{background:#f8fbf8;border:1px solid ${g(0.2)};border-radius:12px;}
.cd-t-template_nature .cd-fact-value{color:var(--secondary-ink);}
.cd-t-template_nature .cd-tag{background:${g(0.1)};color:var(--accent-ink);}
.cd-t-template_nature .cd-sigs{justify-content:flex-end;}
.cd-t-template_nature .cd-sig{text-align:center;max-width:200px;flex:0 1 200px;}
.cd-t-template_nature .cd-sig-img{justify-content:center;}
.cd-t-template_nature .cd-sig-line{border-top:1px solid var(--secondary);}
.cd-t-template_nature .cd-sig-label{font-size:8px;color:var(--secondary-ink);}
.cd-t-template_nature .cd-signoff-sigs .cd-sig{max-width:none;flex:none;}
.cd-t-template_nature .nt-footer{left:${k}px;right:${k}px;bottom:${k}px;height:${NAT_FOOT}px;border-radius:0 0 20px 20px;background:${green};color:${rgba(c.onAccent, 0.85)};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px;text-align:center;padding:0 24px;}
.cd-t-template_nature .nt-f-name{font-size:11px;color:var(--on-accent);}
.cd-t-template_nature .nt-f-line{font-size:9px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cd-t-template_nature .nt-footer .cd-pageno{font-size:8.5px;}
`;
  },
};

// ---------------------------------------------------------------------------
// 9. Geometric Bold
// ---------------------------------------------------------------------------
const GEO_X = 14;
const GEO_TOP = 20;
const GEO_FOOT = 50;

const slant = (fill: string, cls: string, dir: 'right' | 'left') =>
  `<svg class="${cls}" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><polygon points="${dir === 'right' ? '0,0 100,0 0,100' : '100,0 100,100 0,100'}" fill="${fill}"/></svg>`;

const geometric: ThemeDef = {
  id: 'template_geometric',
  pad: { top: GEO_TOP + 4 + 28, x: GEO_X + 26, bottom: GEO_X + GEO_FOOT + 20, footer: GEO_X },
  header: ({ m, c }) => {
    const co = m.company;
    const dark = c.secondary;
    const brand = co.logoUrl ? `<div class="gm-logo">${logoImg(m)}</div>` : '';
    const boxes = [m.number ? kv(m.numberLabel, m.number, 'gm-box gm-box-no') : '', m.meta[0] ? kv(m.meta[0].label, m.meta[0].value, 'gm-box gm-box-meta') : ''].filter(Boolean);
    return block('cd-hdr', `
      <div class="gm-panel"><div class="gm-panel-in"><span class="gm-hex-s">${hexagon(c.accent, 20, 17, 0.3)}</span>${brand}${!co.logoUrl && co.name ? `<div class="gm-name">${co.name}</div>` : ''}${lines(co.lines)}</div>${slant(dark, 'gm-slant', 'right')}</div>
      <div class="gm-doc">${titleH1(m)}${boxes.length ? `<div class="gm-boxes">${boxes.join('')}</div>` : ''}${statusBadge(m)}</div>`);
  },
  parties: ({ m, c }) => {
    const cols = partyCols(m, m.meta.slice(1)).join('');
    if (!cols) return '';
    return block('cd-parties gm-client', `<div class="gm-bar"></div><div class="gm-client-body">${cols}</div><div class="gm-client-end">${slant(c.secondary, 'gm-end-slant', 'left')}<span class="gm-end-hex">${hexagon(c.accent, 15, 13)}</span></div>`);
  },
  summary: (ctx) => wrappedSummary(ctx, `<span class="gm-tot-hex">${hexagon(ctx.c.accent, 30, 26, 0.2)}</span>`, 'gm-totwrap'),
  chrome: ({ c }) => `<div class="gm-bg"></div>
    <span class="gm-deco gm-d1">${hexagon(c.accent, 60, 52, 0.09)}</span><span class="gm-deco gm-d2">${hexagon(c.accent, 40, 35, 0.13)}</span><span class="gm-deco gm-d3">${hexagon(c.secondary, 30, 26, 0.07)}</span>
    <div class="gm-card"><div class="gm-topline"></div></div>`,
  footer: ({ m, c }) => {
    const co = m.company;
    const line = [co.name, co.addressLines.join(', ')].filter(Boolean).join(' • ');
    return `<div class="cd-footer gm-footer"><div class="gm-f-dark"><div class="cd-footer-text">${line}</div><div class="cd-pageno"></div></div>${slant(c.secondary, 'gm-f-slant', 'right')}<div class="gm-f-accent">${hexagon('#ffffff', 20, 17)}</div></div>`;
  },
  css: ({ c }) => {
    const dark = c.secondary;
    const onDark = readableOn(dark);
    const accentOnDark = ensureContrast(c.accent, dark, 3);
    const a = (x: number) => rgba(c.accent, x);
    const od = (x: number) => rgba(onDark, x);
    const darkInk = ensureContrast(dark, c.paper, 4.5);
    return `
.cd-t-template_geometric{--title-size:32px;font-size:11.5px;--gm-dark:${dark};--gm-dark-ink:${darkInk};--gm-on-dark:${onDark};--gm-accent-on-dark:${accentOnDark};}
.cd-t-template_geometric .gm-bg{position:absolute;left:0;top:0;right:0;bottom:0;background:#f4f4f4;}
.cd-t-template_geometric .gm-deco{position:absolute;line-height:0;}
.cd-t-template_geometric .gm-d1{top:30px;left:6px;} .cd-t-template_geometric .gm-d2{top:80px;right:4px;} .cd-t-template_geometric .gm-d3{bottom:100px;left:4px;}
.cd-t-template_geometric .gm-card{position:absolute;left:${GEO_X}px;right:${GEO_X}px;top:${GEO_TOP}px;bottom:${GEO_X}px;background:#ffffff;box-shadow:0 8px 30px rgba(0,0,0,.1);}
.cd-t-template_geometric .gm-topline{height:4px;background:linear-gradient(90deg,${c.accent} 0%,${c.accent} 30%,${dark} 30%,${dark} 70%,${c.accent} 70%,${c.accent} 100%);}
.cd-t-template_geometric .cd-hdr{display:flex;align-items:stretch;min-height:100px;margin:calc(${GEO_TOP + 4}px - var(--pt)) calc(${GEO_X}px - var(--px)) 24px calc(${GEO_X}px - var(--pl));}
.cd-t-template_geometric .gm-panel{flex:0 0 45%;display:flex;min-width:0;}
.cd-t-template_geometric .gm-panel-in{position:relative;flex:1 1 auto;min-width:0;background:${dark};color:var(--gm-on-dark);padding:22px 10px 20px calc(var(--pl) - ${GEO_X}px);}
.cd-t-template_geometric .gm-slant{flex:0 0 46px;width:46px;height:auto;display:block;}
.cd-t-template_geometric .gm-hex-s{position:absolute;top:10px;right:8px;line-height:0;}
.cd-t-template_geometric .gm-logo{display:inline-block;background:#ffffff;border-radius:3px;padding:5px 8px;margin-bottom:10px;}
.cd-t-template_geometric .gm-logo .cd-logo{max-height:34px;max-width:150px;}
.cd-t-template_geometric .gm-name{font-family:var(--font-head);font-size:16px;font-weight:700;letter-spacing:1px;color:var(--gm-on-dark);margin-bottom:8px;line-height:1.25;overflow-wrap:anywhere;}
.cd-t-template_geometric .gm-panel .cd-lines{font-size:9.5px;line-height:1.5;color:${od(0.72)};}
.cd-t-template_geometric .gm-doc{flex:1 1 auto;min-width:0;padding:26px calc(var(--px) - ${GEO_X}px) 20px 28px;display:flex;flex-direction:column;justify-content:center;}
.cd-t-template_geometric .cd-title{color:var(--gm-dark-ink);font-weight:800;letter-spacing:-1px;text-transform:uppercase;line-height:1.05;margin-bottom:14px;}
.cd-t-template_geometric .gm-boxes{display:flex;flex-wrap:wrap;gap:14px;}
.cd-t-template_geometric .gm-box{padding:8px 12px;min-width:0;}
.cd-t-template_geometric .gm-box-no{background:${a(0.1)};border-left:3px solid ${c.accent};}
.cd-t-template_geometric .gm-box-meta{background:#f4f4f4;border-left:3px solid ${dark};}
.cd-t-template_geometric .p2-k{font-size:8px;color:#888888;text-transform:uppercase;letter-spacing:1px;}
.cd-t-template_geometric .p2-v{font-size:12px;font-weight:600;color:var(--gm-dark-ink);overflow-wrap:anywhere;}
.cd-t-template_geometric .gm-box-no .p2-v{font-size:14px;font-weight:700;}
.cd-t-template_geometric .gm-doc .cd-status{align-self:flex-start;}
.cd-t-template_geometric .gm-client{gap:0;align-items:stretch;margin-bottom:24px;}
.cd-t-template_geometric .gm-bar{flex:0 0 6px;background:linear-gradient(180deg,${c.accent} 0%,${dark} 100%);}
.cd-t-template_geometric .gm-client-body{flex:1 1 auto;min-width:0;display:flex;gap:26px;background:#f4f4f4;padding:15px 20px;}
.cd-t-template_geometric .gm-client-end{flex:0 0 50px;position:relative;display:flex;align-items:center;justify-content:center;}
.cd-t-template_geometric .gm-end-slant{position:absolute;left:0;top:0;width:15px;height:100%;}
.cd-t-template_geometric .gm-client-end::after{content:'';position:absolute;left:15px;top:0;right:0;bottom:0;background:${dark};}
.cd-t-template_geometric .gm-end-hex{position:relative;z-index:1;line-height:0;margin-left:10px;}
.cd-t-template_geometric .p2-plabel{font-size:8px;color:#888888;text-transform:uppercase;letter-spacing:2px;margin-bottom:5px;}
.cd-t-template_geometric .cd-party-name{font-size:14px;color:var(--gm-dark-ink);margin-bottom:3px;}
.cd-t-template_geometric .cd-lines{font-size:10.5px;color:#666666;}
.cd-t-template_geometric .p2-drow{display:flex;justify-content:space-between;gap:12px;font-size:10.5px;padding:2px 0;}
.cd-t-template_geometric .p2-dk{color:#888888;}
.cd-t-template_geometric .p2-dv{font-weight:600;color:var(--gm-dark-ink);text-align:right;overflow-wrap:anywhere;min-width:0;}
.cd-t-template_geometric .cd-subject-text{color:var(--gm-dark-ink);}
.cd-t-template_geometric .cd-table{background:#f0f0f0;}
.cd-t-template_geometric .cd-table th{background:${dark};color:var(--gm-on-dark);font-size:9px;font-weight:600;letter-spacing:1px;padding:12px 12px;}
.cd-t-template_geometric .cd-table th:first-child,.cd-t-template_geometric .cd-table td:first-child{padding-left:15px;}
.cd-t-template_geometric .cd-table th:last-child,.cd-t-template_geometric .cd-table td:last-child{padding-right:15px;}
.cd-t-template_geometric .cd-table td{background:#e8e8e8;border-bottom:1px solid #cccccc;padding:11px 10px;font-size:11px;color:var(--gm-dark-ink);}
.cd-t-template_geometric .cd-table td.cd-num{color:#666666;}
.cd-t-template_geometric .cd-table td.cd-col-last{color:var(--gm-dark-ink);font-weight:700;}
.cd-t-template_geometric .gm-totwrap{position:relative;flex:0 0 260px;}
.cd-t-template_geometric .gm-tot-hex{position:absolute;top:-10px;right:-10px;line-height:0;}
.cd-t-template_geometric .cd-totals{position:relative;background:linear-gradient(135deg,${dark} 0%,${mix(dark, '#ffffff', 0.08)} 100%);padding:17px 20px;}
.cd-t-template_geometric .cd-tot{padding:4px 0;font-size:11px;}
.cd-t-template_geometric .cd-tot-label{color:${od(0.62)};}
.cd-t-template_geometric .cd-tot-value{color:var(--gm-on-dark);font-weight:600;}
.cd-t-template_geometric .cd-tot-grand{background:none;border-radius:0;border-top:2px solid ${c.accent};margin-top:12px;padding:12px 0 0;align-items:center;}
.cd-t-template_geometric .cd-tot-grand:first-child{border-top:0;margin-top:0;padding-top:0;}
.cd-t-template_geometric .cd-tot-grand .cd-tot-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--gm-accent-on-dark);}
.cd-t-template_geometric .cd-tot-grand .cd-tot-value{font-size:22px;font-weight:800;color:var(--gm-accent-on-dark);}
.cd-t-template_geometric .cd-tot-balance{border-top:1px solid ${od(0.3)};}
.cd-t-template_geometric .cd-tot-balance .cd-tot-label{color:var(--gm-on-dark);}
.cd-t-template_geometric .cd-pay-btn{border-radius:0;}
.cd-t-template_geometric .cd-h{font-size:9px;letter-spacing:2px;color:#888888;}
.cd-t-template_geometric .cd-before .cd-h{color:var(--gm-dark-ink);font-size:10.5px;}
.cd-t-template_geometric .cd-section:not(.cd-before):not(.cd-visuals),.cd-t-template_geometric .cd-grid-cell,.cd-t-template_geometric .cd-signoff-notes{background:#f4f4f4;border-left:3px solid ${c.accent};padding:13px 15px 8px;}
.cd-t-template_geometric .cd-section:not(.cd-before) .cd-prose,.cd-t-template_geometric .cd-grid-cell .cd-prose,.cd-t-template_geometric .cd-signoff .cd-prose{font-size:10.5px;color:#555555;}
.cd-t-template_geometric .cd-section:not(.cd-before):not(.cd-visuals) .cd-prose>*:last-child,.cd-t-template_geometric .cd-grid-cell .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_geometric .cd-fact{background:#f4f4f4;border:0;border-left:3px solid ${c.accent};border-radius:0;}
.cd-t-template_geometric .cd-fact-value{color:var(--gm-dark-ink);}
.cd-t-template_geometric .cd-tag{background:${a(0.12)};color:var(--gm-dark-ink);border-radius:0;}
.cd-t-template_geometric .cd-sigs{justify-content:flex-end;}
.cd-t-template_geometric .cd-sig{text-align:center;max-width:200px;flex:0 1 200px;}
.cd-t-template_geometric .cd-signoff-sigs .cd-sig{max-width:none;flex:none;}
.cd-t-template_geometric .cd-sig-img{justify-content:center;}
.cd-t-template_geometric .cd-sig-line{border-top:2px solid ${dark};}
.cd-t-template_geometric .cd-sig-label{font-size:8px;letter-spacing:2px;color:var(--gm-dark-ink);}
.cd-t-template_geometric .gm-footer{left:${GEO_X}px;right:${GEO_X}px;bottom:${GEO_X}px;height:${GEO_FOOT}px;gap:0;align-items:stretch;}
.cd-t-template_geometric .gm-f-dark{flex:0 0 66%;min-width:0;background:${dark};display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 6px 0 calc(var(--pl) - ${GEO_X}px);font-size:10px;color:${od(0.8)};}
.cd-t-template_geometric .gm-f-dark .cd-pageno{font-size:9px;opacity:.85;}
.cd-t-template_geometric .gm-f-slant{flex:0 0 30px;width:30px;height:${GEO_FOOT}px;display:block;}
.cd-t-template_geometric .gm-f-accent{flex:1 1 auto;background:${c.accent};display:flex;align-items:center;justify-content:center;line-height:0;}
`;
  },
};

// ---------------------------------------------------------------------------
// 10. Pastel Soft
// ---------------------------------------------------------------------------
const PAS_X = 14;
const PAS_TOP = 18;
const PAS_FOOT = 76;

const pastel: ThemeDef = {
  id: 'template_pastel',
  pad: { top: PAS_TOP + 26, x: PAS_X + 34, bottom: PAS_FOOT + 28, footer: 0 },
  header: ({ m }) => {
    const co = m.company;
    const brand = co.logoUrl ? logoImg(m) : (co.name ? `<div class="ps-name">${co.name}</div>` : '');
    const contact = companyContact(m);
    return block('cd-hdr', `
      <div class="ps-co">${brand}${co.addressLines.length ? `<div class="ps-addr"><span class="ps-heart">♥</span> ${co.addressLines.join(', ')}</div>` : ''}${contact.length ? `<div class="ps-addr">${contact.join('<span class="cd-dot">·</span>')}</div>` : ''}</div>
      <div class="ps-doc">${titleH1(m)}${m.number ? `<div class="ps-no">${kv(m.numberLabel, m.number)}</div>` : ''}${statusBadge(m)}</div>`);
  },
  parties: ({ m }) => {
    const cols = partyCols(m).join('<div class="ps-div"></div>');
    return cols ? block('cd-parties ps-client', cols) : '';
  },
  chrome: () => '<div class="ps-bg"></div><div class="ps-card"></div>',
  footer: ({ m }) => {
    const co = m.company;
    return `<div class="cd-footer ps-footer">${co.name ? `<div class="ps-f-name">${co.name}</div>` : ''}${co.addressLines.length ? `<div class="ps-f-line">${co.addressLines.join(', ')}</div>` : ''}<div class="ps-f-care">✦ Made with care ✦</div><div class="cd-pageno"></div></div>`;
  },
  css: ({ c }) => {
    const p = c.accent;
    const pink = c.secondary;
    const blend = ensureContrast(mix(pink, p, 0.45), '#ffffff', 3);
    const tintA = c.custom ? mix(pink, '#ffffff', 0.86) : '#ffe4f6';
    const tintB = c.custom ? mix(mix(p, pink, 0.5), '#ffffff', 0.88) : '#e0f2fe';
    const tintC = c.custom ? mix(p, '#ffffff', 0.86) : '#f3e8ff';
    const pa = (x: number) => rgba(p, x);
    const band = `linear-gradient(135deg,${tintA} 0%,${tintB} 50%,${tintC} 100%)`;
    return `
.cd-t-template_pastel{--title-size:32px;font-size:11.5px;--ps-blend:${blend};}
.cd-t-template_pastel .ps-bg{position:absolute;left:0;top:0;right:0;bottom:0;background:linear-gradient(135deg,${c.custom ? mix(pink, '#ffffff', 0.95) : '#fff5f7'} 0%,#f0f9ff 50%,${c.custom ? mix(p, '#ffffff', 0.95) : '#faf5ff'} 100%);}
.cd-t-template_pastel .ps-card{position:absolute;left:${PAS_X}px;right:${PAS_X}px;top:${PAS_TOP}px;bottom:${PAS_FOOT + 8}px;background:rgba(255,255,255,.96);border-radius:20px;box-shadow:0 15px 40px rgba(200,150,200,.15);}
.cd-t-template_pastel .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;background:${band};border-radius:20px 20px 0 0;margin:calc(${PAS_TOP}px - var(--pt)) calc(${PAS_X}px - var(--px)) 22px calc(${PAS_X}px - var(--pl));padding:26px calc(var(--px) - ${PAS_X}px) 22px calc(var(--pl) - ${PAS_X}px);}
.cd-t-template_pastel .ps-co{flex:1 1 auto;min-width:0;}
.cd-t-template_pastel .cd-logo{max-height:60px;max-width:180px;margin-bottom:10px;}
.cd-t-template_pastel .ps-name{font-family:var(--font-head);font-size:20px;font-weight:700;color:var(--accent-ink);margin-bottom:10px;line-height:1.2;}
.cd-t-template_pastel .ps-addr{font-size:10px;color:#8b7b8b;line-height:1.5;}
.cd-t-template_pastel .ps-heart{color:${pink};}
.cd-t-template_pastel .ps-doc{text-align:right;flex:none;max-width:52%;display:flex;flex-direction:column;align-items:flex-end;}
.cd-t-template_pastel .cd-title{color:var(--ps-blend);font-weight:700;text-transform:uppercase;line-height:1.3;}
.cd-t-template_pastel .ps-no{display:inline-block;background:rgba(255,255,255,.9);border-radius:12px;padding:10px 15px;margin-top:10px;text-align:right;}
.cd-t-template_pastel .p2-k{font-size:8px;color:var(--accent-ink);margin-bottom:2px;}
.cd-t-template_pastel .p2-v{font-size:13px;font-weight:700;color:#222222;}
.cd-t-template_pastel .ps-client{align-items:center;gap:18px;background:linear-gradient(135deg,${c.custom ? mix(p, '#ffffff', 0.95) : '#faf5ff'} 0%,${c.custom ? mix(pink, '#ffffff', 0.94) : '#fff1f2'} 100%);border:1px solid ${pa(0.16)};border-radius:15px;padding:15px 20px;margin-bottom:20px;}
.cd-t-template_pastel .ps-div{flex:0 0 1px;align-self:stretch;background:${pa(0.2)};}
.cd-t-template_pastel .p2-plabel{font-size:8px;font-weight:700;text-transform:uppercase;color:var(--accent-ink);margin-bottom:2px;}
.cd-t-template_pastel .cd-party-name{font-size:14px;font-weight:700;color:var(--ps-blend);margin-bottom:3px;}
.cd-t-template_pastel .cd-lines{font-size:11px;color:#666666;}
.cd-t-template_pastel .p2-drow{display:flex;justify-content:space-between;gap:12px;font-size:11px;padding:1px 0;}
.cd-t-template_pastel .p2-dk{color:#8b7b8b;}
.cd-t-template_pastel .p2-dv{font-weight:700;color:#555555;text-align:right;overflow-wrap:anywhere;min-width:0;}
.cd-t-template_pastel .cd-subject-text{color:var(--ps-blend);}
.cd-t-template_pastel .cd-items{background:${pa(0.06)};border:2px solid ${pa(0.27)};border-radius:12px;padding:10px;}
.cd-t-template_pastel .cd-table{border-collapse:separate;border-spacing:0 4px;margin:-4px 0;}
.cd-t-template_pastel .cd-table th{background:${p};color:var(--on-accent);font-size:10px;font-weight:700;text-transform:none;letter-spacing:0;padding:10px 12px;vertical-align:middle;}
.cd-t-template_pastel .cd-table th:first-child{border-radius:8px 0 0 8px;}
.cd-t-template_pastel .cd-table th:last-child{border-radius:0 8px 8px 0;}
.cd-t-template_pastel .cd-table td{border-bottom:0;padding:10px 12px;font-size:11px;color:#666666;background:${pa(0.05)};}
.cd-t-template_pastel .cd-table tbody tr:nth-child(even) td{background:${pa(0.09)};}
.cd-t-template_pastel .cd-table td.cd-col-last{font-weight:700;}
.cd-t-template_pastel .cd-summary{margin-top:4px;}
.cd-t-template_pastel .cd-totals{flex:0 0 230px;background:linear-gradient(135deg,${c.custom ? mix(p, '#ffffff', 0.95) : '#faf5ff'} 0%,${c.custom ? mix(pink, '#ffffff', 0.94) : '#fff1f2'} 100%);border:1px solid ${pa(0.2)};border-radius:15px;padding:15px;}
.cd-t-template_pastel .cd-tot{padding:3px 0;font-size:10.5px;}
.cd-t-template_pastel .cd-tot-label{color:#666666;}
.cd-t-template_pastel .cd-tot-value{color:#555555;font-weight:700;}
.cd-t-template_pastel .cd-tot-grand{background:none;border-radius:0;border-top:1px solid ${pa(0.3)};margin-top:8px;padding:8px 0 0;align-items:center;}
.cd-t-template_pastel .cd-tot-grand:first-child{border-top:0;margin-top:0;padding-top:0;}
.cd-t-template_pastel .cd-tot-grand .cd-tot-label{font-size:10px;font-weight:800;color:var(--accent-ink);}
.cd-t-template_pastel .cd-tot-grand .cd-tot-value{font-size:18px;font-weight:700;color:var(--ps-blend);}
.cd-t-template_pastel .cd-tot-balance{border-top:1px solid ${pa(0.3)};}
.cd-t-template_pastel .cd-pay-btn{border-radius:999px;background:linear-gradient(135deg,${pink} 0%,${p} 100%);color:${readableOn(mix(pink, p, 0.5))};}
.cd-t-template_pastel .cd-sum-closing{color:var(--ps-blend);}
.cd-t-template_pastel .cd-h{font-size:10px;letter-spacing:.06em;color:var(--accent-ink);}
.cd-t-template_pastel .cd-section:not(.cd-before):not(.cd-visuals),.cd-t-template_pastel .cd-grid-cell,.cd-t-template_pastel .cd-signoff-notes{background:${c.custom ? mix(p, '#ffffff', 0.96) : '#faf5ff'};border:1px solid ${pa(0.14)};border-radius:15px;padding:11px 16px 8px;}
.cd-t-template_pastel .cd-section:not(.cd-before):not(.cd-visuals) .cd-prose>*:last-child,.cd-t-template_pastel .cd-grid-cell .cd-prose>*:last-child{margin-bottom:0;}
.cd-t-template_pastel .cd-fact{background:${c.custom ? mix(p, '#ffffff', 0.95) : '#faf5ff'};border:1px solid ${pa(0.2)};border-radius:15px;}
.cd-t-template_pastel .cd-fact-value{color:var(--ps-blend);}
.cd-t-template_pastel .cd-tag{background:${pa(0.1)};color:var(--accent-ink);}
.cd-t-template_pastel .cd-sigs{padding-left:6px;}
.cd-t-template_pastel .cd-sig{max-width:240px;}
.cd-t-template_pastel .cd-sig-line{border-top:0;height:1px;background:linear-gradient(90deg,${pink},${p});}
.cd-t-template_pastel .cd-sig-label{font-size:9px;text-transform:none;letter-spacing:0;color:var(--ps-blend);}
.cd-t-template_pastel .ps-footer{left:0;right:0;bottom:0;height:${PAS_FOOT}px;background:${band};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px;text-align:center;padding:0 var(--px) 0 var(--pl);color:#8b7b8b;}
.cd-t-template_pastel .ps-f-name{font-size:11px;font-weight:700;color:var(--ps-blend);}
.cd-t-template_pastel .ps-f-line{font-size:9px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cd-t-template_pastel .ps-f-care{font-size:8px;color:#a8a8a8;margin-top:4px;}
.cd-t-template_pastel .ps-footer .cd-pageno{font-size:8px;}
`;
  },
};

// ---------------------------------------------------------------------------
const premium = (meta: Omit<TemplateMetaLite, 'collection'>) => ({ ...meta, collection: 'premium' as const });
type TemplateMetaLite = DesignDef['meta'];

export const DESIGNS: DesignDef[] = [
  {
    meta: premium({ id: 'template_neon', name: 'Neon Cyberpunk', description: 'Dark futuristic page with a glowing neon frame, a faint grid and typewriter type.', accent: '#00f0ff', secondary: '#ff006e', paper: '#0d0d0d', headFont: 'courier', bodyFont: 'courier', tags: ['dark', 'neon', 'futuristic', 'premium'] }),
    theme: neon,
  },
  {
    meta: premium({ id: 'template_luxury', name: 'Luxury Gold', description: 'Navy header with gold details, ornamental corners and a navy footer band.', accent: '#0a1931', secondary: '#d4af37', paper: '#ffffff', headFont: 'garamond', bodyFont: 'georgia', tags: ['luxury', 'gold', 'navy', 'serif', 'premium'] }),
    theme: luxury,
  },
  {
    meta: premium({ id: 'template_nature', name: 'Organic Nature', description: 'A rounded card with flowing green waves, earthy browns and soft tints.', accent: '#2d6a4f', secondary: '#6c584c', paper: '#ffffff', headFont: 'trebuchet', bodyFont: 'trebuchet', tags: ['nature', 'green', 'organic', 'premium'] }),
    theme: nature,
  },
  {
    meta: premium({ id: 'template_geometric', name: 'Geometric Bold', description: 'Charcoal split header with slanted edges, hexagon accents and an electric highlight.', accent: '#00d4ff', secondary: '#2c2c2c', paper: '#ffffff', headFont: 'segoe', bodyFont: 'segoe', tags: ['geometric', 'bold', 'modern', 'premium'] }),
    theme: geometric,
  },
  {
    meta: premium({ id: 'template_pastel', name: 'Pastel Soft', description: 'Soft pastel gradients, rounded cards and pink-to-purple accents.', accent: '#a855f7', secondary: '#ec4899', paper: '#ffffff', headFont: 'quicksand', bodyFont: 'quicksand', tags: ['pastel', 'soft', 'friendly', 'premium'] }),
    theme: pastel,
  },
];
