/**
 * Job timeline: the reads. NO database change, NO new table: everything comes through loaders the app already has
 * (job photos, punch list, tasks, questions, selections, subs, feedback, crew time, reminders) plus one read of the
 * job's own documents with the JSON paths the timeline needs (never the whole `data`: no signatures, no photos). Each
 * source is read only when its tool is available (the `useXFeature` 'ready' flags App already holds) and a source that
 * fails or is missing is left out quietly: the rest of the timeline still shows. Reads only.
 */
import { supabase } from '../supabase.ts';
import { listJobPhotos } from '../../components/photos/photosApi.ts';
import { loadPunchList } from '../../components/punch/punchApi.ts';
import { listJobTasks } from '../tasks/tasksApi.ts';
import { listJobQuestions } from '../questions/questionsApi.ts';
import { listJobSelections } from '../selections/selectionsApi.ts';
import { listJobCommitments, listJobQuotes } from '../subs/subsApi.ts';
import { listFeedback } from '../feedback/feedbackApi.ts';
import { loadPunches } from '../crew/crewApi.ts';
import { RECORD_SELECT, STATE_SELECT } from '../../supabase/functions/reminders/shared/targets.ts';
import type { RecordRow } from '../reminders.ts';
import { OPTION_SELECT_PATHS } from '../estimateOptions.ts';
import type { TimelineData } from './aggregate.ts';
import type { TimelineDoc } from './timelineTypes.ts';

/** Which optional tools this account has (App's `useXFeature(...) === 'ready'` flags). Documents and photos always. */
export interface TimelineFeatures {
    tasks: boolean;
    questions: boolean;
    selections: boolean;
    subs: boolean;
    crew: boolean;
    feedback: boolean;
    punch: boolean;
}
export const NO_FEATURES: TimelineFeatures = { tasks: false, questions: false, selections: false, subs: false, crew: false, feedback: false, punch: false };

const NUMBER_PATHS = [
    'invoiceNumber:data->>invoiceNumber', 'estimateNumber:data->>estimateNumber', 'changeOrderNumber:data->>changeOrderNumber',
    'poNumber:data->>poNumber', 'receiptNumber:data->>receiptNumber', 'workOrderNumber:data->>workOrderNumber',
    'reportNumber:data->>reportNumber', 'warrantyNumber:data->>warrantyNumber',
];

/** The JSON paths of the job's documents the timeline reads (small: no images, no rich text). */
export const TIMELINE_COLUMNS = [
    'id', 'job_id', 'type', 'created_at', ...NUMBER_PATHS,
    'title:data->>title', 'status:data->>status', 'clientName:data->>clientName', 'currency:data->>currency', 'vendorName:data->>vendorName',
    'issueDate:data->>issueDate', 'dueDate:data->>dueDate', 'expiryDate:data->>expiryDate', 'date:data->>date',
    'clientSignedAt:data->>clientSignedAt', 'clientSignerName:data->>clientSignerName', 'clientDeclinedAt:data->>clientDeclinedAt', 'clientDeclineReason:data->>clientDeclineReason',
    'paymentReportedAt:data->>paymentReportedAt', 'paymentReportAmount:data->>paymentReportAmount', 'paymentReportNote:data->>paymentReportNote',
    'payments:data->payments', 'paidAt:data->>paidAt', 'paidDate:data->>paidDate', 'amountPaid:data->>amountPaid',
    'sourceEstimateId:data->>sourceEstimateId', 'sourceEstimateNumber:data->>sourceEstimateNumber', 'revisionOf:data->>revisionOf',
    'lineItems:data->lineItems', 'taxRate:data->>taxRate', 'discount:data->>discount', 'shipping:data->>shipping', 'isProgressBilling:data->>isProgressBilling',
    ...OPTION_SELECT_PATHS,
    'hoursWorked:data->>hoursWorked', 'overtimeHours:data->>overtimeHours', 'workerName:data->>workerName',
    'laborHours:data->>laborHours', 'crewSize:data->>crewSize', 'weather:data->>weather', 'temperature:data->>temperature',
    'items:data->items', 'materials:data->materials',
    'vendor:data->>vendor', 'category:data->>category', 'amount:data->>amount', 'tax:data->>tax', 'description:data->>description',
    'paymentMethod:data->>paymentMethod', 'internalDeliveries:data->internalDeliveries',
    'completedDate:data->>completedDate', 'duration:data->>duration', 'warrantyTracking:data->warrantyTracking',
].join(', ');

