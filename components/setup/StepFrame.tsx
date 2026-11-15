import React from 'react';
import { stepDef, type SetupStepId } from '../../lib/setup/steps.ts';
import type { SetupCtx } from './ctx.ts';
import { CheckIcon } from '../Icons.tsx';

/** A labelled field, phone-first (16px text so phones do not zoom in). */
export const SField: React.FC<{ label: string; htmlFor: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, htmlFor, hint, children }) => (
    <div>
        <label htmlFor={htmlFor} className="label">{label}</label>
        {children}
        {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
);

export const inputCls = 'input h-12 text-base sm:text-sm';

/**
 * One step screen: heading, the fields, and one footer (Back, Skip this step, Save and continue). The sheet shows one
 * of these at a time; a step that is already set up says so and can simply be continued.
 */
export const StepFrame: React.FC<{
    ctx: SetupCtx;
    id: SetupStepId;
    busy?: boolean;
    error?: string | null;
    notice?: string | null;
    onPrimary: () => void | Promise<void>;
    primaryLabel?: string;
    primaryDisabled?: boolean;
    /** hide "Skip this step" (the summary screen) */
    noSkip?: boolean;
    children: React.ReactNode;
}> = ({ ctx, id, busy = false, error, notice, onPrimary, primaryLabel, primaryDisabled, noSkip, children }) => {
    const def = stepDef(id);
    const index = ctx.progress.steps.findIndex(s => s.id === id);
    const status = ctx.progress.steps[index]?.status;
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    Step {index + 1} of {ctx.progress.steps.length}
                    {status === 'done' && <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 normal-case tracking-normal text-success"><CheckIcon className="h-3 w-3" /> Already set up</span>}
                    {status === 'skipped' && <span className="rounded-full bg-muted px-2 py-0.5 normal-case tracking-normal text-muted-foreground">Skipped earlier</span>}
                </p>
                <h2 className="mt-1.5 text-xl font-bold leading-tight text-foreground sm:text-2xl">{def.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{def.blurb}</p>
                <div className="mt-5 space-y-5">{children}</div>
                {notice && <p role="status" className="mt-4 rounded-xl bg-muted px-3 py-2 text-sm text-foreground">{notice}</p>}
                {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border bg-card px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:px-8">
                {ctx.back && <button type="button" className="btn btn-ghost h-11" onClick={ctx.back} disabled={busy}>{ctx.t.setupBack || 'Back'}</button>}
                <span className="hidden flex-1 sm:block" />
                {!noSkip && <button type="button" className="btn btn-ghost h-11 text-muted-foreground" onClick={ctx.skip} disabled={busy}>{ctx.t.setupSkipStep || 'Skip this step'}</button>}
                <button type="button" className="btn btn-primary h-12 sm:h-11 sm:min-w-[11rem]" onClick={() => void onPrimary()} disabled={busy || primaryDisabled}>
                    {busy ? 'Saving…' : primaryLabel || ctx.t.setupSave || 'Save and continue'}
                </button>
            </div>
        </div>
    );
};
