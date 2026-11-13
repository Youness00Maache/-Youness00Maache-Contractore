/**
 * The 10 original "Standard" designs (pre-2026-11 jsPDF designs), restored under their original ids.
 *
 * The originals came in two layouts (old services/pdfGenerator.ts, TemplateStyle table + drawDocumentHeader):
 *  - certificate (standard, professional, elegant, warm, retro): a thin double border frame on every page,
 *    centered logo and title in the header font, a grey "No. | date" line, From/To columns, a striped table
 *    whose header row is filled with the primary color, right-aligned totals with the total in the primary color.
 *  - modern (modern_blue, tech, industrial, minimal, bold): a full-bleed header band with the logo on the left
 *    and the title + number/date on the right, a thin bar on continuation pages, then the same body.
 * Each design keeps its original palette and fonts (Times → Tinos, Courier → Courier Prime, Helvetica) with
 * cleaner typography, spacing, tables and totals. Every color that the original took from the user's primary
 * color comes from the palette (var(--accent) …), so user colors keep working.
 */
import type { DesignDef, RenderCtx, ThemeDef } from '../blocks.ts';
import { block, lines, logoImg, metaList, partyBlocks, statusBadge, titleH1 } from '../blocks.ts';
import { contrastRatio, ensureContrast, mix, readableOn } from '../colors.ts';
import type { FontKey, TemplateId, TemplateMeta } from '../registry.ts';

type Layout = 'certificate' | 'modern';

interface Spec {
  id: TemplateId;
  name: string;
  description: string;
  tags: string[];
  layout: Layout;
  /** original primaryColor (→ meta.accent) */
  primary: string;
  /** meta.secondary */
  secondary: string;
  /** original textColor (body ink) */
  text: string;
  /** original borderColor (frame / hairlines) */
  border: string;
  /** original alternateRowColor (zebra rows) */
  zebra: string;
  /** soft tint of the original headerColor (header panels, fact cards) */
  tint: string;
  head: FontKey;
  body: FontKey;
  /** original borderRadius in px */
  radius: number;
  /** original showFooterLine */
  footerLine: boolean;
  /** design-specific rules, appended after the shared layout CSS */
  extra?: (v: Vars, ctx: RenderCtx) => string;
}

interface Vars {
  T: string;
  frame: string;
  hair: string;
  zebra: string;
  tint: string;
  headBg: string;
  headInk: string;
  bandBg: string;
  bandInk: string;
  bandTitle: string;
  /** text on var(--accent) fills (pay button) */
  payInk: string;
  r: number;
}

/** White text on a fill when it is readable (≥ 3:1, large/bold text), otherwise the best of white/near-black. */
const inkOn = (bg: string) => (contrastRatio('#ffffff', bg) >= 3 ? '#ffffff' : readableOn(bg));

const vars = (spec: Spec, ctx: RenderCtx): Vars => {
  const { c } = ctx;
  const custom = c.custom;
  const frame = custom ? c.accentLine : spec.border;
  const hair = custom ? c.accentTint : mix(spec.border, c.paper, spec.border === '#000000' ? 0.72 : 0.35);
  const headBg = spec.id === 'industrial' ? c.secondary : c.accent;
  const headInk = spec.id === 'industrial'
    ? (contrastRatio(c.accent, headBg) >= 3 ? c.accent : inkOn(headBg))
    : inkOn(headBg);
  let bandBg = c.accent;
  if (spec.id === 'industrial') bandBg = c.secondary;
  if (spec.id === 'minimal') bandBg = mix(c.accent, c.paper, 0.86);
  const bandInk = spec.id === 'minimal' ? c.ink : inkOn(bandBg);
  let bandTitle = bandInk;
  if (spec.id === 'industrial' && contrastRatio(c.accent, bandBg) >= 3) bandTitle = c.accent;
  if (spec.id === 'minimal') bandTitle = ensureContrast(c.accent, bandBg, 4.5);
  return {
    T: `.cd-t-${spec.id}`,
    frame,
    hair,
    zebra: custom ? c.accentSoft : spec.zebra,
    tint: custom ? c.accentSoft : spec.tint,
    headBg,
    headInk,
    bandBg,
    bandInk,
    bandTitle,
    payInk: inkOn(c.accent),
    r: spec.radius,
  };
};

// ---------------------------------------------------------------------------
// shared markup
// ---------------------------------------------------------------------------

