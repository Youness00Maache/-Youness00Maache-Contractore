/**
 * Automatic reminders (app side): settings, per-document / client / job switches, the reminder log and the
 * "upcoming" plan. The plan is computed with the SAME code the server uses
 * (supabase/functions/reminders/shared/*), so the dates shown here are the dates the reminders go out.
 *
 * Every call throws RemindersUnavailableError while migration 20261113000300_reminders.sql is not applied,
 * so the components can hide themselves or say so.
 */
import { supabase } from './supabase.ts';
import { offlineEntityQueueFor, pendingEntityItems } from './offline/offlineEntities.ts';
import { fetchUsage, type UsageSnapshot } from './account.ts';
import { isPaidTier } from './plans.ts';
import {
    addDays, DEFAULT_TIMEZONE, eligibility, planTarget, safeTimezone, settingsFromRow, settingsToRow, zonedNow,
    type RecordedReminder, type ReminderKind, type ReminderSettings, type ReminderSettingsRow, type StepView, type TargetPlan,
} from '../supabase/functions/reminders/shared/schedule.ts';
import {
    CLIENT_SELECT, DOC_SELECT, docNumber, factsFromDoc, factsFromJob, indexOverrides, JOB_SELECT, OVERRIDE_SELECT, overridesFor,
    RECEIPT_SELECT, receiptsTotalFor, recipientOf, RECORD_SELECT, recordFromRow, resolveClient, STATE_SELECT,
    type ClientRow, type DocRow, type JobRow, type OverrideRow, type ReceiptRow, type RecordRow,
} from '../supabase/functions/reminders/shared/targets.ts';
import { formatMoney } from '../supabase/functions/reminders/shared/money.ts';

export * from '../supabase/functions/reminders/shared/schedule.ts';
export {
    DEFAULT_TEMPLATES, PLACEHOLDER_HELP, TEMPLATE_PLACEHOLDERS, TEMPLATE_TITLES, buildValues, formatLongDate, formatShortDate,
    renderReminder, resolveTemplate, type PlaceholderName,
} from '../supabase/functions/reminders/shared/messages.ts';
export { formatMoney } from '../supabase/functions/reminders/shared/money.ts';
export type { ClientRow, DocRow, JobRow, RecordRow } from '../supabase/functions/reminders/shared/targets.ts';

/* ------------------------------------------------------------------------------------ errors */

export class RemindersUnavailableError extends Error {
    constructor() {
        super('Automatic reminders are not available yet.');
        this.name = 'RemindersUnavailableError';
    }
}

type PgError = { code?: string; message?: string; details?: string } | null | undefined;

/** Table / function of the reminders migration not there yet. */
export const isNotMigratedError = (err: PgError): boolean =>
    !!err && (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(String(err.code || ''))
        || /does not exist|could not find the (table|function)|schema cache/i.test(`${err.message || ''} ${err.details || ''}`));

const fail = (err: PgError, what: string): never => {
    if (isNotMigratedError(err)) throw new RemindersUnavailableError();
    throw new Error(`${what}: ${err?.message || 'unknown error'}`);
};

/* ------------------------------------------------------------------------------------ basics */

export interface GmailSender {
    id: string;
    gmail_address: string;
    display_name: string | null;
    is_default: boolean;
    needs_reconnect: boolean;
}

export interface ReminderBasics {
    userId: string;
    settings: ReminderSettings;
    /** the user has saved settings (else defaults are in use) */
    saved: boolean;
    launchedAt: string | null;
    senders: GmailSender[];
    /** account reminders go out from (null = Gmail not connected) */
    sender: GmailSender | null;
    usage: UsageSnapshot | null;
    paid: boolean;
}

export const browserTimezone = (): string => {
    try {
        return safeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE);
    } catch {
        return DEFAULT_TIMEZONE;
    }
};

let basicsCache: { at: number; value: ReminderBasics } | null = null;
let basicsInflight: Promise<ReminderBasics> | null = null;
const BASICS_TTL_MS = 60_000;

export const invalidateReminderBasics = () => { basicsCache = null; };

const pickSender = (senders: GmailSender[], accountId: string | null): GmailSender | null =>
    senders.find((s) => s.id === accountId) ?? senders.find((s) => s.is_default) ?? senders[0] ?? null;

async function currentUserId(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new Error('Please sign in again.');
    return id;
}

