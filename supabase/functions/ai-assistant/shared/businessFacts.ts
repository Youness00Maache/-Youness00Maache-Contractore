/**
 * Business numbers for the assistant (roadmap N7, competitor gap #41: "AI that knows the business").
 *
 * The browser computes small AGGREGATES with the app's own helpers (src/ai/jobFacts.ts: lib/finance.ts
 * summarizeJobMoney, lib/costing.ts summarizeJobCosting, lib/tasks, lib/questions, lib/selections, the inventory and the
 * Business overview facts) and sends them in the request context:
 *   context.job_facts       the open job (job assistant): money, costs by kind, budget used, overdue invoices, tasks,
 *                           milestones, what the client still has to answer, this week's activity
 *   context.business_facts  the whole account (dashboard assistant): this month's totals, overdue invoices (top N),
 *                           low-stock reorder list, estimates waiting for an answer
 * Only numbers and short labels: never whole documents, notes, emails, phone numbers, addresses, tokens or links.
 * This file clamps them (unknown keys dropped, every list and text capped, a total size cap), builds the prompt rule
 * (rule 24) and a deterministic mock answer for AI_PROVIDER=mock. Requests without facts behave exactly as before.
 *
 * Pure TypeScript (Deno + Node). Tested by scripts/document-ai-flow-qa.ts (section 23).
 */
import { toPlainText } from './documentSchema.ts';

export const FACTS_LIMITS = {
    /** JSON characters of each facts object after cleaning (≈1k tokens) */
    chars: 4000,
    labelChars: 80,
    overdueInvoices: 10,
    taskItems: 8,
    milestones: 5,
    waitingItems: 8,
    weekItems: 10,
    reorder: 15,
    estimatesWaiting: 10,
} as const;

export interface FactsInvoice { label: string; client?: string; job?: string; due_date?: string; balance: number; days_late?: number }
export interface FactsItem { title: string; due_date?: string }
export interface FactsWaitingItem extends FactsItem { kind: 'question' | 'selection' }

/** Job money: lib/finance.ts summarizeJobMoney (the Job financials numbers) + lib/costing.ts summarizeJobCosting. */
export interface FactsJobMoney {
    /** billed invoices */
    billed?: number;
    /** billed + receipts that are not for an invoice */
    income?: number;
    collected?: number;
    outstanding?: number;
    /** accepted estimates + approved change orders */
    contract_value?: number;
    /** profit costs: material logs, labor (time sheets × labor rate), expense logs */
    costs?: { materials?: number; labor?: number; expenses?: number };
    total_costs?: number;
    labor_hours?: number;
    /** income − total_costs */
    profit?: number;
    /** profit ÷ income × 100 (null without income) */
    margin_pct?: number | null;
    /** job costing (budget vs actual): spent per kind (purchase orders that arrived included) */
    spent_by_kind?: { labor?: number; materials?: number; expenses?: number; subs_other?: number };
    budget?: number;
    /** (spent + ordered) ÷ budget × 100 */
    budget_used_pct?: number | null;
    /** ordered on purchase orders, not delivered yet */
    ordered_not_arrived?: number;
    percent_complete?: number | null;
}

export interface JobFacts {
    as_of: string;
    money?: FactsJobMoney;
    overdue_invoices?: FactsInvoice[];
    tasks?: { open: number; overdue: number; done: number; overdue_list?: FactsItem[]; next_milestones?: FactsItem[] };
    waiting_on_client?: { questions: number; selections: number; items?: FactsWaitingItem[] };
    this_week?: { from: string; to: string; documents_created: number; sent: number; signed: number; paid: number; notes: number; photos?: number; items?: string[] };
}

export interface BusinessFacts {
    as_of: string;
    /** this month's totals (Business overview, lib/overview overviewKpis) */
    month?: { label: string; billed: number; collected: number; outstanding: number; overdue: number; costs: number; profit: number; invoices: number };
    overdue_total?: number;
    overdue_count?: number;
    /** the biggest overdue balances first */
    overdue_invoices?: FactsInvoice[];
    /** low-stock items (at or under their alert level) */
    reorder?: Array<{ name: string; stock: number; alert_at: number; unit?: string; supplier?: string }>;
    estimates_waiting_total?: number;
    estimates_waiting_count?: number;
    estimates_waiting?: Array<{ label: string; client?: string; job?: string; amount: number; days_waiting?: number }>;
}

