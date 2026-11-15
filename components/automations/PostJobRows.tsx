/**
 * Settings > Automations, group "Jobs": the three after-the-job emails (lib/automations/rules.ts POST_JOB_ROWS):
 *   Thank-you after the job, Warranty ending, Maintenance reminders.
 * Each row is a real switch (Premium; Free sees what it does and a "See Premium" button). Open the row to change the days,
 * the owner note (warranty), the review link (thank-you), the maintenance tip, the wording with a live preview, and to see
 * the next emails that are planned. The switch records the day it was turned on: only jobs completed (warranties ending)
 * on or after that day are emailed, so switching one on never mails a backlog.
 *
 * Settings: public.user_settings 'reminders.postjob' (usePostJobSettings, lib/warranty/postJobSettings.ts). The reminders
 * master switch, send hour, time zone and Gmail account are the existing Reminders settings (nothing changes there).
 *
 *   <PostJobRows paid={paid} basics={basics} hasSender={hasSender} onUpgradeClick={...} reviewLink="" company="" myName="" />
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cx, Switch } from '../reminders/ui.tsx';
import { POST_JOB_ROWS, type PostJobRow } from '../../lib/automations/rules.ts';
import {
    POST_JOB_PLACEHOLDER_HELP, POST_JOB_RULES, POST_JOB_TEMPLATE_PLACEHOLDERS, POST_JOB_TEMPLATE_TITLES, postJobStepLabel,
    previewPostJobEmail, resolvePostJobTemplate, setCompletionReview, setMaintenanceTip, setPostJobEnabled, setPostJobOffsets,
    setPostJobTemplate, setWarrantyOwner,
} from '../../lib/warranty/postJobSettings.ts';
import type { PostJobKind, PostJobSettings, PostJobTemplateKey } from '../../lib/warranty/types.ts';
import { loadUpcomingPostJob, type UpcomingResult } from '../../lib/warranty/postJobUpcoming.ts';
import { AUDIENCE_LABELS, formatDay, offsetsText, parseOffsetsText, warrantyScheduleText } from '../../lib/warranty/warrantyView.ts';
import { browserTimezone, type ReminderBasics } from '../../lib/reminders.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { usePostJobSettings, type PostJobSync } from './usePostJobSettings.ts';

/* ----------------------------------------------------------------------------------- small pieces */

const PremiumTag: React.FC = () => (
    <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-primary">Premium</span>
);

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const TEMPLATES_OF: Record<PostJobKind, PostJobTemplateKey[]> = {
    completion: ['completion'],
    warranty: ['warranty_client', 'warranty_owner'],
    maintenance: ['maintenance'],
};

const SYNC_TEXT: Partial<Record<NonNullable<PostJobSync>, string>> = {
    saving: 'Saving…',
    account: 'Saved to your account.',
    offline: 'Saved on this device. It goes to your account when you are back online.',
    device: 'Saved on this device.',
    failed: 'Could not save. Your change is not kept.',
};

