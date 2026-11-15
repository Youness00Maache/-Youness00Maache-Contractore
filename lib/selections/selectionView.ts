/**
 * Client selections: the words and small rules the owner's screens show (roadmap D5 phase B). Pure, no React / Supabase,
 * tested by scripts/selections-check.ts. Shapes: lib/selections/selectionTypes.ts, logic: selectionLogic.ts / selectionPo.ts.
 *
 *   chips       statusTone, chipLabel, tabBadge, headerChip, countsParts
 *   rows        dueInfo, selectionMeta, decidedLine, groupSelections
 *   money       moneyText, differenceText, differenceTone, optionTotalsLine
 *   detail      historyRows, ACTION_LABEL, lockedNote, clientLinkNote
 *   PO          poPreview (what "Create purchase order" will make: supplier + the one line)
 *   budget      budgetView (the extra "Selections" line of the job costing panel; null = show nothing)
 *   editor      emptyOption, optionRowToInput, draftFromRows, optionRowFromOption, canAddOption
 */
import { shortDay } from '../tasks/taskView.ts';
import { todayYmd } from '../tasks/taskLogic.ts';
import { shortDate } from '../jobFiles/jobFileView.ts';
import { roundMoney } from '../../utils/money.ts';
import {
    LOCKED_STATUSES, chosenOption, chosenPricing, isOverdue, makeOptionId, optionPricing, parseMoney, parseQty, sortSelections,
    type SelectionOwnerAction,
} from './selectionLogic.ts';
import { selectionPoLine, pickPoSupplier, type PoSupplierPick, type SelectionBudget } from './selectionPo.ts';
import {
    SELECTION_LIMITS,
    type JobSelection, type OptionPricing, type SelectionDraft, type SelectionHistoryEntry, type SelectionOption, type SelectionOptionInput,
    type SelectionStatus, type SelectionSummary,
} from './selectionTypes.ts';
import type { PriceBookLibraryItem, SupplierItemRecord, SupplierRecord } from '../suppliers/types.ts';

export type StatusTone = 'primary' | 'warning' | 'success' | 'danger' | 'muted';

export const SELECTIONS_NEED_CONNECTION = "You're offline. Selections need a connection; they come back when you're online again.";
export const SELECTIONS_PREMIUM_REASON = 'Client selections and mood boards are part of Premium.';
export const CLIENT_CHOOSES_LINE = 'Your client chooses from their project link.';
export const COST_PRIVATE = 'only you see this';

// ===================================================================================================== chips
export const statusTone = (s: SelectionStatus): StatusTone => {
    switch (s) {
        case 'sent': return 'warning';
        case 'chosen': return 'primary';
        case 'approved': return 'success';
        case 'changes_requested': return 'danger';
        case 'ordered': return 'primary';
        default: return 'muted';
    }
};

/** The status as a short chip word. */
export const chipLabel = (s: SelectionStatus): string => {
    switch (s) {
        case 'draft': return 'Draft';
        case 'sent': return 'Waiting for client';
        case 'chosen': return 'Chosen';
        case 'approved': return 'Approved';
        case 'changes_requested': return 'Changes requested';
        case 'ordered': return 'Ordered';
        case 'closed': return 'Closed';
        default: return String(s);
    }
};

/**
 * Next to the Selections tab, kept short so the tab row still fits a phone: what needs YOU first ("1 to approve"), else
 * what waits for the client ("2 waiting"); '' for none. The job header chip carries both.
 */
export const tabBadge = (s: Pick<SelectionSummary, 'waitingOnClient' | 'toApprove'>): string =>
    s.toApprove > 0 ? `${s.toApprove} to approve` : s.waitingOnClient > 0 ? `${s.waitingOnClient} waiting` : '';

/** The chip in the job header: "2 waiting for client · 1 to approve" ('' for none). */
export const headerChip = (s: Pick<SelectionSummary, 'waitingOnClient' | 'toApprove'>): string =>
    [s.waitingOnClient > 0 ? `${s.waitingOnClient} waiting for client` : '', s.toApprove > 0 ? `${s.toApprove} to approve` : ''].filter(Boolean).join(' · ');

export interface CountPart { text: string; tone: 'strong' | 'late' | 'normal' }

