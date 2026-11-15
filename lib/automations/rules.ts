/**
 * Automation rules (roadmap N12, competitor gap #42): the short list of predefined rules behind Settings > Automations.
 *
 * Principles (owner): features connect to existing workflows; an automatic action never changes things silently: it
 * makes a DRAFT or a notification and tells the user; advanced tools are optional and live in Settings; Free = get paid
 * and look professional, Premium = automation (a rule that CREATES a document needs Premium; a rule that only tells you
 * stays free).
 *
 * Two kinds of row on the page:
 *   - NEW rules (RULES below): evaluated client-side (lib/automations/evaluate.ts), their choices live in the account
 *     (public.user_settings 'automations.prefs', shape + migration of missing keys here, no new table).
 *   - EXISTING behaviours (BOUND_ROWS): a switch bound to the setting the app already has (a bell category in
 *     'notifications.prefs', or a reminder kind in public.reminder_settings). Nothing about their defaults changes.
 *   - ALWAYS_ON: core behaviours with no setting (stock moves), listed as plain text.
 *
 * PURE (no React, no Supabase): scripts/automations-check.ts runs it.
 */
import type { NotificationCategory } from '../notifications/model.ts';

// =====================================================================================================================
// Rules
// =====================================================================================================================
export type RuleId =
    | 'estimate_approved_invoice' | 'estimate_waiting'
    | 'task_overdue' | 'job_completed_warranty'
    | 'lead_followup' | 'client_reply';

/** "notify" = tell me; "draft" = make the draft for me (and tell me). Only a Premium plan may use "draft". */
export type RuleMode = 'notify' | 'draft';

/** The optional tool a rule depends on: while it is not 'ready' (not in the database yet) the rule is silent and hidden. */
export type RuleTool = 'tasks' | 'leads' | 'questions' | null;

export type RuleGroup = 'money' | 'jobs' | 'leads' | 'stock';

export const GROUPS: ReadonlyArray<{ id: RuleGroup; label: string }> = [
    { id: 'money', label: 'Money' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'leads', label: 'Leads & clients' },
    { id: 'stock', label: 'Stock & supplies' },
];

export interface RuleDef {
    id: RuleId;
    group: RuleGroup;
    title: string;
    /** the trigger, as a sentence start ("When a client approves an estimate,") */
    when: string;
    /** what happens, by mode (one line each) */
    then: Readonly<Record<RuleMode, string>>;
    defaultOn: boolean;
    defaultMode: RuleMode;
    /** modes the user may choose between (one entry = no choice) */
    modes: readonly RuleMode[];
    tool: RuleTool;
    /** the "N days" choices of a waiting rule */
    dayChoices?: readonly number[];
    defaultDays?: number;
}

const one = (s: string): Readonly<Record<RuleMode, string>> => ({ notify: s, draft: s });

export const RULES: readonly RuleDef[] = [
    {
        id: 'estimate_approved_invoice', group: 'money', title: 'Estimate approved, invoice next',
        when: 'When a client approves an estimate,',
        then: { notify: 'tell me it is ready to invoice.', draft: 'make the invoice draft for me.' },
        defaultOn: true, defaultMode: 'notify', modes: ['notify', 'draft'], tool: null,
    },
    {
        id: 'estimate_waiting', group: 'money', title: 'Estimate with no answer',
        when: 'When a sent estimate has had no answer for',
        then: one('tell me, so I can call.'),
        defaultOn: false, defaultMode: 'notify', modes: ['notify'], tool: null, dayChoices: [3, 7, 14], defaultDays: 7,
    },
    {
        id: 'task_overdue', group: 'jobs', title: 'Overdue tasks',
        when: 'When a job task passes its due date,',
        then: one('tell me, once a day until it is done.'),
        defaultOn: true, defaultMode: 'notify', modes: ['notify'], tool: 'tasks',
    },
    {
        id: 'job_completed_warranty', group: 'jobs', title: 'Job completed, warranty next',
        when: 'When I mark a job completed,',
        then: { notify: 'remind me about the warranty.', draft: 'make the warranty draft for me.' },
        defaultOn: true, defaultMode: 'notify', modes: ['notify', 'draft'], tool: null,
    },
    {
        id: 'lead_followup', group: 'leads', title: 'Lead follow-ups',
        when: 'When a lead’s follow-up day comes or is missed,',
        then: one('tell me.'),
        defaultOn: true, defaultMode: 'notify', modes: ['notify'], tool: 'leads',
    },
    {
        id: 'client_reply', group: 'leads', title: 'Client answers',
        when: 'When a client answers a question or approves or rejects a submittal,',
        then: one('tell me.'),
        defaultOn: true, defaultMode: 'notify', modes: ['notify'], tool: 'questions',
    },
];

export const RULE_IDS: readonly RuleId[] = RULES.map(r => r.id);
export const ruleDef = (id: RuleId): RuleDef => RULES.find(r => r.id === id) as RuleDef;
export const isRuleId = (v: unknown): v is RuleId => typeof v === 'string' && (RULE_IDS as readonly string[]).includes(v);

