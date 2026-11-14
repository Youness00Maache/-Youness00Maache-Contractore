/**
 * Database side of supplier ordering (lib/suppliers.ts holds the logic and documents every data shape).
 * No migration: saved suppliers and reorder quantities live in public.user_settings (lib/userData.ts), reorder POs are
 * ordinary Purchase Order documents, and "Mark received" adds stock with the existing RPC adjust_inventory.
 */
import { supabase } from './supabase.ts';
import { FormType } from '../types.ts';
import type { FormData as FormDataType, Job, UserProfile } from '../types.ts';
import { describeError, isMissingColumnError, isPlanLimitError, planLimitMessage } from './account.ts';
import { assertFullDocument, fetchFullDocument, mapDocumentRow, primeDocumentCache, stripLightweightFlag } from './documents.ts';
import { loadReorderSetting, loadSuppliersSetting, saveReorderSetting, saveSuppliersSetting, type SyncMode } from './userData.ts';
import { approvalUrl, ensureApprovalToken } from '../utils/clientLinks.ts';
import { newId, todayISO } from '../components/forms/formUtils.ts';
import {
    RECEIPT_KEY, appliedFromHistory, buildReorderPoData, claimDeliveryFinish, claimReceipt, deliveryReason, finishDelivery, finishReceipt,
    makeDelivery, nextPoNumber, parseReorderSetting, parseStockReceipt, parseSuppliers, planDelivery, planReceive, receiptMarker, receiveReason,
    serializeReorderSetting, serializeSuppliers, withDelivery, withReceipt,
    type DeliveryInput, type DeliveryPlan, type ParsedReorder, type PoHistoryRow, type PurchaseOrderLike, type ReceiveMove, type ReceivePlan,
    type ReorderGroup, type ReorderLine, type StockItemLike, type StockReceipt, type Supplier, type UnmatchedLine,
} from './suppliers.ts';
import {
    DELIVERIES_KEY, ensureLineIds, newDeliveriesRev, parseDeliveries, supplierInvoiceFileProblem, supplierInvoicePath,
    type PoDelivery, type SupplierInvoiceFile,
} from './poLifecycle.ts';
import { NEEDS_CONNECTION } from './offline/connection.ts';

// ------------------------------------------------------------------------------------------------ settings
export async function loadSuppliers(): Promise<Supplier[]> {
    try {
        return parseSuppliers(await loadSuppliersSetting());
    } catch {
        return [];
    }
}

/** Saves the whole list (account + this device). Throws a readable error when it can't be stored. */
export async function saveSuppliers(list: Supplier[]): Promise<SyncMode> {
    const { value, error } = serializeSuppliers(list);
    if (error) throw new Error(error);
    const mode = await saveSuppliersSetting(value);
    if (mode === 'failed') throw new Error('Your suppliers could not be saved on this device. Check your connection and try again.');
    return mode;
}

export async function loadReorder(): Promise<ParsedReorder> {
    try {
        return parseReorderSetting(await loadReorderSetting());
    } catch {
        return { qty: {}, jobId: null };
    }
}

export async function saveReorder(setting: ParsedReorder, knownItemIds?: Iterable<string>): Promise<SyncMode> {
    const { value, error } = serializeReorderSetting(setting, { knownItemIds });
    if (error) throw new Error(error);
    return saveReorderSetting(value);
}

// ------------------------------------------------------------------------------------------- open orders
const OPEN_PO_COLUMNS = [
    'id', 'jobId:job_id', 'createdAt:created_at',
    'status:data->>status', 'poNumber:data->>poNumber', 'vendorName:data->>vendorName',
    'lineItems:data->lineItems', `internalStockReceipt:data->${RECEIPT_KEY}`, `internalDeliveries:data->${DELIVERIES_KEY}`,
].join(', ');

export type OpenPurchaseOrder = PurchaseOrderLike & { jobId?: string };

/** Purchase orders whose goods haven't (all) arrived (Draft / Sent / confirmed / partly delivered), newest 500. */
export async function fetchOpenPurchaseOrders(): Promise<OpenPurchaseOrder[]> {
    const { data, error } = await supabase
        .from('documents')
        .select(OPEN_PO_COLUMNS)
        .eq('type', FormType.PurchaseOrder)
        .or('data->>status.is.null,data->>status.in.(Draft,Sent,Accepted,Approved,Confirmed,"Partially delivered")')
        .order('created_at', { ascending: false })
        .limit(500);
    if (error) throw new Error(describeError(error, 'Could not load your open purchase orders.'));
    return (data || []) as unknown as OpenPurchaseOrder[];
}

