/**
 * Template id resolution (shared by the edge function and the browser). Pure, no imports.
 * Moved from src/utils/aiTemplateUtils.ts, which re-exports these names.
 */
export const TEMPLATE_STYLE_MAP: Record<string, string> = {
    modern: 'modern_blue',
    classic: 'standard',
    corporate: 'professional',
    minimal: 'minimal',
    premium: 'professional',
    bold: 'bold',
    standard: 'standard',
    professional: 'professional',
    clean: 'minimal',
    executive: 'template_html_2',
    fancy: 'template_html_2_new',
    stylish: 'template_html_2_new',
    glass: 'template_html_2_new',
    glassmorphism: 'template_html_2_new',
    highend: 'template_html_2',
    'high end': 'template_html_2',
    gradient: 'template_html_4',
    luxury: 'template_luxury',
    gold: 'template_luxury',
    neon: 'template_neon',
    cyberpunk: 'template_neon',
    nature: 'template_nature',
    organic: 'template_nature',
    geometric: 'template_geometric',
    pastel: 'template_pastel',
    vintage: 'template_vintage',
    handcrafted: 'template_vintage',
    handmade: 'template_vintage',
    'old fashioned': 'template_vintage',
    'old-fashioned': 'template_vintage',
    'paper style': 'template_vintage',
    'premium paper': 'template_vintage',
    blueprint: 'template_blueprint',
    memphis: 'template_memphis',
    crimson: 'template_crimson',
    noir: 'template_crimson',
    watercolor: 'template_watercolor',
    swiss: 'template_swiss',
    space: 'template_space',
    retro: 'retro',
    terminal: 'template_retro',
    playful: 'template_pop',
    pop: 'template_pop',
    serif: 'template_serif',
    elegant: 'elegant',
    warm: 'warm',
    tech: 'tech',
    industrial: 'industrial',
    minimalist: 'template_html_3',
    'minimalist premium': 'template_html_3',
    'modern blue': 'modern_blue',
    'modern single': 'template_html',
    expensive: 'template_luxury',
    'expensive looking': 'template_luxury',
    'expensive-looking': 'template_luxury',
    luxurious: 'template_luxury',
    futuristic: 'template_neon',
    sciFi: 'template_space',
    colorful: 'template_pop',
    creative: 'template_memphis',
    serious: 'template_swiss',
    structured: 'template_swiss',
    grid: 'template_swiss',
    dark: 'template_crimson',
    cinematic: 'template_crimson',
};

const KNOWN_TEMPLATE_IDS = new Set([
    'standard',
    'professional',
    'elegant',
    'warm',
    'retro',
    'modern_blue',
    'tech',
    'industrial',
    'minimal',
    'bold',
    'template_html',
    'template_html_2',
    'template_html_2_new',
    'template_html_3',
    'template_html_4',
    'template_neon',
    'template_luxury',
    'template_nature',
    'template_geometric',
    'template_pastel',
    'template_vintage',
    'template_blueprint',
    'template_memphis',
    'template_crimson',
    'template_watercolor',
    'template_swiss',
    'template_space',
    'template_retro',
    'template_pop',
    'template_serif',
]);

