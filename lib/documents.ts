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
    'viewedByProvider:data->>viewedByProvider',
    'isAiGenerated:data->>isAiGenerated',
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
    viewedByProvider: String(row.viewedByProvider).toLowerCase() === 'true',
    isAiGenerated: String(row.isAiGenerated).toLowerCase() === 'true',
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
    if (missing.length) {
        const { data, error } = await supabase.from('documents').select(DOCUMENT_DETAIL_COLUMNS).in('id', missing);
        if (error) throw new Error(error.message || 'Could not load documents.');
        for (const row of data || []) {
            const mapped = mapDocumentRow(row, true);
            remember(mapped);
            found.push(mapped);
        }
    }
    return found;
}

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

/** True for documents a client has signed/accepted that the contractor hasn't seen yet. */
export const isUnseenClientSignedDocument = (form: FormDataType): boolean => {
    const d = form.data as any;
    if (!d) return false;
    return (String(d.status || '').toLowerCase() === 'accepted' || Boolean(d.clientSignatureUrl) || Boolean(d.clientSignedAt)) && !d.viewedByProvider;
};

/** Human label for a document card / list row. */
export const getDocumentTitle = (form: FormDataType): string => {
    const d = (form.data || {}) as any;
    return d.title || d.invoiceNumber || d.estimateNumber || d.reportNumber || d.workOrderNumber || d.warrantyNumber
        || d.changeOrderNumber || d.poNumber || d.receiptNumber || form.type;
};

/** Reference-number fields that should get a "-COPY" suffix when duplicating. */
export const DOCUMENT_NUMBER_FIELDS = [
    'invoiceNumber', 'estimateNumber', 'reportNumber', 'workOrderNumber', 'warrantyNumber',
    'changeOrderNumber', 'poNumber', 'receiptNumber',
] as const;

/** Clean copy of a document's data for "Duplicate": draft status, no client signature/approval state. */
export const buildDuplicateDocumentData = (data: Record<string, any>, overrides: Record<string, any> = {}): Record<string, any> => {
    const {
        clientSignatureUrl: _sig, clientSignedAt: _signedAt, clientSignedBy: _signedBy, clientSignerName: _signer,
        viewedByProvider: _viewed, approvedAt: _approvedAt, inventoryDeductedAt: _deducted,
        [LIGHTWEIGHT_DOCUMENT_FLAG]: _flag,
        ...rest
    } = (data || {}) as any;
    const next: Record<string, any> = { ...rest };
    if (next.status) next.status = 'Draft';
    if (next.title) next.title = `${next.title} (Copy)`;
    for (const key of DOCUMENT_NUMBER_FIELDS) {
        if (next[key]) next[key] = `${next[key]}-COPY`;
    }
    if (typeof next.deductInventory === 'boolean') next.deductInventory = false;
    return { ...next, ...overrides };
};
