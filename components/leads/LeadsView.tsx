/**
 * Leads (/leads, every plan): the quote-request inbox grown into a small sales pipeline. Every request from the public
 * request page and every lead you add by hand is one lead with a stage (New, Contacted, Appointment set, Quote sent,
 * Won, Lost), an optional budget, a follow-up date, appointments and files. Board by stage (computers: side by side,
 * phones: one stage at a time) or a plain list; search, source and "to follow up" filters apply to both.
 * Premium adds the strip with win rate, sources and quiet leads. Convert to job is the old inbox's one-tap path.
 *
 * While the database has no lead columns yet (useLeadsFeature is not 'ready') this screen is today's quote-request
 * inbox, unchanged (components/requests/RequestsInbox.tsx).
 */
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, InlineError, PageHeader, Segmented } from '../viewKit.tsx';
import { PlusIcon, RefreshCwIcon, SearchIcon } from '../Icons.tsx';
import { MobileHeaderSlot, useHeaderSlot } from '../AppNav.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { toast } from '../Toast.tsx';
import { todayYMD } from '../../utils/localDates.ts';
import type { RequestActionsProps } from '../requests/RequestDetailModal.tsx';
import type { LeadsFeatureState } from '../../lib/leads/leadsFeature.ts';
import { useLeadsStore } from '../../lib/leads/leadsStore.ts';
import { leadToolsForTier, needsFollowUp, sortLeads, type LeadSort } from '../../lib/leads/leadLogic.ts';
import { nextAppointment } from '../../lib/leads/appointmentLogic.ts';
import {
    NO_LEAD_FILTERS, filterLeads, isFiltering, leadBoardColumns, leadInsights, leadSourceOptions, leadsDueCount, type LeadFilters,
} from '../../lib/leads/leadViewLogic.ts';
import { LEAD_STAGES, type Appointment, type LeadOrigin, type LeadStage } from '../../lib/leads/leadTypes.ts';
import { LeadBoard, LeadList, type LeadFacts } from './LeadBoard.tsx';
import LeadInsights from './LeadInsights.tsx';
import LeadDetail from './LeadDetail.tsx';
import AddLeadModal from './LeadForm.tsx';
import { LeadsIcon } from './LeadsIcon.tsx';
import { cx } from './leadUi.tsx';

const RequestsInbox = lazy(() => import('../requests/RequestsInbox.tsx'));

export interface LeadsViewProps extends RequestActionsProps {
    userId: string;
    isOnline: boolean;
    feature: LeadsFeatureState;
    /** /leads?lead=<id>: open this lead once the list is read */
    initialLeadId?: string | null;
    onInitialLeadHandled?: () => void;
    onBack: () => void;
    /** Settings > Request-a-quote link */
    onOpenRequestLink: () => void;
    companyName?: string;
    logoUrl?: string;
    phone?: string;
}

const VIEW_KEY = 'cd_leads_view';
const SORTS: Array<{ value: LeadSort; label: string }> = [
    { value: 'newest', label: 'Newest first' },
    { value: 'follow_up', label: 'Follow-up date' },
    { value: 'budget', label: 'Biggest budget' },
    { value: 'stale', label: 'Quiet the longest' },
];