/** "Invoice No. INV-1 | Due by Dec 5, 2026" (the original grey id/date line). */
const subLine = ({ m }: RenderCtx, sep = '|') => {
  const bits = [
    m.number ? `<span class="sd-no"><span class="sd-k">${m.numberLabel}</span> <strong>${m.number}</strong></span>` : '',
    m.keyDate ? `<span class="sd-date"><span class="sd-k">${m.keyDate.label}:</span> ${m.keyDate.value}</span>` : '',
  ].filter(Boolean);
  return bits.length ? `<div class="sd-sub">${bits.join(`<span class="sd-sep">${sep}</span>`)}</div>` : '';
};

/** From (company + tagline) · every party · Details (meta). */
const partiesRow = ({ m }: RenderCtx) => {
  const from = m.company.name || m.company.lines.length
    ? `<div class="cd-party cd-party-from"><div class="cd-label">From</div>${m.company.name ? `<div class="cd-party-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="sd-tagline">${m.company.tagline}</div>` : ''}${lines(m.company.compactLines)}</div>`
    : '';
  const details = m.meta.length ? `<div class="cd-party cd-party-meta"><div class="cd-label">Details</div>${metaList(m)}</div>` : '';
  const cols = from + partyBlocks(m) + details;
  const count = (from ? 1 : 0) + m.parties.length + (details ? 1 : 0);
  return cols ? block(`cd-parties sd-parties${count >= 4 ? ' sd-cols4' : ''}`, cols) : '';
};

const diamond = (color: string) =>
  `<svg width="120" height="12" viewBox="0 0 120 12" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="6" x2="50" y2="6" stroke="${color}" stroke-width="1"/><polygon points="60,1 65,6 60,11 55,6" fill="${color}"/><line x1="70" y1="6" x2="120" y2="6" stroke="${color}" stroke-width="1"/></svg>`;

const certificateHeader = (spec: Spec) => (ctx: RenderCtx) => {
  const { m, c } = ctx;
  const orn = spec.id === 'elegant' ? `<div class="sd-orn">${diamond(c.custom ? c.accentLine : spec.border)}</div>` : '';
  return block('cd-hdr sd-cert-hdr', `${logoImg(m)}<div class="sd-titlewrap">${titleH1(m)}${subLine(ctx)}</div>${orn}${statusBadge(m)}`);
};

const modernHeader = (ctx: RenderCtx) => {
  const { m } = ctx;
  const brand = m.company.logoUrl
    ? `<div class="sd-plate">${logoImg(m)}</div>`
    : (m.company.name ? `<div class="sd-wordmark">${m.company.name}</div>` : '');
  return block('cd-hdr sd-band-hdr', `<div class="sd-band"><div class="sd-band-brand">${brand}</div><div class="sd-band-doc">${titleH1(m)}${subLine(ctx, '·')}${statusBadge(m)}</div></div>`);
};

