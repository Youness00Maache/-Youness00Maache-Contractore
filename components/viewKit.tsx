/**
 * Small UI kit shared by the VIEWS screens (Inventory, Price Book, Analytics, Calendar, Profit Calculator, Forum).
 * Uses only the design-system classes from index.css (.page, .card, .btn, .input, .badge, .modal-*, .skeleton)
 * so every screen looks the same in light, blue and dark themes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase.ts';
import { connectionProblem } from '../lib/offline/connection.ts';
import { BackArrowIcon, XCircleIcon, CheckCircleIcon, AlertTriangleIcon } from './Icons.tsx';

// ---------------------------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------------------------

/** The signed-in user's id from the local session (no network round trip). */
export const getCurrentUserId = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
};

/** Turns a Supabase/PostgREST/JS error into one short sentence for the UI. */
export const friendlyError = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (!error) return fallback;
  const e = error as { message?: string; code?: string; details?: string };
  const msg = String(e.message || (typeof error === 'string' ? error : '') || '');
  if (/^PLAN_LIMIT/i.test(msg)) return msg.replace(/^PLAN_LIMIT:?\s*/i, '') || 'You have reached a limit of the Free plan.';
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  // offline: this action needs a connection (say it plainly instead of a vague network error)
  const connection = connectionProblem(msg);
  if (connection) return connection;
  if (/insufficient/i.test(msg)) return 'Not enough stock for this change.';
  if (/JWT|not authenticated|auth session missing/i.test(msg)) return 'Your session has expired. Please sign in again.';
  if (/bucket not found/i.test(msg)) return 'File storage is not set up yet. Please contact support.';
  if (/payload too large|exceeded the maximum/i.test(msg)) return 'That file is too large.';
  return msg && msg.length < 180 ? msg : fallback;
};

const MISSING_COLUMN_RE = /Could not find the '([^']+)' column/i;

/**
 * Runs an insert/update and, if PostgREST reports an unknown column (schema older than the app),
 * retries without that column. Returns the final { data, error } and the columns that were dropped.
 */
export const withSchemaFallback = async <T extends Record<string, unknown>, R>(
  payload: T,
  run: (p: Partial<T>) => PromiseLike<{ data: R | null; error: any }>,
  maxRetries = 6,
): Promise<{ data: R | null; error: any; dropped: string[] }> => {
  const current: Record<string, unknown> = { ...payload };
  const dropped: string[] = [];
  for (let i = 0; i <= maxRetries; i++) {
    const { data, error } = await run(current as Partial<T>);
    const missing = error && (error.code === 'PGRST204' || MISSING_COLUMN_RE.test(error.message || '')) ? MISSING_COLUMN_RE.exec(error.message || '')?.[1] : undefined;
    if (!missing || !(missing in current)) return { data, error, dropped };
    delete current[missing];
    dropped.push(missing);
  }
  return { data: null, error: { message: 'Could not save: the database schema is out of date.' }, dropped };
};

/** Loads every row of a query in pages of `pageSize` (PostgREST caps responses at 1000 rows). */
export const fetchAllPages = async <R,>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: any }>,
  pageSize = 1000,
  maxPages = 50,
): Promise<{ rows: R[]; error: any; truncated: boolean }> => {
  const rows: R[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) return { rows, error, truncated: false };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
};

/** Image types and size accepted by the public image buckets (`forum`, `price-book-images`). */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Uploads a file to `<bucket>/<uid>/<uuid>.<ext>` (owner folder) and returns its public URL. */
export const uploadToOwnFolder = async (bucket: string, file: File | Blob, userId: string, fileName = 'upload.jpg'): Promise<string> => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Connect to the internet to upload files.');
  if (file.type && !IMAGE_ACCEPT.split(',').includes(file.type)) throw new Error('Use a JPG, PNG, WebP or GIF image.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('That image is larger than 5 MB. Try a smaller photo.');
  const name = (file as File).name || fileName;
  const ext = (name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: (file as File).type || undefined,
    cacheControl: '31536000',
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

/** If `url` is a public URL inside `<bucket>/<userId>/`, returns the object path, else null. */
export const ownStoragePath = (url: string, bucket: string, userId: string): string | null => {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  return path.startsWith(`${userId}/`) ? path : null;
};

export const money = (value: unknown, opts: { cents?: boolean } = {}): string => {
  const n = typeof value === 'number' ? value : Number(value) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  }).format(Number.isFinite(n) ? n : 0);
};

