/**
 * Client selections: pure logic (no Supabase, no React). Shapes: lib/selections/selectionTypes.ts.
 *
 *   OWNER_TRANSITIONS / canTransition(from, to, { everSent })   the status machine (same as the database)
 *   ownerActions(s)          -> SelectionOwnerAction[]   (buttons to show, in order)
 *   isAwaitingClient(s) / isOverdue(s, today?) / summarizeSelections(list, today?) -> SelectionSummary
 *   statusLabel(status) / historyLabel(entry)
 *   SELECTION_TEMPLATES / draftFromTemplate(id, overrides?)   Tile, Paint, Flooring, Fixtures, Appliances, Countertops
 *   makeOptionId()           -> 'o_xxxxxxxxxxxx'
 *   parseMoney(v) / parseQty(v)                       -> number | null   ("1,234.50" / "$12" accepted)
 *   validateHttpsLink(url)   -> { ok, url } | { ok: false, error }   (https only; adds https:// to a bare host)
 *   normalizeOptions(list)   -> SelectionOption[]   (valid, max 6, ids kept / made; throws a readable Error)
 *   validateDraft(draft, { sending? }) -> string | null
 *   optionPricing(option, allowance) -> OptionPricing   (total, cost, difference vs allowance, upgrade / credit)
 *   chosenOption(s) / chosenPricing(s)
 *   optionImageStoragePath(userId, jobId, fileName, mime, random?) / validateOptionImage(file)
 *   sortSelections(list)     waiting first (overdue / soonest due), then to approve, drafts, approved, ordered, closed
 *   mapSelectionRow(row) / selectionInsertRow(...) / selectionPatchRow(patch) / optionsToJson(list) / parseOptions(json)
 */
import { roundMoney } from '../../utils/money.ts';
import { portalFilePath, sanitizeFileName } from '../jobFiles/jobFileLogic.ts';
import {
    SELECTION_LIMITS,
    type JobSelection, type OptionPricing, type SelectionDraft, type SelectionHistoryEntry, type SelectionOption,
    type SelectionOptionInput, type SelectionPatch, type SelectionStatus, type SelectionSummary, type SelectionTemplate,
} from './selectionTypes.ts';

export const SELECTION_STATUSES: readonly SelectionStatus[] = ['draft', 'sent', 'chosen', 'approved', 'changes_requested', 'ordered', 'closed'];
/** Statuses the client portal shows. */
export const PORTAL_STATUSES: readonly SelectionStatus[] = ['sent', 'chosen', 'approved', 'changes_requested', 'ordered'];
/** A standing choice: the options are locked (images excepted). */
export const LOCKED_STATUSES: readonly SelectionStatus[] = ['chosen', 'approved', 'ordered'];

/** What the contractor may change a status to (the database guard enforces the same table). 'chosen' is the client's. */
export const OWNER_TRANSITIONS: Readonly<Record<SelectionStatus, readonly SelectionStatus[]>> = {
    draft: ['sent', 'closed'],
    sent: ['draft', 'closed'],
    chosen: ['approved', 'changes_requested', 'sent', 'closed'],
    changes_requested: ['sent', 'closed'],
    approved: ['ordered', 'changes_requested', 'closed'],
    ordered: ['approved', 'closed'],
    closed: ['sent', 'draft'],
};

/** closed -> draft only for a selection that was never sent. */
export const canTransition = (from: SelectionStatus, to: SelectionStatus, opts: { everSent?: boolean } = {}): boolean => {
    if (from === to) return true;
    if (!OWNER_TRANSITIONS[from]?.includes(to)) return false;
    if (from === 'closed' && to === 'draft' && opts.everSent) return false;
    return true;
};

export type SelectionOwnerAction =
    | 'send' | 'edit' | 'withdraw' | 'approve' | 'request_changes' | 'ask_again' | 'create_po' | 'mark_ordered'
    | 'cancel_order' | 'open_po' | 'close' | 'reopen' | 'delete';

/** The buttons for one selection, in display order. */
export const ownerActions = (s: Pick<JobSelection, 'status' | 'poDocumentId'>): SelectionOwnerAction[] => {
    switch (s.status) {
        case 'draft': return ['send', 'edit', 'delete'];
        case 'sent': return ['edit', 'withdraw', 'close', 'delete'];
        case 'chosen': return ['approve', 'request_changes', 'ask_again', 'close'];
        case 'changes_requested': return ['edit', 'send', 'close', 'delete'];
        case 'approved': return ['create_po', 'mark_ordered', 'request_changes', 'close'];
        case 'ordered': return s.poDocumentId ? ['open_po', 'cancel_order', 'close'] : ['cancel_order', 'close'];
        case 'closed': return ['reopen', 'delete'];
        default: return ['delete'];
    }
};