/** Daily reports and notes also bring their text (read apart, so other documents never download it). */
const TEXT_COLUMNS = ['id', 'content:data->>content', 'tags:data->tags', 'noteAt:data->>noteAt', 'conversationNote:data->conversationNote'].join(', ');

const MAX_DOCS = 1000;
const MAX_TEXT_DOCS = 500;

const NON_DATA_KEYS = new Set(['id', 'job_id', 'type', 'created_at']);

/** A documents row of TIMELINE_COLUMNS -> the document as the timeline reads it (null values dropped). */
export const docFromRow = (row: Record<string, any>): TimelineDoc => {
    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) if (!NON_DATA_KEYS.has(key) && value !== null && value !== undefined) data[key] = value;
    return { id: String(row.id), jobId: row.job_id ?? null, type: String(row.type || ''), createdAt: String(row.created_at || ''), data };
};

const chunks = <T,>(list: readonly T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

async function readDocuments(jobId: string): Promise<TimelineDoc[]> {
    const [main, text] = await Promise.all([
        supabase.from('documents').select(TIMELINE_COLUMNS).eq('job_id', jobId).order('created_at', { ascending: false }).limit(MAX_DOCS),
        supabase.from('documents').select(TEXT_COLUMNS).eq('job_id', jobId).in('type', ['Daily Job Report', 'Note']).order('created_at', { ascending: false }).limit(MAX_TEXT_DOCS),
    ]);
    if (main.error) throw main.error;
    const extra = new Map<string, Record<string, any>>();
    if (!text.error) for (const r of (text.data || []) as unknown as Array<Record<string, any>>) extra.set(String(r.id), r);
    return ((main.data || []) as unknown as Array<Record<string, any>>).map(row => {
        const more = extra.get(String(row.id));
        return docFromRow(more ? { ...row, ...Object.fromEntries(Object.entries(more).filter(([k]) => k !== 'id')) } : row);
    });
}

/** The day the reminders saw each invoice / estimate marked Sent. Empty when reminders are not in the database. */
async function readSentAt(docs: readonly TimelineDoc[]): Promise<Record<string, string>> {
    const ids = docs.filter(d => d.type === 'Invoice' || d.type === 'Estimate').map(d => d.id);
    const out: Record<string, string> = {};
    for (const part of chunks(ids, 80)) {
        const res = await supabase.from('reminder_document_state').select(STATE_SELECT).in('document_id', part);
        if (res.error) return out;
        for (const r of (res.data || []) as unknown as Array<{ document_id: string; sent_at: string }>) if (r.sent_at) out[String(r.document_id)] = String(r.sent_at);
    }
    return out;
}

/** The reminder emails of the job (the `reminders` log the Messages screen reads); quiet when the table is not there. */
async function readReminders(jobId: string, docs: readonly TimelineDoc[]): Promise<RecordRow[]> {
    const byJob = await supabase.from('reminders').select(RECORD_SELECT).eq('job_id', jobId).order('created_at', { ascending: false }).limit(200);
    if (byJob.error) return [];
    const rows = new Map<string, RecordRow>(((byJob.data || []) as unknown as RecordRow[]).map(r => [r.id, r]));
    for (const part of chunks(docs.filter(d => d.type === 'Invoice' || d.type === 'Estimate').map(d => d.id), 80)) {
        const res = await supabase.from('reminders').select(RECORD_SELECT).in('document_id', part).order('created_at', { ascending: false }).limit(200);
        if (!res.error) for (const r of (res.data || []) as unknown as RecordRow[]) rows.set(r.id, r);
    }
    return [...rows.values()];
}

/** Crew member names (the same read the Tasks "assigned to" list uses). */
async function readMemberNames(): Promise<Record<string, string>> {
    const { data, error } = await supabase.from('crew_members').select('id, name').limit(300);
    if (error) return {};
    const out: Record<string, string> = {};
    for (const r of (data || []) as Array<{ id?: string; name?: string }>) if (r.id && r.name) out[String(r.id)] = String(r.name);
    return out;
}

export interface TimelineLoad {
    data: Partial<TimelineData>;
    /** crew member id -> name (tasks and time punches) */
    memberNames: Record<string, string>;
    /** sources that are set up but could not be read just now, by their name on screen */
    failed: string[];
    /** epoch ms */
    at: number;
}

const FAILED_LABEL = {
    docs: 'Documents', photos: 'Photos', punch: 'Punch list', tasks: 'Tasks', questions: 'Questions', selections: 'Selections', subs: 'Subcontractors',
    feedback: 'Feedback', crew: 'Crew time',
} as const;

export interface LoadArgs {
    jobId: string;
    userId: string;
    features: TimelineFeatures;
    online: boolean;
    /** documents already on screen (offline, or when the read fails): fewer details, but the timeline still shows */
    fallbackDocs?: readonly TimelineDoc[];
    now?: number;
}

/** Reads everything the timeline shows for one job. Never throws: what failed is listed in `failed`. */
export async function loadTimelineData(args: LoadArgs): Promise<TimelineLoad> {
    const now = args.now ?? Date.now();
    const data: Partial<TimelineData> = {};
    const failed: string[] = [];
    let memberNames: Record<string, string> = {};
    const fallback = [...(args.fallbackDocs || [])];

    if (!args.online) {
        data.docs = fallback;
        return { data, memberNames, failed, at: now };
    }

    // documents first: the sent day and the reminders need their ids
    try { data.docs = await readDocuments(args.jobId); } catch { failed.push(FAILED_LABEL.docs); data.docs = fallback; }
    const docs = data.docs || [];

    const step = async <K extends keyof typeof FAILED_LABEL>(key: K, run: () => Promise<void>) => {
        try { await run(); } catch { failed.push(FAILED_LABEL[key]); }
    };
    const { features, jobId, userId } = args;
    await Promise.all([
        (async () => { try { data.sentAt = await readSentAt(docs); } catch { /* the sent day is optional */ } })(),
        (async () => { try { data.reminders = await readReminders(jobId, docs); } catch { /* reminders are optional */ } })(),
        (async () => { if (features.crew || features.tasks) try { memberNames = await readMemberNames(); } catch { /* names are optional */ } })(),
        step('photos', async () => { const list = await listJobPhotos(jobId); if (list) data.photos = list; }),
        features.punch ? step('punch', async () => { const res = await loadPunchList(userId, jobId); if (res) data.punchItems = res.items; }) : Promise.resolve(),
        features.tasks ? step('tasks', async () => { const list = await listJobTasks(jobId); if (list) data.tasks = list; }) : Promise.resolve(),
        features.questions ? step('questions', async () => { const list = await listJobQuestions(jobId); if (list) data.questions = list; }) : Promise.resolve(),
        features.selections ? step('selections', async () => { const list = await listJobSelections(jobId); if (list) data.selections = list; }) : Promise.resolve(),
        features.subs ? step('subs', async () => {
            const [commitments, quotes] = await Promise.all([listJobCommitments(jobId), listJobQuotes(jobId)]);
            if (commitments) data.commitments = commitments;
            if (quotes) data.quotes = quotes;
        }) : Promise.resolve(),
        features.feedback ? step('feedback', async () => { const list = await listFeedback({ jobId }); if (list) data.feedback = list; }) : Promise.resolve(),
        features.crew ? step('crew', async () => {
            data.punches = await loadPunches({ from: new Date(now - 540 * 86_400_000).toISOString(), to: new Date(now + 86_400_000).toISOString(), jobId });
        }) : Promise.resolve(),
    ]);
    return { data, memberNames, failed, at: now };
}
