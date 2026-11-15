/**
 * Job timeline (roadmap N11): shapes. One per-job "Timeline" tab shows everything that happened on the job, newest
 * first, built in the browser from data the app already reads (NO database table of its own). Each source is a small
 * pure "adapter" `(data, ctx) => TimelineEvent[]` in lib/timeline/sources/*.ts; lib/timeline/aggregate.ts merges,
 * sorts, groups by day, filters and pages them. Owner-only: nothing here goes to the client portal.
 */

/** The seven filter chips on the Timeline tab. */
export type TimelineGroup = 'money' | 'documents' | 'photos' | 'field' | 'client' | 'team' | 'notes';
export const TIMELINE_GROUPS: readonly TimelineGroup[] = ['money', 'documents', 'photos', 'field', 'client', 'team', 'notes'];
export const GROUP_LABELS: Record<TimelineGroup, string> = {
    money: 'Money', documents: 'Documents', photos: 'Photos', field: 'Field', client: 'Client', team: 'Team', notes: 'Notes',
};

/** Where an event comes from (one adapter each). */
export type TimelineSource =
    | 'documents' | 'dailyReports' | 'photos' | 'notes' | 'punch' | 'tasks' | 'questions' | 'selections' | 'subs' | 'quotes'
    | 'warranty' | 'feedback' | 'reminders' | 'crew' | 'expenses' | 'orders' | 'email';

/** Who did it. */
export type TimelineActor = 'you' | 'client' | 'crew' | 'sub' | 'system';

export type TimelineKind =
    // documents
    | 'doc_created' | 'doc_sent' | 'doc_signed' | 'doc_declined' | 'doc_paid' | 'payment_reported' | 'doc_converted' | 'doc_revised' | 'doc_expired'
    // field + photos + notes
    | 'daily_report' | 'photos' | 'note' | 'punch_added' | 'punch_done' | 'punch_verified' | 'punch_client_note'
    // client conversation
    | 'question_sent' | 'question_answered' | 'question_decided' | 'question_closed'
    | 'selection_sent' | 'selection_chosen' | 'selection_approved' | 'selection_changes' | 'selection_ordered'
    | 'feedback_requested' | 'feedback_received' | 'reminder_sent' | 'email_sent'
    // team + money
    | 'task_added' | 'task_done' | 'crew_time'
    | 'sub_issued' | 'sub_accepted' | 'sub_completed' | 'sub_cancelled' | 'sub_paid'
    | 'quote_received' | 'quote_chosen'
    | 'warranty_started' | 'warranty_claim' | 'warranty_claim_resolved'
    | 'expense' | 'order_sent' | 'order_delivered';

/** Where "Open" goes: a document, or another tab of the job page. */
export type TimelineLink =
    | { type: 'document'; docId: string; formType: string }
    | { type: 'tab'; tab: 'photos' | 'tasks' | 'files' | 'questions' | 'selections' | 'subs' | 'punch' | 'crew' };

export interface TimelinePhoto {
    id: string;
    /** storage path of the small picture (job-photos bucket), else the full one */
    thumbPath: string;
    caption?: string;
}

/** One line of an expanded entry: a label and its value ("Crew" / "3 people", "Hours" / "21.5"). */
export interface TimelineRow { label: string; value: string }

export interface TimelineEvent {
    /** stable: the same fact always has the same id (dedupe, keys) */
    id: string;
    /** ISO instant */
    at: string;
    /** the source only knows the day (a date field): shown without a clock time */
    dayOnly?: boolean;
    kind: TimelineKind;
    source: TimelineSource;
    group: TimelineGroup;
    /** a plain sentence: "Estimate E-1042 sent to Jane" */
    title: string;
    /** one short line under the title */
    detail?: string;
    /** longer text, shown when the entry is opened (a note, a report) */
    body?: string;
    /** facts shown when the entry is opened */
    rows?: TimelineRow[];
    /** money, in the document's currency */
    amount?: number;
    currency?: string;
    actor?: TimelineActor;
    link?: TimelineLink;
    photos?: TimelinePhoto[];
    /** more photos than `photos` carries */
    photoCount?: number;
    /** saved on this device, not on the account yet (offline outbox) */
    pending?: boolean;
}

/** What every adapter may need besides its own data. */
export interface TimelineContext {
    /** IANA time zone the days are cut in (the user's) */
    tz: string;
    /** epoch ms "now" (injected so tests are deterministic) */
    now: number;
    /** the job's client, for "sent to Jane" when a document has no name of its own */
    clientName?: string;
    currency?: string;
    /** crew member id -> name */
    memberNames?: Record<string, string>;
}

/**
 * A document of the job as the timeline reads it: `data` holds the JSON paths the timeline loader selects (see
 * lib/timeline/timelineApi.ts TIMELINE_COLUMNS), or the full data of a document waiting in the offline outbox.
 */
export interface TimelineDoc {
    id: string;
    jobId?: string | null;
    /** FormType value ("Estimate", "Daily Job Report", ...) */
    type: string;
    /** ISO instant the document was created */
    createdAt: string;
    data: Record<string, any>;
    /** saved on this device, not on the account yet */
    pending?: boolean;
}

export type TimelineRange = 'week' | 'month' | 'all';
export type TimelineOrder = 'newest' | 'oldest';

export interface TimelineFilters {
    /** empty / undefined = every group */
    groups?: readonly TimelineGroup[];
    query?: string;
    range?: TimelineRange;
}

export interface TimelineDay {
    /** local calendar day YYYY-MM-DD in the user's time zone */
    day: string;
    events: TimelineEvent[];
}
