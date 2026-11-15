/**
 * Client screen: "Emails sent" (roadmap D11). A collapsed list of the last 20 emails the app sent to this client
 * through the owner's Gmail (date, kind, subject, status) with "Remove from log". Hidden until the email_log table
 * exists. Loads only when opened.
 */
import React, { useCallback, useState } from 'react';
import { useEmailLogFeature } from '../../lib/emailLog/emailLogFeature.ts';
import { deleteEmailLogEntry, listEmailLog } from '../../lib/emailLog/emailLogApi.ts';
import { emailLogDate, isFailed, kindLabel } from '../../lib/emailLog/format.ts';
import type { EmailLogEntry } from '../../lib/emailLog/types.ts';
import { getErrorMessage } from '../commsKit.tsx';

const ClientEmailLog: React.FC<{ clientId: string; userId: string | null | undefined }> = ({ clientId, userId }) => {
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    const feature = useEmailLogFeature(userId, online);
    const [rows, setRows] = useState<EmailLogEntry[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows((await listEmailLog({ clientId, limit: 20 })) ?? []);
        } catch (e) {
            setError(getErrorMessage(e, 'Could not load the sent emails.'));
        } finally {
            setLoading(false);
        }
    }, [clientId]);

    const remove = async (id: string) => {
        setBusyId(id);
        setError(null);
        try {
            await deleteEmailLogEntry(id);
            setRows((list) => (list || []).filter((r) => r.id !== id));
            setConfirmId(null);
        } catch (e) {
            setError(getErrorMessage(e, 'Could not remove this entry.'));
        } finally {
            setBusyId(null);
        }
    };

    if (feature !== 'ready') return null;

    return (
        <details
            className="card card-pad"
            onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && rows === null && !loading) void load(); }}
        >
            <summary className="cursor-pointer font-semibold text-foreground">Emails sent</summary>
            <p className="mt-1 text-xs text-muted-foreground">Sent from the app with your Gmail. Only who, what and when is kept, never the message.</p>
            {loading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
            {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
            {rows && !rows.length && !loading && <p className="mt-2 text-sm text-muted-foreground">No emails sent to this client from the app yet.</p>}
            {rows && rows.length > 0 && (
                <ul className="mt-2 divide-y divide-border text-sm">
                    {rows.map((r) => (
                        <li key={r.id} className="py-2">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-xs text-muted-foreground">{emailLogDate(r.sent_at)} · {kindLabel(r.kind)}</span>
                                <span className={isFailed(r) ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                                    {isFailed(r) ? 'Failed' : 'Sent'}
                                </span>
                            </div>
                            <div className="break-words text-foreground">{r.subject || '(no subject)'}</div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs text-muted-foreground">{r.to_email}</span>
                                {confirmId === r.id ? (
                                    <span className="flex shrink-0 gap-1">
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)} disabled={busyId === r.id}>Keep</button>
                                        <button type="button" className="btn btn-outline btn-sm" onClick={() => void remove(r.id)} disabled={busyId === r.id}>
                                            {busyId === r.id ? 'Removing…' : 'Remove'}
                                        </button>
                                    </span>
                                ) : (
                                    <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setConfirmId(r.id)} aria-label={`Remove the log entry for ${r.subject || 'this email'}`}>
                                        Remove from log
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </details>
    );
};

export default ClientEmailLog;
