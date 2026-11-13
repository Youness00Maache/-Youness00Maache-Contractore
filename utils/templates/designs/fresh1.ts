/**
 * Design module "fresh1": seven new original designs (collection 'new').
 *
 *   atelier         - refined studio masthead, double hairlines, small-caps labels
 *   sidebar         - tinted full-height company column on every page
 *   site_plan       - architectural drawing sheet: grid paper, sheet frame, title block footer
 *   timber          - warm craftsman look: slab serif, stamped badge, plank rules
 *   colorblock      - two-tone geometric header blocks, strong grid
 *   paper_minimal   - ultra-minimal, tiny labels, monospace figures, one accent mark
 *   service_ticket  - field-service ticket: phone band, carbon-form info cells
 *
 * Every design renders all document kinds from the model only (labels come from the model), keeps the shared
 * blocks for everything it does not restyle, and follows the pagination contract in ../blocks.ts.
 */
import {
  block, docNumber, lines, logoImg, metaList, partyBlocks, payButton, statusBadge, summaryNotes, closingInline, titleH1, totalsHtml,
  type DesignDef, type RenderCtx, type ThemeDef,
} from '../blocks.ts';
import { mix } from '../colors.ts';

const MONO = "'IBM Plex Mono', 'Courier New', Courier, monospace";

/** Party columns (+ optional meta column) or '' when there is nothing to show. */
const partiesRow = (ctx: RenderCtx, cls: string, metaCol = true, metaTitle = '') => {
  const { m } = ctx;
  const meta = metaCol && m.meta.length
    ? `<div class="cd-party cd-party-meta">${metaTitle ? `<div class="cd-label">${metaTitle}</div>` : ''}${metaList(m)}</div>`
    : '';
  const inner = partyBlocks(m) + meta;
  return inner ? block(`cd-parties ${cls}`, inner) : '';
};

/**
 * Company address on one line + contact items that wrap as whole items (the shared compactLines joins them
 * with dots into one string, which can wrap with a dangling separator in narrow columns).
 */
const companyBlock = (m: RenderCtx['m'], cls: string, opts: { phone?: boolean } = {}) => {
  const addr = m.company.addressLines.join(', ');
  const items = [opts.phone === false ? '' : m.company.phone, m.company.email, m.company.website].filter(Boolean);
  if (!addr && !items.length) return '';
  const contact = items.map((x) => `<span class="cd-ci">${x}</span>`).join(' ');
  return `<div class="cd-lines ${cls}">${addr ? `<div>${addr}</div>` : ''}${contact ? `<div>${contact}</div>` : ''}</div>`;
};

const CI_CSS = (t: string, centered = false) => (centered
  ? `.cd-t-${t} .cd-ci{display:inline-block;margin:0 8px;}`
  : `.cd-t-${t} .cd-ci{display:inline-block;margin-right:14px;}.cd-t-${t} .cd-ci:last-child{margin-right:0;}`);

const hasSummaryContent = (ctx: RenderCtx) => !!(ctx.m.totals.length || ctx.m.paymentLink || ctx.m.summaryNotes.length);

// ---------------------------------------------------------------------------
// 1. Atelier (centered serif masthead, double hairlines)
// ---------------------------------------------------------------------------
const atelier: ThemeDef = {
  id: 'atelier',
  pad: { top: 44, x: 72, bottom: 66, footer: 28 },
  sectionsGrid: true,
  header: ({ m }) => block('cd-hdr', `
    <div class="at-mast">${logoImg(m) || (m.company.initials ? `<div class="at-mono"><div class="at-mono-in">${m.company.initials}</div></div>` : '')}
      ${m.company.name ? `<div class="at-name">${m.company.name}</div>` : ''}
      ${m.company.tagline ? `<div class="at-tag">${m.company.tagline}</div>` : ''}
      ${companyBlock(m, 'at-lines')}</div>
    <div class="at-rule"></div>
    <div class="at-doc">${titleH1(m)}${m.number ? `<div class="at-no"><span class="at-no-l">${m.numberLabel}</span> <span class="at-no-v">${m.number}</span></div>` : ''}${statusBadge(m)}</div>`),
  parties: (ctx) => partiesRow(ctx, 'at-parties'),
  css: () => `
.cd-t-atelier{--title-size:34px;}
.cd-t-atelier .cd-block{margin-bottom:16px;}
${CI_CSS('atelier', true)}
.cd-t-atelier .cd-hdr{text-align:center;margin-bottom:16px;}
.cd-t-atelier .cd-logo{margin:0 auto 8px;max-height:52px;max-width:210px;}
.cd-t-atelier .at-mono{width:64px;height:64px;margin:0 auto 12px;border:1px solid var(--accent-ink);border-radius:50%;display:flex;align-items:center;justify-content:center;}
.cd-t-atelier .at-mono-in{width:54px;height:54px;border:1px solid var(--accent-line);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-size:21px;font-weight:600;letter-spacing:.06em;color:var(--accent-ink);}
.cd-t-atelier .at-name{font-family:var(--font-head);font-size:23px;font-weight:600;letter-spacing:.2em;margin-right:-.2em;text-transform:uppercase;line-height:1.2;color:var(--ink);}
.cd-t-atelier .at-tag{font-family:var(--font-head);font-style:italic;font-size:15px;color:var(--accent-ink);margin-top:2px;}
.cd-t-atelier .at-lines{margin-top:6px;font-size:10.5px;letter-spacing:.03em;line-height:1.65;color:var(--muted);}
.cd-t-atelier .at-rule{height:4px;border-top:1px solid var(--rule-strong);border-bottom:1px solid var(--rule-strong);margin:14px 0 12px;}
.cd-t-atelier .cd-title{font-weight:500;letter-spacing:.26em;margin-right:-.26em;text-transform:uppercase;line-height:1.05;}
.cd-t-atelier .at-no{margin-top:9px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;}
.cd-t-atelier .at-no-l{color:var(--muted);}
.cd-t-atelier .at-no-v{font-weight:600;color:var(--ink);}
.cd-t-atelier .cd-label{font-size:8.5px;font-weight:600;letter-spacing:.24em;color:var(--accent-ink);margin-bottom:8px;}
.cd-t-atelier .at-parties{gap:36px;padding:12px 0 10px;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin-bottom:18px;}
.cd-t-atelier .cd-party-name{font-family:var(--font-head);font-size:18px;font-weight:600;line-height:1.2;margin-bottom:4px;}
.cd-t-atelier .cd-lines{color:var(--ink);font-size:11px;}
.cd-t-atelier .at-mast .cd-lines{color:var(--muted);}
.cd-t-atelier .cd-meta-row{border-bottom:0;padding:2px 0;font-size:11px;}
.cd-t-atelier .cd-meta-row dt{font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;padding-top:2px;}
.cd-t-atelier .cd-subject{text-align:center;}
.cd-t-atelier .cd-subject-text{font-size:20px;font-weight:500;font-style:italic;color:var(--accent-ink);}
.cd-t-atelier .cd-intro p{font-family:var(--font-head);font-size:16px;line-height:1.6;text-align:center;}
.cd-t-atelier .cd-table th{color:var(--accent-ink);font-size:8.5px;font-weight:600;letter-spacing:.2em;padding:10px 8px;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);}
.cd-t-atelier .cd-table td{padding:8px 8px;border-bottom:1px solid var(--rule);font-size:11.5px;}
.cd-t-atelier .cd-table th:first-child,.cd-t-atelier .cd-table td:first-child{padding-left:0;}
.cd-t-atelier .cd-table th:last-child,.cd-t-atelier .cd-table td:last-child{padding-right:0;}
.cd-t-atelier .cd-item-name{font-family:var(--font-head);font-size:14px;font-weight:500;line-height:1.25;}
.cd-t-atelier .cd-totals{flex-basis:270px;}
.cd-t-atelier .cd-tot{padding:3px 0;font-size:11.5px;}
.cd-t-atelier .cd-tot-label{text-transform:uppercase;letter-spacing:.14em;font-size:9px;padding-top:2px;}
.cd-t-atelier .cd-tot-grand{background:none;color:var(--accent-ink);border-radius:0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);margin-top:8px;padding:8px 0;align-items:baseline;}
.cd-t-atelier .cd-tot-grand .cd-tot-label{color:var(--accent-ink);font-weight:600;}
.cd-t-atelier .cd-tot-grand .cd-tot-value{font-family:var(--font-head);font-size:24px;font-weight:600;}
.cd-t-atelier .cd-tot-balance{border-top:0;font-size:13px;}
.cd-t-atelier .cd-pay-btn{background:var(--accent);color:var(--on-accent);border-radius:0;letter-spacing:.12em;text-transform:uppercase;font-size:10px;}
.cd-t-atelier .cd-sum-closing{font-style:italic;font-weight:500;font-size:16px;}
.cd-t-atelier .cd-h{font-size:12px;font-weight:600;letter-spacing:.22em;padding-bottom:4px;border-bottom:1px solid var(--rule);margin-bottom:6px;}
.cd-t-atelier .cd-fact{background:transparent;border:0;border-top:1px solid var(--rule-strong);border-bottom:1px solid var(--rule-strong);border-radius:0;text-align:center;}
.cd-t-atelier .cd-fact-value{font-size:20px;font-weight:600;}
.cd-t-atelier .cd-tag{background:transparent;border:1px solid var(--accent-line);border-radius:0;letter-spacing:.08em;text-transform:uppercase;font-size:9px;}
.cd-t-atelier .cd-sig-label{letter-spacing:.2em;}
.cd-t-atelier .cd-closing{text-align:center;}
.cd-t-atelier .cd-closing-text{font-style:italic;font-weight:500;font-size:17px;}
.cd-t-atelier .cd-footer{justify-content:center;gap:20px;border-top:1px solid var(--rule);padding-top:9px;letter-spacing:.08em;}
`,
};

