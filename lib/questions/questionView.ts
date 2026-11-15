/**
 * Questions + submittals UI helpers (batch D3 phase B): pure, no React / Supabase, tested by scripts/job-files-check.ts.
 *
 *   chips         statusTone, waitingChip, tabWaiting, countsLine
 *   rows          dueInfo, questionMeta, answerLine, groupQuestions
 *   history       historyRows (oldest first, with the words the owner reads)
 *   attachments   attachmentFromFile, attachmentFromLink, attachmentReach, attachableFiles
 *   client link   CLIENT_ANSWERS_LINE, clientLinkNote
 */
import { shortDay } from '../tasks/taskView.ts';
import { todayYmd } from '../tasks/taskLogic.ts';
import { shortDate } from '../jobFiles/jobFileView.ts';
import { latestVersions, sortFiles } from '../jobFiles/jobFileLogic.ts';
import type { JobFile } from '../jobFiles/jobFileTypes.ts';
import { daysOverdue, historyLabel, isOverdue, kindLabel, sortQuestions } from './questionLogic.ts';
import {
    QUESTION_LIMITS,
    type JobQuestion, type QuestionAttachment, type QuestionStatus, type QuestionSummary,
} from './questionTypes.ts';

export type StatusTone = 'primary' | 'warning' | 'success' | 'danger' | 'muted';

export const CLIENT_ANSWERS_LINE = 'Your client answers from their project link.';
export const QUESTIONS_NEED_CONNECTION = "You're offline. Questions need a connection; they come back when you're online again.";
export const QUESTIONS_PREMIUM_REASON = 'Client questions and submittals are part of Premium.';

/** Waiting for the client = warning, answered = primary, approved / rejected = green / red, the rest grey. */
export const statusTone = (s: QuestionStatus): StatusTone => {
    switch (s) {
        case 'sent': return 'warning';
        case 'answered': return 'primary';
        case 'approved': return 'success';
        case 'rejected': return 'danger';
        default: return 'muted';
    }
};

/** The header chip: "2 waiting for client" ('' for none). */
export const waitingChip = (n: number): string => (n > 0 ? `${n} waiting for client` : '');

/** The small count next to the Questions tab: "2 waiting" ('' for none). */
export const tabWaiting = (n: number): string => (n > 0 ? `${n} waiting` : '');

export interface CountPart { text: string; tone: 'strong' | 'late' | 'normal' }

/** The pieces of the line under the panel title: "2 waiting for client", "1 overdue", "3 answered", "1 draft"... */
export const countsParts = (s: QuestionSummary): CountPart[] => {
    const decided = s.answered + s.approved + s.rejected;
    const parts: CountPart[] = [];
    if (s.waiting) parts.push({ text: `${s.waiting} waiting for client`, tone: 'strong' });
    if (s.overdue) parts.push({ text: `${s.overdue} overdue`, tone: 'late' });
    if (decided) parts.push({ text: `${decided} answered`, tone: 'normal' });
    if (s.draft) parts.push({ text: `${s.draft} ${s.draft === 1 ? 'draft' : 'drafts'}`, tone: 'normal' });
    if (s.closed) parts.push({ text: `${s.closed} closed`, tone: 'normal' });
    return parts;
};

/** "2 waiting for client · 1 overdue · 3 answered" ('' when there is nothing). */
export const countsLine = (s: QuestionSummary): string => countsParts(s).map(p => p.text).join(' · ');

export type DueTone = 'late' | 'today' | 'soon' | 'normal' | 'none';

/** The due line of an item waiting for the client: "3 days overdue", "Due today", "Due Fri Nov 20" ('' with no date). */
export const dueInfo = (q: Pick<JobQuestion, 'status' | 'dueDate'>, today: string = todayYmd()): { text: string; tone: DueTone } => {
    if (!q.dueDate) return { text: '', tone: 'none' };
    const year = Number(today.slice(0, 4));
    if (q.status === 'sent') {
        if (isOverdue(q, today)) {
            const n = daysOverdue(q, today);
            return { text: `${n} ${n === 1 ? 'day' : 'days'} overdue`, tone: 'late' };
        }
        if (q.dueDate === today) return { text: 'Due today', tone: 'today' };
        return { text: `Due ${shortDay(q.dueDate, 'en', year)}`, tone: 'normal' };
    }
    return { text: `Due ${shortDay(q.dueDate, 'en', year)}`, tone: 'none' };
};

/** The grey line under a title: kind, then the due date, or when it was answered. */
export const questionMeta = (q: JobQuestion, today: string = todayYmd()): string[] => {
    const decided = q.status === 'answered' || q.status === 'approved' || q.status === 'rejected';
    return [
        kindLabel(q.kind),
        decided ? '' : dueInfo(q, today).text,
        decided && q.answeredAt ? shortDate(q.answeredAt, today) : '',
        q.attachments.length ? `${q.attachments.length} attached` : '',
    ].filter(Boolean);
};

