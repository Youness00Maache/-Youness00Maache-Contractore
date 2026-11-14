/**
 * Account helpers (owned by CORE): profile mapping, plan usage, plan-limit errors and logout cleanup.
 * The browser NEVER writes billing columns (subscription_*, kelviq_*, ai_credits_*, email_usage).
 */
import { supabase } from './supabase.ts';
import { connectionProblem } from './offline/connection.ts';
import { FREE_LIMITS, PAID_AI_LIMITS, isPaidTier, normalizeTier, type PlanTier } from './plans.ts';
import type { UserProfile } from '../types.ts';

export type ThemeName = 'light' | 'dark' | 'blue';
export const THEME_STORAGE_KEY = 'theme';

export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'paused' | 'none';

/** UserProfile plus billing fields. `subscriptionTier` keeps the legacy 'Basic' | 'Premium' values for older components. */
export interface AppProfile extends UserProfile {
    plan: PlanTier;
    subscriptionStatus: SubscriptionStatus;
    subscriptionPeriodEnd: string | null;
    defaultSignatureUrl?: string;
}

export const SUPPORT_EMAIL: string = (((import.meta as any).env || {}).VITE_SUPPORT_EMAIL as string | undefined) || 'support@contractordocs.app';

/** Columns the app needs. Optional ones are retried without if the database doesn't have them yet. */
const CORE_PROFILE_COLUMNS = 'id, email, name, company_name, logo_url, profile_picture_url, address, phone, website, job_title, subscription_tier, language, email_templates, theme';
const OPTIONAL_PROFILE_COLUMNS = ['subscription_status', 'subscription_period_end', 'default_labor_rate', 'default_signature_url'];
/** "Get paid" settings (migration 20261113000200); loaded in a separate step so a missing one never drops the others. */
const PAYMENT_PROFILE_COLUMNS = ['default_pay_link', 'default_pay_link_label', 'financing_link', 'financing_min_amount', 'google_review_link', 'review_auto_send'];

export const isMissingColumnError = (error: { code?: string; message?: string } | null | undefined) =>
    !!error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(error.message || ''));

export const normalizeTheme = (value: unknown): ThemeName | null =>
    value === 'light' || value === 'dark' || value === 'blue' ? value : null;

export const normalizeStatus = (value: unknown, tier: PlanTier): SubscriptionStatus => {
    const v = String(value || '').toLowerCase();
    if (v === 'active' || v === 'past_due' || v === 'cancelled' || v === 'paused' || v === 'none') return v;
    if (v === 'canceled') return 'cancelled';
    return isPaidTier(tier) ? 'active' : 'none';
};

export const mapProfileRow = (row: any): AppProfile => {
    const plan = normalizeTier(row?.subscription_tier);
    return {
        id: row.id,
        email: row.email || '',
        name: row.name || '',
        companyName: row.company_name || '',
        logoUrl: row.logo_url || '',
        profilePictureUrl: row.profile_picture_url || '',
        address: row.address || '',
        phone: row.phone || '',
        website: row.website || '',
        jobTitle: row.job_title || '',
        subscriptionTier: isPaidTier(plan) ? 'Premium' : 'Basic',
        language: row.language || 'English',
        emailTemplates: row.email_templates || {},
        theme: normalizeTheme(row.theme) || undefined,
        emailUsage: 0,
        defaultLaborRate: row.default_labor_rate != null ? Number(row.default_labor_rate) || undefined : undefined,
        plan,
        subscriptionStatus: normalizeStatus(row.subscription_status, plan),
        subscriptionPeriodEnd: row.subscription_period_end || null,
        defaultSignatureUrl: row.default_signature_url || undefined,
        ...(('default_pay_link' in (row || {}))
            ? {
                payLinkDefault: row.default_pay_link || '',
                payLinkLabel: row.default_pay_link_label || '',
                financingLink: row.financing_link || '',
                financingMinAmount: row.financing_min_amount != null ? Number(row.financing_min_amount) || 0 : 0,
                googleReviewLink: row.google_review_link || '',
                reviewAutoSend: row.review_auto_send === true,
            }
            : {}),
    };
};

/**
 * Loads (or creates) the signed-in user's profile row.
 * Returns null only when the row doesn't exist and could not be created; throws on other errors.
 */
