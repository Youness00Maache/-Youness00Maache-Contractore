/**
 * Leads + appointments (roadmap D1): shapes shared by the pure logic (leadLogic.ts, appointmentLogic.ts), the row
 * mapping (leadRows.ts) and the Supabase calls (leadsApi.ts). No React, no Supabase here.
 *
 * Database: supabase/migrations/20261116000500_leads_appointments.sql (lead columns on quote_requests + appointments).
 * A lead IS a quote_requests row: the public request page creates them (origin 'request_page'), the owner can add
 * them by hand (any other origin). Keep the lists below in sync with the CHECK constraints of that migration.
 *
 *   Lead            view-model of one quote_requests row (old rows without the lead columns map too: hasLeadColumns=false)
 *   LeadStage       'new' | 'contacted' | 'appointment_set' | 'quote_sent' | 'won' | 'lost'
 *   LeadOrigin      'request_page' | 'phone' | 'email' | 'referral' | 'walk_in' | 'website' | 'social' | 'repeat_client' | 'advertising' | 'other'
 *   LeadAttachment  { path, name, type, size, addedAt }   file in the private document-assets bucket
 *   LeadFormValues  manual "Add lead" / "Edit lead" form (strings, as typed)
 *   LeadPatch       fields the owner can change (camelCase; undefined = keep)
 *   Appointment     view-model of one appointments row
 *   AppointmentDraft / AppointmentPatch
 *   LeadCalendarItem  one follow-up or appointment on a calendar day
 */
import type { QuoteRequestStatus } from '../../components/requests/requestLogic.ts';

export type { QuoteRequestStatus };

export type LeadStage = 'new' | 'contacted' | 'appointment_set' | 'quote_sent' | 'won' | 'lost';
export const LEAD_STAGES: readonly LeadStage[] = ['new', 'contacted', 'appointment_set', 'quote_sent', 'won', 'lost'];
/** Stages of a lead that is still being worked on (board columns before Won / Lost). */
export const OPEN_LEAD_STAGES: readonly LeadStage[] = ['new', 'contacted', 'appointment_set', 'quote_sent'];

export type LeadOrigin =
    | 'request_page' | 'phone' | 'email' | 'referral' | 'walk_in' | 'website' | 'social' | 'repeat_client' | 'advertising' | 'other';
export const LEAD_ORIGINS: readonly LeadOrigin[] = [
    'request_page', 'phone', 'email', 'referral', 'walk_in', 'website', 'social', 'repeat_client', 'advertising', 'other',
];
/** Origins the owner can pick when adding a lead by hand ('request_page' is only set by the public page). */
export const MANUAL_LEAD_ORIGINS: readonly LeadOrigin[] = LEAD_ORIGINS.filter(o => o !== 'request_page');

export interface LeadAttachment {
    /** document-assets bucket: <userId>/leads/<leadId>/<file> */
    path: string;
    name: string;
    /** MIME type */
    type: string;
    size: number;
    addedAt: string;
}

export interface Lead {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    details: string;
    /** photos the visitor sent from the request page (request-photos bucket) */
    photoPaths: string[];
    /** raw ?src= tag of the request page ('qr', 'link'...) or 'manual' */
    source: string;
    origin: LeadOrigin;
    /** added by the owner (origin is not 'request_page') */
    isManual: boolean;
    /** the old request status, unchanged (the old Requests inbox still uses it) */
    status: QuoteRequestStatus;
    stage: LeadStage;
    /** status 'archived': hidden from the board unless asked for */
    archived: boolean;
    clientId: string | null;
    jobId: string | null;
    convertedAt: string | null;
    createdAt: string;
    updatedAt: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    /** YYYY-MM-DD (owner's local day) */
    followUpOn: string | null;
    lostReason: string;
    notes: string;
    attachments: LeadAttachment[];
    lastContactAt: string | null;
    stageChangedAt: string | null;
    /** false: the row came from a database without the lead columns (migration 20261116000500 not applied) */
    hasLeadColumns: boolean;
}

/** "Add lead" / "Edit lead" form, as typed. Budgets are strings ('' = none); followUpOn is '' or YYYY-MM-DD. */
export interface LeadFormValues {
    name: string;
    phone: string;
    email: string;
    address: string;
    details: string;
    origin: LeadOrigin;
    stage: LeadStage;
    budgetMin: string;
    budgetMax: string;
    followUpOn: string;
    notes: string;
}

export type LeadFormErrors = Partial<Record<'name' | 'contact' | 'email' | 'phone' | 'details' | 'budget' | 'followUpOn' | 'notes' | 'origin' | 'stage', string>>;

/** Fields the owner can change on a lead (undefined = keep; null = clear). */
export interface LeadPatch {
    name?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    details?: string | null;
    stage?: LeadStage;
    budgetMin?: number | null;
    budgetMax?: number | null;
    followUpOn?: string | null;
    lostReason?: string | null;
    notes?: string | null;
    attachments?: LeadAttachment[];
    lastContactAt?: string | null;
}

export const LEAD_LIMITS = {
    name: 120,
    phone: 40,
    email: 254,
    address: 300,
    details: 3000,
    notes: 5000,
    lostReason: 300,
    attachments: 20,
    attachmentBytes: 15 * 1024 * 1024,
    budgetMax: 9_999_999_999,
} as const;

// ------------------------------------------------------------------------------------------------ appointments
export type AppointmentStatus = 'scheduled' | 'done' | 'cancelled' | 'no_show';
export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = ['scheduled', 'done', 'cancelled', 'no_show'];

export type AppointmentKind = 'site_visit' | 'estimate' | 'meeting' | 'call' | 'other';
export const APPOINTMENT_KINDS: readonly AppointmentKind[] = ['site_visit', 'estimate', 'meeting', 'call', 'other'];

export interface Appointment {
    id: string;
    leadId: string | null;
    jobId: string | null;
    clientId: string | null;
    kind: AppointmentKind;
    title: string;
    notes: string;
    location: string;
    /** ISO timestamps */
    startsAt: string;
    endsAt: string | null;
    status: AppointmentStatus;
    createdAt: string;
    updatedAt: string | null;
}

export interface AppointmentDraft {
    leadId?: string | null;
    jobId?: string | null;
    clientId?: string | null;
    kind?: AppointmentKind;
    title: string;
    notes?: string;
    location?: string;
    startsAt: string;
    endsAt?: string | null;
}

export type AppointmentPatch = Partial<Omit<AppointmentDraft, 'leadId' | 'jobId' | 'clientId'>> & {
    leadId?: string | null;
    jobId?: string | null;
    clientId?: string | null;
    status?: AppointmentStatus;
};

export const APPOINTMENT_LIMITS = { title: 160, notes: 2000, location: 300, defaultMinutes: 60, maxDays: 7 } as const;

// ------------------------------------------------------------------------------------------------ calendar
export interface LeadCalendarItem {
    /** 'follow_up:<leadId>' | 'appointment:<id>' */
    key: string;
    kind: 'follow_up' | 'appointment';
    /** local day YYYY-MM-DD */
    date: string;
    /** ISO start / end (appointments only) */
    startsAt: string | null;
    endsAt: string | null;
    /** "9:30 AM" or '' for an all-day follow-up */
    timeLabel: string;
    title: string;
    subtitle: string;
    leadId: string | null;
    jobId: string | null;
    clientId: string | null;
    appointmentId: string | null;
    /** a follow-up before today, or a scheduled appointment that already ended */
    overdue: boolean;
    status: AppointmentStatus | 'follow_up';
}
