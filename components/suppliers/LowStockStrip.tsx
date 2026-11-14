/**
 * Inventory: one line under the numbers when items are at or below their low-stock alert level, with what is already
 * on order and [[Create reorder POs]] (Premium).
 */
import React from 'react';
import { cx } from '../commsKit.tsx';

const LowStockStrip: React.FC<{
    low: number;
    toOrder: number;
    onOrder: number;
    paid: boolean;
    onReorder: () => void;
    onShowLow: () => void;
}> = ({ low, toOrder, onOrder, paid, onReorder, onShowLow }) => {
    if (!low) return null;
    return (
        <div className="mb-4 flex flex-col gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between" role="status">
            <button type="button" className="flex min-w-0 items-start gap-2.5 text-left" onClick={onShowLow}>
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', toOrder ? 'bg-warning' : 'bg-success')} aria-hidden="true" />
                <span>
                    <span className="font-semibold">{low} item{low === 1 ? '' : 's'} low on stock</span>
                    <span className="text-muted-foreground">
                        {onOrder ? ` · ${onOrder} already on order` : ''}
                        {toOrder ? ` · ${toOrder} to reorder` : ' · all covered by open orders'}
                    </span>
                </span>
            </button>
            {toOrder > 0 && (
                <button type="button" className="btn btn-outline btn-sm min-h-[36px] shrink-0 self-start sm:self-auto" onClick={onReorder}>
                    Create reorder POs{!paid && <span className="badge badge-primary ml-1">Premium</span>}
                </button>
            )}
        </div>
    );
};

export default LowStockStrip;