const readView = (): 'board' | 'list' => {
    try { return sessionStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'; } catch { return 'board'; }
};

const LeadsScreen: React.FC<LeadsViewProps> = ({
    userId, isOnline, plan, initialLeadId, onInitialLeadHandled, onBack, onOpenRequestLink,
    checkJobLimit, onConverted, onOpenJob, onUpgrade, onDraftEstimate,
}) => {
    const store = useLeadsStore(userId, true, isOnline);
    const tools = leadToolsForTier(plan);
    const headerTitleSlot = useHeaderSlot('title');
    const today = todayYMD();
    const [view, setViewState] = useState<'board' | 'list'>(readView);
    const [filters, setFilters] = useState<LeadFilters>(NO_LEAD_FILTERS);
    const [quietOnly, setQuietOnly] = useState(false);
    const [sort, setSort] = useState<LeadSort>('newest');
    const [showArchived, setShowArchived] = useState(false);
    const [showAllClosed, setShowAllClosed] = useState(false);
    const [openId, setOpenId] = useState<string | null>(initialLeadId ?? null);
    const [adding, setAdding] = useState(false);
    const [activeStage, setActiveStage] = useState<LeadStage>('new');
    const placed = useRef(false);

    const setView = (v: 'board' | 'list') => {
        setViewState(v);
        try { sessionStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    };

    const leads = store.leads;
    const all = useMemo(() => leads || [], [leads]);
    const appointments: readonly Appointment[] = store.appointments || [];
    const now = Date.now();

    const insights = useMemo(() => leadInsights(all), [all]);
    const quietIds = useMemo(() => new Set(tools.reminders ? insights.stale.map(l => l.id) : []), [tools.reminders, insights]);
    const due = useMemo(() => leadsDueCount(all, today), [all, today]);
    const sources = useMemo(() => leadSourceOptions(all), [all]);

    const inView = useMemo(() => {
        const list = filterLeads(all, filters, today);
        return quietOnly ? list.filter(l => quietIds.has(l.id)) : list;
    }, [all, filters, today, quietOnly, quietIds]);
    const board = useMemo(() => leadBoardColumns(inView, { showArchived }), [inView, showArchived]);
    const listLeads = useMemo(() => sortLeads(LEAD_STAGES.flatMap(s => board.columns[s]), sort), [board, sort]);
    const archivedCount = useMemo(() => leadBoardColumns(all).archived.length, [all]);
    const filtering = isFiltering(filters) || quietOnly;

    const nextAppointments = useMemo(() => {
        const map = new Map<string, Appointment>();
        for (const a of appointments) {
            if (!a.leadId || map.has(a.leadId)) continue;
            const next = nextAppointment(appointments, now, { leadId: a.leadId });
            if (next) map.set(a.leadId, next);
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appointments]);
    const facts: LeadFacts = useMemo(() => ({ today, now, nextAppointments, quietIds }), [today, now, nextAppointments, quietIds]);

    // phones: first look at the first stage that needs you
    useEffect(() => {
        if (placed.current || !leads) return;
        placed.current = true;
        const first = LEAD_STAGES.find(s => leads.some(l => l.stage === s && !l.archived && needsFollowUp(l, today)))
            ?? LEAD_STAGES.find(s => leads.some(l => l.stage === s && !l.archived));
        if (first) setActiveStage(first);
    }, [leads, today]);

    // /leads?lead=<id> (the Schedule, a link): open it once the list is read
    const handled = useRef<string | null>(null);
    useEffect(() => {
        if (!initialLeadId || !leads || handled.current === initialLeadId) return;
        handled.current = initialLeadId;
        if (leads.some(l => l.id === initialLeadId)) setOpenId(initialLeadId);
        else toast.info('That lead is not in your list any more.');
        onInitialLeadHandled?.();
    }, [initialLeadId, leads, onInitialLeadHandled]);

    const selected = openId && leads ? leads.find(l => l.id === openId) || null : null;
    // a lead deleted elsewhere: close its window
    useEffect(() => {
        if (openId && leads && !leads.some(l => l.id === openId)) setOpenId(null);
    }, [openId, leads]);

    const total = all.length;
    const openCount = insights.openCount;
    const summary = !leads
        ? (store.error ? 'Could not load your leads.' : 'Loading your leads…')
        : total === 0
            ? 'Requests from your link and people you add, from first contact to won.'
            : `${openCount} open · ${due ? `${due} to follow up` : 'nothing to follow up today'}`;

    const refreshButton = (
        <button type="button" onClick={() => void store.reload()} disabled={store.loading || !isOnline} className="btn btn-ghost h-10 w-10 rounded-full p-0" aria-label="Refresh your leads" title="Refresh">
            <RefreshCwIcon className={cx('h-4 w-4', store.loading && 'animate-spin')} />
        </button>
    );

    const empty = Boolean(leads) && total === 0;

    return (
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <MobileHeaderSlot name="title">
                <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground">Leads</h1>
                <p className="truncate text-xs leading-tight text-muted-foreground">{summary}</p>
            </MobileHeaderSlot>
            {headerTitleSlot && (
                <MobileHeaderSlot name="actions">
                    {refreshButton}
                    <HelpButton topic="leads" iconOnly className="!h-9 !w-9" />
                </MobileHeaderSlot>
            )}
            <div className={headerTitleSlot ? 'hidden md:block' : ''}>
                <PageHeader
                    title="Leads"
                    icon={<LeadsIcon className="h-6 w-6" />}
                    subtitle={summary}
                    onBack={onBack}
                    actions={<>{refreshButton}<HelpButton topic="leads" /></>}
                />
            </div>

            {store.error && !leads && <div className="mb-4"><InlineError onRetry={() => void store.reload()}>{store.error}</InlineError></div>}
            {!leads && !store.error && !isOnline && (
                <p className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">You’re offline. Your leads load when you’re back online.</p>
            )}

            {empty ? (
                <EmptyState
                    icon={<LeadsIcon />}
                    title="No leads yet"
                    description="New quote requests from your link and QR code land here. You can also add the person who just called you, so you remember to follow up."
                    action={(
                        <div className="flex flex-wrap justify-center gap-2">
                            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><PlusIcon className="h-4 w-4" /> Add a lead</button>
                            <button type="button" className="btn btn-outline" onClick={onOpenRequestLink}>Link &amp; QR code</button>
                        </div>
                    )}
                />
            ) : (
                <>
                    <LeadInsights
                        tools={tools}
                        insights={insights}
                        hasLeads={total > 0}
                        quietOnly={quietOnly}
                        onToggleQuiet={() => { setQuietOnly(v => !v); setView('list'); setSort('stale'); }}
                        onUpgrade={onUpgrade}
                    />

                    <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                        <div className="flex gap-2 lg:flex-1">
                            <div className="relative min-w-0 flex-1 lg:max-w-sm">
                                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="search"
                                    value={filters.query}
                                    onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
                                    placeholder="Search name, phone, address..."
                                    className="input h-10 py-2 pl-10"
                                    aria-label="Search leads"
                                />
                            </div>
                            <button type="button" className="btn btn-primary h-10 shrink-0" onClick={() => setAdding(true)}>
                                <PlusIcon className="h-4 w-4" /> Add<span className="hidden sm:inline"> lead</span>
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={filters.needsFollowUp}
                                onClick={() => setFilters(f => ({ ...f, needsFollowUp: !f.needsFollowUp }))}
                                className={cx('inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition', filters.needsFollowUp ? 'border-warning/50 bg-warning/15 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
                            >
                                <span className={cx('h-2 w-2 rounded-full', due ? 'bg-warning' : 'bg-border')} aria-hidden />
                                Needs follow-up <span className="tabular-nums">{due}</span>
                            </button>
                            {sources.length > 1 && (
                                <select
                                    className="input h-10 w-auto max-w-[8.5rem] py-1.5 text-sm sm:max-w-none"
                                    aria-label="Filter by source"
                                    value={filters.origin}
                                    onChange={e => setFilters(f => ({ ...f, origin: e.target.value as LeadOrigin | 'all' }))}
                                >
                                    <option value="all">All sources</option>
                                    {sources.map(s => <option key={s.origin} value={s.origin}>{s.label} ({s.count})</option>)}
                                </select>
                            )}
                            {view === 'list' && (
                                <select className="input h-10 w-auto py-1.5 text-sm" aria-label="Sort leads" value={sort} onChange={e => setSort(e.target.value as LeadSort)}>
                                    {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            )}
                            <div className="ml-auto lg:ml-0">
                                <Segmented<'board' | 'list'>
                                    ariaLabel="Leads view"
                                    value={view}
                                    onChange={setView}
                                    options={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }]}
                                />
                            </div>
                        </div>
                    </div>
                    {(archivedCount > 0 || filtering) && (
                        <p className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {filtering && (
                                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { setFilters(NO_LEAD_FILTERS); setQuietOnly(false); }}>Clear filters</button>
                            )}
                            {archivedCount > 0 && (
                                <button type="button" className="font-semibold hover:text-foreground hover:underline" onClick={() => setShowArchived(v => !v)} aria-pressed={showArchived}>
                                    {showArchived ? 'Hide' : 'Show'} {archivedCount} archived {archivedCount === 1 ? 'request' : 'requests'}
                                </button>
                            )}
                        </p>
                    )}

                    {!leads ? (
                        <div className="space-y-2" aria-busy="true" aria-label="Loading">
                            {[0, 1, 2].map(i => <div key={i} className="skeleton h-20 w-full rounded-xl" />)}
                        </div>
                    ) : view === 'board' ? (
                        <LeadBoard
                            columns={board.columns}
                            facts={facts}
                            filtered={filtering}
                            activeStage={activeStage}
                            onPickStage={setActiveStage}
                            onOpen={setOpenId}
                            onAdd={() => setAdding(true)}
                            showAllClosed={showAllClosed}
                            onToggleClosed={() => setShowAllClosed(v => !v)}
                        />
                    ) : (
                        <LeadList leads={listLeads} facts={facts} filtered={filtering} onOpen={setOpenId} onAdd={() => setAdding(true)} />
                    )}

                    <p className="mt-4 text-xs text-muted-foreground">
                        Requests from your link and QR code arrive in New. <button type="button" className="font-semibold text-primary hover:underline" onClick={onOpenRequestLink}>Link &amp; QR code</button>
                    </p>
                </>
            )}

            <LeadDetail
                lead={selected}
                userId={userId}
                appointments={appointments}
                today={today}
                onClose={() => setOpenId(null)}
                plan={plan}
                checkJobLimit={checkJobLimit}
                onConverted={onConverted}
                onOpenJob={onOpenJob}
                onUpgrade={onUpgrade}
                onDraftEstimate={onDraftEstimate}
            />
            <AddLeadModal open={adding} userId={userId} onClose={() => setAdding(false)} onCreated={(lead) => { setAdding(false); setOpenId(lead.id); }} />
        </div>
    );
};

/** Not switched on in the database (yet): today's quote-request inbox, exactly as on the dashboard. */
const InboxOnly: React.FC<LeadsViewProps> = ({ onBack, companyName, logoUrl, phone, plan, checkJobLimit, onConverted, onOpenJob, onUpgrade, onDraftEstimate }) => (
    <div className="page">
        <PageHeader title="Quote requests" subtitle="Everything sent from your request page, newest first." onBack={onBack} />
        <Suspense fallback={null}>
            <RequestsInbox
                plan={plan}
                companyName={companyName}
                logoUrl={logoUrl}
                phone={phone}
                checkJobLimit={checkJobLimit}
                onConverted={onConverted}
                onOpenJob={onOpenJob}
                onUpgrade={onUpgrade}
                onDraftEstimate={onDraftEstimate}
            />
        </Suspense>
    </div>
);

const LeadsView: React.FC<LeadsViewProps> = (props) => {
    if (props.feature === 'ready') return <LeadsScreen {...props} />;
    if (props.feature === 'unknown' && props.isOnline) {
        return (
            <div className="page" aria-busy="true" aria-label="Loading">
                <div className="skeleton h-10 w-48" />
                <div className="mt-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="skeleton h-20 w-full rounded-xl" />)}</div>
            </div>
        );
    }
    return <InboxOnly {...props} />;
};

export default LeadsView;
