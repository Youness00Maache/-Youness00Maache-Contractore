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
    RECEIPT_KEY, appliedFromHistory, buildReorderPoData, claimReceipt, finishReceipt, nextPoNumber, parseReorderSetting, parseStockReceipt,
    parseSuppliers, planReceive, receiptMarker, receiveReason, serializeReorderSetting, serializeSuppliers, withReceipt,
    type ParsedReorder, type PurchaseOrderLike, type ReceiveMove, type ReceivePlan, type ReorderGroup, type ReorderLine, type StockItemLike,
    type StockReceipt, type Supplier, type UnmatchedLine,
} from './suppliers.ts';

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
    'lineItems:data->lineItems', `internalStockReceipt:data->${RECEIPT_KEY}`,
].join(', ');

export type OpenPurchaseOrder = PurchaseOrderLike & { jobId?: string };

/** Purchase orders whose goods haven't arrived (Draft / Sent / confirmed, not received), newest 500. */
export async function fetchOpenPurchaseOrders(): Promise<OpenPurchaseOrder[]> {
    const { data, error } = await supabase
        .from('documents')
        .select(OPEN_PO_COLUMNS)
        .eq('type', FormType.PurchaseOrder)
        .or('data->>status.is.null,data->>status.in.(Draft,Sent,Accepted,Approved)')
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