export async function loadProfileRow(user: { id: string; email?: string | null; user_metadata?: any }, preferredTheme: ThemeName): Promise<AppProfile> {
    let columns = [CORE_PROFILE_COLUMNS, ...OPTIONAL_PROFILE_COLUMNS, ...PAYMENT_PROFILE_COLUMNS].join(', ');
    let result = await supabase.from('profiles').select(columns).eq('id', user.id).maybeSingle();
    let paymentColumns = true;
    if (result.error && isMissingColumnError(result.error)) {
        paymentColumns = false;
        columns = [CORE_PROFILE_COLUMNS, ...OPTIONAL_PROFILE_COLUMNS].join(', ');
        result = await supabase.from('profiles').select(columns).eq('id', user.id).maybeSingle();
    }
    if (result.error && isMissingColumnError(result.error)) {
        columns = CORE_PROFILE_COLUMNS;
        result = await supabase.from('profiles').select(columns).eq('id', user.id).maybeSingle();
    }
    if (result.error) throw new Error(result.error.message || 'Could not load your profile.');
    if (result.data) {
        const mapped = mapProfileRow(result.data);
        return paymentColumns ? mapped : { ...mapped, paymentSettingsUnavailable: true };
    }

    // First sign-in: create the row (billing columns are defaulted server-side).
    const metaName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    const insert = await supabase
        .from('profiles')
        .insert({ id: user.id, email: user.email, name: metaName, company_name: '', theme: preferredTheme })
        .select(CORE_PROFILE_COLUMNS)
        .maybeSingle();
    if (insert.error) {
        // Another tab (or a DB trigger) may have created it in the meantime.
        const retry = await supabase.from('profiles').select(CORE_PROFILE_COLUMNS).eq('id', user.id).maybeSingle();
        if (retry.data) return mapProfileRow(retry.data);
        throw new Error(insert.error.message || 'Could not create your profile.');
    }
    return mapProfileRow(insert.data || { id: user.id, email: user.email, name: metaName, theme: preferredTheme });
}

// ---------------------------------------------------------------------------
// Usage & limits
// ---------------------------------------------------------------------------
export interface UsageLimits {
    jobs: number | null;
    clients: number | null;
    docs: number | null;
    emails: number | null;
    ai: number | null;
}

export interface UsageSnapshot {
    tier: PlanTier;
    status: SubscriptionStatus;
    jobsThisMonth: number;
    clientsTotal: number;
    /** Clients created this calendar month (the Free plan limit counts these, like the old app). */
    clientsThisMonth: number;
    emailsThisMonth: number;
    aiThisMonth: number;
    limits: UsageLimits;
    /** true when the numbers came from the server RPC, false when counted locally (display only). */
    fromServer: boolean;
    /** Start of the month the server counts in (ISO), from `get_my_usage().month_start`. */
    monthStart?: string;
}

export const limitsForTier = (tier: PlanTier): UsageLimits => {
    if (tier === 'free') return { ...FREE_LIMITS };
    return { jobs: null, clients: null, docs: null, emails: null, ai: PAID_AI_LIMITS[tier] };
};

const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Calls RPC `get_my_usage()`; returns null if it isn't available. */
export async function fetchUsage(): Promise<UsageSnapshot | null> {
    const { data, error } = await supabase.rpc('get_my_usage');
    if (error || !data) return null;
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const tier = normalizeTier(row.tier);
    const fallbackLimits = limitsForTier(tier);
    const l = row.limits || {};
    return {
        tier,
        status: normalizeStatus(row.status, tier),
        jobsThisMonth: Number(row.jobs_this_month) || 0,
        clientsTotal: Number(row.clients_total) || 0,
        clientsThisMonth: Number(row.clients_this_month ?? row.clients_total) || 0,
        emailsThisMonth: Number(row.emails_this_month) || 0,
        aiThisMonth: Number(row.ai_this_month) || 0,
        limits: {
            jobs: 'jobs' in l ? numOrNull(l.jobs) : fallbackLimits.jobs,
            clients: 'clients' in l ? numOrNull(l.clients) : fallbackLimits.clients,
            docs: 'docs' in l ? numOrNull(l.docs) : ('documents_per_job' in l ? numOrNull(l.documents_per_job) : fallbackLimits.docs),
            emails: 'emails' in l ? numOrNull(l.emails) : fallbackLimits.emails,
            ai: 'ai' in l ? numOrNull(l.ai) : fallbackLimits.ai,
        },
        fromServer: true,
        monthStart: typeof row.month_start === 'string' ? row.month_start : undefined,
    };
}

/**
 * Start of the counting month, like the server's `date_trunc('month', now())`: the later of the month start the
 * server reported and the current UTC month start (so a session that crosses midnight on the 1st moves on).
 */
export const usageMonthStart = (serverMonthStart?: string | null, now = new Date()): string => {
    const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const server = serverMonthStart ? new Date(serverMonthStart) : null;
    return server && !Number.isNaN(server.getTime()) && server.toISOString() > utc ? server.toISOString() : utc;
};

/**
 * Free plan "documents per job": the server counts documents CREATED this month per job (usage_events kind
 * 'document', ref_id = job id), so deleting a document does not give the slot back. These read the same rows
 * (RLS: the user's own events), so the app shows and checks exactly what the database enforces.
 */
export async function fetchJobDocumentCount(jobId: string, monthStart: string): Promise<number | null> {
    const { count, error } = await supabase
        .from('usage_events')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'document')
        .eq('ref_id', jobId)
        .gte('created_at', monthStart);
    return error || count === null ? null : count;
}

