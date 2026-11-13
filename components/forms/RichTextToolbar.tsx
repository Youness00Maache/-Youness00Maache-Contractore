import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils.ts';
import {
    AlignCenterIcon, AlignLeftIcon, AlignRightIcon, BoldIcon, ChevronDownIcon, FontIcon, HighlighterIcon, IndentIcon, ItalicIcon,
    LinkIcon, ListIcon, ListOrderedIcon, MinusIcon, OutdentIcon, RedoIcon, RemoveFormatIcon, StrikethroughIcon, TableIcon,
    TextColorIcon, TextSizeIcon, UnderlineIcon, UndoIcon, UploadImageIcon,
} from '../Icons.tsx';

export type BlockStyle = 'p' | 'h1' | 'h2' | 'h3' | 'blockquote';
export type Align = 'left' | 'center' | 'right' | 'justify';

export interface EditorActiveState {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    block: BlockStyle;
    list: 'ul' | 'ol' | 'check' | null;
    align: Align;
    link: boolean;
}

export const EMPTY_ACTIVE: EditorActiveState = { bold: false, italic: false, underline: false, strike: false, block: 'p', list: null, align: 'left', link: false };

export type EditorCommand =
    | { type: 'undo' } | { type: 'redo' }
    | { type: 'block'; value: BlockStyle }
    | { type: 'inline'; value: 'bold' | 'italic' | 'underline' | 'strikeThrough' }
    | { type: 'color'; value: string }
    | { type: 'highlight'; value: string }
    | { type: 'font'; value: string }
    | { type: 'size'; value: number }
    | { type: 'list'; value: 'ul' | 'ol' | 'check' }
    | { type: 'indent'; value: 1 | -1 }
    | { type: 'align'; value: Align }
    | { type: 'link' } | { type: 'table' } | { type: 'hr' } | { type: 'clear' } | { type: 'image' };

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');
const MOD = isMac ? '⌘' : 'Ctrl+';
const ALT = isMac ? '⌥' : 'Alt+';
const SHIFT = isMac ? '⇧' : 'Shift+';

const BLOCKS: { value: BlockStyle; label: string; className: string; keys: string }[] = [
    { value: 'p', label: 'Normal text', className: 'text-sm', keys: `${MOD}${ALT}0` },
    { value: 'h1', label: 'Heading 1', className: 'text-xl font-bold', keys: `${MOD}${ALT}1` },
    { value: 'h2', label: 'Heading 2', className: 'text-lg font-bold', keys: `${MOD}${ALT}2` },
    { value: 'h3', label: 'Heading 3', className: 'text-base font-bold', keys: `${MOD}${ALT}3` },
    { value: 'blockquote', label: 'Quote', className: 'text-sm italic text-muted-foreground', keys: '' },
];

const TEXT_COLORS = [
    '#000000', '#374151', '#6b7280', '#9ca3af', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#1e40af', '#7c3aed', '#db2777', '#78350f',
    '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#351c75', '#741b47',
];
const HIGHLIGHTS = ['#fef08a', '#fde68a', '#fed7aa', '#fecaca', '#fbcfe8', '#e9d5ff', '#bfdbfe', '#a5f3fc', '#bbf7d0', '#d9f99d', '#e5e7eb'];

const FONT_SIZES = [{ label: 'Small', value: 2 }, { label: 'Normal', value: 3 }, { label: 'Large', value: 5 }, { label: 'Huge', value: 7 }];

