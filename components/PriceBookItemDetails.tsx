import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedItem } from '../types.ts';
import { ImageIcon, PlusIcon, SearchIcon, StarIcon } from './Icons.tsx';
import { Field, IMAGE_ACCEPT, InlineError, LayersIcon, Modal, NumberInput, XIcon, friendlyError, money } from './viewKit.tsx';
import { PRICE_BOOK_DEFAULT_MARKUP, kitPriceIsManual as partsPriceIsManual, markupFromPrice, marginFromPrice, priceBookKitTotals, priceFromMarkup, type KitComponent } from '../utils/stockMath.ts';
import { roundMoney, toNumber } from '../utils/money.ts';

export type PriceBookDraft = Omit<Partial<SavedItem>, 'assembly_items'> & { unit?: string; assembly_items?: KitComponent[] };

interface PriceBookItemDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  /** Persists the item; throw to keep the dialog open and show the error. */
  onSave: (item: PriceBookDraft) => Promise<void>;
  /** Existing item (has an id) or a template for a new one (e.g. `{ is_assembly: true }`). */
  item?: (Partial<SavedItem> & { unit?: string }) | null;
  categories: string[];
  allItems: SavedItem[];
  onUploadImage?: (file: File) => Promise<string>;
  isPremium: boolean;
}

const TYPES: { value: NonNullable<SavedItem['type']>; label: string }[] = [
  { value: 'service', label: 'Service' },
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  // Any item can be typed "Bundle" (as in the original app); a kit is a bundle built from components.
  { value: 'bundle', label: 'Bundle' },
];
const UNITS = ['each', 'hr', 'day', 'job', 'sq ft', 'ft', 'lin ft', 'm', 'm²', 'yd', 'gal', 'lb', 'box', 'set'];
const MAX_IMAGES = 6;

const blankDraft = (template?: PriceBookItemDetailsProps['item']): PriceBookDraft => ({
  name: '', description: '', sku: '', category: 'General', type: template?.is_assembly ? 'bundle' : 'service', unit: 'each',
  taxable: true, unit_cost: 0, markup: PRICE_BOOK_DEFAULT_MARKUP, rate: 0, images: [], is_assembly: !!template?.is_assembly, assembly_items: [],
  ...(template || {}),
});

const fromItem = (item: NonNullable<PriceBookItemDetailsProps['item']>): PriceBookDraft => {
  const cost = toNumber(item.unit_cost ?? item.cost);
  const rate = toNumber(item.rate);
  // The saved price is what clients see: keep it, and show the markup that matches it (no cost yet: the saved markup,
  // or the original app's 50% default).
  const markup = markupFromPrice(cost, rate) ?? toNumber(item.markup ?? PRICE_BOOK_DEFAULT_MARKUP);
  return {
    ...item,
    name: item.name ?? '',
    description: item.description ?? '',
    sku: item.sku ?? '',
    category: item.category ?? 'General',
    type: item.type ?? (item.is_assembly ? 'bundle' : 'service'),
    unit: (item as any).unit ?? 'each',
    taxable: item.taxable ?? true,
    unit_cost: cost,
    rate,
    markup,
    images: Array.isArray(item.images) ? item.images.filter((u) => typeof u === 'string') : [],
    assembly_items: Array.isArray(item.assembly_items) ? item.assembly_items.map((c) => ({ ...c })) : [],
  };
};

/** An existing kit whose saved price isn't the sum of its parts' prices was priced by hand (new items: never). */
const kitPriceIsManual = (item: PriceBookItemDetailsProps['item'] | undefined, byId: Map<string, SavedItem>): boolean =>
  !!item?.id && !!item.is_assembly && partsPriceIsManual({ rate: item.rate, assembly_items: item.assembly_items as KitComponent[] | undefined }, byId);

