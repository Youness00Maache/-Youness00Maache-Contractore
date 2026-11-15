/**
 * Sends a reviewed batch of emails (AI "email my clients their invoices" flow) through `gmail`.
 * - uses the sender the user picked in Communication (or the default account),
 * - attaches PDFs built from the FULL saved documents (COMM-007),
 * - respects the free-plan monthly limit (server-enforced, pre-checked here) (COMM-016/037),
 * - sends every item at most once per session, even if "Send" is pressed twice,
 * - reports per-item progress (ctx.onProgress and subscribeBatchProgress()).
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Client, FormData, Job, UserProfile } from '../types.ts';
import { sanitizeRichText } from '../utils/escapeHtml.ts';
import { senderIdentity } from '../utils/emailTemplates.ts';
import {
    buildDocumentAttachments,
    getPreferredSender,
    GmailError,
    listGmailAccounts,
    sendEmail,
    type GmailAccount,
} from './gmailService.ts';

export interface EmailBatchItem {
    /** Stable id for de-duplication and progress events (BatchEmailReviewCard assigns one). */
    id?: string;
    client_id: string;
    client_name: string;
    recipient_email: string;
    subject: string;
    body_html: string;
    attachment_document_ids?: string[];
}

export type BatchItemStatus = 'pending' | 'preparing' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface BatchItemProgress {
    key: string;
    index: number;
    status: BatchItemStatus;
    recipient?: string;
    error?: string;
    messageId?: string;
}

export interface BatchSendResult {
    sent: number;
    failed: number;
    skipped: number;
    errors: string[];
    items: BatchItemProgress[];
    /** Set when the whole batch had to stop (the user must act first). */
    stoppedReason?: 'NO_ACCOUNT' | 'RECONNECT_REQUIRED' | 'PLAN_LIMIT' | 'NOT_CONFIGURED' | string;
    sender?: string;
}

export interface BatchSendContext {
    /** Legacy (kept for compatibility); the shared client from lib/supabase.ts is used. */
    supabase?: SupabaseClient;
    session?: Session | null;
    profile: UserProfile;
    forms?: FormData[];
    jobs?: Job[];
    clients?: Client[];
    /** Sender account id; defaults to the sender chosen in Communication, then the default account. */
    accountId?: string | null;
    onProgress?: (progress: BatchItemProgress) => void;
    /** Delay between sends (ms). */
    throttleMs?: number;
}

/* ------------------------------------------------------------------ progress bus */

type Listener = (p: BatchItemProgress) => void;
const listeners = new Set<Listener>();

