import * as React from 'react';
import { cn } from '../../lib/utils.ts';

interface EmptyStateProps {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}

/** Empty state: icon, one sentence and (optionally) one primary action. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, className }) => (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center', className)}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
        {action && <div className="mt-5">{action}</div>}
    </div>
);

export default EmptyState;
