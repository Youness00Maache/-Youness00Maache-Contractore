/**
 * The Premium designs (2026-11-14 redesign): restrained, legible business documents for the trades, built on the
 * Premium engine (pro.ts) so fonts, header, logo size, table style, spacing and printed sections can be customized.
 * Saved documents that used a retired design id render with its replacement (registry.ts RETIRED_TEMPLATE_MAP).
 *
 * Colors always come from the palette (user accent/secondary or the design defaults), so any accent stays readable.
 */
import { block, lines, metaList, partyBlocks, statusBadge, titleH1, type DesignDef, type RenderCtx } from '../blocks.ts';
import { rgba } from '../kit.ts';
import { contactLine, detailsCol, dueBox, proBrand, proDesign, proDocNo, proLogo } from './pro.ts';

// ------------------------------------------------------------------------------------------- Classic Trade
const classicTrade = proDesign({
  meta: {
    id: 'classic_trade', name: 'Classic Trade', descriptor: 'Serif headings · rule lines',
    description: 'Traditional letterhead with serif headings and double rule lines. Looks right on any invoice or estimate.',
    accent: '#1f3a5f', secondary: '#8a6d3b', paper: '#ffffff', headFont: 'libre-baskerville', bodyFont: 'source-sans', tags: ['classic', 'serif', 'traditional'],
  },
  layout: { header: 'left', table: 'lines', logoSize: 'm', density: 'comfortable' },
  pad: { top: 52, x: 56, bottom: 68 },
  css: () => `
.cd-t-classic_trade{--title-size:25px;--pr-th-top:1px solid var(--ink);--pr-th-rule:1px solid var(--ink);--pr-th-track:.12em;--pr-th-ink:var(--ink);}
.cd-t-classic_trade .pr-hdr{padding-bottom:18px;border-bottom:3px double var(--ink);}
.cd-t-classic_trade .cd-title{font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--ink);}
.cd-t-classic_trade .pr-co{font-size:18px;color:var(--accent-ink);}
.cd-t-classic_trade .cd-label,.cd-t-classic_trade .pr-due-label{color:var(--accent-ink);letter-spacing:.14em;}
.cd-t-classic_trade .cd-party-name{font-family:var(--font-head);font-size:13.5px;}
.cd-t-classic_trade .pr-due{background:transparent;border:1px solid var(--ink);border-left-width:1px;}
.cd-t-classic_trade .pr-due-value{color:var(--ink);font-size:20px;}
.cd-t-classic_trade .cd-tot-grand{background:transparent;color:var(--ink);border-radius:0;border-top:1px solid var(--ink);border-bottom:3px double var(--ink);padding:8px 2px;font-family:var(--font-head);font-size:15px;}
.cd-t-classic_trade .cd-h{color:var(--accent-ink);letter-spacing:.14em;}
.cd-t-classic_trade .cd-pay-btn{border-radius:2px;}
.cd-t-classic_trade .cd-fact{background:transparent;border-color:var(--rule-strong);border-radius:0;}
.cd-t-classic_trade .cd-fact-value{color:var(--ink);}
.cd-t-classic_trade .cd-footer{border-top:1px solid var(--rule-strong);padding-top:7px;justify-content:center;gap:22px;}
`,
});

// --------------------------------------------------------------------------------------- Modern Contractor
const modernContractor = proDesign({
  meta: {
    id: 'modern_contractor', name: 'Modern Contractor', descriptor: 'Bold header band · sans',
    description: 'A strong color band with your logo and the document title, clean sans type and striped rows.',
    accent: '#0f4c81', secondary: '#f2a900', paper: '#ffffff', headFont: 'archivo', bodyFont: 'inter', tags: ['modern', 'band', 'bold'],
  },
  layout: { header: 'band', table: 'striped', logoSize: 'm', density: 'comfortable' },
  pad: { top: 48, x: 50, bottom: 66 },
  css: () => `
.cd-t-modern_contractor{--title-size:34px;}
.cd-t-modern_contractor .cd-title{font-weight:800;text-transform:uppercase;letter-spacing:.02em;}
.cd-t-modern_contractor .pr-co{font-weight:800;}
.cd-t-modern_contractor.cd-o-h-band .pr-hdr{box-shadow:inset 0 -5px 0 var(--secondary);padding-bottom:29px;}
.cd-t-modern_contractor.cd-o-h-left .pr-hdr,.cd-t-modern_contractor.cd-o-h-centered .pr-hdr{padding-bottom:16px;border-bottom:4px solid var(--accent);}
.cd-t-modern_contractor .cd-label{color:var(--accent-ink);}
.cd-t-modern_contractor .pr-due{border-left-width:4px;}
.cd-t-modern_contractor .cd-tot-grand{border-radius:3px;}
.cd-t-modern_contractor .cd-h{font-family:var(--font-head);font-weight:800;color:var(--accent-ink);}
.cd-t-modern_contractor .cd-fact{border-radius:4px;border-left:3px solid var(--accent);}
.cd-t-modern_contractor .cd-footer{border-top:2px solid var(--accent);padding-top:7px;}
`,
});

