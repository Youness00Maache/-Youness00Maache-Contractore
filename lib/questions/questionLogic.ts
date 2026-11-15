/**
 * Project questions + submittals: pure logic (no Supabase, no React). Shapes: lib/questions/questionTypes.ts.
 *
 *   OWNER_TRANSITIONS / canTransition(from, to, { everSent })   the status machine (same as the database)
 *   ownerActions(q)            -> ('send' | 'close' | 'ask_again' | 'reopen' | 'edit' | 'delete')[]   (buttons to show)
 *   isAwaitingClient(q) / isOverdue(q, today?) / daysOverdue(q, today?)
 *   summarizeQuestions(list, today?) -> QuestionSummary
 *   statusLabel(status, kind) / kindLabel(kind) / historyLabel(entry, kind)
 *   QUESTION_TEMPLATES / draftFromTemplate(id, overrides?)   starter templates
 *   validateDraft(draft)       -> string | null (readable error)
 *   normalizeAttachments(list) -> QuestionAttachment[]   (valid ones, max 10; throws on a bad link)
 *   sortQuestions(list)        waiting first (overdue / soonest due), then drafts, answered, closed
 *   mapQuestionRow(row) / questionInsertRow(...) / questionPatchRow(patch) / parseHistory(json) / parseAttachments(json)
 */
import { validateLink } from '../jobFiles/jobFileLogic.ts';
import {
    QUESTION_LIMITS,
    type JobQuestion, type QuestionAttachment, type QuestionDraft, type QuestionHistoryEntry, type QuestionKind, type QuestionPatch,
    type QuestionStatus, type QuestionSummary, type QuestionTemplate,
} from './questionTypes.ts';

export const QUESTION_STATUSES: readonly QuestionStatus[] = ['draft', 'sent', 'answered', 'approved', 'rejected', 'closed'];
/** Statuses only the client's answer can set. */
export const CLIENT_STATUSES: readonly QuestionStatus[] = ['answered', 'approved', 'rejected'];
/** Statuses the client portal shows. */
export const PORTAL_STATUSES: readonly QuestionStatus[] = ['sent', 'answered', 'approved', 'rejected'];

/** What the contractor may change a status to (the database guard enforces the same table). */
export const OWNER_TRANSITIONS: Readonly<Record<QuestionStatus, readonly QuestionStatus[]>> = {
    draft: ['sent', 'closed'],
    sent: ['closed'],
    answered: ['sent', 'closed'],
    approved: ['sent', 'closed'],
    rejected: ['sent', 'closed'],
    closed: ['sent', 'draft'],
};

/** closed -> draft only for an item that was never sent. */
export const canTransition = (from: QuestionStatus, to: QuestionStatus, opts: { everSent?: boolean } = {}): boolean => {
    if (from === to) return true;
    if (!OWNER_TRANSITIONS[from]?.includes(to)) return false;
    if (from === 'closed' && to === 'draft' && opts.everSent) return false;
    return true;
};

export type OwnerAction = 'send' | 'close' | 'ask_again' | 'reopen' | 'edit' | 'delete';

/** The buttons for one item, in display order. */
export const ownerActions = (q: Pick<JobQuestion, 'status' | 'sentAt'>): OwnerAction[] => {
    switch (q.status) {
        case 'draft': return ['send', 'edit', 'delete'];
        case 'sent': return ['edit', 'close', 'delete'];
        case 'answered':
        case 'approved':
        case 'rejected': return ['close', 'ask_again', 'delete'];
        case 'closed': return ['reopen', 'delete'];
        default: return ['delete'];
    }
};

// ------------------------------------------------------------------------------------------------ due dates
const todayIso = (d = new Date()): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isAwaitingClient = (q: Pick<JobQuestion, 'status'>): boolean => q.status === 'sent';

/** Sent, not answered, and the due date is before today (local). `today`: 'YYYY-MM-DD'. */
export const isOverdue = (q: Pick<JobQuestion, 'status' | 'dueDate'>, today: string = todayIso()): boolean =>
    q.status === 'sent' && !!q.dueDate && q.dueDate < today;

export const daysOverdue = (q: Pick<JobQuestion, 'status' | 'dueDate'>, today: string = todayIso()): number => {
    if (!isOverdue(q, today)) return 0;
    const a = Date.parse(`${q.dueDate}T00:00:00Z`);
    const b = Date.parse(`${today}T00:00:00Z`);
    return Math.max(0, Math.round((b - a) / 86400000));
};

export const summarizeQuestions = (list: readonly Pick<JobQuestion, 'status' | 'dueDate'>[], today: string = todayIso()): QuestionSummary => {
    const s: QuestionSummary = { total: 0, draft: 0, waiting: 0, overdue: 0, answered: 0, approved: 0, rejected: 0, closed: 0 };
    for (const q of list) {
        s.total += 1;
        if (q.status === 'draft') s.draft += 1;
        else if (q.status === 'sent') { s.waiting += 1; if (isOverdue(q, today)) s.overdue += 1; }
        else if (q.status === 'answered') s.answered += 1;
        else if (q.status === 'approved') s.approved += 1;
        else if (q.status === 'rejected') s.rejected += 1;
        else if (q.status === 'closed') s.closed += 1;
    }
    return s;
};

