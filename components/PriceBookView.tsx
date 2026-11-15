import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { discardPendingCreate, offlineEntityQueueFor, pendingEntityItems, withPendingRows } from '../lib/offline/offlineEntities.ts';
import { loadWithDeviceCopy } from '../lib/offline/deviceCache.ts';
import { dbApi } from '../utils/db.ts';
import { isPaidTier, normalizeTier } from '../lib/plans.ts';
import type { SavedItem } from '../types.ts';
import { BoxIcon, BriefcaseIcon, CopyIcon, EditIcon, PlusIcon, SearchIcon, TagIcon, TrashIcon, UsersIcon } from './Icons.tsx';
import PriceBookItemDetails, { type PriceBookDraft } from './PriceBookItemDetails.tsx';
import StarterKitsModal from './assemblies/StarterKitsModal.tsx';
import { extraRowsSummary } from '../lib/assemblies/pricing.ts';
import { planStarterImport, usableLaborRate } from '../lib/assemblies/starterImport.ts';
import { resolveLaborRate } from '../lib/finance.ts';
import {
  ActionMenu, ConfirmDialog, EmptyState, GridIcon, InlineError, LayersIcon, NoticeToast, PageHeader, Pager, RowsIcon, Segmented,
  SkeletonGrid, fetchAllPages, friendlyError, getCurrentUserId, money, ownStoragePath, uploadToOwnFolder, useNotice, withSchemaFallback,
} from './viewKit.tsx';
import HelpButton from './help/HelpButton.tsx';
import { marginFromPrice } from '../utils/stockMath.ts';
import { toNumber } from '../utils/money.ts';
import { compressImage } from '../utils/imageCompression.ts';
import { updatePriceBookLibraryFields } from '../lib/suppliers/suppliersDb.ts';
import { NEEDS_CONNECTION } from '../lib/offline/connection.ts';

interface PriceBookViewProps {
  onBack: () => void;
  /** Optional seed for the first paint; the view loads every row itself. */
  savedItems?: SavedItem[];
  /** @deprecated ignored: the view saves through lib/supabase.ts */
  onUpdateItem?: (item: SavedItem) => Promise<void>;
  /** @deprecated ignored */
  onAddItem?: (item: Omit<SavedItem, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  /** @deprecated ignored */
  onDuplicateItem?: (item: SavedItem) => Promise<void>;
  /** @deprecated ignored */
  onDeleteItem?: (id: string) => Promise<void>;
  /** Optional uploader; by default photos go to `price-book-images/<uid>/`. */
  onUploadImage?: (file: File) => Promise<string>;
  isPremium?: boolean;
  /** opens the upgrade prompt (Premium supplier hints in the item editor) */
  onUpgrade?: (reason?: string) => void;
  /** @deprecated ignored: every item is loaded */
  onLoadMore?: () => Promise<void>;
  /** @deprecated ignored */
  hasMore?: boolean;
  /** Called after any change so the App can refresh its cached price book (used by forms). */
  onDataChanged?: () => void;
  /** Open the Add dialog once on mount (AI assistant "add to price book"). Never auto-saves. */
  openAddModal?: boolean;
  /** Values for that Add dialog. */
  prefillData?: { name?: string; rate?: number; unit_cost?: number; description?: string; category?: string } | null;
  /** the account's default labor rate ($/h): where a kit's labor and the starter kits' labor start (roadmap N5) */
  defaultLaborRate?: number;
}

type Item = SavedItem & { unit?: string };
type SortKey = 'name' | 'price-desc' | 'price-asc' | 'margin' | 'recent';
type TypeFilter = 'all' | 'service' | 'labor' | 'material' | 'kit';

const BUCKET = 'price-book-images';
const PAGE_SIZE = 24;
const VIEW_KEY = 'cd.pricebook.view';

const parseArray = (v: unknown): any[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { /* postgres text[] literal */ }
    if (v.startsWith('{') && v.endsWith('}')) return v.slice(1, -1).split(',').map((s) => s.replace(/^"|"$/g, '')).filter(Boolean);
  }
  return [];
};

