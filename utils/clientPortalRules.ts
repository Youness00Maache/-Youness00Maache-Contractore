/**
 * Rules of the client portal (`/?portal=`), the single-document link (`/?approval_token=`), "Get approval" and
 * temporary clients. Pure (no React, no Supabase) so the pages, the contractor's screens and the QA script
 * (scripts/portal-approval-check.ts) all use the same logic.
 *
 * The database applies the same rules (supabase/migrations/20261113000600_portal_approval_fixes.sql) and sends its
 * verdict for each document as `state`; the pages prefer that and only fall back to these helpers when talking to
 * a database without the migration.
 */
import { computeDocumentTotals, toNumber, type DocumentTotals } from './money.ts';

const str = (value: unknown): string => (value === null || value === undefined ? '' : String(value)).trim();
const low = (value: unknown): string => str(value).toLowerCase();

/* =====================================================================================
   Document types and signing state
   ===================================================================================== */

/** Types a client can sign online. */
export const SIGNABLE_TYPES = ['Estimate', 'Change Order'];

/**
 * Types a client can see (portal and single-document link). Internal paperwork (Purchase Order, Time Sheet,
 * Material Log, Expense Log, Note, Profit Report) never is. Same list as public._client_visible_type().
 */
export const CLIENT_FACING_TYPES = ['Invoice', 'Estimate', 'Change Order', 'Work Order', 'Daily Job Report', 'Warranty', 'Receipt'];

export const isClientFacingType = (type: unknown): boolean => CLIENT_FACING_TYPES.includes(str(type));
export const isSignableType = (type: unknown): boolean => SIGNABLE_TYPES.includes(str(type));

export type DocState = 'open' | 'signed' | 'declined' | 'expired' | 'readonly';
const DOC_STATES: readonly DocState[] = ['open', 'signed', 'declined', 'expired', 'readonly'];

/** The database's verdict (`state` in get_portal_data / get_document_by_token), or null when it sent none. */
export const parseDocState = (value: unknown): DocState | null => (DOC_STATES as readonly string[]).includes(str(value)) ? (str(value) as DocState) : null;

/** Signed: the client signed online, or the contractor marked it Accepted / Approved (a change order's own status). */
export const isSignedData = (d: Record<string, any> | null | undefined): boolean =>
    ['accepted', 'approved'].includes(low(d?.status)) || !!str(d?.clientSignatureUrl) || !!str(d?.clientSignedAt);

/**
 * Declined: the client declined (status Rejected). When the contractor re-sends it (status changed again), the
 * database clears clientDeclinedAt, so the document is open again.
 */
export const isDeclinedData = (d: Record<string, any> | null | undefined): boolean =>
    ['rejected', 'declined'].includes(low(d?.status)) || !!str(d?.clientDeclinedAt);

/**
 * Documents created before this instant come from the original app, which never enforced the "valid until" date:
 * they stay signable after it. Same instant as public._expiry_rule_start().
 */
export const EXPIRY_RULE_START = '2026-11-13T00:00:00Z';

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' when `value` starts with a real calendar date, else ''. */
export const ymdOf = (value: unknown): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(value));
    if (!m) return '';
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

/** True for documents made by the original app (created before EXPIRY_RULE_START). Unknown dates count as new. */
export const isLegacyDocument = (createdAt: unknown): boolean => {
    const t = Date.parse(str(createdAt));
    return Number.isFinite(t) && t < Date.parse(EXPIRY_RULE_START);
};

/**
 * The "valid until" date stops online signing (new documents only). A date is valid through the end of that day
 * wherever the client is, so the cut-off is one day after it on the UTC calendar (same as the database).
 */
export const expiryBlocksSigning = (createdAt: unknown, expiryDate: unknown, now: Date = new Date()): boolean => {
    if (isLegacyDocument(createdAt)) return false;
    const ymd = ymdOf(expiryDate);
    if (!ymd) return false;
    const lastDay = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
    return ymd < lastDay;
};

/** The "valid until" date is before today on the viewer's calendar (informational only). */
export const isPastExpiryDate = (expiryDate: unknown, now: Date = new Date()): boolean => {
    const ymd = ymdOf(expiryDate);
    if (!ymd) return false;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return ymd < today;
};

/** Signing state computed in the browser (fallback when the database sent no `state`). */
export const computeDocState = (type: unknown, data: Record<string, any> | null | undefined, createdAt: unknown, now: Date = new Date()): DocState => {
    if (!isSignableType(type)) return 'readonly';
    if (isSignedData(data)) return 'signed';
    if (isDeclinedData(data)) return 'declined';
    if (expiryBlocksSigning(createdAt, data?.expiryDate, now)) return 'expired';
    return 'open';
};

/* =====================================================================================
   Money and portal grouping
   ===================================================================================== */