// ---------------------------------------------------------------------------
// 2. Sidebar (tinted company column on every page)
// ---------------------------------------------------------------------------
const SB_W = 214;

const sidebar: ThemeDef = {
  id: 'sidebar',
  pad: { top: 54, x: 46, left: SB_W + 40, bottom: 70, footer: 28 },
  chrome: ({ m }) => `<div class="sb-col"><div class="sb-bar"></div><div class="sb-inner">
    <div class="sb-brand">${m.company.logoUrl ? `<div class="sb-logo">${logoImg(m)}</div>` : (m.company.initials ? `<div class="sb-mono">${m.company.initials}</div>` : '')}
      ${m.company.name ? `<div class="sb-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="sb-tag">${m.company.tagline}</div>` : ''}</div>
    ${m.company.lines.length ? `<div class="sb-contact">${m.company.lines.map((l) => `<div>${l}</div>`).join('')}</div>` : ''}
    ${m.meta.length ? `<div class="cd-first-only sb-meta">${m.meta.map((i) => `<div class="sb-mi"><div class="sb-ml">${i.label}</div><div class="sb-mv">${i.value}</div></div>`).join('')}</div>` : ''}
  </div></div>`,
  header: ({ m }) => block('cd-hdr', `
    <div class="sb-doc">${titleH1(m)}${docNumber(m)}${statusBadge(m)}</div>
    ${m.highlight ? `<div class="sb-hl"><div class="sb-hl-label">${m.highlight.label}</div><div class="sb-hl-value">${m.highlight.value}</div>${m.keyDate ? `<div class="sb-hl-sub">${m.keyDate.label} · ${m.keyDate.value}</div>` : ''}</div>` : ''}`),
  parties: ({ m }) => (m.parties.length ? block('cd-parties sb-parties', partyBlocks(m)) : ''),
  css: () => `
.cd-t-sidebar{--title-size:40px;}
.cd-t-sidebar .sb-col{position:absolute;left:0;top:0;bottom:0;width:${SB_W}px;background:var(--accent-soft);border-right:1px solid var(--accent-tint);}
.cd-t-sidebar .sb-bar{position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--accent);}
.cd-t-sidebar .sb-inner{position:absolute;left:0;right:0;top:0;bottom:0;padding:52px 20px 40px 30px;}
.cd-t-sidebar .sb-logo{display:inline-block;background:#ffffff;border-radius:8px;padding:8px;margin-bottom:14px;box-shadow:0 1px 2px rgba(16,24,40,.08);}
.cd-t-sidebar .sb-logo .cd-logo{max-width:148px;max-height:52px;}
.cd-t-sidebar .sb-mono{width:52px;height:52px;border-radius:12px;background:var(--accent);color:var(--on-accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-weight:800;font-size:19px;margin-bottom:14px;}
.cd-t-sidebar .sb-name{font-family:var(--font-head);font-weight:800;font-size:17px;line-height:1.2;color:var(--accent-ink);overflow-wrap:anywhere;}
.cd-t-sidebar .sb-tag{font-size:10.5px;color:var(--muted);margin-top:4px;}
.cd-t-sidebar .sb-contact{margin-top:14px;font-size:10.5px;line-height:1.65;color:var(--ink);overflow-wrap:anywhere;}
.cd-t-sidebar .sb-meta{margin-top:24px;padding-top:16px;border-top:1px solid var(--accent-line);}
.cd-t-sidebar .sb-mi{margin-bottom:11px;}
.cd-t-sidebar .sb-ml{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:1px;}
.cd-t-sidebar .sb-mv{font-size:11.5px;font-weight:600;line-height:1.4;overflow-wrap:anywhere;color:var(--ink);}
.cd-t-sidebar .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:20px;border-bottom:2px solid var(--accent);margin-bottom:22px;}
.cd-t-sidebar .sb-doc{min-width:0;}
.cd-t-sidebar .cd-title{font-weight:800;letter-spacing:-.015em;}
.cd-t-sidebar .cd-docno{font-size:12px;margin-top:6px;}
.cd-t-sidebar .sb-hl{flex:none;min-width:168px;max-width:46%;text-align:right;background:var(--accent);color:var(--on-accent);border-radius:10px;padding:12px 16px;}
.cd-t-sidebar .sb-hl-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.85;}
.cd-t-sidebar .sb-hl-value{font-family:var(--font-head);font-size:22px;font-weight:800;line-height:1.2;margin-top:2px;overflow-wrap:anywhere;}
.cd-t-sidebar .sb-hl-sub{font-size:10px;margin-top:4px;opacity:.9;}
.cd-t-sidebar .sb-parties{gap:28px;margin-bottom:24px;}
.cd-t-sidebar .cd-label{color:var(--accent-ink);}
.cd-t-sidebar .cd-lines{color:var(--ink);}
.cd-t-sidebar .cd-table th{background:var(--accent);color:var(--on-accent);font-size:9px;padding:9px 10px;}
.cd-t-sidebar .cd-table td{border-bottom:1px solid var(--rule);font-size:11.5px;}
.cd-t-sidebar .cd-table tbody tr:nth-child(even) td{background:var(--accent-soft);}
.cd-t-sidebar .cd-totals{flex-basis:260px;}
.cd-t-sidebar .cd-tot-grand{border-radius:8px;}
.cd-t-sidebar .cd-pay-btn{border-radius:999px;}
.cd-t-sidebar .cd-fact{border-radius:10px;}
.cd-t-sidebar .cd-h{font-size:10.5px;}
`,
};

// ---------------------------------------------------------------------------
// 3. Site Plan (drawing sheet: grid paper, frame, title block)
// ---------------------------------------------------------------------------
const gridPaper = (ctx: RenderCtx) => {
  const { c, page } = ctx;
  const minor = mix(c.accent, c.paper, 0.94);
  const major = mix(c.accent, c.paper, 0.86);
  return `<svg class="sp-grid-svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" xmlns="http://www.w3.org/2000/svg"><defs>`
    + `<pattern id="spMinor" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="${minor}" stroke-width="0.7"/></pattern>`
    + `<pattern id="spMajor" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="url(#spMinor)"/><path d="M80 0H0V80" fill="none" stroke="${major}" stroke-width="1"/></pattern>`
    + `</defs><rect x="0" y="0" width="${page.width}" height="${page.height}" fill="url(#spMajor)"/></svg>`;
};

const northArrow = (color: string) =>
  `<svg class="sp-north" width="46" height="46" viewBox="0 0 46 46" xmlns="http://www.w3.org/2000/svg"><circle cx="23" cy="23" r="21" fill="none" stroke="${color}" stroke-width="1.2"/><circle cx="23" cy="23" r="16" fill="none" stroke="${color}" stroke-width="0.6"/><path d="M23 6 L29 27 L23 23 L17 27 Z" fill="${color}"/><path d="M23 40 L17 27 L23 23 L29 27 Z" fill="none" stroke="${color}" stroke-width="0.9"/></svg>`;

const sitePlan: ThemeDef = {
  id: 'site_plan',
  pad: { top: 46, x: 44, bottom: 124, footer: 18 },
  header: ({ m, c }) => block('cd-hdr', `
    <div class="sp-doc">${titleH1(m)}<div class="sp-sub">${m.number ? `<span class="sp-sub-l">${m.numberLabel}</span> <span class="sp-sub-v">${m.number}</span>` : ''}${statusBadge(m)}</div></div>
    <div class="sp-brand">${logoImg(m) || northArrow(c.accentInk)}${m.company.tagline ? `<div class="sp-tag">${m.company.tagline}</div>` : ''}</div>`),
  parties: (ctx) => {
    const { m } = ctx;
    const parties = m.parties.map((p) => `<div class="sp-box"><div class="sp-tab">${p.label}</div><div class="sp-box-body">${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div></div>`).join('');
    const meta = m.meta.length ? `<div class="sp-cells">${m.meta.map((i) => `<div class="sp-cell"><div class="sp-cl">${i.label}</div><div class="sp-cv">${i.value}</div></div>`).join('')}</div>` : '';
    if (!parties && !meta) return '';
    return block('cd-parties sp-parties', `${parties ? `<div class="sp-boxes">${parties}</div>` : ''}${meta}`);
  },
  chrome: (ctx) => `<div class="sp-paper">${gridPaper(ctx)}</div><div class="sp-frame"></div>`,
  footer: ({ m }) => {
    const contact = [m.company.phone, m.company.email, m.company.website].filter(Boolean).map((x) => `<span class="cd-ci">${x}</span>`).join(' ');
    return `<div class="cd-footer sp-tb">
      <div class="sp-tb-cell sp-tb-co"><div class="sp-tb-name">${m.company.name}</div>${m.company.addressLines.length ? `<div class="sp-tb-small">${m.company.addressLines.join(', ')}</div>` : ''}${contact ? `<div class="sp-tb-small">${contact}</div>` : ''}</div>
      <div class="sp-tb-cell sp-tb-doc"><div class="sp-tb-big">${m.title}</div>${m.subject ? `<div class="sp-tb-small sp-tb-subj">${m.subject}</div>` : ''}</div>
      <div class="sp-tb-cell"><div class="sp-tb-l">${m.number ? m.numberLabel : ''}</div><div class="sp-tb-v">${m.number}</div></div>
      <div class="sp-tb-cell"><div class="sp-tb-l">${m.keyDate ? m.keyDate.label : ''}</div><div class="sp-tb-v">${m.keyDate ? m.keyDate.value : ''}</div></div>
      <div class="sp-tb-cell sp-tb-sheet"><div class="sp-tb-l">Sheet</div><div class="sp-tb-v cd-pageno"></div></div>
    </div>`;
  },
  css: () => `
.cd-t-site_plan{--title-size:50px;--sp-mono:${MONO};}
${CI_CSS('site_plan')}
.cd-t-site_plan .sp-paper{position:absolute;left:19px;top:19px;right:19px;bottom:19px;overflow:hidden;}
.cd-t-site_plan .sp-grid-svg{display:block;}
.cd-t-site_plan .sp-frame{position:absolute;left:18px;top:18px;right:18px;bottom:18px;border:1.5px solid var(--accent-ink);}
.cd-t-site_plan .sp-frame::after{content:'';position:absolute;left:4px;top:4px;right:4px;bottom:4px;border:0.5px solid var(--accent-line);}
.cd-t-site_plan .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:14px;border-bottom:2px solid var(--accent-ink);margin-bottom:20px;}
.cd-t-site_plan .cd-title{font-weight:700;text-transform:uppercase;letter-spacing:.03em;line-height:.95;}
.cd-t-site_plan .sp-sub{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:8px;font-family:var(--sp-mono);font-size:11px;}
.cd-t-site_plan .sp-sub-l{color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:9.5px;}
.cd-t-site_plan .sp-sub-v{font-weight:600;color:var(--ink);}
.cd-t-site_plan .sp-sub .cd-status{margin-top:0;border-radius:0;}
.cd-t-site_plan .sp-brand{text-align:right;max-width:44%;}
.cd-t-site_plan .cd-logo{margin-left:auto;max-height:58px;}
.cd-t-site_plan .sp-north{display:block;margin-left:auto;}
.cd-t-site_plan .sp-tag{font-family:var(--sp-mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:6px;}
.cd-t-site_plan .sp-parties{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-bottom:22px;}
.cd-t-site_plan .sp-boxes{display:flex;gap:12px;align-items:stretch;}
.cd-t-site_plan .sp-box{flex:1 1 0;min-width:0;max-width:calc(50% - 6px);border:1px solid var(--accent-ink);background:var(--paper);}
.cd-t-site_plan .sp-tab{font-family:var(--sp-mono);font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--on-accent);background:var(--accent);padding:3px 8px;}
.cd-t-site_plan .sp-box-body{padding:8px 10px 10px;}
.cd-t-site_plan .cd-party-name{font-family:var(--font-head);font-size:16px;font-weight:600;letter-spacing:.01em;}
.cd-t-site_plan .cd-lines{color:var(--ink);font-size:11px;}
.cd-t-site_plan .sp-cells{display:flex;flex-wrap:wrap;border-top:1px solid var(--accent-ink);border-left:1px solid var(--accent-ink);background:var(--paper);}
.cd-t-site_plan .sp-cell{flex:1 1 22%;min-width:0;border-right:1px solid var(--accent-ink);border-bottom:1px solid var(--accent-ink);padding:5px 9px 6px;}
.cd-t-site_plan .sp-cl{font-family:var(--sp-mono);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink);}
.cd-t-site_plan .sp-cv{font-size:12px;font-weight:600;overflow-wrap:anywhere;}
.cd-t-site_plan .cd-subject-text{font-family:var(--font-head);font-size:18px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent-ink);}
.cd-t-site_plan .cd-table{border:1px solid var(--accent-ink);background:var(--paper);}
.cd-t-site_plan .cd-table th{font-family:var(--sp-mono);font-size:8.5px;font-weight:600;letter-spacing:.08em;color:var(--accent-ink);background:var(--accent-soft);border-bottom:1px solid var(--accent-ink);border-right:1px solid var(--accent-line);padding:7px 9px;}
.cd-t-site_plan .cd-table td{border-bottom:1px solid var(--rule);border-right:1px solid var(--accent-line);padding:7px 9px;font-size:11.5px;}
.cd-t-site_plan .cd-table th.cd-col-last,.cd-t-site_plan .cd-table td.cd-col-last{border-right:0;}
.cd-t-site_plan .cd-table td.cd-r{font-family:var(--sp-mono);font-size:11px;}
.cd-t-site_plan .cd-totals{flex-basis:290px;border:1px solid var(--accent-ink);background:var(--paper);}
.cd-t-site_plan .cd-tot{padding:6px 10px;border-bottom:1px solid var(--rule);font-size:11.5px;}
.cd-t-site_plan .cd-tot:last-child{border-bottom:0;}
.cd-t-site_plan .cd-tot-label{font-family:var(--sp-mono);font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink);padding-top:2px;}
.cd-t-site_plan .cd-tot-value{font-family:var(--sp-mono);}
.cd-t-site_plan .cd-tot-grand{margin:0;border-radius:0;padding:9px 10px;font-size:15px;}
.cd-t-site_plan .cd-tot-grand .cd-tot-label{color:var(--on-accent);}
.cd-t-site_plan .cd-tot-balance{margin:0;border-top:1.5px solid var(--accent-ink);}
.cd-t-site_plan .cd-pay-btn{border-radius:0;font-family:var(--sp-mono);text-transform:uppercase;letter-spacing:.06em;font-size:11px;}
.cd-t-site_plan .cd-sum-closing{font-size:15px;text-transform:uppercase;letter-spacing:.04em;}
.cd-t-site_plan .cd-h{font-family:var(--font-head);font-size:14px;letter-spacing:.06em;border-left:4px solid var(--accent);padding-left:8px;line-height:1.2;}
.cd-t-site_plan .cd-fact{background:var(--paper);border:1px solid var(--accent-ink);border-radius:0;}
.cd-t-site_plan .cd-fact-label{font-family:var(--sp-mono);font-weight:500;}
.cd-t-site_plan .cd-fact-value{font-size:19px;}
.cd-t-site_plan .cd-tag{border-radius:0;border:1px solid var(--accent-line);background:var(--paper);font-family:var(--sp-mono);}
.cd-t-site_plan .cd-sig{background:var(--paper);}
.cd-t-site_plan .cd-sig-label{font-family:var(--sp-mono);font-weight:500;}
.cd-t-site_plan .cd-closing-text{text-transform:uppercase;letter-spacing:.04em;}
.cd-t-site_plan .cd-runhead{font-family:var(--sp-mono);}
.cd-t-site_plan .sp-tb{left:19.5px;right:19.5px;bottom:19.5px;height:82px;display:flex;align-items:stretch;gap:0;border-top:1.5px solid var(--accent-ink);background:var(--paper);color:var(--ink);font-size:10px;}
.cd-t-site_plan .sp-tb-cell{flex:1 1 0;min-width:0;padding:8px 12px;border-left:1px solid var(--accent-ink);display:flex;flex-direction:column;justify-content:center;overflow:hidden;}
.cd-t-site_plan .sp-tb-cell:first-child{border-left:0;}
.cd-t-site_plan .sp-tb-co{flex:2.6 1 0;}
.cd-t-site_plan .sp-tb-doc{flex:1.4 1 0;}
.cd-t-site_plan .sp-tb-sheet{flex:.9 1 0;}
.cd-t-site_plan .sp-tb-name{font-family:var(--font-head);font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;line-height:1.15;color:var(--accent-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cd-t-site_plan .sp-tb-small{font-size:8.5px;line-height:1.4;color:var(--muted);overflow-wrap:anywhere;}
.cd-t-site_plan .sp-tb-subj{max-height:24px;overflow:hidden;}
.cd-t-site_plan .sp-tb-big{font-family:var(--font-head);font-size:19px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.05;color:var(--accent-ink);}
.cd-t-site_plan .sp-tb-l{font-family:var(--sp-mono);font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);min-height:10px;}
.cd-t-site_plan .sp-tb-v{font-family:var(--sp-mono);font-size:10.5px;font-weight:600;margin-top:3px;overflow-wrap:anywhere;}
.cd-t-site_plan .sp-tb-sheet .cd-pageno:empty::before{content:'1 of 1';}
`,
};

// ---------------------------------------------------------------------------
// 4. Timber & Trade (slab serif, stamped badge, plank rules)
// ---------------------------------------------------------------------------
const timber: ThemeDef = {
  id: 'timber',
  pad: { top: 52, x: 54, bottom: 72, footer: 28 },
  sectionsGrid: true,
  header: ({ m }) => {
    const badge = m.company.logoUrl
      ? `<div class="tb-logo"><i class="tb-nail tb-n1"></i><i class="tb-nail tb-n2"></i><i class="tb-nail tb-n3"></i><i class="tb-nail tb-n4"></i>${logoImg(m)}</div>`
      : m.company.initials ? `<div class="tb-ring"><div class="tb-ring-in">${m.company.initials}</div></div>` : '';
    return block('cd-hdr', `
      <div class="tb-top">
        <div class="tb-brand">${badge}<div class="tb-co">${m.company.name ? `<div class="tb-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="tb-tag">${m.company.tagline}</div>` : ''}${companyBlock(m, 'tb-lines')}</div></div>
        <div class="tb-doc">${titleH1(m)}${m.number ? `<div class="tb-no"><span>${m.numberLabel}</span> ${m.number}</div>` : ''}${statusBadge(m)}</div>
      </div>
      <div class="tb-plank"><div class="tb-plank-a"></div><div class="tb-plank-b"></div></div>`);
  },
  parties: (ctx) => {
    const { m } = ctx;
    const cols = [
      ...m.parties.map((p) => `<div class="cd-party tb-party"><div class="tb-h">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      m.meta.length ? `<div class="cd-party tb-plate">${metaList(m)}</div>` : '',
    ].join('');
    return cols ? block('cd-parties tb-parties', cols) : '';
  },
  chrome: () => '<div class="tb-edge"></div><div class="tb-edge2"></div>',
  css: ({ c }) => `
.cd-t-timber{--title-size:40px;--tb-row:${mix(c.secondary, c.paper, 0.86)};--tb-line:${mix(c.accent, c.paper, 0.7)};}
${CI_CSS('timber')}
.cd-t-timber .tb-edge{position:absolute;left:0;right:0;top:0;height:12px;background:var(--accent);}
.cd-t-timber .tb-edge2{position:absolute;left:0;right:0;top:15px;height:3px;background:var(--secondary);}
.cd-t-timber .cd-hdr{margin-bottom:22px;}
.cd-t-timber .tb-top{display:flex;justify-content:space-between;align-items:center;gap:24px;}
.cd-t-timber .tb-brand{display:flex;align-items:center;gap:16px;min-width:0;max-width:64%;}
.cd-t-timber .tb-ring{flex:none;width:78px;height:78px;border-radius:50%;border:3px solid var(--accent);display:flex;align-items:center;justify-content:center;}
.cd-t-timber .tb-ring-in{width:64px;height:64px;border-radius:50%;border:1.5px dashed var(--accent-line);background:var(--tb-row);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-weight:700;font-size:24px;color:var(--accent-ink);letter-spacing:.02em;}
.cd-t-timber .tb-logo{flex:none;position:relative;border:2px solid var(--accent);background:#ffffff;padding:10px 12px;}
.cd-t-timber .tb-logo .cd-logo{max-height:52px;max-width:150px;}
.cd-t-timber .tb-nail{position:absolute;width:5px;height:5px;border-radius:50%;background:var(--accent);}
.cd-t-timber .tb-n1{left:3px;top:3px;} .cd-t-timber .tb-n2{right:3px;top:3px;} .cd-t-timber .tb-n3{left:3px;bottom:3px;} .cd-t-timber .tb-n4{right:3px;bottom:3px;}
.cd-t-timber .tb-co{min-width:0;}
.cd-t-timber .tb-name{font-family:var(--font-head);font-weight:700;font-size:21px;line-height:1.1;text-transform:uppercase;letter-spacing:.02em;color:var(--accent-ink);overflow-wrap:anywhere;}
.cd-t-timber .tb-tag{font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--secondary-ink);margin-top:3px;}
.cd-t-timber .tb-co .cd-lines{margin-top:5px;color:var(--ink);font-size:11px;}
.cd-t-timber .tb-doc .cd-status{margin-top:8px;}
.cd-t-timber .tb-doc{text-align:right;flex:none;max-width:42%;}
.cd-t-timber .cd-title{font-weight:700;text-transform:uppercase;letter-spacing:.02em;}
.cd-t-timber .tb-no{font-family:var(--font-head);font-size:15px;font-weight:600;margin-top:6px;}
.cd-t-timber .tb-no span{color:var(--muted);font-weight:500;}
.cd-t-timber .tb-plank{margin-top:18px;}
.cd-t-timber .tb-plank-a{height:5px;background:var(--accent);}
.cd-t-timber .tb-plank-b{height:2px;background:var(--secondary);margin-top:3px;}
.cd-t-timber .tb-parties{gap:26px;margin-bottom:24px;}
.cd-t-timber .tb-h{display:inline-block;font-family:var(--font-head);font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-ink);border-bottom:3px solid var(--secondary);padding-bottom:2px;margin-bottom:8px;}
.cd-t-timber .cd-party-name{font-size:14px;}
.cd-t-timber .cd-lines{color:var(--ink);}
.cd-t-timber .tb-plate{flex:1.15 1 0;border:2px solid var(--accent);padding:8px 12px;background:var(--paper);}
.cd-t-timber .tb-plate .cd-meta-row{border-bottom:1px solid var(--tb-line);}
.cd-t-timber .tb-plate .cd-meta-row:last-child{border-bottom:0;}
.cd-t-timber .cd-subject-text{font-size:18px;color:var(--accent-ink);}
.cd-t-timber .cd-table th{background:var(--accent);color:var(--on-accent);font-family:var(--font-head);font-size:11px;font-weight:600;letter-spacing:.08em;padding:10px 12px;}
.cd-t-timber .cd-table td{border-bottom:1px solid var(--tb-line);padding:9px 12px;}
.cd-t-timber .cd-table tbody tr:nth-child(even) td{background:var(--tb-row);}
.cd-t-timber .cd-table tbody tr:last-child td{border-bottom:3px solid var(--accent);}
.cd-t-timber .cd-totals{flex-basis:290px;border:2px solid var(--accent);padding:8px 12px;}
.cd-t-timber .cd-tot-label{color:var(--ink);font-weight:600;}
.cd-t-timber .cd-tot-grand{margin:8px -12px -8px;border-radius:0;padding:10px 12px;font-family:var(--font-head);font-size:17px;}
.cd-t-timber .cd-tot-grand .cd-tot-label{color:var(--on-accent);}
.cd-t-timber .cd-tot-balance{border-top:2px solid var(--accent);}
.cd-t-timber .cd-pay-btn{border-radius:0;font-family:var(--font-head);text-transform:uppercase;letter-spacing:.06em;}
.cd-t-timber .cd-sum-closing{font-size:16px;}
.cd-t-timber .cd-h{font-size:13.5px;letter-spacing:.06em;font-weight:700;}
.cd-t-timber .cd-fact{background:var(--tb-row);border:0;border-left:5px solid var(--accent);border-radius:0;}
.cd-t-timber .cd-tag{background:var(--tb-row);color:var(--ink);border-radius:0;}
.cd-t-timber .cd-sig-line{border-top:2px solid var(--accent);}
.cd-t-timber .cd-closing-text{font-size:16px;}
.cd-t-timber .cd-footer{border-top:2px solid var(--accent);padding-top:8px;color:var(--ink);}
`,
};

