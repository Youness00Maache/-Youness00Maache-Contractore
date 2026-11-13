/**
 * Router contract shared by the edge function, the browser hook and the QA script.
 * Pure TypeScript, no runtime imports outside this folder.
 *
 * The model can only PROPOSE an action. `buildProposal` validates every id against the
 * context the user's own app sent, drops anything unknown, normalizes document fields with
 * the schema, and downgrades malformed output to CHAT. Side effects run in the browser only
 * after the user confirms (see ACTION_POLICY).
 */
import {
    DOC_LABELS, DOC_TYPES, ALL_FIELD_KEYS, getItemsKey, getMissingAskFields, getSchema, isDocKey, normalizePrefill,
    resolveDocKey, toNumberOrUndefined, toPlainText, type DocKey, type NormalizeOptions,
} from './documentSchema.ts';

export const ROUTER_ACTIONS = [
    'CHAT', 'GATHER_INFO', 'GENERATE_DOCUMENT', 'PREPARE_EMAIL_BATCH', 'DRAFT_EMAIL_ONLY',
    'CREATE_JOB', 'CREATE_CLIENT', 'ADD_INVENTORY', 'ADD_PRICE_BOOK_ITEM', 'RESTOCK_INVENTORY',
    'UPDATE_JOB_STATUS', 'DUPLICATE_JOB', 'NAVIGATE_TO',
] as const;
export type RouterAction = typeof ROUTER_ACTIONS[number];

export type RouterScope = 'dashboard' | 'job' | 'form';

/** reply = text only · card = shows an input card · confirm = runs only after an explicit click · auto = harmless navigation */
export const ACTION_POLICY: Record<RouterAction, 'reply' | 'card' | 'confirm' | 'auto'> = {
    CHAT: 'reply',
    GATHER_INFO: 'card',
    GENERATE_DOCUMENT: 'confirm',
    PREPARE_EMAIL_BATCH: 'confirm',
    DRAFT_EMAIL_ONLY: 'card',
    CREATE_JOB: 'confirm',
    CREATE_CLIENT: 'confirm',
    ADD_INVENTORY: 'confirm',
    ADD_PRICE_BOOK_ITEM: 'confirm',
    RESTOCK_INVENTORY: 'confirm',
    UPDATE_JOB_STATUS: 'confirm',
    DUPLICATE_JOB: 'confirm',
    NAVIGATE_TO: 'auto',
};

export const SCOPE_ACTIONS: Record<RouterScope, readonly RouterAction[]> = {
    dashboard: ROUTER_ACTIONS,
    job: ['CHAT', 'GATHER_INFO', 'GENERATE_DOCUMENT', 'PREPARE_EMAIL_BATCH', 'DRAFT_EMAIL_ONLY', 'UPDATE_JOB_STATUS'],
    form: ['CHAT', 'GENERATE_DOCUMENT'],
};

export const APP_ROUTES = [
    '/dashboard', '/clients', '/inventory', '/pricebook', '/analytics', '/calendar', '/communication',
    '/calculator', '/forum', '/settings', '/profile',
] as const;
export type AppRoute = typeof APP_ROUTES[number];

export const JOB_STATUSES = ['active', 'paused', 'completed', 'inactive'] as const;
export type JobStatus = typeof JOB_STATUSES[number];

/** Legacy names the old prompt/heuristics used. */
const ACTION_ALIASES: Record<string, { action: RouterAction; route?: AppRoute }> = {
    SEND_EMAIL: { action: 'PREPARE_EMAIL_BATCH' },
    AUTO_SEND_BATCH: { action: 'PREPARE_EMAIL_BATCH' },
    EMAIL: { action: 'PREPARE_EMAIL_BATCH' },
    REFINEMENT: { action: 'GATHER_INFO' },
    NAVIGATE_TO_PAGE: { action: 'NAVIGATE_TO' },
    OPEN_ANALYTICS: { action: 'NAVIGATE_TO', route: '/analytics' },
    OPEN_CALENDAR: { action: 'NAVIGATE_TO', route: '/calendar' },
    OPEN_SETTINGS: { action: 'NAVIGATE_TO', route: '/settings' },
    OPEN_PROFILE: { action: 'NAVIGATE_TO', route: '/profile' },
    OPEN_PRICE_BOOK: { action: 'NAVIGATE_TO', route: '/pricebook' },
    OPEN_CALCULATOR: { action: 'NAVIGATE_TO', route: '/calculator' },
    OPEN_FORUM: { action: 'NAVIGATE_TO', route: '/forum' },
    OPEN_COMMUNICATION: { action: 'NAVIGATE_TO', route: '/communication' },
    OPEN_CLIENTS: { action: 'NAVIGATE_TO', route: '/clients' },
    OPEN_INVENTORY: { action: 'NAVIGATE_TO', route: '/inventory' },
    UPDATE_INVENTORY: { action: 'RESTOCK_INVENTORY' },
    CREATE_INVENTORY_ITEM: { action: 'ADD_INVENTORY' },
    CREATE_DOCUMENT: { action: 'GENERATE_DOCUMENT' },
};

