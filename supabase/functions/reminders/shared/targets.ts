// Database rows -> reminder targets (pure). The server (service role, many users) and the app (RLS, one user)
// select the same columns and map them the same way, so both see the same plan.

import { computeTotals, invoiceBalance, receiptsForInvoice, toNumber, type PaymentReceipt, type TotalsLineItem } from './money.ts';
import type { OverrideFlag, RecordedReminder, RecordStatus, ReminderKind, TargetFacts, TargetOverrides } from './schedule.ts';

/** documents columns (JSON paths keep the payload small: no signatures, photos or rich text). */
export const DOC_SELECT = [
  'id', 'user_id', 'job_id', 'client_id', 'type', 'created_at', 'public_token', 'approval_expires_at', 'approval_used_at',
  'has_client_signature',
  'status:data->>status', 'dueDate:data->>dueDate', 'issueDate:data->>issueDate', 'expiryDate:data->>expiryDate',
  'invoiceNumber:data->>invoiceNumber', 'estimateNumber:data->>estimateNumber', 'title:data->>title',
  'clientName:data->>clientName', 'clientEmail:data->>clientEmail', 'currency:data->>currency', 'paypalLink:data->>paypalLink',
  'clientSignedAt:data->>clientSignedAt', 'clientDeclinedAt:data->>clientDeclinedAt', 'paymentReportedAt:data->>paymentReportedAt',
  'lineItems:data->lineItems', 'taxRate:data->>taxRate', 'discount:data->>discount', 'shipping:data->>shipping',
  'isProgressBilling:data->>isProgressBilling', 'amountPaid:data->>amountPaid', 'payments:data->payments',
].join(', ');

export const JOB_SELECT = 'id, user_id, name, client_id, client_name, start_date, status, created_at';
export const CLIENT_SELECT = 'id, user_id, name, email, portal_key';
export const RECEIPT_SELECT = 'id, user_id, job_id, invoiceId:data->>invoiceId, invoiceNumber:data->>invoiceNumber, amount:data->>amount';
export const STATE_SELECT = 'document_id, sent_at';
export const OVERRIDE_SELECT = 'id, user_id, document_id, client_id, job_id, enabled, updated_at';
export const RECORD_SELECT =
  'id, user_id, kind, document_id, job_id, client_id, step_key, scheduled_for, dedupe_key, status, reason, attempts, to_email, subject, sent_at, created_at, updated_at';

export interface DocRow {
  id: string;
  user_id?: string;
  job_id?: string | null;
  client_id?: string | null;
  type: string;
  created_at?: string | null;
  public_token?: string | null;
  approval_expires_at?: string | null;
  approval_used_at?: string | null;
  has_client_signature?: boolean | null;
  status?: string | null;
  dueDate?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  invoiceNumber?: string | null;
  estimateNumber?: string | null;
  title?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  currency?: string | null;
  paypalLink?: string | null;
  clientSignedAt?: string | null;
  clientDeclinedAt?: string | null;
  paymentReportedAt?: string | null;
  lineItems?: TotalsLineItem[] | null;
  taxRate?: unknown;
  discount?: unknown;
  shipping?: unknown;
  isProgressBilling?: unknown;
  amountPaid?: unknown;
  payments?: Array<{ amount?: unknown } | null> | null;
}