const FONTS = [
    { name: 'Default', family: 'Inter, ui-sans-serif, system-ui, sans-serif' },
    { name: 'Serif', family: 'Georgia, "Times New Roman", serif' },
    { name: 'Mono', family: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
    ...[
        'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Raleway', 'Poppins', 'Nunito', 'Rubik', 'Work Sans', 'Quicksand',
        'Karla', 'Droid Sans', 'Fira Sans', 'Cabin', 'Josefin Sans', 'Anton', 'Ubuntu', 'Bebas Neue', 'Space Grotesk', 'DM Sans',
    ].map(name => ({ name, family: `${name}, sans-serif` })),
    ...['Merriweather', 'Playfair Display', 'PT Serif', 'Arvo', 'Bitter', 'Libre Baskerville', 'Crimson Text', 'Old Standard TT', 'Cormorant Garamond', 'EB Garamond']
        .map(name => ({ name, family: `${name}, serif` })),
    ...['Abril Fatface', 'Pacifico', 'Lobster', 'Shadows Into Light Two', 'Indie Flower', 'Dancing Script', 'Amatic SC', 'Righteous', 'Comfortaa', 'Bangers', 'Permanent Marker', 'Alfa Slab One', 'Patrick Hand']
        .map(name => ({ name, family: `${name}, cursive` })),
    ...['Inconsolata', 'Space Mono', 'Source Code Pro', 'JetBrains Mono'].map(name => ({ name, family: `${name}, monospace` })),
];

// small icons the shared icon set doesn't have
const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const AlignJustifyIcon = (p: React.SVGProps<SVGSVGElement>) => <svg {...svgProps} {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
const ChecklistIcon = (p: React.SVGProps<SVGSVGElement>) => <svg {...svgProps} {...p}><rect x="3" y="4" width="6" height="6" rx="1" /><path d="m4.5 7 1 1 2-2" /><rect x="3" y="14" width="6" height="6" rx="1" /><path d="M13 7h8M13 17h8" /></svg>;

const preventFocusLoss = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault();

const buttonClass = (active?: boolean) => cn(
    'flex h-9 min-w-[36px] shrink-0 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
    active ? 'border-primary/30 bg-primary/15 text-primary' : 'border-transparent bg-transparent text-foreground hover:bg-muted',
);

const ToolButton: React.FC<{
    label: string; keys?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; toggle?: boolean;
}> = ({ label, keys, active, disabled, onClick, children, toggle }) => (
    <button
        type="button"
        className={buttonClass(active)}
        onMouseDown={preventFocusLoss}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={toggle ? Boolean(active) : undefined}
        title={keys ? `${label} (${keys})` : label}
    >
        {children}
    </button>
);

/** A toolbar dropdown rendered in a portal (fixed position), so the scrollable toolbar never clips it. */
const MenuButton: React.FC<{
    label: string;
    trigger: React.ReactNode;
    width?: number;
    active?: boolean;
    children: (close: () => void) => React.ReactNode;
}> = ({ label, trigger, width = 200, active, children }) => {
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const close = useCallback(() => setPos(null), []);
    const open = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (!r) return;
        const w = Math.min(width, window.innerWidth - 16);
        setPos({ top: Math.round(r.bottom + 4), left: Math.round(Math.max(8, Math.min(r.left, window.innerWidth - w - 8))) });
    };
    useEffect(() => {
        if (!pos) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
        };
        const onScroll = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) close(); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        window.addEventListener('pointerdown', onDown, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', close);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('keydown', onKey);
        };
    }, [pos, close]);
    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={buttonClass(active || Boolean(pos))}
                onMouseDown={preventFocusLoss}
                onClick={() => (pos ? close() : open())}
                aria-haspopup="menu"
                aria-expanded={Boolean(pos)}
                aria-label={label}
                title={label}
            >
                {trigger}
            </button>
            {pos && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    role="menu"
                    aria-label={label}
                    onMouseDown={preventFocusLoss}
                    className="fixed z-[120] max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lift"
                    style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16) }}
                >
                    {children(close)}
                </div>,
                document.body,
            )}
        </>
    );
};

const MenuItem: React.FC<{ onPick: () => void; active?: boolean; children: React.ReactNode; className?: string; style?: React.CSSProperties; hint?: string }> = ({
    onPick, active, children, className, style, hint,
}) => (
    <button
        type="button"
        role="menuitem"
        onMouseDown={preventFocusLoss}
        onClick={onPick}
        className={cn('flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted', active && 'bg-primary/10 text-primary', className)}
        style={style}
    >
        <span className="truncate">{children}</span>
        {hint && <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>}
    </button>
);

const Swatches: React.FC<{ colors: string[]; onPick: (c: string) => void; noneLabel?: string; onNone?: () => void }> = ({ colors, onPick, noneLabel, onNone }) => (
    <div className="p-1">
        <div className="grid grid-cols-7 gap-1.5">
            {colors.map(c => (
                <button
                    key={c}
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => onPick(c)}
                    className="h-7 w-7 rounded-full border border-border transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                    title={c}
                />
            ))}
        </div>
        {noneLabel && onNone && (
            <button type="button" onMouseDown={preventFocusLoss} onClick={onNone} className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted">{noneLabel}</button>
        )}
    </div>
);

const Divider = () => <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden="true" />;

/**
 * Formatting toolbar of the rich text editor. Every control keeps the editor's selection (no focus steal), so
 * formatting always applies to the selected text, on desktop and on phones.
 */
