import React from 'react';
import { EMAIL_TEMPLATES, EmailTemplateDefinition, applyTemplateVariables } from '../utils/emailTemplates.ts';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { XCircleIcon, CheckCircleIcon } from './Icons.tsx';

const MOCK_VARS = (logoUrl?: string) => ({
    company_name: 'Acme Contracting',
    primary_color: '#2563eb',
    secondary_color: '#1e40af',
    user_name: 'Alex Johnson',
    user_job_title: 'Project Lead',
    body: `
        <p>This is a preview of how your email will look to your clients. We use professional layouts and typography to ensure your business stands out.</p>
        <p>All your documents, estimates, and invoices will be beautifully formatted and easy to read on any device.</p>
    `,
    company_address: '123 Construction Way, Suite 456',
    company_phone: '(555) 123-4567',
    company_website: 'www.acme-contracting.com',
    logo_url: logoUrl || 'https://images.unsplash.com/photo-1541888946425-d81bb19480c5?auto=format&fit=crop&q=80&w=100&h=100'
});

const TemplatePreview: React.FC<{ template: EmailTemplateDefinition, logoUrl?: string }> = ({ template, logoUrl }) => {
    const previewHtml = applyTemplateVariables(template.html, MOCK_VARS(logoUrl));

    return (
        <div className="w-full h-full bg-white relative overflow-hidden flex items-start justify-center">
            <iframe
                title={template.name}
                srcDoc={previewHtml}
                className="border-none origin-top pointer-events-none"
                style={{
                    width: '600px',
                    height: '1000px',
                    transform: 'scale(0.55)',
                    marginTop: '0'
                }}
            />
        </div>
    );
};

interface TemplateSelectorProps {
    onSelect: (template: EmailTemplateDefinition) => void;
    onClose: () => void;
    selectedTemplateId?: string;
    logoUrl?: string;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelect, onClose, selectedTemplateId, logoUrl }) => {
    const [activeCategory, setActiveCategory] = React.useState<string>('all');
    const [selectedId, setSelectedId] = React.useState<string | undefined>(selectedTemplateId);

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
                                        <div className="aspect-[4/3] bg-white rounded-lg mb-4 flex items-start justify-center overflow-hidden relative border border-border/50 shadow-sm group-hover:shadow-md transition-all duration-300">
                                            <TemplatePreview template={template} logoUrl={logoUrl} />

                                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                            {isSelected && (
                                                <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 shadow-lg ring-2 ring-white">
                                                    <CheckCircleIcon className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-sm text-foreground">{template.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                                                        {template.category}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
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
