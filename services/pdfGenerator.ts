
// ... (Keep existing imports) ...
import { InvoiceData, Job, UserProfile, EstimateData, WorkOrderData, DailyJobReportData, TimeSheetData, MaterialLogData, ExpenseLogData, WarrantyData, NoteData, ReceiptData, ChangeOrderData, PurchaseOrderData } from '../types.ts';

declare const jspdf: any;
declare const html2canvas: any;

// ... (Keep existing helpers: loadImage, safeText, Template interfaces, drawDocumentHeader, drawContactGrid) ...
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
    
    const yPos = await drawDocumentHeader(doc, invoice, profile, template, primaryRgb, 'INVOICE', 'Date', invoice.issueDate, 'Invoice #', invoice.invoiceNumber);
    const gridEnd = drawContactGrid(doc, invoice, profile, yPos, template);

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
            doc.setDrawColor(0,0,0);
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
        styles: { 
            font: template.font, 
            fontSize: 10, 
            lineColor: [0, 0, 0], 
            lineWidth: 0.1,
            textColor: [0, 0, 0]
        },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const total = data.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);

    doc.setFontSize(12);
    doc.setFont(template.font, 'bold');
    doc.text(`Total: $${total.toFixed(2)}`, 190, finalY, { align: 'right' });

    if (data.notes) {
        doc.setFontSize(9);
        doc.setFont(template.font, 'normal');
        doc.text(`Notes: ${data.notes}`, 20, finalY + 10);
    }

    const sigY = finalY + 30;
    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, sigY - 15, 40, 15);
    }
    doc.setDrawColor(0, 0, 0);
    doc.line(20, sigY, 80, sigY);
    doc.setFontSize(9);
    doc.text('Authorized Signature', 20, sigY + 5);

    if (getBlob) return doc.output('datauristring');
    doc.save(`PO-${data.poNumber}.pdf`);
};

export const generateChangeOrderPDF = async (profile: UserProfile, job: Job, data: ChangeOrderData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'CHANGE ORDER', 'Date', data.date, 'Order #', data.changeOrderNumber);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    let currentY = gridEnd + 10;
    doc.setFontSize(10);
    doc.setFont(template.font, 'bold');
    doc.text(`Reason: ${data.reason}`, 20, currentY);
    currentY += 6;
    doc.setFont(template.font, 'normal');
    if (data.description) {
        const desc = doc.splitTextToSize(data.description, 170);
        doc.text(desc, 20, currentY);
        currentY += (desc.length * 5) + 10;
    } else {
        currentY += 10;
    }

    const tableColumn = ["Description", "Qty", "Rate", "Amount"];
    const tableRows = data.lineItems.map(i => [i.description, i.quantity, `$${Number(i.rate).toFixed(2)}`, `$${(i.quantity * i.rate).toFixed(2)}`]);
    
    (doc as any).autoTable({
        startY: currentY,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        styles: { font: template.font, fontSize: 10, lineColor: [0,0,0], lineWidth: 0.1, textColor: [0,0,0] },
    });
    
    const tableEnd = (doc as any).lastAutoTable.finalY + 10;
    const changeTotal = data.lineItems.reduce((a, b) => a + (b.quantity * b.rate), 0);
    const currentSum = Number(data.currentContractSum) || 0;
    const newSum = currentSum + changeTotal;

    // Summary Box
    doc.setDrawColor(0,0,0);
    doc.rect(120, tableEnd, 70, 25);
    doc.setFontSize(10);
    doc.text('Original Contract Sum:', 122, tableEnd + 6);
    doc.text(`$${currentSum.toFixed(2)}`, 188, tableEnd + 6, { align: 'right' });
    doc.text('Net Change:', 122, tableEnd + 12);
    doc.text(`$${changeTotal.toFixed(2)}`, 188, tableEnd + 12, { align: 'right' });
    doc.setFont(template.font, 'bold');
    doc.text('New Contract Sum:', 122, tableEnd + 20);
    doc.text(`$${newSum.toFixed(2)}`, 188, tableEnd + 20, { align: 'right' });

    let termY = tableEnd + 35;
    if (data.terms) {
        doc.setFont(template.font, 'normal');
        doc.setFontSize(8);
        const terms = doc.splitTextToSize(data.terms, 170);
        doc.text(terms, 20, termY);
        termY += (terms.length * 4) + 10;
    }

    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, termY, 40, 15);
        doc.line(20, termY + 15, 80, termY + 15);
        doc.text('Authorized Signature', 20, termY + 20);
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`ChangeOrder-${data.changeOrderNumber}.pdf`);
};

