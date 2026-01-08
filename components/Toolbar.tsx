import React, { useState, useRef, useEffect } from 'react';
import { 
    BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon, LinkIcon, HeadingIcon, QuoteIcon,
    HighlighterIcon, TextColorIcon, AlignLeftIcon, AlignCenterIcon, AlignRightIcon, TableIcon, 
    TextSizeIcon, FontIcon, ColumnsIcon, UndoIcon, RedoIcon, ListIcon, ListOrderedIcon, MinusIcon, ChevronDownIcon,
    IndentIcon, OutdentIcon, RemoveFormatIcon
} from './Icons.tsx';

type ToolbarButtonProps = {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  isActive: boolean;
  onClick: () => void;
  showTooltip: (label: string) => void;
  hideTooltip: () => void;
};

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ label, icon: Icon, isActive, onClick, showTooltip, hideTooltip }) => (
    <div className="relative shrink-0" onMouseEnter={() => showTooltip(label)} onMouseLeave={hideTooltip}>
        <button
            className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-200 border ${
                isActive 
                ? "bg-primary/20 text-primary border-primary/30" 
                : "bg-card text-foreground border-border hover:bg-secondary"
            } focus:outline-none`}
            aria-label={label}
            onClick={onClick}
            title={label}
        >
            <Icon className="h-5 w-5" />
        </button>
    </div>
);

type ToolbarProps = {
    activeButtons: string[];
    onCommand: (command: string, value?: any) => void;
    toggleActiveButton: (button: string) => void;
};

interface ToolbarBtnItem {
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    command: string;
    value?: string;
}

const Toolbar: React.FC<ToolbarProps> = ({ activeButtons, onCommand, toggleActiveButton }) => {
    const [tooltip, setTooltip] = useState<string | null>(null);
    const [showSizeDropdown, setShowSizeDropdown] = useState(false);
    const sizeDropdownRef = useRef<HTMLDivElement>(null);
    const [showFontDropdown, setShowFontDropdown] = useState(false);
    const fontDropdownRef = useRef<HTMLDivElement>(null);
    const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
    const headingDropdownRef = useRef<HTMLDivElement>(null);
    const [showColorPicker, setShowColorPicker] = useState<null | 'text' | 'background'>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(event.target as Node)) setShowSizeDropdown(false);
            if (fontDropdownRef.current && !fontDropdownRef.current.contains(event.target as Node)) setShowFontDropdown(false);
            if (headingDropdownRef.current && !headingDropdownRef.current.contains(event.target as Node)) setShowHeadingDropdown(false);
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) setShowColorPicker(null);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const showTooltip = (label: string) => setTooltip(label);
    const hideTooltip = () => setTooltip(null);

    const handleSizeChange = (size: number) => { onCommand('fontSize', size); setShowSizeDropdown(false); };
    const handleFontChange = (fontFamily: string) => { onCommand('fontName', fontFamily); setShowFontDropdown(false); };
    const handleHeadingChange = (tag: string) => { onCommand('formatBlock', tag); setShowHeadingDropdown(false); };

    const colors = [
        '#ffffff', '#000000', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
        '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc',
        '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#9fc5e8', '#b4a7d6', '#d5a6bd',
        '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0',
        '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#351c75', '#741b47',
    ];

    const handleColorChange = (color: string) => {
        if (showColorPicker === 'text') onCommand('foreColor', color);
        else if (showColorPicker === 'background') onCommand('hiliteColor', color);
        setShowColorPicker(null);
    };

    const historyButtons: ToolbarBtnItem[] = [
        { label: 'Undo', icon: UndoIcon, command: 'undo' },
        { label: 'Redo', icon: RedoIcon, command: 'redo' },
    ];
    
    const formatButtons: ToolbarBtnItem[] = [
        { label: 'Bold', icon: BoldIcon, command: 'bold' },
        { label: 'Italic', icon: ItalicIcon, command: 'italic' },
        { label: 'Underline', icon: UnderlineIcon, command: 'underline' },
    ];

    const extraFormatButtons: ToolbarBtnItem[] = [
        { label: 'Link', icon: LinkIcon, command: 'createLink' },
    ];
    
    const listButtons: ToolbarBtnItem[] = [
        { label: 'Bullet List', icon: ListIcon, command: 'insertUnorderedList' },
        { label: 'Numbered List', icon: ListOrderedIcon, command: 'insertOrderedList' },
        { label: 'Decrease Indent', icon: OutdentIcon, command: 'outdent' },
        { label: 'Increase Indent', icon: IndentIcon, command: 'indent' },
    ];
    
    const insertButtons: ToolbarBtnItem[] = [
        { label: 'Clear Formatting', icon: RemoveFormatIcon, command: 'removeFormat' },
        { label: 'Divider', icon: MinusIcon, command: 'insertHorizontalRule' },
        { label: 'Table', icon: TableIcon, command: 'insertTable' },
    ];
    
    const alignmentButtons: ToolbarBtnItem[] = [
        { label: 'Align Left', icon: AlignLeftIcon, command: 'justifyLeft' },
        { label: 'Align Center', icon: AlignCenterIcon, command: 'justifyCenter' },
        { label: 'Align Right', icon: AlignRightIcon, command: 'justifyRight' },
    ];
    
    const fontSizes = [
        { label: 'Small', value: 2 }, { label: 'Normal', value: 3 }, { label: 'Large', value: 5 }, { label: 'Huge', value: 7 },
    ];
    
    const initialFonts = [
      { name: 'Default', family: 'var(--font-sans)' },
      { name: 'Serif', family: 'var(--font-serif)' },
      { name: 'Mono', family: 'var(--font-mono)' },
      { name: 'Inter', family: 'Inter, sans-serif' },
      { name: 'Roboto', family: 'Roboto, sans-serif' },
      { name: 'Open Sans', family: 'Open Sans, sans-serif' },
      { name: 'Lato', family: 'Lato, sans-serif' },
      { name: 'Montserrat', family: 'Montserrat, sans-serif' },
      { name: 'Oswald', family: 'Oswald, sans-serif' },
      { name: 'Raleway', family: 'Raleway, sans-serif' },
      { name: 'Poppins', family: 'Poppins, sans-serif' },
      { name: 'Merriweather', family: 'Merriweather, serif' },
      { name: 'Nunito', family: 'Nunito, sans-serif' },
      { name: 'Playfair Display', family: 'Playfair Display, serif' },
      { name: 'Rubik', family: 'Rubik, sans-serif' },
      { name: 'Work Sans', family: 'Work Sans, sans-serif' },
      { name: 'Quicksand', family: 'Quicksand, sans-serif' },
      { name: 'Karla', family: 'Karla, sans-serif' },
      { name: 'Inconsolata', family: 'Inconsolata, monospace' },
      { name: 'PT Serif', family: 'PT Serif, serif' },
      { name: 'Droid Sans', family: 'Droid Sans, sans-serif' },
      { name: 'Arvo', family: 'Arvo, serif' },
      { name: 'Fira Sans', family: 'Fira Sans, sans-serif' },
      { name: 'Cabin', family: 'Cabin, sans-serif' },
      { name: 'Bitter', family: 'Bitter, serif' },
      { name: 'Josefin Sans', family: 'Josefin Sans, sans-serif' },
      { name: 'Libre Baskerville', family: 'Libre Baskerville, serif' },
      { name: 'Anton', family: 'Anton, sans-serif' },
      { name: 'Ubuntu', family: 'Ubuntu, sans-serif' },
      { name: 'Crimson Text', family: 'Crimson Text, serif' },
      { name: 'Old Standard TT', family: 'Old Standard TT, serif' },
      { name: 'Abril Fatface', family: 'Abril Fatface, cursive' },
      { name: 'Pacifico', family: 'Pacifico, cursive' },
      { name: 'Lobster', family: 'Lobster, cursive' },
      { name: 'Shadows Into Light Two', family: 'Shadows Into Light Two, cursive' },
      { name: 'Indie Flower', family: 'Indie Flower, cursive' },
      { name: 'Dancing Script', family: 'Dancing Script, cursive' },
      { name: 'Bebas Neue', family: 'Bebas Neue, sans-serif' },
      { name: 'Amatic SC', family: 'Amatic SC, cursive' },
      { name: 'Righteous', family: 'Righteous, cursive' },
      { name: 'Comfortaa', family: 'Comfortaa, cursive' },
      { name: 'Bangers', family: 'Bangers, cursive' },
      { name: 'Permanent Marker', family: 'Permanent Marker, cursive' },
      { name: 'Alfa Slab One', family: 'Alfa Slab One, cursive' },
      { name: 'Patrick Hand', family: 'Patrick Hand, cursive' },
      { name: 'Cormorant Garamond', family: 'Cormorant Garamond, serif' },
      { name: 'EB Garamond', family: 'EB Garamond, serif' },
      { name: 'Space Mono', family: 'Space Mono, monospace' },
      { name: 'Space Grotesk', family: 'Space Grotesk, sans-serif' },
      { name: 'Source Code Pro', family: 'Source Code Pro, monospace' },
      { name: 'DM Sans', family: 'DM Sans, sans-serif' },
      { name: 'JetBrains Mono', family: 'JetBrains Mono, monospace' }
    ];
    
    const headings = [
        { label: 'Normal', tag: 'p', className: 'text-sm' }, { label: 'H1', tag: 'h1', className: 'text-xl font-bold' }, { label: 'H2', tag: 'h2', className: 'text-lg font-bold' }, { label: 'H3', tag: 'h3', className: 'text-base font-bold' },
    ];

    return (
        <div className="w-full bg-card border-b border-border">
             <div className="flex flex-wrap items-center justify-center gap-2 p-2">
                {/* History */}
                {historyButtons.map(btn => (
                    <ToolbarButton key={btn.label} {...btn} isActive={false} onClick={() => onCommand(btn.command)} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                ))}
                <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>

                {/* Format Dropdown */}
                <div className="relative shrink-0" ref={headingDropdownRef}>
                    <button className="h-8 px-2 flex items-center gap-1 bg-card border border-border rounded-md hover:bg-secondary text-xs font-medium w-20 justify-between" onClick={() => setShowHeadingDropdown(!showHeadingDropdown)}>
                        <span className="truncate">Normal</span><ChevronDownIcon className="w-3 h-3 opacity-50" />
                    </button>
                    {showHeadingDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-32 bg-popover border border-border rounded-md shadow-lg z-50 py-1">
                            {headings.map(h => (
                                <button key={h.tag} onClick={() => handleHeadingChange(h.tag)} className={`block w-full text-left px-3 py-1.5 hover:bg-muted ${h.className} ${activeButtons.includes(h.tag) ? 'bg-primary/10 text-primary' : ''}`}>{h.label}</button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Font Dropdown */}
                <div className="relative shrink-0" ref={fontDropdownRef}>
                    <button className="h-8 w-20 flex items-center justify-between px-2 rounded-md hover:bg-secondary bg-card border border-border text-xs font-medium" onClick={() => setShowFontDropdown(!showFontDropdown)} title="Font Family">
                        <span className="truncate">Arial</span><ChevronDownIcon className="w-3 h-3 opacity-50" />
                    </button>
                    {showFontDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-48 bg-popover border border-border rounded-md shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                            {initialFonts.map(f => (
                                <button key={f.name} onClick={() => handleFontChange(f.family)} className="w-full text-left px-3 py-2 hover:bg-muted text-sm truncate" style={{ fontFamily: f.family }}>{f.name}</button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Size Dropdown */}
                <div className="relative shrink-0" ref={sizeDropdownRef}>
                    <button className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary bg-card border border-border" onClick={() => setShowSizeDropdown(!showSizeDropdown)} title="Font Size">
                        <TextSizeIcon className="w-4 h-4" />
                    </button>
                    {showSizeDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-24 bg-popover border border-border rounded-md shadow-lg z-50 py-1">
                            {fontSizes.map(s => (
                                <button key={s.label} onClick={() => handleSizeChange(s.value)} className="block w-full text-left px-3 py-2 text-xs hover:bg-muted">{s.label}</button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>

                {/* Row 2 Ideal: B/I/U, Color, Align */}
                {formatButtons.map(btn => (
                    <ToolbarButton key={btn.label} {...btn} isActive={activeButtons.includes(btn.command) || (btn.value ? activeButtons.includes(btn.value) : false)} onClick={() => onCommand(btn.command, btn.value)} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                ))}

                <div className="relative shrink-0 flex gap-1" ref={colorPickerRef}>
                    <button className={`h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary border border-border ${showColorPicker === 'text' ? 'bg-muted' : 'bg-card'}`} onClick={() => setShowColorPicker(showColorPicker === 'text' ? null : 'text')} title="Text Color">
                        <TextColorIcon className="w-4 h-4" />
                    </button>
                    <button className={`h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary border border-border ${showColorPicker === 'background' ? 'bg-muted' : 'bg-card'}`} onClick={() => setShowColorPicker(showColorPicker === 'background' ? null : 'background')} title="Highlight Color">
                        <HighlighterIcon className="w-4 h-4" />
                    </button>
                    {showColorPicker && (
                        <div className="absolute top-full mt-1 left-0 w-48 bg-popover border border-border rounded-md shadow-lg z-50 p-2">
                            <div className="grid grid-cols-8 gap-1">
                                {colors.map(color => (
                                    <button key={color} onClick={() => handleColorChange(color)} className="w-5 h-5 rounded-full border border-border/20 hover:scale-110 transition-transform" style={{ backgroundColor: color }} title={color} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {extraFormatButtons.map(btn => (
                    <ToolbarButton key={btn.label} {...btn} isActive={activeButtons.includes(btn.command) || (btn.value ? activeButtons.includes(btn.value) : false)} onClick={() => onCommand(btn.command, btn.value)} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                ))}

                <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>

                {alignmentButtons.map(btn => (
                    <ToolbarButton key={btn.label} {...btn} isActive={activeButtons.includes(btn.command)} onClick={() => { onCommand(btn.command); toggleActiveButton(btn.command); }} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                ))}

                {listButtons.map(btn => (
                    <ToolbarButton key={btn.label} {...btn} isActive={activeButtons.includes(btn.command)} onClick={() => { onCommand(btn.command); toggleActiveButton(btn.command); }} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                ))}

                <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>

                {insertButtons.map(btn => (
                    <ToolbarButton key={btn.label} {...btn} isActive={false} onClick={() => onCommand(btn.command)} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                ))}

            </div>
        </div>
    );
};

export default Toolbar;