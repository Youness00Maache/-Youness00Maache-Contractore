/**
 * Engine of the Premium designs (owner feedback 2026-11-14: professional documents a plumber, electrician, roofer,
 * remodeler or GC would send, customizable beyond colors).
 *
 * Every Premium design is a `ProSpec`: its own typography, rules and page decoration (css + chrome), plus the layout
 * it draws by default (header, table style, logo size, spacing). The engine builds the shared structure, so the
 * user's customization (utils/templates/designOptions.ts, `ctx.o`) works the same in every Premium design:
 *
 *   header  `cd-o-h-left | centered | band`   brand + document block, laid out three ways
 *   table   `cd-o-t-lines | striped | boxed`
 *   logo    `cd-o-l-s | m | l`
 *   density `cd-o-d-comfortable | compact`
 *   fonts   a pairing replaces the design's fonts (`cd-o-f`)
 *   hide    sections removed from the model by render.ts
 *
 * CSS contract (so options always win over a design's look):
 *   - the engine's defaults live on `.cd-pro` (1 class); a design sets its variables on `.cd-t-<id>` (1 class, later);
 *   - option rules use `.cd-root.cd-o-…` (2 classes) and beat both; a design may tune an option with
 *     `.cd-t-<id>.cd-o-…` (2 classes, later);
 *   - designs never set table cell borders/backgrounds directly: they set the --pr-* variables below.
 *
 * All structure comes from blocks.ts (pagination contract, empty sections never printed).
 */
import {
  block, lines, logoImg, metaList, partyBlocks, statusBadge, titleH1,
  type DesignDef, type RenderCtx, type ThemeDef,
} from '../blocks.ts';
import type { TemplateMeta } from '../registry.ts';
import type { DesignLayoutDefaults, HeaderLayout } from '../designOptions.ts';
import type { DocModel } from '../model.ts';

export interface ProSpec {
  meta: Omit<TemplateMeta, 'tier' | 'collection'>;
  /** the layout the design draws when the user did not customize it */
  layout: DesignLayoutDefaults;
  pad?: Partial<ThemeDef['pad']>;
  ink?: string;
  /** width of a left column drawn by `chrome` (two-tone designs); the content starts after it */
  side?: number;
  chrome?(ctx: RenderCtx): string;
  /** brand part of the header (null = engine; '' = none, e.g. the brand lives in the sidebar) */
  brand?(ctx: RenderCtx, layout: HeaderLayout): string | null;
  /** document part of the header (null = engine) */
  doc?(ctx: RenderCtx, layout: HeaderLayout): string | null;
  /** whole header for a layout (null = engine) */
  header?(ctx: RenderCtx, layout: HeaderLayout): string | null;
  /** parties row (null = engine) */
  parties?(ctx: RenderCtx): string | null;
  /** key figure box ("Amount due") in the parties row; default true */
  due?: boolean;
  /** details (dates, project…) column in the parties row; default true */
  details?: boolean;
  /** company as the first party ('From' or the given label) */
  fromParty?: boolean | ((m: DocModel) => string);
  /** design styles, scoped with `.cd-t-<id>` */
  css(ctx: RenderCtx): string;
  sectionsGrid?: boolean;
  closingBlock?: boolean;
  noSignoff?: boolean;
}

// ---------------------------------------------------------------------------------------------- pieces
export const proLogo = (m: DocModel, tile = false) => (m.company.logoUrl ? `<div class="pr-logo${tile ? ' pr-logo-tile' : ''}">${logoImg(m)}</div>` : '');

/** "phone · email · website" (one line) */
export const contactLine = (m: DocModel) => [m.company.phone, m.company.email, m.company.website].filter(Boolean).join('<span class="cd-dot">·</span>');

