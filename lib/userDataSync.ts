/**
 * Account sync for user data that used to live only in the browser (owner report 2026-11-13:
 * "I save a profit calculation, log out and log back in, and it's gone").
 *
 * Pure logic with an injectable key/value store and remote, so scripts/user-data-sync-check.ts can test it
 * without a browser or a database. lib/userData.ts binds it to localStorage + Supabase.
 *
 * Browser keys (per user, so another account on the same device never sees or uploads them):
 *   cd.cache.<what>:<uid>     copy of what is in the account (wiped on logout, downloaded again at login)
 *   cd.pending.<what>:<uid>   saved on this device but not in the account yet (NEVER wiped on logout: it is
 *                             the only copy). Uploaded automatically, then removed.
 *   profit_calcs              legacy unscoped list (old app + this app before 2026-11-13); moved into
 *                             cd.pending.profit_calcs:<uid> of the first account that loads it, then removed.
 */

export interface KeyValueStore {
    getItem(key: string): string | null;
    /** may throw (quota / private mode) */
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface DbError { code?: string; message?: string; details?: string; hint?: string }

const errText = (err: DbError | null | undefined) => `${err?.message || ''} ${err?.details || ''}`;

/** The table of the 20261113000500 migration doesn't exist yet (or isn't in PostgREST's schema cache). */
export const isMissingTableError = (err: DbError | null | undefined): boolean =>
    !!err && (['42P01', 'PGRST205'].includes(String(err.code || ''))
        || /relation .* does not exist|could not find the table|schema cache/i.test(errText(err)));

/** "Where is it saved?" — shown to the user after a save. */
export type SyncMode =
    /** in the account (every device) */
    | 'account'
    /** the account tables aren't there yet (migration not applied): kept on this device, uploaded later */
    | 'device'
    /** network / server error: kept on this device, uploaded at the next load */
    | 'offline'
    /** not saved at all (browser storage blocked or full) */
    | 'failed';

const readJson = (store: KeyValueStore, key: string): unknown => {
    try {
        const raw = store.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeJson = (store: KeyValueStore, key: string, value: unknown): boolean => {
    try {
        store.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const newUuid = (): string => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const finite = (v: unknown, fallback = 0): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const validDate = (v: unknown): string | null => {
    if (typeof v !== 'string' || !v) return null;
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// =====================================================================================
// Saved profit calculations (components/ProfitCalculatorView.tsx)
// =====================================================================================
export interface ProfitCalcItem { id: string; description: string; cost: number; charge: number }

/**
 * Calculator inputs that are not lines or tax (old app's Simple / Advanced switch and its Target Margin).
 * Tax / VAT on/off and rate keep their own columns.
 */
export interface ProfitCalcSettings {
    mode: 'simple' | 'advanced';
    targetMargin: number;
}

/**
 * The settings travel inside the `items` jsonb array (no extra column) as one entry with this id; it is taken out
 * again when the row is read, so it never shows as a line.
 */
export const PROFIT_SETTINGS_ITEM_ID = '__calc_settings';

/** Same shape as the old localStorage `profit_calcs` entries (old app and this app), plus optional `settings`. */
export interface SavedProfitCalc {
    id: string;
    name: string;
    /** ISO time it was saved */
    date: string;
    items: ProfitCalcItem[];
    vatRate: number;
    vatEnabled: boolean;
    margin: number;
    settings?: ProfitCalcSettings;
}

/** public.profit_calculations row (migration 20261113000500). */
export interface ProfitCalcRow {
    id: string;
    user_id?: string;
    name: string;
    items: Array<ProfitCalcItem | { id: typeof PROFIT_SETTINGS_ITEM_ID; description: ''; cost: 0; charge: 0; settings: ProfitCalcSettings }>;
    tax_enabled: boolean;
    tax_rate: number;
    margin: number;
    saved_at: string;
}

export interface ProfitCalcRemote {
    list(userId: string): Promise<{ data: unknown[] | null; error: DbError | null }>;
    upsert(rows: ProfitCalcRow[]): Promise<{ error: DbError | null }>;
    remove(userId: string, id: string): Promise<{ error: DbError | null }>;
}

export const LEGACY_PROFIT_KEY = 'profit_calcs';
export const profitCacheKey = (uid: string) => `cd.cache.profit_calcs:${uid}`;
export const profitPendingKey = (uid: string) => `cd.pending.profit_calcs:${uid}`;

const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_LINES = 500;

/** Cleans calculator settings from any source. Null = none (old calculations). */
export const normalizeProfitSettings = (raw: unknown): ProfitCalcSettings | null => {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    return {
        mode: s.mode === 'advanced' ? 'advanced' : 'simple',
        targetMargin: clamp(finite(s.targetMargin, 30), 0, 99.9),
    };
};

const isSettingsEntry = (i: Record<string, unknown>) => i.id === PROFIT_SETTINGS_ITEM_ID;

const normalizeProfitItem = (i: Record<string, unknown>, makeId: () => string): ProfitCalcItem => ({
    id: typeof i.id === 'string' && i.id ? i.id.slice(0, 64) : makeId(),
    description: String(i.description ?? '').slice(0, MAX_DESCRIPTION),
    cost: finite(i.cost),
    charge: finite(i.charge),
});

/** Cleans one saved calculation from any source (old app, this app, the database). Null = unusable. */
export const normalizeProfitCalc = (raw: unknown, makeId: () => string = newUuid, now: () => string = () => new Date().toISOString()): SavedProfitCalc | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.items)) return null;
    const name = String(r.name ?? '').trim().slice(0, MAX_NAME) || 'Untitled calculation';
    const entries = r.items.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object');
    const settingsEntry = entries.find(isSettingsEntry);
    const items: ProfitCalcItem[] = entries
        .filter((i) => !isSettingsEntry(i))
        .slice(0, MAX_LINES)
        .map((i) => normalizeProfitItem(i, makeId));
    const calc: SavedProfitCalc = {
        id: isUuid(r.id) ? r.id.toLowerCase() : makeId(),
        name,
        date: validDate(r.date) || now(),
        items,
        vatRate: clamp(finite(r.vatRate), 0, 100),
        vatEnabled: r.vatEnabled === true || r.vatEnabled === 'true',
        margin: finite(r.margin),
    };
    const settings = normalizeProfitSettings(r.settings ?? settingsEntry?.settings);
    if (settings) calc.settings = settings;
    return calc;
};

export const parseProfitList = (value: unknown): SavedProfitCalc[] => {
    if (!Array.isArray(value)) return [];
    const out: SavedProfitCalc[] = [];
    for (const raw of value) {
        const calc = normalizeProfitCalc(raw);
        if (calc) out.push(calc);
    }
    return out;
};

const byDateDesc = (a: SavedProfitCalc, b: SavedProfitCalc) => Date.parse(b.date) - Date.parse(a.date);

/** `overrides` win over `base` for the same id; newest first. */
export const mergeProfitCalcs = (base: SavedProfitCalc[], overrides: SavedProfitCalc[]): SavedProfitCalc[] => {
    const map = new Map<string, SavedProfitCalc>();
    base.forEach((c) => map.set(c.id, c));
    overrides.forEach((c) => map.set(c.id, c));
    return Array.from(map.values()).sort(byDateDesc);
};

export const profitCalcToRow = (calc: SavedProfitCalc, userId?: string): ProfitCalcRow => ({
    id: calc.id,
    ...(userId ? { user_id: userId } : {}),
    name: calc.name.trim().slice(0, MAX_NAME) || 'Untitled calculation',
    items: calc.settings
        ? [...calc.items.slice(0, MAX_LINES), { id: PROFIT_SETTINGS_ITEM_ID, description: '', cost: 0, charge: 0, settings: calc.settings }]
        : calc.items.slice(0, MAX_LINES),
    tax_enabled: !!calc.vatEnabled,
    tax_rate: clamp(finite(calc.vatRate), 0, 100),
    margin: clamp(finite(calc.margin), -1e9, 1e9),
    saved_at: validDate(calc.date) || new Date().toISOString(),
});

export const rowToProfitCalc = (row: unknown): SavedProfitCalc | null => {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    if (!isUuid(r.id)) return null;
    return normalizeProfitCalc({
        id: r.id, name: r.name, date: r.saved_at, items: r.items,
        vatRate: r.tax_rate, vatEnabled: r.tax_enabled, margin: r.margin,
    });
};

const readList = (store: KeyValueStore, key: string) => parseProfitList(readJson(store, key));
const writeList = (store: KeyValueStore, key: string, list: SavedProfitCalc[]): boolean => {
    if (!list.length) {
        try { store.removeItem(key); return true; } catch { return false; }
    }
    return writeJson(store, key, list);
};

/**
 * One-time move of the legacy unscoped `profit_calcs` list into this user's pending list.
 * Returns how many calculations were claimed. The legacy key is removed only after the copy was written.
 */
export const claimLegacyProfitCalcs = (store: KeyValueStore, uid: string): number => {
    const legacy = readJson(store, LEGACY_PROFIT_KEY);
    if (legacy == null) return 0;
    const items = parseProfitList(legacy);
    if (items.length) {
        const pending = readList(store, profitPendingKey(uid));
        // pending (newer, this account) wins over the legacy copy for the same id
        if (!writeList(store, profitPendingKey(uid), mergeProfitCalcs(items, pending))) return 0;
    }
    try { store.removeItem(LEGACY_PROFIT_KEY); } catch { /* keep it; claimed again next time (idempotent) */ }
    return items.length;
};

/** How many calculations are saved on this device but not in the account yet. */
export const countPendingProfitCalcs = (store: KeyValueStore, uid: string): number => readList(store, profitPendingKey(uid)).length;

/** What to show immediately (before the network answers): account copy + not-yet-uploaded items. */
export const readProfitCalcsLocal = (store: KeyValueStore, uid: string): SavedProfitCalc[] => {
    claimLegacyProfitCalcs(store, uid);
    return mergeProfitCalcs(readList(store, profitCacheKey(uid)), readList(store, profitPendingKey(uid)));
};

export interface ProfitLoadResult {
    list: SavedProfitCalc[];
    mode: SyncMode;
    /** calculations uploaded from this device during this load (legacy or saved while offline) */
    uploaded: number;
    /** still only on this device */
    pending: number;
}

const safeCall = async <T extends { error: DbError | null }>(fn: () => Promise<T>): Promise<T | { error: DbError; data?: undefined }> => {
    try {
        return await fn();
    } catch (e) {
        return { error: { message: (e as Error)?.message || String(e) } };
    }
};

/** Uploads `items`; batch first, then one by one so one bad row never blocks the others. Returns the ones that failed. */
const uploadAll = async (remote: ProfitCalcRemote, uid: string, items: SavedProfitCalc[]): Promise<{ failed: SavedProfitCalc[]; error: DbError | null }> => {
    if (!items.length) return { failed: [], error: null };
    const batch = await safeCall(() => remote.upsert(items.map((c) => profitCalcToRow(c, uid))));
    if (!batch.error) return { failed: [], error: null };
    if (isMissingTableError(batch.error) || items.length === 1) return { failed: items, error: batch.error };
    const failed: SavedProfitCalc[] = [];
    let lastError: DbError | null = null;
    for (const c of items) {
        const one = await safeCall(() => remote.upsert([profitCalcToRow(c, uid)]));
        if (one.error) { failed.push(c); lastError = one.error; }
    }
    return { failed, error: lastError };
};

/**
 * Loads the account list, uploading anything saved only on this device first (legacy list included).
 * Never throws: on errors it returns the device copy and says why.
 */
export const loadProfitCalcs = async (store: KeyValueStore, remote: ProfitCalcRemote, uid: string): Promise<ProfitLoadResult> => {
    claimLegacyProfitCalcs(store, uid);
    const cache = readList(store, profitCacheKey(uid));
    const pending = readList(store, profitPendingKey(uid));
    const res = await safeCall(() => remote.list(uid));
    if (res.error) {
        return { list: mergeProfitCalcs(cache, pending), mode: isMissingTableError(res.error) ? 'device' : 'offline', uploaded: 0, pending: pending.length };
    }
    let accountList = parseProfitRows(res.data);
    const { failed } = await uploadAll(remote, uid, pending);
    const uploadedItems = pending.filter((c) => !failed.some((f) => f.id === c.id));
    accountList = mergeProfitCalcs(accountList, uploadedItems);
    writeList(store, profitPendingKey(uid), failed);
    writeList(store, profitCacheKey(uid), accountList);
    return { list: mergeProfitCalcs(accountList, failed), mode: 'account', uploaded: uploadedItems.length, pending: failed.length };
};

const parseProfitRows = (rows: unknown[] | null | undefined): SavedProfitCalc[] =>
    (Array.isArray(rows) ? rows : []).map(rowToProfitCalc).filter((c): c is SavedProfitCalc => !!c).sort(byDateDesc);

/** Saves (insert or update by id). Falls back to the device when the account can't be reached. */
export const saveProfitCalc = async (store: KeyValueStore, remote: ProfitCalcRemote, uid: string, input: SavedProfitCalc): Promise<{ mode: SyncMode; calc: SavedProfitCalc; error?: DbError }> => {
    const calc = normalizeProfitCalc(input) as SavedProfitCalc;
    const res = await safeCall(() => remote.upsert([profitCalcToRow(calc, uid)]));
    if (!res.error) {
        writeList(store, profitCacheKey(uid), mergeProfitCalcs(readList(store, profitCacheKey(uid)), [calc]));
        writeList(store, profitPendingKey(uid), readList(store, profitPendingKey(uid)).filter((c) => c.id !== calc.id));
        return { mode: 'account', calc };
    }
    const saved = writeList(store, profitPendingKey(uid), mergeProfitCalcs(readList(store, profitPendingKey(uid)), [calc]));
    if (!saved) return { mode: 'failed', calc, error: res.error };
    return { mode: isMissingTableError(res.error) ? 'device' : 'offline', calc, error: res.error };
};

/**
 * Deletes from the account and this device. When the account can't be reached, an item that was never
 * uploaded is still deleted here; one that is in the account is kept (ok: false) so it can't come back later.
 */
export const deleteProfitCalc = async (store: KeyValueStore, remote: ProfitCalcRemote, uid: string, id: string): Promise<{ ok: boolean; error?: DbError }> => {
    const cache = readList(store, profitCacheKey(uid));
    const pending = readList(store, profitPendingKey(uid));
    const dropLocal = () => {
        writeList(store, profitCacheKey(uid), cache.filter((c) => c.id !== id));
        writeList(store, profitPendingKey(uid), pending.filter((c) => c.id !== id));
    };
    const res = await safeCall(() => remote.remove(uid, id));
    if (!res.error || isMissingTableError(res.error) || !cache.some((c) => c.id === id)) {
        dropLocal();
        return { ok: true };
    }
    return { ok: false, error: res.error };
};

// =====================================================================================
// Single values (default labor rate, default signature, label sheet)
// =====================================================================================
export type FieldSyncAction =
    /** the device has a value the account doesn't have (or a save that didn't reach the account) */
    | 'push'
    /** the account value is newer than / different from the device copy */
    | 'pull'
    | 'none';

/**
 * Decides what to do at login for one value that exists both in the account and on the device.
 * The account wins, except for a device save that never reached it (`localPending`) and for a value that only
 * exists on the device (one-time upload of browser-only data).
 */
export const planFieldSync = <T>(opts: { account: T | null | undefined; local: T | null | undefined; localPending?: boolean; same?: (a: T, b: T) => boolean }): FieldSyncAction => {
    const has = (v: T | null | undefined): v is T => v !== null && v !== undefined && (v as unknown) !== '';
    const same = opts.same || ((a: T, b: T) => a === b);
    if (opts.localPending && has(opts.local)) return has(opts.account) && same(opts.account, opts.local) ? 'none' : 'push';
    if (has(opts.account)) return has(opts.local) && same(opts.account, opts.local) ? 'none' : 'pull';
    return has(opts.local) ? 'push' : 'none';
};

export const pendingFieldKey = (field: string, uid: string) => `cd.pending.${field}:${uid}`;

/** A positive labor rate, else null. */
export const parseRate = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n < 1e9 ? Math.round(n * 100) / 100 : null;
};

/** Browser keys of the single values (the same strings the components always used). */
export const LABOR_RATE_LOCAL_KEY = 'cd_job_labor_rate'; // = lib/finance.ts LABOR_RATE_STORAGE_KEY (unscoped, wiped on logout)
export const SIGNATURE_LOCAL_PREFIX = 'contractordocs:default-signature:'; // + user id (components/SignaturePad.tsx)
export const LABEL_SHEET_LOCAL_KEY = 'cd.labels.sheet'; // components/PrintTagsModal.tsx (device copy)
export const LABEL_SHEET_SETTING = 'labels.sheet'; // public.user_settings key

const PNG_DATA_URL = /^data:image\/png;base64,/;
const SHEET_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

const get = (store: KeyValueStore, key: string): string | null => {
    try { return store.getItem(key); } catch { return null; }
};
const put = (store: KeyValueStore, key: string, value: string | null): boolean => {
    try {
        if (value === null) store.removeItem(key);
        else store.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

const modeFor = (err: DbError, missing: (e: DbError) => boolean): SyncMode => (missing(err) ? 'device' : 'offline');

/** The profile column isn't there (very old database). */
const isMissingColumn = (err: DbError | null | undefined) =>
    !!err && (['42703', 'PGRST204'].includes(String(err.code || '')) || /column .* does not exist|could not find the .* column/i.test(errText(err)));

/** profiles.default_labor_rate / default_signature_url (existing columns, no migration needed). */
export interface ProfileValuesRemote {
    read(uid: string): Promise<{ data: { default_labor_rate?: unknown; default_signature_url?: unknown } | null; error: DbError | null }>;
    update(uid: string, patch: { default_labor_rate?: number | null; default_signature_url?: string | null }): Promise<{ error: DbError | null }>;
}

/** public.user_settings (migration 20261113000500). */
export interface SettingsRemote {
    read(uid: string, keys: string[]): Promise<{ data: Array<{ key: string; value: unknown }> | null; error: DbError | null }>;
    upsert(uid: string, key: string, value: unknown): Promise<{ error: DbError | null }>;
}

/** Labor rate typed in Job financials → account. A failed save is remembered and retried at the next login. */
export const saveLaborRate = async (store: KeyValueStore, remote: ProfileValuesRemote, uid: string, rate: unknown): Promise<SyncMode> => {
    const value = parseRate(rate);
    if (value === null) return 'failed';
    const pendingKey = pendingFieldKey('labor_rate', uid);
    put(store, pendingKey, String(value));
    const res = await safeCall(() => remote.update(uid, { default_labor_rate: value }));
    if (!res.error) {
        if (parseRate(get(store, pendingKey)) === value) put(store, pendingKey, null); // a newer value may be waiting
        return 'account';
    }
    return modeFor(res.error, isMissingColumn);
};

/** Default signature → account (`dataUrl` empty = remove it). */
export const saveDefaultSignature = async (store: KeyValueStore, remote: ProfileValuesRemote, uid: string, dataUrl: string | null): Promise<SyncMode> => {
    const value = dataUrl && /^data:image\/|^https:\/\//.test(dataUrl) ? dataUrl : null;
    const pendingKey = pendingFieldKey('signature', uid);
    put(store, pendingKey, value ? '1' : 'clear');
    const res = await safeCall(() => remote.update(uid, { default_signature_url: value }));
    if (!res.error) {
        put(store, pendingKey, null);
        return 'account';
    }
    return modeFor(res.error, isMissingColumn);
};

/** One user_settings value → account. The device copy is written by the caller. */
export const saveSetting = async (store: KeyValueStore, remote: SettingsRemote, uid: string, key: string, value: unknown): Promise<SyncMode> => {
    const pendingKey = pendingFieldKey(key, uid);
    put(store, pendingKey, '1');
    const res = await safeCall(() => remote.upsert(uid, key, value));
    if (!res.error) {
        put(store, pendingKey, null);
        return 'account';
    }
    return modeFor(res.error, isMissingTableError);
};

export interface ProfileValuesSyncResult {
    laborRate: FieldSyncAction;
    signature: FieldSyncAction | 'clear';
    /** the profile couldn't be read (offline …): nothing was changed */
    skipped?: boolean;
}

/**
 * At login: labor rate and default signature. The account wins over the device copy, except for device saves
 * that didn't reach the account (pending) and values that so far existed only on this device (uploaded once).
 */
export const syncProfileValues = async (store: KeyValueStore, remote: ProfileValuesRemote, uid: string): Promise<ProfileValuesSyncResult> => {
    const res = await safeCall(() => remote.read(uid));
    if (res.error || !res.data) return { laborRate: 'none', signature: 'none', skipped: true };
    const row = res.data;

    // ---- labor rate (device key is unscoped, so only a pending save or a value the account lacks is pushed)
    const rateKey = pendingFieldKey('labor_rate', uid);
    const accountRate = parseRate(row.default_labor_rate);
    const pendingRate = parseRate(get(store, rateKey));
    const localRate = pendingRate ?? parseRate(get(store, LABOR_RATE_LOCAL_KEY));
    const laborRate = planFieldSync({ account: accountRate, local: localRate, localPending: pendingRate !== null });
    if (laborRate === 'push' && localRate !== null) {
        const up = await safeCall(() => remote.update(uid, { default_labor_rate: localRate }));
        if (!up.error) put(store, rateKey, null);
        put(store, LABOR_RATE_LOCAL_KEY, String(localRate));
    } else {
        if (laborRate === 'pull' && accountRate !== null) put(store, LABOR_RATE_LOCAL_KEY, String(accountRate));
        put(store, rateKey, null);
    }

    // ---- default signature (device key is per user)
    const sigKey = SIGNATURE_LOCAL_PREFIX + uid;
    const sigPendingKey = pendingFieldKey('signature', uid);
    const mark = get(store, sigPendingKey);
    const rawLocal = get(store, sigKey) || '';
    const localSig = PNG_DATA_URL.test(rawLocal) ? rawLocal : '';
    const accountSig = typeof row.default_signature_url === 'string' ? row.default_signature_url : '';
    let signature: FieldSyncAction | 'clear';
    if (mark === 'clear' && !localSig) {
        signature = 'clear';
        if (accountSig) {
            const up = await safeCall(() => remote.update(uid, { default_signature_url: null }));
            if (!up.error) put(store, sigPendingKey, null);
        } else {
            put(store, sigPendingKey, null);
        }
    } else {
        signature = planFieldSync({ account: accountSig, local: localSig, localPending: mark === '1' });
        if (signature === 'push') {
            const up = await safeCall(() => remote.update(uid, { default_signature_url: localSig }));
            if (!up.error) put(store, sigPendingKey, null);
        } else {
            // the device copy follows the account (an https URL is used by SignaturePad straight from the profile)
            if (signature === 'pull') put(store, sigKey, PNG_DATA_URL.test(accountSig) ? accountSig : null);
            put(store, sigPendingKey, null);
        }
    }
    return { laborRate, signature };
};

/** At login: label sheet (Print labels). 'unavailable' = user_settings not there yet, the device copy stays. */
export const syncLabelSheet = async (store: KeyValueStore, remote: SettingsRemote, uid: string): Promise<FieldSyncAction | 'unavailable'> => {
    const res = await safeCall(() => remote.read(uid, [LABEL_SHEET_SETTING]));
    if (res.error) return 'unavailable';
    const pendingKey = pendingFieldKey(LABEL_SHEET_SETTING, uid);
    const rawAccount = (res.data || []).find((r) => r && r.key === LABEL_SHEET_SETTING)?.value;
    const account = typeof rawAccount === 'string' && SHEET_ID.test(rawAccount) ? rawAccount : null;
    const rawLocal = get(store, LABEL_SHEET_LOCAL_KEY);
    const local = rawLocal && SHEET_ID.test(rawLocal) ? rawLocal : null;
    const action = planFieldSync({ account, local, localPending: get(store, pendingKey) === '1' });
    if (action === 'push' && local) {
        const up = await safeCall(() => remote.upsert(uid, LABEL_SHEET_SETTING, local));
        if (!up.error) put(store, pendingKey, null);
    } else {
        if (action === 'pull' && account) put(store, LABEL_SHEET_LOCAL_KEY, account);
        put(store, pendingKey, null);
    }
    return action;
};

// =====================================================================================
// Help: first-run app tour (components/help/*), public.user_settings 'help.tour'
// =====================================================================================
export const HELP_TOUR_SETTING = 'help.tour';
/** Device copy, per user (not wiped on logout: it only says "this person already saw the tour"). */
export const helpTourLocalKey = (uid: string) => `cd.help.tour:${uid}`;

const tourSeenValue = (v: unknown): boolean => !!v && typeof v === 'object' && (v as { seen?: unknown }).seen === true;

/** Reads one user_settings value: 'account' = read ('device' = table not there yet, 'offline' = unreachable). */
export const readSetting = async (remote: SettingsRemote, uid: string, key: string): Promise<{ mode: SyncMode; value: unknown }> => {
    const res = await safeCall(() => remote.read(uid, [key]));
    if (res.error) return { mode: modeFor(res.error, isMissingTableError), value: null };
    const row = (res.data || []).find((r) => r && r.key === key);
    return { mode: 'account', value: row ? row.value : null };
};

/**
 * Has this user finished or skipped the first-run tour? The account decides (so another device or a new login
 * doesn't show it again); the device copy answers instantly. null = can't tell right now (offline): don't show it.
 */
export const loadTourSeen = async (store: KeyValueStore, remote: SettingsRemote, uid: string): Promise<boolean | null> => {
    if (get(store, helpTourLocalKey(uid)) === '1') {
        // seen here, but the account write never landed: try again quietly
        if (get(store, pendingFieldKey(HELP_TOUR_SETTING, uid)) === '1') void saveSetting(store, remote, uid, HELP_TOUR_SETTING, { seen: true, at: new Date().toISOString() });
        return true;
    }
    const res = await readSetting(remote, uid, HELP_TOUR_SETTING);
    if (res.mode === 'account') {
        if (tourSeenValue(res.value)) {
            put(store, helpTourLocalKey(uid), '1');
            return true;
        }
        return false;
    }
    return res.mode === 'device' ? false : null;
};

/** Tour finished or skipped: remembered on this device right away and in the account (retried at the next check). */
export const saveTourSeen = async (store: KeyValueStore, remote: SettingsRemote, uid: string): Promise<SyncMode> => {
    put(store, helpTourLocalKey(uid), '1');
    return saveSetting(store, remote, uid, HELP_TOUR_SETTING, { seen: true, at: new Date().toISOString() });
};


// =====================================================================================
// Appearance & language (PARITY_V2 C1): follow the account to every device.
//   account: public.user_settings 'ui.preferences' = { theme, language, updatedAt } (migration 20261113000500),
//            mirrored into profiles.theme / profiles.language (existing columns: read by the old app, and the fallback
//            while the migration isn't applied)
//   device:  'theme' (unscoped, paints the first screen before anyone is signed in) + 'cd.ui.language'
//   pending: cd.pending.ui.preferences:<uid> = a change made while the account couldn't be reached (pushed at the next
//            login instead of being overwritten by the older account value)
// =====================================================================================
export const UI_PREFS_SETTING = 'ui.preferences';
export const THEME_LOCAL_KEY = 'theme'; // = lib/account.ts THEME_STORAGE_KEY
export const LANGUAGE_LOCAL_KEY = 'cd.ui.language';

export type UiTheme = 'light' | 'dark' | 'blue';
export interface UiPrefs { theme?: UiTheme; language?: string }

const LANGUAGE_NAME = /^[A-Za-z][A-Za-z ]{1,39}$/;

export const normalizeUiTheme = (v: unknown): UiTheme | undefined => (v === 'light' || v === 'dark' || v === 'blue' ? v : undefined);

/** Keeps only valid values; never throws. */
export const normalizeUiPrefs = (raw: unknown): UiPrefs => {
    if (!raw || typeof raw !== 'object') return {};
    const r = raw as Record<string, unknown>;
    const out: UiPrefs = {};
    const theme = normalizeUiTheme(r.theme);
    if (theme) out.theme = theme;
    if (typeof r.language === 'string' && LANGUAGE_NAME.test(r.language.trim())) out.language = r.language.trim();
    return out;
};

const hasPrefs = (p: UiPrefs) => Boolean(p.theme || p.language);

export const uiPrefsPendingKey = (uid: string) => pendingFieldKey(UI_PREFS_SETTING, uid);

/** profiles.theme / profiles.language (existing columns). */
export interface ProfilePrefsRemote {
    update(uid: string, patch: { theme?: string; language?: string }): Promise<{ error: DbError | null }>;
}

const writeDeviceUiPrefs = (store: KeyValueStore, prefs: UiPrefs) => {
    if (prefs.theme) put(store, THEME_LOCAL_KEY, prefs.theme);
    if (prefs.language) put(store, LANGUAGE_LOCAL_KEY, prefs.language);
};

/** This device's copy (instant paint). */
export const readDeviceUiPrefs = (store: KeyValueStore): UiPrefs =>
    normalizeUiPrefs({ theme: get(store, THEME_LOCAL_KEY), language: get(store, LANGUAGE_LOCAL_KEY) });

/**
 * Saves the theme and/or language to the account (user_settings + the profile columns) and this device. A save that
 * reaches neither is kept as pending and pushed at the next login. `skipProfile`: the caller already wrote the profile
 * columns (Settings → Save).
 */
export const saveUiPrefs = async (
    store: KeyValueStore, settings: SettingsRemote, profiles: ProfilePrefsRemote, uid: string, input: UiPrefs,
    opts: { skipProfile?: boolean; now?: () => string } = {},
): Promise<SyncMode> => {
    const prefs = normalizeUiPrefs(input);
    if (!hasPrefs(prefs)) return 'failed';
    writeDeviceUiPrefs(store, prefs);
    const pendingKey = uiPrefsPendingKey(uid);
    const pending = { ...normalizeUiPrefs(readJson(store, pendingKey)), ...prefs };
    const queued = writeJson(store, pendingKey, pending);
    const value = { ...pending, updatedAt: (opts.now || (() => new Date().toISOString()))() };
    const set = await safeCall(() => settings.upsert(uid, UI_PREFS_SETTING, value));
    const prof = opts.skipProfile
        ? { error: null }
        : await safeCall(() => profiles.update(uid, { ...(pending.theme ? { theme: pending.theme } : {}), ...(pending.language ? { language: pending.language } : {}) }));
    if (!set.error || !prof.error) {
        // a newer change may have been queued while this one was in flight: keep it
        const now = normalizeUiPrefs(readJson(store, pendingKey));
        if (now.theme === pending.theme && now.language === pending.language) put(store, pendingKey, null);
        return 'account';
    }
    if (!queued) return 'failed';
    return isMissingTableError(set.error) && isMissingColumn(prof.error) ? 'device' : 'offline';
};

export interface UiPrefsSyncResult {
    /** what to apply now */
    prefs: UiPrefs;
    /** push = a device change that never reached the account was uploaded; pull = the account values were applied */
    action: 'push' | 'pull';
}

/**
 * At login: a pending device change wins (and is uploaded); otherwise the account decides: user_settings first, the
 * profile columns (`profile`, already loaded) for anything it doesn't have. The device copy follows. Never throws.
 */
export const syncUiPrefs = async (
    store: KeyValueStore, settings: SettingsRemote, profiles: ProfilePrefsRemote, uid: string, profile: UiPrefs,
): Promise<UiPrefsSyncResult> => {
    const fromProfile = normalizeUiPrefs(profile);
    const pending = normalizeUiPrefs(readJson(store, uiPrefsPendingKey(uid)));
    const res = await safeCall(() => settings.read(uid, [UI_PREFS_SETTING]));
    const row = !res.error ? (res.data || []).find((r) => r && r.key === UI_PREFS_SETTING) : undefined;
    const fromSettings = normalizeUiPrefs(row?.value);
    if (hasPrefs(pending)) {
        const prefs = { ...fromProfile, ...fromSettings, ...pending };
        await saveUiPrefs(store, settings, profiles, uid, prefs);
        return { prefs, action: 'push' };
    }
    const prefs = { ...fromProfile, ...fromSettings };
    writeDeviceUiPrefs(store, prefs);
    // first login with this version: copy the profile values into user_settings once (quietly)
    if (!res.error && !row && hasPrefs(fromProfile)) {
        void safeCall(() => settings.upsert(uid, UI_PREFS_SETTING, { ...fromProfile, updatedAt: new Date().toISOString() }));
    }
    return { prefs, action: 'pull' };
};
