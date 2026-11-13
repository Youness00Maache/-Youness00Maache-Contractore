/**
 * Browser client for the `gmail-auth` edge function.
 * Google tokens never reach the browser: connecting, sending, refreshing and revoking all happen server-side.
 */
import { supabase } from '../lib/supabase.ts';
import type { Job, UserProfile } from '../types.ts';

/* ------------------------------------------------------------------ types */

export interface GmailAccount {
    id: string;
    gmail_address: string;
    display_name: string | null;
    is_default: boolean;
    status: 'active' | 'needs_reconnect';
    needs_reconnect: boolean;
}

export interface GmailUsage {
    tier: string;
    paid: boolean;
    emails_this_month: number;
    /** null = unlimited */
    limit: number | null;
}

export interface EmailAttachment {
    filename: string;
    mimeType: string;
    /** Raw base64 (no data: prefix). */
    dataBase64: string;
}

export interface SendEmailParams {
    accountId?: string | null;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    subject: string;
    text?: string;
    html?: string;
    fromName?: string;
    attachments?: EmailAttachment[];
}

export interface SendEmailResult {
    id: string;
    threadId: string;
    from: string;
}

/** Machine-readable error from gmail-auth (see `code`). */
export class GmailError extends Error {
    code: string;
    status?: number;
    constructor(message: string, code = 'UNKNOWN', status?: number) {
        super(message);
        this.name = 'GmailError';
        this.code = code;
        this.status = status;
    }
}

/** Codes after which retrying the same request cannot succeed until the user acts. */
export const BLOCKING_CODES = new Set(['NO_ACCOUNT', 'RECONNECT_REQUIRED', 'PLAN_LIMIT', 'NOT_CONFIGURED', 'GMAIL_API_DISABLED', 'ACCOUNT_NOT_FOUND', 'UNAUTHORIZED']);

export const isReconnectError = (e: unknown) => e instanceof GmailError && (e.code === 'RECONNECT_REQUIRED' || e.code === 'SCOPE_MISSING');
export const isNoAccountError = (e: unknown) => e instanceof GmailError && e.code === 'NO_ACCOUNT';
export const isPlanLimitGmailError = (e: unknown) =>
    (e instanceof GmailError && e.code === 'PLAN_LIMIT') || /PLAN_LIMIT/.test(String((e as Error)?.message || ''));

/** Gmail allows ~25 MB per message; leave room for base64 + body. */
export const EMAIL_ATTACHMENT_LIMIT_BYTES = 18 * 1024 * 1024;

/** Remembered sender (COMM-039). Shared by the compose screen and the AI batch sender. */
const SENDER_KEY = 'cd.gmail.sender';
export const getPreferredSender = (): string | null => {
    try { return localStorage.getItem(SENDER_KEY); } catch { return null; }
};
export const setPreferredSender = (accountId: string | null) => {
    try {
        if (accountId) localStorage.setItem(SENDER_KEY, accountId);
        else localStorage.removeItem(SENDER_KEY);
    } catch { /* private mode */ }
};

/* ------------------------------------------------------------------ transport */

async function callGmail<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    let data: unknown;
    let error: any;
    try {
        ({ data, error } = await supabase.functions.invoke('gmail-auth', { body: { action, ...payload } }));
    } catch (e) {
        throw new GmailError('Network error. Check your connection and try again.', 'NETWORK');
    }
    if (error) {
        let message = '';
        let code = 'UNKNOWN';
        let status: number | undefined;
        const ctx = error?.context;
        if (ctx && typeof ctx.json === 'function') {
            status = typeof ctx.status === 'number' ? ctx.status : undefined;
            try {
                const body = await ctx.json();
                if (body?.error) message = String(body.error);
                if (body?.code) code = String(body.code);
            } catch { /* non-JSON error body */ }
        }
        if (!message) {
            const raw = String(error?.message || '');
            if (/failed to send a request|fetch/i.test(raw)) {
                message = 'Could not reach the email service. Check your connection and try again.';
                code = 'NETWORK';
            } else if (status === 404) {
                message = 'The email service is not deployed yet. Please contact support.';
                code = 'NOT_DEPLOYED';
            } else {
                message = 'The email service returned an error. Please try again.';
            }
        }
        throw new GmailError(message, code, status);
    }
    const body = data as any;
    if (body && typeof body === 'object' && body.error) throw new GmailError(String(body.error), String(body.code || 'UNKNOWN'));
    return body as T;
}

