/**
 * Price-change detection for supplier prices (roadmap D4). Pure: no React, no Supabase.
 *
 *   detectPriceChange(old, new)   flag 'up' | 'down' | 'new' | 'removed' | 'unchanged', the difference and the %
 *                                 (null when the old price is 0: a % of nothing means nothing)
 *   latestPriceChange(history)    the last change in a supplier item's price history (oldest-first list)
 *   isNotableChange(change, pct)  up / down by at least `pct` % (default 5): the "price changed" badge
 *
 * Prices closer than half a cent count as the same price (numeric(14,4) round trips, CSV rounding).
 */
import type { PriceHistoryEntry } from './types.ts';

export type PriceFlag = 'up' | 'down' | 'new' | 'removed' | 'unchanged';

export interface PriceChange {
    flag: PriceFlag;
    oldPrice: number | null;
    newPrice: number | null;
    /** new - old (null unless both prices are known) */
    delta: number | null;
    /** % change against the old price, 1 decimal (null unless both known and old > 0) */
    pct: number | null;
}

export const PRICE_EPSILON = 0.005;

const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const detectPriceChange = (oldPrice: unknown, newPrice: unknown): PriceChange => {
    const o = num(oldPrice);
    const n = num(newPrice);
    if (o === null && n === null) return { flag: 'unchanged', oldPrice: null, newPrice: null, delta: null, pct: null };
    if (o === null) return { flag: 'new', oldPrice: null, newPrice: n, delta: null, pct: null };
    if (n === null) return { flag: 'removed', oldPrice: o, newPrice: null, delta: null, pct: null };
    const delta = round4(n - o);
    const pct = o > 0 ? Math.round((delta / o) * 1000) / 10 : null;
    if (Math.abs(delta) < PRICE_EPSILON) return { flag: 'unchanged', oldPrice: o, newPrice: n, delta: 0, pct: o > 0 ? 0 : null };
    return { flag: delta > 0 ? 'up' : 'down', oldPrice: o, newPrice: n, delta, pct };
};

/** Clean history entries (bad ones dropped), oldest first. */
export const parsePriceHistory = (raw: unknown): PriceHistoryEntry[] => {
    if (!Array.isArray(raw)) return [];
    const out: PriceHistoryEntry[] = [];
    for (const e of raw) {
        if (!e || typeof e !== 'object') continue;
        const r = e as Record<string, unknown>;
        const price = num(r.price);
        const at = typeof r.at === 'string' && Number.isFinite(Date.parse(r.at)) ? r.at : '';
        if (price === null || price < 0 || !at) continue;
        out.push({ price, at });
    }
    return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
};

/**
 * The most recent price change in a history (previous entry vs last entry). One entry only = 'new'; empty =
 * 'unchanged' with no prices. `at` = when the last price was set.
 */
export const latestPriceChange = (history: readonly PriceHistoryEntry[]): PriceChange & { at: string | null } => {
    const h = parsePriceHistory(history);
    if (!h.length) return { ...detectPriceChange(null, null), at: null };
    const last = h[h.length - 1];
    if (h.length === 1) return { ...detectPriceChange(null, last.price), at: last.at };
    return { ...detectPriceChange(h[h.length - 2].price, last.price), at: last.at };
};

/** Up or down by at least `minPct` % (a change from 0 always counts). */
export const isNotableChange = (change: PriceChange, minPct = 5): boolean => {
    if (change.flag !== 'up' && change.flag !== 'down') return false;
    return change.pct === null ? true : Math.abs(change.pct) >= minPct;
};

/** Short label for a badge: "+12.5%", "-3%", "New", "Removed", "" (unchanged). */
export const priceChangeLabel = (change: PriceChange): string => {
    switch (change.flag) {
        case 'new': return 'New';
        case 'removed': return 'Removed';
        case 'unchanged': return '';
        default: return change.pct === null ? (change.flag === 'up' ? 'Up' : 'Down') : `${change.pct > 0 ? '+' : ''}${change.pct}%`;
    }
};