/** Subscribe to per-item progress of any running batch. Returns an unsubscribe function. */
export function subscribeBatchProgress(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/* ------------------------------------------------------------------ once-only guard */

const sentKeys = new Set<string>();
const inFlightKeys = new Set<string>();

export const batchItemKey = (item: EmailBatchItem, index: number): string =>
    item.id || `idx${index}|${item.client_id}|${(item.recipient_email || '').toLowerCase()}|${item.subject}|${(item.attachment_document_ids || []).join(',')}`;

/** True when this item was already sent successfully in this browser session. */
export const wasBatchItemSent = (item: EmailBatchItem, index: number) => sentKeys.has(batchItemKey(item, index));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

function pickAccount(accounts: GmailAccount[], requested?: string | null): GmailAccount | undefined {
    const want = requested || getPreferredSender();
    return accounts.find((a) => a.id === want || a.gmail_address === want)
        ?? accounts.find((a) => a.is_default)
        ?? accounts[0];
}

export async function sendEmailBatch(batch: EmailBatchItem[], ctx: BatchSendContext): Promise<BatchSendResult> {
    const result: BatchSendResult = { sent: 0, failed: 0, skipped: 0, errors: [], items: [] };
    if (!batch.length) {
        result.errors.push('There are no emails to send.');
        return result;
    }

    const report = (p: BatchItemProgress) => {
        const idx = result.items.findIndex((i) => i.key === p.key);
        if (idx >= 0) result.items[idx] = p;
        else result.items.push(p);
        ctx.onProgress?.(p);
        listeners.forEach((l) => { try { l(p); } catch { /* listener errors must not break sending */ } });
    };

    // 1. Sender account + quota.
    const { accounts, usage } = await listGmailAccounts();
    if (accounts.length === 0) {
        throw new GmailError('GMAIL_NOT_CONNECTED: Connect Gmail in Communication to send emails.', 'NO_ACCOUNT');
    }
    const account = pickAccount(accounts, ctx.accountId);
    if (!account) throw new GmailError('GMAIL_NOT_CONNECTED: Connect Gmail in Communication to send emails.', 'NO_ACCOUNT');
    if (account.needs_reconnect) {
        throw new GmailError(`Please reconnect ${account.gmail_address} in Communication before sending.`, 'RECONNECT_REQUIRED');
    }
    result.sender = account.gmail_address;
    let remaining = usage && usage.limit !== null ? Math.max(0, usage.limit - usage.emails_this_month) : Infinity;

    const throttle = ctx.throttleMs ?? 1200;
    let stop: string | undefined;
    let sentSinceLast = false;

    for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const key = batchItemKey(item, i);
        const recipient = (item.recipient_email || ctx.clients?.find((c) => c.id === item.client_id)?.email || '').trim();
        const label = item.client_name || recipient || `Email ${i + 1}`;

        if (sentKeys.has(key)) {
            result.skipped++;
            report({ key, index: i, status: 'sent', recipient });
            continue; // never send the same reviewed email twice
        }
        if (inFlightKeys.has(key)) {
            result.skipped++;
            report({ key, index: i, status: 'skipped', recipient, error: 'Already being sent.' });
            continue;
        }
        if (stop) {
            result.skipped++;
            report({ key, index: i, status: 'skipped', recipient, error: stop });
            continue;
        }
        if (remaining <= 0) {
            stop = `Free plan limit reached (${usage?.limit ?? 0} emails per month). Upgrade to send more.`;
            result.stoppedReason = 'PLAN_LIMIT';
            result.skipped++;
            report({ key, index: i, status: 'skipped', recipient, error: stop });
            continue;
        }
        if (!recipient || !EMAIL_RE.test(recipient)) {
            result.failed++;
            const msg = recipient ? `Invalid email address "${recipient}".` : 'No email address for this client.';
            result.errors.push(`${label}: ${msg}`);
            report({ key, index: i, status: 'failed', recipient, error: msg });
            continue;
        }

        inFlightKeys.add(key);
        try {
            if (sentSinceLast && throttle > 0) await delay(throttle);

            report({ key, index: i, status: 'preparing', recipient });
            const attachments = item.attachment_document_ids?.length
                ? await buildDocumentAttachments(item.attachment_document_ids, { profile: ctx.profile, jobs: ctx.jobs })
                : [];

            report({ key, index: i, status: 'sending', recipient });
            const html = sanitizeRichText(item.body_html || '');
            const res = await sendEmail({
                accountId: account.id,
                to: recipient,
                subject: item.subject,
                html,
                fromName: senderIdentity(ctx.profile).displayName || undefined,
                attachments: attachments.map(({ filename, mimeType, dataBase64 }) => ({ filename, mimeType, dataBase64 })),
                log: {
                    kind: item.attachment_document_ids?.length ? 'document' : 'other',
                    clientId: item.client_id || null,
                    documentId: item.attachment_document_ids?.[0] || null,
                },
            });
            sentKeys.add(key);
            sentSinceLast = true;
            remaining -= 1;
            result.sent++;
            report({ key, index: i, status: 'sent', recipient, messageId: res.id });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.failed++;
            result.errors.push(`${label}: ${msg}`);
            report({ key, index: i, status: 'failed', recipient, error: msg });
            if (err instanceof GmailError && ['NO_ACCOUNT', 'RECONNECT_REQUIRED', 'PLAN_LIMIT', 'NOT_CONFIGURED', 'GMAIL_API_DISABLED', 'UNAUTHORIZED'].includes(err.code)) {
                stop = err.code === 'PLAN_LIMIT' ? 'Free plan limit reached. Upgrade to send more.' : msg;
                result.stoppedReason = err.code;
            }
        } finally {
            inFlightKeys.delete(key);
        }
    }

    return result;
}

export function getDocumentDisplayName(docId: string, forms: FormData[]): string {
    const form = forms.find((f) => f.id === docId);
    if (!form) return `Document #${docId.substring(0, 6)}`;
    const data = form.data as unknown as Record<string, unknown>;
    const num = data.invoiceNumber || data.estimateNumber || data.changeOrderNumber || data.workOrderNumber || data.poNumber || data.receiptNumber;
    return num ? `${form.type} #${num}` : String(data.title || form.type);
}
