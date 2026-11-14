/**
 * Notification bell (owner, 2026-11-14: "a client might sign, a stock that is going low, a like to your post…").
 *
 * PURE logic, no Supabase / React (scripts/notifications-check.ts runs it with sample data):
 *   - derive notifications from data the app already has or reads cheaply (lib/notifications/sources.ts),
 *   - de-duplicate, order and group them (Today / Earlier),
 *   - the read / dismissed state that follows the account (public.user_settings 'notifications.state'), bounded to
 *     the last MAX_STATE_IDS ids per list and WINDOW_DAYS days, with a size cap below the table's 20,000-char check,
 *   - the per-type choices ('notifications.prefs') and which new items may pop up as browser notifications.
 *
 * No new tables: forum likes / comments come from the existing public.notifications rows (actor + time + is_read);
 * everything else is derived from documents, inventory, quote requests, the reminder log, Gmail accounts, the offline
 * outbox and the plan usage.
 */
import { daysBetween, normalizeYMD, parseLocalDate, toLocalYMD } from '../../utils/localDates.ts';
import { stockStatus } from '../../utils/stockMath.ts';
import { toNumber } from '../../utils/money.ts';
import { isPayableStatus } from '../payments.ts';
import { parseSignerChoice, plainSignerName } from '../estimateOptions.ts';
import { REASON_LABELS } from '../../supabase/functions/reminders/shared/schedule.ts';
import { PAPER_REMINDER_OFFSETS, expiryPhrase, expiryState, paperKindLabel, paperReminderSteps } from '../../supabase/functions/reminders/shared/papers.ts';

// =====================================================================================================================
// Constants
// =====================================================================================================================
/** Notifications older than this are not shown (and read / dismissed ids are kept this long). */
export const WINDOW_DAYS = 60;
/** At most this many ids in each of the account lists (read, dismissed). */
export const MAX_STATE_IDS = 200;
/** user_settings.value is checked at 20,000 characters: stay well below it. */
export const STATE_MAX_CHARS = 18_000;
/** Longest list the bell shows. */
export const MAX_LIST = 120;
/** "Estimate expires soon" starts this many days before the expiry date. */
export const EXPIRING_DAYS = 3;
/** Browser pop-ups only for items this recent (never the backlog found at sign-in). */
export const POP_MAX_AGE_MS = 15 * 60_000;
/** At most this many browser pop-ups per refresh. */
export const POP_MAX = 3;

/** public.user_settings keys (lib/userData.ts lists every key in use). */
export const NOTIFICATION_STATE_SETTING = 'notifications.state';
export const NOTIFICATION_PREFS_SETTING = 'notifications.prefs';

const DAY_MS = 86_400_000;

// =====================================================================================================================
// Types
// =====================================================================================================================
export type NotificationKind =
    | 'doc_signed' | 'doc_declined' | 'payment_reported' | 'invoice_overdue' | 'estimate_expiring'
    | 'quote_request'
    | 'stock_low' | 'stock_out'
    | 'po_confirmed' | 'po_cant_fill' | 'po_received'
    | 'forum_like' | 'forum_comment' | 'forum_comment_like' | 'forum_reply'
    | 'reminder_sent' | 'reminder_failed' | 'gmail_reconnect'
    | 'sync_failed'
    | 'plan_limit'
    | 'crew_missed_out'
    | 'punch_ok' | 'punch_needs_work'
    | 'paper_expiring' | 'paper_expired'
    | 'service_visit';

export type NotificationCategory =
    | 'clients' | 'payments' | 'overdue' | 'expiring' | 'requests' | 'stock' | 'orders' | 'community'
    | 'reminders' | 'email' | 'sync' | 'limits' | 'crew' | 'papers' | 'service';

export type NotificationTone = 'success' | 'info' | 'warning' | 'danger';

/** Where tapping a notification goes. */
export type NotificationTarget =
    | { kind: 'path'; path: string }
    | { kind: 'request'; requestId: string }
    | { kind: 'inventory'; itemId: string }
    | { kind: 'outbox' };

export interface AppNotification {
    /** stable id: the same event always gets the same id (de-duplication, read state) */
    id: string;
    kind: NotificationKind;
    /** one short sentence */
    text: string;
    /** optional second line (a snippet, a reason, the job) */
    detail?: string;
    /** when it happened (epoch ms); 0 for a condition without a time of its own (first seen is used) */
    at: number;
    target: NotificationTarget;
    /** name of the person behind it (initial in the list) */
    actor?: string;
    /** already read according to its source (forum is_read, request opened, signed document viewed) */
    sourceRead?: boolean;
    /** public.notifications ids behind a community item (marked read in the database with it) */
    forumIds?: string[];
    /** a state that lasts (low stock, Gmail, plan limit): no time of its own */
    condition?: boolean;
    /** hidden when an item of this kind is in the list too (e.g. a failed reminder when Gmail needs reconnecting) */
    suppressedBy?: NotificationKind;
}

export interface ShownNotification extends AppNotification {
    category: NotificationCategory;
    tone: NotificationTone;
    /** short hash of the id (read / dismissed lists) */
    key: string;
    read: boolean;
}

export const KIND_META: Record<NotificationKind, { category: NotificationCategory; tone: NotificationTone }> = {
    doc_signed: { category: 'clients', tone: 'success' },
    doc_declined: { category: 'clients', tone: 'warning' },
    payment_reported: { category: 'payments', tone: 'success' },
    invoice_overdue: { category: 'overdue', tone: 'danger' },
    estimate_expiring: { category: 'expiring', tone: 'warning' },
    quote_request: { category: 'requests', tone: 'info' },
    stock_low: { category: 'stock', tone: 'warning' },
    stock_out: { category: 'stock', tone: 'danger' },
    po_confirmed: { category: 'orders', tone: 'success' },
    po_cant_fill: { category: 'orders', tone: 'warning' },
    po_received: { category: 'orders', tone: 'success' },
    forum_like: { category: 'community', tone: 'info' },
    forum_comment: { category: 'community', tone: 'info' },
    forum_comment_like: { category: 'community', tone: 'info' },
    forum_reply: { category: 'community', tone: 'info' },
    reminder_sent: { category: 'reminders', tone: 'info' },
    reminder_failed: { category: 'email', tone: 'warning' },
    gmail_reconnect: { category: 'email', tone: 'danger' },
    sync_failed: { category: 'sync', tone: 'danger' },
    plan_limit: { category: 'limits', tone: 'warning' },
    crew_missed_out: { category: 'crew', tone: 'warning' },
    punch_ok: { category: 'clients', tone: 'success' },
    punch_needs_work: { category: 'clients', tone: 'warning' },
    paper_expiring: { category: 'papers', tone: 'warning' },
    paper_expired: { category: 'papers', tone: 'danger' },
    service_visit: { category: 'service', tone: 'info' },
};

