import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Dock, { type DockItem } from './Dock.tsx';
import { DropdownMenu, DropdownItem, DropdownSeparator, DropdownLabel } from './ui/DropdownMenu.tsx';
import {
    AppLogo, HomeIcon, UsersIcon, MailIcon, BoxIcon, TagIcon, CalendarIcon, CalculatorIcon, BarChartIcon,
    MessageSquareIcon, SettingsIcon, UserIcon, LogoutIcon, CreditCardIcon, StarIcon, ChevronDownIcon, GridIcon,
    PlusIcon, XCircleIcon, WifiOffIcon, MailIcon as HelpMailIcon, DownloadIcon,
} from './Icons.tsx';
import { PLANS, isPaidTier, type PlanTier } from '../lib/plans.ts';
import { SUPPORT_EMAIL } from '../lib/account.ts';
import { HelpCircleIcon } from './help/HelpText.tsx';
import { PipelineIcon } from './pipeline/PipelineIcon.tsx';
import NotificationBell from './notifications/NotificationBell.tsx';

export type NavDestination =
    | 'dashboard' | 'clients' | 'communication' | 'inventory' | 'pricebook' | 'calendar'
    | 'calculator' | 'analytics' | 'forum' | 'settings' | 'profile' | 'billing' | 'help'
    /** pipeline board (/pipeline) */
    | 'pipeline'
    /** Settings → Your data (export everything, bookkeeper CSV) */
    | 'export';

export type NavSection = 'dashboard' | 'clients' | 'communication' | 'tools' | 'forum' | 'settings' | 'none';

interface AppNavProps {
    active: NavSection;
    userName: string;
    userEmail?: string;
    avatarUrl?: string;
    plan: PlanTier;
    onNavigate: (dest: NavDestination) => void;
    onUpgrade: () => void;
    onLogout: () => void;
    /** Mobile center button (e.g. "New job" on the dashboard, "New document" on a job). */
    primaryAction?: { label: string; onClick: () => void };
    clientBadge?: number;
    /** Unread community notifications. */
    forumBadge?: number;
    lowStockCount?: number;
    isOnline: boolean;
    /** Show the mobile bottom tab bar (hidden on editors). */
    showTabBar: boolean;
}

const TOOLS: { dest: NavDestination; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; description: string }[] = [
    { dest: 'pipeline', label: 'Pipeline', icon: PipelineIcon, description: 'Every job by stage, from request to paid' },
    { dest: 'inventory', label: 'Inventory', icon: BoxIcon, description: 'Stock, QR tags and job allocations' },
    { dest: 'pricebook', label: 'Price book', icon: TagIcon, description: 'Saved items and assemblies' },
    { dest: 'calendar', label: 'Calendar', icon: CalendarIcon, description: 'Job schedule' },
    { dest: 'analytics', label: 'Insights', icon: BarChartIcon, description: 'Revenue and outstanding invoices' },
    { dest: 'calculator', label: 'Profit calculator', icon: CalculatorIcon, description: 'Price a job with your margin' },
];

// ---------------------------------------------------------------------------
// Mobile top-bar slots: on phones a page can show its title and quick actions in the app bar instead of an
// almost empty bar above its own header (e.g. the dashboard greeting and the AI button). Hidden from md up.
// ---------------------------------------------------------------------------
export type HeaderSlotName = 'title' | 'actions';
const slotEls: Record<HeaderSlotName, HTMLElement | null> = { title: null, actions: null };
const slotUsers: Record<HeaderSlotName, number> = { title: 0, actions: 0 };
const slotListeners = new Set<() => void>();
const notifySlots = () => slotListeners.forEach(l => l());
const subscribeSlots = (fn: () => void) => { slotListeners.add(fn); return () => { slotListeners.delete(fn); }; };
const slotRef = (name: HeaderSlotName) => (el: HTMLElement | null) => {
    if (slotEls[name] === el) return;
    slotEls[name] = el;
    notifySlots();
};
const titleSlotRef = slotRef('title');
const actionsSlotRef = slotRef('actions');

/** The element of a mobile app-bar slot, or null when the app bar isn't on screen. */
export const useHeaderSlot = (name: HeaderSlotName): HTMLElement | null =>
    useSyncExternalStore(subscribeSlots, () => slotEls[name], () => null);

