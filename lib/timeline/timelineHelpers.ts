/**
 * Job timeline: small pure helpers shared by the adapters (lib/timeline/sources/*) and the aggregator. No React, no
 * network. Time zones come from supabase/functions/reminders/shared/schedule.ts (the same helpers the reminders use).
 */
import { addDays, instantYmd, safeTimezone, toYmd, zonedNow } from '../../supabase/functions/reminders/shared/schedule.ts';
import { formatMoney } from '../../utils/money.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent, TimelineGroup, TimelineSource } from './timelineTypes.ts';

export { addDays, instantYmd, safeTimezone, toYmd, zonedNow };

export const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
export const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};
export const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
export const arr = <T = any>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// ------------------------------------------------------------------------------------------------ time
/** An ISO instant for a timestamp (ISO text or epoch ms), null when it is not a real time. */
export const isoOf = (value: unknown): string | null => {
    if (value === null || value === undefined || value === '') return null;
    const ms = typeof value === 'number' ? value : Date.parse(String(value));
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
const zonedParts = (ms: number, tz: string): { y: number; m: number; d: number; h: number; min: number } => {
    const zone = safeTimezone(tz);
    let f = formatters.get(zone);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        formatters.set(zone, f);
    }
    const parts = f.formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute') };
};

/** The instant it is `hour`:00 on the calendar day `ymd` in the time zone (DST-safe: two passes). */
export const atLocal = (ymd: string, hour: number, tz: string): string => {
    const day = toYmd(ymd);
    const [y, m, d] = (day || '1970-01-01').split('-').map(Number);
    const target = Date.UTC(y, m - 1, d, hour, 0, 0);
    let guess = target;
    for (let i = 0; i < 2; i++) {
        const z = zonedParts(guess, tz);
        guess -= Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, 0) - target;
    }
    return new Date(guess).toISOString();
};

/** The local calendar day (user's zone) of an ISO instant or a plain date. */
export const dayOf = (value: unknown, tz: string): string | null => instantYmd(typeof value === 'number' ? new Date(value).toISOString() : value, tz);

/**
 * When something happened: an ISO time as it is, a plain calendar date ("2026-11-03") as noon of that day (the source
 * only knows the day, so it is shown without a clock time).
 */
export const whenOf = (value: unknown, tz: string): { at: string; dayOnly: boolean } | null => {
    const text = str(value);
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const ymd = toYmd(text);
        return ymd ? { at: atLocal(ymd, 12, tz), dayOnly: true } : null;
    }
    const at = isoOf(typeof value === 'number' ? value : text);
    return at ? { at, dayOnly: false } : null;
};

/** The instant of a document's own date field when it is on the day the document was created, else noon of that day. */
export const dateFieldWhen = (ymd: unknown, createdAt: string, tz: string): { at: string; dayOnly: boolean } => {
    const day = toYmd(str(ymd));
    if (!day) return { at: createdAt, dayOnly: false };
    if (dayOf(createdAt, tz) === day) return { at: createdAt, dayOnly: false };
    return { at: atLocal(day, 12, tz), dayOnly: true };
};

// ------------------------------------------------------------------------------------------------ words
export const firstName = (name: unknown): string => str(name).split(/\s+/)[0] || '';

/** Strips tags and entities, collapses spaces, cuts at `max` characters with an ellipsis. */
export const plainText = (value: unknown, max = 200): string => {
    const text = str(value)
        .replace(/<\s*br\s*\/?>/gi, ' ')
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;
};

export const moneyText = (value: unknown, currency?: string): string => formatMoney(value, currency || 'USD');

/** 7.5 -> "7.5 h", 8 -> "8 h" (two decimals at most). */
export const hoursText = (hours: number): string => `${Math.round(hours * 100) / 100} h`;

export const countWord = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const NUMBER_FIELD: Record<string, string> = {
    'Estimate': 'estimateNumber', 'Invoice': 'invoiceNumber', 'Change Order': 'changeOrderNumber', 'Purchase Order': 'poNumber',
    'Receipt': 'receiptNumber', 'Work Order': 'workOrderNumber', 'Warranty': 'warrantyNumber', 'Daily Job Report': 'reportNumber',
};
const TYPE_WORD: Record<string, string> = { 'Daily Job Report': 'Daily report', 'Material Log': 'Material log', 'Time Sheet': 'Time sheet', 'Expense Log': 'Expense' };

/** "Estimate E-1042" (the type and its number); without a number the title, else just the type. */
export const docLabel = (doc: Pick<TimelineDoc, 'type' | 'data'>): string => {
    const word = TYPE_WORD[doc.type] || doc.type || 'Document';
    const number = str(doc.data?.[NUMBER_FIELD[doc.type] || '']);
    if (number) return `${word} ${number}`;
    const title = str(doc.data?.title);
    return title && title !== doc.type ? `${word} “${plainText(title, 50)}”` : word;
};

/** "Jane" for "sent to Jane": the document's client, else the job's, else "the client". */
export const clientWord = (doc: Pick<TimelineDoc, 'data'> | null, ctx: Pick<TimelineContext, 'clientName'>): string =>
    firstName(doc?.data?.clientName) || firstName(ctx.clientName) || 'the client';

// ------------------------------------------------------------------------------------------------ events
/** The default filter group of a source (an adapter may override it for one event). */
const GROUP_OF_SOURCE: Record<TimelineSource, TimelineGroup> = {
    documents: 'documents', dailyReports: 'field', photos: 'photos', notes: 'notes', punch: 'field', tasks: 'team', questions: 'client',
    selections: 'client', subs: 'team', quotes: 'money', warranty: 'field', feedback: 'client', reminders: 'client', crew: 'team',
    expenses: 'money', orders: 'money', email: 'client',
};

type EventInput = Omit<TimelineEvent, 'group' | 'at'> & { at: string; group?: TimelineGroup };

/** Builds an event with its default group; drops empty optional fields so fixtures and output stay small. */
export const makeEvent = (input: EventInput): TimelineEvent => {
    const e: TimelineEvent = { ...input, group: input.group || GROUP_OF_SOURCE[input.source] };
    for (const key of ['detail', 'body', 'rows', 'amount', 'currency', 'actor', 'link', 'photos', 'photoCount', 'pending', 'dayOnly'] as const) {
        if (e[key] === undefined || e[key] === null || e[key] === '' || (Array.isArray(e[key]) && (e[key] as unknown[]).length === 0) || e[key] === false) delete e[key];
    }
    return e;
};

/** Never throws: an adapter that meets odd data gives nothing instead of blanking the whole timeline. */
export const safely = <T>(run: () => T[]): T[] => {
    try { return run(); } catch { return []; }
};
