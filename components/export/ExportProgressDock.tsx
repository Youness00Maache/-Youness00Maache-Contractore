/**
 * Small floating bar for a running / finished "Export everything" while the user is on another screen (mounted once by
 * App.tsx; hidden on Settings, which shows the full progress in "Your data"). Bottom-left on desktop; on phones it sits
 * above the tab bar and leaves room for the AI button on the right.
 */
import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckIcon, XCircleIcon } from '../Icons.tsx';
import { dismissExport, downloadExportFile, formatBytes, hideExportDock, useExportSnapshot } from '../../lib/export/exportStore.ts';

const ExportProgressDock: React.FC<{ userId: string }> = ({ userId }) => {
    const snap = useExportSnapshot();
    const location = useLocation();
    const navigate = useNavigate();

    // signed in as someone else on this device: the previous account's export is dropped
    useEffect(() => { if (snap.ownerId && snap.ownerId !== userId) dismissExport(); }, [snap.ownerId, userId]);

    const onSettings = location.pathname === '/settings' || location.pathname === '/profile';
    if (snap.ownerId !== userId || snap.dockHidden || onSettings) return null;
    if (snap.status !== 'running' && snap.status !== 'done' && snap.status !== 'error') return null;

    const running = snap.status === 'running';
    const done = snap.status === 'done';
    const size = snap.files.reduce((s, f) => s + f.size, 0);
    const title = running ? `Exporting your data · ${Math.floor(snap.percent)}%` : done ? 'Your export is ready' : 'The export stopped';
    const detail = running
        ? (snap.phase === 'pdfs' && snap.total ? `PDF ${Math.min(snap.done + 1, snap.total)} of ${snap.total}` : snap.label)
        : done ? `${snap.files.length > 1 ? `${snap.files.length} ZIP files · ` : ''}${formatBytes(size)}` : (snap.error || 'Open Settings to try again');
    const open = () => navigate('/settings#data');

    return (
        <div
            role="status"
            aria-live="polite"
            className="no-print fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-20 z-40 md:bottom-5 md:left-5 md:right-auto md:w-[22rem]"
        >
            <div className="overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift">
                <div className="flex items-center gap-2 py-2 pl-3 pr-1.5">
                    <button type="button" onClick={open} className="min-w-0 flex-1 text-left" aria-label={`${title}. Open Your data in Settings`}>
                        <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                            {done && <CheckIcon className="h-4 w-4 shrink-0 text-success" />}
                            <span className="truncate">{title}</span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
                    </button>
                    {done && snap.files.length === 1 && (
                        <button type="button" className="btn btn-sm btn-primary shrink-0" onClick={() => downloadExportFile(snap.files[0])}>Download</button>
                    )}
                    {done && snap.files.length > 1 && (
                        <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={open}>View files</button>
                    )}
                    <button
                        type="button"
                        // only hides the bar: the files stay in Settings → Your data until cleared there
                        onClick={() => hideExportDock()}
                        className="shrink-0 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={running ? 'Hide (the export keeps running)' : 'Close'}
                        title={running ? 'Hide (the export keeps running)' : 'Close'}
                    >
                        <XCircleIcon className="h-4 w-4" />
                    </button>
                </div>
                {running && (
                    <div className="h-1 w-full bg-muted" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(snap.percent)}>
                        <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, snap.percent)}%` }} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportProgressDock;
