
import { FormData, FormType, InvoiceData } from "../types.ts";
import { SupabaseClient } from "@supabase/supabase-js";
import { dbApi } from "../utils/db.ts";

export const processRecurringInvoices = async (
    supabase: SupabaseClient, 
    userId: string, 
    forms: FormData[]
): Promise<{ processedCount: number, newForms: FormData[] }> => {
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let processedCount = 0;
    const newForms: FormData[] = [];
    const updatesToOriginals: FormData[] = [];

    // Filter for Invoice forms that are enabled for recurrence
    const recurringTemplates = forms.filter(f => 
        f.type === FormType.Invoice && 
        (f.data as InvoiceData).recurrence?.enabled &&
        (f.data as InvoiceData).recurrence?.nextRunDate
    );

    for (const form of recurringTemplates) {
        const invoiceData = form.data as InvoiceData;
        const nextRun = new Date(invoiceData.recurrence!.nextRunDate!);
        nextRun.setHours(0, 0, 0, 0);

        if (nextRun <= today) {
            // It's time to run this invoice!
            processedCount++;

            // 1. Create the new Invoice
            const newInvoiceId = crypto.randomUUID();
            const newDate = new Date();
            const newDueDate = new Date();
            newDueDate.setDate(newDate.getDate() + 30); // Default 30 days due

            // Generate new invoice number (append -REC or increment if possible, but simpler to append date)
            const baseNum = invoiceData.invoiceNumber.split('-')[0]; // Assuming INV-YYYY-MM-001 format
            const newInvoiceNumber = `${baseNum}-${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 1000)}`;

            const newInvoiceData: InvoiceData = {
                ...invoiceData,
                invoiceNumber: newInvoiceNumber,
                issueDate: newDate.toISOString().split('T')[0],
                dueDate: newDueDate.toISOString().split('T')[0],
                status: 'Draft', // Always create as draft first
                title: `${invoiceData.title || 'Invoice'} (Recurring)`,
                recurrence: { ...invoiceData.recurrence!, enabled: false } // The copy itself shouldn't recurse immediately, usually the parent handles it or this becomes a standalone.
            };

            const newForm: FormData = {
                id: newInvoiceId,
                jobId: form.jobId,
                type: FormType.Invoice,
                createdAt: newDate.toISOString(),
                data: newInvoiceData
            };

            newForms.push(newForm);

            // 2. Update the Original Template's Next Run Date
            let nextDate = new Date(nextRun);
            switch (invoiceData.recurrence?.frequency) {
                case 'Monthly':
                    nextDate.setMonth(nextDate.getMonth() + 1);
                    break;
                case 'Quarterly':
                    nextDate.setMonth(nextDate.getMonth() + 3);
                    break;
                case 'Bi-Annually':
                    nextDate.setMonth(nextDate.getMonth() + 6);
                    break;
                case 'Annually':
                    nextDate.setFullYear(nextDate.getFullYear() + 1);
                    break;
                default:
                    nextDate.setMonth(nextDate.getMonth() + 1);
            }

            const updatedOriginalData: InvoiceData = {
                ...invoiceData,
                recurrence: {
                    ...invoiceData.recurrence!,
                    lastRunDate: newDate.toISOString().split('T')[0],
                    nextRunDate: nextDate.toISOString().split('T')[0]
                }
            };

            const updatedOriginal: FormData = {
                ...form,
                data: updatedOriginalData
            };
            
            updatesToOriginals.push(updatedOriginal);
        }
    }

    // Batch DB Updates
    if (processedCount > 0) {
        // 1. Insert New Invoices
        for (const f of newForms) {
            if (navigator.onLine) {
                await supabase.from('documents').insert({
                    id: f.id,
                    user_id: userId,
                    job_id: f.jobId,
                    type: f.type,
                    data: f.data,
                    created_at: f.createdAt
                });
            } else {
                await dbApi.put('offline_queue', { id: crypto.randomUUID(), type: 'create_form', payload: { id: f.id, user_id: userId, job_id: f.jobId, type: f.type, data: f.data }, timestamp: Date.now() });
            }
            await dbApi.put('documents', f);
        }

        // 2. Update Originals
        for (const f of updatesToOriginals) {
            if (navigator.onLine) {
                await supabase.from('documents').update({ data: f.data }).eq('id', f.id);
            } else {
               // Complex offline update for existing doc data not fully supported in simple queue, but we update local cache
            }
            await dbApi.put('documents', f);
        }
    }

    return { processedCount, newForms };
};
