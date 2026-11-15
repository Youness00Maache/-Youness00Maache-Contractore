/**
 * Job page › Timeline: everything that happened on the job, newest first (or oldest first), cut into days.
 *  - built in the browser from data the app already reads (documents, photos, notes, daily reports, punch list, tasks,
 *    questions, selections, subcontracts, quotes, warranty, feedback, reminders, crew time): see lib/timeline
 *  - a tool that is not set up on the account (or can't be read now) is simply left out
 *  - "Log a conversation": a typed or dictated note becomes a Note document on the job (and, with Tasks, one task)
 *  - filters: group chips with counts, search, this week / this month / all; 50 entries at a time
 * Owner-only: nothing on this tab goes to the client's page.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { describeError, isPlanLimitError, planLimitMessage } from '../../lib/account.ts';
import { applyOutboxOverlay, type OutboxItem, type QueueInput } from '../../lib/offline/outboxModel.ts';
import { signedPhotoUrls } from '../photos/photosApi.ts';
import { PAGE_SIZE, buildEvents, buildView, groupCounts } from '../../lib/timeline/aggregate.ts';
import { saveConversationNote, saveFollowUpTask } from '../../lib/timeline/noteSave.ts';
import type { TimelineFeatures } from '../../lib/timeline/timelineApi.ts';
import { dayOf, safeTimezone } from '../../lib/timeline/timelineHelpers.ts';
import {
    GROUP_LABELS, TIMELINE_GROUPS,
    type TimelineContext, type TimelineDoc, type TimelineEvent, type TimelineGroup, type TimelineLink, type TimelineOrder, type TimelineRange,
} from '../../lib/timeline/timelineTypes.ts';
import { toast } from '../Toast.tsx';
import { ClockIcon, RefreshCwIcon, SearchIcon, SortIcon } from '../Icons.tsx';
import { Skeleton } from '../ui/Skeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { TASKS_PREMIUM_REASON } from '../tasks/taskUi.tsx';
import QuickNote from './QuickNote.tsx';
import TimelineList from './TimelineList.tsx';
import { GroupMark } from './timelineUi.tsx';
import { useJobTimeline } from './useJobTimeline.ts';

export interface JobTimelinePanelProps {
    job: Job & { clientId?: string | null };
    userId: string;
    profile: UserProfile | null;
    plan: string;
    isOnline: boolean;
    /** which optional tools this account has: a tool that is not there is left out of the timeline */
    features: TimelineFeatures;
    /** the documents the job page already loaded (shown when the fuller read fails or there is no connection) */
    loadedDocuments: readonly FormDataType[];
    /** documents waiting to sync (offline outbox): they show with "Waiting to sync" */
    outboxItems: readonly OutboxItem[];
    /** the outbox's `queue` (a note written offline waits on this device) */
    queueNote?: (input: QueueInput) => Promise<unknown>;
    /** the job itself is still waiting to sync */
    jobWaiting?: boolean;
    onOpenDocument: (docId: string, formType: string) => void;
    onOpenTab: (tab: Extract<TimelineLink, { type: 'tab' }>['tab']) => void;
    onUpgrade: (reason?: string) => void;
    /** a note was saved on the account: the Documents tab reads the job's documents again */
    onDocumentsChanged?: () => void;
}

const RANGES: ReadonlyArray<[TimelineRange, string]> = [['week', 'This week'], ['month', 'This month'], ['all', 'All']];

const formToDoc = (f: FormDataType): TimelineDoc => ({ id: f.id, jobId: f.jobId, type: String(f.type), createdAt: f.createdAt, data: (f.data || {}) as Record<string, any> });
const deviceZone = (): string => { try { return safeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return safeTimezone(''); } };