// ------------------------------------------------------------------------------------------- Blueprint Pro
const blueprintPro = proDesign({
  meta: {
    id: 'blueprint_pro', name: 'Blueprint Pro', descriptor: 'Drawing-sheet title block · faint grid',
    description: 'A light technical grid and a title block like a drawing sheet. Precise without being dark.',
    accent: '#1d4e89', secondary: '#7aa5d6', paper: '#f8fafc', headFont: 'ibm-plex-sans', bodyFont: 'ibm-plex-sans', extraFonts: ['ibm-plex-mono'], tags: ['technical', 'grid', 'engineering'],
  },
  layout: { header: 'left', table: 'boxed', logoSize: 'm', density: 'comfortable' },
  pad: { top: 54, x: 56, bottom: 70, footer: 34 },
  chrome: ({ c }) => `<div class="bp-grid" style="background-image:linear-gradient(${rgba(c.accent, 0.075)} 1px,transparent 1px),linear-gradient(90deg,${rgba(c.accent, 0.075)} 1px,transparent 1px),linear-gradient(${rgba(c.accent, 0.035)} 1px,transparent 1px),linear-gradient(90deg,${rgba(c.accent, 0.035)} 1px,transparent 1px);"></div><div class="bp-frame"></div>`,
  doc: ({ m }, layout) => {
    if (layout !== 'left') return null;
    const cells = [
      `<div class="bp-cell bp-cell-title"><div class="bp-k">Document</div><div class="bp-v">${titleH1(m)}</div></div>`,
      m.number ? `<div class="bp-cell"><div class="bp-k">${m.numberLabel}</div><div class="bp-v bp-mono">${m.number}</div></div>` : '',
      m.status ? `<div class="bp-cell"><div class="bp-k">Status</div><div class="bp-v">${statusBadge(m)}</div></div>` : '',
    ].join('');
    return `<div class="pr-doc bp-tb">${cells}</div>`;
  },
  css: () => `
.cd-t-blueprint_pro{--title-size:22px;--font-label:'IBM Plex Mono','Courier New',monospace;--pr-box:var(--accent-line);--pr-box-th:var(--accent-tint);--pr-box-th-ink:var(--accent-ink);--pr-th-bg:var(--accent);--pr-th-rule:1.5px solid var(--accent);--pr-th-ink:var(--accent-ink);--pr-th-track:.06em;--pr-th-size:9px;}
.cd-t-blueprint_pro .bp-grid{position:absolute;left:24px;top:24px;right:24px;bottom:24px;background-size:20px 20px,20px 20px,4px 4px,4px 4px;}
.cd-t-blueprint_pro .bp-frame{position:absolute;left:24px;top:24px;right:24px;bottom:24px;border:1.5px solid var(--accent-line);}
.cd-t-blueprint_pro .pr-hdr{padding-bottom:16px;border-bottom:1.5px solid var(--accent);}
.cd-t-blueprint_pro .pr-co{color:var(--accent-ink);font-weight:600;}
.cd-t-blueprint_pro .cd-title{font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--accent-ink);}
.cd-t-blueprint_pro .bp-tb{display:grid;grid-template-columns:auto auto;border:1.5px solid var(--accent);background:var(--paper);text-align:left;min-width:250px;}
.cd-t-blueprint_pro .bp-cell{padding:6px 10px;border-right:1px solid var(--accent-line);border-bottom:1px solid var(--accent-line);min-width:0;}
.cd-t-blueprint_pro .bp-cell:nth-child(2n){border-right:0;}
.cd-t-blueprint_pro .bp-cell-title{grid-column:1 / -1;border-right:0;}
.cd-t-blueprint_pro .bp-k{font-family:var(--font-label);font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.cd-t-blueprint_pro .bp-v{font-size:12px;font-weight:600;color:var(--ink);margin-top:1px;overflow-wrap:anywhere;}
.cd-t-blueprint_pro .bp-mono{font-family:var(--font-label);font-weight:500;}
.cd-t-blueprint_pro .bp-v .cd-status{margin-top:0;}
.cd-t-blueprint_pro .cd-label{color:var(--accent-ink);letter-spacing:.08em;}
.cd-t-blueprint_pro .pr-due{background:var(--paper);border:1.5px solid var(--accent);text-align:left;}
.cd-t-blueprint_pro .pr-due-value{font-family:var(--font-label);font-weight:600;font-size:19px;}
.cd-t-blueprint_pro .cd-party-meta,.cd-t-blueprint_pro .cd-party{background:transparent;}
.cd-t-blueprint_pro .cd-num{font-family:var(--font-label);}
.cd-t-blueprint_pro.cd-o-f .cd-num{font-family:inherit;}
.cd-t-blueprint_pro .cd-tot-grand{background:var(--paper);color:var(--accent-ink);border:1.5px solid var(--accent);border-radius:0;}
.cd-t-blueprint_pro .cd-h{color:var(--accent-ink);letter-spacing:.08em;}
.cd-t-blueprint_pro .cd-fact{background:var(--paper);border-color:var(--accent-line);border-radius:0;}
.cd-t-blueprint_pro .cd-pay-btn{border-radius:0;}
.cd-t-blueprint_pro .cd-footer{font-family:var(--font-label);font-size:8.5px;border-top:1px solid var(--accent-line);padding-top:6px;}
`,
});

// ----------------------------------------------------------------------------------------------- Executive
const executive = proDesign({
  meta: {
    id: 'executive', name: 'Executive', descriptor: 'Refined serif · lots of white space',
    description: 'Quiet, refined typography with generous margins and hairline rules. For high-end remodels and custom work.',
    accent: '#2b3a4a', secondary: '#a07d4f', paper: '#ffffff', headFont: 'cormorant', bodyFont: 'inter', tags: ['executive', 'refined', 'serif'],
  },
  layout: { header: 'left', table: 'lines', logoSize: 's', density: 'comfortable' },
  pad: { top: 72, x: 74, bottom: 82, footer: 36 },
  css: () => `
.cd-t-executive{--title-size:38px;--pr-th-rule:1px solid var(--ink);--pr-th-track:.16em;--pr-th-size:8.5px;--pr-th-weight:600;--pr-th-ink:var(--muted);--pr-gap:26px;}
.cd-t-executive .pr-hdr{padding-bottom:26px;border-bottom:1px solid var(--secondary);}
.cd-t-executive .pr-co{font-family:var(--font-body);font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;}
.cd-t-executive .pr-co-lines{font-size:10px;}
.cd-t-executive .cd-title{font-weight:600;letter-spacing:.01em;color:var(--ink);line-height:.95;}
.cd-t-executive .cd-docno{font-size:11px;letter-spacing:.04em;}
.cd-t-executive .cd-label,.cd-t-executive .pr-due-label{font-size:8.5px;font-weight:600;letter-spacing:.18em;}
.cd-t-executive .cd-party-name{font-weight:600;font-size:13px;}
.cd-t-executive .pr-due{background:transparent;border-left:1px solid var(--rule-strong);padding:2px 0 2px 22px;}
.cd-t-executive .pr-due-value{font-size:28px;font-weight:600;color:var(--ink);}
.cd-t-executive .cd-meta-row{border-bottom-color:transparent;}
.cd-t-executive .cd-tot-grand{background:transparent;color:var(--ink);border-radius:0;border-top:1px solid var(--ink);margin-top:8px;padding:10px 2px 0;}
.cd-t-executive .cd-tot-grand .cd-tot-label{font-size:9px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;align-self:center;}
.cd-t-executive .cd-tot-grand .cd-tot-value{font-family:var(--font-head);font-size:24px;font-weight:600;}
.cd-t-executive .cd-h{font-family:var(--font-body);font-size:9px;font-weight:600;letter-spacing:.2em;color:var(--secondary-ink);}
.cd-t-executive .cd-pay-btn{background:var(--ink);color:var(--paper);border-radius:0;letter-spacing:.06em;}
.cd-t-executive .cd-fact{background:transparent;border:0;border-top:1px solid var(--rule-strong);border-radius:0;padding:8px 0;}
.cd-t-executive .cd-fact-value{font-weight:600;color:var(--ink);}
.cd-t-executive .cd-footer{justify-content:center;gap:24px;letter-spacing:.06em;}
`,
});

