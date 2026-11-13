import { FormType, Client, FormData, UserProfile, Job } from '../types.ts';
import type { EmailBatchItem } from '../services/batchEmailSender.ts';
import { esc, sanitizeRichText } from './escapeHtml.ts';

const newItemId = () =>
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `b${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export interface BuildBatchContext {
    clients: Client[];
    forms: FormData[];
    jobs?: Job[];
    profile?: UserProfile | null;
}

interface ParsedMention {
    type: 'client' | 'doc';
    id: string;
    name: string;
}

function parseSystemContext(input: string): ParsedMention[] {
    const mentions: ParsedMention[] = [];
    const ctxMatch = input.match(/\[System Context:\s*([^\]]+)\]/i);
    const ctx = ctxMatch ? ctxMatch[1] : input;

    const clientRe = /ClientID:\s*([^\s,(]+)\s*(?:\(([^)]+)\))?/gi;
    let m: RegExpExecArray | null;
    while ((m = clientRe.exec(ctx)) !== null) {
        mentions.push({ type: 'client', id: m[1].trim(), name: (m[2] || '').trim() });
    }

    const docRe = /DocID:\s*([^\s,(]+)\s*(?:\(([^)]+)\))?/gi;
    while ((m = docRe.exec(ctx)) !== null) {
        mentions.push({ type: 'doc', id: m[1].trim(), name: (m[2] || '').trim() });
    }

    return mentions;
}

function getUserPrompt(input: string): string {
    const match = input.match(/User Prompt:\s*"([^"]*)"/i);
    if (match) return match[1];
    return input.replace(/\[System Context:[^\]]*\]/gi, '').trim();
}

function formBelongsToClient(form: FormData, client: Client, jobs: Job[] = []): boolean {
    const data = form.data as unknown as Record<string, unknown>;
    const docClientName = ((data.clientName as string) || '').toLowerCase().trim();
    const targetName = client.name.toLowerCase().trim();
    if (docClientName && docClientName === targetName) return true;

    const job = jobs.find(j => j.id === form.jobId);
    if (job?.clientName?.toLowerCase().trim() === targetName) return true;

    // Newer rows link by id (COMM-011)
    if ((form as FormData & { client_id?: string }).client_id === client.id) return true;
    if (job && (job as Job & { clientId?: string }).clientId === client.id) return true;

    return false;
}

function getFormsForClient(
    client: Client,
    forms: FormData[],
    jobs: Job[] = [],
    docTypeFilter?: FormType
): FormData[] {
    return forms.filter(f => {
        if (docTypeFilter && f.type !== docTypeFilter) return false;
        return formBelongsToClient(f, client, jobs);
    });
}

function detectDocScope(prompt: string): 'invoices' | 'estimates' | 'all' | 'explicit' {
    const t = prompt.toLowerCase();
    if (/\b(all\s+)?(his|her|their|the)\s+invoices?\b/.test(t) || /\ball\s+invoices?\b/.test(t)) return 'invoices';
    if (/\b(all\s+)?(his|her|their|the)\s+estimates?\b/.test(t) || /\ball\s+estimates?\b/.test(t)) return 'estimates';
    if (/\b(all\s+)?(his|her|their|the)\s+(documents?|docs?|files?)\b/.test(t) || /\ball\s+(documents?|docs?)\b/.test(t)) return 'all';
    return 'explicit';
}

/** HTML body. Every interpolated value is escaped (COMM-017). */
function buildThankYouBody(clientName: string, companyName: string, invoiceCount: number): string {
    const docPhrase = invoiceCount === 1 ? 'your invoice' : `your ${invoiceCount} invoices`;
    return `<p>Dear ${esc(clientName)},</p>
