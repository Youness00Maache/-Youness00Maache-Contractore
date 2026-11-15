/**
 * Subcontractors, sub commitments and quote comparison (roadmap D7): shapes shared by lib/subs/* and the UI.
 * Database: supabase/migrations/20261116000800_subs_quotes.sql (crew_members.kind / company / trade, sub_commitments,
 * job_quotes, crew_sub_get / crew_sub_accept). All amounts are plain numbers in the account's currency, 2 decimals.
 *
 *   CrewKind              'employee' (hourly worker, the default) | 'subcontractor' (paid per scope)
 *   SubMember             a crew member as the subs screens need it (CrewMember fields of lib/crew/crewApi.ts + kind,
 *                         company, trade)
 *   CommitmentStatus      'draft' | 'issued' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
 *   SubPayment            { id, at: 'YYYY-MM-DD', amount (negative = correction), note }
 *   SubCommitment         one row of sub_commitments (camelCase)
 *   CommitmentDraft       what the owner types to create one (CommitmentPatch = the editable subset)
 *   QuoteStatus           'received' | 'shortlisted' | 'rejected' | 'chosen'
 *   JobQuote              one row of job_quotes (camelCase)
 *   QuoteDraft / QuotePatch
 *   SubLinkCommitment     one commitment as the sub sees it on the crew link (crew_sub_get)
 *   SubLinkView           { available, serverNow, member, commitments }   (available false = functions not in the DB)
 */

export const CREW_KINDS = ['employee', 'subcontractor'] as const;
export type CrewKind = (typeof CREW_KINDS)[number];

export const COMMITMENT_STATUSES = ['draft', 'issued', 'accepted', 'in_progress', 'completed', 'cancelled'] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const QUOTE_STATUSES = ['received', 'shortlisted', 'rejected', 'chosen'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Keep in sync with the migration (checks + guards). */
export const SUB_LIMITS = {
    commitmentsPerJob: 200,
    quotesPerJob: 300,
    maxAmount: 99_999_999,
    maxRetainagePct: 50,
    payments: 100,
    leadTimeDays: 3650,
    fileBytes: 15 * 1024 * 1024,
    title: 200,
    scope: 200,
    vendorName: 120,
    subName: 120,
    company: 120,
    trade: 60,
    longText: 4000,
    paymentNote: 200,
    url: 2000,
    acceptName: 120,
} as const;

export interface SubMember {
    id: string;
    name: string;
    phone: string;
    email: string;
    kind: CrewKind;
    company: string;
    trade: string;
    active: boolean;
    linkOn: boolean;
    lastSeenAt: string | null;
}

/** What the owner can change on a crew member for D7 (kind / company / trade). */
export interface SubMemberPatch {
    kind?: CrewKind;
    company?: string | null;
    trade?: string | null;
}

export interface SubPayment {
    id: string;
    /** YYYY-MM-DD */
    at: string;
    /** > 0 a payment, < 0 a correction */
    amount: number;
    note: string | null;
}

export interface SubCommitment {
    id: string;
    jobId: string;
    crewMemberId: string | null;
    subName: string;
    title: string;
    description: string | null;
    amount: number;
    retainagePct: number;
    startDate: string | null;
    dueDate: string | null;
    status: CommitmentStatus;
    payments: SubPayment[];
    paidTotal: number;
    issuedAt: string | null;
    acceptedAt: string | null;
    acceptedBy: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    quoteId: string | null;
    notes: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface CommitmentDraft {
    crewMemberId?: string | null;
    /** who does the work; empty = the crew member's company or name (filled by the database) */
    subName?: string | null;
    title: string;
    description?: string | null;
    amount: number;
    retainagePct?: number | null;
    startDate?: string | null;
    dueDate?: string | null;
    quoteId?: string | null;
    notes?: string | null;
}

export type CommitmentPatch = Partial<Omit<CommitmentDraft, 'quoteId'>>;

export interface JobQuote {
    id: string;
    jobId: string;
    scope: string;
    /** derived by the database: trimmed, single spaces, lower case (quotes with the same key are compared) */
    scopeKey: string;
    vendorName: string;
    crewMemberId: string | null;
    supplierId: string | null;
    amount: number;
    inclusions: string | null;
    exclusions: string | null;
    notes: string | null;
    leadTimeDays: number | null;
    validUntil: string | null;
    receivedOn: string | null;
    url: string | null;
    filePath: string | null;
    fileName: string | null;
    sizeBytes: number | null;
    status: QuoteStatus;
    chosenAt: string | null;
    createdAt: string | null;
}

export interface QuoteDraft {
    scope: string;
    vendorName?: string | null;
    crewMemberId?: string | null;
    supplierId?: string | null;
    amount: number;
    inclusions?: string | null;
    exclusions?: string | null;
    notes?: string | null;
    leadTimeDays?: number | null;
    validUntil?: string | null;
    receivedOn?: string | null;
    url?: string | null;
}

export type QuotePatch = Partial<QuoteDraft>;

export interface SubLinkCommitment {
    id: string;
    jobId: string;
    jobName: string;
    jobAddress: string;
    jobStatus: string;
    title: string;
    description: string | null;
    amount: number;
    retainagePct: number;
    startDate: string | null;
    dueDate: string | null;
    status: CommitmentStatus;
    paidTotal: number;
    issuedAt: string | null;
    acceptedAt: string | null;
    acceptedBy: string | null;
    completedAt: string | null;
    tasksDone: number;
    tasksTotal: number;
}

export interface SubLinkView {
    /** false = the sub functions are not in the database yet: show the crew link exactly as before */
    available: boolean;
    serverNow: string | null;
    member: { name: string; company: string; trade: string; isSubcontractor: boolean } | null;
    commitments: SubLinkCommitment[];
}
