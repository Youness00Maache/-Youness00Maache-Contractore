import React, { useState } from 'react';
import { Label } from './ui/Label.tsx';
import { Button } from './ui/Button.tsx';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card.tsx';
import { PaletteIcon, XCircleIcon } from './Icons.tsx';

interface TemplateSelectorProps {
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  themeColors?: { primary: string, secondary: string };
  onColorsChange: (colors: { primary: string, secondary: string }) => void;
}

const layouts = [
  { id: 'standard', name: 'Standard', type: 'Classic' },
  { id: 'modern_blue', name: 'Modern', type: 'Modern' },
  { id: 'professional', name: 'Professional', type: 'Classic' },
  { id: 'tech', name: 'Tech', type: 'Modern' },
  { id: 'elegant', name: 'Elegant', type: 'Classic' },
  { id: 'industrial', name: 'Industrial', type: 'Modern' },
  { id: 'warm', name: 'Warm', type: 'Classic' },
  { id: 'bold', name: 'Bold', type: 'Modern' },
  { id: 'minimal', name: 'Minimal', type: 'Modern' },
  { id: 'retro', name: 'Retro', type: 'Classic' },
];

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ selectedTemplateId, onSelectTemplate, themeColors, onColorsChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempLayout, setTempLayout] = useState(selectedTemplateId);
  const [primaryColor, setPrimaryColor] = useState(themeColors?.primary || '#0000bb');
  const [secondaryColor, setSecondaryColor] = useState(themeColors?.secondary || '#666666');

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
                <Card className="w-full max-w-md animate-fade-in-down max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border">
                        <CardTitle className="text-xl">Customize Document</CardTitle>
                        <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <XCircleIcon className="w-6 h-6" />
                        </button>
                    </CardHeader>
                    <CardContent className="overflow-y-auto flex-1 space-y-6 pt-6">
                        
                        {/* Layout Selection */}
                        <div className="space-y-3">
                            <Label className="text-base font-semibold">1. Choose Layout</Label>
                            <div className="grid grid-cols-2 gap-3">
                                {layouts.map((l) => (
                                    <button
                                        key={l.id}
                                        onClick={() => setTempLayout(l.id)}
                                        className={`p-3 rounded-lg border text-left transition-all relative overflow-hidden ${
                                            tempLayout === l.id 
                                            ? 'border-primary bg-primary/5 ring-2 ring-primary shadow-sm' 
                                            : 'border-border hover:bg-secondary hover:border-primary/50'
                                        }`}
                                    >
                                        <span className="font-semibold text-sm block">{l.name}</span>
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{l.type}</span>
                                    </button>
                                ))}
                            </div>
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