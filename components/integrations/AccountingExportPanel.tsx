/**
 * Settings > Integrations & data > Accounting: QuickBooks Online and Xero import files. Pick the app, the file
 * (invoices, customers, expenses, payments received), the period and a filter; see how many rows there are, what the
 * money adds up to and the first five rows; then download the CSV. Works on every plan. Reads only.
 * The monthly bookkeeper CSV and the full backup stay in Settings > Your data (linked from here, not repeated).
 * Logic and the column tables: lib/integrations/accountingExport.ts.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DownloadIcon } from '../Icons.tsx';
import { errorText } from '../../lib/offline/connection.ts';
import { customRange, monthRange, previousMonth, rangeLabel, type DateRange } from '../../lib/export/bookkeeper.ts';
import {
    ACCOUNTING_APPS, DATE_FORMATS, EXPORT_KINDS, EXPENSE_CATEGORIES, buildAccountingExport, layoutFor, resolveVariables,
    type AccountingApp, type AccountingFilters, type DateFormat, type ExportKind,
} from '../../lib/integrations/accountingExport.ts';
import { downloadTextFile, loadAccountingSource, type AccountingSource } from '../../lib/integrations/integrationsApi.ts';
import { Group, Note, Segmented, Spinner, cx, plural } from './ui.tsx';

const PREFS_KEY = 'cd.accounting.export';
const CUSTOM = 'custom';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The current month and the 23 before it, newest first ("2026-11"). */
const recentMonths = (today = new Date()): string[] => Array.from({ length: 24 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});
const monthName = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const clip = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface Prefs {
    app: AccountingApp;
    kind: ExportKind;
    /** per layout ("xero.invoices"): the date format and the edited account codes / tax names */
    dateFormats: Record<string, DateFormat>;
    variables: Record<string, Record<string, string>>;
}

const readPrefs = (): Prefs => {
    try {
        const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        const app: AccountingApp = raw.app === 'xero' ? 'xero' : 'quickbooks';
        const kind: ExportKind = EXPORT_KINDS.some((k) => k.id === raw.kind) ? raw.kind : 'invoices';
        return { app, kind, dateFormats: raw.dateFormats && typeof raw.dateFormats === 'object' ? raw.dateFormats : {}, variables: raw.variables && typeof raw.variables === 'object' ? raw.variables : {} };
    } catch {
        return { app: 'quickbooks', kind: 'invoices', dateFormats: {}, variables: {} };
    }
};
const writePrefs = (p: Prefs) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode: the choices simply are not remembered */ } };

const FILTER_LABEL: Record<ExportKind, string> = { invoices: 'Which invoices', contacts: 'Which customers', expenses: 'Which expenses', payments: 'Which payments' };

