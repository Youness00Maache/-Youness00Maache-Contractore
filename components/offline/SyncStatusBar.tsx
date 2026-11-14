/**
 * The strip under the top bar: offline state, documents waiting to sync, and "Changed on another device" notices.
 * It replaces the old offline banner (same place and style); with nothing to say it renders nothing.
 */
import React from 'react';
import { WifiOffIcon } from '../Icons.tsx';
import type { OutboxHistoryEntry, OutboxItem } from '../../lib/offline/outboxModel.ts';

interface Props {
    online: boolean;
    usingCachedData: boolean;
    items: OutboxItem[];
    notices: OutboxHistoryEntry[];
    syncing: boolean;
    onSyncNow: () => void;
    onOpen: () => void;
    onDismissNotices: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ onClick, children, disabled }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="min-h-[32px] shrink-0 rounded-md px-1.5 text-sm font-semibold text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
    >
        {children}
    </button>
);

const SyncStatusBar: React.FC<Props> = ({ online, usingCachedData, items, notices, syncing, onSyncNow, onOpen, onDismissNotices }) => {
    const count = items.length;
    const refused = items.filter(i => i.status !== 'pending');

    if (!online) {
        return (
            <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground" role="status">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
                    <span>
                        <WifiOffIcon className="mr-1.5 inline h-4 w-4 align-[-3px] text-warning" />
                        {count
                            ? <>You're offline. <strong className="font-semibold">{plural(count, 'document')}</strong> saved on this device, waiting to sync.</>
                            : "You're offline. Daily reports, time sheets, logs, notes and receipts still save on this device; estimates and invoices can be drafted."}
                    </span>
                    {count > 0 && <LinkButton onClick={onOpen}>View</LinkButton>}
                </div>
            </div>
        );
    }

    if (count > 0) {
        const text = syncing
            ? `Syncing ${plural(count, 'document')}…`
            : refused.length
                ? `${plural(refused.length, 'document')} couldn't sync: ${refused[0].error?.message || 'the account refused it.'}`
                : `${plural(count, 'document')} waiting to sync.`;
        return (
            <div className={`border-b px-4 py-2 text-sm text-foreground ${refused.length && !syncing ? 'border-destructive/25 bg-destructive/5' : 'border-border bg-muted/50'}`} role="status">
                <div className="mx-auto flex max-w-7xl items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${syncing ? 'animate-pulse bg-primary' : refused.length ? 'bg-destructive' : 'bg-warning'}`} aria-hidden />
                    <span className="line-clamp-2 min-w-0 flex-1 sm:line-clamp-1">{text}</span>
                    {!syncing && <LinkButton onClick={onSyncNow}>Sync now</LinkButton>}
                    <LinkButton onClick={onOpen}>View</LinkButton>
                </div>
            </div>
        );
    }

    if (notices.length) {
        const latest = notices[0];
        return (
            <div className="border-b border-border bg-muted/50 px-4 py-2 text-sm text-foreground" role="status">
                <div className="mx-auto flex max-w-7xl items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span className="line-clamp-2 min-w-0 flex-1 sm:line-clamp-1">
                        <strong className="font-semibold">{latest.title}</strong>: {latest.message}
                        {notices.length > 1 ? ` (+${notices.length - 1} more)` : ''}
                    </span>
                    <LinkButton onClick={onOpen}>View</LinkButton>
                    <LinkButton onClick={onDismissNotices}>Dismiss</LinkButton>
                </div>
            </div>
        );
    }

    if (usingCachedData) {
        return (
            <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-foreground" role="status">
                <WifiOffIcon className="mr-1.5 inline h-4 w-4 align-[-3px] text-warning" />
                Showing data saved on this device. Some information may be out of date.
            </div>
        );
    }
    return null;
};

export default SyncStatusBar;
