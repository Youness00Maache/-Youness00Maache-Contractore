/**
 * Pipeline board (/pipeline, every plan): jobs and quote requests in columns Requests → Estimate sent → Approved →
 * In progress → Invoiced → Paid. Columns are computed from the documents' statuses (lib/pipeline.ts), so cards move by
 * themselves; there is no dragging. One-tap actions reuse the app's windows: the Request window (Create client & job),
 * the Share window (follow up), the document's reminders, and Mark as paid.
 * Phones: one column at a time, swipe sideways or tap a stage tab. Computers: the whole board.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Client, FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import {
    PIPELINE_STAGES, buildPipeline, filterCards, type PipelineAction, type PipelineCard as Card, type PipelineColumn, type PipelineStage,
} from '../../lib/pipeline.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { ConfirmDialog, EmptyState, InlineError, PageHeader } from '../viewKit.tsx';
import { PlusIcon, RefreshCwIcon, SearchIcon, BriefcaseIcon } from '../Icons.tsx';
import { MobileHeaderSlot, useHeaderSlot } from '../AppNav.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { toast } from '../Toast.tsx';
import RequestDetailModal, { type EstimateHandoff } from '../requests/RequestDetailModal.tsx';
import type { ConvertResult } from '../requests/requestsApi.ts';
import type { QuoteRequest } from '../requests/requestLogic.ts';
import PipelineCard from './PipelineCard.tsx';
import { FollowUpShare, RemindersSheet } from './FollowUp.tsx';
import { patchCachedRequest, toFormSummary, toPipelineRequest } from './pipelineApi.ts';
import { usePipelineData } from './usePipelineData.ts';
import { PipelineIcon } from './PipelineIcon.tsx';
import { STAGE_STYLE, shortMoney } from './pipelineUi.tsx';

type BoardJob = Job & { clientId?: string | null };

export interface PipelineViewProps {
    jobs: BoardJob[];
    clients: Client[];
    profile: UserProfile;
    plan: string;
    isOnline: boolean;
    /** the app's document list: when it changes (saved, paid, signed) the board reads the server again */
    refreshKey?: unknown;
    onBack: () => void;
    onNewJob: () => void;
    onOpenJob: (jobId: string) => void;
    onOpenDocument: (form: FormDataType) => void;
    onMarkPaid: (form: FormDataType) => void;
    onJobStatusChange: (jobId: string, status: Job['status']) => void | Promise<void>;
    /** request window (same as the dashboard inbox) */
    checkJobLimit: () => boolean;
    onRequestConverted: (result: ConvertResult) => void;
    onUpgrade: (reason?: string) => void;
    onDraftEstimate: (handoff: EstimateHandoff) => void;
}

const STAGE_KEY = 'cd_pipeline_stage';

const Column: React.FC<{
    column: PipelineColumn;
    colRef: (el: HTMLElement | null) => void;
    onAction: (a: PipelineAction, c: Card) => void;
    busyKey: string | null;
    filtered: boolean;
    footer?: React.ReactNode;
}> = ({ column, colRef, onAction, busyKey, filtered, footer }) => {
    const { meta, cards, total, attention } = column;
    const style = STAGE_STYLE[column.stage];
    return (
        <section
            ref={colRef}
            aria-labelledby={`pipeline-col-${column.stage}`}
            className="flex w-[calc(100vw-3.5rem)] max-w-[22rem] shrink-0 snap-start flex-col sm:w-80 xl:w-auto xl:min-w-[13.5rem] xl:max-w-none xl:flex-1 xl:shrink"
        >
            <span className={`h-[3px] rounded-full ${style.bar}`} aria-hidden />
            <header className="flex items-baseline justify-between gap-2 px-1 pb-2 pt-2">
                <h2 id={`pipeline-col-${column.stage}`} className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {meta.label} <span className="ml-0.5 font-medium tabular-nums text-muted-foreground">{cards.length}</span>
                </h2>
                {total !== null && total > 0 && (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" title={`${meta.totalLabel}`}>
                        {shortMoney(total)} <span className="text-[11px] font-medium text-muted-foreground">{meta.totalLabel}</span>
                    </span>
                )}
            </header>
            {attention > 0 && <p className="-mt-1 mb-2 px-1 text-xs font-medium text-warning">{attention} {attention === 1 ? 'needs' : 'need'} you</p>}
            <div className="flex min-h-[7rem] flex-1 flex-col gap-2 rounded-2xl bg-muted/50 p-2 xl:p-1.5">
                {cards.length === 0 ? (
                    <p className="m-auto max-w-[15rem] px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                        {filtered ? 'Nothing matches here.' : meta.empty}
                    </p>
                ) : cards.map(card => (
                    <PipelineCard key={card.key} card={card} onAction={onAction} busy={busyKey === card.key} />
                ))}
                {footer}
            </div>
        </section>
    );
};

