/**
 * "AI summary" slot of the Business overview (roadmap N3, AI part: a short monthly summary in plain words, Premium + AI,
 * an `ai-assistant` task). It renders NOTHING today; the later AI batch fills in this file only.
 *
 * Where it sits: BusinessOverview.tsx mounts it right under the headline and the figures line, so the summary reads as
 * the third sentence of the same story. Nothing else in the overview needs to change.
 *
 * What the AI batch gets (everything is already computed locally by lib/overview/*, so it must NOT recompute anything
 * and must send only these aggregates, never documents):
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
 *
 * Contract for the AI batch: render null while the plan is not Premium + AI, while offline, while there is no data in
 * the period, or while loading; show a clearly labelled "AI summary" block otherwise, with a way to regenerate it, and
 * count it against the AI allowance like the other AI actions (lib/aiCredits.ts).
 */
import React from 'react';
import type { AwaitingSummary } from '../../lib/overview/awaiting.ts';
import type { CustomerRevenueRow, JobProfitRow, LeadKpis, OverviewKpis } from '../../lib/overview/overview.ts';

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
}

/** Renders nothing yet (see the header). */
export const OverviewAiSlot: React.FC<OverviewAiSummaryProps> = () => null;

export default OverviewAiSlot;
