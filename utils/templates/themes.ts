/**
 * The document designs. Each one re-uses the shared blocks (blocks.ts) and adds its own header,
 * page chrome and stylesheet. All colors come from the palette (user accent/secondary or the
 * template defaults); SVG decorations get literal colors because html2canvas renders SVG as an image.
 */
import type { TemplateId } from './registry.ts';
import { mix } from './colors.ts';
import {
  block, closingInline, defaultCompose, defaultParties, docNumber, footerHtml, lines, logoImg, metaList, monogram,
  partyBlocks, payButton, statusBadge, summaryNotes, titleH1, totalsHtml,
  type RenderCtx, type ThemeDef,
} from './blocks.ts';
import { metaLines, metaStrip, rgba, without } from './kit.ts';
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

// ---------------------------------------------------------------------------
// 2. Modern Minimal (oversized title, hairline frame)
// ---------------------------------------------------------------------------
const modern: ThemeDef = {
  id: 'modern',
  pad: { top: 58, x: 66, bottom: 70, footer: 34 },
  sectionsGrid: true,
  header: ({ m }) => block('cd-hdr', `
    <div class="md-brand">${m.company.logoUrl ? logoImg(m) : `<div class="md-wordmark">${m.company.name}<span class="md-dot"></span></div>`}${m.company.tagline ? `<div class="md-tagline">${m.company.tagline}</div>` : ''}</div>
    <div class="md-doc">${titleH1(m)}${m.number ? `<div class="md-no">${m.number}</div>` : ''}${m.keyDate ? `<div class="md-date">${m.keyDate.label} · ${m.keyDate.value}</div>` : ''}${statusBadge(m)}</div>`),
  parties: (ctx) => block('cd-parties', `<div class="cd-party cd-party-from"><div class="cd-label">From</div><div class="cd-party-name">${ctx.m.company.name}</div>${lines(ctx.m.company.compactLines)}</div>${partyBlocks(ctx.m)}`) + metaStrip(ctx, 'md-strip'),
  chrome: () => '<div class="md-frame"></div>',
  css: () => `
.cd-t-modern{--title-size:64px;}
.cd-t-modern .md-frame{position:absolute;left:24px;top:24px;right:24px;bottom:24px;border:1px solid var(--ink);}
.cd-t-modern .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:32px;}
.cd-t-modern .md-brand{padding-top:6px;max-width:45%;}
.cd-t-modern .md-wordmark{font-family:var(--font-head);font-weight:900;font-size:28px;letter-spacing:-.03em;line-height:1.05;color:var(--ink);}
.cd-t-modern .md-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--secondary);margin-left:4px;}
.cd-t-modern .md-tagline{font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-top:8px;}
.cd-t-modern .md-doc{text-align:right;}
.cd-t-modern .cd-title{font-weight:900;text-transform:uppercase;letter-spacing:-.035em;line-height:.92;}
.cd-t-modern .md-no{font-size:16px;font-weight:800;margin-top:14px;text-transform:uppercase;letter-spacing:.01em;}
.cd-t-modern .md-date{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-top:6px;}
.cd-t-modern .md-doc .cd-status{margin-top:6px;}
.cd-t-modern .cd-label{color:var(--ink);font-size:10px;letter-spacing:.06em;}
.cd-t-modern .cd-parties{margin-bottom:22px;}
.cd-t-modern .cd-party:last-child:not(:first-child){text-align:right;}
.cd-t-modern .cd-party-name{font-size:12.5px;}
.cd-t-modern .cd-lines{color:var(--ink);font-size:11px;}
.cd-t-modern .md-strip{display:flex;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);margin-bottom:20px;}
.cd-t-modern .cd-strip-item{flex:1 1 0;padding:10px 12px 10px 0;min-width:0;}
.cd-t-modern .cd-strip-item .cd-label{margin-bottom:2px;font-size:8.5px;color:var(--muted);}
.cd-t-modern .cd-strip-value{font-weight:700;font-size:11.5px;overflow-wrap:anywhere;}
.cd-t-modern .cd-table th{color:var(--ink);font-size:10px;letter-spacing:.05em;border-bottom:1.5px solid var(--ink);padding:10px 8px;}
.cd-t-modern .cd-table td{border-bottom:1px solid var(--rule-strong);padding:9px 8px;font-size:11.5px;}
.cd-t-modern .cd-table th:first-child,.cd-t-modern .cd-table td:first-child{padding-left:0;}
.cd-t-modern .cd-table th:last-child,.cd-t-modern .cd-table td:last-child{padding-right:0;}
.cd-t-modern .cd-totals{flex-basis:270px;}
.cd-t-modern .cd-tot{padding:5px 0;}
.cd-t-modern .cd-tot-label{color:var(--ink);font-weight:800;text-transform:uppercase;font-size:10.5px;letter-spacing:.05em;flex:1;text-align:right;}
.cd-t-modern .cd-tot-value{font-weight:700;min-width:112px;text-align:right;}
.cd-t-modern .cd-tot-grand{background:none;color:var(--ink);border-top:1.5px solid var(--ink);border-radius:0;padding:10px 0 0;margin-top:8px;font-size:15px;}
.cd-t-modern .cd-tot-grand .cd-tot-label{font-size:13px;}
.cd-t-modern .cd-pay-btn{background:var(--ink);color:var(--paper);border-radius:0;}
.cd-t-modern .cd-h{color:var(--ink);font-size:10.5px;letter-spacing:.06em;}
.cd-t-modern .cd-fact{background:transparent;border:1px solid var(--ink);border-radius:0;}
.cd-t-modern .cd-fact-value{color:var(--ink);}
.cd-t-modern .cd-footer{left:50px;right:50px;}
`,
};