// --------------------------------------------------------------------------------------------- Field Ready
const fieldReady = proDesign({
  meta: {
    id: 'field_ready', name: 'Field Ready', descriptor: 'Large type · big totals · high contrast',
    description: 'Big, high-contrast type and a large total that reads at arm’s length. Built for work orders and service calls.',
    accent: '#c2410c', secondary: '#1f2937', paper: '#ffffff', headFont: 'barlow-condensed', bodyFont: 'barlow', tags: ['legible', 'service', 'bold'],
  },
  layout: { header: 'left', table: 'boxed', logoSize: 'm', density: 'comfortable' },
  pad: { top: 48, x: 48, bottom: 66 },
  css: ({ c }) => `
.cd-t-field_ready{--pr-fs:13.5px;--pr-td-fs:13px;--title-size:42px;--muted:${c.ink};--pr-cell-y:10px;--pr-box:#6b7280;--pr-box-th:var(--secondary);--pr-box-th-ink:var(--on-secondary);--pr-th-bg:var(--secondary);--pr-th-on:var(--on-secondary);--pr-th-size:10.5px;--pr-th-rule:2px solid var(--ink);}
.cd-t-field_ready.cd-o-d-compact{--pr-fs:12.5px;--pr-td-fs:12px;--pr-cell-y:6px;}
.cd-t-field_ready .cd-lines{color:var(--ink);}
.cd-t-field_ready .pr-hdr{padding-bottom:14px;border-bottom:5px solid var(--ink);}
.cd-t-field_ready.cd-o-h-band .pr-hdr{border-bottom:0;}
.cd-t-field_ready .cd-title{font-weight:700;text-transform:uppercase;letter-spacing:.02em;}
.cd-t-field_ready .pr-co{font-size:20px;}
.cd-t-field_ready .cd-docno{font-size:16px;}
.cd-t-field_ready .cd-label,.cd-t-field_ready .pr-due-label{font-size:10.5px;font-weight:700;color:var(--ink);letter-spacing:.08em;}
.cd-t-field_ready .cd-party-name{font-size:15.5px;}
.cd-t-field_ready .cd-meta-row{font-size:12.5px;border-bottom:1px solid var(--rule-strong);}
.cd-t-field_ready .pr-due{background:transparent;border:3px solid var(--ink);padding:10px 16px;}
.cd-t-field_ready .pr-due-value{font-size:30px;color:var(--ink);}
.cd-t-field_ready .pr-due-sub{color:var(--accent-ink);font-weight:700;font-size:12px;}
.cd-t-field_ready .cd-tot{font-size:13.5px;}
.cd-t-field_ready .cd-tot-label{color:var(--ink);}
.cd-t-field_ready .cd-tot-grand{background:transparent;color:var(--ink);border:3px solid var(--ink);border-radius:0;font-family:var(--font-head);font-size:24px;padding:8px 12px;}
.cd-t-field_ready .cd-h{font-family:var(--font-head);font-size:14px;letter-spacing:.06em;color:var(--ink);border-left:5px solid var(--accent);padding-left:8px;}
.cd-t-field_ready .cd-fact{background:transparent;border:2px solid var(--ink);border-radius:0;}
.cd-t-field_ready .cd-fact-value{font-size:21px;color:var(--ink);}
.cd-t-field_ready .cd-sig-line{border-top-width:2px;}
.cd-t-field_ready .cd-sig-label{color:var(--ink);font-size:10.5px;}
.cd-t-field_ready .cd-pay-btn{font-size:14px;padding:11px 20px;border-radius:4px;}
.cd-t-field_ready .cd-prose{font-size:13px;}
.cd-t-field_ready .cd-footer{font-size:10px;border-top:2px solid var(--ink);padding-top:6px;}
`,
});

// ----------------------------------------------------------------------------------------------- Corporate
const SIDE = 200;
const corporate = proDesign({
  meta: {
    id: 'corporate', name: 'Corporate', descriptor: 'Two-tone sidebar · clean sans',
    description: 'Your company and the document details in a two-tone sidebar; the work and totals get the full page.',
    accent: '#1e3a5f', secondary: '#5b7fa6', paper: '#ffffff', headFont: 'manrope', bodyFont: 'inter', tags: ['corporate', 'sidebar', 'two-tone'],
  },
  layout: { header: 'left', table: 'striped', logoSize: 'm', density: 'comfortable' },
  side: SIDE,
  pad: { top: 52, x: 46, left: 36, bottom: 66 },
  details: false,
  brand: () => '',
  chrome: ({ m }) => {
    const top = `${proLogo(m, true)}${m.company.name ? `<div class="co-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="co-tag">${m.company.tagline}</div>` : ''}`;
    const contact = m.company.lines.length ? `<div class="co-contact">${m.company.lines.map((l) => `<div>${l}</div>`).join('')}</div>` : '';
    const details = m.meta.length ? `<div class="cd-first-only co-meta">${m.meta.map((i) => `<div class="co-mi"><div class="co-ml">${i.label}</div><div class="co-mv">${i.value}</div></div>`).join('')}</div>` : '';
    return `<div class="co-side"><div class="co-top">${top}</div><div class="co-rest">${contact}${details}</div></div>`;
  },
  css: () => `
.cd-t-corporate{--title-size:32px;--pr-th-bg:var(--accent);}
.cd-t-corporate .co-side{position:absolute;left:0;top:0;bottom:0;width:${SIDE}px;background:var(--accent-soft);border-right:1px solid var(--accent-tint);}
.cd-t-corporate .co-top{background:var(--accent);color:var(--on-accent);padding:44px 22px 22px 24px;min-height:150px;}
.cd-t-corporate .co-top .pr-logo{margin-bottom:12px;}
.cd-t-corporate .co-top .cd-logo{max-width:min(var(--pr-logo-w), 150px);}
.cd-t-corporate .co-name{font-family:var(--font-head);font-weight:800;font-size:16px;line-height:1.25;overflow-wrap:anywhere;}
.cd-t-corporate .co-tag{font-size:10px;opacity:.85;margin-top:3px;}
.cd-t-corporate .co-rest{padding:20px 22px 30px 24px;}
.cd-t-corporate .co-contact{font-size:10px;line-height:1.65;color:var(--ink);overflow-wrap:anywhere;}
.cd-t-corporate .co-meta{margin-top:20px;padding-top:14px;border-top:1px solid var(--accent-line);}
.cd-t-corporate .co-mi{margin-bottom:10px;}
.cd-t-corporate .co-ml{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-ink);}
.cd-t-corporate .co-mv{font-size:11px;font-weight:600;line-height:1.4;color:var(--ink);overflow-wrap:anywhere;}
.cd-t-corporate.cd-o-h-left .pr-hdr{justify-content:flex-start;}
.cd-t-corporate.cd-o-h-left .pr-doc{text-align:left;max-width:100%;}
.cd-t-corporate .pr-hdr{padding-bottom:16px;border-bottom:2px solid var(--accent);}
.cd-t-corporate.cd-o-h-band .pr-hdr{border-bottom:0;}
.cd-t-corporate .cd-title{font-weight:800;letter-spacing:-.01em;color:var(--accent-ink);}
.cd-t-corporate.cd-o-h-band .cd-title{color:var(--on-accent);}
.cd-t-corporate .cd-label{color:var(--accent-ink);}
.cd-t-corporate .pr-parties{justify-content:space-between;}
.cd-t-corporate .pr-due{border-radius:0 6px 6px 0;}
.cd-t-corporate .cd-tot-grand{border-radius:4px;}
.cd-t-corporate .cd-h{color:var(--accent-ink);}
.cd-t-corporate .cd-fact{border-radius:6px;}
`,
});

