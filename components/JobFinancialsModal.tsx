import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { FormType, type Job } from '../types.ts';
import { computeDocumentTotals, formatMoney, toNumber, roundMoney } from '../utils/money.ts';
import { CalculatorIcon, XCircleIcon, InvoiceIcon, BoxIcon, ClockIcon, ExpenseLogIcon, BarChartIcon, InfoIcon } from './Icons.tsx';
import { Skeleton } from './ui/Skeleton.tsx';

interface JobFinancialsModalProps {
    job: Job;
    defaultLaborRate?: number;
    onClose: () => void;
}

/** Only the JSON paths needed for the numbers: never downloads photos/signatures (CORE-011). */
const FINANCIAL_COLUMNS = [
    'id', 'type',
    'status:data->>status',
    'lineItems:data->lineItems',
    'discount:data->>discount',
    'shipping:data->>shipping',
    'taxRate:data->>taxRate',
    'isProgressBilling:data->>isProgressBilling',
    'amountPaid:data->>amountPaid',
    'items:data->items',
    'hoursWorked:data->>hoursWorked',
    'overtimeHours:data->>overtimeHours',
    'amount:data->>amount',
    'tax:data->>tax',
].join(', ');

const BILLED_STATUSES = ['sent', 'paid', 'overdue', 'partially paid', 'partial'];
const RATE_KEY = 'cd_job_labor_rate';

interface Row {
    id: string;
    type: string;
    status?: string | null;
    lineItems?: any[] | null;
    discount?: string | null;
    shipping?: string | null;
    taxRate?: string | null;
    isProgressBilling?: string | null;
    amountPaid?: string | null;
    items?: any[] | null;
    hoursWorked?: string | null;
    overtimeHours?: string | null;
    amount?: string | null;
    tax?: string | null;
}

const invoiceTotal = (r: Row) => computeDocumentTotals({
    lineItems: Array.isArray(r.lineItems) ? r.lineItems : [],
    discount: r.discount, shipping: r.shipping, taxRate: r.taxRate,
    isProgressBilling: String(r.isProgressBilling) === 'true',
    amountPaid: r.amountPaid,
});