/** id, name, unit, stock and kit flag of every inventory item (for matching PO lines). */
async function fetchInventoryLite(): Promise<StockItemLike[]> {
    const rows: StockItemLike[] = [];
    const page = 1000;
    for (let from = 0; from < 20000; from += page) {
        const { data, error } = await supabase.from('inventory').select('id,name,unit,quantity,is_assembly').order('name', { ascending: true }).range(from, from + page - 1);
        if (error) throw new Error(describeError(error, 'Could not load your inventory.'));
        rows.push(...((data || []) as StockItemLike[]));
        if (!data || data.length < page) break;
    }
    return rows;
}

// ------------------------------------------------------------------------------------------ reorder POs
async function usedPoNumbers(): Promise<string[]> {
    try {
        const { data } = await supabase.from('documents').select('num:data->>poNumber').eq('type', FormType.PurchaseOrder)
            .order('created_at', { ascending: false }).limit(1000);
        return ((data || []) as Array<{ num?: unknown }>).map((r) => r?.num).filter((n): n is string => typeof n === 'string' && !!n);
    } catch {
        return [];
    }
}

/** Some (or none) of the POs could not be created. `created` = the ones that were. */
export class ReorderCreateError extends Error {
    created: FormDataType[];
    planLimit: boolean;
    constructor(message: string, created: FormDataType[], planLimit: boolean) {
        super(message);
        this.name = 'ReorderCreateError';
        this.created = created;
        this.planLimit = planLimit;
    }
}

export interface ReorderOrderInput {
    group: Pick<ReorderGroup, 'supplier' | 'vendorName'>;
    lines: ReorderLine[];
}

/** One Draft purchase order per supplier, filed under `job` (same record shape as a form save). */
export async function createReorderPurchaseOrders(args: {
    userId: string;
    job: Job & { clientId?: string | null };
    profile?: UserProfile | null;
    orders: ReorderOrderInput[];
    knownNumbers?: string[];
}): Promise<FormDataType[]> {
    const used = [...(await usedPoNumbers()), ...(args.knownNumbers || [])];
    const today = todayISO();
    const created: FormDataType[] = [];
    for (const order of args.orders) {
        const lines = order.lines.filter((l) => l.qty > 0);
        if (!lines.length) continue;
        const number = nextPoNumber(used);
        used.push(number);
        const id = newId();
        const data = buildReorderPoData({ job: args.job, profile: args.profile, group: order.group, lines, number, today, now: new Date().toISOString() });
        assertFullDocument({ data });
        const record: Record<string, unknown> = { id, user_id: args.userId, job_id: args.job.id, type: FormType.PurchaseOrder, data };
        if (args.job.clientId) record.client_id = args.job.clientId;
        let res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
        if (res.error && 'client_id' in record && isMissingColumnError(res.error)) {
            delete record.client_id;
            res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
        }
        if (res.error) {
            const limit = isPlanLimitError(res.error);
            throw new ReorderCreateError(limit ? planLimitMessage(res.error) : describeError(res.error, 'The purchase order could not be created.'), created, limit);
        }
        const row = (res.data || {}) as { public_token?: string | null; created_at?: string | null };
        const doc = mapDocumentRow({ ...record, public_token: row.public_token ?? null, created_at: row.created_at ?? new Date().toISOString() }, true);
        primeDocumentCache(doc);
        created.push(doc);
    }
    return created;
}

// --------------------------------------------------------------------------------------- mark received
export interface ReceivePreview {
    doc: FormDataType;
    plan: ReceivePlan;
}

async function fetchReceiptHistory(documentId: string) {
    const { data, error } = await supabase
        .from('inventory_history')
        .select('item_id, quantity_change, notes')
        .ilike('notes', `%${receiptMarker(documentId)}%`)
        .limit(1000);
    if (error) throw new Error(describeError(error, 'Could not check the stock history.'));
    return (data || []) as Array<{ item_id?: string | null; quantity_change?: unknown; notes?: string | null }>;
}

