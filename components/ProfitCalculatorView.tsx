import React, { useEffect, useMemo, useState } from 'react';
import { CalculatorIcon, DownloadIcon, FolderIcon, PlusIcon, RefreshCwIcon, SaveIcon, TrashIcon, TrendingUpIcon } from './Icons.tsx';
import { generateDocumentBase64 } from '../services/pdfGenerator.ts';
import { FormType, type UserProfile } from '../types.ts';
import { ConfirmDialog, EmptyState, Field, InlineError, Modal, NoticeToast, NumberInput, PageHeader, XIcon, money, useNotice } from './viewKit.tsx';
import { roundMoney, toNumber } from '../utils/money.ts';
import { toLocalYMD } from '../utils/localDates.ts';
import {
  deleteProfitCalculation, loadProfitCalculations, readLocalProfitCalculations, saveProfitCalculation,
  type SavedProfitCalc, type SyncMode,
} from '../lib/userData.ts';

interface ProfitItem {
  id: string;
  description: string;
  cost: number;
  charge: number;
}

/** Saved calculations live in the account (public.profit_calculations, lib/userData.ts); the device keeps a copy. */
type SavedCalculation = SavedProfitCalc;

interface ProfitCalculatorViewProps {
  onBack: () => void;
  profile?: UserProfile;
}

const newRow = (description = ''): ProfitItem => ({ id: crypto.randomUUID(), description, cost: 0, charge: 0 });
const starterRows = () => [newRow('Materials'), newRow('Labor')];

/** Pure profit math (exported for reuse/tests). Margin = profit / revenue, markup = profit / cost. */
export const profitSummary = (items: ProfitItem[], taxEnabled: boolean, taxRate: number) => {
  const totalCost = roundMoney(items.reduce((s, i) => s + toNumber(i.cost), 0));
  const totalCharge = roundMoney(items.reduce((s, i) => s + toNumber(i.charge), 0));
  const profit = roundMoney(totalCharge - totalCost);
  const margin = totalCharge > 0 ? (profit / totalCharge) * 100 : 0;
  const markup = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const taxAmount = taxEnabled ? roundMoney(totalCharge * (Math.max(0, toNumber(taxRate)) / 100)) : 0;
  return { totalCost, totalCharge, profit, margin, markup, taxAmount, totalWithTax: roundMoney(totalCharge + taxAmount) };
};

/** Price that yields `marginPct` on `cost` (0 ≤ margin < 100). */
export const priceForMargin = (cost: number, marginPct: number) => roundMoney(toNumber(cost) / (1 - marginPct / 100));

/** Where a save ended up, in words. */
const savedWhere = (mode: SyncMode, name: string, updated: boolean): { kind: 'success' | 'info' | 'error'; text: string } => {
  if (mode === 'account') return { kind: 'success', text: updated ? `"${name}" updated.` : `"${name}" saved to your account.` };
  if (mode === 'device') return { kind: 'info', text: `"${name}" saved on this device. It will be added to your account automatically.` };
  if (mode === 'offline') return { kind: 'info', text: `"${name}" saved on this device. It will be added to your account when you're back online.` };
  return { kind: 'error', text: 'Could not save the calculation. Check your connection and try again.' };
};

const health = (margin: number, hasRevenue: boolean) => {
  if (!hasRevenue) return { label: 'Enter your prices', className: 'badge-muted' };
  if (margin < 0) return { label: 'Loss', className: 'badge-danger' };
  if (margin < 15) return { label: 'Low margin', className: 'badge-danger' };
  if (margin < 30) return { label: 'Thin margin', className: 'badge-warning' };
  return { label: 'Healthy margin', className: 'badge-success' };
};

