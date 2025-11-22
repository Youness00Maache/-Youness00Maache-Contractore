

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

// Common layout drawer for Modern/Classic switch
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
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.rect(10, 10, 190, 277);
        doc.rect(12, 12, 186, 273);

        yPos = 25; 
        if (data.logoUrl) {
            const imgData = await loadImage(data.logoUrl);
            if (imgData) {
                const logoW = 35;
                const logoH = logoW * (imgData.height / imgData.width);
                doc.addImage(imgData.data, imgData.format, 105 - (logoW/2), yPos, logoW, logoH);
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

// Common grid for Company/Client info
const drawContactGrid = (doc: any, data: any, profile: UserProfile, yPos: number, template: TemplateStyle) => {
    const labelFont = template.layoutType === 'modern' ? 'helvetica' : 'times';
    const bodyFont = template.layoutType === 'modern' ? 'helvetica' : 'times';
    const isModern = template.layoutType === 'modern';

    doc.setFontSize(10);
    doc.setFont(labelFont, 'bold');
    doc.setTextColor(0, 0, 0);
    
    // Headers
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
    const clientAddr = doc.splitTextToSize(data.clientAddress || '', 80);
    doc.text(clientAddr, 110, rightY + 5);

    const maxH = Math.max(
        leftY + 10 + (compAddr.length * 5),
        rightY + 5 + (clientAddr.length * 5)
    );
    return maxH + 10;
};


// --- Generators ---

export const generateInvoicePDF = async (profile: UserProfile, job: Job, invoice: InvoiceData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(invoice.themeColors?.primary || template.primaryColor) || [0, 0, 0];
    
    const yPos = await drawDocumentHeader(doc, invoice, profile, template, primaryRgb, 'INVOICE', 'Date', invoice.issueDate, 'Invoice #', invoice.invoiceNumber);
    const gridEnd = drawContactGrid(doc, invoice, profile, yPos, template);

    // Line Items Table
    const tableColumn = ["Description", "Quantity", "Rate", "Amount"];
    const tableRows = invoice.lineItems.map(item => [
        item.description,
        item.quantity,
        `$${Number(item.rate).toFixed(2)}`,
        `$${(item.quantity * item.rate).toFixed(2)}`
    ]);

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

    // Totals
    const subtotal = invoice.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
    const discount = invoice.discount || 0;
    const shipping = invoice.shipping || 0;
    const taxRate = invoice.taxRate || 0;
    const taxable = subtotal - discount;
    const tax = taxable * (taxRate / 100);
    const total = taxable + tax + shipping;

    doc.setFontSize(10);
    doc.setTextColor(0,0,0);
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
            doc.setDrawColor(0,0,0);
            doc.line(20, currentY + 20, 80, currentY + 20);
            doc.text('Authorized Signature', 20, currentY + 25);
        }
    }

    doc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
};

export const generateEstimatePDF = async (profile: UserProfile, job: Job, data: EstimateData, templateId: string) => {
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
        doc.setTextColor(0,0,0);
        doc.setFontSize(10);
        doc.setFont(template.font, 'bold');
        doc.text('Terms & Conditions', 20, currentY);
        doc.setFont(template.font, 'normal');
        doc.setFontSize(9);
        const terms = doc.splitTextToSize(data.terms, 170);
        doc.text(terms, 20, currentY + 5);
        currentY += (terms.length * 5) + 15;
    }

    if(data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
        doc.line(20, currentY + 15, 80, currentY + 15);
        doc.text('Accepted By (Client)', 20, currentY + 20);
    }

    doc.save(`Estimate-${data.estimateNumber}.pdf`);
};

export const generateMaterialLogPDF = async (profile: UserProfile, job: Job, data: MaterialLogData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'MATERIAL LOG', 'Date', data.date, 'Project', data.projectName);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    const rows = data.items.map(i => [i.name, i.supplier, i.quantity, `$${Number(i.unitCost).toFixed(2)}`, `$${(i.quantity * i.unitCost).toFixed(2)}`]);
    
    (doc as any).autoTable({
        startY: gridEnd + 10,
        head: [['Item Name', 'Supplier', 'Qty', 'Unit Cost', 'Total']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: primaryRgb },
    });
    
    // Total Cost
    const totalCost = data.items.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(12);
    doc.setFont(template.font, 'bold');
    doc.text(`Total Material Cost: $${totalCost.toFixed(2)}`, 190, finalY, { align: 'right' });

    if (data.signatureUrl) {
        const sigY = finalY + 20;
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, sigY, 40, 15);
        doc.line(20, sigY + 15, 80, sigY + 15);
        doc.setFontSize(10);
        doc.text('Signed', 20, sigY + 20);
    }

    doc.save('Materials.pdf');
};

