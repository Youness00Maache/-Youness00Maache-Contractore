/**
 * Checks for lib/userDataSync.ts (user data that must follow the account: saved profit calculations, labor rate,
 * default signature, label sheet) and the logout cleanup in lib/account.ts.
 *   npx tsx scripts/user-data-sync-check.ts
 *
 * The owner's scenario is covered end to end against an in-memory fake account:
 * "I save a profit calculation, log out and log back in (or open another device), and it must still be there".
 */
import {
    LABEL_SHEET_LOCAL_KEY, LABEL_SHEET_SETTING, LABOR_RATE_LOCAL_KEY, LEGACY_PROFIT_KEY, SIGNATURE_LOCAL_PREFIX,
    claimLegacyProfitCalcs, deleteProfitCalc, isMissingTableError, loadProfitCalcs, mergeProfitCalcs, normalizeProfitCalc,
    parseProfitList, parseRate, pendingFieldKey, planFieldSync, profitCacheKey, profitCalcToRow, profitPendingKey,
    readProfitCalcsLocal, rowToProfitCalc, saveDefaultSignature, saveLaborRate, saveProfitCalc, saveSetting,
    syncLabelSheet, syncProfileValues,
    type DbError, type KeyValueStore, type ProfileValuesRemote, type ProfitCalcRemote, type ProfitCalcRow, type SavedProfitCalc, type SettingsRemote,
} from '../lib/userDataSync.ts';
import { LABOR_RATE_STORAGE_KEY } from '../lib/finance.ts';

let failures = 0;
let passes = 0;
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

// ------------------------------------------------------------------------------ fakes
/** localStorage-like store (also usable as globalThis.localStorage for lib/account.ts). */
class MemoryStorage implements KeyValueStore {
    map = new Map<string, string>();
    full = false;
    get length() { return this.map.size; }
    key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
    getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
    setItem(k: string, v: string) { if (this.full) throw new Error('QuotaExceededError'); this.map.set(k, String(v)); }
    removeItem(k: string) { this.map.delete(k); }
    clear() { this.map.clear(); }
}

const MISSING_TABLE: DbError = { code: 'PGRST205', message: "Could not find the table 'public.profit_calculations' in the schema cache" };
const NETWORK: DbError = { message: 'TypeError: Failed to fetch' };
const CHECK: DbError = { code: '23514', message: 'new row violates check constraint' };

type Mode = 'ok' | 'missing' | 'network';

/** In-memory "account": rows per user, like the real table with owner RLS. */
class FakeAccount {
    profit = new Map<string, ProfitCalcRow & { user_id: string }>();
    profiles = new Map<string, { default_labor_rate: number | null; default_signature_url: string | null }>();
    settings = new Map<string, unknown>(); // `${uid}|${key}`
    mode: Mode = 'ok';
    rejectIds = new Set<string>();
    upserts = 0;
    err(): DbError | null { return this.mode === 'missing' ? MISSING_TABLE : this.mode === 'network' ? NETWORK : null; }

    profitRemote(): ProfitCalcRemote {
        return {
            list: async (uid) => {
                const e = this.err();
                if (e) return { data: null, error: e };
                return { data: Array.from(this.profit.values()).filter((r) => r.user_id === uid).map((r) => ({ ...r })), error: null };
            },
            upsert: async (rows) => {
                this.upserts++;
                const e = this.err();
                if (e) return { error: e };
                if (rows.some((r) => this.rejectIds.has(r.id))) return { error: CHECK };
                for (const r of rows) {
                    if (!r.user_id) return { error: { code: '42501', message: 'row-level security' } };
                    this.profit.set(r.id, JSON.parse(JSON.stringify(r)));
                }
                return { error: null };
            },
            remove: async (uid, id) => {
                const e = this.err();
                if (e) return { error: e };
                const row = this.profit.get(id);
                if (row && row.user_id === uid) this.profit.delete(id);
                return { error: null };
            },
        };
    }