/** The plan a "do it for me" choice needs. Free keeps every "just tell me" rule. */
export const DRAFT_TIER_LABEL = 'Premium';
export const isPaid = (tier: string | null | undefined): boolean => tier === 'premium' || tier === 'ai';

// =====================================================================================================================
// Existing behaviours with their own setting (shown as switches bound to that setting) and always-on behaviours
// =====================================================================================================================
export type Binding =
    | { type: 'bell'; category: NotificationCategory }
    | { type: 'reminder'; kind: 'invoice' | 'estimate' | 'visit' };

export interface BoundRow {
    id: string;
    group: RuleGroup;
    title: string;
    when: string;
    then: string;
    binding: Binding;
}

export const BOUND_ROWS: readonly BoundRow[] = [
    // Money
    { id: 'invoice_reminders', group: 'money', title: 'Unpaid invoice reminders', when: 'When an invoice is not paid by its due date,', then: 'email the client from my Gmail, on my schedule.', binding: { type: 'reminder', kind: 'invoice' } },
    { id: 'estimate_followups', group: 'money', title: 'Estimate follow-up emails', when: 'When a sent estimate is still open,', then: 'email the client a nudge, on my schedule.', binding: { type: 'reminder', kind: 'estimate' } },
    { id: 'overdue_alert', group: 'money', title: 'Overdue invoices', when: 'When a sent invoice passes its due date,', then: 'tell me.', binding: { type: 'bell', category: 'overdue' } },
    { id: 'expiring_alert', group: 'money', title: 'Estimates about to expire', when: 'When a sent estimate expires within 3 days,', then: 'tell me.', binding: { type: 'bell', category: 'expiring' } },
    { id: 'signed_alert', group: 'money', title: 'Signatures and declines', when: 'When a client signs, approves or declines a document,', then: 'tell me.', binding: { type: 'bell', category: 'clients' } },
    { id: 'payment_alert', group: 'money', title: 'Client says they paid', when: 'When a client taps “I’ve paid” on an invoice,', then: 'tell me.', binding: { type: 'bell', category: 'payments' } },
    // Jobs
    { id: 'visit_reminders', group: 'jobs', title: 'Visit reminders', when: 'The day before a job starts,', then: 'email the client a reminder.', binding: { type: 'reminder', kind: 'visit' } },
    { id: 'service_alert', group: 'jobs', title: 'Service plan visits', when: 'When a service plan visit is due in the next 2 days,', then: 'tell me.', binding: { type: 'bell', category: 'service' } },
    { id: 'papers_alert', group: 'jobs', title: 'Papers about to expire', when: 'When insurance, a license or a permit nears its end date,', then: 'tell me.', binding: { type: 'bell', category: 'papers' } },
    { id: 'crew_alert', group: 'jobs', title: 'Missed clock-outs', when: 'When a worker is still clocked in at the end of the day,', then: 'tell me.', binding: { type: 'bell', category: 'crew' } },
    // Leads & clients
    { id: 'request_alert', group: 'leads', title: 'New quote requests', when: 'When someone sends your request-a-quote form,', then: 'tell me.', binding: { type: 'bell', category: 'requests' } },
    // Stock & supplies
    { id: 'stock_alert', group: 'stock', title: 'Low stock', when: 'When an item reaches its low-stock level or runs out,', then: 'tell me.', binding: { type: 'bell', category: 'stock' } },
    { id: 'orders_alert', group: 'stock', title: 'Purchase order updates', when: 'When a supplier confirms or cannot fill an order, or an order is received,', then: 'tell me.', binding: { type: 'bell', category: 'orders' } },
];

/** Core behaviours with no switch (listed as plain text, "Always on"). */
export const ALWAYS_ON: ReadonlyArray<{ id: string; group: RuleGroup; text: string }> = [
    { id: 'po_received_stock', group: 'stock', text: 'Receiving a purchase order adds its items to your stock.' },
    { id: 'documents_move_stock', group: 'stock', text: 'Stock moves by itself when an invoice is paid, an estimate or change order is accepted, or a material log is saved with “deduct from inventory” on.' },
];

// =====================================================================================================================
// Settings (user_settings 'automations.prefs'): only what the user changed is saved; a missing key = the default
// =====================================================================================================================
export const AUTOMATION_PREFS_SETTING = 'automations.prefs';
export const AUTOMATION_SEEN_SETTING = 'automations.seen';
export const AUTOMATION_DONE_SETTING = 'automations.done';

export interface RuleSetting {
    on?: boolean;
    mode?: RuleMode;
    /** estimate_waiting: 3 / 7 / 14 */
    days?: number;
    /**
     * Epoch ms of the moment "do it for me" was chosen. A draft is made only for events AFTER it, so switching it on
     * never creates documents for things that already happened.
     */
    since?: number;
}

export interface AutomationPrefs {
    v: 1;
    /** when the user last changed anything (epoch ms): the newest copy wins between devices */
    at: number;
    rules: Partial<Record<RuleId, RuleSetting>>;
}

export const defaultAutomationPrefs = (): AutomationPrefs => ({ v: 1, at: 0, rules: {} });

