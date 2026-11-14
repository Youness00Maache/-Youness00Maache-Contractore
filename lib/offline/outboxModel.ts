/**
 * Offline outbox: the rules, with no IndexedDB, Supabase or React (safe to unit test under Node:
 * scripts/offline-drafts-check.ts).
 *
 * What it is (competitor gap #14 "Offline create and edit"):
 *  - Field documents (Daily Job Report, Time Sheet, Material Log, Expense Log, Note, Receipt) can be created AND edited
 *    without a connection; Estimates and Invoices can be DRAFTED (new ones only).
 *  - A save made offline goes to a per-user outbox on this device (one item per document: later saves of the same
 *    document replace its data but keep its place in the queue). Lists show it at once with a "Waiting to sync" chip.
 *  - Sync pushes the items in the order they were first saved, through the app's normal document save. Numbers of
 *    documents created offline are checked against the account and changed to the next free number when another
 *    device used them meanwhile. Edits are last-write-wins; when the account copy changed since the edit started, the
 *    replaced version is kept in the outbox history for 7 days and a "Changed on another device" notice is shown.
 */
import { FormType } from '../../types.ts';
import { DOC_NUMBER_CONFIG, nextDocumentNumber } from '../../components/forms/formUtils.ts';

// ---------------------------------------------------------------------------------------------------------------------
// Which documents work offline
// ---------------------------------------------------------------------------------------------------------------------

/** Field documents: created and edited offline. */
export const OFFLINE_FIELD_TYPES: readonly FormType[] = [
    FormType.DailyJobReport, FormType.TimeSheet, FormType.MaterialLog, FormType.ExpenseLog, FormType.Note, FormType.Receipt,
];
/** Money documents: drafted offline (new ones only); sending waits for a connection. */
export const OFFLINE_DRAFT_TYPES: readonly FormType[] = [FormType.Estimate, FormType.Invoice];
/** Every type the "New document" picker offers offline. */
export const OFFLINE_CREATE_TYPES: readonly FormType[] = [...OFFLINE_FIELD_TYPES, ...OFFLINE_DRAFT_TYPES];

export const canCreateOffline = (type: string): boolean => (OFFLINE_CREATE_TYPES as readonly string[]).includes(type);

/** Today's message for documents that still need a connection to save (kept word for word). */
export const OFFLINE_SAVE_BLOCKED = "You're offline. Your document is still open; save again when you're back online.";

/**
 * May this save go to the outbox? `kind` is 'create' for a document the account doesn't have yet (or one only in the
 * outbox), 'edit' for a saved one.
 */
export const offlineSavePolicy = (type: string, kind: OutboxKind): { ok: boolean; reason: string } => {
    if ((OFFLINE_FIELD_TYPES as readonly string[]).includes(type)) return { ok: true, reason: '' };
    if ((OFFLINE_DRAFT_TYPES as readonly string[]).includes(type)) {
        if (kind === 'create') return { ok: true, reason: '' };
        const noun = type === FormType.Invoice ? 'invoice' : 'estimate';
        return {
            ok: false,
            reason: `You're offline. A saved ${noun} can only be changed online (the client may have signed or paid it meanwhile). Your changes are still here; save again when you're back online.`,
        };
    }
    return { ok: false, reason: OFFLINE_SAVE_BLOCKED };
};

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

export type OutboxKind = 'create' | 'edit';
/**
 * What an outbox item saves: a document (default; items saved before jobs/clients were added have no `entity`), a job
 * (created offline, or its status changed offline) or a client (created / edited offline). Jobs and clients get their
 * real id (a UUID) on this device, so a document created offline inside a job created offline keeps pointing at it;
 * sync sends clients first, then jobs, then documents, and remaps any id the account changes.
 */
export type OutboxEntity = 'document' | 'job' | 'client' | 'inventory' | 'price_item' | 'stock_move' | 'job_photo' | 'profile' | 'reminder_settings' | 'punch_item';
/**
 * pending: waiting to sync (never tried, or the connection dropped);
 * failed:  the account refused it for a reason a later retry may fix (shown with the reason);
 * blocked: needs the user (plan limit, not enough stock, job deleted). Only "Sync now" / a new save retries it.
 */
