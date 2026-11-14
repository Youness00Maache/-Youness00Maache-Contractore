/**
 * "Write client update" and "AI walkthrough" on a job's photo timeline (competitor gap #11, Premium + AI):
 * pure helpers (no React, no Supabase). Tested by scripts/photo-updates-check.ts.
 *
 *  - which photos to send by default (since the last client update / the latest day), capped at 8
 *  - the request body for the ai-assistant photo tasks (shared/photoTasks.ts on the server)
 *  - the final message (greeting, the AI's text, the decision, the portal link, the contractor's sign-off)
 *  - the record of a sent update: a Note on the job tagged "Client update" (no new table)
 *  - the walkthrough answer → the Daily Job Report / Note prefill (the assistant's finalizeDraft path)
 */
import type { Client, Job, UserProfile } from '../../types.ts';
import { esc } from '../../utils/escapeHtml.ts';
import { finalizeDraft, toFormPrefill, type DocumentDraftPrefill } from '../../utils/documentDraft.ts';
import { firstName } from '../../lib/messaging.ts';
import { normalizeTier } from '../../lib/plans.ts';
import { DOC_TYPE_TO_FORM_TYPE } from '../../src/config/docTypeMap.ts';
import {
    PHOTO_TASK_LIMITS, PHOTO_TASK_TIER, PHOTO_TASK_UPGRADE_MESSAGE, WALKTHROUGH_DOC_TYPES,
    type PhotoTask, type PhotoUpdateDraft, type WalkthroughDocType,
} from '../../supabase/functions/ai-assistant/shared/photoTasks.ts';
import type { RouterProposal } from '../../supabase/functions/ai-assistant/shared/routerContract.ts';
import { localDay, tagLabel, type JobPhoto } from './photoLogic.ts';

export type { PhotoTask, PhotoUpdateDraft, WalkthroughDocType };

/** Most photos one update / walkthrough sends to the AI (the server caps it too). */
export const AI_PHOTO_MAX: number = PHOTO_TASK_LIMITS.images;
/** Longest side of a photo sent to the AI (keeps the token cost low). */
export const AI_IMAGE_MAX_DIM = 1024;
export const AI_IMAGE_QUALITY = 0.72;
export const NOTE_MAX_CHARS: number = PHOTO_TASK_LIMITS.noteChars;
/** Tag of the Note that records a sent update (how the next update knows what is new). */
export const CLIENT_UPDATE_TAG = 'Client update';

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------
/** AI client updates and walkthroughs are part of Premium + AI (the server checks the same). */
export const canUseAiPhotos = (plan: string | null | undefined): boolean => normalizeTier(plan) === PHOTO_TASK_TIER;
export const AI_PHOTOS_UPGRADE_REASON = PHOTO_TASK_UPGRADE_MESSAGE;

// ---------------------------------------------------------------------------------------------
// Photo selection
// ---------------------------------------------------------------------------------------------
const timeOf = (iso: string | null | undefined): number => {
    const t = Date.parse(String(iso || ''));
    return Number.isFinite(t) ? t : NaN;
};
/** When the photo reached the job (an upload of an old shot is still new to the client). */
const addedAt = (p: JobPhoto): number => {
    const created = timeOf(p.createdAt);
    return Number.isFinite(created) ? created : timeOf(p.takenAt);
};
const takenAt = (p: JobPhoto): number => {
    const t = timeOf(p.takenAt);
    return Number.isFinite(t) ? t : addedAt(p);
};
const oldestFirst = (a: JobPhoto, b: JobPhoto) => (takenAt(a) - takenAt(b)) || (addedAt(a) - addedAt(b)) || a.id.localeCompare(b.id);

/** Photos added after `since` (all of them when there was no update yet). */
export const newPhotosSince = (photos: JobPhoto[], since: string | null | undefined): JobPhoto[] => {
    const s = timeOf(since);
    if (!Number.isFinite(s)) return [...photos];
    return photos.filter(p => addedAt(p) > s);
};

/** A marked-up copy replaces its original when both are in the list (the client sees the arrows / circles). */
export const preferMarkedUp = (photos: JobPhoto[]): JobPhoto[] => {
    const ids = new Set(photos.map(p => p.id));
    const replaced = new Set(photos.filter(p => p.sourcePhotoId && ids.has(p.sourcePhotoId)).map(p => p.sourcePhotoId as string));
    return photos.filter(p => !replaced.has(p.id));
};