/** Company block of the header. Without a logo the company name is the wordmark. */
export const proBrand = (ctx: RenderCtx, layout: HeaderLayout, opts: { lines?: string[] } = {}) => {
  const { m } = ctx;
  const contact = opts.lines ?? (layout === 'centered'
    ? [m.company.addressLines.join(', '), contactLine(m)].filter(Boolean)
    : m.company.compactLines);
  const inner = `${proLogo(m, layout === 'band')}${m.company.name ? `<div class="pr-co">${m.company.name}</div>` : ''}${m.company.tagline ? `<div class="pr-tag">${m.company.tagline}</div>` : ''}${lines(contact, 'cd-lines pr-co-lines')}`;
  return inner ? `<div class="pr-brand">${inner}</div>` : '';
};

export const proDocNo = (m: DocModel) =>
  (m.number ? `<div class="cd-docno pr-docno"><span class="cd-docno-label">${m.numberLabel}</span> <span class="cd-docno-value">${m.number}</span></div>` : '');

/** Document block of the header: title, number, status. */
export const proDoc = (ctx: RenderCtx, layout: HeaderLayout) => {
  const { m } = ctx;
  const title = layout === 'centered'
    ? `<div class="pr-titlerow"><span class="pr-tb-rule"></span>${titleH1(m)}<span class="pr-tb-rule"></span></div>`
    : titleH1(m);
  return `<div class="pr-doc">${title}${proDocNo(m)}${statusBadge(m)}</div>`;
};

/** Key figure of the document (amount due, estimate total, total hours…). */
export const dueBox = (m: DocModel, cls = 'pr-due') => {
  if (!m.highlight) return '';
  const sub = m.keyDate && m.keyDate.label !== m.highlight.label ? `<div class="pr-due-sub">${m.keyDate.label} ${m.keyDate.value}</div>` : '';
  return `<div class="${cls}"><div class="pr-due-label">${m.highlight.label}</div><div class="pr-due-value cd-num">${m.highlight.value}</div>${sub}</div>`;
};

export const detailsCol = (m: DocModel, title = 'Details') =>
  (m.meta.length ? `<div class="cd-party cd-party-meta"><div class="cd-label">${title}</div>${metaList(m)}</div>` : '');

export const fromPartyHtml = (m: DocModel, label: string) =>
  (m.company.name || m.company.lines.length
    ? `<div class="cd-party cd-party-from"><div class="cd-label">${label}</div>${m.company.name ? `<div class="cd-party-name">${m.company.name}</div>` : ''}${lines(m.company.compactLines)}</div>`
    : '');