export type OutboxStatus = 'pending' | 'failed' | 'blocked';
export type OutboxErrorKind = 'plan_limit' | 'stock' | 'job_missing' | 'error';

/** Provisional number of a document created offline (the final one is confirmed on sync). */
export interface OutboxNumber {
    field: string;
    prefix: string;
    /** the number is the one the app suggested (not typed by the user) */
    auto: boolean;
}

/** The account version an offline edit started from (conflict check on sync). */
export interface OutboxBase {
    /** contentHash() of the document data the edit started from */
    hash: string;
    /** the account's updated_at of that version, when known */
    updatedAt?: string | null;
    /** row patches (settings): the columns `hash` covers (the account copy is compared on these only) */
    keys?: string[];
}

export interface OutboxItem {
    /** `${userId}:${docId}`: one item per document and user */
    id: string;
    /** absent = 'document' (docId is then the job / client id, type 'Job' / 'Client', data the table row) */
    entity?: OutboxEntity;
    userId: string;
    docId: string;
    jobId: string;
    /** FormType */
    type: string;
    kind: OutboxKind;
    /** the full document data to save */
    data: Record<string, unknown>;
    /** documents.client_id to save with it (null = none) */
    clientId: string | null;
    /** queue order: set by the FIRST offline save, kept by later saves of the same document */
    seq: number;
    /** first offline save (ISO); the document's date in lists until it syncs */
    createdAt: string;
    /** last offline save (ISO) */
    updatedAt: string;
    base: OutboxBase | null;
    number: OutboxNumber | null;
    /** offline photos already uploaded by an earlier attempt: photo hash → public URL */
    photos: Record<string, string>;
    status: OutboxStatus;
    error: { kind: OutboxErrorKind; message: string; at: string } | null;
    attempts: number;
}

export type HistoryReason = 'conflict' | 'discarded' | 'deleted_elsewhere' | 'renumbered';

/** Outbox history: replaced / discarded versions (kept 7 days) and sync notices. */
export interface OutboxHistoryEntry {
    id: string;
    userId: string;
    docId: string;
    jobId: string;
    type: string;
    title: string;
    reason: HistoryReason;
    message: string;
    /** the version that can be restored (the replaced account copy, or the discarded offline version) */
    data: Record<string, unknown> | null;
    /** discarded items: the whole item, so "Restore" queues it again exactly */
    item?: OutboxItem | null;
    /** what the version belongs to (absent = a document); "Restore" queues it as this */
    entity?: OutboxEntity;
    savedAt: string;
    expiresAt: string;
    /** notice dismissed */
    seen: boolean;
}

/** Registry of photos added while offline (their data URLs live inside the document data). */
export interface OfflinePhoto {
    /** `${userId}:${hash}` */
    id: string;
    userId: string;
    hash: string;
    createdAt: string;
}

export interface QueueInput {
    entity?: OutboxEntity;
    userId: string;
    docId: string;
    jobId: string;
    type: string;
    kind: OutboxKind;
    data: Record<string, unknown>;
    clientId?: string | null;
    base?: OutboxBase | null;
    number?: OutboxNumber | null;
}

export const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PHOTO_REGISTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const outboxItemId = (userId: string, docId: string): string => `${userId}:${docId}`;

export const entityOf = (item: Pick<OutboxItem, 'entity'> | null | undefined): OutboxEntity => item?.entity || 'document';

/** Display type of job / client items. */
export const ENTITY_TYPE: Record<Exclude<OutboxEntity, 'document'>, string> = {
    job: 'Job', client: 'Client', inventory: 'Inventory item', price_item: 'Price book item', stock_move: 'Stock change',
    job_photo: 'Job photo', profile: 'Settings', reminder_settings: 'Reminder settings', punch_item: 'Punch item',
};

// ---------------------------------------------------------------------------------------------------------------------
// Hashing (content comparison; not security)
// ---------------------------------------------------------------------------------------------------------------------

