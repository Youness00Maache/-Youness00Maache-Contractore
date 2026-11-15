/**
 * Quote comparison (roadmap D7): pure logic (no Supabase, no React). Shapes: lib/subs/subTypes.ts (JobQuote).
 *
 *   scopeKeyOf(scope)                        the database's scope_key (trimmed, single spaces, lower case, 200 chars)
 *   groupQuotesByScope(quotes)               QuoteGroup[]  one group per scope, newest activity first
 *   compareQuotes(quotes, opts?)             QuoteComparisonRow[]  (one scope; cheapest first; rank, flags, best value)
 *        opts: { today?: 'YYYY-MM-DD', nearPct?: 10, staleDays?: 60, expiringDays?: 7 }
 *        flags (QuoteFlag): lowest | near_lowest (within nearPct of the lowest) | highest | best_value | fastest |
 *                            expired | expiring_soon | stale (received > staleDays ago) | missing_inclusions |
 *                            missing_exclusions | no_document | chosen | rejected
 *        "Active" quotes (not rejected, not expired) are the ones ranked; rank 1 = cheapest (ties share a rank).
 *        best_value: a SUGGESTION: the active quote with the lowest adjusted amount (amount + 5% when inclusions are
 *        missing, + 3% without exclusions, + 2% without a document or link, + 0.1% per day of lead time above the
 *        fastest, capped at 10%). Only flagged when there are 2+ active quotes.
 *   comparisonMatrix(rows)                   MatrixRow[]  side-by-side table rows (one cell per quote, same order as rows)
 *   QUOTE_TRANSITIONS / canSetQuoteStatus(from, to)
 *   chooseQuotePlan(quotes, quoteId)         { choose, unchoose[] }  the writes to choose one quote of its scope
 *                                            (a previously chosen quote of the same scope goes back to 'shortlisted')
 *   commitmentDraftFromQuote(quote, member?, opts?)  CommitmentDraft (title = scope, amount, sub, inclusions /
 *                                            exclusions as the description the sub sees, quoteId). Save it as a DRAFT.
 *   QUOTE_COLUMNS / mapQuoteRow / quoteInsertRow / quotePatchRow / validateQuoteDraft / validateHttpsUrl
 *   quoteFileStoragePath(userId, jobId, fileName, random?)  '<user>/quotes/<job>/<rand>-<base>.<ext>' (document-assets)
 *   validateQuoteFile({ name, size, type })  string | null
 */
import { roundMoney } from '../../utils/money.ts';
import { sanitizeFileName } from '../jobFiles/jobFileLogic.ts';
import { daysBetween, parseAmount, subNameOf, todayISO } from './subLogic.ts';
import { QUOTE_STATUSES, SUB_LIMITS, type CommitmentDraft, type JobQuote, type QuoteDraft, type QuotePatch, type QuoteStatus, type SubMember } from './subTypes.ts';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (str(v).trim() ? str(v) : null);
const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const cleanLine = (v: unknown, max: number): string | null => {
    const s = str(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max).trim();
    return s || null;
};
const cleanMultiline = (v: unknown, max: number): string | null => {
    const s = str(v).replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, max).trim();
    return s || null;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null => {
    const s = str(v).slice(0, 10);
    return DATE_RE.test(s) ? s : null;
};

// ------------------------------------------------------------------------------------------------ grouping
export const scopeKeyOf = (scope: string): string =>
    str(scope).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, SUB_LIMITS.scope).replace(/\s+/g, ' ').toLowerCase().slice(0, SUB_LIMITS.scope);

export interface QuoteGroup {
    scopeKey: string;
    /** display title: the scope as typed on the newest quote */
    scope: string;
    quotes: JobQuote[];
    chosen: JobQuote | null;
    /** quotes that are not rejected */
    activeCount: number;
    lowest: number | null;
    highest: number | null;
}

const activity = (q: JobQuote): string => str(q.chosenAt || q.createdAt || q.receivedOn);

