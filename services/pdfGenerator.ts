
import { InvoiceData, Job, UserProfile, EstimateData, WorkOrderData, DailyJobReportData, TimeSheetData, MaterialLogData, ExpenseLogData, WarrantyData, NoteData, ReceiptData } from '../types.ts';

declare const jspdf: any;
declare const html2canvas: any;

const PAYPAL_LOGO_BASE64 = 'data:image/png;base64,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';

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
}

const templates: Record<string, TemplateStyle> = {
    standard: {
        id: 'standard',
        primaryColor: '#000000',
        secondaryColor: '#666666',
        textColor: '#222222',
        headerColor: '#ffffff',
        headerTextColor: '#000000',
        font: 'helvetica',
        headerFont: 'helvetica',
        alternateRowColor: '#f2f2f2',
        borderColor: '#cccccc',
        borderRadius: 0,
        showFooterLine: true
    },
    modern_blue: {
        id: 'modern_blue',
        primaryColor: '#3498db',
        secondaryColor: '#2980b9',
        textColor: '#2c3e50',
        headerColor: '#3498db',
        headerTextColor: '#ffffff',
        font: 'helvetica',
        headerFont: 'helvetica',
        alternateRowColor: '#ebf5fb',
        borderColor: '#aed6f1',
        borderRadius: 4,
        showFooterLine: false
    },
    professional: {
        id: 'professional',
        primaryColor: '#2c3e50',
        secondaryColor: '#34495e',
        textColor: '#2c3e50',
        headerColor: '#2c3e50',
        headerTextColor: '#ecf0f1',
        font: 'times',
        headerFont: 'helvetica',
        alternateRowColor: '#eaeded',
        borderColor: '#bdc3c7',
        borderRadius: 0,
        showFooterLine: true
    },
    warm: {
        id: 'warm',
        primaryColor: '#d35400',
        secondaryColor: '#e67e22',
        textColor: '#5d4037',
        headerColor: '#fdebd0',
        headerTextColor: '#d35400',
        font: 'helvetica',
        headerFont: 'helvetica',
        alternateRowColor: '#fef5e7',
        borderColor: '#f5cba7',
        borderRadius: 2,
        showFooterLine: true
    },
    elegant: {
        id: 'elegant',
        primaryColor: '#8e44ad',
        secondaryColor: '#9b59b6',
        textColor: '#4a235a',
        headerColor: '#ffffff',
        headerTextColor: '#8e44ad',
        font: 'times',
        headerFont: 'times',
        alternateRowColor: '#f5eef8',
        borderColor: '#d7bde2',
        borderRadius: 0,
        showFooterLine: false
    },
    tech: {
        id: 'tech',
        primaryColor: '#16a085',
        secondaryColor: '#1abc9c',
        textColor: '#000000',
        headerColor: '#e8f8f5',
        headerTextColor: '#16a085',
        font: 'courier',
        headerFont: 'courier',
        alternateRowColor: '#e8f6f3',
        borderColor: '#48c9b0',
        borderRadius: 0,
        showFooterLine: true
    },
    industrial: {
        id: 'industrial',
        primaryColor: '#f39c12',
        secondaryColor: '#d35400',
        textColor: '#000000',
        headerColor: '#333333',
        headerTextColor: '#f39c12',
        font: 'helvetica',
        headerFont: 'helvetica',
        alternateRowColor: '#fcf3cf',
        borderColor: '#000000',
        borderRadius: 0,
        showFooterLine: true
    },
    minimal: {
        id: 'minimal',
        primaryColor: '#95a5a6',
        secondaryColor: '#7f8c8d',
        textColor: '#7f8c8d',
        headerColor: '#ffffff',
        headerTextColor: '#333333',
        font: 'helvetica',
        headerFont: 'helvetica',
        alternateRowColor: '#ffffff',
        borderColor: '#ecf0f1',
        borderRadius: 0,
        showFooterLine: false
    },
    bold: {
        id: 'bold',
        primaryColor: '#000000',
        secondaryColor: '#000000',
        textColor: '#000000',
        headerColor: '#000000',
        headerTextColor: '#ffffff',
        font: 'helvetica',
        headerFont: 'helvetica',
        alternateRowColor: '#e5e5e5',
        borderColor: '#000000',
        borderRadius: 6,
        showFooterLine: false
    },
    retro: {
        id: 'retro',
        primaryColor: '#c0392b',
        secondaryColor: '#e74c3c',
        textColor: '#5a4d41',
        headerColor: '#f9e79f',
        headerTextColor: '#c0392b',
        font: 'courier',
        headerFont: 'courier',
        alternateRowColor: '#fcf3cf',
        borderColor: '#d35400',
        borderRadius: 1,
        showFooterLine: true
    }
};