/** At most `max` photos, the newest ones kept, returned oldest first (the order the AI reads them). */
export const capPhotos = (photos: JobPhoto[], max: number = AI_PHOTO_MAX): JobPhoto[] =>
    [...photos].sort(oldestFirst).slice(-Math.max(0, max));

/** Default pick for a client update: what was added since the last update, marked-up copies first, newest 8. */
export const pickUpdatePhotos = (photos: JobPhoto[], lastUpdateAt: string | null | undefined, max: number = AI_PHOTO_MAX): JobPhoto[] =>
    capPhotos(preferMarkedUp(newPhotosSince(photos, lastUpdateAt)), max);

/** Default pick for a walkthrough: the photos of the latest day that has photos (usually today), newest 8. */
export const pickWalkthroughPhotos = (photos: JobPhoto[], max: number = AI_PHOTO_MAX): JobPhoto[] => {
    if (!photos.length) return [];
    const newest = [...photos].sort(oldestFirst)[photos.length - 1];
    const day = localDay(newest.takenAt || newest.createdAt);
    return capPhotos(preferMarkedUp(photos.filter(p => localDay(p.takenAt || p.createdAt) === day)), max);
};

/** Toggles one photo in a pick (oldest first). Adding past the cap is refused: `full` tells the UI to say so. */
export const togglePick = (picked: JobPhoto[], photo: JobPhoto, max: number = AI_PHOTO_MAX): { picked: JobPhoto[]; full: boolean } => {
    if (picked.some(p => p.id === photo.id)) return { picked: picked.filter(p => p.id !== photo.id), full: false };
    if (picked.length >= max) return { picked, full: true };
    return { picked: [...picked, photo].sort(oldestFirst), full: false };
};

// ---------------------------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------------------------
export interface AiPhotoImage { photo: JobPhoto; mimeType: string; data: string }

export interface PhotoTaskInput {
    task: PhotoTask;
    note: string;
    images: AiPhotoImage[];
    job: Pick<Job, 'id' | 'name' | 'clientName' | 'clientAddress' | 'status'>;
    client?: Pick<Client, 'name'> | null;
    profile?: Partial<Pick<UserProfile, 'companyName' | 'name' | 'language'>> | null;
    today: string;
    lastUpdate?: { sentAt: string; text: string } | null;
    docType?: WalkthroughDocType;
}

/** Body for supabase.functions.invoke('ai-assistant'): the photos (≤ 8, oldest first) with stage, time and caption. */
export const buildPhotoTaskBody = (input: PhotoTaskInput): Record<string, unknown> => ({
    task: input.task,
    note: input.note.trim().slice(0, NOTE_MAX_CHARS),
    images: input.images.slice(0, AI_PHOTO_MAX).map(i => ({
        mime_type: i.mimeType,
        data: i.data,
        tag: i.photo.tag,
        caption: (i.photo.caption || '').trim().slice(0, PHOTO_TASK_LIMITS.captionChars),
        taken_at: i.photo.takenAt,
    })),
    context: {
        today: input.today,
        job: { id: input.job.id, name: input.job.name, client_name: input.client?.name || input.job.clientName || undefined, address: input.job.clientAddress || undefined, status: input.job.status },
        company_name: input.profile?.companyName || undefined,
        sender_name: input.profile?.name || undefined,
        client_name: input.client?.name || input.job.clientName || undefined,
        language: input.profile?.language || undefined,
        last_update_at: input.task === 'photo_update' ? input.lastUpdate?.sentAt || undefined : undefined,
        previous_update: input.task === 'photo_update' ? input.lastUpdate?.text.slice(0, PHOTO_TASK_LIMITS.previousUpdateChars) || undefined : undefined,
        doc_type: input.task === 'photo_walkthrough' ? (input.docType && (WALKTHROUGH_DOC_TYPES as readonly string[]).includes(input.docType) ? input.docType : 'DAILY_REPORT') : undefined,
    },
});

export class PhotoTaskResponseError extends Error {
    code = 'AI_BAD_OUTPUT';
}