const PriceBookItemDetails: React.FC<PriceBookItemDetailsProps> = ({ isOpen, onClose, onSave, item, categories, allItems, onUploadImage, isPremium }) => {
  // All hooks run on every render (the early return is at the end: VIEW-029).
  const [form, setForm] = useState<PriceBookDraft>(() => (item?.id ? fromItem(item) : blankDraft(item)));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [componentSearch, setComponentSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!item?.id;
  const byId = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);
  /**
   * Kits: the price follows the sum of the parts' prices (original app) until the user types a price or a markup. An
   * existing kit whose saved price differs from its parts total was priced by hand: that price is kept.
   */
  const [priceTouched, setPriceTouched] = useState(() => kitPriceIsManual(item, byId));

  useEffect(() => {
    if (!isOpen) return;
    setForm(item?.id ? fromItem(item) : blankDraft(item));
    setPriceTouched(kitPriceIsManual(item, byId));
    setError(null);
    setComponentSearch('');
  }, [isOpen, item]); // eslint-disable-line react-hooks/exhaustive-deps

  const kitTotals = useMemo(() => priceBookKitTotals(form.assembly_items, byId), [form.assembly_items, byId]);
  const isKit = !!form.is_assembly;

  const duplicate = useMemo(() => {
    const n = (form.name || '').trim().toLowerCase();
    const sku = (form.sku || '').trim().toLowerCase();
    return allItems.find((i) => i.id !== item?.id && ((n && (i.name || '').trim().toLowerCase() === n) || (sku && (i.sku || '').trim().toLowerCase() === sku)));
  }, [form.name, form.sku, allItems, item?.id]);

  const set = <K extends keyof PriceBookDraft>(k: K, v: PriceBookDraft[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ---- pricing: price = cost × (1 + markup) ; editing the price back-computes the markup
  const onCost = (cost: number) => setForm((f) => ({ ...f, unit_cost: cost, rate: priceFromMarkup(cost, f.markup) }));
  const onMarkup = (markup: number) => { setPriceTouched(true); setForm((f) => ({ ...f, markup, rate: priceFromMarkup(f.unit_cost, markup) })); };
  const onPrice = (rate: number) => { setPriceTouched(true); setForm((f) => ({ ...f, rate, markup: markupFromPrice(f.unit_cost, rate) ?? f.markup })); };

  // ---- kits: cost follows the components; the price follows the parts' prices until the user sets it by hand
  const updateComponents = (next: KitComponent[]) => {
    setForm((f) => {
      const totals = priceBookKitTotals(next, byId);
      const rate = priceTouched ? toNumber(f.rate) : totals.retail;
      return { ...f, assembly_items: next, unit_cost: totals.cost, rate, markup: markupFromPrice(totals.cost, rate) ?? f.markup };
    });
  };
  useEffect(() => {
    // Opening an existing kit: refresh its cost from current component costs, keep its saved price.
    if (!isOpen || !isKit) return;
    setForm((f) => {
      const totals = priceBookKitTotals(f.assembly_items, byId);
      if (Math.abs(totals.cost - toNumber(f.unit_cost)) < 0.005) return f;
      return { ...f, unit_cost: totals.cost, markup: markupFromPrice(totals.cost, f.rate) ?? f.markup };
    });
  }, [isOpen, isKit, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  const components = (form.assembly_items || []) as KitComponent[];
  const addComponent = (target: SavedItem) => {
    const existing = components.find((c) => c.item_id === target.id && !c.is_custom);
    updateComponents(existing
      ? components.map((c) => (c === existing ? { ...c, quantity: toNumber(c.quantity) + 1 } : c))
      : [...components, { item_id: target.id, quantity: 1, override_price: null }]);
  };
  const patchComponent = (idx: number, patch: Partial<KitComponent>) => updateComponents(components.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const catalog = useMemo(() => {
    const q = componentSearch.trim().toLowerCase();
    return allItems
      .filter((i) => i.id !== item?.id && !i.is_assembly && (!q || (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, 30);
  }, [allItems, componentSearch, item?.id]);

  // ---- photos
  const images = (form.images || []) as string[];
  const upload = async (files: FileList | File[] | null) => {
    if (!files || !onUploadImage) return;
    const list = Array.from(files).filter((f) => IMAGE_ACCEPT.split(',').includes(f.type));
    if (!list.length) { setError('Choose a JPG, PNG, WebP or GIF image.'); return; }
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { setError(`You can add up to ${MAX_IMAGES} photos.`); return; }
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const f of list.slice(0, room)) {
        if (f.size > 15 * 1024 * 1024) throw new Error(`"${f.name}" is larger than 15 MB.`);
        urls.push(await onUploadImage(f));
      }
      setForm((prev) => ({ ...prev, images: [...((prev.images || []) as string[]), ...urls] }));
    } catch (e) {
      setError(friendlyError(e, 'The photo could not be uploaded.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeImage = (idx: number) => set('images', images.filter((_, i) => i !== idx));
  const makeCover = (idx: number) => set('images', [images[idx], ...images.filter((_, i) => i !== idx)]);

  const save = async () => {
    if (!(form.name || '').trim()) { setError('Give the item a name.'); return; }
    if (toNumber(form.rate) < 0 || toNumber(form.unit_cost) < 0) { setError('Prices cannot be negative.'); return; }
    // new kits only: an old kit without components (original app) can still be edited and saved
    if (isKit && !components.length && !isEdit) { setError('Add at least one component to the kit.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...form,
        name: (form.name || '').trim(),
        sku: (form.sku || '').trim().toUpperCase(),
        category: (form.category || '').trim() || 'General',
        description: (form.description || '').trim(),
        // exactly as entered ($2.375 per sq ft stays 2.375); prices computed from a markup are already rounded
        rate: toNumber(form.rate),
        unit_cost: toNumber(form.unit_cost),
        markup: Math.round(toNumber(form.markup) * 10) / 10,
        type: isKit ? 'bundle' : form.type,
        assembly_items: isKit ? components.filter((c) => toNumber(c.quantity) > 0) : [],
      });
    } catch (e) {
      setError(friendlyError(e, 'Could not save the item.'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const margin = marginFromPrice(form.unit_cost, form.rate);
  const profit = roundMoney(toNumber(form.rate) - toNumber(form.unit_cost));

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      busy={saving || uploading}
      size="lg"
      title={isEdit ? `Edit ${isKit ? 'kit' : 'item'}` : isKit ? 'New kit' : 'New price book item'}
      description={isKit ? 'A kit bundles several price-book items into one line on your estimates and invoices.' : 'Saved items can be added to estimates and invoices in one tap.'}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || uploading || !(form.name || '').trim()}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to price book'}</button>
        </>
      }
    >
      <div className="space-y-6">
        {error && <InlineError>{error}</InlineError>}

        {/* Details */}
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Name *" htmlFor="pb-name" className="sm:col-span-2" error={duplicate ? `Similar to "${duplicate.name}" already in your price book.` : undefined}>
              <input id="pb-name" className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder={isKit ? 'e.g. Toilet install kit' : 'e.g. Faucet installation'} autoFocus={!isEdit} maxLength={160} />
            </Field>
            <Field label="SKU / code" htmlFor="pb-sku">
              <input id="pb-sku" className="input uppercase" value={form.sku || ''} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="PLB-001" maxLength={40} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Category" htmlFor="pb-cat" className="col-span-2 sm:col-span-1">
              <input id="pb-cat" className="input" list="pb-categories" value={form.category || ''} onChange={(e) => set('category', e.target.value)} placeholder="General" />
              <datalist id="pb-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            {!isKit && (
              <Field label="Type" htmlFor="pb-type">
                <select id="pb-type" className="input" value={form.type || 'service'} onChange={(e) => set('type', e.target.value as SavedItem['type'])}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Unit" htmlFor="pb-unit">
              <input id="pb-unit" className="input" list="pb-units" value={form.unit || ''} onChange={(e) => set('unit', e.target.value)} placeholder="each" maxLength={20} />
              <datalist id="pb-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            </Field>
          </div>
          <Field label="Description" htmlFor="pb-desc" hint="Shown on estimates and invoices under the item name.">
            <textarea id="pb-desc" className="input min-h-[84px] resize-y" value={form.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="What's included…" maxLength={2000} />
          </Field>
          <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={form.taxable ?? true} onChange={(e) => set('taxable', e.target.checked)} />
            <span>Taxable <span className="text-muted-foreground">(sales tax applies when used on a document)</span></span>
          </label>
        </section>

        {/* Kit components */}
        {isKit && (
          <section className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2"><LayersIcon className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Components</h3></div>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input pl-9" value={componentSearch} onChange={(e) => setComponentSearch(e.target.value)} placeholder="Search your price book to add components" aria-label="Search components" />
            </div>
            {componentSearch.trim() && (
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card">
                {catalog.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No matching items.</li>}
                {catalog.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted" onClick={() => addComponent(c)}>
                      <span className="min-w-0 truncate">{c.name}{c.sku ? <span className="text-muted-foreground"> · {c.sku}</span> : null}</span>
                      <span className="flex shrink-0 items-center gap-2 text-muted-foreground">{money(c.rate)} <PlusIcon className="h-4 w-4 text-primary" /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {components.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">Search above to add items, or add a custom line.</p>
            ) : (
              <ul className="space-y-2">
                {components.map((c, idx) => {
                  const def = c.is_custom ? undefined : byId.get(c.item_id);
                  return (
                    <li key={`${c.item_id}-${idx}`} className="space-y-2 rounded-xl border border-border bg-card p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          {c.is_custom ? (
                            <input className="input h-10 py-1.5" value={c.custom_name || ''} onChange={(e) => patchComponent(idx, { custom_name: e.target.value })} placeholder="Custom line name" aria-label="Custom component name" />
                          ) : (
                            <div className="truncate pt-1 text-sm font-medium">{def?.name || 'Deleted item'}<span className="block text-xs font-normal text-muted-foreground">{def ? `Cost ${money(def.unit_cost ?? def.cost)} · price ${money(def.rate)}` : 'No longer in your price book'}</span></div>
                          )}
                        </div>
                        <button type="button" aria-label="Remove component" className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive" onClick={() => updateComponents(components.filter((_, i) => i !== idx))}><XIcon className="h-4 w-4" /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Qty" htmlFor={`pbc-q-${idx}`}><NumberInput id={`pbc-q-${idx}`} className="h-10 py-1.5" value={toNumber(c.quantity)} onValue={(n) => patchComponent(idx, { quantity: n })} /></Field>
                        {c.is_custom && <Field label="Cost" htmlFor={`pbc-c-${idx}`}><NumberInput id={`pbc-c-${idx}`} className="h-10 py-1.5" value={toNumber(c.custom_cost)} onValue={(n) => patchComponent(idx, { custom_cost: n })} /></Field>}
                        <Field label={c.is_custom ? 'Price' : 'Price override'} htmlFor={`pbc-p-${idx}`}>
                          <NumberInput
                            id={`pbc-p-${idx}`}
                            className="h-10 py-1.5"
                            value={c.override_price === null || c.override_price === undefined || c.override_price === '' ? (c.is_custom ? 0 : null) : toNumber(c.override_price)}
                            placeholder={def ? String(toNumber(def.rate)) : '0'}
                            onValue={(n) => patchComponent(idx, { override_price: n })}
                            onEmpty={c.is_custom ? undefined : () => patchComponent(idx, { override_price: null })}
                          />
                        </Field>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <button type="button" className="btn btn-outline w-full" onClick={() => updateComponents([...components, { item_id: crypto.randomUUID(), quantity: 1, is_custom: true, custom_name: '', override_price: 0, custom_cost: 0 }])}>
              <PlusIcon className="h-4 w-4" /> Custom line
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Components cost <strong className="text-foreground">{money(kitTotals.cost)}</strong> · priced separately <strong className="text-foreground">{money(kitTotals.retail)}</strong></span>
              {priceTouched
                ? <button type="button" className="btn btn-ghost btn-sm h-9" onClick={() => { setPriceTouched(false); setForm((f) => ({ ...f, rate: kitTotals.retail, markup: markupFromPrice(f.unit_cost, kitTotals.retail) ?? f.markup })); }} disabled={!kitTotals.retail}>Use {money(kitTotals.retail)} as kit price</button>
                : <span className="text-xs text-muted-foreground">Kit price follows the parts until you type your own.</span>}
            </div>
          </section>
        )}

        {/* Pricing */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Pricing</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={isKit ? 'Cost (from components)' : 'Your cost ($)'} htmlFor="pb-cost">
              <NumberInput id="pb-cost" value={toNumber(form.unit_cost)} onValue={onCost} disabled={isKit} placeholder="0.00" />
            </Field>
            <Field label="Markup (%)" htmlFor="pb-markup" hint={toNumber(form.unit_cost) > 0 ? undefined : 'Enter a cost to use markup.'}>
              <NumberInput id="pb-markup" value={toNumber(form.markup)} onValue={onMarkup} disabled={toNumber(form.unit_cost) <= 0} allowNegative />
            </Field>
            <Field label="Client price ($)" htmlFor="pb-price">
              <NumberInput id="pb-price" className="font-semibold" value={toNumber(form.rate)} onValue={onPrice} placeholder="0.00" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted p-3 text-center text-sm">
            <div><div className="text-xs text-muted-foreground">Profit / {form.unit || 'unit'}</div><div className={`font-bold ${profit < 0 ? 'text-destructive' : 'text-success'}`}>{money(profit)}</div></div>
            <div><div className="text-xs text-muted-foreground">Margin</div><div className="font-bold">{margin === null ? '—' : `${margin}%`}</div></div>
            <div><div className="text-xs text-muted-foreground">Markup</div><div className="font-bold">{markupFromPrice(form.unit_cost, form.rate) === null ? '—' : `${markupFromPrice(form.unit_cost, form.rate)}%`}</div></div>
          </div>
        </section>

        {/* Photos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Photos</h3>
            {!isPremium && <span className="badge badge-warning"><StarIcon className="h-3 w-3" /> Premium</span>}
          </div>
          {isPremium && onUploadImage ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'}`}
            >
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drag photos here or</p>
              <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => upload(e.target.files)} />
              <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()} disabled={uploading || images.length >= MAX_IMAGES}>{uploading ? 'Uploading…' : 'Choose photos'}</button>
              <p className="text-xs text-muted-foreground">Up to {MAX_IMAGES} photos. The first one is the cover.</p>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
              {isPremium ? 'Photo upload is not available right now.' : 'Add photos to your price book items with Premium, so your team can recognise parts in the field.'}
            </p>
          )}
          {images.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {images.map((url, i) => (
                <li key={`${url}-${i}`} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                  <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  {i === 0 ? (
                    <span className="badge absolute bottom-1 left-1 bg-black/60 text-[10px] text-white">Cover</span>
                  ) : (
                    <button type="button" onClick={() => makeCover(i)} className="badge absolute bottom-1 left-1 bg-black/60 text-[10px] text-white sm:opacity-0 sm:group-hover:opacity-100">Make cover</button>
                  )}
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removeImage(i)} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-destructive">
                    <XIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
};

export default PriceBookItemDetails;
