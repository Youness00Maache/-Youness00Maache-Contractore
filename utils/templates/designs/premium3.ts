/**
 * Design module "premium3": five of the original Premium designs (pre-2026-11 HTML templates 11-15 in
 * utils/templates/secondSetTemplates.ts), restored under their original ids:
 *   template_vintage    Vintage Craft     - old-lace paper, typewriter type, double frame, tilted boxes
 *   template_blueprint  Blueprint Tech    - blueprint grid paper, white double frame, technical title block
 *   template_memphis    Abstract Memphis  - skewed black title, offset-shadow cards, yellow/teal/purple shapes
 *   template_crimson    Crimson Noir      - black paper, crimson bar and labels, Times type
 *   template_watercolor Watercolor        - soft watercolor blobs, Georgia type, rounded translucent cards
 *
 * Every design renders all document types from the shared model (labels come from the model, never
 * hard-coded). Colors run through the palette, so user-picked colors still work; the original colors are
 * the defaults. The CSS effects of the originals are back now that the PDF is drawn by the browser
 * (signature filters, real watercolor blur); dark logos on dark paper are inverted like the signatures
 * (see negativeCss). Every model field is shown under its own label.
 */
import type { DesignDef, RenderCtx, ThemeDef } from '../blocks.ts';
import { block, lines, logoImg, statusBadge, titleH1 } from '../blocks.ts';
import { contrastRatio, ensureContrast, mix, readableOn } from '../colors.ts';
import { rgba } from '../kit.ts';

const metaRows = (ctx: RenderCtx, withNumber = true) => [
  ...(withNumber && ctx.m.number ? [{ label: ctx.m.numberLabel, value: ctx.m.number }] : []),
  ...ctx.m.meta,
];

/** A lone fact (e.g. only the date on a sparse daily report) keeps a card's width instead of a full-width bar. */
const soloFact = (sel: string) => `${sel} .cd-fact:only-child{flex:0 1 250px;}`;

/** Status colors that stay readable on dark paper. */
const darkTones = (sel: string) => `
${sel} .cd-tone-good{color:#7ee2a8;} ${sel} .cd-tone-bad{color:#ff9a9a;} ${sel} .cd-tone-warn{color:#ffd27a;} ${sel} .cd-tone-neutral{color:var(--muted);}`;