// ───────────────────────────── request ─────────────────────────────

export interface ContextClient { id: string; name: string; email?: string; address?: string; phone?: string }
export interface ContextJob { id: string; name: string; client_name?: string; client_id?: string; address?: string; status?: string }
export interface ContextDocument { id: string; type: string; label: string; job_id?: string; client_name?: string }
export interface ContextInventoryItem { id: string; name: string; quantity?: number; unit?: string }
export interface ContextMention { kind: 'client' | 'document' | 'job'; id: string }

export interface RouterRequestContext {
    /** user's local date, YYYY-MM-DD */
    today?: string;
    active_job_id?: string;
    /** scope = form: the document type of the open form */
    form_document_type?: string;
    company_name?: string;
    clients?: ContextClient[];
    jobs?: ContextJob[];
    documents?: ContextDocument[];
    inventory?: ContextInventoryItem[];
    mentions?: ContextMention[];
    /** Draft being completed (after GATHER_INFO). */
    pending_draft?: { document_type: string; prefill: Record<string, unknown> } | null;
    /** The user pressed Skip / said "go ahead": never gather again. */
    proceed?: boolean;
}

export interface RouterHistoryMessage { role: 'user' | 'assistant'; text: string }
export interface RouterImage { mime_type: string; data: string; name?: string }

export interface RouterRequest {
    message: string;
    scope: RouterScope;
    history?: RouterHistoryMessage[];
    context?: RouterRequestContext;
    images?: RouterImage[];
}

export const REQUEST_LIMITS = {
    messageChars: 4000,
    historyMessages: 12,
    historyChars: 2000,
    clients: 60,
    jobs: 40,
    documents: 40,
    inventory: 40,
    images: 3,
    imageBase64Chars: 2_000_000, // ≈1.5 MB of JPEG per image
    bodyBytes: 7_500_000,
} as const;

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Clamp and clean an incoming request. Throws `RouterInputError` on unusable input. */
export class RouterInputError extends Error {
    constructor(message: string, public status = 400, public code = 'BAD_REQUEST') { super(message); }
}

