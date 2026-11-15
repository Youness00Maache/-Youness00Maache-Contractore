/**
 * Project questions + submittals (roadmap D3): shapes and limits. Database: public.job_questions
 * (supabase/migrations/20261116000400_job_files_questions.sql). Premium. Lives inside the job page; the client answers
 * from the portal link (lib/portal/questionsApi.ts).
 *
 *   JobQuestion
 *   {
 *     id, userId, jobId,
 *     kind: 'question' | 'submittal',
 *     title, body: string | null, dueDate: 'YYYY-MM-DD' | null,
 *     status: 'draft' | 'sent' | 'answered' | 'approved' | 'rejected' | 'closed',
 *     attachments: QuestionAttachment[]     ({ fileId, title } of a job file, or { url, title }; max 10)
 *     answer, answeredBy, answeredAt        (the client's; read-only for the contractor)
 *     decision: 'approved' | 'rejected' | null   (submittals)
 *     history: QuestionHistoryEntry[]       ({ at, by: 'owner' | 'client', action, note }; written by the database)
 *     sharedInPortal: boolean               (true once sent; derived by the database)
 *     sentAt, closedAt, createdAt, updatedAt
 *   }
 *   QuestionDraft  { kind, title, body?, dueDate?, attachments? }   (create / edit a draft)
 *   QuestionPatch  Partial<QuestionDraft>
 *
 * Status machine (lib/questions/questionLogic.ts canTransition; the database enforces the same):
 *   draft -> sent | closed;  sent -> closed;  answered | approved | rejected -> sent (ask again) | closed;
 *   closed -> sent (reopen) | draft (only if never sent). answered / approved / rejected come from the client only.
 */

export type QuestionKind = 'question' | 'submittal';
export type QuestionStatus = 'draft' | 'sent' | 'answered' | 'approved' | 'rejected' | 'closed';
export type QuestionDecision = 'approved' | 'rejected';
export type QuestionHistoryAction = 'created' | 'sent' | 'edited' | 'reopened' | 'closed' | 'draft' | 'answered' | 'approved' | 'rejected';

export type QuestionAttachment =
    | { fileId: string; title: string; url?: undefined }
    | { url: string; title: string; fileId?: undefined };

export interface QuestionHistoryEntry {
    at: string;
    by: 'owner' | 'client';
    action: QuestionHistoryAction | string;
    note: string | null;
}

export interface JobQuestion {
    id: string;
    userId: string;
    jobId: string;
    kind: QuestionKind;
    title: string;
    body: string | null;
    dueDate: string | null;
    status: QuestionStatus;
    attachments: QuestionAttachment[];
    answer: string | null;
    answeredBy: string | null;
    answeredAt: string | null;
    decision: QuestionDecision | null;
    history: QuestionHistoryEntry[];
    sharedInPortal: boolean;
    sentAt: string | null;
    closedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface QuestionDraft {
    kind: QuestionKind;
    title: string;
    body?: string | null;
    dueDate?: string | null;
    attachments?: readonly QuestionAttachment[];
}

export type QuestionPatch = Partial<QuestionDraft>;

export interface QuestionTemplate {
    id: string;
    label: string;
    draft: QuestionDraft;
}

export interface QuestionSummary {
    total: number;
    draft: number;
    /** Sent and waiting for the client. */
    waiting: number;
    /** Waiting and past the due date. */
    overdue: number;
    answered: number;
    approved: number;
    rejected: number;
    closed: number;
}

/** Keep in sync with the migration (column checks, guard_job_question). */
export const QUESTION_LIMITS = {
    perJob: 500,
    title: 200,
    body: 4000,
    attachments: 10,
    attachmentTitle: 200,
    url: 2000,
    answer: 4000,
    name: 120,
    history: 200,
} as const;