/** Options can be edited (text, prices) in these statuses; while a choice stands only images may change. */
export const canEditOptions = (s: Pick<JobSelection, 'status'>): boolean => !LOCKED_STATUSES.includes(s.status);

// ------------------------------------------------------------------------------------------------ due dates
const todayIso = (d = new Date()): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isAwaitingClient = (s: Pick<JobSelection, 'status'>): boolean => s.status === 'sent';

/** Waiting on the client and the due date is before today (local). `today`: 'YYYY-MM-DD'. */
export const isOverdue = (s: Pick<JobSelection, 'status' | 'dueDate'>, today: string = todayIso()): boolean =>
    s.status === 'sent' && !!s.dueDate && s.dueDate < today;

export const summarizeSelections = (list: readonly Pick<JobSelection, 'status' | 'dueDate'>[], today: string = todayIso()): SelectionSummary => {
    const s: SelectionSummary = { total: 0, draft: 0, waitingOnClient: 0, overdue: 0, toApprove: 0, changesRequested: 0, toOrder: 0, ordered: 0, closed: 0 };
    for (const x of list) {
        s.total += 1;
        switch (x.status) {
            case 'draft': s.draft += 1; break;
            case 'sent': s.waitingOnClient += 1; if (isOverdue(x, today)) s.overdue += 1; break;
            case 'chosen': s.toApprove += 1; break;
            case 'changes_requested': s.changesRequested += 1; break;
            case 'approved': s.toOrder += 1; break;
            case 'ordered': s.ordered += 1; break;
            case 'closed': s.closed += 1; break;
        }
    }
    return s;
};

// ------------------------------------------------------------------------------------------------ labels
export const statusLabel = (s: SelectionStatus): string => {
    switch (s) {
        case 'draft': return 'Draft';
        case 'sent': return 'Waiting for the client';
        case 'chosen': return 'Client chose: to approve';
        case 'approved': return 'Approved';
        case 'changes_requested': return 'Changes needed';
        case 'ordered': return 'Ordered';
        case 'closed': return 'Closed';
        default: return String(s);
    }
};

export const historyLabel = (e: SelectionHistoryEntry): string => {
    const who = e.by === 'client' ? 'Client' : 'You';
    switch (e.action) {
        case 'created': return `${who} created the selection`;
        case 'sent': return `${who} sent it to the client portal`;
        case 'edited': return `${who} edited it`;
        case 'withdrawn': return `${who} took it back to drafts`;
        case 'reopened': return `${who} asked the client to choose again`;
        case 'chosen': return e.note ? `${who} chose ${e.note}` : `${who} chose an option`;
        case 'approved': return `${who} approved the choice`;
        case 'changes_requested': return `${who} asked for changes`;
        case 'ordered': return `${who} marked it ordered`;
        case 'order_cancelled': return `${who} cancelled the order`;
        case 'closed': return `${who} closed it`;
        case 'draft': return `${who} moved it back to drafts`;
        default: return `${who}: ${e.action}`;
    }
};

// ------------------------------------------------------------------------------------------------ templates
const opt = (name: string, description: string, unit: string): SelectionOptionInput => ({ name, description, unit, qty: 1, unitPrice: 0 });

