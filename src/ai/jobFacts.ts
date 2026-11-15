/**
 * Business numbers for the assistant (roadmap N7): PURE builders (no network, no React) of the aggregates the job
 * assistant and the dashboard assistant send with a money / progress question (context.job_facts / business_facts,
 * cleaned again by the server: supabase/functions/ai-assistant/shared/businessFacts.ts).
 *
 * Every number comes from the app's own helpers, so the assistant says exactly what the screens show:
 *   money        lib/finance.ts summarizeJobMoney (Job financials: billed, collected, outstanding, costs, profit, margin)
 *   costing      lib/costing.ts summarizeJobCosting (budget vs actual: spent by kind, budget used %, ordered)
 *   invoices     lib/overview/facts.ts buildFacts (overdue = unpaid with a balance and past its due date)
 *   month        lib/overview/overview.ts overviewKpis for this month (Business overview)
 *   estimates    lib/overview/awaiting.ts awaitingEstimates (sent, no answer yet)
 *   tasks        lib/tasks/taskLogic.ts taskProgress / isOverdue
 *   stock        utils/stockMath.ts stockStatus / lowStockThreshold (Inventory's low-stock rule)
 * Only aggregates and short labels go out: never notes, emails, phones, addresses, links or whole documents.
 * The network side (what to load, with a time limit) is src/ai/jobFactsLoader.ts. Tested by scripts/document-ai-flow-qa.ts.
 */
import { summarizeJobMoney } from '../../lib/finance.ts';
import { summarizeJobCosting, type PriceBookLite } from '../../lib/costing.ts';
import { buildFacts, jobCustomerMap } from '../../lib/overview/facts.ts';
import { overviewKpis } from '../../lib/overview/overview.ts';
import { awaitingEstimates } from '../../lib/overview/awaiting.ts';
import { periodLabel, periodRange } from '../../lib/overview/period.ts';
import type { OverviewDoc, OverviewJob } from '../../lib/overview/types.ts';
import { addDays, daysBetween, isOverdue, taskProgress, type TaskLike } from '../../lib/tasks/taskLogic.ts';
import { lowStockThreshold, stockStatus } from '../../utils/stockMath.ts';
import { toNumber } from '../../utils/money.ts';
import {
    FACTS_LIMITS, factLabel, sanitizeBusinessFacts, sanitizeJobFacts, type BusinessFacts, type FactsInvoice, type JobFacts,
} from '../../supabase/functions/ai-assistant/shared/businessFacts.ts';

export { wantsBusinessFacts } from '../../supabase/functions/ai-assistant/shared/businessFacts.ts';

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** A document of the app's list (FormData fits): only what the week's activity needs. */
export interface ActivityDoc { id: string; jobId?: string | null; type: string; createdAt?: string | null; data?: unknown }
export type FactsTask = TaskLike & { title: string };
export interface FactsAsk { title: string; status: string; dueDate?: string | null }

export interface JobFactsInput {
    /** the user's local date, YYYY-MM-DD */
    today: string;
    job: OverviewJob;
    /** the job's money documents with the Business overview columns (components/overview/overviewApi.ts OVERVIEW_COLUMNS) */
    docs: readonly OverviewDoc[];
    laborRate: number;
    priceBook?: readonly PriceBookLite[] | null;
    /** % complete typed on the job */
    manualPercent?: number | null;
    /** the job's documents from the app's list (this week's activity, notes) */
    forms?: readonly ActivityDoc[];
    tasks?: readonly FactsTask[] | null;
    questions?: readonly FactsAsk[] | null;
    selections?: readonly FactsAsk[] | null;
    /** photos added this week (null / undefined = unknown, left out) */
    photosThisWeek?: number | null;
}

const invoiceLabel = (number: string) => (number ? `Invoice #${number}` : 'Invoice');

