/**
 * Deterministic stand-in for the LLM (AI_PROVIDER=mock). It produces the same ModelOutput
 * shape the real model returns, so the whole pipeline (validation, normalization, UI) can be
 * exercised locally and in tests without an API key. It is deliberately conservative: it only
 * copies facts that appear in the user's text.
 */
import { DOC_LABELS, escapeHtml, normalizeDate, parseLineItemsText, resolveDocKey, toLocalYmd, type DocKey } from './documentSchema.ts';
import {
    isSampleRequest, isSendOnlyRequest, requestHasEstimateOptions, SCOPE_ACTIONS,
    type AppRoute, type ContextFormEstimate, type ContextFormLine, type ModelOutput, type ModelPlanStep, type RouterRequest,
} from './routerContract.ts';
import { scoreKnowledge } from './knowledge.ts';
import { mockFactsAnswer } from './businessFacts.ts';
import { isEstimateOptionsRequest } from './estimateOptionsDraft.ts';

const DOC_PATTERNS: Array<[DocKey, RegExp]> = [
    ['DAILY_REPORT', /\b(daily\s+(?:job\s+|construction\s+|site\s+)?report|site\s+report|field\s+report|job\s+report|daily\s+log)\b/i],
    ['CHANGE_ORDER', /\bchange\s+order\b/i],
    ['PURCHASE_ORDER', /\b(purchase\s+order|p\.?o\.?)\b(?!\s*box)/i],
    ['WORK_ORDER', /\b(work\s+order|service\s+order)\b/i],
    ['MATERIAL_LOG', /\b(material(?:s)?\s+log|materials?\s+used\s+log)\b/i],
    ['TIME_SHEET', /\b(time\s?sheet|time\s+card|timecard)\b/i],
    ['EXPENSE_LOG', /\b(expense(?:s)?(?:\s+log|\s+report)?)\b/i],
    ['WARRANTY', /\b(warranty|guarantee)\b/i],
    ['RECEIPT', /\b(receipt)\b/i],
    ['ESTIMATE', /\b(estimate|quote|proposal|bid)\b/i],
    ['INVOICE', /\b(invoice|bill)\b/i],
    ['NOTE', /\b(note|memo)\b/i],
];

export function detectDocTypeFromText(text: string): DocKey | null {
    for (const [type, re] of DOC_PATTERNS) if (re.test(text)) return type;
    return null;
}

const NAV_RULES: Array<[RegExp, AppRoute]> = [
    [/\b(pipeline|kanban|board)\b/i, '/pipeline'],
    [/\b(export (?:my|all)(?: of my)? data|your data|bookkeeper csv|data export|backup)\b/i, '/settings#data'],
    [/\b(payment|pay(?:ment)? link|payments? (?:&|and) reviews?|google review|financing) settings?\b|\bsettings?\b.*\b(payments?|pay link|reviews?)\b/i, '/settings#payments'],
    [/\b(reminders?|follow-?ups?)\b.*\bsettings?\b|\bsettings?\b.*\breminders?\b|\breminder settings\b/i, '/settings#reminders'],
    [/\b(notifications?|bell|pop-?ups?)\b.*\bsettings?\b|\bsettings?\b.*\bnotifications?\b|\bnotification settings\b/i, '/settings#notifications'],
    [/\b(request(?:-a-quote)? link|quote link|request page|quote requests? settings)\b/i, '/settings#requests'],
    [/\b(billing|my plan|subscription|plan (?:&|and) billing)\b/i, '/settings#billing'],
    [/\b(signature settings|default signature)\b/i, '/settings#signature'],
    [/\b(appearance|dark mode|theme|language settings)\b/i, '/settings#appearance'],
    [/\b(company (?:details|settings|info)|my logo)\b/i, '/settings#company'],
    [/\b(delete (?:my )?account|account settings)\b/i, '/settings#account'],
    [/\b(tutorials?|help (?:page|center)|app tour|guides)\b/i, '/tutorials'],
    [/\b(new job form|create a job page)\b/i, '/jobs/create'],
    [/\b(calendar|schedule|appointments?)\b/i, '/calendar'],
    [/\b(analytics|insights|revenue|earnings|stats|statistics|reports? dashboard)\b/i, '/analytics'],
    [/\b(calculat\w*|profit margin|markup|overhead|bid price)\b/i, '/calculator'],
    [/\b(settings?|preferences)\b/i, '/settings'],
    [/\b(my profile|profile)\b/i, '/profile'],
    [/\b(forum|community)\b/i, '/forum'],
    [/\b(price ?book|saved items?)\b/i, '/pricebook'],
    [/\b(inventory|stock)\b/i, '/inventory'],
    [/\b(clients?|customers?)\b/i, '/clients'],
    [/\b(inbox|communications?|gmail|messages)\b/i, '/communication'],
    [/\b(dashboard|home)\b/i, '/dashboard'],
];

/** Navigation-only intent (used by the browser when the AI service is unreachable). */
export function detectNavigation(text: string): AppRoute | null {
    const t = text.toLowerCase();
    const wantsToGo = /\b(open|go|show|view|navigate|take me|see|check|display)\b/.test(t) || t.trim().split(/\s+/).length <= 3;
    if (!wantsToGo) return null;
    for (const [re, route] of NAV_RULES) if (re.test(t)) return route;
    return null;
}

