/**
 * Design module "fresh2" (see designs/index.ts): seven new designs.
 *
 *   heritage  - letterpress tradition: cream paper, centered serif masthead, ornaments, engraved rules
 *   nordic    - Scandinavian minimal: grey-blue, airy spacing, rounded cards
 *   metro     - dashboard tiles for the key facts, crisp table
 *   split     - header split into an accent panel (title) and a company panel
 *   greenbar  - computer-form paper: green bands, tractor-feed margins, monospace
 *   voltage   - black + high-visibility yellow, diagonal header, condensed display type
 *   meadow    - landscaping: organic greens, leaf sprig, rolling hills, rounded shapes
 *
 * All colors come from the palette (CSS vars) so user colors work; inline SVG gets literal colors computed
 * from ctx.c because html2canvas renders SVG as an image.
 */
import {
  block, defaultParties, lines, logoImg, statusBadge, titleH1,
  type DesignDef, type RenderCtx, type ThemeDef,
} from '../blocks.ts';
import { ensureContrast, mix } from '../colors.ts';
import { rgba } from '../kit.ts';

const svgData = (svg: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;

// ---------------------------------------------------------------------------
// 1. Heritage (letterpress, ornaments, engraved rules)
// ---------------------------------------------------------------------------
const ornament = (color: string, w = 240) => {
  const h = w / 2;
  return `<svg class="hr-orn" width="${w}" height="16" viewBox="0 0 ${w} 16" xmlns="http://www.w3.org/2000/svg">`
    + `<line x1="0" y1="8" x2="${h - 26}" y2="8" stroke="${color}" stroke-width="0.9"/>`
    + `<line x1="${h + 26}" y1="8" x2="${w}" y2="8" stroke="${color}" stroke-width="0.9"/>`
    + `<line x1="${h - 70}" y1="11" x2="${h - 30}" y2="11" stroke="${color}" stroke-width="0.6"/>`
    + `<line x1="${h + 30}" y1="11" x2="${h + 70}" y2="11" stroke="${color}" stroke-width="0.6"/>`
    + `<circle cx="${h - 16}" cy="8" r="2.4" fill="${color}"/><circle cx="${h + 16}" cy="8" r="2.4" fill="${color}"/>`
    + `<path d="M${h} 1.5 L${h + 6.5} 8 L${h} 14.5 L${h - 6.5} 8 Z" fill="${color}"/>`
    + `<path d="M${h} 5 L${h + 3} 8 L${h} 11 L${h - 3} 8 Z" fill="#ffffff" fill-opacity="0.85"/></svg>`;
};

const heritageCorner = (color: string, pos: 'tl' | 'tr' | 'bl' | 'br') => {
  const s = 44;
  const t = pos === 'tl' ? '' : pos === 'tr' ? `translate(${s},0) scale(-1,1)` : pos === 'bl' ? `translate(0,${s}) scale(1,-1)` : `translate(${s},${s}) scale(-1,-1)`;
  return `<svg class="hr-corner hr-${pos}" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg"><g transform="${t}">`
    + `<path d="M1.5 ${s} V1.5 H${s}" fill="none" stroke="${color}" stroke-width="1.6"/>`
    + `<path d="M7 ${s} V7 H${s}" fill="none" stroke="${color}" stroke-width="0.7"/>`
    + `<path d="M15 9.5 L20.5 15 L15 20.5 L9.5 15 Z" fill="${color}"/></g></svg>`;
};

const heritage: ThemeDef = {
  id: 'heritage',
  pad: { top: 50, x: 70, bottom: 70, footer: 36 },
  ink: '#2a251e',
  header: ({ m, c }) => block('cd-hdr', `
    <div class="hr-mast">
      ${logoImg(m) || (m.company.initials ? `<div class="hr-seal"><div class="hr-seal-in">${m.company.initials}</div></div>` : '')}
      ${m.company.name ? `<div class="hr-name">${m.company.name}</div>` : ''}
      ${m.company.tagline ? `<div class="hr-tagline">${m.company.tagline}</div>` : ''}
      ${lines([m.company.addressLines.join(', '), ...m.company.compactLines.slice(m.company.addressLines.length)].filter(Boolean), 'cd-lines hr-co-lines')}
    </div>
    <div class="hr-orn-row">${ornament(c.accentInk)}</div>
    <div class="hr-titlerow">${titleH1(m)}${m.number || m.status ? `<div class="hr-sub">${m.number ? `<span class="hr-no"><span class="hr-no-label">${m.numberLabel}</span> ${m.number}</span>` : ''}${statusBadge(m)}</div>` : ''}</div>`),
  parties: (ctx) => defaultParties(ctx, { metaTitle: 'Particulars' }),
  chrome: ({ c }) => {
    const col = mix(c.accentInk, c.paper, 0.25);
    return `<div class="hr-frame"></div>${heritageCorner(col, 'tl')}${heritageCorner(col, 'tr')}${heritageCorner(col, 'bl')}${heritageCorner(col, 'br')}`;
  },
  css: ({ c }) => `
.cd-t-heritage{--title-size:28px;--hr-line:${mix(c.accentInk, c.paper, 0.35)};font-size:13px;}
.cd-t-heritage .hr-frame{position:absolute;left:26px;top:26px;right:26px;bottom:26px;border:0.8px solid var(--hr-line);}
.cd-t-heritage .hr-corner{position:absolute;}
.cd-t-heritage .hr-tl{left:16px;top:16px;} .cd-t-heritage .hr-tr{right:16px;top:16px;}
.cd-t-heritage .hr-bl{left:16px;bottom:16px;} .cd-t-heritage .hr-br{right:16px;bottom:16px;}
.cd-t-heritage .cd-hdr{text-align:center;margin-bottom:18px;}
.cd-t-heritage .hr-mast{display:flex;flex-direction:column;align-items:center;}
.cd-t-heritage .cd-logo{margin:0 auto 7px;max-height:46px;}
.cd-t-heritage .hr-seal{width:58px;height:58px;border-radius:50%;border:1.5px solid var(--accent-ink);padding:3px;margin:0 auto 8px;}
.cd-t-heritage .hr-seal-in{width:100%;height:100%;border-radius:50%;border:0.8px solid var(--accent-ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-size:20px;color:var(--accent-ink);letter-spacing:.04em;}
.cd-t-heritage .hr-name{font-family:var(--font-head);font-size:23px;font-weight:700;color:var(--accent-ink);letter-spacing:.02em;line-height:1.2;}
.cd-t-heritage .hr-tagline{font-family:var(--font-head);font-style:italic;font-size:12px;color:var(--muted);margin-top:3px;}
.cd-t-heritage .hr-co-lines{color:var(--ink);font-size:11.5px;margin-top:4px;line-height:1.55;}
.cd-t-heritage .hr-orn-row{margin:10px 0 8px;line-height:0;}
.cd-t-heritage .hr-orn{display:inline-block;}
.cd-t-heritage .cd-title{font-weight:400;text-transform:uppercase;letter-spacing:.32em;margin-right:-.32em;color:var(--ink);}
.cd-t-heritage .hr-sub{margin-top:6px;display:flex;justify-content:center;align-items:center;gap:14px;flex-wrap:wrap;}
.cd-t-heritage .hr-no{font-family:var(--font-head);font-size:13px;color:var(--ink);}
.cd-t-heritage .hr-no-label{font-style:italic;color:var(--muted);}
.cd-t-heritage .hr-sub .cd-status{margin-top:0;}
.cd-t-heritage .cd-label{font-family:var(--font-head);font-size:9.5px;font-weight:700;letter-spacing:.2em;color:var(--accent-ink);margin-bottom:7px;}
.cd-t-heritage .cd-parties{border-top:0.8px solid var(--hr-line);border-bottom:0.8px solid var(--hr-line);padding:12px 0 10px;gap:0;margin-bottom:20px;}
.cd-t-heritage .cd-party{padding:0 18px;}
.cd-t-heritage .cd-party+.cd-party{border-left:0.8px solid var(--hr-line);}
.cd-t-heritage .cd-party:first-child{padding-left:0;} .cd-t-heritage .cd-party:last-child{padding-right:0;}
.cd-t-heritage .cd-party-name{font-family:var(--font-head);font-size:13.5px;}
.cd-t-heritage .cd-lines{color:var(--ink);font-size:12px;}
.cd-t-heritage .cd-meta-row{border-bottom:0.8px dotted var(--hr-line);font-size:12px;padding:2px 0;}
.cd-t-heritage .cd-meta-row dt{font-style:italic;}
.cd-t-heritage .cd-subject{text-align:center;}
.cd-t-heritage .cd-subject-text{font-style:italic;font-weight:400;font-size:17px;color:var(--accent-ink);}
.cd-t-heritage .cd-intro p{font-family:var(--font-head);font-size:13.5px;line-height:1.75;text-align:center;}
.cd-t-heritage .cd-table th{font-family:var(--font-head);font-size:9.5px;letter-spacing:.18em;color:var(--accent-ink);border-top:3px double var(--accent-ink);border-bottom:0.8px solid var(--accent-ink);padding:8px 10px;}
.cd-t-heritage .cd-table td{border-bottom:0.8px dotted var(--hr-line);font-size:12.5px;padding:6px 10px;}
.cd-t-heritage .cd-table tbody tr:last-child td{border-bottom:0.8px solid var(--accent-ink);}
.cd-t-heritage .cd-table th:first-child,.cd-t-heritage .cd-table td:first-child{padding-left:2px;}
.cd-t-heritage .cd-table th:last-child,.cd-t-heritage .cd-table td:last-child{padding-right:2px;}
.cd-t-heritage .cd-totals{flex-basis:280px;}
.cd-t-heritage .cd-tot{font-size:12.5px;border-bottom:0.8px dotted var(--hr-line);padding:4px 2px;}
.cd-t-heritage .cd-tot-label{font-style:italic;color:var(--ink);}
.cd-t-heritage .cd-tot-grand{background:none;color:var(--accent-ink);border-radius:0;border-bottom:3px double var(--accent-ink);border-top:0.8px solid var(--accent-ink);margin-top:8px;padding:9px 2px;font-family:var(--font-head);font-size:16px;}
.cd-t-heritage .cd-tot-grand .cd-tot-label{font-style:normal;letter-spacing:.06em;color:inherit;}
.cd-t-heritage .cd-tot-balance{border-top:0;font-family:var(--font-head);}
.cd-t-heritage .cd-pay-btn{border-radius:0;font-family:var(--font-head);letter-spacing:.06em;}
.cd-t-heritage .cd-sum-closing{font-weight:400;font-style:italic;font-size:15px;}
.cd-t-heritage .cd-closing{text-align:center;}
.cd-t-heritage .cd-closing-text{font-weight:400;font-style:italic;font-size:16px;}
.cd-t-heritage .cd-h{font-size:10px;letter-spacing:.2em;padding-bottom:4px;border-bottom:0.8px solid var(--hr-line);margin-bottom:7px;}
.cd-t-heritage .cd-prose{font-size:12.5px;line-height:1.5;}
.cd-t-heritage .cd-fact{background:transparent;border:0.8px solid var(--hr-line);border-radius:0;text-align:center;}
.cd-t-heritage .cd-fact-value{font-weight:400;}
.cd-t-heritage .cd-tag{background:transparent;border:0.8px solid var(--hr-line);border-radius:0;font-style:italic;}
.cd-t-heritage .cd-sig-label{font-family:var(--font-head);letter-spacing:.16em;}
.cd-t-heritage .cd-footer{justify-content:center;gap:18px;font-family:var(--font-head);font-style:italic;font-size:9.5px;}
`,
};

// ---------------------------------------------------------------------------
// 2. Nordic (airy, grey-blue, rounded cards)
// ---------------------------------------------------------------------------
const nordic: ThemeDef = {
  id: 'nordic',
  pad: { top: 54, x: 64, bottom: 70, footer: 30 },
  ink: '#1f2a33',
  header: ({ m }) => block('cd-hdr', `
    <div class="nd-brand">${logoImg(m)}${m.company.name ? `<div class="nd-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="nd-tagline">${m.company.tagline}</div>` : ''}${lines(m.company.compactLines)}</div>
    <div class="nd-doc">${titleH1(m)}${m.number ? `<div class="nd-no"><span class="nd-no-label">${m.numberLabel}</span> ${m.number}</div>` : ''}${statusBadge(m)}</div>`),
  chrome: () => '<div class="nd-dot"></div>',
  css: ({ c }) => `
.cd-t-nordic{--title-size:42px;--nd-card:${mix(c.accent, c.paper, 0.92)};--nd-line:${mix(c.accent, c.paper, 0.8)};}
.cd-t-nordic .nd-dot{position:absolute;left:var(--pl);top:28px;width:28px;height:6px;border-radius:999px;background:var(--secondary);}
.cd-t-nordic .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;margin-bottom:24px;}
.cd-t-nordic .nd-brand{max-width:62%;}
.cd-t-nordic .cd-logo{max-height:48px;margin-bottom:8px;}
.cd-t-nordic .nd-name{font-family:var(--font-head);font-size:17px;font-weight:700;letter-spacing:-.01em;margin-bottom:4px;}
.cd-t-nordic .nd-tagline{font-size:11px;color:var(--muted);margin-bottom:4px;}
.cd-t-nordic .cd-lines{font-size:11.5px;line-height:1.6;}
.cd-t-nordic .nd-doc{text-align:right;}
.cd-t-nordic .cd-title{font-weight:600;letter-spacing:-.02em;color:var(--ink);}
.cd-t-nordic .nd-no{margin-top:10px;font-size:13px;font-weight:600;}
.cd-t-nordic .nd-no-label{color:var(--muted);font-weight:500;}
.cd-t-nordic .cd-status{border-radius:999px;border-width:1px;padding:3px 12px;letter-spacing:.08em;}
.cd-t-nordic .cd-parties{gap:14px;align-items:stretch;margin-bottom:22px;}
.cd-t-nordic .cd-party{background:var(--nd-card);border-radius:14px;padding:13px 16px;}
.cd-t-nordic .cd-label{font-size:9.5px;letter-spacing:.12em;color:var(--accent-ink);font-weight:700;}
.cd-t-nordic .cd-party-name{font-size:13px;}
.cd-t-nordic .cd-meta-row{border-bottom:1px solid var(--nd-line);}
.cd-t-nordic .cd-subject-text{font-weight:600;font-size:17px;}
.cd-t-nordic .cd-table{border-collapse:separate;border-spacing:0;}
.cd-t-nordic .cd-table th{background:var(--nd-card);color:var(--accent-ink);font-size:9.5px;letter-spacing:.1em;padding:10px 12px;}
.cd-t-nordic .cd-table th:first-child{border-radius:10px 0 0 10px;}
.cd-t-nordic .cd-table th:last-child{border-radius:0 10px 10px 0;}
.cd-t-nordic .cd-table td{border-bottom:1px solid var(--rule);padding:8px 12px;}
.cd-t-nordic .cd-totals{flex-basis:290px;background:var(--nd-card);border-radius:14px;padding:9px 14px 10px;}
.cd-t-nordic .cd-tot{padding:4px 2px;}
.cd-t-nordic .cd-tot-grand{border-radius:10px;padding:10px 14px;margin:6px -4px 2px;font-size:15px;}
.cd-t-nordic .cd-tot-balance{border-top:1px solid var(--nd-line);}
.cd-t-nordic .cd-pay-btn{border-radius:999px;padding:10px 20px;}
.cd-t-nordic .cd-h{font-size:10px;letter-spacing:.12em;}
.cd-t-nordic .cd-fact{border:0;border-radius:14px;background:var(--nd-card);}
.cd-t-nordic .cd-tag{border-radius:999px;background:var(--nd-card);}
.cd-t-nordic .cd-widget{border-radius:14px;}
.cd-t-nordic .cd-sig-line{border-top-color:var(--rule-strong);}
.cd-t-nordic .cd-footer{border-top:1px solid var(--rule);padding-top:9px;}
`,
};

// ---------------------------------------------------------------------------
// 3. Metro (dashboard tiles)
// ---------------------------------------------------------------------------
const metroTiles = (ctx: RenderCtx) => {
  const { m } = ctx;
  const tiles: string[] = [];
  if (m.number) tiles.push(`<div class="mt-tile"><div class="mt-tile-label">${m.numberLabel}</div><div class="mt-tile-value">${m.number}</div></div>`);
  if (m.keyDate) tiles.push(`<div class="mt-tile"><div class="mt-tile-label">${m.keyDate.label}</div><div class="mt-tile-value">${m.keyDate.value}</div></div>`);
  if (m.status) tiles.push(`<div class="mt-tile mt-tile-status"><div class="mt-tile-label">Status</div><div class="mt-tile-value">${statusBadge(m)}</div></div>`);
  // the highlight tile is skipped when a fact card below already shows the same figure
  if (m.highlight && !m.facts.some((f) => f.label === m.highlight!.label)) tiles.push(`<div class="mt-tile mt-tile-hl"><div class="mt-tile-label">${m.highlight.label}</div><div class="mt-tile-value">${m.highlight.value}</div></div>`);
  return tiles.length ? `<div class="mt-tiles" style="grid-template-columns:repeat(${tiles.length},minmax(0,1fr))">${tiles.join('')}</div>` : '';
};

const metro: ThemeDef = {
  id: 'metro',
  pad: { top: 50, x: 54, bottom: 68 },
  header: (ctx) => {
    const { m } = ctx;
    return block('cd-hdr', `
      <div class="mt-top">
        <div class="mt-brand">${logoImg(m)}<div class="mt-co">${m.company.name ? `<div class="mt-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="mt-tagline">${m.company.tagline}</div>` : ''}${lines(m.company.compactLines)}</div></div>
        <div class="mt-doc">${titleH1(m)}</div>
      </div>${metroTiles(ctx)}`);
  },
  css: ({ c }) => `
.cd-t-metro{--title-size:40px;--mt-tile:${mix(c.accent, c.paper, 0.94)};}
.cd-t-metro .cd-hdr{margin-bottom:22px;}
.cd-t-metro .mt-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:16px;}
.cd-t-metro .mt-brand{display:flex;gap:16px;align-items:flex-start;min-width:0;max-width:70%;}
.cd-t-metro .cd-logo{max-height:52px;max-width:150px;flex:none;}
.cd-t-metro .mt-co{min-width:0;}
.cd-t-metro .mt-name{font-family:var(--font-head);font-size:16px;font-weight:700;margin-bottom:2px;}
.cd-t-metro .mt-tagline{font-size:10.5px;color:var(--muted);margin-bottom:2px;}
.cd-t-metro .cd-lines{font-size:11px;}
.cd-t-metro .mt-doc{text-align:right;flex:none;}
.cd-t-metro .cd-title{font-weight:800;letter-spacing:-.02em;color:var(--ink);}
.cd-t-metro .mt-tiles{display:grid;gap:10px;}
.cd-t-metro .mt-tile{background:var(--mt-tile);border-radius:10px;padding:11px 14px 12px;border-top:3px solid var(--secondary);min-width:0;}
.cd-t-metro .mt-tile-label{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.cd-t-metro .mt-tile-value{font-family:var(--font-head);font-size:16px;font-weight:700;margin-top:3px;overflow-wrap:anywhere;line-height:1.25;}
.cd-t-metro .mt-tile-status .cd-status{margin-top:2px;}
.cd-t-metro .mt-tile-hl{background:var(--accent);color:var(--on-accent);border-top-color:var(--accent);}
.cd-t-metro .mt-tile-hl .mt-tile-label{color:var(--on-accent);opacity:.8;}
.cd-t-metro .mt-tile-hl .mt-tile-value{font-size:20px;}
.cd-t-metro .cd-parties{gap:12px;align-items:stretch;margin-bottom:22px;}
.cd-t-metro .cd-party{border:1px solid var(--rule);border-radius:10px;padding:13px 15px;}
.cd-t-metro .cd-label{color:var(--accent-ink);}
.cd-t-metro .cd-table th{color:var(--muted);font-size:9px;letter-spacing:.1em;border-bottom:2px solid var(--ink);padding:9px 10px;}
.cd-t-metro .cd-table td{padding:8px 10px;}
.cd-t-metro .cd-table th:first-child,.cd-t-metro .cd-table td:first-child{padding-left:2px;}
.cd-t-metro .cd-table th:last-child,.cd-t-metro .cd-table td:last-child{padding-right:2px;}
.cd-t-metro .cd-table td.cd-col-last{font-weight:600;}
.cd-t-metro .cd-totals{flex-basis:290px;}
.cd-t-metro .cd-tot{padding:5px 2px;border-bottom:1px solid var(--rule);}
.cd-t-metro .cd-tot-grand{border-radius:10px;border-bottom:0;padding:13px 15px;font-size:17px;margin-top:10px;}
.cd-t-metro .cd-tot-balance{border-top:0;border-bottom:2px solid var(--ink);}
.cd-t-metro .cd-pay-btn{border-radius:8px;}
.cd-t-metro .cd-fact{border:0;border-top:3px solid var(--secondary);border-radius:10px;background:var(--mt-tile);}
.cd-t-metro .cd-fact-value{color:var(--ink);}
.cd-t-metro .cd-tag{border-radius:6px;}
.cd-t-metro .cd-widget{border-radius:10px;}
.cd-t-metro .cd-footer{border-top:1px solid var(--rule);padding-top:8px;}
`,
};

// ---------------------------------------------------------------------------
// 4. Split Panel (accent half + company half)
// ---------------------------------------------------------------------------
const split: ThemeDef = {
  id: 'split',
  pad: { top: 52, x: 56, bottom: 68 },
  header: ({ m }) => block('cd-hdr', `
    <div class="sl-panel">${titleH1(m)}
      ${m.number ? `<div class="sl-no"><div class="sl-k">${m.numberLabel}</div><div class="sl-v">${m.number}</div></div>` : ''}
      ${m.keyDate ? `<div class="sl-kd"><span class="sl-k">${m.keyDate.label}</span> <span class="sl-kd-v">${m.keyDate.value}</span></div>` : ''}
      ${statusBadge(m)}</div>
    <div class="sl-co">${logoImg(m)}${m.company.name ? `<div class="sl-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="sl-tagline">${m.company.tagline}</div>` : ''}${lines(m.company.compactLines)}</div>`),
  chrome: () => '<div class="sl-cont cd-cont-only"></div>',
  css: () => `
.cd-t-split{--title-size:50px;}
.cd-t-split .sl-cont{position:absolute;left:0;top:0;right:0;height:10px;background:var(--accent);}
.cd-t-split .cd-hdr{display:flex;align-items:stretch;margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 28px calc(-1 * var(--pl));min-height:208px;}
.cd-t-split .sl-panel{flex:0 0 52%;background:var(--accent);color:var(--on-accent);padding:44px 32px 26px var(--pl);display:flex;flex-direction:column;align-items:flex-start;}
.cd-t-split .cd-title{color:var(--on-accent);font-weight:700;text-transform:uppercase;letter-spacing:-.01em;}
.cd-t-split .sl-no{margin-top:auto;padding-top:18px;}
.cd-t-split .sl-k{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.78;}
.cd-t-split .sl-v{font-family:var(--font-head);font-size:20px;font-weight:600;margin-top:2px;overflow-wrap:anywhere;}
.cd-t-split .sl-kd{margin-top:8px;font-size:12px;}
.cd-t-split .sl-kd-v{font-weight:700;}
.cd-t-split .sl-panel .cd-status{color:var(--on-accent);margin-top:12px;}
.cd-t-split .sl-co{flex:1 1 auto;min-width:0;padding:44px var(--px) 24px 32px;text-align:right;display:flex;flex-direction:column;align-items:flex-end;}
.cd-t-split .cd-logo{max-height:52px;margin-bottom:10px;}
.cd-t-split .sl-name{font-family:var(--font-head);font-size:19px;font-weight:700;line-height:1.2;margin-bottom:4px;}
.cd-t-split .sl-tagline{font-size:11px;color:var(--accent-ink);font-weight:600;margin-bottom:6px;}
.cd-t-split .sl-co .cd-lines{font-size:11.5px;line-height:1.65;}
.cd-t-split .cd-parties{margin-bottom:22px;}
.cd-t-split .cd-label{color:var(--accent-ink);display:flex;align-items:center;gap:8px;}
.cd-t-split .cd-label::before{content:'';display:inline-block;width:16px;height:3px;background:var(--accent);}
.cd-t-split .cd-party-name{font-family:var(--font-head);font-size:14px;}
.cd-t-split .cd-subject-text{font-size:18px;}
.cd-t-split .cd-table th{color:var(--accent-ink);font-size:9.5px;letter-spacing:.1em;border-bottom:2.5px solid var(--accent);padding:9px 10px;}
.cd-t-split .cd-table tbody tr:nth-child(even) td{background:var(--accent-soft);}
.cd-t-split .cd-table td{border-bottom:0;padding:8px 10px;}
.cd-t-split .cd-table tbody tr:last-child td{border-bottom:1px solid var(--rule-strong);}
.cd-t-split .cd-totals{flex-basis:290px;}
.cd-t-split .cd-tot-grand{border-radius:0;padding:12px 14px;font-family:var(--font-head);font-size:16px;}
.cd-t-split .cd-pay-btn{border-radius:0;}
.cd-t-split .cd-h{display:flex;align-items:center;gap:8px;}
.cd-t-split .cd-h::before{content:'';display:inline-block;width:16px;height:3px;background:var(--accent);flex:none;}
.cd-t-split .cd-fact{border-radius:0;border:0;border-left:4px solid var(--accent);}
.cd-t-split .cd-footer{border-top:1px solid var(--rule);padding-top:8px;}
`,
};

// ---------------------------------------------------------------------------
// 5. Greenbar (computer-form paper)
// ---------------------------------------------------------------------------
const GB_BAND = 36;
const GB_FEED = 40;

const feedHoles = (height: number, fill: string, stroke: string) => {
  const n = Math.floor((height - 12) / 48);
  const circles = Array.from({ length: n }, (_, i) => `<circle cx="${GB_FEED / 2}" cy="${30 + i * 48}" r="6.5" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>`).join('');
  return `<svg width="${GB_FEED}" height="${height}" viewBox="0 0 ${GB_FEED} ${height}" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`;
};

const greenbar: ThemeDef = {
  id: 'greenbar',
  pad: { top: 58, x: 70, bottom: 68, footer: 28 },
  ink: '#1e2a22',
  header: ({ m }) => block('cd-hdr', `
    <div class="gb-top">
      <div class="gb-co">${logoImg(m)}${m.company.name ? `<div class="gb-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="gb-tagline">${m.company.tagline}</div>` : ''}${lines(m.company.compactLines)}</div>
      <div class="gb-doc">${titleH1(m)}${m.number ? `<div class="gb-no">${m.numberLabel} ${m.number}</div>` : ''}${statusBadge(m)}</div>
    </div>`),
  chrome: ({ c, page }) => {
    const band = mix(c.secondary, c.paper, 0.74);
    const count = Math.ceil(page.height / (GB_BAND * 2));
    const bands = Array.from({ length: count }, (_, i) => `<div class="gb-band" style="top:${i * GB_BAND * 2}px;background:${band}"></div>`).join('');
    const hole = mix(c.ink, c.paper, 0.9);
    const ring = mix(c.ink, c.paper, 0.72);
    return `<div class="gb-bands">${bands}</div><div class="gb-feed gb-feed-l">${feedHoles(page.height, hole, ring)}</div><div class="gb-feed gb-feed-r">${feedHoles(page.height, hole, ring)}</div>`;
  },
  css: ({ c }) => `
.cd-t-greenbar{--title-size:32px;--gb-ink:${ensureContrast(c.accent, mix(c.secondary, c.paper, 0.74), 4.5)};font-size:11.5px;}
.cd-t-greenbar .gb-bands{position:absolute;left:${GB_FEED + 6}px;right:${GB_FEED + 6}px;top:0;bottom:0;overflow:hidden;}
.cd-t-greenbar .gb-band{position:absolute;left:0;right:0;height:${GB_BAND}px;}
.cd-t-greenbar .gb-feed{position:absolute;top:0;bottom:0;width:${GB_FEED}px;}
.cd-t-greenbar .gb-feed svg{display:block;}
.cd-t-greenbar .gb-feed-l{left:0;border-right:1px dashed var(--rule-strong);}
.cd-t-greenbar .gb-feed-r{right:0;border-left:1px dashed var(--rule-strong);}
.cd-t-greenbar .cd-hdr{margin-bottom:22px;}
.cd-t-greenbar .gb-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-top:3px double var(--gb-ink);border-bottom:3px double var(--gb-ink);padding:14px 0 12px;}
.cd-t-greenbar .gb-co{min-width:0;max-width:56%;}
.cd-t-greenbar .cd-logo{max-height:46px;margin-bottom:8px;}
.cd-t-greenbar .gb-name{font-family:var(--font-head);font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--gb-ink);}
.cd-t-greenbar .gb-tagline{font-size:10.5px;margin:1px 0 2px;}
.cd-t-greenbar .cd-lines{color:var(--ink);font-size:10.5px;line-height:1.55;}
.cd-t-greenbar .gb-doc{text-align:right;flex:none;}
.cd-t-greenbar .cd-title{font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gb-ink);}
.cd-t-greenbar .gb-no{margin-top:6px;font-weight:600;font-size:12px;}
.cd-t-greenbar .cd-label{color:var(--gb-ink);font-size:9.5px;letter-spacing:.12em;}
.cd-t-greenbar .cd-parties{margin-bottom:22px;}
.cd-t-greenbar .cd-party-name{font-size:12.5px;text-transform:uppercase;}
.cd-t-greenbar .cd-lines{color:var(--ink);}
.cd-t-greenbar .cd-meta-row{border-bottom:1px dotted var(--rule-strong);font-size:11px;}
.cd-t-greenbar .cd-subject-text{font-size:14px;text-transform:uppercase;}
.cd-t-greenbar .cd-table th{color:var(--ink);font-size:9.5px;letter-spacing:.1em;border-top:1.5px solid var(--ink);border-bottom:1px dashed var(--ink);padding:8px 8px;}
.cd-t-greenbar .cd-table td{border-bottom:1px dotted var(--rule-strong);font-size:11px;padding:8px 8px;}
.cd-t-greenbar .cd-table tbody tr:last-child td{border-bottom:1.5px solid var(--ink);}
.cd-t-greenbar .cd-table th:first-child,.cd-t-greenbar .cd-table td:first-child{padding-left:0;}
.cd-t-greenbar .cd-table th:last-child,.cd-t-greenbar .cd-table td:last-child{padding-right:0;}
.cd-t-greenbar .cd-totals{flex-basis:300px;}
.cd-t-greenbar .cd-tot{font-size:11.5px;padding:4px 0;}
.cd-t-greenbar .cd-tot-label{color:var(--ink);text-transform:uppercase;letter-spacing:.04em;}
.cd-t-greenbar .cd-tot-grand{background:transparent;color:var(--gb-ink);border-radius:0;border-top:3px double var(--ink);border-bottom:3px double var(--ink);padding:8px 0;font-size:14px;}
.cd-t-greenbar .cd-tot-grand .cd-tot-label{color:var(--gb-ink);}
.cd-t-greenbar .cd-pay-btn{border-radius:0;}
.cd-t-greenbar .cd-h{color:var(--gb-ink);font-size:10.5px;letter-spacing:.1em;}
.cd-t-greenbar .cd-prose{font-size:11.5px;}
.cd-t-greenbar .cd-fact{background:transparent;border:1px dashed var(--ink);border-radius:0;}
.cd-t-greenbar .cd-fact-value{color:var(--gb-ink);}
.cd-t-greenbar .cd-tag{background:transparent;border:1px solid var(--ink);color:var(--ink);border-radius:0;}
.cd-t-greenbar .cd-widget{border-radius:0;border-style:dashed;background:${rgba(c.paper, 0.6)};}
.cd-t-greenbar .cd-footer{text-transform:uppercase;letter-spacing:.06em;color:var(--ink);}
`,
};

// ---------------------------------------------------------------------------
// 6. Voltage (black + hi-vis yellow, diagonal header)
// ---------------------------------------------------------------------------
const bolt = (bg: string, fg: string) =>
  `<svg class="vt-bolt" width="46" height="46" viewBox="0 0 46 46" xmlns="http://www.w3.org/2000/svg"><circle cx="23" cy="23" r="23" fill="${bg}"/><path d="M26 6 L12 26 H21.5 L18.5 40 L34 18 H24.5 Z" fill="${fg}"/></svg>`;

const voltage: ThemeDef = {
  id: 'voltage',
  pad: { top: 44, x: 54, bottom: 78, footer: 0 },
  ink: '#151515',
  header: ({ m, c }) => block('cd-hdr', `
    <div class="vt-co">${m.company.logoUrl ? `<div class="vt-logo">${logoImg(m)}</div>` : bolt(c.secondary, c.accent)}
      <div class="vt-co-text">${m.company.name ? `<div class="vt-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="vt-tagline">${m.company.tagline}</div>` : ''}${lines(m.company.compactLines)}</div></div>
    <div class="vt-doc">${titleH1(m)}${m.number ? `<div class="vt-no"><span>${m.numberLabel}</span> ${m.number}</div>` : ''}${m.keyDate ? `<div class="vt-kd"><span>${m.keyDate.label}</span> ${m.keyDate.value}</div>` : ''}${statusBadge(m)}</div>`),
  chrome: () => '<div class="vt-cont cd-cont-only"></div>',
  footer: ({ m, c }) => `<div class="cd-footer"><div class="cd-footer-text">${m.footerLine}</div><div class="cd-pageno"></div>`
    + '<svg class="vt-slashes" width="150" height="46" viewBox="0 0 150 46" xmlns="http://www.w3.org/2000/svg">'
    + [0, 1, 2, 3].map((i) => `<polygon points="${30 + i * 30},0 ${46 + i * 30},0 ${30 + i * 30},46 ${14 + i * 30},46" fill="${c.secondary}"/>`).join('')
    + '</svg></div>',
  css: ({ c }) => `
