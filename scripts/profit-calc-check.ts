/**
 * Checks for the restored Simple / Advanced profit calculator (lib/profitCalc.ts), its saved settings
 * (lib/userDataSync.ts, inside the profit_calculations.items jsonb), the first-run tour "seen" setting and the
 * help guides (components/help/helpContent.ts).
 *   npx tsx scripts/profit-calc-check.ts
 */
import { applyTargetMargin, marginHealth, priceForMargin, profitSummary, targetMarginError, DEFAULT_TAX_RATE, DEFAULT_TARGET_MARGIN } from '../lib/profitCalc.ts';
import {
    HELP_TOUR_SETTING, PROFIT_SETTINGS_ITEM_ID, helpTourLocalKey, loadTourSeen, normalizeProfitCalc, pendingFieldKey, profitCalcToRow,
    rowToProfitCalc, saveTourSeen, type DbError, type KeyValueStore, type SavedProfitCalc, type SettingsRemote,
} from '../lib/userDataSync.ts';
import { HELP_GUIDES, getGuide, searchGuides } from '../components/help/helpContent.ts';
import { TOUR_STEPS } from '../components/help/AppTour.tsx';
import { parseView } from '../lib/routes.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

class MemoryStorage implements KeyValueStore {
    map = new Map<string, string>();
    getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
    setItem(k: string, v: string) { this.map.set(k, String(v)); }
    removeItem(k: string) { this.map.delete(k); }
}

const ID = '11111111-1111-4111-8111-111111111111';
const UID = '22222222-2222-4222-8222-222222222222';