/** JSON with sorted keys and no `undefined`: the same data always gives the same text (jsonb reorders keys). */
export const stableStringify = (value: unknown): string => {
    const walk = (v: unknown): unknown => {
        if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? null : v;
        if (Array.isArray(v)) return v.map(x => (x === undefined ? null : walk(x)));
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v as Record<string, unknown>).sort()) {
            const x = (v as Record<string, unknown>)[k];
            if (x !== undefined && typeof x !== 'function') out[k] = walk(x);
        }
        return out;
    };
    return JSON.stringify(walk(value)) ?? 'null';
};

/** FNV-1a (32 bit) + length, as text. */
export const hashString = (text: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return `${text.length.toString(36)}-${(h >>> 0).toString(16).padStart(8, '0')}`;
};

/**
 * Keys that clients, the portal or the database write (signatures, declines, "I've paid", viewed flags, stock
 * markers). An offline edit never removes them, and they don't count as "changed on another device".
 */
export const SERVER_OWNED_KEYS = [
    'clientSignatureUrl', 'clientSignedAt', 'clientSignedBy', 'clientSignerName', 'clientDeclinedAt', 'clientDeclineReason',
    'viewedByProvider', 'paymentReportedAt', 'paymentReportNote', 'paymentReportAmount', 'approvedAt', 'inventoryDeductedAt',
    'reviewRequestedAt', 'clientOptionChoice',
] as const;
const IGNORED_FOR_HASH = new Set<string>([...SERVER_OWNED_KEYS, '__lightweight']);

/** Hash of what the user wrote in a document (server-owned flags left out). */
export const contentHash = (data: Record<string, unknown> | null | undefined): string => {
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data || {})) if (!IGNORED_FOR_HASH.has(k)) rest[k] = v;
    return hashString(stableStringify(rest));
};

// ---------------------------------------------------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The outbox item after an offline save. A document already in the outbox keeps its place (seq), its kind (a
 * document created offline stays a "create"), the version its edit started from and its number rule; its data is
 * replaced and it is pending again (a new save is also how the user fixes a refused item).
 */
export const queueSave = (existing: OutboxItem | null | undefined, input: QueueInput, nowIso: string, seq: number): OutboxItem => {
    if (existing && existing.userId === input.userId && existing.docId === input.docId) {
        return {
            ...existing,
            jobId: input.jobId || existing.jobId,
            type: input.type || existing.type,
            // a job / client save is a patch of its row (e.g. a status change of a job created offline)
            data: entityOf(existing) === 'document' ? input.data : { ...existing.data, ...input.data },
            clientId: input.clientId !== undefined ? input.clientId ?? null : existing.clientId,
            updatedAt: nowIso,
            base: existing.base ?? (existing.kind === 'edit' ? input.base ?? null : null),
            number: existing.number ?? input.number ?? null,
            status: 'pending',
            error: null,
            attempts: 0,
        };
    }
    return {
        id: outboxItemId(input.userId, input.docId),
        ...(input.entity && input.entity !== 'document' ? { entity: input.entity } : {}),
        userId: input.userId,
        docId: input.docId,
        jobId: input.jobId,
        type: input.type,
        kind: input.kind,
        data: input.data,
        clientId: input.clientId ?? null,
        seq,
        createdAt: nowIso,
        updatedAt: nowIso,
        base: input.kind === 'edit' ? input.base ?? null : null,
        number: input.kind === 'create' ? input.number ?? null : null,
        photos: {},
        status: 'pending',
        error: null,
        attempts: 0,
    };
};

/** Next queue position: never smaller than an existing one, so the order survives clock changes. */
export const nextSeq = (items: readonly OutboxItem[], nowMs: number): number =>
    Math.max(nowMs, ...items.map(i => (Number.isFinite(i.seq) ? i.seq + 1 : 0)));

const ENTITY_RANK: Record<OutboxEntity, number> = { profile: 0, reminder_settings: 0, client: 0, job: 1, inventory: 2, price_item: 2, punch_item: 2, stock_move: 3, document: 4, job_photo: 5 };

/**
 * Sync order: settings and clients, jobs, inventory / price-book / punch-list items, stock changes, documents, then job
 * photos (what they point at exists first; photos are the big uploads, so everything small reaches the account before
 * them); in each, first saved first.
 */