const NUMBER_PATTERNS: Partial<Record<DocKey, [string, RegExp]>> = {
    INVOICE: ['invoiceNumber', /\b(?:invoice|inv)\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,30})|\b(INV-[\w-]+)/i],
    ESTIMATE: ['estimateNumber', /\b(?:estimate|quote)\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,30})|\b(EST-[\w-]+)/i],
    WORK_ORDER: ['workOrderNumber', /\bwork\s+order\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,30})|\b(WO-[\w-]+)/i],
    DAILY_REPORT: ['reportNumber', /\breport\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,30})|\b(DR-[\w-]+)/i],
    CHANGE_ORDER: ['changeOrderNumber', /\bchange\s+order\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,30})|\b(CO-[\w-]+)/i],
    PURCHASE_ORDER: ['poNumber', /\b(?:purchase\s+order|po)\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,30})|\b(PO-[\w-]+)/i],
    WARRANTY: ['warrantyNumber', /\bwarranty\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,30})|\b(WAR-[\w-]+)/i],
    RECEIPT: ['receiptNumber', /\breceipt\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,30})|\b(REC-[\w-]+)/i],
};

const DATE_TOKEN = '((?:20\\d{2}-\\d{1,2}-\\d{1,2})|(?:\\d{1,2}/\\d{1,2}/20\\d{2})|(?:[A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+20\\d{2})?)|today|tomorrow|yesterday)';

function findDate(text: string, labelRe: string, today: string): string | undefined {
    const m = text.match(new RegExp(`${labelRe}\\s*(?:date)?\\s*(?:is|:|on|of|by)?\\s*${DATE_TOKEN}`, 'i'));
    return m ? normalizeDate(m[1], today) : undefined;
}

function stripCommand(text: string): string {
    return text
        .replace(/^\s*(?:please\s+)?(?:can you\s+)?(?:create|make|write|draft|generate|start|prepare|new|add)\s+(?:me\s+)?(?:a|an|the|my)?\s*/i, '')
        .replace(/^(?:daily\s+(?:job\s+)?report|daily\s+log|site\s+report|note|memo|work\s+order|change\s+order)\s*(?:for\s+today|for\s+this\s+job|for\s+the\s+job)?\s*[:,-]?\s*/i, '')
        .trim();
}

function extractLineItems(text: string): Array<{ description: string; quantity: number; rate: number; supplier?: string }> {
    const segment = text.match(/(?:line\s+items?|items?|materials?)\s*:\s*([^\n]+)/i)?.[1];
    if (segment) return parseLineItemsText(segment);
    const matches = text.match(/\d+(?:\.\d+)?\s+(?:x\s+)?[a-z][^;,.\n]*?\s+(?:at|@)\s*\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:each|ea|per\s+\w+))?/gi) || [];
    return matches.flatMap(m => parseLineItemsText(m));
}

function extractFields(docType: DocKey, text: string, today: string): { fields: Array<{ key: string; value: string }>; line_items: ModelOutput['line_items'] } {
    const f: Record<string, string> = {};
    const num = NUMBER_PATTERNS[docType];
    if (num) {
        const m = text.match(num[1]);
        if (m) f[num[0]] = (m[1] || m[2]).replace(/[.,]$/, '');
    }
    const due = findDate(text, '\\bdue', today);
    const main = findDate(text, '\\b(?:dated?|on)', today);
    switch (docType) {
        case 'INVOICE': if (due) f.dueDate = due; if (main) f.issueDate = main; break;
        case 'ESTIMATE': { const exp = findDate(text, '\\b(?:valid\\s+until|expires?|expiry)', today); if (exp) f.expiryDate = exp; if (main) f.issueDate = main; break; }
        case 'WARRANTY': { const done = findDate(text, '\\b(?:completed|completion)', today); if (done) f.completedDate = done; break; }
        case 'PURCHASE_ORDER': { const d = findDate(text, '\\b(?:deliver(?:y|ed)?(?:\\s+by)?)', today); if (d) f.deliveryDate = d; if (main) f.date = main; break; }
        default: if (main) f.date = main;
    }
    const tax = text.match(/\b(\d+(?:\.\d+)?)\s*%\s*tax|\btax(?:\s+rate)?\s*(?:of|:)?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (tax && (docType === 'INVOICE')) f.taxRate = tax[1] || tax[2];
    const clientFor = text.match(/\bfor\s+client\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/);
    if (clientFor && ['INVOICE', 'ESTIMATE', 'RECEIPT', 'WORK_ORDER', 'CHANGE_ORDER'].includes(docType)) f.clientName = clientFor[1];

    const body = stripCommand(text);
    switch (docType) {
        case 'DAILY_REPORT': {
            const sentences = body.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
            if (sentences.length) f.content = `<h3>Work Completed</h3><ul>${sentences.map(s => `<li>${escapeHtml(s.replace(/^[-•]\s*/, ''))}</li>`).join('')}</ul>`;
            const weather = text.match(/\b(sunny|clear|cloudy|overcast|rain(?:y|ing)?|snow(?:y|ing)?|windy|foggy|stormy|hot|cold)\b/i);
            if (weather) f.weather = weather[1][0].toUpperCase() + weather[1].slice(1).toLowerCase();
            const temp = text.match(/(-?\d+)\s*(?:°|degrees?)\s*([cf])?/i);
            if (temp) f.temperature = `${temp[1]}°${(temp[2] || 'F').toUpperCase()}`;
            break;
        }
        case 'NOTE': {
            const title = text.match(/\b(?:titled|title|called)\s*:?\s*"?([^".\n]{3,80})"?/i);
            if (title) f.title = title[1].trim();
            if (body) f.content = `<p>${escapeHtml(body)}</p>`;
            break;
        }
        case 'WORK_ORDER': if (body) f.description = body; break;
        case 'CHANGE_ORDER': {
            if (body) f.description = body;
            const reason = text.match(/\b(client request|owner request|unforeseen condition|design change|code requirement)\b/i);
            if (reason) f.reason = reason[1].replace(/\b\w/g, ch => ch.toUpperCase());
            break;
        }
        case 'TIME_SHEET': {
            const worker = text.match(/\b(?:for|worker|employee)\s*:?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
            if (worker) f.workerName = worker[1];
            const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b(?!\s*(?:of\s+)?overtime)/i);
            if (hours) f.hoursWorked = hours[1];
            const ot = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of\s+)?overtime/i);
            if (ot) f.overtimeHours = ot[1];
            break;
        }
        case 'WARRANTY': {
            const dur = text.match(/\b(\d+)\s*[- ]?(years?|months?)\b/i);
            if (dur) f.duration = `${dur[1]} ${dur[2].toLowerCase()}`;
            const cov = text.match(/\bcover(?:s|ing|age)?\s*:?\s*([^.\n]+)/i);
            if (cov) f.coverage = cov[1].trim();
            break;
        }
        case 'RECEIPT': {
            const amount = text.match(/\$\s*(\d[\d,]*(?:\.\d+)?)|\b(?:received|paid|payment of|amount)\s*(?:of)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/i);
            if (amount) f.amount = (amount[1] || amount[2]).replace(/,/g, '');
            const method = text.match(/\b(check|cheque|cash|credit card|debit card|card|bank transfer|transfer|zelle|venmo|paypal)\b/i);
            if (method) f.paymentMethod = method[1].replace(/\b\w/g, ch => ch.toUpperCase());
            break;
        }
        case 'EXPENSE_LOG': {
            const vendor = text.match(/\b(?:at|from)\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/);
            if (vendor) f.vendor = vendor[1];
            if (/\b(gas|fuel|diesel)\b/i.test(text)) f.category = 'Fuel';
            else if (/\b(lunch|food|meal|dinner|breakfast)\b/i.test(text)) f.category = 'Food';
            else if (/\b(lumber|material|supplies|hardware|drywall|pipe)\b/i.test(text)) f.category = 'Material';
            const spent = text.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(?:on|for)\s+([a-z][\w\s-]{1,40}?)(?=\s+(?:at|from)\b|[.,\n]|$)/i);
            if (spent) return { fields: Object.entries(f).map(([key, value]) => ({ key, value })), line_items: [{ description: spent[2].trim(), quantity: 1, rate: Number(spent[1].replace(/,/g, '')) }] };
            break;
        }
        case 'PURCHASE_ORDER': {
            const vendor = text.match(/\b(?:from|vendor|supplier)\s*:?\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/);
            if (vendor) f.vendorName = vendor[1];
            break;
        }
        default: break;
    }
    const items = ['INVOICE', 'ESTIMATE', 'CHANGE_ORDER', 'PURCHASE_ORDER', 'MATERIAL_LOG', 'EXPENSE_LOG'].includes(docType)
        ? extractLineItems(text)
        : [];
    return {
        fields: Object.entries(f).map(([key, value]) => ({ key, value })),
        line_items: items.map(i => ({ description: i.description, quantity: i.quantity, rate: i.rate, unit_cost: docType === 'MATERIAL_LOG' ? i.rate : null, supplier: i.supplier ?? null })),
    };
}

