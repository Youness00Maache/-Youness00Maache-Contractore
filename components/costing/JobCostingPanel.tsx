/**
 * "Budget vs actual" in Job financials: the original budget (first accepted estimate) and the revised one (+ approved
 * change orders), what the job has SPENT so far and what is ORDERED on purchase orders but not delivered yet (by kind,
 * with overruns called out), what is left, the expected final cost / profit at the current pace, how complete it is,
 * and a warning when costs run ahead of the work. The numbers come from lib/costing.ts (the same costs as profit, +
 * purchase orders split into delivered = spent and still expected = ordered).
 */
import React from 'react';
import { formatMoney } from '../../utils/money.ts';
import { NumberInput } from '../forms/Fields.tsx';
import { cx } from '../commsKit.tsx';
import { shortDay } from '../../lib/tmInvoice.ts';
import { overrunText, type CostingStatus, type CostingSummary } from '../../lib/costing.ts';

const TONE_TEXT: Record<CostingStatus['tone'], string> = {
    muted: 'text-muted-foreground', success: 'text-success', warning: 'text-warning', danger: 'text-destructive',
};
const TONE_BAR: Record<CostingStatus['tone'], string> = {
    muted: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive',
};
const TONE_DOT: Record<CostingStatus['tone'], string> = {
    muted: 'bg-muted-foreground/60', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive',
};

/** Whole dollars for the table (the documents keep the cents). */
const money0 = (n: number): string => {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
    } catch {
        return `$${Math.round(n)}`;
    }
};

const pctLabel = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);

export interface UnbilledInfo {
    hours: number;
    overtime: number;
    materialLines: number;
    materialCost: number;
    expenses: number;
}

