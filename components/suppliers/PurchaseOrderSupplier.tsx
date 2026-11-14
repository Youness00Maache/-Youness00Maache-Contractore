/**
 * Purchase order form pieces for supplier ordering:
 *  - OrderStatusStrip: where the order stands (draft → sent → confirmed by the supplier → received into stock) with
 *    [[Send to supplier]] (Premium) and [[Mark received]] (every plan)
 *  - SavedSupplierPicker / SaveVendorLine: fill the vendor from a saved supplier, or save the typed vendor as one
 */
import React from 'react';
import { BoxIcon, CheckIcon, SendIcon } from '../Icons.tsx';
import { cx } from '../commsKit.tsx';
import { parseStockReceipt, purchaseOrderStage, type PoStage, type Supplier } from '../../lib/suppliers.ts';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
const day = (iso: unknown) => {
    const t = Date.parse(str(iso));
    return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
};

const DOT: Record<PoStage, string> = {
    draft: 'bg-muted-foreground/60', sent: 'bg-primary', confirmed: 'bg-success', 'cant-fill': 'bg-destructive',
    receiving: 'bg-warning', received: 'bg-success', cancelled: 'bg-muted-foreground/60',
};

export const OrderStatusStrip: React.FC<{
    data: Record<string, unknown>;
    paid: boolean;
    onSend: () => void;
    onReceive: () => void;
    busy?: boolean;
}> = ({ data, paid, onSend, onReceive, busy }) => {
    const stage = purchaseOrderStage(data);
    const receipt = parseStockReceipt(data);
    const vendor = str(data.vendorName) || 'the supplier';
    const signer = str(data.clientSignerName) || str(data.clientSignedBy);
    let title = '';
    let detail = '';
    switch (stage) {
        case 'draft':
            title = 'Draft';
            detail = str(data.vendorEmail) ? `Not sent to ${vendor} yet.` : 'Add the supplier’s email to send it from your Gmail.';
            break;
        case 'sent':
            title = 'Sent';
            detail = `Waiting for ${vendor} to confirm. Mark it received when the goods arrive.`;
            break;
        case 'confirmed':
            title = `Confirmed by ${signer || vendor}`;
            detail = day(data.clientSignedAt) ? `on ${day(data.clientSignedAt)}. Mark it received when the goods arrive.` : 'Mark it received when the goods arrive.';
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
        case 'received':
            title = receipt ? 'Received into stock' : 'Marked Received';
            detail = receipt
                ? `${receipt.items.length} item${receipt.items.length === 1 ? '' : 's'} added${day(receipt.doneAt) ? ` on ${day(receipt.doneAt)}` : ''}.`
                : 'Its items were not added to stock from here.';
            break;
        case 'cancelled':
            title = 'Cancelled';
            detail = 'Nothing will be received.';
            break;
    }
    const canSend = stage === 'draft' || stage === 'sent' || stage === 'cant-fill';
    const canReceive = stage !== 'cancelled' && !(stage === 'received' && receipt);
    const receiveLabel = stage === 'receiving' ? 'Finish receiving' : stage === 'received' ? 'Add to stock' : 'Mark received';
    const receiveFirst = stage === 'sent' || stage === 'confirmed' || stage === 'receiving';

    return (
        <section aria-label="Order status" className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-start gap-2.5">
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[stage])} aria-hidden="true" />
                <p className="text-sm">
                    <span className="font-semibold text-foreground">{title}</span>{detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
                </p>
            </div>
            {(canSend || canReceive) && (
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                    {canSend && (
                        <button type="button" className={cx('btn btn-sm min-h-[40px]', receiveFirst ? 'btn-outline' : 'btn-primary')} onClick={onSend} disabled={busy}>
                            <SendIcon className="h-4 w-4" /> {stage === 'draft' ? 'Send to supplier' : 'Send again'}
                            {!paid && <span className="badge badge-primary ml-0.5">Premium</span>}
                        </button>
                    )}
                    {canReceive && (
                        <button type="button" className={cx('btn btn-sm min-h-[40px]', receiveFirst ? 'btn-primary' : 'btn-outline')} onClick={onReceive} disabled={busy}>
                            <BoxIcon className="h-4 w-4" /> {receiveLabel}
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