const run = async () => {
    // ------------------------------------------------------------ old app's math (git 25ae5cc)
    const items = [
        { id: 'a', description: 'Materials', cost: 600, charge: 900 },
        { id: 'b', description: 'Labor', cost: 400, charge: 0 },
        { id: 'c', description: 'Permit fee', cost: 0, charge: 150 },
    ];
    const s = profitSummary(items, false, 20);
    eq('totals', [s.totalCost, s.totalCharge, s.profit], [1000, 1050, 50]);
    eq('margin = profit / revenue', s.margin.toFixed(4), ((50 / 1050) * 100).toFixed(4));
    eq('markup = profit / cost', s.markup, 5);
    eq('no tax when off', [s.taxAmount, s.totalWithTax], [0, 1050]);
    const t = profitSummary(items, true, 20);
    eq('VAT 20% on the price, profit unchanged', [t.taxAmount, t.totalWithTax, t.profit], [210, 1260, 50]);
    eq('tax rate clamped to 100', profitSummary(items, true, 250).taxAmount, 1050);
    eq('empty → zeros', profitSummary([], true, 20), { totalCost: 0, totalCharge: 0, profit: 0, margin: 0, markup: 0, taxAmount: 0, totalWithTax: 0 });
    eq('old defaults: margin 30, VAT 20', [DEFAULT_TARGET_MARGIN, DEFAULT_TAX_RATE], [30, 20]);

    eq('price for 30% margin', priceForMargin(700, 30), 1000);
    const priced = applyTargetMargin(items, 30);
    eq('Calculate pricing: lines with a cost priced for the margin', priced.map((i) => i.charge), [857.14, 571.43, 150]);
    ok('Calculate pricing: whole job lands on ~30%', Math.abs(profitSummary(priced.slice(0, 2), false, 0).margin - 30) < 0.01);
    eq('30% after cent rounding counts as healthy', marginHealth(profitSummary(priced.slice(0, 2), false, 0).margin, true).tone, 'success');
    eq('target margin checks', [targetMarginError(30), targetMarginError(100), targetMarginError(-1), targetMarginError(NaN)], [null, 'Enter a margin from 0 to 99.9%.', 'Enter a margin from 0 to 99.9%.', 'Enter a margin from 0 to 99.9%.']);
    eq('old color bands', [marginHealth(35, true).tone, marginHealth(20, true).tone, marginHealth(10, true).tone, marginHealth(-5, true).label, marginHealth(0, false).tone], ['success', 'warning', 'danger', 'Loss', 'muted']);

    // ------------------------------------------------------------ saved settings travel inside items jsonb
    const calc: SavedProfitCalc = {
        id: ID, name: 'Deck', date: '2026-11-13T10:00:00.000Z', items: items.slice(0, 2), vatRate: 20, vatEnabled: true, margin: 4.76,
        settings: { mode: 'advanced', targetMargin: 35 },
    };
    const row = profitCalcToRow(calc, UID);
    eq('row: settings entry appended to items', row.items.length, 3);
    eq('row: settings entry id', (row.items[2] as { id: string }).id, PROFIT_SETTINGS_ITEM_ID);
    ok('row: items is still an array of objects (jsonb check)', Array.isArray(row.items) && row.items.every((i) => typeof i === 'object'));
    const back = rowToProfitCalc(JSON.parse(JSON.stringify(row)))!;
    eq('round trip: settings restored', back.settings, { mode: 'advanced', targetMargin: 35 });
    eq('round trip: settings entry is not a line', back.items.map((i) => i.description), ['Materials', 'Labor']);
    eq('round trip: tax columns', [back.vatEnabled, back.vatRate], [true, 20]);
    const legacy = normalizeProfitCalc({ id: ID, name: 'Old', date: '2025-01-01T00:00:00.000Z', items: [{ description: 'Tile', cost: 5, charge: 9 }], vatRate: 20, vatEnabled: false, margin: 44 }, () => 'x')!;
    ok('legacy calc: no settings key', !('settings' in legacy));
    eq('legacy row unchanged (no settings entry)', profitCalcToRow(legacy).items.length, 1);
    eq('device copy keeps settings', normalizeProfitCalc(JSON.parse(JSON.stringify(calc)))!.settings, calc.settings);
    eq('bad settings cleaned', normalizeProfitCalc({ items: [], settings: { mode: 'weird', targetMargin: 500 } })!.settings, { mode: 'simple', targetMargin: 99.9 });

    // ------------------------------------------------------------ first-run tour seen (user_settings 'help.tour')
    type Mode = 'ok' | 'missing' | 'network';
    const MISSING: DbError = { code: 'PGRST205', message: "Could not find the table 'public.user_settings' in the schema cache" };
    const makeRemote = () => {
        const rows = new Map<string, unknown>();
        let mode: Mode = 'ok';
        const err = () => (mode === 'missing' ? MISSING : mode === 'network' ? { message: 'Failed to fetch' } : null);
        const remote: SettingsRemote = {
            async read(uid, keys) { const e = err(); if (e) return { data: null, error: e }; return { data: keys.filter((k) => rows.has(`${uid}|${k}`)).map((k) => ({ key: k, value: rows.get(`${uid}|${k}`) })), error: null }; },
            async upsert(uid, key, value) { const e = err(); if (e) return { error: e }; rows.set(`${uid}|${key}`, value); return { error: null }; },
        };
        return { remote, rows, setMode: (m: Mode) => { mode = m; } };
    };
    {
        const acc = makeRemote();
        const dev1 = new MemoryStorage();
        eq('tour: new user → not seen', await loadTourSeen(dev1, acc.remote, UID), false);
        eq('tour: finish → saved to the account', await saveTourSeen(dev1, acc.remote, UID), 'account');
        ok('tour: account row written', (acc.rows.get(`${UID}|${HELP_TOUR_SETTING}`) as { seen?: boolean })?.seen === true);
        eq('tour: same device → seen', await loadTourSeen(dev1, acc.remote, UID), true);
        const dev2 = new MemoryStorage();
        eq('tour: other device / after logout → seen (from the account)', await loadTourSeen(dev2, acc.remote, UID), true);
        eq('tour: device copy written after reading the account', dev2.getItem(helpTourLocalKey(UID)), '1');
        acc.setMode('network');
        eq('tour: offline + nothing on device → unknown (do not show)', await loadTourSeen(new MemoryStorage(), acc.remote, UID), null);
        acc.setMode('missing');
        eq('tour: table missing → show it', await loadTourSeen(new MemoryStorage(), acc.remote, UID), false);
    }
    {
        const acc = makeRemote();
        const dev = new MemoryStorage();
        acc.setMode('network');
        eq('tour: finish while offline → kept on device', await saveTourSeen(dev, acc.remote, UID), 'offline');
        eq('tour: pending mark', dev.getItem(pendingFieldKey(HELP_TOUR_SETTING, UID)), '1');
        acc.setMode('ok');
        eq('tour: still seen on this device', await loadTourSeen(dev, acc.remote, UID), true);
        await new Promise((r) => setTimeout(r, 0));
        ok('tour: pending save retried into the account', (acc.rows.get(`${UID}|${HELP_TOUR_SETTING}`) as { seen?: boolean })?.seen === true);
        eq('tour: pending mark cleared', dev.getItem(pendingFieldKey(HELP_TOUR_SETTING, UID)), null);
    }

    // ------------------------------------------------------------ help guides
    const ids = HELP_GUIDES.map((g) => g.id);
    eq('guides: ids unique', new Set(ids).size, ids.length);
    for (const g of HELP_GUIDES) {
        ok(`guide ${g.id}: 3+ steps`, g.steps.length >= 3);
        const all = [g.summary, ...g.steps.map((s) => s.text), ...(g.tips || [])].join(' ');
        ok(`guide ${g.id}: chips balanced`, (all.match(/\[\[/g) || []).length === (all.match(/\]\]/g) || []).length);
        ok(`guide ${g.id}: no undefined text`, !/undefined|NaN/.test(all));
        const path = g.appPath.split('#')[0];
        ok(`guide ${g.id}: app path ${g.appPath} is a real screen`, parseView(path, '', null).screen !== 'notFound');
    }
    for (const id of ['jobs', 'documents', 'ai', 'clients', 'inventory', 'pricebook', 'calculator', 'messages', 'reminders', 'quote-link', 'photos'] as const) {
        ok(`guide exists: ${id}`, !!getGuide(id));
    }
    eq('search: portal finds the clients guide', searchGuides('portal link').some((g) => g.id === 'clients'), true);
    eq('search: nothing', searchGuides('zzzz-nothing').length, 0);
    eq('/tutorials is the in-app help screen', parseView('/tutorials', '', null).screen, 'help');
    ok('tour: 5–8 steps', TOUR_STEPS.length >= 5 && TOUR_STEPS.length <= 8);

    console.log(`${passes} passed, ${failures} failed`);
    if (failures) process.exit(1);
};

void run();
