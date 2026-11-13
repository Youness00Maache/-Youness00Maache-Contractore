/**
 * Database side of the "get paid" features (migration 20261113000200_pay_review_financing.sql). Every function
 * degrades gracefully when that migration is not applied yet: reads return null ("feature not available") and the
 * public "I've paid" call returns 'unsupported', like the other optional RPCs in lib/.
 */
import { supabase } from './supabase.ts';
import { FormType } from '../types.ts';
import type { FormData as FormDataType, InvoiceData, Job, UserProfile } from '../types.ts';
import { describeError, isMissingColumnError, isPlanLimitError, planLimitMessage } from './account.ts';
import { mapDocumentRow } from './documents.ts';
import { isMissingFunctionError } from '../utils/clientLinks.ts';
import { newId, nextDocumentNumber } from '../components/forms/formUtils.ts';
import {
    applyPayment, buildPaymentReceipt, cleanReportNote, markPaidProblem, paymentSettingsRow, paymentSettingsProblem,
    withoutPaymentReport, type MarkPaidInput, type PaymentSettings,
} from './payments.ts';

const REPORT_COLUMNS_CLEARED = { payment_reported_at: null, payment_report_note: null, payment_report_amount: null };

// ---------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------
/** Saves the payment / review / financing settings. 'unsupported' when the database doesn't have the columns yet. */
export async function savePaymentSettings(userId: string, settings: PaymentSettings): Promise<'saved' | 'unsupported'> {
    const problem = paymentSettingsProblem(settings);
    if (problem) throw new Error(problem);
    const { error } = await supabase.from('profiles').update(paymentSettingsRow(settings)).eq('id', userId);
    if (error && isMissingColumnError(error)) return 'unsupported';
    if (error) throw new Error(describeError(error, 'Your payment settings could not be saved.'));
    return 'saved';
}

// ---------------------------------------------------------------------------------------------------------------
// Client: "I've paid"
// ---------------------------------------------------------------------------------------------------------------
export type ReportTarget = { portalKey: string; documentId: string } | { token: string };

/** Records the client's "I've paid" (optional note such as "PayPal, Nov 14"). 'unsupported' = RPC not deployed yet. */
export async function reportPaymentPublic(target: ReportTarget, note: string, amount?: number | null): Promise<'ok' | 'unsupported'> {
    const common = { p_note: cleanReportNote(note) || null, p_amount: amount && amount > 0 ? amount : null };
    const { data, error } = 'portalKey' in target
        ? await supabase.rpc('report_payment_via_portal', { p_key: target.portalKey, p_doc_id: target.documentId, ...common })
        : await supabase.rpc('report_payment_by_token', { doc_token: target.token, ...common });
    if (error && isMissingFunctionError(error)) return 'unsupported';
    if (error) throw new Error(error.message || 'Request failed');
    const payload = data && typeof data === 'object' ? (data as Record<string, any>) : null;
    if (payload?.error) throw new Error(String(payload.error));
    if (payload && payload.success === false) throw new Error(String(payload.message || 'Request failed'));
    return 'ok';
}

// ---------------------------------------------------------------------------------------------------------------
// Contractor: reports to look at
// ---------------------------------------------------------------------------------------------------------------
export interface ReportedPayment {
    id: string;
    jobId: string;
    createdAt: string;
    publicToken: string | null;
    number: string;
    title: string;
    clientName: string;
    status: string;
    reportedAt: string;
    note: string;
    amount: number | null;
}

/** Invoices with an "I've paid" report that are not marked paid yet, newest first. null = feature not available. */
export async function fetchReportedPayments(limit = 20): Promise<ReportedPayment[] | null> {
    const { data, error } = await supabase
        .from('documents')
        .select('id, job_id, created_at, public_token, payment_reported_at, payment_report_note, payment_report_amount, invoiceNumber:data->>invoiceNumber, title:data->>title, clientName:data->>clientName, status:data->>status')
        .eq('type', FormType.Invoice)
        .not('payment_reported_at', 'is', null)
        .order('payment_reported_at', { ascending: false })
        .limit(limit);
    if (error || !Array.isArray(data)) return null;
    return (data as any[])
        .filter(r => !/^(paid|cancel+ed|void)$/i.test(String(r.status || '').trim()))
        .map(r => ({
            id: r.id,
            jobId: r.job_id,
            createdAt: r.created_at,
            publicToken: r.public_token ?? null,
            number: String(r.invoiceNumber || ''),
            title: String(r.title || ''),
            clientName: String(r.clientName || ''),
            status: String(r.status || ''),
            reportedAt: r.payment_reported_at,
            note: String(r.payment_report_note || ''),
            amount: r.payment_report_amount != null && Number(r.payment_report_amount) > 0 ? Number(r.payment_report_amount) : null,
        }));
}

/** Dismisses the client's report without recording a payment. */
export async function clearPaymentReport(documentId: string): Promise<'ok' | 'unsupported'> {
    const { error } = await supabase.from('documents').update(REPORT_COLUMNS_CLEARED).eq('id', documentId);
    if (error && isMissingColumnError(error)) return 'unsupported';
    if (error) throw new Error(describeError(error, 'Could not update the invoice.'));
    return 'ok';
}

