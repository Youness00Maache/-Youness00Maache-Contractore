/**
 * What the bell shows, published by <NotificationCenter> (mounted once in App.tsx) and read by <NotificationBell>
 * (in the app bar). A separate store so the polling and the minute tick re-render only the bell, never the app.
 */
import { useSyncExternalStore } from 'react';
import type { ShownNotification } from '../../lib/notifications/model.ts';

export interface CenterActions {
    open: (n: ShownNotification) => void;
    dismiss: (n: ShownNotification) => void;
    markAllRead: () => void;
    /** the panel was opened: refresh if the data is a bit old */
    panelOpened: () => void;
    openSettings: () => void;
}

export interface CenterSnapshot {
    list: ShownNotification[];
    unread: number;
    quiet: boolean;
    /** the first load finished (before that the panel shows placeholders) */
    loaded: boolean;
    /** time the list was built (epoch ms): the time labels use it */
    builtAt: number;
    actions: CenterActions | null;
}

const EMPTY: CenterSnapshot = { list: [], unread: 0, quiet: false, loaded: false, builtAt: 0, actions: null };
let snap: CenterSnapshot = EMPTY;
const listeners = new Set<() => void>();

export const centerStore = {
    get: (): CenterSnapshot => snap,
    set(next: CenterSnapshot): void {
        snap = next;
        listeners.forEach(l => l());
    },
    reset(): void {
        this.set(EMPTY);
    },
    subscribe(fn: () => void): () => void {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },
};

export const useNotificationCenterSnapshot = (): CenterSnapshot =>
    useSyncExternalStore(centerStore.subscribe, centerStore.get, () => EMPTY);
