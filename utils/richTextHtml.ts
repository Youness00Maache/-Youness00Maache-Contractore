import { FormType } from '../types.ts';
import { stripSetupMetadataFromHtml } from './parseDocumentSetup.ts';

export const RICH_TEXT_AI_FORMAT_RULES = `
## Professional document writer rules (CRITICAL):
- NEVER repeat or paraphrase the user's raw prompt as the finished document.
- Transform brief notes into a complete, professional field/business document.
- Expand short inputs (e.g. "framing, sunny, 8 hours") into realistic construction language.
- Write in third person past tense where appropriate ("Crew completed…", "Work progressed…").
- Use rich HTML only — NO charts, widgets, or infographics.

## Required HTML structure for Daily Reports:
- <h2> title
- <h3> Summary | Work Completed | Crew & Labor | Materials | Equipment | Safety | Issues/Delays | Next Steps
- <ul><li> for lists, <strong> for emphasis, <hr> between major sections
- Allowed: h2,h3,h4,p,strong,em,u,ul,ol,li,br,hr,mark,span (color #1e40af|#64748b|#166534 only)

## Behavior:
- Minimum 6 sections for daily reports even from short prompts.
- Infer realistic details (PPE, QC, coordination) without inventing false claims.
- If user gave weather/crew/hours, weave them into professional prose — do not list prompt fragments.
`.trim();

const ALLOWED_TAGS = new Set([
    'p', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
    'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'mark', 'span', 'div', 'img',
]);

const ALLOWED_STYLE_PROPS = ['color', 'font-weight', 'text-decoration'];

const PLACEHOLDER_PHRASES = [
    'document prepared per site requirements',
    'per site requirements and client coordination',
    'as outlined in the project agreement',
];

export function sanitizeAiHtml(html: string): string {
    if (!html || typeof html !== 'string') return '';
    let out = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/on\w+='[^']*'/gi, '');

    out = out.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag: string, attrs: string) => {
        const t = tag.toLowerCase();
        if (!ALLOWED_TAGS.has(t)) return '';
        if (t === 'img') {
            const src = (attrs.match(/src=["']([^"']+)["']/i) || [])[1];
            if (!src || (!src.startsWith('https://') && !src.startsWith('http://') && !src.startsWith('data:image/'))) {
                return '';
            }
            const alt = (attrs.match(/alt=["']([^"']*)["']/i) || [])[1] || '';
            return `<img src="${src}" alt="${alt.replace(/"/g, '')}" style="max-width:100%;border-radius:8px;" />`;
        }
        if (t === 'span') {
            const styleMatch = attrs.match(/style=["']([^"']*)["']/i);
            if (!styleMatch) return '<span>';
            const safe = styleMatch[1].split(';').filter(part => {
                const [k, v] = part.split(':').map(s => s.trim().toLowerCase());
                return ALLOWED_STYLE_PROPS.includes(k) && /^#[0-9a-f]{3,8}$/i.test(v || '');
            }).join('; ');
            return safe ? `<span style="${safe}">` : '<span>';
        }
        return full.replace(attrs, '');
    });

    return out.trim();
}

export function stripHtmlToText(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** AI returned generic filler, empty body, or broken markup */
export function isWeakOrPlaceholderHtml(html: string): boolean {
    const clean = sanitizeAiHtml(html || '');
    const text = stripHtmlToText(clean).toLowerCase();
    if (!text || text.length < 120) return true;
    if (/\bundefined\b/.test(text)) return true;
    if (PLACEHOLDER_PHRASES.some(p => text.includes(p))) return true;
    const h3Count = (clean.match(/<h3[\s>]/gi) || []).length;
    if (h3Count < 3) return true;
    return false;
}

/** Detect when AI output mostly mirrors the user prompt instead of writing a real report */
export function isContentEchoingPrompt(userPrompt: string, html: string): boolean {
    const prompt = userPrompt
        .replace(/\[System Context:[^\]]*\]/gi, '')
        .replace(/User Prompt:\s*"/i, '')
        .replace(/"$/, '')
        .trim()
        .toLowerCase();
    const body = stripHtmlToText(html).toLowerCase();
    if (!prompt || !body || body.length < 20) return true;

    const promptWords = prompt.split(/\s+/).filter(w => w.length > 2);
    if (promptWords.length === 0) return false;

    const matched = promptWords.filter(w => body.includes(w)).length;
    const ratio = matched / promptWords.length;
    const expansionRatio = body.length / Math.max(prompt.length, 1);

    if (ratio >= 0.75 && expansionRatio < 2.2) return true;
    if (prompt.length > 12 && body.includes(prompt.slice(0, Math.min(prompt.length, 80)))) return true;
    return false;
}

export interface ReportFacts {
    trade?: string;
    weather?: string;
    temperature?: string;
    crewSize?: number;
    laborHours?: number;
    projectName?: string;
    clientName?: string;
    siteCondition?: string;
    hasSafetyClear?: boolean;
    hasInspection?: boolean;
    workItems: string[];
    materials: string[];
    equipment: string[];
    issues: string[];
    nextSteps: string[];
}

function extractDailyNarrative(prompt: string): string {
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    const patterns = [
        /Report details\s*\/\s*description:\s*(.+?)(?=\s+Signature image:|\s+create the document|\s+signatureRequested:|\s+templateId:|\s+themeColors:|\s+reportNumber:|\s+document_type:|\s+templateDescription:|\s+template_style:|\s+description_html:|$)/i,
        /content:\s*(.+?)(?=\s+Signature image:|\s+create the document|\s+signatureRequested:|\s+templateId:|\s+themeColors:|\s+reportNumber:|\s+document_type:|\s+templateDescription:|\s+template_style:|\s+description_html:|$)/i,
        /description_html:\s*(.+?)(?=\s+Signature image:|\s+create the document|\s+signatureRequested:|\s+templateId:|\s+themeColors:|\s+reportNumber:|\s+document_type:|\s+templateDescription:|\s+template_style:|$)/i,
    ];
    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match?.[1]?.trim()) return match[1].trim();
    }
    return normalized
        .replace(/\bSignature image:\s*attached signature data\b/gi, '')
        .replace(/\b(?:create the document with these setup details|signatureRequested|signatureUrl|templateId|themeColors|reportNumber|document_type|templateDescription|template_style|description_html)\s*:\s*[^:]+?(?=\s+\w+\s*:|$)/gi, '')
        .trim();
}

