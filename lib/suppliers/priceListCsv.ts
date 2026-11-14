/**
 * Supplier price-list import (roadmap D4). Pure: no React, no Supabase. Three steps, each reviewable:
 *
 *   1. parsePriceList(text)       CSV text -> rows {sku, name, unit, price}. Handles a BOM, CRLF, quoted fields with
 *                                 commas / newlines / doubled quotes, comma / semicolon / tab delimiters, title lines
 *                                 above the header (the header is the first of the first 15 lines that names a price
 *                                 column and an item / description or SKU column), currency symbols and codes,
 *                                 thousand separators ("1,234.50", "1.234,50", "1 234,50"), blank lines. Rows without a
 *                                 usable price are reported in `problems`, never guessed.
 *   2. diffPriceList(rows, ctx)   rows vs the supplier's catalogue (supplier_items of that supplier) and the price book:
 *                                 match by SKU, then by name (normalized). Each row becomes one change:
 *                                   'update'    in the catalogue, price differs (with the PriceChange: up / down %)
 *                                   'unchanged' in the catalogue, same price
 *                                   'add'       not in the catalogue, but matches a price-book item (will be linked)
 *                                   'unmatched' matches nothing (can still be added as a new catalogue item)
 *                                 plus `notInList` = catalogue items missing from the file (flag 'removed'; never deleted).
 *   3. planPriceListApply(diff)   the writes to perform for the changes the user kept (inserts + price updates). The
 *                                 database step is applyPriceListWrites in suppliersDb.ts.
 */
import { normName } from '../suppliers.ts';
import { detectPriceChange, type PriceChange } from './priceChange.ts';
import { matchBySkuOrName, normSku, SUPPLIER_ITEM_LIMITS } from './libraryLogic.ts';
import type { PriceBookLibraryItem, SupplierItemInput, SupplierItemRecord } from './types.ts';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

export const PRICE_LIST_MAX_ROWS = 5000;

// =====================================================================================================================
// CSV
// =====================================================================================================================
/** The delimiter used on the first non-empty line (outside quotes): comma, semicolon or tab. */
export const sniffDelimiter = (text: string): ',' | ';' | '\t' => {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    let seen = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') inQ = !inQ;
        else if (!inQ && (c === '\n' || c === '\r')) { if (seen) break; }
        else if (!inQ && (c === ',' || c === ';' || c === '\t')) { counts[c]++; seen = true; }
        else if (!inQ && c.trim()) seen = true;
    }
    // first line may be a title without delimiters: look at the whole text then
    if (!counts[','] && !counts[';'] && !counts['\t']) {
        for (const c of text) if (c === ',' || c === ';' || c === '\t') counts[c]++;
    }
    if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) return '\t';
    return counts[';'] > counts[','] ? ';' : ',';
};

/** RFC 4180 CSV -> rows of cells (BOM stripped, CRLF / LF / CR, quoted fields, "" = one quote). */
export const parseCsv = (input: string, delimiter?: ',' | ';' | '\t'): string[][] => {
    const text = input.replace(/^﻿/, '');
    const d = delimiter || sniffDelimiter(text);
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
            } else cell += c;
            continue;
        }
        if (c === '"' && !cell.trim()) { cell = ''; inQ = true; }
        else if (c === d) { row.push(cell); cell = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((x) => x.trim()));
};

/**
 * A price from a spreadsheet cell, or null. Currency symbols / codes and spaces are ignored. When both "," and "."
 * appear, the last one is the decimal mark. A lone "," is a decimal mark when 1-2 digits follow it ("12,5"), else a
 * thousands separator ("1,234"). Several "." with no "," are thousands ("1.234.567"). Negative or empty = null.
 */
export const parsePrice = (raw: unknown): number | null => {
    let s = str(raw);
    if (!s) return null;
    if (/^\(.*\)$/.test(s) || /^-|-\s*$|^[^\d]*-/.test(s)) return null; // negative
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return null;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
        const dec = lastComma > lastDot ? ',' : '.';
        const thou = dec === ',' ? '.' : ',';
        s = s.split(thou).join('').replace(dec, '.');
    } else if (lastComma >= 0) {
        const parts = s.split(',');
        s = parts.length === 2 && /^\d{1,2}$/.test(parts[1]) ? `${parts[0]}.${parts[1]}` : parts.join('');
    } else if (lastDot >= 0 && s.indexOf('.') !== lastDot) {
        s = s.split('.').join('');
    }
    if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= SUPPLIER_ITEM_LIMITS.maxPrice ? Math.round(n * 10000) / 10000 : null;
};

