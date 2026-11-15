/**
 * Client portal (/?portal=<key>): project questions, submittals and shared job files (roadmap D3). Wrappers for the
 * SQL functions of supabase/migrations/20261116000400_job_files_questions.sql. Same fallback as
 * lib/portal/dashboardApi.ts: while a function does not exist (migration not applied) the call answers
 * { status: 'missing' } and the portal renders NOTHING new (stays exactly as today). Remembered until reload.
 *
 *   loadPortalQuestions(key, jobId?)   -> PortalResult<PortalQuestion[]>
 *   answerPortalQuestion(key, questionId, { decision?, answer?, name? })
 *                                      -> { status: 'ready', data: PortalQuestion } | { status: 'already' }
 *                                         | { status: 'invalid' } | { status: 'missing' } | { status: 'error', message }
 *        question:  decision omitted (or 'answered'), answer required
 *        submittal: decision 'approved' | 'rejected' (a note in `answer` is required to reject)
 *        'already': it was answered before (the contractor must "ask again" first): reload the list
 *   loadPortalJobFiles(key, jobId?)    -> PortalResult<PortalJobFile[]>
 *   portalQuestionsFeature() / portalFilesFeature()   'unknown' | 'ready' | 'missing'
 *
 *   PortalQuestion {
 *     id, jobId, jobName, kind: 'question' | 'submittal', title, body, dueDate, sentAt,
 *     status: 'sent' | 'answered' | 'approved' | 'rejected', decision: 'approved' | 'rejected' | null,
 *     answer, answeredBy, answeredAt,
 *     attachments: { kind: 'file' | 'link', title, url: string | null, path: string | null, href: string | null }[]
 *        (href: the link, or the public URL of a shared image; null = a file the portal can't open: show the title)
 *     history: { at, by: 'owner' | 'client', action: 'sent' | 'reopened' | 'answered' | 'approved' | 'rejected' | 'closed', note }[]
 *   }
 *   PortalJobFile { id, jobId, jobName, kind: 'file' | 'link', category, title, version, url, path, mime, href }
 *
 * Reads are stable SQL functions (lib/offline/writePathScan.ts READ_ONLY_RPCS); the answer is a public write
 * (lib/offline/writePathAudit.ts 'public').
 */
import { supabase } from '../supabase.ts';
import { isMissingBackendError } from '../../components/requests/requestLogic.ts';

export type PortalFeatureState = 'unknown' | 'ready' | 'missing';

export type PortalResult<T> =
    | { status: 'ready'; data: T }
    | { status: 'missing' }
    | { status: 'invalid' }
    | { status: 'error'; message: string };

export type PortalAnswerResult = PortalResult<PortalQuestion> | { status: 'already' };

export interface PortalAttachment {
    kind: 'file' | 'link';
    title: string;
    url: string | null;
    path: string | null;
    href: string | null;
}

export interface PortalHistoryEntry {
    at: string;
    by: 'owner' | 'client';
    action: string;
    note: string | null;
}

export interface PortalQuestion {
    id: string;
    jobId: string;
    jobName: string;
    kind: 'question' | 'submittal';
    title: string;
    body: string | null;
    dueDate: string | null;
    sentAt: string | null;
    status: 'sent' | 'answered' | 'approved' | 'rejected';
    decision: 'approved' | 'rejected' | null;
    answer: string | null;
    answeredBy: string | null;
    answeredAt: string | null;
    attachments: PortalAttachment[];
    history: PortalHistoryEntry[];
}

export interface PortalJobFile {
    id: string;
    jobId: string;
    jobName: string;
    kind: 'file' | 'link';
    category: string;
    title: string;
    version: number;
    url: string | null;
    path: string | null;
    mime: string | null;
    href: string | null;
}

const PORTAL_PUBLIC_BUCKET = 'portal-photos';
const PORTAL_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let questionsFeature: PortalFeatureState = 'unknown';
let filesFeature: PortalFeatureState = 'unknown';
export const portalQuestionsFeature = (): PortalFeatureState => questionsFeature;
export const portalFilesFeature = (): PortalFeatureState => filesFeature;

