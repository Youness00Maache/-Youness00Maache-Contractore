
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
        console.error('loadImage failed for url:', url, e);
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
const drawTemplateBackground = async (doc: any, template: TemplateStyle, primaryRgb: number[]) => {
    if (template.backgroundImage) {
        try {
            console.log('Attempting to load background:', template.backgroundImage);
            const bg = await loadImage(template.backgroundImage);
            if (bg) {
                console.log('Background loaded successfully, dimensions:', bg.width, 'x', bg.height);
                // Draw background full page (A4)
                doc.addImage(bg.data, bg.format, 0, 0, 210, 297);
                return; // Skip drawing default borders
            } else {
                console.error('Background image loaded but returned null');
                // Draw error text on PDF to debug
                doc.setTextColor(255, 0, 0);
                doc.setFontSize(12);
                doc.text(`Error: Could not load background image: ${template.backgroundImage}`, 10, 10);
                doc.text(`Please ensure file exists in /public/templates/`, 10, 15);
                return; // Don't draw borders if we specified a background image
            }
        } catch (e) {
            console.error('Failed to load background image', e);
            // Draw error text
            doc.setTextColor(255, 0, 0);
            doc.setFontSize(12);
            doc.text(`Exception loading background: ${e}`, 10, 10);
            return; // Don't draw borders if we specified a background image
        }
    }

    if (template.layoutType === 'modern') {
        // Draw a thin top bar for continuation pages to maintain theme
        doc.setFillColor(...primaryRgb);
        doc.rect(0, 0, 210, 5, 'F');
    } else {
        // Draw standard borders (only for non-background templates)
        doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
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
    name: string;
    layoutEngine: 'classic_bordered' | 'modern_sidebar' | 'minimalist' | 'bold_header' | 'compact' | 'two_column' | 'executive';
    primaryColor: string;
    secondaryColor: string;
    textColor: string;
    font: 'times' | 'helvetica' | 'courier';
    headerFont: 'times' | 'helvetica' | 'courier';
    backgroundImage?: string;
    layoutType?: string;
    // Layout-specific properties
    sidebarWidth?: number;
    marginSize?: number;
    headerHeight?: number;

    // Flexible Layout Configuration
    layoutConfig?: {
        // Document Header (Invoice #, Date, Title)
        headerPos: { x: number, y: number, align: 'left' | 'right' | 'center' };

        // Company Info
        companyInfoPos: { x: number, y: number, align: 'left' | 'right' | 'center' };

        // Client Info
        clientInfoPos: { x: number, y: number, align: 'left' | 'right' | 'center' };

        // Logo
        logoPos: { x: number, y: number, w: number, h: number, maxW?: number, maxH?: number };

        // Main Content Table
        gridStartY: number;

        // Totals Section
        totalsPos: { x: number, align: 'left' | 'right' };
    };
}

const templates: Record<string, TemplateStyle> = {
    classic_bordered: {
        id: 'classic_bordered',
        name: 'Classic Bordered',
        layoutEngine: 'classic_bordered',
        primaryColor: '#2c3e50',
        secondaryColor: '#34495e',
        textColor: '#2c3e50',
        font: 'times',
        headerFont: 'times',
    },
    modern_sidebar: {
        id: 'modern_sidebar',
        name: 'Modern Sidebar',
        layoutEngine: 'modern_sidebar',
        primaryColor: '#3498db',
        secondaryColor: '#2980b9',
        textColor: '#2c3e50',
        font: 'helvetica',
        headerFont: 'helvetica',
        sidebarWidth: 60,
    },
    minimalist: {
        id: 'minimalist',
        name: 'Minimalist',
        layoutEngine: 'minimalist',
        primaryColor: '#64748b',
        secondaryColor: '#94a3b8',
        textColor: '#475569',
        font: 'helvetica',
        headerFont: 'helvetica',
        marginSize: 30,
    },
    bold_header: {
        id: 'bold_header',
        name: 'Bold Header',
        layoutEngine: 'bold_header',
        primaryColor: '#1e40af',
        secondaryColor: '#2563eb',
        textColor: '#1e3a8a',
        font: 'helvetica',
        headerFont: 'helvetica',
        headerHeight: 50,
    },
    compact: {
        id: 'compact',
        name: 'Compact',
        layoutEngine: 'compact',
        primaryColor: '#475569',
        secondaryColor: '#64748b',
        textColor: '#334155',
        font: 'helvetica',
        headerFont: 'helvetica',
        marginSize: 15,
    },
    two_column: {
        id: 'two_column',
        name: 'Two Column',
        layoutEngine: 'two_column',
        primaryColor: '#16a085',
        secondaryColor: '#1abc9c',
        textColor: '#0f766e',
        font: 'helvetica',
        headerFont: 'helvetica',
    },
    executive: {
        id: 'executive',
        name: 'Executive',
        layoutEngine: 'executive',
        primaryColor: '#831843',
        secondaryColor: '#9f1239',
        textColor: '#500724',
        font: 'times',
        headerFont: 'times',
        marginSize: 25,
    },
    // Designer Templates (Image Backgrounds)
    template_1: {
        id: 'template_1',
        name: 'Layout 1',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/1.jpg',
        layoutConfig: {
            headerPos: { x: 20, y: 30, align: 'left' },
            companyInfoPos: { x: 20, y: 70, align: 'left' },
            clientInfoPos: { x: 110, y: 70, align: 'left' },
            logoPos: { x: 160, y: 20, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 110,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_2: {
        id: 'template_2',
        name: 'Layout 2',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/2.jpg',
        layoutConfig: {
            headerPos: { x: 105, y: 30, align: 'center' },
            companyInfoPos: { x: 20, y: 60, align: 'left' },
            clientInfoPos: { x: 110, y: 60, align: 'left' },
            logoPos: { x: 85, y: 15, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 100,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_3: {
        id: 'template_3',
        name: 'Layout 3',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/3.jpg',
        layoutConfig: {
            headerPos: { x: 20, y: 30, align: 'left' },
            companyInfoPos: { x: 20, y: 70, align: 'left' },
            clientInfoPos: { x: 110, y: 70, align: 'left' },
            logoPos: { x: 150, y: 20, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 110,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_4: {
        id: 'template_4',
        name: 'Layout 4',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/4.jpg',
        layoutConfig: {
            headerPos: { x: 190, y: 30, align: 'right' },
            companyInfoPos: { x: 20, y: 70, align: 'left' },
            clientInfoPos: { x: 110, y: 70, align: 'left' },
            logoPos: { x: 20, y: 20, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 110,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_5: {
        id: 'template_5',
        name: 'Layout 5',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/5.jpg',
        layoutConfig: {
            headerPos: { x: 105, y: 30, align: 'center' },
            companyInfoPos: { x: 20, y: 60, align: 'left' },
            clientInfoPos: { x: 110, y: 60, align: 'left' },
            logoPos: { x: 85, y: 15, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 100,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_6: {
        id: 'template_6',
        name: 'Layout 6',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/6.jpg',
        layoutConfig: {
            headerPos: { x: 20, y: 30, align: 'left' },
            companyInfoPos: { x: 20, y: 70, align: 'left' },
            clientInfoPos: { x: 110, y: 70, align: 'left' },
            logoPos: { x: 150, y: 20, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 110,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_7: {
        id: 'template_7',
        name: 'Layout 7',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/7.jpg',
        layoutConfig: {
            headerPos: { x: 190, y: 30, align: 'right' },
            companyInfoPos: { x: 20, y: 70, align: 'left' },
            clientInfoPos: { x: 110, y: 70, align: 'left' },
            logoPos: { x: 20, y: 20, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 110,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_8: {
        id: 'template_8',
        name: 'Layout 8',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/8.jpg',
        layoutConfig: {
            headerPos: { x: 105, y: 30, align: 'center' },
            companyInfoPos: { x: 20, y: 60, align: 'left' },
            clientInfoPos: { x: 110, y: 60, align: 'left' },
            logoPos: { x: 85, y: 15, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 100,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_9: {
        id: 'template_9',
        name: 'Layout 9',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/9.jpg',
        layoutConfig: {
            headerPos: { x: 20, y: 30, align: 'left' },
            companyInfoPos: { x: 20, y: 70, align: 'left' },
            clientInfoPos: { x: 110, y: 70, align: 'left' },
            logoPos: { x: 150, y: 20, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 110,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_10: {
        id: 'template_10',
        name: 'Layout 10',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/10.jpg',
        layoutConfig: {
            headerPos: { x: 190, y: 30, align: 'right' },
            companyInfoPos: { x: 20, y: 70, align: 'left' },
            clientInfoPos: { x: 110, y: 70, align: 'left' },
            logoPos: { x: 20, y: 20, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 110,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_11: {
        id: 'template_11',
        name: 'Layout 11',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/11.jpg',
        layoutConfig: {
            headerPos: { x: 105, y: 30, align: 'center' },
            companyInfoPos: { x: 20, y: 60, align: 'left' },
            clientInfoPos: { x: 110, y: 60, align: 'left' },
            logoPos: { x: 85, y: 15, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 100,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    template_12: {
        id: 'template_12',
        name: 'Layout 12',
        layoutEngine: 'classic_bordered',
        primaryColor: '#333333',
        secondaryColor: '#555555',
        textColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        backgroundImage: '/templates/12.jpg',
        layoutConfig: {
            headerPos: { x: 20, y: 30, align: 'left' },
            companyInfoPos: { x: 20, y: 70, align: 'left' },
            clientInfoPos: { x: 110, y: 70, align: 'left' },
            logoPos: { x: 150, y: 20, maxW: 40, maxH: 20, w: 40, h: 20 },
            gridStartY: 110,
            totalsPos: { x: 190, align: 'right' }
        }
    },
    // Alias for backward compatibility
    standard: {
        id: 'standard',
        name: 'Standard',
        layoutEngine: 'classic_bordered',
        primaryColor: '#2c3e50',
        secondaryColor: '#34495e',
        textColor: '#2c3e50',
        font: 'times',
        headerFont: 'times',
    },
};

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : null;
};

const drawDocumentHeader = async (doc: any, data: any, profile: UserProfile, template: TemplateStyle, primaryRgb: number[], title: string, dateLabel: string, dateValue: string, idLabel: string, idValue: string) => {
    // 1. Flexible Layout Engine
    if (template.layoutConfig) {
        // Draw Background first (already handled by caller, but ensure order if needed)
        // Note: Caller executes: await drawDocumentHeader(...) which calls drawTemplateBackground internally for non-modern types.
        // For flexible layouts, we assume background is drawn by caller or we call it here if it wasn't.
        // But existing flow calls layout-specific bg logic inside drawDocumentHeader. Let's call it:
        await drawTemplateBackground(doc, template, primaryRgb);

        const config = template.layoutConfig;

        // Draw Logo
        if (data.logoUrl) {
            const imgData = await loadImage(data.logoUrl);
            if (imgData) {
                let targetW = config.logoPos.w;
                let targetH = config.logoPos.h;

                // Aspect Ratio Preservation
                const imgRatio = imgData.width / imgData.height;
                const boxRatio = targetW / targetH;

                if (imgRatio > boxRatio) {
                    targetH = targetW / imgRatio;
                } else {
                    targetW = targetH * imgRatio;
                }

                doc.addImage(imgData.data, imgData.format, config.logoPos.x, config.logoPos.y, targetW, targetH);
            }
        }

        // Draw Header (Title, ID, Date)
        doc.setTextColor(...primaryRgb);
        doc.setFont(template.headerFont, 'bold');
        doc.setFontSize(26);
        doc.text(title, config.headerPos.x, config.headerPos.y, { align: config.headerPos.align });

        doc.setFontSize(10);
        doc.setFont(template.font, 'normal');
        doc.setTextColor(0, 0, 0); // Default black for details

        // Calculate offsets for ID/Date below title
        let detailY = config.headerPos.y + 7;
        safeText(doc, `${idLabel}: ${idValue}`, config.headerPos.x, detailY, { align: config.headerPos.align });
        detailY += 5;
        safeText(doc, `${dateLabel}: ${dateValue}`, config.headerPos.x, detailY, { align: config.headerPos.align });

        return config.gridStartY; // Return the configured grid start Y
    }

    // 2. Existing Logic (Modern / Classic)
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
        await drawTemplateBackground(doc, template, primaryRgb);

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
    // 1. Flexible Layout Engine
    if (template.layoutConfig) {
        const config = template.layoutConfig;
        const labelFont = 'helvetica';
        const bodyFont = 'helvetica';

        doc.setFontSize(10);
        doc.setFont(labelFont, 'bold');
        doc.setTextColor(0, 0, 0);

        // Company (From)
        doc.text('FROM:', config.companyInfoPos.x, config.companyInfoPos.y, { align: config.companyInfoPos.align });
        // Client (To)
        doc.text('TO:', config.clientInfoPos.x, config.clientInfoPos.y, { align: config.clientInfoPos.align });

        doc.setFont(bodyFont, 'normal');
        doc.setTextColor(60, 60, 60);

        // Company Details
        let leftY = config.companyInfoPos.y + 5;
        const compAlign = config.companyInfoPos.align;
        safeText(doc, data.companyName || profile.companyName, config.companyInfoPos.x, leftY, { align: compAlign });
        const compAddr = doc.splitTextToSize(data.companyAddress || profile.address || '', 80);
        doc.text(compAddr, config.companyInfoPos.x, leftY + 5, { align: compAlign });
        const compPhone = data.companyPhone || profile.phone || '';
        const compWeb = data.companyWebsite || profile.website || '';
        const compContact = [compPhone, compWeb].filter(Boolean).join(' | ');
        doc.text(compContact, config.companyInfoPos.x, leftY + 5 + (compAddr.length * 5), { align: compAlign });

        // Client Details
        let rightY = config.clientInfoPos.y + 5;
        const clientAlign = config.clientInfoPos.align;
        safeText(doc, data.clientName || '', config.clientInfoPos.x, rightY, { align: clientAlign });
        const clientAddr = doc.splitTextToSize(data.clientAddress || data.projectAddress || '', 80);
        doc.text(clientAddr, config.clientInfoPos.x, rightY + 5, { align: clientAlign });

        // For flexible grids, we just return the GridStartY (usually larger than these text blocks)
        return Math.max(config.gridStartY, leftY + 20, rightY + 20);
    }

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
