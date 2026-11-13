/**
 * Template registry: the list of document designs, their default palettes and fonts, the user-selectable
 * fonts, and the mapping from every template id that was ever saved in a document to a design.
 *
 * Designs: 13 "Featured" designs (themes.ts) + the original 10 Standard and 20 Premium designs, restored under
 * their original ids, + new designs. Design modules (designs/*.ts) export `{ meta, theme }` pairs.
 */
import { DESIGN_LIST } from './designs/index.ts';

/** The 13 designs of the 2026-11 rebuild ("Featured"). */
export const CORE_TEMPLATE_IDS = [
  'classic', 'modern', 'corporate', 'spectrum', 'statement', 'executive', 'ledger',
  'serif_band', 'bold_header', 'friendly', 'boutique', 'construction', 'coastal',
] as const;
/** The 10 original "Standard" designs (pre-2026-11 jsPDF designs), restored under their original ids. */
export const STANDARD_TEMPLATE_IDS = [
  'standard', 'professional', 'elegant', 'warm', 'retro', 'modern_blue', 'tech', 'industrial', 'minimal', 'bold',
] as const;
/** The 20 original "Premium" designs (pre-2026-11 HTML designs), restored under their original ids. */
export const PREMIUM_TEMPLATE_IDS = [
  'template_html', 'template_html_2', 'template_html_2_new', 'template_html_3', 'template_html_4',
  'template_neon', 'template_luxury', 'template_nature', 'template_geometric', 'template_pastel',
  'template_vintage', 'template_blueprint', 'template_memphis', 'template_crimson', 'template_watercolor',
  'template_swiss', 'template_space', 'template_retro', 'template_pop', 'template_serif',
] as const;
/** New original designs. */
export const NEW_TEMPLATE_IDS = [
  'atelier', 'sidebar', 'site_plan', 'timber', 'colorblock', 'paper_minimal', 'service_ticket',
  'heritage', 'nordic', 'metro', 'split', 'greenbar', 'voltage', 'meadow',
] as const;

export const ALL_TEMPLATE_IDS = [...CORE_TEMPLATE_IDS, ...STANDARD_TEMPLATE_IDS, ...PREMIUM_TEMPLATE_IDS, ...NEW_TEMPLATE_IDS] as const;
export type TemplateId = typeof ALL_TEMPLATE_IDS[number];

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

/**
 * Picker groups. Every design is available on every plan: the 2026-11 rebuild has no premium gating for
 * designs ("Premium" is the name of the original collection, as in the original app).
 */
export type TemplateCollection = 'featured' | 'new' | 'standard' | 'premium';
export const COLLECTIONS: Array<{ id: TemplateCollection; label: string; description: string }> = [
  { id: 'featured', label: 'Featured', description: 'Modern, print-ready designs.' },
  { id: 'new', label: 'New', description: 'The newest designs, including looks made for the trades.' },
  { id: 'standard', label: 'Standard', description: 'The original Standard designs.' },
  { id: 'premium', label: 'Premium', description: 'The original Premium designs.' },
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
  /** Picker group ('featured' when omitted). */
  collection?: TemplateCollection;
  /** Extra fonts the design uses in its own CSS; loaded together with the head/body fonts. */
  extraFonts?: FontKey[];
}

