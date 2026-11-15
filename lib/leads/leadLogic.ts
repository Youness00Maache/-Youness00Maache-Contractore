/**
 * Leads (roadmap D1): pure logic, no React / Supabase. Tested by scripts/leads-check.ts. Shapes: ./leadTypes.ts.
 *
 * Stages
 *   LEAD_STAGE_INFO[stage]                 { label, short, hint, open }
 *   stageLabel(stage) / originLabel(origin)
 *   stageFromRow(row)                      stage of a quote_requests row (old rows too, see the rules below)
 *   stageFromStatus(status)                old request status -> stage (database without the lead columns)
 *   statusForStage(stage, currentStatus)   the old status to write with a stage move (null = leave it)
 *   allowedStageMoves(lead)                stages the lead can be moved to now
 *   canMoveStage(lead, to)                 { ok: true } | { ok: false, reason }
 *   stageAfterAppointment(stage)           'appointment_set' when booking should advance the lead, else null
 *   stageAfterContact(stage)               'contacted' when logging a contact should advance the lead, else null
 *   LOST_REASONS                           preset lost reasons (stored as their label text; free text allowed)
 * Follow-ups / staleness (today = local YYYY-MM-DD)
 *   followUpState(lead, today)             'none' | 'upcoming' | 'today' | 'overdue'
 *   needsFollowUp(lead, today)             open lead with a follow-up due today or before
 *   overdueFollowUps(leads, today)         those leads, oldest follow-up first
 *   lastActivityAt(lead)                   last contact, else stage change, else created
 *   isStaleLead(lead, now, days?)          open lead with no activity for `days` (STALE_LEAD_DAYS = 7)
 *   daysSince(iso, now)
 * Numbers
 *   leadBudgetMid(lead)                    one number for a budget range (null = none)
 *   formatBudget(lead, currency?)          "$5,000 – $8,000" / "$5,000+" / "up to $8,000" / ''
 *   leadPipelineSummary(leads)             per stage: count, budget total; plus open totals
 *   leadWinRate(leads)                     won / (won + lost) or null
 *   leadSourcesSummary(leads)              per origin: count, won, lost, winRate, budget won
 *   groupLeadsByStage(leads, opts?)        board columns (archived left out unless asked)
 *   sortLeads(leads, by)                   'newest' | 'follow_up' | 'budget' | 'stale'
 *   searchLeads(leads, query)
 * Forms
 *   EMPTY_LEAD_FORM, leadToForm(lead)
 *   validateLeadForm(values)               LeadFormErrors ({} = fine); hasLeadErrors(errors)
 *   parseBudget(text)                      number | null | NaN (NaN = not a number)
 *   leadFormToPatch(values)                LeadPatch for insert / update (trimmed, '' -> null)
 * Convert
 *   leadToConvertDraft(lead, today)        { jobName, startDate } for convert_quote_request (the existing path)
 * Plan
 *   leadToolsForTier(tier)                 what the plan includes (Free: the lead list itself; Premium: automation)
 */
import { jobNameFromRequest, phoneDigits, sourceLabel } from '../../components/requests/requestLogic.ts';
import {
    LEAD_LIMITS, LEAD_ORIGINS, LEAD_STAGES, OPEN_LEAD_STAGES,
    type Lead, type LeadFormErrors, type LeadFormValues, type LeadOrigin, type LeadPatch, type LeadStage, type QuoteRequestStatus,
} from './leadTypes.ts';

// ------------------------------------------------------------------------------------------------ stages
export const LEAD_STAGE_INFO: Record<LeadStage, { label: string; short: string; hint: string; open: boolean }> = {
    new: { label: 'New', short: 'New', hint: 'Not contacted yet', open: true },
    contacted: { label: 'Contacted', short: 'Contacted', hint: 'You spoke or wrote to them', open: true },
    appointment_set: { label: 'Appointment set', short: 'Appt set', hint: 'A visit or call is booked', open: true },
    quote_sent: { label: 'Quote sent', short: 'Quoted', hint: 'Waiting for their answer', open: true },
    won: { label: 'Won', short: 'Won', hint: 'They said yes', open: false },
    lost: { label: 'Lost', short: 'Lost', hint: 'Not going ahead', open: false },
};