// ----------------------------------------------------------------------------------------------- Craftsman
const craftsman = proDesign({
  meta: {
    id: 'craftsman', name: 'Craftsman', descriptor: 'Warm paper · walnut slab-serif',
    description: 'Warm off-white paper, walnut and oak tones and a sturdy slab serif. For carpenters, cabinet makers and remodelers.',
    accent: '#6b4423', secondary: '#b98b5e', paper: '#fbf8f2', headFont: 'zilla-slab', bodyFont: 'source-sans', tags: ['warm', 'wood', 'craft'],
  },
  layout: { header: 'centered', table: 'lines', logoSize: 'm', density: 'comfortable' },
  pad: { top: 52, x: 58, bottom: 70, footer: 30 },
  chrome: () => '<div class="cr-top"></div><div class="cr-bottom"></div>',
  css: () => `
.cd-t-craftsman{--title-size:24px;--pr-th-rule:2px solid var(--accent);--pr-th-ink:var(--accent-ink);--pr-th-track:.12em;--pr-th-bg:var(--accent);--pr-box:var(--secondary-soft);--pr-box-th:var(--accent-soft);--pr-stripe:var(--secondary-soft);}
.cd-t-craftsman .cr-top{position:absolute;left:0;right:0;top:0;height:6px;background:var(--accent);box-shadow:0 3px 0 var(--secondary);}
.cd-t-craftsman .cr-bottom{position:absolute;left:0;right:0;bottom:0;height:6px;background:var(--accent);}
.cd-t-craftsman .pr-co{font-size:22px;font-weight:600;color:var(--accent-ink);letter-spacing:.01em;}
.cd-t-craftsman.cd-o-h-centered .pr-co{font-size:24px;}
.cd-t-craftsman .pr-tb-rule{border-top:3px double var(--secondary);}
.cd-t-craftsman .cd-title{font-weight:600;text-transform:uppercase;letter-spacing:.22em;color:var(--accent-ink);}
.cd-t-craftsman.cd-o-h-left .pr-hdr{padding-bottom:16px;border-bottom:3px double var(--secondary);}
.cd-t-craftsman .cd-label,.cd-t-craftsman .pr-due-label{font-family:var(--font-head);font-size:10.5px;font-weight:600;color:var(--accent-ink);letter-spacing:.12em;}
.cd-t-craftsman .cd-party-name{font-family:var(--font-head);font-size:15px;font-weight:600;}
.cd-t-craftsman .pr-due{background:var(--secondary-soft);border-left:0;border-radius:4px;}
.cd-t-craftsman .pr-due-value{color:var(--accent-ink);}
.cd-t-craftsman .cd-tot-grand{border-radius:3px;font-family:var(--font-head);font-weight:600;}
.cd-t-craftsman .cd-h{font-family:var(--font-head);font-size:12px;font-weight:600;letter-spacing:.12em;}
.cd-t-craftsman .cd-fact{background:var(--secondary-soft);border:0;border-radius:4px;}
.cd-t-craftsman .cd-pay-btn{border-radius:3px;}
.cd-t-craftsman .cd-footer{justify-content:center;gap:22px;}
`,
});

// -------------------------------------------------------------------------------------------- Minimal Line
const minimalLine = proDesign({
  meta: {
    id: 'minimal_line', name: 'Minimal Line', descriptor: 'Monochrome · hairlines · lots of air',
    description: 'Black on white, hairline rules and nothing else. Modern and calm.',
    accent: '#111827', secondary: '#9ca3af', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['minimal', 'monochrome', 'clean'],
  },
  layout: { header: 'left', table: 'lines', logoSize: 's', density: 'comfortable' },
  pad: { top: 62, x: 64, bottom: 74, footer: 32 },
  css: () => `
.cd-t-minimal_line{--title-size:30px;--pr-th-rule:1px solid var(--ink);--pr-th-weight:500;--pr-th-ink:var(--muted);--pr-th-track:.1em;--pr-th-size:9px;--pr-th-bg:var(--ink);--pr-stripe:#f5f5f5;--pr-gap:26px;}
.cd-t-minimal_line .pr-hdr{padding-bottom:4px;}
.cd-t-minimal_line .cd-title{font-weight:500;letter-spacing:-.015em;color:var(--ink);}
.cd-t-minimal_line .pr-co{font-weight:600;font-size:15px;}
.cd-t-minimal_line .cd-label,.cd-t-minimal_line .pr-due-label{font-weight:500;letter-spacing:.1em;}
.cd-t-minimal_line .cd-party-name{font-weight:600;font-size:13px;}
.cd-t-minimal_line .cd-meta-row{border-bottom-color:var(--rule);}
.cd-t-minimal_line .pr-due{background:transparent;border-left:1px solid var(--ink);padding:0 0 0 18px;}
.cd-t-minimal_line .pr-due-value{font-weight:600;font-size:24px;color:var(--accent-ink);letter-spacing:-.01em;}
.cd-t-minimal_line .cd-tot-grand{background:transparent;color:var(--ink);border-radius:0;border-top:1px solid var(--ink);padding:10px 2px 0;font-size:16px;font-weight:600;}
.cd-t-minimal_line .cd-h{font-size:9.5px;font-weight:600;letter-spacing:.12em;color:var(--ink);}
.cd-t-minimal_line .cd-pay-btn{background:var(--ink);color:#ffffff;border-radius:999px;}
.cd-t-minimal_line .cd-fact{background:transparent;border:1px solid var(--rule-strong);border-radius:0;}
.cd-t-minimal_line .cd-fact-value{color:var(--ink);font-weight:600;}
.cd-t-minimal_line .cd-footer{border-top:1px solid var(--rule);padding-top:7px;}
`,
});

