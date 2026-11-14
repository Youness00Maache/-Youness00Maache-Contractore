/**
 * Price-list import for one supplier (roadmap D4; Premium). Three steps, nothing is written before the last click:
 *   1. pick a CSV file (SKU / description / unit / price),
 *   2. REVIEW: every row against the supplier's catalogue and your price book (price changes with old -> new and the %,
 *      matches with your price book, rows that matched nothing, unchanged ones), tick what to apply; changes of 5 % or
 *      more are highlighted,
 *   3. Apply writes only the ticked rows, then a summary says what happened.
 * Logic: lib/suppliers/priceListCsv.ts (parse, diff, plan) and priceListReview.ts (ticks, counts).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InlineError, money } from '../viewKit.tsx';
import { cx } from '../commsKit.tsx';
import { errorText } from '../../lib/offline/connection.ts';
import { applyPriceListWrites, listPriceBookLibrary, listSupplierItems, type PriceListApplyResult } from '../../lib/suppliers/suppliersDb.ts';
import { diffPriceList, parsePriceList, type ParsedPriceList, type PriceListChange, type PriceListDiff } from '../../lib/suppliers/priceListCsv.ts';
import { priceChangeLabel } from '../../lib/suppliers/priceChange.ts';
import {
    NOTABLE_PCT, applySummaryText, changesOfKind, defaultSelection, diffHeadline, isNotableRow, onlyNotableUpdates, reviewSummary, setKind, summaryText, toggleKey, writesForSelection,
} from '../../lib/suppliers/priceListReview.ts';
import type { PriceBookLibraryItem, SupplierItemRecord, SupplierRecord } from '../../lib/suppliers/types.ts';
import { OfflineLine } from './supplierUi.tsx';
import { invalidateSupplierLibrary } from './libraryCache.ts';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PROBLEM_TEXT: Record<string, string> = {
    'no-price': 'no usable price', 'no-name': 'no SKU or name', duplicate: 'listed twice (the first one is used)', 'too-many-rows': 'too many rows (the file is cut here)',
};

const Tick: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
    <input type="checkbox" className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={checked} onChange={onChange} aria-label={label} />
);

const RowName: React.FC<{ c: PriceListChange }> = ({ c }) => (
    <span className="block min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{c.row.name || c.row.sku}</span>
        <span className="block truncate text-xs text-muted-foreground">
            {[c.row.sku ? `SKU ${c.row.sku}` : '', c.row.unit ? `per ${c.row.unit}` : '', `line ${c.row.line}`].filter(Boolean).join(' · ')}
        </span>
    </span>
);

const Section: React.FC<{
    title: string; note?: string; count: number; onAll?: () => void; onNone?: () => void; onBig?: () => void; children: React.ReactNode;
}> = ({ title, note, count, onAll, onNone, onBig, children }) => (
    <section className="overflow-hidden rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-3 py-2">
            <h4 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">· {count}</span></h4>
            <span className="flex items-center gap-3 text-xs font-semibold text-primary">
                {onBig && <button type="button" className="hover:underline" onClick={onBig}>Big changes only</button>}
                {onAll && <button type="button" className="hover:underline" onClick={onAll}>All</button>}
                {onNone && <button type="button" className="hover:underline" onClick={onNone}>None</button>}
            </span>
        </div>
        {note && <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{note}</p>}
        <ul className="divide-y divide-border/70">{children}</ul>
    </section>
);

const PriceBlock: React.FC<{ c: PriceListChange }> = ({ c }) => {
    if (c.kind !== 'update') return <span className="shrink-0 text-sm font-semibold tabular-nums">{money(c.row.price)}</span>;
    const up = c.change.flag === 'up';
    const notable = isNotableRow(c);
    return (
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-sm tabular-nums"><span className="text-muted-foreground line-through decoration-muted-foreground/50">{money(c.change.oldPrice)}</span> <span aria-hidden>→</span> <span className="font-bold">{money(c.change.newPrice)}</span></span>
            <span className={cx('badge tabular-nums', notable ? (up ? 'badge-danger font-bold' : 'badge-success font-bold') : 'badge-muted')}>
                <span aria-hidden>{up ? '▲' : '▼'}</span> {priceChangeLabel(c.change)}
            </span>
        </span>
    );
};

const PriceListImport: React.FC<{
    supplier: SupplierRecord;
    online: boolean;
    /** an apply wrote something: the catalogue should reload */
    onApplied: () => void;
    onBackToCatalogue: () => void;
}> = ({ supplier, online, onApplied, onBackToCatalogue }) => {
    const [ctx, setCtx] = useState<{ items: SupplierItemRecord[]; book: PriceBookLibraryItem[] } | null>(null);
    const [parsed, setParsed] = useState<ParsedPriceList | null>(null);
    const [fileName, setFileName] = useState('');
    const [diff, setDiff] = useState<PriceListDiff | null>(null);
    const [sel, setSel] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<PriceListApplyResult | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const loadCtx = async () => {
        try {
            const [items, book] = await Promise.all([listSupplierItems({ supplierId: supplier.id }), listPriceBookLibrary().catch(() => [] as PriceBookLibraryItem[])]);
            setCtx({ items, book });
            return { items, book };
        } catch (e) {
            setError(errorText(e, 'Could not load this supplier’s catalogue.'));
            return null;
        }
    };
    useEffect(() => { void loadCtx(); }, [supplier.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const summary = useMemo(() => (diff ? reviewSummary(diff, sel) : null), [diff, sel]);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setResult(null);
        if (/\.(xlsx?|ods|numbers)$/i.test(file.name)) { setError('Save the spreadsheet as a CSV file first (File, Save as, CSV), then choose it here.'); return; }
        if (file.size > MAX_FILE_BYTES) { setError('That file is larger than 5 MB. Split it into smaller price lists.'); return; }
        setBusy(true);
        try {
            const text = await file.text();
            const p = parsePriceList(text);
            if (p.error) { setError(p.error); return; }
            if (!p.rows.length) { setError('No rows with a price were found in that file.'); return; }
            const c = ctx || (await loadCtx());
            if (!c) return;
            const d = diffPriceList(p.rows, { supplierId: supplier.id, supplierItems: c.items, priceBook: c.book });
            setParsed(p);
            setFileName(file.name);
            setDiff(d);
            setSel(defaultSelection(d));
        } catch (e) {
            setError(errorText(e, 'That file could not be read.'));
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const reset = () => { setParsed(null); setDiff(null); setSel(new Set()); setResult(null); setError(null); setFileName(''); void loadCtx(); };

    const apply = async () => {
        if (!diff || !summary || !summary.writes) return;
        setBusy(true);
        setError(null);
        try {
            const res = await applyPriceListWrites(writesForSelection(diff, sel));
            invalidateSupplierLibrary();
            setResult(res);
            if (res.inserted || res.updated) onApplied();
        } catch (e) {
            setError(errorText(e, 'The price list could not be applied.'));
        } finally {
            setBusy(false);
        }
    };

    // ------------------------------------------------------------------------------------------------ done
    if (result) {
        return (
            <div className="space-y-3">
                <p role="status" className="rounded-xl bg-success/10 px-3 py-2.5 text-sm font-medium text-foreground">{applySummaryText(result)}</p>
                {result.failed.length > 0 && (
                    <ul className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {result.failed.map((f) => <li key={f.id}>{f.error}</li>)}
                    </ul>
                )}
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={onBackToCatalogue}>See the catalogue</button>
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={reset}>Import another file</button>
                </div>
            </div>
        );
    }

    // ------------------------------------------------------------------------------------------------ pick a file
    if (!diff || !parsed) {
        return (
            <div className="space-y-3">
                {error && <InlineError>{error}</InlineError>}
                <div className="rounded-xl border border-dashed border-border p-4 text-sm">
                    <p className="font-semibold text-foreground">Import {supplier.name}’s price list</p>
                    <p className="mt-1 text-muted-foreground">
                        Choose a CSV file with a price for each item: columns like <span className="font-medium text-foreground">SKU, Description, Unit, Price</span>.
                        You will see every change and tick what to apply before anything is saved.
                    </p>
                    <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} aria-label="Price list file" />
                    <button type="button" className="btn btn-outline mt-3" onClick={() => fileRef.current?.click()} disabled={busy || !ctx}>{busy ? 'Reading…' : ctx ? 'Choose a CSV file' : 'Loading…'}</button>
                    <p className="mt-2 text-xs text-muted-foreground">Prices like $1,234.50 or 1.234,50 are understood. Items are matched by SKU first, then by name.</p>
                </div>
            </div>
        );
    }

    // ------------------------------------------------------------------------------------------------ review
    const updates = changesOfKind(diff, 'update');
    const adds = changesOfKind(diff, 'add');
    const unmatched = changesOfKind(diff, 'unmatched');
    const unchanged = changesOfKind(diff, 'unchanged');
    const bigCount = updates.filter((c) => isNotableRow(c)).length;
    const row = (c: PriceListChange, extra?: React.ReactNode) => {
        const notable = isNotableRow(c);
        return (
            <li key={c.key} className={cx('border-l-[3px]', notable ? (c.change.flag === 'up' ? 'border-l-destructive' : 'border-l-success') : 'border-l-transparent')}>
                <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3 py-2">
                    <Tick checked={sel.has(c.key)} onChange={() => setSel((s) => toggleKey(s, c.key))} label={`Apply ${c.row.name || c.row.sku}`} />
                    <span className="min-w-0 flex-1">
                        <RowName c={c} />
                        {extra}
                    </span>
                    <PriceBlock c={c} />
                </label>
            </li>
        );
    };

    return (
        <div className="space-y-3">
            {error && <InlineError>{error}</InlineError>}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-sm"><span className="font-semibold">{fileName}</span> <span className="text-muted-foreground">· {diffHeadline(diff)}</span></p>
                <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={reset} disabled={busy}>Choose another file</button>
            </div>

            {parsed.problems.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">{parsed.problems.length} row{parsed.problems.length === 1 ? '' : 's'} skipped</summary>
                    <ul className="mt-1.5 space-y-0.5">
                        {parsed.problems.slice(0, 30).map((p) => <li key={`${p.line}-${p.reason}`} className="truncate">Line {p.line}: {PROBLEM_TEXT[p.reason] || p.reason}{p.text ? ` (${p.text})` : ''}</li>)}
                        {parsed.problems.length > 30 && <li>…and {parsed.problems.length - 30} more.</li>}
                    </ul>
                </details>
            )}

            {updates.length > 0 && (
                <Section
                    title="Price changes" count={updates.length}
                    note={bigCount ? `${bigCount} change${bigCount === 1 ? ' is' : 's are'} ${NOTABLE_PCT}% or more (marked in colour). A rise is red: you pay more.` : undefined}
                    onAll={() => setSel((s) => setKind(s, diff, 'update', true))} onNone={() => setSel((s) => setKind(s, diff, 'update', false))}
                    onBig={bigCount ? () => setSel((s) => onlyNotableUpdates(s, diff)) : undefined}
                >
                    {updates.map((c) => row(c))}
                </Section>
            )}

            {adds.length > 0 && (
                <Section
                    title="In your price book, new here" count={adds.length}
                    note="These are not in this supplier’s catalogue yet. They are added and linked to the price-book item."
                    onAll={() => setSel((s) => setKind(s, diff, 'add', true))} onNone={() => setSel((s) => setKind(s, diff, 'add', false))}
                >
                    {adds.map((c) => row(c, c.priceBookItem ? <span className="block truncate text-xs text-muted-foreground">links to {c.priceBookItem.name}</span> : null))}
                </Section>
            )}

            {unmatched.length > 0 && (
                <Section
                    title="Not matched" count={unmatched.length}
                    note="Not in this catalogue or in your price book. Tick the ones to add as new catalogue items."
                    onAll={() => setSel((s) => setKind(s, diff, 'unmatched', true))} onNone={() => setSel((s) => setKind(s, diff, 'unmatched', false))}
                >
                    {unmatched.map((c) => row(c))}
                </Section>
            )}

            {unchanged.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">{unchanged.length} unchanged</summary>
                    <ul className="mt-1.5 space-y-0.5">
                        {unchanged.slice(0, 60).map((c) => <li key={c.key} className="flex justify-between gap-2"><span className="truncate">{c.row.name || c.row.sku}</span><span className="tabular-nums">{money(c.row.price)}</span></li>)}
                        {unchanged.length > 60 && <li>…and {unchanged.length - 60} more.</li>}
                    </ul>
                </details>
            )}

            {diff.notInList.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">{diff.notInList.length} in your catalogue but not in this file</summary>
                    <p className="mt-1">They are left as they are; nothing is deleted.</p>
                    <ul className="mt-1.5 space-y-0.5">
                        {diff.notInList.slice(0, 60).map((n) => <li key={n.supplierItem.id} className="flex justify-between gap-2"><span className="truncate">{n.supplierItem.name}</span><span className="tabular-nums">{money(n.supplierItem.unitPrice)}</span></li>)}
                        {diff.notInList.length > 60 && <li>…and {diff.notInList.length - 60} more.</li>}
                    </ul>
                </details>
            )}

            {/* the Apply bar stays in view while the review scrolls */}
            <div className="sticky -bottom-4 -mx-5 -mb-4 space-y-2 border-t border-border bg-card px-5 pb-4 pt-3 sm:-mx-6 sm:px-6">
                {!online && <OfflineLine />}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-sm" aria-live="polite">
                        <span className="font-semibold">{summary ? summaryText(summary) : ''}</span>
                        {summary && summary.notable > 0 && <span className="text-muted-foreground"> · {summary.notable} price change{summary.notable === 1 ? '' : 's'} of {NOTABLE_PCT}% or more</span>}
                    </p>
                    <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => void apply()} disabled={busy || !online || !summary || summary.writes === 0}>
                        {busy ? 'Applying…' : summary && summary.writes ? `Apply ${summary.writes} change${summary.writes === 1 ? '' : 's'}` : 'Nothing to apply'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PriceListImport;
