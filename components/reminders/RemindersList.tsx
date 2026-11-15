/**
 * Upcoming / sent / needs-attention reminders (for the Communication screen). One tap skips an upcoming reminder
 * (with Undo); problems link to their fix (connect Gmail, upgrade, open the document).
 * Hidden until the reminders migration is applied.
 *
 *   <RemindersList onUpgrade={onUpgrade} />
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleIcon } from '../Icons.tsx';
import { startGmailConnect } from '../../services/gmailService.ts';
import {
    addDays, formatShortDate, loadReminderOverview, REASON_LABELS, reminderTargetPath, RemindersUnavailableError, skipReminder, stepLabel,
    unskipReminder, zonedNow, type ReminderLogItem, type ReminderOverview, type UpcomingReminder,
} from '../../lib/reminders.ts';
import { cx, dayHeading, hourLabel, InlineNote, KindTag } from './ui.tsx';
import { errorText } from '../../lib/offline/connection.ts';

type Tab = 'upcoming' | 'sent' | 'attention';

interface Props {
    onUpgrade?: () => void;
    className?: string;
}

const timeOf = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const RemindersList: React.FC<Props> = ({ onUpgrade, className }) => {
    const navigate = useNavigate();
    const [data, setData] = useState<ReminderOverview | null>(null);
    const [hidden, setHidden] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('upcoming');
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
    const [connecting, setConnecting] = useState(false);

    const load = useCallback(async () => {
        try {
            setData(await loadReminderOverview());
            setError(null);
        } catch (e) {
            if (e instanceof RemindersUnavailableError) setHidden(true);
            else setError(errorText(e, 'Could not load reminders.'));
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!undo) return;
        const t = window.setTimeout(() => setUndo(null), 8000);
        return () => window.clearTimeout(t);
    }, [undo]);

    const sent = useMemo(() => (data?.log ?? []).filter((r) => r.status === 'sent'), [data]);
    const groups = useMemo(() => {
        if (!data) return [];
        const today = zonedNow(new Date(), data.basics.settings.timezone).ymd;
        const tomorrow = addDays(today, 1);
        const map = new Map<string, UpcomingReminder[]>();
        for (const u of data.upcoming) {
            const heading = dayHeading(u.step.sendDate, today, tomorrow);
            map.set(heading, [...(map.get(heading) ?? []), u]);
        }
        return [...map.entries()];
    }, [data]);

    if (hidden) return null;

    const open = (kind: UpcomingReminder['kind'] | ReminderLogItem['kind'], documentId: string | null, jobId: string | null) => {
        const path = reminderTargetPath(kind, documentId, jobId);
        if (path) navigate(path, { state: { fromJob: false } });
    };

    const skip = async (u: UpcomingReminder) => {
        setBusyKey(u.step.dedupeKey);
        setError(null);
        try {
            const id = await skipReminder(u.kind, u.targetId, u.step.stepKey, u.step.date);
            setUndo({ id, label: `${u.label} · ${stepLabel(u.kind, u.step.offset).toLowerCase()}` });
            await load();
        } catch (e) {
            setError(errorText(e, 'Could not skip this reminder.'));
        } finally {
            setBusyKey(null);
        }
    };

    const doUndo = async () => {
        if (!undo) return;
        const id = undo.id;
        setUndo(null);
        try {
            await unskipReminder(id);
            await load();
        } catch (e) {
            setError(errorText(e, 'Could not undo.'));
        }
    };

    const connect = async (hint?: string) => {
        setConnecting(true);
        try {
            await startGmailConnect({ returnTo: '/communication', loginHint: hint });
        } catch (e) {
            setConnecting(false);
            setError(errorText(e, 'Could not start the Google connection.'));
        }
    };

    const fixFor = (r: ReminderLogItem): React.ReactNode => {
        switch (r.reason) {
            case 'email_limit':
                return onUpgrade ? <button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={onUpgrade}>Upgrade</button> : null;
            case 'gmail_reconnect':
            case 'no_gmail':
                return <button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={() => connect()} disabled={connecting}><GoogleIcon className="h-4 w-4" /> {r.reason === 'no_gmail' ? 'Connect' : 'Reconnect'}</button>;
            case 'no_email':
                return <button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={() => navigate('/clients')}>Clients</button>;
            default:
                return reminderTargetPath(r.kind, r.document_id ?? null, r.jobIdForLink)
                    ? <button type="button" className="btn btn-sm btn-ghost min-h-[36px]" onClick={() => open(r.kind, r.document_id ?? null, r.jobIdForLink)}>Open</button>
                    : null;
        }
    };

    const basics = data?.basics;
    const paused = basics ? !basics.settings.enabled : false;
    const noGmail = basics ? !basics.sender : false;
    const attentionCount = data?.attention.length ?? 0;

    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'upcoming', label: 'Upcoming', count: data?.upcoming.length },
        { id: 'sent', label: 'Sent', count: sent.length || undefined },
        { id: 'attention', label: 'Needs attention', count: attentionCount || undefined },
    ];

    return (
        <section className={cx('card', className)} aria-labelledby="reminders-list-title">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                    <h2 id="reminders-list-title" className="text-base font-semibold">Automatic reminders</h2>
                    <p className="text-xs text-muted-foreground">
                        {basics
                            ? paused ? 'Paused in Settings.' : `Next 14 days · sent around ${hourLabel(basics.settings.sendHour)} ${basics.settings.timezone.replace(/_/g, ' ')}`
                            : 'Loading…'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-xl bg-muted p-1" role="tablist" aria-label="Reminders">
                        {tabs.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === t.id}
                                onClick={() => setTab(t.id)}
                                className={cx('min-h-[36px] rounded-lg px-2.5 text-xs font-semibold transition sm:px-3', tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                            >
                                {t.label}
                                {t.count ? <span className={cx('ml-1 tabular-nums', t.id === 'attention' ? 'text-warning' : 'text-muted-foreground')}>{t.count}</span> : null}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm min-h-[36px]" onClick={() => navigate('/settings#reminders')}>Settings</button>
                </div>
            </div>

            <div className="space-y-3 p-3 sm:p-4">
                {error && <InlineNote tone="danger" action={<button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={load}>Retry</button>}>{error}</InlineNote>}
                {undo && (
                    <InlineNote tone="info" action={<button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={doUndo}>Undo</button>}>
                        Skipped: {undo.label}
                    </InlineNote>
                )}
                {basics && noGmail && !paused && (
                    <InlineNote
                        tone="warning"
                        action={<button type="button" className="btn btn-sm btn-primary min-h-[36px]" onClick={() => connect()} disabled={connecting}><GoogleIcon className="h-4 w-4" /> Connect Gmail</button>}
                    >
                        Connect Gmail to send these. Nothing goes out until you do.
                    </InlineNote>
                )}

                {!data && !error && (
                    <div className="space-y-2" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
                )}

                {data && tab === 'upcoming' && (
                    data.upcoming.length === 0 ? (
                        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                            {paused ? 'Reminders are paused.' : 'Nothing planned for the next 14 days. Invoices marked Sent with a due date, and estimates marked Sent, show up here.'}
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {groups.map(([heading, items]) => (
                                <div key={heading}>
                                    <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{heading}</p>
                                    <ul className="divide-y divide-border rounded-xl border border-border">
                                        {items.map((u) => (
                                            <li key={u.step.dedupeKey} className="flex items-center gap-3 px-3 py-2.5">
                                                <KindTag kind={u.kind} />
                                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(u.kind, u.documentId, u.jobId)}>
                                                    <span className="block truncate text-sm font-medium text-foreground">
                                                        {u.label}{u.clientName ? <span className="text-muted-foreground"> · {u.clientName}</span> : null}
                                                    </span>
                                                    <span className={cx('block truncate text-xs', u.recipient ? 'text-muted-foreground' : 'text-warning')}>
                                                        {stepLabel(u.kind, u.step.offset)}
                                                        {u.amountText ? ` · ${u.amountText}` : ''}
                                                        {u.recipient ? ` · ${u.recipient}` : ' · no client email'}
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm min-h-[36px] shrink-0"
                                                    onClick={() => skip(u)}
                                                    disabled={busyKey === u.step.dedupeKey}
                                                    aria-label={`Skip the reminder for ${u.label}`}
                                                >
                                                    {busyKey === u.step.dedupeKey ? 'Skipping…' : 'Skip'}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {data && tab === 'sent' && (
                    sent.length === 0 ? (
                        <p className="px-1 py-6 text-center text-sm text-muted-foreground">No reminders sent yet.</p>
                    ) : (
                        <ul className="divide-y divide-border rounded-xl border border-border">
                            {sent.slice(0, 50).map((r) => (
                                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                                    <KindTag kind={r.kind} />
                                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(r.kind, r.document_id ?? null, r.jobIdForLink)}>
                                        <span className="block truncate text-sm font-medium text-foreground">{r.subject || r.label}</span>
                                        <span className="block truncate text-xs text-muted-foreground">{r.label}{r.to_email ? ` · ${r.to_email}` : ''}</span>
                                    </button>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{timeOf(r.sent_at)}</span>
                                </li>
                            ))}
                        </ul>
                    )
                )}

                {data && tab === 'attention' && (
                    data.attention.length === 0 ? (
                        <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nothing needs your attention.</p>
                    ) : (
                        <ul className="divide-y divide-border rounded-xl border border-border">
                            {data.attention.map((r) => (
                                <li key={r.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                        <KindTag kind={r.kind} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium text-foreground">{r.label}{r.clientName ? <span className="text-muted-foreground"> · {r.clientName}</span> : null}</span>
                                            <span className={cx('block text-xs', r.status === 'failed' ? 'text-destructive' : 'text-warning')}>
                                                {r.status === 'failed' ? 'Not sent' : 'Skipped'}: {REASON_LABELS[r.reason || ''] || 'unknown reason'} · {formatShortDate(r.scheduled_for)}
                                            </span>
                                        </span>
                                    </div>
                                    <div className="flex shrink-0 gap-2 pl-14 sm:pl-0">{fixFor(r)}</div>
                                </li>
                            ))}
                        </ul>
                    )
                )}
            </div>
        </section>
    );
};

export default RemindersList;
