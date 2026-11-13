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
    'UPDATE_JOB_STATUS', 'DUPLICATE_JOB', 'NAVIGATE_TO', 'RUN_PLAN',
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
    RUN_PLAN: 'confirm',
};

export const SCOPE_ACTIONS: Record<RouterScope, readonly RouterAction[]> = {
    dashboard: ROUTER_ACTIONS,
    job: ['CHAT', 'GATHER_INFO', 'GENERATE_DOCUMENT', 'PREPARE_EMAIL_BATCH', 'DRAFT_EMAIL_ONLY', 'UPDATE_JOB_STATUS', 'RUN_PLAN'],
    form: ['CHAT', 'GENERATE_DOCUMENT'],
};

/**
 * Actions a RUN_PLAN step may use. Each runs like the single action, except that nothing opens
 * a form: records are saved directly (documents as Draft) after the user pressed "Do it all".
 */
export const PLAN_STEP_ACTIONS = [
    'CREATE_CLIENT', 'CREATE_JOB', 'GENERATE_DOCUMENT', 'ADD_INVENTORY', 'ADD_PRICE_BOOK_ITEM',
    'RESTOCK_INVENTORY', 'UPDATE_JOB_STATUS',
] as const;
export type PlanStepAction = typeof PLAN_STEP_ACTIONS[number];
/** Most steps one plan may contain (extra steps are dropped with a note). */
export const PLAN_MAX_STEPS = 20;

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
export interface ContextDocument { id: string; type: string; label: string; job_id?: string; client_name?: string; summary?: ContextDocumentSummary }
/** One line of a document summary (description, quantity, unit price, line amount). */
export interface ContextDocumentLine { desc: string; qty?: number; price?: number; amount?: number }
/**
 * Compact facts about one document so the assistant can answer "is the invoice paid?" or "what is on
 * the estimate?". Built in the browser (src/ai/documentSummary.ts); clamped here. Money is in the
 * document's own currency. Fields the browser does not know (list-only data) are left out.
 */
export interface ContextDocumentSummary {
    number?: string;
    status?: string;
    /** issue / work date, YYYY-MM-DD */
    date?: string;
    /** invoice due date, estimate expiry, purchase order delivery date */
    due_date?: string;
    total?: number;
    paid?: number;
    balance_due?: number;
    /** client signature (estimates / change orders) */
    signed_by?: string;
    signed_at?: string;
    /** vendor (purchase orders, expenses), worker (time sheets), payment method (receipts) */
    party?: string;
    hours?: number;
    /** short plain-text excerpt (reports, notes, work orders, receipts) */
    note?: string;
    items?: ContextDocumentLine[];
    /** line items left out of `items` */
    more_items?: number;
}
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
    /** line items per document summary */
    documentLines: 8,
    /** all document summaries together (JSON chars, ≈4k tokens); later documents lose their lines, then their summary */
    documentSummaryChars: 16_000,
} as const;

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const money = (v: unknown): number | undefined => {
    const n = toNumberOrUndefined(v);
    return n !== undefined && Math.abs(n) < 1e11 ? Math.round(n * 100) / 100 : undefined;
};

/** Clamps one document summary from the browser (unknown keys dropped, every value bounded). */
function cleanDocumentSummary(raw: unknown): ContextDocumentSummary | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const s = raw as Record<string, unknown>;
    const out: ContextDocumentSummary = {};
    const text = (key: 'number' | 'status' | 'date' | 'due_date' | 'signed_by' | 'signed_at' | 'party' | 'note', max: number) => {
        const v = toPlainText(typeof s[key] === 'string' ? s[key] : '').replace(/\s+/g, ' ').trim().slice(0, max);
        if (v) out[key] = v;
    };
    text('number', 40); text('status', 30); text('date', 10); text('due_date', 10);
    text('signed_by', 80); text('signed_at', 25); text('party', 80); text('note', 240);
    for (const key of ['total', 'paid', 'balance_due', 'hours'] as const) {
        const n = money(s[key]);
        if (n !== undefined) out[key] = n;
    }
    const lines = Array.isArray(s.items) ? s.items : [];
    const items = lines.slice(0, REQUEST_LIMITS.documentLines)
        .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === 'object' && !Array.isArray(l))
        .map(l => {
            const line: ContextDocumentLine = { desc: toPlainText(typeof l.desc === 'string' ? l.desc : '').replace(/\s+/g, ' ').trim().slice(0, 80) };
            const qty = money(l.qty); const price = money(l.price); const amount = money(l.amount);
            if (qty !== undefined) line.qty = qty;
            if (price !== undefined) line.price = price;
            if (amount !== undefined) line.amount = amount;
            return line;
        })
        .filter(l => l.desc);
    if (items.length) out.items = items;
    const more = Math.max(0, Math.floor(toNumberOrUndefined(s.more_items) ?? 0)) + Math.max(0, lines.length - REQUEST_LIMITS.documentLines);
    if (more > 0) out.more_items = Math.min(more, 9999);
    return Object.keys(out).length ? out : undefined;
}