const normalize = (r: any): Item => ({
  ...r,
  name: String(r?.name ?? ''),
  rate: toNumber(r?.rate),
  unit_cost: toNumber(r?.unit_cost ?? r?.cost),
  markup: r?.markup === null || r?.markup === undefined ? undefined : toNumber(r.markup),
  images: parseArray(r?.images).filter((u: unknown) => typeof u === 'string' && /^https?:\/\//i.test(u as string)),
  assembly_items: parseArray(r?.assembly_items),
  is_assembly: !!r?.is_assembly,
  taxable: r?.taxable ?? true,
});

const TypeIcon: React.FC<{ item: Item; className?: string }> = ({ item, className = 'h-6 w-6' }) => {
  if (item.is_assembly || item.type === 'bundle') return <LayersIcon className={className} />;
  if (item.type === 'labor') return <UsersIcon className={className} />;
  if (item.type === 'material') return <BoxIcon className={className} />;
  return <BriefcaseIcon className={className} />;
};

const MarginChip: React.FC<{ item: Item }> = ({ item }) => {
  if (toNumber(item.unit_cost) <= 0) return null;
  const m = marginFromPrice(item.unit_cost, item.rate);
  if (m === null) return null;
  return <span className={`badge ${m < 0 ? 'badge-danger' : m < 15 ? 'badge-warning' : 'badge-success'}`}>{m}% margin</span>;
};

const PriceBookView: React.FC<PriceBookViewProps> = ({ onBack, savedItems: seed, onUploadImage, isPremium: isPremiumProp, onUpgrade, onDataChanged, openAddModal, prefillData, defaultLaborRate }) => {
  const [items, setItems] = useState<Item[]>(() => (seed || []).map(normalize));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [paidTier, setPaidTier] = useState(false);
  const { notice, notify, clear } = useNotice();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as 'grid' | 'list') || 'grid'; } catch { return 'grid'; }
  });
  const [page, setPage] = useState(0);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [starterOpen, setStarterOpen] = useState(false);
  const [deleteFor, setDeleteFor] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const sessionUploads = useRef<string[]>([]);

  const changed = useRef(onDataChanged);
  changed.current = onDataChanged;
  const isPremium = !!isPremiumProp || paidTier;

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ } }, [view]);

  const load = useCallback(async () => {
    setLoadError(null);
    const uid = await getCurrentUserId();
    setUserId(uid);
    // select('*') keeps the list working even if an optional column is missing (VIEW-027); offline (also after a
    // reload): the list last seen on this device, with the items saved offline on top
    const res = await loadWithDeviceCopy<any>('saved_items', () => fetchAllPages<any>((from, to) => {
      let q = supabase.from('saved_items').select('*').order('name', { ascending: true }).range(from, to);
      if (uid) q = q.eq('user_id', uid);
      return q;
    }));
    const withPending = (rows: Item[]) => withPendingRows(rows, pendingEntityItems('price_item'), null, 'price_item', (row, prev) => normalize({ ...(prev || {}), ...row }));
    let rows: any[] | null = res.error ? null : res.rows;
    if (!rows && res.fromDevice) {
      // never opened here online: the copy the app keeps for documents, or the items passed in
      const kept = uid ? (await dbApi.getAll('saved_items').catch(() => [] as any[])).filter((r) => r?.user_id === uid) : [];
      rows = kept.length ? kept : seed?.length ? seed : null;
    }
    if (rows) setItems(withPending(rows.map(normalize)));
    else setLoadError(friendlyError(res.error, 'Could not load your price book.'));
    setLoading(false);
    if (uid && !isPremiumProp && !res.fromDevice) {
      const { data } = await supabase.from('profiles').select('subscription_tier').eq('id', uid).maybeSingle();
      setPaidTier(isPaidTier(normalizeTier((data as any)?.subscription_tier)));
    }
  }, [isPremiumProp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const c = (i.category || '').trim() || 'General';
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((i) => {
      const cat = (i.category || '').trim() || 'General';
      if (category !== 'all' && cat !== category) return false;
      if (typeFilter === 'kit' && !i.is_assembly && i.type !== 'bundle') return false;
      if (typeFilter !== 'all' && typeFilter !== 'kit' && (i.is_assembly || (i.type || 'service') !== typeFilter)) return false;
      if (!q) return true;
      return [i.name, i.description, i.sku, i.category].some((v) => (v || '').toLowerCase().includes(q));
    });
    const byName = (a: Item, b: Item) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return list.sort((a, b) => {
      switch (sort) {
        case 'price-desc': return toNumber(b.rate) - toNumber(a.rate) || byName(a, b);
        case 'price-asc': return toNumber(a.rate) - toNumber(b.rate) || byName(a, b);
        case 'margin': return (marginFromPrice(b.unit_cost, b.rate) ?? -1e9) - (marginFromPrice(a.unit_cost, a.rate) ?? -1e9) || byName(a, b);
        case 'recent': return (b.created_at || '').localeCompare(a.created_at || '') || byName(a, b);
        default: return byName(a, b);
      }
    });
  }, [items, search, category, typeFilter, sort]);

  useEffect(() => { setPage(0); }, [search, category, typeFilter, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // ---------------------------------------------------------------- images
  const uploadImage = useCallback(async (file: File) => {
    let url: string;
    if (onUploadImage) url = await onUploadImage(file);
    else {
      const uid = userId ?? (await getCurrentUserId());
      if (!uid) throw new Error('Your session has expired. Please sign in again.');
      let toSend: File = file;
      try { toSend = await compressImage(file); } catch { /* upload the original */ }
      url = await uploadToOwnFolder(BUCKET, toSend, uid, file.name);
    }
    sessionUploads.current.push(url);
    return url;
  }, [onUploadImage, userId]);

  /** Deletes photos from storage unless another item still uses them (duplicates share files). */
  const removeImages = useCallback(async (urls: string[], keepFor: Item[]) => {
    const uid = userId ?? (await getCurrentUserId());
    if (!uid || !urls.length) return;
    const stillUsed = new Set(keepFor.flatMap((i) => (i.images || []) as string[]));
    const paths = urls.filter((u) => !stillUsed.has(u)).map((u) => ownStoragePath(u, BUCKET, uid)).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined);
  }, [userId]);

  const closeEditor = () => {
    // photos uploaded during a cancelled edit are orphans
    const orphanCandidates = sessionUploads.current;
    sessionUploads.current = [];
    removeImages(orphanCandidates, items);
    setEditorOpen(false);
    setEditing(null);
  };

  // ---------------------------------------------------------------- CRUD
  const saveItem = async (draft: PriceBookDraft) => {
    const uid = userId ?? (await getCurrentUserId());
    if (!uid) throw new Error('Your session has expired. Please sign in again.');
    const payload = {
      name: draft.name,
      description: draft.description || null,
      sku: draft.sku || null,
      category: draft.category || 'General',
      type: draft.type || 'service',
      unit: draft.unit || null,
      taxable: draft.taxable ?? true,
      rate: toNumber(draft.rate),
      unit_cost: toNumber(draft.unit_cost),
      markup: toNumber(draft.markup),
      images: (draft.images || []) as string[],
      is_assembly: !!draft.is_assembly,
      assembly_items: draft.is_assembly ? draft.assembly_items || [] : [],
    };
    const before = editing?.id ? items.find((i) => i.id === editing.id) : undefined;
    // offline (or an item still waiting to sync): kept on this device, synced when the connection is back
    const outbox = offlineEntityQueueFor(before?.id);
    if (outbox) {
      const id = before?.id || crypto.randomUUID();
      await outbox.queue('price_item', before ? 'edit' : 'create', id, before ? { ...payload } : { id, user_id: uid, ...payload });
      const saved = normalize({ ...(before || {}), ...payload, id, user_id: uid });
      setItems(before ? items.map((i) => (i.id === id ? saved : i)) : [...items, saved]);
      // product link / specs / preferred supplier need a connection (roadmap D4): say so instead of dropping them silently
      notify(draft.library ? 'info' : 'success', draft.library
        ? `Saved on this device. The product link, specs and supplier were not saved. ${NEEDS_CONNECTION}`
        : "Saved on this device. It syncs when you're back online.");
      setEditorOpen(false);
      setEditing(null);
      changed.current?.();
      return;
    }
    let result: { data: any; error: any; dropped: string[] };
    if (before) {
      result = await withSchemaFallback(payload, (p) => supabase.from('saved_items').update(p).eq('id', before.id).select('*').single());
    } else {
      const row = { id: crypto.randomUUID(), user_id: uid, ...payload };
      result = await withSchemaFallback(row, (p) => supabase.from('saved_items').insert(p).select('*').single());
    }
    if (result.error) throw result.error;
    let saved = normalize(result.data || { ...(before || {}), ...payload });
    // product link / specs / preferred supplier (roadmap D4): written after the item itself, only what the user changed
    let libraryError: string | null = null;
    if (draft.library) {
      try {
        await updatePriceBookLibraryFields(saved.id, draft.library);
        const f: Record<string, unknown> = {};
        if ('url' in draft.library) f.url = draft.library.url ?? '';
        if ('specs' in draft.library) f.specs = draft.library.specs ?? null;
        if ('supplierId' in draft.library) f.supplier_id = draft.library.supplierId ?? null;
        saved = { ...saved, ...f } as Item;
      } catch (e) {
        libraryError = friendlyError(e, 'The product link, specs and supplier could not be saved.');
      }
    }
    const nextItems = before ? items.map((i) => (i.id === saved.id ? saved : i)) : [...items, saved];
    setItems(nextItems);

    // storage cleanup: photos removed from this item and photos uploaded but not kept
    const finalImages = new Set(payload.images);
    const candidates = [...((before?.images || []) as string[]), ...sessionUploads.current].filter((u) => !finalImages.has(u));
    sessionUploads.current = [];
    removeImages(candidates, nextItems);

    const lost = result.dropped.filter((c) => ['images', 'assembly_items', 'is_assembly'].includes(c));
    if (libraryError) notify('info', `${before ? 'Item updated' : `"${saved.name}" added`}, but the product link, specs and supplier were not saved: ${libraryError}`);
    else notify(lost.length ? 'info' : 'success', lost.length ? 'Saved, but photos or kit components could not be stored yet. Please contact support.' : before ? 'Item updated.' : `"${saved.name}" added to your price book.`);
    setEditorOpen(false);
    setEditing(null);
    changed.current?.();
  };

  const duplicate = async (item: Item) => {
    const uid = userId ?? (await getCurrentUserId());
    if (!uid) return;
    const { id, created_at, updated_at, user_id, ...rest } = item as any;
    const row = { ...rest, id: crypto.randomUUID(), user_id: uid, name: `${item.name} (copy)`, use_count: 0, last_used_at: null };
    // offline: the copy waits on this device like a new item
    const outbox = offlineEntityQueueFor(item.id);
    if (outbox) {
      await outbox.queue('price_item', 'create', row.id, row);
      setItems((prev) => [...prev, normalize(row)]);
      notify('success', `Duplicated as "${row.name}". Saved on this device; it syncs when you're back online.`);
      changed.current?.();
      return;
    }
    const { data, error } = await withSchemaFallback(row, (p) => supabase.from('saved_items').insert(p).select('*').single());
    if (error) { notify('error', friendlyError(error, 'Could not duplicate the item.')); return; }
    setItems((prev) => [...prev, normalize(data || row)]);
    notify('success', `Duplicated as "${row.name}".`);
    changed.current?.();
  };

  /** Starter kits (roadmap N5): the chosen kits become ordinary price-book kits; a name already in the price book is skipped. */
  const laborRate = usableLaborRate(resolveLaborRate(defaultLaborRate));
  const importStarterKits = async (kitIds: string[]) => {
    const uid = userId ?? (await getCurrentUserId());
    if (!uid) throw new Error('Your session has expired. Please sign in again.');
    const plan = planStarterImport(kitIds, items.map((i) => i.name), { laborRate });
    if (!plan.rows.length) { notify('info', 'Those kits are already in your price book.'); setStarterOpen(false); return; }
    const created: Item[] = [];
    let failure: unknown = null;
    for (const r of plan.rows) {
      const row = { id: crypto.randomUUID(), user_id: uid, ...r };
      // offline: the kit waits on this device like any new item
      const outbox = offlineEntityQueueFor(undefined);
      if (outbox) { await outbox.queue('price_item', 'create', row.id, row); created.push(normalize(row)); continue; }
      const { data, error } = await withSchemaFallback(row, (p) => supabase.from('saved_items').insert(p).select('*').single());
      if (error) { failure = error; break; }
      created.push(normalize(data || row));
    }
    if (created.length) { setItems((prev) => [...prev, ...created]); changed.current?.(); }
    const skippedText = plan.skipped.length ? ` ${plan.skipped.length} already in your price book: skipped.` : '';
    if (failure) {
      notify('error', `${created.length ? `${created.length} kit${created.length === 1 ? '' : 's'} imported, then it stopped: ` : ''}${friendlyError(failure, 'Could not import the kits.')}`);
      if (!created.length) throw failure;
      return;
    }
    notify('success', `${created.length} starter kit${created.length === 1 ? '' : 's'} imported. These are starter prices: set your own.${skippedText}`);
    setStarterOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteFor) return;
    setDeleting(true);
    // an item only on this device (added offline) is removed here; others need a connection (a clear message offline)
    const local = await discardPendingCreate(deleteFor.id);
    const { error } = local ? { error: null } : await supabase.from('saved_items').delete().eq('id', deleteFor.id);
    setDeleting(false);
    if (error) { notify('error', friendlyError(error, 'Could not delete the item.')); return; }
    const remaining = items.filter((i) => i.id !== deleteFor.id);
    setItems(remaining);
    removeImages((deleteFor.images || []) as string[], remaining);
    notify('success', `"${deleteFor.name}" deleted.`);
    setDeleteFor(null);
    changed.current?.();
  };

  const openNew = (kit = false) => { sessionUploads.current = []; setEditing({ is_assembly: kit }); setEditorOpen(true); };
  const openEdit = (item: Item) => { sessionUploads.current = []; setEditing(item); setEditorOpen(true); };

  // AI assistant: open the Add dialog once, prefilled (never auto-saved).
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (prefillAppliedRef.current || !openAddModal) return;
    prefillAppliedRef.current = true;
    const p = prefillData && !Array.isArray(prefillData) ? prefillData : {};
    sessionUploads.current = [];
    setEditing({
      is_assembly: false,
      ...(typeof p.name === 'string' ? { name: p.name } : {}),
      ...(typeof p.description === 'string' ? { description: p.description } : {}),
      ...(typeof p.category === 'string' ? { category: p.category } : {}),
      ...(p.rate !== undefined ? { rate: toNumber(p.rate) } : {}),
      ...(p.unit_cost !== undefined ? { unit_cost: toNumber(p.unit_cost) } : {}),
    } as Partial<Item>);
    setEditorOpen(true);
  }, [openAddModal, prefillData]);

  const menu = (item: Item) => (
    <ActionMenu
      label={`Actions for ${item.name}`}
      items={[
        { label: 'Edit', icon: <EditIcon />, onSelect: () => openEdit(item) },
        { label: 'Duplicate', icon: <CopyIcon />, onSelect: () => duplicate(item) },
        { label: 'Delete', icon: <TrashIcon />, destructive: true, onSelect: () => setDeleteFor(item) },
      ]}
    />
  );

  const filtersActive = !!search || category !== 'all' || typeFilter !== 'all';
  const resetFilters = () => { setSearch(''); setCategory('all'); setTypeFilter('all'); };

  return (
    <div className="page">
      <PageHeader
        onBack={onBack}
        icon={<TagIcon className="h-7 w-7" />}
        title="Price book"
        subtitle={loading ? 'Loading your items…' : `${items.length} item${items.length === 1 ? '' : 's'} · ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
        actions={
          <>
            <HelpButton topic="pricebook" />
            <button type="button" className="btn btn-outline" onClick={() => setStarterOpen(true)}>Starter kits</button>
            <button type="button" className="btn btn-outline" onClick={() => openNew(true)}><LayersIcon className="h-4 w-4" /> New kit</button>
            <button type="button" className="btn btn-primary" onClick={() => openNew(false)}><PlusIcon className="h-4 w-4" /> New item</button>
          </>
        }
      />

      <div className="card mb-4 space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="input pl-9" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, description, SKU" aria-label="Search price book" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <select className="input sm:w-40" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} aria-label="Type">
              <option value="all">All types</option>
              <option value="service">Services</option>
              <option value="labor">Labor</option>
              <option value="material">Materials</option>
              <option value="kit">Kits &amp; bundles</option>
            </select>
            <select className="input sm:w-44" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              <option value="name">Name A–Z</option>
              <option value="price-desc">Price: high to low</option>
              <option value="price-asc">Price: low to high</option>
              <option value="margin">Best margin</option>
              <option value="recent">Recently added</option>
            </select>
            <div className="col-span-2 flex items-center justify-between gap-2 sm:block">
              <span className="text-sm text-muted-foreground sm:hidden">Layout</span>
              <Segmented<'grid' | 'list'> size="sm" ariaLabel="Layout" value={view} onChange={setView} options={[{ value: 'grid', label: <GridIcon className="h-4 w-4" />, title: 'Grid' }, { value: 'list', label: <RowsIcon className="h-4 w-4" />, title: 'List' }]} />
            </div>
          </div>
        </div>
        {categories.length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categories">
            {[['all', items.length] as [string, number], ...categories].map(([c, n]) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${category === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
              >
                {c === 'all' ? 'All' : c}<span className={`text-xs ${category === c ? 'opacity-80' : 'opacity-60'}`}>{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <InlineError onRetry={load}>{loadError}</InlineError>

      {loading && !items.length ? (
        <SkeletonGrid count={6} />
      ) : !items.length && !loadError ? (
        <EmptyState
          icon={<TagIcon />}
          title="Your price book is empty"
          description="Save the services, labor and materials you bill often, with your cost and markup, and add them to estimates and invoices in one tap."
          action={<button type="button" className="btn btn-primary" onClick={() => openNew(false)}><PlusIcon className="h-4 w-4" /> Add your first item</button>}
        />
      ) : !filtered.length ? (
        <EmptyState compact icon={<SearchIcon />} title="No items match" description="Try another search, category or type." action={filtersActive ? <button type="button" className="btn btn-outline" onClick={resetFilters}>Clear filters</button> : undefined} />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <article key={item.id} className="card group relative flex flex-col overflow-hidden transition hover:border-primary/40 hover:shadow-card">
              <button type="button" onClick={() => openEdit(item)} className="flex flex-1 flex-col text-left" aria-label={`Edit ${item.name}`}>
                <div className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-muted text-muted-foreground">
                  {item.images?.[0] ? <img src={item.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <TypeIcon item={item} className="h-8 w-8 opacity-60" />}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    {item.is_assembly ? <span className="badge badge-primary">Kit</span> : item.type === 'bundle' && <span className="badge badge-muted">Bundle</span>}
                    {item.taxable === false && <span className="badge badge-muted">Non-taxable</span>}
                  </div>
                  <h3 className="line-clamp-2 pr-8 font-semibold leading-snug text-foreground">{item.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{[(item.category || 'General'), item.sku].filter(Boolean).join(' · ')}</p>
                  {item.is_assembly && extraRowsSummary(item.assembly_items) && <p className="mt-0.5 truncate text-xs font-medium text-primary">{extraRowsSummary(item.assembly_items)}</p>}
                  <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                    <div>
                      <div className="text-lg font-bold tabular-nums text-foreground">{money(item.rate)}</div>
                      <div className="text-xs text-muted-foreground">per {item.unit || 'each'}{toNumber(item.unit_cost) > 0 ? ` · cost ${money(item.unit_cost)}` : ''}</div>
                    </div>
                    <MarginChip item={item} />
                  </div>
                </div>
              </button>
              <div className="absolute right-2 top-2 rounded-full bg-card/90 shadow-soft">{menu(item)}</div>
            </article>
          ))}
        </div>
      ) : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-clean">
              <thead>
                <tr><th>Item</th><th>Category</th><th className="text-right">Cost</th><th className="text-right">Price</th><th>Margin</th><th className="text-right"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/40">
                    <td className="max-w-[22rem]">
                      <button type="button" onClick={() => openEdit(item)} className="flex max-w-full items-center gap-3 text-left">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                          {item.images?.[0] ? <img src={item.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <TypeIcon item={item} className="h-5 w-5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground hover:text-primary">{item.name}{item.is_assembly && <span className="badge badge-primary ml-2 align-middle">Kit</span>}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.sku ? `${item.sku} · ` : ''}{item.description || (item.type ? item.type[0].toUpperCase() + item.type.slice(1) : '')}</span>
                        </span>
                      </button>
                    </td>
                    <td className="text-muted-foreground">{item.category || 'General'}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{toNumber(item.unit_cost) > 0 ? money(item.unit_cost) : '—'}</td>
                    <td className="text-right font-semibold tabular-nums">{money(item.rate)}<span className="text-xs font-normal text-muted-foreground"> /{item.unit || 'each'}</span></td>
                    <td><MarginChip item={item} /></td>
                    <td className="text-right">{menu(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {visible.map((item) => (
              <li key={item.id} className="card flex items-center gap-3 p-3">
                <button type="button" onClick={() => openEdit(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
                    {item.images?.[0] ? <img src={item.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <TypeIcon item={item} className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[(item.category || 'General'), item.sku].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="shrink-0 text-right font-semibold tabular-nums">{money(item.rate)}</span>
                </button>
                {menu(item)}
              </li>
            ))}
          </ul>
        </>
      )}

      {!loading && filtered.length > 0 && (
        <Pager page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} noun="items" />
      )}

      <PriceBookItemDetails
        isOpen={editorOpen}
        onClose={closeEditor}
        onSave={saveItem}
        item={editing as any}
        categories={Array.from(new Set(['General', 'Labor', 'Materials', 'Plumbing', 'Electrical', 'HVAC', ...categories.map(([c]) => c)])).sort()}
        allItems={items}
        onUploadImage={uploadImage}
        isPremium={isPremium}
        onUpgrade={onUpgrade}
        laborRate={laborRate}
      />

      <StarterKitsModal open={starterOpen} onClose={() => setStarterOpen(false)} existingNames={items.map((i) => i.name)} laborRate={laborRate} onImport={importStarterKits} />

      <ConfirmDialog
        open={!!deleteFor}
        title={`Delete "${deleteFor?.name ?? ''}"?`}
        message="It will no longer be available for new documents. Documents that already use it keep their line items. This cannot be undone."
        confirmLabel="Delete item"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteFor(null)}
      />

      <NoticeToast notice={notice} onClose={clear} />
    </div>
  );
};

export default PriceBookView;