const RichTextToolbar: React.FC<{
    active: EditorActiveState;
    canUndo: boolean;
    canRedo: boolean;
    onCommand: (cmd: EditorCommand) => void;
}> = ({ active, canUndo, canRedo, onCommand }) => {
    const blockLabel = BLOCKS.find(b => b.value === active.block)?.label || 'Normal text';
    return (
        <div className="flex items-center gap-1 overflow-x-auto p-1.5 sm:flex-wrap" role="toolbar" aria-label="Text formatting">
            <ToolButton label="Undo" keys={`${MOD}Z`} disabled={!canUndo} onClick={() => onCommand({ type: 'undo' })}><UndoIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Redo" keys={isMac ? `${SHIFT}${MOD}Z` : `${MOD}Y`} disabled={!canRedo} onClick={() => onCommand({ type: 'redo' })}><RedoIcon className="h-4 w-4" /></ToolButton>
            <Divider />

            <MenuButton label="Paragraph style" width={220} trigger={<><span className="w-[84px] truncate text-left">{blockLabel}</span><ChevronDownIcon className="h-3 w-3 opacity-60" /></>}>
                {close => BLOCKS.map(b => (
                    <MenuItem key={b.value} active={active.block === b.value} className={b.className} hint={b.keys} onPick={() => { onCommand({ type: 'block', value: b.value }); close(); }}>{b.label}</MenuItem>
                ))}
            </MenuButton>
            <MenuButton label="Font" width={220} trigger={<><FontIcon className="h-4 w-4" /><ChevronDownIcon className="h-3 w-3 opacity-60" /></>}>
                {close => FONTS.map(f => (
                    <MenuItem key={f.name} style={{ fontFamily: f.family }} onPick={() => { onCommand({ type: 'font', value: f.family }); close(); }}>{f.name}</MenuItem>
                ))}
            </MenuButton>
            <MenuButton label="Text size" width={160} trigger={<><TextSizeIcon className="h-4 w-4" /><ChevronDownIcon className="h-3 w-3 opacity-60" /></>}>
                {close => FONT_SIZES.map(s => (
                    <MenuItem key={s.value} onPick={() => { onCommand({ type: 'size', value: s.value }); close(); }}>{s.label}</MenuItem>
                ))}
            </MenuButton>
            <Divider />

            <ToolButton label="Bold" keys={`${MOD}B`} toggle active={active.bold} onClick={() => onCommand({ type: 'inline', value: 'bold' })}><BoldIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Italic" keys={`${MOD}I`} toggle active={active.italic} onClick={() => onCommand({ type: 'inline', value: 'italic' })}><ItalicIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Underline" keys={`${MOD}U`} toggle active={active.underline} onClick={() => onCommand({ type: 'inline', value: 'underline' })}><UnderlineIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Strikethrough" keys={`${MOD}${SHIFT}X`} toggle active={active.strike} onClick={() => onCommand({ type: 'inline', value: 'strikeThrough' })}><StrikethroughIcon className="h-4 w-4" /></ToolButton>
            <MenuButton label="Text color" width={260} trigger={<TextColorIcon className="h-4 w-4" />}>
                {close => <Swatches colors={TEXT_COLORS} onPick={c => { onCommand({ type: 'color', value: c }); close(); }} />}
            </MenuButton>
            <MenuButton label="Highlight" width={260} trigger={<HighlighterIcon className="h-4 w-4" />}>
                {close => (
                    <Swatches
                        colors={HIGHLIGHTS}
                        onPick={c => { onCommand({ type: 'highlight', value: c }); close(); }}
                        noneLabel="No highlight"
                        onNone={() => { onCommand({ type: 'highlight', value: 'transparent' }); close(); }}
                    />
                )}
            </MenuButton>
            <ToolButton label={active.link ? 'Edit link' : 'Link'} keys={`${MOD}K`} toggle active={active.link} onClick={() => onCommand({ type: 'link' })}><LinkIcon className="h-4 w-4" /></ToolButton>
            <Divider />

            <ToolButton label="Bulleted list" keys={`${MOD}${SHIFT}8`} toggle active={active.list === 'ul'} onClick={() => onCommand({ type: 'list', value: 'ul' })}><ListIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Numbered list" keys={`${MOD}${SHIFT}7`} toggle active={active.list === 'ol'} onClick={() => onCommand({ type: 'list', value: 'ol' })}><ListOrderedIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Checklist" keys={`${MOD}${SHIFT}9`} toggle active={active.list === 'check'} onClick={() => onCommand({ type: 'list', value: 'check' })}><ChecklistIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Decrease indent" keys={active.list ? `${SHIFT}Tab` : undefined} onClick={() => onCommand({ type: 'indent', value: -1 })}><OutdentIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Increase indent" keys={active.list ? 'Tab' : undefined} onClick={() => onCommand({ type: 'indent', value: 1 })}><IndentIcon className="h-4 w-4" /></ToolButton>
            <Divider />

            <ToolButton label="Align left" toggle active={active.align === 'left'} onClick={() => onCommand({ type: 'align', value: 'left' })}><AlignLeftIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Align center" toggle active={active.align === 'center'} onClick={() => onCommand({ type: 'align', value: 'center' })}><AlignCenterIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Align right" toggle active={active.align === 'right'} onClick={() => onCommand({ type: 'align', value: 'right' })}><AlignRightIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Justify" toggle active={active.align === 'justify'} onClick={() => onCommand({ type: 'align', value: 'justify' })}><AlignJustifyIcon className="h-4 w-4" /></ToolButton>
            <Divider />

            <ToolButton label="Insert photo" onClick={() => onCommand({ type: 'image' })}><UploadImageIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Insert table" onClick={() => onCommand({ type: 'table' })}><TableIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Horizontal line" onClick={() => onCommand({ type: 'hr' })}><MinusIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Clear formatting" keys={`${MOD}\\`} onClick={() => onCommand({ type: 'clear' })}><RemoveFormatIcon className="h-4 w-4" /></ToolButton>
        </div>
    );
};

export default RichTextToolbar;
