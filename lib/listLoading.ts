/**
 * Loads a whole list page by page (PARITY_V2 C2): the App's jobs / clients / inventory / price book lists feed the
 * pickers (price book and inventory in documents, clients in the job form and Duplicate job), and the original app
 * loaded everything, so these lists must never stop silently at a fixed number of rows. Pure (the query is passed
 * in), so scripts/data-fidelity-check.ts can test it.
 */

export const LIST_PAGE_SIZE = 1000;
/** Safety stop far above any real account (the old caps were 300 / 500 / 1000). */
export const LIST_MAX_ROWS = 50000;

export interface AllRowsResult<T> {
    rows: T[];
    /** error of the page that failed (rows holds the pages loaded before it) */
    error: unknown;
    /** stopped at maxRows */
    truncated: boolean;
}

/**
 * `page(from, to)` must return rows `from..to` (inclusive) of a stable order (order by a unique column last).
 * Stops at the first short page.
 */
export async function fetchAllRows<T>(
    page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
    opts: { pageSize?: number; maxRows?: number } = {},
): Promise<AllRowsResult<T>> {
    const pageSize = Math.max(1, Math.floor(opts.pageSize ?? LIST_PAGE_SIZE));
    const maxRows = Math.max(pageSize, Math.floor(opts.maxRows ?? LIST_MAX_ROWS));
    const rows: T[] = [];
    for (let from = 0; from < maxRows; from += pageSize) {
        const { data, error } = await page(from, Math.min(from + pageSize, maxRows) - 1);
        if (error) return { rows, error, truncated: false };
        const list = data || [];
        rows.push(...list);
        if (list.length < pageSize) return { rows, error: null, truncated: false };
    }
    return { rows, error: null, truncated: true };
}
