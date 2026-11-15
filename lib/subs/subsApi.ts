/**
 * Subcontractors, sub commitments and quotes: Supabase calls of the signed-in contractor (roadmap D7). Shapes:
 * lib/subs/subTypes.ts; pure logic: lib/subs/subLogic.ts (status machine, money, schedule), lib/subs/quoteCompare.ts
 * (comparison, choose -> draft), lib/subs/subBudget.ts (job budget line). Tables: crew_members (kind / company /
 * trade), sub_commitments, job_quotes; quote files in the private bucket `document-assets` (<user>/quotes/<job>/...).
 *
 *  - Keep EVERYTHING HIDDEN until the migration 20261116000800_subs_quotes.sql is applied:
 *    `useSubsFeature(userId, online) === 'ready'`. Reads return null while the tables / columns are missing (and mark
 *    the feature missing).
 *  - Every write needs a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline it throws an Error whose
 *    message is NEEDS_CONNECTION; other failures throw a readable Error ("PLAN_LIMIT: ..." on Free: use
 *    isPlanLimitError from lib/jobFiles/jobFilesApi.ts).
 *  - The sub's acceptance, the issued / completed / cancelled times and paid_total are written by the database;
 *    payments can only be appended (addPayment).
 *
 * API (all async unless noted)
 *   probeSubsBackend()                                   'ready' | 'missing' | 'error'
 *   subsFeature / useSubsFeature(uid, online)            'unknown' | 'ready' | 'missing'
 *   listSubMembers(kind?)                                SubMember[] | null   (kind 'employee' | 'subcontractor' | all)
 *   updateSubMember(id, { kind?, company?, trade? })     SubMember
 *   listJobCommitments(jobId)                            SubCommitment[] | null   (sortCommitments order)
 *   listMemberCommitments(memberId)                      SubCommitment[] | null
 *   listOpenCommitments(limit?)                          SubCommitment[] | null   (issued / accepted / in progress, all jobs)
 *   createCommitment(userId, jobId, draft, { issue? })   SubCommitment
 *   updateCommitment(id, patch)                          SubCommitment  (an accepted one goes back to 'issued' when
 *                                                                        its terms change: termsResetAcceptance)
 *   setCommitmentStatus(id, status)                      SubCommitment  (see canTransition / ownerActions)
 *   issueCommitment / withdrawCommitment / startCommitment / completeCommitment / cancelCommitment /
 *   reopenCommitment / redraftCommitment (id)            SubCommitment
 *   addPayment(commitment, { amount, at?, note? })       SubCommitment  (appends one entry; negative = correction)
 *   deleteCommitment(id)                                 void
 *   listJobQuotes(jobId)                                 JobQuote[] | null
 *   createQuote(userId, jobId, draft, file?)             JobQuote       (uploads the file first)
 *   updateQuote(id, patch)                               JobQuote
 *   attachQuoteFile(quote, userId, file)                 JobQuote       (adds / replaces the quote's file)
 *   removeQuoteFile(quote)                               JobQuote
 *   quoteFileUrl(filePath, seconds?)                     string | null  (signed URL)
 *   setQuoteStatus(id, status) / shortlistQuote(id) / rejectQuote(id)   JobQuote
 *   chooseQuote(quotes, quoteId)                         JobQuote       (others of the scope: chosen -> shortlisted)
 *   chooseQuoteAsCommitment(userId, quotes, quoteId, member?, opts?)   { quote, commitment }  (a DRAFT commitment)
 *   deleteQuote(quote)                                   void           (row + its file)
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isCrewBackendMissing, isNetworkError } from '../crew/crewLogic.ts';
import { isMissingColumnError } from '../account.ts';
import { createBackendFeature } from '../jobFiles/featureFlag.ts';
import {
    COMMITMENT_COLUMNS, SUB_MEMBER_COLUMNS, appendPayment, commitmentInsertRow, commitmentPatchRow, mapCommitmentRow, mapSubMemberRow,
    sortCommitments, subMemberPatchRow, type PaymentInput,
} from './subLogic.ts';
import {
    QUOTE_COLUMNS, chooseQuotePlan, commitmentDraftFromQuote, mapQuoteRow, quoteFileMime, quoteFileStoragePath, quoteInsertRow, quotePatchRow,
    validateQuoteFile,
} from './quoteCompare.ts';
import {
    SUB_LIMITS, type CommitmentDraft, type CommitmentPatch, type CommitmentStatus, type CrewKind, type JobQuote, type QuoteDraft, type QuotePatch,
    type QuoteStatus, type SubCommitment, type SubMember, type SubMemberPatch,
} from './subTypes.ts';

export const QUOTE_FILES_BUCKET = 'document-assets';

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

const isMissing = (e: DbError | unknown) => isCrewBackendMissing(e as any) || isMissingColumnError(e as any);

const writeError = (error: DbError | unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isMissing(error)) { subsFeature.markMissing(); return new Error('Subcontractors are not switched on yet. Please try again later.'); }
    return new Error(errorText(error, fallback));
};

const readList = <T>(res: { data: unknown; error: DbError }, map: (r: Record<string, unknown>) => T, what: string): T[] | null => {
    if (res.error) {
        if (isMissing(res.error)) { subsFeature.markMissing(); return null; }
        throw writeError(res.error, `The ${what} could not be loaded.`);
    }
    return ((res.data as Record<string, unknown>[] | null) || []).map(map);
};

// ------------------------------------------------------------------------------------------------- feature
/** 'ready' only when both new tables AND the new crew_members columns exist. */
export async function probeSubsBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const [a, b, c] = await Promise.all([
            supabase.from('sub_commitments').select('id').limit(1),
            supabase.from('job_quotes').select('id').limit(1),
            supabase.from('crew_members').select('id, kind, company, trade').limit(1),
        ]);
        const errors = [a.error, b.error, c.error].filter(Boolean);
        if (!errors.length) return 'ready';
        return errors.some(e => isMissing(e)) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export const subsFeature = createBackendFeature('cd.subs.feature', probeSubsBackend);