// ───────────────────────────── good / better / best estimate options ─────────────────────────────

// isEstimateOptionsRequest lives in estimateOptionsDraft.ts (routerContract.ts needs it too); exported here as before.
export { isEstimateOptionsRequest };

/** Option labels a user types before an option's lines ("Better: …"), longest first. */
const OPTION_LABELS = [
    'option [a-d1-4]', 'opci[oó]n [a-d1-4]', 'formule [a-d1-4]',
    'mid-range', 'midrange', 'good', 'better', 'best', 'basic', 'standard', 'premium', 'deluxe', 'luxury', 'economy', 'budget', 'essential',
    'bueno', 'mejor', '[oó]ptimo', 'b[aá]sic[oa]', 'est[aá]ndar', 'econ[oó]mic[oa]', 'lujo',
    'bon', 'meilleur', 'excellent', 'essentiel(?:le)?', 'de base', 'confort', 'luxe',
    'gut', 'besser', 'beste', 'basis', 'komfort',
];
const SHARED_LABELS = [
    'in every option', 'every option', 'all options', 'included in all', 'in all options', 'shared', 'all',
    'en todas las opciones', 'todas las opciones', 'en todas', 'todas', 'dans toutes les options', 'toutes les options', 'dans toutes', 'toutes',
    'in allen optionen', 'in allen', 'alle',
];
const LABEL_RE = new RegExp(`(?:^|[\\s.;,(])(${[...SHARED_LABELS, ...OPTION_LABELS].sort((a, b) => b.length - a.length).join('|')})\\s*(?:\\((?:recommended|recomendad[oa]|recommand[ée]e?|empfohlen)\\))?\\s*:`, 'gi');
const RECOMMENDED_RE = /\((?:recommended|recomendad[oa]|recommand[ée]e?|empfohlen)\)/i;
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/**
 * Options the user wrote out ("good/better/best. Good: 200 sq ft pine decking at 12. Better: … All options: 1 permit at
 * 150"): estimate_options + line items tagged with their option ("ALL" = in every option). Null when the message does
 * not ask for options or names fewer than 2 options with priced lines (the normal single estimate then applies).
 */
export function extractEstimateOptions(text: string): Pick<ModelOutput, 'estimate_options' | 'line_items'> | null {
    if (!isEstimateOptionsRequest(text)) return null;
    const labels = Array.from(text.matchAll(LABEL_RE)).map(m => ({
        label: m[1], start: (m.index || 0) + m[0].length, at: m.index || 0, recommended: RECOMMENDED_RE.test(m[0]),
    }));
    const names: string[] = [];
    const recommended = new Set<string>();
    const lines: NonNullable<ModelOutput['line_items']> = [];
    labels.forEach((l, i) => {
        const segment = text.slice(l.start, i + 1 < labels.length ? labels[i + 1].at : text.length);
        const shared = SHARED_LABELS.includes(fold(l.label));
        const name = shared ? 'ALL' : l.label.charAt(0).toUpperCase() + l.label.slice(1);
        const rows = parseLineItemsText(segment.replace(/^\s*[-–]\s*/, ''));
        if (!rows.length) return;
        if (!shared && !names.some(n => n.toLowerCase() === name.toLowerCase())) names.push(name);
        if (!shared && l.recommended) recommended.add(name.toLowerCase());
        for (const r of rows) lines.push({ description: r.description, quantity: r.quantity, rate: r.rate, unit_cost: null, supplier: null, option: name });
    });
    if (names.length < 2) return null;
    return {
        estimate_options: names.map(name => ({ name, description: null, recommended: recommended.has(name.toLowerCase()) || null })),
        line_items: lines,
    };
}

