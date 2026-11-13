/**
 * Client portal / approval link helpers and "everything linked to this client" queries.
 * Owned by COMMS. Safe for other areas to import (read-only usage).
 *
 * Linking rule (COMM-011): a job/document belongs to a client when `client_id = client.id`;
 * legacy rows without `client_id` fall back to matching the client's name.
 */
import { supabase } from '../lib/supabase.ts';
import type { Client } from '../types.ts';
import { needsNewApprovalToken, type ApprovalTokenRow } from './clientPortalRules.ts';

/* ------------------------------------------------------------------ URLs */

const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

export const portalUrl = (portalKey: string) => `${origin()}/?portal=${encodeURIComponent(portalKey)}`;
export const approvalUrl = (publicToken: string) => `${origin()}/?approval_token=${encodeURIComponent(publicToken)}`;

/** 128-bit random hex key (32 chars), same format as the DB default. */
export const generatePortalKey = (): string => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fall through to the legacy path */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ PostgREST helpers */

type PgError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

/** Column (e.g. the new `client_id`) not migrated yet. */
export const isMissingColumnError = (err: PgError, column = 'client_id') =>
    !!err && (err.code === '42703' || err.code === 'PGRST204' || new RegExp(column, 'i').test(`${err.message || ''} ${err.details || ''}`));

/** RPC not deployed yet / different argument list. */
export const isMissingFunctionError = (err: PgError) =>
    !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|function .* does not exist/i.test(err.message || ''));

/** Quote a value for use inside PostgREST `or=(...)` filters. */
export const pgrstQuote = (value: string) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/* ------------------------------------------------------------------ link management */

/** Returns the client's portal key, creating one if the row has none (legacy rows). */
export async function ensurePortalKey(client: Pick<Client, 'id' | 'portal_key'>): Promise<string> {
    if (client.portal_key) return client.portal_key;
    return regeneratePortalKey(client.id);
}

/** Creates a new portal key; the old link stops working immediately. */
export async function regeneratePortalKey(clientId: string): Promise<string> {
    const key = generatePortalKey();
    const { data, error } = await supabase
        .from('clients')
        .update({ portal_key: key })
        .eq('id', clientId)
        .select('portal_key')
        .single();
    if (error) throw new Error(`Could not create a new portal link: ${error.message}`);
    return (data as { portal_key: string }).portal_key || key;
}

/**
 * Returns a working link token for the document: the current one, or a new one when it is missing, when its link
 * expired unused (only links with an expiry date: new links have none, like the original app), or when the client
 * already used it and the document is open again (a used link is never handed out as if it were fresh).
 */
export async function ensureApprovalToken(documentId: string): Promise<string> {
    let res = await supabase
        .from('documents')
        .select('public_token, approval_expires_at, approval_used_at, type, has_client_signature, status:data->>status, clientSignedAt:data->>clientSignedAt, clientDeclinedAt:data->>clientDeclinedAt')
        .eq('id', documentId)
        .single();
    if (res.error && isMissingColumnError(res.error, '(approval_|has_client_signature)')) {
        res = await supabase.from('documents').select('public_token').eq('id', documentId).single() as typeof res;
    }
    if (res.error) throw new Error(`Could not load the document: ${res.error.message}`);
    const row = (res.data || {}) as ApprovalTokenRow;
    if (row.public_token && !needsNewApprovalToken(row)) return row.public_token;
    return regenerateApprovalToken(documentId);
}

/** Creates a new approval token; previously shared approval links stop working. */
export async function regenerateApprovalToken(documentId: string): Promise<string> {
    const token = crypto.randomUUID();
    const { data, error } = await supabase
        .from('documents')
        .update({ public_token: token })
        .eq('id', documentId)
        .select('public_token')
        .single();
    if (error) throw new Error(`Could not create a new approval link: ${error.message}`);
    return (data as { public_token: string }).public_token || token;
}

/* ------------------------------------------------------------------ linked records */

export interface ClientJobSummary {
    id: string;
    name: string;
    clientName: string;
    clientId: string | null;
    status: string;
    startDate: string | null;
    endDate: string | null;
    createdAt: string | null;
}