/** Overdue invoices (biggest balance first) as short facts. */
function overdueInvoiceFacts(docs: readonly OverviewDoc[], jobs: readonly OverviewJob[], today: string, laborRate: number): FactsInvoice[] {
    const facts = buildFacts(docs, { laborRate, todayYMD: today, jobs });
    const byId = new Map(docs.map(d => [d.id, d]));
    const jobName = new Map(jobs.map(j => [j.id, j.name]));
    return facts.invoices
        .filter(f => f.overdue && f.due > 0)
        .sort((a, b) => b.due - a.due || a.day.localeCompare(b.day))
        .slice(0, FACTS_LIMITS.overdueInvoices)
        .map(f => {
            const due = dayOf(byId.get(f.id)?.dueDate);
            const out: FactsInvoice = { label: invoiceLabel(f.number), balance: r2(f.due) };
            if (f.customer) out.client = factLabel(f.customer);
            if (f.jobId && jobName.get(f.jobId)) out.job = factLabel(jobName.get(f.jobId));
            if (due) {
                out.due_date = due;
                try { out.days_late = Math.max(0, daysBetween(due, today)); } catch { /* not a real date: no day count */ }
            }
            return out;
        });
}

const isNotDraft = (s: unknown) => !['', 'draft', 'cancelled', 'canceled', 'void'].includes(norm(s));
const SENDABLE = new Set(['invoice', 'estimate', 'change order', 'purchase order', 'work order']);

/** Facts for ONE job (the job assistant). Already cleaned and capped (the same cleaning the server applies). */
export function buildJobFacts(input: JobFactsInput): JobFacts | undefined {
    const { today, job, docs, laborRate } = input;
    const jobDocs = docs.filter(d => !d.jobId || d.jobId === job.id);
    const money = summarizeJobMoney([...jobDocs], { laborRate });
    const costing = summarizeJobCosting(jobDocs, { laborRate, priceBook: input.priceBook, manualPercent: input.manualPercent });
    const row = (id: string) => costing.rows.find(r => r.id === id)?.actual;
    const raw: Record<string, unknown> = {
        as_of: today,
        money: {
            billed: money.invoiced, income: money.income, collected: money.collected, outstanding: money.outstanding,
            contract_value: money.contractValue,
            costs: { materials: money.materials, labor: money.labor, expenses: money.expenses },
            total_costs: money.costs, labor_hours: r2(money.hours + money.overtime), profit: money.profit,
            margin_pct: money.margin === null ? null : r2(money.margin),
            spent_by_kind: { labor: row('labor'), materials: row('materials'), expenses: row('expenses'), subs_other: row('other') },
            budget: costing.budget || undefined,
            budget_used_pct: costing.usedPct === null ? null : r2(costing.usedPct),
            ordered_not_arrived: costing.committed || undefined,
            percent_complete: costing.progress?.percent ?? null,
        },
        overdue_invoices: overdueInvoiceFacts(jobDocs, [job], today, laborRate),
    };
    if (input.tasks) {
        const tasks = input.tasks;
        const p = taskProgress(tasks, today);
        raw.tasks = {
            open: p.open, overdue: p.overdue, done: p.done,
            overdue_list: tasks.filter(t => isOverdue(t, today)).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
                .map(t => ({ title: t.title, due_date: t.dueDate || undefined })),
            next_milestones: tasks.filter(t => t.isMilestone && t.status !== 'done' && t.dueDate && t.dueDate >= today)
                .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
                .map(t => ({ title: t.title, due_date: t.dueDate || undefined })),
        };
    }
    if (input.questions || input.selections) {
        const q = (input.questions || []).filter(x => x.status === 'sent');
        const s = (input.selections || []).filter(x => x.status === 'sent' || x.status === 'changes_requested');
        raw.waiting_on_client = {
            questions: q.length, selections: s.length,
            items: [...q.map(x => ({ kind: 'question', title: x.title, due_date: x.dueDate || undefined })), ...s.map(x => ({ kind: 'selection', title: x.title, due_date: x.dueDate || undefined }))]
                .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))),
        };
    }
    // this week = the last 7 days, today included
    const from = addDays(today, -6);
    const inWeek = (d: string | null) => Boolean(d && d >= from && d <= today);
    const forms = (input.forms || []).filter(f => !f.jobId || f.jobId === job.id);
    const created = forms.filter(f => inWeek(dayOf(f.createdAt)));
    const statusOf = (f: ActivityDoc) => (f.data && typeof f.data === 'object' ? (f.data as Record<string, unknown>).status : undefined);
    const facts = buildFacts(jobDocs, { laborRate, todayYMD: today, jobs: [job] });
    const signed = jobDocs.filter(d => inWeek(dayOf(d.clientSignedAt)));
    const paid = facts.invoices.filter(f => f.paid && inWeek(f.paidDay));
    raw.this_week = {
        from, to: today,
        documents_created: created.length,
        sent: created.filter(f => SENDABLE.has(norm(f.type)) && isNotDraft(statusOf(f))).length,
        signed: signed.length,
        paid: paid.length,
        notes: created.filter(f => norm(f.type) === 'note' || norm(f.type) === 'daily job report').length,
        photos: input.photosThisWeek ?? undefined,
        items: [
            ...created.map(f => `${f.type} created ${dayOf(f.createdAt)}`),
            ...signed.map(d => `${d.type} signed ${dayOf(d.clientSignedAt)}`),
            ...paid.map(f => `${invoiceLabel(f.number)} paid ${f.paidDay}`),
        ],
    };
    return sanitizeJobFacts(raw);
}