// ------------------------------------------------------------------------------------------------ labels
export const kindLabel = (k: QuestionKind): string => (k === 'submittal' ? 'Submittal' : 'Question');

export const statusLabel = (s: QuestionStatus, kind: QuestionKind = 'question'): string => {
    switch (s) {
        case 'draft': return 'Draft';
        case 'sent': return kind === 'submittal' ? 'Waiting for approval' : 'Waiting for answer';
        case 'answered': return 'Answered';
        case 'approved': return 'Approved';
        case 'rejected': return 'Rejected';
        case 'closed': return 'Closed';
        default: return String(s);
    }
};

export const historyLabel = (e: QuestionHistoryEntry, kind: QuestionKind = 'question'): string => {
    const who = e.by === 'client' ? 'Client' : 'You';
    switch (e.action) {
        case 'created': return `${who} created the ${kind === 'submittal' ? 'submittal' : 'question'}`;
        case 'sent': return `${who} sent it to the client portal`;
        case 'edited': return `${who} edited it`;
        case 'reopened': return `${who} asked again`;
        case 'closed': return `${who} closed it`;
        case 'draft': return `${who} moved it back to drafts`;
        case 'answered': return `${who} answered`;
        case 'approved': return `${who} approved`;
        case 'rejected': return `${who} rejected`;
        default: return `${who}: ${e.action}`;
    }
};

// ------------------------------------------------------------------------------------------------ templates
export const QUESTION_TEMPLATES: readonly QuestionTemplate[] = [
    {
        id: 'tile',
        label: 'Which tile?',
        draft: {
            kind: 'question',
            title: 'Which tile would you like?',
            body: 'Please tell us which tile you would like (name or code, size and colour) and where it goes. If you have a link or a photo, add it in your answer.',
        },
    },
    {
        id: 'paint',
        label: 'Paint colour',
        draft: {
            kind: 'question',
            title: 'Paint colour',
            body: 'Which paint colours would you like for each room? Please give the brand, colour name or code and the finish (matte, eggshell, satin, semi-gloss).',
        },
    },
    {
        id: 'change-order',
        label: 'Approve the change order',
        draft: {
            kind: 'submittal',
            title: 'Please approve the change order',
            body: 'We need your approval for the change described below before we continue. Approve it, or reject it and tell us what should change.',
        },
    },
    {
        id: 'product-data',
        label: 'Submittal: product data sheet',
        draft: {
            kind: 'submittal',
            title: 'Product data sheet for approval',
            body: 'Attached is the product we plan to install (data sheet / spec). Please approve it, or reject it with a note so we can propose another one.',
        },
    },
];

export const draftFromTemplate = (id: string, overrides: QuestionPatch = {}): QuestionDraft => {
    const t = QUESTION_TEMPLATES.find(x => x.id === id);
    const base: QuestionDraft = t ? { ...t.draft } : { kind: 'question', title: '' };
    return {
        kind: overrides.kind ?? base.kind,
        title: overrides.title ?? base.title,
        body: overrides.body !== undefined ? overrides.body : (base.body ?? null),
        dueDate: overrides.dueDate !== undefined ? overrides.dueDate : (base.dueDate ?? null),
        attachments: [...(overrides.attachments ?? base.attachments ?? [])],
    };
};

// ------------------------------------------------------------------------------------------------ validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cleanLine = (s: unknown, max: number): string => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);

/** Valid attachments (max 10): file ids must be uuids (the database also checks they are this job's files). Throws on a bad link. */
export const normalizeAttachments = (list: readonly QuestionAttachment[] | null | undefined): QuestionAttachment[] => {
    const out: QuestionAttachment[] = [];
    for (const a of list || []) {
        if (!a) continue;
        if (a.fileId) {
            if (!UUID_RE.test(a.fileId) || out.some(x => x.fileId === a.fileId)) continue;
            out.push({ fileId: a.fileId, title: cleanLine(a.title, QUESTION_LIMITS.attachmentTitle) || 'File' });
        } else if (a.url) {
            const v = validateLink(a.url);
            if (!v.ok) throw new Error(v.error);
            out.push({ url: v.url, title: cleanLine(a.title, QUESTION_LIMITS.attachmentTitle) || v.url.slice(0, QUESTION_LIMITS.attachmentTitle) });
        }
    }
    if (out.length > QUESTION_LIMITS.attachments) throw new Error(`Add up to ${QUESTION_LIMITS.attachments} attachments.`);
    return out;
};

