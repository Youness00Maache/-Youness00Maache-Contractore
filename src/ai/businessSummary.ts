/**
 * "Summarize with AI" on the Business overview (roadmap N3 AI slot, Premium + AI): the browser side of the ai-assistant
 * task 'business_summary' (supabase/functions/ai-assistant/shared/businessSummary.ts). The overview's aggregates for the
 * period on screen go in (computed by lib/overview/*, nothing recomputed, never documents); a headline, 3-5 bullets and
 * up to 3 suggested next actions come back. Read-only: nothing is saved.
 *
 *   const summary = await runBusinessSummary(props, { today, language }, signal);
 *   errors: BusinessSummaryError with code PLAN_REQUIRED (not Premium + AI) / PLAN_LIMIT / CREDITS_EMPTY / AI_BUSY /
 *           AI_BAD_OUTPUT / NO_DATA â€¦, message ready to show (offline: OFFLINE).
 */
import { supabase } from '../../lib/supabase.ts';
import { NEEDS_CONNECTION, isBrowserOffline } from '../../lib/offline/connection.ts';
import type { AwaitingSummary } from '../../lib/overview/awaiting.ts';
import type { CustomerRevenueRow, JobProfitRow, LeadKpis, OverviewKpis } from '../../lib/overview/overview.ts';
import {
    BUSINESS_SUMMARY_LIMITS, BUSINESS_SUMMARY_TASK, SUMMARY_BULLET_KINDS, type BusinessSummary, type SummaryBulletKind,
} from '../../supabase/functions/ai-assistant/shared/businessSummary.ts';
import { readFunctionError } from '../hooks/useMasterAIRouter.ts';

/** What the overview hands the slot (components/overview/OverviewAiSlot.tsx OverviewAiSummaryProps, minus UI flags). */
export interface BusinessSummaryInput {
    periodLabel: string;
    startYMD: string | null;
    endYMD: string | null;
    kpis: OverviewKpis;
    leads: LeadKpis | null;
    activeJobs: number;
    topJobs: readonly JobProfitRow[];
    bottomJobs: readonly JobProfitRow[];
    awaiting: AwaitingSummary;
    customers: readonly CustomerRevenueRow[];
    customerFilter: string;
    projectFilter: string;
}

export class BusinessSummaryError extends Error {
    constructor(message: string, public code: string) { super(message); }
}

/** Nothing to talk about in the period (the button is not offered then). */
export const hasSummaryData = (i: Pick<BusinessSummaryInput, 'kpis' | 'topJobs' | 'bottomJobs' | 'awaiting' | 'leads'>): boolean => {
    const k = i.kpis;
    return Boolean(k.billed || k.collected || k.outstanding || k.costs || k.income || k.invoiceCount
        || i.topJobs.length || i.bottomJobs.length || i.awaiting.count || i.leads?.newLeads);
};

const job = (r: JobProfitRow) => ({ id: r.jobId, name: r.name, customer: r.customer || undefined, revenue: r.revenue, cost: r.cost, profit: r.profit, margin: r.margin === null ? null : Math.round(r.margin * 10) / 10 });

/** The request body (exported for tests): aggregates and short labels only. */
export function buildBusinessSummaryBody(input: BusinessSummaryInput, opts: { today: string; language?: string }): Record<string, unknown> {
    const L = BUSINESS_SUMMARY_LIMITS;
    const k = input.kpis;
    return {
        task: BUSINESS_SUMMARY_TASK,
        context: {
            today: opts.today,
            language: opts.language,
            period: { label: input.periodLabel, start: input.startYMD || undefined, end: input.endYMD || undefined },
            filters: { customer: input.customerFilter, project: input.projectFilter },
            kpis: {
                billed: k.billed, collected: k.collected, income: k.income, outstanding: k.outstanding, outstanding_count: k.outstandingCount,
                overdue: k.overdue, overdue_count: k.overdueCount, costs: k.costs, profit: k.profit, invoice_count: k.invoiceCount,
                avg_days_to_paid: k.avgDaysToPaid, paid_sample: k.paidSample,
            },
            leads: input.leads ? { new_leads: input.leads.newLeads, won: input.leads.won, lost: input.leads.lost, win_rate_pct: input.leads.winRate === null ? null : Math.round(input.leads.winRate * 1000) / 10 } : null,
            active_jobs: input.activeJobs,
            top_jobs: input.topJobs.slice(0, L.jobs).map(job),
            bottom_jobs: input.bottomJobs.slice(0, L.jobs).map(job),
            awaiting: {
                count: input.awaiting.count, total: input.awaiting.total,
                rows: input.awaiting.rows.slice(0, L.awaiting).map(e => ({
                    id: e.id, job_id: e.jobId || undefined, label: e.number ? `Estimate ${e.number}` : 'Estimate', customer: e.customer || undefined,
                    job: e.jobName || undefined, amount: e.amount, days_waiting: e.daysWaiting ?? undefined, stale: e.stale || undefined, expired: e.expired || undefined,
                })),
            },
            customers: input.customers.slice(0, L.customers).map(c => ({ name: c.name, revenue: c.revenue, outstanding: c.outstanding })),
        },
    };
}

