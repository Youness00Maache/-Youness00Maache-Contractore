/**
 * The setup assistant's two quiet entry points, both reading what SetupHost publishes (lib/setup/store.ts):
 *   variant "dashboard": one thin line above the job list, "Setup 4 of 7", with a progress rail. It is gone once setup is
 *     complete or the person hides it. Never a modal, never in the way.
 *   variant "settings": the Settings > Setup assistant section: where you are, Resume setup, Remove example data.
 */
import React, { useState } from 'react';
import { hasExample } from '../../lib/setup/example.ts';
import { requestHideSetup, requestOpenSetup, requestRemoveExample, useSetupSnapshot } from '../../lib/setup/store.ts';
import { shouldShowHint, stepDef } from '../../lib/setup/steps.ts';
import { XIcon } from '../viewKit.tsx';

type T = Record<string, string>;

/** Segmented rail: one segment per required step, filled when resolved. */
const Segments: React.FC<{ statuses: Array<'done' | 'skipped' | 'todo' | 'unknown'>; className?: string }> = ({ statuses, className = '' }) => (
    <span className={`flex gap-1 ${className}`} aria-hidden="true">
        {statuses.map((s, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${s === 'done' ? 'bg-primary' : s === 'skipped' ? 'border border-dashed border-muted-foreground/60' : s === 'unknown' ? 'bg-primary/30' : 'bg-border'}`} />
        ))}
    </span>
);

const SetupHint: React.FC<{ t: T; variant: 'dashboard' | 'settings' }> = ({ t, variant }) => {
    const snap = useSetupSnapshot();
    const [confirmRemove, setConfirmRemove] = useState(false);
    const progress = snap.progress;
    if (!snap.loaded || !progress) return null;
    const required = progress.steps.filter(s => s.required);
    const nextTitle = progress.firstOpen ? stepDef(progress.firstOpen).title : null;

    if (variant === 'dashboard') {
        if (!shouldShowHint(progress, snap.state)) return null;
        const hide = () => requestHideSetup();
        return (
            <section aria-label={t.setupLabel || 'Setup'} className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-bold tabular-nums text-foreground">{t.setupLabel || 'Setup'} {progress.resolved} {t.setupOf || 'of'} {progress.total}</span>
                        {nextTitle && <span className="truncate text-muted-foreground">next: {nextTitle}</span>}
                    </p>
                    <Segments className="mt-2 max-w-xs" statuses={required.map(s => s.status)} />
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" className="btn btn-primary h-11 flex-1 sm:flex-none" onClick={() => requestOpenSetup()}>{t.setupContinue || 'Continue'}</button>
                    <button type="button" className="btn btn-ghost h-11 w-11 shrink-0 p-0 text-muted-foreground" onClick={hide} aria-label={`${t.setupHide || 'Hide'} ${t.setupLabel || 'Setup'}`} title={t.setupHide || 'Hide'}><XIcon className="h-4 w-4" /></button>
                </div>
            </section>
        );
    }

    const complete = progress.complete;
    return (
        <section id="settings-setup" className="card scroll-mt-24 mb-6" aria-labelledby="settings-setup-title">
            <div className="border-b border-border px-4 py-4 sm:px-6">
                <h2 id="settings-setup-title" className="text-base font-semibold">Setup assistant</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">A short checklist for your business details, tax and terms, price book and payment links.</p>
            </div>
            <div className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                        {complete ? 'Your setup is complete.' : `${t.setupLabel || 'Setup'} ${progress.resolved} ${t.setupOf || 'of'} ${progress.total}${nextTitle ? `, next: ${nextTitle}` : ''}`}
                    </p>
                    <Segments className="mt-2 max-w-sm" statuses={required.map(s => s.status)} />
                    {snap.state.dismissed && !complete && <p className="mt-1.5 text-xs text-muted-foreground">The dashboard reminder is hidden. Resume brings it back.</p>}
                </div>
                <button type="button" className="btn btn-primary h-11 sm:shrink-0" onClick={() => requestOpenSetup()}>{complete ? 'Review setup' : t.setupResume || 'Resume setup'}</button>
            </div>
            {hasExample(snap.example) && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
                    <p className="min-w-0 flex-1 text-muted-foreground">An example project (sample client, job and draft estimate) is in your account.</p>
                    {confirmRemove ? (
                        <span className="flex items-center gap-2">
                            <button type="button" className="btn btn-danger h-10" onClick={() => { setConfirmRemove(false); requestRemoveExample(); }}>Yes, remove it</button>
                            <button type="button" className="btn btn-ghost h-10" onClick={() => setConfirmRemove(false)}>Keep it</button>
                        </span>
                    ) : (
                        <button type="button" className="btn btn-outline h-10" onClick={() => setConfirmRemove(true)}>Remove example data</button>
                    )}
                </div>
            )}
            </div>
        </section>
    );
};

export default SetupHint;
