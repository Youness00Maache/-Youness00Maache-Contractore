/**
 * Shared building blocks of every document layout (header pieces, parties, items table, totals,
 * sections, signatures...) plus the base stylesheet. Templates (themes.ts) style these blocks and
 * may replace a few of them (header, parties, summary, page chrome).
 *
 * Pagination contract (see paginate.ts): every top-level child of `.cd-body` is a `.cd-block`.
 *  - data-split="rows"      → a table whose <tbody> rows may be split across pages (header row repeated)
 *  - data-split="children"  → a section whose `.cd-split` children may be split across pages
 *  - data-pin="bottom"      → kept at the bottom of the last page
 *  - data-optional="1"      → decorative; dropped when it would need a page of its own
 *  - anything else          → kept in one piece (moved to the next page when it doesn't fit)
 */
import type { DocModel, Section, Signature, TotalLine } from './model.ts';
import type { PaperSize, TemplateId, TemplateMeta } from './registry.ts';

export interface Palette {
  paper: string;
  ink: string;
  muted: string;
  faint: string;
  rule: string;
  ruleStrong: string;
  accent: string;
  accentInk: string;
  onAccent: string;
  accentSoft: string;
  accentTint: string;
  accentLine: string;
  secondary: string;
  secondaryInk: string;
  onSecondary: string;
  secondarySoft: string;
  /** true when the colors came from the user (not the template defaults) */
  custom: boolean;
}

export interface RenderCtx {
  m: DocModel;
  meta: TemplateMeta;
  c: Palette;
  paper: PaperSize;
  page: { width: number; height: number };
}

export interface Parts {
  header: string;
  parties: string;
  subject: string;
  intro: string;
  facts: string;
  tags: string;
  before: string[];
  items: string;
  summary: string;
  visuals: string;
  after: string[];
  signatures: string;
  closing: string;
}

export interface ThemeDef {
  id: TemplateId;
  /** page padding in CSS px; `left` overrides x on the left side; `footer` = distance of the footer from the page bottom */
  pad: { top: number; x: number; bottom: number; left?: number; footer?: number };
  ink?: string;
  header(ctx: RenderCtx): string;
  parties?(ctx: RenderCtx): string;
  summary?(ctx: RenderCtx): string;
  chrome?(ctx: RenderCtx): string;
  /** replaces the default page footer (must keep a `.cd-footer` root and a `.cd-pageno` element) */
  footer?(ctx: RenderCtx): string;
  css(ctx: RenderCtx): string;
  compose?(ctx: RenderCtx, p: Parts): string[];
  /** pad the items table with empty rows up to this count (ledger look) */
  fillRows?: number;
  /** render short "after" sections (notes/terms) side by side */
  sectionsGrid?: boolean;
  /** show the company as a "From" party in the parties row */
  fromParty?: boolean;
  /** render the closing line ("Thank you…") as its own block instead of inside the totals area */
  closingBlock?: boolean;
  /** never put short notes/terms beside the signatures */
  noSignoff?: boolean;
}

/** A design module entry (designs/*.ts): registry metadata + the theme that renders it. */
export interface DesignDef {
  meta: TemplateMeta;
  theme: ThemeDef;
}

// ---------------------------------------------------------------------------
// small pieces
// ---------------------------------------------------------------------------
export const block = (cls: string, inner: string, attrs = '') => (inner ? `<section class="cd-block ${cls}"${attrs ? ' ' + attrs : ''}>${inner}</section>` : '');

export const logoImg = (m: DocModel, cls = 'cd-logo') =>
  m.company.logoUrl ? `<img class="${cls}" src="${m.company.logoUrl}" crossorigin="anonymous" alt="">` : '';

export const monogram = (m: DocModel, cls = 'cd-monogram') => (m.company.initials ? `<div class="${cls}">${m.company.initials}</div>` : '');

export const logoOrMonogram = (m: DocModel) => logoImg(m) || monogram(m);

export const titleClass = (m: DocModel) => {
  const n = m.title.length;
  return n <= 8 ? 'cd-title cd-len-s' : n <= 12 ? 'cd-title cd-len-m' : 'cd-title cd-len-l';
};

export const titleH1 = (m: DocModel, extra = '') => `<h1 class="${titleClass(m)}${extra ? ' ' + extra : ''}">${m.title}</h1>`;