/** Settings › Notifications, in this order. */
export const NOTIFICATION_CATEGORIES: ReadonlyArray<{ id: NotificationCategory; label: string; hint: string }> = [
    { id: 'clients', label: 'Client signatures and declines', hint: 'A client signs, approves or declines a document, and the option they chose; a client approves a punch list item or sends it back.' },
    { id: 'payments', label: 'Payments reported', hint: 'A client taps “I’ve paid” on an invoice.' },
    { id: 'overdue', label: 'Overdue invoices', hint: 'A sent invoice passes its due date.' },
    { id: 'expiring', label: 'Estimates about to expire', hint: `A sent estimate expires within ${EXPIRING_DAYS} days.` },
    { id: 'requests', label: 'Quote requests', hint: 'Someone sends your request-a-quote form.' },
    { id: 'stock', label: 'Low stock', hint: 'An inventory item reaches its low-stock alert or runs out.' },
    { id: 'orders', label: 'Purchase orders', hint: 'A supplier confirms or can’t fill an order, or an order is received into stock.' },
    { id: 'community', label: 'Community', hint: 'Likes and comments on your posts, likes on your comments, replies in threads you joined.' },
    { id: 'reminders', label: 'Reminder emails sent', hint: 'Automatic reminders that went out from your Gmail.' },
    { id: 'email', label: 'Email problems', hint: 'A reminder couldn’t be sent, or Gmail needs to be reconnected.' },
    { id: 'sync', label: 'Offline sync problems', hint: 'A document saved offline couldn’t be saved to your account.' },
    { id: 'limits', label: 'Plan limits', hint: 'You reach a monthly limit of your plan.' },
    { id: 'crew', label: 'Missed clock-outs', hint: 'A crew member is still clocked in at the end of the day (crew clock-in links).' },
    { id: 'papers', label: 'Papers about to expire', hint: 'An insurance certificate, license, permit or bond in your Papers expires within 30 days, 7 days, 1 day, or has expired.' },
    { id: 'service', label: 'Service plan visits', hint: 'A service plan visit is due today, tomorrow or the day after.' },
];

const CATEGORY_IDS = NOTIFICATION_CATEGORIES.map(c => c.id) as readonly NotificationCategory[];
const TONE_RANK: Record<NotificationTone, number> = { danger: 0, warning: 1, success: 2, info: 3 };

export interface DeriveContext {
    /** the signed-in user: rows of anyone else are ignored */
    uid: string;
    now: number;
}

// =====================================================================================================================
// Small helpers
// =====================================================================================================================
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const norm = (v: unknown): string => str(v).replace(/\s+/g, ' ').toLowerCase();
const flag = (v: unknown): boolean => v === true || norm(v) === 'true';

/** A valid instant (ISO string), else ''. Empty strings ('' = cleared signature / decline) count as none. */
const instant = (v: unknown): string => {
    const s = str(v);
    if (!s) return '';
    const t = Date.parse(s);
    return Number.isFinite(t) ? s : '';
};
const ms = (v: unknown): number => {
    const t = Date.parse(str(v));
    return Number.isFinite(t) ? t : 0;
};

/** Text cut at a word boundary with an ellipsis. */
export const clip = (text: unknown, max: number): string => {
    const s = str(text).replace(/\s+/g, ' ');
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    // the cut ends a word when the next character is a space; otherwise go back to the last space
    const space = s.charAt(max - 1) === ' ' ? cut.length : cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!-]+$/, '')}…`;
};

const quoted = (title: unknown, max = 48): string => {
    const t = clip(title, max);
    return t ? `“${t}”` : 'your post';
};

const money = (n: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Alex", "Alex and Sam", "Alex and 3 others" (most recent first). */
export const namesText = (names: string[]): string => {
    const list = Array.from(new Set(names.map(n => str(n) || 'Someone')));
    if (list.length <= 1) return list[0] || 'Someone';
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list[0]} and ${list.length - 1} others`;
};

/** Local midnight (epoch ms) of a YYYY-MM-DD day plus `addDays`. */
const dayStart = (ymd: string, addDays = 0): number => {
    const d = parseLocalDate(ymd);
    if (!d) return 0;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + addDays).getTime();
};
const todayOf = (now: number): string => toLocalYMD(new Date(now));
const monthOf = (now: number): string => todayOf(now).slice(0, 7);

/**
 * Short, stable hash of an id (53-bit cyrb53, base 36): what the account lists store, so 200 ids stay small.
 */
export const notificationKey = (id: string): string => {
    let h1 = 0xdeadbeef ^ 0;
    let h2 = 0x41c6ce57 ^ 0;
    for (let i = 0; i < id.length; i++) {
        const ch = id.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// =====================================================================================================================
// Documents: client decisions, payments reported, overdue, expiring, purchase orders
// =====================================================================================================================
export interface DocInput {
    id: string;
    /** owner (when the row has it): anyone else's rows are ignored */
    userId?: string | null;
    jobId?: string | null;
    /** "Estimate", "Invoice", "Change Order", "Purchase Order", … */
    type: string;
    createdAt?: string | null;
    number?: string | null;
    title?: string | null;
    clientName?: string | null;
    status?: string | null;
    clientSignedAt?: string | null;
    clientSignedBy?: string | null;
    clientSignerName?: string | null;
    clientOptionChoice?: unknown;
    clientDeclinedAt?: string | null;
    clientDeclineReason?: string | null;
    paymentReportedAt?: string | null;
    paymentReportAmount?: number | string | null;
    paymentReportNote?: string | null;
    viewedByProvider?: boolean | string | null;
    dueDate?: string | null;
    expiryDate?: string | null;
    vendorName?: string | null;
    /** purchase orders: data.internalStockReceipt.state / doneAt / items */
    receiptState?: string | null;
    receiptDoneAt?: string | null;
    receiptItemCount?: number | null;
    /** purchase orders: finished deliveries (data.internalDeliveries.list, lib/poLifecycle.ts) */
    deliveries?: Array<{ id: string; doneAt: string; itemCount: number }> | null;
}

/** Finished deliveries of a purchase order (Record delivery): id, when, how many items went into stock. */
const deliveriesOf = (raw: unknown): DocInput['deliveries'] => {
    let list: unknown = raw;
    if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { list = null; } }
    if (!Array.isArray(list)) return null;
    return list
        .filter((x: any) => x && typeof x === 'object' && x.state === 'done' && !x.recovered && typeof x.id === 'string')
        .map((x: any) => ({ id: str(x.id), doneAt: str(x.doneAt), itemCount: Array.isArray(x.items) ? x.items.length : 0 }));
};

const NUMBER_KEYS = ['invoiceNumber', 'estimateNumber', 'changeOrderNumber', 'poNumber', 'receiptNumber', 'workOrderNumber', 'reportNumber', 'warrantyNumber'] as const;

/**
 * A `documents` row (JSON-path select from sources.ts), a full row with `data`, or an app list summary
 * ({ id, jobId, type, createdAt, data }) → DocInput. Never throws on odd data.
 */
export const docInputOf = (row: any): DocInput => {
    const d = row?.data && typeof row.data === 'object' ? row.data : {};
    const pick = (k: string): any => (d?.[k] !== undefined && d?.[k] !== null ? d[k] : row?.[k] ?? null);
    const receipt = d?.internalStockReceipt && typeof d.internalStockReceipt === 'object' ? d.internalStockReceipt : null;
    const receiptItems = receipt ? receipt.items : row?.receiptItems;
    let parsedItems: unknown = receiptItems;
    if (typeof receiptItems === 'string') { try { parsedItems = JSON.parse(receiptItems); } catch { parsedItems = null; } }
    return {
        id: str(row?.id),
        userId: row?.user_id ?? row?.userId ?? null,
        jobId: row?.job_id ?? row?.jobId ?? null,
        type: str(row?.type),
        createdAt: row?.created_at ?? row?.createdAt ?? null,
        number: NUMBER_KEYS.map(k => str(pick(k))).find(Boolean) || null,
        title: str(pick('title')) || null,
        clientName: str(pick('clientName')) || null,
        status: str(pick('status')) || null,
        clientSignedAt: str(pick('clientSignedAt')) || null,
        clientSignedBy: str(pick('clientSignedBy')) || null,
        clientSignerName: str(pick('clientSignerName')) || null,
        clientOptionChoice: pick('clientOptionChoice'),
        clientDeclinedAt: str(pick('clientDeclinedAt')) || null,
        clientDeclineReason: str(pick('clientDeclineReason')) || null,
        paymentReportedAt: str(pick('paymentReportedAt')) || null,
        paymentReportAmount: pick('paymentReportAmount'),
        paymentReportNote: str(pick('paymentReportNote')) || null,
        viewedByProvider: pick('viewedByProvider'),
        dueDate: str(pick('dueDate')) || null,
        expiryDate: str(pick('expiryDate')) || null,
        vendorName: str(pick('vendorName')) || null,
        receiptState: str(receipt ? receipt.state : row?.receiptState) || null,
        receiptDoneAt: str(receipt ? receipt.doneAt : row?.receiptDoneAt) || null,
        receiptItemCount: Array.isArray(parsedItems) ? parsedItems.length : (typeof row?.receiptItemCount === 'number' ? row.receiptItemCount : null),
        deliveries: deliveriesOf(d?.internalDeliveries ? d.internalDeliveries.list : row?.deliveries),
    };
};

type DocGroup = 'estimate' | 'invoice' | 'change_order' | 'po' | 'other';
const docGroup = (type: unknown): DocGroup => {
    const t = norm(type).replace(/[_-]+/g, ' ');
    if (t === 'estimate') return 'estimate';
    if (t === 'invoice') return 'invoice';
    if (t === 'change order') return 'change_order';
    if (t === 'purchase order') return 'po';
    return 'other';
};

/** "Invoice INV-1042", "Change order CO-3", "PO-12", or the title / type. */
export const docLabel = (d: Pick<DocInput, 'type' | 'number' | 'title'>): string => {
    const type = str(d.type) || 'Document';
    const sentence = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    const num = str(d.number);
    if (docGroup(type) === 'po') return num ? (/^po\b|^po-/i.test(num) ? num : `PO ${num}`) : clip(d.title, 40) || 'Purchase order';
    if (num) return `${sentence} ${num}`;
    return clip(d.title, 40) || sentence;
};

/** App route of a document (the form loads the full document itself). */
export const docPath = (d: Pick<DocInput, 'id' | 'jobId' | 'type'>): string =>
    d.jobId ? `/jobs/${d.jobId}/forms/${encodeURIComponent(str(d.type) || 'Document')}/${d.id}` : '/dashboard';

/** The option the client picked when signing (stored choice, else the "(chose B: Better)" tag in the signer name). */
const chosenOption = (d: DocInput): string => {
    let stored: any = d.clientOptionChoice;
    if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch { stored = null; } }
    const name = stored && typeof stored === 'object' ? str(stored.optionName) : '';
    if (name) return clip(name, 30);
    const tag = parseSignerChoice(d.clientSignedBy);
    return tag ? clip(tag.name || `option ${tag.letter}`, 30) : '';
};

