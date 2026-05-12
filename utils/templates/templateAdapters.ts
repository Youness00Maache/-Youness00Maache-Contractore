import { UserProfile } from '../../types';

/**
 * Adapter functions that transform template output based on document type.
 * Invoice/Estimate templates remain unchanged.
 * Daily Report/Note templates get simplified, table-free layouts.
 */

interface TemplateLabels {
    date: string;
    dateValue: string;
    id: string;
    idValue: string;
}

/**
 * Converts invoice/estimate template data to a simple content-focused format
 * for Daily Reports and Notes
 */
export const adaptTemplateForContentDocument = (
    templateFn: (data: any, profile: UserProfile, title: string, labels: TemplateLabels) => string,
    data: any,
    profile: UserProfile,
    title: string,
    labels: TemplateLabels
): string => {
    // Create a minimal data structure without line items/tables
    const adaptedData = {
        ...data,
        lineItems: [], // Remove line items to prevent table rendering
        items: [], // Remove items array
        notes: undefined, // We'll use content instead
        terms: undefined,
        taxRate: 0,
        tax: 0,
        discount: 0,
        shipping: 0,
        subtotal: 0,
        total: 0,
    };

    // Get the template HTML
    let html = templateFn(adaptedData, profile, title, labels);

    // Post-process: Remove empty table sections and adjust layout
    html = removeEmptyTables(html);
    html = adjustContentLayout(html, data.content || data.notes || '');

    return html;
};

/**
 * Removes empty or minimal table structures from HTML
 */
const removeEmptyTables = (html: string): string => {
    // Remove table wrappers with no content or only headers
    html = html.replace(/<table[^>]*>\s*<thead>[\s\S]*?<\/thead>\s*<tbody>\s*<\/tbody>\s*<\/table>/gi, '');
    html = html.replace(/<table[^>]*>\s*<tbody>\s*<\/tbody>\s*<\/table>/gi, '');

    // Remove empty divs that were table containers
    html = html.replace(/<div[^>]*>\s*<\/div>/gi, '');

    return html;
};

/**
 * Injects the actual content into the template in place of removed tables
 */
const adjustContentLayout = (html: string, content: string): string => {
    // Find where tables were (usually after client info, before totals)
    // Insert content in a clean container

    const contentSection = `
        <div style="padding: 20px 30px; margin: 20px 0;">
            <div style="background: #ffffff; border-radius: 8px; padding: 20px; min-height: 200px; line-height: 1.8;">
                ${content || '<p style="color: #999; font-style: italic;">No content provided</p>'}
            </div>
        </div>
    `;

    // Try to inject after client/project info section
    // Look for common patterns in templates
    const patterns = [
        // After "Bill To" or "Prepared For" sections
        /(<\/div>\s*<\/div>\s*<\/div>\s*)(<!--.*?-->)?\s*(<div[^>]*style="[^"]*padding[^"]*")/i,
        // After header sections
        /(<\/div>\s*<\/div>\s*)(<!--.*?Content.*?-->)/i,
        // Fallback: after any major closing div in upper section
        /(<\/div>\s*<\/div>\s*<div[^>]*style="[^"]*padding[^"]*:[^"]*30px)/i,
    ];

    for (const pattern of patterns) {
        if (pattern.test(html)) {
            html = html.replace(pattern, `$1${contentSection}$3`);
            return html;
        }
    }

    // Fallback: inject before footer or at 60% through document
    const footerPattern = /(<!--.*?Footer.*?-->|<div[^>]*style="[^"]*background[^"]*footer)/i;
    if (footerPattern.test(html)) {
        html = html.replace(footerPattern, `${contentSection}$1`);
    }

    return html;
};

/**
 * For simpler templates that need content injection
 */
export const injectContentIntoSimpleTemplate = (html: string, content: string): string => {
    // For templates that just need content added
    const contentBlock = `
        <div style="margin: 30px 0; padding: 25px; background: rgba(255,255,255,0.5); border-radius: 12px; line-height: 1.8; min-height: 300px;">
            ${content || '<p style="color: #999; text-align: center; padding: 40px;">No content</p>'}
        </div>
    `;

    // Insert before signature or footer sections
    const signaturePattern = /(<!--.*?[Ss]ignature.*?-->|<div[^>]*>[^<]*[Ss]ignature|<div[^>]*bottom.*?signature)/i;
    if (signaturePattern.test(html)) {
        return html.replace(signaturePattern, `${contentBlock}$1`);
    }

    // Fallback: add before last major closing div
    const lastDivPattern = /(<\/div>\s*<\/div>\s*<\/div>\s*$)/i;
    if (lastDivPattern.test(html)) {
        return html.replace(lastDivPattern, `${contentBlock}$1`);
    }

    return html + contentBlock;
};
