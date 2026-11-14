/**
 * "Product" section of a price-book item (roadmap D4), shown only once the database has the product-library columns
 * (useSuppliersReady). It edits three optional fields; the item's own Save writes them (PriceBookView.saveItem):
 *   Product link   the supplier's page for this item                         every plan
 *   Specs          simple label / value list (Size, Color, Model...)          every plan
 *   Preferred supplier + "cheapest known supplier" + margin impact           Premium (from the supplier catalogues)
 * Writes need a connection: offline the fields are read-only and the app's usual offline sentence is shown.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Field, XIcon, money } from '../viewKit.tsx';
import { ExternalLinkIcon, PlusIcon } from '../Icons.tsx';
import { MAX_SPECS, impactSentence, isWebUrl, normalizeUrl, productHints, specProblem, urlProblem, type LibraryDraft } from '../../lib/suppliers/libraryView.ts';
import type { SupplierItemRecord, SupplierRecord } from '../../lib/suppliers/types.ts';
import { useOnline, useSuppliersReady, useUid } from './supplierHooks.ts';
import { loadSupplierLibrary } from './libraryCache.ts';
import { OfflineLine, PremiumNote } from './supplierUi.tsx';

const SPEC_LABELS = ['Brand', 'Model', 'Size', 'Color', 'Finish', 'Material', 'Rating', 'Warranty'];

const ProductLibrarySection: React.FC<{
    /** the saved item's id (none for a new item) */
    itemId?: string;
    name: string;
    sku: string;
    /** the item's current cost, client price and markup (the form's live values) */
    cost: number;
    rate: number;
    markup: number | null;
    isKit: boolean;
    value: LibraryDraft;
    onChange: (next: LibraryDraft) => void;
    paid: boolean;
    onUpgrade?: (reason?: string) => void;
    /** "Use as my cost": sets the item's cost field to a supplier's price */
    onUseCost: (price: number) => void;
}> = ({ itemId, name, sku, cost, rate, markup, isKit, value, onChange, paid, onUpgrade, onUseCost }) => {
    const ready = useSuppliersReady();
    const online = useOnline();
    const uid = useUid();
    const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
    const [supplierItems, setSupplierItems] = useState<SupplierItemRecord[]>([]);
    const premiumOn = ready === 'ready' && paid && !isKit;

    useEffect(() => {
        if (!premiumOn || !online || !uid) return;
        let alive = true;
        loadSupplierLibrary(uid)
            .then((lib) => { if (alive) { setSuppliers(lib.suppliers); setSupplierItems(lib.items); } })
            .catch(() => undefined);
        return () => { alive = false; };
    }, [premiumOn, online, uid]);

    const hints = useMemo(
        () => (premiumOn ? productHints({ id: itemId || '', sku, name, cost, rate, markup }, value.supplierId, supplierItems, suppliers.filter((s) => !s.archived)) : null),
        [premiumOn, itemId, sku, name, cost, rate, markup, value.supplierId, supplierItems, suppliers],
    );

    if (ready !== 'ready') return null;

    const linkProblem = urlProblem(value.url);
    const specError = specProblem(value.specs);
    const set = (patch: Partial<LibraryDraft>) => onChange({ ...value, ...patch });
    const setSpec = (i: number, patch: Partial<{ key: string; value: string }>) => set({ specs: value.specs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
    const chosen = value.supplierId ? suppliers.find((s) => s.id === value.supplierId) : undefined;
    const activeSuppliers = suppliers.filter((s) => !s.archived);

    return (
        <section className="space-y-4" aria-label="Product details">
            <h3 className="text-sm font-semibold text-foreground">Product</h3>
            {!online && <OfflineLine />}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Product link" htmlFor="pb-url" error={linkProblem || undefined} hint="The supplier’s page for this item. Only you see it.">
                    <div className="flex items-center gap-2">
                        <input id="pb-url" className="input min-w-0 flex-1" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} value={value.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" maxLength={1000} disabled={!online} />
                        {value.url.trim() && isWebUrl(value.url) && (
                            <a href={normalizeUrl(value.url)} target="_blank" rel="noopener noreferrer" className="btn btn-outline h-10 w-10 shrink-0 p-0" aria-label="Open the product page"><ExternalLinkIcon className="h-4 w-4" /></a>
                        )}
                    </div>
                </Field>

                {!isKit && (paid ? (
                    <Field label="Preferred supplier" htmlFor="pb-supplier" hint="Suggested first when you reorder this item.">
                        <select id="pb-supplier" className="input" value={value.supplierId || ''} onChange={(e) => set({ supplierId: e.target.value || null })} disabled={!online}>
                            <option value="">None</option>
                            {activeSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            {chosen?.archived && <option value={chosen.id}>{chosen.name} (archived)</option>}
                            {value.supplierId && !chosen && <option value={value.supplierId}>Saved supplier</option>}
                        </select>
                    </Field>
                ) : (
                    <div className="sm:pt-6">
                        <PremiumNote onUpgrade={onUpgrade ? () => onUpgrade('Preferred suppliers and the cheapest-supplier hint are part of Premium.') : undefined}>
                            Preferred supplier and the cheapest known price.
                        </PremiumNote>
                    </div>
                ))}
            </div>

            {hints && (hints.cheapest || hints.impact) && (
                <div className="space-y-1.5 rounded-xl border-l-[3px] border-l-primary bg-muted/40 px-3 py-2.5 text-sm" role="status">
                    {hints.cheapest && (
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>
                                <span className="text-muted-foreground">Cheapest known:</span> <span className="font-semibold">{hints.cheapest.supplier.name}</span> {money(hints.cheapest.price)}
                                {hints.cheapest.supplierItem.unit ? <span className="text-muted-foreground"> per {hints.cheapest.supplierItem.unit}</span> : null}
                                {hints.savingPerUnit !== null && hints.savingPerUnit >= 0.005 && <span className="text-success"> · {money(hints.savingPerUnit)} below your cost</span>}
                                {hints.savingPerUnit !== null && hints.savingPerUnit <= -0.005 && <span className="text-muted-foreground"> · {money(-hints.savingPerUnit)} above your cost</span>}
                            </span>
                            {Math.abs(hints.cheapest.price - cost) >= 0.005 && (
                                <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => onUseCost(hints.cheapest!.price)}>Use as my cost</button>
                            )}
                        </p>
                    )}
                    {hints.offers.length > 1 && (
                        <p className="text-xs text-muted-foreground">Also: {hints.offers.slice(1, 4).map((o) => `${o.supplier.name} ${money(o.price)}`).join(' · ')}</p>
                    )}
                    {hints.impact && <p className="text-xs text-muted-foreground">{impactSentence(hints.impact)}</p>}
                </div>
            )}
            {premiumOn && hints && !hints.cheapest && suppliers.length > 0 && (
                <p className="text-xs text-muted-foreground">No supplier catalogue has this item yet. Add it in Inventory › Suppliers › Catalogue (or import a price list) to see the cheapest price here.</p>
            )}

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <p className="label mb-0">Specs</p>
                    {value.specs.length < MAX_SPECS && (
                        <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50" onClick={() => set({ specs: [...value.specs, { key: '', value: '' }] })} disabled={!online}>
                            <PlusIcon className="h-3.5 w-3.5" /> Add spec
                        </button>
                    )}
                </div>
                {value.specs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Size, color, model, rating… whatever you need to buy the right one. Only you see them.</p>
                ) : (
                    <ul className="space-y-2">
                        {value.specs.map((r, i) => (
                            <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2">
                                <input className="input h-10" list="pb-spec-labels" value={r.key} onChange={(e) => setSpec(i, { key: e.target.value })} placeholder="Label" aria-label={`Spec ${i + 1} label`} maxLength={80} disabled={!online} />
                                <input className="input h-10" value={r.value} onChange={(e) => setSpec(i, { value: e.target.value })} placeholder="Value" aria-label={`Spec ${i + 1} value`} maxLength={500} disabled={!online} />
                                <button type="button" className="btn btn-ghost h-10 w-10 p-0 text-muted-foreground hover:text-destructive" aria-label={`Remove spec ${i + 1}`} onClick={() => set({ specs: value.specs.filter((_, idx) => idx !== i) })} disabled={!online}><XIcon className="h-4 w-4" /></button>
                            </li>
                        ))}
                    </ul>
                )}
                <datalist id="pb-spec-labels">{SPEC_LABELS.map((l) => <option key={l} value={l} />)}</datalist>
                {specError && <p className="text-xs text-destructive" role="alert">{specError}</p>}
            </div>
        </section>
    );
};

export default ProductLibrarySection;