export const ORIGIN_LABELS: Record<LeadOrigin, string> = {
    request_page: 'Request page',
    phone: 'Phone call',
    email: 'Email',
    referral: 'Referral',
    walk_in: 'Walk-in',
    website: 'Website',
    social: 'Social media',
    repeat_client: 'Repeat client',
    advertising: 'Advertising',
    other: 'Other',
};

export const LOST_REASONS: readonly string[] = [
    'Price too high', 'Went with another contractor', 'Timing did not work', 'No response', 'Project cancelled',
    'Out of our service area', 'Not a fit for our work',
];

export const isLeadStage = (v: unknown): v is LeadStage => typeof v === 'string' && (LEAD_STAGES as readonly string[]).includes(v);
export const isLeadOrigin = (v: unknown): v is LeadOrigin => typeof v === 'string' && (LEAD_ORIGINS as readonly string[]).includes(v);
export const isOpenStage = (s: LeadStage): boolean => (OPEN_LEAD_STAGES as readonly string[]).includes(s);

export const stageLabel = (stage: LeadStage): string => LEAD_STAGE_INFO[stage]?.label ?? stage;
/** Label of where the lead came from; request-page leads add the link tag ("Request page · QR code"). */
export const originLabel = (origin: LeadOrigin, source = ''): string => {
    const base = ORIGIN_LABELS[origin] ?? 'Other';
    if (origin !== 'request_page') return base;
    const tag = sourceLabel(source);
    return tag && tag !== 'Request link' ? `${base} · ${tag}` : base;
};

/** Old request status -> stage (used when the database has no stage column yet). */
export const stageFromStatus = (status: string): LeadStage => {
    switch (status) {
        case 'converted': return 'won';
        case 'archived': return 'lost';
        default: return 'new';
    }
};

/**
 * Stage of a quote_requests row:
 *  - converted (status 'converted' or a job linked) -> 'won' (convert_quote_request doesn't write the stage)
 *  - else the stored stage when the column exists and holds a known value
 *  - else from the old status (new / seen -> new, archived -> lost)
 * Archived rows keep their stage; the board hides them by the `archived` flag.
 */
export const stageFromRow = (row: { status?: unknown; job_id?: unknown; stage?: unknown } | null | undefined): LeadStage => {
    if (!row) return 'new';
    if (row.status === 'converted' || (row.job_id !== null && row.job_id !== undefined && row.job_id !== '')) return 'won';
    if (isLeadStage(row.stage)) {
        // an archived old row has the column default 'new': show it as lost (it was dismissed)
        if (row.status === 'archived' && row.stage === 'new') return 'lost';
        return row.stage;
    }
    return stageFromStatus(String(row.status ?? 'new'));
};

/**
 * The old status to write together with a stage move, so the old Requests inbox stays consistent
 * (null = leave the status). Never writes 'converted' (only the convert path does).
 *   lost            -> archived
 *   reopened        -> seen  (from archived)
 *   past 'new'      -> seen  (from new)
 */
export const statusForStage = (stage: LeadStage, current: QuoteRequestStatus): QuoteRequestStatus | null => {
    if (current === 'converted') return null;
    if (stage === 'lost') return current === 'archived' ? null : 'archived';
    if (current === 'archived') return 'seen';
    if (stage !== 'new' && current === 'new') return 'seen';
    return null;
};

/** Stages the lead can move to. A converted lead (job created) stays Won; everything else can move freely. */
export const allowedStageMoves = (lead: Pick<Lead, 'stage' | 'jobId' | 'status'>): LeadStage[] => {
    if (lead.jobId || lead.status === 'converted') return [];
    return LEAD_STAGES.filter(s => s !== lead.stage);
};