function parseSectionBullets(text: string, sectionPatterns: RegExp[]): string[] {
    for (const pattern of sectionPatterns) {
        const re = new RegExp(
            `${pattern.source}[\\s:*]*([\\s\\S]*?)(?=\\n\\s*\\*\\s*[A-Za-z][^\\n]*:|\\n\\s*#{1,3}\\s|$)`,
            'i'
        );
        const m = text.match(re);
        if (m?.[1]) {
            const items = m[1]
                .split('\n')
                .map(l => l.replace(/^\s*[\*\-•]\s*/, '').trim())
                .filter(l => l.length > 3 && !/^[\w\s]+:\s*$/.test(l));
            if (items.length) return items.slice(0, 12);
        }
    }
    return [];
}

function parseAllBullets(text: string): string[] {
    return text
        .split('\n')
        .map(l => l.replace(/^\s*[\*\-•]\s*/, '').trim())
        .filter(l => l.length > 8);
}

export function extractReportFacts(prompt: string): ReportFacts {
    const t = prompt;
    const facts: ReportFacts = { workItems: [], materials: [], equipment: [], issues: [], nextSteps: [] };

    if (/\bframing\b/i.test(t)) facts.trade = 'framing';
    else if (/\bdrywall\b/i.test(t)) facts.trade = 'drywall';
    else if (/\belectrical\b/i.test(t)) facts.trade = 'electrical';
    else if (/\bplumb/i.test(t)) facts.trade = 'plumbing';
    else if (/\broof/i.test(t)) facts.trade = 'roofing';
    else facts.trade = 'general construction';

    const weatherLine = t.match(/weather[:\s*]*([^\n*]+)/i)?.[1]?.trim() || '';
    if (/\bsunny|clear\b/i.test(t)) facts.weather = weatherLine || 'Sunny with favorable visibility';
    else if (/\bwind/i.test(t)) facts.weather = weatherLine || 'Light wind — exterior work monitored';
    else if (/\brain/i.test(t)) facts.weather = 'Rain — interior work prioritized';
    else if (weatherLine) facts.weather = weatherLine.replace(/\*/g, '').trim();

    const tempMatch = weatherLine.match(/(\d+)\s*°?\s*([cf])/i) || t.match(/(\d+)\s*°?\s*([cf])/i);
    if (tempMatch) facts.temperature = `${tempMatch[1]}°${tempMatch[2].toUpperCase()}`;

    const crewMatch = t.match(/crew\s*(?:size)?[:\s*]*(\d+)/i) || t.match(/(\d+)\s*workers?/i);
    if (crewMatch) facts.crewSize = parseInt(crewMatch[1], 10);
    const hoursMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:crew\s+)?hours?/i) || t.match(/total\s+labor[:\s*]*(\d+)/i);
    if (hoursMatch) facts.laborHours = parseFloat(hoursMatch[1]);

    facts.projectName =
        t.match(/(?:at|for)\s+(?:the\s+)?([A-Za-z0-9][A-Za-z0-9\s.\-]{1,40}?)(?:\s+project|\s*\.|,|\*|Project details)/i)?.[1]?.trim()
        || t.match(/project[:\s]+([^\n*]+)/i)?.[1]?.trim();

    facts.clientName = t.match(/client[:\s]+([^\n*]+)/i)?.[1]?.trim();
    facts.siteCondition = t.match(/site\s+condition[:\s*]*([^\n*]+)/i)?.[1]?.trim()
        || (/\bclean\s+and\s+organized\b/i.test(t) ? 'Clean and organized — access routes clear' : '');

    facts.hasSafetyClear = /\bno\s+injur|zero\s+incident|no\s+safety/i.test(t);
    facts.hasInspection = /\binspection\s+scheduled|tomorrow\s+morning/i.test(t);

    facts.workItems = parseSectionBullets(t, [/work\s+completed/i, /installed/i, /completed\s+framing/i]);
    if (!facts.workItems.length) {
        facts.workItems = parseAllBullets(t).filter(line =>
            /framing|room|hallway|ceiling|wall|installed|completed/i.test(line)
            && !/weather|crew|material|equipment|issue|safety|site condition|next step/i.test(line)
        );
    }
    if (!facts.workItems.length && /\bframing\b/i.test(t)) {
        facts.workItems = [
            'Interior wall framing advanced per layout in designated rooms',
            'East hallway framing completed to line and level',
            'Ceiling support blocking installed in targeted areas',
        ];
    }

    facts.materials = parseSectionBullets(t, [/material\s+delivery/i, /materials?\s+used/i, /materials?/i]);
    if (!facts.materials.length) {
        facts.materials = parseAllBullets(t).filter(line =>
            /lumber|stud|anchor|delivery|2x4|metal/i.test(line)
        );
    }

    facts.equipment = parseSectionBullets(t, [/equipment\s+used/i, /equipment/i]);
    if (!facts.equipment.length) {
        facts.equipment = parseAllBullets(t).filter(line =>
            /nail gun|laser|saw|level|tool/i.test(line)
        );
    }

    facts.issues = parseSectionBullets(t, [/minor\s+issue/i, /issues?\/delays?/i, /delay/i, /issue/i]);
    if (!facts.issues.length) {
        const issueLine = parseAllBullets(t).find(line => /mismatch|re-measur|delay|issue/i.test(line));
        if (issueLine) facts.issues = [issueLine];
    }

    facts.nextSteps = parseSectionBullets(t, [/next\s+steps?/i]);
    if (facts.hasInspection && !facts.nextSteps.length) {
        facts.nextSteps = ['Framing inspection scheduled for tomorrow morning — crew to stage completed areas tonight'];
    }

    return facts;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function listHtml(items: string[], fallback: string[]): string {
    const rows = (items.length ? items : fallback).map(i => `<li>${escapeHtml(i)}</li>`).join('');
    return `<ul>${rows}</ul>`;
}

