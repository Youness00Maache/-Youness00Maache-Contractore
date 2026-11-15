/**
 * Price list (CSV) into the PRICE BOOK (roadmap N10). Pure: no React, no Supabase. The screen is
 * components/integrations/PriceListImportPanel.tsx; the writes are in components/integrations/priceBookImportApi.ts.
 * It reuses the supplier importer's CSV reader (lib/suppliers/priceListCsv.ts parsePriceList: delimiters, quotes, BOM,
 * title lines, "$1,234.50" / "1.234,50", problems per line) and its price-change maths (lib/suppliers/priceChange.ts).
 *
 *   diffPriceBook(rows, book, field)     each row against the price book, matched by SKU first, then by name:
 *                                          'update'     matched, the price differs (old -> new, % and an up / down flag)
 *                                          'unchanged'  matched, same price
 *                                          'new'        nothing matches: can be added as a new price-book item
 *                                          'unmatched'  can't be used: several items match, the item was already taken by
 *                                                       an earlier row, or (cost lists) no item exists to put the cost on
 *                                        plus `notInList` = price-book items the file doesn't mention (never touched)
 *   defaultSelection / toggleKey / setKind / onlyBigChanges / cleanSelection / reviewSummary   the ticks
 *   planPriceBookApply(diff, ticks, opts)  the writes for the ticked rows, nothing else
 *   priceBackupCsv(diff, ticks, field)   the CURRENT prices of the items about to change, in the importer's own layout:
 *                                        choosing that file in this importer later puts the old prices back (the price
 *                                        book has no change history, so this is the undo)
 *
 * Which price: a list of what you CHARGE changes `rate`; a list of what you PAY (a supplier's) changes `unit_cost`.
 * Kits (assemblies) are never matched: their price comes from their parts.
 */
import { parsePriceList, type ParsedPriceList, type PriceListRow } from '../suppliers/priceListCsv.ts';
import { detectPriceChange, isNotableChange, type PriceChange } from '../suppliers/priceChange.ts';
import { normSku } from '../suppliers/libraryLogic.ts';
import type { PriceBookLibraryItem } from '../suppliers/types.ts';
import { money, toCsv } from '../export/csv.ts';

export { parsePriceList };
export type { ParsedPriceList, PriceListRow };

export type PriceField = 'rate' | 'cost';
export const PRICE_FIELDS: ReadonlyArray<{ id: PriceField; label: string; about: string }> = [
    { id: 'rate', label: 'What I charge', about: 'Selling prices. Changes the price on your documents.' },
    { id: 'cost', label: 'What I pay', about: 'Costs, like a supplier’s list. Changes the cost and your margin, not your selling price.' },
];

export type BookItem = Pick<PriceBookLibraryItem, 'id' | 'name' | 'sku' | 'unit' | 'rate' | 'cost' | 'isAssembly'>;

export type ImportKind = 'update' | 'unchanged' | 'new' | 'unmatched';
export type UnmatchedReason = 'several' | 'taken' | 'cost-list' | 'kit';

export interface ImportChange {
    /** stable key for the review list (the file line) */
    key: string;
    kind: ImportKind;
    row: PriceListRow;
    item: BookItem | null;
    matchedBy: 'sku' | 'name' | null;
    change: PriceChange;
    reason?: UnmatchedReason;
}

export interface PriceBookDiff {
    field: PriceField;
    changes: ImportChange[];
    /** price-book items (not kits) the file does not mention: left as they are */
    notInList: BookItem[];
    counts: Record<ImportKind, number>;
}

/** Names compared the way the app compares names: trimmed, single spaces, case-insensitive. */
const nameKey = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

type Hit = { kind: 'one'; item: BookItem; by: 'sku' | 'name' } | { kind: 'several' } | null;

/** The ONE item with this SKU, else the ONE item with this name. `several` when more than one fits (never guessed). */
const findItem = (row: PriceListRow, items: readonly BookItem[]): Hit => {
    const sku = normSku(row.sku);
    if (sku) {
        const hits = items.filter((i) => normSku(i.sku) === sku);
        if (hits.length === 1) return { kind: 'one', item: hits[0], by: 'sku' };
        if (hits.length > 1) return { kind: 'several' };
    }
    const name = nameKey(row.name);
    if (!name) return null;
    const hits = items.filter((i) => nameKey(i.name) === name);
    if (hits.length === 1) return { kind: 'one', item: hits[0], by: 'name' };
    return hits.length > 1 ? { kind: 'several' } : null;
};

export const priceOf = (item: BookItem, field: PriceField): number => (field === 'rate' ? item.rate : item.cost);

