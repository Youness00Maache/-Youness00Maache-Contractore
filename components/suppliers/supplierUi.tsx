/**
 * Small shared pieces of the supplier screens (roadmap D4): the Premium prompt (same look as the Crew page's), the price
 * change badge, the tiny price-history line and the one "needs a connection" sentence.
 */
import React from 'react';
import { StarIcon } from '../Icons.tsx';
import { cx } from '../commsKit.tsx';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { isNotableChange, latestPriceChange, priceChangeLabel } from '../../lib/suppliers/priceChange.ts';
import { sparkline } from '../../lib/suppliers/libraryView.ts';
import type { PriceHistoryEntry } from '../../lib/suppliers/types.ts';
import { formatMoney } from '../../utils/money.ts';

/** What Premium adds, as an upgrade prompt: three plain lines, no icon grid. `lines` = [bold start, rest]. */
export const PremiumPrompt: React.FC<{ title: string; lines: Array<[string, string]>; onUpgrade?: () => void; className?: string }> = ({ title, lines, onUpgrade, className }) => (
    <section className={cx('overflow-hidden rounded-2xl border border-primary/30 bg-card', className)}>
        <div className="h-1 bg-primary" aria-hidden />
        <div className="p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
            <h3 className="mt-1 text-base font-bold leading-snug">{title}</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {lines.map(([bold, rest]) => <li key={bold}><span className="font-semibold text-foreground">{bold}</span> {rest}</li>)}
            </ul>
            {onUpgrade && <button type="button" className="btn btn-primary mt-4" onClick={onUpgrade}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>}
        </div>
    </section>
);

/** One-line Premium note for a single field / hint inside a form (with an optional Upgrade link). */
export const PremiumNote: React.FC<{ children: React.ReactNode; onUpgrade?: () => void }> = ({ children, onUpgrade }) => (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="badge badge-warning"><StarIcon className="h-3 w-3" /> Premium</span>
        <span className="min-w-0">{children}</span>
        {onUpgrade && <button type="button" className="font-semibold text-primary hover:underline" onClick={onUpgrade}>Upgrade</button>}
    </p>
);

/** The sentence for an action that needs a connection (lib/offline/connection.ts). */
export const OfflineLine: React.FC<{ className?: string }> = ({ className }) => (
    <p role="status" className={cx('rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground', className)}>{NEEDS_CONNECTION}</p>
);

const shortDate = (iso: string | null | undefined): string => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};
export { shortDate };

/**
 * The last price change of a catalogue item as a badge: a rise is red (you pay more), a fall green; under 5 % it is
 * quiet. Nothing for an item whose price never changed.
 */
export const PriceTrend: React.FC<{ history: readonly PriceHistoryEntry[]; className?: string }> = ({ history, className }) => {
    const change = latestPriceChange(history);
    if (change.flag !== 'up' && change.flag !== 'down') return null;
    const notable = isNotableChange(change);
    const tone = !notable ? 'badge-muted' : change.flag === 'up' ? 'badge-danger font-bold' : 'badge-success font-bold';
    return (
        <span className={cx('badge tabular-nums', tone, className)} title={`${change.flag === 'up' ? 'Went up' : 'Went down'} from ${formatMoney(change.oldPrice)} to ${formatMoney(change.newPrice)}${change.at ? ` on ${shortDate(change.at)}` : ''}`}>
            <span aria-hidden>{change.flag === 'up' ? '▲' : '▼'}</span> {priceChangeLabel(change)}
        </span>
    );
};

/** A tiny oldest -> newest line of the item's prices (nothing until the price has changed once). */
export const PriceSpark: React.FC<{ history: readonly PriceHistoryEntry[]; className?: string }> = ({ history, className }) => {
    const s = sparkline(history);
    if (!s) return null;
    const first = history[0];
    const last = history[history.length - 1];
    return (
        <svg
            viewBox="0 0 72 20" className={cx('h-5 w-[72px] shrink-0', s.trend === 'up' ? 'text-destructive' : s.trend === 'down' ? 'text-success' : 'text-muted-foreground', className)}
            fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" role="img"
            aria-label={`Price history, oldest to newest: ${formatMoney(first?.price)} to ${formatMoney(last?.price)}`}
        >
            <polyline points={s.points} />
            <circle cx={s.last.x} cy={s.last.y} r="2" fill="currentColor" stroke="none" />
        </svg>
    );
};
