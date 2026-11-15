/**
 * Settings → "Reminders & follow-ups": master switch, schedule per kind (invoices / estimates / visits), send time,
 * sender account and the message wording with {placeholders}. Saves on its own (separate from the profile save bar).
 * Until the reminders migration is applied it shows a short "not available yet" note.
 *
 *   <ReminderSettingsCard onUpgradeClick={onUpgradeClick} />
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GoogleIcon } from '../Icons.tsx';
import { startGmailConnect } from '../../services/gmailService.ts';
import { supabase } from '../../lib/supabase.ts';
import {
    browserTimezone, buildValues, loadReminderBasics, normalizeOffsets, offsetChip, PLACEHOLDER_HELP, REMINDER_RULES, REMINDER_SETTINGS_CHANGED,
    RemindersUnavailableError, renderReminder, resolveTemplate, safeTimezone, saveReminderSettings, pendingReminderSettings, TEMPLATE_KEYS, TEMPLATE_PLACEHOLDERS,
    TEMPLATE_TITLES, zonedNow, addDays,
    type ReminderBasics, type ReminderKind, type ReminderSettings, type TemplateKey,
} from '../../lib/reminders.ts';
import { cx, hourLabel, InlineNote, Switch } from './ui.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { isOffline, isOfflineFailure, readListCopy, saveListCopy } from '../../lib/offline/deviceCache.ts';
import { errorText } from '../../lib/offline/connection.ts';

interface Props {
    onUpgradeClick?: () => void;
}

const KIND_ROWS: { kind: ReminderKind; title: string; hint: string; addLabel: string }[] = [
    { kind: 'invoice', title: 'Unpaid invoices', hint: 'Counted from the due date. Stops when paid.', addLabel: 'days after due (negative = before)' },
    { kind: 'estimate', title: 'Estimate follow-ups', hint: 'Counted from the day it was sent. Stops on approve or decline.', addLabel: 'days after sending' },
    { kind: 'visit', title: 'Visit reminders', hint: 'For active jobs with a start date.', addLabel: 'days before the visit' },
];

const COMMON_ZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
    'Pacific/Honolulu', 'America/Halifax', 'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris', 'Africa/Casablanca',
    'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

const sameSettings = (a: ReminderSettings, b: ReminderSettings) => JSON.stringify(a) === JSON.stringify(b);

const sampleValues = (key: TemplateKey, s: ReminderSettings, company: string, name: string) => {
    const today = zonedNow(new Date(), s.timezone).ymd;
    return buildValues({
        kind: key === 'estimate' ? 'estimate' : key === 'visit' ? 'visit' : 'invoice',
        today,
        clientName: 'Jane Smith',
        number: key === 'estimate' ? 'EST-1042' : 'INV-1042',
        amount: 1250,
        link: 'https://www.contractordocs.app/?portal=…',
        payLink: key.startsWith('invoice') ? 'https://paypal.me/yourcompany/1250' : '',
        dueDate: key === 'invoice_overdue' ? addDays(today, -7) : addDays(today, 3),
        sentDate: addDays(today, -3),
        visitDate: addDays(today, 1),
        jobName: 'Kitchen remodel',
        company,
        myName: name,
    });
};

const ReminderSettingsCard: React.FC<Props> = ({ onUpgradeClick }) => {
    const location = useLocation();
    const ref = useRef<HTMLElement | null>(null);
    const bodyRef = useRef<HTMLTextAreaElement | null>(null);
    const [basics, setBasics] = useState<ReminderBasics | null>(null);
    const [draft, setDraft] = useState<ReminderSettings | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [adding, setAdding] = useState<Record<ReminderKind, string>>({ invoice: '', estimate: '', visit: '' });
    const [wordingOpen, setWordingOpen] = useState(false);
    const [templateKey, setTemplateKey] = useState<TemplateKey>('invoice_due');
    const [connecting, setConnecting] = useState(false);
    const [profileNames, setProfileNames] = useState({ company: 'Your Company', name: 'Your Name' });

    const load = async (force = false) => {
        setLoadError(null);
        try {
            const b = await loadReminderBasics(force);
            setBasics(b);
            // a user without saved settings gets this device's time zone when they first save
            setDraft(b.saved ? b.settings : { ...b.settings, timezone: browserTimezone() });
            void saveListCopy('reminder_basics', [b]);
        } catch (e) {
            if (e instanceof RemindersUnavailableError) setUnavailable(true);
            else if (isOfflineFailure(e)) {
                // offline: the settings as last seen on this device (+ a change saved offline); a save waits here too
                const kept = (await readListCopy<ReminderBasics>('reminder_basics'))?.rows?.[0];
                if (kept) {
                    const settings = pendingReminderSettings() ?? kept.settings;
                    setBasics({ ...kept, settings });
                    setDraft(settings);
                } else setLoadError("You're offline. Reminder settings show here once you're back online.");
            } else setLoadError(errorText(e, 'Could not load reminder settings.'));
        }
    };
    useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // names for the preview
    useEffect(() => {
        let alive = true;
        (async () => {
            const { data } = await supabase.auth.getSession();
            const id = data.session?.user?.id;
            if (!id) return;
            const { data: p } = await supabase.from('profiles').select('name, company_name').eq('id', id).maybeSingle();
            if (alive && p) setProfileNames({ company: (p as any).company_name || 'Your Company', name: (p as any).name || '' });
        })().catch(() => undefined);
        return () => { alive = false; };
    }, []);

    // /settings#reminders scrolls here
    useEffect(() => {
        if (location.hash !== '#reminders') return;
        const t = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
        return () => window.clearTimeout(t);
    }, [location.hash, basics]);

    useEffect(() => {
        if (!savedAt) return;
        const t = window.setTimeout(() => setSavedAt(null), 3000);
        return () => window.clearTimeout(t);
    }, [savedAt]);

    const baseline = useMemo(() => (basics ? (basics.saved ? basics.settings : { ...basics.settings, timezone: browserTimezone() }) : null), [basics]);
    const dirty = !!draft && !!baseline && (!sameSettings(draft, baseline) || !basics?.saved);

    // Settings > Automations has switches for the same reminders: when one is saved there, show it here too
    // (never over unsaved edits in this card)
    const dirtyRef = useRef(false);
    dirtyRef.current = dirty;
    useEffect(() => {
        const onChanged = () => { if (!dirtyRef.current) void load(true); };
        window.addEventListener(REMINDER_SETTINGS_CHANGED, onChanged);
        return () => window.removeEventListener(REMINDER_SETTINGS_CHANGED, onChanged);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const zones = useMemo(() => {
        let all: string[] = [];
        try { all = (Intl as any).supportedValuesOf?.('timeZone') ?? []; } catch { all = []; }
        const list = all.length ? all : COMMON_ZONES;
        const current = draft?.timezone;
        return current && !list.includes(current) ? [current, ...list] : list;
    }, [draft?.timezone]);

    const header = (right?: React.ReactNode) => (
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
            <div className="min-w-0">
                <h2 id="settings-reminders-title" className="text-base font-semibold">Reminders &amp; follow-ups</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Chases unpaid invoices and unanswered estimates from your own Gmail, on a schedule.</p>
            </div>
            <div className="flex shrink-0 items-center gap-1"><HelpButton topic="reminders" iconOnly />{right}</div>
        </div>
    );

    if (unavailable) {
        return (
            <section id="settings-reminders" ref={ref} className="card scroll-mt-24" aria-labelledby="settings-reminders-title">
                {header()}
                <div className="p-4 sm:p-6"><InlineNote>Automatic reminders are being switched on for your account. Check back soon.</InlineNote></div>
            </section>
        );
    }
    if (!draft || !basics) {
        return (
            <section id="settings-reminders" ref={ref} className="card scroll-mt-24" aria-labelledby="settings-reminders-title">
                {header()}
                <div className="space-y-3 p-4 sm:p-6">
                    {loadError
                        ? <InlineNote tone="danger" action={<button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={() => load(true)}>Retry</button>}>{loadError}</InlineNote>
                        : <><div className="skeleton h-5 w-1/2" /><div className="skeleton h-5 w-2/3" /><div className="skeleton h-5 w-1/3" /></>}
                </div>
            </section>
        );
    }

    const set = (patch: Partial<ReminderSettings>) => { setSavedAt(null); setDraft((d) => (d ? { ...d, ...patch } : d)); };
    const setKind = (kind: ReminderKind, patch: Partial<ReminderSettings['invoice']>) =>
        setDraft((d) => (d ? { ...d, [kind]: { ...d[kind], ...patch } } : d));

    const addOffset = (kind: ReminderKind) => {
        const raw = adding[kind].trim();
        if (!raw) return;
        let n = Math.trunc(Number(raw));
        if (!Number.isFinite(n)) return;
        if (kind === 'visit') n = -Math.abs(n);
        const next = normalizeOffsets(kind, [...draft[kind].offsets, n]);
        setKind(kind, { offsets: next });
        setAdding((a) => ({ ...a, [kind]: '' }));
    };

    const save = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const saved = await saveReminderSettings(draft);
            if (isOffline()) {
                // kept on this device (lib/reminders.ts): synced when the connection is back
                setBasics((prev) => (prev ? { ...prev, settings: saved, saved: true } : prev));
                setDraft(saved);
                setSavedAt(Date.now());
                return;
            }
            const b = await loadReminderBasics(true);
            setBasics(b);
            setDraft(saved);
            setSavedAt(Date.now());
        } catch (e) {
            setSaveError(errorText(e, 'Could not save.'));
        } finally {
            setSaving(false);
        }
    };

    const connect = async (hint?: string) => {
        setConnecting(true);
        try {
            await startGmailConnect({ returnTo: '/settings#reminders', loginHint: hint });
        } catch (e) {
            setConnecting(false);
            setSaveError(errorText(e, 'Could not start the Google connection.'));
        }
    };

    const template = draft.templates[templateKey] ?? { subject: '', body: '' };
    const effective = resolveTemplate(draft, templateKey);
    const setTemplate = (patch: Partial<{ subject: string; body: string }>) => {
        const base = { subject: effective.subject, body: effective.body, ...template };
        setDraft((d) => (d ? { ...d, templates: { ...d.templates, [templateKey]: { ...base, ...patch } } } : d));
    };
    const resetTemplate = () => setDraft((d) => {
        if (!d) return d;
        const next = { ...d.templates };
        delete next[templateKey];
        return { ...d, templates: next };
    });
    const insertPlaceholder = (name: string) => {
        const token = `{${name}}`;
        const el = bodyRef.current;
        const body = template.body || effective.body;
        if (!el) { setTemplate({ body: `${body}${token}` }); return; }
        const start = el.selectionStart ?? body.length;
        const end = el.selectionEnd ?? body.length;
        setTemplate({ body: body.slice(0, start) + token + body.slice(end) });
        window.requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
    };
    const preview = renderReminder(effective, sampleValues(templateKey, draft, profileNames.company, profileNames.name));
    const customized = !!draft.templates[templateKey];

    const sender = basics.senders.find((s) => s.id === draft.accountId) ?? basics.senders.find((s) => s.is_default) ?? basics.senders[0] ?? null;
    const cap = basics.usage?.limits.emails ?? 10;
    const used = basics.usage?.emailsThisMonth ?? 0;

    return (
        <section id="settings-reminders" ref={ref} className="card scroll-mt-24" aria-labelledby="settings-reminders-title">
            {header(<Switch checked={draft.enabled} onChange={(v) => set({ enabled: v })} label={draft.enabled ? 'Pause all reminders' : 'Turn reminders on'} />)}

            <div className="space-y-6 p-4 sm:p-6">
                {!draft.enabled && <InlineNote tone="info">All reminders are paused, including documents switched on one by one.</InlineNote>}

                {/* Sender */}
                {basics.senders.length === 0 ? (
                    <InlineNote
                        tone="warning"
                        action={<button type="button" className="btn btn-sm btn-primary min-h-[36px]" onClick={() => connect()} disabled={connecting}><GoogleIcon className="h-4 w-4" /> {connecting ? 'Opening…' : 'Connect Gmail'}</button>}
                    >
                        Reminders are sent from your own Gmail. Connect it first; until then nothing is scheduled or sent.
                    </InlineNote>
                ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm">
                            <span className="text-muted-foreground">Sent from </span>
                            {basics.senders.length > 1 ? (
                                <select className="input mt-1 inline-block w-auto max-w-full py-1.5 sm:mt-0" value={sender?.id ?? ''} onChange={(e) => set({ accountId: e.target.value || null })} aria-label="Send reminders from">
                                    {basics.senders.map((s) => <option key={s.id} value={s.id}>{s.gmail_address}{s.is_default ? ' (default)' : ''}</option>)}
                                </select>
                            ) : (
                                <strong className="font-semibold">{sender?.gmail_address}</strong>
                            )}
                        </div>
                        {sender?.needs_reconnect && (
                            <button type="button" className="btn btn-sm btn-primary min-h-[36px]" onClick={() => connect(sender.gmail_address)} disabled={connecting}>Reconnect Gmail</button>
                        )}
                    </div>
                )}

                {/* Schedules */}
                <div className={cx('divide-y divide-border rounded-2xl border border-border', !draft.enabled && 'opacity-60')}>
                    {KIND_ROWS.map(({ kind, title, hint, addLabel }) => {
                        const k = draft[kind];
                        const rule = REMINDER_RULES.offsets[kind];
                        return (
                            <div key={kind} className="space-y-3 p-3 sm:p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground">{title}</p>
                                        <p className="text-xs text-muted-foreground">{hint}</p>
                                    </div>
                                    <Switch checked={k.enabled} onChange={(v) => setKind(kind, { enabled: v })} label={`${title}: ${k.enabled ? 'on' : 'off'}`} disabled={!draft.enabled} />
                                </div>
                                {k.enabled && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        {k.offsets.length === 0 && <span className="text-xs text-warning">No days set: nothing will be sent.</span>}
                                        {k.offsets.map((o) => (
                                            <span key={o} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background pl-3 pr-1 text-xs font-semibold tabular-nums">
                                                {offsetChip(kind, o)}
                                                <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => setKind(kind, { offsets: k.offsets.filter((x) => x !== o) })} aria-label={`Remove ${offsetChip(kind, o)}`}>×</button>
                                            </span>
                                        ))}
                                        {k.offsets.length < rule.maxCount && (
                                            <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); addOffset(kind); }}>
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    className="input h-8 w-16 px-2 py-1 text-xs"
                                                    value={adding[kind]}
                                                    min={kind === 'visit' ? 1 : rule.min}
                                                    max={kind === 'visit' ? -rule.min : rule.max}
                                                    onChange={(e) => setAdding((a) => ({ ...a, [kind]: e.target.value }))}
                                                    aria-label={`Add a reminder: ${addLabel}`}
                                                    placeholder={kind === 'invoice' ? '+3' : '2'}
                                                />
                                                <button type="submit" className="btn btn-ghost btn-sm h-8 border border-dashed border-border">Add</button>
                                                <span className="hidden text-xs text-muted-foreground sm:inline">{addLabel}</span>
                                            </form>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Time */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label htmlFor="reminder-hour" className="label">Send at</label>
                        <select id="reminder-hour" className="input" value={draft.sendHour} onChange={(e) => set({ sendHour: Number(e.target.value) })}>
                            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="reminder-tz" className="label">Time zone</label>
                        <select id="reminder-tz" className="input" value={safeTimezone(draft.timezone)} onChange={(e) => set({ timezone: e.target.value })}>
                            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                        </select>
                    </div>
                </div>

                {/* Wording */}
                <div className="rounded-2xl border border-border">
                    <button type="button" className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 text-left sm:px-4" onClick={() => setWordingOpen((o) => !o)} aria-expanded={wordingOpen}>
                        <span>
                            <span className="block text-sm font-semibold">Message wording</span>
                            <span className="block text-xs text-muted-foreground">{Object.keys(draft.templates).length ? `${Object.keys(draft.templates).length} customized` : 'Short, friendly defaults'}</span>
                        </span>
                        <span aria-hidden className={cx('text-muted-foreground transition-transform', wordingOpen && 'rotate-180')}>▾</span>
                    </button>
                    {wordingOpen && (
                        <div className="space-y-3 border-t border-border p-3 sm:p-4">
                            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Message">
                                {TEMPLATE_KEYS.map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        role="tab"
                                        aria-selected={templateKey === key}
                                        onClick={() => setTemplateKey(key)}
                                        className={cx('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold', templateKey === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
                                    >
                                        {TEMPLATE_TITLES[key]}{draft.templates[key] ? ' •' : ''}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label htmlFor="reminder-subject" className="label">Subject</label>
                                <input id="reminder-subject" className="input" maxLength={200} value={template.subject || (customized ? '' : effective.subject)} onChange={(e) => setTemplate({ subject: e.target.value })} />
                            </div>
                            <div>
                                <label htmlFor="reminder-body" className="label">Message</label>
                                <textarea id="reminder-body" ref={bodyRef} rows={9} maxLength={2000} className="input font-[inherit] leading-relaxed" value={template.body || (customized ? '' : effective.body)} onChange={(e) => setTemplate({ body: e.target.value })} />
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {TEMPLATE_PLACEHOLDERS[templateKey].map((name) => (
                                        <button key={name} type="button" className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground hover:border-primary hover:text-primary" title={PLACEHOLDER_HELP[name]} onClick={() => insertPlaceholder(name)}>
                                            {`{${name}}`}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-1.5 text-xs text-muted-foreground">Lines with an empty link are left out (e.g. “Pay online” when the invoice has no pay link). Leave a field empty to use the default.</p>
                            </div>
                            <div className="rounded-xl bg-muted/50 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">{preview.subject}</p>
                                <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground/90">{preview.text}</p>
                            </div>
                            {customized && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={resetTemplate}>Reset to default</button>
                            )}
                        </div>
                    )}
                </div>

                {/* Plan */}
                {basics.paid ? (
                    <p className="text-xs text-muted-foreground">Premium: reminders are unlimited.</p>
                ) : (
                    <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>Free plan: each reminder counts toward your {cap} emails a month ({used} used). When they run out, reminders are skipped until next month.</span>
                        {onUpgradeClick && <button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={onUpgradeClick}>Upgrade for unlimited</button>}
                    </div>
                )}
            </div>

            {(dirty || saveError || savedAt) && (
                <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
                    <p className={cx('text-sm sm:mr-auto', saveError ? 'text-destructive' : 'text-muted-foreground')} role={saveError ? 'alert' : 'status'}>
                        {saveError || (dirty ? (basics.saved ? 'Unsaved reminder changes.' : 'Using the defaults. Save to keep your choices.') : 'Reminder settings saved.')}
                    </p>
                    {dirty && (
                        <div className="flex gap-2">
                            {basics.saved && <button type="button" className="btn btn-ghost flex-1 sm:flex-none" onClick={() => { setDraft(baseline); setSaveError(null); }} disabled={saving}>Discard</button>}
                            <button type="button" className="btn btn-primary flex-1 sm:flex-none" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save reminders'}</button>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default ReminderSettingsCard;

