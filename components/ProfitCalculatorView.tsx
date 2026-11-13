import React, { useEffect, useMemo, useState } from 'react';
import { CalculatorIcon, DownloadIcon, FolderIcon, PlusIcon, RefreshCwIcon, SaveIcon, TrashIcon, TrendingUpIcon } from './Icons.tsx';
import { generateDocumentBase64 } from '../services/pdfGenerator.ts';
import { FormType, type UserProfile } from '../types.ts';
import { ConfirmDialog, EmptyState, Field, InlineError, Modal, NoticeToast, NumberInput, PageHeader, Segmented, XIcon, money, useNotice } from './viewKit.tsx';
import { toNumber } from '../utils/money.ts';
import { toLocalYMD } from '../utils/localDates.ts';
import {
  DEFAULT_TARGET_MARGIN, DEFAULT_TAX_RATE, applyTargetMargin, marginHealth, profitSummary, targetMarginError, type CalcMode,
} from '../lib/profitCalc.ts';
import {
  deleteProfitCalculation, loadProfitCalculations, pendingProfitCalculationCount, readLocalProfitCalculations, saveProfitCalculation,
  type SavedProfitCalc, type SyncMode,
} from '../lib/userData.ts';
import type { ProfitCalcItem } from '../lib/userDataSync.ts';
import HelpButton from './help/HelpButton.tsx';

type ProfitItem = ProfitCalcItem;

/** Saved calculations live in the account (public.profit_calculations, lib/userData.ts); the device keeps a copy. */
type SavedCalculation = SavedProfitCalc;

interface ProfitCalculatorViewProps {
  onBack: () => void;
  profile?: UserProfile;
}

const newRow = (description = ''): ProfitItem => ({ id: crypto.randomUUID(), description, cost: 0, charge: 0 });
const starterRows = () => [newRow('Materials'), newRow('Labor')];

/**
 * Simple / Advanced, as in the old app: Simple = lines + summary; Advanced adds Target Margin pricing and Tax / VAT.
 * The last mode used is remembered on this device; a saved calculation carries its own mode.
 */