const signerOf = (d: DocInput, fallback: string): string =>
    clip(plainSignerName(d.clientSignedBy) || d.clientSignerName || d.clientName || fallback, 40);

/**
 * Client decisions, "I've paid" reports, overdue invoices, estimates about to expire and purchase-order events.
 * `jobNames` adds the job as the second line.
 */
export const deriveDocNotifications = (docs: readonly DocInput[], ctx: DeriveContext, jobNames?: ReadonlyMap<string, string>): AppNotification[] => {
    const out: AppNotification[] = [];
    const today = todayOf(ctx.now);
    for (const d of docs) {
        if (!d || !d.id) continue;
        if (d.userId && d.userId !== ctx.uid) continue;
        const group = docGroup(d.type);
        const label = docLabel(d);
        const target: NotificationTarget = { kind: 'path', path: docPath(d) };
        const job = d.jobId ? str(jobNames?.get(d.jobId)) : '';
        const viewed = flag(d.viewedByProvider);
        const status = norm(d.status);

        const signedAt = instant(d.clientSignedAt);
        if (signedAt) {
            if (group === 'po') {
                const who = clip(d.vendorName || plainSignerName(d.clientSignedBy) || 'Your supplier', 40);
                out.push({ id: `po-confirmed:${d.id}:${signedAt}`, kind: 'po_confirmed', text: `${who} confirmed ${label}`, detail: job || undefined, at: ms(signedAt), target, actor: who, sourceRead: viewed });
            } else {
                const who = signerOf(d, 'Your client');
                const choice = group === 'estimate' ? chosenOption(d) : '';
                const verb = group === 'change_order' ? 'approved' : 'signed';
                out.push({
                    id: `signed:${d.id}:${signedAt}`, kind: 'doc_signed',
                    text: `${who} ${verb} ${label}${choice ? ` and chose ${choice}` : ''}`,
                    detail: job || undefined, at: ms(signedAt), target, actor: who, sourceRead: viewed,
                });
            }
        }

        const declinedAt = instant(d.clientDeclinedAt);
        if (declinedAt) {
            const reason = clip(d.clientDeclineReason, 90);
            if (group === 'po') {
                const who = clip(d.vendorName || 'Your supplier', 40);
                out.push({ id: `po-cant-fill:${d.id}:${declinedAt}`, kind: 'po_cant_fill', text: `${who} can’t fill ${label}`, detail: reason || job || undefined, at: ms(declinedAt), target, actor: who, sourceRead: viewed });
            } else {
                const who = clip(d.clientSignerName || d.clientName || 'Your client', 40);
                out.push({ id: `declined:${d.id}:${declinedAt}`, kind: 'doc_declined', text: `${who} declined ${label}`, detail: reason ? `“${reason}”` : job || undefined, at: ms(declinedAt), target, actor: who, sourceRead: viewed });
            }
        }

        const reportedAt = instant(d.paymentReportedAt);
        if (reportedAt && group === 'invoice' && isPayableStatus(d.status)) {
            const who = clip(d.clientName || 'Your client', 40);
            const amount = toNumber(d.paymentReportAmount);
            out.push({
                id: `paid-report:${d.id}:${reportedAt}`, kind: 'payment_reported',
                text: `${who} says they paid ${label}${amount > 0 ? ` (${money(amount)})` : ''}`,
                detail: clip(d.paymentReportNote, 90) || job || undefined, at: ms(reportedAt), target, actor: who,
            });
        }

        // overdue: a sent invoice past its due date (not when the client already says they paid)
        if (group === 'invoice' && (status === 'sent' || status === 'overdue') && !reportedAt) {
            const due = normalizeYMD(d.dueDate);
            if (due && due < today) {
                const days = daysBetween(parseLocalDate(due)!, parseLocalDate(today)!);
                const client = clip(d.clientName, 40);
                out.push({
                    id: `overdue:${d.id}:${due}`, kind: 'invoice_overdue',
                    text: `${label}${client ? ` for ${client}` : ''} is ${plural(days, 'day')} overdue`,
                    detail: job || undefined, at: dayStart(due, 1), target,
                });
            }
        }

        // expiring: a sent estimate nobody answered yet, expiring within EXPIRING_DAYS days
        if (group === 'estimate' && status === 'sent' && !signedAt && !declinedAt) {
            const exp = normalizeYMD(d.expiryDate);
            if (exp && exp >= today) {
                const left = daysBetween(parseLocalDate(today)!, parseLocalDate(exp)!);
                if (left <= EXPIRING_DAYS) {
                    const client = clip(d.clientName, 40);
                    const when = left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
                    const at = Math.min(ctx.now, Math.max(dayStart(exp, -EXPIRING_DAYS), ms(d.createdAt)));
                    out.push({ id: `expiring:${d.id}:${exp}`, kind: 'estimate_expiring', text: `${label}${client ? ` for ${client}` : ''} expires ${when}`, detail: job || undefined, at, target });
                }
            }
        }

        // purchase order received into stock (Mark received finished)
        if (group === 'po' && norm(d.receiptState) === 'done') {
            const doneAt = instant(d.receiptDoneAt);
            if (doneAt) {
                const n = d.receiptItemCount ?? 0;
                const vendor = clip(d.vendorName, 40);
                out.push({
                    id: `po-received:${d.id}:${doneAt}`, kind: 'po_received',
                    text: `${label}${vendor ? ` from ${vendor}` : ''} received${n > 0 ? `: ${plural(n, 'item')} added to stock` : ''}`,
                    detail: job || undefined, at: ms(doneAt), target,
                });
            }
        }
        // a delivery recorded on a purchase order (Record delivery finished)
        if (group === 'po' && d.deliveries?.length) {
            const vendor = clip(d.vendorName, 40);
            for (const dl of d.deliveries) {
                const doneAt = instant(dl.doneAt);
                if (!doneAt) continue;
                out.push({
                    id: `po-delivery:${d.id}:${dl.id}`, kind: 'po_received',
                    text: `${label}${vendor ? ` from ${vendor}` : ''}: delivery recorded${dl.itemCount > 0 ? `, ${plural(dl.itemCount, 'item')} added to stock` : ''}`,
                    detail: job || undefined, at: ms(doneAt), target,
                });
            }
        }
    }
    return out;
};

