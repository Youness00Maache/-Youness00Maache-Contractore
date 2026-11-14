/**
 * Purchase order form, roadmap N2: the deliveries so far (a dated log, what is still to come) and the supplier's
 * invoice (number, amount, date, the PDF / photo in the private bucket, paid date). Data shapes: lib/poLifecycle.ts.
 */
import React, { useRef } from 'react';
import { PaperclipIcon, TruckIcon } from '../Icons.tsx';
import { cx } from '../commsKit.tsx';
import { DateField, FieldGrid, MoneyField, TextField } from '../forms/Fields.tsx';
import { deliveryProgress, parseSupplierInvoiceFile, poStatusKind, type PoDelivery } from '../../lib/poLifecycle.ts';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
const q = (n: number) => String(Math.round(n * 1000) / 1000);
const shortDay = (ymd: string) => {
    const t = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(`${ymd}T12:00:00`).getTime() : NaN;
    return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
};
const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** One line per delivery: date · what came · note; a delivery that stopped half-way offers Finish. */
export const DeliveriesLog: React.FC<{
    data: Record<string, unknown>;
    onFinish?: (deliveryId: string) => void;
    busy?: boolean;
}> = ({ data, onFinish, busy }) => {
    const progress = deliveryProgress(data);
    const list = progress.deliveries;
    if (!list.length) return null;
    const label = (d: PoDelivery) => {
        const units = d.lines.reduce((s, l) => s + l.qty, 0);
        return `${d.lines.length} line${d.lines.length === 1 ? '' : 's'} · ${q(units)} unit${units === 1 ? '' : 's'}`;
    };
    return (
        <div>
            <p className="label flex items-center gap-1.5"><TruckIcon className="h-3.5 w-3.5" /> Deliveries</p>
            <ol className="relative ml-1.5 space-y-2 border-l border-border pl-4">
                {list.map((d) => {
                    const half = d.state !== 'done';
                    return (
                        <li key={d.id} className="relative text-sm">
                            <span className={cx('absolute -left-[21px] top-1.5 h-2 w-2 rounded-full', half ? 'bg-warning' : 'bg-success')} aria-hidden="true" />
                            <span className="font-semibold tabular-nums">{shortDay(d.date)}</span>
                            <span className="text-muted-foreground"> · {label(d)}</span>
                            {d.items.length > 0 && <span className="text-muted-foreground"> · {d.items.length} into stock</span>}
                            {d.note && <span className="block text-xs text-muted-foreground">“{d.note}”</span>}
                            {d.recovered && <span className="block text-xs text-muted-foreground">Recovered from the stock history.</span>}
                            {half && (
                                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-warning">
                                    {d.items.length - d.applied.length} item{d.items.length - d.applied.length === 1 ? '' : 's'} not added to stock yet.
                                    {onFinish && (
                                        <button type="button" className="btn btn-outline btn-sm min-h-[32px]" onClick={() => onFinish(d.id)} disabled={busy}>Finish delivery</button>
                                    )}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                {progress.remainingQty > 0
                    ? `${q(progress.deliveredQty)} of ${q(progress.orderedQty)} delivered · ${q(progress.remainingQty)} still to come on ${progress.lines.filter((l) => l.remaining > 0).length} line${progress.lines.filter((l) => l.remaining > 0).length === 1 ? '' : 's'}.`
                    : 'Everything on this order was delivered.'}
            </p>
        </div>
    );
};

export interface SupplierInvoicePatch {
    supplierInvoiceNumber?: string;
    supplierInvoiceAmount?: number;
    supplierInvoiceDate?: string;
    paidDate?: string;
}

/** The supplier's invoice: number + amount (they move the order to Invoiced), date, file, and the paid date. */
export const SupplierInvoiceFields: React.FC<{
    data: Record<string, unknown>;
    onChange: (patch: SupplierInvoicePatch) => void;
    onAttach: (file: File) => void;
    onOpenFile: (path: string) => void;
    onRemoveFile: () => void;
    fileBusy?: boolean;
    note?: string | null;
}> = ({ data, onChange, onAttach, onOpenFile, onRemoveFile, fileBusy, note }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const file = parseSupplierInvoiceFile(data);
    const kind = poStatusKind(data.status);
    const showPaid = kind === 'paid' || Boolean(str(data.paidDate));
    return (
        <div className="space-y-3">
            <FieldGrid cols={3}>
                <TextField label="Supplier invoice #" value={str(data.supplierInvoiceNumber)} onChange={(v) => onChange({ supplierInvoiceNumber: v })} placeholder="e.g. INV-88213" />
                <MoneyField label="Invoice amount" value={(data.supplierInvoiceAmount as number | undefined) ?? ''} onValueChange={(v) => onChange({ supplierInvoiceAmount: v })} placeholder="0.00" />
                <DateField label="Invoice date" value={str(data.supplierInvoiceDate)} onChange={(v) => onChange({ supplierInvoiceDate: v })} />
                {showPaid && <DateField label="Paid on" value={str(data.paidDate)} onChange={(v) => onChange({ paidDate: v })} />}
            </FieldGrid>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) onAttach(f);
                    }}
                />
                {file ? (
                    <>
                        <button type="button" className="inline-flex min-h-[36px] max-w-full items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline" onClick={() => onOpenFile(file.path)}>
                            <PaperclipIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{file.name}</span>
                            {file.size > 0 && <span className="shrink-0 text-xs font-normal text-muted-foreground">({sizeText(file.size)})</span>}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm min-h-[36px]" onClick={() => inputRef.current?.click()} disabled={fileBusy}>{fileBusy ? 'Uploading…' : 'Replace'}</button>
                        <button type="button" className="btn btn-ghost btn-sm min-h-[36px] text-destructive" onClick={onRemoveFile} disabled={fileBusy}>Remove</button>
                    </>
                ) : (
                    <button type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={() => inputRef.current?.click()} disabled={fileBusy}>
                        <PaperclipIcon className="h-4 w-4" /> {fileBusy ? 'Uploading…' : 'Attach the supplier’s invoice'}
                    </button>
                )}
                <span className="text-xs text-muted-foreground">{note || 'PDF or photo, up to 15 MB. Private: only you can open it.'}</span>
            </div>
        </div>
    );
};
