/**
 * Job page › Subs › Quotes › "Compare": the quotes of one scope side by side. One column per quote (cheapest first), one row per
 * question (amount, how far above the lowest, lead time, how long the price holds, what is included and excluded, the file), the
 * best answer in each row in green and the gaps in amber, a few plain sentences above it, and the buttons under each column
 * (Choose this quote, Shortlist, Reject). Phone: the table scrolls sideways with the row names pinned on the left.
 * Rules: lib/subs/quoteCompare.ts (compareQuotes, comparisonMatrix); words: lib/subs/subView.ts.
 */
import React, { useMemo } from 'react';
import { comparisonMatrix, compareQuotes, type QuoteComparisonRow } from '../../lib/subs/quoteCompare.ts';
import { dayLabel, diffText, flagChips, flagWarnings, moneyText, quoteActionList, quoteHighlights, type SubTone } from '../../lib/subs/subView.ts';
import type { JobQuote, QuoteStatus } from '../../lib/subs/subTypes.ts';
import { cx } from '../commsKit.tsx';
import { StatusChip } from '../jobFiles/ui.tsx';

const SHOWN_ROWS = new Set(['amount', 'difference', 'lead_time', 'valid_until', 'inclusions', 'exclusions', 'document', 'received']);

const TONE_TEXT: Record<SubTone, string> = {
    primary: 'text-primary', warning: 'text-warning', success: 'text-success', danger: 'text-destructive', muted: 'text-muted-foreground',
};

export interface QuoteCompareProps {
    quotes: readonly JobQuote[];
    today: string;
    busyId: string | null;
    onSetStatus: (quote: JobQuote, to: QuoteStatus) => void;
    onOpenFile: (quote: JobQuote) => void;
}

const QuoteCompareTable: React.FC<QuoteCompareProps> = ({ quotes, today, busyId, onSetStatus, onOpenFile }) => {
    const rows = useMemo(() => compareQuotes(quotes, { today }), [quotes, today]);
    const matrix = useMemo(() => comparisonMatrix(rows).filter(r => SHOWN_ROWS.has(r.key)), [rows]);
    const sentences = useMemo(() => quoteHighlights(rows), [rows]);
    const byId = new Map<string, QuoteComparisonRow>(rows.map(r => [r.quote.id, r]));

    return (
        <div className="space-y-3" data-testid="quote-compare">
            {sentences.length > 0 && (
                <ul className="space-y-1 text-sm">
                    {sentences.map(s => <li key={s} className="flex gap-2"><span aria-hidden className="mt-2 h-1 w-3 shrink-0 rounded-full bg-primary/50" /><span>{s}</span></li>)}
                </ul>
            )}
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-max border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-border">
                            <th scope="col" className="sticky left-0 z-10 w-24 bg-card px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">From</th>
                            {rows.map(r => {
                                const chips = flagChips(r);
                                return (
                                    <th key={r.quote.id} scope="col" className={cx('min-w-[10.5rem] max-w-[15rem] px-3 py-2.5 text-left align-top font-normal', r.quote.status === 'rejected' && 'opacity-60')}>
                                        <span className="block text-sm font-bold leading-tight">{r.quote.vendorName || 'Unnamed'}</span>
                                        <span className="mt-1 flex flex-wrap gap-1">
                                            {chips.map(c => (
                                                <span key={c.key} className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4', c.tone === 'success' ? 'bg-success/10' : c.tone === 'danger' ? 'bg-destructive/10' : c.tone === 'warning' ? 'bg-warning/15' : c.tone === 'primary' ? 'bg-primary/10' : 'bg-muted', TONE_TEXT[c.tone])}>{c.text}</span>
                                            ))}
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.map(m => (
                            <tr key={m.key} className="border-b border-border/70 last:border-0">
                                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left align-top text-xs font-semibold text-muted-foreground">{m.label}</th>
                                {m.cells.map(cell => {
                                    const r = byId.get(cell.quoteId)!;
                                    const isDoc = m.key === 'document' && (r.quote.filePath || r.quote.url);
                                    return (
                                        <td key={cell.quoteId} className={cx('px-3 py-2 align-top', r.quote.status === 'rejected' && 'opacity-60', m.key === 'amount' && 'text-base font-bold tabular-nums', cell.best && 'font-semibold text-success', cell.warn && !cell.best && 'text-warning', (m.key === 'inclusions' || m.key === 'exclusions') && 'whitespace-pre-wrap break-words')}>
                                            {isDoc ? (
                                                <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onOpenFile(r.quote)}>{cell.text}</button>
                                            ) : m.key === 'amount' ? moneyText(r.quote.amount) : m.key === 'difference' ? diffText(r) : m.key === 'valid_until' ? (r.quote.validUntil ? dayLabel(r.quote.validUntil, today) : 'No date') : m.key === 'received' ? dayLabel(r.quote.receivedOn, today) : cell.text}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        <tr className="border-t border-border bg-muted/30">
                            <th scope="row" className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-left align-top text-xs font-semibold text-muted-foreground">Check</th>
                            {rows.map(r => {
                                const w = flagWarnings(r);
                                return (
                                    <td key={r.quote.id} className={cx('px-3 py-2 align-top text-xs', r.quote.status === 'rejected' && 'opacity-60')}>
                                        {w.length === 0 ? <span className="text-muted-foreground">Nothing missing</span> : <ul className="space-y-1 text-warning">{w.map(x => <li key={x}>{x}</li>)}</ul>}
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr className="border-t border-border">
                            <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2.5 text-left align-top text-xs font-semibold text-muted-foreground">Decide</th>
                            {rows.map(r => {
                                const acts = quoteActionList(r.quote.status).filter(a => a.to !== 'received');
                                return (
                                    <td key={r.quote.id} className="px-3 py-2.5 align-top">
                                        <div className="flex flex-col items-stretch gap-1.5">
                                            {r.quote.status === 'chosen' && <StatusChip tone="success" className="self-start">Chosen</StatusChip>}
                                            {acts.map(a => (
                                                <button key={a.to} type="button" disabled={busyId === r.quote.id} onClick={() => onSetStatus(r.quote, a.to)}
                                                    className={cx('btn btn-sm min-h-[40px] justify-center whitespace-normal text-center', a.primary ? 'btn-primary' : 'btn-outline')}>
                                                    {a.label}
                                                </button>
                                            ))}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p className="text-xs text-muted-foreground">Green is the best answer in a row, amber is something to ask about. Best value is only a suggestion: it adds a small allowance for missing details and a slower start.</p>
        </div>
    );
};

export default QuoteCompareTable;