export const groupQuotesByScope = (quotes: readonly JobQuote[]): QuoteGroup[] => {
    const map = new Map<string, JobQuote[]>();
    for (const q of quotes) {
        const k = q.scopeKey || scopeKeyOf(q.scope);
        const list = map.get(k);
        if (list) list.push(q); else map.set(k, [q]);
    }
    const groups: QuoteGroup[] = [];
    for (const [scopeKey, list] of map) {
        const sorted = [...list].sort((a, b) => a.amount - b.amount || str(a.createdAt).localeCompare(str(b.createdAt)));
        const newest = [...list].sort((a, b) => activity(b).localeCompare(activity(a)))[0];
        const active = sorted.filter(q => q.status !== 'rejected');
        groups.push({
            scopeKey,
            scope: newest.scope,
            quotes: sorted,
            chosen: list.find(q => q.status === 'chosen') || null,
            activeCount: active.length,
            lowest: active.length ? active[0].amount : null,
            highest: active.length ? active[active.length - 1].amount : null,
        });
    }
    return groups.sort((a, b) => {
        const la = a.quotes.map(activity).sort().pop() || '';
        const lb = b.quotes.map(activity).sort().pop() || '';
        return lb.localeCompare(la) || a.scope.localeCompare(b.scope);
    });
};

// ------------------------------------------------------------------------------------------------ comparison
export type QuoteFlag =
    | 'lowest' | 'near_lowest' | 'highest' | 'best_value' | 'fastest' | 'expired' | 'expiring_soon' | 'stale'
    | 'missing_inclusions' | 'missing_exclusions' | 'no_document' | 'chosen' | 'rejected';

export interface QuoteComparisonRow {
    quote: JobQuote;
    /** 1 = cheapest among active quotes (ties share a rank); null for rejected / expired quotes */
    rank: number | null;
    /** amount - lowest active amount (null when there is no active quote) */
    diffFromLowest: number | null;
    /** % above the lowest active amount, one decimal (null when the lowest is 0 or there is none) */
    pctAboveLowest: number | null;
    /** days until valid_until (negative = expired; null without a date) */
    validDaysLeft: number | null;
    /** amount after the best-value adjustments (null for inactive quotes) */
    adjustedAmount: number | null;
    flags: QuoteFlag[];
}

export interface CompareOptions { today?: string; nearPct?: number; staleDays?: number; expiringDays?: number }

const isExpired = (q: JobQuote, today: string) => !!q.validUntil && q.validUntil < today;

