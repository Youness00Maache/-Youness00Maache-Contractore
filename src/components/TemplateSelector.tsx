import React, { useState, useMemo } from 'react';
import { Label } from './ui/Label.tsx';
import { CheckIcon, PaletteIcon, StarIcon, RefreshCwIcon } from './Icons.tsx';

// Import Template Generators
import {
    getAdvancedHtmlTemplate,
    getHighEndHtmlTemplate,
    getGlassmorphismModernHtmlTemplate,
    getPremiumMinimalistHtmlTemplate,
    getGradientBorderPremiumHtmlTemplate
} from '../utils/templates/documentHtmlTemplates.ts';

import {
    getNeonCyberpunkHtmlTemplate,
    getLuxuryGoldNavyHtmlTemplate,
    getOrganicNatureHtmlTemplate,
    getGeometricBoldHtmlTemplate,
    getPastelSoftHtmlTemplate,
    getVintageCraftHtmlTemplate,
    getBlueprintTechHtmlTemplate,
    getAbstractMemphisHtmlTemplate,
    getCrimsonNoirHtmlTemplate,
    getWatercolorArtisticHtmlTemplate,
    getSwissGridHtmlTemplate,
    getSpaceOdysseyHtmlTemplate,
    getRetroTerminalHtmlTemplate,
    getPlayfulPopHtmlTemplate,
    getElegantSerifHtmlTemplate
} from '../utils/templates/allNewTemplates.ts';

interface TemplateSelectorProps {
    selectedTemplateId: string;
    onSelectTemplate: (id: string) => void;
    themeColors?: { primary: string; secondary: string };
    onColorsChange?: (colors: { primary: string; secondary: string }) => void;
}

const PRIMARY_TEMPLATES = [
    { id: 'standard', name: 'Standard' },
    { id: 'professional', name: 'Professional' },
    { id: 'elegant', name: 'Elegant' },
    { id: 'warm', name: 'Warm' },
    { id: 'retro', name: 'Retro' },
    { id: 'modern_blue', name: 'Modern Blue' },
    { id: 'tech', name: 'Tech' },
    { id: 'industrial', name: 'Industrial' },
    { id: 'minimal', name: 'Minimal' },
    { id: 'bold', name: 'Bold' },
];

const ADVANCED_TEMPLATES = [
    { id: 'template_html', name: 'Modern Single' },
    { id: 'template_html_2', name: 'High End' },
    { id: 'template_html_2_new', name: 'Glassmorphism' },
    { id: 'template_html_3', name: 'Minimalist Premium' },
    { id: 'template_html_4', name: 'Gradient' },
    { id: 'template_neon', name: 'Neon Cyberpunk' },
    { id: 'template_luxury', name: 'Luxury Gold' },
    { id: 'template_nature', name: 'Organic Nature' },
    { id: 'template_geometric', name: 'Geometric Bold' },
    { id: 'template_pastel', name: 'Pastel Soft' },
    { id: 'template_vintage', name: 'Vintage Craft' },
    { id: 'template_blueprint', name: 'Blueprint Tech' },
    { id: 'template_memphis', name: 'Abstract Memphis' },
    { id: 'template_crimson', name: 'Crimson Noir' },
    { id: 'template_watercolor', name: 'Watercolor' },
    { id: 'template_swiss', name: 'Swiss Grid' },
    { id: 'template_space', name: 'Space Odyssey' },
    { id: 'template_retro', name: 'Retro Terminal' },
    { id: 'template_pop', name: 'Playful Pop' },
    { id: 'template_serif', name: 'Elegant Serif' },
];