/** The pieces of the line under the panel title. */
export const countsParts = (s: SelectionSummary): CountPart[] => {
    const parts: CountPart[] = [];
    if (s.toApprove) parts.push({ text: `${s.toApprove} to approve`, tone: 'strong' });
    if (s.waitingOnClient) parts.push({ text: `${s.waitingOnClient} waiting for client`, tone: 'strong' });
    if (s.overdue) parts.push({ text: `${s.overdue} overdue`, tone: 'late' });
    if (s.changesRequested) parts.push({ text: `${s.changesRequested} need changes`, tone: 'normal' });
    if (s.toOrder) parts.push({ text: `${s.toOrder} to order`, tone: 'normal' });
    if (s.ordered) parts.push({ text: `${s.ordered} ordered`, tone: 'normal' });
    if (s.draft) parts.push({ text: `${s.draft} ${s.draft === 1 ? 'draft' : 'drafts'}`, tone: 'normal' });
    if (s.closed) parts.push({ text: `${s.closed} closed`, tone: 'normal' });
    return parts;
};

// ===================================================================================================== rows
export type DueTone = 'late' | 'today' | 'normal' | 'none';

const daysBetweenYmd = (a: string, b: string): number => {
    const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / 86_400_000);
};

/** The due line: "3 days overdue", "Due today", "Due Fri Nov 20" ('' with no date). Overdue only counts while it waits for the client. */
export const dueInfo = (s: Pick<JobSelection, 'status' | 'dueDate'>, today: string = todayYmd()): { text: string; tone: DueTone } => {
    if (!s.dueDate) return { text: '', tone: 'none' };
    const year = Number(today.slice(0, 4));
    if (s.status === 'sent') {
        if (isOverdue(s, today)) {
            const n = Math.max(1, daysBetweenYmd(s.dueDate, today));
            return { text: `${n} ${n === 1 ? 'day' : 'days'} overdue`, tone: 'late' };
        }
        if (s.dueDate === today) return { text: 'Due today', tone: 'today' };
        return { text: `Due ${shortDay(s.dueDate, 'en', year)}`, tone: 'normal' };
    }
    return { text: `Due ${shortDay(s.dueDate, 'en', year)}`, tone: 'none' };
};

/** The grey line under a title: room, options, allowance, due date. */
export const selectionMeta = (s: JobSelection, today: string = todayYmd()): string[] => {
    const decided = s.status === 'chosen' || s.status === 'approved' || s.status === 'ordered';
    return [
        s.room || '',
        s.options.length ? `${s.options.length} ${s.options.length === 1 ? 'option' : 'options'}` : '',
        s.allowance !== null ? `Allowance ${moneyText(s.allowance)}` : '',
        decided ? '' : dueInfo(s, today).text,
    ].filter(Boolean);
};

/** "Chose Matte white 3x6 · $1,200 (+$120 upgrade)" for a decided row ('' when nothing is chosen). */
export const decidedLine = (s: JobSelection): string => {
    const o = chosenOption(s);
    const p = chosenPricing(s);
    if (!o || !p) return '';
    const diff = differenceText(p.difference);
    return `${o.name} · ${moneyText(p.total)}${diff ? ` (${diff})` : ''}`;
};

export interface SelectionGroups {
    toApprove: JobSelection[];
    waiting: JobSelection[];
    changes: JobSelection[];
    toOrder: JobSelection[];
    drafts: JobSelection[];
    ordered: JobSelection[];
    closed: JobSelection[];
}

/** What needs you first: to approve, waiting for the client (overdue / soonest first), changes, to order, drafts, ordered, closed. */
export const groupSelections = (list: readonly JobSelection[]): SelectionGroups => {
    const g: SelectionGroups = { toApprove: [], waiting: [], changes: [], toOrder: [], drafts: [], ordered: [], closed: [] };
    for (const s of sortSelections(list)) {
        if (s.status === 'chosen') g.toApprove.push(s);
        else if (s.status === 'sent') g.waiting.push(s);
        else if (s.status === 'changes_requested') g.changes.push(s);
        else if (s.status === 'approved') g.toOrder.push(s);
        else if (s.status === 'draft') g.drafts.push(s);
        else if (s.status === 'ordered') g.ordered.push(s);
        else g.closed.push(s);
    }
    return g;
};

