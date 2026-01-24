import React, { useState } from 'react';
import { EMAIL_TEMPLATES, EmailTemplateDefinition } from '../utils/emailTemplates.ts';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { XCircleIcon, CheckCircleIcon } from './Icons.tsx';

interface TemplateSelectorProps {
    onSelect: (template: EmailTemplateDefinition) => void;
    onClose: () => void;
    selectedTemplateId?: string;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelect, onClose, selectedTemplateId }) => {
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [selectedId, setSelectedId] = useState<string | undefined>(selectedTemplateId);

    const categories = [
        { id: 'all', label: 'All Templates', count: EMAIL_TEMPLATES.length },
        { id: 'modern', label: '✨ Modern', count: EMAIL_TEMPLATES.filter(t => t.category === 'modern').length },
        { id: 'corporate', label: '🏢 Corporate', count: EMAIL_TEMPLATES.filter(t => t.category === 'corporate').length },
        { id: 'minimalist', label: '⚪ Minimalist', count: EMAIL_TEMPLATES.filter(t => t.category === 'minimalist').length },
        { id: 'billing', label: '💼 Billing', count: EMAIL_TEMPLATES.filter(t => t.category === 'billing').length },
        { id: 'creative', label: '🎨 Creative', count: EMAIL_TEMPLATES.filter(t => t.category === 'creative').length },
    ];

    const filteredTemplates = activeCategory === 'all'
        ? EMAIL_TEMPLATES
        : EMAIL_TEMPLATES.filter(t => t.category === activeCategory);

    const handleSelect = (template: EmailTemplateDefinition) => {
        setSelectedId(template.id);
        onSelect(template);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
            <Card className="w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl relative">
                <CardHeader className="border-b border-border flex-shrink-0 relative">
                    <CardTitle className="text-2xl flex items-center justify-between">
                        <span>Email Template Gallery</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="rounded-full w-10 h-10 p-0 flex items-center justify-center hover:bg-secondary"
                        >
                            <XCircleIcon className="w-5 h-5" />
                        </Button>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-2">
                        Choose a professional design for your email. Your branding will be automatically applied.
                    </p>
                </CardHeader>

                {/* Category Tabs */}
                <div className="border-b border-border px-6 py-3 flex gap-2 overflow-x-auto flex-shrink-0">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeCategory === cat.id
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                }`}
                        >
                            {cat.label} ({cat.count})
                        </button>
                    ))}
                </div>

                <CardContent className="p-6 overflow-y-auto flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredTemplates.map(template => {
                            const isSelected = selectedId === template.id;
                            return (
                                <div
                                    key={template.id}
                                    onClick={() => handleSelect(template)}
                                    className={`group relative cursor-pointer rounded-xl border-2 transition-all hover:shadow-lg ${isSelected
                                            ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2'
                                            : 'border-border hover:border-primary/50'
                                        }`}
                                >
                                    {/* Preview Card */}
                                    <div className="p-4">
                                        <div className="aspect-video bg-gradient-to-br from-secondary/30 to-secondary/10 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                                            {/* Template Preview Mockup */}
                                            <div className="w-full h-full p-2 overflow-hidden">
                                                <div className="w-full h-full bg-white rounded shadow-inner flex flex-col text-[6px] leading-tight p-1 gap-1">
                                                    <div className="h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-sm"></div>
                                                    <div className="flex-1 space-y-0.5 p-1">
                                                        <div className="h-1 w-3/4 bg-gray-300 rounded"></div>
                                                        <div className="h-1 w-full bg-gray-200 rounded"></div>
                                                        <div className="h-1 w-5/6 bg-gray-200 rounded"></div>
                                                    </div>
                                                    <div className="h-2 bg-gray-100 rounded-sm"></div>
                                                </div>
                                            </div>

                                            {isSelected && (
                                                <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                                    <CheckCircleIcon className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>

                                        <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                                        <p className="text-xs text-muted-foreground capitalize">
                                            {template.category}
                                        </p>
                                    </div>

                                    {/* Hover Overlay */}
                                    <div className={`absolute inset-0 bg-primary/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center ${isSelected ? 'opacity-100' : ''}`}>
                                        <Button
                                            size="sm"
                                            className="shadow-lg"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSelect(template);
                                                onClose();
                                            }}
                                        >
                                            {isSelected ? 'Selected' : 'Use This Template'}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filteredTemplates.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>No templates found in this category.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default TemplateSelector;
