/**
 * User data that must follow the account (every device, survives logout): binds the pure logic of
 * lib/userDataSync.ts to this browser (localStorage) and the account (Supabase).
 *
 *   saved profit calculations  → public.profit_calculations   (migration 20261113000500)
 *   label sheet (Print labels) → public.user_settings 'labels.sheet' (migration 20261113000500)
 *   default labor rate         → profiles.default_labor_rate  (existing column)
 *   default signature          → profiles.default_signature_url (existing column)
 *
 * Before the migration is applied everything keeps working on the device, and the device items are uploaded
 * automatically the first time the tables are reachable. App.tsx calls `syncUserDataAfterLogin(uid)` once per
 * signed-in user: it uploads browser-only items (one time) and refreshes the device copies from the account.
 */
import { supabase } from './supabase.ts';
import {
    LABEL_SHEET_SETTING, countPendingProfitCalcs, deleteProfitCalc, loadProfitCalcs, parseRate, pendingFieldKey, readProfitCalcsLocal,
    saveDefaultSignature, saveLaborRate,
    saveProfitCalc, saveSetting, syncLabelSheet, syncProfileValues, claimLegacyProfitCalcs,
    type DbError, type KeyValueStore, type ProfileValuesRemote, type ProfitCalcRemote, type SavedProfitCalc, type SettingsRemote, type SyncMode,
} from './userDataSync.ts';

export type { SavedProfitCalc, SyncMode } from './userDataSync.ts';

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
