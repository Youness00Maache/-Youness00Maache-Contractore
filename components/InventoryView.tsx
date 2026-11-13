import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import type { AssemblyItem, Client, InventoryHistoryItem, InventoryItem, Job, UserProfile } from '../types.ts';
import { AlertTriangleIcon, BoxIcon, BriefcaseIcon, CameraIcon, ClockIcon, CopyIcon, EditIcon, MapPinIcon, PlusIcon, PrinterIcon, SearchIcon, TrashIcon, TruckIcon, UsersIcon } from './Icons.tsx';
import { isPlanLimitError, planLimitMessage } from '../lib/account.ts';
// The camera (html5-qrcode) and QR generator are only downloaded when the user opens them.
const PrintTagsModal = lazy(() => import('./PrintTagsModal.tsx'));
const QRScannerModal = lazy(() => import('./QRScannerModal.tsx'));
import {
  ActionMenu, ConfirmDialog, EmptyState, Field, InlineError, LayersIcon, Modal, NoticeToast, NumberInput, PageHeader, Pager,
  QrIcon, Segmented, SkeletonList, SlidersIcon, StatCard, XIcon, fetchAllPages, friendlyError, getCurrentUserId, money, timeAgo,
  useNotice, withSchemaFallback,
} from './viewKit.tsx';
import { checkoutMoves, kitBuildable, kitCost, lowStockThreshold, parseInventoryCode, stockStatus, stockValue, trackedComponents, type StockStatus } from '../utils/stockMath.ts';
import { todayYMD } from '../utils/localDates.ts';
import { toNumber } from '../utils/money.ts';

interface InventoryViewProps {
  onBack: () => void;
  /** Optional seed for the first paint; the view loads every row itself. */
  inventory?: InventoryItem[];
  /** @deprecated ignored: history is loaded on demand */
  history?: InventoryHistoryItem[];
  jobs?: Job[];
  userProfile?: UserProfile;
  /** @deprecated ignored: the view writes through lib/supabase.ts and RPC adjust_inventory */
  onUpdateItem?: (item: InventoryItem) => Promise<void>;
  /** @deprecated ignored */
  onAddItem?: (item: Omit<InventoryItem, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  /** @deprecated ignored */
  onDuplicateItem?: (item: InventoryItem) => Promise<void>;
  /** @deprecated ignored */
  onDeleteItem?: (id: string) => Promise<void>;
  /** @deprecated ignored: check-outs go through RPC */
  onAllocate?: (itemId: string, jobId: string | null, quantity: number, notes?: string) => Promise<void>;
  clients?: Client[];
  /**
   * Optional client creator (must enforce plan limits). Without it, "New client" in the check-out dialog
   * saves through the shared `insertClient` (ClientDetails.tsx); the database enforces the plan limit.
   */
  onAddClient?: (client: Partial<Client>) => Promise<Client | null>;
  /** Opens the upgrade modal (used when a new client hits the Free plan limit). */
  onUpgrade?: (reason?: string) => void;
  /** Called after a client is created here so the App can refresh its client list and usage. */
  onClientsChanged?: () => void;
  /** Creates a job (App handler, enforces plan limits). Used by "New job" in the check-out dialog. */
  onAddJob?: (job: Partial<Job>) => Promise<Job | null>;
  /** @deprecated ignored */
  onLoadMore?: () => Promise<void>;
  /** @deprecated ignored */
  hasMore?: boolean;
  /** @deprecated ignored */
  onLoadMoreHistory?: () => Promise<void>;
  /** @deprecated ignored */
  hasMoreHistory?: boolean;
  openAddModal?: boolean;
  prefillData?: any;
  /** Called after any change so the App can refresh its cached inventory (forms, dashboard badge). */
  onDataChanged?: () => void;
}

const COLUMNS = 'id,user_id,name,quantity,category,unit,cost_price,supplier,location,sku,low_stock_threshold,created_at,is_assembly,assembly_items';
/** Stock is numeric(14,3): fractional quantities (12.5 ft) are valid. */
const q3 = (n: unknown) => Math.round(toNumber(n) * 1000) / 1000;
const PAGE_SIZE = 25;
const UNIT_SUGGESTIONS = ['pcs', 'each', 'box', 'ft', 'm', 'roll', 'bag', 'gal', 'L', 'lb', 'kg', 'sheet', 'pair', 'set'];
const CATEGORY_SUGGESTIONS = ['Electrical', 'Plumbing', 'HVAC', 'Framing', 'Drywall', 'Paint', 'Hardware', 'Tools', 'Finish', 'Safety'];

type SortKey = 'name' | 'stock-asc' | 'stock-desc' | 'value' | 'recent';
type FilterKey = 'all' | 'attention' | 'kits';

interface HistoryRow {
  id: string;
  item_id: string | null;
  action: string;
  quantity_change: number;
  notes?: string | null;
  job_id?: string | null;
  created_at?: string | null;
  item_name?: string | null;
  quantity_after?: number | string | null;
}

interface JobOption { id: string; name: string; clientName?: string }

/** "New client" in the check-out dialog (the original app's quick client: name, phone, email, temporary). */
interface QuickClientInput { name: string; phone: string; email: string; temporary: boolean }
const EMPTY_QUICK_CLIENT: QuickClientInput = { name: '', phone: '', email: '', temporary: false };

interface Draft {
  name: string;
  category: string;
  unit: string;
  cost_price: number;
  supplier: string;
  sku: string;
  location: string;
  low_stock_threshold: number;
  is_assembly: boolean;
  assembly_items: AssemblyItem[];
  initialQty: number;
}

const emptyDraft = (): Draft => ({
  name: '', category: '', unit: 'pcs', cost_price: 0, supplier: '', sku: '', location: '', low_stock_threshold: 5, is_assembly: false, assembly_items: [], initialQty: 0,
});

const parseJsonArray = (v: unknown): any[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

const normalizeItem = (r: any): InventoryItem => ({
  ...r,
  name: String(r?.name ?? ''),
  quantity: toNumber(r?.quantity),
  cost_price: r?.cost_price === null || r?.cost_price === undefined ? 0 : toNumber(r.cost_price),
  is_assembly: !!r?.is_assembly,
  assembly_items: parseJsonArray(r?.assembly_items),
});

const isMissingRpc = (error: any) =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|function .* does not exist/i.test(error.message || ''));

const ACTION_LABELS: Record<string, string> = {
  add: 'Added', initial: 'Initial stock', restock: 'Restocked', update: 'Adjusted', adjust: 'Adjusted', adjustment: 'Adjusted',
  remove: 'Removed', job_allocation: 'Checked out', checkout: 'Checked out', deduct: 'Used on document', restore: 'Returned',
  oversold: 'Oversold', correction: 'Correction',
};
const actionLabel = (a: string) => ACTION_LABELS[a] || (a ? a.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Change');

const StatusBadge: React.FC<{ status: StockStatus; kit?: boolean }> = ({ status, kit }) => {
  if (kit) return status === 'out' ? <span className="badge badge-warning">Can't build</span> : <span className="badge badge-primary">Kit</span>;
  switch (status) {
    case 'oversold': return <span className="badge badge-danger">Oversold</span>;
    case 'out': return <span className="badge badge-danger">Out of stock</span>;
    case 'low': return <span className="badge badge-warning">Low stock</span>;
    default: return <span className="badge badge-success">In stock</span>;
  }
};

const StockStepper: React.FC<{ qty: number; unit?: string; onStep: (delta: number) => void; busy?: boolean; size?: 'md' | 'lg' }> = ({ qty, unit, onStep, busy, size = 'md' }) => (
  <div className={`inline-flex items-center rounded-xl border border-border bg-card ${busy ? 'opacity-80' : ''}`}>
    <button type="button" onClick={() => onStep(-1)} aria-label="Remove one" className={`flex items-center justify-center rounded-l-xl text-lg font-bold text-foreground transition hover:bg-muted active:bg-muted ${size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'}`}>−</button>
    <div className={`border-x border-border px-2 text-center ${size === 'lg' ? 'min-w-[5rem]' : 'min-w-[3.75rem]'}`}>
      <div className={`font-bold tabular-nums leading-tight ${qty < 0 ? 'text-destructive' : 'text-foreground'} ${size === 'lg' ? 'text-2xl' : 'text-base'}`}>{qty}</div>
      <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{unit || 'units'}</div>
    </div>
    <button type="button" onClick={() => onStep(1)} aria-label="Add one" className={`flex items-center justify-center rounded-r-xl text-lg font-bold text-primary transition hover:bg-primary/10 active:bg-primary/10 ${size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'}`}>+</button>
  </div>
);

const InventoryView: React.FC<InventoryViewProps> = ({ onBack, inventory: seed, jobs = [], clients = [], userProfile, onAddJob, onAddClient, onUpgrade, onClientsChanged, openAddModal, prefillData, onDataChanged }) => {
  const [items, setItems] = useState<InventoryItem[]>(() => (seed || []).map(normalizeItem));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(userProfile?.id ?? null);
  const { notice, notify, clear } = useNotice();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [page, setPage] = useState(0);

  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; id?: string; draft: Draft } | null>(null);
  const [savingEditor, setSavingEditor] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [adjustFor, setAdjustFor] = useState<InventoryItem | null>(null);
  const [checkoutFor, setCheckoutFor] = useState<InventoryItem | null>(null);
  const [historyFor, setHistoryFor] = useState<{ itemId: string | null } | null>(null);
  const [printItems, setPrintItems] = useState<InventoryItem[] | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [deleteFor, setDeleteFor] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const changed = useRef(onDataChanged);
  changed.current = onDataChanged;
  const notifyChanged = useCallback(() => changed.current?.(), []);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // ------------------------------------------------------------------ loading
  const load = useCallback(async () => {
    setLoadError(null);
    const uid = userId ?? (await getCurrentUserId());
    if (uid && uid !== userId) setUserId(uid);
    const run = (cols: string) =>
      fetchAllPages<any>((from, to) => {
        let q = supabase.from('inventory').select(cols).order('name', { ascending: true }).range(from, to);
        if (uid) q = q.eq('user_id', uid);
        return q;
      });
    let res = await run(COLUMNS);
    if (res.error && (res.error.code === '42703' || /does not exist/i.test(res.error.message || ''))) res = await run('*');
    if (res.error) setLoadError(friendlyError(res.error, 'Could not load your inventory.'));
    else setItems(res.rows.map(normalizeItem));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mergeRow = useCallback((row: any) => {
    if (!row?.id) return;
    const n = normalizeItem(row);
    setItems((prev) => (prev.some((i) => i.id === n.id) ? prev.map((i) => (i.id === n.id ? { ...i, ...n } : i)) : [...prev, n]));
  }, []);

  const refreshRows = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { data } = await supabase.from('inventory').select(COLUMNS).in('id', ids);
    (data || []).forEach(mergeRow);
  }, [mergeRow]);

  const findItem = useCallback(async (id: string): Promise<InventoryItem | null> => {
    const local = byId.get(id);
    if (local) return local;
    const { data } = await supabase.from('inventory').select(COLUMNS).eq('id', id).maybeSingle();
    if (data) { mergeRow(data); return normalizeItem(data); }
    return null;
  }, [byId, mergeRow]);

  // ------------------------------------------------------------------ stock changes (RPC only)
  const adjustStock = useCallback(async (itemId: string, delta: number, reason: string, jobId?: string | null) => {
    if (!delta) return;
    const { data, error } = await supabase.rpc('adjust_inventory', { p_item_id: itemId, p_delta: delta, p_reason: reason, p_job_id: jobId ?? null });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === 'object' && (row as any).id) mergeRow(row);
    else await refreshRows([itemId]);
  }, [mergeRow, refreshRows]);