export const SELECTION_TEMPLATES: readonly SelectionTemplate[] = [
    {
        id: 'tile', label: 'Tile',
        draft: {
            title: 'Choose your tile', category: 'tile',
            body: 'Please choose the tile you like best. Prices include the quantity for the area shown.',
            options: [opt('Option A', 'Size, finish and colour', 'sq ft'), opt('Option B', 'Size, finish and colour', 'sq ft')],
        },
    },
    {
        id: 'paint', label: 'Paint colour',
        draft: {
            title: 'Choose your paint colour', category: 'paint',
            body: 'Please choose a colour. The finish (matte, eggshell, satin) is listed with each option.',
            options: [opt('Colour 1', 'Brand, colour name / code, finish', 'gal'), opt('Colour 2', 'Brand, colour name / code, finish', 'gal')],
        },
    },
    {
        id: 'flooring', label: 'Flooring',
        draft: {
            title: 'Choose your flooring', category: 'flooring',
            body: 'Please choose the flooring. Prices include the quantity for the rooms listed.',
            options: [opt('Option A', 'Material, plank size, colour', 'sq ft'), opt('Option B', 'Material, plank size, colour', 'sq ft')],
        },
    },
    {
        id: 'fixtures', label: 'Fixtures',
        draft: {
            title: 'Choose your fixtures', category: 'fixtures',
            body: 'Please choose the fixtures (taps, shower set, lights...). Finish and model are listed with each option.',
            options: [opt('Option A', 'Model and finish', 'each'), opt('Option B', 'Model and finish', 'each')],
        },
    },
    {
        id: 'appliances', label: 'Appliances',
        draft: {
            title: 'Choose your appliances', category: 'appliances',
            body: 'Please choose the appliance. The model and size are listed with each option.',
            options: [opt('Option A', 'Brand, model, size', 'each'), opt('Option B', 'Brand, model, size', 'each')],
        },
    },
    {
        id: 'countertops', label: 'Countertops',
        draft: {
            title: 'Choose your countertop', category: 'countertops',
            body: 'Please choose the countertop material and colour. Prices include the measured area.',
            options: [opt('Option A', 'Material, colour, edge profile', 'sq ft'), opt('Option B', 'Material, colour, edge profile', 'sq ft')],
        },
    },
];

export const draftFromTemplate = (id: string, overrides: SelectionPatch = {}): SelectionDraft => {
    const t = SELECTION_TEMPLATES.find(x => x.id === id);
    const base: SelectionDraft = t ? t.draft : { title: '' };
    return {
        title: overrides.title ?? base.title,
        category: overrides.category !== undefined ? overrides.category : (base.category ?? null),
        room: overrides.room !== undefined ? overrides.room : (base.room ?? null),
        body: overrides.body !== undefined ? overrides.body : (base.body ?? null),
        dueDate: overrides.dueDate !== undefined ? overrides.dueDate : (base.dueDate ?? null),
        allowance: overrides.allowance !== undefined ? overrides.allowance : (base.allowance ?? null),
        options: (overrides.options ?? base.options ?? []).map(o => ({ ...o, id: o.id ?? makeOptionId() })),
    };
};

// ------------------------------------------------------------------------------------------------ validation
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OPTION_ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanLine = (s: unknown, max: number): string => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const cleanBlock = (s: unknown, max: number): string | null => {
    const t = String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, max);
    return t || null;
};

export const makeOptionId = (): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(12);
    const c = globalThis.crypto;
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return `o_${Array.from(bytes, b => alphabet[b % alphabet.length]).join('')}`;
};

/** A money amount from a number or text ("1,234.50", "$ 12"); null when empty / not a number / negative / too big. */
export const parseMoney = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s$€£,]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > SELECTION_LIMITS.maxPrice) return null;
    return roundMoney(n);
};

/** A quantity (> 0, up to 1,000,000, 3 decimals); null when invalid. */
export const parseQty = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s,]/g, ''));
    if (!Number.isFinite(n) || n <= 0 || n > SELECTION_LIMITS.maxQty) return null;
    return Math.round(n * 1000) / 1000;
};

