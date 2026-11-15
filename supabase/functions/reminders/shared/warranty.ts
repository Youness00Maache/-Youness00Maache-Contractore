// Warranty tracking (roadmap D10 #40): pure logic shared by the app (lib/warranty) and the reminders edge function.
//
// The data lives INSIDE the Warranty document (documents.data), no table:
//   data.completedDate   existing field: the start date when nothing else is set
//   data.duration        existing free text ('90 Days', '6 Months', '1 Year', ..., 'Lifetime'): the term when nothing
//                        structured is set (parsed by parseDurationText)
//   data.coverage        existing field = the coverage text
//   data.conditions      existing field = the exclusions text
//   data.warrantyTracking  NEW, optional (WarrantyTracking below): structured start / term / explicit expiry, lifetime,
//                        void, and the claims list.
// A warranty without `warrantyTracking` behaves exactly as before; its expiry is derived from completedDate + duration.

import { addDays, diffDays, toYmd } from './schedule.ts';

export type TermUnit = 'days' | 'months' | 'years';
export type ClaimStatus = 'open' | 'in_review' | 'resolved' | 'denied';

export interface WarrantyClaim {
  id: string;
  /** day the client reported it (YYYY-MM-DD) */
  date: string;
  description: string;
  status: ClaimStatus;
  /** what was done, or why it was denied */
  resolution: string;
  /** day it was resolved / denied (YYYY-MM-DD), null while open / in review */
  resolvedOn: string | null;
  /** storage paths of photos (document-assets/<user>/...), optional */
  photos: string[];
  /** epoch ms */
  createdAt: number;
  updatedAt: number;
}

export interface WarrantyTracking {
  v: 1;
  /** coverage starts (YYYY-MM-DD); missing = data.completedDate, else the document's creation day */
  startDate?: string | null;
  /** structured term; missing = parsed from data.duration */
  termValue?: number | null;
  termUnit?: TermUnit | null;
  /** explicit last day of coverage; wins over the term */
  expiresOn?: string | null;
  /** no end date */
  lifetime?: boolean;
  /** cancelled / voided (no reminders, shown as void) */
  voidedAt?: string | null;
  claims: WarrantyClaim[];
}

export const WARRANTY_LIMITS = {
  maxClaims: 50,
  maxPhotosPerClaim: 6,
  description: 2000,
  resolution: 2000,
  photoPath: 300,
  termMax: { days: 3650, months: 600, years: 50 } as Record<TermUnit, number>,
  /** "expiring" when the end is this close (days) */
  expiringDays: 60,
} as const;

export const CLAIM_STATUSES: ClaimStatus[] = ['open', 'in_review', 'resolved', 'denied'];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  denied: 'Denied',
};

/** Allowed claim moves. Resolved / denied can be reopened. */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  open: ['in_review', 'resolved', 'denied'],
  in_review: ['open', 'resolved', 'denied'],
  resolved: ['open'],
  denied: ['open'],
};

export const canMoveClaim = (from: ClaimStatus, to: ClaimStatus): boolean => CLAIM_TRANSITIONS[from]?.includes(to) ?? false;

export const emptyTracking = (): WarrantyTracking => ({ v: 1, claims: [] });

/* --------------------------------------------------------------------------------------- parsing */

const str = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const isStatus = (v: unknown): v is ClaimStatus => typeof v === 'string' && (CLAIM_STATUSES as string[]).includes(v);
const isUnit = (v: unknown): v is TermUnit => v === 'days' || v === 'months' || v === 'years';
const PHOTO_RE = /^[A-Za-z0-9_./-]{3,300}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const finiteMs = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e14 ? Math.floor(v) : fallback);