export function sanitizeRequest(body: unknown): RouterRequest {
    if (!body || typeof body !== 'object') throw new RouterInputError('Request body must be a JSON object.');
    const b = body as Record<string, unknown>;
    const message = str(b.message, REQUEST_LIMITS.messageChars + 1);
    if (message.length > REQUEST_LIMITS.messageChars) throw new RouterInputError('Your message is too long. Please shorten it.', 413, 'TOO_LARGE');
    const images = Array.isArray(b.images) ? b.images : [];
    if (!message && images.length === 0) throw new RouterInputError('Type a message first.');
    const scope: RouterScope = b.scope === 'job' || b.scope === 'form' ? b.scope : 'dashboard';
    const history = (Array.isArray(b.history) ? b.history : [])
        .slice(-REQUEST_LIMITS.historyMessages)
        .map(m => m as Record<string, unknown>)
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && (m.text as string).trim())
        .map(m => ({ role: m.role as 'user' | 'assistant', text: str(m.text, REQUEST_LIMITS.historyChars) }));
    const c = (b.context && typeof b.context === 'object' ? b.context : {}) as Record<string, unknown>;
    const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []).filter(x => x && typeof x === 'object') as Record<string, unknown>[];
    const today = typeof c.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.today) ? c.today : undefined;
    const pending = c.pending_draft && typeof c.pending_draft === 'object' ? c.pending_draft as Record<string, unknown> : null;
    const cleanImages: RouterImage[] = [];
    for (const img of images.slice(0, REQUEST_LIMITS.images)) {
        const i = img as Record<string, unknown>;
        const mime = str(i?.mime_type, 40);
        const data = typeof i?.data === 'string' ? i.data : '';
        if (!/^image\/(jpeg|png|webp)$/.test(mime) || !data) continue;
        if (data.length > REQUEST_LIMITS.imageBase64Chars) throw new RouterInputError('One of the photos is too large. Please attach a smaller photo.', 413, 'TOO_LARGE');
        if (!/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 2000))) continue;
        cleanImages.push({ mime_type: mime, data, name: str(i.name, 80) });
    }
    return {
        message,
        scope,
        history,
        images: cleanImages,
        context: {
            today,
            active_job_id: str(c.active_job_id, 80) || undefined,
            form_document_type: str(c.form_document_type, 40) || undefined,
            company_name: str(c.company_name, 120) || undefined,
            clients: arr(c.clients, REQUEST_LIMITS.clients).map(x => ({ id: str(x.id, 80), name: str(x.name, 120), email: str(x.email, 200) || undefined, address: str(x.address, 200) || undefined, phone: str(x.phone, 40) || undefined })).filter(x => x.id && x.name),
            jobs: arr(c.jobs, REQUEST_LIMITS.jobs).map(x => ({ id: str(x.id, 80), name: str(x.name, 120), client_name: str(x.client_name, 120) || undefined, client_id: str(x.client_id, 80) || undefined, address: str(x.address, 200) || undefined, status: str(x.status, 20) || undefined })).filter(x => x.id && x.name),
            documents: arr(c.documents, REQUEST_LIMITS.documents).map(x => ({ id: str(x.id, 80), type: str(x.type, 40), label: str(x.label, 120), job_id: str(x.job_id, 80) || undefined, client_name: str(x.client_name, 120) || undefined })).filter(x => x.id && x.type),
            inventory: arr(c.inventory, REQUEST_LIMITS.inventory).map(x => ({ id: str(x.id, 80), name: str(x.name, 120), quantity: toNumberOrUndefined(x.quantity), unit: str(x.unit, 20) || undefined })).filter(x => x.id && x.name),
            mentions: arr(c.mentions, 20).map(x => ({ kind: (x.kind === 'document' || x.kind === 'job' ? x.kind : 'client') as ContextMention['kind'], id: str(x.id, 80) })).filter(x => x.id),
            pending_draft: pending && resolveDocKey(pending.document_type) && pending.prefill && typeof pending.prefill === 'object'
                ? { document_type: resolveDocKey(pending.document_type) as string, prefill: pending.prefill as Record<string, unknown> }
                : null,
            proceed: c.proceed === true,
        },
    };
}

// ───────────────────────────── model output ─────────────────────────────

/** What the model must return (Gemini JSON mode + responseSchema). */
export interface ModelOutput {
    action_type: string;
    reply_text: string;
    document_type?: string | null;
    fields?: Array<{ key: string; value: string }>;
    line_items?: Array<{ description: string; quantity?: number; rate?: number; unit_cost?: number | null; supplier?: string | null }>;
    missing_fields?: string[];
    job_id?: string | null;
    client_ids?: string[];
    document_ids?: string[];
    route?: string | null;
    job_status?: string | null;
    entity?: Record<string, unknown> | null;
    inventory_item_id?: string | null;
    quantity_delta?: number | null;
    email_subject?: string | null;
    email_body?: string | null;
}

