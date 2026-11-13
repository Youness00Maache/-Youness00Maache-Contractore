import React, { useEffect, useState } from 'react';
import { CheckCircleIcon, InfoIcon, XCircleIcon } from './Icons.tsx';

/**
 * Tiny app-wide toast system (owned by CORE).
 * Usage anywhere (components, services):  import { toast } from './Toast.tsx';  toast.error('Could not save');
 * <Toaster /> is mounted once by App.tsx.
 */
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastItem {
    id: number;
    kind: ToastKind;
    message: string;
    title?: string;
    action?: ToastAction;
    duration: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

const emit = () => listeners.forEach(l => l(items));

const dismiss = (id: number) => {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    items = items.filter(i => i.id !== id);
    emit();
};

const push = (kind: ToastKind, message: string, options: { title?: string; action?: ToastAction; duration?: number } = {}) => {
    if (!message) return -1;
    // collapse identical messages that are already visible
    const existing = items.find(i => i.kind === kind && i.message === message);
    if (existing) return existing.id;
    const id = nextId++;
    const duration = options.duration ?? (kind === 'error' ? 7000 : 4000);
    items = [...items.slice(-3), { id, kind, message, title: options.title, action: options.action, duration }];
    emit();
    if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration));
    return id;
};

export const toast = {
    success: (message: string, options?: { title?: string; action?: ToastAction; duration?: number }) => push('success', message, options),
    error: (message: string, options?: { title?: string; action?: ToastAction; duration?: number }) => push('error', message, options),
    info: (message: string, options?: { title?: string; action?: ToastAction; duration?: number }) => push('info', message, options),
    dismiss,
};

export const useToast = () => toast;

const kindStyles: Record<ToastKind, { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; accent: string }> = {
    success: { icon: CheckCircleIcon, accent: 'text-success' },
    error: { icon: XCircleIcon, accent: 'text-destructive' },
    info: { icon: InfoIcon, accent: 'text-primary' },
};

export const Toaster: React.FC = () => {
    const [list, setList] = useState<ToastItem[]>(items);

    useEffect(() => {
        listeners.add(setList);
        setList(items);
        return () => { listeners.delete(setList); };
    }, []);

    if (list.length === 0) return null;

    return (
        <div
            className="pointer-events-none fixed inset-x-0 bottom-20 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
            role="region"
            aria-label="Notifications"
        >
            {list.map(item => {
                const { icon: Icon, accent } = kindStyles[item.kind];
                return (
                    <div
                        key={item.id}
                        role={item.kind === 'error' ? 'alert' : 'status'}
                        className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-popover p-3.5 text-popover-foreground shadow-lift animate-fade-in-up"
                    >
                        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${accent}`} />
                        <div className="min-w-0 flex-1">
                            {item.title && <p className="text-sm font-semibold">{item.title}</p>}
                            <p className="text-sm leading-snug text-foreground/90 break-words">{item.message}</p>
                            {item.action && (
                                <button
                                    type="button"
                                    onClick={() => { item.action?.onClick(); dismiss(item.id); }}
                                    className="mt-2 text-sm font-semibold text-primary hover:underline"
                                >
                                    {item.action.label}
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => dismiss(item.id)}
                            className="-m-1 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Dismiss notification"
                        >
                            <span aria-hidden className="block h-4 w-4 leading-4 text-center">&times;</span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

export default Toaster;