/** https links only (the database refuses http); adds https:// to a bare "example.com/x". */
export const validateHttpsLink = (input: string): { ok: true; url: string; error: null } | { ok: false; url: null; error: string } => {
    let s = String(input ?? '').trim();
    if (!s) return { ok: false, url: null, error: 'Paste a link.' };
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
    if (!/^https:\/\//i.test(s)) return { ok: false, url: null, error: 'Links must start with https://' };
    if (/\s/.test(s)) return { ok: false, url: null, error: 'Links cannot contain spaces.' };
    if (s.length > SELECTION_LIMITS.url) return { ok: false, url: null, error: 'This link is too long.' };
    try {
        const u = new URL(s);
        if (!u.hostname || !u.hostname.includes('.')) return { ok: false, url: null, error: 'Check the link.' };
    } catch {
        return { ok: false, url: null, error: 'Check the link.' };
    }
    return { ok: true, url: s, error: null };
};

const IMAGE_PATH_RE = /^[0-9a-f-]{36}\/selections\/[0-9a-f-]{36}\/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$/;
const PORTAL_PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$/;

/**
 * Valid options (max 6, ids kept or made, names required, https links, prices 0..99,999,999, quantity > 0).
 * Throws a readable Error on the first problem. Empty rows (no name, no price, no link, no image) are dropped.
 */
export const normalizeOptions = (list: readonly SelectionOptionInput[] | null | undefined): SelectionOption[] => {
    const out: SelectionOption[] = [];
    for (const o of list || []) {
        if (!o) continue;
        const name = cleanLine(o.name, SELECTION_LIMITS.optionName);
        const blank = !name && !o.url && !o.imagePath && (o.unitPrice === undefined || o.unitPrice === null || o.unitPrice === '' || Number(o.unitPrice) === 0);
        if (blank) continue;
        if (!name) throw new Error('Give every option a name.');
        let id = String(o.id ?? '').trim();
        if (!id) id = makeOptionId();
        if (!OPTION_ID_RE.test(id)) throw new Error('Invalid option id.');
        if (out.some(x => x.id === id)) throw new Error('Two options have the same id.');
        let url: string | null = null;
        if (o.url && String(o.url).trim()) {
            const v = validateHttpsLink(String(o.url));
            if (!v.ok) throw new Error(`${name}: ${v.error}`);
            url = v.url;
        }
        const qtyRaw = o.qty === undefined || o.qty === null || o.qty === '' ? 1 : parseQty(o.qty);
        if (qtyRaw === null) throw new Error(`Check the quantity of "${name}".`);
        const priceRaw = o.unitPrice === undefined || o.unitPrice === null || o.unitPrice === '' ? 0 : parseMoney(o.unitPrice);
        if (priceRaw === null) throw new Error(`Check the price of "${name}".`);
        const costEmpty = o.unitCost === undefined || o.unitCost === null || o.unitCost === '';
        const cost = costEmpty ? null : parseMoney(o.unitCost);
        if (!costEmpty && cost === null) throw new Error(`Check the cost of "${name}".`);
        const imagePath = o.imagePath && IMAGE_PATH_RE.test(o.imagePath) ? o.imagePath : null;
        if (o.imagePath && !imagePath) throw new Error('Invalid image.');
        const portalPath = imagePath && o.portalPath && PORTAL_PATH_RE.test(o.portalPath) ? o.portalPath : null;
        out.push({
            id,
            name,
            description: cleanBlock(o.description, SELECTION_LIMITS.optionDescription),
            imagePath,
            portalPath,
            url,
            sku: cleanLine(o.sku, SELECTION_LIMITS.sku) || null,
            supplierId: o.supplierId && UUID_RE.test(o.supplierId) ? o.supplierId.toLowerCase() : null,
            unit: cleanLine(o.unit, SELECTION_LIMITS.unit) || null,
            qty: qtyRaw,
            unitPrice: priceRaw,
            unitCost: cost,
        });
    }
    if (out.length > SELECTION_LIMITS.options) throw new Error(`A selection has up to ${SELECTION_LIMITS.options} options.`);
    return out;
};

/** A readable problem, or null. `sending`: at least one option is needed. */
export const validateDraft = (d: Partial<SelectionDraft>, opts: { sending?: boolean } = {}): string | null => {
    if (!cleanLine(d.title, SELECTION_LIMITS.title)) return 'Write a short title.';
    if (d.body && String(d.body).length > SELECTION_LIMITS.body) return `Keep the message under ${SELECTION_LIMITS.body} characters.`;
    if (d.dueDate && !DATE_RE.test(d.dueDate)) return 'Check the due date.';
    if (d.allowance !== undefined && d.allowance !== null && d.allowance !== '' && parseMoney(d.allowance) === null) return 'Check the allowance.';
    let options: SelectionOption[];
    try { options = normalizeOptions(d.options); } catch (e) { return e instanceof Error ? e.message : 'Check the options.'; }
    if (opts.sending && options.length === 0) return 'Add at least one option before you send it.';
    return null;
};

// ------------------------------------------------------------------------------------------------ money
/**
 * One option's money. total = unitPrice × qty (client price); cost = unitCost × qty (null when no cost);
 * difference = total − allowance: > 0 an upgrade (the client pays more), < 0 a credit, 0 included, null without an
 * allowance.
 */
export const optionPricing = (o: Pick<SelectionOption, 'unitPrice' | 'qty' | 'unitCost'>, allowance: number | null | undefined): OptionPricing => {
    const qty = Number(o.qty) > 0 ? Number(o.qty) : 1;
    const total = roundMoney((Number(o.unitPrice) || 0) * qty);
    const cost = o.unitCost === null || o.unitCost === undefined ? null : roundMoney(Number(o.unitCost) * qty);
    if (allowance === null || allowance === undefined || !Number.isFinite(Number(allowance))) return { total, cost, difference: null, kind: 'none' };
    const difference = roundMoney(total - Number(allowance));
    return { total, cost, difference, kind: difference > 0 ? 'upgrade' : difference < 0 ? 'credit' : 'included' };
};

export const chosenOption = (s: Pick<JobSelection, 'options' | 'chosenOptionId'>): SelectionOption | null =>
    (s.chosenOptionId && s.options.find(o => o.id === s.chosenOptionId)) || null;

export const chosenPricing = (s: Pick<JobSelection, 'options' | 'chosenOptionId' | 'allowance'>): OptionPricing | null => {
    const o = chosenOption(s);
    return o ? optionPricing(o, s.allowance) : null;
};

// ------------------------------------------------------------------------------------------------ images
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type OptionImageMime = typeof IMAGE_MIMES[number];

export const imageMimeFor = (fileName: string, type?: string | null): OptionImageMime | null => {
    const t = String(type || '').toLowerCase();
    if ((IMAGE_MIMES as readonly string[]).includes(t)) return t as OptionImageMime;
    if (t === 'image/jpg') return 'image/jpeg';
    const ext = sanitizeFileName(fileName).ext;
    return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : null;
};

/** A readable problem with an option / board image, or null (jpg, png, webp up to 5 MB: the portal can show it). */
export const validateOptionImage = (f: { name: string; size: number; type?: string | null }): string | null => {
    if (!f || !(f.size > 0)) return 'This image is empty.';
    if (!imageMimeFor(f.name, f.type)) return 'Add a JPG, PNG or WebP image.';
    if (f.size > SELECTION_LIMITS.maxImageBytes) return 'Images can be up to 5 MB.';
    return null;
};

const randomPart = (len = 12): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(len);
    const c = globalThis.crypto;
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
};

