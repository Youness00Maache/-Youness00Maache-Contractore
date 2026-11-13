/**
 * Small shared UI kit for the COMMS screens (clients, communication, portal, approval).
 * Uses only the design-system classes from index.css and theme tokens, so it works in light and dark mode.
 */
import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangleIcon, BackArrowIcon, CheckCircleIcon, XCircleIcon } from './Icons.tsx';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/** Turns any thrown value (Error, PostgrestError, string) into a readable sentence. */
export const getErrorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    const anyErr = err as { message?: unknown; error_description?: unknown; details?: unknown };
    const msg = typeof anyErr.message === 'string' && anyErr.message.trim()
        ? anyErr.message
        : typeof anyErr.error_description === 'string' ? anyErr.error_description : '';
    if (!msg) return fallback;
    if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network error. Check your connection and try again.';
    return msg.replace(/^PLAN_LIMIT:\s*/i, '');
};

/** The database / edge functions prefix free-plan limit errors with `PLAN_LIMIT:`. */
export const isPlanLimitError = (err: unknown): boolean => {
    const msg = typeof err === 'string' ? err : (err as { message?: string; code?: string })?.message || '';
    const code = (err as { code?: string })?.code || '';
    return /PLAN_LIMIT/i.test(msg) || code === 'PLAN_LIMIT';
};

export const Spinner: React.FC<{ className?: string; label?: string }> = ({ className, label }) => (
    <span className={cx('inline-flex items-center gap-2', className)} role="status" aria-live="polite">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
);

export const SkeletonRows: React.FC<{ rows?: number; className?: string }> = ({ rows = 4, className }) => (
    <div className={cx('space-y-3', className)} aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="card card-pad flex items-center gap-4">
                <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-1/2" />
                    <div className="skeleton h-3 w-1/3" />
                </div>
            </div>
        ))}
    </div>
);

type Tone = 'info' | 'success' | 'warning' | 'danger';
const TONE_CLASSES: Record<Tone, string> = {
    info: 'border-primary/25 bg-primary/5 text-foreground',
    success: 'border-success/30 bg-success/10 text-foreground',
    warning: 'border-warning/40 bg-warning/10 text-foreground',
    danger: 'border-destructive/30 bg-destructive/10 text-foreground',
};
const TONE_ICON: Record<Tone, React.ReactNode> = {
    info: <AlertTriangleIcon className="h-5 w-5 shrink-0 text-primary" />,
    success: <CheckCircleIcon className="h-5 w-5 shrink-0 text-success" />,
    warning: <AlertTriangleIcon className="h-5 w-5 shrink-0 text-warning" />,
    danger: <XCircleIcon className="h-5 w-5 shrink-0 text-destructive" />,
};