const STANDARD_STYLES: Record<string, any> = {
    standard: { id: 'standard', primaryColor: '#000000', secondaryColor: '#666666', textColor: '#222222', headerColor: '#ffffff', headerTextColor: '#000000', font: 'Helvetica, sans-serif', headerFont: 'Times New Roman, serif', alternateRowColor: '#f2f2f2', borderColor: '#000000', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    professional: { id: 'professional', primaryColor: '#2c3e50', secondaryColor: '#34495e', textColor: '#2c3e50', headerColor: '#2c3e50', headerTextColor: '#ecf0f1', font: 'Times New Roman, serif', headerFont: 'Times New Roman, serif', alternateRowColor: '#eaeded', borderColor: '#bdc3c7', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    elegant: { id: 'elegant', primaryColor: '#8e44ad', secondaryColor: '#9b59b6', textColor: '#4a235a', headerColor: '#ffffff', headerTextColor: '#8e44ad', font: 'Times New Roman, serif', headerFont: 'Times New Roman, serif', alternateRowColor: '#f5eef8', borderColor: '#d7bde2', borderRadius: 0, showFooterLine: false, layoutType: 'certificate' },
    warm: { id: 'warm', primaryColor: '#d35400', secondaryColor: '#e67e22', textColor: '#5d4037', headerColor: '#fdebd0', headerTextColor: '#d35400', font: 'Helvetica, sans-serif', headerFont: 'Helvetica, sans-serif', alternateRowColor: '#fef5e7', borderColor: '#f5cba7', borderRadius: 2, showFooterLine: true, layoutType: 'certificate' },
    retro: { id: 'retro', primaryColor: '#c0392b', secondaryColor: '#e74c3c', textColor: '#5a4d41', headerColor: '#f9e79f', headerTextColor: '#c0392b', font: 'Courier New, monospace', headerFont: 'Courier New, monospace', alternateRowColor: '#fcf3cf', borderColor: '#d35400', borderRadius: 1, showFooterLine: true, layoutType: 'certificate' },
    modern_blue: { id: 'modern_blue', primaryColor: '#3498db', secondaryColor: '#2980b9', textColor: '#2c3e50', headerColor: '#3498db', headerTextColor: '#ffffff', font: 'Helvetica, sans-serif', headerFont: 'Helvetica, sans-serif', alternateRowColor: '#ebf5fb', borderColor: '#aed6f1', borderRadius: 4, showFooterLine: false, layoutType: 'modern' },
    tech: { id: 'tech', primaryColor: '#16a085', secondaryColor: '#1abc9c', textColor: '#000000', headerColor: '#e8f8f5', headerTextColor: '#16a085', font: 'Courier New, monospace', headerFont: 'Courier New, monospace', alternateRowColor: '#e8f6f3', borderColor: '#48c9b0', borderRadius: 0, showFooterLine: true, layoutType: 'modern' },
    industrial: { id: 'industrial', primaryColor: '#f39c12', secondaryColor: '#d35400', textColor: '#000000', headerColor: '#333333', headerTextColor: '#f39c12', font: 'Helvetica, sans-serif', headerFont: 'Helvetica, sans-serif', alternateRowColor: '#fcf3cf', borderColor: '#000000', borderRadius: 0, showFooterLine: true, layoutType: 'modern' },
    minimal: { id: 'minimal', primaryColor: '#95a5a6', secondaryColor: '#7f8c8d', textColor: '#7f8c8d', headerColor: '#ffffff', headerTextColor: '#333333', font: 'Helvetica, sans-serif', headerFont: 'Helvetica, sans-serif', alternateRowColor: '#ffffff', borderColor: '#ecf0f1', borderRadius: 0, showFooterLine: false, layoutType: 'modern' },
    bold: { id: 'bold', primaryColor: '#000000', secondaryColor: '#000000', textColor: '#000000', headerColor: '#000000', headerTextColor: '#ffffff', font: 'Helvetica, sans-serif', headerFont: 'Helvetica, sans-serif', alternateRowColor: '#e5e5e5', borderColor: '#000000', borderRadius: 6, showFooterLine: false, layoutType: 'modern' }
};

const getTemplateHtml = (id: string, primaryColor: string, secondaryColor: string) => {
    const dummyData = {
        companyName: 'Acme Corp',
        companyAddress: '123 Builder Lane',
        logoUrl: '',
        clientName: 'Jane Smith',
        clientAddress: '456 Client Rd',
        lineItems: [
            { description: 'Service A', quantity: 10, rate: 50 },
            { description: 'Service B', quantity: 5, rate: 100 }
        ],
        taxRate: 10,
        themeColors: { primary: primaryColor, secondary: secondaryColor }
    };

    const dummyProfile = {
        companyName: 'Acme Corp',
        address: '123 Builder Lane',
        phone: '555-0123',
        website: 'acme.com',
        id: '1',
        email: 'test@example.com',
        name: 'John Doe',
        logoUrl: ''
    };

    const labels = {
        date: 'Date',
        id: 'INV #',
        idValue: '001',
        dateValue: '2023-10-25'
    };

    // 1. Check for Advanced HTML Templates
    let fn = null;
    if (id === 'template_html') fn = getAdvancedHtmlTemplate;
    else if (id === 'template_html_2') fn = getHighEndHtmlTemplate;
    else if (id === 'template_html_2_new') fn = getGlassmorphismModernHtmlTemplate;
    else if (id === 'template_html_3') fn = getPremiumMinimalistHtmlTemplate;
    else if (id === 'template_html_4') fn = getGradientBorderPremiumHtmlTemplate;
    else if (id === 'template_neon') fn = getNeonCyberpunkHtmlTemplate;
    else if (id === 'template_luxury') fn = getLuxuryGoldNavyHtmlTemplate;
    else if (id === 'template_nature') fn = getOrganicNatureHtmlTemplate;
    else if (id === 'template_geometric') fn = getGeometricBoldHtmlTemplate;
    else if (id === 'template_pastel') fn = getPastelSoftHtmlTemplate;
    else if (id === 'template_vintage') fn = getVintageCraftHtmlTemplate;
    else if (id === 'template_blueprint') fn = getBlueprintTechHtmlTemplate;
    else if (id === 'template_memphis') fn = getAbstractMemphisHtmlTemplate;
    else if (id === 'template_crimson') fn = getCrimsonNoirHtmlTemplate;
    else if (id === 'template_watercolor') fn = getWatercolorArtisticHtmlTemplate;
    else if (id === 'template_swiss') fn = getSwissGridHtmlTemplate;
    else if (id === 'template_space') fn = getSpaceOdysseyHtmlTemplate;
    else if (id === 'template_retro') fn = getRetroTerminalHtmlTemplate;
    else if (id === 'template_pop') fn = getPlayfulPopHtmlTemplate;
    else if (id === 'template_serif') fn = getElegantSerifHtmlTemplate;

    if (fn) {
        return fn(dummyData, dummyProfile, 'PREVIEW', labels);
    }

    // 2. Generate Standard Template HTML (Mimic JS PDF output)
    const style = STANDARD_STYLES[id] || STANDARD_STYLES.standard;
    const isModern = style.layoutType === 'modern';

    // Override primary color if passed in props (usually managed by parent, but here we use what's passed)
    const pColor = primaryColor || style.primaryColor;
    const sColor = secondaryColor || style.secondaryColor;

    const fontFamily = style.font;
    const headerFont = style.headerFont;

    return `
        <div style="width: 100%; height: 100%; font-family: ${fontFamily}; color: ${style.textColor}; position: relative; background: #fff;">
            ${!isModern ? `
                <div style="position: absolute; top: 10px; left: 10px; right: 10px; bottom: 10px; border: 1px solid ${style.borderColor}; pointer-events: none;"></div>
                <div style="position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px; border: 1px solid ${style.borderColor}; pointer-events: none;"></div>
            ` : ''}

            ${isModern ? `
                <div style="background-color: ${pColor}; height: 50px; display: flex; align-items: center; justify-content: flex-end; padding: 0 20px; color: ${style.headerTextColor};">
                    <div style="text-align: right;">
                        <div style="font-family: ${headerFont}; font-size: 24px; font-weight: bold;">PREVIEW</div>
                        <div style="font-size: 10px; opacity: 0.9;">INV #001</div>
                    </div>
                </div>
            ` : `
                <div style="text-align: center; padding-top: 40px; margin-bottom: 30px;">
                    <div style="font-family: ${headerFont}; font-size: 26px; font-weight: bold; color: #000;">PREVIEW</div>
                    <div style="font-size: 10px; color: #666; margin-top: 5px;">INV #001 | 2023-10-25</div>
                </div>
            `}

            <div style="padding: 20px; display: flex; justify-content: space-between; font-size: 10px;">
                <div>
                    <div style="font-weight: bold; margin-bottom: 4px;">FROM:</div>
                    <div>${dummyProfile.companyName}</div>
                    <div>${dummyProfile.address}</div>
                </div>
                <div>
                    <div style="font-weight: bold; margin-bottom: 4px;">TO:</div>
                    <div>${dummyData.clientName}</div>
                    <div>${dummyData.clientAddress}</div>
                </div>
            </div>

            <div style="margin: 10px 20px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                    <thead>
                        <tr style="background-color: ${pColor}; color: white;">
                            <th style="padding: 5px; text-align: left;">Description</th>
                            <th style="padding: 5px; text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="background-color: ${style.alternateRowColor};">
                            <td style="padding: 5px; border-bottom: 1px solid #ddd;">Service A</td>
                            <td style="padding: 5px; text-align: right; border-bottom: 1px solid #ddd;">$500.00</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px; border-bottom: 1px solid #ddd;">Service B</td>
                            <td style="padding: 5px; text-align: right; border-bottom: 1px solid #ddd;">$500.00</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style="margin: 10px 20px; text-align: right; font-size: 10px;">
                <div style="margin-bottom: 2px;">Subtotal: $1000.00</div>
                <div style="font-size: 14px; font-weight: bold; color: ${pColor}; margin-top: 5px;">Total: $1100.00</div>
            </div>

            ${style.showFooterLine ? `
                <div style="position: absolute; bottom: 40px; left: 20px; right: 20px; border-top: 1px solid ${style.borderColor}; text-align: center; padding-top: 10px; font-size: 8px; color: #999;">
                    Thank you for your business!
                </div>
            ` : ''}
        </div>
    `;
}

const LivePreview = React.memo(({ id, color }: { id: string, color: string }) => {
    const html = useMemo(() => getTemplateHtml(id, color, '#666666'), [id, color]);

    if (!html) {
        // Fallback for standard templates (not HTML generated yet, use placeholder)
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-white p-2 text-xs text-muted-foreground">
                <div style={{ color: color }} className="font-bold mb-1">Standard</div>
                <div className="w-full h-1 bg-current opacity-20 rounded mb-1" />
                <div className="w-2/3 h-1 bg-current opacity-20 rounded" />
            </div>
        );
    }

    const srcDoc = `
        <!DOCTYPE html>
        <html>
            <head>
                <style>
                    body { margin: 0; padding: 0; overflow: hidden; transform-origin: top left; transform: scale(0.12); width: 800px; height: 1000px; }
                    /* Force some resets */
                    * { box-sizing: border-box; }
                </style>
            </head>
            <body>
                ${html}
            </body>
        </html>
    `;

    return (
        <iframe
            srcDoc={srcDoc}
            className="w-full h-full border-0 pointer-events-none select-none bg-white"
            title={`Preview ${id}`}
            tabIndex={-1}
        />
    );
});

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
    selectedTemplateId,
    onSelectTemplate,
    themeColors,
    onColorsChange
}) => {
    const [activeTab, setActiveTab] = useState<'standard' | 'premium'>('premium');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Document Template</Label>
                <div className="flex bg-muted p-1 rounded-md">
                    <button
                        onClick={() => setActiveTab('standard')}
                        className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTab === 'standard' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        Standard
                    </button>
                    <button
                        onClick={() => setActiveTab('premium')}
                        className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTab === 'premium' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <StarIcon className="w-3 h-3 inline mr-1 mb-0.5" />
                        Premium
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[400px] overflow-y-auto p-1">
                {(activeTab === 'standard' ? PRIMARY_TEMPLATES : ADVANCED_TEMPLATES).map(template => {
                    const isActive = selectedTemplateId === template.id;
                    return (
                        <div
                            key={template.id}
                            onClick={() => onSelectTemplate(template.id)}
                            className={`
                                group relative cursor-pointer rounded-xl border flex flex-col gap-2 text-center transition-all duration-200 overflow-hidden
                                ${isActive
                                    ? 'border-primary ring-2 ring-primary ring-offset-2'
                                    : 'border-border hover:border-primary/50 hover:shadow-md'}
                            `}
                        >
                            <div className="w-full aspect-[210/297] bg-gray-50 relative overflow-hidden">
                                <LivePreview id={template.id} color={themeColors?.primary || '#000'} />

                                {isActive && (
                                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center backdrop-blur-[1px]">
                                        <div className="bg-primary text-primary-foreground rounded-full p-2 shadow-lg scale-110">
                                            <CheckIcon className="w-5 h-5" />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="w-full px-2 pb-2 h-8 flex items-center justify-center bg-white border-t">
                                <span className={`text-xs font-medium leading-tight truncate w-full ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                    {template.name}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Color Picker */}
            {onColorsChange && themeColors && (
                <div className="flex gap-4 pt-4 border-t">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1"><PaletteIcon className="w-3 h-3" /> Primary Color</Label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={themeColors.primary}
                                onChange={(e) => onColorsChange({ ...themeColors, primary: e.target.value })}
                                className="h-8 w-10 p-0 border rounded cursor-pointer bg-transparent"
                            />
                            <span className="text-xs font-mono text-muted-foreground uppercase">{themeColors.primary}</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">Secondary Color</Label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={themeColors.secondary}
                                onChange={(e) => onColorsChange({ ...themeColors, secondary: e.target.value })}
                                className="h-8 w-10 p-0 border rounded cursor-pointer bg-transparent"
                            />
                            <span className="text-xs font-mono text-muted-foreground uppercase">{themeColors.secondary}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TemplateSelector;