const MODE_KEY = 'cd.calc.mode';
const readMode = (): CalcMode => {
  try { return window.localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple'; } catch { return 'simple'; }
};
const rememberMode = (m: CalcMode) => {
  try { window.localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable */ }
};

/** Where a save ended up, in words. */
const savedWhere = (mode: SyncMode, name: string, updated: boolean): { kind: 'success' | 'info' | 'error'; text: string } => {
  if (mode === 'account') return { kind: 'success', text: updated ? `"${name}" updated.` : `"${name}" saved to your account.` };
  if (mode === 'device') return { kind: 'info', text: `"${name}" saved on this device. It will be added to your account automatically.` };
  if (mode === 'offline') return { kind: 'info', text: `"${name}" saved on this device. It will be added to your account when you're back online.` };
  return { kind: 'error', text: 'Could not save the calculation. Check your connection and try again.' };
};

/** Summary card edge + badge by margin (the old app colored the whole summary card the same way). */
const TONE = {
  muted: { badge: 'badge-muted', edge: 'border-t-border' },
  danger: { badge: 'badge-danger', edge: 'border-t-destructive' },
  warning: { badge: 'badge-warning', edge: 'border-t-warning' },
  success: { badge: 'badge-success', edge: 'border-t-success' },
} as const;

const ProfitCalculatorView: React.FC<ProfitCalculatorViewProps> = ({ onBack, profile }) => {
  const [mode, setModeState] = useState<CalcMode>(readMode);
  const [items, setItems] = useState<ProfitItem[]>(starterRows);
  const [calcName, setCalcName] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE);
  const [targetMargin, setTargetMargin] = useState(DEFAULT_TARGET_MARGIN);
  const [saved, setSaved] = useState<SavedCalculation[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [loadOpen, setLoadOpen] = useState(false);
  const [deleteFor, setDeleteFor] = useState<SavedCalculation | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode | 'loading'>('loading');
  const [pendingCount, setPendingCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const { notice, notify, clear } = useNotice();
  const uid = profile?.id || '';
  const advanced = mode === 'advanced';
  /** Tax only shows (and counts in the summary and PDF) in Advanced, like the old app. */
  const taxOn = advanced && taxEnabled;

  const setMode = (m: CalcMode) => { setModeState(m); rememberMode(m); setTargetError(null); };

  // Device copy first (instant, works offline), then the account list (uploads anything saved only on this device).
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setSaved(readLocalProfitCalculations(uid));
    setSyncMode('loading');
    loadProfitCalculations(uid).then((res) => {
      if (cancelled) return;
      setSaved(res.list);
      setSyncMode(res.mode);
      setPendingCount(res.pending);
      if (res.uploaded > 0) notify('success', `${res.uploaded} saved calculation${res.uploaded === 1 ? ' was' : 's were'} added to your account from this device.`);
    });
    return () => { cancelled = true; };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = useMemo(() => profitSummary(items, taxOn, taxRate), [items, taxOn, taxRate]);
  const h = marginHealth(s.margin, s.totalCharge > 0);
  const tone = TONE[h.tone];
  const dirty = items.some((i) => i.cost || i.charge || (i.description && !['Materials', 'Labor'].includes(i.description))) || items.length !== 2;

  const update = (id: string, patch: Partial<ProfitItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  /** Old app's "Calculate Pricing": prices every line with a cost for the target margin. */
  const calculatePricing = () => {
    const problem = targetMarginError(targetMargin);
    if (problem) { setTargetError(problem); return; }
    const withCost = items.filter((i) => toNumber(i.cost) > 0).length;
    if (!withCost) { setTargetError('Enter your cost on at least one line first.'); return; }
    setTargetError(null);
    setItems((prev) => applyTargetMargin(prev, targetMargin));
    notify('success', `Prices set for a ${targetMargin}% margin on ${withCost} line${withCost === 1 ? '' : 's'} with a cost.`);
  };

  const doSave = async () => {
    const name = saveName.trim();
    if (!name || busy) return;
    if (!uid) { notify('error', 'Your account is still loading. Try again in a moment.'); return; }
    const existing = saved.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const calc: SavedCalculation = {
      id: existing?.id || crypto.randomUUID(), name, date: new Date().toISOString(), items,
      vatRate: taxRate, vatEnabled: taxEnabled, margin: s.margin, settings: { mode, targetMargin },
    };
    setBusy(true);
    try {
      const res = await saveProfitCalculation(uid, calc);
      if (res.mode === 'failed') {
        notify('error', savedWhere(res.mode, name, !!existing).text);
        return;
      }
      setSaved((prev) => [res.calc, ...prev.filter((c) => c.id !== res.calc.id)]);
      if (res.mode !== 'account') setSyncMode(res.mode);
      setPendingCount(pendingProfitCalculationCount(uid));
      setCalcName(name);
      setSaveOpen(false);
      const msg = savedWhere(res.mode, name, !!existing);
      notify(msg.kind, msg.text);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (calc: SavedCalculation) => {
    setDeleteFor(null);
    if (!uid) return;
    const res = await deleteProfitCalculation(uid, calc.id);
    if (!res.ok) { notify('error', `Could not delete "${calc.name}". Check your connection and try again.`); return; }
    setSaved((prev) => prev.filter((c) => c.id !== calc.id));
    setPendingCount(pendingProfitCalculationCount(uid));
  };

  const doLoad = (calc: SavedCalculation) => {
    setItems(calc.items.map((i) => ({ id: i.id || crypto.randomUUID(), description: String(i.description || ''), cost: toNumber(i.cost), charge: toNumber(i.charge) })));
    setTaxEnabled(!!calc.vatEnabled);
    setTaxRate(toNumber(calc.vatRate));
    if (calc.settings) {
      setTargetMargin(calc.settings.targetMargin);
      setMode(calc.settings.mode);
    } else if (calc.vatEnabled) {
      setMode('advanced'); // older saves: show the tax they were saved with
    }
    setCalcName(calc.name);
    setLoadOpen(false);
    notify('info', `Loaded "${calc.name}".`);
  };

  const reset = () => {
    setItems(starterRows());
    setCalcName('');
    setTaxEnabled(false);
    setTargetError(null);
    setResetOpen(false);
  };

  const exportPdf = async () => {
    if (!profile) { notify('error', 'Your company profile is still loading. Try again in a moment.'); return; }
    if (!s.totalCharge && !s.totalCost) { notify('error', 'Add some costs or prices before exporting.'); return; }
    setExporting(true);
    try {
      const now = new Date();
      const report = {
        title: calcName || 'Profit & margin report',
        reportNumber: `PC-${toLocalYMD(now).replace(/-/g, '')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`,
        date: now.toLocaleDateString(),
        items: items.map((i) => ({ id: i.id, description: i.description || 'Item', cost: toNumber(i.cost), charge: toNumber(i.charge) })),
        vatEnabled: taxOn,
        vatRate: taxOn ? taxRate : 0,
        totalCost: s.totalCost,
        totalRevenue: s.totalCharge,
        grossProfit: s.profit,
        margin: s.margin,
        markup: s.markup,
        taxAmount: s.taxAmount,
        totalWithTax: s.totalWithTax,
        notes: `Total cost ${money(s.totalCost)} · revenue ${money(s.totalCharge)} · profit ${money(s.profit)} (${s.margin.toFixed(1)}% margin).`,
      };
      const job = {
        id: 'profit-calculator', userId: profile.id, name: calcName || 'Profit calculation', clientName: '', clientAddress: '',
        startDate: toLocalYMD(now), endDate: null, status: 'active' as const, createdAt: now.toISOString(),
      };
      const dataUri = await generateDocumentBase64(FormType.ProfitReport, report, profile, job);
      if (!dataUri) throw new Error('empty');
      const link = document.createElement('a');
      link.href = dataUri;
      link.download = `${(calcName || 'profit-calculation').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'profit-calculation'}-${toLocalYMD(now)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      notify('success', 'PDF downloaded.');
    } catch {
      notify('error', 'The PDF could not be created. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        onBack={onBack}
        icon={<CalculatorIcon className="h-7 w-7" />}
        title="Profit calculator"
        subtitle={calcName ? <>Editing <strong className="text-foreground">{calcName}</strong></> : 'Price a job and check your margin before you quote it.'}
        actions={
          <>
            <HelpButton topic="calculator" />
            <button type="button" className="btn btn-outline" onClick={() => setLoadOpen(true)}><FolderIcon className="h-4 w-4" /> Saved{saved.length ? ` (${saved.length})` : ''}</button>
            <button type="button" className="btn btn-outline" onClick={() => { setSaveName(calcName); setSaveOpen(true); }}><SaveIcon className="h-4 w-4" /> Save</button>
            <button type="button" className="btn btn-primary" onClick={exportPdf} disabled={exporting}><DownloadIcon className="h-4 w-4" /> {exporting ? 'Creating PDF…' : 'Export PDF'}</button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Segmented<CalcMode>
          ariaLabel="Calculator mode"
          value={mode}
          onChange={setMode}
          options={[{ value: 'simple', label: 'Simple' }, { value: 'advanced', label: 'Advanced' }]}
        />
        <p className="text-xs text-muted-foreground">
          {advanced ? 'Target margin pricing and sales tax / VAT.' : 'Your cost and your price for each line. Advanced adds target margin pricing and tax.'}
        </p>
      </div>

      {advanced && (
        <section className="card card-pad mb-5 border-primary/25" aria-label="Advanced tools">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Target margin</h2>
                <p className="text-xs text-muted-foreground">Sets each line's price to reach a {Number.isFinite(targetMargin) ? targetMargin : 0}% margin on your cost: cost ÷ (1 − margin). Lines without a cost keep their price.</p>
              </div>
              {targetError && <InlineError>{targetError}</InlineError>}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Target margin (%)" htmlFor="pc-target" className="sm:w-48">
                  <NumberInput id="pc-target" value={targetMargin} onValue={(n) => { setTargetMargin(n); setTargetError(null); }} />
                </Field>
                <button type="button" className="btn btn-primary" onClick={calculatePricing}><TrendingUpIcon className="h-4 w-4" /> Calculate pricing</button>
              </div>
            </div>
            <div className="border-t border-border pt-4 md:min-w-[15rem] md:border-l md:border-t-0 md:pl-5 md:pt-0">
              <label className="flex min-h-[40px] cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-medium text-foreground">Tax / VAT</span>
                  <span className="block text-xs text-muted-foreground">Charged on the client price; it doesn't change your profit.</span>
                </span>
                <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />
              </label>
              {taxEnabled && (
                <Field label="Tax rate (%)" htmlFor="pc-tax" className="mt-2 sm:w-40">
                  <NumberInput id="pc-tax" value={taxRate} onValue={(n) => setTaxRate(Math.min(100, n))} />
                </Field>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card card-pad self-start">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Line items</h2>
              <p className="text-xs text-muted-foreground">
                {advanced ? 'Enter your costs and let Calculate pricing set the prices, or enter them yourself.' : 'Your cost and what you charge the client for each part of the job.'}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm h-10" onClick={() => (dirty ? setResetOpen(true) : reset())}><RefreshCwIcon className="h-4 w-4" /> Reset</button>
          </div>
          <div className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_2.5rem] gap-2 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Description</span><span>Your cost</span><span>Client price</span><span />
          </div>
          <ul className="space-y-3 sm:space-y-2">
            {items.map((item, idx) => {
              const lineProfit = toNumber(item.charge) - toNumber(item.cost);
              return (
                <li key={item.id} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_2.5rem] sm:items-center sm:border-0 sm:p-0">
                  <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                    <label htmlFor={`pc-d-${item.id}`} className="sr-only">Description</label>
                    <input id={`pc-d-${item.id}`} className="input" value={item.description} onChange={(e) => update(item.id, { description: e.target.value })} placeholder={`Line ${idx + 1}`} maxLength={120} />
                    <button type="button" aria-label="Remove line" className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive sm:hidden" onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}><XIcon className="h-4 w-4" /></button>
                  </div>
                  <div>
                    <label htmlFor={`pc-c-${item.id}`} className="mb-1 block text-xs text-muted-foreground sm:sr-only">Your cost</label>
                    <NumberInput id={`pc-c-${item.id}`} value={item.cost} onValue={(n) => update(item.id, { cost: n })} placeholder="0.00" />
                  </div>
                  <div>
                    <label htmlFor={`pc-p-${item.id}`} className="mb-1 block text-xs text-muted-foreground sm:sr-only">Client price</label>
                    <NumberInput id={`pc-p-${item.id}`} value={item.charge} onValue={(n) => update(item.id, { charge: n })} placeholder="0.00" />
                  </div>
                  <button type="button" aria-label="Remove line" className="btn btn-ghost hidden h-10 w-10 p-0 text-muted-foreground hover:text-destructive sm:inline-flex" onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}><TrashIcon className="h-4 w-4" /></button>
                  {(toNumber(item.cost) > 0 || toNumber(item.charge) > 0) && (
                    <p className={`col-span-2 text-xs sm:col-span-4 sm:px-1 ${lineProfit < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      Profit {money(lineProfit)}{toNumber(item.charge) > 0 ? ` · ${((lineProfit / toNumber(item.charge)) * 100).toFixed(1)}% margin` : ''}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {items.length === 0 && <EmptyState compact icon={<CalculatorIcon />} title="No lines" description="Add a line for each cost of the job." />}
          <button type="button" className="btn btn-outline mt-4 w-full border-dashed" onClick={() => setItems((prev) => [...prev, newRow()])}><PlusIcon className="h-4 w-4" /> Add line</button>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className={`card card-pad border-t-4 ${tone.edge}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">Summary</h2>
              <div className="flex items-center gap-1.5">
                {taxOn && <span className="badge badge-muted">Tax included</span>}
                <span className={`badge ${tone.badge}`}>{h.label}</span>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Client price</dt><dd className="font-semibold tabular-nums">{money(s.totalCharge)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Your cost</dt><dd className="font-semibold tabular-nums">− {money(s.totalCost)}</dd></div>
              {taxOn && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tax ({taxRate}%)</dt><dd className="tabular-nums">+ {money(s.taxAmount)}</dd></div>}
              <div className="flex justify-between gap-3 border-t border-border pt-2 text-base"><dt className="font-semibold">Profit</dt><dd className={`font-bold tabular-nums ${s.profit < 0 ? 'text-destructive' : 'text-success'}`}>{money(s.profit)}</dd></div>
              {taxOn && (
                <div className="flex justify-between gap-3 rounded-xl bg-muted px-3 py-2"><dt className="font-semibold">Total with tax</dt><dd className="font-bold tabular-nums">{money(s.totalWithTax)}</dd></div>
              )}
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/60 p-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-foreground">{s.totalCharge > 0 ? `${s.margin.toFixed(1)}%` : '—'}</div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Margin</div>
              </div>
              <div className="rounded-xl bg-muted/60 p-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-foreground">{s.totalCost > 0 ? `${s.markup.toFixed(1)}%` : '—'}</div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Markup</div>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-accent/50 p-4 text-xs leading-relaxed text-accent-foreground">
            <p><strong>Margin</strong> is the share of the price you keep: profit ÷ price.</p>
            <p className="mt-1"><strong>Markup</strong> is what you add on top of cost: profit ÷ cost. A 50% markup is a 33.3% margin.</p>
          </section>
        </aside>
      </div>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        size="sm"
        title="Save calculation"
        description="Saved to your account, so it's there on every device. Use the same name to update it."
        footer={<><button type="button" className="btn btn-outline" onClick={() => setSaveOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => { void doSave(); }} disabled={!saveName.trim() || busy}>{busy ? 'Saving…' : 'Save'}</button></>}
      >
        <form onSubmit={(e) => { e.preventDefault(); void doSave(); }}>
          <Field label="Name" htmlFor="pc-save-name">
            <input id="pc-save-name" className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Kitchen remodel – Smith" autoFocus maxLength={80} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        size="md"
        title="Saved calculations"
        description={syncMode === 'loading' ? 'Loading your account…' : syncMode === 'account' ? 'Saved to your account.' : syncMode === 'device' ? 'Saved on this device for now.' : 'Your account could not be reached. Showing the copy on this device.'}
        footer={<button type="button" className="btn btn-outline" onClick={() => setLoadOpen(false)}>Close</button>}
      >
        {pendingCount > 0 && (
          <p className="mb-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {pendingCount} calculation{pendingCount === 1 ? ' is' : 's are'} only on this device for now and will be added to your account automatically.
          </p>
        )}
        {saved.length === 0 ? (
          <EmptyState compact icon={<FolderIcon />} title="Nothing saved yet" description="Use Save to keep a calculation for later." />
        ) : (
          <ul className="divide-y divide-border">
            {saved.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <button type="button" className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left hover:bg-muted" onClick={() => doLoad(c)}>
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{c.name}</span>
                    {c.settings?.mode === 'advanced' && <span className="badge badge-muted shrink-0 px-1.5 py-0 text-[10px]">Advanced</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{new Date(c.date).toLocaleDateString()} · {toNumber(c.margin).toFixed(1)}% margin · {c.items.length} line{c.items.length === 1 ? '' : 's'}</span>
                </button>
                <button type="button" aria-label={`Delete ${c.name}`} className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteFor(c)}><TrashIcon className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteFor}
        title={`Delete "${deleteFor?.name ?? ''}"?`}
        message="This saved calculation will be deleted from your account on every device."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteFor) void doDelete(deleteFor); else setDeleteFor(null); }}
        onCancel={() => setDeleteFor(null)}
      />
      <ConfirmDialog
        open={resetOpen}
        title="Start a new calculation?"
        message="Your current lines will be cleared. Saved calculations are not affected."
        confirmLabel="Reset"
        onConfirm={reset}
        onCancel={() => setResetOpen(false)}
      />
      <NoticeToast notice={notice} onClose={clear} />
    </div>
  );
};

export default ProfitCalculatorView;