const CORE_TEMPLATES: TemplateMeta[] = [
  { id: 'classic', name: 'Classic Professional', description: 'Balanced, conventional business layout with a crisp accent bar. Safe for any client.', accent: '#1f3a5f', secondary: '#c9a227', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['default', 'professional', 'clean'] },
  { id: 'modern', name: 'Modern Minimal', description: 'Oversized title, hairline frame and generous white space. Studio-quality minimalism.', accent: '#111111', secondary: '#8b8bd8', paper: '#fffdf8', headFont: 'inter', bodyFont: 'inter', tags: ['minimal', 'modern', 'swiss'] },
  { id: 'corporate', name: 'Corporate Blue', description: 'Centered brand, label chips and a confident blue table with warm hairlines.', accent: '#2d4a9a', secondary: '#ee8a5e', paper: '#ffffff', headFont: 'fraunces', bodyFont: 'lora', tags: ['corporate', 'blue', 'friendly'] },
  { id: 'spectrum', name: 'Spectrum Edge', description: 'A soft gradient edge and bold uppercase type. Creative but still all business.', accent: '#111111', secondary: '#f29a6b', paper: '#ffffff', headFont: 'inter', bodyFont: 'inter', tags: ['gradient', 'creative', 'modern'] },
  { id: 'statement', name: 'Bold Statement', description: 'Heavy display title, black grid table and soft color glows in the corners.', accent: '#111111', secondary: '#f2994a', paper: '#ffffff', headFont: 'league-spartan', bodyFont: 'josefin', tags: ['bold', 'black', 'creative'] },
  { id: 'executive', name: 'Executive Slate', description: 'Dark slate brand block, tall condensed headings and a footer contact bar.', accent: '#263238', secondary: '#90a4ae', paper: '#ffffff', headFont: 'oswald', bodyFont: 'roboto', tags: ['dark', 'executive', 'condensed'] },
  { id: 'ledger', name: 'Ledger', description: 'Typewriter type on warm paper with a ruled grid and a red headline.', accent: '#d21f3c', secondary: '#4a4036', paper: '#efe9da', headFont: 'montserrat', bodyFont: 'space-mono', tags: ['vintage', 'mono', 'paper'] },
  { id: 'serif_band', name: 'Serif Band', description: 'Refined serif typography under a soft tinted header band.', accent: '#3b5486', secondary: '#b9c4dc', paper: '#ffffff', headFont: 'lora', bodyFont: 'lora', tags: ['serif', 'elegant', 'navy'] },
  { id: 'bold_header', name: 'Bold Header', description: 'Full-bleed color bands top and bottom with strong geometric type.', accent: '#0b4aa8', secondary: '#ffffff', paper: '#ffffff', headFont: 'montserrat', bodyFont: 'montserrat', tags: ['bold', 'color', 'band'] },
  { id: 'friendly', name: 'Friendly Rounded', description: 'Rounded type, a soft colored frame and playful floral accents.', accent: '#3e5a2e', secondary: '#f6b8c6', paper: '#ffffff', headFont: 'nunito', bodyFont: 'nunito', tags: ['friendly', 'rounded', 'soft'] },
  { id: 'boutique', name: 'Boutique', description: 'Muted rose serif with boxed cells and pill totals.', accent: '#a05c5a', secondary: '#e9d3d0', paper: '#ffffff', headFont: 'merriweather', bodyFont: 'source-sans', tags: ['serif', 'boutique', 'warm'] },
  { id: 'construction', name: 'Construction', description: 'Industrial navy and safety yellow with angled stripes. Built for the trades.', accent: '#1b2a55', secondary: '#f5c400', paper: '#ffffff', headFont: 'poppins', bodyFont: 'poppins', tags: ['construction', 'industrial', 'trades'] },
  { id: 'coastal', name: 'Coastal Serif', description: 'Warm cream paper, deep teal serif headings and a peach footer band.', accent: '#1f6b6b', secondary: '#f2c3ae', paper: '#efebe1', headFont: 'dm-serif', bodyFont: 'montserrat', tags: ['serif', 'warm', 'elegant'] },
];

const COLLECTION_ORDER: Record<TemplateCollection, number> = { featured: 0, new: 1, standard: 2, premium: 3 };
const ID_ORDER = new Map<string, number>(ALL_TEMPLATE_IDS.map((id, i) => [id, i]));

/** Every registered design, in picker order (Featured, New, Standard, Premium). */
export const TEMPLATES: TemplateMeta[] = [
  ...CORE_TEMPLATES.map((t) => ({ ...t, collection: 'featured' as const })),
  ...DESIGN_LIST.map((d) => ({ ...d.meta, collection: d.meta.collection || ('featured' as const) })),
]
  .filter((t, i, all) => (ID_ORDER.has(t.id) && all.findIndex((x) => x.id === t.id) === i))
  .sort((a, b) => COLLECTION_ORDER[a.collection || 'featured'] - COLLECTION_ORDER[b.collection || 'featured'] || (ID_ORDER.get(a.id)! - ID_ORDER.get(b.id)!));

export const DEFAULT_TEMPLATE_ID: TemplateId = 'classic';

const TEMPLATE_BY_ID = new Map<string, TemplateMeta>(TEMPLATES.map((t) => [t.id, t]));

/**
 * Stored ids that are NOT designs of their own → the design they show. Keep this table forever: documents
 * saved years ago must keep rendering. Every pre-2026-11 id ('standard' … 'bold', 'template_html' …
 * 'template_serif') is a design again, so only aliases (display names, other spellings) are listed here.
 */
export const LEGACY_TEMPLATE_MAP: Record<string, TemplateId> = {
  // display names of the original designs (AI output, imports, hand-edited data)
  'modern single': 'template_html',
  'high end': 'template_html_2',
  glassmorphism: 'template_html_2_new',
  'glassmorphism modern': 'template_html_2_new',
  'minimalist premium': 'template_html_3',
  'premium minimalist': 'template_html_3',
  'gradient border': 'template_html_4',
  'gradient border premium': 'template_html_4',
  'neon cyberpunk': 'template_neon',
  'luxury gold': 'template_luxury',
  'luxury gold navy': 'template_luxury',
  'organic nature': 'template_nature',
  'geometric bold': 'template_geometric',
  'pastel soft': 'template_pastel',
  'vintage craft': 'template_vintage',
  'blueprint tech': 'template_blueprint',
  'abstract memphis': 'template_memphis',
  'crimson noir': 'template_crimson',
  'watercolor artistic': 'template_watercolor',
  'swiss grid': 'template_swiss',
  'space odyssey': 'template_space',
  'retro terminal': 'template_retro',
  'playful pop': 'template_pop',
  'elegant serif': 'template_serif',
  'modern blue': 'modern_blue',
  // ids/names the 2026-11 rebuild used for two Featured designs before 'elegant' and 'bold' became original designs again
  'serif band': 'serif_band',
  'bold header': 'bold_header',
};