/** Private image path (matches guard_job_selection / guard_job_board): '<user>/<folder>/<job>/<rand>-<base>.<ext>'. */
export const privateImagePath = (folder: 'selections' | 'boards', userId: string, jobId: string, fileName: string, mime: OptionImageMime, random = randomPart()): string => {
    const { base } = sanitizeFileName(fileName);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const r = random.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32).padEnd(8, '0');
    return `${userId}/${folder}/${jobId}/${r}-${base}.${ext}`;
};

export const optionImageStoragePath = (userId: string, jobId: string, fileName: string, mime: OptionImageMime, random?: string): string =>
    privateImagePath('selections', userId, jobId, fileName, mime, random);

/** Public portal copy of an image (portal-photos bucket, same shape as D3's job file copies). */
export const portalImagePath = (userId: string, random: string, mime: OptionImageMime): string => portalFilePath(userId, random, mime);

/** The mime of a stored private image from its extension. */
export const mimeOfPath = (path: string): OptionImageMime =>
    /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg';

/** Private image paths in `before` that are no longer used in `after` (the app removes those files). */
export const droppedImagePaths = (before: readonly { imagePath: string | null }[], after: readonly { imagePath: string | null }[]): string[] => {
    const keep = new Set(after.map(o => o.imagePath).filter(Boolean));
    return [...new Set(before.map(o => o.imagePath).filter((p): p is string => !!p && !keep.has(p)))];
};

// ------------------------------------------------------------------------------------------------ sorting
const RANK: Record<SelectionStatus, number> = { sent: 0, chosen: 1, changes_requested: 2, draft: 3, approved: 4, ordered: 5, closed: 6 };

