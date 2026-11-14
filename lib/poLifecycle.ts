/**
 * Purchase-order lifecycle (roadmap N2): Draft → Sent → Confirmed → Partially delivered → Delivered → Invoiced → Paid
 * (+ Cancelled), deliveries recorded per line, the supplier's invoice, and how a PO splits into ACTUAL cost
 * (delivered or invoiced) and COMMITTED cost (ordered, not delivered yet) for job costing.
 *
 * Pure (no React, no Supabase): lib/suppliers.ts plans the stock side of a delivery, lib/suppliersApi.ts writes it,
 * lib/costing.ts reads poCostShares(), components/suppliers/* is the UI. Tested by scripts/supplier-orders-check.ts and
 * scripts/costing-check.ts.
 *
 * NO database change. Everything lives in documents.data of the Purchase Order:
 *   status                       'Draft' | 'Sent' | 'Confirmed' | 'Partially delivered' | 'Delivered' | 'Invoiced' |
 *                                'Paid' | 'Cancelled'. Older POs keep what they have: 'Received' (= Delivered),
 *                                'Accepted' / 'Approved' (= Confirmed, set by the supplier's confirm link) and
 *                                'Rejected' / 'Declined' (the supplier can't fill it).
 *   deliveryDate                 the existing "Required by" date, also the expected delivery (late = flagged)
 *   supplierInvoiceNumber        the supplier's invoice # (text)
 *   supplierInvoiceAmount        its amount; when set, an Invoiced / Paid PO costs this (not the PO total)
 *   supplierInvoiceDate          YYYY-MM-DD
 *   paidDate                     YYYY-MM-DD, set when the PO becomes Paid
 *   internalSupplierInvoiceFile  SupplierInvoiceFile: the invoice PDF / photo in the PRIVATE bucket document-assets at
 *                                <user id>/purchase-orders/<document id>/<random>.<ext> (the bucket's owner-folder
 *                                policies, migration 20261112000300: first folder = auth.uid()); opened by signed URL
 *   internalDeliveries           DeliveriesRecord { v: 1, rev, list: PoDelivery[] }; `rev` changes on every write so a
 *                                delivery is claimed with compare-and-set (two devices can't both claim)
 *   internalStockReceipt         the older one-shot "Mark received" record (lib/suppliers.ts), still honoured: done =
 *                                every line delivered
 * Keys containing "internal" never reach client / supplier pages (public._client_safe_doc_data strips them).
 */
import { lineItemAmount, roundMoney, toNumber } from '../utils/money.ts';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const norm = (v: unknown): string => str(v).replace(/\s+/g, ' ').toLowerCase();
/** Quantities are numeric(14,3) in inventory. */
export const q3 = (n: number): number => Math.round(n * 1000) / 1000;
const isoOr = (v: unknown, fallback: string): string => {
    const t = Date.parse(str(v));
    return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
};
const ymd = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : '');

// =====================================================================================================================
// Statuses
// =====================================================================================================================
/** The status list of the form (the order of the lifecycle). */
export const PO_STATUSES = ['Draft', 'Sent', 'Confirmed', 'Partially delivered', 'Delivered', 'Invoiced', 'Paid', 'Cancelled'] as const;
export type PoStatus = typeof PO_STATUSES[number];

export type PoStatusKind = 'draft' | 'sent' | 'confirmed' | 'cant-fill' | 'partial' | 'delivered' | 'invoiced' | 'paid' | 'cancelled';

/** What a stored status means. 'Received' (older POs) = delivered; 'Accepted' / 'Approved' = confirmed. */
export const poStatusKind = (status: unknown): PoStatusKind => {
    switch (norm(status)) {
        case '': case 'draft': return 'draft';
        case 'confirmed': case 'accepted': case 'approved': return 'confirmed';
        case 'partially delivered': case 'partial': case 'partially received': return 'partial';
        case 'delivered': case 'received': return 'delivered';
        case 'invoiced': return 'invoiced';
        case 'paid': return 'paid';
        case 'cancelled': case 'canceled': case 'void': return 'cancelled';
        case 'rejected': case 'declined': return 'cant-fill';
        default: return 'sent';
    }
};

/** Goods are all here (or the supplier billed it): the whole order is an actual cost. */
export const FULLY_DELIVERED_KINDS: readonly PoStatusKind[] = ['delivered', 'invoiced', 'paid'];
/** Ordered and still expected: the undelivered rest is a committed cost. */
export const COMMITTED_KINDS: readonly PoStatusKind[] = ['sent', 'confirmed', 'partial'];

