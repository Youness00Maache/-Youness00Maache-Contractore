/**
 * Sent-email log (roadmap D11): one row of public.email_log (migration 20261116001200_email_log.sql) per email the
 * `gmail` edge function tried to send. Who / what / when only: never the body, attachments or tokens. Owner-only:
 * the app reads and deletes rows; only the edge function writes them.
 */

export const EMAIL_LOG_KINDS = ['document', 'purchase_order', 'review_request', 'job_update', 'payment', 'paper', 'export', 'other'] as const;
export type EmailLogKind = (typeof EMAIL_LOG_KINDS)[number];

export type EmailLogStatus = 'sent' | 'failed';

/** A row as the app reads it (snake_case, as stored). */
export interface EmailLogEntry {
    id: string;
    job_id?: string | null;
    client_id?: string | null;
    document_id?: string | null;
    kind?: EmailLogKind | string | null;
    to_email?: string | null;
    subject?: string | null;
    status?: EmailLogStatus | string | null;
    error?: string | null;
    sent_at?: string | null;
}

/** The columns the app reads (no gmail_message_id / user_id needed on screen). */
export const EMAIL_LOG_SELECT = 'id, job_id, client_id, document_id, kind, to_email, subject, status, error, sent_at';
