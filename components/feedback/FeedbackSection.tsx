/**
 * Settings › Request-a-quote link › "Client feedback": every response from clients (stars, comment, name, job, date,
 * waiting or answered), the average and how the stars are spread, and the actions on each one (components/feedback/FeedbackRow.tsx).
 * A closed line with a one-line summary ("4.8 from 12 · 2 waiting · 3 on your page"); it opens in place.
 * Hidden until the database has the feature (lib/feedback/feedbackApi.ts useFeedbackFeature). Asking a client is Premium
 * (the "Ask for feedback" button on a job page); reading and managing what came in works on every plan.
 *
 * Mount (Settings.tsx): <FeedbackSection plan={plan} onUpgrade={onUpgradeClick} />
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useFeedbackFeature } from '../../lib/feedback/feedbackApi.ts';
import { FEEDBACK_PREMIUM_REASON, feedbackHeadline, feedbackStats, filterFeedback, starShare, type FeedbackFilter } from '../../lib/feedback/feedbackUi.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { getCurrentUserId, Segmented } from '../viewKit.tsx';
import { ChevronDownIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import FeedbackRow from './FeedbackRow.tsx';
import { StarsDisplay } from './Stars.tsx';
import { useFeedbackList, useOnline } from './useFeedbackList.ts';

const STAR_ROWS = [5, 4, 3, 2, 1] as const;

const FeedbackSection: React.FC<{ plan: string; onUpgrade?: (reason?: string) => void; className?: string }> = ({ plan, onUpgrade, className = '' }) => {
    const online = useOnline();
    const [userId, setUserId] = useState<string | null>(null);
    useEffect(() => { void getCurrentUserId().then(setUserId).catch(() => undefined); }, []);
    const feature = useFeedbackFeature(userId, online);
    const ready = feature === 'ready';
    const list = useFeedbackList({ enabled: ready, isOnline: online });
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<FeedbackFilter>('all');
    const paid = isPaidTier(plan);

    const rows = list.rows || [];
    const stats = useMemo(() => feedbackStats(rows), [rows]);
    const shown = useMemo(() => filterFeedback(rows, filter), [rows, filter]);
    // a table that went missing while the screen was open hides the whole block, like the Subs tab
    if (!ready || list.rows === null) return null;

    const headline = list.rows === undefined ? (online ? 'Loading…' : 'Needs a connection') : feedbackHeadline(stats);
    const counts: Record<FeedbackFilter, number> = {
        all: rows.length, answered: stats.answered, waiting: stats.waiting, page: stats.onPage,
    };

    return (
        <section className={`border-t border-border ${className}`} aria-label="Client feedback">
            <div className="flex items-center gap-1">
                <h3 className="min-w-0 flex-1">
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-controls="client-feedback-body"
                        onClick={() => setOpen(v => !v)}
                        className="flex min-h-[60px] w-full items-center justify-between gap-3 py-3 text-left"
                    >
                        <span className="min-w-0">
                            <span className="block text-base font-bold text-foreground">Client feedback</span>
                            <span className="block text-sm text-muted-foreground">{headline}</span>
                        </span>
                        <ChevronDownIcon className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                </h3>
                <HelpButton topic="client-feedback" iconOnly />
            </div>

            {open && (
                <div id="client-feedback-body" className="pb-2">
                    {list.rows === undefined ? (
                        online
                            ? <div className="space-y-3" aria-busy="true"><div className="skeleton h-16 w-full" /><div className="skeleton h-16 w-full" /></div>
                            : <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{NEEDS_CONNECTION}</p>
                    ) : (
                        <>
                            {list.error && (
                                <p role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                    <span>{list.error}</span>
                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => void list.reload()}>Try again</button>
                                </p>
                            )}

                            {stats.answered > 0 && (
                                <div className="flex items-center gap-5 pb-4">
                                    <div className="shrink-0">
                                        <p className="text-5xl font-extrabold leading-none tabular-nums text-foreground">{stats.average?.toFixed(1)}</p>
                                        <StarsDisplay value={stats.average} size={15} className="mt-2" />
                                        <p className="mt-1 text-xs text-muted-foreground">{stats.answered} {stats.answered === 1 ? 'answer' : 'answers'}</p>
                                    </div>
                                    <ul className="min-w-0 flex-1 space-y-1.5" aria-label="Answers by stars">
                                        {STAR_ROWS.map(star => (
                                            <li key={star} className="flex items-center gap-2 text-xs">
                                                <span className="w-3 text-right tabular-nums text-muted-foreground">{star}</span>
                                                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                                    <span className="block h-full rounded-full bg-warning" style={{ width: `${starShare(stats, star)}%` }} />
                                                </span>
                                                <span className="w-6 text-right tabular-nums text-muted-foreground">{stats.byStar[star]}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {stats.onPage > 0 && stats.pageAverage !== null && (
                                <p className="pb-3 text-sm text-muted-foreground">On your public page: <strong className="text-foreground">{stats.pageAverage.toFixed(1)}</strong> from {stats.onPage}. Only what you choose to show appears there.</p>
                            )}

                            {rows.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border px-4 py-5">
                                    <p className="text-sm font-semibold text-foreground">No feedback yet</p>
                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                        Open a job and tap <strong>Ask for feedback</strong>. Your client rates the job on their phone with 1 to 5 stars and an optional comment. You choose what goes on your public page.
                                    </p>
                                    {!paid && onUpgrade && (
                                        <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => onUpgrade(FEEDBACK_PREMIUM_REASON)}><StarIcon className="h-4 w-4" /> Asking is part of Premium</button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div className="mb-1 overflow-x-auto">
                                        <Segmented<FeedbackFilter>
                                            size="sm" ariaLabel="Show"
                                            value={filter} onChange={setFilter}
                                            options={[
                                                { value: 'all', label: `All ${counts.all}` },
                                                { value: 'answered', label: `Answered ${counts.answered}` },
                                                { value: 'waiting', label: `Waiting ${counts.waiting}` },
                                                { value: 'page', label: `On page ${counts.page}` },
                                            ]}
                                        />
                                    </div>
                                    {shown.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>
                                    ) : (
                                        <ul className="divide-y divide-border">
                                            {shown.map(r => <FeedbackRow key={r.id} r={r} isOnline={online} onChanged={list.replace} onDeleted={list.remove} />)}
                                        </ul>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </section>
    );
};

export default FeedbackSection;
