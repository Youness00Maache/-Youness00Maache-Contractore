/**
 * Suppliers + product library checks (roadmap D4). Pure logic + a static scan of the migration; no browser, no
 * network, no database:
 *   npx tsx scripts/supplier-library-check.ts
 *
 *  1. price-change detection (up / down / new / removed / unchanged, %, history)
 *  2. CSV parsing (delimiters, quotes, BOM, title lines, header sniffing, prices with currency / thousand separators)
 *  3. price-list diff (sku then name, add / update / unchanged / unmatched, not in list) + apply plan
 *  4. row mapping, old supplier list import (idempotent), which suppliers to show
 *  5. cheapest supplier, margin impact, PO pre-fill, reorder supplier suggestion
 *  6. migration lint (additive, RLS owner-only, functions, saved_items limited to 3 ADD COLUMN IF NOT EXISTS)
 *  7. wiring (offline audit, old files untouched in shape, no forbidden words)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectPriceChange, isNotableChange, latestPriceChange, parsePriceHistory, priceChangeLabel } from '../lib/suppliers/priceChange.ts';
import { diffPriceList, parseCsv, parsePrice, parsePriceList, planPriceListApply, sniffColumns, sniffDelimiter } from '../lib/suppliers/priceListCsv.ts';
import {
    cheapestSupplierFor, legacyToRecord, mapPriceBookRow, mapSupplierItemRow, mapSupplierRow, marginImpact, matchBySkuOrName, normSku,
    planLegacyImport, prefillPoLines, priceBookPatchToRow, recordToLegacy, suggestSupplierForInventoryItem, supplierInputToRow,
    supplierItemInputToRow, suppliersToShow, type PoLineLike,
} from '../lib/suppliers/libraryLogic.ts';
import type { PriceBookLibraryItem, SupplierItemRecord, SupplierRecord } from '../lib/suppliers/types.ts';
import type { Supplier } from '../lib/suppliers.ts';
import { WRITE_PATHS } from '../lib/offline/writePathAudit.ts';
import {
    NOTABLE_PCT, applySummaryText, cleanSelection, defaultSelection, diffHeadline, isNotableRow, onlyNotableUpdates, reviewSummary, setKind, summaryText,
    toggleKey, writesForSelection,
} from '../lib/suppliers/priceListReview.ts';
import {
    filterCatalogue, hasLibraryPatch, historyRows, impactSentence, isEmptyTablePlan, isWebUrl, libraryDraftFromItem, libraryPatch, normalizeUrl, prefillPoForm,
    productHints, reorderPriceFills, rowsToSpecs, specProblem, specsToRows, sparkline, suggestForReorderGroup, suppliersTableDiff, urlProblem,
} from '../lib/suppliers/libraryView.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let passed = 0;
let failed = 0;
const check = (name: string, ok: unknown, detail?: unknown) => {
    if (ok) { passed++; return; }
    failed++;
    console.error(`FAIL ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
};
const eq = (name: string, a: unknown, b: unknown) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

// ---------------------------------------------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------------------------------------------
const sup = (id: string, name: string, extra: Partial<SupplierRecord> = {}): SupplierRecord => ({
    ...mapSupplierRow({ id, name, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }), ...extra,
});
const item = (id: string, supplierId: string, name: string, price: number, extra: Partial<SupplierItemRecord> = {}): SupplierItemRecord => ({
    ...mapSupplierItemRow({ id, supplier_id: supplierId, name, unit_price: price }), ...extra,
});
const book = (id: string, name: string, extra: Partial<PriceBookLibraryItem> = {}): PriceBookLibraryItem => ({
    ...mapPriceBookRow({ id, name, rate: 100, unit_cost: 60, markup: 66.7 }), ...extra,
});

// ---------------------------------------------------------------------------------------------------------------
// 1. price changes
// ---------------------------------------------------------------------------------------------------------------
{
    const up = detectPriceChange(10, 12.5);
    eq('up flag', [up.flag, up.delta, up.pct], ['up', 2.5, 25]);
    const down = detectPriceChange(20, 15);
    eq('down flag', [down.flag, down.delta, down.pct], ['down', -5, -25]);
    eq('new', detectPriceChange(null, 5).flag, 'new');
    eq('removed', detectPriceChange(5, undefined).flag, 'removed');
    eq('unchanged within half a cent', detectPriceChange(10, 10.004).flag, 'unchanged');
    eq('both unknown = unchanged', detectPriceChange(null, null).flag, 'unchanged');
    eq('from 0: no %', detectPriceChange(0, 3).pct, null);
    eq('string prices', detectPriceChange('4.00', '5').flag, 'up');
    check('notable >= 5%', isNotableChange(detectPriceChange(100, 105)) && !isNotableChange(detectPriceChange(100, 104)));
    check('from 0 always notable', isNotableChange(detectPriceChange(0, 1)));
    eq('labels', [priceChangeLabel(up), priceChangeLabel(down), priceChangeLabel(detectPriceChange(null, 1)), priceChangeLabel(detectPriceChange(1, 1))], ['+25%', '-25%', 'New', '']);
    const hist = parsePriceHistory([{ price: 12, at: '2026-03-01T00:00:00Z' }, { price: 10, at: '2026-01-01T00:00:00Z' }, { price: 'x', at: 'bad' }, null]);
    eq('history cleaned + sorted', hist.map((h) => h.price), [10, 12]);
    const last = latestPriceChange(hist);
    eq('latest change', [last.flag, last.pct, last.at], ['up', 20, '2026-03-01T00:00:00Z']);
    eq('single entry = new', latestPriceChange([{ price: 3, at: '2026-01-01T00:00:00Z' }]).flag, 'new');
    eq('empty history', latestPriceChange([]).flag, 'unchanged');
}

// ---------------------------------------------------------------------------------------------------------------
// 2. CSV
// ---------------------------------------------------------------------------------------------------------------
{
    eq('delimiter comma', sniffDelimiter('a,b,c\n1,2,3'), ',');
    eq('delimiter semicolon', sniffDelimiter('a;b;c\n"1,5";2;3'), ';');
    eq('delimiter tab', sniffDelimiter('a\tb\tc'), '\t');
    eq('quoted fields', parseCsv('name,price\n"Screws, 2"" box",4.50\n'), [['name', 'price'], ['Screws, 2" box', '4.50']]);
    eq('newline inside quotes + CRLF', parseCsv('a,b\r\n"line1\nline2",2\r\n'), [['a', 'b'], ['line1\nline2', '2']]);
    eq('BOM stripped', parseCsv('﻿sku,price')[0][0], 'sku');
    eq('trailing row without newline', parseCsv('a,b\n1,2').length, 2);

    eq('price plain', parsePrice('12.5'), 12.5);
    eq('price $ + thousands', parsePrice('$1,234.56'), 1234.56);
    eq('price EU', parsePrice('1.234,56 €'), 1234.56);
    eq('price space thousands', parsePrice('1 234,50'), 1234.5);
    eq('price decimal comma', parsePrice('12,5'), 12.5);
    eq('price thousands comma', parsePrice('1,234'), 1234);
    eq('price many dots', parsePrice('1.234.567'), 1234567);
    eq('price currency code', parsePrice('USD 99'), 99);
    eq('price £', parsePrice('£0.99'), 0.99);
    eq('price empty', parsePrice(''), null);
    eq('price text', parsePrice('call us'), null);
    eq('price negative', parsePrice('-4'), null);
    eq('price parentheses', parsePrice('(4.00)'), null);

    eq('columns basic', sniffColumns(['SKU', 'Description', 'Unit', 'Price']), { sku: 0, name: 1, unit: 2, price: 3 });
    eq('columns Item + Description: item is the code', sniffColumns(['Item', 'Description', 'UOM', 'Unit Price']), { sku: 0, name: 1, unit: 2, price: 3 });
    eq('columns name only', sniffColumns(['Product Name', 'Net Price']), { sku: null, name: 0, unit: null, price: 1 });
    eq('columns loose header', sniffColumns(['Part Number', 'Description of goods', 'Price (USD)']), { sku: 0, name: 1, unit: null, price: 2 });
    eq('no price column', sniffColumns(['sku', 'name']), null);

    const csv = [
        'Acme Supply - price list 2026',
        '',
        'Item Code;Description;U/M;Your Price',
        'AB-100;"2x4 stud, 8 ft";ea;"4,25"',
        'AB-200;Drywall 1/2";sheet;12,90',
        ';;;',
        'AB-300;Joint compound;bucket;call',
        ';No sku item;box;1.234,00',
        'AB-100;Duplicate stud;ea;5',
    ].join('\n');
    const parsed = parsePriceList(csv);
    eq('title line skipped, header found', parsed.columns, { sku: 0, name: 1, unit: 2, price: 3 });
    eq('rows', parsed.rows.map((r) => [r.sku, r.name, r.unit, r.price]), [
        ['AB-100', '2x4 stud, 8 ft', 'ea', 4.25], ['AB-200', 'Drywall 1/2"', 'sheet', 12.9], ['', 'No sku item', 'box', 1234],
    ]);
    eq('problems', parsed.problems.map((p) => [p.line, p.reason]), [[7, 'no-price'], [9, 'duplicate']]);
    eq('row lines', parsed.rows.map((r) => r.line), [4, 5, 8]);
    check('no header -> error', !!parsePriceList('hello\nworld').error);
    check('empty file -> error', !!parsePriceList('').error);
    eq('sku only row: name = sku', parsePriceList('sku,price\nX-1,3').rows[0].name, 'X-1');
}

// ---------------------------------------------------------------------------------------------------------------
// 3. diff + apply
// ---------------------------------------------------------------------------------------------------------------
{
    eq('normSku', normSku(' ab-12 3/x '), 'ab123x');
    const catalogue = [
        item('i1', 's1', '2x4 Stud 8ft', 4, { sku: 'AB100' }),
        item('i2', 's1', 'Drywall 1/2"', 12.9, { savedItemId: 'b2' }),
        item('i3', 's1', 'Old thing', 7),
        item('i9', 's2', 'Other supplier stud', 1, { sku: 'AB-200' }),
    ];
    const pb = [book('b2', 'Drywall 1/2"'), book('b5', 'Primer gallon', { sku: 'PR-5' }), book('k1', 'Kit', { isAssembly: true, sku: 'KIT' })];
    const rows = parsePriceList('sku,description,unit,price\nAB-100,Stud,ea,4.25\n,Drywall 1/2",sheet,12.90\npr5,Primer,gal,30\nZZ-9,Mystery,ea,1\nKIT,Kit,ea,9').rows;
    const diff = diffPriceList(rows, { supplierId: 's1', supplierItems: catalogue, priceBook: pb });
    eq('kinds', diff.changes.map((c) => c.kind), ['update', 'unchanged', 'add', 'unmatched', 'unmatched']);
    eq('update matched by sku ignoring dashes', [diff.changes[0].matchedBy, diff.changes[0].change.flag, diff.changes[0].change.pct], ['sku', 'up', 6.3]);
    eq('unchanged matched by name, price-book link shown', [diff.changes[1].matchedBy, diff.changes[1].priceBookItem?.id], ['name', 'b2']);
    eq('add links the price-book item', diff.changes[2].priceBookItem?.id, 'b5');
    eq('kits never matched', diff.changes[4].priceBookItem, null);
    eq('other supplier items ignored', diff.changes.some((c) => c.supplierItem?.id === 'i9'), false);
    eq('not in list', diff.notInList.map((n) => [n.supplierItem.id, n.change.flag]), [['i3', 'removed']]);
    eq('counts', diff.counts, { add: 1, update: 1, unchanged: 1, unmatched: 2 });

    const all = planPriceListApply(diff);
    eq('apply: updates', all.updates, [{ id: 'i1', patch: { unitPrice: 4.25, unit: 'ea' } }]);
    eq('apply: inserts', all.inserts.map((i) => [i.name, i.sku, i.unitPrice, i.savedItemId, i.supplierId]), [
        ['Primer', 'pr5', 30, 'b5', 's1'], ['Mystery', 'ZZ-9', 1, null, 's1'], ['Kit', 'KIT', 9, null, 's1'],
    ]);
    eq('apply: unmatched skipped on request', planPriceListApply(diff, { addUnmatched: false }).inserts.length, 1);
    const sel = planPriceListApply(diff, { selected: [diff.changes[0].key, diff.changes[3].key] });
    eq('apply: only selected', [sel.updates.length, sel.inserts.map((i) => i.name)], [1, ['Mystery']]);
    eq('apply: unchanged never writes', planPriceListApply(diff, { selected: [diff.changes[1].key] }), { supplierId: 's1', inserts: [], updates: [] });

    const amb = [item('a', 's1', 'Same', 1), item('b', 's1', 'same ', 2)];
    eq('ambiguous name -> no match', matchBySkuOrName({ name: 'SAME' }, amb), null);
}

// ---------------------------------------------------------------------------------------------------------------
// 4. mapping, old list import, which suppliers to show
// ---------------------------------------------------------------------------------------------------------------
{
    const r = mapSupplierRow({ id: 'x', name: ' Acme ', lead_time_days: '3', preferred: true, legacy_key: 's_abc', archived: null });
    eq('supplier row mapped', [r.name, r.leadTimeDays, r.preferred, r.archived, r.legacyKey, r.email], ['Acme', 3, true, false, 's_abc', '']);
    eq('supplier input -> row', supplierInputToRow({ name: '  Bob  Supply ', email: 'A@B.COM', phone: '', leadTimeDays: 999, preferred: true }),
        { name: 'Bob Supply', email: 'a@b.com', phone: null, lead_time_days: 365, preferred: true });
    let threw = false;
    try { supplierInputToRow({ name: '  ' }, true); } catch { threw = true; }
    check('empty name refused', threw);
    eq('update patch only given fields', supplierInputToRow({ archived: true }), { archived: true });

    const ir = mapSupplierItemRow({ id: 'i', supplier_id: 's', name: 'N', unit_price: '3.5000', price_history: [{ price: 3, at: '2026-01-01T00:00:00Z' }, { price: 3.5, at: '2026-02-01T00:00:00Z' }] });
    eq('item row mapped', [ir.unitPrice, ir.priceHistory.length, ir.savedItemId], [3.5, 2, null]);
    const itemRow = supplierItemInputToRow({ supplierId: 's', name: 'N', unitPrice: 2.123456, sku: '' }, true);
    eq('item input -> row (no history sent)', itemRow, { supplier_id: 's', name: 'N', sku: null, unit_price: 2.1235 });
    threw = false;
    try { supplierItemInputToRow({ unitPrice: -1 }); } catch { threw = true; }
    check('negative price refused', threw);

    const pbr = mapPriceBookRow({ id: 'p', name: 'P', rate: '150', unit_cost: null, cost: 80, markup: 87.5, specs: { Width: 12, bad: { x: 1 } }, supplier_id: 's1', url: ' https://x.y ' });
    eq('price book row mapped', [pbr.cost, pbr.rate, pbr.markup, pbr.specs, pbr.supplierId, pbr.url], [80, 150, 87.5, { Width: '12' }, 's1', 'https://x.y']);
    eq('price book patch: only the 3 columns', priceBookPatchToRow({ url: '', specs: { a: 'b' }, supplierId: null }), { url: null, specs: { a: 'b' }, supplier_id: null });

    const legacy: Supplier[] = [
        { id: 's_one', name: 'Home Depot', email: 'hd@x.com', phone: '1', address: '', accountNumber: 'A1', notes: '', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 's_two', name: 'Lumber Co', email: '', phone: '', address: '', accountNumber: '', notes: '', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 's_three', name: 'Tile Town', email: '', phone: '', address: '', accountNumber: '', notes: '', updatedAt: '2026-01-01T00:00:00Z' },
    ];
    const existing = [sup('t1', 'lumber co'), sup('t2', 'Renamed', { legacyKey: 's_three' })];
    const plan = planLegacyImport(legacy, existing);
    eq('import: only new ones (legacy key, then name)', plan.map((p) => [p.name, p.legacyKey, p.accountNumber]), [['Home Depot', 's_one', 'A1']]);
    const after = [...existing, sup('t3', 'Home Depot', { legacyKey: 's_one' })];
    eq('import again: nothing (idempotent)', planLegacyImport(legacy, after), []);
    const before = JSON.stringify(legacy);
    planLegacyImport(legacy, []);
    eq('old list never changed', JSON.stringify(legacy), before);

    const shownLegacy = suppliersToShow('missing', null, legacy);
    eq('missing -> old list', [shownLegacy.source, shownLegacy.suppliers.map((s) => s.name)], ['legacy', ['Home Depot', 'Lumber Co', 'Tile Town']]);
    const shownTable = suppliersToShow('ready', [sup('a', 'Zed'), sup('b', 'Arch', { archived: true }), sup('c', 'beta')], legacy);
    eq('ready -> table rows, archived hidden', [shownTable.source, shownTable.suppliers.map((s) => s.name)], ['table', ['beta', 'Zed']]);
    eq('archived on request', suppliersToShow('ready', [sup('b', 'Arch', { archived: true })], [], { includeArchived: true }).suppliers.length, 1);
    eq('unknown -> old list', suppliersToShow('unknown', [sup('a', 'Zed')], legacy).source, 'legacy');

    const back = recordToLegacy(sup('rid', 'Acme', { email: 'x@y.co', accountNumber: 'Z9', phone: '5' }));
    eq('record -> old Supplier shape', [back.id, back.name, back.email, back.accountNumber, back.phone], ['rid', 'Acme', 'x@y.co', 'Z9', '5']);
    eq('old -> record', [legacyToRecord(legacy[0]).legacyKey, legacyToRecord(legacy[0]).accountNumber], ['s_one', 'A1']);
}

// ---------------------------------------------------------------------------------------------------------------
// 5. cheapest, margin, PO pre-fill, reorder suggestion
// ---------------------------------------------------------------------------------------------------------------
{
    const suppliers = [sup('s1', 'Bravo'), sup('s2', 'Alpha', { preferred: true }), sup('s3', 'Gone', { archived: true }), sup('s4', 'Charlie')];
    const items = [
        item('x1', 's1', 'Stud', 5, { savedItemId: 'b1' }),
        item('x2', 's2', 'Stud', 5, { savedItemId: 'b1' }),
        item('x3', 's3', 'Stud', 1, { savedItemId: 'b1' }),
        item('x4', 's4', 'Stud', 6, { savedItemId: 'b1' }),
        item('x5', 's4', 'Paint', 20, { sku: 'PT-1' }),
        item('x6', 's1', 'Paint', 0, { sku: 'PT-1' }),
    ];
    const b1 = book('b1', 'Stud', { cost: 6 });
    const c = cheapestSupplierFor(b1, items, suppliers);
    eq('cheapest: archived skipped, tie -> preferred', [c?.best.supplier.name, c?.offers.length, c?.savingPerUnit], ['Alpha', 3, 1]);
    const paint = cheapestSupplierFor(book('b9', 'Paint gallon', { sku: 'pt1', cost: 0 }), items, suppliers);
    eq('cheapest by sku, 0 price skipped, no cost -> no saving', [paint?.best.supplierItem.id, paint?.savingPerUnit], ['x5', null]);
    eq('no offers -> null', cheapestSupplierFor(book('zz', 'Nothing'), items, suppliers), null);

    const m = marginImpact({ rate: 100, cost: 60, markup: 66.7 }, 75);
    eq('margin impact', [m.oldMarginPct, m.newMarginPct, m.oldMarkupPct, m.newMarkupPct, m.keepMarkupPrice, m.change, m.sellingBelowCost], [40, 25, 66.7, 33.3, 125.03, 'up', false]);
    eq('selling below cost', marginImpact({ rate: 10, cost: 8, markup: 25 }, 12).sellingBelowCost, true);
    eq('no old cost: markup from the item', marginImpact({ rate: 0, cost: 0, markup: 50 }, 10).keepMarkupPrice, 15);

    const lines: PoLineLike[] = [
        { description: 'Stud', quantity: 10, rate: 0, item_id: 'b1', itemSource: 'pricebook' },
        { description: 'paint', quantity: 2, rate: 18 },
        { description: 'Unknown', quantity: 1, rate: 0 },
    ];
    const pre = prefillPoLines(lines, items, 's4');
    eq('prefill matches', pre.matches, ['pricebook', 'name', null]);
    eq('prefill: price filled when empty, kept when set', pre.lines.map((l) => [l.rate, l.unitCost, l.sku, l.supplierItemId]), [[6, 6, undefined, 'x4'], [18, undefined, 'PT-1', 'x5'], [0, undefined, undefined, undefined]]);
    eq('prefill overwrite', prefillPoLines(lines, items, 's4', { overwritePrices: true }).lines[1].rate, 20);
    check('prefill keeps the input untouched', lines[1].rate === 18 && !('sku' in lines[1]));

    const ctx = { priceBook: [book('b1', 'Stud', { sku: 'ST-8', supplierId: 's4' }), book('b2', 'Nails'), book('b3', 'Gone pref', { supplierId: 's3' })], suppliers, supplierItems: items };
    const pref = suggestSupplierForInventoryItem({ name: 'stud', sku: 'st8' }, ctx);
    eq('suggest: preferred supplier of the price-book item', [pref?.reason, pref?.supplier.id, pref?.price], ['preferred', 's4', 6]);
    const noPref = suggestSupplierForInventoryItem({ name: 'Stud' }, { ...ctx, priceBook: [book('b1', 'Stud')] });
    eq('suggest: cheapest when no preferred', [noPref?.reason, noPref?.supplier.id], ['cheapest', 's2']);
    const archivedPref = suggestSupplierForInventoryItem({ name: 'Gone pref' }, ctx);
    eq('suggest: archived preferred ignored, nothing else', archivedPref, null);
    const byText = suggestSupplierForInventoryItem({ name: 'Nails', supplier: ' bravo ' }, ctx);
    eq('suggest: inventory supplier text', [byText?.reason, byText?.supplier.id], ['inventory', 's1']);
    const direct = suggestSupplierForInventoryItem({ name: 'Widget', sku: 'pt-1' }, { ...ctx, priceBook: [] });
    eq('suggest: catalogue match without a price-book item', [direct?.reason, direct?.supplierItem?.id], ['cheapest', 'x5']);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. migration lint
// ---------------------------------------------------------------------------------------------------------------
{
    const sql = read('supabase/migrations/20261116000200_suppliers_library.sql');
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const lower = code.toLowerCase();
    check('header: purpose + applied with the owner OK', /Applied 2026-11-14 with the owner's OK/.test(sql) && /suppliers \+ product library/i.test(sql));
    const tables = Array.from(lower.matchAll(/create table if not exists public\.([a-z_]+)/g)).map((m) => m[1]);
    eq('new tables', tables, ['suppliers', 'supplier_items']);
    check('every create table is "if not exists"', !/create table (?!if not exists)/.test(lower));
    for (const t of tables) {
        check(`${t}: RLS enabled`, lower.includes(`alter table public.${t} enable row level security`));
        for (const op of ['select', 'insert', 'update', 'delete']) {
            const re = new RegExp(`create policy (\\w+) on public\\.${t} for ${op} to authenticated\\s+(using|with check) \\(user_id = \\(select auth\\.uid\\(\\)\\)\\)`);
            check(`${t}: owner-only ${op} policy`, re.test(lower));
            const name = (re.exec(lower) || [])[1];
            check(`${t}: ${op} policy dropped first`, !!name && lower.includes(`drop policy if exists ${name} on public.${t}`));
        }
        check(`${t}: update policy has with check`, new RegExp(`for update to authenticated\\s+using \\(user_id = \\(select auth\\.uid\\(\\)\\)\\) with check \\(user_id = \\(select auth\\.uid\\(\\)\\)\\)`).test(lower));
        check(`${t}: user_id references auth.users`, new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?user_id\\s+uuid not null default auth\\.uid\\(\\) references auth\\.users\\(id\\) on delete cascade`).test(lower));
        check(`${t}: no anon access`, lower.includes(`revoke all on public.suppliers, public.supplier_items from anon`));
    }
    check('no policy for anon / public', !/create policy[^;]*to (anon|public)/.test(lower));
    const fns = Array.from(code.matchAll(/create or replace function public\.([a-z_]+)\(\)[\s\S]*?\$\$;/gi));
    check('has the guard function', fns.length === 1 && fns[0][1] === 'guard_supplier_item');
    for (const f of fns) {
        check(`${f[1]}: security definer`, /\bsecurity definer\b/i.test(f[0]));
        check(`${f[1]}: search_path = ''`, /set search_path = ''/.test(f[0]));
        check(`${f[1]}: body opens with "as $$"`, /\n\s*as \$\$\s*\n/i.test(f[0]));
        check(`${f[1]}: fully qualified tables`, !/(?<!distinct )\bfrom (?!public\.|jsonb_array_elements)[a-z_]+/i.test(f[0]));
        check(`${f[1]}: not granted to anon`, !new RegExp(`grant execute on function public\\.${f[1]}[^;]*anon`, 'i').test(code));
    }
    check('every $$ is paired', (code.match(/\$\$/g) || []).length % 2 === 0);
    check('no drop table / column / function', !/\bdrop\s+(table|column|function|schema|index)\b/.test(lower) && !/drop column/.test(lower));
    check('no delete / truncate / update statements', !/(^|;|\n)\s*(delete\s+from|truncate|update\s+public\.)/.test(lower));
    check('no alter of existing columns', !/alter column|rename (column|to)/.test(lower));
    const savedItems = lower.split(/;\s*/).filter((s) => /saved_items/.test(s) && !/references public\.saved_items|from public\.saved_items|exists \(\s*select 1 from public\.saved_items/.test(s));
    eq('saved_items: only 3 ADD COLUMN IF NOT EXISTS', savedItems.map((s) => s.replace(/\s+/g, ' ').trim()), [
        'alter table public.saved_items add column if not exists url text',
        'alter table public.saved_items add column if not exists specs jsonb',
        'alter table public.saved_items add column if not exists supplier_id uuid references public.suppliers(id) on delete set null',
    ]);
    check('saved_items: no policy / trigger change', !/on public\.saved_items/.test(lower));
    check('legacy_key unique per user where not null', /create unique index if not exists \w+ on public\.suppliers \(user_id, legacy_key\) where legacy_key is not null/.test(lower));
    check('triggers dropped before create', Array.from(lower.matchAll(/create trigger (\w+)/g)).every((m) => lower.includes(`drop trigger if exists ${m[1]}`)));
    check('price history: trigger appends on price change', /new\.unit_price is distinct from old\.unit_price/.test(lower) && /price_history := v_hist/.test(lower));
    check('updated_at trigger pattern', /execute function public\.handle_updated_at\(\)/.test(lower));
}