/**
 * Only used when a design module is missing from a build (never in a complete build): the closest Featured
 * design, so documents keep rendering.
 */
const MISSING_DESIGN_FALLBACK: Partial<Record<TemplateId, TemplateId>> = {
  standard: 'classic', professional: 'serif_band', elegant: 'serif_band', warm: 'coastal', retro: 'ledger', modern_blue: 'bold_header',
  tech: 'modern', industrial: 'construction', minimal: 'modern', bold: 'bold_header',
  template_html: 'modern', template_html_2: 'executive', template_html_2_new: 'spectrum', template_html_3: 'modern', template_html_4: 'spectrum',
  template_neon: 'executive', template_luxury: 'serif_band', template_nature: 'friendly', template_geometric: 'bold_header', template_pastel: 'friendly',
  template_vintage: 'ledger', template_blueprint: 'corporate', template_memphis: 'statement', template_crimson: 'boutique', template_watercolor: 'coastal',
  template_swiss: 'modern', template_space: 'executive', template_retro: 'ledger', template_pop: 'statement', template_serif: 'serif_band',
  atelier: 'serif_band', sidebar: 'classic', site_plan: 'construction', timber: 'coastal', colorblock: 'bold_header', paper_minimal: 'modern',
  service_ticket: 'construction', heritage: 'ledger', nordic: 'modern', metro: 'classic', split: 'bold_header', greenbar: 'ledger',
  voltage: 'construction', meadow: 'friendly',
};

/** Free-text style words (AI prompts, search) → design. */
export const TEMPLATE_KEYWORDS: Record<string, TemplateId> = {
  simple: 'classic', default: 'classic', clean: 'classic',
  minimalist: 'modern', studio: 'modern',
  business: 'corporate', blue: 'corporate',
  creative: 'spectrum', colorful: 'spectrum',
  black: 'statement', 'bold black': 'statement',
  dark: 'executive', premium: 'executive',
  typewriter: 'ledger', paper: 'ledger',
  serif: 'serif_band', navy: 'serif_band', formal: 'professional',
  band: 'bold_header', vibrant: 'bold_header',
  rounded: 'friendly', soft: 'friendly',
  rose: 'boutique',
  trades: 'construction', contractor: 'construction', safety: 'construction',
  cream: 'coastal', teal: 'coastal',
  // original designs
  neon: 'template_neon', cyberpunk: 'template_neon', luxury: 'template_luxury', gold: 'template_luxury',
  nature: 'template_nature', organic: 'template_nature', geometric: 'template_geometric', pastel: 'template_pastel',
  vintage: 'template_vintage', craft: 'template_vintage', blueprint: 'template_blueprint', memphis: 'template_memphis',
  crimson: 'template_crimson', noir: 'template_crimson', watercolor: 'template_watercolor', swiss: 'template_swiss', grid: 'template_swiss',
  space: 'template_space', terminal: 'template_retro', pop: 'template_pop', playful: 'template_pop',
  glass: 'template_html_2_new', gradient: 'template_html_4',
  // new designs
  'site plan': 'site_plan', architect: 'site_plan', carpentry: 'timber', wood: 'timber',
  'color block': 'colorblock', service: 'service_ticket', 'service ticket': 'service_ticket', hvac: 'service_ticket', plumbing: 'service_ticket',
  letterpress: 'heritage', scandinavian: 'nordic', dashboard: 'metro', 'green bar': 'greenbar',
  electric: 'voltage', electrician: 'voltage', landscaping: 'meadow', garden: 'meadow',
};

/** true for ids of registered designs. */
export const isTemplateId = (id: unknown): id is TemplateId => typeof id === 'string' && TEMPLATE_BY_ID.has(id);

const KNOWN_IDS = new Set<string>(ALL_TEMPLATE_IDS);

const registered = (id: string | undefined): TemplateId | null => {
  if (!id || !KNOWN_IDS.has(id)) return null;
  if (TEMPLATE_BY_ID.has(id)) return id as TemplateId;
  const fb = MISSING_DESIGN_FALLBACK[id as TemplateId];
  return fb && TEMPLATE_BY_ID.has(fb) ? fb : null;
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