export async function loadReminderBasics(force = false): Promise<ReminderBasics> {
    if (!force && basicsCache && Date.now() - basicsCache.at < BASICS_TTL_MS) return basicsCache.value;
    if (!force && basicsInflight) return basicsInflight;
    basicsInflight = (async () => {
        const userId = await currentUserId();
        const [settingsRes, configRes, sendersRes, usage] = await Promise.all([
            supabase.from('reminder_settings').select('*').eq('user_id', userId).maybeSingle(),
            supabase.rpc('reminders_config'),
            supabase.from('user_gmail_accounts').select('id, gmail_address, display_name, is_default, status').order('created_at', { ascending: true }),
            fetchUsage().catch(() => null),
        ]);
        if (settingsRes.error) fail(settingsRes.error, 'Could not load reminder settings');
        if (configRes.error) fail(configRes.error, 'Could not load reminder settings');
        const row = (settingsRes.data as ReminderSettingsRow | null) ?? null;
        // settings saved offline that haven't synced yet win (they are the newest)
        const settings = pendingReminderSettings() ?? settingsFromRow(row);
        const senders: GmailSender[] = ((sendersRes.data as any[] | null) ?? []).map((a) => ({
            id: a.id, gmail_address: a.gmail_address, display_name: a.display_name ?? null, is_default: !!a.is_default,
            needs_reconnect: a.status === 'needs_reconnect',
        }));
        const value: ReminderBasics = {
            userId,
            settings,
            saved: !!row,
            launchedAt: ((configRes.data as { launched_at?: string } | null)?.launched_at) ?? null,
            senders,
            sender: pickSender(senders, settings.accountId),
            usage,
            paid: usage ? isPaidTier(usage.tier) : false,
        };
        basicsCache = { at: Date.now(), value };
        return value;
    })();
    try {
        return await basicsInflight;
    } finally {
        basicsInflight = null;
    }
}

/** Outbox id of reminder settings saved offline (one per user). */
export const reminderSettingsOutboxId = (userId: string) => `reminders:${userId}`;

/** Reminder settings saved offline and not synced yet (null: none). */
export const pendingReminderSettings = (): ReminderSettings | null => {
    const item = pendingEntityItems('reminder_settings')[0];
    return item ? settingsFromRow(item.data as unknown as ReminderSettingsRow) : null;
};

/** Fired after the reminder settings were saved: Settings shows them in two places (Reminders and Automations) and both re-read. */
export const REMINDER_SETTINGS_CHANGED = 'cd:reminder-settings-changed';
const announceReminderSettings = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(REMINDER_SETTINGS_CHANGED));
};

export async function saveReminderSettings(settings: ReminderSettings): Promise<ReminderSettings> {
    const userId = await currentUserId();
    // offline (or settings saved offline still waiting): kept on this device, saved to the account when back online
    const outbox = offlineEntityQueueFor(reminderSettingsOutboxId(userId));
    if (outbox) {
        await outbox.queue('reminder_settings', 'edit', reminderSettingsOutboxId(userId), { user_id: userId, ...settingsToRow(settings) });
        if (basicsCache && basicsCache.value.userId === userId) basicsCache = { ...basicsCache, value: { ...basicsCache.value, settings, saved: true } };
        announceReminderSettings();
        return settings;
    }
    const { data, error } = await supabase
        .from('reminder_settings')
        .upsert({ user_id: userId, ...settingsToRow(settings) }, { onConflict: 'user_id' })
        .select('*')
        .single();
    if (error) fail(error, 'Could not save reminder settings');
    invalidateReminderBasics();
    announceReminderSettings();
    return settingsFromRow(data as ReminderSettingsRow);
}

/* --------------------------------------------------------------------------------- switches */

export type OverrideTarget = { documentId: string } | { clientId: string } | { jobId: string };

const targetColumn = (t: OverrideTarget): ['document_id' | 'client_id' | 'job_id', string] =>
    'documentId' in t ? ['document_id', t.documentId] : 'clientId' in t ? ['client_id', t.clientId] : ['job_id', t.jobId];

/** Switch reminders on/off for one document, client or job; `null` removes the switch (back to the settings). */
export async function setReminderOverride(target: OverrideTarget, enabled: boolean | null): Promise<OverrideRow | null> {
    const userId = await currentUserId();
    const [column, id] = targetColumn(target);
    if (enabled === null) {
        const { error } = await supabase.from('reminder_overrides').delete().eq('user_id', userId).eq(column, id);
        if (error) fail(error, 'Could not change reminders');
        return null;
    }
    const { data, error } = await supabase
        .from('reminder_overrides')
        .upsert({ user_id: userId, [column]: id, enabled }, { onConflict: `user_id,${column}` })
        .select(OVERRIDE_SELECT)
        .single();
    if (error) fail(error, 'Could not change reminders');
    return data as OverrideRow;
}

