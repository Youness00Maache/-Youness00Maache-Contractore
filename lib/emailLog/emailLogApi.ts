/**
 * Sent-email log: the reads and the one app-side write (delete). Rows are written only by the `gmail` edge function.
 *
 *   probeEmailLogBackend()                      'ready' | 'missing' | 'error'
 *   listEmailLog({ jobId?, clientId?, limit? }) EmailLogEntry[] | null   (newest first; null = table not there)
 *   deleteEmailLogEntry(id)                     void (needs a connection)
 */
import { supabase } from '../supabase.ts';
import { isCrewBackendMissing } from '../crew/crewLogic.ts';
import { NEEDS_CONNECTION, isBrowserOffline } from '../offline/connection.ts';
import { clampLimit } from './format.ts';
import { EMAIL_LOG_SELECT, type EmailLogEntry } from './types.ts';
import { markEmailLogMissing } from './emailLogFeature.ts';

export async function probeEmailLogBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const { error } = await supabase.from('email_log').select('id').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

/** The newest entries, for one job or one client (or the whole account). Null when the table is not in the database. */
export async function listEmailLog(opts: { jobId?: string | null; clientId?: string | null; limit?: number } = {}): Promise<EmailLogEntry[] | null> {
    let q = supabase.from('email_log').select(EMAIL_LOG_SELECT);
    if (opts.jobId) q = q.eq('job_id', opts.jobId);
    if (opts.clientId) q = q.eq('client_id', opts.clientId);
    const { data, error } = await q.order('sent_at', { ascending: false }).limit(clampLimit(opts.limit));
    if (error) {
        if (isCrewBackendMissing(error as any)) { markEmailLogMissing(); return null; }
        throw error;
    }
    return (data || []) as unknown as EmailLogEntry[];
}

/** Removes one entry from the log (the email itself is not affected). */
export async function deleteEmailLogEntry(id: string): Promise<void> {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
    const { error } = await supabase.from('email_log').delete().eq('id', id);
    if (error) throw error;
}