export const canMoveStage = (
    lead: Pick<Lead, 'stage' | 'jobId' | 'status' | 'hasLeadColumns'>, to: LeadStage, lostReason?: string | null,
): { ok: true } | { ok: false; reason: string } => {
    if (!isLeadStage(to)) return { ok: false, reason: 'Unknown stage.' };
    if (lead.jobId || lead.status === 'converted') return { ok: false, reason: 'This lead is already a job.' };
    if (to === lead.stage) return { ok: false, reason: 'The lead is already in this stage.' };
    if (!lead.hasLeadColumns && to !== 'new' && to !== 'lost') {
        return { ok: false, reason: 'Lead stages are not switched on yet. Please try again later.' };
    }
    if (to === 'lost' && lostReason !== undefined && lostReason !== null && lostReason.trim().length > LEAD_LIMITS.lostReason) {
        return { ok: false, reason: `Please keep the reason under ${LEAD_LIMITS.lostReason} characters.` };
    }
    return { ok: true };
};

/** Booking an appointment advances a new / contacted lead to 'appointment_set'. */
export const stageAfterAppointment = (stage: LeadStage): LeadStage | null =>
    stage === 'new' || stage === 'contacted' ? 'appointment_set' : null;

/** Logging a call / message advances a new lead to 'contacted'. */
export const stageAfterContact = (stage: LeadStage): LeadStage | null => (stage === 'new' ? 'contacted' : null);

// ------------------------------------------------------------------------------------------------ dates
const DAY_MS = 86_400_000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isYmd = (v: unknown): v is string => {
    if (typeof v !== 'string' || !YMD_RE.test(v)) return false;
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Local day of a Date as YYYY-MM-DD. */
export const localYmd = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole days from a to b (YYYY-MM-DD), b - a. */
export const ymdDiff = (a: string, b: string): number => {
    const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / DAY_MS);
};

export const daysSince = (iso: string | null | undefined, now: number | Date = Date.now()): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    const n = typeof now === 'number' ? now : now.getTime();
    return Math.max(0, Math.floor((n - t) / DAY_MS));
};

// ------------------------------------------------------------------------------------------------ follow-ups
export type FollowUpState = 'none' | 'upcoming' | 'today' | 'overdue';

export const followUpState = (lead: Pick<Lead, 'followUpOn' | 'stage' | 'archived'>, today: string): FollowUpState => {
    if (!lead.followUpOn || !isYmd(lead.followUpOn) || !isOpenStage(lead.stage) || lead.archived) return 'none';
    if (lead.followUpOn < today) return 'overdue';
    if (lead.followUpOn === today) return 'today';
    return 'upcoming';
};

export const needsFollowUp = (lead: Pick<Lead, 'followUpOn' | 'stage' | 'archived'>, today: string): boolean => {
    const s = followUpState(lead, today);
    return s === 'today' || s === 'overdue';
};

/** Open leads whose follow-up is today or earlier, oldest follow-up first. */
export const overdueFollowUps = <T extends Pick<Lead, 'followUpOn' | 'stage' | 'archived'>>(leads: readonly T[], today: string): T[] =>
    leads.filter(l => needsFollowUp(l, today)).sort((a, b) => String(a.followUpOn).localeCompare(String(b.followUpOn)));

export const STALE_LEAD_DAYS = 7;

export const lastActivityAt = (lead: Pick<Lead, 'lastContactAt' | 'stageChangedAt' | 'createdAt'>): string => {
    const times = [lead.lastContactAt, lead.stageChangedAt, lead.createdAt].filter((t): t is string => !!t && Number.isFinite(new Date(t).getTime()));
    if (!times.length) return lead.createdAt;
    return times.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b));
};

