/**
 * Offline saves of jobs and clients from code that has no access to the outbox hook (e.g. insertClient / updateClient
 * in components/ClientDetails.tsx, used by the Clients screen, inventory and the job form). App.tsx registers the
 * outbox here once the user is signed in; without it everything behaves exactly as online.
 */
import type { OutboxEntity, OutboxKind } from './outboxModel.ts';

export type OfflineEntity = Exclude<OutboxEntity, 'document'>;

export interface OfflineEntityQueue {
    /** keeps a job / client row in the outbox (it syncs when the connection is back) */
    queue: (entity: OfflineEntity, kind: OutboxKind, id: string, row: Record<string, unknown>) => Promise<void>;
    /** the row is waiting in the outbox (created offline: later saves of it must wait there too) */
    isWaiting: (id: string) => boolean;
}

let current: OfflineEntityQueue | null = null;

export const setOfflineEntityQueue = (queue: OfflineEntityQueue | null): void => { current = queue; };

/** The outbox to use for this save, or null when it should go to the account as usual (online, nothing waiting). */
export const offlineEntityQueueFor = (id?: string | null): OfflineEntityQueue | null => {
    if (!current) return null;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return offline || (id ? current.isWaiting(id) : false) ? current : null;
};

/** The outbox itself (null when no user is signed in): for a save whose connection dropped half way. */
export const offlineEntityQueue = (): OfflineEntityQueue | null => current;
