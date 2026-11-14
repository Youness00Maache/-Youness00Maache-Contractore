/**
 * Small read-only document lookups used by the forms (row-level security scopes every query to the owner).
 * Failures never block the user: they return null / [] and the form keeps working.
 */
import { supabase } from '../../lib/supabase.ts';
import { FormType } from '../../types.ts';
import type { JobDocumentRow } from './contractValue.ts';
import { computeDocumentTotals } from '../../utils/money.ts';
import { OPTION_SELECT_PATHS } from '../../lib/estimateOptions.ts';

export interface JobInvoiceOption { id: string; number: string; status: string; total: number; balanceDue: number }

/** The job's invoices for the Receipt "For invoice" picker (newest first, totals from utils/money.ts). */
export async function fetchJobInvoices(jobId: string): Promise<JobInvoiceOption[]> {
    try {
        const { data, error } = await (supabase as any)
            .from('documents')
            .select([
                'id', 'number:data->>invoiceNumber', 'status:data->>status', 'lineItems:data->lineItems', 'taxRate:data->taxRate',
                'discount:data->discount', 'shipping:data->shipping', 'amountPaid:data->amountPaid', 'isProgressBilling:data->isProgressBilling',
            ].join(','))
            .eq('job_id', jobId)
            .eq('type', FormType.Invoice)
            .order('created_at', { ascending: false })
            .limit(100);
        if (error || !Array.isArray(data)) return [];
        return data.map((r: any) => {
            const totals = computeDocumentTotals({
                lineItems: Array.isArray(r.lineItems) ? r.lineItems : [], taxRate: r.taxRate, discount: r.discount, shipping: r.shipping,
                amountPaid: r.amountPaid, isProgressBilling: r.isProgressBilling === true || r.isProgressBilling === 'true',
            });
            return { id: String(r.id), number: String(r.number || ''), status: String(r.status || ''), total: totals.total, balanceDue: totals.balanceDue };
        });
    } catch {
        return [];
    }
}

/** Estimates and change orders of a job, with only the fields the contract value needs (no signature images). */
export async function fetchJobContractRows(jobId: string): Promise<JobDocumentRow[]> {
    try {
        const { data, error } = await (supabase as any)
            .from('documents')
            .select([
                'id', 'type', 'created_at',
                'status:data->>status', 'clientSignedAt:data->>clientSignedAt', 'revisionOf:data->>revisionOf',
                'estimateNumber:data->>estimateNumber', 'changeOrderNumber:data->>changeOrderNumber',
                'lineItems:data->lineItems', 'taxRate:data->taxRate', 'discount:data->discount', 'shipping:data->shipping',
                // good/better/best options: the option that counts (lib/estimateOptions.ts)
                ...OPTION_SELECT_PATHS,
            ].join(','))
            .eq('job_id', jobId)
            .in('type', [FormType.Estimate, FormType.ChangeOrder])
            .order('created_at', { ascending: true })
            .limit(500);
        if (error || !Array.isArray(data)) return [];
        return data.map((r: any) => ({
            id: r.id,
            type: r.type,
            created_at: r.created_at,
            data: {
                status: r.status, clientSignedAt: r.clientSignedAt, revisionOf: r.revisionOf,
                estimateNumber: r.estimateNumber, changeOrderNumber: r.changeOrderNumber,
                lineItems: Array.isArray(r.lineItems) ? r.lineItems : [], taxRate: r.taxRate, discount: r.discount, shipping: r.shipping,
                ...(r.estimateOptions ? { estimateOptions: r.estimateOptions, clientOptionChoice: r.clientOptionChoice, clientSignedBy: r.clientSignedBy } : {}),
            },
        }));
    } catch {
        return [];
    }
}

/** The client's signature as stored right now (null when unknown/offline). */
export async function fetchServerSignature(documentId: string): Promise<{ signedAt: string; signedBy: string } | null> {
    try {
        const { data, error } = await (supabase as any)
            .from('documents')
            .select('signedAt:data->>clientSignedAt, signedBy:data->>clientSignedBy, signer:data->>clientSignerName')
            .eq('id', documentId)
            .maybeSingle();
        if (error || !data) return null;
        return { signedAt: String(data.signedAt || ''), signedBy: String(data.signedBy || data.signer || '') };
    } catch {
        return null;
    }
}

/** Invoices already created from this estimate ("Convert to invoice"). */
export async function fetchInvoicesFromEstimate(jobId: string, estimateId: string): Promise<Array<{ id: string; number: string }>> {
    try {
        const { data, error } = await (supabase as any)
            .from('documents')
            .select('id, number:data->>invoiceNumber')
            .eq('job_id', jobId)
            .eq('type', FormType.Invoice)
            .eq('data->>sourceEstimateId', estimateId)
            .limit(20);
        if (error || !Array.isArray(data)) return [];
        return data.map((r: any) => ({ id: String(r.id), number: String(r.number || '') }));
    } catch {
        return [];
    }
}
