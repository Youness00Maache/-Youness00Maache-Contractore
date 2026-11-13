/**
 * Original Premium designs 16-20 (pre-2026-11 `thirdSetTemplates.ts`), restored under their original ids:
 * Swiss Grid, Space Odyssey, Retro Terminal, Playful Pop and Elegant Serif.
 *
 * Ported to the shared engine: every document type renders through the model (labels, totals, signatures,
 * sections), colors come from the palette (the original colors are the defaults), and decorations are page
 * chrome so continuation pages keep the look. Fixed from the originals: hardcoded "INVOICE"/"Bill to"/
 * "Invoice #", missing logo/notes/terms/tax lines, the overlapping vertical title (Swiss), the doubled
 * signature and fixed tagline (Elegant Serif), and unreadable dark-on-dark text (Space, Retro).
 */
import type { DesignDef, RenderCtx, ThemeDef } from '../blocks.ts';
import {
  block, closingInline, defaultCompose, hasSummary, lines, logoImg, payButton, statusBadge, summaryNotes, totalsHtml,
} from '../blocks.ts';
import { mix, readableOn } from '../colors.ts';
import { rgba } from '../kit.ts';
import type { TotalLine } from '../model.ts';

/** Number + meta items as label/value rows (document details). */
const detailRows = ({ m }: RenderCtx) =>
  [m.number ? { label: m.numberLabel, value: m.number } : null, ...m.meta].filter(Boolean) as Array<{ label: string; value: string }>;

/** Readable status colors on dark paper. */
const darkFixes = (cls: string) => `
.${cls} .cd-tone-good{color:#4ade80;} .${cls} .cd-tone-bad{color:#f87171;} .${cls} .cd-tone-warn{color:#fbbf24;}
.${cls} .cd-neg{color:#f87171;}
.${cls} .cd-prose mark{color:#111111;text-shadow:none;}
.${cls} .cd-prose th{background:rgba(255,255,255,.06);}
`;

// ---------------------------------------------------------------------------
// 16. Swiss Grid: red edge strip, details sidebar with a vertical title, heavy black grid table
// ---------------------------------------------------------------------------
const swissTitleSize = (title: string) => (title.length <= 8 ? 60 : title.length <= 10 ? 54 : title.length <= 12 ? 48 : 42);

