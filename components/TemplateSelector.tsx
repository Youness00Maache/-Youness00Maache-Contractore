
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
  { id: 'standard', name: 'Standard' },
  { id: 'modern_blue', name: 'Modern' },
  { id: 'professional', name: 'Professional' },
  { id: 'warm', name: 'Warm' },
  { id: 'elegant', name: 'Elegant' },
  { id: 'tech', name: 'Tech' },
  { id: 'industrial', name: 'Industrial' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'bold', name: 'Bold' },
  { id: 'retro', name: 'Retro' },
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
        <Button variant="outline" onClick={() => setIsOpen(true)} className="flex items-center gap-2">
            <PaletteIcon className="w-4 h-4" />
            Customize Look
        </Button>

        {isOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <Card className="w-full max-w-md animate-fade-in-down max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xl">Customize Document</CardTitle>
                        <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                            <XCircleIcon className="w-6 h-6" />
                        </button>
                    </CardHeader>
                    <CardContent className="overflow-y-auto flex-1 space-y-6">
                        
                        {/* Layout Selection */}
                        <div className="space-y-3">
                            <Label className="text-base">1. Choose Layout</Label>
                            <div className="grid grid-cols-2 gap-3">
                                {layouts.map((l) => (
                                    <button
                                        key={l.id}
                                        onClick={() => setTempLayout(l.id)}
                                        className={`p-3 rounded-md border text-left transition-all ${
                                            tempLayout === l.id 
                                            ? 'border-primary bg-primary/10 ring-1 ring-primary' 
                                            : 'border-border hover:bg-secondary'
                                        }`}
                                    >
                                        <span className="font-medium text-sm">{l.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-border"></div>

                        {/* Color Selection */}
                        <div className="space-y-4">
                            <Label className="text-base">2. Choose Colors</Label>
                            
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <Label htmlFor="primaryColor" className="text-xs mb-1 block">Primary Color</Label>
                                    <div className="flex gap-3">
                                        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border shadow-sm shrink-0">
                                            <input 
                                                type="color" 
                                                id="primaryColor"
                                                value={primaryColor}
                                                onChange={(e) => setPrimaryColor(e.target.value)}
                                                className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                                            />
                                        </div>
                                        <input 
                                            type="text" 
                                            value={primaryColor} 
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                            className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm font-mono uppercase"
                                            placeholder="#000000"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="secondaryColor" className="text-xs mb-1 block">Secondary Color</Label>
                                    <div className="flex gap-3">
                                        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border shadow-sm shrink-0">
                                            <input 
                                                type="color" 
                                                id="secondaryColor"
                                                value={secondaryColor}
                                                onChange={(e) => setSecondaryColor(e.target.value)}
                                                className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                                            />
                                        </div>
                                         <input 
                                            type="text" 
                                            value={secondaryColor} 
                                            onChange={(e) => setSecondaryColor(e.target.value)}
                                            className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm font-mono uppercase"
                                            placeholder="#000000"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                    </CardContent>
                    <CardFooter className="flex justify-end gap-2 pt-2 border-t border-border">
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={handleApply}>Apply Changes</Button>
                    </CardFooter>
                </Card>
            </div>
        )}
    </>
  );
};

export default TemplateSelector;
