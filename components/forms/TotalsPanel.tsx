import React from 'react';
import { cn } from '../../lib/utils.ts';
import { formatMoney, type DocumentTotals } from '../../utils/money.ts';
import { NumberInput } from './Fields.tsx';

export interface TotalsAdjustments {
    discount?: number;
    taxRate?: number;
    shipping?: number;
    /** deposits / payments already received (invoice) */
    amountPaid?: number;
}

export type AdjustmentField = keyof TotalsAdjustments;

interface TotalsPanelProps {
    /** always from computeDocumentTotals() so the screen matches the PDF, portal and email */
    totals: DocumentTotals;
    /** when provided, discount / tax % / shipping (and optionally the amount already paid) are editable */
    adjustments?: TotalsAdjustments & { onChange: (patch: TotalsAdjustments) => void; fields?: AdjustmentField[] };
    totalLabel?: string;
    /** rows rendered before the total (e.g. "Current contract") */
    extraRows?: { label: React.ReactNode; value: React.ReactNode }[];
    currency?: string;
    className?: string;
    children?: React.ReactNode;
}

const DEFAULT_FIELDS: AdjustmentField[] = ['discount', 'taxRate', 'shipping'];

const Row: React.FC<{ label: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
    <div className={cn('flex min-h-[40px] items-center justify-between gap-4 text-sm', className)}>
        <span className="text-muted-foreground">{label}</span>
        <div className="tabular-nums">{children}</div>
    </div>
);

const TotalsPanel: React.FC<TotalsPanelProps> = ({ totals, adjustments, totalLabel = 'Total', extraRows, currency = 'USD', className, children }) => {
    const fields = adjustments?.fields ?? DEFAULT_FIELDS;
    const editable = (f: AdjustmentField) => Boolean(adjustments) && fields.includes(f);
    const showPaid = editable('amountPaid') || totals.amountPaid > 0;
    return (
        <div className={cn('ml-auto w-full space-y-1 rounded-xl border border-border bg-muted/40 p-4 sm:max-w-sm', className)}>
            <Row label="Subtotal"><span className="font-medium text-foreground">{formatMoney(totals.subtotal, currency)}</span></Row>
            {editable('discount') ? (
                <>
                    <Row label="Discount ($)">
                        <NumberInput className="w-28 text-right" value={adjustments!.discount ?? 0} decimals={2} onValueChange={v => adjustments!.onChange({ discount: v })} aria-label="Discount amount" />
                    </Row>
                    {totals.discount > 0 && totals.discount < (adjustments!.discount ?? 0) && (
                        <p className="text-right text-xs text-warning">Discount limited to the subtotal.</p>
                    )}
                </>
            ) : totals.discount > 0 && <Row label="Discount"><span>−{formatMoney(totals.discount, currency)}</span></Row>}
            {editable('taxRate') ? (
                <Row label={<>Tax (%){totals.tax > 0 && <span className="ml-1 text-xs">= {formatMoney(totals.tax, currency)}</span>}</>}>
                    <NumberInput className="w-28 text-right" value={adjustments!.taxRate ?? 0} max={100} onValueChange={v => adjustments!.onChange({ taxRate: v })} aria-label="Tax rate percent" />
                </Row>
            ) : totals.tax > 0 && <Row label={`Tax (${totals.taxRate}%)`}><span>{formatMoney(totals.tax, currency)}</span></Row>}
            {editable('shipping') ? (
                <Row label="Shipping ($)">
                    <NumberInput className="w-28 text-right" value={adjustments!.shipping ?? 0} decimals={2} onValueChange={v => adjustments!.onChange({ shipping: v })} aria-label="Shipping amount" />
                </Row>
            ) : totals.shipping > 0 && <Row label="Shipping"><span>{formatMoney(totals.shipping, currency)}</span></Row>}
            {extraRows?.map((r, i) => <Row key={i} label={r.label}>{r.value}</Row>)}
            <div className="!mt-3 flex items-center justify-between gap-4 border-t border-border pt-3">
                <span className="text-base font-semibold text-foreground">{totalLabel}</span>
                <span className="text-xl font-bold tabular-nums text-foreground">{formatMoney(totals.total, currency)}</span>
            </div>
            {showPaid && (
                <>
                    {editable('amountPaid') ? (
                        <Row label="Paid / deposit ($)">
                            <NumberInput className="w-28 text-right" value={adjustments!.amountPaid ?? 0} decimals={2} onValueChange={v => adjustments!.onChange({ amountPaid: v })} aria-label="Amount already paid" />
                        </Row>
                    ) : <Row label="Paid"><span>−{formatMoney(totals.amountPaid, currency)}</span></Row>}
                    {totals.amountPaid > 0 && (
                        <Row label={<span className="font-semibold text-foreground">Balance due</span>}>
                            <span className="font-semibold text-foreground">{formatMoney(totals.balanceDue, currency)}</span>
                        </Row>
                    )}
                </>
            )}
            {children}
        </div>
    );
};

export default TotalsPanel;