// =====================================================================================================================
// Inventory
// =====================================================================================================================
export interface StockInput {
    id: string;
    user_id?: string | null;
    name?: string | null;
    quantity?: number | string | null;
    low_stock_threshold?: number | string | null;
    unit?: string | null;
    is_assembly?: boolean | null;
}

const qtyText = (q: number, unit: unknown): string => {
    const n = Math.round(q * 1000) / 1000;
    const u = str(unit);
    return u && u !== 'pcs' ? `${n} ${u}` : `${n}`;
};

/**
 * Low / out-of-stock items (same rule as the Tools badge: kits are left out). `resolvedIds`: ids of items back in
 * stock, so a new low-stock episode notifies again.
 */
export const deriveStockNotifications = (items: readonly StockInput[], ctx: DeriveContext): { items: AppNotification[]; resolvedIds: string[] } => {
    const out: AppNotification[] = [];
    const resolvedIds: string[] = [];
    for (const item of items) {
        if (!item || !item.id || item.is_assembly) continue;
        if (item.user_id && item.user_id !== ctx.uid) continue;
        const status = stockStatus(item);
        const low = `stock:${item.id}:low`;
        const empty = `stock:${item.id}:out`;
        const target: NotificationTarget = { kind: 'inventory', itemId: String(item.id) };
        const name = clip(item.name || 'An item', 40);
        if (status === 'ok') { resolvedIds.push(low, empty); continue; }
        if (status === 'low') {
            resolvedIds.push(empty);
            out.push({ id: low, kind: 'stock_low', text: `${name} is running low: ${qtyText(toNumber(item.quantity), item.unit)} left`, at: 0, condition: true, target });
        } else {
            resolvedIds.push(low);
            out.push({ id: empty, kind: 'stock_out', text: `${name} is out of stock`, at: 0, condition: true, target });
        }
    }
    return { items: out, resolvedIds };
};

// =====================================================================================================================
// Quote requests
// =====================================================================================================================
export interface RequestInput {
    id: string;
    name?: string | null;
    details?: string | null;
    /** 'new' | 'seen' | 'converted' | 'archived' */
    status?: string | null;
    createdAt?: string | null;
    photoCount?: number;
}

/** New quote requests (read once opened: status seen / converted). Archived ones are left out. */
export const deriveRequestNotifications = (requests: readonly RequestInput[]): AppNotification[] => {
    const out: AppNotification[] = [];
    for (const r of requests) {
        if (!r || !r.id || norm(r.status) === 'archived') continue;
        const at = ms(r.createdAt);
        if (!at) continue;
        const name = clip(r.name || 'Someone', 40);
        const photos = r.photoCount ? plural(r.photoCount, 'photo') : '';
        const detail = [clip(r.details, 80), photos].filter(Boolean).join(' · ');
        out.push({
            id: `request:${r.id}`, kind: 'quote_request', text: `New quote request from ${name}`, detail: detail || undefined, at,
            target: { kind: 'request', requestId: r.id }, actor: name, sourceRead: norm(r.status) !== 'new',
        });
    }
    return out;
};

// =====================================================================================================================
// Community (public.notifications rows + replies in threads the user joined)
// =====================================================================================================================
export interface ForumRowInput {
    id: string;
    user_id?: string | null;
    source_user_id?: string | null;
    /** 'like' | 'comment' | 'comment_like' */
    type: string;
    post_id?: string | null;
    comment_id?: string | null;
    is_read?: boolean | null;
    created_at: string;
}

export interface ForumLookups {
    /** user id → display name */
    authors: Record<string, string>;
    /** post id → title */
    postTitles: Record<string, string>;
    /** comment id → text */
    comments: Record<string, string>;
}

const postPath = (postId: string | null | undefined) => (postId ? `/forum/${postId}` : '/forum');

/**
 * Likes on a post (and on a comment) are grouped into one line per post / comment ("Alex and 2 others liked…"); the
 * id changes with the newest like, so a new like is unread again. Each comment is its own line.
 */
export const deriveForumNotifications = (rows: readonly ForumRowInput[], lookups: ForumLookups, ctx: DeriveContext): AppNotification[] => {
    const out: AppNotification[] = [];
    const mine = rows
        .filter(r => r && r.id && (!r.user_id || r.user_id === ctx.uid) && r.source_user_id !== ctx.uid && ms(r.created_at))
        .slice()
        .sort((a, b) => ms(b.created_at) - ms(a.created_at) || String(a.id).localeCompare(String(b.id)));
    const author = (id: string | null | undefined) => clip((id && lookups.authors[id]) || 'A member', 32);
    const groups = new Map<string, ForumRowInput[]>();
    for (const r of mine) {
        const t = norm(r.type);
        if (t === 'comment') {
            const who = author(r.source_user_id);
            const snippet = r.comment_id ? clip(lookups.comments[r.comment_id], 90) : '';
            out.push({
                id: `forum:comment:${r.id}`, kind: 'forum_comment', text: `${who} commented on ${quoted(r.post_id ? lookups.postTitles[r.post_id] : '')}`,
                detail: snippet ? `“${snippet}”` : undefined, at: ms(r.created_at), target: { kind: 'path', path: postPath(r.post_id) }, actor: who,
                sourceRead: !!r.is_read, forumIds: [r.id],
            });
            continue;
        }
        const key = t === 'comment_like' ? `comment_like:${r.comment_id || r.id}` : `${t === 'like' ? 'like' : `other-${t}`}:${r.post_id || r.id}`;
        groups.set(key, [...(groups.get(key) || []), r]);
    }
    for (const [key, list] of groups) {
        const latest = list[0];
        const who = namesText(list.map(r => author(r.source_user_id)));
        const title = quoted(latest.post_id ? lookups.postTitles[latest.post_id] : '');
        const isCommentLike = key.startsWith('comment_like:');
        const isLike = key.startsWith('like:');
        const snippet = isCommentLike && latest.comment_id ? clip(lookups.comments[latest.comment_id], 90) : '';
        out.push({
            id: `forum:${key}:${latest.id}`,
            kind: isCommentLike ? 'forum_comment_like' : 'forum_like',
            text: isCommentLike ? `${who} liked your comment on ${title}` : isLike ? `${who} liked your post ${title}` : `${who} reacted to your post ${title}`,
            detail: snippet ? `“${snippet}”` : undefined,
            at: ms(latest.created_at),
            target: { kind: 'path', path: postPath(latest.post_id) },
            actor: author(latest.source_user_id),
            sourceRead: list.every(r => !!r.is_read),
            forumIds: list.map(r => r.id),
        });
    }
    return out;
};

