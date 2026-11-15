import React, { useState } from 'react';
import type { InventoryItem, LineItem, SavedItem } from '../../types.ts';
import { cn } from '../../lib/utils.ts';
import { formatMoney, isExcludedOptionalLine, lineItemDisplayAmount, lineItemScheduledValue, toNumber } from '../../utils/money.ts';
import { BoxIcon, ChevronDownIcon, PlusIcon, RulerIcon, SaveIcon, TagIcon, TrashIcon, CheckIcon } from '../Icons.tsx';
import { NumberInput } from './Fields.tsx';
import ItemPickerModal from './ItemPickerModal.tsx';
import { addLineToPriceBook } from './inventory.ts';
import { blankLineItem } from './formUtils.ts';
import { documentComponents } from '../../lib/assemblies/pricing.ts';
import { Spinner } from './Spinner.tsx';
import QuickMeasureSheet, { type QuickMeasureResult } from '../measure/QuickMeasureSheet.tsx';

export type LineItemsMode = 'standard' | 'progress';

interface LineItemsEditorProps {
    items: LineItem[];
    onChange: (items: LineItem[]) => void;
    mode?: LineItemsMode;
    /** shows an internal "Your cost" column (profit tools) */
    showCost?: boolean;
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    enablePicker?: boolean;
    enableInventory?: boolean;
    enableQuickAdd?: boolean;
    /** available stock for an inventory-linked line (null = not tracked) */
    availableStock?: (item: LineItem) => number | null;
    /**
     * Price used when an inventory item is picked onto a line with no price yet: 'sell' (documents sent to clients)
     * uses the item's sell price when one is known, else its cost; 'cost' (purchase orders) always uses the cost.
     */
    inventoryPrice?: 'sell' | 'cost';
    descriptionPlaceholder?: string;
    addLabel?: string;
    rateLabel?: string;
    amountLabel?: string;
    currency?: string;
    /**
     * Quick measure on every line (estimates, invoices, change orders): a calculator that fills the quantity and its
     * unit (components/measure/QuickMeasureSheet.tsx). `jobId` keys the "Recent on this job" list on the device.
     */
    quickMeasure?: { jobId?: string | null };
}

/*
 * Layouts are literal class strings so Tailwind can see them. Phones get stacked cards; wider screens a table.
 * The breakpoint grows with the number of columns.
 */
const LAYOUTS = {
    standard: {
        header: 'hidden sm:grid sm:grid-cols-[minmax(0,1fr)_84px_120px_112px_40px] sm:gap-3',
        row: 'relative rounded-xl border border-border bg-background/60 p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_84px_120px_112px_40px] sm:items-start sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0',
        nums: 'mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:contents',
        label: 'sm:hidden',
        amount: 'col-span-2 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm sm:col-span-1 sm:block sm:bg-transparent sm:px-0 sm:py-2.5 sm:text-right',
        remove: 'absolute right-2 top-2 sm:static',
        desc: 'pr-11 sm:pr-0',
        full: 'sm:col-span-full',
        divider: 'space-y-3 sm:space-y-2',
        wide: 'hidden sm:inline-flex',
    },
    cost: {
        header: 'hidden md:grid md:grid-cols-[minmax(0,1fr)_76px_112px_112px_112px_40px] md:gap-3',
        row: 'relative rounded-xl border border-border bg-background/60 p-3 md:grid md:grid-cols-[minmax(0,1fr)_76px_112px_112px_112px_40px] md:items-start md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:p-0',
        nums: 'mt-3 grid grid-cols-3 gap-2 md:mt-0 md:contents',
        label: 'md:hidden',
        amount: 'col-span-3 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm md:col-span-1 md:block md:bg-transparent md:px-0 md:py-2.5 md:text-right',
        remove: 'absolute right-2 top-2 md:static',
        desc: 'pr-11 md:pr-0',
        full: 'md:col-span-full',
        divider: 'space-y-3 md:space-y-2',
        wide: 'hidden md:inline-flex',
    },
    progress: {
        header: 'hidden lg:grid lg:grid-cols-[minmax(0,1fr)_72px_108px_84px_108px_112px_40px] lg:gap-3',
        row: 'relative rounded-xl border border-border bg-background/60 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_72px_108px_84px_108px_112px_40px] lg:items-start lg:gap-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0',
        nums: 'mt-3 grid grid-cols-2 gap-2 lg:mt-0 lg:contents',
        label: 'lg:hidden',
        amount: 'col-span-2 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm lg:col-span-1 lg:block lg:bg-transparent lg:px-0 lg:py-2.5 lg:text-right',
        remove: 'absolute right-2 top-2 lg:static',
        desc: 'pr-11 lg:pr-0',
        full: 'lg:col-span-full',
        divider: 'space-y-3 lg:space-y-2',
        wide: 'hidden lg:inline-flex',
    },
} as const;