// ---------------------------------------------------------------------------------------------- Bold Block
const boldBlock = proDesign({
  meta: {
    id: 'bold_block', name: 'Bold Block', descriptor: 'Solid title block · strong totals',
    description: 'A solid block with the title and the amount due, a strong table and a total nobody misses.',
    accent: '#1f2937', secondary: '#f2b705', paper: '#ffffff', headFont: 'archivo', bodyFont: 'inter', tags: ['bold', 'block', 'construction'],
  },
  layout: { header: 'left', table: 'striped', logoSize: 'm', density: 'comfortable' },
  pad: { top: 48, x: 50, bottom: 66 },
  due: false,
  doc: ({ m }, layout) => {
    if (layout !== 'left') return null;
    const due = m.highlight ? `<div class="bb-due"><div class="bb-due-l">${m.highlight.label}</div><div class="bb-due-v cd-num">${m.highlight.value}</div>${m.keyDate && m.keyDate.label !== m.highlight.label ? `<div class="bb-due-s">${m.keyDate.label} ${m.keyDate.value}</div>` : ''}</div>` : '';
    return `<div class="pr-doc bb-block">${titleH1(m)}${proDocNo(m)}${statusBadge(m)}${due}</div>`;
  },
  parties: (ctx) => {
    if (ctx.o?.header === 'left') return null;
    const { m } = ctx;
    const cols = `${partyBlocks(m)}${detailsCol(m)}${dueBox(m)}`;
    return cols ? block('cd-parties pr-parties', cols) : '';
  },
  css: () => `
.cd-t-bold_block{--title-size:40px;--pr-th-bg:var(--accent);--pr-th-rule:3px solid var(--accent);}
.cd-t-bold_block .cd-title{font-weight:800;text-transform:uppercase;letter-spacing:-.005em;}
.cd-t-bold_block .pr-co{font-weight:800;font-size:19px;}
.cd-t-bold_block.cd-o-h-left .pr-hdr{align-items:stretch;}
.cd-t-bold_block .bb-block{margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 0 0;padding:calc(var(--pt) - 6px) var(--px) 20px 28px;background:var(--accent);color:var(--on-accent);text-align:left !important;min-width:300px;}
.cd-t-bold_block .bb-block .cd-title,.cd-t-bold_block .bb-block .cd-docno,.cd-t-bold_block .bb-block .cd-docno-label,.cd-t-bold_block .bb-block .cd-status{color:var(--on-accent);}
.cd-t-bold_block .bb-block .cd-docno-label{opacity:.8;}
.cd-t-bold_block .bb-due{margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.28);}
.cd-t-bold_block .bb-due-l{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.85;}
.cd-t-bold_block .bb-due-v{font-family:var(--font-head);font-size:28px;font-weight:800;line-height:1.15;color:var(--secondary);white-space:normal;overflow-wrap:anywhere;}
.cd-t-bold_block .bb-due-s{font-size:10.5px;margin-top:2px;opacity:.9;}
.cd-t-bold_block .cd-label{color:var(--ink);font-weight:800;}
.cd-t-bold_block .pr-due{border-left-color:var(--secondary);border-left-width:5px;}
.cd-t-bold_block .cd-tot-grand{background:var(--secondary);color:var(--on-secondary);border-radius:0;font-family:var(--font-head);font-size:17px;}
.cd-t-bold_block .cd-h{font-family:var(--font-head);font-size:12px;color:var(--ink);letter-spacing:.08em;padding-bottom:4px;border-bottom:3px solid var(--secondary);display:inline-block;}
.cd-t-bold_block .cd-fact{border-radius:0;border:0;border-left:5px solid var(--secondary);background:var(--accent-soft);}
.cd-t-bold_block .cd-pay-btn{border-radius:0;}
.cd-t-bold_block .cd-footer{border-top:3px solid var(--accent);padding-top:6px;}
`,
});

// ------------------------------------------------------------------------------------------------- Heritage
const heritage = proDesign({
  meta: {
    id: 'heritage', name: 'Heritage', descriptor: 'Letterpress serif · framed page',
    description: 'Centered serif type, small caps and a fine double frame, like a printed letterpress form.',
    accent: '#7b2d26', secondary: '#b08d57', paper: '#f8f4ec', headFont: 'garamond', bodyFont: 'lora', tags: ['heritage', 'letterpress', 'serif'],
  },
  layout: { header: 'centered', table: 'lines', logoSize: 'm', density: 'comfortable' },
  ink: '#2b2420',
  pad: { top: 58, x: 62, bottom: 76, footer: 38 },
  chrome: () => '<div class="he-frame"></div>',
  css: () => `
.cd-t-heritage{--title-size:28px;--pr-th-top:1px solid var(--ink);--pr-th-rule:1px solid var(--ink);--pr-th-case:none;--pr-th-track:.12em;--pr-th-weight:600;--pr-th-size:11px;--pr-stripe:var(--secondary-soft);--pr-box-th:var(--secondary-soft);}
.cd-t-heritage .he-frame{position:absolute;left:22px;top:22px;right:22px;bottom:22px;border:3px double var(--rule-strong);}
.cd-t-heritage .cd-table th{font-variant:small-caps;}
.cd-t-heritage .pr-co{font-size:24px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;}
.cd-t-heritage .pr-tag{font-style:italic;font-size:11.5px;}
.cd-t-heritage .pr-co-lines{font-style:italic;}
.cd-t-heritage .pr-tb-rule{border-top:1px solid var(--ink);}
.cd-t-heritage .cd-title{font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:var(--accent-ink);}
.cd-t-heritage.cd-o-h-left .pr-hdr{padding-bottom:16px;border-bottom:1px solid var(--ink);}
.cd-t-heritage .cd-docno{font-style:italic;}
.cd-t-heritage .cd-label,.cd-t-heritage .pr-due-label{font-family:var(--font-head);font-size:12px;font-weight:600;text-transform:none;font-variant:small-caps;letter-spacing:.12em;color:var(--accent-ink);}
.cd-t-heritage .cd-party-name{font-family:var(--font-head);font-size:16px;font-weight:600;}
.cd-t-heritage .pr-due{background:transparent;border:1px solid var(--ink);text-align:center;}
.cd-t-heritage .pr-due-value{font-size:22px;color:var(--ink);}
.cd-t-heritage .cd-tot-grand{background:transparent;color:var(--ink);border-radius:0;border-top:1px solid var(--ink);border-bottom:3px double var(--ink);font-family:var(--font-head);font-size:17px;padding:7px 2px;}
.cd-t-heritage .cd-h{font-family:var(--font-head);font-size:13px;font-weight:600;text-transform:none;font-variant:small-caps;letter-spacing:.14em;}
.cd-t-heritage .cd-fact{background:transparent;border:1px solid var(--rule-strong);border-radius:0;text-align:center;}
.cd-t-heritage .cd-pay-btn{border-radius:0;}
.cd-t-heritage .cd-footer{justify-content:center;gap:22px;font-style:italic;}
`,
});