export const diffPriceBook = (rows: readonly PriceListRow[], book: readonly BookItem[], field: PriceField): PriceBookDiff => {
    const items = book.filter((i) => !i.isAssembly);
    const kits = book.filter((i) => i.isAssembly);
    const taken = new Set<string>();
    const counts: Record<ImportKind, number> = { update: 0, unchanged: 0, new: 0, unmatched: 0 };
    const changes: ImportChange[] = rows.map((row) => {
        const key = `line:${row.line}`;
        const hit = findItem(row, items);
        const none = detectPriceChange(null, row.price);
        const finish = (c: ImportChange): ImportChange => { counts[c.kind]++; return c; };
        if (hit?.kind === 'several') return finish({ key, kind: 'unmatched', row, item: null, matchedBy: null, change: none, reason: 'several' });
        if (hit?.kind === 'one') {
            if (taken.has(hit.item.id)) return finish({ key, kind: 'unmatched', row, item: hit.item, matchedBy: hit.by, change: none, reason: 'taken' });
            taken.add(hit.item.id);
            const change = detectPriceChange(priceOf(hit.item, field), row.price);
            return finish({ key, kind: change.flag === 'unchanged' ? 'unchanged' : 'update', row, item: hit.item, matchedBy: hit.by, change });
        }
        // a row for a kit is not added as a second, look-alike item: a kit's price comes from its parts
        if (findItem(row, kits)) return finish({ key, kind: 'unmatched', row, item: null, matchedBy: null, change: none, reason: 'kit' });
        // a cost list can only change costs of items you have: it never invents selling prices
        if (field === 'cost') return finish({ key, kind: 'unmatched', row, item: null, matchedBy: null, change: none, reason: 'cost-list' });
        return finish({ key, kind: 'new', row, item: null, matchedBy: null, change: none });
    });
    return { field, changes, notInList: items.filter((i) => !taken.has(i.id)), counts };
};

// ===================================================================================================== review ticks
/** A price change of at least this many percent is highlighted. */
export const BIG_CHANGE_PCT = 5;

export const changesOfKind = (diff: PriceBookDiff, kind: ImportKind): ImportChange[] => diff.changes.filter((c) => c.kind === kind);
/** Only updates and new items write something. */
export const isWritable = (c: Pick<ImportChange, 'kind'>): boolean => c.kind === 'update' || c.kind === 'new';
export const isBigChange = (c: Pick<ImportChange, 'kind' | 'change'>, minPct = BIG_CHANGE_PCT): boolean => c.kind === 'update' && isNotableChange(c.change, minPct);

/** Price changes are ticked; new items are NOT (adding items is the owner's choice, row by row or all at once). */
export const defaultSelection = (diff: PriceBookDiff): Set<string> => new Set(changesOfKind(diff, 'update').map((c) => c.key));

export const toggleKey = (sel: ReadonlySet<string>, key: string): Set<string> => {
    const next = new Set(sel);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
};

export const setKind = (sel: ReadonlySet<string>, diff: PriceBookDiff, kind: ImportKind, on: boolean): Set<string> => {
    const next = new Set(sel);
    if (!isWritable({ kind })) return next;
    for (const c of changesOfKind(diff, kind)) { if (on) next.add(c.key); else next.delete(c.key); }
    return next;
};

/** Keeps every other tick but ticks only the big price changes among the updates. */
export const onlyBigChanges = (sel: ReadonlySet<string>, diff: PriceBookDiff, minPct = BIG_CHANGE_PCT): Set<string> => {
    const next = new Set(sel);
    for (const c of changesOfKind(diff, 'update')) { if (isBigChange(c, minPct)) next.add(c.key); else next.delete(c.key); }
    return next;
};

export const cleanSelection = (diff: PriceBookDiff, sel: ReadonlySet<string>): Set<string> => {
    const out = new Set<string>();
    for (const c of diff.changes) if (isWritable(c) && sel.has(c.key)) out.add(c.key);
    return out;
};

export interface ReviewSummary { updates: number; newItems: number; writes: number; up: number; down: number; big: number }

