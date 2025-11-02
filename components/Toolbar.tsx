import React, { useState, useRef, useEffect } from 'react';
import { 
    BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon, LinkIcon, HeadingIcon, QuoteIcon,
    HighlighterIcon, PaletteIcon, AlignLeftIcon, AlignCenterIcon, AlignRightIcon, TableIcon, 
    TextSizeIcon, FontIcon, ColumnsIcon
} from './Icons.tsx';

type ToolbarButtonProps = {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  isActive: boolean;
  onClick: () => void;
  tooltip: string | null;
  showTooltip: (label: string) => void;
  hideTooltip: () => void;
};

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ label, icon: Icon, isActive, onClick, tooltip, showTooltip, hideTooltip }) => (
    <div className="relative" onMouseEnter={() => showTooltip(label)} onMouseLeave={hideTooltip}>
        <button
            className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-200 ${
                isActive ? "bg-primary/20" : ""
            } hover:bg-primary/10 focus:outline-none`}
            aria-label={label}
            onClick={onClick}
        >
            <Icon className="h-4 w-4 text-foreground" />
        </button>
        {tooltip === label && (
            <div className="text-nowrap font-medium absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow-lg">
                {label}
            </div>
        )}
    </div>
);

type ToolbarProps = {
    activeButtons: string[];
    onCommand: (command: string, value?: any) => void;
    toggleActiveButton: (button: string) => void;
};

const Toolbar: React.FC<ToolbarProps> = ({ activeButtons, onCommand, toggleActiveButton }) => {
    const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
    const [tooltip, setTooltip] = useState<string | null>(null);
    const [showSizeDropdown, setShowSizeDropdown] = useState(false);
    const sizeDropdownRef = useRef<HTMLDivElement>(null);
    const [showFontDropdown, setShowFontDropdown] = useState(false);
    const fontDropdownRef = useRef<HTMLDivElement>(null);
    const [showColorPicker, setShowColorPicker] = useState<null | 'text' | 'background'>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(event.target as Node)) {
                setShowSizeDropdown(false);
            }
            if (fontDropdownRef.current && !fontDropdownRef.current.contains(event.target as Node)) {
                setShowFontDropdown(false);
            }
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
                setShowColorPicker(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const showTooltip = (label: string) => setTooltip(label);
    const hideTooltip = () => setTooltip(null);

    const handleTextAlign = (align: 'left' | 'center' | 'right') => {
        setTextAlign(align);
        onCommand(`justify${align.charAt(0).toUpperCase() + align.slice(1)}`);
    };
    
    const handleSizeChange = (size: number) => {
        onCommand('fontSize', size);
        setShowSizeDropdown(false);
    };
    
    const handleFontChange = (fontFamily: string) => {
        onCommand('fontName', fontFamily);
        setShowFontDropdown(false);
    };

    const colors = [
        '#ffffff', '#000000', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
        '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc',
        '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#9fc5e8', '#b4a7d6', '#d5a6bd',
        '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0',
        '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3d85c6', '#674ea7', '#a64d79',
        '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#351c75', '#741b47',
    ];

    const handleColorChange = (color: string) => {
        if (showColorPicker === 'text') {
            onCommand('foreColor', color);
        } else if (showColorPicker === 'background') {
            onCommand('hiliteColor', color);
        }
        setShowColorPicker(null);
    };

    const buttons = [
        { label: 'Bold', icon: BoldIcon, command: 'bold' },
        { label: 'Italic', icon: ItalicIcon, command: 'italic' },
        { label: 'Underline', icon: UnderlineIcon, command: 'underline' },
        { label: 'Strikethrough', icon: StrikethroughIcon, command: 'strikeThrough' },
        { label: 'Link', icon: LinkIcon, command: 'createLink' },
        { label: 'Heading', icon: HeadingIcon, command: 'formatBlock', value: 'h2' },
        { label: 'Quote', icon: QuoteIcon, command: 'formatBlock', value: 'blockquote' },
        { label: 'Table', icon: TableIcon, command: 'insertTable' },
        { label: 'Columns', icon: ColumnsIcon, command: 'insertColumns' },
    ];

    const fontSizes = [
        { label: 'Small', value: 2 },
        { label: 'Normal', value: 3 },
        { label: 'Large', value: 5 },
        { label: 'Huge', value: 7 },
    ];

    const initialFonts = [
      { name: 'Default', family: 'var(--font-sans)' },
      { name: 'Serif', family: 'var(--font-serif)' },
      { name: 'Mono', family: 'var(--font-mono)' },
      { name: 'Abril Fatface', family: '"Abril Fatface", cursive' },
      { name: 'Alfa Slab One', family: '"Alfa Slab One", cursive' },
      { name: 'Anton', family: 'Anton, sans-serif' },
      { name: 'Arvo', family: 'Arvo, serif' },
      { name: 'Bangers', family: 'Bangers, cursive' },
      { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif' },
      { name: 'Bitter', family: 'Bitter, serif' },
      { name: 'Cabin', family: 'Cabin, sans-serif' },
      { name: 'Caveat', family: 'Caveat, cursive' },
      { name: 'Comfortaa', family: 'Comfortaa, sans-serif' },
      { name: 'Cormorant Garamond', family: '"Cormorant Garamond", serif' },
      { name: 'Crimson Text', family: '"Crimson Text", serif' },
      { name: 'Dancing Script', family: '"Dancing Script", cursive' },
      { name: 'DM Sans', family: '"DM Sans", sans-serif' },
      { name: 'EB Garamond', family: '"EB Garamond", serif' },
      { name: 'Indie Flower', family: '"Indie Flower", cursive' },
      { name: 'Inconsolata', family: 'Inconsolata, monospace' },
      { name: 'Inter', family: 'Inter, sans-serif' },
      { name: 'JetBrains Mono', family: '"JetBrains Mono", monospace' },
      { name: 'Josefin Sans', family: '"Josefin Sans", sans-serif' },
      { name: 'Lato', family: 'Lato, sans-serif' },
      { name: 'Lobster', family: 'Lobster, cursive' },
      { name: 'Lora', family: 'Lora, serif' },
      { name: 'Merriweather', family: 'Merriweather, serif' },
      { name: 'Montserrat', family: 'Montserrat, sans-serif' },
      { name: 'Nunito', family: 'Nunito, sans-serif' },
      { name: 'Open Sans', family: '"Open Sans", sans-serif' },
      { name: 'Oswald', family: 'Oswald, sans-serif' },
      { name: 'Pacifico', family: 'Pacifico, cursive' },
      { name: 'Patrick Hand', family: '"Patrick Hand", cursive' },
      { name: 'Permanent Marker', family: '"Permanent Marker", cursive' },
      { name: 'Playfair Display', family: '"Playfair Display", serif' },
      { name: 'Poppins', family: 'Poppins, sans-serif' },
      { name: 'PT Serif', family: '"PT Serif", serif' },
      { name: 'Raleway', family: 'Raleway, sans-serif' },
      { name: 'Righteous', family: 'Righteous, sans-serif' },
      { name: 'Roboto', family: 'Roboto, sans-serif' },
      { name: 'Rubik', family: 'Rubik, sans-serif' },
      { name: 'Shadows Into Light Two', family: '"Shadows Into Light Two", cursive' },
      { name: 'Source Code Pro', family: '"Source Code Pro", monospace' },
      { name: 'Space Grotesk', family: '"Space Grotesk", sans-serif' },
      { name: 'Space Mono', family: '"Space Mono", monospace' },
      { name: 'Ubuntu', family: 'Ubuntu, sans-serif' },
      { name: 'Work Sans', family: '"Work Sans", sans-serif' },
    ];

    const specialFonts = initialFonts.slice(0, 3);
    const googleFonts = initialFonts.slice(3).sort((a, b) => a.name.localeCompare(b.name));
    const fonts = [...specialFonts, ...googleFonts];


    const alignmentButtons = [
        { label: 'Align Left', icon: AlignLeftIcon, align: 'left' as const },
        { label: 'Align Center', icon: AlignCenterIcon, align: 'center' as const },
        { label: 'Align Right', icon: AlignRightIcon, align: 'right' as const },
    ];

    return (
        <div className="relative w-full flex items-center justify-center p-4">
            <div className="bg-secondary rounded-lg shadow-lg border border-primary/10 flex items-center flex-wrap justify-center gap-1 p-1">
                {buttons.slice(0, 4).map(btn => (
                    <ToolbarButton
                        key={btn.label}
                        label={btn.label}
                        icon={btn.icon}
                        isActive={activeButtons.includes(btn.command)}
                        onClick={() => {
                            onCommand(btn.command, btn.value);
                            if (btn.command !== 'createLink' && btn.command !== 'insertTable') {
                                toggleActiveButton(btn.command);
                            }
                        }}
                        tooltip={tooltip}
                        showTooltip={showTooltip}
                        hideTooltip={hideTooltip}
                    />
                ))}

                <div className="w-px h-6 bg-border mx-1"></div>
                
                <div className="relative" ref={fontDropdownRef}>
                    <div onMouseEnter={() => showTooltip('Font')} onMouseLeave={hideTooltip}>
                        <button
                            className="h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-200 hover:bg-primary/10 focus:outline-none"
                            aria-label="Font"
                            onClick={() => setShowFontDropdown(prev => !prev)}
                        >
                            <FontIcon className="h-4 w-4 text-foreground" />
                        </button>
                        {tooltip === 'Font' && (
                            <div className="text-nowrap font-medium absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow-lg">
                                Font
                            </div>
                        )}
                    </div>
                    {showFontDropdown && (
                        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-48 bg-popover border border-border rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                            {fonts.map(font => (
                                <button
                                    key={font.name}
                                    onClick={() => handleFontChange(font.family)}
                                    className="block w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent first:rounded-t-md last:rounded-b-md"
                                    style={{ fontFamily: font.family }}
                                >
                                    {font.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="relative" ref={sizeDropdownRef}>
                    <div onMouseEnter={() => showTooltip('Text Size')} onMouseLeave={hideTooltip}>
                        <button
                            className="h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-200 hover:bg-primary/10 focus:outline-none"
                            aria-label="Text Size"
                            onClick={() => setShowSizeDropdown(prev => !prev)}
                        >
                            <TextSizeIcon className="h-4 w-4 text-foreground" />
                        </button>
                        {tooltip === 'Text Size' && (
                            <div className="text-nowrap font-medium absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow-lg">
                                Text Size
                            </div>
                        )}
                    </div>
                    {showSizeDropdown && (
                        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-32 bg-popover border border-border rounded-md shadow-lg z-20">
                            {fontSizes.map(size => (
                                <button
                                    key={size.label}
                                    onClick={() => handleSizeChange(size.value)}
                                    className="block w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent first:rounded-t-md last:rounded-b-md"
                                >
                                    {size.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="relative" ref={colorPickerRef}>
                    <div className="flex items-center">
                        <div onMouseEnter={() => showTooltip('Text Color')} onMouseLeave={hideTooltip}>
                            <button
                                className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-200 ${showColorPicker === 'text' ? "bg-primary/20" : ""} hover:bg-primary/10 focus:outline-none`}
                                aria-label="Text Color"
                                onClick={() => setShowColorPicker(prev => prev === 'text' ? null : 'text')}
                            >
                                <PaletteIcon className="h-4 w-4 text-foreground" />
                            </button>
                            {tooltip === 'Text Color' && (
                                <div className="text-nowrap font-medium absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow-lg">
                                    Text Color
                                </div>
                            )}
                        </div>
                        <div onMouseEnter={() => showTooltip('Highlight Color')} onMouseLeave={hideTooltip}>
                            <button
                                className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-200 ${showColorPicker === 'background' ? "bg-primary/20" : ""} hover:bg-primary/10 focus:outline-none`}
                                aria-label="Highlight Color"
                                onClick={() => setShowColorPicker(prev => prev === 'background' ? null : 'background')}
                            >
                                <HighlighterIcon className="h-4 w-4 text-foreground" />
                            </button>
                            {tooltip === 'Highlight Color' && (
                                <div className="text-nowrap font-medium absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow-lg">
                                    Highlight Color
                                </div>
                            )}
                        </div>
                    </div>
                    {showColorPicker && (
                        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-48 bg-popover border border-border rounded-md shadow-lg z-20 p-2">
                            <div className='grid grid-cols-7 gap-1'>
                                {colors.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => handleColorChange(color)}
                                        className="w-5 h-5 rounded-full border border-border/20 transition-transform hover:scale-110"
                                        style={{ backgroundColor: color }}
                                        aria-label={color}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="w-px h-6 bg-border mx-1"></div>
                
                {buttons.slice(4).map(btn => (
                    <ToolbarButton
                        key={btn.label}
                        label={btn.label}
                        icon={btn.icon}
                        isActive={activeButtons.includes(btn.command)}
                        onClick={() => {
                            onCommand(btn.command, btn.value);
                            if (btn.command !== 'createLink' && btn.command !== 'insertTable') {
                                toggleActiveButton(btn.command);
                            }
                        }}
                        tooltip={tooltip}
                        showTooltip={showTooltip}
                        hideTooltip={hideTooltip}
                    />
                ))}
                
                <div className="w-px h-6 bg-border mx-1"></div>

                {alignmentButtons.map(btn => (
                     <ToolbarButton
                        key={btn.label}
                        label={btn.label}
                        icon={btn.icon}
                        isActive={textAlign === btn.align}
                        onClick={() => handleTextAlign(btn.align)}
                        tooltip={tooltip}
                        showTooltip={showTooltip}
                        hideTooltip={hideTooltip}
                    />
                ))}
            </div>
        </div>
    );
};

export default Toolbar;