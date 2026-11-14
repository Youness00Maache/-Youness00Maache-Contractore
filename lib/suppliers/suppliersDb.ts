/**
 * Database side of suppliers + product library (roadmap D4). Logic and data shapes: lib/suppliers/libraryLogic.ts,
 * lib/suppliers/types.ts. Tables from supabase/migrations/20261116000200_suppliers_library.sql (NOT applied until the
 * owner's OK): until they exist, probeSuppliersBackend() says 'missing', loadSuppliersToShow() returns the old
 * settings list, and every write here throws SUPPLIERS_NOT_READY (the UI keeps the feature hidden meanwhile:
 * lib/suppliers/suppliersFeature.ts).
 *
 * Offline: every write needs a connection (NEEDS_CONNECTION; registered in lib/offline/writePathAudit.ts). The old
 * settings list (lib/suppliersApi.ts) still works offline as before.
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, isBrowserOffline } from '../offline/connection.ts';
import { describeError } from '../account.ts';
import { loadSuppliers as loadLegacySuppliers } from '../suppliersApi.ts';
import {
    SUPPLIER_COLUMNS, SUPPLIER_ITEM_COLUMNS, mapPriceBookRow, mapSupplierItemRow, mapSupplierRow, planLegacyImport, priceBookPatchToRow,
    supplierInputToRow, supplierItemInputToRow, suppliersToShow, type SuppliersToShow,
} from './libraryLogic.ts';
import type { PriceListWrites } from './priceListCsv.ts';
import type {
    PriceBookLibraryItem, PriceBookLibraryPatch, SupplierInput, SupplierItemInput, SupplierItemRecord, SupplierRecord,
} from './types.ts';

export const SUPPLIERS_NOT_READY = 'Suppliers are not set up in your account yet.';

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

/** The table / column / function isn't in the database (migration not applied). */
export const isSuppliersBackendMissing = (e: DbError): boolean => {
    if (!e) return false;
    if (['42P01', '42703', 'PGRST205', 'PGRST204', 'PGRST200'].includes(String(e.code || ''))) return true;
    return /does not exist|could not find the (table|column)|schema cache/i.test(`${e.message || ''} ${e.details || ''} ${e.hint || ''}`);
};

const needOnline = () => { if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION); };

const fail = (error: DbError, fallback: string): never => {
    if (isSuppliersBackendMissing(error)) throw new Error(SUPPLIERS_NOT_READY);
    throw new Error(describeError(error, fallback));
};

// ---------------------------------------------------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------------------------------------------------
/** 'ready' when both tables exist, 'missing' when not (feature hidden), 'error' when unknown (offline...). */
export async function probeSuppliersBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const [a, b] = await Promise.all([
            supabase.from('suppliers').select('id').limit(1),
            supabase.from('supplier_items').select('id').limit(1),
        ]);
        if (!a.error && !b.error) return 'ready';
        return isSuppliersBackendMissing(a.error) || isSuppliersBackendMissing(b.error) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------------------------------------------------
export async function listSuppliers(opts: { includeArchived?: boolean } = {}): Promise<SupplierRecord[]> {
    let q = supabase.from('suppliers').select(SUPPLIER_COLUMNS).order('name', { ascending: true }).limit(2000);
    if (!opts.includeArchived) q = q.eq('archived', false);
    const { data, error } = await q;
    if (error) fail(error, 'Could not load your suppliers.');
    return ((data || []) as unknown as Record<string, unknown>[]).map(mapSupplierRow);
}

