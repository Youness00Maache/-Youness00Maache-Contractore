/**
 * Pipeline board data: the documents that decide a job's stage (only the few JSON fields the board needs, never
 * signatures, logos or notes) and the quote requests. No database changes: plain owner-RLS reads.
 *
 * A small cache per signed-in user makes the dashboard strip and the board open instantly; both revalidate in the
 * background (stale-while-revalidate).
 */
import { supabase } from '../../lib/supabase.ts';
import { readListCopy, saveListCopy } from '../../lib/offline/deviceCache.ts';
import { FormType } from '../../types.ts';
import type { FormData as FormDataType } from '../../types.ts';
import { LIGHTWEIGHT_DOCUMENT_FLAG, normalizeDocumentType } from '../../lib/documents.ts';
import { mapPipelineRow, type PipelineDoc, type PipelineRequestInput } from '../../lib/pipeline.ts';
import { OPTION_SELECT_PATHS } from '../../lib/estimateOptions.ts';
import { fetchAllPages, getCurrentUserId } from '../viewKit.tsx';
import { listQuoteRequests } from '../requests/requestsApi.ts';
import type { QuoteRequest } from '../requests/requestLogic.ts';

/** Types that move a job between stages (work documents only count as "work logged"). */
export const PIPELINE_DOC_TYPES = [
    'Estimate', 'Invoice', 'Change Order', 'Receipt', 'Work Order', 'Daily Job Report', 'Time Sheet', 'Material Log', 'Expense Log',
];

const DOC_SELECT = [
    'id', 'type', 'job_id', 'created_at', 'public_token',
    'status:data->>status', 'title:data->>title', 'clientName:data->>clientName',
    'estimateNumber:data->>estimateNumber', 'invoiceNumber:data->>invoiceNumber', 'changeOrderNumber:data->>changeOrderNumber',
    'receiptNumber:data->>receiptNumber', 'workOrderNumber:data->>workOrderNumber',
    'issueDate:data->>issueDate', 'date:data->>date', 'dueDate:data->>dueDate', 'expiryDate:data->>expiryDate', 'paidAt:data->>paidAt',
    'lineItems:data->lineItems', 'taxRate:data->taxRate', 'discount:data->discount', 'shipping:data->shipping',
    'isProgressBilling:data->isProgressBilling', 'amountPaid:data->amountPaid', 'amount:data->amount',
    'clientSignedAt:data->>clientSignedAt', 'clientSignatureUrl:data->>clientSignatureUrl', 'clientDeclinedAt:data->>clientDeclinedAt',
    'paymentReportedAt:data->>paymentReportedAt', 'revisionOf:data->>revisionOf',
    // good/better/best options: an estimate is worth the option that counts (lib/estimateOptions.ts)
    ...OPTION_SELECT_PATHS,
].join(',');

export interface PipelineData {
    docs: PipelineDoc[];
    /** null = the request-a-quote feature is not in the database yet */
    requests: PipelineRequestInput[] | null;
    /** full QuoteRequest rows (the request window needs them) */
    requestRows: QuoteRequest[];
    loadedAt: number;
    /** more documents than one load reads (the oldest are left out) */
    truncated: boolean;
}

const FRESH_MS = 30_000;
let cache: { uid: string; data: PipelineData } | null = null;
let inflight: { uid: string; promise: Promise<PipelineData> } | null = null;

export const toPipelineRequest = (r: QuoteRequest): PipelineRequestInput => ({
    id: r.id, name: r.name, details: r.details, status: r.status, jobId: r.jobId, createdAt: r.createdAt, photoCount: r.photoPaths.length,
});

const loadDocs = async (uid: string | null): Promise<{ docs: PipelineDoc[]; truncated: boolean }> => {
    const run = (select: string) => fetchAllPages<any>((from, to) => {
        let q = supabase.from('documents').select(select).in('type', PIPELINE_DOC_TYPES).order('created_at', { ascending: false }).order('id').range(from, to);
        if (uid) q = q.eq('user_id', uid);
        return q;
    });
    let res = await run(DOC_SELECT);
    // servers that reject JSON-path selects: read `data` and pick the fields locally
    if (res.error) res = await run('id,type,job_id,created_at,public_token,data');
    if (res.error) throw new Error(res.error?.message || 'Could not load your documents.');
    return {
        docs: res.rows.map(row => ({ ...mapPipelineRow(row), type: normalizeDocumentType(row?.type) })),
        truncated: res.truncated,
    };
};