const TEMPLATE_INTENT_RULES: Array<{ id: string; tokens: string[] }> = [
    { id: 'professional', tokens: ['premium', 'professional', 'corporate', 'business', 'polished', 'formal'] },
    { id: 'template_html', tokens: ['modern single', 'single page', 'simple modern', 'modern report'] },
    { id: 'template_html_2', tokens: ['high end', 'executive', 'refined', 'upscale', 'sleek', 'clean but stylish', 'modern premium'] },
    { id: 'template_html_2_new', tokens: ['glassmorphism', 'glass', 'modern fancy', 'fancy modern', 'stylish', 'luxury modern'] },
    { id: 'template_html_3', tokens: ['minimalist premium', 'minimal premium', 'minimalist', 'minimal', 'clean', 'clean lines', 'clean layout'] },
    { id: 'template_html_4', tokens: ['gradient', 'vibrant gradient', 'colorful gradient'] },
    { id: 'template_luxury', tokens: ['luxury gold', 'luxury', 'gold', 'prestige', 'elite', 'expensive', 'expensive looking', 'fancy', 'high class', 'opulent'] },
    { id: 'template_neon', tokens: ['neon cyberpunk', 'neon', 'cyberpunk', 'futuristic', 'electric', 'cyber', 'glow'] },
    { id: 'template_nature', tokens: ['organic nature', 'nature', 'organic', 'earthy', 'natural'] },
    { id: 'template_geometric', tokens: ['geometric bold', 'geometric', 'structured bold', 'architectural', 'bold structure'] },
    { id: 'template_pastel', tokens: ['pastel soft', 'pastel', 'soft', 'gentle'] },
    { id: 'template_vintage', tokens: ['vintage craft', 'vintage', 'craft', 'handcrafted', 'handmade', 'classic', 'old fashioned', 'old-fashioned', 'paper style', 'premium paper', 'warm paper'] },
    { id: 'template_blueprint', tokens: ['blueprint tech', 'blueprint', 'technical', 'engineering', 'tech'] },
    { id: 'template_memphis', tokens: ['abstract memphis', 'memphis', 'playful abstract', 'creative', 'colorful', 'fun'] },
    { id: 'template_crimson', tokens: ['crimson noir', 'crimson', 'noir', 'dark dramatic', 'dark', 'cinematic', 'red and black'] },
    { id: 'template_watercolor', tokens: ['watercolor', 'artistic', 'painted'] },
    { id: 'template_swiss', tokens: ['swiss grid', 'swiss', 'grid', 'editorial', 'serious', 'structured', 'corporate grid'] },
    { id: 'template_space', tokens: ['space odyssey', 'space', 'cosmic', 'sci fi', 'galaxy'] },
    { id: 'template_retro', tokens: ['retro terminal', 'terminal', 'retro tech', 'retro digital'] },
    { id: 'template_pop', tokens: ['playful pop', 'playful', 'pop', 'fun', 'energetic'] },
    { id: 'template_serif', tokens: ['elegant serif', 'serif', 'editorial elegant', 'timeless elegant'] },
    { id: 'modern_blue', tokens: ['modern blue', 'modern', 'blue modern'] },
    { id: 'elegant', tokens: ['elegant', 'graceful', 'luxurious elegant'] },
    { id: 'warm', tokens: ['warm', 'friendly', 'inviting'] },
    { id: 'retro', tokens: ['retro', 'classic retro'] },
    { id: 'bold', tokens: ['bold', 'strong contrast', 'heavy'] },
    { id: 'standard', tokens: ['standard', 'default', 'basic', 'plain'] },
];

const normalizeTemplateText = (templateStyle?: string): string => (
    (templateStyle || '')
        .toLowerCase()
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\bexpensive looking\b/g, 'expensive')
        .replace(/\bold fashioned\b/g, 'old fashioned')
        .replace(/\s+/g, ' ')
);