const swiss: ThemeDef = {
  id: 'template_swiss',
  pad: { top: 60, x: 52, left: 272, bottom: 72 },
  header: ({ m }) => block('cd-hdr', `${logoImg(m)}${m.company.name ? `<h1 class="sw-co">${m.company.name}</h1>` : ''}${lines(m.company.compactLines, 'sw-co-lines')}${statusBadge(m)}`),
  parties: ({ m }) => (m.parties.length
    ? block('cd-parties sw-parties', m.parties.map((p) => `<div class="cd-party"><div class="sw-plabel">${p.label}</div>${p.name ? `<div class="sw-pname">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join(''))
    : ''),
  chrome: (ctx) => {
    const rows = detailRows(ctx);
    const details = rows.length
      ? `<div class="sw-details cd-first-only">${rows.map((r) => `<div class="sw-dl">${r.label}</div><div class="sw-dv">${r.value}</div>`).join('')}</div>`
      : '';
    return `<div class="sw-strip"></div><div class="sw-rule"></div><div class="sw-side">${details}<div class="sw-titlebox"><div class="sw-vtitle" style="font-size:${swissTitleSize(ctx.m.title)}px">${ctx.m.title}</div></div></div>`;
  },
  css: () => `
.cd-t-template_swiss .sw-strip{position:absolute;left:0;top:0;bottom:0;width:20px;background:var(--accent);}
.cd-t-template_swiss .sw-rule{position:absolute;left:218px;top:0;bottom:0;width:2px;background:var(--ink);}
.cd-t-template_swiss .sw-side{position:absolute;left:40px;top:58px;bottom:58px;width:162px;display:flex;flex-direction:column;}
.cd-t-template_swiss .sw-details{flex:none;padding-bottom:22px;}
.cd-t-template_swiss .sw-dl{font-family:var(--font-head);font-weight:900;font-size:12px;letter-spacing:.02em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:3px;}
.cd-t-template_swiss .sw-dv{font-size:15px;line-height:1.3;margin-bottom:16px;overflow-wrap:anywhere;color:var(--ink);}
.cd-t-template_swiss .sw-titlebox{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;}
.cd-t-template_swiss .sw-vtitle{position:absolute;left:0;bottom:0;white-space:nowrap;font-family:var(--font-head);font-weight:900;line-height:.8;text-transform:uppercase;letter-spacing:-.01em;color:var(--ink);transform-origin:0 100%;transform:rotate(-90deg) translateY(100%);}
.cd-t-template_swiss .cd-hdr{border-bottom:10px solid var(--ink);padding-bottom:12px;margin-bottom:28px;}
.cd-t-template_swiss .cd-logo{max-height:52px;margin-bottom:14px;}
.cd-t-template_swiss .sw-co{font-family:var(--font-head);font-size:42px;font-weight:900;letter-spacing:-.04em;line-height:1.04;color:var(--ink);overflow-wrap:anywhere;}
.cd-t-template_swiss .sw-co-lines{font-weight:700;font-size:12px;line-height:1.5;color:var(--ink);margin-top:8px;overflow-wrap:anywhere;}
.cd-t-template_swiss .cd-hdr .cd-status{margin-top:12px;}
.cd-t-template_swiss .sw-parties{gap:28px;margin-bottom:28px;}
.cd-t-template_swiss .sw-plabel{font-family:var(--font-head);font-weight:900;font-size:13px;letter-spacing:.02em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:8px;}
.cd-t-template_swiss .sw-pname{font-size:22px;font-weight:700;line-height:1.2;margin-bottom:3px;overflow-wrap:anywhere;}
.cd-t-template_swiss .sw-parties .cd-lines{font-size:13.5px;line-height:1.5;color:var(--ink);}
.cd-t-template_swiss .cd-table{border:2px solid var(--ink);}
.cd-t-template_swiss .cd-table th{background:var(--secondary);color:var(--on-secondary);font-size:11px;font-weight:700;letter-spacing:.02em;padding:12px;}
.cd-t-template_swiss .cd-table td{padding:10px 12px;border-bottom:2px solid var(--ink);border-right:2px solid var(--ink);font-size:11.5px;}
.cd-t-template_swiss .cd-table td.cd-col-0,.cd-t-template_swiss .cd-table td.cd-col-last{font-weight:700;}
.cd-t-template_swiss .cd-table td.cd-col-last{border-right:0;}
.cd-t-template_swiss .cd-item-sub{font-weight:400;}
.cd-t-template_swiss .cd-summary{margin-top:14px;}
.cd-t-template_swiss .cd-totals{flex:0 0 320px;}
.cd-t-template_swiss .cd-tot{padding:7px 0;border-bottom:2px solid var(--ink);font-size:12.5px;}
.cd-t-template_swiss .cd-tot-label{color:var(--ink);font-weight:700;text-transform:uppercase;}
.cd-t-template_swiss .cd-tot-grand{flex-wrap:wrap;background:none;border:0;border-radius:0;color:var(--accent-ink);font-family:var(--font-head);font-size:28px;font-weight:900;line-height:1.1;padding:12px 0 4px;margin:0;}
.cd-t-template_swiss .cd-tot-grand .cd-tot-label{color:inherit;font-weight:900;}
.cd-t-template_swiss .cd-tot-grand .cd-tot-value{margin-left:auto;font-weight:900;}
.cd-t-template_swiss .cd-tot-balance{border-top:0;margin-top:0;padding-top:7px;font-size:15px;}
.cd-t-template_swiss .cd-pay-btn{border-radius:0;}
.cd-t-template_swiss .cd-h,.cd-t-template_swiss .cd-label,.cd-t-template_swiss .cd-sig-label{color:var(--accent-ink);font-family:var(--font-head);font-weight:900;font-size:12px;letter-spacing:.02em;}
.cd-t-template_swiss .cd-sum-closing,.cd-t-template_swiss .cd-closing-text{color:var(--ink);font-weight:900;}
.cd-t-template_swiss .cd-fact{background:var(--paper);border:2px solid var(--ink);border-radius:0;}
.cd-t-template_swiss .cd-fact-value{color:var(--ink);font-weight:900;}
.cd-t-template_swiss .cd-tag{border-radius:0;background:var(--ink);color:var(--paper);}
.cd-t-template_swiss .cd-sig-line{border-top:2px solid var(--ink);}
`,
};

// ---------------------------------------------------------------------------
// 17. Space Odyssey: deep-space page, glowing letter-spaced title, frosted parties panel, teal totals box
// ---------------------------------------------------------------------------
/** Stars only in the margins and the top band, never behind text (a star must not look like a decimal point). */
const starfield = (w: number, h: number, padX: number) => {
  let seed = 20260517;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dots: string[] = [];
  for (let i = 0; i < 400 && dots.length < 56; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.45 + rnd() * 0.9;
    const a = 0.2 + rnd() * 0.45;
    if (x > padX - 14 && x < w - padX + 14 && y > 46) continue;
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#ffffff" fill-opacity="${a.toFixed(2)}"/>`);
  }
  return `<svg class="so-stars" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${dots.join('')}</svg>`;
};

const space: ThemeDef = {
  id: 'template_space',
  pad: { top: 64, x: 60, bottom: 76 },
  ink: '#e0e0e0',
  header: ({ m }) => {
    const sub = [m.number ? `${m.numberLabel} ${m.number}` : '', m.keyDate ? `${m.keyDate.label}: ${m.keyDate.value}` : ''].filter(Boolean).join('<span class="so-sep">//</span>');
    return block('cd-hdr', `<h1 class="so-title">${m.title}</h1>${sub ? `<div class="so-sub">${sub}</div>` : ''}${statusBadge(m)}`);
  },
  parties: ({ m }) => {
    const company = m.company.name || m.company.lines.length || m.company.logoUrl
      ? `<div class="so-col"><div class="so-k">From</div>${m.company.logoUrl ? `<div class="so-logo">${logoImg(m)}</div>` : ''}${m.company.name ? `<div class="so-name">${m.company.name}</div>` : ''}${lines(m.company.compactLines)}</div>`
      : '';
    const cols = [company, ...m.parties.map((p) => `<div class="so-col"><div class="so-k">${p.label}</div>${p.name ? `<div class="so-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`)].filter(Boolean);
    const meta = m.meta.length ? `<div class="so-meta">${m.meta.map((i) => `<div class="so-mi"><div class="so-k">${i.label}</div><div class="so-mv">${i.value}</div></div>`).join('')}</div>` : '';
    if (!cols.length && !meta) return '';
    return block('cd-parties so-panel', `${cols.length ? `<div class="so-row${cols.length > 1 ? ' so-multi' : ''}">${cols.join('')}</div>` : ''}${meta}`);
  },
  chrome: ({ c, page }) => {
    const bg = c.custom
      ? `radial-gradient(circle at 50% -20%, ${mix(c.secondary, '#000000', 0.8)}, ${mix(c.secondary, '#000000', 0.93)} 40%, #000000 80%)`
      : 'radial-gradient(circle at 50% -20%, #20002c, #090014 40%, #000000 80%)';
    const glow = c.custom ? c.secondary : '#7b1fa2';
    return `<div class="so-bg" style="background:${bg}"></div><div class="so-glow" style="background:radial-gradient(circle, ${rgba(glow, 0.34)} 0%, ${rgba(glow, 0)} 70%)"></div>${starfield(page.width, page.height, 60)}`;
  },
  css: ({ c }) => `
.cd-t-template_space .so-bg{position:absolute;left:0;top:0;right:0;bottom:0;}
.cd-t-template_space .so-glow{position:absolute;top:100px;right:-50px;width:320px;height:320px;border-radius:50%;}
.cd-t-template_space .so-stars{position:absolute;left:0;top:0;}
.cd-t-template_space .cd-hdr{text-align:center;margin:4px 0 32px;}
.cd-t-template_space .so-title{font-family:var(--font-head);font-size:32px;font-weight:400;line-height:1.2;letter-spacing:10px;margin-right:-10px;text-transform:uppercase;color:var(--accent-ink);text-shadow:0 0 18px ${rgba(c.accentInk, 0.85)};}
.cd-t-template_space .so-sub{font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:12px;color:var(--secondary-ink);}
.cd-t-template_space .so-sep{display:inline-block;margin:0 12px;}
.cd-t-template_space .cd-hdr .cd-status{margin-top:14px;}
.cd-t-template_space .so-panel{display:block;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:24px 30px;margin-bottom:30px;}
.cd-t-template_space .so-row{display:flex;justify-content:space-between;gap:28px;}
.cd-t-template_space .so-col{flex:1 1 0;min-width:0;}
.cd-t-template_space .so-multi .so-col:last-child{text-align:right;}
.cd-t-template_space .so-multi .so-col:last-child .so-logo{margin-left:auto;}
.cd-t-template_space .so-k{color:#8b8b9e;font-size:9.5px;text-transform:uppercase;letter-spacing:2px;}
.cd-t-template_space .so-name{font-size:17px;color:#ffffff;margin-top:5px;line-height:1.3;overflow-wrap:anywhere;}
.cd-t-template_space .so-panel .cd-lines{font-size:11.5px;color:#aaaaaa;margin-top:3px;}
.cd-t-template_space .so-logo{display:block;width:max-content;max-width:100%;background:#ffffff;border-radius:8px;padding:5px 8px;margin:8px 0 2px;}
.cd-t-template_space .so-logo .cd-logo{max-height:34px;max-width:150px;}
.cd-t-template_space .so-meta{display:flex;flex-wrap:wrap;gap:12px 30px;border-top:1px solid rgba(255,255,255,.1);margin-top:18px;padding-top:14px;}
.cd-t-template_space .so-mi{min-width:0;max-width:100%;}
.cd-t-template_space .so-mv{font-size:12.5px;color:#ffffff;margin-top:3px;overflow-wrap:anywhere;}
.cd-t-template_space .cd-table th{color:var(--accent-ink);font-size:10.5px;letter-spacing:2px;padding:10px 12px;border-bottom:2px solid var(--accent);}
.cd-t-template_space .cd-table td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.2);color:var(--ink);font-size:11.5px;}
.cd-t-template_space .cd-table td.cd-col-1{color:var(--secondary-ink);}
.cd-t-template_space .cd-table td.cd-col-2{color:var(--accent-ink);}
.cd-t-template_space .cd-table td.cd-col-last{color:#ffffff;font-weight:700;text-shadow:0 0 8px rgba(255,255,255,.45);}
.cd-t-template_space .cd-summary{margin-top:20px;}
.cd-t-template_space .cd-totals{flex:0 0 300px;background:${rgba(c.accent, 0.1)};border:1px solid var(--accent);border-radius:10px;padding:18px 24px;}
.cd-t-template_space .cd-tot{padding:5px 0;color:var(--ink);}
.cd-t-template_space .cd-tot-label{color:var(--ink);}
.cd-t-template_space .cd-tot-grand{flex-wrap:wrap;background:none;color:#ffffff;border-radius:0;border-top:1px solid rgba(255,255,255,.3);margin-top:14px;padding:16px 0 2px;font-size:22px;font-weight:400;text-shadow:0 0 10px rgba(255,255,255,.7);}
.cd-t-template_space .cd-tot-grand .cd-tot-label{color:inherit;text-transform:uppercase;}
.cd-t-template_space .cd-tot-grand .cd-tot-value{margin-left:auto;font-weight:400;}
.cd-t-template_space .cd-tot-grand:first-child{border-top:0;margin-top:0;padding-top:2px;}
.cd-t-template_space .cd-tot-balance{border-top:1px solid rgba(255,255,255,.3);color:#ffffff;}
.cd-t-template_space .cd-tot-balance .cd-tot-label{color:#ffffff;}
.cd-t-template_space .cd-sum-closing,.cd-t-template_space .cd-closing-text{color:var(--accent-ink);font-weight:400;letter-spacing:1px;}
.cd-t-template_space .cd-h,.cd-t-template_space .cd-label{color:var(--accent-ink);letter-spacing:2px;}
.cd-t-template_space .cd-sig{display:flex;flex-direction:column;}
.cd-t-template_space .cd-sig-label{order:-1;margin:0 0 8px;color:var(--accent-ink);letter-spacing:2px;font-size:9.5px;}
.cd-t-template_space .cd-sig-img img{background:rgba(255,255,255,.92);border-radius:6px;padding:3px 8px;}
.cd-t-template_space .cd-sig-line{border-top:0;height:1px;margin-top:6px;background:linear-gradient(90deg, ${c.accent}, ${c.secondary});}
.cd-t-template_space .cd-fact{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);border-radius:12px;}
.cd-t-template_space .cd-tag{background:rgba(255,255,255,.07);color:var(--accent-ink);}
.cd-t-template_space .cd-widget{border-color:rgba(255,255,255,.14);}
${darkFixes('cd-t-template_space')}
`,
};

// ---------------------------------------------------------------------------
// 18. Retro Terminal: phosphor text in a glowing CRT frame, scanlines, inverted total
// ---------------------------------------------------------------------------
const ASCII_ART = [
  '  _____ ____  __  __',
  ' / ____/ __ \\|  \\/  |',
  '| |   | |  | | \\  / |',
  '| |   | |  | | |\\/| |',
  '| |___| |__| | |  | |',
  ' \\_____\\____/|_|  |_|',
].join('\n');

const retro: ThemeDef = {
  id: 'template_retro',
  pad: { top: 66, x: 66, bottom: 88, footer: 54 },
  ink: '#33ff00',
  header: ({ m }) => block('cd-hdr', `
    ${m.company.logoUrl ? `<div class="rt-logo">${logoImg(m)}</div>` : `<pre class="rt-ascii">${ASCII_ART}</pre>`}
    ${m.company.name ? `<div class="rt-co">${m.company.name}</div>` : ''}${lines(m.company.compactLines, 'rt-co-lines')}
    <div class="rt-type">SYSTEM.DOC.TYPE: ${m.title}</div>${statusBadge(m)}`),
  parties: (ctx) => {
    const { m } = ctx;
    const rows = detailRows(ctx);
    const left = rows.length ? `<div class="rt-col"><div>[USER_ROOT]</div>${rows.map((r) => `<div>${r.label}: ${r.value}</div>`).join('')}</div>` : '';
    const right = m.parties.length
      ? `<div class="rt-col rt-right">${m.parties.map((p) => `<div class="rt-party"><div class="rt-tag">[${p.label}]</div>${p.name ? `<div>${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('')}</div>`
      : '';
    return left || right ? block('cd-parties rt-info', `${left || '<div class="rt-col"></div>'}${right}`) : '';
  },
  footer: ({ m }) => `<div class="cd-footer"><div class="cd-footer-text">${m.footerLine}</div><div class="rt-eot cd-last-only">_END_OF_TRANSMISSION</div><div class="cd-pageno"></div></div>`,
  chrome: () => '<div class="rt-scan"></div><div class="rt-glow2"></div><div class="rt-glow1"></div><div class="rt-frame"></div>',
  css: ({ c }) => {
    const chip = mix(c.accentInk, '#ffffff', 0.86);
    return `
.cd-root.cd-t-template_retro{--ink:${c.accentInk};--muted:${mix(c.accentInk, c.paper, 0.3)};--faint:${mix(c.accentInk, c.paper, 0.55)};--rule:${mix(c.accentInk, c.paper, 0.7)};--rule-strong:${mix(c.accentInk, c.paper, 0.45)};color:var(--accent-ink);text-shadow:0 0 4px ${rgba(c.accentInk, 0.7)};}
.cd-t-template_retro .rt-scan{position:absolute;left:0;top:0;right:0;bottom:0;background-image:linear-gradient(${rgba(c.accentInk, 0.07)} 1px, rgba(0,0,0,0) 1px);background-size:100% 3px;}
.cd-t-template_retro .rt-frame{position:absolute;left:40px;top:40px;right:40px;bottom:40px;border:2px solid var(--accent);border-radius:10px;box-shadow:inset 0 0 20px ${rgba(c.accent, 0.45)};}
.cd-t-template_retro .rt-glow1{position:absolute;left:36px;top:36px;right:36px;bottom:36px;border:4px solid ${rgba(c.accent, 0.24)};border-radius:14px;}
.cd-t-template_retro .rt-glow2{position:absolute;left:31px;top:31px;right:31px;bottom:31px;border:5px solid ${rgba(c.accent, 0.09)};border-radius:19px;}
.cd-t-template_retro .cd-hdr{text-align:center;border-bottom:4px double var(--accent);padding-bottom:18px;margin-bottom:28px;}
.cd-t-template_retro .rt-ascii{display:block;width:max-content;margin:0 auto;text-align:left;font-family:var(--font-body);font-size:10px;line-height:1.15;white-space:pre;}
.cd-t-template_retro .rt-logo{display:block;width:max-content;max-width:100%;margin:0 auto;background:${chip};border-radius:4px;padding:6px 10px;text-shadow:none;}
.cd-t-template_retro .rt-logo .cd-logo{max-height:46px;max-width:190px;}
.cd-t-template_retro .rt-co{font-family:var(--font-head);font-size:24px;font-weight:700;line-height:1.2;margin-top:10px;overflow-wrap:anywhere;}
.cd-t-template_retro .rt-co-lines{font-size:11px;line-height:1.5;margin-top:4px;color:var(--accent-ink);}
.cd-t-template_retro .rt-type{font-size:12px;margin-top:6px;text-transform:uppercase;}
.cd-t-template_retro .cd-hdr .cd-status{margin-top:10px;}
.cd-t-template_retro .rt-info{justify-content:space-between;gap:28px;margin-bottom:28px;font-size:12px;line-height:1.6;}
.cd-t-template_retro .rt-col{min-width:0;flex:0 1 auto;overflow-wrap:anywhere;}
.cd-t-template_retro .rt-right{text-align:right;}
.cd-t-template_retro .rt-party+.rt-party{margin-top:12px;}
.cd-t-template_retro .rt-tag{text-transform:uppercase;}
.cd-t-template_retro .cd-lines{color:var(--accent-ink);font-size:12px;line-height:1.6;}
.cd-t-template_retro .cd-items:not([data-cont])::before{content:'EXECUTING LINE ITEMS...';display:block;margin-bottom:14px;font-size:12px;}
.cd-t-template_retro .cd-table th{color:inherit;border-bottom:1px solid var(--accent);padding:10px;font-size:11.5px;letter-spacing:.04em;}
.cd-t-template_retro .cd-table td{border-bottom:1px dashed var(--accent);padding:9px 10px;font-size:12px;}
.cd-t-template_retro .cd-table td.cd-c-desc .cd-item-name::before{content:'> ';}
.cd-t-template_retro .cd-item-sub{color:var(--muted);}
.cd-t-template_retro .cd-summary{margin-top:10px;}
.cd-t-template_retro .cd-totals{flex:0 0 310px;}
.cd-t-template_retro .cd-tot{padding:4px 0;font-size:12px;}
.cd-t-template_retro .cd-tot-label{color:inherit;text-transform:uppercase;}
.cd-t-template_retro .cd-tot-label::after{content:':';}
.cd-t-template_retro .cd-tot-value{font-weight:400;}
.cd-t-template_retro .cd-tot-grand{flex-wrap:wrap;align-items:center;background:none;color:inherit;border-radius:0;border-top:1px solid var(--accent);margin-top:10px;padding:10px 0 0;font-size:19px;font-weight:700;}
.cd-t-template_retro .cd-tot-grand .cd-tot-value{margin-left:auto;background:var(--accent);color:var(--on-accent);padding:0 6px;font-weight:700;text-shadow:none;}
.cd-t-template_retro .cd-tot-grand:first-child{border-top:0;margin-top:0;padding-top:0;}
.cd-t-template_retro .cd-tot-balance{border-top:1px dashed var(--accent);}
.cd-t-template_retro .cd-tot-balance .cd-tot-label{color:inherit;}
.cd-t-template_retro .cd-pay-btn{background:var(--accent);color:var(--on-accent);border-radius:0;text-shadow:none;}
.cd-t-template_retro .cd-sum-closing,.cd-t-template_retro .cd-closing-text{color:inherit;font-family:var(--font-body);text-transform:uppercase;}
.cd-t-template_retro .cd-h{color:inherit;font-family:var(--font-body);font-size:12px;letter-spacing:.06em;}
.cd-t-template_retro .cd-h::before{content:'// ';}
.cd-t-template_retro .cd-label,.cd-t-template_retro .cd-fact-label{color:var(--muted);}
.cd-t-template_retro .cd-fact{background:transparent;border:1px dashed var(--accent);border-radius:0;}
.cd-t-template_retro .cd-fact-value{color:inherit;font-family:var(--font-body);}
.cd-t-template_retro .cd-tag{background:transparent;border:1px solid var(--accent);color:inherit;border-radius:0;}
.cd-t-template_retro .cd-status{color:var(--accent-ink);border-radius:0;}
.cd-t-template_retro .cd-sig{border:1px dashed var(--accent);padding:10px 12px;display:flex;flex-direction:column;max-width:340px;}
.cd-t-template_retro .cd-sig-label{order:-1;margin:0 0 6px;color:inherit;font-size:10px;letter-spacing:.04em;}
.cd-t-template_retro .cd-sig-label::before{content:'[';} .cd-t-template_retro .cd-sig-label::after{content:']';}
.cd-t-template_retro .cd-sig-img img{background:${chip};border-radius:3px;padding:2px 6px;}
.cd-t-template_retro .cd-sig-line{border-top:1px dashed var(--accent);}
.cd-t-template_retro .cd-sig-meta,.cd-t-template_retro .cd-sig-fill{color:inherit;}
.cd-t-template_retro .cd-prose th{background:${rgba(c.accentInk, 0.1)};}
.cd-t-template_retro .cd-widget{border-style:dashed;border-color:var(--accent);border-radius:0;}
.cd-t-template_retro .cd-w-metric{background:${rgba(c.accentInk, 0.08)};border-radius:0;}
.cd-t-template_retro .rt-eot{flex:none;text-transform:uppercase;}
.cd-t-template_retro .cd-footer{color:var(--muted);}
${darkFixes('cd-t-template_retro')}
`;
  },
};

// ---------------------------------------------------------------------------
// 19. Playful Pop: halftone yellow page, white comic card, tilted title sticker, big total badge
// ---------------------------------------------------------------------------
const POP_YELLOW = '#fff000';
const OUTLINE = (w: number) => [`-${w}px -${w}px 0 #000`, `${w}px -${w}px 0 #000`, `-${w}px ${w}px 0 #000`, `${w}px ${w}px 0 #000`, `0 ${w}px 0 #000`, `0 -${w}px 0 #000`, `${w}px 0 0 #000`, `-${w}px 0 0 #000`].join(',');

/** Halftone dot pattern as SVG (html2canvas does not repeat radial-gradient backgrounds). */
const halftone = (w: number, h: number) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="pp-dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.1" fill="#000000" fill-opacity="0.16"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#pp-dots)"/></svg>`;

const pop: ThemeDef = {
  id: 'template_pop',
  pad: { top: 76, x: 78, bottom: 92, footer: 56 },
  ink: '#111111',
  header: ({ m }) => {
    const titleSize = m.title.length <= 9 ? 38 : m.title.length <= 12 ? 32 : 28;
    const left = `<div class="pp-left"><div class="pp-titlebox"><h1 class="pp-title" style="font-size:${titleSize}px">${m.title}!!!</h1></div>${m.number ? `<div class="pp-no">${m.numberLabel} ${m.number}</div>` : ''}${statusBadge(m)}</div>`;
    const circle = m.keyDate ? `<div class="pp-circle"><div><div class="pp-cl">${m.keyDate.label}</div><div class="pp-cv">${m.keyDate.value}</div></div></div>` : '';
    const co = m.company.name || m.company.logoUrl || m.company.compactLines.length
      ? block('pp-co', `${m.company.logoUrl ? `<div class="pp-co-logo">${logoImg(m)}</div>` : ''}<div class="pp-co-text">${m.company.name ? `<div class="pp-co-name">${m.company.name}</div>` : ''}${lines(m.company.compactLines)}</div>`)
      : '';
    return block('cd-hdr', left + circle) + co;
  },
  parties: ({ m }) => {
    const meta = m.meta.length ? `<div class="pp-meta">${m.meta.map((i) => `<div class="pp-mi"><span class="pp-ml">${i.label}</span> <span class="pp-mv">${i.value}</span></div>`).join('')}</div>` : '<div class="pp-meta"></div>';
    const who = m.parties.length ? `<div class="pp-who">${m.parties.map((p) => `<div class="pp-party"><span class="pp-tag">${p.label}:</span>${p.name ? `<div class="pp-pname">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('')}</div>` : '';
    return m.meta.length || who ? block('cd-parties pp-parties', meta + who) : '';
  },
  summary: ({ m }) => {
    if (!hasSummary(m)) return '';
    const gi = m.totals.findIndex((t) => t.kind === 'grand');
    const grand: TotalLine | undefined = m.totals[gi];
    const before = gi >= 0 ? m.totals.slice(0, gi) : m.totals;
    const after = gi >= 0 ? m.totals.slice(gi + 1) : [];
    const side = `${payButton(m)}${summaryNotes(m)}${closingInline(m)}`;
    const top = side || before.length
      ? `<div class="pp-sum-top"><div class="cd-summary-side">${side}</div>${before.length ? totalsHtml(before, 'cd-totals pp-small') : ''}</div>`
      : '';
    const big = grand
      ? `<div class="pp-big-wrap"><div class="pp-big-holder"><div class="pp-big-sh"></div><div class="pp-big cd-tot cd-tot-grand"><div class="pp-big-l cd-tot-label">${grand.label}</div><div class="pp-big-v cd-tot-value cd-num">${grand.value}</div></div></div></div>`
      : '';
    const tail = after.length ? `<div class="pp-after">${totalsHtml(after, 'cd-totals pp-small')}</div>` : '';
    return block('cd-summary pp-summary', top + big + tail);
  },
  chrome: ({ page }) => `<div class="pp-bg">${halftone(page.width, page.height)}</div><div class="pp-shadow"></div><div class="pp-card"></div>`,
  css: ({ c }) => `
.cd-t-template_pop .pp-bg{position:absolute;left:0;top:0;right:0;bottom:0;background:${POP_YELLOW};}
.cd-t-template_pop .pp-bg svg{position:absolute;left:0;top:0;}
.cd-t-template_pop .pp-shadow{position:absolute;left:55px;top:55px;right:25px;bottom:25px;background:var(--secondary);}
.cd-t-template_pop .pp-card{position:absolute;left:40px;top:40px;right:40px;bottom:40px;background:var(--paper);border:5px solid #000000;}
.cd-t-template_pop .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:24px;}
.cd-t-template_pop .pp-left{min-width:0;padding:6px 0 0 4px;}
.cd-t-template_pop .pp-titlebox{display:inline-block;max-width:100%;background:var(--accent);border:3px solid #000000;border-right-width:8px;border-bottom-width:8px;padding:14px 22px;transform:rotate(-3deg);}
.cd-t-template_pop .pp-title{font-family:var(--font-head);font-weight:700;line-height:1.05;text-transform:uppercase;color:#ffffff;text-shadow:${OUTLINE(2)};overflow-wrap:anywhere;}
.cd-t-template_pop .pp-no{font-weight:700;font-size:14px;margin-top:20px;}
.cd-t-template_pop .cd-hdr .cd-status{margin-top:10px;}
.cd-t-template_pop .pp-circle{flex:none;width:126px;height:126px;border-radius:50%;background:#ffffff;border:3px solid #000000;border-right-width:8px;border-bottom-width:8px;display:flex;align-items:center;justify-content:center;text-align:center;padding:10px;}
.cd-t-template_pop .pp-cl{font-size:11px;font-weight:700;text-transform:uppercase;line-height:1.2;}
.cd-t-template_pop .pp-cv{font-size:15px;font-weight:700;line-height:1.2;margin-top:3px;color:var(--secondary-ink);}
.cd-t-template_pop .pp-co{display:flex;align-items:center;gap:16px;background:var(--secondary);color:${readableOn(c.secondary, '#ffffff', '#000000')};border:3px solid #000000;padding:14px 22px;margin:0 4px 24px;transform:skewX(-5deg);}
.cd-t-template_pop .pp-co-logo{flex:none;background:#ffffff;border:2px solid #000000;padding:4px 6px;}
.cd-t-template_pop .pp-co-logo .cd-logo{max-height:38px;max-width:130px;}
.cd-t-template_pop .pp-co-text{min-width:0;}
.cd-t-template_pop .pp-co-name{font-family:var(--font-head);font-size:20px;font-weight:700;line-height:1.15;text-transform:uppercase;overflow-wrap:anywhere;}
.cd-t-template_pop .pp-co .cd-lines{color:inherit;font-size:11px;margin-top:2px;}
.cd-t-template_pop .pp-parties{justify-content:space-between;gap:28px;margin-bottom:18px;}
.cd-t-template_pop .pp-meta{flex:0 1 46%;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:9px;}
.cd-t-template_pop .pp-mi{background:#ffffff;border:2px solid #000000;border-right-width:5px;border-bottom-width:5px;padding:4px 10px;font-size:12px;max-width:100%;overflow-wrap:anywhere;}
.cd-t-template_pop .pp-ml{font-weight:700;text-transform:uppercase;font-size:10px;margin-right:4px;}
.cd-t-template_pop .pp-mv{font-weight:700;}
.cd-t-template_pop .pp-who{flex:1 1 auto;min-width:0;text-align:right;}
.cd-t-template_pop .pp-party+.pp-party{margin-top:16px;}
.cd-t-template_pop .pp-tag{display:inline-block;background:#000000;color:#ffffff;padding:4px 10px;font-weight:700;font-size:15px;text-transform:uppercase;}
.cd-t-template_pop .pp-pname{font-family:var(--font-head);font-size:28px;font-weight:700;line-height:1.15;margin-top:8px;overflow-wrap:anywhere;}
.cd-t-template_pop .pp-who .cd-lines{color:var(--ink);font-size:12px;margin-top:2px;}
.cd-t-template_pop .cd-table{border-collapse:separate;border-spacing:0 6px;}
.cd-t-template_pop .cd-table th{background:#000000;color:#ffffff;padding:10px 12px;font-size:12px;letter-spacing:.04em;}
.cd-t-template_pop .cd-table td{background:#ffffff;border-bottom:0;padding:10px 12px;font-size:12px;}
.cd-t-template_pop .cd-table td.cd-col-0{font-weight:700;}
.cd-t-template_pop .cd-table td.cd-col-1{color:var(--accent-ink);}
.cd-t-template_pop .cd-table td.cd-col-2{color:var(--secondary-ink);}
.cd-t-template_pop .cd-table td.cd-col-last{background:${POP_YELLOW};color:#000000;font-weight:700;}
.cd-t-template_pop .cd-item-sub{font-weight:400;}
.cd-t-template_pop .pp-summary{display:block;margin-top:8px;}
.cd-t-template_pop .pp-sum-top{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
.cd-t-template_pop .pp-small{flex:0 0 280px;background:#ffffff;border:3px solid #000000;border-right-width:8px;border-bottom-width:8px;padding:8px 14px;}
.cd-t-template_pop .pp-small .cd-tot{font-weight:700;}
.cd-t-template_pop .pp-small .cd-tot-label{color:var(--ink);}
.cd-t-template_pop .pp-small .cd-tot-balance{border-top:2px solid #000000;}
.cd-t-template_pop .pp-big-wrap{display:flex;justify-content:center;padding:22px 0 16px;}
.cd-t-template_pop .pp-big-holder{position:relative;width:max-content;max-width:100%;transform:rotate(2deg);}
.cd-t-template_pop .pp-big-sh{position:absolute;left:10px;top:10px;right:-10px;bottom:-10px;background:${POP_YELLOW};}
.cd-t-template_pop .pp-big{position:relative;display:block;background:var(--accent);border:5px solid #000000;border-radius:0;padding:16px 50px;margin:0;text-align:left;}
.cd-t-template_pop .pp-big-l{display:block;font-size:19px;font-weight:700;color:#ffffff;text-transform:uppercase;text-shadow:${OUTLINE(1)};}
.cd-t-template_pop .pp-big-v{display:block;font-family:var(--font-head);font-size:44px;font-weight:700;line-height:1.1;color:#ffffff;text-shadow:${OUTLINE(2)};}
.cd-t-template_pop .pp-after{display:flex;justify-content:center;}
.cd-t-template_pop .cd-sum-closing,.cd-t-template_pop .cd-closing-text{font-size:18px;color:var(--accent-ink);}
.cd-t-template_pop .cd-closing{text-align:center;}
.cd-t-template_pop .cd-pay-btn{background:var(--accent);color:#ffffff;border:3px solid #000000;border-right-width:6px;border-bottom-width:6px;border-radius:0;text-shadow:${OUTLINE(1)};}
.cd-t-template_pop .cd-h{display:inline-block;background:#000000;color:#ffffff;padding:3px 10px;font-size:12px;letter-spacing:.06em;}
.cd-t-template_pop .cd-label{color:var(--ink);}
.cd-t-template_pop .cd-fact{background:#ffffff;border:3px solid #000000;border-right-width:7px;border-bottom-width:7px;border-radius:0;}
.cd-t-template_pop .cd-fact-value{color:var(--accent-ink);}
.cd-t-template_pop .cd-tag{background:var(--secondary);color:${readableOn(c.secondary, '#ffffff', '#000000')};border:2px solid #000000;border-radius:0;}
.cd-t-template_pop .cd-status{background:#ffffff;border-width:2px 4px 4px 2px;border-radius:0;}
.cd-t-template_pop .cd-sigs{justify-content:center;}
.cd-t-template_pop .cd-sig{display:flex;flex-direction:column;text-align:center;background:#ffffff;border:3px solid #000000;border-right-width:8px;border-bottom-width:8px;padding:12px 16px;max-width:280px;}
.cd-t-template_pop .cd-sig-label{order:-1;margin:0 0 8px;color:#000000;font-size:11px;}
.cd-t-template_pop .cd-sig-img{justify-content:center;}
.cd-t-template_pop .cd-sig-line{border-top:2px solid #000000;}
.cd-t-template_pop .cd-widget{border:3px solid #000000;border-radius:0;}
`,
};

// ---------------------------------------------------------------------------
// 20. Elegant Serif: small-caps masthead on ivory, details columns, centered title, double-ruled total
// ---------------------------------------------------------------------------
const serif: ThemeDef = {
  id: 'template_serif',
  pad: { top: 60, x: 80, bottom: 78 },
  ink: '#333333',
  header: ({ m }) => block('cd-hdr', `${logoImg(m)}${m.company.name ? `<div class="es-co">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="es-tag">${m.company.tagline}</div>` : ''}${lines(m.company.compactLines, 'es-lines')}`),
  parties: (ctx) => {
    const { m } = ctx;
    const rows = detailRows(ctx);
    const cols = [
      ...m.parties.map((p) => `<div class="es-col"><div class="es-h">${p.label}:</div>${p.name ? `<div class="es-pname">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      rows.length ? `<div class="es-col es-details"><div class="es-h">Document details:</div>${rows.map((r) => `<div class="es-dr"><em>${r.label}:</em> ${r.value}</div>`).join('')}</div>` : '',
    ].filter(Boolean);
    return cols.length ? block('cd-parties es-parties', cols.join('')) : '';
  },
  compose: ({ m }, p) => {
    const title = block('es-titlebar', `<h1 class="es-title">${m.title}</h1>${statusBadge(m)}`);
    const [header, parties, ...rest] = defaultCompose(p);
    return [header, parties, title, ...rest];
  },
  css: ({ c }) => `
.cd-t-template_serif .cd-hdr{text-align:center;border-bottom:1px solid var(--accent);padding-bottom:24px;margin-bottom:30px;}
.cd-t-template_serif .cd-logo{margin:0 auto 12px;max-height:50px;}
.cd-t-template_serif .es-co{font-family:var(--font-head);font-size:46px;line-height:1.1;letter-spacing:2px;font-variant:small-caps;color:var(--ink);overflow-wrap:anywhere;}
.cd-t-template_serif .es-tag{font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:10px;}
.cd-t-template_serif .es-lines{font-size:12px;line-height:1.6;color:var(--muted);margin-top:8px;}
.cd-t-template_serif .es-parties{justify-content:space-between;gap:36px;margin-bottom:28px;}
.cd-t-template_serif .es-col{flex:0 1 auto;min-width:0;overflow-wrap:anywhere;}
.cd-t-template_serif .es-details{text-align:right;margin-left:auto;}
.cd-t-template_serif .es-h{display:inline-block;font-variant:small-caps;font-weight:700;font-size:14px;letter-spacing:.02em;border-bottom:1px solid var(--accent);margin-bottom:10px;}
.cd-t-template_serif .es-pname{font-size:18px;margin-bottom:5px;}
.cd-t-template_serif .es-parties .cd-lines{font-size:13.5px;line-height:1.55;color:${mix(c.ink, c.paper, 0.25)};}
.cd-t-template_serif .es-dr{font-size:13.5px;margin-bottom:4px;}
.cd-t-template_serif .es-dr em{font-style:italic;}
.cd-t-template_serif .es-titlebar{text-align:center;margin-bottom:18px;}
.cd-t-template_serif .es-title{font-family:var(--font-head);font-size:24px;font-weight:700;line-height:1.2;text-transform:uppercase;letter-spacing:3px;margin-right:-3px;color:var(--accent-ink);}
.cd-t-template_serif .es-titlebar .cd-status{margin-top:8px;}
.cd-t-template_serif .cd-table{border-top:2px solid var(--accent);border-bottom:2px solid var(--accent);}
.cd-t-template_serif .cd-table th{font-weight:400;font-style:italic;text-transform:none;letter-spacing:0;font-size:12.5px;color:var(--ink);border-bottom:1px solid var(--accent);padding:10px 6px;}
.cd-t-template_serif .cd-table td{padding:10px 6px;border-bottom:1px solid ${mix(c.ink, c.paper, 0.75)};font-size:12.5px;}
.cd-t-template_serif .cd-table td.cd-c-desc .cd-item-name{font-style:italic;}
.cd-t-template_serif .cd-summary{margin-top:14px;}
.cd-t-template_serif .cd-totals{flex:0 0 270px;}
.cd-t-template_serif .cd-tot{padding:5px 0;font-size:13px;}
.cd-t-template_serif .cd-tot-label{color:var(--ink);}
.cd-t-template_serif .cd-tot-grand{background:none;color:var(--ink);border-radius:0;border-top:1px solid var(--accent);border-bottom:3px double var(--accent);margin-top:8px;padding:12px 0;font-size:19px;font-weight:700;}
.cd-t-template_serif .cd-tot-grand .cd-tot-label{color:inherit;}
.cd-t-template_serif .cd-tot-balance{border-top:0;font-size:15px;}
.cd-t-template_serif .cd-pay-btn{border-radius:0;}
.cd-t-template_serif .cd-sum-closing,.cd-t-template_serif .cd-closing-text{font-weight:400;font-style:italic;color:var(--ink);}
.cd-t-template_serif .cd-closing{text-align:center;}
.cd-t-template_serif .cd-h,.cd-t-template_serif .cd-label{display:inline-block;font-variant:small-caps;text-transform:none;font-weight:700;font-size:14px;letter-spacing:.02em;color:var(--ink);border-bottom:1px solid var(--accent);padding-bottom:1px;}
.cd-t-template_serif .cd-h{margin-bottom:10px;}
.cd-t-template_serif .cd-fact{background:transparent;border-color:${mix(c.ink, c.paper, 0.6)};border-radius:0;}
.cd-t-template_serif .cd-fact-value{color:var(--ink);font-weight:400;}
.cd-t-template_serif .cd-tag{background:transparent;border:1px solid var(--rule-strong);color:var(--ink);font-style:italic;}
.cd-t-template_serif .cd-sigs{justify-content:center;}
.cd-t-template_serif .cd-sig{text-align:center;max-width:250px;}
.cd-t-template_serif .cd-sig-img{justify-content:center;}
.cd-t-template_serif .cd-sig-label{text-transform:none;letter-spacing:0;font-weight:400;font-size:12px;color:var(--muted);}
.cd-t-template_serif .cd-footer{justify-content:center;gap:18px;}
`,
};

export const DESIGNS: DesignDef[] = [
  {
    meta: { id: 'template_swiss', name: 'Swiss Grid', description: 'Red edge strip, a details sidebar with a vertical title and a heavy black grid table.', accent: '#ff0000', secondary: '#000000', paper: '#ffffff', headFont: 'helvetica', bodyFont: 'helvetica', tags: ['swiss', 'grid', 'red', 'bold'], collection: 'premium' },
    theme: swiss,
  },
  {
    meta: { id: 'template_space', name: 'Space Odyssey', description: 'Deep-space page, glowing letter-spaced title, a frosted panel for the parties and a teal totals box.', accent: '#03dac6', secondary: '#bb86fc', paper: '#050510', headFont: 'verdana', bodyFont: 'verdana', tags: ['dark', 'space', 'neon'], collection: 'premium' },
    theme: space,
  },
  {
    meta: { id: 'template_retro', name: 'Retro Terminal', description: 'Phosphor-green typewriter text inside a glowing CRT frame with an inverted total.', accent: '#33ff00', secondary: '#0a0a0a', paper: '#0a0a0a', headFont: 'courier', bodyFont: 'courier', tags: ['dark', 'terminal', 'mono', 'retro'], collection: 'premium' },
    theme: retro,
  },
  {
    meta: { id: 'template_pop', name: 'Playful Pop', description: 'Comic-book colors: a tilted title sticker, a halftone yellow page and a big total badge.', accent: '#ff00de', secondary: '#00e5ff', paper: '#ffffff', headFont: 'comic', bodyFont: 'comic', tags: ['playful', 'pop', 'colorful', 'comic'], collection: 'premium' },
    theme: pop,
  },
  {
    meta: { id: 'template_serif', name: 'Elegant Serif', description: 'Small-caps serif masthead on ivory paper, details in columns and classic ruled tables.', accent: '#333333', secondary: '#666666', paper: '#fdfbf7', headFont: 'times', bodyFont: 'times', tags: ['serif', 'elegant', 'classic', 'formal'], collection: 'premium' },
    theme: serif,
  },
];