/**
 * Options of the Status select: the lifecycle list, plus the PO's own older status ('Received', 'Accepted', …) right
 * after its new equivalent, so an older order shows exactly what it had and keeps it when saved again.
 */
export const poStatusOptions = (current: unknown): string[] => {
    const list: string[] = [...PO_STATUSES];
    const cur = str(current);
    if (!cur || list.includes(cur)) return list;
    const kind = poStatusKind(cur);
    const anchor = kind === 'delivered' ? 'Delivered' : kind === 'confirmed' ? 'Confirmed' : kind === 'cant-fill' ? 'Confirmed' : kind === 'cancelled' ? 'Paid' : 'Sent';
    list.splice(list.indexOf(anchor) + 1, 0, cur);
    return list;
};

// =====================================================================================================================
// Deliveries
// =====================================================================================================================
export const DELIVERIES_KEY = 'internalDeliveries';
export const LEGACY_RECEIPT_KEY = 'internalStockReceipt';

export interface PoDeliveryLine {
    /** the PO line's id ('' for an old line without one: matched by position) */
    lineId: string;
    /** the line's position when the delivery was recorded */
    index: number;
    description: string;
    qty: number;
}

/** One item's stock change for a delivery (same shape as lib/suppliers.ts ReceiveMove). */
export interface PoStockMove {
    itemId: string;
    name: string;
    unit: string;
    qty: number;
}

export interface PoDelivery {
    /** "dlv_…": the idempotency key (stock-history notes carry [dlv:<id>]) */
    id: string;
    /** delivered on (YYYY-MM-DD; '' for a delivery recovered from the stock history) */
    date: string;
    note: string;
    /** recorded at (ISO) */
    at: string;
    /** latest claim (ISO): while fresh, another device / tab is still adding its stock */
    claimedAt: string;
    /** receiving = claimed, stock being added; partial = some items failed (Finish adds only those); done */
    state: 'receiving' | 'partial' | 'done';
    /** quantity delivered per PO line */
    lines: PoDeliveryLine[];
    /** stock it adds per inventory item (frozen at the claim) */
    items: PoStockMove[];
    /** item ids already added */
    applied: string[];
    failed?: string[];
    /** delivered lines that are not inventory items (tracked on the order only) */
    unmatched?: Array<{ description: string; qty: number; reason: string }>;
    doneAt?: string;
    /** rebuilt from the stock history after an older open form saved over the PO */
    recovered?: true;
}

export interface DeliveriesRecord {
    v: 1;
    /** changes on every write (compare-and-set) */
    rev: string;
    list: PoDelivery[];
}

const randomPart = (n: number): string => {
    const bytes = new Uint8Array(n);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, n * 2);
};

export const DELIVERY_ID_RE = /^dlv_[a-z0-9]{6,32}$/;
export const newDeliveryId = (): string => `dlv_${randomPart(6)}`;
export const newDeliveriesRev = (): string => `r_${Date.now().toString(36)}${randomPart(3)}`;

const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x).toLowerCase()).filter(Boolean) : []);

const parseDelivery = (raw: unknown): PoDelivery | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const id = str(r.id).toLowerCase();
    if (!DELIVERY_ID_RE.test(id)) return null;
    const state = r.state === 'done' || r.state === 'partial' || r.state === 'receiving' ? r.state : null;
    if (!state) return null;
    const lines: PoDeliveryLine[] = (Array.isArray(r.lines) ? r.lines : [])
        .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
        .map((l) => ({ lineId: str(l.lineId), index: Math.max(0, Math.floor(toNumber(l.index))), description: str(l.description).slice(0, 200), qty: q3(toNumber(l.qty)) }))
        .filter((l) => l.qty > 0);
    const items: PoStockMove[] = (Array.isArray(r.items) ? r.items : [])
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .map((m) => ({ itemId: str(m.itemId).toLowerCase(), name: str(m.name), unit: str(m.unit), qty: q3(toNumber(m.qty)) }))
        .filter((m) => m.itemId && m.qty > 0);
    const at = isoOr(r.at, '');
    const d: PoDelivery = {
        id, date: ymd(r.date), note: str(r.note).slice(0, 300), at, claimedAt: isoOr(r.claimedAt, at), state, lines, items, applied: ids(r.applied),
    };
    if (Array.isArray(r.failed)) d.failed = ids(r.failed);
    if (Array.isArray(r.unmatched)) {
        d.unmatched = r.unmatched
            .filter((u): u is Record<string, unknown> => !!u && typeof u === 'object')
            .map((u) => ({ description: str(u.description), qty: q3(toNumber(u.qty)), reason: str(u.reason) || 'not-in-inventory' }));
    }
    if (str(r.doneAt)) d.doneAt = isoOr(r.doneAt, '');
    if (r.recovered === true) d.recovered = true;
    return d;
};