export const compareQuotes = (quotes: readonly JobQuote[], opts: CompareOptions = {}): QuoteComparisonRow[] => {
    const today = opts.today || todayISO();
    const nearPct = opts.nearPct ?? 10;
    const staleDays = opts.staleDays ?? 60;
    const expiringDays = opts.expiringDays ?? 7;
    const sorted = [...quotes].sort((a, b) => a.amount - b.amount || str(a.createdAt).localeCompare(str(b.createdAt)) || a.id.localeCompare(b.id));
    const active = sorted.filter(q => q.status !== 'rejected' && !isExpired(q, today));
    const lowest = active.length ? active[0].amount : null;
    const highest = active.length ? active[active.length - 1].amount : null;
    const leads = active.map(q => q.leadTimeDays).filter((d): d is number => d !== null);
    const fastest = leads.length ? Math.min(...leads) : null;

    const adjusted = new Map<string, number>();
    for (const q of active) {
        let pct = 0;
        if (!q.inclusions) pct += 5;
        if (!q.exclusions) pct += 3;
        if (!q.filePath && !q.url) pct += 2;
        if (fastest !== null && q.leadTimeDays !== null) pct += Math.min(10, (q.leadTimeDays - fastest) * 0.1);
        adjusted.set(q.id, roundMoney(q.amount * (1 + pct / 100)));
    }
    let bestId: string | null = null;
    if (active.length >= 2) {
        for (const q of active) {
            if (bestId === null || adjusted.get(q.id)! < adjusted.get(bestId)!) bestId = q.id;
        }
    }

    // dense ranks by amount among active quotes
    const ranks = new Map<string, number>();
    let rank = 0;
    let last: number | null = null;
    for (const q of active) {
        if (last === null || q.amount !== last) { rank += 1; last = q.amount; }
        ranks.set(q.id, rank);
    }

    return sorted.map((q) => {
        const isActive = ranks.has(q.id);
        const flags: QuoteFlag[] = [];
        if (q.status === 'chosen') flags.push('chosen');
        if (q.status === 'rejected') flags.push('rejected');
        if (isActive && lowest !== null && q.amount === lowest) flags.push('lowest');
        else if (isActive && lowest !== null && lowest > 0 && q.amount <= lowest * (1 + nearPct / 100)) flags.push('near_lowest');
        if (isActive && active.length >= 2 && highest !== null && q.amount === highest && highest !== lowest) flags.push('highest');
        if (q.id === bestId) flags.push('best_value');
        if (isActive && active.length >= 2 && fastest !== null && q.leadTimeDays === fastest && leads.filter(d => d === fastest).length < active.length) flags.push('fastest');
        const validDaysLeft = q.validUntil ? daysBetween(today, q.validUntil) : null;
        if (validDaysLeft !== null && validDaysLeft < 0) flags.push('expired');
        else if (validDaysLeft !== null && validDaysLeft <= expiringDays) flags.push('expiring_soon');
        if (q.receivedOn && daysBetween(q.receivedOn, today) > staleDays && q.status !== 'chosen') flags.push('stale');
        if (!q.inclusions) flags.push('missing_inclusions');
        if (!q.exclusions) flags.push('missing_exclusions');
        if (!q.filePath && !q.url) flags.push('no_document');
        return {
            quote: q,
            rank: isActive ? ranks.get(q.id)! : null,
            diffFromLowest: lowest === null ? null : roundMoney(q.amount - lowest),
            pctAboveLowest: lowest === null || lowest <= 0 ? null : Math.round(((q.amount - lowest) / lowest) * 1000) / 10,
            validDaysLeft,
            adjustedAmount: isActive ? adjusted.get(q.id)! : null,
            flags,
        };
    });
};

export const FLAG_LABEL: Record<QuoteFlag, string> = {
    lowest: 'Lowest', near_lowest: 'Close to lowest', highest: 'Highest', best_value: 'Best value', fastest: 'Fastest',
    expired: 'Expired', expiring_soon: 'Expires soon', stale: 'Old quote', missing_inclusions: 'No inclusions listed',
    missing_exclusions: 'No exclusions listed', no_document: 'No document', chosen: 'Chosen', rejected: 'Rejected',
};