export async function createSupplier(input: SupplierInput): Promise<SupplierRecord> {
    needOnline();
    const row = supplierInputToRow(input, true);
    const { data, error } = await supabase.from('suppliers').insert(row).select(SUPPLIER_COLUMNS).single();
    if (error) fail(error, 'The supplier could not be saved.');
    return mapSupplierRow(data as unknown as Record<string, unknown>);
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<SupplierRecord> {
    needOnline();
    const row = supplierInputToRow(input);
    const { data, error } = await supabase.from('suppliers').update(row).eq('id', id).select(SUPPLIER_COLUMNS).single();
    if (error) fail(error, 'The supplier could not be saved.');
    return mapSupplierRow(data as unknown as Record<string, unknown>);
}

/** Archive (hide) or restore a supplier. Suppliers are never deleted from the app: old orders keep their name. */
export const archiveSupplier = (id: string, archived = true): Promise<SupplierRecord> => updateSupplier(id, { archived });

// ---------------------------------------------------------------------------------------------------------------------
// Old settings list -> table (once, idempotent)
// ---------------------------------------------------------------------------------------------------------------------
let importDone = false;

/**
 * Copies the old settings supplier list into public.suppliers: one row per old entry (legacy_key = its old id), skipped
 * when already imported or when a supplier with the same name exists. The old list is only read, never changed.
 * Safe to call on every load (runs once per page session; a parallel run on another device is ignored: unique key).
 */
export async function importLegacySuppliers(): Promise<{ imported: number; skipped: number }> {
    if (importDone) return { imported: 0, skipped: 0 };
    needOnline();
    const legacy = await loadLegacySuppliers();
    if (!legacy.length) { importDone = true; return { imported: 0, skipped: 0 }; }
    const existing = await listSuppliers({ includeArchived: true });
    const plan = planLegacyImport(legacy, existing);
    let imported = 0;
    for (const input of plan) {
        const legacyRow = supplierInputToRow(input, true);
        const { error } = await supabase.from('suppliers').insert(legacyRow);
        if (!error) imported++;
        else if (String(error.code) !== '23505') fail(error, 'Your saved suppliers could not be copied.');
    }
    importDone = true;
    return { imported, skipped: legacy.length - imported };
}

/**
 * The suppliers a screen shows: public.suppliers rows when the tables exist (the old list is imported first, once),
 * else the old settings list (source 'legacy'). Never throws for a missing backend.
 */
export async function loadSuppliersToShow(opts: { includeArchived?: boolean } = {}): Promise<SuppliersToShow> {
    const state = await probeSuppliersBackend();
    if (state === 'ready') {
        try {
            if (!isBrowserOffline()) await importLegacySuppliers().catch(() => undefined);
            return suppliersToShow('ready', await listSuppliers({ includeArchived: true }), [], opts);
        } catch { /* fall back to the old list below */ }
    }
    return suppliersToShow('missing', null, await loadLegacySuppliers(), opts);
}

// ---------------------------------------------------------------------------------------------------------------------
// Supplier items (catalogue)
// ---------------------------------------------------------------------------------------------------------------------
/** Catalogue items: of one supplier, or linked to one price-book item, or all (max 20000). */
export async function listSupplierItems(filter: { supplierId?: string; savedItemId?: string } = {}): Promise<SupplierItemRecord[]> {
    const rows: SupplierItemRecord[] = [];
    const page = 1000;
    for (let from = 0; from < 20000; from += page) {
        let q = supabase.from('supplier_items').select(SUPPLIER_ITEM_COLUMNS).order('name', { ascending: true }).range(from, from + page - 1);
        if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId);
        if (filter.savedItemId) q = q.eq('saved_item_id', filter.savedItemId);
        const { data, error } = await q;
        if (error) fail(error, 'Could not load the supplier items.');
        rows.push(...((data || []) as unknown as Record<string, unknown>[]).map(mapSupplierItemRow));
        if (!data || data.length < page) break;
    }
    return rows;
}

export async function createSupplierItem(input: SupplierItemInput): Promise<SupplierItemRecord> {
    needOnline();
    const row = supplierItemInputToRow(input, true);
    const { data, error } = await supabase.from('supplier_items').insert(row).select(SUPPLIER_ITEM_COLUMNS).single();
    if (error) fail(error, 'The item could not be saved.');
    return mapSupplierItemRow(data as unknown as Record<string, unknown>);
}

