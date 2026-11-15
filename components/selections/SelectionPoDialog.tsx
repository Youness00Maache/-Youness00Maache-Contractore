/**
 * Job page › Selections › "Create purchase order": shows what the Draft purchase order of an approved selection will
 * contain BEFORE it is made (supplier, the one line at your cost, where it ships), then makes it and marks the selection
 * ordered. The supplier is the one on the option, else the best match from your suppliers and price book; you can change it.
 * If the order was made but the selection could not be linked to it (SelectionPoLinkError) the window says so and lets you
 * link it now ("Link it now"), so nothing is lost or made twice.
 */
import React, { useMemo, useState } from 'react';
import type { FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { describeError } from '../../lib/account.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { SelectionPoLinkError, createSelectionPurchaseOrder, markOrdered } from '../../lib/selections/selectionsApi.ts';
import type { JobSelection } from '../../lib/selections/selectionTypes.ts';
import { moneyText, poNumberOf, poPreview, supplierReason } from '../../lib/selections/selectionView.ts';
import { Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { useSelectionSuppliers } from './useSelectionSuppliers.ts';

const AUTO = '__auto__';
const NONE = '__none__';

const SelectionPoDialog: React.FC<{
    selection: JobSelection;
    job: Job;
    clientId: string | null;
    userId: string;
    profile: UserProfile | null;
    isOnline: boolean;
    onClose: () => void;
    /** the order was made and the selection is ordered */
    onDone: (selection: JobSelection, doc: FormDataType) => void;
    /** the order was made earlier and the link to the selection was fixed now */
    onLinked: (selection: JobSelection, doc: FormDataType) => void;
}> = ({ selection, job, clientId, userId, profile, isOnline, onClose, onDone, onLinked }) => {
    const sup = useSelectionSuppliers(userId, true, { withCatalogue: true });
    const [choice, setChoice] = useState<string>(AUTO);
    const [vendorName, setVendorName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [linkProblem, setLinkProblem] = useState<SelectionPoLinkError | null>(null);

    const preview = useMemo(() => poPreview(selection, { suppliers: sup.suppliers, priceBook: sup.book, supplierItems: sup.items }), [selection, sup.suppliers, sup.book, sup.items]);
    const picked = choice === AUTO ? preview?.supplier?.supplier ?? null : choice === NONE ? null : sup.suppliers.find(s => s.id === choice) ?? null;
    const poNumber = linkProblem ? poNumberOf(linkProblem.doc) : '';
    // the error text starts with the same sentence the window already says: keep only the reason
    const reason = linkProblem ? linkProblem.message.replace(/^The purchase order .*? could not be marked ordered\.\s*/, '').trim() : '';

    const create = async () => {
        if (busy) return;
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        setBusy(true);
        setError('');
        try {
            const res = await createSelectionPurchaseOrder({
                userId, job: { ...job, clientId: clientId || undefined } as Job & { clientId?: string | null }, profile, selection,
                supplier: picked, vendorName: picked ? undefined : vendorName.trim() || undefined,
            });
            onDone(res.selection, res.doc);
        } catch (e) {
            if (e instanceof SelectionPoLinkError) setLinkProblem(e);
            else setError(describeError(e, 'The purchase order could not be made.'));
        } finally {
            setBusy(false);
        }
    };

    const linkNow = async () => {
        if (!linkProblem || busy) return;
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        setBusy(true);
        setError('');
        try {
            const saved = await markOrdered(selection.id, linkProblem.doc.id);
            onLinked(saved, linkProblem.doc);
        } catch (e) {
            setError(describeError(e, 'It could not be linked yet.'));
        } finally {
            setBusy(false);
        }
    };

    // ------------------------------------------------------------------ the order exists, the link failed
    if (linkProblem) {
        return (
            <Modal
                open
                onClose={onClose}
                busy={busy}
                size="md"
                title="The order was made, but not linked"
                footer={(
                    <>
                        <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Not now</button>
                        <button type="button" className="btn btn-primary" onClick={() => { void linkNow(); }} disabled={busy}>{busy ? 'Linking…' : 'Link it now'}</button>
                    </>
                )}
            >
                <div className="space-y-3 text-sm leading-relaxed">
                    <p>
                        <span className="font-semibold">Purchase order {poNumber || ''}</span> is saved as a Draft under this job, so nothing is lost and it will not be made twice.
                        The selection could not be marked ordered with it, so it still says Approved.
                    </p>
                    {reason && <p className="text-muted-foreground">Reason: {reason}</p>}
                    <p>Tap <span className="font-semibold">Link it now</span> to try again. If it keeps failing, open the job&apos;s Documents, check the purchase order is there, then come back and use <span className="font-semibold">Mark ordered</span> on this selection.</p>
                    {error && <p className="font-medium text-destructive" role="alert">{error}</p>}
                </div>
            </Modal>
        );
    }

    // ------------------------------------------------------------------ the preview
    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="md"
            title="Create purchase order"
            description="A Draft purchase order for the choice your client made. Check it here; you send it to the supplier from the document."
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void create(); }} disabled={busy || !preview}>{busy ? 'Making it…' : 'Create purchase order'}</button>
                </>
            )}
        >
            {!preview ? (
                <p className="text-sm text-muted-foreground">The client has not chosen an option yet.</p>
            ) : (
                <div className="space-y-4">
                    {/* the one line, set out like the order will show it */}
                    <section aria-label="Order line" className="rounded-xl border border-border">
                        <p className="border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">One line · ships to the job site</p>
                        <div className="flex items-start justify-between gap-3 px-3.5 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold leading-5">{preview.description}</p>
                                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                                    {preview.quantity}{preview.unit ? ` ${preview.unit}` : ''} × {moneyText(preview.rate)} {preview.hasCost ? 'your cost' : 'client price'}
                                </p>
                                {preview.notes.map(n => <p key={n} className="mt-0.5 break-words text-xs text-muted-foreground">{n}</p>)}
                            </div>
                            <p className="shrink-0 text-base font-bold tabular-nums">{moneyText(preview.total)}</p>
                        </div>
                        {!preview.hasCost && (
                            <p className="border-t border-border bg-warning/10 px-3.5 py-2 text-xs text-foreground">This option has no cost saved, so the line uses the client&apos;s price. Check the price before you send the order.</p>
                        )}
                    </section>

                    {/* the supplier */}
                    <div>
                        {sup.available && sup.suppliers.length > 0 ? (
                            <>
                                <label htmlFor="po-sup" className="label">Supplier</label>
                                <select id="po-sup" className="input h-11" value={choice} onChange={e => setChoice(e.target.value)} disabled={busy}>
                                    <option value={AUTO}>{preview.supplier ? `Suggested: ${preview.supplier.supplier.name}` : 'No match: I will type the supplier'}</option>
                                    {sup.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    <option value={NONE}>Other: type a name</option>
                                </select>
                                {choice === AUTO && preview.supplier && (
                                    <p className="mt-1 text-xs text-muted-foreground">{preview.supplier.supplier.name} is {supplierReason(preview.supplier.reason)}.</p>
                                )}
                            </>
                        ) : (
                            <label htmlFor="po-vendor" className="label">Supplier name (optional)</label>
                        )}
                        {(!(sup.available && sup.suppliers.length > 0) || choice === NONE || (choice === AUTO && !preview.supplier)) && (
                            <input id="po-vendor" className="input mt-1 h-11" value={vendorName} onChange={e => setVendorName(e.target.value)} maxLength={80} placeholder="Who will you order it from?" disabled={busy} />
                        )}
                        {picked && picked.accountNumber && <p className="mt-1 text-xs text-muted-foreground">Your account number with them goes in the order notes.</p>}
                    </div>

                    <p className="text-xs text-muted-foreground">When you tap Create, this selection moves to Ordered and the order is filed under this job as a Draft purchase order.</p>
                    {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
                </div>
            )}
        </Modal>
    );
};

export default SelectionPoDialog;