export const generateExpenseLogPDF = async (profile: UserProfile, job: Job, data: ExpenseLogData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'EXPENSE LOG', 'Date', data.date, 'Category', data.category);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    // Expense Details Box
    let currentY = gridEnd + 20;
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(250, 250, 250);
    doc.rect(20, currentY, 170, 60, 'FD');
    
    doc.setFontSize(12);
    doc.setTextColor(0,0,0);
    doc.setFont(template.font, 'bold');
    doc.text('Expense Details', 25, currentY + 10);
    
    doc.setFontSize(10);
    doc.text('Item / Description:', 25, currentY + 25);
    doc.setFont(template.font, 'normal');
    doc.text(data.item, 70, currentY + 25);
    
    doc.setFont(template.font, 'bold');
    doc.text('Vendor / Store:', 25, currentY + 35);
    doc.setFont(template.font, 'normal');
    doc.text(data.vendor, 70, currentY + 35);
    
    doc.setFont(template.font, 'bold');
    doc.text('Amount Paid:', 25, currentY + 45);
    doc.setFontSize(14);
    doc.setTextColor(...primaryRgb);
    doc.text(`$${Number(data.amount).toFixed(2)}`, 70, currentY + 45);

    if (data.notes) {
        currentY += 70;
        doc.setFontSize(10);
        doc.setTextColor(0,0,0);
        doc.setFont(template.font, 'bold');
        doc.text('Notes:', 20, currentY);
        doc.setFont(template.font, 'normal');
        doc.text(data.notes, 20, currentY + 5, { maxWidth: 170 });
    }

    if (data.signatureUrl) {
        currentY += 40;
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
        doc.line(20, currentY + 15, 80, currentY + 15);
        doc.text('Approved By', 20, currentY + 20);
    }

    doc.save('Expense.pdf');
};