export const validateDraft = (d: Partial<QuestionDraft>): string | null => {
    if (!cleanLine(d.title, QUESTION_LIMITS.title)) return 'Write a short title.';
    if (d.kind && d.kind !== 'question' && d.kind !== 'submittal') return 'Choose question or submittal.';
    if (d.body && String(d.body).length > QUESTION_LIMITS.body) return `Keep the message under ${QUESTION_LIMITS.body} characters.`;
    if (d.dueDate && !DATE_RE.test(d.dueDate)) return 'Check the due date.';
    try { normalizeAttachments(d.attachments); } catch (e) { return e instanceof Error ? e.message : 'Check the attachments.'; }
    return null;
};

// ------------------------------------------------------------------------------------------------ sorting
const RANK: Record<QuestionStatus, number> = { sent: 0, draft: 1, answered: 2, approved: 2, rejected: 2, closed: 3 };

export const sortQuestions = <T extends Pick<JobQuestion, 'status' | 'dueDate' | 'createdAt'>>(list: readonly T[]): T[] =>
    [...list].sort((a, b) =>
        RANK[a.status] - RANK[b.status]
        || (a.status === 'sent' ? (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') : 0)
        || String(b.createdAt).localeCompare(String(a.createdAt)));

// ------------------------------------------------------------------------------------------------ rows
export const QUESTION_COLUMNS =
    'id, user_id, job_id, kind, title, body, due_date, status, attachments, answer, answered_by, answered_at, decision, history, shared_in_portal, sent_at, closed_at, created_at, updated_at';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export const parseAttachments = (json: unknown): QuestionAttachment[] => {
    if (!Array.isArray(json)) return [];
    const out: QuestionAttachment[] = [];
    for (const a of json) {
        if (!a || typeof a !== 'object') continue;
        const o = a as Record<string, unknown>;
        const title = String(o.title ?? '');
        if (typeof o.file_id === 'string') out.push({ fileId: o.file_id, title });
        else if (typeof o.url === 'string') out.push({ url: o.url, title });
    }
    return out;
};

export const parseHistory = (json: unknown): QuestionHistoryEntry[] => {
    if (!Array.isArray(json)) return [];
    return json
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
        .map(e => ({
            at: String(e.at ?? ''),
            by: e.by === 'client' ? 'client' : 'owner',
            action: String(e.action ?? ''),
            note: str(e.note),
        }));
};

export const mapQuestionRow = (r: Record<string, unknown>): JobQuestion => {
    const status = (QUESTION_STATUSES as readonly string[]).includes(String(r.status)) ? (r.status as QuestionStatus) : 'draft';
    return {
        id: String(r.id),
        userId: String(r.user_id ?? ''),
        jobId: String(r.job_id ?? ''),
        kind: r.kind === 'submittal' ? 'submittal' : 'question',
        title: String(r.title ?? ''),
        body: str(r.body),
        dueDate: str(r.due_date),
        status,
        attachments: parseAttachments(r.attachments),
        answer: str(r.answer),
        answeredBy: str(r.answered_by),
        answeredAt: str(r.answered_at),
        decision: r.decision === 'approved' || r.decision === 'rejected' ? r.decision : null,
        history: parseHistory(r.history),
        sharedInPortal: r.shared_in_portal === true,
        sentAt: str(r.sent_at),
        closedAt: str(r.closed_at),
        createdAt: String(r.created_at ?? ''),
        updatedAt: String(r.updated_at ?? r.created_at ?? ''),
    };
};

const attachmentsJson = (list: readonly QuestionAttachment[]): Record<string, string>[] =>
    list.map(a => (a.fileId ? { file_id: a.fileId, title: a.title } : { url: a.url as string, title: a.title }));

/** Insert row; `send` = save and send at once. Throws a readable Error when the draft is invalid. */
export const questionInsertRow = (draft: QuestionDraft, userId: string, jobId: string, send = false): Record<string, unknown> => {
    const problem = validateDraft(draft);
    if (problem) throw new Error(problem);
    return {
        user_id: userId,
        job_id: jobId,
        kind: draft.kind === 'submittal' ? 'submittal' : 'question',
        title: cleanLine(draft.title, QUESTION_LIMITS.title),
        body: String(draft.body ?? '').trim().slice(0, QUESTION_LIMITS.body) || null,
        due_date: draft.dueDate || null,
        attachments: attachmentsJson(normalizeAttachments(draft.attachments)),
        status: send ? 'sent' : 'draft',
    };
};

/** Update row (only the fields given). */
export const questionPatchRow = (patch: QuestionPatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) {
        const t = cleanLine(patch.title, QUESTION_LIMITS.title);
        if (!t) throw new Error('Write a short title.');
        row.title = t;
    }
    if (patch.kind !== undefined) row.kind = patch.kind === 'submittal' ? 'submittal' : 'question';
    if (patch.body !== undefined) row.body = String(patch.body ?? '').trim().slice(0, QUESTION_LIMITS.body) || null;
    if (patch.dueDate !== undefined) {
        if (patch.dueDate && !DATE_RE.test(patch.dueDate)) throw new Error('Check the due date.');
        row.due_date = patch.dueDate || null;
    }
    if (patch.attachments !== undefined) row.attachments = attachmentsJson(normalizeAttachments(patch.attachments));
    return row;
};
