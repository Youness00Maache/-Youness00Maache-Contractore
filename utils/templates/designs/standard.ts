/**
 * The 10 original "Standard" designs (pre-2026-11 jsPDF designs), restored under their original ids and drawn
 * like the originals (old services/pdfGenerator.ts: TemplateStyle table, drawTemplateBackground,
 * drawDocumentHeader, drawContactGrid and the per-type generators). A4 measures of the original in mm are
 * converted at 1 mm ≈ 3.78 px.
 *
 *  - certificate (standard, professional, elegant, warm, retro): two thin rectangles framing every page
 *    (10 mm and 12 mm from the edge, in the design's border color); the logo centered at 25 mm; the title
 *    centered, uppercase, bold 26 pt in the header font; a grey 10 pt "No. | date" line under it; then
 *    "FROM:" / "TO:" columns (the second one at 110 mm).
 *  - modern (modern_blue, tech, industrial, minimal, bold): a 45 mm full-width band in the primary color with
 *    the logo at the left and, at the right, the title (28 pt) over the number and date lines; continuation
 *    pages get a 5 mm primary bar at the top; "FROM" / "TO" columns in Helvetica.
 * Both then print the same body: an autoTable "striped" table (header row filled with the primary color,
 * white bold text, every other row tinted, no rules), totals right-aligned on the table's right edge as
 * "Label: value" with the total in bold 14 pt in the primary color, a filled rounded "PAY NOW" button,
 * "Notes:"-style bold headings, grey heading bars for the work description (work order), PO-style grey info
 * boxes for key facts, and plain signature lines ("Authorized Signature").
 * Warranties keep the original certificate of warranty: primary bars at the top and bottom of the page, the
 * title centered in the primary color, centered statement and period lines. Receipts keep the centered
 * "PAID IN FULL"-style status line in the primary color.
 *
 * Every model field keeps a place: meta items extend the original grey "No. | date" line (certificate) or the
 * number/date lines of the band (modern); the closing line sits in the page footer (as in the old picker),
 * next to the page number.
 * Colors the original took from the user's primary color come from the palette (var(--accent) …), so user
 * colors keep working.
 */
import type { DesignDef, RenderCtx, ThemeDef } from '../blocks.ts';
import { afterSections, block, defaultSummary, logoImg, signaturesBlock, statusBadge } from '../blocks.ts';
import { contrastRatio, mix, readableOn } from '../colors.ts';
import type { DocModel } from '../model.ts';
import type { FontKey, TemplateId, TemplateMeta } from '../registry.ts';

type Layout = 'certificate' | 'modern';

interface Spec {
  id: TemplateId;
  name: string;
  description: string;
  tags: string[];
  layout: Layout;
  /** original primaryColor (→ meta.accent): table head, total, pay button, band */
  primary: string;
  /** meta.secondary */
  secondary: string;
  /** original textColor (body ink) */
  text: string;
  /** original borderColor (page frame, footer line) */
  border: string;
  /** original alternateRowColor (striped rows) */
  zebra: string;
  head: FontKey;
  body: FontKey;
  /** original showFooterLine */
  footerLine: boolean;
  /** monospaced designs set slightly smaller (Courier is wide) */
  mono?: boolean;
}

interface Vars {
  T: string;
  frame: string;
  zebra: string;
  /** table head fill and its text */
  headBg: string;
  headInk: string;
  /** header band fill / text (modern) */
  bandBg: string;
  bandInk: string;
  /** text on var(--accent) fills (pay button, warranty bars) */
  payInk: string;
  /** party lines (60,60,60) and the grey number/date line (80,80,80) of the original, from the design ink */
  soft: string;
  grey: string;
}

/** White text on a fill when it stays readable for bold text (the originals always used white), else near-black. */
const inkOn = (bg: string) => (contrastRatio('#ffffff', bg) >= 2.4 ? '#ffffff' : readableOn(bg));

const vars = (spec: Spec, ctx: RenderCtx): Vars => {
  const { c } = ctx;
  return {
    T: `.cd-t-${spec.id}`,
    frame: c.custom ? c.accentLine : spec.border,
    zebra: c.custom ? c.accentSoft : spec.zebra,
    headBg: c.accent,
    headInk: inkOn(c.accent),
    bandBg: c.accent,
    bandInk: inkOn(c.accent),
    payInk: inkOn(c.accent),
    soft: mix(c.ink, c.paper, 0.14),
    grey: mix(c.ink, c.paper, 0.3),
  };
};

