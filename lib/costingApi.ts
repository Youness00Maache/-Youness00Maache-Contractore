/**
 * Database side of job costing and "Bill time & materials" (lib/costing.ts, lib/tmInvoice.ts hold the logic).
 * No migration: everything lives in the documents' own `data` (T&M record on the invoice, billed markers on the
 * entries) and in public.user_settings (lib/userData.ts).
 */
import { supabase } from './supabase.ts';
import { FormType } from '../types.ts';
import type { FormData as FormDataType, Job, LineItem, UserProfile } from '../types.ts';
import { describeError, isMissingColumnError, isPlanLimitError, planLimitMessage } from './account.ts';
import { DOCUMENT_DETAIL_COLUMNS, ID_CHUNK, assertFullDocument, chunk, mapDocumentRow, primeDocumentCache, stripLightweightFlag } from './documents.ts';
import { newId, todayISO } from '../components/forms/formUtils.ts';
import type { CostingDoc } from './costing.ts';
import { OPTION_SELECT_PATHS } from './estimateOptions.ts';
import { buildTmInvoiceData, nextInvoiceNumber, withBilledMarker, type TmRecord } from './tmInvoice.ts';

/** Only the JSON paths job money, costing and T&M need: never downloads photos / signatures (CORE-011). */
export const COSTING_COLUMNS = [
    'id', 'type', 'jobId:job_id', 'createdAt:created_at',
    'status:data->>status',
    'lineItems:data->lineItems',
    'discount:data->>discount',
    'shipping:data->>shipping',
    'taxRate:data->>taxRate',
    'isProgressBilling:data->>isProgressBilling',
    'amountPaid:data->>amountPaid',
    'items:data->items',
    'materials:data->materials',
    'hoursWorked:data->>hoursWorked',
    'overtimeHours:data->>overtimeHours',
    'workerName:data->>workerName',
    'notes:data->>notes',
    'amount:data->>amount',
    'tax:data->>tax',
    'category:data->>category',
    'vendor:data->>vendor',
    'item:data->>item',
    'date:data->>date',
    'issueDate:data->>issueDate',
    'invoiceNumber:data->>invoiceNumber',
    'invoiceId:data->>invoiceId',
    'poNumber:data->>poNumber',
    'description:data->>description',
    'title:data->>title',
    'clientSignedAt:data->>clientSignedAt',
    'tm:data->timeAndMaterials',
    'billedInvoiceId:data->>billedInvoiceId',
    'billedInvoiceNumber:data->>billedInvoiceNumber',
    'billedDocId:data->>billedDocId',
    'billedItems:data->billedItems',
    // good/better/best options: the budget counts the option that counts (lib/estimateOptions.ts)
    ...OPTION_SELECT_PATHS,
    'estimateOptionsInternal:data->estimateOptionsInternal',
].join(', ');

export const COSTING_TYPES: FormType[] = [
    FormType.Invoice, FormType.Receipt, FormType.Estimate, FormType.ChangeOrder,
    FormType.MaterialLog, FormType.TimeSheet, FormType.ExpenseLog, FormType.PurchaseOrder,
];

const MAX_ROWS = 2000;

/** Every money document of a job (owner RLS), as the light rows lib/finance.ts / costing.ts / tmInvoice.ts read. */
export async function fetchJobCostingDocs(jobId: string): Promise<CostingDoc[]> {
    const { data, error } = await supabase
        .from('documents')
        .select(COSTING_COLUMNS)
        .eq('job_id', jobId)
        .in('type', COSTING_TYPES)
        .order('created_at', { ascending: true })
        .limit(MAX_ROWS);
    if (error) throw new Error(error.message || 'Could not load the numbers for this job.');
    return (data || []) as unknown as CostingDoc[];
}

/** Invoice numbers already used (newest 1000), so the T&M invoice gets the next free one like the form does. */
async function usedInvoiceNumbers(): Promise<string[]> {
    try {
        const { data } = await supabase.from('documents').select('num:data->>invoiceNumber').eq('type', FormType.Invoice)
            .order('created_at', { ascending: false }).limit(1000);
        return ((data || []) as Array<{ num?: unknown }>).map(r => r?.num).filter((n): n is string => typeof n === 'string' && !!n);
    } catch {
        return [];
    }
}

