import React from 'react';

type DockIconButtonProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  onClick?: () => void;
};

const DockIconButton: React.FC<DockIconButtonProps> = ({ icon: Icon, label, onClick }) => (
    <div className="relative group">
        <button
            onClick={onClick}
            className="p-3 rounded-lg hover:bg-secondary transition-colors"
        >
            <Icon className="w-6 h-6 text-foreground" />
        </button>
        <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs bg-popover text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {label}
        </span>
    </div>
);

type DockProps = {
  items: {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    label: string;
    onClick?: () => void;
  }[];
};

const Dock: React.FC<DockProps> = ({ items }) => {
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center justify-center p-2">
                <div className="flex items-center gap-2 p-2 rounded-2xl backdrop-blur-lg border shadow-lg bg-background/80 border-border animate-float">
                    {items.map((item) => (
                        <DockIconButton key={item.label} {...item} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Dock;
