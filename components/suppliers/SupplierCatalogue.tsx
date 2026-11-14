/**
 * One supplier's product catalogue (roadmap D4; Premium): what it sells (SKU, name, unit, price, product link, notes),
 * the price history of each item with an up / down badge, and the link to a price-book item. Rows are dense and open
 * in place to edit. Every write needs a connection (lib/suppliers/suppliersDb.ts); offline the screen says so.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, Field, InlineError, NumberInput, money } from '../viewKit.tsx';
import { ExternalLinkIcon, PlusIcon, SearchIcon } from '../Icons.tsx';
import { cx } from '../commsKit.tsx';
import { errorText } from '../../lib/offline/connection.ts';
import { createSupplierItem, deleteSupplierItem, linkSupplierItemToPriceBook, listPriceBookLibrary, listSupplierItems, updateSupplierItem } from '../../lib/suppliers/suppliersDb.ts';
import { SUPPLIER_ITEM_LIMITS, matchBySkuOrName } from '../../lib/suppliers/libraryLogic.ts';
import { filterCatalogue, historyRows, isWebUrl, normalizeUrl, urlProblem } from '../../lib/suppliers/libraryView.ts';
import { isNotableChange, latestPriceChange, priceChangeLabel } from '../../lib/suppliers/priceChange.ts';
import type { PriceBookLibraryItem, SupplierItemRecord, SupplierRecord } from '../../lib/suppliers/types.ts';
import { PriceSpark, PriceTrend, shortDate } from './supplierUi.tsx';
import { invalidateSupplierLibrary } from './libraryCache.ts';

const UNITS = ['each', 'ft', 'lin ft', 'sq ft', 'm', 'yd', 'gal', 'lb', 'box', 'bag', 'roll', 'sheet', 'pack', 'set'];

interface Draft {
    name: string;
    sku: string;
    unit: string;
    unitPrice: number;
    url: string;
    notes: string;
}

const blank = (): Draft => ({ name: '', sku: '', unit: '', unitPrice: 0, url: '', notes: '' });
const fromItem = (i: SupplierItemRecord): Draft => ({ name: i.name, sku: i.sku, unit: i.unit, unitPrice: i.unitPrice, url: i.url, notes: i.notes });

/** The editor of one item (new or existing): the fields, the price history and the price-book link. */
const ItemEditor: React.FC<{
    item: SupplierItemRecord | null;
    supplier: SupplierRecord;
    priceBook: PriceBookLibraryItem[];
    online: boolean;
    onSaved: (item: SupplierItemRecord, wasNew: boolean) => void;
    onDeleted: (id: string) => void;
    onClose: () => void;
}> = ({ item, supplier, priceBook, online, onSaved, onDeleted, onClose }) => {
    const [d, setD] = useState<Draft>(() => (item ? fromItem(item) : blank()));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [askDelete, setAskDelete] = useState(false);
    const [linking, setLinking] = useState(false);
    const [search, setSearch] = useState('');
    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
    const linkProblem = urlProblem(d.url);

    const book = useMemo(() => priceBook.filter((p) => !p.isAssembly), [priceBook]);
    const linked = item?.savedItemId ? book.find((p) => p.id === item.savedItemId) || null : null;
    const suggested = item && !item.savedItemId ? matchBySkuOrName({ sku: item.sku, name: item.name }, book)?.item || null : null;
    const found = useMemo(() => {
        const q = search.trim().toLowerCase();
        return book.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 8);
    }, [book, search]);

    const save = async () => {
        if (!d.name.trim()) { setError('Give the item a name.'); return; }
        if (linkProblem) { setError(linkProblem); return; }
        setBusy(true);
        setError(null);
        try {
            const input = { name: d.name, sku: d.sku, unit: d.unit, unitPrice: d.unitPrice, url: normalizeUrl(d.url), notes: d.notes };
            const saved = item ? await updateSupplierItem(item.id, input) : await createSupplierItem({ ...input, supplierId: supplier.id });
            invalidateSupplierLibrary();
            onSaved(saved, !item);
        } catch (e) {
            setError(errorText(e, 'The item could not be saved.'));
        } finally {
            setBusy(false);
        }
    };

    const link = async (savedItemId: string | null) => {
        if (!item) return;
        setBusy(true);
        setError(null);
        try {
            const saved = await linkSupplierItemToPriceBook(item.id, savedItemId);
            invalidateSupplierLibrary();
            setLinking(false);
            setSearch('');
            onSaved(saved, false);
        } catch (e) {
            setError(errorText(e, 'The link could not be saved.'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!item) return;
        setBusy(true);
        setError(null);
        try {
            await deleteSupplierItem(item.id);
            invalidateSupplierLibrary();
            setAskDelete(false);
            onDeleted(item.id);
        } catch (e) {
            setAskDelete(false);
            setError(errorText(e, 'The item could not be deleted.'));
        } finally {
            setBusy(false);
        }
    };

    const rows = item ? historyRows(item.priceHistory, 8) : [];

    return (
        <div className="mb-3 space-y-3 rounded-xl bg-muted/40 p-3">
            {error && <InlineError>{error}</InlineError>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <Field label="Item name *" htmlFor={`si-name-${item?.id || 'new'}`} className="col-span-2 sm:col-span-4">
                    <input id={`si-name-${item?.id || 'new'}`} className="input" value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={SUPPLIER_ITEM_LIMITS.name} placeholder="e.g. 2x4x8 stud" autoFocus={!item} />
                </Field>
                <Field label="SKU / part #" htmlFor={`si-sku-${item?.id || 'new'}`} className="col-span-2">
                    <input id={`si-sku-${item?.id || 'new'}`} className="input uppercase" value={d.sku} onChange={(e) => set('sku', e.target.value)} maxLength={SUPPLIER_ITEM_LIMITS.sku} />
                </Field>
                <Field label="Price *" htmlFor={`si-price-${item?.id || 'new'}`} className="col-span-1 sm:col-span-2">
                    <NumberInput id={`si-price-${item?.id || 'new'}`} className="font-semibold" value={d.unitPrice} onValue={(n) => set('unitPrice', n)} placeholder="0.00" />
                </Field>
                <Field label="Per unit" htmlFor={`si-unit-${item?.id || 'new'}`} className="col-span-1 sm:col-span-2">
                    <input id={`si-unit-${item?.id || 'new'}`} className="input" list="si-units" value={d.unit} onChange={(e) => set('unit', e.target.value)} maxLength={SUPPLIER_ITEM_LIMITS.unit} placeholder="each" />
                    <datalist id="si-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
                </Field>
                <Field label="Product link" htmlFor={`si-url-${item?.id || 'new'}`} className="col-span-2" error={linkProblem || undefined}>
                    <input id={`si-url-${item?.id || 'new'}`} className="input" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} value={d.url} onChange={(e) => set('url', e.target.value)} maxLength={SUPPLIER_ITEM_LIMITS.url} placeholder="https://" />
                </Field>
                <Field label="Notes" htmlFor={`si-notes-${item?.id || 'new'}`} className="col-span-2 sm:col-span-6">
                    <input id={`si-notes-${item?.id || 'new'}`} className="input" value={d.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} placeholder="Pack size, special order…" />
                </Field>
            </div>

            {item && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <p className="label mb-1">Price history</p>
                        {rows.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No prices recorded yet.</p>
                        ) : (
                            <ul className="space-y-0.5 text-xs">
                                {rows.map((r, i) => (
                                    <li key={`${r.at}-${i}`} className="flex items-baseline justify-between gap-2">
                                        <span className="text-muted-foreground">{shortDate(r.at)}</span>
                                        <span className="flex items-baseline gap-2">
                                            {r.change.flag === 'up' || r.change.flag === 'down' ? (
                                                <span className={cx('tabular-nums', r.change.flag === 'up' ? 'text-destructive' : 'text-success', isNotableChange(r.change) && 'font-bold')}>{priceChangeLabel(r.change)}</span>
                                            ) : null}
                                            <span className="font-semibold tabular-nums text-foreground">{money(r.price)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div>
                        <p className="label mb-1">Your price book</p>
                        {linked ? (
                            <div className="text-sm">
                                <p className="font-medium">{linked.name}{linked.sku ? <span className="text-muted-foreground"> · {linked.sku}</span> : null}</p>
                                <p className="text-xs text-muted-foreground">Your cost {money(linked.cost)}{Math.abs(linked.cost - item.unitPrice) >= 0.005 ? ` · this supplier ${money(item.unitPrice)}` : ' · same as this supplier'}</p>
                                <button type="button" className="mt-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50" onClick={() => void link(null)} disabled={busy || !online}>Unlink</button>
                            </div>
                        ) : linking ? (
                            <div className="space-y-1.5">
                                <div className="relative">
                                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input className="input h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your price book" aria-label="Search your price book" autoFocus />
                                </div>
                                <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card text-sm">
                                    {found.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No matching items.</li>}
                                    {found.map((p) => (
                                        <li key={p.id}>
                                            <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted disabled:opacity-50" onClick={() => void link(p.id)} disabled={busy || !online}>
                                                <span className="min-w-0 truncate">{p.name}{p.sku ? <span className="text-muted-foreground"> · {p.sku}</span> : null}</span>
                                                <span className="shrink-0 text-xs text-muted-foreground">{money(p.cost)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <button type="button" className="text-xs font-semibold text-muted-foreground hover:underline" onClick={() => setLinking(false)}>Cancel</button>
                            </div>
                        ) : (
                            <div className="space-y-1 text-sm">
                                {suggested && (
                                    <p className="text-xs text-muted-foreground">
                                        Looks like <span className="font-medium text-foreground">{suggested.name}</span>.{' '}
                                        <button type="button" className="font-semibold text-primary hover:underline disabled:opacity-50" onClick={() => void link(suggested.id)} disabled={busy || !online}>Link it</button>
                                    </p>
                                )}
                                <button type="button" className="text-xs font-semibold text-primary hover:underline disabled:opacity-50" onClick={() => setLinking(true)} disabled={!online || book.length === 0}>
                                    {book.length === 0 ? 'No price book items yet' : 'Link to a price-book item'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={save} disabled={busy || !online || !d.name.trim()}>{busy ? 'Saving…' : item ? 'Save item' : 'Add item'}</button>
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={onClose} disabled={busy}>{item ? 'Close' : 'Cancel'}</button>
                </div>
                {item && <button type="button" className="text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50" onClick={() => setAskDelete(true)} disabled={busy || !online}>Delete item</button>}
            </div>
            <ConfirmDialog
                open={askDelete}
                title={`Delete “${item?.name ?? ''}”?`}
                message="It leaves this supplier’s catalogue and its price history is lost. Your price book and old orders are not changed."
                confirmLabel="Delete item"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
                onCancel={() => setAskDelete(false)}
            />
        </div>
    );
};

const SupplierCatalogue: React.FC<{
    supplier: SupplierRecord;
    online: boolean;
    /** switch to the Price list tab */
    onImport: () => void;
    /** bumped by the parent after a price list was applied: reload */
    reloadKey?: number;
}> = ({ supplier, online, onImport, reloadKey = 0 }) => {
    const [items, setItems] = useState<SupplierItemRecord[] | null>(null);
    const [priceBook, setPriceBook] = useState<PriceBookLibraryItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [changedOnly, setChangedOnly] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);

    const load = async () => {
        setError(null);
        try {
            const [list, book] = await Promise.all([listSupplierItems({ supplierId: supplier.id }), listPriceBookLibrary().catch(() => [] as PriceBookLibraryItem[])]);
            setItems(list);
            setPriceBook(book);
        } catch (e) {
            setError(errorText(e, 'Could not load this catalogue.'));
            setItems((prev) => prev || []);
        }
    };
    useEffect(() => { void load(); }, [supplier.id, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const bookName = useMemo(() => new Map(priceBook.map((p) => [p.id, p])), [priceBook]);
    const shown = useMemo(() => filterCatalogue(items || [], query, { changedOnly }), [items, query, changedOnly]);
    const anyChanged = useMemo(() => (items || []).some((i) => isNotableChange(latestPriceChange(i.priceHistory))), [items]);

    const replace = (saved: SupplierItemRecord, wasNew: boolean) => {
        setItems((prev) => {
            const list = prev || [];
            return wasNew ? [...list, saved] : list.map((i) => (i.id === saved.id ? saved : i));
        });
        if (wasNew) setOpenId(null);
    };

    return (
        <div className="space-y-3">
            {error && <InlineError onRetry={() => void load()}>{error}</InlineError>}

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[10rem] flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input className="input h-10 pl-9" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search SKU or name" aria-label="Search this catalogue" />
                </div>
                {anyChanged && (
                    <button type="button" aria-pressed={changedOnly} onClick={() => setChangedOnly((v) => !v)}
                        className={cx('inline-flex h-10 items-center rounded-full border px-3 text-sm font-medium transition', changedOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
                        Price changed
                    </button>
                )}
                <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => setOpenId('new')} disabled={!online}><PlusIcon className="h-4 w-4" /> Add item</button>
            </div>

            {openId === 'new' && (
                <ItemEditor item={null} supplier={supplier} priceBook={priceBook} online={online} onSaved={replace} onDeleted={() => undefined} onClose={() => setOpenId(null)} />
            )}

            {items === null ? (
                <div className="space-y-2" aria-busy="true"><div className="skeleton h-12 w-full rounded-xl" /><div className="skeleton h-12 w-full rounded-xl" /></div>
            ) : items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    <p>Nothing in {supplier.name}’s catalogue yet.</p>
                    <p className="mt-1">Add what it sells one by one, or <button type="button" className="font-semibold text-primary hover:underline" onClick={onImport}>import its price list</button> (a CSV file).</p>
                </div>
            ) : shown.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">No items match.</p>
            ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                    {shown.map((i) => {
                        const change = latestPriceChange(i.priceHistory);
                        const notable = isNotableChange(change);
                        const open = openId === i.id;
                        const linked = i.savedItemId ? bookName.get(i.savedItemId) : null;
                        return (
                            <li key={i.id} className={cx('border-l-[3px] pl-2.5 pr-2', notable ? (change.flag === 'up' ? 'border-l-destructive' : 'border-l-success') : 'border-l-transparent')}>
                                <button type="button" className="flex min-h-[52px] w-full items-center gap-3 py-2 text-left" aria-expanded={open} onClick={() => setOpenId(open ? null : i.id)}>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-foreground">{i.name}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {[i.sku ? `SKU ${i.sku}` : '', i.unit ? `per ${i.unit}` : '', linked ? `price book: ${linked.name}` : '', i.lastPriceAt && change.flag !== 'new' ? `changed ${shortDate(i.lastPriceAt)}` : ''].filter(Boolean).join(' · ') || 'No SKU'}
                                        </span>
                                    </span>
                                    <PriceSpark history={i.priceHistory} className="hidden sm:block" />
                                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                                        <span className="text-sm font-bold tabular-nums text-foreground">{money(i.unitPrice)}</span>
                                        <PriceTrend history={i.priceHistory} />
                                    </span>
                                </button>
                                {open && (
                                    <ItemEditor item={i} supplier={supplier} priceBook={priceBook} online={online} onSaved={replace} onDeleted={(id) => { setItems((prev) => (prev || []).filter((x) => x.id !== id)); setOpenId(null); }} onClose={() => setOpenId(null)} />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {items && items.length > 0 && (
                <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{shown.length === items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : `${shown.length} of ${items.length} items`}. A price change is remembered automatically.</span>
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={onImport}>Import a price list</button>
                </p>
            )}
            {supplier.website && isWebUrl(supplier.website) && (
                <a href={normalizeUrl(supplier.website)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    <ExternalLinkIcon className="h-3.5 w-3.5" /> {supplier.name} website
                </a>
            )}
        </div>
    );
};

export default SupplierCatalogue;