export interface ClientDocSummary {
    id: string;
    jobId: string;
    type: string;
    createdAt: string;
    publicToken: string | null;
    clientId: string | null;
    /** Lightweight subset of `documents.data` (enough for lists, badges and totals). */
    data: {
        title?: string;
        number?: string;
        status?: string;
        clientName?: string;
        clientSignedAt?: string;
        clientSignerName?: string;
        clientDeclinedAt?: string;
        viewedByProvider?: boolean;
        expiryDate?: string;
        lineItems?: unknown[];
        taxRate?: string | number;
        discount?: string | number;
        shipping?: string | number;
        isProgressBilling?: boolean;
        amount?: string | number;
    };
}

const JOB_COLUMNS = 'id, name, client_name, status, start_date, end_date, created_at';
const DOC_COLUMNS = [
    'id', 'job_id', 'type', 'created_at', 'public_token',
    'title:data->>title', 'invoiceNumber:data->>invoiceNumber', 'estimateNumber:data->>estimateNumber',
    'changeOrderNumber:data->>changeOrderNumber', 'workOrderNumber:data->>workOrderNumber', 'reportNumber:data->>reportNumber',
    'poNumber:data->>poNumber', 'receiptNumber:data->>receiptNumber', 'warrantyNumber:data->>warrantyNumber',
    'status:data->>status', 'clientName:data->>clientName', 'clientSignedAt:data->>clientSignedAt',
    'clientSignerName:data->>clientSignerName', 'clientSignedBy:data->>clientSignedBy', 'clientDeclinedAt:data->>clientDeclinedAt',
    'viewedByProvider:data->>viewedByProvider', 'expiryDate:data->>expiryDate', 'lineItems:data->lineItems',
    'taxRate:data->>taxRate', 'discount:data->>discount', 'shipping:data->>shipping',
    'isProgressBilling:data->>isProgressBilling', 'amount:data->>amount',
].join(', ');

const mapJob = (row: any): ClientJobSummary => ({
    id: row.id,
    name: row.name || 'Untitled job',
    clientName: row.client_name || '',
    clientId: row.client_id ?? null,
    status: row.status || 'active',
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    createdAt: row.created_at ?? null,
});

const mapDoc = (row: any): ClientDocSummary => ({
    id: row.id,
    jobId: row.job_id,
    type: row.type,
    createdAt: row.created_at,
    publicToken: row.public_token ?? null,
    clientId: row.client_id ?? null,
    data: {
        title: row.title || undefined,
        number: row.invoiceNumber || row.estimateNumber || row.changeOrderNumber || row.workOrderNumber || row.reportNumber
            || row.poNumber || row.receiptNumber || row.warrantyNumber || undefined,
        status: row.status || undefined,
        clientName: row.clientName || undefined,
        clientSignedAt: row.clientSignedAt || undefined,
        clientSignerName: row.clientSignerName || row.clientSignedBy || undefined,
        clientDeclinedAt: row.clientDeclinedAt || undefined,
        viewedByProvider: String(row.viewedByProvider).toLowerCase() === 'true',
        expiryDate: row.expiryDate || undefined,
        lineItems: Array.isArray(row.lineItems) ? row.lineItems : undefined,
        taxRate: row.taxRate ?? undefined,
        discount: row.discount ?? undefined,
        shipping: row.shipping ?? undefined,
        isProgressBilling: String(row.isProgressBilling).toLowerCase() === 'true',
        amount: row.amount ?? undefined,
    },
});

/**
 * Legacy rows (no client_id) match the client's name in any letter case, like the portal
 * (public._client_document_ids). `ilike` without wildcards = case-insensitive equality; PostgREST also reads `*` as a
 * wildcard, so results are re-checked with sameClientName().
 */
const nameEqualsPattern = (name: string) => pgrstQuote(name.trim().replace(/[\\%_]/g, (c) => `\\${c}`));
export const sameClientName = (a: unknown, b: unknown) => {
    const x = String(a ?? '').trim().toLowerCase();
    return !!x && x === String(b ?? '').trim().toLowerCase();
};

/** All jobs of a client (by client_id, legacy rows by name). Newest first. */
export async function fetchClientJobs(client: Pick<Client, 'id' | 'name'>): Promise<ClientJobSummary[]> {
    const mine = (j: ClientJobSummary) => j.clientId === client.id || sameClientName(j.clientName, client.name);
    const withId = await supabase
        .from('jobs')
        .select(`${JOB_COLUMNS}, client_id`)
        .or(`client_id.eq.${client.id},and(client_id.is.null,client_name.ilike.${nameEqualsPattern(client.name)})`)
        .order('created_at', { ascending: false })
        .limit(500);
    if (!withId.error) return (withId.data || []).map(mapJob).filter(mine);
    if (!isMissingColumnError(withId.error)) throw new Error(withId.error.message);

    const byName = await supabase
        .from('jobs')
        .select(JOB_COLUMNS)
        .ilike('client_name', client.name.trim().replace(/[\\%_]/g, (c) => `\\${c}`))
        .order('created_at', { ascending: false })
        .limit(500);
    if (byName.error) throw new Error(byName.error.message);
    return (byName.data || []).map(mapJob).filter(mine);
}

