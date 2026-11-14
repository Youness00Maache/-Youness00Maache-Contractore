/**
 * "Create reorder POs" (Premium): every low-stock item, grouped by supplier, with the quantity to order (the item's
 * own reorder quantity, else enough to reach twice its alert level, minus what is already on order) and its unit cost
 * (the item's cost, else the price book). One Draft purchase order per supplier, filed under a job (documents need
 * one: a "Shop stock" job by default). Free users see the list and an upgrade button.
 * With the suppliers table (`supplierRecords`, roadmap D4, Premium): a group with no saved supplier gets a suggestion
 * (the price-book item's preferred supplier, else the cheapest in the catalogues) with a [Use] button, and a line
 * whose supplier has it in the catalogue shows that supplier's price and orders at it. Without the table: unchanged.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { FormData as FormDataType, InventoryItem, Job, SavedItem, UserProfile } from '../../types.ts';
import { InlineError, Modal, NumberInput, getCurrentUserId, money } from '../viewKit.tsx';
import { cx } from '../commsKit.tsx';
import { StarIcon } from '../Icons.tsx';
import { onOrderByItem, planReorder, type ParsedReorder, type ReorderGroup, type ReorderLine, type Supplier } from '../../lib/suppliers.ts';
import { ReorderCreateError, createReorderPurchaseOrders, saveReorder, type OpenPurchaseOrder, type ReorderOrderInput } from '../../lib/suppliersApi.ts';
import { listPriceBookLibrary } from '../../lib/suppliers/suppliersDb.ts';
import { loadSupplierLibrary } from './libraryCache.ts';
import { reorderPriceFills, suggestForReorderGroup, suggestionReasonText, type GroupSuggestion, type PriceFill, type ReorderLineLike } from '../../lib/suppliers/libraryView.ts';
import type { PriceBookLibraryItem, SupplierItemRecord, SupplierRecord } from '../../lib/suppliers/types.ts';
import { todayISO } from '../forms/formUtils.ts';
import { errorText } from '../../lib/offline/connection.ts';

const NEW_JOB = '__new';
export const SHOP_JOB_NAME = 'Shop stock';
const q3 = (n: number) => Math.round(n * 1000) / 1000;

const ReorderModal: React.FC<{
    onClose: () => void;
    items: InventoryItem[];
    suppliers: Supplier[];
    /** the suppliers table rows (the database has it); null = the old list only: no suggestions, no catalogue prices */
    supplierRecords?: SupplierRecord[] | null;
    reorder: ParsedReorder;
    openOrders: OpenPurchaseOrder[];
    priceBook?: SavedItem[];
    jobs: Job[];
    userId: string | null;
    profile?: UserProfile;
    paid: boolean;
    onUpgrade?: (reason?: string) => void;
    onAddJob?: (job: Partial<Job>) => Promise<Job | null>;
    onCreated: (docs: FormDataType[], job: Job) => void;
    onOpenDocument?: (doc: FormDataType) => void;
    onManageSuppliers: () => void;
}> = ({ onClose, items, suppliers, supplierRecords = null, reorder, openOrders, priceBook, jobs, userId, profile, paid, onUpgrade, onAddJob, onCreated, onOpenDocument, onManageSuppliers }) => {
    const onOrder = useMemo(() => onOrderByItem(openOrders, items), [openOrders, items]);
    const groups = useMemo(
        () => planReorder({ items, suppliers, reorderQty: reorder.qty, onOrder, priceBook }),
        [items, suppliers, reorder.qty, onOrder, priceBook],
    );
    const lines = useMemo(() => groups.flatMap((g) => g.lines), [groups]);
    const [picked, setPicked] = useState<Record<string, boolean>>({});
    const [qty, setQty] = useState<Record<string, number>>({});
    const [assign, setAssign] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<FormDataType[] | null>(null);

    // defaults once per plan: tick what isn't covered by an open order, suggested quantities
    useEffect(() => {
        setPicked((prev) => Object.fromEntries(lines.map((l) => [l.itemId, prev[l.itemId] ?? !l.covered])));
        setQty((prev) => Object.fromEntries(lines.map((l) => [l.itemId, prev[l.itemId] ?? l.qty])));
    }, [lines]);

    const jobOptions = useMemo(() => [...jobs].sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.name.localeCompare(b.name)), [jobs]);
    const [jobChoice, setJobChoice] = useState<string>(() => {
        if (reorder.jobId && jobs.some((j) => j.id === reorder.jobId)) return reorder.jobId;
        return jobs.find((j) => j.name.trim().toLowerCase() === SHOP_JOB_NAME.toLowerCase())?.id || NEW_JOB;
    });

    const supplierFor = (g: ReorderGroup): Supplier | null => g.supplier || suppliers.find((s) => s.id === assign[g.key]) || null;

    // suppliers table + Premium: the catalogues and the price book, for suggestions and the supplier's own prices
    const catalogueOn = !!supplierRecords && paid;
    const [lib, setLib] = useState<{ items: SupplierItemRecord[]; book: PriceBookLibraryItem[] } | null>(null);
    useEffect(() => {
        if (!catalogueOn || !userId) return;
        let alive = true;
        Promise.all([loadSupplierLibrary(userId), listPriceBookLibrary()]).then(([l, b]) => { if (alive) setLib({ items: l.items, book: b }); }).catch(() => undefined);
        return () => { alive = false; };
    }, [catalogueOn, userId]);
    const toLike = (l: ReorderLine): ReorderLineLike => ({ itemId: l.itemId, name: l.name, sku: l.sku, unit: l.unit, unitCost: l.unitCost, supplierText: l.supplierText });
    const suggestions = useMemo(() => {
        const out = new Map<string, GroupSuggestion>();
        if (!lib || !supplierRecords) return out;
        for (const g of groups) {
            if (g.supplier) continue;
            const sg = suggestForReorderGroup(g.lines.map(toLike), { priceBook: lib.book, suppliers: supplierRecords, supplierItems: lib.items });
            if (sg) out.set(g.key, sg);
        }
        return out;
    }, [groups, lib, supplierRecords]); // eslint-disable-line react-hooks/exhaustive-deps
    /** the supplier's catalogue price for each line (item id) of a group that has a supplier */
    const fills = useMemo(() => {
        const out = new Map<string, PriceFill>();
        if (!lib) return out;
        for (const g of groups) {
            const s = supplierFor(g);
            if (s) reorderPriceFills(g.lines.map(toLike), lib.items, s.id).forEach((v, k) => out.set(k, v));
        }
        return out;
    }, [groups, assign, suppliers, lib]); // eslint-disable-line react-hooks/exhaustive-deps

    /** One order per resolved supplier (a group assigned to a saved supplier joins that supplier's order). */
    const orders = useMemo<ReorderOrderInput[]>(() => {
        const map = new Map<string, ReorderOrderInput>();
        for (const g of groups) {
            const s = supplierFor(g);
            const chosen: ReorderLine[] = g.lines.filter((l) => picked[l.itemId]).map((l) => ({ ...l, qty: q3(Math.max(0, qty[l.itemId] ?? l.qty)), unitCost: fills.get(l.itemId)?.price ?? l.unitCost })).filter((l) => l.qty > 0);
            if (!chosen.length) continue;
            const key = s ? s.id : g.key;
            const prev = map.get(key);
            map.set(key, prev ? { ...prev, lines: [...prev.lines, ...chosen] } : { group: { supplier: s, vendorName: s ? s.name : g.vendorName }, lines: chosen });
        }
        return Array.from(map.values());
    }, [groups, picked, qty, assign, suppliers, fills]); // eslint-disable-line react-hooks/exhaustive-deps

    const total = orders.reduce((s, o) => s + o.lines.reduce((t, l) => t + l.qty * l.unitCost, 0), 0);
    const missingEmail = orders.filter((o) => !o.group.supplier?.email).length;

    const create = async () => {
        if (!paid) { onUpgrade?.('Reorder purchase orders from low stock are part of Premium.'); return; }
        if (!orders.length) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { setError("You're offline. Reconnect, then create the orders."); return; }
        setBusy(true);
        setError(null);
        let job: Job | null = jobs.find((j) => j.id === jobChoice) || null;
        try {
            if (!job) {
                job = (await onAddJob?.({ name: SHOP_JOB_NAME, status: 'active', startDate: todayISO(), clientName: '', clientAddress: '' })) || null;
                if (!job?.id) throw new Error(`The “${SHOP_JOB_NAME}” job could not be created. Pick an existing job instead.`);
            }
            const uid = userId ?? (await getCurrentUserId());
            if (!uid) throw new Error('Your session has expired. Please sign in again.');
            const docs = await createReorderPurchaseOrders({ userId: uid, job, profile, orders });
            void saveReorder({ ...reorder, jobId: job.id }, items.map((i) => i.id)).catch(() => undefined);
            setCreated(docs);
            onCreated(docs, job);
        } catch (e) {
            if (e instanceof ReorderCreateError) {
                if (e.created.length && job) { setCreated(e.created); onCreated(e.created, job); }
                if (e.planLimit) onUpgrade?.(e.message);
            }
            setError(errorText(e, 'The purchase orders could not be created.'));
        } finally {
            setBusy(false);
        }
    };

    if (created) {
        return (
            <Modal
                open
                onClose={onClose}
                size="md"
                title={`${created.length} draft purchase order${created.length === 1 ? '' : 's'} created`}
                description="Check each one, then use Send to supplier. When the goods arrive, Mark received adds them to stock."
                footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}
            >
                {error && <div className="mb-3"><InlineError>{error}</InlineError></div>}
                <ul className="divide-y divide-border rounded-xl border border-border">
                    {created.map((doc) => {
                        const d = doc.data as unknown as Record<string, unknown>;
                        const n = Array.isArray(d.lineItems) ? d.lineItems.length : 0;
                        return (
                            <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{String(d.vendorName || 'No supplier yet')}</p>
                                    <p className="truncate text-xs text-muted-foreground">{String(d.poNumber || '')} · {n} item{n === 1 ? '' : 's'} · Draft</p>
                                </div>
                                {onOpenDocument && <button type="button" className="btn btn-outline btn-sm min-h-[36px] shrink-0" onClick={() => onOpenDocument(doc)}>Open</button>}
                            </li>
                        );
                    })}
                </ul>
            </Modal>
        );
    }

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title="Create reorder POs"
            description="Low-stock items grouped by supplier. Each supplier gets one Draft purchase order you can check before sending."
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    {paid ? (
                        <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !orders.length}>
                            {busy ? 'Creating…' : `Create ${orders.length || ''} draft PO${orders.length === 1 ? '' : 's'}${total > 0 ? ` · ${money(total)}` : ''}`}
                        </button>
                    ) : (
                        <button type="button" className="btn btn-primary" onClick={() => onUpgrade?.('Reorder purchase orders from low stock are part of Premium.')}>
                            <StarIcon className="h-4 w-4" /> Upgrade to create them
                        </button>
                    )}
                </>
            )}
        >
            <div className="space-y-4">
                {error && <InlineError>{error}</InlineError>}
                {!paid && (
                    <p className="rounded-xl border border-border px-3 py-2.5 text-sm">
                        <span className="font-semibold">Reorder POs are part of Premium</span> <span className="badge badge-primary ml-1">Premium</span>
                        <span className="mt-0.5 block text-muted-foreground">You can still create a purchase order by hand from any job, on every plan.</span>
                    </p>
                )}
                {!groups.length ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        Nothing is at or below its low-stock alert level. Set “Low-stock alert at” on an item to get reorder suggestions.
                    </p>
                ) : groups.map((g) => {
                    const s = supplierFor(g);
                    const allOn = g.lines.every((l) => picked[l.itemId]);
                    return (
                        <fieldset key={g.key} className="overflow-hidden rounded-2xl border border-border">
                            <legend className="sr-only">{g.vendorName || 'No supplier'}</legend>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                                <div className="min-w-0 text-sm">
                                    <span className="font-semibold">{s?.name || g.vendorName || 'No supplier'}</span>
                                    <span className="text-muted-foreground"> · {s?.email || (s ? 'no email saved' : g.vendorName ? 'not a saved supplier' : 'set Supplier on these items')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!g.supplier && suppliers.length > 0 && (
                                        <select className="input h-9 w-40 py-1 text-xs" aria-label={`Order ${g.vendorName || 'these items'} from`} value={assign[g.key] || ''} onChange={(e) => setAssign((a) => ({ ...a, [g.key]: e.target.value }))}>
                                            <option value="">{g.vendorName ? 'Keep this name' : 'Pick a supplier…'}</option>
                                            {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                        </select>
                                    )}
                                    <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setPicked((p) => ({ ...p, ...Object.fromEntries(g.lines.map((l) => [l.itemId, !allOn])) }))}>{allOn ? 'None' : 'All'}</button>
                                </div>
                            </div>
                            {suggestions.get(g.key) && !assign[g.key] && (() => {
                                const sg = suggestions.get(g.key) as GroupSuggestion;
                                return (
                                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-primary/5 px-3 py-1.5 text-xs">
                                        <span className="min-w-0"><span className="text-muted-foreground">Suggested:</span> <span className="font-semibold">{sg.supplier.name}</span>
                                            <span className="text-muted-foreground"> · {suggestionReasonText(sg.reason)}{sg.lines < sg.total ? ` · for ${sg.lines} of ${sg.total} items` : ''}</span></span>
                                        <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setAssign((a) => ({ ...a, [g.key]: sg.supplier.id }))}>Use {sg.supplier.name}</button>
                                    </p>
                                );
                            })()}
                            <ul className="divide-y divide-border/70">
                                {g.lines.map((l) => (
                                    <li key={l.itemId} className={cx('flex items-center gap-3 px-3 py-2', !picked[l.itemId] && 'opacity-60')}>
                                        <input type="checkbox" className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={!!picked[l.itemId]} onChange={(e) => setPicked((p) => ({ ...p, [l.itemId]: e.target.checked }))} aria-label={`Order ${l.name}`} />
                                        <div className="min-w-0 flex-1 text-sm">
                                            <p className="truncate font-medium">{l.name}</p>
                                            <p className={cx('truncate text-xs', l.stock <= 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                                {l.stock} {l.unit || 'in stock'} · alert at {l.threshold}
                                                {l.onOrder > 0 ? ` · ${l.onOrder} on order (${l.onOrderPos.join(', ')})` : ''}
                                                {fills.get(l.itemId)
                                                    ? ` · ${s?.name || 'supplier'} price ${money(fills.get(l.itemId)!.price)}${l.unitCost > 0 && Math.abs(l.unitCost - fills.get(l.itemId)!.price) >= 0.005 ? ` (was ${money(l.unitCost)})` : ''}`
                                                    : l.unitCost > 0 ? ` · ${money(l.unitCost)}${l.costSource === 'price book' ? ' (price book)' : ''}` : ' · no cost yet'}
                                            </p>
                                        </div>
                                        <label className="sr-only" htmlFor={`ro-${l.itemId}`}>Quantity to order</label>
                                        <NumberInput id={`ro-${l.itemId}`} className="h-9 w-20 shrink-0 py-1 text-center" value={qty[l.itemId] ?? l.qty} onValue={(n) => setQty((q) => ({ ...q, [l.itemId]: q3(Math.max(0, n)) }))} />
                                    </li>
                                ))}
                            </ul>
                        </fieldset>
                    );
                })}

                {groups.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="label" htmlFor="ro-job">File under job</label>
                            <select id="ro-job" className="input" value={jobChoice} onChange={(e) => setJobChoice(e.target.value)}>
                                <option value={NEW_JOB}>New job: {SHOP_JOB_NAME}</option>
                                {jobOptions.map((j) => <option key={j.id} value={j.id}>{j.name}{j.status !== 'active' ? ` (${j.status})` : ''}</option>)}
                            </select>
                            <p className="mt-1 text-xs text-muted-foreground">Stock orders aren’t a client’s cost: keep them on a shop job. Sent orders count in that job’s costs.</p>
                        </div>
                        <div className="text-sm sm:pt-6">
                            {missingEmail > 0 && <p className="text-xs text-muted-foreground">{missingEmail} order{missingEmail === 1 ? ' has' : 's have'} no supplier email yet: add it on the order before sending.</p>}
                            <button type="button" className="mt-1 text-xs font-semibold text-primary hover:underline" onClick={onManageSuppliers}>Manage suppliers</button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ReorderModal;