const JobFinancialsModal: React.FC<JobFinancialsModalProps> = ({ job, defaultLaborRate, onClose }) => {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rate, setRate] = useState<number>(() => {
        if (defaultLaborRate && defaultLaborRate > 0) return defaultLaborRate;
        try { const v = Number(localStorage.getItem(RATE_KEY)); return v > 0 ? v : 45; } catch { return 45; }
    });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error: err } = await supabase
                .from('documents')
                .select(FINANCIAL_COLUMNS)
                .eq('job_id', job.id)
                .in('type', [FormType.Invoice, FormType.MaterialLog, FormType.TimeSheet, FormType.ExpenseLog])
                .limit(1000);
            if (cancelled) return;
            if (err) setError(err.message || 'Could not load the numbers for this job.');
            else setRows((data || []) as unknown as Row[]);
        })();
        return () => { cancelled = true; };
    }, [job.id]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const numbers = useMemo(() => {
        if (!rows) return null;
        let invoiced = 0, collected = 0, outstanding = 0, materials = 0, expenses = 0, hours = 0, overtime = 0;
        let invoiceCount = 0;
        for (const r of rows) {
            const status = String(r.status || '').toLowerCase();
            if (r.type === FormType.Invoice) {
                if (!BILLED_STATUSES.includes(status)) continue;
                const totals = invoiceTotal(r);
                invoiceCount++;
                invoiced += totals.total;
                if (status === 'paid') collected += totals.total;
                else { collected += totals.amountPaid; outstanding += totals.balanceDue; }
            } else if (r.type === FormType.MaterialLog) {
                for (const it of Array.isArray(r.items) ? r.items : []) materials += toNumber(it?.quantity) * toNumber(it?.unitCost);
            } else if (r.type === FormType.ExpenseLog) {
                const li = Array.isArray(r.lineItems) ? r.lineItems : [];
                expenses += li.length ? computeDocumentTotals({ lineItems: li }).subtotal + toNumber(r.tax) : toNumber(r.amount) + toNumber(r.tax);
            } else if (r.type === FormType.TimeSheet) {
                hours += toNumber(r.hoursWorked);
                overtime += toNumber(r.overtimeHours);
            }
        }
        const labor = hours * rate + overtime * rate * 1.5;
        const costs = materials + expenses + labor;
        const profit = invoiced - costs;
        const margin = invoiced > 0 ? (profit / invoiced) * 100 : null;
        return {
            invoiced: roundMoney(invoiced), collected: roundMoney(collected), outstanding: roundMoney(outstanding),
            materials: roundMoney(materials), expenses: roundMoney(expenses), labor: roundMoney(labor),
            hours, overtime, costs: roundMoney(costs), profit: roundMoney(profit), margin, invoiceCount,
        };
    }, [rows, rate]);

    const marginTone = numbers?.margin == null ? 'text-foreground'
        : numbers.margin >= 30 ? 'text-success' : numbers.margin > 0 ? 'text-warning' : 'text-destructive';

    const Stat: React.FC<{ label: string; value: string; hint?: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }> = ({ label, value, hint, icon: Icon }) => (
        <div className="rounded-2xl border border-border bg-background/60 p-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" /> {label}</span>
            <span className="mt-1 block text-xl font-bold tracking-tight">{value}</span>
            {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
        </div>
    );

    return (
        <div className="modal-backdrop z-[110]" onClick={onClose} role="presentation">
            <div className="modal-panel sm:max-w-3xl" role="dialog" aria-modal="true" aria-labelledby="fin-title" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <h2 id="fin-title" className="flex items-center gap-2 text-lg font-bold"><CalculatorIcon className="h-5 w-5 text-primary" /> Job financials</h2>
                        <p className="truncate text-sm text-muted-foreground">{job.name}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                        <XCircleIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    {error ? (
                        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
                    ) : !numbers ? (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
                    ) : (
                        <>
                            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimated profit</p>
                                <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                                    <span className={`text-3xl font-bold tracking-tight ${marginTone}`}>{formatMoney(numbers.profit)}</span>
                                    {numbers.margin != null && <span className={`text-sm font-semibold ${marginTone}`}>{numbers.margin.toFixed(1)}% margin</span>}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">Invoiced {formatMoney(numbers.invoiced)} minus costs {formatMoney(numbers.costs)}</p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                                <Stat label="Invoiced" value={formatMoney(numbers.invoiced)} hint={`${numbers.invoiceCount} sent/paid ${numbers.invoiceCount === 1 ? 'invoice' : 'invoices'}`} icon={InvoiceIcon} />
                                <Stat label="Collected" value={formatMoney(numbers.collected)} hint={numbers.outstanding > 0 ? `${formatMoney(numbers.outstanding)} outstanding` : 'Nothing outstanding'} icon={BarChartIcon} />
                                <Stat label="Materials" value={formatMoney(numbers.materials)} hint="From material logs" icon={BoxIcon} />
                                <Stat label="Expenses" value={formatMoney(numbers.expenses)} hint="From expense logs" icon={ExpenseLogIcon} />
                                <Stat label="Labor" value={formatMoney(numbers.labor)} hint={`${numbers.hours}h + ${numbers.overtime}h OT`} icon={ClockIcon} />
                                <div className="rounded-2xl border border-border bg-background/60 p-4">
                                    <label htmlFor="labor-rate" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Labor rate ($/h)</label>
                                    <input
                                        id="labor-rate"
                                        type="number"
                                        min={0}
                                        step="0.5"
                                        inputMode="decimal"
                                        value={rate}
                                        onChange={(e) => {
                                            const v = Math.max(0, Number(e.target.value) || 0);
                                            setRate(v);
                                            try { localStorage.setItem(RATE_KEY, String(v)); } catch { /* ignore */ }
                                        }}
                                        className="input mt-1"
                                    />
                                    <span className="mt-1 block text-xs text-muted-foreground">Overtime counted at 1.5×</span>
                                </div>
                            </div>
                            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                                Revenue counts invoices marked Sent, Paid or Overdue (drafts are excluded). Costs come from this job's material logs, expense logs and time sheets.
                            </p>
                        </>
                    )}
                </div>

                <div className="flex justify-end border-t border-border px-5 py-4">
                    <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
};

export default JobFinancialsModal;