type ErrLike = { code?: string; message?: string; hint?: string } | null | undefined;
const isInvalidLink = (e: ErrLike): boolean => !!e && (e.code === '28000' || /invalid portal link/i.test(String(e.message || '')));
const isAlready = (e: ErrLike): boolean => !!e && (e.hint === 'already_answered' || /ALREADY_ANSWERED/.test(String(e.message || '')));
const readable = (e: ErrLike, fallback: string): string =>
    String(e?.message || fallback).replace(/^[A-Z_]+:\s*/, '') || fallback;

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Public URL of a portal copy (portal-photos bucket); only http(s) links are ever returned as hrefs. */
const publicUrl = (path: string | null): string | null =>
    path ? supabase.storage.from(PORTAL_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl : null;
const safeHref = (url: string | null): string | null => (url && /^https?:\/\//i.test(url) ? url : null);

export const parsePortalQuestion = (raw: unknown): PortalQuestion | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string') return null;
    const status = ['sent', 'answered', 'approved', 'rejected'].includes(String(r.status)) ? (r.status as PortalQuestion['status']) : 'sent';
    return {
        id: r.id,
        jobId: String(r.job_id ?? ''),
        jobName: String(r.job_name ?? ''),
        kind: r.kind === 'submittal' ? 'submittal' : 'question',
        title: String(r.title ?? ''),
        body: str(r.body),
        dueDate: str(r.due_date),
        sentAt: str(r.sent_at),
        status,
        decision: r.decision === 'approved' || r.decision === 'rejected' ? r.decision : null,
        answer: str(r.answer),
        answeredBy: str(r.answered_by),
        answeredAt: str(r.answered_at),
        attachments: (Array.isArray(r.attachments) ? r.attachments : []).filter(a => a && typeof a === 'object').map((a) => {
            const o = a as Record<string, unknown>;
            const url = safeHref(str(o.url));
            const path = str(o.path);
            return { kind: o.kind === 'link' ? 'link' : 'file', title: String(o.title ?? ''), url, path, href: url ?? publicUrl(path) } as PortalAttachment;
        }),
        history: (Array.isArray(r.history) ? r.history : []).filter(h => h && typeof h === 'object').map((h) => {
            const o = h as Record<string, unknown>;
            return { at: String(o.at ?? ''), by: o.by === 'client' ? 'client' : 'owner', action: String(o.action ?? ''), note: str(o.note) } as PortalHistoryEntry;
        }),
    };
};

export const parsePortalJobFile = (raw: unknown): PortalJobFile | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string') return null;
    const url = safeHref(str(r.url));
    const path = str(r.path);
    return {
        id: r.id,
        jobId: String(r.job_id ?? ''),
        jobName: String(r.job_name ?? ''),
        kind: r.kind === 'link' ? 'link' : 'file',
        category: String(r.category ?? 'other'),
        title: String(r.title ?? ''),
        version: Number(r.version) || 1,
        url,
        path,
        mime: str(r.mime),
        href: url ?? publicUrl(path),
    };
};

const listOf = <T>(data: unknown, parse: (x: unknown) => T | null): T[] =>
    (Array.isArray(data) ? data : []).map(parse).filter((x): x is T => x !== null);

/** Questions + submittals sent to this client (optionally one job). Never throws. */
export async function loadPortalQuestions(portalKey: string, jobId?: string | null): Promise<PortalResult<PortalQuestion[]>> {
    if (questionsFeature === 'missing') return { status: 'missing' };
    if (!PORTAL_KEY_RE.test(portalKey || '')) return { status: 'invalid' };
    if (jobId && !UUID_RE.test(jobId)) return { status: 'invalid' };
    try {
        const { data, error } = await supabase.rpc('get_portal_questions', { p_key: portalKey, p_job_id: jobId || null });
        if (error) {
            if (isMissingBackendError(error)) { questionsFeature = 'missing'; return { status: 'missing' }; }
            if (isInvalidLink(error)) return { status: 'invalid' };
            return { status: 'error', message: readable(error, 'Could not load the questions.') };
        }
        questionsFeature = 'ready';
        return { status: 'ready', data: listOf(data, parsePortalQuestion) };
    } catch (e) {
        if (isMissingBackendError(e as any)) { questionsFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Could not load the questions.' };
    }
}

/** The client's answer (question) or approve / reject (submittal). Never throws. */
export async function answerPortalQuestion(
    portalKey: string,
    questionId: string,
    input: { decision?: 'answered' | 'approved' | 'rejected' | null; answer?: string | null; name?: string | null },
): Promise<PortalAnswerResult> {
    if (questionsFeature === 'missing') return { status: 'missing' };
    if (!PORTAL_KEY_RE.test(portalKey || '') || !UUID_RE.test(questionId || '')) return { status: 'invalid' };
    try {
        const { data, error } = await supabase.rpc('answer_portal_question', {
            p_key: portalKey,
            p_question_id: questionId,
            p_decision: input.decision || null,
            p_answer: (input.answer ?? '').slice(0, 4000) || null,
            p_name: (input.name ?? '').slice(0, 120) || null,
        });
        if (error) {
            if (isMissingBackendError(error)) { questionsFeature = 'missing'; return { status: 'missing' }; }
            if (isInvalidLink(error)) return { status: 'invalid' };
            if (isAlready(error)) return { status: 'already' };
            return { status: 'error', message: readable(error, 'Your answer could not be sent.') };
        }
        const q = parsePortalQuestion(data);
        return q ? { status: 'ready', data: q } : { status: 'error', message: 'Your answer could not be sent.' };
    } catch (e) {
        if (isMissingBackendError(e as any)) { questionsFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Your answer could not be sent.' };
    }
}

/** Files and links the contractor shared (latest shared version of each). Never throws. */
export async function loadPortalJobFiles(portalKey: string, jobId?: string | null): Promise<PortalResult<PortalJobFile[]>> {
    if (filesFeature === 'missing') return { status: 'missing' };
    if (!PORTAL_KEY_RE.test(portalKey || '')) return { status: 'invalid' };
    if (jobId && !UUID_RE.test(jobId)) return { status: 'invalid' };
    try {
        const { data, error } = await supabase.rpc('get_portal_job_files', { p_key: portalKey, p_job_id: jobId || null });
        if (error) {
            if (isMissingBackendError(error)) { filesFeature = 'missing'; return { status: 'missing' }; }
            if (isInvalidLink(error)) return { status: 'invalid' };
            return { status: 'error', message: readable(error, 'Could not load the files.') };
        }
        filesFeature = 'ready';
        return { status: 'ready', data: listOf(data, parsePortalJobFile) };
    } catch (e) {
        if (isMissingBackendError(e as any)) { filesFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Could not load the files.' };
    }
}
