
import React from 'react';
import { Label } from './ui/Label.tsx';

interface TemplateSelectorProps {
  selected: string;
  onSelect: (id: string) => void;
}

const templates = [
  { id: 'standard', name: 'Standard', color: '#333333' },
  { id: 'modern_blue', name: 'Modern Blue', color: '#3498db' },
  { id: 'professional', name: 'Professional', color: '#2c3e50' },
  { id: 'warm', name: 'Warm', color: '#d35400' },
  { id: 'elegant', name: 'Elegant', color: '#8e44ad' },
  { id: 'tech', name: 'Tech', color: '#16a085' },
  { id: 'industrial', name: 'Industrial', color: '#f39c12' },
  { id: 'minimal', name: 'Minimal', color: '#95a5a6' },
  { id: 'bold', name: 'Bold', color: '#000000' },
  { id: 'retro', name: 'Retro', color: '#e67e22' },
];

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ selected, onSelect }) => {
  return (
    <div className="space-y-2">
      <Label>PDF Template</Label>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-2 p-2 rounded-md border transition-all text-left
              ${selected === t.id 
                ? 'border-primary bg-primary/10 ring-1 ring-primary' 
                : 'border-border hover:bg-secondary'
              }`}
          >
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }}></div>
            <span className="text-sm font-medium truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TemplateSelector;
