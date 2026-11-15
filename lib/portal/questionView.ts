/**
 * Client portal: words and rules of the "Questions for you" and "Files" sections (batch D3 phase B). Pure, no React /
 * Supabase, tested by scripts/job-files-check.ts. Data shapes: lib/portal/questionsApi.ts.
 *
 *   splitPortalQuestions(list)             { waiting, answered }   (waiting first: soonest due; answered: newest answer first)
 *   waitingCount(list)                     the badge on the Project tab
 *   validatePortalAnswer(q, input)         readable error or null (the same rules as answer_portal_question)
 *   portalStatusLabel(q) / portalDueInfo(q, today) / portalHistoryRows(q, company)
 *   isImageFile(f) / openablePortalFiles(list) / portalFileSections(list, jobId?)
 */
import { shortDay } from '../tasks/taskView.ts';
import { todayYmd } from '../tasks/taskLogic.ts';
import { isJobFileCategory, categoryLabel } from '../jobFiles/jobFileLogic.ts';
import { JOB_FILE_CATEGORIES, type JobFileCategory } from '../jobFiles/jobFileTypes.ts';
import { shortDate } from '../jobFiles/jobFileView.ts';
import type { PortalJobFile, PortalQuestion } from './questionsApi.ts';

export const PORTAL_ANSWER_MAX = 4000;
export const PORTAL_NAME_MAX = 120;

const byDue = (a: PortalQuestion, b: PortalQuestion): number =>
    (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || String(b.sentAt || '').localeCompare(String(a.sentAt || ''));
const byAnswered = (a: PortalQuestion, b: PortalQuestion): number =>
    String(b.answeredAt || b.sentAt || '').localeCompare(String(a.answeredAt || a.sentAt || ''));

export const splitPortalQuestions = (list: readonly PortalQuestion[]): { waiting: PortalQuestion[]; answered: PortalQuestion[] } => ({
    waiting: list.filter(q => q.status === 'sent').sort(byDue),
    answered: list.filter(q => q.status !== 'sent').sort(byAnswered),
});

export const waitingCount = (list: readonly Pick<PortalQuestion, 'status'>[]): number => list.filter(q => q.status === 'sent').length;

export interface PortalAnswerInput { decision?: 'approved' | 'rejected' | null; answer?: string | null; name?: string | null }

/** What is missing before the client can send (null = fine). Same rules as the database function. */
export const validatePortalAnswer = (q: Pick<PortalQuestion, 'kind'>, input: PortalAnswerInput): string | null => {
    const text = String(input.answer ?? '').trim();
    if (text.length > PORTAL_ANSWER_MAX) return `Please keep it under ${PORTAL_ANSWER_MAX} characters.`;
    if (q.kind === 'question') return text ? null : 'Please write your answer.';
    if (input.decision !== 'approved' && input.decision !== 'rejected') return 'Please choose Approve or Reject.';
    if (input.decision === 'rejected' && !text) return 'Please say what needs to change.';
    if (!String(input.name ?? '').trim()) return 'Please type your name.';
    return null;
};

/** The words next to an item: "Waiting for your answer", "You approved". */
export const portalStatusLabel = (q: Pick<PortalQuestion, 'status' | 'kind'>): string => {
    switch (q.status) {
        case 'sent': return q.kind === 'submittal' ? 'Waiting for your approval' : 'Waiting for your answer';
        case 'answered': return 'You answered';
        case 'approved': return 'You approved';
        case 'rejected': return 'You rejected';
        default: return '';
    }
};

export type PortalDueTone = 'late' | 'today' | 'normal' | 'none';

/** "Please answer by Fri Nov 20" / "Was due Nov 10" (late) / "" with no date. */
export const portalDueInfo = (q: Pick<PortalQuestion, 'status' | 'kind' | 'dueDate'>, today: string = todayYmd()): { text: string; tone: PortalDueTone } => {
    if (!q.dueDate || q.status !== 'sent') return { text: '', tone: 'none' };
    const year = Number(today.slice(0, 4));
    const verb = q.kind === 'submittal' ? 'Please decide by' : 'Please answer by';
    if (q.dueDate < today) return { text: `Was due ${shortDay(q.dueDate, 'en', year)}`, tone: 'late' };
    if (q.dueDate === today) return { text: `${verb} today`, tone: 'today' };
    return { text: `${verb} ${shortDay(q.dueDate, 'en', year)}`, tone: 'normal' };
};

export interface PortalHistoryRow { key: string; when: string; label: string; note: string | null }

/** The history from the client's side ("Sent by Acme", "You approved"), oldest first. */
export const portalHistoryRows = (q: Pick<PortalQuestion, 'history' | 'kind' | 'status' | 'answer'>, company = 'your contractor'): PortalHistoryRow[] => {
    const sorted = q.history
        .map((e, i) => ({ e, i, t: Date.parse(e.at) || 0 }))
        .sort((a, b) => a.t - b.t || a.i - b.i);
    let lastClient = -1;
    sorted.forEach((x, pos) => { if (x.e.by === 'client') lastClient = pos; });
    return sorted.map(({ e, i }, pos) => {
        const label = (() => {
            switch (e.action) {
                case 'sent': return `Sent by ${company}`;
                case 'reopened': return `${company} asked again`;
                case 'answered': return 'You answered';
                case 'approved': return 'You approved';
                case 'rejected': return 'You rejected';
                case 'closed': return `${company} closed it`;
                default: return e.action;
            }
        })();
        // the newest reply is shown as the reply itself; the history repeats the words only for earlier rounds
        const repeat = q.status !== 'sent' && pos === lastClient && !!e.note && !!q.answer && q.answer.startsWith(e.note);
        return { key: `${i}-${e.at}`, when: shortDate(e.at), label, note: repeat ? null : e.note };
    });
};

// ===================================================================================================== files
export const isImageFile = (f: Pick<PortalJobFile, 'kind' | 'mime'>): boolean => f.kind === 'file' && !!f.mime && f.mime.startsWith('image/');

/** Links (with an address) and shared images (with a public copy): nothing else can be opened. */
export const openablePortalFiles = (list: readonly PortalJobFile[]): PortalJobFile[] =>
    list.filter(f => !!f.href && (f.kind === 'link' || isImageFile(f)));

export interface PortalFileSection { category: JobFileCategory; label: string; files: PortalJobFile[] }

/** Openable files of one job (all jobs when `jobId` is null) by category, in the contractor's category order. */
export const portalFileSections = (list: readonly PortalJobFile[], jobId?: string | null): PortalFileSection[] => {
    const mine = openablePortalFiles(list).filter(f => !jobId || f.jobId === jobId);
    return JOB_FILE_CATEGORIES
        .map(c => ({
            category: c.id,
            label: categoryLabel(c.id),
            files: mine.filter(f => (isJobFileCategory(f.category) ? f.category : 'other') === c.id),
        }))
        .filter(s => s.files.length > 0);
};