/** What "Mark received" would add (fresh copy of the PO, current inventory, the stock history guard). */
export async function previewReceive(documentId: string): Promise<ReceivePreview> {
    const doc = await fetchFullDocument(documentId, { force: true });
    if (doc.type !== FormType.PurchaseOrder) throw new Error('Only purchase orders can be received into stock.');
    const [items, history] = await Promise.all([fetchInventoryLite(), fetchReceiptHistory(documentId)]);
    const plan = planReceive({ data: doc.data, items, appliedItemIds: appliedFromHistory(history, documentId) });
    return { doc, plan };
}

export interface ReceiveResult {
    status: 'done' | 'partial' | 'already';
    receipt: StockReceipt | null;
    /** the PO as saved now */
    doc: FormDataType;
    added: ReceiveMove[];
    failed: ReceiveMove[];
    unmatched: UnmatchedLine[];
    /** stock was added but the PO's receipt couldn't be saved (the stock history still prevents adding it twice) */
    saveWarning?: string;
}

const savePoData = async (doc: FormDataType, data: Record<string, unknown>): Promise<{ doc: FormDataType; error?: string }> => {
    assertFullDocument({ data });
    const { error } = await supabase.from('documents').update({ data }).eq('id', doc.id);
    const saved = mapDocumentRow({ id: doc.id, job_id: doc.jobId, type: doc.type, created_at: doc.createdAt, public_token: doc.public_token ?? null, data }, true);
    if (!error) primeDocumentCache(saved);
    return { doc: error ? doc : saved, error: error ? describeError(error, 'The purchase order could not be updated.') : undefined };
};

/**
 * Adds the PO's quantities to stock, once. Steps: fresh PO + inventory + stock history → plan; claim (the receipt is
 * written only if the PO has none yet, so two taps or two devices can't both add); one adjust_inventory per item
 * (history note ends with the "[po:<id>]" marker); then the receipt is finished and the status set to Received.
 */
export async function receivePurchaseOrder(documentId: string): Promise<ReceiveResult> {
    const { doc, plan } = await previewReceive(documentId);
    const base = stripLightweightFlag({ ...(doc.data as unknown as Record<string, unknown>) });
    const now = () => new Date().toISOString();

    if (plan.status === 'already') {
        let saved = doc;
        let receipt = plan.receipt;
        // the stock went in but the PO lost its receipt (e.g. an older open form saved over it): write it back
        if (!receipt || receipt.state !== 'done') {
            receipt = finishReceipt(claimReceipt(plan, now()), [], [], now());
            saved = (await savePoData(doc, withReceipt(base, receipt))).doc;
        }
        return { status: 'already', receipt, doc: saved, added: [], failed: [], unmatched: plan.unmatched };
    }
    if (plan.status === 'busy') {
        // another device / tab claimed it moments ago and is still adding the stock: never add it a second time
        throw new Error('This order is being received on another device or tab right now. Wait a minute, then open Mark received again.');
    }
    if (plan.status === 'nothing') {
        throw new Error(plan.unmatched.length
            ? 'None of the lines match an inventory item. Pick the items from Inventory on the order (or use the exact item names), then try again.'
            : 'This purchase order has no quantities to receive.');
    }

    let receipt = claimReceipt(plan, now());
    if (!plan.receipt) {
        // atomic claim: only a PO that still has no receipt is updated
        const { data: claimed, error } = await supabase
            .from('documents')
            .update({ data: { ...base, [RECEIPT_KEY]: receipt } })
            .eq('id', documentId)
            .is(`data->${RECEIPT_KEY}`, null)
            .select('id');
        if (error) throw new Error(describeError(error, 'Could not start receiving this order.'));
        if (!claimed || !claimed.length) {
            const fresh = await fetchFullDocument(documentId, { force: true });
            return { status: 'already', receipt: parseStockReceipt(fresh.data), doc: fresh, added: [], failed: [], unmatched: plan.unmatched };
        }
    } else {
        // atomic too: only the receipt exactly as previewed is taken over (two devices finishing the same partial
        // receipt can't both add the missing items)
        let claim = supabase
            .from('documents')
            .update({ data: { ...base, [RECEIPT_KEY]: receipt } })
            .eq('id', documentId)
            .eq(`data->${RECEIPT_KEY}->>state`, plan.receipt.state);
        // every claim stamps a new claimedAt: whoever takes it over first changes it, the other update matches nothing
        claim = plan.receipt.claimedAt
            ? claim.eq(`data->${RECEIPT_KEY}->>claimedAt`, plan.receipt.claimedAt)
            : claim.is(`data->${RECEIPT_KEY}->>claimedAt`, null);
        const { data: claimed, error } = await claim.select('id');
        if (error) throw new Error(describeError(error, 'Could not continue receiving this order.'));
        if (!claimed || !claimed.length) {
            throw new Error('This order is being received on another device or tab right now. Wait a minute, then open Mark received again.');
        }
    }

    const reason = receiveReason(base, documentId);
    const added: ReceiveMove[] = [];
    const failed: ReceiveMove[] = [];
    for (const m of plan.moves) {
        const { error } = await supabase.rpc('adjust_inventory', { p_item_id: m.itemId, p_delta: m.qty, p_reason: reason, p_job_id: doc.jobId || null });
        if (error) failed.push(m); else added.push(m);
    }
    receipt = finishReceipt(receipt, added.map((m) => m.itemId), failed.map((m) => m.itemId), now());
    const { doc: saved, error: saveError } = await savePoData(doc, withReceipt(base, receipt));
    return {
        status: receipt.state === 'done' ? 'done' : 'partial',
        receipt,
        doc: saved,
        added,
        failed,
        unmatched: plan.unmatched,
        ...(saveError ? { saveWarning: `Stock was updated, but the order could not be marked received (${saveError}). Open it again later; the stock won't be added twice.` } : {}),
    };
}