// =====================================================================================================================
// Header sniffing
// =====================================================================================================================
export interface PriceListColumns {
    sku: number | null;
    name: number | null;
    unit: number | null;
    price: number;
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
const SKU_HEADERS = ['sku', 'item code', 'code', 'item #', 'item no', 'item number', 'part #', 'part no', 'part number', 'part', 'product code', 'article', 'article number', 'catalog #', 'catalog number', 'cat #', 'model', 'model #', 'ref', 'reference', 'upc', 'mpn'];
const NAME_HEADERS = ['name', 'item name', 'product name', 'product', 'description', 'item description', 'product description', 'desc', 'title', 'item', 'material'];
const UNIT_HEADERS = ['unit', 'uom', 'u m', 'unit of measure', 'units', 'per', 'pack', 'unit type'];
const PRICE_HEADERS = ['price', 'unit price', 'your price', 'net price', 'net', 'cost', 'unit cost', 'price each', 'each', 'rate', 'list price', 'sell price', 'contractor price', 'price ea', 'amount'];

const findCol = (keys: string[], wanted: string[], taken: Set<number>): number | null => {
    for (const w of wanted) {
        const i = keys.findIndex((k, idx) => !taken.has(idx) && k === key(w));
        if (i >= 0) return i;
    }
    // looser: a header that starts with a wanted word ("price (usd)", "description of goods")
    for (const w of wanted) {
        if (w.length < 4) continue;
        const i = keys.findIndex((k, idx) => !taken.has(idx) && k.startsWith(`${key(w)} `));
        if (i >= 0) return i;
    }
    return null;
};

/** Columns of a header row, or null when it has no price column or no item / SKU column. */
export const sniffColumns = (header: readonly string[]): PriceListColumns | null => {
    const keys = header.map((h) => key(str(h)));
    const taken = new Set<number>();
    const price = findCol(keys, PRICE_HEADERS, taken);
    if (price === null) return null;
    taken.add(price);
    let sku = findCol(keys, SKU_HEADERS, taken);
    if (sku !== null) taken.add(sku);
    let name = findCol(keys, NAME_HEADERS, taken);
    if (name !== null) taken.add(name);
    // "Item, Description, Price": Item is the supplier's code, Description the name
    if (sku === null && name !== null && keys[name] !== 'item') {
        const itemCol = keys.findIndex((k, idx) => !taken.has(idx) && k === 'item');
        if (itemCol >= 0) { sku = itemCol; taken.add(itemCol); }
    }
    if (sku === null && name === null) return null;
    const unit = findCol(keys, UNIT_HEADERS, taken);
    return { sku, name, unit, price };
};

// =====================================================================================================================
// Rows
// =====================================================================================================================
export interface PriceListRow {
    /** 1-based line in the file (for the review list) */
    line: number;
    sku: string;
    name: string;
    unit: string;
    price: number;
}

export interface PriceListProblem {
    line: number;
    reason: 'no-price' | 'no-name' | 'duplicate' | 'too-many-rows';
    text: string;
}

export interface ParsedPriceList {
    rows: PriceListRow[];
    problems: PriceListProblem[];
    columns: PriceListColumns | null;
    /** the whole file can't be used (readable sentence) */
    error?: string;
}

export const parsePriceList = (text: string): ParsedPriceList => {
    const cells = parseCsv(String(text || ''));
    let headerAt = -1;
    let columns: PriceListColumns | null = null;
    for (let i = 0; i < Math.min(cells.length, 15); i++) {
        const c = sniffColumns(cells[i]);
        if (c) { headerAt = i; columns = c; break; }
    }
    if (!columns) {
        return { rows: [], problems: [], columns: null, error: 'No header row found. The file needs a price column and an item, description or SKU column.' };
    }
    const rows: PriceListRow[] = [];
    const problems: PriceListProblem[] = [];
    const seen = new Set<string>();
    const at = (r: string[], i: number | null) => (i === null ? '' : str(r[i]).replace(/\s+/g, ' '));
    for (let i = headerAt + 1; i < cells.length; i++) {
        const r = cells[i];
        if (!r.some((x) => str(x))) continue;
        const line = i + 1;
        const sku = at(r, columns.sku).slice(0, SUPPLIER_ITEM_LIMITS.sku);
        const name = at(r, columns.name).slice(0, SUPPLIER_ITEM_LIMITS.name);
        const preview = r.filter(Boolean).join(' | ').slice(0, 120);
        if (!sku && !name) { problems.push({ line, reason: 'no-name', text: preview }); continue; }
        const price = parsePrice(r[columns.price]);
        if (price === null) { problems.push({ line, reason: 'no-price', text: preview }); continue; }
        const dupKey = sku ? `s:${normSku(sku)}` : `n:${normName(name)}`;
        if (seen.has(dupKey)) { problems.push({ line, reason: 'duplicate', text: preview }); continue; }
        if (rows.length >= PRICE_LIST_MAX_ROWS) { problems.push({ line, reason: 'too-many-rows', text: preview }); break; }
        seen.add(dupKey);
        rows.push({ line, sku, name: name || sku, unit: at(r, columns.unit).slice(0, SUPPLIER_ITEM_LIMITS.unit), price });
    }
    return { rows, problems, columns };
};

// =====================================================================================================================
// Diff against the catalogue + price book
// =====================================================================================================================
export type PriceListChangeKind = 'add' | 'update' | 'unchanged' | 'unmatched';

export interface PriceListChange {
    /** stable key for the review list (the file line) */
    key: string;
    kind: PriceListChangeKind;
    row: PriceListRow;
    /** the catalogue item it matched (update / unchanged) */
    supplierItem: SupplierItemRecord | null;
    /** the price-book item it matched (by the catalogue link, else SKU / name) */
    priceBookItem: PriceBookLibraryItem | null;
    matchedBy: 'sku' | 'name' | null;
    change: PriceChange;
}

export interface PriceListDiff {
    supplierId: string;
    changes: PriceListChange[];
    /** catalogue items of this supplier missing from the file (flag 'removed'; nothing is deleted) */
    notInList: Array<{ supplierItem: SupplierItemRecord; change: PriceChange }>;
    counts: Record<PriceListChangeKind, number>;
}

export const diffPriceList = (
    rows: readonly PriceListRow[],
    ctx: { supplierId: string; supplierItems: readonly SupplierItemRecord[]; priceBook: readonly PriceBookLibraryItem[] },
): PriceListDiff => {
    const catalogue = ctx.supplierItems.filter((si) => si.supplierId === ctx.supplierId);
    const book = ctx.priceBook.filter((p) => !p.isAssembly);
    const bookById = new Map(book.map((p) => [p.id, p]));
    const used = new Set<string>();
    const counts: Record<PriceListChangeKind, number> = { add: 0, update: 0, unchanged: 0, unmatched: 0 };
    const changes: PriceListChange[] = rows.map((row) => {
        const m = matchBySkuOrName(row, catalogue.filter((c) => !used.has(c.id)));
        if (m) {
            used.add(m.item.id);
            const change = detectPriceChange(m.item.unitPrice, row.price);
            const kind: PriceListChangeKind = change.flag === 'unchanged' ? 'unchanged' : 'update';
            counts[kind]++;
            return {
                key: `line:${row.line}`, kind, row, supplierItem: m.item,
                priceBookItem: (m.item.savedItemId && bookById.get(m.item.savedItemId)) || null, matchedBy: m.by, change,
            };
        }
        const b = matchBySkuOrName(row, book);
        const kind: PriceListChangeKind = b ? 'add' : 'unmatched';
        counts[kind]++;
        return { key: `line:${row.line}`, kind, row, supplierItem: null, priceBookItem: b?.item || null, matchedBy: b?.by || null, change: detectPriceChange(null, row.price) };
    });
    const notInList = catalogue.filter((c) => !used.has(c.id)).map((c) => ({ supplierItem: c, change: detectPriceChange(c.unitPrice, null) }));
    return { supplierId: ctx.supplierId, changes, notInList, counts };
};

// =====================================================================================================================
// Apply: the writes for the kept changes
// =====================================================================================================================
export interface PriceListWrites {
    supplierId: string;
    /** new catalogue items (create input for createSupplierItem) */
    inserts: SupplierItemInput[];
    /** price (and empty sku / unit filled) of existing catalogue items */
    updates: Array<{ id: string; patch: SupplierItemInput }>;
}

/**
 * Writes for the changes the user kept. `selected` = keys to apply (default: every add / update, and unmatched rows
 * when `addUnmatched`, default true). 'unchanged' rows never write. Adds link the matched price-book item.
 */
export const planPriceListApply = (
    diff: PriceListDiff, opts: { selected?: Iterable<string>; addUnmatched?: boolean } = {},
): PriceListWrites => {
    const pick = opts.selected ? new Set(opts.selected) : null;
    const addUnmatched = opts.addUnmatched !== false;
    const out: PriceListWrites = { supplierId: diff.supplierId, inserts: [], updates: [] };
    for (const c of diff.changes) {
        if (pick && !pick.has(c.key)) continue;
        if (c.kind === 'update' && c.supplierItem) {
            const patch: SupplierItemInput = { unitPrice: c.row.price };
            if (!c.supplierItem.sku && c.row.sku) patch.sku = c.row.sku;
            if (!c.supplierItem.unit && c.row.unit) patch.unit = c.row.unit;
            out.updates.push({ id: c.supplierItem.id, patch });
        } else if (c.kind === 'add' || (c.kind === 'unmatched' && (addUnmatched || pick))) {
            out.inserts.push({
                supplierId: diff.supplierId, name: c.row.name, sku: c.row.sku, unit: c.row.unit, unitPrice: c.row.price,
                savedItemId: c.priceBookItem?.id || null,
            });
        }
    }
    return out;
};
