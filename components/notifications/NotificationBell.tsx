/**
 * The bell in the app bar (phones and computers) and its list: a dropdown on computers, a full-height sheet on
 * phones. Compact rows: a small type-coded dot (or the person's initial), one sentence, the time, × to remove.
 * Data and actions come from <NotificationCenter> (centerStore.ts).
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellIcon, SettingsIcon } from '../Icons.tsx';
import { badgeText, groupByDay, timeLabel } from '../../lib/notifications/format.ts';
import type { NotificationTone, ShownNotification } from '../../lib/notifications/model.ts';
import { useNotificationCenterSnapshot } from './centerStore.ts';

const DOT: Record<NotificationTone, string> = {
    success: 'bg-success',
    info: 'bg-primary',
    warning: 'bg-warning',
    danger: 'bg-destructive',
};

const initialOf = (name?: string) => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '';

const CloseIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        <path d="M18 6 6 18M6 6l12 12" />
    </svg>
);

const useIsDesktop = (): boolean => {
    const query = '(min-width: 768px)';
    const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
    useEffect(() => {
        if (!window.matchMedia) return;
        const mq = window.matchMedia(query);
        const on = () => setMatch(mq.matches);
        on();
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, []);
    return match;
};

const Row: React.FC<{ n: ShownNotification; now: number; onOpen: () => void; onDismiss: () => void }> = ({ n, now, onOpen, onDismiss }) => {
    const initial = n.actor ? initialOf(n.actor) : '';
    return (
        <li className={`group relative flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60 ${n.read ? '' : 'bg-primary/[0.045]'}`}>
            <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
                {initial ? (
                    <>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">{initial}</span>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-popover ${DOT[n.tone]}`} />
                    </>
                ) : (
                    <span className={`h-2 w-2 rounded-full ${DOT[n.tone]}`} />
                )}
            </span>
            <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
                <span className={`block text-sm leading-snug ${n.read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                    {n.text}
                    {!n.read && <span className="sr-only"> (unread)</span>}
                </span>
                {n.detail && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.detail}</span>}
            </button>
            <span className="relative shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">{timeLabel(n.at, now)}</span>
            <button
                type="button"
                onClick={onDismiss}
                className="relative -mr-2 -mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground/70 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                aria-label={`Remove: ${n.text}`}
                title="Remove"
            >
                <CloseIcon className="h-3.5 w-3.5" />
            </button>
        </li>
    );
};

const NotificationBell: React.FC = () => {
    const center = useNotificationCenterSnapshot();
    const [open, setOpen] = useState(false);
    const isDesktop = useIsDesktop();
    const wrapRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const bellRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();
    const badge = badgeText(center.unread, center.quiet);
    const actions = center.actions;

    const close = (focusBell = true) => {
        setOpen(false);
        if (focusBell) window.setTimeout(() => bellRef.current?.focus(), 0);
    };

    useEffect(() => {
        if (!open) return;
        actions?.panelOpened();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        const onDown = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('touchstart', onDown);
        const t = window.setTimeout(() => panelRef.current?.focus(), 0);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('touchstart', onDown);
            window.clearTimeout(t);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // the sheet covers the page on phones: no page scroll behind it
    useEffect(() => {
        if (!open || isDesktop) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [open, isDesktop]);

    const groups = groupByDay(center.list, center.builtAt || Date.now());
    const now = center.builtAt || Date.now();

    const openItem = (n: ShownNotification) => { close(false); actions?.open(n); };

    const header = (
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {!isDesktop && (
                <button type="button" onClick={() => close()} className="-ml-2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close notifications">
                    <CloseIcon className="h-5 w-5" />
                </button>
            )}
            <h2 id={titleId} className="min-w-0 flex-1 text-sm font-semibold">
                Notifications
                {center.unread > 0 && <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{center.unread} new</span>}
            </h2>
            {center.unread > 0 && (
                <button type="button" onClick={() => actions?.markAllRead()} className="rounded-md px-1.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10">
                    Mark all read
                </button>
            )}
        </div>
    );

    const body = (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {!center.loaded && center.list.length === 0 ? (
                <div className="space-y-3 px-4 py-4" aria-busy="true" aria-label="Loading notifications">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="flex items-start gap-3">
                            <span className="mt-1.5 h-2 w-2 rounded-full bg-muted" />
                            <span className="flex-1 space-y-1.5"><span className="skeleton block h-3.5 w-4/5" /><span className="skeleton block h-3 w-1/2" /></span>
                        </div>
                    ))}
                </div>
            ) : center.list.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                    Nothing new. Client signatures, payments, low stock, quote requests and Community replies show up here.
                </p>
            ) : (
                groups.map(g => (
                    <section key={g.id} aria-label={g.label}>
                        <h3 className="sticky top-0 z-[1] bg-popover/95 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{g.label}</h3>
                        <ul>
                            {g.items.map(n => (
                                <Row key={n.id} n={n} now={now} onOpen={() => openItem(n)} onDismiss={() => actions?.dismiss(n)} />
                            ))}
                        </ul>
                    </section>
                ))
            )}
        </div>
    );

    const footer = (
        <div className="border-t border-border px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] md:pb-1.5">
            <button type="button" onClick={() => { close(false); actions?.openSettings(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                <SettingsIcon className="h-3.5 w-3.5" /> Notification settings
            </button>
        </div>
    );

    const panel = isDesktop ? (
        <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-labelledby={titleId}
            className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(72vh,600px)] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift outline-none animate-zoom-in"
        >
            {header}{body}{footer}
        </div>
    ) : createPortal(
        <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-0 z-[70] flex flex-col bg-popover pt-[env(safe-area-inset-top)] text-popover-foreground outline-none animate-fade-in"
        >
            {header}{body}{footer}
        </div>,
        document.body,
    );

    return (
        <div ref={wrapRef} className="relative">
            <button
                ref={bellRef}
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-muted ${open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label={`Notifications${center.unread ? `, ${center.unread} unread` : ''}`}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <BellIcon className="h-5 w-5" />
                {badge === '•' ? (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card" aria-hidden />
                ) : badge ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-card tabular-nums" aria-hidden>
                        {badge}
                    </span>
                ) : null}
            </button>
            {open && panel}
        </div>
    );
};

export default NotificationBell;
