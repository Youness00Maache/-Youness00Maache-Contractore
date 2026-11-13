/**
 * Data-fidelity checks (docs/work/PARITY_V2.md items 6, 7, 8, 10, 11, 12, 13, 14): opening, copying and syncing data
 * from the original app must never change it. Pure functions only (no browser, no database):
 *   npx tsx scripts/data-fidelity-check.ts
 */
import { formatNumberForInput, linePrice, lineQuantity, normalizeLineItems, normalizeMaterialItems } from '../components/forms/formUtils.ts';
import { computeDocumentTotals, lineItemAmount } from '../utils/money.ts';
import { addMonthsAnchored, cappedRecurrence, describeRecurringRun, planRecurringCatchUp, serverToday } from '../lib/recurring.ts';
import {
    buildDuplicateDocumentData, chunk, isUnseenClientDecision, isUnseenClientDeclinedDocument, isUnseenClientSignedDocument,
    mapDocumentRow, mergeDocuments, planDuplicateCopies,
} from '../lib/documents.ts';
import { fetchAllRows } from '../lib/listLoading.ts';
import {
    PRICE_BOOK_DEFAULT_MARKUP, kitEditPatch, kitOwnStock, kitPriceIsManual, priceBookKitTotals, priceFromMarkup, stockValue,
} from '../utils/stockMath.ts';
import {
    LANGUAGE_LOCAL_KEY, THEME_LOCAL_KEY, UI_PREFS_SETTING, normalizeUiPrefs, saveUiPrefs, syncUiPrefs, uiPrefsPendingKey,
    type DbError, type KeyValueStore, type ProfilePrefsRemote, type SettingsRemote,
} from '../lib/userDataSync.ts';
import type { FormData as FormDataType } from '../types.ts';

let passed = 0;
const failures: string[] = [];
const eq = (name: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passed++;
    else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);