export interface ForumCommentInput {
    id: string;
    post_id: string;
    user_id: string;
    content?: string | null;
    created_at: string;
}

/**
 * Replies in threads the user joined (posts of other people the user commented on): one line per post, from the
 * user's first comment there. The database only notifies post authors, so this is derived from the comments.
 */
export const deriveThreadReplies = (
    input: { myComments: readonly Pick<ForumCommentInput, 'post_id' | 'created_at'>[]; otherComments: readonly ForumCommentInput[]; posts: Record<string, { title?: string | null; user_id?: string | null }> },
    lookups: ForumLookups,
    ctx: DeriveContext,
): AppNotification[] => {
    const firstMine = new Map<string, number>();
    for (const c of input.myComments) {
        const t = ms(c.created_at);
        if (!c.post_id || !t) continue;
        firstMine.set(c.post_id, Math.min(firstMine.get(c.post_id) ?? Infinity, t));
    }
    const byPost = new Map<string, ForumCommentInput[]>();
    for (const c of input.otherComments) {
        if (!c || !c.post_id || c.user_id === ctx.uid) continue;
        const since = firstMine.get(c.post_id);
        const post = input.posts[c.post_id];
        if (since === undefined || !post || post.user_id === ctx.uid) continue; // own posts: the database notifies those
        if (ms(c.created_at) <= since) continue;
        byPost.set(c.post_id, [...(byPost.get(c.post_id) || []), c]);
    }
    const out: AppNotification[] = [];
    for (const [postId, list] of byPost) {
        list.sort((a, b) => ms(b.created_at) - ms(a.created_at) || a.id.localeCompare(b.id));
        const latest = list[0];
        const names = list.map(c => clip(lookups.authors[c.user_id] || 'A member', 32));
        const snippet = clip(latest.content, 90);
        out.push({
            id: `forum:reply:${postId}:${latest.id}`, kind: 'forum_reply',
            text: `${namesText(names)} replied in ${quoted(input.posts[postId]?.title || lookups.postTitles[postId])}`,
            detail: snippet ? `“${snippet}”` : undefined, at: ms(latest.created_at), target: { kind: 'path', path: postPath(postId) }, actor: names[0],
        });
    }
    return out;
};

// =====================================================================================================================
// Automatic reminders + Gmail
// =====================================================================================================================
export interface ReminderInput {
    id: string;
    user_id?: string | null;
    kind?: string | null;
    document_id?: string | null;
    job_id?: string | null;
    /** sending | sent | failed | skipped */
    status: string;
    reason?: string | null;
    to_email?: string | null;
    sent_at?: string | null;
    created_at: string;
    /** "Invoice INV-1042" (from the document), else the job name */
    label?: string | null;
    /** route of the document / job, when known */
    path?: string | null;
}

export interface GmailAccountInput {
    id: string;
    user_id?: string | null;
    gmail_address?: string | null;
    status?: string | null;
    updated_at?: string | null;
}

const reasonText = (reason: unknown): string => {
    const r = str(reason);
    const label = REASON_LABELS[r] || 'something went wrong';
    return label.charAt(0).toLowerCase() + label.slice(1);
};

const listText = (labels: string[]): string => {
    const unique = Array.from(new Set(labels.filter(Boolean)));
    if (unique.length <= 3) return unique.join(', ');
    return `${unique.slice(0, 3).join(', ')} and ${unique.length - 3} more`;
};

/**
 * Reminders that went out (one line per day) and reminders that couldn't be sent (one line per day and reason).
 * Skips the user chose ("Skip") are not news. A failure because Gmail needs reconnecting is hidden while the Gmail
 * line is shown (suppressedBy).
 */
export const deriveReminderNotifications = (records: readonly ReminderInput[], ctx: DeriveContext): AppNotification[] => {
    const sent = new Map<string, ReminderInput[]>();
    const failed = new Map<string, ReminderInput[]>();
    for (const r of records) {
        if (!r || !r.id || (r.user_id && r.user_id !== ctx.uid)) continue;
        const status = norm(r.status);
        const at = ms(r.sent_at) || ms(r.created_at);
        if (!at) continue;
        const day = toLocalYMD(new Date(at));
        if (status === 'sent') sent.set(day, [...(sent.get(day) || []), r]);
        else if (status === 'failed' || (status === 'skipped' && str(r.reason) !== 'skipped_by_user')) {
            const key = `${day}|${str(r.reason) || 'internal'}`;
            failed.set(key, [...(failed.get(key) || []), r]);
        }
    }
    const newestFirst = (a: ReminderInput, b: ReminderInput) => (ms(b.sent_at) || ms(b.created_at)) - (ms(a.sent_at) || ms(a.created_at)) || a.id.localeCompare(b.id);
    const labelOf = (r: ReminderInput) => clip(r.label || (norm(r.kind) === 'visit' ? 'Job visit' : norm(r.kind) === 'estimate' ? 'Estimate' : 'Invoice'), 40);
    const out: AppNotification[] = [];
    for (const [day, list] of sent) {
        list.sort(newestFirst);
        const latest = list[0];
        const at = ms(latest.sent_at) || ms(latest.created_at);
        if (list.length === 1) {
            const to = clip(latest.to_email, 40);
            out.push({
                id: `reminders-sent:${day}:1:${latest.id}`, kind: 'reminder_sent', text: `Reminder sent for ${labelOf(latest)}${to ? ` to ${to}` : ''}`, at,
                target: { kind: 'path', path: latest.path || '/communication' },
            });
        } else {
            out.push({
                id: `reminders-sent:${day}:${list.length}:${latest.id}`, kind: 'reminder_sent', text: `${list.length} reminders sent`, detail: listText(list.map(labelOf)), at,
                target: { kind: 'path', path: '/communication' },
            });
        }
    }
    for (const [key, list] of failed) {
        list.sort(newestFirst);
        const latest = list[0];
        const reason = str(latest.reason);
        const at = ms(latest.sent_at) || ms(latest.created_at);
        const gmailProblem = /^gmail|^no_gmail|^refresh_failed/.test(reason);
        const single = list.length === 1;
        out.push({
            id: `reminders-failed:${key}:${list.length}:${latest.id}`, kind: 'reminder_failed',
            text: single ? `Reminder for ${labelOf(latest)} wasn’t sent: ${reasonText(reason)}` : `${list.length} reminders weren’t sent: ${reasonText(reason)}`,
            detail: single ? undefined : listText(list.map(labelOf)),
            at,
            target: { kind: 'path', path: !gmailProblem && single && latest.path ? latest.path : '/communication' },
            ...(reason === 'gmail_reconnect' ? { suppressedBy: 'gmail_reconnect' as NotificationKind } : {}),
        });
    }
    return out;
};