export const docNumber = (m: DocModel, label = true) =>
  m.number ? `<div class="cd-docno">${label ? `<span class="cd-docno-label">${m.numberLabel}</span> ` : ''}<span class="cd-docno-value">${m.number}</span></div>` : '';

export const statusBadge = (m: DocModel) => (m.status ? `<span class="cd-status cd-tone-${m.status.tone}">${m.status.text}</span>` : '');

export const lines = (list: string[], cls = 'cd-lines') => (list.length ? `<div class="${cls}">${list.map((l) => `<div>${l}</div>`).join('')}</div>` : '');

export const metaList = (m: DocModel, cls = 'cd-meta') =>
  m.meta.length ? `<dl class="${cls}">${m.meta.map((i) => `<div class="cd-meta-row"><dt>${i.label}</dt><dd>${i.value}</dd></div>`).join('')}</dl>` : '';

export const companyParty = (m: DocModel, label = 'From') =>
  m.company.name || m.company.lines.length
    ? `<div class="cd-party cd-party-from"><div class="cd-label">${label}</div><div class="cd-party-name">${m.company.name}</div>${lines(m.company.lines)}</div>`
    : '';

export const partyBlocks = (m: DocModel) =>
  m.parties.map((p) => `<div class="cd-party"><div class="cd-label">${p.label}</div>${p.name ? `<div class="cd-party-name">${p.name}</div>` : ''}${lines(p.lines)}</div>`).join('');

/** Default parties row: [From] + parties + Details (meta). */
export const defaultParties = (ctx: RenderCtx, opts: { from?: boolean; metaTitle?: string } = {}) => {
  const { m } = ctx;
  const cols = [
    opts.from ? companyParty(m) : '',
    partyBlocks(m),
    m.meta.length ? `<div class="cd-party cd-party-meta"><div class="cd-label">${opts.metaTitle ?? 'Details'}</div>${metaList(m)}</div>` : '',
  ].join('');
  return cols ? block('cd-parties', cols) : '';
};

export const subjectBlock = (m: DocModel) => (m.subject ? block('cd-subject', `<div class="cd-subject-text">${m.subject}</div>`) : '');

export const introBlock = (m: DocModel) => (m.intro ? block('cd-intro', `<p>${m.intro}</p>`) : '');

export const factsBlock = (m: DocModel) =>
  m.facts.length
    ? block('cd-facts', m.facts.map((f) => `<div class="cd-fact"><div class="cd-fact-label">${f.label}</div><div class="cd-fact-value">${f.value}</div>${f.sub ? `<div class="cd-fact-sub">${f.sub}</div>` : ''}</div>`).join(''))
    : '';

export const tagsBlock = (m: DocModel) => (m.tags.length ? block('cd-tags', m.tags.map((t) => `<span class="cd-tag">${t}</span>`).join('')) : '');

/** A titled section. Rich content is split per child element during pagination. */
export const sectionBlock = (s: Section, extraCls = '') => {
  const title = s.title ? `<h3 class="cd-h">${s.title}</h3>` : '';
  return `<section class="cd-block cd-section cd-sec-${s.id}${extraCls ? ' ' + extraCls : ''}" data-split="children">${title}<div class="cd-section-body cd-prose cd-split">${s.html}</div></section>`;
};

const plainLength = (html: string) => html.replace(/<[^>]+>/g, '').length;

/** Renders "after" sections; short ones side by side when the theme asks for it. */
export const afterSections = (sections: Section[], grid: boolean): string[] => {
  if (grid && sections.length === 2 && sections.every((s) => plainLength(s.html) < 700 && !/<(img|table)/i.test(s.html))) {
    return [block('cd-grid2', sections.map((s) => `<div class="cd-grid-cell cd-sec-${s.id}">${s.title ? `<h3 class="cd-h">${s.title}</h3>` : ''}<div class="cd-prose">${s.html}</div></div>`).join(''))];
  }
  return sections.map((s) => sectionBlock(s));
};

