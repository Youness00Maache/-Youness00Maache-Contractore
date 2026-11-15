/**
 * Client selections (roadmap D5): shapes and limits. Database: public.job_selections
 * (supabase/migrations/20261116000600_selections_boards.sql, NOT applied until the owner's OK: keep the feature hidden
 * until useSelectionsFeature(...) === 'ready'). Premium. Lives inside the job page; the client picks an option from the
 * portal link (lib/portal/selectionsApi.ts).
 *
 *   JobSelection
 *   {
 *     id, userId, jobId,
 *     title, category: string | null ('tile', 'paint'... free text), room: string | null, body: string | null,
 *     dueDate: 'YYYY-MM-DD' | null,
 *     allowance: number | null            (price to the client the contract includes; null = no allowance)
 *     options: SelectionOption[]          (1-6 to send; locked while a choice stands, images excepted)
 *     status: SelectionStatus
 *     chosenOptionId, clientComment, chosenBy, chosenAt   (the client's; read-only for the contractor)
 *     history: SelectionHistoryEntry[]    ({ at, by: 'owner' | 'client', action, note }; written by the database)
 *     poDocumentId: string | null         (the Draft purchase order made from the approved choice)
 *     sentAt, approvedAt, orderedAt, closedAt, createdAt, updatedAt   (written by the database)
 *   }
 *   SelectionOption
 *   {
 *     id: string ([A-Za-z0-9_-]{6,40}; makeOptionId()), name, description: string | null,
 *     imagePath: string | null   (private: document-assets/<user>/selections/<job>/<rand>-<name>.<jpg|jpeg|png|webp>)
 *     portalPath: string | null  (public copy in portal-photos: what the client sees; made by shareOptionImages)
 *     url: string | null         (https product link)
 *     sku, supplierId, unit      (owner-only: never sent to the portal)
 *     qty: number (> 0, default 1), unitPrice: number (price to the client), unitCost: number | null (owner-only)
 *   }
 *   SelectionDraft  { title, category?, room?, body?, dueDate?, allowance?, options? }   (create / edit)
 *   SelectionPatch  Partial<SelectionDraft>
 *
 * Status machine (lib/selections/selectionLogic.ts canTransition; the database enforces the same):
 *   draft -> sent | closed;  sent -> draft (withdraw) | closed;
 *   chosen -> approved | changes_requested | sent (ask again) | closed;  changes_requested -> sent | closed;
 *   approved -> ordered | changes_requested | closed;  ordered -> approved (order cancelled) | closed;
 *   closed -> sent (reopen) | draft (only if never sent).  'chosen' comes from the client only.
 */

export type SelectionStatus = 'draft' | 'sent' | 'chosen' | 'approved' | 'changes_requested' | 'ordered' | 'closed';
export type SelectionHistoryAction =
    | 'created' | 'sent' | 'edited' | 'withdrawn' | 'reopened' | 'chosen' | 'approved' | 'changes_requested'
    | 'ordered' | 'order_cancelled' | 'closed' | 'draft';

export interface SelectionOption {
    id: string;
    name: string;
    description: string | null;
    imagePath: string | null;
    portalPath: string | null;
    url: string | null;
    sku: string | null;
    supplierId: string | null;
    unit: string | null;
    qty: number;
    unitPrice: number;
    unitCost: number | null;
}

/** An option being written (id optional: the database gives one; numbers may still be text from an input). */
export interface SelectionOptionInput {
    id?: string | null;
    name: string;
    description?: string | null;
    imagePath?: string | null;
    portalPath?: string | null;
    url?: string | null;
    sku?: string | null;
    supplierId?: string | null;
    unit?: string | null;
    qty?: number | string | null;
    unitPrice?: number | string | null;
    unitCost?: number | string | null;
}

export interface SelectionHistoryEntry {
    at: string;
    by: 'owner' | 'client';
    action: SelectionHistoryAction | string;
    note: string | null;
}

export interface JobSelection {
    id: string;
    userId: string;
    jobId: string;
    title: string;
    category: string | null;
    room: string | null;
    body: string | null;
    dueDate: string | null;
    allowance: number | null;
    options: SelectionOption[];
    status: SelectionStatus;
    chosenOptionId: string | null;
    clientComment: string | null;
    chosenBy: string | null;
    chosenAt: string | null;
    history: SelectionHistoryEntry[];
    poDocumentId: string | null;
    sentAt: string | null;
    approvedAt: string | null;
    orderedAt: string | null;
    closedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SelectionDraft {
    title: string;
    category?: string | null;
    room?: string | null;
    body?: string | null;
    dueDate?: string | null;
    allowance?: number | string | null;
    options?: readonly SelectionOptionInput[];
}

export type SelectionPatch = Partial<SelectionDraft>;

export interface SelectionTemplate {
    id: 'tile' | 'paint' | 'flooring' | 'fixtures' | 'appliances' | 'countertops';
    label: string;
    draft: SelectionDraft;
}

/** One option's money: total = unitPrice × qty; difference = total − allowance (> 0 upgrade, < 0 credit, null = no allowance). */
export interface OptionPricing {
    total: number;
    cost: number | null;
    difference: number | null;
    kind: 'upgrade' | 'credit' | 'included' | 'none';
}

export interface SelectionSummary {
    total: number;
    draft: number;
    /** Sent: the client has to choose. */
    waitingOnClient: number;
    /** Waiting on the client and past the due date. */
    overdue: number;
    /** Chosen by the client: the contractor has to approve. */
    toApprove: number;
    changesRequested: number;
    /** Approved, no purchase order yet. */
    toOrder: number;
    ordered: number;
    closed: number;
}

/** Keep in sync with the migration (column checks, guard_job_selection). */
export const SELECTION_LIMITS = {
    perJob: 300,
    options: 6,
    title: 200,
    category: 60,
    room: 80,
    body: 4000,
    optionName: 200,
    optionDescription: 2000,
    sku: 80,
    unit: 40,
    url: 2000,
    maxPrice: 99_999_999,
    maxQty: 1_000_000,
    comment: 2000,
    name: 120,
    history: 200,
    /** option images: jpg / png / webp up to 5 MB (what the portal-photos bucket can hold) */
    maxImageBytes: 5 * 1024 * 1024,
} as const;