/** Lines a contractor keeps in every option (permit, haul-away, cleanup, demolition…). */
const SHARED_WORK_RE = /\b(?:permits?|permiso|permis|licen[cs]a|haul[- ]?away|disposal|debris|dumpster|clean[- ]?up|cleaning|limpieza|nettoyage|limpeza|demo|demolition|demolicion|demolizione|mobili[sz]ation|travel)\b/i;
const OPTION_COUNT_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, dos: 2, tres: 3, cuatro: 4, deux: 2, trois: 3, quatre: 4, zwei: 2, drei: 3, vier: 4, due: 2, tre: 3, quattro: 4, duas: 2, dois: 2, quatro: 4 };
const ADD_OPTION_RE = /\b(?:add|agrega|agregue|agregar|anade|anadir|anada|incluye|suma|ajoute|ajouter|ajoutez|adicione|adiciona|adicionar|acrescente|acrescenta|inclua|aggiungi|aggiungere|fuge|erganze)\b/;
const ADDED_NAMES: Array<[RegExp, string]> = [
    [/\bpremium\b/, 'Premium'], [/\bdeluxe\b/, 'Deluxe'], [/\b(?:luxury|luxe|lujo|luxo|lusso|luxus)\b/, 'Luxury'], [/\bhigh[- ]end|haut de gamme|top[- ]tier\b/, 'High-end'],
    [/\b(?:budget|cheaper|less expensive|economy|economica|economique|economico|mas barata|moins chere|mais barata|gunstig\w*)\b/, 'Budget'],
    [/\b(?:basic|basica|basique|basis|base)\b/, 'Basic'], [/\b(?:better|mejor|meilleure?|melhor)\b/, 'Better'], [/\b(?:best)\b/, 'Best'],
];

/**
 * Form fill of an open estimate that asks for options (the edge function's mock and the QA script): options written
 * out in the message win; otherwise the form's current lines are the base, like the form's "Good / better / best"
 * button: shared work (permit, haul-away…) in every option, the other lines in each option, and each further option
 * gets one upgrade line WITHOUT a price (prices are never made up). "Add a premium option": the current lines are the
 * first option and stay Recommended. A form that already has options gets them back unchanged plus the new one.
 */
export function mockOpenEstimateOptions(text: string, form: ContextFormEstimate | undefined): Pick<ModelOutput, 'estimate_options' | 'line_items'> | null {
    const written = extractEstimateOptions(text);
    if (written) return written;
    const t = fold(text);
    const line = (l: ContextFormLine, option: string) => ({
        description: l.desc, quantity: l.qty ?? 1, ...(l.price !== undefined ? { rate: l.price } : {}), unit_cost: l.cost ?? null, supplier: null, option,
    });
    const upgrade = (name: string) => ({ description: `${name} upgrade`, quantity: 1, unit_cost: null, supplier: null, option: name });
    const adding = !isEstimateOptionsRequest(text) && ADD_OPTION_RE.test(t);
    const addedName = adding ? ADDED_NAMES.find(([re]) => re.test(t))?.[1] || '' : '';
    if (form?.options && form.options.length >= 2) {
        // every current option as it is; "add …" puts the new one after them
        const taken = new Set(form.options.map(o => o.name.toLowerCase()));
        const name = !adding ? '' : addedName && !taken.has(addedName.toLowerCase()) ? addedName : ['Good', 'Better', 'Best', 'Premium', 'Option E'].find(n => !taken.has(n.toLowerCase()))!;
        const base = form.options.find(o => o.recommended) || form.options[0];
        return {
            estimate_options: [
                ...form.options.map(o => ({ name: o.name, description: null, recommended: o.recommended ? true : null })),
                ...(name ? [{ name, description: null, recommended: null }] : []),
            ],
            line_items: [
                ...form.options.flatMap(o => o.lines.map(l => line(l, o.name))),
                ...(form.shared || []).map(l => line(l, 'ALL')),
                ...(name ? [...base.lines.map(l => line(l, name)), upgrade(name)] : []),
            ],
        };
    }
    const lines = form?.lines || [];
    if (!lines.length) return null;
    const own = lines.filter(l => !SHARED_WORK_RE.test(l.desc));
    const base = own.length ? own : lines;
    const shared = own.length ? lines.filter(l => SHARED_WORK_RE.test(l.desc)) : [];
    let names: string[];
    if (adding) {
        const added = addedName || 'Option B';
        names = [added === 'Standard' ? 'Current' : 'Standard', added];
    } else {
        const count = t.match(/\b(2|3|4|two|three|four|dos|tres|cuatro|deux|trois|quatre|zwei|drei|vier|due|tre|quattro|duas|dois|quatro)\s+(?:pricing\s+|price\s+)?(?:options|opciones|opcoes|optionen|opzioni|choices|tiers|packages|paquetes|pacotes|formules|niveaux|niveles|versions|versiones)\b/)?.[1];
        const n = count ? Number(count) || OPTION_COUNT_WORDS[count] || 3 : /\bbasic\w*\s+(?:and|or|y|o|et|ou|e)\s+premium\b/.test(t) ? 2 : 3;
        names = n === 2 && /\bpremium\b/.test(t) ? ['Basic', 'Premium'] : ['Good', 'Better', 'Best', 'Premium'].slice(0, Math.max(2, Math.min(4, n)));
    }
    return {
        estimate_options: names.map((name, i) => ({ name, description: null, recommended: adding && i === 0 ? true : null })),
        line_items: [
            ...names.flatMap((name, i) => [...base.map(l => line(l, name)), ...(i > 0 ? [upgrade(name)] : [])]),
            ...shared.map(l => line(l, 'ALL')),
        ],
    };
}