.cd-t-voltage{--title-size:76px;--vt-hi:${ensureContrast(c.secondary, c.accent, 3)};--vt-on-hi:${ensureContrast(c.accent, c.secondary, 4.5)};}
.cd-t-voltage .vt-cont{position:absolute;left:0;right:0;top:0;height:12px;background:linear-gradient(105deg, var(--accent) 0, var(--accent) 62%, var(--paper) 62%, var(--paper) 63.4%, var(--secondary) 63.4%, var(--secondary) 100%);}
.cd-t-voltage .vt-slashes{position:absolute;right:var(--px);bottom:0;}
.cd-t-voltage .cd-hdr{display:flex;justify-content:space-between;align-items:stretch;gap:24px;margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 30px calc(-1 * var(--pl));min-height:158px;background:linear-gradient(105deg, var(--accent) 0, var(--accent) 54%, var(--paper) 54%, var(--paper) 55.2%, var(--secondary) 55.2%, var(--secondary) 100%);}
.cd-t-voltage .vt-co{flex:0 0 50%;display:flex;gap:14px;align-items:flex-start;padding:34px 10px 22px var(--pl);color:var(--on-accent);min-width:0;}
.cd-t-voltage .vt-bolt{flex:none;}
.cd-t-voltage .vt-logo{flex:none;background:#fff;padding:6px;border-radius:4px;}
.cd-t-voltage .vt-logo .cd-logo{max-height:44px;max-width:120px;}
.cd-t-voltage .vt-co-text{min-width:0;}
.cd-t-voltage .vt-name{font-family:var(--font-head);font-size:30px;line-height:1;letter-spacing:.04em;text-transform:uppercase;color:var(--vt-hi);}
.cd-t-voltage .vt-tagline{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-top:4px;}
.cd-t-voltage .vt-co .cd-lines{color:var(--on-accent);opacity:.82;font-size:11px;margin-top:8px;line-height:1.55;}
.cd-t-voltage .vt-doc{flex:1 1 auto;text-align:right;padding:28px var(--px) 20px 10px;color:var(--vt-on-hi);display:flex;flex-direction:column;align-items:flex-end;}
.cd-t-voltage .cd-title{font-weight:400;color:var(--vt-on-hi);text-transform:uppercase;letter-spacing:.02em;line-height:.88;}
.cd-t-voltage .vt-no,.cd-t-voltage .vt-kd{font-size:12px;font-weight:700;margin-top:6px;}
.cd-t-voltage .vt-no span,.cd-t-voltage .vt-kd span{font-weight:500;text-transform:uppercase;letter-spacing:.06em;font-size:10px;}
.cd-t-voltage .vt-doc .cd-status{color:var(--vt-on-hi);margin-top:8px;}
.cd-t-voltage .cd-label{font-family:var(--font-head);font-size:16px;font-weight:400;letter-spacing:.06em;color:var(--ink);display:inline-block;border-bottom:3px solid var(--secondary);padding-bottom:1px;margin-bottom:8px;}
.cd-t-voltage .cd-parties{margin-bottom:20px;}
.cd-t-voltage .cd-party-name{font-size:14px;font-weight:700;}
.cd-t-voltage .cd-lines{color:var(--ink);}
.cd-t-voltage .cd-subject-text{font-family:var(--font-head);font-weight:400;font-size:24px;letter-spacing:.03em;}
.cd-t-voltage .cd-table th{background:var(--secondary);color:var(--on-secondary);font-family:var(--font-head);font-weight:400;font-size:15px;letter-spacing:.06em;padding:8px 12px 6px;}
.cd-t-voltage .cd-table td{padding:8px 12px;border-bottom:1px solid var(--rule);}
.cd-t-voltage .cd-item-name{font-weight:600;}
.cd-t-voltage .cd-table tbody tr:last-child td{border-bottom:2px solid var(--accent);}
.cd-t-voltage .cd-totals{flex-basis:300px;}
.cd-t-voltage .cd-tot{padding:5px 12px;}
.cd-t-voltage .cd-tot-label{color:var(--ink);font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.04em;}
.cd-t-voltage .cd-tot-grand{border-radius:0;padding:9px 12px 7px;margin-top:8px;font-family:var(--font-head);font-weight:400;font-size:25px;letter-spacing:.03em;}
.cd-t-voltage .cd-tot-grand .cd-tot-label{color:var(--vt-hi);font-size:20px;font-weight:400;letter-spacing:.06em;font-family:var(--font-head);}
.cd-t-voltage .cd-tot-grand .cd-tot-value{color:var(--vt-hi);font-weight:400;}
.cd-t-voltage .cd-tot-balance{border-top:2px solid var(--accent);}
.cd-t-voltage .cd-pay-btn{border-radius:0;background:var(--secondary);color:var(--on-secondary);text-transform:uppercase;letter-spacing:.06em;}
.cd-t-voltage .cd-sum-closing{font-family:var(--font-head);font-weight:400;font-size:22px;letter-spacing:.03em;color:var(--ink);}
.cd-t-voltage .cd-closing-text{font-family:var(--font-head);font-weight:400;font-size:24px;letter-spacing:.03em;color:var(--ink);}
.cd-t-voltage .cd-h{font-size:17px;font-weight:400;letter-spacing:.06em;color:var(--ink);display:inline-block;border-bottom:3px solid var(--secondary);padding-bottom:1px;}
.cd-t-voltage .cd-fact{border-radius:0;background:var(--accent);border:0;color:var(--on-accent);}
.cd-t-voltage .cd-fact-label{color:var(--on-accent);opacity:.75;}
.cd-t-voltage .cd-fact-value{color:var(--vt-hi);font-weight:400;font-size:24px;letter-spacing:.02em;}
.cd-t-voltage .cd-fact-sub{color:var(--on-accent);opacity:.75;}
.cd-t-voltage .cd-tag{border-radius:0;background:var(--secondary);color:var(--on-secondary);}
.cd-t-voltage .cd-widget{border-radius:0;border-left:4px solid var(--secondary);}
.cd-t-voltage .cd-footer{left:0;right:0;bottom:0;height:46px;background:var(--accent);color:var(--on-accent);padding:0 190px 0 var(--pl);font-size:10px;letter-spacing:.04em;}
`,
};

// ---------------------------------------------------------------------------
// 7. Meadow (organic greens, leaf sprig, rolling hills)
// ---------------------------------------------------------------------------
const leaf = (cx: number, cy: number, len: number, angle: number, fill: string) =>
  `<path d="M0 0 C ${len * 0.3} ${-len * 0.36}, ${len * 0.75} ${-len * 0.34}, ${len} 0 C ${len * 0.75} ${len * 0.34}, ${len * 0.3} ${len * 0.36}, 0 0 Z" fill="${fill}" transform="translate(${cx} ${cy}) rotate(${angle})"/>`;

const sprig = (dark: string, light: string, stem: string) =>
  `<svg class="mw-sprig" width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">`
  + `<path d="M8 58 C 22 46, 34 30, 54 8" fill="none" stroke="${stem}" stroke-width="2" stroke-linecap="round"/>`
  + leaf(18, 49, 20, -150, light) + leaf(20, 47, 20, -20, dark)
  + leaf(32, 34, 19, -160, dark) + leaf(34, 33, 19, -30, light)
  + leaf(46, 19, 17, -165, light) + leaf(47, 18, 17, -35, dark)
  + leaf(54, 8, 14, -60, dark) + '</svg>';

const hills = (w: number, back: string, front: string) =>
  `<svg width="${w}" height="72" viewBox="0 0 ${w} 72" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`
  + `<path d="M0 30 C ${w * 0.18} 4, ${w * 0.38} 8, ${w * 0.55} 26 S ${w * 0.86} 12, ${w} 20 L ${w} 72 L 0 72 Z" fill="${back}"/>`
  + `<path d="M0 44 C ${w * 0.22} 24, ${w * 0.45} 30, ${w * 0.62} 40 S ${w * 0.88} 30, ${w} 36 L ${w} 72 L 0 72 Z" fill="${front}"/></svg>`;

const meadow: ThemeDef = {
  id: 'meadow',
  pad: { top: 48, x: 58, bottom: 88, footer: 10 },
  ink: '#25301f',
  header: ({ m, c }) => block('cd-hdr', `
    <div class="mw-brand">${logoImg(m)}${m.company.name ? `<div class="mw-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="mw-tagline">${m.company.tagline}</div>` : ''}${lines(m.company.compactLines)}</div>
    <div class="mw-doc"><div class="mw-titlerow">${sprig(c.accent, mix(c.secondary, c.paper, 0.1), mix(c.accent, c.paper, 0.25))}${titleH1(m)}</div>${m.number ? `<div class="mw-no"><span>${m.numberLabel}</span> ${m.number}</div>` : ''}${statusBadge(m)}</div>`),
  chrome: ({ c, page }) => `<div class="mw-hills">${hills(page.width, mix(c.secondary, c.paper, 0.35), c.accent)}</div>`,
  css: ({ c }) => {
    const bullet = svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><path d="M1 13 C 1 6, 6 1, 13 1 C 13 8, 8 13, 1 13 Z" fill="${c.accent}"/><path d="M2 12 L 10 4" stroke="${c.paper}" stroke-width="1" stroke-linecap="round"/></svg>`);
    return `
.cd-t-meadow{--title-size:40px;--mw-card:${mix(c.secondary, c.paper, 0.82)};--mw-line:${mix(c.accent, c.paper, 0.7)};}
.cd-t-meadow .mw-hills{position:absolute;left:0;right:0;bottom:0;height:64px;}
.cd-t-meadow .mw-hills svg{display:block;width:100%;height:64px;}
.cd-t-meadow .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;background:var(--mw-card);border-radius:24px;padding:18px 26px 16px;margin-bottom:20px;}
.cd-t-meadow .mw-brand{min-width:0;max-width:60%;}
.cd-t-meadow .cd-logo{max-height:44px;margin-bottom:8px;}
.cd-t-meadow .mw-name{font-family:var(--font-head);font-size:19px;font-weight:700;color:var(--accent-ink);line-height:1.2;margin-bottom:3px;}
.cd-t-meadow .mw-tagline{font-size:11px;font-weight:600;margin-bottom:4px;}
.cd-t-meadow .cd-lines{color:var(--ink);font-size:11.5px;line-height:1.6;}
.cd-t-meadow .mw-doc{text-align:right;flex:none;display:flex;flex-direction:column;align-items:flex-end;}
.cd-t-meadow .mw-titlerow{display:flex;align-items:center;gap:6px;}
.cd-t-meadow .mw-sprig{flex:none;margin:-10px 0 -8px;}
.cd-t-meadow .cd-title{font-weight:700;letter-spacing:-.01em;color:var(--accent-ink);}
.cd-t-meadow .mw-no{margin-top:8px;font-size:13px;font-weight:600;}
.cd-t-meadow .mw-no span{color:var(--muted);font-weight:500;}
.cd-t-meadow .cd-status{border-radius:999px;background:var(--paper);}
.cd-t-meadow .cd-parties{gap:14px;align-items:stretch;margin-bottom:20px;}
.cd-t-meadow .cd-party{border:1.5px solid var(--mw-line);border-radius:18px;padding:12px 16px;}
.cd-t-meadow .cd-label{color:var(--accent-ink);font-family:var(--font-head);font-weight:600;letter-spacing:.08em;}
.cd-t-meadow .cd-party-name{font-family:var(--font-head);font-weight:600;}
.cd-t-meadow .cd-meta-row{border-bottom:1px dashed var(--mw-line);}
.cd-t-meadow .cd-subject-text{color:var(--accent-ink);}
.cd-t-meadow .cd-table{border-collapse:separate;border-spacing:0;}
.cd-t-meadow .cd-table th{background:var(--accent);color:var(--on-accent);font-family:var(--font-head);font-weight:600;font-size:10px;letter-spacing:.08em;padding:9px 12px;}
.cd-t-meadow .cd-table th:first-child{border-radius:14px 0 0 14px;padding-left:16px;}
.cd-t-meadow .cd-table th:last-child{border-radius:0 14px 14px 0;padding-right:16px;}
.cd-t-meadow .cd-table td{border-bottom:1px dashed var(--mw-line);padding:7px 12px;}
.cd-t-meadow .cd-table td:first-child{padding-left:16px;}
.cd-t-meadow .cd-table td:last-child{padding-right:16px;}
.cd-t-meadow .cd-totals{flex-basis:290px;background:var(--mw-card);border-radius:18px;padding:9px 14px 10px;}
.cd-t-meadow .cd-tot{padding:3px 2px;}
.cd-t-meadow .cd-tot-label{color:var(--ink);}
.cd-t-meadow .cd-tot-grand .cd-tot-label{color:inherit;}
.cd-t-meadow .cd-tot-grand{border-radius:14px;padding:10px 14px;margin:6px -4px 2px;font-family:var(--font-head);}
.cd-t-meadow .cd-tot-balance{border-top-color:var(--mw-line);}
.cd-t-meadow .cd-pay-btn{border-radius:999px;}
.cd-t-meadow .cd-h{padding-left:20px;background:${bullet} no-repeat left center;background-size:13px 13px;font-family:var(--font-head);font-weight:600;letter-spacing:.08em;}
.cd-t-meadow .cd-fact{border:0;border-radius:16px;background:var(--mw-card);}
.cd-t-meadow .cd-tag{border-radius:999px;background:var(--mw-card);color:var(--accent-ink);}
.cd-t-meadow .cd-widget{border-radius:16px;border-color:var(--mw-line);}
.cd-t-meadow .cd-footer{color:var(--on-accent);}
`;
  },
};