export const compactMoney = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1000)}k`;
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`;
  return money(value, { cents: false });
};

export const timeAgo = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
};

export const useIsMobile = (query = '(max-width: 639px)') => {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const on = () => setMatch(mql.matches);
    mql.addEventListener?.('change', on);
    return () => mql.removeEventListener?.('change', on);
  }, [query]);
  return match;
};

// ---------------------------------------------------------------------------------------------
// Icons not present in Icons.tsx (kept local to avoid editing a shared file)
// ---------------------------------------------------------------------------------------------
const Stroke: React.FC<React.SVGProps<SVGSVGElement>> = ({ children, ...p }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
);
export const ChevronLeftIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="m15 18-6-6 6-6" /></Stroke>;
export const ChevronRightIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="m9 18 6-6-6-6" /></Stroke>;
export const XIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Stroke>;
export const FlagIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></Stroke>;
export const GridIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Stroke>;
export const RowsIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></Stroke>;
export const LayersIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="m12 2 10 5-10 5L2 7l10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></Stroke>;
export const SlidersIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" /></Stroke>;
export const QrIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3z" /><path d="M20 14v.01" /><path d="M14 20h.01" /><path d="M17 20h4v-3" /></Stroke>;

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

/** Consistent page header: back button, title + subtitle on the left, actions on the right (wrap below on mobile). */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, onBack, backLabel = 'Back', actions, icon }) => (
  <header className="page-header">
    <div className="flex min-w-0 items-start gap-3">
      {onBack && (
        <button type="button" onClick={onBack} aria-label={backLabel} className="btn btn-ghost -ml-2 h-10 w-10 shrink-0 rounded-full p-0">
          <BackArrowIcon className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="page-title flex items-center gap-2">
          {icon && <span className="hidden text-primary sm:inline-flex">{icon}</span>}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
  </header>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; compact?: boolean }> = ({ icon, title, description, action, compact }) => (
  <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 text-center ${compact ? 'px-4 py-8' : 'px-6 py-14'}`}>
    {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&>svg]:h-6 [&>svg]:w-6">{icon}</div>}
    <h3 className="text-base font-semibold text-foreground">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({ rows = 5, className = '' }) => (
  <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="card flex items-center gap-4 p-4">
        <div className="skeleton h-10 w-10 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-2/5" />
          <div className="skeleton h-3 w-1/4" />
        </div>
        <div className="skeleton hidden h-8 w-20 sm:block" />
      </div>
    ))}
  </div>
);

export const SkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card space-y-3 p-4">
        <div className="skeleton h-28 w-full rounded-xl" />
        <div className="skeleton h-4 w-3/5" />
        <div className="skeleton h-3 w-2/5" />
      </div>
    ))}
  </div>
);

export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
  active?: boolean;
}> = ({ label, value, hint, icon, tone = 'default', onClick, active }) => {
  const toneClass = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-destructive/10 text-destructive',
  }[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {/* phones: no icon tile, so the label isn't cut off in a half-width card */}
        {icon && <span className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex [&>svg]:h-4 [&>svg]:w-4 ${toneClass}`}>{icon}</span>}
      </div>
      <div className="mt-2 truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={`card p-3.5 text-left transition hover:border-primary/40 hover:shadow-card sm:p-4 ${active ? 'border-primary ring-2 ring-primary/20' : ''}`}>
        {body}
      </button>
    );
  }
  return <div className="card p-3.5 sm:p-4">{body}</div>;
};