// ---------------------------------------------------------------------------
// 11. Vintage Craft
// ---------------------------------------------------------------------------
const vintage: ThemeDef = {
  id: 'template_vintage',
  pad: { top: 26, x: 84, bottom: 72, footer: 48 },
  ink: '#4b3621',
  closingBlock: true,
  header: ({ m }) => block('cd-hdr', `<div class="vc-titlebox">${titleH1(m)}${statusBadge(m)}</div>`),
  parties: (ctx) => {
    const { m } = ctx;
    // the original FROM box: label, company name and address (the logo sits top right, above the details)
    const from = m.company.name || m.company.lines.length
      ? `<div class="vc-box vc-from"><h3 class="vc-lbl">From:</h3>${m.company.name ? `<div class="vc-name">${m.company.name}</div>` : ''}${lines(m.company.compactLines)}</div>`
      : '';
    const rows = metaRows(ctx);
    const meta = rows.length ? `<div class="vc-meta">${rows.map((r) => `<div><span class="vc-k">${r.label}${/[.:]$/.test(r.label) ? '' : ':'}</span> ${r.value}</div>`).join('')}</div>` : '';
    const side = m.company.logoUrl || meta ? `<div class="vc-side">${m.company.logoUrl ? `<div class="vc-logo">${logoImg(m)}</div>` : ''}${meta}</div>` : '';
    const to = m.parties.map((p, i) => `<div class="vc-box vc-to${i % 2 ? ' vc-to-alt' : ''}"><h3 class="vc-lbl">${p.label}:</h3>${p.name ? `<div class="vc-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('');
    return (from || side ? block('vc-top', from + side) : '') + (to ? block('vc-to-row', to) : '');
  },
  chrome: () => '<div class="vc-frame cd-deco"></div>',
  footer: ({ m }) => `<div class="cd-footer vc-footer"><div class="cd-footer-text">${m.footerLine}</div><div class="cd-pageno"></div></div>`,
  css: ({ c }) => {
    const box = c.custom ? mix(c.accent, c.paper, 0.9) : '#fff8dc';
    return `
.cd-t-template_vintage{--title-size:32px;font-size:12px;}
.cd-t-template_vintage .vc-frame{position:absolute;left:44px;right:44px;top:62px;bottom:36px;border:4px double var(--accent);background-image:radial-gradient(${rgba(c.secondary, 0.3)} 0.6px, transparent 0.8px);background-size:20px 20px;}
.cd-t-template_vintage .cd-cont .vc-frame{top:40px;}
.cd-t-template_vintage .cd-cont .cd-body{padding-top:72px;}
.cd-t-template_vintage .cd-hdr{display:flex;justify-content:center;margin-bottom:18px;}
.cd-t-template_vintage .vc-titlebox{background:var(--paper);border:1px solid var(--accent);padding:16px 20px 12px;text-align:center;max-width:80%;}
.cd-t-template_vintage .cd-title{color:var(--ink);font-weight:700;text-transform:uppercase;letter-spacing:4px;margin-right:-4px;border-bottom:2px solid var(--accent);padding-bottom:5px;line-height:1.1;}
.cd-t-template_vintage .vc-titlebox .cd-status{margin-top:6px;}
.cd-t-template_vintage .vc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;margin-bottom:18px;}
.cd-t-template_vintage .vc-box{border:2px solid var(--accent);padding:13px 18px;min-width:0;}
.cd-t-template_vintage .vc-from{flex:0 1 310px;transform:rotate(-1deg);}
.cd-t-template_vintage .vc-lbl{display:inline-block;margin:0 0 6px;border-bottom:1px solid var(--accent);font-size:13px;font-weight:700;text-transform:uppercase;color:var(--ink);letter-spacing:.02em;line-height:1.3;}
.cd-t-template_vintage .vc-name{font-weight:700;font-size:16px;line-height:1.3;margin-bottom:4px;overflow-wrap:anywhere;}
.cd-t-template_vintage .cd-lines{color:var(--ink);font-size:12px;line-height:1.5;}
.cd-t-template_vintage .vc-side{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:flex-end;text-align:right;}
.cd-t-template_vintage .vc-logo{margin:2px 0 10px;}
.cd-t-template_vintage .vc-logo .cd-logo{max-height:48px;max-width:200px;}
.cd-t-template_vintage .vc-meta{font-size:13.5px;line-height:1.65;overflow-wrap:anywhere;margin-top:14px;}
.cd-t-template_vintage .vc-logo+.vc-meta{margin-top:0;}
.cd-t-template_vintage .vc-k{font-weight:700;}
.cd-t-template_vintage .vc-to-row{display:flex;gap:26px;margin-bottom:22px;}
.cd-t-template_vintage .vc-to{flex:1 1 0;border-width:1px;background:${rgba('#ffffff', 0.5)};transform:rotate(1deg);}
.cd-t-template_vintage .vc-to-alt{transform:rotate(-1deg);}
.cd-t-template_vintage .cd-table th{color:var(--ink);font-size:11.5px;letter-spacing:.04em;padding:10px;border-bottom:2px solid var(--accent);}
.cd-t-template_vintage .cd-table td{padding:12px 10px;border-bottom:1px dashed var(--secondary);font-size:12px;color:var(--ink);}
.cd-t-template_vintage .cd-table td.cd-col-last{font-weight:700;}
.cd-t-template_vintage .cd-item-sub{color:var(--ink);opacity:.8;}
.cd-t-template_vintage .cd-summary{margin-top:6px;}
.cd-t-template_vintage .cd-totals{flex:0 0 300px;border:2px solid var(--accent);background:${box};padding:16px 20px;}
.cd-t-template_vintage .cd-tot{padding:4px 0;font-size:12px;}
.cd-t-template_vintage .cd-tot:first-child:not(:last-child){border-bottom:1px dashed var(--accent);padding-bottom:7px;margin-bottom:5px;}
.cd-t-template_vintage .cd-tot-label{color:var(--ink);text-transform:uppercase;}
.cd-t-template_vintage .cd-tot-grand{background:none;color:var(--ink);border-radius:0;margin-top:8px;padding:8px 0 0;font-size:19px;font-weight:700;flex-wrap:wrap;column-gap:12px;}
.cd-t-template_vintage .cd-tot-grand:first-child{margin-top:0;padding-top:0;}
.cd-t-template_vintage .cd-tot-grand .cd-tot-label{font-size:16px;}
.cd-t-template_vintage .cd-tot-grand .cd-tot-value{margin-left:auto;}
.cd-t-template_vintage .cd-tot-balance{border-top:2px solid var(--accent);font-size:14px;}
.cd-t-template_vintage .cd-label{color:var(--ink);}
.cd-t-template_vintage .cd-pay-btn{background:var(--accent);color:var(--on-accent);border-radius:0;font-family:var(--font-body);}
.cd-t-template_vintage .cd-sum-closing{color:var(--ink);font-style:italic;font-weight:400;}
.cd-t-template_vintage .cd-h{display:inline-block;color:var(--ink);font-family:var(--font-body);font-size:12px;letter-spacing:.02em;border-bottom:1px solid var(--accent);padding-bottom:1px;}
.cd-t-template_vintage .cd-prose h1,.cd-t-template_vintage .cd-prose h2,.cd-t-template_vintage .cd-prose h3{font-family:var(--font-body);color:var(--ink);}
.cd-t-template_vintage .cd-fact{background:transparent;border:2px solid var(--accent);border-radius:0;padding:8px 14px;}
.cd-t-template_vintage .cd-prose{line-height:1.55;}
.cd-t-template_vintage .cd-prose h3{margin-top:10px;}
/* two signatures: notes above, the signatures side by side */
.cd-t-template_vintage .cd-signoff:has(.cd-sig+.cd-sig){flex-direction:column;gap:14px;}
.cd-t-template_vintage .cd-signoff:has(.cd-sig+.cd-sig) .cd-signoff-notes{flex:none;width:100%;}
.cd-t-template_vintage .cd-signoff:has(.cd-sig+.cd-sig) .cd-signoff-sigs{flex:none;width:100%;flex-direction:row;align-items:flex-start;gap:48px;}
.cd-t-template_vintage .cd-signoff-sigs .cd-sig{flex:1 1 0;max-width:280px;}
.cd-t-template_vintage .cd-fact-label{color:var(--ink);opacity:.75;}
${soloFact('.cd-t-template_vintage')}
.cd-t-template_vintage .cd-fact-value{color:var(--ink);}
.cd-t-template_vintage .cd-fact-sub{color:var(--ink);opacity:.75;}
.cd-t-template_vintage .cd-tag{background:transparent;border:1px dashed var(--accent);border-radius:0;color:var(--ink);}
.cd-t-template_vintage .cd-sig{display:flex;flex-direction:column;transform:rotate(-2deg);}
.cd-t-template_vintage .cd-sig-label{order:-1;margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0;text-transform:none;color:var(--ink);}
.cd-t-template_vintage .cd-sig-label::after{content:':';}
.cd-t-template_vintage .cd-sig-img{height:46px;}
.cd-t-template_vintage .cd-sig-img img{max-height:46px;max-width:200px;filter:sepia(100%);}
.cd-t-template_vintage .cd-sig-line{border-top:2px solid var(--accent);margin-top:-8px;}
.cd-t-template_vintage .cd-sig-blank .cd-sig-img{height:34px;}
.cd-t-template_vintage .cd-sig-blank .cd-sig-line{margin-top:4px;}
.cd-t-template_vintage .cd-sig-meta{margin-top:4px;}
.cd-t-template_vintage .cd-closing{text-align:center;margin-top:4px;}
.cd-t-template_vintage .cd-closing-text{font-family:var(--font-body);font-style:italic;font-weight:400;font-size:12.5px;color:var(--ink);}
.cd-t-template_vintage .vc-footer{justify-content:center;font-style:italic;color:var(--ink);font-size:9.5px;}
`;
  },
};

// ---------------------------------------------------------------------------
// 12. Blueprint Tech
// ---------------------------------------------------------------------------
/**
 * Logos and signatures on dark paper, recolored like the originals did with CSS filters: inverted, then
 * "screen"-blended so an opaque white logo background (JPG) disappears into the paper instead of
 * printing as a black box. Blending needs the paper and chrome in the same stacking context as the
 * image, hence `.cd-body{z-index:auto}` (the body still paints above the chrome: same level, later in
 * the tree).
 */
const negativeCss = (sel: string, logoSel: string, sigFilter: string) => `
${sel} .cd-body{z-index:auto;}
${sel} ${logoSel}{filter:grayscale(1) invert(1);mix-blend-mode:screen;}
${sel} .cd-sig-img img{filter:${sigFilter};mix-blend-mode:screen;}`;

const blueprint: ThemeDef = {
  id: 'template_blueprint',
  pad: { top: 62, x: 72, bottom: 78, footer: 50 },
  ink: '#ffffff',
  header: (ctx) => {
    const { m } = ctx;
    const meta = m.meta.length ? `<div class="bp-hr">${m.meta.map((i) => `<div class="bp-cell"><div class="bp-k">${i.label}:</div><div class="bp-v">${i.value}</div></div>`).join('')}</div>` : '';
    return block(`cd-hdr${meta ? '' : ' bp-hdr-solo'}`, `<div class="bp-hl">${m.company.logoUrl ? `<div class="bp-logo">${logoImg(m)}</div>` : ''}${titleH1(m)}${m.number ? `<div class="bp-no">${m.numberLabel} ${m.number}</div>` : ''}${statusBadge(m)}</div>${meta}`);
  },
  parties: ({ m }) => {
    const co = m.company.name || m.company.lines.length
      ? `<div class="bp-co"><div class="bp-name">${m.company.name}</div>${lines(m.parties.length > 1 ? m.company.lines : m.company.compactLines)}</div>`
      : '';
    const ps = m.parties.map((p) => `<div class="bp-party"><div class="bp-chip">${p.label}</div>${p.name ? `<div class="bp-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('');
    return co || ps ? block('cd-parties bp-parties', co + ps) : '';
  },
  chrome: () => '<div class="bp-grid cd-deco"></div><div class="bp-frame cd-deco"><div class="bp-frame-in cd-deco"></div></div>',
  css: ({ c }) => {
    const onWhite = ensureContrast(c.accent, '#ffffff', 4.5);
    return `
.cd-t-template_blueprint{--title-size:42px;--bp-ink:${onWhite};font-size:12px;}
.cd-t-template_blueprint .bp-grid{position:absolute;left:0;top:0;right:0;bottom:0;background-image:linear-gradient(${rgba(c.secondary, 0.2)} 1px, transparent 1px),linear-gradient(90deg, ${rgba(c.secondary, 0.2)} 1px, transparent 1px);background-size:30px 30px;}
.cd-t-template_blueprint .bp-frame{position:absolute;left:36px;right:36px;top:36px;bottom:36px;border:4px solid var(--ink);padding:2px;}
.cd-t-template_blueprint .bp-frame-in{height:100%;border:2px solid var(--ink);}
.cd-t-template_blueprint .cd-hdr{display:flex;border-bottom:4px double var(--ink);padding-bottom:14px;margin-bottom:18px;}
.cd-t-template_blueprint .bp-hl{flex:2 1 0;min-width:0;border-right:2px solid var(--ink);padding-right:20px;}
.cd-t-template_blueprint .bp-hdr-solo .bp-hl{border-right:0;}
.cd-t-template_blueprint .bp-logo{margin-bottom:12px;}
.cd-t-template_blueprint .bp-logo .cd-logo{max-height:52px;max-width:230px;}
.cd-t-template_blueprint .cd-title{color:var(--ink);font-weight:700;text-transform:uppercase;letter-spacing:.01em;line-height:1.05;}
.cd-t-template_blueprint .bp-no{font-size:13px;margin-top:6px;text-transform:uppercase;letter-spacing:.03em;overflow-wrap:anywhere;}
.cd-t-template_blueprint .bp-hl .cd-status{margin-top:10px;}
.cd-t-template_blueprint .bp-hr{flex:1 1 0;min-width:0;padding-left:20px;}
.cd-t-template_blueprint .bp-cell+.bp-cell{margin-top:8px;}
.cd-t-template_blueprint .bp-k{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.cd-t-template_blueprint .bp-v{font-size:15px;line-height:1.3;overflow-wrap:anywhere;}
.cd-t-template_blueprint .bp-parties{gap:20px;margin-bottom:20px;align-items:stretch;}
.cd-t-template_blueprint .bp-co{flex:1 1 0;min-width:0;padding:13px 0 0;}
.cd-t-template_blueprint .bp-party{flex:1 1 0;min-width:0;border:1px solid var(--ink);padding:13px 15px;}
.cd-t-template_blueprint .bp-chip{display:inline-block;background:#ffffff;color:var(--bp-ink);font-size:10px;padding:2px 5px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;}
.cd-t-template_blueprint .bp-name{font-size:16px;margin-bottom:4px;overflow-wrap:anywhere;}
.cd-t-template_blueprint .cd-lines{color:var(--ink);font-size:12px;line-height:1.6;}
.cd-t-template_blueprint .cd-table{border:2px solid #ffffff;background:#ffffff;}
.cd-t-template_blueprint .cd-table th{background:#ffffff;color:var(--bp-ink);font-size:11px;font-weight:700;letter-spacing:.03em;padding:10px;border-right:1px solid var(--bp-ink);border-bottom:2px solid var(--bp-ink);}
.cd-t-template_blueprint .cd-table th.cd-col-last{border-right:0;}
.cd-t-template_blueprint .cd-table td{background:#ffffff;color:var(--bp-ink);padding:10px 12px;border-bottom:0;border-right:1px solid ${rgba(onWhite, 0.13)};font-size:12px;}
.cd-t-template_blueprint .cd-table td.cd-col-last{border-right:0;}
.cd-t-template_blueprint .cd-table .cd-muted,.cd-t-template_blueprint .cd-item-sub,.cd-t-template_blueprint .cd-row-empty td{color:${mix(onWhite, '#ffffff', 0.35)};}
.cd-t-template_blueprint .cd-summary{margin-top:10px;}
.cd-t-template_blueprint .cd-totals{flex:0 0 300px;}
.cd-t-template_blueprint .cd-tot{padding:8px 0;border-bottom:1px solid var(--ink);font-size:12px;}
.cd-t-template_blueprint .cd-tot-label{color:var(--ink);text-transform:uppercase;}
.cd-t-template_blueprint .cd-tot-grand{background:none;color:var(--ink);border-radius:0;border-bottom:0;margin:0;padding:12px 0;font-size:24px;font-weight:700;align-items:baseline;flex-wrap:wrap;column-gap:12px;}
.cd-t-template_blueprint .cd-tot-grand .cd-tot-label{font-size:15px;}
.cd-t-template_blueprint .cd-tot-grand .cd-tot-value{margin-left:auto;}
.cd-t-template_blueprint .cd-tot-balance{border-top:2px solid var(--ink);border-bottom:0;}
.cd-t-template_blueprint .cd-label{color:var(--muted);}
.cd-t-template_blueprint .cd-pay-btn{background:#ffffff;color:var(--bp-ink);border-radius:0;}
.cd-t-template_blueprint .cd-sum-closing{color:var(--ink);text-transform:uppercase;font-size:12px;letter-spacing:.04em;}
.cd-t-template_blueprint .cd-h{display:inline-block;background:#ffffff;color:var(--bp-ink);font-family:var(--font-body);font-size:10.5px;letter-spacing:.06em;padding:2px 6px;}
.cd-t-template_blueprint .cd-prose h1,.cd-t-template_blueprint .cd-prose h2,.cd-t-template_blueprint .cd-prose h3{font-family:var(--font-body);color:var(--ink);}
.cd-t-template_blueprint .cd-prose h3{font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;margin-top:11px;}
.cd-t-template_blueprint .cd-prose blockquote{color:var(--muted);border-left-color:var(--ink);}
.cd-t-template_blueprint .cd-prose a{color:var(--ink);}
.cd-t-template_blueprint .cd-fact{background:transparent;border:1px solid var(--ink);border-radius:0;}
.cd-t-template_blueprint .cd-fact-value{color:var(--ink);}
${soloFact('.cd-t-template_blueprint')}
.cd-t-template_blueprint .cd-tag{background:transparent;border:1px solid var(--ink);color:var(--ink);border-radius:0;}
.cd-t-template_blueprint .cd-sig{border:2px solid var(--ink);padding:8px 10px;max-width:250px;display:flex;flex-direction:column;}
.cd-t-template_blueprint .cd-sig-label{order:-1;margin:0 0 2px;font-size:10px;color:var(--ink);}
.cd-t-template_blueprint .cd-sig-img{height:40px;justify-content:center;align-items:center;}
.cd-t-template_blueprint .cd-sig-img img{max-height:35px;max-width:190px;}
.cd-t-template_blueprint .cd-sig-line{border-top:1px solid var(--ink);margin-top:2px;}
.cd-t-template_blueprint .cd-sig-meta{font-size:10px;text-align:center;text-transform:uppercase;}
.cd-t-template_blueprint .cd-sig-blank{border:0;padding:8px 0 0;}
.cd-t-template_blueprint .cd-sig-blank .cd-sig-img{height:30px;}
.cd-t-template_blueprint .cd-closing-text{color:var(--ink);text-transform:uppercase;}
.cd-t-template_blueprint .cd-footer{color:var(--muted);}
${negativeCss('.cd-t-template_blueprint', '.bp-logo .cd-logo', 'invert(1)')}
${darkTones('.cd-t-template_blueprint')}
`;
  },
};

// ---------------------------------------------------------------------------
// 13. Abstract Memphis
// ---------------------------------------------------------------------------
const memphisTeal = (ctx: RenderCtx) => (ctx.c.custom ? mix(ctx.c.accent, ctx.c.secondary, 0.5) : '#00ced1');

const memphis: ThemeDef = {
  id: 'template_memphis',
  pad: { top: 46, x: 56, bottom: 82, footer: 26 },
  ink: '#000000',
  header: ({ m }) => block(`cd-hdr${m.title.length <= 18 ? ' mp-hdr-1l' : ''}`, `
    <div class="mp-titlebox">${titleH1(m)}</div>
    ${m.company.logoUrl ? `<div class="mp-logo">${logoImg(m)}</div>` : ''}
    <div class="mp-sub"><div class="mp-dots cd-deco"><i></i><i></i><i class="mp-dot-p"></i></div>${statusBadge(m)}</div>`),
  parties: (ctx) => {
    const { m } = ctx;
    const rows = metaRows(ctx);
    // two parties + a short details list: one row of three cards; a long list: a wide two-column card below
    const three = m.parties.length === 2 && rows.length > 0 && rows.length <= 2;
    const wide = !three && m.parties.length !== 1 && rows.length >= 2;
    const cards = [
      ...m.parties.map((p, i) => `<div class="mp-card ${i % 2 ? 'mp-sh-p' : 'mp-sh-t'}"><div class="mp-ct">${p.label}</div>${p.name ? `<div class="mp-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      rows.length ? `<div class="mp-card mp-sh-y${wide ? ' mp-wide' : ''}"><div class="mp-ct">Details</div><div class="mp-rows">${rows.map((r) => `<div class="mp-row"><span>${r.label}${/[.:]$/.test(r.label) ? '' : ':'}</span><span class="mp-rv">${r.value}</span></div>`).join('')}</div></div>` : '',
    ].join('');
    return cards ? block(`mp-cards${three ? ' mp-three' : ''}`, cards) : '';
  },
  chrome: () => '<div class="cd-first-only mp-circle cd-deco"></div><div class="cd-last-only mp-diamond cd-deco"></div>',
  footer: ({ m }) => {
    const contact = [...m.company.addressLines, m.company.phone, m.company.email, m.company.website].filter(Boolean).join('<span class="cd-dot">·</span>');
    return `<div class="cd-footer mp-footer">${m.company.name ? `<div class="mp-f-name">${m.company.name}</div>` : ''}<div class="mp-f-line">${contact ? `<span class="cd-footer-text">${contact}</span>` : ''}<span class="cd-pageno"></span></div></div>`;
  },
  css: (ctx) => {
    const { c } = ctx;
    const thText = contrastRatio('#ffffff', c.accent) >= 3 ? '#ffffff' : c.onAccent;
    const totText = readableOn(c.secondary, '#ffffff', '#000000');
    return `
.cd-t-template_memphis{--title-size:48px;--mp-teal:${memphisTeal(ctx)};font-size:12.5px;}
.cd-t-template_memphis .mp-circle{position:absolute;right:-50px;top:-50px;width:200px;height:200px;border-radius:50%;background:var(--secondary);border:4px solid #000000;}
.cd-t-template_memphis .mp-diamond{position:absolute;left:-86px;bottom:-34px;width:150px;height:150px;background:var(--mp-teal);border:4px solid #000000;transform:rotate(45deg);}
.cd-t-template_memphis .cd-hdr{position:relative;display:flex;align-items:center;gap:24px;margin-bottom:42px;padding-left:6px;}
.cd-t-template_memphis .mp-titlebox{flex:0 1 auto;min-width:0;background:#000000;padding:18px 38px;transform:skewX(-15deg);box-shadow:10px 10px 0 var(--accent);}
.cd-t-template_memphis .mp-hdr-1l .mp-titlebox{flex:none;white-space:nowrap;}
.cd-t-template_memphis .cd-title{color:#ffffff;font-weight:900;text-transform:uppercase;transform:skewX(15deg);line-height:1.05;letter-spacing:.005em;}
.cd-t-template_memphis .mp-logo{flex:0 1 auto;min-width:0;margin:0 110px 0 auto;}
.cd-t-template_memphis .mp-logo .cd-logo{max-height:52px;max-width:100%;}
.cd-t-template_memphis .mp-sub{position:absolute;left:4px;bottom:-36px;display:flex;align-items:center;gap:20px;}
.cd-t-template_memphis .mp-dots{display:flex;gap:20px;}
.cd-t-template_memphis .mp-dots i{display:block;width:20px;height:20px;border-radius:50%;background:#000000;}
.cd-t-template_memphis .mp-dots .mp-dot-p{background:var(--accent);}
.cd-t-template_memphis .mp-sub .cd-status{margin-top:0;background:#ffffff;}
.cd-t-template_memphis .mp-cards{display:flex;flex-wrap:wrap;gap:30px 38px;margin-bottom:30px;}
.cd-t-template_memphis .mp-card{flex:1 1 calc(50% - 19px);min-width:0;background:#ffffff;border:4px solid #000000;padding:18px 22px;}
.cd-t-template_memphis .mp-three{flex-wrap:nowrap;gap:30px;}
.cd-t-template_memphis .mp-three .mp-card{flex:1 1 0;padding:16px 18px;}
.cd-t-template_memphis .mp-three .mp-ct{font-size:17px;}
.cd-t-template_memphis .mp-three .mp-name{font-size:15.5px;}
.cd-t-template_memphis .mp-sh-t{box-shadow:8px 8px 0 var(--mp-teal);}
.cd-t-template_memphis .mp-sh-p{box-shadow:8px 8px 0 var(--accent);}
.cd-t-template_memphis .mp-sh-y{box-shadow:8px 8px 0 var(--secondary);}
.cd-t-template_memphis .mp-ct{font-weight:900;font-size:19px;text-transform:uppercase;margin-bottom:8px;line-height:1.1;}
.cd-t-template_memphis .mp-name{font-size:17px;line-height:1.3;margin-bottom:4px;overflow-wrap:anywhere;}
.cd-t-template_memphis .cd-lines{color:#000000;font-size:13px;line-height:1.55;}
.cd-t-template_memphis .mp-row{display:flex;justify-content:space-between;gap:14px;font-size:12px;line-height:1.4;padding:3px 0;border-bottom:2px solid #000000;}
.cd-t-template_memphis .mp-row:last-child{border-bottom:0;}
.cd-t-template_memphis .mp-wide .mp-rows{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:34px;}
.cd-t-template_memphis .mp-wide .mp-row:nth-last-child(2):nth-child(odd){border-bottom:0;}
.cd-t-template_memphis .mp-rv{font-weight:700;text-align:right;overflow-wrap:anywhere;min-width:0;}
.cd-t-template_memphis .cd-table{border:4px solid #000000;}
.cd-t-template_memphis .cd-table th{background:var(--accent);color:${thText};font-size:12px;letter-spacing:.03em;padding:12px 14px;border-bottom:4px solid #000000;}
.cd-t-template_memphis .cd-table td{padding:11px 14px;border-bottom:2px solid #000000;font-size:12px;color:#000000;}
.cd-t-template_memphis .cd-table tbody tr:nth-child(even) td{background:#f0f0f0;}
.cd-t-template_memphis .cd-table td.cd-col-last{font-weight:700;}
.cd-t-template_memphis .cd-summary{margin-top:6px;align-items:center;}
.cd-t-template_memphis .cd-totals{flex:0 0 330px;background:var(--secondary);color:${totText};border:4px solid #000000;padding:18px 24px;transform:rotate(-2deg);box-shadow:10px 10px 0 #000000;margin:6px 12px 14px 0;}
.cd-t-template_memphis .cd-tot{font-weight:700;font-size:12.5px;padding:3px 0;}
.cd-t-template_memphis .cd-tot-label{color:inherit;text-transform:uppercase;}
.cd-t-template_memphis .cd-tot-grand{background:none;color:inherit;border-radius:0;margin-top:8px;padding:8px 0 0;border-top:2px solid #000000;font-size:19px;font-weight:900;flex-wrap:wrap;column-gap:12px;align-items:baseline;}
.cd-t-template_memphis .cd-tot-grand .cd-tot-label{font-size:16px;}
.cd-t-template_memphis .cd-tot-grand:first-child{margin-top:0;padding-top:0;border-top:0;}
.cd-t-template_memphis .cd-tot-grand .cd-tot-value{margin-left:auto;}
.cd-t-template_memphis .cd-tot-balance{border-top:2px solid #000000;}
.cd-t-template_memphis .cd-label{color:#000000;font-weight:900;}
.cd-t-template_memphis .cd-pay-btn{background:#000000;color:#ffffff;border-radius:0;box-shadow:5px 5px 0 var(--accent);}
.cd-t-template_memphis .cd-sum-closing{color:#000000;font-weight:900;text-transform:uppercase;letter-spacing:.02em;}
.cd-t-template_memphis .cd-h{display:inline-block;color:#000000;font-weight:900;font-size:13px;letter-spacing:.05em;padding:0 3px;background:linear-gradient(180deg, transparent 58%, ${c.secondary} 58%);}
.cd-t-template_memphis .cd-prose h1,.cd-t-template_memphis .cd-prose h2,.cd-t-template_memphis .cd-prose h3{color:#000000;font-weight:900;}
.cd-t-template_memphis .cd-prose h3{display:table;font-size:14px;padding:0 3px;margin-left:-3px;background:linear-gradient(180deg, transparent 58%, ${c.secondary} 58%);}
.cd-t-template_memphis .cd-prose blockquote{border-left:4px solid #000000;color:#000000;}
.cd-t-template_memphis .cd-fact{background:#ffffff;border:4px solid #000000;border-radius:0;box-shadow:6px 6px 0 var(--mp-teal);}
.cd-t-template_memphis .cd-fact-label{color:#000000;}
${soloFact('.cd-t-template_memphis')}
.cd-t-template_memphis .cd-fact-value{color:#000000;font-weight:900;}
.cd-t-template_memphis .cd-tag{background:#ffffff;border:2px solid #000000;color:#000000;font-weight:700;}
.cd-t-template_memphis .cd-sig{display:flex;flex-direction:column;background:#ffffff;border:4px solid #000000;padding:9px 13px;box-shadow:5px 5px 0 var(--accent);transform:rotate(1deg);max-width:280px;}
.cd-t-template_memphis .cd-sig-label{order:-1;margin:0 0 2px;color:#000000;font-weight:900;font-size:10px;}
.cd-t-template_memphis .cd-sig-img{height:42px;}
.cd-t-template_memphis .cd-sig-img img{max-height:42px;}
.cd-t-template_memphis .cd-sig-line{border-top:2px solid #000000;}
.cd-t-template_memphis .cd-sig-blank{background:none;border:0;box-shadow:none;padding:6px 0 0;transform:none;}
.cd-t-template_memphis .cd-sig-blank .cd-sig-img{height:34px;}
.cd-t-template_memphis .cd-sig-blank .cd-sig-line{border-top-width:3px;}
/* two signatures: notes above, the signature cards side by side */
.cd-t-template_memphis .cd-signoff:has(.cd-sig+.cd-sig){flex-direction:column;gap:18px;}
.cd-t-template_memphis .cd-signoff:has(.cd-sig+.cd-sig) .cd-signoff-notes{flex:none;width:100%;}
.cd-t-template_memphis .cd-signoff:has(.cd-sig+.cd-sig) .cd-signoff-sigs{flex:none;width:100%;flex-direction:row;align-items:flex-start;gap:40px;}
.cd-t-template_memphis .cd-signoff-sigs .cd-sig{flex:1 1 0;max-width:280px;}
.cd-t-template_memphis .cd-closing{text-align:center;}
.cd-t-template_memphis .cd-closing-text{color:#000000;font-weight:900;text-transform:uppercase;letter-spacing:.04em;}
.cd-t-template_memphis .mp-footer{flex-direction:column;justify-content:center;gap:3px;text-align:center;color:#000000;}
.cd-t-template_memphis .mp-f-name{font-weight:900;font-size:12px;letter-spacing:2px;text-transform:uppercase;}
.cd-t-template_memphis .mp-f-line{display:flex;justify-content:center;align-items:baseline;max-width:100%;font-size:9.5px;}
.cd-t-template_memphis .mp-f-line .cd-pageno{color:var(--muted);}
.cd-t-template_memphis .mp-f-line .cd-footer-text+.cd-pageno:not(:empty)::before{content:'\\00b7';margin:0 7px;opacity:.6;}
`;
  },
};

// ---------------------------------------------------------------------------
// 14. Crimson Noir
// ---------------------------------------------------------------------------
const crimson: ThemeDef = {
  id: 'template_crimson',
  pad: { top: 58, x: 60, bottom: 84, footer: 30 },
  ink: '#e0e0e0',
  header: (ctx) => {
    const { m } = ctx;
    const rows = metaRows(ctx);
    return block('cd-hdr', `
      <div class="cn-left">${m.company.logoUrl ? `<div class="cn-logo">${logoImg(m)}</div>` : ''}${m.company.name ? `<div class="cn-co">${m.company.name}</div>` : ''}${titleH1(m)}</div>
      <div class="cn-right">${rows.map((r) => `<div><span class="cn-k">${r.label}</span> ${r.value}</div>`).join('')}${statusBadge(m)}</div>`);
  },
  parties: ({ m }) => (m.parties.length
    ? block('cd-parties cn-parties', m.parties.map((p) => `<div class="cd-party"><div class="cn-lbl">${p.label}</div>${p.name ? `<div class="cn-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join(''))
    : ''),
  chrome: () => '<div class="cn-bar cd-deco"></div>',
  footer: ({ m }) => {
    const contact = [m.company.phone, m.company.email, m.company.website].filter(Boolean).join('<span class="cd-dot">·</span>');
    const addr = m.company.addressLines.join(', ');
    return `<div class="cd-footer cn-footer"><div class="cd-footer-text">${contact}</div><div class="cn-f-right">${addr ? `<span>${addr}</span>` : ''}<span class="cd-pageno"></span></div></div>`;
  },
  css: (ctx) => {
    const { c, m } = ctx;
    const rowA = mix(c.ink, c.paper, 0.9);
    const rowB = mix(c.ink, c.paper, 0.95);
    const line = mix(c.ink, c.paper, 0.82);
    const qtyCol = m.items?.columns[1]?.label === 'Qty';
    return `
.cd-t-template_crimson{--title-size:50px;--cn-line:${line};font-size:12.5px;}
.cd-t-template_crimson .cn-bar{position:absolute;left:0;right:0;top:0;height:10px;background:var(--accent);box-shadow:0 0 20px ${rgba(c.accent, 0.8)};}
.cd-t-template_crimson .cd-hdr{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;border-bottom:1px solid var(--cn-line);padding-bottom:20px;margin-bottom:32px;}
.cd-t-template_crimson .cn-left{min-width:0;}
.cd-t-template_crimson .cn-logo{margin-bottom:14px;}
.cd-t-template_crimson .cn-logo .cd-logo{max-height:48px;max-width:190px;}
.cd-t-template_crimson .cn-co{color:var(--accent-ink);font-size:14px;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px;overflow-wrap:anywhere;}
.cd-t-template_crimson .cd-title{color:var(--ink);font-weight:400;letter-spacing:-1px;text-transform:uppercase;line-height:1.05;}
.cd-t-template_crimson .cn-right{text-align:right;font-size:13px;line-height:1.6;color:${mix(c.ink, c.paper, 0.25)};max-width:48%;overflow-wrap:anywhere;}
.cd-t-template_crimson .cn-k{color:var(--muted);font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-right:4px;}
.cd-t-template_crimson .cn-right .cd-status{margin-top:8px;}
.cd-t-template_crimson .cn-parties{gap:40px;margin-bottom:30px;}
.cd-t-template_crimson .cn-lbl{color:var(--accent-ink);font-size:12px;letter-spacing:2px;text-transform:uppercase;}
.cd-t-template_crimson .cn-name{font-size:22px;margin-top:8px;line-height:1.25;overflow-wrap:anywhere;}
.cd-t-template_crimson .cd-lines{color:var(--muted);font-size:12.5px;margin-top:4px;}
.cd-t-template_crimson .cd-table th{color:var(--accent-ink);font-size:10px;letter-spacing:2px;padding:14px 18px;border-bottom:2px solid var(--accent);}
.cd-t-template_crimson .cd-table td{padding:13px 18px;border-bottom:1px solid var(--cn-line);color:var(--ink);font-size:12.5px;}
.cd-t-template_crimson .cd-table tbody tr:nth-child(odd) td{background:${rowA};}
.cd-t-template_crimson .cd-table tbody tr:nth-child(even) td{background:${rowB};}
${qtyCol ? '.cd-t-template_crimson .cd-table td.cd-col-1{color:var(--accent-ink);text-align:center;}.cd-t-template_crimson .cd-table th.cd-col-1{text-align:center;}' : ''}
.cd-t-template_crimson .cd-summary{margin-top:14px;}
.cd-t-template_crimson .cd-totals{flex:0 0 310px;}
.cd-t-template_crimson .cd-tot{padding:5px 0;}
.cd-t-template_crimson .cd-tot-label,.cd-t-template_crimson .cd-tot-value{color:var(--muted);font-weight:400;}
.cd-t-template_crimson .cd-tot-grand{background:none;border-radius:0;border-top:1px solid var(--cn-line);margin-top:14px;padding:16px 0 0;align-items:baseline;flex-wrap:wrap;column-gap:12px;}
.cd-t-template_crimson .cd-tot-grand:first-child{margin-top:0;}
.cd-t-template_crimson .cd-tot-grand .cd-tot-value{margin-left:auto;}
.cd-t-template_crimson .cd-tot-grand .cd-tot-label{color:var(--ink);font-size:13px;text-transform:uppercase;}
.cd-t-template_crimson .cd-tot-grand .cd-tot-value{color:var(--ink);font-size:28px;font-weight:400;}
.cd-t-template_crimson .cd-tot-balance{border-top:1px solid var(--cn-line);}
.cd-t-template_crimson .cd-tot-balance .cd-tot-label,.cd-t-template_crimson .cd-tot-balance .cd-tot-value{color:var(--ink);}
.cd-t-template_crimson .cd-label{color:var(--accent-ink);letter-spacing:2px;font-weight:400;}
.cd-t-template_crimson .cd-pay-btn{background:var(--accent);color:var(--on-accent);border-radius:0;letter-spacing:1px;}
.cd-t-template_crimson .cd-sum-closing{color:var(--ink);font-weight:400;font-style:italic;font-size:15px;}
.cd-t-template_crimson .cd-h{color:var(--accent-ink);font-family:var(--font-body);font-weight:400;font-size:11px;letter-spacing:2px;}
.cd-t-template_crimson .cd-prose h1,.cd-t-template_crimson .cd-prose h2{font-weight:400;color:var(--ink);}
.cd-t-template_crimson .cd-prose h3{font-family:var(--font-body);font-weight:400;font-size:11.5px;letter-spacing:2px;text-transform:uppercase;color:var(--accent-ink);margin-top:16px;}
.cd-t-template_crimson .cd-prose blockquote{border-left-color:var(--accent);}
.cd-t-template_crimson .cd-fact{background:${rowA};border:1px solid var(--cn-line);border-radius:0;}
.cd-t-template_crimson .cd-fact-value{color:var(--ink);font-weight:400;}
${soloFact('.cd-t-template_crimson')}
.cd-t-template_crimson .cd-tag{background:transparent;border:1px solid var(--accent);color:var(--ink);}
.cd-t-template_crimson .cd-sig{display:flex;flex-direction:column;max-width:260px;}
.cd-t-template_crimson .cd-sig-label{order:-1;margin:0 0 10px;color:var(--accent-ink);font-size:10px;letter-spacing:2px;font-weight:400;}
.cd-t-template_crimson .cd-sig-img{height:52px;}
.cd-t-template_crimson .cd-sig-img img{max-height:52px;max-width:200px;}
.cd-t-template_crimson .cd-sig-blank .cd-sig-img{height:36px;}
.cd-t-template_crimson .cd-sig-line{border-top:1px solid var(--accent);margin-top:5px;}
.cd-t-template_crimson .cd-sig-meta{color:var(--muted);}
.cd-t-template_crimson .cd-closing-text{color:var(--ink);font-weight:400;font-style:italic;}
.cd-t-template_crimson .cn-footer{border-top:1px solid var(--cn-line);padding-top:12px;font-size:9px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);align-items:flex-start;}
.cd-t-template_crimson .cn-footer .cd-footer-text{white-space:normal;}
.cd-t-template_crimson .cn-f-right{display:flex;gap:14px;flex:0 1 auto;max-width:55%;text-align:right;}
.cd-t-template_crimson .cn-f-right .cd-pageno{flex:none;}
.cd-t-template_crimson .cd-prose a{color:var(--accent-ink);}
${negativeCss('.cd-t-template_crimson', '.cn-logo .cd-logo', 'grayscale(100%) invert(100%)')}
${darkTones('.cd-t-template_crimson')}
`;
  },
};

// ---------------------------------------------------------------------------
// 15. Watercolor
// ---------------------------------------------------------------------------
const watercolor: ThemeDef = {
  id: 'template_watercolor',
  pad: { top: 46, x: 60, bottom: 72, footer: 28 },
  ink: '#333333',
  header: (ctx) => {
    const { m } = ctx;
    const rows = metaRows(ctx, false);
    // the original centered brand: logo (or the italic company name), the pink-blue rule, the address
    const contact = [m.company.addressLines.join(', '), [m.company.phone, m.company.email, m.company.website].filter(Boolean).join('<span class="cd-dot">·</span>')].filter(Boolean);
    const brand = `${m.company.logoUrl ? `${logoImg(m)}${m.company.name ? `<div class="wc-co wc-co-sm">${m.company.name}</div>` : ''}` : m.company.name ? `<div class="wc-co">${m.company.name}</div>` : ''}<div class="wc-line"></div>${lines(contact)}`;
    const title = `${titleH1(m)}${m.number ? `<div class="wc-no">${m.number}</div>` : ''}`;
    const meta = rows.map((r) => `<div class="wc-mr"><span class="wc-mk">${r.label}</span> ${r.value}</div>`).join('');
    const parties = m.parties.map((p) => `<div class="wc-party"><div class="wc-lbl">${p.label}</div>${p.name ? `<div class="wc-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('');
    // parties left, title + details right (the original); without parties: title left, details right
    const card = parties
      ? `<div class="wc-left">${parties}</div><div class="wc-right">${title}${meta}${statusBadge(m)}</div>`
      : `<div class="wc-left wc-left-title">${title}${statusBadge(m)}</div>${meta ? `<div class="wc-right wc-right-meta">${meta}</div>` : ''}`;
    return block('cd-hdr', brand) + block('wc-card', card);
  },
  parties: () => '',
  chrome: (ctx) => {
    const { c } = ctx;
    // the original blobs: radial gradients softened with a real blur
    const [a1, a2, b1, b2] = c.custom
      ? [rgba(c.secondary, 0.22), rgba(mix(c.secondary, c.accent, 0.5), 0.2), rgba(c.accent, 0.22), rgba(mix(c.accent, c.secondary, 0.3), 0.2)]
      : ['rgba(238,130,238,0.2)', 'rgba(135,206,235,0.2)', 'rgba(255,160,122,0.2)', 'rgba(255,105,180,0.2)'];
    const blob = (cls: string, x: string, y: string) =>
      `<div class="wc-blob ${cls} cd-deco" style="background:radial-gradient(circle, ${x} 0%, ${y} 50%, transparent 70%)"></div>`;
    return blob('wc-blob-a', a1, a2) + blob('wc-blob-b', b1, b2);
  },
  footer: () => '<div class="cd-footer wc-footer"><div class="cd-footer-text">~ Created with art &amp; soul ~</div><div class="cd-pageno"></div></div>',
  css: ({ c }) => {
    const soft = mix(c.ink, c.paper, 0.22);
    const faint = mix(c.ink, c.paper, 0.48);
    const line = c.custom ? `linear-gradient(90deg, ${c.accent}, ${c.secondary})` : 'linear-gradient(90deg, #ffb6c1, #87cefa)';
    return `
.cd-t-template_watercolor{--title-size:32px;--wc-soft:${soft};--wc-faint:${faint};font-size:12.5px;}
.cd-t-template_watercolor .wc-blob{position:absolute;}
.cd-t-template_watercolor .wc-blob-a{left:-100px;top:-100px;width:500px;height:500px;border-radius:40%;filter:blur(40px);}
.cd-t-template_watercolor .wc-blob-b{right:-50px;bottom:-50px;width:400px;height:400px;border-radius:45%;filter:blur(30px);}
.cd-t-template_watercolor .cd-hdr{text-align:center;margin-bottom:20px;}
.cd-t-template_watercolor .cd-hdr .cd-logo{margin:0 auto 8px;max-height:60px;max-width:240px;}
.cd-t-template_watercolor .wc-co{font-family:var(--font-head);font-style:italic;font-size:34px;line-height:1.15;color:var(--ink);margin-bottom:12px;}
.cd-t-template_watercolor .wc-co-sm{font-size:17px;margin:-2px 0 8px;}
.cd-t-template_watercolor .wc-line{height:2px;width:100px;background:${line};margin:0 auto 10px;}
.cd-t-template_watercolor .cd-hdr .cd-lines{color:var(--wc-soft);font-size:13px;line-height:1.45;}
.cd-t-template_watercolor .wc-card{display:flex;justify-content:space-between;gap:28px;background:rgba(255,255,255,0.8);border:1px solid rgba(0,0,0,0.05);border-radius:15px;padding:20px 30px;margin-bottom:20px;box-shadow:0 10px 30px rgba(0,0,0,0.03);}
.cd-t-template_watercolor .wc-left{flex:1 1 auto;min-width:0;}
.cd-t-template_watercolor .wc-left-title{flex:0 1 auto;align-self:center;}
.cd-t-template_watercolor .wc-left-title .cd-title{margin-bottom:6px;}
.cd-t-template_watercolor .wc-left-title .wc-no{color:var(--wc-soft);}
.cd-t-template_watercolor .wc-right-meta{align-self:center;}
.cd-t-template_watercolor .wc-party+.wc-party{margin-top:12px;}
.cd-t-template_watercolor .wc-lbl{font-size:11px;color:var(--wc-faint);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;}
.cd-t-template_watercolor .wc-name{font-size:18.5px;line-height:1.3;color:var(--ink);margin-bottom:3px;overflow-wrap:anywhere;}
.cd-t-template_watercolor .wc-card .cd-lines{color:var(--wc-soft);font-size:13px;}
.cd-t-template_watercolor .wc-right{flex:0 1 auto;max-width:52%;text-align:right;color:var(--wc-soft);font-size:13px;line-height:1.6;overflow-wrap:anywhere;}
.cd-t-template_watercolor .cd-title{color:var(--ink);font-weight:400;line-height:1.1;margin-bottom:10px;text-transform:uppercase;letter-spacing:.01em;}
.cd-t-template_watercolor .wc-no{font-size:13.5px;}
.cd-t-template_watercolor .wc-mk{color:var(--wc-faint);font-size:11px;}
.cd-t-template_watercolor .wc-right .cd-status{margin-top:8px;}
.cd-t-template_watercolor .cd-table th{color:var(--wc-faint);font-weight:400;font-size:11.5px;letter-spacing:.02em;padding:14px;}
.cd-t-template_watercolor .cd-table td{padding:11px 14px;border-bottom:1px solid rgba(0,0,0,0.06);color:var(--wc-soft);font-size:12.5px;}
.cd-t-template_watercolor .cd-table td.cd-col-last{color:var(--ink);font-weight:700;}
.cd-t-template_watercolor .cd-summary{margin-top:8px;}
.cd-t-template_watercolor .cd-totals{flex:0 0 320px;background:rgba(255,255,255,0.8);border-radius:15px;padding:20px 22px;}
.cd-t-template_watercolor .cd-tot{padding:4px 0;}
.cd-t-template_watercolor .cd-tot-label{color:var(--wc-soft);}
.cd-t-template_watercolor .cd-tot-value{font-weight:400;color:var(--wc-soft);}
.cd-t-template_watercolor .cd-tot-grand{background:none;color:var(--ink);border-radius:0;border-top:1px solid #eeeeee;margin-top:12px;padding:14px 0 0;font-size:23px;font-weight:400;font-family:var(--font-head);align-items:baseline;flex-wrap:wrap;column-gap:12px;}
.cd-t-template_watercolor .cd-tot-grand:first-child{margin-top:0;padding-top:0;border-top:0;}
.cd-t-template_watercolor .cd-tot-grand .cd-tot-value{margin-left:auto;}
.cd-t-template_watercolor .cd-tot-grand .cd-tot-label,.cd-t-template_watercolor .cd-tot-grand .cd-tot-value{color:var(--ink);font-weight:400;}
.cd-t-template_watercolor .cd-tot-grand .cd-tot-label{font-size:16px;}
.cd-t-template_watercolor .cd-tot-balance{border-top:1px solid #eeeeee;}
.cd-t-template_watercolor .cd-tot-balance .cd-tot-label,.cd-t-template_watercolor .cd-tot-balance .cd-tot-value{color:var(--ink);font-weight:700;}
.cd-t-template_watercolor .cd-label{color:var(--wc-faint);font-weight:400;letter-spacing:1px;}
.cd-t-template_watercolor .cd-pay-btn{background:var(--accent);color:var(--on-accent);border-radius:999px;}
.cd-t-template_watercolor .cd-sum-closing{color:var(--ink);font-weight:400;font-style:italic;}
.cd-t-template_watercolor .cd-h{color:var(--wc-faint);font-family:var(--font-body);font-weight:400;font-size:11px;letter-spacing:1px;}
.cd-t-template_watercolor .cd-prose h1,.cd-t-template_watercolor .cd-prose h2,.cd-t-template_watercolor .cd-prose h3{color:var(--ink);font-weight:400;}
.cd-t-template_watercolor .cd-prose h3{font-size:15px;margin-top:10px;}
.cd-t-template_watercolor .cd-prose blockquote{border-left:2px solid ${c.custom ? c.accent : '#ffb6c1'};}
.cd-t-template_watercolor .cd-fact{background:rgba(255,255,255,0.82);border:1px solid rgba(0,0,0,0.06);border-radius:12px;}
.cd-t-template_watercolor .cd-fact-value{color:var(--ink);font-weight:400;}
${soloFact('.cd-t-template_watercolor')}
.cd-t-template_watercolor .cd-tag{background:rgba(255,255,255,0.82);border:1px solid rgba(0,0,0,0.08);color:var(--wc-soft);}
.cd-t-template_watercolor .cd-sigs{justify-content:flex-end;}
.cd-t-template_watercolor .cd-sig{text-align:center;max-width:260px;}
.cd-t-template_watercolor .cd-sig-img{justify-content:center;height:44px;}
.cd-t-template_watercolor .cd-sig-img img{max-height:44px;max-width:180px;opacity:.8;}
.cd-t-template_watercolor .cd-sig-line{display:none;}
.cd-t-template_watercolor .cd-sig-blank .cd-sig-line{display:block;border-top:1px solid var(--wc-faint);}
.cd-t-template_watercolor .cd-sig-label{font-family:'Dancing Script','Brush Script MT',cursive;font-size:16px;line-height:1.3;font-weight:600;letter-spacing:0;text-transform:none;color:var(--wc-soft);margin-top:0;}
.cd-t-template_watercolor .cd-sig-meta{color:var(--wc-faint);font-size:10.5px;}
.cd-t-template_watercolor .cd-closing{text-align:center;}
.cd-t-template_watercolor .cd-closing-text{color:var(--ink);font-weight:400;font-style:italic;}
.cd-t-template_watercolor .wc-footer{justify-content:center;gap:14px;color:var(--wc-faint);font-size:10.5px;}
`;
  },
};

export const DESIGNS: DesignDef[] = [
  {
    meta: {
      id: 'template_vintage', name: 'Vintage Craft', collection: 'premium',
      description: 'Typewriter type on old-lace paper, a double frame and hand-placed, slightly tilted boxes.',
      accent: '#4b3621', secondary: '#8b4513', paper: '#fdf5e6', headFont: 'courier', bodyFont: 'courier',
      tags: ['vintage', 'craft', 'typewriter', 'paper'],
    },
    theme: vintage,
  },
  {
    meta: {
      id: 'template_blueprint', name: 'Blueprint Tech', collection: 'premium',
      description: 'Blueprint grid paper, a white double frame and a technical title block.',
      accent: '#003366', secondary: '#ffffff', paper: '#003366', headFont: 'consolas', bodyFont: 'consolas',
      tags: ['blueprint', 'technical', 'dark', 'grid'],
    },
    theme: blueprint,
  },
  {
    meta: {
      id: 'template_memphis', name: 'Abstract Memphis', collection: 'premium',
      description: 'A skewed black title, offset-shadow cards and bold yellow, teal and purple shapes.',
      accent: '#9370db', secondary: '#ffd700', paper: '#ffffff', headFont: 'helvetica', bodyFont: 'helvetica',
      tags: ['memphis', 'playful', 'bold', 'colorful'],
    },
    theme: memphis,
  },
  {
    meta: {
      id: 'template_crimson', name: 'Crimson Noir', collection: 'premium',
      description: 'Black paper, a glowing crimson bar and crimson labels with classic serif type.',
      accent: '#dc143c', secondary: '#333333', paper: '#0a0a0a', headFont: 'times', bodyFont: 'times',
      tags: ['dark', 'noir', 'crimson', 'serif'],
    },
    theme: crimson,
  },
  {
    meta: {
      id: 'template_watercolor', name: 'Watercolor', collection: 'premium',
      description: 'Soft watercolor washes, Georgia type and rounded translucent cards.',
      accent: '#ffb6c1', secondary: '#87cefa', paper: '#ffffff', headFont: 'georgia', bodyFont: 'georgia', extraFonts: ['script'],
      tags: ['watercolor', 'artistic', 'soft', 'serif'],
    },
    theme: watercolor,
  },
];
