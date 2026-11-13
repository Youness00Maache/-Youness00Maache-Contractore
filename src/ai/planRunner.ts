/**
 * Runs a confirmed RUN_PLAN (see routerContract.ts `PlanStep`) step by step.
 *
 * - Steps run in order; each step's outcome is recorded separately (a failed step never undoes or
 *   hides the completed ones) and reported through `onProgress` after every change.
 * - Records created by earlier steps are remembered by their `ref`, so documents land on the new job
 *   and the right new client. The state is kept on the chat message: "Retry" runs only the steps that
 *   are not done yet and reuses what was already created.
 * - All side effects go through `PlanIO` (the assistant hook supplies the real database calls; the QA
 *   script supplies fakes), so this file stays pure.
 */
import type { JobStatus, PlanStep } from '../../supabase/functions/ai-assistant/shared/routerContract.ts';
import { DOC_LABELS, type DocKey } from '../config/documentFieldRequirements.ts';

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface PlanStepResult {
    status: PlanStepStatus;
    /** "Client Michael added", "Not saved: …" */
    message?: string;
    /** App route of what the step created or changed. */
    link?: string;
    linkLabel?: string;
    /** Error code (PLAN_LIMIT, DEPENDENCY, NEEDS_JOB, SKIPPED, …). */
    code?: string;
}

export interface PlanJobRecord { id: string; name: string; clientName?: string; clientAddress?: string; clientId?: string | null }
export interface PlanClientRecord { id: string; name: string; address?: string }

export interface PlanRunState {
    running: boolean;
    /** The steps as they ran (card edits applied); a retry runs these again. */
    steps: PlanStep[];
    /** by step id */
    results: Record<string, PlanStepResult>;
    /** step ref → job created by that step */
    jobs: Record<string, PlanJobRecord>;
    /** step ref → client created (or reused) by that step */
    clients: Record<string, PlanClientRecord>;
}

export interface PlanIO {
    /** Creates a client, or returns an existing client with the same name (`reused`). */
    createClient(entity: Record<string, unknown>): Promise<{ client: PlanClientRecord; reused?: boolean }>;
    createJob(input: { entity: Record<string, unknown>; client: PlanClientRecord | null }): Promise<PlanJobRecord>;
    getJob(id: string): PlanJobRecord | null;
    getClient(id: string): PlanClientRecord | null;
    /** Saves the document as a Draft; returns its id, a label and its route. */
    saveDocument(input: { step: PlanStep; docType: DocKey; job: PlanJobRecord; client: PlanClientRecord | null }): Promise<{ id: string; label: string; link: string }>;
    addInventory(entity: Record<string, unknown>): Promise<{ label: string }>;
    addPriceBookItem(entity: Record<string, unknown>): Promise<{ label: string }>;
    restock(itemId: string, delta: number): Promise<{ label: string }>;
    updateJobStatus(job: PlanJobRecord, status: JobStatus): Promise<void>;
    onProgress?(state: PlanRunState): void;
}

/** An error with a code the card can act on (PLAN_LIMIT shows the upgrade button). */
export class PlanStepError extends Error {
    constructor(message: string, public code?: string) { super(message); }
}

const errorText = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    return (raw || 'That step did not work. Please try again.').replace(/^.*?PLAN_LIMIT:\s*/i, '').trim();
};

const errorCode = (err: unknown): string | undefined => {
    const code = (err as { code?: unknown })?.code;
    if (typeof code === 'string' && code) return code;
    return /PLAN_LIMIT/i.test(err instanceof Error ? err.message : String(err ?? '')) ? 'PLAN_LIMIT' : undefined;
};

const stepName = (steps: PlanStep[], ref: string | null | undefined): string =>
    String(steps.find(s => s.ref === ref)?.entity?.name || ref || '');

/** One line describing a step (card rows, summaries). */
export function describePlanStep(step: PlanStep, steps: PlanStep[] = []): string {
    const e = step.entity || {};
    switch (step.action_type) {
        case 'CREATE_CLIENT': return `New client: ${String(e.name || '')}`;
        case 'CREATE_JOB': return `New job: ${String(e.name || '')}`;
        case 'GENERATE_DOCUMENT': return step.document_type ? DOC_LABELS[step.document_type] : 'Document';
        case 'ADD_INVENTORY': return `Inventory: ${String(e.name || '')}`;
        case 'ADD_PRICE_BOOK_ITEM': return `Price book: ${String(e.name || '')}`;
        case 'RESTOCK_INVENTORY': return `Stock ${Number(step.quantity_delta) > 0 ? '+' : ''}${step.quantity_delta}`;
        case 'UPDATE_JOB_STATUS': return `Job ${step.job_ref ? stepName(steps, step.job_ref) : ''} → ${step.job_status}`.replace(/\s+/g, ' ');
        default: return 'Step';
    }
}