const headerCell = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const smallLabel = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

const LineItemsEditor: React.FC<LineItemsEditorProps> = ({
    items, onChange, mode = 'standard', showCost = false, savedItems = [], inventoryItems = [], enablePicker = true,
    enableInventory = true, enableQuickAdd = true, availableStock, descriptionPlaceholder = 'Describe the work or material',
    addLabel = 'Add line', rateLabel = 'Rate', amountLabel = 'Amount', currency = 'USD', inventoryPrice = 'sell', quickMeasure,
}) => {
    const progress = mode === 'progress';
    const L = progress ? LAYOUTS.progress : showCost ? LAYOUTS.cost : LAYOUTS.standard;
    const [pickerFor, setPickerFor] = useState<string | null>(null);
    const [measureFor, setMeasureFor] = useState<string | null>(null);
    const [quickAdd, setQuickAdd] = useState<Record<string, 'saving' | 'saved' | { error: string }>>({});
    const [addedToBook, setAddedToBook] = useState<SavedItem[]>([]);
    const catalog = [...savedItems, ...addedToBook.filter(a => !savedItems.some(s => s.id === a.id))];

    const patchItem = (id: string, patch: Partial<LineItem>) => onChange(items.map(li => (li.id === id ? { ...li, ...patch } : li)));
    const removeItem = (id: string) => onChange(items.filter(li => li.id !== id));
    const addItem = () => onChange([...items, { ...blankLineItem(), ...(progress ? { percentComplete: 0 } : {}) }]);

    /** Puts a price book item on a line (from the line's picker or from Quick measure). */
    const applySaved = (lineId: string, s: SavedItem) => {
        // a kit stays ONE line at the kit price; its parts are listed under it. Labor and expense rows (roadmap N5) are
        // listed too, so the line shows what the price is made of (lib/assemblies/pricing.ts)
        const components = s.is_assembly && Array.isArray(s.assembly_items)
            ? documentComponents(s.assembly_items, catalog)
            : undefined;
        onChange(items.map(li => li.id !== lineId ? li : {
            ...li,
            description: s.name + (s.description && s.description !== s.name ? ` - ${s.description}` : ''),
            rate: toNumber(s.rate),
            unitCost: toNumber(s.unit_cost ?? s.cost),
            quantity: toNumber(li.quantity) > 0 ? li.quantity : 1,
            inventoryItemId: undefined,
            item_id: undefined,
            currentStock: undefined,
            track_inventory: false,
            itemSource: 'pricebook',
            isAssembly: Boolean(s.is_assembly),
            hideComponentsOnPdf: s.is_assembly ? true : undefined,
            isExpanded: false,
            assemblyComponents: components,
        }));
    };
    const pickSaved = (s: SavedItem) => {
        if (!pickerFor) return;
        applySaved(pickerFor, s);
        setPickerFor(null);
    };

    /** Sell price of an inventory item: a price stored on the row, else the price book item with the same name. */
    const sellPriceOf = (inv: InventoryItem): number | null => {
        const row = inv as InventoryItem & Record<string, unknown>;
        for (const v of [row.sell_price, row.price, row.unit_price, row.rate]) {
            if (v !== undefined && v !== null && v !== '' && toNumber(v) > 0) return toNumber(v);
        }
        const name = inv.name.trim().toLowerCase();
        const book = catalog.find(s => s.name.trim().toLowerCase() === name && toNumber(s.rate) > 0);
        return book ? toNumber(book.rate) : null;
    };

    /** Puts an inventory item on a line (from the line's picker or from Quick measure). */
    const applyInventory = (lineId: string, inv: InventoryItem) => {
        const cost = toNumber(inv.cost_price);
        const price = inventoryPrice === 'cost' ? cost : sellPriceOf(inv) ?? cost;
        onChange(items.map(li => li.id !== lineId ? li : {
            ...li,
            description: inv.name,
            // a price the user already typed is kept (as in the original app); only an empty price is filled
            rate: toNumber(li.rate) !== 0 ? li.rate : price,
            unitCost: cost,
            quantity: toNumber(li.quantity) > 0 ? li.quantity : 1,
            inventoryItemId: inv.id,
            item_id: inv.id,
            currentStock: toNumber(inv.quantity),
            track_inventory: true,
            itemSource: 'inventory',
            isAssembly: false,
            isExpanded: false,
            hideComponentsOnPdf: undefined,
            assemblyComponents: undefined,
        }));
    };
    const pickInventory = (inv: InventoryItem) => {
        if (!pickerFor) return;
        applyInventory(pickerFor, inv);
        setPickerFor(null);
    };

    /** "Use this quantity": the quantity, its unit and (only when ticked) the description with the measurement. */
    const applyMeasure = (lineId: string, r: QuickMeasureResult) =>
        patchItem(lineId, { quantity: r.quantity, unit: r.unit || undefined, ...(r.description !== undefined ? { description: r.description } : {}) });
    const measureLine = measureFor ? items.find(li => li.id === measureFor) ?? null : null;

    const saveToBook = async (li: LineItem) => {
        if (!li.description.trim() || quickAdd[li.id] === 'saving') return;
        const exists = catalog.some(s => s.name.trim().toLowerCase() === li.description.trim().toLowerCase());
        if (exists) { setQuickAdd(q => ({ ...q, [li.id]: 'saved' })); return; }
        setQuickAdd(q => ({ ...q, [li.id]: 'saving' }));
        try {
            const created = await addLineToPriceBook({ description: li.description, rate: toNumber(li.rate), unitCost: li.unitCost });
            setAddedToBook(a => [...a, created]);
            setQuickAdd(q => ({ ...q, [li.id]: 'saved' }));
        } catch (e) {
            setQuickAdd(q => ({ ...q, [li.id]: { error: e instanceof Error ? e.message : 'Could not save to the price book.' } }));
        }
    };

    // Always offered (even with an empty price book / inventory): the picker explains how to add items.
    const canPick = enablePicker;

    return (
        <div className="space-y-3">
            <div className={cn(L.header, 'px-1')}>
                <span className={headerCell}>Description</span>
                <span className={headerCell}>Qty</span>
                {showCost && !progress && <span className={headerCell}>Your cost</span>}
                <span className={headerCell}>{rateLabel}</span>
                {progress && <span className={headerCell}>% done</span>}
                {progress && <span className={headerCell}>Prev. billed</span>}
                <span className={cn(headerCell, 'text-right')}>{progress ? 'This invoice' : amountLabel}</span>
                <span />
            </div>

            <div className={L.divider}>
                {items.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No lines yet. Add your first item.</div>
                )}
                {items.map((li, index) => {
                    const stock = availableStock ? availableStock(li) : null;
                    const qty = toNumber(li.quantity);
                    const overStock = stock !== null && qty > stock;
                    const qa = quickAdd[li.id];
                    return (
                        <div key={li.id} className={L.row}>
                            <div className={cn('min-w-0', L.desc)}>
                                <label htmlFor={`li-desc-${li.id}`} className={cn(smallLabel, L.label)}>Item {index + 1}</label>
                                <div className="flex gap-1.5">
                                    <input
                                        id={`li-desc-${li.id}`}
                                        className="input"
                                        value={li.description}
                                        placeholder={descriptionPlaceholder}
                                        onChange={e => patchItem(li.id, { description: e.target.value })}
                                        aria-label={`Item ${index + 1} description`}
                                    />
                                    {canPick && (
                                        <button type="button" className="btn btn-outline h-[42px] w-[42px] shrink-0 p-0" onClick={() => setPickerFor(li.id)} title="Pick from price book or inventory" aria-label="Pick from price book or inventory">
                                            <TagIcon className="h-4 w-4" />
                                        </button>
                                    )}
                                    {enableQuickAdd && (
                                        <button
                                            type="button"
                                            className={cn('btn btn-outline h-[42px] w-[42px] shrink-0 p-0', qa === 'saved' && 'text-success')}
                                            onClick={() => saveToBook(li)}
                                            disabled={!li.description.trim() || qa === 'saving' || qa === 'saved'}
                                            title={qa === 'saved' ? 'In your price book' : 'Save this line to your price book'}
                                            aria-label="Save this line to your price book"
                                        >
                                            {qa === 'saving' ? <Spinner /> : qa === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}
                                        </button>
                                    )}
                                    {/* computers: next to the description; phones: "Measure" next to Qty */}
                                    {quickMeasure && (
                                        <button type="button" className={cn('btn btn-outline h-[42px] w-[42px] shrink-0 p-0', L.wide)} onClick={() => setMeasureFor(li.id)} title="Quick measure: room, area, linear, roof, volume" aria-label={`Quick measure for item ${index + 1}`}>
                                            <RulerIcon className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                {typeof qa === 'object' && <p className="mt-1 text-xs text-destructive">{qa.error}</p>}
                                {qa === 'saved' && <p className="mt-1 text-xs text-success">Saved to your price book.</p>}
                                {stock !== null && (
                                    <p className={cn('mt-1 flex items-center gap-1 text-xs', overStock ? 'font-medium text-warning' : 'text-muted-foreground')}>
                                        <BoxIcon className="h-3 w-3" />
                                        {overStock ? `Only ${Math.max(0, stock)} in stock` : `${stock} in stock`}
                                    </p>
                                )}
                            </div>

                            <div className={L.nums}>
                                <div className="min-w-0">
                                    {quickMeasure ? (
                                        <span className={cn(smallLabel, L.label, 'flex items-center justify-between gap-1')}>
                                            Qty
                                            <button
                                                type="button"
                                                onClick={() => setMeasureFor(li.id)}
                                                className="-my-2 -mr-1 inline-flex items-center gap-1 rounded-md px-1 py-2 normal-case tracking-normal text-primary"
                                                aria-label={`Quick measure for item ${index + 1}`}
                                            >
                                                <RulerIcon className="h-3.5 w-3.5" />
                                                <span className={showCost && !progress ? 'sr-only' : undefined}>Measure</span>
                                            </button>
                                        </span>
                                    ) : (
                                        <span className={cn(smallLabel, L.label)}>Qty</span>
                                    )}
                                    {/* negative quantities are credit lines (−1 × $500), as in the original app */}
                                    <NumberInput value={li.quantity} onValueChange={v => patchItem(li.id, { quantity: v })} allowNegative aria-label={`Item ${index + 1} quantity`} className="px-2.5 text-center" />
                                    {li.unit && (
                                        <button
                                            type="button"
                                            onClick={() => patchItem(li.id, { unit: undefined })}
                                            className="mt-1 flex w-full items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground"
                                            title="Unit of the quantity, printed after it on the PDF (42 sq ft). Click to remove it."
                                            aria-label={`Remove the unit ${li.unit} from item ${index + 1}`}
                                        >
                                            {li.unit} <span aria-hidden>×</span>
                                        </button>
                                    )}
                                </div>
                                {showCost && !progress && (
                                    <div className="min-w-0">
                                        <span className={cn(smallLabel, L.label)}>Your cost</span>
                                        <NumberInput value={li.unitCost ?? 0} onValueChange={v => patchItem(li.id, { unitCost: v })} decimals={2} maxDecimals={4} prefix="$" aria-label={`Item ${index + 1} your cost`} />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <span className={cn(smallLabel, L.label)}>{rateLabel}</span>
                                    <NumberInput value={li.rate} onValueChange={v => patchItem(li.id, { rate: v })} decimals={2} maxDecimals={4} prefix="$" allowNegative aria-label={`Item ${index + 1} ${rateLabel.toLowerCase()}`} />
                                </div>
                                {progress && (
                                    <div className="min-w-0">
                                        <span className={cn(smallLabel, L.label)}>% done</span>
                                        <NumberInput value={li.percentComplete ?? 0} onValueChange={v => patchItem(li.id, { percentComplete: v })} max={100} suffix="%" aria-label={`Item ${index + 1} percent complete`} />
                                    </div>
                                )}
                                {progress && (
                                    <div className="min-w-0">
                                        <span className={cn(smallLabel, L.label)}>Prev. billed</span>
                                        <NumberInput value={li.previouslyBilled ?? 0} onValueChange={v => patchItem(li.id, { previouslyBilled: v })} decimals={2} prefix="$" aria-label={`Item ${index + 1} previously billed`} />
                                    </div>
                                )}
                                <div className={L.amount}>
                                    <span className={cn('text-muted-foreground', L.label)}>{progress ? 'This invoice' : amountLabel}</span>
                                    {/* an optional add-on not in the total shows its price, muted */}
                                    <span className={cn('block font-semibold tabular-nums', isExcludedOptionalLine(li) ? 'text-muted-foreground' : 'text-foreground')}>{formatMoney(lineItemDisplayAmount(li, progress), currency)}</span>
                                    {progress && (
                                        <span className="hidden text-[11px] text-muted-foreground lg:block">of {formatMoney(lineItemScheduledValue(li), currency)}</span>
                                    )}
                                </div>
                            </div>

                            <div className={L.remove}>
                                <button type="button" onClick={() => removeItem(li.id)} className="btn btn-ghost h-10 w-10 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove item ${index + 1}`}>
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            </div>

                            {li.isAssembly && li.assemblyComponents && li.assemblyComponents.length > 0 && (
                                <div className={cn('mt-3', L.full)}>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <button type="button" className="btn btn-ghost btn-sm bg-accent text-accent-foreground" onClick={() => patchItem(li.id, { isExpanded: !li.isExpanded })}>
                                            <BoxIcon className="h-3.5 w-3.5" /> {li.isExpanded ? 'Hide kit contents' : 'View kit contents'}
                                            <ChevronDownIcon className={cn('h-3.5 w-3.5 transition-transform', li.isExpanded && 'rotate-180')} />
                                        </button>
                                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                                            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={li.hideComponentsOnPdf ?? true} onChange={e => patchItem(li.id, { hideComponentsOnPdf: e.target.checked })} />
                                            Hide contents on PDF
                                        </label>
                                    </div>
                                    {li.isExpanded && (
                                        <ul className="mt-2 space-y-1.5 border-l-2 border-primary/30 pl-4">
                                            {li.assemblyComponents.map((c, i) => (
                                                <li key={`${c.item_id}-${i}`} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                                                    <span className="font-medium text-foreground">{c.name}{c.kind && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-primary">{c.kind}</span>}</span>
                                                    <span className="tabular-nums text-muted-foreground">Qty {toNumber(c.quantity) * (qty || 1)} · {formatMoney(toNumber(c.rate) * toNumber(c.quantity), currency)} each kit</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={addItem}>
                <PlusIcon className="h-4 w-4" /> {addLabel}
            </button>

            <ItemPickerModal
                open={pickerFor !== null}
                onClose={() => setPickerFor(null)}
                savedItems={catalog}
                inventoryItems={inventoryItems}
                showInventory={enableInventory}
                onPickSaved={pickSaved}
                onPickInventory={pickInventory}
                currency={currency}
            />

            {quickMeasure && (
                <QuickMeasureSheet
                    open={measureLine !== null}
                    onClose={() => setMeasureFor(null)}
                    line={measureLine}
                    lineNumber={measureLine ? items.indexOf(measureLine) + 1 : 0}
                    jobId={quickMeasure.jobId}
                    onApply={r => { if (measureFor) applyMeasure(measureFor, r); }}
                    savedItems={catalog}
                    inventoryItems={inventoryItems}
                    showInventory={enableInventory}
                    currency={currency}
                    onPickSaved={enablePicker ? s => { if (measureFor) applySaved(measureFor, s); } : undefined}
                    onPickInventory={enablePicker && enableInventory ? inv => { if (measureFor) applyInventory(measureFor, inv); } : undefined}
                />
            )}
        </div>
    );
};

export default LineItemsEditor;
