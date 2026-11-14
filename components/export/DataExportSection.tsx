/**
 * Settings → "Your data" (id settings-data, also opened from the account menu: /settings#data).
 *   1. Export everything: a ZIP with a PDF of every document (one folder per job) + one CSV per list, or the
 *      spreadsheets only. Runs in the background (lib/export/exportStore.ts); progress also shows in a small bar on
 *      the other screens (ExportProgressDock).
 *   2. Bookkeeper CSV: one month (or dates) of invoices, payments, expenses and materials; download it or email it
 *      from the user's Gmail. The bookkeeper's address is saved in the account.
 * Never checks the plan: included on every plan, Free too, and after cancelling.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '../../types.ts';
import { AlertTriangleIcon, CheckIcon, DownloadIcon, MailIcon } from '../Icons.tsx';
import {
    cancelExport, dismissExport, downloadExportFile, formatBytes, startExport, useExportSnapshot, type ExportMode,
} from '../../lib/export/exportStore.ts';
import { CSV_ORDER, CSV_TABLES } from '../../lib/export/model.ts';
import { exportArchiveName } from '../../lib/export/paths.ts';
import { customRange, isLikelyEmail, monthRange, previousMonth, rangeLabel, type BookkeeperSummary, type DateRange } from '../../lib/export/bookkeeper.ts';
import { loadBookkeeperEmail, saveBookkeeperEmail, type SyncMode } from '../../lib/userData.ts';
import { GmailError, isNoAccountError, isPlanLimitGmailError, isReconnectError, startGmailConnect } from '../../services/gmailService.ts';

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(' ');

const MODES: { value: ExportMode; title: string; text: string }[] = [
    { value: 'full', title: 'PDFs + spreadsheets', text: 'A PDF of every document, in one folder per job, plus all the spreadsheets. A few minutes on a big account.' },
    { value: 'csv', title: 'Spreadsheets only', text: `${CSV_ORDER.length} CSV files and a complete backup file. Ready in seconds.` },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The current month and the 23 before it, newest first ("2026-11"). */
const recentMonths = (today = new Date()): string[] => Array.from({ length: 24 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});
const monthName = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

/** What's inside the ZIP, drawn as the folder tree the user will see after unzipping. */
const ZipTree: React.FC<{ mode: ExportMode }> = ({ mode }) => {
    const name = exportArchiveName(new Date(), undefined, mode);
    const csvNames = CSV_ORDER.map((k) => CSV_TABLES[k].file.replace(/\.csv$/, '')).join(', ');
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
            <p className="border-b border-border px-3 py-2 font-mono text-[12px] font-semibold text-foreground">{name}</p>
            <ul className="space-y-1.5 px-3 py-2.5 font-mono text-[12px] leading-snug text-muted-foreground">
                <li><span className="text-foreground">README.txt</span> <span className="font-sans">what each file holds</span></li>
                <li>
                    <span className="text-foreground">csv/</span>{' '}
                    <span className="font-sans">{csvNames}</span>
                </li>
                <li><span className="text-foreground">data/documents.jsonl</span> <span className="font-sans">every document exactly as saved</span></li>
                {mode === 'full' ? (
                    <li className="break-words">
                        <span className="text-foreground">jobs/Kitchen remodel/</span>2026-03-04 Invoice INV-1001.pdf <span className="font-sans">… one folder per job</span>
                    </li>
                ) : (
                    <li className="font-sans line-through decoration-muted-foreground/50">jobs/ (PDFs)</li>
                )}
            </ul>
        </div>
    );
};