export const orderForSync = <T extends Pick<OutboxItem, 'seq' | 'createdAt' | 'id'> & { entity?: OutboxEntity }>(items: readonly T[]): T[] =>
    [...items].sort((a, b) => (ENTITY_RANK[entityOf(a)] - ENTITY_RANK[entityOf(b)]) || (a.seq - b.seq) || String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));

/**
 * An item with the ids the account changed (offline id → account id) put in: its job, its client and the client_id
 * of a job row. The same item when nothing changes.
 */
export const remapItem = (item: OutboxItem, map: ReadonlyMap<string, string>): OutboxItem => {
    if (!map.size) return item;
    const to = (id: string | null | undefined) => (id && map.has(id) ? map.get(id)! : id);
    const jobId = to(item.jobId) ?? '';
    const clientId = to(item.clientId) ?? null;
    const rowClient = item.data?.client_id as string | null | undefined;
    const nextRowClient = to(rowClient);
    const rowJob = item.data?.job_id as string | null | undefined;
    const nextRowJob = to(rowJob);
    const rowSource = item.data?.source_photo_id as string | null | undefined;
    const nextRowSource = to(rowSource);
    if (jobId === item.jobId && clientId === item.clientId && nextRowClient === rowClient && nextRowJob === rowJob && nextRowSource === rowSource) return item;
    const data = { ...item.data };
    if (nextRowClient !== rowClient) data.client_id = nextRowClient;
    if (nextRowJob !== rowJob) data.job_id = nextRowJob;
    if (nextRowSource !== rowSource) data.source_photo_id = nextRowSource;
    return { ...item, jobId, clientId, data };
};

/** Items that belong to this user (a shared device never mixes accounts). */
export const itemsOfUser = <T extends { userId: string }>(items: readonly T[], userId: string | null | undefined): T[] =>
    (userId ? items.filter(i => i.userId === userId) : []);

/** Automatic syncs (back online, app start) skip items that need the user; "Sync now" retries everything. */
export const shouldSync = (item: OutboxItem, includeBlocked: boolean): boolean => includeBlocked || item.status !== 'blocked';

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

const messageOf = (error: unknown): string => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    const e = error as { message?: unknown; error_description?: unknown; details?: unknown };
    return String(e.message || e.error_description || e.details || '');
};

/** True when the request never reached the account (keep the item pending and stop this run). */
export const isNetworkError = (error: unknown): boolean => {
    const msg = messageOf(error);
    const status = (error as { status?: unknown } | null)?.status;
    return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|you'?re offline|appears to be offline|this needs a connection|failed to send a request|timed? ?out/i.test(msg)
        || (status === 0 && !msg);
};

/** What a refused save means for the outbox item. */
export const classifySyncError = (error: unknown): { kind: OutboxErrorKind | 'network'; message: string } => {
    const msg = messageOf(error);
    if (isNetworkError(error)) return { kind: 'network', message: 'No connection.' };
    if (/PLAN_LIMIT/i.test(msg)) {
        const rest = msg.replace(/^.*?PLAN_LIMIT:?\s*/i, '').trim();
        return { kind: 'plan_limit', message: rest && !/^[a-z_]+$/i.test(rest) ? rest : 'You have reached a limit of the Free plan.' };
    }
    if (/insufficient stock|not enough stock/i.test(msg)) {
        return { kind: 'stock', message: 'Not enough stock for one or more inventory items. Open it, reduce the quantity and save again.' };
    }
    const code = String((error as { code?: unknown } | null)?.code || '');
    if (/deleted on another device/i.test(msg)) return { kind: 'job_missing', message: msg };
    if (code === '23503' || /foreign key/i.test(msg)) {
        return { kind: 'job_missing', message: 'Its job was deleted on another device. Copy what you need, then discard it.' };
    }
    return { kind: 'error', message: msg.length > 220 ? `${msg.slice(0, 217)}...` : (msg || 'The account refused this document.') };
};

/** The outbox status an error kind leaves the item in. */
export const statusForError = (kind: OutboxErrorKind): OutboxStatus => (kind === 'error' ? 'failed' : 'blocked');

