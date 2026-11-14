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
    check('header: purpose + not applied', /Applied: NOT YET \(needs owner OK\)/.test(sql) && /suppliers \+ product library/i.test(sql));
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

console.log(`supplier-library-check: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