// ===================================================================================================== money
/** "$1,200" (no cents for a whole amount), "$1,200.50". */
export const moneyText = (n: number | null | undefined): string => {
    const v = roundMoney(Number(n) || 0);
    const whole = Math.abs(v - Math.round(v)) < 0.005;
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(v);
    } catch {
        return `$${whole ? Math.round(v) : v.toFixed(2)}`;
    }
};

/** "+$120 upgrade" / "-$40 credit" / "Included" ('' without an allowance). */
export const differenceText = (difference: number | null | undefined): string => {
    if (difference === null || difference === undefined || !Number.isFinite(Number(difference))) return '';
    const d = roundMoney(Number(difference));
    if (d > 0) return `+${moneyText(d)} upgrade`;
    if (d < 0) return `-${moneyText(-d)} credit`;
    return 'Included';
};

export const differenceTone = (difference: number | null | undefined): 'up' | 'down' | 'same' | 'none' => {
    if (difference === null || difference === undefined) return 'none';
    return difference > 0 ? 'up' : difference < 0 ? 'down' : 'same';
};

/** "3 × $400 = $1,200" for the live line under an option's inputs. */
export const optionTotalsLine = (qty: number, unitPrice: number, pricing: OptionPricing, unit?: string | null): string => {
    const q = Math.round(qty * 1000) / 1000;
    return `${q}${unit ? ` ${unit}` : ''} × ${moneyText(unitPrice)} = ${moneyText(pricing.total)}`;
};

// ===================================================================================================== detail
export interface HistoryRow { key: string; when: string; label: string; note: string | null; client: boolean; action: string }