/** One stored claim -> a clean claim, or null when it is unusable. Never throws. */
export function parseClaim(raw: unknown): WarrantyClaim | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : null;
  const date = toYmd(r.date);
  if (!id || !date) return null;
  const status: ClaimStatus = isStatus(r.status) ? r.status : 'open';
  const closed = status === 'resolved' || status === 'denied';
  const photos = Array.isArray(r.photos)
    ? [...new Set(r.photos.filter((p): p is string => typeof p === 'string' && PHOTO_RE.test(p) && !p.includes('..')))].slice(0, WARRANTY_LIMITS.maxPhotosPerClaim)
    : [];
  const createdAt = finiteMs(r.createdAt, 0);
  return {
    id,
    date,
    description: str(r.description, WARRANTY_LIMITS.description),
    status,
    resolution: str(r.resolution, WARRANTY_LIMITS.resolution),
    resolvedOn: closed ? toYmd(r.resolvedOn) ?? date : null,
    photos,
    createdAt,
    updatedAt: finiteMs(r.updatedAt, createdAt),
  };
}

/** Stored value (or nothing) -> clean tracking. Unknown keys are dropped, caps applied. Never throws. */
export function parseTracking(raw: unknown): WarrantyTracking {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = null; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return emptyTracking();
  const r = v as Record<string, unknown>;
  const out: WarrantyTracking = { v: 1, claims: [] };
  const start = toYmd(r.startDate);
  if (start) out.startDate = start;
  if (isUnit(r.termUnit)) {
    const n = Math.trunc(Number(r.termValue));
    if (Number.isFinite(n) && n >= 1 && n <= WARRANTY_LIMITS.termMax[r.termUnit]) {
      out.termValue = n;
      out.termUnit = r.termUnit;
    }
  }
  const exp = toYmd(r.expiresOn);
  if (exp) out.expiresOn = exp;
  if (r.lifetime === true) out.lifetime = true;
  const voided = typeof r.voidedAt === 'string' && Number.isFinite(Date.parse(r.voidedAt)) ? r.voidedAt : null;
  if (voided) out.voidedAt = voided;
  const seen = new Set<string>();
  for (const c of Array.isArray(r.claims) ? r.claims : []) {
    const claim = parseClaim(c);
    if (!claim || seen.has(claim.id)) continue;
    seen.add(claim.id);
    out.claims.push(claim);
    if (out.claims.length >= WARRANTY_LIMITS.maxClaims) break;
  }
  return out;
}

/**
 * The existing free-text duration -> a term. '90 Days', '6 months', '1 Year', '2 yrs', '3 weeks' (= 21 days),
 * 'Lifetime'. Anything else (empty, '1 year labor / 10 years roof') -> null: no computed expiry.
 */
export function parseDurationText(text: unknown): { lifetime: true } | { value: number; unit: TermUnit } | null {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^(lifetime|limited lifetime)( warranty)?$/.test(s)) return { lifetime: true };
  const m = /^(\d{1,4})\s*-?\s*(days?|weeks?|wks?|months?|mos?|years?|yrs?)( warranty)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2];
  let value = n;
  let unit: TermUnit;
  if (u.startsWith('d')) unit = 'days';
  else if (u.startsWith('w')) { unit = 'days'; value = n * 7; }
  else if (u.startsWith('m')) unit = 'months';
  else unit = 'years';
  if (value < 1 || value > WARRANTY_LIMITS.termMax[unit]) return null;
  return { value, unit };
}

/** Calendar months, clamped to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const addTerm = (start: string, value: number, unit: TermUnit): string =>
  unit === 'days' ? addDays(start, value) : addMonths(start, unit === 'years' ? value * 12 : value);

/* ---------------------------------------------------------------------------------------- facts */

/** The fields of a Warranty document this logic reads (form data or a documents row's JSON paths). */
export interface WarrantySource {
  completedDate?: unknown;
  duration?: unknown;
  /** documents.data.warrantyTracking (raw) */
  warrantyTracking?: unknown;
  /** documents.created_at (fallback start day) */
  createdAt?: unknown;
}

export type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'lifetime' | 'void' | 'unknown';

export interface WarrantyTerm {
  /** first day covered, null when unknown */
  startDate: string | null;
  /** last day covered, null for lifetime / unknown */
  expiresOn: string | null;
  lifetime: boolean;
  /** where the end date came from */
  source: 'explicit' | 'term' | 'duration_text' | 'lifetime' | 'none';
  term: { value: number; unit: TermUnit } | null;
}

/**
 * Start and end of coverage.
 *   start   = tracking.startDate, else data.completedDate, else the document's creation day
 *   end     = tracking.expiresOn, else lifetime, else start + tracking term, else start + parsed duration text
 * "Ends on" is start + term (a 1-year warranty from 2026-01-15 ends 2027-01-15).
 */
