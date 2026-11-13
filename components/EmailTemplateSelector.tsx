import React, { useMemo, useState } from 'react';
import { EMAIL_TEMPLATES, EmailTemplateDefinition, applyTemplateVariables } from '../utils/emailTemplates.ts';
import { CheckCircleIcon } from './Icons.tsx';
import { Modal, cx } from './commsKit.tsx';

const previewVars = (opts: { logoUrl?: string; companyName?: string; userName?: string; primaryColor?: string; secondaryColor?: string }) => ({
    company_name: opts.companyName || 'Acme Contracting',
    primary_color: opts.primaryColor || '#2563eb',
    secondary_color: opts.secondaryColor || '#1e40af',
    user_name: opts.userName || 'Alex Johnson',
    user_job_title: 'Project Lead',
    body: '<p>Hi Jordan,</p><p>Thanks for choosing us. Your estimate for the kitchen remodel is attached. Let me know if you have any questions.</p><p>Best regards,</p>',
    company_address: '123 Construction Way',
    company_phone: '(555) 123-4567',
    company_website: 'www.example.com',
    user_phone: '(555) 123-4567',
    user_website: 'www.example.com',
    logo_url: opts.logoUrl || '',
});

const TemplatePreview: React.FC<{ html: string; title: string }> = ({ html, title }) => (
    <div className="relative h-full w-full overflow-hidden bg-white">
        <iframe
            title={title}
            srcDoc={html}
            sandbox=""
            loading="lazy"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none origin-top-left border-0"
            style={{ width: '600px', height: '800px', transform: 'scale(0.5)' }}
        />
    </div>
);

interface TemplateSelectorProps {
    onSelect: (template: EmailTemplateDefinition) => void;
    onClose: () => void;
    selectedTemplateId?: string;
    logoUrl?: string;
    companyName?: string;
    userName?: string;
    primaryColor?: string;
    secondaryColor?: string;
}

const CATEGORIES: { id: 'all' | EmailTemplateDefinition['category']; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'modern', label: 'Modern' },
    { id: 'corporate', label: 'Corporate' },
    { id: 'minimalist', label: 'Minimalist' },
    { id: 'billing', label: 'Billing' },
    { id: 'creative', label: 'Creative' },
];

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelect, onClose, selectedTemplateId, logoUrl, companyName, userName, primaryColor, secondaryColor }) => {
    const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]['id']>('all');
    const vars = useMemo(
        () => previewVars({ logoUrl, companyName, userName, primaryColor, secondaryColor }),
        [logoUrl, companyName, userName, primaryColor, secondaryColor],
    );
    const templates = activeCategory === 'all' ? EMAIL_TEMPLATES : EMAIL_TEMPLATES.filter((t) => t.category === activeCategory);

    return (
        <Modal
            open
            onClose={onClose}
            size="xl"
            title="Email design"
            description="Pick a layout. Your logo, company name and colors are applied automatically."
        >
            <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Template categories">
                {CATEGORIES.map((cat) => {
                    const count = cat.id === 'all' ? EMAIL_TEMPLATES.length : EMAIL_TEMPLATES.filter((t) => t.category === cat.id).length;
                    if (count === 0) return null;
                    const active = activeCategory === cat.id;
                    return (
                        <button
                            key={cat.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setActiveCategory(cat.id)}
                            className={cx('btn btn-sm min-h-[40px] shrink-0 rounded-full', active ? 'btn-primary' : 'btn-secondary')}
                        >
                            {cat.label} <span className="opacity-70">{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                    const selected = selectedTemplateId === template.id;
                    return (
                        <button
                            key={template.id}
                            type="button"
                            onClick={() => onSelect(template)}
                            className={cx(
                                'group overflow-hidden rounded-2xl border bg-card text-left transition hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring',
                                selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50',
                            )}
                            aria-pressed={selected}
                        >
                            <div className="relative h-48 border-b border-border">
                                <TemplatePreview html={applyTemplateVariables(template.html, vars)} title={template.name} />
                                {selected && (
                                    <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground shadow">
                                        <CheckCircleIcon className="h-4 w-4" />
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center justify-between gap-2 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{template.name}</p>
                                    <p className="text-xs capitalize text-muted-foreground">{template.category}</p>
                                </div>
                                <span className={cx('badge', selected ? 'badge-primary' : 'badge-muted')}>{selected ? 'Selected' : 'Use'}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </Modal>
    );
};

export default TemplateSelector;