// ---------------------------------------------------------------------------
// 5. Color Block (two-tone geometric header)
// ---------------------------------------------------------------------------
const colorblock: ThemeDef = {
  id: 'colorblock',
  pad: { top: 44, x: 52, bottom: 72, footer: 28 },
  header: ({ m }) => block('cd-hdr', `
    <div class="cb-a"><div class="cb-a-in">${titleH1(m)}<div class="cb-bar"></div>${m.number ? `<div class="cb-no"><span>${m.numberLabel}</span> ${m.number}</div>` : ''}${statusBadge(m)}</div><div class="cb-sq"></div></div>
    <div class="cb-b"><div class="cb-b-in">${logoImg(m)}${m.company.name ? `<div class="cb-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="cb-tag">${m.company.tagline}</div>` : ''}${companyBlock(m, 'cb-lines')}</div></div>`),
  parties: (ctx) => {
    const { m } = ctx;
    const cols = [
      ...m.parties.map((p) => `<div class="cd-party cb-cell"><div class="cd-label">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      m.meta.length ? `<div class="cd-party cd-party-meta cb-cell cb-cell-meta">${metaList(m)}</div>` : '',
    ].join('');
    return cols ? block('cd-parties cb-parties', cols) : '';
  },
  chrome: () => '<div class="cd-cont-only cb-cont"><div class="cb-cont-a"></div><div class="cb-cont-b"></div></div><div class="cb-corner"></div>',
  css: () => `
.cd-t-colorblock{--title-size:46px;}
${CI_CSS('colorblock')}
.cd-t-colorblock .cd-hdr{display:flex;align-items:stretch;margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 28px calc(-1 * var(--pl));min-height:200px;}
.cd-t-colorblock .cb-a{position:relative;flex:0 0 56%;background:var(--accent);color:var(--on-accent);}
.cd-t-colorblock .cb-a-in{padding:calc(var(--pt) + 8px) 30px 30px var(--pl);}
.cd-t-colorblock .cd-title{color:var(--on-accent);font-weight:900;text-transform:uppercase;letter-spacing:-.015em;line-height:.95;}
.cd-t-colorblock .cb-bar{width:56px;height:7px;background:var(--secondary);margin:14px 0 12px;}
.cd-t-colorblock .cb-no{font-size:12.5px;font-weight:600;}
.cd-t-colorblock .cb-no span{opacity:.8;font-weight:500;}
.cd-t-colorblock .cb-a .cd-status{color:var(--on-accent);}
.cd-t-colorblock .cb-sq{position:absolute;right:0;bottom:0;width:44px;height:44px;background:var(--secondary);}
.cd-t-colorblock .cb-b{flex:1 1 auto;min-width:0;border-bottom:12px solid var(--secondary);text-align:right;}
.cd-t-colorblock .cb-b-in{padding:calc(var(--pt) + 8px) var(--px) 22px 26px;}
.cd-t-colorblock .cd-logo{margin:0 0 10px auto;max-height:50px;max-width:180px;}
.cd-t-colorblock .cb-name{font-family:var(--font-head);font-weight:800;font-size:17px;line-height:1.2;color:var(--ink);overflow-wrap:anywhere;}
.cd-t-colorblock .cb-tag{font-size:10.5px;color:var(--accent-ink);font-weight:600;margin-top:2px;}
.cd-t-colorblock .cb-b .cd-lines{margin-top:6px;font-size:11px;}
.cd-t-colorblock .cb-parties{gap:20px;margin-bottom:26px;}
.cd-t-colorblock .cb-cell{border-top:5px solid var(--accent);padding-top:10px;}
.cd-t-colorblock .cb-cell-meta{border-top-color:var(--secondary);}
.cd-t-colorblock .cd-label{color:var(--accent-ink);font-weight:800;letter-spacing:.1em;}
.cd-t-colorblock .cd-party-name{font-size:14px;font-weight:800;}
.cd-t-colorblock .cd-lines{color:var(--ink);}
.cd-t-colorblock .cd-subject-text{font-size:18px;font-weight:800;}
.cd-t-colorblock .cd-table th{background:var(--accent);color:var(--on-accent);font-size:9.5px;font-weight:800;letter-spacing:.1em;padding:11px 12px;}
.cd-t-colorblock .cd-table td{padding:10px 12px;border-bottom:1px solid var(--rule);}
.cd-t-colorblock .cd-table td.cd-col-0 .cd-item-name{font-weight:700;}
.cd-t-colorblock .cd-table tbody tr:last-child td{border-bottom:2px solid var(--ink);}
.cd-t-colorblock .cd-totals{flex-basis:290px;}
.cd-t-colorblock .cd-tot{padding:5px 12px;}
.cd-t-colorblock .cd-tot-label{color:var(--ink);font-weight:600;}
.cd-t-colorblock .cd-tot-grand{background:var(--secondary);color:var(--on-secondary);border-radius:0;font-size:16px;padding:12px;}
.cd-t-colorblock .cd-tot-grand .cd-tot-label{color:var(--on-secondary);}
.cd-t-colorblock .cd-tot-balance{border-top:3px solid var(--accent);}
.cd-t-colorblock .cd-pay-btn{border-radius:0;}
.cd-t-colorblock .cd-h{color:var(--ink);font-size:11px;letter-spacing:.1em;border-left:6px solid var(--secondary);padding-left:8px;line-height:1.3;}
.cd-t-colorblock .cd-fact{border:0;border-top:5px solid var(--secondary);border-radius:0;background:var(--accent-soft);}
.cd-t-colorblock .cd-tag{border-radius:0;}
.cd-t-colorblock .cd-sig-line{border-top:2px solid var(--ink);}
.cd-t-colorblock .cb-cont-a{position:absolute;left:0;top:0;width:56%;height:12px;background:var(--accent);}
.cd-t-colorblock .cb-cont-b{position:absolute;left:56%;right:0;top:0;height:12px;background:var(--secondary);}
.cd-t-colorblock .cb-corner{position:absolute;right:0;bottom:0;width:18px;height:56px;background:var(--accent);}
.cd-t-colorblock .cd-footer{border-top:3px solid var(--accent);padding-top:8px;right:calc(var(--px) + 6px);}
`,
};

// ---------------------------------------------------------------------------
// 6. Paper Minimal (whitespace, tiny labels, mono figures, one accent mark)
// ---------------------------------------------------------------------------
const paperMinimal: ThemeDef = {
  id: 'paper_minimal',
  pad: { top: 60, x: 82, bottom: 76, footer: 38 },
  header: ({ m }) => block('cd-hdr', `
    <div class="pm-row">
      <div class="pm-co">${m.company.logoUrl ? logoImg(m) : ''}${m.company.name ? `<div class="pm-name"><span class="pm-dot"></span>${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="pm-tag">${m.company.tagline}</div>` : ''}${companyBlock(m, 'pm-lines')}</div>
      ${m.number ? `<div class="pm-no"><div class="pm-k">${m.numberLabel}</div><div class="pm-v">${m.number}</div></div>` : ''}
    </div>
    <div class="pm-title">${titleH1(m)}${statusBadge(m)}</div>`),
  parties: (ctx) => {
    const { m } = ctx;
    const cells = [
      ...m.parties.map((p) => `<div class="pm-cell pm-party"><div class="cd-label">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      ...m.meta.map((i) => `<div class="pm-cell"><div class="cd-label">${i.label}</div><div class="pm-mv">${i.value}</div></div>`),
    ].join('');
    return cells ? block('cd-parties pm-grid', cells) : '';
  },
  css: () => `
.cd-t-paper_minimal{--title-size:44px;--pm-mono:${MONO};font-size:12px;}
${CI_CSS('paper_minimal')}
.cd-t-paper_minimal .cd-hdr{margin-bottom:26px;}
.cd-t-paper_minimal .pm-row{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;}
.cd-t-paper_minimal .pm-co{min-width:0;max-width:62%;}
.cd-t-paper_minimal .cd-logo{max-height:40px;max-width:160px;margin-bottom:12px;}
.cd-t-paper_minimal .pm-name{font-family:var(--font-head);font-weight:600;font-size:13px;letter-spacing:.01em;color:var(--ink);display:flex;align-items:center;gap:9px;}
.cd-t-paper_minimal .pm-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--accent);}
.cd-t-paper_minimal .pm-tag{font-size:10px;color:var(--muted);margin:2px 0 0 18px;}
.cd-t-paper_minimal .pm-lines{font-size:10px;line-height:1.6;color:var(--muted);margin:4px 0 0 18px;}
.cd-t-paper_minimal .pm-no{text-align:right;flex:none;}
.cd-t-paper_minimal .pm-k{font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);}
.cd-t-paper_minimal .pm-v{font-family:var(--pm-mono);font-size:12px;margin-top:3px;color:var(--ink);}
.cd-t-paper_minimal .pm-title{margin-top:30px;display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;}
.cd-t-paper_minimal .cd-title{font-weight:400;letter-spacing:-.025em;color:var(--ink);line-height:1;}
.cd-t-paper_minimal .pm-title .cd-status{margin-top:0;font-weight:600;letter-spacing:.16em;border-width:1px;}
.cd-t-paper_minimal .pm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px 28px;margin-bottom:26px;}
.cd-t-paper_minimal .cd-label{font-size:8px;font-weight:500;letter-spacing:.18em;color:var(--muted);margin-bottom:5px;}
.cd-t-paper_minimal .cd-party-name{font-size:12.5px;font-weight:600;}
.cd-t-paper_minimal .cd-lines{color:var(--ink);font-size:11px;}
.cd-t-paper_minimal .pm-mv{font-size:12px;overflow-wrap:anywhere;}
.cd-t-paper_minimal .cd-subject-text{font-size:17px;font-weight:500;}
.cd-t-paper_minimal .cd-table th{font-size:8px;font-weight:500;letter-spacing:.18em;color:var(--muted);padding:0 8px 9px;border-bottom:1px solid var(--ink);}
.cd-t-paper_minimal .cd-table td{padding:10px 8px;border-bottom:1px solid var(--rule);font-size:11.5px;}
.cd-t-paper_minimal .cd-table th:first-child,.cd-t-paper_minimal .cd-table td:first-child{padding-left:0;}
.cd-t-paper_minimal .cd-table th:last-child,.cd-t-paper_minimal .cd-table td:last-child{padding-right:0;}
.cd-t-paper_minimal .cd-table td.cd-r,.cd-t-paper_minimal .cd-num{font-family:var(--pm-mono);font-size:11px;}
.cd-t-paper_minimal .cd-summary{margin-top:6px;}
.cd-t-paper_minimal .cd-totals{flex-basis:260px;}
.cd-t-paper_minimal .cd-tot{padding:5px 0;}
.cd-t-paper_minimal .cd-tot-label{font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;padding-top:2px;}
.cd-t-paper_minimal .cd-tot-grand{position:relative;background:none;color:var(--ink);border-radius:0;border-top:1px solid var(--ink);margin-top:12px;padding:14px 0 0;font-size:18px;font-weight:500;}
.cd-t-paper_minimal .cd-tot-grand::before{content:'';position:absolute;left:0;top:-2px;width:44px;height:3px;background:var(--accent);}
.cd-t-paper_minimal .cd-tot-grand .cd-tot-label{color:var(--ink);font-weight:600;}
.cd-t-paper_minimal .cd-tot-grand .cd-tot-value{font-weight:500;font-size:18px;}
.cd-t-paper_minimal .cd-tot-balance{border-top:1px solid var(--rule);font-weight:600;}
.cd-t-paper_minimal .cd-pay-btn{background:transparent;color:var(--ink);border:1px solid var(--ink);border-radius:0;font-weight:500;letter-spacing:.06em;}
.cd-t-paper_minimal .cd-sum-closing{font-weight:500;font-size:13px;color:var(--ink);}
.cd-t-paper_minimal .cd-h{font-size:8.5px;font-weight:500;letter-spacing:.18em;color:var(--muted);margin-bottom:10px;}
.cd-t-paper_minimal .cd-fact{background:transparent;border:0;border-top:1px solid var(--ink);border-radius:0;padding:10px 0 0;}
.cd-t-paper_minimal .cd-fact-label{font-weight:500;letter-spacing:.16em;}
.cd-t-paper_minimal .cd-fact-value{font-family:var(--pm-mono);font-weight:400;font-size:17px;color:var(--ink);}
.cd-t-paper_minimal .cd-tag{background:transparent;border:1px solid var(--rule-strong);color:var(--ink);font-weight:500;}
.cd-t-paper_minimal .cd-sig-label{font-weight:500;letter-spacing:.16em;font-size:8.5px;}
.cd-t-paper_minimal .cd-closing-text{font-weight:500;color:var(--ink);font-size:13px;}
.cd-t-paper_minimal .cd-footer{font-family:var(--pm-mono);font-size:8.5px;}
`,
};

// ---------------------------------------------------------------------------
// 7. Service Ticket (phone band, carbon-form info cells)
// ---------------------------------------------------------------------------
const phoneIcon = (color: string) =>
  `<svg class="tk-ico" width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" fill="${color}"/></svg>`;

const serviceTicket: ThemeDef = {
  id: 'service_ticket',
  pad: { top: 40, x: 40, bottom: 66, footer: 24 },
  header: ({ m, c }) => {
    const contact = [m.company.email, m.company.website].filter(Boolean).join('<span class="cd-dot">·</span>');
    const brand = m.company.logoUrl ? `<div class="tk-logo">${logoImg(m)}</div>` : m.company.initials ? `<div class="tk-mono">${m.company.initials}</div>` : '';
    return block('cd-hdr', `
      <div class="tk-band">
        <div class="tk-co">${brand}<div class="tk-co-text">${m.company.name ? `<div class="tk-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="tk-tag">${m.company.tagline}</div>` : ''}${m.company.addressLines.length ? `<div class="tk-small">${m.company.addressLines.join(', ')}</div>` : ''}${contact ? `<div class="tk-small">${contact}</div>` : ''}</div></div>
        ${m.company.phone ? `<div class="tk-phone">${phoneIcon(c.onAccent)}<span>${m.company.phone}</span></div>` : ''}
      </div>
      <div class="tk-ticket">
        <div class="tk-title">${titleH1(m)}${statusBadge(m)}</div>
        ${m.number ? `<div class="tk-no"><div class="tk-no-l">${m.numberLabel}</div><div class="tk-no-v">${m.number}</div></div>` : ''}
      </div>`);
  },
  parties: (ctx) => {
    const { m } = ctx;
    const cells = [
      ...m.parties.map((p) => `<div class="tk-cell tk-cell-wide"><div class="tk-cl">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      ...m.meta.map((i) => `<div class="tk-cell"><div class="tk-cl">${i.label}</div><div class="tk-cv">${i.value}</div></div>`),
    ].join('');
    return cells ? block('cd-parties tk-form', cells) : '';
  },
  summary: (ctx) => {
    const { m } = ctx;
    if (!hasSummaryContent(ctx)) return '';
    const side = `${payButton(m)}${summaryNotes(m)}${closingInline(m)}`;
    return block('cd-summary tk-summary', `<div class="cd-summary-side">${side}</div>${totalsHtml(m.totals)}`);
  },
  css: ({ c }) => `
.cd-t-service_ticket{--title-size:34px;--tk-fill:${mix(c.ink, c.paper, 0.93)};--tk-line:${mix(c.ink, c.paper, 0.35)};}
.cd-t-service_ticket .cd-hdr{margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 16px calc(-1 * var(--pl));}
.cd-t-service_ticket .tk-band{display:flex;justify-content:space-between;align-items:center;gap:24px;background:var(--accent);color:var(--on-accent);padding:24px var(--px) 22px var(--pl);}
.cd-t-service_ticket .tk-co{display:flex;align-items:center;gap:14px;min-width:0;flex:1 1 auto;}
.cd-t-service_ticket .tk-logo{flex:none;background:#ffffff;border-radius:6px;padding:6px 8px;}
.cd-t-service_ticket .tk-logo .cd-logo{max-height:44px;max-width:130px;}
.cd-t-service_ticket .tk-mono{flex:none;width:50px;height:50px;border-radius:6px;background:var(--on-accent);color:var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-weight:700;font-size:20px;}
.cd-t-service_ticket .tk-co-text{min-width:0;}
.cd-t-service_ticket .tk-name{font-family:var(--font-head);font-weight:700;font-size:22px;line-height:1.1;text-transform:uppercase;letter-spacing:.02em;overflow-wrap:anywhere;}
.cd-t-service_ticket .tk-tag{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;opacity:.9;}
.cd-t-service_ticket .tk-small{font-size:10.5px;line-height:1.5;opacity:.92;overflow-wrap:anywhere;}
.cd-t-service_ticket .tk-phone{flex:none;display:flex;align-items:center;gap:8px;font-family:var(--font-head);font-weight:700;font-size:26px;line-height:1.15;letter-spacing:.01em;max-width:46%;overflow-wrap:anywhere;border:2px solid var(--on-accent);border-radius:8px;padding:6px 14px;}
.cd-t-service_ticket .tk-ico{display:block;flex:none;}
.cd-t-service_ticket .tk-ticket{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:14px var(--px) 12px var(--pl);border-bottom:2px solid var(--ink);}
.cd-t-service_ticket .tk-title{display:flex;align-items:center;gap:14px;flex-wrap:wrap;min-width:0;}
.cd-t-service_ticket .cd-title{font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--ink);}
.cd-t-service_ticket .tk-title .cd-status{margin-top:0;border-radius:4px;}
.cd-t-service_ticket .tk-no{flex:none;border:2px solid var(--accent-ink);border-radius:4px;padding:4px 12px;text-align:center;}
.cd-t-service_ticket .tk-no-l{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
.cd-t-service_ticket .tk-no-v{font-family:${MONO};font-size:15px;font-weight:700;color:var(--accent-ink);letter-spacing:.04em;}
.cd-t-service_ticket .tk-form{display:flex;flex-wrap:wrap;align-items:stretch;gap:0;border-top:1.5px solid var(--tk-line);border-left:1.5px solid var(--tk-line);margin-bottom:18px;}
.cd-t-service_ticket .tk-cell{flex:1 1 22%;min-width:0;border-right:1.5px solid var(--tk-line);border-bottom:1.5px solid var(--tk-line);padding:5px 9px 7px;}
.cd-t-service_ticket .tk-cell-wide{flex:2 1 44%;}
.cd-t-service_ticket .tk-cl{font-size:8.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:2px;}
.cd-t-service_ticket .tk-cv{font-size:12px;font-weight:600;overflow-wrap:anywhere;}
.cd-t-service_ticket .cd-party-name{font-size:13.5px;}
.cd-t-service_ticket .cd-lines{color:var(--ink);font-size:11px;}
.cd-t-service_ticket .cd-subject-text{font-size:16px;text-transform:uppercase;letter-spacing:.03em;}
.cd-t-service_ticket .cd-facts{gap:0;border-left:1.5px solid var(--tk-line);align-items:stretch;}
.cd-t-service_ticket .cd-fact{border:0;border-top:1.5px solid var(--tk-line);border-right:1.5px solid var(--tk-line);border-bottom:1.5px solid var(--tk-line);border-radius:0;background:var(--tk-fill);padding:6px 10px;}
.cd-t-service_ticket .cd-fact-label{color:var(--accent-ink);}
.cd-t-service_ticket .cd-fact-value{color:var(--ink);font-size:18px;}
.cd-t-service_ticket .cd-h{font-family:var(--font-head);font-size:12px;letter-spacing:.1em;color:var(--ink);background:var(--tk-fill);border:1.5px solid var(--tk-line);padding:4px 8px;}
.cd-t-service_ticket .cd-section-body,.cd-t-service_ticket .cd-grid-cell .cd-prose,.cd-t-service_ticket .cd-signoff-sec .cd-prose{padding:0 9px;}
.cd-t-service_ticket .cd-table{border:1.5px solid var(--tk-line);}
.cd-t-service_ticket .cd-table th{background:var(--tk-fill);color:var(--ink);font-family:var(--font-head);font-size:10.5px;letter-spacing:.08em;border:1px solid var(--tk-line);padding:7px 9px;}
.cd-t-service_ticket .cd-table td{border:1px solid var(--tk-line);padding:7px 9px;font-size:11.5px;}
.cd-t-service_ticket .tk-summary .cd-totals{flex-basis:280px;border:1.5px solid var(--tk-line);}
.cd-t-service_ticket .cd-tot{padding:6px 10px;border-bottom:1px solid var(--tk-line);}
.cd-t-service_ticket .cd-tot:last-child{border-bottom:0;}
.cd-t-service_ticket .cd-tot-label{color:var(--ink);font-weight:600;text-transform:uppercase;font-size:10.5px;letter-spacing:.05em;padding-top:1px;}
.cd-t-service_ticket .cd-tot-grand{margin:0;border-radius:0;padding:9px 10px;font-size:16px;}
.cd-t-service_ticket .cd-tot-grand .cd-tot-label{color:var(--on-accent);}
.cd-t-service_ticket .cd-tot-balance{margin:0;border-top:1.5px solid var(--tk-line);}
.cd-t-service_ticket .cd-pay-btn{border-radius:4px;text-transform:uppercase;letter-spacing:.06em;}
.cd-t-service_ticket .cd-sig{border:1.5px solid var(--tk-line);padding:6px 10px 8px;}
.cd-t-service_ticket .cd-sig-label{color:var(--accent-ink);}
.cd-t-service_ticket .cd-tag{border-radius:3px;background:var(--tk-fill);color:var(--ink);border:1px solid var(--tk-line);}
.cd-t-service_ticket .cd-footer{border-top:1.5px solid var(--tk-line);padding-top:6px;}
`,
};

export const DESIGNS: DesignDef[] = [
  {
    meta: {
      id: 'atelier', name: 'Atelier', collection: 'new',
      description: 'A centered serif masthead, fine double rules and small-caps labels. Quiet luxury for high-end remodels and interiors.',
      accent: '#3f4a3c', secondary: '#b08d57', paper: '#fdfcf9', headFont: 'cormorant', bodyFont: 'karla',
      tags: ['elegant', 'serif', 'luxury', 'interiors', 'minimal'],
    },
    theme: atelier,
  },
  {
    meta: {
      id: 'sidebar', name: 'Sidebar', collection: 'new',
      description: 'A tinted side column keeps your company details on every page; the document reads cleanly on the right.',
      accent: '#2f4858', secondary: '#f6ae2d', paper: '#ffffff', headFont: 'dm-sans', bodyFont: 'dm-sans',
      tags: ['modern', 'sidebar', 'clean', 'professional'],
    },
    theme: sidebar,
  },
  {
    meta: {
      id: 'site_plan', name: 'Site Plan', collection: 'new',
      description: 'An architectural drawing sheet: faint grid paper, a framed sheet and a title block with sheet numbers. Made for builders.',
      accent: '#1d4e89', secondary: '#c8553d', paper: '#fbfcfe', headFont: 'barlow-condensed', bodyFont: 'barlow', extraFonts: ['ibm-plex-mono'],
      tags: ['blueprint', 'architect', 'construction', 'technical', 'trades'],
    },
    theme: sitePlan,
  },
  {
    meta: {
      id: 'timber', name: 'Timber & Trade', collection: 'new',
      description: 'Warm walnut and honey tones, a stamped badge and sturdy slab-serif headings. Built for carpenters and remodelers.',
      accent: '#6b3e26', secondary: '#d9a441', paper: '#fcf9f4', headFont: 'zilla-slab', bodyFont: 'source-sans',
      tags: ['wood', 'carpentry', 'craftsman', 'warm', 'trades'],
    },
    theme: timber,
  },
  {
    meta: {
      id: 'colorblock', name: 'Color Block', collection: 'new',
      description: 'Two-tone geometric header blocks, heavy sans type and a crisp grid. Modern and confident.',
      accent: '#1d3557', secondary: '#e76f51', paper: '#ffffff', headFont: 'archivo', bodyFont: 'archivo',
      tags: ['modern', 'bold', 'geometric', 'color'],
    },
    theme: colorblock,
  },
  {
    meta: {
      id: 'paper_minimal', name: 'Paper Minimal', collection: 'new',
      description: 'Lots of white space, tiny labels, monospaced figures and a single accent mark. Calm and precise.',
      accent: '#e4572e', secondary: '#9aa0a6', paper: '#ffffff', headFont: 'ibm-plex-sans', bodyFont: 'ibm-plex-sans', extraFonts: ['ibm-plex-mono'],
      tags: ['minimal', 'mono', 'clean', 'modern'],
    },
    theme: paperMinimal,
  },
  {
    meta: {
      id: 'service_ticket', name: 'Service Ticket', collection: 'new',
      description: 'A field-service ticket with your phone number up top and boxed, form-style details. Ideal for plumbing, HVAC and electrical calls.',
      accent: '#b42318', secondary: '#263238', paper: '#ffffff', headFont: 'barlow-condensed', bodyFont: 'barlow',
      tags: ['service', 'plumbing', 'hvac', 'electrical', 'trades', 'work order'],
    },
    theme: serviceTicket,
  },
];
