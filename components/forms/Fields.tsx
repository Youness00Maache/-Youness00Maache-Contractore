import React, { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/utils.ts';
import { toNumber } from '../../utils/money.ts';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export const FormSection: React.FC<{
    title: string;
    description?: React.ReactNode;
    icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    actions?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}> = ({ title, description, icon: Icon, actions, className, children }) => (
    <section className={cn('card card-pad space-y-5', className)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
                {Icon && (
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                    </div>
                )}
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground">{title}</h2>
                    {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
                </div>
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
    </section>
);

export const FieldGrid: React.FC<{ className?: string; cols?: 2 | 3; children: React.ReactNode }> = ({ className, cols = 2, children }) => (
    <div className={cn('grid grid-cols-1 gap-4', cols === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2', className)}>{children}</div>
);

export const Field: React.FC<{
    label: React.ReactNode;
    htmlFor?: string;
    hint?: React.ReactNode;
    error?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}> = ({ label, htmlFor, hint, error, className, children }) => (
    <div className={cn('min-w-0', className)}>
        <label htmlFor={htmlFor} className="label">{label}</label>
        {children}
        {error ? (
            <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>
        ) : hint ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
    </div>
);

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
type BaseInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>;

export const TextField: React.FC<BaseInputProps & {
    label: React.ReactNode;
    value: string | undefined | null;
    onChange: (value: string) => void;
    hint?: React.ReactNode;
    error?: React.ReactNode;
    fieldClassName?: string;
}> = ({ label, value, onChange, hint, error, fieldClassName, className, id, type = 'text', ...rest }) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
        <Field label={label} htmlFor={inputId} hint={hint} error={error} className={fieldClassName}>
            <input
                id={inputId}
                type={type}
                className={cn('input', error && 'border-destructive', className)}
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                {...rest}
            />
        </Field>
    );
};

export const TextAreaField: React.FC<Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
    label: React.ReactNode;
    value: string | undefined | null;
    onChange: (value: string) => void;
    hint?: React.ReactNode;
    fieldClassName?: string;
}> = ({ label, value, onChange, hint, fieldClassName, className, id, rows = 4, ...rest }) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
        <Field label={label} htmlFor={inputId} hint={hint} className={fieldClassName}>
            <textarea
                id={inputId}
                rows={rows}
                className={cn('input min-h-[96px] resize-y leading-relaxed', className)}
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                {...rest}
            />
        </Field>
    );
};

export type SelectOption = string | { value: string; label: string };

export const SelectField: React.FC<Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
    label: React.ReactNode;
    value: string | undefined | null;
    options: readonly SelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    hint?: React.ReactNode;
    fieldClassName?: string;
}> = ({ label, value, options, onChange, placeholder, hint, fieldClassName, className, id, ...rest }) => {
    const autoId = useId();
    const inputId = id || autoId;
    const normalized = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));
    const current = value ?? '';
    const hasCurrent = !current || normalized.some(o => o.value === current);
    return (
        <Field label={label} htmlFor={inputId} hint={hint} className={fieldClassName}>
            <select id={inputId} className={cn('input pr-8', className)} value={current} onChange={e => onChange(e.target.value)} {...rest}>
                {placeholder !== undefined && <option value="">{placeholder}</option>}
                {!hasCurrent && <option value={current}>{current}</option>}
                {normalized.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </Field>
    );
};

export const DateField: React.FC<BaseInputProps & {
    label: React.ReactNode;
    value: string | undefined | null;
    onChange: (value: string) => void;
    hint?: React.ReactNode;
    error?: React.ReactNode;
    fieldClassName?: string;
}> = props => <TextField {...props} type="date" />;

