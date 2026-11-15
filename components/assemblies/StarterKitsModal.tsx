import React, { useEffect, useMemo, useState } from 'react';
import { InlineError, Modal, friendlyError, money } from '../viewKit.tsx';
import { STARTER_KITS, STARTER_PRICES_NOTE, STARTER_TRADES, starterTradeLabel, type StarterKit, type StarterTrade } from '../../lib/assemblies/starterKits.ts';
import { starterKitExists, starterPreview } from '../../lib/assemblies/starterImport.ts';

/**
 * "Starter kits" (roadmap N5): ready-made assemblies per trade the user imports into the price book and edits. Nothing
 * is saved until "Import"; kits already in the price book (same name) are listed but skipped. The screen
 * (PriceBookView) does the saving, so offline behaviour is the one of every price-book write.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  /** names of the price-book items the user already has (duplicates are skipped) */
  existingNames: string[];
  /** the user's labor rate ($/h): the labor of every imported kit uses it */
  laborRate: number;
  onImport: (kitIds: string[]) => Promise<void>;
}

const KitPreview: React.FC<{ kit: StarterKit; laborRate: number }> = ({ kit, laborRate }) => {
  const p = starterPreview(kit, laborRate);
  const b = p.breakdown;
  return (
    <div className="space-y-2 border-t border-border bg-muted/30 px-3 py-3 text-xs">
      <p className="text-muted-foreground">{kit.summary}</p>
      <table className="w-full tabular-nums">
        <tbody>
          {kit.materials.map((m) => (
            <tr key={m.name}>
              <td className="py-0.5 pr-2 text-foreground">{m.name}</td>
              <td className="whitespace-nowrap py-0.5 pr-2 text-right text-muted-foreground">{m.quantity} {m.unit}</td>
              <td className="whitespace-nowrap py-0.5 text-right text-muted-foreground">{money(m.cost)} ea</td>
            </tr>
          ))}
          {kit.laborHours > 0 && (
            <tr className="font-medium">
              <td className="py-0.5 pr-2 text-foreground">Labor</td>
              <td className="whitespace-nowrap py-0.5 pr-2 text-right text-muted-foreground">{kit.laborHours} h</td>
              <td className="whitespace-nowrap py-0.5 text-right text-muted-foreground">{money(laborRate)}/h</td>
            </tr>
          )}
          {kit.expenses.map((e) => (
            <tr key={e.name} className="font-medium">
              <td className="py-0.5 pr-2 text-foreground">{e.name}</td>
              <td className="whitespace-nowrap py-0.5 pr-2 text-right text-muted-foreground">{e.quantity ?? 1}</td>
              <td className="whitespace-nowrap py-0.5 text-right text-muted-foreground">{money(e.cost)} ea</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tabular-nums text-muted-foreground">
        Materials {money(b.materials.cost)} · labor {money(b.labor.cost)} · expenses {money(b.expenses.cost)} = <strong className="text-foreground">{money(p.cost)}</strong> cost, <strong className="text-foreground">{money(p.price)}</strong> price{p.markupPct === null ? '' : ` (${p.markupPct}% markup)`}
      </p>
    </div>
  );
};

const StarterKitsModal: React.FC<Props> = ({ open, onClose, existingNames, laborRate, onImport }) => {
  const [trade, setTrade] = useState<'all' | StarterTrade>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTrade('all');
    setPicked(new Set());
    setOpenId(null);
    setError(null);
  }, [open]);

  const taken = useMemo(() => new Set(STARTER_KITS.filter((k) => starterKitExists(k, existingNames)).map((k) => k.id)), [existingNames]);
  const shown = useMemo(() => STARTER_KITS.filter((k) => trade === 'all' || k.trade === trade), [trade]);
  const free = shown.filter((k) => !taken.has(k.id));
  const allShownPicked = free.length > 0 && free.every((k) => picked.has(k.id));

  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleShown = () => setPicked((prev) => { const n = new Set(prev); for (const k of free) { if (allShownPicked) n.delete(k.id); else n.add(k.id); } return n; });

  const count = Array.from(picked).filter((id) => !taken.has(id)).length;
  const doImport = async () => {
    const ids = STARTER_KITS.filter((k) => picked.has(k.id) && !taken.has(k.id)).map((k) => k.id);
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    try { await onImport(ids); } catch (e) { setError(friendlyError(e, 'The kits could not be imported.')); } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title="Starter kits"
      description="Ready-made kits per trade. Pick the ones you want; they land in your price book as normal kits you can edit."
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={doImport} disabled={busy || count === 0}>{busy ? 'Importing…' : count ? `Import ${count} kit${count === 1 ? '' : 's'}` : 'Import'}</button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError>{error}</InlineError>}
        <p className="rounded-xl border-l-4 border-l-warning bg-warning/10 px-3 py-2 text-sm text-foreground">
          <strong>{STARTER_PRICES_NOTE}</strong>{' '}
          <span className="text-muted-foreground">Labor uses your labor rate ({money(laborRate)}/h). Check every price before you use a kit on a client's estimate.</span>
        </p>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Trades">
          {[{ id: 'all' as const, label: 'All', n: STARTER_KITS.length }, ...STARTER_TRADES.map((t) => ({ id: t.id, label: t.label, n: STARTER_KITS.filter((k) => k.trade === t.id).length }))].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={trade === t.id}
              onClick={() => setTrade(t.id)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${trade === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}<span className={`text-xs ${trade === t.id ? 'opacity-80' : 'opacity-60'}`}>{t.n}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{picked.size ? `${count} selected` : 'Tap a kit to select it'}</span>
          {free.length > 0 && <button type="button" className="font-medium text-primary hover:underline" onClick={toggleShown}>{allShownPicked ? 'Clear these' : `Select ${trade === 'all' ? 'all' : `all ${starterTradeLabel(trade)}`}`}</button>}
        </div>

        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {shown.map((k) => {
            const isTaken = taken.has(k.id);
            const isPicked = picked.has(k.id) && !isTaken;
            const p = starterPreview(k, laborRate);
            const expanded = openId === k.id;
            return (
              <li key={k.id} className={isTaken ? 'bg-muted/40' : ''}>
                <div className="flex items-stretch">
                  <label className={`flex min-w-0 flex-1 items-start gap-3 px-3 py-3 ${isTaken ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={isPicked} disabled={isTaken} onChange={() => toggle(k.id)} aria-label={`Select ${k.name}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold leading-snug ${isTaken ? 'text-muted-foreground' : 'text-foreground'}`}>{k.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {trade === 'all' ? `${starterTradeLabel(k.trade)} · ` : ''}per {k.unit} · {k.materials.length} materials{k.laborHours > 0 ? ` · ${k.laborHours} h labor` : ''}{k.expenses.length ? ` · ${k.expenses.length} expense${k.expenses.length === 1 ? '' : 's'}` : ''}
                      </span>
                      {isTaken && <span className="mt-1 inline-block text-xs font-medium text-muted-foreground">Already in your price book: skipped</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-foreground">{money(p.price)}</span>
                      <span className="block text-[11px] text-muted-foreground">cost {money(p.cost)}</span>
                    </span>
                  </label>
                  <button type="button" className="shrink-0 border-l border-border px-3 text-xs font-medium text-primary hover:bg-muted" aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : k.id)}>
                    {expanded ? 'Hide' : 'Details'}
                  </button>
                </div>
                {expanded && <KitPreview kit={k} laborRate={laborRate} />}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};

export default StarterKitsModal;