/** Gemini `responseSchema` (OpenAPI subset). */
export function buildResponseSchema(scope: RouterScope): Record<string, unknown> {
    const S = (extra: Record<string, unknown> = {}) => ({ type: 'STRING', ...extra });
    const N = (extra: Record<string, unknown> = {}) => ({ type: 'NUMBER', ...extra });
    return {
        type: 'OBJECT',
        properties: {
            action_type: S({ enum: [...SCOPE_ACTIONS[scope]] }),
            reply_text: S(),
            document_type: S({ enum: [...DOC_TYPES], nullable: true }),
            fields: {
                type: 'ARRAY',
                items: { type: 'OBJECT', properties: { key: S({ enum: ALL_FIELD_KEYS }), value: S() }, required: ['key', 'value'] },
            },
            line_items: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: { description: S(), quantity: N(), rate: N(), unit_cost: N({ nullable: true }), supplier: S({ nullable: true }) },
                    required: ['description'],
                },
            },
            missing_fields: { type: 'ARRAY', items: S() },
            job_id: S({ nullable: true }),
            client_ids: { type: 'ARRAY', items: S() },
            document_ids: { type: 'ARRAY', items: S() },
            route: S({ enum: [...APP_ROUTES], nullable: true }),
            job_status: S({ enum: [...JOB_STATUSES], nullable: true }),
            entity: {
                type: 'OBJECT',
                nullable: true,
                properties: {
                    name: S({ nullable: true }), email: S({ nullable: true }), phone: S({ nullable: true }), address: S({ nullable: true }),
                    notes: S({ nullable: true }), description: S({ nullable: true }), category: S({ nullable: true }), unit: S({ nullable: true }),
                    supplier: S({ nullable: true }), quantity: N({ nullable: true }), price: N({ nullable: true }), cost: N({ nullable: true }),
                    client_name: S({ nullable: true }), start_date: S({ nullable: true }),
                },
            },
            inventory_item_id: S({ nullable: true }),
            quantity_delta: N({ nullable: true }),
            email_subject: S({ nullable: true }),
            email_body: S({ nullable: true }),
        },
        required: ['action_type', 'reply_text'],
    };
}

/** Robust JSON extraction: raw JSON, ```json fences, or JSON embedded in prose. Never throws. */
export function parseModelJson(text: unknown): Record<string, unknown> | null {
    if (typeof text !== 'string') return text && typeof text === 'object' && !Array.isArray(text) ? text as Record<string, unknown> : null;
    const candidates: string[] = [];
    const trimmed = text.trim();
    candidates.push(trimmed);
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
    if (fence) candidates.push(fence[1].trim());
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
    for (const c of candidates) {
        try {
            const parsed = JSON.parse(c);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
            if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') return parsed[0] as Record<string, unknown>;
        } catch { /* try next */ }
    }
    return null;
}

// ───────────────────────────── proposal (validated) ─────────────────────────────

export interface RouterProposal {
    action_type: RouterAction;
    reply_text: string;
    document_type?: DocKey | null;
    /** Partial<TypeData>: exact types.ts keys, normalized values. */
    prefill?: Record<string, unknown>;
    missing_fields?: string[];
    job_id?: string | null;
    client_ids?: string[];
    document_ids?: string[];
    route?: AppRoute | null;
    job_status?: JobStatus | null;
    entity?: Record<string, unknown> | null;
    inventory_item_id?: string | null;
    quantity_delta?: number | null;
    email_subject?: string | null;
    email_body?: string | null;
}

export interface RouterResponseMeta {
    provider: 'gemini' | 'mock' | 'local';
    model?: string;
    usage?: { used: number; limit: number; tier: string };
}

export interface RouterResponse { ok: true; proposal: RouterProposal; meta: RouterResponseMeta }
export interface RouterErrorResponse { ok?: false; error: string; code: string }

/**
 * "Email the invoice to X" is a send request, not a request for a new document (AI-004/AI-017).
 * True when the message asks to send/email something and no create-verb comes before that.
 */
export function isSendOnlyRequest(text: string): boolean {
    let t = text.toLowerCase().replace(/\[[^\]]*\]/g, ' ');
    t = t.replace(/\b(?:write|draft|compose|prepare)\s+(?:an?\s+|the\s+|my\s+)?(?:e-?mail|message|reply)\b/g, ' ');
    const m = t.match(/\b(e-?mail|send|resend|forward|mail)\b/);
    if (!m || m.index === undefined) return false;
    const before = t.slice(0, m.index);
    return !/\b(create|make|generate|write|draft|prepare|build|new|start|fill)\b/.test(before);
}

