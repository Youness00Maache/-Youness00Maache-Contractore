import { FormType } from '../types.ts';
import type { Client } from '../types.ts';
import { MasterDocumentType } from '../src/config/docTypeMap.ts';
import { inferTemplateIdFromIntent, resolveTemplateId } from '../src/utils/aiTemplateUtils.ts';

export interface ParsedSetupFields {
    clientName?: string;
    clientId?: string;
    projectName?: string;
    projectAddress?: string;
    clientAddress?: string;
    reportNumber?: string;
    invoiceNumber?: string;
    estimateNumber?: string;
    workOrderNumber?: string;
    changeOrderNumber?: string;
    warrantyNumber?: string;
    receiptNumber?: string;
    poNumber?: string;
    lineItems?: string;
    date?: string;
    dueDate?: string;
    expiryDate?: string;
    completedDate?: string;
    deliveryDate?: string;
    paypalLink?: string;
    paymentLinkRequested?: boolean;
    notes?: string;
    templateId?: string;
    template_style?: string;
    themeColors?: { primary: string; secondary: string };
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyWebsite?: string;
    weather?: string;
    temperature?: string;
    title?: string;
    content?: string;
    description?: string;
    reason?: string;
    coverage?: string;
    conditions?: string;
    duration?: string;
    workerName?: string;
    hoursWorked?: number;
    overtimeHours?: number;
    vendor?: string;
    vendorName?: string;
    vendorAddress?: string;
    category?: string;
    amount?: number;
    paymentMethod?: string;
    signatureRequested?: boolean;
    signatureUrl?: string;
}

function pickLine(text: string, patterns: RegExp[]): string | undefined {
    for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]?.trim()) return m[1].trim().replace(/\*+$/, '').trim();
    }
    return undefined;
}

function cleanFieldValue(value?: string): string | undefined {
    if (!value) return undefined;
    return value
        .trim()
        .replace(/\*+$/g, '')
        .replace(/[.。,;:]+$/g, '')
        .trim() || undefined;
}

function extractLabeledSegment(text: string, labelPattern: string, valuePattern = '[^\\n]+'): string | undefined {
    const nextLabel = '(?=\\s+(?:the\\s+)?(?:web\\s*site|website|site|company\\s+name|company|company\\s+address|address|company\\s+phone|phone\\s+number|phone|number)\\b|$)';
    const patterns = [
        new RegExp(`(?:^|\\b)(?:the\\s+)?${labelPattern}\\s*(?::|=|should\\s+be|is|to|as)?\\s*(${valuePattern}?)${nextLabel}`, 'i'),
        new RegExp(`(?:change|set|make|use|replace|update)\\s+(?:the\\s+)?${labelPattern}\\s*(?:to|as|with|should\\s+be)?\\s*(${valuePattern}?)${nextLabel}`, 'i'),
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        const value = cleanFieldValue(match?.[1]);
        if (value) return value;
    }
    return undefined;
}

function normalizeIntentText(text: string): string {
    return text
        .replace(/\bpremuim\b/gi, 'premium')
        .replace(/\bpremiun\b/gi, 'premium')
        .replace(/\bpremum\b/gi, 'premium')
        .replace(/\bpreminum\b/gi, 'premium')
        .replace(/\btemplete\b/gi, 'template')
        .replace(/\btempalte\b/gi, 'template')
        .replace(/\bclinet\b/gi, 'client')
        .replace(/\bprojet\b/gi, 'project')
        .replace(/\bprojct\b/gi, 'project')
        .replace(/\badress\b/gi, 'address')
        .replace(/\baddres\b/gi, 'address')
        .replace(/\bdat\b/gi, 'date')
        .replace(/\bsigniture\b/gi, 'signature')
        .replace(/\bbleu\b/gi, 'blue')
        .replace(/\bgren\b/gi, 'green')
        .replace(/\bpurpel\b/gi, 'purple');
}

function extractSystemContext(text: string): string {
    return text.match(/\[System Context:\s*([^\]]+)\]/i)?.[1] || '';
}

function hasExplicitRelativeDateIntent(text: string): boolean {
    const trimmed = text.trim();
    if (/^(today|tomorrow|yesterday)[.!]?\s*$/i.test(trimmed)) return true;
    return /\b(?:date|report date)\b[:\s-]*(today|tomorrow|yesterday)\b/i.test(trimmed)
        || /\b(?:use|set|change|make)\b[\s\w]{0,20}\b(?:date|report date)\b[\s:=-]*(?:to\s+)?(today|tomorrow|yesterday)\b/i.test(trimmed)
        || /\b(?:use|set|change|make)\b[\s\w]{0,12}\b(today|tomorrow|yesterday)\b/i.test(trimmed);
}