/** Renders its children in the app bar on phones (nothing when the app bar isn't shown). */
export const MobileHeaderSlot: React.FC<{ name: HeaderSlotName; children: React.ReactNode }> = ({ name, children }) => {
    const el = useHeaderSlot(name);
    useEffect(() => {
        slotUsers[name] += 1;
        notifySlots();
        return () => { slotUsers[name] -= 1; notifySlots(); };
    }, [name]);
    return el ? createPortal(children, el) : null;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'U';

const Avatar: React.FC<{ name: string; url?: string; size?: 'sm' | 'md' }> = ({ name, url, size = 'sm' }) => {
    const [broken, setBroken] = useState(false);
    const cls = size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';
    if (url && !broken) {
        return <img src={url} alt="" onError={() => setBroken(true)} className={`${cls} shrink-0 rounded-full border border-border object-cover`} />;
    }
    return (
        <span className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary`} aria-hidden>
            {initials(name)}
        </span>
    );
};

const AppNav: React.FC<AppNavProps> = ({
    active, userName, userEmail, avatarUrl, plan, onNavigate, onUpgrade, onLogout, primaryAction,
    clientBadge = 0, forumBadge = 0, lowStockCount = 0, isOnline, showTabBar,
}) => {
    const [moreOpen, setMoreOpen] = useState(false);
    const paid = isPaidTier(plan);
    const hasPageTitle = useSyncExternalStore(subscribeSlots, () => slotUsers.title > 0, () => false);

    useEffect(() => {
        if (!moreOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [moreOpen]);

    const go = (dest: NavDestination) => { setMoreOpen(false); onNavigate(dest); };

    const linkCls = (section: NavSection) =>
        `relative inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition ${active === section ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`;

    const accountMenu = (
        <DropdownMenu
            asButton
            label="Account menu"
            menuClassName="w-64"
            trigger={
                <span className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-muted">
                    <Avatar name={userName} url={avatarUrl} />
                </span>
            }
        >
            <div className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={userName} url={avatarUrl} size="md" />
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{userName || 'Your account'}</p>
                    {userEmail && <p className="truncate text-xs text-muted-foreground">{userEmail}</p>}
                    <span className={`badge mt-1 ${paid ? 'badge-primary' : 'badge-muted'}`}>{PLANS[plan].name} plan</span>
                </div>
            </div>
            <DropdownSeparator />
            <DropdownItem onClick={() => onNavigate('profile')}><UserIcon className="h-4 w-4" /> Profile</DropdownItem>
            <DropdownItem onClick={() => onNavigate('settings')}><SettingsIcon className="h-4 w-4" /> Settings</DropdownItem>
            <DropdownItem onClick={() => onNavigate('billing')}><CreditCardIcon className="h-4 w-4" /> Plan &amp; billing</DropdownItem>
            <DropdownItem onClick={() => onNavigate('export')}><DownloadIcon className="h-4 w-4" /> Export my data</DropdownItem>
            {!paid &&<DropdownItem onClick={onUpgrade} className="text-primary"><StarIcon className="h-4 w-4" /> Upgrade</DropdownItem>}
            <DropdownItem onClick={() => onNavigate('help')}><HelpCircleIcon className="h-4 w-4" /> Help &amp; tutorials</DropdownItem>
            <DropdownItem onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}`; }}><HelpMailIcon className="h-4 w-4" /> Contact support</DropdownItem>
            <DropdownSeparator />
            <DropdownItem onClick={onLogout} destructive><LogoutIcon className="h-4 w-4" /> Log out</DropdownItem>
        </DropdownMenu>
    );

    const tabItems: DockItem[] = [
        { icon: HomeIcon, label: 'Home', onClick: () => go('dashboard'), active: active === 'dashboard' },
        { icon: UsersIcon, label: 'Clients', onClick: () => go('clients'), active: active === 'clients', badgeCount: clientBadge },
        ...(primaryAction ? [{ icon: PlusIcon, label: primaryAction.label, onClick: primaryAction.onClick, primary: true } as DockItem] : []),
        { icon: MailIcon, label: 'Messages', onClick: () => go('communication'), active: active === 'communication' },
        { icon: GridIcon, label: 'More', onClick: () => setMoreOpen(true), active: active === 'tools' || active === 'forum' || active === 'settings', badgeCount: lowStockCount + forumBadge },
    ];

    return (
        <>
            <header className="no-print sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-lg">
                <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:px-6 md:h-16 lg:px-8">
                    {/* the logo always shows (phones too); next to a page title it is icon-only */}
                    <button type="button" onClick={() => onNavigate('dashboard')} className={`flex shrink-0 items-center gap-2 rounded-xl ${hasPageTitle ? 'pr-1 md:pr-2' : 'pr-2'}`} aria-label="ContractorDocs home">
                        <AppLogo className="h-8 w-8" />
                        <span className={`text-base font-bold tracking-tight text-foreground ${hasPageTitle ? 'hidden md:inline' : 'inline'}`}>ContractorDocs</span>
                    </button>
                    {/* phones: the page's title (e.g. the dashboard greeting) */}
                    <div ref={titleSlotRef} className="min-w-0 flex-1 md:hidden" />

                    <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
                        <button type="button" className={linkCls('dashboard')} onClick={() => onNavigate('dashboard')}>
                            <HomeIcon className="h-4 w-4" /> Dashboard
                        </button>
                        <button type="button" className={linkCls('clients')} onClick={() => onNavigate('clients')}>
                            <UsersIcon className="h-4 w-4" /> Clients
                            {clientBadge > 0 && <span className="badge badge-danger px-1.5 py-0 text-[10px]">{clientBadge > 99 ? '99+' : clientBadge}</span>}
                        </button>
                        <button type="button" className={linkCls('communication')} onClick={() => onNavigate('communication')}>
                            <MailIcon className="h-4 w-4" /> Messages
                        </button>
                        <DropdownMenu
                            align="left"
                            menuClassName="w-72"
                            asButton
                            label="Tools"
                            trigger={
                                <span className={linkCls('tools')}>
                                    <GridIcon className="h-4 w-4" /> Tools
                                    {lowStockCount > 0 && <span className="badge badge-warning px-1.5 py-0 text-[10px]">{lowStockCount > 9 ? '9+' : lowStockCount}</span>}
                                    <ChevronDownIcon className="h-3.5 w-3.5 opacity-60" />
                                </span>
                            }
                        >
                            <DropdownLabel>Tools</DropdownLabel>
                            {TOOLS.map(tool => (
                                <DropdownItem key={tool.dest} onClick={() => onNavigate(tool.dest)}>
                                    <tool.icon className="h-4 w-4 shrink-0 text-primary" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-medium">{tool.label}</span>
                                        <span className="block truncate text-xs text-muted-foreground">{tool.description}</span>
                                    </span>
                                    {tool.dest === 'inventory' && lowStockCount > 0 && <span className="badge badge-warning">{lowStockCount} low</span>}
                                </DropdownItem>
                            ))}
                        </DropdownMenu>
                        <button type="button" className={linkCls('forum')} onClick={() => onNavigate('forum')}>
                            <MessageSquareIcon className="h-4 w-4" /> Community
                            {forumBadge > 0 && <span className="badge badge-danger px-1.5 py-0 text-[10px]">{forumBadge > 9 ? '9+' : forumBadge}</span>}
                        </button>
                    </nav>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                        {/* phones: the page's quick actions (e.g. the AI assistant on the dashboard) */}
                        <div ref={actionsSlotRef} className="flex items-center gap-2 empty:hidden md:hidden" />
                        {!isOnline && (
                            <span className="badge badge-warning" title="You're offline. Field documents and estimate / invoice drafts save on this device and sync when you reconnect.">
                                <WifiOffIcon className="h-3.5 w-3.5" /> Offline
                            </span>
                        )}
                        {!paid && (
                            <button type="button" onClick={onUpgrade} className="btn btn-sm btn-outline hidden border-primary/40 text-primary sm:inline-flex">
                                <StarIcon className="h-3.5 w-3.5" /> Upgrade
                            </button>
                        )}
                        {/* notifications (phones and computers): client signatures, payments, low stock, community… */}
                        <NotificationBell />
                        {accountMenu}
                    </div>
                </div>
            </header>

            {showTabBar && <Dock items={tabItems} />}

            {moreOpen && (
                <div className="modal-backdrop z-[60] md:hidden" onClick={() => setMoreOpen(false)} role="presentation">
                    <div className="modal-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-label="More" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-base font-bold">More</h2>
                            <button type="button" onClick={() => setMoreOpen(false)} className="rounded-xl p-2 text-muted-foreground hover:bg-muted" aria-label="Close">
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {[...TOOLS, { dest: 'forum' as NavDestination, label: 'Community', icon: MessageSquareIcon, description: '' }, { dest: 'settings' as NavDestination, label: 'Settings', icon: SettingsIcon, description: '' }, { dest: 'billing' as NavDestination, label: 'Billing', icon: CreditCardIcon, description: '' }].map(item => (
                                <button
                                    key={item.dest}
                                    type="button"
                                    onClick={() => go(item.dest)}
                                    className="relative flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-2 text-center text-xs font-medium text-foreground transition hover:bg-muted"
                                >
                                    <item.icon className="h-5 w-5 text-primary" />
                                    {item.label}
                                    {item.dest === 'inventory' && lowStockCount > 0 && (
                                        <span className="absolute right-2 top-2 badge badge-warning px-1.5 py-0 text-[10px]">{lowStockCount}</span>
                                    )}
                                    {item.dest === 'forum' && forumBadge > 0 && (
                                        <span className="absolute right-2 top-2 badge badge-danger px-1.5 py-0 text-[10px]">{forumBadge > 9 ? '9+' : forumBadge}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                        {!paid && (
                            <button type="button" onClick={() => { setMoreOpen(false); onUpgrade(); }} className="btn btn-primary mt-4 w-full">
                                <StarIcon className="h-4 w-4" /> Upgrade to Premium
                            </button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default AppNav;