/** Documents created this month, per job id (null when usage_events can't be read). */
export async function fetchDocumentUsageByJob(monthStart: string): Promise<Record<string, number> | null> {
    const PAGE = 1000;
    const counts: Record<string, number> = {};
    for (let page = 0; page < 20; page++) {
        const { data, error } = await supabase
            .from('usage_events')
            .select('ref_id')
            .eq('kind', 'document')
            .gte('created_at', monthStart)
            .order('id', { ascending: true })
            .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) return null;
        for (const row of (data || []) as Array<{ ref_id: string | null }>) {
            if (row.ref_id) counts[row.ref_id] = (counts[row.ref_id] || 0) + 1;
        }
        if (!data || data.length < PAGE) break;
    }
    return counts;
}

/** Records one usage event server-side (`record_usage(p_kind)`). Failures are non-fatal. */
export async function recordUsage(kind: 'email' | 'ai', count = 1): Promise<void> {
    for (let i = 0; i < Math.max(1, Math.min(count, 50)); i++) {
        const { error } = await supabase.rpc('record_usage', { p_kind: kind });
        if (error) return;
    }
}

/** DB errors raised by plan-limit triggers start with `PLAN_LIMIT:`. */
export const isPlanLimitError = (error: unknown): boolean => {
    const message = typeof error === 'string' ? error : (error as any)?.message || '';
    return /PLAN_LIMIT/i.test(String(message));
};

/** Human message for a PLAN_LIMIT error (text after the prefix, or a generic sentence). */
export const planLimitMessage = (error: unknown): string => {
    const message = String(typeof error === 'string' ? error : (error as any)?.message || '');
    const rest = message.replace(/^.*?PLAN_LIMIT:?\s*/i, '').trim();
    return rest && !/^[a-z_]+$/i.test(rest) ? rest : 'You have reached a limit of the Free plan.';
};

/** Turns Supabase/JS errors into one readable sentence for toasts. */
export const describeError = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    const e = error as any;
    const msg: string = e.message || e.error_description || e.error || '';
    if (!msg) return fallback;
    // offline: say so plainly (this action needs a connection), instead of a vague network error
    const connection = connectionProblem(msg);
    if (connection) return connection;
    if (/jwt|not authenticated|invalid refresh token/i.test(msg)) return 'Your session expired. Please sign in again.';
    if (/row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that.';
    if (/duplicate key/i.test(msg)) return 'That item already exists.';
    return msg.length > 220 ? `${msg.slice(0, 217)}...` : msg;
};

// ---------------------------------------------------------------------------
// Logout cleanup (CORE-028)
// ---------------------------------------------------------------------------
// User data is in the account (lib/userData.ts), so logout only drops device copies of it:
//  - `cd.cache.*` (account copies) and `cd_job_labor_rate` are wiped; they are downloaded again at login.
//  - `cd.pending.*` (saved here but not uploaded yet, per user id) and the legacy `profit_calcs` list (not uploaded yet)
//    are KEPT: they are the only copy, and lib/userData.ts moves them into the account at the next login.
const USER_LOCAL_STORAGE_KEYS = ['google_provider_token', 'app_view_state', 'active_ai_chat_id', 'cd.gmail.sender', 'cd_pending_plan', 'cd_job_labor_rate'];
const USER_LOCAL_STORAGE_PREFIXES = ['active_ai_chat', 'active_job_ai_chat_', 'cd_draft_', 'contractordocs-draft', 'cd.cache.'];
const USER_SESSION_STORAGE_KEYS = ['daily_report_setup_signature', 'consumed_ai_drafts', 'gmail_oauth_state', 'post_login_redirect', 'cd.gmail.returnTo'];

export function clearUserBrowserStorage(): void {
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) keys.push(k);
        }
        keys.forEach(k => {
            if (USER_LOCAL_STORAGE_KEYS.includes(k) || USER_LOCAL_STORAGE_PREFIXES.some(p => k.startsWith(p))) {
                localStorage.removeItem(k);
            }
        });
    } catch { /* storage unavailable */ }
    try {
        USER_SESSION_STORAGE_KEYS.forEach(k => sessionStorage.removeItem(k));
    } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Post-login redirect (deep links survive the login screen)
// ---------------------------------------------------------------------------
const REDIRECT_KEY = 'post_login_redirect';
const PUBLIC_PREFIXES = ['/auth/', '/login', '/signup', '/update-password'];

export function rememberPostLoginRedirect(pathWithSearch: string): void {
    if (!pathWithSearch || pathWithSearch === '/' || PUBLIC_PREFIXES.some(p => pathWithSearch.startsWith(p))) return;
    try { sessionStorage.setItem(REDIRECT_KEY, pathWithSearch); } catch { /* ignore */ }
}

export function consumePostLoginRedirect(): string | null {
    try {
        const v = sessionStorage.getItem(REDIRECT_KEY);
        sessionStorage.removeItem(REDIRECT_KEY);
        if (v && v.startsWith('/') && !v.startsWith('//')) return v;
    } catch { /* ignore */ }
    return null;
}
