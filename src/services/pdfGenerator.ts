
import { InvoiceData, Job, UserProfile, EstimateData, WorkOrderData, DailyJobReportData, TimeSheetData, MaterialLogData, ExpenseLogData, WarrantyData, NoteData, ReceiptData, ChangeOrderData, PurchaseOrderData } from '../types.ts';

declare const jspdf: any;
declare const html2canvas: any;

const loadImage = async (url: string): Promise<{ data: string; format: string; width: number; height: number } | null> => {
    try {
        let dataUrl = url;
        if (!url.startsWith('data:image/')) {
            const fetchUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
            const response = await fetch(fetchUrl, { cache: 'no-store' });
            const blob = await response.blob();
            dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let format = 'PNG';
                if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) format = 'JPEG';
                if (dataUrl.startsWith('data:image/webp')) format = 'WEBP';

                resolve({
                    data: dataUrl,
                    format: format,
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
            };
            img.onerror = () => {
                resolve(null);
            };
            if (!dataUrl.startsWith('data:')) {
                img.crossOrigin = 'Anonymous';
            }
            img.src = dataUrl;
        });
    } catch (e) {
        return null;
    }
};

const safeText = (doc: any, text: any, x: number, y: number, options?: any) => {
    if (text === null || text === undefined) {
        return;
    }
    let safeVal = text;
    if (typeof text === 'number') safeVal = String(text);
    if (typeof text === 'boolean') safeVal = String(text);

    doc.text(safeVal, x, y, options);
};

// New helper to draw template background on any page
const drawTemplateBackground = (doc: any, template: TemplateStyle, primaryRgb: number[]) => {
    if (template.layoutType === 'modern') {
        // Draw a thin top bar for continuation pages to maintain theme
        doc.setFillColor(...primaryRgb);
        doc.rect(0, 0, 210, 5, 'F');
    } else {
        // Draw standard borders
        doc.setDrawColor(template.borderColor || '#000000');
        doc.setLineWidth(0.5);
        doc.rect(10, 10, 190, 277);
        doc.rect(12, 12, 186, 273);
    }
};

// Helper to render HTML content to PDF using html2canvas with slicing for pagination
const renderHtmlToPdf = async (
    doc: any,
    html: string,
    x: number,
    y: number,
    width: number,
    onAddPage?: () => void
): Promise<number> => {
    const container = document.getElementById('pdf-render-content');
    if (!container) return y;

    // Clean up previous content
    container.innerHTML = '';

    // Create a wrapper for styling matches
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    // Apply styles to mimic the editor
    wrapper.style.fontFamily = 'Helvetica, Arial, sans-serif';
    wrapper.style.fontSize = '12px'; // Base PDF readable size
    wrapper.style.lineHeight = '1.5';
    wrapper.style.color = '#000';
    wrapper.style.padding = '0 15px'; // Padding inside the container
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.backgroundColor = '#ffffff';

    // Ensure lists and tables look right
    const style = document.createElement('style');
    style.innerHTML = `
        /* Headings */
        h1 { font-size: 2em; font-weight: bold; margin-top: 0.67em; margin-bottom: 0.67em; line-height: 1.2; }
        h2 { font-size: 1.5em; font-weight: bold; margin-top: 0.83em; margin-bottom: 0.83em; line-height: 1.25; }
        h3 { font-size: 1.17em; font-weight: bold; margin-top: 1em; margin-bottom: 1em; line-height: 1.3; }
        h4 { font-size: 1em; font-weight: bold; margin-top: 1.33em; margin-bottom: 1.33em; }
        h5 { font-size: 0.83em; font-weight: bold; margin-top: 1.67em; margin-bottom: 1.67em; }
        h6 { font-size: 0.67em; font-weight: bold; margin-top: 2.33em; margin-bottom: 2.33em; }

        /* Paragraphs */
        p { margin: 0 0 1em 0; line-height: 1.5; }

        /* Lists */
        ul, ol { margin: 0.5em 0; padding-left: 2em; }
        ul { list-style-type: disc; }
        ol { list-style-type: decimal; }
        li { margin-bottom: 0.25em; line-height: 1.5; list-style-position: outside; margin-left: 0.2em; }
        
        /* Fix vertical alignment for lists */
        li p, li div {
            margin: 0;
            padding: 0;
            display: inline-block;
            vertical-align: top;
            position: relative;
            top: -15px; /* Lift text significantly */
        }
        
        /* Tables */
        table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
        th { background-color: #f2f2f2; font-weight: bold; }

        /* Quotes */
        blockquote { border-left: 4px solid #ccc; padding-left: 10px; color: #666; font-style: italic; margin: 10px 0; }

        /* Images */
        img { max-width: 100%; height: auto; margin: 8px 0; border-radius: 4px; display: block; }

        /* Links */
        a { color: blue; text-decoration: underline; cursor: pointer; }
    `;
    container.appendChild(style);
    container.appendChild(wrapper);

    // Calculate width based on PDF width (approx 3.78 px per mm)
    const renderWidth = width * 3.78;
    container.style.width = `${renderWidth}px`;

    // Allow images to load
    const images = container.getElementsByTagName('img');
    if (images.length > 0) {
        await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
        }));
    }

    // Use html2canvas to render the whole content
    const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
    });

    // Clean up DOM
    container.innerHTML = '';

    const contentWidth = width;
    const contentHeight = (canvas.height * width) / canvas.width; // Total height in PDF units

    const pageHeight = doc.internal.pageSize.height;
    const pageMarginBottom = 20;
    const pageMarginTop = 20; // Margin for new pages

    let currentY = y;
    let remainingContentHeight = contentHeight;
    let sourceY = 0; // Current read position in the source canvas (PDF units)

    const pxScale = canvas.width / width; // Canvas pixels per PDF unit

    while (remainingContentHeight > 0) {
        // Calculate available space on the current page
        const spaceOnPage = pageHeight - pageMarginBottom - currentY;

        // If less than a minimal amount of space is left (e.g., 20mm), start a new page immediately
        // unless the remaining content is tiny and fits.
        if (spaceOnPage < 20 && remainingContentHeight > 15) {
            doc.addPage();
            if (onAddPage) onAddPage();
            currentY = pageMarginTop;
            continue;
        }

        // Determine how much we can print on this page
        const sliceHeight = Math.min(remainingContentHeight, spaceOnPage);

        // Create a temporary canvas to hold the slice
        const sCanvas = document.createElement('canvas');
        sCanvas.width = canvas.width;
        sCanvas.height = sliceHeight * pxScale;

        const sCtx = sCanvas.getContext('2d');
        if (sCtx) {
            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(0, 0, sCanvas.width, sCanvas.height);

            // Draw the specific slice from the original canvas
            sCtx.drawImage(
                canvas,
                0, sourceY * pxScale, canvas.width, sliceHeight * pxScale, // Source x, y, w, h
                0, 0, sCanvas.width, sCanvas.height // Dest x, y, w, h
            );

            const imgData = sCanvas.toDataURL('image/jpeg', 0.95);
            doc.addImage(imgData, 'JPEG', x, currentY, contentWidth, sliceHeight);
        }

        // Update counters
        currentY += sliceHeight;
        sourceY += sliceHeight;
        remainingContentHeight -= sliceHeight;

        // If we still have content, add a new page
        if (remainingContentHeight > 0) {
            doc.addPage();
            if (onAddPage) onAddPage();
            currentY = pageMarginTop;
        }
    }

    return currentY;
};