const whenOf = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${shortDate(iso)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

/**
 * The timeline, oldest first. A client's choice keeps the option name (and what they wrote) as its note; the choice that
 * STANDS is already shown in full above the timeline, so its note is left out there (earlier rounds keep theirs).
 */
export const historyRows = (s: Pick<JobSelection, 'history' | 'status'>): HistoryRow[] => {
    const sorted = s.history
        .map((e, i) => ({ e, i, t: Date.parse(e.at) || 0 }))
        .sort((a, b) => a.t - b.t || a.i - b.i);
    let lastChosen = -1;
    sorted.forEach((x, pos) => { if (x.e.action === 'chosen') lastChosen = pos; });
    const standing = LOCKED_STATUSES.includes(s.status);
    return sorted
        // saving a change and then copying its photos for the client are two writes: one "changed it" line is enough
        .filter(({ e, t }, pos) => {
            const prev = sorted[pos - 1];
            return !(prev && e.action === 'edited' && prev.e.action === 'edited' && prev.e.by === e.by && t - prev.t < 120_000);
        })
        .map(({ e, i, t }) => ({
            key: `${i}-${e.at}`, when: whenOf(e.at), label: historyText(e), note: standing && sorted.findIndex(x => x.i === i && x.t === t) === lastChosen ? null : e.note,
            client: e.by === 'client', action: String(e.action),
        }));
};

const historyText = (e: SelectionHistoryEntry): string => {
    const who = e.by === 'client' ? 'Client' : 'You';
    switch (e.action) {
        case 'created': return `${who} created the selection`;
        case 'sent': return `${who} sent it to the client`;
        case 'edited': return `${who} changed it`;
        case 'withdrawn': return `${who} took it back to drafts`;
        case 'reopened': return `${who} asked the client to choose again`;
        case 'chosen': return `${who} made a choice`;
        case 'approved': return `${who} approved the choice`;
        case 'changes_requested': return `${who} asked for changes`;
        case 'ordered': return `${who} marked it ordered`;
        case 'order_cancelled': return `${who} cancelled the order`;
        case 'closed': return `${who} closed it`;
        case 'draft': return `${who} moved it back to drafts`;
        default: return `${who}: ${String(e.action)}`;
    }
};

export const ACTION_LABEL = (a: SelectionOwnerAction, s: Pick<JobSelection, 'status' | 'sentAt'>): string => {
    switch (a) {
        case 'send': return s.status === 'changes_requested' ? 'Send again' : 'Send to client';
        case 'edit': return 'Edit';
        case 'withdraw': return 'Take back to drafts';
        case 'approve': return 'Approve';
        case 'request_changes': return 'Ask for changes';
        case 'ask_again': return 'Ask again';
        case 'create_po': return 'Create purchase order';
        case 'mark_ordered': return 'Mark ordered';
        case 'cancel_order': return 'Cancel order';
        case 'open_po': return 'Open purchase order';
        case 'close': return 'Close';
        case 'reopen': return s.sentAt ? 'Reopen' : 'Send to client';
        case 'delete': return 'Delete';
        default: return a;
    }
};

/** The primary (filled) buttons of the detail footer. */
export const PRIMARY_ACTIONS: readonly SelectionOwnerAction[] = ['send', 'approve', 'create_po', 'reopen'];

/** Why Edit is missing while the client's choice stands. '' when the options are free to change. */
export const lockedNote = (s: Pick<JobSelection, 'status'>): string =>
    LOCKED_STATUSES.includes(s.status)
        ? "The client's choice stands, so the options are locked. Use Ask for changes to open them up again, or Ask again to let the client choose again. The earlier choice stays in the history."
        : '';

export const clientLinkNote = (hasClient: boolean): string =>
    hasClient ? CLIENT_CHOOSES_LINE : 'Add a client to this job first: the client opens selections from their project link.';

/** What a send / change tells the owner afterwards. */
export const sentNote = (hasClient: boolean): string =>
    hasClient ? 'Sent. Your client sees it on their project link.' : 'Sent. Add a client to this job so they can see it.';

// ===================================================================================================== purchase order
export interface PoPreview {
    optionName: string;
    description: string;
    quantity: number;
    unit: string | null;
    /** the cost per unit the line uses (your cost, else the client price) */
    rate: number;
    total: number;
    /** false = the option has no cost: the line uses the client price */
    hasCost: boolean;
    supplier: PoSupplierPick | null;
    notes: string[];
}

/** What the draft purchase order of an approved selection will contain, before it is made. Null when no option is chosen. */
export const poPreview = (
    s: JobSelection,
    ctx: { suppliers: readonly SupplierRecord[]; priceBook?: readonly PriceBookLibraryItem[]; supplierItems?: readonly SupplierItemRecord[] },
): PoPreview | null => {
    const o = chosenOption(s);
    if (!o) return null;
    const line = selectionPoLine(s, o, () => 'preview');
    const supplier = pickPoSupplier(o, ctx);
    return {
        optionName: o.name,
        description: line.description,
        quantity: line.quantity,
        unit: o.unit,
        rate: line.rate,
        total: roundMoney(line.rate * line.quantity),
        hasCost: o.unitCost !== null && o.unitCost !== undefined,
        supplier,
        notes: [s.room ? `Room: ${s.room}` : '', o.url ? `Product: ${o.url}` : ''].filter(Boolean),
    };
};

/** The purchase order number of a saved document ('' when unknown). */
export const poNumberOf = (doc: { data?: unknown } | null | undefined): string => {
    const d = doc?.data as { poNumber?: unknown } | null | undefined;
    return d && typeof d.poNumber === 'string' ? d.poNumber : '';
};

export const supplierReason = (r: PoSupplierPick['reason']): string => {
    switch (r) {
        case 'option': return 'set on the option';
        case 'preferred': return 'your preferred supplier for this item';
        case 'cheapest': return 'the cheapest supplier that lists it';
        case 'inventory': return 'the supplier on your inventory item';
        default: return '';
    }
};

// ===================================================================================================== budget
export interface BudgetView {
    /** approved, no purchase order yet */
    pendingText: string;
    pendingCost: number;
    pendingCount: number;
    /** ordered selections already counted through their purchase orders */
    viaPoText: string;
    /** chosen by the client, not approved yet */
    awaitingText: string;
    /** extra (or less) the client pays against the allowances */
    upgrades: number;
    credits: number;
    net: number;
    netText: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The additive "Selections" line of the job costing panel. Null when the job has nothing to say (no approved / ordered /
 * chosen selection), so a job without selections shows nothing new. The existing costing numbers never change: this is
 * shown NEXT to them.
 */
export const budgetView = (b: SelectionBudget): BudgetView | null => {
    const pendingCount = b.pending.length;
    const viaPo = b.viaPurchaseOrder.length;
    if (!pendingCount && !viaPo && !b.orderedElsewhere.length && !b.awaitingApproval && !b.upgrades && !b.credits) return null;
    const net = roundMoney(b.upgrades - b.credits);
    return {
        pendingText: pendingCount ? `${plural(pendingCount, 'approved selection')} at your cost` : '',
        pendingCost: b.pendingCost,
        pendingCount,
        viaPoText: viaPo ? `${plural(viaPo, 'ordered selection')} already counted through ${viaPo === 1 ? 'its' : 'their'} purchase order${viaPo === 1 ? '' : 's'}` : '',
        awaitingText: b.awaitingApproval ? `${plural(b.awaitingApproval, 'client choice')} waiting for your approval` : '',
        upgrades: b.upgrades,
        credits: b.credits,
        net,
        netText: net > 0 ? `Your client pays ${moneyText(net)} more than the allowances: add a change order`
            : net < 0 ? `${moneyText(-net)} back to the client against the allowances` : '',
    };
};

// ===================================================================================================== editor rows
/** One option as the editor holds it: numbers stay text while typing. */
export interface OptionRow {
    id: string;
    name: string;
    description: string;
    imagePath: string | null;
    portalPath: string | null;
    url: string;
    sku: string;
    supplierId: string;
    unit: string;
    qty: string;
    unitPrice: string;
    unitCost: string;
}

export const emptyOption = (): OptionRow => ({
    id: makeOptionId(), name: '', description: '', imagePath: null, portalPath: null, url: '', sku: '', supplierId: '', unit: '', qty: '1', unitPrice: '', unitCost: '',
});

const numText = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));

