/**
 * Dashboard: invoices whose client tapped "I've paid" and that are not marked paid yet. Hidden when there are none
 * or when the database update (migration 20261113000200) isn't applied.
 */
import React, { useEffect, useState } from 'react';
import { FormType, type FormData as FormDataType } from '../../types.ts';
import { formatMoney } from '../../utils/money.ts';
import { fetchReportedPayments, type ReportedPayment } from '../../lib/paymentsApi.ts';
import { CheckCircleIcon } from '../Icons.tsx';

const shortDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** A list summary the app can open / mark paid (the full invoice is loaded on demand). */
const toSummary = (r: ReportedPayment): FormDataType => ({
    id: r.id,
    jobId: r.jobId,
    type: FormType.Invoice,
    createdAt: r.createdAt,
    public_token: r.publicToken ?? undefined,
    data: {
        title: r.title || r.number || 'Invoice', invoiceNumber: r.number || undefined, status: r.status || undefined, clientName: r.clientName || undefined,
        paymentReportedAt: r.reportedAt, __lightweight: true,
    } as any,
});

export const PaymentReportsCard: React.FC<{
    /** changes whenever documents change (refetch) */
    refreshKey?: unknown;
    jobNameById?: Map<string, string>;
    onOpen: (form: FormDataType) => void;
    onMarkPaid: (form: FormDataType) => void;
}> = ({ refreshKey, jobNameById, onOpen, onMarkPaid }) => {
    const [items, setItems] = useState<ReportedPayment[] | null>(null);

    useEffect(() => {
        let active = true;
        const t = window.setTimeout(() => {
            fetchReportedPayments().then(list => { if (active) setItems(list); }).catch(() => { if (active) setItems(null); });
        }, 250);
        return () => { active = false; window.clearTimeout(t); };
    }, [refreshKey]);

    if (!items || items.length === 0) return null;
    return (
        <section className="card mb-8 border-primary/30" aria-labelledby="payments-reported-heading">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                    <h2 id="payments-reported-heading" className="text-sm font-semibold">Payments reported by clients</h2>
                    <p className="truncate text-xs text-muted-foreground">They tapped “I’ve paid”. Check the money arrived, then mark the invoice paid.</p>
                </div>
                <span className="badge badge-primary shrink-0">{items.length}</span>
            </div>
            <ul className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3">
                {items.slice(0, 6).map(r => {
                    const summary = toSummary(r);
                    return (
                        <li key={r.id} className="px-4 py-3 sm:border-b sm:border-border">
                            <button type="button" onClick={() => onOpen(summary)} className="block w-full text-left">
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm font-medium">{r.clientName || r.title || 'Client'}</span>
                                    {r.amount !== null && <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(r.amount)}</span>}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {[r.number || 'Invoice', jobNameById?.get(r.jobId), shortDate(r.reportedAt)].filter(Boolean).join(' · ')}
                                </span>
                                {r.note && <span className="mt-0.5 block truncate text-xs text-foreground">“{r.note}”</span>}
                            </button>
                            <button type="button" className="btn btn-outline btn-sm mt-2 min-h-[36px]" onClick={() => onMarkPaid(summary)}>
                                <CheckCircleIcon className="h-4 w-4" /> Mark as paid
                            </button>
                        </li>
                    );
                })}
            </ul>
            {items.length > 6 && <p className="px-4 py-2 text-xs text-muted-foreground">{items.length - 6} more in your jobs (look for “Payment reported”).</p>}
        </section>
    );
};

export default PaymentReportsCard;