interface TemplateStyle {
    id: string;
    primaryColor: string;
    secondaryColor: string;
    textColor: string;
    headerColor: string;
    headerTextColor: string;
    font: string;
    headerFont: string;
    alternateRowColor: string;
    borderColor: string;
    borderRadius: number;
    showFooterLine: boolean;
    layoutType?: 'certificate' | 'modern';
}

const templates: Record<string, TemplateStyle> = {
    // ========== EXISTING TEMPLATES (UNCHANGED) ==========
    standard: { id: 'standard', primaryColor: '#000000', secondaryColor: '#666666', textColor: '#222222', headerColor: '#ffffff', headerTextColor: '#000000', font: 'helvetica', headerFont: 'times', alternateRowColor: '#f2f2f2', borderColor: '#000000', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    professional: { id: 'professional', primaryColor: '#2c3e50', secondaryColor: '#34495e', textColor: '#2c3e50', headerColor: '#2c3e50', headerTextColor: '#ecf0f1', font: 'times', headerFont: 'times', alternateRowColor: '#eaeded', borderColor: '#bdc3c7', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    elegant: { id: 'elegant', primaryColor: '#8e44ad', secondaryColor: '#9b59b6', textColor: '#4a235a', headerColor: '#ffffff', headerTextColor: '#8e44ad', font: 'times', headerFont: 'times', alternateRowColor: '#f5eef8', borderColor: '#d7bde2', borderRadius: 0, showFooterLine: false, layoutType: 'certificate' },
    warm: { id: 'warm', primaryColor: '#d35400', secondaryColor: '#e67e22', textColor: '#5d4037', headerColor: '#fdebd0', headerTextColor: '#d35400', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#fef5e7', borderColor: '#f5cba7', borderRadius: 2, showFooterLine: true, layoutType: 'certificate' },
    retro: { id: 'retro', primaryColor: '#c0392b', secondaryColor: '#e74c3c', textColor: '#5a4d41', headerColor: '#f9e79f', headerTextColor: '#c0392b', font: 'courier', headerFont: 'courier', alternateRowColor: '#fcf3cf', borderColor: '#d35400', borderRadius: 1, showFooterLine: true, layoutType: 'certificate' },
    modern_blue: { id: 'modern_blue', primaryColor: '#3498db', secondaryColor: '#2980b9', textColor: '#2c3e50', headerColor: '#3498db', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#ebf5fb', borderColor: '#aed6f1', borderRadius: 4, showFooterLine: false, layoutType: 'modern' },
    tech: { id: 'tech', primaryColor: '#16a085', secondaryColor: '#1abc9c', textColor: '#000000', headerColor: '#e8f8f5', headerTextColor: '#16a085', font: 'courier', headerFont: 'courier', alternateRowColor: '#e8f6f3', borderColor: '#48c9b0', borderRadius: 0, showFooterLine: true, layoutType: 'modern' },
    industrial: { id: 'industrial', primaryColor: '#f39c12', secondaryColor: '#d35400', textColor: '#000000', headerColor: '#333333', headerTextColor: '#f39c12', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#fcf3cf', borderColor: '#000000', borderRadius: 0, showFooterLine: true, layoutType: 'modern' },
    minimal: { id: 'minimal', primaryColor: '#95a5a6', secondaryColor: '#7f8c8d', textColor: '#7f8c8d', headerColor: '#ffffff', headerTextColor: '#333333', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#ffffff', borderColor: '#ecf0f1', borderRadius: 0, showFooterLine: false, layoutType: 'modern' },
    bold: { id: 'bold', primaryColor: '#000000', secondaryColor: '#000000', textColor: '#000000', headerColor: '#000000', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#e5e5e5', borderColor: '#000000', borderRadius: 6, showFooterLine: false, layoutType: 'modern' },

    // ========== NEW TEMPLATES ==========
    // Classic Professional Category
    executive_classic: { id: 'executive_classic', primaryColor: '#1e3a8a', secondaryColor: '#374151', textColor: '#1f2937', headerColor: '#1e3a8a', headerTextColor: '#ffffff', font: 'times', headerFont: 'times', alternateRowColor: '#eff6ff', borderColor: '#3b82f6', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    corporate_standard: { id: 'corporate_standard', primaryColor: '#4b5563', secondaryColor: '#6b7280', textColor: '#374151', headerColor: '#ffffff', headerTextColor: '#1f2937', font: 'times', headerFont: 'times', alternateRowColor: '#f9fafb', borderColor: '#9ca3af', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    traditional_blue: { id: 'traditional_blue', primaryColor: '#1e40af', secondaryColor: '#3b82f6', textColor: '#1e293b', headerColor: '#ffffff', headerTextColor: '#1e40af', font: 'times', headerFont: 'times', alternateRowColor: '#dbeafe', borderColor: '#60a5fa', borderRadius: 1, showFooterLine: true, layoutType: 'certificate' },
    business_formal: { id: 'business_formal', primaryColor: '#0f172a', secondaryColor: '#334155', textColor: '#1e293b', headerColor: '#f8fafc', headerTextColor: '#0f172a', font: 'times', headerFont: 'times', alternateRowColor: '#f1f5f9', borderColor: '#475569', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },

    // Modern Minimalist Category
    scandinavian: { id: 'scandinavian', primaryColor: '#64748b', secondaryColor: '#94a3b8', textColor: '#475569', headerColor: '#ffffff', headerTextColor: '#334155', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: 3, showFooterLine: false, layoutType: 'modern' },
    tech_modern: { id: 'tech_modern', primaryColor: '#0ea5e9', secondaryColor: '#06b6d4', textColor: '#0c4a6e', headerColor: '#0ea5e9', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#e0f2fe', borderColor: '#7dd3fc', borderRadius: 5, showFooterLine: false, layoutType: 'modern' },
    digital_first: { id: 'digital_first', primaryColor: '#8b5cf6', secondaryColor: '#a78bfa', textColor: '#4c1d95', headerColor: '#8b5cf6', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#f5f3ff', borderColor: '#c4b5fd', borderRadius: 4, showFooterLine: false, layoutType: 'modern' },
    clean_lines: { id: 'clean_lines', primaryColor: '#14b8a6', secondaryColor: '#2dd4bf', textColor: '#134e4a', headerColor: '#ffffff', headerTextColor: '#0f766e', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#ffffff', borderColor: '#99f6e4', borderRadius: 2, showFooterLine: false, layoutType: 'modern' },
    contemporary: { id: 'contemporary', primaryColor: '#6366f1', secondaryColor: '#818cf8', textColor: '#312e81', headerColor: '#6366f1', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#eef2ff', borderColor: '#a5b4fc', borderRadius: 3, showFooterLine: false, layoutType: 'modern' },

    // Corporate Category
    enterprise: { id: 'enterprise', primaryColor: '#1e40af', secondaryColor: '#2563eb', textColor: '#1e3a8a', headerColor: '#1e40af', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#dbeafe', borderColor: '#60a5fa', borderRadius: 2, showFooterLine: true, layoutType: 'modern' },
    financial: { id: 'financial', primaryColor: '#047857', secondaryColor: '#059669', textColor: '#064e3b', headerColor: '#ffffff', headerTextColor: '#047857', font: 'times', headerFont: 'times', alternateRowColor: '#d1fae5', borderColor: '#34d399', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    legal_pro: { id: 'legal_pro', primaryColor: '#0369a1', secondaryColor: '#0284c7', textColor: '#0c4a6e', headerColor: '#f0f9ff', headerTextColor: '#075985', font: 'times', headerFont: 'times', alternateRowColor: '#e0f2fe', borderColor: '#7dd3fc', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    consulting: { id: 'consulting', primaryColor: '#475569', secondaryColor: '#64748b', textColor: '#334155', headerColor: '#475569', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#f1f5f9', borderColor: '#cbd5e1', borderRadius: 2, showFooterLine: true, layoutType: 'modern' },
    corporate_premium: { id: 'corporate_premium', primaryColor: '#7c3aed', secondaryColor: '#8b5cf6', textColor: '#5b21b6', headerColor: '#7c3aed', headerTextColor: '#ffffff', font: 'times', headerFont: 'times', alternateRowColor: '#ede9fe', borderColor: '#a78bfa', borderRadius: 1, showFooterLine: true, layoutType: 'certificate' },

    // Creative Category
    artistic: { id: 'artistic', primaryColor: '#ec4899', secondaryColor: '#f472b6', textColor: '#831843', headerColor: '#ffffff', headerTextColor: '#db2777', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#fce7f3', borderColor: '#f9a8d4', borderRadius: 4, showFooterLine: false, layoutType: 'modern' },
    vibrant_pro: { id: 'vibrant_pro', primaryColor: '#dc2626', secondaryColor: '#ef4444', textColor: '#7f1d1d', headerColor: '#dc2626', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#fee2e2', borderColor: '#fca5a5', borderRadius: 3, showFooterLine: false, layoutType: 'modern' },
    designer: { id: 'designer', primaryColor: '#7c3aed', secondaryColor: '#a855f7', textColor: '#581c87', headerColor: '#ffffff', headerTextColor: '#7c3aed', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#faf5ff', borderColor: '#d8b4fe', borderRadius: 5, showFooterLine: false, layoutType: 'modern' },
    trendy: { id: 'trendy', primaryColor: '#ea580c', secondaryColor: '#f97316', textColor: '#7c2d12', headerColor: '#ea580c', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#ffedd5', borderColor: '#fdba74', borderRadius: 4, showFooterLine: false, layoutType: 'modern' },

    // Construction/Contractor Category
    construction_pro: { id: 'construction_pro', primaryColor: '#f97316', secondaryColor: '#fb923c', textColor: '#7c2d12', headerColor: '#f97316', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#fed7aa', borderColor: '#fdba74', borderRadius: 2, showFooterLine: true, layoutType: 'modern' },
    builder_modern: { id: 'builder_modern', primaryColor: '#eab308', secondaryColor: '#facc15', textColor: '#713f12', headerColor: '#eab308', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#fef9c3', borderColor: '#fde047', borderRadius: 3, showFooterLine: true, layoutType: 'modern' },
    trade_pro: { id: 'trade_pro', primaryColor: '#0891b2', secondaryColor: '#06b6d4', textColor: '#164e63', headerColor: '#0891b2', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#cffafe', borderColor: '#67e8f9', borderRadius: 1, showFooterLine: true, layoutType: 'modern' },
    project_manager: { id: 'project_manager', primaryColor: '#15803d', secondaryColor: '#16a34a', textColor: '#14532d', headerColor: '#15803d', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#dcfce7', borderColor: '#86efac', borderRadius: 2, showFooterLine: true, layoutType: 'modern' },

    // Premium/Luxury Category
    gold_standard: { id: 'gold_standard', primaryColor: '#d97706', secondaryColor: '#f59e0b', textColor: '#78350f', headerColor: '#ffffff', headerTextColor: '#b45309', font: 'times', headerFont: 'times', alternateRowColor: '#fef3c7', borderColor: '#fbbf24', borderRadius: 1, showFooterLine: true, layoutType: 'certificate' },
    platinum: { id: 'platinum', primaryColor: '#71717a', secondaryColor: '#a1a1aa', textColor: '#3f3f46', headerColor: '#71717a', headerTextColor: '#ffffff', font: 'times', headerFont: 'times', alternateRowColor: '#f4f4f5', borderColor: '#d4d4d8', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    executive_suite: { id: 'executive_suite', primaryColor: '#18181b', secondaryColor: '#3f3f46', textColor: '#27272a', headerColor: '#18181b', headerTextColor: '#ffffff', font: 'times', headerFont: 'times', alternateRowColor: '#fafafa', borderColor: '#52525b', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    prestige: { id: 'prestige', primaryColor: '#831843', secondaryColor: '#9f1239', textColor: '#500724', headerColor: '#831843', headerTextColor: '#ffffff', font: 'times', headerFont: 'times', alternateRowColor: '#fce7f3', borderColor: '#be123c', borderRadius: 1, showFooterLine: true, layoutType: 'certificate' }
};

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : null;
};

const drawDocumentHeader = async (doc: any, data: any, profile: UserProfile, template: TemplateStyle, primaryRgb: number[], title: string, dateLabel: string, dateValue: string, idLabel: string, idValue: string) => {
    const isModern = template.layoutType === 'modern';
    let yPos = 0;

    if (isModern) {
        doc.setFillColor(...primaryRgb);
        doc.rect(0, 0, 210, 45, 'F');

        if (data.logoUrl) {
            const imgData = await loadImage(data.logoUrl);
            if (imgData) {
                const logoW = 25;
                const logoH = logoW * (imgData.height / imgData.width);
                doc.addImage(imgData.data, imgData.format, 20, 10, logoW, logoH);
            }
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont(template.headerFont, 'bold');
        doc.setFontSize(28);
        doc.text(title, 190, 25, { align: 'right' });

        doc.setFontSize(10);
        doc.setFont(template.font, 'normal');
        safeText(doc, `${idLabel}: ${idValue}`, 190, 32, { align: 'right' });
        safeText(doc, `${dateLabel}: ${dateValue}`, 190, 37, { align: 'right' });

        yPos = 60;
    } else {
        // Use the helper to draw borders
        drawTemplateBackground(doc, template, primaryRgb);

        yPos = 25;
        if (data.logoUrl) {
            const imgData = await loadImage(data.logoUrl);
            if (imgData) {
                const logoW = 35;
                const logoH = logoW * (imgData.height / imgData.width);
                doc.addImage(imgData.data, imgData.format, 105 - (logoW / 2), yPos, logoW, logoH);
                yPos += logoH + 5;
            }
        } else {
            yPos += 10;
        }

        doc.setTextColor(0, 0, 0);
        doc.setFont(template.headerFont, 'bold');
        doc.setFontSize(26);
        doc.text(title, 105, yPos + 10, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont(template.headerFont, 'normal');
        doc.setTextColor(80, 80, 80);
        safeText(doc, `${idLabel}: ${idValue} | ${dateLabel}: ${dateValue}`, 105, yPos + 18, { align: 'center' });

        yPos += 35;
    }
    return yPos;
};

const drawContactGrid = (doc: any, data: any, profile: UserProfile, yPos: number, template: TemplateStyle) => {
    const labelFont = template.layoutType === 'modern' ? 'helvetica' : 'times';
    const bodyFont = template.layoutType === 'modern' ? 'helvetica' : 'times';
    const isModern = template.layoutType === 'modern';

    doc.setFontSize(10);
    doc.setFont(labelFont, 'bold');
    doc.setTextColor(0, 0, 0);

    doc.text(isModern ? 'FROM' : 'FROM:', 20, yPos);
    doc.text(isModern ? 'TO' : 'TO:', 110, yPos);

    doc.setFont(bodyFont, 'normal');
    doc.setTextColor(60, 60, 60);

    let leftY = yPos + 6;
    safeText(doc, data.companyName || profile.companyName, 20, leftY);
    const compAddr = doc.splitTextToSize(data.companyAddress || profile.address || '', 80);
    doc.text(compAddr, 20, leftY + 5);
    const compPhone = data.companyPhone || profile.phone || '';
    const compWeb = data.companyWebsite || profile.website || '';
    const compContact = [compPhone, compWeb].filter(Boolean).join(' | ');
    doc.text(compContact, 20, leftY + 5 + (compAddr.length * 5));

    let rightY = yPos + 6;
    safeText(doc, data.clientName || '', 110, rightY);
    const clientAddr = doc.splitTextToSize(data.clientAddress || data.projectAddress || '', 80);
    doc.text(clientAddr, 110, rightY + 5);

    const maxH = Math.max(
        leftY + 10 + (compAddr.length * 5),
        rightY + 5 + (clientAddr.length * 5)
    );
    return maxH + 10;
};

// --- Generators ---

export const generateInvoicePDF = async (profile: UserProfile, job: Job, invoice: InvoiceData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(invoice.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const title = invoice.isProgressBilling ? 'PROGRESS INVOICE' : 'INVOICE';
    const yPos = await drawDocumentHeader(doc, invoice, profile, template, primaryRgb, title, 'Date', invoice.issueDate, 'Invoice #', invoice.invoiceNumber);
    const gridEnd = drawContactGrid(doc, invoice, profile, yPos, template);

    let tableColumn;
    let tableRows;

    if (invoice.isProgressBilling) {
        tableColumn = ["Description", "Scheduled Value", "% Billed", "Current Amount"];
        tableRows = invoice.lineItems.map(item => {
            const scheduledVal = Number(item.progressValue || item.rate || 0);
            const pct = Number(item.progressPercentage || item.quantity || 0);
            const currentAmount = scheduledVal * (pct / 100);
            return [
                item.description,
                `$${scheduledVal.toFixed(2)}`,
                `${pct.toFixed(2)}%`,
                `$${currentAmount.toFixed(2)}`
            ];
        });
    } else {
        tableColumn = ["Description", "Quantity", "Rate", "Amount"];
        tableRows = invoice.lineItems.map(item => [
            item.description,
            item.quantity,
            `$${Number(item.rate).toFixed(2)}`,
            `$${(item.quantity * item.rate).toFixed(2)}`
        ]);
    }

    (doc as any).autoTable({
        startY: gridEnd + 5,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { font: template.font, fontSize: 10 },
        margin: { left: 20, right: 20 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    const subtotal = invoice.lineItems.reduce((acc, item) => {
        if (invoice.isProgressBilling) {
            const val = Number(item.progressValue || item.rate || 0);
            const pct = Number(item.progressPercentage || item.quantity || 0);
            return acc + (val * (pct / 100));
        } else {
            return acc + (item.quantity * item.rate);
        }
    }, 0);

    const discount = invoice.discount || 0;
    const shipping = invoice.shipping || 0;
    const taxRate = invoice.taxRate || 0;
    const taxable = subtotal - discount;
    const tax = taxable * (taxRate / 100);
    const total = taxable + tax + shipping;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 190, finalY, { align: 'right' });
    if (discount > 0) doc.text(`Discount: -$${discount.toFixed(2)}`, 190, finalY + 5, { align: 'right' });
    if (tax > 0) doc.text(`Tax (${taxRate}%): $${tax.toFixed(2)}`, 190, finalY + 10, { align: 'right' });
    if (shipping > 0) doc.text(`Shipping: $${shipping.toFixed(2)}`, 190, finalY + 15, { align: 'right' });

    doc.setFontSize(14);
    doc.setFont(template.font, 'bold');
    doc.setTextColor(...primaryRgb);
    doc.text(`Total: $${total.toFixed(2)}`, 190, finalY + 25, { align: 'right' });

    let currentY = finalY + 40;
    if (invoice.paypalLink) {
        doc.setFillColor(...primaryRgb);
        doc.roundedRect(20, currentY, 40, 10, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text('PAY NOW', 40, currentY + 6.5, { align: 'center' });
        doc.link(20, currentY, 40, 10, { url: invoice.paypalLink });
        currentY += 20;
    }

    if (invoice.notes) {
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont(template.font, 'bold');
        doc.text('Notes:', 20, currentY);
        doc.setFont(template.font, 'normal');
        doc.text(invoice.notes, 20, currentY + 5, { maxWidth: 170 });
        currentY += 20;
    }

    if (invoice.signatureUrl) {
        const sigData = await loadImage(invoice.signatureUrl);
        if (sigData) {
            doc.addImage(sigData.data, sigData.format, 20, currentY, 40, 20);
            doc.setDrawColor(0, 0, 0);
            doc.line(20, currentY + 20, 80, currentY + 20);
            doc.text('Authorized Signature', 20, currentY + 25);
        }
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
};

export const generateEstimatePDF = async (profile: UserProfile, job: Job, data: EstimateData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'ESTIMATE', 'Valid Until', data.expiryDate, 'Estimate #', data.estimateNumber);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    const tableColumn = ["Description", "Quantity", "Rate", "Total"];
    const tableRows = data.lineItems.map(i => [i.description, i.quantity, `$${Number(i.rate).toFixed(2)}`, `$${(i.quantity * i.rate).toFixed(2)}`]);

    (doc as any).autoTable({
        startY: gridEnd + 10,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        styles: { font: template.font, fontSize: 10 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const total = data.lineItems.reduce((a, b) => a + (b.quantity * b.rate), 0);

    doc.setFontSize(14);
    doc.setFont(template.font, 'bold');
    doc.setTextColor(...primaryRgb);
    doc.text(`Total Estimate: $${total.toFixed(2)}`, 190, finalY, { align: 'right' });

    let currentY = finalY + 20;
    if (data.terms) {
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont(template.font, 'bold');
        doc.text('Terms & Conditions', 20, currentY);
        doc.setFont(template.font, 'normal');
        doc.setFontSize(9);
        const terms = doc.splitTextToSize(data.terms, 170);
        doc.text(terms, 20, currentY + 5);
        currentY += (terms.length * 5) + 15;
    }

    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if (sig) doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
        doc.line(20, currentY + 15, 80, currentY + 15);
        doc.text('Accepted By (Client)', 20, currentY + 20);
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`Estimate-${data.estimateNumber}.pdf`);
};

export const generatePurchaseOrderPDF = async (profile: UserProfile, job: Job, data: PurchaseOrderData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'PURCHASE ORDER', 'Date', data.date, 'P.O. #', data.poNumber);

    doc.setFontSize(9);
    doc.setFont(template.font, 'bold');

    const colY = yPos + 5;
    const colW = 55;
    const gap = 5;

    doc.text('VENDOR', 20, colY);
    doc.setFont(template.font, 'normal');
    doc.text(data.vendorName, 20, colY + 5);
    const vendorAddr = doc.splitTextToSize(data.vendorAddress || '', colW);
    doc.text(vendorAddr, 20, colY + 10);
    doc.text(data.vendorPhone || '', 20, colY + 10 + (vendorAddr.length * 4) + 4);

    doc.setFont(template.font, 'bold');
    doc.text('SHIP TO', 20 + colW + gap, colY);
    doc.setFont(template.font, 'normal');
    doc.text(data.shipToName, 20 + colW + gap, colY + 5);
    const shipAddr = doc.splitTextToSize(data.shipToAddress || '', colW);
    doc.text(shipAddr, 20 + colW + gap, colY + 10);
    doc.text(data.shipToPhone || '', 20 + colW + gap, colY + 10 + (shipAddr.length * 4) + 4);

    doc.setFont(template.font, 'bold');
    doc.text('BILL TO', 20 + (colW * 2) + (gap * 2), colY);
    doc.setFont(template.font, 'normal');
    doc.text(data.companyName || profile.companyName, 20 + (colW * 2) + (gap * 2), colY + 5);
    const billAddr = doc.splitTextToSize(data.companyAddress || profile.address || '', colW);
    doc.text(billAddr, 20 + (colW * 2) + (gap * 2), colY + 10);

    let currentY = Math.max(
        colY + 25,
        colY + 15 + (vendorAddr.length * 4),
        colY + 15 + (shipAddr.length * 4),
        colY + 15 + (billAddr.length * 4)
    );

    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(245, 245, 245);
    doc.rect(20, currentY, 170, 20, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    doc.setFont(template.font, 'bold');
    doc.text('REQUIRED DATE:', 25, currentY + 8);
    doc.setFont(template.font, 'normal');
    doc.text(data.deliveryDate, 60, currentY + 8);

    doc.setFont(template.font, 'bold');
    doc.text('DELIVERY INSTRUCTIONS:', 25, currentY + 16);
    doc.setFont(template.font, 'normal');
    const instructions = doc.splitTextToSize(data.deliveryInstructions || 'None', 110);
    doc.text(instructions, 75, currentY + 16);

    currentY += 30;

    const tableColumn = ["Item / Description", "Qty", "Rate", "Amount"];
    const tableRows = data.lineItems.map(i => [
        i.description,
        i.quantity,
        `$${Number(i.rate).toFixed(2)}`,
        `$${(i.quantity * i.rate).toFixed(2)}`
    ]);

    (doc as any).autoTable({
        startY: currentY,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        styles: { font: template.font, fontSize: 9 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const total = data.lineItems.reduce((a, b) => a + (b.quantity * b.rate), 0);

    doc.setFontSize(12);
    doc.setFont(template.font, 'bold');
    doc.text(`Total: $${total.toFixed(2)}`, 190, finalY, { align: 'right' });

    if (data.signatureUrl) {
        const sigData = await loadImage(data.signatureUrl);
        if (sigData) {
            doc.addImage(sigData.data, sigData.format, 20, finalY + 10, 40, 15);
            doc.line(20, finalY + 25, 80, finalY + 25);
            doc.setFontSize(8);
            doc.text('Authorized By', 20, finalY + 29);
        }
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`PO-${data.poNumber}.pdf`);
};

export const generateWorkOrderPDF = async (profile: UserProfile, job: Job, data: WorkOrderData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'WORK ORDER', 'Date', data.date, 'WO #', data.workOrderNumber);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    let currentY = gridEnd + 10;

    doc.setFontSize(11);
    doc.setFont(template.font, 'bold');
    doc.setFillColor(240, 240, 240);
    doc.rect(20, currentY, 170, 8, 'F');
    doc.text('Description of Work', 22, currentY + 6);
    currentY += 12;

    doc.setFont(template.font, 'normal');
    doc.setFontSize(10);
    const desc = doc.splitTextToSize(data.description, 170);
    doc.text(desc, 20, currentY);
    currentY += (desc.length * 5) + 10;

    if (data.materialsUsed) {
        doc.setFont(template.font, 'bold');
        doc.setFillColor(240, 240, 240);
        doc.rect(20, currentY, 170, 8, 'F');
        doc.text('Materials Used', 22, currentY + 6);
        currentY += 12;
        doc.setFont(template.font, 'normal');
        const mats = doc.splitTextToSize(data.materialsUsed, 170);
        doc.text(mats, 20, currentY);
        currentY += (mats.length * 5) + 10;
    }

    const tableRows = [
        ['Status', data.status],
        ['Labor Hours', data.hours.toString()],
        ['Estimated Cost', `$${data.cost.toFixed(2)}`]
    ];

    (doc as any).autoTable({
        startY: currentY,
        body: tableRows,
        theme: 'grid',
        styles: { font: template.font, fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    if (data.terms) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        const terms = doc.splitTextToSize(data.terms, 170);
        doc.text(terms, 20, currentY);
        currentY += (terms.length * 4) + 10;
    }

    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if (sig) {
            doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
            doc.setDrawColor(0);
            doc.line(20, currentY + 15, 80, currentY + 15);
            doc.text('Authorized Signature', 20, currentY + 20);
        }
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`WorkOrder-${data.workOrderNumber}.pdf`);
};

export const generateDailyJobReportPDF = async (profile: UserProfile, data: DailyJobReportData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'DAILY REPORT', 'Date', data.date, 'Report #', data.reportNumber);

    let currentY = yPos + 5;

    // Project Info Row
    doc.setFontSize(10);
    doc.setFont(template.font, 'bold');
    doc.text('Project:', 20, currentY);
    doc.setFont(template.font, 'normal');
    doc.text(data.projectName, 40, currentY);

    doc.setFont(template.font, 'bold');
    doc.text('Weather:', 120, currentY);
    doc.setFont(template.font, 'normal');
    doc.text(`${data.weather} / ${data.temperature}`, 140, currentY);
    currentY += 10;

    // Render HTML Content with pagination callback
    if (data.content) {
        currentY = await renderHtmlToPdf(doc, data.content, 20, currentY, 170, () => {
            // On new page, redraw the background template
            drawTemplateBackground(doc, template, primaryRgb);
        });
    }

    currentY += 10;
    // Check signature fits
    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if (sig) {
            if (currentY > doc.internal.pageSize.height - 40) {
                doc.addPage();
                drawTemplateBackground(doc, template, primaryRgb);
                currentY = 20;
            }
            doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
            doc.line(20, currentY + 15, 80, currentY + 15);
            doc.setFontSize(9);
            doc.text('Signed By Foreman/Superintendent', 20, currentY + 20);
        }
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`DailyReport-${data.date}.pdf`);
};

export const generateTimeSheetPDF = async (profile: UserProfile, job: Job, data: TimeSheetData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'TIME SHEET', 'Date', data.date, 'Worker', data.workerName);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    const tableRows = [
        ['Date', data.date],
        ['Regular Hours', data.hoursWorked.toString()],
        ['Overtime Hours', data.overtimeHours.toString()],
        ['Total Hours', (data.hoursWorked + data.overtimeHours).toString()]
    ];

    (doc as any).autoTable({
        startY: gridEnd + 10,
        head: [['Description', 'Value']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: primaryRgb },
        styles: { font: template.font, fontSize: 10 }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 10;

    if (data.notes) {
        doc.setFont(template.font, 'bold');
        doc.text('Notes:', 20, currentY);
        currentY += 5;
        doc.setFont(template.font, 'normal');
        const notes = doc.splitTextToSize(data.notes, 170);
        doc.text(notes, 20, currentY);
        currentY += (notes.length * 5) + 10;
    }

    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if (sig) {
            doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
            doc.line(20, currentY + 15, 80, currentY + 15);
            doc.text('Worker Signature', 20, currentY + 20);
        }
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`TimeSheet-${data.date}-${data.workerName}.pdf`);
};

export const generateMaterialLogPDF = async (profile: UserProfile, job: Job, data: MaterialLogData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'MATERIAL LOG', 'Date', data.date, 'Project', data.projectName);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    const tableColumn = ["Item", "Supplier", "Qty", "Unit Cost", "Total"];
    const tableRows = data.items.map(item => [
        item.name,
        item.supplier,
        item.quantity,
        `$${item.unitCost.toFixed(2)}`,
        `$${(item.quantity * item.unitCost).toFixed(2)}`
    ]);

    (doc as any).autoTable({
        startY: gridEnd + 10,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: primaryRgb },
        styles: { font: template.font, fontSize: 10 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const total = data.items.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

    doc.setFont(template.font, 'bold');
    doc.text(`Total Cost: $${total.toFixed(2)}`, 190, finalY, { align: 'right' });

    if (getBlob) return doc.output('datauristring');
    doc.save(`MaterialLog-${data.date}.pdf`);
};

export const generateExpenseLogPDF = async (profile: UserProfile, job: Job, data: ExpenseLogData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'EXPENSE LOG', 'Date', data.date, 'Category', data.category);

    let currentY = yPos + 10;

    doc.setFont(template.font, 'bold');
    doc.setFontSize(10);
    doc.text(`Vendor: ${data.vendor}`, 20, currentY);
    currentY += 10;

    // Support for multiple items in table
    const tableColumn = ["Description", "Amount"];
    const tableRows = (data.items || []).map(item => [
        item.description,
        `$${(item.amount || 0).toFixed(2)}`
    ]);

    (doc as any).autoTable({
        startY: currentY,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        styles: { font: template.font, fontSize: 10 },
        margin: { left: 20, right: 20 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFont(template.font, 'bold');
    doc.setFontSize(14);
    doc.text(`Total Amount: $${(data.amount || 0).toFixed(2)}`, 190, finalY, { align: 'right' });
    currentY = finalY + 15;

    if (data.notes) {
        doc.setFontSize(10);
        doc.setFont(template.font, 'normal');
        const notes = doc.splitTextToSize(`Notes: ${data.notes}`, 170);
        doc.text(notes, 20, currentY);
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`Expense-${data.date}.pdf`);
};

export const generateWarrantyPDF = async (profile: UserProfile, job: Job, data: WarrantyData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    // Certificate Style Header
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, 210, 20, 'F');
    doc.rect(0, 277, 210, 20, 'F');

    doc.setFont(template.headerFont, 'bold');
    doc.setFontSize(30);
    doc.setTextColor(...primaryRgb);
    doc.text('CERTIFICATE OF WARRANTY', 105, 50, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Warranty #: ${data.warrantyNumber}`, 105, 60, { align: 'center' });

    let currentY = 80;
    doc.setFont(template.font, 'normal');
    doc.setFontSize(12);

    const text = `This warranty is presented to ${data.clientName} for the project located at ${data.projectAddress}.`;
    const splitText = doc.splitTextToSize(text, 160);
    doc.text(splitText, 105, currentY, { align: 'center' });
    currentY += 20;

    doc.setFont(template.font, 'bold');
    doc.text(`Duration: ${data.duration}`, 105, currentY, { align: 'center' });
    doc.text(`Completion Date: ${data.completedDate}`, 105, currentY + 7, { align: 'center' });
    currentY += 20;

    doc.setFont(template.font, 'bold');
    doc.text('Coverage:', 20, currentY);
    currentY += 5;
    doc.setFont(template.font, 'normal');
    const coverage = doc.splitTextToSize(data.coverage, 170);
    doc.text(coverage, 20, currentY);
    currentY += (coverage.length * 5) + 10;

    doc.setFont(template.font, 'bold');
    doc.text('Conditions:', 20, currentY);
    currentY += 5;
    doc.setFont(template.font, 'normal');
    const conditions = doc.splitTextToSize(data.conditions, 170);
    doc.text(conditions, 20, currentY);
    currentY += (conditions.length * 5) + 20;

    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if (sig) {
            doc.addImage(sig.data, sig.format, 105 - 20, currentY, 40, 15);
            doc.line(75, currentY + 15, 135, currentY + 15);
            doc.setFontSize(10);
            doc.text('Authorized Signature', 105, currentY + 20, { align: 'center' });
        }
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`Warranty-${data.warrantyNumber}.pdf`);
};

export const generateNotePDF = async (profile: UserProfile, job: Job, data: NoteData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    drawTemplateBackground(doc, template, primaryRgb);

    doc.setFont(template.headerFont, 'bold');
    doc.setFontSize(20);
    doc.text(data.title || 'Note', 20, 20);

    await renderHtmlToPdf(doc, data.content, 20, 30, 170, () => {
        drawTemplateBackground(doc, template, primaryRgb);
    });

    if (getBlob) return doc.output('datauristring');
    doc.save(`${data.title || 'Note'}.pdf`);
};

export const generateReceiptPDF = async (profile: UserProfile, job: Job, data: ReceiptData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'RECEIPT', 'Date', data.date, 'Receipt #', data.receiptNumber);

    // Receipt Details
    doc.setFontSize(12);
    doc.setFont(template.font, 'normal');

    let currentY = yPos + 10;
    doc.text(`Received From: ${data.clientName}`, 20, currentY);
    currentY += 10;
    doc.text(`Amount: $${data.amount.toFixed(2)}`, 20, currentY);
    currentY += 10;
    doc.text(`For: ${data.description}`, 20, currentY);
    currentY += 10;
    doc.text(`Payment Method: ${data.paymentMethod}`, 20, currentY);

    currentY += 30;
    doc.setFontSize(16);
    doc.setFont(template.font, 'bold');
    doc.setTextColor(...primaryRgb);
    doc.text('PAID IN FULL', 105, currentY, { align: 'center' });

    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if (sig) {
            doc.addImage(sig.data, sig.format, 20, currentY + 20, 40, 15);
            doc.setDrawColor(0);
            doc.line(20, currentY + 35, 80, currentY + 35);
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text('Received By', 20, currentY + 40);
        }
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`Receipt-${data.receiptNumber}.pdf`);
};

export const generateChangeOrderPDF = async (profile: UserProfile, job: Job, data: ChangeOrderData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'CHANGE ORDER', 'Date', data.date, 'CO #', data.changeOrderNumber);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    let currentY = gridEnd + 10;

    doc.setFont(template.font, 'bold');
    doc.text(`Reason: ${data.reason}`, 20, currentY);
    currentY += 6;
    doc.setFont(template.font, 'normal');
    const desc = doc.splitTextToSize(data.description, 170);
    doc.text(desc, 20, currentY);
    currentY += (desc.length * 5) + 10;

    const tableColumn = ["Item", "Qty", "Rate", "Total"];
    const tableRows = data.lineItems.map(i => [i.description, i.quantity, `$${Number(i.rate).toFixed(2)}`, `$${(i.quantity * i.rate).toFixed(2)}`]);

    (doc as any).autoTable({
        startY: currentY,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: primaryRgb },
        styles: { font: template.font, fontSize: 10 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const changeTotal = data.lineItems.reduce((a, b) => a + (b.quantity * b.rate), 0);
    const newTotal = (data.currentContractSum || 0) + changeTotal;

    doc.text(`Original/Current Contract: $${Number(data.currentContractSum).toFixed(2)}`, 190, finalY, { align: 'right' });
    doc.text(`Net Change: $${changeTotal.toFixed(2)}`, 190, finalY + 6, { align: 'right' });
    doc.setFont(template.font, 'bold');
    doc.text(`New Contract Total: $${newTotal.toFixed(2)}`, 190, finalY + 12, { align: 'right' });

    if (getBlob) return doc.output('datauristring');
    doc.save(`ChangeOrder-${data.changeOrderNumber}.pdf`);
};

export const generateDocumentBase64 = async (type: string, data: any, profile: UserProfile, job: Job): Promise<string> => {
    switch (type) {
        case 'Invoice': return generateInvoicePDF(profile, job, data, data.templateId || 'standard', true);
        case 'Estimate': return generateEstimatePDF(profile, job, data, data.templateId || 'standard', true);
        case 'Work Order': return generateWorkOrderPDF(profile, job, data, data.templateId || 'standard', true);
        case 'Daily Job Report': return generateDailyJobReportPDF(profile, data, data.templateId || 'standard', true);
        case 'Time Sheet': return generateTimeSheetPDF(profile, job, data, data.templateId || 'standard', true);
        case 'Material Log': return generateMaterialLogPDF(profile, job, data, data.templateId || 'standard', true);
        case 'Expense Log': return generateExpenseLogPDF(profile, job, data, data.templateId || 'standard', true);
        case 'Warranty': return generateWarrantyPDF(profile, job, data, data.templateId || 'standard', true);
        case 'Note': return generateNotePDF(profile, job, data, data.templateId || 'standard', true);
        case 'Receipt': return generateReceiptPDF(profile, job, data, data.templateId || 'standard', true);
        case 'Change Order': return generateChangeOrderPDF(profile, job, data, data.templateId || 'standard', true);
        case 'Purchase Order': return generatePurchaseOrderPDF(profile, job, data, data.templateId || 'standard', true);
        default: return '';
    }
};