// ───────────────────────────── cleaning ─────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
/** (555) 555-0142, 555.555.0142, +1 555 555 0142; document numbers such as INV-2026-11-004 are kept */
const PHONE_RE = /(?:\+\d{1,3}[ .-]?)?\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b/g;
/** A short label: plain text, one line, no emails / links / phone numbers. */
export const factLabel = (v: unknown, max: number = FACTS_LIMITS.labelChars): string =>
    toPlainText(typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
        .replace(EMAIL_RE, '').replace(URL_RE, '').replace(PHONE_RE, '')
        .replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) && Math.abs(n) < 1e11 ? Math.round(n * 100) / 100 : undefined;
};
const count = (v: unknown): number => { const n = num(v); return n !== undefined && n > 0 ? Math.min(Math.floor(n), 1_000_000) : 0; };
const pctOrNull = (v: unknown): number | null | undefined => (v === null ? null : num(v) !== undefined ? Math.round(num(v)! * 10) / 10 : undefined);
const ymd = (v: unknown): string | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : undefined);
const list = (v: unknown, max: number): Record<string, unknown>[] => (Array.isArray(v) ? v : []).filter(isObj).slice(0, max);
/** Copies only the keys with a value (keeps the JSON small). */
const compact = <T extends Record<string, unknown>>(o: T): T => {
    for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '') delete o[k];
    return o;
};

const cleanInvoice = (r: Record<string, unknown>): FactsInvoice | null => {
    const label = factLabel(r.label);
    const balance = num(r.balance);
    if (!label || balance === undefined) return null;
    return compact({ label, client: factLabel(r.client) || undefined, job: factLabel(r.job) || undefined, due_date: ymd(r.due_date), balance, days_late: num(r.days_late) !== undefined ? Math.max(0, Math.round(num(r.days_late)!)) : undefined });
};
const cleanItem = (r: Record<string, unknown>): FactsItem | null => {
    const title = factLabel(r.title);
    return title ? compact({ title, due_date: ymd(r.due_date) }) : null;
};
const notNull = <T,>(x: T | null): x is T => x !== null;

/** Drops list entries from the end (longest lists first) until the JSON fits FACTS_LIMITS.chars. */
function fitToBudget<T extends object>(facts: T, listPaths: Array<(f: T) => unknown[] | undefined>): T {
    let guard = 400;
    while (JSON.stringify(facts).length > FACTS_LIMITS.chars && guard-- > 0) {
        const lists = listPaths.map(get => get(facts)).filter((l): l is unknown[] => Array.isArray(l) && l.length > 0);
        if (!lists.length) break;
        lists.sort((a, b) => b.length - a.length)[0].pop();
    }
    return facts;
}