/** The deliveries of a PO (data or a light row with `internalDeliveries`); null when none were ever recorded. */
export const parseDeliveries = (data: unknown): DeliveriesRecord | null => {
    const raw = data && typeof data === 'object' ? (data as Record<string, unknown>)[DELIVERIES_KEY] : null;
    let obj: unknown = raw;
    if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { obj = null; } }
    if (!obj || typeof obj !== 'object') return null;
    const r = obj as Record<string, unknown>;
    const seen = new Set<string>();
    const list: PoDelivery[] = [];
    for (const x of Array.isArray(r.list) ? r.list : []) {
        const d = parseDelivery(x);
        if (!d || seen.has(d.id)) continue;
        seen.add(d.id);
        list.push(d);
    }
    return { v: 1, rev: str(r.rev), list };
};

/** State of the older one-shot receipt ('' = none). */
export const legacyReceiptState = (data: unknown): '' | 'receiving' | 'partial' | 'done' => {
    const raw = data && typeof data === 'object' ? (data as Record<string, unknown>)[LEGACY_RECEIPT_KEY] : null;
    let obj: unknown = raw;
    if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { obj = null; } }
    const s = obj && typeof obj === 'object' ? (obj as Record<string, unknown>).state : null;
    return s === 'done' || s === 'partial' || s === 'receiving' ? s : '';
};

/** Markers at the end of a stock-history note: [po:<document id>] (lib/suppliers.ts) + [dlv:<delivery id>]. */
export const deliveryMarker = (deliveryId: string): string => `[dlv:${str(deliveryId).toLowerCase()}]`;
const DLV_IN_NOTE = /\[dlv:(dlv_[a-z0-9]{6,32})\]/i;
export const deliveryIdInNote = (note: unknown): string | null => DLV_IN_NOTE.exec(str(note))?.[1]?.toLowerCase() || null;

// =====================================================================================================================
// Ordered / delivered / remaining per line
// =====================================================================================================================
export interface LineLike {
    id?: unknown;
    description?: unknown;
    name?: unknown;
    quantity?: unknown;
    rate?: unknown;
    unit?: unknown;
}

export interface LineProgress {
    index: number;
    lineId: string;
    description: string;
    unit: string;
    /** ordered quantity (≤ 0 = nothing to deliver on this line) */
    ordered: number;
    delivered: number;
    remaining: number;
}

export interface DeliveryProgress {
    lines: LineProgress[];
    /** at least one line has something delivered */
    anyDelivered: boolean;
    /** every line with a quantity is fully delivered (false when no line has one) */
    allDelivered: boolean;
    /** the older one-shot receipt finished: every line counts as delivered */
    legacyDone: boolean;
    orderedQty: number;
    deliveredQty: number;
    remainingQty: number;
    deliveries: PoDelivery[];
}

const linesOf = (data: unknown): LineLike[] => {
    const raw = data && typeof data === 'object' ? (data as Record<string, unknown>).lineItems : null;
    let arr: unknown = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch { arr = null; } }
    return Array.isArray(arr) ? arr.map((l) => (l && typeof l === 'object' ? l as LineLike : {})) : [];
};

/** The PO line a delivery line belongs to: same id, else (a line without id) the same position. -1 = gone. */
export const lineIndexFor = (lines: readonly LineLike[], dl: Pick<PoDeliveryLine, 'lineId' | 'index'>): number => {
    if (dl.lineId) {
        const i = lines.findIndex((l) => str(l.id) === dl.lineId);
        if (i >= 0) return i;
        return -1;
    }
    return dl.index < lines.length && !str(lines[dl.index]?.id) ? dl.index : -1;
};

/**
 * Ordered, delivered and remaining per line, from the recorded deliveries (+ `extra`: deliveries recovered from the
 * stock history). A finished older receipt means everything arrived.
 */
