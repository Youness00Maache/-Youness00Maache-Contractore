/**
 * The setup assistant's reads and writes (roadmap N8). It adds no new kind of write: price-book kits go through the
 * same insert and the same offline outbox as the price book screen; the example project uses the app's own client,
 * job and document paths; settings go through lib/userData.ts. Everything that cannot work offline says so with the
 * app's usual sentence (lib/offline/connection.ts).
 */
import { supabase } from '../../lib/supabase.ts';
import { getCurrentUserId, withSchemaFallback, friendlyError } from '../viewKit.tsx';
import { NEEDS_CONNECTION, isBrowserOffline } from '../../lib/offline/connection.ts';
import { offlineEntityQueueFor, pendingEntityItems } from '../../lib/offline/offlineEntities.ts';
import { planStarterImport, usableLaborRate } from '../../lib/assemblies/starterImport.ts';
import { isPlanLimitError } from '../../lib/account.ts';
import { upsertDocumentRecord, fetchDocumentNumbers } from '../../lib/documentSave.ts';
import { nextDocumentNumber, addDaysISO, todayISO } from '../forms/formUtils.ts';
import { DEFAULT_TEMPLATE_ID, DEFAULT_THEME } from '../forms/useDocumentForm.ts';
import { applyDesignDefault, designPlan } from '../../lib/designAccess.ts';
import { currentDesignDefault } from '../../lib/designDefaults.ts';
import { currentMoneyDefaults } from '../../lib/setup/moneyStore.ts';
import { loadSetupExampleRaw, saveSetupExampleRaw } from '../../lib/userData.ts';
import {
    EXAMPLE_CLIENT_ADDRESS, EXAMPLE_CLIENT_NAME, EXAMPLE_JOB_NAME, EXAMPLE_LIMIT_MESSAGE, buildExampleEstimate, emptyExample, hasExample,
    normalizeExample, planExampleRemoval, type ExampleTracking,
} from '../../lib/setup/example.ts';
import { kitIdsForTrades } from '../../lib/setup/trades.ts';

// ---------------------------------------------------------------------------------------------- reads
/** Rows in the price book (null = could not be read now). Rows waiting in the outbox count too. */
export async function countPriceBook(): Promise<number | null> {
    const waiting = pendingEntityItems('price_item').filter(i => i.kind === 'create').length;
    if (isBrowserOffline()) return waiting > 0 ? waiting : null;
    try {
        const { count, error } = await supabase.from('saved_items').select('id', { count: 'exact', head: true });
        if (error || count === null || count === undefined) return waiting > 0 ? waiting : null;
        return count + waiting;
    } catch { return waiting > 0 ? waiting : null; }
}

/** Crew members on the account (null = could not be read now). */
export async function countCrewMembers(): Promise<number | null> {
    if (isBrowserOffline()) return null;
    try {
        const { count, error } = await supabase.from('crew_members').select('id', { count: 'exact', head: true });
        return error || count === null || count === undefined ? null : count;
    } catch { return null; }
}

/** Names already in the price book (rows waiting in the outbox included): duplicates of a starter kit are skipped. */
export async function priceBookNames(): Promise<string[]> {
    const names = pendingEntityItems('price_item').map(i => String(i.data?.name ?? '')).filter(Boolean);
    if (isBrowserOffline()) return names;
    try {
        const { data } = await supabase.from('saved_items').select('name').limit(5000);
        for (const r of (data || []) as Array<{ name?: string }>) if (r?.name) names.push(String(r.name));
    } catch { /* offline: the waiting ones only */ }
    return names;
}

// ----------------------------------------------------------------------------------------- starter kits
export interface StarterImportResult { created: number; skipped: number; waiting: boolean }

/** Imports the chosen kits (or all kits of the chosen trades) with the price book's own importer: duplicates skipped, offline kept on the device. */
export async function importStarterKitsFor(kitIds: readonly string[], laborRate: unknown): Promise<StarterImportResult> {
    const uid = await getCurrentUserId();
    if (!uid) throw new Error('Your session has expired. Please sign in again.');
    const names = await priceBookNames();
    const plan = planStarterImport(kitIds, names, { laborRate: usableLaborRate(laborRate) });
    let created = 0;
    let waiting = false;
    for (const r of plan.rows) {
        const row = { id: crypto.randomUUID(), user_id: uid, ...r };
        const outbox = offlineEntityQueueFor(undefined);
        if (outbox) { await outbox.queue('price_item', 'create', row.id, row); created++; waiting = true; continue; }
        const { error } = await withSchemaFallback(row, (p) => supabase.from('saved_items').insert(p).select('*').single());
        if (error) throw new Error(`${created ? `${created} kit${created === 1 ? '' : 's'} imported, then it stopped: ` : ''}${friendlyError(error, 'Could not import the kits.')}`);
        created++;
    }
    return { created, skipped: plan.skipped.length, waiting };
}

export { kitIdsForTrades };