// ---------------------------------------------------------------------------
// shared markup
// ---------------------------------------------------------------------------
const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, 'x');

const withColon = (label: string) => (/[.:#]$/.test(label.trim()) ? label : `${label}:`);

/** Number + every meta item (+ the key date when no other item shows it), as "Label: value" items. */
const idItems = (m: DocModel) => {
  const items: Array<{ html: string; len: number }> = [];
  const add = (label: string, value: string, cls = '') =>
    items.push({ html: `<span class="sd-si${cls}"><span class="sd-k">${withColon(label)}</span> <span class="sd-v">${value}</span></span>`, len: plain(label + value).length + 2 });
  if (m.number) add(m.numberLabel, m.number, ' sd-si-no');
  const shown = new Set([...m.meta.map((i) => i.value), ...m.facts.map((f) => f.value)]);
  if (m.keyDate && !shown.has(m.keyDate.value)) add(m.keyDate.label, m.keyDate.value);
  for (const i of m.meta) add(i.label, i.value);
  return items;
};

/** The original grey "Invoice #: X | Date: Y" line, extended with the meta items and wrapped between items. */
const subLine = (m: DocModel, maxChars: number) => {
  const items = idItems(m);
  const lines: Array<typeof items> = [];
  for (const it of items) {
    const cur = lines[lines.length - 1];
    if (cur && cur.reduce((a, x) => a + x.len + 3, 0) + it.len <= maxChars) cur.push(it);
    else lines.push([it]);
  }
  return lines.length
    ? `<div class="sd-sub">${lines.map((l) => `<div class="sd-sub-line">${l.map((x) => x.html).join('<span class="sd-sep">|</span>')}</div>`).join('')}</div>`
    : '';
};

/** "phone | website" (the original contact line), e-mail beside it when it fits. */
const contactLines = (m: DocModel, max: number) => {
  const out: string[][] = [];
  for (const it of [m.company.phone, m.company.website, m.company.email].filter(Boolean)) {
    const line = out.find((l) => l.reduce((a, x) => a + plain(x).length + 3, 0) + plain(it).length <= max);
    if (line) line.push(it); else out.push([it]);
  }
  return out.map((l) => l.join('<span class="sd-sep">|</span>'));
};

const linesHtml = (list: string[]) => (list.length ? `<div class="cd-lines">${list.map((l) => `<div>${l}</div>`).join('')}</div>` : '');

/** FROM: (company) · TO: (every party), the original contact grid. */
const partiesRow = (ctx: RenderCtx) => {
  const { m } = ctx;
  const cols: string[] = [];
  if (m.company.name || m.company.lines.length) {
    cols.push(`<div class="cd-party cd-party-from"><div class="cd-label">From</div>${m.company.name ? `<div class="cd-party-name">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="sd-tagline">${m.company.tagline}</div>` : ''}${linesHtml([...m.company.addressLines, ...contactLines(m, m.parties.length >= 2 ? 30 : 46)])}</div>`);
  }
  for (const p of m.parties) {
    cols.push(`<div class="cd-party"><div class="cd-label">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${linesHtml(p.lines)}</div>`);
  }
  return cols.length ? block(`cd-parties sd-parties sd-cols-${cols.length}`, cols.join('')) : '';
};

/** Key facts in the original PO "REQUIRED DATE: …" grey box (bold uppercase labels). */
const factsBox = ({ m }: RenderCtx) =>
  m.facts.length
    ? block('sd-facts', m.facts.map((f) => `<div class="sd-fact"><span class="sd-fact-k">${withColon(f.label)}</span> <span class="sd-fact-v">${f.value}</span>${f.sub ? ` <span class="sd-fact-sub">${f.sub}</span>` : ''}</div>`).join(''))
    : '';

const certificateHeader = (ctx: RenderCtx, mono: boolean) => {
  const { m } = ctx;
  const logo = logoImg(m);
  const status = m.kind === 'receipt' ? '' : statusBadge(m);
  return block(`cd-hdr sd-cert-hdr${logo ? '' : ' sd-nologo'}`, `${logo}<h1 class="cd-title">${m.title}</h1>${subLine(m, mono ? 74 : 92)}${status ? `<div class="sd-status">${status}</div>` : ''}`);
};

const modernHeader = (ctx: RenderCtx) => {
  const { m } = ctx;
  const logo = m.company.logoUrl ? `<div class="sd-plate">${logoImg(m)}</div>` : '';
  const items = idItems(m);
  const lines = items.length ? `<div class="sd-band-lines">${items.map((x) => `<div>${x.html}</div>`).join('')}</div>` : '';
  const status = m.kind === 'receipt' ? '' : statusBadge(m);
  return block('cd-hdr sd-band-hdr', `<div class="sd-band"><div class="sd-band-brand">${logo}</div><div class="sd-band-doc"><h1 class="cd-title">${m.title}</h1>${lines}${status ? `<div class="sd-status">${status}</div>` : ''}</div></div>`);
};

/** Certificate of warranty (both layouts): centered title in the primary color between two primary bars. */
const warrantyHeader = (ctx: RenderCtx, mono: boolean) => {
  const { m } = ctx;
  const logo = logoImg(m);
  return block('cd-hdr sd-cert-hdr sd-war-hdr', `${logo}<h1 class="cd-title">${m.title}</h1>${subLine(m, mono ? 66 : 80)}${statusBadge(m) ? `<div class="sd-status">${statusBadge(m)}</div>` : ''}`);
};

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
const commonCss = (spec: Spec, v: Vars) => {
  const { T } = v;
  const cert = spec.layout === 'certificate';
  const fs = spec.mono ? 12 : 13;
  return `
${T}{font-size:${fs}px;line-height:1.5;}
${T} .cd-block{margin-bottom:22px;}
${T} .cd-num{font-variant-numeric:tabular-nums;}
${T} .sd-sep{display:inline-block;margin:0 9px;opacity:.7;}
${T} .sd-si{display:inline-block;white-space:nowrap;}
${T} .cd-title,${T} .cd-title.cd-len-m,${T} .cd-title.cd-len-l{font-family:var(--font-head);font-weight:700;line-height:1.1;letter-spacing:0;text-transform:uppercase;font-size:var(--title-size);}
${T} .sd-status{line-height:0;}
${T} .cd-status{border-radius:3px;font-size:10px;letter-spacing:.12em;padding:2px 9px;line-height:1.5;margin-top:10px;}

/* FROM / TO (contact grid) */
${T} .sd-parties{display:flex;gap:24px;align-items:flex-start;margin-bottom:28px;}
${T} .sd-parties .cd-party{flex:1 1 0;min-width:0;}
${T} .sd-cols-2 .cd-party:first-child{flex:0 0 calc(52.9% - 24px);}
${T} .sd-parties .cd-label{font-family:${cert ? 'var(--font-head)' : 'var(--font-body)'};font-size:${fs}px;font-weight:700;letter-spacing:0;text-transform:uppercase;color:var(--ink);margin:0 0 5px;line-height:1.4;}
${cert ? `${T} .sd-parties .cd-label::after{content:':';}` : ''}
${T} .sd-parties .cd-party-name{font-family:${cert ? 'var(--font-head)' : 'var(--font-body)'};font-size:${fs}px;font-weight:700;color:var(--ink);margin:0;line-height:1.42;}
${T} .sd-parties .cd-lines{font-family:${cert ? 'var(--font-head)' : 'var(--font-body)'};font-size:${fs}px;line-height:1.42;color:${v.soft};}
${T} .sd-parties .cd-lines .sd-sep{margin:0 6px;}
${T} .sd-tagline{font-family:${cert ? 'var(--font-head)' : 'var(--font-body)'};font-size:${fs - 1}px;font-style:italic;color:${v.grey};line-height:1.42;}
${T} .sd-cols-3 .cd-party,${T} .sd-cols-4 .cd-party{font-size:${fs - 1}px;}
${T} .sd-cols-4{gap:18px;}
${T} .sd-cols-4 .cd-label,${T} .sd-cols-4 .cd-party-name,${T} .sd-cols-4 .cd-lines{font-size:${fs - 1}px;}

/* subject / intro / tags */
${T} .cd-subject-text{font-family:var(--font-head);font-size:22px;font-weight:700;line-height:1.25;color:var(--ink);}
${T} .cd-intro p{font-size:${fs + 1}px;line-height:1.6;}
${T} .cd-block.cd-tags{margin-top:-10px;margin-bottom:18px;}
${T} .cd-tag{background:#f0f0f0;color:var(--ink);border-radius:2px;font-size:11px;font-weight:700;padding:2px 9px;}

/* key facts: the original PO info box (fill 245, rule 200) */
${T} .sd-facts{display:flex;flex-wrap:wrap;gap:5px 34px;background:#f5f5f5;border:1px solid #c8c8c8;padding:10px 18px;line-height:1.45;}
${T} .sd-fact{min-width:0;overflow-wrap:anywhere;}
${T} .sd-fact-k{font-weight:700;text-transform:uppercase;font-size:${fs - 1}px;letter-spacing:.02em;color:var(--ink);}
${T} .sd-fact-v{color:var(--ink);}
${T} .sd-fact-sub{color:${v.grey};font-size:${fs - 2}px;}

/* striped table (autoTable theme 'striped') */
${T} .cd-table{border-collapse:collapse;}
${T} .cd-table th{background:${v.headBg};color:${v.headInk};font-family:var(--font-body);font-size:${fs}px;font-weight:700;letter-spacing:0;text-transform:none;padding:6px 8px;vertical-align:middle;line-height:1.3;}
${T} .cd-table td{padding:6px 8px;border-bottom:0;font-size:${fs}px;line-height:1.38;color:var(--ink);}
${T} .cd-table tbody tr:nth-child(odd) td{background:${v.zebra};}
${T} .cd-item-name{font-weight:400;color:var(--ink);}
${T} .cd-item-sub{color:${v.grey};font-size:${fs - 2}px;}
${T} .cd-row-empty td{background:transparent !important;color:${v.grey};padding:16px 8px;}

/* totals: right-aligned "Label: value" on the table's right edge, total bold 14 pt in the primary color */
${T} .cd-summary{gap:28px;align-items:flex-start;}
${T} .cd-summary-side{padding-top:2px;}
${T} .cd-totals{flex:0 0 auto;min-width:250px;max-width:360px;}
${T} .cd-tot{display:flex;justify-content:flex-end;align-items:baseline;gap:12px;padding:2px 8px;font-size:${fs}px;}
${T} .cd-tot-label{flex:1 1 auto;text-align:right;color:var(--ink);min-width:0;}
${T} .cd-tot-label::after{content:':';}
${T} .cd-tot-value{flex:0 0 auto;min-width:104px;text-align:right;font-weight:400;color:var(--ink);}
${T} .cd-tot-muted{font-size:${fs - 1}px;}
${T} .cd-tot-muted .cd-tot-label,${T} .cd-tot-muted .cd-tot-value{color:${v.grey};}
${T} .cd-tot-grand{background:none;border-radius:0;color:var(--accent-ink);margin-top:10px;padding:2px 8px;font-size:${Math.round(fs * 1.4)}px;font-weight:700;}
${T} .cd-tot-grand .cd-tot-label,${T} .cd-tot-grand .cd-tot-value{color:var(--accent-ink);font-weight:700;}
${T} .cd-tot-balance{border-top:0;margin-top:6px;padding:2px 8px;font-size:${fs + 1}px;font-weight:700;}
${T} .cd-tot-balance .cd-tot-label,${T} .cd-tot-balance .cd-tot-value{color:var(--ink);font-weight:700;}
${T} .cd-sum-note{font-size:${fs - 1}px;}
${T} .cd-sum-note .cd-label{font-size:${fs}px;font-weight:700;letter-spacing:0;text-transform:none;color:var(--ink);margin-bottom:4px;}
${T} .cd-sum-note .cd-label::after{content:':';}
${T} .cd-mini td{border-bottom:0;padding:2px 0;font-size:${fs - 1}px;}

/* "PAY NOW": filled rounded 40 × 10 mm button */
${T} .cd-pay-btn{display:inline-block;min-width:151px;height:38px;line-height:38px;padding:0 18px;border-radius:7.5px;background:var(--accent);color:${v.payInk};font-size:${fs}px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;text-align:center;white-space:nowrap;}
${T} .cd-pay-url{font-size:9.5px;color:${v.grey};}
${T} .cd-pay-qr-cap{color:${v.grey};}
${T} .cd-fin{border-left:0;border:1px solid #c8c8c8;background:#f5f5f5;padding:8px 12px;}
${T} .cd-fin-h{color:var(--ink);letter-spacing:.02em;font-size:${fs - 1}px;}
${T} .cd-fin-url{color:var(--accent-ink);}

/* sections: "Notes:" bold headings; the work description under grey heading bars (work order) */
${T} .cd-h{font-family:var(--font-body);font-size:${fs}px;font-weight:700;letter-spacing:0;text-transform:none;color:var(--ink);margin:0 0 4px;padding:0;border:0;background:none;line-height:1.4;}
${T} .cd-h::after{content:':';}
${T} .cd-before .cd-h{background:#f0f0f0;font-size:${fs + 1}px;padding:5px 8px;margin-bottom:9px;}
${T} .cd-before .cd-h::after,${T} .cd-visuals .cd-h::after{content:none;}
${T} .cd-prose{font-size:${fs}px;line-height:1.55;}
${T} .cd-prose h1,${T} .cd-prose h2,${T} .cd-prose h3{color:var(--ink);}
${T} .cd-prose th{background:#f0f0f0;}
${T} .cd-prose blockquote{border-left-color:var(--accent);}
${T} .cd-grid2{gap:36px;}
${T} .cd-signoff{gap:36px;}
${T} .cd-signoff-sec+.cd-signoff-sec{margin-top:14px;}

/* plain signature: image, a 60 mm line and the label (second one at 120 mm) */
${T} .cd-sigs{gap:20px 151px;}
${T} .cd-sig{flex:0 0 227px;max-width:227px;}
${T} .cd-signoff-sigs{flex:0 0 227px;gap:14px;}
${T} .cd-signoff-sigs .cd-sig{flex:none;max-width:none;}
${T} .cd-sig-img{height:50px;}
${T} .cd-sig-img img{max-height:48px;max-width:200px;}
${T} .cd-sig-line{border-top:1px solid var(--ink);margin-top:3px;}
${T} .cd-sig-label{font-size:${fs}px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink);margin-top:4px;}
${T} .cd-sig-meta{font-size:${fs - 2}px;color:${v.grey};margin-top:1px;}
${T} .cd-sig-fill{color:var(--faint);}

/* receipts: the original centered "PAID IN FULL" line (16 pt bold, primary color) */
${T} .sd-paid{text-align:center;font-family:var(--font-body);font-size:21px;font-weight:700;line-height:1.3;text-transform:uppercase;letter-spacing:.03em;color:var(--accent-ink);margin:4px 0 26px;}

/* page footer: closing line centered (old picker), page number at the right */
${T} .sd-footer{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:12px;font-size:10.5px;color:#999999;}
${T} .sd-footer .cd-footer-text{text-align:center;font-style:${spec.footerLine ? 'normal' : 'italic'};}
${T} .sd-footer .cd-pageno{text-align:right;}
${spec.footerLine ? `${T} .sd-footer.sd-has-text{border-top:1px solid ${v.frame};padding-top:8px;}` : ''}
${T} .cd-cont .cd-runhead{font-size:10px;letter-spacing:.04em;color:${v.grey};border-bottom:1px solid #d9d9d9;margin-bottom:20px;}

/* warranty: the original certificate of warranty (primary bars at the top and bottom of every page) */
${T}.cd-k-warranty{--pt:104px;--pb:112px;--fb:88px;}
${T} .sd-wbar{position:absolute;left:0;right:0;height:76px;background:var(--accent);}
${T} .sd-wbar-t{top:0;} ${T} .sd-wbar-b{bottom:0;}
${T} .sd-war-hdr{margin:0 0 26px;padding:0;text-align:center;}
${T} .sd-war-hdr .cd-logo{margin:0 auto 18px;max-width:132px;max-height:70px;}
${T} .sd-war-hdr .cd-title,${T} .sd-war-hdr .cd-title.cd-len-m,${T} .sd-war-hdr .cd-title.cd-len-l{font-size:40px;color:var(--accent-ink);}
${T} .sd-war-hdr .sd-sub{font-size:${fs + 3}px;color:var(--ink);margin-top:10px;}
${T}.cd-k-warranty .cd-intro{text-align:center;padding:0 24px;}
${T}.cd-k-warranty .cd-intro p{font-size:${fs + 3}px;line-height:1.6;}
${T}.cd-k-warranty .sd-facts{background:none;border:0;padding:0;flex-direction:column;align-items:center;gap:4px;font-size:${fs + 3}px;font-weight:700;}
${T}.cd-k-warranty .sd-fact-k{text-transform:none;font-size:inherit;letter-spacing:0;}
${T}.cd-k-warranty .cd-sigs{justify-content:center;}
`;
};

const certificateCss = (spec: Spec, v: Vars) => {
  const { T } = v;
  return `
${T}{--title-size:35px;}
${T} .sd-frame{position:absolute;border:2px solid ${v.frame};}
${T} .sd-frame-o{left:37px;top:37px;right:37px;bottom:37px;}
${T} .sd-frame-i{left:44px;top:44px;right:44px;bottom:44px;}
${T} .sd-cert-hdr{text-align:center;margin:10px 0 28px;}
${T} .sd-cert-hdr.sd-nologo{padding-top:26px;}
${T} .sd-cert-hdr .cd-logo{margin:0 auto 20px;max-width:132px;max-height:76px;}
${T} .sd-cert-hdr .cd-title{color:var(--ink);}
${T} .sd-sub{margin-top:9px;font-family:var(--font-head);font-size:${spec.mono ? 12 : 13}px;line-height:1.5;color:${v.grey};}
${T} .sd-sub .sd-v{color:var(--ink);}
${commonCss(spec, v)}
`;
};

const modernCss = (spec: Spec, v: Vars) => {
  const { T } = v;
  return `
${T}{--title-size:37px;}
${T} .sd-topbar{position:absolute;left:0;right:0;top:0;height:19px;background:var(--accent);}
${T} .sd-band-hdr{margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) 44px calc(-1 * var(--pl));}
${T} .sd-band{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;background:${v.bandBg};color:${v.bandInk};padding:38px var(--px) 24px var(--pl);min-height:170px;}
${T} .sd-band-brand{flex:0 1 auto;min-width:0;max-width:40%;}
${T} .sd-plate{display:inline-block;background:#ffffff;border-radius:3px;padding:6px 8px;line-height:0;}
${T} .sd-plate .cd-logo{max-width:110px;max-height:76px;}
${T} .sd-band-doc{flex:1 1 auto;min-width:0;text-align:right;padding-top:18px;}
${T} .sd-band .cd-title{color:${v.bandInk};}
${T} .sd-band-lines{margin-top:8px;font-size:${spec.mono ? 12 : 13}px;line-height:1.45;color:${v.bandInk};}
${T} .sd-band .cd-status{color:${v.bandInk};border-color:${v.bandInk};}
${commonCss(spec, v)}
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
  const mono = !!spec.mono;
  const theme: ThemeDef = {
    id: spec.id,
    ink: spec.text,
    // 20 mm side margins (the original x = 20 mm … 190 mm); the certificate footer sits inside the frame
    pad: cert ? { top: 76, x: 76, bottom: 94, footer: 58 } : { top: 76, x: 76, bottom: 82, footer: 38 },
    header: (ctx) => (ctx.m.kind === 'warranty' ? warrantyHeader(ctx, mono) : cert ? certificateHeader(ctx, mono) : modernHeader(ctx)),
    parties: partiesRow,
    summary: (ctx) => defaultSummary(ctx, false),
    chrome: ({ m }) => {
      if (m.kind === 'warranty') return '<div class="sd-wbar sd-wbar-t cd-deco"></div><div class="sd-wbar sd-wbar-b cd-deco"></div>';
      return cert
        ? '<div class="sd-frame sd-frame-o cd-deco"></div><div class="sd-frame sd-frame-i cd-deco"></div>'
        : '<div class="sd-topbar cd-cont-only cd-deco"></div>';
    },
    footer: ({ m }) => `<div class="cd-footer sd-footer${m.closing ? ' sd-has-text' : ''}"><div></div><div class="cd-footer-text">${m.closing}</div><div class="cd-pageno"></div></div>`,
    compose: (ctx, p) => {
      const { m } = ctx;
      const paid = m.kind === 'receipt' && m.status ? block('sd-paid', m.status.text) : '';
      const war = m.kind === 'warranty';
      const after = war ? afterSections(m.after, true) : p.after;
      const sigs = war ? signaturesBlock(m) : p.signatures;
      // the closing line is printed in the page footer
      return [p.header, p.parties, p.subject, p.intro, factsBox(ctx), p.tags, ...p.before, p.items, p.summary, paid, p.visuals, ...after, sigs];
    },
    css: (ctx) => {
      const v = vars(spec, ctx);
      return cert ? certificateCss(spec, v) : modernCss(spec, v);
    },
  };
  return { meta, theme };
};

// ---------------------------------------------------------------------------
// the 10 designs (colors and fonts from the original TemplateStyle table)
// ---------------------------------------------------------------------------
const SPECS: Spec[] = [
  {
    id: 'standard', name: 'Standard', layout: 'certificate',
    description: 'The original Standard design: black double frame, centered Times title, From/To columns and a striped table with a black header.',
    tags: ['standard', 'classic', 'black', 'serif'],
    primary: '#000000', secondary: '#666666', text: '#222222', border: '#000000', zebra: '#f2f2f2',
    head: 'times', body: 'helvetica', footerLine: true,
  },
  {
    id: 'professional', name: 'Professional', layout: 'certificate',
    description: 'Silver double frame and Times type throughout, with a navy table header and a navy total.',
    tags: ['professional', 'navy', 'serif', 'formal'],
    primary: '#2c3e50', secondary: '#34495e', text: '#2c3e50', border: '#bdc3c7', zebra: '#eaeded',
    head: 'times', body: 'times', footerLine: true,
  },
  {
    id: 'elegant', name: 'Elegant', layout: 'certificate',
    description: 'Lilac double frame and Times type, with a plum table header, lavender rows and a plum total.',
    tags: ['elegant', 'purple', 'serif'],
    primary: '#8e44ad', secondary: '#9b59b6', text: '#4a235a', border: '#d7bde2', zebra: '#f5eef8',
    head: 'times', body: 'times', footerLine: false,
  },
  {
    id: 'warm', name: 'Warm', layout: 'certificate',
    description: 'Peach double frame with a burnt-orange table header, cream rows and a burnt-orange total.',
    tags: ['warm', 'orange', 'friendly'],
    primary: '#d35400', secondary: '#e67e22', text: '#5d4037', border: '#f5cba7', zebra: '#fef5e7',
    head: 'helvetica', body: 'helvetica', footerLine: true,
  },
  {
    id: 'retro', name: 'Retro', layout: 'certificate',
    description: 'Typewriter Courier inside an orange double frame, with a red table header, pale-yellow rows and a red total.',
    tags: ['retro', 'typewriter', 'vintage', 'mono'],
    primary: '#c0392b', secondary: '#e74c3c', text: '#5a4d41', border: '#d35400', zebra: '#fcf3cf',
    head: 'courier', body: 'courier', footerLine: true, mono: true,
  },
  {
    id: 'modern_blue', name: 'Modern Blue', layout: 'modern',
    description: 'A full-width blue header band with the logo at the left and the white title at the right, over a striped blue table.',
    tags: ['modern', 'blue', 'band'],
    primary: '#3498db', secondary: '#2980b9', text: '#2c3e50', border: '#aed6f1', zebra: '#ebf5fb',
    head: 'helvetica', body: 'helvetica', footerLine: false,
  },
  {
    id: 'tech', name: 'Tech', layout: 'modern',
    description: 'Teal header band and Courier type throughout, with a teal table header and mint rows.',
    tags: ['tech', 'teal', 'mono'],
    primary: '#16a085', secondary: '#1abc9c', text: '#000000', border: '#48c9b0', zebra: '#e8f6f3',
    head: 'courier', body: 'courier', footerLine: true, mono: true,
  },
  {
    id: 'industrial', name: 'Industrial', layout: 'modern',
    description: 'Amber header band with dark type, an amber table header, pale-yellow rows and an amber total.',
    tags: ['industrial', 'amber', 'dark', 'trades'],
    primary: '#f39c12', secondary: '#d35400', text: '#000000', border: '#000000', zebra: '#fcf3cf',
    head: 'helvetica', body: 'helvetica', footerLine: true,
  },
  {
    id: 'minimal', name: 'Minimal', layout: 'modern',
    description: 'Quiet grey: a soft grey header band, a grey table header and light rows. Lets the numbers speak.',
    tags: ['minimal', 'grey', 'light'],
    primary: '#95a5a6', secondary: '#7f8c8d', text: '#4d5859', border: '#ecf0f1', zebra: '#f5f5f5',
    head: 'helvetica', body: 'helvetica', footerLine: false,
  },
  {
    id: 'bold', name: 'Bold', layout: 'modern',
    description: 'Solid black header band, a black table header and a black total. Maximum contrast.',
    tags: ['bold', 'black', 'contrast'],
    primary: '#000000', secondary: '#000000', text: '#000000', border: '#000000', zebra: '#e5e5e5',
    head: 'helvetica', body: 'helvetica', footerLine: false,
  },
];

export const DESIGNS: DesignDef[] = SPECS.map(make);