/** Body-only daily report HTML — project/client/date belong in form fields, not the editor */
export function buildRichDailyReportHtml(prompt: string, _ctx?: { projectName?: string; clientName?: string }): string {
    const facts = extractReportFacts(extractDailyNarrative(prompt));
    const trade = facts.trade || 'construction';

    const parts: string[] = [];
    parts.push('<h2>Daily Field Report</h2>');
    parts.push('<hr>');

    parts.push('<h3>Summary</h3>');
    parts.push(`<p>The field team advanced <strong>${escapeHtml(trade)}</strong> scope under ${escapeHtml(facts.weather || 'favorable')} conditions. Production met the daily plan with coordinated material handling and quality verification at hold points.${facts.hasSafetyClear ? ' <strong>No safety incidents</strong> were recorded during this reporting period.' : ''}</p>`);

    parts.push('<h3>Site Conditions</h3>');
    parts.push(`<p>Weather: <strong>${escapeHtml(facts.weather || 'Favorable')}</strong>${facts.temperature ? ` — ${escapeHtml(facts.temperature)}` : ''}. ${facts.siteCondition ? escapeHtml(facts.siteCondition) + '.' : 'Work areas remained accessible with no weather-related stoppages.'}</p>`);

    parts.push('<h3>Work Completed</h3>');
    parts.push(listHtml(facts.workItems, [
        'Completed scheduled framing layout and installation per approved drawings',
        'Verified critical dimensions at openings prior to close-in',
        'Prepared adjacent zones for follow-on trade mobilization',
    ]));

    parts.push('<h3>Crew &amp; Labor</h3>');
    parts.push('<ul>');
    if (facts.crewSize) parts.push(`<li><strong>Crew size:</strong> ${facts.crewSize} workers deployed on site</li>`);
    if (facts.laborHours) parts.push(`<li><strong>Total labor:</strong> ${facts.laborHours} crew-hours recorded</li>`);
    if (!facts.crewSize && !facts.laborHours) parts.push('<li>Crew deployed per daily work plan; hours logged in project records</li>');
    parts.push('<li>Superintendent conducted mid-shift coordination and QC walk-through</li>');
    parts.push('</ul>');

    parts.push('<h3>Materials</h3>');
    parts.push(listHtml(facts.materials, [
        'Framing lumber and fasteners distributed per daily pull list',
        'Connectors and anchors staged at active work faces',
    ]));

    parts.push('<h3>Equipment</h3>');
    parts.push(listHtml(facts.equipment, [
        'Pneumatic fastening tools — operational with routine maintenance',
        'Laser layout equipment — calibrated and in use',
        'Cutting stations — guards and dust control maintained',
    ]));

    parts.push('<h3>Safety</h3>');
    parts.push(`<p>${facts.hasSafetyClear
        ? '<strong>Zero recordable incidents.</strong> Crew maintained full PPE compliance, controlled access at active zones, and housekeeping at egress paths.'
        : 'Pre-shift safety briefing completed. PPE compliance observed throughout the shift; no incidents reported.'}</p>`);

    parts.push('<h3>Issues &amp; Delays</h3>');
    if (facts.issues.length) {
        parts.push(listHtml(facts.issues, []));
        parts.push('<p>Corrective layout verification completed; work resumed without schedule impact beyond the noted hold.</p>');
    } else {
        parts.push('<p>No material delays or coordination conflicts impacted productivity during this reporting period.</p>');
    }

    parts.push('<h3>Next Steps</h3>');
    if (facts.nextSteps.length) {
        parts.push(listHtml(facts.nextSteps, []));
    } else {
        parts.push(`<p>${facts.hasInspection
            ? '<mark>Framing inspection scheduled</mark> for tomorrow morning. Crew will stage completed areas, finalize punch items, and confirm line-and-level documentation tonight.'
            : 'Continue scheduled framing scope, complete QC hold-points, and coordinate deliverables with the superintendent.'}</p>`);
    }

    return stripSetupMetadataFromHtml(sanitizeAiHtml(parts.join('\n')));
}

