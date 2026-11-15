/**
 * The signed-in contractor's leads and appointments, read once and shared by every screen that shows them: the Leads
 * screen, the nav badge ("follow-ups due"), the dashboard bar and the Schedule. A change made in one place (a stage
 * move, a booked appointment) shows in the others at once. Read-only here; the writes are in ./leadsApi.ts and their
 * results are handed back with patchLead / removeLead / patchAppointment / removeAppointment.
 *
 *   const store = useLeadsStore(userId, enabled, online);
 *   store.leads          Lead[] | undefined (undefined = not read yet)
 *   store.appointments   Appointment[] | undefined
 *   store.error          '' or a readable sentence when the first read failed
 *   store.reload()       read again (also done when the tab gets focus and every 3 minutes while visible)
 *
 * Nothing is read until `enabled` (the leads feature is 'ready'). A missing table / column turns the feature off
 * (markLeadsMissing), so the UI falls back to today's inbox.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { listAppointments, listLeads } from './leadsApi.ts';
import { markLeadsMissing } from './leadsFeature.ts';
import type { Appointment, Lead } from './leadTypes.ts';
import { leadsDueCount } from './leadViewLogic.ts';
import { localYmd } from './leadLogic.ts';
import { errorText } from '../offline/connection.ts';

interface StoreState {
    uid: string | null;
    leads: Lead[] | undefined;
    appointments: Appointment[] | undefined;
    loading: boolean;
    error: string;
    loadedAt: number;
}

const EMPTY: StoreState = { uid: null, leads: undefined, appointments: undefined, loading: false, error: '', loadedAt: 0 };
let state: StoreState = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const STALE_MS = 20_000;
const REFRESH_MS = 3 * 60 * 1000;

const emit = () => listeners.forEach(l => l());
const set = (patch: Partial<StoreState>) => { state = { ...state, ...patch }; emit(); };

/** A different account signed in: forget the previous one's data. */
const forUser = (uid: string | null) => {
    if (state.uid !== uid) { state = { ...EMPTY, uid }; emit(); }
};

export const resetLeadsStore = (): void => { inflight = null; state = EMPTY; emit(); };

/** Reads both lists (deduplicated; `force` skips the freshness check). */
export const refreshLeads = (uid: string, force = false): Promise<void> => {
    forUser(uid);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
    if (inflight) return inflight;
    if (!force && state.leads && Date.now() - state.loadedAt < STALE_MS) return Promise.resolve();
    set({ loading: true });
    inflight = (async () => {
        try {
            // lost leads are archived by the app (the old inbox's Archive), so the board needs them too
            const [leads, appointments] = await Promise.all([
                listLeads({ includeArchived: true, limit: 500 }),
                listAppointments({ from: new Date(Date.now() - 60 * 86_400_000).toISOString(), limit: 500 }),
            ]);
            if (leads === null || appointments === null) { markLeadsMissing(); set({ leads: [], appointments: [], error: '', loading: false, loadedAt: Date.now() }); return; }
            set({ leads, appointments, error: '', loading: false, loadedAt: Date.now() });
        } catch (e) {
            set({ loading: false, error: state.leads ? '' : errorText(e, 'Your leads could not be loaded.') });
        }
    })().finally(() => { inflight = null; });
    return inflight;
};

// ------------------------------------------------------------------------------------------------ local changes
export const patchLead = (lead: Lead): void => {
    const list = state.leads || [];
    const exists = list.some(l => l.id === lead.id);
    set({ leads: exists ? list.map(l => (l.id === lead.id ? lead : l)) : [lead, ...list] });
};
export const removeLead = (id: string): void => {
    set({ leads: (state.leads || []).filter(l => l.id !== id), appointments: (state.appointments || []).filter(a => a.leadId !== id) });
};
export const patchAppointment = (appt: Appointment): void => {
    const list = state.appointments || [];
    const exists = list.some(a => a.id === appt.id);
    const next = exists ? list.map(a => (a.id === appt.id ? appt : a)) : [...list, appt];
    set({ appointments: next.filter(a => a.status !== 'cancelled').sort((a, b) => a.startsAt.localeCompare(b.startsAt)) });
};
export const removeAppointment = (id: string): void => {
    set({ appointments: (state.appointments || []).filter(a => a.id !== id) });
};

export interface LeadsStore {
    leads: Lead[] | undefined;
    appointments: Appointment[] | undefined;
    loading: boolean;
    error: string;
    reload: () => Promise<void>;
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => state;

export function useLeadsStore(uid: string | null | undefined, enabled: boolean, online = true): LeadsStore {
    const s = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
    const active = Boolean(uid && enabled);

    useEffect(() => {
        if (!active || !uid) return;
        if (online) void refreshLeads(uid);
        const onVisible = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void refreshLeads(uid); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        const timer = window.setInterval(onVisible, REFRESH_MS);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [active, uid, online]);

    const reload = useCallback(() => (uid ? refreshLeads(uid, true) : Promise.resolve()), [uid]);
    const mine = active && s.uid === uid;
    return useMemo(() => ({
        leads: mine ? s.leads : undefined,
        appointments: mine ? s.appointments : undefined,
        loading: mine ? s.loading : false,
        error: mine ? s.error : '',
        reload,
    }), [mine, s.leads, s.appointments, s.loading, s.error, reload]);
}

/** How many open leads have a follow-up due today or earlier (the nav badge). 0 until the leads are read. */
export function useLeadsDue(uid: string | null | undefined, enabled: boolean, online = true): number {
    const { leads } = useLeadsStore(uid, enabled, online);
    const today = localYmd(new Date());
    return useMemo(() => (leads ? leadsDueCount(leads, today) : 0), [leads, today]);
}