/** Card edits applied to the proposed steps. */
export interface PlanEdits {
    /** step ids the user removed */
    removed?: Iterable<string>;
    /** step id → new entity name (clients, jobs, items) */
    names?: Record<string, string>;
    /** step id → "ref:<job step ref>" or "id:<existing job id>" (documents, job status) */
    jobs?: Record<string, string>;
}

/**
 * Applies the card edits. A step whose job step was removed is skipped as well, unless the user
 * chose another job for it (it has nowhere else to go).
 */
export function applyPlanEdits(steps: PlanStep[], edits: PlanEdits = {}): PlanStep[] {
    const removed = new Set(edits.removed || []);
    const out = steps.map(s => {
        const next: PlanStep = { ...s, skip: removed.has(s.id) };
        const name = edits.names?.[s.id]?.replace(/\s+/g, ' ').trim();
        if (name && next.entity) next.entity = { ...next.entity, name: name.slice(0, 120) };
        const pick = edits.jobs?.[s.id];
        if (pick && (s.action_type === 'GENERATE_DOCUMENT' || s.action_type === 'UPDATE_JOB_STATUS')) {
            if (pick.startsWith('ref:')) { next.job_ref = pick.slice(4); next.job_id = null; }
            else if (pick.startsWith('id:')) { next.job_id = pick.slice(3); next.job_ref = null; }
        }
        return next;
    });
    const removedJobs = new Set(out.filter(s => s.skip && s.action_type === 'CREATE_JOB').map(s => s.ref));
    // A renamed client/job keeps its ref, so the steps that point at it follow the new name.
    for (const s of out) {
        if (s.action_type === 'CREATE_JOB' && s.client_ref) {
            const client = out.find(c => c.ref === s.client_ref);
            if (client?.entity?.name && s.entity) s.entity = { ...s.entity, client_name: client.skip ? s.entity.client_name : client.entity.name };
        }
    }
    return out.map(s => (!s.skip && s.job_ref && removedJobs.has(s.job_ref) ? { ...s, skip: true } : s));
}

/** Steps that cannot run yet because no job is chosen (the card asks for one). */
export function stepsNeedingJob(steps: PlanStep[]): PlanStep[] {
    return steps.filter(s => !s.skip && (s.action_type === 'GENERATE_DOCUMENT' || s.action_type === 'UPDATE_JOB_STATUS') && !s.job_ref && !s.job_id);
}

export function summarizePlanRun(state: PlanRunState, steps: PlanStep[]): { done: number; failed: number; skipped: number; total: number; text: string } {
    const active = steps.filter(s => !s.skip);
    const done = active.filter(s => state.results[s.id]?.status === 'done').length;
    const failed = active.filter(s => state.results[s.id]?.status === 'error').length;
    const skipped = steps.length - active.length + active.filter(s => state.results[s.id]?.status === 'skipped').length;
    const text = failed
        ? `${done} of ${active.length} steps done, ${failed} failed`
        : `All ${done} step${done === 1 ? '' : 's'} done${skipped ? ` (${skipped} skipped)` : ''}`;
    return { done, failed, skipped, total: active.length, text };
}

function resolveJob(step: PlanStep, state: PlanRunState, steps: PlanStep[], io: PlanIO): PlanJobRecord {
    if (step.job_ref) {
        const job = state.jobs[step.job_ref];
        if (job) return job;
        const source = steps.find(s => s.ref === step.job_ref);
        const name = stepName(steps, step.job_ref);
        if (source?.skip) throw new PlanStepError(`Skipped: the job "${name}" was removed from the plan.`, 'SKIPPED');
        throw new PlanStepError(`Not done: the job "${name}" was not created.`, 'DEPENDENCY');
    }
    if (step.job_id) {
        const job = io.getJob(step.job_id);
        if (job) return job;
        throw new PlanStepError('That job no longer exists.', 'NOT_FOUND');
    }
    throw new PlanStepError('Choose a job for this document.', 'NEEDS_JOB');
}