export const inferTemplateIdFromIntent = (templateStyle?: string): string | undefined => {
    const normalized = normalizeTemplateText(templateStyle);
    if (!normalized) return undefined;

    const containsToken = (word: string): boolean => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(normalized);
    };
    const hasAny = (words: string[]) => words.some(containsToken);
    if (hasAny(['vintage', 'handcrafted', 'handmade', 'old fashioned', 'paper style', 'premium paper'])) {
        return 'template_vintage';
    }
    if (hasAny(['luxury', 'luxurious', 'gold', 'expensive', 'fancy', 'high end', 'upscale', 'opulent'])) {
        if (normalized.includes('gold') || hasAny(['luxury', 'luxurious', 'expensive', 'opulent'])) return 'template_luxury';
        return 'template_html_2';
    }
    if (hasAny(['futuristic', 'neon', 'cyber', 'cyberpunk', 'electric glow'])) {
        return 'template_neon';
    }
    if (hasAny(['blueprint', 'technical', 'engineering', 'engineered'])) {
        return 'template_blueprint';
    }
    if (normalized.includes('modern') && hasAny(['clean', 'minimal', 'minimalist', 'premium'])) {
        return hasAny(['minimal', 'minimalist', 'premium']) ? 'template_html_3' : 'template_html';
    }

    let bestId: string | undefined;
    let bestScore = 0;

    for (const rule of TEMPLATE_INTENT_RULES) {
        let score = 0;
        for (const token of rule.tokens) {
            if (containsToken(token)) {
                score += token.split(' ').length > 1 ? 3 : 1;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestId = rule.id;
        }
    }

    if ((normalized.includes('fancy') || normalized.includes('expensive') || normalized.includes('luxury')) && normalized.includes('modern')) {
        return normalized.includes('gold') || normalized.includes('expensive') ? 'template_luxury' : 'template_html_2';
    }
    if (normalized.includes('modern') && normalized.includes('fancy')) return 'template_luxury';
    if (normalized.includes('modern') && normalized.includes('clean')) return 'template_html_3';
    if (normalized.includes('modern') && normalized.includes('premium')) return 'template_html_2';
    if (normalized.includes('high') && normalized.includes('end')) return 'template_html_2';
    if (normalized.includes('futuristic') && normalized.includes('neon')) return 'template_neon';
    if (normalized.includes('tech') && normalized.includes('blueprint')) return 'template_blueprint';
    if (normalized.includes('dark') && (normalized.includes('red') || normalized.includes('cinematic'))) return 'template_crimson';

    return bestScore > 0 ? bestId : undefined;
};

export const resolveTemplateId = (templateStyle?: string): string => {
    if (!templateStyle) return 'standard';
    const raw = templateStyle.trim();
    if (KNOWN_TEMPLATE_IDS.has(raw)) return raw;
    const normalized = normalizeTemplateText(templateStyle);
    if (TEMPLATE_STYLE_MAP[normalized]) return TEMPLATE_STYLE_MAP[normalized];
    if (normalized === 'luxury gold') return 'template_luxury';
    if (normalized === 'high end') return 'template_html_2';
    if (normalized === 'minimalist premium') return 'template_html_3';
    if (normalized === 'blueprint tech') return 'template_blueprint';
    if (normalized === 'crimson noir') return 'template_crimson';
    if (normalized === 'neon cyberpunk') return 'template_neon';
    if (normalized === 'vintage craft') return 'template_vintage';
    if (normalized === 'modern single') return 'template_html';
    if (normalized.includes('vintage') || normalized.includes('handcrafted') || normalized.includes('handmade') || normalized.includes('old fashioned') || normalized.includes('paper style')) return 'template_vintage';
    if (normalized.includes('futuristic') || normalized.includes('neon') || normalized.includes('cyber')) return 'template_neon';
    if (normalized.includes('technical') || normalized.includes('engineering') || normalized.includes('blueprint')) return 'template_blueprint';
    if (normalized.includes('expensive') || normalized.includes('luxury') || normalized.includes('luxurious') || normalized.includes('gold')) return 'template_luxury';
    if (normalized.includes('modern') && normalized.includes('fancy')) return 'template_html_2';
    if (normalized.includes('modern') && normalized.includes('glass')) return 'template_html_2_new';
    if (normalized.includes('clean') && normalized.includes('modern')) return normalized.includes('premium') || normalized.includes('minimal') ? 'template_html_3' : 'template_html';
    if (normalized.includes('modern')) return 'modern_blue';
    if (normalized.includes('minimal') && normalized.includes('premium')) return 'template_html_3';
    if (normalized.includes('high') && normalized.includes('end')) return 'template_html_2';
    if (normalized.includes('luxury') || normalized.includes('gold')) return 'template_luxury';
    if (normalized.includes('blueprint')) return 'template_blueprint';
    if (normalized.includes('watercolor')) return 'template_watercolor';
    const inferred = inferTemplateIdFromIntent(normalized);
    if (inferred) return inferred;
    return TEMPLATE_STYLE_MAP[normalized] ?? 'standard';
};