// ------------------------------------------------------------------------------------- example project
export interface ExampleDeps {
    userId: string;
    profile: { companyName?: string | null; address?: string | null; phone?: string | null; website?: string | null; logoUrl?: string | null };
    /** the app's job creation (App.tsx handleSaveJob): the same checks, offline handling and messages as "New job" */
    createJob: (values: { name: string; clientName: string; clientAddress: string; clientId: string; startDate: string }) => Promise<string>;
}

export async function loadExample(): Promise<ExampleTracking> {
    try { return normalizeExample(await loadSetupExampleRaw()); } catch { return emptyExample(); }
}

const trackStep = async (t: ExampleTracking): Promise<void> => { await saveSetupExampleRaw(t); };

/**
 * Creates the sample client, job and draft estimate. Needs a connection. The ids are saved after each piece, so a
 * failure halfway is still removable. Returns what exists afterwards; throws a readable message on failure.
 */
export async function createExampleProject(deps: ExampleDeps): Promise<ExampleTracking> {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
    let tracked: ExampleTracking = { ...emptyExample(), createdAt: new Date().toISOString() };
    try {
        const { insertClient } = await import('../ClientDetails.tsx');
        const client = await insertClient({ name: EXAMPLE_CLIENT_NAME, email: '', phone: '', address: EXAMPLE_CLIENT_ADDRESS, notes: '' }, deps.userId);
        tracked = { ...tracked, clientId: client.id };
        await trackStep(tracked);

        const today = todayISO();
        const jobId = await deps.createJob({ name: EXAMPLE_JOB_NAME, clientName: EXAMPLE_CLIENT_NAME, clientAddress: EXAMPLE_CLIENT_ADDRESS, clientId: client.id, startDate: today });
        tracked = { ...tracked, jobId };
        await trackStep(tracked);

        const numbers = await fetchDocumentNumbers('Estimate', 'estimateNumber').catch(() => []);
        const design = applyDesignDefault({ templateId: DEFAULT_TEMPLATE_ID, themeColors: { ...DEFAULT_THEME } } as Record<string, unknown>, currentDesignDefault(), designPlan()) as { templateId: string; themeColors: Record<string, unknown> };
        const data = buildExampleEstimate({
            profile: deps.profile,
            estimateNumber: nextDocumentNumber('EST', numbers.map(n => n.number)),
            today, design, money: currentMoneyDefaults(), addDays: (iso, days) => addDaysISO(days, iso),
        });
        const docId = crypto.randomUUID();
        const record: Record<string, unknown> = { id: docId, user_id: deps.userId, job_id: jobId, type: 'Estimate', data, client_id: client.id };
        const { error } = await upsertDocumentRecord(record);
        if (error) throw error;
        tracked = { ...tracked, documentIds: [docId] };
        await trackStep(tracked);
        return tracked;
    } catch (err) {
        if (isPlanLimitError(err)) throw new Error(EXAMPLE_LIMIT_MESSAGE);
        const message = friendlyError(err, 'The example could not be added.');
        throw new Error(hasExample(tracked) ? `${message} Part of the example was added; "Remove example data" clears it.` : message);
    }
}

/** Removes exactly what the example created (see planExampleRemoval for what stays). Needs a connection. */
export async function removeExampleProject(tracked: ExampleTracking, userId: string): Promise<{ removed: boolean; kept: string }> {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
    if (!hasExample(tracked)) return { removed: false, kept: '' };
    const live = { documentsInJob: [] as string[], jobsOfClient: [] as string[] };
    if (tracked.jobId) {
        const { data, error } = await supabase.from('documents').select('id').eq('job_id', tracked.jobId).limit(500);
        if (error) throw new Error(friendlyError(error, 'Could not look at the example job.'));
        live.documentsInJob = (data || []).map((r: { id: string }) => r.id);
    }
    if (tracked.clientId) {
        const { data, error } = await supabase.from('jobs').select('id').eq('client_id', tracked.clientId).limit(500);
        if (error) throw new Error(friendlyError(error, 'Could not look at the example client.'));
        live.jobsOfClient = (data || []).map((r: { id: string }) => r.id);
    }
    const plan = planExampleRemoval(tracked, live);
    for (const id of plan.deleteDocumentIds) {
        const { error } = await supabase.from('documents').delete().eq('id', id).eq('user_id', userId);
        if (error) throw new Error(friendlyError(error, 'Could not remove the example estimate.'));
    }
    if (plan.deleteJobId) {
        const { error } = await supabase.from('jobs').delete().eq('id', plan.deleteJobId).eq('user_id', userId);
        if (error) throw new Error(friendlyError(error, 'Could not remove the example job.'));
    }
    if (plan.deleteClientId) {
        const { error } = await supabase.from('clients').delete().eq('id', plan.deleteClientId).eq('user_id', userId);
        if (error) throw new Error(friendlyError(error, 'Could not remove the example client.'));
    }
    await trackStep(emptyExample());
    return { removed: true, kept: plan.kept };
}