/** Open, not archived, no follow-up planned in the future, and nothing happened for `days` days. */
export const isStaleLead = (
    lead: Pick<Lead, 'lastContactAt' | 'stageChangedAt' | 'createdAt' | 'stage' | 'archived' | 'followUpOn'>,
    now: number | Date = Date.now(), days = STALE_LEAD_DAYS,
): boolean => {
    if (!isOpenStage(lead.stage) || lead.archived) return false;
    const today = localYmd(typeof now === 'number' ? new Date(now) : now);
    if (lead.followUpOn && isYmd(lead.followUpOn) && lead.followUpOn > today) return false;
    const age = daysSince(lastActivityAt(lead), now);
    return age !== null && age >= days;
};

// ------------------------------------------------------------------------------------------------ numbers
export const leadBudgetMid = (lead: Pick<Lead, 'budgetMin' | 'budgetMax'>): number | null => {
    const lo = lead.budgetMin;
    const hi = lead.budgetMax;
    if (lo !== null && hi !== null) return (lo + hi) / 2;
    return lo ?? hi ?? null;
};

export const formatBudget = (lead: Pick<Lead, 'budgetMin' | 'budgetMax'>, currency = 'USD', locale?: string): string => {
    const fmt = (n: number) => {
        try {
            return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
        } catch {
            return String(n);
        }
    };
    const { budgetMin: lo, budgetMax: hi } = lead;
    if (lo !== null && hi !== null) return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
    if (lo !== null) return `${fmt(lo)}+`;
    if (hi !== null) return `up to ${fmt(hi)}`;
    return '';
};

export interface LeadStageSummary {
    stage: LeadStage;
    label: string;
    count: number;
    /** sum of leadBudgetMid over the stage's leads that have a budget */
    budgetTotal: number;
    withBudget: number;
}

export interface LeadPipelineSummary {
    stages: LeadStageSummary[];
    openCount: number;
    openBudget: number;
    wonCount: number;
    lostCount: number;
    winRate: number | null;
}

/** Counts and budget totals per stage (archived leads left out). */
export const leadPipelineSummary = (leads: readonly Lead[]): LeadPipelineSummary => {
    const stages: LeadStageSummary[] = LEAD_STAGES.map(stage => ({ stage, label: stageLabel(stage), count: 0, budgetTotal: 0, withBudget: 0 }));
    const byStage = new Map(stages.map(s => [s.stage, s]));
    for (const lead of leads) {
        if (lead.archived && lead.stage !== 'won' && lead.stage !== 'lost') continue;
        const s = byStage.get(lead.stage);
        if (!s) continue;
        s.count++;
        const mid = leadBudgetMid(lead);
        if (mid !== null) { s.budgetTotal += mid; s.withBudget++; }
    }
    const open = stages.filter(s => isOpenStage(s.stage));
    const won = byStage.get('won')!.count;
    const lost = byStage.get('lost')!.count;
    return {
        stages,
        openCount: open.reduce((n, s) => n + s.count, 0),
        openBudget: open.reduce((n, s) => n + s.budgetTotal, 0),
        wonCount: won,
        lostCount: lost,
        winRate: won + lost > 0 ? won / (won + lost) : null,
    };
};

/** Won / (won + lost); null when nothing is decided yet. */
export const leadWinRate = (leads: readonly Pick<Lead, 'stage'>[]): number | null => {
    let won = 0;
    let lost = 0;
    for (const l of leads) { if (l.stage === 'won') won++; else if (l.stage === 'lost') lost++; }
    return won + lost > 0 ? won / (won + lost) : null;
};

export interface LeadSourceSummary {
    origin: LeadOrigin;
    label: string;
    count: number;
    open: number;
    won: number;
    lost: number;
    winRate: number | null;
    /** sum of leadBudgetMid of the won leads */
    wonBudget: number;
}

