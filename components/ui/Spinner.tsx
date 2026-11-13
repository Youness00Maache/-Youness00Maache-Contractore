import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export const Spinner: React.FC<{ className?: string; label?: string }> = ({ className, label = 'Loading' }) => (
    <span role="status" aria-label={label} className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-r-transparent', className)} />
);

export default Spinner;