const JobTimelinePanel: React.FC<JobTimelinePanelProps> = ({
    job, userId, profile, plan, isOnline, features, loadedDocuments, outboxItems, queueNote, jobWaiting, onOpenDocument, onOpenTab, onUpgrade, onDocumentsChanged,
}) => {
    const paid = isPaidTier(plan);
    const tz = useMemo(deviceZone, []);
    const fallbackDocs = useMemo(() => loadedDocuments.map(formToDoc), [loadedDocuments]);
    const { load, loading, reload } = useJobTimeline({ jobId: job.id, userId, features, online: isOnline, fallbackDocs });

    // notes written here stay on the list until the next read brings them back from the account
    const [extraDocs, setExtraDocs] = useState<TimelineDoc[]>([]);
    const docs = useMemo<TimelineDoc[]>(() => {
        const byId = new Map<string, TimelineDoc>((load?.data.docs || []).map(d => [d.id, d]));
        for (const d of extraDocs) if (!byId.has(d.id)) byId.set(d.id, d);
        const base = [...byId.values()].map(d => ({ ...d, jobId: d.jobId || job.id }));
        const merged = applyOutboxOverlay(base as Array<TimelineDoc & { jobId: string }>, outboxItems, userId);
        const waiting = new Set(outboxItems.filter(i => (i.entity ?? 'document') === 'document' && i.userId === userId).map(i => i.docId));
        return merged.filter(d => d.jobId === job.id).map(d => ({ ...d, pending: waiting.has(d.id) || undefined }));
    }, [load, extraDocs, outboxItems, userId, job.id]);

    // build the entries after the first paint, so opening the tab never waits on them
    const [built, setBuilt] = useState<{ events: TimelineEvent[]; ctx: TimelineContext } | null>(null);
    useEffect(() => {
        if (!load) return;
        const ctx: TimelineContext = { tz, now: Date.now(), clientName: job.clientName, memberNames: load.memberNames };
        const handle = window.setTimeout(() => setBuilt({ events: buildEvents({ ...load.data, docs }, ctx), ctx }), 0);
        return () => window.clearTimeout(handle);
    }, [load, docs, tz, job.clientName]);

    // ---------------------------------------------------------------------------------------- filters
    const [groups, setGroups] = useState<TimelineGroup[]>([]);
    const [query, setQuery] = useState('');
    const [range, setRange] = useState<TimelineRange>('all');
    const [order, setOrder] = useState<TimelineOrder>('newest');
    const [limit, setLimit] = useState(PAGE_SIZE);
    useEffect(() => setLimit(PAGE_SIZE), [groups, query, range, order]);
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
    const toggle = useCallback((id: string) => setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);

    const view = useMemo(() => (built ? buildView(built.events, { filters: { groups, query, range }, order, limit }, built.ctx) : null), [built, groups, query, range, order, limit]);
    const existing = useMemo(() => (built ? groupCounts(built.events, {}, built.ctx) : null), [built]);
    const today = built ? dayOf(new Date(built.ctx.now).toISOString(), tz) || '' : '';

    // ---------------------------------------------------------------------------------------- photo thumbnails
    const [urls, setUrls] = useState<Record<string, string>>({});
    const asked = useRef(new Set<string>());
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        if (!view || !isOnline) return;
        const paths = Array.from(new Set(view.days.flatMap(d => d.events).flatMap(e => e.photos || []).map(p => p.thumbPath).filter(p => p && !asked.current.has(p))));
        if (!paths.length) return;
        paths.forEach(p => asked.current.add(p));
        signedPhotoUrls(paths).then(map => { if (mounted.current) setUrls(prev => ({ ...prev, ...map })); }).catch(() => paths.forEach(p => asked.current.delete(p)));
    }, [view, isOnline]);

    // ---------------------------------------------------------------------------------------- the quick note
    const addNote = async (text: string, makeTask: boolean): Promise<boolean> => {
        try {
            const saved = await saveConversationNote({ userId, job, profile, text, tz, queue: queueNote, jobWaiting });
            setExtraDocs(prev => [saved.doc, ...prev.filter(d => d.id !== saved.doc.id)]);
            if (saved.waiting) toast.success("Note saved on this device. It syncs when you're back online.");
            else { toast.success('Note added to the timeline.'); onDocumentsChanged?.(); }
            if (makeTask) {
                try {
                    await saveFollowUpTask({ userId, jobId: job.id, text, tasks: load?.data.tasks });
                    toast.success('Follow-up task added to Tasks.');
                    void reload();
                } catch (e) {
                    toast.error(`The note is saved, but the follow-up task was not: ${describeError(e, 'The task could not be saved.')}`);
                }
            }
            return true;
        } catch (e) {
            if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e));
            else toast.error(describeError(e, 'The note could not be saved.'));
            return false;
        }
    };

    const open = (link: TimelineLink) => { if (link.type === 'document') onOpenDocument(link.docId, link.formType); else onOpenTab(link.tab); };
    const total = built?.events.length ?? 0;
    const filtering = groups.length > 0 || query.trim() !== '' || range !== 'all';
    const clearFilters = () => { setGroups([]); setQuery(''); setRange('all'); };

    return (
        <section aria-labelledby="timeline-heading">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="timeline-heading" className="text-lg font-bold">Timeline</h2>
                <div className="flex items-center gap-1">
                    {built && total > 0 && <span className="mr-1 text-sm text-muted-foreground">{view && view.total !== total ? `${view.total} of ${total}` : total}</span>}
                    <button type="button" onClick={() => setOrder(o => (o === 'newest' ? 'oldest' : 'newest'))} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={order === 'newest' ? 'Showing newest first. Show oldest first' : 'Showing oldest first. Show newest first'}>
                        <SortIcon className="h-4 w-4" /> {order === 'newest' ? 'Newest first' : 'Oldest first'}
                    </button>
                    <button type="button" onClick={() => { void reload(); }} disabled={!isOnline || loading} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Refresh the timeline" title="Refresh">
                        <RefreshCwIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <HelpButton topic="job-timeline" />
                </div>
            </div>

            <QuickNote
                isOnline={isOnline}
                tasksReady={features.tasks}
                onSubmit={addNote}
                onTaskNeedsPremium={() => { if (paid) return true; onUpgrade(TASKS_PREMIUM_REASON); return false; }}
            />

            {!isOnline && <p className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">You&apos;re offline. This is what is saved on this device; photos and your other tools come back when you&apos;re online.</p>}
            {load && load.failed.length > 0 && isOnline && (
                <p className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">
                    Couldn&apos;t read {load.failed.join(', ')} just now. <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => { void reload(); }}>Try again</button>
                </p>
            )}

            {!built ? (
                <div className="space-y-4" aria-busy="true" aria-label="Loading the timeline">
                    {[0, 1, 2, 3].map(i => <div key={i} className="flex gap-3"><Skeleton className="h-4 w-12" /><Skeleton className="h-4 w-3" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}
                </div>
            ) : total === 0 ? (
                <EmptyState icon={ClockIcon} title="Nothing yet" description="Documents, photos and notes will show up here as the job goes on." />
            ) : (
                <>
                    <div className="mb-3 space-y-2.5">
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <div className="relative flex-1">
                                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the timeline..." className="input pl-10" aria-label="Search the timeline" />
                            </div>
                            <div className="flex shrink-0 gap-1 self-start rounded-xl bg-muted p-1" role="radiogroup" aria-label="Date range">
                                {RANGES.map(([id, label]) => (
                                    <button key={id} type="button" role="radio" aria-checked={range === id} onClick={() => setRange(id)}
                                        className={`h-8 rounded-lg px-3 text-sm font-medium transition ${range === id ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by kind">
                            <button type="button" aria-pressed={groups.length === 0} onClick={() => setGroups([])}
                                className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition ${groups.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>
                                All <span className="ml-1 opacity-70">{view ? Object.values(view.counts).reduce((s, n) => s + n, 0) : total}</span>
                            </button>
                            {TIMELINE_GROUPS.filter(g => (existing?.[g] || 0) > 0).map(g => {
                                const on = groups.includes(g);
                                return (
                                    <button key={g} type="button" aria-pressed={on} onClick={() => setGroups(prev => (prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]))}
                                        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${on ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>
                                        <GroupMark group={g} size={11} /> {GROUP_LABELS[g]} <span className="opacity-70">{view?.counts[g] ?? 0}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {view && view.total === 0 ? (
                        <EmptyState icon={SearchIcon} title="Nothing matches" description="Try other words, or a longer time." action={filtering ? <button type="button" className="btn btn-outline" onClick={clearFilters}>Clear filters</button> : undefined} />
                    ) : view ? (
                        <>
                            <TimelineList days={view.days} tz={tz} today={today} expanded={expanded} onToggle={toggle} urls={urls} onOpen={open} />
                            {view.hasMore && (
                                <div className="mt-4 flex justify-center">
                                    <button type="button" className="btn btn-outline" onClick={() => setLimit(n => n + PAGE_SIZE)}>
                                        {order === 'newest' ? 'Show earlier' : 'Show later'} ({Math.min(view.remaining, PAGE_SIZE)} of {view.remaining} more)
                                    </button>
                                </div>
                            )}
                        </>
                    ) : null}
                </>
            )}
        </section>
    );
};

export default JobTimelinePanel;