export function buildRichNoteHtml(prompt: string, title?: string, ctx?: { projectName?: string }): string {
    const clean = prompt.replace(/\[System Context:[^\]]*\]/gi, '').replace(/User Prompt:\s*"/i, '').replace(/"$/, '').trim();
    const facts = extractReportFacts(clean);
    return sanitizeAiHtml([
        `<h2>${escapeHtml(title || 'Site Note')}</h2>`,
        ctx?.projectName ? `<p><strong>Project:</strong> ${escapeHtml(ctx.projectName)}</p>` : '',
        `<p><strong>Date:</strong> ${escapeHtml(new Date().toLocaleDateString())}</p>`,
        '<hr>',
        '<h3>Overview</h3>',
        `<p>Field note documenting observations and completed actions${ctx?.projectName ? ` for <strong>${escapeHtml(ctx.projectName)}</strong>` : ''}.</p>`,
        '<h3>Details</h3>',
        facts.workItems.length
            ? listHtml(facts.workItems, ['See superintendent log for full narrative.'])
            : `<p>${escapeHtml(clean.slice(0, 400) || 'No additional narrative provided.')}</p>`,
        '<h3>Follow-up</h3>',
        '<p>Superintendent to review and file with the active job record.</p>',
    ].filter(Boolean).join('\n'));
}

export function ensureProfessionalHtml(
    userPrompt: string,
    html: string | undefined,
    docType: string,
    ctx?: { projectName?: string; clientName?: string }
): string {
    const isDaily = docType === 'DAILY_REPORT' || docType === FormType.DailyJobReport;
    const isNote = docType === 'NOTE' || docType === FormType.Note;

    let content = sanitizeAiHtml(html || '');
    const needsRebuild = !content
        || isWeakOrPlaceholderHtml(content)
        || isContentEchoingPrompt(userPrompt, content);

    if (needsRebuild) {
        if (isDaily) {
            content = buildRichDailyReportHtml(userPrompt, ctx);
        } else if (isNote) {
            content = buildRichNoteHtml(userPrompt, undefined, ctx);
        } else if (!content) {
            content = sanitizeAiHtml(`<h2>Document</h2><p>Professional draft prepared from field notes.</p>`);
        }
    }

    if (isDaily && isWeakOrPlaceholderHtml(content)) {
        content = buildRichDailyReportHtml(userPrompt, ctx);
    }

    return content;
}

export function stripVisualWidgetsFromDraft<T extends Record<string, unknown>>(draft: T, formType: FormType | string | null): T {
    if (formType !== FormType.DailyJobReport && formType !== FormType.Note) return draft;
    const d = { ...draft };
    delete d.suggested_widgets;
    delete d.widget_data;
    delete d.widget_instances;
    delete d.ai_visual_data;
    return d;
}