// ----------------------------------------------------------------------------------------------- engine CSS
const ENGINE_CSS = `
.cd-pro{font-size:var(--pr-fs);--pr-fs:12.5px;--pr-td-fs:12px;--pr-gap:22px;--pr-cell-y:9px;--pr-cell-x:10px;--pr-side:0px;
--pr-band:var(--accent);--pr-on-band:var(--on-accent);--pr-logo-h:58px;--pr-logo-w:200px;--font-label:var(--font-body);
--pr-th-size:9.5px;--pr-th-track:.08em;--pr-th-case:uppercase;--pr-th-weight:700;--pr-th-ink:var(--ink);
--pr-th-rule:1.5px solid var(--ink);--pr-th-top:0 solid transparent;--pr-row-rule:var(--rule);
--pr-th-bg:var(--accent);--pr-th-on:var(--on-accent);--pr-stripe:var(--accent-soft);
--pr-box:var(--rule-strong);--pr-box-th:var(--accent-soft);--pr-box-th-ink:var(--ink);--title-size:32px;}
.cd-root.cd-o-l-s{--pr-logo-h:40px;--pr-logo-w:150px;}
.cd-root.cd-o-l-m{--pr-logo-h:58px;--pr-logo-w:200px;}
.cd-root.cd-o-l-l{--pr-logo-h:86px;--pr-logo-w:270px;}
.cd-root.cd-o-d-compact{--pr-fs:11.5px;--pr-td-fs:11px;--pr-gap:14px;--pr-cell-y:5px;--pr-cell-x:8px;}
.cd-root.cd-o-f{--font-label:var(--font-body);}
.cd-pro .cd-block{margin-bottom:var(--pr-gap);}
.cd-pro .cd-label{font-family:var(--font-label);}
.cd-pro .pr-logo .cd-logo{max-height:var(--pr-logo-h);max-width:var(--pr-logo-w);}
.cd-pro .pr-logo{margin-bottom:10px;}
.cd-pro .pr-logo-tile{display:inline-block;background:#ffffff;border-radius:6px;padding:8px 10px;}
.cd-pro .pr-brand{min-width:0;}
.cd-pro .pr-co{font-family:var(--font-head);font-weight:700;font-size:17px;line-height:1.2;color:var(--ink);overflow-wrap:anywhere;}
.cd-pro .pr-tag{font-size:10.5px;color:var(--muted);margin-top:2px;}
.cd-pro .pr-co-lines{font-size:10.5px;line-height:1.55;margin-top:5px;}
.cd-pro .pr-doc{min-width:0;}
.cd-pro .pr-docno{margin-top:8px;}
.cd-pro .pr-doc .cd-status{margin-top:8px;}
.cd-pro .pr-titlerow{display:flex;align-items:center;gap:16px;}
.cd-pro .pr-tb-rule{flex:1 1 0;height:0;border-top:1px solid var(--rule-strong);}
/* header: logo left */
.cd-root.cd-o-h-left .pr-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;}
.cd-root.cd-o-h-left .pr-brand{flex:1 1 auto;max-width:58%;}
.cd-root.cd-o-h-left .pr-doc{flex:none;max-width:44%;text-align:right;}
/* header: centered */
.cd-root.cd-o-h-centered .pr-hdr{text-align:center;}
.cd-root.cd-o-h-centered .pr-logo .cd-logo{margin:0 auto;}
.cd-root.cd-o-h-centered .pr-doc{margin-top:18px;}
.cd-root.cd-o-h-centered .pr-titlerow .cd-title{flex:none;}
/* header: color band (full width, top of the first page) */
.cd-root.cd-o-h-band .pr-hdr{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;
margin:calc(-1 * var(--pt)) calc(-1 * var(--px)) var(--pr-gap) calc(var(--pr-side) - var(--pl));
padding:calc(var(--pt) - 8px) var(--px) 24px calc(var(--pl) - var(--pr-side));background:var(--pr-band);color:var(--pr-on-band);}
.cd-root.cd-o-h-band .pr-brand{flex:1 1 auto;max-width:58%;}
.cd-root.cd-o-h-band .pr-doc{flex:none;max-width:44%;text-align:right;}
.cd-root.cd-o-h-band .pr-co,.cd-root.cd-o-h-band .cd-title,.cd-root.cd-o-h-band .cd-docno,.cd-root.cd-o-h-band .cd-docno-label,
.cd-root.cd-o-h-band .pr-co-lines,.cd-root.cd-o-h-band .pr-tag,.cd-root.cd-o-h-band .pr-hdr .cd-status{color:var(--pr-on-band);}
.cd-root.cd-o-h-band .pr-co-lines,.cd-root.cd-o-h-band .pr-tag,.cd-root.cd-o-h-band .cd-docno-label{opacity:.85;}
/* parties row */
.cd-pro .pr-parties{display:flex;gap:26px;align-items:flex-start;}
.cd-pro .pr-due{flex:0 0 auto;min-width:170px;max-width:38%;text-align:right;padding:10px 14px;background:var(--accent-soft);border-left:3px solid var(--accent);}
.cd-pro .pr-due-label{font-family:var(--font-label);font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.cd-pro .pr-due-value{font-family:var(--font-head);font-size:21px;font-weight:700;line-height:1.2;color:var(--accent-ink);margin-top:3px;overflow-wrap:anywhere;white-space:normal;}
.cd-pro .pr-due-sub{font-size:10px;color:var(--muted);margin-top:3px;}
/* table */
.cd-pro .cd-table th{font-family:var(--font-label);font-size:var(--pr-th-size);letter-spacing:var(--pr-th-track);text-transform:var(--pr-th-case);font-weight:var(--pr-th-weight);padding:var(--pr-cell-y) var(--pr-cell-x);}
.cd-pro .cd-table td{font-size:var(--pr-td-fs);padding:var(--pr-cell-y) var(--pr-cell-x);}
.cd-root.cd-o-t-lines .cd-table th{color:var(--pr-th-ink);background:transparent;border-top:var(--pr-th-top);border-bottom:var(--pr-th-rule);}
.cd-root.cd-o-t-lines .cd-table td{border-bottom:1px solid var(--pr-row-rule);background:transparent;}
.cd-root.cd-o-t-striped .cd-table th{background:var(--pr-th-bg);color:var(--pr-th-on);border:0;}
.cd-root.cd-o-t-striped .cd-table td{border-bottom:0;}
.cd-root.cd-o-t-striped .cd-table tbody tr:nth-child(even) td{background:var(--pr-stripe);}
.cd-root.cd-o-t-striped .cd-table tbody tr:last-child td{border-bottom:1px solid var(--rule);}
.cd-root.cd-o-t-boxed .cd-table{border:1px solid var(--pr-box);}
.cd-root.cd-o-t-boxed .cd-table th{background:var(--pr-box-th);color:var(--pr-box-th-ink);border:1px solid var(--pr-box);}
.cd-root.cd-o-t-boxed .cd-table td{border:1px solid var(--pr-box);background:transparent;}
.cd-pro .cd-row-empty td{border-bottom:1px solid var(--rule);}
/* totals and summary */
.cd-pro .cd-tot{padding:4px 2px;}
.cd-root.cd-o-d-compact .cd-tot{padding:2px 2px;}
.cd-root.cd-o-d-compact .cd-tot-grand{padding:7px 10px;margin-top:4px;}
.cd-root.cd-o-d-compact .pr-hdr{gap:20px;}
.cd-root.cd-o-d-compact .cd-sig-img{height:40px;}
.cd-root.cd-o-d-compact .cd-fact{padding:7px 10px;}
.cd-root.cd-o-d-compact .cd-fact-value{font-size:15px;}
.cd-root.cd-o-d-compact .pr-due{padding:7px 12px;}
.cd-root.cd-o-d-compact .pr-due-value{font-size:18px;}
.cd-pro .cd-h{font-family:var(--font-label);}
`;