// Helper to get style and override with custom colors
const getTemplate = (id: string | undefined, customColors?: { primary: string, secondary: string }): TemplateStyle => {
    const baseTemplate = templates[id || 'standard'] || templates.standard;
    if (customColors) {
        // Shallow copy to avoid mutating original template definition
        return {
            ...baseTemplate,
            primaryColor: customColors.primary,
            secondaryColor: customColors.secondary,
            // Adjust derived colors if needed, for now basic override
            headerColor: baseTemplate.headerColor === '#ffffff' ? '#ffffff' : customColors.primary,
            headerTextColor: baseTemplate.headerColor === '#ffffff' ? customColors.primary : '#ffffff',
            borderColor: customColors.secondary
        };
    }
    return baseTemplate;
};

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
};

// Helper function to robustly load images and detect format
const loadImage = async (url: string): Promise<{ data: string; format: string; width: number; height: number } | null> => {
    try {
        let dataUrl = url;
        // Fetch if it's not a data URL
        if (!url.startsWith('data:image/')) {
            const response = await fetch(url);
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
                // Simple format detection
                let format = 'PNG'; // Default
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
                console.error('Failed to load image:', url);
                resolve(null);
            };
            // Important: Handle CORS if not data URL
            if (!dataUrl.startsWith('data:')) {
                img.crossOrigin = 'Anonymous';
            }
            img.src = dataUrl;
        });
    } catch (e) {
        console.error("Error processing image:", e);
        return null;
    }
};


const addHeader = async (doc: any, profile: UserProfile, title: string, dateLabel: string, dateValue: string, style: TemplateStyle) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let yPos = margin;
    
    // Header Background
    if (style.headerColor !== '#ffffff') {
        doc.setFillColor(...hexToRgb(style.headerColor));
        doc.rect(0, 0, pageWidth, 120, 'F');
    }

    // Logo
    if (profile.logoUrl) {
        const imgData = await loadImage(profile.logoUrl);
        if (imgData) {
            const aspectRatio = imgData.width / imgData.height;
            const imgWidth = 60;
            const imgHeight = imgWidth / aspectRatio;
            // Use detected format
            doc.addImage(imgData.data, imgData.format, margin, yPos, imgWidth, imgHeight);
        }
    }

    doc.setFontSize(24);
    doc.setFont(style.headerFont, 'bold');
    doc.setTextColor(...hexToRgb(style.headerTextColor));
    doc.text(title, pageWidth - margin, yPos + 30, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont(style.font, 'normal');
    doc.setTextColor(...hexToRgb(style.headerTextColor));
    doc.text(dateLabel + ": " + dateValue, pageWidth - margin, yPos + 45, { align: 'right' });

    yPos += 70;
    
    // Reset text color for body
    doc.setTextColor(...hexToRgb(style.textColor));

    // Company Info
    doc.setFontSize(10);
    doc.setFont(style.font, 'bold');
    doc.text(profile.companyName, margin, yPos);
    doc.setFont(style.font, 'normal');
    yPos += 15;
    if(profile.address) { doc.text(profile.address, margin, yPos); yPos += 15; }
    if(profile.phone) { doc.text(profile.phone, margin, yPos); yPos += 15; }
    if(profile.website) { doc.text(profile.website, margin, yPos); }

    return yPos + 20;
};