/**
 * Documents of a client (by client_id, legacy rows by `data.clientName` or by belonging to one of the client's jobs).
 * Newest first. Only lightweight fields are selected (no signatures/photos).
 */
export async function fetchClientDocuments(
    client: Pick<Client, 'id' | 'name'>,
    opts: { jobIds?: string[]; types?: string[]; limit?: number } = {},
): Promise<ClientDocSummary[]> {
    const jobIds = (opts.jobIds || []).filter(Boolean).slice(0, 150);
    const jobIdSet = new Set(jobIds);
    const nameClause = `data->>clientName.ilike.${nameEqualsPattern(client.name)}`;
    const jobClause = jobIds.length ? `job_id.in.(${jobIds.join(',')})` : '';
    const mine = (d: ClientDocSummary) => d.clientId === client.id || jobIdSet.has(d.jobId) || sameClientName(d.data.clientName, client.name);

    const build = (withClientId: boolean) => {
        let q = supabase
            .from('documents')
            .select(withClientId ? `${DOC_COLUMNS}, client_id` : DOC_COLUMNS)
            .order('created_at', { ascending: false })
            .limit(opts.limit ?? 300);
        if (withClientId) {
            const legacy = [`and(client_id.is.null,${nameClause})`];
            if (jobClause) legacy.push(`and(client_id.is.null,${jobClause})`);
            q = q.or([`client_id.eq.${client.id}`, ...legacy].join(','));
        } else {
            q = q.or([nameClause, jobClause].filter(Boolean).join(','));
        }
        if (opts.types?.length) q = q.in('type', opts.types);
        return q;
    };

    const first = await build(true);
    if (!first.error) return (first.data || []).map(mapDoc).filter(mine);
    if (!isMissingColumnError(first.error)) throw new Error(first.error.message);
    const second = await build(false);
    if (second.error) throw new Error(second.error.message);
    return (second.data || []).map(mapDoc).filter(mine);
}

/** Lightweight summaries of specific documents (owner RLS applies). Keeps the order of `ids`. */
export async function fetchDocumentSummaries(ids: string[]): Promise<ClientDocSummary[]> {
    const unique = Array.from(new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))).slice(0, 100);
    if (!unique.length) return [];
    const { data, error } = await supabase.from('documents').select(DOC_COLUMNS).in('id', unique);
    if (error) throw new Error(error.message);
    const byId = new Map((data || []).map((row: any) => [row.id, mapDoc(row)]));
    return unique.map((id) => byId.get(id)).filter(Boolean) as ClientDocSummary[];
}

export const CLIENT_COLUMNS = 'id, user_id, name, email, phone, address, notes, portal_key, created_at';

/** `%`, `_` and `\` are wildcards/escapes in LIKE patterns. */
export const likePattern = (query: string) => `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Server-side client search over name / email / phone (COMM-021). */
export async function searchClients(query: string, limit = 20): Promise<Client[]> {
    let q = supabase.from('clients').select(CLIENT_COLUMNS).order('name').limit(limit);
    const term = query.trim();
    if (term) {
        const pat = pgrstQuote(likePattern(term));
        q = q.or(`name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as Client[];
}

export async function fetchClientById(id: string): Promise<Client | null> {
    const { data, error } = await supabase.from('clients').select(CLIENT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Client | null) ?? null;
}

/** Human label for a document: "Estimate #1042" / its title / its type. */
export const documentLabel = (type: string, data: { title?: string; number?: string } | Record<string, any>): string => {
    const d = data as Record<string, any>;
    const num = d.number || d.invoiceNumber || d.estimateNumber || d.changeOrderNumber || d.workOrderNumber
        || d.reportNumber || d.poNumber || d.receiptNumber || d.warrantyNumber;
    if (num) return `${type} #${num}`;
    return d.title || type;
};

/** Estimates / change orders past their expiry date (local calendar day). */
export const isExpired = (expiryDate?: string | null): boolean => {
    if (!expiryDate) return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiryDate);
    if (!m) return false;
    const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
    return end.getTime() < Date.now();
};
