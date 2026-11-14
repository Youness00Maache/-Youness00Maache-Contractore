/**
 * Saved suppliers for a screen (public.user_settings 'suppliers.list', lib/suppliersApi.ts). The list is loaded once
 * per mount; `persist` saves the whole list and returns where it went (account / this device).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSuppliers, saveSuppliers } from '../../lib/suppliersApi.ts';
import type { Supplier } from '../../lib/suppliers.ts';
import type { SyncMode } from '../../lib/userData.ts';

export function useSuppliers() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loaded, setLoaded] = useState(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        loadSuppliers().then((list) => {
            if (!mounted.current) return;
            setSuppliers(list);
            setLoaded(true);
        });
        return () => { mounted.current = false; };
    }, []);

    const persist = useCallback(async (next: Supplier[]): Promise<SyncMode> => {
        const mode = await saveSuppliers(next);
        if (mounted.current) setSuppliers(next);
        return mode;
    }, []);

    return { suppliers, loaded, persist };
}

/** Message after a save that didn't reach the account. */
export const syncNote = (mode: SyncMode): string | null =>
    mode === 'account' ? null : mode === 'failed' ? 'Not saved.' : 'Saved on this device; it goes to your account when the connection is back.';
