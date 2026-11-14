/**
 * Document data layer (owned by CORE).
 *
 * Lists keep documents as LIGHTWEIGHT summaries (metadata only, `data.__lightweight === true`).
 * Anything that needs the real content (open, PDF, email, duplicate, totals) must call
 * `fetchFullDocument(id)` / `ensureFullDocument(form)`. A summary must NEVER be written back to the
 * database: use `assertFullDocument()` before any write that sends `data`.
 */
import { supabase } from './supabase.ts';
import { FormType } from '../types.ts';
import type { FormData as FormDataType } from '../types.ts';
import { resolveFormType } from '../src/config/docTypeMap.ts';
import { optionsForCopy } from './estimateOptions.ts';

export const LIGHTWEIGHT_DOCUMENT_FLAG = '__lightweight';
export const DOCUMENT_PAGE_SIZE = 20;
export const RECENT_DOCUMENTS_LIMIT = 50;

/** Columns for list views: only small JSON paths, never the whole `data` object. */
export const DOCUMENT_METADATA_COLUMNS = [
    'id', 'user_id', 'job_id', 'type', 'created_at', 'public_token',
    'title:data->>title',
    'invoiceNumber:data->>invoiceNumber',
    'estimateNumber:data->>estimateNumber',
    'reportNumber:data->>reportNumber',
    'workOrderNumber:data->>workOrderNumber',
    'warrantyNumber:data->>warrantyNumber',
    'changeOrderNumber:data->>changeOrderNumber',
    'poNumber:data->>poNumber',
    'receiptNumber:data->>receiptNumber',
    'status:data->>status',
    'clientName:data->>clientName',
    'clientSignatureUrl:data->>clientSignatureUrl',
    'clientSignedAt:data->>clientSignedAt',
    // a client's decline (portal / approval link): badges like a signature (PARITY_V2 A6)
    'clientDeclinedAt:data->>clientDeclinedAt',
    'viewedByProvider:data->>viewedByProvider',
    'isAiGenerated:data->>isAiGenerated',
    // the client's "I've paid" (mirrored into data by migration 20261113000200; null before it)
    'paymentReportedAt:data->>paymentReportedAt',
].join(', ');

export const DOCUMENT_DETAIL_COLUMNS = 'id, user_id, job_id, type, created_at, public_token, data';

export const normalizeDocumentType = (type: string | null | undefined): FormType => {
    const resolved = resolveFormType(type);
    return (resolved || type || 'Document') as FormType;
};

const createLightweightDocumentData = (row: any, type: FormType) => ({
    title: row.title || row.invoiceNumber || row.estimateNumber || row.reportNumber || row.workOrderNumber
        || row.warrantyNumber || row.changeOrderNumber || row.poNumber || row.receiptNumber || type,
    invoiceNumber: row.invoiceNumber || undefined,
    estimateNumber: row.estimateNumber || undefined,
    reportNumber: row.reportNumber || undefined,
    workOrderNumber: row.workOrderNumber || undefined,
    warrantyNumber: row.warrantyNumber || undefined,
    changeOrderNumber: row.changeOrderNumber || undefined,
    poNumber: row.poNumber || undefined,
    receiptNumber: row.receiptNumber || undefined,
    status: row.status || undefined,
    clientName: row.clientName || undefined,
    clientSignatureUrl: row.clientSignatureUrl || undefined,
    clientSignedAt: row.clientSignedAt || undefined,
    clientDeclinedAt: row.clientDeclinedAt || undefined,
    viewedByProvider: String(row.viewedByProvider).toLowerCase() === 'true',
    isAiGenerated: String(row.isAiGenerated).toLowerCase() === 'true',
    paymentReportedAt: row.paymentReportedAt || undefined,
    [LIGHTWEIGHT_DOCUMENT_FLAG]: true,
} as any);

/** Maps a `documents` row to the app's FormData shape. `includeData` = the row carries the full `data` column. */
export const mapDocumentRow = (row: any, includeData = false): FormDataType => {
    const type = normalizeDocumentType(row.type);
    return {
        id: row.id,
        jobId: row.job_id,
        type,
        createdAt: row.created_at,
        public_token: row.public_token ?? undefined,
        data: includeData && row.data && typeof row.data === 'object'
            ? row.data
            : createLightweightDocumentData(row, type),
    } as FormDataType;
};

export const isLightweightDocument = (form?: FormDataType | null): boolean =>
    !form || !!((form.data as any)?.[LIGHTWEIGHT_DOCUMENT_FLAG]);