// ------------------------------------------------------------------------------------ record delivery (N2)
/** This PO's stock-history rows (both guard markers live in the note). */
async function fetchPoHistory(documentId: string): Promise<PoHistoryRow[]> {
    const { data, error } = await supabase
        .from('inventory_history')
        .select('item_id, quantity_change, notes, created_at')
        .ilike('notes', `%${receiptMarker(documentId)}%`)
        .limit(1000);
    if (error) throw new Error(describeError(error, 'Could not check the stock history.'));
    return (data || []) as PoHistoryRow[];
}

export interface DeliveryPreview {
    doc: FormDataType;
    plan: DeliveryPlan;
    /** the PO data the plan was made from (every line has an id; written with the claim) */
    data: Record<string, unknown>;
}

/** What "Record delivery" can do now (fresh copy of the PO, current inventory, the stock-history guard). */
export async function previewDelivery(documentId: string, deliveryId?: string | null): Promise<DeliveryPreview> {
    const doc = await fetchFullDocument(documentId, { force: true });
    if (doc.type !== FormType.PurchaseOrder) throw new Error('Only purchase orders can record deliveries.');
    const [items, history] = await Promise.all([fetchInventoryLite(), fetchPoHistory(documentId)]);
    const raw = stripLightweightFlag({ ...(doc.data as unknown as Record<string, unknown>) });
    const lines = Array.isArray(raw.lineItems) ? (raw.lineItems as Record<string, unknown>[]) : [];
    const ensured = ensureLineIds(lines, newId);
    const data = ensured.changed ? { ...raw, lineItems: ensured.lines } : raw;
    return { doc, plan: planDelivery({ data, items, documentId, history, deliveryId }), data };
}

export interface DeliveryResult {
    status: 'done' | 'partial' | 'already';
    delivery: PoDelivery | null;
    /** the PO as saved now */
    doc: FormDataType;
    added: ReceiveMove[];
    failed: ReceiveMove[];
    /** delivered lines that are not inventory items (tracked on the order only) */
    unmatched: NonNullable<PoDelivery['unmatched']>;
    /** stock was added but the delivery couldn't be marked finished (the stock history still prevents adding it twice) */
    saveWarning?: string;
}

const BUSY_DELIVERY = 'This delivery is being added on another device or tab right now. Wait a minute, then open the order again. Nothing is added twice.';

/**
 * Writes the delivery into the freshest copy of the PO (compare-and-set on the deliveries' rev; a few tries when
 * another device writes at the same moment), so a delivery recorded elsewhere meanwhile is never dropped.
 */
