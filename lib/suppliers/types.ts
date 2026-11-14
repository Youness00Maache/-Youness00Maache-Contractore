/**
 * Suppliers + product library (roadmap D4): the data shapes the UI uses. No logic here.
 *
 * Where everything lives (migration supabase/migrations/20261116000200_suppliers_library.sql, NOT applied until the
 * owner's OK; until then lib/suppliers/suppliersFeature.ts reports 'missing' and the app keeps the old behaviour):
 *   SupplierRecord        public.suppliers            (archived instead of deleted; legacyKey = id in the old list)
 *   SupplierItemRecord    public.supplier_items       (priceHistory is written by the database trigger only)
 *   PriceBookLibraryItem  public.saved_items          (price book; new optional columns url, specs, supplier_id)
 *   the OLD supplier list public.user_settings 'suppliers.list' (lib/suppliers.ts `Supplier`) stays untouched; it is
 *                         copied into public.suppliers once (importLegacySuppliers in suppliersDb.ts).
 * All fields are camelCase here; lib/suppliers/libraryLogic.ts maps database rows both ways.
 */

export interface SupplierRecord {
    id: string;
    name: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    website: string;
    accountNumber: string;
    paymentTerms: string;
    notes: string;
    /** typical days from order to delivery; null = unknown */
    leadTimeDays: number | null;
    preferred: boolean;
    archived: boolean;
    /** id of the old settings-list entry this row came from (null = created in the new list) */
    legacyKey: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Fields the user can set on a supplier (create / update). Omitted = unchanged on update. */
export type SupplierInput = Partial<Omit<SupplierRecord, 'id' | 'createdAt' | 'updatedAt'>>;

/** One entry of a supplier item's price history (oldest first in the list). */
export interface PriceHistoryEntry {
    price: number;
    at: string;
}

export interface SupplierItemRecord {
    id: string;
    supplierId: string;
    /** linked price-book item (public.saved_items.id) or null */
    savedItemId: string | null;
    sku: string;
    name: string;
    unit: string;
    unitPrice: number;
    url: string;
    notes: string;
    /** when the price last changed (set by the database) */
    lastPriceAt: string | null;
    /** every price this item had, oldest first (last 100), set by the database */
    priceHistory: PriceHistoryEntry[];
    createdAt: string;
    updatedAt: string;
}

/** Fields the user can set on a supplier item. supplierId is required on create. */
export type SupplierItemInput = Partial<Pick<SupplierItemRecord, 'supplierId' | 'savedItemId' | 'sku' | 'name' | 'unit' | 'unitPrice' | 'url' | 'notes'>>;

/** Price-book item as the product library sees it (subset of public.saved_items). */
export interface PriceBookLibraryItem {
    id: string;
    name: string;
    sku: string;
    unit: string;
    /** selling price (saved_items.rate) */
    rate: number;
    /** cost (saved_items.unit_cost, else the older `cost`) */
    cost: number;
    /** markup % (saved_items.markup) or null */
    markup: number | null;
    /** product page link (new column) */
    url: string;
    /** product specs, label -> value (new column) */
    specs: Record<string, string> | null;
    /** preferred supplier (new column) */
    supplierId: string | null;
    isAssembly: boolean;
}

/** Fields the product library writes on a price-book item (only these three new columns). */
export interface PriceBookLibraryPatch {
    url?: string | null;
    specs?: Record<string, string> | null;
    supplierId?: string | null;
}

/** 'ready' = tables exist; 'missing' = migration not applied (feature hidden, old list used); 'unknown' = not checked yet. */
export type SuppliersFeatureState = 'unknown' | 'ready' | 'missing';