export const generateReceiptPDF = async (profile: UserProfile, job: Job, data: ReceiptData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'RECEIPT', 'Date', data.date, 'Receipt #', data.receiptNumber);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    let currentY = gridEnd + 20;
    
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(20, currentY, 170, 30, 2, 2, 'F');
    doc.setFontSize(16);
    doc.setFont(template.font, 'bold');
    doc.setTextColor(...primaryRgb);
    doc.text(`Amount Received: $${Number(data.amount).toFixed(2)}`, 105, currentY + 18, { align: 'center' });

    currentY += 40;
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`Payment Method: ${data.paymentMethod}`, 20, currentY);
    currentY += 8;
    doc.text(`Description: ${data.description}`, 20, currentY);

    currentY += 30;
    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
        doc.line(20, currentY + 15, 80, currentY + 15);
        doc.text('Received By', 20, currentY + 20);
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`Receipt-${data.receiptNumber}.pdf`);
};

export const generateWorkOrderPDF = async (profile: UserProfile, job: Job, data: WorkOrderData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'WORK ORDER', 'Date', data.date, 'WO #', data.workOrderNumber);
    const gridEnd = drawContactGrid(doc, data, profile, yPos, template);

    let currentY = gridEnd + 15;
    
    doc.setFontSize(11);
    doc.setFont(template.font, 'bold');
    doc.text(`Status: ${data.status}`, 20, currentY);
    
    currentY += 10;
    doc.setFillColor(...primaryRgb);
    doc.setTextColor(255, 255, 255);
    doc.rect(20, currentY, 170, 8, 'F');
    doc.text('DESCRIPTION OF WORK', 25, currentY + 5.5);
    currentY += 10;
    
    doc.setTextColor(0, 0, 0);
    doc.setFont(template.font, 'normal');
    const desc = doc.splitTextToSize(data.description || 'No description', 165);
    doc.text(desc, 25, currentY);
    currentY += (desc.length * 5) + 10;

    doc.setFillColor(...primaryRgb);
    doc.setTextColor(255, 255, 255);
    doc.rect(20, currentY, 170, 8, 'F');
    doc.setFont(template.font, 'bold');
    doc.text('MATERIALS & COSTS', 25, currentY + 5.5);
    currentY += 10;

    doc.setTextColor(0, 0, 0);
    doc.setFont(template.font, 'normal');
    doc.text(`Materials Used: ${data.materialsUsed || 'None'}`, 25, currentY);
    currentY += 10;
    doc.text(`Labor Hours: ${data.hours}`, 25, currentY);
    currentY += 6;
    doc.setFont(template.font, 'bold');
    doc.text(`Total Cost: $${Number(data.cost).toFixed(2)}`, 25, currentY);
    
    currentY += 20;
    if(data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
        doc.line(20, currentY+15, 80, currentY+15);
        doc.text('Authorized Signature', 20, currentY+20);
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`WorkOrder-${data.workOrderNumber}.pdf`);
};

