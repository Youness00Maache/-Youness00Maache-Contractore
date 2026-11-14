/**
 * User data that must follow the account (every device, survives logout): binds the pure logic of
 * lib/userDataSync.ts to this browser (localStorage) and the account (Supabase).
 *
 *   saved profit calculations  → public.profit_calculations   (migration 20261113000500)
 *   label sheet (Print labels) → public.user_settings 'labels.sheet' (migration 20261113000500)
 *   first-run tour seen        → public.user_settings 'help.tour'    (components/help/AppTour.tsx)
 *   bookkeeper email           → public.user_settings 'export.bookkeeper' (Settings → Your data)
 *   job % complete (manual)    → public.user_settings 'costing.progress:<job id>' (Job financials → Budget vs actual)
 *   T&M billing rates          → public.user_settings 'billing.tm' (Bill time & materials)
 *   saved suppliers            → public.user_settings 'suppliers.list' (lib/suppliers.ts SuppliersSetting)
 *   reorder qty per item + job → public.user_settings 'inventory.reorder' (lib/suppliers.ts ReorderSetting)
 *   default labor rate         → profiles.default_labor_rate  (existing column)
 *   default signature          → profiles.default_signature_url (existing column)
 *   theme + language           → public.user_settings 'ui.preferences' + profiles.theme / profiles.language
 *
 * Before the migration is applied everything keeps working on the device, and the device items are uploaded
 * automatically the first time the tables are reachable. App.tsx calls `syncUserDataAfterLogin(uid)` once per
 * signed-in user: it uploads browser-only items (one time) and refreshes the device copies from the account.
 */
import { supabase } from './supabase.ts';
import {
    LABEL_SHEET_SETTING, countPendingProfitCalcs, deleteProfitCalc, loadProfitCalcs, parseRate, pendingFieldKey, readProfitCalcsLocal,
    readSetting, saveDefaultSignature, saveLaborRate,
    saveProfitCalc, saveSetting, syncLabelSheet, syncProfileValues, claimLegacyProfitCalcs, loadTourSeen, saveTourSeen,
    saveUiPrefs, syncUiPrefs, type ProfilePrefsRemote, type UiPrefs,
    type DbError, type KeyValueStore, type ProfileValuesRemote, type ProfitCalcRemote, type SavedProfitCalc, type SettingsRemote, type SyncMode,
} from './userDataSync.ts';

export type { SavedProfitCalc, SyncMode, UiPrefs } from './userDataSync.ts';