/** computeDocumentTotals(), with a fallback for documents that only carry a flat `amount` (receipts, work orders). */
export const documentTotals = (d: Record<string, any>): DocumentTotals & { hasMoney: boolean } => {
    const totals = computeDocumentTotals(d);
    const hasItems = Array.isArray(d.lineItems) && d.lineItems.length > 0;
    if (!hasItems) {
        const amount = toNumber(d.amount);
        if (amount > 0) {
            const paid = Math.max(0, toNumber(d.amountPaid));
            return { ...totals, subtotal: amount, taxableAmount: amount, total: amount, amountPaid: paid, balanceDue: Math.max(0, amount - paid), hasMoney: true };
        }
    }
    return { ...totals, hasMoney: hasItems };
};

/** Invoice the client still owes (old portal: every invoice not Paid; Cancelled / Void never count, Drafts are hidden). */
export const isUnpaidInvoice = (d: Record<string, any> | null | undefined): boolean =>
    !['paid', 'cancelled', 'canceled', 'void', 'draft'].includes(low(d?.status));

export type PortalTab = 'invoices' | 'approvals' | 'other';

export interface PortalDocLike {
    type: string;
    data: Record<string, any>;
    createdAt: string;
    state?: DocState | null;
}

/** Server verdict first, browser rules otherwise. */
export const stateOfDoc = (doc: PortalDocLike, now?: Date): DocState => doc.state || computeDocState(doc.type, doc.data, doc.createdAt, now);

export const portalTabOf = (type: string): PortalTab => (type === 'Invoice' ? 'invoices' : isSignableType(type) ? 'approvals' : 'other');

/** Tabs (Invoices / Estimates & change orders / Reports & other), "to sign" and the outstanding balance. */
export const groupPortalDocuments = <T extends PortalDocLike>(docs: T[], now?: Date) => {
    const invoices = docs.filter((d) => portalTabOf(d.type) === 'invoices');
    const approvals = docs.filter((d) => portalTabOf(d.type) === 'approvals');
    const other = docs.filter((d) => portalTabOf(d.type) === 'other');
    const awaiting = approvals.filter((d) => stateOfDoc(d, now) === 'open');
    const unpaid = invoices.filter((d) => isUnpaidInvoice(d.data) && documentTotals(d.data).balanceDue > 0);
    const outstanding = Math.round(unpaid.reduce((sum, d) => sum + documentTotals(d.data).balanceDue, 0) * 100) / 100;
    const currency = str(invoices[0]?.data?.currency) || 'USD';
    return { invoices, approvals, other, awaiting, unpaid, outstanding, currency };
};

/* =====================================================================================
   Links
   ===================================================================================== */

/**
 * Which link a shared message carries: the document's own link for anything a client can see (it works for
 * drafts too, unlike the portal), nothing for internal paperwork (no client page can show it).
 */
export const shareLinkKind = (docType: unknown): 'document' | 'none' => (isClientFacingType(docType) ? 'document' : 'none');

export interface ApprovalTokenRow {
    public_token?: string | null;
    approval_expires_at?: string | null;
    approval_used_at?: string | null;
    type?: string | null;
    status?: string | null;
    clientSignedAt?: string | null;
    clientDeclinedAt?: string | null;
    has_client_signature?: boolean | null;
}

/**
 * A new token is needed when there is none, when the link expired unused, or when the client already used it but
 * the document is open again (unlocked / re-sent before the database reset the link): copying the old one would
 * give the client a link that says "already used".
 */
export const needsNewApprovalToken = (row: ApprovalTokenRow, now: number = Date.now()): boolean => {
    if (!str(row.public_token)) return true;
    const expiresAt = Date.parse(str(row.approval_expires_at));
    if (Number.isFinite(expiresAt) && !str(row.approval_used_at) && expiresAt < now + 60_000) return true;
    if (str(row.approval_used_at) && isSignableType(row.type)) {
        const decided = isSignedData({ status: row.status, clientSignedAt: row.clientSignedAt, clientSignatureUrl: row.has_client_signature ? 'yes' : '' })
            || isDeclinedData({ status: row.status, clientDeclinedAt: row.clientDeclinedAt });
        return !decided;
    }
    return false;
};

/* =====================================================================================
   Temporary clients (same `[TEMPORARY]` notes marker as the original app)
   ===================================================================================== */

export const TEMP_TAG = '[TEMPORARY]';

export const isTemporaryNotes = (notes: unknown): boolean => str(notes).includes(TEMP_TAG);
export const stripTempTag = (notes?: string | null): string => String(notes || '').replace(TEMP_TAG, '').trim();
/** Notes with the marker added (temporary) or removed (regular). */
export const withTempTag = (notes: string | null | undefined, temporary: boolean): string =>
    temporary ? `${TEMP_TAG} ${stripTempTag(notes)}`.trim() : stripTempTag(notes);

/**
 * "Create client & job" from a quote request made a NEW client (not an existing one it matched): the client and
 * the job were inserted in the same transaction, so their created_at are identical.
 */
export const isClientCreatedWithJob = (client: { created_at?: unknown } | null | undefined, job: { created_at?: unknown } | null | undefined): boolean => {
    const a = Date.parse(str(client?.created_at));
    const b = Date.parse(str(job?.created_at));
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
};
