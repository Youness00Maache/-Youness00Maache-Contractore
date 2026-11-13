import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils.ts';
import {
    AlignCenterIcon, AlignLeftIcon, AlignRightIcon, BoldIcon, CameraIcon, ChevronDownIcon, FontIcon, HighlighterIcon, IndentIcon, ItalicIcon,
    LinkIcon, ListIcon, ListOrderedIcon, MinusIcon, OutdentIcon, PlusIcon, QuoteIcon, RedoIcon, RemoveFormatIcon, StrikethroughIcon, TableIcon,
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
    highlight: boolean;
}

export const EMPTY_ACTIVE: EditorActiveState = { bold: false, italic: false, underline: false, strike: false, block: 'p', list: null, align: 'left', link: false, highlight: false };

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
    | { type: 'link' } | { type: 'table' } | { type: 'hr' } | { type: 'clear' } | { type: 'image' } | { type: 'camera' };

/** What the editor offers. Emails get no photos (data images don't travel) and no web fonts. */
export interface EditorFeatures { images: boolean; fonts: boolean }

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');
export const MOD = isMac ? '⌘' : 'Ctrl+';
const ALT = isMac ? '⌥' : 'Alt+';
const SHIFT = isMac ? '⇧' : 'Shift+';

const BLOCKS: { value: BlockStyle; label: string; short: string; className: string; keys: string }[] = [
    { value: 'p', label: 'Normal text', short: 'Text', className: 'text-sm', keys: `${MOD}${ALT}0` },
    { value: 'h1', label: 'Heading 1', short: 'H1', className: 'text-xl font-bold', keys: `${MOD}${ALT}1` },
    { value: 'h2', label: 'Heading 2', short: 'H2', className: 'text-lg font-bold', keys: `${MOD}${ALT}2` },
    { value: 'h3', label: 'Heading 3', short: 'H3', className: 'text-base font-semibold', keys: `${MOD}${ALT}3` },
    { value: 'blockquote', label: 'Quote', short: 'Quote', className: 'text-sm text-muted-foreground', keys: '' },
];

export const TEXT_COLORS = [
    '#000000', '#374151', '#6b7280', '#9ca3af', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#1e40af', '#7c3aed', '#db2777', '#78350f',
    '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#351c75', '#741b47',
];
export const HIGHLIGHTS = ['#fef08a', '#fde68a', '#fed7aa', '#fecaca', '#fbcfe8', '#e9d5ff', '#bfdbfe', '#a5f3fc', '#bbf7d0', '#d9f99d', '#e5e7eb'];
export const DEFAULT_HIGHLIGHT = '#fef08a';

const FONT_SIZES = [{ label: 'Small', short: 'S', value: 2 }, { label: 'Normal', short: 'M', value: 3 }, { label: 'Large', short: 'L', value: 5 }, { label: 'Huge', short: 'XL', value: 7 }];

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
/** Fonts that exist on every device (the web fonts above are only loaded inside the app). */
const SAFE_FONTS = FONTS.slice(0, 3);

