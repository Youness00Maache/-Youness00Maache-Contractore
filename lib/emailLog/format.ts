/**
 * Sent-email log: plain, pure helpers (labels, sentences, limits, request links). No React, no Supabase.
 */
import { EMAIL_LOG_KINDS, type EmailLogEntry, type EmailLogKind } from './types.ts';

export const EMAIL_LOG_KIND_LABELS: Record<EmailLogKind, string> = {
    document: 'Document',
    purchase_order: 'Purchase order',
    review_request: 'Review request',
    job_update: 'Job update',
    payment: 'Payment',
    paper: 'Paper',
    export: 'Bookkeeper export',
    other: 'Email',
};

/** How many rows a list reads at most (the database keeps the newest 5000 per account). */
export const EMAIL_LOG_MAX_LIMIT = 200;
export const EMAIL_LOG_DEFAULT_LIMIT = 50;

export const normalizeKind = (v: unknown): EmailLogKind =>
    typeof v === 'string' && (EMAIL_LOG_KINDS as readonly string[]).includes(v) ? (v as EmailLogKind) : 'other';

export const kindLabel = (v: unknown): string => EMAIL_LOG_KIND_LABELS[normalizeKind(v)];

export const clampLimit = (limit: unknown): number => {
    const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : EMAIL_LOG_DEFAULT_LIMIT;
    return Math.min(EMAIL_LOG_MAX_LIMIT, Math.max(1, n));
};

const oneLine = (v: unknown, max: number): string => {
    const s = (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

export const isFailed = (e: Pick<EmailLogEntry, 'status'>): boolean => e.status === 'failed';

/**
 * The sentence for one entry. `what` is a document label when the email was about one ("Estimate E-1042").
 *   sent:   "Emailed estimate E-1042 to jane@x.com"  /  "Emailed a review request to jane@x.com"
 *   failed: "Email to jane@x.com failed"
 */
export const emailLogSentence = (e: Pick<EmailLogEntry, 'to_email' | 'status' | 'kind'>, what?: string | null): string => {
    const to = oneLine(e.to_email, 80) || 'someone';
    if (isFailed(e)) return `Email to ${to} failed`;
    const label = oneLine(what, 80);
    if (label) return `Emailed ${label.charAt(0).toLowerCase()}${label.slice(1)} to ${to}`;
    const kind = normalizeKind(e.kind);
    if (kind === 'other') return `Emailed ${to}`;
    const word = EMAIL_LOG_KIND_LABELS[kind].toLowerCase();
    return `Emailed ${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word} to ${to}`;
};

/** "Subject line" (or the error for a failed send), one short line. */
export const emailLogDetail = (e: Pick<EmailLogEntry, 'subject' | 'status' | 'error'>): string => {
    const subject = oneLine(e.subject, 120);
    if (isFailed(e)) {
        const err = oneLine(e.error, 120);
        return [subject, err].filter(Boolean).join(' · ');
    }
    return subject;
};

/** Short local date for lists: "Nov 15, 2026". */
export const emailLogDate = (iso: string | null | undefined, locale?: string): string => {
    const ms = Date.parse(String(iso || ''));
    if (!Number.isFinite(ms)) return '';
    try { return new Date(ms).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return new Date(ms).toISOString().slice(0, 10); }
};

/**
 * The log links the compose screen sends with an email (first attached document; purchase order when it is one).
 * Ids only; the server re-checks that they are the same owner's.
 */
export const emailLogLinksForDocs = (
    docs: ReadonlyArray<{ id: string; jobId?: string | null; type?: string | null }>,
    clientId?: string | null,
): { kind: EmailLogKind; jobId: string | null; clientId: string | null; documentId: string | null } => {
    const first = docs[0];
    const kind: EmailLogKind = !first ? 'other' : first.type === 'Purchase Order' ? 'purchase_order' : 'document';
    return { kind, jobId: first?.jobId || null, clientId: clientId || null, documentId: first?.id || null };
};