export function warrantyTerm(src: WarrantySource, tracking: WarrantyTracking = parseTracking(src.warrantyTracking)): WarrantyTerm {
  const startDate = toYmd(tracking.startDate) ?? toYmd(src.completedDate) ?? toYmd(src.createdAt);
  const explicit = toYmd(tracking.expiresOn);
  if (explicit) return { startDate, expiresOn: explicit, lifetime: false, source: 'explicit', term: null };
  if (tracking.lifetime) return { startDate, expiresOn: null, lifetime: true, source: 'lifetime', term: null };
  if (tracking.termValue && tracking.termUnit) {
    const term = { value: tracking.termValue, unit: tracking.termUnit };
    return { startDate, expiresOn: startDate ? addTerm(startDate, term.value, term.unit) : null, lifetime: false, source: 'term', term };
  }
  const parsed = parseDurationText(src.duration);
  if (parsed) {
    if ('lifetime' in parsed) return { startDate, expiresOn: null, lifetime: true, source: 'lifetime', term: null };
    const term = parsed as { value: number; unit: TermUnit };
    return { startDate, expiresOn: startDate ? addTerm(startDate, term.value, term.unit) : null, lifetime: false, source: 'duration_text', term };
  }
  return { startDate, expiresOn: null, lifetime: false, source: 'none', term: null };
}

export interface WarrantyState extends WarrantyTerm {
  status: WarrantyStatus;
  /** days until the end (negative = ended that many days ago), null without an end */
  daysLeft: number | null;
}

/** Active / expiring within `expiringDays` / expired / lifetime / void / unknown, as of `today` (YYYY-MM-DD). */
export function warrantyState(src: WarrantySource, today: string, opts: { expiringDays?: number; tracking?: WarrantyTracking } = {}): WarrantyState {
  const tracking = opts.tracking ?? parseTracking(src.warrantyTracking);
  const term = warrantyTerm(src, tracking);
  const daysLeft = term.expiresOn ? diffDays(term.expiresOn, today) : null;
  let status: WarrantyStatus;
  if (tracking.voidedAt) status = 'void';
  else if (term.lifetime) status = 'lifetime';
  else if (daysLeft === null) status = 'unknown';
  else if (daysLeft < 0) status = 'expired';
  else if (daysLeft <= (opts.expiringDays ?? WARRANTY_LIMITS.expiringDays)) status = 'expiring';
  else status = 'active';
  return { ...term, status, daysLeft };
}

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  active: 'Active',
  expiring: 'Ending soon',
  expired: 'Ended',
  lifetime: 'Lifetime',
  void: 'Void',
  unknown: 'No end date',
};

/** "Ends in 30 days" / "Ends today" / "Ended 5 days ago" / "Lifetime" ... */
export function warrantyStatusText(s: Pick<WarrantyState, 'status' | 'daysLeft'>): string {
  if (s.status === 'void') return 'Void';
  if (s.status === 'lifetime') return 'Lifetime coverage';
  if (s.daysLeft === null) return 'No end date';
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  if (s.daysLeft === 0) return 'Ends today';
  return s.daysLeft > 0 ? `Ends in ${days(s.daysLeft)}` : `Ended ${days(-s.daysLeft)} ago`;
}

/* ---------------------------------------------------------------------------------------- claims */

export interface ClaimsSummary {
  total: number;
  open: number;
  inReview: number;
  resolved: number;
  denied: number;
  /** open + in review */
  active: number;
  /** oldest open / in-review claim date */
  oldestActive: string | null;
  lastDate: string | null;
}

export function claimsSummary(claims: readonly WarrantyClaim[]): ClaimsSummary {
  const s: ClaimsSummary = { total: claims.length, open: 0, inReview: 0, resolved: 0, denied: 0, active: 0, oldestActive: null, lastDate: null };
  for (const c of claims) {
    if (c.status === 'open') s.open++;
    else if (c.status === 'in_review') s.inReview++;
    else if (c.status === 'resolved') s.resolved++;
    else s.denied++;
    if (c.status === 'open' || c.status === 'in_review') {
      if (!s.oldestActive || c.date < s.oldestActive) s.oldestActive = c.date;
    }
    if (!s.lastDate || c.date > s.lastDate) s.lastDate = c.date;
  }
  s.active = s.open + s.inReview;
  return s;
}

