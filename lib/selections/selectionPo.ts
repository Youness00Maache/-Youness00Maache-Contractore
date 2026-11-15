/**
 * Client selections -> purchase order + job budget: pure logic (no Supabase, no React).
 *
 *   SELECTION_PO_KEY = 'internalSelection'   marker stored on the PO: { v: 1, selectionId, optionId, at }
 *   pickPoSupplier(option, ctx)              -> PoSupplierPick | null
 *        the option's own supplier (supplier_id, not archived), else the suggestion of
 *        lib/suppliers/libraryLogic.ts suggestSupplierForInventoryItem (price-book preferred supplier, cheapest offer,
 *        supplier named on the item), matched by the option's SKU / name. Null = no supplier (the PO is still made;
 *        the user fills the vendor).
 *   selectionPoLine(selection, option, makeId?)  -> LineItem   (description "<title>: <option>" + SKU, qty, cost)
 *   buildSelectionPoData({ job, profile, selection, supplier, vendorName?, number, today, now?, makeId? })
 *        -> full `data` of a Draft Purchase Order: the SAME document shape as the reorder POs
 *           (lib/suppliers.ts buildReorderPoData: the form's defaults from makeDocumentDefaults, PO number from
 *           nextPoNumber, vendor from supplierToVendor, account number note), one line, NOT linked to inventory,
 *           shipped to the job site (form default), plus the internalSelection marker. Throws when the selection
 *           has no chosen option or isn't approved.
 *   selectionBudget(selections)              -> SelectionBudget  (see below)
 *
 * Budget hook (for lib/costing.ts consumers; lib/costing.ts itself is NOT changed, so jobs without selections keep
 * exactly the same numbers):
 *   - an ORDERED selection with a purchase order is already in costing through that PO (committed once the PO is
 *     Sent, actual once delivered): never add it again. selectionBudget lists those under `viaPurchaseOrder`.
 *   - an APPROVED selection without a PO yet is "pending selection": show `pendingCost` next to Committed (e.g.
 *     "+ $1,240 approved selections not ordered yet"); it is NOT part of summarizeJobCosting's committed.
 *   - allowance differences (upgrades / credits) change what the CLIENT pays, not the cost: `upgrades`, `credits`,
 *     `netAllowanceChange` (> 0 the contract value should grow by a change order).
 */
import { FormType, type Job, type LineItem, type UserProfile } from '../../types.ts';
import { roundMoney } from '../../utils/money.ts';
import { newId } from '../../components/forms/formUtils.ts';
import { makeDocumentDefaults } from '../../src/ai/planDocuments.ts';
import { supplierToVendor, withAccountNumberNote, type Supplier } from '../suppliers.ts';
import { recordToLegacy, suggestSupplierForInventoryItem } from '../suppliers/libraryLogic.ts';
import type { PriceBookLibraryItem, SupplierItemRecord, SupplierRecord } from '../suppliers/types.ts';
import { chosenOption, optionPricing } from './selectionLogic.ts';
import type { JobSelection, SelectionOption } from './selectionTypes.ts';

export const SELECTION_PO_KEY = 'internalSelection';

export interface SelectionPoMarker {
    v: 1;
    selectionId: string;
    optionId: string;
    at: string;
}

export interface PoSupplierPick {
    supplier: SupplierRecord;
    /** 'option' = the option's own supplier; else why suggestSupplierForInventoryItem picked it */
    reason: 'option' | 'preferred' | 'cheapest' | 'inventory';
    /** the supplier's catalogue price for this product, when known (shown as a hint; the PO uses the option's cost) */
    price: number | null;
}

export const pickPoSupplier = (
    option: Pick<SelectionOption, 'name' | 'sku' | 'supplierId'>,
    ctx: { suppliers: readonly SupplierRecord[]; priceBook?: readonly PriceBookLibraryItem[]; supplierItems?: readonly SupplierItemRecord[] },
): PoSupplierPick | null => {
    const own = option.supplierId ? ctx.suppliers.find(s => s.id === option.supplierId && !s.archived) : undefined;
    if (own) return { supplier: own, reason: 'option', price: null };
    const s = suggestSupplierForInventoryItem({ name: option.name, sku: option.sku }, {
        suppliers: ctx.suppliers, priceBook: ctx.priceBook || [], supplierItems: ctx.supplierItems || [],
    });
    return s ? { supplier: s.supplier, reason: s.reason, price: s.price } : null;
};

/** The PO line: at cost (unitCost, else the client price when no cost is known), not linked to inventory. */
export const selectionPoLine = (
    selection: Pick<JobSelection, 'title'>, option: SelectionOption, makeId: () => string = newId,
): LineItem & { sku?: string } => {
    const rate = roundMoney(option.unitCost ?? option.unitPrice ?? 0);
    const name = option.name.trim();
    const title = selection.title.trim();
    const description = [title && title.toLowerCase() !== name.toLowerCase() ? `${title}: ${name}` : name, option.sku ? `(SKU ${option.sku})` : '']
        .filter(Boolean).join(' ');
    const line: LineItem & { sku?: string } = {
        id: makeId(),
        description,
        quantity: Number(option.qty) > 0 ? Number(option.qty) : 1,
        rate,
        unitCost: rate,
    };
    if (option.unit) line.unit = option.unit;
    if (option.sku) line.sku = option.sku;
    return line;
};