/** Throws if someone tries to persist a summary instead of the real document. */
export const assertFullDocument = (form: FormDataType | { data?: unknown } | null | undefined): void => {
    if (!form || !(form as any).data || (form as any).data[LIGHTWEIGHT_DOCUMENT_FLAG]) {
        throw new Error('Refusing to save a document summary over the full document. Reload the document and try again.');
    }
};

/** Removes our internal marker before data leaves the app (defensive). */
export const stripLightweightFlag = <T extends Record<string, any>>(data: T): T => {
    if (!data || typeof data !== 'object' || !(LIGHTWEIGHT_DOCUMENT_FLAG in data)) return data;
    const { [LIGHTWEIGHT_DOCUMENT_FLAG]: _ignored, ...rest } = data as any;
    return rest as T;
};

/** Merges new rows into a list, never replacing a full document with a summary. Newest first. */
export const mergeDocuments = (prev: FormDataType[], incoming: FormDataType[]): FormDataType[] => {
    const byId = new Map(prev.map(f => [f.id, f]));
    for (const doc of incoming) {
        const existing = byId.get(doc.id);
        if (existing && !isLightweightDocument(existing) && isLightweightDocument(doc)) {
            // keep the full copy, but refresh the cheap metadata that may have changed server-side
            const d = doc.data as any;
            byId.set(doc.id, {
                ...existing,
                public_token: doc.public_token ?? existing.public_token,
                data: {
                    ...(existing.data as any),
                    status: d.status ?? (existing.data as any).status,
                    viewedByProvider: d.viewedByProvider || (existing.data as any).viewedByProvider,
                    clientSignatureUrl: d.clientSignatureUrl || (existing.data as any).clientSignatureUrl,
                    // a signature / decline that arrived while the full copy was open
                    ...(d.clientSignedAt ? { clientSignedAt: d.clientSignedAt } : {}),
                    ...(d.clientDeclinedAt ? { clientDeclinedAt: d.clientDeclinedAt } : {}),
                    // a new "I've paid" from the client shows up without reopening the invoice
                    ...(d.paymentReportedAt ? { paymentReportedAt: d.paymentReportedAt } : {}),
                },
            });
        } else {
            byId.set(doc.id, doc);
        }
    }
    return Array.from(byId.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
};

// ---------------------------------------------------------------------------
// Full-document cache
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map<string, { form: FormDataType; at: number }>();
const inflight = new Map<string, Promise<FormDataType>>();

const remember = (form: FormDataType) => {
    cache.delete(form.id);
    cache.set(form.id, { form, at: Date.now() });
    while (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
};

/** Puts a freshly saved/loaded full document into the cache. Summaries are ignored. */
export const primeDocumentCache = (form: FormDataType | null | undefined): void => {
    if (form && !isLightweightDocument(form)) remember(form);
};

export const invalidateDocument = (id: string): void => {
    cache.delete(id);
};

export const clearDocumentCache = (): void => {
    cache.clear();
    inflight.clear();
};

export const getCachedFullDocument = (id: string): FormDataType | null => {
    const hit = cache.get(id);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        cache.delete(id);
        return null;
    }
    return hit.form;
};

/**
 * Loads one document with its full `data` (owner RLS applies). Concurrent calls for the same id share one request.
 * Throws a readable Error when the document does not exist or cannot be read.
 */
export async function fetchFullDocument(id: string, options: { force?: boolean } = {}): Promise<FormDataType> {
    if (!id) throw new Error('Missing document id');
    if (!options.force) {
        const cached = getCachedFullDocument(id);
        if (cached) return cached;
        const pending = inflight.get(id);
        if (pending) return pending;
    }
    const request = (async () => {
        const { data, error } = await supabase
            .from('documents')
            .select(DOCUMENT_DETAIL_COLUMNS)
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error(error.message || 'Could not load the document.');
        if (!data) throw new Error('This document no longer exists or you do not have access to it.');
        const mapped = mapDocumentRow(data, true);
        remember(mapped);
        return mapped;
    })();
    inflight.set(id, request);
    try {
        return await request;
    } finally {
        inflight.delete(id);
    }
}

/** Returns the full version of a (possibly lightweight) document. */
export async function ensureFullDocument(form: FormDataType): Promise<FormDataType> {
    if (!isLightweightDocument(form)) return form;
    return fetchFullDocument(form.id);
}

/** Loads several full documents (one round-trip), using the cache where possible. */
export async function fetchFullDocuments(ids: string[]): Promise<FormDataType[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const found: FormDataType[] = [];
    const missing: string[] = [];
    for (const id of unique) {
        const cached = getCachedFullDocument(id);
        if (cached) found.push(cached); else missing.push(id);
    }
    // in chunks: hundreds of ids in one `.in()` make a URL the server refuses (Duplicate job, PARITY_V2 D4)
    for (const ids of chunk(missing, ID_CHUNK)) {
        const { data, error } = await supabase.from('documents').select(DOCUMENT_DETAIL_COLUMNS).in('id', ids);
        if (error) throw new Error(error.message || 'Could not load documents.');
        for (const row of data || []) {
            const mapped = mapDocumentRow(row, true);
            remember(mapped);
            found.push(mapped);
        }
    }
    // same order as asked (callers copy / list them in the order the user saw)
    const order = new Map(unique.map((id, i) => [id, i]));
    return found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Splits a list into pieces of `size` (last one shorter). */
export const chunk = <T,>(list: readonly T[], size: number): T[][] => {
    const out: T[][] = [];
    const n = Math.max(1, Math.floor(size));
    for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
};

/** Ids per `.in()` request / rows per insert. */
export const ID_CHUNK = 100;

/**
 * Every document of a job as list summaries (all pages, not just the first 20): Duplicate job lists and copies all of
 * them, like the original app (PARITY_V2 D4). Newest first.
 */
export async function fetchAllJobDocumentSummaries(jobId: string, pageSize = 1000, maxRows = 20000): Promise<FormDataType[]> {
    const rows: FormDataType[] = [];
    for (let from = 0; from < maxRows; from += pageSize) {
        const { data, error } = await supabase
            .from('documents')
            .select(DOCUMENT_METADATA_COLUMNS)
            .eq('job_id', jobId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message || 'Could not load the documents of this job.');
        rows.push(...(data || []).map((row: any) => mapDocumentRow(row)));
        if (!data || data.length < pageSize) break;
    }
    return rows;
}

/**
 * Free plan: how many of the selected documents fit in the new job (the database refuses the whole insert past the
 * per-job limit). `allowed` null = no limit. The first ones in the user's order are copied.
 */
export const planDuplicateCopies = <T,>(selected: readonly T[], allowed: number | null): { copy: T[]; left: T[] } => {
    if (allowed === null || allowed >= selected.length) return { copy: [...selected], left: [] };
    const n = Math.max(0, Math.floor(allowed));
    return { copy: selected.slice(0, n), left: selected.slice(n) };
};

/** Server-side flag update (RPC `mark_documents_viewed`): never rewrites `data` from the browser. */
export async function markDocumentsViewed(ids: string[]): Promise<void> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (!unique.length) return;
    const { error } = await supabase.rpc('mark_documents_viewed', { p_document_ids: unique });
    if (error) throw new Error(error.message || 'Could not update documents.');
    for (const id of unique) {
        const hit = cache.get(id);
        if (hit) remember({ ...hit.form, data: { ...(hit.form.data as any), viewedByProvider: true } });
    }
}

const isViewed = (d: any) => d.viewedByProvider === true || String(d.viewedByProvider).toLowerCase() === 'true';

/** True for documents a client has signed/accepted that the contractor hasn't seen yet. */
export const isUnseenClientSignedDocument = (form: FormDataType): boolean => {
    const d = form.data as any;
    if (!d) return false;
    return (String(d.status || '').toLowerCase() === 'accepted' || Boolean(d.clientSignatureUrl) || Boolean(d.clientSignedAt)) && !isViewed(d);
};

/** True for documents a client has declined (portal / approval link) that the contractor hasn't seen yet. */
export const isUnseenClientDeclinedDocument = (form: FormDataType): boolean => {
    const d = form.data as any;
    if (!d) return false;
    return Boolean(d.clientDeclinedAt) && !isUnseenClientSignedDocument(form) && !isViewed(d);
};

/** Any client decision (signed or declined) not seen yet: the Clients badge (PARITY_V2 A6). */
export const isUnseenClientDecision = (form: FormDataType): boolean =>
    isUnseenClientSignedDocument(form) || isUnseenClientDeclinedDocument(form);

/**
 * Every document with a client decision the contractor hasn't seen, however old (the App's list only holds the 50
 * newest documents, so badges used to miss older ones). Summaries only; merge them into the App's list.
 */
export async function fetchUnseenClientDecisions(userId: string, limit = 500): Promise<FormDataType[]> {
    const { data, error } = await supabase
        .from('documents')
        .select(DOCUMENT_METADATA_COLUMNS)
        .eq('user_id', userId)
        .or('data->>clientSignedAt.not.is.null,data->>clientDeclinedAt.not.is.null,data->>clientSignatureUrl.not.is.null,data->>status.eq.Accepted')
        .or('data->>viewedByProvider.is.null,data->>viewedByProvider.neq.true')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message || 'Could not load client activity.');
    return (data || []).map((row: any) => mapDocumentRow(row)).filter(isUnseenClientDecision);
}

