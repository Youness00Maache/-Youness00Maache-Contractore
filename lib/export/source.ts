/**
 * Where "Export everything" reads the account from. The export only talks to this interface, so the same code runs
 * against Supabase in the app (supabaseSource.ts) and against generated data in scripts/export-check.ts.
 *
 * Everything is read page by page: a big account never has more than one page of documents in memory.
 */
import type {
    ExportCategoryRow, ExportClientRow, ExportDocRow, ExportHistoryRow, ExportInventoryRow, ExportJobRow, ExportPriceItemRow,
    ExportQuoteRequestRow, ExportReminderRow,
} from './model.ts';

export interface ExportTables {
    jobs: ExportJobRow;
    clients: ExportClientRow;
    inventory: ExportInventoryRow;
    inventory_history: ExportHistoryRow;
    saved_items: ExportPriceItemRow;
    price_book_categories: ExportCategoryRow;
    reminders: ExportReminderRow;
    quote_requests: ExportQuoteRequestRow;
}
export type ExportTable = keyof ExportTables;

export interface ExportSource {
    /** Number of documents (for the progress bar); null when it can't be counted. */
    countDocuments(): Promise<number | null>;
    /** Every row of a table, oldest first, `pageSize` at a time. Throws MissingTableError for a table the account doesn't have yet. */
    pages<T extends ExportTable>(table: T, pageSize: number): AsyncGenerator<ExportTables[T][]>;
    /** Every document with its full data, oldest first, `pageSize` at a time. */
    documentPages(pageSize: number): AsyncGenerator<ExportDocRow[]>;
    /** Some documents with their full data (for the PDFs); missing ids are simply absent. */
    documentsByIds(ids: string[]): Promise<ExportDocRow[]>;
}

/** The table isn't in this database yet (a feature whose migration hasn't been applied). */
export class MissingTableError extends Error {
    constructor(readonly table: string) {
        super(`${table} is not available yet`);
        this.name = 'MissingTableError';
    }
}