export const deliveryProgress = (data: unknown, extra: readonly PoDelivery[] = []): DeliveryProgress => {
    const lines = linesOf(data);
    const record = parseDeliveries(data);
    const deliveries = [...(record?.list || []), ...extra];
    const legacyDone = legacyReceiptState(data) === 'done';
    const delivered = lines.map(() => 0);
    for (const d of deliveries) {
        for (const dl of d.lines) {
            const i = lineIndexFor(lines, dl);
            if (i >= 0) delivered[i] = q3(delivered[i] + dl.qty);
        }
    }
    const out: LineProgress[] = lines.map((l, index) => {
        const ordered = q3(toNumber(l.quantity));
        const got = ordered > 0 ? (legacyDone ? ordered : Math.min(ordered, delivered[index])) : 0;
        return {
            index, lineId: str(l.id), description: str(l.description ?? l.name), unit: str(l.unit),
            ordered, delivered: q3(got), remaining: ordered > 0 ? q3(Math.max(0, ordered - got)) : 0,
        };
    });
    const withQty = out.filter((l) => l.ordered > 0);
    const sum = (k: 'ordered' | 'delivered' | 'remaining') => q3(withQty.reduce((s, l) => s + l[k], 0));
    return {
        lines: out,
        anyDelivered: withQty.some((l) => l.delivered > 0),
        allDelivered: withQty.length > 0 && withQty.every((l) => l.remaining <= 0),
        legacyDone,
        orderedQty: sum('ordered'),
        deliveredQty: sum('delivered'),
        remainingQty: sum('remaining'),
        deliveries,
    };
};

/**
 * Status after a delivery: Delivered when nothing is left, Partially delivered otherwise. Invoiced / Paid / Cancelled
 * orders keep their status (a supplier can bill before the last delivery).
 */
export const statusAfterDelivery = (current: unknown, progress: Pick<DeliveryProgress, 'anyDelivered' | 'allDelivered'>): string => {
    const kind = poStatusKind(current);
    if (kind === 'invoiced' || kind === 'paid' || kind === 'cancelled') return str(current);
    if (progress.allDelivered) return 'Delivered';
    if (progress.anyDelivered) return 'Partially delivered';
    return str(current) || 'Draft';
};

/** A delivery left half-way: some items failed, or a claim nobody finished (tab closed). */
export const DELIVERY_CLAIM_FRESH_MS = 2 * 60 * 1000;
export const isClaimFresh = (d: Pick<PoDelivery, 'claimedAt' | 'at'>, now: string | number | Date = Date.now()): boolean => {
    const claimed = Date.parse(d.claimedAt || d.at);
    const nowMs = new Date(now).getTime();
    return Number.isFinite(claimed) && Number.isFinite(nowMs) && nowMs - claimed < DELIVERY_CLAIM_FRESH_MS;
};
export const unfinishedDelivery = (data: unknown, now: string | number | Date = Date.now()): PoDelivery | null =>
    parseDeliveries(data)?.list.find((d) => d.state === 'partial' || (d.state === 'receiving' && !isClaimFresh(d, now))) || null;

/** Every line gets a unique id (kept when it has one), so a delivery can point at it. */
export const ensureLineIds = <T extends Record<string, unknown>>(lines: readonly T[], makeId: () => string): { lines: T[]; changed: boolean } => {
    const used = new Set<string>();
    let changed = false;
    const out = lines.map((l) => {
        const id = str(l?.id);
        if (id && !used.has(id)) { used.add(id); return l; }
        let next = makeId();
        while (used.has(next)) next = makeId();
        used.add(next);
        changed = true;
        return { ...(l || {}), id: next } as unknown as T;
    });
    return { lines: out, changed };
};

// =====================================================================================================================
// Supplier invoice file (private bucket document-assets)
// =====================================================================================================================
export interface SupplierInvoiceFile {
    path: string;
    name: string;
    type: string;
    size: number;
    uploadedAt: string;
}
export const SUPPLIER_INVOICE_FILE_KEY = 'internalSupplierInvoiceFile';
/** Same limits as the papers vault (the bucket allows images + PDF up to 15 MB). */
export const SUPPLIER_INVOICE_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const SUPPLIER_INVOICE_MAX_BYTES = 15 * 1024 * 1024;

/** Why a file can't be attached ('' = fine). */
export const supplierInvoiceFileProblem = (file: { type: string; size: number; name: string }): string => {
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
    if (!(SUPPLIER_INVOICE_FILE_TYPES as readonly string[]).includes(type)) return 'Use a PDF or a photo (JPG, PNG, WebP).';
    if (file.size > SUPPLIER_INVOICE_MAX_BYTES) return 'The file is larger than 15 MB.';
    if (file.size <= 0) return 'The file is empty.';
    return '';
};