const BoardSkeleton: React.FC = () => (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" aria-busy="true" aria-label="Loading">
        {PIPELINE_STAGES.map(s => (
            <div key={s.id} className="w-[calc(100vw-3.5rem)] max-w-[22rem] shrink-0 sm:w-80 xl:w-auto xl:min-w-[13.5rem] xl:flex-1">
                <div className={`h-[3px] rounded-full ${STAGE_STYLE[s.id].bar} opacity-40`} />
                <div className="skeleton mb-2 mt-3 h-4 w-24" />
                <div className="space-y-2 rounded-2xl bg-muted/50 p-2">
                    {[0, 1].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}
                </div>
            </div>
        ))}
    </div>
);

const PipelineView: React.FC<PipelineViewProps> = ({
    jobs, clients, profile, plan, isOnline, refreshKey, onBack, onNewJob, onOpenJob, onOpenDocument, onMarkPaid, onJobStatusChange,
    checkJobLimit, onRequestConverted, onUpgrade, onDraftEstimate,
}) => {
    const { data, setData, loading, error, reload } = usePipelineData(refreshKey);
    const [query, setQuery] = useState('');
    const [attentionOnly, setAttentionOnly] = useState(false);
    const [showOlderPaid, setShowOlderPaid] = useState(false);
    const [openRequestId, setOpenRequestId] = useState<string | null>(null);
    const [shareCard, setShareCard] = useState<Card | null>(null);
    const [remindersCard, setRemindersCard] = useState<Card | null>(null);
    const [inactiveCard, setInactiveCard] = useState<Card | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const headerTitleSlot = useHeaderSlot('title');

    const today = todayYMD();
    const board = useMemo(() => buildPipeline({
        jobs: jobs.map(j => ({ id: j.id, name: j.name, clientName: j.clientName, clientId: j.clientId ?? null, status: j.status, createdAt: j.createdAt ?? null, startDate: j.startDate })),
        docs: data?.docs || [],
        requests: data?.requests ?? null,
        today,
    }, { showOlderPaid }), [jobs, data, today, showOlderPaid]);

    const filtering = attentionOnly || query.trim() !== '';
    const visible = useMemo(() => new Set(filterCards(board.cards, query, attentionOnly).map(c => c.key)), [board.cards, query, attentionOnly]);
    const columns = useMemo(
        () => board.columns.map(col => {
            const cards = col.cards.filter(c => visible.has(c.key));
            return { ...col, cards, attention: cards.filter(c => c.alert).length };
        }),
        [board.columns, visible],
    );
    const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);

    // ---- phones: one column per screen, tabs follow the swipe
    const boardRef = useRef<HTMLDivElement>(null);
    const colEls = useRef<Partial<Record<PipelineStage, HTMLElement | null>>>({});
    const [activeStage, setActiveStage] = useState<PipelineStage>(() => {
        try { return (sessionStorage.getItem(STAGE_KEY) as PipelineStage) || 'request'; } catch { return 'request'; }
    });
    const raf = useRef(0);
    const placed = useRef(false);
    const scrollToStage = (stage: PipelineStage, smooth = true) => {
        const el = boardRef.current;
        const col = colEls.current[stage];
        if (!el || !col) return;
        const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
        const left = Math.max(0, Math.min(col.offsetLeft - pad, el.scrollWidth - el.clientWidth));
        el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
        // a smooth scroll that never arrives (reduced motion, background tab, an interrupted swipe): jump there
        if (smooth) window.setTimeout(() => { if (Math.abs(el.scrollLeft - left) > 4) el.scrollTo({ left, behavior: 'auto' }); }, 700);
    };
    /** while a tapped tab scrolls the board, the columns passing by don't take the tab over */
    const tabScrollUntil = useRef(0);
    const pickStage = (stage: PipelineStage, smooth = true) => {
        setActiveStage(stage);
        try { sessionStorage.setItem(STAGE_KEY, stage); } catch { /* ignore */ }
        tabScrollUntil.current = Date.now() + 900;
        scrollToStage(stage, smooth);
    };
    const onBoardScroll = () => {
        if (raf.current || Date.now() < tabScrollUntil.current) return;
        raf.current = window.setTimeout(() => {
            raf.current = 0;
            const el = boardRef.current;
            if (!el || el.scrollWidth <= el.clientWidth + 4) return;
            const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
            let best: PipelineStage | null = null;
            let bestDist = Infinity;
            for (const s of PIPELINE_STAGES) {
                const col = colEls.current[s.id];
                if (!col) continue;
                const dist = Math.abs(col.offsetLeft - pad - el.scrollLeft);
                if (dist < bestDist) { bestDist = dist; best = s.id; }
            }
            if (best) {
                const next = best;
                setActiveStage(prev => (prev === next ? prev : next));
                try { sessionStorage.setItem(STAGE_KEY, next); } catch { /* ignore */ }
            }
        }, 60);
    };
    useEffect(() => () => window.clearTimeout(raf.current), []);
    // keep the active stage tab visible in its strip
    const tabStripRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const strip = tabStripRef.current;
        const tab = strip?.querySelector<HTMLElement>(`[data-stage="${activeStage}"]`);
        if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
        const pad = 16;
        if (tab.offsetLeft - pad < strip.scrollLeft) strip.scrollLeft = tab.offsetLeft - pad;
        else if (tab.offsetLeft + tab.offsetWidth + pad > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = tab.offsetLeft + tab.offsetWidth + pad - strip.clientWidth;
    }, [activeStage]);
    // first load on a phone: open the remembered column, else the first one that needs you, else the first with cards
    useEffect(() => {
        if (placed.current || !data) return;
        placed.current = true;
        let remembered: string | null = null;
        try { remembered = sessionStorage.getItem(STAGE_KEY); } catch { /* ignore */ }
        const start = (remembered && PIPELINE_STAGES.some(s => s.id === remembered) ? remembered as PipelineStage : null)
            ?? board.columns.find(c => c.attention > 0)?.stage
            ?? board.columns.find(c => c.cards.length > 0)?.stage
            ?? 'request';
        window.setTimeout(() => { setActiveStage(start); scrollToStage(start, false); }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // ---- actions
    const requestRow: QuoteRequest | null = openRequestId ? data?.requestRows.find(r => r.id === openRequestId) ?? null : null;
    const updateRequest = (req: QuoteRequest | null, removedId?: string) => {
        patchCachedRequest(req, removedId);
        setData(prev => {
            if (!prev) return prev;
            const rows = prev.requestRows.filter(r => r.id !== (req?.id ?? removedId));
            if (req && req.status !== 'archived') rows.unshift(req);
            return { ...prev, requestRows: rows, requests: prev.requests ? rows.map(toPipelineRequest) : null };
        });
    };

    /** The app changes the status (and shows its own message when that fails); the card then moves by itself. */
    const setJobStatus = async (card: Card, status: Job['status']) => {
        if (!card.jobId) return;
        if (!isOnline) { toast.error("You're offline. Reconnect to change the job status."); return; }
        setBusyKey(card.key);
        try {
            await onJobStatusChange(card.jobId, status);
        } finally {
            setBusyKey(null);
        }
    };

    const onAction = (action: PipelineAction, card: Card) => {
        switch (action) {
            case 'convert':
            case 'open_request':
                if (card.requestId) setOpenRequestId(card.requestId);
                break;
            case 'open_job':
                if (card.jobId) onOpenJob(card.jobId);
                break;
            case 'open_doc':
                if (card.doc) onOpenDocument(toFormSummary(card.doc));
                else if (card.jobId) onOpenJob(card.jobId);
                break;
            case 'follow_up':
                if (!isOnline) { toast.error("You're offline. Reconnect to send a follow-up."); break; }
                if (card.doc) setShareCard(card);
                break;
            case 'reminders':
                if (card.doc) setRemindersCard(card);
                break;
            case 'mark_paid':
                if (card.doc) onMarkPaid(toFormSummary(card.doc));
                break;
            case 'finish_job':
                void setJobStatus(card, 'completed');
                break;
            case 'set_inactive':
                setInactiveCard(card);
                break;
        }
    };

    // ---- header
    const total = board.cards.length;
    const summary = loading && !data
        ? 'Loading your jobs…'
        : total === 0
            ? 'Every job by stage, from request to paid.'
            : `${shortMoney(board.openValue)} open · ${board.attention ? `${board.attention} ${board.attention === 1 ? 'needs' : 'need'} you` : 'nothing waiting on you'}`;
    const hiddenBits = [
        board.hidden.lost ? `${board.hidden.lost} with every estimate declined` : '',
        board.hidden.inactive ? `${board.hidden.inactive} inactive` : '',
        board.hidden.closed ? `${board.hidden.closed} completed with nothing billed` : '',
    ].filter(Boolean);
    const refreshButton = (
        <button type="button" onClick={() => void reload(true)} disabled={loading || !isOnline} className="btn btn-ghost h-10 w-10 rounded-full p-0" aria-label="Refresh the board" title="Refresh">
            <RefreshCwIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
    );

    const paidFooter = (board.hidden.olderPaid > 0 || showOlderPaid) ? (
        <button type="button" onClick={() => setShowOlderPaid(v => !v)} className="mt-1 rounded-lg px-2 py-2 text-xs font-semibold text-primary hover:bg-card">
            {showOlderPaid ? 'Show the last 30 days only' : `Show ${board.hidden.olderPaid} older paid ${board.hidden.olderPaid === 1 ? 'job' : 'jobs'}`}
        </button>
    ) : null;

    const empty = !loading && data && total === 0 && !filtering && board.hidden.olderPaid === 0;
    const shareJob = shareCard?.jobId ? jobById.get(shareCard.jobId) : undefined;

    return (
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {/* phones: title and quick actions in the app bar */}
            <MobileHeaderSlot name="title">
                <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground">Pipeline</h1>
                <p className="truncate text-xs leading-tight text-muted-foreground">{summary}</p>
            </MobileHeaderSlot>
            {headerTitleSlot && (
                <MobileHeaderSlot name="actions">
                    {refreshButton}
                    <HelpButton topic="pipeline" iconOnly className="!h-9 !w-9" />
                </MobileHeaderSlot>
            )}
            <div className={headerTitleSlot ? 'hidden md:block' : ''}>
                <PageHeader
                    title="Pipeline"
                    icon={<PipelineIcon className="h-6 w-6" />}
                    subtitle={summary}
                    onBack={onBack}
                    actions={<>{refreshButton}<HelpButton topic="pipeline" /></>}
                />
            </div>

            {error && <div className="mb-4"><InlineError onRetry={() => void reload(true)}>{error}</InlineError></div>}

            {empty ? (
                <EmptyState
                    icon={<BriefcaseIcon />}
                    title="Nothing in your pipeline yet"
                    description="Create a job, send an estimate or share your request-a-quote link. Every job shows up here and moves by itself as you send estimates and invoices and get paid."
                    action={<button type="button" className="btn btn-primary" onClick={onNewJob}><PlusIcon className="h-4 w-4" /> New job</button>}
                />
            ) : (
                <>
                    {/* search + needs attention */}
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1 sm:max-w-sm">
                            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search jobs, clients, numbers..."
                                className="input h-10 py-2 pl-10"
                                aria-label="Search the pipeline"
                            />
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={attentionOnly}
                            onClick={() => setAttentionOnly(v => !v)}
                            className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition ${attentionOnly ? 'border-warning/50 bg-warning/15 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
                        >
                            <span className={`h-2 w-2 rounded-full ${board.attention ? 'bg-warning' : 'bg-border'}`} aria-hidden />
                            Needs attention <span className="tabular-nums">{board.attention}</span>
                        </button>
                    </div>

                    {/* phones: stage tabs (the columns swipe) */}
                    <div ref={tabStripRef} className="relative -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Stages">
                        {columns.map(col => {
                            const on = activeStage === col.stage;
                            return (
                                <button
                                    key={col.stage}
                                    data-stage={col.stage}
                                    type="button"
                                    role="tab"
                                    aria-selected={on}
                                    onClick={() => pickStage(col.stage)}
                                    className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition ${on ? 'border-foreground/20 bg-card text-foreground shadow-soft' : 'border-transparent bg-muted/60 text-muted-foreground'}`}
                                >
                                    <span className={`h-2 w-2 rounded-full ${STAGE_STYLE[col.stage].bar}`} aria-hidden />
                                    {col.meta.label}
                                    <span className="tabular-nums opacity-70">{col.cards.length}</span>
                                    {col.attention > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-warning" aria-label={`${col.attention} need you`} />}
                                </button>
                            );
                        })}
                    </div>

                    {!data && loading ? <BoardSkeleton /> : (
                        <div
                            ref={boardRef}
                            onScroll={onBoardScroll}
                            className="relative -mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto scroll-pl-4 px-4 pb-3 sm:-mx-6 sm:scroll-pl-6 sm:px-6 md:snap-none lg:-mx-8 lg:px-8 xl:gap-2"
                        >
                            {columns.map(col => (
                                <Column
                                    key={col.stage}
                                    column={col}
                                    colRef={(el) => { colEls.current[col.stage] = el; }}
                                    onAction={onAction}
                                    busyKey={busyKey}
                                    filtered={filtering}
                                    footer={col.stage === 'paid' ? paidFooter : undefined}
                                />
                            ))}
                        </div>
                    )}

                    {(hiddenBits.length > 0 || data?.truncated) && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            {hiddenBits.length > 0 && <>Not on the board: {hiddenBits.join(', ')}. Set a job back to Active on its page to bring it back. </>}
                            {data?.truncated && 'Only your newest 50,000 documents are read.'}
                        </p>
                    )}
                </>
            )}

            {/* windows */}
            <RequestDetailModal
                request={requestRow}
                onClose={() => setOpenRequestId(null)}
                onChanged={(req) => updateRequest(req)}
                onDeleted={(id) => updateRequest(null, id)}
                plan={plan}
                checkJobLimit={checkJobLimit}
                onConverted={onRequestConverted}
                onOpenJob={(jobId) => { setOpenRequestId(null); onOpenJob(jobId); }}
                onUpgrade={(reason) => onUpgrade(reason)}
                onDraftEstimate={onDraftEstimate}
            />
            {shareCard && (
                <FollowUpShare doc={shareCard.doc} job={shareJob} profile={profile} clients={clients} onClose={() => setShareCard(null)} />
            )}
            {remindersCard && (
                <RemindersSheet
                    doc={remindersCard.doc}
                    clientId={remindersCard.clientId}
                    title={remindersCard.doc?.number || remindersCard.title}
                    onClose={() => setRemindersCard(null)}
                />
            )}
            <ConfirmDialog
                open={!!inactiveCard}
                title="Move to Inactive?"
                message={<>“{inactiveCard?.title}” leaves the board. Its documents stay as they are, and you can set it back to Active on the job page.</>}
                confirmLabel="Move to Inactive"
                busy={!!inactiveCard && busyKey === inactiveCard.key}
                onCancel={() => setInactiveCard(null)}
                onConfirm={() => {
                    const card = inactiveCard;
                    if (!card) return;
                    void setJobStatus(card, 'inactive').finally(() => setInactiveCard(null));
                }}
            />
        </div>
    );
};

export default PipelineView;
