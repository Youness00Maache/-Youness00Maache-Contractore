/**
 * Reading the account for Settings > Integrations & data (roadmap N10): the rows the calendar file and the accounting
 * files are built from, plus saving a file to the device. READS ONLY: nothing here writes to the account. The pure
 * builders are icsCalendar.ts and accountingExport.ts.
 */
import { supabase } from '../supabase.ts';
import { createSupabaseExportSource } from '../export/supabaseSource.ts';
import { listAppointments, listLeads } from '../leads/leadsApi.ts';
import { listOpenTasks } from '../tasks/tasksApi.ts';
import { addDaysYmd, type CalendarDocRow, type CalendarInput, type CalendarJobRow } from './icsCalendar.ts';
import type { AccountingClient, AccountingDoc, AccountingJob } from './accountingExport.ts';

const PAGE = 500;
const MAX_DOCS = 6000;

type DbError = { code?: string; message?: string } | null;
const isMissingColumn = (e: DbError) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|Could not find the/i.test(`${e.message || ''}`));
const readable = (e: DbError, what: string) => new Error(`Could not read your ${what}: ${e?.message || 'no answer from the server'}. Check your connection and try again.`);

/** JSON-path select: only the fields the files need (no logos, signatures or styling are downloaded). */
const ACCOUNTING_FIELDS = [
    'status:data->>status', 'issueDate:data->>issueDate', 'date:data->>date', 'dueDate:data->>dueDate', 'title:data->>title',
    'invoiceNumber:data->>invoiceNumber', 'receiptNumber:data->>receiptNumber', 'invoiceId:data->>invoiceId', 'clientName:data->>clientName',
    'lineItems:data->lineItems', 'taxRate:data->taxRate', 'discount:data->discount', 'shipping:data->shipping',
    'isProgressBilling:data->isProgressBilling', 'amountPaid:data->amountPaid', 'payments:data->payments', 'paidAt:data->>paidAt',
    'amount:data->amount', 'tax:data->tax', 'vendor:data->>vendor', 'category:data->>category', 'item:data->>item',
    'description:data->>description', 'paymentMethod:data->>paymentMethod', 'paymentStatus:data->>paymentStatus',
].join(',');

const CALENDAR_DOC_FIELDS = [
    'status:data->>status', 'dueDate:data->>dueDate', 'expiryDate:data->>expiryDate', 'deliveryDate:data->>deliveryDate',
    'invoiceNumber:data->>invoiceNumber', 'estimateNumber:data->>estimateNumber', 'poNumber:data->>poNumber',
    'clientName:data->>clientName', 'supplier:data->>supplier',
].join(',');
const CALENDAR_INVOICE_FIELDS = `${CALENDAR_DOC_FIELDS},lineItems:data->lineItems,taxRate:data->taxRate,discount:data->discount,shipping:data->shipping,isProgressBilling:data->isProgressBilling,amountPaid:data->amountPaid`;

/** Reads every document of some types (paged), flattened rows -> { id, type, job_id, client_id, created_at, data }. */
async function readDocuments(userId: string, types: string[], fields: string, withClientId: boolean): Promise<AccountingDoc[]> {
    const out: AccountingDoc[] = [];
    let columns = `id,type,job_id,${withClientId ? 'client_id,' : ''}created_at,${fields}`;
    for (let from = 0; from < MAX_DOCS; from += PAGE) {
        let res = await supabase.from('documents').select(columns).eq('user_id', userId).in('type', types)
            .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
        if (res.error && withClientId && isMissingColumn(res.error)) {
            // an older database without documents.client_id: the job and the client's name still find the client
            withClientId = false;
            columns = `id,type,job_id,created_at,${fields}`;
            res = await supabase.from('documents').select(columns).eq('user_id', userId).in('type', types)
                .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
        }
        if (res.error) throw readable(res.error, 'documents');
        const rows = (res.data || []) as unknown as Array<Record<string, any>>;
        for (const r of rows) {
            const { id, type, job_id, client_id, created_at, ...data } = r;
            out.push({ id, type, job_id: job_id ?? null, client_id: client_id ?? null, created_at: created_at ?? null, data });
        }
        if (rows.length < PAGE) break;
    }
    return out;
}

