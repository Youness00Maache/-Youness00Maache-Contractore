/**
 * Client selections + mood boards (roadmap D5, phase A): pure-logic checks (lib/selections, lib/boards, the portal
 * parsers) and a lint of supabase/migrations/20261116000600_selections_boards.sql (owner-only RLS, security definer +
 * search_path '', bodies open with `as $$`, additive only, anon grants only on the three portal functions, no
 * owner-only fields in the portal JSON, the choose function writes only the client's fields). No database needed:
 *   npx tsx scripts/selections-check.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    LOCKED_STATUSES, OWNER_TRANSITIONS, PORTAL_STATUSES, SELECTION_STATUSES, SELECTION_TEMPLATES, canEditOptions, canTransition,
    chosenOption, chosenPricing, draftFromTemplate, droppedImagePaths, historyLabel, isOverdue, mapSelectionRow, normalizeOptions,
    optionImageStoragePath, optionPricing, ownerActions, parseMoney, parseQty, portalImagePath, selectionInsertRow, selectionPatchRow,
    sortSelections, statusLabel, summarizeSelections, validateDraft, validateHttpsLink, validateOptionImage,
} from '../lib/selections/selectionLogic.ts';
import { SELECTION_LIMITS, type JobSelection, type SelectionStatus } from '../lib/selections/selectionTypes.ts';
import { SELECTION_PO_KEY, buildSelectionPoData, pickPoSupplier, selectionBudget, selectionOfPo, selectionPoLine } from '../lib/selections/selectionPo.ts';
import {
    addItem, boardImagePath, boardInsertRow, boardPatchRow, countByKind, mapBoardRow, moveItem, normalizeItems, parseColor, removeItem,
    reorderItems, validateBoardDraft, validateItem,
} from '../lib/boards/boardLogic.ts';
import { BOARD_LIMITS } from '../lib/boards/boardTypes.ts';
import { canChoose, parsePortalBoard, parsePortalSelection } from '../lib/portal/selectionsApi.ts';
import { READ_ONLY_RPCS } from '../lib/offline/writePathScan.ts';
import { WRITE_PATHS } from '../lib/offline/writePathAudit.ts';
import type { SupplierRecord } from '../lib/suppliers/types.ts';
import type { Job } from '../types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passes = 0;
let failures = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else {
        failures++;
        console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
    }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);
const throws = (label: string, fn: () => unknown, re?: RegExp) => {
    try { fn(); failures++; console.error(`FAIL ${label}: did not throw`); } catch (e) {
        if (re && !re.test(e instanceof Error ? e.message : String(e))) { failures++; console.error(`FAIL ${label}: wrong error ${String(e)}`); } else passes++;
    }
};

const U = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const SUP = '33333333-3333-4333-8333-333333333333';

// ============================================================================================ status machine
eq('statuses', SELECTION_STATUSES, ['draft', 'sent', 'chosen', 'approved', 'changes_requested', 'ordered', 'closed']);
ok('draft -> sent', canTransition('draft', 'sent'));
ok('sent -> draft (withdraw)', canTransition('sent', 'draft'));
ok('never to chosen by the owner', SELECTION_STATUSES.every(s => s === 'chosen' || !canTransition(s, 'chosen')));
ok('chosen -> approved / changes / sent', ['approved', 'changes_requested', 'sent', 'closed'].every(t => canTransition('chosen', t as SelectionStatus)));
ok('approved -> ordered', canTransition('approved', 'ordered'));
ok('draft -/-> approved', !canTransition('draft', 'approved'));
ok('sent -/-> approved', !canTransition('sent', 'approved'));
ok('closed -> draft only if never sent', canTransition('closed', 'draft') && !canTransition('closed', 'draft', { everSent: true }));
ok('ordered -> approved (cancel)', canTransition('ordered', 'approved'));
eq('portal statuses', PORTAL_STATUSES, ['sent', 'chosen', 'approved', 'changes_requested', 'ordered']);
eq('locked statuses', LOCKED_STATUSES, ['chosen', 'approved', 'ordered']);
ok('options editable in sent, not in chosen', canEditOptions({ status: 'sent' }) && !canEditOptions({ status: 'chosen' }));
eq('actions draft', ownerActions({ status: 'draft', poDocumentId: null }), ['send', 'edit', 'delete']);
eq('actions chosen', ownerActions({ status: 'chosen', poDocumentId: null }), ['approve', 'request_changes', 'ask_again', 'close']);
eq('actions approved', ownerActions({ status: 'approved', poDocumentId: null }), ['create_po', 'mark_ordered', 'request_changes', 'close']);
eq('actions ordered with PO', ownerActions({ status: 'ordered', poDocumentId: 'x' }), ['open_po', 'cancel_order', 'close']);
ok('labels', statusLabel('chosen').includes('approve') && historyLabel({ at: '', by: 'client', action: 'chosen', note: 'Oak' }) === 'Client chose Oak');

// ============================================================================================ options
eq('money parse', [parseMoney('1,234.50'), parseMoney('$12'), parseMoney(-1), parseMoney('abc'), parseMoney(''), parseMoney(100_000_000)], [1234.5, 12, null, null, null, null]);
eq('qty parse', [parseQty('2.5'), parseQty(0), parseQty('x'), parseQty(1_000_001)], [2.5, null, null, null]);
ok('https only', validateHttpsLink('https://a.com/x').ok && !validateHttpsLink('http://a.com').ok && validateHttpsLink('shop.example.com/p').url === 'https://shop.example.com/p');
const opts = normalizeOptions([
    { id: 'opt_a1', name: '  Oak  ', unitPrice: '12.5', qty: '10', unitCost: 8, sku: 'OAK-1', supplierId: SUP, url: 'example.com/oak' },
    { name: 'Maple', unitPrice: 20 },
    { name: '', unitPrice: '' },
]);
eq('options: blank row dropped', opts.length, 2);
eq('options: first', { ...opts[0] }, {
    id: 'opt_a1', name: 'Oak', description: null, imagePath: null, portalPath: null, url: 'https://example.com/oak', sku: 'OAK-1',
    supplierId: SUP, unit: null, qty: 10, unitPrice: 12.5, unitCost: 8,
});
ok('options: id made', /^o_[a-z0-9]{12}$/.test(opts[1].id) && opts[1].qty === 1 && opts[1].unitCost === null);
throws('options: name required', () => normalizeOptions([{ name: '', unitPrice: 5 }]), /name/);
throws('options: http refused', () => normalizeOptions([{ name: 'A', url: 'http://a.com' }]), /https/);
throws('options: max 6', () => normalizeOptions(Array.from({ length: 7 }, (_, i) => ({ name: `O${i}` }))), /6/);
throws('options: bad price', () => normalizeOptions([{ name: 'A', unitPrice: -3 }]), /price/);
throws('options: duplicate id', () => normalizeOptions([{ id: 'same_id', name: 'A' }, { id: 'same_id', name: 'B' }]), /same id/);
throws('options: foreign image path', () => normalizeOptions([{ name: 'A', imagePath: 'x/../../etc.jpg' }]), /image/);
const img = optionImageStoragePath(U, J, 'Kitchen Tile.PNG', 'image/png', 'abcdef123456');
eq('image path', img, `${U}/selections/${J}/abcdef123456-Kitchen-Tile.png`);
ok('image path matches SQL', /^[0-9a-f-]{36}\/selections\/[0-9a-f-]{36}\/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$/.test(img));
ok('portal path matches SQL', /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$/.test(portalImagePath(U, 'abc123def456', 'image/webp')));
eq('portal copy dropped without image', normalizeOptions([{ name: 'A', portalPath: `${U}/abcdefgh.jpg` }])[0].portalPath, null);
eq('image validation', [validateOptionImage({ name: 'a.gif', size: 10, type: 'image/gif' }) !== null, validateOptionImage({ name: 'a.jpg', size: 6e6, type: 'image/jpeg' }) !== null, validateOptionImage({ name: 'a.webp', size: 10 })], [true, true, null]);
eq('dropped images', droppedImagePaths([{ imagePath: 'a' }, { imagePath: 'b' }, { imagePath: null }], [{ imagePath: 'b' }]), ['a']);

// ============================================================================================ money
eq('pricing upgrade', optionPricing({ unitPrice: 12.5, qty: 10, unitCost: 8 }, 100), { total: 125, cost: 80, difference: 25, kind: 'upgrade' });
eq('pricing credit', optionPricing({ unitPrice: 9, qty: 10, unitCost: null }, 100), { total: 90, cost: null, difference: -10, kind: 'credit' });
eq('pricing included', optionPricing({ unitPrice: 10, qty: 10, unitCost: null }, 100).kind, 'included');
eq('pricing no allowance', optionPricing({ unitPrice: 0.1, qty: 3, unitCost: null }, null), { total: 0.3, cost: null, difference: null, kind: 'none' });

// ============================================================================================ rows
const sel = (over: Partial<JobSelection> = {}): JobSelection => ({
    id: '44444444-4444-4444-8444-444444444444', userId: U, jobId: J, title: 'Kitchen tile', category: 'tile', room: 'Kitchen', body: null,
    dueDate: null, allowance: 100, options: opts, status: 'approved', chosenOptionId: 'opt_a1', clientComment: null, chosenBy: 'Ann',
    chosenAt: '2026-11-15T10:00:00Z', history: [], poDocumentId: null, sentAt: '2026-11-14T10:00:00Z', approvedAt: '2026-11-15T11:00:00Z',
    orderedAt: null, closedAt: null, createdAt: '2026-11-14T09:00:00Z', updatedAt: '2026-11-15T11:00:00Z', ...over,
});
eq('chosen option', chosenOption(sel())?.name, 'Oak');
eq('chosen pricing', chosenPricing(sel())?.difference, 25);
eq('chosen none', chosenOption(sel({ chosenOptionId: 'nope_zz' })), null);
const ins = selectionInsertRow({ title: ' Tile ', allowance: '100', options: [{ name: 'A', unitPrice: 5 }] }, U, J, true);
eq('insert row keys', Object.keys(ins), ['user_id', 'job_id', 'title', 'category', 'room', 'body', 'due_date', 'allowance', 'options', 'status']);
eq('insert row values', [ins.title, ins.allowance, ins.status], ['Tile', 100, 'sent']);
ok('insert never sends client fields', !('chosen_option_id' in ins) && !('history' in ins) && !('po_document_id' in ins));
throws('send needs an option', () => selectionInsertRow({ title: 'X' }, U, J, true), /option/);
eq('draft without options ok', validateDraft({ title: 'X' }), null);
eq('patch row', selectionPatchRow({ allowance: null, dueDate: '2026-12-01' }), { due_date: '2026-12-01', allowance: null });
throws('patch: bad allowance', () => selectionPatchRow({ allowance: 'abc' }), /allowance/);
const mapped = mapSelectionRow({
    id: 's1', user_id: U, job_id: J, title: 'T', status: 'chosen', allowance: '150.00',
    options: [{ id: 'opt_a1', name: 'Oak', qty: 2, unit_price: '10', unit_cost: null, supplier_id: SUP }, { name: 'no id' }],
    history: [{ at: 'x', by: 'client', action: 'chosen', note: 'Oak' }], chosen_option_id: 'opt_a1',
});
eq('map row', [mapped.allowance, mapped.options.length, mapped.options[0].unitPrice, mapped.options[0].supplierId, mapped.history[0].by, mapped.status], [150, 1, 10, SUP, 'client', 'chosen']);
eq('sort', sortSelections([
    sel({ id: 'a', status: 'closed' }), sel({ id: 'b', status: 'sent', dueDate: '2026-12-01' }), sel({ id: 'c', status: 'sent', dueDate: '2026-11-20' }), sel({ id: 'd', status: 'chosen' }),
]).map(s => s.id), ['c', 'b', 'd', 'a']);
ok('overdue', isOverdue({ status: 'sent', dueDate: '2026-11-01' }, '2026-11-15') && !isOverdue({ status: 'chosen', dueDate: '2026-11-01' }, '2026-11-15'));
eq('summary', summarizeSelections([
    { status: 'sent', dueDate: '2026-11-01' }, { status: 'sent', dueDate: null }, { status: 'chosen', dueDate: null }, { status: 'approved', dueDate: null }, { status: 'draft', dueDate: null },
], '2026-11-15'), { total: 5, draft: 1, waitingOnClient: 2, overdue: 1, toApprove: 1, changesRequested: 0, toOrder: 1, ordered: 0, closed: 0 });

// templates
eq('templates', SELECTION_TEMPLATES.map(t => t.id), ['tile', 'paint', 'flooring', 'fixtures', 'appliances', 'countertops']);
ok('templates are valid drafts', SELECTION_TEMPLATES.every(t => validateDraft(draftFromTemplate(t.id), { sending: true }) === null));
const tdraft = draftFromTemplate('paint', { title: 'Living room paint' });
ok('template override + ids', tdraft.title === 'Living room paint' && (tdraft.options || []).every(o => /^o_/.test(String(o.id))));

// ============================================================================================ PO + budget
const supplier: SupplierRecord = {
    id: SUP, name: 'Tile Depot', contactName: '', email: 'orders@tiledepot.example', phone: '555', address: '1 Road', website: '', accountNumber: 'AC-9',
    paymentTerms: '', notes: '', leadTimeDays: null, preferred: false, archived: false, legacyKey: null, createdAt: '', updatedAt: '2026-01-01T00:00:00Z',
};
eq('supplier: the option\'s own', pickPoSupplier(opts[0], { suppliers: [supplier] })?.reason, 'option');
eq('supplier: archived never', pickPoSupplier(opts[0], { suppliers: [{ ...supplier, archived: true }] }), null);
eq('supplier: preferred from price book', pickPoSupplier({ name: 'Oak', sku: 'OAK-1', supplierId: null }, {
    suppliers: [supplier],
    priceBook: [{ id: 'pb1', name: 'Oak', sku: 'OAK-1', unit: '', rate: 0, cost: 0, markup: null, url: '', specs: null, supplierId: SUP, isAssembly: false }],
    supplierItems: [],
})?.reason, 'preferred');
let n = 0;
const line = selectionPoLine(sel(), opts[0], () => `line-${++n}`);
eq('po line', { ...line }, { id: 'line-1', description: 'Kitchen tile: Oak (SKU OAK-1)', quantity: 10, rate: 8, unitCost: 8, sku: 'OAK-1' });
eq('po line without cost uses the price', selectionPoLine(sel(), opts[1], () => 'l').rate, 20);
const job = { id: J, name: 'Smith kitchen', clientName: 'Ann Smith' } as unknown as Job;
const po = buildSelectionPoData({ job, profile: null, selection: sel(), supplier, number: 'PO-2026-11-001', today: '2026-11-15', now: '2026-11-15T12:00:00Z', makeId: () => 'li' });
eq('po basics', [po.poNumber, po.status, po.vendorName, po.vendorEmail, (po.lineItems as unknown[]).length], ['PO-2026-11-001', 'Draft', 'Tile Depot', 'orders@tiledepot.example', 1]);
ok('po notes: account + product link', String(po.notes).startsWith('Account #: AC-9') && String(po.notes).includes('https://example.com/oak'));
eq('po marker', selectionOfPo(po), { v: 1, selectionId: sel().id, optionId: 'opt_a1', at: '2026-11-15T12:00:00Z' });
ok('po marker key', SELECTION_PO_KEY in po);
ok('po not linked to inventory', !(po.lineItems as Array<Record<string, unknown>>).some(l => l.track_inventory || l.inventoryItemId));
const poNoSup = buildSelectionPoData({ job, selection: sel(), supplier: null, vendorName: 'Local shop', number: 'PO-1', today: '2026-11-15' });
eq('po vendor name only', [poNoSup.vendorName, poNoSup.vendorEmail], ['Local shop', '']);
throws('po needs approval', () => buildSelectionPoData({ job, selection: sel({ status: 'chosen' }), number: 'PO-1', today: '2026-11-15' }), /Approve/);
throws('po needs a choice', () => buildSelectionPoData({ job, selection: sel({ chosenOptionId: null }), number: 'PO-1', today: '2026-11-15' }), /chosen/);
const budget = selectionBudget([
    sel({ id: 'a' }),
    sel({ id: 'b', status: 'ordered', poDocumentId: 'po1', chosenOptionId: opts[1].id, allowance: 30 }),
    sel({ id: 'c', status: 'ordered', poDocumentId: null, allowance: null }),
    sel({ id: 'd', status: 'chosen' }),
    sel({ id: 'e', status: 'sent', chosenOptionId: null }),
]);
eq('budget pending', [budget.pending.map(i => i.id), budget.pendingCost], [['a'], 80]);
eq('budget via PO / elsewhere', [budget.viaPurchaseOrder.map(i => i.id), budget.orderedElsewhere.map(i => i.id)], [['b'], ['c']]);
eq('budget allowance', [budget.upgrades, budget.credits, budget.netAllowanceChange, budget.awaitingApproval], [25, 10, 15, 1]);
eq('budget empty = nothing', selectionBudget([]), { pending: [], pendingCost: 0, viaPurchaseOrder: [], orderedElsewhere: [], upgrades: 0, credits: 0, netAllowanceChange: 0, awaitingApproval: 0 });
const costingSrc = readFileSync(join(ROOT, 'lib/costing.ts'), 'utf8');
ok('costing.ts untouched by D5 (no selections import)', !/selection/i.test(costingSrc));

// ============================================================================================ boards
eq('colors', [parseColor('#ABC'), parseColor('aabbcc'), parseColor('rgb(255, 0, 16)'), parseColor('red'), parseColor('rgb(300,0,0)')], ['#aabbcc', '#aabbcc', '#ff0010', null, null]);
const bImg = boardImagePath(U, J, 'mood.jpeg', 'image/jpeg', 'zzzzzzzz1');
ok('board image path matches SQL', /^[0-9a-f-]{36}\/boards\/[0-9a-f-]{36}\/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$/.test(bImg));
const items = normalizeItems([
    { id: 'item_1', kind: 'image', imagePath: bImg, title: 'Hall', color: '#fff' },
    { id: 'item_2', kind: 'link', url: 'pinterest.com/x' },
    { id: 'item_3', kind: 'note', caption: 'Warm, natural' },
    { id: 'item_4', kind: 'color', color: '#C0FFEE', url: 'https://x.com' },
]);
eq('items: shapes', items.map(i => [i.kind, i.url, i.color, !!i.imagePath]), [['image', null, null, true], ['link', 'https://pinterest.com/x', null, false], ['note', null, null, false], ['color', null, '#c0ffee', false]]);
ok('items: validation', validateItem({ kind: 'link' }) !== null && validateItem({ kind: 'color', color: 'nope' }) !== null && validateItem({ kind: 'note' }) !== null && validateItem({ kind: 'image', url: 'https://a.com/p.jpg' }) === null);
throws('items: max 60', () => normalizeItems(Array.from({ length: 61 }, (_, i) => ({ kind: 'note' as const, caption: `n${i}` }))), /60/);
eq('move', moveItem(items, 'item_4', -2).map(i => i.id), ['item_1', 'item_4', 'item_2', 'item_3']);
eq('move clamps', moveItem(items, 'item_1', -5).map(i => i.id), ['item_1', 'item_2', 'item_3', 'item_4']);
eq('reorder', reorderItems(items, ['item_3', 'ghost', 'item_1']).map(i => i.id), ['item_3', 'item_1', 'item_2', 'item_4']);
eq('remove', removeItem(items, 'item_2').length, 3);
eq('add', addItem(items, { kind: 'color', color: '#000' }).length, 5);
eq('count', countByKind(items), { image: 1, link: 1, note: 1, color: 1 });
const bIns = boardInsertRow({ title: ' Kitchen ', items: [{ ...items[0], portalPath: `${U}/abcdefgh.jpg` }] }, U, J);
ok('board insert: private, no copies', bIns.shared_in_portal === false && (bIns.items as Array<Record<string, unknown>>)[0].portal_path === null);
eq('board validation', [validateBoardDraft({ title: '' }) !== null, validateBoardDraft({ title: 'x' })], [true, null]);
eq('board patch', Object.keys(boardPatchRow({ notes: 'n' })), ['notes']);
const bMapped = mapBoardRow({ id: 'b', user_id: U, job_id: J, title: 'B', items: [{ id: 'item_1', kind: 'note', caption: 'x' }, { id: 'bad', kind: 'video' }], shared_in_portal: true });
eq('board map', [bMapped.items.length, bMapped.sharedInPortal], [1, true]);
eq('board limits mirror SQL', [BOARD_LIMITS.items, BOARD_LIMITS.perJob], [60, 50]);

// ============================================================================================ portal parsers
const ps = parsePortalSelection({
    id: 's1', job_id: J, job_name: 'Smith', title: 'Tile', status: 'sent', allowance: 100,
    options: [{ id: 'opt_a1', name: 'Oak', path: `${U}/abcdefgh.jpg`, url: 'javascript:alert(1)', qty: 10, unit_price: 12.5, total: 125, difference: 25, unit_cost: 8, sku: 'X' }],
    history: [{ at: 'x', by: 'owner', action: 'sent' }],
});
ok('portal selection parsed', !!ps && ps.options[0].total === 125 && ps.options[0].difference === 25 && canChoose(ps));
eq('portal selection: unsafe link dropped', ps?.options[0].url, null);
ok('portal selection: no cost / sku leaks into the shape', !!ps && !('unitCost' in ps.options[0]) && !('sku' in ps.options[0]));
ok('portal selection: image URL from the copy', !!ps?.options[0].imageUrl && ps.options[0].imageUrl.includes('portal-photos'));
const pb = parsePortalBoard({ id: 'b', title: 'Mood', items: [
    { id: '1', kind: 'image', path: null, url: null }, { id: '2', kind: 'color', color: '#ABCDEF' }, { id: '3', kind: 'link', url: 'http://x.com' }, { id: '4', kind: 'note', caption: 'hi' },
] });
eq('portal board: unusable items dropped', pb?.items.map(i => [i.id, i.color]), [['2', '#abcdef'], ['4', null]]);

// ============================================================================================ offline registration
ok('portal reads are read-only RPCs', READ_ONLY_RPCS.has('get_portal_selections') && READ_ONLY_RPCS.has('get_portal_boards') && !READ_ONLY_RPCS.has('choose_portal_selection'));
eq('the choice is a public write', WRITE_PATHS.filter(w => w.match.includes('choose_portal_selection')).map(w => w.offline), ['public']);
ok('every other D5 write needs a connection', WRITE_PATHS.filter(w => /lib\/(selections|boards)\//.test(w.file)).every(w => w.offline === 'needs_connection'));
eq('limits mirror SQL', [SELECTION_LIMITS.perJob, SELECTION_LIMITS.options, SELECTION_LIMITS.history, SELECTION_LIMITS.maxPrice], [300, 6, 200, 99_999_999]);

// ============================================================================================ SQL lint
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261116000600_selections_boards.sql'), 'utf8').replace(/\r\n/g, '\n');
const code = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const lower = code.toLowerCase();

ok('header: applied with the owner OK', /^-- Applied 2026-11-15 with the owner's OK/.test(SQL));
ok('no Kelviq / merchant of record', !/kelviq|merchant of record/i.test(SQL));
for (const re of [/\bdrop\s+table\b/, /\bdrop\s+column\b/, /\btruncate\s+(table\s+)?public\./, /\bdelete\s+from\b/, /\balter\s+table\s+public\.(?!job_selections\b|job_boards\b)/,
    /\bdrop\s+function\b/, /\bdrop\s+schema\b/, /\bupdate\s+storage\./, /\binsert\s+into\s+storage\./, /\bon\s+storage\.objects/, /\balter\s+type\b/,
    /\bstorage\.buckets\b/, /get_portal_project_dashboard/, /\bupdate\s+public\.(?!job_selections\b)/]) {
    ok(`no destructive / out-of-scope statement ${re}`, !re.test(lower));
}
eq('tables: only the two approved', [...lower.matchAll(/create table if not exists (public\.[a-z_]+)/g)].map(m => m[1]), ['public.job_selections', 'public.job_boards']);
eq('no plain create table', (lower.match(/create table (?!if not exists)/g) || []).length, 0);
ok('indexes: if not exists', (lower.match(/create index (?!if not exists)/g) || []).length === 0);
const policies = [...lower.matchAll(/create policy (\w+) on (public\.\w+)/g)].map(m => m[1]);
ok('every policy dropped first', policies.every(p => lower.includes(`drop policy if exists ${p} on`)));
const triggers = [...lower.matchAll(/create trigger (\w+)/g)].map(m => m[1]);
ok('every trigger dropped first', triggers.length === 7 && triggers.every(t => lower.includes(`drop trigger if exists ${t} on`)));
ok('flow trigger runs before the guard (name order)', 'trg_job_selections_flow' < 'trg_job_selections_guard');
for (const t of ['job_selections', 'job_boards']) {
    ok(`${t}: RLS enabled`, lower.includes(`alter table public.${t} enable row level security`));
    for (const op of ['select', 'insert', 'update', 'delete']) {
        const m = new RegExp(`create policy ${t}_${op}_own on public\\.${t} for ${op} to authenticated\\s+([^;]*);`).exec(lower);
        ok(`${t}: ${op} policy exists`, !!m);
        ok(`${t}: ${op} policy owner-only`, (m?.[1] || '').replace(/\s+/g, ' ').split(/using|with check/).slice(1)
            .every(part => part.trim().replace(/[()]/g, '').trim().startsWith('user_id = select auth.uid')));
    }
    eq(`${t}: exactly 4 policies`, policies.filter(p => p.startsWith(`${t}_`)).length, 4);
}
ok('tables: anon has nothing', /revoke all on public\.job_selections, public\.job_boards from anon/.test(lower));
ok('no grant on the tables to anon', !/grant [^;]* on public\.job_(selections|boards)[^;]* to [^;]*\banon\b/.test(lower));

const fnRe = /create or replace function (public\.\w+)\(([^)]*)\)([\s\S]*?)\n\$\$;/g;
const fns = [...code.matchAll(fnRe)].map(m => ({ name: m[1], args: m[2], text: m[0] }));
eq('functions', fns.map(f => f.name).sort(), [
    'public._portal_selection_json', 'public._selection_number', 'public.choose_portal_selection', 'public.enqueue_selection_board_cleanup',
    'public.get_portal_boards', 'public.get_portal_selections', 'public.guard_job_board', 'public.guard_job_selection', 'public.guard_job_selection_flow',
].sort());
for (const f of fns) {
    const head = f.text.slice(0, f.text.indexOf('$$'));
    ok(`${f.name}: set search_path = ''`, /set search_path = ''/.test(head));
    ok(`${f.name}: body opens with "as $$"`, /\nas \$\$\n/.test(f.text));
    if (f.name === 'public.guard_job_selection_flow') {
        ok(`${f.name}: invoker on purpose`, !/security definer/.test(head) && /current_user in \('authenticated', 'anon'\)/.test(f.text));
        ok(`${f.name}: reads no table`, !/\b(from|join)\s+public\./.test(f.text.toLowerCase()));
    } else {
        ok(`${f.name}: security definer`, /security definer/.test(head));
    }
    ok(`${f.name}: schema-qualified tables`, ![...f.text.matchAll(/\b(from|join|update|into)\s+(?!public\.|auth\.|jsonb_|unnest|v_|new\.|old\.|x\b|p\b|\()(\w+)/gi)]
        .some(m => /^(job_selections|job_boards|jobs|clients|suppliers|documents|storage_cleanup_queue|profiles)$/.test(m[2])));
    ok(`${f.name}: revoked from public / anon / authenticated`, new RegExp(`revoke all on function ${f.name.replace('.', '\\.')}\\([^)]*\\) from public, anon, authenticated`).test(lower));
}
eq('every $$ body opens with "as $$"', (code.match(/\$\$/g) || []).length, (code.match(/\nas \$\$\n/g) || []).length * 2);
const granted = [...lower.matchAll(/grant execute on function (public\.\w+)\([^)]*\)\s+to ([^;]+);/g)].map(m => ({ fn: m[1], to: m[2].trim() }));
eq('anon grants only on the portal functions', granted.filter(g => /\banon\b/.test(g.to)).map(g => g.fn).sort(),
    ['public.choose_portal_selection', 'public.get_portal_boards', 'public.get_portal_selections']);
eq('no other execute grants', granted.length, 3);

const fnText = (name: string) => fns.find(f => f.name === name)?.text || '';
for (const name of ['public.get_portal_selections', 'public.choose_portal_selection', 'public.get_portal_boards']) {
    const t = fnText(name);
    ok(`${name}: key format checked`, t.includes("!~ '^[A-Za-z0-9_-]{32,128}$'"));
    ok(`${name}: invalid link error`, t.includes("'Invalid portal link' using errcode = '28000'"));
    ok(`${name}: client's jobs only (never empty names)`, t.includes('j.client_id = v_client.id') && t.includes("btrim(coalesce(v_client.name, '')) <> ''") && t.includes('user_id = v_client.user_id'));
}
ok('get_portal_selections: no drafts / closed', fnText('public.get_portal_selections').includes("s.status in ('sent', 'chosen', 'approved', 'changes_requested', 'ordered')") && /\nstable\n/.test(fnText('public.get_portal_selections')));
ok('get_portal_boards: stable + shared only', /\nstable\n/.test(fnText('public.get_portal_boards')) && fnText('public.get_portal_boards').includes('b.shared_in_portal'));
// json keys the portal returns (a key = a string literal followed by a comma, not after -> / ->>)
const OWNER_ONLY = ['user_id', 'unit_cost', 'cost', 'sku', 'supplier_id', 'po_document_id', 'image_path', 'portal_path', 'notes', 'history_all', 'ordered_at', 'created_at', 'updated_at', 'closed_at'];
for (const name of ['public._portal_selection_json', 'public.get_portal_boards']) {
    const t = fnText(name).slice(fnText(name).indexOf('jsonb_build_object'));
    const keys = [...t.matchAll(/(?<!->>?)'([a-z_]+)',/g)].map(m => m[1]);
    ok(`${name}: has json keys`, keys.length > 6);
    eq(`${name}: no owner-only json keys`, keys.filter(k => OWNER_ONLY.includes(k)), []);
}
ok('portal json: history filtered to client-facing actions', fnText('public._portal_selection_json').includes("h.el->>'action' in ('sent', 'reopened', 'chosen', 'approved', 'changes_requested', 'ordered')"));
// the choose function writes only the client's fields
const choose = fnText('public.choose_portal_selection');
const updates = [...choose.matchAll(/update public\.(\w+)\s+set([\s\S]*?)\n\s*where/g)];
eq('choose: one update, of job_selections', updates.map(u => u[1]), ['job_selections']);
eq('choose: writes only the client fields', (updates[0]?.[2] || '').split('\n').map(l => /^\s*(\w+)\s*=/.exec(l)?.[1]).filter(Boolean),
    ['status', 'chosen_option_id', 'client_comment', 'chosen_by', 'chosen_at', 'history']);
ok('choose: once per send', choose.includes("if v_s.status <> 'sent' then") && choose.includes('ALREADY_CHOSEN') && choose.includes("hint = 'already_chosen'"));
ok('choose: the option must exist', choose.includes("where o.value->>'id' = v_option"));
ok('choose: texts capped', choose.includes('public._clean_multiline(p_comment, 2000)') && choose.includes('public._clean_text(p_name, 120)'));
ok('choose: locks the row', choose.includes('for update of s'));
ok('choose: no insert / delete', !/\b(insert into|delete from)\b/i.test(choose));
// the browser cannot write the client's fields
const flow = fnText('public.guard_job_selection_flow');
for (const f of ['chosen_option_id', 'client_comment', 'chosen_by', 'chosen_at', 'history', 'sent_at', 'approved_at', 'ordered_at']) ok(`flow: browser keeps ${f}`, flow.includes(`new.${f} := old.${f};`));
ok('flow: browser insert as draft / sent only', /if v_browser then\s+if new\.status not in \('draft', 'sent'\)/.test(flow));
ok('flow: chosen only by the client', !/new\.status in \([^)]*'chosen'/.test(flow.replace(/old\.status = 'chosen'/g, '')));
ok('flow: ask again clears the choice', /if new\.status = 'sent' then\s+(--[^\n]*\n\s+)?new\.chosen_option_id := null;/.test(flow));
// guards
const guardSel = fnText('public.guard_job_selection');
const guardBoard = fnText('public.guard_job_board');
ok('guards: Premium on insert', guardSel.includes("not in ('premium', 'ai')") && guardBoard.includes("not in ('premium', 'ai')"));
ok('guards: caps', guardSel.includes('v_count >= 300') && guardBoard.includes('v_count >= 50') && guardSel.includes('> 6') && guardBoard.includes('> 60'));
ok('guards: same-owner job', guardSel.includes('j.user_id = new.user_id') && guardBoard.includes('j.user_id = new.user_id'));
ok('guards: same-owner supplier / PO', guardSel.includes('s.user_id = new.user_id') && guardSel.includes('d.user_id = new.user_id'));
ok('guards: https links only', guardSel.includes("'^https://[^[:space:]]+$'") && guardBoard.includes("'^https://[^[:space:]]+$'") && !/https\?:/.test(guardSel + guardBoard));
ok('guards: image folders', guardSel.includes("'/selections/'") && guardBoard.includes("'/boards/'") && guardSel.includes("split_part(v_portal, '/', 1) <> new.user_id::text"));
ok('guards: colour hex', guardBoard.includes("'^#[0-9a-f]{6}$'"));
ok('guards: options locked while chosen', guardSel.includes("new.status in ('chosen', 'approved', 'ordered')") && guardSel.includes("- 'image_path' - 'portal_path'"));
ok('guards: unshare drops copies', guardBoard.includes('not new.shared_in_portal then'));
ok('cleanup: only the portal-photos bucket', [...code.matchAll(/insert into public\.storage_cleanup_queue[^;]*;/g)].every(m => m[0].includes("'portal-photos'")));

console.log(`selections-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
