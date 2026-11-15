import React from 'react';
import { PlusIcon } from '../Icons.tsx';
import { Field, NumberInput, XIcon, money } from '../viewKit.tsx';
import { extraLineAmounts, markupFromPrice, type KitComponent } from '../../utils/stockMath.ts';
import { roundMoney, toNumber } from '../../utils/money.ts';
import type { AssemblyBreakdown } from '../../lib/assemblies/pricing.ts';

/**
 * Labor and expense rows of a kit, and the cost breakdown (roadmap N5). Rendered inside the kit editor
 * (PriceBookItemDetails). Plain words: your labor rate is what an hour costs you, burden is payroll taxes and insurance on
 * top, markup is the profit you add when you price the row.
 */

export interface ExtraRow { c: KitComponent; idx: number }

const PRESETS = ['Equipment rental', 'Dump fee', 'Permit fee', 'Subcontract'];

const hoursText = (h: number) => `${Math.round(h * 100) / 100} h`;

export const KitLaborExpenses: React.FC<{
  laborRows: ExtraRow[];
  expenseRows: ExtraRow[];
  laborRate: number;
  onPatch: (idx: number, patch: Partial<KitComponent>) => void;
  onRemove: (idx: number) => void;
  onAddLabor: () => void;
  onAddExpense: (name?: string) => void;
}> = ({ laborRows, expenseRows, laborRate, onPatch, onRemove, onAddLabor, onAddExpense }) => (
  <div className="space-y-4 border-t border-border pt-4">
    {/* Labor */}
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Labor</h4>
        {laborRows.length === 0 && (
          <button type="button" className="btn btn-outline btn-sm h-9" onClick={onAddLabor}><PlusIcon className="h-3.5 w-3.5" /> Add labor{laborRate > 0 ? ` (${money(laborRate)}/h)` : ''}</button>
        )}
      </div>
      {laborRows.length === 0 && <p className="text-xs text-muted-foreground">Hours of work for one kit. The rate starts at your labor rate, so the kit price covers your time.</p>}
      {laborRows.map(({ c, idx }) => {
        const x = extraLineAmounts(c);
        const burden = Math.max(0, toNumber(c.burden_pct));
        return (
          <div key={`${c.item_id}-${idx}`} className="rounded-xl border border-border border-l-4 border-l-primary bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Hours" htmlFor={`pbl-h-${idx}`}><NumberInput id={`pbl-h-${idx}`} className="h-10 py-1.5" value={toNumber(c.quantity)} onValue={(n) => onPatch(idx, { quantity: n })} /></Field>
                <Field label="Rate ($/h)" htmlFor={`pbl-r-${idx}`}><NumberInput id={`pbl-r-${idx}`} className="h-10 py-1.5" value={toNumber(c.labor_rate)} onValue={(n) => onPatch(idx, { labor_rate: n })} /></Field>
                <Field label="Burden (%)" htmlFor={`pbl-b-${idx}`}><NumberInput id={`pbl-b-${idx}`} className="h-10 py-1.5" value={toNumber(c.burden_pct)} onValue={(n) => onPatch(idx, { burden_pct: n })} placeholder="0" /></Field>
                <Field label="Markup (%)" htmlFor={`pbl-m-${idx}`}><NumberInput id={`pbl-m-${idx}`} className="h-10 py-1.5" value={toNumber(c.markup_pct)} onValue={(n) => onPatch(idx, { markup_pct: n })} placeholder="0" allowNegative /></Field>
              </div>
              <button type="button" aria-label="Remove labor" className="btn btn-ghost mt-5 h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive" onClick={() => onRemove(idx)}><XIcon className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              {hoursText(toNumber(c.quantity))} × {money(toNumber(c.labor_rate))}{burden > 0 ? ` + ${burden}% burden` : ''} = <strong className="text-foreground">{money(x.cost)}</strong> cost · <strong className="text-foreground">{money(x.price)}</strong> price
            </p>
          </div>
        );
      })}
    </div>

    {/* Expenses */}
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expenses</h4>
      {expenseRows.length === 0 && <p className="text-xs text-muted-foreground">Costs that are not stock: a rental, a dump fee, a permit, a subcontractor.</p>}
      {expenseRows.map(({ c, idx }) => {
        const x = extraLineAmounts(c);
        return (
          <div key={`${c.item_id}-${idx}`} className="space-y-2 rounded-xl border border-border border-l-4 border-l-warning bg-card p-3">
            <div className="flex items-start gap-2">
              <input className="input h-10 min-w-0 flex-1 py-1.5" value={c.custom_name || ''} onChange={(e) => onPatch(idx, { custom_name: e.target.value })} placeholder="Name, e.g. Dump fee" aria-label="Expense name" maxLength={120} />
              <button type="button" aria-label="Remove expense" className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive" onClick={() => onRemove(idx)}><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Qty" htmlFor={`pbe-q-${idx}`}><NumberInput id={`pbe-q-${idx}`} className="h-10 py-1.5" value={toNumber(c.quantity)} onValue={(n) => onPatch(idx, { quantity: n })} /></Field>
              <Field label="Cost each" htmlFor={`pbe-c-${idx}`}><NumberInput id={`pbe-c-${idx}`} className="h-10 py-1.5" value={toNumber(c.custom_cost)} onValue={(n) => onPatch(idx, { custom_cost: n })} placeholder="0.00" /></Field>
              <Field label="Markup (%)" htmlFor={`pbe-m-${idx}`}><NumberInput id={`pbe-m-${idx}`} className="h-10 py-1.5" value={toNumber(c.markup_pct)} onValue={(n) => onPatch(idx, { markup_pct: n })} placeholder="0" allowNegative /></Field>
            </div>
            <p className="text-xs tabular-nums text-muted-foreground"><strong className="text-foreground">{money(x.cost)}</strong> cost · <strong className="text-foreground">{money(x.price)}</strong> price</p>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-1.5" aria-label="Add an expense">
        {PRESETS.map((p) => (
          <button key={p} type="button" className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground" onClick={() => onAddExpense(p)}>
            <PlusIcon className="h-3 w-3" /> {p}
          </button>
        ))}
        <button type="button" className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground" onClick={() => onAddExpense('')}>
          <PlusIcon className="h-3 w-3" /> Other
        </button>
      </div>
    </div>
  </div>
);

/**
 * Where the kit's money goes: materials, labor, expenses, then the markup on top. `price` is the client price of the kit
 * (what the Pricing section below holds), which can differ from the parts' prices when the user typed their own.
 */
export const KitBreakdown: React.FC<{ b: AssemblyBreakdown; price: number }> = ({ b, price }) => {
  const total = b.cost;
  const rows: Array<{ id: string; label: string; cost: number; price: number; tone: string }> = [
    { id: 'm', label: 'Materials', cost: b.materials.cost, price: b.materials.price, tone: 'bg-primary' },
    { id: 'l', label: b.labor.hours > 0 ? `Labor · ${hoursText(b.labor.hours)}` : 'Labor', cost: b.labor.cost, price: b.labor.price, tone: 'bg-primary/55' },
    { id: 'e', label: 'Expenses', cost: b.expenses.cost, price: b.expenses.price, tone: 'bg-warning' },
  ];
  const profit = roundMoney(price - b.cost);
  const markup = markupFromPrice(b.cost, price);
  const byHand = Math.abs(price - b.price) >= 0.005;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Cost breakdown">
      {total > 0 && (
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {rows.filter((r) => r.cost > 0).map((r) => <span key={r.id} className={r.tone} style={{ width: `${(r.cost / total) * 100}%` }} />)}
        </div>
      )}
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-1 font-semibold">What</th><th className="py-1 text-right font-semibold">Your cost</th><th className="py-1 text-right font-semibold">Price</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.cost > 0 || r.price > 0 ? '' : 'text-muted-foreground/60'}>
              <td className="py-0.5"><span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${r.tone}`} />{r.label}{r.id === 'l' && b.labor.burden > 0 ? <span className="text-xs text-muted-foreground"> (incl. {money(b.labor.burden)} burden)</span> : null}</td>
              <td className="py-0.5 text-right">{money(r.cost)}</td>
              <td className="py-0.5 text-right">{money(r.price)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td className="pt-1.5">Total</td>
            <td className="pt-1.5 text-right">{money(b.cost)}</td>
            <td className="pt-1.5 text-right">{money(b.price)}</td>
          </tr>
          {byHand && (
            <tr className="font-semibold"><td className="py-0.5">Your kit price</td><td /><td className="py-0.5 text-right">{money(price)}</td></tr>
          )}
          <tr className="text-muted-foreground">
            <td className="py-0.5">Markup on top of cost</td>
            <td colSpan={2} className={`py-0.5 text-right font-semibold ${profit < 0 ? 'text-destructive' : 'text-success'}`}>{profit < 0 ? '−' : '+'}{money(Math.abs(profit))}{markup === null ? '' : ` · ${markup}%`}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