export const generateReceiptPDF = async (profile: UserProfile, job: Job, data: ReceiptData, templateId: string) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'RECEIPT', 'Date', data.date, 'Receipt #', data.receiptNumber);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    // Receipt Box
    const boxY = gridEnd + 15;
    doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setLineWidth(1);
    doc.rect(20, boxY, 170, 80);
    
    doc.setFontSize(14);
    doc.setTextColor(0,0,0);
    doc.text(`Amount Received: $${Number(data.amount).toFixed(2)}`, 105, boxY + 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Payment Method: ${data.paymentMethod}`, 105, boxY + 35, { align: 'center' });
    doc.text(`For: ${data.description}`, 105, boxY + 50, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setTextColor(100,100,100);
    doc.text('Thank you for your payment!', 105, boxY + 70, { align: 'center' });

    if (data.signatureUrl) {
        const sigY = boxY + 90;
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, sigY, 40, 15);
        doc.setDrawColor(0,0,0);
        doc.setLineWidth(0.1);
        doc.line(20, sigY + 15, 80, sigY + 15);
        doc.setFontSize(10);
        doc.setTextColor(0,0,0);
        doc.text('Received By', 20, sigY + 20);
    }
    
    doc.save(`Receipt-${data.receiptNumber}.pdf`);
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
        doc.setFillColor(255, 255, 255); // Ensure white bg for box 1
        doc.rect(20, 100, 80, 25, 'F');
        doc.rect(20, 100, 80, 25); // Border
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
    // Slightly taller header
    doc.rect(0, 0, 210, 45, 'F');
    
    // Title (Left Side)
    doc.setTextColor(255, 255, 255);
    doc.setFont(template.headerFont, 'bold');
    doc.setFontSize(24);
    safeText(doc, 'WORK ORDER', 20, 15);
    
    // WO Number (Below Title)
    doc.setFontSize(12);
    doc.setFont(template.font, 'normal');
    safeText(doc, `#${wo.workOrderNumber || ''}`, 20, 22);
    
    // Status (Below Number - Left Aligned)
    doc.setFont(template.font, 'bold');
    safeText(doc, (wo.status || 'Scheduled').toUpperCase(), 20, 29);

    // Logo (Right Aligned - No White Box)
    if (wo.logoUrl) {
        const imgData = await loadImage(wo.logoUrl);
        if (imgData) {
            // Calculate dimensions to fit nicely
            const logoW = 30;
            const logoH = logoW * (imgData.height / imgData.width);
            // Draw directly without rect background
            doc.addImage(imgData.data, imgData.format, 170, 7.5, logoW, logoH);
        }
    }

    let yPos = 55;

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
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];
    
    // Distinct Modern Layout logic
    const isModern = template.layoutType === 'modern';
    let yPos = 0;

    // --- Header ---
    if (isModern) {
        doc.setFillColor(...primaryRgb);
        doc.rect(0, 0, 210, 40, 'F');
        
        // Logo (Modern - White/Transparent friendly on colored bg)
        if (data.logoUrl) {
            const imgData = await loadImage(data.logoUrl);
            if (imgData) {
                const logoW = 25;
                const logoH = logoW * (imgData.height / imgData.width);
                doc.addImage(imgData.data, imgData.format, 20, 8, logoW, logoH);
            }
        }

        // Title
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        doc.text('TIME SHEET', 190, 25, { align: 'right' });
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        safeText(doc, data.date, 190, 32, { align: 'right' });
        
        // Initialize grid start for Modern
        yPos = 60;

    } else {
        // --- Classic Layout Header (Double Border + Centered) ---
        
        // Add Double Border for classic look
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.rect(10, 10, 190, 277); // Outer
        doc.rect(12, 12, 186, 273); // Inner

        // Dynamic header height calculation
        yPos = 25; 
        if (data.logoUrl) {
            const imgData = await loadImage(data.logoUrl);
            if (imgData) {
                const logoW = 35;
                const logoH = logoW * (imgData.height / imgData.width);
                doc.addImage(imgData.data, imgData.format, 105 - (logoW/2), yPos, logoW, logoH);
                yPos += logoH + 5;
            }
        }
        
        doc.setTextColor(0, 0, 0);
        doc.setFont('times', 'bold'); // Enforce Serif for classic
        doc.setFontSize(26);
        doc.text('TIME SHEET', 105, yPos + 10, { align: 'center' });
        doc.setFontSize(12);
        doc.setFont('times', 'normal');
        doc.setTextColor(80, 80, 80);
        // Position date strictly below title
        safeText(doc, `Date: ${data.date}`, 105, yPos + 18, { align: 'center' });
        
        // Move grid start position down to avoid overlap
        yPos += 35; 
    }

    // --- Info Grid (Dynamic Height Calculation to Avoid Overlap) ---
    const labelFont = isModern ? 'helvetica' : 'times';
    const labelStyle = 'bold';
    const bodyFont = isModern ? 'helvetica' : 'times';
    
    doc.setFontSize(10);
    
    // Left Column: Employer
    doc.setFont(labelFont, labelStyle);
    doc.text('EMPLOYER / COMPANY', 20, yPos);
    doc.setFont(bodyFont, 'normal');
    doc.setTextColor(0, 0, 0); // Enforce Black
    
    // Store initial Y for column alignment
    const startGridY = yPos;
    let leftY = startGridY + 6;
    
    safeText(doc, data.companyName || profile.companyName, 20, leftY);
    
    // Handle multi-line address for company
    const companyAddr = data.companyAddress || profile.address || '';
    const companyAddrLines = doc.splitTextToSize(companyAddr, 80);
    doc.text(companyAddrLines, 20, leftY + 5);
    
    // Calculate height of address block to position Worker Name correctly
    const companyBlockHeight = Math.max(15, companyAddrLines.length * 5 + 10);
    let workerY = startGridY + companyBlockHeight;
    
    doc.setFont(labelFont, labelStyle);
    doc.text('WORKER NAME', 20, workerY);
    doc.setFont(bodyFont, 'normal');
    doc.setTextColor(0, 0, 0);
    safeText(doc, data.workerName, 20, workerY + 6);

    // Right Column: Client (Top aligned with Employer)
    const rightColX = 110;
    let rightColY = startGridY;
    
    doc.setFont(labelFont, labelStyle);
    doc.text('CLIENT / JOB SITE', rightColX, rightColY);
    doc.setFont(bodyFont, 'normal');
    doc.setTextColor(0, 0, 0);
    
    rightColY += 6;
    safeText(doc, data.clientName || job.clientName, rightColX, rightColY);
    
    // Handle multi-line address for client
    const clientAddr = data.clientAddress || job.clientAddress || '';
    const clientAddrLines = doc.splitTextToSize(clientAddr, 80);
    doc.text(clientAddrLines, rightColX, rightColY + 5);

    // Determine where table should start (below lowest element)
    const clientBlockHeight = rightColY + 5 + (clientAddrLines.length * 5);
    const workerBlockHeight = workerY + 15;
    yPos = Math.max(clientBlockHeight, workerBlockHeight) + 15;

    // --- Hours Table (Using autoTable with explicit borders) ---
    const tableBody = [
        ['Regular Hours', String(data.hoursWorked || 0)],
        ['Overtime Hours', String(data.overtimeHours || 0)],
        [{ content: 'Total Hours', styles: { fontStyle: 'bold' } }, { content: String((data.hoursWorked || 0) + (data.overtimeHours || 0)), styles: { fontStyle: 'bold' } }]
    ];

    (doc as any).autoTable({
        startY: yPos,
        head: [['TYPE', 'HOURS']],
        body: tableBody,
        theme: 'grid', // FORCE GRID for solid borders
        styles: { 
            font: template.font,
            fontSize: 10,
            cellPadding: 5,
            textColor: [0, 0, 0], // Black text
            lineColor: [0, 0, 0], // Black borders
            lineWidth: 0.1, // Visible width
        },
        headStyles: {
            fillColor: isModern ? primaryRgb : [230, 230, 230],
            textColor: isModern ? [255, 255, 255] : [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 40, halign: 'right' }
        },
        margin: { left: 20, right: 20 },
        tableLineColor: [0, 0, 0], // Backup global setting
        tableLineWidth: 0.1,
    });

    // Get Y position after table
    let finalY = (doc as any).lastAutoTable.finalY + 15;

    // --- Notes (Dynamic Height & Page Break Safety) ---
    if (data.notes) {
        const notesLines = doc.splitTextToSize(data.notes, 160);
        const lineHeight = 5; // mm
        const textHeight = notesLines.length * lineHeight;
        const boxHeight = Math.max(30, textHeight + 15); // Minimum 30mm
        
        // Check if notes will fit on current page (taking 40mm signature area into account)
        if (finalY + boxHeight > 240) {
            doc.addPage();
            // If classic, redraw border
            if (!isModern) {
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.5);
                doc.rect(10, 10, 190, 277);
                doc.rect(12, 12, 186, 273);
            }
            finalY = 40; // Reset yPos for new page
        }

        doc.setFillColor(250, 250, 250);
        doc.rect(20, finalY, 170, boxHeight, 'F');
        
        doc.setTextColor(0, 0, 0);
        doc.setFont(labelFont, 'bold');
        doc.text('NOTES', 25, finalY + 8);
        
        doc.setFont(bodyFont, 'normal');
        doc.setFontSize(9);
        doc.text(notesLines, 25, finalY + 15);
        
        finalY += boxHeight + 15; 
    } else {
        finalY += 10;
    }

    // --- Signature (Page Break Check) ---
    // 297mm page height. Footer needs ~40mm. Safe zone limit ~250mm.
    if (finalY > 240) {
        doc.addPage();
        // Classic border
        if (!isModern) {
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.5);
            doc.rect(10, 10, 190, 277);
            doc.rect(12, 12, 186, 273);
        }
        finalY = 40;
    } else {
        // Push signature to bottom if there's space, but not too far
        // Only push to bottom if layout is classic certificate style
        if (!isModern) finalY = Math.max(finalY, 230); 
    }

    if (data.signatureUrl) {
        const sigData = await loadImage(data.signatureUrl);
        if (sigData) {
            doc.addImage(sigData.data, sigData.format, 20, finalY - 15, 40, 15);
        }
    }
    
    doc.setDrawColor(0, 0, 0);
    doc.line(20, finalY, 80, finalY);
    doc.setFontSize(9);
    doc.setFont(bodyFont, 'normal');
    doc.text('Worker Signature', 20, finalY + 5);
    
    // Fix: Move Date value ABOVE the line so it doesn't overlap with "Date" label
    const dateValue = data.date || new Date().toLocaleDateString();
    doc.text(dateValue, 150, finalY - 3); 
    doc.line(150, finalY, 190, finalY);
    doc.text('Date', 150, finalY + 5);

    doc.save(`TimeSheet-${data.date}.pdf`);
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