/** The Free plan's document limit refused the invoice (the caller opens the upgrade window). */
export class TmPlanLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TmPlanLimitError';
    }
}

export interface TmInvoiceResult {
    invoice: FormDataType;
    /** time sheets / material logs / expense logs that now carry the billed marker */
    updated: FormDataType[];
    /** entries whose marker could not be written (the invoice's own record still keeps them billed) */
    markFailed: number;
}

const ENTRY_TYPES: Record<string, 'time sheet' | 'material log' | 'expense log'> = {
    [FormType.TimeSheet]: 'time sheet', [FormType.MaterialLog]: 'material log', [FormType.ExpenseLog]: 'expense log',
};

/**
 * Saves the Draft T&M invoice (same record shape as a form save: id, user_id, job_id, type, data, client_id), then
 * writes the billed marker on every entry it billed. Check the Free plan's slot BEFORE calling (App ensureDocSlot);
 * the database enforces it too (TmPlanLimitError).
 */
export async function createTmInvoice(args: {
    userId: string;
    job: Job & { clientId?: string | null };
    profile?: UserProfile | null;
    lines: LineItem[];
    record: TmRecord;
    /** numbers the app already knows (loaded documents) */
    knownNumbers?: string[];
}): Promise<TmInvoiceResult> {
    const number = nextInvoiceNumber([...(await usedInvoiceNumbers()), ...(args.knownNumbers || [])]);
    const id = newId();
    const tm: TmRecord = { ...args.record, invoiceId: id };
    const data = buildTmInvoiceData({ job: args.job, profile: args.profile, lines: args.lines, number, record: tm, today: todayISO() });
    assertFullDocument({ data });
    const record: Record<string, unknown> = { id, user_id: args.userId, job_id: args.job.id, type: FormType.Invoice, data };
    if (args.job.clientId) record.client_id = args.job.clientId;
    let res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
    if (res.error && 'client_id' in record && isMissingColumnError(res.error)) {
        delete record.client_id;
        res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
    }
    if (res.error) {
        if (isPlanLimitError(res.error)) throw new TmPlanLimitError(planLimitMessage(res.error));
        throw new Error(describeError(res.error, 'The invoice could not be created.'));
    }
    const row = (res.data || {}) as { public_token?: string | null; created_at?: string | null };
    const invoice = mapDocumentRow({ ...record, public_token: row.public_token ?? null, created_at: row.created_at ?? new Date().toISOString() }, true);
    primeDocumentCache(invoice);

    // billed markers (best effort: the invoice's timeAndMaterials record is what prevents billing twice)
    const ids = Array.from(new Set([...args.record.timeSheetIds, ...Object.keys(args.record.materialItems), ...args.record.expenseLogIds]));
    const updated: FormDataType[] = [];
    let markFailed = 0;
    const at = new Date().toISOString();
    for (const part of chunk(ids, ID_CHUNK)) {
        // fresh copies (never a cached one): only the marker is added, everything else is written back as it is
        const { data: rows, error } = await supabase.from('documents').select(DOCUMENT_DETAIL_COLUMNS).in('id', part);
        if (error || !rows) { markFailed += part.length; continue; }
        markFailed += part.length - rows.length;
        for (const batch of chunk(rows as any[], 6)) {
            const results = await Promise.allSettled(batch.map(async (r) => {
                const full = mapDocumentRow(r, true);
                const kind = ENTRY_TYPES[full.type];
                if (!kind) throw new Error('not an entry');
                const next = withBilledMarker(stripLightweightFlag(full.data as unknown as Record<string, unknown>), full.id, kind, { id: invoice.id, number }, at, args.record.materialItems[full.id] || []);
                assertFullDocument({ data: next });
                const { error: upErr } = await supabase.from('documents').update({ data: next }).eq('id', full.id);
                if (upErr) throw upErr;
                const saved = { ...full, data: next } as unknown as FormDataType;
                primeDocumentCache(saved);
                return saved;
            }));
            for (const r of results) {
                if (r.status === 'fulfilled') updated.push(r.value);
                else markFailed++;
            }
        }
    }
    return { invoice, updated, markFailed };
}
