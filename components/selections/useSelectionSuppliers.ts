/**
 * The account's saved suppliers (and, for the purchase order, the price book + supplier catalogues) for the selection
 * editor's supplier picker and the "Create purchase order" window. Used only when the suppliers table is in the database
 * ('ready', roadmap D4); until then it returns nothing and the picker stays hidden.
 *
 *   const lib = useSelectionSuppliers(userId, enabled, { withCatalogue: true });
 *   lib.suppliers   SupplierRecord[] (not archived)   lib.items / lib.book   catalogue rows (only with withCatalogue)
 *   lib.loading     true until the first answer
 */
import { useEffect, useState } from 'react';
import { loadSupplierLibrary } from '../suppliers/libraryCache.ts';
import { listPriceBookLibrary } from '../../lib/suppliers/suppliersDb.ts';
import { useSuppliersFeature } from '../../lib/suppliers/suppliersFeature.ts';
import type { PriceBookLibraryItem, SupplierItemRecord, SupplierRecord } from '../../lib/suppliers/types.ts';

export interface SelectionSuppliers {
    suppliers: SupplierRecord[];
    items: SupplierItemRecord[];
    book: PriceBookLibraryItem[];
    loading: boolean;
    /** the suppliers table exists: the picker can be shown */
    available: boolean;
}

const NONE: SelectionSuppliers = { suppliers: [], items: [], book: [], loading: false, available: false };

export function useSelectionSuppliers(userId: string, enabled: boolean, opts: { withCatalogue?: boolean } = {}): SelectionSuppliers {
    const feature = useSuppliersFeature(userId, true);
    const [state, setState] = useState<SelectionSuppliers>(NONE);
    const withCatalogue = !!opts.withCatalogue;
    useEffect(() => {
        if (!enabled || feature !== 'ready' || !userId) { setState(NONE); return; }
        let alive = true;
        setState(s => ({ ...s, loading: true, available: true }));
        (async () => {
            try {
                const lib = await loadSupplierLibrary(userId);
                const book = withCatalogue ? await listPriceBookLibrary().catch(() => [] as PriceBookLibraryItem[]) : [];
                if (alive) setState({ suppliers: lib.suppliers.filter(s => !s.archived), items: withCatalogue ? lib.items : [], book, loading: false, available: true });
            } catch {
                if (alive) setState({ ...NONE, available: false });
            }
        })();
        return () => { alive = false; };
    }, [enabled, feature, userId, withCatalogue]);
    return state;
}
