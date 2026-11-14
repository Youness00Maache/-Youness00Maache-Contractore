/**
 * The bell's saved state, one instance per page: read / removed ids and the per-type choices follow the account
 * (public.user_settings 'notifications.state' / 'notifications.prefs', lib/userData.ts), with a device copy for an
 * instant first paint and offline use. Pop-ups on/off and the first-seen times of lasting conditions stay on the device.
 *
 * Merging: the read / removed lists are unions (nothing read on one device is lost, lib/notifications/model.ts
 * mergeStates); the choices are last-writer-wins. A save that fails (offline, table missing) is merged into the
 * account copy the next time it is read.
 */
import { browserStore, readAccountSetting, writeAccountSetting } from '../userData.ts';
import {
    NOTIFICATION_PREFS_SETTING, NOTIFICATION_STATE_SETTING, defaultPrefs, emptyState, mergeStates, newerPrefs, parsePrefs,
    parseSeen, parseState, sameState, type NotificationPrefs, type NotificationState, type SeenMap,
} from './model.ts';

export interface DevicePrefs {
    /** browser pop-ups (Notification API) on this device; off by default */
    popups: boolean;
}

export interface NotificationStoreSnapshot {
    uid: string | null;
    state: NotificationState;
    prefs: NotificationPrefs;
    device: DevicePrefs;
    /** the account copy was read at least once (else only this device's copy is known) */
    synced: boolean;
}

const stateKey = (uid: string) => `cd.notifications.state:${uid}`;
const prefsKey = (uid: string) => `cd.notifications.prefs:${uid}`;
const deviceKey = (uid: string) => `cd.notifications.device:${uid}`;
const seenKey = (uid: string) => `cd.notifications.seen:${uid}`;