export const reviewSummary = (diff: PriceBookDiff, sel: ReadonlySet<string>): ReviewSummary => {
    const s: ReviewSummary = { updates: 0, newItems: 0, writes: 0, up: 0, down: 0, big: 0 };
    for (const c of diff.changes) {
        if (!isWritable(c) || !sel.has(c.key)) continue;
        if (c.kind === 'update') {
            s.updates++;
            if (c.change.flag === 'up') s.up++;
            if (c.change.flag === 'down') s.down++;
            if (isBigChange(c)) s.big++;
        } else s.newItems++;
    }
    s.writes = s.updates + s.newItems;
    return s;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const diffHeadline = (diff: PriceBookDiff): string => {
    const c = diff.counts;
    return [
        c.update ? `${plural(c.update, 'price')} changed` : '',
        c.new ? `${plural(c.new, 'new item')}` : '',
        c.unmatched ? `${c.unmatched} not usable` : '',
        c.unchanged ? `${c.unchanged} unchanged` : '',
    ].filter(Boolean).join(', ') || 'Nothing to import';
};

export const summaryText = (s: ReviewSummary): string => {
    const parts = [s.updates ? plural(s.updates, 'price update') : '', s.newItems ? plural(s.newItems, 'new item') : ''].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Nothing ticked';
};

export const UNMATCHED_TEXT: Record<UnmatchedReason, string> = {
    several: 'More than one price-book item has this SKU or name, so it was not guessed.',
    taken: 'An earlier row already matched this item.',
    'cost-list': 'Not in your price book. A cost list only changes items you already have.',
    kit: 'This is a kit. Its price comes from its parts, so an import never changes it.',
};

// ============================================================================================================= apply
export type NewItemType = 'service' | 'material' | 'labor';
export const NEW_ITEM_TYPES: ReadonlyArray<{ id: NewItemType; label: string }> = [
    { id: 'service', label: 'Services' }, { id: 'material', label: 'Materials' }, { id: 'labor', label: 'Labor' },
];

export interface PriceBookWrites {
    /** price changes of existing items: only the one price field is sent */
    updates: Array<{ id: string; name: string; patch: Record<string, number>; before: number; after: number }>;
    /** new items (the price book's own create fields; the id and owner are added when saving) */
    inserts: Array<Record<string, unknown>>;
}

export const planPriceBookApply = (diff: PriceBookDiff, selected: ReadonlySet<string>, opts: { newItemType?: NewItemType } = {}): PriceBookWrites => {
    const out: PriceBookWrites = { updates: [], inserts: [] };
    const sel = cleanSelection(diff, selected);
    for (const c of diff.changes) {
        if (!sel.has(c.key)) continue;
        if (c.kind === 'update' && c.item) {
            const column = diff.field === 'rate' ? 'rate' : 'unit_cost';
            out.updates.push({ id: c.item.id, name: c.item.name, patch: { [column]: c.row.price }, before: priceOf(c.item, diff.field), after: c.row.price });
        } else if (c.kind === 'new' && diff.field === 'rate') {
            // the same fields the price book's Add dialog saves
            out.inserts.push({
                name: c.row.name, description: null, sku: c.row.sku || null, category: 'General', type: opts.newItemType || 'service', unit: c.row.unit || null,
                taxable: true, rate: c.row.price, unit_cost: 0, markup: 0, images: [], is_assembly: false, assembly_items: [],
            });
        }
    }
    return out;
};

export interface ApplyOutcome { updated: number; created: number; queued: number; failed: ReadonlyArray<{ name: string; error: string }> }

export const applyOutcomeText = (r: ApplyOutcome): string => {
    const done = [r.updated ? `${plural(r.updated, 'price')} updated` : '', r.created ? `${plural(r.created, 'item')} added` : ''].filter(Boolean).join(' and ') || 'Nothing was changed';
    const waiting = r.queued ? ` ${r.queued === 1 ? 'It is' : `${r.queued} are`} saved on this device and will sync when you are back online.` : '';
    const failed = r.failed.length ? ` ${plural(r.failed.length, 'item')} could not be saved.` : '';
    return `${done}.${waiting}${failed}`;
};

// ============================================================================================================ backup
/** "Old prices" file: SKU, Description, Unit, Price: the layout this importer reads, so importing it undoes the import. */
export const BACKUP_HEADER = ['SKU', 'Description', 'Unit', 'Price'] as const;

export const priceBackupCsv = (diff: PriceBookDiff, selected: ReadonlySet<string>): string => {
    const sel = cleanSelection(diff, selected);
    const rows = diff.changes.filter((c) => c.kind === 'update' && c.item && sel.has(c.key))
        .map((c) => [c.item!.sku, c.item!.name, c.item!.unit, money(priceOf(c.item!, diff.field))]);
    return toCsv([...BACKUP_HEADER], rows);
};

export const priceBackupFileName = (field: PriceField, today: string): string =>
    `ContractorDocs-old-${field === 'rate' ? 'prices' : 'costs'}-before-import-${today}.csv`;