function parseDateFromText(text: string): string | undefined {
    const localIsoDate = (date: Date): string =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const monthNumbers: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    if (/\btoday\b/i.test(text) && hasExplicitRelativeDateIntent(text)) return localIsoDate(new Date());
    if (/\btomorrow\b/i.test(text) && hasExplicitRelativeDateIntent(text)) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return localIsoDate(d);
    }
    if (/\byesterday\b/i.test(text) && hasExplicitRelativeDateIntent(text)) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return localIsoDate(d);
    }
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    const named = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
    if (named) {
        const month = monthNumbers[named[1].toLowerCase()];
        const day = Number(named[2]);
        if (month && day >= 1 && day <= 31) return `${named[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const namedNoComma = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(20\d{2})\b/i);
    if (namedNoComma) {
        const month = monthNumbers[namedNoComma[1].toLowerCase()];
        const day = Number(namedNoComma[2]);
        if (month && day >= 1 && day <= 31) return `${namedNoComma[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const slash = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
    if (slash) {
        const month = Number(slash[1]);
        const day = Number(slash[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${slash[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    return undefined;
}

function parseTemplateFromText(text: string): { templateId?: string; template_style?: string } {
    const fuzzy = normalizeIntentText(text).replace(/data:image\/[^\s\n*]+/gi, '');
    const templateDescription = pickLine(fuzzy, [
        /templateDescription[:\s*]+([^\n*]+)/i,
        /template_style[:\s*]+([^\n*]+)/i,
        /templateId[:\s*]+([^\n*]+)/i,
        /template\s+description[:\s*]+([^\n*]+)/i,
        /document\s+template\s*\/\s*design\s+style[:\s*]+([^\n*]+)/i,
        /template\s*(?:design|style)?[:\s*]+([^\n*]+)/i,
    ]);
    if (templateDescription) {
        return {
            template_style: templateDescription,
            templateId: resolveTemplateId(templateDescription),
        };
    }

    const styleMatch = fuzzy.match(/\b(?:template|design|style)\s*(?:description|named|called|as|to|:)?\s*([a-z][a-z\s,-]{1,120})/i)
        || fuzzy.match(/\b(standard|professional|elegant|warm|retro|modern blue|modern|classic|corporate|minimalist premium|minimalist|minimal|premium|bold|high end|glassmorphism|gradient|luxury gold|luxury|neon cyberpunk|neon|organic nature|nature|geometric bold|geometric|pastel soft|pastel|vintage craft|vintage|blueprint tech|blueprint|abstract memphis|memphis|crimson noir|crimson|watercolor|swiss grid|swiss|space odyssey|retro terminal|playful pop|playful|elegant serif|serif|fancy|stylish)\s+(?:template|design|style)\b/i)
        || fuzzy.match(/\b(?:use|choose|select|make\s+it|set\s+it\s+to)\s+(?:the\s+)?(standard|premium|modern single|high end|glassmorphism|minimalist premium|gradient|neon cyberpunk|luxury gold|organic nature|geometric bold|pastel soft|vintage craft|blueprint tech|abstract memphis|crimson noir|watercolor|swiss grid|space odyssey|retro terminal|playful pop|elegant serif|modern|fancy|stylish)\b/i)
        || fuzzy.match(/\b(?:want|wanted|need|prefer|pick)\s+(?:a|an|the)?\s*(standard|premium|modern single|high end|glassmorphism|minimalist premium|gradient|neon cyberpunk|luxury gold|organic nature|geometric bold|pastel soft|vintage craft|blueprint tech|abstract memphis|crimson noir|watercolor|swiss grid|space odyssey|retro terminal|playful pop|elegant serif|modern|fancy|stylish)\b/i)
        || fuzzy.match(/\b(modern\s+and\s+fancy|fancy\s+modern|modern\s+fancy)\b/i);
    if (styleMatch) {
        const style = styleMatch[1].toLowerCase().replace(/\b(for|with|and|please|document|report)\b.*$/i, '').trim();
        return { template_style: style, templateId: resolveTemplateId(style) };
    }
    const inferred = inferTemplateIdFromIntent(fuzzy);
    if (inferred) {
        return { template_style: fuzzy, templateId: inferred };
    }
    return {};
}

function parseThemeColors(text: string): { primary: string; secondary: string } | undefined {
    const colorNames: Record<string, string> = {
        black: '#000000', white: '#ffffff', gray: '#666666', grey: '#666666',
        red: '#dc2626', blue: '#2563eb', green: '#16a34a', yellow: '#facc15',
        orange: '#f97316', purple: '#7c3aed', pink: '#ec4899', teal: '#0d9488',
        cyan: '#0891b2', navy: '#1e3a8a', gold: '#d97706', brown: '#92400e',
        slate: '#475569', lime: '#65a30d', indigo: '#4f46e5',
    };
    const normalizeColor = (value?: string): string | undefined => {
        if (!value) return undefined;
        const clean = value.trim().toLowerCase().replace(/[^#a-z0-9]/g, '');
        if (/^#[0-9a-f]{3,8}$/i.test(clean)) return clean;
        if (/^[0-9a-f]{3,8}$/i.test(clean)) return `#${clean}`;
        return colorNames[clean];
    };

    const fuzzy = normalizeIntentText(text);
    const serialized = fuzzy.match(/themeColors\s*:\s*\{\s*"primary"\s*:\s*"([^"]+)"\s*,\s*"secondary"\s*:\s*"([^"]+)"\s*\}/i);
    if (serialized) {
        return {
            primary: normalizeColor(serialized[1]) || serialized[1],
            secondary: normalizeColor(serialized[2]) || serialized[2],
        };
    }
    // Bare numbers are never colors ("1500 and 2000 sq ft"), only #hex or color names (AI-016).
    const colorToken = '(#[0-9a-f]{3}(?:[0-9a-f]{3})?\\b|black|white|gr[ae]y|red|blue|green|yellow|orange|purple|pink|teal|cyan|navy|gold|brown|slate|lime|indigo)';
    const colorTokenNoCapture = '(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?\\b|black|white|gr[ae]y|red|blue|green|yellow|orange|purple|pink|teal|cyan|navy|gold|brown|slate|lime|indigo)';
    const primary = normalizeColor(fuzzy.match(new RegExp(`primary\\s*(?:color)?[:\\s]*${colorToken}`, 'i'))?.[1]);
    const secondary = normalizeColor(fuzzy.match(new RegExp(`secondary\\s*(?:color)?[:\\s]*${colorToken}`, 'i'))?.[1]);
    const mentionsColors = /\b(colou?rs?|theme|primary|secondary|brand)\b/i.test(fuzzy);
    const pair = fuzzy.match(new RegExp(`(?:(?:primary\\s*(?:&|and)?\\s*secondary\\s*)?colou?rs?|theme|primary\\s*colou?r)\\s*(?:are|as|to|:)?\\s*(${colorTokenNoCapture})\\s*(?:(?:and|,|/)\\s*)(${colorTokenNoCapture})`, 'i'))
        || (mentionsColors ? fuzzy.match(new RegExp(`\\b(${colorTokenNoCapture})\\s+(?:and\\s+)?(${colorTokenNoCapture})\\b`, 'i')) : null);
    const pairPrimary = normalizeColor(pair?.[1]);
    const pairSecondary = normalizeColor(pair?.[2]);

    if (primary || pairPrimary) {
        return {
            primary: primary || pairPrimary || '#000000',
            secondary: secondary || pairSecondary || '',
        };
    }
    return undefined;
}

function matchClientByName(text: string, clients?: Client[]): { clientName?: string; clientId?: string } {
    if (!clients?.length) return {};
    const lower = text.toLowerCase();
    for (const c of clients) {
        const name = c.name?.trim();
        if (!name || name.length < 3) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
            return { clientName: c.name, clientId: c.id };
        }
    }
    return {};
}

function matchClientFromSystemContext(systemContext: string, clients?: Client[]): { clientName?: string; clientId?: string; projectAddress?: string } {
    if (!systemContext || !clients?.length) return {};
    const idMatch = systemContext.match(/ClientID:\s*([^\s,]+)\s*\(([^)]+)\)/i);
    const addressMatch = systemContext.match(/ClientAddress:\s*([^,\]]+)/i);
    if (idMatch) {
        const client = clients.find(c => c.id === idMatch[1]) || clients.find(c => c.name.toLowerCase() === idMatch[2].toLowerCase());
        if (client) return { clientName: client.name, clientId: client.id, projectAddress: addressMatch?.[1]?.trim() || client.address || undefined };
        return { clientName: idMatch[2], clientId: idMatch[1], projectAddress: addressMatch?.[1]?.trim() };
    }
    return {};
}

function parseClientAndAddressFromText(text: string): { clientName?: string; clientAddress?: string; projectAddress?: string } {
    const stop = '(?=\\s+(?:invoice\\s+(?:#|number)|estimate\\s+(?:#|number)|issue\\s+date|due\\s+date|line\\s+items?|use\\s+|include\\s+|notes?\\b|review\\b)|[.\\n]|$)';
    const match = text.match(new RegExp(`\\bclient\\s+name\\s+(.+?)\\s+(?:at|address|project\\s+address)\\s+(.+?)${stop}`, 'i'))
        || text.match(new RegExp(`\\bfor\\s+client\\s+(.+?)\\s+(?:at|address|project\\s+address)\\s+(.+?)${stop}`, 'i'));
    if (!match) return {};
    return {
        clientName: cleanFieldValue(match[1]),
        clientAddress: cleanFieldValue(match[2]),
        projectAddress: cleanFieldValue(match[2]),
    };
}

function parseLineItemsText(text: string): string | undefined {
    const line = pickLine(text, [
        /line\s+items?\s*(?:\([^)]*\))?[:\s*]+([^\n]+)/i,
        /items?\s*(?:to\s+(?:invoice|bill|order))?[:\s*]+([^\n]+)/i,
        /\badd\s+(.+?(?:\bat\b|\@)\s*\$?\d+(?:\.\d+)?[^\n.]*)/i,
    ]);
    if (!line) return undefined;
    return line
        .replace(/\s+\b(?:use|include|notes?|review|do\s+not\s+save)\b[\s\S]*$/i, '')
        .replace(/\s+\band\b\s+(?=\d+(?:\.\d+)?\s+[a-z])/gi, '; ')
        .trim();
}

export function parseSetupFieldsFromPrompt(
    text: string,
    docType: MasterDocumentType | string | null,
    clients?: Client[]
): ParsedSetupFields {
    const systemContext = extractSystemContext(text);
    const t = normalizeIntentText(text.replace(/\[System Context:[^\]]*\]/gi, '')).trim();
    const out: ParsedSetupFields = {};

    const explicitClientMatch = parseClientAndAddressFromText(t);
    const contextClientMatch = matchClientFromSystemContext(systemContext, clients);
    const textClientMatch = explicitClientMatch.clientName || contextClientMatch.clientName
        ? {}
        : matchClientByName(t, clients);
    Object.assign(out, textClientMatch, contextClientMatch, explicitClientMatch);

    out.clientName = cleanFieldValue(out.clientName || pickLine(t, [
        /client\s+name\s*(?::|=|is|to)?\s*([^,\n.*]+?)(?=\s+(?:using|with|for|on|report|template|date|primary|secondary|no\s+signature)\b|[,\n.*]|$)/i,
        /(?:change|set|make|choose|select|use)\s+(?:the\s+)?client\s+(?:to|as)?\s*([^\n.,*]+)/i,
        /for\s+client[:\s]+([^,\n.*]+?)(?=\s+(?:using|with|for|on|report|template|date|primary|secondary|no\s+signature)\b|[,\n.*]|$)/i,
    ]));

    // Only explicit project labels count; "for John Smith" / "for today" are not project names (AI-016).
    out.projectName = cleanFieldValue(pickLine(t, [
        /\bproject\s+name\s*(?::|is|=)\s*([^\n*.,]+)/i,
        /\bproject\s*:\s*([^\n*.,]+)/i,
        /(?:set|use|make|change)\s+(?:the\s+)?project\s+(?:name\s+)?(?:to|as)\s*([^\n.,*]+)/i,
        /(?:for|at)\s+(?:the\s+)?project\s+(?!(?:name|address)\b)([A-Za-z][A-Za-z0-9\s.\-]{1,60}?)(?:\s*\.|,|\n|$)/i,
    ]));

    out.projectAddress = pickLine(t, [
        /project\s*\/\s*site\s*address[:\s*]+([^\n*]+)/i,
        /(?:site|project)\s+address[:\s*]+([^\n*]+)/i,
    ]);
    out.clientAddress = out.clientAddress || pickLine(t, [
        /client\s+address[:\s*]+([^\n*]+)/i,
        /(?:billing|project)\s+address[:\s*]+([^\n*]+)/i,
    ]);
    if (!out.projectAddress && out.clientAddress) out.projectAddress = out.clientAddress;

    out.reportNumber = cleanFieldValue(pickLine(t, [
        /\b(DR-[A-Z0-9-]+)\b/i,
        /report\s+name\s*\/\s*report\s+number[:\s*]+(.+?)(?=\s+Report (?:details|date)\b|\s+Date\b|\s+Template\b|\s+Signature\b|\n|$)/i,
        /(?:daily\s+)?report\s*(?:#|number|name|id|title)[:\s*]+(.+?)(?=\s+Report (?:details|date)\b|\s+Date\b|\s+Template\b|\s+Signature\b|\n|$)/i,
    ]));
    out.invoiceNumber = pickLine(t, [
        /invoice\s*(?:#|number|no\.?|id)[:\s*]+([A-Z0-9][A-Z0-9-]+)/i,
        /\b(INV-[A-Z0-9-]+)\b/i,
    ]);
    out.estimateNumber = pickLine(t, [
        /estimate\s*(?:#|number|no\.?|id)[:\s*]+([A-Z0-9][A-Z0-9-]+)/i,
        /\b(EST-[A-Z0-9-]+)\b/i,
    ]);
    out.workOrderNumber = pickLine(t, [
        /work\s+order\s*(?:#|number|no\.?|id)[:\s*]+([A-Z0-9][A-Z0-9-]+)/i,
        /\b(WO-[A-Z0-9-]+)\b/i,
    ]);
    out.changeOrderNumber = pickLine(t, [
        /change\s+order\s*(?:#|number|no\.?|id)[:\s*]+([A-Z0-9][A-Z0-9-]+)/i,
        /\b(CO-[A-Z0-9-]+)\b/i,
    ]);
    out.warrantyNumber = pickLine(t, [
        /warranty\s*(?:#|number|no\.?|id)[:\s*]+([A-Z0-9][A-Z0-9-]+)/i,
        /\b(WAR-[A-Z0-9-]+)\b/i,
    ]);
    out.receiptNumber = pickLine(t, [
        /receipt\s*(?:#|number|no\.?|id)[:\s*]+([A-Z0-9][A-Z0-9-]+)/i,
        /\b(REC-[A-Z0-9-]+)\b/i,
    ]);
    out.poNumber = pickLine(t, [
        /(?:purchase\s+order|po)\s*(?:#|number|no\.?|id)[:\s*]+([A-Z0-9][A-Z0-9-]+)/i,
        /\b(PO-[A-Z0-9-]+)\b/i,
    ]);

    out.date = parseDateFromText(t);
    const dueDateText = t.match(/\bdue\s+date\s*(?:is|:)?\s*([^\n.]+)/i)?.[1];
    if (dueDateText) out.dueDate = parseDateFromText(dueDateText);
    const expiryDateText = t.match(/\b(?:expiry|expiration|valid\s+until)\s+date\s*(?:is|:)?\s*([^\n.]+)/i)?.[1];
    if (expiryDateText) out.expiryDate = parseDateFromText(expiryDateText);
    const completedDateText = t.match(/\b(?:completion|completed)\s+date\s*(?:is|:)?\s*([^\n.]+)/i)?.[1];
    if (completedDateText) out.completedDate = parseDateFromText(completedDateText);
    const deliveryDateText = t.match(/\b(?:delivery|deliver\s+by)\s+date\s*(?:is|:)?\s*([^\n.]+)/i)?.[1];
    if (deliveryDateText) out.deliveryDate = parseDateFromText(deliveryDateText);
    out.lineItems = parseLineItemsText(t);
    const paymentLink = t.match(/\b(?:payment\s+link|paypal\s+link)\s*(?:is|:)?\s*(https?:\/\/[^\s,\n]+)/i)?.[1]?.replace(/[.;)]+$/g, '');
    if (paymentLink) {
        out.paypalLink = paymentLink;
        out.paymentLinkRequested = true;
    } else if (/\binclude\s+(?:a\s+)?(?:payment|paypal)\s+link\b/i.test(t)) {
        out.paymentLinkRequested = true;
    }
    out.notes = pickLine(t, [
        /\bnotes?\b\s*(?:is|are|:)\s*([^\n.]+)/i,
        /\badd\s+(?:a\s+)?notes?\b\s*(?:is|:|saying|that)?\s*([^\n.]+)/i,
    ]);
    out.description = pickLine(t, [
        /(?:work|change|payment)\s+description\s*(?:is|:)?\s*([^\n.]+)/i,
        /description\s*(?:is|:)?\s*([^\n.]+)/i,
    ]);
    out.reason = pickLine(t, [
        /reason(?:\s+for\s+change)?\s*(?:is|:)?\s*([^\n.]+)/i,
    ]);
    out.coverage = pickLine(t, [
        /(?:warranty\s+)?coverage\s*(?:is|:)?\s*([^\n.]+)/i,
    ]);
    out.conditions = pickLine(t, [
        /(?:warranty\s+)?conditions?\s*(?:are|is|:)?\s*([^\n.]+)/i,
    ]);
    out.duration = pickLine(t, [
        /(?:warranty\s+)?duration\s*(?:is|:)?\s*([^\n.]+)/i,
    ]);
    out.workerName = pickLine(t, [
        /worker\s+name\s*(?:is|:)?\s*([^\n,.]+)/i,
        /timesheet\s+for\s+([^\n,.]+)/i,
    ]);
    const hoursWorked = pickLine(t, [
        /hours\s+worked\s*(?:are|is|:)?\s*(\d+(?:\.\d+)?)/i,
        /(?:total\s+)?hours\s*(?:are|is|:)?\s*(\d+(?:\.\d+)?)/i,
    ]);
    if (hoursWorked) out.hoursWorked = Number(hoursWorked);
    const overtimeHours = pickLine(t, [
        /overtime\s+hours?\s*(?:are|is|:)?\s*(\d+(?:\.\d+)?)/i,
    ]);
    if (overtimeHours) out.overtimeHours = Number(overtimeHours);
    out.vendorName = pickLine(t, [
        /vendor\s+name\s*(?:is|:)?\s*([^\n,.]+)/i,
    ]);
    out.vendor = out.vendorName || pickLine(t, [
        /vendor\s*(?:is|:)?\s*([^\n,.]+)/i,
    ]);
    out.vendorAddress = pickLine(t, [
        /vendor\s+address\s*(?:is|:)?\s*([^\n.]+)/i,
    ]);
    out.category = pickLine(t, [
        /(?:expense\s+)?category\s*(?:is|:)?\s*(fuel|food|material|other)\b/i,
    ]);
    const amount = pickLine(t, [
        /(?:receipt\s+)?amount\s*(?:is|:)?\s*\$?([\d,]+(?:\.\d+)?)/i,
        /(?:paid|payment)\s+(?:amount\s+)?(?:is|of|:)?\s*\$?([\d,]+(?:\.\d+)?)/i,
    ]);
    if (amount) out.amount = Number(amount.replace(/,/g, ''));
    out.paymentMethod = pickLine(t, [
        /payment\s+method\s*(?:is|:)?\s*([^\n,.]+)/i,
        /paid\s+(?:by|with|via)\s+([^\n,.]+)/i,
    ]);
    Object.assign(out, parseTemplateFromText(t));
    out.themeColors = parseThemeColors(t);

    out.companyWebsite = extractLabeledSegment(t, '(?:company\\s+)?(?:web\\s*site|website|site)', '[^\\s,\\n*]+(?:\\.[^\\s,\\n*]+)+');
    out.companyName = extractLabeledSegment(t, 'company\\s+name')
        || cleanFieldValue(t.match(/(?:change|set|make|use|replace|update)\s+(?:the\s+)?company\s+(?:name\s+)?(?:to|as|with|should\s+be)\s*([^.,\n]+)/i)?.[1])
        || cleanFieldValue(t.match(/(?:^|[.\n])\s*(?:the\s+)?company\s*(?:name\s*)?(?::|=|should\s+be|is|to|as)\s*([^.,\n]+)/i)?.[1]);
    out.companyAddress = extractLabeledSegment(t, '(?:company\\s+)?address');
    out.companyPhone = extractLabeledSegment(t, '(?:company\\s+)?phone(?:\\s+number)?');

    const signaturePreference = pickLine(t, [
        /signature\s*(?:\/\s*signature)?\s*preference[:\s*]+([^\n*]+)/i,
        /signature[:\s*]+([^\n*]+)/i,
    ]);
    if (signaturePreference && /\b(no|none|unsigned|without|skip)\b/i.test(signaturePreference)) {
        out.signatureRequested = false;
    } else if (signaturePreference && /\b(yes|sign|signed)\b/i.test(signaturePreference)) {
        out.signatureRequested = true;
    } else if (/\b(?:no|without)\s+signature\b/i.test(t) || /\b(do\s+not|don't|dont|no|without)\s+(?:need\s+to\s+)?sign\b/i.test(t) || /\bunsigned\b/i.test(t)) {
        out.signatureRequested = false;
    } else if (/\b(?:sign\s+it|add\s+(?:my\s+)?signature|with\s+(?:my\s+)?signature|include\s+(?:my\s+)?signature|signature\s*:\s*yes)\b/i.test(t)) {
        // Only an explicit request counts; "design", "signed off", "sign-in" do not (AI-016).
        out.signatureRequested = true;
    }
    const signatureUrl = pickLine(t, [
        /signature\s*(?:image|url|data)?[:\s*]+(data:image\/[^\s\n*]+)/i,
    ]);
    if (signatureUrl) {
        out.signatureUrl = signatureUrl;
        out.signatureRequested = true;
    }

    const weatherLine = pickLine(t, [/\bweather\s*(?::|is|was)\s*([^\n*]+)/i]);
    if (weatherLine) out.weather = weatherLine.split(',')[0].trim();
    // A temperature needs a degree sign or the word degrees: "8 crew" / "30 feet" are not temperatures (AI-009).
    const temp = t.match(/(-?\d+(?:\.\d+)?)\s*(?:°|º|degrees?\b)\s*([cf])?\b/i);
    if (temp) out.temperature = `${temp[1]}°${(temp[2] || 'F').toUpperCase()}`;

    if (docType === 'NOTE' || docType === FormType.Note) {
        out.title = cleanFieldValue(pickLine(t, [/note\s*(?:title|name)[:\s*]+([^\n.]+)/i, /title[:\s*]+([^\n.]+)/i]));
        out.content = cleanFieldValue(pickLine(t, [
            /(?:note\s+)?content\s*(?:is|:)?\s*(.+?)(?=\s+Use\b|\s+Template\b|\n|$)/i,
        ]));
    }

    return out;
}

const SETUP_LINE_PATTERNS = [
    /<p[^>]*>\s*(?:<strong>\s*)?(?:Client(?:\s*Name|\s*ID)?|Project(?:\s*Name)?|Report(?:\s*#| Number| Name| ID)?|Report\s*Date|Date|Company(?:\s*Name|\s*Address)?|Site\s*Address|Project\s*\/\s*Site\s*Address|Address|Template|Weather|Temperature|Job\s*ID|Document\s*ID)\s*:?\s*(?:<\/strong>\s*)?[\s\S]*?<\/p>/gi,
    /<p[^>]*>\s*(?:Client|Project|Report|Company|Site|Job|Document)\s*(?:Name|ID|#|Number)?\s*:\s*[^<]+<\/p>/gi,
    /<h3[^>]*>\s*(?:Project\s+Information|Client\s+Information|Report\s+Details|Document\s+Setup|Header\s+Information)\s*<\/h3>/gi,
    /<h2[^>]*>\s*(?:Project\s+Information|Client\s+Information|Report\s+Details)\s*<\/h2>/gi,
    /<ul[^>]*>\s*<li[^>]*>\s*(?:<strong>\s*)?(?:Client|Project|Report|Date|Company)[^<]*[\s\S]*?<\/li>\s*<\/ul>/gi,
    /(?:^|\n)\s*(?:create\s+the\s+document\s+with\s+these\s+setup\s+details|document_type|templateId|templateDescription|template_style|themeColors|signatureRequested|signatureUrl|clientAddress|projectAddress|reportNumber)\s*:\s*[^\n<]*/gi,
    /(?:^|\n)\s*Signature image:\s*attached signature data\s*/gi,
];

/** Remove setup/header lines mistakenly placed in report HTML body */
export function stripSetupMetadataFromHtml(html: string): string {
    if (!html) return '';
    let out = html;
    for (const re of SETUP_LINE_PATTERNS) {
        out = out.replace(re, '');
    }
    return out
        .replace(/<h2>\s*Daily Field Report\s*<\/h2>/i, '<h2>Daily Field Report</h2>')
        .replace(/(<hr>\s*){2,}/gi, '<hr>')
        .replace(/^\s*<hr>\s*/i, '')
        .trim();
}