const readLocal = (key: string): unknown => {
    try {
        const raw = browserStore.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};
const writeLocal = (key: string, value: unknown) => {
    try { browserStore.setItem(key, JSON.stringify(value)); } catch { /* storage full / blocked */ }
};

const SAVE_DELAY_MS = 1500;

let snap: NotificationStoreSnapshot = { uid: null, state: emptyState(), prefs: defaultPrefs(), device: { popups: false }, synced: false };
let seen: SeenMap = {};
const listeners = new Set<() => void>();
let stateTimer: ReturnType<typeof setTimeout> | null = null;
let prefsTimer: ReturnType<typeof setTimeout> | null = null;
let syncing: Promise<void> | null = null;

const emit = () => listeners.forEach(l => l());

const setSnap = (patch: Partial<NotificationStoreSnapshot>) => {
    snap = { ...snap, ...patch };
    emit();
};

async function saveStateNow(): Promise<void> {
    stateTimer = null;
    const uid = snap.uid;
    if (!uid) return;
    const remote = await readAccountSetting(NOTIFICATION_STATE_SETTING);
    if (snap.uid !== uid) return;
    let value = snap.state;
    if (remote.mode === 'account') {
        value = mergeStates(snap.state, parseState(remote.value), Date.now());
        if (!sameState(value, snap.state)) {
            writeLocal(stateKey(uid), value);
            setSnap({ state: value });
        }
        if (sameState(value, parseState(remote.value)) && remote.value !== null) return;
    } else if (remote.mode !== 'device') {
        return; // offline / error: the next read merges this device's copy in
    }
    await writeAccountSetting(NOTIFICATION_STATE_SETTING, value);
}

async function savePrefsNow(): Promise<void> {
    prefsTimer = null;
    if (!snap.uid) return;
    await writeAccountSetting(NOTIFICATION_PREFS_SETTING, snap.prefs);
}

export const notificationStore = {
    subscribe(fn: () => void): () => void {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },

    getSnapshot(): NotificationStoreSnapshot {
        return snap;
    },

    /** The signed-in user (null after sign-out). The device copies show at once; the account is read next. */
    init(uid: string | null): void {
        if (uid === snap.uid) return;
        if (stateTimer) { clearTimeout(stateTimer); stateTimer = null; }
        if (prefsTimer) { clearTimeout(prefsTimer); prefsTimer = null; }
        if (!uid) {
            seen = {};
            setSnap({ uid: null, state: emptyState(), prefs: defaultPrefs(), device: { popups: false }, synced: false });
            return;
        }
        const device = readLocal(deviceKey(uid)) as Partial<DevicePrefs> | null;
        seen = parseSeen(readLocal(seenKey(uid)));
        setSnap({
            uid,
            state: parseState(readLocal(stateKey(uid))),
            prefs: parsePrefs(readLocal(prefsKey(uid))),
            device: { popups: device?.popups === true },
            synced: false,
        });
        void this.syncFromAccount();
    },

    /** Reads the account copies (other devices' changes) and merges them with this device's. */
    syncFromAccount(): Promise<void> {
        if (syncing) return syncing;
        syncing = (async () => {
            const uid = snap.uid;
            if (!uid) return;
            const [stateRes, prefsRes] = await Promise.all([
                readAccountSetting(NOTIFICATION_STATE_SETTING),
                readAccountSetting(NOTIFICATION_PREFS_SETTING),
            ]);
            if (snap.uid !== uid) return;
            const patch: Partial<NotificationStoreSnapshot> = {};
            if (stateRes.mode === 'account') {
                const remote = parseState(stateRes.value);
                const merged = mergeStates(snap.state, remote, Date.now());
                if (!sameState(merged, snap.state)) { patch.state = merged; writeLocal(stateKey(uid), merged); }
                // this device read something the account doesn't have yet: upload the union
                if (!sameState(merged, remote) && (merged.clearedAt > 0 || Object.keys(merged.read).length || Object.keys(merged.dismissed).length)) {
                    if (!stateTimer) stateTimer = setTimeout(() => { void saveStateNow(); }, SAVE_DELAY_MS);
                }
                patch.synced = true;
            }
            if (prefsRes.mode === 'account') {
                const remote = parsePrefs(prefsRes.value);
                const winner = newerPrefs(snap.prefs, remote);
                if (winner !== snap.prefs) { patch.prefs = winner; writeLocal(prefsKey(uid), winner); }
                else if (snap.prefs.at > remote.at && !prefsTimer) prefsTimer = setTimeout(() => { void savePrefsNow(); }, 300);
            }
            if (Object.keys(patch).length) setSnap(patch);
        })().finally(() => { syncing = null; });
        return syncing;
    },

    /** Changes the read / removed state (device copy now, account a moment later). */
    update(fn: (state: NotificationState) => NotificationState): void {
        const uid = snap.uid;
        if (!uid) return;
        const next = fn(snap.state);
        if (sameState(next, snap.state)) return;
        writeLocal(stateKey(uid), next);
        setSnap({ state: next });
        if (stateTimer) clearTimeout(stateTimer);
        stateTimer = setTimeout(() => { void saveStateNow(); }, SAVE_DELAY_MS);
    },

    /** Sends a waiting save right away (the tab is being hidden / closed). */
    flush(): void {
        if (stateTimer) { clearTimeout(stateTimer); void saveStateNow(); }
        if (prefsTimer) { clearTimeout(prefsTimer); void savePrefsNow(); }
    },

    /** Per-type choices and quiet mode (account, every device). */
    setPrefs(prefs: NotificationPrefs): void {
        const uid = snap.uid;
        if (!uid) return;
        const next = { ...prefs, at: Math.max(Date.now(), snap.prefs.at + 1) };
        writeLocal(prefsKey(uid), next);
        setSnap({ prefs: next });
        if (prefsTimer) clearTimeout(prefsTimer);
        prefsTimer = setTimeout(() => { void savePrefsNow(); }, 400);
    },

    /** Pop-ups on this device. */
    setDevice(device: DevicePrefs): void {
        const uid = snap.uid;
        if (!uid) return;
        writeLocal(deviceKey(uid), device);
        setSnap({ device });
    },

    /** First-seen times of lasting conditions on this device (no re-render). */
    getSeen(): SeenMap {
        return seen;
    },

    setSeen(next: SeenMap): void {
        seen = next;
        if (snap.uid) writeLocal(seenKey(snap.uid), next);
    },
};