/* ------------------------------------------------------------------ accounts */

export async function listGmailAccounts(): Promise<{ accounts: GmailAccount[]; usage: GmailUsage | null }> {
    const res = await callGmail<{ accounts?: GmailAccount[]; usage?: GmailUsage }>('list');
    return { accounts: Array.isArray(res?.accounts) ? res.accounts : [], usage: res?.usage ?? null };
}

const RETURN_KEY = 'cd.gmail.returnTo';

/** Sends the browser to Google's consent screen. `returnTo` is where GmailCallback brings the user back. */
export async function startGmailConnect(opts: { returnTo?: string; loginHint?: string } = {}): Promise<void> {
    const returnTo = opts.returnTo
        || (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/communication');
    try { sessionStorage.setItem(RETURN_KEY, returnTo); } catch { /* ignore */ }
    const res = await callGmail<{ url: string }>('auth_url', {
        return_to: returnTo,
        origin: window.location.origin,
        login_hint: opts.loginHint,
    });
    if (!res?.url || !/^https:\/\/accounts\.google\.com\//.test(res.url)) {
        throw new GmailError('Could not start the Google connection. Please try again.', 'BAD_AUTH_URL');
    }
    window.location.assign(res.url);
}

export const consumeStoredReturnTo = (): string | null => {
    try {
        const v = sessionStorage.getItem(RETURN_KEY);
        sessionStorage.removeItem(RETURN_KEY);
        return v;
    } catch {
        return null;
    }
};

export async function exchangeGmailCode(code: string, state: string): Promise<{ email: string; account_id: string; return_to: string }> {
    return callGmail('exchange', { code, state });
}

export async function setDefaultGmailAccount(accountId: string): Promise<void> {
    await callGmail('set_default', { account_id: accountId });
}

export async function disconnectGmailAccount(accountId: string): Promise<void> {
    await callGmail('disconnect', { account_id: accountId });
}

/* ------------------------------------------------------------------ sending */

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const total = (params.attachments || []).reduce((n, a) => n + estimateBase64Bytes(a.dataBase64), 0);
    if (total > EMAIL_ATTACHMENT_LIMIT_BYTES) {
        throw new GmailError(`Attachments are too large (${(total / 1048576).toFixed(1)} MB). Remove some documents and try again.`, 'ATTACHMENTS_TOO_LARGE');
    }
    const res = await callGmail<{ id: string; thread_id: string; from: string }>('send', {
        account_id: params.accountId || undefined,
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        reply_to: params.replyTo,
        subject: params.subject,
        text: params.text,
        html: params.html,
        from_name: params.fromName,
        attachments: (params.attachments || []).map((a) => ({ filename: a.filename, mime_type: a.mimeType, data_base64: a.dataBase64 })),
    });
    return { id: res?.id || '', threadId: res?.thread_id || '', from: res?.from || '' };
}

export const estimateBase64Bytes = (b64: string) => {
    const clean = (b64 || '').replace(/\s+/g, '');
    const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - pad);
};

/* ------------------------------------------------------------------ document attachments (COMM-007) */

interface FullDocumentRow {
    id: string;
    job_id: string | null;
    type: string;
    data: Record<string, any> | null;
    created_at: string;
}