export function Segmented<T extends string>({ options, value, onChange, size = 'md', ariaLabel }: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex min-w-0 max-w-full shrink overflow-x-auto rounded-xl border border-border bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-lg font-semibold transition ${size === 'sm' ? 'px-2.5 py-1.5 text-xs sm:py-1' : 'px-3 py-1.5 text-sm'} ${value === o.value ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Pager: React.FC<{ page: number; pageCount: number; total: number; pageSize: number; onPage: (p: number) => void; noun?: string }> = ({ page, pageCount, total, pageSize, onPage, noun = 'items' }) => {
  if (total === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
      <span>Showing <strong className="text-foreground">{from}–{to}</strong> of <strong className="text-foreground">{total}</strong> {noun}</span>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-outline h-10 px-3" onClick={() => onPage(page - 1)} disabled={page <= 0} aria-label="Previous page"><ChevronLeftIcon className="h-4 w-4" /> Prev</button>
          <span className="tabular-nums">{page + 1} / {pageCount}</span>
          <button type="button" className="btn btn-outline h-10 px-3" onClick={() => onPage(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page">Next <ChevronRightIcon className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Modal, confirm, notices
// ---------------------------------------------------------------------------------------------

let openModals = 0;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** prevents closing by backdrop/Escape (e.g. while saving) */
  busy?: boolean;
  bodyClassName?: string;
  labelledBy?: string;
}

/** Accessible modal: bottom sheet on mobile, centred dialog from `sm`. Escape and backdrop close it. */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, description, children, footer, size = 'md', busy, bodyClassName = '' }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    openModals += 1;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      // Respect React `autoFocus` inside the dialog; otherwise focus the dialog itself (no keyboard pop-up on phones).
      if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus();
    }, 30);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) document.body.style.overflow = prevOverflow === 'hidden' ? '' : prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className={`modal-panel flex flex-col p-0 outline-none ${width}`}>
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-bold leading-tight text-foreground">{title}</h2>}
              {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
            </div>
            <button type="button" data-modal-close onClick={onClose} disabled={busy} aria-label="Close" className="btn btn-ghost -mr-2 h-10 w-10 shrink-0 rounded-full p-0">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 ${bodyClassName}`}>{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'Confirm', destructive, busy, onConfirm, onCancel }) => (
  <Modal
    open={open}
    onClose={onCancel}
    busy={busy}
    size="sm"
    title={title}
    footer={
      <>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </>
    }
  >
    {message && <div className="text-sm leading-relaxed text-muted-foreground">{message}</div>}
  </Modal>
);

export type NoticeTone = 'success' | 'error' | 'info';
export interface Notice { id: number; tone: NoticeTone; text: string }

/** Local toast state for a screen: `notify('success', 'Saved')`. */
export const useNotice = (timeoutMs = 4500) => {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const notify = useCallback((tone: NoticeTone, text: string) => {
    window.clearTimeout(timer.current);
    const n = { id: Date.now(), tone, text };
    setNotice(n);
    timer.current = window.setTimeout(() => setNotice((cur) => (cur?.id === n.id ? null : cur)), tone === 'error' ? timeoutMs + 2500 : timeoutMs);
  }, [timeoutMs]);
  const clear = useCallback(() => setNotice(null), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { notice, notify, clear };
};

export const NoticeToast: React.FC<{ notice: Notice | null; onClose: () => void }> = ({ notice, onClose }) => {
  if (!notice) return null;
  const tone = {
    success: 'border-success/30 [&_.icon]:text-success',
    error: 'border-destructive/30 [&_.icon]:text-destructive',
    info: 'border-primary/30 [&_.icon]:text-primary',
  }[notice.tone];
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-4" role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
      <div key={notice.id} className={`card pointer-events-auto flex w-full max-w-md items-start gap-3 px-4 py-3 shadow-lift animate-fade-in-up ${tone}`}>
        <span className="icon mt-0.5 shrink-0">{notice.tone === 'error' ? <AlertTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}</span>
        <p className="flex-1 text-sm font-medium text-foreground">{notice.text}</p>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"><XCircleIcon className="h-4 w-4" /></button>
      </div>
    </div>,
    document.body,
  );
};

export const InlineError: React.FC<{ children?: React.ReactNode; onRetry?: () => void }> = ({ children, onRetry }) =>
  children ? (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onRetry && <button type="button" onClick={onRetry} className="btn btn-outline btn-sm shrink-0">Retry</button>}
    </div>
  ) : null;

/** Labelled form field wrapper. */
export const Field: React.FC<{ label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; error?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ label, htmlFor, hint, error, className = '', children }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="label">{label}</label>
    {children}
    {error ? <p className="mt-1 text-xs font-medium text-destructive">{error}</p> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

/**
 * Small popover menu (closes on selection, outside click, scroll and Escape). Works on touch.
 * The menu is rendered in a portal with fixed positioning, so cards/tables with overflow-hidden
 * never clip it, and it flips upwards near the bottom of the screen.
 */
export const ActionMenu: React.FC<{
  label?: string;
  trigger?: React.ReactNode;
  items: ({ label: React.ReactNode; onSelect: () => void; destructive?: boolean; icon?: React.ReactNode; hidden?: boolean } | null)[];
  align?: 'left' | 'right';
}> = ({ label = 'More actions', trigger, items, align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((i): i is NonNullable<typeof i> => !!i && !i.hidden);
  const MENU_W = 208;

  useEffect(() => {
    if (!open) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const estH = visible.length * 44 + 8;
      const below = window.innerHeight - r.bottom;
      const up = below < estH + 8 && r.top > below;
      const left = Math.max(8, Math.min(align === 'right' ? r.right - MENU_W : r.left, window.innerWidth - MENU_W - 8));
      setPos(up ? { bottom: window.innerHeight - r.top + 4, left } : { top: r.bottom + 4, left });
    }
    const inside = (t: EventTarget | null) => !!t && ((menuRef.current?.contains(t as Node) ?? false) || (btnRef.current?.contains(t as Node) ?? false));
    const onDown = (e: MouseEvent | TouchEvent) => { if (!inside(e.target)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    const t = window.setTimeout(() => menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="btn btn-ghost h-10 w-10 rounded-full p-0 text-muted-foreground">
        {trigger ?? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: MENU_W }}
          className="z-[80] overflow-hidden rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-lift animate-zoom-in"
        >
          {visible.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); item.onSelect(); }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition hover:bg-muted focus:bg-muted focus:outline-none [&>svg]:h-4 [&>svg]:w-4 ${item.destructive ? 'text-destructive' : 'text-foreground'}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
};

/**
 * Numeric input that keeps the raw text while typing (so "0." or "" don't jump) and reports a number.
 * Focusing selects the whole value, so typing replaces a pre-filled 0 instead of producing "0100"; leading zeros
 * are dropped while typing too ("0100" → "100", "0.5" stays).
 */
export const NumberInput: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  onValue: (n: number) => void;
  /** Called instead of onValue(0) when the field is cleared (e.g. "no override"). */
  onEmpty?: () => void;
  allowNegative?: boolean;
}> = ({ value, onValue, onEmpty, allowNegative = false, className = '', onFocus, onMouseUp, ...rest }) => {
  const [text, setText] = useState(value === null || value === undefined || Number.isNaN(value) ? '' : String(value));
  const lastValue = useRef(value);
  // A mouse click focuses first, then its mouseup would drop the selection: keep it for that one mouseup.
  const keepSelection = useRef(false);
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      const parsed = parseFloat(text);
      if (!(Number.isFinite(parsed) && parsed === value)) setText(value === null || value === undefined || Number.isNaN(value) ? '' : String(value));
    }
  }, [value, text]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={`input tabular-nums ${className}`}
      value={text}
      onFocus={(e) => {
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onMouseDown={(e) => {
        keepSelection.current = document.activeElement !== e.currentTarget;
        rest.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        if (keepSelection.current) {
          keepSelection.current = false;
          e.preventDefault();
        }
        onMouseUp?.(e);
      }}
      onChange={(e) => {
        keepSelection.current = false;
        const raw = e.target.value.replace(',', '.').replace(/^(-?)0+(?=\d)/, '$1');
        const re = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
        if (!re.test(raw)) return;
        setText(raw);
        if (raw === '' && onEmpty) {
          lastValue.current = null;
          onEmpty();
          return;
        }
        const n = parseFloat(raw);
        const next = Number.isFinite(n) ? n : 0;
        lastValue.current = next;
        onValue(next);
      }}
    />
  );
};