// ---------------------------------------------------------------------------------------------------------------
// 7. wiring
// ---------------------------------------------------------------------------------------------------------------
{
    const db = read('lib/suppliers/suppliersDb.ts');
    const rows = WRITE_PATHS.filter((r) => r.file === 'lib/suppliers/suppliersDb.ts');
    check('every suppliersDb write in the offline audit', rows.length >= 8 && rows.every((r) => db.includes(r.match) && r.offline === 'needs_connection'));
    check('writes need a connection', db.includes('NEEDS_CONNECTION') && (db.match(/needOnline\(\);/g) || []).length >= 6);
    check('feature detection like crew', read('lib/suppliers/suppliersFeature.ts').includes('probeSuppliersBackend'));
    check('old supplier list module untouched in shape', read('lib/suppliers.ts').includes("export const SUPPLIERS_SETTING = 'suppliers.list'"));
    const all = ['lib/suppliers/types.ts', 'lib/suppliers/libraryLogic.ts', 'lib/suppliers/priceChange.ts', 'lib/suppliers/priceListCsv.ts', 'lib/suppliers/suppliersDb.ts', 'lib/suppliers/suppliersFeature.ts', 'supabase/migrations/20261116000200_suppliers_library.sql']
        .map(read).join('\n');
    check('no forbidden words', !/kelviq|merchant of record/i.test(all));
    check('pure files import no supabase / react', ['lib/suppliers/libraryLogic.ts', 'lib/suppliers/priceChange.ts', 'lib/suppliers/priceListCsv.ts', 'lib/suppliers/types.ts']
        .every((f) => !/from ['"][^'"]*(supabase|react)['"]/.test(read(f))));
}

