/**
 * Deterministic stand-in for the LLM (AI_PROVIDER=mock). It produces the same ModelOutput
 * shape the real model returns, so the whole pipeline (validation, normalization, UI) can be
 * exercised locally and in tests without an API key. It is deliberately conservative: it only
 * copies facts that appear in the user's text.
 */
import { DOC_LABELS, escapeHtml, normalizeDate, parseLineItemsText, resolveDocKey, toLocalYmd, type DocKey } from './documentSchema.ts';
import { isSendOnlyRequest, type AppRoute, type ModelOutput, type RouterRequest } from './routerContract.ts';

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

function findByName<T extends { id: string; name: string }>(text: string, list: T[] = []): T[] {
    const t = ` ${text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ')} `;
    return list.filter(x => {
        const n = x.name.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').trim();
        return n.length >= 3 && t.includes(` ${n} `);
    });
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
        return { action_type: 'GENERATE_DOCUMENT', reply_text: `I filled the ${DOC_LABELS[docType]} with what you told me.`, document_type: docType, ...extractFields(docType, text, today) };
    }

    // 2) Send / email existing documents (never a new document).
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

    // 3) Continue a pending draft (answer to a gather question).
    const pendingType = c.pending_draft ? resolveDocKey(c.pending_draft.document_type) : null;
    const docType = detectDocTypeFromText(text) || (pendingType && !/\b(open|go to|show)\b/i.test(t) ? pendingType : null);
    const wantsDoc = docType && (/\b(create|make|write|draft|generate|new|start|prepare|fill|log|record|add)\b/i.test(t) || docType === pendingType || text.length > 25);
    if (docType && wantsDoc) {
        const extracted = extractFields(docType, text, today);
        const jobs = findByName(text, c.jobs);
        return {
            action_type: 'GENERATE_DOCUMENT',
            reply_text: `Here is your ${DOC_LABELS[docType].toLowerCase()} draft.`,
            document_type: docType,
            ...extracted,
            job_id: jobs.length === 1 ? jobs[0].id : null,
            client_ids: mentionClients.slice(0, 1),
        };
    }

    // 4) Job / entity actions.
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
        return { action_type: 'CREATE_JOB', reply_text: 'Create this job?', entity: { name: (newJob[1] || '').trim() || null } };
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

    // 5) Navigation.
    const route = detectNavigation(text);
    if (route) return { action_type: 'NAVIGATE_TO', reply_text: 'Opening it now.', route };

    return {
        action_type: 'CHAT',
        reply_text: 'I can draft any of your 12 document types, prepare emails with your documents, add clients or inventory, and open any page. What would you like to do?',
    };
}