// small icons the shared icon set doesn't have
const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;
const AlignJustifyIcon: IconType = p => <svg {...svgProps} {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
export const ChecklistIcon: IconType = p => <svg {...svgProps} {...p}><rect x="3" y="4" width="6" height="6" rx="1" /><path d="m4.5 7 1 1 2-2" /><rect x="3" y="14" width="6" height="6" rx="1" /><path d="M13 7h8M13 17h8" /></svg>;
const MoreIcon: IconType = p => <svg {...svgProps} {...p}><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></svg>;
const TextIcon: IconType = p => <svg {...svgProps} {...p}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></svg>;
const glyph = (text: string): IconType => {
    const Glyph: IconType = ({ className }) => <span className={cn('inline-flex items-center justify-center text-[11px] font-bold leading-none', className)}>{text}</span>;
    return Glyph;
};

const ALIGNS: { value: Align; label: string; icon: IconType }[] = [
    { value: 'left', label: 'Align left', icon: AlignLeftIcon },
    { value: 'center', label: 'Align center', icon: AlignCenterIcon },
    { value: 'right', label: 'Align right', icon: AlignRightIcon },
    { value: 'justify', label: 'Justify', icon: AlignJustifyIcon },
];

// ---------------------------------------------------------------------------
// Blocks: the "/" menu and the Insert button share this list
// ---------------------------------------------------------------------------
export interface BlockItem {
    id: string;
    label: string;
    /** markdown-style shortcut typed at the start of a line, shown as a hint */
    hint?: string;
    keywords: string;
    icon: IconType;
    command: EditorCommand;
    needsImages?: boolean;
    /** not offered inside a table cell (no nested tables / lists in cells) */
    notInTable?: boolean;
}

export const BLOCK_ITEMS: BlockItem[] = [
    { id: 'p', label: 'Text', keywords: 'text paragraph normal body plain', icon: TextIcon, command: { type: 'block', value: 'p' } },
    { id: 'h1', label: 'Heading 1', hint: '#', keywords: 'h1 heading title large big', icon: glyph('H1'), command: { type: 'block', value: 'h1' } },
    { id: 'h2', label: 'Heading 2', hint: '##', keywords: 'h2 heading subtitle medium', icon: glyph('H2'), command: { type: 'block', value: 'h2' } },
    { id: 'h3', label: 'Heading 3', hint: '###', keywords: 'h3 heading small', icon: glyph('H3'), command: { type: 'block', value: 'h3' } },
    { id: 'ul', label: 'Bulleted list', hint: '-', keywords: 'bullet list unordered ul points', icon: ListIcon, command: { type: 'list', value: 'ul' }, notInTable: true },
    { id: 'ol', label: 'Numbered list', hint: '1.', keywords: 'numbered ordered list ol steps', icon: ListOrderedIcon, command: { type: 'list', value: 'ol' }, notInTable: true },
    { id: 'check', label: 'Checklist', hint: '[]', keywords: 'checklist todo to-do task checkbox check', icon: ChecklistIcon, command: { type: 'list', value: 'check' }, notInTable: true },
    { id: 'quote', label: 'Quote', hint: '>', keywords: 'quote blockquote citation callout note', icon: QuoteIcon, command: { type: 'block', value: 'blockquote' } },
    { id: 'table', label: 'Table', keywords: 'table grid rows columns', icon: TableIcon, command: { type: 'table' }, notInTable: true },
    { id: 'image', label: 'Photo', keywords: 'photo image picture upload file', icon: UploadImageIcon, command: { type: 'image' }, needsImages: true },
    { id: 'camera', label: 'Take a photo', keywords: 'camera take photo snap picture', icon: CameraIcon, command: { type: 'camera' }, needsImages: true },
    { id: 'hr', label: 'Divider', hint: '---', keywords: 'divider line separator horizontal rule hr', icon: MinusIcon, command: { type: 'hr' }, notInTable: true },
];

/** Blocks offered for the query typed after "/" (best matches first). */
export const blockItemsFor = (features: EditorFeatures, query = '', inTable = false): BlockItem[] => {
    const q = query.trim().toLowerCase();
    const allowed = BLOCK_ITEMS.filter(b => (!b.needsImages || features.images) && !(inTable && b.notInTable));
    if (!q) return allowed;
    const score = (b: BlockItem) => {
        const label = b.label.toLowerCase();
        if (label.startsWith(q)) return 0;
        if (b.keywords.split(' ').some(k => k.startsWith(q))) return 1;
        if (label.includes(q) || b.keywords.includes(q)) return 2;
        return 9;
    };
    return allowed.map(b => ({ b, s: score(b) })).filter(x => x.s < 9).sort((a, b) => a.s - b.s).map(x => x.b);
};

export const preventFocusLoss = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault();

/** One row per block; used by the "/" menu (keyboard driven) and the Insert menu. */
export const BlockMenuList: React.FC<{
    items: BlockItem[];
    activeIndex?: number;
    onPick: (item: BlockItem) => void;
    onHover?: (index: number) => void;
    title?: string;
}> = ({ items, activeIndex = -1, onPick, onHover, title }) => {
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (activeIndex < 0) return;
        listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);
    return (
        <div ref={listRef} role="listbox" aria-label={title || 'Blocks'}>
            {title && <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>}
            {items.map((item, i) => (
                <button
                    key={item.id}
                    type="button"
                    role="option"
                    data-index={i}
                    aria-selected={i === activeIndex}
                    onMouseDown={preventFocusLoss}
                    onMouseEnter={() => onHover?.(i)}
                    onClick={() => onPick(item)}
                    className={cn(
                        'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition-colors',
                        i === activeIndex ? 'bg-muted' : 'hover:bg-muted/70',
                    )}
                >
                    <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="shrink-0 font-mono text-[11px] text-muted-foreground/80">{item.hint}</span>}
                </button>
            ))}
            {!items.length && <p className="px-3 py-2 text-sm text-muted-foreground">No matching blocks</p>}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Buttons and menus
// ---------------------------------------------------------------------------
export const toolButtonClass = (active?: boolean) => cn(
    'flex h-8 min-w-[32px] shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-[13px] font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35',
    active ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted hover:text-foreground',
);

export const ToolButton: React.FC<{
    label: string; keys?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; toggle?: boolean; className?: string;
}> = ({ label, keys, active, disabled, onClick, children, toggle, className }) => (
    <button
        type="button"
        className={cn(toolButtonClass(active), className)}
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

/** A toolbar dropdown rendered in a portal (fixed position), so neither the toolbar nor the editor clips it. */
export const MenuButton: React.FC<{
    label: string;
    trigger: React.ReactNode;
    width?: number;
    active?: boolean;
    disabled?: boolean;
    align?: 'start' | 'end';
    className?: string;
    title?: string;
    children: (close: () => void) => React.ReactNode;
}> = ({ label, trigger, width = 200, active, disabled, align = 'start', className, title, children }) => {
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
    const close = useCallback(() => setPos(null), []);
    const open = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (!r) return;
        const w = Math.min(width, window.innerWidth - 16);
        const x = align === 'end' ? r.right - w : r.left;
        const viewH = window.visualViewport?.height ?? window.innerHeight;
        setPos({ top: Math.round(r.bottom + 6), left: Math.round(Math.max(8, Math.min(x, window.innerWidth - w - 8))), maxHeight: Math.max(180, Math.min(440, viewH - r.bottom - 16)) });
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
                className={cn(toolButtonClass(active || Boolean(pos)), className)}
                onMouseDown={preventFocusLoss}
                onClick={() => (pos ? close() : open())}
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={Boolean(pos)}
                aria-label={label}
                title={title || label}
            >
                {trigger}
            </button>
            {pos && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    role="menu"
                    aria-label={label}
                    onMouseDown={preventFocusLoss}
                    className="fixed z-[130] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lift animate-zoom-in [scrollbar-width:thin]"
                    style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxHeight }}
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
        className={cn('flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-muted', active && 'bg-primary/10 text-primary', className)}
        style={style}
    >
        <span className="truncate">{children}</span>
        {hint && <span className="hidden shrink-0 text-[10px] font-normal not-italic text-muted-foreground sm:inline">{hint}</span>}
    </button>
);

export const Swatches: React.FC<{ colors: string[]; onPick: (c: string) => void; noneLabel?: string; onNone?: () => void }> = ({ colors, onPick, noneLabel, onNone }) => (
    <div className="p-1">
        <div className="grid grid-cols-7 gap-1.5">
            {colors.map(c => (
                <button
                    key={c}
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => onPick(c)}
                    className="h-7 w-7 rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/15"
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

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />;
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="px-1.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:pt-0.5">{children}</p>
);

// ---------------------------------------------------------------------------
// Toolbar: one row; what doesn't fit (and the rarely used tools) goes to the "…" menu
// ---------------------------------------------------------------------------
type UnitId = 'insert' | 'style' | 'type' | 'bold' | 'italic' | 'underline' | 'strike' | 'colors' | 'link' | 'lists' | 'align' | 'indent' | 'clear' | 'history';
const BTN = 32;
const GAP = 2;
const SEP = 11;
/** Display order; `priority` decides what stays visible when the row is narrow (1 = last to go). */
const UNITS: { id: UnitId; group: number; priority: number; width: (wide: boolean, fonts: boolean) => number }[] = [
    { id: 'insert', group: 0, priority: 1, width: wide => (wide ? 76 : BTN) },
    { id: 'style', group: 0, priority: 5, width: wide => (wide ? 118 : 66) },
    { id: 'type', group: 0, priority: 13, width: (_w, fonts) => (fonts ? 2 * 44 + GAP : 44) },
    { id: 'bold', group: 1, priority: 2, width: () => BTN },
    { id: 'italic', group: 1, priority: 6, width: () => BTN },
    { id: 'underline', group: 1, priority: 8, width: () => BTN },
    { id: 'strike', group: 1, priority: 10, width: () => BTN },
    { id: 'colors', group: 1, priority: 9, width: () => 2 * BTN + GAP },
    { id: 'link', group: 1, priority: 7, width: () => BTN },
    { id: 'lists', group: 2, priority: 3, width: () => 3 * BTN + 2 * GAP },
    { id: 'align', group: 2, priority: 11, width: () => 44 },
    { id: 'indent', group: 2, priority: 12, width: () => 2 * BTN + GAP },
    { id: 'clear', group: 3, priority: 14, width: () => BTN },
    { id: 'history', group: 4, priority: 4, width: () => 2 * BTN + GAP },
];

const visibleUnits = (width: number, fonts: boolean): Set<UnitId> => {
    const wide = width >= 560;
    const visible = new Set<UnitId>();
    if (!width) return visible;
    const groups = new Set<number>();
    let used = 12 + BTN + 2 * GAP; // padding + the "…" button + the spacer before undo/redo
    for (const u of [...UNITS].sort((a, b) => a.priority - b.priority)) {
        // groups 0-3 are separated by a divider; undo/redo (group 4) sits at the right end without one
        const needsSep = u.group !== 4 && !groups.has(u.group) && [...groups].some(g => g !== 4);
        const w = u.width(wide, fonts) + GAP + (needsSep ? SEP : 0);
        if (used + w > width) break;
        used += w;
        visible.add(u.id);
        groups.add(u.group);
    }
    return visible;
};

/**
 * Formatting toolbar of the rich text editor. Every control keeps the editor's selection (no focus steal), so
 * formatting always applies to the selected text, on desktop and on phones.
 */
const RichTextToolbar: React.FC<{
    active: EditorActiveState;
    canUndo: boolean;
    canRedo: boolean;
    onCommand: (cmd: EditorCommand) => void;
    features?: EditorFeatures;
    disabled?: boolean;
    inTable?: boolean;
}> = ({ active, canUndo, canRedo, onCommand, features = { images: true, fonts: true }, disabled, inTable }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [fontsOpen, setFontsOpen] = useState(false);

    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const measure = () => setWidth(Math.round(el.clientWidth));
        measure();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
        ro?.observe(el);
        return () => ro?.disconnect();
    }, []);

    const wide = width >= 560;
    const shown = visibleUnits(width, features.fonts);
    const hidden = (id: UnitId) => !shown.has(id);
    const block = BLOCKS.find(b => b.value === active.block) || BLOCKS[0];
    const fonts = features.fonts ? FONTS : SAFE_FONTS;
    const cmd = (c: EditorCommand, close?: () => void) => { onCommand(c); close?.(); };
    const AlignActive = ALIGNS.find(a => a.value === active.align)?.icon || AlignLeftIcon;

    // ---- pieces (used in the row and in the "…" menu)
    const undoBtn = <ToolButton label="Undo" keys={`${MOD}Z`} disabled={disabled || !canUndo} onClick={() => cmd({ type: 'undo' })}><UndoIcon className="h-4 w-4" /></ToolButton>;
    const redoBtn = <ToolButton label="Redo" keys={isMac ? `${SHIFT}${MOD}Z` : `${MOD}Y`} disabled={disabled || !canRedo} onClick={() => cmd({ type: 'redo' })}><RedoIcon className="h-4 w-4" /></ToolButton>;
    const boldBtn = <ToolButton label="Bold" keys={`${MOD}B`} toggle active={active.bold} disabled={disabled} onClick={() => cmd({ type: 'inline', value: 'bold' })}><BoldIcon className="h-4 w-4" /></ToolButton>;
    const italicBtn = <ToolButton label="Italic" keys={`${MOD}I`} toggle active={active.italic} disabled={disabled} onClick={() => cmd({ type: 'inline', value: 'italic' })}><ItalicIcon className="h-4 w-4" /></ToolButton>;
    const underlineBtn = <ToolButton label="Underline" keys={`${MOD}U`} toggle active={active.underline} disabled={disabled} onClick={() => cmd({ type: 'inline', value: 'underline' })}><UnderlineIcon className="h-4 w-4" /></ToolButton>;
    const strikeBtn = <ToolButton label="Strikethrough" keys={`${MOD}${SHIFT}X`} toggle active={active.strike} disabled={disabled} onClick={() => cmd({ type: 'inline', value: 'strikeThrough' })}><StrikethroughIcon className="h-4 w-4" /></ToolButton>;
    const linkBtn = <ToolButton label={active.link ? 'Edit link' : 'Link'} keys={`${MOD}K`} toggle active={active.link} disabled={disabled} onClick={() => cmd({ type: 'link' })}><LinkIcon className="h-4 w-4" /></ToolButton>;
    const listBtns = (
        <>
            <ToolButton label="Bulleted list" keys={`${MOD}${SHIFT}8`} toggle active={active.list === 'ul'} disabled={disabled} onClick={() => cmd({ type: 'list', value: 'ul' })}><ListIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Numbered list" keys={`${MOD}${SHIFT}7`} toggle active={active.list === 'ol'} disabled={disabled} onClick={() => cmd({ type: 'list', value: 'ol' })}><ListOrderedIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Checklist" keys={`${MOD}${SHIFT}9`} toggle active={active.list === 'check'} disabled={disabled} onClick={() => cmd({ type: 'list', value: 'check' })}><ChecklistIcon className="h-4 w-4" /></ToolButton>
        </>
    );
    const indentBtns = (
        <>
            <ToolButton label="Decrease indent" keys={active.list ? `${SHIFT}Tab` : undefined} disabled={disabled} onClick={() => cmd({ type: 'indent', value: -1 })}><OutdentIcon className="h-4 w-4" /></ToolButton>
            <ToolButton label="Increase indent" keys={active.list ? 'Tab' : undefined} disabled={disabled} onClick={() => cmd({ type: 'indent', value: 1 })}><IndentIcon className="h-4 w-4" /></ToolButton>
        </>
    );
    const clearBtn = <ToolButton label="Clear formatting" keys={`${MOD}\\`} disabled={disabled} onClick={() => cmd({ type: 'clear' })}><RemoveFormatIcon className="h-4 w-4" /></ToolButton>;
    const alignBtns = ALIGNS.map(a => (
        <ToolButton key={a.value} label={a.label} toggle active={active.align === a.value} disabled={disabled} onClick={() => cmd({ type: 'align', value: a.value })}><a.icon className="h-4 w-4" /></ToolButton>
    ));
    const styleItems = (close?: () => void) => BLOCKS.map(b => (
        <MenuItem key={b.value} active={active.block === b.value} className={b.className} hint={b.keys} onPick={() => cmd({ type: 'block', value: b.value }, close)}>{b.label}</MenuItem>
    ));
    const fontItems = (close?: () => void) => fonts.map(f => (
        <MenuItem key={f.name} style={{ fontFamily: f.family }} onPick={() => cmd({ type: 'font', value: f.family }, close)}>{f.name}</MenuItem>
    ));
    const sizeRow = (close?: () => void) => (
        <div className="grid grid-cols-4 gap-1 px-1">
            {FONT_SIZES.map(s => (
                <button key={s.value} type="button" onMouseDown={preventFocusLoss} onClick={() => cmd({ type: 'size', value: s.value }, close)} className="h-8 rounded-md border border-border text-xs font-medium hover:bg-muted" title={s.label}>{s.short}</button>
            ))}
        </div>
    );
    const blockItems = blockItemsFor(features, '', inTable);

    const anyHidden = UNITS.some(u => hidden(u.id));
    const groupVisible = (g: number) => UNITS.some(u => u.group === g && shown.has(u.id));
    const sepBefore = (g: number) => (UNITS.some(u => u.group < g && u.group !== 4 && shown.has(u.id)) && groupVisible(g) ? <Divider /> : null);

    return (
        <div ref={rootRef} className="flex h-11 items-center gap-0.5 overflow-hidden px-1.5" role="toolbar" aria-label="Text formatting">
            {shown.has('insert') && (
                <MenuButton
                    label="Insert a block"
                    title="Insert a block (or type / in the text)"
                    width={248}
                    disabled={disabled}
                    className={wide ? 'gap-1.5 pl-2 pr-2.5 text-foreground' : ''}
                    trigger={<><PlusIcon className="h-4 w-4" />{wide && <span>Insert</span>}</>}
                >
                    {close => <BlockMenuList title="Insert or turn into" items={blockItems} onPick={item => cmd(item.command, close)} />}
                </MenuButton>
            )}
            {shown.has('style') && (
                <MenuButton
                    label="Paragraph style"
                    width={232}
                    disabled={disabled}
                    className="justify-between gap-1 px-2 text-foreground"
                    trigger={<><span className={cn('truncate text-left', wide ? 'w-[86px]' : 'w-[38px]')}>{wide ? block.label : block.short}</span><ChevronDownIcon className="h-3 w-3 shrink-0 opacity-60" /></>}
                >
                    {close => styleItems(close)}
                </MenuButton>
            )}
            {shown.has('type') && (
                <>
                    {features.fonts && (
                        <MenuButton label="Font" width={220} disabled={disabled} trigger={<><FontIcon className="h-4 w-4" /><ChevronDownIcon className="h-3 w-3 opacity-60" /></>}>
                            {close => fontItems(close)}
                        </MenuButton>
                    )}
                    <MenuButton label="Text size" width={180} disabled={disabled} trigger={<><TextSizeIcon className="h-4 w-4" /><ChevronDownIcon className="h-3 w-3 opacity-60" /></>}>
                        {close => FONT_SIZES.map(s => <MenuItem key={s.value} onPick={() => cmd({ type: 'size', value: s.value }, close)}>{s.label}</MenuItem>)}
                    </MenuButton>
                </>
            )}

            {sepBefore(1)}
            {shown.has('bold') && boldBtn}
            {shown.has('italic') && italicBtn}
            {shown.has('underline') && underlineBtn}
            {shown.has('strike') && strikeBtn}
            {shown.has('colors') && (
                <>
                    <MenuButton label="Text color" width={260} disabled={disabled} trigger={<TextColorIcon className="h-4 w-4" />}>
                        {close => <Swatches colors={TEXT_COLORS} onPick={c => cmd({ type: 'color', value: c }, close)} />}
                    </MenuButton>
                    <MenuButton label="Highlight" width={260} active={active.highlight} disabled={disabled} trigger={<HighlighterIcon className="h-4 w-4" />}>
                        {close => <Swatches colors={HIGHLIGHTS} onPick={c => cmd({ type: 'highlight', value: c }, close)} noneLabel="No highlight" onNone={() => cmd({ type: 'highlight', value: 'transparent' }, close)} />}
                    </MenuButton>
                </>
            )}
            {shown.has('link') && linkBtn}

            {sepBefore(2)}
            {shown.has('lists') && listBtns}
            {shown.has('align') && (
                <MenuButton label="Alignment" width={176} disabled={disabled} trigger={<><AlignActive className="h-4 w-4" /><ChevronDownIcon className="h-3 w-3 opacity-60" /></>}>
                    {close => ALIGNS.map(a => (
                        <MenuItem key={a.value} active={active.align === a.value} onPick={() => cmd({ type: 'align', value: a.value }, close)}>
                            <span className="flex items-center gap-2"><a.icon className="h-4 w-4" /> {a.label}</span>
                        </MenuItem>
                    ))}
                </MenuButton>
            )}
            {shown.has('indent') && indentBtns}

            {sepBefore(3)}
            {shown.has('clear') && clearBtn}

            <span className="ml-auto" />
            {shown.has('history') && <>{undoBtn}{redoBtn}</>}
            {anyHidden && (
                <MenuButton label="More formatting" title="More formatting" width={276} align="end" disabled={disabled} trigger={<MoreIcon className="h-4 w-4" />}>
                    {close => (
                        <div className="pb-0.5">
                            {hidden('history') && (<><SectionTitle>Edit</SectionTitle><div className="flex flex-wrap gap-0.5 px-0.5">{undoBtn}{redoBtn}</div></>)}
                            {hidden('insert') && (<><SectionTitle>Insert</SectionTitle><BlockMenuList items={blockItems} onPick={item => cmd(item.command, close)} /></>)}
                            {hidden('style') && (<><SectionTitle>Text style</SectionTitle>{styleItems(close)}</>)}
                            {(hidden('bold') || hidden('italic') || hidden('underline') || hidden('strike') || hidden('link') || hidden('clear')) && (
                                <>
                                    <SectionTitle>Format</SectionTitle>
                                    <div className="flex flex-wrap gap-0.5 px-0.5">
                                        {hidden('bold') && boldBtn}
                                        {hidden('italic') && italicBtn}
                                        {hidden('underline') && underlineBtn}
                                        {hidden('strike') && strikeBtn}
                                        {hidden('link') && linkBtn}
                                        {hidden('clear') && clearBtn}
                                    </div>
                                </>
                            )}
                            {(hidden('lists') || hidden('align') || hidden('indent')) && (
                                <>
                                    <SectionTitle>Paragraph</SectionTitle>
                                    <div className="flex flex-wrap gap-0.5 px-0.5">
                                        {hidden('lists') && listBtns}
                                        {hidden('align') && alignBtns}
                                        {hidden('indent') && indentBtns}
                                    </div>
                                </>
                            )}
                            {hidden('colors') && (
                                <>
                                    <SectionTitle>Text color</SectionTitle>
                                    <Swatches colors={TEXT_COLORS} onPick={c => cmd({ type: 'color', value: c }, close)} />
                                    <SectionTitle>Highlight</SectionTitle>
                                    <Swatches colors={HIGHLIGHTS} onPick={c => cmd({ type: 'highlight', value: c }, close)} noneLabel="No highlight" onNone={() => cmd({ type: 'highlight', value: 'transparent' }, close)} />
                                </>
                            )}
                            {hidden('type') && (
                                <>
                                    <SectionTitle>Text size</SectionTitle>
                                    {sizeRow(close)}
                                    <SectionTitle>Font</SectionTitle>
                                    <button
                                        type="button"
                                        onMouseDown={preventFocusLoss}
                                        onClick={() => setFontsOpen(v => !v)}
                                        aria-expanded={fontsOpen}
                                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                                    >
                                        <span className="flex items-center gap-2"><FontIcon className="h-4 w-4 text-muted-foreground" /> Choose a font</span>
                                        <ChevronDownIcon className={cn('h-3.5 w-3.5 opacity-60 transition-transform', fontsOpen && 'rotate-180')} />
                                    </button>
                                    {fontsOpen && <div className="max-h-48 overflow-y-auto">{fontItems(close)}</div>}
                                </>
                            )}
                        </div>
                    )}
                </MenuButton>
            )}
        </div>
    );
};

export default RichTextToolbar;