// ---------------------------------------------------------------------------------------------------------------
// 8. price-list review: ticks, summary, apply plan (phase B)
// ---------------------------------------------------------------------------------------------------------------
{
    const acme = sup('s1', 'Acme');
    const cat = [
        item('i1', 's1', 'Stud 2x4', 10, { sku: 'ST-24' }),
        item('i2', 's1', 'Drywall screws', 20, { sku: 'DS-1' }),
        item('i3', 's1', 'Nails', 5, { sku: 'NL-1' }),
        item('i4', 's1', 'Old thing', 9, { sku: 'OLD' }),
    ];
    const pb = [book('b1', 'Paint 5 gal', { sku: 'PT-5', cost: 40 })];
    const parsed = parsePriceList('sku,description,unit,price\nST-24,Stud 2x4,each,10.80\nDS-1,Drywall screws,box,20.50\nNL-1,Nails,box,5\nPT-5,Paint 5 gal,each,38\nNEW-9,Mystery item,each,7\n');
    const diff = diffPriceList(parsed.rows, { supplierId: acme.id, supplierItems: cat, priceBook: pb });
    eq('review: kinds', [diff.counts.update, diff.counts.unchanged, diff.counts.add, diff.counts.unmatched], [2, 1, 1, 1]);
    const def = defaultSelection(diff);
    eq('review: default ticks = updates + price-book matches, not unmatched', Array.from(def).sort(), ['line:2', 'line:3', 'line:5']);
    const s0 = reviewSummary(diff, def);
    eq('review: summary', [s0.updates, s0.adds, s0.newItems, s0.writes, s0.up, s0.down, s0.notable], [2, 1, 0, 3, 2, 0, 1]);
    check('review: a 8% rise is notable, 2.5% is not', diff.changes.filter((c) => isNotableRow(c)).map((c) => c.row.sku).join() === 'ST-24');
    eq('review: notable threshold', NOTABLE_PCT, 5);
    const w0 = writesForSelection(diff, def);
    eq('review: writes match the summary', [w0.updates.length, w0.inserts.length], [s0.updates, s0.adds + s0.newItems]);
    check('review: update patch carries the new price', w0.updates.some((u) => u.id === 'i1' && u.patch.unitPrice === 10.8));
    check('review: add is linked to the price-book item', w0.inserts.length === 1 && w0.inserts[0].savedItemId === 'b1');
    // untick one, tick the unmatched row
    let sel = toggleKey(def, 'line:3');
    check('review: toggle off', !sel.has('line:3') && def.has('line:3'), Array.from(sel));
    sel = toggleKey(sel, 'line:6');
    const s1 = reviewSummary(diff, sel);
    eq('review: unmatched ticked by hand adds a new item', [s1.updates, s1.adds, s1.newItems, s1.writes], [1, 1, 1, 3]);
    const w1 = writesForSelection(diff, sel);
    check('review: new item has no price-book link', w1.inserts.some((i) => i.name === 'Mystery item' && !i.savedItemId));
    eq('review: unticked rows are not written', w1.updates.map((u) => u.id), ['i1']);
    // groups
    eq('review: untick all updates', reviewSummary(diff, setKind(def, diff, 'update', false)).updates, 0);
    eq('review: tick all unmatched', reviewSummary(diff, setKind(new Set(), diff, 'unmatched', true)).newItems, 1);
    check('review: unchanged rows can never be ticked', reviewSummary(diff, setKind(new Set(), diff, 'unchanged', true)).writes === 0);
    eq('review: only big changes', Array.from(onlyNotableUpdates(def, diff)).sort(), ['line:2', 'line:5']);
    eq('review: stale / unchanged keys dropped', Array.from(cleanSelection(diff, new Set(['line:4', 'line:99', 'line:2']))), ['line:2']);
    check('review: nothing ticked = nothing written', (() => { const w = writesForSelection(diff, new Set()); return !w.inserts.length && !w.updates.length; })());
    check('review: input sets are not mutated', def.size === 3);
    eq('review: headline', diffHeadline(diff), '2 prices changed, 1 match with your price book, 1 row not matched, 1 unchanged');
    eq('review: empty headline', diffHeadline(diffPriceList([], { supplierId: 's1', supplierItems: [], priceBook: [] })), 'Nothing to import');
    eq('review: summary text', summaryText(s0), '2 price updates, 1 item linked to your price book');
    eq('review: nothing ticked text', summaryText(reviewSummary(diff, new Set())), 'Nothing ticked');
    eq('apply text', applySummaryText({ inserted: 2, updated: 1, failed: [] }), '1 price updated and 2 items added.');
    eq('apply text with failures', applySummaryText({ inserted: 0, updated: 3, failed: [{ id: 'x', error: 'e' }] }), '3 prices updated. 1 item could not be updated.');
    eq('apply text nothing', applySummaryText({ inserted: 0, updated: 0, failed: [] }), 'Nothing was changed.');
}

