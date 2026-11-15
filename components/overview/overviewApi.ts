/**
 * Business overview data (roadmap N3): plain owner-RLS reads, no database change.
 *   - the money documents of every job, with only the JSON paths the overview needs (the job costing columns + client name,
 *     due date, paid day, payments and the estimate answer fields; never signatures, logos or notes),
 *   - the job tasks (only when the Tasks tool is ready), mapped with the Tasks tool's own row mapper.
 * The last copy is kept on this device (lib/offline/deviceCache.ts), so the overview opens offline with the figures
 * last loaded; a fresh read replaces it as soon as there is a connection.
 */
import { supabase } from '../../lib/supabase.ts';
import { isOfflineFailure, readListCopy, saveListCopy } from '../../lib/offline/deviceCache.ts';
import { COSTING_COLUMNS, COSTING_TYPES } from '../../lib/costingApi.ts';
import { normalizeDocumentType } from '../../lib/documents.ts';
import { TASK_COLUMNS, mapTaskRow } from '../../lib/tasks/taskRows.ts';
import type { JobTask } from '../../lib/tasks/taskTypes.ts';
import type { OverviewDoc } from '../../lib/overview/types.ts';
import { fetchAllPages, friendlyError, getCurrentUserId } from '../viewKit.tsx';

export const OVERVIEW_COLUMNS = [
    COSTING_COLUMNS,
    'clientName:data->>clientName', 'dueDate:data->>dueDate', 'expiryDate:data->>expiryDate', 'paidAt:data->>paidAt',
    'payments:data->payments', 'clientSignatureUrl:data->>clientSignatureUrl', 'clientDeclinedAt:data->>clientDeclinedAt',
    'paymentReportedAt:data->>paymentReportedAt', 'revisionOf:data->>revisionOf',
].join(', ');

export interface OverviewData {
    docs: OverviewDoc[];
    /** null = the Tasks tool was not asked for / is not in the database */
    tasks: JobTask[] | null;
    loadedAt: number;
    /** more documents than one load reads (the oldest are left out) */
    truncated: boolean;
}

const COPY_NAME = 'overview';

/** A full `data` row (servers that reject JSON-path selects) -> the fields the overview reads. */
const mapFullRow = (r: any): OverviewDoc => {
    const d = r?.data && typeof r.data === 'object' ? r.data : {};
    return {
        id: r.id, type: r.type, jobId: r.job_id ?? null, createdAt: r.created_at,
        status: d.status, lineItems: d.lineItems, discount: d.discount, shipping: d.shipping, taxRate: d.taxRate,
        isProgressBilling: d.isProgressBilling, amountPaid: d.amountPaid, items: d.items, materials: d.materials,
        hoursWorked: d.hoursWorked, overtimeHours: d.overtimeHours, workerName: d.workerName, notes: d.notes, amount: d.amount, tax: d.tax,
        category: d.category, vendor: d.vendor, item: d.item, date: d.date, issueDate: d.issueDate, invoiceNumber: d.invoiceNumber,
        invoiceId: d.invoiceId, poNumber: d.poNumber, estimateNumber: d.estimateNumber, internalDeliveries: d.internalDeliveries,
        internalStockReceipt: d.internalStockReceipt, supplierInvoiceAmount: d.supplierInvoiceAmount, description: d.description,
        title: d.title, clientSignedAt: d.clientSignedAt, tm: d.timeAndMaterials, billedInvoiceId: d.billedInvoiceId,
        billedInvoiceNumber: d.billedInvoiceNumber, billedDocId: d.billedDocId, billedItems: d.billedItems,
        estimateOptions: d.estimateOptions, clientOptionChoice: d.clientOptionChoice, clientSignedBy: d.clientSignedBy,
        estimateOptionsInternal: d.estimateOptionsInternal,
        clientName: d.clientName, dueDate: d.dueDate, expiryDate: d.expiryDate, paidAt: d.paidAt, payments: d.payments,
        clientSignatureUrl: d.clientSignatureUrl, clientDeclinedAt: d.clientDeclinedAt, paymentReportedAt: d.paymentReportedAt,
        revisionOf: d.revisionOf,
    } as OverviewDoc;
};

const loadDocs = async (uid: string | null): Promise<{ docs: OverviewDoc[]; truncated: boolean }> => {
    const run = (select: string) => fetchAllPages<any>((from, to) => {
        let q = supabase.from('documents').select(select).in('type', COSTING_TYPES).order('created_at', { ascending: false }).order('id').range(from, to);
        if (uid) q = q.eq('user_id', uid);
        return q;
    });
    let res = await run(OVERVIEW_COLUMNS);
    let map = (r: any): OverviewDoc => r as OverviewDoc;
    if (res.error) {
        // servers that reject JSON-path selects: read `data` and pick the fields here
        res = await run('id,type,job_id,created_at,data');
        map = mapFullRow;
    }
    if (res.error) throw res.error;
    return { docs: res.rows.map(r => ({ ...map(r), type: normalizeDocumentType(r?.type) })), truncated: res.truncated };
};

/** Every task of the owner's jobs; null when the Tasks tool is not in the database or the read failed (the screen simply shows no task numbers). */
const loadTasks = async (): Promise<JobTask[] | null> => {
    try {
        const res = await fetchAllPages<any>((from, to) =>
            supabase.from('job_tasks').select(TASK_COLUMNS).order('created_at', { ascending: true }).order('id').range(from, to));
        if (res.error) return null; // missing table (Tasks tool not switched on) or a failed read: no task numbers
        return res.rows.map(mapTaskRow);
    } catch {
        return null;
    }
};

let memory: { uid: string; withTasks: boolean; data: OverviewData } | null = null;

/** The copy kept in memory or on this device (may be a little old), or null. */
export const peekOverviewData = async (): Promise<OverviewData | null> => {
    const uid = await getCurrentUserId();
    if (memory && uid && memory.uid === uid) return memory.data;
    const copy = uid ? await readListCopy<OverviewData>(COPY_NAME, uid) : null;
    return copy?.rows?.[0] ?? null;
};

export class OverviewOfflineError extends Error {
    constructor(message = 'You are offline.') { super(message); this.name = 'OverviewOfflineError'; }
}

/** Reads the server (throws when it can't: the caller keeps showing what it has). */
export const loadOverviewData = async (withTasks: boolean): Promise<OverviewData> => {
    const uid = (await getCurrentUserId()) || '';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OverviewOfflineError();
    let docs: { docs: OverviewDoc[]; truncated: boolean };
    try {
        docs = await loadDocs(uid || null);
    } catch (e) {
        if (isOfflineFailure(e)) throw new OverviewOfflineError();
        throw new Error(friendlyError(e, 'Could not load your documents.'));
    }
    const tasks = withTasks ? await loadTasks() : null;
    const data: OverviewData = { docs: docs.docs, tasks, loadedAt: Date.now(), truncated: docs.truncated };
    memory = { uid, withTasks, data };
    void saveListCopy(COPY_NAME, [data]); // the overview opens offline with its last copy
    return data;
};