async function saveDelivery(documentId: string, delivery: PoDelivery, recovered: readonly PoDelivery[]): Promise<{ doc: FormDataType | null; error?: string }> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const fresh = await fetchFullDocument(documentId, { force: true });
        const base = stripLightweightFlag({ ...(fresh.data as unknown as Record<string, unknown>) });
        const rev = parseDeliveries(base)?.rev || '';
        const next = withDelivery(base, delivery, { rev: newDeliveriesRev(), recovered });
        assertFullDocument({ data: next });
        let write = supabase.from('documents').update({ data: next }).eq('id', documentId);
        write = rev ? write.eq(`data->${DELIVERIES_KEY}->>rev`, rev) : write.is(`data->${DELIVERIES_KEY}->>rev`, null);
        const { data: rows, error } = await write.select('id');
        if (error) return { doc: null, error: describeError(error, 'The purchase order could not be updated.') };
        if (rows && rows.length) {
            const saved = mapDocumentRow({ id: fresh.id, job_id: fresh.jobId, type: fresh.type, created_at: fresh.createdAt, public_token: fresh.public_token ?? null, data: next }, true);
            primeDocumentCache(saved);
            return { doc: saved };
        }
    }
    return { doc: null, error: 'the order kept changing on another device' };
}

/**
 * "Record delivery": adds ONLY this delivery's quantities to stock, once per delivery id. Steps: fresh PO + inventory +
 * stock history → plan; claim (the delivery is written with compare-and-set on the deliveries' rev, and only while the
 * PO has no older "Mark received" record, so two devices / tabs can't both claim); one adjust_inventory per item (note
 * ends with "[po:<id>] [dlv:<delivery id>]"); then the delivery is finished and the status moves to Partially
 * delivered / Delivered. With the id of a delivery that stopped half-way, it adds only what is missing.
 */
export async function recordDelivery(documentId: string, input: DeliveryInput): Promise<DeliveryResult> {
    const { doc, plan, data } = await previewDelivery(documentId, input.id);
    const now = () => new Date().toISOString();

    if (plan.status === 'legacy') throw new Error('This order has an unfinished “Mark received”. Use Finish receiving first.');
    if (plan.status === 'closed') throw new Error('This order is cancelled. Change its status to record a delivery.');
    if (plan.status === 'busy') throw new Error(BUSY_DELIVERY);
    if (plan.status === 'nothing') throw new Error('This purchase order has no quantities to deliver.');
    if (plan.status === 'already') {
        if (plan.existing && plan.existing.state !== 'done') {
            // its stock is all in per the history but the record wasn't finished: finish it without moving stock
            const finished = finishDelivery(claimDeliveryFinish(plan, now()) as PoDelivery, [], [], now());
            const saved = await saveDelivery(documentId, finished, plan.recovered);
            return { status: 'already', delivery: finished, doc: saved.doc || doc, added: [], failed: [], unmatched: [], ...(saved.error ? { saveWarning: saved.error } : {}) };
        }
        if (plan.existing) return { status: 'already', delivery: plan.existing, doc, added: [], failed: [], unmatched: [] };
        throw new Error('Everything on this order was delivered already. Nothing was added twice.');
    }

    let delivery: PoDelivery;
    let moves: ReceiveMove[];
    if (plan.status === 'finish') {
        delivery = claimDeliveryFinish(plan, now()) as PoDelivery;
        moves = plan.moves;
    } else {
        const made = makeDelivery(plan, input, now());
        if (!made.delivery) throw new Error(made.error || 'Enter a delivered quantity on at least one line.');
        delivery = made.delivery;
        moves = delivery.items;
    }

    // atomic claim: only the deliveries exactly as previewed (rev), and never next to an older "Mark received"
    const claimData = withDelivery(data, delivery, { rev: newDeliveriesRev(), recovered: plan.recovered });
    assertFullDocument({ data: claimData });
    let claim = supabase.from('documents').update({ data: claimData }).eq('id', documentId).is(`data->${RECEIPT_KEY}`, null);
    claim = plan.record?.rev ? claim.eq(`data->${DELIVERIES_KEY}->>rev`, plan.record.rev) : claim.is(`data->${DELIVERIES_KEY}->>rev`, null);
    const { data: claimed, error } = await claim.select('id');
    if (error) throw new Error(describeError(error, 'Could not record this delivery.'));
    if (!claimed || !claimed.length) {
        throw new Error('Another delivery was just recorded on this order (another device or tab). Open Record delivery again to see what is left. Nothing was added.');
    }

    const reason = deliveryReason(data, documentId, delivery.id);
    const added: ReceiveMove[] = [];
    const failed: ReceiveMove[] = [];
    for (const m of moves) {
        const { error: moveError } = await supabase.rpc('adjust_inventory', { p_item_id: m.itemId, p_delta: m.qty, p_reason: reason, p_job_id: doc.jobId || null });
        if (moveError) failed.push(m); else added.push(m);
    }
    const finished = moves.length || delivery.state !== 'done'
        ? finishDelivery(delivery, added.map((m) => m.itemId), failed.map((m) => m.itemId), now())
        : delivery;
    let savedDoc: FormDataType | null = null;
    let saveError: string | undefined;
    if (finished !== delivery) {
        const saved = await saveDelivery(documentId, finished, plan.recovered);
        savedDoc = saved.doc;
        saveError = saved.error;
    } else {
        savedDoc = mapDocumentRow({ id: doc.id, job_id: doc.jobId, type: doc.type, created_at: doc.createdAt, public_token: doc.public_token ?? null, data: claimData }, true);
        primeDocumentCache(savedDoc);
    }
    return {
        status: finished.state === 'done' ? 'done' : 'partial',
        delivery: finished,
        doc: savedDoc || mapDocumentRow({ id: doc.id, job_id: doc.jobId, type: doc.type, created_at: doc.createdAt, public_token: doc.public_token ?? null, data: claimData }, true),
        added,
        failed,
        unmatched: finished.unmatched || [],
        ...(saveError ? { saveWarning: `Stock was updated, but the delivery could not be marked finished (${saveError}). Open the order again later; the stock won't be added twice.` } : {}),
    };
}