/** Every document type named in the text, in the order they appear (each type once). */
export function detectDocTypesInText(text: string): DocKey[] {
    const found: Array<[number, DocKey]> = [];
    for (const [type, re] of DOC_PATTERNS) {
        const m = re.exec(text);
        if (m && !found.some(([, t]) => t === type)) found.push([m.index, type]);
    }
    return found.sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

/** Client names the user asks to CREATE: "two clients: Michael and Jake", "add clients Ann, Bo & Cy". */
function detectNewClientNames(text: string): string[] {
    const re = /\b(?:(?:create|add|new)\s+(?:an?\s+)?(?:new\s+)?(?:clients?|customers?)|(?:one|two|three|four|five|six|\d+)\s+(?:new\s+)?(?:clients?|customers?)|(?:clients?|customers?)\s*:)\s*(?:named|called)?\s*:?\s*/gi;
    const names: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        let rest = text.slice(m.index + m[0].length);
        for (;;) {
            const name = rest.match(/^([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*)?)/);
            if (!name) break;
            if (!names.includes(name[1])) names.push(name[1]);
            rest = rest.slice(name[0].length);
            const sep = rest.match(/^\s*(?:,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)/);
            if (!sep) break;
            rest = rest.slice(sep[0].length);
        }
    }
    return names.slice(0, 10);
}

/**
 * Realistic sample content for "just an example" / "random data" requests (index varies the numbers a
 * little). Every box a user fills by hand is covered; numbers, status, payment links and the job / profile
 * boxes stay out (the app owns them). Dates are relative, so they follow the user's day.
 */
export function sampleDocument(docType: DocKey, index: number, clientName?: string): Pick<ModelPlanStep, 'fields' | 'line_items'> {
    const who = clientName ? ` for ${clientName}` : '';
    const hours = 6 + (index % 3) * 2;
    const items = [
        { description: 'Labor (carpentry)', quantity: hours, rate: 65 },
        { description: 'Materials and supplies', quantity: 1, rate: 240 + index * 35 },
        { description: 'Debris removal and site cleanup', quantity: 1, rate: 150 },
    ];
    const f = (pairs: Record<string, string>) => Object.entries(pairs).map(([key, value]) => ({ key, value }));
    switch (docType) {
        case 'INVOICE':
            return { fields: f({
                title: `Kitchen remodel - progress invoice${who}`, issueDate: 'today', dueDate: 'in 30 days', taxRate: '8.25', discount: '50', shipping: '35',
                amountPaid: '250', notes: 'Thank you for your business. Payment is due within 30 days.',
            }), line_items: items };
        case 'ESTIMATE':
            return { fields: f({
                title: `Kitchen remodel estimate${who}`, issueDate: 'today', expiryDate: 'in 30 days', taxRate: '8.25', discount: '100',
                terms: 'Valid for 30 days. 50% deposit to schedule, balance due on completion.', notes: 'Includes demolition, new cabinets, countertop install and final cleanup.',
            }), line_items: items };
        case 'WORK_ORDER':
            return { fields: f({
                title: `Kitchen plumbing repair${who}`, date: 'today', assignedTo: 'Alex Rivera', description: 'Replace the kitchen faucet and fix the leak under the sink.',
                materialsUsed: 'Single-handle faucet, 2 supply lines, plumber\'s putty', hours: String(hours), cost: '420',
                terms: 'Payment due on completion. Changes to the scope must be approved in writing.',
            }) };
        case 'DAILY_REPORT':
            return { fields: [
                { key: 'title', value: `Daily progress report${who}` }, { key: 'date', value: 'today' },
                { key: 'content', value: `<h3>Work Completed</h3><ul><li>Removed the old cabinets and countertop${who}</li><li>Framed the new pantry wall and installed blocking</li></ul><h3>Crew</h3><p>3 workers on site, ${hours} hours each.</p><h3>Materials</h3><p>12 2x4 studs, 2 boxes of framing nails.</p><h3>Next Steps</h3><p>Electrical rough-in and inspection.</p>` },
                { key: 'weather', value: 'Sunny' }, { key: 'temperature', value: '72°F' }, { key: 'crewSize', value: '3' }, { key: 'laborHours', value: String(hours * 3) },
                { key: 'tags', value: 'framing, demolition' },
            ] };
        case 'TIME_SHEET':
            return { fields: f({ title: 'Weekly time sheet', workerName: 'Alex Rivera', date: 'today', hoursWorked: String(hours), overtimeHours: '1.5', notes: 'Framing and blocking in the kitchen, site cleanup.' }) };
        case 'MATERIAL_LOG':
            return { fields: f({ title: 'Framing materials', date: 'today' }), line_items: [
                { description: '2x4 studs', quantity: 12, rate: 4.25, unit_cost: 4.25, supplier: 'City Supply' },
                { description: 'Framing nails (box)', quantity: 2, rate: 18.5, unit_cost: 18.5, supplier: 'City Supply' },
            ] };
        case 'EXPENSE_LOG':
            return { fields: f({ title: 'Fuel for site trips', date: 'today', vendor: 'Shell', category: 'Fuel', item: 'Gas', amount: '64.50', tax: '4.50', notes: 'Truck refuel for the material run.' }),
                line_items: [{ description: 'Gas', quantity: 1, rate: 60 }] };
        case 'WARRANTY':
            return { fields: f({
                title: `Workmanship warranty${who}`, completedDate: 'today', duration: '1 year', coverage: 'Labor and installation defects on all work performed.',
                conditions: 'Excludes normal wear and tear, misuse and work by others. Report defects in writing within the warranty period.',
            }) };
        case 'NOTE':
            return { fields: f({ title: `Site visit${who}`, content: 'Walked the site with the owner. Agreed on cabinet layout and paint colors.', tags: 'site visit, design' }) };
        case 'RECEIPT':
            return { fields: f({ title: 'Deposit received', date: 'today', amount: String(500 + index * 50), description: 'Deposit for the kitchen remodel.', paymentMethod: 'Check' }) };
        case 'CHANGE_ORDER':
            return { fields: f({
                title: `Pantry door change order${who}`, date: 'today', description: 'Add a pantry door', reason: 'Client Request', currentContractSum: '12500',
                terms: 'Adds 2 days to the schedule. All other terms of the original contract remain in effect.',
            }), line_items: items };
        case 'PURCHASE_ORDER':
            return { fields: f({
                title: 'Framing lumber order', date: 'today', deliveryDate: 'in 3 days', vendorName: 'City Supply', vendorAddress: '200 Industrial Way, Springfield, IL 62704',
                vendorPhone: '(555) 555-0187', vendorEmail: 'orders@example.com', shipToType: 'Job Site', shipToName: 'Site supervisor',
                shipToAddress: '742 Maple Avenue, Springfield, IL 62704', shipToPhone: '(555) 555-0123', deliveryInstructions: 'Deliver to the driveway before 9 am.',
                notes: 'Call the site supervisor 30 minutes before arrival.',
            }), line_items: [{ description: '2x4 studs', quantity: 40, rate: 6.5 }, { description: 'Framing nails (box)', quantity: 4, rate: 18.5 }] };
    }
}

