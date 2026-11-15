/**
 * Warranty tracking + after-the-job emails (roadmap D10): the types the UI uses. The logic is shared with the
 * reminders server (supabase/functions/reminders/shared/{warranty,postjob}.ts) so the app shows what the server does.
 *
 * Where the data lives
 *   Warranty document (documents.data, type 'Warranty'): existing completedDate / duration / coverage / conditions
 *   (= exclusions) + NEW optional `warrantyTracking: WarrantyTracking` (start, term or end date, lifetime, void, claims).
 *   After-the-job email settings: public.user_settings 'reminders.postjob' (PostJobSettings).
 */
export type {
    ClaimInput, ClaimStatus, ClaimsSummary, TermUnit, TrackingResult, ValidationFailure, ValidationResult, WarrantyClaim, WarrantySource, WarrantyState,
    WarrantyStatus, WarrantyTerm, WarrantyTracking,
} from '../../supabase/functions/reminders/shared/warranty.ts';
export type {
    Audience, PostJobDecision, PostJobFacts, PostJobKind, PostJobKindSettings, PostJobOff, PostJobPlaceholder, PostJobSettings,
    PostJobStep, PostJobTemplateKey,
} from '../../supabase/functions/reminders/shared/postjob.ts';

/** The key inside documents.data that holds the tracking object. */
export const WARRANTY_TRACKING_KEY = 'warrantyTracking' as const;