const defaultReply: Partial<Record<RouterAction, string>> = {
    CHAT: 'How can I help with your jobs and documents?',
    GENERATE_DOCUMENT: 'Here is your draft. Check the fields, then open it to edit or save it.',
    PREPARE_EMAIL_BATCH: 'I prepared the email for you to review. Nothing is sent until you press Send.',
    NAVIGATE_TO: 'Opening that page.',
};

export interface BuildProposalContext {
    request: RouterRequest;
    normalize?: Omit<NormalizeOptions, 'userText' | 'today'>;
}

function uniqueValid(ids: unknown, valid: Set<string>, max = 20): string[] {
    if (!Array.isArray(ids)) return [];
    return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && valid.has(id)))).slice(0, max);
}

function mergeDraft(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
    const out = { ...base };
    for (const [k, v] of Object.entries(override)) {
        if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
        out[k] = v;
    }
    return out;
}

function fieldsToObject(output: ModelOutput, docType: DocKey): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    if (Array.isArray(output.fields)) {
        for (const f of output.fields) {
            if (!f || typeof f !== 'object' || typeof f.key !== 'string') continue;
            if (f.value == null || f.value === '') continue;
            obj[f.key] = f.value;
        }
    }
    // Some models put fields at the top level or in `document` / `prefill`.
    const loose = output as unknown as Record<string, unknown>;
    for (const container of [loose.document, loose.prefill, loose.payload]) {
        if (container && typeof container === 'object' && !Array.isArray(container)) {
            for (const [k, v] of Object.entries(container as Record<string, unknown>)) if (obj[k] === undefined) obj[k] = v;
        }
    }
    const itemsKey = getItemsKey(docType);
    if (itemsKey && Array.isArray(output.line_items) && output.line_items.length) {
        obj[itemsKey] = output.line_items.map(li => ({
            description: li?.description,
            name: li?.description,
            quantity: li?.quantity,
            rate: li?.rate,
            unitCost: itemsKey === 'items' ? (li?.unit_cost ?? li?.rate) : li?.unit_cost ?? undefined,
            supplier: li?.supplier ?? undefined,
        }));
    }
    // Never let the model write signatures or images.
    delete obj.signatureUrl; delete obj.logoUrl; delete obj.clientSignatureUrl;
    return obj;
}

