/**
 * Template registry: the list of document designs, their default palettes and fonts, the user-selectable
 * fonts, plan tiers, and the mapping from every template id that was ever saved in a document to a design.
 *
 * Designs (2026-11-14):
 *   Basic   (free on every plan)  Classic (themes.ts) + the 10 original Standard designs (designs/standard.ts)
 *   Premium (paid plans)          the Premium designs (designs/premium.ts, engine designs/pro.ts), customizable
 * Every id a document was ever saved with keeps rendering: retired designs map to their replacement
 * (RETIRED_TEMPLATE_MAP), display names and other spellings through LEGACY_TEMPLATE_MAP.
 */
import { DESIGN_LIST } from './designs/index.ts';

/** The 10 original "Standard" designs (pre-2026-11 jsPDF designs), restored under their original ids. */
export const STANDARD_TEMPLATE_IDS = [
  'standard', 'professional', 'elegant', 'warm', 'retro', 'modern_blue', 'tech', 'industrial', 'minimal', 'bold',
] as const;
/** The Premium designs (2026-11-14 redesign; corporate, executive and heritage kept their ids). */
export const PREMIUM_TEMPLATE_IDS = [
  'classic_trade', 'modern_contractor', 'field_ready', 'executive', 'corporate', 'craftsman', 'blueprint_pro', 'slate',
  'proposal', 'letterhead', 'minimal_line', 'bold_block', 'heritage', 'studio', 'work_ticket',
] as const;

export const ALL_TEMPLATE_IDS = ['classic', ...STANDARD_TEMPLATE_IDS, ...PREMIUM_TEMPLATE_IDS] as const;
export type TemplateId = typeof ALL_TEMPLATE_IDS[number];

/**
 * Design ids that are no longer designs of their own → the Premium design that replaced them (owner feedback
 * 2026-11-14: professional looks instead of neon, memphis, pastel...). Keep this table forever: documents saved
 * with these ids render (and download) with the replacement.
 */
export const RETIRED_TEMPLATE_MAP: Record<string, TemplateId> = {
  // the 20 original Premium designs (old app, pre-2026-11)
  template_html: 'minimal_line', template_html_2: 'corporate', template_html_2_new: 'modern_contractor', template_html_3: 'studio',
  template_html_4: 'modern_contractor', template_neon: 'slate', template_luxury: 'executive', template_nature: 'craftsman',
  template_geometric: 'slate', template_pastel: 'proposal', template_vintage: 'heritage', template_blueprint: 'blueprint_pro',
  template_memphis: 'bold_block', template_crimson: 'classic_trade', template_watercolor: 'proposal', template_swiss: 'studio',
  template_space: 'slate', template_retro: 'field_ready', template_pop: 'bold_block', template_serif: 'classic_trade',
  // the 2026-11 "Featured" designs (never released)
  modern: 'minimal_line', spectrum: 'modern_contractor', statement: 'bold_block', ledger: 'heritage', serif_band: 'classic_trade',
  bold_header: 'modern_contractor', friendly: 'craftsman', boutique: 'executive', construction: 'bold_block', coastal: 'proposal',
  // the 2026-11 "New" designs (never released)
  atelier: 'executive', sidebar: 'corporate', site_plan: 'blueprint_pro', timber: 'craftsman', colorblock: 'bold_block',
  paper_minimal: 'minimal_line', service_ticket: 'work_ticket', nordic: 'minimal_line', metro: 'modern_contractor', split: 'bold_block',
  greenbar: 'field_ready', voltage: 'slate', meadow: 'craftsman',
};

