/**
 * "Record delivery" (roadmap N2): what arrived, per line (default = everything still to come), the date and a note.
 * Lines picked from Inventory (or named exactly like an item) go into stock: ONLY this delivery's quantities, once per
 * delivery (lib/suppliersApi.ts recordDelivery). Other lines are tracked on the order only. With `deliveryId` it
 * finishes a delivery that stopped half-way (adds only the missing items). Every plan.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { InlineError, Modal } from '../viewKit.tsx';
import { NumberInput } from '../forms/Fields.tsx';
import { cx } from '../commsKit.tsx';
import { previewDelivery, recordDelivery, type DeliveryResult } from '../../lib/suppliersApi.ts';
import type { DeliveryPlan, ReceiveMove } from '../../lib/suppliers.ts';
import { newDeliveryId } from '../../lib/poLifecycle.ts';
import { errorText } from '../../lib/offline/connection.ts';
import { todayISO } from '../forms/formUtils.ts';

const q = (n: number) => String(Math.round(n * 1000) / 1000);
const moveText = (m: ReceiveMove) => `${q(m.qty)}${m.unit ? ` ${m.unit}` : ''}`;
const REASON: Record<string, string> = {
    'not-in-inventory': 'on the order only (not in inventory)',
    'several-items': 'on the order only (several items have this name)',
    kit: 'on the order only (a kit: receive its parts)',
};

const RecordDeliveryDialog: React.FC<{
    documentId: string;
    poLabel: string;
    /** finish this delivery (it stopped half-way) instead of recording a new one */
    deliveryId?: string;
    onClose: () => void;
    onRecorded: (result: DeliveryResult) => void;
}> = ({ documentId, poLabel, deliveryId, onClose, onRecorded }) => {
    // the idempotency key of this delivery: a retry or a double tap never adds it twice
    const [id] = useState(() => deliveryId || newDeliveryId());
    const [plan, setPlan] = useState<DeliveryPlan | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const [date, setDate] = useState(todayISO());
    const [note, setNote] = useState('');
    const [qty, setQty] = useState<Record<number, number>>({});

    useEffect(() => {
        let active = true;
        setLoadError(null);
        setPlan(null);
        previewDelivery(documentId, deliveryId || null)
            .then(({ plan: p }) => {
                if (!active) return;
                setPlan(p);
                setQty(Object.fromEntries(p.lines.filter((l) => l.remaining > 0).map((l) => [l.index, l.remaining])));
            })
            .catch((e) => { if (active) setLoadError(errorText(e, 'Could not load the order.')); });
        return () => { active = false; };
    }, [documentId, deliveryId, reload]);

    const open = useMemo(() => (plan ? plan.lines.filter((l) => l.ordered > 0) : []), [plan]);
    const toStock = useMemo(() => {
        const per = new Map<string, number>();
        for (const l of open) if (l.itemId && (qty[l.index] ?? 0) > 0) per.set(l.itemId, (per.get(l.itemId) || 0) + Math.min(l.remaining, qty[l.index] ?? 0));
        return per.size;
    }, [open, qty]);
    const entered = open.some((l) => l.remaining > 0 && (qty[l.index] ?? 0) > 0);
    const finishing = plan?.status === 'finish';
    const canRecord = plan?.status === 'ready' && entered;

    const confirm = async () => {
        setBusy(true);
        setError(null);
        try {
            onRecorded(await recordDelivery(documentId, { id, date, note, qty }));
        } catch (e) {
            setError(errorText(e, 'The delivery could not be recorded.'));
            setBusy(false);
        }
    };

    const setAll = (all: boolean) => setQty(Object.fromEntries(open.filter((l) => l.remaining > 0).map((l) => [l.index, all ? l.remaining : 0])));

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title={finishing ? 'Finish delivery' : 'Record delivery'}
            description={<>{poLabel} · {finishing ? 'adds only what is missing from this delivery.' : 'enter what arrived; each delivery goes into stock once.'}</>}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{plan?.status === 'ready' || finishing ? 'Cancel' : 'Close'}</button>
                    {finishing && plan && (
                        <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
                            {busy ? 'Adding…' : `Add ${plan.moves.length} item${plan.moves.length === 1 ? '' : 's'} to stock`}
                        </button>
                    )}
                    {plan?.status === 'ready' && (
                        <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy || !canRecord}>
                            {busy ? 'Recording…' : toStock ? `Record delivery · ${toStock} item${toStock === 1 ? '' : 's'} to stock` : 'Record delivery'}
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
                        <div className="skeleton h-32 w-full rounded-xl" />
                    </div>
                ) : plan && (
                    <>
                        {plan.status === 'already' && (
                            <p className="rounded-xl bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
                                {plan.existing ? 'This delivery is already in stock.' : 'Everything on this order was delivered.'} Nothing is added twice.
                            </p>
                        )}
                        {plan.status === 'busy' && (
                            <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">
                                This delivery is being added on another device or tab right now. Wait a minute, then open the order again. Nothing is added twice.
                            </p>
                        )}
                        {plan.status === 'nothing' && (
                            <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">This purchase order has no quantities to deliver. Add quantities to its lines first.</p>
                        )}
                        {plan.status === 'legacy' && (
                            <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">This order was partly received the older way. Use Finish receiving on the order first.</p>
                        )}
                        {plan.status === 'closed' && (
                            <p className="rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground">This order is cancelled. Change its status to record a delivery.</p>
                        )}
                        {plan.recovered.length > 0 && plan.status === 'ready' && (
                            <p className="text-xs text-muted-foreground">
                                {plan.recovered.length === 1 ? 'A delivery' : `${plan.recovered.length} deliveries`} found in the stock history but missing on the order (an older open copy was saved over it) count as delivered and will be written back.
                            </p>
                        )}

                        {finishing && (
                            <section>
                                <h3 className="label">Still to add to stock</h3>
                                <ul className="divide-y divide-border rounded-xl border border-border">
                                    {plan.moves.map((m) => (
                                        <li key={m.itemId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                            <span className="min-w-0 truncate font-medium">{m.name || 'Item'}</span>
                                            <span className="shrink-0 font-semibold tabular-nums text-success">+{moveText(m)}</span>
                                        </li>
                                    ))}
                                </ul>
                                {plan.skipped.length > 0 && (
                                    <p className="mt-2 text-xs text-muted-foreground">Already added: {plan.skipped.map((m) => `${m.name || 'Item'} (${moveText(m)})`).join(', ')}.</p>
                                )}
                            </section>
                        )}

                        {plan.status === 'ready' && (
                            <>
                                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                                    <label className="block text-sm">
                                        <span className="label">Delivered on</span>
                                        <input type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
                                    </label>
                                    <label className="block text-sm">
                                        <span className="label">Note (optional)</span>
                                        <input type="text" className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Packing slip #, driver, damaged box…" />
                                    </label>
                                </div>
                                <section aria-label="Delivered quantities">
                                    <div className="mb-1.5 flex items-center justify-between gap-2">
                                        <h3 className="label mb-0">What arrived</h3>
                                        <span className="flex gap-1 text-xs">
                                            <button type="button" className="btn btn-ghost btn-sm min-h-[32px] px-2" onClick={() => setAll(true)}>All still to come</button>
                                            <button type="button" className="btn btn-ghost btn-sm min-h-[32px] px-2" onClick={() => setAll(false)}>Clear</button>
                                        </span>
                                    </div>
                                    <ul className="divide-y divide-border rounded-xl border border-border">
                                        {open.map((l) => {
                                            const done = l.remaining <= 0;
                                            const value = qty[l.index] ?? 0;
                                            return (
                                                <li key={l.index} className={cx('flex items-center gap-3 px-3 py-2.5', done && 'opacity-60')}>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">{l.description || `Line ${l.index + 1}`}</p>
                                                        <p className="text-[11px] text-muted-foreground tabular-nums">
                                                            {/* ordered · delivered so far · still to come: a tiny ledger, not a card */}
                                                            ordered {q(l.ordered)}{l.unit ? ` ${l.unit}` : ''}
                                                            {l.delivered > 0 ? ` · ${q(l.delivered)} in` : ''}
                                                            {done ? ' · all here' : ` · ${q(l.remaining)} to come`}
                                                            {!done && !l.itemId && l.reason ? <span className="block">{REASON[l.reason] || REASON['not-in-inventory']}</span> : null}
                                                            {!done && l.itemId ? <span className="block text-success">→ stock: {l.itemName}</span> : null}
                                                        </p>
                                                    </div>
                                                    {done ? (
                                                        <span className="shrink-0 text-xs font-semibold text-success">Delivered</span>
                                                    ) : (
                                                        <span className="w-24 shrink-0">
                                                            <NumberInput
                                                                value={value}
                                                                onValueChange={(v) => setQty((prev) => ({ ...prev, [l.index]: Math.min(l.remaining, Math.max(0, v)) }))}
                                                                max={l.remaining}
                                                                maxDecimals={3}
                                                                aria-label={`Delivered now: ${l.description || `line ${l.index + 1}`}`}
                                                                className="h-9 py-1.5 text-right"
                                                            />
                                                        </span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                                <p className="text-xs text-muted-foreground">
                                    Stock goes up only by this delivery’s quantities (a “Delivery of PO …” entry in each item’s history). The order
                                    becomes Partially delivered, or Delivered when nothing is left.
                                </p>
                            </>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default RecordDeliveryDialog;