export const itemsBlock = (ctx: RenderCtx, fillRows = 0) => {
  const t = ctx.m.items;
  if (!t) return '';
  const cols = t.columns;
  const colgroup = `<colgroup>${cols.map((c) => `<col${c.width ? ` style="width:${c.width}"` : ''}>`).join('')}</colgroup>`;
  const alignCls = (a: string) => (a === 'right' ? 'cd-r' : a === 'center' ? 'cd-c' : 'cd-l');
  const head = `<thead><tr>${cols.map((c, i) => `<th class="${alignCls(c.align)} cd-col-${i}${i === cols.length - 1 ? ' cd-col-last' : ''}${c.cls ? ' ' + c.cls : ''}">${c.label}</th>`).join('')}</tr></thead>`;
  let rows = t.rows.map((r) => `<tr class="cd-row">${r.map((cell, i) => `<td class="${alignCls(cols[i]?.align || 'left')} cd-col-${i}${i === cols.length - 1 ? ' cd-col-last' : ''}${cols[i]?.cls ? ' ' + cols[i].cls : ''}${cols[i]?.align === 'right' ? ' cd-num' : ''}">${cell}</td>`).join('')}</tr>`).join('');
  if (!t.rows.length && t.emptyText) rows = `<tr class="cd-row cd-row-empty"><td colspan="${cols.length}">${t.emptyText}</td></tr>`;
  const fill = Math.max(0, fillRows - t.rows.length);
  for (let i = 0; i < fill; i++) rows += `<tr class="cd-row cd-row-filler">${cols.map(() => '<td>&nbsp;</td>').join('')}</tr>`;
  return `<section class="cd-block cd-items" data-split="rows"><table class="cd-table">${colgroup}${head}<tbody>${rows}</tbody></table></section>`;
};

export const totalsHtml = (totals: TotalLine[], cls = 'cd-totals') =>
  totals.length
    ? `<div class="${cls}">${totals.map((r) => `<div class="cd-tot cd-tot-${r.kind || 'normal'}"><span class="cd-tot-label">${r.label}</span><span class="cd-tot-value cd-num">${r.value}</span></div>`).join('')}</div>`
    : '';

export const payButton = (m: DocModel) =>
  m.paymentLink
    ? `<div class="cd-pay"><a class="cd-pay-btn" href="${m.paymentLink.url}">${m.paymentLink.label} →</a><div class="cd-pay-url">${m.paymentLink.url}</div></div>`
    : '';

export const summaryNotes = (m: DocModel) =>
  m.summaryNotes.map((s) => `<div class="cd-sum-note"><div class="cd-label">${s.title}</div>${s.html}</div>`).join('');

/** The closing line inside the totals area (used by every summary renderer). */
export const closingInline = (m: DocModel) => (m.closing ? `<div class="cd-sum-closing">${m.closing}</div>` : '');

export const hasSummary = (m: DocModel) => !!(m.totals.length || m.paymentLink || m.summaryNotes.length);

export const defaultSummary = (ctx: RenderCtx, withClosing = true) => {
  const { m } = ctx;
  if (!hasSummary(m)) return '';
  const side = `${payButton(m)}${summaryNotes(m)}${withClosing ? closingInline(m) : ''}`;
  return block('cd-summary', `<div class="cd-summary-side">${side}</div>${totalsHtml(m.totals)}`);
};

export const visualsBlock = (m: DocModel) =>
  m.visualsHtml ? `<section class="cd-block cd-section cd-visuals" data-split="children"><h3 class="cd-h">Project insights</h3><div class="cd-split cd-visuals-body">${m.visualsHtml}</div></section>` : '';

export const signatureHtml = (s: Signature) => {
  const blank = !s.imageUrl;
  const metaBits = [s.name, s.date].filter(Boolean).join('<span class="cd-dot">·</span>');
  return `<div class="cd-sig${blank ? ' cd-sig-blank' : ''}"><div class="cd-sig-img">${s.imageUrl ? `<img src="${s.imageUrl}" crossorigin="anonymous" alt="">` : ''}</div><div class="cd-sig-line"></div><div class="cd-sig-label">${s.label}</div>${metaBits ? `<div class="cd-sig-meta">${metaBits}</div>` : blank ? '<div class="cd-sig-meta cd-sig-fill">Name &amp; date</div>' : ''}</div>`;
};

export const signaturesBlock = (m: DocModel) => (m.signatures.length ? block('cd-sigs', m.signatures.map(signatureHtml).join('')) : '');

export const closingBlock = (m: DocModel) => (m.closing ? block('cd-closing', `<div class="cd-closing-text">${m.closing}</div>`) : '');

