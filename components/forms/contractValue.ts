/**
 * Contract value of a job (pure, shared by the Change Order form and the QA script):
 * accepted estimate total(s) + net change of the approved change orders.
 * - an estimate counts when the client signed it or its status is Accepted;
 * - a change order counts when the client signed it or its status is Approved (the approval link stores "Accepted");
 * - a signed document replaced by an accepted revision ("Revise" → new revision, `revisionOf`) is not counted twice.
 * Money comes from utils/money.ts, exactly like the PDFs.
 */
import { computeDocumentTotals, roundMoney } from '../../utils/money.ts';
import { isClientSigned } from './signedLock.ts';

export interface JobDocumentRow {
    id: string;
    type: string;
    created_at?: string | null;
    data: Record<string, any>;
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const isAcceptedEstimate = (d: Record<string, any> | null | undefined): boolean =>
    !!d && (isClientSigned(d) || /^accepted$/i.test(s(d.status)));

export const isApprovedChangeOrder = (d: Record<string, any> | null | undefined): boolean =>
    !!d && (isClientSigned(d) || /^(approved|accepted)$/i.test(s(d.status)));

/** Net change of a change order: the sum of its lines (credits allowed; no tax/discount on change orders). */
export const changeOrderNetChange = (d: Record<string, any> | null | undefined): number =>
    computeDocumentTotals({ lineItems: Array.isArray(d?.lineItems) ? d!.lineItems : [] }).subtotal;

/** Display status of a change order (the approval link writes "Accepted"). */
export const changeOrderStatus = (d: Record<string, any> | null | undefined): string => {
    const st = s(d?.status);
    if (/^accepted$/i.test(st) || (!st && isClientSigned(d))) return 'Approved';
    return st || 'Draft';
};

const withoutSuperseded = (rows: JobDocumentRow[]) => {
    const replaced = new Set(rows.map(r => s(r.data?.revisionOf)).filter(Boolean));
    return rows.filter(r => !replaced.has(r.id));
};

export interface ContractValue {
    estimateTotal: number;
    changeOrdersTotal: number;
    total: number;
    estimates: Array<{ id: string; number: string; total: number }>;
    changeOrders: Array<{ id: string; number: string; change: number }>;
}

/**
 * @param excludeId the change order being edited (never counts itself)
 * @param createdBefore only change orders created before this time count ("earlier" approved change orders)
 */
export const computeContractValue = (rows: JobDocumentRow[], opts: { excludeId?: string; createdBefore?: string } = {}): ContractValue => {
    const estimates = withoutSuperseded(rows.filter(r => r.type === 'Estimate' && isAcceptedEstimate(r.data)));
    const cos = withoutSuperseded(rows.filter(r => r.type === 'Change Order' && r.id !== opts.excludeId && isApprovedChangeOrder(r.data)
        && (!opts.createdBefore || !r.created_at || r.created_at < opts.createdBefore)));
    const est = estimates.map(r => ({ id: r.id, number: s(r.data?.estimateNumber), total: computeDocumentTotals(r.data).total }));
    const co = cos.map(r => ({ id: r.id, number: s(r.data?.changeOrderNumber), change: changeOrderNetChange(r.data) }));
    const estimateTotal = roundMoney(est.reduce((a, e) => a + e.total, 0));
    const changeOrdersTotal = roundMoney(co.reduce((a, c) => a + c.change, 0));
    return { estimateTotal, changeOrdersTotal, total: roundMoney(estimateTotal + changeOrdersTotal), estimates: est, changeOrders: co };
};