// ---------------------------------------------------------------------------------------------------- Slate
const slate = proDesign({
  meta: {
    id: 'slate', name: 'Slate', descriptor: 'Charcoal band · accent stripe',
    description: 'A charcoal header with a thin accent stripe and crisp sans type. Electricians, HVAC and service companies.',
    accent: '#2563eb', secondary: '#263238', paper: '#ffffff', headFont: 'archivo', bodyFont: 'inter', tags: ['charcoal', 'band', 'service'],
  },
  layout: { header: 'band', table: 'lines', logoSize: 'm', density: 'comfortable' },
  pad: { top: 48, x: 52, bottom: 66 },
  css: () => `
.cd-t-slate{--title-size:32px;--pr-band:var(--secondary);--pr-on-band:var(--on-secondary);--pr-th-rule:2px solid var(--secondary);--pr-th-ink:var(--secondary-ink);--pr-th-bg:var(--secondary);--pr-th-on:var(--on-secondary);--pr-box-th:var(--secondary-soft);}
.cd-t-slate .cd-title{font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
.cd-t-slate .pr-co{font-weight:700;}
.cd-t-slate.cd-o-h-band .pr-hdr{box-shadow:inset 0 -4px 0 var(--accent);padding-bottom:28px;}
.cd-t-slate.cd-o-h-left .pr-hdr,.cd-t-slate.cd-o-h-centered .pr-hdr{padding-bottom:16px;border-bottom:4px solid var(--accent);}
.cd-t-slate .cd-label{color:var(--secondary-ink);}
.cd-t-slate .pr-due{background:var(--secondary-soft);border-left:4px solid var(--accent);}
.cd-t-slate .pr-due-value{color:var(--ink);}
.cd-t-slate .cd-tot-grand{background:var(--secondary);color:var(--on-secondary);border-radius:2px;box-shadow:inset 4px 0 0 var(--accent);}
.cd-t-slate .cd-h{color:var(--accent-ink);}
.cd-t-slate .cd-fact{background:var(--secondary-soft);border:0;border-top:3px solid var(--accent);border-radius:0;}
.cd-t-slate .cd-fact-value{color:var(--ink);}
.cd-t-slate .cd-pay-btn{border-radius:2px;}
.cd-t-slate .cd-footer{border-top:1px solid var(--rule-strong);padding-top:7px;}
`,
});

// ------------------------------------------------------------------------------------------------- Proposal
const proposal = proDesign({
  meta: {
    id: 'proposal', name: 'Proposal', descriptor: 'Prepared for / by · soft serif',
    description: 'Reads like a proposal: who it is prepared for and by, the project, then the scope and price. Great for estimates.',
    accent: '#1f5f4a', secondary: '#c9a96e', paper: '#ffffff', headFont: 'fraunces', bodyFont: 'inter', tags: ['proposal', 'estimate', 'serif'],
  },
  layout: { header: 'left', table: 'lines', logoSize: 'm', density: 'comfortable' },
  pad: { top: 54, x: 58, bottom: 68 },
  fromParty: (m) => (/^(estimate|changeOrder|workOrder|warranty)$/.test(m.kind) ? 'Prepared by' : 'From'),
  css: () => `
.cd-t-proposal{--title-size:36px;--pr-th-rule:1.5px solid var(--accent);--pr-th-ink:var(--accent-ink);--pr-th-bg:var(--accent);--pr-stripe:var(--accent-soft);}
.cd-t-proposal .pr-hdr{padding-bottom:6px;}
.cd-t-proposal .cd-title{font-weight:600;letter-spacing:-.01em;color:var(--accent-ink);}
.cd-t-proposal .pr-co{font-family:var(--font-head);font-weight:600;font-size:18px;}
.cd-t-proposal .pr-parties{border-top:2px solid var(--accent);padding-top:14px;}
.cd-t-proposal .cd-label{color:var(--accent-ink);}
.cd-t-proposal .cd-party-name{font-family:var(--font-head);font-size:14.5px;font-weight:600;}
.cd-t-proposal .pr-due{background:var(--accent-soft);border-left:0;border-top:3px solid var(--secondary);text-align:left;}
.cd-t-proposal .pr-due-value{font-weight:600;}
.cd-t-proposal .cd-before .cd-h,.cd-t-proposal .cd-section .cd-h{font-family:var(--font-head);font-size:15px;font-weight:600;text-transform:none;letter-spacing:0;color:var(--accent-ink);}
.cd-t-proposal .cd-tot-grand{background:transparent;color:var(--accent-ink);border-radius:0;border-top:2px solid var(--accent);padding:9px 2px 0;font-family:var(--font-head);font-size:18px;}
.cd-t-proposal .cd-fact{border-radius:6px;}
.cd-t-proposal .cd-pay-btn{border-radius:6px;}
.cd-t-proposal .cd-footer{border-top:1px solid var(--rule);padding-top:7px;}
`,
});