/** Clamps the job facts from the browser. Returns undefined when nothing usable was sent. */
export function sanitizeJobFacts(raw: unknown): JobFacts | undefined {
    if (!isObj(raw)) return undefined;
    const out: JobFacts = { as_of: ymd(raw.as_of) || '' };
    if (isObj(raw.money)) {
        const m = raw.money;
        const costs = isObj(m.costs) ? compact({ materials: num(m.costs.materials), labor: num(m.costs.labor), expenses: num(m.costs.expenses) }) : undefined;
        const kinds = isObj(m.spent_by_kind) ? compact({ labor: num(m.spent_by_kind.labor), materials: num(m.spent_by_kind.materials), expenses: num(m.spent_by_kind.expenses), subs_other: num(m.spent_by_kind.subs_other) }) : undefined;
        const money: FactsJobMoney = compact({
            billed: num(m.billed), income: num(m.income), collected: num(m.collected), outstanding: num(m.outstanding), contract_value: num(m.contract_value),
            costs: costs && Object.keys(costs).length ? costs : undefined, total_costs: num(m.total_costs), labor_hours: num(m.labor_hours),
            profit: num(m.profit), margin_pct: pctOrNull(m.margin_pct),
            spent_by_kind: kinds && Object.keys(kinds).length ? kinds : undefined, budget: num(m.budget), budget_used_pct: pctOrNull(m.budget_used_pct),
            ordered_not_arrived: num(m.ordered_not_arrived), percent_complete: pctOrNull(m.percent_complete),
        });
        if (Object.keys(money).length) out.money = money;
    }
    const overdue = list(raw.overdue_invoices, FACTS_LIMITS.overdueInvoices).map(cleanInvoice).filter(notNull);
    if (overdue.length) out.overdue_invoices = overdue;
    if (isObj(raw.tasks)) {
        const t = raw.tasks;
        out.tasks = compact({
            open: count(t.open), overdue: count(t.overdue), done: count(t.done),
            overdue_list: list(t.overdue_list, FACTS_LIMITS.taskItems).map(cleanItem).filter(notNull),
            next_milestones: list(t.next_milestones, FACTS_LIMITS.milestones).map(cleanItem).filter(notNull),
        });
        if (!out.tasks.overdue_list?.length) delete out.tasks.overdue_list;
        if (!out.tasks.next_milestones?.length) delete out.tasks.next_milestones;
    }
    if (isObj(raw.waiting_on_client)) {
        const w = raw.waiting_on_client;
        const items = list(w.items, FACTS_LIMITS.waitingItems).map(r => {
            const item = cleanItem(r);
            return item ? { kind: (r.kind === 'selection' ? 'selection' : 'question') as FactsWaitingItem['kind'], ...item } : null;
        }).filter(notNull);
        out.waiting_on_client = { questions: count(w.questions), selections: count(w.selections), ...(items.length ? { items } : {}) };
    }
    if (isObj(raw.this_week)) {
        const w = raw.this_week;
        const from = ymd(w.from); const to = ymd(w.to);
        if (from && to) {
            const items = (Array.isArray(w.items) ? w.items : []).slice(0, FACTS_LIMITS.weekItems).map(x => factLabel(x, 100)).filter(Boolean);
            out.this_week = compact({
                from, to, documents_created: count(w.documents_created), sent: count(w.sent), signed: count(w.signed), paid: count(w.paid), notes: count(w.notes),
                photos: w.photos === undefined || w.photos === null ? undefined : count(w.photos), items: items.length ? items : undefined,
            });
        }
    }
    if (!out.as_of) delete (out as Partial<JobFacts>).as_of;
    if (Object.keys(out).filter(k => k !== 'as_of').length === 0) return undefined;
    return fitToBudget(out, [f => f.this_week?.items, f => f.tasks?.overdue_list, f => f.waiting_on_client?.items, f => f.overdue_invoices, f => f.tasks?.next_milestones]);
}

/** Clamps the business-wide facts from the browser. Returns undefined when nothing usable was sent. */
export function sanitizeBusinessFacts(raw: unknown): BusinessFacts | undefined {
    if (!isObj(raw)) return undefined;
    const out: BusinessFacts = { as_of: ymd(raw.as_of) || '' };
    if (isObj(raw.month)) {
        const m = raw.month;
        out.month = {
            label: factLabel(m.label, 40) || 'This month',
            billed: num(m.billed) ?? 0, collected: num(m.collected) ?? 0, outstanding: num(m.outstanding) ?? 0, overdue: num(m.overdue) ?? 0,
            costs: num(m.costs) ?? 0, profit: num(m.profit) ?? 0, invoices: count(m.invoices),
        };
    }
    if (num(raw.overdue_total) !== undefined) out.overdue_total = num(raw.overdue_total);
    if (raw.overdue_count !== undefined) out.overdue_count = count(raw.overdue_count);
    const overdue = list(raw.overdue_invoices, FACTS_LIMITS.overdueInvoices).map(cleanInvoice).filter(notNull);
    if (overdue.length) out.overdue_invoices = overdue;
    const reorder = list(raw.reorder, FACTS_LIMITS.reorder).map(r => {
        const name = factLabel(r.name);
        const stock = num(r.stock);
        if (!name || stock === undefined) return null;
        return compact({ name, stock, alert_at: num(r.alert_at) ?? 0, unit: factLabel(r.unit, 20) || undefined, supplier: factLabel(r.supplier, 60) || undefined });
    }).filter(notNull);
    if (reorder.length) out.reorder = reorder;
    if (num(raw.estimates_waiting_total) !== undefined) out.estimates_waiting_total = num(raw.estimates_waiting_total);
    if (raw.estimates_waiting_count !== undefined) out.estimates_waiting_count = count(raw.estimates_waiting_count);
    const waiting = list(raw.estimates_waiting, FACTS_LIMITS.estimatesWaiting).map(r => {
        const label = factLabel(r.label);
        const amount = num(r.amount);
        if (!label || amount === undefined) return null;
        return compact({ label, client: factLabel(r.client) || undefined, job: factLabel(r.job) || undefined, amount, days_waiting: num(r.days_waiting) !== undefined ? Math.max(0, Math.round(num(r.days_waiting)!)) : undefined });
    }).filter(notNull);
    if (waiting.length) out.estimates_waiting = waiting;
    if (!out.as_of) delete (out as Partial<BusinessFacts>).as_of;
    if (Object.keys(out).filter(k => k !== 'as_of').length === 0) return undefined;
    return fitToBudget(out, [f => f.reorder, f => f.overdue_invoices, f => f.estimates_waiting]);
}