export type FontKey =
  | 'inter' | 'helvetica' | 'montserrat' | 'poppins' | 'oswald' | 'roboto' | 'league-spartan' | 'josefin'
  | 'lora' | 'fraunces' | 'playfair' | 'dm-serif' | 'merriweather' | 'source-sans' | 'georgia' | 'nunito' | 'space-mono'
  // stand-ins for the fonts the original designs used
  | 'times' | 'courier' | 'garamond' | 'quicksand' | 'outfit' | 'comic' | 'script' | 'trebuchet' | 'verdana' | 'consolas' | 'segoe'
  | 'orbitron' | 'vt323' | 'fredoka' | 'cinzel'
  // used by the new designs
  | 'dm-sans' | 'manrope' | 'space-grotesk' | 'ibm-plex-sans' | 'ibm-plex-mono' | 'archivo' | 'barlow' | 'barlow-condensed'
  | 'cormorant' | 'libre-baskerville' | 'work-sans' | 'bebas' | 'crimson-pro' | 'rubik' | 'karla' | 'raleway' | 'zilla-slab' | 'roboto-slab';

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
  playfair: { label: 'Playfair Display', stack: "'Playfair Display', Georgia, 'Times New Roman', serif", google: 'Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400' },
  'dm-serif': { label: 'DM Serif Display', stack: "'DM Serif Display', 'Playfair Display', Georgia, serif", google: 'DM+Serif+Display' },
  merriweather: { label: 'Merriweather', stack: "'Merriweather', Georgia, 'Times New Roman', serif", google: 'Merriweather:wght@400;700;900' },
  'source-sans': { label: 'Source Sans 3', stack: "'Source Sans 3', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", google: 'Source+Sans+3:wght@400;600;700' },
  georgia: { label: 'Georgia', stack: "Georgia, 'Gelasio', 'Times New Roman', Times, serif", google: 'Gelasio:ital,wght@0,400;0,600;0,700;1,400' },
  nunito: { label: 'Nunito', stack: "'Nunito', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif", google: 'Nunito:wght@400;500;600;700;800' },
  'space-mono': { label: 'Space Mono', stack: "'Space Mono', 'Courier New', Courier, monospace", google: 'Space+Mono:wght@400;700' },
  // Tinos / Courier Prime are metric-compatible with Times / Courier (the original jsPDF fonts) and look the same on every device.
  times: { label: 'Times', stack: "'Tinos', 'Times New Roman', Times, serif", google: 'Tinos:ital,wght@0,400;0,700;1,400;1,700' },
  courier: { label: 'Courier', stack: "'Courier Prime', 'Courier New', Courier, monospace", google: 'Courier+Prime:ital,wght@0,400;0,700;1,400' },
  garamond: { label: 'Garamond', stack: "'EB Garamond', Garamond, Georgia, serif", google: 'EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400' },
  quicksand: { label: 'Quicksand', stack: "'Quicksand', 'Trebuchet MS', sans-serif", google: 'Quicksand:wght@400;500;600;700' },
  outfit: { label: 'Outfit', stack: "'Outfit', 'Inter', 'Helvetica Neue', Arial, sans-serif", google: 'Outfit:wght@300;400;500;600;700;800' },
  comic: { label: 'Comic Neue', stack: "'Comic Neue', 'Comic Sans MS', 'Chalkboard SE', cursive, sans-serif", google: 'Comic+Neue:wght@400;700' },
  script: { label: 'Dancing Script', stack: "'Dancing Script', 'Brush Script MT', cursive", google: 'Dancing+Script:wght@500;600;700' },
  trebuchet: { label: 'Trebuchet', stack: "'Trebuchet MS', 'Fira Sans', 'Helvetica Neue', Arial, sans-serif", google: 'Fira+Sans:wght@400;500;600;700;800' },
  verdana: { label: 'Verdana', stack: "Verdana, 'PT Sans', Geneva, Tahoma, sans-serif", google: 'PT+Sans:wght@400;700' },
  consolas: { label: 'Consolas', stack: "Consolas, 'Inconsolata', 'Courier New', monospace", google: 'Inconsolata:wght@400;600;700' },
  segoe: { label: 'Segoe UI', stack: "'Segoe UI', 'Open Sans', 'Helvetica Neue', Arial, sans-serif", google: 'Open+Sans:wght@400;600;700;800' },
  orbitron: { label: 'Orbitron', stack: "'Orbitron', 'Arial Black', sans-serif", google: 'Orbitron:wght@500;600;700;800;900' },
  vt323: { label: 'VT323', stack: "'VT323', 'Courier New', monospace", google: 'VT323' },
  fredoka: { label: 'Fredoka', stack: "'Fredoka', 'Nunito', 'Trebuchet MS', sans-serif", google: 'Fredoka:wght@400;500;600;700' },
  cinzel: { label: 'Cinzel', stack: "'Cinzel', 'Trajan Pro', Georgia, serif", google: 'Cinzel:wght@400;500;600;700;800' },
  'dm-sans': { label: 'DM Sans', stack: "'DM Sans', 'Helvetica Neue', Arial, sans-serif", google: 'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800' },
  manrope: { label: 'Manrope', stack: "'Manrope', 'Helvetica Neue', Arial, sans-serif", google: 'Manrope:wght@400;500;600;700;800' },
  'space-grotesk': { label: 'Space Grotesk', stack: "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif", google: 'Space+Grotesk:wght@400;500;600;700' },
  'ibm-plex-sans': { label: 'IBM Plex Sans', stack: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif", google: 'IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400' },
  'ibm-plex-mono': { label: 'IBM Plex Mono', stack: "'IBM Plex Mono', 'Courier New', monospace", google: 'IBM+Plex+Mono:wght@400;500;600;700' },
  archivo: { label: 'Archivo', stack: "'Archivo', 'Helvetica Neue', Arial, sans-serif", google: 'Archivo:wght@400;500;600;700;800;900' },
  barlow: { label: 'Barlow', stack: "'Barlow', 'Helvetica Neue', Arial, sans-serif", google: 'Barlow:wght@400;500;600;700;800' },
  'barlow-condensed': { label: 'Barlow Condensed', stack: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", google: 'Barlow+Condensed:wght@400;500;600;700;800' },
  cormorant: { label: 'Cormorant Garamond', stack: "'Cormorant Garamond', Garamond, Georgia, serif", google: 'Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500' },
  'libre-baskerville': { label: 'Libre Baskerville', stack: "'Libre Baskerville', Baskerville, Georgia, serif", google: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400' },
  'work-sans': { label: 'Work Sans', stack: "'Work Sans', 'Helvetica Neue', Arial, sans-serif", google: 'Work+Sans:wght@400;500;600;700;800' },
  bebas: { label: 'Bebas Neue', stack: "'Bebas Neue', 'Oswald', 'Arial Narrow', sans-serif", google: 'Bebas+Neue' },
  'crimson-pro': { label: 'Crimson Pro', stack: "'Crimson Pro', Georgia, serif", google: 'Crimson+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400' },
  rubik: { label: 'Rubik', stack: "'Rubik', 'Helvetica Neue', Arial, sans-serif", google: 'Rubik:wght@400;500;600;700;800' },
  karla: { label: 'Karla', stack: "'Karla', 'Helvetica Neue', Arial, sans-serif", google: 'Karla:wght@400;500;600;700;800' },
  raleway: { label: 'Raleway', stack: "'Raleway', 'Helvetica Neue', Arial, sans-serif", google: 'Raleway:wght@400;500;600;700;800' },
  'zilla-slab': { label: 'Zilla Slab', stack: "'Zilla Slab', 'Roboto Slab', Rockwell, Georgia, serif", google: 'Zilla+Slab:wght@400;500;600;700' },
  'roboto-slab': { label: 'Roboto Slab', stack: "'Roboto Slab', Rockwell, Georgia, serif", google: 'Roboto+Slab:wght@400;500;600;700;800' },
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
  { id: 'dm-sans', label: 'DM Sans (modern)' },
  { id: 'barlow', label: 'Barlow (industrial sans)' },
  { id: 'lora', label: 'Lora (book serif)' },
  { id: 'merriweather', label: 'Merriweather (sturdy serif)' },
  { id: 'playfair', label: 'Playfair Display (display serif)' },
  { id: 'georgia', label: 'Georgia (classic serif)' },
  { id: 'times', label: 'Times (traditional serif)' },
  { id: 'zilla-slab', label: 'Zilla Slab (slab serif)' },
  { id: 'courier', label: 'Courier (typewriter)' },
  { id: 'space-mono', label: 'Space Mono (typewriter)' },
];

/** Origin of a design module ('featured' = Classic, 'standard' = original Standard, 'new' = Premium engine); the picker groups by `tier`. */
export type TemplateCollection = 'featured' | 'new' | 'standard' | 'premium';

/**
 * Plan tiers of the designs (owner decision 2026-11-14): Basic designs are free on every plan; Premium designs need
 * a paid plan (Premium or Premium + AI) to be chosen. Documents that already use a Premium design keep it on every
 * plan (lib/designAccess.ts).
 */
export type DesignTier = 'basic' | 'premium';
/** The Basic designs: the original app's 10 Standard designs + Classic (the default of new documents). */
export const BASIC_TEMPLATE_IDS = ['classic', ...STANDARD_TEMPLATE_IDS] as const;
const BASIC_SET = new Set<string>(BASIC_TEMPLATE_IDS);
export const DESIGN_GROUPS: Array<{ id: DesignTier; label: string; description: string }> = [
  { id: 'basic', label: 'Basic', description: 'Free on every plan.' },
  { id: 'premium', label: 'Premium', description: 'Included in Premium and Premium + AI. Professional layouts you can customize.' },
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
  /** Design module origin ('featured' when omitted). */
  collection?: TemplateCollection;
  /** Plan tier (set by the registry: Basic or Premium). */
  tier?: DesignTier;
  /** Short picker descriptor, e.g. "Bold header band · sans". */
  descriptor?: string;
  /** Extra fonts the design uses in its own CSS; loaded together with the head/body fonts. */
  extraFonts?: FontKey[];
}

const CLASSIC: TemplateMeta = {
  id: 'classic', name: 'Classic Professional', descriptor: 'Accent bar · amount due up top',
  description: 'Balanced, conventional business layout with a crisp accent bar. Safe for any client.',
  accent: '#1f3a5f', secondary: '#c9a227', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['default', 'professional', 'clean'],
};

/** Picker descriptors of the Basic designs (their looks are unchanged). */
const BASIC_DESCRIPTORS: Partial<Record<TemplateId, string>> = {
  standard: 'Centered title · double frame', professional: 'Slate table · thin frame', elegant: 'Purple accents · frame',
  warm: 'Orange accents · frame', retro: 'Typewriter type · frame', modern_blue: 'Blue header band', tech: 'Teal band · typewriter',
  industrial: 'Amber header band', minimal: 'Grey header band', bold: 'Black header band',
};

const TIER_ORDER: Record<DesignTier, number> = { basic: 0, premium: 1 };
const ID_ORDER = new Map<string, number>(ALL_TEMPLATE_IDS.map((id, i) => [id, i]));
const tierOf = (id: string): DesignTier => (BASIC_SET.has(id) ? 'basic' : 'premium');

/** Every registered design, in picker order (Basic, then Premium). */
export const TEMPLATES: TemplateMeta[] = [
  { ...CLASSIC, collection: 'featured' as const },
  ...DESIGN_LIST.map((d) => ({ ...d.meta, collection: d.meta.collection || ('featured' as const) })),
]
  .filter((t, i, all) => (ID_ORDER.has(t.id) && all.findIndex((x) => x.id === t.id) === i))
  .map((t) => ({ ...t, tier: tierOf(t.id), descriptor: t.descriptor || BASIC_DESCRIPTORS[t.id] }))
  .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || (ID_ORDER.get(a.id)! - ID_ORDER.get(b.id)!));

export const DEFAULT_TEMPLATE_ID: TemplateId = 'classic';

const TEMPLATE_BY_ID = new Map<string, TemplateMeta>(TEMPLATES.map((t) => [t.id, t]));

/** Display names and other spellings (AI output, imports, hand-edited data) → stored id. */
const ALIASES: Record<string, string> = {
  // display names of the original designs
  'modern single': 'template_html', 'high end': 'template_html_2', glassmorphism: 'template_html_2_new', 'glassmorphism modern': 'template_html_2_new',
  'minimalist premium': 'template_html_3', 'premium minimalist': 'template_html_3', 'gradient border': 'template_html_4', 'gradient border premium': 'template_html_4',
  'neon cyberpunk': 'template_neon', 'luxury gold': 'template_luxury', 'luxury gold navy': 'template_luxury', 'organic nature': 'template_nature',
  'geometric bold': 'template_geometric', 'pastel soft': 'template_pastel', 'vintage craft': 'template_vintage', 'blueprint tech': 'template_blueprint',
  'abstract memphis': 'template_memphis', 'crimson noir': 'template_crimson', 'watercolor artistic': 'template_watercolor', 'swiss grid': 'template_swiss',
  'space odyssey': 'template_space', 'retro terminal': 'template_retro', 'playful pop': 'template_pop', 'elegant serif': 'template_serif',
  'modern blue': 'modern_blue',
  // names of the 2026-11 designs
  'serif band': 'serif_band', 'bold header': 'bold_header', 'classic professional': 'classic', 'modern minimal': 'modern',
  'corporate blue': 'corporate', 'executive slate': 'executive', 'timber and trade': 'timber', 'paper minimal': 'paper_minimal',
  // names of the Premium designs
  'classic trade': 'classic_trade', 'modern contractor': 'modern_contractor', 'field ready': 'field_ready', 'blueprint pro': 'blueprint_pro',
  'minimal line': 'minimal_line', 'bold block': 'bold_block', 'studio grid': 'studio', 'work ticket': 'work_ticket',
};

/**
 * Stored ids that are NOT designs of their own → the design they show (aliases + retired designs). Keep this table
 * forever: documents saved years ago must keep rendering.
 */
export const LEGACY_TEMPLATE_MAP: Record<string, TemplateId> = Object.fromEntries([
  ...Object.entries(ALIASES).map(([k, v]) => [k, (RETIRED_TEMPLATE_MAP[v] || v) as TemplateId]),
  ...Object.entries(RETIRED_TEMPLATE_MAP),
]);

/** Free-text style words (AI prompts, search) → design. */
export const TEMPLATE_KEYWORDS: Record<string, TemplateId> = {
  simple: 'classic', default: 'classic', clean: 'classic', formal: 'professional',
  minimalist: 'minimal_line', monochrome: 'minimal_line', studio: 'studio', swiss: 'studio', grid: 'studio', architect: 'studio',
  business: 'corporate', sidebar: 'corporate', blue: 'modern_contractor', band: 'modern_contractor', contractor: 'modern_contractor',
  colorful: 'modern_contractor', vibrant: 'modern_contractor', glass: 'modern_contractor', gradient: 'modern_contractor', dashboard: 'modern_contractor',
  block: 'bold_block', black: 'bold_block', 'bold black': 'bold_block', construction: 'bold_block', trades: 'bold_block', safety: 'bold_block',
  creative: 'bold_block', memphis: 'bold_block', pop: 'bold_block', playful: 'bold_block',
  dark: 'slate', charcoal: 'slate', electric: 'slate', electrician: 'slate', hvac: 'slate', neon: 'slate', cyberpunk: 'slate', space: 'slate', geometric: 'slate',
  premium: 'executive', luxury: 'executive', gold: 'executive', refined: 'executive', rose: 'executive',
  serif: 'classic_trade', traditional: 'classic_trade', navy: 'classic_trade', crimson: 'classic_trade', noir: 'classic_trade',
  vintage: 'heritage', letterpress: 'heritage', typewriter: 'heritage', paper: 'heritage', craft: 'craftsman',
  wood: 'craftsman', carpentry: 'craftsman', rustic: 'craftsman', nature: 'craftsman', organic: 'craftsman', landscaping: 'craftsman', garden: 'craftsman',
  cream: 'craftsman', rounded: 'craftsman', soft: 'proposal',
  blueprint: 'blueprint_pro', technical: 'blueprint_pro', engineering: 'blueprint_pro', 'site plan': 'blueprint_pro',
  pastel: 'proposal', watercolor: 'proposal', teal: 'proposal', letter: 'letterhead',
  service: 'work_ticket', ticket: 'work_ticket', 'service ticket': 'work_ticket', plumbing: 'work_ticket', plumber: 'work_ticket', form: 'work_ticket',
  legible: 'field_ready', large: 'field_ready', field: 'field_ready', terminal: 'field_ready',
};

/** true for ids of registered designs. */
export const isTemplateId = (id: unknown): id is TemplateId => typeof id === 'string' && TEMPLATE_BY_ID.has(id);

const registered = (id: string | undefined): TemplateId | null => {
  if (!id) return null;
  if (TEMPLATE_BY_ID.has(id)) return id as TemplateId;
  const mapped = RETIRED_TEMPLATE_MAP[id];
  return mapped && TEMPLATE_BY_ID.has(mapped) ? mapped : null;
};

/** Any stored/legacy/AI template id → a registered template id (never throws, never returns unknown ids). */
export const resolveTemplateId = (id?: string | null): TemplateId => {
  if (!id) return DEFAULT_TEMPLATE_ID;
  const raw = String(id).trim();
  if (isTemplateId(raw)) return raw;
  const lower = raw.toLowerCase();
  const spaced = lower.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return registered(lower)
    || registered(spaced.replace(/ /g, '_'))
    || registered(LEGACY_TEMPLATE_MAP[lower] || LEGACY_TEMPLATE_MAP[spaced])
    || registered(TEMPLATE_KEYWORDS[lower] || TEMPLATE_KEYWORDS[spaced])
    || DEFAULT_TEMPLATE_ID;
};

export const getTemplateMeta = (id?: string | null): TemplateMeta => TEMPLATE_BY_ID.get(resolveTemplateId(id))!;

/** true when the design a stored id shows is a Premium design (needs a paid plan to be chosen). */
export const isPremiumDesign = (id?: string | null): boolean => getTemplateMeta(id).tier === 'premium';

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