/** Checks the function's answer for the task that was asked. */
export const parsePhotoTaskResponse = (task: PhotoTask, data: unknown): { update?: PhotoUpdateDraft; proposal?: RouterProposal } => {
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, any>;
    if (!d.ok) throw new PhotoTaskResponseError('The AI returned an unexpected answer. Please try again.');
    if (task === 'photo_update') {
        const u = d.update || {};
        if (typeof u.message !== 'string' || !u.message.trim()) throw new PhotoTaskResponseError('The AI returned an empty update. Please try again.');
        return { update: { subject: String(u.subject || ''), message: u.message.trim(), decision: typeof u.decision === 'string' && u.decision.trim() ? u.decision.trim() : null } };
    }
    const p = d.proposal;
    if (!p || p.action_type !== 'GENERATE_DOCUMENT' || !(WALKTHROUGH_DOC_TYPES as readonly string[]).includes(p.document_type)) {
        throw new PhotoTaskResponseError('The AI could not draft the report. Please try again.');
    }
    return { proposal: p as RouterProposal };
};

// ---------------------------------------------------------------------------------------------
// The update the client receives
// ---------------------------------------------------------------------------------------------
const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();

/**
 * "Hi Jane,\n\n<AI text>\n\nOne thing we need from you: <decision>\n\nPhotos and documents: <portal link>\n\nThanks,\nMike\nAcme Builders".
 * The contractor edits this text before it goes out.
 */
export const composeClientUpdate = (o: {
    clientName?: string | null;
    message: string;
    decision?: string | null;
    portalLink?: string | null;
    senderName?: string | null;
    company?: string | null;
}): string => {
    const first = firstName(o.clientName);
    const decision = clean(o.decision);
    const link = clean(o.portalLink);
    const sign = [clean(o.senderName), clean(o.company) && clean(o.company) !== clean(o.senderName) ? clean(o.company) : ''].filter(Boolean).join('\n');
    return [
        `Hi${first ? ` ${first}` : ''},`,
        clean(o.message),
        decision ? `One thing we need from you: ${decision}` : '',
        link ? `Photos and documents: ${link}` : '',
        `Thanks,${sign ? `\n${sign}` : ''}`,
    ].filter(Boolean).join('\n\n');
};

/** Email subject: the AI's, else "<job>: progress update", with the company when there is one. */
export const updateSubject = (aiSubject: string | null | undefined, jobName: string, company?: string | null): string => {
    const s = clean(aiSubject).replace(/[\r\n]+/g, ' ').slice(0, 120);
    if (s) return s;
    const base = `${clean(jobName) || 'Your project'}: progress update`;
    return clean(company) ? `${base} from ${clean(company)}` : base;
};

// ---------------------------------------------------------------------------------------------
// Record of sent updates: a Note on the job tagged "Client update"
// ---------------------------------------------------------------------------------------------
export interface SentUpdate { id: string; sentAt: string; title: string; text: string }

/** documents rows (id, created_at, title, tags, content) of the job's Notes → its client updates, newest first. */
export const sentUpdatesFromNotes = (rows: Array<{ id?: unknown; created_at?: unknown; title?: unknown; tags?: unknown; content?: unknown }>): SentUpdate[] =>
    (rows || [])
        .filter(r => Array.isArray(r?.tags) && (r.tags as unknown[]).some(t => clean(t).toLowerCase() === CLIENT_UPDATE_TAG.toLowerCase()))
        .map(r => ({ id: clean(r.id), sentAt: clean(r.created_at), title: clean(r.title), text: htmlToText(clean(r.content)) }))
        .filter(u => u.id && Number.isFinite(timeOf(u.sentAt)))
        .sort((a, b) => timeOf(b.sentAt) - timeOf(a.sentAt));