  // Quick ± buttons: taps are batched per item (one RPC + one history row per burst) and serialized,
  // so fast taps never lose updates and the display = server value + not-yet-confirmed taps.
  const [pending, setPending] = useState<Record<string, number>>({});
  const unsent = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, number>());
  const chains = useRef(new Map<string, Promise<void>>());

  const flush = useCallback((itemId: string) => {
    window.clearTimeout(timers.current.get(itemId));
    timers.current.delete(itemId);
    const delta = unsent.current.get(itemId) || 0;
    unsent.current.delete(itemId);
    if (!delta) return;
    const prev = chains.current.get(itemId) || Promise.resolve();
    const next = prev.then(async () => {
      try {
        await adjustStock(itemId, delta, delta > 0 ? 'Manual restock' : 'Manual adjustment');
        notifyChanged();
      } catch (e) {
        notify('error', friendlyError(e, 'Could not update stock.'));
      } finally {
        setPending((p) => ({ ...p, [itemId]: (p[itemId] || 0) - delta }));
      }
    });
    chains.current.set(itemId, next);
  }, [adjustStock, notify, notifyChanged]);

  const quickStep = useCallback((itemId: string, delta: number) => {
    setPending((p) => ({ ...p, [itemId]: (p[itemId] || 0) + delta }));
    unsent.current.set(itemId, (unsent.current.get(itemId) || 0) + delta);
    window.clearTimeout(timers.current.get(itemId));
    timers.current.set(itemId, window.setTimeout(() => flush(itemId), 600));
  }, [flush]);

  useEffect(() => () => {
    // send any batched taps when leaving the screen
    Array.from(unsent.current.keys()).forEach((id) => flush(id));
  }, [flush]);

  const displayQty = (item: InventoryItem) => toNumber(item.quantity) + (pending[item.id] || 0);

  // ------------------------------------------------------------------ derived lists
  const effectiveStatus = useCallback((item: InventoryItem): StockStatus => {
    if (item.is_assembly) return kitBuildable(item, byId) === 0 ? 'out' : 'ok';
    return stockStatus({ quantity: displayQty(item), low_stock_threshold: item.low_stock_threshold });
  }, [byId, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => (i.category || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const stats = useMemo(() => {
    let value = 0, attention = 0, kits = 0;
    for (const i of items) {
      if (i.is_assembly) { kits++; continue; }
      value += stockValue(i);
      if (stockStatus(i) !== 'ok') attention++;
    }
    return { count: items.length, value, attention, kits };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((i) => {
      if (category !== 'all' && (i.category || '').trim() !== category) return false;
      if (filter === 'kits' && !i.is_assembly) return false;
      if (filter === 'attention' && (i.is_assembly || effectiveStatus(i) === 'ok')) return false;
      if (!q) return true;
      return [i.name, i.category, i.supplier, i.location, (i as any).sku].some((v) => (v || '').toLowerCase().includes(q));
    });
    const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return list.sort((a, b) => {
      switch (sort) {
        case 'stock-asc': return displayQty(a) - displayQty(b) || byName(a, b);
        case 'stock-desc': return displayQty(b) - displayQty(a) || byName(a, b);
        case 'value': return stockValue(b) - stockValue(a) || byName(a, b);
        case 'recent': return (b.created_at || '').localeCompare(a.created_at || '') || byName(a, b);
        default: return byName(a, b);
      }
    });
  }, [items, search, category, filter, sort, effectiveStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [search, category, filter, sort]);

  // ------------------------------------------------------------------ create / edit / duplicate / delete
  const createItem = useCallback(async (draft: Draft): Promise<InventoryItem> => {
    const uid = userId ?? (await getCurrentUserId());
    if (!uid) throw new Error('Your session has expired. Please sign in again.');
    const row = {
      id: crypto.randomUUID(),
      user_id: uid,
      name: draft.name.trim(),
      // An opening quantity on insert is logged by the database as "Initial stock" (one atomic write).
      quantity: draft.is_assembly ? 0 : Math.max(0, q3(draft.initialQty)),
      category: draft.is_assembly ? null : draft.category.trim() || null,
      unit: draft.unit.trim() || null,
      cost_price: draft.is_assembly ? 0 : Math.max(0, toNumber(draft.cost_price)),
      supplier: draft.is_assembly ? null : draft.supplier.trim() || null,
      sku: draft.sku.trim().toUpperCase() || null,
      location: draft.location.trim() || null,
      low_stock_threshold: Math.max(0, q3(draft.low_stock_threshold)),
      is_assembly: draft.is_assembly,
      assembly_items: draft.is_assembly ? draft.assembly_items : [],
    };
    const { data, error } = await withSchemaFallback(row, (p) => supabase.from('inventory').insert(p).select(COLUMNS).single());
    if (error) throw error;
    const created = normalizeItem(data || row);
    setItems((prev) => [...prev, created]);
    return created;
  }, [userId]);

  const saveEditor = async () => {
    if (!editor) return;
    const d = editor.draft;
    if (!d.name.trim()) { setEditorError('Give the item a name.'); return; }
    if (d.is_assembly && !trackedComponents(d).length) { setEditorError('Add at least one stocked component to the kit.'); return; }
    setSavingEditor(true);
    setEditorError(null);
    try {
      if (editor.mode === 'add') {
        const created = await createItem(d);
        notify('success', `"${created.name}" added to inventory.`);
      } else if (editor.id) {
        const patch = {
          name: d.name.trim(),
          category: d.is_assembly ? null : d.category.trim() || null,
          unit: d.unit.trim() || null,
          cost_price: d.is_assembly ? 0 : Math.max(0, toNumber(d.cost_price)),
          supplier: d.is_assembly ? null : d.supplier.trim() || null,
          sku: d.sku.trim().toUpperCase() || null,
          location: d.location.trim() || null,
          low_stock_threshold: Math.max(0, q3(d.low_stock_threshold)),
          assembly_items: d.is_assembly ? d.assembly_items : [],
        };
        const { data, error } = await withSchemaFallback(patch, (p) => supabase.from('inventory').update(p).eq('id', editor.id!).select(COLUMNS).single());
        if (error) throw error;
        mergeRow(data || { ...byId.get(editor.id), ...patch });
        notify('success', 'Item updated.');
      }
      notifyChanged();
      setEditor(null);
    } catch (e) {
      setEditorError(friendlyError(e, 'Could not save the item.'));
    } finally {
      setSavingEditor(false);
    }
  };

  const openEdit = (item: InventoryItem) => {
    setEditorError(null);
    setEditor({
      mode: 'edit',
      id: item.id,
      draft: {
        name: item.name || '', category: item.category || '', unit: item.unit || '', cost_price: toNumber(item.cost_price),
        supplier: item.supplier || '', sku: (item as any).sku || '', location: item.location || '', low_stock_threshold: lowStockThreshold(item),
        is_assembly: !!item.is_assembly, assembly_items: (item.assembly_items || []).map((c) => ({ ...c })), initialQty: 0,
      },
    });
  };

  const openAdd = (draft?: Partial<Draft>) => {
    setEditorError(null);
    setEditor({ mode: 'add', draft: { ...emptyDraft(), ...draft } });
  };

  const duplicate = async (item: InventoryItem) => {
    try {
      // Like the original app, the copy keeps the stock on hand (logged as "Initial stock"). Kits hold no stock.
      const created = await createItem({
        name: `${item.name} (copy)`, category: item.category || '', unit: item.unit || '', cost_price: toNumber(item.cost_price),
        supplier: item.supplier || '', sku: '', location: item.location || '', low_stock_threshold: lowStockThreshold(item),
        is_assembly: !!item.is_assembly, assembly_items: item.assembly_items || [], initialQty: item.is_assembly ? 0 : Math.max(0, displayQty(item)),
      });
      notify('success', created.is_assembly ? `Duplicated as "${created.name}".` : `Duplicated as "${created.name}" with ${toNumber(created.quantity)} ${created.unit || 'in stock'}.`);
      notifyChanged();
    } catch (e) {
      notify('error', friendlyError(e, 'Could not duplicate the item.'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteFor) return;
    setDeleting(true);
    const { error } = await supabase.from('inventory').delete().eq('id', deleteFor.id);
    setDeleting(false);
    if (error) { notify('error', friendlyError(error, 'Could not delete the item.')); return; }
    setItems((prev) => prev.filter((i) => i.id !== deleteFor.id));
    if (sheetId === deleteFor.id) setSheetId(null);
    notify('success', `"${deleteFor.name}" deleted.`);
    setDeleteFor(null);
    notifyChanged();
  };

  // ------------------------------------------------------------------ AI prefill / add modal / deep link
  const processedPrefill = useRef<string | null>(null);
  useEffect(() => {
    if (prefillData) {
      const key = JSON.stringify(prefillData);
      if (processedPrefill.current === key) return;
      processedPrefill.current = key;
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch { /* ignore */ }
      const toDraft = (data: any): Draft => ({
        ...emptyDraft(),
        name: String(data.prefillItemName || data.itemName || data.name || data.item_name || ''),
        category: String(data.category || data.itemCategory || ''),
        unit: String(data.unit || 'pcs'),
        cost_price: toNumber(data.cost ?? data.price ?? data.unit_price ?? data.cost_price),
        supplier: String(data.supplier || data.vendor || ''),
        location: String(data.location || ''),
        low_stock_threshold: data.low_stock_threshold ?? data.alert_threshold ?? 5,
        initialQty: Math.max(0, q3(data.quantity ?? data.qty ?? data.amount)),
        is_assembly: false,
      });
      (async () => {
        if (Array.isArray(prefillData)) {
          let ok = 0;
          for (const entry of prefillData) {
            const d = toDraft(entry || {});
            if (!d.name.trim()) continue;
            try { await createItem(d); ok++; } catch (e) { notify('error', friendlyError(e, `Could not add "${d.name}".`)); }
          }
          if (ok) { notify('success', `${ok} item${ok === 1 ? '' : 's'} added to inventory.`); notifyChanged(); }
        } else {
          const d = toDraft(prefillData);
          if (prefillData.auto_submit && d.name.trim()) {
            try { await createItem(d); notify('success', `"${d.name}" added to inventory.`); notifyChanged(); } catch (e) { notify('error', friendlyError(e)); }
          } else openAdd(d);
        }
      })();
    } else if (openAddModal) {
      openAdd();
    }
  }, [openAddModal, prefillData]); // eslint-disable-line react-hooks/exhaustive-deps

  // /inventory?item=<id> (printed QR labels open the item)
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || loading) return;
    const id = parseInventoryCode(window.location.search);
    if (!id) return;
    deepLinkDone.current = true;
    try { window.history.replaceState(window.history.state, document.title, window.location.pathname); } catch { /* ignore */ }
    findItem(id).then((it) => (it ? setSheetId(it.id) : notify('error', 'That item no longer exists.')));
  }, [loading, findItem, notify]);

  const handleScan = async (text: string) => {
    setScanOpen(false);
    const id = parseInventoryCode(text);
    const item = id ? await findItem(id) : null;
    if (item) setSheetId(item.id);
    else notify('error', 'No inventory item matches that code.');
  };

  // ------------------------------------------------------------------ quick client (check-out dialog)
  // Same save path as the Clients screen (insertClient, loaded on demand); the database enforces the plan limit.
  const createClient = useCallback(async (input: QuickClientInput): Promise<Client> => {
    const { insertClient, validateClientDraft, TEMP_TAG } = await import('./ClientDetails.tsx');
    const draft = { name: input.name, email: input.email, phone: input.phone, address: '', notes: input.temporary ? TEMP_TAG : '' };
    const invalid = validateClientDraft(draft);
    if (invalid.name || invalid.email || invalid.phone) throw new Error(invalid.name || invalid.email || invalid.phone);
    try {
      let created: Client | null;
      if (onAddClient) {
        created = await onAddClient(draft);
        if (!created?.id) throw new Error('The client could not be created.');
      } else {
        const uid = userId ?? (await getCurrentUserId());
        if (!uid) throw new Error('Your session has expired. Please sign in again.');
        created = await insertClient(draft, uid);
      }
      onClientsChanged?.();
      return created;
    } catch (e) {
      if (isPlanLimitError(e)) onUpgrade?.(planLimitMessage(e));
      throw e;
    }
  }, [onAddClient, onClientsChanged, onUpgrade, userId]);

  const sheetItem = sheetId ? byId.get(sheetId) ?? null : null;

  // ------------------------------------------------------------------ render helpers
  const metaLine = (item: InventoryItem) => [(item as any).sku, item.category, item.location, item.supplier].filter(Boolean).join(' · ');

  const rowMenu = (item: InventoryItem) => (
    <ActionMenu
      label={`Actions for ${item.name}`}
      items={[
        { label: 'Edit details', icon: <EditIcon />, onSelect: () => openEdit(item) },
        { label: 'Adjust stock', icon: <SlidersIcon />, onSelect: () => setAdjustFor(item), hidden: !!item.is_assembly },
        { label: 'Stock history', icon: <ClockIcon />, onSelect: () => setHistoryFor({ itemId: item.id }) },
        { label: 'Print labels', icon: <PrinterIcon />, onSelect: () => setPrintItems([item]) },
        { label: 'Duplicate', icon: <CopyIcon />, onSelect: () => duplicate(item) },
        { label: 'Delete', icon: <TrashIcon />, destructive: true, onSelect: () => setDeleteFor(item) },
      ]}
    />
  );

  const stockCell = (item: InventoryItem) =>
    item.is_assembly ? (
      <div className="text-sm">
        <div className="font-semibold text-foreground">{kitBuildable(item, byId) ?? 0} buildable</div>
        <div className="text-xs text-muted-foreground">{trackedComponents(item).length} components</div>
      </div>
    ) : (
      <StockStepper qty={displayQty(item)} unit={item.unit} onStep={(d) => quickStep(item.id, d)} busy={!!pending[item.id]} />
    );

  return (
    <div className="page">
      <PageHeader
        onBack={onBack}
        icon={<BoxIcon className="h-7 w-7" />}
        title="Inventory"
        subtitle={loading ? 'Loading your stock…' : `${stats.count} item${stats.count === 1 ? '' : 's'} · stock value ${money(stats.value)}`}
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setScanOpen(true)}><CameraIcon className="h-4 w-4" /> Scan</button>
            <button type="button" className="btn btn-outline" onClick={() => setHistoryFor({ itemId: null })}><ClockIcon className="h-4 w-4" /> History</button>
            <button type="button" className="btn btn-outline hidden sm:inline-flex" onClick={() => filtered.length ? setPrintItems(filtered.slice(0, 300)) : notify('info', 'No items to print.')} disabled={loading}><QrIcon className="h-4 w-4" /> Labels</button>
            <button type="button" className="btn btn-primary" onClick={() => openAdd()}><PlusIcon className="h-4 w-4" /> Add item</button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items" value={loading ? '—' : stats.count} icon={<BoxIcon />} tone="primary" onClick={() => setFilter('all')} active={filter === 'all'} />
        <StatCard label="Stock value" value={loading ? '—' : money(stats.value)} hint="At cost price" icon={<TruckIcon />} />
        <StatCard label="Needs attention" value={loading ? '—' : stats.attention} hint="Low, out or oversold" icon={<AlertTriangleIcon />} tone={stats.attention ? 'warning' : 'default'} onClick={() => setFilter(filter === 'attention' ? 'all' : 'attention')} active={filter === 'attention'} />
        <StatCard label="Kits" value={loading ? '—' : stats.kits} hint="Built from components" icon={<LayersIcon />} onClick={() => setFilter(filter === 'kits' ? 'all' : 'kits')} active={filter === 'kits'} />
      </div>

      <div className="card mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="input pl-9" type="search" placeholder="Search name, SKU, category, supplier, location" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search inventory" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <select className="input sm:w-44" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="input sm:w-44" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              <option value="name">Name A–Z</option>
              <option value="stock-asc">Lowest stock</option>
              <option value="stock-desc">Highest stock</option>
              <option value="value">Highest value</option>
              <option value="recent">Recently added</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Segmented<FilterKey>
            size="sm"
            ariaLabel="Filter"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all', label: 'All' }, { value: 'attention', label: `Needs attention${stats.attention ? ` (${stats.attention})` : ''}` }, { value: 'kits', label: 'Kits' }]}
          />
          {(search || category !== 'all' || filter !== 'all') && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setCategory('all'); setFilter('all'); }}>Clear</button>
          )}
        </div>
      </div>

      <InlineError onRetry={load}>{loadError}</InlineError>

      {loading && !items.length ? (
        <SkeletonList rows={6} />
      ) : !items.length && !loadError ? (
        <EmptyState
          icon={<BoxIcon />}
          title="No inventory yet"
          description="Track materials, tools and parts. Stock goes down automatically when you check items out to a job."
          action={<button type="button" className="btn btn-primary" onClick={() => openAdd()}><PlusIcon className="h-4 w-4" /> Add your first item</button>}
        />
      ) : !filtered.length ? (
        <EmptyState compact icon={<SearchIcon />} title="No items match" description="Try a different search or clear the filters." action={<button type="button" className="btn btn-outline" onClick={() => { setSearch(''); setCategory('all'); setFilter('all'); }}>Clear filters</button>} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Stock</th>
                  <th className="text-right">Unit cost</th>
                  <th className="text-right">Value</th>
                  <th>Status</th>
                  <th className="text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const status = effectiveStatus(item);
                  const cost = item.is_assembly ? kitCost(item, byId) : toNumber(item.cost_price);
                  return (
                    <tr key={item.id} className="hover:bg-muted/40">
                      <td className="max-w-[18rem]">
                        <button type="button" onClick={() => setSheetId(item.id)} className="block max-w-full text-left">
                          <span className="flex items-center gap-2 font-semibold text-foreground hover:text-primary">
                            {item.is_assembly && <LayersIcon className="h-4 w-4 shrink-0 text-primary" />}
                            <span className="truncate">{item.name}</span>
                          </span>
                          {metaLine(item) && <span className="block truncate text-xs text-muted-foreground">{metaLine(item)}</span>}
                        </button>
                      </td>
                      <td>{stockCell(item)}</td>
                      <td className="text-right tabular-nums">{money(cost)}{item.unit && !item.is_assembly ? <span className="text-xs text-muted-foreground"> /{item.unit}</span> : null}</td>
                      <td className="text-right font-semibold tabular-nums">{item.is_assembly ? '—' : money(stockValue({ ...item, quantity: displayQty(item) }))}</td>
                      <td><StatusBadge status={status} kit={item.is_assembly} /></td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" className="btn btn-outline btn-sm h-9" onClick={() => setCheckoutFor(item)}><BriefcaseIcon className="h-3.5 w-3.5" /> Check out</button>
                          {rowMenu(item)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {visible.map((item) => {
              const status = effectiveStatus(item);
              return (
                <div key={item.id} className={`card p-4 ${status === 'out' || status === 'oversold' ? 'border-destructive/30' : status === 'low' ? 'border-warning/40' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setSheetId(item.id)} className="min-w-0 flex-1 text-left">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5"><StatusBadge status={status} kit={item.is_assembly} />{item.category && <span className="badge badge-muted">{item.category}</span>}</div>
                      <div className="truncate font-semibold text-foreground">{item.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.is_assembly ? `${trackedComponents(item).length} components · cost ${money(kitCost(item, byId))}` : `${money(item.cost_price)}${item.unit ? ` / ${item.unit}` : ''} · value ${money(stockValue({ ...item, quantity: displayQty(item) }))}`}
                      </div>
                      {item.location && <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPinIcon className="h-3 w-3 shrink-0" />{item.location}</div>}
                    </button>
                    {rowMenu(item)}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    {stockCell(item)}
                    <button type="button" className="btn btn-primary h-10 px-3" onClick={() => setCheckoutFor(item)}><BriefcaseIcon className="h-4 w-4" /> Check out</button>
                  </div>
                </div>
              );
            })}
          </div>

          <Pager page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} noun="items" />
        </>
      )}

      {/* ---------------------------------------------------------------- Item sheet */}
      <Modal
        open={!!sheetItem}
        onClose={() => setSheetId(null)}
        size="md"
        title={sheetItem?.name}
        description={sheetItem ? (metaLine(sheetItem) || (sheetItem.is_assembly ? 'Kit' : 'Inventory item')) : undefined}
        footer={sheetItem && (
          <>
            <button type="button" className="btn btn-outline" onClick={() => { const it = sheetItem; setSheetId(null); openEdit(it); }}><EditIcon className="h-4 w-4" /> Edit</button>
            {!sheetItem.is_assembly && <button type="button" className="btn btn-outline" onClick={() => setAdjustFor(sheetItem)}><SlidersIcon className="h-4 w-4" /> Adjust</button>}
            <button type="button" className="btn btn-primary" onClick={() => setCheckoutFor(sheetItem)}><BriefcaseIcon className="h-4 w-4" /> Check out</button>
          </>
        )}
      >
        {sheetItem && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={effectiveStatus(sheetItem)} kit={sheetItem.is_assembly} />{sheetItem.category && <span className="badge badge-muted">{sheetItem.category}</span>}</div>
            {sheetItem.is_assembly ? (
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Kits you can build now</span>
                  <span className="text-2xl font-bold tabular-nums">{kitBuildable(sheetItem, byId) ?? 0}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-sm"><span className="text-muted-foreground">Cost per kit</span><span className="font-semibold">{money(kitCost(sheetItem, byId))}</span></div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4 sm:flex-row sm:justify-between">
                <StockStepper size="lg" qty={displayQty(sheetItem)} unit={sheetItem.unit} onStep={(d) => quickStep(sheetItem.id, d)} busy={!!pending[sheetItem.id]} />
                <div className="grid w-full grid-cols-2 gap-3 text-sm sm:w-auto sm:text-right">
                  <div><div className="text-xs text-muted-foreground">Unit cost</div><div className="font-semibold">{money(sheetItem.cost_price)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Value</div><div className="font-semibold">{money(stockValue({ ...sheetItem, quantity: displayQty(sheetItem) }))}</div></div>
                  <div><div className="text-xs text-muted-foreground">Low-stock alert at</div><div className="font-semibold">{lowStockThreshold(sheetItem)}</div></div>
                </div>
              </div>
            )}
            {sheetItem.is_assembly && (
              <div>
                <h3 className="label">Components per kit</h3>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {(sheetItem.assembly_items || []).map((c, idx) => {
                    const comp = c.is_custom ? null : byId.get(c.item_id);
                    return (
                      <li key={`${c.item_id}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.is_custom ? c.custom_name || 'Custom part' : comp?.name || 'Deleted item'}</div>
                          <div className="text-xs text-muted-foreground">{c.is_custom ? 'Not tracked in stock' : comp ? `${toNumber(comp.quantity)} in stock` : 'No longer in inventory'}</div>
                        </div>
                        <span className="badge badge-muted shrink-0">× {toNumber(c.quantity)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setHistoryFor({ itemId: sheetItem.id })}><ClockIcon className="h-4 w-4" /> History</button>
              <button type="button" className="btn btn-outline" onClick={() => setPrintItems([sheetItem])}><PrinterIcon className="h-4 w-4" /> Labels</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------------------------------------------------------- Add / edit */}
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        busy={savingEditor}
        size="lg"
        title={editor?.mode === 'edit' ? 'Edit item' : editor?.draft.is_assembly ? 'New kit' : 'Add inventory item'}
        description={editor?.mode === 'edit' ? 'Stock levels are changed with Adjust stock or Check out, so every change is logged.' : undefined}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setEditor(null)} disabled={savingEditor}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveEditor} disabled={savingEditor || !editor?.draft.name.trim()}>{savingEditor ? 'Saving…' : editor?.mode === 'edit' ? 'Save changes' : 'Add item'}</button>
          </>
        }
      >
        {editor && (
          <ItemEditor
            draft={editor.draft}
            mode={editor.mode}
            onChange={(draft) => setEditor((e) => (e ? { ...e, draft } : e))}
            items={items}
            editingId={editor.id}
            categories={categories}
            error={editorError}
          />
        )}
      </Modal>

      {adjustFor && (
        <AdjustStockModal
          item={byId.get(adjustFor.id) ?? adjustFor}
          currentQty={displayQty(byId.get(adjustFor.id) ?? adjustFor)}
          onClose={() => setAdjustFor(null)}
          onSubmit={async (delta, reason) => {
            await adjustStock(adjustFor.id, delta, reason);
            notify('success', `Stock ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)}.`);
            notifyChanged();
            setAdjustFor(null);
          }}
        />
      )}

      {checkoutFor && (
        <CheckoutModal
          item={byId.get(checkoutFor.id) ?? checkoutFor}
          available={checkoutFor.is_assembly ? kitBuildable(byId.get(checkoutFor.id) ?? checkoutFor, byId) ?? 0 : displayQty(byId.get(checkoutFor.id) ?? checkoutFor)}
          byId={byId}
          propJobs={jobs}
          clients={clients}
          onAddJob={onAddJob}
          onCreateClient={createClient}
          userId={userId}
          onClose={() => setCheckoutFor(null)}
          onSubmit={async (qty, jobId, note, jobName, clientName) => {
            const item = byId.get(checkoutFor.id) ?? checkoutFor;
            // A job check-out is linked by job_id; a client-only check-out keeps the client's name in the logged reason.
            const reason = clientName && !jobId
              ? (note.trim() ? `${note.trim()} (Checked out to ${clientName})` : `Checked out to ${clientName}`)
              : note.trim() || (jobName ? `Checked out to ${jobName}` : 'Checked out');
            const target = jobId ? jobName : clientName;
            const moves = checkoutMoves(item, qty);
            const { error } = await supabase.rpc('checkout_inventory', { p_item_id: item.id, p_qty: qty, p_job_id: jobId, p_reason: reason });
            if (!error) {
              await refreshRows(moves.map((m) => m.itemId).concat(item.id));
            } else if (isMissingRpc(error)) {
              const done: { itemId: string; delta: number }[] = [];
              try {
                for (const m of moves) {
                  await adjustStock(m.itemId, m.delta, item.is_assembly ? `${reason} (kit: ${item.name})` : reason, jobId);
                  done.push(m);
                }
              } catch (e) {
                for (const m of done.reverse()) {
                  try { await adjustStock(m.itemId, -m.delta, `Reversal of failed check-out (${item.name})`, jobId); } catch { /* best effort */ }
                }
                throw e;
              }
            } else throw error;
            notify('success', `Checked out ${qty} × ${item.name}${target ? ` to ${target}` : ''}.`);
            notifyChanged();
            setCheckoutFor(null);
          }}
        />
      )}

      {historyFor && (
        <HistoryModal itemId={historyFor.itemId} byId={byId} onClose={() => setHistoryFor(null)} />
      )}

      {printItems && (
        <Suspense fallback={null}>
          <PrintTagsModal isOpen onClose={() => setPrintItems(null)} item={printItems[0]} items={printItems} userProfile={userProfile} />
        </Suspense>
      )}

      {scanOpen && (
        <Suspense fallback={null}>
          <QRScannerModal isOpen onClose={() => setScanOpen(false)} onScanSuccess={handleScan} />
        </Suspense>
      )}

      <ConfirmDialog
        open={!!deleteFor}
        title={`Delete "${deleteFor?.name ?? ''}"?`}
        message={<>This removes the item from your inventory. Documents that already used it keep their line items. This cannot be undone.</>}
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

// ======================================================================================================
// Editor form
// ======================================================================================================

const ItemEditor: React.FC<{
  draft: Draft;
  mode: 'add' | 'edit';
  onChange: (d: Draft) => void;
  items: InventoryItem[];
  editingId?: string;
  categories: string[];
  error: string | null;
}> = ({ draft, mode, onChange, items, editingId, categories, error }) => {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  const [pick, setPick] = useState('');
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const stockItems = useMemo(() => items.filter((i) => !i.is_assembly && i.id !== editingId).sort((a, b) => a.name.localeCompare(b.name)), [items, editingId]);
  const duplicateName = useMemo(() => {
    const n = draft.name.trim().toLowerCase();
    return n ? items.find((i) => i.id !== editingId && i.name.trim().toLowerCase() === n) : undefined;
  }, [draft.name, items, editingId]);
  const kitPreview = { id: 'preview', is_assembly: true, assembly_items: draft.assembly_items };

  const addComponent = (id: string) => {
    if (!id) return;
    const existing = draft.assembly_items.find((c) => c.item_id === id && !c.is_custom);
    set('assembly_items', existing
      ? draft.assembly_items.map((c) => (c === existing ? { ...c, quantity: toNumber(c.quantity) + 1 } : c))
      : [...draft.assembly_items, { item_id: id, quantity: 1, is_custom: false }]);
    setPick('');
  };

  return (
    <div className="space-y-4">
      {error && <InlineError>{error}</InlineError>}
      {mode === 'add' && (
        <Segmented<'item' | 'kit'>
          ariaLabel="Item type"
          value={draft.is_assembly ? 'kit' : 'item'}
          onChange={(v) => set('is_assembly', v === 'kit')}
          options={[{ value: 'item', label: 'Stock item' }, { value: 'kit', label: 'Kit (bundle of items)' }]}
        />
      )}
      <Field label="Name *" htmlFor="inv-name" error={duplicateName ? `"${duplicateName.name}" already exists. You can still save.` : undefined}>
        <input id="inv-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder={draft.is_assembly ? 'e.g. Bathroom rough-in kit' : 'e.g. Copper pipe ½"'} autoFocus maxLength={160} />
      </Field>

      {!draft.is_assembly && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="inv-cat">
            <input id="inv-cat" className="input" list="inv-categories" value={draft.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Plumbing" />
            <datalist id="inv-categories">{Array.from(new Set([...categories, ...CATEGORY_SUGGESTIONS])).map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="SKU / part no." htmlFor="inv-sku">
            <input id="inv-sku" className="input uppercase" value={draft.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="e.g. CU-050" maxLength={40} />
          </Field>
          <Field label="Supplier" htmlFor="inv-sup">
            <input id="inv-sup" className="input" value={draft.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="e.g. Home Depot" />
          </Field>
          <Field label="Unit cost ($)" htmlFor="inv-cost">
            <NumberInput id="inv-cost" value={draft.cost_price} onValue={(n) => set('cost_price', n)} placeholder="0.00" />
          </Field>
          <Field label="Unit" htmlFor="inv-unit">
            <input id="inv-unit" className="input" list="inv-units" value={draft.unit} onChange={(e) => set('unit', e.target.value)} placeholder="pcs" />
            <datalist id="inv-units">{UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Storage location" htmlFor="inv-loc">
          <input id="inv-loc" className="input" value={draft.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Van 2, Shelf B" />
        </Field>
        <Field label="Low-stock alert at" htmlFor="inv-low" hint={draft.is_assembly ? 'Applies to components, not kits.' : '0 = warn only when out of stock.'}>
          <NumberInput id="inv-low" value={draft.low_stock_threshold} onValue={(n) => set('low_stock_threshold', q3(n))} disabled={draft.is_assembly} />
        </Field>
        {mode === 'add' && !draft.is_assembly && (
          <Field label="Starting quantity" htmlFor="inv-qty" hint="Recorded in the stock history as “Initial stock”.">
            <NumberInput id="inv-qty" value={draft.initialQty} onValue={(n) => set('initialQty', q3(n))} />
          </Field>
        )}
      </div>

      {draft.is_assembly && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Components per kit</h3>
            <p className="text-xs text-muted-foreground">A kit has no stock of its own. Checking one out removes its components from stock.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="input flex-1" value={pick} onChange={(e) => addComponent(e.target.value)} aria-label="Add a component">
              <option value="">Add a stock item…</option>
              {stockItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({toNumber(i.quantity)} in stock)</option>)}
            </select>
            <button type="button" className="btn btn-outline" onClick={() => set('assembly_items', [...draft.assembly_items, { item_id: crypto.randomUUID(), quantity: 1, is_custom: true, custom_name: '' }])}>
              <PlusIcon className="h-4 w-4" /> Untracked part
            </button>
          </div>
          {draft.assembly_items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">No components yet.</p>
          ) : (
            <ul className="space-y-2">
              {draft.assembly_items.map((c, idx) => {
                const def = byId.get(c.item_id);
                return (
                  <li key={`${c.item_id}-${idx}`} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2">
                    <div className="min-w-0 flex-1">
                      {c.is_custom ? (
                        <input className="input h-10 py-1.5" value={c.custom_name || ''} placeholder="Part name (not tracked)" onChange={(e) => set('assembly_items', draft.assembly_items.map((x, j) => (j === idx ? { ...x, custom_name: e.target.value } : x)))} />
                      ) : (
                        <div className="truncate px-1 text-sm font-medium">{def?.name || 'Deleted item'}<span className="block text-xs font-normal text-muted-foreground">{def ? `${money(def.cost_price)} each · ${toNumber(def.quantity)} in stock` : 'No longer in inventory'}</span></div>
                      )}
                    </div>
                    <label className="sr-only" htmlFor={`kit-q-${idx}`}>Quantity</label>
                    <NumberInput id={`kit-q-${idx}`} className="h-10 w-20 py-1.5 text-center" value={toNumber(c.quantity)} onValue={(n) => set('assembly_items', draft.assembly_items.map((x, j) => (j === idx ? { ...x, quantity: Math.max(0, q3(n)) } : x)))} />
                    <button type="button" aria-label="Remove component" className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive" onClick={() => set('assembly_items', draft.assembly_items.filter((_, j) => j !== idx))}>
                      <XIcon className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Cost per kit</span>
            <span className="font-semibold">{money(kitCost(kitPreview, byId))}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ======================================================================================================
// Adjust stock
// ======================================================================================================

const ADJUST_REASONS = [
  { value: 'restock', label: 'Restock / delivery', sign: 1 },
  { value: 'return', label: 'Returned from job', sign: 1 },
  { value: 'count', label: 'Stock count correction', sign: 0 },
  { value: 'damaged', label: 'Damaged / lost', sign: -1 },
  { value: 'used', label: 'Used (not on a job)', sign: -1 },
];

const AdjustStockModal: React.FC<{ item: InventoryItem; currentQty: number; onClose: () => void; onSubmit: (delta: number, reason: string) => Promise<void> }> = ({ item, currentQty, onClose, onSubmit }) => {
  const [reason, setReason] = useState('restock');
  const [amount, setAmount] = useState(1);
  const [counted, setCounted] = useState(Math.max(0, currentQty));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = ADJUST_REASONS.find((x) => x.value === reason)!;
  const delta = q3(r.sign === 0 ? q3(counted) - currentQty : r.sign * Math.abs(q3(amount)));
  const result = currentQty + delta;

  const submit = async () => {
    if (!delta) { setError(r.sign === 0 ? 'The counted quantity equals the current stock.' : 'Enter a quantity above 0.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(delta, [r.label, note.trim()].filter(Boolean).join(': '));
    } catch (e) {
      setError(friendlyError(e, 'Could not update stock.'));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="sm"
      title="Adjust stock"
      description={item.name}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !delta}>{busy ? 'Saving…' : 'Save adjustment'}</button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError>{error}</InlineError>}
        <Field label="Reason" htmlFor="adj-reason">
          <select id="adj-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {ADJUST_REASONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </Field>
        {r.sign === 0 ? (
          <Field label="Counted quantity" htmlFor="adj-count">
            <NumberInput id="adj-count" value={counted} onValue={(n) => setCounted(q3(n))} />
          </Field>
        ) : (
          <Field label={r.sign > 0 ? 'Quantity to add' : 'Quantity to remove'} htmlFor="adj-amount">
            <NumberInput id="adj-amount" value={amount} onValue={(n) => setAmount(q3(n))} />
          </Field>
        )}
        <Field label="Note (optional)" htmlFor="adj-note">
          <input id="adj-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. PO #1042" maxLength={200} />
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-sm">
          <span className="text-muted-foreground">Stock after change</span>
          <span className="font-semibold tabular-nums">
            {currentQty} <span className={delta >= 0 ? 'text-success' : 'text-destructive'}>{delta >= 0 ? '+' : '−'} {Math.abs(delta)}</span> = <span className={result < 0 ? 'text-destructive' : ''}>{result}</span> {item.unit || ''}
          </span>
        </div>
      </div>
    </Modal>
  );
};

// ======================================================================================================
// Check out to a job
// ======================================================================================================

const CheckoutModal: React.FC<{
  item: InventoryItem;
  available: number;
  byId: Map<string, InventoryItem>;
  propJobs: Job[];
  clients: Client[];
  onAddJob?: (job: Partial<Job>) => Promise<Job | null>;
  onCreateClient: (client: QuickClientInput) => Promise<Client>;
  userId: string | null;
  onClose: () => void;
  onSubmit: (qty: number, jobId: string | null, note: string, jobName?: string, clientName?: string) => Promise<void>;
}> = ({ item, available, byId, propJobs, clients, onAddJob, onCreateClient, userId, onClose, onSubmit }) => {
  const [qty, setQty] = useState(1);
  const [jobId, setJobId] = useState('');
  const [note, setNote] = useState('');
  const [jobs, setJobs] = useState<JobOption[]>(() => propJobs.filter((j) => j.status === 'active').map((j) => ({ id: j.id, name: j.name, clientName: j.clientName })));
  const [newJob, setNewJob] = useState<{ name: string; client: string } | null>(null);
  // Client-only check-out (no job), as in the original app. New clients are added to this local list.
  const [clientList, setClientList] = useState<Client[]>(clients);
  const [clientId, setClientId] = useState('');
  const [newClient, setNewClient] = useState<(QuickClientInput & { forJob: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.from('jobs').select('id,name,client_name,status').eq('status', 'active').order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setJobs((prev) => {
          const map = new Map(prev.map((j) => [j.id, j]));
          for (const j of data as any[]) map.set(j.id, { id: j.id, name: j.name || 'Untitled job', clientName: j.client_name || undefined });
          return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        });
      });
    return () => { cancelled = true; };
  }, []);

  const whole = Math.max(0, q3(qty));
  const over = whole > available;
  const moves = checkoutMoves(item, whole);
  const selectedJob = jobs.find((j) => j.id === jobId);
  const selectedClient = jobId ? undefined : clientList.find((c) => c.id === clientId);

  const createClient = async () => {
    if (!newClient) return;
    if (!newClient.name.trim()) { setError('Give the client a name.'); return; }
    setBusy(true);
    setError(null);
    try {
      const created = await onCreateClient(newClient);
      setClientList((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
      if (newClient.forJob) setNewJob((j) => (j ? { ...j, client: created.id } : j));
      else { setJobId(''); setClientId(created.id); }
      setNewClient(null);
    } catch (e) {
      setError(friendlyError(e, 'Could not create the client.'));
    } finally {
      setBusy(false);
    }
  };

  const createJob = async () => {
    if (!newJob?.name.trim()) { setError('Give the new job a name.'); return; }
    setBusy(true);
    setError(null);
    try {
      const client = clientList.find((c) => c.id === newJob.client);
      let created: { id: string } | null = null;
      if (onAddJob) {
        created = await onAddJob({ name: newJob.name.trim(), clientName: client?.name || '', clientAddress: client?.address || '', startDate: todayYMD(), status: 'active' });
      } else {
        const uid = userId ?? (await getCurrentUserId());
        const row = { id: crypto.randomUUID(), user_id: uid, name: newJob.name.trim(), client_name: client?.name || null, client_address: client?.address || null, start_date: todayYMD(), status: 'active' };
        const { error: insErr } = await supabase.from('jobs').insert(row);
        if (insErr) throw insErr;
        created = { id: row.id };
      }
      if (!created?.id) throw new Error('The job could not be created.');
      const opt = { id: created.id, name: newJob.name.trim(), clientName: client?.name };
      setJobs((prev) => [opt, ...prev.filter((j) => j.id !== opt.id)]);
      setJobId(opt.id);
      setNewJob(null);
    } catch (e) {
      setError(friendlyError(e, 'Could not create the job.'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (whole <= 0) { setError('Enter a quantity above 0.'); return; }
    if (item.is_assembly && !moves.length) { setError('This kit has no stocked components.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(whole, jobId || null, note, selectedJob?.name, selectedClient?.name);
    } catch (e) {
      setError(friendlyError(e, 'Could not check out the item.'));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="md"
      title="Check out"
      description={<>{item.name} · {item.is_assembly ? `${available} kit${available === 1 ? '' : 's'} can be built` : `${available} ${item.unit || 'in stock'}`}</>}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={`btn ${over ? 'btn-danger' : 'btn-primary'}`} onClick={submit} disabled={busy || whole <= 0 || !!newJob || !!newClient}>
            {busy ? 'Saving…' : over ? 'Check out anyway' : `Check out ${whole}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError>{error}</InlineError>}
        <Field label="Quantity" htmlFor="co-qty" error={over ? `Only ${available} available. Stock will go below zero.` : undefined}>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-outline h-11 w-11 p-0 text-lg" onClick={() => setQty((q) => (q > 1 ? q3(q - 1) : q))} aria-label="Less">−</button>
            <NumberInput id="co-qty" className="w-24 text-center" value={qty} onValue={(n) => setQty(q3(n))} />
            <button type="button" className="btn btn-outline h-11 w-11 p-0 text-lg" onClick={() => setQty((q) => q3(q + 1))} aria-label="More">+</button>
          </div>
        </Field>

        {item.is_assembly && moves.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Removes from stock</div>
            <ul className="space-y-1">
              {moves.map((m) => {
                const comp = byId.get(m.itemId);
                const left = toNumber(comp?.quantity) + m.delta;
                return <li key={m.itemId} className="flex justify-between gap-2"><span className="truncate">{comp?.name || 'Deleted item'}</span><span className={`tabular-nums ${left < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{m.delta} → {left}</span></li>;
              })}
            </ul>
          </div>
        )}

        {newClient ? (
          <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <h3 className="text-sm font-semibold">New client</h3>
            <Field label="Name *" htmlFor="co-cl-name">
              <input id="co-cl-name" className="input" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} placeholder="e.g. Jane Smith" maxLength={200} autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone" htmlFor="co-cl-phone">
                <input id="co-cl-phone" className="input" type="tel" inputMode="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
              </Field>
              <Field label="Email" htmlFor="co-cl-email">
                <input id="co-cl-email" className="input" type="email" inputMode="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
              </Field>
            </div>
            <label className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={newClient.temporary} onChange={(e) => setNewClient({ ...newClient, temporary: e.target.checked })} />
              <span>
                <span className="font-medium text-foreground">Mark as temporary client</span>
                <span className="block text-xs text-muted-foreground">Walk-ins and one-off hand-outs. You can convert them later.</span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm h-10" onClick={() => setNewClient(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm h-10" onClick={createClient} disabled={busy || !newClient.name.trim()}>Create client</button>
            </div>
          </div>
        ) : newJob ? (
          <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <h3 className="text-sm font-semibold">New job</h3>
            <input className="input" value={newJob.name} onChange={(e) => setNewJob({ ...newJob, name: e.target.value })} placeholder="Job name, e.g. 12 Main St bathroom" autoFocus />
            <div className="flex gap-2">
              <select className="input flex-1" value={newJob.client} onChange={(e) => setNewJob({ ...newJob, client: e.target.value })} aria-label="Client">
                <option value="">No client</option>
                {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="btn btn-outline shrink-0" onClick={() => setNewClient({ ...EMPTY_QUICK_CLIENT, forJob: true })} disabled={busy}><UsersIcon className="h-4 w-4" /> New</button>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm h-10" onClick={() => setNewJob(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm h-10" onClick={createJob} disabled={busy}>Create job</button>
            </div>
          </div>
        ) : (
          <>
            <Field label="Job" htmlFor="co-job" hint="Leave on “No job” for van stock or general use.">
              <div className="flex gap-2">
                <select id="co-job" className="input flex-1" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">No job</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}{j.clientName ? ` · ${j.clientName}` : ''}</option>)}
                </select>
                <button type="button" className="btn btn-outline shrink-0" onClick={() => setNewJob({ name: '', client: '' })}><PlusIcon className="h-4 w-4" /> New</button>
              </div>
            </Field>
            {!jobId && (
              <Field label="Client (no job)" htmlFor="co-client" hint="Optional. Hand stock to a client without a job; their name is saved in the stock history.">
                <div className="flex gap-2">
                  <select id="co-client" className="input flex-1" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">No client</option>
                    {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" className="btn btn-outline shrink-0" onClick={() => setNewClient({ ...EMPTY_QUICK_CLIENT, forJob: false })}><UsersIcon className="h-4 w-4" /> New</button>
                </div>
              </Field>
            )}
          </>
        )}

        <Field label="Note (optional)" htmlFor="co-note">
          <input id="co-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown in the stock history" maxLength={200} />
        </Field>
      </div>
    </Modal>
  );
};

// ======================================================================================================
// History (paginated, server-side)
// ======================================================================================================

const HISTORY_PAGE = 50;

const HistoryModal: React.FC<{ itemId: string | null; byId: Map<string, InventoryItem>; onClose: () => void }> = ({ itemId, byId, onClose }) => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [jobs, setJobs] = useState<Record<string, { name: string; client?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (offset: number) => {
    setLoading(true);
    setError(null);
    let q = supabase.from('inventory_history').select('*').order('created_at', { ascending: false }).range(offset, offset + HISTORY_PAGE - 1);
    if (itemId) q = q.eq('item_id', itemId);
    const { data, error: err } = await q;
    if (err) { setError(friendlyError(err, 'Could not load the history.')); setLoading(false); return; }
    const page = (data || []) as HistoryRow[];
    setRows((prev) => (offset === 0 ? page : [...prev, ...page]));
    setMore(page.length === HISTORY_PAGE);
    const missing = Array.from(new Set(page.map((r) => r.job_id).filter((id): id is string => !!id && !(id in jobs))));
    if (missing.length) {
      const { data: jd } = await supabase.from('jobs').select('id,name,client_name').in('id', missing);
      if (jd) setJobs((prev) => ({ ...prev, ...Object.fromEntries((jd as any[]).map((j) => [j.id, { name: j.name || 'Job', client: j.client_name || undefined }])) }));
    }
    setLoading(false);
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPage(0); }, [loadPage]);
  const itemName = itemId ? byId.get(itemId)?.name : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={itemName ? `Stock history · ${itemName}` : 'Stock history'}
      description="Every stock change: manual adjustments, check-outs and document deductions."
      footer={<button type="button" className="btn btn-outline" onClick={onClose}>Close</button>}
    >
      <InlineError onRetry={() => loadPage(0)}>{error}</InlineError>
      {loading && !rows.length ? (
        <SkeletonList rows={4} />
      ) : !rows.length && !error ? (
        <EmptyState compact icon={<ClockIcon />} title="No stock changes yet" description="Adjustments and check-outs will appear here." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const change = toNumber(r.quantity_change);
            const name = (r.item_id && byId.get(r.item_id)?.name) || r.item_name || 'Deleted item';
            const job = r.job_id ? jobs[r.job_id] : undefined;
            return (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${change >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{change >= 0 ? '+' : '−'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {!itemId && <div className="truncate font-semibold text-foreground">{name}</div>}
                      <div className="text-sm text-foreground">{actionLabel(r.action)}{job ? <span className="text-muted-foreground"> · {job.name}{job.client ? ` (${job.client})` : ''}</span> : null}</div>
                    </div>
                    <span className={`shrink-0 font-bold tabular-nums ${change >= 0 ? 'text-success' : 'text-destructive'}`}>{change > 0 ? '+' : ''}{change}</span>
                  </div>
                  {r.notes && <p className="mt-0.5 break-words text-sm text-muted-foreground">{r.notes}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground" title={r.created_at ? new Date(r.created_at).toLocaleString() : undefined}>
                    {timeAgo(r.created_at)}
                    {r.quantity_after !== null && r.quantity_after !== undefined && <> · {toNumber(r.quantity_after)} left after this change</>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {more && (
        <div className="mt-3 flex justify-center">
          <button type="button" className="btn btn-outline" onClick={() => loadPage(rows.length)} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>
        </div>
      )}
    </Modal>
  );
};

export default InventoryView;
