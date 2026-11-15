/**
 * Warranty tracking, pure (no React, no Supabase): scripts/warranty-check.ts runs it.
 *
 * Everything below works on a Warranty document's `data` object as the form holds it. A warranty saved before D10
 * (no `warrantyTracking`) reads as an empty tracking object: its end date comes from completedDate + the duration
 * text ('1 Year', '90 Days', 'Lifetime'), it has no claims, and nothing is written back until the user changes
 * something, so old documents render and save exactly as before.
 */
import { WARRANTY_TRACKING_KEY } from './types.ts';
import {
    claimsSummary, parseTracking, warrantyState, type ClaimsSummary, type WarrantySource, type WarrantyState, type WarrantyTracking,
} from '../../supabase/functions/reminders/shared/warranty.ts';

export {
    CLAIM_STATUS_LABELS, CLAIM_STATUSES, CLAIM_TRANSITIONS, WARRANTY_LIMITS, WARRANTY_STATUS_LABELS,
    addClaim, addMonths, addTerm, canMoveClaim, isFailure, claimsSummary, editClaim, emptyTracking, moveClaim, parseClaim, parseDurationText,
    parseTracking, removeClaim, setTerm, sortClaims, unvoidWarranty, validateClaimInput, validateTracking, voidWarranty, warrantyState,
    warrantyStatusText, warrantyTerm,
} from '../../supabase/functions/reminders/shared/warranty.ts';

type Data = Record<string, unknown>;

/** The fields of a document's data the warranty logic reads. `createdAt` = documents.created_at when known. */
export const warrantySourceOf = (data: Data | null | undefined, createdAt?: string | null): WarrantySource => ({
    completedDate: data?.completedDate,
    duration: data?.duration,
    warrantyTracking: data?.[WARRANTY_TRACKING_KEY],
    createdAt: createdAt ?? null,
});

/** The tracking object of a warranty's data (empty for a warranty saved before D10). */
export const readWarrantyTracking = (data: Data | null | undefined): WarrantyTracking => parseTracking(data?.[WARRANTY_TRACKING_KEY]);

/** True when the data carries no tracking yet (a warranty saved before D10, or never edited). */
export const hasWarrantyTracking = (data: Data | null | undefined): boolean =>
    !!data && typeof data[WARRANTY_TRACKING_KEY] === 'object' && data[WARRANTY_TRACKING_KEY] !== null;

/**
 * New data with the tracking stored (cleaned, capped). Every other field is kept as is. An empty tracking object
 * (no term fields, no claims, not void) removes the key, so the document stays as it was before D10.
 */
export function withWarrantyTracking(data: Data, tracking: WarrantyTracking): Data {
    const clean = parseTracking(tracking);
    const next: Data = { ...data };
    const empty = !clean.startDate && !clean.termValue && !clean.expiresOn && !clean.lifetime && !clean.voidedAt && clean.claims.length === 0;
    if (empty) delete next[WARRANTY_TRACKING_KEY];
    else next[WARRANTY_TRACKING_KEY] = clean;
    return next;
}

/** Coverage and exclusions are the existing `coverage` / `conditions` fields. */
export const warrantyTexts = (data: Data | null | undefined): { coverage: string; exclusions: string } => ({
    coverage: String(data?.coverage ?? ''),
    exclusions: String(data?.conditions ?? ''),
});

export interface WarrantyOverview extends WarrantyState {
    tracking: WarrantyTracking;
    claims: ClaimsSummary;
    coverage: string;
    exclusions: string;
}

/** Everything a warranty card / panel shows, as of `today` (YYYY-MM-DD, the user's local day). */
export function warrantyOverview(data: Data | null | undefined, today: string, opts: { createdAt?: string | null; expiringDays?: number } = {}): WarrantyOverview {
    const tracking = readWarrantyTracking(data);
    const state = warrantyState(warrantySourceOf(data, opts.createdAt), today, { tracking, expiringDays: opts.expiringDays });
    return { ...state, tracking, claims: claimsSummary(tracking.claims), ...warrantyTexts(data) };
}