// ---------------------------------------------------------------------------------------------------------------
// 9. library view helpers (phase B)
// ---------------------------------------------------------------------------------------------------------------
{
    const h = (...p: number[]) => p.map((price, i) => ({ price, at: `2026-0${i + 1}-01T00:00:00Z` }));
    const a = item('a', 's1', 'Alpha stud', 10, { sku: 'AL-1', priceHistory: h(10, 10.2, 12) });
    const b = item('b', 's1', 'Beta screw', 5, { sku: 'BE-2', priceHistory: h(5) });
    const c = item('c', 's1', 'Gamma nail', 3, { sku: 'GA-3', notes: 'special order', priceHistory: h(4, 3) });
    const all = [c, b, a];
    eq('catalogue: A-Z', filterCatalogue(all, '').map((i) => i.id), ['a', 'b', 'c']);
    eq('catalogue: search sku / name / notes', [filterCatalogue(all, 'be-2').length, filterCatalogue(all, 'GAMMA').length, filterCatalogue(all, 'special').length, filterCatalogue(all, 'zzz').length], [1, 1, 1, 0]);
    eq('catalogue: price-changed filter keeps notable changes only', filterCatalogue(all, '', { changedOnly: true }).map((i) => i.id), ['a', 'c']);
    const rows = historyRows(a.priceHistory, 8);
    eq('history: newest first', rows.map((r) => r.price), [12, 10.2, 10]);
    eq('history: change vs the one before', rows.map((r) => r.change.flag), ['up', 'up', 'new']);
    eq('history: capped', historyRows(h(1, 2, 3, 4, 5), 2).length, 2);
    check('sparkline: none for one price', sparkline(b.priceHistory) === null);
    const sp = sparkline(a.priceHistory);
    check('sparkline: points oldest -> newest', !!sp && sp.points.split(' ').length === 3 && sp.trend === 'up', sp);
    check('sparkline: falling price', sparkline(c.priceHistory)?.trend === 'down');
    check('sparkline: flat line stays inside the box', (() => { const f = sparkline(h(5, 5, 5)); return !!f && f.trend === 'flat' && f.last.y === 10; })());

    // specs + link
    eq('specs: object -> rows', specsToRows({ Size: '3/4 in', Color: 'Red' }), [{ key: 'Size', value: '3/4 in' }, { key: 'Color', value: 'Red' }]);
    eq('specs: rows -> object (blank rows dropped, trimmed)', rowsToSpecs([{ key: ' Size ', value: ' 3/4  in ' }, { key: '', value: 'x' }, { key: 'Empty', value: '' }]), { Size: '3/4 in' });
    eq('specs: none left = null', rowsToSpecs([{ key: '', value: '' }]), null);
    check('specs: round trip is stable', JSON.stringify(rowsToSpecs(specsToRows({ A: '1', B: '2' }))) === JSON.stringify({ A: '1', B: '2' }));
    check('specs: duplicate label is a problem', !!specProblem([{ key: 'Size', value: '1' }, { key: 'size', value: '2' }]) && specProblem([{ key: 'Size', value: '1' }]) === null);
    eq('specs: at most 30', Object.keys(rowsToSpecs(Array.from({ length: 40 }, (_, i) => ({ key: `k${i}`, value: 'v' }))) || {}).length, 30);
    eq('url: adds https', normalizeUrl('homedepot.com/p/123'), 'https://homedepot.com/p/123');
    eq('url: keeps a scheme', normalizeUrl('http://a.com/x'), 'http://a.com/x');
    check('url: valid / invalid', isWebUrl('example.com/item') && isWebUrl('https://a.co') && !isWebUrl('not a link') && !isWebUrl('javascript:alert(1)') && !isWebUrl('ftp://a.com/x'));
    check('url: problem text only when wrong', urlProblem('') === null && urlProblem('example.com') === null && !!urlProblem('hello there'));

    // library patch: only what changed
    const start = libraryDraftFromItem({ url: 'https://a.com', specs: { Size: '1' }, supplier_id: 'sup-1' });
    eq('draft from item', [start.url, start.specs.length, start.supplierId], ['https://a.com', 1, 'sup-1']);
    eq('draft from an item without the columns', libraryDraftFromItem({ name: 'x' }), { url: '', specs: [], supplierId: null });
    check('patch: nothing changed = empty', !hasLibraryPatch(libraryPatch(start, { ...start })));
    eq('patch: url only', libraryPatch(start, { ...start, url: 'b.com/x' }), { url: 'https://b.com/x' });
    eq('patch: clearing the url writes null', libraryPatch(start, { ...start, url: '  ' }), { url: null });
    eq('patch: specs only', libraryPatch(start, { ...start, specs: [{ key: 'Size', value: '2' }] }), { specs: { Size: '2' } });
    eq('patch: all specs removed writes null', libraryPatch(start, { ...start, specs: [] }), { specs: null });
    eq('patch: supplier', libraryPatch(start, { ...start, supplierId: null }), { supplierId: null });
    check('patch: a blank spec row is not a change', !hasLibraryPatch(libraryPatch(start, { ...start, specs: [...start.specs, { key: '', value: '' }] })));
    check('patch maps to the 3 new columns only', Object.keys(priceBookPatchToRow(libraryPatch(start, { url: 'x.com/a', specs: [], supplierId: null }))).sort().join() === 'specs,supplier_id,url');

    // product hints
    const s2 = sup('s2', 'Bulk Co');
    const s1 = sup('s1', 'Acme');
    const stud = book('p1', 'Stud 2x4', { sku: 'ST-24', cost: 10, rate: 15, markup: 50 });
    const offers = [item('o1', 's1', 'Stud 2x4', 10.5, { sku: 'ST-24' }), item('o2', 's2', 'Stud 2x4', 8.4, { sku: 'ST-24' })];
    const hint = productHints(stud, 's1', offers, [s1, s2]);
    eq('hints: cheapest first', hint.offers.map((o) => o.supplier.name), ['Bulk Co', 'Acme']);
    check('hints: cheapest + saving', hint.cheapest?.supplier.id === 's2' && hint.savingPerUnit === 1.6);
    check('hints: preferred offer', hint.preferred?.supplier.id === 's1');
    check('hints: margin impact uses the preferred supplier price', hint.impact?.offer.supplier.id === 's1' && hint.impact.impact.newCost === 10.5);
    check('hints: impact sentence', /Acme charges \$10\.50, your cost is \$10\.00 \(\+5%\)/.test(impactSentence(hint.impact!)), impactSentence(hint.impact!));
    check('hints: no preferred -> the cheapest is the basis', productHints(stud, null, offers, [s1, s2]).impact?.offer.supplier.id === 's2');
    check('hints: same cost = no impact line', productHints({ ...stud, cost: 10.5 }, 's1', offers, [s1, s2]).impact === null);
    check('hints: nothing known', (() => { const n = productHints(book('zz', 'Unknown thing'), null, offers, [s1, s2]); return !n.cheapest && !n.offers.length && n.impact === null; })());
    check('hints: archived supplier left out', productHints(stud, null, offers, [s1, sup('s2', 'Bulk Co', { archived: true })]).cheapest?.supplier.id === 's1');
    check('hints: price above what you charge is flagged', /more than you charge/.test(impactSentence(productHints({ ...stud, cost: 5, rate: 6 }, 's1', [item('o9', 's1', 'Stud 2x4', 9, { sku: 'ST-24' })], [s1]).impact!)));

    // the old-style list the PO / reorder screens edit -> table writes
    const r1 = sup('r1', 'Acme', { email: 'a@acme.com', notes: 'x'.repeat(500), contactName: 'Pat', paymentTerms: 'Net 30', leadTimeDays: 3 });
    const r2 = sup('r2', 'Bulk Co', { email: 'b@bulk.com' });
    const gone = sup('r3', 'Old Co', { archived: true, email: 'old@co.com' });
    const records = [r1, r2, gone];
    const same = [recordToLegacy(r1), recordToLegacy(r2)];
    check('table diff: nothing changed = no writes (a long note is not cut)', isEmptyTablePlan(suppliersTableDiff(records, same)));
    const edited = suppliersTableDiff(records, [{ ...recordToLegacy(r1), phone: '555-1234' }, recordToLegacy(r2)]);
    eq('table diff: only the changed field is sent', edited.update, [{ id: 'r1', input: { phone: '555-1234' } }]);
    const removed = suppliersTableDiff(records, [recordToLegacy(r1)]);
    eq('table diff: a removed supplier is archived, never deleted', [removed.archive, removed.create.length], [['r2'], 0]);
    const added = suppliersTableDiff(records, [...same, { id: 's_new', name: 'Fresh', email: 'f@x.com', phone: '', address: '', accountNumber: 'A1', notes: '', updatedAt: '2026-02-02T00:00:00Z' }]);
    eq('table diff: a new supplier is created without a legacy key', added.create, [{ name: 'Fresh', email: 'f@x.com', phone: '', address: '', accountNumber: 'A1', notes: '' }]);
    const back = suppliersTableDiff(records, [...same, { id: 's_x', name: 'old co', email: 'new@co.com', phone: '', address: '', accountNumber: '', notes: '', updatedAt: '2026-02-02T00:00:00Z' }]);
    check('table diff: an archived supplier saved again comes back', back.create.length === 0 && back.update.length === 1 && back.update[0].id === 'r3' && back.update[0].input.archived === false && back.update[0].input.email === 'new@co.com', back);

    // reorder suggestions + supplier prices
    const lines = [
        { itemId: 'inv1', name: 'Stud 2x4', sku: 'ST-24', unit: 'each', unitCost: 10 },
        { itemId: 'inv2', name: 'Unknown bolt', sku: '', unit: 'each', unitCost: 1 },
    ];
    const ctx = { priceBook: [{ ...stud, supplierId: 's1' }], suppliers: [s1, s2], supplierItems: offers };
    const sug = suggestForReorderGroup(lines, ctx);
    check('reorder: preferred supplier of the price-book item', sug?.supplier.id === 's1' && sug.reason === 'preferred' && sug.lines === 1 && sug.total === 2, sug);
    check('reorder: cheapest when no preferred', suggestForReorderGroup(lines, { ...ctx, priceBook: [stud] })?.supplier.id === 's2');
    check('reorder: no suggestion when nothing is known', suggestForReorderGroup([lines[1]], ctx) === null);
    const fills = reorderPriceFills(lines, offers, 's2');
    check('reorder: supplier price for a matching line only', fills.size === 1 && fills.get('inv1')?.price === 8.4 && !fills.has('inv2'), Array.from(fills.entries()));

    // manual purchase order
    const po = [
        { description: 'Stud 2x4', quantity: 10, rate: 0 },
        { description: 'Custom thing', quantity: 1, rate: 3, unit: '' },
        { description: 'Stud 2x4', quantity: 4, rate: 11, unit: 'ea' },
    ];
    const cat2 = [item('o1', 's1', 'Stud 2x4', 10.5, { sku: 'ST-24', unit: 'each' })];
    const out = prefillPoForm(po, cat2, 's1');
    eq('PO: price + unit filled where empty, sku in the description', [out.lines[0].rate, out.lines[0].unit, out.lines[0].description], [10.5, 'each', 'Stud 2x4 (SKU ST-24)']);
    check('PO: a line with no match is unchanged', JSON.stringify(out.lines[1]) === JSON.stringify(po[1]));
    check('PO: a typed price and unit are kept', out.lines[2].rate === 11 && out.lines[2].unit === 'ea');
    eq('PO: filled count', out.filled, 2);
    check('PO: no internal fields leak into the lines', out.lines.every((l) => !('supplierItemId' in l) && !('sku' in l)));
    check('PO: another supplier changes nothing', prefillPoForm(po, cat2, 's2').filled === 0);
    check('PO: sku already in the description is not repeated', prefillPoForm([{ description: 'Stud ST-24', quantity: 1, rate: 0 }], cat2, 's1').lines[0].description === 'Stud ST-24');
}