function resolveClient(step: PlanStep, state: PlanRunState, steps: PlanStep[], io: PlanIO): PlanClientRecord | null {
    if (step.client_ref) {
        const client = state.clients[step.client_ref];
        if (client) return client;
        const source = steps.find(s => s.ref === step.client_ref);
        const name = stepName(steps, step.client_ref);
        // Removed on the card: keep the name on the document, without a client record.
        if (!source || source.skip) return name ? { id: '', name } : null;
        throw new PlanStepError(`Not done: the client "${name}" was not created.`, 'DEPENDENCY');
    }
    if (step.client_id) return io.getClient(step.client_id);
    return null;
}

async function runStep(step: PlanStep, state: PlanRunState, steps: PlanStep[], io: PlanIO): Promise<Omit<PlanStepResult, 'status'>> {
    const entity = step.entity || {};
    switch (step.action_type) {
        case 'CREATE_CLIENT': {
            const { client, reused } = await io.createClient(entity);
            state.clients[step.ref] = client;
            return { message: reused ? `Using your existing client ${client.name}` : `Client ${client.name} added`, link: '/clients', linkLabel: client.name };
        }
        case 'CREATE_JOB': {
            const client = resolveClient(step, state, steps, io);
            const job = await io.createJob({ entity, client });
            state.jobs[step.ref] = job;
            return { message: `Job ${job.name} created`, link: `/jobs/${job.id}`, linkLabel: job.name };
        }
        case 'GENERATE_DOCUMENT': {
            if (!step.document_type) throw new PlanStepError('Unknown document type.');
            const job = resolveJob(step, state, steps, io);
            const client = resolveClient(step, state, steps, io);
            const saved = await io.saveDocument({ step, docType: step.document_type, job, client });
            return { message: `${saved.label} saved as a draft${client?.name ? ` for ${client.name}` : ''}`, link: saved.link, linkLabel: saved.label };
        }
        case 'ADD_INVENTORY': {
            const r = await io.addInventory(entity);
            return { message: `${r.label} added to inventory`, link: '/inventory', linkLabel: 'Inventory' };
        }
        case 'ADD_PRICE_BOOK_ITEM': {
            const r = await io.addPriceBookItem(entity);
            return { message: `${r.label} added to the price book`, link: '/pricebook', linkLabel: 'Price book' };
        }
        case 'RESTOCK_INVENTORY': {
            if (!step.inventory_item_id || !step.quantity_delta) throw new PlanStepError('Which item, and by how much?');
            const r = await io.restock(step.inventory_item_id, step.quantity_delta);
            return { message: r.label, link: '/inventory', linkLabel: 'Inventory' };
        }
        case 'UPDATE_JOB_STATUS': {
            if (!step.job_status) throw new PlanStepError('Which status?');
            const job = resolveJob(step, state, steps, io);
            await io.updateJobStatus(job, step.job_status);
            return { message: `${job.name} → ${step.job_status}`, link: `/jobs/${job.id}`, linkLabel: job.name };
        }
        default:
            throw new PlanStepError('This step is not supported.');
    }
}

/**
 * Runs every step that is not done yet (all of them the first time). Never throws: each step ends
 * as done, error or skipped. Pass the previous state to retry only what failed.
 */
export async function runPlan(steps: PlanStep[], io: PlanIO, previous?: PlanRunState | null): Promise<PlanRunState> {
    const state: PlanRunState = {
        running: true,
        steps,
        results: { ...(previous?.results || {}) },
        jobs: { ...(previous?.jobs || {}) },
        clients: { ...(previous?.clients || {}) },
    };
    const emit = () => {
        try { io.onProgress?.({ ...state, results: { ...state.results } }); } catch { /* progress is best effort */ }
    };
    for (const s of steps) {
        if (state.results[s.id]?.status === 'done') continue;
        state.results[s.id] = s.skip ? { status: 'skipped', message: 'Removed from the plan' } : { status: 'pending' };
    }
    emit();
    for (const step of steps) {
        if (step.skip || state.results[step.id]?.status === 'done') continue;
        state.results[step.id] = { status: 'running' };
        emit();
        try {
            const result = await runStep(step, state, steps, io);
            state.results[step.id] = { status: 'done', ...result };
        } catch (err) {
            const code = errorCode(err);
            state.results[step.id] = { status: code === 'SKIPPED' ? 'skipped' : 'error', message: errorText(err), ...(code ? { code } : {}) };
        }
        emit();
    }
    state.running = false;
    emit();
    return state;
}
