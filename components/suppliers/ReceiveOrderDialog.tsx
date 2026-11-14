/**
 * "Mark received": shows what the purchase order adds to stock (lines matched to inventory by link, else exact name),
 * then adds it ONCE (lib/suppliersApi.ts receivePurchaseOrder). Every plan.
 */
import React, { useEffect, useState } from 'react';
import { InlineError, Modal } from '../viewKit.tsx';
import { previewReceive, receivePurchaseOrder, type ReceiveResult } from '../../lib/suppliersApi.ts';
import type { ReceiveMove, ReceivePlan, UnmatchedLine } from '../../lib/suppliers.ts';

const qtyText = (m: ReceiveMove) => `${m.qty}${m.unit ? ` ${m.unit}` : ''}`;
const REASON: Record<UnmatchedLine['reason'], string> = {
    'not-in-inventory': 'not in your inventory',
    'several-items': 'several items have this name',
    kit: 'a kit: receive its parts',
};

const ReceiveOrderDialog: React.FC<{
    documentId: string;
    poLabel: string;
    onClose: () => void;
    onReceived: (result: ReceiveResult) => void;
}> = ({ documentId, poLabel, onClose, onReceived }) => {
    const [plan, setPlan] = useState<ReceivePlan | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let active = true;
        setLoadError(null);
        setPlan(null);
        previewReceive(documentId)
            .then(({ plan: p }) => { if (active) setPlan(p); })
            .catch((e) => { if (active) setLoadError(e instanceof Error ? e.message : 'Could not load the order.'); });
        return () => { active = false; };
    }, [documentId, reload]);

    const confirm = async () => {
        setBusy(true);
        setError(null);
        try {
            onReceived(await receivePurchaseOrder(documentId));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The stock could not be updated.');
            setBusy(false);
        }
    };

    const finishing = plan?.receipt && plan.receipt.state !== 'done';
    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="md"
            title={finishing ? 'Finish receiving' : 'Mark received'}
            description={<>{poLabel} · the quantities go into your inventory once.</>}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{plan?.status === 'ready' ? 'Cancel' : 'Close'}</button>
                    {plan?.status === 'ready' && (
                        <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
                            {busy ? 'Adding…' : `Add ${plan.moves.length} item${plan.moves.length === 1 ? '' : 's'} to stock`}
                        </button>
                    )}
                </>
            )}
        >
            <div className="space-y-4">
                <InlineError onRetry={() => setReload((n) => n + 1)}>{loadError}</InlineError>
                {error && <InlineError>{error}</InlineError>}
                {!plan && !loadError ? (
                    <div className="space-y-2" aria-busy="true">
                        <div className="skeleton h-5 w-2/3" />
                        <div className="skeleton h-24 w-full rounded-xl" />
                    </div>
                ) : plan && (
                    <>
                        {plan.status === 'already' && (
                            <p className="rounded-xl bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
                                Already received: this order’s items were added to stock{plan.receipt?.doneAt ? ` on ${new Date(plan.receipt.doneAt).toLocaleDateString()}` : ''}. Nothing is added twice.
                            </p>
                        )}
                        {plan.status === 'busy' && (
                            <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">
                                This order is being received on another device or tab right now. Wait a minute, then open Mark received again. Nothing is added twice.
                            </p>
                        )}
                        {plan.status === 'nothing' && (
                            <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">
                                None of the lines match an inventory item. Pick the items from Inventory on the order (the tag button on a line), or use their exact names, then try again.
                            </p>
                        )}
                        {plan.moves.length > 0 && (
                            <section>
                                <h3 className="label">Adds to stock</h3>
                                <ul className="divide-y divide-border rounded-xl border border-border">
                                    {plan.moves.map((m) => (
                                        <li key={m.itemId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                            <span className="min-w-0 truncate font-medium">{m.name}</span>
                                            <span className="shrink-0 font-semibold tabular-nums text-success">+{qtyText(m)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        {plan.status === 'ready' && plan.skipped.length > 0 && (
                            <p className="text-xs text-muted-foreground">Already added earlier: {plan.skipped.map((m) => `${m.name} (${qtyText(m)})`).join(', ')}.</p>
                        )}
                        {plan.unmatched.length > 0 && (
                            <section>
                                <h3 className="label">Not added</h3>
                                <ul className="space-y-1 text-sm text-muted-foreground">
                                    {plan.unmatched.map((u, i) => (
                                        <li key={`${u.description}-${i}`} className="flex justify-between gap-3">
                                            <span className="min-w-0 truncate">{u.description} × {u.qty}</span>
                                            <span className="shrink-0 text-xs">{REASON[u.reason]}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        {plan.status === 'ready' && (
                            <p className="text-xs text-muted-foreground">Each item gets a “Received PO …” entry in its stock history. The order is then marked Received and can’t be received again.</p>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default ReceiveOrderDialog;
