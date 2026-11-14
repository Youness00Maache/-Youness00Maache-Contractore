/**
 * Cheap reads behind the notification bell. No database changes: plain owner-RLS selects of a few JSON fields
 * (never line items, signatures or logos), each limited and filtered to the last WINDOW_DAYS days. A source whose
 * table isn't there yet (feature migration not applied) or that fails returns null; the bell keeps its last data.
 *
 *   activity   documents a client signed / declined / reported paid recently (any type, purchase orders too)
 *   due        sent invoices with a due date, sent estimates with an expiry date
 *   orders     purchase orders of the window (received into stock)
 *   requests   quote requests (components/requests/requestsApi.ts)
 *   forum      public.notifications rows (likes, comments, comment likes) + replies in threads the user joined
 *   reminders  the automatic-reminder log + the document labels
 *   gmail      connected Gmail accounts (needs reconnecting)
 *   crew       crew members still clocked in at the end of the day (lib/crew/crewApi.ts)
 */
import { supabase } from '../supabase.ts';
import { listQuoteRequests } from '../../components/requests/requestsApi.ts';
import { fetchMissedClockOuts } from '../crew/crewApi.ts';
import { crewFeatureState } from '../crew/crewFeature.ts';
import {
    WINDOW_DAYS, docInputOf, docLabel, docPath,
    type CrewMissedInput, type DocInput, type ForumCommentInput, type ForumLookups, type ForumRowInput, type GmailAccountInput, type ReminderInput, type RequestInput,
    type PaperInput, type PunchFeedbackInput, type ServiceVisitInput,
} from './model.ts';

type PgError = { code?: string; message?: string; details?: string } | null | undefined;

const isMissing = (err: PgError): boolean =>
    !!err && (['42P01', 'PGRST205', 'PGRST202', '42883', '42703', 'PGRST200'].includes(String(err.code || ''))
        || /does not exist|could not find the (table|function|relationship)|schema cache/i.test(`${err.message || ''} ${err.details || ''}`));

