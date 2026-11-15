/**
 * Job financials › under "Budget vs actual": the extra "Subcontracts (committed)" line (roadmap D7). It shows what you have
 * committed to subcontractors on this job, what you have paid them and what is still to pay, the retainage held, and drafts that
 * are not committed yet. It sits NEXT to the costing numbers and never changes them (lib/costing.ts is untouched), so a job without
 * subcontracts shows nothing at all and every existing number stays the same.
 * Costing's "Subs & other" can already hold sub payments you logged as expenses; the note says to log them here instead.
 * Rules: lib/subs/subBudget.ts subcontractBudget; words: lib/subs/subView.ts.
 */
import React, { useEffect, useState } from 'react';
import { listJobCommitments, useSubsFeature } from '../../lib/subs/subsApi.ts';
import { subcontractBudget, type SubcontractBudget } from '../../lib/subs/subBudget.ts';
import { moneyText } from '../../lib/subs/subView.ts';
import { statusLabel } from '../../lib/subs/subLogic.ts';

const Line: React.FC<{ label: React.ReactNode; value: string; strong?: boolean }> = ({ label, value, strong }) => (
    <div className="flex items-baseline justify-between gap-3 py-2">
        <dt className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
        <dd className={`shrink-0 tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
);

const SubsBudgetLine: React.FC<{ jobId: string }> = ({ jobId }) => {
    const feature = useSubsFeature(undefined, false);
    const [budget, setBudget] = useState<SubcontractBudget | null>(null);
    useEffect(() => {
        setBudget(null);
        if (feature !== 'ready') return;
        let alive = true;
        void listJobCommitments(jobId).then(list => {
            // only a job that has subcontracts (even only drafts) shows this line
            if (alive && list && list.length > 0) setBudget(subcontractBudget(list));
        }).catch(() => undefined);
        return () => { alive = false; };
    }, [jobId, feature]);
    if (!budget) return null;
    return (
        <section aria-labelledby="subs-budget-title" className="rounded-2xl border border-border bg-background/60 p-4 sm:p-5" data-testid="subs-budget">
            <h3 id="subs-budget-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subcontracts (committed)</h3>
            <dl className="mt-2 divide-y divide-border/70 text-sm">
                {budget.count > 0 && (
                    <>
                        <Line label="Committed to subs" value={moneyText(budget.committed)} strong />
                        <Line label="Paid so far" value={moneyText(budget.paid)} />
                        <Line label="Still to pay" value={moneyText(budget.outstanding)} />
                        {budget.retainageHeld > 0 && (
                            <Line
                                label={<>Retainage held<span className="block text-xs">{budget.retainageReleasable > 0 ? `${moneyText(budget.retainageReleasable)} can be paid now (work completed).` : 'Paid when the work is complete.'}</span></>}
                                value={moneyText(budget.retainageHeld)}
                            />
                        )}
                    </>
                )}
                {budget.pendingDrafts > 0 && <Line label="In draft, not committed yet" value={moneyText(budget.pendingDrafts)} />}
            </dl>
            {budget.items.length > 0 && (
                <details className="mt-1 text-sm">
                    <summary className="min-h-[40px] cursor-pointer py-2 text-xs font-semibold text-muted-foreground">By subcontract ({budget.items.length})</summary>
                    <ul className="divide-y divide-border/70">
                        {budget.items.map(i => (
                            <li key={i.id} className="flex items-baseline justify-between gap-3 py-1.5">
                                <span className="min-w-0 truncate">{i.title}<span className="text-xs text-muted-foreground"> · {i.subName} · {statusLabel(i.status)}</span></span>
                                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{moneyText(i.paid)} of {moneyText(i.amount)}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Shown next to the numbers above; it does not change them. If you also log sub payments as expenses they are counted twice: log them here instead.</p>
        </section>
    );
};

export default SubsBudgetLine;