export interface JobRow {
  id: string;
  user_id?: string;
  name?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  start_date?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface ClientRow {
  id: string;
  user_id?: string;
  name?: string | null;
  email?: string | null;
  portal_key?: string | null;
}

export interface ReceiptRow extends PaymentReceipt {
  id: string;
  user_id?: string;
  job_id?: string | null;
}

export interface OverrideRow {
  id?: string;
  user_id?: string;
  document_id?: string | null;
  client_id?: string | null;
  job_id?: string | null;
  enabled: boolean;
  updated_at?: string | null;
}

export interface RecordRow {
  id: string;
  user_id?: string;
  kind: ReminderKind;
  document_id?: string | null;
  job_id?: string | null;
  client_id?: string | null;
  step_key: string;
  scheduled_for: string;
  dedupe_key: string;
  status: RecordStatus;
  reason?: string | null;
  attempts?: number | null;
  to_email?: string | null;
  subject?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export const kindOfDocType = (type: string): ReminderKind | null =>
  type === 'Invoice' ? 'invoice' : type === 'Estimate' ? 'estimate' : null;

export const docNumber = (row: Pick<DocRow, 'invoiceNumber' | 'estimateNumber'>): string =>
  String(row.invoiceNumber || row.estimateNumber || '').trim();

const truthyText = (v: unknown) => !!String(v ?? '').trim();

/** Receipts for an invoice (summed). */
export const receiptsTotalFor = (row: DocRow, receipts: ReceiptRow[]): number =>
  receiptsForInvoice(
    { id: row.id, jobId: row.job_id ?? null, invoiceNumber: row.invoiceNumber ?? null },
    receipts.map((r) => ({ jobId: r.job_id ?? r.jobId ?? null, invoiceId: r.invoiceId ?? null, invoiceNumber: r.invoiceNumber ?? null, amount: r.amount })),
  );

/** Invoice / estimate row -> facts. `amount` is the balance due (invoice) or the total (estimate). */
export function factsFromDoc(row: DocRow, extra: { sentAt?: string | null; receiptsTotal?: number } = {}): TargetFacts & { amount: number } {
  const kind = kindOfDocType(row.type) ?? 'invoice';
  const money = { lineItems: Array.isArray(row.lineItems) ? row.lineItems : [], taxRate: row.taxRate, discount: row.discount, shipping: row.shipping, isProgressBilling: row.isProgressBilling, amountPaid: row.amountPaid };
  if (kind === 'invoice') {
    const bal = invoiceBalance({ ...money, payments: Array.isArray(row.payments) ? row.payments : null }, extra.receiptsTotal ?? 0);
    return {
      kind, id: row.id, createdAt: row.created_at ?? null, status: row.status ?? null, dueDate: row.dueDate ?? null,
      issueDate: row.issueDate ?? null, sentAt: extra.sentAt ?? null, total: bal.total, balanceDue: bal.balanceDue,
      paymentReported: truthyText(row.paymentReportedAt), amount: bal.balanceDue,
    };
  }
  const totals = computeTotals(money);
  return {
    kind, id: row.id, createdAt: row.created_at ?? null, status: row.status ?? null, issueDate: row.issueDate ?? null,
    expiryDate: row.expiryDate ?? null, sentAt: extra.sentAt ?? null,
    signed: !!row.has_client_signature || truthyText(row.clientSignedAt), declined: truthyText(row.clientDeclinedAt),
    total: totals.total, amount: totals.total,
  };
}

export function factsFromJob(job: JobRow): TargetFacts {
  return { kind: 'visit', id: job.id, createdAt: job.created_at ?? null, startDate: job.start_date ?? null, jobStatus: job.status ?? 'active' };
}

export const recordFromRow = (r: Pick<RecordRow, 'id' | 'dedupe_key' | 'status' | 'reason' | 'attempts' | 'sent_at' | 'created_at'>): RecordedReminder => ({
  id: r.id, dedupeKey: r.dedupe_key, status: r.status, reason: r.reason ?? null, attempts: r.attempts ?? 0, sentAt: r.sent_at ?? null, createdAt: r.created_at ?? null,
});

const flagOf = (o: OverrideRow | undefined): OverrideFlag | null => (o ? { enabled: !!o.enabled, updatedAt: o.updated_at ?? null } : null);

export interface OverrideIndex {
  byDocument: Map<string, OverrideRow>;
  byClient: Map<string, OverrideRow>;
  byJob: Map<string, OverrideRow>;
}

export function indexOverrides(rows: OverrideRow[]): OverrideIndex {
  const idx: OverrideIndex = { byDocument: new Map(), byClient: new Map(), byJob: new Map() };
  for (const o of rows) {
    if (o.document_id) idx.byDocument.set(o.document_id, o);
    else if (o.client_id) idx.byClient.set(o.client_id, o);
    else if (o.job_id) idx.byJob.set(o.job_id, o);
  }
  return idx;
}

export function overridesFor(idx: OverrideIndex, ids: { documentId?: string | null; jobId?: string | null; clientId?: string | null }): TargetOverrides {
  return {
    document: ids.documentId ? flagOf(idx.byDocument.get(ids.documentId)) : null,
    job: ids.jobId ? flagOf(idx.byJob.get(ids.jobId)) : null,
    client: ids.clientId ? flagOf(idx.byClient.get(ids.clientId)) : null,
  };
}

const sameName = (a: unknown, b: unknown) => {
  const x = String(a ?? '').trim().toLowerCase();
  return !!x && x === String(b ?? '').trim().toLowerCase();
};

/** The client of a document/job: its client_id, else the job's client_id, else the client with the same name. */
export function resolveClient(
  ids: { clientId?: string | null; jobClientId?: string | null; name?: string | null; userId?: string | null },
  clients: ClientRow[],
): ClientRow | null {
  const own = clients.filter((c) => !ids.userId || !c.user_id || c.user_id === ids.userId);
  if (ids.clientId) {
    const c = own.find((x) => x.id === ids.clientId);
    if (c) return c;
  }
  if (ids.jobClientId) {
    const c = own.find((x) => x.id === ids.jobClientId);
    if (c) return c;
  }
  if (ids.name) return own.find((x) => sameName(x.name, ids.name)) ?? null;
  return null;
}

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** First valid address of a client email field ("a@x.com, b@y.com" -> a@x.com), else null. */
export function recipientOf(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    for (const part of String(c ?? '').split(/[,;\s]+/)) {
      const addr = part.trim().replace(/^<|>$/g, '');
      if (addr && addr.length <= 254 && EMAIL_RE.test(addr)) return addr;
    }
  }
  return null;
}

const tokenUsable = (row: Pick<DocRow, 'public_token' | 'approval_expires_at' | 'approval_used_at'>, now: Date) =>
  !!row.public_token && !row.approval_used_at
  && (!row.approval_expires_at || Date.parse(row.approval_expires_at) > now.getTime() + 24 * 3_600_000);

/**
 * Link in the reminder: estimates -> the approval page (sign online), else the client portal;
 * invoices and visits -> the client portal (never expires), else the document's link.
 */
export function reminderLink(
  kind: ReminderKind,
  siteUrl: string,
  doc: Pick<DocRow, 'public_token' | 'approval_expires_at' | 'approval_used_at'> | null,
  client: Pick<ClientRow, 'portal_key'> | null,
  now: Date,
): string {
  const site = String(siteUrl || '').replace(/\/+$/, '');
  if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$)/i.test(site)) return '';
  const portal = client?.portal_key && /^[A-Za-z0-9_-]{32,128}$/.test(client.portal_key) ? `${site}/?portal=${encodeURIComponent(client.portal_key)}` : '';
  const approval = doc && tokenUsable(doc, now) ? `${site}/?approval_token=${encodeURIComponent(String(doc.public_token))}` : '';
  if (kind === 'estimate') return approval || portal;
  return portal || approval;
}

export const numberOr = (v: unknown, fallback = 0): number => {
  const n = toNumber(v);
  return Number.isFinite(n) ? n : fallback;
};