export const generateWarrantyPDF = async (profile: UserProfile, job: Job, data: WarrantyData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    // Fancy Border
    doc.setDrawColor(...primaryRgb);
    doc.setLineWidth(1);
    doc.rect(10, 10, 190, 277);
    doc.setLineWidth(0.5);
    doc.rect(13, 13, 184, 271);

    // Header
    if (data.logoUrl) {
        const imgData = await loadImage(data.logoUrl);
        if (imgData) {
            const logoW = 30;
            const logoH = logoW * (imgData.height / imgData.width);
            doc.addImage(imgData.data, imgData.format, 105 - (logoW/2), 25, logoW, logoH);
        }
    }
    
    doc.setFont('times', 'bold');
    doc.setFontSize(30);
    doc.text('CERTIFICATE OF WARRANTY', 105, 65, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Warranty ID: ${data.warrantyNumber}`, 105, 75, { align: 'center' });

    doc.text('This warranty is presented to:', 105, 90, { align: 'center' });
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(data.clientName, 105, 100, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('For the project located at:', 105, 115, { align: 'center' });
    doc.setFontSize(14);
    doc.text(data.projectAddress, 105, 125, { align: 'center' });

    // Details Box
    doc.setFillColor(245, 245, 245);
    doc.rect(30, 140, 150, 25, 'F');
    doc.setFontSize(11);
    doc.text('WARRANTY DURATION', 40, 148);
    doc.text('COMPLETION DATE', 110, 148);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(data.duration, 40, 158);
    doc.text(data.completedDate, 110, 158);

    let y = 180;
    doc.setFontSize(11);
    doc.text('SCOPE OF COVERAGE', 30, y);
    doc.setFont('helvetica', 'normal');
    const coverage = doc.splitTextToSize(data.coverage, 150);
    doc.text(coverage, 30, y + 6);
    y += (coverage.length * 5) + 15;

    doc.setFont('helvetica', 'bold');
    doc.text('TERMS, CONDITIONS & EXCLUSIONS', 30, y);
    doc.setFont('helvetica', 'normal');
    const conditions = doc.splitTextToSize(data.conditions, 150);
    doc.text(conditions, 30, y + 6);
    
    const sigY = 250;
    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 30, sigY - 15, 40, 15);
    }
    doc.line(30, sigY, 90, sigY);
    doc.text('Authorized Signature', 30, sigY + 5);
    
    doc.text(data.completedDate, 130, sigY - 2);
    doc.line(130, sigY, 180, sigY);
    doc.text('Date Issued', 130, sigY + 5);

    if (getBlob) return doc.output('datauristring');
    doc.save(`Warranty-${data.warrantyNumber}.pdf`);
};

export const generateTimeSheetPDF = async (profile: UserProfile, job: Job, data: TimeSheetData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    // Simple Header
    doc.setFontSize(22);
    doc.setTextColor(...primaryRgb);
    doc.text('TIME SHEET', 20, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(0,0,0);
    doc.text(`Date: ${data.date}`, 20, 30);
    doc.text(`Worker: ${data.workerName}`, 20, 35);
    doc.text(`Job: ${job.name}`, 20, 40);

    const tableColumn = ["Type", "Hours"];
    const tableRows = [
        ["Regular Hours", data.hoursWorked],
        ["Overtime Hours", data.overtimeHours],
        ["Total Hours", Number(data.hoursWorked) + Number(data.overtimeHours)]
    ];

    (doc as any).autoTable({
        startY: 50,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: primaryRgb },
        styles: { fontSize: 12 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    if (data.notes) {
        doc.text('Notes:', 20, finalY);
        doc.text(data.notes, 20, finalY + 6);
    }

    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, finalY + 30, 40, 15);
        doc.text('Worker Signature', 20, finalY + 50);
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`TimeSheet-${data.date}.pdf`);
};

export const generateMaterialLogPDF = async (profile: UserProfile, job: Job, data: MaterialLogData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    doc.setFontSize(20);
    doc.setTextColor(...primaryRgb);
    doc.text('MATERIAL LOG', 20, 20);
    doc.setFontSize(10);
    doc.setTextColor(0,0,0);
    doc.text(`Project: ${data.projectName}`, 20, 30);
    doc.text(`Date: ${data.date}`, 20, 35);

    const tableColumn = ["Item", "Supplier", "Qty", "Cost"];
    const tableRows = data.items.map(i => [i.name, i.supplier, i.quantity, `$${i.unitCost}`]);

    (doc as any).autoTable({
        startY: 45,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: primaryRgb },
    });

    if (getBlob) return doc.output('datauristring');
    doc.save('Materials.pdf');
};

export const generateExpenseLogPDF = async (profile: UserProfile, job: Job, data: ExpenseLogData, templateId: string, getBlob: boolean = false) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('EXPENSE LOG', 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Item: ${data.item}`, 20, 40);
    doc.text(`Vendor: ${data.vendor}`, 20, 50);
    doc.text(`Category: ${data.category}`, 20, 60);
    doc.text(`Amount: $${data.amount.toFixed(2)}`, 20, 70);
    doc.text(`Date: ${data.date}`, 20, 80);
    
    if (data.notes) doc.text(`Notes: ${data.notes}`, 20, 100);

    if (getBlob) return doc.output('datauristring');
    doc.save('Expense.pdf');
};