// ---------------------------------------------------------------------------
export const DESIGNS: DesignDef[] = [
  {
    meta: {
      id: 'heritage', name: 'Heritage', collection: 'new',
      description: 'Letterpress tradition: cream paper, a centered serif masthead, ornamental dividers and engraved double rules. For established craftsmen.',
      accent: '#24533f', secondary: '#b8955a', paper: '#f7f2e6', headFont: 'libre-baskerville', bodyFont: 'crimson-pro',
      tags: ['serif', 'traditional', 'letterpress', 'craftsman', 'cream'],
    },
    theme: heritage,
  },
  {
    meta: {
      id: 'nordic', name: 'Nordic', collection: 'new',
      description: 'Scandinavian minimal: soft grey-blue, airy spacing and rounded cards for the parties and totals.',
      accent: '#3e5c76', secondary: '#b9cbd8', paper: '#ffffff', headFont: 'manrope', bodyFont: 'manrope',
      tags: ['minimal', 'calm', 'rounded', 'modern'],
    },
    theme: nordic,
  },
  {
    meta: {
      id: 'metro', name: 'Metro', collection: 'new',
      description: 'Dashboard tiles for the number, key date, status and amount, above a crisp, easy-to-scan table.',
      accent: '#2b59c3', secondary: '#ffb547', paper: '#ffffff', headFont: 'dm-sans', bodyFont: 'dm-sans',
      tags: ['modern', 'dashboard', 'tiles', 'clear'],
    },
    theme: metro,
  },
  {
    meta: {
      id: 'split', name: 'Split Panel', collection: 'new',
      description: 'A header split in two: a solid color panel with the title and number, and your company details beside it.',
      accent: '#7a2e3a', secondary: '#e8c9a8', paper: '#ffffff', headFont: 'space-grotesk', bodyFont: 'space-grotesk',
      tags: ['modern', 'color block', 'bold', 'split'],
    },
    theme: split,
  },
  {
    meta: {
      id: 'greenbar', name: 'Greenbar', collection: 'new',
      description: 'Classic computer-form paper with pale green bands and tractor-feed margins. Great for logs and time sheets.',
      accent: '#2e6b3e', secondary: '#8cc791', paper: '#fdfdf8', headFont: 'ibm-plex-mono', bodyFont: 'ibm-plex-mono',
      tags: ['retro', 'mono', 'ledger', 'logs', 'paper'],
    },
    theme: greenbar,
  },
  {
    meta: {
      id: 'voltage', name: 'Voltage', collection: 'new',
      description: 'Electric black and high-visibility yellow with a diagonal header and tall condensed type. Made for electricians and bold brands.',
      accent: '#151515', secondary: '#ffd60a', paper: '#ffffff', headFont: 'bebas', bodyFont: 'barlow',
      tags: ['bold', 'electric', 'black', 'yellow', 'trades'],
    },
    theme: voltage,
  },
  {
    meta: {
      id: 'meadow', name: 'Meadow', collection: 'new',
      description: 'Organic greens, a leaf sprig and rolling hills, with soft rounded shapes. For landscaping and outdoor work.',
      accent: '#3d6b35', secondary: '#a9c97f', paper: '#fbfaf4', headFont: 'rubik', bodyFont: 'karla',
      tags: ['landscaping', 'outdoor', 'green', 'nature', 'rounded'],
    },
    theme: meadow,
  },
];
