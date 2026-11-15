/**
 * Job financials › under "Budget vs actual": the extra "Selections" line (roadmap D5). It shows what the client's approved
 * choices will cost that is not on a purchase order yet, the choices waiting for approval, and the upgrades / credits against
 * the allowances (what the client pays more or less than the contract). It sits NEXT to the costing numbers and never changes
 * them (lib/costing.ts is untouched). A job without selections shows nothing at all.
 * Rules and words: lib/selections/selectionPo.ts selectionBudget, lib/selections/selectionView.ts budgetView.
 */
import React, { useEffect, useState } from 'react';
import { listJobSelections, useSelectionsFeature } from '../../lib/selections/selectionsApi.ts';
import { selectionBudget } from '../../lib/selections/selectionPo.ts';
import { budgetView, moneyText, type BudgetView } from '../../lib/selections/selectionView.ts';
import { cx } from '../commsKit.tsx';

const SelectionsBudgetLine: React.FC<{ jobId: string }> = ({ jobId }) => {
    const feature = useSelectionsFeature(undefined, false);
    const [view, setView] = useState<BudgetView | null>(null);
    useEffect(() => {
        setView(null);
        if (feature !== 'ready') return;
        let alive = true;
        void listJobSelections(jobId).then(list => { if (alive && list) setView(budgetView(selectionBudget(list))); }).catch(() => undefined);
        return () => { alive = false; };
    }, [jobId, feature]);
    if (!view) return null;
    return (
        <section aria-labelledby="sel-budget-title" className="rounded-2xl border border-border bg-background/60 p-4 sm:p-5" data-testid="selections-budget">
            <h3 id="sel-budget-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selections</h3>
            <dl className="mt-2 divide-y divide-border/70 text-sm">
                {view.pendingCount > 0 && (
                    <div className="flex items-baseline justify-between gap-3 py-2">
                        <dt className="min-w-0">
                            <span className="font-medium">Approved, not ordered yet</span>
                            <span className="block text-xs text-muted-foreground">{view.pendingText}. Not in &ldquo;Ordered&rdquo; above until you make the purchase order.</span>
                        </dt>
                        <dd className="shrink-0 font-semibold tabular-nums">+ {moneyText(view.pendingCost)}</dd>
                    </div>
                )}
                {view.awaitingText && (
                    <div className="py-2"><dt className="text-muted-foreground">{view.awaitingText}</dt></div>
                )}
                {view.viaPoText && (
                    <div className="py-2"><dt className="text-muted-foreground">{view.viaPoText}.</dt></div>
                )}
                {(view.upgrades > 0 || view.credits > 0) && (
                    <div className="py-2">
                        <dt className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="font-medium">Against the allowances</span>
                            <span className="tabular-nums">
                                {view.upgrades > 0 && <span className="font-semibold">+{moneyText(view.upgrades)} upgrades</span>}
                                {view.upgrades > 0 && view.credits > 0 && <span className="text-muted-foreground"> · </span>}
                                {view.credits > 0 && <span className="font-semibold text-success">-{moneyText(view.credits)} credits</span>}
                            </span>
                        </dt>
                        {view.netText && <dd className={cx('mt-0.5 text-xs', view.net > 0 ? 'text-foreground' : 'text-muted-foreground')}>{view.netText}.</dd>}
                    </div>
                )}
            </dl>
            <p className="mt-1 text-xs text-muted-foreground">Shown next to the numbers above; it does not change them. Upgrades and credits change what the client pays, not what it costs you.</p>
        </section>
    );
};

export default SelectionsBudgetLine;
