/**
 * ExportSource on Supabase: the signed-in user's rows (row-level security already limits every query to the owner;
 * the explicit user_id filter uses the per-user indexes). Pages are retried a few times so a short network drop
 * doesn't end a long export. Never checks the plan: export works on every plan and after cancelling.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError } from '../userDataSync.ts';
import type { ExportDocRow } from './model.ts';
import { MissingTableError, type ExportSource, type ExportTable, type ExportTables } from './source.ts';

/** Only the columns the CSVs use: never portal keys, approval tokens or Gmail data. */
const COLUMNS: Record<ExportTable, string> = {
    jobs: 'id, name, client_id, client_name, client_address, start_date, end_date, status, worker_name, created_at',
    clients: 'id, name, email, phone, address, notes, created_at',
    inventory: 'id, name, sku, category, unit, quantity, cost_price, low_stock_threshold, supplier, location, is_assembly, assembly_items, created_at',
    inventory_history: 'id, item_id, item_name, action, quantity_change, quantity_after, notes, job_id, document_id, source, created_at',
    saved_items: 'id, name, description, rate, unit_cost, unit, category, category_id, type, taxable, sku, markup, is_assembly, is_favorite, last_used_at, use_count, created_at',
    price_book_categories: 'id, name, parent_id, created_at',
    reminders: 'id, kind, document_id, job_id, step_key, scheduled_for, status, reason, to_email, subject, sent_at, last_error, created_at',
    quote_requests: 'id, name, phone, email, address, details, photo_paths, source, status, job_id, converted_at, created_at',
};
const DOCUMENT_COLUMNS = 'id, job_id, client_id, type, created_at, updated_at, data';
/** Fallback when an older database lacks one of the optional document columns. */
const DOCUMENT_COLUMNS_MIN = 'id, job_id, type, created_at, data';

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null;

const isMissingColumn = (e: DbError) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist/i.test(`${e.message || ''}`));
/** Worth another try: no answer (network), a timeout, or the database being busy. Not permission or SQL errors. */
const isTransient = (e: DbError) => !!e && (!e.code || /^(08|53|57)/.test(e.code) || /fetch|network|timeout|temporar/i.test(`${e.message || ''}`));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs one read, retrying network / server hiccups twice (a long export shouldn't end on one dropped request). */
async function withRetry<T>(run: () => PromiseLike<{ data: T | null; error: DbError }>, tries = 3): Promise<{ data: T | null; error: DbError }> {
    let last: { data: T | null; error: DbError } = { data: null, error: { message: 'Not run' } };
    for (let attempt = 0; attempt < tries; attempt++) {
        try {
            last = await run();
        } catch (e) {
            last = { data: null, error: { message: (e as Error)?.message || 'Network error' } };
        }
        if (!last.error || !isTransient(last.error)) return last;
        if (attempt < tries - 1) await sleep(800 * (attempt + 1) ** 2);
    }
    return last;
}

const readable = (e: DbError, what: string) =>
    new Error(`Could not read ${what}: ${e?.message || 'no answer from the server'}.${isTransient(e) ? ' Check your connection and try again.' : ''}`);

export const createSupabaseExportSource = (supabase: SupabaseClient, userId: string): ExportSource => {
    async function* pagesOf<T>(table: string, columns: string, pageSize: number, fallbackColumns = '*'): AsyncGenerator<T[]> {
        let cols = columns;
        for (let from = 0; ; from += pageSize) {
            let res = await withRetry<T[]>(() => supabase.from(table).select(cols).eq('user_id', userId)
                .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + pageSize - 1) as any);
            if (res.error && isMissingColumn(res.error) && cols !== fallbackColumns) {
                cols = fallbackColumns;
                res = await withRetry<T[]>(() => supabase.from(table).select(cols).eq('user_id', userId)
                    .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + pageSize - 1) as any);
            }
            if (res.error) {
                if (isMissingTableError(res.error)) throw new MissingTableError(table);
                throw readable(res.error, table.replace(/_/g, ' '));
            }
            const rows = (res.data || []) as T[];
            if (rows.length) yield rows;
            if (rows.length < pageSize) return;
        }
    }

    return {
        async countDocuments() {
            const res = await withRetry<unknown>(() => supabase.from('documents').select('id', { count: 'exact', head: true }).eq('user_id', userId)
                .then((r: any) => ({ data: r.count ?? null, error: r.error })));
            return res.error ? null : (typeof res.data === 'number' ? res.data : null);
        },
        pages<T extends ExportTable>(table: T, pageSize: number) {
            return pagesOf<ExportTables[T]>(table, COLUMNS[table], pageSize);
        },
        documentPages(pageSize: number) {
            return pagesOf<ExportDocRow>('documents', DOCUMENT_COLUMNS, pageSize, DOCUMENT_COLUMNS_MIN);
        },
        async documentsByIds(ids: string[]) {
            if (!ids.length) return [];
            let res = await withRetry<ExportDocRow[]>(() => supabase.from('documents').select(DOCUMENT_COLUMNS).in('id', ids) as any);
            if (res.error && isMissingColumn(res.error)) res = await withRetry<ExportDocRow[]>(() => supabase.from('documents').select(DOCUMENT_COLUMNS_MIN).in('id', ids) as any);
            if (res.error) throw readable(res.error, 'documents');
            return (res.data || []) as ExportDocRow[];
        },
    };
};