// ------------------------------------------------------------------------------ supplier invoice file (N2)
/** The existing private bucket (owner-folder policies: the first folder is the user's id). */
export const PO_FILES_BUCKET = 'document-assets';
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const fileRandom = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Uploads the supplier's invoice (PDF / photo, ≤ 15 MB); returns what to store on the PO. */
export async function uploadSupplierInvoiceFile(documentId: string, file: File): Promise<SupplierInvoiceFile> {
    if (offlineNow()) throw new Error(NEEDS_CONNECTION);
    const problem = supplierInvoiceFileProblem(file);
    if (problem) throw new Error(problem);
    const { data: auth } = await supabase.auth.getSession();
    const userId = auth?.session?.user?.id;
    if (!userId) throw new Error('Sign in again to attach files.');
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg');
    const path = supplierInvoicePath(userId, documentId, fileRandom(), file.name, type);
    const { error } = await supabase.storage.from(PO_FILES_BUCKET).upload(path, file, { upsert: false, contentType: type, cacheControl: '3600' });
    if (error) throw new Error(`The file could not be uploaded. ${error.message || ''}`.trim());
    return { path, name: (file.name || 'Supplier invoice').slice(0, 200), type, size: file.size, uploadedAt: new Date().toISOString() };
}

/** A link to open the file (1 hour). */
export async function supplierInvoiceFileUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(PO_FILES_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'The file could not be opened.');
    return data.signedUrl;
}

/** Removes a replaced / detached file (best effort). */
export async function removeSupplierInvoiceFile(path: string | null | undefined): Promise<void> {
    if (!path) return;
    await supabase.storage.from(PO_FILES_BUCKET).remove([path]).then(() => undefined, () => undefined);
}

// ------------------------------------------------------------------------------------ supplier confirm link
let poLinkSupported: boolean | null = null;

/**
 * The supplier's "Confirm order" link (the existing approval link of the document), or null while the database
 * doesn't serve purchase orders on that link yet (public.get_document_by_token only knows client documents; see the
 * owner-approval SQL in the feature report). Checked once per session.
 */
export async function supplierConfirmLink(documentId: string | undefined | null): Promise<string | null> {
    if (!documentId || poLinkSupported === false) return null;
    try {
        const token = await ensureApprovalToken(documentId);
        const { data, error } = await supabase.rpc('get_document_by_token', { doc_token: token });
        if (error || !data) {
            if (error && /not found|no longer valid/i.test(error.message || '')) poLinkSupported = false;
            return null;
        }
        poLinkSupported = true;
        return approvalUrl(token);
    } catch {
        return null;
    }
}