// ---------------------------------------------------------------------------------------------------------------------
// Numbers (documents created offline)
// ---------------------------------------------------------------------------------------------------------------------

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Number rule for a new document of this type (null: the type has no number). */
export const numberRuleFor = (type: string, value: unknown, suggested: string | null): OutboxNumber | null => {
    const cfg = DOC_NUMBER_CONFIG[type as FormType];
    if (!cfg) return null;
    const v = String(value ?? '').trim();
    return { field: cfg.field, prefix: cfg.prefix, auto: !v || (suggested !== null && v.toUpperCase() === suggested.toUpperCase()) };
};

/**
 * The number a document created offline is saved with. `taken` = numbers of this type on the account (other
 * documents) plus the ones given earlier in this sync, upper-cased; the result is added to it.
 * - kept when nobody else uses it (or the user typed their own number: like online, custom numbers are not changed);
 * - an empty number, or an app-suggested one that another device used meanwhile, becomes the next free number.
 */
export const resolveOfflineNumber = (
    rule: OutboxNumber | null,
    current: unknown,
    taken: Set<string>,
    date: Date = new Date(),
): { value: string | null; changedFrom: string | null } => {
    if (!rule) return { value: null, changedFrom: null };
    const value = String(current ?? '').trim();
    const series = new RegExp(`^${escapeRegExp(rule.prefix)}-\\d{4}-\\d{2}-\\d+$`, 'i');
    const collides = Boolean(value) && taken.has(value.toUpperCase());
    if (value && (!collides || (!rule.auto && !series.test(value)))) {
        taken.add(value.toUpperCase());
        return { value, changedFrom: null };
    }
    const next = nextDocumentNumber(rule.prefix, Array.from(taken), date);
    taken.add(next.toUpperCase());
    return { value: next, changedFrom: value || null };
};

// ---------------------------------------------------------------------------------------------------------------------
// Conflicts (last write wins)
// ---------------------------------------------------------------------------------------------------------------------

export interface ServerCopy {
    data: Record<string, unknown>;
    updatedAt: string | null;
}

/**
 * Did the account copy change since the offline edit started?
 * - 'deleted': the document is gone from the account (deleted on another device);
 * - 'changed': what the user wrote differs from the version the edit started from;
 * - 'none': unchanged (an updated_at that isn't newer is enough; a newer one is confirmed by the content, so a
 *   signature or "viewed" flag set by the server alone is not a conflict).
 */
export const detectConflict = (base: OutboxBase | null | undefined, server: ServerCopy | null): 'none' | 'changed' | 'deleted' => {
    if (!server) return 'deleted';
    if (!base) return 'none';
    if (base.updatedAt && server.updatedAt) {
        const b = Date.parse(base.updatedAt);
        const s = Date.parse(server.updatedAt);
        if (Number.isFinite(b) && Number.isFinite(s) && s <= b) return 'none';
    }
    return contentHash(server.data) === base.hash ? 'none' : 'changed';
};

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/**
 * The columns `keys` of a table row, in a comparable form (settings: a value the account stores as null and one the
 * app shows as '' are the same; numbers and text compare by their text). contentHash() of it is an OutboxBase hash.
 */
export const rowSnapshot = (row: Record<string, unknown> | null | undefined, keys: readonly string[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const k of [...keys].sort()) {
        const v = row?.[k];
        out[k] = v === null || v === undefined ? '' : typeof v === 'object' ? stableStringify(v) : String(v).trim();
        if (out[k] === '{}' || out[k] === '[]') out[k] = '';
    }
    return out;
};

/** The offline version wins, but a signature / decline / payment report / flag already on the account is kept. */
export const mergeForUpload = (local: Record<string, unknown>, server: Record<string, unknown> | null | undefined): Record<string, unknown> => {
    if (!server) return local;
    let out = local;
    for (const key of SERVER_OWNED_KEYS) {
        if (hasValue(server[key]) && stableStringify(server[key]) !== stableStringify(local[key])) {
            if (out === local) out = { ...local };
            out[key] = server[key];
        }
    }
    return out;
};

// ---------------------------------------------------------------------------------------------------------------------
// Photos added offline
// ---------------------------------------------------------------------------------------------------------------------

const DATA_URL_RE = /data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/g;

