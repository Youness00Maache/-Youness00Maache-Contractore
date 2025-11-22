
import { InvoiceData, Job, UserProfile, EstimateData, WorkOrderData, DailyJobReportData, TimeSheetData, MaterialLogData, ExpenseLogData, WarrantyData, NoteData, ReceiptData } from '../types.ts';

declare const jspdf: any;
declare const html2canvas: any;

// --- Helpers ---

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

// Helper to safely draw text handling undefined/null values
const safeText = (doc: any, text: any, x: number, y: number, options?: any) => {
    if (text === null || text === undefined) {
        return;
    }
    let safeVal = text;
    if (typeof text === 'number') safeVal = String(text);
    if (typeof text === 'boolean') safeVal = String(text);
    
    doc.text(safeVal, x, y, options);
};

// --- Template Engine ---
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
    standard: { id: 'standard', primaryColor: '#000000', secondaryColor: '#666666', textColor: '#222222', headerColor: '#ffffff', headerTextColor: '#000000', font: 'helvetica', headerFont: 'times', alternateRowColor: '#f2f2f2', borderColor: '#000000', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    professional: { id: 'professional', primaryColor: '#2c3e50', secondaryColor: '#34495e', textColor: '#2c3e50', headerColor: '#2c3e50', headerTextColor: '#ecf0f1', font: 'times', headerFont: 'times', alternateRowColor: '#eaeded', borderColor: '#bdc3c7', borderRadius: 0, showFooterLine: true, layoutType: 'certificate' },
    elegant: { id: 'elegant', primaryColor: '#8e44ad', secondaryColor: '#9b59b6', textColor: '#4a235a', headerColor: '#ffffff', headerTextColor: '#8e44ad', font: 'times', headerFont: 'times', alternateRowColor: '#f5eef8', borderColor: '#d7bde2', borderRadius: 0, showFooterLine: false, layoutType: 'certificate' },
    warm: { id: 'warm', primaryColor: '#d35400', secondaryColor: '#e67e22', textColor: '#5d4037', headerColor: '#fdebd0', headerTextColor: '#d35400', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#fef5e7', borderColor: '#f5cba7', borderRadius: 2, showFooterLine: true, layoutType: 'certificate' },
    retro: { id: 'retro', primaryColor: '#c0392b', secondaryColor: '#e74c3c', textColor: '#5a4d41', headerColor: '#f9e79f', headerTextColor: '#c0392b', font: 'courier', headerFont: 'courier', alternateRowColor: '#fcf3cf', borderColor: '#d35400', borderRadius: 1, showFooterLine: true, layoutType: 'certificate' },
    
    modern_blue: { id: 'modern_blue', primaryColor: '#3498db', secondaryColor: '#2980b9', textColor: '#2c3e50', headerColor: '#3498db', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#ebf5fb', borderColor: '#aed6f1', borderRadius: 4, showFooterLine: false, layoutType: 'modern' },
    tech: { id: 'tech', primaryColor: '#16a085', secondaryColor: '#1abc9c', textColor: '#000000', headerColor: '#e8f8f5', headerTextColor: '#16a085', font: 'courier', headerFont: 'courier', alternateRowColor: '#e8f6f3', borderColor: '#48c9b0', borderRadius: 0, showFooterLine: true, layoutType: 'modern' },
    industrial: { id: 'industrial', primaryColor: '#f39c12', secondaryColor: '#d35400', textColor: '#000000', headerColor: '#333333', headerTextColor: '#f39c12', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#fcf3cf', borderColor: '#000000', borderRadius: 0, showFooterLine: true, layoutType: 'modern' },
    minimal: { id: 'minimal', primaryColor: '#95a5a6', secondaryColor: '#7f8c8d', textColor: '#7f8c8d', headerColor: '#ffffff', headerTextColor: '#333333', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#ffffff', borderColor: '#ecf0f1', borderRadius: 0, showFooterLine: false, layoutType: 'modern' },
    bold: { id: 'bold', primaryColor: '#000000', secondaryColor: '#000000', textColor: '#000000', headerColor: '#000000', headerTextColor: '#ffffff', font: 'helvetica', headerFont: 'helvetica', alternateRowColor: '#e5e5e5', borderColor: '#000000', borderRadius: 6, showFooterLine: false, layoutType: 'modern' }
};

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : null;
};

// --- Generators ---

export const generateInvoicePDF = async (profile: UserProfile, job: Job, invoice: InvoiceData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(invoice.themeColors?.primary || template.primaryColor) || [0, 0, 0];
    const secondaryRgb = hexToRgb(invoice.themeColors?.secondary || template.secondaryColor) || [100, 100, 100];

    // Header Background
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, 210, 40, 'F');

    // Company Info
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont(template.headerFont, 'bold');
    safeText(doc, invoice.companyName || profile.companyName, 20, 20);
    
    doc.setFontSize(10);
    doc.setFont(template.font, 'normal');
    safeText(doc, invoice.companyAddress || profile.address, 20, 28);
    safeText(doc, `${invoice.companyPhone || profile.phone} | ${invoice.companyWebsite || profile.website}`, 20, 33);

    // Logo
    if (invoice.logoUrl) {
        const imgData = await loadImage(invoice.logoUrl);
        if (imgData) {
            doc.addImage(imgData.data, imgData.format, 160, 5, 30, 30 * (imgData.height / imgData.width));
        }
    }

    // Invoice Title & Meta
    doc.setTextColor(...primaryRgb);
    doc.setFontSize(30);
    doc.setFont(template.headerFont, 'bold');
    safeText(doc, 'INVOICE', 150, 60, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont(template.font, 'normal');
    safeText(doc, `Invoice #: ${invoice.invoiceNumber}`, 150, 70, { align: 'right' });
    safeText(doc, `Date: ${invoice.issueDate}`, 150, 75, { align: 'right' });
    safeText(doc, `Due Date: ${invoice.dueDate}`, 150, 80, { align: 'right' });

    // Client Info
    doc.setFontSize(12);
    doc.setFont(template.font, 'bold');
    doc.setTextColor(...secondaryRgb);
    safeText(doc, 'BILL TO:', 20, 65);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont(template.font, 'normal');
    safeText(doc, invoice.clientName || job.clientName, 20, 72);
    safeText(doc, invoice.clientAddress || job.clientAddress, 20, 78);

    // Line Items Table
    const tableColumn = ["Description", "Quantity", "Rate", "Amount"];
    const tableRows = invoice.lineItems.map(item => [
        item.description,
        item.quantity,
        `$${Number(item.rate).toFixed(2)}`,
        `$${(item.quantity * item.rate).toFixed(2)}`
    ]);

    (doc as any).autoTable({
        startY: 90,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { font: template.font, fontSize: 10 },
        margin: { left: 20, right: 20 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals
    const subtotal = invoice.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
    const discount = invoice.discount || 0;
    const shipping = invoice.shipping || 0;
    const taxRate = invoice.taxRate || 0;
    const taxable = subtotal - discount;
    const tax = taxable * (taxRate / 100);
    const total = taxable + tax + shipping;

    doc.setFontSize(10);
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 190, finalY, { align: 'right' });
    if (discount > 0) doc.text(`Discount: -$${discount.toFixed(2)}`, 190, finalY + 5, { align: 'right' });
    if (tax > 0) doc.text(`Tax (${taxRate}%): $${tax.toFixed(2)}`, 190, finalY + 10, { align: 'right' });
    if (shipping > 0) doc.text(`Shipping: $${shipping.toFixed(2)}`, 190, finalY + 15, { align: 'right' });
    
    doc.setFontSize(14);
    doc.setFont(template.font, 'bold');
    doc.setTextColor(...primaryRgb);
    doc.text(`Total: $${total.toFixed(2)}`, 190, finalY + 25, { align: 'right' });

    // Payment Link Button (Visual Only)
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

    // Notes & Signature
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
            doc.line(20, currentY + 20, 80, currentY + 20);
            doc.text('Authorized Signature', 20, currentY + 25);
        }
    }

    doc.save(`${invoice.invoiceNumber}.pdf`);
};

export const generateWarrantyPDF = async (profile: UserProfile, job: Job, warranty: WarrantyData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(warranty.themeColors?.primary || template.primaryColor) || [0, 0, 0];
    
    const isModern = template.layoutType === 'modern';

    if (isModern) {
        // --- Modern Layout ---
        
        // Header Bar
        doc.setFillColor(...primaryRgb);
        doc.rect(0, 0, 210, 45, 'F');
        
        // Logo (No White Box)
        if (warranty.logoUrl) {
            const imgData = await loadImage(warranty.logoUrl);
            if (imgData) {
                // Draw Logo directly
                doc.addImage(imgData.data, imgData.format, 20, 10, 25, 25 * (imgData.height / imgData.width));
            }
        }

        // Title
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(32);
        doc.text('WARRANTY', 200, 25, { align: 'right' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        safeText(doc, `ID: ${warranty.warrantyNumber}`, 200, 32, { align: 'right' });

        // Issued To / Project Grid
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.text('ISSUED TO', 20, 60);
        doc.text('PROJECT LOCATION', 110, 60);

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        safeText(doc, warranty.clientName, 20, 66);
        safeText(doc, warranty.projectAddress, 110, 66);

        // Divider
        doc.setDrawColor(230, 230, 230);
        doc.line(20, 75, 190, 75);

        // Body Text
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        const introText = `This document certifies that the work performed by ${profile.companyName} has been completed in accordance with industry standards and is warranted as follows.`;
        doc.text(introText, 20, 85, { maxWidth: 170 });

        // Boxes for Duration / Date
        doc.setDrawColor(...primaryRgb);
        doc.setLineWidth(0.5);
        
        // Duration Box
        doc.rect(20, 100, 80, 25);
        doc.setTextColor(...primaryRgb);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('DURATION', 25, 106);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        safeText(doc, warranty.duration, 25, 116);

        // Completion Date Box - Fix Black Box Issue by resetting fill color
        doc.setFillColor(0, 0, 0); // Fill for the black rectangle
        doc.rect(110, 100, 80, 25, 'F');
        doc.setTextColor(255, 255, 255); // Fill override
        doc.setTextColor(200, 50, 50); // Red text for label
        doc.setFontSize(8);
        doc.text('COMPLETION DATE', 115, 106);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        safeText(doc, warranty.completedDate, 115, 116);

        // Content Sections
        let yPos = 140;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('SCOPE OF COVERAGE', 20, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        const coverageLines = doc.splitTextToSize(warranty.coverage || 'N/A', 170);
        doc.text(coverageLines, 20, yPos);
        yPos += (coverageLines.length * 5) + 10;

        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('TERMS & CONDITIONS', 20, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        const condLines = doc.splitTextToSize(warranty.conditions || 'N/A', 170);
        doc.text(condLines, 20, yPos);

        // Signature
        const sigY = 250;
        if (warranty.signatureUrl) {
            const sigData = await loadImage(warranty.signatureUrl);
            if (sigData) {
                doc.addImage(sigData.data, sigData.format, 20, sigY - 15, 40, 15);
            }
        }
        doc.setDrawColor(200, 200, 200);
        doc.line(20, sigY, 80, sigY);
        doc.setFontSize(8);
        doc.text('AUTHORIZED SIGNATURE', 20, sigY + 5);

        doc.line(130, sigY, 190, sigY);
        doc.text('DATE ISSUED', 185, sigY + 5, { align: 'right' });
        doc.text(new Date().toLocaleDateString(), 185, sigY - 2, { align: 'right' });

    } else {
        // --- Classic Certificate Layout ---
        
        // Border
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1);
        doc.rect(10, 10, 190, 277);
        doc.setLineWidth(0.5);
        doc.rect(12, 12, 186, 273);

        let yPos = 40;

        // Logo
        if (warranty.logoUrl) {
            const imgData = await loadImage(warranty.logoUrl);
            if (imgData) {
                const width = 40;
                const height = width * (imgData.height / imgData.width);
                doc.addImage(imgData.data, imgData.format, 105 - (width/2), yPos, width, height);
                yPos += height + 10;
            }
        } else {
            yPos += 30;
        }

        // Header
        doc.setFont('times', 'bold');
        doc.setFontSize(36);
        doc.text('CERTIFICATE OF WARRANTY', 105, yPos, { align: 'center' });
        yPos += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        safeText(doc, `Warranty ID: ${warranty.warrantyNumber}`, 105, yPos, { align: 'center' });
        yPos += 20;

        // Presented To
        doc.setTextColor(0, 0, 0);
        doc.setFont('times', 'normal');
        doc.setFontSize(14);
        doc.text('This warranty is presented to:', 105, yPos, { align: 'center' });
        yPos += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        safeText(doc, warranty.clientName, 105, yPos, { align: 'center' });
        yPos += 15;

        doc.setFont('times', 'normal');
        doc.setFontSize(14);
        doc.text('For the project located at:', 105, yPos, { align: 'center' });
        yPos += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        safeText(doc, warranty.projectAddress, 105, yPos, { align: 'center' });
        yPos += 20;

        // Body
        doc.setFont('times', 'normal');
        doc.setFontSize(12);
        const bodyText = `This document certifies that the work performed by ${profile.companyName} has been completed in accordance with industry standards and is warranted as follows.`;
        const splitBody = doc.splitTextToSize(bodyText, 160);
        doc.text(splitBody, 105, yPos, { align: 'center' });
        yPos += 25;

        // Boxes
        doc.setFillColor(245, 245, 245);
        doc.setDrawColor(0, 0, 0); // Reset draw color
        doc.setTextColor(0, 0, 0); // Reset text color
        
        // Box 1
        doc.rect(25, yPos, 75, 20, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('WARRANTY DURATION', 30, yPos + 6);
        doc.setFont('times', 'normal');
        doc.setFontSize(12);
        safeText(doc, warranty.duration, 30, yPos + 14);

        // Box 2 - Reset fill color to avoid black box
        doc.setFillColor(0, 0, 0); // Black box
        doc.rect(110, yPos, 75, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('COMPLETION DATE', 115, yPos + 6);
        doc.setFont('times', 'normal');
        doc.setFontSize(12);
        safeText(doc, warranty.completedDate, 115, yPos + 14);
        yPos += 35;

        // Details
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('SCOPE OF COVERAGE', 25, yPos);
        yPos += 6;
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        const covLines = doc.splitTextToSize(warranty.coverage || '', 160);
        doc.text(covLines, 25, yPos);
        yPos += (covLines.length * 5) + 10;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('TERMS, CONDITIONS & EXCLUSIONS', 25, yPos);
        yPos += 6;
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        const termsLines = doc.splitTextToSize(warranty.conditions || '', 160);
        doc.text(termsLines, 25, yPos);

        // Footer Signatures
        const footerY = 250;
        if (warranty.signatureUrl) {
            const sigData = await loadImage(warranty.signatureUrl);
            if (sigData) doc.addImage(sigData.data, sigData.format, 25, footerY - 15, 40, 15);
        }
        doc.setDrawColor(150, 150, 150);
        doc.line(25, footerY, 90, footerY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Authorized Signature', 25, footerY + 5);
        doc.text(profile.companyName, 25, footerY + 10);

        doc.line(120, footerY, 185, footerY);
        doc.text('Date', 120, footerY + 5);
        doc.text(new Date().toLocaleDateString(), 120, footerY + 10);

        // Bottom center info
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        const footerText = `${profile.companyName} | ${profile.email} | ${profile.phone} | ${profile.website}`;
        doc.text(footerText, 105, 280, { align: 'center' });
    }

    doc.save(`Warranty-${warranty.warrantyNumber}.pdf`);
};

export const generateWorkOrderPDF = async (profile: UserProfile, job: Job, wo: WorkOrderData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(wo.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    // --- Modern Header ---
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, 210, 40, 'F');
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont(template.headerFont, 'bold');
    doc.setFontSize(28);
    safeText(doc, 'WORK ORDER', 20, 25);
    
    // WO Number & Status
    doc.setFontSize(12);
    safeText(doc, `#${wo.workOrderNumber || ''}`, 20, 32);
    
    doc.setFontSize(14);
    safeText(doc, (wo.status || 'Scheduled').toUpperCase(), 190, 25, { align: 'right' });

    // Logo
    if (wo.logoUrl) {
        const imgData = await loadImage(wo.logoUrl);
        if (imgData) {
            // White box for logo visibility
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(150, 5, 35, 35, 2, 2, 'F');
            doc.addImage(imgData.data, imgData.format, 152.5, 7.5, 30, 30 * (imgData.height / imgData.width));
        }
    }

    let yPos = 50;

    // Info Grid
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont(template.font, 'bold');
    doc.text('SERVICE PROVIDER', 20, yPos);
    doc.text('CLIENT / JOB LOCATION', 110, yPos);
    yPos += 5;

    doc.setFont(template.font, 'normal');
    doc.setTextColor(60, 60, 60);
    // Provider
    safeText(doc, wo.companyName || profile.companyName, 20, yPos);
    safeText(doc, wo.companyAddress || profile.address, 20, yPos + 5);
    safeText(doc, wo.companyPhone || profile.phone, 20, yPos + 10);
    
    // Client
    safeText(doc, wo.clientName || job.clientName, 110, yPos);
    safeText(doc, wo.clientAddress || job.clientAddress, 110, yPos + 5);
    
    yPos += 25;

    // Sections
    const sections = [
        { title: 'DESCRIPTION OF WORK', content: wo.description, height: 40 },
        { title: 'MATERIALS / PARTS', content: wo.materialsUsed, height: 30 }
    ];

    sections.forEach(section => {
        doc.setFillColor(240, 240, 240);
        doc.rect(20, yPos, 170, 8, 'F');
        doc.setTextColor(0, 0, 0);
        doc.setFont(template.font, 'bold');
        doc.text(section.title, 22, yPos + 6);
        yPos += 12;
        
        doc.setFont(template.font, 'normal');
        doc.setTextColor(40, 40, 40);
        const lines = doc.splitTextToSize(section.content || 'N/A', 170);
        doc.text(lines, 20, yPos);
        yPos += Math.max(section.height, lines.length * 5) + 5;
    });

    // Summary Table
    const costY = yPos;
    doc.setDrawColor(200, 200, 200);
    doc.line(20, costY, 190, costY);
    
    yPos += 10;
    doc.setFont(template.font, 'bold');
    doc.text('Hours Worked:', 130, yPos);
    doc.setFont(template.font, 'normal');
    safeText(doc, String(wo.hours || 0), 180, yPos, { align: 'right' });
    
    yPos += 8;
    doc.setFont(template.font, 'bold');
    doc.text('Total Cost:', 130, yPos);
    doc.setFontSize(12);
    doc.setTextColor(...primaryRgb);
    safeText(doc, `$${Number(wo.cost || 0).toFixed(2)}`, 180, yPos, { align: 'right' });

    // Terms
    yPos += 20;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont(template.font, 'bold');
    doc.text('TERMS', 20, yPos);
    doc.setFont(template.font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const termsLines = doc.splitTextToSize(wo.terms || '', 170);
    doc.text(termsLines, 20, yPos + 5);

    // Signature
    const sigY = 260;
    if (wo.signatureUrl) {
        const sigData = await loadImage(wo.signatureUrl);
        if (sigData) doc.addImage(sigData.data, sigData.format, 20, sigY - 15, 40, 15);
    }
    doc.setDrawColor(0, 0, 0);
    doc.line(20, sigY, 80, sigY);
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Authorized Signature', 20, sigY + 5);
    
    doc.line(130, sigY, 190, sigY);
    doc.text('Date', 130, sigY + 5);
    doc.text(new Date().toLocaleDateString(), 185, sigY - 2, { align: 'right' });

    doc.save(`WorkOrder-${wo.workOrderNumber}.pdf`);
};

export const generateDailyJobReportPDF = async (profile: UserProfile, report: DailyJobReportData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(report.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont(template.headerFont, 'bold');
    safeText(doc, 'DAILY JOB REPORT', 105, 13, { align: 'center' });

    let yPos = 30;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    
    // Meta Grid
    const meta = [
        ['Date:', report.date, 'Project:', report.projectName],
        ['Report #:', report.reportNumber, 'Client:', report.clientName],
        ['Weather:', report.weather, 'Location:', report.projectAddress],
        ['Temp:', report.temperature, 'By:', profile.name]
    ];

    meta.forEach(row => {
        doc.setFont(template.font, 'bold');
        safeText(doc, row[0], 20, yPos);
        doc.setFont(template.font, 'normal');
        safeText(doc, row[1], 45, yPos);
        
        doc.setFont(template.font, 'bold');
        safeText(doc, row[2], 110, yPos);
        doc.setFont(template.font, 'normal');
        safeText(doc, row[3], 140, yPos);
        yPos += 6;
    });

    yPos += 10;
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // HTML Content
    if (report.content) {
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = report.content;
        contentDiv.style.width = '595px'; // A4 width px at 72dpi approx
        contentDiv.style.padding = '20px';
        contentDiv.style.fontFamily = template.font;
        document.body.appendChild(contentDiv);

        await doc.html(contentDiv, {
            callback: (doc: any) => {
               // Signature after content
               const finalY = doc.internal.pageSize.getHeight() - 40;
               if (report.signatureUrl) {
                   loadImage(report.signatureUrl).then(sig => {
                       if(sig) doc.addImage(sig.data, sig.format, 20, finalY, 40, 15);
                       doc.line(20, finalY + 15, 80, finalY + 15);
                       doc.text('Signed', 20, finalY + 20);
                       doc.save(`Report-${report.date}.pdf`);
                   });
               } else {
                   doc.save(`Report-${report.date}.pdf`);
               }
            },
            x: 10,
            y: yPos,
            width: 170,
            windowWidth: 650
        });
        document.body.removeChild(contentDiv);
    } else {
        doc.save(`Report-${report.date}.pdf`);
    }
};

export const generateTimeSheetPDF = async (profile: UserProfile, job: Job, data: TimeSheetData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    
    doc.setFontSize(20);
    doc.text('TIME SHEET', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    safeText(doc, `Worker: ${data.workerName}`, 20, 40);
    safeText(doc, `Date: ${data.date}`, 20, 50);
    safeText(doc, `Job: ${job.name}`, 20, 60);
    
    doc.setLineWidth(0.5);
    doc.rect(20, 70, 170, 30);
    doc.text('Hours Worked:', 30, 90);
    doc.text(String(data.hoursWorked), 80, 90);
    doc.text('Overtime:', 110, 90);
    doc.text(String(data.overtimeHours), 150, 90);
    
    if (data.notes) {
        doc.text('Notes:', 20, 120);
        doc.text(data.notes, 20, 130);
    }
    
    doc.save(`TimeSheet-${data.date}.pdf`);
};

export const generateMaterialLogPDF = async (profile: UserProfile, job: Job, data: MaterialLogData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.text('MATERIAL LOG', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Job: ${job.name}`, 20, 35);
    doc.text(`Date: ${data.date}`, 20, 42);

    const rows = data.items.map(i => [i.name, i.supplier, i.quantity, `$${i.unitCost}`]);
    (doc as any).autoTable({
        startY: 50,
        head: [['Item', 'Supplier', 'Qty', 'Cost']],
        body: rows,
    });
    doc.save('Materials.pdf');
};

export const generateEstimatePDF = async (profile: UserProfile, job: Job, data: EstimateData, templateId: string) => {
    // Re-use invoice logic mostly but title changed
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    doc.setFontSize(24);
    doc.text('ESTIMATE', 150, 20, { align: 'right' });
    
    doc.setFontSize(10);
    doc.text(`Estimate #: ${data.estimateNumber}`, 150, 30, { align: 'right' });
    doc.text(`Valid Until: ${data.expiryDate}`, 150, 35, { align: 'right' });

    doc.setFontSize(12);
    doc.text(profile.companyName, 20, 20);
    doc.setFontSize(10);
    doc.text(profile.address, 20, 25);
    
    doc.text('PREPARED FOR:', 20, 45);
    doc.text(job.clientName || '', 20, 50);

    const rows = data.lineItems.map(i => [i.description, i.quantity, `$${i.rate}`, `$${(i.quantity * i.rate).toFixed(2)}`]);
    (doc as any).autoTable({
        startY: 60,
        head: [['Description', 'Qty', 'Rate', 'Total']],
        body: rows,
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const total = data.lineItems.reduce((a, b) => a + (b.quantity * b.rate), 0);
    doc.setFontSize(14);
    doc.text(`Total Estimate: $${total.toFixed(2)}`, 190, finalY, { align: 'right' });
    
    if(data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, finalY + 20, 40, 15);
        doc.text('Accepted By', 20, finalY + 40);
    }

    doc.save(`Estimate-${data.estimateNumber}.pdf`);
};

export const generateExpenseLogPDF = async (profile: UserProfile, job: Job, data: ExpenseLogData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    doc.text('EXPENSE RECEIPT', 105, 20, { align: 'center' });
    doc.text(`Item: ${data.item}`, 20, 40);
    doc.text(`Amount: $${data.amount}`, 20, 50);
    doc.text(`Vendor: ${data.vendor}`, 20, 60);
    doc.save('Expense.pdf');
};

export const generateNotePDF = async (profile: UserProfile, job: Job, data: NoteData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(data.title || 'Note', 20, 20);
    
    // Handle HTML content simply
    const div = document.createElement('div');
    div.innerHTML = data.content;
    const text = div.innerText || div.textContent || '';
    doc.setFontSize(12);
    doc.text(doc.splitTextToSize(text, 180), 20, 40);
    doc.save('Note.pdf');
};

export const generateReceiptPDF = async (profile: UserProfile, job: Job, data: ReceiptData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    doc.setFontSize(24);
    doc.text('PAYMENT RECEIPT', 105, 30, { align: 'center' });
    
    doc.rect(20, 50, 170, 80);
    doc.setFontSize(14);
    doc.text(`Date: ${data.date}`, 30, 70);
    doc.text(`Received From: ${data.from}`, 30, 85);
    doc.text(`Amount: $${data.amount.toFixed(2)}`, 30, 100);
    doc.text(`For: ${data.description}`, 30, 115);
    
    doc.save('Receipt.pdf');
};
