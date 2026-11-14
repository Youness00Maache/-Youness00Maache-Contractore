/**
 * Bookkeeper CSV: reading the documents (Supabase) and emailing the file from the user's own Gmail
 * (services/gmailService.ts, same sending as documents; counts toward the Free plan's monthly email allowance).
 * The pure part is bookkeeper.ts.
 */
import { supabase } from '../supabase.ts';
import { sendEmail, getPreferredSender } from '../../services/gmailService.ts';
import type { UserProfile } from '../../types.ts';
import {
    BOOKKEEPER_DOC_TYPES, BOOKKEEPER_SELECT, bookkeeperCsv, bookkeeperEmail, bookkeeperFileName, buildBookkeeperRows, summarizeBookkeeper, utf8ToBase64,
    type BookkeeperDoc, type BookkeeperRow, type BookkeeperSummary, type DateRange,
} from './bookkeeper.ts';

const PAGE = 500;

export interface BookkeeperExport {
    range: DateRange;
    rows: BookkeeperRow[];
    summary: BookkeeperSummary;
    csv: string;
    fileName: string;
}

/** Builds the CSV for a period from the account's invoices, receipts, expense and material logs. */
export async function buildBookkeeperExport(userId: string, range: DateRange): Promise<BookkeeperExport> {
    const docs: BookkeeperDoc[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from('documents').select(BOOKKEEPER_SELECT).eq('user_id', userId).in('type', BOOKKEEPER_DOC_TYPES)
            .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
        if (error) throw new Error(`Could not read your documents: ${error.message || 'no answer from the server'}.${error.code ? '' : ' Check your connection and try again.'}`);
        docs.push(...((data || []) as unknown as BookkeeperDoc[]));
        if (!data || data.length < PAGE) break;
    }
    const jobs = new Map<string, { name: string; clientName?: string }>();
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('jobs').select('id, name, client_name').eq('user_id', userId)
            .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
        if (error) throw new Error(`Could not read your jobs: ${error.message}.`);
        for (const j of data || []) jobs.set(j.id, { name: j.name || '', clientName: j.client_name || '' });
        if (!data || data.length < 1000) break;
    }
    const rows = buildBookkeeperRows(docs, range, jobs);
    return { range, rows, summary: summarizeBookkeeper(rows), csv: bookkeeperCsv(rows), fileName: bookkeeperFileName(range) };
}

/** Saves the CSV to the device. */
export function downloadCsv(csv: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 30_000);
}

/** Emails the CSV to the bookkeeper from the user's Gmail. Throws GmailError (NO_ACCOUNT, PLAN_LIMIT …) on failure. */
export async function emailBookkeeperExport(exp: BookkeeperExport, to: string, profile: Partial<UserProfile> | null | undefined): Promise<void> {
    const { subject, text } = bookkeeperEmail({ range: exp.range, summary: exp.summary, company: profile?.companyName, senderName: profile?.name });
    await sendEmail({
        accountId: getPreferredSender(),
        to: to.trim(),
        subject,
        text,
        fromName: profile?.companyName || profile?.name || undefined,
        attachments: [{ filename: exp.fileName, mimeType: 'text/csv', dataBase64: utf8ToBase64(exp.csv) }],
    });
}