/** Always loads the FULL document from the database (never the in-memory list stubs). */
export async function fetchFullDocumentForEmail(documentId: string): Promise<FullDocumentRow> {
    const { data, error } = await supabase
        .from('documents')
        .select('id, job_id, type, data, created_at')
        .eq('id', documentId)
        .single();
    if (error || !data) throw new Error(`Could not load document ${documentId.slice(0, 8)} (${error?.message || 'not found'})`);
    const row = data as FullDocumentRow;
    if (!row.data || typeof row.data !== 'object' || (row.data as any).__lightweight) {
        throw new Error('This document has no saved content yet. Open and save it, then try again.');
    }
    return row;
}

const mapJobRow = (row: any): Job => ({
    id: row.id,
    userId: row.user_id,
    name: row.name || '',
    clientName: row.client_name || '',
    clientAddress: row.client_address || '',
    startDate: row.start_date || row.created_at || '',
    endDate: row.end_date ?? null,
    status: row.status || 'active',
    workerName: row.worker_name || undefined,
    createdAt: row.created_at || undefined,
});

async function resolveJob(doc: FullDocumentRow, jobs: Job[] | undefined): Promise<Job> {
    const cached = doc.job_id ? jobs?.find((j) => j.id === doc.job_id) : undefined;
    if (cached) return cached;
    if (doc.job_id) {
        const { data } = await supabase.from('jobs').select('*').eq('id', doc.job_id).maybeSingle();
        if (data) return mapJobRow(data);
    }
    const d = doc.data || {};
    return {
        id: doc.job_id || '',
        userId: '',
        name: d.projectName || d.title || doc.type,
        clientName: d.clientName || '',
        clientAddress: d.clientAddress || '',
        startDate: doc.created_at,
        endDate: null,
        status: 'active',
    };
}

export const documentNumber = (d: Record<string, any> | null | undefined): string =>
    String(
        d?.invoiceNumber || d?.estimateNumber || d?.changeOrderNumber || d?.workOrderNumber || d?.poNumber
        || d?.receiptNumber || d?.reportNumber || d?.warrantyNumber || '',
    );

const safeFilePart = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export interface DocumentAttachment extends EmailAttachment {
    documentId: string;
    label: string;
}

/** Generates the PDF for one document from its full saved data. Throws with a readable message on failure. */
export async function buildDocumentAttachment(
    documentId: string,
    ctx: { profile: UserProfile; jobs?: Job[] },
): Promise<DocumentAttachment> {
    const doc = await fetchFullDocumentForEmail(documentId);
    const job = await resolveJob(doc, ctx.jobs);
    const { generateDocumentBase64, getDocumentFileName } = await import('./pdfGenerator.ts');
    const number = documentNumber(doc.data);
    const label = number ? `${doc.type} #${number}` : (doc.data?.title || doc.type);
    let dataUri = '';
    try {
        dataUri = await generateDocumentBase64(doc.type, doc.data, ctx.profile, job);
    } catch (e) {
        throw new Error(`Could not create the PDF for ${label}: ${(e as Error)?.message || 'unknown error'}`);
    }
    const base64 = typeof dataUri === 'string' ? (dataUri.includes(',') ? dataUri.slice(dataUri.indexOf(',') + 1) : dataUri) : '';
    if (!base64) throw new Error(`Could not create the PDF for ${label}.`);
    let filename = '';
    try { filename = getDocumentFileName(doc.type, doc.data, ctx.profile, job ?? undefined); } catch { /* fall back below */ }
    if (!filename) filename = `${safeFilePart(doc.type)}-${safeFilePart(number || doc.id.slice(0, 6))}.pdf`;
    return { documentId, label, filename, mimeType: 'application/pdf', dataBase64: base64.replace(/\s+/g, '') };
}

export async function buildDocumentAttachments(
    documentIds: string[],
    ctx: { profile: UserProfile; jobs?: Job[]; onProgress?: (done: number, total: number, label?: string) => void },
): Promise<DocumentAttachment[]> {
    const out: DocumentAttachment[] = [];
    for (let i = 0; i < documentIds.length; i++) {
        const att = await buildDocumentAttachment(documentIds[i], ctx);
        out.push(att);
        ctx.onProgress?.(i + 1, documentIds.length, att.label);
    }
    return out;
}
