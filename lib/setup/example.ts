/**
 * Example project (setup assistant, roadmap N8): one clearly labelled sample client, job and draft estimate so a new
 * contractor can see what the app makes, and ONE action that removes exactly those rows again. Never created by
 * itself. The ids of what was created are kept in user_settings 'setup.example' (synced), so "Remove example data"
 * works from any device and never touches anything else. Pure: the screens do the saving with the existing client,
 * job and document paths (components/setup/setupApi.ts).
 */
import { applyMoneyDefaults, type MoneyDefaults } from './moneyDefaults.ts';

export const SETUP_EXAMPLE_SETTING = 'setup.example';

/** Every name starts with "Example" so nobody mistakes it for real work. */
export const EXAMPLE_CLIENT_NAME = 'Example: Sam Rivera';
export const EXAMPLE_CLIENT_ADDRESS = '12 Sample Street (example address)';
export const EXAMPLE_JOB_NAME = 'Example: Kitchen refresh';
export const EXAMPLE_ESTIMATE_TITLE = 'Example estimate: kitchen refresh';

export interface ExampleTracking {
    v: 1;
    clientId: string | null;
    jobId: string | null;
    documentIds: string[];
    createdAt: string | null;
}

export const emptyExample = (): ExampleTracking => ({ v: 1, clientId: null, jobId: null, documentIds: [], createdAt: null });

const idOf = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f-]{32,40}$/i.test(v) ? v : null);

export function normalizeExample(raw: unknown): ExampleTracking {
    if (!raw || typeof raw !== 'object') return emptyExample();
    const r = raw as Record<string, unknown>;
    const docs = Array.isArray(r.documentIds) ? r.documentIds.map(idOf).filter((x): x is string => !!x) : [];
    return {
        v: 1,
        clientId: idOf(r.clientId),
        jobId: idOf(r.jobId),
        documentIds: Array.from(new Set(docs)).slice(0, 10),
        createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
    };
}

/** Is there example data to remove? */
export const hasExample = (e: ExampleTracking | null | undefined): boolean => !!e && !!(e.clientId || e.jobId || e.documentIds.length);

/** Free-plan room for the example (one job, one client, one document), from the usage the app already tracks. */
export interface ExampleUsage {
    paid: boolean;
    /** numbers came from the server (otherwise they are only a display count and never block) */
    fromServer: boolean;
    jobsThisMonth: number;
    clientsThisMonth: number;
    /** limits; null = unlimited */
    limits: { jobs: number | null; clients: number | null; docs: number | null };
    /** jobs / clients waiting in the offline outbox also take a slot */
    pendingJobs?: number;
    pendingClients?: number;
}

export const EXAMPLE_LIMIT_MESSAGE =
    'Your Free plan has no room left this month for an example job or client, so the example was not added. Nothing was changed. You can add it next month, or upgrade for unlimited jobs and clients.';

/** Can the example be created without hitting a Free limit? (The database enforces the same limits.) */
export function exampleRoom(u: ExampleUsage): { ok: boolean; reason: string } {
    if (u.paid || !u.fromServer) return { ok: true, reason: '' };
    const jobs = u.jobsThisMonth + (u.pendingJobs ?? 0);
    const clients = u.clientsThisMonth + (u.pendingClients ?? 0);
    if (u.limits.jobs !== null && jobs >= u.limits.jobs) return { ok: false, reason: EXAMPLE_LIMIT_MESSAGE };
    if (u.limits.clients !== null && clients >= u.limits.clients) return { ok: false, reason: EXAMPLE_LIMIT_MESSAGE };
    if (u.limits.docs !== null && u.limits.docs < 1) return { ok: false, reason: EXAMPLE_LIMIT_MESSAGE };
    return { ok: true, reason: '' };
}

const lines = (newId: () => string) => ([
    { id: newId(), description: 'Remove old cabinets and haul away', quantity: 1, rate: 650, unitCost: 420 },
    { id: newId(), description: 'Install new base and wall cabinets', quantity: 18, rate: 210, unit: 'lf', unitCost: 140 },
    { id: newId(), description: 'Countertop, supplied and installed', quantity: 1, rate: 3200, unitCost: 2250 },
    { id: newId(), description: 'Paint walls and ceiling', quantity: 1, rate: 900, unitCost: 520 },
]);

export interface ExampleEstimateInput {
    profile: { companyName?: string | null; address?: string | null; phone?: string | null; website?: string | null; logoUrl?: string | null };
    estimateNumber: string;
    today: string;
    /** the app's own start of a new estimate (design, colors): the default template + theme, with the user's default design applied */
    design: { templateId: string; themeColors: Record<string, unknown> } & Record<string, unknown>;
    money?: MoneyDefaults | null;
    newId?: () => string;
    addDays: (iso: string, days: number) => string;
}

/** The data of the draft estimate, in the shape the Estimate form saves. */
export function buildExampleEstimate(i: ExampleEstimateInput): Record<string, unknown> {
    const newId = i.newId ?? (() => globalThis.crypto.randomUUID());
    const base: Record<string, unknown> = {
        ...i.design,
        title: EXAMPLE_ESTIMATE_TITLE,
        estimateNumber: i.estimateNumber,
        issueDate: i.today,
        expiryDate: i.addDays(i.today, 30),
        status: 'Draft',
        lineItems: lines(newId),
        discount: 0,
        taxRate: 0,
        notes: 'This is an example estimate. Remove it any time from Settings, Setup assistant, Remove example data.',
        terms: 'This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion.',
        companyName: i.profile.companyName || '',
        companyAddress: i.profile.address || '',
        companyPhone: i.profile.phone || '',
        companyWebsite: i.profile.website || '',
        clientName: EXAMPLE_CLIENT_NAME,
        clientAddress: EXAMPLE_CLIENT_ADDRESS,
        logoUrl: i.profile.logoUrl || '',
        signatureUrl: '',
    };
    return applyMoneyDefaults('Estimate', base, i.money);
}

/** What exists right now of the example's parents, to decide how much can be removed without touching anything else. */
export interface ExampleLive {
    /** ids of every document in the example job (any, including ones the person added) */
    documentsInJob: string[];
    /** ids of every job linked to the example client (any) */
    jobsOfClient: string[];
}

export interface ExampleRemoval {
    deleteDocumentIds: string[];
    deleteJobId: string | null;
    deleteClientId: string | null;
    /** plain sentence about anything kept, '' when everything went */
    kept: string;
}

/**
 * What "Remove example data" deletes: the tracked documents; the job only when nothing else is in it; the client only
 * when no other job points at it. Anything the person added to the example stays, and they are told.
 */
export function planExampleRemoval(tracked: ExampleTracking, live: ExampleLive): ExampleRemoval {
    const deleteDocumentIds = [...tracked.documentIds];
    const gone = new Set(deleteDocumentIds);
    const ownDocsLeft = live.documentsInJob.filter(id => !gone.has(id));
    let deleteJobId: string | null = null;
    let deleteClientId: string | null = null;
    const kept: string[] = [];
    if (tracked.jobId) {
        if (ownDocsLeft.length === 0) deleteJobId = tracked.jobId;
        else kept.push('The example job was kept because you added your own documents to it.');
    }
    if (tracked.clientId) {
        const otherJobs = live.jobsOfClient.filter(id => id !== deleteJobId);
        if (otherJobs.length === 0) deleteClientId = tracked.clientId;
        else kept.push('The example client was kept because it has other jobs.');
    }
    return { deleteDocumentIds, deleteJobId, deleteClientId, kept: kept.join(' ') };
}
