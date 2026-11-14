/**
 * Customization of the Premium designs (beyond colors): font pairing, header layout, logo size, table style,
 * density and which sections are printed. Saved per document as `data.designOptions` and as part of the user's
 * default design (lib/designAccess.ts). Every field is optional; a missing field means "the design's own choice",
 * so documents without customization render exactly as the design was drawn. Basic designs ignore these options.
 *
 * Pure module (no DOM, no network): used by the renderer, the picker and the QA scripts.
 */
import type { DocumentDesignOptions } from '../../types.ts';
import type { FontKey } from './registry.ts';

export type DesignOptions = DocumentDesignOptions;
export type FontPairId = Exclude<NonNullable<DesignOptions['fonts']>, 'design'>;
export type HeaderLayout = Exclude<NonNullable<DesignOptions['header']>, 'design'>;
export type TableStyle = Exclude<NonNullable<DesignOptions['table']>, 'design'>;
export type LogoSize = NonNullable<DesignOptions['logoSize']>;
export type Density = NonNullable<DesignOptions['density']>;
export type HideKey = NonNullable<DesignOptions['hide']>[number];

/** Professional font pairings (heading / text), all with tabular figures for amounts. */
export const FONT_PAIRS: Record<FontPairId, { label: string; hint: string; head: FontKey; body: FontKey }> = {
  classic: { label: 'Classic', hint: 'Baskerville headings, Source Sans text', head: 'libre-baskerville', body: 'source-sans' },
  modern: { label: 'Modern', hint: 'Inter throughout', head: 'inter', body: 'inter' },
  industrial: { label: 'Industrial', hint: 'Condensed Barlow headings', head: 'barlow-condensed', body: 'barlow' },
  slab: { label: 'Sturdy', hint: 'Slab-serif headings, Source Sans text', head: 'roboto-slab', body: 'source-sans' },
  technical: { label: 'Technical', hint: 'IBM Plex, drawing-sheet feel', head: 'ibm-plex-sans', body: 'ibm-plex-sans' },
};

export const HEADER_LAYOUTS: Array<{ id: HeaderLayout; label: string }> = [
  { id: 'left', label: 'Logo left' },
  { id: 'centered', label: 'Centered' },
  { id: 'band', label: 'Color band' },
];
export const TABLE_STYLES: Array<{ id: TableStyle; label: string }> = [
  { id: 'lines', label: 'Lines' },
  { id: 'striped', label: 'Striped' },
  { id: 'boxed', label: 'Boxed' },
];
export const LOGO_SIZES: Array<{ id: LogoSize; label: string }> = [
  { id: 's', label: 'Small' },
  { id: 'm', label: 'Medium' },
  { id: 'l', label: 'Large' },
];
export const DENSITIES: Array<{ id: Density; label: string }> = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
];
/** Sections a user can leave out of the PDF. */
export const HIDE_OPTIONS: Array<{ id: HideKey; label: string; hint: string }> = [
  { id: 'signatures', label: 'Signature block', hint: 'Signature lines and signatures' },
  { id: 'payment', label: 'Pay now & QR code', hint: 'Pay button, QR code and financing note' },
  { id: 'terms', label: 'Terms', hint: 'Terms, conditions and exclusions' },
  { id: 'notes', label: 'Notes', hint: 'Notes to the client or vendor' },
  { id: 'photos', label: 'Photos', hint: 'Pictures in report text and AI photo panels' },
];

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

const FONT_IDS = ['design', ...Object.keys(FONT_PAIRS)] as Array<NonNullable<DesignOptions['fonts']>>;
const HEADER_IDS = ['design', 'left', 'centered', 'band'] as const;
const TABLE_IDS = ['design', 'lines', 'striped', 'boxed'] as const;
const LOGO_IDS = ['s', 'm', 'l'] as const;
const DENSITY_IDS = ['comfortable', 'compact'] as const;
const HIDE_IDS = HIDE_OPTIONS.map((h) => h.id);

/**
 * Cleans stored/typed options: unknown keys and values are dropped, 'design' values are dropped (they mean
 * "the design's own choice"). Returns null when nothing is customized.
 */
export const normalizeDesignOptions = (raw: unknown): DesignOptions | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: DesignOptions = {};
  const fonts = pick(r.fonts, FONT_IDS);
  if (fonts && fonts !== 'design') out.fonts = fonts;
  const header = pick(r.header, HEADER_IDS);
  if (header && header !== 'design') out.header = header;
  const table = pick(r.table, TABLE_IDS);
  if (table && table !== 'design') out.table = table;
  const logoSize = pick(r.logoSize, LOGO_IDS);
  if (logoSize) out.logoSize = logoSize;
  const density = pick(r.density, DENSITY_IDS);
  if (density) out.density = density;
  if (Array.isArray(r.hide)) {
    const hide = HIDE_IDS.filter((id) => (r.hide as unknown[]).includes(id));
    if (hide.length) out.hide = hide;
  }
  return Object.keys(out).length ? out : null;
};

/** Defaults a Premium design draws with (its own layout). */
export interface DesignLayoutDefaults {
  header: HeaderLayout;
  table: TableStyle;
  logoSize: LogoSize;
  density: Density;
}

export interface ResolvedDesignOptions extends DesignLayoutDefaults {
  /** null = the design's own fonts */
  fonts: FontPairId | null;
  hide: Set<HideKey>;
  /** true when any option differs from the design's own layout */
  customized: boolean;
}

export const resolveDesignOptions = (raw: unknown, defaults: DesignLayoutDefaults): ResolvedDesignOptions => {
  const o = normalizeDesignOptions(raw) || {};
  return {
    header: (o.header as HeaderLayout | undefined) || defaults.header,
    table: (o.table as TableStyle | undefined) || defaults.table,
    logoSize: o.logoSize || defaults.logoSize,
    density: o.density || defaults.density,
    fonts: (o.fonts as FontPairId | undefined) || null,
    hide: new Set(o.hide || []),
    customized: Object.keys(o).length > 0,
  };
};

/** Same options? (order of `hide` does not matter; 'design' values equal missing ones) */
export const sameDesignOptions = (a: unknown, b: unknown): boolean => {
  const x = normalizeDesignOptions(a) || {};
  const y = normalizeDesignOptions(b) || {};
  const keys: Array<keyof DesignOptions> = ['fonts', 'header', 'table', 'logoSize', 'density'];
  if (keys.some((k) => x[k] !== y[k])) return false;
  const hx = [...(x.hide || [])].sort().join(',');
  const hy = [...(y.hide || [])].sort().join(',');
  return hx === hy;
};

/**
 * Options kept when the user switches to another Premium design: what to print (sections, density, logo size)
 * carries over; the layout choices that make a design what it is (header, table, fonts) start fresh.
 */
export const carryOverOptions = (raw: unknown): DesignOptions | null => {
  const o = normalizeDesignOptions(raw);
  if (!o) return null;
  const { header: _h, table: _t, fonts: _f, ...rest } = o;
  return normalizeDesignOptions(rest);
};
