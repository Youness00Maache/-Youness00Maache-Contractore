import React, { useEffect, useState } from 'react';
import { PlusIcon } from './Icons.tsx';

export interface DockItem {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    label: string;
    onClick?: () => void;
    badgeCount?: number;
    /** Highlights the current section. */
    active?: boolean;
    /** Badge color: red (default) for things waiting on you, amber for reminders. */
    badgeTone?: 'danger' | 'warning';
}

type DockProps = {
    items: DockItem[];
    /** The page's main action (e.g. "New job" on the dashboard): a floating button above the bar, so the tabs never move. */
    action?: { label: string; onClick: () => void };
};

/** Shrinks the floating action to its icon while the page scrolls down, shows the label again on the way up. */
const useCollapsedOnScroll = (enabled: boolean) => {
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => {
        if (!enabled) return;
        let last = window.scrollY;
        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const y = window.scrollY;
                if (y < 80) setCollapsed(false);
                else if (y > last + 6) setCollapsed(true);
                else if (y < last - 6) setCollapsed(false);
                last = y;
                ticking = false;
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [enabled]);
    return collapsed;
};

/**
 * Mobile bottom tab bar (hidden from md up, where the top bar takes over). The tabs are the same on every screen
 * (same order, same place); a screen's main action floats above the bar on the right instead of squeezing in.
 */
const Dock: React.FC<DockProps> = ({ items, action }) => {
    const collapsed = useCollapsedOnScroll(Boolean(action));
    return (
        <>
            {action && (
                // z-30: the "add to home screen" banner (same height, rendered later) stays on top until dismissed
                <button
                    type="button"
                    onClick={action.onClick}
                    aria-label={action.label}
                    className={`no-print fixed right-4 z-30 flex h-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lift transition-[padding,transform] duration-200 active:scale-95 md:hidden ${collapsed ? 'w-14 px-0' : 'gap-2 pl-4 pr-5'}`}
                    style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
                >
                    <PlusIcon className="h-6 w-6 shrink-0" />
                    {!collapsed && <span className="whitespace-nowrap text-sm font-semibold">{action.label}</span>}
                </button>
            )}
            <nav
                className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
                aria-label="Main"
            >
                <ul className="mx-auto flex h-16 max-w-lg items-stretch px-1">
                    {items.map((item) => {
                        const Icon = item.icon;
                        const badge = typeof item.badgeCount === 'number' && item.badgeCount > 0 ? item.badgeCount : 0;
                        return (
                            <li key={item.label} className="flex min-w-0 flex-1">
                                <button
                                    type="button"
                                    onClick={item.onClick}
                                    aria-current={item.active ? 'page' : undefined}
                                    aria-label={badge ? `${item.label} (${badge})` : undefined}
                                    className="group flex w-full min-w-0 flex-col items-center justify-center gap-1 outline-none"
                                >
                                    {/* the current tab gets a soft pill behind its icon */}
                                    <span
                                        className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150 ${item.active
                                            ? 'bg-primary/15 text-primary'
                                            : 'text-muted-foreground group-hover:text-foreground group-active:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring'}`}
                                    >
                                        <Icon className="h-[22px] w-[22px]" />
                                        {badge > 0 && (
                                            <span
                                                className={`absolute right-1.5 top-0 flex h-[18px] min-w-[18px] -translate-y-1/4 translate-x-1/3 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none ring-2 ring-card ${item.badgeTone === 'warning' ? 'bg-warning text-warning-foreground' : 'bg-destructive text-destructive-foreground'}`}
                                            >
                                                {badge > 99 ? '99+' : badge}
                                            </span>
                                        )}
                                    </span>
                                    <span className={`max-w-full truncate px-0.5 text-[11px] leading-none ${item.active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
                                        {item.label}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </>
    );
};

export default Dock;
