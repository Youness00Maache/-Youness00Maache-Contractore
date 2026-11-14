/**
 * Offline outbox state for screens that don't get it as props:
 *  - OutboxStatusContext (whole app): the sync chip of any document card;
 *  - OfflineDocContext (around the open document form): the chip in the form header, and why sending / links are
 *    unavailable right now (ShareModal, Mark as paid).
 * Without a provider both hooks return null and nothing changes.
 */
import React, { createContext, useContext } from 'react';
import type { DocSyncTone } from '../../lib/offline/outboxModel.ts';

export interface DocSyncChipState {
    tone: DocSyncTone;
    label: string;
    reason: string;
}

export const OutboxStatusContext = createContext<{ stateOf: (docId: string) => DocSyncChipState | null } | null>(null);

/** Sync chip of a document (null: nothing waiting for it). */
export const useDocSyncState = (docId: string | null | undefined): DocSyncChipState | null => {
    const ctx = useContext(OutboxStatusContext);
    return ctx && docId ? ctx.stateOf(docId) : null;
};

export interface OfflineDocState {
    online: boolean;
    /** the open document waits in the outbox */
    pending: DocSyncChipState | null;
    /** this document type can be saved without a connection */
    canSaveOffline: boolean;
    /** why email / links / payments are unavailable right now (null = available) */
    sendBlockedReason: string | null;
}

export const OfflineDocContext = createContext<OfflineDocState | null>(null);

export const useOfflineDoc = (): OfflineDocState | null => useContext(OfflineDocContext);

/** Reason shown on send / link buttons, or null. */
export const sendBlockedReasonFor = (online: boolean, pending: boolean): string | null => {
    if (!online) return 'You’re offline. Sending and links work again once you’re back online.';
    if (pending) return 'This document hasn’t synced yet. Sending and links work once it has.';
    return null;
};

const TONES: Record<DocSyncTone | 'offline', string> = {
    pending: 'bg-warning/15 text-warning',
    syncing: 'bg-primary/10 text-primary',
    error: 'bg-destructive/10 text-destructive',
    offline: 'bg-muted text-muted-foreground',
};
const BADGE_TONES: Record<DocSyncTone | 'offline', string> = {
    pending: 'badge-warning',
    syncing: 'badge-primary',
    error: 'badge-danger',
    offline: 'badge-muted',
};

/**
 * Sync status: 'chip' is the small square chip of the pipeline cards (panel lists); 'badge' matches the status badges
 * next to it on document cards and in the form header.
 */
export const SyncChip: React.FC<{ tone: DocSyncTone | 'offline'; label: string; title?: string; className?: string; variant?: 'chip' | 'badge' }> = ({
    tone, label, title, className = '', variant = 'chip',
}) => (
    <span
        title={title}
        className={variant === 'badge'
            ? `badge ${BADGE_TONES[tone]} min-w-0 shrink-0 ${className}`
            : `inline-flex min-w-0 shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${TONES[tone]} ${className}`}
    >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${tone === 'syncing' ? 'animate-pulse' : ''}`} aria-hidden />
        <span className="truncate">{label}</span>
        {title && <span className="sr-only">: {title}</span>}
    </span>
);

/** The badge for a document card: nothing when the document isn't waiting in the outbox. */
export const DocSyncChip: React.FC<{ docId: string; className?: string }> = ({ docId, className }) => {
    const state = useDocSyncState(docId);
    return state ? <SyncChip variant="badge" tone={state.tone} label={state.label} title={state.reason} className={className} /> : null;
};
