/**
 * Small shared pieces of the pipeline board: stage colours (light + dark), the stage track on each card, the alert
 * chip and money / age formatting. (The menu icon is in PipelineIcon.tsx, so the nav doesn't load any of this.)
 */
import React from 'react';
import { PIPELINE_STAGES, stageIndex, type PipelineAlert, type PipelineStage } from '../../lib/pipeline.ts';

/** Stage accents: a bar colour and a text colour, readable in light and dark themes. */
export const STAGE_STYLE: Record<PipelineStage, { bar: string; text: string }> = {
    request: { bar: 'bg-slate-400 dark:bg-slate-500', text: 'text-slate-600 dark:text-slate-300' },
    estimate: { bar: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
    approved: { bar: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
    in_progress: { bar: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-300' },
    invoiced: { bar: 'bg-primary', text: 'text-primary' },
    paid: { bar: 'bg-success', text: 'text-success' },
};

/** Six short ticks, filled up to the card's stage: where the job is on its way to Paid. */
export const StageTrack: React.FC<{ stage: PipelineStage; className?: string }> = ({ stage, className = '' }) => {
    const at = stageIndex(stage);
    return (
        <span className={`inline-flex shrink-0 items-center gap-[3px] ${className}`} aria-hidden>
            {PIPELINE_STAGES.map((s, i) => (
                <span key={s.id} className={`h-1 w-2.5 rounded-full ${i <= at ? STAGE_STYLE[stage].bar : 'bg-border'}`} />
            ))}
        </span>
    );
};

const ALERT_TONE: Record<PipelineAlert['tone'], string> = {
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-destructive/10 text-destructive',
    success: 'bg-success/10 text-success',
};

export const AlertChip: React.FC<{ alert: PipelineAlert; className?: string }> = ({ alert, className = '' }) => (
    <span className={`inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${ALERT_TONE[alert.tone]} ${className}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        <span className="truncate">{alert.label}</span>
    </span>
);

/** "$12,400" (no cents). */
export const wholeMoney = (v: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0);

/** "$12.4k" for column totals. */
export const shortMoney = (v: number): string => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 10_000) return `$${Math.round(v / 1000)}k`;
    if (abs >= 1_000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return wholeMoney(v);
};

/** "today", "1 day", "12 days" in this stage. */
export const ageText = (age: number | null): string => (age === null ? '' : age === 0 ? 'today' : `${age}d`);
