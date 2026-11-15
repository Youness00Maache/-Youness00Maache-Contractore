/**
 * Settings > Integrations & data > Price list: "Import price list" into the PRICE BOOK (Premium, like the supplier
 * price-list import; a Free account sees the upgrade prompt). Three steps, nothing is written before the last click:
 *   1. say whether the prices are what you CHARGE or what you PAY, and choose a CSV file (SKU / description / unit / price),
 *   2. REVIEW: price changes with old -> new and the percent (big ones marked), new items, rows that cannot be used,
 *      unchanged ones. Price changes are ticked, new items are not; tick what to apply,
 *   3. Apply saves only the ticked rows through the price book's own save path (offline: kept on the device and synced
 *      later), then a summary says what happened.
 * The price book keeps no change history, so there is no undo button: before applying, the old prices of the ticked
 * items can be saved to a file, and importing that file here puts them back.
 * Logic: lib/integrations/priceBookImport.ts (reuses the supplier importer's CSV reader). Saving: priceBookImportApi.ts.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InlineError, money } from '../viewKit.tsx';
import { PremiumPrompt } from '../suppliers/supplierUi.tsx';
import { errorText } from '../../lib/offline/connection.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { priceChangeLabel } from '../../lib/suppliers/priceChange.ts';
import {
    BIG_CHANGE_PCT, NEW_ITEM_TYPES, PRICE_FIELDS, UNMATCHED_TEXT, applyOutcomeText, changesOfKind, defaultSelection, diffHeadline, diffPriceBook, isBigChange,
    onlyBigChanges, parsePriceList, planPriceBookApply, priceBackupCsv, priceBackupFileName, reviewSummary, setKind, summaryText, toggleKey,
    type ApplyOutcome, type BookItem, type ImportChange, type NewItemType, type ParsedPriceList, type PriceField,
} from '../../lib/integrations/priceBookImport.ts';
import { downloadTextFile } from '../../lib/integrations/integrationsApi.ts';
import { applyPriceBookWrites, loadPriceBookForImport } from './priceBookImportApi.ts';
import { Group, Note, Segmented, cx, plural } from './ui.tsx';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PROBLEM_TEXT: Record<string, string> = {
    'no-price': 'no usable price', 'no-name': 'no SKU or name', duplicate: 'listed twice (the first one is used)', 'too-many-rows': 'too many rows (the file is cut here)',
};

const Tick: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
    <input type="checkbox" className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={checked} onChange={onChange} aria-label={label} />
);

const Block: React.FC<{ title: string; note?: string; count: number; onAll?: () => void; onNone?: () => void; onBig?: () => void; children: React.ReactNode }> = ({ title, note, count, onAll, onNone, onBig, children }) => (
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

const Price: React.FC<{ c: ImportChange }> = ({ c }) => {
    if (c.kind !== 'update') return <span className="shrink-0 text-sm font-semibold tabular-nums">{money(c.row.price)}</span>;
    const up = c.change.flag === 'up';
    const big = isBigChange(c);
    return (
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-sm tabular-nums">
                <span className="text-muted-foreground line-through decoration-muted-foreground/50">{money(c.change.oldPrice)}</span> <span aria-hidden>→</span> <span className="font-bold">{money(c.change.newPrice)}</span>
            </span>
            <span className={cx('badge tabular-nums', big ? (up ? 'badge-danger font-bold' : 'badge-success font-bold') : 'badge-muted')}>
                <span aria-hidden>{up ? '▲' : '▼'}</span> {priceChangeLabel(c.change)}
            </span>
        </span>
    );
};

const PriceListImportPanel: React.FC<{
    paid: boolean;
    onUpgradeClick?: () => void;
    /** an apply wrote something: the app's copy of the price book should reload */
    onChanged?: () => void;
}> = ({ paid, onUpgradeClick, onChanged }) => {
    const [book, setBook] = useState<{ items: BookItem[]; fromDevice: boolean } | null>(null);
    const [field, setField] = useState<PriceField>('rate');
    const [newType, setNewType] = useState<NewItemType>('service');
    const [parsed, setParsed] = useState<ParsedPriceList | null>(null);
    const [fileName, setFileName] = useState('');
    const [sel, setSel] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ApplyOutcome | null>(null);
    const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

    const loadBook = async () => {
        try {
            const b = await loadPriceBookForImport();
            setBook(b);
            return b;
        } catch (e) {
            setError(errorText(e, 'Could not load your price book.'));
            return null;
        }
    };
    useEffect(() => { if (paid) void loadBook(); }, [paid]); // eslint-disable-line react-hooks/exhaustive-deps

    const diff = useMemo(() => (parsed && book ? diffPriceBook(parsed.rows, book.items, field) : null), [parsed, book, field]);
    useEffect(() => { setSel(diff ? defaultSelection(diff) : new Set()); }, [diff]);
    const summary = useMemo(() => (diff ? reviewSummary(diff, sel) : null), [diff, sel]);

    if (!paid) {
        return (
            <div className="pt-4">
                <PremiumPrompt
                    title="Update your price book from a price list"
                    lines={[
                        ['Upload a CSV.', 'SKU, description, unit and price: no retyping.'],
                        ['Review before anything changes.', 'Old price, new price and the percent, with big changes marked.'],
                        ['You choose.', 'Tick what to apply; everything else is left alone.'],
                    ]}
                    onUpgrade={onUpgradeClick}
                />
            </div>
        );
    }

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setResult(null);
        if (/\.(xlsx?|ods|numbers)$/i.test(file.name)) { setError('Save the spreadsheet as a CSV file first (File, Save as, CSV), then choose it here.'); return; }
        if (file.size > MAX_FILE_BYTES) { setError('That file is larger than 5 MB. Split it into smaller price lists.'); return; }
        setBusy(true);
        try {
            const p = parsePriceList(await file.text());
            if (p.error) { setError(p.error); return; }
            if (!p.rows.length) { setError('No rows with a price were found in that file.'); return; }
            if (!book && !(await loadBook())) return;
            setParsed(p);
            setFileName(file.name);
        } catch (e) {
            setError(errorText(e, 'That file could not be read.'));
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const reset = () => { setParsed(null); setSel(new Set()); setResult(null); setError(null); setFileName(''); void loadBook(); };

    const apply = async () => {
        if (!diff || !summary || !summary.writes) return;
        setBusy(true);
        setError(null);
        try {
            const res = await applyPriceBookWrites(planPriceBookApply(diff, sel, { newItemType: newType }));
            setResult(res);
            if (res.updated || res.created) onChanged?.();
        } catch (e) {
            setError(errorText(e, 'The price list could not be applied.'));
        } finally {
            setBusy(false);
        }
    };

    const saveOldPrices = () => { if (diff) downloadTextFile(priceBackupCsv(diff, sel), priceBackupFileName(field, todayYMD())); };

    // ------------------------------------------------------------------------------------------------------ done
    if (result) {
        return (
            <div className="space-y-3 pt-4">
                <p role="status" className="rounded-xl bg-success/10 px-3 py-2.5 text-sm font-medium text-foreground">{applyOutcomeText(result)}</p>
                {result.failed.length > 0 && (
                    <ul className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {result.failed.slice(0, 20).map((f, i) => <li key={`${f.name}-${i}`}>{f.name}: {f.error}</li>)}
                    </ul>
                )}
                <Note>There is no undo button: the price book does not keep a history. If you saved the old prices before applying, choose that file here to put them back.</Note>
                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={reset}>Import another file</button>
            </div>
        );
    }

    // ------------------------------------------------------------------------------------------------ choose a file
    if (!diff || !parsed) {
        return (
            <div className="space-y-4 pt-4">
                {error && <InlineError>{error}</InlineError>}
                <p className="text-sm text-muted-foreground">
                    Change many prices at once from a CSV file. You will see every change and tick what to apply before anything is saved. Items are matched by SKU first, then by name.
                </p>
                <Group label="The prices in the file are">
                    <Segmented label="What the prices are" value={field} options={PRICE_FIELDS.map((f) => ({ value: f.id, text: f.label }))} onChange={(v) => setField(v as PriceField)} />
                    <p className="mt-1.5 text-xs text-muted-foreground">{PRICE_FIELDS.find((f) => f.id === field)!.about}</p>
                </Group>
                <div className="rounded-xl border border-dashed border-border p-4 text-sm">
                    <p className="font-semibold text-foreground">Choose a CSV file</p>
                    <p className="mt-1 text-muted-foreground">Columns like <span className="font-medium text-foreground">SKU, Description, Unit, Price</span>. Prices like $1,234.50 or 1.234,50 are understood.</p>
                    <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} aria-label="Price list file" />
                    <button type="button" className="btn btn-outline mt-3 min-h-[44px]" onClick={() => fileRef.current?.click()} disabled={busy || !book}>
                        {busy ? 'Reading…' : book ? 'Import price list' : 'Loading your price book…'}
                    </button>
                    {book && <p className="mt-2 text-xs text-muted-foreground">{plural(book.items.length, 'item')} in your price book{book.fromDevice ? ' (the copy saved on this device)' : ''}.</p>}
                </div>
                <Note>Kits are never changed by an import: their price comes from their parts. The price book keeps no history, so there is no undo; the review lets you save the old prices first.</Note>
            </div>
        );
    }

    // ----------------------------------------------------------------------------------------------------- review
    const updates = changesOfKind(diff, 'update');
    const news = changesOfKind(diff, 'new');
    const unmatched = changesOfKind(diff, 'unmatched');
    const unchanged = changesOfKind(diff, 'unchanged');
    const big = updates.filter((c) => isBigChange(c)).length;
    const field_ = PRICE_FIELDS.find((f) => f.id === field)!;

    const row = (c: ImportChange, extra?: React.ReactNode) => (
        <li key={c.key} className={cx('border-l-[3px]', isBigChange(c) ? (c.change.flag === 'up' ? 'border-l-destructive' : 'border-l-success') : 'border-l-transparent')}>
            <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3 py-2">
                <Tick checked={sel.has(c.key)} onChange={() => setSel((s) => toggleKey(s, c.key))} label={`Apply ${c.row.name || c.row.sku}`} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{c.item?.name || c.row.name || c.row.sku}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                        {[c.row.sku ? `SKU ${c.row.sku}` : '', c.row.unit ? `per ${c.row.unit}` : '', `line ${c.row.line}`].filter(Boolean).join(' · ')}
                    </span>
                    {extra}
                </span>
                <Price c={c} />
            </label>
        </li>
    );

    return (
        <div className="space-y-3 pt-4">
            {error && <InlineError>{error}</InlineError>}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-sm"><span className="font-semibold">{fileName}</span> <span className="text-muted-foreground">· {diffHeadline(diff)}</span></p>
                <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={reset} disabled={busy}>Choose another file</button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Segmented label="What the prices are" value={field} options={PRICE_FIELDS.map((f) => ({ value: f.id, text: f.label }))} onChange={(v) => setField(v as PriceField)} />
                {field === 'rate' && news.length > 0 && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        New items are
                        <select className="input !h-9 !w-auto !py-0 text-xs" value={newType} onChange={(e) => setNewType(e.target.value as NewItemType)} aria-label="Type of the new items">
                            {NEW_ITEM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    </label>
                )}
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">{field_.about}</p>

            {parsed.problems.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">{plural(parsed.problems.length, 'row')} skipped</summary>
                    <ul className="mt-1.5 space-y-0.5">
                        {parsed.problems.slice(0, 30).map((p) => <li key={`${p.line}-${p.reason}`} className="truncate">Line {p.line}: {PROBLEM_TEXT[p.reason] || p.reason}{p.text ? ` (${p.text})` : ''}</li>)}
                        {parsed.problems.length > 30 && <li>…and {parsed.problems.length - 30} more.</li>}
                    </ul>
                </details>
            )}

            {updates.length > 0 && (
                <Block
                    title="Price changes" count={updates.length}
                    note={big ? `${plural(big, 'change')} of ${BIG_CHANGE_PCT}% or more ${big === 1 ? 'is' : 'are'} marked in colour. A rise is red.` : undefined}
                    onAll={() => setSel((s) => setKind(s, diff, 'update', true))} onNone={() => setSel((s) => setKind(s, diff, 'update', false))}
                    onBig={big ? () => setSel((s) => onlyBigChanges(s, diff)) : undefined}
                >
                    {updates.map((c) => row(c, c.row.name && c.item && c.row.name !== c.item.name ? <span className="block truncate text-xs text-muted-foreground">file says: {c.row.name}</span> : null))}
                </Block>
            )}

            {news.length > 0 && (
                <Block
                    title="New items" count={news.length}
                    note="Not in your price book. Tick the ones to add; none is ticked for you."
                    onAll={() => setSel((s) => setKind(s, diff, 'new', true))} onNone={() => setSel((s) => setKind(s, diff, 'new', false))}
                >
                    {news.map((c) => row(c))}
                </Block>
            )}

            {unmatched.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">{unmatched.length} cannot be used</summary>
                    <ul className="mt-1.5 space-y-1">
                        {unmatched.slice(0, 60).map((c) => (
                            <li key={c.key}>
                                <span className="flex justify-between gap-2"><span className="truncate text-foreground">{c.row.name || c.row.sku}</span><span className="tabular-nums">{money(c.row.price)}</span></span>
                                <span className="block">{UNMATCHED_TEXT[c.reason || 'several']}</span>
                            </li>
                        ))}
                        {unmatched.length > 60 && <li>…and {unmatched.length - 60} more.</li>}
                    </ul>
                </details>
            )}

            {unchanged.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">{unchanged.length} unchanged</summary>
                    <ul className="mt-1.5 space-y-0.5">
                        {unchanged.slice(0, 60).map((c) => <li key={c.key} className="flex justify-between gap-2"><span className="truncate">{c.item?.name || c.row.name}</span><span className="tabular-nums">{money(c.row.price)}</span></li>)}
                        {unchanged.length > 60 && <li>…and {unchanged.length - 60} more.</li>}
                    </ul>
                </details>
            )}

            {diff.notInList.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">{diff.notInList.length} in your price book but not in this file</summary>
                    <p className="mt-1">They are left as they are; nothing is deleted.</p>
                </details>
            )}

            {/* stays in view while the review scrolls (above the phone tab bar) */}
            <div className="sticky bottom-16 z-10 space-y-2 rounded-xl border border-border bg-card px-3 py-3 shadow-lift md:bottom-3">
                {!online && <p role="status" className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">You’re offline. Changes are kept on this device and saved to your account when you’re back online.</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-sm" aria-live="polite">
                        <span className="font-semibold">{summary ? summaryText(summary) : ''}</span>
                        {summary && summary.big > 0 && <span className="text-muted-foreground"> · {plural(summary.big, 'change')} of {BIG_CHANGE_PCT}% or more</span>}
                    </p>
                    <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => void apply()} disabled={busy || !summary || summary.writes === 0}>
                        {busy ? 'Applying…' : summary && summary.writes ? `Apply ${plural(summary.writes, 'change')}` : 'Nothing to apply'}
                    </button>
                </div>
                {summary && summary.updates > 0 && (
                    <p className="text-xs text-muted-foreground">
                        No undo after this.{' '}
                        <button type="button" className="font-semibold text-primary hover:underline" onClick={saveOldPrices}>Save the old prices of the {plural(summary.updates, 'ticked item')} (CSV)</button>
                        {' '}first: importing that file here puts them back.
                    </p>
                )}
            </div>
        </div>
    );
};

export default PriceListImportPanel;