export interface AccountingSource {
    documents: AccountingDoc[];
    jobs: AccountingJob[];
    clients: AccountingClient[];
}

/** Invoices, receipts and expense logs + jobs and clients (what every accounting file is built from). */
export async function loadAccountingSource(userId: string): Promise<AccountingSource> {
    const source = createSupabaseExportSource(supabase, userId);
    const [documents, jobs, clients] = await Promise.all([
        readDocuments(userId, ['Invoice', 'Receipt', 'Expense Log'], ACCOUNTING_FIELDS, true),
        (async () => { const rows: AccountingJob[] = []; for await (const page of source.pages('jobs', 1000)) rows.push(...page); return rows; })(),
        (async () => { const rows: AccountingClient[] = []; for await (const page of source.pages('clients', 1000)) rows.push(...page); return rows; })(),
    ]);
    return { documents, jobs, clients };
}

export interface CalendarSource {
    input: CalendarInput;
    /** parts that could not be read (a tool that is not switched on for this account, or a read that failed) */
    unavailable: string[];
}

/** What the calendar file is built from. Each part is read on its own: one that fails or is missing is skipped and named. */
export async function loadCalendarSource(userId: string, opts: { today: string; days: number; include: { jobs: boolean; appointments: boolean; followUps: boolean; tasks: boolean; dueDates: boolean } }): Promise<CalendarSource> {
    const unavailable: string[] = [];
    const windowEnd = addDaysYmd(opts.today, opts.days);
    const safe = async <T,>(label: string, run: () => Promise<T | null>): Promise<T | null> => {
        try {
            const v = await run();
            if (v === null) unavailable.push(label);
            return v;
        } catch {
            unavailable.push(label);
            return null;
        }
    };

    const jobs = opts.include.jobs || opts.include.tasks
        ? await safe<CalendarJobRow[]>('jobs', async () => {
            const rows: CalendarJobRow[] = [];
            const src = createSupabaseExportSource(supabase, userId);
            for await (const page of src.pages('jobs', 1000)) {
                rows.push(...page.map((j) => ({ id: j.id, name: j.name, clientName: j.client_name, clientAddress: j.client_address, startDate: j.start_date, endDate: j.end_date, status: j.status, workerName: j.worker_name })));
            }
            return rows;
        })
        : [];
    // a day either side of the window: which LOCAL day an appointment falls on is decided by the builder
    const dayBefore = new Date(Date.now() - 36 * 3_600_000).toISOString();
    const dayAfter = new Date(Date.now() + (opts.days + 2) * 86_400_000).toISOString();
    const appointments = opts.include.appointments ? await safe('appointments', () => listAppointments({ from: dayBefore, to: dayAfter, limit: 2000 })) : [];
    const leads = opts.include.followUps || opts.include.appointments ? await safe('lead follow-ups', () => listLeads({ limit: 2000 })) : [];
    const tasks = opts.include.tasks ? await safe('tasks', () => listOpenTasks({ dueOnOrBefore: windowEnd, limit: 2000 })) : [];
    const documents = opts.include.dueDates ? await safe<CalendarDocRow[]>('invoice and estimate dates', async () => {
        const invoices = await readDocuments(userId, ['Invoice'], CALENDAR_INVOICE_FIELDS, false);
        const others = await readDocuments(userId, ['Estimate', 'Purchase Order'], CALENDAR_DOC_FIELDS, false);
        return [...invoices, ...others].map((d) => ({ id: d.id, type: d.type, job_id: d.job_id, data: d.data || {} }));
    }) : [];

    return { input: { jobs: jobs || [], appointments: appointments || [], leads: leads || [], tasks: tasks || [], documents: documents || [] }, unavailable };
}

/** Saves text to the device as a file (the browser's own download). */
export function downloadTextFile(text: string, fileName: string, mime = 'text/csv;charset=utf-8'): void {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 30_000);
}
