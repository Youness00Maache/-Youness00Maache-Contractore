/**
 * Purchase order form pieces for supplier ordering:
 *  - OrderStatusStrip: where the order stands (draft → sent → confirmed by the supplier → partially delivered →
 *    delivered → invoiced → paid) with [[Send to supplier]] (Premium), [[Record delivery]] (every plan), [[Mark paid]]
 *    and, for an older order received half-way, [[Finish receiving]]
 *  - SavedSupplierPicker / SaveVendorLine: fill the vendor from a saved supplier, or save the typed vendor as one
 */
import React from 'react';
import { BoxIcon, CheckIcon, SendIcon } from '../Icons.tsx';
import { cx } from '../commsKit.tsx';
import { formatMoney, toNumber } from '../../utils/money.ts';
import { parseStockReceipt, purchaseOrderStage, type PoStage, type Supplier } from '../../lib/suppliers.ts';
import { deliveryProgress, poStatusKind, unfinishedDelivery } from '../../lib/poLifecycle.ts';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
const day = (iso: unknown) => {
    const s = str(iso);
    const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`).getTime() : Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
};
const qtyText = (n: number) => String(Math.round(n * 1000) / 1000);

const DOT: Record<PoStage, string> = {
    draft: 'bg-muted-foreground/60', sent: 'bg-primary', confirmed: 'bg-success', 'cant-fill': 'bg-destructive',
    receiving: 'bg-warning', partial: 'bg-warning', received: 'bg-success', invoiced: 'bg-primary', paid: 'bg-success',
    cancelled: 'bg-muted-foreground/60',
};

/** The order's way so far: the stages it went through, as a row of short ticks (no generic stepper cards). */
const TRACK: Array<{ id: string; label: string }> = [
    { id: 'sent', label: 'Sent' }, { id: 'confirmed', label: 'Confirmed' }, { id: 'delivered', label: 'Delivered' },
    { id: 'invoiced', label: 'Invoiced' }, { id: 'paid', label: 'Paid' },
];
const trackLevel = (stage: PoStage, partial: boolean): number => {
    switch (stage) {
        case 'paid': return 5;
        case 'invoiced': return 4;
        case 'received': return 3;
        case 'partial': case 'receiving': return partial ? 2.5 : 2;
        case 'confirmed': return 2;
        case 'sent': case 'cant-fill': return 1;
        default: return 0;
    }
};

export const OrderStatusStrip: React.FC<{
    data: Record<string, unknown>;
    paid: boolean;
    onSend: () => void;
    /** an older "Mark received" that stopped half-way: Finish receiving (components/suppliers/ReceiveOrderDialog.tsx) */
    onReceive: () => void;
    /** Record delivery (a delivery id = finish that delivery) */
    onDeliver?: (deliveryId?: string) => void;
    onMarkPaid?: () => void;
    /** today (YYYY-MM-DD), for "late" */
    today?: string;
    busy?: boolean;
}> = ({ data, paid, onSend, onReceive, onDeliver, onMarkPaid, today, busy }) => {
    const stage = purchaseOrderStage(data);
    const receipt = parseStockReceipt(data);
    const progress = deliveryProgress(data);
    const unfinished = unfinishedDelivery(data);
    const deliveries = progress.deliveries.length;
    const vendor = str(data.vendorName) || 'the supplier';
    const signer = str(data.clientSignerName) || str(data.clientSignedBy);
    const expected = str(data.deliveryDate);
    const waiting = stage === 'sent' || stage === 'confirmed' || stage === 'partial';
    const late = waiting && !!today && /^\d{4}-\d{2}-\d{2}$/.test(expected) && expected < today && progress.remainingQty > 0;
    const expectedText = waiting && expected && !late ? ` Expected ${day(expected)}.` : '';
    const invoiceText = [str(data.supplierInvoiceNumber) && `Invoice ${str(data.supplierInvoiceNumber)}`, toNumber(data.supplierInvoiceAmount) > 0 && formatMoney(toNumber(data.supplierInvoiceAmount))].filter(Boolean).join(' · ');
    let title = '';
    let detail = '';
    switch (stage) {
        case 'draft':
            title = 'Draft';
            detail = str(data.vendorEmail) ? `Not sent to ${vendor} yet.` : 'Add the supplier’s email to send it from your Gmail.';
            break;
        case 'sent':
            title = 'Sent';
            detail = `Waiting for ${vendor} to confirm. Record each delivery when the goods arrive.${expectedText}`;
            break;
        case 'confirmed':
            title = `Confirmed by ${signer || vendor}`;
            detail = `${day(data.clientSignedAt) ? `on ${day(data.clientSignedAt)}. ` : ''}Record each delivery when the goods arrive.${expectedText}`;
            break;
        case 'partial':
            title = 'Partially delivered';
            detail = `${qtyText(progress.deliveredQty)} of ${qtyText(progress.orderedQty)} delivered${deliveries ? ` in ${deliveries} deliver${deliveries === 1 ? 'y' : 'ies'}` : ''}, ${qtyText(progress.remainingQty)} still to come.${expectedText}`;
            break;
        case 'invoiced':
            title = 'Invoiced';
            detail = `${invoiceText ? `${invoiceText}. ` : ''}Mark it paid when you pay ${vendor}.`;
            break;
        case 'paid':
            title = 'Paid';
            detail = [day(data.paidDate) ? `on ${day(data.paidDate)}` : '', invoiceText].filter(Boolean).join(' · ') || `${vendor} is paid.`;
            break;
        case 'cant-fill':
            title = `${str(data.vendorName) || 'The supplier'} can’t fill it`;
            detail = str(data.clientDeclineReason) ? `“${str(data.clientDeclineReason)}”` : 'Change the order or pick another supplier, then send it again.';
            break;
        case 'receiving': {
            const total = receipt?.items.length || 0;
            const done = receipt?.applied.length || 0;
            title = 'Partly received';
            detail = `${done} of ${total} item${total === 1 ? '' : 's'} added to stock. Finish receiving adds the rest.`;
            break;
        }
        case 'received': {
            const stored = str(data.status);
            title = receipt ? 'Received into stock' : deliveries ? 'Delivered' : `Marked ${poStatusKind(stored) === 'delivered' && stored ? stored : 'Delivered'}`;
            const last = progress.deliveries.map((x) => x.date).filter(Boolean).sort().pop();
            detail = receipt
                ? `${receipt.items.length} item${receipt.items.length === 1 ? '' : 's'} added${day(receipt.doneAt) ? ` on ${day(receipt.doneAt)}` : ''}.`
                : deliveries
                    ? `${deliveries} deliver${deliveries === 1 ? 'y' : 'ies'}${last ? `, the last on ${day(last)}` : ''}. Add the supplier’s invoice when it comes.`
                    : 'Its items were not added to stock from here.';
            break;
        }
        case 'cancelled':
            title = 'Cancelled';
            detail = 'Nothing will be received.';
            break;
    }
    const canSend = stage === 'draft' || stage === 'sent' || stage === 'cant-fill';
    // older orders received half-way finish the older way; everything else records deliveries (one or several)
    const legacy = stage === 'receiving';
    const stockDone = Boolean(receipt) || progress.legacyDone;
    const canDeliver = !legacy && !!onDeliver && stage !== 'cancelled' && !stockDone && progress.remainingQty > 0 && !unfinished;
    const deliverLabel = stage === 'received' && !deliveries ? 'Add to stock' : 'Record delivery';
    const deliverFirst = stage === 'sent' || stage === 'confirmed' || stage === 'partial' || (stage === 'received' && !deliveries);
    const canPay = stage === 'invoiced' && !!onMarkPaid;
    const level = trackLevel(stage, progress.anyDelivered);
    const showTrack = stage !== 'draft' && stage !== 'cancelled' && stage !== 'cant-fill';

    return (
        <section aria-label="Order status" className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
                <div className="flex min-w-0 items-start gap-2.5">
                    <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[stage])} aria-hidden="true" />
                    <p className="text-sm">
                        <span className="font-semibold text-foreground">{title}</span>{detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
                        {late && <span className="font-semibold text-destructive"> Late: expected {day(expected)}.</span>}
                    </p>
                </div>
                {showTrack && (
                    <ol className="mt-2 flex items-center gap-1 pl-[18px] text-[10px] font-semibold uppercase tracking-wide" aria-label="Order progress">
                        {TRACK.map((t, i) => {
                            const reached = level >= i + 1;
                            const half = !reached && level > i && level < i + 1;
                            return (
                                <li key={t.id} className="flex items-center gap-1">
                                    <span className={cx('flex h-1 w-6 overflow-hidden rounded-full sm:w-9', reached ? 'bg-success' : 'bg-muted')} aria-hidden="true">
                                        {half && <span className="h-full w-1/2 bg-warning" />}
                                    </span>
                                    <span className={cx(reached ? 'text-foreground' : half ? 'text-warning' : 'text-muted-foreground/70')}>{half ? 'Part' : t.label}</span>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
            {(canSend || canDeliver || legacy || unfinished || canPay) && (
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                    {canSend && (
                        <button type="button" className={cx('btn btn-sm min-h-[40px]', deliverFirst ? 'btn-outline' : 'btn-primary')} onClick={onSend} disabled={busy}>
                            <SendIcon className="h-4 w-4" /> {stage === 'draft' ? 'Send to supplier' : 'Send again'}
                            {!paid && <span className="badge badge-primary ml-0.5">Premium</span>}
                        </button>
                    )}
                    {legacy && (
                        <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={onReceive} disabled={busy}>
                            <BoxIcon className="h-4 w-4" /> Finish receiving
                        </button>
                    )}
                    {unfinished && !legacy && onDeliver && (
                        <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => onDeliver(unfinished.id)} disabled={busy}>
                            <BoxIcon className="h-4 w-4" /> Finish delivery
                        </button>
                    )}
                    {canDeliver && (
                        <button type="button" className={cx('btn btn-sm min-h-[40px]', deliverFirst ? 'btn-primary' : 'btn-outline')} onClick={() => onDeliver?.()} disabled={busy}>
                            <BoxIcon className="h-4 w-4" /> {deliverLabel}
                        </button>
                    )}
                    {canPay && (
                        <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={onMarkPaid} disabled={busy}>
                            <CheckIcon className="h-4 w-4" /> Mark paid
                        </button>
                    )}
                </div>
            )}
        </section>
    );
};

/** "Saved suppliers…" select for the Vendor section header (fills name, email, phone, address). */
export const SavedSupplierPicker: React.FC<{
    suppliers: Supplier[];
    onPick: (s: Supplier) => void;
    onManage: () => void;
}> = ({ suppliers, onPick, onManage }) => (
    <>
        {suppliers.length > 0 && (
            <select
                className="input h-10 w-44 py-1.5 text-sm"
                aria-label="Fill from a saved supplier"
                value=""
                onChange={(e) => {
                    const s = suppliers.find((x) => x.id === e.target.value);
                    if (s) onPick(s);
                }}
            >
                <option value="">Saved suppliers…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
        )}
        <button type="button" className="btn btn-ghost btn-sm min-h-[40px]" onClick={onManage}>{suppliers.length ? 'Manage' : 'Saved suppliers'}</button>
    </>
);

/** Under the vendor fields: save the typed vendor as a supplier (or update the saved one). */
export const SaveVendorLine: React.FC<{
    state: 'none' | 'saved' | 'update' | 'new';
    busy?: boolean;
    note?: string | null;
    onSave: () => void;
}> = ({ state, busy, note, onSave }) => {
    if (state === 'none') return note ? <p className="text-xs text-muted-foreground">{note}</p> : null;
    if (state === 'saved') {
        return (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckIcon className="h-3.5 w-3.5 text-success" /> {note || 'Saved supplier'}
            </p>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={onSave} disabled={busy}>
                {busy ? 'Saving…' : state === 'update' ? 'Update saved supplier' : 'Save as supplier'}
            </button>
            <span className="text-xs text-muted-foreground">{note || (state === 'update' ? 'The email, phone or address differs from the saved one.' : 'Next time, pick it from Saved suppliers.')}</span>
        </div>
    );
};