const validNumber = (v: unknown, min: number, max: number): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;

/**
 * Account / device value -> prefs. Anything odd is dropped, a missing rule or key keeps its default (so a new rule
 * added later is simply on or off as its default says), unknown rules are ignored. Never throws.
 */
export const parseAutomationPrefs = (raw: unknown): AutomationPrefs => {
    let v: unknown = raw;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return defaultAutomationPrefs();
    const r = v as Record<string, unknown>;
    const rules: Partial<Record<RuleId, RuleSetting>> = {};
    if (r.rules && typeof r.rules === 'object' && !Array.isArray(r.rules)) {
        for (const [id, value] of Object.entries(r.rules as Record<string, unknown>)) {
            if (!isRuleId(id) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
            const def = ruleDef(id);
            const s = value as Record<string, unknown>;
            const out: RuleSetting = {};
            if (typeof s.on === 'boolean') out.on = s.on;
            if (s.mode === 'notify' || s.mode === 'draft') { if (def.modes.includes(s.mode)) out.mode = s.mode; }
            const days = validNumber(s.days, 1, 90);
            if (days !== undefined && def.dayChoices?.includes(days)) out.days = days;
            const since = validNumber(s.since, 1, 1e14);
            if (since !== undefined) out.since = Math.floor(since);
            if (Object.keys(out).length) rules[id] = out;
        }
    }
    return { v: 1, at: validNumber(r.at, 1, 1e14) ?? 0, rules };
};

export interface ResolvedRule {
    id: RuleId;
    on: boolean;
    /** the choice the user made (or the default) */
    chosenMode: RuleMode;
    /** what actually happens: "draft" only for a paid plan with a valid `since` */
    mode: RuleMode;
    days: number;
    /** epoch ms; Infinity when "draft" was chosen without a start time (nothing is made automatically) */
    since: number;
}

/** A rule's effective settings: defaults filled in, "draft" held back on the Free plan. */
export const resolveRule = (id: RuleId, prefs: AutomationPrefs, tier: string | null | undefined): ResolvedRule => {
    const def = ruleDef(id);
    const s = prefs.rules[id] || {};
    const chosenMode: RuleMode = s.mode && def.modes.includes(s.mode) ? s.mode : def.defaultMode;
    const since = typeof s.since === 'number' ? s.since : Infinity;
    return {
        id,
        on: s.on ?? def.defaultOn,
        chosenMode,
        mode: chosenMode === 'draft' && isPaid(tier) && Number.isFinite(since) ? 'draft' : 'notify',
        days: s.days ?? def.defaultDays ?? 0,
        since,
    };
};

export const resolveAll = (prefs: AutomationPrefs, tier: string | null | undefined): Record<RuleId, ResolvedRule> =>
    Object.fromEntries(RULE_IDS.map(id => [id, resolveRule(id, prefs, tier)])) as Record<RuleId, ResolvedRule>;

const touch = (prefs: AutomationPrefs, id: RuleId, patch: RuleSetting, now: number): AutomationPrefs => ({
    v: 1,
    at: Math.max(now, prefs.at + 1),
    rules: { ...prefs.rules, [id]: { ...(prefs.rules[id] || {}), ...patch } },
});

export const setRuleOn = (prefs: AutomationPrefs, id: RuleId, on: boolean, now: number): AutomationPrefs => touch(prefs, id, { on }, now);

/**
 * Chooses what a rule does. Choosing "draft" records `since` = now (only later events are acted on); choosing "notify"
 * forgets it. A mode the rule doesn't offer is ignored.
 */
export const setRuleMode = (prefs: AutomationPrefs, id: RuleId, mode: RuleMode, now: number): AutomationPrefs => {
    if (!ruleDef(id).modes.includes(mode)) return prefs;
    const current = resolveRule(id, prefs, 'premium');
    if (current.chosenMode === mode && (mode !== 'draft' || Number.isFinite(current.since))) return prefs;
    const next = touch(prefs, id, { mode }, now);
    const setting = { ...(next.rules[id] || {}) };
    if (mode === 'draft') setting.since = Math.max(now, 1);
    else delete setting.since;
    return { ...next, rules: { ...next.rules, [id]: setting } };
};

export const setRuleDays = (prefs: AutomationPrefs, id: RuleId, days: number, now: number): AutomationPrefs =>
    ruleDef(id).dayChoices?.includes(days) ? touch(prefs, id, { days }, now) : prefs;

/** The newer of two copies (device vs account). */
export const newerAutomationPrefs = (a: AutomationPrefs, b: AutomationPrefs): AutomationPrefs => (b.at > a.at ? b : a);

export const sameAutomationPrefs = (a: AutomationPrefs, b: AutomationPrefs): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Rules shown / evaluated for the tools that are ready (a rule whose tool is missing or unknown is hidden and silent). */
export const ruleAvailable = (def: RuleDef, tools: Readonly<Record<'tasks' | 'leads' | 'questions', string>>): boolean =>
    def.tool === null || tools[def.tool] === 'ready';