    profileRemote(): ProfileValuesRemote {
        return {
            read: async (uid) => {
                if (this.mode === 'network') return { data: null, error: NETWORK };
                return { data: { ...(this.profiles.get(uid) || { default_labor_rate: null, default_signature_url: null }) }, error: null };
            },
            update: async (uid, patch) => {
                if (this.mode === 'network') return { error: NETWORK };
                const cur = this.profiles.get(uid) || { default_labor_rate: null, default_signature_url: null };
                this.profiles.set(uid, { ...cur, ...patch } as typeof cur);
                return { error: null };
            },
        };
    }

    settingsRemote(): SettingsRemote {
        return {
            read: async (uid, keys) => {
                const e = this.err();
                if (e) return { data: null, error: e };
                return { data: keys.filter((k) => this.settings.has(`${uid}|${k}`)).map((k) => ({ key: k, value: this.settings.get(`${uid}|${k}`) })), error: null };
            },
            upsert: async (uid, key, value) => {
                const e = this.err();
                if (e) return { error: e };
                this.settings.set(`${uid}|${key}`, value);
                return { error: null };
            },
        };
    }
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const calc = (id: string, name: string, date: string, extra: Partial<SavedProfitCalc> = {}): SavedProfitCalc => ({
    id, name, date, items: [{ id: 'l1', description: 'Materials', cost: 100, charge: 150 }], vatRate: 8, vatEnabled: false, margin: 33.3, ...extra,
});
const ID1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ID2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const ID3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const names = (list: SavedProfitCalc[]) => list.map((c) => c.name);

const run = async () => {
    // ---------------------------------------------------------------- helpers
    eq('missing table: PGRST205', isMissingTableError(MISSING_TABLE), true);
    eq('missing table: 42P01', isMissingTableError({ code: '42P01', message: 'relation "public.user_settings" does not exist' }), true);
    eq('missing table: network is not', isMissingTableError(NETWORK), false);
    eq('missing table: null', isMissingTableError(null), false);
    eq('labor rate key matches lib/finance.ts', LABOR_RATE_LOCAL_KEY, LABOR_RATE_STORAGE_KEY);
    eq('parseRate', [parseRate('55'), parseRate(0), parseRate(-3), parseRate('abc'), parseRate(null), parseRate(45.555)], [55, null, null, null, null, 45.56]);

    // ---------------------------------------------------------------- normalize / merge
    {
        const legacy = { id: '1699999999999', name: '  Kitchen  ', date: 'not a date', items: [{ description: 'Tile', cost: '12.5', charge: 'x' }, null], vatRate: 250, vatEnabled: true, margin: null };
        const n = normalizeProfitCalc(legacy, () => ID1, () => '2026-01-01T00:00:00.000Z')!;
        eq('normalize: non-uuid id replaced', n.id, ID1);
        eq('normalize: name trimmed', n.name, 'Kitchen');
        eq('normalize: bad date → now', n.date, '2026-01-01T00:00:00.000Z');
        eq('normalize: items cleaned', n.items.map((i) => [i.description, i.cost, i.charge]), [['Tile', 12.5, 0]]);
        eq('normalize: tax rate clamped', n.vatRate, 100);
        eq('normalize: margin null → 0', n.margin, 0);
        eq('normalize: no items → null', normalizeProfitCalc({ name: 'x' }), null);
        eq('normalize: long name clamped', normalizeProfitCalc({ name: 'n'.repeat(500), items: [] })!.name.length, 120);
        eq('normalize: empty name gets a title', normalizeProfitCalc({ name: '  ', items: [] })!.name, 'Untitled calculation');
        eq('parse: not an array', parseProfitList({}), []);
        eq('parse: drops junk', parseProfitList([null, 3, { items: [] }]).length, 1);
        const merged = mergeProfitCalcs([calc(ID1, 'old', '2026-01-01T00:00:00Z'), calc(ID2, 'b', '2026-02-01T00:00:00Z')], [calc(ID1, 'new', '2026-03-01T00:00:00Z')]);
        eq('merge: override wins and newest first', names(merged), ['new', 'b']);
        const row = profitCalcToRow(calc(ID1, 'Deck', '2026-03-01T10:00:00.000Z'), A);
        eq('row: columns', [row.id, row.user_id, row.name, row.tax_rate, row.tax_enabled, row.saved_at], [ID1, A, 'Deck', 8, false, '2026-03-01T10:00:00.000Z']);
        eq('row → calc round trip', rowToProfitCalc(row), calc(ID1, 'Deck', '2026-03-01T10:00:00.000Z'));
        eq('row without uuid ignored', rowToProfitCalc({ id: 'x', items: [] }), null);
    }

    // ---------------------------------------------------------------- legacy claim
    {
        const s = new MemoryStorage();
        s.setItem(LEGACY_PROFIT_KEY, JSON.stringify([calc(ID1, 'Legacy 1', '2025-05-01T00:00:00Z'), calc(ID2, 'Legacy 2', '2025-06-01T00:00:00Z')]));
        eq('claim: count', claimLegacyProfitCalcs(s, A), 2);
        eq('claim: legacy key removed', s.getItem(LEGACY_PROFIT_KEY), null);
        eq('claim: in A pending', names(parseProfitList(JSON.parse(s.getItem(profitPendingKey(A))!))), ['Legacy 2', 'Legacy 1']);
        eq('claim: idempotent', claimLegacyProfitCalcs(s, A), 0);
        eq('claim: other user gets nothing', readProfitCalcsLocal(s, B), []);
        const full = new MemoryStorage();
        full.setItem(LEGACY_PROFIT_KEY, JSON.stringify([calc(ID1, 'L', '2025-05-01T00:00:00Z')]));
        full.full = true;
        eq('claim: storage full → nothing claimed', claimLegacyProfitCalcs(full, A), 0);
        eq('claim: storage full → legacy kept (only copy)', full.getItem(LEGACY_PROFIT_KEY) !== null, true);
    }

    // ---------------------------------------------------------------- migration not applied yet (degrades to the device)
    {
        const s = new MemoryStorage();
        const acct = new FakeAccount();
        acct.mode = 'missing';
        s.setItem(LEGACY_PROFIT_KEY, JSON.stringify([calc(ID1, 'Legacy', '2025-05-01T00:00:00Z')]));
        const res = await loadProfitCalcs(s, acct.profitRemote(), A);
        eq('no table: mode device', res.mode, 'device');
        eq('no table: legacy shown', names(res.list), ['Legacy']);
        eq('no table: pending count', res.pending, 1);
        const saved = await saveProfitCalc(s, acct.profitRemote(), A, calc(ID2, 'New', '2026-01-01T00:00:00Z'));
        eq('no table: save → device', saved.mode, 'device');
        eq('no table: both on device', names(readProfitCalcsLocal(s, A)), ['New', 'Legacy']);
        // the migration gets applied: next load uploads everything once
        acct.mode = 'ok';
        const after = await loadProfitCalcs(s, acct.profitRemote(), A);
        eq('applied: mode account', after.mode, 'account');
        eq('applied: uploaded 2', after.uploaded, 2);
        eq('applied: nothing pending', [after.pending, s.getItem(profitPendingKey(A))], [0, null]);
        eq('applied: rows belong to A', Array.from(acct.profit.values()).map((r) => r.user_id), [A, A]);
        eq('applied: cache written', names(parseProfitList(JSON.parse(s.getItem(profitCacheKey(A))!))), ['New', 'Legacy']);
        const again = await loadProfitCalcs(s, acct.profitRemote(), A);
        eq('applied: second load uploads nothing', again.uploaded, 0);
    }

    // ---------------------------------------------------------------- owner scenario: save, log out, log in, another device
    {
        const acct = new FakeAccount();
        const device1 = new MemoryStorage();
        const sessionStore = new MemoryStorage();
        (globalThis as any).localStorage = device1;
        (globalThis as any).sessionStorage = sessionStore;
        const { clearUserBrowserStorage } = await import('../lib/account.ts');

        await loadProfitCalcs(device1, acct.profitRemote(), A);
        const r1 = await saveProfitCalc(device1, acct.profitRemote(), A, calc(ID1, 'Bathroom – Smith', '2026-11-13T09:00:00Z'));
        eq('scenario: saved to account', r1.mode, 'account');
        // offline save on the same device
        acct.mode = 'network';
        const r2 = await saveProfitCalc(device1, acct.profitRemote(), A, calc(ID2, 'Roof – Jones', '2026-11-13T10:00:00Z'));
        eq('scenario: offline save kept on device', r2.mode, 'offline');
        acct.mode = 'ok';
        device1.setItem(LABOR_RATE_LOCAL_KEY, '60');
        device1.setItem('cd.pricebook.view', 'list');

        clearUserBrowserStorage(); // logout
        eq('logout: account copy wiped', device1.getItem(profitCacheKey(A)), null);
        eq('logout: not-yet-uploaded item kept', names(parseProfitList(JSON.parse(device1.getItem(profitPendingKey(A)) || '[]'))), ['Roof – Jones']);
        eq('logout: unscoped labor rate wiped', device1.getItem(LABOR_RATE_LOCAL_KEY), null);
        eq('logout: device preference kept', device1.getItem('cd.pricebook.view'), 'list');
        eq('logout: user B sees nothing of A', readProfitCalcsLocal(device1, B), []);

        const relogin = await loadProfitCalcs(device1, acct.profitRemote(), A); // log back in
        eq('relogin: both calculations there', names(relogin.list), ['Roof – Jones', 'Bathroom – Smith']);
        eq('relogin: offline one uploaded', relogin.uploaded, 1);

        const device2 = new MemoryStorage(); // another device
        const other = await loadProfitCalcs(device2, acct.profitRemote(), A);
        eq('device 2: same list', names(other.list), ['Roof – Jones', 'Bathroom – Smith']);
        eq('device 2: user B list is empty', (await loadProfitCalcs(device2, acct.profitRemote(), B)).list, []);

        // legacy list of the old app is not wiped by logout any more (it is the only copy until uploaded)
        device1.setItem(LEGACY_PROFIT_KEY, JSON.stringify([calc(ID3, 'Old app calc', '2025-01-01T00:00:00Z')]));
        clearUserBrowserStorage();
        eq('logout: legacy list kept', device1.getItem(LEGACY_PROFIT_KEY) !== null, true);
        const withLegacy = await loadProfitCalcs(device1, acct.profitRemote(), A);
        eq('login: legacy uploaded to the account', [withLegacy.uploaded, acct.profit.has(ID3)], [1, true]);
    }

    // ---------------------------------------------------------------- partial upload failure
    {
        const s = new MemoryStorage();
        const acct = new FakeAccount();
        s.setItem(profitPendingKey(A), JSON.stringify([calc(ID1, 'Good', '2026-01-01T00:00:00Z'), calc(ID2, 'Bad', '2026-01-02T00:00:00Z')]));
        acct.rejectIds.add(ID2);
        const res = await loadProfitCalcs(s, acct.profitRemote(), A);
        eq('partial: good one uploaded', [res.uploaded, acct.profit.has(ID1)], [1, true]);
        eq('partial: bad one still pending and shown', [res.pending, names(res.list)], [1, ['Bad', 'Good']]);
    }

    // ---------------------------------------------------------------- network error on load
    {
        const s = new MemoryStorage();
        const acct = new FakeAccount();
        s.setItem(profitCacheKey(A), JSON.stringify([calc(ID1, 'Cached', '2026-01-01T00:00:00Z')]));
        s.setItem(profitPendingKey(A), JSON.stringify([calc(ID2, 'Pending', '2026-01-02T00:00:00Z')]));
        acct.mode = 'network';
        const res = await loadProfitCalcs(s, acct.profitRemote(), A);
        eq('offline load: mode', res.mode, 'offline');
        eq('offline load: cache + pending', names(res.list), ['Pending', 'Cached']);
        let threw = false;
        const throwing: ProfitCalcRemote = { list: async () => { throw new Error('boom'); }, upsert: async () => { throw new Error('boom'); }, remove: async () => { throw new Error('boom'); } };
        try { await loadProfitCalcs(s, throwing, A); } catch { threw = true; }
        eq('load never throws', threw, false);
    }

    // ---------------------------------------------------------------- save failures / delete
    {
        const s = new MemoryStorage();
        const acct = new FakeAccount();
        acct.mode = 'network';
        s.full = true;
        eq('save: storage full + offline → failed', (await saveProfitCalc(s, acct.profitRemote(), A, calc(ID1, 'X', '2026-01-01T00:00:00Z'))).mode, 'failed');
        s.full = false;
        acct.mode = 'ok';
        await saveProfitCalc(s, acct.profitRemote(), A, calc(ID1, 'In account', '2026-01-01T00:00:00Z'));
        acct.mode = 'network';
        await saveProfitCalc(s, acct.profitRemote(), A, calc(ID2, 'Only here', '2026-01-02T00:00:00Z'));
        eq('delete offline: account item kept', (await deleteProfitCalc(s, acct.profitRemote(), A, ID1)).ok, false);
        eq('delete offline: account item still listed', names(readProfitCalcsLocal(s, A)).includes('In account'), true);
        eq('delete offline: device-only item deleted', (await deleteProfitCalc(s, acct.profitRemote(), A, ID2)).ok, true);
        eq('delete offline: device-only gone', names(readProfitCalcsLocal(s, A)).includes('Only here'), false);
        acct.mode = 'ok';
        eq('delete online', (await deleteProfitCalc(s, acct.profitRemote(), A, ID1)).ok, true);
        eq('delete online: gone everywhere', [acct.profit.has(ID1), readProfitCalcsLocal(s, A).length], [false, 0]);
        // updating an existing calculation keeps one row
        await saveProfitCalc(s, acct.profitRemote(), A, calc(ID3, 'Deck', '2026-01-01T00:00:00Z'));
        await saveProfitCalc(s, acct.profitRemote(), A, calc(ID3, 'Deck', '2026-01-05T00:00:00Z', { margin: 40 }));
        eq('update: one row, new values', [acct.profit.size, acct.profit.get(ID3)?.margin], [1, 40]);
    }

    // ---------------------------------------------------------------- planFieldSync
    eq('plan: only device → push', planFieldSync({ account: null, local: 5 }), 'push');
    eq('plan: only account → pull', planFieldSync({ account: 5, local: null }), 'pull');
    eq('plan: account differs → pull (account wins)', planFieldSync({ account: 5, local: 6 }), 'pull');
    eq('plan: pending device save → push', planFieldSync({ account: 5, local: 6, localPending: true }), 'push');
    eq('plan: pending but equal → none', planFieldSync({ account: 6, local: 6, localPending: true }), 'none');
    eq('plan: same → none', planFieldSync({ account: 'a', local: 'a' }), 'none');
    eq('plan: nothing → none', planFieldSync({ account: '', local: null }), 'none');

    // ---------------------------------------------------------------- labor rate
    {
        const s = new MemoryStorage();
        const acct = new FakeAccount();
        s.setItem(LABOR_RATE_LOCAL_KEY, '60'); // typed in Job financials before this fix (device only)
        const r = await syncProfileValues(s, acct.profileRemote(), A);
        eq('rate: device-only value uploaded once', [r.laborRate, acct.profiles.get(A)?.default_labor_rate], ['push', 60]);
        s.removeItem(LABOR_RATE_LOCAL_KEY); // logout
        const r2 = await syncProfileValues(s, acct.profileRemote(), A);
        eq('rate: after logout comes back from the account', [r2.laborRate, s.getItem(LABOR_RATE_LOCAL_KEY)], ['pull', '60']);
        acct.mode = 'network';
        eq('rate: offline save → offline', await saveLaborRate(s, acct.profileRemote(), A, 75), 'offline');
        eq('rate: offline save pending', s.getItem(pendingFieldKey('labor_rate', A)), '75');
        acct.mode = 'ok';
        const r3 = await syncProfileValues(s, acct.profileRemote(), A);
        eq('rate: pending pushed at next login', [r3.laborRate, acct.profiles.get(A)?.default_labor_rate, s.getItem(pendingFieldKey('labor_rate', A))], ['push', 75, null]);
        eq('rate: online save', [await saveLaborRate(s, acct.profileRemote(), A, 80), acct.profiles.get(A)?.default_labor_rate], ['account', 80]);
        eq('rate: invalid not saved', await saveLaborRate(s, acct.profileRemote(), A, 0), 'failed');
        acct.mode = 'network';
        eq('rate: profile unreadable → skipped', (await syncProfileValues(s, acct.profileRemote(), A)).skipped, true);
    }

    // ---------------------------------------------------------------- default signature
    {
        const s = new MemoryStorage();
        const acct = new FakeAccount();
        const sigA = 'data:image/png;base64,AAAA';
        const sigB = 'data:image/png;base64,BBBB';
        s.setItem(SIGNATURE_LOCAL_PREFIX + A, sigA); // "Save as my default" before this fix (device only)
        eq('sig: device-only uploaded', [(await syncProfileValues(s, acct.profileRemote(), A)).signature, acct.profiles.get(A)?.default_signature_url], ['push', sigA]);
        acct.profiles.set(A, { default_labor_rate: null, default_signature_url: sigB }); // changed on another device
        eq('sig: account change pulled', [(await syncProfileValues(s, acct.profileRemote(), A)).signature, s.getItem(SIGNATURE_LOCAL_PREFIX + A)], ['pull', sigB]);
        acct.mode = 'network';
        eq('sig: offline save', await saveDefaultSignature(s, acct.profileRemote(), A, sigA), 'offline');
        s.setItem(SIGNATURE_LOCAL_PREFIX + A, sigA);
        acct.mode = 'ok';
        eq('sig: offline save wins at next login', [(await syncProfileValues(s, acct.profileRemote(), A)).signature, acct.profiles.get(A)?.default_signature_url], ['push', sigA]);
        acct.mode = 'network';
        await saveDefaultSignature(s, acct.profileRemote(), A, null); // removed while offline
        s.removeItem(SIGNATURE_LOCAL_PREFIX + A);
        acct.mode = 'ok';
        eq('sig: offline removal applied at next login', [(await syncProfileValues(s, acct.profileRemote(), A)).signature, acct.profiles.get(A)?.default_signature_url], ['clear', null]);
        acct.profiles.set(A, { default_labor_rate: null, default_signature_url: 'https://cdn.example/sig.png' });
        s.setItem(SIGNATURE_LOCAL_PREFIX + A, sigA);
        await syncProfileValues(s, acct.profileRemote(), A);
        eq('sig: https account value → stale device copy removed', s.getItem(SIGNATURE_LOCAL_PREFIX + A), null);
        eq('sig: other user untouched', acct.profiles.get(B), undefined);
    }

    // ---------------------------------------------------------------- label sheet (user_settings)
    {
        const s = new MemoryStorage();
        const acct = new FakeAccount();
        acct.mode = 'missing';
        s.setItem(LABEL_SHEET_LOCAL_KEY, 'avery-5163');
        eq('sheet: no table → unavailable', await syncLabelSheet(s, acct.settingsRemote(), A), 'unavailable');
        eq('sheet: no table → device copy kept', s.getItem(LABEL_SHEET_LOCAL_KEY), 'avery-5163');
        eq('sheet: save without table → device', await saveSetting(s, acct.settingsRemote(), A, LABEL_SHEET_SETTING, 'avery-5164'), 'device');
        s.setItem(LABEL_SHEET_LOCAL_KEY, 'avery-5164');
        acct.mode = 'ok';
        eq('sheet: pending pushed once applied', [await syncLabelSheet(s, acct.settingsRemote(), A), acct.settings.get(`${A}|${LABEL_SHEET_SETTING}`)], ['push', 'avery-5164']);
        const d2 = new MemoryStorage();
        eq('sheet: other device pulls it', [await syncLabelSheet(d2, acct.settingsRemote(), A), d2.getItem(LABEL_SHEET_LOCAL_KEY)], ['pull', 'avery-5164']);
        acct.settings.set(`${A}|${LABEL_SHEET_SETTING}`, '<script>');
        eq('sheet: invalid account value ignored', await syncLabelSheet(d2, acct.settingsRemote(), A), 'push');
    }

    console.log(`user-data-sync-check: ${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
};

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
