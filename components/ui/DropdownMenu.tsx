import React, { useState, useRef, useEffect, createContext, useContext } from 'react';

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
}

interface DropdownItemProps {
    onClick: (e: React.MouseEvent) => void;
    children: React.ReactNode;
    className?: string;
    destructive?: boolean;
    disabled?: boolean;
}

const CloseContext = createContext<() => void>(() => {});

export const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, children, align = 'right', side = 'bottom', menuClassName = '', label, asButton = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
            document.removeEventListener('keydown', handleKey);
        };
    }, [isOpen]);

    return (
        <div
            className="relative inline-block text-left"
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
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

            {isOpen && (
                <div
                    className={`absolute z-[100] min-w-[12rem] w-56 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lift animate-zoom-in
                        ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
                        ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'} ${menuClassName}`}
                >
                    <CloseContext.Provider value={() => setIsOpen(false)}>
                        <div className="p-1.5" role="menu" aria-orientation="vertical">
                            {children}
                        </div>
                    </CloseContext.Provider>
                </div>
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
