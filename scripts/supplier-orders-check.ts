/**
 * Supplier ordering checks (competitor gap #21), pure logic, no browser, no network, no database:
 *   npx tsx scripts/supplier-orders-check.ts
 *
 *  1. saved suppliers: clean-up, round trip through the stored setting, upsert / remove, size limit, "Save as supplier"
 *  2. reorder settings: per-item quantity, pruning, round trip, size limit
 *  3. PO line → inventory item matching (linked id, legacy item_id, exact name, ambiguous, kit)
 *  4. on order: only open purchase orders count (not received / cancelled / already in stock)
 *  5. reorder plan: low items grouped by supplier, quantities, unit costs (item, price book), covered items
 *  6. the Draft reorder PO data
 *  7. "Mark received": stock added once (claim, finish, partial retry, stale form, stock-history guard)
 *  8. wiring: no migration, setting keys, Share / approval page / help guide / App props
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    OPEN_PO_STATUSES, RECEIPT_KEY, REORDER_SETTING, SETTING_MAX_CHARS, SUPPLIERS_SETTING, appliedFromHistory, buildItemIndex, buildReorderPoData,
    claimReceipt, defaultReorderQty, finishReceipt, findSupplierByName, isLowStock, isOpenPurchaseOrder, lineInventoryId, lowStockSummary,
    matchLineToItem, nextPoNumber, normalizeSupplier, onOrderByItem, parseReorderSetting, parseStockReceipt, parseSuppliers, planReceive,
    planReorder, purchaseOrderStage, receiptMarker, receiveReason, removeSupplier, serializeReorderSetting, serializeSuppliers, setReorderQty,
    stripReceiptMarker, supplierToVendor, unitCostFor, upsertSupplier, vendorSaveState, vendorToSupplierInput, withAccountNumberNote, withReceipt,
    type StockItemLike, type Supplier,
} from '../lib/suppliers.ts';
import { buildDuplicateDocumentData } from '../lib/documents.ts';
import { FormType, type Job } from '../types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => {
    if (ok) passed++;
    else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
};
const eq = (name: string, actual: unknown, expected: unknown) => check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });

const NOW = '2026-11-14T10:00:00.000Z';
let seq = 0;
const ids = () => `s_test${++seq}`;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ---------------------------------------------------------------------------------------------------------------
// 1. saved suppliers
// ---------------------------------------------------------------------------------------------------------------
{
    const s = normalizeSupplier({ name: '  Home   Depot Pro ', email: ' Orders@HD.com ', phone: '555-0100', accountNumber: 'A-77', notes: 'Rep: Sam' }, ids, NOW)!;
    eq('supplier name is trimmed and single-spaced', s.name, 'Home Depot Pro');
    eq('supplier email is lower case', s.email, 'orders@hd.com');
    eq('supplier keeps account #', s.accountNumber, 'A-77');
    check('supplier gets a short id', /^s_/.test(s.id));
    eq('a supplier without a name is refused', normalizeSupplier({ name: '  ', email: 'a@b.co' }), null);
    eq('a bad email is dropped (not saved as junk)', normalizeSupplier({ name: 'X', email: 'not an email' }, ids, NOW)!.email, '');
    eq('legacy "account" key is read', normalizeSupplier({ name: 'X', account: '123' }, ids, NOW)!.accountNumber, '123');

    const list = parseSuppliers({ v: 1, suppliers: [{ id: 's_b', name: 'Zed Lumber' }, { id: 's_a', name: 'abc Supply' }, { id: 's_a', name: 'Duplicate id' }, 'junk', null] });
    eq('parse: sorted by name, duplicates and junk dropped', list.map((x) => x.id), ['s_a', 's_b']);
    eq('parse accepts a bare array', parseSuppliers([{ name: 'One' }]).length, 1);
    eq('parse of nothing is an empty list', parseSuppliers(null), []);

    // round trip: what is stored is what comes back
    const { value, error } = serializeSuppliers([s, ...list], NOW);
    check('serialize: no error for a normal list', !error);
    eq('serialize: version 1 + updatedAt', [value.v, value.updatedAt], [1, NOW]);
    eq('round trip through JSON keeps every supplier', parseSuppliers(JSON.parse(JSON.stringify(value))), [s, ...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));

    // size limit of public.user_settings.value (20000 chars)
    const big = Array.from({ length: 80 }, (_, i) => normalizeSupplier({ id: `s_big${i}`, name: `Supplier ${i}`, notes: 'x'.repeat(300), address: 'y'.repeat(200) }, ids, NOW)!);
    const tooBig = serializeSuppliers(big, NOW);
    check('serialize refuses a list over the setting size limit', Boolean(tooBig.error));
    check('a refused list really is over the limit', JSON.stringify(tooBig.value).length > SETTING_MAX_CHARS);

    // upsert
    const a = upsertSupplier([], { name: 'Ferguson', email: 'po@ferguson.com', accountNumber: 'F-1' }, NOW, ids);
    check('upsert creates a new supplier', a.created && a.list.length === 1);
    const b = upsertSupplier(a.list, { name: 'ferguson ', phone: '555-2000', email: '' }, NOW, ids);
    check('upsert by the same name updates (no duplicate)', !b.created && b.list.length === 1);
    eq('name match fills the phone but never erases the email or account #', [b.supplier!.phone, b.supplier!.email, b.supplier!.accountNumber], ['555-2000', 'po@ferguson.com', 'F-1']);
    const c = upsertSupplier(b.list, { id: b.supplier!.id, name: 'Ferguson Plumbing', email: '', accountNumber: '' }, NOW, ids);
    eq('an explicit edit (same id) can rename and clear fields', [c.supplier!.name, c.supplier!.email, c.supplier!.accountNumber, c.supplier!.id], ['Ferguson Plumbing', '', '', b.supplier!.id]);
    eq('remove drops only that supplier', removeSupplier([...c.list, s], s.id).map((x) => x.id), [c.supplier!.id]);
    eq('findSupplierByName is case- and space-insensitive', findSupplierByName([s], 'home depot  PRO')?.id, s.id);

    // PO vendor ↔ supplier
    eq('supplier → vendor fields', supplierToVendor(s), { vendorName: 'Home Depot Pro', vendorEmail: 'orders@hd.com', vendorPhone: '555-0100', vendorAddress: '' });
    eq('vendor → supplier input drops a bad email', vendorToSupplierInput({ vendorName: 'New Co', vendorEmail: 'bad@', vendorPhone: '1' }).email, '');
    eq('Save as supplier: nothing to save without a name', vendorSaveState([s], { vendorName: '' }), 'none');
    eq('Save as supplier: new vendor', vendorSaveState([s], { vendorName: 'New Co' }), 'new');
    eq('Save as supplier: same details = saved', vendorSaveState([s], { vendorName: 'home depot pro', vendorEmail: 'ORDERS@hd.com', vendorPhone: '' }), 'saved');
    eq('Save as supplier: different email = update', vendorSaveState([s], { vendorName: 'Home Depot Pro', vendorEmail: 'other@hd.com' }), 'update');
    eq('account # goes first in the notes', withAccountNumberNote('Deliver AM', 'A-77'), 'Account #: A-77\nDeliver AM');
    eq('account # is added once', withAccountNumberNote('Account #: A-77\nDeliver AM', 'A-77'), 'Account #: A-77\nDeliver AM');
    eq('no account # = notes unchanged', withAccountNumberNote('Deliver AM', ''), 'Deliver AM');
}

// ---------------------------------------------------------------------------------------------------------------
// 2. reorder settings
// ---------------------------------------------------------------------------------------------------------------
{
    const parsed = parseReorderSetting({ v: 1, qty: { [uuid(1)]: 20, [uuid(2)]: '7.5', 'not-a-uuid': 5, [uuid(3)]: -2, [uuid(4)]: 0 }, jobId: uuid(9).toUpperCase() });
    eq('reorder: valid quantities kept (numbers and numeric text)', parsed.qty, { [uuid(1)]: 20, [uuid(2)]: 7.5 });
    eq('reorder: job id kept (lower case)', parsed.jobId, uuid(9));
    eq('reorder: nothing stored → empty', parseReorderSetting(undefined), { qty: {}, jobId: null });
    const set = setReorderQty(parsed, uuid(5).toUpperCase(), 12);
    eq('setReorderQty sets (lower-case id)', set.qty[uuid(5)], 12);
    eq('setReorderQty(null) clears', setReorderQty(set, uuid(1), null).qty[uuid(1)], undefined);
    check('setReorderQty never mutates', parsed.qty[uuid(5)] === undefined);
    const { value, error } = serializeReorderSetting(set, { knownItemIds: [uuid(1), uuid(5)], now: NOW });
    check('serialize reorder: no error', !error);
    eq('serialize prunes items that no longer exist', Object.keys(value.qty).sort(), [uuid(1), uuid(5)]);
    eq('reorder round trip through JSON', parseReorderSetting(JSON.parse(JSON.stringify(value))), { qty: value.qty, jobId: uuid(9) });
    const huge = { qty: Object.fromEntries(Array.from({ length: 600 }, (_, i) => [uuid(1000 + i), 10])), jobId: null };
    check('serialize reorder refuses an oversized setting', Boolean(serializeReorderSetting(huge).error));
}

// ---------------------------------------------------------------------------------------------------------------
// 3. matching PO lines to inventory items
// ---------------------------------------------------------------------------------------------------------------
const PIPE: StockItemLike = { id: uuid(11), name: 'Copper pipe ½"', quantity: 3, low_stock_threshold: 5, cost_price: 12.5, supplier: 'home depot pro', unit: 'ft', sku: 'CU-050' };
const BOX: StockItemLike = { id: uuid(12), name: 'Junction box', quantity: 0, low_stock_threshold: 4, cost_price: 0, supplier: 'Ferguson', sku: 'JB-1' };
const SCREWS: StockItemLike = { id: uuid(13), name: 'Deck screws', quantity: -2, low_stock_threshold: 10, cost_price: 0, supplier: '', unit: 'box' };
const WIRE: StockItemLike = { id: uuid(14), name: 'Wire 12/2', quantity: 50, low_stock_threshold: 10, cost_price: 1.2, supplier: 'Home Depot Pro' };
const DUP_A: StockItemLike = { id: uuid(15), name: 'Caulk', quantity: 1, low_stock_threshold: 2 };
const DUP_B: StockItemLike = { id: uuid(16), name: 'caulk', quantity: 9, low_stock_threshold: 2 };
const KIT: StockItemLike = { id: uuid(17), name: 'Bath kit', quantity: 0, low_stock_threshold: 5, is_assembly: true };
const ITEMS = [PIPE, BOX, SCREWS, WIRE, DUP_A, DUP_B, KIT];
{
    const index = buildItemIndex(ITEMS);
    eq('linked line (inventoryItemId) matches by id', matchLineToItem({ inventoryItemId: PIPE.id, description: 'renamed' }, index), { item: PIPE, by: 'id' });
    eq('legacy item_id from inventory matches', lineInventoryId({ item_id: BOX.id.toUpperCase() }), BOX.id);
    eq('item_id of a price-book line is not an inventory link', lineInventoryId({ item_id: BOX.id, itemSource: 'pricebook' }), null);
    eq('unlinked line matches the exact name (case and spaces ignored)', matchLineToItem({ description: '  junction   BOX ' }, index), { item: BOX, by: 'name' });
    eq('two items with that name → not matched', matchLineToItem({ description: 'Caulk' }, index), { item: null, reason: 'several-items' });
    eq('a kit is never received as stock', matchLineToItem({ inventoryItemId: KIT.id }, index), { item: null, reason: 'kit' });
    eq('unknown line → not in inventory', matchLineToItem({ description: 'Gravel' }, index), { item: null, reason: 'not-in-inventory' });
    eq('a near-miss name is not matched (exact only)', matchLineToItem({ description: 'Junction boxes' }, index).item, null);
}

// ---------------------------------------------------------------------------------------------------------------
// 4. on order
// ---------------------------------------------------------------------------------------------------------------
const OPEN_POS = [
    { id: 'po1', status: 'Sent', poNumber: 'PO-1', lineItems: [{ inventoryItemId: PIPE.id, quantity: 4 }, { description: 'junction box', quantity: 2 }] },
    { id: 'po2', status: 'Draft', poNumber: 'PO-2', lineItems: [{ inventoryItemId: PIPE.id, quantity: '6' }] },
    { id: 'po3', status: 'Accepted', poNumber: 'PO-3', lineItems: [{ inventoryItemId: SCREWS.id, quantity: 5 }] },
    { id: 'po4', status: 'Received', poNumber: 'PO-4', lineItems: [{ inventoryItemId: PIPE.id, quantity: 100 }] },
    { id: 'po5', status: 'Cancelled', poNumber: 'PO-5', lineItems: [{ inventoryItemId: PIPE.id, quantity: 100 }] },
    { id: 'po6', status: 'Sent', poNumber: 'PO-6', lineItems: [{ inventoryItemId: BOX.id, quantity: 100 }], internalStockReceipt: { state: 'done', items: [{ itemId: BOX.id, qty: 100 }], applied: [BOX.id] } },
];
{
    check('open statuses include draft, sent and supplier-confirmed', ['draft', 'sent', 'accepted'].every((s) => (OPEN_PO_STATUSES as readonly string[]).includes(s)));
    check('a received PO is not open', !isOpenPurchaseOrder(OPEN_POS[3]));
    check('a PO already received into stock is not open (whatever its status)', !isOpenPurchaseOrder(OPEN_POS[5]));
    const on = onOrderByItem(OPEN_POS, ITEMS);
    eq('on order sums open POs per item', on.get(PIPE.id), { qty: 10, orders: ['PO-1', 'PO-2'] });
    eq('on order matches unlinked lines by exact name', on.get(BOX.id), { qty: 2, orders: ['PO-1'] });
    eq('supplier-confirmed PO counts as on order', on.get(SCREWS.id)?.qty, 5);
}

// ---------------------------------------------------------------------------------------------------------------
// 5. reorder plan
// ---------------------------------------------------------------------------------------------------------------
const HD = normalizeSupplier({ id: 's_hd', name: 'Home Depot Pro', email: 'orders@hd.com', accountNumber: 'A-77' }, ids, NOW)!;
const FERG = normalizeSupplier({ id: 's_fe', name: 'Ferguson', email: 'po@ferguson.com' }, ids, NOW)!;
{
    eq('default qty: up to twice the alert level', defaultReorderQty(3, 5), 7);
    eq('default qty: minus what is on order', defaultReorderQty(3, 5, 4), 3);
    eq('default qty: oversold stock is made up', defaultReorderQty(-2, 10), 22);
    eq('default qty: at least 1', defaultReorderQty(0, 0), 1);
    eq('default qty: whole units', defaultReorderQty(2.5, 2), 2);
    eq('unit cost: the item cost first', unitCostFor(PIPE, [{ name: PIPE.name, unit_cost: 99 }]), { cost: 12.5, source: 'item' });
    eq('unit cost: price book by SKU', unitCostFor(BOX, [{ name: 'Other', sku: 'jb-1', unit_cost: 3.4 }]), { cost: 3.4, source: 'price book' });
    eq('unit cost: price book by name (cost alias)', unitCostFor(SCREWS, [{ name: 'deck screws', cost: 8 }]), { cost: 8, source: 'price book' });
    eq('unit cost: unknown = 0', unitCostFor(SCREWS, []), { cost: 0, source: null });
    check('low stock: kits never count', !isLowStock(KIT));
    check('low stock: above the alert level is fine', !isLowStock(WIRE));

    const on = onOrderByItem(OPEN_POS, ITEMS);
    const groups = planReorder({ items: ITEMS, suppliers: [FERG, HD], reorderQty: { [SCREWS.id]: 30 }, onOrder: on, priceBook: [{ name: 'Junction box', unit_cost: 2.25 }] });
    eq('groups: saved suppliers first (A–Z), then names, then no supplier', groups.map((g) => g.key), ['s_fe', 's_hd', 'none']);
    const hd = groups.find((g) => g.key === 's_hd')!;
    eq('item supplier text matched to the saved supplier (case-insensitive)', hd.supplier?.id, 's_hd');
    const pipe = hd.lines[0];
    eq('pipe: on order from PO-1 and PO-2', [pipe.onOrder, pipe.onOrderPos], [10, ['PO-1', 'PO-2']]);
    check('pipe: covered by open orders (3 + 10 > 5)', pipe.covered);
    const box = groups.find((g) => g.key === 's_fe')!.lines[0];
    eq('box: suggested qty = 2×4 − (0 + 2 on order)', box.qty, 6);
    eq('box: cost from the price book', [box.unitCost, box.costSource], [2.25, 'price book']);
    check('box: not covered (0 + 2 ≤ 4)', !box.covered);
    const screws = groups.find((g) => g.key === 'none')!.lines.find((l) => l.itemId === SCREWS.id)!;
    eq('screws: the item’s own reorder quantity wins', [screws.qty, screws.customQty], [30, true]);
    check('wire (above alert) and caulk B are not in the plan', !groups.flatMap((g) => g.lines).some((l) => l.itemId === WIRE.id || l.itemId === DUP_B.id));
    eq('caulk A (unsaved, no supplier) is in the no-supplier group', groups.find((g) => g.key === 'none')!.lines.map((l) => l.name), ['Caulk', 'Deck screws']);
    const named = planReorder({ items: [{ ...BOX, supplier: 'Local Yard' }], suppliers: [HD] });
    eq('a supplier name that is not saved gets its own group', [named[0].key, named[0].vendorName, named[0].supplier], ['name:local yard', 'Local Yard', null]);
    eq('low-stock summary', lowStockSummary(groups), { low: 4, toOrder: 3, onOrder: 3 });
}

// ---------------------------------------------------------------------------------------------------------------
// 6. the Draft reorder PO
// ---------------------------------------------------------------------------------------------------------------
{
    const job = { id: uuid(50), userId: 'u', name: 'Shop stock', clientName: '', clientAddress: '', startDate: '2026-11-14', endDate: null, status: 'active' } as Job;
    const profile = { id: 'u', email: 'me@x.com', name: 'Sam', companyName: 'Sam Builds', address: '1 Shop Rd', phone: '555-9000' } as any;
    let n = 0;
    const data = buildReorderPoData({
        job, profile, group: { supplier: HD, vendorName: HD.name }, number: 'PO-2026-11-007', today: '2026-11-14', now: NOW, makeId: () => `line${++n}`,
        lines: [{ itemId: PIPE.id, name: PIPE.name, qty: 7, unitCost: 12.5, stock: 3 }, { itemId: BOX.id, name: BOX.name, qty: 0, unitCost: 1, stock: 0 }],
    }) as any;
    eq('reorder PO: Draft with the number', [data.status, data.poNumber], ['Draft', 'PO-2026-11-007']);
    eq('reorder PO: vendor from the saved supplier', [data.vendorName, data.vendorEmail], ['Home Depot Pro', 'orders@hd.com']);
    eq('reorder PO: shipped to the company office', [data.shipToType, data.shipToName, data.shipToAddress, data.shipToPhone], ['Company Office', 'Sam Builds', '1 Shop Rd', '555-9000']);
    eq('reorder PO: zero-quantity lines are left out', data.lineItems.length, 1);
    eq('reorder PO line: linked to inventory, at cost', (({ description, quantity, rate, inventoryItemId, itemSource }) => ({ description, quantity, rate, inventoryItemId, itemSource }))(data.lineItems[0]),
        { description: PIPE.name, quantity: 7, rate: 12.5, inventoryItemId: PIPE.id, itemSource: 'inventory' });
    eq('reorder PO: account # in the notes', data.notes, 'Account #: A-77');
    eq('reorder PO: marker', data.internalReorder, { v: 1, at: NOW, items: [{ itemId: PIPE.id, qty: 7 }] });
    eq('reorder PO: the form defaults are there (company, template)', [data.companyName, typeof data.templateId], ['Sam Builds', 'string']);
    const noSupplier = buildReorderPoData({ job, profile, group: { supplier: null, vendorName: 'Local Yard' }, number: 'PO-X', today: '2026-11-14', lines: [{ itemId: BOX.id, name: BOX.name, qty: 1, unitCost: 0, stock: 0 }] }) as any;
    eq('reorder PO without a saved supplier keeps the name, no email', [noSupplier.vendorName, noSupplier.vendorEmail, noSupplier.title], ['Local Yard', '', 'Stock reorder – Local Yard']);
    const used = ['PO-2026-11-001', 'PO-2026-11-002'];
    const first = nextPoNumber(used, new Date(2026, 10, 14));
    eq('PO numbers continue the form series', first, 'PO-2026-11-003');
    eq('two POs in one batch get different numbers', nextPoNumber([...used, first], new Date(2026, 10, 14)), 'PO-2026-11-004');
    // Duplicate (lib/documents.ts): a copy starts un-received and is not a reorder record
    const dup = buildDuplicateDocumentData({ ...data, status: 'Received', [RECEIPT_KEY]: { state: 'done' } });
    check('a duplicated PO has no receipt and no reorder marker', !(RECEIPT_KEY in dup) && !('internalReorder' in dup));
    eq('a duplicated received PO starts as Draft', dup.status, 'Draft');
    check('internal keys are hidden from client/supplier pages (_client_safe_doc_data strips /internal/)', /internal/i.test(RECEIPT_KEY) && /internal/i.test('internalReorder'));
}

// ---------------------------------------------------------------------------------------------------------------
// 7. "Mark received": stock goes in once
// ---------------------------------------------------------------------------------------------------------------
{
    const DOC = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const po: Record<string, unknown> = {
        poNumber: 'PO-2026-11-007', vendorName: 'Home Depot Pro', status: 'Sent',
        lineItems: [
            { id: 'l1', inventoryItemId: PIPE.id, description: PIPE.name, quantity: 7 },
            { id: 'l2', description: 'copper PIPE ½"', quantity: 3 },
            { id: 'l3', description: 'Junction box', quantity: '2' },
            { id: 'l4', description: 'Gravel', quantity: 1 },
            { id: 'l5', description: 'Caulk', quantity: 1 },
            { id: 'l6', inventoryItemId: KIT.id, description: 'Bath kit', quantity: 1 },
            { id: 'l7', inventoryItemId: BOX.id, quantity: 0 },
        ],
    };
    const plan = planReceive({ data: po, items: ITEMS });
    eq('receive: ready', plan.status, 'ready');
    eq('receive: linked and name-matched lines of one item are summed', plan.moves.map((m) => [m.itemId, m.qty]), [[PIPE.id, 10], [BOX.id, 2]]);
    eq('receive: unmatched lines are listed with why', plan.unmatched.map((u) => [u.description, u.reason]), [['Gravel', 'not-in-inventory'], ['Caulk', 'several-items'], ['Bath kit', 'kit']]);

    // claim → stock moves → finish
    const claimed = claimReceipt(plan, NOW);
    eq('claim: receiving, nothing applied yet', [claimed.state, claimed.applied], ['receiving', []]);
    const done = finishReceipt(claimed, [PIPE.id, BOX.id], [], NOW);
    eq('finish: done when every item is in', [done.state, done.doneAt], ['done', NOW]);
    const received = withReceipt(po, done);
    eq('finished receipt sets the status to Received', received.status, 'Received');
    eq('the receipt survives a JSON round trip', parseStockReceipt(JSON.parse(JSON.stringify(received))), done);

    // second "Mark received": nothing is added twice
    const again = planReceive({ data: received, items: ITEMS });
    eq('received once: a second receive adds nothing', [again.status, again.moves.length], ['already', 0]);

    // an old open form saved over the PO (receipt gone): the stock-history marker still blocks it
    const reason = receiveReason(po, DOC);
    check('history note names the PO and carries the marker', reason.startsWith('Received PO PO-2026-11-007 from Home Depot Pro') && reason.endsWith(receiptMarker(DOC)));
    eq('the marker is hidden in the history list', stripReceiptMarker(reason), 'Received PO PO-2026-11-007 from Home Depot Pro');
    const history = [
        { item_id: PIPE.id, quantity_change: 10, notes: reason },
        { item_id: BOX.id, quantity_change: 2, notes: reason.toUpperCase() },
        { item_id: WIRE.id, quantity_change: 5, notes: 'Manual restock' },
        { item_id: SCREWS.id, quantity_change: 4, notes: receiveReason(po, 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee') },
        { item_id: BOX.id, quantity_change: -2, notes: `Correction ${receiptMarker(DOC)}` },
    ];
    eq('history guard: only this PO’s items with stock still added', appliedFromHistory(history, DOC), [PIPE.id]);
    const stale = planReceive({ data: po, items: ITEMS, appliedItemIds: appliedFromHistory(history.slice(0, 2), DOC) });
    eq('stale form: items already in stock per the history are skipped', [stale.status, stale.moves.length, stale.skipped.length], ['already', 0, 2]);
    const healed = finishReceipt(claimReceipt(stale, NOW), [], [], NOW);
    eq('stale form: the receipt is written back as done without moving stock', [healed.state, healed.applied.sort()], ['done', [PIPE.id, BOX.id].sort()]);

    // partial failure → retry adds only the rest, from the frozen plan
    const partial = finishReceipt(claimed, [PIPE.id], [BOX.id], NOW);
    eq('partial: state + failed', [partial.state, partial.failed], ['partial', [BOX.id]]);
    const editedLater = { ...withReceipt(po, partial), lineItems: [{ inventoryItemId: WIRE.id, quantity: 99 }] };
    const retry = planReceive({ data: editedLater, items: ITEMS });
    eq('retry: only the missing item, from the plan frozen at the claim (later edits ignored)', retry.moves.map((m) => [m.itemId, m.qty]), [[BOX.id, 2]]);
    const retryDone = finishReceipt(claimReceipt(retry, NOW), [BOX.id], [], NOW);
    eq('retry finishes the receipt', [retryDone.state, retryDone.applied.length, retryDone.failed], ['done', 2, undefined]);
    // two devices / two tabs: B opens "Mark received" while A is still adding stock (receipt 'receiving', claimed
    // seconds ago; the stock history only shows what A added so far). B must not add the rest a second time.
    const inFlight = withReceipt(po, claimReceipt(plan, NOW));
    const second = planReceive({ data: inFlight, items: ITEMS, appliedItemIds: [PIPE.id], now: '2026-11-14T10:00:20.000Z' });
    eq('in progress elsewhere: a second receive adds nothing while the first is still adding stock', [second.status, second.moves.length], ['busy', 0]);
    const abandoned = planReceive({ data: inFlight, items: ITEMS, appliedItemIds: [PIPE.id], now: '2026-11-14T10:10:00.000Z' });
    eq('a claim left unfinished (tab closed) can be finished later: only the missing item', [abandoned.status, abandoned.moves.map((m) => [m.itemId, m.qty])], ['ready', [[BOX.id, 2]]]);
    // a retry of a partial receipt is a new claim with its own time, so it is protected the same way
    const retryClaim = claimReceipt(retry, '2026-11-14T11:00:00.000Z');
    eq('a retry claim is stamped with its own time', retryClaim.claimedAt, '2026-11-14T11:00:00.000Z');
    eq('the claim time survives a JSON round trip', parseStockReceipt(JSON.parse(JSON.stringify(withReceipt(po, retryClaim))))?.claimedAt, '2026-11-14T11:00:00.000Z');
    const retryInFlight = planReceive({ data: withReceipt(po, retryClaim), items: ITEMS, now: '2026-11-14T11:00:30.000Z' });
    eq('a retry in progress elsewhere: nothing added twice', [retryInFlight.status, retryInFlight.moves.length], ['busy', 0]);
    const api = read('lib/suppliersApi.ts');
    check('Mark received: a retry claim only wins when nobody else claimed the receipt meanwhile (compare-and-set)', api.includes("->>claimedAt") && api.includes("->>state`, plan.receipt.state"));
    check('Mark received: a busy receipt is refused before any stock moves', /plan\.status === 'busy'[\s\S]*?throw/.test(api));
    eq('nothing matches → nothing', planReceive({ data: { lineItems: [{ description: 'Gravel', quantity: 1 }] }, items: ITEMS }).status, 'nothing');
    eq('a receipt with an unknown state is ignored', parseStockReceipt({ [RECEIPT_KEY]: { state: 'weird' } }), null);

    // status strip
    eq('stage: draft', purchaseOrderStage({ status: 'Draft' }), 'draft');
    eq('stage: sent', purchaseOrderStage({ status: 'Sent' }), 'sent');
    eq('stage: confirmed by the supplier (approval link)', purchaseOrderStage({ status: 'Accepted', clientSignedAt: NOW }), 'confirmed');
    eq('stage: supplier can’t fill it', purchaseOrderStage({ status: 'Rejected', clientDeclinedAt: NOW }), 'cant-fill');
    eq('stage: partly received', purchaseOrderStage(withReceipt(po, partial)), 'receiving');
    eq('stage: received', purchaseOrderStage(received), 'received');
    eq('stage: cancelled', purchaseOrderStage({ status: 'Cancelled' }), 'cancelled');
}

// ---------------------------------------------------------------------------------------------------------------
// 8. wiring
// ---------------------------------------------------------------------------------------------------------------
{
    const migrations = readdirSync(join(root, 'supabase/migrations'));
    check('no migration for supplier ordering', !migrations.some((f) => /supplier|reorder|purchase/i.test(f) || /suppliers\.list|inventory\.reorder|internalStockReceipt/.test(read(`supabase/migrations/${f}`))));
    const userData = read('lib/userData.ts');
    check('userData uses the same setting keys', userData.includes(`'${SUPPLIERS_SETTING}'`) && userData.includes(`'${REORDER_SETTING}'`));
    check('setting keys fit public.user_settings.key', [SUPPLIERS_SETTING, REORDER_SETTING].every((k) => /^[a-z0-9_.:-]{1,64}$/.test(k)));
    const api = read('lib/suppliersApi.ts');
    check('receive uses the existing RPC adjust_inventory', api.includes("rpc('adjust_inventory'"));
    check('receive claims atomically (only a PO without a receipt is updated)', api.includes('.is(`data->${RECEIPT_KEY}`, null)'));
    check('reorder POs are Purchase Order documents', api.includes('type: FormType.PurchaseOrder') && FormType.PurchaseOrder === 'Purchase Order');
    const share = read('components/ShareModal.tsx');
    check('Share window: supplier mode is opt-in (default off)', share.includes('supplierConfirm = false') && share.includes('supplierLinkMode'));
    const approval = read('components/DocumentApprovalView.tsx');
    check('approval page: purchase orders say "Confirm order"', approval.includes("'Confirm order'") && approval.includes('isPurchaseOrder'));
    check('approval page: other types keep "Approve & sign"', approval.includes('Approve &amp; sign'));
    const form = read('components/PurchaseOrderForm.tsx');
    check('PO form: status strip, saved suppliers, Mark received', ['<OrderStatusStrip', '<SavedSupplierPicker', '<SaveVendorLine', '<ReceiveOrderDialog'].every((s) => form.includes(s)));
    check('PO form: Send to supplier is Premium, Share stays for everyone', form.includes('if (!paid)') && form.includes('<ShareButton'));
    const inv = read('components/InventoryView.tsx');
    check('Inventory: low-stock strip, Suppliers, reorder modal', ['<LowStockStrip', 'setSuppliersOpen(true)', '<ReorderModal'].every((s) => inv.includes(s)));
    const app = read('App.tsx');
    check('App passes the plan to the PO form and Inventory', /<PurchaseOrderForm[\s\S]*?plan=\{plan\}/.test(app) && /<InventoryView[\s\S]*?plan=\{plan\}/.test(app));
    const help = read('components/help/helpContent.ts');
    check('help guide for suppliers', help.includes("id: 'suppliers'") && help.includes('[[Create reorder POs]]') && help.includes('[[Mark received]]'));
}

console.log(`supplier-orders-check: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
    for (const f of failures) console.log(`  FAIL ${f}`);
    process.exit(1);
}