/** A price change is recorded in the item's price history by the database. */
export async function updateSupplierItem(id: string, input: SupplierItemInput): Promise<SupplierItemRecord> {
    needOnline();
    const row = supplierItemInputToRow(input);
    const { data, error } = await supabase.from('supplier_items').update(row).eq('id', id).select(SUPPLIER_ITEM_COLUMNS).single();
    if (error) fail(error, 'The item could not be saved.');
    return mapSupplierItemRow(data as unknown as Record<string, unknown>);
}

export async function deleteSupplierItem(id: string): Promise<void> {
    needOnline();
    const { error } = await supabase.from('supplier_items').delete().eq('id', id);
    if (error) fail(error, 'The item could not be deleted.');
}

/** Link a catalogue item to a price-book item (null = unlink). */
export const linkSupplierItemToPriceBook = (supplierItemId: string, savedItemId: string | null): Promise<SupplierItemRecord> =>
    updateSupplierItem(supplierItemId, { savedItemId });

// ---------------------------------------------------------------------------------------------------------------------
// Price book (saved_items): product-library fields only
// ---------------------------------------------------------------------------------------------------------------------
/** Price-book items as the library sees them (non-kit and kit), max 10000. */
export async function listPriceBookLibrary(): Promise<PriceBookLibraryItem[]> {
    const rows: PriceBookLibraryItem[] = [];
    const page = 1000;
    for (let from = 0; from < 10000; from += page) {
        const { data, error } = await supabase.from('saved_items').select('*').order('name', { ascending: true }).range(from, from + page - 1);
        if (error) throw new Error(describeError(error, 'Could not load your price book.'));
        rows.push(...((data || []) as Record<string, unknown>[]).map(mapPriceBookRow));
        if (!data || data.length < page) break;
    }
    return rows;
}

/** Sets url / specs / preferred supplier on a price-book item (only these new columns are written). */
export async function updatePriceBookLibraryFields(savedItemId: string, patch: PriceBookLibraryPatch): Promise<void> {
    needOnline();
    const row = priceBookPatchToRow(patch);
    if (!Object.keys(row).length) return;
    const { error } = await supabase.from('saved_items').update(row).eq('id', savedItemId);
    if (error) fail(error, 'The price-book item could not be saved.');
}

/** Preferred supplier of a price-book item (null = none). */
export const setPriceBookItemSupplier = (savedItemId: string, supplierId: string | null): Promise<void> =>
    updatePriceBookLibraryFields(savedItemId, { supplierId });

// ---------------------------------------------------------------------------------------------------------------------
// Price-list import: perform the writes planned by planPriceListApply (priceListCsv.ts)
// ---------------------------------------------------------------------------------------------------------------------
export interface PriceListApplyResult {
    inserted: number;
    updated: number;
    /** updates that failed (the rest went through) */
    failed: Array<{ id: string; error: string }>;
}

export async function applyPriceListWrites(writes: PriceListWrites): Promise<PriceListApplyResult> {
    needOnline();
    const result: PriceListApplyResult = { inserted: 0, updated: 0, failed: [] };
    const rows = writes.inserts.map((i) => supplierItemInputToRow({ ...i, supplierId: writes.supplierId }, true));
    for (let k = 0; k < rows.length; k += 500) {
        const chunk = rows.slice(k, k + 500);
        const { error } = await supabase.from('supplier_items').insert(chunk);
        if (error) fail(error, 'The new items could not be added.');
        result.inserted += chunk.length;
    }
    for (const u of writes.updates) {
        try {
            await updateSupplierItem(u.id, u.patch);
            result.updated++;
        } catch (e) {
            result.failed.push({ id: u.id, error: e instanceof Error ? e.message : String(e) });
        }
    }
    return result;
}