// ---------------------------------------------------------------------------
// shared CSS
// ---------------------------------------------------------------------------
const bodyCss = (spec: Spec, v: Vars) => {
  const { T, r } = v;
  return `
${T} .sd-sub{font-size:11.5px;color:var(--muted);letter-spacing:.02em;line-height:1.5;}
${T} .sd-sub strong{color:var(--ink);font-weight:700;}
${T} .sd-sep{display:inline-block;margin:0 10px;opacity:.55;}
${T} .sd-tagline{font-size:10.5px;font-style:italic;color:var(--muted);margin:-1px 0 3px;}
${T} .sd-parties{gap:26px;margin-bottom:24px;}
${T} .cd-label{font-family:var(--font-head);color:var(--ink);font-size:9.5px;letter-spacing:.14em;margin-bottom:7px;}
${T} .cd-party-name{font-size:13px;color:var(--ink);}
${T} .cd-lines{color:var(--muted);font-size:11.5px;line-height:1.5;}
${T} .sd-parties .cd-party-from{flex:1.3 1 0;}
${T} .sd-cols4{gap:18px;}
${T} .sd-cols4 .cd-party-from{flex:1.1 1 0;}
${T} .sd-cols4 .cd-lines,${T} .sd-cols4 .cd-meta-row{font-size:11px;}
${T} .cd-meta-row{border-bottom:1px dotted ${v.hair};padding:3px 0;}
${T} .cd-meta-row:last-child{border-bottom:0;}
${T} .cd-subject-text{font-family:var(--font-head);font-size:16px;}
${T} .cd-table{border-collapse:separate;border-spacing:0;}
${T} .cd-table th{background:${v.headBg};color:${v.headInk};font-size:9.5px;font-weight:700;letter-spacing:.09em;padding:8px 10px;border:0;}
${T} .cd-table th:first-child{border-top-left-radius:${r}px;border-bottom-left-radius:${r}px;}
${T} .cd-table th:last-child{border-top-right-radius:${r}px;border-bottom-right-radius:${r}px;}
${T} .cd-table td{padding:7px 10px;border-bottom:1px solid var(--rule);font-size:11.5px;}
${T} .cd-table tbody tr:nth-child(even) td{background:${v.zebra};}
${T} .cd-item-name{font-weight:600;color:var(--ink);}
${T} .cd-summary{margin-top:6px;}
${T} .cd-totals{flex:0 0 280px;}
${T} .cd-tot{padding:4px 6px;font-size:12px;}
${T} .cd-tot-label{color:var(--muted);}
${T} .cd-tot-value{color:var(--ink);}
${T} .cd-tot-grand{background:none;color:var(--accent-ink);border-radius:0;border-top:1.5px solid var(--ink);margin-top:8px;padding:10px 6px 4px;font-size:16px;font-weight:800;}
${T} .cd-tot-grand .cd-tot-label,${T} .cd-tot-grand .cd-tot-value{color:var(--accent-ink);font-weight:800;}
${T} .cd-tot-balance{border-top:1px solid var(--rule-strong);font-size:13.5px;}
${T} .cd-pay-btn{background:var(--accent);color:${v.payInk};border-radius:${Math.max(2, r)}px;letter-spacing:.08em;text-transform:uppercase;font-size:11px;padding:9px 20px;}
${T} .cd-sum-closing{font-family:var(--font-head);font-size:13px;color:var(--accent-ink);}
${T} .cd-h{font-family:var(--font-head);color:var(--accent-ink);font-size:10.5px;letter-spacing:.13em;padding-bottom:5px;border-bottom:1px solid ${v.hair};margin-bottom:9px;}
${T} .cd-fact{background:${v.tint};border:1px solid ${v.hair};border-radius:${r}px;}
${T} .cd-fact-value{font-family:var(--font-head);color:var(--accent-ink);font-size:17px;}
${T} .cd-tag{background:${v.tint};color:var(--accent-ink);border-radius:${Math.max(2, r)}px;}
${T} .cd-sig-line{border-top-color:var(--ink);}
${T} .cd-closing-text{font-family:var(--font-head);color:var(--accent-ink);}
${spec.footerLine ? `${T} .cd-footer{border-top:1px solid ${v.hair};padding-top:7px;}` : ''}
`;
};

const certificateCss = (spec: Spec, v: Vars) => {
  const { T } = v;
  return `
${T}{--title-size:32px;}
${T} .sd-frame{position:absolute;border-style:solid;border-color:${v.frame};}
${T} .sd-frame-o{left:30px;top:30px;right:30px;bottom:30px;border-width:2px;}
${T} .sd-frame-i{left:36px;top:36px;right:36px;bottom:36px;border-width:1px;}
${T} .sd-cert-hdr{text-align:center;margin-bottom:18px;}
${T} .sd-cert-hdr .cd-logo{margin:0 auto 10px;max-height:46px;max-width:210px;}
${T} .cd-title{font-family:var(--font-head);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-right:-.08em;color:var(--ink);}
${T} .sd-titlewrap .sd-sub{margin-top:7px;}
${T} .sd-cert-hdr .cd-status{margin-top:9px;}
${T} .sd-parties{border-top:1px solid ${v.hair};border-bottom:1px solid ${v.hair};padding:13px 0 11px;margin-bottom:20px;}
${bodyCss(spec, v)}
`;
};

const modernCss = (spec: Spec, v: Vars) => {
  const { T } = v;
  return `
${T}{--title-size:40px;}
${T} .sd-topbar{position:absolute;left:0;right:0;top:0;height:12px;background:${v.bandBg};}
${T} .sd-band-hdr{margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 28px calc(-1 * var(--pl));}
${T} .sd-band{display:flex;justify-content:space-between;align-items:center;gap:28px;background:${v.bandBg};color:${v.bandInk};padding:28px var(--px) 24px var(--pl);min-height:170px;}
${T} .sd-band-brand{min-width:0;max-width:46%;}
${T} .sd-plate{display:inline-block;background:#ffffff;border-radius:${Math.max(4, v.r)}px;padding:8px 12px;}
${T} .sd-plate .cd-logo{max-height:52px;max-width:190px;}
${T} .sd-wordmark{font-family:var(--font-head);font-weight:800;font-size:21px;line-height:1.15;letter-spacing:.01em;overflow-wrap:anywhere;}
${T} .sd-band-doc{text-align:right;min-width:0;}
${T} .sd-band .cd-title{color:${v.bandTitle};font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-right:-.05em;}
${T} .sd-band .sd-sub{color:${v.bandInk};opacity:.9;margin-top:10px;}
${T} .sd-band .sd-sub strong{color:${v.bandInk};}
${T} .sd-band .cd-status{background:#ffffff;border-color:#ffffff;margin-top:10px;}
${T} .sd-parties{padding-bottom:16px;border-bottom:1px solid ${v.hair};}
${bodyCss(spec, v)}
`;
};