/** Every image data URL inside a document (plain fields and rich-text HTML), in order, without duplicates. */
export const findImageDataUrls = (value: unknown): string[] => {
    const found = new Set<string>();
    const walk = (v: unknown) => {
        if (typeof v === 'string') {
            if (v.includes('data:image/')) for (const m of v.match(DATA_URL_RE) || []) found.add(m);
        } else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
    };
    walk(value);
    return Array.from(found);
};

export const photoHash = (dataUrl: string): string => hashString(dataUrl);

/** The photos of this document that were added offline (registry hashes): each is uploaded on sync. */
export const offlinePhotosIn = (data: unknown, registry: ReadonlySet<string>): Array<{ hash: string; dataUrl: string }> =>
    findImageDataUrls(data)
        .map(dataUrl => ({ hash: photoHash(dataUrl), dataUrl }))
        .filter(p => registry.has(p.hash));

/** Copy of the data with each data URL replaced by its uploaded URL (strings inside HTML too). */
export const replaceDataUrls = <T,>(value: T, map: ReadonlyMap<string, string>): T => {
    if (!map.size) return value;
    const walk = (v: unknown): unknown => {
        if (typeof v === 'string') {
            if (!v.includes('data:image/')) return v;
            let s = v;
            for (const [from, to] of map) if (to && s.includes(from)) s = s.split(from).join(to);
            return s;
        }
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === 'object') {
            const out: Record<string, unknown> = {};
            for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x);
            return out;
        }
        return v;
    };
    return walk(value) as T;
};

// ---------------------------------------------------------------------------------------------------------------------
// History, notices, logout
// ---------------------------------------------------------------------------------------------------------------------

const NUMBER_KEYS = ['invoiceNumber', 'estimateNumber', 'reportNumber', 'workOrderNumber', 'warrantyNumber', 'changeOrderNumber', 'poNumber', 'receiptNumber'];

/** Short label of a document for lists and notices. */
export const outboxTitle = (type: string, data: Record<string, unknown> | null | undefined): string => {
    const d = data || {};
    if (type === ENTITY_TYPE.profile) return 'Profile and business settings';
    if (type === ENTITY_TYPE.job_photo) {
        const stage = String(d.tag || '').trim();
        const caption = String(d.caption || '').trim();
        return [type, stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : '', caption].filter(Boolean).join(' · ');
    }
    const title = String(d.title || '').trim();
    if (title) return title;
    for (const k of NUMBER_KEYS) if (d[k]) return `${type} ${String(d[k])}`;
    const extra = String(d.vendor || d.workerName || d.name || '').trim();
    return extra ? `${type} · ${extra}` : type;
};