export const sortSelections = <T extends Pick<JobSelection, 'status' | 'dueDate' | 'createdAt'>>(list: readonly T[]): T[] =>
    [...list].sort((a, b) =>
        RANK[a.status] - RANK[b.status]
        || (a.status === 'sent' ? (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') : 0)
        || String(b.createdAt).localeCompare(String(a.createdAt)));

// ------------------------------------------------------------------------------------------------ rows
export const SELECTION_COLUMNS =
    'id, user_id, job_id, title, category, room, body, due_date, allowance, options, status, chosen_option_id, client_comment, chosen_by, chosen_at, history, po_document_id, sent_at, approved_at, ordered_at, closed_at, created_at, updated_at';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

export const parseOptions = (json: unknown): SelectionOption[] => {
    if (!Array.isArray(json)) return [];
    return json
        .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && typeof (o as Record<string, unknown>).id === 'string')
        .map(o => ({
            id: String(o.id),
            name: String(o.name ?? ''),
            description: str(o.description),
            imagePath: str(o.image_path),
            portalPath: str(o.portal_path),
            url: str(o.url),
            sku: str(o.sku),
            supplierId: str(o.supplier_id),
            unit: str(o.unit),
            qty: num(o.qty) ?? 1,
            unitPrice: num(o.unit_price) ?? 0,
            unitCost: num(o.unit_cost),
        }));
};

export const parseHistory = (json: unknown): SelectionHistoryEntry[] => {
    if (!Array.isArray(json)) return [];
    return json
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
        .map(e => ({ at: String(e.at ?? ''), by: e.by === 'client' ? 'client' : 'owner', action: String(e.action ?? ''), note: str(e.note) }));
};

export const mapSelectionRow = (r: Record<string, unknown>): JobSelection => ({
    id: String(r.id),
    userId: String(r.user_id ?? ''),
    jobId: String(r.job_id ?? ''),
    title: String(r.title ?? ''),
    category: str(r.category),
    room: str(r.room),
    body: str(r.body),
    dueDate: str(r.due_date),
    allowance: num(r.allowance),
    options: parseOptions(r.options),
    status: (SELECTION_STATUSES as readonly string[]).includes(String(r.status)) ? (r.status as SelectionStatus) : 'draft',
    chosenOptionId: str(r.chosen_option_id),
    clientComment: str(r.client_comment),
    chosenBy: str(r.chosen_by),
    chosenAt: str(r.chosen_at),
    history: parseHistory(r.history),
    poDocumentId: str(r.po_document_id),
    sentAt: str(r.sent_at),
    approvedAt: str(r.approved_at),
    orderedAt: str(r.ordered_at),
    closedAt: str(r.closed_at),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? r.created_at ?? ''),
});

/** Options as the database stores them (snake_case). */
export const optionsToJson = (list: readonly SelectionOption[]): Record<string, unknown>[] =>
    list.map(o => ({
        id: o.id, name: o.name, description: o.description, image_path: o.imagePath, portal_path: o.portalPath, url: o.url,
        sku: o.sku, supplier_id: o.supplierId, unit: o.unit, qty: o.qty, unit_price: o.unitPrice, unit_cost: o.unitCost,
    }));

const allowanceValue = (v: SelectionDraft['allowance']): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseMoney(v);
    if (n === null) throw new Error('Check the allowance.');
    return n;
};

/** Insert row; `send` = save and send at once. Throws a readable Error when the draft is invalid. */
export const selectionInsertRow = (draft: SelectionDraft, userId: string, jobId: string, send = false): Record<string, unknown> => {
    const problem = validateDraft(draft, { sending: send });
    if (problem) throw new Error(problem);
    return {
        user_id: userId,
        job_id: jobId,
        title: cleanLine(draft.title, SELECTION_LIMITS.title),
        category: cleanLine(draft.category, SELECTION_LIMITS.category) || null,
        room: cleanLine(draft.room, SELECTION_LIMITS.room) || null,
        body: cleanBlock(draft.body, SELECTION_LIMITS.body),
        due_date: draft.dueDate || null,
        allowance: allowanceValue(draft.allowance),
        options: optionsToJson(normalizeOptions(draft.options)),
        status: send ? 'sent' : 'draft',
    };
};

/** Update row (only the fields given). Throws a readable Error. */
export const selectionPatchRow = (patch: SelectionPatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) {
        const t = cleanLine(patch.title, SELECTION_LIMITS.title);
        if (!t) throw new Error('Write a short title.');
        row.title = t;
    }
    if (patch.category !== undefined) row.category = cleanLine(patch.category, SELECTION_LIMITS.category) || null;
    if (patch.room !== undefined) row.room = cleanLine(patch.room, SELECTION_LIMITS.room) || null;
    if (patch.body !== undefined) row.body = cleanBlock(patch.body, SELECTION_LIMITS.body);
    if (patch.dueDate !== undefined) {
        if (patch.dueDate && !DATE_RE.test(patch.dueDate)) throw new Error('Check the due date.');
        row.due_date = patch.dueDate || null;
    }
    if (patch.allowance !== undefined) row.allowance = allowanceValue(patch.allowance);
    if (patch.options !== undefined) row.options = optionsToJson(normalizeOptions(patch.options));
    return row;
};