const run = async () => {
    // ------------------------------------------------------------------ 6 (D1): saved numbers are kept exactly
    {
        const saved = [
            { id: 'a', description: 'Tile', quantity: 1200, rate: 2.375, unitCost: 1.1875 },
            { id: 'b', description: 'Credit: returned vanity', quantity: -1, rate: 500 },
            { id: 'c', description: 'Fractional', quantity: 0.33333, rate: 10 },
            { id: 'd', description: 'Kit', quantity: 1, rate: 99.995, isAssembly: true, assemblyComponents: [{ item_id: 'x', name: 'Part', quantity: 2, rate: 3.125 }] },
        ];
        const items = normalizeLineItems(saved, false);
        eq('D1 saved rate keeps 2.375', items[0].rate, 2.375);
        eq('D1 saved unit cost keeps 1.1875', items[0].unitCost, 1.1875);
        eq('D1 saved credit quantity stays -1', items[1].quantity, -1);
        eq('D1 saved fractional quantity kept', items[2].quantity, 0.33333);
        eq('D1 saved kit price kept', items[3].rate, 99.995);
        eq('D1 saved kit component price kept', items[3].assemblyComponents?.[0].rate, 3.125);
        eq('D1 1200 × 2.375 = 2,850.00 (not 2,856)', lineItemAmount(items[0]), 2850);
        eq('D1 credit line −1 × 500 = −500', lineItemAmount(items[1]), -500);
        const totals = computeDocumentTotals({ lineItems: items.slice(0, 2) });
        eq('D1 totals unchanged after loading', totals.total, 2350);
        // a second load (= re-save then reopen) changes nothing
        eq('D1 load twice is stable', normalizeLineItems(items, false).map(i => [i.quantity, i.rate, i.unitCost ?? null]), items.map(i => [i.quantity, i.rate, i.unitCost ?? null]));
        // AI / pasted input is still cleaned
        const ai = normalizeLineItems([{ description: 'x', quantity: '-2', rate: '2.375', unitCost: '-4' }]);
        eq('D1 AI quantity clamped at 0', ai[0].quantity, 0);
        eq('D1 AI price rounded to cents', ai[0].rate, 2.38);
        eq('D1 AI cost clamped at 0', ai[0].unitCost, 0);
        eq('D1 lineQuantity typed rounding', lineQuantity('1.23456', false), 1.235);
        eq('D1 linePrice keeps negative stored price', linePrice(-12.345, true, true), -12.345);
        const mats = normalizeMaterialItems([{ id: 'm', name: 'Grout', quantity: -2, unitCost: 2.375 }], false);
        eq('D1 saved material cost kept', mats[0].unitCost, 2.375);
        eq('D1 saved material quantity kept', mats[0].quantity, -2);
        eq('D1 AI material cost rounded', normalizeMaterialItems([{ name: 'x', unitCost: 2.375 }])[0].unitCost, 2.38);
        // what the price box shows (and therefore what a blur would write back)
        eq('D1 box shows 2.375 (unit prices)', formatNumberForInput(2.375, 2, 4), '2.375');
        eq('D1 box pads 2.5 → 2.50', formatNumberForInput(2.5, 2, 4), '2.50');
        eq('D1 box keeps integers', formatNumberForInput(1200, 2, 4), '1200');
        eq('D1 box hides float noise', formatNumberForInput(0.1 + 0.2, 2, 4), '0.30');
        eq('D1 box limits to 4 decimals', formatNumberForInput(1.23456789, 2, 4), '1.2346');
        eq('D1 money box without maxDecimals unchanged', formatNumberForInput(2.375, 2), '2.38');
        eq('D1 negative quantity shows', formatNumberForInput(-1), '-1');
    }

    // ------------------------------------------------------------------ 7 (D2): recurring catch-up cap
    {
        eq('D2 anchored month math Jan 31 → Feb 28', addMonthsAnchored('2026-01-31', 1, 31), '2026-02-28');
        eq('D2 anchored month math Feb 28 → Mar 31', addMonthsAnchored('2026-02-28', 1, 31), '2026-03-31');
        eq('D2 anchored across year', addMonthsAnchored('2026-11-30', 3, 30), '2027-02-28');
        const rec = { enabled: true, frequency: 'Monthly', nextRunDate: '2026-01-31' };
        const plan = planRecurringCatchUp(rec, '2026-11-13');
        eq('D2 ten monthly periods due', plan.due, 10);
        eq('D2 latest due period', plan.latestDue, '2026-10-31');
        eq('D2 nine skipped', plan.skipped.length, 9);
        eq('D2 skipped range', [plan.skipped[0], plan.skipped[8]], ['2026-01-31', '2026-09-30']);
        const capped = cappedRecurrence(rec, plan, '2026-11-13T10:00:00Z');
        eq('D2 capped next run = latest period', capped?.nextRunDate, '2026-10-31');
        eq('D2 anchor pinned to 31', capped?.anchorDay, 31);
        eq('D2 skipped noted', (capped as any)?.catchUp, { skipped: 9, from: '2026-01-31', to: '2026-09-30', at: '2026-11-13T10:00:00Z' });
        const after = planRecurringCatchUp(capped as any, '2026-11-13');
        eq('D2 after the cap exactly one draft is due', [after.due, after.skipped.length], [1, 0]);
        eq('D2 the following run keeps the anchor (Nov 30)', addMonthsAnchored(after.latestDue!, 1, after.anchorDay), '2026-11-30');
        eq('D2 one period due: nothing to change', cappedRecurrence({ enabled: true, frequency: 'Monthly', nextRunDate: '2026-11-01' }, planRecurringCatchUp({ enabled: true, frequency: 'Monthly', nextRunDate: '2026-11-01' }, '2026-11-13')), null);
        eq('D2 future date: nothing due', planRecurringCatchUp({ enabled: true, frequency: 'Monthly', nextRunDate: '2026-12-01' }, '2026-11-13').due, 0);
        eq('D2 disabled: nothing due', planRecurringCatchUp({ enabled: false, frequency: 'Monthly', nextRunDate: '2020-01-01' }, '2026-11-13').due, 0);
        eq('D2 unknown frequency: nothing due', planRecurringCatchUp({ enabled: true, frequency: 'Weekly', nextRunDate: '2020-01-01' }, '2026-11-13').due, 0);
        eq('D2 quarterly periods', planRecurringCatchUp({ enabled: 'true', frequency: 'Quarterly', nextRunDate: '2026-02-15' }, '2026-11-13').skipped, ['2026-02-15', '2026-05-15']);
        eq('D2 stored anchor day wins', planRecurringCatchUp({ enabled: true, frequency: 'Monthly', nextRunDate: '2026-09-30', anchorDay: 31 }, '2026-11-13').latestDue, '2026-10-31');
        ok('D2 server today is a date', /^\d{4}-\d{2}-\d{2}$/.test(serverToday()));
        const msg = describeRecurringRun(1, [{ id: 'x', invoiceNumber: 'INV-007', skipped: 9, from: '2026-01-31', to: '2026-09-30' }]) || '';
        ok('D2 message names the invoice and the skipped periods', msg.includes('INV-007') && msg.includes('only the latest') && msg.includes('Jan 31, 2026') && msg.includes('Sep 30, 2026'));
        eq('D2 no message when nothing happened', describeRecurringRun(0, []), null);
        // duplicates never join a series
        const dup = buildDuplicateDocumentData({
            invoiceNumber: 'INV-1', status: 'Sent', recurrenceSourceId: 'src', recurrencePeriod: '2026-10-31',
            recurrence: { enabled: true, frequency: 'Monthly', nextRunDate: '2026-11-30', anchorDay: 30, lastRunDate: '2026-10-31' },
            clientDeclinedAt: '2026-11-01', clientDeclineReason: 'too expensive',
        });
        eq('D2 duplicate drops the series keys', ['recurrenceSourceId', 'recurrencePeriod', 'clientDeclinedAt', 'clientDeclineReason'].filter(k => k in dup), []);
        eq('D2 duplicate recurrence switched off, frequency kept', dup.recurrence, { enabled: false, frequency: 'Monthly' });
        eq('D2 duplicate status draft', dup.status, 'Draft');
        eq('D10 duplicated work order starts Scheduled', buildDuplicateDocumentData({ workOrderNumber: 'WO-1', status: 'Completed' }).status, 'Scheduled');
    }

    // ------------------------------------------------------------------ 8 (D3): old kits keep their own stock and cost
    {
        const oldKit = { id: 'k', is_assembly: true, quantity: 4, cost_price: 37.5, assembly_items: [] };
        const newKit = { id: 'n', is_assembly: true, quantity: 0, cost_price: 0, assembly_items: [{ item_id: 'a', quantity: 2 }] };
        eq('D3 old kit own stock', kitOwnStock(oldKit), 4);
        eq('D3 new kit has no own stock', kitOwnStock(newKit), null);
        eq('D3 plain item has no kit stock', kitOwnStock({ quantity: 5 }), null);
        eq('D3 old kit value = own stock × kit cost', stockValue(oldKit), 150);
        eq('D3 new kit value 0', stockValue(newKit), 0);
        const patch = { name: 'Kit', category: null, supplier: null, cost_price: 0, unit: 'set', assembly_items: [] };
        eq('D3 editing a new kit never sends cost/category/supplier', Object.keys(kitEditPatch(patch, newKit)).sort(), ['assembly_items', 'name', 'unit']);
        eq('D3 editing an old kit keeps its cost (sends the shown value)', kitEditPatch({ ...patch, cost_price: 37.5 }, oldKit).cost_price, 37.5);
        ok('D3 editing an old kit never wipes category/supplier', !('category' in kitEditPatch(patch, oldKit)) && !('supplier' in kitEditPatch(patch, oldKit)));
        eq('D3 plain items unchanged', kitEditPatch(patch, { is_assembly: false, quantity: 3 }), patch);
    }

    // ------------------------------------------------------------------ 10 (D4): duplicate job copies everything allowed
    {
        const ids = Array.from({ length: 235 }, (_, i) => `d${i}`);
        eq('D4 chunks of 100', chunk(ids, 100).map(c => c.length), [100, 100, 35]);
        eq('D4 chunk keeps order', chunk(ids, 100).flat(), ids);
        eq('D4 paid: all copied', planDuplicateCopies(ids, null).copy.length, 235);
        const free = planDuplicateCopies(ids.slice(0, 15), 12);
        eq('D4 Free: first 12 of 15 copied, 3 left', [free.copy.length, free.left.length, free.copy[0], free.left[0]], [12, 3, 'd0', 'd12']);
        eq('D4 Free with no slot left: none', planDuplicateCopies(ids.slice(0, 3), 0).copy.length, 0);
        eq('D4 Free under the limit: all', planDuplicateCopies(ids.slice(0, 5), 12).left.length, 0);
    }

    // ------------------------------------------------------------------ 12 (C2): lists load every page
    {
        const table = Array.from({ length: 2345 }, (_, i) => i);
        let calls = 0;
        const page = async (from: number, to: number) => { calls++; return { data: table.slice(from, to + 1), error: null }; };
        const all = await fetchAllRows(page, { pageSize: 1000 });
        eq('C2 every row loaded (2,345 > old caps)', [all.rows.length, all.rows[2344], calls, all.truncated], [2345, 2344, 3, false]);
        const exact = await fetchAllRows(async (f, t) => ({ data: table.slice(0, 2000).slice(f, t + 1), error: null }), { pageSize: 1000 });
        eq('C2 exact multiple of the page size', exact.rows.length, 2000);
        const failing = await fetchAllRows(async (f, t) => (f === 0 ? { data: table.slice(f, t + 1), error: null } : { data: null, error: { message: 'boom' } }), { pageSize: 1000 });
        eq('C2 a failing later page keeps the loaded rows', [failing.rows.length, (failing.error as any)?.message], [1000, 'boom']);
        const capped = await fetchAllRows(page, { pageSize: 1000, maxRows: 2000 });
        eq('C2 safety stop reported', [capped.rows.length, capped.truncated], [2000, true]);
    }

    // ------------------------------------------------------------------ 13 (A6): signed AND declined badges
    {
        const row = (id: string, extra: Record<string, unknown>) => mapDocumentRow({ id, job_id: 'j', type: 'Estimate', created_at: '2026-01-01', ...extra });
        const signed = row('s', { clientSignedAt: '2026-11-01' });
        const declined = row('d', { clientDeclinedAt: '2026-11-02' });
        const seen = row('v', { clientDeclinedAt: '2026-11-02', viewedByProvider: 'true' });
        const draft = row('x', { status: 'Draft' });
        eq('A6 summary carries the decline', (declined.data as any).clientDeclinedAt, '2026-11-02');
        eq('A6 signed badge', [isUnseenClientSignedDocument(signed), isUnseenClientDecision(signed)], [true, true]);
        eq('A6 decline badges', [isUnseenClientDeclinedDocument(declined), isUnseenClientDecision(declined), isUnseenClientSignedDocument(declined)], [true, true, false]);
        eq('A6 seen decline does not badge', isUnseenClientDecision(seen), false);
        eq('A6 draft does not badge', isUnseenClientDecision(draft), false);
        eq('A6 count over any age', [signed, declined, seen, draft].filter(isUnseenClientDecision).length, 2);
        const full = { id: 'd', jobId: 'j', type: 'Estimate', createdAt: '2026-01-01', data: { lineItems: [], status: 'Sent' } } as unknown as FormDataType;
        const merged = mergeDocuments([full], [declined]);
        eq('A6 a decline reaches an open full copy', [(merged[0].data as any).clientDeclinedAt, Array.isArray((merged[0].data as any).lineItems)], ['2026-11-02', true]);
    }

    // ------------------------------------------------------------------ 14 (D6): price book defaults
    {
        eq('D6 new items start at 50% markup', PRICE_BOOK_DEFAULT_MARKUP, 50);
        eq('D6 $100 cost suggests $150', priceFromMarkup(100, PRICE_BOOK_DEFAULT_MARKUP), 150);
        const book = new Map([
            ['a', { id: 'a', rate: 40, unit_cost: 25 }],
            ['b', { id: 'b', rate: 15, unit_cost: 6 }],
        ]);
        const comps = [{ item_id: 'a', quantity: 2 }, { item_id: 'b', quantity: 1, override_price: 20 }, { item_id: 'c', quantity: 1, is_custom: true, override_price: 5, custom_cost: 2 }];
        eq('D6 kit price = sum of the parts (old)', priceBookKitTotals(comps, book), { cost: 58, retail: 105 });
        eq('D6 kit priced at its parts follows them', kitPriceIsManual({ rate: 105, assembly_items: comps }, book), false);
        eq('D6 kit priced by hand keeps its price', kitPriceIsManual({ rate: 120, assembly_items: comps }, book), true);
    }

    // ------------------------------------------------------------------ 11 (C1): theme + language follow the account
    {
        const memory = () => {
            const m = new Map<string, string>();
            const store: KeyValueStore = { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } };
            return { m, store };
        };
        const settingsRemote = (rows: Record<string, unknown>, fail?: DbError) => {
            const upserts: Array<[string, unknown]> = [];
            const remote: SettingsRemote = {
                async read(_uid, keys) { return fail ? { data: null, error: fail } : { data: keys.filter(k => k in rows).map(k => ({ key: k, value: rows[k] })), error: null }; },
                async upsert(_uid, key, value) { if (fail) return { error: fail }; rows[key] = value; upserts.push([key, value]); return { error: null }; },
            };
            return { remote, upserts, rows };
        };
        const profileRemote = (fail?: DbError) => {
            const updates: unknown[] = [];
            const remote: ProfilePrefsRemote = { async update(_uid, patch) { if (fail) return { error: fail }; updates.push(patch); return { error: null }; } };
            return { remote, updates };
        };
        const MISSING: DbError = { code: '42P01', message: 'relation "public.user_settings" does not exist' };
        const OFFLINE: DbError = { message: 'offline' };

        eq('C1 invalid values dropped', normalizeUiPrefs({ theme: 'purple', language: '<script>' }), {});
        // another device saved Dark: this device (light copy) follows the account at login
        {
            const { m, store } = memory();
            m.set(THEME_LOCAL_KEY, 'light');
            const s = settingsRemote({ [UI_PREFS_SETTING]: { theme: 'dark', language: 'French', updatedAt: 'x' } });
            const res = await syncUiPrefs(store, s.remote, profileRemote().remote, 'u1', { theme: 'light', language: 'English' });
            eq('C1 account theme applied at login', [res.action, res.prefs.theme, res.prefs.language], ['pull', 'dark', 'French']);
            eq('C1 device copy follows the account', [m.get(THEME_LOCAL_KEY), m.get(LANGUAGE_LOCAL_KEY)], ['dark', 'French']);
        }
        // migration 0500 not applied: the profile columns decide
        {
            const { store } = memory();
            const res = await syncUiPrefs(store, settingsRemote({}, MISSING).remote, profileRemote().remote, 'u1', { theme: 'blue', language: 'German' });
            eq('C1 falls back to profiles.theme / language', [res.prefs.theme, res.prefs.language], ['blue', 'German']);
        }
        // first login with this version: the profile values are copied into user_settings once
        {
            const { store } = memory();
            const s = settingsRemote({});
            await syncUiPrefs(store, s.remote, profileRemote().remote, 'u1', { theme: 'dark', language: 'Spanish' });
            await new Promise(r => setTimeout(r, 0));
            eq('C1 seeds user_settings from the profile', [(s.rows[UI_PREFS_SETTING] as any)?.theme, (s.rows[UI_PREFS_SETTING] as any)?.language], ['dark', 'Spanish']);
        }
        // a change made offline is not lost: it wins at the next login and is uploaded
        {
            const { m, store } = memory();
            const mode = await saveUiPrefs(store, settingsRemote({}, OFFLINE).remote, profileRemote(OFFLINE).remote, 'u1', { theme: 'dark', language: 'English' });
            eq('C1 offline save is queued', [mode, JSON.parse(m.get(uiPrefsPendingKey('u1')) || '{}').theme, m.get(THEME_LOCAL_KEY)], ['offline', 'dark', 'dark']);
            const s = settingsRemote({ [UI_PREFS_SETTING]: { theme: 'light' } });
            const p = profileRemote();
            const res = await syncUiPrefs(store, s.remote, p.remote, 'u1', { theme: 'light', language: 'English' });
            eq('C1 pending change pushed, not overwritten', [res.action, res.prefs.theme, (s.rows[UI_PREFS_SETTING] as any).theme], ['push', 'dark', 'dark']);
            eq('C1 profile columns updated too', p.updates, [{ theme: 'dark', language: 'English' }]);
            eq('C1 pending cleared after upload', m.has(uiPrefsPendingKey('u1')), false);
        }
        // Settings → Save already wrote the profile: only user_settings is written
        {
            const { store } = memory();
            const s = settingsRemote({});
            const p = profileRemote();
            const mode = await saveUiPrefs(store, s.remote, p.remote, 'u1', { theme: 'light', language: 'Italian' }, { skipProfile: true, now: () => 'T' });
            eq('C1 skipProfile writes user_settings only', [mode, p.updates.length, s.rows[UI_PREFS_SETTING]], ['account', 0, { theme: 'light', language: 'Italian', updatedAt: 'T' }]);
        }
        // user_settings missing but the profile saved: that is the account
        {
            const { m, store } = memory();
            const mode = await saveUiPrefs(store, settingsRemote({}, MISSING).remote, profileRemote().remote, 'u2', { theme: 'blue' });
            eq('C1 profile-only save counts as saved', [mode, m.has(uiPrefsPendingKey('u2'))], ['account', false]);
        }
    }

    console.log(`data-fidelity-check: ${passed} passed, ${failures.length} failed`);
    if (failures.length) {
        for (const f of failures) console.error(`FAIL ${f}`);
        process.exit(1);
    }
};

run().catch((e) => { console.error(e); process.exit(1); });