/** Human label for a document card / list row. */
export const getDocumentTitle = (form: FormDataType): string => {
    const d = (form.data || {}) as any;
    return d.title || d.invoiceNumber || d.estimateNumber || d.reportNumber || d.workOrderNumber || d.warrantyNumber
        || d.changeOrderNumber || d.poNumber || d.receiptNumber || form.type;
};

const WORK_ORDER_STATUSES = ['Scheduled', 'In Progress', 'On Hold', 'Completed'];

/** Reference-number fields that should get a "-COPY" suffix when duplicating. */
export const DOCUMENT_NUMBER_FIELDS = [
    'invoiceNumber', 'estimateNumber', 'reportNumber', 'workOrderNumber', 'warrantyNumber',
    'changeOrderNumber', 'poNumber', 'receiptNumber',
] as const;

/** Clean copy of a document's data for "Duplicate": draft status, no client signature/approval state. */
export const buildDuplicateDocumentData = (data: Record<string, any>, overrides: Record<string, any> = {}): Record<string, any> => {
    const {
        clientSignatureUrl: _sig, clientSignedAt: _signedAt, clientSignedBy: _signedBy, clientSignerName: _signer,
        clientDeclinedAt: _declinedAt, clientDeclineReason: _declineReason,
        viewedByProvider: _viewed, approvedAt: _approvedAt, inventoryDeductedAt: _deducted,
        // a copy never belongs to a recurring series: it would start a second series, and a copy of a generated
        // invoice would clash with the original on the (source, period) unique index (PARITY_V2 D2)
        recurrenceSourceId: _recurrenceSource, recurrencePeriod: _recurrencePeriod,
        // a copy starts unpaid: no client payment report, no recorded payments, no review request
        paymentReportedAt: _reported, paymentReportNote: _reportNote, paymentReportAmount: _reportAmount,
        payments: _payments, paidAt: _paidAt, reviewRequestedAt: _review,
        // a copy of a purchase order starts un-received (lib/suppliers.ts RECEIPT_KEY) and is not a reorder record
        internalStockReceipt: _stockReceipt, internalReorder: _reorder,
        // the client's pick of a good/better/best option belongs to the original's signature
        clientOptionChoice: _optionChoice,
        [LIGHTWEIGHT_DOCUMENT_FLAG]: _flag,
        ...rest
    } = (data || {}) as any;
    const next: Record<string, any> = { ...rest };
    // work orders have no "Draft": a copy starts as Scheduled (their first status)
    if (next.status) next.status = WORK_ORDER_STATUSES.includes(next.status) ? 'Scheduled' : 'Draft';
    if (next.recurrence && typeof next.recurrence === 'object') {
        const { nextRunDate: _n, lastRunDate: _l, anchorDay: _a, catchUp: _c, ...keep } = next.recurrence;
        next.recurrence = { ...keep, enabled: false };
    }
    if (next.title) next.title = `${next.title} (Copy)`;
    for (const key of DOCUMENT_NUMBER_FIELDS) {
        if (next[key]) next[key] = `${next[key]}-COPY`;
    }
    if (typeof next.deductInventory === 'boolean') next.deductInventory = false;
    // good/better/best options are offered again with no choice (an applied estimate is copied as its option)
    if (next.estimateOptions) {
        delete next.estimateOptions;
        delete next.estimateOptionsInternal;
        Object.assign(next, optionsForCopy(data));
    }
    // payments recorded with "Mark as paid" are not copied (a deposit typed on the original stays)
    if (Array.isArray(_payments) && _payments.length && next.amountPaid !== undefined) {
        const recorded = _payments.reduce((s: number, p: any) => s + (Number(p?.amount) || 0), 0);
        const left = Math.round(Math.max(0, (Number(next.amountPaid) || 0) - recorded) * 100) / 100;
        if (left > 0) next.amountPaid = left; else delete next.amountPaid;
    }
    return { ...next, ...overrides };
};