/** A connected Gmail account that needs to be reconnected (sending and reminders stop until then). */
export const deriveGmailNotifications = (accounts: readonly GmailAccountInput[], ctx: DeriveContext): AppNotification[] =>
    accounts
        .filter(a => a && a.id && (!a.user_id || a.user_id === ctx.uid) && norm(a.status) === 'needs_reconnect')
        .map(a => {
            const changed = instant(a.updated_at);
            return {
                id: `gmail:${a.id}:${changed}`, kind: 'gmail_reconnect' as const,
                text: `Gmail${a.gmail_address ? ` (${clip(a.gmail_address, 40)})` : ''} needs to be reconnected`,
                detail: 'Emails and automatic reminders can’t be sent until you reconnect it.',
                at: changed ? ms(changed) : 0, condition: !changed, target: { kind: 'path', path: '/communication' } as NotificationTarget,
            };
        });

// =====================================================================================================================
// Crew clock-in: missed clock-outs (lib/crew/crewApi.ts fetchMissedClockOuts)
// =====================================================================================================================
export interface CrewMissedInput {
    /** the clock-in punch of the open shift (one notification per shift) */
    punchId: string;
    memberName?: string | null;
    jobName?: string | null;
    /** clock-in time (ISO) */
    since: string;
    /** when it became a missed clock-out (ISO) */
    overdueAt?: string | null;
}

/** "Maria is still clocked in": one per open shift; it goes away by itself once the shift is closed. */
export const deriveCrewNotifications = (items: readonly CrewMissedInput[], ctx: DeriveContext): AppNotification[] => {
    const out: AppNotification[] = [];
    for (const it of items) {
        if (!it || !it.punchId) continue;
        const since = ms(it.since);
        if (!since) continue;
        const at = Math.min(ms(it.overdueAt) || since, ctx.now);
        const name = clip(it.memberName || 'A crew member', 40);
        const when = new Date(since);
        const h = when.getHours();
        const time = `${h % 12 || 12}:${String(when.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
        const sameDay = new Date(ctx.now).toDateString() === when.toDateString();
        out.push({
            id: `crew_out:${it.punchId}`, kind: 'crew_missed_out', text: `${name} didn’t clock out`,
            detail: `Clocked in${it.jobName ? ` at ${clip(it.jobName, 40)}` : ''} ${sameDay ? 'at' : `${when.toLocaleDateString('en-US', { weekday: 'short' })}`} ${time}. Add the clock-out in Crew hours.`,
            at, target: { kind: 'path', path: '/crew' }, actor: name,
        });
    }
    return out;
};

// =====================================================================================================================
// Offline outbox
// =====================================================================================================================
export interface OutboxInput {
    docId: string;
    userId?: string | null;
    jobId?: string | null;
    type: string;
    /** pending | failed | blocked */
    status: string;
    error?: { kind?: string; message?: string; at?: string } | null;
    data?: Record<string, unknown> | null;
}

/** Documents saved offline that the account refused (failed / blocked). Pending ones are the sync bar's job. */
export const deriveOutboxNotifications = (items: readonly OutboxInput[], ctx: DeriveContext): AppNotification[] => {
    const out: AppNotification[] = [];
    for (const it of items) {
        if (!it || !it.docId || (it.userId && it.userId !== ctx.uid)) continue;
        const status = norm(it.status);
        if (status !== 'failed' && status !== 'blocked') continue;
        const errAt = instant(it.error?.at);
        const doc = docInputOf({ id: it.docId, type: it.type, data: it.data || {} });
        out.push({
            id: `sync:${it.docId}:${errAt}`, kind: 'sync_failed', text: `${docLabel(doc)} couldn’t be saved to your account`,
            detail: clip(it.error?.message, 110) || undefined, at: errAt ? ms(errAt) : 0, condition: !errAt, target: { kind: 'outbox' },
        });
    }
    return out;
};

// =====================================================================================================================
// Plan limits
// =====================================================================================================================
export interface UsageInput {
    tier?: string | null;
    jobsThisMonth: number;
    clientsThisMonth: number;
    emailsThisMonth: number;
    aiThisMonth: number;
    limits: { jobs: number | null; clients: number | null; docs: number | null; emails: number | null; ai: number | null };
    /** only the server's numbers count (local counts are for display) */
    fromServer: boolean;
    monthStart?: string | null;
}

/**
 * A monthly limit reached (only from the server's usage numbers, like the app's own checks). One line per limit
 * and month; documents per job: one line per full job (at most 5).
 */
export const deriveLimitNotifications = (
    usage: UsageInput | null | undefined,
    docUsage: Readonly<Record<string, number>> | null | undefined,
    ctx: DeriveContext,
    jobNames?: ReadonlyMap<string, string>,
): AppNotification[] => {
    if (!usage || !usage.fromServer) return [];
    const month = (normalizeYMD(str(usage.monthStart).slice(0, 10)) || todayOf(ctx.now)).slice(0, 7) || monthOf(ctx.now);
    const target: NotificationTarget = { kind: 'path', path: '/settings#billing' };
    const out: AppNotification[] = [];
    const add = (kind: string, used: number, limit: number | null, text: string, detail: string) => {
        if (limit === null || limit === undefined || !(limit > 0) || used < limit) return;
        out.push({ id: `limit:${kind}:${month}`, kind: 'plan_limit', text, detail, at: 0, condition: true, target });
    };
    const l = usage.limits;
    add('jobs', usage.jobsThisMonth, l.jobs, `You’ve used all ${l.jobs} new jobs for this month`, 'Upgrade for unlimited jobs, or wait for next month.');
    add('clients', usage.clientsThisMonth, l.clients, `You’ve added ${l.clients} new clients this month, your plan’s limit`, 'Upgrade for unlimited clients, or wait for next month.');
    add('emails', usage.emailsThisMonth, l.emails, `You’ve sent all ${l.emails} emails for this month`, 'Emails and reminders can’t go out until next month, or upgrade.');
    add('ai', usage.aiThisMonth, l.ai, `You’ve used all ${l.ai} AI requests for this month`, 'The assistant is back next month, or upgrade for more.');
    if (l.docs && l.docs > 0 && docUsage) {
        const full = Object.entries(docUsage).filter(([, n]) => Number(n) >= (l.docs as number)).map(([jobId]) => jobId).sort().slice(0, 5);
        for (const jobId of full) {
            const name = clip(jobNames?.get(jobId) || 'A job', 40);
            out.push({
                id: `limit:docs:${jobId}:${month}`, kind: 'plan_limit', text: `${name} has used its ${l.docs} new documents for this month`,
                detail: 'Upgrade for unlimited documents, or wait for next month.', at: 0, condition: true, target,
            });
        }
    }
    return out;
};

// =====================================================================================================================
// Field features: punch list answers from the client, papers about to expire, service plan visits
// =====================================================================================================================
export interface PunchFeedbackInput {
    id: string;
    jobId: string;
    title: string;
    status: string;
    verifiedBy?: string | null;
    verifiedAt?: string | null;
    clientNote?: string | null;
    clientNoteAt?: string | null;
}

/** The client marked a punch item "Looks good", or sent it back with a note (still open). */
export const derivePunchNotifications = (rows: readonly PunchFeedbackInput[], jobNames?: ReadonlyMap<string, string>): AppNotification[] => {
    const out: AppNotification[] = [];
    for (const r of rows) {
        if (!r || !r.id) continue;
        const job = clip(jobNames?.get(r.jobId) || '', 40) || undefined;
        const target: NotificationTarget = { kind: 'path', path: r.jobId ? `/jobs/${r.jobId}#punch` : '/dashboard' };
        const okAt = instant(r.verifiedAt);
        if (norm(r.status) === 'verified' && norm(r.verifiedBy) === 'client' && okAt) {
            out.push({ id: `punch:${r.id}:ok:${okAt}`, kind: 'punch_ok', text: `Client approved “${clip(r.title, 48)}”`, detail: job, at: ms(okAt), target });
        }
        const noteAt = instant(r.clientNoteAt);
        if (norm(r.status) === 'open' && noteAt && str(r.clientNote)) {
            out.push({ id: `punch:${r.id}:work:${noteAt}`, kind: 'punch_needs_work', text: `Client sent back “${clip(r.title, 48)}”`, detail: clip(r.clientNote, 110), at: ms(noteAt), target });
        }
    }
    return out;
};

