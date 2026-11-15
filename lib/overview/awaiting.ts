/**
 * Business overview (N3): estimates awaiting an answer. The state of an estimate is the pipeline's
 * (lib/pipeline.ts approvalState: "sent" = marked Sent, not signed, not declined, not a draft), so this list never
 * disagrees with the Pipeline board. A revision that left draft replaces the estimate it revises, and estimates of
 * Inactive jobs are left out, like on the board.
 *
 * It is a "right now" list: how long an estimate has been waiting does not depend on the period chosen on the screen,
 * but the customer / project filters apply.
 */
import { mapPipelineRow, approvalState, daysSince, dayOf, docTotal, STALE_DAYS, type PipelineDoc } from '../pipeline.ts';
import { instantToLocalYMD, normalizeYMD } from '../../utils/localDates.ts';
import { customerKey, customerOf } from './facts.ts';
import { NO_FILTERS, type OverviewDoc, type OverviewFilters, type OverviewJob } from './types.ts';

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

export interface AwaitingEstimate {
    id: string;
    jobId: string | null;
    jobName: string;
    customer: string;
    /** estimate number, else its title */
    number: string;
    amount: number;
    /** the day it was sent (issue date, else its date, else when it was created) */
    sentDay: string | null;
    /** whole days since then (null when unknown) */
    daysWaiting: number | null;
    /** waiting longer than the pipeline's "no answer" mark (STALE_DAYS.estimate) */
    stale: boolean;
    /** past its expiry date */
    expired: boolean;
    /** the document, ready for the existing follow-up window (components/pipeline/FollowUp.tsx FollowUpShare) */
    doc: PipelineDoc;
}

export interface AwaitingSummary {
    rows: AwaitingEstimate[];
    /** total value waiting */
    total: number;
    count: number;
}

export const awaitingEstimates = (
    docs: readonly OverviewDoc[],
    jobs: readonly OverviewJob[],
    jobCustomers: ReadonlyMap<string, string>,
    todayYMD: string,
    filters: OverviewFilters = NO_FILTERS,
): AwaitingSummary => {
    const jobsById = new Map(jobs.map(j => [j.id, j]));
    const mapped = docs
        .filter(d => norm(d.type) === 'estimate' || norm(d.type).replace(/[_-]+/g, ' ') === 'change order')
        .map(d => ({ raw: d, doc: { ...mapPipelineRow(d), type: String(d.type ?? '') } as PipelineDoc }));
    // a revision that left draft replaces the document it revises
    const superseded = new Set(mapped.filter(m => m.doc.revisionOf && approvalState(m.doc) !== 'draft').map(m => String(m.doc.revisionOf)));

    const rows: AwaitingEstimate[] = [];
    for (const { raw, doc } of mapped) {
        if (norm(doc.type) !== 'estimate') continue;
        if (superseded.has(doc.id) || approvalState(doc) !== 'sent') continue;
        const job = doc.jobId ? jobsById.get(doc.jobId) : undefined;
        if (job && norm(job.status) === 'inactive') continue;
        const customer = customerOf(raw, jobCustomers);
        if (filters.jobId !== null && doc.jobId !== filters.jobId) continue;
        if (filters.customerKey !== null && customerKey(customer) !== filters.customerKey) continue;
        const sentDay = dayOf(doc.issueDate) ?? dayOf(doc.date) ?? dayOf(doc.createdAt);
        const daysWaiting = daysSince(sentDay, todayYMD);
        const expiry = normalizeYMD(doc.expiryDate) ?? instantToLocalYMD(doc.expiryDate);
        rows.push({
            id: doc.id,
            jobId: doc.jobId,
            jobName: String(job?.name ?? '').trim(),
            customer,
            number: String(doc.number || doc.title || '').trim() || 'Estimate',
            amount: docTotal(doc),
            sentDay,
            daysWaiting,
            stale: daysWaiting !== null && daysWaiting > STALE_DAYS.estimate,
            expired: !!expiry && expiry < todayYMD,
            doc,
        });
    }
    // oldest first (the longest wait on top); unknown dates last
    rows.sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1) || b.amount - a.amount || a.id.localeCompare(b.id));
    const total = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    return { rows, total, count: rows.length };
};
