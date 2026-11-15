// Sent-email log (D11): one row in public.email_log per send attempt of the `send` action.
// PRIVACY: who / what / when only. Never the body (text/html), attachments, tokens or headers other than the subject.
// BEST EFFORT: every function here swallows its own errors; logging can never break, delay or change a send's response.
// Pure (no Deno / npm imports) so scripts/email-log-check.ts can test it under Node.

export const EMAIL_LOG_KINDS = ['document', 'purchase_order', 'review_request', 'job_update', 'payment', 'paper', 'export', 'other'] as const;
export type EmailLogKind = (typeof EMAIL_LOG_KINDS)[number];

export interface EmailLogRow {
  user_id: string;
  job_id: string | null;
  client_id: string | null;
  document_id: string | null;
  kind: EmailLogKind;
  to_email: string;
  subject: string;
  status: 'sent' | 'failed';
  error: string | null;
  gmail_message_id: string | null;
}

/** Minimal shape of the service-role client this module needs (structural, so no import is required). */
interface InsertClient {
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }> };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalUuid = (v: unknown): string | null => (typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null);
const oneLine = (v: string, max: number) => v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Recipients as one short line: "a@x.com, b@y.com" (the `to` field only; cc/bcc are not stored). */
export function logRecipients(to: unknown): string {
  const list = Array.isArray(to) ? to : typeof to === 'string' ? to.split(/[,;]/) : [];
  const joined = list.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).join(', ');
  return oneLine(joined, 254);
}

export function logKind(v: unknown): EmailLogKind {
  return typeof v === 'string' && (EMAIL_LOG_KINDS as readonly string[]).includes(v) ? (v as EmailLogKind) : 'other';
}

/** A short error for the log: the human message of a known error, otherwise a generic line. Never raw provider data. */
export function logError(e: unknown): string {
  const anyE = e as { code?: unknown; message?: unknown; status?: unknown } | null;
  const known = anyE && typeof anyE.code === 'string' && typeof anyE.status === 'number';
  if (!known) return 'The email could not be sent.';
  const msg = typeof anyE!.message === 'string' ? anyE!.message : '';
  // defence in depth: never keep anything that looks like a bearer token or a long opaque string
  const safe = msg.replace(/\b(ya29\.|1\/\/|eyJ)[\w.\-\/]+/g, '[hidden]').replace(/[A-Za-z0-9_\-]{40,}/g, '[hidden]');
  return oneLine(`${anyE!.code}: ${safe}`, 300);
}

/**
 * Builds the row from the send request. Reads ONLY: to, subject, and the optional link fields
 * kind / job_id / client_id / document_id. Returns null when there is no recipient to record.
 */
export function buildEmailLogRow(
  userId: string,
  body: Record<string, unknown>,
  outcome: { status: 'sent'; messageId?: string } | { status: 'failed'; error: unknown },
): EmailLogRow | null {
  const to = logRecipients(body.to);
  if (!to || !UUID_RE.test(userId)) return null;
  return {
    user_id: userId,
    job_id: optionalUuid(body.job_id),
    client_id: optionalUuid(body.client_id),
    document_id: optionalUuid(body.document_id),
    kind: logKind(body.kind),
    to_email: to,
    subject: oneLine(typeof body.subject === 'string' ? body.subject : '', 300),
    status: outcome.status,
    error: outcome.status === 'failed' ? logError(outcome.error) : null,
    gmail_message_id: outcome.status === 'sent' ? (oneLine(outcome.messageId ?? '', 100) || null) : null,
  };
}

/** Inserts one row. Never throws. A missing table (not applied yet) is silently ignored. */
export async function writeEmailLog(admin: InsertClient, row: EmailLogRow | null): Promise<void> {
  if (!row) return;
  try {
    const { error } = await admin.from('email_log').insert(row as unknown as Record<string, unknown>);
    if (error && !/email_log|does not exist|schema cache/i.test(String(error.message ?? ''))) {
      console.error('[gmail] email log insert failed:', String(error.message ?? '').slice(0, 200));
    }
  } catch (e) {
    console.error('[gmail] email log skipped:', String((e as Error)?.message ?? '').slice(0, 200));
  }
}

/**
 * Fire-and-forget: hands the insert to the runtime (EdgeRuntime.waitUntil) so the response is not delayed.
 * Without waitUntil the promise just runs on (it never rejects). Never throws.
 */
export function scheduleEmailLog(
  admin: InsertClient,
  userId: string,
  body: Record<string, unknown>,
  outcome: { status: 'sent'; messageId?: string } | { status: 'failed'; error: unknown },
): void {
  try {
    const task = writeEmailLog(admin, buildEmailLogRow(userId, body, outcome)).catch(() => undefined);
    const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(task);
  } catch {
    /* logging must never affect sending */
  }
}