/** The single gate between model output and the UI. Never throws. */
export function buildProposal(rawOutput: unknown, ctx: BuildProposalContext): RouterProposal {
    const req = ctx.request;
    const c = req.context || {};
    const output = (rawOutput && typeof rawOutput === 'object' ? rawOutput : {}) as ModelOutput;
    const allowed = SCOPE_ACTIONS[req.scope];
    const rawAction = typeof output.action_type === 'string' ? output.action_type.trim().toUpperCase() : '';
    const alias = ACTION_ALIASES[rawAction];
    let action: RouterAction = (ROUTER_ACTIONS as readonly string[]).includes(rawAction) ? rawAction as RouterAction : alias?.action || 'CHAT';
    let route: AppRoute | null = alias?.route || ((APP_ROUTES as readonly string[]).includes(String(output.route)) ? output.route as AppRoute : null);
    const replyRaw = toPlainText(output.reply_text ?? (output as unknown as Record<string, unknown>).message ?? '').slice(0, 2000);
    if (!allowed.includes(action)) {
        action = 'CHAT';
    }

    const clientIds = new Set((c.clients || []).map(x => x.id));
    const jobIds = new Set((c.jobs || []).map(x => x.id));
    const docIds = new Set((c.documents || []).map(x => x.id));
    const invIds = new Set((c.inventory || []).map(x => x.id));
    const mentionClientIds = (c.mentions || []).filter(m => m.kind === 'client' && clientIds.has(m.id)).map(m => m.id);
    const mentionDocIds = (c.mentions || []).filter(m => m.kind === 'document' && docIds.has(m.id)).map(m => m.id);

    const userText = [...(req.history || []).filter(h => h.role === 'user').map(h => h.text), req.message].join('\n');

    // Email-only intent must never create a document.
    if (action === 'GENERATE_DOCUMENT' && req.scope !== 'form' && isSendOnlyRequest(req.message) && allowed.includes('PREPARE_EMAIL_BATCH')) {
        action = 'PREPARE_EMAIL_BATCH';
    }

    const proposal: RouterProposal = { action_type: action, reply_text: replyRaw };
    const jobId = typeof output.job_id === 'string' && jobIds.has(output.job_id) ? output.job_id : null;

    if (action === 'GENERATE_DOCUMENT' || action === 'GATHER_INFO') {
        let docType: DocKey | null = req.scope === 'form'
            ? resolveDocKey(c.form_document_type)
            : resolveDocKey(output.document_type) || (c.pending_draft ? resolveDocKey(c.pending_draft.document_type) : null);
        if (!docType) {
            return {
                action_type: 'CHAT',
                reply_text: replyRaw || `Which document should I create? For example: ${DOC_TYPES.slice(0, 4).map(t => DOC_LABELS[t].toLowerCase()).join(', ')}.`,
            };
        }
        const normalizeOpts: NormalizeOptions = { ...(ctx.normalize || {}), today: c.today, userText };
        const pending = c.pending_draft && resolveDocKey(c.pending_draft.document_type) === docType
            ? normalizePrefill(docType, c.pending_draft.prefill, normalizeOpts)
            : {};
        const fresh = normalizePrefill(docType, fieldsToObject(output, docType), normalizeOpts);
        const prefill = mergeDraft(pending, fresh);
        const schema = getSchema(docType);
        const modelMissing = Array.isArray(output.missing_fields)
            ? output.missing_fields.filter(k => typeof k === 'string' && schema[k]?.ask && prefill[k] === undefined)
            : [];
        const missing = Array.from(new Set([...getMissingAskFields(docType, prefill), ...modelMissing]));
        const proceed = c.proceed === true || req.scope === 'form';
        proposal.document_type = docType;
        proposal.prefill = prefill;
        if (missing.length && !proceed) {
            proposal.action_type = 'GATHER_INFO';
            proposal.missing_fields = missing;
            proposal.reply_text = replyRaw || `I started your ${DOC_LABELS[docType].toLowerCase()}. A few details are still missing — fill in what you know, or skip and I'll leave those boxes empty.`;
        } else {
            proposal.action_type = 'GENERATE_DOCUMENT';
            proposal.missing_fields = missing;
            proposal.reply_text = (action === 'GATHER_INFO' ? '' : replyRaw) || defaultReply.GENERATE_DOCUMENT!;
        }
        const resolvedJob = req.scope !== 'dashboard' && c.active_job_id && jobIds.has(c.active_job_id) ? c.active_job_id : jobId;
        proposal.job_id = resolvedJob || null;
        proposal.client_ids = uniqueValid([...(output.client_ids || []), ...mentionClientIds], clientIds, 1);
        return proposal;
    }

    switch (action) {
        case 'PREPARE_EMAIL_BATCH': {
            const docs = uniqueValid([...mentionDocIds, ...(output.document_ids || [])], docIds, 10);
            let clients = uniqueValid([...mentionClientIds, ...(output.client_ids || [])], clientIds, 10);
            if (!clients.length && docs.length) {
                // Derive the recipient from the documents' client (exact name, unique match only).
                const names = new Set(docs.map(id => (c.documents || []).find(d => d.id === id)?.client_name?.trim().toLowerCase()).filter(Boolean));
                for (const name of names) {
                    const matches = (c.clients || []).filter(cl => cl.name.trim().toLowerCase() === name);
                    if (matches.length === 1) clients.push(matches[0].id);
                }
                clients = Array.from(new Set(clients));
            }
            if (!clients.length) {
                return { action_type: 'CHAT', reply_text: replyRaw && !/sent|sending/i.test(replyRaw) ? replyRaw : 'Who should receive it? Mention the client with @ (for example @Jane Smith) and the document with #.' };
            }
            proposal.client_ids = clients;
            proposal.document_ids = docs;
            proposal.email_subject = toPlainText(output.email_subject ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200) || null;
            proposal.email_body = toPlainText(output.email_body ?? '').slice(0, 5000) || null;
            proposal.reply_text = defaultReply.PREPARE_EMAIL_BATCH!;
            return proposal;
        }
        case 'DRAFT_EMAIL_ONLY': {
            const body = toPlainText(output.email_body ?? '').slice(0, 5000);
            if (!body) return { action_type: 'CHAT', reply_text: replyRaw || 'What should the email say?' };
            proposal.email_subject = toPlainText(output.email_subject ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200) || null;
            proposal.email_body = body;
            proposal.client_ids = uniqueValid([...mentionClientIds, ...(output.client_ids || [])], clientIds, 1);
            proposal.reply_text = replyRaw || 'Here is a draft you can copy or open in Communication.';
            return proposal;
        }
        case 'CREATE_CLIENT':
        case 'ADD_INVENTORY':
        case 'ADD_PRICE_BOOK_ITEM':
        case 'CREATE_JOB': {
            const e = (output.entity && typeof output.entity === 'object' ? output.entity : {}) as Record<string, unknown>;
            const name = toPlainText(e.name ?? '').replace(/\s+/g, ' ').slice(0, 120);
            if (!name) return { action_type: 'CHAT', reply_text: replyRaw || 'What name should I use?' };
            const entity: Record<string, unknown> = { name };
            const textKeys = action === 'CREATE_CLIENT' ? ['email', 'phone', 'address', 'notes']
                : action === 'CREATE_JOB' ? ['client_name', 'address', 'start_date', 'description']
                    : ['description', 'category', 'unit', 'supplier'];
            for (const k of textKeys) {
                const v = toPlainText(e[k] ?? '').replace(/\s+/g, ' ').slice(0, 300);
                if (v) entity[k] = v;
            }
            if (action === 'CREATE_CLIENT' && entity.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(entity.email))) delete entity.email;
            if (action === 'CREATE_JOB' && entity.start_date) {
                const m = String(entity.start_date).match(/^\d{4}-\d{2}-\d{2}$/);
                if (!m) delete entity.start_date;
            }
            for (const k of ['quantity', 'price', 'cost']) {
                const n = toNumberOrUndefined(e[k]);
                if (n !== undefined && n >= 0 && (action === 'ADD_INVENTORY' || action === 'ADD_PRICE_BOOK_ITEM')) entity[k] = n;
            }
            proposal.entity = entity;
            proposal.reply_text = replyRaw || 'Please confirm the details below.';
            return proposal;
        }
        case 'RESTOCK_INVENTORY': {
            const itemId = typeof output.inventory_item_id === 'string' && invIds.has(output.inventory_item_id) ? output.inventory_item_id : null;
            const delta = toNumberOrUndefined(output.quantity_delta);
            if (!itemId || delta === undefined || delta === 0) {
                return { action_type: 'CHAT', reply_text: replyRaw || 'Which inventory item, and by how much should I change the stock?' };
            }
            proposal.inventory_item_id = itemId;
            proposal.quantity_delta = Math.max(-100000, Math.min(100000, delta));
            proposal.reply_text = replyRaw || 'Please confirm the stock change.';
            return proposal;
        }
        case 'UPDATE_JOB_STATUS':
        case 'DUPLICATE_JOB': {
            const status = (JOB_STATUSES as readonly string[]).includes(String(output.job_status)) ? output.job_status as JobStatus : null;
            if (action === 'UPDATE_JOB_STATUS' && !status) return { action_type: 'CHAT', reply_text: replyRaw || 'Which status should the job have: active, paused or completed?' };
            const scopedJob = req.scope === 'job' && c.active_job_id && jobIds.has(c.active_job_id) ? c.active_job_id : null;
            proposal.job_id = scopedJob || jobId;
            if (status) proposal.job_status = status;
            proposal.reply_text = replyRaw || 'Please confirm the job change.';
            return proposal;
        }
        case 'NAVIGATE_TO': {
            if (!route) return { action_type: 'CHAT', reply_text: replyRaw || defaultReply.CHAT! };
            proposal.route = route;
            proposal.reply_text = replyRaw || defaultReply.NAVIGATE_TO!;
            return proposal;
        }
        case 'CHAT':
        default:
            return { action_type: 'CHAT', reply_text: replyRaw || defaultReply.CHAT! };
    }
}

export const isRouterAction = (v: unknown): v is RouterAction => typeof v === 'string' && (ROUTER_ACTIONS as readonly string[]).includes(v);
export { isDocKey };