const ExportEverything: React.FC<{ profile: UserProfile }> = ({ profile }) => {
    const snap = useExportSnapshot();
    const [mode, setMode] = useState<ExportMode>('full');
    const mine = snap.ownerId === profile.id;
    const running = mine && snap.status === 'running';
    const done = mine && snap.status === 'done';

    // an export left by another account on this device (sign-out / sign-in) is dropped
    useEffect(() => { if (snap.ownerId && snap.ownerId !== profile.id) dismissExport(); }, [snap.ownerId, profile.id]);
    useEffect(() => { if (running || done) setMode(snap.mode); }, [running, done, snap.mode]);

    const start = () => { startExport({ userId: profile.id, profile, mode }); };
    const totalSize = snap.files.reduce((s, f) => s + f.size, 0);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-foreground">Export everything</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    One ZIP file with all your jobs, clients, documents, payments, time sheets, expenses, inventory, price book, reminders and quote requests.
                </p>
            </div>

            <fieldset disabled={running} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <legend className="sr-only">What to include</legend>
                {MODES.map((m) => (
                    <label
                        key={m.value}
                        className={cx(
                            'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
                            mode === m.value ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/60',
                            running && 'cursor-not-allowed opacity-70',
                        )}
                    >
                        <input type="radio" name="export-mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground">{m.title}</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{m.text}</span>
                        </span>
                    </label>
                ))}
            </fieldset>

            <details className="group">
                <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:underline">What’s inside the ZIP</summary>
                <div className="mt-2"><ZipTree mode={mode} /></div>
            </details>

            {running ? (
                <div className="rounded-xl border border-border p-3" role="status" aria-live="polite">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium text-foreground">{snap.label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{Math.floor(snap.percent)}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(snap.percent)}>
                        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, snap.percent)}%` }} />
                    </div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                            {snap.phase === 'pdfs' && snap.total ? `${snap.done} of ${snap.total} PDFs · ` : ''}
                            You can keep using the app. Keep this tab open until it finishes.
                        </p>
                        <button type="button" className="btn btn-sm btn-ghost self-start text-destructive sm:self-auto" onClick={cancelExport}>Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button type="button" className="btn btn-primary" onClick={start}>
                        <DownloadIcon className="h-4 w-4" /> {done ? 'Export again' : 'Export my data'}
                    </button>
                    <p className="text-xs text-muted-foreground">Runs in the background; the ZIP downloads when it’s ready.</p>
                </div>
            )}

            {done && snap.files.length > 0 && (
                <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <CheckIcon className="h-4 w-4 text-success" /> Export ready · {formatBytes(totalSize)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {snap.documents} document{snap.documents === 1 ? '' : 's'}
                        {snap.pdfs && snap.mode === 'full' ? `, ${snap.pdfs.done} PDF${snap.pdfs.done === 1 ? '' : 's'}` : ''}
                        , {snap.rows.toLocaleString()} spreadsheet rows
                        {snap.files.length > 1 ? `, split into ${snap.files.length} ZIP files (spreadsheets in part 1)` : ''}.
                    </p>
                    <ul className="mt-2 divide-y divide-border/70">
                        {snap.files.map((f) => (
                            <li key={f.url} className="flex items-center justify-between gap-3 py-1.5">
                                <span className="min-w-0 truncate font-mono text-[12px] text-foreground">{f.name}</span>
                                <span className="flex shrink-0 items-center gap-2">
                                    <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(f.size)}</span>
                                    <button type="button" className="btn btn-sm btn-outline" onClick={() => downloadExportFile(f)}>Download</button>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {snap.pdfs && snap.pdfs.failed > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground">
                            <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                            {snap.pdfs.failed} PDF{snap.pdfs.failed === 1 ? '' : 's'} could not be created. They’re listed in errors.txt inside the ZIP, and their data is in the spreadsheets.
                        </p>
                    )}
                    {snap.warnings.map((w) => <p key={w} className="mt-1 text-xs text-muted-foreground">{w}</p>)}
                    <button type="button" className="mt-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={dismissExport}>
                        Clear from this page
                    </button>
                </div>
            )}

            {mine && snap.status === 'error' && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-foreground">
                    <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span>The export stopped: {snap.error} Nothing was lost; start it again when you’re ready.</span>
                </p>
            )}
            {mine && snap.status === 'cancelled' && <p role="status" className="text-sm text-muted-foreground">Export cancelled.</p>}
        </div>
    );
};

const CUSTOM = 'custom';

const BookkeeperExport: React.FC<{ profile: UserProfile; onUpgradeClick?: () => void }> = ({ profile, onUpgradeClick }) => {
    const months = useMemo(() => recentMonths(), []);
    const [period, setPeriod] = useState<string>(() => previousMonth());
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [email, setEmail] = useState('');
    const [savedEmail, setSavedEmail] = useState('');
    const [emailSaved, setEmailSaved] = useState<SyncMode | null>(null);
    const [emailChecked, setEmailChecked] = useState(false);
    const [busy, setBusy] = useState<'download' | 'email' | null>(null);
    const [result, setResult] = useState<{ label: string; summary: BookkeeperSummary; sentTo?: string } | null>(null);
    const [problem, setProblem] = useState<{ text: string; action?: 'gmail' | 'upgrade' } | null>(null);

    useEffect(() => {
        let alive = true;
        loadBookkeeperEmail(profile.id).then((e) => { if (alive) { setEmail(e); setSavedEmail(e); } }).catch(() => { /* keep empty */ });
        return () => { alive = false; };
    }, [profile.id]);

    const range: DateRange | null = period === CUSTOM ? customRange(from, to) : monthRange(period);

    const rememberEmail = async (value = email) => {
        const v = value.trim();
        if (v === savedEmail || (v && !isLikelyEmail(v))) return;
        const mode = await saveBookkeeperEmail(profile.id, v);
        setSavedEmail(v);
        setEmailSaved(mode);
    };

    const run = async (kind: 'download' | 'email') => {
        setProblem(null);
        setResult(null);
        if (!range) { setProblem({ text: period === CUSTOM ? 'Choose a start date on or before the end date.' : 'Choose a month.' }); return; }
        if (kind === 'email' && !isLikelyEmail(email)) { setProblem({ text: 'Enter your bookkeeper’s email address first.' }); return; }
        setBusy(kind);
        try {
            const { buildBookkeeperExport, downloadCsv, emailBookkeeperExport } = await import('../../lib/export/bookkeeperApi.ts');
            const exp = await buildBookkeeperExport(profile.id, range);
            if (kind === 'download') {
                downloadCsv(exp.csv, exp.fileName);
                setResult({ label: rangeLabel(range), summary: exp.summary });
            } else {
                await rememberEmail();
                await emailBookkeeperExport(exp, email, profile);
                setResult({ label: rangeLabel(range), summary: exp.summary, sentTo: email.trim() });
            }
        } catch (e) {
            if (isNoAccountError(e) || isReconnectError(e)) setProblem({ text: isNoAccountError(e) ? 'Connect your Gmail to email the file. It’s sent from your own address.' : 'Your Gmail connection needs to be renewed.', action: 'gmail' });
            else if (isPlanLimitGmailError(e)) setProblem({ text: 'You’ve used this month’s emails on the Free plan. Download the CSV and attach it yourself, or upgrade for unlimited sending.', action: 'upgrade' });
            else setProblem({ text: e instanceof GmailError || e instanceof Error ? e.message : 'Something went wrong. Please try again.' });
        } finally {
            setBusy(null);
        }
    };

    const s = result?.summary;

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-foreground">Bookkeeper CSV</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    A month of invoices, payments, expenses and materials in the columns accountants import: date, number, client or vendor, description,
                    net, tax, total, status, paid date and category.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="bk-period" className="label">Period</label>
                    <select id="bk-period" className="input" value={period} onChange={(e) => { setPeriod(e.target.value); setResult(null); }}>
                        {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
                        <option value={CUSTOM}>Custom dates…</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="bk-email" className="label">Bookkeeper’s email <span className="font-normal text-muted-foreground">(optional)</span></label>
                    <input
                        id="bk-email"
                        type="email"
                        inputMode="email"
                        autoComplete="off"
                        className="input"
                        placeholder="books@yourfirm.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setEmailSaved(null); setEmailChecked(false); }}
                        onBlur={() => { setEmailChecked(true); void rememberEmail(); }}
                    />
                    {emailChecked && email.trim() && !isLikelyEmail(email) ? (
                        <p className="mt-1 text-xs text-warning">Check the address (name@company.com).</p>
                    ) : emailSaved && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {emailSaved === 'account' ? 'Saved to your account.' : emailSaved === 'failed' ? 'Could not be saved.' : 'Saved on this device; it will be added to your account later.'}
                        </p>
                    )}
                </div>
                {period === CUSTOM && (
                    <>
                        <div>
                            <label htmlFor="bk-from" className="label">From</label>
                            <input id="bk-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="bk-to" className="label">To</label>
                            <input id="bk-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                    </>
                )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn btn-outline" onClick={() => run('download')} disabled={busy !== null}>
                    {busy === 'download' ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <DownloadIcon className="h-4 w-4" />}
                    Download CSV
                </button>
                <button type="button" className="btn btn-outline" onClick={() => run('email')} disabled={busy !== null}>
                    {busy === 'email' ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <MailIcon className="h-4 w-4" />}
                    Email to my bookkeeper
                </button>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">Emails go from your connected Gmail with the CSV attached. Draft and cancelled invoices are left out.</p>

            {problem && (
                <div role="alert" className="flex flex-col gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>{problem.text}</span>
                    {problem.action === 'gmail' && (
                        <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={() => { void startGmailConnect({ returnTo: '/settings#data' }).catch((e) => setProblem({ text: (e as Error).message })); }}>
                            Connect Gmail
                        </button>
                    )}
                    {problem.action === 'upgrade' && onUpgradeClick && (
                        <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={onUpgradeClick}>Upgrade</button>
                    )}
                </div>
            )}

            {result && s && (
                <div role="status" className="rounded-xl border border-border px-3 py-2.5">
                    <p className="text-sm font-semibold text-foreground">
                        {result.sentTo ? `Sent to ${result.sentTo}` : 'Downloaded'} · {result.label}
                    </p>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                        {([['Invoices', s.invoices], ['Payments in', s.payments], ['Expenses', s.expenses], ['Materials', s.materials]] as const).map(([label, v]) => (
                            <div key={label}>
                                <dt className="text-muted-foreground">{label} ({v.count})</dt>
                                <dd className="font-semibold tabular-nums text-foreground">{usd(v.total)}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </div>
    );
};

const DataExportSection: React.FC<{ profile: UserProfile; onUpgradeClick?: () => void }> = ({ profile, onUpgradeClick }) => (
    <section id="settings-data" className="card scroll-mt-24" aria-labelledby="settings-data-title">
        <div className="border-b border-border px-4 py-4 sm:px-6">
            <h2 id="settings-data-title" className="text-base font-semibold">Your data</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
                Everything you make here is yours to take with you. Export works on every plan, Free included, and keeps working if you cancel.
            </p>
        </div>
        <div className="divide-y divide-border">
            <div className="p-4 sm:p-6"><ExportEverything profile={profile} /></div>
            <div className="p-4 sm:p-6"><BookkeeperExport profile={profile} onUpgradeClick={onUpgradeClick} /></div>
        </div>
    </section>
);

export default DataExportSection;