export interface PaperInput {
    id: string;
    userId?: string | null;
    title: string;
    kind: string;
    /** YYYY-MM-DD */
    expiresOn?: string | null;
    /** reminder steps (days before expiry), as saved on the paper */
    offsets?: number[] | null;
    remind?: boolean | null;
}

/**
 * Papers about to expire: one item at each reminder step (30, 7, 1 days before, as set on the paper), so the bell
 * says it again when it gets closer; and one once it has expired. Times are the step days (local midnight).
 */
export const derivePaperNotifications = (papers: readonly PaperInput[], ctx: DeriveContext): AppNotification[] => {
    const today = todayOf(ctx.now);
    const out: AppNotification[] = [];
    for (const p of papers) {
        if (!p || !p.id || (p.userId && p.userId !== ctx.uid)) continue;
        const exp = normalizeYMD(str(p.expiresOn));
        if (!exp) continue;
        const { state, days } = expiryState(exp, today);
        const name = clip(p.title || paperKindLabel(p.kind), 48);
        const target: NotificationTarget = { kind: 'path', path: '/papers' };
        if (state === 'expired') {
            out.push({ id: `paper:${p.id}:expired:${exp}`, kind: 'paper_expired', text: `${name} has expired`, detail: `Expired on ${exp}. Upload the renewed one.`, at: dayStart(exp, 1), target });
            continue;
        }
        if (p.remind === false) continue;
        const step = paperReminderSteps(exp, p.offsets ?? PAPER_REMINDER_OFFSETS).filter(s => s.date <= today).pop();
        if (!step || days === null) continue;
        out.push({ id: `paper:${p.id}:${exp}:-${step.offset}`, kind: 'paper_expiring', text: `${name} ${expiryPhrase(days)}`, detail: `Expires ${exp}. Renew it and upload the new copy.`, at: dayStart(step.date), target });
    }
    return out;
};

export interface ServiceVisitInput {
    id: string;
    jobId?: string | null;
    planName: string;
    clientName?: string | null;
    /** YYYY-MM-DD */
    scheduledFor: string;
    status: string;
}

/** Service plan visits in the next 2 days that are still scheduled (one item per visit). */
export const deriveServiceVisitNotifications = (visits: readonly ServiceVisitInput[], ctx: DeriveContext): AppNotification[] => {
    const today = todayOf(ctx.now);
    const out: AppNotification[] = [];
    for (const v of visits) {
        if (!v || !v.id || norm(v.status) !== 'scheduled') continue;
        const day = normalizeYMD(str(v.scheduledFor));
        if (!day || day < today) continue;
        const d = parseLocalDate(day);
        const t = parseLocalDate(today);
        const inDays = d && t ? daysBetween(t, d) : 99;
        if (inDays > 2) continue;
        const when = inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `on ${day}`;
        out.push({
            id: `visit:${v.id}:${day}`, kind: 'service_visit', text: `Service visit ${when}: ${clip(v.planName, 40)}`, detail: clip(v.clientName, 60) || undefined,
            at: dayStart(day, -2), target: { kind: 'path', path: v.jobId ? `/jobs/${v.jobId}` : '/service-plans' },
        });
    }
    return out;
};

// =====================================================================================================================
// Account state: read / dismissed (user_settings 'notifications.state')
// =====================================================================================================================
export interface NotificationState {
    v: 1;
    /** "Mark all read" (epoch seconds): anything up to then is read */
    clearedAt: number;
    /** notificationKey → when it was read (epoch seconds) */
    read: Record<string, number>;
    /** notificationKey → when it was removed from the list (epoch seconds) */
    dismissed: Record<string, number>;
}

export const emptyState = (): NotificationState => ({ v: 1, clearedAt: 0, read: {}, dismissed: {} });

const KEY_RE = /^[a-z0-9]{1,16}$/;
const sec = (msTime: number) => Math.floor(msTime / 1000);
const validTime = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 && n < 1e11 ? Math.floor(n) : null;
};
const parseMap = (raw: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const t = validTime(v);
        if (KEY_RE.test(k) && t !== null) out[k] = t;
    }
    return out;
};

/** Account / device value → state (anything odd is dropped, never throws). */
export const parseState = (raw: unknown): NotificationState => {
    let v: unknown = raw;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return emptyState();
    const r = v as Record<string, unknown>;
    return { v: 1, clearedAt: validTime(r.clearedAt) ?? 0, read: parseMap(r.read), dismissed: parseMap(r.dismissed) };
};

const newest = (map: Record<string, number>, cutoff: number, max: number): Record<string, number> =>
    Object.fromEntries(
        Object.entries(map)
            .filter(([, t]) => t >= cutoff)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, max),
    );

/**
 * Keeps the state bounded: entries older than WINDOW_DAYS go, then the newest MAX_STATE_IDS per list, then the
 * oldest until the JSON fits STATE_MAX_CHARS.
 */
export const pruneState = (state: NotificationState, nowMs: number): NotificationState => {
    const cutoff = sec(nowMs - WINDOW_DAYS * DAY_MS);
    let next: NotificationState = {
        v: 1,
        clearedAt: state.clearedAt >= cutoff ? state.clearedAt : 0,
        read: newest(state.read, cutoff, MAX_STATE_IDS),
        dismissed: newest(state.dismissed, cutoff, MAX_STATE_IDS),
    };
    let max = MAX_STATE_IDS;
    while (JSON.stringify(next).length > STATE_MAX_CHARS && max > 10) {
        max = Math.floor(max * 0.8);
        next = { ...next, read: newest(next.read, cutoff, max), dismissed: newest(next.dismissed, cutoff, max) };
    }
    return next;
};

const withKeys = (map: Record<string, number>, ids: readonly string[], t: number): Record<string, number> => {
    const next = { ...map };
    for (const id of ids) {
        const k = notificationKey(id);
        next[k] = Math.max(next[k] ?? 0, t);
    }
    return next;
};

export const markRead = (state: NotificationState, ids: readonly string[], nowMs: number): NotificationState =>
    pruneState({ ...state, read: withKeys(state.read, ids, sec(nowMs)) }, nowMs);

/** "Mark all read": everything up to now, plus the ids on screen (condition items keep their own first-seen time). */
export const markAllRead = (state: NotificationState, ids: readonly string[], nowMs: number): NotificationState =>
    pruneState({ ...state, clearedAt: Math.max(state.clearedAt, sec(nowMs)), read: withKeys(state.read, ids, sec(nowMs)) }, nowMs);

/** Removes items from the list (they count as read too). */
export const dismiss = (state: NotificationState, ids: readonly string[], nowMs: number): NotificationState =>
    pruneState({ ...state, read: withKeys(state.read, ids, sec(nowMs)), dismissed: withKeys(state.dismissed, ids, sec(nowMs)) }, nowMs);