export const useSubsFeature = subsFeature.useFeature;

// ------------------------------------------------------------------------------------------------- members
export async function listSubMembers(kind?: CrewKind): Promise<SubMember[] | null> {
    let q = supabase.from('crew_members').select(SUB_MEMBER_COLUMNS).order('name', { ascending: true }).limit(250);
    if (kind) q = q.eq('kind', kind);
    return readList(await q, mapSubMemberRow, 'crew members');
}

export async function updateSubMember(id: string, patch: SubMemberPatch): Promise<SubMember> {
    ensureOnline();
    const row = subMemberPatchRow(patch);
    const { data, error } = await supabase.from('crew_members').update(row).eq('id', id).select(SUB_MEMBER_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The crew member could not be saved.');
    return mapSubMemberRow(data as Record<string, unknown>);
}

// ------------------------------------------------------------------------------------------------- commitments
export async function listJobCommitments(jobId: string): Promise<SubCommitment[] | null> {
    const res = await supabase.from('sub_commitments').select(COMMITMENT_COLUMNS).eq('job_id', jobId)
        .order('created_at', { ascending: false }).limit(SUB_LIMITS.commitmentsPerJob);
    const list = readList(res, mapCommitmentRow, 'commitments');
    return list ? sortCommitments(list) : null;
}

export async function listMemberCommitments(memberId: string): Promise<SubCommitment[] | null> {
    const res = await supabase.from('sub_commitments').select(COMMITMENT_COLUMNS).eq('crew_member_id', memberId)
        .order('created_at', { ascending: false }).limit(500);
    const list = readList(res, mapCommitmentRow, 'commitments');
    return list ? sortCommitments(list) : null;
}

export async function listOpenCommitments(limit = 300): Promise<SubCommitment[] | null> {
    const res = await supabase.from('sub_commitments').select(COMMITMENT_COLUMNS).in('status', ['issued', 'accepted', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false }).limit(Math.min(Math.max(1, limit), 1000));
    const list = readList(res, mapCommitmentRow, 'commitments');
    return list ? sortCommitments(list) : null;
}

export async function createCommitment(userId: string, jobId: string, draft: CommitmentDraft, opts: { issue?: boolean } = {}): Promise<SubCommitment> {
    ensureOnline();
    const row = commitmentInsertRow(draft, userId, jobId, !!opts.issue);
    const { data, error } = await supabase.from('sub_commitments').insert(row).select(COMMITMENT_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The commitment could not be saved.');
    return mapCommitmentRow(data as Record<string, unknown>);
}

export async function updateCommitment(id: string, patch: CommitmentPatch): Promise<SubCommitment> {
    ensureOnline();
    const row = commitmentPatchRow(patch);
    const { data, error } = await supabase.from('sub_commitments').update(row).eq('id', id).select(COMMITMENT_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The changes could not be saved.');
    return mapCommitmentRow(data as Record<string, unknown>);
}

export async function setCommitmentStatus(id: string, status: CommitmentStatus): Promise<SubCommitment> {
    ensureOnline();
    const { data, error } = await supabase.from('sub_commitments').update({ status }).eq('id', id).select(COMMITMENT_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The change could not be saved.');
    return mapCommitmentRow(data as Record<string, unknown>);
}

export const issueCommitment = (id: string) => setCommitmentStatus(id, 'issued');
export const withdrawCommitment = (id: string) => setCommitmentStatus(id, 'draft');
export const startCommitment = (id: string) => setCommitmentStatus(id, 'in_progress');
export const completeCommitment = (id: string) => setCommitmentStatus(id, 'completed');
export const cancelCommitment = (id: string) => setCommitmentStatus(id, 'cancelled');
export const reopenCommitment = (id: string) => setCommitmentStatus(id, 'in_progress');
export const redraftCommitment = (id: string) => setCommitmentStatus(id, 'draft');

/** Appends one payment (the existing ones are sent back unchanged; the database refuses any other change). */
export async function addPayment(c: SubCommitment, input: PaymentInput): Promise<SubCommitment> {
    ensureOnline();
    const payments = appendPayment(c, input);
    const { data, error } = await supabase.from('sub_commitments').update({ payments }).eq('id', c.id).select(COMMITMENT_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The payment could not be saved.');
    return mapCommitmentRow(data as Record<string, unknown>);
}

export async function deleteCommitment(id: string): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('sub_commitments').delete().eq('id', id);
    if (error) throw writeError(error, 'The commitment could not be deleted.');
}

// ------------------------------------------------------------------------------------------------- quotes
export async function listJobQuotes(jobId: string): Promise<JobQuote[] | null> {
    const res = await supabase.from('job_quotes').select(QUOTE_COLUMNS).eq('job_id', jobId)
        .order('scope_key', { ascending: true }).order('amount', { ascending: true }).limit(SUB_LIMITS.quotesPerJob);
    return readList(res, mapQuoteRow, 'quotes');
}

export async function quoteFileUrl(filePath: string, seconds = 3600): Promise<string | null> {
    const { data, error } = await supabase.storage.from(QUOTE_FILES_BUCKET).createSignedUrl(filePath, seconds);
    return error || !data?.signedUrl ? null : data.signedUrl;
}

const uploadQuoteFile = async (userId: string, jobId: string, file: File): Promise<{ file_path: string; file_name: string; size_bytes: number }> => {
    const problem = validateQuoteFile({ name: file.name, size: file.size, type: file.type });
    if (problem) throw new Error(problem);
    const mime = quoteFileMime(file.name, file.type)!;
    const path = quoteFileStoragePath(userId, jobId, file.name, mime);
    const { error } = await supabase.storage.from(QUOTE_FILES_BUCKET).upload(path, file, { upsert: false, contentType: mime, cacheControl: '3600' });
    if (error) throw writeError(error, 'The file could not be uploaded.');
    return { file_path: path, file_name: file.name.slice(0, 200), size_bytes: file.size };
};

const dropFile = async (path: string | null | undefined) => {
    if (path) await supabase.storage.from(QUOTE_FILES_BUCKET).remove([path]).catch(() => undefined);
};

export async function createQuote(userId: string, jobId: string, draft: QuoteDraft, file?: File | null): Promise<JobQuote> {
    ensureOnline();
    const row = quoteInsertRow(draft, userId, jobId);
    const fileFields = file ? await uploadQuoteFile(userId, jobId, file) : null;
    const { data, error } = await supabase.from('job_quotes').insert({ ...row, ...(fileFields || {}) }).select(QUOTE_COLUMNS).single();
    if (error || !data) {
        await dropFile(fileFields?.file_path);
        throw writeError(error, 'The quote could not be saved.');
    }
    return mapQuoteRow(data as Record<string, unknown>);
}

export async function updateQuote(id: string, patch: QuotePatch): Promise<JobQuote> {
    ensureOnline();
    const row = quotePatchRow(patch);
    const { data, error } = await supabase.from('job_quotes').update(row).eq('id', id).select(QUOTE_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The quote could not be saved.');
    return mapQuoteRow(data as Record<string, unknown>);
}

export async function attachQuoteFile(quote: JobQuote, userId: string, file: File): Promise<JobQuote> {
    ensureOnline();
    const fileFields = await uploadQuoteFile(userId, quote.jobId, file);
    const { data, error } = await supabase.from('job_quotes').update(fileFields).eq('id', quote.id).select(QUOTE_COLUMNS).single();
    if (error || !data) {
        await dropFile(fileFields.file_path);
        throw writeError(error, 'The file could not be saved on the quote.');
    }
    await dropFile(quote.filePath);
    return mapQuoteRow(data as Record<string, unknown>);
}

export async function removeQuoteFile(quote: JobQuote): Promise<JobQuote> {
    ensureOnline();
    const { data, error } = await supabase.from('job_quotes').update({ file_path: null, file_name: null, size_bytes: null }).eq('id', quote.id).select(QUOTE_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The file could not be removed.');
    await dropFile(quote.filePath);
    return mapQuoteRow(data as Record<string, unknown>);
}

export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<JobQuote> {
    ensureOnline();
    const { data, error } = await supabase.from('job_quotes').update({ status }).eq('id', id).select(QUOTE_COLUMNS).single();
    if (error || !data) throw writeError(error, 'The change could not be saved.');
    return mapQuoteRow(data as Record<string, unknown>);
}

export const shortlistQuote = (id: string) => setQuoteStatus(id, 'shortlisted');
export const rejectQuote = (id: string) => setQuoteStatus(id, 'rejected');

/** Chooses one quote of its scope (a previously chosen one of the same scope goes back to the shortlist first). */
export async function chooseQuote(quotes: readonly JobQuote[], quoteId: string): Promise<JobQuote> {
    const plan = chooseQuotePlan(quotes, quoteId);
    for (const id of plan.unchoose) await setQuoteStatus(id, 'shortlisted');
    return setQuoteStatus(plan.choose, 'chosen');
}

/** Chooses the quote and saves a DRAFT commitment from it (member: the quote's crew member, when known). */
export async function chooseQuoteAsCommitment(
    userId: string,
    quotes: readonly JobQuote[],
    quoteId: string,
    member?: Pick<SubMember, 'id' | 'kind' | 'name' | 'company'> | null,
    opts: { retainagePct?: number; startDate?: string | null; dueDate?: string | null } = {},
): Promise<{ quote: JobQuote; commitment: SubCommitment }> {
    const quote = await chooseQuote(quotes, quoteId);
    const commitment = await createCommitment(userId, quote.jobId, commitmentDraftFromQuote(quote, member, opts));
    return { quote, commitment };
}

export async function deleteQuote(quote: JobQuote): Promise<void> {
    ensureOnline();
    const { error } = await supabase.from('job_quotes').delete().eq('id', quote.id);
    if (error) throw writeError(error, 'The quote could not be deleted.');
    await dropFile(quote.filePath);
}
