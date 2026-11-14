/**
 * Saved suppliers for a screen. Two sources, same result shape:
 *   - the OLD list (public.user_settings 'suppliers.list', lib/suppliersApi.ts): used until the suppliers table exists
 *     (and while offline when it was not loaded yet), exactly as before;
 *   - the suppliers table (roadmap D4, lib/suppliers/suppliersDb.ts) once the database has it: richer records, archive
 *     instead of delete. The old list is copied into it once; the old list itself is never changed.
 * `suppliers` / `persist` keep the old shape either way, so the purchase order and reorder code are unchanged:
 * `persist(list)` turns the old-style list into table writes (create / update / archive) when the table is in use.
 * `table` is non-null only then: the new Suppliers screen (SupplierBook.tsx) and the catalogue use it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadSuppliers, saveSuppliers } from '../../lib/suppliersApi.ts';
import type { Supplier } from '../../lib/suppliers.ts';
import type { SyncMode } from '../../lib/userData.ts';
import { NEEDS_CONNECTION, isBrowserOffline } from '../../lib/offline/connection.ts';
import { archiveSupplier, createSupplier, importLegacySuppliers, listSuppliers, SUPPLIERS_NOT_READY, updateSupplier } from '../../lib/suppliers/suppliersDb.ts';
import { markSuppliersMissing } from '../../lib/suppliers/suppliersFeature.ts';
import { recordToLegacy, suppliersToShow } from '../../lib/suppliers/libraryLogic.ts';
import { isEmptyTablePlan, suppliersTableDiff } from '../../lib/suppliers/libraryView.ts';
import type { SupplierInput, SupplierRecord } from '../../lib/suppliers/types.ts';
import { useOnline, useSuppliersReady } from './supplierHooks.ts';
import { invalidateSupplierLibrary } from './libraryCache.ts';

/** The suppliers table as the screens use it (every write needs a connection). */
export interface SuppliersTable {
    /** every row, archived ones included */
    records: SupplierRecord[];
    reload: () => Promise<SupplierRecord[]>;
    create: (input: SupplierInput) => Promise<SupplierRecord>;
    update: (id: string, input: SupplierInput) => Promise<SupplierRecord>;
    archive: (id: string, archived?: boolean) => Promise<SupplierRecord>;
}

/** Rows of the last load in this tab, so a screen opened again does not flicker back to the old list. */
let cachedRecords: SupplierRecord[] | null = null;

export function useSuppliers() {
    const [legacy, setLegacy] = useState<Supplier[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [records, setRecords] = useState<SupplierRecord[] | null>(() => cachedRecords);
    const mounted = useRef(true);
    const feature = useSuppliersReady();
    const online = useOnline();

    useEffect(() => {
        mounted.current = true;
        loadSuppliers().then((list) => {
            if (!mounted.current) return;
            setLegacy(list);
            setLoaded(true);
        });
        return () => { mounted.current = false; };
    }, []);

    const reload = useCallback(async (): Promise<SupplierRecord[]> => {
        const rows = await listSuppliers({ includeArchived: true });
        invalidateSupplierLibrary();
        cachedRecords = rows;
        if (mounted.current) setRecords(rows);
        return rows;
    }, []);

    // the tables exist: copy the old list once, then use the table
    useEffect(() => {
        if (feature !== 'ready' || !online) return;
        let active = true;
        (async () => {
            try {
                await importLegacySuppliers().catch(() => undefined);
                if (active) await reload();
            } catch (e) {
                if (e instanceof Error && e.message === SUPPLIERS_NOT_READY) {
                    cachedRecords = null;
                    markSuppliersMissing();
                    if (active && mounted.current) setRecords(null);
                }
                // anything else (a dropped connection): keep what is shown
            }
        })();
        return () => { active = false; };
    }, [feature, online, reload]);

    const tableMode = feature === 'ready' && records !== null;
    const recordsRef = useRef(records);
    recordsRef.current = records;
    const tableModeRef = useRef(tableMode);
    tableModeRef.current = tableMode;

    const suppliers = useMemo<Supplier[]>(
        () => (tableMode && records ? suppliersToShow('ready', records, []).suppliers.map(recordToLegacy) : legacy),
        [tableMode, records, legacy],
    );

    const persist = useCallback(async (next: Supplier[]): Promise<SyncMode> => {
        if (tableModeRef.current && recordsRef.current) {
            if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
            const plan = suppliersTableDiff(recordsRef.current, next);
            for (const input of plan.create) await createSupplier(input);
            for (const u of plan.update) await updateSupplier(u.id, u.input);
            for (const id of plan.archive) await archiveSupplier(id);
            if (!isEmptyTablePlan(plan)) await reload();
            return 'account';
        }
        const mode = await saveSuppliers(next);
        if (mounted.current) setLegacy(next);
        return mode;
    }, [reload]);

    const table = useMemo<SuppliersTable | null>(() => (tableMode && records ? {
        records,
        reload,
        create: async (input) => { const r = await createSupplier(input); await reload(); return r; },
        update: async (id, input) => { const r = await updateSupplier(id, input); await reload(); return r; },
        archive: async (id, archived = true) => { const r = await archiveSupplier(id, archived); await reload(); return r; },
    } : null), [tableMode, records, reload]);

    return { suppliers, loaded, persist, table };
}

/** Message after a save that didn't reach the account. */
export const syncNote = (mode: SyncMode): string | null =>
    mode === 'account' ? null : mode === 'failed' ? 'Not saved.' : 'Saved on this device; it goes to your account when the connection is back.';