/** Keeps the summaries inside REQUEST_LIMITS.documentSummaryChars (first documents are the most relevant). */
function capDocumentSummaries(docs: ContextDocument[]): ContextDocument[] {
    let budget: number = REQUEST_LIMITS.documentSummaryChars;
    return docs.map(d => {
        if (!d.summary) return d;
        let size = JSON.stringify(d.summary).length;
        if (size <= budget) { budget -= size; return d; }
        const { items: _items, ...noLines } = d.summary;
        const lean: ContextDocumentSummary = d.summary.items?.length ? { ...noLines, more_items: (d.summary.more_items || 0) + d.summary.items.length } : noLines;
        size = JSON.stringify(lean).length;
        if (size <= budget) { budget -= size; return { ...d, summary: lean }; }
        const { summary: _s, ...bare } = d;
        return bare;
    });
}

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
            documents: capDocumentSummaries(arr(c.documents, REQUEST_LIMITS.documents).map(x => {
                const doc: ContextDocument = { id: str(x.id, 80), type: str(x.type, 40), label: str(x.label, 120), job_id: str(x.job_id, 80) || undefined, client_name: str(x.client_name, 120) || undefined };
                const summary = cleanDocumentSummary(x.summary);
                if (summary) doc.summary = summary;
                return doc;
            }).filter(x => x.id && x.type)),
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
    /** RUN_PLAN: every step of a multi-part request, in order. */
    plan_steps?: ModelPlanStep[];
}

/** One RUN_PLAN step as the model returns it (same payload keys as the single actions). */
export interface ModelPlanStep {
    action_type: string;
    /** Short name later steps use to point at what this step creates ("client_jake", "job1"). */
    ref?: string | null;
    entity?: Record<string, unknown> | null;
    document_type?: string | null;
    fields?: Array<{ key: string; value: string }>;
    line_items?: ModelOutput['line_items'];
    /** ref of a CREATE_JOB step of this plan, or job_id of an existing job (CONTEXT DATA). */
    job_ref?: string | null;
    job_id?: string | null;
    /** ref of a CREATE_CLIENT step of this plan, or client_id of an existing client (CONTEXT DATA). */
    client_ref?: string | null;
    client_id?: string | null;
    inventory_item_id?: string | null;
    quantity_delta?: number | null;
    job_status?: string | null;
}

/**
 * Gemini `responseSchema` (OpenAPI subset: no unions, so a plan step is one object with optional
 * fields). The step's field `key` is a plain string on purpose: repeating the big key enum inside the
 * step array would multiply the schema's states; unknown keys are dropped by `normalizePrefill`.
 *
 * `compact` is the fallback the edge function sends when a model rejects the schema as too complex
 * (400 INVALID_ARGUMENT): no field-key enum, no document-type enum inside plan steps. Everything it
 * no longer constrains is still validated by `buildProposal`.
 */
