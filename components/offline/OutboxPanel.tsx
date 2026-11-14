/**
 * "Saved on this device": the documents waiting to sync (with the reason when the account refused one, and Open /
 * Upgrade / Discard), and the last 7 days of replaced or discarded versions and sync notices (Restore / Remove).
 */
import React, { useEffect, useState } from 'react';
import { XCircleIcon } from '../Icons.tsx';
import { docSyncState, outboxTitle, type OutboxHistoryEntry, type OutboxItem } from '../../lib/offline/outboxModel.ts';
import { SyncChip } from './OfflineContext.tsx';

interface Props {
    open: boolean;
    onClose: () => void;
    online: boolean;
    items: OutboxItem[];
    history: OutboxHistoryEntry[];
    syncing: boolean;
    syncingDocId: string | null;
    storeKind: 'indexeddb' | 'memory';
    jobNameById: Map<string, string>;
    onSyncNow: () => void;
    onOpenDocument: (item: OutboxItem) => void;
    onDiscard: (docId: string) => Promise<void>;
    onRestore: (entryId: string) => Promise<void>;
    onRemoveHistory: (entryId: string) => Promise<void>;
    onDismiss: (entryId: string) => Promise<void>;
    onUpgrade: (reason: string) => void;
}

const when = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
        ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const REASON_LABEL: Record<OutboxHistoryEntry['reason'], string> = {
    conflict: 'Replaced version',
    discarded: 'Discarded',
    deleted_elsewhere: 'Saved again',
    renumbered: 'New number',
};

/** Two-step button: the first tap asks, the second does it. */
const ConfirmButton: React.FC<{ label: string; confirmLabel: string; onConfirm: () => Promise<void> | void; destructive?: boolean; disabled?: boolean }> = ({
    label, confirmLabel, onConfirm, destructive, disabled,
}) => {
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!asking) return;
        const t = setTimeout(() => setAsking(false), 5000);
        return () => clearTimeout(t);
    }, [asking]);
    return (
        <button
            type="button"
            className={`btn btn-sm min-h-[36px] ${asking ? (destructive ? 'btn-danger' : 'btn-primary') : 'btn-ghost border border-border'}`}
            disabled={disabled || busy}
            onClick={async () => {
                if (!asking) { setAsking(true); return; }
                setBusy(true);
                try { await onConfirm(); } finally { setBusy(false); setAsking(false); }
            }}
        >
            {asking ? confirmLabel : label}
        </button>
    );
};

const OutboxPanel: React.FC<Props> = ({
    open, onClose, online, items, history, syncing, syncingDocId, storeKind, jobNameById,
    onSyncNow, onOpenDocument, onDiscard, onRestore, onRemoveHistory, onDismiss, onUpgrade,
}) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open) return null;

    const count = items.length;
    const subtitle = count
        ? `${count} document${count === 1 ? '' : 's'} waiting to sync`
        : 'Everything on this device is synced.';

    return (
        <div className="modal-backdrop" onClick={onClose} role="presentation">
            <div className="modal-panel flex max-h-[92vh] flex-col sm:max-w-xl" role="dialog" aria-modal="true" aria-labelledby="outbox-title" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <h2 id="outbox-title" className="text-lg font-semibold">Saved on this device</h2>
                        <p className="text-sm text-muted-foreground">{subtitle}</p>
                    </div>
                    <button type="button" onClick={onClose} className="btn btn-ghost h-10 w-10 shrink-0 p-0" aria-label="Close"><XCircleIcon className="h-5 w-5" /></button>
                </div>

                <div className="space-y-6 overflow-y-auto px-5 py-4">
                    {storeKind === 'memory' && (
                        <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                            This browser can’t keep offline work after the page is closed (private window?). Sync before you close it.
                        </p>
                    )}

                    {count > 0 && (
                        <section aria-labelledby="outbox-waiting">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h3 id="outbox-waiting" className="label">Waiting to sync</h3>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm min-h-[36px]"
                                    onClick={onSyncNow}
                                    disabled={!online || syncing}
                                    title={online ? undefined : 'You’re offline. Connect to sync.'}
                                >
                                    {syncing ? 'Syncing…' : 'Sync now'}
                                </button>
                            </div>
                            {!online && <p className="mb-2 text-xs text-muted-foreground">You’re offline. They sync by themselves when the connection is back.</p>}
                            <ul className="divide-y divide-border rounded-xl border border-border">
                                {items.map(item => {
                                    const state = docSyncState(item, syncingDocId);
                                    const job = jobNameById.get(item.jobId);
                                    return (
                                        <li key={item.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <p className="truncate text-sm font-semibold text-foreground">{outboxTitle(item.type, item.data)}</p>
                                                    {state && <SyncChip tone={state.tone} label={state.label} />}
                                                </div>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {[item.type, job, `${item.kind === 'create' ? 'created' : 'edited'} ${when(item.updatedAt)}`].filter(Boolean).join(' · ')}
                                                </p>
                                                {item.error && <p className="mt-1 text-xs font-medium text-destructive">{item.error.message}</p>}
                                                {!item.error && item.number && <p className="mt-1 text-xs text-muted-foreground">Its number is confirmed when it syncs.</p>}
                                            </div>
                                            <div className="flex shrink-0 flex-wrap gap-1.5">
                                                <button type="button" className="btn btn-ghost btn-sm min-h-[36px] border border-border" onClick={() => onOpenDocument(item)}>Open</button>
                                                {item.error?.kind === 'plan_limit' && (
                                                    <button type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={() => onUpgrade(item.error!.message)}>Upgrade</button>
                                                )}
                                                <ConfirmButton label="Discard" confirmLabel="Discard it?" destructive onConfirm={() => onDiscard(item.docId)} disabled={syncingDocId === item.docId} />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {history.length > 0 && (
                        <section aria-labelledby="outbox-history">
                            <h3 id="outbox-history" className="label mb-2">Last 7 days</h3>
                            <ul className="divide-y divide-border rounded-xl border border-border">
                                {history.map(entry => {
                                    const restorable = Boolean(entry.item || entry.data);
                                    return (
                                        <li key={entry.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <p className="truncate text-sm font-semibold text-foreground">{entry.title}</p>
                                                    <SyncChip tone={entry.seen ? 'offline' : 'syncing'} label={REASON_LABEL[entry.reason]} />
                                                </div>
                                                <p className="text-xs text-muted-foreground">{entry.message}</p>
                                                <p className="text-xs text-muted-foreground">{[jobNameById.get(entry.jobId), when(entry.savedAt)].filter(Boolean).join(' · ')}</p>
                                            </div>
                                            <div className="flex shrink-0 flex-wrap gap-1.5">
                                                {restorable && (
                                                    <ConfirmButton
                                                        label="Restore"
                                                        confirmLabel={entry.reason === 'conflict' ? 'Replace current?' : 'Restore it?'}
                                                        onConfirm={() => onRestore(entry.id)}
                                                    />
                                                )}
                                                {!entry.seen
                                                    ? <button type="button" className="btn btn-ghost btn-sm min-h-[36px] border border-border" onClick={() => void onDismiss(entry.id)}>OK</button>
                                                    : <ConfirmButton label="Remove" confirmLabel="Remove it?" destructive onConfirm={() => onRemoveHistory(entry.id)} />}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {!count && !history.length && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Nothing here. When you save a document without a connection it waits here until it syncs.
                        </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                        Kept on this device for this account only. Replaced and discarded versions stay for 7 days, then they are deleted.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default OutboxPanel;
