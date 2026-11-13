import * as React from 'react';
import { BackArrowIcon } from '../Icons.tsx';

interface PageHeaderProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    onBack?: () => void;
    backLabel?: string;
}

/** Consistent page header: optional back button, title + subtitle on the left, actions on the right. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, onBack, backLabel = 'Back' }) => (
    <div className="page-header">
        <div className="flex min-w-0 items-start gap-2">
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    aria-label={backLabel}
                    className="-ml-2 mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                    <BackArrowIcon className="h-5 w-5" />
                </button>
            )}
            <div className="min-w-0">
                <h1 className="page-title truncate">{title}</h1>
                {subtitle && <div className="page-subtitle">{subtitle}</div>}
            </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
);

export default PageHeader;