// ---------------------------------------------------------------------------
// 3. Corporate Blue (centered brand, label chips)
// ---------------------------------------------------------------------------
const corporate: ThemeDef = {
  id: 'corporate',
  pad: { top: 52, x: 58, bottom: 66 },
  header: ({ m, c }) => block('cd-hdr', `
    ${logoImg(m)}<div class="co-name">${m.company.name}</div>
    <svg class="co-swoosh" width="230" height="20" viewBox="0 0 230 20" xmlns="http://www.w3.org/2000/svg"><path d="M6 13 C 70 3, 160 3, 224 11" stroke="${c.secondary}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M60 16 C 100 11, 140 11, 176 15" stroke="${c.secondary}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
    ${m.company.tagline ? `<div class="co-tag">${m.company.tagline}</div>` : ''}`),
  parties: (ctx) => {
    const { m } = ctx;
    const left = `<div class="co-col"><div class="co-chip">${m.title}${m.number ? ` No. ${m.number}` : ''}</div>${metaLines(ctx)}${lines(m.company.compactLines)}${statusBadge(m)}</div>`;
    const right = m.parties.length
      ? `<div class="co-col co-right">${m.parties.map((p) => `<div class="co-party"><div class="co-chip">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('')}</div>`
      : '';
    return block('cd-parties co-parties', left + right);
  },
  css: () => `
.cd-t-corporate{--title-size:30px;}
.cd-t-corporate .cd-hdr{text-align:center;margin-bottom:22px;}
.cd-t-corporate .cd-logo{margin:0 auto 8px;max-height:52px;}
.cd-t-corporate .co-name{font-family:var(--font-head);font-weight:700;font-size:34px;line-height:1.1;color:var(--accent-ink);letter-spacing:-.01em;}
.cd-t-corporate .co-swoosh{display:block;margin:2px auto 0;}
.cd-t-corporate .co-tag{font-size:13px;font-style:italic;color:var(--accent-ink);margin-top:2px;}
.cd-t-corporate .co-parties{justify-content:space-between;margin-bottom:24px;}
.cd-t-corporate .co-col{flex:1 1 0;min-width:0;}
.cd-t-corporate .co-right{text-align:right;}
.cd-t-corporate .co-party+.co-party{margin-top:14px;}
.cd-t-corporate .co-chip{display:inline-block;background:var(--accent);color:var(--on-accent);font-family:var(--font-body);font-weight:700;font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding:5px 12px;margin-bottom:10px;}
.cd-t-corporate .cd-meta-lines{font-size:11.5px;line-height:1.6;margin-bottom:4px;}
.cd-t-corporate .cd-ml-label{font-weight:700;}
.cd-t-corporate .cd-lines{color:var(--ink);font-size:11.5px;line-height:1.6;}
.cd-t-corporate .cd-subject{text-align:center;}
.cd-t-corporate .cd-subject-text{font-family:var(--font-head);color:var(--accent-ink);font-size:20px;}
.cd-t-corporate .cd-table th{background:var(--accent);color:var(--on-accent);letter-spacing:.18em;font-size:9.5px;padding:10px 10px;}
.cd-t-corporate .cd-table td{border-bottom:1px solid var(--secondary);padding:9px 10px;}
.cd-t-corporate .cd-table tbody tr:last-child td{border-bottom:3px solid var(--accent);}
.cd-t-corporate .cd-tot-grand{border-radius:0;letter-spacing:.06em;text-transform:uppercase;font-size:13px;}
.cd-t-corporate .cd-h{font-family:var(--font-body);letter-spacing:.16em;}
.cd-t-corporate .cd-footer{justify-content:center;gap:18px;font-style:italic;}
`,
};

// ---------------------------------------------------------------------------
// 4. Spectrum Edge (gradient side strip)
// ---------------------------------------------------------------------------
const spectrumGradient = (ctx: RenderCtx) => ctx.c.custom
  ? `linear-gradient(180deg, ${mix(ctx.c.accent, '#ffffff', 0.55)} 0%, ${mix(ctx.c.accent, '#ffffff', 0.25)} 34%, ${mix(ctx.c.secondary, '#ffffff', 0.2)} 66%, ${ctx.c.secondary} 100%)`
  : 'linear-gradient(180deg, #a9c4f5 0%, #e7d2ee 22%, #f2e27c 48%, #f6b679 74%, #ec8f88 100%)';

const spectrum: ThemeDef = {
  id: 'spectrum',
  pad: { top: 58, x: 56, left: 196, bottom: 70 },
  sectionsGrid: true,
  header: ({ m, c }) => block('cd-hdr', `
    <div class="sp-left">${m.company.logoUrl ? logoImg(m) : `<svg class="sp-arrow" width="58" height="58" viewBox="0 0 58 58" xmlns="http://www.w3.org/2000/svg"><path d="M12 46 L44 14 M20 13 H45 V38" stroke="${c.ink}" stroke-width="9" fill="none"/></svg>`}
      <div class="sp-titlebox">${titleH1(m)}${m.number ? `<div class="sp-no">No. ${m.number}</div>` : ''}${statusBadge(m)}</div></div>
    <div class="sp-right"><div class="sp-co">${m.company.name}</div>${lines(m.company.lines)}</div>`),
  chrome: (ctx) => `<div class="sp-strip" style="background:${spectrumGradient(ctx)}"></div>`,
  css: () => `
.cd-t-spectrum{--title-size:44px;}
.cd-t-spectrum .sp-strip{position:absolute;left:38px;top:0;bottom:0;width:112px;}
.cd-t-spectrum .cd-hdr{display:flex;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid var(--ink);margin-bottom:28px;}
.cd-t-spectrum .sp-left{display:flex;gap:16px;align-items:flex-start;min-width:0;}
.cd-t-spectrum .sp-arrow{flex:none;margin-top:2px;}
.cd-t-spectrum .cd-logo{max-height:58px;max-width:120px;}
.cd-t-spectrum .cd-title{color:var(--ink);text-transform:uppercase;font-weight:900;letter-spacing:-.01em;}
.cd-t-spectrum .sp-no{font-size:17px;margin-top:4px;}
.cd-t-spectrum .sp-right{text-align:right;text-transform:uppercase;font-size:11px;line-height:1.55;max-width:46%;}
.cd-t-spectrum .sp-co{font-weight:800;font-size:12px;}
.cd-t-spectrum .sp-right .cd-lines{color:var(--ink);font-size:10.5px;}
.cd-t-spectrum .cd-label{color:var(--ink);font-size:10.5px;letter-spacing:.02em;}
.cd-t-spectrum .cd-party-name{text-transform:uppercase;font-size:12px;}
.cd-t-spectrum .cd-lines{color:var(--ink);}
.cd-t-spectrum .cd-parties{margin-bottom:34px;}
.cd-t-spectrum .cd-table th{color:var(--ink);font-size:10.5px;letter-spacing:.02em;padding:8px 6px;border-bottom:1px solid var(--ink);}
.cd-t-spectrum .cd-table td{border-bottom:1px solid var(--ink);padding:7px 6px;font-size:11.5px;}
.cd-t-spectrum .cd-table th:first-child,.cd-t-spectrum .cd-table td:first-child{padding-left:0;}
.cd-t-spectrum .cd-tot-label{color:var(--ink);font-weight:700;text-transform:uppercase;font-size:11px;}
.cd-t-spectrum .cd-tot-grand{background:none;color:var(--ink);border-radius:0;font-size:14px;padding:10px 2px;border-top:1px solid var(--ink);}
.cd-t-spectrum .cd-pay-btn{background:var(--ink);color:var(--paper);border-radius:0;}
.cd-t-spectrum .cd-h{color:var(--ink);font-size:11px;letter-spacing:.02em;}
.cd-t-spectrum .cd-grid2{border-top:1px solid var(--ink);padding-top:16px;}
.cd-t-spectrum .cd-sig{border:1px solid var(--ink);padding:12px 14px;display:flex;flex-direction:column;max-width:260px;}
.cd-t-spectrum .cd-sig-label{order:-1;margin:0 0 4px;color:var(--ink);}
.cd-t-spectrum .cd-sig-img{height:56px;}
.cd-t-spectrum .cd-fact{background:transparent;border-color:var(--ink);border-radius:0;}
.cd-t-spectrum .cd-fact-value{color:var(--ink);}
`,
};

// ---------------------------------------------------------------------------
// 5. Bold Statement (heavy title, black grid, soft color glows)
// ---------------------------------------------------------------------------
const statement: ThemeDef = {
  id: 'statement',
  pad: { top: 50, x: 60, bottom: 66 },
  header: ({ m }) => block('cd-hdr', `${logoImg(m)}${titleH1(m)}<div class="st-sub">${[m.number ? `No. ${m.number}` : '', m.keyDate ? `${m.keyDate.label}: ${m.keyDate.value}` : ''].filter(Boolean).join(' — ')}</div>${statusBadge(m)}`),
  parties: (ctx) => {
    const { m } = ctx;
    const cols = [
      m.company.name || m.company.lines.length ? `<div class="cd-party st-from"><div class="st-ph">${m.company.name}</div>${lines(m.company.compactLines)}</div>` : '',
      ...m.parties.map((p) => `<div class="cd-party"><div class="st-ph">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
    ].join('');
    return block('cd-parties st-parties', cols) + metaStrip(ctx, 'st-strip');
  },
  chrome: ({ c }) => {
    const c1 = c.secondary;
    const c2 = mix(c.secondary, '#ff4f7b', 0.55);
    const c3 = mix(c.secondary, '#ffd54a', 0.6);
    const blob = (pos: string, size: number, color: string, a: number) =>
      `<div class="st-blob" style="${pos};width:${size}px;height:${size}px;background:radial-gradient(circle at center, ${rgba(color, a)} 0%, ${rgba(color, a * 0.45)} 38%, ${rgba(color, 0)} 70%)"></div>`;
    return blob('left:-170px;top:-170px', 400, c1, 0.6) + blob('right:-190px;top:-150px', 420, c2, 0.5)
      + blob('left:-180px;bottom:-200px', 420, c3, 0.55) + blob('right:-160px;bottom:-170px', 380, c1, 0.5);
  },
  css: () => `
.cd-t-statement{--title-size:54px;}
.cd-t-statement .st-blob{position:absolute;border-radius:50%;}
.cd-t-statement .cd-hdr{text-align:center;margin-bottom:24px;}
.cd-t-statement .cd-logo{margin:0 auto 10px;max-height:44px;}
.cd-t-statement .cd-title{color:var(--ink);text-transform:uppercase;font-weight:900;letter-spacing:.01em;line-height:.95;}
.cd-t-statement .st-sub{font-size:13px;margin-top:8px;letter-spacing:.04em;}
.cd-t-statement .st-parties{justify-content:space-between;margin-bottom:20px;}
.cd-t-statement .st-parties .cd-party:last-child:not(:first-child){text-align:right;}
.cd-t-statement .st-ph{font-family:var(--font-head);font-size:20px;font-weight:700;margin-bottom:6px;line-height:1.15;}
.cd-t-statement .cd-lines{color:var(--ink);font-size:11.5px;}
.cd-t-statement .st-strip{display:flex;gap:20px;margin-bottom:16px;}
.cd-t-statement .cd-strip-item{flex:1 1 0;min-width:0;}
.cd-t-statement .cd-strip-item .cd-label{color:var(--ink);margin-bottom:2px;font-size:9px;}
.cd-t-statement .cd-strip-value{font-size:12px;font-weight:600;}
.cd-t-statement .cd-table{border:1.5px solid var(--ink);}
.cd-t-statement .cd-table th,.cd-t-statement .cd-table td{border:1.5px solid var(--ink);padding:10px 14px;}
.cd-t-statement .cd-table th{background:var(--accent);color:var(--on-accent);font-size:11.5px;letter-spacing:.05em;}
.cd-t-statement .cd-table td{font-size:12px;background:rgba(255,255,255,.72);}
.cd-t-statement .cd-totals{flex-basis:300px;}
.cd-t-statement .cd-tot{padding:5px 14px;font-size:13px;}
.cd-t-statement .cd-tot-label{color:var(--ink);text-transform:uppercase;letter-spacing:.04em;}
.cd-t-statement .cd-tot-grand{border-radius:0;text-transform:uppercase;letter-spacing:.06em;font-size:15px;padding:10px 14px;}
.cd-t-statement .cd-tot-grand .cd-tot-label{color:inherit;}
.cd-t-statement .cd-sum-closing{font-size:22px;font-weight:900;text-transform:uppercase;color:var(--ink);line-height:1.1;margin-top:10px;}
.cd-t-statement .cd-pay-btn{border-radius:0;}
.cd-t-statement .cd-h{color:var(--ink);font-size:11px;letter-spacing:.08em;}
.cd-t-statement .cd-fact{background:rgba(255,255,255,.75);border:1.5px solid var(--ink);border-radius:0;}
.cd-t-statement .cd-fact-value{color:var(--ink);}
.cd-t-statement .cd-closing{text-align:center;margin-top:10px;}
.cd-t-statement .cd-closing-text{font-size:26px;font-weight:900;text-transform:uppercase;color:var(--ink);letter-spacing:.01em;}
`,
};