// ───────────────────────────── when to send them ─────────────────────────────

/**
 * Questions the numbers help with: money, costs, profit, who owes, overdue, ordering / stock, progress, this week's
 * activity, tasks, selections. The browser loads and sends the facts only for these (other requests stay as before).
 */
const FACTS_QUESTION_RE = /\b(profit|margin|money|spend|spent|spending|cost|costs|costing|expense|expenses|material|materials|labou?r|budget|revenue|income|billed|invoiced|collected|outstanding|owe|owes|owed|owing|overdue|late|unpaid|paid|balance|cash|order|reorder|restock|stock|low on|run(?:ning)? out|summar\w*|recap|update me|status|progress|this week|last week|this month|week|month|how (?:are|is) (?:we|things|it|the job)|behind|on track|tasks?|to-?dos?|milestones?|selections?|questions?|waiting|pending|estimates? waiting|follow[- ]?up|what should|what's next|whats next|next steps?)\b/i;
export const wantsBusinessFacts = (text: unknown): boolean => typeof text === 'string' && FACTS_QUESTION_RE.test(text);

// ───────────────────────────── prompt ─────────────────────────────

/** Rule 24 of the assistant (dashboard + job scope). Short when the request has no facts. */
export function businessFactsRule(hasFacts: boolean): string {
    const base = `
24. Questions about the business numbers ("summarize this week for this job", "what did we spend on materials", "what's the profit on this job", "who owes me money", "what should I order", "what's overdue"): answer with CHAT ONLY from job_facts / business_facts and the document summaries in CONTEXT DATA. If the number or list asked for is not there, say plainly that you don't have that number here and where the app shows it (job page Financials, Insights, Business overview, Inventory). Never estimate, total up guesses, or invent amounts, dates, names or counts.`;
    if (!hasFacts) return base;
    return `${base}
   - The facts were computed by the app; copy the amounts exactly (you may round to whole dollars) and use their labels. Profit = money.profit (income − costs: materials + labor + expenses), margin = money.margin_pct %, spending on materials = money.costs.materials (purchase orders that arrived are in money.spent_by_kind.materials), budget used = money.budget_used_pct %.
   - "Who owes me" / "what's overdue": the overdue_invoices (label, client, balance, days_late) and money.outstanding / overdue_total; "what should I order": the reorder list (stock vs alert_at); "this week": this_week (from–to) plus overdue tasks and what the client still has to answer.
   - Keep it short: a sentence, then up to 5 "- " lines with the key numbers. Offer ONE next step the app can do (draft an invoice, a reminder email for an overdue invoice, a Note, a restock), but only DO it (GENERATE_DOCUMENT, PREPARE_EMAIL_BATCH, RESTOCK_INVENTORY …) when the user asks; it is still only a proposal they confirm.`;
}

/** The facts as they go into CONTEXT DATA (already clean). */
export function factsForContext(c: { job_facts?: JobFacts; business_facts?: BusinessFacts }): Record<string, unknown> {
    return {
        ...(c.job_facts ? { job_facts: c.job_facts } : {}),
        ...(c.business_facts ? { business_facts: c.business_facts } : {}),
    };
}

// ───────────────────────────── mock (AI_PROVIDER=mock) ─────────────────────────────

const money = (n: number | undefined | null): string => (n === undefined || n === null ? '' : `$${Math.round(n).toLocaleString('en-US')}`);
const NO_NUMBER = "I don't have that number here. Open the job's Financials (or Insights) to see it.";

/**
 * A deterministic grounded answer for the six business questions when facts were sent; null otherwise (the normal
 * mock runs). Every number comes from the facts.
 */
export function mockFactsAnswer(message: string, c: { job_facts?: JobFacts; business_facts?: BusinessFacts }): string | null {
    const t = message.toLowerCase();
    const j = c.job_facts;
    const b = c.business_facts;
    if (!j && !b) return null;
    if (/\bprofit|margin\b/.test(t)) {
        const m = j?.money;
        if (!m || m.profit === undefined) return NO_NUMBER;
        return `Profit on this job: ${money(m.profit)}${m.margin_pct !== undefined && m.margin_pct !== null ? ` (${Math.round(m.margin_pct)}% margin)` : ''}, from ${money(m.income ?? m.billed)} income and ${money(m.total_costs)} costs.`;
    }
    if (/\b(spend|spent|cost|costs)\b/.test(t) && /\bmaterials?\b/.test(t)) {
        const v = j?.money?.costs?.materials;
        return v === undefined ? NO_NUMBER : `Materials so far: ${money(v)}.`;
    }
    if (/\b(who owes|owe|owes|owed|owing|unpaid)\b/.test(t) || /\boverdue\b/.test(t)) {
        const inv = b?.overdue_invoices || j?.overdue_invoices || [];
        const tasks = j?.tasks?.overdue_list || [];
        if (!inv.length && !tasks.length) {
            const out = j?.money?.outstanding ?? b?.month?.outstanding;
            return out !== undefined ? `Nothing is overdue. ${money(out)} is still outstanding.` : NO_NUMBER;
        }
        const lines = [...inv.map(i => `- ${i.label}${i.client ? ` (${i.client})` : ''}: ${money(i.balance)}${i.days_late ? `, ${i.days_late} days late` : ''}`), ...tasks.map(x => `- Task: ${x.title}${x.due_date ? ` (due ${x.due_date})` : ''}`)];
        return `${inv.length ? `${inv.length} overdue invoice${inv.length === 1 ? '' : 's'}` : 'No overdue invoices'}${tasks.length ? ` and ${tasks.length} overdue task${tasks.length === 1 ? '' : 's'}` : ''}:\n${lines.slice(0, 8).join('\n')}`;
    }
    if (/\b(order|reorder|restock|stock|low on|run(?:ning)? out)\b/.test(t)) {
        const r = b?.reorder;
        if (!r) return "I don't have your stock levels here. Open Inventory to see what is low.";
        if (!r.length) return 'Nothing is low on stock right now.';
        return `${r.length} item${r.length === 1 ? ' is' : 's are'} at or under the alert level:\n${r.slice(0, 8).map(x => `- ${x.name}: ${x.stock}${x.unit ? ` ${x.unit}` : ''} left (alert at ${x.alert_at})${x.supplier ? `, from ${x.supplier}` : ''}`).join('\n')}`;
    }
    if (/\b(summar\w*|recap|this week|update me)\b/.test(t)) {
        const w = j?.this_week;
        if (!w) {
            const m = b?.month;
            return m ? `${m.label}: ${money(m.billed)} billed, ${money(m.collected)} collected, ${money(m.outstanding)} outstanding, ${money(m.profit)} profit.` : NO_NUMBER;
        }
        return `This week (${w.from} to ${w.to}): ${w.documents_created} documents created, ${w.sent} sent, ${w.signed} signed, ${w.paid} paid${w.photos !== undefined ? `, ${w.photos} photos` : ''}, ${w.notes} notes.${j?.tasks ? ` ${j.tasks.open} tasks open, ${j.tasks.overdue} overdue.` : ''}`;
    }
    return null;
}