const isShortSection = (s: Section) => plainLength(s.html) < 650 && !/<(img|table|h[1-3])/i.test(s.html);

/** Short notes/terms next to the signatures in one row (saves a lot of vertical space). */
export const signoffBlock = (m: DocModel): string => {
  if (!m.signatures.length || !m.after.length || m.after.length > 3 || m.signatures.length > 2) return '';
  if (!m.after.every(isShortSection) || m.after.reduce((a, s) => a + plainLength(s.html), 0) > 900) return '';
  const notes = m.after.map((s) => `<div class="cd-signoff-sec cd-sec-${s.id}">${s.title ? `<h3 class="cd-h">${s.title}</h3>` : ''}<div class="cd-prose">${s.html}</div></div>`).join('');
  return block('cd-signoff', `<div class="cd-signoff-notes">${notes}</div><div class="cd-signoff-sigs">${m.signatures.map(signatureHtml).join('')}</div>`);
};

export const footerHtml = (m: DocModel) =>
  `<div class="cd-footer"><div class="cd-footer-text">${m.footerLine}</div><div class="cd-pageno"></div></div>`;

export const runHead = (m: DocModel) => `<div class="cd-runhead"><span>${m.runningTitle}</span><span>${m.company.name}</span></div>`;

export const defaultParts = (ctx: RenderCtx, theme: ThemeDef): Parts => {
  const { m } = ctx;
  const signoff = theme.noSignoff ? '' : signoffBlock(m);
  return {
    header: theme.header(ctx),
    parties: theme.parties ? theme.parties(ctx) : defaultParties(ctx, { from: theme.fromParty }),
    subject: subjectBlock(m),
    intro: introBlock(m),
    facts: factsBlock(m),
    tags: tagsBlock(m),
    before: m.before.map((s) => sectionBlock(s, 'cd-before')),
    items: itemsBlock(ctx, theme.fillRows || 0),
    summary: theme.summary ? theme.summary(ctx) : defaultSummary(ctx, !theme.closingBlock),
    visuals: visualsBlock(m),
    after: signoff ? [] : afterSections(m.after, !!theme.sectionsGrid),
    signatures: signoff || signaturesBlock(m),
    // the closing line lives in the totals area unless the theme wants a separate block (or there are no totals)
    closing: theme.closingBlock || !hasSummary(m) ? closingBlock(m) : '',
  };
};

export const defaultCompose = (p: Parts) => [
  p.header, p.parties, p.subject, p.intro, p.facts, p.tags, ...p.before, p.items, p.summary, p.visuals, ...p.after, p.signatures, p.closing,
];

