/**
 * "Budget vs actual" in Job financials: what the job may cost (accepted estimate + approved change orders), what it
 * has cost so far by kind, how complete it is, and a warning when costs run ahead of the work. The numbers come from
 * lib/costing.ts (the same costs as profit, + purchase orders).
 */
import React from 'react';
import { formatMoney } from '../../utils/money.ts';
import { NumberInput } from '../forms/Fields.tsx';
import { cx } from '../commsKit.tsx';
import { shortDay } from '../../lib/tmInvoice.ts';
import type { CostingStatus, CostingSummary } from '../../lib/costing.ts';

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
    const done = progress.percent;
    const fill = Math.min(100, Math.max(0, usedPct ?? 0));
    const usedTone = (used: number | null) => (used === null ? '' : used > 100 ? 'text-destructive' : done !== null && done > 0 && used > done ? 'text-warning' : '');
    const hasUnbilled = Boolean(unbilled && (unbilled.hours + unbilled.overtime > 0 || unbilled.materialLines > 0 || unbilled.expenses > 0));

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

            {budget > 0 ? (
                <>
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-2xl font-bold tabular-nums tracking-tight">{formatMoney(actual)}</span>
                        <span className="text-sm text-muted-foreground">
                            spent of <span className="font-semibold text-foreground tabular-nums">{formatMoney(budget)}</span> budget
                        </span>
                        <span className={cx('text-sm font-semibold tabular-nums', status.tone === 'danger' || status.tone === 'warning' ? TONE_TEXT[status.tone] : '')}>{pctLabel(usedPct)} used</span>
                    </p>
                    <div className="relative mt-3" aria-hidden="true">
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                            <div className={cx('h-full rounded-full transition-all', TONE_BAR[status.tone])} style={{ width: `${fill}%` }} />
                        </div>
                        {done !== null && done > 0 && (
                            <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-foreground" style={{ left: `calc(${Math.min(100, done)}% - 1px)` }} />
                        )}
                    </div>
                    <p className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                        <span>Spent {pctLabel(usedPct)}</span>
                        {done !== null && done > 0 && <span>│ Complete {pctLabel(done)}</span>}
                    </p>
                </>
            ) : (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-2xl font-bold tabular-nums tracking-tight">{formatMoney(actual)}</span>
                    <span className="text-sm text-muted-foreground">spent so far</span>
                </p>
            )}

            <div className="mt-3 flex items-start gap-2.5" role={status.tone === 'danger' || status.tone === 'warning' ? 'alert' : 'status'}>
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[status.tone])} aria-hidden="true" />
                <p className="text-sm">
                    <span className={cx('font-semibold', status.tone === 'muted' ? 'text-foreground' : TONE_TEXT[status.tone])}>{status.title}.</span>{' '}
                    <span className="text-muted-foreground">{status.detail}</span>
                </p>
            </div>
            {projection && (
                <p className="mt-1.5 pl-[18px] text-xs text-muted-foreground">
                    At this pace: final cost ≈ <span className="font-semibold text-foreground tabular-nums">{formatMoney(projection.finalCost)}</span>
                    {' '}· profit ≈ <span className={cx('font-semibold tabular-nums', projection.profit < 0 ? 'text-destructive' : 'text-foreground')}>{formatMoney(projection.profit)}</span>
                    {' '}({Math.round(projection.margin)}%)
                </p>
            )}

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th scope="col" className="py-1.5 pr-2 font-semibold">Kind</th>
                            <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Budget</th>
                            <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Actual</th>
                            <th scope="col" className="py-1.5 text-right font-semibold">Used</th>
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        {rows.map(r => {
                            const pad = r.sources.length ? 'pt-2' : 'py-2';
                            return (
                                <React.Fragment key={r.id}>
                                    <tr className={cx('align-top', !r.sources.length && 'border-b border-border/60')}>
                                        <th scope="row" className={cx('pr-2 text-left font-medium', pad)}>{r.label}</th>
                                        <td className={cx('pr-2 text-right text-muted-foreground', pad)}>{r.budget === null ? '—' : money0(r.budget)}</td>
                                        <td className={cx('pr-2 text-right font-medium', pad)}>{r.actual ? money0(r.actual) : '—'}</td>
                                        <td className={cx('text-right font-semibold', pad, usedTone(r.usedPct))}>{pctLabel(r.usedPct)}</td>
                                    </tr>
                                    {r.sources.length > 0 && (
                                        <tr className="border-b border-border/60">
                                            <td colSpan={4} className="pb-2 text-[11px] leading-snug text-muted-foreground">
                                                {r.sources.map(s => `${s.label} ${money0(s.amount)}`).join(' · ')}
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
                                    <td className="pt-2 text-right">—</td>
                                </tr>
                                <tr className="border-b border-border/60">
                                    <td colSpan={4} className="pb-2 text-[11px] leading-snug text-muted-foreground">Estimate lines that don't say labor or materials</td>
                                </tr>
                            </>
                        )}
                        <tr className="font-semibold">
                            <th scope="row" className="py-2 pr-2 text-left">Total</th>
                            <td className="py-2 pr-2 text-right">{budget > 0 ? money0(budget) : '—'}</td>
                            <td className="py-2 pr-2 text-right">{money0(actual)}</td>
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
                Budget = accepted estimate + approved change orders, split by the kind of each line. Actual = the costs in profit
                (material logs, expense logs, labor){purchaseOrders.amount > 0 ? ` + ${formatMoney(purchaseOrders.amount)} on sent purchase orders` : ' + sent purchase orders'}
                {purchaseOrders.skippedLines > 0 ? ` (${purchaseOrders.skippedLines} purchase-order line${purchaseOrders.skippedLines === 1 ? ' is' : 's are'} also on a material log and counted once)` : ''}.
                {' '}% complete comes from the latest progress-billing invoice, else the % you type here.
            </p>
        </section>
    );
};

export default JobCostingPanel;
