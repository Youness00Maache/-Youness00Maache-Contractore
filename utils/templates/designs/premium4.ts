/**
 * Original Premium designs 16-20 (pre-2026-11 `thirdSetTemplates.ts`), restored under their original ids:
 * Swiss Grid, Space Odyssey, Retro Terminal, Playful Pop and Elegant Serif.
 *
 * Ported to the shared engine: every document type renders through the model (labels, totals, signatures,
 * sections), colors come from the palette (the original colors are the defaults), and decorations are page
 * chrome so continuation pages keep the look. The PDF is drawn by the browser, so the original effects are
 * used as they were (box shadows, glows, text strokes, image filters). Fixed from the originals: hardcoded
 * "INVOICE"/"Bill to"/"Invoice #", missing logo/notes/terms/tax lines, the vertical title overlapping the
 * details (Swiss), the doubled signature and fixed tagline (Elegant Serif), and unreadable dark-on-dark
 * text and signatures (Space, Retro).
 */
import type { DesignDef, RenderCtx, ThemeDef } from '../blocks.ts';
import {
  block, closingInline, defaultCompose, defaultSummary, hasSummary, lines, logoImg, payButton, statusBadge, summaryNotes, totalsHtml,
} from '../blocks.ts';
import type { DocModel, TotalLine } from '../model.ts';
import { mix, readableOn } from '../colors.ts';
import { rgba } from '../kit.ts';

/** Number + meta items as label/value rows (document details). */
const detailRows = ({ m }: RenderCtx) =>
  [m.number ? { label: m.numberLabel, value: m.number } : null, ...m.meta].filter(Boolean) as Array<{ label: string; value: string }>;

/** Company address on one line and the contacts on another (the originals printed one address line). */
const companyShortLines = (m: DocModel) =>
  [m.company.addressLines.join(', '), [m.company.phone, m.company.email, m.company.website].filter(Boolean).join(' · ')].filter(Boolean);

/** Readable status colors on dark paper. */
const darkFixes = (cls: string) => `
.${cls} .cd-tone-good{color:#4ade80;} .${cls} .cd-tone-bad{color:#f87171;} .${cls} .cd-tone-warn{color:#fbbf24;}
.${cls} .cd-neg{color:#f87171;}
.${cls} .cd-prose mark{color:#111111;text-shadow:none;}
.${cls} .cd-prose th{background:rgba(255,255,255,.06);}
`;

// ---------------------------------------------------------------------------
// 16. Swiss Grid: red edge strip, sidebar with the vertical title above the details, heavy black grid table
// ---------------------------------------------------------------------------
/** Helvetica/Arial Bold advance widths (1/1000 em), to size the vertical title box without measuring. */
const HELV_BOLD: Record<string, number> = {
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778,
  P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, ' ': 278, '-': 333, '&': 722,
  '/': 278, '.': 278, ',': 278, "'": 238, '(': 333, ')': 333,
};