export const browserStore: KeyValueStore = {
    getItem: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => { window.localStorage.setItem(k, v); },
    removeItem: (k) => { try { window.localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const OFFLINE: DbError = { message: 'offline' };

/** Set by syncUserDataAfterLogin; the session is the fallback (both are the signed-in user). */
let activeUserId: string | null = null;
const signedInUserId = async (): Promise<string | null> => {
    try {
        const { data } = await supabase.auth.getSession();
        return data.session?.user?.id || null;
    } catch {
        return null;
    }
};

// ------------------------------------------------------------------------------- remotes
const PROFIT_COLUMNS = 'id, name, items, tax_enabled, tax_rate, margin, saved_at';

const profitRemote: ProfitCalcRemote = {
    async list(uid) {
        if (offline()) return { data: null, error: OFFLINE };
        const { data, error } = await supabase.from('profit_calculations').select(PROFIT_COLUMNS)
            .eq('user_id', uid).order('saved_at', { ascending: false }).limit(500);
        return { data: data as unknown[] | null, error };
    },
    async upsert(rows) {
        if (offline()) return { error: OFFLINE };
        const { error } = await supabase.from('profit_calculations').upsert(rows, { onConflict: 'id' });
        return { error };
    },
    async remove(uid, id) {
        if (offline()) return { error: OFFLINE };
        const { error } = await supabase.from('profit_calculations').delete().eq('id', id).eq('user_id', uid);
        return { error };
    },
};

const profileRemote: ProfileValuesRemote = {
    async read(uid) {
        if (offline()) return { data: null, error: OFFLINE };
        const { data, error } = await supabase.from('profiles').select('default_labor_rate, default_signature_url').eq('id', uid).maybeSingle();
        return { data: data as { default_labor_rate?: unknown; default_signature_url?: unknown } | null, error };
    },
    async update(uid, patch) {
        if (offline()) return { error: OFFLINE };
        const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
        return { error };
    },
};

const settingsRemote: SettingsRemote = {
    async read(uid, keys) {
        if (offline()) return { data: null, error: OFFLINE };
        const { data, error } = await supabase.from('user_settings').select('key, value').eq('user_id', uid).in('key', keys);
        return { data: data as Array<{ key: string; value: unknown }> | null, error };
    },
    async upsert(uid, key, value) {
        if (offline()) return { error: OFFLINE };
        const { error } = await supabase.from('user_settings').upsert({ user_id: uid, key, value }, { onConflict: 'user_id,key' });
        return { error };
    },
};

const profilePrefsRemote: ProfilePrefsRemote = {
    async update(uid, patch) {
        if (offline()) return { error: OFFLINE };
        const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
        return { error };
    },
};

// ------------------------------------------------------------------- profit calculations
/** Instant list (account copy + items not uploaded yet) shown while the account list loads. */
export const readLocalProfitCalculations = (uid: string): SavedProfitCalc[] => readProfitCalcsLocal(browserStore, uid);
export const loadProfitCalculations = (uid: string) => loadProfitCalcs(browserStore, profitRemote, uid);
export const saveProfitCalculation = (uid: string, calc: SavedProfitCalc) => saveProfitCalc(browserStore, profitRemote, uid, calc);
export const deleteProfitCalculation = (uid: string, id: string) => deleteProfitCalc(browserStore, profitRemote, uid, id);
export const pendingProfitCalculationCount = (uid: string): number => countPendingProfitCalcs(browserStore, uid);

// --------------------------------------------------------------------------- labor rate
let laborTimer: ReturnType<typeof setTimeout> | null = null;

/** Called on every keystroke in Job financials; the account write waits until typing pauses. */
export function saveLaborRateToAccount(rate: number): void {
    if (laborTimer) clearTimeout(laborTimer);
    const value = parseRate(rate);
    if (value === null) return;
    // Recorded right away: a logout or closed tab before the write still uploads it at the next login.
    if (activeUserId) { try { browserStore.setItem(pendingFieldKey('labor_rate', activeUserId), String(value)); } catch { /* storage unavailable */ } }
    laborTimer = setTimeout(async () => {
        laborTimer = null;
        const uid = activeUserId || await signedInUserId();
        if (uid) await saveLaborRate(browserStore, profileRemote, uid, value);
    }, 700);
}

// ---------------------------------------------------------------------- default signature
/**
 * Saves the signed-in user's default signature to the account. `ownerId` is the id the signature pad keys its
 * device copy with; nothing is written unless it is the signed-in user (a client signing never changes it).
 */
export async function saveDefaultSignatureToAccount(ownerId: string | null | undefined, dataUrl: string | null): Promise<SyncMode> {
    const uid = await signedInUserId();
    if (!ownerId || !uid || uid !== ownerId) return 'failed';
    return saveDefaultSignature(browserStore, profileRemote, uid, dataUrl);
}

// ---------------------------------------------------------------------------- settings
/** Label sheet chosen in Print labels (the caller keeps the device copy). */
export async function saveLabelSheetToAccount(sheetId: string): Promise<SyncMode> {
    const uid = activeUserId || await signedInUserId();
    if (!uid) return 'failed';
    return saveSetting(browserStore, settingsRemote, uid, LABEL_SHEET_SETTING, sheetId);
}

// ---------------------------------------------------------------------- theme + language
/**
 * Theme / language chosen by the user → account (every device) + this device. Offline: kept as pending and uploaded at
 * the next login. `skipProfile`: the profile columns were already saved by the caller (Settings → Save).
 */
export async function saveUiPreferencesToAccount(prefs: UiPrefs, opts: { skipProfile?: boolean } = {}): Promise<SyncMode> {
    const uid = activeUserId || await signedInUserId();
    if (!uid) return 'failed';
    return saveUiPrefs(browserStore, settingsRemote, profilePrefsRemote, uid, prefs, opts);
}

/** At login: the theme / language to apply (account values, or a device change that never reached the account). */
export async function syncUiPreferencesAfterLogin(uid: string, profile: UiPrefs): Promise<UiPrefs> {
    if (!uid) return {};
    try {
        return (await syncUiPrefs(browserStore, settingsRemote, profilePrefsRemote, uid, profile)).prefs;
    } catch {
        return profile;
    }
}

// ---------------------------------------------------------------------------- help tour
/** Has this user already finished/skipped the first-run tour (account 'help.tour')? null = can't tell (offline). */
export const loadAppTourSeen = (uid: string): Promise<boolean | null> => loadTourSeen(browserStore, settingsRemote, uid);
/** Remembers that the tour was finished or skipped, in the account and on this device. */
export const saveAppTourSeen = (uid: string): Promise<SyncMode> => saveTourSeen(browserStore, settingsRemote, uid);

// ------------------------------------------------------------------------- bookkeeper email
/** public.user_settings key for the bookkeeper CSV (Settings → Your data): { email, updatedAt }. */
export const BOOKKEEPER_SETTING = 'export.bookkeeper';
const bookkeeperLocalKey = (uid: string) => `cd.export.bookkeeper:${uid}`;
const bookkeeperEmailOf = (v: unknown): string | null => {
    if (!v || typeof v !== 'object') return null;
    const email = (v as { email?: unknown }).email;
    return typeof email === 'string' ? email.trim().slice(0, 254) : null;
};

/**
 * The bookkeeper's email: the account's copy (every device), else this device's copy (offline, or the table isn't
 * there yet). A device copy that never reached the account is uploaded now.
 */
export async function loadBookkeeperEmail(uid: string): Promise<string> {
    if (!uid) return '';
    const local = browserStore.getItem(bookkeeperLocalKey(uid)) || '';
    if (offline()) return local;
    const res = await readSetting(settingsRemote, uid, BOOKKEEPER_SETTING);
    if (res.mode !== 'account') return local;
    const pending = browserStore.getItem(pendingFieldKey(BOOKKEEPER_SETTING, uid)) === '1';
    const account = bookkeeperEmailOf(res.value);
    if (pending || account === null) {
        if (local) void saveSetting(browserStore, settingsRemote, uid, BOOKKEEPER_SETTING, { email: local, updatedAt: new Date().toISOString() });
        return local;
    }
    try { if (account) browserStore.setItem(bookkeeperLocalKey(uid), account); else browserStore.removeItem(bookkeeperLocalKey(uid)); } catch { /* storage unavailable */ }
    return account;
}

/** Remembers the bookkeeper's email on this device and in the account ('' forgets it). */
export async function saveBookkeeperEmail(uid: string, email: string): Promise<SyncMode> {
    if (!uid) return 'failed';
    const value = email.trim().slice(0, 254);
    try { if (value) browserStore.setItem(bookkeeperLocalKey(uid), value); else browserStore.removeItem(bookkeeperLocalKey(uid)); } catch { /* storage unavailable */ }
    return saveSetting(browserStore, settingsRemote, uid, BOOKKEEPER_SETTING, { email: value, updatedAt: new Date().toISOString() });
}

// ----------------------------------------------------------------------- job costing + T&M
/**
 * Small JSON settings with a device copy (offline, or before the user_settings table exists): the account wins,
 * except a device save that never reached it (pending), which is uploaded again.
 */
async function loadJsonSetting(key: string, localKey: (uid: string) => string): Promise<unknown> {
    const uid = activeUserId || await signedInUserId();
    if (!uid) return null;
    const readLocal = (): unknown => {
        const raw = browserStore.getItem(localKey(uid));
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    };
    if (offline()) return readLocal();
    const res = await readSetting(settingsRemote, uid, key);
    if (res.mode !== 'account') return readLocal();
    if (browserStore.getItem(pendingFieldKey(key, uid)) === '1') {
        const local = readLocal();
        if (local !== null) void saveSetting(browserStore, settingsRemote, uid, key, local);
        return local;
    }
    try {
        if (res.value === null || res.value === undefined) browserStore.removeItem(localKey(uid));
        else browserStore.setItem(localKey(uid), JSON.stringify(res.value));
    } catch { /* storage unavailable */ }
    return res.value ?? null;
}

async function saveJsonSetting(key: string, localKey: (uid: string) => string, value: unknown): Promise<SyncMode> {
    const uid = activeUserId || await signedInUserId();
    if (!uid) return 'failed';
    try { browserStore.setItem(localKey(uid), JSON.stringify(value)); } catch { /* storage unavailable */ }
    return saveSetting(browserStore, settingsRemote, uid, key, value);
}

/** public.user_settings key of a job's manual % complete (Job financials → Budget vs actual): { percent, updatedAt }. */
export const jobProgressSettingKey = (jobId: string) => `costing.progress:${String(jobId).toLowerCase().replace(/[^a-z0-9_.:-]/g, '')}`.slice(0, 64);
const jobProgressLocalKey = (jobId: string) => (uid: string) => `cd.costing.progress:${uid}:${jobId}`;

const percentOf = (v: unknown): number | null => {
    const p = v && typeof v === 'object' ? (v as { percent?: unknown }).percent : null;
    const n = typeof p === 'number' ? p : typeof p === 'string' && p.trim() ? Number(p) : NaN;
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
};

/** The % complete typed for a job (null = none). Used when the job has no progress-billing invoice. */
export async function loadJobProgress(jobId: string): Promise<number | null> {
    if (!jobId) return null;
    return percentOf(await loadJsonSetting(jobProgressSettingKey(jobId), jobProgressLocalKey(jobId)));
}

let progressTimers: Record<string, ReturnType<typeof setTimeout>> = {};
/** Saves a job's % complete (null clears it); the account write waits until typing pauses. */
export function saveJobProgress(jobId: string, percent: number | null): void {
    if (!jobId) return;
    const value = { percent: percent === null ? null : Math.min(100, Math.max(0, percent)), updatedAt: new Date().toISOString() };
    // device copy + "pending" right away: reopening Job financials (or a closed tab) never loses the typed value
    if (activeUserId) {
        try {
            browserStore.setItem(jobProgressLocalKey(jobId)(activeUserId), JSON.stringify(value));
            browserStore.setItem(pendingFieldKey(jobProgressSettingKey(jobId), activeUserId), '1');
        } catch { /* storage unavailable */ }
    }
    if (progressTimers[jobId]) clearTimeout(progressTimers[jobId]);
    progressTimers[jobId] = setTimeout(() => {
        const { [jobId]: _done, ...rest } = progressTimers;
        progressTimers = rest;
        void saveJsonSetting(jobProgressSettingKey(jobId), jobProgressLocalKey(jobId), value);
    }, 600);
}

/** public.user_settings key of the rates last used for a T&M invoice: { laborRate, materialMarkup, expenseMarkup, groupLabor }. */
export const TM_RATES_SETTING = 'billing.tm';
const tmRatesLocalKey = (uid: string) => `cd.billing.tm:${uid}`;

export interface SavedTmRates { laborRate?: number; materialMarkup?: number; expenseMarkup?: number; groupLabor?: 'worker' | 'entry' }

export async function loadTmRates(): Promise<SavedTmRates | null> {
    const v = await loadJsonSetting(TM_RATES_SETTING, tmRatesLocalKey);
    if (!v || typeof v !== 'object') return null;
    const r = v as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined);
    return {
        laborRate: num(r.laborRate), materialMarkup: num(r.materialMarkup), expenseMarkup: num(r.expenseMarkup),
        groupLabor: r.groupLabor === 'entry' ? 'entry' : r.groupLabor === 'worker' ? 'worker' : undefined,
    };
}

export const saveTmRates = (rates: SavedTmRates): Promise<SyncMode> =>
    saveJsonSetting(TM_RATES_SETTING, tmRatesLocalKey, { ...rates, updatedAt: new Date().toISOString() });

// ------------------------------------------------------------------- suppliers + reorders
// Shapes and limits: lib/suppliers.ts (SuppliersSetting, ReorderSetting). Callers serialize + size-check first.
// Same key strings as SUPPLIERS_SETTING / REORDER_SETTING in lib/suppliers.ts (not imported: that file pulls in the
// document defaults, which this login-time module doesn't need; scripts/supplier-orders-check.ts checks they match).
const SUPPLIERS_SETTING = 'suppliers.list';
const REORDER_SETTING = 'inventory.reorder';
const suppliersLocalKey = (uid: string) => `cd.suppliers.list:${uid}`;
const reorderLocalKey = (uid: string) => `cd.inventory.reorder:${uid}`;

/** Raw 'suppliers.list' value (account, else this device's copy); parse it with parseSuppliers(). */
export const loadSuppliersSetting = (): Promise<unknown> => loadJsonSetting(SUPPLIERS_SETTING, suppliersLocalKey);
export const saveSuppliersSetting = (value: unknown): Promise<SyncMode> => saveJsonSetting(SUPPLIERS_SETTING, suppliersLocalKey, value);

/** Raw 'inventory.reorder' value; parse it with parseReorderSetting(). */
export const loadReorderSetting = (): Promise<unknown> => loadJsonSetting(REORDER_SETTING, reorderLocalKey);
export const saveReorderSetting = (value: unknown): Promise<SyncMode> => saveJsonSetting(REORDER_SETTING, reorderLocalKey, value);

// -------------------------------------------------------------------------------- login
const syncedUsers = new Set<string>();

/**
 * Once per signed-in user and page load: moves browser-only items into the account (one time) and refreshes the
 * device copies. Offline: claims the legacy items for this user now and runs the rest when the connection is back.
 * Never throws.
 */
export async function syncUserDataAfterLogin(uid: string): Promise<void> {
    if (!uid) return;
    activeUserId = uid;
    try { claimLegacyProfitCalcs(browserStore, uid); } catch { /* storage unavailable */ }
    if (syncedUsers.has(uid)) return;
    if (offline()) {
        if (typeof window !== 'undefined') window.addEventListener('online', () => { void syncUserDataAfterLogin(uid); }, { once: true });
        return;
    }
    syncedUsers.add(uid);
    await Promise.allSettled([
        loadProfitCalcs(browserStore, profitRemote, uid),
        syncProfileValues(browserStore, profileRemote, uid),
        syncLabelSheet(browserStore, settingsRemote, uid),
    ]);
}