/** First day of the window (YYYY-MM-DD): ISO timestamps compare correctly against it as text. */
const windowStartDay = (now = Date.now()): string => new Date(now - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
const windowStartIso = (now = Date.now()): string => new Date(now - WINDOW_DAYS * 86_400_000).toISOString();

const NUMBER_PATHS = [
    'invoiceNumber:data->>invoiceNumber', 'estimateNumber:data->>estimateNumber', 'changeOrderNumber:data->>changeOrderNumber',
    'poNumber:data->>poNumber', 'receiptNumber:data->>receiptNumber', 'workOrderNumber:data->>workOrderNumber',
    'reportNumber:data->>reportNumber', 'warrantyNumber:data->>warrantyNumber',
];

const ACTIVITY_SELECT = [
    'id', 'user_id', 'job_id', 'type', 'created_at', ...NUMBER_PATHS,
    'title:data->>title', 'status:data->>status', 'clientName:data->>clientName', 'vendorName:data->>vendorName',
    'clientSignedAt:data->>clientSignedAt', 'clientSignedBy:data->>clientSignedBy', 'clientSignerName:data->>clientSignerName',
    'clientOptionChoice:data->clientOptionChoice', 'clientDeclinedAt:data->>clientDeclinedAt', 'clientDeclineReason:data->>clientDeclineReason',
    'paymentReportedAt:data->>paymentReportedAt', 'paymentReportAmount:data->>paymentReportAmount', 'paymentReportNote:data->>paymentReportNote',
    'viewedByProvider:data->>viewedByProvider',
].join(', ');

const DUE_SELECT = [
    'id', 'user_id', 'job_id', 'type', 'created_at', ...NUMBER_PATHS,
    'title:data->>title', 'status:data->>status', 'clientName:data->>clientName',
    'dueDate:data->>dueDate', 'expiryDate:data->>expiryDate',
    'clientSignedAt:data->>clientSignedAt', 'clientDeclinedAt:data->>clientDeclinedAt', 'paymentReportedAt:data->>paymentReportedAt',
].join(', ');

const ORDER_SELECT = [
    'id', 'user_id', 'job_id', 'type', 'created_at', 'poNumber:data->>poNumber', 'title:data->>title', 'status:data->>status',
    'vendorName:data->>vendorName', 'receiptState:data->internalStockReceipt->>state', 'receiptDoneAt:data->internalStockReceipt->>doneAt',
    'receiptItems:data->internalStockReceipt->items',
].join(', ');

/** Documents a client acted on in the window: signed, declined or "I've paid" (any type). */
export async function fetchActivityDocs(uid: string): Promise<DocInput[] | null> {
    const since = windowStartDay();
    const { data, error } = await supabase
        .from('documents')
        .select(ACTIVITY_SELECT)
        .eq('user_id', uid)
        .or(`data->>clientSignedAt.gte.${since},data->>clientDeclinedAt.gte.${since},data->>paymentReportedAt.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(200);
    if (error) return null;
    return ((data || []) as any[]).map(docInputOf);
}

/** Sent invoices with a due date and sent estimates with an expiry date (dates are checked in the model). */
export async function fetchDueDocs(uid: string): Promise<DocInput[] | null> {
    const [inv, est] = await Promise.all([
        supabase.from('documents').select(DUE_SELECT).eq('user_id', uid).eq('type', 'Invoice').in('data->>status', ['Sent', 'Overdue'])
            .not('data->>dueDate', 'is', null).order('created_at', { ascending: false }).limit(300),
        supabase.from('documents').select(DUE_SELECT).eq('user_id', uid).eq('type', 'Estimate').eq('data->>status', 'Sent')
            .not('data->>expiryDate', 'is', null).order('created_at', { ascending: false }).limit(300),
    ]);
    if (inv.error && est.error) return null;
    return [...((inv.data || []) as any[]), ...((est.data || []) as any[])].map(docInputOf);
}

/** Purchase orders of the window (received into stock). */
export async function fetchOrders(uid: string): Promise<DocInput[] | null> {
    const { data, error } = await supabase
        .from('documents')
        .select(ORDER_SELECT)
        .eq('user_id', uid)
        .eq('type', 'Purchase Order')
        .gte('created_at', windowStartIso(Date.now() - 60 * 86_400_000))
        .order('created_at', { ascending: false })
        .limit(150);
    if (error) return null;
    return ((data || []) as any[]).map(docInputOf);
}

/** Quote requests (null = the feature isn't in the database yet). */
export async function fetchRequests(): Promise<RequestInput[] | null> {
    try {
        const rows = await listQuoteRequests({ view: 'all', limit: 100 });
        if (!rows) return null;
        return rows.map(r => ({ id: r.id, name: r.name, details: r.details, status: r.status, createdAt: r.createdAt, photoCount: r.photoPaths.length }));
    } catch {
        return null;
    }
}

export interface ForumData {
    rows: ForumRowInput[];
    myComments: Array<Pick<ForumCommentInput, 'post_id' | 'created_at'>>;
    otherComments: ForumCommentInput[];
    posts: Record<string, { title?: string | null; user_id?: string | null }>;
    lookups: ForumLookups;
    /** unread rows in public.notifications (the Community badge) */
    unread: number;
}

const chunked = async <T,>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown; error: PgError }>): Promise<T[]> => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const out: T[] = [];
    for (let i = 0; i < unique.length; i += 80) {
        const { data, error } = await run(unique.slice(i, i + 80));
        if (!error && Array.isArray(data)) out.push(...(data as T[]));
    }
    return out;
};

/**
 * Likes / comments on the user's posts and comments (public.notifications), replies in threads the user joined,
 * and the names / titles / snippets to show them.
 */
export async function fetchForum(uid: string): Promise<ForumData | null> {
    const since = windowStartIso();
    const [rowsRes, mineRes, unreadRes] = await Promise.all([
        supabase.from('notifications').select('id,user_id,type,post_id,comment_id,source_user_id,created_at,is_read')
            .eq('user_id', uid).gte('created_at', since).order('created_at', { ascending: false }).limit(150),
        supabase.from('forum_comments').select('post_id,created_at').eq('user_id', uid).gte('created_at', since)
            .order('created_at', { ascending: false }).limit(100),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('is_read', false),
    ]);
    if (rowsRes.error && isMissing(rowsRes.error)) return null;
    const rows = ((rowsRes.data || []) as ForumRowInput[]);
    const myComments = ((mineRes.data || []) as Array<{ post_id: string; created_at: string }>);
    const joinedPostIds = Array.from(new Set(myComments.map(c => c.post_id).filter(Boolean))).slice(0, 40);

    const postIds = Array.from(new Set([...rows.map(r => r.post_id || ''), ...joinedPostIds].filter(Boolean)));
    const posts = await chunked<{ id: string; title: string | null; user_id: string | null }>(postIds, ids => supabase.from('forum_posts').select('id,title,user_id').in('id', ids));
    const postMap: ForumData['posts'] = Object.fromEntries(posts.map(p => [p.id, { title: p.title, user_id: p.user_id }]));
    const threadIds = joinedPostIds.filter(id => postMap[id] && postMap[id].user_id !== uid);
    const others = threadIds.length
        ? ((await supabase.from('forum_comments').select('id,post_id,user_id,content,created_at').in('post_id', threadIds).neq('user_id', uid)
            .gte('created_at', since).order('created_at', { ascending: false }).limit(150)).data || []) as ForumCommentInput[]
        : [];
    const commentIds = rows.map(r => r.comment_id || '').filter(Boolean);
    const comments = await chunked<{ id: string; content: string | null }>(commentIds, ids => supabase.from('forum_comments').select('id,content').in('id', ids));
    const authorIds = [...rows.map(r => r.source_user_id || ''), ...others.map(c => c.user_id)];
    let authors = await chunked<{ id: string; name: string | null }>(authorIds, ids => supabase.from('forum_authors').select('id,name').in('id', ids));
    if (!authors.length && authorIds.length) authors = await chunked(authorIds, ids => supabase.from('profiles').select('id,name').in('id', ids));
    return {
        rows,
        myComments,
        otherComments: others,
        posts: postMap,
        lookups: {
            authors: Object.fromEntries(authors.map(a => [a.id, a.name || 'A member'])),
            postTitles: Object.fromEntries(posts.map(p => [p.id, p.title || ''])),
            comments: Object.fromEntries(comments.map(c => [c.id, c.content || ''])),
        },
        unread: unreadRes.error ? rows.filter(r => !r.is_read).length : unreadRes.count || 0,
    };
}

/** Marks community notifications read in the database (ids = null: all of them), like the Community screen does. */
export async function markForumRead(uid: string, ids: string[] | null): Promise<boolean> {
    if (ids && !ids.length) return true;
    let q = supabase.from('notifications').update({ is_read: true }).eq('user_id', uid).eq('is_read', false);
    if (ids) q = q.in('id', ids.slice(0, 200));
    const { error } = await q;
    return !error;
}

const LABEL_SELECT = 'id, type, job_id, title:data->>title, invoiceNumber:data->>invoiceNumber, estimateNumber:data->>estimateNumber';

/** The reminder log of the window, with document labels and links. */
export async function fetchReminders(uid: string): Promise<ReminderInput[] | null> {
    const { data, error } = await supabase
        .from('reminders')
        .select('id,user_id,kind,document_id,job_id,status,reason,to_email,sent_at,created_at')
        .eq('user_id', uid)
        .gte('created_at', windowStartIso())
        .order('created_at', { ascending: false })
        .limit(150);
    if (error) return null;
    const rows = (data || []) as ReminderInput[];
    const docs = await chunked<any>(rows.map(r => r.document_id || ''), ids => supabase.from('documents').select(LABEL_SELECT).in('id', ids));
    const byId = new Map(docs.map(d => [String(d.id), docInputOf(d)]));
    const jobIds = rows.filter(r => !r.document_id && r.job_id).map(r => r.job_id as string);
    const jobs = await chunked<{ id: string; name: string | null }>(jobIds, ids => supabase.from('jobs').select('id,name').in('id', ids));
    const jobNames = new Map(jobs.map(j => [j.id, j.name || '']));
    return rows.map(r => {
        const doc = r.document_id ? byId.get(r.document_id) : undefined;
        return {
            ...r,
            label: doc ? docLabel(doc) : (r.job_id && jobNames.get(r.job_id)) || null,
            path: doc ? docPath(doc) : r.job_id ? `/jobs/${r.job_id}` : null,
        };
    });
}

/** Punch items the client answered in the portal during the window (null = punch lists not in the database). */
export async function fetchPunchFeedback(uid: string): Promise<PunchFeedbackInput[] | null> {
    const since = windowStartIso();
    const { data, error } = await supabase
        .from('punch_items')
        .select('id, job_id, title, status, verified_by, verified_at, client_note, client_note_at')
        .eq('user_id', uid)
        .or(`and(verified_by.eq.client,verified_at.gte.${since}),client_note_at.gte.${since}`)
        .order('updated_at', { ascending: false })
        .limit(100);
    if (error) return null;
    return ((data || []) as any[]).map(r => ({
        id: String(r.id), jobId: String(r.job_id || ''), title: String(r.title || ''), status: String(r.status || ''),
        verifiedBy: r.verified_by ?? null, verifiedAt: r.verified_at ?? null, clientNote: r.client_note ?? null, clientNoteAt: r.client_note_at ?? null,
    }));
}

/** Papers with an expiry date in the next 31 days or already expired (null = papers vault not in the database). */
export async function fetchExpiringPapers(uid: string): Promise<PaperInput[] | null> {
    const horizon = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from('company_papers')
        .select('id, user_id, kind, title, expires_on, reminder_offsets, remind')
        .eq('user_id', uid)
        .is('archived_at', null)
        .not('expires_on', 'is', null)
        .gte('expires_on', windowStartDay())
        .lte('expires_on', horizon)
        .limit(200);
    if (error) return null;
    return ((data || []) as any[]).map(r => ({
        id: String(r.id), userId: r.user_id ?? null, title: String(r.title || ''), kind: String(r.kind || ''), expiresOn: r.expires_on ?? null,
        offsets: Array.isArray(r.reminder_offsets) ? r.reminder_offsets : null, remind: r.remind !== false,
    }));
}

/** Service plan visits of the next few days (null = service plans not in the database). */
export async function fetchUpcomingVisits(uid: string): Promise<ServiceVisitInput[] | null> {
    // a day of slack on both sides for time zones (the model keeps only today .. +2 local days)
    const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const until = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from('service_visits')
        .select('id, job_id, scheduled_for, status, service_plans(name, client_name)')
        .eq('user_id', uid)
        .eq('status', 'scheduled')
        .gte('scheduled_for', from)
        .lte('scheduled_for', until)
        .limit(100);
    if (error) return null;
    return ((data || []) as any[]).map(r => {
        const plan = Array.isArray(r.service_plans) ? r.service_plans[0] : r.service_plans;
        return { id: String(r.id), jobId: r.job_id ?? null, planName: String(plan?.name || 'Service visit'), clientName: plan?.client_name ?? null, scheduledFor: String(r.scheduled_for || ''), status: String(r.status || '') };
    });
}

/** Connected Gmail accounts (status needs_reconnect = sending stopped). */
export async function fetchGmailAccounts(uid: string): Promise<GmailAccountInput[] | null> {
    const { data, error } = await supabase.from('user_gmail_accounts').select('id,user_id,gmail_address,status,updated_at').eq('user_id', uid).limit(20);
    if (error) return null;
    return (data || []) as GmailAccountInput[];
}

/** Missed clock-outs of the crew (null = crew clock-in isn't in the database yet, or the read failed). */
export async function fetchCrewMissed(): Promise<CrewMissedInput[] | null> {
    if (crewFeatureState() !== 'ready') return null; // not in the database (or not checked yet): no request
    const rows = await fetchMissedClockOuts();
    if (!rows) return null;
    return rows.map(r => ({ punchId: r.punchId, memberName: r.memberName, jobName: r.jobName, since: r.since, overdueAt: r.overdueAt }));
}
