/**
 * Logout with documents that only exist on this device: "Sync first" (then logs out when everything synced),
 * "Log out and delete them", or stay signed in.
 */
import React, { useEffect, useState } from 'react';

interface Props {
    open: boolean;
    count: number;
    online: boolean;
    /** first refusal reason after "Sync first" (when something couldn't sync) */
    problem: string | null;
    onSyncFirst: () => Promise<void>;
    onLogoutAnyway: () => Promise<void>;
    onCancel: () => void;
}

const LogoutGuardDialog: React.FC<Props> = ({ open, count, online, problem, onSyncFirst, onLogoutAnyway, onCancel }) => {
    const [busy, setBusy] = useState<'' | 'sync' | 'logout'>('');
    useEffect(() => {
        if (!open) { setBusy(''); return; }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy, onCancel]);
    if (!open) return null;

    const docs = `${count} document${count === 1 ? '' : 's'}`;
    const act = async (which: 'sync' | 'logout', fn: () => Promise<void>) => {
        setBusy(which);
        try { await fn(); } finally { setBusy(''); }
    };

    return (
        <div className="modal-backdrop z-[110]" onClick={() => { if (!busy) onCancel(); }} role="presentation">
            <div className="modal-panel p-6" role="alertdialog" aria-modal="true" aria-labelledby="logout-guard-title" onClick={e => e.stopPropagation()}>
                <h2 id="logout-guard-title" className="text-lg font-bold text-foreground">{docs} not synced yet</h2>
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <p>
                        {count === 1 ? 'It is' : 'They are'} saved only on this device. Logging out deletes {count === 1 ? 'it' : 'them'} from this device,
                        so {count === 1 ? 'it' : 'they'} would never reach your account.
                    </p>
                    {!online && <p className="font-medium text-warning">You’re offline. Connect to the internet to sync first.</p>}
                    {problem && <p className="font-medium text-destructive">Not everything could sync: {problem}</p>}
                </div>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" className="btn btn-outline" onClick={onCancel} disabled={Boolean(busy)}>Stay signed in</button>
                    <button type="button" className="btn btn-danger" onClick={() => void act('logout', onLogoutAnyway)} disabled={Boolean(busy)}>
                        {busy === 'logout' ? 'Logging out…' : 'Log out and delete them'}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => void act('sync', onSyncFirst)} disabled={!online || Boolean(busy)} autoFocus>
                        {busy === 'sync' ? 'Syncing…' : 'Sync first'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LogoutGuardDialog;
