/**
 * "What you do" (setup assistant, roadmap N8): the trades a contractor picks, and which starter kits they lead to.
 * The seven trades are the ones lib/assemblies/starterKits.ts has kits for, plus "Other" (no kits: the price book
 * stays theirs to fill). Pure.
 */
import { STARTER_KITS, STARTER_TRADES } from '../assemblies/starterKits.ts';

export const OTHER_TRADE_ID = 'other';

export const SETUP_TRADES: ReadonlyArray<{ id: string; label: string }> = [
    ...STARTER_TRADES.map(t => ({ id: t.id as string, label: t.label })),
    { id: OTHER_TRADE_ID, label: 'Other' },
];

const KNOWN = new Set(SETUP_TRADES.map(t => t.id));

/** Only known trades, each once, in the order of the list. */
export const normalizeTradeIds = (ids: readonly unknown[]): string[] => {
    const wanted = new Set(ids.filter((x): x is string => typeof x === 'string'));
    return SETUP_TRADES.filter(t => wanted.has(t.id)).map(t => t.id);
};

export const toggleTrade = (ids: readonly string[], id: string): string[] =>
    normalizeTradeIds(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

/** The starter kits of the chosen trades (ids, in the kit library's order). "Other" has none. */
export const kitIdsForTrades = (trades: readonly string[]): string[] => {
    const chosen = new Set(trades);
    return STARTER_KITS.filter(k => chosen.has(k.trade)).map(k => k.id);
};

/** Trades that bring kits (everything but "Other"). */
export const tradesWithKits = (trades: readonly string[]): string[] => normalizeTradeIds(trades).filter(t => t !== OTHER_TRADE_ID);
