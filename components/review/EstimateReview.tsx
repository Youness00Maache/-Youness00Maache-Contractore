/**
 * "Review estimate" (roadmap N1): a second look before an estimate is sent. Deterministic checks show instantly on
 * every plan (lib/estimateReview.ts); the AI check (Premium + AI) adds missing items, expenses and risky assumptions
 * when it answers. Each finding: Add line (AI suggestions; through the form's normal update) or Ignore. The estimate is
 * never changed without a click. Sharing with unreviewed HIGH findings shows a small, non-blocking "N things to check".
 *
 * Design (owner rule: compact, no "icon in a tinted square" cards): a ruled list like a reviewer's margin notes, a thin
 * severity stripe per row and a small-caps severity tag.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SavedItem } from '../../types.ts';
import { formatMoney } from '../../utils/money.ts';
import { designPlan } from '../../lib/designPlan.ts';
import { todayISO } from '../forms/formUtils.ts';
import { Spinner } from '../forms/Spinner.tsx';
import { dispatchUpgradeEvent, isAiLimitCode } from '../../src/ai/events.ts';
import {
    buildAiReviewBody, isMeaningfulLine, reviewEstimate, reviewSignature, thingsToCheck, unreviewedHigh,
    type ReviewFinding, type ReviewSeverity,
} from '../../lib/estimateReview.ts';
import { ESTIMATE_REVIEW_TIER, ESTIMATE_REVIEW_UPGRADE_MESSAGE } from '../../supabase/functions/ai-assistant/shared/estimateReview.ts';
import { readOptionSet } from '../../lib/estimateOptions.ts';

type AiState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; findings: ReviewFinding[]; signature: string }
    | { status: 'error'; message: string };

const ignoredKey = (documentId: string) => `cd.estimateReview.ignored:${documentId}`;
const readIgnored = (documentId?: string): Set<string> => {
    if (!documentId) return new Set();
    try {
        const raw = JSON.parse(localStorage.getItem(ignoredKey(documentId)) || '[]');
        return new Set(Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === 'string').slice(0, 200) : []);
    } catch { return new Set(); }
};
const writeIgnored = (documentId: string | undefined, ids: Set<string>) => {
    if (!documentId) return;
    try { localStorage.setItem(ignoredKey(documentId), JSON.stringify([...ids].slice(-200))); } catch { /* private mode */ }
};

const hasLines = (data: unknown): boolean => {
    const d = (data || {}) as Record<string, any>;
    const set = readOptionSet(d);
    if (set && !set.appliedId) return [...set.options.flatMap(o => o.lineItems), ...set.sharedLineItems].some(isMeaningfulLine);
    return (Array.isArray(d.lineItems) ? d.lineItems : []).some(isMeaningfulLine);
};

export interface EstimateReviewInput {
    data: unknown;
    savedItems?: SavedItem[];
    documentId?: string;
    jobName?: string;
    clientName?: string;
    language?: string;
}

export type EstimateReviewApi = ReturnType<typeof useEstimateReview>;

