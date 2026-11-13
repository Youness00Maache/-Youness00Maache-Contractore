/**
 * Template registry: the list of document designs, their default palettes and fonts, the user-selectable
 * fonts, and the mapping from every template id that was ever saved in a document to a current design.
 */

export type TemplateId =
  | 'classic' | 'modern' | 'corporate' | 'spectrum' | 'statement' | 'executive' | 'ledger'
  | 'elegant' | 'bold' | 'friendly' | 'boutique' | 'construction' | 'coastal';

export type FontKey =
  | 'inter' | 'helvetica' | 'montserrat' | 'poppins' | 'oswald' | 'roboto' | 'league-spartan' | 'josefin'
  | 'lora' | 'fraunces' | 'playfair' | 'dm-serif' | 'merriweather' | 'source-sans' | 'georgia' | 'nunito' | 'space-mono';

export interface FontDef {
  label: string;
  stack: string;
  /** Google Fonts css2 family spec (without "family="); omitted for system fonts. */
  google?: string;
}

export const FONTS: Record<FontKey, FontDef> = {
  inter: { label: 'Inter', stack: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", google: 'Inter:wght@400;500;600;700;800;900' },
  helvetica: { label: 'Helvetica / Arial', stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  montserrat: { label: 'Montserrat', stack: "'Montserrat', 'Helvetica Neue', Arial, sans-serif", google: 'Montserrat:wght@400;500;600;700;800;900' },
  poppins: { label: 'Poppins', stack: "'Poppins', 'Helvetica Neue', Arial, sans-serif", google: 'Poppins:wght@400;500;600;700;800' },
  oswald: { label: 'Oswald', stack: "'Oswald', 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif", google: 'Oswald:wght@400;500;600;700' },
  roboto: { label: 'Roboto', stack: "'Roboto', 'Helvetica Neue', Arial, sans-serif", google: 'Roboto:wght@400;500;700' },
  'league-spartan': { label: 'League Spartan', stack: "'League Spartan', 'Montserrat', 'Arial Black', Arial, sans-serif", google: 'League+Spartan:wght@400;600;700;800;900' },
  josefin: { label: 'Josefin Sans', stack: "'Josefin Sans', 'Century Gothic', 'Futura', Arial, sans-serif", google: 'Josefin+Sans:wght@400;600;700' },
  lora: { label: 'Lora', stack: "'Lora', Georgia, 'Times New Roman', serif", google: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400' },
  fraunces: { label: 'Fraunces', stack: "'Fraunces', 'Lora', Georgia, serif", google: 'Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700' },
  playfair: { label: 'Playfair Display', stack: "'Playfair Display', Georgia, 'Times New Roman', serif", google: 'Playfair+Display:wght@400;600;700;800' },
  'dm-serif': { label: 'DM Serif Display', stack: "'DM Serif Display', 'Playfair Display', Georgia, serif", google: 'DM+Serif+Display' },
  merriweather: { label: 'Merriweather', stack: "'Merriweather', Georgia, 'Times New Roman', serif", google: 'Merriweather:wght@400;700;900' },
  'source-sans': { label: 'Source Sans 3', stack: "'Source Sans 3', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", google: 'Source+Sans+3:wght@400;600;700' },
  georgia: { label: 'Georgia', stack: "Georgia, 'Times New Roman', Times, serif" },
  nunito: { label: 'Nunito', stack: "'Nunito', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif", google: 'Nunito:wght@400;500;600;700;800' },
  'space-mono': { label: 'Space Mono', stack: "'Space Mono', 'Courier New', Courier, monospace", google: 'Space+Mono:wght@400;700' },
};

/** Fonts a user can pick in the template selector ('template' = the design's own pairing). */
export const FONT_OPTIONS: Array<{ id: 'template' | FontKey; label: string }> = [
  { id: 'template', label: 'Template default' },
  { id: 'inter', label: 'Inter (clean sans)' },
  { id: 'helvetica', label: 'Helvetica / Arial' },
  { id: 'montserrat', label: 'Montserrat (geometric)' },
  { id: 'poppins', label: 'Poppins (friendly geometric)' },
  { id: 'source-sans', label: 'Source Sans (neutral)' },
  { id: 'nunito', label: 'Nunito (rounded)' },
  { id: 'lora', label: 'Lora (book serif)' },
  { id: 'merriweather', label: 'Merriweather (sturdy serif)' },
  { id: 'playfair', label: 'Playfair Display (display serif)' },
  { id: 'georgia', label: 'Georgia (classic serif)' },
  { id: 'space-mono', label: 'Space Mono (typewriter)' },
];

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
  /** Default palette: accent drives headings/fills, secondary is the supporting color. */
  accent: string;
  secondary: string;
  /** Page background. */
  paper: string;
  headFont: FontKey;
  bodyFont: FontKey;
  tags: string[];
}

export const TEMPLATES: TemplateMeta[] = [
  { id: 'classic', name: 'Classic Professional', description: 'Balanced, conventional business layout with a crisp accent bar. Safe for any client.', accent: '#1f3a5f', secondary: '#c9a227', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['default', 'professional', 'clean'] },
  { id: 'modern', name: 'Modern Minimal', description: 'Oversized title, hairline frame and generous white space. Studio-quality minimalism.', accent: '#111111', secondary: '#8b8bd8', paper: '#fffdf8', headFont: 'inter', bodyFont: 'inter', tags: ['minimal', 'modern', 'swiss'] },
  { id: 'corporate', name: 'Corporate Blue', description: 'Centered brand, label chips and a confident blue table with warm hairlines.', accent: '#2d4a9a', secondary: '#ee8a5e', paper: '#ffffff', headFont: 'fraunces', bodyFont: 'lora', tags: ['corporate', 'blue', 'friendly'] },
  { id: 'spectrum', name: 'Spectrum Edge', description: 'A soft gradient edge and bold uppercase type. Creative but still all business.', accent: '#111111', secondary: '#f29a6b', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['gradient', 'creative', 'modern'] },
  { id: 'statement', name: 'Bold Statement', description: 'Heavy display title, black grid table and soft color glows in the corners.', accent: '#111111', secondary: '#f2994a', paper: '#ffffff', headFont: 'league-spartan', bodyFont: 'josefin', tags: ['bold', 'black', 'creative'] },
  { id: 'executive', name: 'Executive Slate', description: 'Dark slate brand block, tall condensed headings and a footer contact bar.', accent: '#263238', secondary: '#90a4ae', paper: '#ffffff', headFont: 'oswald', bodyFont: 'roboto', tags: ['dark', 'executive', 'condensed'] },
  { id: 'ledger', name: 'Ledger', description: 'Typewriter type on warm paper with a ruled grid and a red headline.', accent: '#d21f3c', secondary: '#4a4036', paper: '#efe9da', headFont: 'montserrat', bodyFont: 'space-mono', tags: ['vintage', 'mono', 'paper'] },
  { id: 'elegant', name: 'Elegant Serif', description: 'Refined serif typography under a soft tinted header band.', accent: '#3b5486', secondary: '#b9c4dc', paper: '#ffffff', headFont: 'lora', bodyFont: 'lora', tags: ['serif', 'elegant', 'navy'] },
  { id: 'bold', name: 'Bold Header', description: 'Full-bleed color bands top and bottom with strong geometric type.', accent: '#0b4aa8', secondary: '#ffffff', paper: '#ffffff', headFont: 'montserrat', bodyFont: 'montserrat', tags: ['bold', 'color', 'band'] },
  { id: 'friendly', name: 'Friendly Rounded', description: 'Rounded type, a soft colored frame and playful floral accents.', accent: '#3e5a2e', secondary: '#f6b8c6', paper: '#ffffff', headFont: 'nunito', bodyFont: 'nunito', tags: ['friendly', 'rounded', 'soft'] },
  { id: 'boutique', name: 'Boutique', description: 'Muted rose serif with boxed cells and pill totals.', accent: '#a05c5a', secondary: '#e9d3d0', paper: '#ffffff', headFont: 'merriweather', bodyFont: 'source-sans', tags: ['serif', 'boutique', 'warm'] },
  { id: 'construction', name: 'Construction', description: 'Industrial navy and safety yellow with angled stripes. Built for the trades.', accent: '#1b2a55', secondary: '#f5c400', paper: '#ffffff', headFont: 'poppins', bodyFont: 'poppins', tags: ['construction', 'industrial', 'trades'] },
  { id: 'coastal', name: 'Coastal Serif', description: 'Warm cream paper, deep teal serif headings and a peach footer band.', accent: '#1f6b6b', secondary: '#f2c3ae', paper: '#efebe1', headFont: 'dm-serif', bodyFont: 'montserrat', tags: ['serif', 'warm', 'elegant'] },
];

export const DEFAULT_TEMPLATE_ID: TemplateId = 'classic';

const TEMPLATE_BY_ID = new Map<string, TemplateMeta>(TEMPLATES.map((t) => [t.id, t]));

/**
 * Every template id ever stored in `documents.data.templateId` (or produced by the AI) → closest current design.
 * Keep this table forever: documents saved years ago must keep rendering.
 */
export const LEGACY_TEMPLATE_MAP: Record<string, TemplateId> = {
  // jsPDF "standard" designs (pre-2026-11)
  standard: 'classic',
  professional: 'elegant',
  elegant: 'elegant',
  warm: 'coastal',
  retro: 'ledger',
  modern_blue: 'bold',
  tech: 'modern',
  industrial: 'construction',
  minimal: 'modern',
  bold: 'bold',
  // HTML "premium" designs (pre-2026-11)
  template_html: 'modern',
  template_html_2: 'executive',
  template_html_2_new: 'spectrum',
  template_html_3: 'modern',
  template_html_4: 'spectrum',
  template_neon: 'executive',
  template_luxury: 'elegant',
  template_nature: 'friendly',
  template_geometric: 'bold',
  template_pastel: 'friendly',
  template_vintage: 'ledger',
  template_blueprint: 'corporate',
  template_memphis: 'statement',
  template_crimson: 'boutique',
  template_watercolor: 'coastal',
  template_swiss: 'modern',
  template_space: 'executive',
  template_retro: 'ledger',
  template_pop: 'statement',
  template_serif: 'elegant',
};

/** Free-text style words (AI prompts, search) → design. */
export const TEMPLATE_KEYWORDS: Record<string, TemplateId> = {
  classic: 'classic', standard: 'classic', professional: 'classic', simple: 'classic', default: 'classic', clean: 'classic',
  modern: 'modern', minimal: 'modern', minimalist: 'modern', swiss: 'modern', studio: 'modern',
  corporate: 'corporate', business: 'corporate', blue: 'corporate',
  gradient: 'spectrum', creative: 'spectrum', colorful: 'spectrum', spectrum: 'spectrum',
  statement: 'statement', black: 'statement', 'bold black': 'statement', playful: 'statement',
  executive: 'executive', dark: 'executive', luxury: 'executive', 'high end': 'executive', premium: 'executive',
  vintage: 'ledger', typewriter: 'ledger', retro: 'ledger', ledger: 'ledger', paper: 'ledger',
  elegant: 'elegant', serif: 'elegant', navy: 'elegant', formal: 'elegant',
  bold: 'bold', band: 'bold', 'bold header': 'bold', vibrant: 'bold',
  friendly: 'friendly', rounded: 'friendly', soft: 'friendly', pastel: 'friendly', nature: 'friendly',
  boutique: 'boutique', rose: 'boutique', warm: 'boutique',
  construction: 'construction', industrial: 'construction', trades: 'construction', contractor: 'construction', safety: 'construction',
  coastal: 'coastal', cream: 'coastal', teal: 'coastal',
};

export const isTemplateId = (id: unknown): id is TemplateId => typeof id === 'string' && TEMPLATE_BY_ID.has(id);

/** Any stored/legacy/AI template id → a current template id (never throws, never returns unknown ids). */
export const resolveTemplateId = (id?: string | null): TemplateId => {
  if (!id) return DEFAULT_TEMPLATE_ID;
  const raw = String(id).trim();
  if (isTemplateId(raw)) return raw;
  const lower = raw.toLowerCase();
  if (isTemplateId(lower)) return lower;
  if (LEGACY_TEMPLATE_MAP[lower]) return LEGACY_TEMPLATE_MAP[lower];
  if (TEMPLATE_KEYWORDS[lower]) return TEMPLATE_KEYWORDS[lower];
  return DEFAULT_TEMPLATE_ID;
};

export const getTemplateMeta = (id?: string | null): TemplateMeta => TEMPLATE_BY_ID.get(resolveTemplateId(id))!;

const isFontKey = (v: unknown): v is FontKey => typeof v === 'string' && v in FONTS;

/** The user's font choice: `data.fontFamily` (preferred) or `data.themeColors.font`. */
export const pickUserFont = (data: any): FontKey | null => {
  const raw = data?.fontFamily ?? data?.themeColors?.font;
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v || v === 'template' || v === 'default') return null;
  if (isFontKey(v)) return v;
  const byLabel = (Object.keys(FONTS) as FontKey[]).find((k) => FONTS[k].label.toLowerCase() === v);
  return byLabel || null;
};

/** Google Fonts stylesheet URL for a set of font keys ('' if none need loading). */
export const googleFontsHref = (keys: FontKey[]): string => {
  const specs = Array.from(new Set(keys)).map((k) => FONTS[k]?.google).filter(Boolean) as string[];
  if (!specs.length) return '';
  return `https://fonts.googleapis.com/css2?${specs.map((s) => `family=${s}`).join('&')}&display=swap`;
};

export type PaperSize = 'letter' | 'a4';

/** CSS pixel size of a page at 96 dpi. */
export const PAPER: Record<PaperSize, { width: number; height: number; label: string; pdfFormat: 'letter' | 'a4' }> = {
  letter: { width: 816, height: 1056, label: 'US Letter', pdfFormat: 'letter' },
  a4: { width: 794, height: 1123, label: 'A4', pdfFormat: 'a4' },
};

export const pickPaperSize = (data: any, fallback: PaperSize = 'letter'): PaperSize => {
  const raw = String(data?.paperSize ?? data?.themeColors?.paper ?? '').toLowerCase();
  return raw === 'a4' ? 'a4' : raw === 'letter' ? 'letter' : fallback;
};