// ---------------------------------------------------------------------------------------------------------------
// 10. screens (phase B): wiring, gating, old behaviour kept
// ---------------------------------------------------------------------------------------------------------------
{
    const fileOk = (f: string) => { try { return read(f).length > 200; } catch { return false; } };
    const screens = ['components/suppliers/SupplierBook.tsx', 'components/suppliers/SupplierCatalogue.tsx', 'components/suppliers/PriceListImport.tsx',
        'components/suppliers/ProductLibrarySection.tsx', 'components/suppliers/supplierUi.tsx', 'components/suppliers/supplierHooks.ts', 'components/suppliers/libraryCache.ts'];
    check('new screens exist', screens.every(fileOk));
    const code = [...screens, 'components/suppliers/useSuppliers.ts', 'lib/suppliers/libraryView.ts', 'lib/suppliers/priceListReview.ts'].map(read).join('\n');
    check('new files: no forbidden words', !/kelviq|merchant of record/i.test(code));
    check('pure phase B files import no supabase / react', ['lib/suppliers/libraryView.ts', 'lib/suppliers/priceListReview.ts'].every((f) => !/from ['"][^'"]*(supabase|react)['"]/.test(read(f))));
    check('screens never talk to the database directly (all through suppliersDb)', screens.every((f) => !/supabase\.(from|rpc|storage)|from ['"][^'"]*lib\/supabase/.test(read(f))));
    check('screens use the app\'s offline sentence', read('components/suppliers/supplierUi.tsx').includes('NEEDS_CONNECTION') && read('components/suppliers/SupplierBook.tsx').includes('OfflineLine') && read('components/suppliers/PriceListImport.tsx').includes('OfflineLine') && read('components/suppliers/ProductLibrarySection.tsx').includes('OfflineLine'));

    const modal = read('components/suppliers/SuppliersModal.tsx');
    check('SuppliersModal: new screen only with the table', /if \(table\) return <SupplierBook/.test(modal));
    check('SuppliersModal: old list + editor still there', ['upsertSupplier', 'removeSupplier', 'Remove supplier', 'Add supplier', 'Save supplier', 'confirmDelete'].every((s) => modal.includes(s)));
    const hook = read('components/suppliers/useSuppliers.ts');
    check('useSuppliers: old list stays the fallback', hook.includes('loadSuppliers()') && hook.includes('saveSuppliers(next)') && hook.includes("feature === 'ready'"));
    check('useSuppliers: table writes need a connection', hook.includes('NEEDS_CONNECTION') && hook.includes('isBrowserOffline'));
    check('useSuppliers: a removed supplier is archived', hook.includes('archiveSupplier') && !/deleteSupplier\b/.test(hook));

    const book2 = read('components/suppliers/SupplierBook.tsx');
    check('Premium: catalogue + price list behind the plan', book2.includes('paid ? (') && (book2.match(/PremiumPrompt/g) || []).length >= 3 && book2.includes('onUpgrade'));
    check('library cache is per user and cleared by every write', read('components/suppliers/libraryCache.ts').includes('cache.uid === uid') && ['SupplierCatalogue', 'PriceListImport', 'useSuppliers'].every((f) => read(`components/suppliers/${f}.${f === 'useSuppliers' ? 'ts' : 'tsx'}`).includes('invalidateSupplierLibrary()')));
    check('details, list, preferred star, archive are not gated', book2.includes('togglePreferred') && book2.includes('Archive this supplier') && !/paid &&[^\n]*togglePreferred/.test(book2));
    check('suppliers are archived, never deleted', book2.includes('table.archive') && !/deleteSupplier\(/.test(book2));
    const imp = read('components/suppliers/PriceListImport.tsx');
    check('import: review before apply, only ticked rows, apply needs a click', imp.includes('writesForSelection') && imp.includes('applyPriceListWrites') && imp.includes('Apply ') && imp.includes('onClick={() => void apply()}') && imp.includes('summary.writes === 0'));
    check('import: spreadsheet files are refused with a hint', imp.includes('as a CSV file first'));
    const lib2 = read('components/suppliers/ProductLibrarySection.tsx');
    check('product section: hidden until the database has it, free url + specs, Premium hints', lib2.includes("ready !== 'ready'") && lib2.includes('premiumOn') && lib2.includes('PremiumNote') && lib2.includes('Specs'));

    const details = read('components/PriceBookItemDetails.tsx');
    check('price book editor: product section + only changed fields saved', details.includes('<ProductLibrarySection') && details.includes('libraryPatch(libInitial, lib)') && details.includes('...(hasLibraryPatch(library)'));
    check('price book editor: old fields untouched', ['pb-name', 'pb-sku', 'pb-cost', 'pb-markup', 'pb-price', 'Photos', 'Components'].every((s) => details.includes(s)));
    const view = read('components/PriceBookView.tsx');
    check('price book view: library fields written after the item, failure reported', view.includes('updatePriceBookLibraryFields(saved.id, draft.library)') && view.includes('libraryError'));
    check('price book view: payload still has no new columns', !/payload = \{[^}]*(supplier_id|specs|url)/s.test(view));

    const reorder = read('components/suppliers/ReorderModal.tsx');
    check('reorder: suggestions only with the table + Premium; Use button', reorder.includes('catalogueOn = !!supplierRecords && paid') && reorder.includes('Use {sg.supplier.name}') && reorder.includes('supplierRecords = null'));
    const inv = read('components/InventoryView.tsx');
    check('inventory passes the table, plan and upgrade', inv.includes('table={suppliersTable}') && inv.includes('supplierRecords={suppliersTable ? suppliersTable.records : null}') && inv.includes('<ReorderModal') && inv.includes('<LowStockStrip'));
    const poForm = read('components/PurchaseOrderForm.tsx');
    check('purchase order: catalogue fill only with the table + Premium, on pick or by a link', poForm.includes('catalogueFill = suppliersTable !== null && paid') && poForm.includes('void fillFromCatalogue(s)') && poForm.includes('Fill unit, price and SKU from'));
    check('purchase order: old pick / save-vendor flow kept', poForm.includes('SavedSupplierPicker') && poForm.includes('saveVendor') && poForm.includes('sendToSupplier'));

    const help = read('components/help/helpContent.ts');
    check('help: catalogue, price list import, product link and specs', ['Supplier catalogue (Premium)', 'Import a price list (Premium)', 'Product link and specs', '[[Create reorder POs]]', '[[Record delivery]]'].every((s) => help.includes(s)));
}

console.log(`supplier-library-check: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
