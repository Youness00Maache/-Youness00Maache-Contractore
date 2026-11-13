import React from 'react';

export interface DockItem {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    label: string;
    onClick?: () => void;
    badgeCount?: number;
    /** Highlights the current section. */
    active?: boolean;
    /** Renders as the raised primary action in the middle of the bar. */
    primary?: boolean;
}

type DockProps = {
    items: DockItem[];
};

/** Mobile bottom tab bar (hidden from md up, where the top bar takes over). */
const Dock: React.FC<DockProps> = ({ items }) => {
    return (
        <nav
            className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
            aria-label="Main"
        >
            <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around px-1">
                {items.map((item) => {
                    const Icon = item.icon;
                    if (item.primary) {
                        return (
                            <li key={item.label} className="flex flex-1 items-center justify-center">
                                <button
                                    type="button"
                                    onClick={item.onClick}
                                    aria-label={item.label}
                                    className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lift ring-4 ring-background transition active:scale-95"
                                >
                                    <Icon className="h-6 w-6" />
                                </button>
                            </li>
                        );
                    }
                    return (
                        <li key={item.label} className="flex flex-1">
                            <button
                                type="button"
                                onClick={item.onClick}
                                aria-current={item.active ? 'page' : undefined}
                                className={`relative flex w-full flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition ${item.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <span className="relative">
                                    <Icon className="h-5 w-5" />
                                    {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                                        <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-card">
                                            {item.badgeCount > 99 ? '99+' : item.badgeCount}
                                        </span>
                                    )}
                                </span>
                                <span className="max-w-full truncate px-0.5">{item.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};

export default Dock;
