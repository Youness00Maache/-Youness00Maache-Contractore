/**
 * Small pieces shared by the Integrations & data panels (Settings). Plain rows with a real state word and one action:
 * no icon-in-a-square cards. Design-system classes only (index.css), so light / dark / blue themes work.
 */
import React from 'react';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export type Tone = 'good' | 'warn' | 'bad' | 'quiet' | 'plain';

const TONE: Record<Tone, string> = {
    good: 'text-success',
    warn: 'text-warning',
    bad: 'text-destructive',
    quiet: 'text-muted-foreground',
    plain: 'text-foreground',
};

/** The state of a connection as one mono word with a dot ("CONNECTED"), the same voice as the Automations "Always on" label. */
export const StateTag: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
    <span className={cx('inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider', TONE[tone])}>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
        {children}
    </span>
);

/** Two or three exclusive choices as one pill (40px targets for a thumb). */
export const Segmented: React.FC<{
    label: string;
    value: string;
    options: ReadonlyArray<{ value: string; text: React.ReactNode }>;
    onChange: (value: string) => void;
    className?: string;
}> = ({ label, value, options, onChange, className }) => (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex max-w-full rounded-xl bg-muted p-0.5', className)}>
        {options.map((o) => (
            <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={o.value === value}
                onClick={() => onChange(o.value)}
                className={cx(
                    'min-h-[40px] whitespace-nowrap rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    o.value === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
            >
                {o.text}
            </button>
        ))}
    </div>
);

/** A labelled group of controls: small caps label above, the controls below. */
export const Group: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
    <div className={className}>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {children}
        {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
);

/** A note that belongs to the numbers above it (a left rule, not a tinted card). */
export const Note: React.FC<{ tone?: 'info' | 'warn'; children: React.ReactNode; className?: string }> = ({ tone = 'info', children, className }) => (
    <p className={cx('border-l-2 py-0.5 pl-3 text-xs leading-relaxed text-muted-foreground', tone === 'warn' ? 'border-warning' : 'border-border', className)}>{children}</p>
);

export const Spinner: React.FC = () => <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