// ----------------------------------------------------------------------------------------------- builder
export const proDesign = (spec: ProSpec): DesignDef => {
  const id = spec.meta.id;
  const x = spec.pad?.x ?? 54;
  const pad: ThemeDef['pad'] = {
    top: 50, x, bottom: 66, footer: 26,
    ...spec.pad,
    ...(spec.side ? { left: spec.side + (spec.pad?.left ?? 38) } : {}),
  };
  const theme: ThemeDef = {
    id,
    pad,
    ink: spec.ink,
    layout: spec.layout,
    sectionsGrid: spec.sectionsGrid ?? true,
    closingBlock: spec.closingBlock,
    noSignoff: spec.noSignoff,
    chrome: spec.chrome,
    header: (ctx) => {
      const L = ctx.o?.header || spec.layout.header;
      const custom = spec.header ? spec.header(ctx, L) : null;
      if (custom !== null && custom !== undefined) return custom;
      const brandCustom = spec.brand ? spec.brand(ctx, L) : null;
      const brand = brandCustom ?? proBrand(ctx, L);
      const docCustom = spec.doc ? spec.doc(ctx, L) : null;
      const doc = docCustom ?? proDoc(ctx, L);
      return block('cd-hdr pr-hdr', `${brand}${doc}`);
    },
    parties: (ctx) => {
      const custom = spec.parties ? spec.parties(ctx) : null;
      if (custom !== null && custom !== undefined) return custom;
      const { m } = ctx;
      const from = spec.fromParty ? fromPartyHtml(m, typeof spec.fromParty === 'function' ? spec.fromParty(m) : 'From') : '';
      const cols = `${from}${partyBlocks(m)}${spec.details === false ? '' : detailsCol(m)}${spec.due === false ? '' : dueBox(m)}`;
      return cols ? block('cd-parties pr-parties', cols) : '';
    },
    css: (ctx) => ENGINE_CSS + (spec.side ? `.cd-t-${id}{--pr-side:${spec.side}px;}` : '') + spec.css(ctx),
  };
  return { meta: { ...spec.meta, collection: 'new' }, theme };
};