export const makeHistoryEntry = (
    args: { userId: string; docId: string; jobId: string; type: string; reason: HistoryReason; message: string; data: Record<string, unknown> | null; item?: OutboxItem | null; title?: string; entity?: OutboxEntity },
    now: Date,
): OutboxHistoryEntry => ({
    id: `${args.userId}:${args.docId}:${args.reason}:${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    userId: args.userId,
    docId: args.docId,
    jobId: args.jobId,
    type: args.type,
    title: args.title || outboxTitle(args.type, args.data || args.item?.data || null),
    reason: args.reason,
    message: args.message,
    data: args.data,
    item: args.item ?? null,
    ...(args.entity && args.entity !== 'document' ? { entity: args.entity } : {}),
    savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HISTORY_TTL_MS).toISOString(),
    // a discard is the user's own action: nothing to tell them about
    seen: args.reason === 'discarded',
});

export const isExpired = (entry: Pick<OutboxHistoryEntry, 'expiresAt'>, now: Date): boolean => {
    const t = Date.parse(entry.expiresAt);
    return Number.isFinite(t) && t <= now.getTime();
};

/** Notices still to show: conflicts, documents deleted elsewhere, changed numbers. */
export const unseenNotices = (entries: readonly OutboxHistoryEntry[]): OutboxHistoryEntry[] =>
    entries.filter(e => !e.seen && e.reason !== 'discarded').sort((a, b) => b.savedAt.localeCompare(a.savedAt));

/** Logout: warn first when this user has documents that aren't on the account yet. */
export const logoutGuard = (items: readonly OutboxItem[], userId: string | null | undefined): { warn: boolean; count: number } => {
    const count = itemsOfUser(items, userId).length;
    return { warn: count > 0, count };
};

// ---------------------------------------------------------------------------------------------------------------------
// Lists: outbox versions over the loaded documents
// ---------------------------------------------------------------------------------------------------------------------

export interface DocLike {
    id: string;
    jobId: string;
    type: string;
    createdAt: string;
    data: unknown;
    public_token?: string;
}

/**
 * The loaded documents with this user's outbox versions on top (full data; documents created offline are added).
 * Without outbox items the SAME array is returned (online behaviour unchanged). Newest first, like mergeDocuments.
 */
export const applyOutboxOverlay = <T extends DocLike>(forms: T[], items: readonly OutboxItem[], userId: string | null | undefined): T[] => {
    const mine = itemsOfUser(items, userId).filter(i => entityOf(i) === 'document');
    if (!mine.length) return forms;
    const byId = new Map(forms.map(f => [f.id, f]));
    for (const item of mine) {
        const prev = byId.get(item.docId);
        byId.set(item.docId, {
            ...(prev || {}),
            id: item.docId,
            jobId: item.jobId,
            type: item.type,
            createdAt: prev?.createdAt || item.createdAt,
            data: item.data,
            ...(prev?.public_token ? { public_token: prev.public_token } : {}),
        } as T);
    }
    return Array.from(byId.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
};

/** New documents waiting in the outbox, per job (they take a Free-plan slot when they sync). */
export const pendingCreatesByJob = (items: readonly OutboxItem[], userId: string | null | undefined): Map<string, number> => {
    const out = new Map<string, number>();
    for (const i of itemsOfUser(items, userId)) if (i.kind === 'create' && entityOf(i) === 'document') out.set(i.jobId, (out.get(i.jobId) || 0) + 1);
    return out;
};

/**
 * Jobs / clients with this user's outbox versions on top: ones created offline come first, offline edits are
 * merged in (`toItem(row, prev)` builds the screen's object from the table row). Without such items the SAME
 * array is returned (online behaviour unchanged).
 */
export const applyEntityOverlay = <T extends { id: string }>(
    list: T[], items: readonly OutboxItem[], userId: string | null | undefined, entity: Exclude<OutboxEntity, 'document'>,
    toItem: (row: Record<string, unknown>, prev: T | undefined) => T,
): T[] => {
    const mine = itemsOfUser(items, userId).filter(i => entityOf(i) === entity);
    if (!mine.length) return list;
    const byId = new Map(list.map(x => [x.id, x]));
    const added: T[] = [];
    for (const item of mine) {
        const prev = byId.get(item.docId);
        if (!prev && item.kind !== 'create') continue; // an edit of something not loaded here
        const next = toItem({ ...item.data, id: item.docId }, prev);
        if (prev) byId.set(item.docId, next); else added.push(next);
    }
    return [...added.reverse(), ...list.map(x => byId.get(x.id) || x)];
};

/** Jobs / clients created offline and not on the account yet (they take a Free-plan slot when they sync). */
export const pendingEntityCreates = (items: readonly OutboxItem[], userId: string | null | undefined, entity: Exclude<OutboxEntity, 'document'>): number =>
    itemsOfUser(items, userId).filter(i => entityOf(i) === entity && i.kind === 'create').length;

export type DocSyncTone = 'pending' | 'syncing' | 'error';

/** Chip for a document in the outbox. */
export const docSyncState = (item: OutboxItem | null | undefined, syncingDocId: string | null): { tone: DocSyncTone; label: string; reason: string } | null => {
    if (!item) return null;
    if (syncingDocId === item.docId) return { tone: 'syncing', label: 'Syncing…', reason: 'Saving it to your account now.' };
    if (item.status === 'pending') {
        return { tone: 'pending', label: 'Waiting to sync', reason: item.number ? 'Saved on this device. It syncs, and its number is confirmed, when you’re back online.' : 'Saved on this device. It syncs when you’re back online.' };
    }
    return { tone: 'error', label: 'Not synced', reason: item.error?.message || 'The account refused it.' };
};