const JobCostingPanel: React.FC<{
    costing: CostingSummary;
    /** % typed on the job (shown when there is no progress-billing invoice) */
    manualPercent: number | null;
    onManualPercent: (percent: number) => void;
    unbilled?: UnbilledInfo | null;
    onBillTimeMaterials?: () => void;
}> = ({ costing, manualPercent, onManualPercent, unbilled, onBillTimeMaterials }) => {
    const { budget, actual, usedPct, rows, progress, projection, status, purchaseOrders, unsplitBudget } = costing;
    // older summaries (before roadmap N2) have no committed / remaining: read them as 0 / budget − actual
    const committed = costing.committed ?? 0;
    const remaining = costing.remaining ?? (budget > 0 ? budget - actual - committed : null);
    const overruns = costing.overruns ?? [];
    const original = costing.original ?? null;
    const done = progress.percent;
    const spentPct = budget > 0 ? Math.min(100, Math.max(0, (actual / budget) * 100)) : 0;
    const orderedPct = budget > 0 ? Math.min(100 - spentPct, Math.max(0, (committed / budget) * 100)) : 0;
    const usedTone = (used: number | null) => (used === null ? '' : used > 100 ? 'text-destructive' : done !== null && done > 0 && used > done ? 'text-warning' : '');
    const hasUnbilled = Boolean(unbilled && (unbilled.hours + unbilled.overtime > 0 || unbilled.materialLines > 0 || unbilled.expenses > 0));
    const hasOrdered = committed > 0 || rows.some(r => (r.committed ?? 0) > 0);

    return (
        <section aria-labelledby="costing-title" className="rounded-2xl border border-border bg-background/60 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <h3 id="costing-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Budget vs actual</h3>
                {progress.source === 'progress' ? (
                    <p className="text-right text-sm">
                        <span className="font-semibold tabular-nums">{pctLabel(done)}</span> complete
                        <span className="block text-xs text-muted-foreground">
                            from progress invoice {progress.invoiceNumber || ''}{progress.date ? ` (${shortDay(progress.date)})` : ''}
                        </span>
                    </p>
                ) : (
                    <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Job complete</span>
                        <span className="w-24">
                            <NumberInput
                                value={manualPercent ?? ''}
                                onValueChange={onManualPercent}
                                max={100}
                                decimals={0}
                                suffix="%"
                                placeholder="0"
                                aria-label="Job complete (%)"
                                className="h-9 py-1.5"
                            />
                        </span>
                    </label>
                )}
            </div>

            {budget > 0 && original && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Original <span className="font-semibold text-foreground">{money0(original.amount)}</span> ({original.label})
                    {Math.abs(costing.budgetChanges ?? 0) >= 0.5 ? (
                        <> → revised <span className="font-semibold text-foreground">{money0(budget)}</span> ({(costing.budgetChanges ?? 0) > 0 ? '+' : '−'}{money0(Math.abs(costing.budgetChanges ?? 0))} approved changes)</>
                    ) : null}
                </p>
            )}

            {budget > 0 ? (
                <>
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-2xl font-bold tabular-nums tracking-tight">{formatMoney(actual)}</span>
                        <span className="text-sm text-muted-foreground">
                            spent{committed > 0 ? <> + <span className="font-semibold text-foreground tabular-nums">{formatMoney(committed)}</span> ordered</> : null} of{' '}
                            <span className="font-semibold text-foreground tabular-nums">{formatMoney(budget)}</span> budget
                        </span>
                        <span className={cx('text-sm font-semibold tabular-nums', status.tone === 'danger' || status.tone === 'warning' ? TONE_TEXT[status.tone] : '')}>{pctLabel(usedPct)} used</span>
                    </p>
                    <div className="relative mt-3" aria-hidden="true">
                        {/* spent (solid) then ordered (striped): one bar, the complete marker on top */}
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                            <div className={cx('h-full transition-all', TONE_BAR[status.tone])} style={{ width: `${spentPct}%` }} />
                            {orderedPct > 0 && (
                                <div
                                    className={cx('h-full opacity-50 transition-all', TONE_BAR[status.tone])}
                                    style={{ width: `${orderedPct}%`, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, rgba(255,255,255,.55) 3px 6px)' }}
                                />
                            )}
                        </div>
                        {done !== null && done > 0 && (
                            <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-foreground" style={{ left: `calc(${Math.min(100, done)}% - 1px)` }} />
                        )}
                    </div>
                    <p className="mt-1.5 flex justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>Spent {pctLabel(budget > 0 ? (actual / budget) * 100 : null)}{committed > 0 ? ` · ordered ${pctLabel((committed / budget) * 100)}` : ''}</span>
                        {done !== null && done > 0 && <span>│ Complete {pctLabel(done)}</span>}
                    </p>
                </>
            ) : (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-2xl font-bold tabular-nums tracking-tight">{formatMoney(actual)}</span>
                    <span className="text-sm text-muted-foreground">spent so far{committed > 0 ? ` + ${formatMoney(committed)} ordered` : ''}</span>
                </p>
            )}

            <div className="mt-3 flex items-start gap-2.5" role={status.tone === 'danger' || status.tone === 'warning' ? 'alert' : 'status'}>
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[status.tone])} aria-hidden="true" />
                <p className="text-sm">
                    <span className={cx('font-semibold', status.tone === 'muted' ? 'text-foreground' : TONE_TEXT[status.tone])}>{status.title}.</span>{' '}
                    <span className="text-muted-foreground">{status.detail}</span>
                </p>
            </div>
            {overruns.length > 0 && (
                <ul className="mt-2 space-y-0.5 pl-[18px] text-sm" aria-label="Over budget by kind">
                    {overruns.map(o => (
                        <li key={o.id} className="text-destructive">
                            <span className="font-semibold">{o.label}:</span>{' '}
                            <span className="tabular-nums">{overrunText(o).slice(o.label.length + 2)}</span>
                        </li>
                    ))}
                </ul>
            )}

            {budget > 0 && (
                // the job's money ledger in one ruled row: what's left, where it should end, what it should earn
                <dl className="mt-3 grid grid-cols-1 divide-y divide-border border-y border-border text-sm tabular-nums sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="flex items-baseline justify-between gap-2 py-2 sm:block sm:px-3 sm:first:pl-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Remaining</dt>
                        <dd className={cx('font-semibold', remaining !== null && remaining < 0 && 'text-destructive')}>
                            {remaining === null ? '—' : remaining < 0 ? `${money0(-remaining)} over` : money0(remaining)}
                        </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 py-2 sm:block sm:px-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expected final cost</dt>
                        <dd className="font-semibold">
                            {projection ? <>≈ {money0(projection.finalCost)}</> : <span className="text-xs font-normal text-muted-foreground">set % complete</span>}
                        </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 py-2 sm:block sm:px-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expected profit</dt>
                        <dd className={cx('font-semibold', projection && projection.profit < 0 && 'text-destructive')}>
                            {projection ? <>≈ {money0(projection.profit)} <span className="text-xs font-normal text-muted-foreground">({Math.round(projection.margin)}% margin)</span></> : '—'}
                        </dd>
                    </div>
                </dl>
            )}

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th scope="col" className="py-1.5 pr-2 font-semibold">Kind</th>
                            <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Budget</th>
                            <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Spent</th>
                            {hasOrdered && <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Ordered</th>}
                            <th scope="col" className="py-1.5 text-right font-semibold">Used</th>
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        {rows.map(r => {
                            const pad = r.sources.length || r.over ? 'pt-2' : 'py-2';
                            const ordered = r.committed ?? 0;
                            const cols = hasOrdered ? 5 : 4;
                            return (
                                <React.Fragment key={r.id}>
                                    <tr className={cx('align-top', !r.sources.length && !r.over && 'border-b border-border/60', r.over && 'bg-destructive/5')}>
                                        <th scope="row" className={cx('pr-2 text-left font-medium', pad, r.over && 'text-destructive')}>{r.label}</th>
                                        <td className={cx('pr-2 text-right text-muted-foreground', pad)}>{r.budget === null ? '—' : money0(r.budget)}</td>
                                        <td className={cx('pr-2 text-right font-medium', pad)}>{r.actual ? money0(r.actual) : '—'}</td>
                                        {hasOrdered && <td className={cx('pr-2 text-right text-muted-foreground', pad)}>{ordered ? money0(ordered) : '—'}</td>}
                                        <td className={cx('text-right font-semibold', pad, usedTone(r.usedPct))}>{pctLabel(r.usedPct)}</td>
                                    </tr>
                                    {(r.sources.length > 0 || r.over) && (
                                        <tr className={cx('border-b border-border/60', r.over && 'bg-destructive/5')}>
                                            <td colSpan={cols} className="pb-2 text-[11px] leading-snug text-muted-foreground">
                                                {r.sources.map(s => `${s.label} ${money0(s.amount)}`).join(' · ')}
                                                {r.over ? <span className="font-semibold text-destructive">{r.sources.length ? ' · ' : ''}{money0(r.over)} over</span> : null}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {unsplitBudget !== 0 && (
                            <>
                                <tr className="align-top text-muted-foreground">
                                    <th scope="row" className="pt-2 pr-2 text-left font-normal">Not split</th>
                                    <td className="pt-2 pr-2 text-right">{money0(unsplitBudget)}</td>
                                    <td className="pt-2 pr-2 text-right">—</td>
                                    {hasOrdered && <td className="pt-2 pr-2 text-right">—</td>}
                                    <td className="pt-2 text-right">—</td>
                                </tr>
                                <tr className="border-b border-border/60">
                                    <td colSpan={hasOrdered ? 5 : 4} className="pb-2 text-[11px] leading-snug text-muted-foreground">Estimate lines that don't say labor or materials</td>
                                </tr>
                            </>
                        )}
                        <tr className="font-semibold">
                            <th scope="row" className="py-2 pr-2 text-left">Total</th>
                            <td className="py-2 pr-2 text-right">{budget > 0 ? money0(budget) : '—'}</td>
                            <td className="py-2 pr-2 text-right">{money0(actual)}</td>
                            {hasOrdered && <td className="py-2 pr-2 text-right">{money0(committed)}</td>}
                            <td className={cx('py-2 text-right', usedTone(usedPct))}>{pctLabel(usedPct)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {hasUnbilled && unbilled && (
                <div className="mt-3 flex flex-col gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        <span className="font-semibold">Not billed yet:</span>{' '}
                        {[
                            unbilled.hours + unbilled.overtime > 0 ? `${unbilled.hours} h${unbilled.overtime ? ` + ${unbilled.overtime} h OT` : ''}` : '',
                            unbilled.materialLines ? `${unbilled.materialLines} material line${unbilled.materialLines === 1 ? '' : 's'} (${formatMoney(unbilled.materialCost)} cost)` : '',
                            unbilled.expenses ? `${unbilled.expenses} expense log${unbilled.expenses === 1 ? '' : 's'}` : '',
                        ].filter(Boolean).join(' · ')}
                    </span>
                    {onBillTimeMaterials && (
                        <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={onBillTimeMaterials}>Bill time &amp; materials</button>
                    )}
                </div>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
                Budget = accepted estimate + approved change orders, split by the kind of each line. Spent = the costs in profit
                (material logs, expense logs, labor){purchaseOrders.amount > 0 ? ` + ${formatMoney(purchaseOrders.amount)} delivered or invoiced on purchase orders` : ' + what arrived on purchase orders'}.
                {' '}Ordered = purchase orders sent or confirmed, not delivered yet{(purchaseOrders.committed ?? 0) > 0 ? ` (${formatMoney(purchaseOrders.committed ?? 0)})` : ''}; used = spent + ordered
                {purchaseOrders.skippedLines > 0 ? ` (${purchaseOrders.skippedLines} purchase-order line${purchaseOrders.skippedLines === 1 ? ' is' : 's are'} also on a material log and counted once)` : ''}.
                {' '}% complete comes from the latest progress-billing invoice, else the % you type here. Expected final cost = spent + ordered at this pace.
            </p>
        </section>
    );
};

export default JobCostingPanel;