/**
 * Several things in one message (clients + a job + documents, or two document types) → RUN_PLAN.
 * Returns null for single requests, which keep their single action.
 */
function mockPlan(req: RouterRequest, today: string): ModelOutput | null {
    const text = req.message || '';
    const allowed = SCOPE_ACTIONS[req.scope];
    if (!allowed.includes('RUN_PLAN') || req.context?.pending_draft) return null;
    const clients = allowed.includes('CREATE_CLIENT') ? detectNewClientNames(text) : [];
    const jobWanted = allowed.includes('CREATE_JOB') && /\b(?:create|add|start|new|make|one|a|1)\s+(?:new\s+)?(?:job|project)\b(?!\s*(?:report|status|site))/i.test(text);
    const docTypes = detectDocTypesInText(text);
    const things = clients.length + (jobWanted ? 1 : 0) + docTypes.length;
    if (things < 2 || (!clients.length && !jobWanted && docTypes.length < 2)) return null;

    const sample = isSampleRequest(text);
    const steps: ModelPlanStep[] = [];
    const clientRefs = clients.map(name => {
        const ref = `client_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        steps.push({ action_type: 'CREATE_CLIENT', ref, entity: { name } });
        return { ref, name };
    });
    if (jobWanted) {
        const named = text.match(/\b(?:job|project)\s+(?:called|named)\s+["']?([^"'\n.,]{2,60})/i)?.[1]?.trim();
        steps.push({ action_type: 'CREATE_JOB', ref: 'job1', entity: { name: named || (sample ? 'Sample Job' : null), client_name: clientRefs.length === 1 ? clientRefs[0].name : null }, client_ref: clientRefs.length === 1 ? clientRefs[0].ref : null });
    }
    const perClient = clientRefs.length > 1 && /\b(?:each|every|both|per)\s+(?:of\s+the\s+|of\s+them\b|client|customer)/i.test(text);
    const owners: Array<{ ref: string; name: string } | null> = perClient ? clientRefs : [clientRefs.length === 1 ? clientRefs[0] : null];
    let index = 0;
    const options = !sample && docTypes.includes('ESTIMATE') ? extractEstimateOptions(text) : null;
    for (const owner of owners) {
        for (const docType of docTypes) {
            const content = sample ? sampleDocument(docType, index, owner?.name) : extractFields(docType, text, today);
            const withOptions = docType === 'ESTIMATE' ? options : null;
            steps.push({
                action_type: 'GENERATE_DOCUMENT',
                ref: `doc_${++index}`,
                document_type: docType,
                fields: content.fields || [],
                line_items: (withOptions ? withOptions.line_items : content.line_items) || [],
                ...(withOptions ? { estimate_options: withOptions.estimate_options } : {}),
                job_ref: jobWanted ? 'job1' : null,
                client_ref: owner?.ref || null,
            });
        }
    }
    const parts = [
        clients.length ? `${clients.length} client${clients.length === 1 ? '' : 's'}` : '',
        jobWanted ? '1 job' : '',
        index ? `${index} document${index === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(', ');
    return {
        action_type: 'RUN_PLAN',
        reply_text: `Here is the plan: ${parts}.${sample ? ' The documents are filled with sample data.' : ''} Check it, then press "Do it all".`,
        plan_steps: steps,
    };
}

function findByName<T extends { id: string; name: string }>(text: string, list: T[] = []): T[] {
    const t = ` ${text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ')} `;
    return list.filter(x => {
        const n = x.name.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').trim();
        return n.length >= 3 && t.includes(` ${n} `);
    });
}

const QUESTION_RE = /^\s*(?:how|where|can (?:i|my|you)|is (?:it|there)|does|do i|why|what is|what's|which|comment|o[uù] |como|c[oó]mo|d[oó]nde|wie|wo |warum|come |dove|perch[eé]|onde|por ?que|如何|怎么|怎样|在哪|哪里|どう|どこ|どうやって|어떻게|어디|как|где|почему)|\?\s*$|\b(?:how (?:do|can|to|does)|where (?:is|are|can|do)|is it possible|can (?:i|you|my clients))\b/i;
const SETUP_RE = /\b(?:make my|turn (?:on|off)|switch (?:on|off)|enable|disable|set up|setup|get paid online|show (?:a |the )?qr)\b/i;

/** "How do I …?" / "where is …?" / "make my invoices show a QR code" → HOW_TO from the best knowledge entry. */
function mockHowTo(req: RouterRequest): ModelOutput | null {
    const text = req.message || '';
    if (!SCOPE_ACTIONS[req.scope].includes('HOW_TO')) return null;
    if (!QUESTION_RE.test(text) && !SETUP_RE.test(text)) return null;
    // A question that names a concrete record to create ("can you create a client named Sam?") is a request to do it.
    if (/\b(?:named|called)\s+[A-Z]/.test(text)) return null;
    // So is a good / better / best estimate with its options written out.
    if (extractEstimateOptions(text)) return null;
    const top = scoreKnowledge(text)[0];
    if (!top || top.score < 3) return null;
    const e = top.entry;
    const steps = e.steps?.length ? e.steps : e.facts;
    return {
        action_type: 'HOW_TO',
        reply_text: e.facts[0],
        how_to_steps: steps,
        route: e.route ?? null,
        do_action: e.doAction ?? null,
    };
}

export function mockModelOutput(req: RouterRequest): ModelOutput {
    const text = req.message || '';
    const t = text.toLowerCase();
    const c = req.context || {};
    const today = c.today || toLocalYmd();
    const mentionClients = (c.mentions || []).filter(m => m.kind === 'client').map(m => m.id);
    const mentionDocs = (c.mentions || []).filter(m => m.kind === 'document').map(m => m.id);

    // 1) Form scope: always fill the open form.
    if (req.scope === 'form') {
        const docType = resolveDocKey(c.form_document_type);
        if (!docType) return { action_type: 'CHAT', reply_text: 'Open a document first.' };
        if (isSampleRequest([...(req.history || []).filter(h => h.role === 'user').map(h => h.text), text].join('\n'))) {
            return { action_type: 'GENERATE_DOCUMENT', reply_text: `I filled the ${DOC_LABELS[docType].toLowerCase()} with sample data. Check it before you send it.`, document_type: docType, ...sampleDocument(docType, 0) };
        }
        // The open estimate asks for options ("turn this into good / better / best", "add a premium option").
        const options = requestHasEstimateOptions(req) ? mockOpenEstimateOptions(text, c.form_estimate) : null;
        if (options) {
            const names = (options.estimate_options || []).map(o => String(o.name));
            return {
                action_type: 'GENERATE_DOCUMENT',
                reply_text: `I made ${names.length} options from your estimate: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}. Lines without a price are left empty for you to fill.`,
                document_type: docType,
                fields: extractFields(docType, text, today).fields,
                ...options,
            };
        }
        return { action_type: 'GENERATE_DOCUMENT', reply_text: `I filled the ${DOC_LABELS[docType]} with what you told me.`, document_type: docType, ...extractFields(docType, text, today) };
    }

    // 1b) Business numbers sent by the app (N7): profit / spend / who owes / overdue / order / this week, from the facts only.
    const factsAnswer = c.job_facts || c.business_facts ? mockFactsAnswer(text, c) : null;
    if (factsAnswer) return { action_type: 'CHAT', reply_text: factsAnswer };

    // 2) How-to / where-is questions about the app → the steps from the product knowledge.
    const howTo = mockHowTo(req);
    if (howTo) return howTo;

    // 2b) Send / email existing documents (never a new document).
    if (isSendOnlyRequest(text)) {
        const clients = mentionClients.length ? mentionClients : findByName(text, c.clients).map(x => x.id);
        const docs = mentionDocs.length ? mentionDocs : (c.documents || []).filter(d => {
            const label = d.label.toLowerCase();
            const num = label.split('#')[1]?.trim();
            return Boolean(num && t.includes(num.toLowerCase()));
        }).map(d => d.id);
        return { action_type: 'PREPARE_EMAIL_BATCH', reply_text: 'I prepared the email for review.', client_ids: clients, document_ids: docs };
    }
    if (/\b(write|draft|compose)\b[^.]{0,20}\b(e-?mail|message|reply)\b/i.test(text)) {
        const about = text.replace(/^.*?\b(?:e-?mail|message|reply)\b\s*(?:to\s+\S+)?\s*(?:about|regarding|saying)?\s*/i, '').trim();
        return {
            action_type: 'DRAFT_EMAIL_ONLY',
            reply_text: 'Here is a draft.',
            email_subject: about ? about.slice(0, 60) : 'Quick update',
            email_body: `Hi,\n\n${about || 'I wanted to give you a quick update on your project.'}\n\nThank you,\n${c.company_name || ''}`.trim(),
            client_ids: mentionClients,
        };
    }

    // 3) Several things at once → one plan with every step.
    const plan = mockPlan(req, today);
    if (plan) return plan;

    // 4) Continue a pending draft (answer to a gather question). Options written out are always an estimate.
    const pendingType = c.pending_draft ? resolveDocKey(c.pending_draft.document_type) : null;
    const options = extractEstimateOptions(text);
    const docType = detectDocTypeFromText(text) || (options ? 'ESTIMATE' : null) || (pendingType && !/\b(open|go to|show)\b/i.test(t) ? pendingType : null);
    const wantsDoc = docType && (/\b(create|make|write|draft|generate|new|start|prepare|fill|log|record|add)\b/i.test(t) || docType === pendingType || text.length > 25);
    if (docType && wantsDoc) {
        const extracted = extractFields(docType, text, today);
        const jobs = findByName(text, c.jobs);
        if (docType === 'ESTIMATE' && options) {
            const names = (options.estimate_options || []).map(o => String(o.name));
            return {
                action_type: 'GENERATE_DOCUMENT',
                reply_text: `Here is your estimate draft with ${names.length} options: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`,
                document_type: docType,
                fields: extracted.fields,
                ...options,
                job_id: jobs.length === 1 ? jobs[0].id : null,
                client_ids: mentionClients.slice(0, 1),
            };
        }
        // "fill every box" / sample data: every box filled (the user's own values win), like the real model under rule 15
        if (isSampleRequest(text)) {
            const sample = sampleDocument(docType, 0);
            const given = new Set((extracted.fields || []).map(f => f.key));
            return {
                action_type: 'GENERATE_DOCUMENT',
                reply_text: `Here is your ${DOC_LABELS[docType].toLowerCase()} draft, with sample data in the boxes you didn't give.`,
                document_type: docType,
                fields: [...(extracted.fields || []), ...(sample.fields || []).filter(f => !given.has(f.key))],
                line_items: extracted.line_items?.length ? extracted.line_items : sample.line_items,
                job_id: jobs.length === 1 ? jobs[0].id : null,
                client_ids: mentionClients.slice(0, 1),
            };
        }
        return {
            action_type: 'GENERATE_DOCUMENT',
            reply_text: `Here is your ${DOC_LABELS[docType].toLowerCase()} draft.`,
            document_type: docType,
            ...extracted,
            job_id: jobs.length === 1 ? jobs[0].id : null,
            client_ids: mentionClients.slice(0, 1),
        };
    }

    // 5) Job / entity actions.
    const status = t.match(/\b(?:mark|set|change|move)\b[^.]*\b(complete|completed|done|finished|paused?|on hold|active|reopen(?:ed)?)\b/);
    if (status) {
        const s = /complet|done|finish/.test(status[1]) ? 'completed' : /pause|hold/.test(status[1]) ? 'paused' : 'active';
        const jobs = findByName(text, c.jobs);
        return { action_type: 'UPDATE_JOB_STATUS', reply_text: `Set the job to ${s}?`, job_status: s, job_id: jobs.length === 1 ? jobs[0].id : null };
    }
    if (/\b(duplicate|copy|clone)\b[^.]*\b(job|project)\b/.test(t)) {
        const jobs = findByName(text, c.jobs);
        return { action_type: 'DUPLICATE_JOB', reply_text: 'Duplicate this job?', job_id: jobs.length === 1 ? jobs[0].id : null };
    }
    const newJob = text.match(/\b(?:new|create|add|start)\s+(?:a\s+)?(?:new\s+)?(?:job|project)\b(?:\s+(?:called|named|for))?\s*:?\s*["']?([^"'\n.]{2,80})?/i);
    if (newJob && !/\bjob\s+(?:report|status)\b/i.test(text)) {
        const jobName = (newJob[1] || '').replace(/^with\b.*$|\s+with\s+(?:some\s+)?(?:random|sample|test|fake|dummy|example)\b.*$/i, '').trim();
        return { action_type: 'CREATE_JOB', reply_text: 'Create this job?', entity: { name: jobName || (isSampleRequest(text) ? 'Sample Job' : null) } };
    }
    const newClient = text.match(/\b(?:new|add|create)\s+(?:a\s+)?(?:new\s+)?client\b(?:\s+(?:called|named))?\s*:?\s*/i);
    if (newClient) {
        const rest = text.slice((newClient.index || 0) + newClient[0].length);
        const name = rest.match(/^([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/)?.[1] || null;
        const email = text.match(/[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i)?.[0] || null;
        const phone = text.match(/(\+?\d[\d\s().-]{6,}\d)/)?.[1] || null;
        return { action_type: 'CREATE_CLIENT', reply_text: 'Add this client?', entity: { name, email, phone } };
    }
    const stock = text.match(/\b(?:add|put|restock|receive[d]?)\s+(\d+(?:\.\d+)?)\s+([^\n]+?)\s+(?:to|into|in)\s+(?:the\s+|my\s+)?(?:inventory|stock)\b/i)
        || text.match(/\brestock\s+([^\n]+?)\s+(?:by|with)\s+(\d+(?:\.\d+)?)/i);
    if (stock || /\b(new inventory item|add\b[^.]*\binventory)\b/i.test(t)) {
        const qty = stock ? Number(/^\d/.test(stock[1]) ? stock[1] : stock[2]) : undefined;
        const name = stock ? (/^\d/.test(stock[1]) ? stock[2] : stock[1]).replace(/\s+at\s+\$?\d.*$/, '').trim() : '';
        const existing = name ? findByName(name, c.inventory).concat((c.inventory || []).filter(i => i.name.toLowerCase() === name.toLowerCase())) : [];
        const price = text.match(/(?:at|@|for)\s*\$\s*(\d[\d,]*(?:\.\d+)?)/i)?.[1];
        if (existing.length && qty) {
            return { action_type: 'RESTOCK_INVENTORY', reply_text: `Add ${qty} to ${existing[0].name}?`, inventory_item_id: existing[0].id, quantity_delta: qty };
        }
        return { action_type: 'ADD_INVENTORY', reply_text: 'Add this item to inventory?', entity: { name: name || null, quantity: qty ?? null, cost: price ? Number(price.replace(/,/g, '')) : null } };
    }
    if (/\b(price ?book)\b/i.test(t) && /\b(add|new|create|save)\b/i.test(t)) {
        const item = text.match(/["']([^"']{2,80})["']/)?.[1] || text.replace(/^.*?\b(?:add|save)\s+/i, '').replace(/\s+(?:to|in)\s+(?:the\s+|my\s+)?price ?book.*$/i, '').replace(/\s*\$\s*\d.*$/, '').trim();
        const price = text.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/)?.[1];
        return { action_type: 'ADD_PRICE_BOOK_ITEM', reply_text: 'Add this price book item?', entity: { name: item || null, price: price ? Number(price.replace(/,/g, '')) : null } };
    }

    // 6) Navigation.
    const route = detectNavigation(text);
    if (route) return { action_type: 'NAVIGATE_TO', reply_text: 'Opening it now.', route };

    return {
        action_type: 'CHAT',
        reply_text: 'I can draft any of your 12 document types, prepare emails with your documents, add clients or inventory, and open any page. What would you like to do?',
    };
}