/** Forgets ids whose condition is over (stock back to normal), so the next episode is new again. */
export const forget = (state: NotificationState, ids: readonly string[]): NotificationState => {
    if (!ids.length) return state;
    const keys = new Set(ids.map(notificationKey));
    const hit = (m: Record<string, number>) => Object.keys(m).some(k => keys.has(k));
    if (!hit(state.read) && !hit(state.dismissed)) return state;
    const drop = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([k]) => !keys.has(k)));
    return { ...state, read: drop(state.read), dismissed: drop(state.dismissed) };
};

/** Two devices' states together (union, newest times): nothing read on one device is ever lost. */
export const mergeStates = (a: NotificationState, b: NotificationState, nowMs: number): NotificationState => {
    const union = (x: Record<string, number>, y: Record<string, number>) => {
        const out = { ...x };
        for (const [k, t] of Object.entries(y)) out[k] = Math.max(out[k] ?? 0, t);
        return out;
    };
    return pruneState({ v: 1, clearedAt: Math.max(a.clearedAt, b.clearedAt), read: union(a.read, b.read), dismissed: union(a.dismissed, b.dismissed) }, nowMs);
};

export const sameState = (a: NotificationState, b: NotificationState): boolean => JSON.stringify(a) === JSON.stringify(b);

// =====================================================================================================================
// Preferences (user_settings 'notifications.prefs'); pop-ups are per device
// =====================================================================================================================
export interface NotificationPrefs {
    v: 1;
    /** categories switched off (not shown, not counted, no pop-up) */
    off: NotificationCategory[];
    /** no pop-ups; the bell shows a dot instead of a number */
    quiet: boolean;
    /** when the user last changed them (epoch ms): the newest copy wins between devices */
    at: number;
}

export const defaultPrefs = (): NotificationPrefs => ({ v: 1, off: [], quiet: false, at: 0 });

export const parsePrefs = (raw: unknown): NotificationPrefs => {
    let v: unknown = raw;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return defaultPrefs();
    const r = v as Record<string, unknown>;
    const off = Array.isArray(r.off) ? Array.from(new Set(r.off.filter((c): c is NotificationCategory => (CATEGORY_IDS as readonly string[]).includes(c as string)))) : [];
    const at = typeof r.at === 'number' && Number.isFinite(r.at) && r.at > 0 ? r.at : 0;
    return { v: 1, off, quiet: r.quiet === true, at };
};

export const setCategory = (prefs: NotificationPrefs, category: NotificationCategory, on: boolean, nowMs: number): NotificationPrefs => {
    const off = prefs.off.filter(c => c !== category);
    if (!on) off.push(category);
    return { ...prefs, off: CATEGORY_IDS.filter(c => off.includes(c)), at: nowMs };
};

export const isCategoryOn = (prefs: NotificationPrefs, category: NotificationCategory): boolean => !prefs.off.includes(category);

/** The newer of two copies (device vs account). */
export const newerPrefs = (a: NotificationPrefs, b: NotificationPrefs): NotificationPrefs => (b.at > a.at ? b : a);

/** Device-only: first time a condition item was seen here (key → epoch seconds), bounded like the state. */
export type SeenMap = Record<string, number>;

export const parseSeen = (raw: unknown): SeenMap => {
    if (typeof raw !== 'string') return parseMap(raw);
    try { return parseMap(JSON.parse(raw)); } catch { return {}; }
};

// =====================================================================================================================
// Building the list
// =====================================================================================================================
export interface BuildInput {
    now: number;
    items: readonly AppNotification[];
    state: NotificationState;
    prefs: NotificationPrefs;
    /** device first-seen times of condition items */
    seen: SeenMap;
}

export interface BuildResult {
    list: ShownNotification[];
    unread: number;
    /** updated first-seen map (new condition items get "now") */
    seen: SeenMap;
    /** true when `seen` changed */
    seenChanged: boolean;
}

/** One item per id: the first one wins, read-by-source from any copy, missing text filled in. */
export const dedupe = (items: readonly AppNotification[]): AppNotification[] => {
    const byId = new Map<string, AppNotification>();
    for (const n of items) {
        if (!n || !n.id) continue;
        const prev = byId.get(n.id);
        if (!prev) { byId.set(n.id, n); continue; }
        byId.set(n.id, {
            ...prev,
            detail: prev.detail || n.detail,
            actor: prev.actor || n.actor,
            at: prev.at || n.at,
            sourceRead: !!(prev.sourceRead || n.sourceRead),
            forumIds: prev.forumIds || n.forumIds ? Array.from(new Set([...(prev.forumIds || []), ...(n.forumIds || [])])) : undefined,
        });
    }
    return [...byId.values()];
};

export const compareNotifications = (a: ShownNotification, b: ShownNotification): number =>
    b.at - a.at || TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.id.localeCompare(b.id);

/**
 * The bell's list: de-duplicated, times for condition items, the window, the user's categories, dismissed items out,
 * read flags, newest first, at most MAX_LIST.
 */
export const buildNotifications = (input: BuildInput): BuildResult => {
    const { now, state, prefs } = input;
    const unique = dedupe(input.items);
    const kinds = new Set(unique.map(n => n.kind));
    const seen: SeenMap = { ...input.seen };
    let seenChanged = false;
    const cutoff = now - WINDOW_DAYS * DAY_MS;
    const list: ShownNotification[] = [];
    for (const n of unique) {
        if (n.suppressedBy && kinds.has(n.suppressedBy)) continue;
        const key = notificationKey(n.id);
        let at = n.at;
        if (!at || n.condition) {
            if (!seen[key]) { seen[key] = sec(now); seenChanged = true; }
            at = n.at || seen[key] * 1000;
        }
        if (at < cutoff) continue;
        const meta = KIND_META[n.kind];
        if (!meta || !isCategoryOn(prefs, meta.category)) continue;
        if (state.dismissed[key] !== undefined) continue;
        const read = !!n.sourceRead || state.read[key] !== undefined || (state.clearedAt > 0 && at <= state.clearedAt * 1000);
        list.push({ ...n, at: Math.min(at, now), category: meta.category, tone: meta.tone, key, read });
    }
    list.sort(compareNotifications);
    const shown = list.slice(0, MAX_LIST);
    return { list: shown, unread: shown.filter(n => !n.read).length, seen: seenChanged ? pruneSeen(seen, now) : seen, seenChanged };
};

/** Forgets first-seen times of resolved conditions, and keeps the map bounded. */
export const pruneSeen = (seen: SeenMap, nowMs: number, forgetIds: readonly string[] = []): SeenMap => {
    const drop = new Set(forgetIds.map(notificationKey));
    const kept = Object.fromEntries(Object.entries(seen).filter(([k]) => !drop.has(k)));
    return newest(kept, sec(nowMs - WINDOW_DAYS * DAY_MS), MAX_STATE_IDS);
};

export { badgeText, groupByDay, timeLabel, type NotificationGroup } from './format.ts';

// =====================================================================================================================
// Browser pop-ups (Notification API, while the app is open; off by default)
// =====================================================================================================================
export interface PopOptions {
    /** the user switched pop-ups on for this device */
    enabled: boolean;
    /** Notification.permission */
    permission: string;
    quiet: boolean;
    now: number;
}

/**
 * New unread items worth a pop-up: never seen in this session (`known`, filled with the first list after sign-in so
 * the backlog never pops), recent, newest first, at most POP_MAX.
 */
export const pickPopups = (list: readonly ShownNotification[], known: ReadonlySet<string>, opts: PopOptions): ShownNotification[] => {
    if (!opts.enabled || opts.quiet || opts.permission !== 'granted') return [];
    return list
        .filter(n => !n.read && !known.has(n.id) && opts.now - n.at <= POP_MAX_AGE_MS)
        .slice(0, POP_MAX);
};