// ---------------------------------------------------------------------------------------------------------------
// Contractor: Mark as paid
// ---------------------------------------------------------------------------------------------------------------
/** Next free receipt number (REC-YYYY-MM-n), like the Receipt form's numbering. */
export async function nextReceiptNumber(): Promise<string> {
    let existing: string[] = [];
    try {
        const { data } = await supabase
            .from('documents')
            .select('num:data->>receiptNumber')
            .eq('type', FormType.Receipt)
            .order('created_at', { ascending: false })
            .limit(1000);
        existing = ((data || []) as any[]).map(r => r?.num).filter((n): n is string => typeof n === 'string' && !!n);
    } catch { /* numbering falls back to the local guess */ }
    return nextDocumentNumber('REC', existing);
}

/** The invoice was updated but something after it failed; carries what was already saved so a retry can't duplicate it. */
export class PaymentSaveError extends Error {
    receipt: FormDataType | null;
    constructor(message: string, receipt: FormDataType | null) {
        super(message);
        this.name = 'PaymentSaveError';
        this.receipt = receipt;
    }
}

export interface RecordPaymentResult {
    invoice: FormDataType;
    receipt: FormDataType | null;
    /** set when the receipt could not be created (the payment itself was recorded) */
    receiptProblem: { kind: 'limit' | 'error'; message: string } | null;
    paidInFull: boolean;
    balanceAfter: number;
}

const insertDocument = async (record: Record<string, unknown>) => {
    let res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
    if (res.error && 'client_id' in record && isMissingColumnError(res.error)) {
        const { client_id: _c, ...rest } = record as any;
        res = await supabase.from('documents').insert(rest).select('public_token, created_at').maybeSingle();
    }
    return res;
};

/**
 * One tap "Mark as paid": creates the Receipt (counts as a document; a Free plan limit only skips the receipt), then
 * saves the invoice (amount paid, Paid status, payment history) and clears the client's "I've paid" report.
 * The database moves stock for paid invoices by itself, exactly as when the invoice form is saved as Paid.
 */
export async function recordInvoicePayment(args: {
    invoice: FormDataType;
    userId: string;
    profile?: Partial<UserProfile> | null;
    job?: Partial<Job> | null;
    clientId?: string | null;
    input: MarkPaidInput;
    createReceipt: boolean;
    /** receipt created by an earlier attempt whose invoice update failed (never created twice) */
    existingReceipt?: FormDataType | null;
}): Promise<RecordPaymentResult> {
    const { invoice, input } = args;
    const problem = markPaidProblem(input);
    if (problem) throw new Error(problem);
    const inv = (invoice.data || {}) as InvoiceData;
    if ((inv as any).__lightweight) throw new Error('Reload the invoice and try again.');

    // 1. the receipt
    let receipt: FormDataType | null = args.existingReceipt ?? null;
    let receiptProblem: RecordPaymentResult['receiptProblem'] = null;
    const preview = applyPayment(inv, input, { paymentId: 'preview' });
    if (args.createReceipt && !receipt) {
        const receiptNumber = await nextReceiptNumber();
        const data = buildPaymentReceipt(inv, invoice.id, input, receiptNumber, args.profile, args.job, preview.paidInFull);
        const record: Record<string, unknown> = { id: newId(), user_id: args.userId, job_id: invoice.jobId, type: FormType.Receipt, data };
        if (args.clientId) record.client_id = args.clientId;
        const { data: row, error } = await insertDocument(record);
        if (error) {
            receiptProblem = isPlanLimitError(error)
                ? { kind: 'limit', message: planLimitMessage(error) }
                : { kind: 'error', message: describeError(error, 'The receipt could not be created.') };
        } else {
            receipt = mapDocumentRow({ ...record, public_token: (row as any)?.public_token ?? null, created_at: (row as any)?.created_at ?? new Date().toISOString() }, true);
        }
    }

    // 2. the invoice
    const receiptData = receipt ? (receipt.data as any) : null;
    const result = applyPayment(inv, input, { paymentId: newId(), receiptId: receipt?.id, receiptNumber: receiptData?.receiptNumber });
    const data = withoutPaymentReport(result.data as InvoiceData & Record<string, any>);
    let res = await supabase.from('documents').update({ data, ...REPORT_COLUMNS_CLEARED }).eq('id', invoice.id).select('public_token').maybeSingle();
    if (res.error && isMissingColumnError(res.error)) {
        res = await supabase.from('documents').update({ data }).eq('id', invoice.id).select('public_token').maybeSingle();
    }
    if (res.error) throw new PaymentSaveError(describeError(res.error, 'The invoice could not be updated.'), receipt);
    if (!res.data) throw new PaymentSaveError('The invoice could not be updated. It may have been deleted.', receipt);

    const updated = mapDocumentRow({
        id: invoice.id, job_id: invoice.jobId, type: invoice.type, created_at: invoice.createdAt,
        public_token: (res.data as any)?.public_token ?? invoice.public_token ?? null, data,
    }, true);
    return { invoice: updated, receipt, receiptProblem, paidInFull: result.paidInFull, balanceAfter: result.balanceAfter };
}

/** Notes on the invoice that the review request went out (one request per invoice). */
export async function markReviewRequested(invoice: FormDataType, at = new Date()): Promise<FormDataType | null> {
    const data = { ...(invoice.data as any), reviewRequestedAt: at.toISOString() };
    if (data.__lightweight) return null;
    const { error } = await supabase.from('documents').update({ data }).eq('id', invoice.id);
    if (error) return null;
    return { ...invoice, data };
}