/** <user id>/purchase-orders/<document id>/<random>.<ext>: the first folder must be the owner (bucket policy). */
export const supplierInvoicePath = (userId: string, documentId: string, random: string, fileName: string, mime: string): string => {
    const fromMime: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const fromName = /\.(pdf|jpe?g|png|webp)$/i.exec(fileName)?.[1]?.toLowerCase();
    const ext = fromMime[mime] || (fromName === 'jpeg' ? 'jpg' : fromName) || 'pdf';
    const clean = (s: string, n: number) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, n);
    return `${clean(userId, 40)}/purchase-orders/${clean(documentId, 40)}/${clean(random, 24) || 'file'}.${ext}`;
};

export const parseSupplierInvoiceFile = (data: unknown): SupplierInvoiceFile | null => {
    const raw = data && typeof data === 'object' ? (data as Record<string, unknown>)[SUPPLIER_INVOICE_FILE_KEY] : null;
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const path = str(r.path);
    if (!/^[A-Za-z0-9_-]+\/purchase-orders\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(pdf|jpg|png|webp)$/.test(path)) return null;
    return { path, name: str(r.name).slice(0, 200) || 'Supplier invoice', type: str(r.type), size: Math.max(0, toNumber(r.size)), uploadedAt: isoOr(r.uploadedAt, '') };
};

/** Paid sets the paid date (today) when it has none. */
export const withStatusDates = <T extends Record<string, unknown>>(data: T, nextStatus: string, today: string): T => {
    const next = { ...data, status: nextStatus } as T;
    if (poStatusKind(nextStatus) === 'paid' && !ymd(data.paidDate)) (next as Record<string, unknown>).paidDate = today;
    return next;
};

/** The supplier's invoice was entered: the order moves to Invoiced (unless it is already Invoiced / Paid / Cancelled). */
export const statusAfterSupplierInvoice = (current: unknown, data: { supplierInvoiceNumber?: unknown; supplierInvoiceAmount?: unknown }): string => {
    const has = Boolean(str(data.supplierInvoiceNumber)) || toNumber(data.supplierInvoiceAmount) > 0;
    const kind = poStatusKind(current);
    if (!has || kind === 'invoiced' || kind === 'paid' || kind === 'cancelled') return str(current);
    return 'Invoiced';
};

// =====================================================================================================================
// Cost split for job costing (lib/costing.ts)
// =====================================================================================================================
export interface PoCostLine {
    index: number;
    /** share of the line that is an actual cost (0–1) */
    actualShare: number;
    /** share of the line that is committed (0–1) */
    committedShare: number;
}

export interface PoCostShares {
    kind: PoStatusKind;
    lines: PoCostLine[];
    /** Invoiced / Paid with an amount: the actual cost is this amount (spread over the lines like the PO total) */
    invoiceAmount: number | null;
}

/**
 * How each line of a purchase order counts in job costing:
 *  - Delivered / Received / Invoiced / Paid (or the older receipt finished): the whole line is ACTUAL;
 *  - otherwise the delivered quantity is ACTUAL, and on Sent / Confirmed / Partially delivered orders the rest is
 *    COMMITTED (ordered, not here yet);
 *  - Draft, Cancelled and "can't fill" orders commit nothing (only goods already delivered count).
 * Before roadmap N2 a PO counted whole as actual once Sent: actual + committed of these orders is that same amount,
 * so the totals, % used, alerts and projections stay the same; only the split between spent and ordered is new.
 */
export const poCostShares = (doc: Record<string, unknown>): PoCostShares => {
    const kind = poStatusKind(doc.status);
    const progress = deliveryProgress(doc);
    const legacyDone = progress.legacyDone && kind !== 'cancelled' && kind !== 'cant-fill';
    const full = FULLY_DELIVERED_KINDS.includes(kind) || legacyDone;
    const committing = COMMITTED_KINDS.includes(kind);
    const lines: PoCostLine[] = progress.lines.map((l) => {
        if (full) return { index: l.index, actualShare: 1, committedShare: 0 };
        const share = l.ordered > 0 ? Math.min(1, l.delivered / l.ordered) : 0;
        return { index: l.index, actualShare: share, committedShare: committing ? 1 - share : 0 };
    });
    const amount = toNumber(doc.supplierInvoiceAmount);
    const invoiceAmount = (kind === 'invoiced' || kind === 'paid') && amount > 0 ? roundMoney(amount) : null;
    return { kind, lines, invoiceAmount };
};

/** Amount of a PO line (quantity × unit price). */
export const poLineAmount = (line: LineLike): number => lineItemAmount({ quantity: line.quantity as number, rate: line.rate as number });