/** Where leads come from, most leads first (origins with no lead left out). */
export const leadSourcesSummary = (leads: readonly Lead[]): LeadSourceSummary[] => {
    const map = new Map<LeadOrigin, LeadSourceSummary>();
    for (const lead of leads) {
        const origin = isLeadOrigin(lead.origin) ? lead.origin : 'other';
        const row = map.get(origin) || { origin, label: ORIGIN_LABELS[origin], count: 0, open: 0, won: 0, lost: 0, winRate: null, wonBudget: 0 };
        row.count++;
        if (lead.stage === 'won') { row.won++; row.wonBudget += leadBudgetMid(lead) ?? 0; }
        else if (lead.stage === 'lost') row.lost++;
        else row.open++;
        map.set(origin, row);
    }
    return [...map.values()]
        .map(r => ({ ...r, winRate: r.won + r.lost > 0 ? r.won / (r.won + r.lost) : null }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

/** Board columns in stage order. Archived leads are left out unless includeArchived. */
export const groupLeadsByStage = (leads: readonly Lead[], opts: { includeArchived?: boolean } = {}): Record<LeadStage, Lead[]> => {
    const out = Object.fromEntries(LEAD_STAGES.map(s => [s, [] as Lead[]])) as Record<LeadStage, Lead[]>;
    for (const lead of leads) {
        if (lead.archived && !opts.includeArchived) continue;
        out[lead.stage]?.push(lead);
    }
    return out;
};

export type LeadSort = 'newest' | 'follow_up' | 'budget' | 'stale';

export const sortLeads = (leads: readonly Lead[], by: LeadSort = 'newest'): Lead[] => {
    const time = (iso: string | null) => (iso ? new Date(iso).getTime() || 0 : 0);
    const list = [...leads];
    switch (by) {
        case 'follow_up':
            return list.sort((a, b) => (a.followUpOn || '9999-99-99').localeCompare(b.followUpOn || '9999-99-99') || time(b.createdAt) - time(a.createdAt));
        case 'budget':
            return list.sort((a, b) => (leadBudgetMid(b) ?? -1) - (leadBudgetMid(a) ?? -1) || time(b.createdAt) - time(a.createdAt));
        case 'stale':
            return list.sort((a, b) => time(lastActivityAt(a)) - time(lastActivityAt(b)));
        default:
            return list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    }
};

export const searchLeads = (leads: readonly Lead[], query: string): Lead[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [...leads];
    const digits = q.replace(/\D/g, '');
    return leads.filter(l =>
        [l.name, l.email, l.address, l.details, l.notes, ORIGIN_LABELS[l.origin]].some(v => String(v || '').toLowerCase().includes(q))
        || (digits.length >= 3 && phoneDigits(l.phone).includes(digits)));
};

// ------------------------------------------------------------------------------------------------ forms
export const EMPTY_LEAD_FORM: LeadFormValues = {
    name: '', phone: '', email: '', address: '', details: '', origin: 'phone', stage: 'new',
    budgetMin: '', budgetMax: '', followUpOn: '', notes: '',
};

export const leadToForm = (lead: Lead): LeadFormValues => ({
    name: lead.name === 'Unnamed' ? '' : lead.name,
    phone: lead.phone,
    email: lead.email,
    address: lead.address,
    details: lead.details,
    origin: lead.origin,
    stage: lead.stage,
    budgetMin: lead.budgetMin === null ? '' : String(lead.budgetMin),
    budgetMax: lead.budgetMax === null ? '' : String(lead.budgetMax),
    followUpOn: lead.followUpOn || '',
    notes: lead.notes,
});

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** '' -> null; "5,000" / "$5000.50" -> number; anything else -> NaN. */
export const parseBudget = (text: string): number | null => {
    const t = String(text ?? '').trim().replace(/[$€£\s]/g, '').replace(/,/g, '');
    if (!t) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
    return Number(t);
};

/** Same contact rules as the public request form; details are optional for a lead added by hand. */
export const validateLeadForm = (v: LeadFormValues): LeadFormErrors => {
    const errors: LeadFormErrors = {};
    const name = v.name.trim();
    const phone = v.phone.trim();
    const email = v.email.trim();
    if (!name) errors.name = 'Please enter a name.';
    else if (name.length > LEAD_LIMITS.name) errors.name = `Please keep the name under ${LEAD_LIMITS.name} characters.`;
    if (!phone && !email) errors.contact = 'Add a phone number or an email address.';
    if (email && (!EMAIL_RE.test(email) || email.length > LEAD_LIMITS.email)) errors.email = 'Please check the email address.';
    if (phone) {
        const digits = phoneDigits(phone).length;
        if (digits < 6 || digits > 20 || phone.length > LEAD_LIMITS.phone) errors.phone = 'Please check the phone number.';
    }
    if (v.details.trim().length > LEAD_LIMITS.details) errors.details = `Please keep this under ${LEAD_LIMITS.details} characters.`;
    if (v.notes.trim().length > LEAD_LIMITS.notes) errors.notes = `Please keep the notes under ${LEAD_LIMITS.notes} characters.`;
    const lo = parseBudget(v.budgetMin);
    const hi = parseBudget(v.budgetMax);
    if (Number.isNaN(lo) || Number.isNaN(hi)) errors.budget = 'Enter the budget as a number, like 5000.';
    else if ((lo ?? 0) > LEAD_LIMITS.budgetMax || (hi ?? 0) > LEAD_LIMITS.budgetMax) errors.budget = 'That budget is too large.';
    else if (lo !== null && hi !== null && lo > hi) errors.budget = 'The lowest budget is above the highest.';
    if (v.followUpOn && !isYmd(v.followUpOn)) errors.followUpOn = 'Please pick a valid date.';
    if (!isLeadOrigin(v.origin)) errors.origin = 'Please pick where the lead came from.';
    if (!isLeadStage(v.stage) || v.stage === 'won') errors.stage = 'Please pick a stage (use Convert to job for a won lead).';
    return errors;
};

export const hasLeadErrors = (e: LeadFormErrors): boolean => Object.values(e).some(Boolean);

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

/** Form -> patch (trimmed; '' -> null). Validate first. Origin is only used on insert (it never changes). */
export const leadFormToPatch = (v: LeadFormValues): LeadPatch & { origin: LeadOrigin } => {
    const lo = parseBudget(v.budgetMin);
    const hi = parseBudget(v.budgetMax);
    return {
        name: v.name.trim(),
        phone: orNull(v.phone),
        email: v.email.trim() ? v.email.trim().toLowerCase() : null,
        address: orNull(v.address),
        details: orNull(v.details),
        origin: v.origin,
        stage: v.stage,
        budgetMin: lo === null || Number.isNaN(lo) ? null : lo,
        budgetMax: hi === null || Number.isNaN(hi) ? null : hi,
        followUpOn: isYmd(v.followUpOn) ? v.followUpOn : null,
        notes: orNull(v.notes),
    };
};

// ------------------------------------------------------------------------------------------------ convert
/** What the existing Convert flow (convert_quote_request) needs: a job name and a start day. */
export const leadToConvertDraft = (lead: Pick<Lead, 'name' | 'details'>, today: string): { jobName: string; startDate: string } => ({
    jobName: jobNameFromRequest({ name: lead.name, details: lead.details }),
    startDate: today,
});

// ------------------------------------------------------------------------------------------------ plan
export interface LeadTools {
    /** list / board, manual add, stages, follow-ups, convert, appointments */
    leads: boolean;
    /** win rate, source summary, budget totals */
    insights: boolean;
    /** stale-lead and follow-up reminders (automation) */
    reminders: boolean;
}

/**
 * Plan gating (roadmap: Free = get paid + look professional; Premium = automation / volume). Keeping track of leads
 * is part of getting paid, and the old request inbox was free, so the lead list stays Free; insights and automatic
 * reminders are Premium.
 */
export const leadToolsForTier = (tier: string | null | undefined): LeadTools => {
    const paid = tier === 'premium' || tier === 'ai';
    return { leads: true, insights: paid, reminders: paid };
};
