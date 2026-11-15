import React, { useEffect, useMemo, useState } from 'react';
import type { Job } from '../types.ts';
import { formatMoney } from '../utils/money.ts';
import {
    COLLECTED_DEFINITION, PROFIT_DEFINITION, PROFIT_FORMULA, rememberLaborRate, resolveLaborRate, summarizeJobMoney,
} from '../lib/finance.ts';
import { summarizeJobCosting, type CostingDoc, type PriceBookLite } from '../lib/costing.ts';
import { collectUnbilled, unbilledSummary } from '../lib/tmInvoice.ts';
import { fetchJobCostingDocs } from '../lib/costingApi.ts';
import { loadJobProgress, saveJobProgress, saveLaborRateToAccount } from '../lib/userData.ts';
import { CalculatorIcon, XCircleIcon, InfoIcon } from './Icons.tsx';
import { Skeleton } from './ui/Skeleton.tsx';
import JobCostingPanel from './costing/JobCostingPanel.tsx';
import SelectionsBudgetLine from './selections/SelectionsBudgetLine.tsx';
import { errorText } from '../lib/offline/connection.ts';

interface JobFinancialsModalProps {
    job: Job;
    defaultLaborRate?: number;
    /** price book: splits the budget by kind (labor / materials) */
    savedItems?: PriceBookLite[];
    /** "Bill time & materials" (unbilled time sheets and material lines → a Draft invoice) */
    onBillTimeMaterials?: () => void;
    onClose: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One compact number: label, value, one line of detail. */
const Cell: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
    <div className="min-w-0 bg-card px-4 py-3">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="mt-0.5 block text-lg font-bold tabular-nums tracking-tight">{value}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
    </div>
);

const JobFinancialsModal: React.FC<JobFinancialsModalProps> = ({ job, defaultLaborRate, savedItems, onBillTimeMaterials, onClose }) => {
    const [rows, setRows] = useState<CostingDoc[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rate, setRate] = useState<number>(() => resolveLaborRate(defaultLaborRate));
    const [manualPercent, setManualPercent] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        // Only the JSON paths needed for the numbers: never downloads photos/signatures (CORE-011).
        fetchJobCostingDocs(job.id)
            .then(data => { if (!cancelled) setRows(data); })
            .catch(err => { if (!cancelled) setError(errorText(err, 'Could not load the numbers for this job.')); });
        loadJobProgress(job.id).then(p => { if (!cancelled && p !== null) setManualPercent(p); }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [job.id]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const numbers = useMemo(() => (rows ? summarizeJobMoney(rows, { laborRate: rate }) : null), [rows, rate]);
    const costing = useMemo(
        () => (rows ? summarizeJobCosting(rows, { laborRate: rate, priceBook: savedItems, manualPercent }) : null),
        [rows, rate, savedItems, manualPercent],
    );
    const unbilled = useMemo(() => (rows ? unbilledSummary(collectUnbilled(rows)) : null), [rows]);

    const marginTone = numbers?.margin == null ? 'text-foreground'
        : numbers.margin >= 30 ? 'text-success' : numbers.margin > 0 ? 'text-warning' : 'text-destructive';

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

                <div className="space-y-4 p-4 sm:space-y-5 sm:p-5">
                    {error ? (
                        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
                    ) : !numbers || !costing ? (
                        <div className="space-y-3">
                            <Skeleton className="h-24 rounded-2xl" />
                            <Skeleton className="h-56 rounded-2xl" />
                            <Skeleton className="h-28 rounded-2xl" />
                        </div>
                    ) : (
                        <>
                            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-4 sm:p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profit <span className="normal-case tracking-normal">({PROFIT_FORMULA.replace('Profit = ', '')})</span></p>
                                <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                                    <span className={`text-3xl font-bold tabular-nums tracking-tight ${marginTone}`}>{formatMoney(numbers.profit)}</span>
                                    {numbers.margin != null && <span className={`text-sm font-semibold ${marginTone}`}>{numbers.margin.toFixed(1)}% margin</span>}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Income {formatMoney(numbers.income)}
                                    {numbers.otherReceipts > 0 ? ` (invoiced ${formatMoney(numbers.invoiced)} + receipts without an invoice ${formatMoney(numbers.otherReceipts)})` : ''}
                                    {' '}minus costs {formatMoney(numbers.costs)} (materials, expenses and labor)
                                </p>
                            </div>

                            <JobCostingPanel
                                costing={costing}
                                manualPercent={manualPercent}
                                onManualPercent={(p) => { setManualPercent(p); saveJobProgress(job.id, p); }}
                                unbilled={unbilled}
                                onBillTimeMaterials={onBillTimeMaterials}
                            />

                            {/* client selections (roadmap D5): an extra line next to the numbers; nothing for a job without selections */}
                            <SelectionsBudgetLine jobId={job.id} />

                            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
                                <Cell
                                    label="Contract value"
                                    value={formatMoney(numbers.contractValue)}
                                    hint={numbers.estimateCount || numbers.changeOrderCount
                                        ? [
                                            numbers.estimateCount ? `${plural(numbers.estimateCount, 'accepted estimate')} ${formatMoney(numbers.estimateValue)}` : 'No accepted estimate',
                                            numbers.changeOrderCount ? `+ ${plural(numbers.changeOrderCount, 'approved change order')} ${formatMoney(numbers.changeOrderValue)}` : '',
                                        ].filter(Boolean).join(' ')
                                        : 'No accepted estimate or approved change order yet'}
                                />
                                <Cell
                                    label="Invoiced"
                                    value={formatMoney(numbers.invoiced)}
                                    hint={`${plural(numbers.invoiceCount, 'sent/paid invoice')}${numbers.contractValue > numbers.invoiced ? ` · ${formatMoney(numbers.contractValue - numbers.invoiced)} left to invoice` : ''}`}
                                />
                                <Cell
                                    label="Collected"
                                    value={formatMoney(numbers.collected)}
                                    hint={`${numbers.outstanding > 0 ? `${formatMoney(numbers.outstanding)} outstanding` : 'Nothing outstanding'}${numbers.receiptCount ? ` · ${plural(numbers.receiptCount, 'receipt')}` : ''}`}
                                />
                                <Cell label="Materials" value={formatMoney(numbers.materials)} hint="From material logs" />
                                <Cell label="Expenses" value={formatMoney(numbers.expenses)} hint="From expense logs" />
                                <Cell label="Labor" value={formatMoney(numbers.labor)} hint={`${numbers.hours}h + ${numbers.overtime}h OT from time sheets`} />
                            </div>

                            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <label htmlFor="labor-rate" className="text-sm font-medium text-foreground">
                                    Labor rate ($/h)
                                    <span className="block text-xs font-normal text-muted-foreground">Your cost per hour. Overtime counted at 1.5×.</span>
                                </label>
                                <input
                                    id="labor-rate"
                                    type="number"
                                    min={0}
                                    step="0.5"
                                    inputMode="decimal"
                                    value={rate}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => {
                                        const v = Math.max(0, Number(e.target.value) || 0);
                                        setRate(v);
                                        rememberLaborRate(v);
                                        saveLaborRateToAccount(v);
                                    }}
                                    className="input sm:w-32"
                                />
                            </div>
                            <div className="space-y-1.5 text-xs text-muted-foreground">
                                <p className="flex items-start gap-2"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0" /><span><strong className="font-semibold text-foreground">{PROFIT_FORMULA}.</strong> {PROFIT_DEFINITION}</span></p>
                                <p className="pl-6">{COLLECTED_DEFINITION} Contract value is the accepted (or client-signed) estimate plus approved change orders.</p>
                            </div>
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