// ---------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------
const make = (spec: Spec): DesignDef => {
  const meta: TemplateMeta = {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    accent: spec.primary,
    secondary: spec.secondary,
    paper: '#ffffff',
    headFont: spec.head,
    bodyFont: spec.body,
    tags: spec.tags,
    collection: 'standard',
  };
  const cert = spec.layout === 'certificate';
  const theme: ThemeDef = {
    id: spec.id,
    ink: spec.text,
    pad: cert ? { top: 56, x: 70, bottom: 74, footer: 46 } : { top: 48, x: 56, bottom: 74, footer: 30 },
    header: cert ? certificateHeader(spec) : modernHeader,
    parties: partiesRow,
    chrome: () => (cert ? '<div class="sd-frame sd-frame-o"></div><div class="sd-frame sd-frame-i"></div>' : '<div class="sd-topbar cd-cont-only"></div>'),
    css: (ctx) => {
      const v = vars(spec, ctx);
      return (cert ? certificateCss(spec, v) : modernCss(spec, v)) + (spec.extra ? spec.extra(v, ctx) : '');
    },
  };
  return { meta, theme };
};

// ---------------------------------------------------------------------------
// the 10 designs (palettes and fonts from the original TemplateStyle table)
// ---------------------------------------------------------------------------
const SPECS: Spec[] = [
  {
    id: 'standard', name: 'Standard', layout: 'certificate',
    description: 'The original Standard design: black double frame, centered Times title and a crisp black-and-white table.',
    tags: ['standard', 'classic', 'black', 'serif'],
    primary: '#000000', secondary: '#666666', text: '#222222', border: '#000000', zebra: '#f2f2f2', tint: '#f5f5f5',
    head: 'times', body: 'helvetica', radius: 0, footerLine: true,
    extra: ({ T }) => `
${T} .sd-cert-hdr{padding-bottom:14px;border-bottom:3px double var(--ink);margin-bottom:18px;}
${T} .sd-parties{border-top:0;padding-top:0;}
${T} .cd-tot-grand{border-top:3px double var(--ink);}
`,
  },
  {
    id: 'professional', name: 'Professional', layout: 'certificate',
    description: 'Navy and silver: a slate title plate inside a light double frame, set in Times.',
    tags: ['professional', 'navy', 'serif', 'formal'],
    primary: '#2c3e50', secondary: '#34495e', text: '#2c3e50', border: '#bdc3c7', zebra: '#eaeded', tint: '#eef1f3',
    head: 'times', body: 'times', radius: 0, footerLine: true,
    extra: ({ T, headBg, headInk }) => `
${T}{--title-size:30px;}
${T} .sd-titlewrap{background:${headBg};color:${headInk};padding:14px 20px 11px;}
${T} .sd-titlewrap .cd-title{color:${headInk};letter-spacing:.16em;margin-right:-.16em;}
${T} .sd-titlewrap .sd-sub,${T} .sd-titlewrap .sd-sub strong{color:${headInk};opacity:.92;}
${T} .sd-parties{border-top:0;padding-top:4px;}
${T} .cd-table td{font-size:12px;}
${T} .cd-tot-grand{border-top:2px solid var(--accent);}
`,
  },
  {
    id: 'elegant', name: 'Elegant', layout: 'certificate',
    description: 'Plum serif title with a diamond ornament, lilac double frame and soft lavender rows.',
    tags: ['elegant', 'purple', 'serif'],
    primary: '#8e44ad', secondary: '#9b59b6', text: '#4a235a', border: '#d7bde2', zebra: '#f5eef8', tint: '#f8f2fa',
    head: 'times', body: 'times', radius: 0, footerLine: false,
    extra: ({ T }) => `
${T}{--title-size:38px;}
${T} .cd-title{color:var(--accent-ink);font-weight:400;letter-spacing:.14em;margin-right:-.14em;}
${T} .sd-sub{font-style:italic;font-size:12.5px;}
${T} .sd-orn{margin-top:9px;line-height:0;}
${T} .sd-parties{border-top:0;}
${T} .cd-label{color:var(--accent-ink);font-weight:400;font-size:10.5px;letter-spacing:.18em;}
${T} .cd-party-name{font-size:14px;}
${T} .cd-table th{font-weight:400;font-size:10.5px;letter-spacing:.14em;}
${T} .cd-table td{font-size:12.5px;}
${T} .cd-h{font-weight:400;font-size:12px;letter-spacing:.18em;}
${T} .cd-tot-grand{border-top:1px solid var(--accent);font-weight:700;}
${T} .cd-tot-grand .cd-tot-label{font-style:italic;font-weight:400;}
`,
  },
  {
    id: 'warm', name: 'Warm', layout: 'certificate',
    description: 'Burnt orange on a soft peach header panel with a peach frame and warm cream rows.',
    tags: ['warm', 'orange', 'friendly'],
    primary: '#d35400', secondary: '#e67e22', text: '#5d4037', border: '#f5cba7', zebra: '#fef5e7', tint: '#fdebd0',
    head: 'helvetica', body: 'helvetica', radius: 2, footerLine: true,
    extra: ({ T, tint, frame }) => `
${T}{--title-size:30px;}
${T} .sd-cert-hdr{background:${tint};border-radius:2px;padding:14px 20px 11px;border-bottom:3px solid ${frame};}
${T} .cd-title{color:var(--accent-ink);font-weight:800;letter-spacing:.1em;margin-right:-.1em;}
${T} .sd-parties{border-top:0;padding-top:4px;}
${T} .cd-label{color:var(--accent-ink);}
${T} .cd-tot-grand{background:${tint};border-top:0;border-radius:2px;padding:10px 10px;}
`,
  },
  {
    id: 'retro', name: 'Retro', layout: 'certificate',
    description: 'Typewriter Courier, a pale-yellow ticket header and a burnt-orange frame with a red title.',
    tags: ['retro', 'typewriter', 'vintage', 'mono'],
    primary: '#c0392b', secondary: '#e74c3c', text: '#5a4d41', border: '#d35400', zebra: '#fcf3cf', tint: '#fbf1c4',
    head: 'courier', body: 'courier', radius: 1, footerLine: true,
    extra: ({ T, tint, frame }) => `
${T}{--title-size:30px;font-size:12px;}
${T} .sd-cert-hdr{background:${tint};border:1.5px dashed ${frame};padding:12px 18px 10px;}
${T} .cd-lines{font-size:11px;}
${T} .cd-title{color:var(--accent-ink);letter-spacing:.2em;margin-right:-.2em;}
${T} .sd-parties{border-top:1px dashed ${frame};border-bottom:1px dashed ${frame};}
${T} .cd-label{letter-spacing:.08em;font-size:10.5px;}
${T} .cd-table td{border-bottom:1px dashed var(--rule-strong);font-size:11px;}
${T} .cd-table th{font-size:10px;letter-spacing:.12em;}
${T} .cd-tot-grand{border-top:3px double var(--ink);font-size:15px;}
${T} .cd-h{border-bottom-style:dashed;letter-spacing:.1em;}
${T} .cd-meta-row{border-bottom-style:dashed;}
`,
  },
  {
    id: 'modern_blue', name: 'Modern Blue', layout: 'modern',
    description: 'A bright blue header band with white type, rounded table header and a soft blue total.',
    tags: ['modern', 'blue', 'band'],
    primary: '#3498db', secondary: '#2980b9', text: '#2c3e50', border: '#aed6f1', zebra: '#ebf5fb', tint: '#ebf5fb',
    head: 'helvetica', body: 'helvetica', radius: 4, footerLine: false,
    extra: ({ T, tint }) => `
${T} .cd-label{color:var(--accent-ink);}
${T} .cd-tot-grand{background:${tint};border-top:0;border-radius:4px;padding:10px 10px;}
`,
  },
  {
    id: 'tech', name: 'Tech', layout: 'modern',
    description: 'Teal header band and monospaced Courier type with a mint-ruled table. Precise and technical.',
    tags: ['tech', 'teal', 'mono'],
    primary: '#16a085', secondary: '#1abc9c', text: '#000000', border: '#48c9b0', zebra: '#e8f6f3', tint: '#e8f8f5',
    head: 'courier', body: 'courier', radius: 0, footerLine: true,
    extra: ({ T, frame }) => `
${T}{font-size:12px;}
${T} .sd-band .cd-title{letter-spacing:.14em;margin-right:-.14em;}
${T} .cd-label{color:var(--accent-ink);letter-spacing:.08em;font-size:10.5px;}
${T} .cd-table{border:1px solid ${frame};}
${T} .cd-table td{font-size:11px;}
${T} .cd-tot-grand{border-top:1.5px dashed var(--accent);}
${T} .cd-h{letter-spacing:.1em;}
`,
  },
  {
    id: 'industrial', name: 'Industrial', layout: 'modern',
    description: 'Charcoal header band with an amber title, heavy black rules and a dark table head.',
    tags: ['industrial', 'amber', 'dark', 'trades'],
    primary: '#f39c12', secondary: '#333333', text: '#000000', border: '#000000', zebra: '#fcf3cf', tint: '#fdf6e3',
    head: 'helvetica', body: 'helvetica', radius: 0, footerLine: true,
    extra: ({ T, bandBg, bandTitle }) => `
${T} .sd-band{border-bottom:6px solid var(--accent);}
${T} .sd-band .cd-title{font-weight:900;letter-spacing:.06em;}
${T} .sd-parties{border-bottom:2px solid var(--ink);}
${T} .cd-table{border-bottom:2px solid var(--ink);}
${T} .cd-tot-grand{background:${bandBg};border-top:0;padding:10px 10px;}
${T} .cd-tot-grand .cd-tot-label,${T} .cd-tot-grand .cd-tot-value{color:${bandTitle};}
${T} .cd-fact{border-left:4px solid var(--accent);}
`,
  },
  {
    id: 'minimal', name: 'Minimal', layout: 'modern',
    description: 'Quiet grey: a pale header band, light hairlines and no fills. Lets the numbers speak.',
    tags: ['minimal', 'grey', 'light'],
    primary: '#95a5a6', secondary: '#7f8c8d', text: '#4d5859', border: '#ecf0f1', zebra: '#ffffff', tint: '#f6f8f8',
    head: 'helvetica', body: 'helvetica', radius: 0, footerLine: false,
    extra: ({ T }) => `
${T}{--title-size:36px;}
${T} .sd-band{border-bottom:2px solid var(--accent);min-height:150px;}
${T} .sd-band .cd-title{font-weight:300;letter-spacing:.18em;margin-right:-.18em;}
${T} .sd-plate{background:transparent;padding:0;}
${T} .sd-band .cd-status{background:transparent;}
${T} .cd-label{color:var(--muted);font-weight:600;}
${T} .cd-table th{background:transparent;color:var(--muted);border-bottom:1.5px solid var(--accent);}
${T} .cd-table td{border-bottom:1px solid #ecf0f1;}
${T} .cd-tot-grand{border-top:1px solid var(--accent);font-weight:600;}
${T} .cd-h{border-bottom:0;color:var(--muted);}
${T} .cd-fact{background:transparent;}
`,
  },
  {
    id: 'bold', name: 'Bold', layout: 'modern',
    description: 'Solid black header band, black rounded table head and a black total pill. Maximum contrast.',
    tags: ['bold', 'black', 'contrast'],
    primary: '#000000', secondary: '#000000', text: '#000000', border: '#000000', zebra: '#e5e5e5', tint: '#f2f2f2',
    head: 'helvetica', body: 'helvetica', radius: 6, footerLine: false,
    extra: ({ T, headInk }) => `
${T}{--title-size:44px;}
${T} .sd-band .cd-title{font-weight:900;letter-spacing:.02em;margin-right:0;}
${T} .cd-label{font-weight:800;}
${T} .cd-party-name{font-weight:800;}
${T} .cd-table th{font-size:10px;font-weight:800;}
${T} .cd-tot-grand{background:var(--accent);border-top:0;border-radius:6px;padding:11px 12px;}
${T} .cd-tot-grand .cd-tot-label,${T} .cd-tot-grand .cd-tot-value{color:${headInk};}
${T} .cd-h{border-bottom:2px solid var(--ink);color:var(--ink);font-weight:900;}
${T} .cd-fact{border:2px solid var(--ink);background:transparent;}
`,
  },
];

export const DESIGNS: DesignDef[] = SPECS.map(make);
