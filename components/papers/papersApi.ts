/**
 * Papers vault: Supabase calls. Files live in the existing private bucket `document-assets` under
 * <user>/papers/ (owner-folder policies from migration 20261112000300). Reads return null while migration
 * 20261115000300 is not applied (the screen says so; the menu entry stays out of the way).
 */
import { supabase } from '../../lib/supabase.ts';
import { isMissingBackendError } from '../requests/requestLogic.ts';
import { PAPER_COLUMNS, mapPaperRow, paperFilePath, paperRowOf, type CompanyPaper } from '../../lib/papers.ts';

export const PAPERS_BUCKET = 'document-assets';

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const needOnline = () => { if (offline()) throw new Error("You're offline, this needs a connection."); };

/** Every paper of the user (archived ones left out). null = the vault isn't in the database yet. */
export const listPapers = async (): Promise<CompanyPaper[] | null> => {
    const { data, error } = await supabase.from('company_papers').select(PAPER_COLUMNS).is('archived_at', null).order('expires_on', { ascending: true, nullsFirst: false }).limit(500);
    if (error) {
        if (isMissingBackendError(error)) return null;
        throw error;
    }
    return (data || []).map(mapPaperRow);
};

/** Papers linked to one job (permits on the job page). null = not available. */
export const listJobPapers = async (jobId: string): Promise<CompanyPaper[] | null> => {
    if (offline()) return null;
    const { data, error } = await supabase.from('company_papers').select(PAPER_COLUMNS).eq('job_id', jobId).is('archived_at', null).limit(50);
    if (error) return null;
    return (data || []).map(mapPaperRow);
};

export const savePaper = async (paper: CompanyPaper, userId: string, kind: 'create' | 'edit'): Promise<CompanyPaper> => {
    needOnline();
    const row = paperRowOf(paper, userId);
    const res = kind === 'create'
        ? await supabase.from('company_papers').insert(row).select(PAPER_COLUMNS).single()
        : await supabase.from('company_papers').update((() => { const { id: _id, user_id: _u, ...rest } = row; return rest; })()).eq('id', paper.id).select(PAPER_COLUMNS).single();
    if (res.error) throw res.error;
    return mapPaperRow(res.data);
};

const randomPart = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Uploads the file of a paper; returns what to store on the row. */
export const uploadPaperFile = async (userId: string, paperId: string, file: File): Promise<Pick<CompanyPaper, 'filePath' | 'fileName' | 'fileType' | 'fileSize'>> => {
    needOnline();
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg');
    const path = paperFilePath(userId, paperId, randomPart(), file.name, type);
    const { error } = await supabase.storage.from(PAPERS_BUCKET).upload(path, file, { upsert: false, contentType: type, cacheControl: '3600' });
    if (error) throw new Error(`The file could not be uploaded. ${error.message || ''}`.trim());
    return { filePath: path, fileName: (file.name || 'document').slice(0, 200), fileType: type, fileSize: file.size };
};

export const removePaperFile = async (path: string | null | undefined): Promise<void> => {
    if (!path) return;
    await supabase.storage.from(PAPERS_BUCKET).remove([path]).then(() => undefined, () => undefined);
};

export const deletePaper = async (paper: CompanyPaper): Promise<void> => {
    needOnline();
    const { error } = await supabase.from('company_papers').delete().eq('id', paper.id);
    if (error) throw error;
    await removePaperFile(paper.filePath);
};

/** A link to open the file (1 hour). */
export const paperFileUrl = async (path: string): Promise<string> => {
    const { data, error } = await supabase.storage.from(PAPERS_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'The file could not be opened.');
    return data.signedUrl;
};

/** The file as base64 (no data: prefix), for an email attachment. */
export const paperFileBase64 = async (path: string): Promise<{ base64: string; type: string }> => {
    const { data, error } = await supabase.storage.from(PAPERS_BUCKET).download(path);
    if (error || !data) throw new Error(error?.message || 'The file could not be read.');
    const buf = new Uint8Array(await data.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), type: data.type || 'application/pdf' };
};

export const markPaperSent = async (id: string, to: string): Promise<void> => {
    await supabase.from('company_papers').update({ last_sent_at: new Date().toISOString(), last_sent_to: to.slice(0, 320) }).eq('id', id).then(() => undefined, () => undefined);
};
