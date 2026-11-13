import React, { useEffect, useMemo, useState } from 'react';
import type { InventoryItem, SavedItem } from '../../types.ts';
import { cn } from '../../lib/utils.ts';
import { formatMoney, toNumber } from '../../utils/money.ts';
import { BoxIcon, ExternalLinkIcon, SearchIcon, TagIcon, XCircleIcon } from '../Icons.tsx';

interface ItemPickerModalProps {
    open: boolean;
    onClose: () => void;
    savedItems: SavedItem[];
    inventoryItems: InventoryItem[];
    onPickSaved: (item: SavedItem) => void;
    onPickInventory: (item: InventoryItem) => void;
    showInventory?: boolean;
    showPriceBook?: boolean;
    title?: string;
    currency?: string;
}

const ItemPickerModal: React.FC<ItemPickerModalProps> = ({
    open, onClose, savedItems, inventoryItems, onPickSaved, onPickInventory, showInventory = true, showPriceBook = true, title = 'Add from catalog', currency = 'USD',
}) => {
    const [tab, setTab] = useState<'pricebook' | 'inventory'>(showPriceBook && (savedItems.length || !showInventory) ? 'pricebook' : 'inventory');
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (!open) return;
        setQuery('');
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const q = query.trim().toLowerCase();
    const saved = useMemo(
        () => savedItems.filter(i => !q || i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q)),
        [savedItems, q],
    );
    const inventory = useMemo(
        () => inventoryItems.filter(i => !q || i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)),
        [inventoryItems, q],
    );

    if (!open) return null;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel flex h-[85vh] flex-col sm:h-[70vh]" role="dialog" aria-modal="true" aria-labelledby="item-picker-title" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                    <h3 id="item-picker-title" className="text-lg font-semibold">{title}</h3>
                    <button type="button" className="btn btn-ghost h-10 w-10 p-0" onClick={onClose} aria-label="Close"><XCircleIcon className="h-5 w-5" /></button>
                </div>
                <div className="space-y-3 border-b border-border px-5 py-3">
                    {showInventory && showPriceBook && (
                        <div role="tablist" className="inline-flex rounded-xl border border-border bg-muted p-1">
                            {([['pricebook', 'Price book', TagIcon], ['inventory', 'Inventory', BoxIcon]] as const).map(([value, label, Icon]) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === value}
                                    onClick={() => setTab(value)}
                                    className={cn('flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold', tab === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
                                >
                                    <Icon className="h-4 w-4" /> {label}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="relative">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input className="input pl-9" placeholder={tab === 'pricebook' ? 'Search price book…' : 'Search inventory…'} value={query} onChange={e => setQuery(e.target.value)} autoFocus />
                    </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
                    {tab === 'pricebook' ? (
                        saved.length === 0 ? (
                            savedItems.length
                                ? <EmptyState icon={TagIcon} text="No items match your search." />
                                : (
                                    <EmptyState
                                        icon={TagIcon}
                                        text="Your price book is empty. Save any line with the save button next to it, or add your services and materials in the Price Book. Then pick them here with their prices."
                                        action={{ href: '/pricebook', label: 'Open Price Book' }}
                                    />
                                )
                        ) : saved.map(item => (
                            <button key={item.id} type="button" onClick={() => onPickSaved(item)} className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent">
                                <div className="flex items-start justify-between gap-3">
                                    <span className="font-medium text-foreground">{item.name}</span>
                                    <span className="shrink-0 font-semibold tabular-nums text-primary">{formatMoney(item.rate, currency)}</span>
                                </div>
                                {(item.description || item.is_assembly) && (
                                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.is_assembly ? 'Kit · ' : ''}{item.description}</p>
                                )}
                            </button>
                        ))
                    ) : inventory.length === 0 ? (
                        inventoryItems.length
                            ? <EmptyState icon={BoxIcon} text="No items match your search." />
                            : <EmptyState icon={BoxIcon} text="No inventory items yet. Add your stock in Inventory to pick it here and track quantities." action={{ href: '/inventory', label: 'Open Inventory' }} />
                    ) : inventory.map(item => {
                        const stock = toNumber(item.quantity);
                        const out = stock <= 0;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                disabled={out}
                                onClick={() => onPickInventory(item)}
                                className={cn('w-full rounded-xl border border-border p-3 text-left transition-colors', out ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/40 hover:bg-accent')}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <span className="font-medium text-foreground">{item.name}</span>
                                    <span className="shrink-0 tabular-nums text-sm text-muted-foreground">{formatMoney(item.cost_price, currency)} cost</span>
                                </div>
                                <p className={cn('mt-1 text-xs', out ? 'text-destructive' : stock <= (item.low_stock_threshold ?? 5) ? 'text-warning' : 'text-muted-foreground')}>
                                    {out ? 'Out of stock' : `${stock} ${item.unit || 'in stock'}`}{item.category ? ` · ${item.category}` : ''}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

/** `action` opens in a new tab so the document being edited (and its unsaved changes) stays open. */
const EmptyState: React.FC<{ icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; text: string; action?: { href: string; label: string } }> = ({ icon: Icon, text, action }) => (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Icon className="h-6 w-6" /></div>
        <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
        {action && (
            <a href={action.href} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm min-h-[40px]">
                <ExternalLinkIcon className="h-4 w-4" /> {action.label}
            </a>
        )}
        {action && <p className="max-w-xs text-xs text-muted-foreground">Opens in a new tab, so this document stays open. Reopen the document to see new items.</p>}
    </div>
);

export default ItemPickerModal;