const AccountingExportPanel: React.FC<{ userId: string; onOpenYourData: () => void }> = ({ userId, onOpenYourData }) => {
    const months = useMemo(() => recentMonths(), []);
    const [prefs, setPrefs] = useState<Prefs>(readPrefs);
    const [period, setPeriod] = useState<string>(() => previousMonth());
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [filters, setFilters] = useState<Omit<AccountingFilters, 'range'>>({ invoiceStatus: 'billed', contacts: 'all', category: 'all', paymentSource: 'all' });
    const [source, setSource] = useState<AccountingSource | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);

    const { app, kind } = prefs;
    const layout = layoutFor(app, kind);
    const key = `${app}.${kind}`;
    const dateFormat: DateFormat = prefs.dateFormats[key] || layout.dateFormat;
    const variables = useMemo(() => resolveVariables(layout, prefs.variables[key]), [layout, prefs.variables, key]);
    const update = (patch: Partial<Prefs>) => { setSaved(null); setPrefs((p) => { const next = { ...p, ...patch }; writePrefs(next); return next; }); };

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSource(await loadAccountingSource(userId));
        } catch (e) {
            setError(errorText(e, 'Your documents could not be read. Check your connection and try again.'));
        } finally {
            setLoading(false);
        }
    }, [userId]);
    useEffect(() => { void load(); }, [load]);

    const range: DateRange | null = period === CUSTOM ? customRange(from, to) : monthRange(period);

    const built = useMemo(() => {
        if (!source || !range) return null;
        return buildAccountingExport({ app, kind, documents: source.documents, jobs: source.jobs, clients: source.clients, filters: { ...filters, range }, variables: prefs.variables[key], dateFormat });
    }, [source, range?.start, range?.end, app, kind, filters, prefs.variables, key, dateFormat]); // eslint-disable-line react-hooks/exhaustive-deps

    const download = () => {
        if (!built || !built.rowCount) return;
        downloadTextFile(built.csv, built.fileName);
        setSaved(built.fileName);
    };

    const summary = built && (() => {
        const inv = built.invoiceSummary;
        const what = plural(built.records, { invoices: 'invoice', contacts: 'customer', expenses: 'expense', payments: 'payment' }[kind]);
        const rows = built.rowCount !== built.records ? ` · ${plural(built.rowCount, 'row')}` : '';
        const money = kind === 'contacts' ? '' : ` · ${usd(built.total)}${inv && inv.tax ? ` (${usd(inv.tax)} tax)` : ''}`;
        return `${what}${rows}${money}`;
    })();

    return (
        <div className="space-y-5 pt-4">
            <p className="text-sm text-muted-foreground">
                Files your accounting app can import, with your invoices, customers, expenses and payments in its own columns. Money matches your documents.
                Nothing is sent anywhere: you download the file and import it yourself.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Group label="Accounting app">
                    <Segmented label="Accounting app" value={app} options={ACCOUNTING_APPS.map((a) => ({ value: a.id, text: a.label }))} onChange={(v) => update({ app: v as AccountingApp })} />
                </Group>
                <div>
                    <label htmlFor="acc-kind" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">File</label>
                    <select id="acc-kind" className="input" value={kind} onChange={(e) => update({ kind: e.target.value as ExportKind })}>
                        {EXPORT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                    </select>
                </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">{EXPORT_KINDS.find((k) => k.id === kind)!.about}</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="acc-period" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period</label>
                    <select id="acc-period" className="input" value={period} onChange={(e) => { setPeriod(e.target.value); setSaved(null); }}>
                        {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
                        <option value={CUSTOM}>Custom dates…</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="acc-filter" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FILTER_LABEL[kind]}</label>
                    {kind === 'invoices' && (
                        <select id="acc-filter" className="input" value={filters.invoiceStatus} onChange={(e) => { setSaved(null); setFilters((f) => ({ ...f, invoiceStatus: e.target.value as AccountingFilters['invoiceStatus'] })); }}>
                            <option value="billed">All sent and paid</option>
                            <option value="unpaid">Unpaid only</option>
                            <option value="paid">Paid only</option>
                        </select>
                    )}
                    {kind === 'contacts' && (
                        <select id="acc-filter" className="input" value={filters.contacts} onChange={(e) => { setSaved(null); setFilters((f) => ({ ...f, contacts: e.target.value as AccountingFilters['contacts'] })); }}>
                            <option value="all">All my clients</option>
                            <option value="invoiced">Only clients invoiced in this period</option>
                        </select>
                    )}
                    {kind === 'expenses' && (
                        <select id="acc-filter" className="input" value={filters.category} onChange={(e) => { setSaved(null); setFilters((f) => ({ ...f, category: e.target.value })); }}>
                            <option value="all">All categories</option>
                            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    )}
                    {kind === 'payments' && (
                        <select id="acc-filter" className="input" value={filters.paymentSource} onChange={(e) => { setSaved(null); setFilters((f) => ({ ...f, paymentSource: e.target.value as AccountingFilters['paymentSource'] })); }}>
                            <option value="all">Receipts and payments marked as paid</option>
                            <option value="receipts">Receipts only</option>
                            <option value="invoices">Marked as paid on invoices only</option>
                        </select>
                    )}
                </div>
                {period === CUSTOM && (
                    <>
                        <div>
                            <label htmlFor="acc-from" className="label">From</label>
                            <input id="acc-from" type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setSaved(null); }} />
                        </div>
                        <div>
                            <label htmlFor="acc-to" className="label">To</label>
                            <input id="acc-to" type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setSaved(null); }} />
                        </div>
                    </>
                )}
            </div>
            {kind === 'invoices' && <p className="-mt-2 text-xs text-muted-foreground">By the invoice date. Drafts and cancelled invoices are always left out.</p>}

            {error && (
                <div role="alert" className="flex flex-col gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>{error}</span>
                    <button type="button" className="btn btn-sm btn-outline min-h-[36px] self-start sm:self-auto" onClick={() => { void load(); }}>Try again</button>
                </div>
            )}

            {!range && <p className="text-sm text-muted-foreground">Choose a start date on or before the end date.</p>}

            {loading && !source && <div className="skeleton h-28 w-full rounded-xl" aria-label="Reading your documents" />}

            {built && range && (
                <div className="space-y-3" aria-live="polite">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="text-sm font-semibold text-foreground">{summary || 'Nothing in this period'}<span className="font-normal text-muted-foreground"> · {rangeLabel(range)}</span></p>
                        <button type="button" className="text-xs font-semibold text-primary hover:underline disabled:opacity-50" onClick={() => { void load(); }} disabled={loading}>{loading ? 'Reading…' : 'Reload my data'}</button>
                    </div>
                    {built.notes.map((n) => <Note key={n} tone="warn">{n}</Note>)}

                    {built.rowCount > 0 ? (
                        <div className="overflow-hidden rounded-xl border border-border">
                            <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">First {Math.min(5, built.rowCount)} of {built.rowCount} rows</p>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-left font-mono text-[11px] leading-5">
                                    <thead>
                                        <tr className="border-b border-border text-muted-foreground">
                                            {built.header.map((h) => <th key={h} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">{h}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {built.rows.slice(0, 5).map((r, i) => (
                                            <tr key={i} className="border-b border-border/60 last:border-0">
                                                {r.map((c, j) => <td key={j} className={cx('whitespace-nowrap px-2.5 py-1', !c && 'text-muted-foreground/50')} title={c}>{c ? clip(c) : '·'}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Nothing matches this period and filter, so there is no file to download.</p>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button type="button" className="btn btn-primary min-h-[44px]" onClick={download} disabled={!built.rowCount}>
                            <DownloadIcon className="h-4 w-4" /> Download file
                        </button>
                        <p className="min-w-0 break-all font-mono text-[11px] text-muted-foreground">{built.fileName}</p>
                    </div>
                    {saved && <p role="status" className="text-sm font-medium text-foreground">Saved {saved}. {layout.importAt}</p>}
                </div>
            )}

            <div className="space-y-2">
                <p className="text-xs leading-relaxed text-muted-foreground">{layout.note}</p>
                <Note tone="warn">
                    The column names follow {app === 'xero' ? 'Xero' : 'QuickBooks'}’s import template as we last knew it. Check them against your accounting app’s current import template before you import:
                    if a name has changed, the import screen will tell you which column it did not recognise.
                </Note>
            </div>

            <details className="rounded-xl border border-border px-3 py-2">
                <summary className="cursor-pointer select-none text-sm font-medium text-foreground">Columns and settings for this file</summary>
                <div className="mt-3 space-y-4">
                    <Group label="Columns, in order">
                        <p className="flex flex-wrap gap-x-1.5 gap-y-1 font-mono text-[11px] text-muted-foreground">
                            {layout.columns.map((c, i) => <span key={c[0] + i} className="rounded bg-muted px-1.5 py-0.5 text-foreground">{c[0]}</span>)}
                        </p>
                    </Group>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor="acc-date" className="label">Date format</label>
                            <select id="acc-date" className="input" value={dateFormat} onChange={(e) => update({ dateFormats: { ...prefs.dateFormats, [key]: e.target.value as DateFormat } })}>
                                {DATE_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                            </select>
                            <p className="mt-1 text-xs text-muted-foreground">Year first is the safest. Pick another if your import screen asks for it.</p>
                        </div>
                        {layout.variables.map((v) => (
                            <div key={v.key}>
                                <label htmlFor={`acc-var-${v.key}`} className="label">{v.label}</label>
                                <input
                                    id={`acc-var-${v.key}`}
                                    className="input"
                                    value={prefs.variables[key]?.[v.key] ?? v.value}
                                    autoComplete="off"
                                    onChange={(e) => update({ variables: { ...prefs.variables, [key]: { ...(prefs.variables[key] || {}), [v.key]: e.target.value } } })}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">{v.help}</p>
                            </div>
                        ))}
                    </div>
                    {(prefs.dateFormats[key] || prefs.variables[key]) && (
                        <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => {
                            const df = { ...prefs.dateFormats }; delete df[key];
                            const vs = { ...prefs.variables }; delete vs[key];
                            update({ dateFormats: df, variables: vs });
                        }}>Back to the standard settings</button>
                    )}
                    <p className="text-xs text-muted-foreground">These choices are remembered on this device.</p>
                </div>
            </details>

            <p className="text-xs text-muted-foreground">
                Looking for the monthly bookkeeper CSV, or one backup file of everything? They are in{' '}
                <button type="button" className="font-semibold text-primary hover:underline" onClick={onOpenYourData}>Your data</button>.
            </p>
        </div>
    );
};

export default AccountingExportPanel;
