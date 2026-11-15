/**
 * Stars, shared by the client feedback page, the owner's feedback list and the public profile (components/profile).
 *   <StarsDisplay value={4.8} size={16} />   read-only, partly filled for averages (4.8 fills 96%), one image for screen readers
 *   <StarPicker value onChange labels />     the big 1-5 picker: radio group, tap / click, arrows + Home / End + 1-5 keys,
 *                                            a hover preview with a mouse, 56 px touch targets
 * Colors come from the theme tokens (warning = star yellow), so light and dark both work. No images, no libraries.
 */
import React, { useRef, useState } from 'react';
import { STAR_VALUES, nextStarValue, ratingAria, shownStars, tabbableStar } from '../../lib/feedback/feedbackUi.ts';

const STAR_POINTS = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26';

const Star: React.FC<{ size: number }> = ({ size }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" className="shrink-0">
        <polygon points={STAR_POINTS} />
    </svg>
);

export const StarsDisplay: React.FC<{ value: number | null | undefined; size?: number; className?: string; label?: string }> = ({ value, size = 16, className = '', label }) => {
    const v = typeof value === 'number' && value > 0 ? Math.min(5, value) : 0;
    return (
        <span role="img" aria-label={label || ratingAria(v ? Math.round(v * 10) / 10 : null)} className={`relative inline-flex shrink-0 align-middle ${className}`}>
            <span className="inline-flex text-muted-foreground/30" aria-hidden="true">{STAR_VALUES.map(i => <Star key={i} size={size} />)}</span>
            <span className="absolute inset-y-0 left-0 inline-flex overflow-hidden text-warning" style={{ width: `${(v / 5) * 100}%` }} aria-hidden="true">
                {STAR_VALUES.map(i => <Star key={i} size={size} />)}
            </span>
        </span>
    );
};

export const StarPicker: React.FC<{
    value: number | null;
    onChange: (rating: number) => void;
    /** one short word per star (1 to 5), shown to screen readers as "3 stars, Good" */
    labels?: readonly string[];
    ariaLabel: string;
    starWord?: (n: number) => string;
    disabled?: boolean;
}> = ({ value, onChange, labels, ariaLabel, starWord = (n) => `${n} ${n === 1 ? 'star' : 'stars'}`, disabled }) => {
    const [hover, setHover] = useState<number | null>(null);
    const refs = useRef<Array<HTMLButtonElement | null>>([]);
    const shown = shownStars(value, hover);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
        const next = nextStarValue(value, e.key);
        if (next === null) return;
        e.preventDefault();
        onChange(next);
        refs.current[next - 1]?.focus();
    };

    return (
        <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex w-full max-w-[22rem] justify-between gap-1" onPointerLeave={() => setHover(null)}>
            {STAR_VALUES.map(n => {
                const on = n <= shown;
                const checked = value === n;
                return (
                    <button
                        key={n}
                        ref={el => { refs.current[n - 1] = el; }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={labels?.[n - 1] ? `${starWord(n)}, ${labels[n - 1]}` : starWord(n)}
                        tabIndex={n === tabbableStar(value) ? 0 : -1}
                        disabled={disabled}
                        onClick={() => onChange(n)}
                        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(n); }}
                        className={`flex h-14 min-w-0 flex-1 items-center justify-center rounded-2xl transition duration-150 active:scale-90 disabled:opacity-60 ${on ? 'text-warning' : 'text-muted-foreground/30 hover:text-warning/60'} ${checked ? 'scale-110' : ''}`}
                    >
                        <Star size={44} />
                    </button>
                );
            })}
        </div>
    );
};
