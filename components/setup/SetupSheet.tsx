/**
 * The setup assistant (roadmap N8): a dismissible sheet, never a forced screen. A progress rail on the left (on a
 * phone: a segmented bar on top with an "All steps" list) and one step at a time. Every step saves on its own, so
 * closing the sheet at any point loses nothing and Resume opens where the person left off.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon } from '../Icons.tsx';
import { screenAfter, screenBefore, type SetupProgress, type SetupStepId, type WizardScreen } from '../../lib/setup/steps.ts';
import { dismissSetup, rememberStep, setTrades, skipStep, type SetupState } from '../../lib/setup/state.ts';
import type { ExampleTracking } from '../../lib/setup/example.ts';
import type { UserProfile } from '../../types.ts';
import type { SetupCtx } from './ctx.ts';
import { BusinessStep, ContactStep, GetPaidStep, MoneyStep, TradeStep } from './SetupSteps.tsx';
import { FinishStep, LookStep, PricebookStep, TeamStep } from './SetupStepsMore.tsx';

export interface SetupSheetProps {
    userId: string;
    profile: UserProfile;
    plan: string;
    isOnline: boolean;
    progress: SetupProgress;
    state: SetupState;
    example: ExampleTracking;
    t: Record<string, string>;
    start: WizardScreen;
    updateState: (change: (s: SetupState) => SetupState) => void;
    saveProfile: SetupCtx['saveProfile'];
    patchProfile: SetupCtx['patchProfile'];
    refresh: () => Promise<void>;
    upgrade: (reason?: string) => void;
    navigate: (path: string) => void;
    addExample: () => Promise<string>;
    removeExample: () => Promise<string>;
    onClose: () => void;
}

type RailItem = { id: WizardScreen; title: string; status: 'done' | 'skipped' | 'todo' | 'unknown'; note?: string };

const Dot: React.FC<{ n: number; status: RailItem['status']; current: boolean }> = ({ n, status, current }) => (
    <span aria-hidden="true" className={`absolute left-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold
        ${status === 'done' ? 'bg-primary text-primary-foreground' : status === 'skipped' ? 'border-2 border-dashed border-muted-foreground/60 bg-card text-muted-foreground' : 'border-2 border-border bg-card text-muted-foreground'}
        ${current ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : ''}`}>
        {status === 'done' ? <CheckIcon className="h-3.5 w-3.5" /> : n}
    </span>
);

/** The progress rail: a real vertical line that fills as steps are done. */
const Rail: React.FC<{ items: RailItem[]; current: WizardScreen; onGo: (s: WizardScreen) => void }> = ({ items, current, onGo }) => (
    <ol className="relative">
        {items.map((it, i) => (
            <li key={it.id} className="relative pl-10">
                {i < items.length - 1 && <span aria-hidden="true" className={`absolute left-[11px] top-1/2 h-full w-0.5 ${it.status === 'done' ? 'bg-primary' : 'bg-border'}`} />}
                <Dot n={i + 1} status={it.status} current={it.id === current} />
                <button type="button" onClick={() => onGo(it.id)} aria-current={it.id === current ? 'step' : undefined}
                    className={`relative flex min-h-[52px] w-full flex-col justify-center rounded-lg px-2 text-left transition hover:bg-muted/70 ${it.id === current ? 'bg-muted' : ''}`}>
                    <span className={`text-sm leading-tight ${it.id === current ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>{it.title}</span>
                    <span className="text-xs text-muted-foreground">{it.note || (it.status === 'done' ? 'Done' : it.status === 'skipped' ? 'Skipped' : it.status === 'unknown' ? 'Not checked' : 'To do')}</span>
                </button>
            </li>
        ))}
    </ol>
);

const SetupSheet: React.FC<SetupSheetProps> = (props) => {
    const { progress, state, t } = props;
    const [screen, setScreen] = useState<WizardScreen>(props.start);
    const [listOpen, setListOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef(props.onClose);
    closeRef.current = props.onClose;

    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]:not([data-setup-sheet])')) { e.stopPropagation(); closeRef.current(); } };
        document.addEventListener('keydown', onKey);
        const timer = window.setTimeout(() => panelRef.current?.focus(), 30);
        return () => { window.clearTimeout(timer); document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
    }, []);

    const items: RailItem[] = useMemo(() => [
        ...progress.steps.map(s => ({
            id: s.id as WizardScreen, title: s.title, status: s.status,
            note: s.id === 'business' && s.status === 'skipped' && (props.profile.companyName || '').trim() ? 'Name saved, no logo' : undefined,
        })),
        { id: 'finish' as WizardScreen, title: t.setupDone || 'All set', status: progress.complete ? 'done' as const : 'todo' as const },
    ], [progress, t.setupDone, props.profile.companyName]);

    // a step that stopped applying (plan changed) falls back to the summary
    const valid = screen === 'finish' || progress.steps.some(s => s.id === screen);
    const current: WizardScreen = valid ? screen : 'finish';

    const go = (s: WizardScreen) => {
        setScreen(s);
        setListOpen(false);
        props.updateState(st => rememberStep(st, s === 'finish' ? null : s));
    };
    const next = () => go(screenAfter(progress, current));
    const before = screenBefore(progress, current);
    const skip = () => {
        if (current === 'finish') return;
        const id = current as SetupStepId;
        props.updateState(st => skipStep(st, id));
        setScreen(screenAfter(progress, current));
    };

    const ctx: SetupCtx = {
        userId: props.userId, profile: props.profile, plan: props.plan, isOnline: props.isOnline, progress, state, example: props.example, t,
        saveProfile: props.saveProfile, patchProfile: props.patchProfile, refresh: props.refresh,
        setTrades: (ids) => props.updateState(st => setTrades(st, ids)),
        next, back: before ? () => go(before) : null, skip, go,
        markSkipped: (id) => props.updateState(st => skipStep(st, id)),
        upgrade: props.upgrade, navigate: props.navigate, close: props.onClose,
        addExample: props.addExample, removeExample: props.removeExample,
    };

    const index = items.findIndex(i => i.id === current);
    const label = current === 'finish' ? (t.setupDone || 'All set') : items[index]?.title;

    const body = (() => {
        switch (current) {
            case 'business': return <BusinessStep ctx={ctx} />;
            case 'contact': return <ContactStep ctx={ctx} />;
            case 'money': return <MoneyStep ctx={ctx} />;
            case 'trade': return <TradeStep ctx={ctx} />;
            case 'pricebook': return <PricebookStep ctx={ctx} />;
            case 'look': return <LookStep ctx={ctx} />;
            case 'getpaid': return <GetPaidStep ctx={ctx} />;
            case 'team': return <TeamStep ctx={ctx} />;
            default: return <FinishStep ctx={ctx} />;
        }
    })();

    const hide = () => { props.updateState(st => dismissSetup(st)); props.onClose(); };

    return createPortal(
        <div className="modal-backdrop">
            <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="setup-title" data-setup-sheet tabIndex={-1}
                className="modal-panel flex h-[min(46rem,94dvh)] flex-col overflow-hidden p-0 outline-none sm:max-w-4xl sm:h-[min(42rem,90vh)] md:flex-row">
                {/* desktop rail */}
                <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/30 p-5 md:flex">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.setupLabel || 'Setup'}</p>
                    <p className="mt-1 text-sm font-bold text-foreground tabular-nums">{progress.resolved} {t.setupOf || 'of'} {progress.total}</p>
                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1"><Rail items={items} current={current} onGo={go} /></div>
                    <button type="button" onClick={hide} className="mt-3 self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Do not remind me again</button>
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 sm:px-8">
                        <div className="min-w-0">
                            <h1 id="setup-title" className="truncate text-sm font-bold text-foreground">{t.setupTitle || 'Set up your business'}</h1>
                            <p className="text-xs text-muted-foreground">About 3 minutes. Saved as you go.</p>
                        </div>
                        <button type="button" onClick={props.onClose} className="btn btn-ghost h-10 shrink-0 px-3 text-xs">{t.setupSkipForNow || 'Skip for now'}</button>
                    </header>
                    {!props.isOnline && (
                        <p role="status" className="border-b border-border bg-warning/10 px-5 py-2 text-xs text-foreground sm:px-8">
                            You are offline. Everything here is kept on this device and added to your account later. Adding a worker or the example project needs a connection.
                        </p>
                    )}

                    {/* phone: segmented bar + "All steps" */}
                    <div className="border-b border-border px-5 pb-2 pt-3 md:hidden">
                        <div className="flex gap-1" role="group" aria-label="Setup progress">
                            {items.map((it, i) => (
                                <button key={it.id} type="button" onClick={() => go(it.id)} aria-label={`${it.title}: ${it.status}`} aria-current={it.id === current ? 'step' : undefined}
                                    className="group flex h-8 flex-1 items-center">
                                    <span className={`block w-full rounded-full transition-all ${it.id === current ? 'h-2.5' : 'h-1.5'} ${it.status === 'done' ? 'bg-primary' : it.status === 'skipped' ? 'border border-dashed border-muted-foreground/60' : it.id === current ? 'bg-primary/40' : 'bg-border'}`} data-i={i} />
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between gap-3 pb-1">
                            <p className="min-w-0 truncate text-xs text-muted-foreground">
                                {current === 'finish' ? label : <><span className="font-semibold tabular-nums text-foreground">{index + 1}/{progress.steps.length}</span> · {label}</>}
                            </p>
                            <button type="button" className="h-9 shrink-0 text-xs font-semibold text-primary" aria-expanded={listOpen} onClick={() => setListOpen(o => !o)}>{listOpen ? 'Close list' : (t.setupAllSteps || 'All steps')}</button>
                        </div>
                    </div>

                    {listOpen ? (
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:hidden">
                            <Rail items={items} current={current} onGo={go} />
                            <button type="button" onClick={hide} className="mt-4 text-xs font-medium text-muted-foreground underline underline-offset-2">Do not remind me again</button>
                        </div>
                    ) : null}
                    <div className={`${listOpen ? 'hidden md:flex' : 'flex'} min-h-0 flex-1 flex-col`}>{body}</div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default SetupSheet;
