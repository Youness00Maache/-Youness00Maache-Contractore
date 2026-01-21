import React, { useState, useMemo } from 'react';
import { Label } from './ui/Label.tsx';
import { Button } from './ui/Button.tsx';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card.tsx';
import { PaletteIcon, XCircleIcon, SearchIcon } from './Icons.tsx';

interface TemplateSelectorProps {
    selectedTemplateId: string;
    onSelectTemplate: (id: string) => void;
    themeColors?: { primary: string, secondary: string };
    onColorsChange: (colors: { primary: string, secondary: string }) => void;
}

// 6 Visually Distinct Templates
const templateColors: Record<string, { primary: string, secondary: string }> = {
    // Classic Frame - Traditional bordered layout
    professional: { primary: '#2c3e50', secondary: '#34495e' },
    // Modern Header - Bold colored top bar
    modern_blue: { primary: '#3498db', secondary: '#2980b9' },
    // Elegant Certificate - Purple themed with special borders
    elegant: { primary: '#8e44ad', secondary: '#9b59b6' },
    // Minimalist Clean - Gray, maximum whitespace
    minimal: { primary: '#95a5a6', secondary: '#7f8c8d' },
    // Bold Statement - Black with high contrast
    bold: { primary: '#000000', secondary: '#000000' },
    // French Invoice - Warm gradient theme with professional styling
    french_invoice: { primary: '#191919', secondary: '#FFF2EA' },
    // Designer Templates
    template_1: { primary: '#333333', secondary: '#555555' },
    template_2: { primary: '#333333', secondary: '#555555' },
    template_3: { primary: '#333333', secondary: '#555555' },
    template_4: { primary: '#333333', secondary: '#555555' },
    template_5: { primary: '#333333', secondary: '#555555' },
    template_6: { primary: '#333333', secondary: '#555555' },
    template_7: { primary: '#333333', secondary: '#555555' },
    template_8: { primary: '#333333', secondary: '#555555' },
    template_9: { primary: '#333333', secondary: '#555555' },
    template_10: { primary: '#333333', secondary: '#555555' },
    template_11: { primary: '#333333', secondary: '#555555' },
    template_12: { primary: '#333333', secondary: '#555555' },
    template_html: { primary: '#000000', secondary: '#666666' },
    template_html_2: { primary: '#2c3e50', secondary: '#1a1a1a' },
    template_html_3: { primary: '#111111', secondary: '#333333' },
    template_html_4: { primary: '#4F46E5', secondary: '#7C3AED' },
    // New Advanced Templates
    template_neon: { primary: '#00F0FF', secondary: '#FF006E' },
    template_luxury: { primary: '#D4AF37', secondary: '#0A1931' },
    template_nature: { primary: '#2D6A4F', secondary: '#6C584C' },
    template_geometric: { primary: '#E63946', secondary: '#1D3557' },
    template_pastel: { primary: '#FFB5D8', secondary: '#C9ADA7' },
    // Set 2 Templates
    template_vintage: { primary: '#8B4513', secondary: '#FDF5E6' },
    template_blueprint: { primary: '#003366', secondary: '#FFFFFF' },
    template_memphis: { primary: '#FFD700', secondary: '#00CED1' },
    template_crimson: { primary: '#DC143C', secondary: '#0A0A0A' },
    template_watercolor: { primary: '#EE82EE', secondary: '#87CEFA' },
    // Set 3 Templates
    template_swiss: { primary: '#FF0000', secondary: '#FFFFFF' },
    template_space: { primary: '#050510', secondary: '#BB86FC' },
    template_retro: { primary: '#33ff00', secondary: '#000000' },
    template_pop: { primary: '#fff000', secondary: '#ff00de' },
    template_serif: { primary: '#333333', secondary: '#FDFBF7' },
};