/** The review's state: findings (checks + AI), what was seen / ignored / added, the AI call. */
export function useEstimateReview({ data, savedItems = [], documentId, jobName, clientName, language }: EstimateReviewInput) {
    const [open, setOpen] = useState(false);
    const [usualTaxRate, setUsualTaxRate] = useState<number | null>(null);
    const [ai, setAi] = useState<AiState>({ status: 'idle' });
    const [seen, setSeen] = useState<Set<string>>(() => new Set());
    const [ignored, setIgnored] = useState<Set<string>>(() => readIgnored(documentId));
    const [added, setAdded] = useState<Set<string>>(() => new Set());
    const abortRef = useRef<AbortController | null>(null);
    const taxAsked = useRef(false);
    const rebase = useRef(false);
    const panelRef = useRef<HTMLElement | null>(null);

    // a document saved for the first time: keep what was ignored before it had an id
    useEffect(() => { if (documentId) writeIgnored(documentId, ignored); }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

    const checks = useMemo(
        () => reviewEstimate(data, { priceBook: savedItems, history: { usualTaxRate } }),
        [data, savedItems, usualTaxRate],
    );
    const signature = useMemo(() => reviewSignature(data), [data]);
    // after "Add line" the estimate changes on purpose: the AI result stays current
    useEffect(() => {
        if (!rebase.current) return;
        rebase.current = false;
        setAi(a => (a.status === 'done' ? { ...a, signature } : a));
    }, [signature]);

    const aiFindings = useMemo(() => (ai.status === 'done' ? ai.findings : []), [ai]);
    const all = useMemo(() => [...checks, ...aiFindings].filter(f => !added.has(f.id)), [checks, aiFindings, added]);
    const visible = useMemo(() => all.filter(f => !ignored.has(f.id)), [all, ignored]);
    const handled = useMemo(() => new Set([...seen, ...ignored, ...added]), [seen, ignored, added]);
    const pendingHigh = useMemo(() => unreviewedHigh(all, handled), [all, handled]);

    // everything on screen while the panel is open counts as reviewed
    useEffect(() => {
        if (!open) return;
        const fresh = visible.filter(f => !seen.has(f.id));
        if (fresh.length) setSeen(prev => new Set([...prev, ...fresh.map(f => f.id)]));
    }, [open, visible, seen]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const plan = designPlan();
    const aiAllowed = plan === ESTIMATE_REVIEW_TIER;

    const runAi = useCallback(async () => {
        if (!aiAllowed || !hasLines(data)) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setAi({ status: 'error', message: 'You’re offline. The AI check needs a connection; the checks above still work.' });
            return;
        }
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const sig = signature;
        setAi({ status: 'loading' });
        try {
            const body = buildAiReviewBody({ data, savedItems, jobName, clientName, language, today: todayISO(), checks });
            const { runAiEstimateReview } = await import('../../lib/estimateReviewApi.ts');
            const findings = await runAiEstimateReview(body, data, ctrl.signal);
            if (ctrl.signal.aborted) return;
            setAi({ status: 'done', findings, signature: sig });
        } catch (e) {
            if (ctrl.signal.aborted) return;
            const code = String((e as { code?: string })?.code || '');
            const message = e instanceof Error ? e.message : '';
            if (code === 'PLAN_REQUIRED' || isAiLimitCode(code)) dispatchUpgradeEvent(message || ESTIMATE_REVIEW_UPGRADE_MESSAGE);
            setAi({ status: 'error', message: code === 'PLAN_REQUIRED' || isAiLimitCode(code) ? message : 'AI review unavailable, try again.' });
        } finally {
            if (abortRef.current === ctrl) abortRef.current = null;
        }
    }, [aiAllowed, data, savedItems, jobName, clientName, language, signature, checks]);

    const cancelAi = () => { abortRef.current?.abort(); abortRef.current = null; setAi({ status: 'idle' }); };

    /**
     * Opens the panel: checks at once, the usual tax rate once, the AI check the first time (one AI request; after
     * the estimate changes the panel offers "Check again" instead of spending another request on its own).
     */
    const openReview = (scroll = false) => {
        setOpen(true);
        if (!taxAsked.current) {
            taxAsked.current = true;
            void import('../../lib/estimateReviewApi.ts').then(m => m.fetchUsualTaxRate(documentId)).then(r => setUsualTaxRate(r)).catch(() => undefined);
        }
        if (aiAllowed && ai.status === 'idle') void runAi();
        if (scroll) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    };

    const ignore = (id: string) => setIgnored(prev => { const next = new Set(prev); next.add(id); writeIgnored(documentId, next); return next; });
    const restoreIgnored = () => setIgnored(() => { const next = new Set<string>(); writeIgnored(documentId, next); return next; });
    const markAdded = (id: string) => { rebase.current = true; setAdded(prev => new Set(prev).add(id)); };

    return {
        open, setOpen, openReview, panelRef,
        checks, all, visible, ignoredCount: all.length - visible.length, pendingHigh,
        ai, aiAllowed, runAi, cancelAi, aiStale: ai.status === 'done' && ai.signature !== signature,
        ignore, restoreIgnored, markAdded,
    };
}

// ─────────────────────────────────────────── view ───────────────────────────────────────────

const SEV: Record<ReviewSeverity, { bar: string; tag: string; label: string }> = {
    high: { bar: 'bg-destructive', tag: 'text-destructive', label: 'High' },
    medium: { bar: 'bg-warning', tag: 'text-warning', label: 'Check' },
    low: { bar: 'bg-border', tag: 'text-muted-foreground', label: 'Note' },
};

const tally = (list: ReviewFinding[]) => {
    const high = list.filter(f => f.severity === 'high').length;
    return { high, other: list.length - high };
};

const FindingRow: React.FC<{
    f: ReviewFinding;
    canEdit: boolean;
    onAdd?: () => void;
    onIgnore: () => void;
}> = ({ f, canEdit, onAdd, onIgnore }) => {
    const s = SEV[f.severity];
    const line = f.suggested;
    return (
        <li className="grid grid-cols-[3px_minmax(0,1fr)] gap-x-3 px-3 py-2.5">
            <span className={`rounded-full ${s.bar}`} aria-hidden="true" />
            <div className="min-w-0">
                <p className="text-sm leading-snug text-foreground">
                    <span className={`mr-1.5 align-[1px] text-[10px] font-semibold uppercase tracking-[0.12em] ${s.tag}`}>
                        {f.source === 'ai' ? `AI · ${s.label}` : s.label}
                    </span>
                    {f.optionName && <span className="mr-1.5 rounded border border-border px-1 py-px text-[11px] text-muted-foreground">{f.optionName}</span>}
                    {f.message}
                </p>
                {line && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">+ {line.description}</span>
                        {' · '}{line.quantity ?? 1}{line.unit ? ` ${line.unit}` : ''}
                        {' · '}{line.rate !== null ? <>{formatMoney(line.rate)} <span className="opacity-80">(price book)</span></> : <span className="text-warning">no price yet: you fill it</span>}
                    </p>
                )}
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs">
                    {line && canEdit && onAdd && (
                        <button type="button" className="min-h-[32px] font-semibold text-primary underline-offset-2 hover:underline" onClick={onAdd}>Add line</button>
                    )}
                    <button type="button" className="min-h-[32px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={onIgnore}>Ignore</button>
                </div>
            </div>
        </li>
    );
};