const loadRequests = async (): Promise<QuoteRequest[] | null> => {
    try {
        return await listQuoteRequests({ view: 'open', limit: 300 });
    } catch {
        return [];
    }
};

/** Cached data of the signed-in user (may be a little old), or null. */
export const peekPipelineData = async (): Promise<PipelineData | null> => {
    const uid = await getCurrentUserId();
    if (cache && uid && cache.uid === uid) return cache.data;
    // after a reload (e.g. offline): the board's last copy on this device
    const copy = uid ? await readListCopy<PipelineData>('pipeline', uid) : null;
    return copy?.rows?.[0] ?? null;
};

/** Loads (or returns fresh cached) board data. `force` always reads the server. */
export const loadPipelineData = async (force = false): Promise<PipelineData> => {
    const uid = (await getCurrentUserId()) || '';
    if (!force && cache && cache.uid === uid && Date.now() - cache.data.loadedAt < FRESH_MS) return cache.data;
    if (inflight && inflight.uid === uid) return inflight.promise;
    const promise = (async () => {
        const [docs, requestRows] = await Promise.all([loadDocs(uid || null), loadRequests()]);
        const data: PipelineData = {
            docs: docs.docs,
            requests: requestRows ? requestRows.map(toPipelineRequest) : null,
            requestRows: requestRows || [],
            loadedAt: Date.now(),
            truncated: docs.truncated,
        };
        cache = { uid, data };
        void saveListCopy('pipeline', [data]); // the board opens offline with its last copy
        return data;
    })();
    inflight = { uid, promise };
    try {
        return await promise;
    } finally {
        if (inflight?.promise === promise) inflight = null;
    }
};

/** A request changed in a window (seen, converted, archived, deleted): keep the cache in step. */
export const patchCachedRequest = (req: QuoteRequest | null, removedId?: string): void => {
    if (!cache) return;
    const rows = cache.data.requestRows.filter(r => r.id !== (req?.id ?? removedId));
    if (req && req.status !== 'archived') rows.unshift(req);
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    cache = { ...cache, data: { ...cache.data, requestRows: rows, requests: cache.data.requests ? rows.map(toPipelineRequest) : null } };
};

export const clearPipelineCache = (): void => { cache = null; };

const FORM_TYPES = Object.values(FormType) as string[];
const NUMBER_FIELD: Record<string, string> = {
    [FormType.Estimate]: 'estimateNumber',
    [FormType.Invoice]: 'invoiceNumber',
    [FormType.ChangeOrder]: 'changeOrderNumber',
    [FormType.Receipt]: 'receiptNumber',
    [FormType.WorkOrder]: 'workOrderNumber',
};

/**
 * A board document as the app's list summary (lightweight FormData): enough to open it, and the Mark as paid window
 * loads the full invoice itself. Never written back (lib/documents.ts assertFullDocument refuses summaries).
 */
export const toFormSummary = (doc: PipelineDoc): FormDataType => {
    const type = (FORM_TYPES.includes(doc.type) ? doc.type : normalizeDocumentType(doc.type)) as FormType;
    const numberField = NUMBER_FIELD[type];
    return {
        id: doc.id,
        jobId: doc.jobId || '',
        type,
        createdAt: doc.createdAt || '',
        public_token: doc.publicToken ?? undefined,
        data: {
            title: doc.title || doc.number || type,
            ...(numberField && doc.number ? { [numberField]: doc.number } : {}),
            status: doc.status || undefined,
            clientName: doc.clientName || undefined,
            clientSignedAt: doc.clientSignedAt || undefined,
            clientDeclinedAt: doc.clientDeclinedAt || undefined,
            paymentReportedAt: doc.paymentReportedAt || undefined,
            [LIGHTWEIGHT_DOCUMENT_FLAG]: true,
        } as any,
    };
};