/** Full `data` of the Draft purchase order of an approved selection (see the file header). */
export const buildSelectionPoData = (args: {
    job: Job;
    profile?: UserProfile | null;
    selection: JobSelection;
    /** a suppliers-table record (pickPoSupplier) or an old-list supplier; null = vendorName only */
    supplier?: SupplierRecord | Supplier | null;
    vendorName?: string;
    number: string;
    today: string;
    now?: string;
    makeId?: () => string;
}): Record<string, unknown> => {
    const s = args.selection;
    if (s.status !== 'approved' && s.status !== 'ordered') throw new Error('Approve the client\'s choice first.');
    const option = chosenOption(s);
    if (!option) throw new Error('The client has not chosen an option.');
    const base = makeDocumentDefaults(FormType.PurchaseOrder, args.job, args.profile, args.today);
    const legacy: Supplier | null = !args.supplier ? null
        : 'legacyKey' in args.supplier ? recordToLegacy(args.supplier as SupplierRecord) : (args.supplier as Supplier);
    const vendor = legacy
        ? supplierToVendor(legacy)
        : { vendorName: String(args.vendorName || '').trim().slice(0, 80), vendorEmail: '', vendorPhone: '', vendorAddress: '' };
    const marker: SelectionPoMarker = { v: 1, selectionId: s.id, optionId: option.id, at: args.now || new Date().toISOString() };
    const notes = [s.room ? `Room: ${s.room}` : '', option.url ? `Product: ${option.url}` : ''].filter(Boolean).join('\n');
    return {
        ...base,
        title: `Selection – ${s.title}`.slice(0, 200),
        poNumber: args.number,
        status: 'Draft',
        ...vendor,
        lineItems: [selectionPoLine(s, option, args.makeId || newId)],
        notes: withAccountNumberNote(notes, legacy?.accountNumber),
        [SELECTION_PO_KEY]: marker,
    };
};

/** The selection a purchase order was made from (its marker), or null. */
export const selectionOfPo = (data: Record<string, unknown> | null | undefined): SelectionPoMarker | null => {
    const m = data?.[SELECTION_PO_KEY] as Partial<SelectionPoMarker> | undefined;
    return m && m.v === 1 && typeof m.selectionId === 'string' && typeof m.optionId === 'string'
        ? { v: 1, selectionId: m.selectionId, optionId: m.optionId, at: String(m.at ?? '') } : null;
};

// ------------------------------------------------------------------------------------------------ budget
export interface SelectionBudgetItem {
    id: string;
    title: string;
    status: JobSelection['status'];
    optionName: string;
    /** client price of the chosen option (unitPrice × qty) */
    total: number;
    /** cost of the chosen option (unitCost × qty; the client price when no cost is known) */
    cost: number;
    allowance: number | null;
    /** total − allowance: > 0 upgrade, < 0 credit, null without an allowance */
    difference: number | null;
    poDocumentId: string | null;
}

export interface SelectionBudget {
    /** approved (no PO yet): "pending selection", NOT in costing's committed */
    pending: SelectionBudgetItem[];
    pendingCost: number;
    /** ordered with a PO: already counted by costing through the PO (never add again) */
    viaPurchaseOrder: SelectionBudgetItem[];
    /** ordered without a PO in the app (ordered elsewhere): show as information only */
    orderedElsewhere: SelectionBudgetItem[];
    /** sum of positive differences (approved + ordered): extra the client pays */
    upgrades: number;
    /** sum of negative differences as a positive number: what the client gets back */
    credits: number;
    /** upgrades − credits */
    netAllowanceChange: number;
    /** chosen by the client, not approved yet (for "to approve" badges) */
    awaitingApproval: number;
}

export const selectionBudget = (selections: readonly JobSelection[]): SelectionBudget => {
    const out: SelectionBudget = { pending: [], pendingCost: 0, viaPurchaseOrder: [], orderedElsewhere: [], upgrades: 0, credits: 0, netAllowanceChange: 0, awaitingApproval: 0 };
    for (const s of selections) {
        if (s.status === 'chosen') { out.awaitingApproval += 1; continue; }
        if (s.status !== 'approved' && s.status !== 'ordered') continue;
        const o = chosenOption(s);
        if (!o) continue;
        const p = optionPricing(o, s.allowance);
        const item: SelectionBudgetItem = {
            id: s.id, title: s.title, status: s.status, optionName: o.name, total: p.total, cost: p.cost ?? p.total,
            allowance: s.allowance, difference: p.difference, poDocumentId: s.poDocumentId,
        };
        if (s.status === 'approved') { out.pending.push(item); out.pendingCost += item.cost; }
        else if (s.poDocumentId) out.viaPurchaseOrder.push(item);
        else out.orderedElsewhere.push(item);
        if (p.difference !== null) {
            if (p.difference > 0) out.upgrades += p.difference;
            else if (p.difference < 0) out.credits += -p.difference;
        }
    }
    out.pendingCost = roundMoney(out.pendingCost);
    out.upgrades = roundMoney(out.upgrades);
    out.credits = roundMoney(out.credits);
    out.netAllowanceChange = roundMoney(out.upgrades - out.credits);
    return out;
};