// ---------------------------------------------------------------------------
// 6. Executive Slate (dark brand block, condensed headings, footer bar)
// ---------------------------------------------------------------------------
const executive: ThemeDef = {
  id: 'executive',
  pad: { top: 44, x: 56, bottom: 78, footer: 0 },
  ink: '#22292d',
  closingBlock: true,
  header: ({ m }) => block('cd-hdr', `
    <div class="ex-block">${m.company.logoUrl ? `<div class="ex-logo">${logoImg(m)}</div>` : ''}<div class="ex-name">${m.company.name}</div></div>
    <div class="ex-titlebox">${titleH1(m)}${statusBadge(m)}</div>`),
  parties: (ctx) => {
    const { m } = ctx;
    const [first, ...rest] = m.parties;
    const left = `<div class="ex-client">${first ? `<div class="ex-label">${first.label}</div>${first.name ? `<div class="ex-client-name">${first.name}</div>` : ''}${lines(first.lines)}` : ''}
      ${rest.map((p) => `<div class="ex-label ex-label-sm">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}`).join('')}</div>`;
    const right = `<div class="ex-co"><div class="ex-co-name">${m.company.name}</div>${lines(m.company.compactLines)}</div>`;
    const strip = [m.number ? { label: m.numberLabel, value: m.number } : null, ...m.meta].filter(Boolean) as Array<{ label: string; value: string }>;
    return block('cd-parties ex-parties', left + right)
      + (strip.length ? block('ex-strip', strip.map((i) => `<div class="ex-strip-item"><div class="ex-strip-label">${i.label}</div><div class="ex-strip-value">${i.value}</div></div>`).join('')) : '');
  },
  compose: (ctx, p) => {
    const { m } = ctx;
    const pay = payButton(m) || (m.company.phone || m.company.email ? `<div class="ex-band-text">${[m.company.phone, m.company.email].filter(Boolean).join('<span class="cd-dot">·</span>')}</div>` : '');
    const due = m.keyDate ? `<div class="ex-due"><div class="ex-band-label">${m.keyDate.label}</div><div class="ex-band-big">${m.keyDate.value}</div></div>` : '';
    const left = `<div class="ex-band-col"><div class="ex-band-h">${m.paymentLink ? 'Payment' : 'Contact'}</div>${pay}${summaryNotes(m)}${due}${m.closing ? `<div class="ex-band-thanks">${m.closing}</div>` : ''}</div>`;
    const band = `<section class="cd-block cd-pin ex-band${m.totals.length ? '' : ' ex-band-slim'}"${m.totals.length || m.paymentLink ? '' : ' data-optional="1"'}>${left}${totalsHtml(m.totals)}</section>`;
    return [...defaultCompose(without(p, 'closing', 'summary')), band];
  },
  css: () => `
.cd-t-executive{--title-size:64px;}
.cd-t-executive .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:20px;}
.cd-t-executive .ex-block{background:var(--accent);color:var(--on-accent);margin-top:calc(-1 * var(--pt));margin-left:calc(-1 * var(--pl));padding:32px 30px 26px var(--pl);width:330px;min-height:118px;display:flex;align-items:center;gap:14px;flex:none;}
.cd-t-executive .ex-logo{background:#fff;border-radius:6px;padding:6px;flex:none;}
.cd-t-executive .ex-logo .cd-logo{max-height:46px;max-width:110px;}
.cd-t-executive .ex-name{font-family:var(--font-head);font-size:21px;font-weight:500;letter-spacing:.03em;line-height:1.15;overflow-wrap:anywhere;}
.cd-t-executive .ex-titlebox{text-align:right;padding-top:4px;min-width:0;}
.cd-t-executive .cd-title{text-transform:uppercase;font-weight:700;letter-spacing:.14em;margin-right:-.14em;}
.cd-t-executive .ex-parties{justify-content:space-between;margin-bottom:14px;}
.cd-t-executive .ex-strip{display:flex;gap:16px;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:8px 0;margin-bottom:20px;}
.cd-t-executive .ex-strip-item{flex:1 1 0;min-width:0;}
.cd-t-executive .ex-strip-label{font-family:var(--font-head);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
.cd-t-executive .ex-strip-value{font-size:11.5px;font-weight:600;overflow-wrap:anywhere;}
.cd-t-executive .ex-band-thanks{font-family:var(--font-head);font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink);margin-top:8px;}
.cd-t-executive .ex-client{flex:1 1 0;min-width:0;}
.cd-t-executive .ex-label{font-family:var(--font-head);font-size:19px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:6px;}
.cd-t-executive .ex-label-sm{font-size:13px;margin-top:12px;}
.cd-t-executive .ex-client-name{font-size:15px;margin-bottom:4px;}
.cd-t-executive .ex-ml{font-size:10.5px;color:var(--muted);line-height:1.6;}
.cd-t-executive .ex-co{flex:1 1 0;min-width:0;text-align:right;}
.cd-t-executive .ex-co-name{font-size:14px;margin-bottom:4px;}
.cd-t-executive .ex-co .cd-lines{font-size:12px;color:var(--ink);line-height:1.6;}
.cd-t-executive .cd-table th{font-family:var(--font-head);font-size:12.5px;font-weight:600;letter-spacing:.14em;color:var(--accent-ink);border-bottom:1.5px solid var(--accent);padding:10px 8px;}
.cd-t-executive .cd-table td{font-size:11.5px;padding:8px 8px;}
.cd-t-executive .cd-table th:first-child,.cd-t-executive .cd-table td:first-child{padding-left:0;}
.cd-t-executive .cd-table th:last-child,.cd-t-executive .cd-table td:last-child{padding-right:0;}
.cd-t-executive .cd-tot-label{font-family:var(--font-head);color:var(--ink);font-weight:600;letter-spacing:.04em;}
.cd-t-executive .cd-tot-value{font-family:var(--font-head);font-weight:600;}
.cd-t-executive .cd-tot-grand{background:none;color:var(--accent-ink);border-top:1.5px solid var(--accent);border-radius:0;padding:8px 2px;font-size:16px;}
.cd-t-executive .cd-h{font-size:12px;letter-spacing:.14em;font-weight:700;}
.cd-t-executive .ex-band{background:var(--accent-soft);margin:12px calc(-1 * var(--px)) calc(56px - var(--pb)) calc(-1 * var(--pl));padding:18px var(--px) 16px var(--pl);}
.cd-t-executive .ex-band{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;}
.cd-t-executive .ex-band .cd-totals{flex:0 0 280px;}
.cd-t-executive .ex-band-label{font-family:var(--font-head);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:12px;}
.cd-t-executive .ex-band-slim{padding-top:14px;padding-bottom:12px;}
.cd-t-executive .ex-band-slim .ex-band-col{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;width:100%;}
.cd-t-executive .ex-band-slim .ex-band-label{margin-top:0;}
.cd-t-executive .ex-band-col{min-width:0;flex:1 1 auto;}
.cd-t-executive .ex-band-h{font-family:var(--font-head);font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-ink);}
.cd-t-executive .ex-band-col>.ex-band-h{border-bottom:1.5px solid var(--accent);padding-bottom:6px;margin-bottom:10px;}
.cd-t-executive .ex-band-big{font-family:var(--font-head);font-size:24px;font-weight:700;color:var(--accent-ink);}
.cd-t-executive .ex-band-text{font-size:11.5px;}
.cd-t-executive .cd-footer{left:0;right:0;bottom:0;height:56px;background:var(--accent);color:var(--on-accent);padding:0 var(--px) 0 var(--pl);font-size:10px;letter-spacing:.04em;}
.cd-t-executive .cd-fact{border-radius:0;}
`,
};

