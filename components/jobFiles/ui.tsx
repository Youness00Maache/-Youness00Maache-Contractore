/**
 * Tiny pieces shared by the Files and Questions tabs (components/jobFiles/*, components/questions/*).
 */
import React from 'react';
import { cx } from '../commsKit.tsx';
import type { StatusTone } from '../../lib/questions/questionView.ts';

/** On / off switch with a title and a line under it (same look as "Show in client portal" on the punch list). */
export const SwitchRow: React.FC<{
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    hint?: React.ReactNode;
    disabled?: boolean;
    busy?: boolean;
    className?: string;
}> = ({ checked, onChange, label, hint, disabled, busy, className }) => (
    <label className={cx('flex cursor-pointer items-center justify-between gap-3 text-sm', (disabled || busy) && 'cursor-not-allowed opacity-60', className)}>
        <span className="min-w-0">
            <span className="font-medium">{label}</span>
            {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
        </span>
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled || busy} onChange={e => onChange(e.target.checked)} aria-label={label} />
        <span className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring', checked ? 'bg-primary' : 'bg-muted-foreground/30')} aria-hidden>
            <span className={cx('absolute h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
        </span>
    </label>
);

const TONE_CLASS: Record<StatusTone, string> = {
    primary: 'badge-primary',
    warning: 'badge-warning',
    success: 'badge-success',
    danger: 'badge-danger',
    muted: 'badge-muted',
};

/** A status word as a small pill. */
export const StatusChip: React.FC<{ tone: StatusTone; children: React.ReactNode; className?: string }> = ({ tone, children, className }) => (
    <span className={cx('badge', TONE_CLASS[tone], className)}>{children}</span>
);

/** The little type mark in front of a file row: PDF, JPG, LINK (a letter stamp, not an icon). */
export const TypeStamp: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
    <span
        aria-hidden
        className={cx(
            'flex h-10 w-11 shrink-0 items-center justify-center rounded-md border text-[10px] font-extrabold tracking-wider',
            text === 'LINK' ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground',
            className,
        )}
    >
        {text}
    </span>
);
