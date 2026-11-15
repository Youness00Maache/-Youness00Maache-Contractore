/**
 * Business numbers for the assistant (roadmap N7): the NETWORK side. Loads what src/ai/jobFacts.ts needs, read-only
 * (owner RLS), everything in parallel and at most ~4 s; anything that fails or is not switched on (Tasks, Questions,
 * Selections tools) is simply left out, and on any failure the request goes without facts (the assistant then says it
 * does not have the number). Loaded only for money / progress questions (wantsBusinessFacts), lazily imported.
 */
import { supabase } from '../../lib/supabase.ts';
import { COSTING_TYPES } from '../../lib/costingApi.ts';
import { normalizeDocumentType } from '../../lib/documents.ts';
import { loadJobProgress } from '../../lib/userData.ts';
import { listJobTasks } from '../../lib/tasks/tasksApi.ts';
import { listJobQuestions } from '../../lib/questions/questionsApi.ts';
import { listJobSelections } from '../../lib/selections/selectionsApi.ts';
import { addDays } from '../../lib/tasks/taskLogic.ts';
import type { PriceBookLite } from '../../lib/costing.ts';
import type { OverviewDoc, OverviewJob } from '../../lib/overview/types.ts';
import { OVERVIEW_COLUMNS, loadOverviewData, peekOverviewData } from '../../components/overview/overviewApi.ts';
import type { BusinessFacts, JobFacts } from '../../supabase/functions/ai-assistant/shared/businessFacts.ts';
import { buildBusinessFacts, buildJobFacts, type ActivityDoc, type BusinessFactsInput } from './jobFacts.ts';

const LIMIT_MS = 4000;

/** Resolves to the value, or to `fallback` after `ms` / on any error. */
const settle = <T,>(p: PromiseLike<T> | T, fallback: T, ms = LIMIT_MS): Promise<T> => new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(p).then(v => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
});

async function jobDocs(jobId: string): Promise<OverviewDoc[] | null> {
    const { data, error } = await supabase.from('documents').select(OVERVIEW_COLUMNS)
        .eq('job_id', jobId).in('type', COSTING_TYPES).order('created_at', { ascending: true }).limit(2000);
    if (error) return null;
    return ((data || []) as unknown as OverviewDoc[]).map(d => ({ ...d, type: normalizeDocumentType(d.type) }));
}

async function photosSince(jobId: string, fromYmd: string): Promise<number | null> {
    const { count, error } = await supabase.from('job_photos').select('id', { count: 'exact', head: true })
        .eq('job_id', jobId).gte('created_at', `${fromYmd}T00:00:00`);
    return error || typeof count !== 'number' ? null : count;
}

export interface LoadJobFactsArgs {
    today: string;
    job: OverviewJob;
    laborRate: number;
    forms: readonly ActivityDoc[];
    priceBook?: readonly PriceBookLite[] | null;
}

/** The open job's facts, or undefined when its documents could not be read. */
export async function loadJobFacts(args: LoadJobFactsArgs): Promise<JobFacts | undefined> {
    const id = args.job.id;
    const [docs, percent, tasks, questions, selections, photos] = await Promise.all([
        settle(jobDocs(id), null),
        settle(loadJobProgress(id), null),
        settle(listJobTasks(id), null),
        settle(listJobQuestions(id), null),
        settle(listJobSelections(id), null),
        settle(photosSince(id, addDays(args.today, -6)), null),
    ]);
    if (!docs) return undefined;
    return buildJobFacts({
        today: args.today, job: args.job, docs, laborRate: args.laborRate, priceBook: args.priceBook, manualPercent: percent,
        forms: args.forms.filter(f => f.jobId === id), tasks, questions, selections, photosThisWeek: photos,
    });
}

/** The account's facts: the Business overview's documents (its copy in memory / on this device first), the inventory. */
export async function loadBusinessFacts(args: Omit<BusinessFactsInput, 'docs'>): Promise<BusinessFacts | undefined> {
    const cached = await settle(peekOverviewData(), null, 1500);
    const fresh = cached && Date.now() - cached.loadedAt < 10 * 60_000;
    const data = fresh ? cached : (await settle(loadOverviewData(false), null)) ?? cached;
    return buildBusinessFacts({ ...args, docs: data?.docs ?? [] });
}