/**
 * The function's answer -> the summary (checked again here: texts, kinds, ids only from the input). Throws on an
 * answer that is not a business_summary answer.
 */
export function parseBusinessSummaryResponse(data: unknown, input: Pick<BusinessSummaryInput, 'topJobs' | 'bottomJobs' | 'awaiting'>): BusinessSummary {
    const o = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
    const s = o?.summary && typeof o.summary === 'object' ? o.summary as Record<string, unknown> : null;
    if (!o || o.ok !== true || o.task !== BUSINESS_SUMMARY_TASK || !s || typeof s.headline !== 'string' || !Array.isArray(s.bullets)) {
        throw new Error('The assistant sent an answer the app could not read. Please try again.');
    }
    const L = BUSINESS_SUMMARY_LIMITS;
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
    const jobIds = new Set([...input.topJobs, ...input.bottomJobs].map(j => j.jobId).concat(input.awaiting.rows.map(e => e.jobId || '').filter(Boolean)));
    const estimateIds = new Set(input.awaiting.rows.map(e => e.id));
    const bullets = s.bullets.slice(0, L.bulletsMax).map(b => {
        const r = b && typeof b === 'object' ? b as Record<string, unknown> : {};
        const kind = (SUMMARY_BULLET_KINDS as readonly string[]).includes(String(r.kind)) ? r.kind as SummaryBulletKind : 'attention';
        return { kind, text: text(r.text, L.bulletChars) };
    }).filter(b => b.text);
    const actions = (Array.isArray(s.actions) ? s.actions : []).slice(0, L.actions).map(a => {
        const r = a && typeof a === 'object' ? a as Record<string, unknown> : {};
        const out: BusinessSummary['actions'][number] = { text: text(r.text, L.actionChars) };
        if (typeof r.job_id === 'string' && jobIds.has(r.job_id)) out.job_id = r.job_id;
        if (typeof r.estimate_id === 'string' && estimateIds.has(r.estimate_id)) out.estimate_id = r.estimate_id;
        return out;
    }).filter(a => a.text);
    const headline = text(s.headline, L.headlineChars);
    if (!headline || !bullets.length) throw new Error('The assistant sent an answer the app could not read. Please try again.');
    return { headline, bullets, actions };
}

/** Calls the ai-assistant 'business_summary' task. Throws BusinessSummaryError. */
export async function runBusinessSummary(input: BusinessSummaryInput, opts: { today: string; language?: string }, signal?: AbortSignal): Promise<BusinessSummary> {
    if (isBrowserOffline()) throw new BusinessSummaryError(NEEDS_CONNECTION, 'OFFLINE');
    if (!hasSummaryData(input)) throw new BusinessSummaryError('There is nothing to summarize in this period yet.', 'NO_DATA');
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body: buildBusinessSummaryBody(input, opts), signal, timeout: 130_000 });
    if (error) {
        const info = await readFunctionError(error);
        throw new BusinessSummaryError(info.message.replace(/^PLAN_REQUIRED:\s*/, ''), info.code);
    }
    try {
        return parseBusinessSummaryResponse(data, input);
    } catch (e) {
        throw new BusinessSummaryError((e as Error).message, 'AI_BAD_OUTPUT');
    }
}