/** Days boxes: free typing, checked and saved when you leave the box (or press Enter). */
const DaysField: React.FC<{
    id: string;
    label: string;
    kind: PostJobKind;
    value: number[];
    hint: string;
    onCommit: (offsets: number[]) => void;
}> = ({ id, label, kind, value, hint, onCommit }) => {
    const [text, setText] = useState(offsetsText(value));
    const [problem, setProblem] = useState<string | null>(null);
    const key = value.join(',');
    useEffect(() => { setText(offsetsText(value)); setProblem(null); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    const commit = () => {
        const r = parseOffsetsText(kind, text);
        if (r.problem) { setProblem(r.problem); return; }
        setProblem(null);
        setText(offsetsText(r.offsets));
        if (r.offsets.join(',') !== key) onCommit(r.offsets);
    };
    return (
        <div>
            <label className="label" htmlFor={id}>{label}</label>
            <input
                id={id}
                className={cx('input tabular-nums', problem && 'border-destructive')}
                inputMode="numeric"
                autoComplete="off"
                value={text}
                onChange={e => setText(e.target.value.replace(/[^0-9,\s]/g, ''))}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
            />
            {problem ? <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">{problem}</p> : <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
};

const CheckRow: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; children?: React.ReactNode }> = ({ checked, onChange, label, children }) => (
    <label className="flex cursor-pointer items-start gap-3 py-1">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 rounded border-input accent-[hsl(var(--primary))]" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{label}</span>
            {children && <span className="mt-0.5 block text-xs text-muted-foreground">{children}</span>}
        </span>
    </label>
);

/* ----------------------------------------------------------------------------------- wording */

interface SampleInfo { company: string; myName: string; reviewLink: string }

const WordingEditor: React.FC<{
    kind: PostJobKind;
    settings: PostJobSettings;
    sample: SampleInfo;
    onSave: (key: PostJobTemplateKey, t: { subject: string; body: string } | null) => void;
}> = ({ kind, settings, sample, onSave }) => {
    const keys = TEMPLATES_OF[kind];
    const [key, setKey] = useState<PostJobTemplateKey>(keys[0]);
    const [drafts, setDrafts] = useState<Partial<Record<PostJobTemplateKey, { subject: string; body: string }>>>({});
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const saved = resolvePostJobTemplate(settings, key);
    const shown = drafts[key] ?? saved;
    const dirty = !!drafts[key] && (drafts[key]!.subject !== saved.subject || drafts[key]!.body !== saved.body);
    const customized = !!settings.templates[key];
    const set = (patch: Partial<{ subject: string; body: string }>) => setDrafts(d => ({ ...d, [key]: { ...shown, ...patch } }));
    const today = todayYMD();
    const preview = useMemo(
        () => previewPostJobEmail(setPostJobTemplate(settings, key, shown, 0), key, { today, company: sample.company, myName: sample.myName, reviewLink: sample.reviewLink || undefined }),
        [settings, key, shown, today, sample.company, sample.myName, sample.reviewLink],
    );

    const insert = (name: string) => {
        const token = `{${name}}`;
        const el = bodyRef.current;
        if (!el) { set({ body: `${shown.body}${token}` }); return; }
        const start = el.selectionStart ?? shown.body.length;
        const end = el.selectionEnd ?? shown.body.length;
        set({ body: shown.body.slice(0, start) + token + shown.body.slice(end) });
        window.requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
    };
    const clearDraft = () => setDrafts(d => { const n = { ...d }; delete n[key]; return n; });

    return (
        <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Which email">
                {keys.map(k => (
                    <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={key === k}
                        onClick={() => setKey(k)}
                        className={cx('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold', key === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
                    >
                        {POST_JOB_TEMPLATE_TITLES[k]}{settings.templates[k] ? ' •' : ''}
                    </button>
                ))}
            </div>
            <div>
                <label className="label" htmlFor={`pj-subject-${key}`}>Subject</label>
                <input id={`pj-subject-${key}`} className="input" maxLength={200} value={shown.subject} onChange={e => set({ subject: e.target.value })} />
            </div>
            <div>
                <label className="label" htmlFor={`pj-body-${key}`}>Message</label>
                <textarea id={`pj-body-${key}`} ref={bodyRef} rows={8} maxLength={2000} className="input font-[inherit] leading-relaxed" value={shown.body} onChange={e => set({ body: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {POST_JOB_TEMPLATE_PLACEHOLDERS[key].map(name => (
                        <button key={name} type="button" className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground hover:border-primary hover:text-primary" title={POST_JOB_PLACEHOLDER_HELP[name]} onClick={() => insert(name)}>
                            {`{${name}}`}
                        </button>
                    ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                    Tap a word to add it. Each one is filled in for that client; a line with an empty link is left out.
                </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3" aria-live="polite">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What the {key === 'warranty_owner' ? 'owner' : 'client'} will get (example)</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{preview.subject}</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground/90">{preview.text}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm btn-primary min-h-[40px]" disabled={!dirty} onClick={() => { onSave(key, { subject: shown.subject, body: shown.body }); clearDraft(); }}>Save wording</button>
                {dirty && <button type="button" className="btn btn-sm btn-ghost min-h-[40px]" onClick={clearDraft}>Undo changes</button>}
                {customized && !dirty && <button type="button" className="btn btn-sm btn-outline min-h-[40px]" onClick={() => { onSave(key, null); clearDraft(); }}>Use the standard wording</button>}
            </div>
        </div>
    );
};

/* ----------------------------------------------------------------------------------- next scheduled */

const NextScheduled: React.FC<{
    kind: PostJobKind;
    settings: PostJobSettings;
    basics: ReminderBasics;
}> = ({ kind, settings, basics }) => {
    const [result, setResult] = useState<UpcomingResult | null>(null);
    const [failed, setFailed] = useState(false);
    const tz = basics.saved ? basics.settings.timezone : browserTimezone();
    const key = JSON.stringify([settings[kind], kind === 'warranty' ? 0 : 1, basics.settings.enabled, basics.settings.sendHour, tz, basics.paid]);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        loadUpcomingPostJob(kind, settings, { enabled: basics.settings.enabled, sendHour: basics.settings.sendHour, timezone: tz, paid: basics.paid }, todayYMD())
            .then(r => { if (alive) setResult(r); })
            .catch(() => { if (alive) { setResult(null); setFailed(true); } });
        return () => { alive = false; };
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    const empty = kind === 'warranty'
        ? 'No warranty ends in time for an email yet.'
        : 'Nothing yet. It starts with the next job you mark completed.';

    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Next scheduled{result?.preview ? ' (if you switch this on today)' : ''}
            </p>
            {failed ? (
                <p className="mt-1 text-xs text-muted-foreground">Shown when you are online.</p>
            ) : !result ? (
                <div className="mt-1.5 space-y-1.5" aria-hidden><div className="skeleton h-4 w-3/4" /><div className="skeleton h-4 w-1/2" /></div>
            ) : result.items.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
            ) : (
                <ol className="relative ml-1.5 mt-1.5 border-l border-border">
                    {result.items.map(it => (
                        <li key={it.key} className="relative flex min-h-[36px] items-start gap-3 py-1 pl-4">
                            <span aria-hidden className={cx('absolute -left-[5px] top-2.5 h-2.5 w-2.5 rounded-full border-2', result.preview ? 'border-border bg-muted' : 'border-primary bg-card')} />
                            <span className="w-[92px] shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatDay(it.date)}</span>
                            <span className="min-w-0 text-sm text-foreground">
                                <span className="font-semibold">{AUDIENCE_LABELS[it.audience]}</span>
                                <span className="text-muted-foreground">: {it.label.toLowerCase()}</span>
                                {(it.client || it.job) && <span className="block truncate text-xs text-muted-foreground">{[it.client, it.job].filter(Boolean).join(' · ')}</span>}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
};

/* ----------------------------------------------------------------------------------- one row */

interface RowProps {
    row: PostJobRow;
    settings: PostJobSettings | null;
    change: (fn: (s: PostJobSettings, now: number) => PostJobSettings) => void;
    paid: boolean;
    basics: ReminderBasics;
    hasSender: boolean;
    onUpgradeClick?: () => void;
    sample: SampleInfo;
}

const scheduleText = (kind: PostJobKind, s: PostJobSettings): string => {
    if (kind === 'warranty') return warrantyScheduleText(s);
    const steps = s[kind].offsets.map(o => postJobStepLabel(kind, o));
    return `Emails the client ${steps.length > 1 ? `${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}` : steps[0] ?? ''}.`;
};

const PostJobRowView: React.FC<RowProps> = ({ row, settings, change, paid, basics, hasSender, onUpgradeClick, sample }) => {
    const kind = row.binding.kind;
    const [open, setOpen] = useState(false);
    const on = !!settings && settings[kind].enabled && paid;
    const k = settings?.[kind];
    const paused = !basics.settings.enabled;
    const today = todayYMD();

    const toggle = (next: boolean) => {
        if (!paid) { onUpgradeClick?.(); return; }
        change((s, now) => setPostJobEnabled(s, kind, next, today, now));
    };

    return (
        <li className="relative py-3.5 pl-4">
            <span aria-hidden className={cx('absolute bottom-3.5 left-0 top-3.5 w-0.5 rounded-full', on ? 'bg-primary' : 'bg-border')} />
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{row.title}<PremiumTag /></p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground"><span className="text-foreground/85">{row.when}</span> {row.then}</p>
                </div>
                <Switch checked={on} onChange={toggle} label={`${row.title}: ${on ? 'on' : 'off'}`} disabled={paid && !settings} />
            </div>

            {!paid && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                    Automatic emails to your clients are part of Premium.{' '}
                    {onUpgradeClick && <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onUpgradeClick}>See Premium</button>}
                </p>
            )}

            {paid && settings && k && (
                <>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {on
                            ? <>On since {formatDay(k.since)}. {scheduleText(kind, settings)} {kind === 'warranty' ? 'Only emails dated from that day on are sent; steps already past are never sent.' : 'Only jobs completed on or after that day get emails.'}</>
                            : <>Off. Switch it on to start {kind === 'warranty' ? 'from today: steps already past are never sent' : 'with the next job you complete; older ones are never emailed'}.</>}
                    </p>
                    {on && paused && (
                        <p className="mt-1 text-xs text-warning">
                            Reminder emails are paused in Settings, so nothing goes out.{' '}
                            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => scrollTo('settings-reminders')}>Open Reminders</button>
                        </p>
                    )}
                    {on && !paused && !hasSender && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Needs your Gmail connected: nothing is sent until it is.{' '}
                            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => scrollTo('settings-reminders')}>Connect Gmail</button>
                        </p>
                    )}

                    <button
                        type="button"
                        className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                    >
                        {open ? 'Hide' : 'Days, wording and what is next'}
                        <span aria-hidden className={cx('transition-transform', open && 'rotate-180')}>▾</span>
                    </button>

                    {open && (
                        <div className="mt-1 space-y-4">
                            {kind === 'completion' && (
                                <>
                                    <DaysField
                                        id="pj-completion-days" label="Days after the job is completed" kind="completion" value={settings.completion.offsets}
                                        hint={`Whole days, ${POST_JOB_RULES.completion.min} to ${POST_JOB_RULES.completion.max}. Usually 3.`}
                                        onCommit={offs => change((s, now) => setPostJobOffsets(s, 'completion', offs, now))}
                                    />
                                    <div>
                                        <CheckRow checked={settings.completion.includeReview} onChange={v => change((s, now) => setCompletionReview(s, v, now))} label="Add my Google review link">
                                            Only when you have one and no review request already went out for that job.
                                        </CheckRow>
                                        <p className="ml-8 mt-0.5 text-xs">
                                            {sample.reviewLink
                                                ? <span className="text-success">Your review link is set.</span>
                                                : <span className="text-muted-foreground">No review link yet, so the email goes without one.</span>}{' '}
                                            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => scrollTo('settings-payments')}>Payments &amp; reviews</button>
                                        </p>
                                    </div>
                                </>
                            )}

                            {kind === 'warranty' && (
                                <>
                                    <DaysField
                                        id="pj-warranty-days" label="Email the client this many days before it ends" kind="warranty" value={settings.warranty.offsets}
                                        hint="0 is the day it ends. For example 60, 30, 7, 0."
                                        onCommit={offs => change((s, now) => setPostJobOffsets(s, 'warranty', offs, now))}
                                    />
                                    <div>
                                        <CheckRow checked={settings.warranty.notifyOwner} onChange={v => change((s, now) => setWarrantyOwner(s, { notifyOwner: v }, now))} label="Also email me a note">
                                            A short note to your own Gmail address with the number of open claims.
                                        </CheckRow>
                                        {settings.warranty.notifyOwner && (
                                            <div className="mt-2 sm:ml-8">
                                                <DaysField
                                                    id="pj-warranty-owner-days" label="Tell me this many days before" kind="warranty" value={settings.warranty.ownerOffsets}
                                                    hint="For example 30, 0."
                                                    onCommit={offs => change((s, now) => setWarrantyOwner(s, { ownerOffsets: offs }, now))}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">A void or lifetime warranty sends nothing. Turn one warranty off in its own form (Warranty emails).</p>
                                </>
                            )}

                            {kind === 'maintenance' && (
                                <>
                                    <DaysField
                                        id="pj-maintenance-days" label="Days after the job is completed" kind="maintenance" value={settings.maintenance.offsets}
                                        hint="For example 180, 365 (6 months and 1 year)."
                                        onCommit={offs => change((s, now) => setPostJobOffsets(s, 'maintenance', offs, now))}
                                    />
                                    <TipField value={settings.maintenance.tip} onCommit={tip => change((s, now) => setMaintenanceTip(s, tip, now))} />
                                </>
                            )}

                            <WordingEditor kind={kind} settings={settings} sample={sample} onSave={(key, t) => change((s, now) => setPostJobTemplate(s, key, t, now))} />

                            <NextScheduled kind={kind} settings={settings} basics={basics} />
                        </div>
                    )}
                </>
            )}
        </li>
    );
};

const TipField: React.FC<{ value: string; onCommit: (tip: string) => void }> = ({ value, onCommit }) => {
    const [text, setText] = useState(value);
    useEffect(() => { setText(value); }, [value]);
    return (
        <div>
            <label className="label" htmlFor="pj-tip">Your maintenance tip</label>
            <textarea
                id="pj-tip" rows={3} maxLength={POST_JOB_RULES.tipMax} className="input min-h-[72px] resize-y" value={text}
                onChange={e => setText(e.target.value)}
                onBlur={() => { if (text.trim() !== value.trim()) onCommit(text); }}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">One or two sentences. It goes into the email where it says {'{tip}'}.</p>
        </div>
    );
};

/* ----------------------------------------------------------------------------------- the rows */

interface Props {
    paid: boolean;
    basics: ReminderBasics;
    hasSender: boolean;
    onUpgradeClick?: () => void;
    /** the saved Google review link ('' when none), and the names used in the wording preview */
    reviewLink?: string;
    company?: string;
    myName?: string;
}

const PostJobRows: React.FC<Props> = ({ paid, basics, hasSender, onUpgradeClick, reviewLink = '', company = '', myName = '' }) => {
    const pj = usePostJobSettings();
    const sample = useMemo<SampleInfo>(() => ({ company, myName, reviewLink: reviewLink.trim() }), [company, myName, reviewLink]);
    const sync = pj.sync && pj.sync !== 'account' ? SYNC_TEXT[pj.sync] : null;
    return (
        <>
            {POST_JOB_ROWS.map(row => (
                <PostJobRowView key={row.id} row={row} settings={pj.settings} change={pj.change} paid={paid} basics={basics} hasSender={hasSender} onUpgradeClick={onUpgradeClick} sample={sample} />
            ))}
            {paid && sync && (
                <li className="list-none py-2 pl-4 text-xs text-muted-foreground" role="status">{sync}</li>
            )}
        </>
    );
};

export default PostJobRows;
