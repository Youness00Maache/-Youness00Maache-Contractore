import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
    trigger: React.ReactNode;
    children: React.ReactNode;
    align?: 'left' | 'right';
    side?: 'top' | 'bottom';
    /** Extra classes for the menu panel (e.g. width). */
    menuClassName?: string;
    /** Accessible label when the trigger has no text. */
    label?: string;
    /** Wrap the trigger in a real <button> (use when the trigger is plain markup, not a Button). */
    asButton?: boolean;
    /**
     * Render the panel in a portal on <body> with fixed positioning, above everything on the page. Use it inside
     * cards and grids: a card that moves on hover (transform) starts its own stacking context, so an in-place menu
     * would open UNDER the next card and its clicks would land on that card.
     */
    portal?: boolean;
}

interface DropdownItemProps {
    onClick: (e: React.MouseEvent) => void;
    children: React.ReactNode;
    className?: string;
    destructive?: boolean;
    disabled?: boolean;
}

const CloseContext = createContext<() => void>(() => {});

const GAP = 8;
const EDGE = 8;

export const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, children, align = 'right', side = 'bottom', menuClassName = '', label, asButton = false, portal = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<React.CSSProperties | null>(null);

    /** Fixed position next to the trigger; flips above it when there is no room below (portal mode). */
    const place = useCallback(() => {
        const anchor = menuRef.current;
        if (!anchor) return;
        const r = anchor.getBoundingClientRect();
        const panelH = panelRef.current?.offsetHeight ?? 0;
        const vh = window.innerHeight;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const roomBelow = vh - r.bottom - GAP - EDGE;
        const roomAbove = r.top - GAP - EDGE;
        const above = side === 'top' ? !(roomAbove < panelH && roomBelow > roomAbove) : (panelH > roomBelow && roomAbove > roomBelow);
        const next: React.CSSProperties = { position: 'fixed' };
        if (above) next.bottom = Math.max(EDGE, vh - r.top + GAP);
        else next.top = Math.max(EDGE, r.bottom + GAP);
        if (align === 'right') next.right = Math.max(EDGE, vw - r.right);
        else next.left = Math.max(EDGE, r.left);
        next.maxHeight = Math.max(160, above ? roomAbove : roomBelow);
        setPos(next);
    }, [align, side]);

    useLayoutEffect(() => {
        if (!portal || !isOpen) { setPos(null); return; }
        place();
        // second pass once the panel has its real height (decides above/below)
        const raf = requestAnimationFrame(place);
        return () => cancelAnimationFrame(raf);
    }, [portal, isOpen, place]);

    useEffect(() => {
        if (!isOpen) return;
        const inside = (target: EventTarget | null) => {
            const node = target as Node | null;
            return !!node && (!!menuRef.current?.contains(node) || !!panelRef.current?.contains(node));
        };
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (!inside(event.target)) setIsOpen(false);
        };
        const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
        // A fixed panel would drift away from its trigger while the page scrolls: follow it (or close on resize).
        const handleScroll = (event: Event) => { if (portal && !inside(event.target)) place(); };
        const handleResize = () => { if (portal) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        document.addEventListener('keydown', handleKey);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleResize);
        };
    }, [isOpen, portal, place]);

    // Clicks/keys inside the panel never reach the card around the menu. (React events bubble through portals
    // along the component tree, so the wrapper's handlers below also cover the portal panel.) Only `click` is
    // stopped: `mousedown` must still reach the document so other open menus close.
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    const panelBody = (
        <CloseContext.Provider value={() => setIsOpen(false)}>
            <div className="p-1.5" role="menu" aria-orientation="vertical">
                {children}
            </div>
        </CloseContext.Provider>
    );

    return (
        <div
            className="relative inline-block text-left"
            ref={menuRef}
            onClick={stop}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
        >
            {asButton ? (
                <button
                    type="button"
                    onClick={() => setIsOpen(o => !o)}
                    className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-label={label}
                >
                    {trigger}
                </button>
            ) : (
                <div
                    onClick={() => setIsOpen(o => !o)}
                    className="cursor-pointer"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-label={label}
                >
                    {trigger}
                </div>
            )}

            {isOpen && !portal && (
                <div
                    className={`absolute z-[100] min-w-[12rem] w-56 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lift animate-zoom-in
                        ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
                        ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'} ${menuClassName}`}
                >
                    {panelBody}
                </div>
            )}

            {isOpen && portal && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    style={pos ?? { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
                    className={`z-[105] min-w-[12rem] w-56 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-lift animate-zoom-in
                        ${align === 'right' ? 'origin-top-right' : 'origin-top-left'} ${menuClassName}`}
                >
                    {panelBody}
                </div>,
                document.body,
            )}
        </div>
    );
};

export const DropdownItem: React.FC<DropdownItemProps> = ({ onClick, children, className = '', destructive = false, disabled = false }) => {
    const close = useContext(CloseContext);
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation();
                close();
                onClick(e);
            }}
            className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50
        ${destructive ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-muted'} ${className}`}
            role="menuitem"
        >
            {children}
        </button>
    );
};

export const DropdownSeparator: React.FC = () => <div className="my-1 h-px bg-border" role="separator" />;

export const DropdownLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>
);
