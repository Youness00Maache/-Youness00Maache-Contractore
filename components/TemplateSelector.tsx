import React, { useState } from 'react';
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

// Template color definitions matching pdfGenerator.ts
const templateColors: Record<string, { primary: string, secondary: string }> = {
    // Existing Templates
    standard: { primary: '#000000', secondary: '#666666' },
    professional: { primary: '#2c3e50', secondary: '#34495e' },
    elegant: { primary: '#8e44ad', secondary: '#9b59b6' },
    warm: { primary: '#d35400', secondary: '#e67e22' },
    retro: { primary: '#c0392b', secondary: '#e74c3c' },
    modern_blue: { primary: '#3498db', secondary: '#2980b9' },
    tech: { primary: '#16a085', secondary: '#1abc9c' },
    industrial: { primary: '#f39c12', secondary: '#d35400' },
    minimal: { primary: '#95a5a6', secondary: '#7f8c8d' },
    bold: { primary: '#000000', secondary: '#000000' },
    // Classic Professional
    executive_classic: { primary: '#1e3a8a', secondary: '#374151' },
    corporate_standard: { primary: '#4b5563', secondary: '#6b7280' },
    traditional_blue: { primary: '#1e40af', secondary: '#3b82f6' },
    business_formal: { primary: '#0f172a', secondary: '#334155' },
    // Modern Minimalist
    scandinavian: { primary: '#64748b', secondary: '#94a3b8' },
    tech_modern: { primary: '#0ea5e9', secondary: '#06b6d4' },
    digital_first: { primary: '#8b5cf6', secondary: '#a78bfa' },
    clean_lines: { primary: '#14b8a6', secondary: '#2dd4bf' },
    contemporary: { primary: '#6366f1', secondary: '#818cf8' },
    // Corporate
    enterprise: { primary: '#1e40af', secondary: '#2563eb' },
    financial: { primary: '#047857', secondary: '#059669' },
    legal_pro: { primary: '#0369a1', secondary: '#0284c7' },
    consulting: { primary: '#475569', secondary: '#64748b' },
    corporate_premium: { primary: '#7c3aed', secondary: '#8b5cf6' },
    // Creative
    artistic: { primary: '#ec4899', secondary: '#f472b6' },
    vibrant_pro: { primary: '#dc2626', secondary: '#ef4444' },
    designer: { primary: '#7c3aed', secondary: '#a855f7' },
    trendy: { primary: '#ea580c', secondary: '#f97316' },
    // Construction
    construction_pro: { primary: '#f97316', secondary: '#fb923c' },
    builder_modern: { primary: '#eab308', secondary: '#facc15' },
    trade_pro: { primary: '#0891b2', secondary: '#06b6d4' },
    project_manager: { primary: '#15803d', secondary: '#16a34a' },
    // Premium
    gold_standard: { primary: '#d97706', secondary: '#f59e0b' },
    platinum: { primary: '#71717a', secondary: '#a1a1aa' },
    executive_suite: { primary: '#18181b', secondary: '#3f3f46' },
    prestige: { primary: '#831843', secondary: '#9f1239' },
};

const layouts = [
    // Existing Templates
    { id: 'standard', name: 'Standard', type: 'Classic', category: 'Classic' },
    { id: 'modern_blue', name: 'Modern Blue', type: 'Modern', category: 'Modern' },
    { id: 'professional', name: 'Professional', type: 'Classic', category: 'Classic' },
    { id: 'tech', name: 'Tech', type: 'Modern', category: 'Modern' },
    { id: 'elegant', name: 'Elegant', type: 'Classic', category: 'Classic' },
    { id: 'industrial', name: 'Industrial', type: 'Modern', category: 'Construction' },
    { id: 'warm', name: 'Warm', type: 'Classic', category: 'Classic' },
    { id: 'bold', name: 'Bold', type: 'Modern', category: 'Modern' },
    { id: 'minimal', name: 'Minimal', type: 'Modern', category: 'Modern' },
    { id: 'retro', name: 'Retro', type: 'Classic', category: 'Classic' },

    // New Templates - Classic Professional
    { id: 'executive_classic', name: 'Executive Classic', type: 'Classic', category: 'Classic' },
    { id: 'corporate_standard', name: 'Corporate Standard', type: 'Classic', category: 'Corporate' },
    { id: 'traditional_blue', name: 'Traditional Blue', type: 'Classic', category: 'Classic' },
    { id: 'business_formal', name: 'Business Formal', type: 'Classic', category: 'Corporate' },

    // New Templates - Modern Minimalist
    { id: 'scandinavian', name: 'Scandinavian', type: 'Modern', category: 'Modern' },
    { id: 'tech_modern', name: 'Tech Modern', type: 'Modern', category: 'Modern' },
    { id: 'digital_first', name: 'Digital First', type: 'Modern', category: 'Modern' },
    { id: 'clean_lines', name: 'Clean Lines', type: 'Modern', category: 'Modern' },
    { id: 'contemporary', name: 'Contemporary', type: 'Modern', category: 'Modern' },

    // New Templates - Corporate
    { id: 'enterprise', name: 'Enterprise', type: 'Modern', category: 'Corporate' },
    { id: 'financial', name: 'Financial', type: 'Classic', category: 'Corporate' },
    { id: 'legal_pro', name: 'Legal Pro', type: 'Classic', category: 'Corporate' },
    { id: 'consulting', name: 'Consulting', type: 'Modern', category: 'Corporate' },
    { id: 'corporate_premium', name: 'Corporate Premium', type: 'Classic', category: 'Corporate' },

    // New Templates - Creative
    { id: 'artistic', name: 'Artistic', type: 'Modern', category: 'Creative' },
    { id: 'vibrant_pro', name: 'Vibrant Pro', type: 'Modern', category: 'Creative' },
    { id: 'designer', name: 'Designer', type: 'Modern', category: 'Creative' },
    { id: 'trendy', name: 'Trendy', type: 'Modern', category: 'Creative' },

    // New Templates - Construction/Contractor
    { id: 'construction_pro', name: 'Construction Pro', type: 'Modern', category: 'Construction' },
    { id: 'builder_modern', name: 'Builder Modern', type: 'Modern', category: 'Construction' },
    { id: 'trade_pro', name: 'Trade Pro', type: 'Modern', category: 'Construction' },
    { id: 'project_manager', name: 'Project Manager', type: 'Modern', category: 'Construction' },

    // New Templates - Premium/Luxury
    { id: 'gold_standard', name: 'Gold Standard', type: 'Classic', category: 'Premium' },
    { id: 'platinum', name: 'Platinum', type: 'Classic', category: 'Premium' },
    { id: 'executive_suite', name: 'Executive Suite', type: 'Classic', category: 'Premium' },
    { id: 'prestige', name: 'Prestige', type: 'Classic', category: 'Premium' },
];

const categories = ['All', 'Classic', 'Modern', 'Corporate', 'Creative', 'Construction', 'Premium'];

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ selectedTemplateId, onSelectTemplate, themeColors, onColorsChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [tempLayout, setTempLayout] = useState(selectedTemplateId);
    const [primaryColor, setPrimaryColor] = useState(themeColors?.primary || templateColors[selectedTemplateId]?.primary || '#0000bb');
    const [secondaryColor, setSecondaryColor] = useState(themeColors?.secondary || templateColors[selectedTemplateId]?.secondary || '#666666');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

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

    const filteredLayouts = layouts.filter(l => {
        const matchesCategory = selectedCategory === 'All' || l.category === selectedCategory;
        const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.type.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

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