// --------------------------------------------------------------------------------------------- Studio Grid
const studioHeader = (ctx: RenderCtx) => {
  const { m } = ctx;
  const cells = [
    m.company.logoUrl || m.company.name ? `<div class="st-cell st-brand">${proLogo(m)}${m.company.name ? `<div class="pr-co">${m.company.name}</div>` : ''}</div>` : '',
    m.company.addressLines.length ? `<div class="st-cell">${m.company.addressLines.map((l) => `<div>${l}</div>`).join('')}</div>` : '',
    contactLine(m) ? `<div class="st-cell">${[m.company.phone, m.company.email, m.company.website].filter(Boolean).map((l) => `<div>${l}</div>`).join('')}</div>` : '',
  ].join('');
  const top = cells ? `<div class="st-top">${cells}</div>` : '';
  return block('cd-hdr pr-hdr st-hdr', `${top}<div class="pr-doc st-doc"><span class="st-mark"></span>${titleH1(ctx.m)}<div class="st-docmeta">${proDocNo(m)}${statusBadge(m)}</div></div>`);
};
const studio = proDesign({
  meta: {
    id: 'studio', name: 'Studio Grid', descriptor: 'Swiss grid · hanging labels',
    description: 'A large title, a strict grid and labels hanging in the left column. For design-build and architects.',
    accent: '#d92d20', secondary: '#111111', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['swiss', 'grid', 'architect'],
  },
  layout: { header: 'left', table: 'lines', logoSize: 's', density: 'comfortable' },
  pad: { top: 52, x: 56, bottom: 68 },
  header: (ctx, layout) => (layout === 'left' ? studioHeader(ctx) : null),
  parties: ({ m }) => {
    const rows = [
      ...m.parties.map((p) => `<div class="st-row"><div class="cd-label st-k">${p.label}</div><div class="st-v">${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div></div>`),
      m.meta.length ? `<div class="st-row"><div class="cd-label st-k">Details</div><div class="st-v">${metaList(m)}</div></div>` : '',
      m.highlight ? `<div class="st-row st-row-due"><div class="cd-label st-k">${m.highlight.label}</div><div class="st-v"><div class="pr-due-value cd-num">${m.highlight.value}</div>${m.keyDate && m.keyDate.label !== m.highlight.label ? `<div class="pr-due-sub">${m.keyDate.label} ${m.keyDate.value}</div>` : ''}</div></div>` : '',
    ].join('');
    return rows ? block('cd-parties st-parties', rows) : '';
  },
  css: () => `
.cd-t-studio{--title-size:54px;--pr-th-top:2px solid var(--ink);--pr-th-rule:1px solid var(--ink);--pr-th-weight:600;--pr-th-track:.04em;--pr-th-bg:var(--ink);--pr-stripe:#f4f4f4;}
.cd-t-studio .st-top{display:flex;gap:24px;padding-bottom:12px;border-bottom:2px solid var(--ink);margin-bottom:26px;font-size:10.5px;line-height:1.5;}
.cd-t-studio .st-cell{flex:1 1 0;min-width:0;overflow-wrap:anywhere;}
.cd-t-studio .st-brand{flex:1.3 1 0;}
.cd-t-studio .st-brand .pr-logo{margin-bottom:6px;}
.cd-t-studio .pr-co{font-size:13px;font-weight:700;}
.cd-t-studio.cd-o-h-left .st-hdr{display:block;}
.cd-t-studio .st-doc{text-align:left;max-width:none;position:relative;}
.cd-t-studio .st-mark{display:block;width:12px;height:12px;background:var(--accent);margin-bottom:12px;}
.cd-t-studio .cd-title{font-weight:800;letter-spacing:-.035em;line-height:.95;color:var(--ink);}
.cd-t-studio .st-docmeta{display:flex;align-items:center;gap:14px;margin-top:10px;}
.cd-t-studio .st-docmeta .cd-docno,.cd-t-studio .st-docmeta .cd-status{margin-top:0;}
.cd-t-studio .st-parties{display:block;border-top:1px solid var(--ink);}
.cd-t-studio .st-row{display:flex;gap:24px;padding:10px 0;border-bottom:1px solid var(--rule-strong);}
.cd-t-studio .st-k{flex:0 0 26%;margin:2px 0 0;color:var(--ink);}
.cd-t-studio .st-v{flex:1 1 auto;min-width:0;}
.cd-t-studio .st-v .cd-meta{max-width:360px;}
.cd-t-studio .st-row-due .pr-due-value{font-family:var(--font-head);font-size:24px;font-weight:700;color:var(--ink);text-align:left;}
.cd-t-studio .st-row-due .pr-due-sub{font-size:10.5px;color:var(--muted);}
.cd-t-studio .pr-due{background:transparent;border-left:3px solid var(--accent);}
.cd-t-studio .pr-due-value{color:var(--ink);}
.cd-t-studio .cd-tot-grand{background:transparent;color:var(--ink);border-radius:0;border-top:2px solid var(--ink);padding:10px 2px 0;font-size:16px;}
.cd-t-studio .cd-tot-grand .cd-tot-value{color:var(--accent-ink);}
.cd-t-studio .cd-h{font-size:10px;letter-spacing:.06em;color:var(--ink);}
.cd-t-studio .cd-pay-btn{background:var(--ink);color:#ffffff;border-radius:0;}
.cd-t-studio .cd-fact{background:transparent;border:0;border-top:2px solid var(--ink);border-radius:0;padding:8px 0;}
.cd-t-studio .cd-fact-value{color:var(--ink);}
.cd-t-studio .cd-footer{border-top:1px solid var(--ink);padding-top:7px;}
`,
});

// ----------------------------------------------------------------------------------------------- Letterhead
const letterheadHeader = (ctx: RenderCtx) => {
  const { m } = ctx;
  const brand = proBrand(ctx, 'left', { lines: [] });
  const contact = m.company.lines.length ? `<div class="lh-contact">${m.company.lines.map((l) => `<div>${l}</div>`).join('')}</div>` : '';
  const top = brand || contact ? `<div class="lh-top">${brand}${contact}</div>` : '';
  return block('cd-hdr pr-hdr lh-hdr', `${top}<div class="pr-doc lh-doc"><div class="lh-titleline">${titleH1(m)}${proDocNo(m)}</div>${statusBadge(m)}</div>`);
};
const letterhead = proDesign({
  meta: {
    id: 'letterhead', name: 'Letterhead', descriptor: 'Company letterhead · margin rule',
    description: 'Looks like your own company letterhead, with a fine margin rule. Ideal for warranties, notes and change orders.',
    accent: '#24476b', secondary: '#c0cad6', paper: '#ffffff', headFont: 'merriweather', bodyFont: 'source-sans', tags: ['letterhead', 'formal', 'serif'],
  },
  layout: { header: 'left', table: 'lines', logoSize: 'm', density: 'comfortable' },
  pad: { top: 52, x: 58, left: 70, bottom: 68 },
  chrome: () => '<div class="lh-rule"></div><div class="lh-mark"></div>',
  header: (ctx, layout) => (layout === 'left' ? letterheadHeader(ctx) : null),
  css: () => `
.cd-t-letterhead{--title-size:22px;--pr-th-rule:1.5px solid var(--accent);--pr-th-ink:var(--accent-ink);--pr-th-bg:var(--accent);}
.cd-t-letterhead .lh-rule{position:absolute;left:38px;top:0;bottom:0;width:2px;background:var(--accent);}
.cd-t-letterhead .lh-mark{position:absolute;left:32px;top:52px;width:14px;height:14px;background:var(--accent);}
.cd-t-letterhead.cd-o-h-left .lh-hdr{display:block;}
.cd-t-letterhead .lh-top{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;padding-bottom:18px;border-bottom:1px solid var(--secondary);margin-bottom:22px;}
.cd-t-letterhead .lh-top .pr-brand{max-width:60%;}
.cd-t-letterhead .pr-co{font-size:18px;color:var(--accent-ink);}
.cd-t-letterhead .lh-contact{text-align:right;font-size:10.5px;line-height:1.6;color:var(--muted);overflow-wrap:anywhere;max-width:45%;}
.cd-t-letterhead .lh-doc{text-align:left;max-width:none;}
.cd-t-letterhead .lh-titleline{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 16px;}
.cd-t-letterhead .lh-titleline .cd-docno{margin-top:0;}
.cd-t-letterhead .cd-title{font-weight:700;color:var(--ink);}
.cd-t-letterhead .cd-label{color:var(--accent-ink);}
.cd-t-letterhead .pr-due{background:transparent;border-left:2px solid var(--accent);}
.cd-t-letterhead .pr-due-value{color:var(--ink);}
.cd-t-letterhead .cd-tot-grand{background:transparent;color:var(--accent-ink);border-radius:0;border-top:2px solid var(--accent);padding:9px 2px 0;font-family:var(--font-head);}
.cd-t-letterhead .cd-h{color:var(--accent-ink);}
.cd-t-letterhead .cd-fact{background:transparent;border-color:var(--secondary);border-radius:0;}
.cd-t-letterhead .cd-pay-btn{border-radius:3px;}
.cd-t-letterhead .cd-footer{border-top:1px solid var(--secondary);padding-top:7px;}
`,
});