/** Inline message banner (replaces alert()). */
export const Notice: React.FC<{
    tone?: Tone;
    title?: React.ReactNode;
    children?: React.ReactNode;
    action?: React.ReactNode;
    onClose?: () => void;
    className?: string;
}> = ({ tone = 'info', title, children, action, onClose, className }) => (
    <div
        className={cx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-in', TONE_CLASSES[tone], className)}
        role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    >
        {TONE_ICON[tone]}
        <div className="min-w-0 flex-1">
            {title && <p className="font-semibold">{title}</p>}
            {children && <div className={cx('text-muted-foreground', title ? 'mt-0.5' : '')}>{children}</div>}
            {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
        </div>
        {onClose && (
            <button
                type="button"
                onClick={onClose}
                className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Dismiss"
            >
                <XCircleIcon className="h-4 w-4" />
            </button>
        )}
    </div>
);

export const EmptyState: React.FC<{
    icon?: React.ReactNode;
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}> = ({ icon, title, description, action, className }) => (
    <div className={cx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center', className)}>
        {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</div>}
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
        {action && <div className="mt-5">{action}</div>}
    </div>
);

/** Consistent page header: back button, title, subtitle, actions on the right (stack on mobile). */
export const PageHeader: React.FC<{
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    onBack?: () => void;
    actions?: React.ReactNode;
    badge?: React.ReactNode;
}> = ({ title, subtitle, onBack, actions, badge }) => (
    <header className="page-header">
        <div className="flex min-w-0 items-start gap-2">
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="btn btn-ghost -ml-2 h-10 w-10 shrink-0 rounded-full p-0"
                    aria-label="Back"
                >
                    <BackArrowIcon className="h-5 w-5" />
                </button>
            )}
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="page-title truncate">{title}</h1>
                    {badge}
                </div>
                {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
);

const SIZE_CLASSES = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' } as const;

/** Accessible modal: closes on Escape and backdrop click, bottom sheet on phones. */
export const Modal: React.FC<{
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    size?: keyof typeof SIZE_CLASSES;
    /** Prevent closing (e.g. while a request is running). */
    locked?: boolean;
    className?: string;
}> = ({ open, onClose, title, description, children, footer, size = 'md', locked = false, className }) => {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const lockedRef = useRef(locked);
    lockedRef.current = locked;

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !lockedRef.current) onCloseRef.current();
        };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // Move focus into the dialog for keyboard and screen-reader users.
        const t = window.setTimeout(() => {
            const panel = panelRef.current;
            if (!panel || panel.contains(document.activeElement)) return;
            const el = panel.querySelector<HTMLElement>('[data-autofocus]')
                || panel.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select')
                || panel.querySelector<HTMLElement>('button');
            el?.focus();
        }, 30);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            window.clearTimeout(t);
        };
    }, [open]);

    if (!open) return null;
    return (
        <div
            className="modal-backdrop z-[100]"
            onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                className={cx('modal-panel flex flex-col', SIZE_CLASSES[size], className)}
            >
                {(title || description) && (
                    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                        <div className="min-w-0">
                            {title && <h2 id={titleId} className="text-lg font-semibold text-foreground">{title}</h2>}
                            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                        </div>
                        {!locked && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Close"
                            >
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        )}
                    </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
                {footer && (
                    <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export const ConfirmDialog: React.FC<{
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    busy?: boolean;
    error?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, busy, error, onConfirm, onCancel }) => (
    <Modal
        open={open}
        onClose={onCancel}
        title={title}
        size="sm"
        locked={busy}
        footer={
            <>
                <button type="button" className="btn btn-outline min-h-[40px]" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
                <button
                    type="button"
                    className={cx('btn min-h-[40px]', destructive ? 'btn-danger' : 'btn-primary')}
                    onClick={onConfirm}
                    disabled={busy}
                    data-autofocus
                >
                    {busy ? <Spinner label="Working…" /> : confirmLabel}
                </button>
            </>
        }
    >
        <div className="space-y-3 text-sm text-muted-foreground">
            {message}
            {error && <Notice tone="danger">{error}</Notice>}
        </div>
    </Modal>
);

/** Circle with the first letter(s) of a name. */
export const Avatar: React.FC<{ name?: string | null; className?: string }> = ({ name, className }) => {
    const initials = String(name || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p.charAt(0).toUpperCase())
        .join('') || '?';
    return (
        <div
            className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary', className)}
            aria-hidden="true"
        >
            {initials}
        </div>
    );
};

export const StatusBadge: React.FC<{ status?: string | null; className?: string }> = ({ status, className }) => {
    const s = String(status || 'Draft');
    const tone =
        /^(paid|accepted|approved|signed|completed|sent ✓)$/i.test(s) ? 'badge-success'
            : /^(overdue|rejected|declined|cancelled|expired)$/i.test(s) ? 'badge-danger'
                : /^(sent|in progress|scheduled|pending)$/i.test(s) ? 'badge-primary'
                    : /^(on hold|needs reconnect)$/i.test(s) ? 'badge-warning'
                        : 'badge-muted';
    return <span className={cx('badge', tone, className)}>{s}</span>;
};