export const generateInvoicePDF = async (profile: UserProfile, job: Job, invoiceData: InvoiceData, templateId: string) => {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const { jsPDF } = jspdf;
      const doc = new jsPDF('p', 'pt', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      let yPos = margin;

      const style = getTemplate(templateId, invoiceData.themeColors);

      if (style.headerColor !== '#ffffff') {
        doc.setFillColor(...hexToRgb(style.headerColor));
        doc.rect(0, 0, pageWidth, 130, 'F');
      }

      const logoSource = invoiceData.logoUrl || profile.logoUrl;
      if (logoSource) {
          const imgData = await loadImage(logoSource);
          if (imgData) {
              const aspectRatio = imgData.width / imgData.height;
              const imgWidth = 80;
              const imgHeight = imgWidth / aspectRatio;
              doc.addImage(imgData.data, imgData.format, margin, yPos, imgWidth, imgHeight);
          }
      }

      yPos = margin; 

      doc.setFontSize(24);
      doc.setFont(style.headerFont, 'bold');
      doc.setTextColor(...hexToRgb(style.headerTextColor));
      doc.text('INVOICE', pageWidth - margin, yPos + 20, { align: 'right' });
      
      yPos += 80;

      const companyName = invoiceData.companyName || profile.companyName;
      const companyAddress = invoiceData.companyAddress || profile.address;
      const companyPhone = invoiceData.companyPhone || profile.phone;
      const companyWebsite = invoiceData.companyWebsite || profile.website;
      const clientName = invoiceData.clientName || job.clientName;
      const clientAddress = invoiceData.clientAddress || job.clientAddress;

      doc.setFontSize(10);
      // Check if we are still in header bg area for text color
      if(style.headerColor !== '#ffffff') doc.setTextColor(...hexToRgb(style.headerTextColor));
      else doc.setTextColor(...hexToRgb(style.textColor));
      
      doc.setFont(style.font, 'bold');
      doc.text(companyName, margin, yPos);
      doc.setFont(style.font, 'normal');
      yPos += 15;
      if(companyAddress) { doc.text(companyAddress, margin, yPos, { maxWidth: pageWidth / 2.5 }); yPos += 15 * (doc.getTextDimensions(companyAddress, { maxWidth: pageWidth / 2.5 }).h / 10); }
      if(companyPhone) { doc.text(companyPhone, margin, yPos); yPos += 15; }
      if(companyWebsite) { doc.text(companyWebsite, margin, yPos); }

      let rightColY = margin + 80; 
      const rightColX = pageWidth / 2;
      
      doc.setTextColor(...hexToRgb(style.headerTextColor)); 
      if(style.headerColor === '#ffffff') doc.setTextColor(...hexToRgb(style.textColor));

      doc.setFont(style.font, 'bold');
      doc.text('BILL TO', rightColX, rightColY);
      doc.setFont(style.font, 'normal');
      rightColY += 15;
      doc.text(clientName, rightColX, rightColY);
      rightColY += 15;
      doc.text(clientAddress, rightColX, rightColY, { maxWidth: pageWidth / 2 - margin });
      
      rightColY = margin + 80;
      const labelX = pageWidth - margin - 100;
      const valueX = pageWidth - margin;

      doc.setFont(style.font, 'bold'); doc.text('Invoice #:', labelX, rightColY);
      doc.setFont(style.font, 'normal'); doc.text(invoiceData.invoiceNumber.toString(), valueX, rightColY, { align: 'right' });
      rightColY += 15;
      doc.setFont(style.font, 'bold'); doc.text('Issue Date:', labelX, rightColY);
      doc.setFont(style.font, 'normal'); doc.text(invoiceData.issueDate, valueX, rightColY, { align: 'right' });
      rightColY += 15;
      doc.setFont(style.font, 'bold'); doc.text('Due Date:', labelX, rightColY);
      doc.setFont(style.font, 'normal'); doc.text(invoiceData.dueDate, valueX, rightColY, { align: 'right' });

      yPos = Math.max(yPos, rightColY) + 40;

      doc.setTextColor(...hexToRgb(style.textColor));

      const tableData = invoiceData.lineItems.map(item => [
        item.description,
        item.quantity,
        `$${item.rate.toFixed(2)}`,
        `$${(item.quantity * item.rate).toFixed(2)}`
      ]);

      (doc as any).autoTable({
        startY: yPos,
        head: [['Description', 'Quantity', 'Rate', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
            fillColor: hexToRgb(style.primaryColor), 
            textColor: hexToRgb(style.headerTextColor),
            font: style.font,
            fontStyle: 'bold'
        },
        bodyStyles: {
             textColor: hexToRgb(style.textColor),
             font: style.font
        },
        alternateRowStyles: {
            fillColor: hexToRgb(style.alternateRowColor)
        },
        styles: { fontSize: 10, cellPadding: 8, lineColor: hexToRgb(style.borderColor), lineWidth: 0.1 },
        margin: { left: margin, right: margin }
      });

      let finalY = (doc as any).autoTable.previous.finalY;
      yPos = finalY + 30;

      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
      const subtotal = invoiceData.lineItems.reduce((acc, item) => acc + item.quantity * item.rate, 0);
      const discount = invoiceData.discount || 0;
      const shipping = invoiceData.shipping || 0;
      const amountAfterDiscount = subtotal - discount;
      const taxAmount = amountAfterDiscount * ((invoiceData.taxRate || 0) / 100);
      const total = amountAfterDiscount + taxAmount + shipping;

      const addTotalLine = (label: string, value: string, isBold: boolean = false) => {
        const totalsX = pageWidth - margin - 200;
        doc.setFont(style.font, isBold ? 'bold' : 'normal');
        doc.text(label, totalsX, yPos);
        doc.setFont(style.font, isBold ? 'bold' : 'normal');
        doc.text(value, pageWidth - margin, yPos, { align: 'right' });
        yPos += 20;
      };

      doc.setFontSize(10);
      addTotalLine('Subtotal:', currencyFormatter.format(subtotal));
      if (discount > 0) addTotalLine('Discount:', `- ${currencyFormatter.format(discount)}`);
      if(invoiceData.taxRate > 0) addTotalLine(`Tax (${invoiceData.taxRate}%):`, currencyFormatter.format(taxAmount));
      if (shipping > 0) addTotalLine('Shipping:', currencyFormatter.format(shipping));
      
      yPos += 5;
      doc.setDrawColor(...hexToRgb(style.borderColor));
      doc.setLineWidth(1.5);
      doc.line(pageWidth - margin - 210, yPos - 10, pageWidth - margin, yPos - 10);
      
      doc.setFontSize(12);
      doc.setTextColor(...hexToRgb(style.primaryColor));
      addTotalLine('Total:', currencyFormatter.format(total), true);
      doc.setTextColor(...hexToRgb(style.textColor)); 
      finalY = yPos;

      if (invoiceData.notes) {
        yPos = (doc as any).autoTable.previous.finalY + 30;
        doc.setFontSize(10);
        doc.setFont(style.font, 'bold');
        doc.text('Notes:', margin, yPos);
        yPos += 15;
        doc.setFont(style.font, 'normal');
        const noteLines = doc.splitTextToSize(invoiceData.notes, pageWidth / 2.2);
        doc.text(noteLines, margin, yPos);
        finalY = Math.max(finalY, yPos + noteLines.length * 12);
      }

      // Signature
      if (invoiceData.signatureUrl) {
        yPos = finalY + 30;
        const sigImg = await loadImage(invoiceData.signatureUrl);
        if (sigImg) {
             // Check page space
             if (yPos + 60 > pageHeight - margin) {
                 doc.addPage();
                 yPos = margin;
             }
             doc.addImage(sigImg.data, sigImg.format, margin, yPos, 120, 40);
             doc.setFontSize(10);
             doc.text("Authorized Signature", margin, yPos + 55);
             finalY = yPos + 70;
        }
      }

      if (invoiceData.paypalLink) {
        const buttonWidth = 140;
        const buttonHeight = 35;
        const buttonX = pageWidth / 2 - buttonWidth / 2;
        let buttonY = Math.max(finalY, pageHeight - margin - buttonHeight - 20);
        if (buttonY > pageHeight - margin - buttonHeight) {
           buttonY = pageHeight - margin - buttonHeight;
        }

        doc.link(buttonX, buttonY, buttonWidth, buttonHeight, { url: invoiceData.paypalLink });
        doc.setFillColor(255, 196, 58); 
        doc.roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 5, 5, 'F');
        const logoWidth = 90;
        const logoHeight = 22.5;
        const logoX = buttonX + (buttonWidth - logoWidth) / 2;
        const logoY = buttonY + (buttonHeight - logoHeight) / 2;
        doc.addImage(PAYPAL_LOGO_BASE64, 'PNG', logoX, logoY, logoWidth, logoHeight);
      }

      doc.save(`Invoice-${invoiceData.invoiceNumber}-${clientName}.pdf`);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

export const generateDailyJobReportPDF = async (profile: UserProfile, data: DailyJobReportData, templateId: string) => {
   return new Promise<void>(async (resolve, reject) => {
    try {
      const { jsPDF } = jspdf;
      const doc = new jsPDF('p', 'pt', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const style = getTemplate(templateId, data.themeColors);

      const companyName = data.companyName || profile.companyName;

      if (style.headerColor !== '#ffffff') {
        doc.setFillColor(...hexToRgb(style.headerColor));
        doc.rect(0, 0, pageWidth, 100, 'F');
      }

      const logoUrl = data.logoUrl || profile.logoUrl;
      if (logoUrl) {
          const imgData = await loadImage(logoUrl);
          if (imgData) {
            const aspectRatio = imgData.width / imgData.height;
            const imgWidth = Math.min(60, 80);
            const imgHeight = imgWidth / aspectRatio;
            doc.addImage(imgData.data, imgData.format, margin, margin - 10, imgWidth, imgHeight);
          }
      }
      
      doc.setFontSize(24);
      doc.setFont(style.headerFont, 'bold');
      doc.setTextColor(...hexToRgb(style.headerTextColor));
      doc.text('Daily Job Report', pageWidth - margin, margin + 30, { align: 'right'});

      const addFooter = () => {
          if (style.showFooterLine) {
            const pageCount = (doc as any).internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setFont(style.font, 'normal');
            doc.setTextColor(...hexToRgb(style.secondaryColor));
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.text(`Page ${i} of ${pageCount}`, margin, pageHeight - margin / 2);
                doc.text(`${companyName} | Daily Job Report`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
                doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - margin / 2, { align: 'right' });
            }
          }
      };
      
      const contentElement = document.getElementById('pdf-render-content');
      if (!contentElement) {
          return reject(new Error('PDF render element not found'));
      }
      
      doc.setFontSize(12);
      if (style.headerColor !== '#ffffff') doc.setTextColor(...hexToRgb(style.headerTextColor));
      else doc.setTextColor(...hexToRgb(style.textColor));
      
      doc.text(`Project: ${data.projectName}`, margin, margin + 80);
      doc.text(`Date: ${data.date}`, margin, margin + 95);
      
      doc.setTextColor(...hexToRgb(style.textColor));

      contentElement.innerHTML = `<div style="font-family: ${style.font === 'times' ? 'serif' : style.font === 'courier' ? 'monospace' : 'sans-serif'}; font-size: 10pt; color: ${style.textColor};">${data.content}</div>`;
      
      await (doc as any).html(contentElement, {
        x: margin,
        y: margin + 120,
        width: pageWidth - (margin * 2),
        windowWidth: 600,
        autoPaging: 'text',
        callback: async (doc: any) => {
           if (data.signatureUrl) {
             const pageCount = doc.internal.getNumberOfPages();
             doc.setPage(pageCount);
             const pageHeight = doc.internal.pageSize.getHeight();
             
             const sigImg = await loadImage(data.signatureUrl);
             if (sigImg) {
                 const sigY = pageHeight - margin - 60; 
                 doc.addImage(sigImg.data, sigImg.format, margin, sigY, 120, 40);
                 doc.setFontSize(10);
                 doc.text("Signed", margin, sigY + 50);
             }
           }

          addFooter();
          doc.save(`${data.reportNumber}.pdf`);
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
   });
};

export const generateNotePDF = async (profile: UserProfile, job: Job, data: NoteData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    if (style.headerColor !== '#ffffff') {
        doc.setFillColor(...hexToRgb(style.headerColor));
        doc.rect(0, 0, pageWidth, 60, 'F');
    }

    doc.setFontSize(22);
    doc.setFont(style.headerFont, 'bold');
    doc.setTextColor(...hexToRgb(style.headerTextColor));
    doc.text(data.title, 20, 40);
    
    doc.setFontSize(12);
    doc.setTextColor(...hexToRgb(style.textColor));
    
    const contentElement = document.getElementById('pdf-render-content');
    if (contentElement) {
        contentElement.innerHTML = `<div style="color: ${style.textColor}; font-family: ${style.font === 'times' ? 'serif' : style.font === 'courier' ? 'monospace' : 'sans-serif'}">${data.content}</div>`;
        await (doc as any).html(contentElement, {
            x: 20,
            y: 70,
            callback: function (doc: any) {
                doc.save(`Note-${data.title}.pdf`);
            }
        });
    }
};

export const generateWorkOrderPDF = async (profile: UserProfile, job: Job, data: WorkOrderData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let yPos = await addHeader(doc, profile, 'WORK ORDER', 'Date', data.date, style);

    doc.setFontSize(14); doc.setFont(style.headerFont, 'bold'); doc.setTextColor(...hexToRgb(style.primaryColor));
    doc.text(`Project: ${job.name}`, margin, yPos);
    yPos += 20;
    doc.setFontSize(12); doc.setFont(style.font, 'normal'); doc.setTextColor(...hexToRgb(style.textColor));
    doc.text(`Client: ${job.clientName}`, margin, yPos);
    yPos += 30;

    doc.setFont(style.font, 'bold'); doc.text('Description:', margin, yPos); yPos += 20;
    doc.setFont(style.font, 'normal');
    const descLines = doc.splitTextToSize(data.description, doc.internal.pageSize.getWidth() - 2 * margin);
    doc.text(descLines, margin, yPos);
    yPos += descLines.length * 15 + 20;

    doc.setFont(style.font, 'bold'); doc.text('Materials Used:', margin, yPos); yPos += 20;
    doc.setFont(style.font, 'normal');
    const matLines = doc.splitTextToSize(data.materialsUsed, doc.internal.pageSize.getWidth() - 2 * margin);
    doc.text(matLines, margin, yPos);
    yPos += matLines.length * 15 + 30;
    
    doc.setFillColor(...hexToRgb(style.alternateRowColor));
    doc.rect(margin - 5, yPos - 15, doc.internal.pageSize.getWidth() - 2*margin + 10, 40, 'F');

    doc.setFont(style.font, 'bold');
    doc.setTextColor(...hexToRgb(style.primaryColor));
    doc.text(`Hours: ${data.hours}`, margin, yPos);
    doc.text(`Total Cost: $${Number(data.cost).toFixed(2)}`, doc.internal.pageSize.getWidth() - margin, yPos, { align: 'right' });

    yPos += 60;

    if (data.signatureUrl) {
        const sigImg = await loadImage(data.signatureUrl);
        if (sigImg) {
            doc.addImage(sigImg.data, sigImg.format, margin, yPos, 120, 40);
            doc.setFontSize(10);
            doc.setTextColor(...hexToRgb(style.textColor));
            doc.text("Authorized Signature", margin, yPos + 50);
        }
    }

    doc.save(`WorkOrder-${data.title}.pdf`);
};

export const generateTimeSheetPDF = async (profile: UserProfile, job: Job, data: TimeSheetData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let yPos = await addHeader(doc, profile, 'TIME SHEET', 'Date', data.date, style);

    doc.setFontSize(12);
    doc.text(`Worker Name: ${data.workerName}`, margin, yPos); yPos += 20;
    doc.text(`Project: ${job.name}`, margin, yPos); yPos += 30;
    
    (doc as any).autoTable({
        startY: yPos,
        head: [['Date', 'Hours Worked', 'Overtime', 'Notes']],
        body: [[data.date, data.hoursWorked, data.overtimeHours, data.notes]],
        theme: 'striped',
        headStyles: { fillColor: hexToRgb(style.primaryColor), textColor: hexToRgb(style.headerTextColor), font: style.headerFont },
        bodyStyles: { font: style.font, textColor: hexToRgb(style.textColor) },
        alternateRowStyles: { fillColor: hexToRgb(style.alternateRowColor) },
        styles: { lineColor: hexToRgb(style.borderColor), lineWidth: 0.1 }
    });
    doc.save(`TimeSheet-${data.workerName}-${data.date}.pdf`);
};

export const generateMaterialLogPDF = async (profile: UserProfile, job: Job, data: MaterialLogData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let yPos = await addHeader(doc, profile, 'MATERIAL LOG', 'Date', data.date, style);

    doc.setFontSize(12);
    doc.text(`Project: ${job.name}`, margin, yPos); yPos += 30;

    const tableData = data.items.map(item => [item.name, item.supplier, item.quantity, `$${Number(item.unitCost).toFixed(2)}`, `$${(item.quantity * item.unitCost).toFixed(2)}`]);
    
    (doc as any).autoTable({
        startY: yPos,
        head: [['Item', 'Supplier', 'Qty', 'Unit Cost', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: hexToRgb(style.primaryColor), textColor: hexToRgb(style.headerTextColor), font: style.headerFont },
        bodyStyles: { font: style.font, textColor: hexToRgb(style.textColor) },
        alternateRowStyles: { fillColor: hexToRgb(style.alternateRowColor) },
        styles: { lineColor: hexToRgb(style.borderColor), lineWidth: 0.1 }
    });

    const totalCost = data.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
    const finalY = (doc as any).autoTable.previous.finalY + 20;
    doc.setFont(style.font, 'bold');
    doc.setTextColor(...hexToRgb(style.primaryColor));
    doc.text(`Total Cost: $${totalCost.toFixed(2)}`, doc.internal.pageSize.getWidth() - margin, finalY, { align: 'right' });

    doc.save(`MaterialLog-${data.date}.pdf`);
};

export const generateEstimatePDF = async (profile: UserProfile, job: Job, data: EstimateData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let yPos = await addHeader(doc, profile, 'ESTIMATE', 'Date', data.issueDate, style);
    
    doc.setFontSize(10);
    doc.text(`Estimate #: ${data.estimateNumber}`, doc.internal.pageSize.getWidth() - margin, margin + 60, { align: 'right' });
    doc.text(`Expiry Date: ${data.expiryDate}`, doc.internal.pageSize.getWidth() - margin, margin + 75, { align: 'right' });

    doc.setFontSize(12);
    doc.text(`For: ${job.clientName}`, margin, yPos); yPos += 30;

    const tableData = data.lineItems.map(item => [item.description, item.quantity, `$${Number(item.rate).toFixed(2)}`, `$${(item.quantity * item.rate).toFixed(2)}`]);

    (doc as any).autoTable({
        startY: yPos,
        head: [['Description', 'Quantity', 'Rate', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: hexToRgb(style.secondaryColor), textColor: hexToRgb(style.headerTextColor), font: style.headerFont },
        bodyStyles: { font: style.font, textColor: hexToRgb(style.textColor) },
        alternateRowStyles: { fillColor: hexToRgb(style.alternateRowColor) },
        styles: { lineColor: hexToRgb(style.borderColor), lineWidth: 0.1 }
    });
    
    const total = data.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
    let finalY = (doc as any).autoTable.previous.finalY + 20;
    
    doc.setFont(style.font, 'bold');
    doc.setTextColor(...hexToRgb(style.primaryColor));
    doc.text(`Total Estimate: $${total.toFixed(2)}`, doc.internal.pageSize.getWidth() - margin, finalY, { align: 'right' });
    
    finalY += 40;
    if(data.terms) {
        doc.setTextColor(...hexToRgb(style.textColor));
        doc.setFont(style.font, 'bold'); doc.text('Terms & Conditions:', margin, finalY); finalY += 15;
        doc.setFont(style.font, 'normal'); doc.setFontSize(10);
        doc.text(doc.splitTextToSize(data.terms, doc.internal.pageSize.getWidth() - 2*margin), margin, finalY);
        finalY += 20 + (doc.splitTextToSize(data.terms, doc.internal.pageSize.getWidth() - 2*margin).length * 10);
    }

    if (data.signatureUrl) {
        const sigImg = await loadImage(data.signatureUrl);
        if (sigImg) {
            if (finalY + 60 > doc.internal.pageSize.getHeight() - margin) {
                 doc.addPage();
                 finalY = margin;
            }
            doc.addImage(sigImg.data, sigImg.format, margin, finalY, 120, 40);
            doc.setFontSize(10);
            doc.setTextColor(...hexToRgb(style.textColor));
            doc.text("Accepted By", margin, finalY + 50);
        }
    }

    doc.save(`Estimate-${data.estimateNumber}.pdf`);
};

export const generateExpenseLogPDF = async (profile: UserProfile, job: Job, data: ExpenseLogData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let yPos = await addHeader(doc, profile, 'EXPENSE LOG', 'Date', data.date, style);

    doc.setFontSize(12);
    doc.text(`Project: ${job.name}`, margin, yPos); yPos += 20;
    doc.text(`Category: ${data.category}`, margin, yPos); yPos += 30;

    (doc as any).autoTable({
        startY: yPos,
        head: [['Item', 'Vendor', 'Amount']],
        body: [[data.item, data.vendor, `$${Number(data.amount).toFixed(2)}`]],
        theme: 'grid',
        headStyles: { fillColor: hexToRgb(style.primaryColor), textColor: hexToRgb(style.headerTextColor), font: style.headerFont },
        bodyStyles: { font: style.font, textColor: hexToRgb(style.textColor), fontSize: 12 },
        alternateRowStyles: { fillColor: hexToRgb(style.alternateRowColor) },
        styles: { lineColor: hexToRgb(style.borderColor), lineWidth: 0.1 }
    });

    doc.save(`Expense-${data.date}.pdf`);
};

export const generateWarrantyPDF = async (profile: UserProfile, job: Job, data: WarrantyData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let yPos = await addHeader(doc, profile, 'CERTIFICATE OF WARRANTY', 'Date', data.completedDate, style);

    doc.setDrawColor(...hexToRgb(style.primaryColor));
    doc.setLineWidth(2);
    doc.rect(20, 20, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 40);
    
    if (style.id === 'elegant') {
        doc.setLineWidth(0.5);
        doc.rect(25, 25, doc.internal.pageSize.getWidth() - 50, doc.internal.pageSize.getHeight() - 50);
    }

    doc.setFontSize(12);
    doc.text(`Project: ${job.name}`, margin, yPos); yPos += 20;
    doc.text(`Client: ${job.clientName}`, margin, yPos); yPos += 40;
    
    doc.setFont(style.font, 'bold');
    doc.text(`Warranty Duration: ${data.duration}`, margin, yPos); yPos += 30;
    
    doc.text('Coverage:', margin, yPos); yPos += 15;
    doc.setFont(style.font, 'normal');
    doc.text(doc.splitTextToSize(data.coverage, doc.internal.pageSize.getWidth() - 2*margin), margin, yPos);
    yPos += 60; 
    
    doc.setFont(style.font, 'bold');
    doc.text('Conditions:', margin, yPos); yPos += 15;
    doc.setFont(style.font, 'normal');
    doc.text(doc.splitTextToSize(data.conditions, doc.internal.pageSize.getWidth() - 2*margin), margin, yPos);

    yPos += 60;
    if (data.signatureUrl) {
        const sigImg = await loadImage(data.signatureUrl);
        if (sigImg) {
            doc.addImage(sigImg.data, sigImg.format, margin, yPos, 120, 40);
            doc.setFontSize(10);
            doc.text("Authorized Signature", margin, yPos + 50);
        }
    }

    doc.save(`Warranty-${job.name}.pdf`);
};

export const generateReceiptPDF = async (profile: UserProfile, job: Job, data: ReceiptData, templateId: string) => {
    const style = getTemplate(templateId, data.themeColors);
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'pt', 'a5'); 
    const margin = 30;
    let yPos = await addHeader(doc, profile, 'RECEIPT', 'Date', data.date, style);

    doc.setFontSize(12);
    doc.text(`Received From: ${data.from}`, margin, yPos); yPos += 20;
    doc.text(`Payment Method: ${data.paymentMethod}`, margin, yPos); yPos += 40;
    
    doc.setFillColor(...hexToRgb(style.alternateRowColor));
    doc.rect(margin, yPos, doc.internal.pageSize.getWidth() - 2*margin, 40, 'F');
    
    doc.setFontSize(16); doc.setFont(style.headerFont, 'bold');
    doc.setTextColor(...hexToRgb(style.primaryColor));
    doc.text(`Amount: $${Number(data.amount).toFixed(2)}`, margin + 10, yPos + 25);
    
    doc.setTextColor(...hexToRgb(style.textColor));
    yPos += 60;
    doc.setFontSize(12); doc.setFont(style.font, 'normal');
    doc.text('For:', margin, yPos); yPos += 15;
    doc.text(data.description, margin, yPos);

    doc.save(`Receipt-${data.date}.pdf`);
};