// ---------------------------------------------------------------------------------------------- Work Ticket
const ticketHeader = (ctx: RenderCtx) => {
  const { m } = ctx;
  const brand = proBrand(ctx, 'left');
  return block('cd-hdr pr-hdr wt-hdr', `${brand ? `<div class="wt-cell wt-brand">${brand}</div>` : ''}<div class="wt-cell wt-title">${titleH1(m)}${statusBadge(m)}</div>${m.number ? `<div class="wt-cell wt-no"><div class="cd-label">${m.numberLabel}</div><div class="wt-no-v cd-num">${m.number}</div></div>` : ''}`);
};
const workTicket = proDesign({
  meta: {
    id: 'work_ticket', name: 'Work Ticket', descriptor: 'Carbon-copy form boxes',
    description: 'Every detail in its own ruled box, like the service ticket books techs know, with a red ticket number.',
    accent: '#b91c1c', secondary: '#1f2937', paper: '#ffffff', headFont: 'oswald', bodyFont: 'roboto', tags: ['ticket', 'form', 'service'],
  },
  layout: { header: 'left', table: 'boxed', logoSize: 's', density: 'comfortable' },
  pad: { top: 44, x: 44, bottom: 64 },
  header: (ctx, layout) => (layout === 'left' ? ticketHeader(ctx) : null),
  css: () => `
.cd-t-work_ticket{--title-size:28px;--pr-box:var(--secondary);--pr-box-th:#e5e7eb;--pr-box-th-ink:var(--secondary);--pr-th-bg:var(--secondary);--pr-th-on:var(--on-secondary);--pr-th-rule:2px solid var(--secondary);--pr-gap:14px;}
.cd-t-work_ticket.cd-o-h-left .wt-hdr{display:flex;align-items:stretch;gap:0;border:1.5px solid var(--secondary);}
.cd-t-work_ticket .wt-cell{padding:10px 12px;min-width:0;}
.cd-t-work_ticket .wt-cell+.wt-cell{border-left:1.5px solid var(--secondary);}
.cd-t-work_ticket .wt-brand{flex:1.6 1 0;}
.cd-t-work_ticket .wt-brand .pr-brand{max-width:none;}
.cd-t-work_ticket .wt-brand .pr-logo{margin-bottom:6px;}
.cd-t-work_ticket .pr-co{font-size:15px;}
.cd-t-work_ticket .pr-co-lines{font-size:10px;margin-top:3px;}
.cd-t-work_ticket .wt-title{flex:1 1 0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:var(--secondary);color:var(--on-secondary);}
.cd-t-work_ticket .wt-title .cd-title{color:var(--on-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.06em;}
.cd-t-work_ticket .wt-title .cd-status{color:var(--on-secondary);}
.cd-t-work_ticket .wt-no{flex:0 0 auto;min-width:150px;display:flex;flex-direction:column;justify-content:center;}
.cd-t-work_ticket .wt-no-v{font-family:var(--font-head);font-size:22px;font-weight:600;color:var(--accent-ink);letter-spacing:.04em;white-space:normal;overflow-wrap:anywhere;}
.cd-t-work_ticket .cd-title{font-weight:600;text-transform:uppercase;}
.cd-t-work_ticket .pr-parties{gap:0;border:1.5px solid var(--secondary);}
.cd-t-work_ticket .pr-parties>*{padding:8px 12px;}
.cd-t-work_ticket .pr-parties>*+*{border-left:1.5px solid var(--secondary);}
.cd-t-work_ticket .cd-label,.cd-t-work_ticket .pr-due-label{font-family:var(--font-head);font-size:10px;font-weight:500;letter-spacing:.1em;color:var(--secondary-ink);}
.cd-t-work_ticket .pr-due{background:transparent;border-left:0;max-width:none;}
.cd-t-work_ticket .pr-parties .pr-due{border-left:1.5px solid var(--secondary);}
.cd-t-work_ticket .pr-due-value{font-family:var(--font-head);color:var(--ink);font-weight:600;}
.cd-t-work_ticket .cd-meta-row{border-bottom:1px solid var(--rule);}
.cd-t-work_ticket .cd-tot{border-bottom:1px solid var(--rule);}
.cd-t-work_ticket .cd-totals{border:1.5px solid var(--secondary);padding:4px 10px 8px;}
.cd-t-work_ticket .cd-tot-grand{background:var(--secondary);color:var(--on-secondary);border-radius:0;font-family:var(--font-head);font-size:16px;margin:6px -10px -8px;padding:8px 12px;}
.cd-t-work_ticket .cd-h{font-family:var(--font-head);font-weight:500;font-size:11.5px;letter-spacing:.1em;color:var(--secondary-ink);}
.cd-t-work_ticket .cd-section,.cd-t-work_ticket .cd-grid2{border:1.5px solid var(--secondary);padding:8px 12px;}
.cd-t-work_ticket .cd-grid2{gap:24px;}
.cd-t-work_ticket .cd-sig{border:1.5px solid var(--secondary);padding:6px 10px 8px;}
.cd-t-work_ticket .cd-fact{background:transparent;border:1.5px solid var(--secondary);border-radius:0;}
.cd-t-work_ticket .cd-fact-value{font-family:var(--font-head);color:var(--ink);}
.cd-t-work_ticket .cd-pay-btn{border-radius:0;background:var(--secondary);color:var(--on-secondary);}
.cd-t-work_ticket .cd-footer{border-top:1.5px solid var(--secondary);padding-top:6px;}
`,
});

/** The Premium designs, in picker order. */
export const DESIGNS: DesignDef[] = [
  classicTrade, modernContractor, fieldReady, executive, corporate, craftsman, blueprintPro, slate,
  proposal, letterhead, minimalLine, boldBlock, heritage, studio, workTicket,
];
