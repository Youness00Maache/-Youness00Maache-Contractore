/**
 * The documents upsert behind every form save (App.tsx handleSaveForm) and the offline outbox sync
 * (lib/offline/syncEngine.ts), so both go through exactly the same write: the database applies the same Free-plan
 * limits, stock rules and ownership checks either way.
 */
import { supabase } from './supabase.ts';
import { isMissingColumnError } from './account.ts';

/**
 * Upserts one document row and returns its approval token. A database without `documents.client_id` gets the
 * row again without it (the field is removed from `record`, as before).
 */
export async function upsertDocumentRecord(record: Record<string, unknown>): Promise<{ row: { public_token?: string | null } | null; error: any }> {
    let { data, error } = await supabase.from('documents').upsert(record).select('public_token').maybeSingle();
    if (error && 'client_id' in record && isMissingColumnError(error)) {
        delete record.client_id;
        ({ data, error } = await supabase.from('documents').upsert(record).select('public_token').maybeSingle());
    }
    return { row: (data as { public_token?: string | null } | null) ?? null, error };
}

/** The account copy of a document for the outbox conflict check (null = not found). Throws when it can't be read. */
export async function fetchDocumentForSync(id: string): Promise<{ data: Record<string, unknown>; updatedAt: string | null } | null> {
    let res: any = await supabase.from('documents').select('id, data, updated_at').eq('id', id).maybeSingle();
    if (res.error && isMissingColumnError(res.error)) res = await supabase.from('documents').select('id, data').eq('id', id).maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) return null;
    const data = res.data.data && typeof res.data.data === 'object' ? res.data.data : {};
    return { data, updatedAt: res.data.updated_at ?? null };
}

/** Every number of one document type on the account (owner RLS), with the document id. Throws when it can't be read. */
export async function fetchDocumentNumbers(type: string, field: string): Promise<Array<{ id: string; number: string }>> {
    const { data, error } = await (supabase as any)
        .from('documents')
        .select(`id, num:data->>${field}`)
        .eq('type', type)
        .order('created_at', { ascending: false })
        .limit(2000);
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
        .map((r: any) => ({ id: String(r?.id || ''), number: typeof r?.num === 'string' ? r.num : '' }))
        .filter((r: { id: string; number: string }) => r.id && r.number);
}