// ---------------------------------------------------------------------------
// base stylesheet (shared by every template; themes add their own rules after it)
// ---------------------------------------------------------------------------
export const baseCss = (ctx: RenderCtx, theme: ThemeDef, fonts: { head: string; body: string }) => {
  const { c, page } = ctx;
  const pad = theme.pad;
  return `
.cd-root{--paper:${c.paper};--ink:${c.ink};--muted:${c.muted};--faint:${c.faint};--rule:${c.rule};--rule-strong:${c.ruleStrong};
--accent:${c.accent};--accent-ink:${c.accentInk};--on-accent:${c.onAccent};--accent-soft:${c.accentSoft};--accent-tint:${c.accentTint};--accent-line:${c.accentLine};
--secondary:${c.secondary};--secondary-ink:${c.secondaryInk};--on-secondary:${c.onSecondary};--secondary-soft:${c.secondarySoft};
--font-head:${fonts.head};--font-body:${fonts.body};--page-w:${page.width}px;--page-h:${page.height}px;
--pt:${pad.top}px;--px:${pad.x}px;--pl:${pad.left ?? pad.x}px;--pb:${pad.bottom}px;--fb:${pad.footer ?? 24}px;
font-family:var(--font-body);color:var(--ink);font-size:12.5px;line-height:1.5;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}
.cd-root *,.cd-root *::before,.cd-root *::after{box-sizing:border-box;}
.cd-root h1,.cd-root h2,.cd-root h3,.cd-root h4,.cd-root p,.cd-root dl,.cd-root dd,.cd-root figure{margin:0;}
.cd-page{position:relative;width:var(--page-w);min-height:var(--page-h);background:var(--paper);margin:0 auto;overflow:hidden;display:flex;flex-direction:column;}
.cd-paged .cd-page{height:var(--page-h);min-height:0;}
.cd-stack .cd-page+.cd-page{margin-top:28px;}
.cd-chrome{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:0;}
.cd-body{position:relative;z-index:1;flex:1 1 auto;display:flex;flex-direction:column;padding:var(--pt) var(--px) var(--pb) var(--pl);}
.cd-block{margin:0 0 20px;flex:none;}
.cd-pin{margin-top:auto;}
.cd-first-only{display:none;} .cd-first .cd-first-only{display:block;}
.cd-cont-only{display:none;} .cd-cont .cd-cont-only{display:block;}
.cd-last-only{display:none;} .cd-last .cd-last-only{display:block;}
.cd-runhead{display:none;} .cd-cont .cd-runhead{display:flex;justify-content:space-between;gap:16px;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding-bottom:8px;border-bottom:1px solid var(--rule);margin-bottom:18px;flex:none;}
.cd-footer{position:absolute;left:var(--pl);right:var(--px);bottom:var(--fb);z-index:2;display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:9px;line-height:1.4;color:var(--muted);}
.cd-footer-text{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.cd-pageno{flex:none;white-space:nowrap;}
.cd-dot{display:inline-block;margin:0 7px;opacity:.6;}
.cd-muted{color:var(--muted);}
.cd-neg{color:#b42318;}
.cd-num{font-variant-numeric:tabular-nums;white-space:nowrap;}
.cd-label{font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
.cd-lines{font-size:11.5px;line-height:1.55;color:var(--muted);overflow-wrap:anywhere;}
.cd-logo{display:block;max-height:64px;max-width:190px;width:auto;height:auto;}
.cd-monogram{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-weight:700;font-size:20px;letter-spacing:.02em;background:var(--accent);color:var(--on-accent);}
.cd-title{font-family:var(--font-head);font-weight:800;line-height:1;letter-spacing:.01em;font-size:var(--title-size,36px);color:var(--accent-ink);}
.cd-title.cd-len-m{font-size:calc(var(--title-size,36px) * .8);}
.cd-title.cd-len-l{font-size:calc(var(--title-size,36px) * .68);}
.cd-docno{font-size:12.5px;margin-top:8px;color:var(--ink);}
.cd-docno-label{color:var(--muted);}
.cd-docno-value{font-weight:700;}
.cd-status{display:inline-block;margin-top:10px;padding:3px 10px;border-radius:999px;border:1.5px solid currentColor;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;line-height:1.4;}
.cd-tone-good{color:#15803d;} .cd-tone-bad{color:#b42318;} .cd-tone-warn{color:#b45309;} .cd-tone-neutral{color:var(--muted);}
.cd-parties{display:flex;gap:28px;align-items:flex-start;}
.cd-party{flex:1 1 0;min-width:0;}
.cd-party-name{font-weight:700;font-size:13.5px;margin-bottom:3px;overflow-wrap:anywhere;}
.cd-party-meta{flex:1.15 1 0;}
.cd-meta{display:block;}
.cd-meta-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:11.5px;border-bottom:1px dotted var(--rule);}
.cd-meta-row:last-child{border-bottom:0;}
.cd-meta-row dt{color:var(--muted);}
.cd-meta-row dd{font-weight:600;text-align:right;overflow-wrap:anywhere;min-width:0;}
.cd-subject-text{font-family:var(--font-head);font-size:16px;font-weight:700;color:var(--ink);}
.cd-intro p{font-size:13.5px;line-height:1.7;}
.cd-facts{display:flex;gap:12px;}
.cd-fact{flex:1 1 0;min-width:0;border:1px solid var(--rule);border-radius:8px;padding:10px 14px;background:var(--accent-soft);}
.cd-fact-label{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.cd-fact-value{font-family:var(--font-head);font-size:18px;font-weight:700;color:var(--accent-ink);margin-top:4px;overflow-wrap:anywhere;line-height:1.25;}
.cd-fact-sub{font-size:10.5px;color:var(--muted);margin-top:2px;}
.cd-block.cd-tags{margin-top:-8px;margin-bottom:14px;}
.cd-tag{display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent-ink);font-size:10px;font-weight:600;}
.cd-table{width:100%;border-collapse:collapse;table-layout:fixed;}
.cd-table th{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:9px 10px;text-align:left;vertical-align:bottom;}
.cd-table td{padding:9px 10px;vertical-align:top;border-bottom:1px solid var(--rule);font-size:12px;}
.cd-table .cd-r{text-align:right;} .cd-table .cd-c{text-align:center;}
.cd-item-name{overflow-wrap:anywhere;}
.cd-item-sub{margin:4px 0 0;padding-left:16px;font-size:10.5px;color:var(--muted);}
.cd-item-sub li{margin:1px 0;}
.cd-row-empty td{text-align:center;color:var(--muted);font-style:italic;padding:18px 10px;}
.cd-summary{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;}
.cd-summary-side{flex:1 1 auto;min-width:0;}
.cd-totals{flex:0 0 290px;}
.cd-tot{display:flex;justify-content:space-between;gap:16px;padding:5px 2px;font-size:12px;}
.cd-tot-label{color:var(--muted);}
.cd-tot-value{font-weight:600;}
.cd-tot-grand{margin-top:6px;padding:10px 12px;font-size:15px;font-weight:800;background:var(--accent);color:var(--on-accent);border-radius:4px;}
.cd-tot-grand .cd-tot-label{color:inherit;}
.cd-tot-grand .cd-tot-value{font-weight:800;}
.cd-tot-muted{font-size:11.5px;}
.cd-tot-balance{font-weight:800;font-size:13.5px;border-top:1.5px solid var(--ink);margin-top:4px;padding-top:8px;}
.cd-tot-balance .cd-tot-label{color:var(--ink);}
.cd-pay{margin-bottom:14px;}
.cd-pay-btn{display:inline-block;padding:9px 18px;border-radius:6px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:12px;text-decoration:none;}
.cd-pay-url{font-size:9px;color:var(--muted);margin-top:5px;overflow-wrap:anywhere;}
.cd-sum-note{margin-bottom:12px;font-size:11.5px;}
.cd-sum-closing{font-family:var(--font-head);font-size:13.5px;font-weight:700;color:var(--accent-ink);margin-top:4px;}
.cd-signoff{display:flex;gap:40px;align-items:flex-start;}
.cd-signoff-notes{flex:1 1 0;min-width:0;}
.cd-signoff-sec+.cd-signoff-sec{margin-top:14px;}
.cd-signoff-sigs{flex:0 0 250px;display:flex;flex-direction:column;gap:12px;}
.cd-signoff-sigs .cd-sig{max-width:none;flex:none;}
.cd-mini{border-collapse:collapse;width:100%;max-width:330px;}
.cd-mini td{padding:3px 0;border-bottom:1px dotted var(--rule);font-size:11px;}
.cd-mini td+td{text-align:right;font-weight:600;white-space:nowrap;}
.cd-h{font-family:var(--font-head);font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-ink);margin:0 0 8px;}
.cd-grid2{display:flex;gap:32px;}
.cd-grid-cell{flex:1 1 0;min-width:0;}
.cd-prose{font-size:12px;line-height:1.6;overflow-wrap:anywhere;}
.cd-prose>*:first-child{margin-top:0;}
.cd-prose h1{font-family:var(--font-head);font-size:20px;line-height:1.25;margin:14px 0 6px;}
.cd-prose h2{font-family:var(--font-head);font-size:17px;line-height:1.3;margin:14px 0 6px;color:var(--accent-ink);}
.cd-prose h3{font-family:var(--font-head);font-size:13.5px;line-height:1.35;margin:14px 0 5px;color:var(--accent-ink);}
.cd-prose h4,.cd-prose h5,.cd-prose h6{font-size:12.5px;margin:10px 0 4px;}
.cd-prose p{margin:0 0 8px;}
.cd-prose ul,.cd-prose ol{margin:0 0 8px;padding-left:20px;}
.cd-prose li{margin:2px 0;}
.cd-prose li[data-cont]{list-style-type:none;}
.cd-line{min-height:1em;}
.cd-prose img{max-width:100%;height:auto;border-radius:4px;margin:6px 0;display:inline-block;}
.cd-prose table{width:100%;border-collapse:collapse;margin:8px 0;}
.cd-prose th,.cd-prose td{border:1px solid var(--rule-strong);padding:5px 8px;text-align:left;vertical-align:top;font-size:11.5px;}
.cd-prose th{background:var(--accent-soft);}
.cd-prose blockquote{border-left:3px solid var(--accent);padding:2px 0 2px 12px;margin:8px 0;color:var(--muted);}
.cd-prose hr{border:0;border-top:1px solid var(--rule);margin:12px 0;}
.cd-prose mark{background:#fff1a8;padding:0 2px;}
.cd-prose a{color:var(--accent-ink);}
.cd-prose pre,.cd-prose code{font-family:'Space Mono','Courier New',monospace;font-size:11px;white-space:pre-wrap;}
.cd-sigs{display:flex;gap:40px;flex-wrap:wrap;}
.cd-sig{flex:1 1 220px;max-width:320px;min-width:0;}
.cd-sig-img{height:48px;display:flex;align-items:flex-end;}
.cd-sig-img img{display:block;max-height:46px;max-width:230px;width:auto;height:auto;}
.cd-sig-line{border-top:1px solid var(--ink);margin-top:4px;}
.cd-sig-label{font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-top:6px;}
.cd-sig-meta{font-size:11px;margin-top:2px;}
.cd-sig-fill{color:var(--faint);}
.cd-closing-text{font-family:var(--font-head);font-size:14px;font-weight:700;color:var(--accent-ink);}
.cd-visuals-body{display:block;}
.cd-widget{border:1px solid var(--rule);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
.cd-w-title{font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:8px;}
.cd-w-subtitle{font-size:10px;font-weight:700;margin:8px 0 4px;}
.cd-w-metrics{display:flex;flex-wrap:wrap;gap:10px;}
.cd-w-metric{flex:1 1 120px;background:var(--accent-soft);border-radius:6px;padding:10px 12px;}
.cd-w-metric-value{font-family:var(--font-head);font-size:17px;font-weight:800;color:var(--accent-ink);overflow-wrap:anywhere;}
.cd-w-metric-label{font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:700;}
.cd-bar{height:8px;background:var(--rule);border-radius:999px;overflow:hidden;}
.cd-bar-fill{height:8px;border-radius:999px;}
.cd-w-progress{margin:6px 0 10px;}
.cd-w-progress-head{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;}
.cd-w-sub{font-size:10.5px;color:var(--muted);margin-top:3px;}
.cd-w-chart-row{display:flex;align-items:center;gap:10px;margin:5px 0;font-size:11px;}
.cd-w-chart-label{flex:0 0 32%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cd-w-chart-bar{flex:1 1 auto;}
.cd-w-chart-value{flex:0 0 auto;min-width:64px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;}
.cd-w-foot{font-size:11px;margin-top:6px;text-align:right;}
.cd-w-kv{display:flex;flex-wrap:wrap;gap:8px 24px;}
.cd-w-kv-item{min-width:120px;}
.cd-w-kv-label{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
.cd-w-kv-value{font-size:12px;font-weight:600;}
.cd-w-table{width:100%;border-collapse:collapse;}
.cd-w-table th{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);text-align:left;padding:4px 6px;border-bottom:1px solid var(--rule-strong);}
.cd-w-table td{font-size:11px;padding:5px 6px;border-bottom:1px solid var(--rule);vertical-align:top;}
.cd-w-timeline{list-style:none;margin:0;padding:0;}
.cd-w-step{display:flex;align-items:center;gap:10px;padding:4px 0;font-size:11.5px;}
.cd-w-dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--accent);flex:none;}
.cd-w-step--completed .cd-w-dot{background:var(--accent);}
.cd-w-step-name{flex:1 1 auto;}
.cd-w-step-date{color:var(--muted);font-size:10.5px;}
.cd-pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border:1px solid currentColor;}
.cd-w-photos{display:flex;gap:10px;}
.cd-w-photo{flex:1 1 0;}
.cd-w-photo img{width:100%;height:auto;border-radius:6px;display:block;}
.cd-w-photo figcaption{font-size:10px;color:var(--muted);margin-top:3px;text-transform:uppercase;letter-spacing:.08em;}
.cd-w-swatches{display:flex;flex-wrap:wrap;gap:12px;}
.cd-w-swatch{display:flex;gap:8px;align-items:center;min-width:150px;}
.cd-w-chip{width:28px;height:28px;border-radius:6px;border:1px solid var(--rule);flex:none;}
.cd-w-swatch-name{font-size:11.5px;font-weight:600;}
`;
};