/** The message part of a recorded update (what the client read), for "don't repeat the last update". */
const htmlToText = (html: string): string => {
    const message = html.split(/<h3>\s*Sent\s*<\/h3>/i)[0];
    return message
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/(li|h3)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

export type UpdateChannel = 'email' | 'sms' | 'whatsapp' | 'copy';
const CHANNEL_LABEL: Record<UpdateChannel, string> = { email: 'Email', sms: 'Text message', whatsapp: 'WhatsApp', copy: 'Copied to send from another app' };

const fmtStamp = (d: Date): string =>
    `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

/**
 * Note prefill that records a sent update: the text the client got, how and when it went out, and which photos.
 * One Note per update; later channels (email, then a text) are added to the same Note.
 */
export const buildUpdateRecord = (o: {
    text: string;
    channels: Array<{ channel: UpdateChannel; to?: string; at: Date }>;
    photos: JobPhoto[];
    sentAt: Date;
}): { title: string; content: string; tags: string[] } => {
    const paragraphs = clean(o.text).split(/\n{2,}/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
    const sent = o.channels.map(c => `<li>${esc(CHANNEL_LABEL[c.channel])}${c.to ? ` to ${esc(c.to)}` : ''} · ${esc(fmtStamp(c.at))}${c.channel === 'sms' || c.channel === 'whatsapp' ? ' (opened on this device)' : ''}</li>`).join('');
    const photos = o.photos.map(p => {
        const day = localDay(p.takenAt);
        return `<li>${esc(tagLabel(p.tag))}${day ? ` · ${esc(day)}` : ''}${p.caption ? ` · ${esc(p.caption)}` : ''}</li>`;
    }).join('');
    return {
        title: `Client update · ${o.sentAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        content: `${paragraphs}<h3>Sent</h3><ul>${sent}</ul>${photos ? `<h3>Photos (${o.photos.length})</h3><ul>${photos}</ul>` : ''}`,
        tags: [CLIENT_UPDATE_TAG],
    };
};

/** "Nov 11" / "Nov 11, 2025" (other year). */
export const shortDate = (iso: string, now = new Date()): string => {
    const t = timeOf(iso);
    if (!Number.isFinite(t)) return '';
    const d = new Date(t);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};

/** The line above the AI buttons: "3 new photos since your last client update (Nov 11)". */
export const updateHint = (photos: JobPhoto[], last: SentUpdate | null, now = new Date()): string => {
    if (!last) return photos.length ? 'No client update sent yet.' : '';
    const n = newPhotosSince(photos, last.sentAt).length;
    const when = shortDate(last.sentAt, now);
    return n
        ? `${n} new ${n === 1 ? 'photo' : 'photos'} since your last client update (${when}).`
        : `Last client update sent ${when}. No new photos since.`;
};

// ---------------------------------------------------------------------------------------------
// Walkthrough → document prefill (the assistant's own path)
// ---------------------------------------------------------------------------------------------
/** What the contractor said (note + captions): the facts the daily-report guards keep. Same text as the server's. */
export const walkthroughFacts = (note: string, photos: JobPhoto[]): string =>
    [note.trim(), ...photos.map(p => (p.caption || '').trim()).filter(Boolean)].filter(Boolean).join('\n');

/**
 * The walkthrough proposal → the prefill the form receives, exactly like the assistant's "Open & edit":
 * finalizeDraft (normalization, fact guards, job / client / company boxes), the photos block appended to the body,
 * then toFormPrefill (one-shot draft id). Returns the form route and its navigation state.
 */
export const walkthroughDraft = (proposal: RouterProposal, ctx: {
    job: Job;
    client?: Client | null;
    clients?: Client[];
    profile?: UserProfile | null;
    facts: string;
    photosHtml?: string;
    today?: string;
}): { path: string; state: { prefillData: DocumentDraftPrefill }; prefill: Record<string, unknown> } => {
    const docType = (WALKTHROUGH_DOC_TYPES as readonly string[]).includes(String(proposal.document_type)) ? proposal.document_type as WalkthroughDocType : 'DAILY_REPORT';
    const prefill = finalizeDraft(docType, proposal.prefill || {}, {
        job: ctx.job, client: ctx.client || null, clients: ctx.clients, profile: ctx.profile, userText: ctx.facts, today: ctx.today,
    });
    if (ctx.photosHtml) prefill.content = `${String(prefill.content || '')}${ctx.photosHtml}`;
    const formType = DOC_TYPE_TO_FORM_TYPE[docType];
    return {
        path: `/jobs/${ctx.job.id}/forms/${encodeURIComponent(formType)}`,
        state: { prefillData: toFormPrefill(prefill) },
        prefill,
    };
};

/** File name of a photo embedded in the report (also its alt text). */
export const reportPhotoName = (p: JobPhoto): string =>
    `${tagLabel(p.tag)} photo${p.caption ? ` - ${p.caption.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}` : ''}.jpg`;