<p>Thank you for your order! We truly appreciate your business.</p>
<p>Please find attached ${docPhrase} for your records. If you have any questions, don't hesitate to reach out.</p>
<p>Best regards,<br/><strong>${esc(companyName)}</strong></p>`;
}

function buildSubject(clientName: string, companyName: string, scope: string, count: number): string {
    if (scope === 'invoices') {
        return count === 1
            ? `Your Invoice — ${companyName}`
            : `Your Invoices (${count}) — ${companyName}`;
    }
    return `Documents from ${companyName}`;
}

/**
 * Builds email_batch from @ mentions, system context, and natural language
 * when Gemini/heuristics return PREPARE_EMAIL_BATCH without a populated batch.
 */
export function buildEmailBatchFromInput(
    inputText: string,
    ctx: BuildBatchContext
): EmailBatchItem[] {
    const mentions = parseSystemContext(inputText);
    const prompt = getUserPrompt(inputText);
    const companyName = ctx.profile?.companyName || 'Our Team';
    const jobs = ctx.jobs || [];

    const clientMentions = mentions.filter(m => m.type === 'client');
    const docMentions = mentions.filter(m => m.type === 'doc');

    const targetClients: Client[] = [];
    for (const cm of clientMentions) {
        const client = ctx.clients.find(c => c.id === cm.id)
            || ctx.clients.find(c => c.name.toLowerCase() === cm.name.toLowerCase());
        if (client && !targetClients.some(c => c.id === client.id)) {
            targetClients.push(client);
        }
    }

    // Fallback: match @Tag from user prompt against client names
    if (targetClients.length === 0) {
        const tags = prompt.match(/@[\w.-]+/g) || [];
        for (const tag of tags) {
            const needle = tag.substring(1).toLowerCase();
            const client = ctx.clients.find(c =>
                c.name.toLowerCase().replace(/\s+/g, '').includes(needle)
                || needle.includes(c.name.toLowerCase().replace(/\s+/g, ''))
            );
            if (client && !targetClients.some(c => c.id === client.id)) {
                targetClients.push(client);
            }
        }
    }

    if (targetClients.length === 0) return [];

    const scope = detectDocScope(prompt);
    const wantsThankYou = /\bthank/i.test(prompt);

    const batch: EmailBatchItem[] = [];

    for (const client of targetClients) {
        let attachmentForms: FormData[] = [];

        if (docMentions.length > 0) {
            const explicitIds = new Set(docMentions.map(d => d.id));
            attachmentForms = ctx.forms.filter(f => explicitIds.has(f.id));
        } else if (scope === 'invoices') {
            attachmentForms = getFormsForClient(client, ctx.forms, jobs, FormType.Invoice);
        } else if (scope === 'estimates') {
            attachmentForms = getFormsForClient(client, ctx.forms, jobs, FormType.Estimate);
        } else if (scope === 'all') {
            attachmentForms = getFormsForClient(client, ctx.forms, jobs);
        } else if (/\binvoices?\b/i.test(prompt)) {
            attachmentForms = getFormsForClient(client, ctx.forms, jobs, FormType.Invoice);
        }

        if (attachmentForms.length === 0) continue;

        const attachmentIds = attachmentForms.map(f => f.id);
        const bodyHtml = wantsThankYou
            ? buildThankYouBody(client.name, companyName, attachmentIds.length)
            : `<p>Hi ${esc(client.name)},</p><p>Please find the attached document(s) from ${esc(companyName)}.</p><p>Thank you!</p>`;

        batch.push({
            id: newItemId(),
            client_id: client.id,
            client_name: client.name,
            recipient_email: client.email || '',
            subject: buildSubject(client.name, companyName, scope === 'explicit' ? 'invoices' : scope, attachmentIds.length),
            body_html: bodyHtml,
            attachment_document_ids: attachmentIds,
        });
    }

    return batch;
}

/** Extract email_batch from router payload (handles AI shape variations). */
export function getEmailBatchFromPayload(payload: unknown): EmailBatchItem[] {
    let items: unknown[] = [];
    if (Array.isArray(payload)) items = payload;
    else if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        if (Array.isArray(p.email_batch)) items = p.email_batch;
    }
    return items.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object').map(normalizeBatchItem);
}

/**
 * Coerces an AI-produced item into a safe EmailBatchItem: strings only, sanitized HTML body,
 * string ids for attachments, and a stable id (so it is sent at most once).
 */
export function normalizeBatchItem(raw: Record<string, unknown>): EmailBatchItem {
    const s = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
    const body = s(raw.body_html || raw.body || raw.html);
    return {
        id: s(raw.id) || newItemId(),
        client_id: s(raw.client_id),
        client_name: s(raw.client_name).slice(0, 200),
        recipient_email: s(raw.recipient_email || raw.email || raw.to).trim().slice(0, 320),
        subject: s(raw.subject).replace(/[\r\n]+/g, ' ').slice(0, 500),
        body_html: sanitizeRichText(body),
        attachment_document_ids: Array.isArray(raw.attachment_document_ids)
            ? (raw.attachment_document_ids as unknown[]).map(s).filter(Boolean)
            : [],
    };
}

export function enrichEmailBatchPayload(
    result: { action_type: string; payload?: Record<string, unknown>; confirmation_message?: string },
    inputText: string,
    ctx: BuildBatchContext
): typeof result {
    if (result.action_type !== 'PREPARE_EMAIL_BATCH' && result.action_type !== 'AUTO_SEND_BATCH') {
        return result;
    }

    const payload = (result.payload || {}) as Record<string, unknown>;
    let existing = payload.email_batch as EmailBatchItem[] | undefined;
    // Normalize AI items missing required fields
    if (Array.isArray(existing)) {
        existing = existing.filter(
            e => e && (e.recipient_email || e.client_id) && (e.subject || e.body_html)
        );
    }
    if (Array.isArray(existing) && existing.length > 0) {
        const normalized = existing.map((e) => normalizeBatchItem(e as unknown as Record<string, unknown>));
        return { ...result, payload: { ...payload, email_batch: normalized } };
    }

    const built = buildEmailBatchFromInput(inputText, ctx);
    if (built.length === 0) {
        const helpText =
            'I could not find any invoices for that client. Please check that:\n' +
            '• The @ client name matches a client in your list\n' +
            '• That client has Invoice documents saved (with their name on the invoice)\n' +
            '• Or @ mention a specific document from the dropdown';
        return {
            ...result,
            action_type: 'CHAT',
            payload: { reply_text: helpText },
            confirmation_message: helpText,
        };
    }

    return {
        ...result,
        payload: { ...payload, email_batch: built },
        confirmation_message: `Prepared ${built.length} email${built.length !== 1 ? 's' : ''} for review (${built.reduce((n, e) => n + (e.attachment_document_ids?.length || 0), 0)} attachment(s)).`,
    };
}