/** Newest first, active ones first. */
export const sortClaims = (claims: readonly WarrantyClaim[]): WarrantyClaim[] =>
  [...claims].sort((a, b) => {
    const act = (c: WarrantyClaim) => (c.status === 'open' || c.status === 'in_review' ? 0 : 1);
    return act(a) - act(b) || (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt);
  });

/* ------------------------------------------------------------------------------------- validation */

export type ValidationFailure = { ok: false; field: string; message: string };
export type ValidationResult = { ok: true } | ValidationFailure;

/** Type guard for a failed validation / mutation (works without strictNullChecks narrowing). */
export const isFailure = (r: { ok: boolean }): r is ValidationFailure => r.ok === false;

const fail = (field: string, message: string): ValidationResult => ({ ok: false, field, message });

/** Checks the structured term before saving (the form shows `message` next to `field`). */
export function validateTracking(t: WarrantyTracking, src: WarrantySource = {}): ValidationResult {
  if (t.startDate != null && !toYmd(t.startDate)) return fail('startDate', 'Pick a valid start date.');
  if (t.expiresOn != null && !toYmd(t.expiresOn)) return fail('expiresOn', 'Pick a valid end date.');
  if ((t.termValue != null) !== (t.termUnit != null)) return fail('termValue', 'Enter the length and pick days, months or years.');
  if (t.termValue != null && t.termUnit != null) {
    const n = Number(t.termValue);
    if (!Number.isInteger(n) || n < 1 || n > WARRANTY_LIMITS.termMax[t.termUnit]) {
      return fail('termValue', `The length must be between 1 and ${WARRANTY_LIMITS.termMax[t.termUnit]} ${t.termUnit}.`);
    }
  }
  if (t.lifetime && t.expiresOn) return fail('expiresOn', 'A lifetime warranty has no end date.');
  const start = toYmd(t.startDate) ?? toYmd(src.completedDate) ?? toYmd(src.createdAt);
  const exp = toYmd(t.expiresOn);
  if (start && exp && exp < start) return fail('expiresOn', 'The end date is before the start date.');
  if (t.claims.length > WARRANTY_LIMITS.maxClaims) return fail('claims', `At most ${WARRANTY_LIMITS.maxClaims} claims per warranty.`);
  return { ok: true };
}

export interface ClaimInput {
  date: string;
  description: string;
  photos?: string[];
}

export function validateClaimInput(input: ClaimInput, today: string): ValidationResult {
  const date = toYmd(input.date);
  if (!date) return fail('date', 'Pick the day the client reported it.');
  if (date > addDays(today, 1)) return fail('date', 'The date is in the future.');
  const d = String(input.description ?? '').trim();
  if (!d) return fail('description', 'Describe the problem.');
  if (d.length > WARRANTY_LIMITS.description) return fail('description', `Keep it under ${WARRANTY_LIMITS.description} characters.`);
  if ((input.photos ?? []).length > WARRANTY_LIMITS.maxPhotosPerClaim) return fail('photos', `At most ${WARRANTY_LIMITS.maxPhotosPerClaim} photos per claim.`);
  return { ok: true };
}

/* -------------------------------------------------------------------------------------- mutations */

export type TrackingResult = { ok: true; tracking: WarrantyTracking; claim?: WarrantyClaim } | ValidationFailure;

/** Adds an open claim. `id` comes from the caller (crypto.randomUUID()) so this stays pure. */
export function addClaim(t: WarrantyTracking, input: ClaimInput & { id: string }, now: number, today: string): TrackingResult {
  const v = validateClaimInput(input, today);
  if (isFailure(v)) return v;
  if (t.claims.length >= WARRANTY_LIMITS.maxClaims) return fail('claims', `At most ${WARRANTY_LIMITS.maxClaims} claims per warranty.`) as TrackingResult;
  const claim = parseClaim({ ...input, status: 'open', resolution: '', resolvedOn: null, createdAt: now, updatedAt: now });
  if (!claim || !ID_RE.test(input.id)) return fail('id', 'Could not add the claim.') as TrackingResult;
  if (t.claims.some((c) => c.id === claim.id)) return fail('id', 'This claim is already there.') as TrackingResult;
  return { ok: true, tracking: { ...t, claims: [...t.claims, claim] }, claim };
}