export type MatrixRowKey = 'vendor' | 'amount' | 'difference' | 'lead_time' | 'valid_until' | 'inclusions' | 'exclusions' | 'document' | 'received' | 'status';
export interface MatrixCell {
    quoteId: string;
    text: string;
    /** the cell is the best of its row (lowest amount, shortest lead time, latest validity) */
    best: boolean;
    /** the cell shows a problem (missing text, expired...) */
    warn: boolean;
}
export interface MatrixRow { key: MatrixRowKey; label: string; cells: MatrixCell[] }

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Side-by-side table: one row per attribute, one cell per quote in the order of `rows` (compareQuotes output). */
export const comparisonMatrix = (rows: readonly QuoteComparisonRow[]): MatrixRow[] => {
    const activeLeads = rows.filter(r => r.rank !== null && r.quote.leadTimeDays !== null).map(r => r.quote.leadTimeDays!);
    const minLead = activeLeads.length ? Math.min(...activeLeads) : null;
    const activeValid = rows.filter(r => r.rank !== null && r.quote.validUntil).map(r => r.quote.validUntil!).sort();
    const maxValid = activeValid.length ? activeValid[activeValid.length - 1] : null;
    const cell = (r: QuoteComparisonRow, text: string, best = false, warn = false): MatrixCell => ({ quoteId: r.quote.id, text, best, warn });
    const textCell = (r: QuoteComparisonRow, v: string | null) => cell(r, v ? v.replace(/\s+/g, ' ').slice(0, 160) : 'Not listed', false, !v);
    return [
        { key: 'vendor', label: 'From', cells: rows.map(r => cell(r, r.quote.vendorName)) },
        { key: 'amount', label: 'Amount', cells: rows.map(r => cell(r, money(r.quote.amount), r.flags.includes('lowest'))) },
        {
            key: 'difference', label: 'vs lowest', cells: rows.map(r => cell(r,
                r.diffFromLowest === null ? '' : r.diffFromLowest === 0 ? 'Lowest' : `${r.diffFromLowest > 0 ? '+' : ''}${money(r.diffFromLowest)}${r.pctAboveLowest !== null ? ` (${r.pctAboveLowest > 0 ? '+' : ''}${r.pctAboveLowest}%)` : ''}`,
                r.diffFromLowest === 0 && r.rank !== null)),
        },
        {
            key: 'lead_time', label: 'Lead time', cells: rows.map(r => cell(r,
                r.quote.leadTimeDays === null ? 'Not given' : `${r.quote.leadTimeDays} day${r.quote.leadTimeDays === 1 ? '' : 's'}`,
                r.rank !== null && minLead !== null && r.quote.leadTimeDays === minLead, r.quote.leadTimeDays === null)),
        },
        {
            key: 'valid_until', label: 'Valid until', cells: rows.map(r => cell(r, r.quote.validUntil || 'No date',
                r.rank !== null && !!maxValid && r.quote.validUntil === maxValid, r.flags.includes('expired') || r.flags.includes('expiring_soon'))),
        },
        { key: 'inclusions', label: 'Includes', cells: rows.map(r => textCell(r, r.quote.inclusions)) },
        { key: 'exclusions', label: 'Excludes', cells: rows.map(r => textCell(r, r.quote.exclusions)) },
        { key: 'document', label: 'Document', cells: rows.map(r => cell(r, r.quote.filePath ? (r.quote.fileName || 'File') : r.quote.url ? 'Link' : 'None', false, !r.quote.filePath && !r.quote.url)) },
        { key: 'received', label: 'Received', cells: rows.map(r => cell(r, r.quote.receivedOn || '', false, r.flags.includes('stale'))) },
        { key: 'status', label: 'Status', cells: rows.map(r => cell(r, QUOTE_STATUS_LABEL[r.quote.status], r.quote.status === 'chosen')) },
    ];
};

// ------------------------------------------------------------------------------------------------ status + choose
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = { received: 'Received', shortlisted: 'Shortlisted', rejected: 'Rejected', chosen: 'Chosen' };

/** Owner moves between quote statuses (the database allows any; at most one 'chosen' per scope). */
export const QUOTE_TRANSITIONS: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
    received: ['shortlisted', 'rejected', 'chosen'],
    shortlisted: ['received', 'rejected', 'chosen'],
    rejected: ['received', 'shortlisted'],
    chosen: ['shortlisted', 'rejected'],
};
export const canSetQuoteStatus = (from: QuoteStatus, to: QuoteStatus): boolean => QUOTE_TRANSITIONS[from]?.includes(to) ?? false;

/** The writes to choose `quoteId`: other chosen quotes of the same scope go back to 'shortlisted' first. */
export const chooseQuotePlan = (quotes: readonly JobQuote[], quoteId: string): { choose: string; unchoose: string[] } => {
    const q = quotes.find(x => x.id === quoteId);
    if (!q) throw new Error('Quote not found.');
    if (q.status === 'rejected') throw new Error('This quote was rejected. Move it back to the shortlist first.');
    const key = q.scopeKey || scopeKeyOf(q.scope);
    return {
        choose: q.id,
        unchoose: quotes.filter(x => x.id !== q.id && x.jobId === q.jobId && (x.scopeKey || scopeKeyOf(x.scope)) === key && x.status === 'chosen').map(x => x.id),
    };
};