/** "Approved by Maria Lopez" / "Answered by the client" ('' while nothing came back). */
export const answerLine = (q: Pick<JobQuestion, 'status' | 'kind' | 'answeredBy' | 'decision'>): string => {
    const who = q.answeredBy ? q.answeredBy : 'the client';
    if (q.status === 'approved') return `Approved by ${who}`;
    if (q.status === 'rejected') return `Rejected by ${who}`;
    if (q.status === 'answered') return `Answered by ${who}`;
    return '';
};

export interface QuestionGroups {
    waiting: JobQuestion[];
    drafts: JobQuestion[];
    decided: JobQuestion[];
    closed: JobQuestion[];
}

/** Waiting (overdue / soonest first), drafts, answered / approved / rejected, closed. */
export const groupQuestions = (list: readonly JobQuestion[]): QuestionGroups => {
    const g: QuestionGroups = { waiting: [], drafts: [], decided: [], closed: [] };
    for (const q of sortQuestions(list)) {
        if (q.status === 'sent') g.waiting.push(q);
        else if (q.status === 'draft') g.drafts.push(q);
        else if (q.status === 'closed') g.closed.push(q);
        else g.decided.push(q);
    }
    return g;
};

// ===================================================================================================== history
export interface HistoryRow { key: string; when: string; label: string; note: string | null; client: boolean; action: string }

const whenOf = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const day = shortDate(iso);
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${day}, ${time}`;
};

/** The timeline, oldest first. */
export const historyRows = (q: Pick<JobQuestion, 'history' | 'kind'>): HistoryRow[] =>
    q.history
        .map((e, i) => ({ e, i, t: Date.parse(e.at) || 0 }))
        .sort((a, b) => a.t - b.t || a.i - b.i)
        .map(({ e, i }) => ({ key: `${i}-${e.at}`, when: whenOf(e.at), label: historyLabel(e, q.kind), note: e.note, client: e.by === 'client', action: e.action }));

// ===================================================================================================== attachments
export const attachmentFromFile = (f: Pick<JobFile, 'id' | 'title'>): QuestionAttachment =>
    ({ fileId: f.id, title: f.title.slice(0, QUESTION_LIMITS.attachmentTitle) || 'File' });

export const attachmentFromLink = (url: string, title?: string): QuestionAttachment =>
    ({ url, title: (title || '').trim().slice(0, QUESTION_LIMITS.attachmentTitle) || url.slice(0, QUESTION_LIMITS.attachmentTitle) });

export type AttachmentReach = 'opens' | 'title_only' | 'gone';

/**
 * What the client can do with an attachment: a pasted link and a job link open; a shared image opens (large); a PDF or an
 * image that is not shown in the portal is only a title; a file that was deleted is gone.
 */
export const attachmentReach = (a: QuestionAttachment, files: readonly Pick<JobFile, 'id' | 'kind' | 'sharedInPortal' | 'portalPath'>[]): AttachmentReach => {
    if (a.url) return 'opens';
    const f = files.find(x => x.id === a.fileId);
    if (!f) return 'gone';
    if (f.kind === 'link') return 'opens';
    return f.sharedInPortal && f.portalPath ? 'opens' : 'title_only';
};

export const reachNote = (r: AttachmentReach): string =>
    r === 'opens' ? 'The client can open it' : r === 'title_only' ? 'The client sees the title only' : 'This file was deleted';

/** The job's documents (newest version of each) for the "attach from this job's files" list. */
export const attachableFiles = (files: readonly JobFile[]): JobFile[] => sortFiles(latestVersions(files), 'category');

// ===================================================================================================== client link
/** What to tell the contractor about how the client gets the question. */
export const clientLinkNote = (hasClient: boolean): string =>
    hasClient ? CLIENT_ANSWERS_LINE : 'Add a client to this job first: the client opens the questions from their project link.';

/**
 * The history without a repeat: the newest client reply is already shown as the reply, so its note is left out of the
 * timeline while the item is answered (earlier rounds, after "Ask again", keep their notes).
 */
export const historyNotes = (rows: readonly HistoryRow[], q: Pick<JobQuestion, 'status' | 'answer'>): HistoryRow[] => {
    const decided = q.status === 'answered' || q.status === 'approved' || q.status === 'rejected';
    let last = -1;
    rows.forEach((r, i) => { if (r.client) last = i; });
    return rows.map((r, i) => (decided && i === last && r.note && q.answer && q.answer.startsWith(r.note) ? { ...r, note: null } : r));
};