export const generateDailyJobReportPDF = async (profile: UserProfile, data: DailyJobReportData, templateId: string, getBlob: boolean = false) => { 
    const { jsPDF } = jspdf; 
    const doc = new jsPDF(); 
    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    doc.setFontSize(22);
    doc.setTextColor(...primaryRgb);
    doc.text("Daily Job Report", 20, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(0,0,0);
    doc.text(`Report #: ${data.reportNumber}`, 20, 30);
    doc.text(`Date: ${data.date}`, 20, 35);
    doc.text(`Project: ${data.projectName}`, 120, 30);
    doc.text(`Weather: ${data.weather} / ${data.temperature}`, 120, 35);

    // Strip HTML for simple PDF text
    const plainText = data.content.replace(/<[^>]+>/g, '\n');
    const splitText = doc.splitTextToSize(plainText, 170);
    
    doc.text(splitText, 20, 50);

    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if(sig) doc.addImage(sig.data, sig.format, 20, 250, 40, 15);
        doc.text("Signed", 20, 270);
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`Report-${data.date}.pdf`); 
};

export const generateNotePDF = async (profile: UserProfile, job: Job, data: NoteData, templateId: string, getBlob: boolean = false) => { 
    const { jsPDF } = jspdf; 
    const doc = new jsPDF(); 
    
    doc.setFontSize(18);
    doc.text(data.title, 20, 20);
    
    const plainText = data.content.replace(/<[^>]+>/g, '\n');
    const splitText = doc.splitTextToSize(plainText, 170);
    doc.setFontSize(12);
    doc.text(splitText, 20, 40);

    if (getBlob) return doc.output('datauristring');
    doc.save('Note.pdf'); 
};

// Dispatcher function to get PDF Blob without saving
export const generateDocumentBase64 = async (docType: string, data: any, profile: UserProfile, job: Job): Promise<string | null> => {
    const templateId = data.templateId || 'standard';
    try {
        switch (docType) {
            case 'Invoice': return await generateInvoicePDF(profile, job, data, templateId, true) || null;
            case 'Estimate': return await generateEstimatePDF(profile, job, data, templateId, true) || null;
            case 'Purchase Order': return await generatePurchaseOrderPDF(profile, job, data, templateId, true) || null;
            case 'Change Order': return await generateChangeOrderPDF(profile, job, data, templateId, true) || null;
            case 'Receipt': return await generateReceiptPDF(profile, job, data, templateId, true) || null;
            case 'Work Order': return await generateWorkOrderPDF(profile, job, data, templateId, true) || null;
            case 'Time Sheet': return await generateTimeSheetPDF(profile, job, data, templateId, true) || null;
            case 'Material Log': return await generateMaterialLogPDF(profile, job, data, templateId, true) || null;
            case 'Expense Log': return await generateExpenseLogPDF(profile, job, data, templateId, true) || null;
            case 'Warranty': return await generateWarrantyPDF(profile, job, data, templateId, true) || null;
            case 'Daily Job Report': return await generateDailyJobReportPDF(profile, data, templateId, true) || null; 
            case 'Note': return await generateNotePDF(profile, job, data, templateId, true) || null;
            default: return null;
        }
    } catch (e) {
        console.error("Failed to generate PDF base64", e);
        return null;
    }
};
