/**
 * Cheap reads behind the automation rules. No database changes: plain owner-RLS selects of a few JSON fields (never
 * line items or signatures), each limited. A source whose table isn't there yet or that fails returns null and the rule
 * stays silent until the next refresh.
 *
 *   signedEstimates   estimates the client signed in the last EVENT_DAYS, and which of them already have an invoice
 *   sentEstimates     estimates still "Sent" (no answer), with the day they were sent
 *   warrantyJobs      jobs that already have a Warranty document
 *   clientReplies     questions / submittals the client answered, approved or rejected recently (tools: questions)
 *   overdueTasks      unfinished tasks due today or earlier (tools: tasks)
 */
import { supabase } from '../supabase.ts';
import { listOpenTasks } from '../tasks/tasksApi.ts';
import { questionsFeature } from '../questions/questionsApi.ts';
import { isCrewBackendMissing } from '../crew/crewLogic.ts';
import { toLocalYMD } from '../../utils/localDates.ts';
import { EVENT_DAYS, type EstimateRef, type ReplyRef, type TaskRef } from './evaluate.ts';

const DAY_MS = 86_400_000;

const NUMBER_PATHS = ['estimateNumber:data->>estimateNumber', 'title:data->>title', 'clientName:data->>clientName'];

const chunks = <T,>(list: readonly T[], size = 80): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

const estimateOf = (r: any): EstimateRef => ({
    id: String(r.id), jobId: r.job_id ?? null, number: r.estimateNumber || null, title: r.title || null, clientName: r.clientName || null,
    signedAt: r.clientSignedAt || null, declinedAt: r.clientDeclinedAt || null,
});

export interface SignedEstimates {
    estimates: EstimateRef[];
    /** ids of those that already have an invoice made from them */
    invoiced: Set<string>;
}

export async function fetchSignedEstimates(uid: string, now = Date.now()): Promise<SignedEstimates | null> {
    const since = toLocalYMD(new Date(now - (EVENT_DAYS + 1) * DAY_MS));
    const { data, error } = await supabase
        .from('documents')
        .select(['id', 'job_id', ...NUMBER_PATHS, 'clientSignedAt:data->>clientSignedAt', 'clientDeclinedAt:data->>clientDeclinedAt'].join(', '))
        .eq('user_id', uid)
        .eq('type', 'Estimate')
        .gte('data->>clientSignedAt', since)
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) return null;
    const estimates = ((data || []) as any[]).map(estimateOf);
    const invoiced = new Set<string>();
    for (const ids of chunks(estimates.map(e => e.id))) {
        const res = await supabase.from('documents').select('src:data->>sourceEstimateId').eq('user_id', uid).eq('type', 'Invoice').in('data->>sourceEstimateId', ids);
        if (res.error) return null; // unknown: better silent than offering an invoice that exists
        for (const r of (res.data || []) as any[]) if (r.src) invoiced.add(String(r.src));
    }
    return { estimates, invoiced };
}

/** Sent estimates (no answer yet) of the last 90 days, with the day they were sent. */
export async function fetchSentEstimates(uid: string, now = Date.now()): Promise<EstimateRef[] | null> {
    const { data, error } = await supabase
        .from('documents')
        .select(['id', 'job_id', 'created_at', ...NUMBER_PATHS, 'issueDate:data->>issueDate', 'clientSignedAt:data->>clientSignedAt', 'clientDeclinedAt:data->>clientDeclinedAt'].join(', '))
        .eq('user_id', uid)
        .eq('type', 'Estimate')
        .eq('data->>status', 'Sent')
        .gte('created_at', new Date(now - 90 * DAY_MS).toISOString())
        .order('created_at', { ascending: false })
        .limit(200);
    if (error) return null;
    const rows = (data || []) as any[];
    const sentAt = new Map<string, string>();
    for (const ids of chunks(rows.map(r => String(r.id)))) {
        // the day the reminders saw it sent (null when reminders aren't in the database: the issue date is used)
        const res = await supabase.from('reminder_document_state').select('document_id, sent_at').in('document_id', ids);
        if (!res.error) for (const s of (res.data || []) as any[]) if (s.sent_at) sentAt.set(String(s.document_id), String(s.sent_at));
    }
    return rows.map(r => ({ ...estimateOf(r), sentAt: sentAt.get(String(r.id)) || r.issueDate || r.created_at || null }));
}

/** Ids of the given jobs that already have a Warranty document. null = could not tell. */
export async function fetchWarrantyJobs(uid: string, jobIds: readonly string[]): Promise<Set<string> | null> {
    const out = new Set<string>();
    for (const ids of chunks(Array.from(new Set(jobIds.filter(Boolean))))) {
        const res = await supabase.from('documents').select('job_id').eq('user_id', uid).eq('type', 'Warranty').in('job_id', ids);
        if (res.error) return null;
        for (const r of (res.data || []) as any[]) if (r.job_id) out.add(String(r.job_id));
    }
    return out;
}

/** Questions and submittals the client answered / approved / rejected in the last EVENT_DAYS (null = tool not available). */
export async function fetchClientReplies(now = Date.now()): Promise<ReplyRef[] | null> {
    try {
        const { data, error } = await supabase
            .from('job_questions')
            .select('id, job_id, kind, title, status, answered_by, answered_at')
            .in('status', ['answered', 'approved', 'rejected'])
            .gte('answered_at', new Date(now - (EVENT_DAYS + 1) * DAY_MS).toISOString())
            .order('answered_at', { ascending: false })
            .limit(100);
        if (error) {
            if (isCrewBackendMissing(error as any)) questionsFeature.markMissing();
            return null;
        }
        return ((data || []) as any[]).map(r => ({
            id: String(r.id), jobId: String(r.job_id || ''), kind: r.kind === 'submittal' ? 'submittal' : 'question', title: String(r.title || ''),
            status: String(r.status || ''), answeredAt: r.answered_at ?? null, answeredBy: r.answered_by ?? null,
        }));
    } catch {
        return null;
    }
}

/** Unfinished tasks due today or earlier, every job (null = tool not available). */
export async function fetchOverdueTasks(now = Date.now()): Promise<TaskRef[] | null> {
    try {
        const rows = await listOpenTasks({ dueOnOrBefore: toLocalYMD(new Date(now)), limit: 300 });
        return rows ? rows.map(t => ({ ...t })) : null;
    } catch {
        return null;
    }
}