export interface BusinessFactsInput {
    today: string;
    now?: Date;
    jobs: readonly OverviewJob[];
    /** every money document with the Business overview columns (components/overview/overviewApi.ts) */
    docs: readonly OverviewDoc[];
    laborRate: number;
    /** inventory items (the app's list) */
    inventory?: ReadonlyArray<{ id: string; name: string; quantity?: number | string | null; unit?: string | null; low_stock_threshold?: number | string | null; supplier?: string | null }>;
}

/** Facts for the whole account (the dashboard assistant). Already cleaned and capped. */
export function buildBusinessFacts(input: BusinessFactsInput): BusinessFacts | undefined {
    const { today, jobs, docs, laborRate } = input;
    const raw: Record<string, unknown> = { as_of: today };
    if (docs.length) {
        const facts = buildFacts(docs, { laborRate, todayYMD: today, jobs });
        const now = input.now ?? new Date(`${today}T12:00:00`);
        const range = periodRange('this-month', now);
        if (range) {
            const k = overviewKpis(facts, range);
            raw.month = { label: periodLabel('this-month', range, now), billed: k.billed, collected: k.collected, outstanding: k.outstanding, overdue: k.overdue, costs: k.costs, profit: k.profit, invoices: k.invoiceCount };
        }
        const overdueAll = facts.invoices.filter(f => f.overdue && f.due > 0);
        raw.overdue_total = r2(overdueAll.reduce((s, f) => s + f.due, 0));
        raw.overdue_count = overdueAll.length;
        raw.overdue_invoices = overdueInvoiceFacts(docs, jobs, today, laborRate);
        const awaiting = awaitingEstimates(docs, jobs, jobCustomerMap(jobs, docs), today);
        raw.estimates_waiting_total = awaiting.total;
        raw.estimates_waiting_count = awaiting.count;
        raw.estimates_waiting = [...awaiting.rows].sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0)).map(e => ({
            label: e.number ? `Estimate #${e.number}` : 'Estimate', client: e.customer, job: e.jobName, amount: e.amount, days_waiting: e.daysWaiting ?? undefined,
        }));
    }
    if (input.inventory) {
        raw.reorder = input.inventory
            .filter(i => i && stockStatus(i) !== 'ok')
            .sort((a, b) => toNumber(a.quantity) - toNumber(b.quantity) || String(a.name).localeCompare(String(b.name)))
            .map(i => ({ name: i.name, stock: toNumber(i.quantity), alert_at: lowStockThreshold(i), unit: i.unit || undefined, supplier: i.supplier || undefined }));
    }
    return sanitizeBusinessFacts(raw);
}