// ---------------------------------------------------------------------------
// 7. Ledger (typewriter on warm paper, ruled grid)
// ---------------------------------------------------------------------------
const ledger: ThemeDef = {
  id: 'ledger',
  pad: { top: 56, x: 56, bottom: 66 },
  ink: '#2b2620',
  fillRows: 5,
  sectionsGrid: true,
  header: ({ m }) => block('cd-hdr', `${titleH1(m)}<div class="lg-brand">${logoImg(m)}<div class="lg-name">${m.company.name}</div></div>`)
    + block('lg-sub', `<div class="lg-meta">${m.number ? `<div>${m.numberLabel} #${m.number}</div>` : ''}${m.meta.map((i) => `<div>${i.label}: ${i.value}</div>`).join('')}${statusBadge(m)}</div><div class="lg-contact">${m.company.compactLines.map((l) => `<div>${l}</div>`).join('')}</div>`),
  parties: ({ m }) => (m.parties.length ? block('cd-parties lg-parties', m.parties.map((p) => `<div class="cd-party"><div class="lg-ph">${p.label}:</div>${p.name ? `<div class="lg-pname">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('')) : ''),
  summary: (ctx) => {
    const { m } = ctx;
    if (!m.totals.length && !m.paymentLink && !m.summaryNotes.length) return '';
    const last = m.items?.columns[m.items.columns.length - 1]?.width || '18%';
    return block('cd-summary lg-summary', `${totalsHtml(m.totals)}<div class="cd-summary-side">${payButton(m)}${summaryNotes(m)}${closingInline(m)}</div>`, `style="--last:${last}"`);
  },
  css: () => `
.cd-t-ledger{--title-size:60px;font-size:11.5px;}
.cd-t-ledger .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:18px;}
.cd-t-ledger .cd-title{text-transform:uppercase;font-weight:900;letter-spacing:-.01em;line-height:.95;}
.cd-t-ledger .lg-brand{text-align:right;max-width:42%;}
.cd-t-ledger .cd-logo{margin:0 0 8px auto;max-height:50px;}
.cd-t-ledger .lg-name{font-family:var(--font-head);font-weight:900;font-size:24px;line-height:1.05;color:var(--accent-ink);text-transform:uppercase;}
.cd-t-ledger .lg-sub{display:flex;justify-content:space-between;gap:24px;text-transform:uppercase;font-size:10.5px;line-height:1.6;margin-bottom:20px;}
.cd-t-ledger .lg-contact{text-align:right;}
.cd-t-ledger .lg-parties{justify-content:space-between;margin-bottom:22px;}
.cd-t-ledger .lg-parties .cd-party:last-child:not(:first-child){text-align:right;}
.cd-t-ledger .lg-ph{font-weight:700;font-size:13px;margin-bottom:6px;}
.cd-t-ledger .lg-pname{text-transform:uppercase;}
.cd-t-ledger .cd-lines{color:var(--ink);font-size:11px;}
.cd-t-ledger .cd-items{margin-bottom:0;}
.cd-t-ledger .cd-table{border:1.5px solid var(--ink);}
.cd-t-ledger .cd-table th,.cd-t-ledger .cd-table td{border:1px solid var(--rule-strong);padding:7px 12px;}
.cd-t-ledger .cd-table th{border-bottom:1.5px solid var(--ink);color:var(--ink);font-size:10px;letter-spacing:.12em;padding:9px 12px;}
.cd-t-ledger .cd-table td{font-size:11px;letter-spacing:.02em;}
.cd-t-ledger .cd-row-filler td{height:30px;}
.cd-t-ledger .lg-summary{flex-direction:column;align-items:stretch;gap:12px;}
.cd-t-ledger .lg-summary .cd-summary-side{display:flex;align-items:center;justify-content:space-between;gap:20px;}
.cd-t-ledger .lg-summary .cd-pay{margin:0;}
.cd-t-ledger .lg-summary .cd-sum-closing{margin:0;}
.cd-t-ledger .cd-totals{flex:none;width:100%;}
.cd-t-ledger .cd-tot{padding:0;border:1.5px solid var(--ink);border-top:0;margin:0;font-size:11px;background:transparent;color:var(--ink);border-radius:0;}
.cd-t-ledger .cd-tot-label{flex:1 1 auto;text-align:right;padding:6px 12px;text-transform:uppercase;letter-spacing:.14em;color:var(--ink);border-right:1px solid var(--rule-strong);}
.cd-t-ledger .cd-tot-value{flex:0 0 var(--last,18%);padding:6px 12px;text-align:right;font-weight:700;}
.cd-t-ledger .cd-tot-grand{font-size:12px;font-weight:700;}
.cd-t-ledger .cd-tot-balance{font-size:12px;}
.cd-t-ledger .cd-pay-btn{background:var(--accent);border-radius:0;}
.cd-t-ledger .cd-h{color:var(--ink);font-family:var(--font-body);font-size:11px;letter-spacing:.04em;}
.cd-t-ledger .cd-prose{font-size:10.5px;}
.cd-t-ledger .cd-fact{background:transparent;border:1.5px solid var(--ink);border-radius:0;}
.cd-t-ledger .cd-fact-value{font-family:var(--font-body);color:var(--ink);}
.cd-t-ledger .cd-sig-img img{max-width:200px;}
`,
};

// ---------------------------------------------------------------------------
// 8. Serif Band (tinted header band, serif; id 'elegant' until the original Elegant design was restored)
// ---------------------------------------------------------------------------
const serifBand: ThemeDef = {
  id: 'serif_band',
  pad: { top: 52, x: 58, bottom: 72, footer: 32 },
  fromParty: true,
  header: ({ m }) => block('cd-hdr', `
    <div class="el-left">${titleH1(m)}${m.number ? `<div class="el-no">${m.numberLabel} : ${m.number}</div>` : ''}${m.keyDate ? `<div class="el-date">${m.keyDate.label} : ${m.keyDate.value}</div>` : ''}${statusBadge(m)}</div>
    <div class="el-right">${logoImg(m) || (m.company.initials ? `<div class="el-mono">${m.company.initials}</div>` : '')}<div class="el-name">${m.company.name}</div></div>`),
  chrome: () => '<div class="el-bar"></div>',
  css: () => `
.cd-t-serif_band{--title-size:54px;}
.cd-t-serif_band .cd-hdr{display:flex;justify-content:space-between;align-items:center;gap:24px;background:var(--accent-tint);margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 34px calc(-1 * var(--pl));padding:42px var(--px) 30px var(--pl);min-height:160px;}
.cd-t-serif_band .cd-title{text-transform:uppercase;font-weight:700;letter-spacing:.03em;}
.cd-t-serif_band .el-no{font-size:14px;font-weight:700;color:var(--accent-ink);margin-top:14px;letter-spacing:.04em;text-transform:uppercase;}
.cd-t-serif_band .el-date{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-ink);margin-top:4px;}
.cd-t-serif_band .el-right{text-align:center;max-width:40%;}
.cd-t-serif_band .cd-logo{margin:0 auto 6px;}
.cd-t-serif_band .el-mono{width:62px;height:62px;border-radius:50%;border:1.5px solid var(--accent-ink);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:22px;font-family:var(--font-head);margin:0 auto 6px;}
.cd-t-serif_band .el-name{font-family:var(--font-head);font-style:italic;font-size:22px;color:var(--accent-ink);line-height:1.2;}
.cd-t-serif_band .cd-label{color:var(--ink);font-size:10px;letter-spacing:.06em;}
.cd-t-serif_band .cd-party-name{font-size:12.5px;}
.cd-t-serif_band .cd-lines{color:var(--ink);font-weight:600;font-size:10.5px;}
.cd-t-serif_band .cd-parties{margin-bottom:28px;}
.cd-t-serif_band .cd-meta-row{border-bottom:0;padding:2px 0;}
.cd-t-serif_band .cd-table th{background:var(--accent);color:var(--on-accent);text-transform:none;letter-spacing:.02em;font-size:11px;font-weight:600;padding:11px 12px;}
.cd-t-serif_band .cd-table td{border-bottom:1px solid var(--ink);padding:12px;font-size:12px;}
.cd-t-serif_band .cd-table td:nth-child(even){background:var(--accent-soft);}
.cd-t-serif_band .cd-tot-label{color:var(--ink);font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:11px;text-align:right;flex:1;}
.cd-t-serif_band .cd-tot-value{font-weight:700;min-width:110px;text-align:right;}
.cd-t-serif_band .cd-tot-grand{background:var(--accent-tint);color:var(--accent-ink);border-radius:0;}
.cd-t-serif_band .cd-h{font-size:13px;text-transform:uppercase;letter-spacing:.08em;}
.cd-t-serif_band .el-bar{position:absolute;left:0;right:0;bottom:0;height:20px;background:var(--accent);}
`,
};

// ---------------------------------------------------------------------------
// 9. Bold Header (full-bleed color bands; id 'bold' until the original Bold design was restored)
// ---------------------------------------------------------------------------
const boldHeader: ThemeDef = {
  id: 'bold_header',
  pad: { top: 48, x: 56, bottom: 44, footer: 16 },
  header: ({ m }) => block('cd-hdr', `
    <div class="bd-left">${titleH1(m)}${m.number ? `<div class="bd-no">${m.numberLabel} ${m.number}</div>` : ''}${statusBadge(m)}</div>
    <div class="bd-co">${m.company.logoUrl ? `<div class="bd-logo">${logoImg(m)}</div>` : ''}<div class="bd-co-name">${m.company.name}</div>${lines(m.company.compactLines)}</div>`),
  parties: (ctx) => {
    const { m } = ctx;
    const [first, ...rest] = m.parties;
    const left = first ? `<div class="bd-client"><div class="bd-to">${first.label} :</div>${first.name ? `<div class="bd-client-name">${first.name}</div>` : ''}${lines(first.lines)}</div>` : '<div class="bd-client"></div>';
    const right = `<div class="bd-meta">${m.meta.map((i) => `<div><span class="bd-ml">${i.label} :</span> ${i.value}</div>`).join('')}${rest.map((p) => `<div class="bd-extra"><div class="bd-to">${p.label} :</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('')}</div>`;
    return block('cd-parties bd-parties', left + right);
  },
  compose: (ctx, p) => {
    const { m } = ctx;
    const side = `<div class="bd-sum-side"><div class="bd-sum-h">${m.paymentLink ? 'Payment info' : m.keyDate ? m.keyDate.label : 'Contact'}</div>${payButton(m)}${summaryNotes(m)}${!m.paymentLink && m.keyDate ? `<div class="bd-sum-big">${m.keyDate.value}</div>` : ''}${!m.paymentLink && !m.keyDate ? lines(m.company.lines) : ''}${closingInline(m)}</div>`;
    const band = `<section class="cd-block cd-pin bd-band${m.totals.length ? '' : ' bd-band-slim'}"${m.totals.length || m.paymentLink ? '' : ' data-optional="1"'}>${side}${totalsHtml(m.totals)}</section>`;
    return [...defaultCompose(without(p, 'summary')), band];
  },
  css: () => `
.cd-t-bold_header{--title-size:50px;}
.cd-t-bold_header .cd-hdr{display:flex;justify-content:space-between;align-items:center;gap:24px;background:var(--accent);color:var(--on-accent);margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 30px calc(-1 * var(--pl));padding:34px var(--px) 30px var(--pl);min-height:140px;}
.cd-t-bold_header .cd-title{color:var(--on-accent);text-transform:uppercase;font-weight:800;letter-spacing:.01em;}
.cd-t-bold_header .bd-no{font-size:12px;margin-top:10px;opacity:.9;}
.cd-t-bold_header .cd-status{color:var(--on-accent);}
.cd-t-bold_header .bd-co{text-align:right;max-width:48%;}
.cd-t-bold_header .bd-logo{display:block;width:max-content;margin-left:auto;background:#fff;border-radius:6px;padding:6px;margin-bottom:8px;}
.cd-t-bold_header .bd-logo .cd-logo{max-height:38px;}
.cd-t-bold_header .bd-co-name{font-weight:800;font-size:15px;}
.cd-t-bold_header .bd-co .cd-lines{color:var(--on-accent);opacity:.88;font-size:11.5px;}
.cd-t-bold_header .bd-parties{justify-content:space-between;margin-bottom:22px;}
.cd-t-bold_header .bd-client{flex:1 1 0;min-width:0;color:var(--accent-ink);}
.cd-t-bold_header .bd-to{font-size:13px;font-weight:700;color:var(--accent-ink);}
.cd-t-bold_header .bd-client-name{font-size:22px;font-weight:800;line-height:1.2;margin:2px 0 4px;}
.cd-t-bold_header .bd-client .cd-lines{color:var(--accent-ink);font-size:13px;}
.cd-t-bold_header .bd-meta{flex:0 1 auto;min-width:0;max-width:52%;color:var(--accent-ink);font-size:12.5px;line-height:1.7;padding-top:12px;}
.cd-t-bold_header .bd-ml{font-weight:700;}
.cd-t-bold_header .bd-extra{margin-top:10px;line-height:1.5;}
.cd-t-bold_header .cd-table th{background:var(--accent);color:var(--on-accent);font-size:13px;text-transform:none;letter-spacing:0;padding:10px 12px;}
.cd-t-bold_header .cd-table td{border-bottom:1px solid var(--accent-line);padding:10px 12px;font-weight:600;color:var(--accent-ink);}
.cd-t-bold_header .cd-item-name{font-weight:700;}
.cd-t-bold_header .bd-band{display:flex;justify-content:space-between;gap:32px;background:var(--accent);color:var(--on-accent);margin:18px calc(-1 * var(--px)) calc(-1 * var(--pb)) calc(-1 * var(--pl));padding:24px var(--px) calc(var(--pb) + 14px) var(--pl);}
.cd-t-bold_header .bd-sum-side{flex:1 1 auto;min-width:0;}
.cd-t-bold_header .bd-band-slim{padding-top:16px;}
.cd-t-bold_header .bd-band-slim .bd-sum-h{font-size:12px;margin-bottom:4px;opacity:.85;}
.cd-t-bold_header .bd-band-slim .bd-sum-big{font-size:18px;}
.cd-t-bold_header .bd-sum-h{font-size:15px;font-weight:700;margin-bottom:10px;}
.cd-t-bold_header .bd-sum-big{font-size:22px;font-weight:800;}
.cd-t-bold_header .bd-band .cd-label{color:var(--on-accent);opacity:.8;}
.cd-t-bold_header .bd-band .cd-lines,.cd-t-bold_header .bd-band .cd-mini td{color:var(--on-accent);}
.cd-t-bold_header .bd-band .cd-pay-btn{background:var(--on-accent);color:var(--accent);}
.cd-t-bold_header .bd-band .cd-pay-url{color:var(--on-accent);opacity:.8;}
.cd-t-bold_header .bd-band .cd-tot-label{color:var(--on-accent);font-weight:700;}
.cd-t-bold_header .bd-band .cd-sum-closing{color:var(--on-accent);margin-top:14px;}
.cd-t-bold_header .bd-band .cd-tot-grand{background:var(--on-accent);color:var(--accent);border-radius:0;}
.cd-t-bold_header .bd-band .cd-tot-grand .cd-tot-label{color:var(--accent);}
.cd-t-bold_header .bd-band .cd-tot-balance{border-color:var(--on-accent);}
.cd-t-bold_header .bd-band .cd-tot-balance .cd-tot-label{color:var(--on-accent);}
.cd-t-bold_header .cd-last .cd-footer,.cd-t-bold_header.cd-root .cd-page.cd-last .cd-footer{color:var(--on-accent);}
.cd-t-bold_header .cd-h{font-size:12px;}
`,
};

// ---------------------------------------------------------------------------
// 10. Friendly Rounded (soft frame, floral accents)
// ---------------------------------------------------------------------------
const flower = (color: string, size: number, petals = 10) => {
  const r = size / 2;
  const ps = Array.from({ length: petals }, (_, i) => `<ellipse cx="${r}" cy="${r * 0.48}" rx="${r * 0.17}" ry="${r * 0.46}" fill="${color}" transform="rotate(${(360 / petals) * i} ${r} ${r})"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${ps}<circle cx="${r}" cy="${r}" r="${r * 0.14}" fill="#ffffff"/></svg>`;
};

const friendly: ThemeDef = {
  id: 'friendly',
  pad: { top: 56, x: 66, bottom: 72, footer: 46 },
  ink: '#2f3a28',
  header: ({ m }) => {
    const rows: string[] = [];
    for (const p of m.parties) rows.push(`<div class="fr-k">${p.label}</div><div class="fr-v"><strong>${p.name}</strong>${p.lines.length ? `<br>${p.lines.join('<br>')}` : ''}</div>`);
    for (const i of m.meta) rows.push(`<div class="fr-k">${i.label}</div><div class="fr-v">${i.value}</div>`);
    return block('cd-hdr', `<div class="fr-brand">${logoImg(m)}<div class="fr-name">${m.company.name}</div>${m.company.tagline ? `<span class="fr-pill">${m.company.tagline}</span>` : ''}${lines(m.company.compactLines)}</div>${rows.length ? `<div class="fr-grid">${rows.join('')}</div>` : ''}`)
      + block('fr-band', `<div class="fr-band-text">${m.title}${m.number ? ` No. ${m.number}` : ''}</div>${statusBadge(m)}`);
  },
  parties: () => '',
  chrome: ({ c }) => `<div class="fr-frame"></div><div class="cd-first-only fr-flowers">${flower(c.secondary, 46)}${flower(c.secondary, 46)}${flower(c.secondary, 46)}</div><div class="fr-flower-bottom">${flower(c.secondary, 26, 12)}</div>`,
  css: ({ c }) => `
.cd-t-friendly{--fr:${mix(c.accent, c.paper, 0.55)};font-size:12px;}
.cd-t-friendly .fr-frame{position:absolute;left:0;top:0;right:0;bottom:0;border:12px solid var(--fr);}
.cd-t-friendly .fr-flowers{position:absolute;right:58px;top:36px;}
.cd-t-friendly .fr-flowers svg{display:inline-block;margin-left:12px;}
.cd-t-friendly .fr-flower-bottom{position:absolute;left:50%;bottom:16px;margin-left:-13px;}
.cd-t-friendly .cd-hdr{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;margin-bottom:12px;}
.cd-t-friendly .fr-brand{flex:1 1 0;min-width:0;padding-right:120px;}
.cd-t-friendly .cd-logo{margin-bottom:8px;max-height:48px;}
.cd-t-friendly .fr-name{font-family:var(--font-head);font-weight:800;font-size:26px;line-height:1.05;color:var(--accent-ink);letter-spacing:-.01em;}
.cd-t-friendly .fr-pill{display:inline-block;background:var(--secondary-soft);color:var(--ink);border-radius:6px;padding:2px 10px;font-size:10.5px;margin:6px 0 4px;}
.cd-t-friendly .cd-lines{color:var(--ink);font-size:11.5px;}
.cd-t-friendly .fr-grid{flex:0 1 46%;display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);min-width:0;gap:3px 18px;font-size:11.5px;}
.cd-t-friendly .fr-k{text-transform:uppercase;letter-spacing:.06em;font-size:10px;color:var(--muted);padding-top:1px;max-width:120px;overflow-wrap:anywhere;}
.cd-t-friendly .fr-v{overflow-wrap:anywhere;}
.cd-t-friendly .fr-band{display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:3px solid var(--fr);border-bottom:3px solid var(--fr);margin:6px calc(12px - var(--px)) 20px calc(12px - var(--pl));padding:9px calc(var(--px) - 12px) 9px calc(var(--pl) - 12px);}
.cd-t-friendly .fr-band-text{font-family:var(--font-head);font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:.02em;color:var(--accent-ink);}
.cd-t-friendly .fr-band .cd-status{margin-top:0;}
.cd-t-friendly .cd-table th{font-size:12px;text-transform:none;letter-spacing:0;color:var(--accent-ink);font-weight:800;padding:0 10px 10px;}
.cd-t-friendly .cd-table td{border-bottom:0;padding:7px 10px;color:var(--ink);font-weight:400;}
.cd-t-friendly .cd-summary{align-items:center;margin-top:8px;}
.cd-t-friendly .cd-totals{flex:0 0 290px;border:3px solid var(--fr);padding:10px 20px;}
.cd-t-friendly .cd-tot{font-weight:800;color:var(--ink);}
.cd-t-friendly .cd-tot-label{color:var(--ink);}
.cd-t-friendly .cd-tot-grand{background:none;color:var(--accent-ink);padding:6px 2px;margin-top:2px;font-size:14px;}
.cd-t-friendly .cd-pay-btn{border-radius:999px;}
.cd-t-friendly .cd-h{font-size:13px;text-transform:none;letter-spacing:0;color:var(--accent-ink);}
.cd-t-friendly .cd-fact{border-radius:14px;}
.cd-t-friendly .cd-tag{background:var(--secondary-soft);color:var(--ink);}
`,
};

// ---------------------------------------------------------------------------
// 11. Boutique (muted rose serif, boxed cells)
// ---------------------------------------------------------------------------
const boutique: ThemeDef = {
  id: 'boutique',
  pad: { top: 54, x: 58, bottom: 66 },
  header: ({ m }) => block('cd-hdr', `
    <div class="bq-left">${titleH1(m)}${m.number ? `<div class="bq-no">No. ${m.number}</div>` : ''}${statusBadge(m)}</div>
    <div class="bq-right"><div class="bq-brand">${m.company.logoUrl ? logoImg(m) : '<span class="bq-circle"></span>'}<span class="bq-name">${m.company.name}</span></div>${lines(m.company.compactLines)}</div>`),
  parties: ({ m }) => block('cd-parties bq-parties', `<div class="bq-who">${m.parties.map((p) => `<div class="bq-party"><div class="cd-label">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('')}</div><div class="bq-meta">${m.meta.map((i) => `<div>${i.label} : ${i.value}</div>`).join('')}</div>`),
  summary: ({ m }) => {
    if (!m.totals.length && !m.paymentLink && !m.summaryNotes.length) return '';
    const side = `${m.keyDate ? `<div class="bq-sidekv"><strong>${m.keyDate.label} :</strong><br>${m.keyDate.value}</div>` : ''}${payButton(m)}${summaryNotes(m)}${closingInline(m)}`;
    return block('cd-summary', `<div class="cd-summary-side">${side}</div>${totalsHtml(m.totals)}`);
  },
  css: () => `
.cd-t-boutique{--title-size:38px;}
.cd-t-boutique .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:26px;}
.cd-t-boutique .cd-title{text-transform:uppercase;letter-spacing:.02em;font-weight:700;}
.cd-t-boutique .bq-no{font-family:var(--font-head);font-size:18px;color:var(--accent-ink);margin-top:6px;}
.cd-t-boutique .bq-right{text-align:right;max-width:46%;}
.cd-t-boutique .bq-brand{display:inline-flex;align-items:center;position:relative;margin-bottom:14px;}
.cd-t-boutique .bq-circle{width:34px;height:34px;border-radius:50%;background:var(--accent);opacity:.75;margin-right:-14px;}
.cd-t-boutique .bq-name{position:relative;font-family:var(--font-head);font-weight:700;font-size:15px;}
.cd-t-boutique .cd-logo{margin-right:10px;max-height:52px;}
.cd-t-boutique .bq-right .cd-lines{color:var(--ink);font-size:11.5px;}
.cd-t-boutique .bq-parties{justify-content:space-between;padding-bottom:16px;border-bottom:1px solid var(--ink);margin-bottom:24px;}
.cd-t-boutique .bq-who{flex:1 1 0;min-width:0;}
.cd-t-boutique .bq-party+.bq-party{margin-top:12px;}
.cd-t-boutique .bq-party .cd-party-name{font-family:var(--font-head);font-size:12.5px;}
.cd-t-boutique .bq-party .cd-lines{color:var(--ink);font-weight:600;}
.cd-t-boutique .bq-meta{text-align:right;color:var(--accent-ink);font-size:12px;line-height:1.7;max-width:50%;}
.cd-t-boutique .cd-table{border-collapse:separate;border-spacing:5px;margin:0 -5px;width:calc(100% + 10px);}
.cd-t-boutique .cd-table th{background:var(--accent);color:var(--on-accent);font-family:var(--font-head);text-transform:none;letter-spacing:0;font-size:12px;text-align:center;padding:11px 10px;}
.cd-t-boutique .cd-table td{border:1.5px solid var(--accent-line);padding:9px 12px;}
.cd-t-boutique .cd-summary{margin-top:8px;}
.cd-t-boutique .cd-totals{flex-basis:270px;}
.cd-t-boutique .cd-tot{padding:4px 14px;}
.cd-t-boutique .cd-tot-grand,.cd-t-boutique .cd-tot-balance{background:var(--accent);color:var(--on-accent);border-radius:0;border:0;margin-top:8px;padding:7px 14px;font-size:13px;font-weight:700;}
.cd-t-boutique .cd-tot-balance .cd-tot-label{color:var(--on-accent);}
.cd-t-boutique .bq-sidekv{font-size:12px;margin-bottom:12px;}
.cd-t-boutique .cd-h{text-transform:none;letter-spacing:0;font-size:13px;}
.cd-t-boutique .cd-pay-btn{border-radius:0;}
`,
};

// ---------------------------------------------------------------------------
// 12. Construction (navy + safety yellow, angled stripes)
// ---------------------------------------------------------------------------
const stripeSvg = (accent: string, secondary: string, width: number, height: number) => {
  const w = width;
  const h = height;
  const cut = Math.round(w * 0.6);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,0 ${cut + 22},0 ${cut},${h} 0,${h}" fill="${secondary}"/>
    <polygon points="${cut + 30},0 ${cut + 46},0 ${cut + 24},${h} ${cut + 8},${h}" fill="${accent}"/>
    <polygon points="${cut + 54},0 ${cut + 70},0 ${cut + 48},${h} ${cut + 32},${h}" fill="${accent}"/>
    <polygon points="${cut + 78},0 ${cut + 100},0 ${cut + 78},${h} ${cut + 56},${h}" fill="${secondary}"/></svg>`;
};

const construction: ThemeDef = {
  id: 'construction',
  pad: { top: 48, x: 56, bottom: 70, footer: 38 },
  header: (ctx) => {
    const { m, c, page } = ctx;
    const [first] = m.parties;
    const metaRows = [m.number ? { label: m.numberLabel, value: m.number } : null, ...m.meta.slice(0, 3)].filter(Boolean) as Array<{ label: string; value: string }>;
    const addr = m.company.addressLines.join(', ');
    return block('cd-hdr', `
      <div class="cx-band">
        <div class="cx-left">${m.company.logoUrl ? `<div class="cx-logo">${logoImg(m)}</div>` : monogram(m, 'cx-mono')}<div class="cx-name">${m.company.name}</div>
          ${first ? `<div class="cx-to-label">${first.label}:</div>${first.name ? `<div class="cx-to-name">${first.name}</div>` : ''}${lines(first.lines, 'cx-to-lines')}` : ''}</div>
        <div class="cx-right">${titleH1(m)}<div class="cx-meta">${metaRows.map((r) => `<div class="cx-mrow"><span>${r.label}:</span><span>${r.value}</span></div>`).join('')}</div>${statusBadge(m)}</div>
      </div>
      <div class="cx-stripe">${stripeSvg(c.accent, c.secondary, page.width, 40)}${addr ? `<div class="cx-stripe-text"><span class="cx-pin">●</span>${addr}</div>` : ''}</div>`);
  },
  parties: (ctx) => {
    const { m } = ctx;
    const contact = [
      m.company.phone ? `<div class="cx-k">Phone:</div><div>${m.company.phone}</div>` : '',
      m.company.email ? `<div class="cx-k">Email:</div><div>${m.company.email}</div>` : '',
      m.company.website ? `<div class="cx-k">Web:</div><div>${m.company.website}</div>` : '',
    ].join('');
    const rest = m.parties.slice(1);
    const extraMeta = m.meta.slice(3);
    const right = [
      ...rest.map((p) => `<div class="cx-sec"><div class="cx-h">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      extraMeta.length ? `<div class="cx-sec"><div class="cx-h">Details</div><div class="cx-grid">${extraMeta.map((i) => `<div class="cx-k">${i.label}:</div><div>${i.value}</div>`).join('')}</div></div>` : '',
    ].join('');
    if (!contact && !right) return '';
    return block('cd-parties cx-parties', `<div class="cx-sec">${contact ? `<div class="cx-grid">${contact}</div>` : ''}</div><div class="cx-right-col">${right}</div>`);
  },
  chrome: ({ c, page }) => `<div class="cx-top cd-cont-only"></div><div class="cx-bottom">${stripeSvg(c.accent, c.secondary, page.width, 28)}</div>`,
  css: () => `
.cd-t-construction{--title-size:42px;}
.cd-t-construction .cd-hdr{margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 20px calc(-1 * var(--pl));}
.cd-t-construction .cx-band{display:flex;justify-content:space-between;gap:24px;background:var(--accent);color:var(--on-accent);padding:34px var(--px) 24px var(--pl);}
.cd-t-construction .cx-left{min-width:0;flex:1 1 auto;}
.cd-t-construction .cx-logo{display:block;width:max-content;background:#fff;border-radius:6px;padding:6px;margin-bottom:8px;}
.cd-t-construction .cx-logo .cd-logo{max-height:40px;max-width:140px;}
.cd-t-construction .cx-mono{width:52px;height:52px;border-radius:8px;background:var(--secondary);color:var(--on-secondary);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;margin-bottom:8px;}
.cd-t-construction .cx-name{font-weight:700;font-size:17px;margin-bottom:10px;}
.cd-t-construction .cx-to-label{font-size:10.5px;opacity:.85;}
.cd-t-construction .cx-to-name{font-weight:700;font-size:14px;}
.cd-t-construction .cx-to-lines{font-size:11px;opacity:.85;line-height:1.5;}
.cd-t-construction .cx-right{text-align:right;flex:none;max-width:52%;}
.cd-t-construction .cd-title{color:var(--secondary);text-transform:uppercase;font-weight:800;letter-spacing:.01em;}
.cd-t-construction .cx-meta{margin-top:12px;font-size:12px;line-height:1.7;display:inline-block;text-align:left;}
.cd-t-construction .cx-mrow{display:flex;justify-content:space-between;gap:24px;}
.cd-t-construction .cx-mrow span:last-child{font-weight:600;}
.cd-t-construction .cd-status{color:var(--secondary);display:block;width:max-content;margin-left:auto;}
.cd-t-construction .cx-stripe{position:relative;height:40px;}
.cd-t-construction .cx-stripe svg{display:block;width:100%;height:40px;}
.cd-t-construction .cx-stripe-text{position:absolute;left:var(--pl);top:0;height:40px;display:flex;align-items:center;gap:10px;font-weight:600;font-size:12.5px;color:var(--on-secondary);max-width:52%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cd-t-construction .cx-pin{display:inline-flex;width:20px;height:20px;border-radius:50%;background:var(--accent);color:var(--secondary);font-size:9px;align-items:center;justify-content:center;flex:none;}
.cd-t-construction .cx-parties{justify-content:space-between;margin-bottom:20px;}
.cd-t-construction .cx-sec{flex:1 1 0;min-width:0;}
.cd-t-construction .cx-right-col{flex:1 1 0;min-width:0;}
.cd-t-construction .cx-right-col .cx-sec+.cx-sec{margin-top:12px;}
.cd-t-construction .cx-grid{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 18px;font-size:12px;}
.cd-t-construction .cx-grid>div{overflow-wrap:anywhere;min-width:0;}
.cd-t-construction .cx-k{font-weight:600;}
.cd-t-construction .cx-h{font-weight:700;font-size:12.5px;text-transform:uppercase;margin-bottom:6px;}
.cd-t-construction .cd-table th{background:var(--accent);color:var(--on-accent);font-size:11.5px;letter-spacing:.04em;padding:10px 14px;}
.cd-t-construction .cd-table td{border-bottom:1px solid var(--accent-line);padding:8px 14px;}
.cd-t-construction .cd-tot-label{color:var(--ink);font-weight:700;}
.cd-t-construction .cd-tot-grand{border-radius:0;padding:11px 14px;}
.cd-t-construction .cd-tot-grand .cd-tot-label{color:var(--on-accent);}
.cd-t-construction .cd-h{color:var(--ink);font-size:12px;letter-spacing:.04em;}
.cd-t-construction .cd-sig{text-align:center;}
.cd-t-construction .cd-sig-img{justify-content:center;}
.cd-t-construction .cx-top{position:absolute;left:0;right:0;top:0;height:8px;background:var(--secondary);}
.cd-t-construction .cx-bottom{position:absolute;left:0;right:0;bottom:0;height:28px;}
.cd-t-construction .cx-bottom svg{display:block;width:100%;height:28px;}
.cd-t-construction .cd-fact{border-left:4px solid var(--secondary);border-radius:0;}
`,
};

// ---------------------------------------------------------------------------
// 13. Coastal Serif (cream paper, peach footer band)
// ---------------------------------------------------------------------------
const coastal: ThemeDef = {
  id: 'coastal',
  pad: { top: 50, x: 60, bottom: 170, footer: 0 },
  ink: '#1e2a2a',
  sectionsGrid: true,
  header: ({ m }) => block('cd-hdr', `<div class="cs-left"><h1 class="cd-title cd-len-${m.title.length + (m.number ? m.number.length + 2 : 0) <= 14 ? 's' : m.title.length + m.number.length <= 22 ? 'm' : 'l'}">${m.title}${m.number ? ` #${m.number}` : ''}</h1>${statusBadge(m)}</div><div class="cs-right">${logoImg(m) || (m.company.initials ? `<div class="cs-mono">${m.company.initials}</div>` : '')}</div>`),
  parties: ({ m }) => {
    const cols = [
      ...m.parties.map((p) => `<div class="cd-party"><div class="cs-h">${p.label}</div>${p.name ? `<div class="cs-pname">${p.name}</div>` : ''}${lines(p.lines)}</div>`),
      m.meta.length ? `<div class="cd-party"><div class="cs-h">Details</div><div class="cs-meta">${m.meta.map((i) => `<div><span>${i.label} :</span> ${i.value}</div>`).join('')}</div></div>` : '',
    ].join('');
    return cols ? block('cd-parties cs-parties', cols) : '';
  },
  summary: ({ m }) => {
    if (!m.totals.length && !m.paymentLink && !m.summaryNotes.length) return '';
    const grand = m.totals.find((t) => t.kind === 'grand');
    const balance = m.totals.find((t) => t.kind === 'balance');
    const small = m.totals.filter((t) => t !== grand && t !== balance);
    const big = balance || grand;
    return block('cd-summary cs-summary', `<div class="cd-summary-side">${small.length ? `<div class="cs-small">${small.map((t) => `<div class="cs-srow"><span>${t.label} :</span><span class="cd-num">${t.value}</span></div>`).join('')}</div>` : ''}${payButton(m)}${summaryNotes(m)}</div>${big ? `<div class="cs-big"><span class="cs-big-label">${big.label} :</span> <span class="cd-num">${big.value}</span></div>` : ''}`);
  },
  footer: ({ m }) => `<div class="cd-footer cs-footer"><div class="cs-f-left"><div>${m.company.email || m.company.phone ? `Questions about this ${m.title.toLowerCase()}? Contact us at ${m.company.email || m.company.phone}.` : ''}</div>${m.closing ? `<div class="cs-thanks">${m.closing}</div>` : ''}<div class="cd-pageno"></div></div><div class="cs-f-right"><div class="cs-f-name">${m.company.name}</div>${lines([...m.company.addressLines, m.company.phone, m.company.website].filter(Boolean))}</div></div>`,
  compose: (_ctx, p) => defaultCompose(without(p, 'closing')),
  chrome: () => '<div class="cs-band"></div>',
  css: ({ c }) => `
.cd-t-coastal{--title-size:46px;--cs-rule:${mix(c.secondary, c.accent, 0.25)};}
.cd-t-coastal .cs-band{position:absolute;left:0;right:0;bottom:0;height:140px;background:var(--secondary);}
.cd-t-coastal .cd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:26px;}
.cd-t-coastal .cd-title{font-weight:400;letter-spacing:-.01em;line-height:1.05;}
.cd-t-coastal .cs-right{flex:none;}
.cd-t-coastal .cd-logo{max-height:70px;}
.cd-t-coastal .cs-mono{width:62px;height:62px;border-radius:50%;border:2px solid var(--accent-ink);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-size:24px;}
.cd-t-coastal .cs-parties{margin-bottom:26px;}
.cd-t-coastal .cs-h{font-family:var(--font-head);font-size:15px;text-transform:uppercase;letter-spacing:.02em;margin-bottom:8px;color:var(--ink);}
.cd-t-coastal .cs-pname{font-size:12px;font-weight:500;}
.cd-t-coastal .cd-lines{color:var(--ink);font-size:11.5px;line-height:1.65;}
.cd-t-coastal .cs-meta{font-size:12px;line-height:1.75;}
.cd-t-coastal .cs-meta span{font-weight:600;}
.cd-t-coastal .cd-table th{background:var(--secondary);color:var(--accent-ink);font-family:var(--font-head);font-weight:400;font-size:13.5px;letter-spacing:.02em;padding:10px 12px;}
.cd-t-coastal .cd-table th.cd-col-last{background:var(--accent);color:var(--on-accent);text-align:center;}
.cd-t-coastal .cd-table td{border-bottom:1.5px solid var(--cs-rule);padding:9px 12px;font-size:12px;}
.cd-t-coastal .cd-table td.cd-col-last{text-align:center;}
.cd-t-coastal .cs-summary{align-items:center;}
.cd-t-coastal .cs-small{font-size:11.5px;text-transform:uppercase;max-width:260px;margin-bottom:10px;}
.cd-t-coastal .cs-srow{display:flex;justify-content:space-between;gap:20px;padding:2px 0;}
.cd-t-coastal .cs-big{font-family:var(--font-head);font-size:30px;color:var(--accent-ink);text-transform:uppercase;white-space:nowrap;}
.cd-t-coastal .cs-big-label{letter-spacing:.01em;}
.cd-t-coastal .cd-h{font-size:14px;font-weight:400;letter-spacing:.02em;}
.cd-t-coastal .cd-fact{background:rgba(255,255,255,.45);}
.cd-t-coastal .cs-footer{left:var(--pl);right:var(--px);bottom:0;height:140px;align-items:center;color:var(--accent-ink);font-size:11.5px;line-height:1.6;}
.cd-t-coastal .cs-f-left{max-width:52%;}
.cd-t-coastal .cs-thanks{font-family:var(--font-head);font-size:16px;margin-top:8px;}
.cd-t-coastal .cs-f-left .cd-pageno{font-size:9.5px;margin-top:6px;opacity:.8;}
.cd-t-coastal .cs-f-right{text-align:right;}
.cd-t-coastal .cs-f-name{font-family:var(--font-head);font-size:21px;margin-bottom:2px;}
.cd-t-coastal .cs-f-right .cd-lines{color:var(--accent-ink);font-size:11.5px;}
`,
};

const CORE_THEMES: ThemeDef[] = [
  classic, modern, corporate, spectrum, statement, executive, ledger, serifBand, boldHeader, friendly, boutique, construction, coastal,
];

/** Every theme by template id (Featured designs + design modules). Unregistered ids resolve before lookup. */
export const THEMES = Object.fromEntries(
  [...CORE_THEMES, ...DESIGN_LIST.map((d) => d.theme)].map((t) => [t.id, t]),
) as Record<TemplateId, ThemeDef>;

export { footerHtml, metaList, defaultParties };