/** Edits the description / date / photos of a claim (any status). */
export function editClaim(t: WarrantyTracking, id: string, patch: Partial<ClaimInput>, now: number, today: string): TrackingResult {
  const cur = t.claims.find((c) => c.id === id);
  if (!cur) return fail('id', 'This claim is not there any more.') as TrackingResult;
  const next = { date: patch.date ?? cur.date, description: patch.description ?? cur.description, photos: patch.photos ?? cur.photos };
  const v = validateClaimInput(next, today);
  if (isFailure(v)) return v;
  const claim = parseClaim({ ...cur, ...next, updatedAt: now });
  if (!claim) return fail('id', 'Could not save the claim.') as TrackingResult;
  return { ok: true, tracking: { ...t, claims: t.claims.map((c) => (c.id === id ? claim : c)) }, claim };
}

/**
 * Moves a claim along the state machine (CLAIM_TRANSITIONS). Resolving / denying sets resolvedOn (default today) and
 * a denial needs a reason in `resolution`. Reopening clears resolvedOn and keeps the earlier resolution text.
 */
export function moveClaim(
  t: WarrantyTracking,
  id: string,
  to: ClaimStatus,
  opts: { resolution?: string; resolvedOn?: string; now: number; today: string },
): TrackingResult {
  const cur = t.claims.find((c) => c.id === id);
  if (!cur) return fail('id', 'This claim is not there any more.') as TrackingResult;
  if (cur.status === to) return { ok: true, tracking: t, claim: cur };
  if (!canMoveClaim(cur.status, to)) return fail('status', `A ${CLAIM_STATUS_LABELS[cur.status].toLowerCase()} claim cannot be marked ${CLAIM_STATUS_LABELS[to].toLowerCase()}.`) as TrackingResult;
  const resolution = opts.resolution !== undefined ? str(opts.resolution, WARRANTY_LIMITS.resolution) : cur.resolution;
  const closing = to === 'resolved' || to === 'denied';
  if (to === 'denied' && !resolution) return fail('resolution', 'Say why the claim is denied.') as TrackingResult;
  let resolvedOn: string | null = null;
  if (closing) {
    resolvedOn = toYmd(opts.resolvedOn) ?? opts.today;
    if (resolvedOn < cur.date) return fail('resolvedOn', 'The date is before the claim was reported.') as TrackingResult;
  }
  const claim: WarrantyClaim = { ...cur, status: to, resolution, resolvedOn, updatedAt: opts.now };
  return { ok: true, tracking: { ...t, claims: t.claims.map((c) => (c.id === id ? claim : c)) }, claim };
}

export function removeClaim(t: WarrantyTracking, id: string): WarrantyTracking {
  return { ...t, claims: t.claims.filter((c) => c.id !== id) };
}

/** Sets the structured term fields (null clears one). Validated; claims untouched. */
export function setTerm(
  t: WarrantyTracking,
  patch: Partial<Pick<WarrantyTracking, 'startDate' | 'termValue' | 'termUnit' | 'expiresOn' | 'lifetime'>>,
  src: WarrantySource = {},
): TrackingResult {
  const next: WarrantyTracking = { ...t, ...patch, v: 1, claims: t.claims };
  for (const k of ['startDate', 'termValue', 'termUnit', 'expiresOn'] as const) if (next[k] == null || next[k] === '') delete next[k];
  if (!next.lifetime) delete next.lifetime;
  const v = validateTracking(next, src);
  if (isFailure(v)) return v;
  return { ok: true, tracking: parseTracking(next) };
}

export const voidWarranty = (t: WarrantyTracking, at: Date): WarrantyTracking => ({ ...t, voidedAt: at.toISOString() });
export const unvoidWarranty = (t: WarrantyTracking): WarrantyTracking => {
  const next = { ...t };
  delete next.voidedAt;
  return next;
};