/** A DRAFT commitment from a chosen quote (who: the quote's crew member when it is a subcontractor, else its vendor name). */
export const commitmentDraftFromQuote = (
    quote: JobQuote,
    member?: Pick<SubMember, 'id' | 'kind' | 'name' | 'company'> | null,
    opts: { retainagePct?: number; startDate?: string | null; dueDate?: string | null } = {},
): CommitmentDraft => {
    const sub = member && member.kind === 'subcontractor' && member.id === quote.crewMemberId ? member : null;
    const parts = [
        quote.inclusions ? `Includes: ${quote.inclusions}` : '',
        quote.exclusions ? `Excludes: ${quote.exclusions}` : '',
    ].filter(Boolean);
    return {
        crewMemberId: sub ? sub.id : null,
        subName: sub ? subNameOf(sub) : quote.vendorName,
        title: quote.scope,
        description: parts.length ? parts.join('\n\n').slice(0, SUB_LIMITS.longText) : null,
        amount: quote.amount,
        retainagePct: opts.retainagePct ?? 0,
        startDate: opts.startDate ?? null,
        dueDate: opts.dueDate ?? null,
        quoteId: quote.id,
        notes: null,
    };
};

// ------------------------------------------------------------------------------------------------ rows
export const QUOTE_COLUMNS = 'id, job_id, scope, scope_key, vendor_name, crew_member_id, supplier_id, amount, inclusions, exclusions, notes, lead_time_days, valid_until, received_on, url, file_path, file_name, size_bytes, status, chosen_at, created_at';

const isQuoteStatus = (v: unknown): v is QuoteStatus => (QUOTE_STATUSES as readonly string[]).includes(str(v));

export const mapQuoteRow = (r: Record<string, unknown>): JobQuote => ({
    id: str(r.id),
    jobId: str(r.job_id),
    scope: str(r.scope),
    scopeKey: str(r.scope_key) || scopeKeyOf(str(r.scope)),
    vendorName: str(r.vendor_name),
    crewMemberId: strOrNull(r.crew_member_id),
    supplierId: strOrNull(r.supplier_id),
    amount: roundMoney(Number(r.amount) || 0),
    inclusions: strOrNull(r.inclusions),
    exclusions: strOrNull(r.exclusions),
    notes: strOrNull(r.notes),
    leadTimeDays: numOrNull(r.lead_time_days),
    validUntil: dateOrNull(r.valid_until),
    receivedOn: dateOrNull(r.received_on),
    url: strOrNull(r.url),
    filePath: strOrNull(r.file_path),
    fileName: strOrNull(r.file_name),
    sizeBytes: numOrNull(r.size_bytes),
    status: isQuoteStatus(r.status) ? r.status : 'received',
    chosenAt: strOrNull(r.chosen_at),
    createdAt: strOrNull(r.created_at),
});