export const optionRowFromOption = (o: SelectionOption | SelectionOptionInput): OptionRow => ({
    id: String(o.id || makeOptionId()),
    name: o.name || '',
    description: o.description || '',
    imagePath: o.imagePath || null,
    portalPath: o.portalPath || null,
    url: o.url || '',
    sku: o.sku || '',
    supplierId: o.supplierId || '',
    unit: o.unit || '',
    qty: o.qty === undefined || o.qty === null ? '1' : String(o.qty),
    unitPrice: o.unitPrice === undefined || o.unitPrice === null || Number(o.unitPrice) === 0 ? '' : String(o.unitPrice),
    unitCost: o.unitCost === undefined || o.unitCost === null ? '' : String(o.unitCost),
});

export const optionRowToInput = (r: OptionRow): SelectionOptionInput => ({
    id: r.id,
    name: r.name,
    description: r.description || null,
    imagePath: r.imagePath,
    portalPath: r.imagePath ? r.portalPath : null,
    url: r.url.trim() || null,
    sku: r.sku || null,
    supplierId: r.supplierId || null,
    unit: r.unit || null,
    qty: r.qty,
    unitPrice: r.unitPrice,
    unitCost: r.unitCost,
});

export const canAddOption = (rows: readonly unknown[]): boolean => rows.length < SELECTION_LIMITS.options;

/** What an option row would cost / earn right now (text inputs read leniently so the live line never throws). */
export const rowPricing = (r: Pick<OptionRow, 'qty' | 'unitPrice' | 'unitCost'>, allowance: string | number | null | undefined): { qty: number; unitPrice: number; pricing: OptionPricing } => {
    const qty = parseQty(r.qty) ?? 1;
    const unitPrice = parseMoney(r.unitPrice) ?? 0;
    const cost = r.unitCost === '' ? null : parseMoney(r.unitCost);
    const a = allowance === '' || allowance === null || allowance === undefined ? null : parseMoney(allowance);
    return { qty, unitPrice, pricing: optionPricing({ qty, unitPrice, unitCost: cost }, a) };
};

export const draftFromRows = (f: {
    title: string; category: string; room: string; body: string; dueDate: string; allowance: string; rows: readonly OptionRow[];
}): SelectionDraft => ({
    title: f.title,
    category: f.category || null,
    room: f.room || null,
    body: f.body || null,
    dueDate: f.dueDate || null,
    allowance: f.allowance.trim() === '' ? null : f.allowance,
    options: f.rows.map(optionRowToInput),
});
