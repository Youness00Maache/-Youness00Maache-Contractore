import React, { useState, useRef, useEffect } from 'react';

interface DropdownMenuProps {
    trigger: React.ReactNode;
    children: React.ReactNode;
    align?: 'left' | 'right';
}

interface DropdownItemProps {
    onClick: (e: React.MouseEvent) => void;
    children: React.ReactNode;
    className?: string;
    destructive?: boolean;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, children, align = 'right' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative inline-block text-left" ref={menuRef}>
            <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
                {trigger}
            </div>

            {isOpen && (
                <div
                    className={`absolute z-50 mt-2 w-48 rounded-md shadow-lg bg-popover border border-border ring-1 ring-black ring-opacity-5 focus:outline-none animate-in fade-in zoom-in-95 duration-100 ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
                        }`}
                >
                    <div className="py-1" role="menu" aria-orientation="vertical">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};

export const DropdownItem: React.FC<DropdownItemProps> = ({ onClick, children, className = '', destructive = false }) => {
    return (
        <button
            onClick={(e) => {
                onClick(e);
            }}
            className={`group flex w-full items-center px-4 py-2 text-sm text-left transition-colors
        ${destructive
                    ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10'
                    : 'text-foreground hover:bg-secondary'
                } ${className}`}
            role="menuitem"
        >
            {children}
        </button>
    );
};
