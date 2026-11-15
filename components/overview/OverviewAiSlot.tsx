/**
 * "AI summary" slot of the Business overview (roadmap N3 AI part + N7): a short summary of the period in plain words,
 * Premium + AI, the ai-assistant task `business_summary` (src/ai/businessSummary.ts). One AI request per click; nothing
 * is saved.
 *
 * Where it sits: BusinessOverview.tsx mounts it right under the headline and the figures line, so the summary reads as
 * the third sentence of the same story.
 *
 * What it gets (everything is already computed locally by lib/overview/*; it does NOT recompute anything and sends only
 * these aggregates, never documents):
 *   periodLabel / startYMD / endYMD   the period on screen ("March", 2026-03-01 .. 2026-03-31; null range = invalid dates)
 *   headline                          the sentence shown above ("March: $24.1k billed, ...")
 *   kpis                              billed, collected, outstanding, overdue, costs, profit, average days to get paid
 *   leads                             new leads / win rate, or null when the Leads tool is off or a filter is on
 *   activeJobs                        how many jobs are Active
 *   topJobs / bottomJobs              the ranked jobs (revenue, cost, profit, margin) shown on screen
 *   awaiting                          estimates waiting for an answer (count, total, oldest first)
 *   customers                         revenue by customer (top of the list)
 *   customerFilter / projectFilter    the filters in words ('' = all)
 *   isOnline                          false while offline: the AI cannot be asked then
 *   onOpenJob                         optional: opens a job an action is about
 *
 * Plans: Premium + AI sees "Summarize with AI"; Free and Premium see one quiet line with the usual upgrade prompt.
 * Nothing renders while offline (unless a summary is already showing) or when the period has no numbers.
 * Design (owner rule: compact, no icon-card grids): a margin note under the figures, a left rule, a small-caps label,
 * bullets marked by a short coloured tick (good / attention / money), actions as plain text links.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AwaitingSummary } from '../../lib/overview/awaiting.ts';
import type { CustomerRevenueRow, JobProfitRow, LeadKpis, OverviewKpis } from '../../lib/overview/overview.ts';
import { designPlan } from '../../lib/designPlan.ts';
import { dispatchUpgradeEvent, isAiLimitCode } from '../../src/ai/events.ts';
import { hasSummaryData, runBusinessSummary } from '../../src/ai/businessSummary.ts';
import {
    BUSINESS_SUMMARY_TIER, BUSINESS_SUMMARY_UPGRADE_MESSAGE, type BusinessSummary, type SummaryBulletKind,
} from '../../supabase/functions/ai-assistant/shared/businessSummary.ts';
import { todayYMD } from '../../utils/localDates.ts';

export interface OverviewAiSummaryProps {
    periodLabel: string;
    startYMD: string | null;
    endYMD: string | null;
    headline: string;
    kpis: OverviewKpis;
    leads: LeadKpis | null;
    activeJobs: number;
    topJobs: readonly JobProfitRow[];
    bottomJobs: readonly JobProfitRow[];
    awaiting: AwaitingSummary;
    customers: readonly CustomerRevenueRow[];
    customerFilter: string;
    projectFilter: string;
    isOnline: boolean;
    onOpenJob?: (jobId: string) => void;
}

type State =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; summary: BusinessSummary; key: string }
    | { status: 'error'; message: string; upgrade: boolean };

const TICK: Record<SummaryBulletKind, { cls: string; word: string }> = {
    good: { cls: 'bg-success', word: 'Went well' },
    attention: { cls: 'bg-destructive', word: 'Needs attention' },
    money: { cls: 'bg-warning', word: 'Money waiting' },
};

export const OverviewAiSlot: React.FC<OverviewAiSummaryProps> = (props) => {
    const { isOnline, periodLabel, startYMD, endYMD, customerFilter, projectFilter, onOpenJob } = props;
    const [state, setState] = useState<State>({ status: 'idle' });
    const abortRef = useRef<AbortController | null>(null);
    const allowed = designPlan() === BUSINESS_SUMMARY_TIER;
    const hasData = hasSummaryData(props);
    // the summary belongs to the period + filters it was made for
    const key = `${startYMD}|${endYMD}|${customerFilter}|${projectFilter}`;

    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => {
        abortRef.current?.abort();
        setState(s => (s.status === 'idle' || (s.status === 'done' && s.key === key) ? s : { status: 'idle' }));
    }, [key]);

    const run = useCallback(async () => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setState({ status: 'loading' });
        try {
            const summary = await runBusinessSummary(props, { today: todayYMD(), language: typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : undefined }, ctrl.signal);
            if (ctrl.signal.aborted) return;
            setState({ status: 'done', summary, key });
        } catch (e) {
            if (ctrl.signal.aborted) return;
            const code = String((e as { code?: string })?.code || '');
            const message = e instanceof Error ? e.message : '';
            const upgrade = code === 'PLAN_REQUIRED' || isAiLimitCode(code);
            if (upgrade) dispatchUpgradeEvent(message || BUSINESS_SUMMARY_UPGRADE_MESSAGE);
            setState({ status: 'error', upgrade, message: upgrade ? message : code === 'OFFLINE' ? message : 'The AI summary is not available right now.' });
        } finally {
            if (abortRef.current === ctrl) abortRef.current = null;
        }
    }, [props, key]);

    if (!hasData) return null;
    if (!allowed) {
        return (
            <p className="mt-3 text-xs text-muted-foreground">
                A plain-words summary of {periodLabel || 'this period'} with what to do next: Premium + AI.{' '}
                <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => dispatchUpgradeEvent(BUSINESS_SUMMARY_UPGRADE_MESSAGE)}>Upgrade</button>
            </p>
        );
    }
    if (!isOnline && state.status !== 'done') return null;

    if (state.status === 'idle' || state.status === 'loading') {
        return (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void run()} disabled={state.status === 'loading'} aria-busy={state.status === 'loading'}>
                    {state.status === 'loading' ? 'Reading your numbers…' : 'Summarize with AI'}
                </button>
                <span className="text-[11px] text-muted-foreground">{state.status === 'loading' ? 'About 10 seconds.' : `${periodLabel || 'This period'} in plain words. Uses 1 AI request.`}</span>
            </div>
        );
    }

    if (state.status === 'error') {
        return (
            <p className="mt-3 text-xs text-muted-foreground" role="alert">
                <span className={state.upgrade ? '' : 'text-destructive'}>{state.message}</span>{' '}
                {!state.upgrade && isOnline && <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => void run()}>Try again</button>}
            </p>
        );
    }

    const { summary } = state;
    return (
        <aside className="mt-4 border-l-2 border-primary/60 pl-3 sm:pl-4" aria-label="AI summary">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">AI summary · {periodLabel}</span>
                <button type="button" className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50" onClick={() => void run()} disabled={!isOnline}>
                    Summarize again
                </button>
            </div>
            <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{summary.headline}</p>
            <ul className="mt-2 space-y-1.5">
                {summary.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-snug text-foreground/90">
                        <span className={`mt-[7px] h-[3px] w-3 shrink-0 rounded-full ${TICK[b.kind].cls}`} aria-hidden="true" />
                        <span><span className="sr-only">{TICK[b.kind].word}: </span>{b.text}</span>
                    </li>
                ))}
            </ul>
            {summary.actions.length > 0 && (
                <div className="mt-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Next</span>
                    <ol className="mt-1 space-y-1 text-sm">
                        {summary.actions.map((a, i) => (
                            <li key={i} className="flex gap-2 leading-snug">
                                <span className="w-3 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                                {a.job_id && onOpenJob
                                    ? <button type="button" className="text-left text-primary underline-offset-2 hover:underline" onClick={() => onOpenJob(a.job_id!)}>{a.text}</button>
                                    : <span className="text-foreground/90">{a.text}</span>}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">Written by AI from the figures above. Check before acting.</p>
        </aside>
    );
};

export default OverviewAiSlot;
