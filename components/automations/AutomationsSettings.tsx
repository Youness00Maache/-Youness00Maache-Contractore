/**
 * Settings > Automations (id settings-automations): one list of rules, grouped Money / Jobs / Leads & clients / Stock &
 * supplies. Each row has a real switch and a one-line "when ..., then ..." sentence; a rule that can either tell you or
 * make a draft has a two-way choice ("Just tell me" / "Do it for me", the second one Premium).
 *
 *   NEW rules          saved in the account (lib/automations/store.ts, user_settings 'automations.prefs'), every device
 *   EXISTING features  the switch is bound to the setting the feature already has: the bell types (Settings >
 *                      Notifications, 'notifications.prefs') or the reminder emails (Settings > Reminders): turning one
 *                      off here is the same as turning it off there, and nothing else about it changes
 *   ALWAYS ON          core behaviours with no setting, as plain text
 * A rule whose tool is not in the database yet (tasks, leads, client questions) is not listed.
 *
 *   <AutomationsSettings plan={plan} onUpgradeClick={onUpgradeClick} />
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import HelpButton from '../help/HelpButton.tsx';
import { cx, Switch } from '../reminders/ui.tsx';
import { automationStore } from '../../lib/automations/store.ts';
import {
    ALWAYS_ON, BOUND_ROWS, GROUPS, RULES, isPaid, resolveRule, ruleAvailable, setRuleDays, setRuleMode, setRuleOn,
    type BoundRow, type RuleDef, type RuleGroup, type RuleMode,
} from '../../lib/automations/rules.ts';
import { notificationStore } from '../../lib/notifications/store.ts';
import { isCategoryOn, setCategory } from '../../lib/notifications/model.ts';
import { browserTimezone, loadReminderBasics, REMINDER_SETTINGS_CHANGED, RemindersUnavailableError, saveReminderSettings, type ReminderBasics, type ReminderSettings } from '../../lib/reminders.ts';
import { useTasksFeature } from '../../lib/tasks/taskFeature.ts';
import { useLeadsFeature } from '../../lib/leads/leadsFeature.ts';
import { useQuestionsFeature } from '../../lib/questions/questionsApi.ts';
import { isOffline, isOfflineFailure, readListCopy } from '../../lib/offline/deviceCache.ts';
import { errorText } from '../../lib/offline/connection.ts';

// ---------------------------------------------------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------------------------------------------------
const PremiumTag: React.FC = () => (
    <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-primary">Premium</span>
);

/** Two or three exclusive choices as one pill (phone friendly: 40px tall targets). */
const Segmented: React.FC<{
    label: string;
    value: string;
    options: ReadonlyArray<{ value: string; text: React.ReactNode }>;
    onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
    <div role="radiogroup" aria-label={label} className="mt-2.5 inline-flex max-w-full rounded-xl bg-muted p-0.5">
        {options.map(o => (
            <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={o.value === value}
                onClick={() => onChange(o.value)}
                className={cx(
                    'min-h-[36px] whitespace-nowrap rounded-[10px] px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    o.value === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
            >
                {o.text}
            </button>
        ))}
    </div>
);

/** "When X, then Y": the trigger in the stronger colour, so the line reads at a glance. */
const Sentence: React.FC<{ when: string; then: string }> = ({ when, then }) => (
    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground"><span className="text-foreground/85">{when}</span> {then}</p>
);

const RowShell: React.FC<{ on: boolean; title: string; sentence: React.ReactNode; control: React.ReactNode; children?: React.ReactNode }> = ({ on, title, sentence, control, children }) => (
    <li className="relative py-3.5 pl-4">
        <span aria-hidden className={cx('absolute bottom-3.5 left-0 top-3.5 w-0.5 rounded-full', on ? 'bg-primary' : 'bg-border')} />
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                {sentence}
            </div>
            {control}
        </div>
        {children}
    </li>
);

const scrollToReminders = () => document.getElementById('settings-reminders')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ---------------------------------------------------------------------------------------------------------------------
// Reminder emails (existing setting: public.reminder_settings, saved by the Reminders card too)
// ---------------------------------------------------------------------------------------------------------------------
type RemindersState =
    | { status: 'loading' }
    | { status: 'unavailable' }
    | { status: 'error'; message: string }
    | { status: 'ready'; basics: ReminderBasics };

function useReminderSwitches() {
    const [state, setState] = useState<RemindersState>({ status: 'loading' });
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const savingRef = useRef(false);

    const load = useCallback(async () => {
        try {
            setState({ status: 'ready', basics: await loadReminderBasics(true) });
        } catch (e) {
            if (e instanceof RemindersUnavailableError) { setState({ status: 'unavailable' }); return; }
            if (isOfflineFailure(e)) {
                const kept = (await readListCopy<ReminderBasics>('reminder_basics'))?.rows?.[0];
                if (kept) { setState({ status: 'ready', basics: kept }); return; }
            }
            setState({ status: 'error', message: errorText(e, 'Could not load the reminder switches.') });
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    // the Reminders card (same page) saved the same settings: read them again
    useEffect(() => {
        const onChanged = () => { if (!savingRef.current) void load(); };
        window.addEventListener(REMINDER_SETTINGS_CHANGED, onChanged);
        return () => window.removeEventListener(REMINDER_SETTINGS_CHANGED, onChanged);
    }, [load]);

    const toggle = async (kind: 'invoice' | 'estimate' | 'visit', on: boolean) => {
        if (state.status !== 'ready') return;
        const b = state.basics;
        // same as the Reminders card: a user who never saved gets this device's time zone with their first save
        const base: ReminderSettings = b.saved ? b.settings : { ...b.settings, timezone: browserTimezone() };
        const next: ReminderSettings = { ...base, ...(on ? { enabled: true } : {}), [kind]: { ...base[kind], enabled: on } };
        setBusy(kind); setError(null);
        savingRef.current = true;
        setState({ status: 'ready', basics: { ...b, settings: next } });
        try {
            const saved = await saveReminderSettings(next);
            setState({ status: 'ready', basics: { ...b, settings: saved, saved: true } });
        } catch (e) {
            setState({ status: 'ready', basics: b });
            setError(errorText(e, 'Could not save. Your reminder settings are unchanged.'));
        } finally {
            savingRef.current = false;
            setBusy(null);
        }
    };
    return { state, busy, error, toggle, reload: load, offline: isOffline() };
}

// ---------------------------------------------------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------------------------------------------------
interface Props {
    plan: string | null | undefined;
    onUpgradeClick?: () => void;
}

const AutomationsSettings: React.FC<Props> = ({ plan, onUpgradeClick }) => {
    const auto = useSyncExternalStore(automationStore.subscribe, automationStore.getSnapshot, automationStore.getSnapshot);
    const bell = useSyncExternalStore(notificationStore.subscribe, notificationStore.getSnapshot, notificationStore.getSnapshot);
    const uid = auto.uid || bell.uid;
    const ready = Boolean(auto.uid);
    const paid = isPaid(plan);
    const tasks = useTasksFeature(uid, true);
    const leads = useLeadsFeature(uid, true);
    const questions = useQuestionsFeature(uid, true);
    const tools = { tasks, leads, questions };
    const rem = useReminderSwitches();
    const hasSender = rem.state.status === 'ready' && rem.state.basics.senders.length > 0;

    const visibleRules = (group: RuleGroup) => RULES.filter(r => r.group === group && ruleAvailable(r, tools));
    const visibleBound = (group: RuleGroup) => BOUND_ROWS.filter(r => r.group === group && !(r.binding.type === 'reminder' && rem.state.status !== 'ready'));

    const chooseMode = (def: RuleDef, mode: RuleMode) => {
        if (mode === 'draft' && !paid) { onUpgradeClick?.(); return; }
        automationStore.updatePrefs(p => setRuleMode(p, def.id, mode, Date.now()));
    };

    const ruleRow = (def: RuleDef) => {
        const r = resolveRule(def.id, auto.prefs, plan);
        const days = def.dayChoices ? `${def.when} ${r.days} days,` : def.when;
        const choice = def.modes.length > 1;
        return (
            <RowShell
                key={def.id}
                on={r.on}
                title={def.title}
                sentence={<Sentence when={days} then={def.then[r.mode]} />}
                control={<Switch checked={r.on} onChange={on => automationStore.updatePrefs(p => setRuleOn(p, def.id, on, Date.now()))} label={`${def.title}: ${r.on ? 'on' : 'off'}`} disabled={!ready} />}
            >
                {r.on && choice && (
                    <>
                        <Segmented
                            label={`${def.title}: what should happen`}
                            value={r.mode}
                            onChange={v => chooseMode(def, v as RuleMode)}
                            options={[
                                { value: 'notify', text: 'Just tell me' },
                                { value: 'draft', text: <>Do it for me{!paid && <PremiumTag />}</> },
                            ]}
                        />
                        {r.mode === 'draft' && (
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                Makes a draft only: you check it and send it yourself. It starts with the next one, not with ones already done.
                            </p>
                        )}
                        {r.chosenMode === 'draft' && r.mode !== 'draft' && !paid && (
                            <p className="mt-1.5 text-xs text-muted-foreground">Drafts need Premium, so this only tells you for now.</p>
                        )}
                    </>
                )}
                {r.on && def.dayChoices && (
                    <Segmented
                        label={`${def.title}: how many days`}
                        value={String(r.days)}
                        onChange={v => automationStore.updatePrefs(p => setRuleDays(p, def.id, Number(v), Date.now()))}
                        options={def.dayChoices.map(d => ({ value: String(d), text: `${d} days` }))}
                    />
                )}
            </RowShell>
        );
    };

    const boundRow = (row: BoundRow) => {
        const b = row.binding;
        if (b.type === 'bell') {
            const on = isCategoryOn(bell.prefs, b.category);
            return (
                <RowShell
                    key={row.id}
                    on={on}
                    title={row.title}
                    sentence={<Sentence when={row.when} then={row.then} />}
                    control={<Switch checked={on} onChange={v => notificationStore.setPrefs(setCategory(bell.prefs, b.category, v, Date.now()))} label={`${row.title}: ${on ? 'on' : 'off'}`} disabled={!bell.uid} />}
                />
            );
        }
        const settings = rem.state.status === 'ready' ? rem.state.basics.settings : null;
        const on = !!settings && settings.enabled && settings[b.kind].enabled;
        return (
            <RowShell
                key={row.id}
                on={on}
                title={row.title}
                sentence={<Sentence when={row.when} then={row.then} />}
                control={<Switch checked={on} onChange={v => { void rem.toggle(b.kind, v); }} label={`${row.title}: ${on ? 'on' : 'off'}`} busy={rem.busy === b.kind} disabled={!settings} />}
            >
                {on && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        {hasSender ? 'Sent from your Gmail.' : 'Needs your Gmail connected: nothing is sent until it is.'}{' '}
                        <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={scrollToReminders}>Days and wording</button>
                    </p>
                )}
            </RowShell>
        );
    };

    return (
        <section id="settings-automations" className="card scroll-mt-24" aria-labelledby="settings-automations-title">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                <div className="min-w-0">
                    <h2 id="settings-automations-title" className="text-base font-semibold">Automations</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Rules that follow up for you. A rule tells you, or makes a draft and tells you. It never sends, signs or bills anything on its own.
                    </p>
                </div>
                <HelpButton topic="automations" iconOnly />
            </div>

            <div className="p-4 sm:p-6">
                {rem.state.status === 'error' && (
                    <div className="mb-4 flex flex-col gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between" role="alert">
                        <span>{rem.state.message}</span>
                        <button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={() => { void rem.reload(); }}>Retry</button>
                    </div>
                )}
                {rem.error && <p className="mb-3 text-sm text-destructive" role="alert">{rem.error}</p>}

                {GROUPS.map((g, i) => {
                    const rules = visibleRules(g.id);
                    const bound = visibleBound(g.id);
                    const always = ALWAYS_ON.filter(a => a.group === g.id);
                    if (!rules.length && !bound.length && !always.length) return null;
                    return (
                        <div key={g.id} className={i === 0 ? '' : 'mt-7'}>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
                            <ul className="mt-1 divide-y divide-border">
                                {rules.map(ruleRow)}
                                {bound.map(boundRow)}
                                {always.map(a => (
                                    <li key={a.id} className="flex items-start gap-3 py-3 pl-4">
                                        <span className="mt-px w-[68px] shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-success">Always on</span>
                                        <p className="text-[13px] leading-snug text-muted-foreground">{a.text}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}

                <p className="mt-6 text-xs text-muted-foreground">
                    Your choices follow your account to every device. Notes from these rules appear in the bell (Settings, Notifications, Automation rules switches them all off at once).
                    {!paid && onUpgradeClick && (
                        <> Drafts made for you are part of Premium. <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onUpgradeClick}>See Premium</button>.</>
                    )}
                </p>
            </div>
        </section>
    );
};

export default AutomationsSettings;
