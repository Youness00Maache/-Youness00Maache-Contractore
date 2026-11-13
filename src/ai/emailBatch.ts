/**
 * Builds the reviewable email list for a PREPARE_EMAIL_BATCH proposal.
 * Recipients always come from the saved client record (never from model output, AI-007) and
 * attachments are only documents the user owns that were named in the request.
 */
import type { Client, FormData, Job, UserProfile } from '../../types.ts';
import type { EmailBatchItem } from '../../services/batchEmailSender.ts';
import { getFormLabel } from '../../utils/aiMentionUtils.ts';
import { escapeHtml } from '../../supabase/functions/master-ai-router/shared/documentSchema.ts';
import type { RouterProposal } from '../../supabase/functions/master-ai-router/shared/routerContract.ts';

export interface AIEmailDraft {
    key: string;
    client_id: string;
    client_name: string;
    /** From the client record only. */
    recipient_email: string;
    subject: string;
    body_text: string;
    attachment_document_ids: string[];
    selected: boolean;
    problem?: string;
}

const norm = (s: unknown) => String(s || '').trim().toLowerCase();

function docClientName(form: FormData, jobs: Job[]): string {
    const data = (form.data || {}) as unknown as Record<string, unknown>;
    return String(data.clientName || jobs.find(j => j.id === form.jobId)?.clientName || '');
}

export function buildEmailDrafts(
    proposal: RouterProposal,
    ctx: { clients: Client[]; forms: FormData[]; jobs: Job[]; profile?: UserProfile | null },
): AIEmailDraft[] {
    const docs = (proposal.document_ids || [])
        .map(id => ctx.forms.find(f => f.id === id))
        .filter((f): f is FormData => Boolean(f));
    const clients = (proposal.client_ids || [])
        .map(id => ctx.clients.find(c => c.id === id))
        .filter((c): c is Client => Boolean(c));
    const sender = ctx.profile?.name || ctx.profile?.companyName || '';
    const company = ctx.profile?.companyName || ctx.profile?.name || 'us';
    return clients.map((client, index) => {
        const attachments = clients.length === 1
            ? docs
            : docs.filter(d => norm(docClientName(d, ctx.jobs)) === norm(client.name));
        const labels = attachments.map(getFormLabel);
        const firstName = client.name.split(/\s+/)[0] || client.name;
        const subject = proposal.email_subject
            || (labels.length ? `${labels.join(', ')} from ${company}` : `A message from ${company}`);
        const body = proposal.email_body
            || `Hi ${firstName},\n\n${labels.length ? `Please find attached ${labels.join(', ')}.` : 'I wanted to follow up with you about your project.'}\n\nThank you,\n${sender}`.trim();
        const email = (client.email || '').trim();
        return {
            key: `${client.id}-${index}`,
            client_id: client.id,
            client_name: client.name,
            recipient_email: email,
            subject,
            body_text: body,
            attachment_document_ids: attachments.map(a => a.id),
            selected: Boolean(email),
            problem: email ? undefined : 'No email address saved for this client.',
        };
    });
}

/** Plain text → safe HTML for the email body. */
export function textToEmailHtml(text: string): string {
    return text
        .split(/\n{2,}/)
        .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

export function toEmailBatchItems(drafts: AIEmailDraft[]): EmailBatchItem[] {
    return drafts
        .filter(d => d.selected && d.recipient_email)
        .map(d => ({
            client_id: d.client_id,
            client_name: d.client_name,
            recipient_email: d.recipient_email,
            subject: d.subject.replace(/[\r\n]+/g, ' ').trim(),
            body_html: textToEmailHtml(d.body_text),
            attachment_document_ids: d.attachment_document_ids,
        }));
}
