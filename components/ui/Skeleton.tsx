import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
    <div aria-hidden className={cn('skeleton', className)} />
);

/** Generic page placeholder used while a lazy screen or data is loading (never a blank screen). */
export const PageSkeleton: React.FC<{ rows?: number; label?: string }> = ({ rows = 6, label = 'Loading' }) => (
    <div className="page" role="status" aria-live="polite" aria-label={label}>
        <div className="mb-6 flex items-end justify-between gap-4">
            <div className="space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64 max-w-[60vw]" />
            </div>
            <Skeleton className="hidden h-10 w-32 rounded-xl sm:block" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="card card-pad space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                </div>
            ))}
        </div>
        <span className="sr-only">{label}...</span>
    </div>
);

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
    <div className="space-y-3" aria-hidden>
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="card flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
            </div>
        ))}
    </div>
);

export default Skeleton;