/** Width in em of a text in the Swiss head font (black weight: digits are drawn wider than in the regular cut). */
const helvEm = (html: string, digit = 0.556) =>
  [...html.replace(/&[#a-z0-9]+;/gi, 'X').toUpperCase()].reduce((a, ch) => a + (/[0-9$]/.test(ch) ? digit : /[.,]/.test(ch) && digit > 0.6 ? 0.333 : (HELV_BOLD[ch] ?? 740) / 1000), 0);

/** Font size (60px like the original, smaller for long titles) and the rendered length of the vertical title. */
const swissTitle = (title: string) => {
  const em = helvEm(title) - 0.01 * title.length;
  const size = Math.max(34, Math.min(60, Math.floor(480 / Math.max(em, 1))));
  return { size, length: Math.ceil(em * size) };
};

/** The big red "TOTAL $…" line stays on one line (32px like the original; smaller for long labels/amounts). */
const swissGrandSize = (t: TotalLine) => Math.max(20, Math.min(32, Math.floor(322 / (1.06 * (helvEm(t.label) + helvEm(t.value, 0.667))))));

const swiss: ThemeDef = {
  id: 'template_swiss',
  pad: { top: 60, x: 56, left: 272, bottom: 58 },
  header: ({ m }) => block('cd-hdr', `${logoImg(m)}${m.company.name ? `<h1 class="sw-co">${m.company.name}</h1>` : ''}${lines(companyShortLines(m), 'sw-co-lines')}${statusBadge(m)}`),
  parties: ({ m }) => (m.parties.length
    ? block('cd-parties sw-parties', m.parties.map((p) => `<div class="cd-party"><div class="sw-plabel">${p.label}</div>${p.name ? `<div class="sw-pname">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join(''))
    : ''),
  // the original: totals right-aligned under the table; the pay button / notes follow under them in their own
  // block (the column is too narrow to put them beside the totals, and a page break may fall between the two)
  summary: ({ m }) => {
    if (!hasSummary(m)) return '';
    const side = `${payButton(m)}${summaryNotes(m)}${closingInline(m)}`;
    const grand = m.totals.find((t) => t.kind === 'grand');
    const totals = totalsHtml(m.totals).replace('cd-tot cd-tot-grand"', `cd-tot cd-tot-grand" style="font-size:${grand ? swissGrandSize(grand) : 32}px"`);
    return (m.totals.length ? block('cd-summary sw-summary', totals) : '') + (side ? block('sw-payrow', `<div class="cd-summary-side">${side}</div>`) : '');
  },
  chrome: (ctx) => {
    const rows = detailRows(ctx);
    const t = swissTitle(ctx.m.title);
    const details = rows.length
      ? `<div class="sw-details cd-first-only">${rows.map((r) => `<div class="sw-dl">${r.label}</div><div class="sw-dv">${r.value}</div>`).join('')}</div>`
      : '';
    return `<div class="sw-strip"></div><div class="sw-rule"></div><div class="sw-side"><div class="sw-top"></div><div class="sw-titlebox" style="height:${t.length + 6}px"><div class="sw-vtitle" style="font-size:${t.size}px">${ctx.m.title}</div></div>${details}</div>`;
  },
  css: () => `
.cd-t-template_swiss .sw-strip{position:absolute;left:0;top:0;bottom:0;width:20px;background:var(--accent);}
.cd-t-template_swiss .sw-rule{position:absolute;left:218px;top:0;bottom:0;width:2px;background:var(--ink);}
.cd-t-template_swiss .sw-side{position:absolute;left:40px;top:58px;bottom:58px;width:164px;display:flex;flex-direction:column;overflow:hidden;}
.cd-t-template_swiss .sw-top{flex:0 1 236px;min-height:0;}
.cd-t-template_swiss .sw-titlebox{position:relative;flex:none;}
.cd-t-template_swiss .sw-vtitle{position:absolute;left:0;bottom:0;white-space:nowrap;font-family:var(--font-head);font-weight:900;line-height:.8;text-transform:uppercase;letter-spacing:-.01em;color:var(--ink);transform-origin:0 100%;transform:rotate(-90deg) translateY(100%);}
.cd-t-template_swiss .sw-details{flex:none;padding-top:40px;}
.cd-t-template_swiss .sw-dl{font-family:var(--font-head);font-weight:900;font-size:13px;letter-spacing:.02em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:4px;}
.cd-t-template_swiss .sw-dv{font-size:16px;line-height:1.3;margin-bottom:18px;overflow-wrap:anywhere;color:var(--ink);}
.cd-t-template_swiss .cd-hdr{border-bottom:10px solid var(--ink);padding-bottom:12px;margin-bottom:28px;}
.cd-t-template_swiss .cd-logo{max-height:46px;margin-bottom:10px;}
.cd-t-template_swiss .sw-co{font-family:var(--font-head);font-size:44px;font-weight:900;letter-spacing:-.045em;line-height:1.04;color:var(--ink);overflow-wrap:anywhere;}
.cd-t-template_swiss .sw-co-lines{font-weight:700;font-size:13px;line-height:1.5;color:var(--ink);margin-top:8px;overflow-wrap:anywhere;}
.cd-t-template_swiss .cd-hdr .cd-status{margin-top:12px;}
.cd-t-template_swiss .sw-parties{gap:28px;margin-bottom:26px;}
.cd-t-template_swiss .sw-plabel{font-family:var(--font-head);font-weight:900;font-size:14px;letter-spacing:.02em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:9px;}
.cd-t-template_swiss .sw-pname{font-size:23px;font-weight:700;line-height:1.2;margin-bottom:4px;overflow-wrap:anywhere;}
.cd-t-template_swiss .sw-parties .cd-lines{font-size:14.5px;line-height:1.5;color:var(--ink);}
.cd-t-template_swiss .cd-table{border:2px solid var(--ink);}
.cd-t-template_swiss .cd-table th{background:var(--secondary);color:var(--on-secondary);font-size:11.5px;font-weight:700;letter-spacing:.02em;padding:13px 12px;}
.cd-t-template_swiss .cd-table td{padding:11px 12px;border-bottom:2px solid var(--ink);border-right:2px solid var(--ink);font-size:12px;}
.cd-t-template_swiss .cd-table td.cd-col-0,.cd-t-template_swiss .cd-table td.cd-col-last{font-weight:700;}
.cd-t-template_swiss .cd-table td.cd-col-last{border-right:0;}
.cd-t-template_swiss .cd-item-sub{font-weight:400;}
.cd-t-template_swiss .sw-summary{display:flex;justify-content:flex-end;margin-top:26px;}
.cd-t-template_swiss .sw-summary .cd-totals{flex:0 1 340px;}
.cd-t-template_swiss .sw-payrow{display:flex;justify-content:flex-end;}
.cd-t-template_swiss .sw-payrow .cd-summary-side{flex:0 1 340px;}
.cd-t-template_swiss .cd-tot{padding:8px 0;border-bottom:2px solid var(--ink);font-size:13px;}
.cd-t-template_swiss .cd-tot-label{color:var(--ink);font-weight:700;text-transform:uppercase;}
.cd-t-template_swiss .cd-tot-grand{flex-wrap:nowrap;align-items:baseline;background:none;border:0;border-radius:0;color:var(--accent-ink);font-family:var(--font-head);font-size:32px;font-weight:900;line-height:1.1;padding:16px 0 2px;margin:0;}
.cd-t-template_swiss .cd-tot-grand .cd-tot-label{color:inherit;font-weight:900;min-width:0;}
.cd-t-template_swiss .cd-tot-grand .cd-tot-value{margin-left:auto;font-weight:900;}
.cd-t-template_swiss .cd-tot-balance{border-top:0;margin-top:0;padding-top:9px;font-size:15px;}
.cd-t-template_swiss .cd-pay{margin-bottom:12px;}
.cd-t-template_swiss .cd-pay-btn{border-radius:0;}
.cd-t-template_swiss .cd-h,.cd-t-template_swiss .cd-label,.cd-t-template_swiss .cd-sig-label{color:var(--accent-ink);font-family:var(--font-head);font-weight:900;font-size:13px;letter-spacing:.02em;}
.cd-t-template_swiss .cd-sum-closing,.cd-t-template_swiss .cd-closing-text{color:var(--ink);font-weight:900;}
.cd-t-template_swiss .cd-fact{background:var(--paper);border:2px solid var(--ink);border-radius:0;}
.cd-t-template_swiss .cd-fact-label{color:var(--accent-ink);font-weight:900;}
.cd-t-template_swiss .cd-fact-value{color:var(--ink);font-weight:900;}
.cd-t-template_swiss .cd-tag{border-radius:0;background:var(--ink);color:var(--paper);}
.cd-t-template_swiss .cd-sig-line{border-top:2px solid var(--ink);}
.cd-t-template_swiss .cd-sig-img{height:40px;}
.cd-t-template_swiss .cd-prose h3{margin-top:10px;}
.cd-t-template_swiss .cd-widget{border:2px solid var(--ink);border-radius:0;}
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

/** Dark-page image treatment: inverted lightness, same hues (a white logo background turns black and disappears). */
const DARK_IMG = 'filter:invert(1) hue-rotate(180deg);';

const space: ThemeDef = {
  id: 'template_space',
  pad: { top: 50, x: 60, bottom: 66 },
  ink: '#e0e0e0',
  header: ({ m }) => {
    const sub = [m.number ? `${m.numberLabel} ${m.number}` : '', m.keyDate ? `${m.keyDate.label}: ${m.keyDate.value}` : ''].filter(Boolean).join('<span class="so-sep">//</span>');
    return block('cd-hdr', `${m.company.logoUrl ? `<div class="so-logo">${logoImg(m)}</div>` : ''}<h1 class="so-title">${m.title}</h1>${sub ? `<div class="so-sub">${sub}</div>` : ''}${statusBadge(m)}`);
  },
  parties: ({ m }) => {
    const company = m.company.name || m.company.lines.length
      ? `<div class="so-col so-from"><div class="so-k">From</div>${m.company.name ? `<div class="so-name">${m.company.name}</div>` : ''}${lines(companyShortLines(m))}</div>`
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
    return `<div class="so-bg" style="background:${bg}"></div><div class="so-glow" style="background:radial-gradient(circle, ${glow} 0%, ${rgba(glow, 0)} 70%)"></div>${starfield(page.width, page.height, 60)}`;
  },
  css: ({ c }) => `
.cd-t-template_space .so-bg{position:absolute;left:0;top:0;right:0;bottom:0;}
.cd-t-template_space .so-glow{position:absolute;top:100px;right:-50px;width:300px;height:300px;border-radius:50%;opacity:.3;filter:blur(50px);}
.cd-t-template_space .so-stars{position:absolute;left:0;top:0;}
.cd-t-template_space .cd-hdr{text-align:center;margin:6px 0 26px;}
.cd-t-template_space .so-logo{display:block;width:max-content;max-width:100%;margin:0 auto 14px;}
.cd-t-template_space .so-logo .cd-logo{max-height:36px;max-width:180px;${DARK_IMG}}
.cd-t-template_space .so-title{font-family:var(--font-head);font-size:32px;font-weight:400;line-height:1.2;letter-spacing:10px;margin-right:-10px;text-transform:uppercase;color:var(--accent-ink);text-shadow:0 0 20px var(--accent-ink);}
.cd-t-template_space .so-sub{font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-top:10px;color:var(--secondary-ink);}
.cd-t-template_space .so-sep{display:inline-block;margin:0 12px;}
.cd-t-template_space .cd-hdr .cd-status{margin-top:12px;}
.cd-t-template_space .so-panel{display:block;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:22px 30px;margin-bottom:28px;}
.cd-t-template_space .so-row{display:flex;justify-content:space-between;gap:28px;}
.cd-t-template_space .so-col{flex:1 1 0;min-width:0;}
.cd-t-template_space .so-col.so-from{flex-grow:1.5;}
.cd-t-template_space .so-multi .so-col:last-child{text-align:right;}
.cd-t-template_space .so-k{color:#8b8b9e;font-size:10px;text-transform:uppercase;letter-spacing:2px;}
.cd-t-template_space .so-name{font-size:18px;color:#ffffff;margin-top:5px;line-height:1.3;overflow-wrap:anywhere;}
.cd-t-template_space .so-panel .cd-lines{font-size:12px;color:#aaaaaa;margin-top:2px;}
.cd-t-template_space .so-meta{display:flex;flex-wrap:wrap;gap:12px 32px;border-top:1px solid rgba(255,255,255,.1);margin-top:16px;padding-top:13px;}
.cd-t-template_space .so-mi{min-width:0;max-width:100%;}
.cd-t-template_space .so-mv{font-size:13px;color:#ffffff;margin-top:3px;overflow-wrap:anywhere;}
.cd-t-template_space .cd-table th{color:var(--accent-ink);font-size:11px;letter-spacing:2px;padding:11px 14px;border-bottom:2px solid var(--accent);}
.cd-t-template_space .cd-table td{padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.2);color:var(--ink);font-size:12px;}
.cd-t-template_space .cd-table td.cd-col-1.cd-num{color:var(--secondary-ink);}
.cd-t-template_space .cd-table td.cd-col-2.cd-num{color:var(--accent-ink);}
.cd-t-template_space .cd-table td.cd-col-last{color:#ffffff;font-weight:700;text-shadow:0 0 10px rgba(255,255,255,.5);}
.cd-t-template_space .cd-summary{margin-top:24px;}
.cd-t-template_space .cd-totals{flex:0 0 300px;background:${rgba(c.accent, 0.1)};border:1px solid var(--accent);border-radius:10px;padding:20px 28px;}
.cd-t-template_space .cd-tot{padding:5px 0;color:var(--ink);font-size:12.5px;}
.cd-t-template_space .cd-tot-label{color:var(--ink);}
.cd-t-template_space .cd-tot-grand{flex-wrap:wrap;background:none;color:#ffffff;border-radius:0;border-top:1px solid rgba(255,255,255,.3);margin-top:12px;padding:16px 0 2px;font-size:24px;font-weight:400;text-shadow:0 0 10px #ffffff;}
.cd-t-template_space .cd-tot-grand .cd-tot-label{color:inherit;text-transform:uppercase;}
.cd-t-template_space .cd-tot-grand .cd-tot-value{margin-left:auto;font-weight:400;}
.cd-t-template_space .cd-tot-grand:first-child{border-top:0;margin-top:0;padding-top:2px;}
.cd-t-template_space .cd-tot-balance{border-top:1px solid rgba(255,255,255,.3);color:#ffffff;}
.cd-t-template_space .cd-tot-balance .cd-tot-label{color:#ffffff;}
.cd-t-template_space .cd-sum-closing,.cd-t-template_space .cd-closing-text{color:var(--accent-ink);font-weight:400;letter-spacing:1px;}
.cd-t-template_space .cd-h,.cd-t-template_space .cd-label{color:var(--accent-ink);letter-spacing:2px;}
.cd-t-template_space .cd-sig{display:flex;flex-direction:column;}
.cd-t-template_space .cd-sig-label{order:-1;margin:0 0 8px;color:var(--accent-ink);letter-spacing:2px;font-size:10px;}
.cd-t-template_space .cd-sig-img{height:42px;}
.cd-t-template_space .cd-sig-img img{${DARK_IMG}}
.cd-t-template_space .cd-prose h3{margin-top:10px;}
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

const plainLen = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&[#a-z0-9]+;/gi, 'X').length;

/** "FINAL_TOTAL:" line on one line: 20px like the original, smaller for long labels/amounts (monospace: 0.6em a char). */
const retroGrandSize = (t: TotalLine) => Math.max(14, Math.min(20, Math.floor(306 / (0.6 * (plainLen(t.label) + 1 + plainLen(t.value))))));

const retro: ThemeDef = {
  id: 'template_retro',
  pad: { top: 60, x: 66, bottom: 78, footer: 54 },
  ink: '#33ff00',
  // the original's signature box spans the full width under everything
  noSignoff: true,
  header: ({ m }) => block('cd-hdr', `
    ${m.company.logoUrl ? `<div class="rt-logo">${logoImg(m)}</div>` : `<pre class="rt-ascii">${ASCII_ART}</pre>`}
    ${m.company.name ? `<div class="rt-co">${m.company.name}</div>` : ''}${lines(companyShortLines(m), 'rt-co-lines')}
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
  // "_END_OF_TRANSMISSION" closes the document, centered like the original (dropped rather than given its own page)
  summary: (ctx) => {
    const grand = ctx.m.totals.find((t) => t.kind === 'grand');
    const html = defaultSummary(ctx, true);
    return grand ? html.replace('cd-tot cd-tot-grand"', `cd-tot cd-tot-grand" style="font-size:${retroGrandSize(grand)}px"`) : html;
  },
  compose: (_ctx, p) => [...defaultCompose(p), block('rt-eot', '<div class="rt-eot-text">_END_OF_TRANSMISSION</div>', 'data-optional="1"')],
  chrome: () => '<div class="rt-scan"></div><div class="rt-frame"></div>',
  css: ({ c }) => `
.cd-root.cd-t-template_retro{--ink:${c.accentInk};--muted:${mix(c.accentInk, c.paper, 0.3)};--faint:${mix(c.accentInk, c.paper, 0.55)};--rule:${mix(c.accentInk, c.paper, 0.7)};--rule-strong:${mix(c.accentInk, c.paper, 0.45)};color:var(--accent-ink);text-shadow:0 0 4px ${rgba(c.accentInk, 0.8)};}
.cd-t-template_retro .rt-scan{position:absolute;left:0;top:0;right:0;bottom:0;background-image:linear-gradient(${rgba(c.accentInk, 0.07)} 1px, rgba(0,0,0,0) 1px);background-size:100% 3px;}
.cd-t-template_retro .rt-frame{position:absolute;left:40px;top:40px;right:40px;bottom:40px;border:2px solid var(--accent);border-radius:10px;box-shadow:0 0 20px ${rgba(c.accent, 0.9)}, inset 0 0 20px ${rgba(c.accent, 0.9)};}
.cd-t-template_retro .cd-hdr{text-align:center;border-bottom:2px solid var(--accent);padding-bottom:16px;margin-bottom:24px;}
.cd-t-template_retro .rt-ascii{display:block;width:max-content;margin:0 auto;text-align:left;font-family:var(--font-body);font-size:10px;line-height:1.15;white-space:pre;}
.cd-t-template_retro .rt-logo{display:block;width:max-content;max-width:100%;margin:0 auto;}
.cd-t-template_retro .rt-logo .cd-logo{max-height:42px;max-width:200px;filter:grayscale(1) invert(1);}
.cd-t-template_retro .rt-co{font-family:var(--font-head);font-size:24px;font-weight:700;line-height:1.2;margin-top:10px;overflow-wrap:anywhere;}
.cd-t-template_retro .rt-co-lines{font-size:11px;line-height:1.5;margin-top:3px;color:var(--accent-ink);}
.cd-t-template_retro .rt-type{font-size:12px;margin-top:6px;text-transform:uppercase;}
.cd-t-template_retro .cd-hdr .cd-status{margin-top:10px;}
.cd-t-template_retro .rt-info{justify-content:space-between;gap:28px;margin-bottom:24px;font-size:12px;line-height:1.6;}
.cd-t-template_retro .rt-col{min-width:0;flex:0 1 auto;overflow-wrap:anywhere;}
.cd-t-template_retro .rt-right{text-align:right;}
.cd-t-template_retro .rt-party+.rt-party{margin-top:12px;}
.cd-t-template_retro .rt-tag{text-transform:uppercase;}
.cd-t-template_retro .cd-lines{color:var(--accent-ink);font-size:12px;line-height:1.6;}
.cd-t-template_retro .cd-items:not([data-cont])::before{content:'EXECUTING LINE ITEMS...';display:block;margin-bottom:16px;font-size:12px;}
.cd-t-template_retro .cd-table th{color:inherit;border-bottom:1px solid var(--accent);padding:10px;font-size:11.5px;letter-spacing:.04em;}
.cd-t-template_retro .cd-table td{border-bottom:1px dashed var(--accent);padding:10px;font-size:12px;}
.cd-t-template_retro .cd-table td.cd-c-desc .cd-item-name::before{content:'> ';}
.cd-t-template_retro .cd-item-sub{color:var(--muted);}
.cd-t-template_retro .cd-summary{margin-top:30px;}
.cd-t-template_retro .cd-totals{flex:0 0 336px;}
.cd-t-template_retro .cd-tot{padding:3px 0;font-size:12px;}
.cd-t-template_retro .cd-tot-label{color:inherit;text-transform:uppercase;}
.cd-t-template_retro .cd-tot-label::after{content:':';}
.cd-t-template_retro .cd-tot-value{font-weight:400;}
.cd-t-template_retro .cd-tot-grand{flex-wrap:wrap;align-items:center;background:none;color:inherit;border-radius:0;border-top:1px solid var(--accent);margin-top:10px;padding:10px 0 0;font-size:20px;font-weight:700;}
.cd-t-template_retro .cd-tot-grand .cd-tot-value{margin-left:auto;background:var(--accent);color:var(--on-accent);padding:0 5px;font-weight:700;text-shadow:none;}
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
.cd-t-template_retro .cd-sigs{gap:20px;}
.cd-t-template_retro .cd-sig{flex:1 1 260px;max-width:none;border:1px dashed var(--accent);padding:10px;display:flex;flex-direction:column;}
.cd-t-template_retro .cd-sig.cd-sig-blank{border:0;padding:10px 0 0;}
.cd-t-template_retro .cd-sig-label{order:-1;margin:0 0 5px;color:inherit;font-size:10px;letter-spacing:.04em;}
.cd-t-template_retro .cd-sig-label::before{content:'[';} .cd-t-template_retro .cd-sig-label::after{content:']';}
.cd-t-template_retro .cd-sig-img{height:42px;}
.cd-t-template_retro .cd-sig-img img{filter:invert(1) hue-rotate(90deg);}
.cd-t-template_retro .cd-prose h3{margin-top:10px;}
.cd-t-template_retro .cd-sig-line{border-top:1px dashed var(--accent);margin-top:5px;}
.cd-t-template_retro .cd-sig-meta,.cd-t-template_retro .cd-sig-fill{color:inherit;}
.cd-t-template_retro .rt-eot{text-align:center;font-size:12px;margin-top:16px;}
.cd-t-template_retro .cd-prose th{background:${rgba(c.accentInk, 0.1)};}
.cd-t-template_retro .cd-widget{border-style:dashed;border-color:var(--accent);border-radius:0;}
.cd-t-template_retro .cd-w-metric{background:${rgba(c.accentInk, 0.08)};border-radius:0;}
.cd-t-template_retro .cd-footer{color:var(--muted);}
${darkFixes('cd-t-template_retro')}
`,
};

// ---------------------------------------------------------------------------
// 19. Playful Pop: halftone yellow page, white comic card, tilted title sticker, big total badge
// ---------------------------------------------------------------------------
const POP_YELLOW = '#fff000';
const OUTLINE = (w: number) => [`-${w}px -${w}px 0 #000`, `${w}px -${w}px 0 #000`, `-${w}px ${w}px 0 #000`, `${w}px ${w}px 0 #000`, `0 ${w}px 0 #000`, `0 -${w}px 0 #000`, `${w}px 0 0 #000`, `-${w}px 0 0 #000`].join(',');

/** Halftone dot pattern as SVG (crisper than a repeated radial-gradient at print resolution). */
const halftone = (w: number, h: number) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="pp-dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.1" fill="#000000" fill-opacity="0.16"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#pp-dots)"/></svg>`;

const pop: ThemeDef = {
  id: 'template_pop',
  pad: { top: 66, x: 76, bottom: 82, footer: 58 },
  ink: '#111111',
  header: ({ m }) => {
    const titleSize = m.title.length <= 9 ? 40 : m.title.length <= 12 ? 33 : 28;
    const sub = m.number || m.status ? `<div class="pp-no">${m.number ? `<span>${m.numberLabel} <b>${m.number}</b></span>` : ''}${statusBadge(m)}</div>` : '';
    const left = `<div class="pp-left"><div class="pp-titlebox"><h1 class="pp-title" style="font-size:${titleSize}px">${m.title}!!!</h1></div>${sub}</div>`;
    const circle = m.keyDate ? `<div class="pp-circle"><div><div class="pp-cl">${m.keyDate.label}</div><div class="pp-cv">${m.keyDate.value}</div></div></div>` : '';
    const co = m.company.name || m.company.logoUrl || m.company.lines.length
      ? block('pp-co', `${m.company.logoUrl ? `<div class="pp-co-logo">${logoImg(m)}</div>` : ''}<div class="pp-co-text">${m.company.name ? `<div class="pp-co-name">${m.company.name}</div>` : ''}${lines(companyShortLines(m))}</div>`)
      : '';
    return block('cd-hdr', left + circle) + co;
  },
  parties: ({ m }) => {
    // the date circle already shows the key date: don't print it twice
    const items = m.keyDate ? m.meta.filter((i) => i.value !== m.keyDate!.value) : m.meta;
    const meta = items.length ? `<div class="pp-meta">${items.map((i) => `<div class="pp-mi"><span class="pp-ml">${i.label}</span> <span class="pp-mv">${i.value}</span></div>`).join('')}</div>` : '<div class="pp-meta"></div>';
    const who = m.parties.length ? `<div class="pp-who">${m.parties.map((p) => `<div class="pp-party"><span class="pp-tag">${p.label}:</span>${p.name ? `<div class="pp-pname">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('')}</div>` : '';
    return items.length || who ? block(`cd-parties pp-parties${m.parties.length > 1 ? ' pp-many' : ''}`, meta + who) : '';
  },
  // the small totals on the left, the big tilted total badge on the right (alone: centered, like the original);
  // the pay button / financing / closing line follow in their own row (so a page break can fall between them)
  summary: ({ m }) => {
    if (!hasSummary(m)) return '';
    const gi = m.totals.findIndex((t) => t.kind === 'grand');
    const grand: TotalLine | undefined = m.totals[gi];
    const before = gi >= 0 ? m.totals.slice(0, gi) : m.totals;
    const after = gi >= 0 ? m.totals.slice(gi + 1) : [];
    const side = `${payButton(m)}${summaryNotes(m)}${closingInline(m)}`;
    const left = before.length ? `<div class="pp-sum-left">${totalsHtml(before, 'cd-totals pp-small')}</div>` : '';
    const right = grand || after.length
      ? `<div class="pp-sum-right">${grand ? `<div class="pp-big cd-tot cd-tot-grand"><div class="pp-big-l cd-tot-label">${grand.label}</div><div class="pp-big-v cd-tot-value cd-num">${grand.value}</div></div>` : ''}${after.length ? totalsHtml(after, 'cd-totals pp-small pp-after') : ''}</div>`
      : '';
    const totals = left || right ? block(`cd-summary pp-summary${left ? '' : ' pp-solo'}${right ? '' : ' pp-noright'}`, left + right) : '';
    return totals + (side ? block('pp-payrow', `<div class="cd-summary-side">${side}</div>`) : '');
  },
  chrome: ({ page }) => `<div class="pp-bg">${halftone(page.width, page.height)}</div><div class="pp-card"></div>`,
  css: ({ c }) => `
.cd-t-template_pop .pp-bg{position:absolute;left:0;top:0;right:0;bottom:0;background:${POP_YELLOW};}
.cd-t-template_pop .pp-bg svg{position:absolute;left:0;top:0;}
.cd-t-template_pop .pp-card{position:absolute;left:40px;top:40px;right:40px;bottom:40px;background:var(--paper);border:5px solid #000000;box-shadow:15px 15px 0 var(--secondary);}
.cd-t-template_pop .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:18px;}
.cd-t-template_pop .pp-left{min-width:0;padding:8px 0 0 4px;}
.cd-t-template_pop .pp-titlebox{display:inline-block;max-width:100%;background:var(--accent);border:3px solid #000000;box-shadow:5px 5px 0 #000000;padding:14px 20px;transform:rotate(-3deg);}
.cd-t-template_pop .pp-title{font-family:var(--font-head);font-weight:700;line-height:1.05;text-transform:uppercase;color:#ffffff;-webkit-text-stroke:2px #000000;overflow-wrap:anywhere;}
.cd-t-template_pop .pp-no{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;font-size:14px;margin-top:18px;}
.cd-t-template_pop .pp-no b{font-weight:700;}
.cd-t-template_pop .pp-no .cd-status{margin-top:0;}
.cd-t-template_pop .pp-circle{flex:none;width:126px;height:126px;margin:0 5px 5px 0;border-radius:50%;background:#ffffff;border:3px solid #000000;box-shadow:5px 5px 0 #000000;display:flex;align-items:center;justify-content:center;text-align:center;padding:14px;}
.cd-t-template_pop .pp-cl{font-size:12px;font-weight:700;text-transform:uppercase;line-height:1.2;}
.cd-t-template_pop .pp-cv{font-size:16px;font-weight:700;line-height:1.2;margin-top:3px;color:var(--secondary-ink);}
.cd-t-template_pop .pp-co{display:flex;align-items:center;gap:16px;background:var(--secondary);color:${readableOn(c.secondary, '#ffffff', '#000000')};border:3px solid #000000;padding:12px 22px;margin:0 6px 18px;transform:skewX(-5deg);}
.cd-t-template_pop .pp-co-logo{flex:none;background:#ffffff;border:2px solid #000000;padding:4px 6px;}
.cd-t-template_pop .pp-co-logo .cd-logo{max-height:38px;max-width:130px;}
.cd-t-template_pop .pp-co-text{min-width:0;}
.cd-t-template_pop .pp-co-name{font-family:var(--font-head);font-size:22px;font-weight:700;line-height:1.15;text-transform:uppercase;overflow-wrap:anywhere;}
.cd-t-template_pop .pp-co .cd-lines{color:inherit;font-size:11.5px;font-weight:700;margin-top:3px;}
.cd-t-template_pop .pp-parties{justify-content:space-between;gap:28px;margin-bottom:16px;}
.cd-t-template_pop .pp-meta{flex:1 1 50%;min-width:0;display:flex;flex-wrap:wrap;align-content:flex-start;gap:10px;padding-top:4px;}
.cd-t-template_pop .pp-mi{background:#ffffff;border:2px solid #000000;box-shadow:3px 3px 0 #000000;padding:3px 10px;font-size:12px;max-width:100%;overflow-wrap:anywhere;}
.cd-t-template_pop .pp-ml{font-weight:700;text-transform:uppercase;font-size:10px;margin-right:3px;}
.cd-t-template_pop .pp-mv{font-weight:700;}
.cd-t-template_pop .pp-who{flex:1 1 auto;min-width:0;text-align:right;}
.cd-t-template_pop .pp-party+.pp-party{margin-top:14px;}
.cd-t-template_pop .pp-many .pp-meta{flex:0 1 32%;}
.cd-t-template_pop .pp-many .pp-who{flex:1 1 68%;display:flex;justify-content:flex-end;gap:32px;}
.cd-t-template_pop .pp-many .pp-party{flex:0 1 auto;min-width:0;}
.cd-t-template_pop .pp-many .pp-party+.pp-party{margin-top:0;}
.cd-t-template_pop .pp-many .pp-pname{font-size:24px;}
.cd-t-template_pop .pp-tag{display:inline-block;background:#000000;color:#ffffff;padding:4px 10px;font-weight:700;font-size:16px;line-height:1.2;text-transform:uppercase;}
.cd-t-template_pop .pp-pname{font-family:var(--font-head);font-size:28px;font-weight:700;line-height:1.15;margin-top:8px;overflow-wrap:anywhere;}
.cd-t-template_pop .pp-who .cd-lines{color:var(--ink);font-size:12px;font-weight:700;margin-top:2px;}
.cd-t-template_pop .cd-table{border-collapse:separate;border-spacing:0 5px;}
.cd-t-template_pop .cd-table th{background:#000000;color:#ffffff;padding:10px 12px;font-size:12px;letter-spacing:.04em;}
.cd-t-template_pop .cd-table td{background:#ffffff;border-bottom:0;padding:9px 12px;font-size:12.5px;font-weight:700;}
.cd-t-template_pop .cd-table td.cd-col-1.cd-num{color:var(--accent-ink);}
.cd-t-template_pop .cd-table td.cd-col-2.cd-num{color:var(--secondary-ink);}
.cd-t-template_pop .cd-table td.cd-col-last{background:${POP_YELLOW};color:#000000;}
.cd-t-template_pop .cd-item-sub{font-weight:400;}
.cd-t-template_pop .pp-summary{display:flex;justify-content:space-between;align-items:center;gap:28px;margin-top:2px;}
.cd-t-template_pop .pp-summary.pp-solo{justify-content:center;}
.cd-t-template_pop .pp-summary.pp-noright{justify-content:flex-end;}
.cd-t-template_pop .pp-sum-left{flex:0 1 310px;min-width:0;}
.cd-t-template_pop .pp-small{flex:none;background:#ffffff;border:3px solid #000000;box-shadow:6px 6px 0 #000000;padding:7px 14px;margin-right:6px;}
.cd-t-template_pop .pp-small .cd-tot{font-weight:700;}
.cd-t-template_pop .pp-small .cd-tot-label{color:var(--ink);}
.cd-t-template_pop .pp-small .cd-tot-balance{border-top:2px solid #000000;}
.cd-t-template_pop .pp-sum-right{flex:0 1 auto;min-width:0;display:flex;flex-direction:column;align-items:center;gap:20px;padding:2px 12px 10px 0;}
.cd-t-template_pop .pp-big{position:relative;display:block;max-width:100%;background:var(--accent);border:5px solid #000000;border-radius:0;padding:14px 42px;margin:0;text-align:left;transform:rotate(2deg);box-shadow:10px 10px 0 ${POP_YELLOW};}
.cd-t-template_pop .pp-big-l{display:block;font-size:20px;font-weight:700;color:#ffffff;text-transform:uppercase;text-shadow:${OUTLINE(1)};}
.cd-t-template_pop .pp-big-v{display:block;font-family:var(--font-head);font-size:44px;font-weight:700;line-height:1.1;color:#ffffff;-webkit-text-stroke:2px #000000;overflow-wrap:anywhere;}
.cd-t-template_pop .pp-after{align-self:stretch;}
.cd-t-template_pop .cd-sum-closing,.cd-t-template_pop .cd-closing-text{font-size:18px;color:var(--accent-ink);}
.cd-t-template_pop .cd-closing{text-align:center;}
.cd-t-template_pop .pp-payrow .cd-summary-side{display:flex;flex-wrap:wrap;align-items:center;gap:12px 28px;}
.cd-t-template_pop .pp-payrow .cd-pay{flex:0 1 auto;margin:0;}
.cd-t-template_pop .pp-payrow .cd-fin{flex:1 1 220px;margin:0;}
.cd-t-template_pop .pp-payrow .cd-sum-note{flex:1 1 280px;margin:0;}
.cd-t-template_pop .pp-payrow .cd-sum-closing{flex:0 1 auto;margin:0 0 0 auto;}
.cd-t-template_pop .cd-pay-btn{background:var(--accent);color:#ffffff;border:3px solid #000000;box-shadow:4px 4px 0 #000000;border-radius:0;text-shadow:${OUTLINE(1)};}
.cd-t-template_pop .cd-h{display:inline-block;background:#000000;color:#ffffff;padding:3px 10px;font-size:12px;letter-spacing:.06em;}
.cd-t-template_pop .cd-label{color:var(--ink);}
.cd-t-template_pop .cd-prose{font-size:12.5px;}
.cd-t-template_pop .cd-facts{margin-bottom:22px;}
.cd-t-template_pop .cd-fact{background:#ffffff;border:3px solid #000000;box-shadow:6px 6px 0 #000000;border-radius:0;margin-right:6px;}
.cd-t-template_pop .cd-fact-label{color:var(--ink);}
.cd-t-template_pop .cd-fact-value{color:var(--accent-ink);}
.cd-t-template_pop .cd-tag{background:var(--secondary);color:${readableOn(c.secondary, '#ffffff', '#000000')};border:2px solid #000000;border-radius:0;font-weight:700;}
.cd-t-template_pop .cd-status{background:#ffffff;border-width:2px;border-radius:0;box-shadow:2px 2px 0 currentColor;}
.cd-t-template_pop .cd-sigs{justify-content:center;}
.cd-t-template_pop .cd-sig{display:flex;flex-direction:column;text-align:center;background:#ffffff;border:3px solid #000000;box-shadow:5px 5px 0 #000000;padding:8px 16px 10px;max-width:280px;}
.cd-t-template_pop .cd-sig.cd-sig-blank{background:none;border:0;box-shadow:none;padding:10px 0 0;}
.cd-t-template_pop .cd-sig-label{order:-1;margin:0 0 6px;color:#000000;font-size:12px;}
.cd-t-template_pop .cd-sig-img{justify-content:center;height:42px;}
.cd-t-template_pop .cd-prose h3{margin-top:10px;}
.cd-t-template_pop .cd-sig-line{border-top:2px solid #000000;}
.cd-t-template_pop .cd-widget{border:3px solid #000000;border-radius:0;}
`,
};

// ---------------------------------------------------------------------------
// 20. Elegant Serif: small-caps masthead on ivory, details columns, centered title, double-ruled total
// ---------------------------------------------------------------------------
const serif: ThemeDef = {
  id: 'template_serif',
  pad: { top: 52, x: 80, bottom: 74 },
  ink: '#333333',
  header: ({ m }) => block('cd-hdr', `${logoImg(m)}${m.company.name ? `<div class="es-co">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="es-tag">${m.company.tagline}</div>` : ''}${lines(companyShortLines(m), 'es-lines')}`),
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
.cd-t-template_serif .cd-hdr{text-align:center;border-bottom:1px solid var(--accent);padding-bottom:20px;margin-bottom:26px;}
.cd-t-template_serif .cd-logo{margin:0 auto 10px;max-height:40px;}
.cd-t-template_serif .es-co{font-family:var(--font-head);font-size:48px;line-height:1.05;letter-spacing:2px;font-variant:small-caps;color:var(--ink);overflow-wrap:anywhere;}
.cd-t-template_serif .es-tag{font-size:14px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:7px;}
.cd-t-template_serif .es-lines{font-size:12px;line-height:1.6;color:var(--muted);margin-top:6px;}
.cd-t-template_serif .es-parties{justify-content:space-between;gap:36px;margin-bottom:24px;}
.cd-t-template_serif .es-col{flex:0 1 auto;min-width:0;overflow-wrap:anywhere;}
.cd-t-template_serif .es-details{text-align:right;margin-left:auto;}
.cd-t-template_serif .es-h{display:inline-block;font-variant:small-caps;font-weight:700;font-size:15px;letter-spacing:.02em;border-bottom:1px solid var(--accent);margin-bottom:10px;}
.cd-t-template_serif .es-pname{font-size:18px;margin-bottom:5px;}
.cd-t-template_serif .es-parties .cd-lines{font-size:14px;line-height:1.55;color:${mix(c.ink, c.paper, 0.25)};}
.cd-t-template_serif .es-dr{font-size:14px;margin-bottom:5px;}
.cd-t-template_serif .es-dr em{font-style:italic;}
.cd-t-template_serif .es-titlebar{text-align:center;margin-bottom:14px;}
.cd-t-template_serif .es-title{font-family:var(--font-head);font-size:24px;font-weight:700;line-height:1.2;text-transform:uppercase;letter-spacing:3px;margin-right:-3px;color:var(--accent-ink);}
.cd-t-template_serif .es-titlebar .cd-status{margin-top:8px;}
.cd-t-template_serif .cd-table{border-top:2px solid var(--accent);border-bottom:2px solid var(--accent);}
.cd-t-template_serif .cd-table th{font-weight:400;font-style:italic;text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink);border-bottom:1px solid var(--accent);padding:12px 5px;}
.cd-t-template_serif .cd-table td{padding:12px 5px;border-bottom:1px solid ${mix(c.ink, c.paper, 0.75)};font-size:13px;}
.cd-t-template_serif .cd-table td.cd-c-desc .cd-item-name{font-style:italic;}
.cd-t-template_serif .cd-summary{margin-top:22px;}
.cd-t-template_serif .cd-totals{flex:0 0 260px;}
.cd-t-template_serif .cd-tot{padding:5px 0;font-size:13.5px;}
.cd-t-template_serif .cd-tot-label{color:var(--ink);}
.cd-t-template_serif .cd-tot-value{font-weight:400;}
.cd-t-template_serif .cd-tot-grand .cd-tot-value,.cd-t-template_serif .cd-tot-balance .cd-tot-value{font-weight:700;}
.cd-t-template_serif .cd-tot-grand{background:none;color:var(--ink);border-radius:0;border-top:1px solid var(--accent);border-bottom:3px double var(--accent);margin-top:10px;padding:14px 0;font-size:20px;font-weight:700;}
.cd-t-template_serif .cd-tot-grand .cd-tot-label{color:inherit;}
.cd-t-template_serif .cd-tot-balance{border-top:0;font-size:15px;}
.cd-t-template_serif .cd-pay-btn{border-radius:0;}
.cd-t-template_serif .cd-sum-closing,.cd-t-template_serif .cd-closing-text{font-weight:400;font-style:italic;color:var(--ink);}
.cd-t-template_serif .cd-closing{text-align:center;}
.cd-t-template_serif .cd-h,.cd-t-template_serif .cd-label{display:inline-block;font-variant:small-caps;text-transform:none;font-weight:700;font-size:15px;letter-spacing:.02em;color:var(--ink);border-bottom:1px solid var(--accent);padding-bottom:1px;}
.cd-t-template_serif .cd-h{margin-bottom:10px;}
.cd-t-template_serif .cd-fact{background:transparent;border-color:${mix(c.ink, c.paper, 0.6)};border-radius:0;}
.cd-t-template_serif .cd-fact-value{color:var(--ink);font-weight:400;}
.cd-t-template_serif .cd-tag{background:transparent;border:1px solid var(--rule-strong);color:var(--ink);font-style:italic;}
.cd-t-template_serif .cd-sigs{justify-content:center;}
.cd-t-template_serif .cd-sig{text-align:center;max-width:250px;}
.cd-t-template_serif .cd-sig-img{justify-content:center;height:42px;}
.cd-t-template_serif .cd-prose h3{margin-top:8px;}
.cd-t-template_serif .cd-facts{margin-bottom:16px;}
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
