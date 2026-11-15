/**
 * Where the setup assistant publishes what it knows (progress, what it remembers, the example project), so the
 * dashboard hint and the Settings row can show it without owning the data: components/setup/SetupHost.tsx fills it,
 * SetupHint.tsx reads it. A tiny external store (no network, no storage).
 */
import { useSyncExternalStore } from 'react';
import { emptySetupState, type SetupState } from './state.ts';
import { emptyExample, type ExampleTracking } from './example.ts';
import type { SetupProgress } from './steps.ts';

export interface SetupSnapshot {
    /** the first read of the account finished (the hint never shows before this) */
    loaded: boolean;
    progress: SetupProgress | null;
    state: SetupState;
    example: ExampleTracking;
}

const initial = (): SetupSnapshot => ({ loaded: false, progress: null, state: emptySetupState(), example: emptyExample() });

let snapshot: SetupSnapshot = initial();
const listeners = new Set<() => void>();

export const getSetupSnapshot = (): SetupSnapshot => snapshot;

export const publishSetup = (next: Partial<SetupSnapshot>): void => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach(l => l());
};

/** Signed out / another user: forget everything. */
export const resetSetupSnapshot = (): void => { snapshot = initial(); listeners.forEach(l => l()); };

export const useSetupSnapshot = (): SetupSnapshot =>
    useSyncExternalStore(
        (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        getSetupSnapshot,
        initial,
    );

/** "Resume setup" from anywhere (dashboard hint, Settings): the host opens the sheet. */
export const SETUP_OPEN_EVENT = 'cd:open-setup';
export const requestOpenSetup = (opts: { restart?: boolean } = {}): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(SETUP_OPEN_EVENT, { detail: { restart: !!opts.restart } }));
};

/** The hint's X: the host (the one writer of the wizard's memory) turns the reminder off. */
export const SETUP_HIDE_EVENT = 'cd:setup-hide';
export const requestHideSetup = (): void => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SETUP_HIDE_EVENT));
};

/** "Remove example data" from Settings: the host removes exactly what the example created. */
export const SETUP_REMOVE_EVENT = 'cd:setup-remove-example';
export const requestRemoveExample = (): void => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SETUP_REMOVE_EVENT));
};

/** The tour (components/help/TourHost.tsx) tells the assistant it is finished, so the two never stack on a new account. */
export const TOUR_CLOSED_EVENT = 'cd:tour-closed';
