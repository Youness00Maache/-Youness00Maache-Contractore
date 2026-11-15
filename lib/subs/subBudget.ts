/**
 * Job budget hook for subcontracts (roadmap D7), shown ADDITIVELY next to lib/costing.ts numbers, like selectionBudget
 * in lib/selections/selectionPo.ts. lib/costing.ts itself is NOT changed, so jobs without subs keep exactly the same
 * numbers (summarizeJobCosting never sees sub_commitments).
 *
 *   subcontractBudget(commitments)  -> SubcontractBudget
 *     committed    issued + accepted + in progress + completed amounts, plus what was paid on cancelled ones
 *                  (show as "+ $X committed to subcontractors" next to Committed)
 *     paid         payments recorded on those commitments (the subcontract cost incurred so far)
 *     outstanding  committed - paid (still to pay subs)
 *     retainageHeld / retainageReleasable   retainage not paid yet / payable now (completed work)
 *     pendingDrafts  draft amounts (not committed yet: e.g. "+ $Y in draft subcontracts")
 *     items        one line per counted commitment { id, title, subName, status, amount, paid, outstanding }
 *   withSubcontracts(committedCost, budget) -> number   committed cost + subcontracts (for a combined total line)
 */
import { roundMoney } from '../../utils/money.ts';
import { commitmentMoney } from './subLogic.ts';
import type { CommitmentStatus, SubCommitment } from './subTypes.ts';

export interface SubcontractBudgetItem {
    id: string;
    title: string;
    subName: string;
    status: CommitmentStatus;
    /** what counts as committed: the amount (cancelled: what was paid) */
    amount: number;
    paid: number;
    outstanding: number;
}

export interface SubcontractBudget {
    committed: number;
    paid: number;
    outstanding: number;
    retainageHeld: number;
    retainageReleasable: number;
    pendingDrafts: number;
    count: number;
    items: SubcontractBudgetItem[];
}

export const subcontractBudget = (commitments: readonly SubCommitment[]): SubcontractBudget => {
    const out: SubcontractBudget = { committed: 0, paid: 0, outstanding: 0, retainageHeld: 0, retainageReleasable: 0, pendingDrafts: 0, count: 0, items: [] };
    for (const c of commitments) {
        const m = commitmentMoney(c);
        if (c.status === 'draft') { out.pendingDrafts += m.amount; continue; }
        if (c.status === 'cancelled' && m.paid <= 0) continue;
        const amount = c.status === 'cancelled' ? m.paid : m.amount;
        const outstanding = c.status === 'cancelled' ? 0 : m.remaining;
        out.items.push({ id: c.id, title: c.title, subName: c.subName, status: c.status, amount, paid: m.paid, outstanding });
        out.committed += amount;
        out.paid += m.paid;
        out.outstanding += outstanding;
        if (c.status !== 'cancelled') {
            out.retainageHeld += m.retainageHeld;
            out.retainageReleasable += m.retainageReleasable;
        }
    }
    out.count = out.items.length;
    out.committed = roundMoney(out.committed);
    out.paid = roundMoney(out.paid);
    out.outstanding = roundMoney(out.outstanding);
    out.retainageHeld = roundMoney(out.retainageHeld);
    out.retainageReleasable = roundMoney(out.retainageReleasable);
    out.pendingDrafts = roundMoney(out.pendingDrafts);
    return out;
};

export const withSubcontracts = (committedCost: number, budget: Pick<SubcontractBudget, 'committed'>): number =>
    roundMoney((Number(committedCost) || 0) + budget.committed);