const layouts = [
    {
        id: 'professional',
        name: 'Classic Frame',
        description: 'Traditional double border with centered layout',
        type: 'Certificate Style'
    },
    {
        id: 'modern_blue',
        name: 'Modern Header',
        description: 'Bold colored header bar with clean content area',
        type: 'Modern Style'
    },
    {
        id: 'elegant',
        name: 'Elegant Certificate',
        description: 'Sophisticated purple theme with refined borders',
        type: 'Certificate Style'
    },
    {
        id: 'minimal',
        name: 'Minimalist',
        description: 'Ultra-clean design with maximum breathing room',
        type: 'Modern Style'
    },
    {
        id: 'bold',
        name: 'Bold Statement',
        description: 'High-contrast black theme for impact',
        type: 'Modern Style'
    },
    {
        id: 'french_invoice',
        name: 'French Invoice',
        description: 'Professional invoice with warm gradients and decorative elements',
        type: 'Invoice Style'
    },
    {
        id: 'template_1',
        name: 'Designer Template 1',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_2',
        name: 'Designer Template 2',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_3',
        name: 'Designer Template 3',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_4',
        name: 'Designer Template 4',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_5',
        name: 'Designer Template 5',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_6',
        name: 'Designer Template 6',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_7',
        name: 'Designer Template 7',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_8',
        name: 'Designer Template 8',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_9',
        name: 'Designer Template 9',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_10',
        name: 'Designer Template 10',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_11',
        name: 'Designer Template 11',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_12',
        name: 'Designer Template 12',
        description: 'Professional designer layout with custom background',
        type: 'Designer'
    },
    {
        id: 'template_html',
        name: 'Modern Advanced HTML',
        description: 'Premium HTML-based layout with advanced styling',
        type: 'HTML Style'
    },
    {
        id: 'template_html_2',
        name: 'Luxury Split Design',
        description: 'Stunning high-end interface with dark sidebar',
        type: 'HTML Style'
    },
    {
        id: 'template_html_3',
        name: 'Premium Minimalist',
        description: 'Clean, agency-style layout with focus on typography',
        type: 'HTML Style'
    },
    {
        id: 'template_html_4',
        name: 'Gradient Border Premium',
        description: 'Modern design with gradient accents and rounded corners',
        type: 'HTML Style'
    },
    // --- 5 NEW PREMIUM TEMPLATES ---
    {
        id: 'template_neon',
        name: 'Neon Cyberpunk',
        description: 'Dark futuristic design with glowing neon accents',
        type: 'HTML Style'
    },
    {
        id: 'template_luxury',
        name: 'Luxury Gold & Navy',
        description: 'Premium business elegance with gold ornamentals',
        type: 'HTML Style'
    },
    {
        id: 'template_nature',
        name: 'Organic Nature',
        description: 'Earth tones with flowing shapes and eco-friendly aesthetic',
        type: 'HTML Style'
    },
    {
        id: 'template_geometric',
        name: 'Geometric Bold',
        description: 'Sharp angles and modern patterns with high contrast',
        type: 'HTML Style'
    },
    {
        id: 'template_pastel',
        name: 'Pastel Soft',
        description: 'Gentle gradients with rounded friendly design',
        type: 'HTML Style'
    },
    // --- 5 MORE (SET 2) ---
    {
        id: 'template_vintage',
        name: 'Vintage Craft',
        description: 'Textured paper with typewriter typography',
        type: 'HTML Style'
    },
    {
        id: 'template_blueprint',
        name: 'Blueprint Tech',
        description: 'Engineering blueprint look with grid lines',
        type: 'HTML Style'
    },
    {
        id: 'template_memphis',
        name: 'Abstract Memphis',
        description: '80s geometric patterns with vibrant shapes',
        type: 'HTML Style'
    },
    {
        id: 'template_crimson',
        name: 'Crimson Noir',
        description: 'Dark mode with bold red accents and cinematic feel',
        type: 'HTML Style'
    },
    {
        id: 'template_watercolor',
        name: 'Watercolor Artistic',
        description: 'Soft watercolor splashes and artistic layout',
        type: 'HTML Style'
    },
    // --- 5 MORE (SET 3) ---
    {
        id: 'template_swiss',
        name: 'Swiss Grid Style',
        description: 'Clean red/white typographic design',
        type: 'HTML Style'
    },
    {
        id: 'template_space',
        name: 'Space Odyssey',
        description: 'Futuristic deep space background with glowing text',
        type: 'HTML Style'
    },
    {
        id: 'template_retro',
        name: 'Retro Terminal',
        description: 'Green phosphor code-style hacker aesthetic',
        type: 'HTML Style'
    },
    {
        id: 'template_pop',
        name: 'Playful Pop Art',
        description: 'Vibrant comic book style with halftones',
        type: 'HTML Style'
    },
    {
        id: 'template_serif',
        name: 'Classical Elegant',
        description: 'Traditional refined design with serif typography',
        type: 'HTML Style'
    },
];

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ selectedTemplateId, onSelectTemplate, themeColors, onColorsChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [tempLayout, setTempLayout] = useState(selectedTemplateId);
    const [primaryColor, setPrimaryColor] = useState(themeColors?.primary || templateColors[selectedTemplateId]?.primary || '#2c3e50');
    const [secondaryColor, setSecondaryColor] = useState(themeColors?.secondary || templateColors[selectedTemplateId]?.secondary || '#34495e');

    // Search and filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    // Get unique categories
    const categories = useMemo(() => {
        const types = [...new Set(layouts.map(l => l.type))];
        return ['All', ...types];
    }, []);

    // Filter layouts based on search and category
    const filteredLayouts = useMemo(() => {
        return layouts.filter(layout => {
            const matchesSearch = layout.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                layout.description.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = selectedCategory === 'All' || layout.type === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [searchQuery, selectedCategory]);

    // When template is selected, update colours to match template's default palette
    const handleTemplateSelect = (id: string) => {
        setTempLayout(id);
        const colors = templateColors[id];
        if (colors) {
            setPrimaryColor(colors.primary);
            setSecondaryColor(colors.secondary);
        }
    };

    const handleApply = () => {
        onSelectTemplate(tempLayout);
        onColorsChange({ primary: primaryColor, secondary: secondaryColor });
        setIsOpen(false);
    };

    return (
        <>
            <Button variant="outline" onClick={() => setIsOpen(true)} className="flex items-center gap-2 w-full sm:w-auto justify-center">
                <PaletteIcon className="w-4 h-4" />
                Customize Look
            </Button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-3xl animate-fade-in-down max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border">
                            <CardTitle className="text-xl">Customize Document</CardTitle>
                            <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-destructive transition-colors">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </CardHeader>
                        <CardContent className="overflow-y-auto flex-1 space-y-6 pt-6">

                            {/* Layout Selection */}
                            <div className="space-y-3">
                                <Label className="text-base font-semibold">1. Choose Layout ({filteredLayouts.length} templates)</Label>

                                {/* Search */}
                                <div className="relative">
                                    <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search templates..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                {/* Category Filter */}
                                <div className="flex gap-2 flex-wrap">
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setSelectedCategory(cat)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedCategory === cat
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                                }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Template Grid */}
                                <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-2">
                                    {filteredLayouts.map((l) => (
                                        <button
                                            key={l.id}
                                            onClick={() => handleTemplateSelect(l.id)}
                                            className={`p-2.5 rounded-lg border text-left transition-all relative overflow-hidden ${tempLayout === l.id
                                                ? 'border-primary bg-primary/5 ring-2 ring-primary shadow-sm'
                                                : 'border-border hover:bg-secondary hover:border-primary/50'
                                                }`}
                                        >
                                            <span className="font-semibold text-xs block truncate">{l.name}</span>
                                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{l.type}</span>
                                        </button>
                                    ))}
                                </div>

                                {filteredLayouts.length === 0 && (
                                    <div className="text-center py-8 text-muted-foreground text-sm">
                                        No templates found matching "{searchQuery}"
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-border"></div>

                            {/* Color Selection */}
                            <div className="space-y-4">
                                <Label className="text-base font-semibold">2. Choose Colors</Label>

                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <Label htmlFor="primaryColor" className="text-xs mb-1.5 block text-muted-foreground font-medium uppercase tracking-wider">Primary Color</Label>
                                        <div className="flex gap-3 items-center">
                                            <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-border shadow-sm shrink-0 transition-transform hover:scale-105">
                                                <input
                                                    type="color"
                                                    id="primaryColor"
                                                    value={primaryColor}
                                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                                    className="absolute -top-4 -left-4 w-24 h-24 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={primaryColor}
                                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-mono uppercase focus:ring-2 focus:ring-primary"
                                                    placeholder="#000000"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="secondaryColor" className="text-xs mb-1.5 block text-muted-foreground font-medium uppercase tracking-wider">Secondary Color</Label>
                                        <div className="flex gap-3 items-center">
                                            <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-border shadow-sm shrink-0 transition-transform hover:scale-105">
                                                <input
                                                    type="color"
                                                    id="secondaryColor"
                                                    value={secondaryColor}
                                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                                    className="absolute -top-4 -left-4 w-24 h-24 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={secondaryColor}
                                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-mono uppercase focus:ring-2 focus:ring-primary"
                                                    placeholder="#000000"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </CardContent>
                        <CardFooter className="flex justify-end gap-3 pt-4 border-t border-border bg-muted/20 rounded-b-lg">
                            <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
                            <Button onClick={handleApply}>Apply Changes</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </>
    );
};

export default TemplateSelector;