/** The "Review estimate" bar under the totals and, when open, the findings. */
export const EstimateReviewPanel: React.FC<{
    review: EstimateReviewApi;
    /** false on a signed (locked) estimate: findings only, no Add line */
    canEdit: boolean;
    onAddLine: (finding: ReviewFinding) => void;
}> = ({ review, canEdit, onAddLine }) => {
    const { open, visible, ai } = review;
    const live = tally(visible);
    const summary = visible.length
        ? `${visible.length} to check${live.high ? ` · ${live.high} high` : ''}`
        : 'A second look before you send';
    return (
        <div className="space-y-2 border-t border-dashed border-border pt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                    type="button"
                    className={`btn btn-sm min-h-[40px] ${open ? 'btn-secondary' : 'btn-outline'}`}
                    onClick={() => (open ? review.setOpen(false) : review.openReview())}
                    aria-expanded={open}
                    aria-controls="estimate-review"
                >
                    {open ? 'Hide review' : 'Review estimate'}
                </button>
                <span className={`text-xs tabular-nums ${live.high ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>{summary}</span>
            </div>
            {open && (
                <section
                    id="estimate-review"
                    ref={el => { review.panelRef.current = el; }}
                    aria-label="Estimate review"
                    className="overflow-hidden rounded-xl border border-border bg-card"
                >
                    <header className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Second look</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                            {visible.length ? `${visible.length} to check` : 'Nothing to flag'}
                            {review.ignoredCount > 0 && <> · <button type="button" className="underline-offset-2 hover:underline" onClick={review.restoreIgnored}>show {review.ignoredCount} ignored</button></>}
                        </p>
                    </header>
                    {visible.length > 0 ? (
                        <ol className="divide-y divide-dashed divide-border">
                            {visible.map(f => (
                                <FindingRow
                                    key={f.id}
                                    f={f}
                                    canEdit={canEdit}
                                    onAdd={f.suggested ? () => { onAddLine(f); review.markAdded(f.id); } : undefined}
                                    onIgnore={() => review.ignore(f.id)}
                                />
                            ))}
                        </ol>
                    ) : (
                        <p className="px-3 py-3 text-sm text-muted-foreground">Totals, quantities and prices look consistent.</p>
                    )}
                    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        {!review.aiAllowed ? (
                            <>
                                <span>AI check for missing items, permits and dump fees: Premium + AI.</span>
                                <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => dispatchUpgradeEvent(ESTIMATE_REVIEW_UPGRADE_MESSAGE)}>Upgrade</button>
                            </>
                        ) : ai.status === 'loading' ? (
                            <>
                                <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" /> AI is looking for missing items…</span>
                                <button type="button" className="underline-offset-2 hover:underline" onClick={review.cancelAi}>Cancel</button>
                            </>
                        ) : ai.status === 'error' ? (
                            <>
                                <span role="status">{ai.message}</span>
                                <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => void review.runAi()}>Try again</button>
                            </>
                        ) : ai.status === 'done' ? (
                            <>
                                <span>{review.aiStale ? 'The estimate changed since the AI check.' : ai.findings.length ? 'AI check done: suggestions are marked AI.' : 'AI check: nothing obviously missing.'}</span>
                                {review.aiStale && <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => void review.runAi()}>Check again</button>}
                            </>
                        ) : (
                            <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => void review.runAi()}>Run AI check</button>
                        )}
                    </footer>
                </section>
            )}
        </div>
    );
};

/** Inside the Share window: a one-line, non-blocking reminder when HIGH findings were never looked at. */
export const ReviewShareNotice: React.FC<{ review: EstimateReviewApi; onReview: () => void }> = ({ review, onReview }) => {
    const n = review.pendingHigh.length;
    if (!n) return null;
    return (
        <p className="flex flex-wrap items-baseline gap-x-2 border-l-2 border-destructive pl-3 text-xs text-foreground" role="note">
            <span className="font-semibold">{thingsToCheck(n)}</span>
            <span className="min-w-0 text-muted-foreground">before you send, e.g. {review.pendingHigh[0].message}</span>
            <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={onReview}>Review</button>
        </p>
    );
};
