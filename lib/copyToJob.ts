/**
 * "Copy to another job": a document copied into a different job as a draft (owner request: the same work done for
 * two clients). Pure logic: the copy itself is lib/documents.ts buildDuplicateDocumentData (new draft, no signature,
 * payments, portal/approval state, no stock move), then the client / job boxes become the TARGET job's.
 */
import type { Client, Job } from '../types.ts';
import { buildDuplicateDocumentData } from './documents.ts';

export type CopyTargetJob = Job & { clientId?: string | null };

/** Fields that name the client / job on a document. Replaced when the document has the box. */
const REPLACED_WHEN_PRESENT = ['clientId', 'clientName', 'clientAddress', 'projectName', 'projectAddress'] as const;

/**
 * Data for the copy that goes into `target`. `client` is the target job's client record when the account has one
 * (its address wins over the job's, like the forms' own prefill). Documents have no client email/phone boxes.
 */
export const buildCopyToJobData = (
    data: Record<string, any>,
    target: CopyTargetJob,
    client?: Pick<Client, 'id' | 'name' | 'address'> | null,
): Record<string, any> => {
    const values: Record<string, string | null> = {
        clientId: client?.id || target.clientId || null,
        clientName: client?.name || target.clientName || '',
        clientAddress: client?.address || target.clientAddress || '',
        projectName: target.name || '',
        projectAddress: target.clientAddress || client?.address || '',
    };
    const next: Record<string, any> = buildDuplicateDocumentData(data);
    for (const key of REPLACED_WHEN_PRESENT) {
        if (!(key in data)) continue;
        if (key === 'clientId' && !values.clientId) delete next.clientId;
        else next[key] = values[key];
    }
    // a purchase order shipped to the old job site now ships to the new one (Company Office / Custom stay as typed)
    if (data.shipToType === 'Job Site') {
        next.shipToName = target.clientName || target.name || '';
        next.shipToAddress = target.clientAddress || '';
    }
    // copying never moves stock
    if ('deductInventory' in next) next.deductInventory = false;
    delete next.inventoryDeductedAt;
    return next;
};

const norm = (s: unknown) => String(s || '').trim().toLowerCase();

/** Jobs the picker offers: not the source job; recent first (latest activity, then created); filtered by name / client. */
export const rankJobsForPicker = (
    jobs: CopyTargetJob[],
    opts: { excludeJobId?: string; query?: string; lastActivity?: Record<string, string | undefined> } = {},
): CopyTargetJob[] => {
    const q = norm(opts.query);
    const stamp = (j: CopyTargetJob) => Date.parse(opts.lastActivity?.[j.id] || '') || Date.parse(j.createdAt || '') || 0;
    return jobs
        .filter(j => j.id !== opts.excludeJobId)
        .filter(j => !q || norm(j.name).includes(q) || norm(j.clientName).includes(q))
        .sort((a, b) => stamp(b) - stamp(a) || norm(a.name).localeCompare(norm(b.name)));
};

export const copyDoneMessage = (job: Pick<Job, 'name' | 'clientName'>): string =>
    `Copied to ${job.name || job.clientName || 'the job'} as a draft`;