export async function skipReminder(kind: ReminderKind, targetId: string, stepKey: string, scheduledFor: string): Promise<string> {
    const { data, error } = await supabase.rpc('skip_reminder', { p_kind: kind, p_target_id: targetId, p_step_key: stepKey, p_scheduled_for: scheduledFor });
    if (error) fail(error, 'Could not skip this reminder');
    return String(data ?? '');
}

export async function unskipReminder(id: string): Promise<void> {
    const { error } = await supabase.rpc('unskip_reminder', { p_id: id });
    if (error) fail(error, 'Could not undo');
}

/* ----------------------------------------------------------------------- one document (form) */

/** What the database knows about one document (loaded once; the plan is recomputed from the live form). */
export interface DocumentReminderContext {
    basics: ReminderBasics;
    /** the document exists in the database (switches need a saved document) */
    saved: boolean;
    meta: Partial<DocRow>;
    records: RecordRow[];
    sentAt: string | null;
    receipts: ReceiptRow[];
    client: ClientRow | null;
    documentOverride: OverrideRow | null;
    clientOverride: OverrideRow | null;
}

export interface DocumentReminderPlan {
    plan: TargetPlan;
    recipient: string | null;
    /** reminders would be on for this document without its own switch (settings / client / launch date) */
    defaultOn: boolean;
    /** balance due (invoice) or total (estimate) */
    amount: number;
}

/** Form data (camelCase) -> the row shape the planner reads. */
export function docRowFromForm(type: 'Invoice' | 'Estimate', id: string, data: Record<string, any>, meta: Partial<DocRow> = {}): DocRow {
    return {
        id,
        type,
        job_id: meta.job_id ?? null,
        client_id: meta.client_id ?? (data.clientId || null),
        created_at: meta.created_at ?? null,
        public_token: meta.public_token ?? null,
        approval_expires_at: meta.approval_expires_at ?? null,
        approval_used_at: meta.approval_used_at ?? null,
        has_client_signature: meta.has_client_signature ?? !!data.clientSignatureUrl,
        status: data.status ?? null,
        dueDate: data.dueDate ?? null,
        issueDate: data.issueDate ?? null,
        expiryDate: data.expiryDate ?? null,
        invoiceNumber: data.invoiceNumber ?? null,
        estimateNumber: data.estimateNumber ?? null,
        title: data.title ?? null,
        clientName: data.clientName ?? null,
        clientEmail: data.clientEmail ?? null,
        currency: data.currency ?? null,
        paypalLink: data.paypalLink ?? null,
        clientSignedAt: data.clientSignedAt ?? null,
        clientDeclinedAt: data.clientDeclinedAt ?? null,
        paymentReportedAt: data.paymentReportedAt ?? null,
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
        taxRate: data.taxRate,
        discount: data.discount,
        shipping: data.shipping,
        isProgressBilling: data.isProgressBilling,
        amountPaid: data.amountPaid,
        payments: Array.isArray(data.payments) ? data.payments : null,
    };
}

const toRecords = (rows: RecordRow[]): RecordedReminder[] => rows.map(recordFromRow);