export const RESPONSE_SCHEMA_TYPES = ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'NULL'] as const;
export function buildResponseSchema(scope: RouterScope, options: { compact?: boolean } = {}): Record<string, unknown> {
    const compact = options.compact === true;
    const S = (extra: Record<string, unknown> = {}) => ({ type: 'STRING', ...extra });
    const N = (extra: Record<string, unknown> = {}) => ({ type: 'NUMBER', ...extra });
    const lineItems = {
        type: 'ARRAY',
        items: {
            type: 'OBJECT',
            properties: { description: S(), quantity: N(), rate: N(), unit_cost: N({ nullable: true }), supplier: S({ nullable: true }) },
            required: ['description'],
        },
    };
    const entity = {
        type: 'OBJECT',
        nullable: true,
        properties: {
            name: S({ nullable: true }), email: S({ nullable: true }), phone: S({ nullable: true }), address: S({ nullable: true }),
            notes: S({ nullable: true }), description: S({ nullable: true }), category: S({ nullable: true }), unit: S({ nullable: true }),
            supplier: S({ nullable: true }), quantity: N({ nullable: true }), price: N({ nullable: true }), cost: N({ nullable: true }),
            client_name: S({ nullable: true }), start_date: S({ nullable: true }),
        },
    };
    const stepActions = PLAN_STEP_ACTIONS.filter(a => SCOPE_ACTIONS[scope].includes(a));
    const planSteps = SCOPE_ACTIONS[scope].includes('RUN_PLAN') && stepActions.length ? {
        plan_steps: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    action_type: S({ enum: stepActions }),
                    ref: S({ nullable: true }),
                    entity,
                    document_type: compact ? S({ nullable: true }) : S({ enum: [...DOC_TYPES], nullable: true }),
                    fields: { type: 'ARRAY', items: { type: 'OBJECT', properties: { key: S(), value: S() }, required: ['key', 'value'] } },
                    line_items: lineItems,
                    job_ref: S({ nullable: true }),
                    job_id: S({ nullable: true }),
                    client_ref: S({ nullable: true }),
                    client_id: S({ nullable: true }),
                    inventory_item_id: S({ nullable: true }),
                    quantity_delta: N({ nullable: true }),
                    job_status: S({ enum: [...JOB_STATUSES], nullable: true }),
                },
                required: ['action_type'],
            },
        },
    } : {};
    return {
        type: 'OBJECT',
        properties: {
            action_type: S({ enum: [...SCOPE_ACTIONS[scope]] }),
            reply_text: S(),
            document_type: S({ enum: [...DOC_TYPES], nullable: true }),
            fields: {
                type: 'ARRAY',
                items: { type: 'OBJECT', properties: { key: compact ? S() : S({ enum: ALL_FIELD_KEYS }), value: S() }, required: ['key', 'value'] },
            },
            line_items: lineItems,
            missing_fields: { type: 'ARRAY', items: S() },
            job_id: S({ nullable: true }),
            client_ids: { type: 'ARRAY', items: S() },
            document_ids: { type: 'ARRAY', items: S() },
            route: S({ enum: [...APP_ROUTES], nullable: true }),
            job_status: S({ enum: [...JOB_STATUSES], nullable: true }),
            entity,
            inventory_item_id: S({ nullable: true }),
            quantity_delta: N({ nullable: true }),
            email_subject: S({ nullable: true }),
            email_body: S({ nullable: true }),
            ...planSteps,
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
    /** RUN_PLAN: validated steps, in the order they run (creations first). */
    plan?: PlanStep[];
    /** RUN_PLAN: what was left out of the model's plan and why (shown on the card). */
    plan_notes?: string[];
    /** The user asked for example/sample data: documents carry realistic sample content. */
    sample_data?: boolean;
}

/**
 * One validated RUN_PLAN step. Ids are always ids from the request context; records created by
 * an earlier step of the same plan are referenced by that step's `ref` (job_ref / client_ref).
 */
export interface PlanStep {
    /** Stable id inside the plan ("s1", "s2", …). */
    id: string;
    action_type: PlanStepAction;
    /** Unique within the plan; what job_ref / client_ref of later steps point to. */
    ref: string;
    /** CREATE_CLIENT / CREATE_JOB / ADD_INVENTORY / ADD_PRICE_BOOK_ITEM, validated like the single actions. */
    entity?: Record<string, unknown>;
    /** GENERATE_DOCUMENT */
    document_type?: DocKey;
    prefill?: Record<string, unknown>;
    /** GENERATE_DOCUMENT: "ask" fields that stay empty (plans never stop to ask). */
    missing_fields?: string[];
    /** Job: ref of an earlier CREATE_JOB step, or an existing job id. At most one is set. */
    job_ref?: string | null;
    job_id?: string | null;
    /** Client: ref of an earlier CREATE_CLIENT step, or an existing client id. At most one is set. */
    client_ref?: string | null;
    client_id?: string | null;
    inventory_item_id?: string | null;
    quantity_delta?: number | null;
    job_status?: JobStatus | null;
    /** Browser only: the user removed this step on the card (never set by the server). */
    skip?: boolean;
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

/**
 * "Just an example", "sample data", "make something up": the user explicitly asks for made-up content,
 * so plan documents may carry realistic sample values (the daily-report fact guards do not apply).
 */
export function isSampleRequest(text: string): boolean {
    const t = text || '';
    return /\bjust\s+(?:an?\s+)?(?:example|test|demo|sample|testing)\b/i.test(t)
        || /\b(?:as|for)\s+an?\s+(?:example|test|demo)\b/i.test(t)
        || /\b(?:it'?s|this\s+is)\s+(?:only\s+|just\s+)?an?\s+(?:test|example|demo)\b/i.test(t)
        || /\b(?:example|sample|dummy|fake|mock|placeholder)\s+(?:data|content|values|text|numbers|entries|records|documents?|docs|clients?|jobs?|invoices?|estimates?|reports?)\b/i.test(t)
        // "test report" / "test results" are real site documents: only data-like nouns count for test/demo
        || /\b(?:test|demo)\s+(?:data|content|values|entries|records|documents|docs|clients?|jobs?|invoices?)\b/i.test(t)
        || /\b(?:dummy|fake)\b/i.test(t)
        || /\bmake\s+(?:something|stuff|it|them|things|everything|the\s+rest)\s+up\b|\bmade[- ]up\b/i.test(t)
        || /\bfill\s+(?:it|them|everything)\s+(?:in\s+)?with\s+(?:examples?|samples?)\b/i.test(t);
}

const defaultReply: Partial<Record<RouterAction, string>> = {
    CHAT: 'How can I help with your jobs and documents?',
    GENERATE_DOCUMENT: 'Here is your draft. Check the fields, then open it to edit or save it.',
    PREPARE_EMAIL_BATCH: 'I prepared the email for you to review. Nothing is sent until you press Send.',
    NAVIGATE_TO: 'Opening that page.',
    RUN_PLAN: 'Here is the plan. Check the steps, then press "Do it all".',
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

type EntityAction = 'CREATE_CLIENT' | 'CREATE_JOB' | 'ADD_INVENTORY' | 'ADD_PRICE_BOOK_ITEM';

/** Validated entity for the create/add actions (single action and plan step), or null without a name. */
function cleanEntity(action: EntityAction, raw: unknown): Record<string, unknown> | null {
    const e = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const name = toPlainText(e.name ?? '').replace(/\s+/g, ' ').slice(0, 120);
    if (!name) return null;
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
    return entity;
}

// ───────────────────────────── multi-step plans (RUN_PLAN) ─────────────────────────────

const STEP_LABELS: Record<PlanStepAction, string> = {
    CREATE_CLIENT: 'new client', CREATE_JOB: 'new job', GENERATE_DOCUMENT: 'document', ADD_INVENTORY: 'inventory item',
    ADD_PRICE_BOOK_ITEM: 'price book item', RESTOCK_INVENTORY: 'stock change', UPDATE_JOB_STATUS: 'job status',
};

/** Creations run first so later steps can point at them; otherwise the model's order is kept. */
const STEP_ORDER: Record<PlanStepAction, number> = {
    CREATE_CLIENT: 0, CREATE_JOB: 1, GENERATE_DOCUMENT: 2, ADD_INVENTORY: 2, ADD_PRICE_BOOK_ITEM: 2, RESTOCK_INVENTORY: 2, UPDATE_JOB_STATUS: 3,
};

const refKey = (v: unknown): string => toPlainText(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

interface CreatedRef { ref: string; name: string }

/**
 * Finds the plan record a model reference points to. Accepts the exact ref ("client_jake"), loose
 * spellings ("client:Jake", "Jake", "job 1") and the record's name. Unique matches only.
 */
function findCreated(list: CreatedRef[], kind: 'client' | 'job', raw: unknown): string | null {
    const k = refKey(raw);
    if (!k || !list.length) return null;
    const exact = list.filter(x => refKey(x.ref) === k);
    if (exact.length === 1) return exact[0].ref;
    const strip = (s: string) => s.replace(kind === 'client' ? /^(?:clients?|customers?)/ : /^(?:jobs?|projects?)/, '');
    const ks = strip(k);
    if (!ks) return null;
    const loose = list.filter(x => strip(refKey(x.ref)) === ks || refKey(x.name) === k || refKey(x.name) === ks || strip(refKey(x.name)) === ks);
    return loose.length === 1 ? loose[0].ref : null;
}

/** The model's step as a single-action output (used when a "plan" has only one step). */
function stepAsOutput(step: ModelPlanStep, action: PlanStepAction, reply: unknown): ModelOutput {
    return {
        action_type: action,
        reply_text: typeof reply === 'string' ? reply : '',
        document_type: step.document_type ?? null,
        fields: step.fields,
        line_items: step.line_items,
        job_id: step.job_id ?? null,
        client_ids: typeof step.client_id === 'string' ? [step.client_id] : [],
        entity: step.entity ?? null,
        inventory_item_id: step.inventory_item_id ?? null,
        quantity_delta: step.quantity_delta ?? null,
        job_status: step.job_status ?? null,
    };
}

/**
 * Validates a RUN_PLAN answer: caps the number of steps, drops steps the scope does not allow or that
 * are unusable (with a note the card shows), resolves job/client references between steps, keeps ids
 * only when they exist in the request context, and normalizes every document like a single draft.
 * One usable step → that single action (so "create a client named X" never becomes a plan).
 */
function buildPlanProposal(output: ModelOutput, rawSteps: unknown[], ctx: BuildProposalContext, replyRaw: string): RouterProposal {
    const req = ctx.request;
    const c = req.context || {};
    const allowed = SCOPE_ACTIONS[req.scope];
    const stepActions = PLAN_STEP_ACTIONS.filter(a => allowed.includes(a));
    const notes: string[] = [];
    const userText = [...(req.history || []).filter(h => h.role === 'user').map(h => h.text), req.message].join('\n');
    const sample = isSampleRequest(userText);
    const sendOnly = isSendOnlyRequest(req.message);
    const clientIds = new Set((c.clients || []).map(x => x.id));
    const jobIds = new Set((c.jobs || []).map(x => x.id));
    const invIds = new Set((c.inventory || []).map(x => x.id));
    const activeJob = req.scope !== 'dashboard' && c.active_job_id && jobIds.has(c.active_job_id) ? c.active_job_id : null;
    const lowerText = userText.toLowerCase();
    const contextClientByName = (name: unknown): string | null => {
        const n = toPlainText(name ?? '').trim().toLowerCase();
        if (!n) return null;
        const m = (c.clients || []).filter(x => x.name.trim().toLowerCase() === n);
        return m.length === 1 ? m[0].id : null;
    };

    if (rawSteps.length > PLAN_MAX_STEPS) {
        notes.push(`A plan can have up to ${PLAN_MAX_STEPS} steps, so I left out the last ${rawSteps.length - PLAN_MAX_STEPS}. Ask me again for the rest.`);
    }

    // 1) usable actions, creations first
    const drafts: Array<{ raw: ModelPlanStep; action: PlanStepAction; index: number }> = [];
    rawSteps.slice(0, PLAN_MAX_STEPS).forEach((s, index) => {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return;
        const raw = s as ModelPlanStep;
        const name = typeof raw.action_type === 'string' ? raw.action_type.trim().toUpperCase() : '';
        const action = (ACTION_ALIASES[name]?.action || name) as PlanStepAction;
        if (!(stepActions as readonly string[]).includes(action)) {
            notes.push(`Step ${index + 1} was left out: ${name ? `"${name.toLowerCase().replace(/_/g, ' ')}" can't run in a plan here` : 'it had no action'}.`);
            return;
        }
        if (sendOnly && action === 'GENERATE_DOCUMENT') {
            notes.push(`Step ${index + 1} was left out: you asked to send documents, not to create new ones.`);
            return;
        }
        drafts.push({ raw, action, index });
    });
    drafts.sort((a, b) => (STEP_ORDER[a.action] - STEP_ORDER[b.action]) || (a.index - b.index));

    // 2) validate each step
    const steps: PlanStep[] = [];
    const usedRefs = new Set<string>();
    const makeRef = (raw: unknown, fallback: string): string => {
        const base = toPlainText(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
            || fallback.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'step';
        let ref = base;
        for (let n = 2; usedRefs.has(ref); n++) ref = `${base}_${n}`;
        usedRefs.add(ref);
        return ref;
    };
    const clients: CreatedRef[] = [];
    const jobs: CreatedRef[] = [];
    const used: typeof drafts = [];
    const skip = (index: number, why: string) => notes.push(`Step ${index + 1} was left out: ${why}.`);

    for (const d of drafts) {
        const { raw, action, index } = d;
        const id = `s${steps.length + 1}`;
        switch (action) {
            case 'CREATE_CLIENT':
            case 'ADD_INVENTORY':
            case 'ADD_PRICE_BOOK_ITEM': {
                const entity = cleanEntity(action, raw.entity);
                if (!entity) { skip(index, `the ${STEP_LABELS[action]} had no name`); continue; }
                if (action === 'CREATE_CLIENT') {
                    // Contact details only when the user typed them (no invented emails/phones in plans).
                    if (entity.email && !lowerText.includes(String(entity.email).toLowerCase())) delete entity.email;
                    const digits = String(entity.phone || '').replace(/\D/g, '');
                    if (entity.phone && (digits.length < 7 || !userText.replace(/\D/g, '').includes(digits))) delete entity.phone;
                }
                const ref = makeRef(raw.ref, action === 'CREATE_CLIENT' ? `client_${String(entity.name)}` : `item_${steps.length + 1}`);
                if (action === 'CREATE_CLIENT') clients.push({ ref, name: String(entity.name) });
                steps.push({ id, action_type: action, ref, entity });
                break;
            }
            case 'CREATE_JOB': {
                const rawEntity = (raw.entity && typeof raw.entity === 'object' ? raw.entity : {}) as Record<string, unknown>;
                const fallbackName = sample ? 'Sample Job' : `New job ${c.today || ''}`.trim();
                const entity = cleanEntity('CREATE_JOB', { ...rawEntity, name: toPlainText(rawEntity.name ?? '').trim() || fallbackName }) as Record<string, unknown>;
                const step: PlanStep = { id, action_type: action, ref: makeRef(raw.ref, `job_${jobs.length + 1}`), entity };
                const existingClient = typeof raw.client_id === 'string' && clientIds.has(raw.client_id) ? raw.client_id : null;
                const planClient = existingClient ? null : findCreated(clients, 'client', raw.client_ref ?? raw.client_id ?? entity.client_name);
                const namedClient = existingClient || planClient ? null : contextClientByName(entity.client_name);
                if (planClient) {
                    step.client_ref = planClient;
                    entity.client_name = clients.find(x => x.ref === planClient)?.name;
                } else if (existingClient || namedClient) {
                    step.client_id = existingClient || namedClient;
                    entity.client_name = (c.clients || []).find(x => x.id === step.client_id)?.name;
                }
                jobs.push({ ref: step.ref, name: String(entity.name) });
                steps.push(step);
                break;
            }
            case 'GENERATE_DOCUMENT': {
                const docType = resolveDocKey(raw.document_type);
                if (!docType) { skip(index, 'the document type was missing'); continue; }
                const normalizeOpts: NormalizeOptions = { ...(ctx.normalize || {}), today: c.today, userText: sample ? undefined : userText };
                const prefill = normalizePrefill(docType, fieldsToObject(raw as unknown as ModelOutput, docType), normalizeOpts);
                const step: PlanStep = {
                    id, action_type: action, ref: makeRef(raw.ref, `doc_${steps.length + 1}`), document_type: docType, prefill,
                    missing_fields: getMissingAskFields(docType, prefill),
                };
                // Job: the open job (job scope) › an existing job id › a job of this plan › the only job of this plan.
                const existingJob = activeJob || (typeof raw.job_id === 'string' && jobIds.has(raw.job_id) ? raw.job_id : null);
                const planJob = existingJob ? null : findCreated(jobs, 'job', raw.job_ref ?? raw.job_id) || (jobs.length === 1 ? jobs[0].ref : null);
                if (existingJob) step.job_id = existingJob;
                else if (planJob) step.job_ref = planJob;
                // Client: an existing client id › a client of this plan › the document's client name.
                const existingClient = typeof raw.client_id === 'string' && clientIds.has(raw.client_id) ? raw.client_id : null;
                const planClient = existingClient ? null : findCreated(clients, 'client', raw.client_ref ?? raw.client_id)
                    || findCreated(clients, 'client', prefill.clientName);
                const namedClient = existingClient || planClient ? null : contextClientByName(prefill.clientName);
                if (planClient) step.client_ref = planClient;
                else if (existingClient || namedClient) step.client_id = existingClient || namedClient;
                steps.push(step);
                break;
            }
            case 'RESTOCK_INVENTORY': {
                const itemId = typeof raw.inventory_item_id === 'string' && invIds.has(raw.inventory_item_id) ? raw.inventory_item_id : null;
                const delta = toNumberOrUndefined(raw.quantity_delta);
                if (!itemId || delta === undefined || delta === 0) { skip(index, 'I could not tell which inventory item or how much'); continue; }
                steps.push({ id, action_type: action, ref: makeRef(raw.ref, `stock_${steps.length + 1}`), inventory_item_id: itemId, quantity_delta: Math.max(-100000, Math.min(100000, delta)) });
                break;
            }
            case 'UPDATE_JOB_STATUS': {
                const status = (JOB_STATUSES as readonly string[]).includes(String(raw.job_status)) ? raw.job_status as JobStatus : null;
                const existingJob = activeJob || (typeof raw.job_id === 'string' && jobIds.has(raw.job_id) ? raw.job_id : null);
                const planJob = existingJob ? null : findCreated(jobs, 'job', raw.job_ref ?? raw.job_id);
                if (!status || (!existingJob && !planJob)) { skip(index, 'I could not tell which job or which status'); continue; }
                steps.push({ id, action_type: action, ref: makeRef(raw.ref, `status_${steps.length + 1}`), job_status: status, ...(existingJob ? { job_id: existingJob } : { job_ref: planJob }) });
                break;
            }
        }
        used.push(d);
    }

    if (!steps.length) {
        return { action_type: 'CHAT', reply_text: [replyRaw && !/\b(?:done|created|saved|added)\b/i.test(replyRaw) ? replyRaw : '', ...notes].filter(Boolean).join(' ') || 'What should I do first?' };
    }
    if (steps.length === 1) {
        // A one-step "plan" is just that action (same card and behavior as a direct request).
        const single = buildProposal(stepAsOutput(used[0].raw, used[0].action, output.reply_text), ctx);
        if (notes.length) single.reply_text = [single.reply_text, ...notes].filter(Boolean).join(' ');
        return single;
    }
    return {
        action_type: 'RUN_PLAN',
        reply_text: replyRaw || defaultReply.RUN_PLAN!,
        plan: steps,
        plan_notes: notes,
        ...(sample ? { sample_data: true } : {}),
    };
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

    // Multi-part request: RUN_PLAN, or a single action that still came with two or more plan steps.
    const loose = output as unknown as Record<string, unknown>;
    const rawSteps = Array.isArray(output.plan_steps) ? output.plan_steps : Array.isArray(loose.steps) ? loose.steps as unknown[] : [];
    if (allowed.includes('RUN_PLAN') && (action === 'RUN_PLAN' || (rawSteps.length >= 2 && (PLAN_STEP_ACTIONS as readonly string[]).includes(action)))) {
        return buildPlanProposal(output, rawSteps, ctx, replyRaw);
    }

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
            const entity = cleanEntity(action, output.entity);
            if (!entity) return { action_type: 'CHAT', reply_text: replyRaw || 'What name should I use?' };
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