// ---------------------------------------------------------------------------
// Numbers: free typing (empty allowed while typing), parsed on every change, normalized on blur.
// The value passed to onValueChange is always a finite number (never NaN).
// ---------------------------------------------------------------------------
const formatNumber = (n: number, decimals?: number) => {
    if (!Number.isFinite(n)) return '';
    if (decimals === undefined) return String(n);
    return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
};

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
    value: number | string | null | undefined;
    onValueChange: (value: number) => void;
    min?: number;
    max?: number;
    /** decimals shown after blur (2 for money) */
    decimals?: number;
    allowNegative?: boolean;
    prefix?: string;
    suffix?: string;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(({
    value, onValueChange, min = 0, max, decimals, allowNegative = false, prefix, suffix, className, onBlur, onFocus, ...rest
}, ref) => {
    const numeric = toNumber(value);
    const [text, setText] = useState(() => (value === null || value === undefined || value === '' ? '' : formatNumber(numeric, decimals)));
    const focused = useRef(false);

    // follow external changes (AI prefill, picker) while not typing
    useEffect(() => {
        if (focused.current) return;
        const shown = text.trim() === '' ? null : toNumber(text);
        if (value === null || value === undefined || value === '') {
            if (shown !== null && shown !== 0) setText('');
            return;
        }
        if (shown !== numeric) setText(formatNumber(numeric, decimals));
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const clampValue = (n: number) => {
        let v = n;
        if (!allowNegative && min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        return v;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let raw = e.target.value.replace(',', '.');
        raw = raw.replace(allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g, '');
        // keep a single dot and a leading minus only
        const parts = raw.split('.');
        if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
        if (allowNegative) raw = raw.replace(/(?!^)-/g, '');
        setText(raw);
        const parsed = raw === '' || raw === '-' || raw === '.' ? 0 : toNumber(raw);
        onValueChange(clampValue(parsed));
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        focused.current = false;
        const parsed = text.trim() === '' || text === '-' || text === '.' ? 0 : toNumber(text);
        const clamped = clampValue(parsed);
        setText(formatNumber(clamped, decimals));
        if (clamped !== numeric) onValueChange(clamped);
        onBlur?.(e);
    };

    const input = (
        <input
            ref={ref}
            type="text"
            inputMode={decimals === 0 ? 'numeric' : 'decimal'}
            autoComplete="off"
            className={cn('input tabular-nums', prefix && 'pl-7', suffix && 'pr-8', className)}
            value={text}
            onChange={handleChange}
            onFocus={e => { focused.current = true; e.currentTarget.select(); onFocus?.(e); }}
            onBlur={handleBlur}
            {...rest}
        />
    );
    if (!prefix && !suffix) return input;
    return (
        <div className="relative">
            {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
            {input}
            {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
        </div>
    );
});
NumberInput.displayName = 'NumberInput';

export const NumberField: React.FC<NumberInputProps & {
    label: React.ReactNode;
    hint?: React.ReactNode;
    fieldClassName?: string;
}> = ({ label, hint, fieldClassName, id, ...rest }) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
        <Field label={label} htmlFor={inputId} hint={hint} className={fieldClassName}>
            <NumberInput id={inputId} {...rest} />
        </Field>
    );
};

export const MoneyField: React.FC<NumberInputProps & { label: React.ReactNode; hint?: React.ReactNode; fieldClassName?: string; currencySymbol?: string }> = ({
    currencySymbol = '$', ...rest
}) => <NumberField prefix={currencySymbol} decimals={2} {...rest} />;

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------
export const Toggle: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: React.ReactNode;
    description?: React.ReactNode;
    disabled?: boolean;
    id?: string;
}> = ({ checked, onChange, label, description, disabled, id }) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
        <label htmlFor={inputId} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/50 p-3', disabled && 'cursor-not-allowed opacity-60')}>
            <span className="relative mt-0.5 inline-flex shrink-0">
                <input
                    id={inputId}
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    disabled={disabled}
                    onChange={e => onChange(e.target.checked)}
                />
                <span className="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform peer-checked:translate-x-5" />
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{label}</span>
                {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
            </span>
        </label>
    );
};

/** Segmented control (e.g. Standard / Progress billing). */
export const Segmented: React.FC<{
    value: string;
    options: { value: string; label: React.ReactNode }[];
    onChange: (value: string) => void;
    ariaLabel?: string;
}> = ({ value, options, onChange, ariaLabel }) => (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-xl border border-border bg-muted p-1">
        {options.map(o => (
            <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={value === o.value}
                onClick={() => onChange(o.value)}
                className={cn(
                    'min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors',
                    value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
            >
                {o.label}
            </button>
        ))}
    </div>
);

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
export const TagsField: React.FC<{
    label: React.ReactNode;
    value: string[] | undefined;
    onChange: (tags: string[]) => void;
    placeholder?: string;
    hint?: React.ReactNode;
}> = ({ label, value, onChange, placeholder = 'Type a tag and press Enter', hint }) => {
    const id = useId();
    const [draft, setDraft] = useState('');
    const tags = value || [];
    const add = (raw: string) => {
        const parts = raw.split(',').map(t => t.trim()).filter(Boolean);
        if (!parts.length) return;
        const next = Array.from(new Set([...tags, ...parts]));
        if (next.length !== tags.length) onChange(next);
        setDraft('');
    };
    return (
        <Field label={label} htmlFor={id} hint={hint}>
            <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border border-input bg-card px-2 py-1.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                {tags.map(t => (
                    <span key={t} className="badge badge-primary gap-1">
                        {t}
                        <button type="button" className="-mr-1 rounded-full px-1 leading-none opacity-70 hover:opacity-100" onClick={() => onChange(tags.filter(x => x !== t))} aria-label={`Remove tag ${t}`}>×</button>
                    </span>
                ))}
                <input
                    id={id}
                    className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                    value={draft}
                    placeholder={tags.length ? '' : placeholder}
                    onChange={e => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); add(draft); }
                        else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
                    }}
                    onBlur={() => add(draft)}
                />
            </div>
        </Field>
    );
};