/** Loads what the document panel needs from the database (one document, its client and their switches). */
export async function loadDocumentReminderContext(
    type: 'Invoice' | 'Estimate',
    documentId: string | null | undefined,
    opts: { clientId?: string | null; clientName?: string | null } = {},
): Promise<DocumentReminderContext> {
    const basics = await loadReminderBasics();
    let meta: Partial<DocRow> = {};
    let saved = false;
    let records: RecordRow[] = [];
    let sentAt: string | null = null;
    let receipts: ReceiptRow[] = [];
    let overrides: OverrideRow[] = [];
    if (documentId) {
        const [docRes, recRes, stateRes, ovRes, rcptRes] = await Promise.all([
            supabase.from('documents').select('id, job_id, client_id, created_at, public_token, approval_expires_at, approval_used_at, has_client_signature').eq('id', documentId).maybeSingle(),
            supabase.from('reminders').select(RECORD_SELECT).eq('document_id', documentId).order('created_at', { ascending: true }),
            supabase.from('reminder_document_state').select(STATE_SELECT).eq('document_id', documentId).maybeSingle(),
            supabase.from('reminder_overrides').select(OVERRIDE_SELECT).eq('document_id', documentId),
            type === 'Invoice'
                ? supabase.from('documents').select(RECEIPT_SELECT).eq('type', 'Receipt').eq('data->>invoiceId', documentId)
                : Promise.resolve({ data: [], error: null }),
        ]);
        for (const r of [recRes, stateRes, ovRes]) if (r.error) fail(r.error, 'Could not load reminders');
        if (docRes.data) {
            meta = docRes.data as Partial<DocRow>;
            saved = true;
        }
        records = (recRes.data as RecordRow[] | null) ?? [];
        sentAt = ((stateRes.data as { sent_at?: string } | null)?.sent_at) ?? null;
        overrides = (ovRes.data as OverrideRow[] | null) ?? [];
        receipts = ((rcptRes as { data: unknown }).data as ReceiptRow[] | null) ?? [];
    }
    const clientId = meta.client_id || opts.clientId || null;
    let client: ClientRow | null = null;
    if (clientId) {
        const { data: c } = await supabase.from('clients').select(CLIENT_SELECT).eq('id', clientId).maybeSingle();
        client = (c as ClientRow | null) ?? null;
    }
    const name = String(opts.clientName || '').trim();
    if (!client && name) {
        const { data: list } = await supabase.from('clients').select(CLIENT_SELECT).eq('name', name).limit(1);
        client = ((list as ClientRow[] | null) ?? [])[0] ?? null;
    }
    let clientOverride: OverrideRow | null = null;
    if (client) {
        const { data: co, error } = await supabase.from('reminder_overrides').select(OVERRIDE_SELECT).eq('client_id', client.id).maybeSingle();
        if (error) fail(error, 'Could not load reminders');
        clientOverride = (co as OverrideRow | null) ?? null;
    }
    return {
        basics, saved, meta, records, sentAt, receipts, client,
        documentOverride: overrides.find((o) => o.document_id === documentId) ?? null,
        clientOverride,
    };
}

/** The plan of one document from its live form data (pure; recomputed on every change). */
export function planDocumentReminders(
    type: 'Invoice' | 'Estimate',
    documentId: string | null | undefined,
    data: Record<string, any>,
    ctx: DocumentReminderContext,
    now: Date = new Date(),
): DocumentReminderPlan {
    const id = ctx.saved && documentId ? documentId : 'new';
    const row = docRowFromForm(type, id, data, ctx.meta);
    const facts = factsFromDoc(row, { sentAt: ctx.sentAt, receiptsTotal: type === 'Invoice' ? receiptsTotalFor(row, ctx.receipts) : 0 });
    // a document that is not saved yet counts as created now (new documents follow the settings)
    if (!ctx.saved) facts.createdAt = now.toISOString();
    const { settings, launchedAt } = ctx.basics;
    const clientFlag = ctx.clientOverride ? { enabled: !!ctx.clientOverride.enabled, updatedAt: ctx.clientOverride.updated_at ?? null } : null;
    const docFlag = ctx.saved && ctx.documentOverride ? { enabled: !!ctx.documentOverride.enabled, updatedAt: ctx.documentOverride.updated_at ?? null } : null;
    const plan = planTarget({
        facts, settings, overrides: { document: docFlag, client: clientFlag }, launchedAt, recorded: toRecords(ctx.records), now,
    });
    return {
        plan,
        recipient: recipientOf(ctx.client?.email, row.clientEmail),
        defaultOn: eligibility(facts, settings, { client: clientFlag }, launchedAt, safeTimezone(settings.timezone)).on,
        amount: facts.amount,
    };
}

/* -------------------------------------------------------------------------- overview (lists) */

export interface UpcomingReminder {
    kind: ReminderKind;
    targetId: string;
    documentId: string | null;
    jobId: string | null;
    /** "Invoice INV-1042" / "Estimate E-12" / job name */
    label: string;
    clientName: string;
    recipient: string | null;
    amountText: string;
    step: StepView;
    plan: TargetPlan;
}

export interface ReminderLogItem extends RecordRow {
    label: string;
    clientName: string;
    jobIdForLink: string | null;
}

export interface ReminderOverview {
    basics: ReminderBasics;
    upcoming: UpcomingReminder[];
    log: ReminderLogItem[];
    /** skipped (not by the user) or failed in the last 30 days */
    attention: ReminderLogItem[];
}

const UPCOMING_DAYS = 14;

