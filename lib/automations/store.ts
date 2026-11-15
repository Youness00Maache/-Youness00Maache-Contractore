/**
 * The automation rules' saved state, one instance per page: the user's choices (Settings > Automations), the jobs seen
 * completed and the drafts already made all follow the account (public.user_settings, lib/userData.ts) with a device
 * copy for an instant first paint and offline use. Same pattern as lib/notifications/store.ts.
 *
 * Merging: choices = the newest copy wins; seen jobs and made drafts = unions (nothing one device learned is lost).
 * A save that fails (offline, table missing) is merged into the account copy the next time it is read.
 */
import { browserStore, readAccountSetting, writeAccountSetting } from '../userData.ts';
import {
    AUTOMATION_DONE_SETTING, AUTOMATION_PREFS_SETTING, AUTOMATION_SEEN_SETTING, defaultAutomationPrefs, newerAutomationPrefs,
    parseAutomationPrefs, sameAutomationPrefs, type AutomationPrefs,
} from './rules.ts';
import { emptyDone, emptySeen, mergeDone, mergeSeen, parseDone, parseSeen, sameDone, sameSeen, type DoneLog, type SeenJobs } from './state.ts';

export interface AutomationSnapshot {
    uid: string | null;
    prefs: AutomationPrefs;
    seen: SeenJobs;
    done: DoneLog;
    /** the account's copy of the seen-jobs list was read (or the table is not there yet): jobs may be followed now */
    synced: boolean;
}

type Kind = 'prefs' | 'seen' | 'done';

interface Channel<T> {
    setting: string;
    local: (uid: string) => string;
    parse: (raw: unknown) => T;
    merge: (a: T, b: T) => T;
    same: (a: T, b: T) => boolean;
    empty: () => T;
}

const CHANNELS: { prefs: Channel<AutomationPrefs>; seen: Channel<SeenJobs>; done: Channel<DoneLog> } = {
    prefs: { setting: AUTOMATION_PREFS_SETTING, local: u => `cd.automations.prefs:${u}`, parse: parseAutomationPrefs, merge: newerAutomationPrefs, same: sameAutomationPrefs, empty: defaultAutomationPrefs },
    seen: { setting: AUTOMATION_SEEN_SETTING, local: u => `cd.automations.seen:${u}`, parse: parseSeen, merge: mergeSeen, same: sameSeen, empty: emptySeen },
    done: { setting: AUTOMATION_DONE_SETTING, local: u => `cd.automations.done:${u}`, parse: parseDone, merge: (a, b) => mergeDone(a, b, Date.now()), same: sameDone, empty: emptyDone },
};

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

const SAVE_DELAY_MS = 900;

const fresh = (): AutomationSnapshot => ({ uid: null, prefs: defaultAutomationPrefs(), seen: emptySeen(), done: emptyDone(), synced: false });
let snap: AutomationSnapshot = fresh();
const listeners = new Set<() => void>();
const timers: Partial<Record<Kind, ReturnType<typeof setTimeout>>> = {};
let syncing: Promise<void> | null = null;

const setSnap = (patch: Partial<AutomationSnapshot>) => {
    snap = { ...snap, ...patch };
    listeners.forEach(l => l());
};

const clearTimers = () => {
    for (const k of Object.keys(timers) as Kind[]) { clearTimeout(timers[k]); delete timers[k]; }
};

async function saveNow(kind: Kind): Promise<void> {
    delete timers[kind];
    const uid = snap.uid;
    if (!uid) return;
    const ch = CHANNELS[kind] as Channel<any>;
    const remote = await readAccountSetting(ch.setting);
    if (snap.uid !== uid) return;
    let value = snap[kind];
    if (remote.mode === 'account') {
        const parsed = ch.parse(remote.value);
        value = ch.merge(value, parsed);
        if (!ch.same(value, snap[kind])) {
            writeLocal(ch.local(uid), value);
            setSnap({ [kind]: value } as Partial<AutomationSnapshot>);
        }
        if (remote.value !== null && ch.same(value, parsed)) return; // the account already has it
    } else if (remote.mode !== 'device') {
        return; // offline / error: the next read merges this device's copy in
    }
    await writeAccountSetting(ch.setting, value);
}

const schedule = (kind: Kind, delay = SAVE_DELAY_MS) => {
    if (timers[kind]) clearTimeout(timers[kind]);
    timers[kind] = setTimeout(() => { void saveNow(kind); }, delay);
};

const apply = <K extends Kind>(kind: K, fn: (current: AutomationSnapshot[K]) => AutomationSnapshot[K]) => {
    const uid = snap.uid;
    if (!uid) return;
    const ch = CHANNELS[kind] as Channel<any>;
    const next = fn(snap[kind] as never);
    if (ch.same(next, snap[kind])) return;
    writeLocal(ch.local(uid), next);
    setSnap({ [kind]: next } as Partial<AutomationSnapshot>);
    schedule(kind);
};

export const automationStore = {
    subscribe(fn: () => void): () => void {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },

    getSnapshot(): AutomationSnapshot {
        return snap;
    },

    /** The signed-in user (null after sign-out). The device copies show at once; the account is read next. */
    init(uid: string | null): void {
        if (uid === snap.uid) return;
        clearTimers();
        if (!uid) { setSnap(fresh()); return; }
        setSnap({
            uid,
            prefs: parseAutomationPrefs(readLocal(CHANNELS.prefs.local(uid))),
            seen: parseSeen(readLocal(CHANNELS.seen.local(uid))),
            done: parseDone(readLocal(CHANNELS.done.local(uid))),
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
            const kinds: Kind[] = ['prefs', 'seen', 'done'];
            const reads = await Promise.all(kinds.map(k => readAccountSetting(CHANNELS[k].setting)));
            if (snap.uid !== uid) return;
            const patch: Partial<AutomationSnapshot> = {};
            kinds.forEach((kind, i) => {
                const res = reads[i];
                const ch = CHANNELS[kind] as Channel<any>;
                if (res.mode === 'account') {
                    const remote = ch.parse(res.value);
                    const merged = ch.merge(snap[kind], remote);
                    if (!ch.same(merged, snap[kind])) { (patch as any)[kind] = merged; writeLocal(ch.local(uid), merged); }
                    // this device knows something the account doesn't yet: upload the merge
                    if (!ch.same(merged, remote) && !ch.same(merged, ch.empty())) schedule(kind, 300);
                }
            });
            // the seen-jobs list decides when jobs may be followed: wait for the account (or its absence)
            if (reads[1].mode === 'account' || reads[1].mode === 'device') patch.synced = true;
            if (Object.keys(patch).length) setSnap(patch);
        })().finally(() => { syncing = null; });
        return syncing;
    },

    /** Changes the user's choices (device copy now, account a moment later). */
    updatePrefs(fn: (prefs: AutomationPrefs) => AutomationPrefs): void { apply('prefs', fn); },
    updateSeen(fn: (seen: SeenJobs) => SeenJobs): void { apply('seen', fn); },
    updateDone(fn: (done: DoneLog) => DoneLog): void { apply('done', fn); },

    /** Sends waiting saves right away (the tab is being hidden / closed). */
    flush(): void {
        for (const k of Object.keys(timers) as Kind[]) { clearTimeout(timers[k]); void saveNow(k); }
    },
};