const ProfitCalculatorView: React.FC<ProfitCalculatorViewProps> = ({ onBack, profile }) => {
  const [items, setItems] = useState<ProfitItem[]>(starterRows);
  const [calcName, setCalcName] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(8);
  const [targetMargin, setTargetMargin] = useState(30);
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

  const s = useMemo(() => profitSummary(items, taxEnabled, taxRate), [items, taxEnabled, taxRate]);
  const h = health(s.margin, s.totalCharge > 0);
  const dirty = items.some((i) => i.cost || i.charge || (i.description && !['Materials', 'Labor'].includes(i.description))) || items.length !== 2;

  const update = (id: string, patch: Partial<ProfitItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const applyTargetMargin = () => {
    if (!Number.isFinite(targetMargin) || targetMargin < 0 || targetMargin >= 100) { setTargetError('Enter a margin from 0 to 99.9%.'); return; }
    const withCost = items.filter((i) => toNumber(i.cost) > 0).length;
    if (!withCost) { setTargetError('Enter your cost on at least one line first.'); return; }
    setTargetError(null);
    setItems((prev) => prev.map((i) => (toNumber(i.cost) > 0 ? { ...i, charge: priceForMargin(i.cost, targetMargin) } : i)));
    notify('success', `Prices set for a ${targetMargin}% margin on ${withCost} line${withCost === 1 ? '' : 's'} with a cost.`);
  };

  const doSave = async () => {
    const name = saveName.trim();
    if (!name || busy) return;
    if (!uid) { notify('error', 'Your account is still loading. Try again in a moment.'); return; }
    const existing = saved.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const calc: SavedCalculation = { id: existing?.id || crypto.randomUUID(), name, date: new Date().toISOString(), items, vatRate: taxRate, vatEnabled: taxEnabled, margin: s.margin };
    setBusy(true);
    try {
      const res = await saveProfitCalculation(uid, calc);
      if (res.mode === 'failed') {
        notify('error', savedWhere(res.mode, name, !!existing).text);
        return;
      }
      setSaved((prev) => [res.calc, ...prev.filter((c) => c.id !== res.calc.id)]);
      if (res.mode !== 'account') { setSyncMode(res.mode); setPendingCount((n) => n + (existing ? 0 : 1)); }
      setCalcName(name);
      setSaveOpen(false);
      const msg = savedWhere(res.mode, name, !!existing);
      notify(msg.kind === 'error' ? 'error' : msg.kind === 'info' ? 'info' : 'success', msg.text);
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
  };

  const doLoad = (calc: SavedCalculation) => {
    setItems(calc.items.map((i) => ({ id: i.id || crypto.randomUUID(), description: String(i.description || ''), cost: toNumber(i.cost), charge: toNumber(i.charge) })));
    setTaxEnabled(!!calc.vatEnabled);
    setTaxRate(toNumber(calc.vatRate));
    setCalcName(calc.name);
    setLoadOpen(false);
    notify('info', `Loaded "${calc.name}".`);
  };

  const reset = () => {
    setItems(starterRows());
    setCalcName('');
    setTaxEnabled(false);
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
        vatEnabled: taxEnabled,
        vatRate: taxEnabled ? taxRate : 0,
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
            <button type="button" className="btn btn-outline" onClick={() => setLoadOpen(true)}><FolderIcon className="h-4 w-4" /> Saved{saved.length ? ` (${saved.length})` : ''}</button>
            <button type="button" className="btn btn-outline" onClick={() => { setSaveName(calcName); setSaveOpen(true); }}><SaveIcon className="h-4 w-4" /> Save</button>
            <button type="button" className="btn btn-primary" onClick={exportPdf} disabled={exporting}><DownloadIcon className="h-4 w-4" /> {exporting ? 'Creating PDF…' : 'Export PDF'}</button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <section className="card card-pad">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">Line items</h2>
                <p className="text-xs text-muted-foreground">Your cost and what you charge the client for each part of the job.</p>
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

          <section className="card card-pad space-y-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Price for a target margin</h2>
              <p className="text-xs text-muted-foreground">Sets each line's price to cost ÷ (1 − margin). Lines without a cost keep their price.</p>
            </div>
            {targetError && <InlineError>{targetError}</InlineError>}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Target margin (%)" htmlFor="pc-target" className="sm:w-48">
                <NumberInput id="pc-target" value={targetMargin} onValue={(n) => { setTargetMargin(n); setTargetError(null); }} />
              </Field>
              <button type="button" className="btn btn-outline" onClick={applyTargetMargin}><TrendingUpIcon className="h-4 w-4" /> Apply to prices</button>
            </div>
            <div className="border-t border-border pt-4">
              <label className="flex min-h-[40px] cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-medium text-foreground">Add sales tax / VAT</span>
                  <span className="block text-xs text-muted-foreground">Tax is charged on the client price and does not change your profit.</span>
                </span>
                <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />
              </label>
              {taxEnabled && (
                <Field label="Tax rate (%)" htmlFor="pc-tax" className="mt-2 sm:w-48">
                  <NumberInput id="pc-tax" value={taxRate} onValue={(n) => setTaxRate(Math.min(100, n))} />
                </Field>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="card card-pad">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">Summary</h2>
              <span className={`badge ${h.className}`}>{h.label}</span>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Client price</dt><dd className="font-semibold tabular-nums">{money(s.totalCharge)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Your cost</dt><dd className="font-semibold tabular-nums">− {money(s.totalCost)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-border pt-2 text-base"><dt className="font-semibold">Profit</dt><dd className={`font-bold tabular-nums ${s.profit < 0 ? 'text-destructive' : 'text-success'}`}>{money(s.profit)}</dd></div>
              {taxEnabled && (
                <>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tax ({taxRate}%)</dt><dd className="tabular-nums">+ {money(s.taxAmount)}</dd></div>
                  <div className="flex justify-between gap-3 rounded-xl bg-muted px-3 py-2"><dt className="font-semibold">Client pays</dt><dd className="font-bold tabular-nums">{money(s.totalWithTax)}</dd></div>
                </>
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
        description="Saved on this device. Use the same name to update it."
        footer={<><button type="button" className="btn btn-outline" onClick={() => setSaveOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={doSave} disabled={!saveName.trim()}>Save</button></>}
      >
        <form onSubmit={(e) => { e.preventDefault(); doSave(); }}>
          <Field label="Name" htmlFor="pc-save-name">
            <input id="pc-save-name" className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Kitchen remodel – Smith" autoFocus maxLength={80} />
          </Field>
        </form>
      </Modal>

      <Modal open={loadOpen} onClose={() => setLoadOpen(false)} size="md" title="Saved calculations" description="Stored in this browser on this device." footer={<button type="button" className="btn btn-outline" onClick={() => setLoadOpen(false)}>Close</button>}>
        {saved.length === 0 ? (
          <EmptyState compact icon={<FolderIcon />} title="Nothing saved yet" description="Use Save to keep a calculation for later." />
        ) : (
          <ul className="divide-y divide-border">
            {saved.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <button type="button" className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left hover:bg-muted" onClick={() => doLoad(c)}>
                  <span className="block truncate font-semibold text-foreground">{c.name}</span>
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
        message="This saved calculation will be removed from this device."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteFor) persist(saved.filter((c) => c.id !== deleteFor.id)); setDeleteFor(null); }}
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
