/**
 * Price-list import, the REVIEW step (roadmap D4, phase B). Pure: no React, no Supabase. The screen
 * (components/suppliers/PriceListImport.tsx) keeps the user's choices here; nothing is written until the user clicks
 * Apply, and only the rows still ticked are written (planPriceListApply in priceListCsv.ts).
 *
 *   defaultSelection(diff)           price changes and matches with the price book are ticked; rows that matched
 *                                    nothing are NOT (adding them as new catalogue items is the user's choice)
 *   toggleKey / setKind / onlyNotableUpdates   change the ticks (always a new Set)
 *   cleanSelection(diff, sel)        only keys that exist in this diff and can be written
 *   reviewSummary(diff, sel)         what Apply would do: counts, ups / downs, notable ones
 *   isNotableRow(change)             an update of 5 % or more (the highlighted rows)
 *   applySummaryText(result)         the sentence shown after Apply
 */
import { isNotableChange } from './priceChange.ts';
import { planPriceListApply, type PriceListChange, type PriceListChangeKind, type PriceListDiff } from './priceListCsv.ts';

/** A price change of at least this many percent is highlighted in the review. */
export const NOTABLE_PCT = 5;

export const changesOfKind = (diff: PriceListDiff, kind: PriceListChangeKind): PriceListChange[] => diff.changes.filter((c) => c.kind === kind);

/** Only rows that would write something can be ticked ('unchanged' never writes). */
export const isWritable = (c: Pick<PriceListChange, 'kind'>): boolean => c.kind !== 'unchanged';

export const isNotableRow = (c: Pick<PriceListChange, 'kind' | 'change'>, minPct = NOTABLE_PCT): boolean =>
    c.kind === 'update' && isNotableChange(c.change, minPct);

export const defaultSelection = (diff: PriceListDiff): Set<string> =>
    new Set(diff.changes.filter((c) => c.kind === 'update' || c.kind === 'add').map((c) => c.key));

export const toggleKey = (sel: ReadonlySet<string>, key: string): Set<string> => {
    const next = new Set(sel);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
};

/** Tick / untick every row of one kind. */
export const setKind = (sel: ReadonlySet<string>, diff: PriceListDiff, kind: PriceListChangeKind, on: boolean): Set<string> => {
    const next = new Set(sel);
    if (!isWritable({ kind })) return next;
    for (const c of changesOfKind(diff, kind)) { if (on) next.add(c.key); else next.delete(c.key); }
    return next;
};

/** Keep every other tick, but tick only the notable price changes among the updates. */
export const onlyNotableUpdates = (sel: ReadonlySet<string>, diff: PriceListDiff, minPct = NOTABLE_PCT): Set<string> => {
    const next = new Set(sel);
    for (const c of changesOfKind(diff, 'update')) { if (isNotableRow(c, minPct)) next.add(c.key); else next.delete(c.key); }
    return next;
};

/** The ticks that still mean something for this diff (unknown keys and 'unchanged' rows dropped). */
export const cleanSelection = (diff: PriceListDiff, sel: ReadonlySet<string>): Set<string> => {
    const out = new Set<string>();
    for (const c of diff.changes) if (isWritable(c) && sel.has(c.key)) out.add(c.key);
    return out;
};

export interface ReviewSummary {
    /** catalogue prices that will change */
    updates: number;
    /** items that will be added and linked to a price-book item */
    adds: number;
    /** items that matched nothing and will be added as new catalogue items (ticked by hand) */
    newItems: number;
    /** updates + adds + newItems = what Apply writes */
    writes: number;
    /** ticked updates that go up / down */
    up: number;
    down: number;
    /** ticked updates of 5 % or more */
    notable: number;
}

export const reviewSummary = (diff: PriceListDiff, sel: ReadonlySet<string>): ReviewSummary => {
    const s: ReviewSummary = { updates: 0, adds: 0, newItems: 0, writes: 0, up: 0, down: 0, notable: 0 };
    for (const c of diff.changes) {
        if (!isWritable(c) || !sel.has(c.key)) continue;
        if (c.kind === 'update') {
            s.updates++;
            if (c.change.flag === 'up') s.up++;
            if (c.change.flag === 'down') s.down++;
            if (isNotableRow(c)) s.notable++;
        } else if (c.kind === 'add') s.adds++;
        else s.newItems++;
    }
    s.writes = s.updates + s.adds + s.newItems;
    return s;
};

/** The writes Apply performs for the current ticks (same plan the database step runs). */
export const writesForSelection = (diff: PriceListDiff, sel: ReadonlySet<string>) =>
    planPriceListApply(diff, { selected: cleanSelection(diff, sel) });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "12 prices changed, 3 items to add, 2 not matched, 40 unchanged" for the top of the review. */
export const diffHeadline = (diff: PriceListDiff): string => {
    const c = diff.counts;
    return [
        c.update ? `${plural(c.update, 'price')} changed` : '',
        c.add ? `${plural(c.add, 'match')} with your price book` : '',
        c.unmatched ? `${plural(c.unmatched, 'row')} not matched` : '',
        c.unchanged ? `${c.unchanged} unchanged` : '',
    ].filter(Boolean).join(', ') || 'Nothing to import';
};

/** What Apply would do, in words (the Apply button's label / the line above it). */
export const summaryText = (s: ReviewSummary): string => {
    const parts = [
        s.updates ? plural(s.updates, 'price update') : '',
        s.adds ? `${plural(s.adds, 'item')} linked to your price book` : '',
        s.newItems ? `${plural(s.newItems, 'new item')}` : '',
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Nothing ticked';
};

export interface ApplyOutcome {
    inserted: number;
    updated: number;
    failed: ReadonlyArray<{ id: string; error: string }>;
}

/** The sentence shown after Apply. */
export const applySummaryText = (r: ApplyOutcome): string => {
    const parts = [r.updated ? `${plural(r.updated, 'price')} updated` : '', r.inserted ? `${plural(r.inserted, 'item')} added` : ''].filter(Boolean);
    const done = parts.length ? parts.join(' and ') : 'Nothing was changed';
    return r.failed.length ? `${done}. ${plural(r.failed.length, 'item')} could not be updated.` : `${done}.`;
};