const docLabel = (row: Pick<DocRow, 'type' | 'invoiceNumber' | 'estimateNumber' | 'title'>) => {
    const num = docNumber(row);
    return num ? `${row.type} ${num}` : row.title || row.type;
};

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown; error: PgError }>): Promise<T[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    const out: T[] = [];
    for (let i = 0; i < unique.length; i += 80) {
        const { data, error } = await run(unique.slice(i, i + 80));
        if (error) fail(error, 'Could not load reminders');
        out.push(...(((data as T[] | null) ?? [])));
    }
    return out;
}

/** Upcoming reminders (next 14 days) and the recent log, for the Communication screen. */
export async function loadReminderOverview(now: Date = new Date()): Promise<ReminderOverview> {
    const basics = await loadReminderBasics();
    const { settings } = basics;
    const today = zonedNow(now, settings.timezone).ymd;
    const since = new Date(now.getTime() - 120 * 86_400_000).toISOString();

    const [invRes, estRes, ovRes, logRes] = await Promise.all([
        supabase.from('documents').select(DOC_SELECT).eq('type', 'Invoice').in('data->>status', ['Sent', 'Overdue']).order('created_at', { ascending: false }).limit(400),
        supabase.from('documents').select(DOC_SELECT).eq('type', 'Estimate').eq('data->>status', 'Sent').order('created_at', { ascending: false }).limit(300),
        supabase.from('reminder_overrides').select(OVERRIDE_SELECT),
        supabase.from('reminders').select(RECORD_SELECT).gte('created_at', since).order('created_at', { ascending: false }).limit(400),
    ]);
    for (const r of [invRes, estRes, ovRes, logRes]) if (r.error) fail(r.error, 'Could not load reminders');
    const docs = [...((invRes.data as unknown as DocRow[] | null) ?? []), ...((estRes.data as unknown as DocRow[] | null) ?? [])];
    const overrides = (ovRes.data as OverrideRow[] | null) ?? [];
    const idx = indexOverrides(overrides);
    const records = (logRes.data as RecordRow[] | null) ?? [];

    const jobOverrideIds = overrides.filter((o) => o.job_id && o.enabled).map((o) => o.job_id as string);
    const wantVisits = settings.visit.enabled || jobOverrideIds.length > 0;
    const visitJobs: JobRow[] = wantVisits
        ? (((await supabase.from('jobs').select(JOB_SELECT).eq('status', 'active').gte('start_date', today).lte('start_date', addDays(today, UPCOMING_DAYS + 14)).limit(300)).data as JobRow[] | null) ?? [])
        : [];

    const logDocIds = records.map((r) => r.document_id).filter((x): x is string => !!x && !docs.some((d) => d.id === x));
    const [docJobs, logDocs, states, receiptsById] = await Promise.all([
        inChunks<JobRow>([...docs.map((d) => d.job_id || ''), ...records.map((r) => r.job_id || '')], (ids) => supabase.from('jobs').select(JOB_SELECT).in('id', ids)),
        inChunks<DocRow>(logDocIds, (ids) => supabase.from('documents').select('id, type, job_id, client_id, invoiceNumber:data->>invoiceNumber, estimateNumber:data->>estimateNumber, title:data->>title, clientName:data->>clientName').in('id', ids)),
        inChunks<{ document_id: string; sent_at: string }>(docs.map((d) => d.id), (ids) => supabase.from('reminder_document_state').select(STATE_SELECT).in('document_id', ids)),
        inChunks<ReceiptRow>(docs.filter((d) => d.type === 'Invoice').map((d) => d.id), (ids) => supabase.from('documents').select(RECEIPT_SELECT).eq('type', 'Receipt').in('data->>invoiceId', ids)),
    ]);
    const jobsById = new Map<string, JobRow>([...docJobs, ...visitJobs].map((j) => [j.id, j]));
    const clientIds = [...docs.map((d) => d.client_id || ''), ...[...jobsById.values()].map((j) => j.client_id || ''), ...records.map((r) => r.client_id || '')];
    const clients = await inChunks<ClientRow>(clientIds, (ids) => supabase.from('clients').select(CLIENT_SELECT).in('id', ids));
    const legacyNames = [...new Set([
        ...docs.filter((d) => !d.client_id && !(d.job_id && jobsById.get(d.job_id)?.client_id)).map((d) => String(d.clientName || (d.job_id && jobsById.get(d.job_id)?.client_name) || '').trim()),
        ...visitJobs.filter((j) => !j.client_id).map((j) => String(j.client_name || '').trim()),
    ].filter(Boolean))];
    if (legacyNames.length) {
        clients.push(...(await inChunks<ClientRow>(legacyNames, (names) => supabase.from('clients').select(CLIENT_SELECT).in('name', names))));
    }
    const sentAtBy = new Map(states.map((s) => [s.document_id, s.sent_at]));
    const recordsByTarget = new Map<string, RecordedReminder[]>();
    for (const r of records) {
        const key = r.document_id ?? r.job_id ?? '';
        recordsByTarget.set(key, [...(recordsByTarget.get(key) ?? []), recordFromRow(r)]);
    }

    const horizon = addDays(today, UPCOMING_DAYS);
    const upcoming: UpcomingReminder[] = [];
    for (const d of docs) {
        const job = d.job_id ? jobsById.get(d.job_id) ?? null : null;
        const client = resolveClient({ clientId: d.client_id, jobClientId: job?.client_id, name: d.clientName || job?.client_name }, clients);
        const facts = factsFromDoc(d, { sentAt: sentAtBy.get(d.id) ?? null, receiptsTotal: d.type === 'Invoice' ? receiptsTotalFor(d, receiptsById) : 0 });
        const plan = planTarget({ facts, settings, overrides: overridesFor(idx, { documentId: d.id, clientId: client?.id ?? null }), launchedAt: basics.launchedAt, recorded: recordsByTarget.get(d.id) ?? [], now });
        if (!plan.next || plan.next.sendDate > horizon) continue;
        upcoming.push({
            kind: facts.kind, targetId: d.id, documentId: d.id, jobId: d.job_id ?? null, label: docLabel(d),
            clientName: client?.name || d.clientName || job?.client_name || '', recipient: recipientOf(client?.email, d.clientEmail),
            amountText: facts.amount > 0 ? formatMoney(facts.amount, d.currency || 'USD') : '', step: plan.next, plan,
        });
    }
    for (const j of visitJobs) {
        const client = resolveClient({ clientId: j.client_id, name: j.client_name }, clients);
        const plan = planTarget({ facts: factsFromJob(j), settings, overrides: overridesFor(idx, { jobId: j.id, clientId: client?.id ?? null }), launchedAt: basics.launchedAt, recorded: recordsByTarget.get(j.id) ?? [], now });
        if (!plan.next || plan.next.sendDate > horizon) continue;
        upcoming.push({
            kind: 'visit', targetId: j.id, documentId: null, jobId: j.id, label: j.name || 'Job visit', clientName: client?.name || j.client_name || '',
            recipient: recipientOf(client?.email), amountText: '', step: plan.next, plan,
        });
    }
    upcoming.sort((a, b) => (a.step.sendDate < b.step.sendDate ? -1 : a.step.sendDate > b.step.sendDate ? 1 : a.label.localeCompare(b.label)));

    const docsById = new Map<string, Pick<DocRow, 'type' | 'invoiceNumber' | 'estimateNumber' | 'title' | 'clientName' | 'job_id'>>([...docs, ...logDocs].map((d) => [d.id, d]));
    const clientsById = new Map(clients.map((c) => [c.id, c]));
    const log: ReminderLogItem[] = records.map((r) => {
        const doc = r.document_id ? docsById.get(r.document_id) : undefined;
        const job = r.job_id ? jobsById.get(r.job_id) : undefined;
        return {
            ...r,
            label: doc ? docLabel(doc) : job?.name || (r.kind === 'visit' ? 'Job visit' : r.kind === 'invoice' ? 'Invoice' : 'Estimate'),
            clientName: (r.client_id && clientsById.get(r.client_id)?.name) || doc?.clientName || job?.client_name || '',
            jobIdForLink: doc?.job_id ?? r.job_id ?? null,
        };
    });
    const monthAgo = now.getTime() - 30 * 86_400_000;
    const attention = log.filter((r) => (r.status === 'failed' || (r.status === 'skipped' && r.reason !== 'skipped_by_user'))
        && Date.parse(String(r.created_at || '')) >= monthAgo);
    return { basics, upcoming, log, attention };
}

/** App route of a reminder's document (or job). */
export const reminderTargetPath = (kind: ReminderKind, documentId: string | null, jobId: string | null): string | null => {
    if (kind === 'visit') return jobId ? `/jobs/${jobId}` : null;
    if (!documentId || !jobId) return null;
    return `/jobs/${jobId}/forms/${encodeURIComponent(kind === 'invoice' ? 'Invoice' : 'Estimate')}/${documentId}`;
};