/** https only (a link without a scheme gets https://). */
export const validateHttpsUrl = (input: string): { ok: true; url: string } | { ok: false; error: string } => {
    let s = str(input).trim();
    if (!s) return { ok: false, error: 'Paste a link.' };
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
    if (!/^https:\/\//.test(s)) return { ok: false, error: 'Links must start with https://' };
    if (/\s/.test(s)) return { ok: false, error: 'Links cannot contain spaces.' };
    if (s.length > SUB_LIMITS.url) return { ok: false, error: 'This link is too long.' };
    try { new URL(s); } catch { return { ok: false, error: 'This link does not look right.' }; }
    return { ok: true, url: s };
};

export const validateQuoteDraft = (d: QuoteDraft | QuotePatch, partial = false): string | null => {
    if (!partial || d.scope !== undefined) if (!cleanLine(d.scope, SUB_LIMITS.scope)) return 'Name the scope (e.g. "Electrical rough-in").';
    if (!partial && !cleanLine(d.vendorName, SUB_LIMITS.vendorName) && !d.crewMemberId && !d.supplierId) return 'Add who the quote is from.';
    if (!partial || d.amount !== undefined) if (parseAmount(d.amount) === null) return 'Enter the quoted amount.';
    if (d.leadTimeDays !== undefined && d.leadTimeDays !== null) {
        const n = Number(d.leadTimeDays);
        if (!Number.isInteger(n) || n < 0 || n > SUB_LIMITS.leadTimeDays) return `Lead time is 0 to ${SUB_LIMITS.leadTimeDays} days.`;
    }
    for (const k of ['validUntil', 'receivedOn'] as const) {
        const v = d[k];
        if (v && !DATE_RE.test(v)) return 'Check the dates.';
    }
    if (d.url) { const u = validateHttpsUrl(d.url); if (u.ok === false) return u.error; }
    return null;
};

const quoteFields = (d: QuotePatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (d.scope !== undefined) row.scope = cleanLine(d.scope, SUB_LIMITS.scope);
    if (d.vendorName !== undefined) row.vendor_name = cleanLine(d.vendorName, SUB_LIMITS.vendorName) || '';
    if (d.crewMemberId !== undefined) row.crew_member_id = d.crewMemberId || null;
    if (d.supplierId !== undefined) row.supplier_id = d.supplierId || null;
    if (d.amount !== undefined) row.amount = parseAmount(d.amount);
    if (d.inclusions !== undefined) row.inclusions = cleanMultiline(d.inclusions, SUB_LIMITS.longText);
    if (d.exclusions !== undefined) row.exclusions = cleanMultiline(d.exclusions, SUB_LIMITS.longText);
    if (d.notes !== undefined) row.notes = cleanMultiline(d.notes, SUB_LIMITS.longText);
    if (d.leadTimeDays !== undefined) row.lead_time_days = d.leadTimeDays === null ? null : Number(d.leadTimeDays);
    if (d.validUntil !== undefined) row.valid_until = d.validUntil || null;
    if (d.receivedOn !== undefined && d.receivedOn) row.received_on = d.receivedOn;
    if (d.url !== undefined) { const u = d.url ? validateHttpsUrl(d.url) : null; row.url = u && u.ok ? u.url : null; }
    return row;
};

export const quoteInsertRow = (d: QuoteDraft, userId: string, jobId: string): Record<string, unknown> => {
    const err = validateQuoteDraft(d);
    if (err) throw new Error(err);
    return { user_id: userId, job_id: jobId, status: 'received', ...quoteFields({ vendorName: '', ...d }) };
};

export const quotePatchRow = (p: QuotePatch): Record<string, unknown> => {
    const err = validateQuoteDraft(p, true);
    if (err) throw new Error(err);
    return quoteFields(p);
};

// ------------------------------------------------------------------------------------------------ files
const QUOTE_FILE_EXT: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MIME_EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const quoteFileMime = (name: string, type?: string | null): string | null => {
    if (type && MIME_EXT[type]) return type;
    return QUOTE_FILE_EXT[sanitizeFileName(name).ext] ?? null;
};

export const validateQuoteFile = (f: { name: string; size: number; type?: string | null }): string | null => {
    if (!quoteFileMime(f.name, f.type)) return 'Quotes can be PDF, JPG, PNG or WebP files.';
    if (!(f.size > 0)) return 'This file is empty.';
    if (f.size > SUB_LIMITS.fileBytes) return 'Files can be up to 15 MB.';
    return null;
};

const randomPart = (): string => {
    const g = globalThis.crypto;
    const raw = g?.randomUUID ? g.randomUUID().replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    return raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16).padEnd(8, '0');
};

/** '<user>/quotes/<job>/<rand>-<base>.<ext>' in document-assets (the shape the migration's check accepts). */
export const quoteFileStoragePath = (userId: string, jobId: string, fileName: string, mime?: string | null, random: string = randomPart()): string => {
    const { base, ext } = sanitizeFileName(fileName);
    const m = quoteFileMime(fileName, mime);
    const e = m ? (QUOTE_FILE_EXT[ext] === m ? ext : MIME_EXT[m]) : 'pdf';
    const r = random.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32).padEnd(8, '0');
    return `${userId}/quotes/${jobId}/${r}-${base}.${e}`;
};
